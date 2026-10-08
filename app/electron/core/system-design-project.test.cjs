const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  FILE_STATUS,
  MAX_GUIDE_FILE_BYTES,
  MAX_PROJECT_GUIDES,
  PROJECT_ORIGINS,
  applyProjectChange,
  detectGuideFolders,
  normalizeProjectSettings,
  normalizeProjectSettingsStore,
  parseProjectGuideFile,
  resolveEffectiveGuides,
  resolveProjectLayer,
  settingsForRoot,
} = require('./system-design-project.cjs')
const { DEFAULT_REPO_URL, sourceKey } = require('./system-design-source.cjs')

const DOKTOR = 'https://github.com/acme/Doktor-SystemDesign'
const FELIXO = 'https://github.com/Felipe-Alcantara/Felixo-System-Design'

const fileWith = (guias) => JSON.stringify({ guias })
const readFile = (text) => ({ present: true, parsed: parseProjectGuideFile(text) })
const noSettings = () => normalizeProjectSettings(null)
const userGuides = [{ key: sourceKey({ repoUrl: DEFAULT_REPO_URL, branch: 'main' }), repoUrl: DEFAULT_REPO_URL, branch: 'main', origin: 'default' }]

describe('parseProjectGuideFile', () => {
  it('lê guias com url e branch; branch ausente vale main', () => {
    const parsed = parseProjectGuideFile(fileWith([{ url: DOKTOR, branch: 'develop' }, { url: FELIXO }]))

    assert.deepEqual(parsed.guides, [
      { repoUrl: DOKTOR, branch: 'develop' },
      { repoUrl: FELIXO, branch: 'main' },
    ])
    assert.deepEqual(parsed.problems, [])
    assert.match(parsed.hash, /^[0-9a-f]{64}$/)
  })

  it('URL inválida ou maliciosa vira problema e fica de fora; as outras seguem', () => {
    const parsed = parseProjectGuideFile(fileWith([
      { url: 'file:///etc/passwd' },
      { url: '--upload-pack=touch /tmp/x' },
      { url: 'javascript:alert(1)' },
      { url: DOKTOR, branch: '--exec=x' },
      { url: DOKTOR },
      'texto solto',
    ]))

    assert.deepEqual(parsed.guides, [{ repoUrl: DOKTOR, branch: 'main' }])
    assert.equal(parsed.problems.length, 5)
    assert.match(parsed.problems[0], /^Guia 1:/)
  })

  it('credencial na URL é descartada e avisada', () => {
    const parsed = parseProjectGuideFile(fileWith([{ url: 'https://usuario:SEGREDO123@github.com/acme/repo.git' }]))

    assert.equal(JSON.stringify(parsed.guides).includes('SEGREDO123'), false)
    assert.match(parsed.problems.join(' '), /credencial/)
  })

  it('JSON quebrado, sem lista ou grande demais não vale nada', () => {
    assert.equal(parseProjectGuideFile('{ isto não é json').hash, null)
    assert.equal(parseProjectGuideFile('{"outra":"coisa"}').hash, null)
    assert.equal(parseProjectGuideFile('[1,2]').hash, null)
    const big = parseProjectGuideFile(fileWith([{ url: DOKTOR, nota: 'x'.repeat(MAX_GUIDE_FILE_BYTES) }]))
    assert.equal(big.hash, null)
    assert.match(big.problems[0], /KB/)
  })

  it(`só os ${MAX_PROJECT_GUIDES} primeiros guias valem; repetidos contam uma vez`, () => {
    const list = Array.from({ length: MAX_PROJECT_GUIDES + 2 }, (_, index) => ({ url: `https://github.com/acme/g${index}` }))
    const parsed = parseProjectGuideFile(fileWith([{ url: DOKTOR }, { url: `${DOKTOR}.git` }, ...list]))

    assert.equal(parsed.guides.length, MAX_PROJECT_GUIDES)
    assert.match(parsed.problems.at(-1), /primeiros/)
  })

  it('o hash ignora formatação e ordem, mas não a fonte', () => {
    const a = parseProjectGuideFile(fileWith([{ url: DOKTOR }, { url: FELIXO }]))
    const b = parseProjectGuideFile(`{\n  "guias": [ { "url": "${FELIXO}.git" }, { "url": "${DOKTOR}/" } ]\n}`)
    const c = parseProjectGuideFile(fileWith([{ url: DOKTOR, branch: 'develop' }, { url: FELIXO }]))

    assert.equal(a.hash, b.hash)
    assert.notEqual(a.hash, c.hash)
  })
})

describe('detectGuideFolders', () => {
  it('reconhece "Padrão de qualidade - <nome>", com ou sem acento, e ignora o resto', () => {
    const folders = detectGuideFolders([
      { name: 'Padrão de qualidade - Felixo System Design', isDirectory: true },
      { name: 'Padrão de qualidade - Doktor', isDirectory: true },
      { name: 'padrao de qualidade - Cliente X', isDirectory: true },
      { name: 'Padrão de qualidade - arquivo.md', isDirectory: false },
      { name: 'docs', isDirectory: true },
      { name: 'Padrão de qualidade - ', isDirectory: true },
    ])

    assert.deepEqual(folders.map((folder) => folder.label).sort(), ['Cliente X', 'Doktor', 'Felixo System Design'])
  })
})

describe('resolveProjectLayer — confirmação do arquivo', () => {
  const text = fileWith([{ url: DOKTOR }])

  it('arquivo novo aparece como pendente e não vale', () => {
    const layer = resolveProjectLayer({ settings: noSettings(), file: readFile(text) })

    assert.equal(layer.file.status, FILE_STATUS.PENDING)
    assert.deepEqual(layer.guides, [])
    assert.equal(layer.file.guides[0].repoUrl, DOKTOR)
  })

  it('confirmado com o hash do conteúdo atual: passa a valer, com a origem dita', () => {
    const file = readFile(text)
    const confirmed = applyProjectChange(noSettings(), { confirmFile: file.parsed.hash }, { currentFileHash: file.parsed.hash })
    const layer = resolveProjectLayer({ settings: confirmed.settings, file })

    assert.equal(layer.file.status, FILE_STATUS.CONFIRMED)
    assert.equal(layer.guides.length, 1)
    assert.equal(layer.guides[0].origin, PROJECT_ORIGINS.FILE)
  })

  it('confirmar um hash que não é o do arquivo atual é recusado', () => {
    const file = readFile(text)
    const result = applyProjectChange(noSettings(), { confirmFile: 'f'.repeat(64) }, { currentFileHash: file.parsed.hash })

    assert.equal(result.ok, false)
    assert.match(result.message, /mudou/)
  })

  it('o arquivo mudou depois da confirmação: volta a pedir e deixa de valer', () => {
    const file = readFile(text)
    const confirmed = applyProjectChange(noSettings(), { confirmFile: file.parsed.hash }, { currentFileHash: file.parsed.hash }).settings
    const changed = resolveProjectLayer({ settings: confirmed, file: readFile(fileWith([{ url: 'https://github.com/atacante/guia' }])) })

    assert.equal(changed.file.status, FILE_STATUS.CHANGED)
    assert.deepEqual(changed.guides, [])
  })

  it('ignorar o arquivo para de perguntar; reativar exige confirmar de novo', () => {
    const file = readFile(text)
    const ignored = applyProjectChange(noSettings(), { ignoreFile: true }).settings
    assert.equal(resolveProjectLayer({ settings: ignored, file }).file.status, FILE_STATUS.IGNORED)

    const reactivated = applyProjectChange(ignored, { useRepoFile: true }).settings
    assert.equal(resolveProjectLayer({ settings: reactivated, file }).file.status, FILE_STATUS.PENDING)
  })

  it('arquivo sem guia válido aparece como inválido, com os problemas', () => {
    const layer = resolveProjectLayer({ settings: noSettings(), file: readFile('{ quebrado') })

    assert.equal(layer.file.status, FILE_STATUS.INVALID)
    assert.ok(layer.file.problems.length > 0)
  })
})

describe('resolveProjectLayer — os três mecanismos somam', () => {
  const folder = { name: 'Padrão de qualidade - Doktor', label: 'Doktor', path: '/repo/Padrão de qualidade - Doktor' }

  it('pasta de guias vale por padrão e pode ser desligada', () => {
    assert.equal(resolveProjectLayer({ settings: noSettings(), file: null, folders: [folder] }).guides[0].origin, PROJECT_ORIGINS.FOLDER)

    const off = applyProjectChange(noSettings(), { useGuideFolders: false }).settings
    assert.deepEqual(resolveProjectLayer({ settings: off, file: null, folders: [folder] }).guides, [])
  })

  it('arquivo confirmado, pasta e escolha no app entram juntos, sem repetir a mesma fonte', () => {
    const file = readFile(fileWith([{ url: DOKTOR }]))
    let settings = applyProjectChange(noSettings(), { confirmFile: file.parsed.hash }, { currentFileHash: file.parsed.hash }).settings
    settings = applyProjectChange(settings, { guides: [{ repoUrl: `${DOKTOR}.git`, branch: 'main' }, { repoUrl: FELIXO, branch: 'main' }] }).settings
    const layer = resolveProjectLayer({ settings, file, folders: [folder] })

    assert.deepEqual(layer.guides.map((guide) => guide.origin), [PROJECT_ORIGINS.FILE, PROJECT_ORIGINS.FOLDER, PROJECT_ORIGINS.APP])
    assert.equal(layer.guides[2].label, 'Felixo System Design')
  })

  it('escolha no app com URL inválida é recusada sem gravar', () => {
    const result = applyProjectChange(noSettings(), { guides: [{ repoUrl: 'file:///x', branch: 'main' }] })

    assert.equal(result.ok, false)
  })
})

describe('resolveEffectiveGuides — precedência', () => {
  it('projeto sem guias (ou ausente) usa os guias do usuário', () => {
    assert.equal(resolveEffectiveGuides({ userGuides, userSourceMode: 'default', projectLayer: null }).layer, 'padrao')
    const emptyProject = resolveProjectLayer({ settings: noSettings(), file: null })
    const effective = resolveEffectiveGuides({ userGuides, userSourceMode: 'custom', projectLayer: emptyProject })

    assert.equal(effective.layer, 'usuario')
    assert.deepEqual(effective.replaced, [])
  })

  it('a lista do projeto substitui a do usuário e diz o que substituiu', () => {
    const file = readFile(fileWith([{ url: DOKTOR }]))
    const settings = applyProjectChange(noSettings(), { confirmFile: file.parsed.hash }, { currentFileHash: file.parsed.hash }).settings
    const effective = resolveEffectiveGuides({
      userGuides,
      userSourceMode: 'default',
      projectLayer: resolveProjectLayer({ settings, file }),
    })

    assert.equal(effective.layer, 'projeto')
    assert.equal(effective.guides[0].repoUrl, DOKTOR)
    assert.deepEqual(effective.replaced, userGuides)
  })

  it('trocar de projeto troca a camada: cada raiz tem as próprias escolhas', () => {
    const store = normalizeProjectSettingsStore({
      projects: { '/repos/a': { guides: [{ repoUrl: DOKTOR, branch: 'main' }] } },
    })
    const a = resolveProjectLayer({ settings: settingsForRoot(store, '/repos/a'), file: null })
    const b = resolveProjectLayer({ settings: settingsForRoot(store, '/repos/b'), file: null })

    assert.equal(resolveEffectiveGuides({ userGuides, userSourceMode: 'default', projectLayer: a }).layer, 'projeto')
    assert.equal(resolveEffectiveGuides({ userGuides, userSourceMode: 'default', projectLayer: b }).layer, 'padrao')
  })
})

describe('normalizeProjectSettings', () => {
  it('lixo vira o padrão: arquivo e pasta ligados, sem confirmação nem guias', () => {
    for (const raw of [null, 'x', 42, [], { confirmedFileHash: 'curto', guides: 'x' }]) {
      assert.deepEqual(normalizeProjectSettings(raw), {
        useRepoFile: true,
        confirmedFileHash: null,
        useGuideFolders: true,
        guides: [],
      })
    }
  })

  it('a alteração não escreve campos fora da lista branca nem altera a entrada', () => {
    const original = noSettings()
    const snapshot = JSON.stringify(original)
    const result = applyProjectChange(original, { confirmedFileHash: 'a'.repeat(64), outro: 1, useGuideFolders: false })

    assert.equal(JSON.stringify(original), snapshot)
    assert.equal(result.settings.confirmedFileHash, null)
    assert.equal('outro' in result.settings, false)
  })
})

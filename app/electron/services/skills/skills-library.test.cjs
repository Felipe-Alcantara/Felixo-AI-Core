'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

const { BUILTIN_SKILLS, listAvailableSkills } = require('./skills-catalog.cjs')
const { installBuiltinSkills } = require('./skills-library.cjs')

/** Sistema de arquivos em memória, com o mínimo que o instalador usa. */
function criarFsFalso(arquivos = {}) {
  const conteudos = new Map(Object.entries(arquivos))
  const pastas = new Set()
  return {
    conteudos,
    existsSync: (alvo) => conteudos.has(alvo) || pastas.has(alvo),
    readFileSync: (alvo) => {
      if (!conteudos.has(alvo)) {
        throw new Error(`ENOENT: ${alvo}`)
      }
      return conteudos.get(alvo)
    },
    writeFileSync: (alvo, conteudo) => conteudos.set(alvo, conteudo),
    mkdirSync: (alvo) => pastas.add(alvo),
  }
}

const SLUG = BUILTIN_SKILLS[0].slug
const BUNDLED = '/app/resources/skills'
const TARGET = '/user/skills'
const origem = path.join(BUNDLED, SLUG, 'SKILL.md')
const destino = path.join(TARGET, SLUG, 'SKILL.md')
const marcador = path.join(TARGET, SLUG, '.origem')

test('instala a skill que ainda nao existe no destino', () => {
  const fileSystem = criarFsFalso({ [origem]: 'conteudo v1' })

  const resultado = installBuiltinSkills({
    bundledDir: BUNDLED,
    targetDir: TARGET,
    fileSystem,
  })

  assert.ok(resultado.instaladas.includes(SLUG))
  assert.equal(fileSystem.conteudos.get(destino), 'conteudo v1')
  assert.equal(fileSystem.conteudos.get(marcador), 'conteudo v1')
})

test('nao reescreve quando o conteudo ja esta igual', () => {
  const fileSystem = criarFsFalso({
    [origem]: 'conteudo v1',
    [destino]: 'conteudo v1',
    [marcador]: 'conteudo v1',
  })

  const resultado = installBuiltinSkills({
    bundledDir: BUNDLED,
    targetDir: TARGET,
    fileSystem,
  })

  assert.deepEqual(resultado.instaladas, [])
  assert.deepEqual(resultado.atualizadas, [])
  assert.deepEqual(resultado.preservadas, [])
})

test('atualiza a skill que a pessoa nao editou', () => {
  const fileSystem = criarFsFalso({
    [origem]: 'conteudo v2',
    [destino]: 'conteudo v1',
    [marcador]: 'conteudo v1',
  })

  const resultado = installBuiltinSkills({
    bundledDir: BUNDLED,
    targetDir: TARGET,
    fileSystem,
  })

  assert.ok(resultado.atualizadas.includes(SLUG))
  assert.equal(fileSystem.conteudos.get(destino), 'conteudo v2')
})

test('PRESERVA a skill que a pessoa editou, mesmo havendo versao nova', () => {
  const fileSystem = criarFsFalso({
    [origem]: 'conteudo v2',
    [destino]: 'conteudo v1 COM MINHA EDICAO',
    [marcador]: 'conteudo v1',
  })

  const resultado = installBuiltinSkills({
    bundledDir: BUNDLED,
    targetDir: TARGET,
    fileSystem,
  })

  assert.ok(resultado.preservadas.includes(SLUG))
  assert.equal(fileSystem.conteudos.get(destino), 'conteudo v1 COM MINHA EDICAO')
})

test('sem marcador, trata como editado e preserva', () => {
  // Arquivo vindo de uma versao anterior a este mecanismo: perder edicao e
  // pior que ficar atrasado, entao a duvida resolve a favor de preservar.
  const fileSystem = criarFsFalso({
    [origem]: 'conteudo v2',
    [destino]: 'conteudo antigo',
  })

  const resultado = installBuiltinSkills({
    bundledDir: BUNDLED,
    targetDir: TARGET,
    fileSystem,
  })

  assert.ok(resultado.preservadas.includes(SLUG))
  assert.equal(fileSystem.conteudos.get(destino), 'conteudo antigo')
})

test('skill ausente no pacote e reportada, nao quebra a instalacao', () => {
  const fileSystem = criarFsFalso({})

  const resultado = installBuiltinSkills({
    bundledDir: BUNDLED,
    targetDir: TARGET,
    fileSystem,
  })

  assert.equal(resultado.ausentes.length, BUILTIN_SKILLS.length)
  assert.deepEqual(resultado.instaladas, [])
})

// ------------------------------------------------------------------ catalogo

const resolveBuiltinPath = (slug) => `/user/skills/${slug}/SKILL.md`

test('lista traz built-ins e terceiros por padrao', () => {
  const skills = listAvailableSkills({ resolveBuiltinPath })

  assert.equal(skills.filter((s) => s.source === 'builtin').length, BUILTIN_SKILLS.length)
  assert.ok(skills.some((s) => s.source === 'community'))
})

test('desligar terceiros remove so as de terceiros', () => {
  const skills = listAvailableSkills({ resolveBuiltinPath, communityEnabled: false })

  assert.ok(skills.every((s) => s.source !== 'community'))
  assert.ok(skills.some((s) => s.source === 'builtin'))
})

test('skill de terceiro aponta para a fonte original, nao para disco', () => {
  const skills = listAvailableSkills({ resolveBuiltinPath })
  const terceiro = skills.find((s) => s.source === 'community')

  assert.ok(terceiro.path.startsWith('https://'))
  assert.ok(terceiro.origin)
})

test('built-in escondida pela pessoa nao volta na lista', () => {
  const escondida = `builtin-${SLUG}`

  const skills = listAvailableSkills({
    resolveBuiltinPath,
    hiddenBuiltinIds: [escondida],
  })

  assert.ok(!skills.some((s) => s.id === escondida))
})

test('skill do usuario com o mesmo id sobrescreve a do catalogo', () => {
  const id = `builtin-${SLUG}`

  const skills = listAvailableSkills({
    resolveBuiltinPath,
    userSkills: [{ id, name: 'Minha versao', description: '', path: '/meu/SKILL.md' }],
  })

  const alvo = skills.find((s) => s.id === id)
  assert.equal(alvo.name, 'Minha versao')
  assert.equal(alvo.source, 'user')
})

test('skill do usuario sem caminho e descartada', () => {
  const skills = listAvailableSkills({
    resolveBuiltinPath,
    userSkills: [{ id: 'x', name: 'Sem caminho', path: '' }],
  })

  assert.ok(!skills.some((s) => s.id === 'x'))
})

test('todo built-in do catalogo tem nome e descricao', () => {
  for (const skill of BUILTIN_SKILLS) {
    assert.ok(skill.slug, 'slug ausente')
    assert.ok(skill.name.length > 3, `nome fraco em ${skill.slug}`)
    // A descricao e o que faz a skill disparar na hora certa: descricao curta
    // demais nao da ao agente como decidir se aquela skill serve.
    assert.ok(skill.description.length > 60, `descricao curta em ${skill.slug}`)
  }
})

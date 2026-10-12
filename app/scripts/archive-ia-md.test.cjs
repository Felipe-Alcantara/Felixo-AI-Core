'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  POINTER_HEADING,
  assertLossless,
  assertUnchanged,
  headingDate,
  parseArgs,
  planArchive,
  relinkLines,
  run,
  splitSections,
} = require('./archive-ia-md.cjs')

const DOCUMENTO = [
  '# IA.md',
  '',
  '## Objetivo',
  'Texto fixo, sem data.',
  '',
  '## [2026-08-10] Decisão antiga',
  'Corpo A',
  '```',
  '## isto está num bloco de código, não é cabeçalho',
  '```',
  '',
  '## 02/09/2026 — Entrada em formato brasileiro',
  'Corpo B',
  '',
  '## 2026-10-02 — Entrada nova',
  'Corpo C',
  '',
].join('\n')

function criarRepositorio(t, conteudo = DOCUMENTO) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-arquivo-ia-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  fs.writeFileSync(path.join(cwd, 'IA.md'), conteudo)
  return { cwd, arquivo: path.join(cwd, 'IA.md'), arquivo_morto: path.join(cwd, 'docs', 'ia-archive') }
}

function opcoes(cwd, extra = {}) {
  return { cwd, file: 'IA.md', keepFrom: '2026-10-01', archiveDir: 'docs/ia-archive', prefix: 'IA-ARCHIVE', today: '2026-10-12', ...extra }
}

function linhasSemPonteiro(texto) {
  const { preamble, sections } = splitSections(texto)
  return [...preamble, ...sections.filter((s) => s.heading.trim() !== POINTER_HEADING).flatMap((s) => s.lines)]
}

test('headingDate lê os três formatos do cabeçalho e ignora data inexistente', () => {
  assert.equal(headingDate('## [2026-09-02] x'), '2026-09-02')
  assert.equal(headingDate('## 2026-10-09 — y'), '2026-10-09')
  assert.equal(headingDate('## 03/09/2026 — z'), '2026-09-03')
  assert.equal(headingDate('## Revalidação — 03/09/2026 — d'), '2026-09-03')
  assert.equal(headingDate('## Objetivo'), null)
  assert.equal(headingDate('## Versão 1234-99-99'), null)
})

test('splitSections não trata ## dentro de bloco de código como seção e não perde linha', () => {
  const { preamble, sections } = splitSections(DOCUMENTO)

  assert.deepEqual(sections.map((s) => s.heading), [
    '## Objetivo',
    '## [2026-08-10] Decisão antiga',
    '## 02/09/2026 — Entrada em formato brasileiro',
    '## 2026-10-02 — Entrada nova',
  ])
  assert.equal([...preamble, ...sections.flatMap((s) => s.lines)].join('\n'), DOCUMENTO)
  assert.throws(() => splitSections('## a\n```\nsem fechar'), /bloco de código aberto/)
})

test('planArchive move só o datado antes do corte, por mês, e mantém o resto', () => {
  const plan = planArchive(DOCUMENTO, { keepFrom: '2026-10-01' })

  assert.deepEqual([...plan.moved.keys()], ['2026-08', '2026-09'])
  assert.deepEqual(plan.kept.map((s) => s.heading), ['## Objetivo', '## 2026-10-02 — Entrada nova'])
  assert.equal(planArchive(DOCUMENTO, { keepFrom: '2026-10-02' }).kept.length, 2, 'a data do corte fica no arquivo')
})

test('planArchive ordena os meses no tempo mesmo com o arquivo de origem fora de ordem', () => {
  const fora_de_ordem = '## [2026-09-05] depois\n\n## [2026-07-01] antes\n\n## [2026-08-15] meio\n'

  const plan = planArchive(fora_de_ordem, { keepFrom: '2026-10-01' })

  assert.deepEqual([...plan.moved.keys()], ['2026-07', '2026-08', '2026-09'])
})

test('sem --apply nada é escrito', (t) => {
  const { cwd, arquivo, arquivo_morto } = criarRepositorio(t)

  const mensagem = run(opcoes(cwd))

  assert.match(mensagem, /Dry-run/)
  assert.equal(fs.readFileSync(arquivo, 'utf8'), DOCUMENTO)
  assert.equal(fs.existsSync(arquivo_morto), false)
})

test('--apply move na íntegra, deixa ponteiro datado e as linhas do original continuam todas lá', (t) => {
  const { cwd, arquivo, arquivo_morto } = criarRepositorio(t)

  run(opcoes(cwd, { apply: true }))

  const origem = fs.readFileSync(arquivo, 'utf8')
  const agosto = fs.readFileSync(path.join(arquivo_morto, 'IA-ARCHIVE-2026-08.md'), 'utf8')
  const setembro = fs.readFileSync(path.join(arquivo_morto, 'IA-ARCHIVE-2026-09.md'), 'utf8')

  assert.match(origem, /## Registros arquivados/)
  assert.match(origem, /- \[2026-10-12\] Registros de 2026-08 \(1 seção\) movidos para \[docs\/ia-archive\/IA-ARCHIVE-2026-08\.md\]/)
  assert.match(origem, /## 2026-10-02 — Entrada nova/)
  assert.doesNotMatch(origem, /Decisão antiga/)
  assert.match(agosto, /^# Arquivo do IA\.md — 2026-08/)
  assert.match(agosto, /\]\(\.\.\/\.\.\/IA\.md\)/)
  assert.match(agosto, /## \[2026-08-10\] Decisão antiga\nCorpo A\n```\n## isto está num bloco de código, não é cabeçalho\n```\n/)
  assert.match(setembro, /## 02\/09\/2026 — Entrada em formato brasileiro\nCorpo B\n/)

  const depois = [
    ...linhasSemPonteiro(origem),
    ...splitSections(agosto).sections.flatMap((s) => s.lines),
    ...splitSections(setembro).sections.flatMap((s) => s.lines),
  ]
  assert.deepEqual([...depois].sort(), DOCUMENTO.split('\n').sort())
})

test('rodar de novo com o mesmo corte não muda nada', (t) => {
  const { cwd, arquivo, arquivo_morto } = criarRepositorio(t)
  run(opcoes(cwd, { apply: true }))
  const origem = fs.readFileSync(arquivo, 'utf8')
  const agosto = fs.readFileSync(path.join(arquivo_morto, 'IA-ARCHIVE-2026-08.md'), 'utf8')

  const mensagem = run(opcoes(cwd, { apply: true }))

  assert.match(mensagem, /Nada a arquivar/)
  assert.equal(fs.readFileSync(arquivo, 'utf8'), origem)
  assert.equal(fs.readFileSync(path.join(arquivo_morto, 'IA-ARCHIVE-2026-08.md'), 'utf8'), agosto)
})

test('um corte mais novo acrescenta ao ponteiro e ao arquivo existentes, sem refazer o antigo', (t) => {
  const { cwd, arquivo, arquivo_morto } = criarRepositorio(t)
  run(opcoes(cwd, { apply: true, keepFrom: '2026-09-01' }))
  const agosto = fs.readFileSync(path.join(arquivo_morto, 'IA-ARCHIVE-2026-08.md'), 'utf8')

  run(opcoes(cwd, { apply: true, keepFrom: '2026-10-01', today: '2026-11-01' }))

  const origem = fs.readFileSync(arquivo, 'utf8')
  assert.equal(origem.split(POINTER_HEADING).length - 1, 1, 'uma só seção de ponteiro')
  assert.match(origem, /- \[2026-10-12\] Registros de 2026-08/)
  assert.match(origem, /- \[2026-11-01\] Registros de 2026-09/)
  assert.equal(fs.readFileSync(path.join(arquivo_morto, 'IA-ARCHIVE-2026-08.md'), 'utf8'), agosto)
  assert.match(fs.readFileSync(path.join(arquivo_morto, 'IA-ARCHIVE-2026-09.md'), 'utf8'), /Corpo B/)
})

test('entrada com CRLF é lida e o resultado sai com LF, sem perder linha', (t) => {
  const { cwd, arquivo } = criarRepositorio(t, DOCUMENTO.replace(/\n/g, '\r\n'))

  run(opcoes(cwd, { apply: true }))

  const origem = fs.readFileSync(arquivo, 'utf8')
  assert.equal(origem.includes('\r'), false)
  assert.match(origem, /## 2026-10-02 — Entrada nova\nCorpo C\n/)
})

test('as saídas terminam com quebra de linha mesmo quando a seção movida não tinha linha em branco depois', (t) => {
  // O 2026-08 é a última do arquivo de agosto e termina colado no próximo cabeçalho; o
  // `fica` perde a seção que o separava do fim do arquivo e passa a ser a última do IA.md.
  const texto = '## [2026-08-01] sem linha em branco depois\núltima linha\n## 2026-10-05 — fica\ncorpo\n## [2026-08-02] velha, sem fim de linha\nfim'
  const { cwd, arquivo, arquivo_morto } = criarRepositorio(t, texto)

  run(opcoes(cwd, { apply: true }))

  const origem = fs.readFileSync(arquivo, 'utf8')
  const agosto = fs.readFileSync(path.join(arquivo_morto, 'IA-ARCHIVE-2026-08.md'), 'utf8')
  assert.ok(origem.endsWith('corpo\n'), 'o IA.md termina com quebra de linha')
  assert.ok(agosto.endsWith('fim\n'), 'o arquivo termina com quebra de linha')
  assert.match(agosto, /última linha\n## \[2026-08-02\] velha/)
})

test('relinkLines reaponta só links relativos de arquivo e deixa o resto como está', () => {
  const entrada = [
    'veja [a política](docs/projeto/POLITICA.md#isolamento) e [o guia](GUIA.md)',
    'externo [site](https://exemplo.org/x), âncora [aqui](#local), absoluto [raiz](/docs/x.md)',
    '```',
    'exemplo em código [x](docs/projeto/NAO-MEXE.md)',
    '```',
    'depois da cerca [y](docs/projeto/Y.md)',
  ]

  const saida = relinkLines(entrada, path.resolve('repo'), path.resolve('repo', 'docs', 'ia-archive'))

  assert.equal(saida[0], 'veja [a política](../projeto/POLITICA.md#isolamento) e [o guia](../../GUIA.md)')
  assert.equal(saida[1], entrada[1])
  assert.equal(saida[3], entrada[3], 'o que está em bloco de código não muda')
  assert.equal(saida[5], 'depois da cerca [y](../projeto/Y.md)')
})

test('seções movidas de docs/projeto mantêm os links apontando para o mesmo arquivo', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-arquivo-ia-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  fs.mkdirSync(path.join(cwd, 'docs', 'projeto'), { recursive: true })
  fs.writeFileSync(path.join(cwd, 'docs', 'projeto', 'POLITICA.md'), '# Política\n')
  fs.writeFileSync(path.join(cwd, 'docs', 'projeto', 'IA.md'), '## [2026-08-01] antiga\nver [a política](POLITICA.md) e [a raiz](../../README.md)\n\n## 2026-10-05 — nova\ncorpo\n')

  run(opcoes(cwd, { file: 'docs/projeto/IA.md', prefix: 'IA-PROJETO-ARCHIVE', apply: true }))

  const agosto = fs.readFileSync(path.join(cwd, 'docs', 'ia-archive', 'IA-PROJETO-ARCHIVE-2026-08.md'), 'utf8')
  assert.match(agosto, /\[a política\]\(\.\.\/projeto\/POLITICA\.md\) e \[a raiz\]\(\.\.\/\.\.\/README\.md\)/)
  assert.match(agosto, /\]\(\.\.\/projeto\/IA\.md\)/, 'o cabeçalho aponta para o arquivo de origem')
})

test('assertLossless reprova quando uma seção movida some do plano', () => {
  const plan = planArchive(DOCUMENTO, { keepFrom: '2026-10-01' })
  assert.doesNotThrow(() => assertLossless(DOCUMENTO, plan))

  plan.moved.get('2026-08').pop()
  assert.throws(() => assertLossless(DOCUMENTO, plan), /perderia ou duplicaria/)
})

test('assertUnchanged recusa escrever se o arquivo mudou depois de lido', (t) => {
  const { arquivo } = criarRepositorio(t)
  assert.doesNotThrow(() => assertUnchanged(arquivo, DOCUMENTO))

  fs.appendFileSync(arquivo, '## 2026-10-12 — outro agente escreveu aqui\n')
  assert.throws(() => assertUnchanged(arquivo, DOCUMENTO), /mudou durante a execução/)
})

test('parseArgs exige --file e --keep-from válidos e usa os padrões do arquivo morto', () => {
  assert.throws(() => parseArgs([]), /--file/)
  assert.throws(() => parseArgs(['--file', 'IA.md', '--keep-from', 'ontem']), /AAAA-MM-DD/)
  assert.throws(() => parseArgs(['--file', 'IA.md', '--keep-from']), /precisa de um valor/)
  assert.throws(() => parseArgs(['--nada']), /desconhecido/)

  const opcoesLidas = parseArgs(['--file', 'IA.md', '--keep-from', '2026-10-01', '--today', '2026-10-12', '--apply'])
  assert.deepEqual(opcoesLidas, {
    archiveDir: 'docs/ia-archive',
    prefix: 'IA-ARCHIVE',
    apply: true,
    file: 'IA.md',
    keepFrom: '2026-10-01',
    today: '2026-10-12',
  })
})

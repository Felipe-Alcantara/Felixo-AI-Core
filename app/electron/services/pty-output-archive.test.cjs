'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  createPtyOutputArchive: createArchive,
  exportCanvasTerminalOutputs,
  importCanvasTerminalOutputs,
} = require('./pty-output-archive.cjs')

// O segmento fica aberto entre lotes (é o ponto); o teste fecha no fim, senão
// o GC do Node fecha o FileHandle e acusa erro depois do teste.
const opened = []
function createPtyOutputArchive(options) {
  const archive = createArchive(options)
  opened.push(archive)
  return archive
}
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((archive) => archive.closeAll()))
})

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-pty-archive-'))
}

function silentLogger() {
  const warnings = []
  return { warnings, warn: (...args) => warnings.push(args) }
}

/** Pagina do fim ao começo, como o "carregar mais" da gaveta. */
async function readAllBackwards(archive, sessionId, maxBytes) {
  const pages = []
  let page = await archive.read(sessionId, { maxBytes })
  pages.unshift(page.text)
  while (page.start > page.firstOffset) {
    page = await archive.read(sessionId, { before: page.start, maxBytes })
    pages.unshift(page.text)
  }
  return { text: pages.join(''), firstOffset: page.firstOffset }
}

test('o que entra no append sai inteiro e em ordem na leitura', async () => {
  const archive = createPtyOutputArchive({ directory: tempDir(), logger: silentLogger() })
  archive.append('canvas:a', 'linha 1\r\n')
  archive.append('canvas:a', 'linha 2\r\n')
  await archive.flush('canvas:a')

  const page = await archive.read('canvas:a')
  assert.equal(page.text, 'linha 1\r\nlinha 2\r\n')
  assert.equal(page.start, 0)
  assert.equal(page.end, page.total)
  assert.equal(page.total, Buffer.byteLength('linha 1\r\nlinha 2\r\n'))
})

test('o lote sai sozinho depois do atraso, sem flush explícito', async () => {
  const directory = tempDir()
  const archive = createPtyOutputArchive({ directory, flushDelayMs: 5, logger: silentLogger() })
  archive.append('canvas:a', 'sozinho')
  await new Promise((resolve) => setTimeout(resolve, 60))

  const dirs = fs.readdirSync(directory)
  assert.equal(dirs.length, 1)
  const files = fs.readdirSync(path.join(directory, dirs[0]))
  assert.deepEqual(files, ['0000000000000000.log'])
  assert.equal(fs.readFileSync(path.join(directory, dirs[0], files[0]), 'utf8'), 'sozinho')
})

test('as páginas do "carregar mais" são contínuas e nunca partem um caractere UTF-8', async () => {
  const archive = createPtyOutputArchive({ directory: tempDir(), logger: silentLogger() })
  const original = Array.from({ length: 200 }, (_, index) => `ação ${index} ✓ 🙂\r\n`).join('')
  for (let index = 0; index < original.length; index += 37) {
    archive.append('canvas:a', original.slice(index, index + 37))
  }

  // Página de 7 bytes cai no meio de "ç", "✓" e "🙂" o tempo todo.
  const { text } = await readAllBackwards(archive, 'canvas:a', 7)
  assert.equal(text, original)
})

test('a rotação apaga os segmentos mais antigos sem mudar o offset dos outros', async () => {
  const directory = tempDir()
  const archive = createPtyOutputArchive({
    directory,
    segmentBytes: 100,
    maxSessionBytes: 250,
    logger: silentLogger(),
  })
  const chunks = Array.from({ length: 12 }, (_, index) => `${String(index).padStart(2, '0')}${'x'.repeat(48)}`)
  for (const chunk of chunks) {
    archive.append('canvas:a', chunk)
    await archive.flush('canvas:a')
  }

  const all = chunks.join('')
  const last = await archive.read('canvas:a', { maxBytes: 50 })
  assert.equal(last.total, all.length)
  assert.equal(last.text, all.slice(-50))

  const kept = await readAllBackwards(archive, 'canvas:a', 64)
  assert.ok(kept.firstOffset > 0, 'segmento antigo devia ter saído')
  assert.equal(kept.text, all.slice(kept.firstOffset))
  const files = fs.readdirSync(path.join(directory, fs.readdirSync(directory)[0]))
  assert.ok(files.length <= 3, `segmentos demais: ${files.join(', ')}`)
})

test('uma execução nova do app lê o arquivo anterior e continua no offset certo', async () => {
  const directory = tempDir()
  const first = createPtyOutputArchive({ directory, logger: silentLogger() })
  first.append('canvas:a', 'antes|')
  await first.close('canvas:a')

  const second = createPtyOutputArchive({ directory, logger: silentLogger() })
  assert.equal((await second.read('canvas:a')).text, 'antes|')
  second.append('canvas:a', 'depois')
  const page = await second.read('canvas:a')
  assert.equal(page.text, 'antes|depois')
  assert.equal(page.total, 'antes|depois'.length)
})

test('sessões diferentes não se misturam e sessão sem arquivo lê vazio', async () => {
  const archive = createPtyOutputArchive({ directory: tempDir(), logger: silentLogger() })
  archive.append('canvas:a', 'do a')
  archive.append('canvas:b', 'do b')

  assert.equal((await archive.read('canvas:a')).text, 'do a')
  assert.equal((await archive.read('canvas:b')).text, 'do b')
  assert.deepEqual(await archive.read('canvas:nunca'), {
    text: '',
    start: 0,
    end: 0,
    total: 0,
    firstOffset: 0,
  })
})

test('a poda tira o que passou de 14 dias e preserva o segmento em uso', async () => {
  const directory = tempDir()
  const archive = createPtyOutputArchive({ directory, logger: silentLogger() })
  archive.append('canvas:velho', 'velho')
  archive.append('canvas:vivo', 'vivo')
  await archive.close('canvas:velho')
  await archive.flush('canvas:vivo')

  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
  for (const dir of fs.readdirSync(directory)) {
    for (const file of fs.readdirSync(path.join(directory, dir))) {
      fs.utimesSync(path.join(directory, dir, file), fifteenDaysAgo, fifteenDaysAgo)
    }
  }

  // Uma execução nova não tem sessão em uso: só o "vivo" desta segue.
  const result = await archive.prune()
  assert.equal(result.removed, 0, 'as duas sessões ainda estão carregadas nesta execução')

  const nextRun = createPtyOutputArchive({ directory, logger: silentLogger() })
  const nextResult = await nextRun.prune()
  assert.equal(nextResult.removed, 2)
  assert.deepEqual(fs.readdirSync(directory), [], 'pasta vazia da sessão sai junto')
})

test('a poda respeita o teto global apagando o mais antigo primeiro', async () => {
  const directory = tempDir()
  const writer = createPtyOutputArchive({ directory, logger: silentLogger() })
  writer.append('canvas:antigo', 'a'.repeat(100))
  writer.append('canvas:novo', 'n'.repeat(100))
  await writer.close('canvas:antigo')
  await writer.close('canvas:novo')
  const old = new Date(Date.now() - 60_000)
  const oldDir = path.dirname(
    fs.readdirSync(directory).map((dir) => path.join(directory, dir, '0000000000000000.log'))
      .find((file) => fs.readFileSync(file, 'utf8').startsWith('a')),
  )
  fs.utimesSync(path.join(oldDir, '0000000000000000.log'), old, old)

  const archive = createPtyOutputArchive({ directory, maxTotalBytes: 150, logger: silentLogger() })
  const result = await archive.prune()
  assert.equal(result.removed, 1)
  assert.equal((await archive.read('canvas:antigo')).text, '')
  assert.equal((await archive.read('canvas:novo')).text, 'n'.repeat(100))
})

test('flushAllSync grava o lote pendente sem esperar promessa', async () => {
  const directory = tempDir()
  const archive = createPtyOutputArchive({ directory, flushDelayMs: 60_000, logger: silentLogger() })
  archive.append('canvas:a', 'primeiro|')
  await archive.flush('canvas:a')
  archive.append('canvas:a', 'último')
  archive.flushAllSync()

  const next = createPtyOutputArchive({ directory, logger: silentLogger() })
  assert.equal((await next.read('canvas:a')).text, 'primeiro|último')
})

test('replace troca o arquivo inteiro da sessão (importação do canvas)', async () => {
  const archive = createPtyOutputArchive({ directory: tempDir(), logger: silentLogger() })
  archive.append('canvas:a', 'conteúdo antigo')
  await archive.flush('canvas:a')
  await archive.replace('canvas:a', 'importado')

  const page = await archive.read('canvas:a')
  assert.equal(page.text, 'importado')
  assert.equal(page.start, 0)
})

test('falha de disco desliga só a sessão, avisa uma vez e não lança no append', async () => {
  // A raiz do arquivo fica embaixo de um arquivo comum: o mkdir do segmento falha.
  const blocker = path.join(tempDir(), 'arquivo-comum')
  fs.writeFileSync(blocker, 'não é pasta')
  const logger = silentLogger()
  const archive = createPtyOutputArchive({ directory: path.join(blocker, 'pty-output'), logger })

  assert.doesNotThrow(() => archive.append('canvas:a', 'x'))
  await archive.flush('canvas:a')
  assert.equal(logger.warnings.length, 1)
  assert.doesNotThrow(() => archive.append('canvas:a', 'y'))
  await archive.flush('canvas:a')
  assert.equal(logger.warnings.length, 1, 'sessão desligada não tenta de novo até fechar')

  // Fechar (o PTY saiu) religa: um processo novo na sessão tenta o disco de novo.
  await archive.close('canvas:a')
  archive.append('canvas:a', 'z')
  await archive.flush('canvas:a')
  assert.equal(logger.warnings.length, 2)
})

test('exportação leva a cauda de cada bloco com arquivo e a importação devolve', async () => {
  const source = createPtyOutputArchive({ directory: tempDir(), logger: silentLogger() })
  source.append('canvas:t1', 'saída do t1')
  await source.flush('canvas:t1')

  const outputs = await exportCanvasTerminalOutputs(source, [{ id: 't1' }, { id: 'sem-arquivo' }, { id: '' }])
  assert.deepEqual(outputs, [{ nodeId: 't1', text: 'saída do t1', truncated: false }])

  const target = createPtyOutputArchive({ directory: tempDir(), logger: silentLogger() })
  await importCanvasTerminalOutputs(target, outputs)
  assert.equal((await target.read('canvas:t1')).text, 'saída do t1')
})

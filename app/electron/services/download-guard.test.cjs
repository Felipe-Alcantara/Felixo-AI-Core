require('../../scripts/test-support/pasta-do-teste.cjs') // isola o temporário deste arquivo (ver pasta-do-teste.cjs)
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const {
  classifyDownload,
  createDownloadDialogs,
  describeDownloadSource,
  handleDownload,
  safeFileName,
} = require('./download-guard.cjs')

test('programa, script, atalho e imagem de disco são perigosos; documento comum não', () => {
  const perigosos = ['setup.exe', 'INSTALADOR.MSI', 'relatorio.pdf.exe', 'atalho.lnk', 'site.url', 'roda.ps1', 'x.vbs', 'app.hta', 'chave.reg', 'lib.jar', 'disco.iso', 'Instalar.dmg', 'Felixo.AppImage', 'roda.sh', 'pacote.deb']
  for (const fileName of perigosos) assert.equal(classifyDownload({ fileName }).dangerous, true, fileName)
  const comuns = ['relatorio.pdf', 'foto.PNG', 'planilha.xlsx', 'conversa.md', 'dados.json', 'fotos.zip', 'video.mp4']
  for (const fileName of comuns) assert.equal(classifyDownload({ fileName }).dangerous, false, fileName)

  assert.deepEqual(classifyDownload({ fileName: 'download', mimeType: 'application/x-msdownload' }), { dangerous: true, extension: '' })
  assert.equal(classifyDownload({ fileName: 'boleto.pdf', mimeType: 'application/x-msdownload' }).dangerous, false, 'a extensão salva é a que vale')
  assert.equal(classifyDownload({ fileName: 'setup.exe.  ' }).extension, 'exe', 'pontos e espaços no fim não escondem a extensão')
})

test('a origem do download é esquema + host, nunca caminho nem query; blob mostra o site de dentro', () => {
  assert.equal(describeDownloadSource('https://arquivos.exemplo.com/d/x.pdf?token=segredo#a'), 'https://arquivos.exemplo.com')
  assert.equal(describeDownloadSource('blob:https://app.exemplo.com/8f1c-uuid'), 'https://app.exemplo.com')
  assert.equal(describeDownloadSource('data:text/plain;base64,b2k='), 'data:')
  assert.equal(describeDownloadSource('não é url'), '[sem origem]')
  assert.equal(safeFileName('..\\..\\Windows/system32.exe'), '.._.._Windows_system32.exe')
  assert.equal(safeFileName(''), 'download')
})

function fakeItem({ fileName = 'relatorio.pdf', url = 'https://arquivos.exemplo.com/r.pdf?token=segredo', mimeType = 'application/pdf' } = {}) {
  const item = new EventEmitter()
  let state = 'progressing'
  let savePath = ''
  const finish = (next) => {
    if (state !== 'progressing') return
    if (next === 'completed') fs.writeFileSync(savePath, 'conteudo do arquivo')
    state = next
    item.emit('done', {}, next)
  }
  Object.assign(item, {
    getFilename: () => fileName,
    getURL: () => url,
    getMimeType: () => mimeType,
    getTotalBytes: () => 19,
    // Como um download de verdade: começa ao ganhar o caminho e termina sozinho.
    setSavePath: (value) => {
      savePath = value
      setImmediate(() => finish('completed'))
    },
    cancel: () => finish('cancelled'),
    getState: () => state,
    completeNow: () => finish('completed'),
    savePath: () => savePath,
  })
  return item
}

function withDirs(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-download-'))
  const downloadsDir = path.join(root, 'Downloads')
  const tempDir = path.join(root, 'temp')
  fs.mkdirSync(downloadsDir, { recursive: true })
  return Promise.resolve(run({ downloadsDir, tempDir })).finally(() => fs.rmSync(root, { recursive: true, force: true }))
}

function dialogsAnswering({ confirm = false, target = 'padrao' } = {}) {
  const calls = { confirm: [], choose: [] }
  return {
    calls,
    confirmDangerous: async (info) => {
      calls.confirm.push(info)
      return confirm
    },
    chooseTarget: async (info) => {
      calls.choose.push(info)
      return target === 'padrao' ? info.defaultPath : target
    },
  }
}

test('download comum: baixa numa pasta temporária, pergunta onde salvar (começando em Downloads) e move o arquivo para lá', async () => {
  await withDirs(async ({ downloadsDir, tempDir }) => {
    const item = fakeItem()
    const dialogs = dialogsAnswering()
    const logs = []
    const result = await handleDownload({ item, dialogs, downloadsDir, tempDir, log: (entry) => logs.push(entry) })

    assert.equal(result, 'salvo')
    assert.equal(dialogs.calls.confirm.length, 0, 'documento comum não pede confirmação')
    assert.equal(dialogs.calls.choose[0].defaultPath, path.join(downloadsDir, 'relatorio.pdf'))
    assert.ok(item.savePath().startsWith(tempDir))
    assert.equal(fs.readFileSync(path.join(downloadsDir, 'relatorio.pdf'), 'utf8'), 'conteudo do arquivo')
    assert.deepEqual(fs.readdirSync(tempDir), [], 'nada fica na pasta temporária')
    assert.deepEqual(logs, [{ result: 'salvo', source: 'https://arquivos.exemplo.com', fileName: 'relatorio.pdf', bytes: 19, extension: 'pdf', dangerous: false }])
    assert.doesNotMatch(JSON.stringify(logs), /segredo|token/, 'o registro nunca leva a query')
  })
})

test('programa: Cancelar na pergunta não salva nada e nem abre o diálogo de salvar', async () => {
  await withDirs(async ({ downloadsDir, tempDir }) => {
    const item = fakeItem({ fileName: 'instalador.exe', url: 'https://baixe.exemplo.com/x?k=1' })
    const dialogs = dialogsAnswering({ confirm: false })
    const result = await handleDownload({ item, dialogs, downloadsDir, tempDir })

    assert.equal(result, 'recusado')
    assert.deepEqual(dialogs.calls.confirm, [{ fileName: 'instalador.exe', source: 'https://baixe.exemplo.com', extension: 'exe' }])
    assert.equal(dialogs.calls.choose.length, 0)
    assert.equal(item.getState(), 'cancelled')
    assert.deepEqual(fs.readdirSync(downloadsDir), [])
    assert.deepEqual(fs.readdirSync(tempDir), [])
  })
})

test('programa: "Baixar mesmo assim" segue para o diálogo de salvar', async () => {
  await withDirs(async ({ downloadsDir, tempDir }) => {
    const item = fakeItem({ fileName: 'instalador.exe' })
    const result = await handleDownload({ item, dialogs: dialogsAnswering({ confirm: true }), downloadsDir, tempDir })
    assert.equal(result, 'salvo-com-confirmacao')
    assert.deepEqual(fs.readdirSync(downloadsDir), ['instalador.exe'])
  })
})

test('cancelar o diálogo de salvar não salva nada; um blob já baixado antes da resposta também chega ao destino', async () => {
  await withDirs(async ({ downloadsDir, tempDir }) => {
    const cancelado = await handleDownload({ item: fakeItem(), dialogs: dialogsAnswering({ target: null }), downloadsDir, tempDir })
    assert.equal(cancelado, 'cancelado')
    assert.deepEqual(fs.readdirSync(downloadsDir), [])

    // Exportação de um site (blob:): pequena, termina antes de a pessoa escolher o lugar.
    const item = fakeItem({ fileName: 'export.csv', url: 'blob:https://app.exemplo.com/uuid', mimeType: 'text/csv' })
    const dialogs = dialogsAnswering()
    const original = dialogs.chooseTarget
    dialogs.chooseTarget = async (info) => {
      item.completeNow()
      return original(info)
    }
    assert.equal(await handleDownload({ item, dialogs, downloadsDir, tempDir }), 'salvo')
    assert.deepEqual(fs.readdirSync(downloadsDir), ['export.csv'])
    assert.deepEqual(fs.readdirSync(tempDir), [])
  })
})

test('os diálogos de automação só valem na instância de automação que pediu; senão, os do sistema com a janela do app', async () => {
  const automacao = createDownloadDialogs({
    dialog: {},
    getParentWindow: () => null,
    env: { FELIXO_DEVTOOLS_DOWNLOAD_DIR: '/tmp/saida', FELIXO_DEVTOOLS_DOWNLOAD_CONFIRM: 'sim' },
    devtoolsPort: 9333,
  })
  assert.equal(await automacao.confirmDangerous({ fileName: 'x.exe', source: 's', extension: 'exe' }), true)
  assert.equal(await automacao.chooseTarget({ fileName: 'x.exe', defaultPath: 'ignorado' }), path.join('/tmp/saida', 'x.exe'))

  const chamadas = []
  const janela = { isDestroyed: () => false }
  const sistema = createDownloadDialogs({
    dialog: {
      showMessageBox: async (...args) => {
        chamadas.push(['mensagem', ...args])
        return { response: 0 }
      },
      showSaveDialog: async (...args) => {
        chamadas.push(['salvar', ...args])
        return { canceled: false, filePath: 'C:\\Users\\p\\Downloads\\x.exe' }
      },
    },
    getParentWindow: () => janela,
    env: { FELIXO_DEVTOOLS_DOWNLOAD_DIR: '/tmp/saida' },
    devtoolsPort: Number.NaN,
  })
  assert.equal(await sistema.confirmDangerous({ fileName: 'x.exe', source: 'https://baixe.exemplo.com', extension: 'exe' }), false, 'o padrão é Cancelar')
  assert.equal(chamadas[0][1], janela)
  assert.match(chamadas[0][2].message, /https:\/\/baixe\.exemplo\.com quer salvar "x\.exe"/)
  assert.deepEqual(chamadas[0][2].buttons, ['Cancelar', 'Baixar mesmo assim'])
  assert.equal(chamadas[0][2].cancelId, 0)
  assert.equal(await sistema.chooseTarget({ defaultPath: 'C:\\Users\\p\\Downloads\\x.exe' }), 'C:\\Users\\p\\Downloads\\x.exe')
})
test('recusar depois que o programa já terminou de baixar apaga o arquivo temporário', async () => {
  await withDirs(async ({ downloadsDir, tempDir }) => {
    const item = fakeItem({ fileName: 'instalador.exe' })
    const dialogs = dialogsAnswering({ confirm: false })
    dialogs.confirmDangerous = async () => {
      item.completeNow()
      assert.equal(fs.readdirSync(tempDir).length, 1, 'o arquivo chegou ao temporário')
      return false
    }
    assert.equal(await handleDownload({ item, dialogs, downloadsDir, tempDir }), 'recusado')
    assert.deepEqual(fs.readdirSync(tempDir), [])
    assert.deepEqual(fs.readdirSync(downloadsDir), [])
  })
})

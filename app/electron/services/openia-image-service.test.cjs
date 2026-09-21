const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

// O serviço roda no processo principal; o teste injeta só o contrato de ipcMain.
const handlers = new Map()
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}
const {
  MAX_CONCURRENT,
  MESSAGES,
  collectFiles,
  createOpeniaImageService,
  parseRequest,
  registerOpeniaImageIpcHandlers,
  runOpeniaImageProcess,
  sniffRasterMimeType,
} = require('./openia-image-service.cjs')
const { saveGeneratedImage } = require('./file-attachments-ipc-handlers.cjs')
Module._load = originalLoad

const MODEL = 'acme/pixel-1'
const SECRET = 'sk-or-v1-CHAVE-QUE-NUNCA-PODE-SAIR'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)])

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-openia-image-'))
}

function models(extra = {}) {
  return async () => ({
    ok: true,
    models: [
      { id: MODEL, vendor: 'acme', name: 'Pixel', completionPrice: 0, outputModalities: ['text', 'image'] },
      { id: 'acme/texto', vendor: 'acme', name: 'Texto', completionPrice: 0, outputModalities: ['text'] },
    ],
    ...extra,
  })
}

/** Serviço com gravação REAL no disco (mesma função usada em produção) e filho simulado. */
function harness({ runImage, listModels = models(), timeoutMs, saveImage } = {}) {
  const userData = tmp()
  const generatedDir = path.join(userData, 'generated-images')
  const notified = []
  const service = createOpeniaImageService({
    userData,
    listModels,
    saveImage: saveImage ?? ((params) => saveGeneratedImage(params, generatedDir)),
    notify: (artifact) => notified.push({ artifact, existsAtNotify: fs.existsSync(artifact.path) }),
    runImage,
    timeoutMs,
  })
  return { userData, generatedDir, notified, service, runsDir: path.join(userData, 'openia-image-runs') }
}

/** Filho simulado: descobre a pasta de saída pelos argumentos e escreve os arquivos pedidos. */
function child({ files = [['img-1.png', PNG]], listed, cost = 0.04, stdout, ok = true } = {}) {
  const calls = []
  const run = async (request) => {
    calls.push(request)
    const outDir = request.args[request.args.indexOf('--out-dir') + 1]
    for (const [name, data] of files) fs.writeFileSync(path.join(outDir, name), data)
    return {
      started: true,
      ok,
      stdout: stdout ?? JSON.stringify({ ok: true, files: (listed ?? files.map(([name]) => name)).map((name) => ({ name })), cost }),
    }
  }
  run.calls = calls
  return run
}

test('gera, grava pelo caminho seguro e só DEPOIS de gravar avisa o canvas', async () => {
  const runImage = child({ cost: 0.04 })
  const h = harness({ runImage })
  const result = await h.service.generate({ prompt: '  um gato astronauta  ', model: MODEL, requestId: 'req-000001' })

  assert.equal(result.ok, true)
  assert.equal(result.state, 'success')
  assert.equal(result.artifacts.length, 1)
  const artifact = result.artifacts[0]
  assert.equal(artifact.mimeType, 'image/png')
  assert.equal(artifact.prompt, 'um gato astronauta')
  assert.equal(artifact.model, MODEL)
  assert.equal(artifact.requestId, 'req-000001')
  assert.equal(artifact.cost, 0.04)
  assert.equal(artifact.temporary, true)
  assert.ok(artifact.path.startsWith(fs.realpathSync(h.generatedDir)))
  assert.equal(fs.existsSync(artifact.path), true)
  // O aviso ao canvas só ocorre com o arquivo já escrito.
  assert.equal(h.notified.length, 1)
  assert.equal(h.notified[0].existsAtNotify, true)
  // A pasta temporária do pedido some, com sucesso.
  assert.equal(fs.existsSync(path.join(h.runsDir, 'req-000001')), false)
  assert.equal(h.service.status({ requestId: 'req-000001' }).state, 'success')
})

test('o prompt vai por stdin (input), nunca por argumento; a pasta de saída é a do Felixo', async () => {
  const runImage = child()
  const h = harness({ runImage })
  await h.service.generate({ prompt: 'segredo do prompt', model: MODEL, requestId: 'req-000002' })
  const [request] = runImage.calls
  assert.equal(request.input, 'segredo do prompt')
  assert.equal(request.args.some((arg) => arg.includes('segredo do prompt')), false)
  assert.deepEqual(request.args.slice(0, 4), ['image', '--json', '--model', MODEL])
  assert.equal(request.args[request.args.indexOf('--out-dir') + 1], path.join(h.runsDir, 'req-000002'))
  assert.equal(request.args[request.args.indexOf('--request-id') + 1], 'req-000002')
  assert.ok(request.signal instanceof AbortSignal)
})

test('parseRequest: schema fechado — recusa pasta/caminho, modelo com cara de opção, prompt vazio ou enorme', () => {
  assert.equal(parseRequest({ prompt: 'ok', model: MODEL }).ok, true)
  assert.equal(parseRequest({ prompt: 'ok', model: MODEL, requestId: 'abcdefgh' }).ok, true)
  const invalidos = [
    null, 'x', [], {},
    { prompt: 'ok', model: MODEL, outDir: '/tmp' },
    { prompt: 'ok', model: MODEL, path: '/etc/passwd' },
    { prompt: '', model: MODEL },
    { prompt: '   ', model: MODEL },
    { prompt: 'x'.repeat(4001), model: MODEL },
    { prompt: 'a\0b', model: MODEL },
    { prompt: 'ok', model: '--out-dir/x' },
    { prompt: 'ok', model: '-x/y' },
    { prompt: 'ok', model: '../x' },
    { prompt: 'ok', model: 'sem-barra' },
    { prompt: 'ok', model: 'a b/c' },
    { prompt: 'ok', model: 'a/b;rm -rf /' },
    { prompt: 'ok', model: MODEL, requestId: '../../x' },
    { prompt: 'ok', model: MODEL, requestId: 'curto' },
    { prompt: 'ok', model: MODEL, requestId: 42 },
    { prompt: 42, model: MODEL },
  ]
  for (const params of invalidos) assert.equal(parseRequest(params).ok, false, JSON.stringify(params))
})

test('o IPC recusa payload com diretório de saída e não chama o filho', async () => {
  const runImage = child()
  const h = harness({ runImage })
  const result = await h.service.generate({ prompt: 'x', model: MODEL, outDir: '/tmp/fora' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'invalid_request')
  assert.equal(runImage.calls.length, 0)
})

test('sem capacidade informada pelo Openia nada é oferecido nem executado (não presume)', async () => {
  const runImage = child()
  const h = harness({
    runImage,
    listModels: async () => ({ ok: true, models: [{ id: MODEL, vendor: 'acme', name: 'Pixel', completionPrice: 0 }] }),
  })
  const listed = await h.service.imageModels()
  assert.deepEqual(listed, { ok: true, capabilityKnown: false, models: [] })
  const result = await h.service.generate({ prompt: 'x', model: MODEL })
  assert.equal(result.code, 'capability_unknown')
  assert.equal(runImage.calls.length, 0)
})

test('modelo que não gera imagem e catálogo indisponível são recusados sem executar o filho', async () => {
  const runImage = child()
  const h = harness({ runImage })
  assert.equal((await h.service.generate({ prompt: 'x', model: 'acme/texto' })).code, 'model_not_image_capable')
  assert.equal((await h.service.generate({ prompt: 'x', model: 'outro/inexistente' })).code, 'model_not_image_capable')

  const semCatalogo = harness({ runImage, listModels: async () => ({ ok: false }) })
  assert.equal((await semCatalogo.service.generate({ prompt: 'x', model: MODEL })).code, 'openia_unavailable')
  assert.equal(runImage.calls.length, 0)
})

test('erros do filho viram códigos e mensagens FIXAS: nunca stderr, chave nem traceback', async () => {
  const casos = [
    [{ started: true, ok: false, stdout: JSON.stringify({ ok: false, code: 'key_missing', message: SECRET }) }, 'key_missing'],
    [{ started: true, ok: false, stdout: JSON.stringify({ ok: false, code: 'insufficient_credits' }) }, 'insufficient_credits'],
    [{ started: true, ok: false, stdout: JSON.stringify({ ok: false, code: 'algo-inventado', message: SECRET }) }, 'generation_failed'],
    [{ started: true, ok: false, stdout: `Traceback (most recent call last): ${SECRET}` }, 'generation_failed'],
    [{ started: true, ok: true, stdout: `Traceback ${SECRET}` }, 'invalid_output'],
    [{ started: true, ok: true, stdout: JSON.stringify({ ok: true, files: 'nao-e-lista' }) }, 'invalid_output'],
    [{ started: false }, 'openia_unavailable'],
  ]
  for (const [resposta, codigo] of casos) {
    const h = harness({ runImage: async () => resposta })
    const result = await h.service.generate({ prompt: 'x', model: MODEL })
    assert.equal(result.ok, false)
    assert.equal(result.code, codigo)
    assert.equal(result.message, MESSAGES[codigo])
    const serializado = JSON.stringify(result)
    assert.equal(serializado.includes(SECRET), false)
    assert.equal(/Traceback/i.test(serializado), false)
    assert.equal(h.notified.length, 0)
  }
})

test('saída inválida do filho invalida tudo: nada gravado, nada anunciado, pasta do pedido limpa', async () => {
  const outros = [
    child({ files: [['img.png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')]] }),
    child({ files: [['img.png', Buffer.from('isto nao e uma imagem de verdade')]] }),
    child({ files: [['img.png', PNG]], listed: ['../fugiu.png'] }),
    child({ files: [['img.png', PNG]], listed: ['nao-existe.png'] }),
    child({ files: [['img.png', PNG]], listed: [] }),
  ]
  for (const runImage of outros) {
    const h = harness({ runImage })
    const result = await h.service.generate({ prompt: 'x', model: MODEL, requestId: 'req-invalid1' })
    assert.equal(result.code, 'invalid_output')
    assert.equal(h.notified.length, 0)
    assert.equal(fs.existsSync(h.generatedDir) ? fs.readdirSync(h.generatedDir).length : 0, 0)
    assert.equal(fs.existsSync(path.join(h.runsDir, 'req-invalid1')), false)
  }
})

test('arquivos que o filho NÃO listou são ignorados (não é qualquer arquivo da pasta)', async () => {
  const runImage = child({ files: [['ok.png', PNG], ['extra.png', JPEG]], listed: ['ok.png'] })
  const h = harness({ runImage })
  const result = await h.service.generate({ prompt: 'x', model: MODEL })
  assert.equal(result.ok, true)
  assert.equal(result.artifacts.length, 1)
  assert.equal(result.artifacts[0].mimeType, 'image/png')
})

test('o MIME vem dos BYTES, não da extensão que o filho escolheu', async () => {
  const runImage = child({ files: [['foto.png', JPEG]] })
  const h = harness({ runImage })
  const result = await h.service.generate({ prompt: 'x', model: MODEL })
  assert.equal(result.ok, true)
  assert.equal(result.artifacts[0].mimeType, 'image/jpeg')
})

test('duas imagens: se a segunda não grava, a primeira é desfeita e nada é anunciado', async () => {
  let chamadas = 0
  const gravadas = []
  const h = harness({
    runImage: child({ files: [['a.png', PNG], ['b.png', JPEG]] }),
    saveImage: async (params) => {
      chamadas += 1
      if (chamadas === 2) return { ok: false }
      const artifact = { path: path.join(tmp(), 'a.png'), mimeType: params.type }
      fs.writeFileSync(artifact.path, params.data)
      gravadas.push(artifact.path)
      return { ok: true, artifact }
    },
  })
  const result = await h.service.generate({ prompt: 'x', model: MODEL })
  assert.equal(result.code, 'save_failed')
  assert.equal(h.notified.length, 0)
  assert.equal(fs.existsSync(gravadas[0]), false)
})

test('limite de execuções simultâneas e identificador repetido', async () => {
  const liberar = []
  const runImage = () => new Promise((resolve) => liberar.push(() => resolve({ started: true, ok: false, stdout: '' })))
  const h = harness({ runImage })
  const ids = Array.from({ length: MAX_CONCURRENT }, (_, i) => `req-conc-0${i}`)
  const emAndamento = ids.map((requestId) => h.service.generate({ prompt: 'x', model: MODEL, requestId }))
  await new Promise((resolve) => setTimeout(resolve, 30))

  assert.equal((await h.service.generate({ prompt: 'x', model: MODEL, requestId: 'req-conc-99' })).code, 'busy')
  assert.equal((await h.service.generate({ prompt: 'x', model: MODEL, requestId: ids[0] })).code, 'duplicate_request')
  assert.equal(h.service.status({ requestId: ids[0] }).state, 'pending')

  liberar.forEach((fn) => fn())
  await Promise.all(emAndamento)
  assert.equal(h.service.status({ requestId: ids[0] }).state, 'error')
})

test('cancelar: para o filho, devolve "cancelled", não grava, não anuncia e limpa a pasta', async () => {
  let recebeuSinal = false
  const runImage = ({ args, signal }) =>
    new Promise((resolve) => {
      const outDir = args[args.indexOf('--out-dir') + 1]
      fs.writeFileSync(path.join(outDir, 'parcial.png'), PNG)
      signal.addEventListener('abort', () => {
        recebeuSinal = true
        resolve({ started: true, ok: false, stdout: '' })
      })
    })
  const h = harness({ runImage })
  const pendente = h.service.generate({ prompt: 'x', model: MODEL, requestId: 'req-cancel1' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.deepEqual(h.service.cancel({ requestId: 'req-cancel1' }), { ok: true, cancelled: true })

  const result = await pendente
  assert.equal(recebeuSinal, true)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'cancelled')
  assert.equal(result.state, 'cancelled')
  assert.equal(h.notified.length, 0)
  assert.equal(fs.existsSync(h.generatedDir) ? fs.readdirSync(h.generatedDir).length : 0, 0)
  assert.equal(fs.existsSync(path.join(h.runsDir, 'req-cancel1')), false)
  assert.equal(h.service.status({ requestId: 'req-cancel1' }).state, 'cancelled')
  assert.deepEqual(h.service.cancel({ requestId: 'req-cancel1' }), { ok: true, cancelled: false })
  assert.equal(h.service.cancel({ requestId: '../x' }).ok, false)
})

test('estourar o tempo interrompe o filho e devolve "timeout"', async () => {
  const runImage = ({ signal }) =>
    new Promise((resolve) => signal.addEventListener('abort', () => resolve({ started: true, ok: false, stdout: '' })))
  const h = harness({ runImage, timeoutMs: 40 })
  const result = await h.service.generate({ prompt: 'x', model: MODEL, requestId: 'req-timeout' })
  assert.equal(result.code, 'timeout')
  assert.equal(result.message, MESSAGES.timeout)
  assert.equal(fs.existsSync(path.join(h.runsDir, 'req-timeout')), false)
})

test('reiniciar preserva a referência gravada e a varredura só apaga pastas de pedido velhas', async () => {
  const h = harness({ runImage: child() })
  const result = await h.service.generate({ prompt: 'x', model: MODEL })
  const artifactPath = result.artifacts[0].path

  fs.mkdirSync(h.runsDir, { recursive: true })
  const velha = path.join(h.runsDir, 'sobra-de-uma-queda')
  const recente = path.join(h.runsDir, 'pedido-em-curso')
  fs.mkdirSync(velha)
  fs.mkdirSync(recente)
  const ha2Horas = new Date(Date.now() - 2 * 60 * 60_000)
  fs.utimesSync(velha, ha2Horas, ha2Horas)

  const reiniciado = createOpeniaImageService({
    userData: h.userData,
    listModels: models(),
    saveImage: () => ({ ok: false }),
  })
  assert.deepEqual(await reiniciado.sweepOrphans(), { removed: 1 })
  assert.equal(fs.existsSync(velha), false)
  assert.equal(fs.existsSync(recente), true)
  assert.equal(fs.existsSync(artifactPath), true)
})

test('registra só os quatro canais de imagem do Openia', async () => {
  handlers.clear()
  const h = harness({ runImage: child() })
  registerOpeniaImageIpcHandlers({ service: h.service })
  assert.deepEqual([...handlers.keys()].sort(), [
    'openia:cancel-image',
    'openia:generate-image',
    'openia:image-models',
    'openia:image-status',
  ])
  const recusa = await handlers.get('openia:generate-image')({}, { prompt: 'x', model: MODEL, outDir: '/tmp' })
  assert.equal(recusa.code, 'invalid_request')
})

test('sniffRasterMimeType reconhece só raster e recusa SVG, HTML e lixo', () => {
  const com = (cabeca, tamanho = 32) => Buffer.concat([Buffer.from(cabeca, 'latin1'), Buffer.alloc(tamanho)])
  assert.equal(sniffRasterMimeType(PNG), 'image/png')
  assert.equal(sniffRasterMimeType(JPEG), 'image/jpeg')
  assert.equal(sniffRasterMimeType(com('GIF89a')), 'image/gif')
  assert.equal(sniffRasterMimeType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])), 'image/webp')
  assert.equal(sniffRasterMimeType(com('BM')), 'image/bmp')
  assert.equal(sniffRasterMimeType(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(8)])), 'image/avif')
  for (const ruim of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>', '<html><body>oi</body></html>', 'texto puro qualquer aqui', '']) {
    assert.equal(sniffRasterMimeType(Buffer.from(ruim)), '', ruim)
  }
  assert.equal(sniffRasterMimeType(PNG.subarray(0, 6)), '')
  assert.equal(sniffRasterMimeType(null), '')
})

test('collectFiles recusa link simbólico, diretório, arquivo vazio, gigante e nome com separador', async () => {
  const dir = tmp()
  const fora = path.join(tmp(), 'segredo.png')
  fs.writeFileSync(fora, PNG)
  fs.writeFileSync(path.join(dir, 'bom.png'), PNG)
  fs.mkdirSync(path.join(dir, 'pasta.png'))
  fs.writeFileSync(path.join(dir, 'vazio.png'), Buffer.alloc(0))
  const enorme = path.join(dir, 'enorme.png')
  fs.writeFileSync(enorme, PNG)
  fs.truncateSync(enorme, 26 * 1024 * 1024)
  let link = true
  try {
    fs.symlinkSync(fora, path.join(dir, 'link.png'))
  } catch {
    link = false // Windows sem privilégio de link: o resto do teste continua valendo
  }

  assert.equal((await collectFiles(dir, ['bom.png'])).ok, true)
  for (const nome of ['pasta.png', 'vazio.png', 'enorme.png', '../x.png', 'a/b.png', 'a\\b.png', '.', '..', '', 'nao-existe.png']) {
    assert.equal((await collectFiles(dir, [nome])).ok, false, nome)
  }
  if (link) assert.equal((await collectFiles(dir, ['link.png'])).ok, false, 'link simbólico para fora da pasta')
  assert.equal((await collectFiles(dir, [])).ok, false)
  assert.equal((await collectFiles(path.join(dir, 'nao-existe'), ['x.png'])).ok, false)
})

// ---- Contrato com um `openia` falso rodando como PROCESSO de verdade -----------------------------------------

const FAKE_OPENIA = `
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const argv = process.argv.slice(2)
const outDir = argv[argv.indexOf('--out-dir') + 1]
const runsDir = path.dirname(outDir)
fs.writeFileSync(path.join(runsDir, 'last-argv.json'), JSON.stringify(argv))
let prompt = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { prompt += chunk })
process.stdin.on('end', () => {
  fs.writeFileSync(path.join(runsDir, 'last-prompt.txt'), prompt)
  if (prompt.includes('FALHAR')) {
    process.stderr.write('Traceback (most recent call last): Authorization: Bearer ${SECRET}\\n')
    process.exit(1)
  }
  if (prompt.includes('TRAVAR')) {
    const neto = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
    fs.writeFileSync(path.join(runsDir, 'neto.pid'), String(neto.pid))
    fs.writeFileSync(path.join(outDir, 'parcial.png'), 'incompleto')
    setInterval(() => {}, 1000)
    return
  }
  fs.writeFileSync(path.join(outDir, 'img-1.png'), Buffer.from('${PNG.toString('base64')}', 'base64'))
  process.stdout.write(JSON.stringify({ ok: true, files: [{ name: 'img-1.png', mimeType: 'image/png' }], cost: 0.02 }))
})
`

function realProcessHarness() {
  const script = path.join(tmp(), 'fake-openia.cjs')
  fs.writeFileSync(script, FAKE_OPENIA)
  const resolveSpawn = () => ({ executable: process.execPath, env: process.env, needsShell: false, prefixArgs: [script] })
  return harness({ runImage: (request) => runOpeniaImageProcess({ ...request, resolveSpawn, killGraceMs: 300 }) })
}

function esta_vivo(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function esperarMorrer(pid, ms = 6000) {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    if (!esta_vivo(pid)) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

test('contrato real: prompt por stdin, saída em arquivo na pasta do Felixo, artefato gravado', async () => {
  const h = realProcessHarness()
  const result = await h.service.generate({ prompt: 'um gato astronauta', model: MODEL, requestId: 'req-real-01' })

  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.artifacts[0].cost, 0.02)
  assert.equal(fs.readFileSync(path.join(h.runsDir, 'last-prompt.txt'), 'utf8'), 'um gato astronauta')
  const argv = JSON.parse(fs.readFileSync(path.join(h.runsDir, 'last-argv.json'), 'utf8'))
  assert.equal(argv.some((arg) => arg.includes('gato')), false, 'o prompt não pode ir em argumento')
  assert.deepEqual(argv.slice(0, 4), ['image', '--json', '--model', MODEL])
  assert.equal(h.notified.length, 1)
})

test('contrato real: falha do filho com traceback e "chave" no stderr não vaza nada ao renderer', async () => {
  const h = realProcessHarness()
  const result = await h.service.generate({ prompt: 'FALHAR agora', model: MODEL, requestId: 'req-real-02' })

  assert.equal(result.ok, false)
  assert.equal(result.code, 'generation_failed')
  assert.equal(result.message, MESSAGES.generation_failed)
  const serializado = JSON.stringify(result)
  assert.equal(serializado.includes(SECRET), false)
  assert.equal(/Traceback|Bearer/i.test(serializado), false)
  assert.equal(h.notified.length, 0)
})

test('contrato real: cancelar mata o filho E o neto e não deixa arquivo órfão', async () => {
  const h = realProcessHarness()
  const pendente = h.service.generate({ prompt: 'TRAVAR para sempre', model: MODEL, requestId: 'req-real-03' })

  const pidFile = path.join(h.runsDir, 'neto.pid')
  const limite = Date.now() + 8000
  while (!fs.existsSync(pidFile) && Date.now() < limite) await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(fs.existsSync(pidFile), true, 'o filho falso não chegou a subir o neto')
  const neto = Number(fs.readFileSync(pidFile, 'utf8'))
  assert.equal(esta_vivo(neto), true)

  assert.equal(h.service.cancel({ requestId: 'req-real-03' }).cancelled, true)
  const result = await pendente
  assert.equal(result.code, 'cancelled')
  assert.equal(await esperarMorrer(neto), true, 'o processo neto ficou órfão depois do cancelamento')
  assert.equal(fs.existsSync(path.join(h.runsDir, 'req-real-03')), false)
  assert.equal(h.notified.length, 0)
  assert.equal(fs.existsSync(h.generatedDir) ? fs.readdirSync(h.generatedDir).length : 0, 0)
})

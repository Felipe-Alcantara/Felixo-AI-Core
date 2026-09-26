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
  IMAGE_MODELS_URL,
  MAX_CONCURRENT,
  MESSAGES,
  buildOpeniaArgs,
  collectFiles,
  createOpeniaImageService,
  fetchImageCatalog,
  mapFailure,
  parseEnvelope,
  parseRequest,
  registerOpeniaImageIpcHandlers,
  resolveOutputNames,
  runOpeniaImageProcess,
  sanitizeArgsForShell,
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

/** Catálogo público simulado: um modelo de imagem (o que o serviço deve oferecer). */
function catalog(extra = []) {
  return async () => [
    { id: MODEL, vendor: 'acme', name: 'Pixel', inputModalities: ['text'], outputModalities: ['image'] },
    ...extra,
  ]
}

/** Serviço com gravação REAL no disco (mesma função usada em produção) e filho simulado. */
function harness({ runImage, fetchCatalog = catalog(), timeoutMs, saveImage } = {}) {
  const userData = tmp()
  const generatedDir = path.join(userData, 'generated-images')
  const notified = []
  const service = createOpeniaImageService({
    userData,
    fetchCatalog,
    saveImage: saveImage ?? ((params) => saveGeneratedImage(params, generatedDir)),
    notify: (artifact) => notified.push({ artifact, existsAtNotify: fs.existsSync(artifact.path) }),
    runImage,
    timeoutMs,
  })
  return { userData, generatedDir, notified, service, runsDir: path.join(userData, 'openia-image-runs') }
}

const outDirOf = (request) => request.args[request.args.indexOf('--output-dir') + 1]

/** Envelope de sucesso do Openia (formato real: outputs[].path absoluto, sem custo). */
function successEnvelope(outputs) {
  return JSON.stringify({
    version: 1,
    ok: true,
    requestId: 'req',
    model: MODEL,
    outputs: outputs.map((file) => ({ path: file, mime: 'image/png', bytes: 1 })),
    createdAt: '2026-09-21T00:00:00.000Z',
    completedAt: '2026-09-21T00:00:01.000Z',
  })
}

function failureEnvelope(code, message = SECRET) {
  return JSON.stringify({ version: 1, ok: false, error: { code, message }, requestId: 'req' })
}

/** Filho simulado: escreve os arquivos na pasta de saída pedida e responde com o envelope real. */
function child({ files = [['img-1.png', PNG]], listed, stdout, exitCode = 0 } = {}) {
  const calls = []
  const run = async (request) => {
    calls.push(request)
    const outDir = outDirOf(request)
    for (const [name, data] of files) fs.writeFileSync(path.join(outDir, name), data)
    // `{ raw }` entrega o caminho exatamente como veio (ex.: relativo), sem o `path.join`, que o normalizaria.
    const paths = (listed ?? files.map(([name]) => name)).map((name) =>
      typeof name === 'object' ? name.raw : path.isAbsolute(name) ? name : path.join(outDir, name),
    )
    return { started: true, ok: exitCode === 0, exitCode, stdout: stdout ?? successEnvelope(paths) }
  }
  run.calls = calls
  return run
}

test('gera, grava pelo caminho seguro e só DEPOIS de gravar avisa o canvas', async () => {
  const runImage = child()
  const h = harness({ runImage })
  const result = await h.service.generate({ prompt: '  um gato astronauta  ', model: MODEL, requestId: 'req-000001' })

  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.state, 'success')
  assert.equal(result.artifacts.length, 1)
  const artifact = result.artifacts[0]
  assert.equal(artifact.mimeType, 'image/png')
  assert.equal(artifact.prompt, 'um gato astronauta')
  assert.equal(artifact.model, MODEL)
  assert.equal(artifact.requestId, 'req-000001')
  assert.equal('cost' in artifact, false, 'o Openia não informa custo e o Felixo não inventa')
  assert.equal(artifact.temporary, true)
  // `realpath.native` (libuv), o mesmo do código de produção: no Windows o temp usa nomes curtos 8.3
  // (RUNNER~1) que o `realpathSync` do JS não expande, e a comparação de prefixo falhava só lá.
  const relativo = path.relative(fs.realpathSync.native(h.generatedDir), artifact.path)
  assert.ok(relativo && !relativo.startsWith('..') && !path.isAbsolute(relativo), `fora da pasta de imagens geradas: ${relativo}`)
  assert.equal(fs.existsSync(artifact.path), true)
  // O aviso ao canvas só ocorre com o arquivo já escrito.
  assert.equal(h.notified.length, 1)
  assert.equal(h.notified[0].existsAtNotify, true)
  // A pasta e o arquivo de cancelamento do pedido somem, com sucesso.
  assert.equal(fs.existsSync(path.join(h.runsDir, 'req-000001')), false)
  assert.equal(fs.existsSync(path.join(h.runsDir, 'req-000001.cancel')), false)
  assert.equal(h.service.status({ requestId: 'req-000001' }).state, 'success')
})

test('argumentos do filho seguem o contrato REAL do Openia (prompt em --prompt=, pasta em --output-dir, cancelamento por arquivo)', async () => {
  const runImage = child()
  const h = harness({ runImage })
  await h.service.generate({ prompt: '--isto-nao-e-uma-opcao', model: MODEL, requestId: 'req-000002' })
  const [request] = runImage.calls
  const args = request.args

  assert.deepEqual(args.slice(0, 4), ['image', '--json', '--model', MODEL])
  assert.ok(args.includes('--prompt=--isto-nao-e-uma-opcao'), 'o prompt vai colado a --prompt= e nunca é lido como opção')
  assert.equal(args.includes('--out-dir'), false)
  assert.equal(outDirOf(request), path.join(h.runsDir, 'req-000002'))
  assert.equal(args[args.indexOf('--request-id') + 1], 'req-000002')
  assert.equal(args[args.indexOf('--cancel-file') + 1], path.join(h.runsDir, 'req-000002.cancel'))
  assert.equal(args[args.indexOf('--timeout') + 1], '100')
  assert.equal(args[args.indexOf('--retries') + 1], '1')
  assert.ok(request.signal instanceof AbortSignal)
  assert.equal(request.cancelFile, path.join(h.runsDir, 'req-000002.cancel'))
  assert.equal('input' in request, false, 'o Openia não lê o prompt por stdin')
  assert.deepEqual(args, buildOpeniaArgs({ prompt: '--isto-nao-e-uma-opcao', model: MODEL, runDir: outDirOf(request), requestId: 'req-000002', cancelFile: request.cancelFile }))
})

test('parseRequest: schema fechado — recusa pasta/caminho, modelo com cara de opção, prompt vazio/enorme e id que começa com - ou _', () => {
  assert.equal(parseRequest({ prompt: 'ok', model: MODEL }).ok, true)
  assert.equal(parseRequest({ prompt: 'ok', model: MODEL, requestId: 'abcdefgh' }).ok, true)
  const invalidos = [
    null, 'x', [], {},
    { prompt: 'ok', model: MODEL, outDir: '/tmp' },
    { prompt: 'ok', model: MODEL, outputDir: '/tmp' },
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
    { prompt: 'ok', model: MODEL, requestId: '-abcdefgh' },
    { prompt: 'ok', model: MODEL, requestId: '_abcdefgh' },
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

// ---- Catálogo público ---------------------------------------------------------------------------------------

function fakeResponse(body, { ok = true, headers = {} } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return { ok, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, text: async () => text }
}

test('catálogo público: só modelos com saída de imagem, sem chave, sem redirecionamento, campos saneados', async () => {
  let chamada
  const fetchImpl = async (url, init) => {
    chamada = { url, init }
    return fakeResponse({
      data: [
        { id: 'openai/gpt-image', name: 'GPT Image', architecture: { input_modalities: ['text', 'IMAGE', 'telepatia'], output_modalities: ['image'] } },
        { id: 'acme/texto', name: 'Texto', architecture: { output_modalities: ['text'] } },
        { id: 'acme/sem-arquitetura', name: 'Sem' },
        { id: '-x/opcao', name: 'Cara de opção', architecture: { output_modalities: ['image'] } },
        { id: 'sem-barra', architecture: { output_modalities: ['image'] } },
        { id: 'a b/c', architecture: { output_modalities: ['image'] } },
        null,
        'lixo',
        { id: 'acme/sem-nome', architecture: { output_modalities: ['text', 'image'] } },
      ],
    })
  }
  const models = await fetchImageCatalog({ fetchImpl })

  assert.equal(chamada.url, IMAGE_MODELS_URL)
  assert.equal(chamada.init.method, 'GET')
  assert.equal(chamada.init.redirect, 'error')
  assert.deepEqual(Object.keys(chamada.init.headers), ['accept'], 'nenhum cabeçalho de autorização')
  assert.deepEqual(models.map((model) => model.id), ['openai/gpt-image', 'acme/sem-nome'])
  assert.deepEqual(models[0], {
    id: 'openai/gpt-image', vendor: 'openai', name: 'GPT Image', inputModalities: ['text', 'image'], outputModalities: ['image'],
  })
  assert.equal(models[1].name, 'acme/sem-nome')
})

test('catálogo público: falha, formato inválido, grande demais e lento demais são recusados', async () => {
  await assert.rejects(fetchImageCatalog({ fetchImpl: async () => fakeResponse({}, { ok: false }) }))
  await assert.rejects(fetchImageCatalog({ fetchImpl: async () => fakeResponse('isto não é json') }))
  await assert.rejects(fetchImageCatalog({ fetchImpl: async () => fakeResponse({ data: 'nao-e-lista' }) }))
  await assert.rejects(fetchImageCatalog({ fetchImpl: async () => fakeResponse({ data: [] }, { headers: { 'content-length': String(3 * 1024 * 1024) } }) }))
  await assert.rejects(fetchImageCatalog({ fetchImpl: async () => fakeResponse({ data: [{ id: 'a/b', pad: 'x'.repeat(2000) }] }), maxBytes: 500 }))
  const lento = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abortado'))))
  await assert.rejects(fetchImageCatalog({ fetchImpl: lento, timeoutMs: 30 }))
})

test('o catálogo é consultado uma vez e reaproveitado; falha do catálogo e modelo fora da lista são recusados sem executar o filho', async () => {
  const runImage = child()
  let consultas = 0
  const h = harness({ runImage, fetchCatalog: async () => { consultas += 1; return catalog()() } })
  assert.equal((await h.service.generate({ prompt: 'x', model: MODEL })).ok, true)
  assert.equal((await h.service.generate({ prompt: 'x', model: MODEL })).ok, true)
  assert.equal(consultas, 1)
  assert.equal((await h.service.generate({ prompt: 'x', model: 'acme/texto' })).code, 'model_not_image_capable')
  assert.equal((await h.service.generate({ prompt: 'x', model: 'outro/inexistente' })).code, 'model_not_image_capable')
  assert.deepEqual((await h.service.imageModels()).models.map((model) => model.id), [MODEL])

  const chamadasAntes = runImage.calls.length
  const fora = harness({ runImage, fetchCatalog: async () => { throw new Error('sem rede') } })
  const result = await fora.service.generate({ prompt: 'x', model: MODEL })
  assert.equal(result.code, 'catalog_unavailable')
  assert.equal(result.message, MESSAGES.catalog_unavailable)
  assert.equal((await fora.service.imageModels()).ok, false)
  assert.equal(runImage.calls.length, chamadasAntes)
})

// ---- Envelope, códigos de saída e vazamento ----------------------------------------------------------------

test('mapFailure: o código de SAÍDA do Openia manda; o error.code é reserva; o resto é falha genérica', () => {
  const porSaida = { 2: 'invalid_request', 3: 'authentication_error', 4: 'model_unavailable', 5: 'limit_error', 6: 'network_error', 124: 'timeout', 130: 'cancelled', 7: 'generation_failed', 8: 'generation_failed', 1: 'generation_failed' }
  for (const [saida, esperado] of Object.entries(porSaida)) assert.equal(mapFailure(Number(saida), 'qualquer'), esperado, `saída ${saida}`)
  assert.equal(mapFailure(undefined, 'missing_key'), 'authentication_error')
  assert.equal(mapFailure(undefined, 'rate_limit'), 'limit_error')
  assert.equal(mapFailure(undefined, 'model_not_found'), 'model_unavailable')
  assert.equal(mapFailure(undefined, 'output_too_large'), 'invalid_output')
  assert.equal(mapFailure(undefined, 'algo-inventado'), 'generation_failed')
  assert.equal(mapFailure(undefined, undefined), 'generation_failed')
})

test('parseEnvelope: só versão 1 com "ok" booleano; lixo e versão desconhecida valem como inválidos', () => {
  assert.equal(parseEnvelope(successEnvelope(['/x/a.png'])).ok, true)
  assert.equal(parseEnvelope(failureEnvelope('missing_key')).ok, false)
  for (const ruim of ['', 'Traceback', '[]', 'null', '"x"', JSON.stringify({ ok: true }), JSON.stringify({ version: 2, ok: true, outputs: [] }), JSON.stringify({ version: 1, ok: 'sim' })]) {
    assert.equal(parseEnvelope(ruim), null, ruim)
  }
})

test('erros do filho viram códigos e mensagens FIXAS: nunca stderr, chave, mensagem do filho nem traceback', async () => {
  const casos = [
    [{ started: true, ok: false, exitCode: 3, stdout: failureEnvelope('missing_key') }, 'authentication_error'],
    [{ started: true, ok: false, exitCode: 3, stdout: failureEnvelope('invalid_key') }, 'authentication_error'],
    [{ started: true, ok: false, exitCode: 5, stdout: failureEnvelope('account_limit') }, 'limit_error'],
    [{ started: true, ok: false, exitCode: 4, stdout: failureEnvelope('model_unsupported') }, 'model_unavailable'],
    [{ started: true, ok: false, exitCode: 6, stdout: failureEnvelope('network_error') }, 'network_error'],
    [{ started: true, ok: false, exitCode: 7, stdout: failureEnvelope('provider_error') }, 'generation_failed'],
    [{ started: true, ok: false, exitCode: 99, stdout: failureEnvelope('algo-inventado') }, 'generation_failed'],
    [{ started: true, ok: false, exitCode: 1, stdout: `Traceback (most recent call last): ${SECRET}` }, 'generation_failed'],
    [{ started: true, ok: true, exitCode: 0, stdout: `Traceback ${SECRET}` }, 'invalid_output'],
    [{ started: true, ok: true, exitCode: 0, stdout: JSON.stringify({ version: 1, ok: true, outputs: 'nao-e-lista' }) }, 'invalid_output'],
    [{ started: true, ok: true, exitCode: 0, stdout: JSON.stringify({ version: 1, ok: true, outputs: [] }) }, 'invalid_output'],
    [{ started: true, ok: true, exitCode: 0, stdout: JSON.stringify({ version: 2, ok: true, outputs: [{ path: '/x/a.png' }] }) }, 'invalid_output'],
    [{ started: false }, 'openia_unavailable'],
  ]
  for (const [resposta, codigo] of casos) {
    const h = harness({ runImage: async () => resposta })
    const result = await h.service.generate({ prompt: 'x', model: MODEL })
    assert.equal(result.ok, false)
    assert.equal(result.code, codigo, JSON.stringify(resposta))
    assert.equal(result.message, MESSAGES[codigo])
    const serializado = JSON.stringify(result)
    assert.equal(serializado.includes(SECRET), false)
    assert.equal(/Traceback/i.test(serializado), false)
    assert.equal(h.notified.length, 0)
  }
})

test('saída inválida do filho invalida tudo: nada gravado, nada anunciado, pasta do pedido limpa', async () => {
  const fora = path.join(tmp(), 'fugiu.png')
  fs.writeFileSync(fora, PNG)
  const outros = [
    child({ files: [['img.png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')]] }),
    child({ files: [['img.png', Buffer.from('isto nao e uma imagem de verdade')]] }),
    child({ files: [['img.png', PNG]], listed: [fora] }), // caminho absoluto fora da pasta do pedido
    child({ files: [['img.png', PNG]], listed: ['nao-existe.png'] }),
    child({ files: [['img.png', PNG]], listed: [{ raw: 'img.png' }] }), // caminho relativo: o envelope só traz absolutos
  ]
  for (const runImage of outros) {
    const h = harness({ runImage })
    const result = await h.service.generate({ prompt: 'x', model: MODEL, requestId: 'req-invalid1' })
    assert.equal(result.code, 'invalid_output')
    assert.equal(h.notified.length, 0)
    assert.equal(fs.existsSync(h.generatedDir) ? fs.readdirSync(h.generatedDir).length : 0, 0)
    assert.equal(fs.existsSync(path.join(h.runsDir, 'req-invalid1')), false)
  }
  assert.equal(fs.existsSync(fora), true, 'o serviço não pode tocar em arquivo fora da pasta do pedido')
})

test('resolveOutputNames: caminho relativo, de pasta vizinha ou de subpasta é recusado; só arquivo DIRETO na pasta vale', async () => {
  const dir = tmp()
  const run = path.join(dir, 'run')
  const vizinha = path.join(dir, 'vizinha')
  fs.mkdirSync(path.join(run, 'sub'), { recursive: true })
  fs.mkdirSync(vizinha)
  assert.deepEqual(await resolveOutputNames(run, [{ path: path.join(run, 'a.png') }]), { ok: true, names: ['a.png'] })
  for (const ruim of [
    [{ path: 'a.png' }],
    [{ path: path.join(vizinha, 'a.png') }],
    [{ path: path.join(run, 'sub', 'a.png') }],
    [{ path: path.join(run, '..', 'vizinha', 'a.png') }],
    [{ path: 42 }],
    [{}],
    [],
  ]) {
    assert.equal((await resolveOutputNames(run, ruim)).ok, false, JSON.stringify(ruim))
  }
  assert.equal((await resolveOutputNames(path.join(dir, 'nao-existe'), [{ path: path.join(run, 'a.png') }])).ok, false)
})

test('arquivos que o filho NÃO listou são ignorados (não é qualquer arquivo da pasta)', async () => {
  const runImage = child({ files: [['ok.png', PNG], ['extra.png', JPEG]], listed: ['ok.png'] })
  const h = harness({ runImage })
  const result = await h.service.generate({ prompt: 'x', model: MODEL })
  assert.equal(result.ok, true)
  assert.equal(result.artifacts.length, 1)
  assert.equal(result.artifacts[0].mimeType, 'image/png')
})

test('o MIME vem dos BYTES, não da extensão nem do "mime" que o filho declarou', async () => {
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
  const runImage = () => new Promise((resolve) => liberar.push(() => resolve({ started: true, ok: false, exitCode: 1, stdout: '' })))
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

test('cancelar: avisa o filho, devolve "cancelled", não grava, não anuncia e limpa pasta e arquivo de cancelamento', async () => {
  let recebeuSinal = false
  const runImage = ({ args, signal }) =>
    new Promise((resolve) => {
      fs.writeFileSync(path.join(args[args.indexOf('--output-dir') + 1], 'parcial.png'), PNG)
      signal.addEventListener('abort', () => {
        recebeuSinal = true
        resolve({ started: true, ok: false, exitCode: 130, stdout: failureEnvelope('cancelled') })
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

test('consultar estado devolve a mesma mensagem fixa do pedido, para a interface se recuperar sem a promessa', async () => {
  // Se a janela recarrega no meio da geração, a resposta de `generate` se perde; a interface
  // reconsulta o estado e precisa mostrar a MESMA mensagem fixa (nunca texto do filho).
  const h = harness({ runImage: child({ stdout: failureEnvelope('rate_limit'), exitCode: 5 }) })
  await h.service.generate({ prompt: 'x', model: MODEL, requestId: 'req-status-erro' })
  const erro = h.service.status({ requestId: 'req-status-erro' })
  assert.equal(erro.state, 'error')
  assert.equal(erro.code, 'limit_error')
  assert.equal(erro.message, MESSAGES.limit_error)
  assert.equal(JSON.stringify(erro).includes(SECRET), false)

  const ok = harness({ runImage: child() })
  await ok.service.generate({ prompt: 'x', model: MODEL, requestId: 'req-status-ok' })
  const sucesso = ok.service.status({ requestId: 'req-status-ok' })
  assert.equal(sucesso.state, 'success')
  assert.equal(sucesso.count, 1)
  assert.equal('message' in sucesso, false)

  assert.deepEqual(ok.service.status({ requestId: 'req-nunca-visto' }), { ok: true, requestId: 'req-nunca-visto', state: 'unknown' })
})

test('estourar o tempo interrompe o filho e devolve "timeout"', async () => {
  const runImage = ({ signal }) =>
    new Promise((resolve) => signal.addEventListener('abort', () => resolve({ started: true, ok: false, exitCode: 130, stdout: '' })))
  const h = harness({ runImage, timeoutMs: 40 })
  const result = await h.service.generate({ prompt: 'x', model: MODEL, requestId: 'req-timeout' })
  assert.equal(result.code, 'timeout')
  assert.equal(result.message, MESSAGES.timeout)
  assert.equal(fs.existsSync(path.join(h.runsDir, 'req-timeout')), false)
})

test('reiniciar preserva a referência gravada e a varredura só apaga pastas e cancelamentos de pedido velhos', async () => {
  const h = harness({ runImage: child() })
  const result = await h.service.generate({ prompt: 'x', model: MODEL })
  const artifactPath = result.artifacts[0].path

  fs.mkdirSync(h.runsDir, { recursive: true })
  const velha = path.join(h.runsDir, 'sobra-de-uma-queda')
  const velhoCancel = path.join(h.runsDir, 'sobra-de-uma-queda.cancel')
  const recente = path.join(h.runsDir, 'pedido-em-curso')
  fs.mkdirSync(velha)
  fs.writeFileSync(velhoCancel, '')
  fs.mkdirSync(recente)
  const ha2Horas = new Date(Date.now() - 2 * 60 * 60_000)
  fs.utimesSync(velha, ha2Horas, ha2Horas)
  fs.utimesSync(velhoCancel, ha2Horas, ha2Horas)

  const reiniciado = createOpeniaImageService({ userData: h.userData, fetchCatalog: catalog(), saveImage: () => ({ ok: false }) })
  assert.deepEqual(await reiniciado.sweepOrphans(), { removed: 2 })
  assert.equal(fs.existsSync(velha), false)
  assert.equal(fs.existsSync(velhoCancel), false)
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
  const lista = await handlers.get('openia:image-models')({})
  assert.deepEqual(lista.models.map((model) => model.id), [MODEL])
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

test('sanitizeArgsForShell troca quebra de linha por espaço (atalho .cmd do Windows passa por cmd.exe)', () => {
  assert.deepEqual(sanitizeArgsForShell(['image', '--prompt=linha 1\r\nlinha 2\nlinha 3', '--json']), ['image', '--prompt=linha 1 linha 2 linha 3', '--json'])
})

// ---- Contrato com um `openia` falso rodando como PROCESSO de verdade -----------------------------------------
// O falso fala os argumentos, o envelope e os códigos de saída REAIS do Openia (image.py, commit 9bb9099).

const FAKE_OPENIA = `
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const argv = process.argv.slice(2)
const value = (flag) => argv[argv.indexOf(flag) + 1]
const promptArg = argv.find((arg) => arg.startsWith('--prompt='))
const prompt = promptArg ? promptArg.slice('--prompt='.length) : ''
const outDir = value('--output-dir')
const cancelFile = value('--cancel-file')
const requestId = value('--request-id')
const runsDir = path.dirname(outDir)
fs.writeFileSync(path.join(runsDir, 'last-argv.json'), JSON.stringify(argv))
const envelope = (extra) => process.stdout.write(JSON.stringify({ version: 1, requestId, ...extra }))

if (prompt.includes('FALHAR')) {
  process.stderr.write('Traceback (most recent call last): Authorization: Bearer ${SECRET}\\n')
  process.exit(1)
}
if (prompt.includes('AUTENTICAR')) {
  envelope({ ok: false, error: { code: 'missing_key', message: '${SECRET}' } })
  process.exit(3)
}
if (prompt.includes('COOPERAR') || prompt.includes('TRAVAR')) {
  const neto = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  fs.writeFileSync(path.join(runsDir, 'neto.pid'), String(neto.pid))
  fs.writeFileSync(path.join(outDir, 'parcial.png'), 'incompleto')
  const cooperar = prompt.includes('COOPERAR')
  setInterval(() => {
    // COOPERAR observa o arquivo de cancelamento como o Openia real; TRAVAR o ignora.
    if (cooperar && fs.existsSync(cancelFile)) {
      try { process.kill(neto.pid) } catch {}
      envelope({ ok: false, error: { code: 'cancelled', message: 'a operação foi cancelada.' } })
      process.exit(130)
    }
  }, 30)
  return
}
const file = path.join(outDir, 'img-1.png')
fs.writeFileSync(file, Buffer.from('${PNG.toString('base64')}', 'base64'))
envelope({ ok: true, model: value('--model'), outputs: [{ path: file, mime: 'image/png', bytes: fs.statSync(file).size }], createdAt: '2026-09-21T00:00:00.000Z', completedAt: '2026-09-21T00:00:01.000Z' })
`

function realProcessHarness({ cooperativeGraceMs = 250, killGraceMs = 250 } = {}) {
  const script = path.join(tmp(), 'fake-openia.cjs')
  fs.writeFileSync(script, FAKE_OPENIA)
  const resolveSpawn = () => ({ executable: process.execPath, env: process.env, needsShell: false, prefixArgs: [script] })
  return harness({
    runImage: (request) => runOpeniaImageProcess({ ...request, resolveSpawn, cooperativeGraceMs, killGraceMs }),
  })
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

async function esperarArquivo(arquivo, ms = 8000) {
  const limite = Date.now() + ms
  while (!fs.existsSync(arquivo) && Date.now() < limite) await new Promise((resolve) => setTimeout(resolve, 30))
  return fs.existsSync(arquivo)
}

test('contrato real: --prompt= com prompt que parece opção, pasta de saída do Felixo, artefato gravado', async () => {
  const h = realProcessHarness()
  const result = await h.service.generate({ prompt: '--um gato astronauta', model: MODEL, requestId: 'req-real-01' })

  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.artifacts.length, 1)
  const argv = JSON.parse(fs.readFileSync(path.join(h.runsDir, 'last-argv.json'), 'utf8'))
  assert.ok(argv.includes('--prompt=--um gato astronauta'))
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

test('contrato real: exit 3 com missing_key vira "authentication_error" sem repetir a mensagem do filho', async () => {
  const h = realProcessHarness()
  const result = await h.service.generate({ prompt: 'AUTENTICAR', model: MODEL, requestId: 'req-real-03' })
  assert.equal(result.code, 'authentication_error')
  assert.equal(result.message, MESSAGES.authentication_error)
  assert.equal(JSON.stringify(result).includes(SECRET), false)
})

test('contrato real: cancelar cria o arquivo de cancelamento e um Openia cooperativo sai sozinho (exit 130) sem esperar o kill', async () => {
  const h = realProcessHarness({ cooperativeGraceMs: 30_000 }) // se o kill fosse necessário, o teste estouraria o tempo
  const pendente = h.service.generate({ prompt: 'COOPERAR até cancelar', model: MODEL, requestId: 'req-real-04' })

  const pidFile = path.join(h.runsDir, 'neto.pid')
  assert.equal(await esperarArquivo(pidFile), true, 'o filho falso não chegou a subir o neto')
  const neto = Number(fs.readFileSync(pidFile, 'utf8'))
  assert.equal(esta_vivo(neto), true)

  const inicio = Date.now()
  assert.equal(h.service.cancel({ requestId: 'req-real-04' }).cancelled, true)
  const result = await pendente
  assert.equal(result.code, 'cancelled')
  assert.ok(Date.now() - inicio < 10_000, 'o cancelamento cooperativo não pode depender do kill')
  assert.equal(await esperarMorrer(neto), true)
  assert.equal(fs.existsSync(path.join(h.runsDir, 'req-real-04')), false)
  assert.equal(fs.existsSync(path.join(h.runsDir, 'req-real-04.cancel')), false)
  assert.equal(h.notified.length, 0)
})

test('contrato real: um Openia que IGNORA o cancelamento é morto, com o neto, e não deixa arquivo órfão', async () => {
  const h = realProcessHarness()
  const pendente = h.service.generate({ prompt: 'TRAVAR para sempre', model: MODEL, requestId: 'req-real-05' })

  const pidFile = path.join(h.runsDir, 'neto.pid')
  assert.equal(await esperarArquivo(pidFile), true, 'o filho falso não chegou a subir o neto')
  const neto = Number(fs.readFileSync(pidFile, 'utf8'))
  assert.equal(esta_vivo(neto), true)

  assert.equal(h.service.cancel({ requestId: 'req-real-05' }).cancelled, true)
  const result = await pendente
  assert.equal(result.code, 'cancelled')
  assert.equal(await esperarMorrer(neto), true, 'o processo neto ficou órfão depois do cancelamento')
  assert.equal(fs.existsSync(path.join(h.runsDir, 'req-real-05')), false)
  assert.equal(h.notified.length, 0)
  assert.equal(fs.existsSync(h.generatedDir) ? fs.readdirSync(h.generatedDir).length : 0, 0)
})

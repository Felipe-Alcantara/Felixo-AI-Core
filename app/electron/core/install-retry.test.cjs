'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  DEFAULT_RETRIES,
  DEFAULT_RETRY_DELAYS_MS,
  abortableSleep,
  isTransientNetworkFailure,
  withNetworkRetry,
} = require('./install-retry.cjs')

// Trechos REAIS, medidos em 22/10/2026 com pip 25.3 (Python 3.14.2) e npm 11.6.2 no
// Windows 11, contra um índice inexistente (`.invalid`), uma porta fechada
// (127.0.0.1:9) e o registry real. Os marcados como "sintético" são o texto
// documentado do npm para um código que não deu para provocar daqui.
const NPM_SEM_DNS = [
  'npm error code ENOTFOUND',
  'npm error syscall getaddrinfo',
  'npm error errno ENOTFOUND',
  'npm error network request to https://felixo-sem-registro.invalid/xyzzy-felixo failed, reason: getaddrinfo ENOTFOUND felixo-sem-registro.invalid',
  'npm error network This is a problem related to network connectivity.',
  'npm error network In most cases you are behind a proxy or have bad network settings.',
].join('\n')

const NPM_PORTA_FECHADA = [
  'npm error     at onSocketNT (node:_http_client:982:5)',
  "npm error   code: 'ECONNREFUSED',",
  "npm error   errno: 'ECONNREFUSED',",
  "npm error   syscall: 'connect',",
  "npm error   address: '127.0.0.1',",
  'npm error   port: 9,',
].join('\n')

const NPM_404 = [
  'npm error code E404',
  'npm error 404 Not Found - GET https://registry.npmjs.org/felixo-pacote-que-nao-existe-9f3a1 - Not found',
  "npm error 404  The requested resource 'felixo-pacote-que-nao-existe-9f3a1@*' could not be found or you do not have permission to access it.",
].join('\n')

const NPM_PERMISSAO = [
  "npm error   syscall: 'mkdir',",
  'npm error The operation was rejected by your operating system.',
  "npm error It's possible that the file was already in use (by a text editor or antivirus),",
  'npm error or that you lack permissions to access it.',
].join('\n')

const NPM_503_SINTETICO = [
  'npm error code E503',
  'npm error 503 Service Unavailable - GET https://registry.npmjs.org/@openai%2fcodex',
].join('\n')

const NPM_INTEGRIDADE_SINTETICO = [
  'npm error code EINTEGRITY',
  'npm error sha512-abc+E503/def== integrity checksum failed when using sha512',
].join('\n')

const PIP_ZIP_SEM_DNS = [
  'Collecting https://felixo-sem-registro.invalid/Openia.zip',
  '  WARNING: Retrying (Retry(total=1, connect=None, read=None, redirect=None, status=None)) after connection broken by',
  "'NewConnectionError('<pip._vendor.urllib3.connection.HTTPSConnection object at 0x000001A15ED7FA10>: Failed to",
  "establish a new connection: [Errno 11001] getaddrinfo failed')': /Openia.zip",
  "ERROR: Could not install packages due to an OSError: HTTPSConnectionPool(host='felixo-sem-registro.invalid', port=443): Max retries exceeded with url: /Openia.zip",
].join('\n')

/** O índice indisponível NÃO diz "rede" no erro final; o sinal são os avisos de tentativa. */
const PIP_INDICE_PORTA_FECHADA = [
  'Looking in indexes: http://127.0.0.1:9/simple/',
  "WARNING: Retrying (Retry(total=1, connect=None, read=None, redirect=None, status=None)) after connection broken by 'ConnectTimeoutError(<pip._vendor.urllib3.connection.HTTPConnection object at 0x0000021558994980>, 'Connection to 127.0.0.1 timed out. (connect timeout=2.0)')': /simple/xyzzy-felixo/",
  'ERROR: Could not find a version that satisfies the requirement xyzzy-felixo (from versions: none)',
  'ERROR: No matching distribution found for xyzzy-felixo',
].join('\n')

/** O mesmo erro final, mas sem aviso de tentativa: o pacote realmente não existe. */
const PIP_PACOTE_INEXISTENTE = [
  'ERROR: Could not find a version that satisfies the requirement felixo-pacote-que-nao-existe-9f3a1 (from versions: none)',
  'ERROR: No matching distribution found for felixo-pacote-que-nao-existe-9f3a1',
].join('\n')

const PIP_404 = [
  'Collecting https://github.com/Felipe-Alcantara/Openia/archive/0000000000.zip',
  '  ERROR: HTTP error 404 while getting https://github.com/Felipe-Alcantara/Openia/archive/0000000000.zip',
  'ERROR: Could not install requirement https://github.com/Felipe-Alcantara/Openia/archive/0000000000.zip because of HTTP error 404 Client Error: Not Found for url: https://codeload.github.com/Felipe-Alcantara/Openia/zip/0000000000',
].join('\n')

const PIP_PERMISSAO = [
  '  File "C:\\Python314\\Lib\\site-packages\\pip\\_internal\\utils\\misc.py", line 99, in ensure_dir',
  'PermissionError: [WinError 5] Acesso negado: \'C:\\\\Users\\\\x\\\\Temp\\\\felixo-acl\\\\pacotes\'',
].join('\n')

const falha = (extra) => ({ ok: false, message: 'Nao foi possivel instalar.', ...extra })

describe('isTransientNetworkFailure', () => {
  const REDE = [
    ['npm sem DNS (ENOTFOUND)', NPM_SEM_DNS],
    ['npm porta fechada (ECONNREFUSED)', NPM_PORTA_FECHADA],
    ['npm 503 (sintético)', NPM_503_SINTETICO],
    ['pip zip sem DNS', PIP_ZIP_SEM_DNS],
    ['pip índice indisponível (só os avisos de tentativa)', PIP_INDICE_PORTA_FECHADA],
  ]

  for (const [nome, saida] of REDE) {
    it(`repete: ${nome}`, () => {
      assert.equal(isTransientNetworkFailure(falha({ output: saida })), true)
    })
  }

  const OUTRAS = [
    ['npm 404 no registry', NPM_404],
    ['npm recusado pelo sistema (permissão)', NPM_PERMISSAO],
    ['npm EINTEGRITY (o hash cita E503 por acaso)', NPM_INTEGRIDADE_SINTETICO],
    ['pip 404 em arquivo inexistente', PIP_404],
    ['pip pacote que não existe (sem aviso de rede)', PIP_PACOTE_INEXISTENTE],
    ['pip sem permissão (PermissionError em pt-BR)', PIP_PERMISSAO],
    ['saída vazia', ''],
  ]

  for (const [nome, saida] of OUTRAS) {
    it(`não repete: ${nome}`, () => {
      assert.equal(isTransientNetworkFailure(falha({ output: saida })), false)
    })
  }

  it('lê o texto de qualquer campo do resultado (output, stdout, stderr, message)', () => {
    for (const campo of ['output', 'stdout', 'stderr', 'message']) {
      assert.equal(isTransientNetworkFailure({ ok: false, [campo]: NPM_SEM_DNS }), true, campo)
    }
  })

  it('nunca repete sucesso, cancelamento, prazo vencido nem executável que não abriu', () => {
    assert.equal(isTransientNetworkFailure({ ok: true, output: NPM_SEM_DNS }), false)
    assert.equal(isTransientNetworkFailure(falha({ cancelled: true, output: NPM_SEM_DNS })), false)
    assert.equal(isTransientNetworkFailure(falha({ timedOut: true, output: NPM_SEM_DNS })), false)
    assert.equal(isTransientNetworkFailure(falha({ errorCode: 'ENOENT', message: 'spawn py ENOENT' })), false)
    assert.equal(isTransientNetworkFailure(falha({ errorCode: 'EACCES', message: 'spawn EACCES' })), false)
    assert.equal(isTransientNetworkFailure(null), false)
    assert.equal(isTransientNetworkFailure(undefined), false)
  })

  it('proxy, certificado e a palavra "network" soltos não bastam (isso é diagnóstico, não rede passageira)', () => {
    assert.equal(isTransientNetworkFailure(falha({ output: 'unable to get local issuer certificate' })), false)
    assert.equal(isTransientNetworkFailure(falha({ output: 'self-signed certificate in certificate chain' })), false)
    assert.equal(isTransientNetworkFailure(falha({ output: 'check your proxy and network settings' })), false)
  })
})

describe('withNetworkRetry', () => {
  /** Respostas em ordem; a última se repete se faltar. */
  function scripted(respostas) {
    const chamadas = []
    const attempt = async () => {
      chamadas.push(Date.now())
      return respostas[Math.min(chamadas.length - 1, respostas.length - 1)]
    }
    return { attempt, chamadas }
  }

  const REDE = falha({ output: NPM_SEM_DNS })
  const OK = { ok: true, message: 'instalado' }

  it('sem falha, roda uma vez e não espera', async () => {
    const { attempt, chamadas } = scripted([OK])
    const esperas = []
    const resultado = await withNetworkRetry(attempt, { sleep: async (ms) => esperas.push(ms) })

    assert.equal(chamadas.length, 1)
    assert.deepEqual(esperas, [])
    assert.equal(resultado.ok, true)
    assert.equal(resultado.networkRetries, 0)
  })

  it('repete a falha de rede com a espera de cada vez e termina em sucesso', async () => {
    const { attempt, chamadas } = scripted([REDE, REDE, OK])
    const esperas = []
    const avisos = []
    const resultado = await withNetworkRetry(attempt, {
      sleep: async (ms) => esperas.push(ms),
      onRetry: ({ retry, retries, delayMs }) => avisos.push([retry, retries, delayMs]),
    })

    assert.equal(chamadas.length, 3)
    assert.deepEqual(esperas, [...DEFAULT_RETRY_DELAYS_MS])
    assert.deepEqual(avisos, [
      [1, DEFAULT_RETRIES, DEFAULT_RETRY_DELAYS_MS[0]],
      [2, DEFAULT_RETRIES, DEFAULT_RETRY_DELAYS_MS[1]],
    ])
    assert.equal(resultado.ok, true)
    assert.equal(resultado.networkRetries, 2)
  })

  it('desiste depois das novas tentativas e a mensagem diz quantas vezes a rede falhou', async () => {
    const { attempt, chamadas } = scripted([REDE])
    const resultado = await withNetworkRetry(attempt, { sleep: async () => {} })

    assert.equal(chamadas.length, 1 + DEFAULT_RETRIES)
    assert.equal(resultado.ok, false)
    assert.equal(resultado.networkRetries, DEFAULT_RETRIES)
    assert.match(resultado.message, /A rede falhou nas 3 tentativas\.$/)
    assert.equal(resultado.output, NPM_SEM_DNS, 'a saída original continua intacta')
  })

  it('não repete o que a rede não explica', async () => {
    for (const saida of [NPM_404, PIP_404, NPM_PERMISSAO, PIP_PERMISSAO, PIP_PACOTE_INEXISTENTE]) {
      const { attempt, chamadas } = scripted([falha({ output: saida })])
      const resultado = await withNetworkRetry(attempt, { sleep: async () => assert.fail('não deveria esperar') })

      assert.equal(chamadas.length, 1)
      assert.equal(resultado.networkRetries, 0)
      assert.doesNotMatch(resultado.message, /A rede falhou/)
    }
  })

  it('não repete o prazo vencido, mesmo que a saída parcial cite a rede', async () => {
    const { attempt, chamadas } = scripted([falha({ timedOut: true, output: NPM_SEM_DNS })])
    await withNetworkRetry(attempt, { sleep: async () => assert.fail('não deveria esperar') })

    assert.equal(chamadas.length, 1)
  })

  it('respeita retries e delaysMs informados; com menos esperas que tentativas, repete a última', async () => {
    const { attempt, chamadas } = scripted([REDE])
    const esperas = []
    await withNetworkRetry(attempt, { retries: 3, delaysMs: [5, 8], sleep: async (ms) => esperas.push(ms) })

    assert.equal(chamadas.length, 4)
    assert.deepEqual(esperas, [5, 8, 8])
  })

  it('retries: 0 desliga a repetição', async () => {
    const { attempt, chamadas } = scripted([REDE])
    const resultado = await withNetworkRetry(attempt, { retries: 0, sleep: async () => assert.fail('não deveria esperar') })

    assert.equal(chamadas.length, 1)
    assert.equal(resultado.ok, false)
  })

  it('cancelar durante a espera interrompe a repetição e devolve cancelled', async () => {
    const controlador = new AbortController()
    const { attempt, chamadas } = scripted([REDE, OK])
    const resultado = await withNetworkRetry(attempt, {
      signal: controlador.signal,
      sleep: async () => controlador.abort(),
    })

    assert.equal(chamadas.length, 1, 'não tenta de novo depois de cancelado')
    assert.equal(resultado.ok, false)
    assert.equal(resultado.cancelled, true)
    assert.match(resultado.message, /cancelada antes da nova tentativa/)
  })

  it('um resultado já cancelado pela própria tentativa não é repetido', async () => {
    const { attempt, chamadas } = scripted([falha({ cancelled: true, output: NPM_SEM_DNS })])
    await withNetworkRetry(attempt, { sleep: async () => assert.fail('não deveria esperar') })

    assert.equal(chamadas.length, 1)
  })
})

describe('abortableSleep', () => {
  it('espera o tempo pedido', async () => {
    const inicio = Date.now()
    await abortableSleep(60)

    assert.ok(Date.now() - inicio >= 50)
  })

  it('acorda na hora quando o sinal é abortado, sem esperar o resto', async () => {
    const controlador = new AbortController()
    const inicio = Date.now()
    const espera = abortableSleep(5_000, controlador.signal)
    controlador.abort()
    await espera

    assert.ok(Date.now() - inicio < 1_000)
  })

  it('com o sinal já abortado, nem espera', async () => {
    const controlador = new AbortController()
    controlador.abort()
    const inicio = Date.now()
    await abortableSleep(5_000, controlador.signal)

    assert.ok(Date.now() - inicio < 1_000)
  })
})

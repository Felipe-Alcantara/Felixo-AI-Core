'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { CANDIDATES, PYTHON_DOWNLOAD_URL, REASONS, resolvePythonRuntime } = require('./python-runtime.cjs')

// Respostas REAIS medidas em 22/10/2026 no Windows 11 com Python 3.14.2 e pip 25.3.
const PIP_3_14 = { ok: true, stdout: 'pip 25.3 from C:\\Python314\\Lib\\site-packages\\pip (python 3.14)\r\n', stderr: '' }
const PIP_3_9 = { ok: true, stdout: 'pip 23.0.1 from /usr/lib/python3/dist-packages/pip (python 3.9)\n', stderr: '' }
const PYTHON_3_12 = { ok: true, stdout: 'Python 3.12.3\n', stderr: '' }
const SEM_PIP = { ok: false, stdout: '', stderr: '/usr/bin/python3: No module named pip\n' }
/** O `python.exe` da Microsoft Store sem Python instalado: sai com 9009 e fala da loja. */
const ATALHO_DA_LOJA = {
  ok: false,
  stdout: '',
  stderr: 'Python was not found; run without arguments to install from the Microsoft Store, or disable this shortcut from Settings > Manage App Execution Aliases.\n',
}
const NAO_EXISTE = { ok: false, stdout: '', stderr: '', errorCode: 'ENOENT' }

/**
 * Executor que responde pelo comando e pelos argumentos, e registra cada pergunta.
 * Pergunta sem resposta combinada vira "não existe", como um executável ausente.
 */
function respostas(tabela) {
  const perguntas = []
  const runCommand = async ({ command, args }) => {
    const chave = `${command} ${args.join(' ')}`
    perguntas.push(chave)
    return tabela[chave] ?? NAO_EXISTE
  }
  return { runCommand, perguntas }
}

const resolver = (opcoes) => resolvePythonRuntime({ minVersion: '3.10', label: 'o Openia', ...opcoes })

describe('resolvePythonRuntime', () => {
  it('no Windows prefere o launcher `py` e devolve a versão do Python que ele escolheu', async () => {
    const { runCommand, perguntas } = respostas({ 'py -m pip --version': PIP_3_14 })
    const resultado = await resolver({ platformName: 'win32', runCommand })

    assert.deepEqual(resultado, { ok: true, command: 'py', version: '3.14' })
    assert.deepEqual(perguntas, ['py -m pip --version'], 'achou de primeira: não pergunta pelos outros')
  })

  it('fora do Windows prefere `python3`', async () => {
    const { runCommand, perguntas } = respostas({ 'python3 -m pip --version': PIP_3_14 })
    const resultado = await resolver({ platformName: 'linux', runCommand })

    assert.equal(resultado.command, 'python3')
    assert.deepEqual(perguntas, ['python3 -m pip --version'])
  })

  it('no Windows sem o launcher `py` (Python instalado sem ele) cai para `python`', async () => {
    const { runCommand, perguntas } = respostas({ 'python -m pip --version': PIP_3_14 })
    const resultado = await resolver({ platformName: 'win32', runCommand })

    assert.equal(resultado.ok, true)
    assert.equal(resultado.command, 'python')
    assert.equal(perguntas[0], 'py -m pip --version', 'o `py` foi tentado primeiro')
  })

  it('pula o atalho da Microsoft Store: ele sai com erro e não é um Python', async () => {
    const { runCommand } = respostas({
      'python -m pip --version': ATALHO_DA_LOJA,
      'python --version': ATALHO_DA_LOJA,
      'python3 -m pip --version': PIP_3_14,
    })
    const resultado = await resolver({ platformName: 'win32', runCommand })

    assert.equal(resultado.ok, true)
    assert.equal(resultado.command, 'python3')
  })

  it('um Python antigo demais é recusado e o próximo candidato que serve é usado', async () => {
    const { runCommand } = respostas({
      'python3 -m pip --version': PIP_3_9,
      'python -m pip --version': PIP_3_14,
    })
    const resultado = await resolver({ platformName: 'linux', runCommand })

    assert.deepEqual(resultado, { ok: true, command: 'python', version: '3.14' })
  })

  it('só Python antigo: diz a versão achada e a exigida, e aponta onde baixar', async () => {
    const { runCommand } = respostas({ 'python3 -m pip --version': PIP_3_9 })
    const resultado = await resolver({ platformName: 'linux', runCommand })

    assert.equal(resultado.ok, false)
    assert.equal(resultado.reason, REASONS.TOO_OLD)
    assert.deepEqual(resultado.found, { command: 'python3', version: '3.9' })
    assert.match(resultado.message, /3\.9/)
    assert.match(resultado.message, /3\.10/)
    assert.match(resultado.message, /o Openia/)
    assert.ok(resultado.message.includes(PYTHON_DOWNLOAD_URL))
  })

  it('Python recente sem o pip: explica o pip (apt no Debian e Ubuntu), não o Python', async () => {
    const { runCommand } = respostas({
      'python3 -m pip --version': SEM_PIP,
      'python3 --version': PYTHON_3_12,
    })
    const resultado = await resolver({ platformName: 'linux', runCommand })

    assert.equal(resultado.ok, false)
    assert.equal(resultado.reason, REASONS.NO_PIP)
    assert.deepEqual(resultado.found, { command: 'python3', version: '3.12' })
    assert.match(resultado.message, /sem o pip/)
    assert.match(resultado.message, /apt install python3-pip/)
  })

  it('sem pip num Python novo explica mais do que um Python velho: a mensagem fala do pip', async () => {
    const { runCommand } = respostas({
      'python3 -m pip --version': PIP_3_9,
      'python -m pip --version': SEM_PIP,
      'python --version': PYTHON_3_12,
    })
    const resultado = await resolver({ platformName: 'linux', runCommand })

    assert.equal(resultado.reason, REASONS.NO_PIP)
  })

  it('nenhum Python: diz que não foi encontrado e onde instalar', async () => {
    const { runCommand, perguntas } = respostas({})
    const resultado = await resolver({ platformName: 'win32', runCommand })

    assert.equal(resultado.ok, false)
    assert.equal(resultado.reason, REASONS.NOT_FOUND)
    assert.equal(resultado.found, undefined)
    assert.match(resultado.message, /não foi encontrado/)
    assert.match(resultado.message, /3\.10/)
    assert.ok(resultado.message.includes(PYTHON_DOWNLOAD_URL))
    assert.match(resultado.message, /launcher "py"/, 'no Windows a mensagem lembra do launcher')
    // Cada candidato foi perguntado do jeito completo e do jeito simples.
    for (const comando of CANDIDATES.win32) {
      assert.ok(perguntas.includes(`${comando} -m pip --version`), comando)
      assert.ok(perguntas.includes(`${comando} --version`), comando)
    }
  })

  it('fora do Windows a mensagem de Python ausente não fala do launcher `py`', async () => {
    const { runCommand } = respostas({})
    const resultado = await resolver({ platformName: 'darwin', runCommand })

    assert.equal(resultado.reason, REASONS.NOT_FOUND)
    assert.doesNotMatch(resultado.message, /launcher/)
  })

  it('o Python 2 imprime a versão no stderr e, mesmo achado, é recusado', async () => {
    const { runCommand } = respostas({
      'python -m pip --version': SEM_PIP,
      'python --version': { ok: true, stdout: '', stderr: 'Python 2.7.18\n' },
    })
    const resultado = await resolver({ platformName: 'linux', runCommand })

    assert.equal(resultado.reason, REASONS.TOO_OLD)
    assert.deepEqual(resultado.found, { command: 'python', version: '2.7' })
  })

  it('um executor que lança é tratado como candidato ausente, sem derrubar a instalação', async () => {
    const resultado = await resolver({
      platformName: 'linux',
      runCommand: async () => {
        throw new Error('spawn travou')
      },
    })

    assert.equal(resultado.ok, false)
    assert.equal(resultado.reason, REASONS.NOT_FOUND)
  })

  it('cada pergunta leva prazo, ambiente e sinal para o executor', async () => {
    const recebidas = []
    const controlador = new AbortController()
    await resolver({
      platformName: 'linux',
      env: { PATH: '/bin' },
      signal: controlador.signal,
      runCommand: async (opcoes) => {
        recebidas.push(opcoes)
        return PIP_3_14
      },
    })

    assert.equal(recebidas.length, 1)
    assert.ok(recebidas[0].timeoutMs > 0)
    assert.deepEqual(recebidas[0].env, { PATH: '/bin' })
    assert.equal(recebidas[0].signal, controlador.signal)
  })

  it('com o sinal já abortado, não pergunta a ninguém', async () => {
    const controlador = new AbortController()
    controlador.abort()
    const { runCommand, perguntas } = respostas({ 'python3 -m pip --version': PIP_3_14 })
    const resultado = await resolver({ platformName: 'linux', runCommand, signal: controlador.signal })

    assert.deepEqual(perguntas, [])
    assert.equal(resultado.ok, false)
  })

  it('sem versão mínima, qualquer Python 3 com pip serve', async () => {
    const { runCommand } = respostas({ 'python3 -m pip --version': PIP_3_9 })
    const resultado = await resolvePythonRuntime({ platformName: 'linux', runCommand })

    assert.equal(resultado.ok, true)
  })
})

'use strict'

/**
 * Integração da fila com uma PTY nativa, executada pelo runner do próprio SO.
 *
 * Os testes de unidade usam um `escrever` falso — eles provam fatiamento,
 * ordem e dreno, mas não provam que o texto atravessa o buffer da PTY. Este
 * arquivo passa pelo `PtyProcessManager` e pelo `node-pty` reais, inicia o
 * Node por meio do launch spec da plataforma e confere o arquivo que o
 * processo filho recebeu.
 *
 * O mesmo teste é executado na matriz Linux, macOS e Windows. No Windows o
 * comando explícito passa pelo `cmd.exe`/ConPTY; no macOS passa pelo shell de
 * login; no Linux roda diretamente. Não há `skip` por plataforma: um runner
 * incompatível precisa falhar com a causa visível no log do CI.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const platform = require('../core/platform/index.cjs')
const { PtyProcessManager } = require('./pty-process-manager.cjs')

const TEMPO_LIMITE_MS = 15_000
// A console do Windows confirma Ctrl-Z com Enter; POSIX produz EOF com
// Ctrl-D quando a linha anterior já foi finalizada.
const FIM_DE_ENTRADA = process.platform === 'win32' ? '\u001a\r' : '\u0004'

/** Payload realista: tamanho de um prompt inicial grande, com acento e emoji. */
function textoGrande(linhas = 700) {
  const corpo = Array.from(
    { length: linhas },
    (_, indice) =>
      `linha ${indice} — padrão de qualidade 🔥 contexto do canvas e identidade do agente`,
  )
  return `${corpo.join('\n')}\n`
}

/**
 * Cria no diretório temporário um processo que coleta stdin e termina quando o
 * terminal entrega EOF. O controle é aceito como fallback porque ConPTY pode
 * repassá-lo como caractere em vez de transformar a tecla em `end`.
 */
function criarColetorDeEntrada(diretorio) {
  const script = path.join(diretorio, 'coletor-pty.cjs')
  fs.writeFileSync(
    script,
    String.raw`'use strict'

const fs = require('node:fs')

const destino = process.argv[2]
let entrada = ''
let finalizado = false

function finalizar() {
  if (finalizado) return
  finalizado = true
  fs.writeFileSync(destino, entrada, 'utf8')
  process.stdin.pause()
  setImmediate(() => process.exit(0))
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', (dados) => {
  const texto = String(dados)
  const recebeuFim = texto.includes('\u0004') || texto.includes('\u001a')
  entrada += texto.replace(/[\u0004\u001a]/g, '')
  if (recebeuFim) finalizar()
})
process.stdin.on('end', finalizar)
process.stdin.resume()
`,
    'utf8',
  )
  return script
}

function conferirRunnerNativo() {
  assert.ok(
    ['linux', 'darwin', 'win32'].includes(process.platform),
    `[PTY nativa] runner incompatível: ${process.platform}; esperado Linux, macOS ou Windows`,
  )

  if (process.platform === 'win32') {
    const shell = process.env.ComSpec || process.env.COMSPEC
    assert.ok(
      shell,
      '[PTY nativa] Windows sem ComSpec/COMSPEC; não é possível validar cmd.exe/ConPTY',
    )
    assert.ok(
      fs.existsSync(shell),
      `[PTY nativa] shell do Windows não encontrado: ${shell}`,
    )
    return
  }

  if (process.platform === 'darwin') {
    const shell = platform.getDefaultShell(process.env)
    assert.ok(
      shell,
      '[PTY nativa] macOS sem shell padrão; não é possível validar o launch spec',
    )
    assert.ok(
      fs.existsSync(shell),
      `[PTY nativa] shell do macOS não encontrado: ${shell}`,
    )
  }
}

function esperarSaida(saida, identificador) {
  let timer
  const limite = new Promise((_, rejeitar) => {
    timer = setTimeout(() => {
      rejeitar(
        new Error(
          `[PTY nativa] ${identificador} não encerrou em ${TEMPO_LIMITE_MS} ms ` +
            `no runner ${process.platform}`,
        ),
      )
    }, TEMPO_LIMITE_MS)
  })

  return Promise.race([saida, limite]).finally(() => clearTimeout(timer))
}

async function removerDiretorioTemporario(diretorio) {
  const errosRepetiveis = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY'])
  const tentativas = process.platform === 'win32' ? 20 : 1

  for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
    try {
      fs.rmSync(diretorio, { recursive: true, force: true })
      return
    } catch (error) {
      const podeTentarDeNovo =
        process.platform === 'win32' &&
        errosRepetiveis.has(error?.code) &&
        tentativa < tentativas - 1
      if (!podeTentarDeNovo) throw error
      await new Promise((resolver) => setTimeout(resolver, 100))
    }
  }
}

async function executarColeta({ nomeSessao, payload, depois }) {
  conferirRunnerNativo()
  const diretorio = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-pty-native-'))
  const destino = path.join(diretorio, 'recebido.txt')
  const coletor = criarColetorDeEntrada(diretorio)
  const manager = new PtyProcessManager()
  let resolverSaida
  const encerrou = new Promise((resolver) => {
    resolverSaida = resolver
  })

  try {
    try {
      manager.spawn(nomeSessao, {
        command: process.execPath,
        args: [coletor, destino],
        cwd: diretorio,
        cols: 120,
        rows: 30,
        onExit: resolverSaida,
      })
    } catch (error) {
      const detalhe = error instanceof Error ? error.message : String(error)
      throw new Error(
        `[PTY nativa] fixture incompatível no ${process.platform}: ${detalhe}`,
        { cause: error },
      )
    }

    assert.equal(manager.write(nomeSessao, payload), true)
    if (depois) {
      assert.equal(manager.write(nomeSessao, depois), true)
    }

    // EOF só pode sair depois do dreno. Caso contrário ele pode ser processado
    // antes do último bloco e o processo filho encerra com a carga truncada.
    await manager.aguardarEscritas(nomeSessao)
    assert.equal(manager.write(nomeSessao, FIM_DE_ENTRADA), true)

    const evento = await esperarSaida(encerrou, nomeSessao)
    assert.equal(
      evento?.exitCode,
      0,
      `[PTY nativa] processo coletor encerrou com código ${evento?.exitCode}`,
    )

    return fs.readFileSync(destino, 'utf8')
  } finally {
    manager.kill(nomeSessao, { force: true })
    await removerDiretorioTemporario(diretorio)
  }
}

function normalizarQuebras(texto) {
  return String(texto).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

test('runner expõe shell compatível com a fixture de PTY nativa', () => {
  conferirRunnerNativo()
})

test('payload grande chega inteiro e o marcador posterior preserva a ordem', async () => {
  const payload = textoGrande()
  const marcador = '__FELIXO_DEPOIS_DA_CARGA__\n'
  const recebido = await executarColeta({
    nomeSessao: 'teste-pty-carga-grande',
    payload,
    depois: marcador,
  })

  assert.equal(
    normalizarQuebras(recebido),
    payload + marcador,
    'a PTY não pode perder a carga nem deixar a escrita posterior passar na frente',
  )
})

test('emoji não é partido ao atravessar a PTY nativa', async () => {
  const payload = `${Array.from(
    { length: 120 },
    () => '🔥👍🚀'.repeat(10),
  ).join('\n')}\n`
  const recebido = await executarColeta({
    nomeSessao: 'teste-pty-emoji',
    payload,
  })

  const normalizado = normalizarQuebras(recebido)
  assert.equal(normalizado, payload)
  assert.ok(!normalizado.includes('�'), 'apareceu caractere de substituição')
})

test('linha grande com quebra chega intacta nos três terminais nativos', async () => {
  // Mantém a linha abaixo dos limites canônicos conhecidos de POSIX e do
  // ConPTY. A fronteira de uma linha sem quebra é do terminal, não da fila;
  // prompts reais usam quebras e precisam desta garantia uniforme.
  const payload = `${'a'.repeat(700)}\n`
  const recebido = await executarColeta({
    nomeSessao: 'teste-pty-linha-delimitada',
    payload,
  })

  assert.equal(normalizarQuebras(recebido), payload)
})

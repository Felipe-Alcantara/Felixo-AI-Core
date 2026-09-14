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
const { after, test } = require('node:test')

const platform = require('../core/platform/index.cjs')
const { PtyProcessManager } = require('./pty-process-manager.cjs')

/**
 * No Windows, `WindowsPtyAgent.kill()` do node-pty bifurca um processo auxiliar
 * (`conpty_console_list_agent.js`) para listar o console do shell antes de
 * encerrá-lo. Esse auxiliar chama `AttachConsole`, que falha em runners sem
 * sessão de console herdável — é o caso do GitHub Actions `windows-latest`
 * (medido no run 34185205675: 4/5 subtestes passaram, o 5º abortou com
 * `AttachConsole failed` em `conpty_console_list_agent.js:13`). Máquinas com
 * desktop interativo não têm esse limite; por isso o teste passa localmente.
 *
 * A falha nasce dentro do processo bifurcado e chega até aqui como exceção
 * não tratada (o node-pty não registra um listener de erro nesse canal IPC).
 * Não há como evitar o fork sem trocar o backend do ConPTY — e a troca para
 * o modo DLL foi tentada e revertida: ela evita o `AttachConsole`, mas o
 * `kill()` correspondente só libera o handle do conout ao receber mais dados
 * dele, o que nunca acontece após a saída do processo, e prendeu o job do CI
 * (run 34817554283, cancelado depois de mais de 50 min sem terminar).
 *
 * A estratégia adotada é isolar só esta falha conhecida, pelo texto exato do
 * erro, sem abafar nenhuma outra exceção — uma falha real de leitura/escrita
 * da PTY continua derrubando o teste normalmente.
 */
const PADRAO_FALHA_CONSOLE_LIST_AGENT = /AttachConsole|conpty_console_list_agent/i

function instalarGuardaDeConsoleListAgent() {
  if (process.platform !== 'win32') return () => {}

  const tratar = (erro) => {
    const mensagem = erro instanceof Error ? `${erro.message}\n${erro.stack || ''}` : String(erro)
    if (!PADRAO_FALHA_CONSOLE_LIST_AGENT.test(mensagem)) throw erro
    console.warn(
      '[PTY nativa] ignorando falha conhecida do auxiliar conpty_console_list_agent ' +
        '(AttachConsole) — limitação do runner Windows sem sessão de console, não uma ' +
        'regressão de leitura/escrita da PTY.',
    )
  }

  process.on('uncaughtException', tratar)
  process.on('unhandledRejection', tratar)
  return () => {
    process.off('uncaughtException', tratar)
    process.off('unhandledRejection', tratar)
  }
}

const removerGuardaDeConsoleListAgent = instalarGuardaDeConsoleListAgent()
after(removerGuardaDeConsoleListAgent)

const TEMPO_LIMITE_MS = 15_000
// No Windows a fixture entra em modo raw para Ctrl-Z chegar como caractere,
// sem depender da disciplina de linha do console ConPTY. O marcador textual
// vem logo depois como fallback para versões do console que consomem Ctrl-Z;
// POSIX mantém Ctrl-D no modo canônico, que é o EOF nativo esperado pelo shell.
const MARCADOR_DE_EOF_WINDOWS = '__FELIXO_EOF__'
const MARCADOR_DE_PRONTO = '__FELIXO_PRONTO__'
const FIM_DE_ENTRADA =
  process.platform === 'win32'
    ? `\u001a\r${MARCADOR_DE_EOF_WINDOWS}\r`
    : '\u0004'

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
const MARCADOR_DE_EOF_WINDOWS = '__FELIXO_EOF__'
const MARCADOR_DE_PRONTO = '__FELIXO_PRONTO__'
let entrada = ''
let finalizado = false

function finalizar() {
  if (finalizado) return
  finalizado = true
  // Ctrl-Z/Enter pode deixar CRs de confirmação no buffer do ConPTY. Eles
  // pertencem ao protocolo de término, não à carga que estamos conferindo.
  const conteudo =
    process.platform === 'win32' ? entrada.replace(/\r+$/g, '') : entrada
  fs.writeFileSync(destino, conteudo, 'utf8')
  if (
    process.platform === 'win32' &&
    process.stdin.isTTY &&
    typeof process.stdin.setRawMode === 'function'
  ) {
    process.stdin.setRawMode(false)
  }
  process.stdin.pause()
  setImmediate(() => process.exit(0))
}

if (
  process.platform === 'win32' &&
  process.stdin.isTTY &&
  typeof process.stdin.setRawMode === 'function'
) {
  process.stdin.setRawMode(true)
}
// Anuncia prontidao ANTES de escutar. No Windows isto nao e cosmetico: o
// ConPTY so passa a entregar stdin a um filho depois que esse filho escreve
// no console. Um coletor silencioso — que so grava em arquivo — nunca
// recebia nada e a sessao ficava pendurada ate o timeout. Shells e CLIs de
// verdade nao sofrem disso porque imprimem prompt ou banner na largada, o
// que e exatamente por que o app funciona e so esta fixture quebrava.
// Em POSIX a escrita e inofensiva: o teste confere o arquivo, nao a saida.
process.stdout.write(MARCADOR_DE_PRONTO + String.fromCharCode(13, 10))
process.stdin.setEncoding('utf8')
process.stdin.on('data', (dados) => {
  const texto = String(dados)
  const recebeuFim =
    texto.includes('\u0004') ||
    texto.includes('\u001a') ||
    texto.includes(MARCADOR_DE_EOF_WINDOWS)
  entrada += texto.replace(/[\u0004\u001a]/g, '').replaceAll(MARCADOR_DE_EOF_WINDOWS, '')
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

/**
 * Espera o coletor anunciar que ja escreveu no console e esta escutando.
 *
 * Um timeout aqui e diagnostico, nao ruido: significa que o filho nasceu mas
 * nunca chegou a escutar, que e um defeito diferente de "recebeu a carga
 * errada" e merece uma mensagem propria.
 */
function esperarProntidao(pronto, identificador) {
  let timer
  const limite = new Promise((_, rejeitar) => {
    timer = setTimeout(() => {
      rejeitar(
        new Error(
          `[PTY nativa] ${identificador} nao sinalizou prontidao em ${TEMPO_LIMITE_MS} ms ` +
            `no runner ${process.platform}`,
        ),
      )
    }, TEMPO_LIMITE_MS)
  })

  return Promise.race([pronto, limite]).finally(() => clearTimeout(timer))
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
  // O coletor avisa que ja escreveu no console e esta escutando. Esperar por
  // esse aviso, em vez de escrever logo apos o spawn, elimina a corrida de
  // inicializacao: no Windows o ConPTY so entrega stdin a um filho depois que
  // ele produz saida, e escrever antes disso faz a carga se perder.
  let resolverPronto
  const pronto = new Promise((resolver) => {
    resolverPronto = resolver
  })
  let saidaAcumulada = ''

  try {
    try {
      manager.spawn(nomeSessao, {
        command: process.execPath,
        args: [coletor, destino],
        cwd: diretorio,
        cols: 120,
        rows: 30,
        onExit: resolverSaida,
        onData: (dados) => {
          saidaAcumulada += String(dados)
          if (saidaAcumulada.includes(MARCADOR_DE_PRONTO)) resolverPronto()
        },
      })
    } catch (error) {
      const detalhe = error instanceof Error ? error.message : String(error)
      throw new Error(
        `[PTY nativa] fixture incompatível no ${process.platform}: ${detalhe}`,
        { cause: error },
      )
    }

    await esperarProntidao(pronto, nomeSessao)
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

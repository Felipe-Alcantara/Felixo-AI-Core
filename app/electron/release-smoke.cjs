'use strict'

/**
 * Production-bundle smoke used by the release matrix.
 *
 * This module is loaded only when the packaged application receives
 * `--release-smoke`. It deliberately exercises the same PTY manager used by
 * the canvas instead of replacing node-pty with a child-process approximation.
 */

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { PtyProcessManager } = require('./services/pty-process-manager.cjs')
const { getAppPaths } = require('./core/app-paths.cjs')
const { writeContextFile } = require('./services/context-files-ipc-handlers.cjs')
const { instalarComandoDoAgente } = require('./services/agent-command-install.cjs')
const { CONTEXT_FILE_PREFIX, CONTEXT_FILE_SUFFIX } = require('./core/context-file-contract.cjs')

const PTY_MARKER = 'FELIXO_RELEASE_PTY_OK'
const PTY_TIMEOUT_MS = 20_000
const CONTEXT_SMOKE_MARKER = 'FELIXO_RELEASE_CONTEXT_DONE'
const CONTEXT_SMOKE_TIMEOUT_MS = 20_000

/**
 * Open a real PTY from the packaged main process and close it cleanly.
 *
 * @param {object} options
 * @param {object} options.app - Electron app instance.
 * @param {string} [options.statusFile] - Cross-process status file.
 * @param {typeof PtyProcessManager} [options.PtyManager] - Test seam.
 * @returns {Promise<object>}
 */
async function runPackagedReleaseSmoke({
  app,
  statusFile = process.env.FELIXO_RELEASE_SMOKE_STATUS_FILE,
  PtyManager = PtyProcessManager,
} = {}) {
  const status = {
    schemaVersion: 1,
    platform: process.platform,
    appVersion: typeof app?.getVersion === 'function' ? app.getVersion() : null,
    readyAt: null,
    userDataWritable: false,
    pty: null,
    contextDelivery: null,
    error: null,
  }

  const writeStatus = () => writeSmokeStatus(statusFile, status)

  try {
    if (!app?.isPackaged) {
      throw new Error('O smoke de release exige o app empacotado.')
    }

    const userData = app.getPath('userData')
    fs.mkdirSync(userData, { recursive: true })
    fs.accessSync(userData, fs.constants.W_OK)
    status.userDataWritable = true
    status.readyAt = Date.now()
    writeStatus()

    const ptyCwd = createPtyWorkingDirectory()
    const manager = new PtyManager()

    try {
      status.pty = await runRealPty({
        manager,
        cwd: ptyCwd,
        // Task "validar node-pty empacotado no Windows": cobre cmd.exe e
        // PowerShell explicitamente, não só o shell padrão do runner —
        // release.yml roda este smoke duas vezes no Windows, uma com
        // FELIXO_RELEASE_SMOKE_SHELL=cmd.exe, uma sem (PowerShell/padrão).
        shellCommand: process.env.FELIXO_RELEASE_SMOKE_SHELL || undefined,
      })
      writeStatus()

      status.contextDelivery = await runContextCatalogSmoke({ app, manager, cwd: ptyCwd })
      writeStatus()
      if (!status.contextDelivery.ok) {
        // `writeStatus()` já colocou o `rawOutputPreview` completo no arquivo
        // de status — o `Error` lançado aqui fica curto de propósito, porque
        // `scripts/release-smoke.cjs` trunca o diagnóstico do processo a 2000
        // caracteres e um preview de 4000 não sobrevive junto com o resto do
        // stack trace.
        throw new Error('A entrega de catálogo empacotada falhou; ver contextDelivery no relatório JSON.')
      }
    } finally {
      manager.killAll({ force: true })
      removeTemporaryDirectory(ptyCwd)
    }

    return status
  } catch (error) {
    status.error = getErrorMessage(error)
    writeStatus()
    throw error
  }
}

/**
 * @param {object} options
 * @param {PtyProcessManager} options.manager
 * @param {string} options.cwd
 * @param {string} [options.shellCommand] - Força um shell específico (ex.:
 *   "cmd.exe") em vez do shell padrão detectado da plataforma — usado para
 *   cobrir cmd.exe e PowerShell separadamente no Windows.
 * @returns {Promise<{ ok: boolean, exitCode: number, marker: string, outputBytes: number, shell: string, cwdLength: number }>}
 */
function runRealPty({ manager, cwd, shellCommand }) {
  return new Promise((resolve, reject) => {
    const sessionId = `release-smoke-${process.pid}`
    let output = ''
    let settled = false
    let timer = null

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      callback(value)
    }

    const fail = (error) =>
      finish(reject, error instanceof Error ? error : new Error(String(error)))

    timer = setTimeout(() => {
      try {
        manager.kill(sessionId, { force: true })
      } catch {
        // The timeout error is the useful release diagnostic.
      }
      fail(new Error('O PTY empacotado nao encerrou dentro do tempo limite.'))
    }, PTY_TIMEOUT_MS)

    try {
      manager.spawn(sessionId, {
        cwd,
        ...(shellCommand ? { command: shellCommand } : {}),
        onData: (data) => {
          output = `${output}${String(data)}`.slice(-20_000)
        },
        onExit: (event) => {
          if (event.exitCode !== 0) {
            fail(new Error(`O PTY empacotado encerrou com codigo ${event.exitCode}.`))
            return
          }

          if (!output.includes(PTY_MARKER)) {
            fail(new Error('O PTY empacotado nao devolveu o marcador esperado.'))
            return
          }

          finish(resolve, {
            ok: true,
            exitCode: event.exitCode,
            marker: PTY_MARKER,
            outputBytes: Buffer.byteLength(output),
            shell: shellCommand || 'default',
            cwdLength: cwd.length,
          })
        },
      })

      const input = process.platform === 'win32'
        ? `echo ${PTY_MARKER}\r\nexit\r\n`
        : `printf '${PTY_MARKER}\\n'\nexit\n`
      const delivered = manager.write(sessionId, input)

      if (!delivered) {
        fail(new Error('O PTY empacotado recusou a escrita de smoke.'))
        return
      }

      Promise.resolve(manager.aguardarEscritas(sessionId)).catch(fail)
    } catch (error) {
      fail(error)
    }
  })
}

/**
 * Prove, inside the packaged binary, that the whole context-catalog delivery
 * contract works end to end: the shim installed by THIS entrypoint resolves
 * an artifact written by THIS process's real IPC writer, and returns its
 * content byte-for-byte through a real PTY — not a dev build, not a mock.
 *
 * Two artifacts (not one) exercise the "combinação ordenada" the renderer
 * sends when several context parts are delivered together
 * (`buildContextFileReferences` in `context-file-delivery.ts`); a third,
 * intentionally absent name exercises the "artefato não encontrado" error
 * path from `context-command.cjs` with no dev-only shortcut.
 *
 * O botão Inserir/combinar e a submissão com exatamente um Enter são
 * comportamento do renderer (`terminal-session-store.ts`), fora do alcance
 * de um PTY isolado do processo principal — seguem cobertos só por unidade
 * (`terminal-session-store.test.ts`) e ficam registrados como limitação
 * explícita desta rodada, não escondidos.
 *
 * @param {object} options
 * @param {object} options.app - Electron app instance.
 * @param {PtyProcessManager} options.manager
 * @param {string} options.cwd
 * @returns {Promise<object>}
 */
const ANSI_SEQUENCE = /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|\[[0-9;?]*[a-zA-Z])/g

/**
 * Reconstitui o texto que um processo filho realmente escreveu a partir do
 * que um PTY interativo devolve — removendo duas traduções de terminal que
 * não são conteúdo, medidas ao vivo na matriz de Release antes desta função
 * existir (ver commits e65341f e o que a introduziu):
 *
 * 1. Um PTY POSIX (termios `onlcr`) e o ConPTY do Windows traduzem cada `\n`
 *    que o processo filho escreve para `\r\n` na leitura pelo lado master.
 * 2. No shell padrão do runner Windows (PowerShell 7 via `pwsh.exe` — o
 *    adaptador win32 prefere pwsh quando ele existe, e o runner do GitHub
 *    tem), o PSReadLine redesenha o prompt/realce de sintaxe e o ConPTY
 *    reflui linhas mais longas que a largura do terminal: os dois intercalam
 *    sequências de escape ANSI/VT (posição de cursor, cor, título da janela)
 *    NO MEIO do próprio texto impresso — não no fim, no meio de uma palavra.
 *    `electron/__fixtures__/release-smoke-windows-conpty-sample.txt` é a
 *    captura real de um run que reprovou por isso (34436218790): sem remover
 *    essas sequências antes de comparar, qualquer corpo com mais de uma
 *    linha reprovava, mesmo intacto.
 *
 * @param {string} rawOutput
 * @returns {string}
 */
function normalizePtyTextOutput(rawOutput) {
  return String(rawOutput).replace(ANSI_SEQUENCE, '').replace(/\r\n/g, '\n')
}
async function runContextCatalogSmoke({ app, manager, cwd }) {
  const appPaths = getAppPaths({ electronApp: app })

  // Acentos, emoji, markdown e newline duplo: os quatro tipos de conteúdo que
  // a task pede para não truncar/corromper no caminho renderer → arquivo →
  // shim → PTY → agente.
  const fixtureBodies = [
    [
      '## Prompt individual — parte 1 da combinação',
      '',
      'Acentuação: ação, avaliação, coração, é, ê, ã, ç.',
      'Emoji: 🚀 ✅ 🧪',
      '',
      'Linha em branco acima prova que o corpo não foi colapsado.',
    ].join('\n'),
    [
      '## Segundo prompt — parte 2 da combinação',
      '',
      'Esta é a SEGUNDA parte; a ordem de leitura importa para a "combinação ordenada".',
    ].join('\n'),
  ]

  const writtenFiles = []
  for (const body of fixtureBodies) {
    const written = await writeContextFile(appPaths.contextFiles, {
      sessionId: 'release-smoke-context',
      kind: 'catalog-prompt',
      source: 'release-smoke',
      content: body,
    })
    writtenFiles.push({
      ...written,
      expectedContent: await fsp.readFile(written.path, 'utf8'),
    })
  }

  const missingName = `${CONTEXT_FILE_PREFIX}0-${crypto.randomUUID()}-catalog-prompt${CONTEXT_FILE_SUFFIX}`

  const install = instalarComandoDoAgente({
    binDir: appPaths.bin,
    execPath: process.execPath,
    entrypoint: path.join(__dirname, 'cli', 'felixo.cjs'),
    userData: appPaths.userData,
  })

  // O PRIMEIRO comando executado num shell recém-aberto (`pwsh`/ConPTY) é
  // instável: linhas em branco somem só nessa primeira execução, mesmo com
  // largura suficiente (`cols`) e sem sequência ANSI de sobra. Medido ao vivo
  // (runs 34437923645 e 34439214148): a mesma leitura, repetida como segundo
  // comando, chega intacta — é um artefato de inicialização do console, não
  // do shim nem do arquivo. Um `felixo context read` de aquecimento (nome
  // real, saída descartada — `.includes()` mais abaixo só precisa achar UMA
  // ocorrência correta, e a de aquecimento nunca é a única) absorve essa
  // instabilidade antes das leituras que o teste realmente verifica.
  const warmupName = writtenFiles[0].name
  const output = await runContextReadsInPty({
    manager,
    cwd,
    names: [warmupName, ...writtenFiles.map((f) => f.name), missingName],
  })
  const normalizedOutput = normalizePtyTextOutput(output)

  const perFile = writtenFiles.map((file) => ({
    kind: 'catalog-prompt',
    bytes: file.bytes,
    readExactly: normalizedOutput.includes(file.expectedContent),
  }))

  const missingArtifactReported =
    normalizedOutput.includes('Artefato de contexto não encontrado') && normalizedOutput.includes(missingName)
  const ok = perFile.every((file) => file.readExactly) && missingArtifactReported

  return {
    ok,
    shimInstalled: install.caminho,
    files: perFile,
    missingArtifactReported,
    // O conteúdo da fixture não é privado (gerado por este próprio smoke); um
    // recorte cru só entra no relatório quando algo falhou, e vai no objeto de
    // status (não no `Error` lançado) para sobreviver ao truncamento de 2000
    // caracteres que `scripts/release-smoke.cjs` aplica ao diagnóstico do
    // processo — foi exatamente isso que escondeu a evidência da primeira
    // tentativa de diagnosticar esta função (ver commit ff41575).
    ...(ok ? {} : { rawOutputPreview: normalizedOutput.slice(-4_000) }),
  }
}

/**
 * Runs `felixo context read "<name>"` once per name, in order, inside a real
 * PTY — the same shell a canvas terminal would use — and returns everything
 * written to it.
 *
 * @param {object} options
 * @param {PtyProcessManager} options.manager
 * @param {string} options.cwd
 * @param {string[]} options.names
 * @returns {Promise<string>}
 */
function runContextReadsInPty({ manager, cwd, names }) {
  return new Promise((resolve, reject) => {
    const sessionId = `release-smoke-context-${process.pid}`
    let output = ''
    let settled = false
    let timer = null

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      callback(value)
    }
    const fail = (error) => finish(reject, error instanceof Error ? error : new Error(String(error)))

    timer = setTimeout(() => {
      try {
        manager.kill(sessionId, { force: true })
      } catch {
        // The timeout error is the useful release diagnostic.
      }
      fail(new Error('O PTY do smoke de contexto não encerrou dentro do tempo limite.'))
    }, CONTEXT_SMOKE_TIMEOUT_MS)

    try {
      manager.spawn(sessionId, {
        cwd,
        // Bem além de qualquer linha real da fixture (a mais longa do
        // cabeçalho de buildContextFileContent tem ~150 colunas). Nas 80
        // colunas padrão, o ConPTY do Windows reflui a linha e RESSINTETIZA
        // o ponto de quebra — inserindo um \n de verdade e reescrevendo o
        // caractere anterior à quebra — o que corrompe uma comparação
        // byte-a-byte mesmo depois de remover sequências ANSI/VT. Medido ao
        // vivo (run 34437923645): "...trabalhado e" \n "e não deve...", com
        // o "e" duplicado exatamente no ponto de quebra.
        cols: 1000,
        onData: (data) => {
          output = `${output}${String(data)}`.slice(-200_000)
        },
        onExit: (event) => {
          if (!output.includes(CONTEXT_SMOKE_MARKER)) {
            fail(new Error('O PTY do smoke de contexto não devolveu o marcador de conclusão.'))
            return
          }
          finish(resolve, output)
        },
      })

      const newline = process.platform === 'win32' ? '\r\n' : '\n'
      const readCommands = names.map((name) => `felixo context read "${name}"`)
      const script = [...readCommands, `echo ${CONTEXT_SMOKE_MARKER}`, 'exit'].join(newline) + newline
      const delivered = manager.write(sessionId, script)

      if (!delivered) {
        fail(new Error('O PTY do smoke de contexto recusou a escrita.'))
        return
      }

      Promise.resolve(manager.aguardarEscritas(sessionId)).catch(fail)
    } catch (error) {
      fail(error)
    }
  })
}

function writeSmokeStatus(statusFile, status) {
  if (!statusFile) return

  try {
    const directory = path.dirname(statusFile)
    fs.mkdirSync(directory, { recursive: true })
    const temporary = `${statusFile}.${process.pid}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(status, null, 2)}\n`, 'utf8')
    fs.rmSync(statusFile, { force: true })
    fs.renameSync(temporary, statusFile)
  } catch {
    // The parent process still receives the process exit code and stderr.
  }
}

/**
 * Cria o cwd usado pelo PTY do smoke. Com
 * `FELIXO_RELEASE_SMOKE_LONG_PATH=1` (Windows), aninha diretórios até
 * passar dos 260 caracteres do `MAX_PATH` clássico — sem isso o runner do
 * CI nunca reproduz o caminho longo que a task pede pra cobrir (o `os.tmpdir()`
 * de um runner é sempre curto por padrão).
 */
function createPtyWorkingDirectory() {
  const base = os.tmpdir()

  if (process.env.FELIXO_RELEASE_SMOKE_LONG_PATH !== '1') {
    return fs.mkdtempSync(path.join(base, 'felixo-release-pty-'))
  }

  const segment = 'pasta-bem-comprida-para-estourar-o-max-path-classico-do-windows'
  let nested = base
  while (nested.length < 240) {
    nested = path.join(nested, segment)
  }

  // MAX_PATH clássico (260 caracteres) bloqueia `mkdirSync` sem o prefixo de
  // path estendido `\\?\` no Windows — independe de "LongPathsEnabled"
  // estar habilitado no registro do runner (medido ao vivo: sem o prefixo,
  // ENOENT mesmo criando um diretório por vez com `recursive: true`). Cria
  // com o prefixo, mas devolve o caminho normal: é o que um cwd de verdade
  // parece pro node-pty/ConPTY, e é exatamente o cenário real que a task
  // pede pra provar — se o spawn falhar a partir daqui, é achado genuíno,
  // não bug deste helper.
  const mkdirTarget = toWindowsExtendedLengthPath(nested)
  fs.mkdirSync(mkdirTarget, { recursive: true })
  const tempDir = fs.mkdtempSync(path.join(mkdirTarget, 'felixo-release-pty-'))

  // Investigação pontual (task "investigar suporte real a path longo"):
  // CreateProcessW recebe `lpCurrentDirectory` como está — sem essa flag,
  // devolvemos o cwd "normal" (sem prefixo), que é o que falhou com o erro
  // 267. Com ela, mantemos o prefixo `\\?\` até o cwd que chega no
  // node-pty, para medir de verdade se CreateProcessW honra o prefixo
  // nesse parâmetro específico (documentação da Microsoft é inconsistente
  // sobre isso) — sem essa medição, qualquer resposta seria chute.
  if (process.env.FELIXO_RELEASE_SMOKE_LONG_PATH_PREFIXED === '1') {
    return tempDir
  }
  return tempDir.replace(/^\\\\\?\\/, '')
}

function toWindowsExtendedLengthPath(target) {
  if (process.platform !== 'win32' || target.startsWith('\\\\?\\')) return target
  return `\\\\?\\${target}`
}

function removeTemporaryDirectory(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true })
  } catch {
    // Best effort; the release job uses a disposable runner.
  }
}

function getErrorMessage(error) {
  return error?.message ? String(error.message) : String(error)
}

module.exports = {
  CONTEXT_SMOKE_MARKER,
  PTY_MARKER,
  createPtyWorkingDirectory,
  normalizePtyTextOutput,
  runContextCatalogSmoke,
  runContextReadsInPty,
  runPackagedReleaseSmoke,
  runRealPty,
  writeSmokeStatus,
}

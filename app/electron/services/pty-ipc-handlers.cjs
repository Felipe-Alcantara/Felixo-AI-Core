/**
 * @module pty-ipc-handlers
 * IPC bridge for interactive PTY terminal sessions.
 *
 * Wires the renderer (xterm.js views) to {@link module:pty-process-manager}.
 * Raw PTY bytes are streamed to the renderer via `pty:data`; exits via
 * `pty:exit`. Keystrokes, resizes and lifecycle come back through invokable
 * `pty:*` channels. This path is deliberately separate from the JSONL `cli:*`
 * orchestration path — here we never parse output, we just move bytes.
 *
 * Nota (28/09/2026) — exceção medida: o processo principal passou a LER a
 * saída dos terminais de agente, para a vigia de falha por conta
 * (`accounts/account-output-watcher.cjs`, criada pelo `PtyProcessManager`)
 * reconhecer limite, login e crédito da CLI. Os bytes continuam indo ao
 * renderer sem mudança e antes da vigia; por pedaço ela só marca "há texto
 * novo", e a leitura é uma varredura adiada da cauda de 4 KiB. O custo por
 * pedaço e o da varredura têm teto no `--check` de
 * `scripts/pty-output-path-benchmark.cjs` (variante `atual+vigia`).
 */

const { ipcMain } = require('electron')
const { toErrorResult } = require('./ipc-result.cjs')
const {
  PTY_ACCOUNT_MODES,
  PTY_SESSION_ACCOUNT_MISMATCH,
  PtyProcessManager,
} = require('./pty-process-manager.cjs')
const { validatePtyAccountSelection } = require('./pty-account-validation.cjs')

/** Código do `pty:spawn` quando o ticket da cadeia não vale (contrato `account-chain.ts`). */
const CHAIN_TICKET_REFUSED = 'CHAIN_TICKET_REFUSED'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Motivo pt-BR de cada recusa do serviço da cadeia (`beginTicketSpawn`). */
const CHAIN_TICKET_MESSAGES = Object.freeze({
  TICKET_INVALID: 'O ticket da cadeia de contas é inválido.',
  TICKET_NOT_FOUND: 'O ticket da cadeia de contas não existe.',
  TICKET_EXPIRED: 'A confirmação da troca venceu; confirme de novo.',
  TICKET_NOT_CONFIRMED: 'A troca de conta ainda não foi confirmada.',
  TICKET_ACCOUNT_MISMATCH: 'A troca foi confirmada para outra conta.',
  TICKET_USED: 'Esta troca já abriu outro bloco.',
  TICKET_IN_USE: 'Esta troca já está abrindo outro bloco.',
  UNAVAILABLE: 'A cadeia de contas não está disponível para abrir este bloco.',
})

function refuseChainTicket(reason) {
  return {
    ok: false,
    code: CHAIN_TICKET_REFUSED,
    message: CHAIN_TICKET_MESSAGES[reason] ?? CHAIN_TICKET_MESSAGES.TICKET_INVALID,
  }
}

/**
 * @param {() => (import('electron').BrowserWindow | null)} getMainWindow
 * @param {object} [dependencies]
 * @param {PtyProcessManager} [dependencies.manager] - Injectable for tests.
 * @param {(accountId: string, providerId: string) => {ok: boolean, message?: string}} [dependencies.validateAccount]
 * @param {(sessionId: string) => void} [dependencies.onSessionExit] - Avisado quando o processo da sessão sai.
 * @param {{ begin: Function, finish: Function, lineage?: Function } | null} [dependencies.chainTickets] - `beginTicketSpawn`/`finishTicketSpawn`/`lineageForSession` do serviço da cadeia.
 * @param {{ snapshot: () => Promise<Record<string, string | null>> }} [dependencies.cliVersions] - Versão de cada CLI de agente (`agent-cli-versions.cjs`).
 * @returns {{ manager: PtyProcessManager, dispose: () => void }}
 */
function registerPtyIpcHandlers(getMainWindow, dependencies = {}) {
  const manager = dependencies.manager ?? new PtyProcessManager()

  const send = (channel, payload) => {
    const window = getMainWindow()

    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }

  ipcMain.handle('pty:spawn', (_event, params = {}) => {
    try {
      const sessionId = requireSessionId(params.sessionId)
      const accountValidation = validatePtyAccountSelection({
        accountId: params.accountId,
        providerId: params.providerId,
        command: params.command,
        validateAccount: dependencies.validateAccount,
      })

      if (!accountValidation.ok) {
        return accountValidation
      }

      const accountMode = parseAccountMode(params.accountMode, params.accountId)
      if (!accountMode.ok) {
        return accountMode
      }

      // A troca da cadeia só abre o bloco novo com o ticket que o `confirm`
      // devolveu (§4.1): uso único, só para a conta confirmada. Sem ticket é
      // o spawn comum na conta pedida (conferida acima por validateAccount):
      // é assim que um bloco da cadeia reabre no reinício, no "Reiniciar" e
      // no reanexo depois de recarregar a janela; reanexar a um processo vivo
      // de outra conta continua barrado pelo gerenciador.
      const ticket = beginChainTicket(params, sessionId, accountMode.value)
      if (!ticket.ok) {
        return ticket
      }

      const reused = Boolean(params.reuseExisting && manager.has?.(sessionId))

      try {
        spawnSession(sessionId, params, accountValidation, accountMode, ticket.lineageId)
      } catch (error) {
        finishChainTicket(ticket, sessionId, false)
        throw error
      }
      finishChainTicket(ticket, sessionId, true)

      return { ok: true, sessionId, ...(reused ? { reused: true } : {}) }
    } catch (error) {
      const result = toErrorResult(error, 'Nao foi possivel iniciar o terminal.')
      // O código deixa o renderer distinguir "a sessão viva é de outra conta"
      // de uma falha qualquer de spawn.
      return error?.code === PTY_SESSION_ACCOUNT_MISMATCH ? { ...result, code: error.code } : result
    }
  })

  function beginChainTicket(params, sessionId, mode) {
    const hasTicket = params.chainTicket !== undefined && params.chainTicket !== null
    if (!hasTicket) {
      return { ok: true, ticket: null, lineageId: mode === 'chain' ? lineageFor(sessionId, params.accountId) : null }
    }
    if (typeof params.chainTicket !== 'string' || !UUID_PATTERN.test(params.chainTicket) || mode !== 'chain') {
      return refuseChainTicket('TICKET_INVALID')
    }
    const tickets = dependencies.chainTickets
    if (!tickets) {
      return refuseChainTicket('UNAVAILABLE')
    }
    const result = tickets.begin({ ticket: params.chainTicket, accountId: params.accountId, sessionId })
    if (!result?.ok) {
      return refuseChainTicket(result?.code)
    }
    return {
      ok: true,
      ticket: params.chainTicket,
      // Ticket já usado por esta mesma sessão (reload, reinício): spawn comum.
      pending: result.alreadySpawned !== true,
      lineageId: typeof result.lineageId === 'string' ? result.lineageId : null,
    }
  }

  /** Linhagem da troca que fez nascer esta sessão, na mesma conta; senão, nenhuma. */
  function lineageFor(sessionId, accountId) {
    try {
      const lineageId = dependencies.chainTickets?.lineage?.({ sessionId, accountId })
      return typeof lineageId === 'string' && lineageId ? lineageId : null
    } catch {
      // Sem a linhagem o bloco abre do mesmo jeito; a detecção começa uma nova.
      return null
    }
  }

  function finishChainTicket(ticket, sessionId, ok) {
    if (!ticket.ticket || !ticket.pending) {
      return
    }
    try {
      dependencies.chainTickets.finish({ ticket: ticket.ticket, sessionId, ok })
    } catch {
      // O registro é da cadeia; o terminal já nasceu (ou já falhou) de todo jeito.
    }
  }

  function spawnSession(sessionId, params, accountValidation, accountMode, lineageId) {
    manager.spawn(sessionId, {
      command: params.command,
      args: params.args,
      cwd: params.cwd,
      cols: params.cols,
      rows: params.rows,
      reuseExisting: Boolean(params.reuseExisting),
      fallbackCommand: params.fallbackCommand,
      keepShellOpen: Boolean(params.keepShellOpen),
      // Só um booleano atravessa: o processo principal decide qual variável
      // isso vira, e só para o Claude Code (nunca ambiente arbitrário).
      classicScreen: params.classicScreen === true,
      // Conta escolhida no configurador do agente; ausente = login do
      // sistema, que é o comportamento de antes desta feature.
      accountId: typeof params.accountId === 'string' ? params.accountId : undefined,
      providerId: accountValidation.providerId,
      // Fixa (padrão) ou da cadeia de contas; só o enum atravessa.
      accountMode: accountMode.value,
      onData: (data) => send('pty:data', { sessionId, data }),
      onExit: (event) => {
        send('pty:exit', {
          sessionId,
          exitCode: event.exitCode,
          signal: event.signal,
        })
        // A cadeia de contas vence as propostas abertas desta sessão.
        try {
          dependencies.onSessionExit?.(sessionId)
        } catch {
          // Diagnóstico da cadeia não pode atrapalhar o fim do terminal.
        }
      },
      onSession: (reference) => send('pty:session', { ptySessionId: sessionId, ...reference }),
      // Linhagem da cadeia: só o bloco nascido de um ticket confirmado a tem.
      ...(lineageId ? { lineageId } : {}),
    })
  }

  ipcMain.handle('pty:write', async (_event, params = {}) => {
    try {
      const sessionId = requireSessionId(params.sessionId)
      const delivered = manager.write(sessionId, String(params.data ?? ''))
      // Só responde depois que a carga saiu de verdade. Texto grande vai
      // fatiado, e quem escreve precisa distinguir "aceito" de "entregue" —
      // senão confere a tela cedo demais e reescreve o que ainda estava saindo.
      if (delivered) {
        await manager.aguardarEscritas?.(sessionId)
      }
      return { ok: true, delivered }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel enviar dados ao terminal.')
    }
  })

  ipcMain.handle('pty:resize', (_event, params = {}) => {
    try {
      const sessionId = requireSessionId(params.sessionId)
      const applied = manager.resize(sessionId, params.cols, params.rows)
      return { ok: true, applied }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel redimensionar o terminal.')
    }
  })

  ipcMain.handle('pty:kill', (_event, params = {}) => {
    try {
      const sessionId = requireSessionId(params.sessionId)
      const killed = manager.kill(sessionId, { force: Boolean(params.force) })
      return { ok: true, killed }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel encerrar o terminal.')
    }
  })

  // Versão instalada de cada CLI de agente, para o plano de retomada do
  // canvas (ver `agent-cli-versions.cjs`). Sem o serviço, nada se sabe: o
  // renderer trata toda versão como desconhecida.
  ipcMain.handle('pty:cli-versions', async () => {
    try {
      const versions = dependencies.cliVersions ? await dependencies.cliVersions.snapshot() : {}
      return { ok: true, versions }
    } catch (error) {
      return toErrorResult(error, 'Nao foi possivel ler a versao das CLIs.')
    }
  })

  const dispose = () => {
    manager.killAll({ force: true })
  }

  return { manager, dispose }
}

/**
 * Valida o formato do modo de conta pedido pelo renderer. Ausente vale
 * `pinned` (decidido no gerenciador); `chain` sem conta não existe, porque o
 * login do sistema não é membro da cadeia.
 *
 * @param {unknown} mode
 * @param {unknown} accountId
 * @returns {{ ok: true, value: 'pinned' | 'chain' | undefined } | { ok: false, message: string }}
 */
function parseAccountMode(mode, accountId) {
  if (mode === undefined || mode === null) {
    return { ok: true, value: undefined }
  }

  if (!PTY_ACCOUNT_MODES.includes(mode)) {
    return { ok: false, message: 'Modo de conta do terminal inválido.' }
  }

  if (mode === 'chain' && !(typeof accountId === 'string' && accountId.trim())) {
    return { ok: false, message: 'Um bloco da cadeia de contas precisa de uma conta.' }
  }

  return { ok: true, value: mode }
}

function requireSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw new Error('sessionId is required.')
  }

  return sessionId
}

module.exports = {
  CHAIN_TICKET_REFUSED,
  parseAccountMode,
  registerPtyIpcHandlers,
  requireSessionId,
  // Reexportado a partir de ./ipc-result.cjs para não quebrar quem já importa
  // daqui (inclusive o teste deste módulo).
  toErrorResult,
}

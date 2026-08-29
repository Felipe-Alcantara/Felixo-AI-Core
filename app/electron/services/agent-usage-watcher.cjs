'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/**
 * Avisa quando a quota muda, em vez de perguntar de tempos em tempos.
 *
 * O consumo de uma janela de 5 h muda em segundos durante uma conversa, e um
 * intervalo de 5 minutos mostra número velho quase o tempo todo. Encurtar o
 * intervalo não resolve: a rodada completa depende dos comandos de
 * autenticação das CLIs, medidos em segundos cada.
 *
 * O caminho barato é outro: as duas fontes locais **escrevem em arquivo** a
 * cada resposta do agente — o Codex acrescenta ao rollout da sessão, o script
 * de status line reescreve a captura do Claude. Acompanhar esses arquivos dá o
 * número no instante em que ele muda, sem processo e sem rede.
 *
 * A vigilância é por `mtime`, não por `fs.watch`. O `inotify` é um recurso
 * escasso e disputado: na máquina onde isto foi escrito havia 204 instâncias
 * em uso para um limite de 128 por usuário, e qualquer `fs.watch` novo falhava
 * com `EMFILE`. Um `stat` por segundo em dois ou três caminhos custa
 * microssegundos e não disputa nada.
 *
 * Openia fica de fora de propósito: o saldo dele vem de chamada de rede, que
 * não tem arquivo a acompanhar e não deve ser disparada em rajada.
 */

/** Frequência da checagem de `mtime`. */
const POLL_MS = 1000

/**
 * De quanto em quanto tempo redescobrir qual é o rollout mais recente. Uma
 * sessão nova do Codex cria um arquivo (e, virada a meia-noite, uma pasta)
 * que não existia quando o acompanhamento começou.
 */
const REDISCOVER_MS = 15_000

function createAgentUsageWatcher({
  homeDir = os.homedir(),
  claudeStatuslineDir,
  onChange,
  fileSystem = fs,
  pollMs = POLL_MS,
  rediscoverMs = REDISCOVER_MS,
} = {}) {
  /** Último `mtime`+tamanho visto por caminho. */
  const seen = new Map()
  let codexFile = null
  let pollTimer = null
  let rediscoverTimer = null

  function fingerprint(filePath) {
    try {
      const stats = fileSystem.statSync(filePath)
      return `${stats.mtimeMs}:${stats.size}`
    } catch {
      return null
    }
  }

  /**
   * `true` quando o arquivo mudou desde a última olhada. A primeira olhada
   * apenas registra: abrir o painel não é motivo para anunciar novidade.
   */
  function changed(filePath) {
    if (!filePath) {
      return false
    }

    const current = fingerprint(filePath)

    if (current === null) {
      return false
    }

    const previous = seen.get(filePath)
    seen.set(filePath, current)

    return previous !== undefined && previous !== current
  }

  /** Pasta do dia corrente nas sessões do Codex. */
  function codexDayDir() {
    const today = new Date()

    return path.join(
      homeDir,
      '.codex',
      'sessions',
      String(today.getFullYear()),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    )
  }

  /**
   * O rollout mais recente do dia. Só a pasta do dia é lida — o histórico
   * inteiro seria caro para reler a cada quinze segundos, e uma sessão em
   * andamento é sempre de hoje.
   */
  function resolveCodexFile() {
    const dir = codexDayDir()

    try {
      const newest = fileSystem
        .readdirSync(dir)
        .filter((name) => name.startsWith('rollout-') && name.endsWith('.jsonl'))
        .map((name) => {
          const filePath = path.join(dir, name)

          try {
            return { filePath, modifiedAt: fileSystem.statSync(filePath).mtimeMs }
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .sort((a, b) => b.modifiedAt - a.modifiedAt)[0]

      codexFile = newest?.filePath ?? null
    } catch {
      codexFile = null
    }
  }

  function claudeFile() {
    return claudeStatuslineDir
      ? path.join(claudeStatuslineDir, 'rate-limits.json')
      : null
  }

  function tick() {
    if (changed(codexFile)) {
      onChange('codex')
    }

    if (changed(claudeFile())) {
      onChange('claude')
    }
  }

  function start() {
    resolveCodexFile()
    // Primeira passada só para registrar o estado atual, sem anunciar nada.
    tick()

    pollTimer = setInterval(tick, pollMs)
    rediscoverTimer = setInterval(resolveCodexFile, rediscoverMs)

    // Nenhum dos dois deve manter o processo vivo sozinho.
    pollTimer.unref?.()
    rediscoverTimer.unref?.()
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }

    if (rediscoverTimer) {
      clearInterval(rediscoverTimer)
      rediscoverTimer = null
    }

    seen.clear()
  }

  return { start, stop, tick, resolveCodexFile }
}

module.exports = {
  POLL_MS,
  REDISCOVER_MS,
  createAgentUsageWatcher,
}

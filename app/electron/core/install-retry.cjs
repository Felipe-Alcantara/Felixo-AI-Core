/**
 * @module install-retry
 * Repete uma instalação (npm, pip ou script) só quando a rede explica a falha.
 *
 * O npm e o pip já repetem sozinhos dentro de uma execução (o npm duas vezes, de
 * 10 a 60 s de espera; o pip cinco, com espera curta). Quando a falha chega
 * aqui, a conexão ficou fora o tempo de uma sequência inteira dessas — um Wi-Fi
 * que ainda não reconectou depois de abrir o app, um DNS que voltou segundos
 * depois. A espera maior entre as tentativas deste módulo cobre esse caso. Sem
 * ela, uma queda de rede na abertura marcava a CLI como "já tentou nesta
 * versão" e ela só voltava a instalar depois de uma atualização do app ou do
 * "Tentar de novo" manual.
 *
 * A decisão de repetir é estreita de propósito. `cli-diagnostics` também
 * classifica falha de instalação, mas para EXPLICAR: o padrão dele casa
 * "proxy", "network" e certificado autoassinado, o que ajuda a mensagem e
 * atrapalharia aqui, porque repetir não conserta proxy nem certificado. Só vale
 * repetir o que a própria rede costuma resolver em segundos.
 *
 * Os padrões saíram da saída medida do pip 25.3 e do npm 11.6.2 (ver os
 * trechos reais em `install-retry.test.cjs`), não de memória.
 */

const DEFAULT_RETRIES = 2
/** Espera antes da 1ª e da 2ª nova tentativa; passando disso, repete a última. */
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([3_000, 10_000])

/** Sinais de rede que costumam passar sozinhos. */
const TRANSIENT_NETWORK_PATTERN = new RegExp(
  [
    // Códigos de sistema do Node (npm e scripts em Node).
    '\\b(?:ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ENETDOWN|EHOSTUNREACH|ERR_SOCKET_TIMEOUT)\\b',
    // npm: "npm error network This is a problem related to network connectivity."
    'npm (?:error|ERR!) network\\b',
    'socket hang up',
    'fetch failed',
    // pip: avisos de tentativa interna por conexão derrubada, e o erro final.
    'Retrying \\(Retry\\(',
    'Max retries exceeded with url',
    '\\b(?:NewConnectionError|ConnectTimeoutError|ReadTimeoutError|ProtocolError|RemoteDisconnected)\\b',
    'Connection (?:broken|aborted|reset by peer)',
    'Read timed out',
    // Resolução de nome e rota.
    'getaddrinfo (?:failed|ENOTFOUND|EAI_AGAIN)',
    'Temporary failure in name resolution',
    'Name or service not known',
    'Network is unreachable',
    // Servidor ou intermediário com problema passageiro.
    'npm (?:error|ERR!) code E(?:408|429|50[0234])\\b',
    'HTTP error (?:408|429|50[0234])\\b',
    '\\b(?:408 Request Timeout|429 Too Many Requests|50[0234] (?:Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out))',
  ].join('|'),
  'i',
)

/**
 * Falha que a rede NÃO explica, mesmo que o texto cite uma URL ou um registry:
 * repetir só gastaria mais tempo para chegar ao mesmo erro.
 */
const PERMANENT_FAILURE_PATTERN = new RegExp(
  [
    'npm (?:error|ERR!) code (?:E40[0-7]|E409|E41\\d|E422|EINTEGRITY|ETARGET|ENOSPC)\\b',
    'HTTP error (?:40[0-7]|409|41\\d|422)\\b',
    '\\b(?:EINTEGRITY|ETARGET|ENOSPC)\\b',
  ].join('|'),
  'i',
)

/**
 * @param {{ ok?: boolean, cancelled?: boolean, timedOut?: boolean, errorCode?: string, output?: string, stdout?: string, stderr?: string, message?: string } | null | undefined} result
 * @returns {boolean} A falha parece de rede e passageira.
 */
function isTransientNetworkFailure(result) {
  if (!result || result.ok || result.cancelled) return false
  // Prazo vencido já é o tempo de uma tentativa inteira; repetir triplicaria a
  // espera sem nenhum sinal de que foi a rede. E o executável que nem abriu
  // (ENOENT, EACCES) é problema da máquina, não da conexão.
  if (result.timedOut || result.errorCode) return false

  const text = [result.output, result.stdout, result.stderr, result.message]
    .filter((part) => typeof part === 'string' && part !== '')
    .join('\n')
  if (!text || PERMANENT_FAILURE_PATTERN.test(text)) return false

  return TRANSIENT_NETWORK_PATTERN.test(text)
}

/**
 * Espera `ms`, ou menos se `signal` for abortado. Nunca rejeita.
 *
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
function abortableSleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }

    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal?.addEventListener('abort', finish, { once: true })
  })
}

/**
 * Roda `attempt` e repete, com espera crescente, enquanto a falha for de rede.
 *
 * O resultado final ganha `networkRetries` (quantas vezes repetiu) e, se ainda
 * falhou, a mensagem diz que a rede foi tentada mais de uma vez. Cancelar
 * durante a espera interrompe a repetição e devolve `cancelled: true`.
 *
 * @template {{ ok?: boolean, message?: string, cancelled?: boolean }} T
 * @param {() => Promise<T>} attempt
 * @param {object} [options]
 * @param {number} [options.retries] - Quantas novas tentativas além da primeira.
 * @param {readonly number[]} [options.delaysMs]
 * @param {AbortSignal} [options.signal]
 * @param {(ms: number, signal?: AbortSignal) => Promise<void>} [options.sleep] - Injetável nos testes.
 * @param {(info: { retry: number, retries: number, delayMs: number, result: T }) => void} [options.onRetry]
 * @returns {Promise<T & { networkRetries: number }>}
 */
async function withNetworkRetry(
  attempt,
  {
    retries = DEFAULT_RETRIES,
    delaysMs = DEFAULT_RETRY_DELAYS_MS,
    signal,
    sleep = abortableSleep,
    onRetry,
  } = {},
) {
  let result = await attempt()
  let networkRetries = 0

  while (networkRetries < retries && isTransientNetworkFailure(result)) {
    if (signal?.aborted) break

    const delayMs = delaysMs[Math.min(networkRetries, delaysMs.length - 1)] ?? 0
    onRetry?.({ retry: networkRetries + 1, retries, delayMs, result })
    await sleep(delayMs, signal)

    if (signal?.aborted) {
      return {
        ...result,
        cancelled: true,
        message: `${result.message ?? 'A instalação falhou'} A instalação foi cancelada antes da nova tentativa.`.trim(),
        networkRetries,
      }
    }

    networkRetries += 1
    result = await attempt()
  }

  if (networkRetries > 0 && !result.ok && !result.cancelled) {
    const tentativas = networkRetries + 1
    return {
      ...result,
      message: `${result.message ?? ''} A rede falhou nas ${tentativas} tentativas.`.trim(),
      networkRetries,
    }
  }

  return { ...result, networkRetries }
}

module.exports = {
  DEFAULT_RETRIES,
  DEFAULT_RETRY_DELAYS_MS,
  abortableSleep,
  isTransientNetworkFailure,
  withNetworkRetry,
}

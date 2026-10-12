/**
 * Contrato tipado do "Agente na nuvem" entre o renderer e o processo principal.
 *
 * O renderer só pede: quem cria a sessão, valida a pasta, remove credenciais do
 * ambiente e lê a saída do `claude --cloud` é o serviço no main
 * (`services/cloud-session/`). Este arquivo fixa o formato dos canais
 * `cloud-session:*` e do namespace `window.felixo.cloudSession` no preload.
 *
 * Nada aqui carrega segredo: as mensagens de erro chegam já redigidas pelo main.
 */

/** Códigos de erro do serviço; os mesmos de `cloud-session-output.cjs`. */
export const CLOUD_SESSION_ERROR_CODES = [
  'trust-required',
  'login-required',
  'limit-reached',
  'network',
  'timeout',
  'interrupted',
  'invalid-input',
  'busy',
  'unknown',
] as const

export type CloudSessionErrorCode = (typeof CLOUD_SESSION_ERROR_CODES)[number]

/** A sessão criada, como o CLI a imprime. O horário é carimbado pelo renderer. */
export type CloudSessionInfo = {
  id: string
  url: string
  title: string
}

export type CloudSessionFailure = {
  ok: false
  code: CloudSessionErrorCode
  message: string
}

export type CloudSessionLaunchResult = { ok: true; session: CloudSessionInfo } | CloudSessionFailure

export type CloudSessionActionResult = { ok: true } | CloudSessionFailure

export type CloudSessionBridge = {
  /** Cria uma sessão na nuvem. Só é chamada por um clique confirmado. */
  launch: (params: {
    nodeId: string
    task: string
    cwd: string
    accountId?: string
  }) => Promise<CloudSessionLaunchResult>
  /** Envia uma mensagem a uma sessão existente. */
  followUp: (params: {
    nodeId: string
    sessionId: string
    text: string
    cwd: string
    accountId?: string
  }) => Promise<CloudSessionActionResult>
  /** Abre o link da sessão no navegador; o main só aceita claude.ai/code/session_*. */
  open: (params: { url: string }) => Promise<CloudSessionActionResult>
}

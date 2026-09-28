'use strict'

/**
 * Padrões de falha das CLIs de agente — só DADOS.
 *
 * As frases por provedor vêm do vocabulário conferido nos pacotes instalados
 * (`electron/__fixtures__/cli-failure-vocabulary.json`, regenerado por
 * `scripts/extract-cli-failure-vocabulary.cjs`); o teste da taxonomia percorre
 * a fixture inteira e reprova se uma frase dela não for classificada como a
 * fixture diz. A fixture é o oráculo; este arquivo é o que roda.
 *
 * Cada frase é escrita como a CLI a imprime. A taxonomia normaliza os dois
 * lados do mesmo jeito (caixa, apóstrofo ’/', sublinhado vira espaço, espaços
 * colapsados, o separador "·" com ou sem espaço em volta) e casa a frase
 * inteira, com fronteira de palavra.
 *
 * - `terminal: false` — código de erro que só aparece na saída one-shot
 *   (origem `fluxo`); no terminal interativo o agente pode estar escrevendo
 *   exatamente esse identificador no código.
 * - `anchor: 'line'` — frase curta demais para valer no meio de uma linha: só
 *   conta como a linha inteira (fora símbolos e pontuação nas pontas).
 * - `alsoRequires` — outro trecho que precisa estar na mesma linha.
 * - `capacity: true` — falta de capacidade do servidor, não da conta: o
 *   orquestrador ainda tenta outro modelo, e a conta nunca entra em espera.
 * - `ambiguous: true` — pode ser login ou permissão; a pessoa escolhe.
 *
 * No terminal (origem `pty`) a frase do provedor só vale no começo da linha,
 * depois só de espaços e glifos da TUI (■ ⎿ ✕ │ ● ⚠…): é assim que a CLI a
 * imprime. Um agente que CITA a mensagem num diff, num teste ou no código
 * tem aspas, código ou texto antes dela. `terminalLinePrefixes` são aberturas
 * de linha da própria CLI depois das quais a frase pode vir no meio (o Gemini
 * embrulha o erro em "[API Error: …]").
 */

const PROVIDER_PATTERNS = Object.freeze({
  claude: Object.freeze({
    include: Object.freeze([
      { phrase: 'Usage limit reached · continuing automatically', failureClass: 'limit', scope: 'account' },
      { phrase: 'Usage limit reached · continuing shortly', failureClass: 'limit', scope: 'account' },
      { phrase: 'Usage limit reached again after you continued', failureClass: 'limit', scope: 'account' },
      // Mensagem principal do limite (status "rejected"): o binário monta
      // `You've hit your ${nome}${sufixo}`, com o nome tirado da tabela de
      // janelas. O limite semanal de um modelo fica no modelo.
      { phrase: "You've hit your session limit", failureClass: 'limit', scope: 'account' },
      { phrase: "You've hit your weekly limit", failureClass: 'limit', scope: 'account' },
      { phrase: "You've hit your usage limit", failureClass: 'limit', scope: 'account' },
      { phrase: "You've hit your limit", failureClass: 'limit', scope: 'account' },
      { phrase: "You've hit your Opus limit", failureClass: 'limit', scope: 'model' },
      { phrase: "You've hit your Sonnet limit", failureClass: 'limit', scope: 'model' },
      { phrase: "You've hit your Fable limit", failureClass: 'limit', scope: 'model' },
      { phrase: "You've hit your usage credit limit", failureClass: 'billing', scope: 'account' },
      { phrase: "You've hit your monthly spend limit", failureClass: 'billing', scope: 'account' },
      { phrase: "You've hit your org's monthly spend limit", failureClass: 'billing', scope: 'account' },
      { phrase: "You've hit your org's monthly usage limit", failureClass: 'billing', scope: 'account' },
      { phrase: "You've hit your individual spend limit", failureClass: 'billing', scope: 'account' },
      { phrase: "You've hit your channel's monthly spend limit", failureClass: 'billing', scope: 'account' },
      { phrase: "You've hit your team's shared budget", failureClass: 'billing', scope: 'account' },
      { phrase: "You're out of usage credits", failureClass: 'billing', scope: 'account' },
      { phrase: 'Your org is out of usage', failureClass: 'billing', scope: 'account' },
      { phrase: "You're out of extra usage", failureClass: 'billing', scope: 'account' },
      { phrase: 'Credit balance is too low', failureClass: 'billing', scope: 'account' },
      { phrase: "Your seat type doesn't include usage credits", failureClass: 'billing', scope: 'account' },
      { phrase: "Your seat type doesn't include extra usage", failureClass: 'billing', scope: 'account' },
      { phrase: "Your group's usage limit is set to $0", failureClass: 'billing', scope: 'account' },
      { phrase: 'Not logged in · Please run /login', failureClass: 'auth', scope: 'account' },
      { phrase: 'Authentication required · Sign in again to continue', failureClass: 'auth', scope: 'account' },
      { phrase: 'Invalid API key · Fix external API key', failureClass: 'auth', scope: 'account' },
      { phrase: 'Invalid auth token · Fix external auth token', failureClass: 'auth', scope: 'account' },
      { phrase: 'rate_limit_error', failureClass: 'limit', scope: 'account', terminal: false },
      { phrase: 'billing_error', failureClass: 'billing', scope: 'account', terminal: false },
      { phrase: 'authentication_error', failureClass: 'auth', scope: 'account', terminal: false },
      { phrase: 'overloaded_error', failureClass: 'provider', scope: 'account', terminal: false },
    ]),
    exclude: Object.freeze([
      'Usage limit reached · wrapping up',
      'Usage limit reached · brief included wrap-up',
      'Fast limit reached',
      'Context limit reached',
      'Budget limit reached',
      'Subagent nesting limit',
      'Concurrent subagent limit',
      'Approaching your 5-hour usage limit',
      'Upgrade to Max',
      "You've hit your fast limit",
      // Avisos de aproximação: a própria CLI os separa das mensagens de limite.
      "You've used",
      "You're close to",
    ]),
    notices: Object.freeze([
      { phrase: 'Your usage limit has reset · press enter to continue', notice: 'limit_reset' },
    ]),
  }),
  codex: Object.freeze({
    include: Object.freeze([
      { phrase: 'You’ve hit your usage limit for', failureClass: 'limit', scope: 'model' },
      { phrase: 'You’ve hit your usage limit.', failureClass: 'limit', scope: 'account' },
      { phrase: "Usage limit reached. You've reached your usage limit.", failureClass: 'limit', scope: 'account' },
      { phrase: 'usage_limit_reached', failureClass: 'limit', scope: 'account', terminal: false },
      { phrase: 'usage_limit_exceeded', failureClass: 'limit', scope: 'account', terminal: false },
      { phrase: 'workspace_owner_usage_limit_reached', failureClass: 'limit', scope: 'account', terminal: false },
      { phrase: 'workspace_member_usage_limit_reached', failureClass: 'limit', scope: 'account', terminal: false },
      { phrase: "You're out of credits", failureClass: 'billing', scope: 'account' },
      { phrase: 'Your workspace is out of credits', failureClass: 'billing', scope: 'account' },
      { phrase: 'workspace_member_credits_depleted', failureClass: 'billing', scope: 'account', terminal: false },
      { phrase: 'Not logged in', failureClass: 'auth', scope: 'account', anchor: 'line' },
      { phrase: 'Your access token could not be refreshed', failureClass: 'auth', scope: 'account' },
      { phrase: 'Your authentication session could not be refreshed', failureClass: 'auth', scope: 'account' },
      { phrase: 'RefreshTokenFailed', failureClass: 'auth', scope: 'account', terminal: false },
      { phrase: 'unauthorized', failureClass: 'auth', scope: 'account', terminal: false },
      { phrase: 'Codex is currently experiencing high load', failureClass: 'provider', scope: 'account' },
      { phrase: 'server_overloaded', failureClass: 'provider', scope: 'account', terminal: false },
      { phrase: 'internal_server_error', failureClass: 'provider', scope: 'account', terminal: false },
      { phrase: 'stream disconnected before completion', failureClass: 'network', scope: 'account' },
      { phrase: 'Reconnecting...', failureClass: 'network', scope: 'account' },
      { phrase: 'http_connection_failed', failureClass: 'network', scope: 'account', terminal: false },
      { phrase: 'response_stream_connection_failed', failureClass: 'network', scope: 'account', terminal: false },
    ]),
    exclude: Object.freeze([
      'Goal budget reached',
      'Conversation interrupted',
      'context_window_exceeded',
      'session_budget_exceeded',
      'Auth: Not logged in',
    ]),
    notices: Object.freeze([]),
  }),
  gemini: Object.freeze({
    include: Object.freeze([
      { phrase: 'MODEL_CAPACITY_EXHAUSTED', failureClass: 'provider', scope: 'model', capacity: true },
      { phrase: 'exhausted your capacity', failureClass: 'provider', scope: 'model', capacity: true },
      { phrase: 'RESOURCE_EXHAUSTED', alsoRequires: 'Quota exceeded', failureClass: 'limit', scope: 'account' },
      { phrase: 'You have exhausted your daily quota on this model', failureClass: 'limit', scope: 'model' },
    ]),
    exclude: Object.freeze([]),
    notices: Object.freeze([]),
    terminalLinePrefixes: Object.freeze(['[API Error:']),
  }),
  // Sem frase própria de limite ou de crédito no pacote: sem detecção no
  // terminal (fail-closed). A falta de crédito aparece pela medição.
  openia: Object.freeze({
    include: Object.freeze([]),
    exclude: Object.freeze([]),
    notices: Object.freeze([]),
  }),
})

/**
 * Frases genéricas: SÓ na origem `fluxo` (erro de execução one-shot do
 * orquestrador e do chat), nunca no terminal, onde "rate limit" ou
 * "unauthorized" podem ser parte do trabalho do agente.
 */
const GENERIC_PATTERNS = Object.freeze([
  { phrase: 'usage limit', failureClass: 'limit' },
  { phrase: 'rate limit', failureClass: 'limit' },
  { phrase: 'rate limited', failureClass: 'limit' },
  { phrase: 'too many requests', failureClass: 'limit' },
  { phrase: 'quota exceeded', failureClass: 'limit' },
  { phrase: 'exceeded your current quota', failureClass: 'billing' },
  { phrase: 'insufficient_quota', failureClass: 'billing' },
  { phrase: 'credit balance', failureClass: 'billing' },
  { phrase: 'out of extra usage', failureClass: 'billing' },
  { phrase: 'out of credits', failureClass: 'billing' },
  { phrase: 'payment required', failureClass: 'billing' },
  { phrase: 'not logged in', failureClass: 'auth' },
  { phrase: 'please login', failureClass: 'auth' },
  { phrase: 'please log in', failureClass: 'auth' },
  { phrase: 'authentication failed', failureClass: 'auth' },
  { phrase: 'unauthorized', failureClass: 'auth' },
  { phrase: 'invalid api key', failureClass: 'auth' },
  { phrase: 'forbidden', failureClass: 'auth', ambiguous: true },
  { phrase: 'overloaded', failureClass: 'provider' },
  { phrase: 'internal server error', failureClass: 'provider' },
  { phrase: 'service unavailable', failureClass: 'provider' },
  { phrase: 'bad gateway', failureClass: 'provider' },
  { phrase: 'RESOURCE_EXHAUSTED', failureClass: 'provider', capacity: true },
  { phrase: 'MODEL_CAPACITY_EXHAUSTED', failureClass: 'provider', capacity: true },
  { phrase: 'exhausted your capacity', failureClass: 'provider', capacity: true },
  { phrase: 'capacity exceeded', failureClass: 'provider', capacity: true },
  // Rede estreita, de propósito: o NETWORK_FAILURE_PATTERN de
  // cli-diagnostics.cjs casa "proxy|network|rede" e é largo demais para a
  // saída de um agente.
  { phrase: 'ECONNRESET', failureClass: 'network' },
  { phrase: 'ENOTFOUND', failureClass: 'network' },
  { phrase: 'EAI_AGAIN', failureClass: 'network' },
  { phrase: 'ECONNREFUSED', failureClass: 'network' },
  { phrase: 'ETIMEDOUT', failureClass: 'network' },
  { phrase: 'fetch failed', failureClass: 'network' },
  { phrase: 'socket hang up', failureClass: 'network' },
  { phrase: 'HttpConnectionFailed', failureClass: 'network' },
])

/**
 * Códigos HTTP: um número isolado nunca basta ("line 429" não é limite). Só
 * conta colado a uma destas palavras ("status 429", "Error: 429", "HTTP/1.1
 * 429", `"code":429`). Ao lado de um marcador de capacidade
 * (RESOURCE_EXHAUSTED sem "quota"), o 429 é do servidor, não da conta.
 */
const STATUS_CODE_CONTEXT = Object.freeze(['status', 'error', 'http', 'code'])

const STATUS_CODES = Object.freeze([
  { code: 401, failureClass: 'auth' },
  { code: 402, failureClass: 'billing' },
  { code: 403, failureClass: 'auth', ambiguous: true },
  { code: 429, failureClass: 'limit', yieldsToCapacity: true },
  { code: 500, failureClass: 'provider' },
  { code: 502, failureClass: 'provider' },
  { code: 503, failureClass: 'provider' },
  { code: 504, failureClass: 'provider' },
  { code: 529, failureClass: 'provider' },
])

/**
 * A mensagem de tempo esgotado que o próprio app emite
 * (`createNoVisibleOutputMessage`, cli-event-utils.cjs), já normalizada.
 */
const APP_TIMEOUT_PATTERN = /n[aã]o gerou resposta textual em \d+s/

module.exports = {
  APP_TIMEOUT_PATTERN,
  GENERIC_PATTERNS,
  PROVIDER_PATTERNS,
  STATUS_CODES,
  STATUS_CODE_CONTEXT,
}

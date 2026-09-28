'use strict'

/**
 * Números e vocabulário da cadeia de contas num lugar só (ver
 * `docs/projeto/POLITICA-CONTAS.md`). Cada módulo da pasta `accounts/` (e o
 * repositório SQLite da cadeia) lê daqui em vez de repetir o literal, para que
 * mudar um teto seja uma edição e não uma caça. As listas de vocabulário
 * espelham os CHECKs da migration `017_account_chain.sql`: quem acrescentar um
 * valor aqui precisa de uma migration nova.
 */

/** Tamanho máximo da evidência guardada (a linha que a CLI imprimiu, já redigida). */
const EVIDENCE_MAX_CHARS = 200

/**
 * Quantos caracteres antes do trecho reconhecido a evidência mantém quando a
 * linha é maior que `EVIDENCE_MAX_CHARS`: o bastante para a frase aparecer
 * inteira, sem levar o resto de um JSON de erro longo.
 */
const EVIDENCE_LEAD_CHARS = 40

/** Tamanho, em dígitos hexadecimais, da impressão digital de uma evidência. */
const EVIDENCE_HASH_HEX_CHARS = 32

/**
 * Um horário de reset lido do texto a mais disto do agora é descartado: nenhum
 * limite de uso das CLIs dura mais que uma semana, e uma leitura assim é erro
 * de interpretação (data de outro ano, dia sem mês).
 */
const RESET_MAX_AHEAD_MS = 8 * 24 * 60 * 60 * 1000

/**
 * Espera estimada quando a CLI não informa quando o limite volta ("padrão",
 * mostrado como estimado): 5 h no Claude, a janela de sessão dele, e 15 min
 * nos demais.
 */
const CLAUDE_LIMIT_COOLDOWN_MS = 5 * 60 * 60 * 1000
const DEFAULT_LIMIT_COOLDOWN_MS = 15 * 60 * 1000

/**
 * Por quanto tempo o orquestrador deixa de escolher uma CLI que perdeu o
 * login. Sem prazo, ela ficava fora até reiniciar o app, mesmo depois de a
 * pessoa refazer o login em outro terminal.
 */
const NO_LOGIN_RETRY_MS = 30 * 60 * 1000

/**
 * Por quanto tempo uma checagem de login (ou uma amostra do painel com login
 * conferido) prova que a conta está logada. É a mesma janela em que o painel
 * considera uma medição atual (`STALE_AFTER_MS` em `agent-usage-service.cjs`;
 * um teste confere que os dois não se separam).
 */
const ELIGIBILITY_TTL_MS = 15 * 60 * 1000

/**
 * Checagens de login são processos de CLI; na máquina de referência (2c/4t)
 * mais de duas ao mesmo tempo disputam CPU com os terminais abertos.
 */
const LOGIN_CHECK_MAX_CONCURRENCY = 2

/**
 * Teto de checagens de login rodadas para montar uma proposta: a busca é
 * preguiçosa (para na primeira conta apta) e nunca varre a lista inteira.
 */
const LOGIN_CHECKS_PER_PROPOSAL_MAX = 3

/** Estratégias de escolha do destino; `manual` é a de quem liga a cadeia. */
const CHAIN_STRATEGIES = Object.freeze(['manual', 'round_robin', 'most_capacity', 'subscription_first'])
const DEFAULT_CHAIN_STRATEGY = 'manual'

/** Teto de saltos por linhagem (A→B→C…): padrão e faixa aceita. */
const DEFAULT_MAX_HOPS_PER_LINEAGE = 3
const MIN_MAX_HOPS_PER_LINEAGE = 1
const MAX_MAX_HOPS_PER_LINEAGE = 10

/** Provedores que podem ser membros da lista (Gemini entra travado, sem checagem de login). */
const CHAIN_PROVIDER_IDS = Object.freeze(['codex', 'claude', 'gemini', 'openia'])

/** Classe de cobrança, declarada pela pessoa ou detectada pela CLI. */
const BILLING_CLASSES = Object.freeze(['assinatura', 'uso'])

/** Multiplicador de plano declarado: faixa aceita. */
const MIN_PLAN_MULTIPLIER = 1
const MAX_PLAN_MULTIPLIER = 100

/** Só estas classes põem a conta em espera; rede, provedor e tempo nunca. */
const COOLDOWN_FAILURE_CLASSES = Object.freeze(['limit', 'auth', 'billing'])

/** De onde veio o fim da espera, na ordem de confiança da política. */
const COOLDOWN_UNTIL_SOURCES = Object.freeze(['medicao', 'texto', 'texto_fuso_local', 'padrao', 'checagem'])

/** Por que a espera saiu. */
const COOLDOWN_RELEASE_REASONS = Object.freeze(['vencimento', 'checagem', 'nao_era_limite', 'recarregou', 'manual'])

/** Resultado de uma checagem de login por conta e de onde ele veio. */
const LOGIN_CHECK_STATUSES = Object.freeze([
  'logged_in',
  'logged_out',
  'unknown',
  'cli_ausente',
  'tempo_esgotado',
  'erro',
  'sem_checagem',
])
const LOGIN_CHECK_SOURCES = Object.freeze(['checagem', 'amostra_do_painel'])

/** Identidade que a CLI informou comparada com a vinculada à conta. */
const IDENTITY_STATUSES = Object.freeze(['matched', 'unbound', 'different', 'duplicate', 'missing'])

/** Tipos de evento no registro de trocas. */
const SWITCH_EVENT_KINDS = Object.freeze(['continuation', 'launch', 'manual', 'notice', 'provider_switch'])

/** Estados de um evento do registro de trocas (ver a máquina de estados da política). */
const SWITCH_EVENT_STATES = Object.freeze([
  'noticed',
  'proposed',
  'confirmed',
  'spawning',
  'spawned',
  'declined',
  'dismissed',
  'expired',
  'superseded',
  'spawn_failed',
  'no_candidate',
  'accepted',
  'refused',
])

/**
 * Estados abertos: no máximo um por sessão de origem (índice parcial único da
 * migration 017), e nenhum sobrevive a um reinício.
 */
const OPEN_SWITCH_EVENT_STATES = Object.freeze(['proposed', 'confirmed', 'spawning'])

/**
 * Transições permitidas entre estados. Os demais estados nascem finais
 * (`noticed`, `no_candidate`, `accepted`, `refused`) ou são o fim de uma
 * proposta; nenhum volta a abrir.
 */
const SWITCH_EVENT_TRANSITIONS = Object.freeze({
  proposed: Object.freeze(['confirmed', 'declined', 'dismissed', 'superseded', 'expired']),
  confirmed: Object.freeze(['spawning', 'expired']),
  spawning: Object.freeze(['spawned', 'spawn_failed']),
})

/** Rótulos gravados no registro são fotografia do momento, com teto. */
const SWITCH_LABEL_MAX_CHARS = 120

/** Motivo gravado no registro de trocas (já redigido). */
const SWITCH_REASON_MAX_CHARS = 400

/** Quantas linhas do registro de trocas ficam depois da poda no início do app. */
const SWITCH_EVENTS_RETENTION = 1000

/** Maior página do histórico de trocas pedida pela interface. */
const SWITCH_HISTORY_PAGE_MAX = 50

module.exports = Object.freeze({
  BILLING_CLASSES,
  CHAIN_PROVIDER_IDS,
  CHAIN_STRATEGIES,
  CLAUDE_LIMIT_COOLDOWN_MS,
  COOLDOWN_FAILURE_CLASSES,
  COOLDOWN_RELEASE_REASONS,
  COOLDOWN_UNTIL_SOURCES,
  DEFAULT_CHAIN_STRATEGY,
  DEFAULT_LIMIT_COOLDOWN_MS,
  DEFAULT_MAX_HOPS_PER_LINEAGE,
  EVIDENCE_HASH_HEX_CHARS,
  EVIDENCE_LEAD_CHARS,
  ELIGIBILITY_TTL_MS,
  EVIDENCE_MAX_CHARS,
  IDENTITY_STATUSES,
  LOGIN_CHECKS_PER_PROPOSAL_MAX,
  LOGIN_CHECK_MAX_CONCURRENCY,
  LOGIN_CHECK_SOURCES,
  LOGIN_CHECK_STATUSES,
  MAX_MAX_HOPS_PER_LINEAGE,
  MAX_PLAN_MULTIPLIER,
  MIN_MAX_HOPS_PER_LINEAGE,
  MIN_PLAN_MULTIPLIER,
  NO_LOGIN_RETRY_MS,
  OPEN_SWITCH_EVENT_STATES,
  RESET_MAX_AHEAD_MS,
  SWITCH_EVENTS_RETENTION,
  SWITCH_EVENT_KINDS,
  SWITCH_EVENT_STATES,
  SWITCH_EVENT_TRANSITIONS,
  SWITCH_HISTORY_PAGE_MAX,
  SWITCH_LABEL_MAX_CHARS,
  SWITCH_REASON_MAX_CHARS,
})

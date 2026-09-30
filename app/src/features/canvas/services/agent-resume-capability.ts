/**
 * Como cada CLI de agente sabe voltar a uma conversa, por versão instalada.
 *
 * Antes a decisão era pelo nome: Claude e Codex sempre pelo ID, Gemini nunca.
 * Aqui ela passa a depender da versão, para um método só valer onde foi
 * provado e para uma atualização da CLI recalcular o método sem apagar a
 * conversa gravada (quem compara a versão da gravação com a atual é
 * `explainAgentResume`, em `agent-session.ts`).
 *
 * Puro de propósito: quem descobre a versão é o processo principal
 * (`electron/services/agent-cli-versions.cjs`, com `<cli> --version` e
 * tempo-limite, nunca uma sondagem interativa); aqui só entra o texto dela.
 */

/**
 * - `exact-id`: a CLI volta à conversa pelo ID gravado (o único método que o
 *   app usa sozinho);
 * - `numeric-index`: só pela posição na lista, que muda quando surgem
 *   conversas novas — o app não adivinha;
 * - `latest-only`: só a mais recente da pasta;
 * - `interactive-only`: só escolhendo na lista dentro da CLI;
 * - `unsupported`: sem retomada conhecida.
 */
export type AgentResumeMethod = 'exact-id' | 'numeric-index' | 'latest-only' | 'interactive-only' | 'unsupported'

export const AGENT_RESUME_METHODS: readonly AgentResumeMethod[] = Object.freeze([
  'exact-id',
  'numeric-index',
  'latest-only',
  'interactive-only',
  'unsupported',
])

/**
 * Onde a CLI roda. Hoje só o terminal interativo do canvas decide retomada
 * por aqui; o chat (modo `-p`/stream-json e ACP) tem a própria task e entra
 * como outro modo quando for alinhado.
 */
export type AgentResumeMode = 'interactive'

/**
 * Por que o método foi escolhido:
 * - `documented`: o `--help` da CLI documenta a retomada pelo ID, em qualquer
 *   versão que o app conhece;
 * - `measured`: provado na versão instalada ou numa anterior da mesma regra;
 * - `below-proven`: a versão é anterior à primeira provada;
 * - `unknown-version`: o app não conseguiu ler a versão;
 * - `unknown-provider`: o comando não é uma CLI de agente conhecida.
 */
export type AgentResumeBasis = 'documented' | 'measured' | 'below-proven' | 'unknown-version' | 'unknown-provider'

export type AgentResumeCapability = {
  provider: string
  /** A versão para a qual o método foi resolvido; `null` = não se sabe. */
  version: string | null
  method: AgentResumeMethod
  basis: AgentResumeBasis
}

export type AgentResumeRule = {
  provider: string
  mode: AgentResumeMode
  /** O método quando a versão cumpre `since` (ou sempre, sem `since`). */
  method: AgentResumeMethod
  basis: 'documented' | 'measured'
  /** Primeira versão provada; antes dela, ou sem versão, vale `otherwise`. */
  since?: string
  /** O que a CLI garante fora de `since`. */
  otherwise?: AgentResumeMethod
  /** Sistemas em que a regra vale; ausente = todos (nenhuma regra difere hoje). */
  platforms?: readonly string[]
  /** De onde veio a regra, para quem for atualizar a tabela. */
  evidence: string
}

/**
 * A tabela. Cada linha tem as saídas medidas em
 * `__fixtures__/agent-resume-versions.ts`, que os testes conferem.
 *
 * O Gemini só retoma pelo ID da 0.57 em diante: o `--help` dessa versão
 * documenta apenas `--resume latest` e o índice, mas a própria mensagem de
 * erro da CLI ensina `--resume {uuid}`, e a retomada pelo ID foi medida no
 * terminal interativo (a conversa certa reaberta). Versão anterior ou
 * desconhecida fica com o que o `--help` garante — o índice, que o app não
 * usa.
 */
export const AGENT_RESUME_RULES: readonly AgentResumeRule[] = Object.freeze([
  {
    provider: 'claude',
    mode: 'interactive',
    method: 'exact-id',
    basis: 'documented',
    evidence:
      '`claude --help` (2.1.285): `--resume <session-id>`; conversa inexistente medida em 2.1.x ("No conversation found with session ID: <id>", sai com 1).',
  },
  {
    provider: 'codex',
    mode: 'interactive',
    method: 'exact-id',
    basis: 'documented',
    evidence:
      '`codex resume --help` (0.156.1): `codex resume [SESSION_ID]`, UUID ou nome; conversa inexistente medida em 0.150 e 0.159 ("No saved session found with ID <id>").',
  },
  {
    provider: 'gemini',
    mode: 'interactive',
    method: 'exact-id',
    basis: 'measured',
    since: '0.57.0',
    otherwise: 'numeric-index',
    evidence:
      'Gemini CLI 0.57.0 e 0.62.0, medidos em 30/09/2026 (TTY, HOME isolada): `--resume <uuid>` reabriu a conversa; ID inexistente → "Error resuming session: Invalid session identifier "<id>"." e sai com 42. O `--help` só documenta `latest` e o índice.',
  },
])

/** Mesma regra do processo principal (`agent-cli-versions.cjs`): x.y[.z][-sufixo]. */
const CLI_VERSION_PATTERN = /^\d{1,6}\.\d{1,6}(?:\.\d{1,6})?(?:-[0-9A-Za-z._]{1,40})?$/

export function isCliVersion(value: unknown): value is string {
  return typeof value === 'string' && CLI_VERSION_PATTERN.test(value)
}

/**
 * Compara só a parte numérica: `0.58.0-nightly.1` conta como 0.58.0. Uma
 * prévia de uma versão nova herda a regra dela; o detector de recusa
 * (`resume-outcome-detector.ts`) segura o caso de a prévia não aceitar o ID.
 */
export function compareCliVersions(left: string, right: string): number {
  const parts = (version: string) => version.split('-')[0].split('.').map((part) => Number(part))
  const a = parts(left)
  const b = parts(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

export function resolveAgentResumeCapability(input: {
  provider: string | undefined
  version: string | null | undefined
  mode?: AgentResumeMode
  platform?: string
  rules?: readonly AgentResumeRule[]
}): AgentResumeCapability {
  const provider = input.provider ?? ''
  const version = isCliVersion(input.version) ? input.version : null
  const mode = input.mode ?? 'interactive'
  const rule = (input.rules ?? AGENT_RESUME_RULES).find(
    (candidate) =>
      candidate.provider === provider &&
      candidate.mode === mode &&
      (!candidate.platforms || !input.platform || candidate.platforms.includes(input.platform)),
  )
  if (!rule) return { provider, version, method: 'unsupported', basis: 'unknown-provider' }
  if (!rule.since) return { provider, version, method: rule.method, basis: rule.basis }
  if (!version) return { provider, version, method: rule.otherwise ?? 'unsupported', basis: 'unknown-version' }
  if (compareCliVersions(version, rule.since) < 0) {
    return { provider, version, method: rule.otherwise ?? 'unsupported', basis: 'below-proven' }
  }
  return { provider, version, method: rule.method, basis: rule.basis }
}

/**
 * O método depende da versão instalada? Só nesse caso o canvas segura a
 * retomada de um bloco restaurado até a versão chegar do processo principal;
 * sem isso, o Gemini decidiria sem versão e a faixa piscaria antes de ela
 * chegar. Claude e Codex sobem na hora, como sempre.
 */
export function resumeDependsOnVersion(provider: string | undefined, mode: AgentResumeMode = 'interactive'): boolean {
  return Boolean(resumeProvenSince(provider, mode))
}

/** A primeira versão provada do provider, quando a regra depende de versão. */
export function resumeProvenSince(provider: string | undefined, mode: AgentResumeMode = 'interactive'): string | undefined {
  return AGENT_RESUME_RULES.find((rule) => rule.provider === provider && rule.mode === mode)?.since
}

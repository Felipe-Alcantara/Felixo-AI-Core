import { stripTerminalAnsi } from '../../shared/components/markdown-content-safety'
import type { AgentResumeFailure } from '../services/agent-session'

/**
 * Reconhece, na saída inicial de um spawn que subiu com argumentos de
 * retomada, a resposta da CLI dizendo que a retomada não aconteceu.
 *
 * É o único jeito de saber: a CLI do Claude e a do Codex não devolvem um
 * código de saída próprio para "conversa não existe" nem para "faça login", e
 * o app precisa guardar esse desfecho para não repetir a mesma retomada no
 * próximo reinício (ver `AgentResumeFailure` em `agent-session.ts`).
 *
 * Puro de propósito: não sabe de PTY nem de janela de tempo — quem decide por
 * quanto tempo alimentá-lo é `terminal-session-store.ts`.
 *
 * O cuidado central: no boot de uma retomada que DEU CERTO, a CLI redesenha a
 * conversa anterior, e ela pode conter as mesmas frases (um "No conversation
 * found…" de outra conversa, um "Not logged in" dentro do resultado de uma
 * ferramenta). Por isso `expired` só conta com o ID tentado na linha, e linha
 * de conversa redesenhada nunca conta (ver `conversationRole`).
 */

export type ResumeFailureReason = AgentResumeFailure['reason']

export type ResumeFailurePhrase = {
  /** Como a CLI imprime; a comparação ignora caixa e aceita qualquer espaço. */
  phrase: string
  reason: ResumeFailureReason
  /** Onde a frase foi medida — para quem for atualizar a lista depois. */
  measuredIn: string
  /**
   * Frase curta demais para valer seguida de qualquer coisa: só conta como a
   * linha inteira ou antes do separador "·" que o Claude usa ("Not logged in ·
   * Please run /login"). Mesma regra de `anchor: 'line'` em
   * `electron/services/accounts/cli-failure-patterns.cjs`.
   */
  wholeLine?: boolean
}

/**
 * As frases de falha de retomada, na ordem em que são testadas.
 *
 * `expired` foi medido nos binários instalados: a string de formatação de
 * cada CLI, no caminho em que ela desiste da retomada. As duas imprimem o ID
 * pedido logo depois da frase, e toda frase `expired` só conta seguida, na
 * mesma linha, do ID que o spawn tentou retomar (`createResumeOutcomeDetector`
 * recebe esse ID): uma linha antiga do histórico redesenhado, com a frase e o
 * ID de OUTRA conversa, não é a resposta a este spawn.
 *
 * Ficaram de fora, de propósito, frases medidas que nenhum spawn vigiado
 * imprime: "No conversation found to continue" (Claude Code 2.1.x, `-c`) e
 * "Invalid session identifier" / "No previous sessions found for this
 * project" (Gemini CLI 0.57, `--resume`). A vigia só existe num spawn montado
 * por `buildAgentResumeArgs`, que é sempre `--resume <id>` no Claude e
 * `resume <id>` no Codex e nunca retoma o Gemini; nesse spawn, essas frases só
 * podem vir do histórico redesenhado ou de uma citação, ou seja, só dariam
 * alarme falso. Se o Gemini passar a ser retomado por ID, "Invalid session
 * identifier" volta, exigindo o ID como as outras ("No previous sessions…" não
 * traz ID nenhum e não serve).
 *
 * O ID precisa caber na mesma linha que a frase. Se o terminal quebrar a
 * linha antes do ID, nada é reconhecido — o lado seguro: nada é gravado, e o
 * próximo spawn tenta a mesma conversa e ouve a mesma resposta.
 *
 * `auth` são as frases
 * que `electron/services/accounts/cli-failure-patterns.cjs` já classifica com
 * `failureClass: 'auth'` — "Not logged in · Please run /login", "Invalid API
 * key · Fix external API key" e "Authentication required · Sign in again to
 * continue" do Claude; "Not logged in", "Your access token could not be
 * refreshed" e "Your authentication session could not be refreshed" do Codex.
 * As duas listas precisam andar juntas: se a vigia de contas aprender uma
 * frase de login nova, ela entra aqui também.
 *
 * Limite conhecido de `auth`: uma falha de login que a CLI desenhe como
 * resultado de ferramenta (⎿) ou mensagem do agente (⏺) não é reconhecida,
 * porque é assim que a conversa redesenhada aparece (ver `conversationRole`).
 * É o lado seguro: nada é gravado, e o aviso continua no terminal.
 */
export const RESUME_FAILURE_PHRASES: readonly ResumeFailurePhrase[] = Object.freeze([
  {
    phrase: 'No conversation found with session ID',
    reason: 'expired',
    measuredIn: 'Claude Code 2.1.x, `--resume <id>` ("No conversation found with session ID: <id>", sai com 1)',
  },
  {
    phrase: 'No saved session found with ID',
    reason: 'expired',
    measuredIn: 'Codex 0.150 e 0.159, `resume <id>` ("No saved session found with ID <id>. Run `codex resume` without an ID…")',
  },
  { phrase: 'Not logged in', reason: 'auth', measuredIn: 'Claude Code e Codex', wholeLine: true },
  { phrase: 'Please run /login', reason: 'auth', measuredIn: 'Claude Code' },
  { phrase: 'Invalid API key', reason: 'auth', measuredIn: 'Claude Code' },
  { phrase: 'Authentication required', reason: 'auth', measuredIn: 'Claude Code' },
  { phrase: 'Your access token could not be refreshed', reason: 'auth', measuredIn: 'Codex' },
  { phrase: 'Your authentication session could not be refreshed', reason: 'auth', measuredIn: 'Codex' },
])

/**
 * Quanto de uma linha ainda aberta o detector guarda entre dois pedaços.
 *
 * A frase pode chegar partida entre dois pedaços de saída, então o começo da
 * linha precisa esperar o resto. As linhas já fechadas foram testadas e são
 * descartadas; só a última, ainda sem quebra, fica — e com teto, porque uma
 * CLI redesenhando sem quebra de linha não pode fazer o buffer crescer sem
 * limite. Passou do teto, o começo sai.
 */
export const RESUME_OUTCOME_BUFFER_CHARS = 16 * 1024

/** Sequência de escape sem fim num pedaço: acima disso é lixo, não sequência. */
const MAX_CARRY_CHARS = 4 * 1024

/**
 * Espaços e glifos com que a TUI abre uma linha de aviso (⎿ ⏺ │ ■ ● ⚠ ✕ ❯ • ›).
 * Cópia de `TUI_LINE_LEAD` em `electron/services/accounts/failure-taxonomy.cjs`:
 * o renderer não importa código do processo principal, e a regra tem de ser a
 * mesma — aspas, sinal de diff e pontuação de código ficam de fora, porque é
 * assim que um agente CITA a mensagem (num teste, num diff, numa explicação)
 * sem que ela seja a resposta da CLI.
 */
const LINE_LEAD = '[\\s\\u2022\\u203a\\u2190-\\u21ff\\u2300-\\u23ff\\u2500-\\u27bf\\u2b00-\\u2bff]*'
const LINE_LEAD_REGEX = new RegExp(`^${LINE_LEAD}`)

/**
 * Glifos com que o Claude desenha a conversa: ⏺ abre a mensagem do agente (e
 * a chamada de ferramenta) e ⎿ abre o resultado dela. No boot de um
 * `--resume` que deu certo, a CLI redesenha com eles a conversa anterior.
 */
const CONVERSATION_GLYPH = new RegExp('[\\u23bf\\u23fa]')

/**
 * Abertura de linha da própria CLI antes da frase: o "Error:" com que o Codex
 * e o Claude podem prefixar um erro fatal.
 */
const CLI_LINE_PREFIX = '(?:error\\s*:\\s*)?'

/**
 * Fim do ID na linha: nenhum caractere que ainda poderia ser do ID (os de
 * `SESSION_ID_PATTERN` em `agent-session.ts`). O ponto só encerra quando não
 * vem seguido de outro caractere de ID — é o ponto final da frase do Codex
 * ("…with ID <id>. Run `codex resume`…"), não um "<id>.bak".
 */
const SESSION_ID_END = '(?![a-z0-9_:-]|\\.[a-z0-9_-])'

/**
 * Escapes que mudam de linha viram quebra: uma TUI desenha cada linha
 * posicionando o cursor, sem `\n` nenhum, e sem isto o texto da linha de cima
 * grudaria no começo da frase. CSI A/B/E/F (sobe, desce), H/f (posição
 * absoluta), d (linha absoluta); ESC D/E/M (índice, próxima linha, índice
 * reverso) e ESC 8 (volta ao cursor salvo, em qualquer linha).
 */
// eslint-disable-next-line no-control-regex -- reconhece bytes ANSI de propósito.
const LINE_MOVING_ESCAPE = /\u001b\[[0-?]*[ -/]*[ABEFHfd]|\u001b[DEM8]/g
/** Escapes que só andam na mesma linha (CSI C/G/I/`) viram espaço, como o espaço que pulam. */
// eslint-disable-next-line no-control-regex -- reconhece bytes ANSI de propósito.
const COLUMN_MOVING_ESCAPE = /\u001b\[[0-?]*[ -/]*[CGI`]/g
/**
 * ESC seguido de dígito ou `=`/`>` (salvar cursor, modos do teclado): o
 * `stripTerminalAnsi` tira só o ESC e deixaria o "7" como texto no começo da
 * linha — e o boot do Claude começa exatamente com `ESC 7`.
 */
// eslint-disable-next-line no-control-regex -- reconhece bytes ANSI de propósito.
const RESIDUAL_ESCAPE = /\u001b[0-9=>]/g
// eslint-disable-next-line no-control-regex -- reconhece bytes ANSI de propósito.
const INCOMPLETE_CSI = /^\u001b\[[0-?]*[ -/]*$/

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

function phraseBody(phrase: string): string {
  return phrase.trim().split(/\s+/).map(escapeRegExp).join('\\s+')
}

/**
 * O que vem depois da frase: em `expired`, o ID tentado (depois de ":" ou de
 * espaço, como as duas CLIs imprimem); nas outras, fronteira de palavra —
 * "Not logged in" nunca casa com "Not logged into".
 */
function phraseTail(rule: ResumeFailurePhrase, sessionId: string): string {
  if (rule.reason === 'expired') return `(?::\\s*|\\s+)${escapeRegExp(sessionId)}${SESSION_ID_END}`
  return rule.wholeLine ? '(?:\\s*[.!]?\\s*$|\\s*\\u00b7)' : '(?![a-z0-9])'
}

type LineRule = { reason: ResumeFailureReason; regex: RegExp }

/**
 * Uma expressão por desfecho: a frase no começo da linha (depois só de
 * glifos da TUI e, no máximo, de um "Error:") — "Logged in as" nem começa
 * com a frase. Sem ID tentado, `expired` fica sem regra: sem o ID na linha,
 * nenhuma frase de conversa inexistente prova que a resposta é deste spawn.
 */
function compileLineRules(sessionId: string): LineRule[] {
  const rules: LineRule[] = []
  for (const reason of ['expired', 'auth'] as const) {
    if (reason === 'expired' && !sessionId) continue
    const alternatives = RESUME_FAILURE_PHRASES.filter((rule) => rule.reason === reason).map(
      (rule) => `${phraseBody(rule.phrase)}${phraseTail(rule, sessionId)}`,
    )
    rules.push({ reason, regex: new RegExp(`^${LINE_LEAD}${CLI_LINE_PREFIX}(?:${alternatives.join('|')})`, 'i') })
  }
  return rules
}

function classifyLine(rules: readonly LineRule[], line: string): ResumeFailureReason | null {
  for (const rule of rules) {
    if (rule.regex.test(line)) return rule.reason
  }
  return null
}

/**
 * O papel da linha na conversa redesenhada:
 * - `opens`: os glifos da TUI na abertura trazem ⏺ ou ⎿ — é a conversa;
 * - `continues`: recuada, logo depois de um bloco da conversa — as linhas
 *   seguintes de um resultado ou de uma mensagem longa vêm só recuadas
 *   ("  ⎿  Error: Exit code 1" e, embaixo, "     Not logged in · …");
 * - `blank`: só espaço, não muda nada;
 * - `top`: linha de topo, a única que pode ser a resposta da CLI ao spawn.
 *
 * O bloco só termina numa linha que começa na coluna zero sem ⏺ nem ⎿ (a
 * borda da entrada, um prompt, um erro impresso pela CLI); um novo `opens` só
 * troca de bloco. Uma linha de topo recuada logo depois da conversa passa por
 * continuação e não é reconhecida: o lado seguro, de novo.
 */
function conversationRole(line: string, insideBlock: boolean): 'opens' | 'continues' | 'blank' | 'top' {
  if (/^\s*$/.test(line)) return 'blank'
  if (CONVERSATION_GLYPH.test(LINE_LEAD_REGEX.exec(line)?.[0] ?? '')) return 'opens'
  if (insideBlock && /^\s/.test(line)) return 'continues'
  return 'top'
}

/** Texto legível do pedaço, com uma quebra onde a TUI muda de linha. */
function normalizeTerminalChunk(chunk: string): string {
  return stripTerminalAnsi(
    chunk
      .replace(LINE_MOVING_ESCAPE, '\n')
      .replace(COLUMN_MOVING_ESCAPE, ' ')
      .replace(RESIDUAL_ESCAPE, ''),
  ).replace(/\r\n?/g, '\n')
}

/**
 * Separa do fim do pedaço uma sequência de escape que ainda não terminou
 * (`ESC`, `ESC [ 3`, um OSC sem BEL/ST). Sem isso, a metade de um escape
 * partido entre dois pedaços viraria texto no começo da linha seguinte.
 */
function splitIncompleteEscape(text: string): { complete: string; rest: string } {
  const oscStart = text.lastIndexOf('\u001b]')
  if (oscStart !== -1) {
    const payload = text.slice(oscStart + 2)
    if (!payload.includes('\u0007') && !payload.includes('\u001b\\')) {
      return { complete: text.slice(0, oscStart), rest: text.slice(oscStart) }
    }
  }

  const lastEscape = text.lastIndexOf('\u001b')
  if (lastEscape === -1) return { complete: text, rest: '' }
  const tail = text.slice(lastEscape)
  const incomplete =
    tail.length === 1 ||
    (tail[1] === '[' && INCOMPLETE_CSI.test(tail)) ||
    ((tail[1] === '(' || tail[1] === ')') && tail.length < 3)
  return incomplete ? { complete: text.slice(0, lastEscape), rest: tail } : { complete: text, rest: '' }
}

export type ResumeOutcomeDetector = {
  /**
   * Alimenta um pedaço cru de saída do PTY. Devolve o desfecho na primeira
   * vez que uma frase de falha aparece e `null` em todas as outras chamadas —
   * inclusive nas seguintes, se a mesma frase for redesenhada.
   */
  feed: (chunk: string) => ResumeFailureReason | null
}

export type ResumeOutcomeDetectorOptions = {
  /**
   * A conversa que os argumentos do spawn pediram. `expired` só é reconhecido
   * com este ID na mesma linha da frase; vazio, nunca.
   */
  sessionId: string
}

export function createResumeOutcomeDetector({ sessionId }: ResumeOutcomeDetectorOptions): ResumeOutcomeDetector {
  const rules = compileLineRules(typeof sessionId === 'string' ? sessionId.trim() : '')
  /** Escape incompleto do fim do pedaço anterior. */
  let carry = ''
  /** A última linha, ainda sem quebra: a frase pode estar pela metade nela. */
  let openLine = ''
  /** O começo da linha aberta foi descartado: ela não serve para ancorar a frase. */
  let openLineLostStart = false
  /** A última linha fechada pertence a um bloco da conversa redesenhada. */
  let insideConversation = false
  let recognized = false

  return {
    feed(chunk) {
      if (recognized || typeof chunk !== 'string' || chunk.length === 0) return null

      const { complete, rest } = splitIncompleteEscape(carry + chunk)
      carry = rest.length > MAX_CARRY_CHARS ? '' : rest

      const lines = normalizeTerminalChunk(complete).split('\n')
      lines[0] = openLine + lines[0]
      for (let index = 0; index < lines.length; index += 1) {
        // Sem o começo, não se sabe onde a linha abria: não conta nem muda o bloco.
        if (index === 0 && openLineLostStart) continue
        const line = lines[index]
        const role = conversationRole(line, insideConversation)
        const reason = role === 'top' ? classifyLine(rules, line) : null
        if (reason) {
          recognized = true
          carry = ''
          openLine = ''
          return reason
        }
        // Só a linha fechada decide o bloco: a aberta ainda pode crescer.
        if (index < lines.length - 1) {
          if (role === 'opens') insideConversation = true
          else if (role === 'top') insideConversation = false
        }
      }

      if (lines.length > 1) openLineLostStart = false
      openLine = lines[lines.length - 1]
      if (openLine.length > RESUME_OUTCOME_BUFFER_CHARS) {
        openLine = openLine.slice(-RESUME_OUTCOME_BUFFER_CHARS)
        openLineLostStart = true
      }
      return null
    },
  }
}

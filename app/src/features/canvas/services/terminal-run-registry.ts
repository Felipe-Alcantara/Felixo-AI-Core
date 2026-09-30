// Registro dos blocos de terminal NESTA execução do app: o que precisa
// sobreviver ao desmonte do canvas (ida ao chat e volta) e ao recarregamento
// só da interface (Ctrl+R, "Recarregar interface" do RendererRecoveryBoundary,
// "Recarregar app"), mas não ao fechamento da janela. É o tempo de vida dos
// PTYs: eles moram no processo principal e seguem de pé nos dois primeiros
// casos, e o `ensure()` da volta só reanexa (`reuseExisting`).
//
// Mora no `sessionStorage` da janela, que sobrevive a `location.reload` e zera
// quando a janela (ou o app) fecha. Se ele falhar (ausente, bloqueado, cheio),
// o registro segue em memória: sobrevive ao desmonte do canvas, só não ao
// recarregamento. Nada daqui vai para o disco do canvas — são fatos desta
// execução, não do bloco (a escolha da faixa, por exemplo, não pode decidir
// sozinha a próxima abertura do app).
//
// Puro e sem DOM: quem usa entrega o `sessionStorage`; os testes, um em memória.
import type { AgentResumeChoice } from './agent-session'

export type TerminalRunStorage = Pick<Storage, 'getItem' | 'setItem'>

export const TERMINAL_RUN_STORAGE_KEY = 'felixo:canvas-terminal-run'

/** O que a captura dos restaurados devolve ao canvas, uma vez por montagem. */
export type RestoredTerminalsCapture = {
  /**
   * Agentes que vieram do disco nesta execução do app. Seguem o plano de
   * retomada no (re)spawn — inclusive no Reiniciar depois de ir ao chat e
   * voltar, quando o processo deles já subiu.
   */
  restored: ReadonlySet<string>
  /**
   * Os restaurados cujo processo ainda não subiu nesta execução: só esses
   * podem ser segurados por uma retomada pendente. Um bloco com PTY vivo no
   * processo principal não tem o que segurar — segurá-lo mostraria
   * "aguardando escolha" sobre um agente de pé.
   */
  holdable: ReadonlySet<string>
}

export type TerminalRunRegistry = {
  /** O cartão pediu o processo ao store, ou o bloco foi relançado. */
  markStarted(nodeId: string): void
  hasStarted(nodeId: string): boolean
  /**
   * Chamada quando o canvas hidrata, com os agentes que ele carregou. Um
   * agente sem processo nesta execução veio do disco e entra nos restaurados;
   * quem já era restaurado continua sendo, mesmo com o processo de pé.
   */
  captureRestored(agentTerminalIds: Iterable<string>): RestoredTerminalsCapture
  choiceFor(nodeId: string): AgentResumeChoice | undefined
  /**
   * Espelha no registro todo patch do bloco que mexe na escolha da faixa
   * (`resumeChoice` presente, mesmo como `undefined`, que a limpa).
   */
  recordNodePatch(nodeId: string, patch: object): void
  /**
   * Devolve os nós com a escolha desta execução reaplicada onde o `data` não
   * tem nenhuma — a reidratação do disco a perde, porque ela é transitória. O
   * mesmo array quando nada muda.
   */
  applyChoices<T extends { id: string; data: object }>(nodes: T[]): T[]
  /** "Esquecer associação": as conversas que o reanexo não pode regravar. */
  forgetAgentSessions(nodeId: string, sessionIds: Iterable<string | undefined>): void
  /**
   * Se a conversa descoberta pode ser gravada no bloco. A esquecida não pode
   * (o processo principal a reemite a cada reanexo do mesmo PTY); outra
   * conversa pode, e encerra o esquecimento.
   */
  acceptAgentSession(nodeId: string, sessionId: string): boolean
}

type TerminalRunState = {
  started: Set<string>
  restored: Set<string>
  choices: Map<string, AgentResumeChoice>
  forgotten: Map<string, string[]>
}

const isChoice = (value: unknown): value is AgentResumeChoice => value === 'picker' || value === 'new'

const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0

function emptyState(): TerminalRunState {
  return { started: new Set(), restored: new Set(), choices: new Map(), forgotten: new Map() }
}

/** Lê o que está gravado; qualquer coisa ilegível vira registro vazio, nunca erro. */
function parseState(raw: string | null): TerminalRunState {
  const state = emptyState()
  if (!raw) return state
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return state
  }
  if (!parsed || typeof parsed !== 'object') return state
  const value = parsed as Record<string, unknown>
  if (Array.isArray(value.started)) value.started.filter(isId).forEach((id) => state.started.add(id))
  if (Array.isArray(value.restored)) value.restored.filter(isId).forEach((id) => state.restored.add(id))
  if (value.choices && typeof value.choices === 'object') {
    for (const [id, choice] of Object.entries(value.choices)) {
      if (isId(id) && isChoice(choice)) state.choices.set(id, choice)
    }
  }
  if (value.forgotten && typeof value.forgotten === 'object') {
    for (const [id, sessionIds] of Object.entries(value.forgotten)) {
      const valid = Array.isArray(sessionIds) ? sessionIds.filter(isId) : []
      if (isId(id) && valid.length > 0) state.forgotten.set(id, valid)
    }
  }
  return state
}

function serializeState(state: TerminalRunState): string {
  return JSON.stringify({
    version: 1,
    started: [...state.started],
    restored: [...state.restored],
    choices: Object.fromEntries(state.choices),
    forgotten: Object.fromEntries(state.forgotten),
  })
}

/**
 * `storage` é uma função porque o próprio acesso a `window.sessionStorage`
 * pode lançar (armazenamento bloqueado); qualquer falha dela, de leitura ou
 * de escrita, deixa o registro só em memória.
 */
export function createTerminalRunRegistry(
  storage: () => TerminalRunStorage | null | undefined,
): TerminalRunRegistry {
  let state: TerminalRunState | null = null

  // Lido uma vez, na primeira consulta: nesta janela só este registro escreve
  // a chave, então a memória é a verdade daí em diante.
  const load = (): TerminalRunState => {
    if (state) return state
    let raw: string | null
    try {
      raw = storage()?.getItem(TERMINAL_RUN_STORAGE_KEY) ?? null
    } catch {
      raw = null
    }
    state = parseState(raw)
    return state
  }

  const save = (current: TerminalRunState) => {
    try {
      storage()?.setItem(TERMINAL_RUN_STORAGE_KEY, serializeState(current))
    } catch {
      // Sem sessionStorage o registro vale até o próximo recarregamento.
    }
  }

  return {
    markStarted(nodeId) {
      const current = load()
      if (current.started.has(nodeId)) return
      current.started.add(nodeId)
      save(current)
    },

    hasStarted(nodeId) {
      return load().started.has(nodeId)
    },

    captureRestored(agentTerminalIds) {
      const current = load()
      const ids = [...agentTerminalIds]
      let changed = false
      for (const id of ids) {
        if (!current.started.has(id) && !current.restored.has(id)) {
          current.restored.add(id)
          changed = true
        }
      }
      if (changed) save(current)
      return {
        restored: new Set(ids.filter((id) => current.restored.has(id))),
        holdable: new Set(ids.filter((id) => current.restored.has(id) && !current.started.has(id))),
      }
    },

    choiceFor(nodeId) {
      return load().choices.get(nodeId)
    },

    recordNodePatch(nodeId, patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, 'resumeChoice')) return
      const current = load()
      const choice = (patch as { resumeChoice?: unknown }).resumeChoice
      if (isChoice(choice)) {
        if (current.choices.get(nodeId) === choice) return
        current.choices.set(nodeId, choice)
      } else {
        if (!current.choices.delete(nodeId)) return
      }
      save(current)
    },

    applyChoices(nodes) {
      const current = load()
      if (current.choices.size === 0) return nodes
      let changed = false
      const next = nodes.map((node) => {
        const choice = current.choices.get(node.id)
        if (!choice || (node.data as { resumeChoice?: unknown }).resumeChoice !== undefined) return node
        changed = true
        return { ...node, data: { ...node.data, resumeChoice: choice } }
      })
      return changed ? next : nodes
    },

    forgetAgentSessions(nodeId, sessionIds) {
      const valid = [...sessionIds].filter(isId)
      if (valid.length === 0) return
      const current = load()
      const merged = [...new Set([...(current.forgotten.get(nodeId) ?? []), ...valid])]
      current.forgotten.set(nodeId, merged)
      save(current)
    },

    acceptAgentSession(nodeId, sessionId) {
      const current = load()
      const forgotten = current.forgotten.get(nodeId)
      if (!forgotten) return true
      if (forgotten.includes(sessionId)) return false
      // Conversa nova (outro processo): ela vale, e o esquecimento acabou —
      // o PTY que reemitia a esquecida já não é o deste bloco.
      current.forgotten.delete(nodeId)
      save(current)
      return true
    },
  }
}

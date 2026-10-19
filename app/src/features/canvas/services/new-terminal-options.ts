/**
 * Como abrir um terminal do canvas.
 *
 * Mora num módulo próprio porque três lugares precisam do tipo — o menu da
 * toolbar, o diálogo de passar responsabilidade e o `CanvasView` — e importar
 * um deles a partir do outro só para pegar o tipo criaria dependência entre
 * componentes que não têm nada a ver um com o outro.
 */
import type { FrameColor, TerminalChainOrigin } from '../types'

/** O que um preset de agente acrescenta ao terminal que nasce dele. */
export type NewTerminalPreset = {
  id?: string
  name: string
  /** Contexto inicial; segue por arquivo (initialText), nunca digitado inteiro. */
  contextPrompt: string
  skillIds: string[]
  /** Vira a moldura do terminal. */
  color?: FrameColor
}

export type NewTerminalOptions = {
  command?: string
  args?: string[]
  cwd?: string
  label: string
  planningFile?: string
  /**
   * Marca lançadores configurados antes de o terminal nascer. O spawn direto
   * do Openia ainda recebe o contexto do canvas; nós antigos sem `run`
   * continuam no modo opaco do menu manual.
   */
  launchMode?: 'agent' | 'launcher'
  /**
   * Conta com login próprio escolhida no configurador. Cada conta tem a
   * própria pasta de credencial, então duas convivem sem logout.
   */
  accountId?: string
  /** Provedor da CLI; acompanha a conta até o boundary principal para validação. */
  providerId?: string
  /** Ausente = fixa. `chain` só com "Automática (cadeia)" ou continuação confirmada. */
  accountMode?: 'pinned' | 'chain'
  /** Ticket de uso único devolvido pelo `confirm` da cadeia; nunca persistido. */
  chainTicket?: string
  /** Continuação da cadeia: de qual bloco e troca este nasce. */
  chainOrigin?: TerminalChainOrigin
  /** Preset de agente de onde o terminal nasce (contexto, skills e cor). */
  preset?: NewTerminalPreset
}

/**
 * Como abrir um cartão "Agente na nuvem". Nasce em rascunho: nada é disparado
 * até a confirmação dentro do cartão, que é o que protege o crédito da conta.
 */
export type NewCloudSessionOptions = {
  label: string
  task: string
  /** Pasta do projeto: o `claude --cloud` precisa de uma. */
  cwd: string
  accountId?: string
}

/**
 * Bloco de conversa do Claude por chave de API (`ClaudeApiNode`). Nasce pelo
 * mesmo menu de agentes; `terminalOptions` é o que viraria um terminal, usado
 * só para montar o mesmo contexto do canvas que o terminal receberia.
 */
export type NewClaudeApiOptions = {
  label: string
  accountId: string
  accountLabel?: string
  cwd: string
  model?: string
  effort?: string
  yolo: boolean
  terminalOptions: NewTerminalOptions
}

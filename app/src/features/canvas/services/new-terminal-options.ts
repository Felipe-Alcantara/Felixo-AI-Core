/**
 * Como abrir um terminal do canvas.
 *
 * Mora num módulo próprio porque três lugares precisam do tipo — o menu da
 * toolbar, o diálogo de passar responsabilidade e o `CanvasView` — e importar
 * um deles a partir do outro só para pegar o tipo criaria dependência entre
 * componentes que não têm nada a ver um com o outro.
 */
import type { FrameColor } from '../types'

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
  /** Preset de agente de onde o terminal nasce (contexto, skills e cor). */
  preset?: NewTerminalPreset
}

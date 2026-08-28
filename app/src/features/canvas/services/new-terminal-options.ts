/**
 * Como abrir um terminal do canvas.
 *
 * Mora num módulo próprio porque três lugares precisam do tipo — o menu da
 * toolbar, o diálogo de passar responsabilidade e o `CanvasView` — e importar
 * um deles a partir do outro só para pegar o tipo criaria dependência entre
 * componentes que não têm nada a ver um com o outro.
 */
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
}

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
}

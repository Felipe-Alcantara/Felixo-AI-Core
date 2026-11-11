/**
 * Id do PTY de um bloco no processo principal. O arquivo em disco da saída
 * (`pty-output-archive.cjs`, `CANVAS_PTY_SESSION_PREFIX`) e a exportação do
 * canvas usam o mesmo formato para achar a saída de um bloco. Módulo sem
 * dependência: a gaveta o importa sem puxar o xterm para o carregamento inicial.
 */
export function ptySessionIdForNode(id: string): string {
  return `canvas:${id}`
}

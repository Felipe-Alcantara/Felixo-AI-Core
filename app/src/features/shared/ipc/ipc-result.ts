/**
 * Resultado de uma chamada ao processo principal, no renderer: `{ ok: false }` e rejeição (IPC caído, handler que
 * lançou, ponte ausente) viram a MESMA coisa, com a mensagem para a interface mostrar. Antes cada painel lia o
 * retorno do seu jeito: muitos descartavam o `ok`, outros não tinham `catch`, e a tela dizia "Salvo" ou "Copiado" sem
 * que tivesse acontecido.
 */
export type IpcOutcome<T> = { ok: true; value: T } | { ok: false; message: string }

/** A mensagem de um erro lançado, sem nunca devolver vazio e sem vazar caminho/URL: só o que o handler escolheu dizer. */
export function mensagemDeFalha(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return fallback
}

type ComOk = { ok?: boolean; message?: string }

/**
 * Espera a chamada e normaliza o desfecho:
 * - rejeição → `{ ok: false, message }`;
 * - `{ ok: false, message? }` → `{ ok: false, message: message ?? fallback }`;
 * - `false` (handlers que devolvem boolean, como `projects:delete`) → falha com o `fallback`;
 * - `undefined`/`null` (ponte ausente: `window.felixo?.x?.()` sem a função) → falha com o `fallback`;
 * - o resto é sucesso, com o valor original.
 *
 * `chamada` é uma função, e não uma promessa, para que um `throw` síncrono (ponte que lança antes de devolver a
 * promessa) também caia aqui.
 */
export async function resultadoDeIpc<T>(
  chamada: () => Promise<T> | T | undefined,
  fallback: string,
): Promise<IpcOutcome<T>> {
  let valor: T | undefined
  try {
    valor = await chamada()
  } catch (error) {
    return { ok: false, message: mensagemDeFalha(error, fallback) }
  }
  if (valor === undefined || valor === null || valor === false) return { ok: false, message: fallback }
  if (typeof valor === 'object' && (valor as ComOk).ok === false) {
    const { message } = valor as ComOk
    return { ok: false, message: typeof message === 'string' && message.trim() ? message : fallback }
  }
  return { ok: true, value: valor as T }
}

import { resultadoDeIpc, type IpcOutcome } from './ipc-result'

/** O que a cópia precisa do ambiente (a ponte do navegador), para poder ser testada sem DOM. */
export type AmbienteDeCopia = {
  writeText?: (text: string) => Promise<void>
}

const SEM_CLIPBOARD = 'Este ambiente não permite copiar para a área de transferência.'
const RECUSADO = 'Não foi possível copiar para a área de transferência.'

/**
 * Copia texto e diz se copiou. Sem `navigator.clipboard` (contexto sem permissão, janela sem foco) ou com a
 * promessa rejeitada, devolve falha com a mensagem: quem chama mostra "Copiado" só no sucesso, em vez de um
 * `navigator.clipboard?.writeText(...)` que não faz nada e deixa o ✓ aparecer.
 */
export async function copiarTexto(
  text: string,
  ambiente: AmbienteDeCopia = {
    writeText: globalThis.navigator?.clipboard
      ? (valor) => globalThis.navigator.clipboard.writeText(valor)
      : undefined,
  },
): Promise<IpcOutcome<true>> {
  if (!ambiente.writeText) return { ok: false, message: SEM_CLIPBOARD }
  const escrever = ambiente.writeText
  const desfecho = await resultadoDeIpc(async () => {
    await escrever(text)
    return true as const
  }, RECUSADO)
  // A mensagem do navegador ("Document is not focused") não ajuda a pessoa: fica a frase própria.
  return desfecho.ok ? desfecho : { ok: false, message: RECUSADO }
}

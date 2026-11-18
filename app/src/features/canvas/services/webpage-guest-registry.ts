/**
 * Qual webContents (guest do <webview>) é de qual bloco Página Web. Só o
 * renderer sabe essa ligação; o processo principal confere que o id é mesmo
 * de um <webview> da janela antes de olhar a página. É também o que o cartão
 * de permissão usa para dizer à pessoa QUAL página o agente quer olhar.
 */
export type WebpageGuestInfo = {
  guestId: number
  /** Onde a página está agora (lido na hora do cartão, não na do registro). */
  getUrl: () => string
  profileName: string
}

const guests = new Map<string, WebpageGuestInfo>()

export function registerWebpageGuest(nodeId: string, info: WebpageGuestInfo): () => void {
  guests.set(nodeId, info)
  return () => {
    // Só remove o que este registro pôs: um remonte do bloco já pode ter trocado a entrada.
    if (guests.get(nodeId) === info) guests.delete(nodeId)
  }
}

export function findWebpageGuest(nodeId: string): WebpageGuestInfo | null {
  return guests.get(nodeId) ?? null
}

/** Endereço para a pessoa conferir: sem query nem hash, que podem ter token. */
export function describeGuestAddress(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url ? 'Endereço indisponível' : 'Página em branco'
  }
}

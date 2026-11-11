/**
 * Páginas do Histórico arquivado da gaveta: a saída inteira do PTY que o
 * processo principal guarda em disco por 14 dias (`pty-output-archive.cjs`).
 *
 * O main devolve trechos contínuos do fim para o começo, por offset em bytes.
 * Aqui eles viram uma janela que cresce para trás ("Carregar mais"); acima do
 * teto, as páginas mais novas saem da janela, porque o xterm do visualizador
 * também tem teto de linhas e descartaria o começo — justo o que foi pedido.
 */

/** Uma página por "Carregar mais". */
export const ARCHIVE_PAGE_BYTES = 256 * 1024
/** Janela do visualizador; cabe no scrollback dele com linhas de ~70 bytes. */
export const ARCHIVE_VIEW_MAX_BYTES = 2 * 1024 * 1024
export const ARCHIVE_VIEW_SCROLLBACK = 30_000

export type ArchivePage = { text: string; start: number; end: number }

export type ArchiveView = {
  /** Da mais antiga para a mais nova, contínuas (`pages[i].end === pages[i + 1].start`). */
  pages: ArchivePage[]
  /** Começo do que ainda está guardado (segmentos antigos saem por tamanho e idade). */
  firstOffset: number
  /** Tamanho total guardado quando a última página foi lida. */
  total: number
}

export type ArchiveRead = { page: ArchivePage; firstOffset: number; total: number }

/**
 * Lê a página que termina em `before` (sem `before`: a cauda). Erro do main
 * vira `Error` com a mensagem dele, para a gaveta mostrar.
 */
export async function readArchivePage(ptySessionId: string, before?: number): Promise<ArchiveRead> {
  const readArchive = window.felixo?.pty?.readArchive
  if (!readArchive) {
    throw new Error('O Histórico arquivado só existe no aplicativo.')
  }
  const result = await readArchive({
    sessionId: ptySessionId,
    maxBytes: ARCHIVE_PAGE_BYTES,
    ...(before === undefined ? {} : { before }),
  })
  if (!result.ok) {
    throw new Error(result.message ?? 'Não foi possível ler o Histórico arquivado.')
  }
  return {
    page: { text: result.text ?? '', start: result.start ?? 0, end: result.end ?? 0 },
    firstOffset: result.firstOffset ?? 0,
    total: result.total ?? 0,
  }
}

/**
 * Põe a página lida na frente da janela. Página que não encosta na primeira
 * (o arquivo foi trocado por uma importação ou podado no meio) recomeça a
 * janela nela, em vez de mostrar dois trechos colados como se fossem um.
 */
export function prependArchivePage(
  view: ArchiveView | null,
  read: ArchiveRead,
  maxBytes = ARCHIVE_VIEW_MAX_BYTES,
): ArchiveView {
  const contiguous = view !== null && view.pages.length > 0 && view.pages[0].start === read.page.end
  const pages = contiguous ? [read.page, ...view.pages] : [read.page]
  let bytes = pages.reduce((sum, page) => sum + (page.end - page.start), 0)
  while (pages.length > 1 && bytes > maxBytes) {
    const newest = pages.pop()!
    bytes -= newest.end - newest.start
  }
  return { pages, firstOffset: read.firstOffset, total: read.total }
}

export function archiveViewText(view: ArchiveView): string {
  return view.pages.map((page) => page.text).join('')
}

/** Ainda há saída guardada antes da janela. */
export function archiveViewHasMore(view: ArchiveView | null): boolean {
  return view !== null && view.pages.length > 0 && view.pages[0].start > view.firstOffset
}

export function describeArchiveView(view: ArchiveView | null): string {
  if (view === null) return 'Lendo o Histórico arquivado…'
  if (view.total === 0) return 'Nada arquivado ainda para este terminal.'
  const shownStart = view.pages[0]?.start ?? 0
  const shownEnd = view.pages[view.pages.length - 1]?.end ?? 0
  const shown = `Mostrando ${formatBytes(shownEnd - shownStart)} de ${formatBytes(view.total - view.firstOffset)} guardados`
  if (archiveViewHasMore(view)) return `${shown}.`
  // Sem nada antes: ou é o começo da sessão, ou o resto saiu pela idade/tamanho.
  return view.firstOffset > 0
    ? `${shown}; o trecho mais antigo já saiu do arquivo (14 dias ou teto de tamanho).`
    : `${shown}, desde o começo.`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

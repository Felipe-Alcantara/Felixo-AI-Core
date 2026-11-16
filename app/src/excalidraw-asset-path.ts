/**
 * Pasta das fontes do Excalidraw no build e no dev server. O mesmo valor de
 * `scripts/excalidraw-fonts.cjs`, que as emite ali (um teste confere os dois).
 */
export const EXCALIDRAW_ASSETS_DIR = 'excalidraw-assets'

declare global {
  interface Window {
    /** Lido pelo Excalidraw para achar as fontes do desenho (sem ele, usa o CDN). */
    EXCALIDRAW_ASSET_PATH?: string | string[]
  }
}

/**
 * Base absoluta das fontes do Excalidraw para o documento atual:
 * `app://felixo/` no app instalado, `http://127.0.0.1:5173/` em dev (e
 * `file://…/dist/` em quem ainda abre o build por arquivo, como os benchmarks).
 * Absoluta porque o Excalidraw resolve "/…" e "./…" contra `location.origin`,
 * que sob `file://` é "null".
 */
export function excalidrawAssetPath(baseUri: string): string {
  return new URL(`./${EXCALIDRAW_ASSETS_DIR}/`, baseUri).href
}

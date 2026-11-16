'use strict'

/**
 * Fontes do desenho do Excalidraw servidas pelo próprio app.
 *
 * Sem `window.EXCALIDRAW_ASSET_PATH`, o Excalidraw busca as fontes (Excalifont,
 * Xiaolai, Nunito…) no CDN dele, e a CSP precisava liberar `https://esm.sh`. O
 * plugin `felixo-excalidraw-fonts` do `vite.config.ts` usa este módulo para
 * emitir as fontes do pacote em `dist/excalidraw-assets/fonts/` no build e
 * servi-las da mesma URL no dev server; o renderer aponta o Excalidraw para lá
 * (`src/excalidraw-asset-path.ts`).
 *
 * Todas as famílias entram, inclusive a Xiaolai (CJK, ~12,7 MB): decisão do
 * Felipe em 16/11/2026, para desenho e export saírem com a fonte certa em
 * qualquer idioma e sem rede.
 */

const fs = require('node:fs')
const path = require('node:path')

/** Pasta das fontes no build e no dev server (o mesmo valor de `src/excalidraw-asset-path.ts`). */
const EXCALIDRAW_ASSETS_DIR = 'excalidraw-assets'
const EXCALIDRAW_FONTS_ROOT = path.join(
  __dirname,
  '..',
  'node_modules',
  '@excalidraw',
  'excalidraw',
  'dist',
  'prod',
  'fonts',
)
const DEV_PREFIX = `/${EXCALIDRAW_ASSETS_DIR}/fonts/`

/**
 * O `createUrls` do Excalidraw 0.18 põe o CDN dele (`ASSETS_FALLBACK_URL`,
 * esm.sh) como última URL de cada fonte, mesmo com `EXCALIDRAW_ASSET_PATH`. O
 * Chromium checa a CSP de cada URL ao criar a `FontFace`: a do CDN vira
 * violação (230 por montagem do desenho, medido no app empacotado), embora a
 * fonte carregue da URL local. Sem a opção de desligar no Excalidraw, o build
 * tira esse `push`.
 */
const CDN_FALLBACK_PUSH =
  /[A-Za-z_$][\w$]*\.push\(new URL\([A-Za-z_$][\w$]*,[A-Za-z_$][\w$]*\.ASSETS_FALLBACK_URL\)\),/g

/**
 * Cada `.woff2` do pacote do Excalidraw, com o nome que ele tem no build.
 *
 * @returns {Array<{ fileName: string, absolutePath: string }>}
 */
function listExcalidrawFonts(fontsRoot = EXCALIDRAW_FONTS_ROOT, fsImpl = fs) {
  const fonts = []
  for (const family of fsImpl.readdirSync(fontsRoot, { withFileTypes: true })) {
    if (!family.isDirectory()) continue
    for (const file of fsImpl.readdirSync(path.join(fontsRoot, family.name), { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith('.woff2')) continue
      fonts.push({
        fileName: `${EXCALIDRAW_ASSETS_DIR}/fonts/${family.name}/${file.name}`,
        absolutePath: path.join(fontsRoot, family.name, file.name),
      })
    }
  }
  return fonts.sort((left, right) => left.fileName.localeCompare(right.fileName))
}

/** `<Família>/<arquivo>.woff2`, o único formato de fonte do pacote. Família sem ponto, então nunca `..`. */
const DEV_FONT_PATH = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.woff2$/

/**
 * Arquivo de fonte pedido ao dev server, ou `null` quando o pedido não tem a
 * forma de uma fonte do pacote. A forma é checada antes de qualquer operação
 * de caminho: barra invertida é separador no Windows e nome no POSIX, e o
 * resultado não pode depender do SO. `pathImpl` existe para o teste cobrir os
 * dois.
 */
function resolveDevFontRequest(requestUrl, fontsRoot = EXCALIDRAW_FONTS_ROOT, pathImpl = path) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(String(requestUrl ?? ''), 'http://felixo.invalid').pathname)
  } catch {
    return null
  }
  if (!pathname.startsWith(DEV_PREFIX)) return null
  const relative = pathname.slice(DEV_PREFIX.length)
  if (!DEV_FONT_PATH.test(relative)) return null

  const root = pathImpl.resolve(fontsRoot)
  const absolute = pathImpl.resolve(root, ...relative.split('/'))
  return absolute.startsWith(`${root}${pathImpl.sep}`) ? absolute : null
}

/**
 * Código do Excalidraw sem a URL do CDN na lista de cada fonte. `removed` é
 * quantas vezes o trecho saiu: o build exige exatamente uma, para uma versão
 * nova do Excalidraw não trazer o CDN de volta em silêncio.
 *
 * @returns {{ code: string, removed: number }}
 */
function stripExcalidrawCdnFallback(code) {
  const removed = (String(code).match(CDN_FALLBACK_PUSH) ?? []).length
  return { code: String(code).replace(CDN_FALLBACK_PUSH, ''), removed }
}

module.exports = {
  EXCALIDRAW_ASSETS_DIR,
  EXCALIDRAW_FONTS_ROOT,
  listExcalidrawFonts,
  resolveDevFontRequest,
  stripExcalidrawCdnFallback,
}

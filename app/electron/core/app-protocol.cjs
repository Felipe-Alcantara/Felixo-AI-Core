'use strict'

/**
 * O renderer empacotado carrega por `app://felixo/`, não por `file://`.
 *
 * Sob `file://`, o `'self'` da CSP casa com qualquer URL `file:`: medido em
 * 16/11/2026, um `<script src="file:///…">` de uma pasta qualquer do disco
 * executava, e uma imagem ou um `fetch` de fora do build também passavam. Com
 * um esquema próprio servido só a partir do `dist/`, `'self'` passa a ser o
 * build, e o Chromium não deixa a página buscar `file://` nenhum.
 *
 * Rotas:
 * - `app://felixo/<arquivo do dist>`: o build, sem nada de fora dele;
 * - `app://felixo/__imagem-local?caminho=<absoluto>`: a imagem relativa do
 *   Markdown. Quem autoriza é o processo principal (`authorizeLocalImage`, o
 *   mesmo `text-file-access` dos blocos de arquivo), pelo caminho real: um
 *   link simbólico dentro do projeto que aponte para fora é recusado;
 * - `app://felixo/__midia/<id>`: áudio/vídeo do bloco de arquivo, em partes
 *   (`Range`/206). O id é opaco e emitido pelo processo principal depois de
 *   autorizar o caminho (`media-registry.cjs`); o caminho nunca vai na URL;
 * - `app://felixo/__migracao-origem`: página vazia (sem o app) onde o
 *   `localStorage` da origem `file://` é copiado uma vez
 *   (`renderer-origin-migration.cjs`).
 *
 * A decisão, a prova de conceito e as medições estão em
 * `docs/projeto/ARQUITETURA.md` ("Protocolo app:// do renderer").
 */

const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createMediaResponse } = require('./media-response.cjs')

const APP_SCHEME = 'app'
const APP_HOST = 'felixo'
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`
const APP_INDEX_URL = `${APP_ORIGIN}/index.html`
const LOCAL_IMAGE_PATH = '/__imagem-local'
const MEDIA_PATH_PREFIX = '/__midia/'
const MIGRATION_PAGE_PATH = '/__migracao-origem'
const MIGRATION_PAGE_URL = `${APP_ORIGIN}${MIGRATION_PAGE_PATH}`

/** As mesmas da prévia de imagem do bloco de arquivo (`file-node-preview.ts`). */
const LOCAL_IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.webp'])

/**
 * Sem `standard`, `app://` não tem origem (nem `localStorage`); sem `secure`,
 * vira contexto inseguro; sem `supportFetchAPI`, o `fetch` das fontes do
 * Excalidraw no export falha; `stream` serve o som de notificação.
 */
const APP_SCHEME_PRIVILEGES = Object.freeze({
  standard: true,
  secure: true,
  supportFetchAPI: true,
  corsEnabled: true,
  stream: true,
  codeCache: true,
})

/** Antes do `ready`, uma vez por processo. */
function registerAppScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: APP_SCHEME_PRIVILEGES }])
}

/**
 * Arquivo do build pedido, ou `null` quando sairia do `dist` (`..`, codificado
 * ou não) ou não é deste host.
 */
function resolveBuildFile(requestUrl, distDir, pathImpl = path) {
  let url
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (url.host !== APP_HOST) return null
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0')) return null
  const root = pathImpl.resolve(distDir)
  const file = pathImpl.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  return file.startsWith(`${root}${pathImpl.sep}`) ? file : null
}

/** O caminho da rota da imagem local tem forma de imagem absoluta? A autorização vem depois. */
function isLocalImageRequest(caminho, pathImpl = path) {
  return (
    typeof caminho === 'string' &&
    !caminho.includes('\0') &&
    pathImpl.isAbsolute(caminho) &&
    LOCAL_IMAGE_EXTENSIONS.has(pathImpl.extname(caminho).toLowerCase())
  )
}

const notFound = () => new Response('não encontrado', { status: 404 })
const forbidden = () => new Response('não autorizado', { status: 403 })

/**
 * @param {object} options
 * @param {string} options.distDir - A pasta do build (`dist/`).
 * @param {(filePath: string) => Response | Promise<Response>} options.fetchFile - `net.fetch` de um `file://`.
 * @param {(filePath: string) => string} [options.authorizeLocalImage] - Caminho real autorizado, ou lança.
 * @param {(id: string) => ({ filePath: string, mimeType: string } | null)} [options.resolveMedia] - id opaco -> arquivo autorizado
 * @param {(filePath: string) => boolean} [options.isFile]
 */
function createAppProtocolHandler({ distDir, fetchFile, authorizeLocalImage, resolveMedia, isFile = defaultIsFile }) {
  return async (request) => {
    let url
    try {
      url = new URL(request.url)
    } catch {
      return notFound()
    }
    if (url.host !== APP_HOST) return notFound()

    if (url.pathname === MIGRATION_PAGE_PATH) {
      return new Response('<!doctype html><meta charset="utf-8"><title></title>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }

    if (url.pathname === LOCAL_IMAGE_PATH) {
      const caminho = url.searchParams.get('caminho')
      if (!isLocalImageRequest(caminho) || typeof authorizeLocalImage !== 'function') return forbidden()
      let resolved
      try {
        resolved = authorizeLocalImage(caminho)
      } catch {
        return forbidden()
      }
      // O destino real também precisa ser imagem: `foto.png` pode ser um link para `segredo.txt`.
      if (!isLocalImageRequest(resolved)) return forbidden()
      return fetchOrNotFound(fetchFile, resolved)
    }

    if (url.pathname.startsWith(MEDIA_PATH_PREFIX)) {
      const method = request.method ?? 'GET'
      if (method !== 'GET' && method !== 'HEAD') return forbidden()
      const media = typeof resolveMedia === 'function' ? resolveMedia(url.pathname.slice(MEDIA_PATH_PREFIX.length)) : null
      if (!media) return forbidden()
      try {
        return await createMediaResponse({
          ...media,
          method,
          rangeHeader: request.headers?.get('range') ?? undefined,
        })
      } catch {
        return notFound()
      }
    }

    const file = resolveBuildFile(request.url, distDir)
    if (!file || !isFile(file)) return notFound()
    return fetchOrNotFound(fetchFile, file)
  }
}

/** Uma pasta ou um arquivo que sumiu no meio do caminho é 404, não erro do protocolo. */
async function fetchOrNotFound(fetchFile, filePath) {
  try {
    return await fetchFile(filePath)
  } catch {
    return notFound()
  }
}

/**
 * Instala o handler na sessão padrão (a da janela principal).
 *
 * @param {object} options
 * @param {import('electron').Protocol} options.protocol
 * @param {import('electron').Net} options.net
 * @param {string} options.distDir
 * @param {(filePath: string) => string} [options.authorizeLocalImage]
 * @param {(id: string) => ({ filePath: string, mimeType: string } | null)} [options.resolveMedia]
 */
function registerAppProtocol({ protocol, net, distDir, authorizeLocalImage, resolveMedia }) {
  protocol.handle(
    APP_SCHEME,
    createAppProtocolHandler({
      distDir,
      authorizeLocalImage,
      resolveMedia,
      fetchFile: (filePath) => net.fetch(pathToFileURL(filePath).href),
    }),
  )
}

/**
 * `existsSync`, não `statSync`: dentro do asar o Electron monta um `fs.Stats`
 * com o construtor obsoleto, e o aviso DEP0180 ia para o stderr do smoke de
 * release (medido). Pasta passa aqui e vira 404 no `fetchOrNotFound`.
 */
function defaultIsFile(filePath) {
  return fs.existsSync(filePath)
}

module.exports = {
  APP_HOST,
  APP_INDEX_URL,
  APP_ORIGIN,
  APP_SCHEME,
  APP_SCHEME_PRIVILEGES,
  LOCAL_IMAGE_PATH,
  MEDIA_PATH_PREFIX,
  MIGRATION_PAGE_URL,
  createAppProtocolHandler,
  isLocalImageRequest,
  registerAppProtocol,
  registerAppScheme,
  resolveBuildFile,
}

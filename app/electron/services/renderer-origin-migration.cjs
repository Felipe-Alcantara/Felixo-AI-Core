'use strict'

/**
 * Cópia, uma vez, do `localStorage` da origem `file://` para a `app://felixo`.
 *
 * Trocar a origem do renderer (`core/app-protocol.cjs`) deixa o armazenamento
 * da web para trás: tema, Modo Performance, notificações, onboarding, larguras
 * de painel (~30 chaves). Medido na prova de conceito: a origem nova começa
 * vazia, e o app grava os padrões dele já no primeiro boot.
 *
 * Decisão do Felipe (16/11/2026): copiar uma vez e MANTER a cópia antiga, o que
 * permite voltar a `file://` sem perder nada. Por isso:
 * - roda antes da janela principal, em duas janelas ocultas sem o app: uma
 *   página vazia em `file://` (mesma origem de armazenamento do build) e a
 *   página vazia `app://felixo/__migracao-origem`;
 * - não sobrescreve o que já existir na origem nova;
 * - marca como feita num arquivo do `userData` só no fim; se algo falhar, o
 *   app sobe assim mesmo e tenta de novo no próximo início;
 * - o `sessionStorage` não entra (zera a cada sessão de qualquer jeito).
 */

const fs = require('node:fs')
const path = require('node:path')

const MARKER_FILE = 'origem-app-migrada.json'
const READ_ALL = 'JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])))'

function hiddenWindow(BrowserWindow) {
  return new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
}

/**
 * @param {object} options
 * @param {Function} options.BrowserWindow
 * @param {string} options.userData - Onde ficam a página vazia `file://` e o marcador.
 * @param {string} options.targetUrl - A página vazia da origem nova (`MIGRATION_PAGE_URL`).
 * @param {() => number} [options.now]
 * @returns {Promise<{ status: 'feita' | 'migrada' | 'falhou', keys?: number, ms?: number, error?: string }>}
 */
async function migrateFileOriginStorage({ BrowserWindow, userData, targetUrl, now = () => Date.now() }) {
  const marker = path.join(userData, MARKER_FILE)
  if (fs.existsSync(marker)) return { status: 'feita' }

  const startedAt = now()
  const windows = []
  try {
    const blank = path.join(userData, 'origem-file-vazia.html')
    fs.writeFileSync(blank, '<!doctype html><meta charset="utf-8"><title></title>')

    const reader = hiddenWindow(BrowserWindow)
    windows.push(reader)
    await reader.loadFile(blank)
    const entries = JSON.parse(await reader.webContents.executeJavaScript(READ_ALL))

    const writer = hiddenWindow(BrowserWindow)
    windows.push(writer)
    await writer.loadURL(targetUrl)
    const copied = await writer.webContents.executeJavaScript(`(() => {
      const entries = ${JSON.stringify(entries)}
      let copied = 0
      for (const [key, value] of Object.entries(entries)) {
        if (localStorage.getItem(key) !== null) continue
        localStorage.setItem(key, value)
        copied += 1
      }
      return copied
    })()`)

    const ms = now() - startedAt
    fs.writeFileSync(
      marker,
      `${JSON.stringify({ version: 1, at: new Date(startedAt).toISOString(), keys: Object.keys(entries).length, copied, ms })}\n`,
    )
    try {
      // unlink, não rmSync: no Node 25 num disco J: o rmSync voltava sem apagar.
      fs.unlinkSync(blank)
    } catch {
      // Página vazia que sobrou não atrapalha nada.
    }
    return { status: 'migrada', keys: copied, ms }
  } catch (error) {
    return { status: 'falhou', error: error?.message ? String(error.message) : String(error) }
  } finally {
    for (const win of windows) {
      if (!win.isDestroyed()) win.destroy()
    }
  }
}

module.exports = {
  MARKER_FILE,
  migrateFileOriginStorage,
}

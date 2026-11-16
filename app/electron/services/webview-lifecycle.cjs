/**
 * Wires up every <webview> guest the "Página Web" canvas block attaches to
 * the main window. The element's own `webpreferences` attribute asks for
 * nodeIntegration/contextIsolation/sandbox, but the renderer is not trusted
 * to ask: `registerWebviewAttachGuard` (navigation-guard.cjs) forces the same
 * isolation on every attach and points a guest that doesn't start on a web
 * page at `about:blank` (without destroying it, so the block survives). What
 * remains here is deciding what "open in new window" attempts should do — and
 * only for web pages.
 *
 * Told apart by Chromium's `disposition`:
 *  - 'foreground-tab' / 'background-tab' is a plain target=_blank link — the
 *    product wants that to stay INSIDE the block, so it navigates the same
 *    webview instead of popping a window.
 *  - Everything else ('default', 'new-window', 'other') is a deliberate
 *    `window.open(...)` call, which is how OAuth login buttons (Google/
 *    Apple/Microsoft…) open their popup — 'default' in particular is what
 *    Chromium reports for a *programmatic* window.open(), the common case
 *    for a login button's onclick handler, not just the Shift+click case
 *    'new-window' covers. That popup expects to post a message back to the
 *    opener when it's done; denying it (or redirecting the opener's own tab)
 *    breaks that handshake and the site reports "popup blocked" — the exact
 *    bug this used to cause by only recognizing 'new-window'. These get a
 *    real child window, with the same locked-down webPreferences as every
 *    other webview guest.
 */

const { EXTERNAL_WEB_SCHEMES, classifyExternalUrl } = require('./external-url-policy.cjs')
const { isWebviewDestination, registerWebviewAttachGuard } = require('./navigation-guard.cjs')

/** Popups abertos ao mesmo tempo por bloco, contando os que um popup abre. */
const MAX_POPUPS_PER_BLOCK = 2
// Vaga de um popup aprovado que ainda não nasceu (`did-create-window`): expira
// se a janela nunca nascer, para não travar o bloco sem nenhum popup aberto.
const POPUP_RESERVATION_MS = 10_000

/**
 * Título da janela de um popup: o site que ela mostra, antes do título da
 * página. A barra de título é do sistema, e o site não a falsifica: é como a
 * pessoa confere se o login é mesmo em accounts.google.com. "http://" fica
 * visível porque avisa; o resto (about:blank do começo do login) é "Abrindo…".
 */
function popupWindowTitle(url, pageTitle = '') {
  let where = null
  try {
    const parsed = new URL(String(url ?? ''))
    if (parsed.protocol === 'https:') where = parsed.host
    else if (parsed.protocol === 'http:') where = `http://${parsed.host}`
  } catch {
    where = null
  }
  const site = where || 'Abrindo…'
  const title = typeof pageTitle === 'string' ? pageTitle.trim().slice(0, 120) : ''
  return title && title !== site ? `${site} — ${title}` : site
}

/**
 * Conta os popups de cada bloco (pelo id do webContents do bloco). A vaga é
 * reservada ao aprovar o `window.open` e vira janela no `did-create-window`;
 * a janela fechada libera a vaga.
 */
function createPopupTracker({ max = MAX_POPUPS_PER_BLOCK, now = () => Date.now() } = {}) {
  const byBlock = new Map()
  const entryOf = (blockId) => {
    let entry = byBlock.get(blockId)
    if (!entry) {
      entry = { windows: new Set(), reservations: [] }
      byBlock.set(blockId, entry)
    }
    return entry
  }

  return {
    max,
    tryReserve(blockId) {
      const entry = entryOf(blockId)
      const oldest = now() - POPUP_RESERVATION_MS
      entry.reservations = entry.reservations.filter((at) => at > oldest)
      if (entry.windows.size + entry.reservations.length >= max) return false
      entry.reservations.push(now())
      return true
    },
    attach(blockId, window) {
      const entry = entryOf(blockId)
      entry.reservations.shift()
      entry.windows.add(window)
      window.on('closed', () => entry.windows.delete(window))
    },
    count: (blockId) => byBlock.get(blockId)?.windows.size ?? 0,
    /** O bloco sumiu: fecha os popups dele, que ficariam órfãos. */
    closeAll(blockId) {
      const entry = byBlock.get(blockId)
      byBlock.delete(blockId)
      let closed = 0
      for (const window of entry?.windows ?? []) {
        if (!window.isDestroyed()) {
          window.close()
          closed += 1
        }
      }
      return closed
    },
  }
}

/** Mantém o título do popup com o site atual, mesmo que a página mude o dela. */
function labelPopupWindow(childWindow) {
  const contents = childWindow.webContents
  let pageTitle = ''
  const update = () => {
    if (!childWindow.isDestroyed()) childWindow.setTitle(popupWindowTitle(contents.getURL(), pageTitle))
  }
  childWindow.on('page-title-updated', (event, title) => {
    event.preventDefault()
    pageTitle = title
    update()
  })
  contents.on('did-navigate', () => {
    pageTitle = ''
    update()
  })
  contents.on('did-navigate-in-page', update)
  update()
}

/**
 * Pure decision for a webview's `setWindowOpenHandler`. Separated from the
 * wiring below so the disposition→action logic is testable without mocking
 * `webContents`.
 */
function resolveWindowOpenAction(disposition) {
  if (disposition === 'foreground-tab' || disposition === 'background-tab') {
    return { action: 'deny' }
  }

  return {
    action: 'allow',
    overrideBrowserWindowOptions: {
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    },
  }
}

/**
 * @param {{
 *   onPopupCreated?: (child: import('electron').WebContents, parent: import('electron').WebContents) => void,
 *   onPopupBlocked?: (block: import('electron').WebContents, max: number) => void,
 *   tracker?: ReturnType<typeof createPopupTracker>,
 * }} [options]
 *   `onPopupCreated` avisa de que bloco veio um popup (a faixa de permissão);
 *   `onPopupBlocked`, que um bloco passou do limite de popups.
 */
function registerWebviewLifecycle(mainWindow, options = {}) {
  const tracker = options.tracker ?? createPopupTracker()
  registerWebviewAttachGuard(mainWindow)
  mainWindow.webContents.on('did-attach-webview', (_event, guestWebContents) => {
    applyWindowOpenPolicy(guestWebContents, options.onPopupCreated, {
      tracker,
      block: guestWebContents,
      onPopupBlocked: options.onPopupBlocked,
    })
    // Bloco removido (ou webview recriado): os popups dele fecham junto.
    guestWebContents.on('destroyed', () => tracker.closeAll(guestWebContents.id))
  })
}

/**
 * Aplica a política de novas janelas a um webContents e, recursivamente, a
 * cada popup que ele abrir. Sem a recursão, um popup de login legítimo poderia
 * abrir outras janelas sem nenhuma restrição, em cascata.
 *
 * @param {import('electron').WebContents} webContents
 * @param {(child: import('electron').WebContents, parent: import('electron').WebContents) => void} [onPopupCreated]
 * @param {{ tracker?: ReturnType<typeof createPopupTracker>, block?: import('electron').WebContents, onPopupBlocked?: (block: import('electron').WebContents, max: number) => void }} [limits]
 *   Sem `tracker`, não há limite (usos fora de um bloco).
 */
function applyWindowOpenPolicy(webContents, onPopupCreated, limits = {}) {
  const { tracker, onPopupBlocked } = limits
  const block = limits.block ?? webContents
  webContents.setWindowOpenHandler(({ url, disposition }) => {
    // Só página web vira aba no bloco ou popup. O `loadURL` abaixo é uma
    // navegação iniciada pelo processo principal, que o Chromium NÃO filtra
    // como filtra a do site: sem esta checagem, um `<a target="_blank"
    // href="file:///...">` numa página qualquer abria arquivo local no bloco.
    // `about:blank` passa porque é como popups de login começam.
    if (!isWebviewDestination(url)) return { action: 'deny' }

    const resolved = resolveWindowOpenAction(disposition)
    if (resolved.action === 'deny') {
      const decision = classifyExternalUrl(url, EXTERNAL_WEB_SCHEMES)
      if (decision.ok) webContents.loadURL(decision.url)
      return resolved
    }
    // Janelas em cascata custam memória e escondem o endereço: além do limite
    // por bloco, o `window.open` é negado e o bloco avisa a pessoa.
    if (tracker && !tracker.tryReserve(block.id)) {
      onPopupBlocked?.(block, tracker.max)
      return { action: 'deny' }
    }
    return resolved
  })

  webContents.on('did-create-window', (childWindow) => {
    onPopupCreated?.(childWindow.webContents, webContents)
    tracker?.attach(block.id, childWindow)
    labelPopupWindow(childWindow)
    applyWindowOpenPolicy(childWindow.webContents, onPopupCreated, { tracker, block, onPopupBlocked })
  })
}

module.exports = {
  MAX_POPUPS_PER_BLOCK,
  applyWindowOpenPolicy,
  createPopupTracker,
  popupWindowTitle,
  registerWebviewLifecycle,
  resolveWindowOpenAction,
}

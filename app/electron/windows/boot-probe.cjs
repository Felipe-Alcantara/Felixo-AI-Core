/**
 * Sonda de abertura: registra no QA Logger em que camada a janela principal
 * parou, para o caso da "tela preta que some ao recarregar" (relatado em
 * 26/11/2026, sem reprodução). Só observa; não recarrega nada.
 *
 * Como ler a entrada `main:boot-probe`:
 * - `carga: 0`: a página não terminou de carregar;
 * - `pronto: false`: carregou, mas o React não montou;
 * - `pronto: true` e `fracaoClara` perto de 0: o renderer desenhou preto;
 * - `pronto: true`, com pixels claros, e a pessoa vendo preto: o quadro não
 *   chegou à tela (GPU/compositor).
 */
const PROBE_DELAY_MS = 6_000
const NEVER_LOADED_MS = 15_000
const CAPTURE_TIMEOUT_MS = 5_000
/** Abaixo disto a captura é preta (medido: preta 0,0005; interface 0,008 ou mais). */
const DARK_FRACTION = 0.002

function watchBoot(win, { log, agendar = (task, ms) => setTimeout(task, ms).unref(), now = Date.now }) {
  const start = now()
  let loads = 0
  const record = (level, message, details) =>
    log({ level, scope: 'main:boot-probe', message, details: { carga: loads, ms: now() - start, ...details } })

  async function probe() {
    if (win.isDestroyed()) return
    const janela = { visivel: win.isVisible(), minimizada: win.isMinimized() }
    try {
      const pronto = await withTimeout(
        win.webContents.executeJavaScript("document.documentElement.dataset.felixoAppReady === 'true'"),
      )
      const fracaoClara = brightFraction(await withTimeout(win.webContents.capturePage()))
      // Janela escondida ou minimizada não pinta: preto ali não é defeito.
      const preta = janela.visivel && !janela.minimizada && fracaoClara < DARK_FRACTION
      record(pronto && !preta ? 'info' : 'warn', 'sonda', { ...janela, pronto, fracaoClara })
    } catch (error) {
      record('warn', 'sonda', { ...janela, erro: error?.message ?? String(error) })
    }
  }

  win.webContents.on('did-finish-load', () => {
    loads += 1
    record('info', 'carregou', {})
    agendar(probe, PROBE_DELAY_MS)
  })
  win.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) record('error', 'falha de carga', { code, description, url })
  })
  agendar(() => (loads === 0 ? probe() : undefined), NEVER_LOADED_MS)
}

/** Um renderer travado não responde: sem teto, a sonda nunca registraria o pior caso. */
function withTimeout(promise) {
  let timer
  const limit = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('sem resposta do renderer')), CAPTURE_TIMEOUT_MS)
  })
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}

/** Fração de pixels claros, amostrando 1 a cada 16 do bitmap BGRA. */
function brightFraction(image) {
  const bytes = image.toBitmap()
  let bright = 0
  let total = 0
  for (let i = 0; i < bytes.length; i += 64) {
    total += 1
    if (bytes[i] + bytes[i + 1] + bytes[i + 2] > 150) bright += 1
  }
  return total === 0 ? 0 : bright / total
}

module.exports = { watchBoot }

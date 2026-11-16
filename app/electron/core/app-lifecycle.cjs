/**
 * Decide whether closing the last window should terminate Electron.
 *
 * macOS keeps packaged applications alive in the Dock by convention. The
 * development process is different: its Vite server belongs to the same
 * start-up session and must be released when the last window closes, or the
 * next `npm run dev` inherits a stale port.
 *
 * No `--release-smoke` quem encerra é o próprio smoke (`app.exit`): a janela
 * oculta da CSP fecha antes do PTY, e sair ali derrubava o resto do smoke no
 * Windows e no Linux.
 *
 * Antes de a janela principal existir também não: a migração do
 * `localStorage` para a origem `app://` (`renderer-origin-migration.cjs`) abre
 * e fecha janelas ocultas no início, e o app saía antes de abrir (medido no
 * pacote: código 0, com o marcador da migração gravado).
 *
 * @param {object} options
 * @param {string} options.platformName
 * @param {boolean} options.isDevelopment
 * @param {boolean} [options.isReleaseSmoke]
 * @param {boolean} [options.mainWindowCreated] - Sem o valor, conta como criada.
 * @returns {boolean}
 */
function shouldQuitWhenAllWindowsClosed({ platformName, isDevelopment, isReleaseSmoke = false, mainWindowCreated = true }) {
  if (isReleaseSmoke || !mainWindowCreated) return false
  return platformName !== 'darwin' || Boolean(isDevelopment)
}

module.exports = { shouldQuitWhenAllWindowsClosed }

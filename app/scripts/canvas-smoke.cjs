'use strict'

/**
 * Smoke de PR do Canvas — primeira fatia do gate de CI de evidência visual
 * (task "Felixo AI Core/Canvas — criar gate CI de evidência visual,
 * estabilidade e regressão"). Reusa a mesma infraestrutura do `felixo
 * devtools` (sessão isolada, invisível, porta CDP local) em vez de duplicar
 * lógica de spawn/CDP — é a mesma automação que um agente usa manualmente.
 *
 * Escopo desta primeira fatia: mount (o canvas hidrata de verdade) e viewport
 * mínimo (a interface não estoura a largura da janela num tamanho pequeno).
 * "No-overlap", foco e tool/terminal/notificação ficam para as próximas
 * fatias — precisam de `data-testid` nos componentes de layout, que ainda
 * não existem, e adicioná-los sem revisão fica fora do escopo desta task
 * inicial. Ver a página da task para o plano completo.
 */

const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { connect, readState } = require('../electron/cli/felixo-devtools.cjs')

const APP_DIR = path.resolve(__dirname, '..')
const FELIXO_CLI = path.join(APP_DIR, 'electron', 'cli', 'felixo.cjs')
const MIN_VIEWPORT = { width: 375, height: 667 }
const HYDRATION_TIMEOUT_MS = 20_000

function runCli(args) {
  return execFileSync(process.execPath, [FELIXO_CLI, 'devtools', ...args], {
    cwd: APP_DIR,
    encoding: 'utf8',
  })
}

// Boot frio do Electron sob Xvfb em runner de CI Linux mediu mais que os 15s
// padrão do `waitForCdp` (o Vite já tinha respondido antes disso — não é
// timeout de compilação, é o próprio processo Electron demorando pra abrir a
// porta CDP). 60s dá folga sem mudar o padrão do CLI para quem chama sem
// `--timeout`.
const DEVTOOLS_LAUNCH_TIMEOUT_MS = 60_000

async function withDevtoolsSession(action) {
  runCli(['launch', '--timeout', String(DEVTOOLS_LAUNCH_TIMEOUT_MS)])
  try {
    return await action()
  } finally {
    // O quit precisa rodar mesmo se a asserção falhar, ou a sessão isolada
    // (processo Electron + perfil temporário) vaza para a próxima execução.
    try {
      runCli(['quit'])
    } catch (error) {
      console.warn(`[canvas-smoke] falha ao encerrar a sessão DevTools: ${error.message}`)
    }
  }
}

async function checarMontagem(page) {
  await page.waitForFunction(
    () => document.body.innerText.includes('Canvas pronto'),
    null,
    { timeout: HYDRATION_TIMEOUT_MS },
  )
}

async function checarViewportMinimo(page) {
  await page.setViewportSize(MIN_VIEWPORT)
  // Um reflow após o resize precisa de um tick; sem ele o scrollWidth ainda
  // reflete o layout anterior e o teste passaria por sorte, não por medição.
  await page.waitForTimeout(200)
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  if (overflow.scrollWidth > overflow.clientWidth) {
    throw new Error(
      `[canvas-smoke] overflow horizontal no viewport mínimo (${MIN_VIEWPORT.width}x${MIN_VIEWPORT.height}): ` +
        `scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`,
    )
  }
}

async function main() {
  await withDevtoolsSession(async () => {
    const state = readState()
    const { browser, page } = await connect(state)
    try {
      await checarMontagem(page)
      await checarViewportMinimo(page)
    } catch (error) {
      const output = path.join(APP_DIR, 'build', `canvas-smoke-failure-${process.platform}.png`)
      try {
        require('node:fs').mkdirSync(path.dirname(output), { recursive: true })
        await page.screenshot({ path: output })
        console.error(`[canvas-smoke] captura de falha salva em ${output}`)
      } catch (screenshotError) {
        console.error(`[canvas-smoke] não foi possível capturar a falha: ${screenshotError.message}`)
      }
      throw error
    } finally {
      await browser.close()
    }
  })
  console.log('[canvas-smoke] mount + viewport mínimo: ok')
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error))
  process.exitCode = 1
})

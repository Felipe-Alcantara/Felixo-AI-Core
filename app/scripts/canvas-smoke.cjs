'use strict'

/**
 * Smoke de PR do Canvas — primeira fatia do gate de CI de evidência visual
 * (task "Felixo AI Core/Canvas — criar gate CI de evidência visual,
 * estabilidade e regressão"). Reusa a mesma infraestrutura do `felixo
 * devtools` (sessão isolada, invisível, porta CDP local) em vez de duplicar
 * lógica de spawn/CDP — é a mesma automação que um agente usa manualmente.
 *
 * Fatia 1: mount (o canvas hidrata de verdade) e viewport mínimo (a interface
 * não estoura a largura da janela num tamanho pequeno).
 * Fatia 2: os três landmarks de layout (topbar/sidebar/canvas, marcados com
 * `data-felixo-region`) existem e têm tamanho visível — um "no-overlap"
 * literal foi tentado e abandonado (o layout é full-bleed com chrome
 * flutuante por design; ver o comentário de `checarLandmarksVisiveis`) — e
 * foco inicial ao abrir uma ferramenta (o input de busca precisa herdar o
 * foco, não só aparecer), usando `data-felixo-canvas-panel`, que já existia
 * antes desta task. Terminal/notificação continuam pendentes — ver a página
 * da task para o plano completo.
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

const LAYOUT_REGIONS = ['topbar', 'sidebar', 'canvas']

/**
 * Medido nesta task: o layout do canvas é full-bleed com chrome flutuante
 * (a topbar sobrepõe o canvas de propósito, e a sidebar hoje também é
 * posicionada por cima dele, não como coluna flex reservando espaço) — não
 * um layout empilhado onde regiões nunca se tocam. Um "no-overlap" literal
 * (nenhum par de regiões pode compartilhar área) marcaria como falha o
 * próprio design pretendido, então foi abandonado nesta fatia; ver a página
 * da task para o registro completo da tentativa.
 *
 * O que fica, então, é a checagem que não depende do modelo de posicionamento
 * mudar no futuro: cada landmark existe no DOM e tem tamanho visível de
 * verdade (não colapsou pra 0x0 por um CSS quebrado) — um regressão real de
 * layout (ex.: sidebar sumindo, topbar com altura zerada) ainda derruba isto.
 */
async function checarLandmarksVisiveis(page) {
  const retangulos = await page.evaluate((seletores) => {
    return seletores.map((regiao) => {
      const elemento = document.querySelector(`[data-felixo-region="${regiao}"]`)
      if (!elemento) return { regiao, ausente: true }
      const rect = elemento.getBoundingClientRect()
      return { regiao, width: rect.width, height: rect.height }
    })
  }, LAYOUT_REGIONS)

  const ausentes = retangulos.filter((r) => r.ausente).map((r) => r.regiao)
  if (ausentes.length > 0) {
    throw new Error(`[canvas-smoke] região(ões) de layout não encontrada(s) no DOM: ${ausentes.join(', ')}`)
  }

  const colapsadas = retangulos.filter((r) => r.width <= 0 || r.height <= 0)
  if (colapsadas.length > 0) {
    throw new Error(
      `[canvas-smoke] região(ões) de layout com tamanho zerado: ${JSON.stringify(colapsadas)}`,
    )
  }
}

async function checarFocoAoAbrirFerramenta(page) {
  // "Buscar" é o rótulo acessível do botão na sidebar (ActivityRailButton).
  await page.getByRole('button', { name: 'Buscar' }).click()

  const painel = page.locator('[data-felixo-canvas-panel="search"]')
  await painel.waitFor({ state: 'visible', timeout: 5_000 })

  const campoFocado = await page.evaluate(() => {
    const painelEl = document.querySelector('[data-felixo-canvas-panel="search"]')
    const input = painelEl?.querySelector('input')
    return Boolean(input) && document.activeElement === input
  })
  if (!campoFocado) {
    throw new Error(
      '[canvas-smoke] abrir "Buscar" não moveu o foco para o campo de busca do painel',
    )
  }

  // Fecha a ferramenta pra não vazar estado pro próximo check (viewport
  // mínimo já espera a sidebar/topbar no estado padrão).
  await page.getByRole('button', { name: 'Buscar' }).click()
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
      await checarLandmarksVisiveis(page)
      await checarFocoAoAbrirFerramenta(page)
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
  console.log('[canvas-smoke] mount + landmarks visíveis + foco + viewport mínimo: ok')
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error))
  process.exitCode = 1
})

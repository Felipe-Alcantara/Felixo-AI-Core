/**
 * Espera, do lado do Node, até `check()` devolver verdadeiro (ou até o teto).
 * Existe porque `page.waitForFunction(async () => ...)` NÃO espera: a função devolve
 * uma Promise, que já é "verdadeira", e a espera termina na hora (foi o que fez o
 * smoke do PR #67 falhar em ~1,5 s no macOS em vez de esperar até o teto).
 * `check` roda sempre a cada `intervalMs`; erros dele contam como "ainda não".
 */
async function esperarAte(check, { timeoutMs, intervalMs = 200, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now } = {}) {
  const limite = now() + timeoutMs
  for (;;) {
    try {
      if (await check()) return true
    } catch {
      // Ainda não (página recarregando, API indisponível): tenta de novo até o teto.
    }
    if (now() >= limite) return false
    await sleep(intervalMs)
  }
}

/** Espera que não segura o processo do Node vivo (a leitura pode voltar antes). */
function sleepSemSegurar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms).unref())
}

/** Lê o tamanho da página, ou `null` se ela não responder no prazo (renderer ocupado). */
async function lerTamanho(page, timeoutMs, sleep) {
  const leitura = page
    .evaluate(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight }))
    .catch(() => null)
  return Promise.race([leitura, sleep(timeoutMs).then(() => null)])
}

/**
 * Espera a página ficar exatamente no tamanho pedido (`innerWidth`×`innerHeight`),
 * com o prazo de quem chama. Na falha, a mensagem traz o tamanho pedido e o lido
 * depois do prazo; se nem essa leitura voltar, diz que a página não respondeu.
 *
 * A distinção importa: logo depois de um reload com a fixture do smoke, o renderer
 * passa segundos em long tasks montando os blocos pesados (medido em 26/09/2026:
 * o primeiro `evaluate` depois de "canvas pronto" rodou de 2 a 9 s depois da
 * chamada, com long tasks de até 6,6 s). O predicado não roda nesse intervalo, e
 * uma espera curta estoura com o tamanho certo na tela.
 */
async function waitForViewport(page, viewport, { timeoutMs, readTimeoutMs = 2_000, sleep = sleepSemSegurar, now = Date.now } = {}) {
  const pedido = { width: viewport.width, height: viewport.height }
  const inicio = now()
  try {
    await page.waitForFunction(
      ({ width, height }) => window.innerWidth === width && window.innerHeight === height,
      pedido,
      { timeout: timeoutMs },
    )
  } catch (error) {
    const lido = await lerTamanho(page, readTimeoutMs, sleep)
    const estado = lido
      ? `a página está em ${lido.innerWidth}×${lido.innerHeight} (innerWidth×innerHeight)`
      : `a página não respondeu à leitura do tamanho em ${readTimeoutMs} ms (renderer ocupado)`
    throw new Error(
      `viewport ${pedido.width}×${pedido.height} não confirmado em ${now() - inicio} ms (prazo ${timeoutMs} ms): ${estado}. ` +
      `Causa original: ${String(error?.message ?? error).split('\n')[0]}`,
    )
  }
}

/**
 * Põe a página no tamanho pedido e espera confirmar. Não pede de novo o tamanho que
 * já é o atual: o Playwright não reenvia uma emulação igual à última, e a chamada
 * só custaria uma volta a mais ao servidor antes da mesma espera.
 */
async function definirViewport(page, viewport, options) {
  const atual = page.viewportSize()
  if (!atual || atual.width !== viewport.width || atual.height !== viewport.height) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
  }
  await waitForViewport(page, viewport, options)
}

module.exports = { definirViewport, esperarAte, waitForViewport }

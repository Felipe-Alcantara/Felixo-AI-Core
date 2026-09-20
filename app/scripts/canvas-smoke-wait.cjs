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

module.exports = { esperarAte }

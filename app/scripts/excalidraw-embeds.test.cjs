'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const test = require('node:test')

/**
 * Prova no Chromium do Electron do projeto (não no app) que um embed com
 * script não alcança `window.parent` nem a origem do app. A página "do app"
 * leva a CSP real do build; os frames são montados com o `sandbox` que o app
 * usa (`ISOLATED_EMBED_SANDBOX`, sem `allow-same-origin`). O terceiro frame é o
 * controle: com `allow-same-origin` (o que o Excalidraw faz em X e Reddit) o
 * mesmo script alcança o pai, então o teste enxerga a diferença.
 */
test('o script de um embed isolado não alcança window.parent nem a origem do app', { timeout: 150000 }, (t) => {
  // O Electron precisa de servidor gráfico; o job de testes do Linux não tem (só o do smoke usa xvfb).
  // A prova roda no Windows e no macOS do CI e em qualquer Linux com $DISPLAY.
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    t.skip('sem servidor gráfico ($DISPLAY) neste Linux')
    return
  }
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  // O Chromium sobe devagar (ou trava) em máquina ocupada: até 3 tentativas.
  // No Linux do CI o helper SUID do sandbox do sistema não está configurado e o Electron aborta; só esta
  // página de fixture roda sem ele. O isolamento provado é o do atributo `sandbox` do iframe, que não depende disso.
  const sandboxArgs = process.platform === 'linux' ? ['--no-sandbox'] : []
  let run
  for (let attempt = 0; attempt < 3; attempt += 1) {
    run = spawnSync(
      require('electron'),
      [...sandboxArgs, path.join(__dirname, 'test-support', 'embed-isolation-electron.cjs')],
      { encoding: 'utf8', timeout: 40000, env, windowsHide: true },
    )
    if (run.status === 0) break
  }
  assert.equal(run.status, 0, `electron saiu com ${run.status}: ${run.stderr}`)
  const line = run.stdout.split('\n').find((text) => text.startsWith('RESULT:'))
  assert.ok(line, `sem resultado: ${run.stdout} ${run.stderr}`)
  const { appOrigin, embedOrigin, results, hijacks, windowUrl } = JSON.parse(line.slice('RESULT:'.length))

  const blocked = (frame) => {
    for (const key of ['parentDocument', 'parentOrigin', 'parentStorage']) {
      assert.equal(frame[key], 'ERR:SecurityError', `${key} alcançou o pai`)
    }
  }

  // Script que roda num documento isolado (como o srcdoc que o Excalidraw monta para X/Reddit/Gist).
  blocked(results['isolated-srcdoc'])
  assert.equal(results['isolated-srcdoc'].origin, 'null')
  assert.equal(results['isolated-srcdoc'].ownStorage, 'ERR:SecurityError', 'origem opaca não tem storage')

  // Página de embed do próprio site: outra origem, e também sem alcance ao pai.
  blocked(results['isolated-cross-origin'])
  assert.equal(results['isolated-cross-origin'].origin, embedOrigin)
  assert.notEqual(embedOrigin, appOrigin)

  // Controle: com allow-same-origin o mesmo script chega ao pai.
  assert.equal(results['control-same-origin-srcdoc'].parentOrigin, appOrigin)
  assert.notEqual(results['control-same-origin-srcdoc'].parentDocument, 'ERR:SecurityError')

  // Nenhum dos frames conseguiu navegar a janela do app.
  assert.equal(hijacks, 0)
  assert.equal(windowUrl, `${appOrigin}/`)
})

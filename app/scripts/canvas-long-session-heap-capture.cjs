'use strict'

/**
 * Sessão longa real do Canvas com captura de heap snapshot DevTools —
 * a lacuna deixada pela task principal de performance (que mediu terminal/PTY
 * com performance.memory, mas não abriu o app de verdade com webviews e
 * observou snapshots DevTools reais). Ver task Notion "Performance — capturar
 * snapshots de heap do Canvas real em sessão longa no Linux".
 *
 * SEMPRE usa perfil descartável (nunca --real-profile) e NUNCA roda contra o
 * canvas de produção; o próprio "Limpar canvas" faz parte do roteiro, então
 * rodar aqui contra dados reais destruiria trabalho do usuário.
 *
 * Roteiro (task): baseline → fixture criada → carga estabilizada →
 * estado degradado (fim da duração) → depois de remover terminais/webviews →
 * depois de "Limpar canvas". Um .heapsnapshot + métricas CDP + RSS real (via
 * `ps`) em cada checkpoint; diff entre checkpoints ao final.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { execFileSync } = require('node:child_process')
const devtools = require('../electron/cli/felixo-devtools.cjs')
const { collectDescendantPids, fixtureWebpageHtml, parsePsOutput, summarizeRss } = require('./canvas-heap-session-fixtures.cjs')
const heapAnalysis = require('./heap-snapshot-analysis.cjs')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function parseArgs(argv) {
  const options = { terminals: 6, webviews: 2, durationMinutes: 30, sampleIntervalMs: 60_000, outDir: null }
  for (const arg of argv) {
    const [key, value] = arg.split('=')
    if (key === '--terminals') options.terminals = Number(value)
    else if (key === '--webviews') options.webviews = Number(value)
    else if (key === '--duration-minutes') options.durationMinutes = Number(value)
    else if (key === '--sample-interval-ms') options.sampleIntervalMs = Number(value)
    else if (key === '--out-dir') options.outDir = value
    else if (key !== undefined) throw new Error(`Opção desconhecida: ${arg}`)
  }
  if (!options.outDir) throw new Error('--out-dir é obrigatório.')
  if (!Number.isInteger(options.terminals) || options.terminals < 0) throw new Error('--terminals inválido.')
  if (!Number.isInteger(options.webviews) || options.webviews < 0) throw new Error('--webviews inválido.')
  if (!Number.isFinite(options.durationMinutes) || options.durationMinutes < 0) throw new Error('--duration-minutes inválido.')
  return options
}

/** Serve a mesma fixture autocontida em qualquer rota — uma webview por índice de URL (`/webview-0`, `/webview-1`...). */
function startFixtureServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const label = (req.url ?? '/').replace(/[^a-z0-9-]/gi, '') || 'raiz'
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(fixtureWebpageHtml(`fixture-${label}`))
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

function realPs(deps = {}) {
  const output = (deps.execFileSync ?? execFileSync)('ps', ['-eo', 'pid,ppid,rss,comm', '--no-headers'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  return parsePsOutput(output)
}

async function captureCheckpoint(name, { outDir, mainPid, deps = {} }) {
  const heapFile = path.join(outDir, 'snapshots', `${name}.heapsnapshot`)
  await devtools.executarDevtools(['heap-snapshot', heapFile])
  const metricsResult = await devtools.executarDevtools(['metrics'])
  const metrics = JSON.parse(metricsResult.saida)
  const processes = realPs(deps)
  const pids = collectDescendantPids(mainPid, processes)
  const rss = summarizeRss(processes, pids)
  const checkpoint = { name, at: new Date().toISOString(), heapFile, metrics, rss }
  fs.mkdirSync(path.join(outDir, 'checkpoints'), { recursive: true })
  fs.writeFileSync(path.join(outDir, 'checkpoints', `${name}.json`), `${JSON.stringify(checkpoint, null, 2)}\n`)
  process.stdout.write(`[checkpoint] ${name}: heap ${(metrics.JSHeapUsedSize / 1024 / 1024).toFixed(1)} MiB · nós DOM ${metrics.Nodes} · listeners ${metrics.JSEventListeners} · RSS total ${rss.totalMiB} MiB (${rss.processCount} processos)\n`)
  return checkpoint
}

/**
 * Força o provider para "Nenhum (shell)" antes de cada terminal — nunca uma
 * CLI real, para não acender uma sessão de agente de verdade (custo de quota,
 * ruído) só para gerar carga de fixture. Cobre as duas variantes de UI já
 * vistas em produção: o `<select>` nativo do binário empacotado mais antigo e
 * o combobox `FelixoSelect` (`role=combobox`) da fonte atual.
 */
async function selectShellProvider() {
  const nativeResult = await devtools.executarDevtools(['eval', `(function(){
    var select = document.querySelectorAll('select')[0];
    if (!select) return 'NO_NATIVE_SELECT';
    var option = Array.from(select.options).find(function(o){ return o.textContent.trim() === 'Nenhum (shell)'; });
    if (!option) return 'NO_SHELL_OPTION';
    var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok-native';
  })()`])
  if (nativeResult.saida.includes('ok-native')) return
  await devtools.executarDevtools(['click', '[aria-label="Agente"]'])
  await sleep(150)
  await devtools.executarDevtools(['click-text', 'Nenhum (shell)'])
}

async function createTerminals(count) {
  for (let index = 0; index < count; index += 1) {
    await devtools.executarDevtools(['click', '[aria-label="Configurar novo agente"]'])
    await sleep(200)
    await selectShellProvider()
    await sleep(150)
    await devtools.executarDevtools(['click-text', 'Abrir agente'])
    await sleep(400)
  }
}

async function createWebviews(count, port) {
  for (let index = 0; index < count; index += 1) {
    await devtools.executarDevtools(['click-text', 'Página Web'])
    await sleep(150)
    await devtools.executarDevtools(['type', `http://127.0.0.1:${port}/webview-${index}`])
    await devtools.executarDevtools(['press', 'Enter'])
    await sleep(400)
  }
}

async function createMiscNodes() {
  for (const label of ['Novo bloco', 'Grupo']) {
    try {
      await devtools.executarDevtools(['click-text', label])
      await sleep(150)
      await devtools.executarDevtools(['press', 'Enter'])
      await sleep(300)
    } catch (error) {
      process.stdout.write(`[fixture] "${label}" não pôde ser criado, ignorado (${error.message}).\n`)
    }
  }
}

/** Digita um texto benigno num terminal aleatório — carga de "atividade" sem depender de CLI real. */
async function simulateActivityBurst() {
  await devtools.executarDevtools(['click-text', 'aguardando'])
  await devtools.executarDevtools(['type', `echo sessao-longa-heap-${Date.now()}`])
  await devtools.executarDevtools(['press', 'Enter'])
}

async function removeAllTerminalAndWebviewNodes() {
  const result = await devtools.executarDevtools(['eval', `(function(){
    var ids = Array.from(document.querySelectorAll('.react-flow__node'))
      .map(function(n){ return n.getAttribute('data-id'); })
      .filter(function(id){ return id && (id.startsWith('terminal-') || id.startsWith('webpage-')); });
    var removed = [];
    ids.forEach(function(id){
      var node = document.querySelector('.react-flow__node[data-id="' + id + '"]');
      var btn = node && node.querySelector('button[aria-label="Remover no"]');
      if (btn) { btn.click(); removed.push(id); }
    });
    return JSON.stringify(removed);
  })()`])
  return JSON.parse(result.saida)
}

/** Aceita o `window.confirm` nativo de "Limpar canvas" — precisa de UMA conexão CDP contínua (o clique some se a página se reconectar no meio). */
async function clearCanvasWithConfirm() {
  const state = devtools.readState({})
  const { browser, page } = await devtools.connect(state, {})
  try {
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByText('Limpar', { exact: true }).first().click()
    await sleep(1000)
  } finally {
    await browser.close()
  }
}

async function runLongSession(options, deps = {}) {
  fs.mkdirSync(options.outDir, { recursive: true })
  const { server, port } = await startFixtureServer()
  const report = { options, startedAt: new Date().toISOString(), checkpoints: [] }
  try {
    const launchResult = await devtools.executarDevtools(['launch'])
    if (launchResult.codigo !== 0) throw new Error(`Falha ao abrir a sessão DevTools: ${launchResult.erro}`)
    const state = devtools.readState({})
    const mainPid = state.pid

    report.checkpoints.push(await captureCheckpoint('01-baseline', { outDir: options.outDir, mainPid, deps }))

    await createTerminals(options.terminals)
    await createWebviews(options.webviews, port)
    await createMiscNodes()
    await sleep(2000)
    report.checkpoints.push(await captureCheckpoint('02-fixture-criada', { outDir: options.outDir, mainPid, deps }))

    const durationMs = options.durationMinutes * 60_000
    const deadline = Date.now() + durationMs
    let burstCount = 0
    while (Date.now() < deadline) {
      const remainingMs = deadline - Date.now()
      const waitMs = Math.min(options.sampleIntervalMs, remainingMs)
      if (waitMs <= 0) break
      await sleep(waitMs)
      if (options.terminals > 0) {
        try { await simulateActivityBurst(); burstCount += 1 } catch { /* alternância idle/ativo tolera falha isolada de digitação */ }
      }
      const processes = realPs(deps)
      const pids = collectDescendantPids(mainPid, processes)
      const sample = { at: new Date().toISOString(), rss: summarizeRss(processes, pids) }
      fs.appendFileSync(path.join(options.outDir, 'rss-samples.jsonl'), `${JSON.stringify(sample)}\n`)
    }
    report.activityBursts = burstCount

    report.checkpoints.push(await captureCheckpoint('03-estado-degradado', { outDir: options.outDir, mainPid, deps }))

    const removed = await removeAllTerminalAndWebviewNodes()
    await sleep(2000)
    report.removedNodeIds = removed
    report.checkpoints.push(await captureCheckpoint('04-apos-remocao', { outDir: options.outDir, mainPid, deps }))

    await clearCanvasWithConfirm()
    await sleep(2000)
    report.checkpoints.push(await captureCheckpoint('05-apos-limpar-canvas', { outDir: options.outDir, mainPid, deps }))
  } finally {
    await devtools.executarDevtools(['quit'])
    server.close()
  }

  report.finishedAt = new Date().toISOString()

  const summaries = report.checkpoints.map((checkpoint) => ({ name: checkpoint.name, summary: heapAnalysis.loadAndSummarize(checkpoint.heapFile) }))
  const diffs = []
  for (let index = 1; index < summaries.length; index += 1) {
    diffs.push({
      from: summaries[index - 1].name,
      to: summaries[index].name,
      diff: heapAnalysis.diffSummaries(summaries[index - 1].summary, summaries[index].summary),
    })
  }
  report.diffs = diffs
  fs.writeFileSync(path.join(options.outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)

  const markdown = ['# Sessão longa de heap do Canvas real', '', `Opções: ${JSON.stringify(options)}`, '']
  for (const { from, to, diff } of diffs) {
    markdown.push(heapAnalysis.formatDiff(diff, from, to, 512 * 1024), '')
  }
  fs.writeFileSync(path.join(options.outDir, 'report.md'), `${markdown.join('\n')}\n`)

  return report
}

async function main(argv) {
  const options = parseArgs(argv)
  const report = await runLongSession(options)
  process.stdout.write(`\nRelatório: ${path.join(options.outDir, 'report.md')}\n`)
  return report
}

module.exports = { captureCheckpoint, clearCanvasWithConfirm, createTerminals, createWebviews, parseArgs, removeAllTerminalAndWebviewNodes, runLongSession, startFixtureServer }

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`)
    process.exitCode = 1
  })
}

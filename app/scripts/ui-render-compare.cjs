#!/usr/bin/env node
'use strict'

/**
 * Junta os JSONs de `ui-render-performance.cjs` (baseline histórico + build
 * atual) num arquivo só e aplica o critério de aceite da validação no
 * notebook físico de referência (docs/performance/PERFORMANCE.md).
 *
 * Uso (na pasta app/):
 *   node scripts/ui-render-compare.cjs --baseline=b.json --current=c.json --out=validacao.json
 *
 * Saída: o JSON (hardware, backend, configs, medianas, rodadas, veredito) e o
 * resumo em Markdown em `<out>.md`, pronto para colar na task e nos docs.
 * Código de saída 0 só se o veredito for `aprovado`.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const MIN_ROUNDS_OK = 3
// Rasterizadores por software: se o backend for um destes, não é teste físico.
const SOFTWARE_RENDERER = /basic render|swiftshader|llvmpipe|softpipe|software/i
// Campos de `config` que precisam ser iguais nos dois builds para a comparação valer.
const CONFIG_KEYS = ['rounds', 'warmup', 'durationMs', 'nodes', 'edges', 'onboarding', 'cpuThrottle']

function parseArgs(argv) {
  const options = { baseline: null, current: null, out: null }
  for (const arg of argv) {
    const [key, ...rest] = arg.split('=')
    const value = rest.join('=')
    if (key === '--baseline') options.baseline = path.resolve(value)
    else if (key === '--current') options.current = path.resolve(value)
    else if (key === '--out') options.out = path.resolve(value)
    else throw new Error(`Argumento desconhecido: ${arg}`)
  }
  if (!options.baseline || !options.current || !options.out) {
    throw new Error('Uso: --baseline=<json> --current=<json> --out=<json>')
  }
  return options
}

const readReport = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

/** Backend gráfico de um relatório: físico só com GPU ativa de vendorId real e renderer fora da lista de software. */
function describeBackend(report) {
  const gpu = report.gpu ?? {}
  const renderer = gpu.renderer ?? null
  const fisico = report.render === 'gpu' && Boolean(gpu.ativa?.vendorId) && !SOFTWARE_RENDERER.test(renderer ?? '')
  return { render: report.render, renderer, vendor: gpu.vendor ?? null, glImplementation: gpu.glImplementation ?? null, ativa: gpu.ativa ?? null, fisico }
}

/** Modelo da GPU e versão do driver pelo Windows; vazio em outros sistemas ou se o PowerShell falhar. */
function readWindowsHardware() {
  if (process.platform !== 'win32') return { gpus: [] }
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      'Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,DriverDate | ConvertTo-Json -Compress'],
    { encoding: 'utf8', timeout: 15_000 })
    const parsed = JSON.parse(out)
    return { gpus: Array.isArray(parsed) ? parsed : [parsed] }
  } catch {
    return { gpus: [] }
  }
}

function collectHardware() {
  const cpus = os.cpus()
  return {
    cpu: cpus[0]?.model?.trim() ?? null,
    nucleos: cpus.length,
    ramGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    windows: os.release(),
    plataforma: `${process.platform}-${process.arch}`,
    ...readWindowsHardware(),
    // Preencher à mão: o script não consegue ler.
    alimentacao: 'preencher: na tomada, plano de energia',
    cargaDeFundo: 'preencher: processos fechados',
  }
}

/** Compara cada rodada Performance (`on`) com a mediana do baseline e conta as que passam nos três limites. */
function evaluate(baseline, current) {
  const base = baseline.summary?.baseline
  const normal = current.summary?.off
  const perf = current.summary?.on
  if (!base || !perf) throw new Error('JSON sem summary.baseline (--legacy-baseline) ou summary.on (build atual).')
  const porQuadro = (run) => run.porQuadro?.estiloMs
  const baseEstilo = base.estiloPorQuadroMs
  const rodadas = current.runs.filter((run) => run.mode === 'on').map((run) => {
    const fps = run.frames.fps
    const p95 = run.frames.p95Ms
    const estilo = porQuadro(run)
    return { rodada: run.round, fps, p95Ms: p95, estiloPorQuadroMs: estilo, passa: fps >= base.fps && p95 <= base.frameP95Ms && estilo <= baseEstilo }
  })
  const aprovadas = rodadas.filter((r) => r.passa).length
  const medianas = {
    fps: perf.fps >= base.fps,
    p95: perf.frameP95Ms <= base.frameP95Ms,
    estilo: perf.estiloPorQuadroMs <= baseEstilo,
  }
  return { baseline: base, normalAtual: normal ?? null, performance: perf, rodadas, rodadasAprovadas: aprovadas, medianas }
}

function build(baseline, current, hardware = collectHardware()) {
  const problemas = []
  const backends = { baseline: describeBackend(baseline), atual: describeBackend(current) }
  if (!backends.baseline.fisico || !backends.atual.fisico) {
    problemas.push('GPU acelerada não comprovada em pelo menos um build (renderer de software ou sem GPU ativa): não é teste físico.')
  }
  for (const key of CONFIG_KEYS) {
    if (JSON.stringify(baseline.config?.[key]) !== JSON.stringify(current.config?.[key])) {
      problemas.push(`config.${key} difere: baseline=${JSON.stringify(baseline.config?.[key])} atual=${JSON.stringify(current.config?.[key])}.`)
    }
  }
  if (baseline.config?.nodes !== 48 || baseline.config?.onboarding) problemas.push('Cenário fora do roteiro (48 nós, tutorial fechado).')
  if (baseline.config?.cpuThrottle !== 4) problemas.push('cpuThrottle diferente de 4.')
  for (const [nome, report] of [['baseline', baseline], ['atual', current]]) {
    if (report.modeToggleCoverage?.supportedByBaseline === false && nome === 'atual') continue
    const incompletas = (report.runs ?? []).filter((run) => run.sidebarToggleCount !== 2)
    if (incompletas.length) problemas.push(`${nome}: ${incompletas.length} rodada(s) sem 2 toggles concluídos.`)
  }
  const resultado = evaluate(baseline, current)
  const criterio = resultado.rodadasAprovadas >= MIN_ROUNDS_OK
  const veredito = problemas.length ? 'invalido' : criterio ? 'aprovado' : 'reprovado'
  return {
    geradoEm: new Date().toISOString(),
    veredito,
    problemas,
    hardware,
    backends,
    commits: { baseline: baseline.baselineCommit ?? null },
    config: current.config,
    ...resultado,
  }
}

function markdown(r) {
  const f = (n, d = 2) => (typeof n === 'number' ? n.toFixed(d).replace('.', ',') : 'n/d')
  const linhas = [
    `## Validação no notebook de referência: ${r.veredito.toUpperCase()}`,
    '',
    `- Hardware: ${r.hardware.cpu} (${r.hardware.nucleos} núcleos), ${r.hardware.ramGiB} GiB, Windows ${r.hardware.windows}`,
    `- GPU/driver: ${r.hardware.gpus.map((g) => `${g.Name} ${g.DriverVersion}`).join('; ') || 'n/d'}`,
    `- Backend (atual): ${r.backends.atual.renderer ?? 'n/d'} · físico: ${r.backends.atual.fisico ? 'sim' : 'NÃO'}`,
    `- Alimentação: ${r.hardware.alimentacao} · Carga: ${r.hardware.cargaDeFundo}`,
    '',
    '| Versão e modo | FPS | Quadro p95 | Estilo por quadro |',
    '|---|---:|---:|---:|',
    `| baseline Normal | ${f(r.baseline.fps)} | ${f(r.baseline.frameP95Ms, 3)} ms | ${f(r.baseline.estiloPorQuadroMs, 3)} ms |`,
  ]
  if (r.normalAtual) linhas.push(`| atual Normal | ${f(r.normalAtual.fps)} | ${f(r.normalAtual.frameP95Ms, 3)} ms | ${f(r.normalAtual.estiloPorQuadroMs, 3)} ms |`)
  linhas.push(
    `| atual Performance | ${f(r.performance.fps)} | ${f(r.performance.frameP95Ms, 3)} ms | ${f(r.performance.estiloPorQuadroMs, 3)} ms |`,
    '',
    `Rodadas Performance que passam nos três limites contra o baseline: ${r.rodadasAprovadas} de ${r.rodadas.length} (mínimo ${MIN_ROUNDS_OK}).`,
  )
  if (r.problemas.length) linhas.push('', 'Problemas:', ...r.problemas.map((p) => `- ${p}`))
  return `${linhas.join('\n')}\n`
}

function run(argv) {
  const options = parseArgs(argv)
  const result = build(readReport(options.baseline), readReport(options.current))
  fs.mkdirSync(path.dirname(options.out), { recursive: true })
  fs.writeFileSync(options.out, `${JSON.stringify(result, null, 2)}\n`)
  fs.writeFileSync(options.out.replace(/\.json$/i, '') + '.md', markdown(result))
  console.log(markdown(result))
  return result.veredito === 'aprovado' ? 0 : 1
}

if (require.main === module) {
  try {
    process.exitCode = run(process.argv.slice(2))
  } catch (error) {
    console.error(`[ui-render-compare] ${error.message}`)
    process.exitCode = 2
  }
}

module.exports = { build, describeBackend, evaluate, markdown, parseArgs }

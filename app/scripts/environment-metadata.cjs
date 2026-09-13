'use strict'

/**
 * @module environment-metadata
 * Metadados do ambiente de execução, coletados uma vez, reutilizados por
 * qualquer bancada desta task ("Performance — correlacionar instalação do
 * gerenciador com responsividade e energia no artefato").
 *
 * CPU, RAM, versão do Electron/Node e arquitetura já eram capturados de
 * forma duplicada em `terminal-output-performance.cjs`,
 * `canvas-connection-performance.cjs` e `terminal-scrollback-benchmark.cjs`
 * — este módulo os centraliza e acrescenta o que faltava (GPU, resolução,
 * modo de energia, estado da rede), sempre marcando `disponivel: false`
 * em vez de inventar um valor quando a leitura real não existe no ambiente
 * (CI hospedado não tem bateria nem GPU dedicada, por exemplo — isso é uma
 * limitação a declarar, não um zero a preencher).
 */

const os = require('node:os')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

/**
 * @typedef {object} UnavailableMetric
 * @property {false} disponivel
 * @property {string} motivo
 */

function indisponivel(motivo) {
  return { disponivel: false, motivo }
}

/**
 * CPU/RAM/plataforma — sempre disponível, o próprio Node já expõe.
 * @returns {object}
 */
function collectHostBasics() {
  return {
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    cpuModel: os.cpus()[0]?.model ?? null,
    cpuCount: os.cpus().length,
    totalMemoryMiB: Math.round(os.totalmem() / 1024 / 1024),
    node: process.version,
    electron: process.versions.electron ?? null,
  }
}

/**
 * GPU: só existe uma fonte confiável e simples dentro do processo principal
 * do Electron já pronto (`app.getGPUInfo('basic')`). Fora desse contexto
 * (script Node puro, CI sem Electron rodando) não há como ler sem inventar
 * — declarado indisponível.
 *
 * @param {{ getGPUInfo?: (level: 'basic' | 'complete') => Promise<unknown> }} [electronApp]
 * @returns {Promise<object | UnavailableMetric>}
 */
async function collectGpuInfo(electronApp) {
  if (!electronApp || typeof electronApp.getGPUInfo !== 'function') {
    return indisponivel('GPU só é lida de dentro do processo principal do Electron com o app pronto.')
  }
  try {
    const info = await electronApp.getGPUInfo('basic')
    return { disponivel: true, info }
  } catch (error) {
    return indisponivel(`getGPUInfo falhou: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Resolução: mesma limitação da GPU — só existe via `screen` do Electron,
 * já com o app pronto e um display real (headless simulado às vezes não
 * reporta nada útil).
 *
 * @param {{ getPrimaryDisplay?: () => { size: { width: number, height: number }, scaleFactor: number } }} [electronScreen]
 * @returns {object | UnavailableMetric}
 */
function collectDisplayInfo(electronScreen) {
  if (!electronScreen || typeof electronScreen.getPrimaryDisplay !== 'function') {
    return indisponivel('Resolução só é lida via `screen` do Electron, com o app pronto.')
  }
  try {
    const display = electronScreen.getPrimaryDisplay()
    return { disponivel: true, width: display.size.width, height: display.size.height, scaleFactor: display.scaleFactor }
  } catch (error) {
    return indisponivel(`screen.getPrimaryDisplay falhou: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Modo de energia (bateria/CA), por SO — best-effort, nunca lança. Runners
 * de CI hospedados normalmente não têm bateria: "sem bateria detectada" é
 * uma resposta válida e esperada, diferente de "não disponível" (que
 * significa "não sabemos ler isso aqui").
 *
 * @param {string} [platformName]
 * @param {typeof fs} [fileSystem] - Injetável nos testes.
 * @param {typeof execFileSync} [runCommand] - Injetável nos testes.
 * @returns {object | UnavailableMetric}
 */
function collectPowerMode(platformName = process.platform, fileSystem = fs, runCommand = execFileSync) {
  try {
    if (platformName === 'linux') {
      return collectLinuxPowerMode(fileSystem)
    }
    if (platformName === 'darwin') {
      return collectMacPowerMode(runCommand)
    }
    if (platformName === 'win32') {
      return collectWindowsPowerMode(runCommand)
    }
    return indisponivel(`Plataforma ${platformName} sem leitor de energia implementado.`)
  } catch (error) {
    return indisponivel(`Leitura de energia falhou: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function collectLinuxPowerMode(fileSystem = fs) {
  const supplyRoot = '/sys/class/power_supply'
  if (!fileSystem.existsSync(supplyRoot)) {
    return { disponivel: true, fonte: 'sem bateria detectada (desktop/CI)', status: null }
  }
  const supplies = fileSystem.readdirSync(supplyRoot)
  const battery = supplies.find((name) => /^BAT/i.test(name))
  if (!battery) {
    return { disponivel: true, fonte: 'sem bateria detectada (desktop/CI)', status: null }
  }
  const status = fileSystem.readFileSync(`${supplyRoot}/${battery}/status`, 'utf8').trim()
  const capacityPath = `${supplyRoot}/${battery}/capacity`
  const capacity = fileSystem.existsSync(capacityPath)
    ? Number(fileSystem.readFileSync(capacityPath, 'utf8').trim())
    : null
  return { disponivel: true, fonte: `/sys/class/power_supply/${battery}`, status, capacityPercent: capacity }
}

function collectMacPowerMode(runCommand = execFileSync) {
  const output = runCommand('pmset', ['-g', 'batt'], { encoding: 'utf8', timeout: 5000 })
  const semBateria = /No batteries/i.test(output)
  if (semBateria) {
    return { disponivel: true, fonte: 'pmset -g batt', status: 'sem bateria detectada (desktop/CI)' }
  }
  return { disponivel: true, fonte: 'pmset -g batt', status: output.trim() }
}

function collectWindowsPowerMode(runCommand = execFileSync) {
  // WMI via PowerShell — best-effort; runners sem bateria devolvem null em
  // BatteryStatus, o que já é a resposta correta ("sem bateria").
  const output = runCommand(
    'powershell.exe',
    ['-NoProfile', '-Command', '(Get-CimInstance -ClassName Win32_Battery | Select-Object -First 1 -ExpandProperty BatteryStatus)'],
    { encoding: 'utf8', timeout: 5000 },
  ).trim()
  return { disponivel: true, fonte: 'Win32_Battery via CIM', status: output || 'sem bateria detectada (desktop/CI)' }
}

/**
 * Estado da rede: presença de interface não-interna ativa. Não faz
 * requisição de rede nenhuma (nada de "ping o google" — lento, flakiness
 * externa, não é isso que a task pede) — só reporta o que o SO já expõe.
 *
 * @returns {object}
 */
function collectNetworkState() {
  const interfaces = os.networkInterfaces()
  const ativos = Object.entries(interfaces)
    .filter(([, addrs]) => (addrs ?? []).some((addr) => !addr.internal))
    .map(([name]) => name)

  return { disponivel: true, interfacesAtivas: ativos, temInterfaceNaoInterna: ativos.length > 0 }
}

/**
 * Ponto de entrada único desta task: junta tudo num objeto sanitizado
 * (sem caminho de disco nem identificador de máquina), pronto pra entrar
 * em qualquer relatório de bancada.
 *
 * @param {object} [options]
 * @param {object} [options.electronApp] - `app` do Electron, quando chamado de dentro do processo principal já pronto.
 * @param {object} [options.electronScreen] - `screen` do Electron, mesma condição.
 * @returns {Promise<object>}
 */
async function collectEnvironmentMetadata({ electronApp, electronScreen } = {}) {
  return {
    collectedAt: new Date().toISOString(),
    host: collectHostBasics(),
    gpu: await collectGpuInfo(electronApp),
    display: collectDisplayInfo(electronScreen),
    power: collectPowerMode(),
    network: collectNetworkState(),
  }
}

module.exports = {
  collectDisplayInfo,
  collectEnvironmentMetadata,
  collectGpuInfo,
  collectHostBasics,
  collectNetworkState,
  collectPowerMode,
}

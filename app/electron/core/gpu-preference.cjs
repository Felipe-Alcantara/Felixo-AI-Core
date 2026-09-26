'use strict'

/**
 * @module gpu-preference
 * Preferência de placa de vídeo (Automático / Integrada / Dedicada) e o plano
 * que a aplica antes de `app.whenReady()`.
 *
 * Fica separada de `graphics-mode.cjs` de propósito: o modo gráfico decide SE
 * a GPU é usada (hardware × software); esta preferência decide QUAL GPU,
 * quando há mais de uma. Automático é o comportamento de antes desta opção e
 * não aplica nada.
 *
 * Mecanismos, conferidos na fonte do Chromium 146 (Electron 41.10.7) e
 * medidos no app (ver `docs/projeto/IA.md`, 26/09/2026):
 * - Linux: Dedicada liga o ANGLE sobre Vulkan (`--use-angle=vulkan`, de
 *   `ui/gl/gl_switches.cc`, e as features `Vulkan`, `VulkanFromANGLE` e
 *   `DefaultANGLEVulkan`, de `gpu/config/gpu_finch_features.cc` e
 *   `ui/gl/gl_switches.cc`). Com Vulkan, o Chromium renderiza na dedicada.
 *   Variáveis de ambiente gravadas aqui NÃO chegam ao processo de GPU: no
 *   Linux ele nasce de um zygote criado antes do `main.cjs` rodar (medido em
 *   `/proc/<pid>/environ`). Por isso Dedicada não mexe no ambiente, e
 *   Integrada, quando o shell herdou variáveis que forçam a NVIDIA (como as
 *   do `prime-run`), limpa o ambiente e relança o app uma vez (como relançar,
 *   inclusive no AppImage, está em `app-relaunch.cjs`; a rede de segurança do
 *   relançamento, em `gpu-start-guard.cjs`).
 * - Windows e macOS: os workarounds `force_high_performance_gpu` e
 *   `force_low_power_gpu`, documentados pelo Electron 41
 *   (`docs/api/command-line-switches.md`). O Chromium os copia para o
 *   processo de GPU (`content/browser/gpu/gpu_process_host.cc`) e escolhe o
 *   adaptador em `SetupGLDisplayManagerEGL` (`gpu/ipc/service/gpu_init.cc`),
 *   que só existe nesses dois sistemas.
 */

const fs = require('node:fs')
const path = require('node:path')

const GPU_PREFERENCES = Object.freeze(['auto', 'integrada', 'dedicada'])
const GPU_PREFERENCE_FILE = 'gpu-preference.json'
/** Marca o processo relançado com o ambiente limpo, para nunca relançar em laço. */
const GPU_ENV_SANITIZED_FLAG = 'FELIXO_GPU_ENV_SANITIZED'

const ANGLE_VULKAN_SWITCH = Object.freeze({ name: 'use-angle', value: 'vulkan' })
const ANGLE_VULKAN_FEATURES = Object.freeze(['Vulkan', 'VulkanFromANGLE', 'DefaultANGLEVulkan'])
const ENABLE_FEATURES_SWITCH = 'enable-features'
const HIGH_PERFORMANCE_GPU_SWITCH = 'force_high_performance_gpu'
const LOW_POWER_GPU_SWITCH = 'force_low_power_gpu'

const FALLBACK_REASONS = Object.freeze([
  'previous-start-unfinished',
  'gpu-disabled',
  'vulkan-unavailable',
  'gpu-process-gone',
  // O relançamento com o ambiente limpo (Integrada no Linux) não trouxe o
  // app de volta: ver `pendingRelaunch` em `gpu-start-guard.cjs`.
  'relaunch-failed',
])

function normalizeGpuPreference(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return GPU_PREFERENCES.includes(normalized) ? normalized : null
}

/**
 * Onde cada sistema consegue escolher a placa. Fora de Linux, Windows e
 * macOS não há mecanismo conferido, e a opção fica indisponível com o motivo
 * em vez de fingir que funciona.
 */
function describeGpuPreferenceSupport(platformName = process.platform) {
  if (platformName === 'linux') {
    return { supported: true, mechanism: 'angle-vulkan', reason: null }
  }
  if (platformName === 'win32' || platformName === 'darwin') {
    return { supported: true, mechanism: 'chromium-gpu-switch', reason: null }
  }
  return {
    supported: false,
    mechanism: null,
    reason: 'Este sistema não tem um jeito confiável de escolher a placa de vídeo pelo app.',
  }
}

/**
 * Variáveis herdadas do shell que mandam o GL/Vulkan para a GPU dedicada no
 * Linux: as do offload da NVIDIA (o que o `prime-run` e o "abrir com a placa
 * dedicada" do desktop exportam) e o `DRI_PRIME` do Mesa. Medido em
 * 26/09/2026: com as da NVIDIA, o GL padrão do Chromium falha com "ANGLE
 * Display::initialize error 12289: Invalid visual ID requested" e a janela
 * cai para rasterização por software.
 *
 * @param {Record<string, string | undefined>} environment
 * @returns {string[]} As chaves que forçam a dedicada, em ordem estável.
 */
function listDedicatedGpuForcingEnv(environment = {}) {
  const value = (key) => (typeof environment[key] === 'string' ? environment[key].trim() : '')
  const forcing = []
  if (value('__NV_PRIME_RENDER_OFFLOAD') && value('__NV_PRIME_RENDER_OFFLOAD') !== '0') {
    forcing.push('__NV_PRIME_RENDER_OFFLOAD')
  }
  if (value('__NV_PRIME_RENDER_OFFLOAD_PROVIDER')) forcing.push('__NV_PRIME_RENDER_OFFLOAD_PROVIDER')
  if (value('__GLX_VENDOR_LIBRARY_NAME').toLowerCase() === 'nvidia') forcing.push('__GLX_VENDOR_LIBRARY_NAME')
  if (value('__EGL_VENDOR_LIBRARY_FILENAMES').toLowerCase().includes('nvidia')) {
    forcing.push('__EGL_VENDOR_LIBRARY_FILENAMES')
  }
  if (value('__VK_LAYER_NV_optimus') === 'NVIDIA_only') forcing.push('__VK_LAYER_NV_optimus')
  if (value('DRI_PRIME') && value('DRI_PRIME') !== '0') forcing.push('DRI_PRIME')
  return forcing
}

function emptyPlan(preference) {
  return {
    preference,
    switches: [],
    enableFeatures: [],
    unsetEnv: [],
    setEnv: {},
    relaunch: false,
    expectVulkan: false,
    notes: [],
  }
}

/**
 * O que aplicar no lançamento para a preferência pedida. Função pura: não
 * lê nem grava nada, só descreve os switches e o ambiente.
 *
 * @param {object} options
 * @param {'auto' | 'integrada' | 'dedicada'} options.preference
 * @param {string} [options.platformName]
 * @param {Record<string, string | undefined>} [options.environment]
 * @param {boolean} [options.isDevelopment] - Com o dev server do Vite, o
 *   relançamento deixaria o app órfão do dev-runner; só registra o motivo.
 */
function buildGpuLaunchPlan({
  preference,
  platformName = process.platform,
  environment = {},
  isDevelopment = false,
} = {}) {
  const normalized = normalizeGpuPreference(preference) ?? 'auto'
  const plan = emptyPlan(normalized)
  if (normalized === 'auto' || !describeGpuPreferenceSupport(platformName).supported) {
    return plan
  }

  if (platformName === 'linux') {
    if (normalized === 'dedicada') {
      plan.switches.push({ ...ANGLE_VULKAN_SWITCH })
      plan.enableFeatures.push(...ANGLE_VULKAN_FEATURES)
      plan.expectVulkan = true
      return plan
    }

    // Integrada é o caminho GL padrão. Só há o que fazer se o shell herdou
    // variáveis que forçam a dedicada: elas já estão no zygote, então limpar
    // aqui só vale para o processo relançado.
    const forcing = listDedicatedGpuForcingEnv(environment)
    if (forcing.length === 0) return plan
    if (environment[GPU_ENV_SANITIZED_FLAG] === '1') {
      plan.notes.push('forcing-env-after-relaunch')
      return plan
    }
    plan.unsetEnv.push(...forcing)
    if (isDevelopment) {
      plan.notes.push('relaunch-skipped-in-development')
      return plan
    }
    plan.setEnv[GPU_ENV_SANITIZED_FLAG] = '1'
    plan.relaunch = true
    return plan
  }

  plan.switches.push({
    name: normalized === 'dedicada' ? HIGH_PERFORMANCE_GPU_SWITCH : LOW_POWER_GPU_SWITCH,
  })
  return plan
}

/** Junta as features pedidas às que já vieram na linha de comando, sem repetir. */
function mergeFeatureList(current, additions) {
  const existing = typeof current === 'string' ? current.split(',').map((item) => item.trim()).filter(Boolean) : []
  return [...new Set([...existing, ...additions])].join(',')
}

/**
 * Aplica o plano no `app.commandLine` e no `process.env` do processo
 * principal. Precisa rodar antes de `app.whenReady()`: o Electron relê o
 * `--enable-features` depois do script principal
 * (`ElectronBrowserMainParts::PostEarlyInitialization`), e o processo de GPU
 * recebe a linha de comando só quando é lançado.
 *
 * `--enable-features` é mesclado com o valor que já existir: um segundo
 * `appendSwitch` substitui o primeiro (`base::CommandLine::AppendSwitchNative`).
 *
 * @param {ReturnType<typeof buildGpuLaunchPlan>} plan
 * @param {{ commandLine: { appendSwitch: Function, getSwitchValue: Function }, environment: Record<string, string | undefined> }} target
 * @returns {{ switches: string[], unsetEnv: string[] }} O que foi aplicado, para o log.
 */
function applyGpuLaunchPlan(plan, { commandLine, environment }) {
  const applied = { switches: [], unsetEnv: [] }
  if (!plan) return applied

  for (const key of plan.unsetEnv) {
    if (key in environment) {
      delete environment[key]
      applied.unsetEnv.push(key)
    }
  }
  for (const [key, value] of Object.entries(plan.setEnv)) {
    environment[key] = value
  }
  for (const entry of plan.switches) {
    if (entry.value === undefined) {
      commandLine.appendSwitch(entry.name)
      applied.switches.push(`--${entry.name}`)
    } else {
      commandLine.appendSwitch(entry.name, entry.value)
      applied.switches.push(`--${entry.name}=${entry.value}`)
    }
  }
  if (plan.enableFeatures.length > 0) {
    const merged = mergeFeatureList(commandLine.getSwitchValue(ENABLE_FEATURES_SWITCH), plan.enableFeatures)
    commandLine.appendSwitch(ENABLE_FEATURES_SWITCH, merged)
    applied.switches.push(`--${ENABLE_FEATURES_SWITCH}=${merged}`)
  }
  return applied
}

function getGpuPreferencePath(userDataPath) {
  if (typeof userDataPath !== 'string' || !userDataPath.trim()) return null
  return path.join(userDataPath, GPU_PREFERENCE_FILE)
}

function normalizeTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
}

function normalizePendingStart(value) {
  if (!value || typeof value !== 'object') return null
  const preference = normalizeGpuPreference(value.preference)
  if (!preference || preference === 'auto') return null
  return { preference, startedAt: normalizeTimestamp(value.startedAt) }
}

function normalizeFallback(value) {
  if (!value || typeof value !== 'object') return null
  const from = normalizeGpuPreference(value.from)
  if (!from || from === 'auto' || !FALLBACK_REASONS.includes(value.reason)) return null
  return {
    from,
    reason: value.reason,
    at: normalizeTimestamp(value.at),
    detail: typeof value.detail === 'string' ? value.detail.slice(0, 200) : null,
  }
}

/**
 * Estado salvo no perfil. Arquivo ausente, corrompido ou com valor
 * desconhecido vira Automático — o padrão seguro.
 *
 * - `pendingStart`: início que trocou a GPU e ainda não foi confirmado.
 * - `pendingRelaunch`: o app saiu para reabrir com o ambiente limpo; o
 *   processo relançado apaga, e uma abertura comum que o encontra sabe que
 *   o relançado nunca nasceu.
 *
 * @returns {{
 *   preference: 'auto' | 'integrada' | 'dedicada',
 *   pendingStart: { preference: 'integrada' | 'dedicada', startedAt: string | null } | null,
 *   pendingRelaunch: { preference: 'integrada' | 'dedicada', startedAt: string | null } | null,
 *   fallback: { from: 'integrada' | 'dedicada', reason: string, at: string | null, detail: string | null } | null,
 * }}
 */
function readGpuPreferenceState(userDataPath, fileSystem = fs) {
  const filePath = getGpuPreferencePath(userDataPath)
  const empty = { preference: 'auto', pendingStart: null, pendingRelaunch: null, fallback: null }
  if (!filePath) return empty
  try {
    const payload = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'))
    return {
      preference: normalizeGpuPreference(payload?.preference) ?? 'auto',
      pendingStart: normalizePendingStart(payload?.pendingStart),
      pendingRelaunch: normalizePendingStart(payload?.pendingRelaunch),
      fallback: normalizeFallback(payload?.fallback),
    }
  } catch {
    return empty
  }
}

/**
 * Grava por arquivo temporário + rename: um crash no meio da escrita (o
 * cenário que este arquivo existe para cobrir) não deixa JSON pela metade.
 */
function writeGpuPreferenceState(userDataPath, state, fileSystem = fs) {
  const filePath = getGpuPreferencePath(userDataPath)
  if (!filePath) throw new Error('Pasta de dados do app indisponível.')
  const normalized = {
    preference: normalizeGpuPreference(state?.preference) ?? 'auto',
    pendingStart: normalizePendingStart(state?.pendingStart),
    pendingRelaunch: normalizePendingStart(state?.pendingRelaunch),
    fallback: normalizeFallback(state?.fallback),
  }
  fileSystem.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.tmp`
  fileSystem.writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  fileSystem.renameSync(temporaryPath, filePath)
  return normalized
}

/**
 * Escolha explícita da pessoa, válida no próximo início. Resolve o aviso de
 * volta automática (a pessoa já decidiu de novo) e preserva o marcador do
 * início em andamento, que é sobre esta sessão, não sobre a escolha nova.
 */
function persistGpuPreference({ userDataPath, preference, fileSystem = fs } = {}) {
  const normalized = normalizeGpuPreference(preference)
  if (!normalized) {
    throw new Error(`Placa de vídeo inválida. Use: ${GPU_PREFERENCES.join(', ')}.`)
  }
  const current = readGpuPreferenceState(userDataPath, fileSystem)
  return writeGpuPreferenceState(
    userDataPath,
    { ...current, preference: normalized, fallback: null },
    fileSystem,
  )
}

/** A pessoa leu o aviso de volta automática; ele não aparece de novo. */
function acknowledgeGpuFallback({ userDataPath, fileSystem = fs } = {}) {
  const current = readGpuPreferenceState(userDataPath, fileSystem)
  if (!current.fallback) return current
  return writeGpuPreferenceState(userDataPath, { ...current, fallback: null }, fileSystem)
}

module.exports = {
  ANGLE_VULKAN_FEATURES,
  ANGLE_VULKAN_SWITCH,
  ENABLE_FEATURES_SWITCH,
  FALLBACK_REASONS,
  GPU_ENV_SANITIZED_FLAG,
  GPU_PREFERENCES,
  GPU_PREFERENCE_FILE,
  HIGH_PERFORMANCE_GPU_SWITCH,
  LOW_POWER_GPU_SWITCH,
  acknowledgeGpuFallback,
  applyGpuLaunchPlan,
  buildGpuLaunchPlan,
  describeGpuPreferenceSupport,
  getGpuPreferencePath,
  listDedicatedGpuForcingEnv,
  mergeFeatureList,
  normalizeGpuPreference,
  persistGpuPreference,
  readGpuPreferenceState,
  writeGpuPreferenceState,
}

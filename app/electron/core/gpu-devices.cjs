'use strict'

/**
 * @module gpu-devices
 * Quais entradas de `app.getGPUInfo('basic').gpuDevice` contam para a
 * escolha de placa de vídeo, e quando a escolha tem efeito.
 *
 * A lista do Electron 41.10.7 (`shell/browser/api/gpu_info_enumerator.cc`)
 * traz tudo o que o Chromium 146 coletou: a GPU principal, as secundárias e,
 * no Windows, as NPUs (`GPUInfo::EnumerateFields`, `gpu/config/gpu_info.cc`).
 * No Windows 8 ou mais novo ela sempre inclui o "Microsoft Basic Render
 * Driver" (WARP, 0x1414:0x8c; guia de programação DXGI da Microsoft): o
 * `CollectDriverInfoD3D` (`gpu/config/gpu_info_collector_win.cc`) guarda todo
 * adaptador do `EnumAdapters`, sem pular nenhum. Contar a lista crua mostrava a
 * escolha num PC com uma placa só.
 *
 * - Em todo sistema saem os renderizadores por software, pelo mesmo critério
 *   do Chromium (`GPUDevice::IsSoftwareRenderer`).
 * - Windows e macOS: cada switch só escolhe algo com `GpuCount() > 1` e uma
 *   placa com a PRÓPRIA marca: `force_low_power_gpu` precisa de uma marcada
 *   como de baixo consumo, `force_high_performance_gpu` de uma marcada como de
 *   alto desempenho (`SetupGLDisplayManagerEGL`, `gpu/ipc/service/gpu_init.cc`).
 *   O Chromium só marca (`gpuPreference`) com duas placas reais ou mais
 *   (`gpu_info_collector_win.cc`, `gpu_info_collector_mac.mm`), e as NPUs
 *   nunca são marcadas. Exigir as DUAS marcas é escolha do app, para oferecer
 *   as duas opções, e bate com o efeito: quando só a de baixo consumo está
 *   marcada (o DXGI devolveu a mesma placa para as duas consultas), ela é a
 *   placa padrão, e a Integrada não mudaria nada.
 * - Linux: o Chromium não marca consumo (medido em 26/09/2026: `gpuPreference`
 *   0 nas duas placas); vale a contagem das placas reais.
 */

/** `gl::GpuPreference` (`ui/gl/gpu_preference.h`): kNone, kDefault, kLowPower, kHighPerformance. */
const CHROMIUM_GPU_PREFERENCE = Object.freeze({ lowPower: 2, highPerformance: 3 })
const NVIDIA_VENDOR_ID = 0x10de

/** Espelho de `GPUInfo::GPUDevice::IsSoftwareRenderer` do Chromium 146. */
function isSoftwareRendererDevice(device) {
  switch (device?.vendorId) {
    case 0x0000: // A coleta não identificou a placa.
    case 0xffff: // Marca interna do Chromium para rasterização por software.
    case 0x15ad: // VMware.
      return true
    case 0x1414: // Microsoft: só o WARP; o mesmo fornecedor identifica hardware (ex.: Xbox).
      return device.deviceId === 0x008c
    default:
      return false
  }
}

function hasValidIds(device) {
  return Number.isInteger(device?.vendorId) && Number.isInteger(device?.deviceId)
}

/**
 * Preferências que não teriam efeito nesta máquina, com o motivo.
 *
 * macOS com qualquer placa NVIDIA: a lista de bugs de driver do Chromium 146
 * (`gpu/config/gpu_driver_bug_list.json`, entrada 326: `os` macosx,
 * `vendor_id` 0x10de, `multi_gpu_category` any) liga `force_low_power_gpu`, e
 * o `SetupGLDisplayManagerEGL` testa esse workaround antes do
 * `force_high_performance_gpu` que a Dedicada pede. A Integrada e o Automático
 * continuam valendo.
 */
function describeUnavailablePreferences(realGpus, platformName) {
  if (platformName === 'darwin' && realGpus.some((device) => device.vendorId === NVIDIA_VENDOR_ID)) {
    return { dedicada: 'macos-nvidia-forced-low-power' }
  }
  return {}
}

/**
 * @param {unknown} gpuInfo - Resultado de `app.getGPUInfo('basic')`.
 * @param {string} [platformName]
 * @returns {{
 *   devices: { vendorId: number, deviceId: number }[],
 *   multipleGpus: boolean,
 *   unavailablePreferences: { dedicada?: 'macos-nvidia-forced-low-power' },
 * }} `devices` são as entradas que não são renderizador por software. No
 *   Windows elas podem incluir NPUs (o Chromium as põe na mesma lista, sem
 *   marca de consumo): não use `devices.length` como número de placas de
 *   vídeo; quem diz se há escolha é `multipleGpus`.
 */
function describeGpuDevices(gpuInfo, platformName = process.platform) {
  const listed = Array.isArray(gpuInfo?.gpuDevice) ? gpuInfo.gpuDevice : []
  const realGpus = listed.filter((device) => hasValidIds(device) && !isSoftwareRendererDevice(device))
  const devices = realGpus.map((device) => ({ vendorId: device.vendorId, deviceId: device.deviceId }))
  const unavailablePreferences = describeUnavailablePreferences(realGpus, platformName)

  if (platformName === 'win32' || platformName === 'darwin') {
    const marked = (preference) => realGpus.some((device) => device.gpuPreference === preference)
    return {
      devices,
      multipleGpus: marked(CHROMIUM_GPU_PREFERENCE.lowPower) && marked(CHROMIUM_GPU_PREFERENCE.highPerformance),
      unavailablePreferences,
    }
  }
  return { devices, multipleGpus: devices.length >= 2, unavailablePreferences }
}

module.exports = {
  CHROMIUM_GPU_PREFERENCE,
  describeGpuDevices,
  isSoftwareRendererDevice,
}

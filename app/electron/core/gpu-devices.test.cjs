'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { CHROMIUM_GPU_PREFERENCE, describeGpuDevices, isSoftwareRendererDevice } = require('./gpu-devices.cjs')

// Formatos de `app.getGPUInfo('basic').gpuDevice` no Electron 41 (campos de
// `EnumerateGPUDevice`, gpu/config/gpu_info.cc). `gpuPreference` é o
// `gl::GpuPreference`: 0 sem marca, 2 baixo consumo, 3 alto desempenho.
const INTEL = Object.freeze({ vendorId: 0x8086, deviceId: 0x3e9b, gpuPreference: 0 })
const NVIDIA = Object.freeze({ vendorId: 0x10de, deviceId: 0x1f91, gpuPreference: 0 })
// "Microsoft Basic Render Driver": sempre presente do Windows 8 em diante.
const WARP = Object.freeze({ vendorId: 0x1414, deviceId: 0x8c, gpuPreference: 0 })
// NPU de um Core Ultra, que o Windows lista junto (CollectNPUInformation).
const NPU = Object.freeze({ vendorId: 0x8086, deviceId: 0x7d1d, gpuPreference: 0 })
const LOW = CHROMIUM_GPU_PREFERENCE.lowPower
const HIGH = CHROMIUM_GPU_PREFERENCE.highPerformance

function windows(...gpuDevice) {
  return describeGpuDevices({ gpuDevice }, 'win32')
}

test('Windows com uma placa e o WARP não oferece a escolha', () => {
  const described = windows(INTEL, WARP)
  assert.equal(described.multipleGpus, false)
  assert.deepEqual(described.devices, [{ vendorId: 0x8086, deviceId: 0x3e9b }])
})

test('Windows com uma placa, o WARP e uma NPU também não', () => {
  assert.equal(windows(INTEL, WARP, NPU).multipleGpus, false)
})

test('máquina virtual (VMware) com o WARP não conta placa real nenhuma', () => {
  const described = windows({ vendorId: 0x15ad, deviceId: 0x405, gpuPreference: 0 }, WARP)
  assert.equal(described.multipleGpus, false)
  assert.deepEqual(described.devices, [])
})

test('Windows com integrada e dedicada marcadas pelo Chromium oferece a escolha', () => {
  const described = windows({ ...INTEL, gpuPreference: LOW }, { ...NVIDIA, gpuPreference: HIGH }, WARP)
  assert.equal(described.multipleGpus, true)
  assert.deepEqual(described.devices, [
    { vendorId: 0x8086, deviceId: 0x3e9b },
    { vendorId: 0x10de, deviceId: 0x1f91 },
  ])
})

test('Windows com duas placas sem as marcas de consumo não oferece: os switches não teriam efeito', () => {
  // Sem IDXGIFactory6 o Chromium não marca, e SetupGLDisplayManagerEGL não acha a placa pedida.
  assert.equal(windows(INTEL, NVIDIA, WARP).multipleGpus, false)
  // Só uma das marcas (o DXGI devolveu a mesma placa para as duas consultas):
  // uma das opções não teria para onde ir.
  assert.equal(windows({ ...NVIDIA, gpuPreference: HIGH }, INTEL).multipleGpus, false)
  assert.equal(windows({ ...NVIDIA, gpuPreference: LOW }, INTEL).multipleGpus, false)
})

test('macOS: Intel + AMD marcados oferece; Apple Silicon com uma GPU não', () => {
  const amd = { vendorId: 0x1002, deviceId: 0x7340, gpuPreference: HIGH }
  assert.equal(describeGpuDevices({ gpuDevice: [{ ...INTEL, gpuPreference: LOW }, amd] }, 'darwin').multipleGpus, true)
  // O AGXAccelerator do Apple Silicon só traz vendor-id (ANGLE
  // SystemInfo_macos.mm): a entrada chega com deviceId 0 e continua sendo uma
  // placa real, que não é renderizador por software.
  const appleSilicon = { vendorId: 0x106b, deviceId: 0, gpuPreference: 0 }
  assert.equal(isSoftwareRendererDevice(appleSilicon), false)
  assert.deepEqual(describeGpuDevices({ gpuDevice: [appleSilicon] }, 'darwin'), {
    devices: [{ vendorId: 0x106b, deviceId: 0 }],
    multipleGpus: false,
    unavailablePreferences: {},
  })
})

test('macOS com placa NVIDIA não oferece a Dedicada: a lista de bugs do Chromium força a de baixo consumo', () => {
  // gpu_driver_bug_list.json do Chromium 146, entrada 326 (os macosx,
  // vendor_id 0x10de, multi_gpu_category any): force_low_power_gpu, que o
  // SetupGLDisplayManagerEGL testa antes do force_high_performance_gpu.
  const intelNvidia = { gpuDevice: [{ ...INTEL, gpuPreference: LOW }, { ...NVIDIA, gpuPreference: HIGH }] }
  const described = describeGpuDevices(intelNvidia, 'darwin')
  assert.equal(described.multipleGpus, true)
  assert.deepEqual(described.unavailablePreferences, { dedicada: 'macos-nvidia-forced-low-power' })

  // Só no macOS e só com NVIDIA.
  const amd = { vendorId: 0x1002, deviceId: 0x7340, gpuPreference: HIGH }
  assert.deepEqual(describeGpuDevices({ gpuDevice: [{ ...INTEL, gpuPreference: LOW }, amd] }, 'darwin').unavailablePreferences, {})
  assert.deepEqual(describeGpuDevices(intelNvidia, 'win32').unavailablePreferences, {})
  assert.deepEqual(describeGpuDevices({ gpuDevice: [INTEL, NVIDIA] }, 'linux').unavailablePreferences, {})
})

test('Linux conta as placas reais: o Chromium não marca consumo nesse sistema', () => {
  // Medido em 26/09/2026 (HD 520 + 920MX): as duas vêm com gpuPreference 0.
  const linux = [
    { vendorId: 0x10de, deviceId: 0x134f, gpuPreference: 0 },
    { vendorId: 0x8086, deviceId: 0x1916, gpuPreference: 0 },
  ]
  assert.equal(describeGpuDevices({ gpuDevice: linux }, 'linux').multipleGpus, true)
  assert.equal(describeGpuDevices({ gpuDevice: [linux[1], { vendorId: 0xffff, deviceId: 0xffff }] }, 'linux').multipleGpus, false)
  assert.equal(describeGpuDevices({ gpuDevice: [linux[1], { vendorId: 0, deviceId: 0 }] }, 'linux').multipleGpus, false)
})

test('entradas sem id válido e listas ausentes são ignoradas', () => {
  assert.deepEqual(describeGpuDevices({ gpuDevice: [{ vendorId: 'x' }, INTEL] }, 'linux').devices, [{ vendorId: 0x8086, deviceId: 0x3e9b }])
  assert.deepEqual(describeGpuDevices(null, 'win32'), { devices: [], multipleGpus: false, unavailablePreferences: {} })
})

test('renderizadores por software seguem o critério do Chromium', () => {
  assert.equal(isSoftwareRendererDevice(WARP), true)
  assert.equal(isSoftwareRendererDevice({ vendorId: 0xffff, deviceId: 1 }), true)
  assert.equal(isSoftwareRendererDevice({ vendorId: 0x15ad, deviceId: 1 }), true)
  assert.equal(isSoftwareRendererDevice({ vendorId: 0x0000, deviceId: 0 }), true)
  // O mesmo fornecedor da Microsoft também identifica hardware (ex.: Xbox).
  assert.equal(isSoftwareRendererDevice({ vendorId: 0x1414, deviceId: 0x2 }), false)
  assert.equal(isSoftwareRendererDevice(INTEL), false)
})

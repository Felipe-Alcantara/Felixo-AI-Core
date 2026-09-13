'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  collectDisplayInfo,
  collectEnvironmentMetadata,
  collectGpuInfo,
  collectHostBasics,
  collectNetworkState,
  collectPowerMode,
} = require('./environment-metadata.cjs')

describe('collectHostBasics', () => {
  it('devolve CPU/RAM/plataforma sem precisar de nada externo', () => {
    const basics = collectHostBasics()

    assert.equal(typeof basics.platform, 'string')
    assert.equal(typeof basics.cpuCount, 'number')
    assert.ok(basics.cpuCount > 0)
    assert.equal(typeof basics.totalMemoryMiB, 'number')
    assert.ok(basics.totalMemoryMiB > 0)
    assert.equal(typeof basics.node, 'string')
  })
})

describe('collectGpuInfo', () => {
  it('declara indisponível fora do processo principal do Electron', async () => {
    const result = await collectGpuInfo(undefined)

    assert.equal(result.disponivel, false)
    assert.match(result.motivo, /Electron/)
  })

  it('usa app.getGPUInfo quando o Electron está disponível', async () => {
    const fakeApp = { getGPUInfo: async () => ({ auxAttributes: {} }) }
    const result = await collectGpuInfo(fakeApp)

    assert.equal(result.disponivel, true)
    assert.deepEqual(result.info, { auxAttributes: {} })
  })

  it('declara indisponível (não lança) quando getGPUInfo falha', async () => {
    const fakeApp = { getGPUInfo: async () => { throw new Error('sem GPU') } }
    const result = await collectGpuInfo(fakeApp)

    assert.equal(result.disponivel, false)
    assert.match(result.motivo, /sem GPU/)
  })
})

describe('collectDisplayInfo', () => {
  it('declara indisponível fora do processo principal do Electron', () => {
    const result = collectDisplayInfo(undefined)

    assert.equal(result.disponivel, false)
  })

  it('lê a resolução quando o screen do Electron está disponível', () => {
    const fakeScreen = {
      getPrimaryDisplay: () => ({ size: { width: 1920, height: 1080 }, scaleFactor: 1.5 }),
    }
    const result = collectDisplayInfo(fakeScreen)

    assert.deepEqual(result, { disponivel: true, width: 1920, height: 1080, scaleFactor: 1.5 })
  })
})

describe('collectPowerMode', () => {
  it('Linux: declara "sem bateria detectada" quando a pasta de power_supply não existe', () => {
    const fakeFs = { existsSync: () => false }
    const result = collectPowerMode('linux', fakeFs)

    assert.equal(result.disponivel, true)
    assert.match(result.fonte, /sem bateria/)
  })

  it('Linux: lê status e capacidade da bateria quando ela existe', () => {
    const fakeFs = {
      existsSync: (target) => target === '/sys/class/power_supply' || target.endsWith('/capacity'),
      readdirSync: () => ['BAT0', 'AC'],
      readFileSync: (target) => {
        if (target.endsWith('/status')) return 'Discharging\n'
        if (target.endsWith('/capacity')) return '62\n'
        throw new Error(`inesperado: ${target}`)
      },
    }
    const result = collectPowerMode('linux', fakeFs)

    assert.deepEqual(result, {
      disponivel: true,
      fonte: '/sys/class/power_supply/BAT0',
      status: 'Discharging',
      capacityPercent: 62,
    })
  })

  it('macOS: reconhece "sem bateria" na saída do pmset', () => {
    const runCommand = () => 'Now drawing from \'AC Power\'\nNo batteries available.\n'
    const result = collectPowerMode('darwin', undefined, runCommand)

    assert.equal(result.disponivel, true)
    assert.match(result.status, /sem bateria/)
  })

  it('macOS: repassa a saída real do pmset quando há bateria', () => {
    const runCommand = () => "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=123) 80%; discharging;"
    const result = collectPowerMode('darwin', undefined, runCommand)

    assert.equal(result.disponivel, true)
    assert.match(result.status, /80%/)
  })

  it('Windows: usa Win32_Battery via CIM, com fallback para "sem bateria"', () => {
    const runCommand = () => ''
    const result = collectPowerMode('win32', undefined, runCommand)

    assert.equal(result.disponivel, true)
    assert.match(result.status, /sem bateria/)
  })

  it('nunca lança quando a leitura falha — declara indisponível', () => {
    const fakeFs = {
      existsSync: () => {
        throw new Error('permissão negada')
      },
    }
    const result = collectPowerMode('linux', fakeFs)

    assert.equal(result.disponivel, false)
    assert.match(result.motivo, /permissão negada/)
  })

  it('plataforma sem leitor implementado declara indisponível, não lança', () => {
    const result = collectPowerMode('freebsd')

    assert.equal(result.disponivel, false)
  })
})

describe('collectNetworkState', () => {
  it('nunca faz requisição de rede — só lê as interfaces do SO', () => {
    const result = collectNetworkState()

    assert.equal(result.disponivel, true)
    assert.ok(Array.isArray(result.interfacesAtivas))
    assert.equal(typeof result.temInterfaceNaoInterna, 'boolean')
  })
})

describe('collectEnvironmentMetadata', () => {
  it('junta tudo num único objeto sanitizado, com timestamp', async () => {
    const metadata = await collectEnvironmentMetadata()

    assert.equal(typeof metadata.collectedAt, 'string')
    assert.ok(metadata.host)
    assert.ok('disponivel' in metadata.gpu)
    assert.ok('disponivel' in metadata.display)
    assert.ok('disponivel' in metadata.power)
    assert.ok('disponivel' in metadata.network)
  })
})

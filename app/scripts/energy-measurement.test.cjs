'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  measureEnergyDuringOperation,
  readRaplEnergyMicrojoules,
} = require('./energy-measurement.cjs')

function createFakeFsSequence(values) {
  let index = 0
  return {
    readFileSync() {
      if (index >= values.length) throw new Error('sem mais valores no fake')
      const value = values[index]
      index += 1
      if (value === null) throw new Error('ENOENT: permissão negada')
      return String(value)
    },
  }
}

describe('readRaplEnergyMicrojoules', () => {
  it('devolve o número quando o arquivo existe e é legível', () => {
    const fileSystem = { readFileSync: () => '12345\n' }

    assert.equal(readRaplEnergyMicrojoules(fileSystem), 12345)
  })

  it('devolve null (não lança) quando a leitura falha — permissão negada, por exemplo', () => {
    const fileSystem = {
      readFileSync: () => {
        throw new Error('EACCES: permission denied')
      },
    }

    assert.equal(readRaplEnergyMicrojoules(fileSystem), null)
  })
})

describe('measureEnergyDuringOperation', () => {
  it('usa RAPL quando as duas leituras (antes/depois) funcionam no Linux', async () => {
    const fileSystem = createFakeFsSequence([1_000_000, 1_500_000])

    const { result, energy } = await measureEnergyDuringOperation(
      async () => 'trabalho-feito',
      { platformName: 'linux', fileSystem },
    )

    assert.equal(result, 'trabalho-feito')
    assert.equal(energy.method, 'rapl-linux')
    assert.equal(energy.disponivel, true)
    assert.equal(energy.joules, 0.5)
  })

  it('trata o reinício do contador RAPL (delta negativo) sem devolver energia negativa', async () => {
    // RAPL é um contador de 32 bits que reinicia — "depois" menor que
    // "antes" não é erro de leitura, é o contador tendo dado a volta.
    const fileSystem = createFakeFsSequence([2 ** 32 - 100_000, 400_000])

    const { energy } = await measureEnergyDuringOperation(
      async () => null,
      { platformName: 'linux', fileSystem },
    )

    assert.equal(energy.method, 'rapl-linux')
    assert.ok(energy.joules > 0, `esperava um delta positivo mesmo com reinício, teve ${energy.joules}`)
  })

  it('cai pro proxy de tempo de parede quando RAPL não é legível no Linux', async () => {
    const fileSystem = { readFileSync: () => { throw new Error('EACCES') } }

    const { energy } = await measureEnergyDuringOperation(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      },
      { platformName: 'linux', fileSystem },
    )

    assert.equal(energy.method, 'cpu-time-proxy')
    assert.equal(energy.disponivel, false)
    assert.match(energy.motivo, /RAPL/)
    assert.ok(energy.wallMs >= 5, `esperava ao menos alguns ms, teve ${energy.wallMs}`)
  })

  it('usa o proxy de tempo de parede em SOs sem leitor de energia implementado', async () => {
    const { energy } = await measureEnergyDuringOperation(async () => null, { platformName: 'win32' })

    assert.equal(energy.method, 'cpu-time-proxy')
    assert.equal(energy.disponivel, false)
    assert.match(energy.motivo, /win32/)
  })

  it('propaga o valor devolvido pela operação', async () => {
    const { result } = await measureEnergyDuringOperation(async () => ({ ok: true }), { platformName: 'darwin' })

    assert.deepEqual(result, { ok: true })
  })

  it('propaga o erro da operação sem mascarar com erro de medição', async () => {
    await assert.rejects(
      measureEnergyDuringOperation(async () => {
        throw new Error('a operação em si falhou')
      }, { platformName: 'linux' }),
      /a operação em si falhou/,
    )
  })
})

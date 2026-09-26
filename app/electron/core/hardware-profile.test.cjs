'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  LOW_CPU_THRESHOLD,
  defaultAnalyzeWorkers,
  describeHardwareProfile,
  isLowCpuMachine,
  logicalCpuCount,
} = require('./hardware-profile.cjs')

test('conta CPUs pelo availableParallelism e cai para cpus() quando ele não existe', () => {
  assert.equal(logicalCpuCount({ availableParallelism: () => 4, cpus: () => [1, 2, 3, 4, 5, 6] }), 4)
  assert.equal(logicalCpuCount({ cpus: () => [1, 2] }), 2)
  assert.equal(logicalCpuCount({ availableParallelism: () => 0, cpus: () => [] }), null)
  assert.equal(
    logicalCpuCount({
      availableParallelism: () => {
        throw new Error('sem acesso')
      },
    }),
    null,
  )
})

test('poucas CPUs é até 4 lógicas, a classe da máquina medida', () => {
  assert.equal(LOW_CPU_THRESHOLD, 4)
  assert.equal(isLowCpuMachine(2), true)
  assert.equal(isLowCpuMachine(4), true)
  assert.equal(isLowCpuMachine(6), false)
  assert.equal(isLowCpuMachine(null), false)
  assert.equal(isLowCpuMachine(0), false)
})

test('análises do Fetch All: duas por CPU até o padrão de 8, nunca menos de 2', () => {
  assert.equal(defaultAnalyzeWorkers(1), 2)
  assert.equal(defaultAnalyzeWorkers(2), 4)
  assert.equal(defaultAnalyzeWorkers(3), 6)
  // Nesta máquina (4 CPUs) e acima, o padrão de antes não muda.
  assert.equal(defaultAnalyzeWorkers(4), 8)
  assert.equal(defaultAnalyzeWorkers(16), 8)
  assert.equal(defaultAnalyzeWorkers(null), 8)
})

test('descreve o perfil para a interface', () => {
  assert.deepEqual(describeHardwareProfile({ osModule: { availableParallelism: () => 4 } }), {
    logicalCpuCount: 4,
    lowCpu: true,
    lowCpuThreshold: 4,
    suggestPerformanceMode: true,
  })
  const strong = describeHardwareProfile({ osModule: { availableParallelism: () => 12 } })
  assert.equal(strong.lowCpu, false)
  assert.equal(strong.suggestPerformanceMode, false)
})

test('na automação a sugestão fica desligada, sem esconder o número real', () => {
  const profile = describeHardwareProfile({ osModule: { availableParallelism: () => 4 }, automation: true })
  assert.equal(profile.lowCpu, true)
  assert.equal(profile.suggestPerformanceMode, false)
})

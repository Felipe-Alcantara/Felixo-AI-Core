'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAgentUsageWatcher } = require('./agent-usage-watcher.cjs')

function createHome() {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-watcher-'))
  const day = new Date()
  const codexDay = path.join(
    homeDir,
    '.codex',
    'sessions',
    String(day.getFullYear()),
    String(day.getMonth() + 1).padStart(2, '0'),
    String(day.getDate()).padStart(2, '0'),
  )
  const claudeDir = path.join(homeDir, 'claude-statusline')

  fs.mkdirSync(codexDay, { recursive: true })
  fs.mkdirSync(claudeDir, { recursive: true })

  return {
    homeDir,
    codexDay,
    claudeDir,
    cleanup: () => fs.rmSync(homeDir, { recursive: true, force: true }),
  }
}

/**
 * Cria o observador sem ligar os temporizadores: `tick` é chamado à mão, para
 * o teste não depender de relógio nem de espera.
 */
function createWatcher(home, calls) {
  return createAgentUsageWatcher({
    homeDir: home.homeDir,
    claudeStatuslineDir: home.claudeDir,
    onChange: (providerId) => calls.push(providerId),
  })
}

/** `mtime` tem resolução limitada; escrever com data explícita evita empate. */
function write(filePath, content, secondsAhead = 0) {
  fs.writeFileSync(filePath, content, 'utf8')

  if (secondsAhead) {
    const when = new Date(Date.now() + secondsAhead * 1000)
    fs.utimesSync(filePath, when, when)
  }
}

test('avisa quando o Codex grava no rollout da sessão', () => {
  const home = createHome()
  const calls = []
  const watcher = createWatcher(home, calls)
  const rollout = path.join(home.codexDay, 'rollout-teste.jsonl')

  try {
    write(rollout, '{"n":1}\n')
    watcher.resolveCodexFile()
    watcher.tick()
    assert.deepEqual(calls, [], 'a primeira olhada só registra o estado')

    write(rollout, '{"n":1}\n{"n":2}\n', 2)
    watcher.tick()

    assert.deepEqual(calls, ['codex'])
  } finally {
    watcher.stop()
    home.cleanup()
  }
})

test('avisa quando a captura da status line do Claude muda', () => {
  const home = createHome()
  const calls = []
  const watcher = createWatcher(home, calls)
  const capture = path.join(home.claudeDir, 'rate-limits.json')

  try {
    write(capture, '{"rateLimits":{}}')
    watcher.tick()
    assert.deepEqual(calls, [])

    write(capture, '{"rateLimits":{"five_hour":{"used_percentage":42}}}', 2)
    watcher.tick()

    assert.deepEqual(calls, ['claude'])
  } finally {
    watcher.stop()
    home.cleanup()
  }
})

test('arquivo parado não gera aviso', () => {
  const home = createHome()
  const calls = []
  const watcher = createWatcher(home, calls)
  const rollout = path.join(home.codexDay, 'rollout-parado.jsonl')

  try {
    write(rollout, '{"n":1}\n')
    watcher.resolveCodexFile()
    watcher.tick()
    watcher.tick()
    watcher.tick()

    assert.deepEqual(calls, [])
  } finally {
    watcher.stop()
    home.cleanup()
  }
})

test('passa a acompanhar a sessão mais recente quando outra começa', () => {
  const home = createHome()
  const calls = []
  const watcher = createWatcher(home, calls)
  const antiga = path.join(home.codexDay, 'rollout-antiga.jsonl')
  const nova = path.join(home.codexDay, 'rollout-nova.jsonl')

  try {
    write(antiga, '{"n":1}\n')
    watcher.resolveCodexFile()
    watcher.tick()

    // A sessão nova é a que interessa: é nela que a quota nova é gravada.
    write(nova, '{"n":1}\n', 5)
    watcher.resolveCodexFile()
    watcher.tick()
    assert.deepEqual(calls, [], 'a primeira olhada no arquivo novo só registra')

    write(nova, '{"n":1}\n{"n":2}\n', 10)
    watcher.tick()

    assert.deepEqual(calls, ['codex'])
  } finally {
    watcher.stop()
    home.cleanup()
  }
})

test('não usa inotify, então convive com o limite do sistema esgotado', () => {
  // Na máquina do relato havia 204 instâncias de inotify para um limite de
  // 128: qualquer `fs.watch` novo falhava com EMFILE. O acompanhamento por
  // `stat` não abre descritor nenhum.
  const home = createHome()
  const calls = []
  const chamadas = []
  const watcher = createAgentUsageWatcher({
    homeDir: home.homeDir,
    claudeStatuslineDir: home.claudeDir,
    onChange: (providerId) => calls.push(providerId),
    fileSystem: {
      statSync: (filePath) => {
        chamadas.push(filePath)
        return { mtimeMs: 1, size: 1 }
      },
      readdirSync: () => ['rollout-a.jsonl'],
      watch: () => {
        throw new Error('fs.watch não deve ser usado')
      },
    },
  })

  try {
    watcher.resolveCodexFile()
    watcher.tick()

    assert.ok(chamadas.length > 0, 'o acompanhamento passa por statSync')
  } finally {
    watcher.stop()
    home.cleanup()
  }
})

test('some sem erro quando o arquivo ainda não existe', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-watcher-vazio-'))
  const calls = []

  try {
    const watcher = createAgentUsageWatcher({
      homeDir,
      claudeStatuslineDir: path.join(homeDir, 'nao-existe'),
      onChange: (providerId) => calls.push(providerId),
    })

    assert.doesNotThrow(() => {
      watcher.resolveCodexFile()
      watcher.tick()
      watcher.tick()
    })
    assert.deepEqual(calls, [])
    watcher.stop()
  } finally {
    fs.rmSync(homeDir, { recursive: true, force: true })
  }
})

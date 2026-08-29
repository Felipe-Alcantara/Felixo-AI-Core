'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  createClaudeStatuslineService,
} = require('./claude-statusline-service.cjs')

function createEnvironment(settings) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'felixo-statusline-'))
  const homeDir = path.join(root, 'home')
  const baseDir = path.join(root, 'userData', 'claude-statusline')

  fs.mkdirSync(path.join(homeDir, '.claude'), { recursive: true })

  if (settings !== undefined) {
    fs.writeFileSync(
      path.join(homeDir, '.claude', 'settings.json'),
      JSON.stringify(settings, null, 2),
      'utf8',
    )
  }

  return {
    root,
    homeDir,
    baseDir,
    service: createClaudeStatuslineService({ homeDir, baseDir }),
    readSettings: () =>
      JSON.parse(
        fs.readFileSync(path.join(homeDir, '.claude', 'settings.json'), 'utf8'),
      ),
  }
}

test('instalar preserva o resto das configurações e marca a status line como do app', () => {
  const env = createEnvironment({ model: 'sonnet', permissions: { allow: ['Bash(ls)'] } })

  try {
    const result = env.service.install()
    assert.equal(result.ok, true)

    const settings = env.readSettings()
    assert.equal(settings.model, 'sonnet')
    assert.deepEqual(settings.permissions.allow, ['Bash(ls)'])
    assert.equal(settings.statusLine.type, 'command')
    assert.equal(settings.statusLine.felixoManaged, true)
    assert.match(settings.statusLine.command, /felixo-statusline\.cjs/)
    assert.equal(fs.existsSync(env.service.scriptPath), true)
    assert.deepEqual(env.service.status(), {
      installed: true,
      settingsReadable: true,
      conflictingStatusLine: false,
    })
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('instalar recusa sobrescrever uma status line que a pessoa configurou', () => {
  const env = createEnvironment({
    statusLine: { type: 'command', command: 'meu-script.sh' },
  })

  try {
    const result = env.service.install()

    assert.equal(result.ok, false)
    assert.match(result.message, /Já existe uma status line/)
    // O ponto do teste: a configuração de terceiro sai intacta.
    assert.deepEqual(env.readSettings().statusLine, {
      type: 'command',
      command: 'meu-script.sh',
    })
    assert.equal(env.service.status().conflictingStatusLine, true)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('desinstalar remove a chave quando não havia status line antes', () => {
  const env = createEnvironment({ model: 'sonnet' })

  try {
    env.service.install()
    const result = env.service.uninstall()

    assert.equal(result.ok, true)
    const settings = env.readSettings()
    assert.equal('statusLine' in settings, false)
    assert.equal(settings.model, 'sonnet')
    assert.equal(fs.existsSync(env.service.scriptPath), false)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('desinstalar é seguro quando a coleta nunca foi ligada', () => {
  const env = createEnvironment({ model: 'sonnet' })

  try {
    const result = env.service.uninstall()

    assert.equal(result.ok, true)
    assert.deepEqual(env.readSettings(), { model: 'sonnet' })
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('o script capturado alimenta o probe com o rate limit e o horário da medição', () => {
  const env = createEnvironment({})

  try {
    env.service.install()

    fs.writeFileSync(
      env.service.capturePath,
      JSON.stringify({
        measuredAt: '2026-08-29T02:40:00.000Z',
        rateLimits: {
          five_hour: { used_percentage: 74, resets_at: 1_787_973_600 },
          seven_day: { used_percentage: 76, resets_at: 1_788_325_200 },
        },
      }),
      'utf8',
    )

    assert.deepEqual(env.service.readCapture(), {
      measuredAt: '2026-08-29T02:40:00.000Z',
      rateLimits: {
        five_hour: { used_percentage: 74, resets_at: 1_787_973_600 },
        seven_day: { used_percentage: 76, resets_at: 1_788_325_200 },
      },
    })
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('sem captura o probe não devolve número nenhum', () => {
  const env = createEnvironment({})

  try {
    assert.equal(env.service.readCapture(), null)

    fs.mkdirSync(env.baseDir, { recursive: true })
    fs.writeFileSync(env.service.capturePath, 'não é json', 'utf8')
    assert.equal(env.service.readCapture(), null)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('settings ilegível não vira instalação silenciosa', () => {
  const env = createEnvironment()
  fs.writeFileSync(
    path.join(env.homeDir, '.claude', 'settings.json'),
    '{ quebrado',
    'utf8',
  )

  try {
    const status = env.service.status()
    assert.equal(status.settingsReadable, false)
    assert.equal(status.installed, false)

    const result = env.service.install()
    assert.equal(result.ok, false)
    assert.match(result.message, /Não foi possível ler/)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('o script instalado grava a captura e ainda imprime uma linha de status', () => {
  const env = createEnvironment({})

  try {
    env.service.install()

    const { execFileSync } = require('node:child_process')
    const output = execFileSync(process.execPath, [env.service.scriptPath], {
      input: JSON.stringify({
        model: { display_name: 'Opus 5' },
        workspace: { current_dir: '/home/pessoa/projeto' },
        rate_limits: { five_hour: { used_percentage: 74 } },
      }),
      encoding: 'utf8',
    })

    assert.match(output, /Opus 5/)
    assert.match(output, /projeto/)
    assert.match(output, /74% do limite/)
    assert.equal(env.service.readCapture().rateLimits.five_hour.used_percentage, 74)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

test('payload sem rate limit não apaga a captura anterior nem quebra a linha', () => {
  const env = createEnvironment({})

  try {
    env.service.install()

    const { execFileSync } = require('node:child_process')
    execFileSync(process.execPath, [env.service.scriptPath], {
      input: JSON.stringify({ rate_limits: { five_hour: { used_percentage: 12 } } }),
      encoding: 'utf8',
    })

    // O Claude só manda rate_limits depois de uma chamada de API; no início da
    // sessão o payload vem sem ele, e o último valor conhecido tem de ficar.
    const output = execFileSync(process.execPath, [env.service.scriptPath], {
      input: JSON.stringify({ model: { display_name: 'Sonnet 5' } }),
      encoding: 'utf8',
    })

    assert.equal(output, 'Sonnet 5')
    assert.equal(env.service.readCapture().rateLimits.five_hour.used_percentage, 12)
  } finally {
    fs.rmSync(env.root, { recursive: true, force: true })
  }
})

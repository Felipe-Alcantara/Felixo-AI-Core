const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { SUPPORTED_CLIS, detectCli, FAILURE_REASONS } = require('../core/cli-detector.cjs')
const {
  DIAGNOSIS_CAUSES,
  buildCliDiagnosis,
  diagnoseClis,
  formatDiagnosisForSupport,
  minimizePaths,
  redactDiagnosticText,
} = require('./cli-diagnostics.cjs')

const CLAUDE = SUPPORTED_CLIS.find((cli) => cli.command === 'claude')
const CATALOG_CLAUDE = {
  id: 'claude',
  name: 'Claude Code CLI',
  command: 'claude',
  windowsAliases: ['claude.exe', 'claude.cmd'],
  install: { label: 'npm install -g @anthropic-ai/claude-code' },
}

function failWith(code, extra = {}) {
  return Object.assign(new Error(`falha ${code}`), { code, ...extra })
}

/** Detecta no "Windows" com resolução de caminho e execução injetadas. */
function detectOnWindows({ resolved = {}, execute }) {
  return detectCli(CLAUDE, { PATH: 'C:\\bin' }, {
    platformName: 'win32',
    resolvePath: (command) => resolved[command] ?? null,
    execute,
  })
}

describe('detectCli — registro de tentativas e motivo', () => {
  it('shim .cmd em caminho com espaço roda via shell e fica registrado', async () => {
    const shim = 'C:\\Users\\Felipe Martins\\AppData\\Roaming\\npm\\claude.cmd'
    const result = await detectOnWindows({
      resolved: { 'claude.cmd': shim },
      execute: async (command) => {
        if (!command.includes('claude.cmd')) throw failWith('ENOENT')
        return { stdout: 'claude 1.2.3' }
      },
    })

    assert.equal(result.detected, true)
    const ok = result.attempts.find((attempt) => attempt.outcome === 'ok')
    assert.equal(ok.command, 'claude.cmd')
    assert.equal(ok.resolvedPath, shim)
    assert.equal(ok.viaShell, true)
  })

  it('.exe resolvido roda sem shell', async () => {
    const exe = 'C:\\Tools\\claude.exe'
    const result = await detectOnWindows({
      resolved: { 'claude.exe': exe },
      execute: async (command) => {
        if (command !== exe) throw failWith('ENOENT')
        return { stdout: '2.0.0' }
      },
    })

    const ok = result.attempts.find((attempt) => attempt.outcome === 'ok')
    assert.equal(ok.viaShell, false)
    assert.equal(ok.resolvedPath, exe)
  })

  it('nada no PATH: motivo not-found e todas as variantes tentadas', async () => {
    const result = await detectOnWindows({
      execute: async () => {
        throw failWith('ENOENT')
      },
    })

    assert.equal(result.detected, false)
    assert.equal(result.reason, FAILURE_REASONS.NOT_FOUND)
    assert.deepEqual(
      result.attempts.map((attempt) => attempt.command),
      ['claude', 'claude.exe', 'claude.cmd'],
    )
  })

  it('arquivo achado que nega execução é permission, não not-found', async () => {
    const result = await detectOnWindows({
      resolved: { 'claude.exe': 'C:\\Tools\\claude.exe' },
      execute: async () => {
        throw failWith('EACCES')
      },
    })

    assert.equal(result.reason, FAILURE_REASONS.PERMISSION)
  })

  it('não confunde "a variante nua não existe" com "nada existe"', async () => {
    const result = await detectOnWindows({
      resolved: { 'claude.cmd': 'C:\\npm\\claude.cmd' },
      execute: async (command) => {
        if (command.includes('claude.cmd')) throw failWith('EACCES')
        throw failWith('ENOENT')
      },
    })

    assert.equal(result.reason, FAILURE_REASONS.PERMISSION)
  })

  it('atalho que não acha o Node é shim-broken', async () => {
    const result = await detectOnWindows({
      resolved: { 'claude.cmd': 'C:\\npm\\claude.cmd' },
      execute: async (command) => {
        if (!command.includes('claude.cmd')) throw failWith('ENOENT')
        throw failWith(1, { stderr: "'node' não é reconhecido como um comando interno" })
      },
    })

    assert.equal(result.reason, FAILURE_REASONS.SHIM_BROKEN)
  })

  it('EINVAL (recusa do Node a .cmd sem shell) é shim-broken', async () => {
    const result = await detectOnWindows({
      resolved: { 'claude.cmd': 'C:\\npm\\claude.cmd' },
      execute: async () => {
        throw failWith('EINVAL')
      },
    })

    assert.equal(result.reason, FAILURE_REASONS.SHIM_BROKEN)
  })

  it('tempo esgotado é timeout e saída de erro comum é exit-error', async () => {
    const slow = await detectOnWindows({
      resolved: { 'claude.exe': 'C:\\Tools\\claude.exe' },
      execute: async () => {
        throw failWith(null, { killed: true })
      },
    })
    const broken = await detectOnWindows({
      resolved: { 'claude.exe': 'C:\\Tools\\claude.exe' },
      execute: async () => {
        throw failWith(2, { stderr: 'unexpected flag' })
      },
    })

    assert.equal(slow.reason, FAILURE_REASONS.TIMEOUT)
    assert.equal(broken.reason, FAILURE_REASONS.EXIT_ERROR)
  })

  it('o registro guarda só códigos: nunca a saída crua do erro', async () => {
    const result = await detectOnWindows({
      resolved: { 'claude.exe': 'C:\\Tools\\claude.exe' },
      execute: async () => {
        throw failWith(2, { stderr: 'Authorization: Bearer sk-abcdefghijklmnop' })
      },
    })

    assert.equal(JSON.stringify(result.attempts).includes('sk-abcdefghijklmnop'), false)
  })
})

describe('buildCliDiagnosis', () => {
  const context = {
    platformName: 'win32',
    arch: 'x64',
    appVersion: '0.1.400',
    homeDir: 'C:\\Users\\Bia',
  }

  function failed(reason, attempts = []) {
    return {
      detected: false,
      version: null,
      path: null,
      reason,
      attempts: attempts.length
        ? attempts
        : [{ command: 'claude', resolvedPath: null, viaShell: false, outcome: 'failed', reason }],
    }
  }

  it('binário válido nunca recomenda instalar', () => {
    const diagnosis = buildCliDiagnosis({
      cli: CATALOG_CLAUDE,
      detection: {
        detected: true,
        version: '1.2.3',
        path: 'C:\\Users\\Bia\\AppData\\Roaming\\npm\\claude.cmd',
        reason: null,
        attempts: [
          { command: 'claude.cmd', resolvedPath: 'C:\\Users\\Bia\\AppData\\Roaming\\npm\\claude.cmd', viaShell: true, outcome: 'ok', reason: null },
        ],
      },
      context,
    })

    assert.equal(diagnosis.status, 'ready')
    assert.equal(diagnosis.recommendInstall, false)
    assert.equal(diagnosis.nextAction.kind, 'none')
    assert.equal(diagnosis.chosen, '~\\AppData\\Roaming\\npm\\claude.cmd')
  })

  it('ausente e sem instalação gerenciada: única situação em que recomenda instalar', () => {
    const diagnosis = buildCliDiagnosis({
      cli: CATALOG_CLAUDE,
      detection: failed(FAILURE_REASONS.NOT_FOUND),
      context,
    })

    assert.equal(diagnosis.cause, DIAGNOSIS_CAUSES.NOT_INSTALLED)
    assert.equal(diagnosis.recommendInstall, true)
    assert.match(diagnosis.nextAction.text, /alias/)
  })

  it('instalada pelo app mas invisível: é PATH, e não recomenda instalar', () => {
    const diagnosis = buildCliDiagnosis({
      cli: CATALOG_CLAUDE,
      detection: failed(FAILURE_REASONS.NOT_FOUND),
      managedPresent: true,
      managedHealth: { ok: true },
      context,
    })

    assert.equal(diagnosis.cause, DIAGNOSIS_CAUSES.PATH)
    assert.equal(diagnosis.recommendInstall, false)
    assert.equal(diagnosis.nextAction.kind, 'fix-path')
  })

  it('pacote nativo faltando: reinstalar é a ação certa', () => {
    const diagnosis = buildCliDiagnosis({
      cli: CATALOG_CLAUDE,
      detection: failed(FAILURE_REASONS.EXIT_ERROR),
      managedPresent: true,
      managedHealth: { ok: false, message: 'Missing optional dependency' },
      context,
    })

    assert.equal(diagnosis.cause, DIAGNOSIS_CAUSES.PACKAGE)
    assert.equal(diagnosis.recommendInstall, true)
  })

  for (const [reason, cause] of [
    [FAILURE_REASONS.PERMISSION, DIAGNOSIS_CAUSES.PERMISSION],
    [FAILURE_REASONS.TIMEOUT, DIAGNOSIS_CAUSES.TIMEOUT],
    [FAILURE_REASONS.SHIM_BROKEN, DIAGNOSIS_CAUSES.SHIM],
  ]) {
    it(`${reason} não recomenda instalar e aponta a causa ${cause}`, () => {
      const diagnosis = buildCliDiagnosis({
        cli: CATALOG_CLAUDE,
        detection: failed(reason, [
          { command: 'claude.cmd', resolvedPath: 'C:\\Users\\Bia\\npm\\claude.cmd', viaShell: true, outcome: 'failed', reason },
        ]),
        context,
      })

      assert.equal(diagnosis.cause, cause)
      assert.equal(diagnosis.recommendInstall, false)
      assert.ok(diagnosis.nextAction.text.length > 0)
    })
  }

  it('falha de instalação por rede ou permissão vira causa própria', () => {
    const network = buildCliDiagnosis({
      cli: CATALOG_CLAUDE,
      detection: failed(FAILURE_REASONS.NOT_FOUND),
      lastInstall: { ok: false, message: 'npm ERR! code ENOTFOUND registry' },
      context,
    })
    const permission = buildCliDiagnosis({
      cli: CATALOG_CLAUDE,
      detection: failed(FAILURE_REASONS.NOT_FOUND),
      lastInstall: { ok: false, message: 'EACCES: permission denied, mkdir' },
      context,
    })

    assert.equal(network.cause, DIAGNOSIS_CAUSES.NETWORK)
    assert.equal(network.recommendInstall, false)
    assert.equal(permission.cause, DIAGNOSIS_CAUSES.PERMISSION)
  })

  it('caminho de OUTRA conta perde o nome de usuário, mesmo com espaço no nome', () => {
    const diagnosis = buildCliDiagnosis({
      cli: CATALOG_CLAUDE,
      detection: failed(FAILURE_REASONS.PERMISSION, [
        {
          command: 'claude.cmd',
          resolvedPath: 'C:\\Users\\Ana Silva\\AppData\\Roaming\\npm\\claude.cmd',
          viaShell: true,
          outcome: 'failed',
          reason: FAILURE_REASONS.PERMISSION,
        },
      ]),
      context,
    })

    const serialized = JSON.stringify(diagnosis)
    assert.equal(serialized.includes('Ana Silva'), false)
    assert.ok(serialized.includes('<usuario>'))
  })

  it('funciona em POSIX (home em /home) sem vazar o usuário', () => {
    const diagnosis = buildCliDiagnosis({
      cli: CATALOG_CLAUDE,
      detection: failed(FAILURE_REASONS.PERMISSION, [
        { command: 'claude', resolvedPath: '/home/carlos/.npm-global/bin/claude', viaShell: false, outcome: 'failed', reason: FAILURE_REASONS.PERMISSION },
      ]),
      context: { platformName: 'linux', arch: 'x64', appVersion: '0.1.400', homeDir: '/home/felipe' },
    })

    assert.equal(JSON.stringify(diagnosis).includes('carlos'), false)
  })
})

describe('redactDiagnosticText / minimizePaths', () => {
  it('remove URL, token rotulado, Bearer, _authToken e sequência longa', () => {
    const raw = [
      'GET https://registry.npmjs.org/pkg?token=SEGREDO123 falhou',
      'Authorization: Bearer abc.def.ghi',
      '//registry.npmjs.org/:_authToken=npm_SEGREDO456',
      `chave ${'A'.repeat(48)}`,
    ].join('\n')
    const redacted = redactDiagnosticText(raw)

    for (const secret of ['SEGREDO123', 'abc.def.ghi', 'SEGREDO456', 'A'.repeat(48), 'registry.npmjs.org/pkg']) {
      assert.equal(redacted.includes(secret), false, `vazou: ${secret}`)
    }
    assert.ok(redacted.includes('falhou'), 'preserva o resto da mensagem')
  })

  it('troca o home por ~ com espaço no nome e barras mistas', () => {
    const text = minimizePaths('C:/Users/Felipe Martins/AppData e C:\\Users\\Felipe Martins\\x', {
      homeDir: 'C:\\Users\\Felipe Martins',
    })

    assert.equal(text.includes('Felipe Martins'), false)
    assert.equal(text, '~/AppData e ~\\x')
  })

  it('limita o tamanho do que é persistido', () => {
    assert.ok(redactDiagnosticText('x '.repeat(5000)).length <= 2000)
  })
})

describe('diagnoseClis / formatDiagnosisForSupport', () => {
  it('só lê: não instala nada e usa apenas o detector e o disco', async () => {
    const detected = []
    const layout = { packagesBin: 'C:\\Users\\Bia\\AppData\\Roaming\\Felixo\\packages\\bin' }
    const diagnoses = await diagnoseClis({
      catalog: [CATALOG_CLAUDE],
      detect: async (cli) => {
        detected.push(cli.id)
        return { detected: false, version: null, path: null, reason: FAILURE_REASONS.NOT_FOUND, attempts: [] }
      },
      env: {},
      layout,
      verifyInstallation: () => ({ ok: true }),
      fileSystem: { existsSync: (candidate) => candidate.endsWith('claude.cmd') },
      context: { platformName: 'win32', arch: 'x64', appVersion: '0.1.400', homeDir: 'C:\\Users\\Bia' },
    })

    assert.deepEqual(detected, ['claude'])
    assert.equal(diagnoses[0].cause, DIAGNOSIS_CAUSES.PATH)
  })

  it('o texto de suporte carrega versão, plataforma e próxima ação sem dados pessoais', () => {
    const diagnosis = buildCliDiagnosis({
      cli: CATALOG_CLAUDE,
      detection: {
        detected: false,
        version: null,
        path: null,
        reason: FAILURE_REASONS.SHIM_BROKEN,
        attempts: [
          { command: 'claude.cmd', resolvedPath: 'C:\\Users\\Ana Silva\\npm\\claude.cmd', viaShell: true, outcome: 'failed', reason: FAILURE_REASONS.SHIM_BROKEN },
        ],
      },
      context: { platformName: 'win32', arch: 'x64', appVersion: '0.1.400', homeDir: 'C:\\Users\\Bia' },
    })
    const text = formatDiagnosisForSupport([diagnosis])

    assert.match(text, /0\.1\.400/)
    assert.match(text, /win32\/x64/)
    assert.match(text, /próxima ação:/)
    assert.equal(text.includes('Ana Silva'), false)
  })
})

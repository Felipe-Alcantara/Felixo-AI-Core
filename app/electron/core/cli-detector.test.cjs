const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  SUPPORTED_CLIS,
  parseVersionFromOutput,
  createCliNotFoundMessage,
  formatDetectionSummary,
  detectCli,
  resolveCommandPath,
} = require('./cli-detector.cjs')

describe('cli-detector', () => {
  describe('SUPPORTED_CLIS', () => {
    it('contains expected CLIs', () => {
      const names = SUPPORTED_CLIS.map((c) => c.command)
      assert.ok(names.includes('claude'))
      assert.ok(names.includes('codex'))
      assert.ok(names.includes('gemini'))
      assert.ok(names.includes('openia'))
      assert.ok(names.includes('git'))
      assert.ok(names.includes('node'))
      assert.ok(names.includes('ollama'))
    })

    it('all CLIs have required fields', () => {
      for (const cli of SUPPORTED_CLIS) {
        assert.ok(cli.name, `Missing name for ${cli.command}`)
        assert.ok(cli.command, 'Missing command')
        assert.ok(cli.versionFlag, `Missing versionFlag for ${cli.command}`)
        assert.ok(cli.category, `Missing category for ${cli.command}`)
        assert.ok(cli.installUrl, `Missing installUrl for ${cli.command}`)
      }
    })

    it('categories are valid', () => {
      const validCategories = ['ai-provider', 'tool', 'runtime']
      for (const cli of SUPPORTED_CLIS) {
        assert.ok(
          validCategories.includes(cli.category),
          `Invalid category '${cli.category}' for ${cli.command}`,
        )
      }
    })
  })

  describe('parseVersionFromOutput()', () => {
    it('extracts version from "v1.2.3" format', () => {
      assert.strictEqual(parseVersionFromOutput('v1.2.3'), '1.2.3')
    })

    it('extracts version from "1.2.3" format', () => {
      assert.strictEqual(parseVersionFromOutput('1.2.3'), '1.2.3')
    })

    it('extracts version from "git version 2.45.0"', () => {
      assert.strictEqual(parseVersionFromOutput('git version 2.45.0'), '2.45.0')
    })

    it('extracts version from "node v22.12.0"', () => {
      assert.strictEqual(parseVersionFromOutput('node v22.12.0'), '22.12.0')
    })

    it('handles pre-release versions', () => {
      assert.strictEqual(parseVersionFromOutput('v1.2.3-beta.1'), '1.2.3-beta.1')
    })

    it('returns null for empty input', () => {
      assert.strictEqual(parseVersionFromOutput(''), null)
      assert.strictEqual(parseVersionFromOutput(null), null)
    })

    it('returns first line for unrecognized format', () => {
      const result = parseVersionFromOutput('some unknown output')
      assert.ok(typeof result === 'string')
      assert.ok(result.length > 0)
    })
  })

  describe('createCliNotFoundMessage()', () => {
    it('returns install URL for known CLI', () => {
      const msg = createCliNotFoundMessage('claude')
      assert.ok(msg.includes('Claude Code CLI'))
      assert.ok(msg.includes('http'))
    })

    it('returns generic message for unknown CLI', () => {
      const msg = createCliNotFoundMessage('unknown-tool-xyz')
      assert.ok(msg.includes('unknown-tool-xyz'))
      assert.ok(msg.includes('PATH'))
    })

    it('works with CLI name', () => {
      const msg = createCliNotFoundMessage('Git')
      assert.ok(msg.includes('Git'))
      assert.ok(msg.includes('git-scm.com'))
    })
  })

  describe('formatDetectionSummary()', () => {
    it('shows checkmark for detected CLIs', () => {
      const results = [
        { name: 'Git', detected: true, version: '2.45.0', installUrl: '' },
      ]
      const summary = formatDetectionSummary(results)
      assert.ok(summary.includes('✅'))
      assert.ok(summary.includes('Git'))
      assert.ok(summary.includes('2.45.0'))
    })

    it('shows cross for missing CLIs', () => {
      const results = [
        { name: 'Ollama', detected: false, version: null, installUrl: 'https://ollama.ai/' },
      ]
      const summary = formatDetectionSummary(results)
      assert.ok(summary.includes('❌'))
      assert.ok(summary.includes('Ollama'))
      assert.ok(summary.includes('ollama.ai'))
    })

    it('handles mix of detected and missing', () => {
      const results = [
        { name: 'Git', detected: true, version: '2.45.0', installUrl: '' },
        { name: 'Ollama', detected: false, version: null, installUrl: 'https://ollama.ai/' },
      ]
      const summary = formatDetectionSummary(results)
      assert.ok(summary.includes('✅'))
      assert.ok(summary.includes('❌'))
    })
  })

  describe('resolveCommandPath()', () => {
    it('uses case-insensitive PATH env names for Windows-style environments', () => {
      const result = resolveCommandPath('codex', { PATH: 'C:\\Users\\me\\npm' }, {
        platform: 'win32',
        exists: (candidate) => candidate === 'C:\\Users\\me\\npm\\codex.cmd',
      })

      assert.equal(result, 'C:\\Users\\me\\npm\\codex.cmd')
    })

    // Bug real, medido ao vivo: o npm cria, para cada CLI instalada
    // globalmente no Windows, três arquivos com o mesmo nome base — o shim
    // POSIX sem extensão (`codex`), `codex.cmd` e `codex.ps1`. Com os dois
    // presentes, o resolvedor tinha que preferir o `.cmd` (executável de
    // verdade), não o shim POSIX (que o `execFile` não sabe rodar direto no
    // Windows) — antes da correção, ele devolvia o shim sem extensão porque
    // testava `''` antes de `.cmd`.
    it('prefere o .cmd ao shim POSIX sem extensão quando os dois existem', () => {
      const existentes = new Set([
        'C:\\Users\\me\\npm\\codex',
        'C:\\Users\\me\\npm\\codex.cmd',
        'C:\\Users\\me\\npm\\codex.ps1',
      ])
      const result = resolveCommandPath('codex', { PATH: 'C:\\Users\\me\\npm' }, {
        platform: 'win32',
        exists: (candidate) => existentes.has(candidate),
      })

      assert.equal(result, 'C:\\Users\\me\\npm\\codex.cmd')
    })
  })

  it('resolves and executes a Windows .cmd shim before reporting it missing', async () => {
    const calls = []
    const result = await detectCli(SUPPORTED_CLIS.find((cli) => cli.command === 'codex'), {
      PATH: 'C:\\Users\\me\\npm',
    }, {
      platformName: 'win32',
      resolvePath: () => 'C:\\Users\\me\\npm\\codex.cmd',
      execute: async (command, args, options) => {
        calls.push({ command, args, options })
        return { stdout: 'codex 1.2.3' }
      },
    })

    assert.equal(result.detected, true)
    // Citado entre aspas: é isto que evita o `cmd.exe` cortar o comando no
    // primeiro espaço do caminho (ver o teste abaixo com usuário "com espaço").
    assert.equal(calls[0].command, '"C:\\Users\\me\\npm\\codex.cmd"')
    assert.equal(calls[0].options.shell, true)
    assert.equal(result.version, '1.2.3')
  })

  // Bug real, medido ao vivo nesta máquina: `execFile` com `shell: true` no
  // Windows concatena comando e argumentos crus para o `cmd.exe /c` em vez de
  // citá-los. Sem aspas, um caminho de perfil com espaço no nome de usuário —
  // como o desta máquina, "Felipe Martins" — quebra ao meio, e o `cmd.exe`
  // tenta rodar só o pedaço antes do espaço. É exatamente o caso que fazia
  // Claude/Codex/Gemini aparecerem como "não instalada" nesta máquina, mesmo
  // instaladas, enquanto funcionava numa conta sem espaço no nome.
  it('cita o caminho antes de rodar via shell, para sobreviver a espaço no perfil do usuário', async () => {
    const caminhoComEspaco = 'C:\\Users\\Felipe Martins\\AppData\\Roaming\\npm\\claude.cmd'

    // Simula o `cmd.exe /c` real: sem aspas, ele só vê o pedaço do comando até
    // o primeiro espaço — o resto vira argumento solto, e o comando não bate
    // com nada executável.
    const cmdExeFake = async (command) => {
      if (command !== `"${caminhoComEspaco}"`) {
        throw new Error(`comando não reconhecido: ${command}`)
      }
      return { stdout: '2.1.258 (Claude Code)' }
    }

    const result = await detectCli(SUPPORTED_CLIS.find((cli) => cli.command === 'claude'), {
      PATH: 'C:\\Users\\Felipe Martins\\AppData\\Roaming\\npm',
    }, {
      platformName: 'win32',
      resolvePath: () => caminhoComEspaco,
      execute: cmdExeFake,
    })

    assert.equal(result.detected, true)
    assert.equal(result.version, '2.1.258')
  })
})

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  SUPPORTED_CLIS,
  parseVersionFromOutput,
  createCliNotFoundMessage,
  formatDetectionSummary,
} = require('./cli-detector.cjs')

describe('cli-detector', () => {
  describe('SUPPORTED_CLIS', () => {
    it('contains expected CLIs', () => {
      const names = SUPPORTED_CLIS.map((c) => c.command)
      assert.ok(names.includes('claude'))
      assert.ok(names.includes('codex'))
      assert.ok(names.includes('gemini'))
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
      assert.ok(msg.includes('Claude CLI'))
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
})

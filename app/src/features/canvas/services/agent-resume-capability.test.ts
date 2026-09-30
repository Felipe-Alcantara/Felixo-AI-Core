import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import resumeFixtures from '../../../../electron/__fixtures__/agent-resume-versions.json'
import {
  AGENT_RESUME_RULES,
  compareCliVersions,
  isCliVersion,
  resolveAgentResumeCapability,
  resumeDependsOnVersion,
  resumeProvenSince,
  type AgentResumeRule,
} from './agent-resume-capability'

const require = createRequire(import.meta.url)
const main = require('../../../../electron/services/agent-cli-versions.cjs') as {
  CLI_VERSION_PATTERN: RegExp
  normalizeCliVersion: (value: unknown) => string | null
}
const detector = require('../../../../electron/core/cli-detector.cjs') as {
  parseVersionFromOutput: (output: string) => string | null
}

describe('capacidade de retomada por versão (fixtures medidas)', () => {
  it.each(resumeFixtures.versions.map((fixture) => [fixture.provider, fixture.version, fixture] as const))(
    '%s %s',
    (provider, version, fixture) => {
      // O `--version` real vira a versão que o processo principal entrega…
      expect(main.normalizeCliVersion(detector.parseVersionFromOutput(fixture.versionOutput))).toBe(version)
      // …e a tabela resolve o método medido para ela.
      expect(resolveAgentResumeCapability({ provider, version })).toEqual({
        provider,
        version,
        method: fixture.method,
        basis: fixture.basis,
      })
    },
  )

  it('toda regra da tabela tem uma versão medida nas fixtures', () => {
    for (const rule of AGENT_RESUME_RULES) {
      expect(resumeFixtures.versions.some((fixture) => fixture.provider === rule.provider), rule.provider).toBe(true)
    }
  })
})

describe('resolveAgentResumeCapability', () => {
  it('sem versão: Claude e Codex seguem o que o --help documenta; o Gemini não', () => {
    expect(resolveAgentResumeCapability({ provider: 'claude', version: null })).toMatchObject({ method: 'exact-id', basis: 'documented' })
    expect(resolveAgentResumeCapability({ provider: 'codex', version: undefined })).toMatchObject({ method: 'exact-id' })
    expect(resolveAgentResumeCapability({ provider: 'gemini', version: null })).toEqual({
      provider: 'gemini',
      version: null,
      method: 'numeric-index',
      basis: 'unknown-version',
    })
  })

  it('versão fora do formato conta como desconhecida', () => {
    expect(resolveAgentResumeCapability({ provider: 'gemini', version: 'gemini 0.57.0' })).toMatchObject({
      version: null,
      basis: 'unknown-version',
    })
  })

  it('prévia e versão mais nova herdam a regra provada', () => {
    expect(resolveAgentResumeCapability({ provider: 'gemini', version: '0.57.0-preview.2' }).method).toBe('exact-id')
    expect(resolveAgentResumeCapability({ provider: 'gemini', version: '1.0.0' }).method).toBe('exact-id')
    expect(resolveAgentResumeCapability({ provider: 'gemini', version: '0.9' }).method).toBe('numeric-index')
  })

  it('CLI sem regra (Openia, shell) não tem retomada', () => {
    expect(resolveAgentResumeCapability({ provider: 'openia', version: '1.2.3' })).toMatchObject({
      method: 'unsupported',
      basis: 'unknown-provider',
    })
    expect(resolveAgentResumeCapability({ provider: undefined, version: null }).method).toBe('unsupported')
  })

  it('modo e sistema entram na escolha da regra', () => {
    const rules: AgentResumeRule[] = [
      { provider: 'gemini', mode: 'interactive', method: 'latest-only', basis: 'documented', platforms: ['win32'], evidence: 'teste' },
      { provider: 'gemini', mode: 'interactive', method: 'exact-id', basis: 'measured', evidence: 'teste' },
    ]
    expect(resolveAgentResumeCapability({ provider: 'gemini', version: '0.57.0', platform: 'win32', rules }).method).toBe('latest-only')
    expect(resolveAgentResumeCapability({ provider: 'gemini', version: '0.57.0', platform: 'linux', rules }).method).toBe('exact-id')
  })

  it('só o Gemini depende da versão, a partir da 0.57.0', () => {
    expect(resumeDependsOnVersion('gemini')).toBe(true)
    expect(resumeDependsOnVersion('claude')).toBe(false)
    expect(resumeDependsOnVersion('codex')).toBe(false)
    expect(resumeProvenSince('gemini')).toBe('0.57.0')
  })
})

describe('versões', () => {
  it('compara pela parte numérica', () => {
    expect(compareCliVersions('0.57.0', '0.57.0')).toBe(0)
    expect(compareCliVersions('0.57', '0.57.0')).toBe(0)
    expect(compareCliVersions('0.56.9', '0.57.0')).toBe(-1)
    expect(compareCliVersions('0.100.0', '0.57.0')).toBe(1)
    expect(compareCliVersions('0.58.0-nightly.1', '0.57.0')).toBe(1)
  })

  it('o formato aceito é o mesmo do processo principal', () => {
    for (const value of ['2.1.285', '0.156.1', '0.57', '0.60.0-nightly.20261001', '1.0.0-rc_1', 'x', '1', '1.2.3.4', 'v1.2.3', '']) {
      expect(isCliVersion(value), value).toBe(main.CLI_VERSION_PATTERN.test(value))
    }
  })
})

import { describe, expect, it } from 'vitest'
import type { ClaudeConfigOption } from '../../shared/types/claude-terminal-defaults'
import {
  CHOICE_CLAUDE_DEFAULT,
  CHOICE_INHERIT,
  changeForChoice,
  currentChoice,
  formatClaudeDefault,
  optionOrigin,
  valueChoice,
} from './claude-terminal-defaults-view'

const theme: ClaudeConfigOption = {
  key: 'theme',
  label: 'Tema',
  source: 'settings',
  type: 'enum',
  options: [
    { value: 'dark', label: 'Escuro' },
    { value: 'light', label: 'Claro' },
  ],
  claudeDefault: 'dark',
  editable: true,
}
const verbose: ClaudeConfigOption = {
  key: 'verbose',
  label: 'Saída detalhada',
  source: 'settings',
  type: 'boolean',
  options: [
    { value: true, label: 'Ligado' },
    { value: false, label: 'Desligado' },
  ],
  claudeDefault: false,
  editable: true,
}

const state = {
  global: { theme: 'light' },
  accounts: { 'conta-b': { theme: 'dark', verbose: null } },
}

describe('padrão dos terminais do Claude (visão)', () => {
  it('mostra a escolha atual no escopo global e no da conta', () => {
    expect(currentChoice(state, { accountId: null }, theme)).toBe(valueChoice('light'))
    expect(currentChoice(state, { accountId: null }, verbose)).toBe(CHOICE_INHERIT)
    expect(currentChoice(state, { accountId: 'conta-b' }, theme)).toBe(valueChoice('dark'))
    expect(currentChoice(state, { accountId: 'conta-b' }, verbose)).toBe(CHOICE_CLAUDE_DEFAULT)
    expect(currentChoice(state, { accountId: 'conta-c' }, theme)).toBe(CHOICE_INHERIT)
  })

  it('diz de onde vem o valor', () => {
    expect(optionOrigin(state, { accountId: 'conta-b' }, 'theme')).toBe('account')
    expect(optionOrigin(state, { accountId: 'conta-b' }, 'verbose')).toBe('claude')
    expect(optionOrigin(state, { accountId: 'conta-c' }, 'theme')).toBe('app')
    expect(optionOrigin(state, { accountId: null }, 'verbose')).toBe('claude')
  })

  it('converte a escolha na mudança gravada', () => {
    expect(changeForChoice(theme, { accountId: null }, valueChoice('dark'))).toEqual({ key: 'theme', value: 'dark' })
    expect(changeForChoice(verbose, { accountId: null }, valueChoice(false))).toEqual({ key: 'verbose', value: false })
    expect(changeForChoice(theme, { accountId: null }, CHOICE_INHERIT)).toEqual({ key: 'theme', clear: true })
    expect(changeForChoice(theme, { accountId: 'conta-b' }, CHOICE_CLAUDE_DEFAULT)).toEqual({
      key: 'theme',
      accountId: 'conta-b',
      value: null,
    })
    // "Padrão do Claude" no global é o mesmo que limpar; um valor fora da lista não vira mudança.
    expect(changeForChoice(theme, { accountId: null }, CHOICE_CLAUDE_DEFAULT)).toBeNull()
    expect(changeForChoice(theme, { accountId: null }, valueChoice('roxo'))).toBeNull()
  })

  it('rotula o padrão do próprio Claude', () => {
    expect(formatClaudeDefault(theme)).toBe('Escuro')
    expect(formatClaudeDefault({ ...verbose, claudeDefault: null })).toBe('sem padrão fixo')
  })
})

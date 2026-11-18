import { useCallback, useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { FelixoSelect } from '../../../shared/components/FelixoSelect'
import type { CliAccount } from '../../../shared/types/cli-accounts'
import type { ClaudeConfigOption, ClaudeTerminalDefaultsState } from '../../../shared/types/claude-terminal-defaults'
import {
  CHOICE_CLAUDE_DEFAULT,
  CHOICE_INHERIT,
  changeForChoice,
  currentChoice,
  describeOrigin,
  formatClaudeDefault,
  optionOrigin,
  valueChoice,
} from '../../services/claude-terminal-defaults-view'

const GLOBAL_SCOPE = '__global'
const EMPTY_STATE: ClaudeTerminalDefaultsState = { global: {}, accounts: {} }

/**
 * Aba Config do `/status` do Claude Code, no app: padrão global dos terminais novos, com exceção
 * por conta. Vale só nos terminais do app (`--settings`, flag ou variável da CLI): o app não grava
 * o `settings.json` nem o `~/.claude.json`.
 */
export function ClaudeConfigDefaultsSection() {
  const [options, setOptions] = useState<ClaudeConfigOption[]>([])
  const [state, setState] = useState<ClaudeTerminalDefaultsState>(EMPTY_STATE)
  const [accounts, setAccounts] = useState<CliAccount[]>([])
  const [scopeId, setScopeId] = useState(GLOBAL_SCOPE)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const api = window.felixo
    void api?.claudeTerminalDefaults?.get().then((result) => {
      if (!active) return
      if (result.ok) {
        setOptions(result.options)
        setState({ global: result.global, accounts: result.accounts })
      } else {
        setMessage(result.message)
      }
    })
    void api?.cliAccounts?.list('claude').then((result) => {
      if (active && result.ok) setAccounts((result.accounts ?? []).filter((account) => account.authKind !== 'api-key'))
    })
    return () => {
      active = false
    }
  }, [])

  const scope = useMemo(() => ({ accountId: scopeId === GLOBAL_SCOPE ? null : scopeId }), [scopeId])
  const scopeOptions = useMemo(
    () => [
      { value: GLOBAL_SCOPE, label: 'Padrão do app (todas as contas)' },
      ...accounts.map((account) => ({ value: account.id, label: `Exceção: ${account.label}` })),
    ],
    [accounts],
  )

  const choose = useCallback(
    async (option: ClaudeConfigOption, choice: string) => {
      const change = changeForChoice(option, scope, choice)
      if (!change) return
      const result = await window.felixo?.claudeTerminalDefaults?.set(change)
      if (result?.ok) {
        setState({ global: result.global, accounts: result.accounts })
        setMessage(null)
      } else {
        setMessage(result?.message ?? 'Não foi possível gravar o padrão dos terminais do Claude.')
      }
    },
    [scope],
  )

  const editable = options.filter((option) => option.editable)
  const readOnly = options.filter((option) => !option.editable)

  return (
    <section className="rounded-2xl border border-white/8 bg-black/10 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
        <SlidersHorizontal size={14} aria-hidden="true" />
        Configurações do Claude Code nos terminais do app
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
        É a aba Config do /status do Claude Code. O que você escolher vale para os terminais NOVOS do Claude abertos
        pelo app, com exceção opcional por conta. O app não grava o settings.json nem o .claude.json do Claude:
        &quot;Padrão do Claude&quot; deixa valer o que já está configurado nele.
      </p>
      <div className="mt-2 max-w-sm">
        <FelixoSelect
          value={scopeId}
          options={scopeOptions}
          onChange={setScopeId}
          aria-label="Escopo do padrão: app inteiro ou exceção de uma conta"
        />
      </div>
      {message && (
        <p role="alert" className="mt-2 text-[11px] text-(--color-warning)">
          {message}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {editable.map((option) => (
          <li key={option.key} className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-zinc-300">{option.label}</div>
              <div className="text-[10px] text-zinc-600">
                {describeOrigin(optionOrigin(state, scope, option.key))} · Claude: {formatClaudeDefault(option)}
              </div>
              {option.warning && (
                <div className="max-w-md text-[10px] leading-snug text-(--color-warning)">{option.warning}</div>
              )}
            </div>
            <div className="w-52 shrink-0">
              <FelixoSelect
                value={currentChoice(state, scope, option)}
                options={[
                  {
                    value: CHOICE_INHERIT,
                    label: scope.accountId === null ? 'Padrão do Claude' : 'Seguir o padrão do app',
                  },
                  ...(scope.accountId === null ? [] : [{ value: CHOICE_CLAUDE_DEFAULT, label: 'Padrão do Claude' }]),
                  ...option.options.map((candidate) => ({
                    value: valueChoice(candidate.value),
                    label: candidate.label,
                  })),
                ]}
                onChange={(choice) => void choose(option, choice)}
                aria-label={option.label}
              />
            </div>
          </li>
        ))}
      </ul>
      {readOnly.length > 0 && (
        <div className="mt-3 border-t border-white/8 pt-2">
          <div className="text-[11px] font-medium text-zinc-400">Só leitura</div>
          <p className="text-[10px] text-zinc-600">
            Guardadas no .claude.json, sem flag nem variável na CLI: {readOnly[0].note}.
          </p>
          <ul className="mt-1 space-y-0.5">
            {readOnly.map((option) => (
              <li key={option.key} className="text-[11px] text-zinc-500">
                {option.label}: padrão do Claude {formatClaudeDefault(option)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

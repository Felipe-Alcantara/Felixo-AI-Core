import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react'
import { FelixoToggle } from '../../../shared/components/FelixoToggle'
import { FelixoSelect, type FelixoSelectOption } from '../../../shared/components/FelixoSelect'
import type { AccountChainMember, AccountBillingClass } from '../../../shared/types/account-chain'
import { useAccountChain, useClockTick } from '../../hooks/useAccountChain'
import {
  STRATEGY_OPTIONS,
  formatBilling,
  formatCapacity,
  formatCooldown,
  formatLogin,
  formatMultiplier,
  ineligibilityText,
  moveMember,
  parseMultiplierInput,
  positionAnnouncement,
  providerLabel,
  summarizeChain,
} from '../../services/account-chain-view'

const STRATEGY_SELECT_OPTIONS: FelixoSelectOption[] = STRATEGY_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
  description: option.description,
}))

const BILLING_OPTIONS: FelixoSelectOption[] = [
  { value: '', label: 'Não declarada', description: 'Vale a cobrança que a CLI informar' },
  { value: 'assinatura', label: 'Assinatura', description: 'Plano mensal da conta' },
  { value: 'uso', label: 'Cobrança por uso', description: 'Cada uso gasta crédito' },
]

const AVISO = 'rounded-md border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-2 py-1.5 text-[11px] text-(--color-warning)'
const BOTAO_PEQUENO = 'felixo-btn rounded-sm bg-white/6 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-white/12 disabled:opacity-40'

/**
 * Aba "Cadeia" do painel Limites e uso.
 *
 * Liga e desliga a cadeia, escolhe a estratégia e ordena as contas. A ordem é
 * mudada por botões e por Alt+↑/↓ na linha focada — nada depende de arrastar —
 * e um `aria-live` anuncia a posição nova. Quem decide elegibilidade, espera e
 * capacidade é o processo principal; esta tela só mostra e repassa.
 */
export function AccountChainSection() {
  const { snapshot, store } = useAccountChain()
  const [announcement, setAnnouncement] = useState('')
  const [busy, setBusy] = useState(false)
  // Depois de mover, o foco segue a linha movida (a lista é re-renderizada
  // com o estado novo do main e a linha focada teria sumido do lugar).
  const focusAfterMoveRef = useRef<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const helpId = useId()
  const state = snapshot.state
  const nowMs = useClockTick()

  useEffect(() => {
    const accountId = focusAfterMoveRef.current
    if (!accountId) return
    focusAfterMoveRef.current = null
    listRef.current
      ?.querySelector<HTMLElement>(`[data-chain-member="${CSS.escape(accountId)}"]`)
      ?.focus()
  }, [state])

  if (snapshot.status === 'unavailable' || snapshot.status === 'error' || !state) {
    return (
      <p
        role={snapshot.status === 'error' ? 'alert' : 'status'}
        className="rounded-md border border-white/10 bg-white/2 px-3 py-4 text-center text-[12px] text-zinc-500"
      >
        {snapshot.status === 'loading' ? 'Carregando a cadeia de contas…' : snapshot.message}
      </p>
    )
  }

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const saveMembers = (members: AccountChainMember[]) => run(() => store.updateMembers(members))

  const patchMember = (accountId: string, patch: Partial<AccountChainMember>) =>
    saveMembers(
      state.members.map((member) =>
        member.accountId === accountId ? { ...member, ...patch } : member,
      ),
    )

  const move = (member: AccountChainMember, delta: -1 | 1) => {
    const next = moveMember(state.members, member.accountId, delta)
    if (!next) return
    const index = next.findIndex((item) => item.accountId === member.accountId)
    focusAfterMoveRef.current = member.accountId
    void saveMembers(next).then(() => {
      setAnnouncement(positionAnnouncement(member.label, index))
    })
  }

  return (
    <div className="space-y-3 text-[12px] text-zinc-300">
      <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/2 p-2.5">
        <FelixoToggle
          checked={state.settings.enabled}
          onChange={(enabled) => void run(() => store.updateSettings({ enabled }))}
          label="Cadeia de contas"
          disabled={busy}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-zinc-100">Cadeia de contas</p>
          <p id={helpId} className="mt-0.5 text-[11px] leading-snug text-zinc-500">
            Desligada: nenhum bloco troca de conta. Ligada: a cadeia só propõe; toda troca pede a
            sua confirmação.
          </p>
          <p role="status" className="mt-1 text-[11px] text-zinc-300">
            {summarizeChain(state)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="account-chain-strategy" className="text-[11px] text-zinc-500">
          Estratégia
        </label>
        <FelixoSelect
          id="account-chain-strategy"
          value={state.settings.strategy}
          options={STRATEGY_SELECT_OPTIONS}
          onChange={(value) =>
            void run(() =>
              store.updateSettings({
                strategy: value as (typeof STRATEGY_OPTIONS)[number]['value'],
              }),
            )
          }
          disabled={busy || !state.settings.enabled}
          aria-label="Estratégia da cadeia"
          className="min-w-52 flex-1"
        />
      </div>
      <p className="-mt-2 text-[11px] leading-snug text-zinc-500">
        {STRATEGY_OPTIONS.find((option) => option.value === state.settings.strategy)?.description}
      </p>

      {snapshot.message && (
        <p role="status" className={AVISO}>
          {snapshot.message}
        </p>
      )}

      {state.envCredentialNames.length > 0 && (
        <p className={AVISO}>
          O ambiente do app tem credencial de API ({state.envCredentialNames.join(', ')}). Terminais
          com conta própria não a herdam; o Login do sistema herda.
        </p>
      )}

      {state.members.length === 0 ? (
        <p className="rounded-md border border-white/10 bg-white/2 px-3 py-4 text-center text-[12px] text-zinc-500">
          Nenhuma conta com login próprio. Crie contas no campo Conta ao abrir um agente.
        </p>
      ) : (
        <ol
          ref={listRef}
          aria-label="Ordem da cadeia de contas"
          aria-describedby={helpId}
          className="space-y-2"
        >
          {state.members.map((member, index) => (
            <ChainMemberRow
              key={member.accountId}
              member={member}
              index={index}
              total={state.members.length}
              busy={busy}
              nowMs={nowMs}
              onMove={(delta) => move(member, delta)}
              onPatch={(patch) => void patchMember(member.accountId, patch)}
              onCheckLogin={() => void run(() => store.checkLogin([member.accountId]))}
              onRelease={(reason) =>
                void run(() => store.releaseCooldown(member.accountId, reason))
              }
            />
          ))}
        </ol>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}

function ChainMemberRow({
  member,
  index,
  total,
  busy,
  nowMs,
  onMove,
  onPatch,
  onCheckLogin,
  onRelease,
}: {
  member: AccountChainMember
  index: number
  total: number
  busy: boolean
  nowMs: number
  onMove: (delta: -1 | 1) => void
  onPatch: (patch: Partial<AccountChainMember>) => void
  onCheckLogin: () => void
  onRelease: (reason: 'not-a-limit' | 'recharged') => void
}) {
  const [multiplierDraft, setMultiplierDraft] = useState<string | null>(null)
  const [multiplierError, setMultiplierError] = useState(false)
  const baseId = useId()
  const label = member.label.trim() || 'Conta sem nome'
  const provider = providerLabel(member.providerId)

  const onRowKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    onMove(event.key === 'ArrowUp' ? -1 : 1)
  }

  const commitMultiplier = () => {
    if (multiplierDraft === null) return
    const parsed = parseMultiplierInput(multiplierDraft)
    if (!parsed.ok) {
      setMultiplierError(true)
      return
    }
    setMultiplierError(false)
    setMultiplierDraft(null)
    if (parsed.value !== member.multiplierDeclared) onPatch({ multiplierDeclared: parsed.value })
  }

  const cooldownText = formatCooldown(member.cooldown)

  return (
    <li
      data-chain-member={member.accountId}
      tabIndex={0}
      onKeyDown={onRowKeyDown}
      aria-label={`${index + 1}ª: ${label}, ${provider}. Alt e setas mudam a posição.`}
      className="rounded-lg border border-white/10 bg-white/2 p-2.5 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400"
    >
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
          {index + 1}.
        </span>
        <span className="rounded-sm bg-white/6 px-1.5 py-0.5 text-[10px] text-zinc-400">
          {provider}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-100">{label}</span>
        <span
          className={`shrink-0 text-[10px] ${member.eligible ? 'text-theme-success' : 'text-zinc-500'}`}
        >
          {member.eligible ? 'apta' : 'fora agora'}
        </span>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={busy || index === 0}
          aria-label={`Mover ${label} para cima`}
          title={`Mover ${label} para cima`}
          className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100 disabled:opacity-30"
        >
          <ArrowUp size={12} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={busy || index === total - 1}
          aria-label={`Mover ${label} para baixo`}
          title={`Mover ${label} para baixo`}
          className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100 disabled:opacity-30"
        >
          <ArrowDown size={12} />
        </button>
      </div>

      {!member.eligible && member.reason && (
        <p className="mt-1 pl-7 text-[11px] text-zinc-500">
          Motivo: {ineligibilityText(member.reason, member.reasonText)}
        </p>
      )}

      <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 pl-7 text-[11px]">
        <dt className="text-zinc-500">Na cadeia</dt>
        <dd>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={member.enabled && !member.locked}
              disabled={busy || member.locked}
              onChange={(event) => onPatch({ enabled: event.target.checked })}
              className="accent-sky-400"
            />
            <span>{member.locked ? 'Travada: o app não confere o login deste provedor' : 'Habilitada na cadeia'}</span>
          </label>
        </dd>

        <dt className="text-zinc-500">Cobrança</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <FelixoSelect
            value={member.billingDeclared ?? ''}
            options={BILLING_OPTIONS}
            onChange={(value) =>
              onPatch({ billingDeclared: (value || null) as AccountBillingClass | null })
            }
            disabled={busy}
            aria-label={`Cobrança declarada de ${label}`}
            className="min-w-40"
          />
          <span className="text-zinc-500">
            {formatBilling(member.billingDeclared, member.billingDetected)}
          </span>
        </dd>

        <dt className="text-zinc-500">
          <label htmlFor={`${baseId}-mult`}>Multiplicador</label>
        </dt>
        <dd className="flex flex-wrap items-center gap-2">
          {member.multiplierSource === 'cli' ? (
            <span>{formatMultiplier({
              multiplier: member.multiplier,
              source: member.multiplierSource,
              declared: member.multiplierDeclared,
              detected: member.multiplierDetected,
            })}</span>
          ) : (
            <>
              <input
                id={`${baseId}-mult`}
                inputMode="decimal"
                value={multiplierDraft ?? (member.multiplierDeclared?.toString() ?? '')}
                placeholder="1 a 100"
                disabled={busy}
                aria-invalid={multiplierError}
                aria-describedby={`${baseId}-mult-help`}
                onChange={(event) => {
                  setMultiplierDraft(event.target.value)
                  setMultiplierError(false)
                }}
                onBlur={commitMultiplier}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitMultiplier()
                  }
                }}
                className="w-16 rounded-sm border border-white/10 bg-black/30 px-1.5 py-0.5 text-[11px] text-zinc-100"
              />
              <span id={`${baseId}-mult-help`} className={multiplierError ? 'text-theme-error' : 'text-zinc-500'}>
                {multiplierError
                  ? 'Use um número de 1 a 100, ou deixe vazio.'
                  : formatMultiplier({
                      multiplier: member.multiplier,
                      source: member.multiplierSource,
                      declared: member.multiplierDeclared,
                      detected: member.multiplierDetected,
                    })}
              </span>
            </>
          )}
          {member.providerId === 'claude' && member.login?.plan?.toLowerCase().includes('max') && member.multiplierSource !== 'cli' && (
            <span className="basis-full text-zinc-500">
              Plano Claude Max: a CLI não informa se é 5x ou 20x. Declare aqui.
            </span>
          )}
        </dd>

        <dt className="text-zinc-500">Login</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span>{formatLogin(member.login, nowMs)}</span>
          {!member.locked && (
            <button
              type="button"
              onClick={onCheckLogin}
              disabled={busy}
              aria-label={`Conferir agora o login de ${label}`}
              className={`${BOTAO_PEQUENO} flex items-center gap-1`}
            >
              <RefreshCw size={10} aria-hidden="true" />
              Conferir agora
            </button>
          )}
          {member.apiKeySourcePresent && (
            <span className="basis-full text-(--color-warning)">
              Há chave de API no ambiente do perfil desta conta.
            </span>
          )}
        </dd>

        {cooldownText && (
          <>
            <dt className="text-zinc-500">Espera</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span>{cooldownText}</span>
              {member.cooldown?.failureClass === 'limit' && (
                <button
                  type="button"
                  onClick={() => onRelease('not-a-limit')}
                  disabled={busy}
                  className={BOTAO_PEQUENO}
                >
                  Não era limite
                </button>
              )}
              {member.cooldown?.failureClass === 'billing' && (
                <button
                  type="button"
                  onClick={() => onRelease('recharged')}
                  disabled={busy}
                  className={BOTAO_PEQUENO}
                >
                  Já recarreguei
                </button>
              )}
            </dd>
          </>
        )}

        <dt className="text-zinc-500">Capacidade</dt>
        <dd>{formatCapacity(member.capacity, member.multiplier)}</dd>
      </dl>
    </li>
  )
}

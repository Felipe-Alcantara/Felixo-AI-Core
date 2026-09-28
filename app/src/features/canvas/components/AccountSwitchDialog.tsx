import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRightLeft, X } from 'lucide-react'
import { getFocusableElements, tabTrapTarget } from '../services/keyboard-focus'
import { buildAccountSwitchDialogModel, initialDialogSelection } from '../services/account-switch-dialog'
import type { AccountSwitchDialogBinding } from '../hooks/useAccountContinuation'
import { useClockTick } from '../hooks/useAccountChain'

const AVISO =
  'rounded-sm border border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-2.5 py-2 text-[11px] leading-relaxed text-(--color-warning)'
const BOTAO_SECUNDARIO =
  'felixo-btn rounded-sm px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400'

/**
 * "Trocar de conta?" (§8.2). Só abre por clique em "Ver opções" — nunca
 * sozinho. O foco inicial fica no rádio recomendado, nunca no botão
 * primário; Enter sobre um rádio não confirma; Esc vale "Agora não"; ao
 * fechar, o foco volta a quem abriu. O destino marcado ao abrir já conta
 * como a escolha da pessoa: se a conta escolhida sai da proposta ao vivo, o
 * diálogo avisa e fica sem destino até ela escolher outra (decisão 1).
 */
export function AccountSwitchDialog({ binding }: { binding: AccountSwitchDialogBinding }) {
  const { proposal } = binding
  const nowMs = useClockTick(5_000)
  const [selectedId, setSelectedId] = useState<string | null>(() => initialDialogSelection(proposal))
  const [autoSubmit, setAutoSubmit] = useState(true)
  const [acknowledged, setAcknowledged] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const radiogroupRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const summaryId = useId()
  const radioName = useId()
  const transcript = binding.transcript
  const model = buildAccountSwitchDialogModel({
    proposal,
    selectedAccountId: selectedId,
    transcriptChars: transcript?.ok ? transcript.chars : 0,
    transcriptLines: transcript?.ok ? transcript.lines : 0,
    nowMs,
  })
  const chosenId = model.initialFocusAccountId
  const onLater = binding.onLater
  const selectionLost = model.selectionLost

  // Foco inicial no rádio recomendado (ou no primeiro); sem opções, no painel.
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const radio = panel.querySelector<HTMLInputElement>('input[type="radio"]:checked')
    ;(radio ?? panel).focus()
    // Só na abertura: re-renderizar não pode roubar o foco de quem já navegou.
  }, [])

  // A escolha saiu da proposta: o botão que estava focado perdeu o destino.
  // O foco vai para a lista, onde a pessoa escolhe de novo (o aviso é alert).
  useEffect(() => {
    if (!selectionLost) return
    ;(radiogroupRef.current ?? panelRef.current)?.focus()
  }, [selectionLost])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onLater()
        return
      }
      if (event.key !== 'Tab') return
      const elements = getFocusableElements(panel)
      if (elements.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const active = document.activeElement
      const target = tabTrapTarget(
        elements,
        active instanceof HTMLElement ? active : null,
        event.shiftKey,
        active instanceof Node && panel.contains(active),
      )
      if (target) {
        event.preventDefault()
        target.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onLater])

  // Enter sobre o rádio não confirma nada: só as setas escolhem e só o botão
  // confirma. Sem isto um Enter apressado abriria o bloco na conta errada.
  const blockEnter = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter') event.preventDefault()
  }

  const needsAck = binding.sourceActiveRequired || model.oldTerminal.sourceActive
  const transcriptReady = transcript?.ok === true
  const canConfirm =
    !binding.busy &&
    !binding.closedElsewhere &&
    chosenId !== null &&
    transcriptReady &&
    (!needsAck || acknowledged)

  const confirm = () => {
    if (!canConfirm || !chosenId) return
    binding.onConfirm({
      destinationAccountId: chosenId,
      autoSubmit,
      acknowledgeSourceActive: needsAck && acknowledged,
    })
  }

  return (
    // `nokey`: Delete/Backspace com o foco no diálogo não chegam ao React Flow,
    // que apagaria o bloco selecionado atrás do modal (o terminal antigo).
    <div className="nokey fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={summaryId}
        tabIndex={-1}
        className="felixo-anim-sequential-panel max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-lg bg-zinc-800 p-4 text-zinc-200 shadow-2xl ring-1 ring-white/10 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <ArrowRightLeft size={15} aria-hidden="true" />
              {model.title}
            </h2>
            <p id={summaryId} className="mt-1 text-xs text-zinc-400">
              {model.summary}
            </p>
          </div>
          <button
            type="button"
            onClick={binding.onLater}
            className="felixo-btn-icon shrink-0 rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
            aria-label="Agora não"
          >
            <X size={15} />
          </button>
        </div>

        <section aria-label="Conta de origem" className="mb-3 rounded-sm border border-white/10 bg-black/20 p-2.5 text-[12px]">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">De</p>
          <p className="mt-0.5 text-zinc-100">{model.from.name}</p>
          <p className="text-[11px] text-zinc-400">
            {model.from.billing}
            {model.from.multiplier ? ` · ${model.from.multiplier}` : ''}
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">
            <time dateTime={proposal.detectedAt ?? undefined}>{model.from.detected}</time>
          </p>
          {model.from.evidence && (
            <p className="mt-1 rounded-sm bg-black/30 px-1.5 py-1 font-mono text-[10px] text-zinc-300">
              {model.from.evidence}
            </p>
          )}
          {model.from.cooldown && <p className="mt-1 text-[11px] text-zinc-400">{model.from.cooldown}</p>}
        </section>

        {model.empty ? (
          <div className="mb-3 space-y-2 text-[12px]">
            <p role="status" className="text-zinc-200">{model.emptyText}</p>
            {model.excluded.length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-zinc-400">
                {model.excluded.map((item) => (
                  <li key={item.name}>
                    {item.name}: {item.reason}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => binding.onCheckLogin(proposal.excluded.map((item) => item.accountId))}
                className={BOTAO_SECUNDARIO}
              >
                Conferir login de novo
              </button>
              <button type="button" onClick={binding.onOpenChainSettings} className={BOTAO_SECUNDARIO}>
                Configurar cadeia
              </button>
              <button type="button" onClick={binding.onClose} className={BOTAO_SECUNDARIO}>
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <fieldset className="mb-3">
            <legend className="mb-1 flex w-full items-center justify-between text-[10px] uppercase tracking-wide text-zinc-500">
              <span>Para</span>
              {proposal.strategy === 'most_capacity' && (
                <button
                  type="button"
                  onClick={binding.onMeasureNow}
                  className="felixo-btn rounded-sm px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-sky-300 hover:bg-white/6"
                >
                  Medir agora
                </button>
              )}
            </legend>
            <div
              ref={radiogroupRef}
              role="radiogroup"
              aria-label="Conta de destino"
              tabIndex={-1}
              className="space-y-1.5 rounded-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {model.options.map((option) => (
                <label
                  key={option.accountId}
                  className={`flex cursor-pointer items-start gap-2 rounded-sm border px-2.5 py-2 text-[12px] ${
                    option.accountId === chosenId
                      ? 'border-sky-400/60 bg-sky-400/10'
                      : 'border-white/10 bg-black/20 hover:bg-white/4'
                  }`}
                >
                  <input
                    type="radio"
                    name={radioName}
                    value={option.accountId}
                    checked={option.accountId === chosenId}
                    onChange={() => setSelectedId(option.accountId)}
                    onKeyDown={blockEnter}
                    className="mt-0.5 accent-sky-400"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-zinc-100">{option.name}</span>
                      {option.recommended && (
                        <span className="rounded-sm bg-sky-400/15 px-1 text-[10px] text-sky-200">Recomendada</span>
                      )}
                    </span>
                    <span className="block text-[11px] text-zinc-400">
                      {option.billing}
                      {option.plan ? ` · plano ${option.plan}` : ''} · {option.explanation}
                    </span>
                    <span className="block text-[11px] text-zinc-400">Capacidade: {option.capacity}</span>
                    <span className="block text-[11px] text-zinc-400" aria-busy={option.checkingLogin}>
                      Login: {option.login} · identidade {option.identity}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {model.excluded.length > 0 && (
              <details className="mt-2 text-[11px] text-zinc-400">
                <summary className="cursor-pointer text-zinc-300">Fora agora ({model.excluded.length})</summary>
                <ul className="mt-1 space-y-0.5 pl-3">
                  {model.excluded.map((item) => (
                    <li key={item.name}>
                      {item.name}: {item.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </fieldset>
        )}

        {selectionLost && (
          <p role="alert" className="mb-3 text-xs text-theme-error">
            {selectionLost}
          </p>
        )}

        {transcript === null && (
          <p role="status" aria-busy="true" className="mb-3 text-[11px] text-zinc-400">
            Mascarando segredos do histórico…
          </p>
        )}
        {transcript && !transcript.ok && (
          <p role="alert" className="mb-3 text-[11px] text-theme-error">
            {transcript.message}
          </p>
        )}

        {!model.empty && transcriptReady && model.costNotice && <p className={`mb-2 ${AVISO}`}>{model.costNotice}</p>}
        {!model.empty && model.providerSwitchNotice && <p className={`mb-2 ${AVISO}`}>{model.providerSwitchNotice}</p>}
        {model.multipleSessionsNotice && <p className="mb-2 text-[11px] text-zinc-400">{model.multipleSessionsNotice}</p>}

        <section aria-label="Terminal antigo" className="mb-3 rounded-sm border border-white/10 bg-black/20 p-2.5 text-[11px] text-zinc-400">
          <p>{model.oldTerminal.untouched}</p>
          <p className={model.oldTerminal.sourceActive ? 'text-(--color-warning)' : undefined}>
            {model.oldTerminal.activity}
          </p>
          {model.oldTerminal.autoResume && <p className="mt-1 text-(--color-warning)">{model.oldTerminal.autoResume}</p>}
          <button
            type="button"
            onClick={binding.onGoToSource}
            className="felixo-btn mt-1 rounded-sm px-1.5 py-0.5 text-[11px] text-sky-300 hover:bg-white/6"
          >
            Ir para o terminal antigo
          </button>
        </section>

        {!model.empty && needsAck && (
          <label className="mb-2 flex items-start gap-2 text-[12px] text-(--color-warning)">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              onKeyDown={blockEnter}
              className="mt-0.5 accent-sky-400"
            />
            O terminal antigo ainda está produzindo saída. Entendo; abrir mesmo assim.
          </label>
        )}

        {!model.empty && (
          <label className="mb-3 flex items-start gap-2 text-[12px] text-zinc-300">
            <input
              type="checkbox"
              checked={autoSubmit}
              onChange={(event) => setAutoSubmit(event.target.checked)}
              onKeyDown={blockEnter}
              className="mt-0.5 accent-sky-400"
            />
            Pedir para o agente continuar assim que abrir
          </label>
        )}

        {binding.closedElsewhere && (
          <p role="alert" className="mb-3 text-xs text-theme-error">
            Esta proposta já foi decidida em outro lugar ou expirou. Nada será aberto.
          </p>
        )}
        {binding.error && (
          <p role="alert" className="mb-3 text-xs text-theme-error">
            {binding.error}
          </p>
        )}

        {!model.empty && (
          <div className="flex flex-wrap justify-end gap-2">
            {binding.canPin && (
              <button type="button" onClick={binding.onPin} disabled={binding.busy} className={BOTAO_SECUNDARIO}>
                Fixar este bloco na conta atual
              </button>
            )}
            {proposal.failureClass === 'limit' && (
              <button type="button" onClick={binding.onNotALimit} disabled={binding.busy} className={BOTAO_SECUNDARIO}>
                Não era limite
              </button>
            )}
            <button type="button" onClick={binding.onLater} disabled={binding.busy} className={BOTAO_SECUNDARIO}>
              Agora não
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className="felixo-btn felixo-primary-action rounded-sm px-3 py-1.5 text-sm disabled:opacity-50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {binding.busy ? 'Abrindo…' : model.confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

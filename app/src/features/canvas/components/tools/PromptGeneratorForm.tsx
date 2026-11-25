import { useMemo, useState } from 'react'
import { Check, CircleAlert, Copy, SendHorizontal, Wand2, X } from 'lucide-react'
import { FelixoSelect, type FelixoSelectOption } from '../../../shared/components/FelixoSelect'
import { useI18n } from '../../../i18n/useI18n'
import type { MessageKey } from '../../../i18n/messages.pt-BR'
import type { AutomationScope, PromptGeneratorFields } from '../../../shared/types/automations'
import { compactGeneratorFields, montarPrompt, nomeSugerido } from '../../services/prompt-generator'
import { describeSingleInsertFeedback } from '../../services/prompt-delivery-feedback'
import type { SkillActivationResult } from './SkillsPanel'

type Props = {
  initialFields?: PromptGeneratorFields
  initialName?: string
  initialScope?: AutomationScope
  /** Já salvo no catálogo: o botão passa a "Atualizar". */
  editing: boolean
  scopeOptions: FelixoSelectOption[]
  onSend: (prompt: { name: string; content: string }) => Promise<SkillActivationResult>
  /** Devolve a mensagem de erro, ou null quando salvou. */
  onSave: (input: {
    name: string
    content: string
    scope: AutomationScope
    fields: PromptGeneratorFields
  }) => Promise<string | null>
  onClose: () => void
}

type Status = { tone: 'ok' | 'error'; text: string } | null

const inputClass =
  'w-full resize-y rounded-sm bg-zinc-900/60 p-2 text-xs text-zinc-300 outline-hidden placeholder:text-zinc-600'
const buttonClass =
  'felixo-btn flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Gerador de prompts: objetivo, contexto e formato viram um prompt por modelo
 * (sem IA, sem rede). O texto da prévia é o que sai, e é editável antes disso.
 */
export function PromptGeneratorForm({
  initialFields,
  initialName,
  initialScope = 'chat',
  editing,
  scopeOptions,
  onSend,
  onSave,
  onClose,
}: Props) {
  const { t } = useI18n()
  const [fields, setFields] = useState<PromptGeneratorFields>(initialFields ?? { objetivo: '' })
  // Texto editado à mão na prévia; null = a prévia acompanha os campos.
  const [editedText, setEditedText] = useState<string | null>(null)
  const [name, setName] = useState(initialName ?? '')
  const [scope, setScope] = useState<AutomationScope>(initialScope)
  const [busy, setBusy] = useState<'send' | 'save' | null>(null)
  const [status, setStatus] = useState<Status>(null)

  const built = useMemo(() => montarPrompt(fields), [fields])
  const text = editedText ?? built
  const effectiveName = name.trim() || nomeSugerido(fields)
  const hasText = text.trim().length > 0
  const hasExtras = Boolean(fields.restricoes || fields.criterioAceite)

  const setField = (key: keyof PromptGeneratorFields, value: string) => {
    setStatus(null)
    setFields((current) => ({ ...current, [key]: value }))
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus({ tone: 'ok', text: t('gerador.copiadoAviso') })
    } catch {
      setStatus({ tone: 'error', text: t('gerador.erroCopiar') })
    }
  }

  const send = async () => {
    setBusy('send')
    let result: SkillActivationResult
    try {
      result = await onSend({ name: effectiveName, content: text })
    } catch {
      result = 'failed'
    } finally {
      setBusy(null)
    }
    const feedback = describeSingleInsertFeedback(result)
    setStatus({ tone: feedback.isError ? 'error' : 'ok', text: feedback.text })
  }

  const save = async () => {
    const compact = compactGeneratorFields(fields)
    if (!compact) return
    setBusy('save')
    try {
      const error = await onSave({ name: effectiveName, content: text, scope, fields: compact })
      setStatus(error ? { tone: 'error', text: error } : { tone: 'ok', text: t('gerador.salvo') })
    } finally {
      setBusy(null)
    }
  }

  const area = (key: keyof PromptGeneratorFields, label: MessageKey, hint: MessageKey, rows: number) => (
    <label className="mb-2 block text-xs text-zinc-400">
      {t(label)}
      <textarea
        value={fields[key] ?? ''}
        onChange={(event) => setField(key, event.target.value)}
        placeholder={t(hint)}
        rows={rows}
        className={`${inputClass} mt-0.5`}
      />
    </label>
  )

  return (
    <section
      aria-label={t('gerador.titulo')}
      data-felixo-prompt-generator
      className="mb-3 rounded-sm border border-white/10 bg-[color-mix(in_srgb,var(--f-core-white)_6%,transparent)] p-2.5"
    >
      <div className="mb-1 flex items-center gap-2">
        <Wand2 size={14} className="text-zinc-400" />
        <h2 className="min-w-0 flex-1 text-sm font-medium text-zinc-100">{t('gerador.titulo')}</h2>
        <button
          type="button"
          onClick={onClose}
          className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          aria-label={t('gerador.fechar')}
        >
          <X size={14} />
        </button>
      </div>
      <p className="mb-2 text-[11px] text-zinc-500">{t('gerador.aviso')}</p>

      {area('objetivo', 'gerador.objetivo', 'gerador.objetivoDica', 2)}
      {area('contexto', 'gerador.contexto', 'gerador.contextoDica', 3)}
      {area('formatoSaida', 'gerador.formato', 'gerador.formatoDica', 2)}
      <details open={hasExtras} className="mb-2">
        <summary className="cursor-pointer text-xs text-zinc-400">{t('gerador.maisCampos')}</summary>
        <div className="mt-1">
          {area('restricoes', 'gerador.restricoes', 'gerador.restricoes', 2)}
          {area('criterioAceite', 'gerador.criterio', 'gerador.criterio', 2)}
        </div>
      </details>

      <label className="mb-2 block text-xs text-zinc-400">
        {t('gerador.previa')}
        <textarea
          value={text}
          onChange={(event) => setEditedText(event.target.value)}
          placeholder={t('gerador.previaVazia')}
          rows={8}
          className={`${inputClass} mt-0.5 font-mono`}
        />
      </label>
      {editedText !== null && (
        <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
          {t('gerador.previaEditada')}
          <button type="button" onClick={() => setEditedText(null)} className={buttonClass}>
            {t('gerador.refazer')}
          </button>
        </p>
      )}

      <div className="mb-2 flex flex-wrap items-end gap-2">
        <label className="min-w-40 flex-1 text-xs text-zinc-400">
          {t('gerador.nome')}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={nomeSugerido(fields)}
            className={`${inputClass} mt-0.5`}
          />
        </label>
        <FelixoSelect
          value={scope}
          options={scopeOptions}
          onChange={(value) => setScope(value as AutomationScope)}
          aria-label={t('gerador.topico')}
          className="min-w-44"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void copy()} disabled={!hasText} className={buttonClass}>
          <Copy size={13} />
          {t('gerador.copiar')}
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!hasText || busy !== null}
          className={buttonClass}
        >
          <SendHorizontal size={13} className={busy === 'send' ? 'animate-pulse' : undefined} />
          {busy === 'send' ? t('gerador.enviando') : t('gerador.enviar')}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!hasText || !fields.objetivo.trim() || busy !== null}
          className="felixo-btn rounded-sm felixo-primary-action px-2 py-1 text-xs font-medium text-white hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === 'save' ? t('gerador.salvando') : editing ? t('gerador.salvarAtualizar') : t('gerador.salvar')}
        </button>
      </div>

      {status && (
        <p
          role="status"
          className={`mt-1 flex items-center gap-1 text-[11px] ${status.tone === 'error' ? 'text-theme-error' : 'text-(--f-core-white-soft)'}`}
        >
          {status.tone === 'error' ? <CircleAlert size={11} /> : <Check size={11} />}
          {status.text}
        </p>
      )}
    </section>
  )
}

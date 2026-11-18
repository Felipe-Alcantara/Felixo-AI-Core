import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Check, CircleAlert, Download, Eye, FolderUp, ListFilter, Plus, SendHorizontal, Sparkles, Trash2, Upload } from 'lucide-react'
import { CanvasPanel } from './CanvasPanel'
import { createDebouncedSaveQueue } from '../../services/debounced-save-queue'
import { FelixoSelect, type FelixoSelectOption } from '../../../shared/components/FelixoSelect'
import { PromptDetailPanel } from './PromptDetailPanel'
import { PromptImportPreview } from './PromptImportPreview'
import { defaultAutomations } from '../../../shared/data/automations'
import {
  buildOverridesById,
  buildPresetIds,
  resolveVisiblePrompts,
  DISCARD_PROMPT_EDITS_MESSAGE,
  upsertPresetOverride,
} from '../../services/prompt-overrides'
import { AUTOMATION_SCOPE_LABELS, AUTOMATION_SCOPES } from '../../../shared/types/automations'
import type { AutomationDefinition, AutomationScope } from '../../../shared/types/automations'
import type { SkillActivationResult } from './SkillsPanel'
import {
  composeSelectedPromptInsertion,
} from '../../services/prompt-composition'
import {
  createCatalogPromptInsertion,
  type PromptInsertion,
} from '../../../shared/types/prompt-insertion'
import {
  describeCombinedInsertFeedback,
  describeSingleInsertFeedback,
} from '../../services/prompt-delivery-feedback'
import {
  createCustomAutomation,
  CUSTOM_AUTOMATION_TEXT_REQUIRED,
} from '../../services/custom-automation-creation'
import {
  buildImportedPrompt,
  defaultImportAction,
  planPromptImport,
  promptFileName,
  PROMPT_FILE_EXTENSION,
  serializePromptMarkdown,
  uniquePromptFileNames,
  type PromptImportAction,
  type PromptImportRow,
  type PromptOrigin,
} from '../../services/prompt-markdown'

type PromptsPanelProps = {
  onClose: () => void
  /** Sends the prompt to the expanded terminal, or copies it as a fallback. */
  onInsertPrompt: (prompt: PromptInsertion | string) => Promise<SkillActivationResult>
  /** Widens the toolbar column; the panel slides over to clear it. */
  toolsMenuOpen?: boolean
}

const SAVE_DEBOUNCE_MS = 500

/** Um .md de prompt tem poucos KB; acima disso não é prompt (e travaria a prévia). */
const IMPORT_FILE_MAX_BYTES = 1024 * 1024
const IMPORT_MAX_FILES = 200

const SCOPES = AUTOMATION_SCOPES

const SCOPE_OPTIONS: FelixoSelectOption[] = SCOPES.map((scope) => ({
  value: scope,
  label: AUTOMATION_SCOPE_LABELS[scope],
}))

function createAutomationId() {
  return `automation-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}

/**
 * Canvas-side prompt library — the chat's pre-built prompts (automations),
 * default + custom. Each prompt is inserted directly into the expanded
 * terminal's agent if one is open; otherwise it falls back to the clipboard
 * for manual pasting, same behavior as SkillsPanel's "Ativar".
 *
 * Custom automations can be created, edited (debounced autosave) and removed
 * here directly via IPC. Default (preset) automations are read-only in this
 * list, but clicking "Ver" swaps the list for PromptDetailPanel (same
 * CanvasPanel frame) where the prompt text can be viewed and edited —
 * editing a preset persists an override under the same id, so it replaces
 * the built-in text everywhere it's read from without losing the ability to
 * fall back to a fresh preset later (the built-in definition in
 * defaultAutomations never changes).
 */
export function PromptsPanel({
  onClose,
  onInsertPrompt,
  toolsMenuOpen,
}: PromptsPanelProps) {
  const [custom, setCustom] = useState<AutomationDefinition[]>([])
  const [draft, setDraft] = useState<AutomationDefinition | null>(null)
  const [isCreatingDraft, setIsCreatingDraft] = useState(false)
  const [feedbackId, setFeedbackId] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackIsError, setFeedbackIsError] = useState(false)
  const [feedbackResult, setFeedbackResult] = useState<SkillActivationResult>('sent')
  // Id ('combined' for the multi-select send) currently awaiting sendText's
  // real confirmation — never assumed "sent" before the PTY actually replied.
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [transfer, setTransfer] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [importRows, setImportRows] = useState<PromptImportRow[] | null>(null)
  const [importActions, setImportActions] = useState<PromptImportAction[]>([])
  const [isImporting, setIsImporting] = useState(false)
  // Há rascunho não salvo no detalhe? Esc e Fechar perguntam antes de sair.
  const detailDirtyRef = useRef(false)
  const setDetailDirty = useCallback((dirty: boolean) => {
    detailDirtyRef.current = dirty
  }, [])
  // O salvamento real (com o aviso de falha) é ligado à fila logo abaixo de
  // `persistAutomation`; assim a saída do painel também grava o pendente.
  const [saveQueue] = useState(() =>
    createDebouncedSaveQueue<AutomationDefinition>(() => undefined, SAVE_DEBOUNCE_MS),
  )

  useEffect(() => {
    let cancelled = false
    void window.felixo?.automations?.list().then((result) => {
      if (!cancelled && result?.ok && Array.isArray(result.automations)) {
        setCustom(result.automations)
      }
    })
    return () => {
      cancelled = true
      // Fechar o painel ou trocar de ferramenta não pode levar a edição junto.
      saveQueue.flush()
    }
  }, [saveQueue])

  // `isPreset` (via presetIds) tracks a prompt's built-in origin regardless
  // of whether it's been overridden, so the list still routes it through the
  // detail-panel edit flow instead of the free-form custom-automation inputs.
  const presetIds = buildPresetIds(defaultAutomations)
  const overridesById = buildOverridesById(custom)
  const prompts = resolveVisiblePrompts(defaultAutomations, custom)
  const filteredPrompts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return prompts
    return prompts.filter((prompt) =>
      [
        prompt.name,
        prompt.description,
        prompt.prompt,
        AUTOMATION_SCOPE_LABELS[prompt.scope],
      ]
        .join('\n')
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    )
  }, [prompts, query])
  const groupedPrompts = useMemo(
    () =>
      SCOPES.map((scope) => ({
        scope,
        prompts: filteredPrompts.filter((prompt) => prompt.scope === scope),
      })).filter((group) => group.prompts.length > 0),
    [filteredPrompts],
  )
  const selectedPrompts = prompts.filter((prompt) => selectedIds.has(prompt.id))
  const detailPrompt = detailId ? prompts.find((prompt) => prompt.id === detailId) ?? null : null
  const detailPresetFallback = detailId
    ? defaultAutomations.find((preset) => preset.id === detailId) ?? null
    : null

  const insertPrompt = async (prompt: AutomationDefinition) => {
    setPendingId(prompt.id)
    let result: SkillActivationResult
    try {
      // Só digita, sem Enter: a pessoa revisa e envia.
      result = await onInsertPrompt(createCatalogPromptInsertion(prompt, prompt.prompt, { autoSubmit: false }))
    } finally {
      setPendingId((id) => (id === prompt.id ? null : id))
    }
    const feedback = describeSingleInsertFeedback(result)
    setFeedbackId(prompt.id)
    setFeedbackIsError(feedback.isError)
    setFeedbackResult(result)
    setFeedbackText(feedback.text)
    // Um erro fica visível até a pessoa tentar de novo (ou trocar de prompt);
    // um sucesso soma-se ao "Feito" temporário, como já era.
    if (result !== 'failed') {
      window.setTimeout(() => setFeedbackId((id) => (id === prompt.id ? null : id)), 2500)
    }
  }

  const togglePrompt = (promptId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(promptId)) next.delete(promptId)
      else next.add(promptId)
      return next
    })
  }

  const insertSelected = async () => {
    const combined = composeSelectedPromptInsertion(selectedPrompts, { autoSubmit: false })
    if (!combined.content) return
    setPendingId('combined')
    let result: SkillActivationResult
    try {
      result = await onInsertPrompt(combined)
    } finally {
      setPendingId((id) => (id === 'combined' ? null : id))
    }
    // Conta o que entrou no texto: um prompt marcado mas vazio fica de fora.
    const feedback = describeCombinedInsertFeedback(result, combined.combinedNames.length)
    setFeedbackId('combined')
    setFeedbackIsError(feedback.isError)
    setFeedbackResult(result)
    setFeedbackText(feedback.text)
    if (result !== 'failed') {
      window.setTimeout(() => setFeedbackId((id) => (id === 'combined' ? null : id)), 2500)
    }
  }

  const originOf = (prompt: AutomationDefinition): PromptOrigin =>
    !presetIds.has(prompt.id)
      ? 'personalizado'
      : overridesById.has(prompt.id)
        ? 'catalogo-editado'
        : 'catalogo'

  // Exportar é sempre ação explícita: os marcados, ou o catálogo todo se nada estiver marcado.
  const exportPrompts = async () => {
    const list = selectedPrompts.length > 0 ? selectedPrompts : prompts
    const toFile = (prompt: AutomationDefinition) => serializePromptMarkdown(prompt, originOf(prompt))
    try {
      if (list.length === 1) {
        const result = await window.felixo?.files?.saveTextFile({
          defaultPath: promptFileName(list[0]),
          content: toFile(list[0]),
          filters: [{ name: 'Prompt em Markdown', extensions: [PROMPT_FILE_EXTENSION] }],
        })
        if (result?.ok) {
          setTransfer({ tone: 'ok', text: `Prompt "${list[0].name}" exportado.` })
        } else if (result && !result.canceled) {
          setTransfer({ tone: 'error', text: result.message ?? 'Não foi possível salvar o arquivo.' })
        }
        return
      }
      const names = uniquePromptFileNames(list)
      const result = await window.felixo?.files?.saveTextFolder({
        files: list.map((prompt, index) => ({ name: names[index], content: toFile(prompt) })),
      })
      if (result?.ok) {
        setTransfer({ tone: 'ok', text: `${list.length} prompts exportados para a pasta escolhida.` })
      } else if (result && !result.canceled) {
        setTransfer({ tone: 'error', text: result.message ?? 'Não foi possível salvar os arquivos.' })
      }
    } catch (error) {
      setTransfer({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível exportar.',
      })
    }
  }

  const readImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    // A pasta escolhida traz tudo o que há dentro; só os .md entram.
    const files = Array.from(event.target.files ?? []).filter((file) =>
      /\.(md|markdown)$/i.test(file.name),
    )
    event.target.value = ''
    if (files.length === 0) {
      setTransfer({ tone: 'error', text: 'Nenhum arquivo .md encontrado na escolha.' })
      return
    }
    if (files.length > IMPORT_MAX_FILES) {
      setTransfer({ tone: 'error', text: `São ${files.length} arquivos; importe até ${IMPORT_MAX_FILES} por vez.` })
      return
    }
    const usable = files.filter((file) => file.size <= IMPORT_FILE_MAX_BYTES)
    if (usable.length === 0) {
      setTransfer({ tone: 'error', text: 'Os arquivos são grandes demais para serem prompts (limite de 1 MB).' })
      return
    }
    try {
      const read = await Promise.all(
        usable.map(async (file) => ({ name: file.name, content: await file.text() })),
      )
      const rows = planPromptImport(read, prompts)
      const skipped = files.length - usable.length
      setTransfer(
        skipped > 0
          ? { tone: 'error', text: `${skipped} arquivo(s) acima de 1 MB ficaram de fora.` }
          : null,
      )
      setImportRows(rows)
      setImportActions(rows.map(defaultImportAction))
    } catch {
      setTransfer({ tone: 'error', text: 'Não foi possível ler os arquivos escolhidos.' })
    }
  }

  const confirmImport = async () => {
    if (!importRows || isImporting) return
    setIsImporting(true)
    const now = new Date().toISOString()
    const saved: AutomationDefinition[] = []
    let failed = 0
    try {
      for (const [index, row] of importRows.entries()) {
        const item = buildImportedPrompt(row, importActions[index], createAutomationId, now)
        if (!item) continue
        // Uma edição pendente do mesmo prompt gravaria por cima do que acabou de chegar.
        saveQueue.cancel(item.id)
        try {
          const result = await window.felixo?.automations?.save(item)
          if (result?.ok) saved.push(result.automation ?? item)
          else failed += 1
        } catch {
          failed += 1
        }
      }
    } finally {
      setIsImporting(false)
    }
    setCustom((current) => {
      const next = [...current]
      for (const item of saved) {
        const at = next.findIndex((automation) => automation.id === item.id)
        if (at >= 0) next[at] = item
        else next.push(item)
      }
      return next
    })
    setImportRows(null)
    setTransfer({
      tone: failed > 0 ? 'error' : 'ok',
      text:
        failed > 0
          ? `${saved.length} importados; ${failed} não puderam ser salvos.`
          : `${saved.length} ${saved.length === 1 ? 'prompt importado' : 'prompts importados'}.`,
    })
  }

  const persistAutomation = useCallback(async (automation: AutomationDefinition) => {
    try {
      const result = await window.felixo?.automations?.save({
        ...automation,
        updatedAt: new Date().toISOString(),
      })
      if (result?.ok) {
        return
      }
    } catch {
      // The same actionable message below covers IPC failures and rejections.
    }

    setFeedbackId(automation.id)
    setFeedbackIsError(true)
    setFeedbackText('Não foi possível salvar este prompt. Tente novamente.')
    window.setTimeout(
      () => setFeedbackId((id) => (id === automation.id ? null : id)),
      2500,
    )
  }, [])

  useEffect(() => {
    saveQueue.setSave((_id, automation) => void persistAutomation(automation))
  }, [persistAutomation, saveQueue])

  const schedulePersist = useCallback(
    (automationId: string, automation: AutomationDefinition) =>
      saveQueue.schedule(automationId, automation),
    [saveQueue],
  )

  const editCustomAutomation = useCallback(
    (automationId: string, patch: Partial<AutomationDefinition>) => {
      setCustom((current) => {
        const next = current.map((automation) =>
          automation.id === automationId ? { ...automation, ...patch } : automation,
        )
        const edited = next.find((automation) => automation.id === automationId)
        if (edited) {
          schedulePersist(automationId, edited)
        }
        return next
      })
    },
    [schedulePersist],
  )

  // Editing a preset (default automation) upserts it into `custom` under the
  // same id, so it overrides the built-in text without mutating
  // defaultAutomations. See prompt-overrides.ts for the merge/upsert rules.
  const editPreset = useCallback(
    (preset: AutomationDefinition, patch: Partial<AutomationDefinition>) => {
      setCustom((current) => {
        const next = upsertPresetOverride(current, preset, patch)
        const edited = next.find((automation) => automation.id === preset.id)
        if (edited) {
          schedulePersist(preset.id, edited)
        }
        return next
      })
    },
    [schedulePersist],
  )

  const startCustomAutomation = useCallback(() => {
    const now = new Date().toISOString()
    setFeedbackId(null)
    setIsCreatingDraft(false)
    setDraft({
      id: createAutomationId(),
      name: 'Novo prompt',
      description: '',
      prompt: '',
      scope: 'chat',
      createdAt: now,
      updatedAt: now,
    })
  }, [])

  const createDraftAutomation = useCallback(async () => {
    if (!draft || isCreatingDraft) return

    setIsCreatingDraft(true)
    try {
      const result = await createCustomAutomation(
        draft,
        async (automation) => window.felixo?.automations?.save(automation),
      )

      if (result.status === 'saved') {
        setCustom((current) => [...current, result.automation])
        setDraft(null)
        return
      }

      setFeedbackId('draft')
      setFeedbackIsError(true)
      setFeedbackText(result.message)
    } finally {
      setIsCreatingDraft(false)
    }
  }, [draft, isCreatingDraft])

  const updateDraft = useCallback((patch: Partial<AutomationDefinition>) => {
    setFeedbackId((id) => (id === 'draft' ? null : id))
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const removeCustomAutomation = useCallback(async (automationId: string) => {
    saveQueue.cancel(automationId)
    await window.felixo?.automations?.delete(automationId)
    setCustom((current) => current.filter((automation) => automation.id !== automationId))
  }, [saveQueue])

  if (detailPrompt) {
    return (
      <CanvasPanel
        title={detailPrompt.name}
        icon={<Sparkles size={15} />}
        onClose={onClose}
        confirmClose={() => !detailDirtyRef.current || window.confirm(DISCARD_PROMPT_EDITS_MESSAGE)}
        panelId="prompt-detail"
        size="xl"
        toolsMenuOpen={toolsMenuOpen}
      >
        <PromptDetailPanel
          key={`${detailPrompt.id}:${overridesById.has(detailPrompt.id) ? 'override' : 'preset'}`}
          prompt={detailPrompt}
          canResetToPreset={Boolean(detailPresetFallback) && overridesById.has(detailPrompt.id)}
          onBack={() => setDetailId(null)}
          onDirtyChange={setDetailDirty}
          onSave={(patch) => editPreset(detailPrompt, patch)}
          onReset={() => {
            if (detailPresetFallback) {
              void removeCustomAutomation(detailPrompt.id)
            }
          }}
          onInsert={() => void insertPrompt(detailPrompt)}
        />
      </CanvasPanel>
    )
  }

  return (
    <CanvasPanel
      title="Prompts"
      icon={<Sparkles size={15} />}
      onClose={onClose}
      panelId="prompts"
      size="xl"
      toolsMenuOpen={toolsMenuOpen}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex min-w-56 flex-1 items-center gap-2 rounded-sm bg-zinc-800/70 px-2 py-1.5 text-xs text-zinc-400">
          <ListFilter size={14} />
          <span className="sr-only">Filtrar prompts</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar por tema, nome ou texto…"
            className="min-w-0 flex-1 bg-transparent text-zinc-200 outline-hidden placeholder:text-zinc-600"
          />
        </label>
        <button
          type="button"
          onClick={startCustomAutomation}
          disabled={Boolean(draft)}
          className="felixo-btn flex items-center gap-1 rounded-sm felixo-primary-action px-2 py-1.5 text-xs font-medium text-white hover:bg-white/16"
        >
          <Plus size={13} />
          Novo prompt
        </button>
        <button
          type="button"
          onClick={() => void exportPrompts()}
          className="felixo-btn flex items-center gap-1 rounded-sm px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
          title="Salva como .md os prompts marcados; sem nenhum marcado, o catálogo inteiro"
        >
          <Download size={13} />
          {selectedPrompts.length > 0 ? `Exportar ${selectedPrompts.length}` : 'Exportar todos'}
        </button>
        <label
          className="felixo-btn flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
          title="Escolher arquivos .md exportados (ou escritos à mão) para trazer ao catálogo"
        >
          <Upload size={13} />
          Importar .md
          <input
            type="file"
            accept=".md,.markdown"
            multiple
            className="sr-only"
            aria-label="Importar prompts de arquivos .md"
            onChange={(event) => void readImportFiles(event)}
          />
        </label>
        <label
          className="felixo-btn flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
          title="Escolher uma pasta e ler todos os .md dela"
        >
          <FolderUp size={13} />
          Importar pasta
          <input
            type="file"
            // @ts-expect-error webkitdirectory é do Chromium e não está nos tipos do React.
            webkitdirectory=""
            className="sr-only"
            aria-label="Importar prompts de uma pasta"
            onChange={(event) => void readImportFiles(event)}
          />
        </label>
      </div>

      {transfer && (
        <p
          role="status"
          className={`mb-3 flex items-center gap-1 rounded-sm p-2 text-xs ${transfer.tone === 'error' ? 'text-theme-error' : 'text-(--f-core-white-soft)'}`}
        >
          {transfer.tone === 'error' ? <CircleAlert size={12} /> : <Check size={12} />}
          {transfer.text}
        </p>
      )}

      {importRows && (
        <PromptImportPreview
          rows={importRows}
          actions={importActions}
          busy={isImporting}
          onActionChange={(index, action) =>
            setImportActions((current) => current.map((item, i) => (i === index ? action : item)))
          }
          onConfirm={() => void confirmImport()}
          onCancel={() => setImportRows(null)}
        />
      )}

      {draft && (
        <section className="mb-3 rounded-sm border border-white/10 bg-[color-mix(in_srgb,var(--f-core-white)_6%,transparent)] p-2.5">
          <div className="mb-1 flex items-center gap-2">
            <input
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              placeholder="Nome do prompt"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-hidden"
            />
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              aria-label="Cancelar novo prompt"
            >
              ×
            </button>
          </div>
          <input
            value={draft.description}
            onChange={(event) => updateDraft({ description: event.target.value })}
            placeholder="Descrição curta…"
            className="mb-1 w-full bg-transparent text-xs text-zinc-500 outline-hidden placeholder:text-zinc-600"
          />
          <textarea
            value={draft.prompt}
            onChange={(event) => updateDraft({ prompt: event.target.value })}
            placeholder="Texto do prompt…"
            rows={2}
            className="mb-1 w-full resize-y rounded-sm bg-zinc-900/60 p-2 text-xs text-zinc-300 outline-hidden placeholder:text-zinc-600"
          />
          <div className="flex items-center justify-between gap-2">
            <FelixoSelect
              value={draft.scope}
              options={SCOPE_OPTIONS}
              onChange={(value) => updateDraft({ scope: value as AutomationScope })}
              aria-label="Escopo do prompt"
              className="min-w-44"
            />
            <button
              type="button"
              onClick={() => void createDraftAutomation()}
              disabled={isCreatingDraft}
              className="felixo-btn rounded-sm felixo-primary-action px-2 py-1 text-xs font-medium text-white hover:bg-white/16"
            >
              {isCreatingDraft ? 'Criando…' : 'Criar prompt'}
            </button>
          </div>
          {feedbackId === 'draft' ? (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-theme-error">
              <CircleAlert size={11} />
              {feedbackText}
            </p>
          ) : !draft.prompt.trim() ? (
            <p className="mt-1 text-[11px] text-zinc-400">
              {CUSTOM_AUTOMATION_TEXT_REQUIRED}
            </p>
          ) : null}
        </section>
      )}

      <div className="mb-3 rounded-sm border border-white/10 bg-[color-mix(in_srgb,var(--f-core-white)_6%,transparent)] p-2.5 text-xs leading-relaxed text-(--f-core-white)/80">
        Marque um ou vários prompts para montar uma única tarefa. Os textos são
        enviados na ordem do catálogo, com o nome de cada prompt preservado.
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-(--f-core-white)/60">
            {selectedPrompts.length === 0
              ? 'Nenhum prompt selecionado.'
              : `${selectedPrompts.length} selecionado${selectedPrompts.length === 1 ? '' : 's'}.`}
          </span>
          <button
            type="button"
            onClick={() => void insertSelected()}
            disabled={selectedPrompts.length === 0 || pendingId === 'combined'}
            className="felixo-btn flex items-center gap-1 rounded-sm felixo-primary-action px-2 py-1 text-xs font-medium text-white hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pendingId === 'combined' ? (
              <SendHorizontal size={13} className="animate-pulse" />
            ) : feedbackId === 'combined' && !feedbackIsError ? (
              <Check size={13} />
            ) : (
              <SendHorizontal size={13} />
            )}
            {pendingId === 'combined'
              ? 'Enviando…'
              : feedbackId === 'combined' && !feedbackIsError
                ? 'Feito'
                : feedbackId === 'combined' && feedbackIsError
                  ? 'Tentar de novo'
                  : 'Enviar conjunto'}
          </button>
        </div>
        {feedbackId === 'combined' && (
          <p
            role="status"
            data-felixo-delivery-feedback={feedbackResult}
            className={`mt-1 flex items-center gap-1 text-[11px] ${feedbackIsError ? 'text-theme-error' : 'text-(--f-core-white-soft)'}`}
          >
            {feedbackIsError ? <CircleAlert size={11} /> : <Check size={11} />}
            {feedbackText}
          </p>
        )}
      </div>

      <div className="felixo-anim-stagger-list flex flex-col gap-4">
        {groupedPrompts.map(({ scope, prompts: scopePrompts }) => (
          <section key={scope}>
            <h2 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <span>{AUTOMATION_SCOPE_LABELS[scope]}</span>
              <span className="font-normal text-zinc-600">{scopePrompts.length}</span>
            </h2>
            <ul className="flex flex-col gap-2">
              {scopePrompts.map((prompt) => {
          const isPreset = presetIds.has(prompt.id)
          const isOverridden = isPreset && overridesById.has(prompt.id)
          const isFreeCustom = !isPreset
          const inserted = feedbackId === prompt.id && !feedbackIsError
          const failed = feedbackId === prompt.id && feedbackIsError
          const isPending = pendingId === prompt.id

          return (
            <li key={prompt.id} data-felixo-prompt-id={prompt.id} className="rounded-sm bg-zinc-800/60 p-2">
              <div className="mb-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(prompt.id)}
                  onChange={() => togglePrompt(prompt.id)}
                  className="h-3.5 w-3.5 shrink-0 accent-sky-500"
                  aria-label={`Selecionar ${prompt.name}`}
                />
                {isFreeCustom ? (
                  <input
                    value={prompt.name}
                    onChange={(event) =>
                      editCustomAutomation(prompt.id, { name: event.target.value })
                    }
                    placeholder="Nome do prompt"
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-hidden"
                  />
                ) : (
                  <span className="min-w-0 flex-1 wrap-break-word text-sm font-medium text-zinc-100">
                    {prompt.name}
                    {isOverridden && (
                      <span className="ml-1.5 rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-normal text-zinc-500">
                        editado
                      </span>
                    )}
                  </span>
                )}
                {isPreset && (
                  <button
                    type="button"
                    onClick={() => setDetailId(prompt.id)}
                    className="felixo-btn flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-white/10"
                    title="Ver e editar o texto completo do prompt"
                  >
                    <Eye size={13} />
                    Ver
                  </button>
                )}
                <button
                  type="button"
                  data-felixo-prompt-insert
                  onClick={() => void insertPrompt(prompt)}
                  disabled={isPending}
                  className="felixo-btn flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  title={
                    failed
                      ? 'O terminal não confirmou o recebimento — clique para tentar de novo'
                      : 'Inserir no terminal aberto (ou copiar, se nenhum estiver aberto)'
                  }
                >
                  {isPending ? (
                    <>
                      <SendHorizontal size={13} className="animate-pulse" />
                      Enviando…
                    </>
                  ) : inserted ? (
                    <>
                      <Check size={13} className="text-(--f-core-white-soft)" />
                      Feito
                    </>
                  ) : failed ? (
                    <>
                      <CircleAlert size={13} className="text-theme-error" />
                      Tentar de novo
                    </>
                  ) : (
                    <>
                      <SendHorizontal size={13} />
                      Inserir
                    </>
                  )}
                </button>
                {isFreeCustom && (
                  <button
                    type="button"
                    onClick={() => void removeCustomAutomation(prompt.id)}
                    className="felixo-btn-icon rounded-sm p-1 text-zinc-400 hover:bg-white/10 hover:text-theme-error"
                    aria-label="Remover prompt"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {isFreeCustom ? (
                <>
                  <input
                    value={prompt.description}
                    onChange={(event) =>
                      editCustomAutomation(prompt.id, { description: event.target.value })
                    }
                    placeholder="Descrição curta…"
                    className="mb-1 w-full bg-transparent text-xs text-zinc-500 outline-hidden placeholder:text-zinc-600"
                  />
                  <textarea
                    value={prompt.prompt}
                    onChange={(event) =>
                      editCustomAutomation(prompt.id, { prompt: event.target.value })
                    }
                    placeholder="Texto do prompt…"
                    rows={2}
                    className="mb-1 w-full resize-y rounded-sm bg-zinc-900/60 p-2 text-xs text-zinc-300 outline-hidden placeholder:text-zinc-600"
                  />
                  <FelixoSelect
                    value={prompt.scope}
                    options={SCOPE_OPTIONS}
                    onChange={(value) =>
                      editCustomAutomation(prompt.id, {
                        scope: value as AutomationScope,
                      })
                    }
                    aria-label="Escopo do prompt"
                    className="min-w-44"
                  />
                </>
              ) : (
                prompt.description && (
                  <p className="text-xs text-zinc-500">{prompt.description}</p>
                )
              )}

              {feedbackId === prompt.id && (
                <p
                  role="status"
                  data-felixo-delivery-feedback={feedbackResult}
                  className={`mt-1 flex items-center gap-1 text-[11px] ${feedbackIsError ? 'text-theme-error' : 'text-(--f-core-white-soft)'}`}
                >
                  {feedbackIsError ? <CircleAlert size={11} /> : <Check size={11} />}
                  {feedbackText}
                </p>
              )}
            </li>
              )
            })}
            </ul>
          </section>
        ))}
      </div>
    </CanvasPanel>
  )
}

import { CircleAlert } from 'lucide-react'
import { FelixoSelect, type FelixoSelectOption } from '../../../shared/components/FelixoSelect'
import { AUTOMATION_SCOPE_LABELS } from '../../../shared/types/automations'
import type {
  PromptImportAction,
  PromptImportRow,
  PromptImportStatus,
} from '../../services/prompt-markdown'

const ACTION_LABELS: Record<PromptImportAction, string> = {
  create: 'Criar',
  overwrite: 'Sobrescrever',
  both: 'Manter os dois',
  skip: 'Pular',
}

const ACTIONS_BY_STATUS: Record<PromptImportStatus, PromptImportAction[]> = {
  new: ['create', 'skip'],
  changed: ['overwrite', 'both', 'skip'],
  unchanged: ['skip', 'both'],
  invalid: ['skip'],
}

const STATUS_LABELS: Record<PromptImportStatus, string> = {
  new: 'novo',
  changed: 'já existe, com mudanças',
  unchanged: 'já existe, igual',
  invalid: 'não pode ser importado',
}

type PromptImportPreviewProps = {
  rows: PromptImportRow[]
  actions: PromptImportAction[]
  busy: boolean
  onActionChange: (index: number, action: PromptImportAction) => void
  onConfirm: () => void
  onCancel: () => void
}

/** Prévia da importação de `.md`: nada é gravado até a pessoa confirmar. */
export function PromptImportPreview({
  rows,
  actions,
  busy,
  onActionChange,
  onConfirm,
  onCancel,
}: PromptImportPreviewProps) {
  const toWrite = actions.filter((action) => action !== 'skip').length

  return (
    <section
      aria-label="Prévia da importação de prompts"
      className="mb-3 rounded-sm border border-white/10 bg-[color-mix(in_srgb,var(--f-core-white)_6%,transparent)] p-2.5"
    >
      <p className="mb-2 text-xs text-zinc-300">
        {rows.length === 1 ? '1 arquivo lido.' : `${rows.length} arquivos lidos.`} Nada foi gravado
        ainda: confira e confirme.
      </p>
      <ul className="mb-2 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
        {rows.map((row, index) => (
          <li key={`${row.fileName}:${index}`} className="rounded-sm bg-zinc-800/60 p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 wrap-break-word font-medium text-zinc-100">
                {row.parsed?.name ?? row.fileName}
              </span>
              {row.status === 'invalid' ? (
                <span className="flex items-center gap-1 text-[11px] text-theme-error">
                  <CircleAlert size={11} /> {STATUS_LABELS.invalid}
                </span>
              ) : (
                <FelixoSelect
                  value={actions[index]}
                  options={ACTIONS_BY_STATUS[row.status].map(
                    (action): FelixoSelectOption => ({ value: action, label: ACTION_LABELS[action] }),
                  )}
                  onChange={(value) => onActionChange(index, value as PromptImportAction)}
                  aria-label={`O que fazer com ${row.fileName}`}
                  className="min-w-40"
                />
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {row.fileName}
              {row.parsed && ` · ${AUTOMATION_SCOPE_LABELS[row.parsed.scope]}`}
              {row.status !== 'invalid' && ` · ${STATUS_LABELS[row.status]}`}
              {row.status === 'changed' && row.existing && ` (atual: "${row.existing.name}")`}
            </p>
            {row.status === 'invalid' && row.message && (
              <p className="mt-0.5 text-[11px] text-theme-error">{row.message}</p>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="felixo-btn rounded-sm px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
        >
          Cancelar
        </button>
        <button
          type="button"
          data-felixo-prompt-import-confirm
          onClick={onConfirm}
          disabled={busy || toWrite === 0}
          className="felixo-btn rounded-sm felixo-primary-action px-2 py-1 text-xs font-medium text-white hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Importando…' : toWrite === 0 ? 'Nada a importar' : `Importar ${toWrite}`}
        </button>
      </div>
    </section>
  )
}

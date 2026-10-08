import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'

import type { SystemDesignGuideInput } from './types'

/**
 * URL + branch de um guia. Não valida sozinho: quem decide é o processo
 * principal (`validateSourceUrl`), e a recusa volta como mensagem — a mesma
 * regra para a lista da pessoa e para a de um projeto.
 */
export function GuideInputForm({
  disabled,
  submitLabel = 'Adicionar guia',
  onSubmit,
}: {
  disabled?: boolean
  submitLabel?: string
  onSubmit: (guide: SystemDesignGuideInput) => Promise<{ ok: boolean; message?: string }>
}) {
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!repoUrl.trim()) return
    setBusy(true)
    setMessage(null)
    const result = await onSubmit({ repoUrl: repoUrl.trim(), branch: branch.trim() || 'main' })
    setBusy(false)
    if (result.ok) {
      setRepoUrl('')
      setBranch('main')
    } else {
      setMessage(result.message ?? 'Não foi possível adicionar o guia.')
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-2 flex flex-wrap items-center gap-1.5">
      <input
        type="url"
        value={repoUrl}
        onChange={(event) => setRepoUrl(event.target.value)}
        placeholder="https://github.com/conta/repositorio-do-guia"
        aria-label="URL do repositório do guia"
        disabled={disabled || busy}
        className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-zinc-100 placeholder:text-zinc-500"
      />
      <input
        type="text"
        value={branch}
        onChange={(event) => setBranch(event.target.value)}
        aria-label="Branch do guia"
        disabled={disabled || busy}
        className="w-20 rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-[11px] text-zinc-100"
      />
      <button
        type="submit"
        disabled={disabled || busy || !repoUrl.trim()}
        className="felixo-btn inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-100 hover:bg-white/10 disabled:opacity-50"
      >
        <Plus size={11} aria-hidden="true" />
        {submitLabel}
      </button>
      {message ? <p className="w-full text-[11px] text-theme-error" role="alert">{message}</p> : null}
    </form>
  )
}

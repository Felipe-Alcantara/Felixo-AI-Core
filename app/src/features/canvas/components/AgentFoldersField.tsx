import { useState } from 'react'
import { folderRejection, AGENT_FOLDERS_MAX, type AgentFolder, type AgentFolderMode } from '../services/agent-folders'

type Props = {
  folders: AgentFolder[]
  onChange: (folders: AgentFolder[]) => void
  yolo: boolean
}

/** "Pastas que este agente pode usar": cada uma só para ler ou para ler e alterar. */
export function AgentFoldersField({ folders, onChange, yolo }: Props) {
  const [error, setError] = useState('')

  async function add() {
    setError('')
    const result = await window.felixo?.fetchAll?.pickRoots({ title: 'Escolher pastas que o agente pode usar' })
    if (!result?.ok) return setError(result?.message ?? 'Não foi possível abrir o seletor de pastas.')
    const next = [...folders]
    for (const path of result.paths ?? []) {
      const motivo = folderRejection(path)
      if (motivo) setError(motivo)
      else if (next.length < AGENT_FOLDERS_MAX && !next.some((f) => f.path === path)) next.push({ path, mode: 'leitura' })
    }
    onChange(next)
  }

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-[12px] text-zinc-300">
        <span>Pastas que este agente pode usar</span>
        <button type="button" className="felixo-btn" onClick={() => void add()}>
          Adicionar pasta
        </button>
      </div>
      {folders.map((folder) => (
        <div key={folder.path} className="mb-1 flex items-center gap-2 text-[11px] text-zinc-400">
          <span className="min-w-0 flex-1 truncate" title={folder.path}>
            {folder.path}
          </span>
          <select
            value={folder.mode}
            aria-label={`Acesso à pasta ${folder.path}`}
            onChange={(event) =>
              onChange(folders.map((f) => (f === folder ? { ...f, mode: event.target.value as AgentFolderMode } : f)))
            }
          >
            <option value="leitura">Só ler</option>
            <option value="escrita">Ler e alterar</option>
          </select>
          <button type="button" aria-label={`Remover ${folder.path}`} onClick={() => onChange(folders.filter((f) => f !== folder))}>
            ×
          </button>
        </div>
      ))}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {folders.length > 0 && yolo && (
        <p className="text-[11px] text-amber-400">Neste modo (Yolo) a lista de pastas não protege nada.</p>
      )}
      {folders.some((f) => f.mode === 'leitura') && !yolo && (
        <p className="text-[11px] text-zinc-500">
          &quot;Só ler&quot; bloqueia a edição de arquivos, mas não impede um script que o agente rode.
        </p>
      )}
    </div>
  )
}

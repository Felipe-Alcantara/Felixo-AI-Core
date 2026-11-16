import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Plus, Trash2, UserRound } from 'lucide-react'
import { useWebviewProfiles } from '../hooks/useWebviewProfiles'
import { useWebviewSitePermissions } from '../hooks/useWebviewSitePermissions'
import { displayOrigin, groupSitePermissions } from '../services/webview-site-permissions'
import {
  DEFAULT_WEBVIEW_PROFILE,
  describeWebviewProfile,
  isCustomProfileId,
} from '../services/webview-profile'
import { FRAME_COLOR_SWATCHES } from './frame-colors'

type Props = {
  profileId: string | undefined
  /** `undefined` = voltar ao Padrão. */
  onChange: (profileId: string | undefined) => void
}

/**
 * Perfil do bloco Página Web, no cabeçalho: ver qual é, trocar, criar um novo
 * e excluir. Trocar de perfil recria o webview na mesma página, com os logins
 * do outro perfil. O menu sai num portal porque o card do bloco corta o que
 * passa das bordas (overflow-hidden).
 */
export function WebviewProfileMenu({ profileId, onChange }: Props) {
  const { profiles, ready, create, remove } = useWebviewProfiles()
  const { decisions, revoke } = useWebviewSitePermissions()
  const currentProfileId = isCustomProfileId(profileId) ? profileId : 'default'
  const sitesOfProfile = groupSitePermissions(decisions.filter((item) => item.profileId === currentProfileId))
  const current = describeWebviewProfile(profileId, profiles, ready)
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    // Mantém o menu (208px) inteiro dentro da janela.
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 216)), top: rect.bottom + 4 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const dot = current.color ? FRAME_COLOR_SWATCHES[current.color] : undefined

  async function handleCreate() {
    const result = await create(newName)
    if (!result.ok) return setError(result.message)
    setNewName('')
    setError(null)
    onChange(result.value.id)
    setOpen(false)
  }

  async function handleRemove(id: string, name: string) {
    if (
      !window.confirm(
        `Excluir o perfil "${name}"? Os logins e cookies dele serão apagados. Blocos que ainda usam esse perfil ficam sem sessão até você escolher outro.`,
      )
    ) {
      return
    }
    const result = await remove(id)
    if (!result.ok) setError(result.message)
  }

  const items = [
    { id: undefined as string | undefined, name: DEFAULT_WEBVIEW_PROFILE.name, color: undefined },
    ...profiles.map((profile) => ({ id: profile.id as string | undefined, name: profile.name, color: profile.color })),
  ]

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Perfil do navegador: ${current.name}`}
        className="felixo-btn nodrag flex max-w-28 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-(--f-core-white-soft) hover:bg-white/10"
      >
        {dot ? (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden />
        ) : (
          <UserRound size={11} aria-hidden />
        )}
        <span className="truncate">{current.name}</span>
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Perfil do navegador"
            className="fixed z-70 w-52 rounded-lg border border-white/10 bg-(--f-surface-panel) p-1.5 text-xs text-(--f-core-white-soft) shadow-2xl"
            style={{ left: position.left, top: position.top }}
          >
            {items.map((item) => {
              const active = (item.id ?? undefined) === (isCustomProfileId(profileId) ? profileId : undefined)
              return (
                <div key={item.id ?? 'default'} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onChange(item.id)
                      setOpen(false)
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-2 py-1 text-left hover:bg-white/10"
                  >
                    {item.color ? (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: FRAME_COLOR_SWATCHES[item.color] }} aria-hidden />
                    ) : (
                      <UserRound size={11} aria-hidden />
                    )}
                    <span className="truncate">{item.name}</span>
                    {active && <Check size={11} className="ml-auto shrink-0" aria-hidden />}
                  </button>
                  {item.id && (
                    <button
                      type="button"
                      onClick={() => void handleRemove(item.id as string, item.name)}
                      aria-label={`Excluir o perfil ${item.name}`}
                      title="Excluir perfil (apaga os logins dele)"
                      className="rounded-sm p-1 text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 size={11} aria-hidden />
                    </button>
                  )}
                </div>
              )
            })}

            {sitesOfProfile.length > 0 && (
              <div className="mt-1.5 border-t border-white/10 pt-1.5">
                <p className="px-1 text-[10px] text-zinc-500">Permissões dos sites neste perfil</p>
                <ul aria-label="Permissões dos sites neste perfil" className="mt-0.5 max-h-40 overflow-y-auto">
                  {sitesOfProfile.map((site) => (
                    <li key={site.origin} className="px-1 py-0.5">
                      <div className="flex items-center gap-1">
                        <span className="min-w-0 flex-1 truncate text-[11px]">{displayOrigin(site.origin)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            void revoke({ profileId: currentProfileId, origin: site.origin }).then((message) => setError(message))
                          }
                          aria-label={`Revogar as permissões de ${displayOrigin(site.origin)}`}
                          title="Revogar (o site pergunta de novo)"
                          className="rounded-sm px-1 py-0.5 text-[10px] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                        >
                          Revogar
                        </button>
                      </div>
                      <p className="text-[10px] leading-snug text-zinc-500">
                        {site.items.map((item) => `${item.decision === 'granted' ? 'pode' : 'não pode'} ${item.label}`).join('; ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-1.5 flex items-center gap-1 border-t border-white/10 pt-1.5">
              <input
                value={newName}
                onChange={(event) => {
                  setNewName(event.target.value)
                  setError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleCreate()
                  }
                }}
                placeholder="Novo perfil…"
                aria-label="Nome do novo perfil"
                className="felixo-field min-w-0 flex-1 px-1.5 py-1 text-xs outline-hidden"
              />
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!newName.trim()}
                aria-label="Criar perfil"
                className="rounded-sm p-1 hover:bg-white/10 disabled:opacity-40"
              >
                <Plus size={12} aria-hidden />
              </button>
            </div>
            {error && <p role="alert" className="mt-1 px-1 text-[11px] text-red-300">{error}</p>}
          </div>,
          document.body,
        )}
    </>
  )
}

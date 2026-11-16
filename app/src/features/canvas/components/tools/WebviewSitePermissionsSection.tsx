import { useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { useWebviewProfiles } from '../../hooks/useWebviewProfiles'
import { useWebviewSitePermissions } from '../../hooks/useWebviewSitePermissions'
import { DEFAULT_WEBVIEW_PROFILE } from '../../services/webview-profile'
import { displayOrigin, groupSitePermissions } from '../../services/webview-site-permissions'

/**
 * Permissões que a pessoa respondeu aos sites dos blocos Página Web, de todos
 * os perfis do navegador. Revogar uma faz o site perguntar de novo da próxima
 * vez. O menu do perfil, no bloco, mostra as do perfil daquele bloco.
 */
export function WebviewSitePermissionsSection() {
  const { decisions, revoke } = useWebviewSitePermissions()
  const { profiles } = useWebviewProfiles()
  const [error, setError] = useState<string | null>(null)
  const sites = groupSitePermissions(decisions)
  const profileName = (id: string) =>
    id === 'default' ? DEFAULT_WEBVIEW_PROFILE.name : (profiles.find((profile) => profile.id === id)?.name ?? id)

  async function handleRevoke(params: { profileId: string; origin: string; permission: string }) {
    setError(await revoke(params))
  }

  return (
    <section className="rounded-2xl border border-white/8 bg-black/10 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
        <ShieldCheck size={14} aria-hidden="true" />
        Permissões dos sites (Página Web)
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">
        Um site num bloco Página Web só usa microfone, câmera, localização, notificações, área de
        transferência ou tela cheia depois que você permite na faixa do bloco. A resposta vale para
        aquele site naquele perfil do navegador. Revogue para o site perguntar de novo.
      </p>
      {sites.length === 0 ? (
        <p className="mt-2 text-[11px] text-zinc-500">Nenhuma permissão respondida ainda.</p>
      ) : (
        <ul className="mt-2 space-y-2" aria-label="Permissões respondidas aos sites">
          {sites.map((site) => (
            <li key={`${site.profileId} ${site.origin}`} className="rounded-lg border border-white/8 px-2 py-1.5">
              <p className="text-[11px] text-zinc-300">
                {displayOrigin(site.origin)}{' '}
                <span className="text-zinc-500">· perfil {profileName(site.profileId)}</span>
              </p>
              <ul className="mt-1 space-y-0.5">
                {site.items.map((item) => (
                  <li key={item.permission} className="flex items-center gap-2 text-[11px] text-zinc-400">
                    <span className={item.decision === 'granted' ? 'text-emerald-300/90' : 'text-red-300/90'}>
                      {item.decision === 'granted' ? 'Permitido' : 'Negado'}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => void handleRevoke({ profileId: site.profileId, origin: site.origin, permission: item.permission })}
                      aria-label={`Revogar: ${displayOrigin(site.origin)} ${item.label}`}
                      title="Revogar (o site pergunta de novo)"
                      className="rounded-sm p-0.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-red-300">
          {error}
        </p>
      )}
    </section>
  )
}

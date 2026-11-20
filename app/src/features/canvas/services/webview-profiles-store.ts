import {
  newWebviewProfileId,
  normalizeWebviewProfile,
  validateWebviewProfileName,
  type WebviewProfile,
} from './webview-profile'
import { reportActionFailure } from './canvas-persistence-status'
import type { FrameColor } from '../types'

type Bridge = NonNullable<NonNullable<Window['felixo']>['webviewProfiles']>

export type ProfileActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { value: T }))
  | { ok: false; message: string }

/**
 * Lista de perfis do navegador interno, compartilhada por TODOS os blocos
 * Página Web e pelo seletor de criação: um carregamento só, e criar/excluir
 * num lugar aparece nos outros. É uma store externa (não estado de
 * componente) justamente porque vários blocos precisam da mesma lista ao mesmo
 * tempo — sem ela cada bloco faria a própria consulta ao abrir.
 *
 * Sem a ponte do Electron (preview web) os perfis vivem só em memória.
 */
export function createWebviewProfilesStore(getBridge: () => Bridge | undefined) {
  let profiles: readonly WebviewProfile[] = []
  let loaded = false
  // `ready` só vira true quando a lista chegou de verdade (não só foi pedida):
  // é o que separa "perfil ainda carregando" de "perfil que não existe mais".
  let ready = false
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach((listener) => listener())
  const set = (next: readonly WebviewProfile[]) => {
    profiles = next
    emit()
  }

  async function refresh(): Promise<void> {
    let result: Awaited<ReturnType<NonNullable<ReturnType<typeof getBridge>>['list']>> | undefined
    try {
      result = await getBridge()?.list()
    } catch {
      result = undefined
    }
    loaded = true
    if (!result?.ok) {
      // A lista falhou (ok:false ou rejeição): `ready` fica falso, mas a próxima assinatura tenta de novo em vez de
      // deixar "Perfil…" no botão para sempre, e a pessoa fica sabendo.
      loaded = false
      reportActionFailure('perfis-do-navegador', 'Não foi possível carregar os perfis do navegador. Vai tentar de novo ao reabrir o menu.')
    }
    if (result?.ok) {
      ready = true
      set((result.profiles ?? []).map(normalizeWebviewProfile).filter((p): p is WebviewProfile => p !== null))
    }
  }

  return {
    getSnapshot: () => profiles,
    isReady: () => ready || !getBridge(),
    subscribe(listener: () => void) {
      listeners.add(listener)
      // A primeira assinatura dispara o carregamento; as seguintes só reaproveitam.
      if (!loaded) {
        loaded = true
        void refresh()
      }
      return () => {
        listeners.delete(listener)
      }
    },
    refresh,

    async create(name: string, color?: FrameColor): Promise<ProfileActionResult<WebviewProfile>> {
      const problem = validateWebviewProfileName(name, profiles)
      if (problem) return { ok: false, message: problem }
      const profile: WebviewProfile = {
        id: newWebviewProfileId(name),
        name: name.trim(),
        ...(color ? { color } : {}),
      }
      const bridge = getBridge()
      if (bridge) {
        const result = await bridge.save(profile)
        if (!result?.ok) return { ok: false, message: result?.message ?? 'Não foi possível criar o perfil.' }
      }
      set([...profiles, profile])
      return { ok: true, value: profile }
    },

    async remove(profileId: string): Promise<ProfileActionResult> {
      const bridge = getBridge()
      if (bridge) {
        // O processo principal limpa a sessão (cookies/logins) do perfil e só
        // então o tira da lista; se falhar, o perfil continua aqui também.
        const result = await bridge.delete(profileId)
        if (!result?.ok) return { ok: false, message: result?.message ?? 'Não foi possível excluir o perfil.' }
      }
      set(profiles.filter((profile) => profile.id !== profileId))
      return { ok: true }
    },
  }
}

export const webviewProfilesStore = createWebviewProfilesStore(() => window.felixo?.webviewProfiles)

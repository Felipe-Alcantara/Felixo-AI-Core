/**
 * Permissões dos sites nos blocos Página Web, do lado do renderer: os pedidos
 * pendentes (a faixa do bloco) e as decisões lembradas (as listas de revogar no
 * menu do perfil e nas Configurações). Quem decide e grava é o processo
 * principal; aqui só se mostra, responde e revoga.
 */

export type SitePermissionRequest = {
  id: string
  /** webContents do bloco (o popup pergunta no bloco que o abriu). */
  webContentsId: number
  fromPopup: boolean
  profileId: string
  origin: string
  permissions: ReadonlyArray<{ key: string; label: string }>
  requestedAt: string
}

export type SitePermissionDecision = {
  profileId: string
  origin: string
  permission: string
  label: string
  decision: 'granted' | 'denied'
  decidedAt: string
}

export type SitePermissionsBySite = {
  profileId: string
  origin: string
  items: ReadonlyArray<Pick<SitePermissionDecision, 'permission' | 'label' | 'decision'>>
}

type Bridge = NonNullable<NonNullable<Window['felixo']>['webviewPermissions']>

/** O site como a pessoa o reconhece: sem "https://"; o "http://" fica, porque avisa. */
export function displayOrigin(origin: string): string {
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' ? url.host : `${url.protocol}//${url.host}`
  } catch {
    return origin
  }
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} e ${labels.at(-1)}`
}

/** Texto da faixa: "meet.exemplo.com quer usar o microfone e usar a câmera." */
export function describeSitePermissionRequest(request: SitePermissionRequest): string {
  const who = request.fromPopup
    ? `Uma janela aberta por esta página (${displayOrigin(request.origin)})`
    : displayOrigin(request.origin)
  return `${who} quer ${joinLabels(request.permissions.map((item) => item.label))}.`
}

/** Decisões agrupadas por perfil e site, na ordem em que chegaram. */
export function groupSitePermissions(decisions: readonly SitePermissionDecision[]): SitePermissionsBySite[] {
  const groups = new Map<string, { profileId: string; origin: string; items: SitePermissionsBySite['items'][number][] }>()
  for (const item of decisions) {
    const key = `${item.profileId} ${item.origin}`
    const group = groups.get(key) ?? { profileId: item.profileId, origin: item.origin, items: [] }
    group.items.push({ permission: item.permission, label: item.label, decision: item.decision })
    groups.set(key, group)
  }
  return [...groups.values()]
}

function isRequest(value: unknown): value is SitePermissionRequest {
  const item = value as SitePermissionRequest | null
  return Boolean(item && typeof item.id === 'string' && Number.isInteger(item.webContentsId) && Array.isArray(item.permissions))
}

function isDecision(value: unknown): value is SitePermissionDecision {
  const item = value as SitePermissionDecision | null
  return Boolean(item && typeof item.origin === 'string' && (item.decision === 'granted' || item.decision === 'denied'))
}

/**
 * Store compartilhada pelos blocos, pelo menu do perfil e pelas Configurações:
 * uma assinatura dos avisos do main para todos. Sem a ponte (preview web),
 * fica vazia.
 */
export function createWebviewSitePermissionsStore(getBridge: () => Bridge | undefined) {
  let pending: readonly SitePermissionRequest[] = []
  let decisions: readonly SitePermissionDecision[] = []
  let started = false
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())

  async function refreshDecisions() {
    const result = await getBridge()?.list({})
    if (result?.ok) {
      decisions = (result.decisions ?? []).filter(isDecision)
      emit()
    }
  }

  function start() {
    const bridge = getBridge()
    if (started || !bridge) return
    started = true
    bridge.onPending((next) => {
      pending = Array.isArray(next) ? next.filter(isRequest) : []
      emit()
    })
    bridge.onChanged(() => void refreshDecisions())
    // Um pedido feito antes de o bloco montar (ou antes de um reload) já está no main.
    void bridge.pending().then((result) => {
      if (result?.ok) {
        pending = (result.pending ?? []).filter(isRequest)
        emit()
      }
    })
    void refreshDecisions()
  }

  return {
    getPending: () => pending,
    getDecisions: () => decisions,
    subscribe(listener: () => void) {
      listeners.add(listener)
      start()
      return () => {
        listeners.delete(listener)
      }
    },
    async respond(id: string, allow: boolean): Promise<string | null> {
      const result = await getBridge()?.respond({ id, allow })
      return result?.ok ? null : (result?.message ?? 'Não foi possível responder o pedido.')
    },
    async revoke(params: { profileId: string; origin: string; permission?: string }): Promise<string | null> {
      const result = await getBridge()?.revoke(params)
      return result?.ok ? null : (result?.message ?? 'Não foi possível revogar a permissão.')
    },
  }
}

export const webviewSitePermissionsStore = createWebviewSitePermissionsStore(() => window.felixo?.webviewPermissions)

import { announceSystemDesignLoginNeeded } from './system-design-events'
import type { SystemDesignLoginNeeded, SystemDesignSyncRequest, SystemDesignSyncResult } from './types'

export type SystemDesignSyncBridge = {
  sync?: (request?: SystemDesignSyncRequest) => Promise<SystemDesignSyncResult>
}

type AutomaticSyncDependencies = {
  bridge?: SystemDesignSyncBridge
  onLoginNeeded?: (notice: SystemDesignLoginNeeded) => void
}

// Guias que já avisaram nesta sessão: a sincronização automática roda de novo
// (outra tela, outro projeto), e o mesmo aviso não deve voltar a cada vez.
const noticedGuideKeys = new Set<string>()

/**
 * Sincronização AUTOMÁTICA (a da sessão e a de cada projeto): nunca deixa o Git
 * pedir login. Um guia que falha por login vira aviso na tela, uma vez por
 * sessão; as outras falhas ficam no estado do guia em Configurações.
 */
export async function runAutomaticSync(
  request?: Omit<SystemDesignSyncRequest, 'interactive'>,
  {
    bridge = typeof window === 'undefined' ? undefined : window.felixo?.systemDesign,
    onLoginNeeded = announceSystemDesignLoginNeeded,
  }: AutomaticSyncDependencies = {},
): Promise<SystemDesignSyncResult | null> {
  if (!bridge?.sync) return null
  const result = await bridge.sync({ ...request, interactive: false })
  for (const guide of result.results ?? []) {
    if (guide.ok || guide.reason !== 'login' || noticedGuideKeys.has(guide.key)) continue
    noticedGuideKeys.add(guide.key)
    onLoginNeeded({
      key: guide.key,
      label: guide.label ?? guide.key,
      ...(request?.projectRoot ? { projectRoot: request.projectRoot } : {}),
    })
  }
  return result
}

/** Só para testes: esquece os avisos já dados nesta sessão. */
export function forgetLoginNotices(): void {
  noticedGuideKeys.clear()
}

// Atualizar o Openia a partir do "Gerar imagem": um Openia anterior à 0.2.0 não
// tem `openia image` (o processo principal devolve `openia_outdated`). No canvas
// não há outro lugar para instalar CLIs, então o próprio popover oferece a
// atualização, pelo MESMO caminho da instalação das CLIs oficiais
// (`cli:install-official`: pip --user no commit fixado no catálogo, com a
// repetição automática quando o Python do sistema bloqueia pelo PEP 668).
import type { ImageGenerationState } from './openia-image-store'

export const OPENIA_UPDATE_MESSAGES = Object.freeze({
  offer: 'Este Openia é antigo e não gera imagem.',
  confirm:
    'O Felixo instala a versão nova do Openia a partir do GitHub dele, com pip, só para o seu usuário. A instalação executa código no seu computador.',
  running: 'Atualizando o Openia…',
  done: 'Openia atualizado. Clique em Gerar de novo.',
  failed: 'Não foi possível atualizar o Openia.',
  unavailable: 'A atualização automática só existe no app desktop.',
})

export type OpeniaUpdateState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'running' }
  | { status: 'done'; message: string }
  | { status: 'failed'; message: string }

type OfficialCliBridge = {
  installOfficial?: (params: { id: string; confirmed?: boolean }) => Promise<{ ok: boolean; message?: string }>
}

/** O popover só oferece atualizar quando a geração falhou por Openia antigo. */
export function needsOpeniaUpdate(generation: ImageGenerationState): boolean {
  return generation.status === 'error' && generation.code === 'openia_outdated'
}

/** Atualiza o Openia; o clique em "Confirmar atualização" já é a confirmação. */
export async function updateOpenia(
  bridge: OfficialCliBridge | undefined = typeof window === 'undefined' ? undefined : window.felixo?.cli,
): Promise<OpeniaUpdateState> {
  if (!bridge?.installOfficial) return { status: 'failed', message: OPENIA_UPDATE_MESSAGES.unavailable }
  try {
    const result = await bridge.installOfficial({ id: 'openia', confirmed: true })
    return result.ok
      ? { status: 'done', message: OPENIA_UPDATE_MESSAGES.done }
      : { status: 'failed', message: result.message || OPENIA_UPDATE_MESSAGES.failed }
  } catch {
    return { status: 'failed', message: OPENIA_UPDATE_MESSAGES.failed }
  }
}

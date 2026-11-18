import { Pin } from 'lucide-react'
import { useState } from 'react'
import { NoticeToast } from '../../shared/hardware/HardwareNotices'

const KEY = 'felixo-ai-core.drawer-pin-hint'

function jaEntendeu(): boolean {
  try { return localStorage.getItem(KEY) === 'understood' } catch { return false }
}

/** Dica no momento certo: Prompts/Skills abriram e a gaveta não fixada fechou. */
export function DrawerPinHint({ onDismiss }: { onDismiss: () => void }) {
  const [hidden] = useState(jaEntendeu)
  if (hidden) return null

  const naoMostrarMais = () => {
    try { localStorage.setItem(KEY, 'understood') } catch { /* Vale só nesta sessão. */ }
    onDismiss()
  }
  return <NoticeToast
    placement="left"
    icon={<Pin size={18} aria-hidden="true" />}
    title="A gaveta do terminal fechou"
    description="Clicar fora fecha a gaveta, e Inserir só digita no terminal com ela aberta. Reabra o terminal e use Fixar (o alfinete no topo) para mantê-la aberta enquanto usa Prompts e Skills."
    secondaryLabel="Não mostrar mais"
    onSecondary={naoMostrarMais}
    dismissLabel="Dispensar a dica do botão Fixar"
  />
}

import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { NoticeToast } from '../hardware/HardwareNotices'
import {
  announceSystemDesignConfig,
  announceSystemDesignProjects,
  subscribeSystemDesignLoginNeeded,
} from './system-design-events'
import { describeLoginNotice } from './system-design-presentation'
import type { SystemDesignLoginNeeded } from './types'

/**
 * Aviso de que a sincronização automática não atualizou um guia porque ele
 * pede login. A sincronização automática nunca deixa o Git pedir; o botão do
 * aviso é o clique que pode abrir a janela de login do sistema.
 */
export function SystemDesignLoginNotice() {
  const [pending, setPending] = useState<SystemDesignLoginNeeded[]>([])

  useEffect(
    () =>
      subscribeSystemDesignLoginNeeded((notice) =>
        setPending((current) =>
          current.some((item) => item.key === notice.key && item.projectRoot === notice.projectRoot)
            ? current
            : [...current, notice],
        ),
      ),
    [],
  )

  const notice = pending[0]
  if (!notice) return null

  const view = describeLoginNotice(notice)
  const dismiss = () => setPending((current) => current.slice(1))
  const loginAndSync = async () => {
    dismiss()
    const bridge = window.felixo?.systemDesign
    if (!bridge?.sync) return
    const result = await bridge.sync({
      ...(notice.projectRoot ? { projectRoot: notice.projectRoot } : {}),
      interactive: true,
    })
    // Com ou sem sucesso, as telas releem: o estado do guia em Configurações
    // mostra o resultado (e o motivo, se o login não foi concluído).
    if (result.config) announceSystemDesignConfig(result.config)
    if (notice.projectRoot) announceSystemDesignProjects(notice.projectRoot)
  }

  return (
    <NoticeToast
      placement="left"
      icon={<KeyRound size={18} className="text-(--color-warning)" />}
      title={view.title}
      description={view.description}
      primaryLabel={view.primaryLabel}
      onPrimary={() => void loginAndSync()}
      secondaryLabel={view.secondaryLabel}
      onSecondary={dismiss}
      dismissLabel={view.dismissLabel}
    />
  )
}

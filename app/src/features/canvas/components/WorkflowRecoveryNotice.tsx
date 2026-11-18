import { RotateCcw } from 'lucide-react'
import type { Edge, Node } from '@xyflow/react'
import { useState, type RefObject } from 'react'

import { NoticeToast } from '../../shared/hardware/HardwareNotices'
import { useWorkflowRecovery } from '../hooks/useWorkflowRecovery'
import { MAX_PARALLEL_RESUMES } from '../services/workflow-recovery'

const MAX_NAMES = 4

function describeNames(labels: string[]): string {
  const shown = labels.slice(0, MAX_NAMES).join(', ')
  return labels.length > MAX_NAMES ? `${shown} e mais ${labels.length - MAX_NAMES}` : shown
}

/**
 * Aviso de que o app fechou com agentes no meio do trabalho, com o botão que
 * manda cada um continuar. Só aparece quando há agente interrompido com a
 * conversa associada, e nunca envia nada sozinho.
 */
export function WorkflowRecoveryNotice(props: {
  ready: boolean
  holdable: ReadonlySet<string>
  nodesRef: RefObject<Node[]>
  edgesRef: RefObject<Edge[]>
  updateNodeData: (nodeId: string, patch: Record<string, unknown>) => void
}) {
  const { interrupted, run, resume, dismiss } = useWorkflowRecovery(props)
  const [hidden, setHidden] = useState(false)
  if (interrupted.length === 0 || (hidden && run)) return null

  const names = describeNames(interrupted.map((agent) => agent.label))
  const count = interrupted.length
  const noun = count === 1 ? 'agente' : 'agentes'

  if (run) {
    const sent = run.order.filter(
      (id) => run.entries[id].phase !== 'waiting' && run.entries[id].phase !== 'skipped',
    ).length
    return (
      <NoticeToast
        placement="left"
        icon={<RotateCcw size={18} aria-hidden="true" />}
        title="Retomando o workflow"
        description={`${sent} de ${count} ${noun} já receberam o pedido para continuar (${names}).`}
        secondaryLabel="Ocultar"
        onSecondary={() => setHidden(true)}
        dismissLabel="Ocultar o andamento da retomada"
      />
    )
  }

  return (
    <NoticeToast
      placement="left"
      icon={<RotateCcw size={18} aria-hidden="true" />}
      title="Workflow interrompido"
      description={`${count} ${noun} ${count === 1 ? 'estava' : 'estavam'} no meio do trabalho quando o app fechou: ${names}. Retomar manda cada um continuar de onde parou, ${MAX_PARALLEL_RESUMES} por vez, sem refazer o que já terminou.`}
      primaryLabel="Retomar workflow"
      onPrimary={() => {
        setHidden(false)
        resume()
      }}
      secondaryLabel="Agora não"
      onSecondary={dismiss}
      dismissLabel="Dispensar a retomada do workflow"
    />
  )
}

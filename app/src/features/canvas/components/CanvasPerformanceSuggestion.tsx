import { Gauge } from 'lucide-react'
import { useState } from 'react'
import { NoticeToast } from '../../shared/hardware/HardwareNotices'
import { usePerformanceMode } from '../../shared/performance/performance-mode-context'
import { classifyPerformanceScenario } from '../../shared/performance/performance-budget'
import { useSessionSnapshots } from '../terminal/terminal-session-context'

const KEY = 'felixo-ai-core.performance-load-suggestion'

function contarTerminaisAtivos(snapshots: Record<string, { activity: string }>): number {
  return Object.values(snapshots).filter(({ activity }) => activity !== 'exited' && activity !== 'error').length
}

function respostaSalva(): boolean {
  try { return localStorage.getItem(KEY) === 'answered' } catch { return false }
}

/** Sugestão explícita: uma resposta não volta a interromper a pessoa. */
export function CanvasPerformanceSuggestion({ nodeCount, hydrated }: { nodeCount: number; hydrated: boolean }) {
  const snapshots = useSessionSnapshots()
  const { performanceMode, setPerformanceMode } = usePerformanceMode()
  const [answered, setAnswered] = useState(respostaSalva)
  const terminalCount = contarTerminaisAtivos(snapshots)
  if (!hydrated || answered || performanceMode || classifyPerformanceScenario(terminalCount, nodeCount) !== 'carregado') return null

  const responder = (ligar: boolean) => {
    try { localStorage.setItem(KEY, 'answered') } catch { /* A resposta vale nesta sessão. */ }
    setAnswered(true)
    if (ligar) setPerformanceMode(true)
  }
  return <NoticeToast
    placement="left"
    icon={<Gauge size={18} aria-hidden="true" />}
    title="Ligar o Modo Performance?"
    description={`O canvas está carregado (${terminalCount} terminais ativos e ${nodeCount} blocos). O modo reduz efeitos visuais e pode ser desligado em Configurações.`}
    primaryLabel="Ligar Modo Performance"
    onPrimary={() => responder(true)}
    secondaryLabel="Agora não"
    onSecondary={() => responder(false)}
    dismissLabel="Dispensar sugestão de performance por carga"
  />
}

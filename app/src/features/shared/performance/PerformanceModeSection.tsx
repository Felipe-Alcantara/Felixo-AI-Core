import { Gauge } from 'lucide-react'
import { usePerformanceMode } from './performance-mode-context'
import { FelixoToggle } from '../components/FelixoToggle'

/**
 * Corta, de uma vez, a decoração e as transições que mais pesam em notebook
 * ou PC mais fraco: o céu animado do canvas, o minimapa e as animações de
 * painel/dock/toolbar/controles. Fica logo abaixo do tema de propósito — é
 * o primeiro ajuste que quem sente o app pesado deve encontrar, sem precisar
 * procurar em outro lugar.
 *
 * Aplica na hora, pelo `data-performance-mode` no elemento raiz (ver
 * PerformanceModeProvider): não precisa reabrir o app nem reiniciar terminal.
 */
export function PerformanceModeSection() {
  const { performanceMode, setPerformanceMode } = usePerformanceMode()

  return (
    <section className="rounded-2xl border border-white/8 bg-black/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
            <Gauge size={14} aria-hidden="true" />
            Modo Performance
          </div>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Desliga o céu animado do canvas, o minimapa e as transições de
            painéis, menus, docas e controles. A interface fica mais simples
            visualmente, mas nada muda de lugar nem some de verdade — pensado
            pra rodar liso em máquinas mais fracas.
          </p>
        </div>
        <FelixoToggle
          checked={performanceMode}
          onChange={setPerformanceMode}
          label="Modo Performance"
        />
      </div>
      {performanceMode && (
        <p className="mt-2 text-[11px] leading-relaxed text-emerald-300/80">
          Ativado — já aplicado, sem precisar reabrir o app.
        </p>
      )}
    </section>
  )
}

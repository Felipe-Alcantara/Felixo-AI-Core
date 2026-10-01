import { memo, useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

import { DeferredMarkdownContent } from '../../shared/components/DeferredMarkdownContent'
import { useTerminalReading } from '../hooks/useTerminalReading'
import type { ReadingRole } from '../terminal/reading/reading-blocks'
import type { ReadingProfile } from '../terminal/reading/reading-profiles'
import {
  readingPlainText,
  type ReadingTurnView,
  type TerminalReading,
} from '../terminal/reading/terminal-reading'
import { CopyButton } from './TerminalCopyButton'

const ROLE_LABEL: Record<ReadingRole, string> = {
  pessoa: 'Você',
  agente: 'Agente',
  aviso: 'Aviso da CLI',
  saida: 'Saída',
}

/** Distância do fim, em px, que ainda conta como "estava no fim". */
const STICK_TO_BOTTOM_PX = 24

type TerminalReadingPanelProps = {
  sessionId: string
  profile: ReadingProfile
  /** A aba está à mostra: só então a tela é relida. */
  visible: boolean
  panelId: string
  labelledBy: string
  panelRef?: RefObject<HTMLDivElement | null>
}

/**
 * A seleção feita dentro da Leitura ou, sem ela, o texto puro de todas as
 * falas — o mesmo texto do terminal, sem a marca de cada fala.
 */
async function copyReading(panel: HTMLElement | null, reading: TerminalReading | null): Promise<string> {
  const selection = window.getSelection()
  const selected = panel && selection && panel.contains(selection.anchorNode) ? selection.toString() : ''
  const text = selected || readingPlainText(reading)
  if (text) await navigator.clipboard?.writeText(text)
  return text
}

/**
 * A aba Leitura da gaveta: a conversa do terminal como texto formatado. Só
 * mostra — digitar continua sendo no Terminal, que segue vivo por baixo.
 */
export function TerminalReadingPanel({
  sessionId,
  profile,
  visible,
  panelId,
  labelledBy,
  panelRef,
}: TerminalReadingPanelProps) {
  const reading = useTerminalReading(sessionId, profile, { enabled: visible })
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)

  const setScrollElement = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element
      if (panelRef) panelRef.current = element
    },
    [panelRef],
  )

  // Acompanha o fim só se a pessoa já estava no fim: quem rolou para cima
  // para ler não perde o lugar a cada pedaço do stream.
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (element && stickToBottomRef.current) element.scrollTop = element.scrollHeight
  }, [reading])

  return (
    <div
      ref={setScrollElement}
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      hidden={!visible}
      data-felixo-terminal-reading
      onScroll={(event) => {
        const element = event.currentTarget
        stickToBottomRef.current =
          element.scrollHeight - element.scrollTop - element.clientHeight <= STICK_TO_BOTTOM_PX
      }}
      className="absolute inset-0 overflow-y-auto bg-(--f-core-black-surface) px-3 py-2 outline-hidden"
    >
      <div className="mb-2 flex items-start gap-2 text-[11px] text-zinc-500">
        <p className="mr-auto leading-relaxed">
          {profile.id === 'texto'
            ? 'Este programa não tem leitura formatada: o texto aparece como veio. Para digitar, volte ao Terminal.'
            : 'Leitura da tela do terminal. Para digitar, volte ao Terminal.'}
          {reading && reading.droppedLines > 0 && (
            <> As {reading.droppedLines.toLocaleString('pt-BR')} linhas mais antigas ficam só no Terminal.</>
          )}
        </p>
        <CopyButton
          onCopy={() => copyReading(scrollRef.current, reading)}
          title="Copiar a seleção da Leitura (ou o texto inteiro, como no terminal)"
          label="Copiar texto da Leitura"
        />
      </div>
      {reading && reading.turns.length > 0 ? (
        reading.turns.map((turn, index) => <ReadingTurn key={index} turn={turn} />)
      ) : (
        <p className="text-xs text-zinc-500" role="status">
          Nada para ler ainda. A conversa aparece aqui quando o terminal mostrar alguma resposta.
        </p>
      )}
    </div>
  )
}

/**
 * Uma fala. Memorizada pelo conteúdo: no stream, só a fala que mudou (quase
 * sempre a última) passa pelo parser Markdown de novo.
 */
const ReadingTurn = memo(
  function ReadingTurn({ turn }: { turn: ReadingTurnView }) {
    return (
      <article
        aria-label={ROLE_LABEL[turn.role]}
        data-reading-role={turn.role}
        className={`mb-3 rounded-lg border px-3 py-2 ${
          turn.role === 'pessoa'
            ? 'border-white/10 bg-white/4'
            : turn.role === 'aviso'
              ? 'border-[color-mix(in_srgb,var(--color-warning)_38%,transparent)]'
              : 'border-transparent'
        }`}
      >
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500" aria-hidden>
          {ROLE_LABEL[turn.role]}
          {turn.raw && turn.role !== 'saida' && (
            <span className="ml-2 normal-case tracking-normal">· mostrado como texto: a formatação não conferiu</span>
          )}
        </p>
        <DeferredMarkdownContent content={turn.markdown} />
      </article>
    )
  },
  (previous, next) =>
    previous.turn.markdown === next.turn.markdown && previous.turn.role === next.turn.role && previous.turn.raw === next.turn.raw,
)

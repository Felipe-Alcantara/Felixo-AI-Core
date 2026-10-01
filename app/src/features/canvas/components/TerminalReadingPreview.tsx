import type { ReactNode } from 'react'

import { useTerminalReading } from '../hooks/useTerminalReading'
import type { ReadingBlock } from '../terminal/reading/reading-blocks'
import type { ReadingSegment } from '../terminal/reading/reading-lines'
import type { ReadingProfile } from '../terminal/reading/reading-profiles'

/** Quantos blocos do fim da última fala o cartão mostra. */
const PREVIEW_BLOCKS = 4
/** Linhas de código no cartão: o resto fica para a gaveta. */
const PREVIEW_CODE_LINES = 4
/** O cartão relê a tela com menos pressa que a gaveta: é só uma prévia. */
const PREVIEW_THROTTLE_MS = 1000
const PREVIEW_MAX_LINES = 300

type TerminalReadingPreviewProps = {
  sessionId: string
  profile: ReadingProfile
}

function Inline({ segments }: { segments: ReadingSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => {
        let node: ReactNode = segment.text
        if (segment.fg !== null && !segment.bold && !segment.underline && !segment.dim) {
          node = <code className="font-mono text-[10px] text-zinc-200">{node}</code>
        }
        if (segment.italic) node = <em>{node}</em>
        if (segment.bold) node = <strong className="font-semibold text-zinc-100">{node}</strong>
        return <span key={index}>{node}</span>
      })}
    </>
  )
}

const SPACE: ReadingSegment = {
  text: ' ',
  bold: false,
  italic: false,
  dim: false,
  underline: false,
  inverse: false,
  fg: null,
  bg: null,
}

/** As linhas de prosa numa só, como a Leitura da gaveta junta. */
function joinLines(lines: ReadingSegment[][]): ReadingSegment[] {
  return lines.flatMap((line, index) => (index === 0 ? line : [SPACE, ...line]))
}

function PreviewBlock({ block }: { block: ReadingBlock }) {
  switch (block.kind) {
    case 'titulo':
      return (
        <div className="font-semibold text-zinc-100">
          <Inline segments={block.segments} />
        </div>
      )
    case 'paragrafo':
      return (
        <div className="line-clamp-3">
          <Inline segments={joinLines(block.lines)} />
        </div>
      )
    case 'nota':
      return (
        <div className="line-clamp-2 italic text-zinc-500">
          <Inline segments={joinLines(block.lines)} />
        </div>
      )
    case 'citacao':
      return (
        <div className="line-clamp-2 border-l-2 border-white/20 pl-1.5 text-zinc-400">
          <Inline segments={joinLines(block.lines)} />
        </div>
      )
    case 'lista':
      return (
        <div>
          {block.items.slice(-4).map((item, index) => (
            <div key={index} className="truncate" style={{ paddingLeft: `${item.depth * 0.75}rem` }}>
              <span className="mr-1 text-zinc-500">{item.ordered ? `${item.number}.` : '•'}</span>
              <Inline segments={joinLines(item.lines)} />
            </div>
          ))}
        </div>
      )
    case 'codigo':
      return (
        <div className="overflow-hidden rounded-sm bg-black/30 px-1 font-mono text-[10px] text-zinc-300">
          {block.lines.slice(0, PREVIEW_CODE_LINES).map((line, index) => (
            <div key={index} className="truncate whitespace-pre">
              {line || ' '}
            </div>
          ))}
        </div>
      )
    case 'tabela':
      return (
        <div className="truncate text-zinc-400">
          <span className="font-semibold text-zinc-300">{block.header.join(' · ')}</span>
          {` — ${block.rows.length} ${block.rows.length === 1 ? 'linha' : 'linhas'}`}
        </div>
      )
    case 'regua':
      return <div className="border-t border-white/10" />
  }
}

/**
 * Prévia formatada do cartão, com a Leitura ligada: o fim da última fala,
 * desenhado como texto com estilo. Fica dentro do botão que abre a gaveta,
 * então não tem link nem botão — só texto (o React escapa tudo).
 */
export function TerminalReadingPreview({ sessionId, profile }: TerminalReadingPreviewProps) {
  const reading = useTerminalReading(sessionId, profile, {
    enabled: true,
    throttleMs: PREVIEW_THROTTLE_MS,
    maxLines: PREVIEW_MAX_LINES,
  })
  const turn = reading?.turns.at(-1)

  if (!turn) {
    return <span className="text-zinc-600">Nada para ler ainda…</span>
  }

  return (
    <div data-felixo-reading-preview className="flex h-full flex-col justify-end gap-1 overflow-hidden font-sans text-[11px] leading-snug text-zinc-300">
      {turn.blocks ? (
        turn.blocks.slice(-PREVIEW_BLOCKS).map((block, index) => <PreviewBlock key={index} block={block} />)
      ) : (
        <div className="whitespace-pre-wrap font-mono text-[10px] text-zinc-400">
          {turn.text.split('\n').slice(-6).join('\n')}
        </div>
      )}
    </div>
  )
}

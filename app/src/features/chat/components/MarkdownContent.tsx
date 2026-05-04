import type { ReactNode } from 'react'

type MarkdownContentProps = {
  content: string
}

type MarkdownBlock =
  | { type: 'code'; content: string; language: string }
  | { type: 'heading'; content: string; level: 1 | 2 | 3 }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'paragraph'; content: string }

export function MarkdownContent({ content }: MarkdownContentProps) {
  const blocks = parseMarkdownBlocks(content)

  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-zinc-100">
      {blocks.map((block, index) => (
        <MarkdownBlockView block={block} key={`${block.type}-${index}`} />
      ))}
    </div>
  )
}

function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  if (block.type === 'code') {
    return (
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/25">
        <div className="flex h-7 items-center justify-between border-b border-white/[0.06] px-3 font-mono text-[10px] uppercase text-zinc-500">
          <span>{block.language || 'código'}</span>
        </div>
        <pre className="max-h-80 overflow-auto p-3 font-mono text-[12px] leading-relaxed text-zinc-200">
          <code>{block.content}</code>
        </pre>
      </div>
    )
  }

  if (block.type === 'heading') {
    const className =
      block.level === 1
        ? 'text-base font-semibold text-zinc-50'
        : block.level === 2
          ? 'text-sm font-semibold text-zinc-100'
          : 'text-[13px] font-semibold text-zinc-100'

    return <div className={className}>{renderInlineMarkdown(block.content)}</div>
  }

  if (block.type === 'list') {
    const ListTag = block.ordered ? 'ol' : 'ul'

    return (
      <ListTag
        className={[
          'space-y-1 pl-4 text-zinc-100',
          block.ordered ? 'list-decimal' : 'list-disc',
        ].join(' ')}
      >
        {block.items.map((item, index) => (
          <li key={`${item}-${index}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </ListTag>
    )
  }

  return (
    <p className="whitespace-pre-wrap text-zinc-100">
      {renderInlineMarkdown(block.content)}
    </p>
  )
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmedLine = line.trim()

    if (!trimmedLine) {
      index += 1
      continue
    }

    const fenceMatch = trimmedLine.match(/^```([a-zA-Z0-9_-]*)\s*$/)

    if (fenceMatch) {
      const language = fenceMatch[1] ?? ''
      const codeLines: string[] = []
      index += 1

      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }

      if (index < lines.length) {
        index += 1
      }

      blocks.push({
        type: 'code',
        content: codeLines.join('\n'),
        language,
      })
      continue
    }

    const headingMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/)

    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        content: headingMatch[2].trim(),
      })
      index += 1
      continue
    }

    if (isUnorderedListLine(trimmedLine)) {
      const items: string[] = []

      while (index < lines.length && isUnorderedListLine(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''))
        index += 1
      }

      blocks.push({ type: 'list', items, ordered: false })
      continue
    }

    if (isOrderedListLine(trimmedLine)) {
      const items: string[] = []

      while (index < lines.length && isOrderedListLine(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''))
        index += 1
      }

      blocks.push({ type: 'list', items, ordered: true })
      continue
    }

    const paragraphLines: string[] = []

    while (index < lines.length && !isBlockBoundary(lines[index])) {
      paragraphLines.push(lines[index])
      index += 1
    }

    blocks.push({
      type: 'paragraph',
      content: paragraphLines.join('\n').trim(),
    })
  }

  return blocks
}

function isBlockBoundary(line: string) {
  const trimmedLine = line.trim()

  return (
    !trimmedLine ||
    trimmedLine.startsWith('```') ||
    /^(#{1,3})\s+/.test(trimmedLine) ||
    isUnorderedListLine(trimmedLine) ||
    isOrderedListLine(trimmedLine)
  )
}

function isUnorderedListLine(line: string) {
  return /^[-*]\s+/.test(line)
}

function isOrderedListLine(line: string) {
  return /^\d+\.\s+/.test(line)
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const segments = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean)

  return segments.map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return (
        <code
          key={`${segment}-${index}`}
          className="rounded-md border border-white/[0.08] bg-black/20 px-1.5 py-0.5 font-mono text-[12px] text-cyan-100"
        >
          {segment.slice(1, -1)}
        </code>
      )
    }

    if (segment.startsWith('**') && segment.endsWith('**')) {
      return <strong key={`${segment}-${index}`}>{segment.slice(2, -2)}</strong>
    }

    return <span key={`${segment}-${index}`}>{segment}</span>
  })
}

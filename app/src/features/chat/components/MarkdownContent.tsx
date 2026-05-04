import {
  Children,
  isValidElement,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import hljs from 'highlight.js/lib/core'
import bashLanguage from 'highlight.js/lib/languages/bash'
import cssLanguage from 'highlight.js/lib/languages/css'
import javascriptLanguage from 'highlight.js/lib/languages/javascript'
import jsonLanguage from 'highlight.js/lib/languages/json'
import markdownLanguage from 'highlight.js/lib/languages/markdown'
import pythonLanguage from 'highlight.js/lib/languages/python'
import typescriptLanguage from 'highlight.js/lib/languages/typescript'
import xmlLanguage from 'highlight.js/lib/languages/xml'
import rehypeRaw from 'rehype-raw'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

type MarkdownContentProps = {
  content: string
}

const highlightLanguageAliases: Record<string, string> = {
  html: 'xml',
  js: 'javascript',
  jsx: 'javascript',
  md: 'markdown',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  ts: 'typescript',
  tsx: 'typescript',
}

hljs.registerLanguage('bash', bashLanguage)
hljs.registerLanguage('css', cssLanguage)
hljs.registerLanguage('javascript', javascriptLanguage)
hljs.registerLanguage('json', jsonLanguage)
hljs.registerLanguage('markdown', markdownLanguage)
hljs.registerLanguage('python', pythonLanguage)
hljs.registerLanguage('typescript', typescriptLanguage)
hljs.registerLanguage('xml', xmlLanguage)

const markdownComponents: Components = {
  h1({ children }) {
    return <h1 className="text-base font-semibold text-zinc-50">{children}</h1>
  },
  h2({ children }) {
    return <h2 className="text-sm font-semibold text-zinc-100">{children}</h2>
  },
  h3({ children }) {
    return <h3 className="text-[13px] font-semibold text-zinc-100">{children}</h3>
  },
  h4({ children }) {
    return <h4 className="text-[13px] font-semibold text-zinc-100">{children}</h4>
  },
  h5({ children }) {
    return <h5 className="text-[12px] font-semibold text-zinc-200">{children}</h5>
  },
  h6({ children }) {
    return (
      <h6 className="text-[11px] font-semibold uppercase text-zinc-300">
        {children}
      </h6>
    )
  },
  p({ children }) {
    return <p className="whitespace-pre-wrap text-zinc-100">{children}</p>
  },
  strong({ children }) {
    return <strong className="font-semibold text-zinc-50">{children}</strong>
  },
  em({ children }) {
    return <em className="italic text-zinc-100">{children}</em>
  },
  del({ children }) {
    return <del className="text-zinc-400 line-through">{children}</del>
  },
  a({ children, href }) {
    return (
      <a
        className="font-medium text-cyan-200 underline decoration-cyan-200/35 underline-offset-4 hover:text-cyan-100"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        {children}
      </a>
    )
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-orange-200/35 pl-3 text-zinc-300">
        {children}
      </blockquote>
    )
  },
  ul({ children, className }) {
    const isTaskList = className?.includes('contains-task-list')

    return (
      <ul
        className={joinClassNames(
          isTaskList
            ? 'space-y-1 pl-0 text-zinc-100'
            : 'list-disc space-y-1 pl-4 text-zinc-100 marker:text-zinc-500',
          className,
        )}
      >
        {children}
      </ul>
    )
  },
  ol({ children, className }) {
    return (
      <ol
        className={joinClassNames(
          'list-decimal space-y-1 pl-4 text-zinc-100 marker:text-zinc-500',
          className,
        )}
      >
        {children}
      </ol>
    )
  },
  li({ children, className }) {
    const isTaskItem = className?.includes('task-list-item')

    return (
      <li
        className={joinClassNames(
          isTaskItem ? 'flex list-none items-start gap-2 pl-0' : 'pl-1',
          className,
        )}
      >
        {children}
      </li>
    )
  },
  hr() {
    return <hr className="my-3 border-white/[0.08]" />
  },
  table({ children }) {
    return (
      <div className="max-w-full overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full min-w-max border-collapse text-left text-[12px]">
          {children}
        </table>
      </div>
    )
  },
  thead({ children }) {
    return <thead className="bg-white/[0.05] text-zinc-200">{children}</thead>
  },
  tbody({ children }) {
    return <tbody className="divide-y divide-white/[0.06]">{children}</tbody>
  },
  tr({ children }) {
    return <tr>{children}</tr>
  },
  th({ children }) {
    return (
      <th className="border-r border-white/[0.06] px-3 py-2 font-semibold last:border-r-0">
        {children}
      </th>
    )
  },
  td({ children }) {
    return (
      <td className="border-r border-white/[0.06] px-3 py-2 text-zinc-300 last:border-r-0">
        {children}
      </td>
    )
  },
  img: MarkdownImage,
  input(props) {
    return <input {...props} className="mr-2 align-middle accent-orange-200" />
  },
  code({ children, className }) {
    return <code className={className}>{children}</code>
  },
  pre({ children }) {
    const language = getCodeBlockLanguage(children)
    const codeText = getCodeBlockText(children)
    const recoveredMarkdown = recoverMarkdownSwallowedByCodeBlock(
      codeText,
      language,
    )

    if (recoveredMarkdown) {
      return (
        <>
          <CodeBlock code={recoveredMarkdown.code} language={language} />
          <MarkdownContent content={recoveredMarkdown.markdown} />
        </>
      )
    }

    return <CodeBlock code={codeText} language={language} />
  },
}

function MarkdownImage({ alt, src, title }: ComponentProps<'img'>) {
  const [hasError, setHasError] = useState(!src)

  if (hasError) {
    return (
      <span
        className="inline-flex max-w-full items-center rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[12px] text-zinc-300"
        title={typeof src === 'string' ? src : title}
      >
        {alt || 'Imagem indisponível'}
      </span>
    )
  }

  return (
    <img
      alt={alt ?? ''}
      className="max-h-64 max-w-full rounded-lg border border-white/[0.08] object-contain"
      loading="lazy"
      onError={() => setHasError(true)}
      src={src}
      title={title}
    />
  )
}

function CodeBlock({
  code,
  language,
}: {
  code: string
  language: string
}) {
  const highlightedCode = highlightCode(code, language)

  return (
    <div className="max-w-full overflow-hidden rounded-xl border border-white/[0.08] bg-black/25">
      <div className="flex h-7 items-center justify-between border-b border-white/[0.06] px-3 font-mono text-[10px] uppercase text-zinc-500">
        <span>{language || 'código'}</span>
      </div>
      <pre className="max-h-80 overflow-auto p-3 font-mono text-[12px] leading-relaxed text-zinc-200">
        {highlightedCode ? (
          <code
            className={joinClassNames('hljs', language ? `language-${language}` : undefined)}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  )
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const normalizedContent = normalizeMarkdownContent(content)

  return (
    <div className="markdown-content space-y-2 overflow-hidden text-[13px] leading-relaxed text-zinc-100">
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeRaw]}
        remarkPlugins={[remarkGfm]}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}

function normalizeMarkdownContent(content: string) {
  return unwrapMarkdownDocumentFences(content.replace(/\r\n?/g, '\n'))
}

function unwrapMarkdownDocumentFences(content: string) {
  const lines = content.split('\n')
  const normalizedLines: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!isMarkdownFenceOpener(line)) {
      normalizedLines.push(line)
      index += 1
      continue
    }

    const closingFenceIndex = findMarkdownDocumentFenceCloser(
      lines,
      index,
      getFenceMarker(line),
    )

    if (closingFenceIndex === -1) {
      normalizedLines.push(...lines.slice(index + 1))
      break
    }

    normalizedLines.push(...lines.slice(index + 1, closingFenceIndex))
    index = closingFenceIndex + 1
  }

  return normalizedLines.join('\n')
}

function findMarkdownDocumentFenceCloser(
  lines: string[],
  openingFenceIndex: number,
  openingMarker: string,
) {
  let nestedFenceMarker = ''

  for (let index = openingFenceIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]

    if (nestedFenceMarker) {
      if (isFenceCloser(line, nestedFenceMarker)) {
        nestedFenceMarker = ''
      }

      continue
    }

    if (isNonMarkdownFenceOpener(line)) {
      nestedFenceMarker = getFenceMarker(line)
      continue
    }

    if (isFenceCloser(line, openingMarker)) {
      return index
    }
  }

  return -1
}

function isMarkdownFenceOpener(line: string) {
  return /^(`{3,}|~{3,})\s*(markdown|md)\s*$/i.test(line.trim())
}

function isNonMarkdownFenceOpener(line: string) {
  return /^(`{3,}|~{3,})\s+(?!markdown\s*$|md\s*$)\S+/i.test(line.trim())
}

function isFenceCloser(line: string, openingMarker: string) {
  const trimmedLine = line.trim()

  if (!openingMarker) {
    return false
  }

  const fenceCharacter = openingMarker[0]
  const fenceLength = openingMarker.length
  const closingFencePattern = new RegExp(
    `^\\${fenceCharacter}{${fenceLength},}\\s*$`,
  )

  return closingFencePattern.test(trimmedLine)
}

function getFenceMarker(line: string) {
  return line.trim().match(/^(`{3,}|~{3,})/)?.[1] ?? ''
}

function getCodeBlockLanguage(children: ReactNode) {
  let language = ''

  Children.forEach(children, (child) => {
    if (language || !isValidElement(child)) {
      return
    }

    const className = getElementClassName(child.props)
    const languageMatch = /language-([a-zA-Z0-9_-]+)/.exec(className)

    if (languageMatch) {
      language = languageMatch[1]
    }
  })

  return language
}

function getCodeBlockText(children: ReactNode) {
  let text = ''

  Children.forEach(children, (child) => {
    text += getPlainText(child)
  })

  return text
}

function getPlainText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map((child) => getPlainText(child)).join('')
  }

  if (isValidElement(node)) {
    return getPlainText((node.props as { children?: ReactNode }).children)
  }

  return ''
}

function recoverMarkdownSwallowedByCodeBlock(codeText: string, language: string) {
  if (!language || isMarkdownLanguage(language)) {
    return null
  }

  const lines = codeText.replace(/\r\n?/g, '\n').split('\n')
  const boundaryIndex = findSwallowedMarkdownBoundary(lines)

  if (boundaryIndex === -1) {
    return null
  }

  const code = lines.slice(0, boundaryIndex).join('\n').trimEnd()
  const markdown = lines.slice(boundaryIndex).join('\n').trimStart()

  if (!code || !markdown) {
    return null
  }

  return { code, markdown }
}

function highlightCode(code: string, language: string) {
  const normalizedLanguage = normalizeHighlightLanguage(language)

  if (!normalizedLanguage) {
    return ''
  }

  try {
    return hljs.highlight(code, {
      ignoreIllegals: true,
      language: normalizedLanguage,
    }).value
  } catch {
    return ''
  }
}

function normalizeHighlightLanguage(language: string) {
  const normalizedLanguage = language.trim().toLowerCase()
  const mappedLanguage =
    highlightLanguageAliases[normalizedLanguage] ?? normalizedLanguage

  return hljs.getLanguage(mappedLanguage) ? mappedLanguage : ''
}

function findSwallowedMarkdownBoundary(lines: string[]) {
  for (let index = 1; index < lines.length; index += 1) {
    const trimmedLine = lines[index].trim()

    if (!trimmedLine || !hasCodeBefore(lines, index)) {
      continue
    }

    if (isMarkdownBlockStart(trimmedLine)) {
      return index
    }

    if (isMarkdownSectionLabel(trimmedLine) && hasMarkdownBlockSoon(lines, index)) {
      return index
    }
  }

  return -1
}

function hasCodeBefore(lines: string[], boundaryIndex: number) {
  return lines
    .slice(0, boundaryIndex)
    .some((line) => line.trim() && !isMarkdownSectionLabel(line.trim()))
}

function hasMarkdownBlockSoon(lines: string[], index: number) {
  const nextLines = lines.slice(index + 1, index + 7)

  return nextLines.some((line) => {
    const trimmedLine = line.trim()

    return trimmedLine && isMarkdownBlockStart(trimmedLine)
  })
}

function isMarkdownBlockStart(line: string) {
  return (
    /^#{1,6}\s+\S/.test(line) ||
    /^[-*_]{3,}$/.test(line) ||
    /^>\s+\S/.test(line) ||
    /^[-*+]\s+\S/.test(line) ||
    /^\d+[.)]\s+\S/.test(line) ||
    /^\|.+\|$/.test(line) ||
    /^!\[[^\]]*]\([^)]+/.test(line) ||
    /^\[[^\]]+]\([^)]+/.test(line) ||
    isMarkdownFenceOpener(line)
  )
}

function isMarkdownSectionLabel(line: string) {
  return /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 "'`.,()/_-]{0,80}:\s*$/.test(line)
}

function isMarkdownLanguage(language: string) {
  return /^(md|markdown|mdx|text|txt)$/i.test(language)
}

function getElementClassName(props: unknown) {
  if (!props || typeof props !== 'object' || !('className' in props)) {
    return ''
  }

  const { className } = props as { className?: unknown }

  return typeof className === 'string' ? className : ''
}

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ')
}

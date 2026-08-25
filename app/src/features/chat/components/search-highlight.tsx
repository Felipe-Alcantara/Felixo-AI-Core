import type { ReactNode } from 'react'

export function highlight(text: string, query: string): ReactNode {
  if (!query) return text

  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return text

  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-amber-400/30 text-inherit rounded-sm">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  )
}

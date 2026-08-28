import { useEffect, useRef, useState, type ReactNode } from 'react'

export function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return text
  return <>{text.slice(0, index)}<mark className="rounded-sm bg-amber-400/30 text-inherit">{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>
}

export function useSearchQuery() {
  const [query, setQuery] = useState('')
  return [query, setQuery] as const
}

export function useSearchInputFocus() {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  return inputRef
}

import { describe, expect, it } from 'vitest'
import type { CanvasNotification } from '../terminal/canvas-notifications'
import type { SessionSnapshot } from '../terminal/terminal-session-store'
import {
  CANVAS_SHORTCUTS,
  formatShortcutKeys,
  nextPendingNode,
  resolveNumberBuffer,
  shortcutActionFromEvent,
  shortcutAllowedOn,
} from './canvas-shortcuts'

const key = (code: string, extra: Partial<KeyboardEvent> = {}) => ({
  code,
  key: code,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...extra,
})

function notification(nodeId: string, activity: string, createdAt: number, readAt: number | null = null, exitCode?: number) {
  return { id: `${nodeId}:${createdAt}`, nodeId, createdAt, readAt, snapshot: { activity, exitCode } as unknown as SessionSnapshot } satisfies CanvasNotification
}

describe('shortcutActionFromEvent', () => {
  it('Alt+1..9 pulam para o #N, lendo o code (Option+dígito no macOS produz outro caractere)', () => {
    expect(shortcutActionFromEvent(key('Digit7', { altKey: true, key: '™' }))).toEqual({ type: 'jump', number: 7 })
    expect(shortcutActionFromEvent(key('Digit0', { altKey: true }))).toBeNull()
  })
  it('Alt+N e Alt+Q', () => {
    expect(shortcutActionFromEvent(key('KeyN', { altKey: true }))).toEqual({ type: 'next-pending' })
    expect(shortcutActionFromEvent(key('KeyQ', { altKey: true }))).toEqual({ type: 'show-numbers' })
  })
  it('não rouba o que é da gaveta, do AltGr nem dígito sem Alt', () => {
    expect(shortcutActionFromEvent(key('Digit1', { altKey: true, shiftKey: true }))).toBeNull()
    expect(shortcutActionFromEvent(key('KeyZ', { altKey: true, shiftKey: true }))).toBeNull()
    expect(shortcutActionFromEvent(key('Digit1', { altKey: true, ctrlKey: true }))).toBeNull()
    expect(shortcutActionFromEvent(key('Digit1'))).toBeNull()
    expect(shortcutActionFromEvent(key('ArrowUp', { altKey: true }))).toBeNull()
  })
  it('? abre a lista', () => {
    expect(shortcutActionFromEvent(key('Slash', { key: '?', shiftKey: true }))).toEqual({ type: 'help' })
  })
})

describe('shortcutAllowedOn', () => {
  const target = (matches: string[]) => ({ closest: (selector: string) => (matches.some((m) => selector.includes(m)) ? {} : null) }) as unknown as EventTarget
  it('Alt+dígito vale dentro do terminal e não em campo de texto', () => {
    const jump = { type: 'jump', number: 1 } as const
    expect(shortcutAllowedOn(jump, target(['.xterm', 'textarea']))).toBe(true)
    expect(shortcutAllowedOn(jump, target(['textarea']))).toBe(false)
  })
  it('? só fora de campos e do terminal', () => {
    expect(shortcutAllowedOn({ type: 'help' }, target(['.xterm']))).toBe(false)
    expect(shortcutAllowedOn({ type: 'help' }, target([]))).toBe(true)
  })
})

describe('nextPendingNode', () => {
  const valid = new Set(['a', 'b', 'c', 'd'])
  it('falhou vence precisa de resposta, que vence terminou', () => {
    const history = [notification('a', 'idle', 1), notification('b', 'waiting_approval', 2), notification('c', 'error', 3)]
    expect(nextPendingNode(history, valid)).toBe('c')
    expect(nextPendingNode(history.filter((n) => n.nodeId !== 'c'), valid)).toBe('b')
  })
  it('na mesma categoria, a mais antiga; ignora lidas e terminais que não existem mais', () => {
    const history = [
      notification('b', 'waiting_approval', 20),
      notification('a', 'waiting_approval', 10, 99),
      notification('d', 'waiting_approval', 15),
      notification('gone', 'error', 1),
    ]
    expect(nextPendingNode(history, valid)).toBe('d')
  })
  it('sem pendência, null', () => {
    expect(nextPendingNode([notification('a', 'idle', 1, 5)], valid)).toBeNull()
  })
})

describe('resolveNumberBuffer', () => {
  it('com 12 agentes, "1" espera o segundo dígito e "7" abre na hora', () => {
    expect(resolveNumberBuffer('7', 12)).toEqual({ number: 7, final: true })
    expect(resolveNumberBuffer('1', 12)).toEqual({ number: 1, final: false })
    expect(resolveNumberBuffer('12', 12)).toEqual({ number: 12, final: true })
  })
  it('número inexistente encerra sem abrir', () => {
    expect(resolveNumberBuffer('9', 5)).toEqual({ number: null, final: true })
    expect(resolveNumberBuffer('0', 12).number).toBeNull()
  })
})

describe('formatShortcutKeys e registro', () => {
  it('traduz para o SO', () => {
    expect(formatShortcutKeys('Mod+K', 'win32')).toBe('Ctrl+K')
    expect(formatShortcutKeys('Alt+Shift+Z', 'darwin')).toBe('⌥⇧Z')
    expect(formatShortcutKeys('Shift+↑ / Shift+↓', 'linux')).toBe('Shift+↑ / Shift+↓')
  })
  it('ids únicos', () => {
    const ids = CANVAS_SHORTCUTS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

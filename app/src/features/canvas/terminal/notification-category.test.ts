import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CanvasNotification } from './canvas-notifications'
import {
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CATEGORY_PRIORITY,
  notificationCategory,
  notificationClassName,
  notificationColorVar,
  unreadCategoryByNode,
  type NotificationCategory,
} from './notification-category'
import type { SessionSnapshot } from './terminal-session-store'

const snap = (over: Partial<SessionSnapshot>): SessionSnapshot => ({ activity: 'idle', previewLines: [], ...over })
const note = (nodeId: string, snapshot: SessionSnapshot, readAt: number | null = null): CanvasNotification => ({
  id: `${nodeId}:0`,
  nodeId,
  snapshot,
  createdAt: 1,
  readAt,
})

describe('notificationCategory — snapshot → categoria', () => {
  it('mapeia cada situação para a categoria certa', () => {
    expect(notificationCategory(snap({ activity: 'idle' }))).toBe('finished')
    expect(notificationCategory(snap({ activity: 'waiting_approval' }))).toBe('needs-response')
    expect(notificationCategory(snap({ activity: 'exited', exitCode: 0 }))).toBe('finished')
    expect(notificationCategory(snap({ activity: 'exited', exitCode: 2 }))).toBe('failed')
    expect(notificationCategory(snap({ activity: 'exited' }))).toBe('failed')
    expect(notificationCategory(snap({ activity: 'error' }))).toBe('failed')
  })
})

describe('unreadCategoryByNode — a borda só existe enquanto não lida', () => {
  it('ler a notificação remove a borda', () => {
    expect(unreadCategoryByNode([note('a', snap({ activity: 'idle' }), 123)]).size).toBe(0)
    expect(unreadCategoryByNode([note('a', snap({ activity: 'idle' }))]).get('a')).toBe('finished')
  })
  it('dois nós de categorias diferentes recebem cada um a sua', () => {
    const map = unreadCategoryByNode([
      note('a', snap({ activity: 'waiting_approval' })),
      note('b', snap({ activity: 'exited', exitCode: 1 })),
    ])
    expect(map.get('a')).toBe('needs-response')
    expect(map.get('b')).toBe('failed')
  })
  it('no mesmo nó vence a mais urgente, em qualquer ordem', () => {
    const a = note('a', snap({ activity: 'idle' }))
    const b = note('a', snap({ activity: 'exited', exitCode: 1 }))
    expect(unreadCategoryByNode([a, b]).get('a')).toBe('failed')
    expect(unreadCategoryByNode([b, a]).get('a')).toBe('failed')
  })
})

describe('sincronia painel × borda: um único token por categoria', () => {
  const css = readFileSync(new URL('../../../index.css', import.meta.url), 'utf8')
  const categorias: NotificationCategory[] = ['needs-response', 'finished', 'failed']

  it('toda categoria tem rótulo, prioridade e classe/variável coerentes', () => {
    expect([...NOTIFICATION_CATEGORY_PRIORITY].sort()).toEqual([...categorias].sort())
    for (const c of categorias) {
      expect(NOTIFICATION_CATEGORY_LABELS[c]).toBeTruthy()
      expect(notificationClassName(c)).toBe(`felixo-notify felixo-notify-${c}`)
      expect(notificationColorVar(c)).toBe(`var(--felixo-notify-${c})`)
    }
  })
  it('o token existe no tema padrão E no de alto contraste, e a borda usa o mesmo token', () => {
    const hc = css.slice(css.indexOf(":root[data-theme='high_contrast']"))
    for (const c of categorias) {
      const def = new RegExp(`--felixo-notify-${c}:\\s*#[0-9a-f]{6}`, 'i')
      expect(css, `padrão ${c}`).toMatch(def)
      expect(hc, `alto contraste ${c}`).toMatch(def)
      expect(css, `borda ${c}`).toContain(`.felixo-notify-${c} > :first-child { --felixo-notify-color: var(--felixo-notify-${c}); }`)
    }
  })
  it('a borda da notificação vem DEPOIS da moldura escolhida (a notificação vence)', () => {
    expect(css.indexOf('.felixo-notify > :first-child')).toBeGreaterThan(css.indexOf('.felixo-frame-zinc > :first-child'))
  })
})

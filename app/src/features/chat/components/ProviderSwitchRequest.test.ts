import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ProviderSwitchRequest } from './ProviderSwitchRequest'
import type { ProviderSwitchRequest as ProviderSwitchRequestData } from '../types'

const REQUEST: ProviderSwitchRequestData = {
  decisionId: 'decision-1',
  kind: 'initial',
  runId: 'run-1',
  agentId: 'agent-1',
  parentThreadId: 'thread-1',
  sessionId: 'session-1',
  fromCliType: 'claude',
  toCliType: 'codex',
  toModelId: 'codex-main',
  toModelName: 'Codex Main',
  rule: 'provider-fallback',
  reason: null,
  requestedAt: '2026-05-01T12:00:00.000Z',
  expiresAt: '2026-05-01T12:10:00.000Z',
}

function render(now: number) {
  return renderToStaticMarkup(
    createElement(ProviderSwitchRequest, {
      request: REQUEST,
      state: { busy: false, error: null, stale: false },
      now,
      onRespond: () => {},
      onDismiss: () => {},
    }),
  )
}

/** Os botões de resposta, com o atributo disabled quando houver. */
function responseButtons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>(?:Trocar para [^<]*|Não trocar)<\/button>/g)].map((match) => match[0])
}

describe('ProviderSwitchRequest', () => {
  it('dentro do prazo oferece trocar e não trocar', () => {
    const buttons = responseButtons(render(Date.parse('2026-05-01T12:05:00.000Z')))
    expect(buttons).toHaveLength(2)
    expect(buttons.every((button) => !/\sdisabled=""/.test(button))).toBe(true)
  })

  it('prazo vencido: não oferece mais a troca e diz que conta como recusa', () => {
    const html = render(Date.parse('2026-05-01T12:10:30.000Z'))
    const buttons = responseButtons(html)
    expect(buttons).toHaveLength(2)
    expect(buttons.every((button) => /\sdisabled=""/.test(button))).toBe(true)
    expect(html).toContain('Prazo vencido: sem resposta a tempo conta como recusa e nada é trocado.')
    expect(html).not.toContain('Responda ')
  })
})

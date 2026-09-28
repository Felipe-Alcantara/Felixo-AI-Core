import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountSwitchDialog } from './AccountSwitchDialog'
import { HandoffDialog } from './HandoffDialog'
import type { AccountSwitchDialogBinding } from '../hooks/useAccountContinuation'
import { makeProposal } from '../services/__fixtures__/account-chain-fixtures'

function binding(overrides: Partial<AccountSwitchDialogBinding> = {}): AccountSwitchDialogBinding {
  const noop = () => {}
  return {
    proposal: makeProposal(),
    closedElsewhere: false,
    transcript: { ok: true, text: 'contexto', chars: 8, lines: 1 },
    busy: false,
    error: null,
    sourceActiveRequired: false,
    canPin: true,
    onConfirm: noop,
    onLater: noop,
    onNotALimit: noop,
    onPin: noop,
    onMeasureNow: noop,
    onCheckLogin: noop,
    onOpenChainSettings: noop,
    onGoToSource: noop,
    onClose: noop,
    ...overrides,
  }
}

/** Classes do primeiro `div` (o overlay) do HTML renderizado; `link` de pré-carga não conta. */
function outerClasses(html: string): string[] {
  const match = /^(?:<link[^>]*>)*<div[^>]*\sclass="([^"]*)"/.exec(html)
  return match ? match[1].split(/\s+/) : []
}

describe('modais sobre o canvas', () => {
  // O React Flow escuta Delete/Backspace no document e ignora o que vem de
  // dentro de `.nokey`. Sem ela, apertar Delete num botão do diálogo apagava
  // o bloco selecionado atrás do modal — o terminal antigo, que a cadeia
  // nunca pode encerrar (decisão 6).
  it('o overlay do "Trocar de conta?" fica dentro de .nokey', () => {
    const html = renderToStaticMarkup(createElement(AccountSwitchDialog, { binding: binding() }))
    expect(outerClasses(html)).toContain('nokey')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('o overlay do "Passar responsabilidade" fica dentro de .nokey', () => {
    // O tamanho salvo do diálogo é lido do navegador; aqui não há nenhum.
    vi.stubGlobal('window', {
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      innerWidth: 1280,
      innerHeight: 800,
    })
    const html = renderToStaticMarkup(
      createElement(HandoffDialog, {
        sourceLabel: 'Terminal',
        projects: [],
        onAddFolder: async () => [],
        onConfirm: async () => ({ ok: true }),
        onClose: () => {},
      }),
    )
    expect(outerClasses(html)).toContain('nokey')
  })
})

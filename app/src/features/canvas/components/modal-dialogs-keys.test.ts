import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountSwitchDialog } from './AccountSwitchDialog'
import { HandoffDialog } from './HandoffDialog'
import type { AccountSwitchDialogBinding } from '../hooks/useAccountContinuation'
import { makeCandidate, makeProposal } from '../services/__fixtures__/account-chain-fixtures'

function binding(overrides: Partial<AccountSwitchDialogBinding> = {}): AccountSwitchDialogBinding {
  const noop = () => {}
  return {
    proposal: makeProposal(),
    closedElsewhere: false,
    transcript: { ok: true, text: 'contexto', chars: 8, lines: 1 },
    busy: false,
    error: null,
    sourceActiveRequired: false,
    sourceYolo: false,
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
    screenOnly: false,
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

  it('com o confirm em curso, o X ("Agora não") fica inativo, como o botão de texto', () => {
    const idle = renderToStaticMarkup(createElement(AccountSwitchDialog, { binding: binding() }))
    const busy = renderToStaticMarkup(createElement(AccountSwitchDialog, { binding: binding({ busy: true }) }))
    const closeButton = (html: string) => /<button[^>]*aria-label="Agora não"[^>]*>/.exec(html)?.[0] ?? ''
    expect(closeButton(idle)).not.toMatch(/\sdisabled=""/)
    expect(closeButton(busy)).toMatch(/\sdisabled=""/)
  })

  it('outro provedor: a caixa "Yolo no bloco novo" vem marcada; mesmo provedor só diz o modo do bloco antigo', () => {
    const outro = renderToStaticMarkup(
      createElement(AccountSwitchDialog, {
        binding: binding({
          proposal: makeProposal({ candidates: [makeCandidate({ accountId: 'conta-b', label: 'Max', providerId: 'claude' })] }),
        }),
      }),
    )
    const caixa = outro.split('</label>').find((parte) => parte.includes('Yolo no bloco novo')) ?? ''
    expect(caixa).toMatch(/<input type="checkbox"[^>]*checked=""/)

    const mesmo = renderToStaticMarkup(createElement(AccountSwitchDialog, { binding: binding({ sourceYolo: true }) }))
    expect(mesmo).not.toContain('Yolo no bloco novo')
    expect(mesmo).toContain('Abre com Yolo (acesso total, sem confirmações), como o bloco antigo.')
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

describe('texto dos diálogos de passagem quando o terminal está na tela alternativa', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const handoff = (screenOnly: boolean) => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      innerWidth: 1280,
      innerHeight: 800,
    })
    return renderToStaticMarkup(
      createElement(HandoffDialog, {
        sourceLabel: 'Claude A',
        projects: [],
        onAddFolder: async () => [],
        onConfirm: async () => ({ ok: true }),
        onClose: () => {},
        screenOnly,
      }),
    )
  }

  it('o Handoff só promete o histórico inteiro quando ele existe', () => {
    const completo = handoff(false)
    expect(completo).toContain('O histórico vai inteiro')
    expect(completo).not.toContain('Não é a conversa inteira')

    const soTela = handoff(true)
    expect(soTela).not.toContain('vai inteiro')
    expect(soTela).toContain('a tela de')
    expect(soTela).toContain('Não é a conversa inteira')
    expect(soTela).toContain('não o histórico inteiro')
  })

  it('a troca de conta avisa que só a tela vai como contexto', () => {
    const sem = renderToStaticMarkup(createElement(AccountSwitchDialog, { binding: binding({ screenOnly: false }) }))
    const com = renderToStaticMarkup(createElement(AccountSwitchDialog, { binding: binding({ screenOnly: true }) }))
    expect(sem).not.toContain('tela alternativa')
    expect(com).toContain('tela alternativa')
  })
})

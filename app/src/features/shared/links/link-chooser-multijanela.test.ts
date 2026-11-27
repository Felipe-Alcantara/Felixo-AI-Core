// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LinkChooserHost } from './LinkChooserHost'
import { closeLinkChooser, getLinkChooserState, openLinkChooser } from './link-chooser-store'

/**
 * O menu de um link de terminal destacado precisa abrir na janela do terminal,
 * não na principal, e um clique dentro dele não pode contar como "clique fora".
 */
describe('menu de link numa janela auxiliar', () => {
  let raiz: Root
  let outra: Document

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const quadro = document.body.appendChild(document.createElement('iframe'))
    outra = quadro.contentDocument!
    raiz = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => raiz.render(createElement(LinkChooserHost)))
  })

  afterEach(async () => {
    await act(async () => {
      closeLinkChooser()
      raiz.unmount()
    })
    document.body.innerHTML = ''
  })

  const abrir = (documento?: Document) =>
    act(async () =>
      openLinkChooser({ url: 'https://example.com/', origin: 'terminal', anchor: { x: 10, y: 10 }, documento }),
    )
  const apontar = (alvo: Element) =>
    act(async () => void alvo.dispatchEvent(new (alvo.ownerDocument.defaultView!.Event)('pointerdown', { bubbles: true })))

  it('abre no documento de quem pediu', async () => {
    await abrir(outra)

    expect(outra.body.querySelector('[role=menu]')).not.toBeNull()
    expect(document.body.querySelector('[role=menu]')).toBeNull()
  })

  it('clique dentro do menu não o fecha; clique fora, na mesma janela, fecha', async () => {
    await abrir(outra)

    await apontar(outra.body.querySelector('[role=menu] [role=menuitem]')!)
    expect(getLinkChooserState().request).not.toBeNull()

    await apontar(outra.body.appendChild(outra.createElement('div')))
    expect(getLinkChooserState().request).toBeNull()
  })

  it('sem documento no pedido, continua na principal', async () => {
    await abrir()

    expect(document.body.querySelector('[role=menu]')).not.toBeNull()
    expect(outra.body.querySelector('[role=menu]')).toBeNull()
  })
})

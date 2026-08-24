import { describe, expect, it } from 'vitest'
import { deveLembrarFoco, devePedirFoco, type Focusable } from './focus-restore'

const documento = { body: { nodeName: 'BODY' } as unknown as HTMLElement }

function elemento(isConnected = true): Focusable {
  return { isConnected, focus: () => {} }
}

describe('deveLembrarFoco', () => {
  it('lembra um elemento comum', () => {
    expect(deveLembrarFoco({} as Element, documento)).toBe(true)
  })

  it('não lembra o body: é o estado quebrado que queremos desfazer', () => {
    expect(deveLembrarFoco(documento.body, documento)).toBe(false)
  })

  it('não lembra quando não há foco nenhum', () => {
    expect(deveLembrarFoco(null, documento)).toBe(false)
  })
})

describe('devePedirFoco', () => {
  it('devolve o foco quando o documento ficou sem foco', () => {
    expect(devePedirFoco(elemento(), null, documento)).toBe(true)
  })

  it('devolve o foco quando só o body ficou focado', () => {
    expect(devePedirFoco(elemento(), documento.body, documento)).toBe(true)
  })

  it('não devolve a um elemento que saiu do documento', () => {
    // O modal fechou enquanto a janela estava minimizada.
    expect(devePedirFoco(elemento(false), null, documento)).toBe(false)
  })

  it('não rouba o foco de quem já assumiu', () => {
    // Um modal abriu e autofocou seu campo: quem chegou por último manda.
    const outro = {} as Element
    expect(devePedirFoco(elemento(), outro, documento)).toBe(false)
  })

  it('não faz nada sem elemento lembrado', () => {
    expect(devePedirFoco(null, null, documento)).toBe(false)
  })
})

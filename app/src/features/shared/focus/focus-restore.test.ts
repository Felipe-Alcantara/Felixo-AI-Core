import { describe, expect, it } from 'vitest'
import { deveLembrarFoco, devePedirFoco, type Focusable } from './focus-restore'

const documento = { body: { nodeName: 'BODY' } as unknown as HTMLElement }

function elemento(isConnected = true): Focusable {
  return { isConnected, focus: () => {}, blur: () => {} }
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

  it('devolve o foco mesmo quando o lembrado ainda é o activeElement', () => {
    // Fora do ciclo de minimizar/restaurar do Windows (notificação do SO por
    // cima da janela, troca de app sem minimizar, a maioria dos casos fora do
    // Windows), o Chromium às vezes não limpa `activeElement` — ele continua
    // apontando pro mesmo elemento mesmo com o roteamento nativo de teclado já
    // quebrado. Recusar aqui era deixar esse caso sem conserto nenhum.
    const lembrado = elemento()
    expect(devePedirFoco(lembrado, lembrado as unknown as Element, documento)).toBe(true)
  })

  it('não faz nada sem elemento lembrado', () => {
    expect(devePedirFoco(null, null, documento)).toBe(false)
  })
})

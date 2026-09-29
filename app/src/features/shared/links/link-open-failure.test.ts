import { describe, expect, it } from 'vitest'

import { describeLinkOpenFailure, parseLinkOpenFailure } from './link-open-failure'

describe('parseLinkOpenFailure', () => {
  it('aceita o que o processo principal manda', () => {
    expect(parseLinkOpenFailure({ url: 'https://example.com/', kind: 'falhou' })).toEqual({
      url: 'https://example.com/',
      kind: 'falhou',
    })
    expect(parseLinkOpenFailure({ url: 'file:///x', kind: 'recusado', reason: 'esquema' })).toEqual({
      url: 'file:///x',
      kind: 'recusado',
      reason: 'esquema',
    })
  })

  it.each([
    ['nada', undefined],
    ['texto solto', 'https://example.com/'],
    ['sem url', { kind: 'falhou' }],
    ['url vazia', { url: '', kind: 'falhou' }],
    ['url que não é texto', { url: { toString: (): string => 'x' }, kind: 'falhou' }],
    ['tipo desconhecido', { url: 'https://example.com/', kind: 'aberto' }],
  ])('%s não vira aviso', (_rotulo, valor) => {
    expect(parseLinkOpenFailure(valor)).toBeNull()
  })

  it('um motivo que não é texto é descartado, sem derrubar o aviso', () => {
    expect(parseLinkOpenFailure({ url: 'file:///x', kind: 'recusado', reason: 42 })).toEqual({
      url: 'file:///x',
      kind: 'recusado',
    })
  })
})

describe('describeLinkOpenFailure', () => {
  it('falha do sistema: diz que não abriu no navegador e oferece o endereço para copiar', () => {
    const notice = describeLinkOpenFailure({ url: 'https://example.com/a?b=1', kind: 'falhou' })
    expect(notice.title).toBe('Não foi possível abrir no navegador')
    expect(notice.detail).toMatch(/Copie o link/)
    expect(notice.copyText).toBe('https://example.com/a?b=1')
  })

  it('recusa: o motivo sai da política do renderer, em português, com maiúscula', () => {
    const notice = describeLinkOpenFailure({ url: 'file:///etc/hosts', kind: 'recusado', reason: 'esquema' })
    expect(notice.title).toBe('O app não abriu este link')
    expect(notice.detail).toBe('Endereços file: não abrem pelo app, só http, https e mailto.')
    expect(notice.copyText).toBe('file:///etc/hosts')
  })

  it('e-mail que não abriu: fala do app de e-mail, não do navegador', () => {
    const notice = describeLinkOpenFailure({ url: 'mailto:time@example.com?cc=a@example.com', kind: 'falhou' })
    expect(notice.title).toBe('Não foi possível abrir o app de e-mail')
    expect(notice.detail).not.toMatch(/navegador/)
    expect(notice.copyLabel).toBe('Copiar endereço')
    expect(notice.copyText).toBe('mailto:time@example.com?cc=a@example.com')
  })

  it('link web usa o rótulo do menu, "Copiar link"', () => {
    expect(describeLinkOpenFailure({ url: 'https://example.com/', kind: 'falhou' }).copyLabel).toBe('Copiar link')
    expect(describeLinkOpenFailure({ url: 'file:///x', kind: 'recusado' }).copyLabel).toBe('Copiar link')
  })

  it('recusa de um endereço que o renderer aprovaria: explica sem inventar motivo', () => {
    const notice = describeLinkOpenFailure({ url: 'https://example.com/', kind: 'recusado', reason: 'x' })
    expect(notice.detail).toBe('O endereço foi recusado na hora de abrir.')
  })
})

import { describe, expect, it } from 'vitest'
import { copiarTexto } from './copy-text'
import { mensagemDeFalha, resultadoDeIpc } from './ipc-result'

describe('resultadoDeIpc', () => {
  it('sucesso devolve o valor original', async () => {
    expect(await resultadoDeIpc(async () => ({ ok: true, id: 7 }), 'falhou')).toEqual({ ok: true, value: { ok: true, id: 7 } })
  })

  it('{ ok: false } vira falha com a mensagem do handler, ou com a padrão quando ele não disse nada', async () => {
    expect(await resultadoDeIpc(async () => ({ ok: false, message: 'Sem espaço em disco.' }), 'falhou')).toEqual({ ok: false, message: 'Sem espaço em disco.' })
    expect(await resultadoDeIpc(async () => ({ ok: false }), 'falhou')).toEqual({ ok: false, message: 'falhou' })
    expect(await resultadoDeIpc(async () => ({ ok: false, message: '  ' }), 'falhou')).toEqual({ ok: false, message: 'falhou' })
  })

  it('a rejeição e o throw síncrono viram a mesma falha', async () => {
    expect(await resultadoDeIpc(async () => { throw new Error('IPC caiu') }, 'falhou')).toEqual({ ok: false, message: 'IPC caiu' })
    expect(await resultadoDeIpc(() => { throw new Error('ponte lançou') }, 'falhou')).toEqual({ ok: false, message: 'ponte lançou' })
    expect(await resultadoDeIpc(() => Promise.reject('texto solto'), 'falhou')).toEqual({ ok: false, message: 'texto solto' })
    expect(await resultadoDeIpc(() => Promise.reject(undefined), 'falhou')).toEqual({ ok: false, message: 'falhou' })
  })

  it('false (handlers boolean) e ponte ausente (undefined) são falha', async () => {
    expect(await resultadoDeIpc(async () => false, 'não apagou')).toEqual({ ok: false, message: 'não apagou' })
    expect(await resultadoDeIpc(() => undefined, 'ponte ausente')).toEqual({ ok: false, message: 'ponte ausente' })
    expect(await resultadoDeIpc(async () => null, 'nulo')).toEqual({ ok: false, message: 'nulo' })
  })

  it('true e lista vazia contam como sucesso (o resultado é o valor, não a verdade dele)', async () => {
    expect(await resultadoDeIpc(async () => true, 'x')).toEqual({ ok: true, value: true })
    expect(await resultadoDeIpc(async () => [], 'x')).toEqual({ ok: true, value: [] })
  })

  it('mensagemDeFalha nunca devolve vazio', () => {
    expect(mensagemDeFalha(new Error('  boom '), 'f')).toBe('boom')
    expect(mensagemDeFalha(new Error(''), 'f')).toBe('f')
    expect(mensagemDeFalha(42, 'f')).toBe('f')
  })
})

describe('copiarTexto', () => {
  it('copia e confirma', async () => {
    const escrito: string[] = []
    expect(await copiarTexto('abc', { writeText: async (t) => void escrito.push(t) })).toEqual({ ok: true, value: true })
    expect(escrito).toEqual(['abc'])
  })

  it('sem clipboard não diz que copiou', async () => {
    const desfecho = await copiarTexto('abc', {})
    expect(desfecho.ok).toBe(false)
    expect(desfecho).toMatchObject({ message: expect.stringContaining('área de transferência') })
  })

  it('a rejeição do navegador vira falha com a frase própria (não a do navegador)', async () => {
    const desfecho = await copiarTexto('abc', { writeText: async () => { throw new DOMException('Document is not focused.', 'NotAllowedError') } })
    expect(desfecho).toEqual({ ok: false, message: 'Não foi possível copiar para a área de transferência.' })
  })
})

import { describe, expect, it } from 'vitest'
import { allowWholeCanvasReplace, clearButtonState, judgeCanvasRemoval, LOCKED_REPLACE_MESSAGE } from './canvas-removal-guard'

const live = (ids: string[]) => ({ locked: false, isLiveTerminal: (id: string) => ids.includes(id) })

describe('judgeCanvasRemoval', () => {
  it('com o canvas travado nada é removido, nem sem confirmação', () => {
    expect(judgeCanvasRemoval([{ id: 'n1', type: 'note' }], { locked: true, isLiveTerminal: () => false })).toEqual({ allow: false })
  })

  it('bloco comum e grupo vazio saem sem pedir confirmação', () => {
    expect(judgeCanvasRemoval([{ id: 'n1', type: 'note' }], live([]))).toEqual({ allow: true })
    expect(judgeCanvasRemoval([{ id: 'g', type: 'group' }], live([]))).toEqual({ allow: true })
  })

  it('terminal com processo vivo pede confirmação; terminal encerrado não', () => {
    const verdict = judgeCanvasRemoval([{ id: 't1', type: 'terminal' }], live(['t1']))
    expect(verdict).toMatchObject({ allow: true, confirmMessage: expect.stringContaining('processo será encerrado') })
    expect(judgeCanvasRemoval([{ id: 't1', type: 'terminal' }], live([]))).toEqual({ allow: true })
  })

  it('grupo com filhos diz quantos blocos saem junto e inclui o terminal vivo', () => {
    const verdict = judgeCanvasRemoval(
      [
        { id: 'g', type: 'group' },
        { id: 't1', type: 'terminal', parentId: 'g' },
        { id: 'n1', type: 'note', parentId: 'g' },
      ],
      live(['t1']),
    )
    expect(verdict).toMatchObject({ allow: true })
    const message = (verdict as { confirmMessage: string }).confirmMessage
    expect(message).toContain('Remover 3 blocos?')
    expect(message).toContain('1 grupo com 2 blocos dentro')
    expect(message).toContain('1 terminal com processo em execução')
  })

  it('imagem temporária avisa que o arquivo será apagado', () => {
    const verdict = judgeCanvasRemoval([{ id: 'f', type: 'file', data: { image: { temporary: true } } }], live([]))
    expect((verdict as { confirmMessage: string }).confirmMessage).toContain('apagado do disco')
  })
})

describe('Limpar e importar com o canvas travado', () => {
  it('allowWholeCanvasReplace recusa e avisa quando travado, e libera destravado', () => {
    const avisos: string[] = []
    expect(allowWholeCanvasReplace(true, (m) => avisos.push(m))).toBe(false)
    expect(avisos).toEqual([LOCKED_REPLACE_MESSAGE])
    expect(allowWholeCanvasReplace(false, (m) => avisos.push(m))).toBe(true)
    expect(avisos).toHaveLength(1)
  })

  it('o botão Limpar fica desabilitado e diz que o canvas está travado', () => {
    expect(clearButtonState(true, false)).toMatchObject({ disabled: true, title: expect.stringContaining('travado') })
    expect(clearButtonState(false, true).disabled).toBe(true)
    expect(clearButtonState(false, false).disabled).toBe(false)
  })
})

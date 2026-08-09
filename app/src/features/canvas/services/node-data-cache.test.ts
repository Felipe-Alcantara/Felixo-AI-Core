import { describe, expect, it } from 'vitest'
import {
  createNodeDataReuse,
  countTerminalOrder,
  type NodeDataCacheEntry,
} from './node-data-cache'

describe('createNodeDataReuse', () => {
  it('reaproveita o MESMO objeto quando as dependências não mudam', () => {
    // É esta identidade referencial que deixa o React.memo pular o
    // re-render de blocos intocados durante drag/pan — o ponto inteiro
    // do cache, e o que mais importa em hardware modesto.
    const cache = new Map<string, NodeDataCacheEntry>()

    const first = createNodeDataReuse(cache)
    const dataA = first.reuseData('n1', ['dep'], () => ({ valor: 1 }))
    first.commit()

    const second = createNodeDataReuse(cache)
    const dataB = second.reuseData('n1', ['dep'], () => ({ valor: 2 }))
    second.commit()

    expect(dataB).toBe(dataA)
    // O build nem chegou a rodar: o valor continua sendo o do primeiro.
    expect(dataB).toEqual({ valor: 1 })
  })

  it('reconstrói quando alguma dependência muda', () => {
    const cache = new Map<string, NodeDataCacheEntry>()

    const first = createNodeDataReuse(cache)
    const dataA = first.reuseData('n1', ['dep'], () => ({ valor: 1 }))
    first.commit()

    const second = createNodeDataReuse(cache)
    const dataB = second.reuseData('n1', ['outra'], () => ({ valor: 2 }))
    second.commit()

    expect(dataB).not.toBe(dataA)
    expect(dataB).toEqual({ valor: 2 })
  })

  it('reconstrói quando a quantidade de dependências muda', () => {
    const cache = new Map<string, NodeDataCacheEntry>()

    const first = createNodeDataReuse(cache)
    const dataA = first.reuseData('n1', ['a'], () => ({ valor: 1 }))
    first.commit()

    const second = createNodeDataReuse(cache)
    const dataB = second.reuseData('n1', ['a', 'b'], () => ({ valor: 2 }))
    second.commit()

    expect(dataB).not.toBe(dataA)
  })

  it('compara dependências por identidade, não por conteúdo', () => {
    // Objetos equivalentes mas distintos contam como mudança: é assim que
    // `node.data` recém-criado invalida o cache daquele bloco.
    const cache = new Map<string, NodeDataCacheEntry>()

    const first = createNodeDataReuse(cache)
    const dataA = first.reuseData('n1', [{ x: 1 }], () => ({ valor: 1 }))
    first.commit()

    const second = createNodeDataReuse(cache)
    const dataB = second.reuseData('n1', [{ x: 1 }], () => ({ valor: 2 }))
    second.commit()

    expect(dataB).not.toBe(dataA)
  })

  it('mantém entradas independentes por bloco', () => {
    const cache = new Map<string, NodeDataCacheEntry>()

    const first = createNodeDataReuse(cache)
    const a1 = first.reuseData('n1', ['a'], () => ({ id: 'n1' }))
    const b1 = first.reuseData('n2', ['b'], () => ({ id: 'n2' }))
    first.commit()

    const second = createNodeDataReuse(cache)
    // Só n1 muda; n2 deve continuar com o mesmo objeto.
    const a2 = second.reuseData('n1', ['mudou'], () => ({ id: 'n1-novo' }))
    const b2 = second.reuseData('n2', ['b'], () => ({ id: 'n2' }))
    second.commit()

    expect(a2).not.toBe(a1)
    expect(b2).toBe(b1)
  })

  it('descarta do cache os blocos ausentes na passagem atual', () => {
    // Sem isso o Map cresceria indefinidamente conforme blocos são criados
    // e removidos ao longo da sessão.
    const cache = new Map<string, NodeDataCacheEntry>()

    const first = createNodeDataReuse(cache)
    first.reuseData('n1', ['a'], () => ({ id: 'n1' }))
    first.reuseData('n2', ['b'], () => ({ id: 'n2' }))
    first.commit()
    expect(cache.size).toBe(2)

    // n2 foi removido do canvas: não é mais visitado nesta passagem.
    const second = createNodeDataReuse(cache)
    second.reuseData('n1', ['a'], () => ({ id: 'n1' }))
    second.commit()

    expect(cache.size).toBe(1)
    expect(cache.has('n2')).toBe(false)
  })
})

describe('countTerminalOrder', () => {
  it('numera terminais a partir de 1, na ordem do array', () => {
    const ordem = countTerminalOrder([
      { id: 'n1', type: 'note' },
      { id: 't1', type: 'terminal' },
      { id: 'g1', type: 'group' },
      { id: 't2', type: 'terminal' },
    ])

    expect(ordem.get('t1')).toBe(1)
    expect(ordem.get('t2')).toBe(2)
  })

  it('ignora blocos que não são terminais', () => {
    const ordem = countTerminalOrder([
      { id: 'n1', type: 'note' },
      { id: 'w1', type: 'webpage' },
    ])

    expect(ordem.size).toBe(0)
    expect(ordem.get('n1')).toBeUndefined()
  })

  it('renumera sem deixar buraco quando um terminal do meio some', () => {
    // Fechar o terminal #1 deve fazer o #2 virar #1, em vez de manter um
    // contador crescente com lacunas.
    const antes = countTerminalOrder([
      { id: 't1', type: 'terminal' },
      { id: 't2', type: 'terminal' },
      { id: 't3', type: 'terminal' },
    ])
    expect([antes.get('t1'), antes.get('t2'), antes.get('t3')]).toEqual([1, 2, 3])

    const depois = countTerminalOrder([
      { id: 't1', type: 'terminal' },
      { id: 't3', type: 'terminal' },
    ])
    expect([depois.get('t1'), depois.get('t3')]).toEqual([1, 2])
  })

  it('lida com lista vazia', () => {
    expect(countTerminalOrder([]).size).toBe(0)
  })
})

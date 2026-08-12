import { describe, expect, it } from 'vitest'
import { sortProjectsByName } from './projects-panel-order'

const project = (name: string, path = `/home/user/${name}`) => ({ name, path })

describe('sortProjectsByName', () => {
  it('põe os projetos em ordem alfabética, não na ordem de uso do backend', () => {
    const sorted = sortProjectsByName([
      project('Zebra'),
      project('alfa'),
      project('Marte'),
    ])

    expect(sorted.map((p) => p.name)).toEqual(['alfa', 'Marte', 'Zebra'])
  })

  it('ignora a caixa, para maiúscula não ir toda para o começo', () => {
    // Numa ordenação por código de caractere, todo nome com inicial maiúscula
    // viria antes de qualquer minúscula: 'Beta' antes de 'alfa'.
    const sorted = sortProjectsByName([project('beta'), project('Alfa'), project('Gama')])

    expect(sorted.map((p) => p.name)).toEqual(['Alfa', 'beta', 'Gama'])
  })

  it('trata acento como a letra base, em vez de jogar o nome para o fim', () => {
    // 'Á' (U+00C1) vem depois de 'z' por código de caractere, então sem
    // collator 'Álbum' terminaria a lista em vez de abri-la.
    const sorted = sortProjectsByName([
      project('Zulu'),
      project('Álbum'),
      project('Ação'),
      project('Acre'),
    ])

    expect(sorted.map((p) => p.name)).toEqual(['Ação', 'Acre', 'Álbum', 'Zulu'])
  })

  it('ordena número por valor, não por texto', () => {
    const sorted = sortProjectsByName([
      project('projeto10'),
      project('projeto2'),
      project('projeto1'),
    ])

    expect(sorted.map((p) => p.name)).toEqual(['projeto1', 'projeto2', 'projeto10'])
  })

  it('desempata pelo caminho quando dois nomes são equivalentes', () => {
    // Sem desempate, a ordem entre estes dois seria indefinida e a lista
    // poderia se reorganizar sozinha a cada recarga.
    const sorted = sortProjectsByName([
      project('API', '/home/user/b/API'),
      project('api', '/home/user/a/api'),
    ])

    expect(sorted.map((p) => p.path)).toEqual(['/home/user/a/api', '/home/user/b/API'])
  })

  it('não altera a lista recebida', () => {
    const projects = [project('Zebra'), project('alfa')]
    const sorted = sortProjectsByName(projects)

    expect(projects.map((p) => p.name)).toEqual(['Zebra', 'alfa'])
    expect(sorted).not.toBe(projects)
  })

  it('aceita lista vazia e lista de um item', () => {
    expect(sortProjectsByName([])).toEqual([])
    expect(sortProjectsByName([project('unico')]).map((p) => p.name)).toEqual(['unico'])
  })

  it('preserva os demais campos do projeto', () => {
    const sorted = sortProjectsByName([
      { id: '2', name: 'Beta', path: '/b' },
      { id: '1', name: 'Alfa', path: '/a' },
    ])

    expect(sorted).toEqual([
      { id: '1', name: 'Alfa', path: '/a' },
      { id: '2', name: 'Beta', path: '/b' },
    ])
  })
})

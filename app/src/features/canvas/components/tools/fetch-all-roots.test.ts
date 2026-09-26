import { describe, expect, it } from 'vitest'
import { addPickedRoots, removeScanRoot, scanRootName } from './fetch-all-roots'

describe('scanRootName', () => {
  it('usa a última pasta do caminho, com barra de qualquer sistema', () => {
    expect(scanRootName('/home/pessoa/repos')).toBe('repos')
    expect(scanRootName('/home/pessoa/repos/')).toBe('repos')
    expect(scanRootName('D:\\Projetos\\git')).toBe('git')
  })

  it('raiz de volume continua legível', () => {
    expect(scanRootName('/')).toBe('/')
    expect(scanRootName('C:\\')).toBe('C:')
  })
})

describe('addPickedRoots', () => {
  it('acrescenta as pastas escolhidas depois das que já estavam', () => {
    expect(
      addPickedRoots(['/home/pessoa/repos'], {
        ok: true,
        paths: ['/dados/git', '/mnt/trabalho'],
      }),
    ).toEqual({
      roots: ['/home/pessoa/repos', '/dados/git', '/mnt/trabalho'],
      error: null,
    })
  })

  it('não repete pasta já presente nem caminho vazio', () => {
    expect(
      addPickedRoots(['/dados/git'], {
        ok: true,
        paths: ['/dados/git', '  ', ' /mnt/trabalho ', '/mnt/trabalho'],
      }),
    ).toEqual({ roots: ['/dados/git', '/mnt/trabalho'], error: null })
  })

  it('cancelar o seletor ou escolher só pastas repetidas não grava nada', () => {
    expect(addPickedRoots(['/dados/git'], { ok: true, paths: [] })).toEqual({
      roots: null,
      error: null,
    })
    expect(addPickedRoots(['/dados/git'], { ok: true, paths: ['/dados/git'] })).toEqual({
      roots: null,
      error: null,
    })
  })

  it('falha do seletor vira mensagem, com texto padrão quando não há um', () => {
    expect(
      addPickedRoots([], { ok: false, message: 'Portal de arquivos indisponível.' }),
    ).toEqual({ roots: null, error: 'Portal de arquivos indisponível.' })
    expect(addPickedRoots([], undefined)).toEqual({
      roots: null,
      error: 'Não foi possível abrir o seletor de pastas.',
    })
  })

  it('não altera a lista recebida', () => {
    const current = ['/dados/git']

    addPickedRoots(current, { ok: true, paths: ['/mnt/trabalho'] })

    expect(current).toEqual(['/dados/git'])
  })
})

describe('removeScanRoot', () => {
  it('tira só a pasta indicada', () => {
    expect(removeScanRoot(['/dados/git', '/mnt/trabalho'], '/dados/git')).toEqual({
      roots: ['/mnt/trabalho'],
      error: null,
    })
  })

  it('tirar a última raiz grava a lista vazia, que volta a pedir confirmação', () => {
    expect(removeScanRoot(['/dados/git'], '/dados/git')).toEqual({ roots: [], error: null })
  })

  it('pasta fora da lista não gera gravação', () => {
    expect(removeScanRoot(['/dados/git'], '/outra')).toEqual({ roots: null, error: null })
  })
})

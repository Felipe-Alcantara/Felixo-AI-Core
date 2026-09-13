import { describe, expect, it } from 'vitest'
import { parseStatusEntries, splitPath, statusDescriptor } from './git-status'

describe('parseStatusEntries', () => {
  it('separa o lado do stage do lado da árvore de trabalho', () => {
    const entries = parseStatusEntries([
      '## main...origin/main',
      ' M src/editado.ts',
      'M  src/preparado.ts',
      'MM src/nos-dois.ts',
      '?? src/novo.ts',
    ])

    // O cabeçalho de branch não é arquivo.
    expect(entries).toHaveLength(4)

    const porCaminho = new Map(entries.map((item) => [item.path, item]))
    expect(porCaminho.get('src/editado.ts')).toMatchObject({ staged: false, unstaged: true })
    expect(porCaminho.get('src/preparado.ts')).toMatchObject({ staged: true, unstaged: false })

    // Editado depois de adicionado: precisa aparecer nos DOIS grupos, senão a
    // pessoa commita achando que mandou a versão que está vendo na tela.
    expect(porCaminho.get('src/nos-dois.ts')).toMatchObject({ staged: true, unstaged: true })
  })

  it('trata arquivo novo como untracked, e não como modificação', () => {
    const [entry] = parseStatusEntries(['?? src/novo.ts'])

    expect(entry.untracked).toBe(true)
    // Untracked não tem versão anterior: chamá-lo de "unstaged" pediria um
    // diff contra algo que não existe.
    expect(entry.staged).toBe(false)
    expect(entry.unstaged).toBe(false)
  })

  it('lê renomeação e guarda o nome anterior', () => {
    const [entry] = parseStatusEntries(['R  src/velho.ts -> src/novo-nome.ts'])

    expect(entry.path).toBe('src/novo-nome.ts')
    expect(entry.originalPath).toBe('src/velho.ts')
    expect(entry.staged).toBe(true)
  })

  it('desfaz o escape octal de caminho acentuado', () => {
    // Com core.quotePath ligado (o padrão) o git entrega o caminho escapado.
    const [entry] = parseStatusEntries([' M "src/configura\\303\\247\\303\\243o.ts"'])

    expect(entry.path).toBe('src/configuração.ts')
  })

  it('ignora linha curta demais para ter caminho', () => {
    expect(parseStatusEntries(['', ' M', '## main'])).toEqual([])
  })
})

describe('statusDescriptor', () => {
  it('lê a coluna do lado que está sendo mostrado', () => {
    // Adicionado no índice e modificado de novo na árvore: a linha do grupo
    // "Stage" deve dizer A, e a do grupo "Alterações", M.
    const [entry] = parseStatusEntries(['AM src/novo.ts'])

    expect(statusDescriptor(entry, true).letter).toBe('A')
    expect(statusDescriptor(entry, false).letter).toBe('M')
  })

  it('marca untracked com U nos dois lados', () => {
    const [entry] = parseStatusEntries(['?? src/novo.ts'])

    expect(statusDescriptor(entry, true).letter).toBe('U')
    expect(statusDescriptor(entry, false).letter).toBe('U')
  })

  it('destaca conflito de merge', () => {
    const [entry] = parseStatusEntries(['UU src/conflito.ts'])

    expect(statusDescriptor(entry, false).tone).toBe('conflito')
  })
})

describe('splitPath', () => {
  it('separa pasta e nome', () => {
    expect(splitPath('app/src/index.css')).toEqual({ dir: 'app/src', name: 'index.css' })
    expect(splitPath('README.md')).toEqual({ dir: '', name: 'README.md' })
  })
})

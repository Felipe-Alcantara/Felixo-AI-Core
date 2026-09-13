import { describe, expect, it } from 'vitest'
import {
  allDirPaths,
  ancestorPaths,
  buildRepoTree,
  dirsWithChanges,
  filterRepoTree,
  type RepoDirNode,
} from './repo-tree'
import { parseStatusEntries } from './git-status'

const FILES = [
  'src/app.ts',
  'src/components/Button.tsx',
  'src/components/Card.tsx',
  'README.md',
  'docs/guide.md',
]

const STATUS = parseStatusEntries([
  ' M src/components/Button.tsx',
  '?? src/novo.ts',
  'D  docs/removido.md',
])

function child(node: RepoDirNode, name: string) {
  return node.children.find((item) => item.name === name)
}

describe('buildRepoTree', () => {
  it('puts directories before files and sorts each group alphabetically', () => {
    const tree = buildRepoTree(FILES, [])
    expect(tree.children.map((node) => node.name)).toEqual(['docs', 'src', 'README.md'])
  })

  it('hangs the status entry on the matching file', () => {
    const tree = buildRepoTree(FILES, STATUS)
    const components = child(tree, 'src') as RepoDirNode
    const button = child(child(components, 'components') as RepoDirNode, 'Button.tsx')
    expect(button?.kind === 'file' && button.entry?.unstaged).toBe(true)
  })

  it('keeps a staged deletion that git ls-files no longer reports', () => {
    const tree = buildRepoTree(FILES, STATUS)
    const docs = child(tree, 'docs') as RepoDirNode
    expect(docs.children.map((node) => node.name)).toContain('removido.md')
  })

  it('counts changes for the whole subtree, not just direct children', () => {
    const tree = buildRepoTree(FILES, STATUS)
    const src = child(tree, 'src') as RepoDirNode
    expect(src.changed).toBe(2)
    expect((child(src, 'components') as RepoDirNode).changed).toBe(1)
  })

  it('does not duplicate a path present in both sources', () => {
    const tree = buildRepoTree(['src/app.ts'], parseStatusEntries([' M src/app.ts']))
    expect((child(tree, 'src') as RepoDirNode).children).toHaveLength(1)
  })
})

describe('filterRepoTree', () => {
  it('keeps the folders leading to a match', () => {
    const tree = filterRepoTree(buildRepoTree(FILES, []), { query: 'button' })
    const src = child(tree, 'src') as RepoDirNode
    expect(tree.children.map((node) => node.name)).toEqual(['src'])
    expect((child(src, 'components') as RepoDirNode).children.map((n) => n.name)).toEqual([
      'Button.tsx',
    ])
  })

  it('drops clean files when asked for changes only', () => {
    const tree = filterRepoTree(buildRepoTree(FILES, STATUS), { changedOnly: true })
    const paths: string[] = []
    const walk = (node: RepoDirNode) => {
      for (const item of node.children) {
        if (item.kind === 'dir') walk(item)
        else paths.push(item.path)
      }
    }
    walk(tree)
    expect(paths.sort()).toEqual([
      'docs/removido.md',
      'src/components/Button.tsx',
      'src/novo.ts',
    ])
  })

  it('leaves the original tree untouched', () => {
    const tree = buildRepoTree(FILES, [])
    filterRepoTree(tree, { query: 'button' })
    expect(tree.children.map((node) => node.name)).toEqual(['docs', 'src', 'README.md'])
  })
})

describe('ancestorPaths', () => {
  it('lists each folder from the outermost to the innermost', () => {
    expect(ancestorPaths('src/components/Button.tsx')).toEqual(['src', 'src/components'])
  })

  it('returns nothing for a file at the repository root', () => {
    expect(ancestorPaths('README.md')).toEqual([])
  })
})

describe('dirsWithChanges / allDirPaths', () => {
  it('reports only the folders that hold a change', () => {
    expect(dirsWithChanges(buildRepoTree(FILES, STATUS)).sort()).toEqual([
      'docs',
      'src',
      'src/components',
    ])
  })

  it('reports every folder for expand-all', () => {
    expect(allDirPaths(buildRepoTree(FILES, [])).sort()).toEqual([
      'docs',
      'src',
      'src/components',
    ])
  })
})

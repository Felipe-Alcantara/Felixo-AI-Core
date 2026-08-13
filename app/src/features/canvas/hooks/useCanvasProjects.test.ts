import { describe, expect, it } from 'vitest'
import { sortByName, type CanvasProject } from './useCanvasProjects'

function project(name: string): CanvasProject {
  return { id: name, name, path: `/tmp/${name}` }
}

describe('sortByName', () => {
  it('orders projects alphabetically regardless of arrival order', () => {
    const projects = [project('Felixo-AI-Core'), project('Alura'), project('Git-Hub-Repositories')]

    expect(sortByName(projects).map((p) => p.name)).toEqual([
      'Alura',
      'Felixo-AI-Core',
      'Git-Hub-Repositories',
    ])
  })

  it('ignores case when comparing names', () => {
    const projects = [project('zebra'), project('Abacaxi'), project('banana')]

    expect(sortByName(projects).map((p) => p.name)).toEqual(['Abacaxi', 'banana', 'zebra'])
  })

  it('does not mutate the input array', () => {
    const projects = [project('b'), project('a')]
    const original = [...projects]

    sortByName(projects)

    expect(projects).toEqual(original)
  })
})

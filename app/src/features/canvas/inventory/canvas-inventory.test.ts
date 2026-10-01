import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { listInventoryElements, renderCanvasInventoryMarkdown } from './canvas-inventory'

const APP_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const COMPONENTS_DIR = join(APP_ROOT, 'src/features/canvas/components')
const PRELOAD = readFileSync(join(APP_ROOT, 'electron/preload.cjs'), 'utf8')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Os mesmos padrões que `InventoryControlKind` descreve. */
const CONTROL_PATTERN = /<button\b|role="(?:button|menuitem)"|<FelixoSelect\b|<FelixoToggle\b|<ActivityRailButton\b/g

const elements = listInventoryElements()
const sourceCache = new Map<string, string>()

function readSource(file: string): string {
  let source = sourceCache.get(file)
  if (source === undefined) {
    source = readFileSync(join(APP_ROOT, file), 'utf8')
    sourceCache.set(file, source)
  }
  return source
}

function countControls(source: string): number {
  return source.match(CONTROL_PATTERN)?.length ?? 0
}

function listTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listTsxFiles(path)
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [path] : []
  })
}

function toAppPath(path: string): string {
  return relative(APP_ROOT, path).split('\\').join('/')
}

describe('inventário do canvas', () => {
  it('tem IDs únicos em kebab-case e nenhum elemento pendente', () => {
    const ids = elements.map((element) => element.id)
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
    expect(ids.filter((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))).toEqual([])
    expect(ids.filter((id) => id.startsWith('pendente'))).toEqual([])
  })

  it('dá a todo elemento um dono que existe, estado normal, persistência e sobreposição', () => {
    const problems = elements.flatMap((element) => {
      const found: string[] = []
      if (!existsSync(join(APP_ROOT, element.owner))) found.push(`${element.id}: dono ${element.owner} não existe`)
      if (!element.states.normal.trim()) found.push(`${element.id}: sem estado normal`)
      if (!element.persistence.length) found.push(`${element.id}: sem persistência declarada`)
      if (!element.overlap.trim()) found.push(`${element.id}: sem sobreposição declarada`)
      return found
    })
    expect(problems).toEqual([])
  })

  it('dá a todo controle um localizador presente no dono, um efeito e uma falha conhecida', () => {
    const problems = elements.flatMap((element) =>
      element.controls.flatMap((control) => {
        const found: string[] = []
        if (!readSource(element.owner).includes(control.locator)) {
          found.push(`${element.owner}: localizador ausente "${control.locator}"`)
        }
        if (!control.effect.trim()) found.push(`${element.id}: "${control.locator}" sem efeito`)
        if (!control.failure.trim()) found.push(`${element.id}: "${control.locator}" sem falha conhecida`)
        return found
      }),
    )
    expect(problems).toEqual([])
  })

  it('declara exatamente os controles que cada arquivo dono tem', () => {
    const declared = new Map<string, number>()
    for (const element of elements) {
      declared.set(element.owner, (declared.get(element.owner) ?? 0) + element.controls.length)
    }
    const mismatches = [...declared].flatMap(([owner, count]) => {
      const inSource = countControls(readSource(owner))
      return inSource === count ? [] : [`${owner}: ${inSource} no código, ${count} no inventário`]
    })
    expect(mismatches).toEqual([])
  })

  it('tem dono para todo componente do canvas que renderiza controle', () => {
    const owners = new Set(elements.map((element) => element.owner))
    const orphans = listTsxFiles(COMPONENTS_DIR)
      .map(toAppPath)
      .filter((file) => countControls(readSource(file)) > 0 && !owners.has(file))
    expect(orphans).toEqual([])
  })

  it('só cita canais IPC que o preload expõe', () => {
    const missing = elements.flatMap((element) =>
      element.ipc
        .filter((channel) => !PRELOAD.includes(`'${channel}'`))
        .map((channel) => `${element.id}: ${channel}`),
    )
    expect(missing).toEqual([])
  })

  it('só cita testes e funções de smoke que existem', () => {
    const refs = elements.flatMap((element) => [
      ...element.tests.map((ref) => ({ id: element.id, ref })),
      ...element.controls.flatMap((control) => (control.test ? [{ id: element.id, ref: control.test }] : [])),
    ])
    const missing = refs.flatMap(({ id, ref }) => {
      if (!existsSync(join(APP_ROOT, ref.file))) return [`${id}: ${ref.file} não existe`]
      if (!ref.check) return []
      const declaresCheck = new RegExp(`(?:function\\s+${ref.check}\\b|const\\s+${ref.check}\\s*=)`)
      return declaresCheck.test(readSource(ref.file)) ? [] : [`${id}: ${ref.file} não declara ${ref.check}`]
    })
    expect(missing).toEqual([])
  })

  it('aponta uma task do Notion para toda lacuna', () => {
    const invalid = elements.flatMap((element) =>
      element.gaps.filter((gap) => !UUID.test(gap.task)).map((gap) => `${element.id}: ${gap.task} — ${gap.what}`),
    )
    expect(invalid).toEqual([])
  })

  it('mantém docs/projeto/INVENTARIO-CANVAS.md igual aos dados', async () => {
    await expect(renderCanvasInventoryMarkdown()).toMatchFileSnapshot('../../../../../docs/projeto/INVENTARIO-CANVAS.md')
  })
})

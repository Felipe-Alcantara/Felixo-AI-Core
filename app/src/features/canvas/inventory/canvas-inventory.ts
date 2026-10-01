import type { CanvasTool } from '../components/tools/CanvasToolsMenu'
import type { CanvasNodeType } from '../types'
import type { InventoryElement, InventoryLayer, InventoryTestRef } from './canvas-inventory-types'
import { INVENTORY_STATES } from './canvas-inventory-types'
import { chromeSurfaces, notificationsTool } from './data/chrome'
import { overlaySurfaces } from './data/overlays'
import { nodeInventory, nodeSurfaces, notionTasksTool } from './data/nodes'
import { terminalSurfaces } from './data/terminal'
import { agentTools, agentToolSurfaces } from './data/tools-agents'
import { workspaceTools, workspaceToolSurfaces } from './data/tools-workspace'

/**
 * Um elemento por tipo de bloco. `Record<CanvasNodeType, …>` faz o `tsc`
 * recusar um tipo novo de bloco sem entrada no inventário.
 */
export const NODE_INVENTORY: Record<CanvasNodeType, InventoryElement> = nodeInventory

/**
 * Um elemento por ferramenta do menu. Mesma trava do `TOOL_LABELS`: uma
 * ferramenta nova em `CanvasTool` sem entrada aqui não compila.
 */
export const TOOL_INVENTORY: Record<CanvasTool, InventoryElement> = {
  ...workspaceTools,
  ...agentTools,
  notifications: notificationsTool,
  notionTasks: notionTasksTool,
}

/** O resto da superfície: moldura, arestas, gaveta, menus, modais e overlays. */
export const SURFACE_INVENTORY: InventoryElement[] = [
  ...chromeSurfaces,
  ...nodeSurfaces,
  ...terminalSurfaces,
  ...workspaceToolSurfaces,
  ...agentToolSurfaces,
  ...overlaySurfaces,
]

export function listInventoryElements(): InventoryElement[] {
  return [...Object.values(NODE_INVENTORY), ...Object.values(TOOL_INVENTORY), ...SURFACE_INVENTORY]
}

const LAYER_TITLES: Record<InventoryLayer, string> = {
  chrome: 'Moldura do canvas',
  node: 'Blocos',
  edge: 'Arestas e grupos',
  terminal: 'Terminal e processo',
  panel: 'Ferramentas e painéis',
  modal: 'Modais',
  overlay: 'Overlays e avisos',
}

const LAYER_ORDER: InventoryLayer[] = ['chrome', 'node', 'edge', 'terminal', 'panel', 'modal', 'overlay']

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function testLabel(ref: InventoryTestRef): string {
  return ref.check ? `\`${ref.file}\` → \`${ref.check}\`` : `\`${ref.file}\``
}

function list(items: string[], empty: string): string {
  return items.length ? items.map((item) => `\`${item}\``).join(', ') : empty
}

function renderElement(element: InventoryElement): string {
  const lines: string[] = []
  lines.push(`### ${element.name}`, '')
  lines.push(`- **ID:** \`${element.id}\` · **Dono:** \`${element.owner}\``)
  lines.push(`- **Persistência:** ${element.persistence.map(cell).join('; ')}`)
  lines.push(`- **IPC:** ${list(element.ipc, 'nenhum')}`)
  lines.push(`- **Depende de:** ${list(element.dependsOn, 'nada além das props')}`)
  lines.push(`- **Sobreposição:** ${cell(element.overlap)}`)
  lines.push(`- **Testes:** ${element.tests.length ? element.tests.map(testLabel).join(', ') : 'nenhum'}`)
  lines.push('', '| Estado | Quando |', '| --- | --- |')
  for (const state of INVENTORY_STATES) {
    const when = element.states[state]
    if (when) lines.push(`| ${state} | ${cell(when)} |`)
  }
  if (element.controls.length) {
    lines.push('', '| Controle | Gatilho | Efeito | Falha conhecida | Teste |', '| --- | --- | --- | --- | --- |')
    for (const control of element.controls) {
      const trigger = control.trigger ?? 'clique'
      const disabled = control.disabledWhen ? ` (desabilitado: ${control.disabledWhen})` : ''
      lines.push(
        `| \`${cell(control.locator)}\` (${control.kind}) | ${cell(trigger)} | ${cell(control.effect)}${cell(disabled)} | ${cell(control.failure)} | ${control.test ? testLabel(control.test) : '—'} |`,
      )
    }
  } else {
    lines.push('', 'Sem controle próprio: as ações vêm de outros elementos.')
  }
  if (element.gaps.length) {
    lines.push('', '| Lacuna | Risco | Task |', '| --- | --- | --- |')
    for (const gap of element.gaps) lines.push(`| ${cell(gap.what)} | ${gap.risk} | \`${gap.task}\` |`)
  }
  return lines.join('\n')
}

/** Gera `docs/projeto/INVENTARIO-CANVAS.md`; o teste trava o arquivo neste texto. */
export function renderCanvasInventoryMarkdown(): string {
  const elements = listInventoryElements()
  const controls = elements.flatMap((element) => element.controls)
  const testedControls = controls.filter((control) => control.test).length
  const gaps = elements.flatMap((element) => element.gaps)
  const byRisk = (risk: string) => gaps.filter((gap) => gap.risk === risk).length
  const untested = elements.filter((element) => element.tests.length === 0).length
  const tasks = [...new Set(gaps.map((gap) => gap.task))].sort()

  const out: string[] = [
    '# Inventário operacional do canvas',
    '',
    '<!-- Gerado por src/features/canvas/inventory/canvas-inventory.ts. Não edite à mão: rode `npm run docs:inventario-canvas` em app/. -->',
    '',
    'Contrato visual/E2E da superfície principal. Cada elemento diz quem é o dono, em que estado',
    'pode estar e por quê, o que cada controle faz e como falha, onde o estado persiste, que',
    'canais IPC usa, que testes o cobrem e quais lacunas estão abertas, cada uma com task.',
    '',
    '## Como o contrato é conferido',
    '',
    '`canvas-inventory.test.ts` (vitest) falha quando:',
    '',
    '- um tipo de bloco (`CanvasNodeType`) ou uma ferramenta (`CanvasTool`) não tem entrada (o `tsc` já recusa);',
    '- um arquivo de `src/features/canvas/components/` com controle não é dono de nenhum elemento;',
    '- o número de controles declarados de um arquivo difere do que o código tem (`<button`, `role="button"`/`role="menuitem"`, `<FelixoSelect`, `<FelixoToggle`, `<ActivityRailButton`);',
    '- o localizador de um controle não aparece no arquivo dono, ou falta efeito ou falha conhecida;',
    '- um canal IPC citado não existe em `electron/preload.cjs`;',
    '- um teste citado não existe, ou a função de smoke citada não está no script;',
    '- uma lacuna não aponta uma task do Notion;',
    '- este documento não bate com os dados.',
    '',
    'Ferramenta, bloco ou botão novo: acrescente a entrada em `src/features/canvas/inventory/data/` e rode',
    '`npm run docs:inventario-canvas` (em `app/`) para regenerar este arquivo.',
    '',
    '**Escopo.** Tudo que o canvas renderiza. Os modais de `features/chat` ficam de fora: o chat é',
    'legado e o canvas não os abre. "Presente no código" não é "funcionando": o efeito de cada',
    'controle foi lido no código e, quando há teste, o teste é citado na linha. Controle sem teste',
    'é efeito lido, não visto rodando.',
    '',
    '## Números',
    '',
    `- **Elementos:** ${elements.length} (${Object.keys(NODE_INVENTORY).length} blocos, ${Object.keys(TOOL_INVENTORY).length} ferramentas, ${SURFACE_INVENTORY.length} outras superfícies)`,
    `- **Controles:** ${controls.length}, dos quais ${testedControls} com teste específico`,
    `- **Elementos sem nenhum teste:** ${untested}`,
    `- **Lacunas:** ${gaps.length} (alto ${byRisk('alto')}, médio ${byRisk('médio')}, baixo ${byRisk('baixo')}), em ${tasks.length} tasks`,
  ]

  for (const layer of LAYER_ORDER) {
    const inLayer = elements.filter((element) => element.layer === layer)
    if (!inLayer.length) continue
    out.push('', `## ${LAYER_TITLES[layer]}`)
    for (const element of inLayer) out.push('', renderElement(element))
  }

  out.push('', '## Tasks das lacunas', '')
  for (const task of tasks) {
    const count = gaps.filter((gap) => gap.task === task).length
    out.push(`- \`${task}\` — ${count} ${count === 1 ? 'lacuna' : 'lacunas'}`)
  }
  return `${out.join('\n')}\n`
}

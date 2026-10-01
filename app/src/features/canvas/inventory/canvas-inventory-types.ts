/**
 * Tipos do inventário operacional do canvas.
 *
 * O inventário é o contrato visual/E2E da superfície principal: cada elemento
 * tem dono (arquivo), estados com a condição que os produz, controles com o
 * efeito verificável (ou o erro conhecido), persistência, canais IPC, testes e
 * lacunas com task. `canvas-inventory.test.ts` confere tudo isso contra o
 * código, e o documento `docs/projeto/INVENTARIO-CANVAS.md` é gerado daqui.
 */

/** Classificação de estado pedida pela task de inventário (01/10/2026). */
export const INVENTORY_STATES = [
  'normal',
  'loading',
  'empty',
  'error',
  'pending',
  'success',
  'disabled',
  'denied',
] as const

export type InventoryState = (typeof INVENTORY_STATES)[number]

/** Camada em que o elemento vive: diz onde procurar quando ele falha. */
export type InventoryLayer =
  | 'node'
  | 'edge'
  | 'terminal'
  | 'panel'
  | 'chrome'
  | 'modal'
  | 'overlay'

/**
 * Tipo do controle, na mesma ordem dos padrões que o teste conta no arquivo
 * dono: `<button`, `role="button"`/`role="menuitem"`, `<FelixoSelect`,
 * `<FelixoToggle` e `<ActivityRailButton`.
 */
export type InventoryControlKind = 'button' | 'role' | 'select' | 'toggle' | 'rail'

export type InventoryControl = {
  /** Trecho literal do arquivo dono que identifica o controle (aria-label, title, texto visível ou handler). */
  locator: string
  kind: InventoryControlKind
  /** Como se aciona, quando não é um clique simples (atalho, menu de contexto, arrasto). */
  trigger?: string
  /** O que acontece, dito de um jeito que um teste ou uma pessoa consegue conferir. */
  effect: string
  /** Erro, recusa ou fallback conhecido; "sem falha própria" quando o efeito é só estado local. */
  failure: string
  /** Condição em que o controle fica desabilitado ou some. */
  disabledWhen?: string
  /** Teste que exercita este controle especificamente, quando existe. */
  test?: InventoryTestRef
}

/**
 * Referência a teste. `check` aponta uma função de um script de smoke
 * (`scripts/canvas-smoke*.cjs`); sem `check`, o arquivo inteiro é o teste.
 */
export type InventoryTestRef = {
  /** Caminho relativo a `app/`. */
  file: string
  check?: string
}

export type InventoryRisk = 'baixo' | 'médio' | 'alto'

export type InventoryGap = {
  what: string
  risk: InventoryRisk
  /** ID da task do Notion que cobre a lacuna. */
  task: string
}

export type InventoryElement = {
  /** Identificador estável, em kebab-case, único no inventário. */
  id: string
  name: string
  layer: InventoryLayer
  /** Arquivo dono, relativo a `app/`. */
  owner: string
  /** Condição de cada estado aplicável; `normal` é obrigatório. */
  states: Partial<Record<InventoryState, string>> & { normal: string }
  /** Um controle por ocorrência contada no arquivo dono (o teste exige a contagem exata). */
  controls: InventoryControl[]
  /** Onde o estado sobrevive: canvas salvo, chave de storage, processo principal ou "nenhuma". */
  persistence: string[]
  /** Canais expostos no preload que o elemento usa. */
  ipc: string[]
  /** Hooks, contextos e stores de que o elemento depende. */
  dependsOn: string[]
  tests: InventoryTestRef[]
  gaps: InventoryGap[]
  /** Camada z, posição e risco de cobrir ou ser coberto por outra superfície. */
  overlap: string
}

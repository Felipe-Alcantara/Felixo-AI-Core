/**
 * Gatilho de novidade pelo canvas: os tipos de bloco cuja chegada ao canvas pode
 * anunciar uma novidade, e o formato da chave de tipos que o canvas envia.
 *
 * Mora fora do catálogo porque o canvas precisa saber, no próprio chunk, se vale
 * calcular os tipos presentes a cada mudança de nós; o catálogo vem no chunk
 * preguiçoso da store. `ONBOARDING_FEATURES` só aceita um gatilho `canvas` com um
 * tipo desta lista (guarda de compilação), e o U-cat confere que a lista é
 * exatamente a dos gatilhos do catálogo. Lista vazia: nenhuma feature de canvas
 * existe, e o canvas não calcula nada.
 */
export const CANVAS_TRIGGER_NODE_TYPES = Object.freeze([] as const)

export type CanvasTriggerNodeType = (typeof CANVAS_TRIGGER_NODE_TYPES)[number]

/** O canvas só calcula e envia a chave de tipos quando algum gatilho existe. */
export const WATCHES_CANVAS_NODE_TYPES: boolean = CANVAS_TRIGGER_NODE_TYPES.length > 0

/** Lista ordenada e sem repetição a partir da chave `"file,terminal"` que o canvas envia. */
export function parseNodeTypesKey(key: string): string[] {
  return [...new Set(key.split(',').map((item) => item.trim()).filter(Boolean))].sort()
}

/** Chave ordenada e sem repetição dos tipos presentes: o formato que o canvas envia e `parseNodeTypesKey` lê. */
export function nodeTypesKeyOf(types: Iterable<string | null | undefined>): string {
  const present = [...types].filter((type): type is string => typeof type === 'string' && type.trim().length > 0)
  return [...new Set(present.map((type) => type.trim()))].sort().join(',')
}

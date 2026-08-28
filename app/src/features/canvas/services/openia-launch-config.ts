/**
 * DTOs e regras pequenas do launcher Openia.
 *
 * Os valores chegam do contrato `openia list --json`/`models --json`; este
 * módulo só valida o formato recebido e monta a chamada não interativa. A
 * lista de interfaces não é repetida aqui.
 */

export type OpeniaInterfaceDefinition = {
  key: string
  name: string
  description: string
  ecosystem: string
  command: string
  homepage: string
  modelPrefix: string
  supportsModelSelection: boolean
  modelSelection: 'automatic' | 'inside'
  supportsSubscription: boolean
  isCodeAgent: boolean
  emoji: string
}

export type OpeniaModel = {
  id: string
  vendor: string
  name: string
  completionPrice: number
}

const MAX_INTERFACE_ITEMS = 100
const MAX_MODEL_ITEMS = 2000

export function normalizeOpeniaInterfaces(value: unknown): OpeniaInterfaceDefinition[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const result: OpeniaInterfaceDefinition[] = []

  for (const raw of value) {
    if (!isRecord(raw)) continue
    const key = stringValue(raw.key, 80)
    const name = stringValue(raw.name, 120)
    if (!key || !name || seen.has(key)) continue
    seen.add(key)
    result.push({
      key,
      name,
      description: stringValue(raw.description, 500),
      ecosystem: stringValue(raw.ecosystem, 30),
      command: stringValue(raw.command, 120),
      homepage: stringValue(raw.homepage, 500),
      modelPrefix: stringValue(raw.modelPrefix, 80),
      supportsModelSelection: raw.supportsModelSelection === true,
      modelSelection: raw.modelSelection === 'automatic' ? 'automatic' : 'inside',
      supportsSubscription: raw.supportsSubscription === true,
      isCodeAgent: raw.isCodeAgent === true,
      emoji: stringValue(raw.emoji, 20),
    })
    if (result.length >= MAX_INTERFACE_ITEMS) break
  }

  return result
}

export function normalizeOpeniaModels(value: unknown): OpeniaModel[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const result: OpeniaModel[] = []

  for (const raw of value) {
    if (!isRecord(raw)) continue
    const id = stringValue(raw.id, 300)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const completionPrice = typeof raw.completionPrice === 'number' && Number.isFinite(raw.completionPrice)
      ? Math.max(0, raw.completionPrice)
      : 0
    result.push({
      id,
      vendor: stringValue(raw.vendor, 120) || id.split('/', 1)[0],
      name: stringValue(raw.name, 300) || id,
      completionPrice,
    })
    if (result.length >= MAX_MODEL_ITEMS) break
  }

  return result
}

/** Monta a execução direta do Openia; nenhum segredo entra nos argumentos. */
export function buildOpeniaRunArgs(
  interfaceKey: string,
  model: string,
  directory?: string,
): string[] | null {
  const normalizedInterface = interfaceKey.trim()
  if (!normalizedInterface) return null

  const normalizedModel = model.trim()
  const normalizedDirectory = directory?.trim()
  return [
    'run',
    normalizedInterface,
    '--provider',
    ...(normalizedModel ? ['--model', normalizedModel] : ['--no-model']),
    ...(normalizedDirectory ? ['--dir', normalizedDirectory] : []),
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

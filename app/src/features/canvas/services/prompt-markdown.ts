import {
  AUTOMATION_SCOPES,
  type AutomationDefinition,
  type AutomationScope,
} from '../../shared/types/automations'

/**
 * Prompt do catálogo <-> arquivo `.md`: cabeçalho YAML (id, name, scope,
 * description, updatedAt, origem) e o texto do prompt como corpo, intacto.
 * Só formato: nada aqui toca disco ou UI, para a ida e volta ter teste.
 *
 * O `id` é o que liga o arquivo ao prompt de origem: importar com o mesmo id
 * atualiza o mesmo prompt (e o histórico de inserções não perde a referência).
 */

/** De onde o prompt veio na hora de exportar; só informativo, a importação ignora. */
export type PromptOrigin = 'catalogo' | 'catalogo-editado' | 'personalizado'

export const PROMPT_FILE_EXTENSION = 'md'

export type ParsedPromptFile = {
  /** Ausente quando o arquivo não traz `id`: a importação cria um novo. */
  id?: string
  name: string
  description: string
  prompt: string
  scope: AutomationScope
}

export type PromptFileParseResult =
  | { ok: true; prompt: ParsedPromptFile }
  | { ok: false; message: string }

export function serializePromptMarkdown(
  prompt: AutomationDefinition,
  origin: PromptOrigin,
): string {
  const header = [
    `id: ${JSON.stringify(prompt.id)}`,
    `name: ${JSON.stringify(prompt.name)}`,
    `scope: ${prompt.scope}`,
    `description: ${JSON.stringify(prompt.description ?? '')}`,
    `updatedAt: ${JSON.stringify(prompt.updatedAt ?? '')}`,
    `origem: ${origin}`,
  ]
  return `---\n${header.join('\n')}\n---\n\n${prompt.prompt}\n`
}

/** Nome de arquivo seguro e legível: `<nome>.md`, sem separador de caminho nem caractere proibido no Windows. */
export function promptFileName(prompt: Pick<AutomationDefinition, 'name' | 'id'>): string {
  const base = prompt.name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || prompt.id.replace(/[^\w-]+/g, '-')}.${PROMPT_FILE_EXTENSION}`
}

/** Dá um nome único a cada arquivo de um lote (dois prompts com o mesmo título viram `x.md` e `x-2.md`). */
export function uniquePromptFileNames(
  prompts: Array<Pick<AutomationDefinition, 'name' | 'id'>>,
): string[] {
  const used = new Set<string>()
  return prompts.map((prompt) => {
    const name = promptFileName(prompt)
    const stem = name.slice(0, -(PROMPT_FILE_EXTENSION.length + 1))
    let candidate = name
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) {
      candidate = `${stem}-${n}.${PROMPT_FILE_EXTENSION}`
    }
    used.add(candidate.toLowerCase())
    return candidate
  })
}

function readHeaderValue(raw: string): string {
  const value = raw.trim()
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (typeof parsed === 'string') return parsed
    } catch {
      // Texto digitado à mão com aspas soltas: vale como veio.
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value
}

/**
 * Lê um `.md` exportado (ou escrito à mão). Sem cabeçalho, o arquivo inteiro é o
 * texto do prompt e o nome vem do arquivo. `fallbackName` é o nome do arquivo.
 */
export function parsePromptMarkdown(
  source: string,
  fallbackName: string,
): PromptFileParseResult {
  const text = (source.charCodeAt(0) === 0xfeff ? source.slice(1) : source).replace(/\r\n?/g, '\n')
  const fields = new Map<string, string>()
  let body = text

  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---', 3)
    const closeLineEnd = end === -1 ? -1 : text.indexOf('\n', end + 1)
    const closes = end !== -1 && (closeLineEnd === -1 ? text.length : closeLineEnd) === end + 4
    if (!closes) return { ok: false, message: 'O cabeçalho do arquivo não foi fechado com "---".' }
    for (const line of text.slice(4, end + 1).split('\n')) {
      const match = /^([A-Za-z]+):(.*)$/.exec(line)
      if (match) fields.set(match[1], readHeaderValue(match[2]))
    }
    body = closeLineEnd === -1 ? '' : text.slice(closeLineEnd + 1)
  }

  const prompt = body.trim()
  if (!prompt) return { ok: false, message: 'O arquivo não tem o texto do prompt.' }

  const scope = fields.get('scope') || 'chat'
  if (!(AUTOMATION_SCOPES as string[]).includes(scope)) {
    return {
      ok: false,
      message: `Tópico "${scope}" não existe. Use um destes: ${AUTOMATION_SCOPES.join(', ')}.`,
    }
  }

  const fileStem = fallbackName.replace(/\.[^./\\]+$/, '').trim()
  return {
    ok: true,
    prompt: {
      id: fields.get('id')?.trim() || undefined,
      name: fields.get('name')?.trim() || fileStem || 'Prompt importado',
      description: fields.get('description') ?? '',
      prompt,
      scope: scope as AutomationScope,
    },
  }
}

export type PromptImportStatus = 'new' | 'changed' | 'unchanged' | 'invalid'

export type PromptImportRow = {
  fileName: string
  status: PromptImportStatus
  /** Quando `invalid`, o motivo; senão, o texto do aviso, se houver. */
  message?: string
  parsed?: ParsedPromptFile
  /** O prompt do catálogo que o `id` do arquivo atualizaria. */
  existing?: AutomationDefinition
}

/** Prévia: o que cada arquivo faria, sem gravar nada. */
export function planPromptImport(
  files: Array<{ name: string; content: string }>,
  visible: AutomationDefinition[],
): PromptImportRow[] {
  const byId = new Map(visible.map((prompt) => [prompt.id, prompt]))
  const seenIds = new Set<string>()
  return files.map(({ name, content }) => {
    const result = parsePromptMarkdown(content, name)
    if (!result.ok) return { fileName: name, status: 'invalid', message: result.message }
    const parsed = result.prompt
    if (parsed.id && seenIds.has(parsed.id)) {
      return {
        fileName: name,
        status: 'invalid',
        message: 'Outro arquivo desta importação tem o mesmo id.',
      }
    }
    if (parsed.id) seenIds.add(parsed.id)
    const existing = parsed.id ? byId.get(parsed.id) : undefined
    if (!existing) return { fileName: name, status: 'new', parsed }
    const same =
      existing.name === parsed.name &&
      existing.scope === parsed.scope &&
      (existing.description ?? '') === parsed.description &&
      existing.prompt.trim() === parsed.prompt
    return { fileName: name, status: same ? 'unchanged' : 'changed', parsed, existing }
  })
}

/** O que fazer com um arquivo da prévia. `both` mantém o prompt atual e cria um novo ao lado. */
export type PromptImportAction = 'create' | 'overwrite' | 'both' | 'skip'

export function defaultImportAction(row: PromptImportRow): PromptImportAction {
  if (row.status === 'new') return 'create'
  if (row.status === 'changed') return 'overwrite'
  return 'skip'
}

/** Monta o prompt a gravar para uma ação; `undefined` quando a ação é pular. */
export function buildImportedPrompt(
  row: PromptImportRow,
  action: PromptImportAction,
  createId: () => string,
  now: string,
): AutomationDefinition | undefined {
  const parsed = row.parsed
  if (!parsed || action === 'skip') return undefined
  const keepId = action === 'overwrite' || (action === 'create' && parsed.id)
  return {
    id: keepId && parsed.id ? parsed.id : createId(),
    name: action === 'both' ? `${parsed.name} (importado)` : parsed.name,
    description: parsed.description,
    prompt: parsed.prompt,
    scope: parsed.scope,
    createdAt: action === 'overwrite' ? row.existing?.createdAt ?? now : now,
    updatedAt: now,
  }
}

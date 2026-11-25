/**
 * Pastas liberadas para um agente (substitui o MCP Filesystem pelo recurso nativo da CLI).
 * Só montagem e validação de argumentos; o seletor de pasta e a UI ficam fora.
 *
 * Padrão: lista vazia, ou seja, nenhum acesso além do que a CLI já tem.
 */

export type AgentFolderMode = 'leitura' | 'escrita'
export type AgentFolder = { path: string; mode: AgentFolderMode }

export const AGENT_FOLDERS_MAX = 10

const SYSTEM_FOLDERS =
  /^(?:[a-z]:\/(?:windows|program files(?: \(x86\))?|programdata)\/|\/(?:etc|bin|sbin|usr|var|system|library|boot|proc|dev)\/)/i

function normalize(rawPath: string): string {
  return rawPath.trim().replace(/\\/g, '/').replace(/\/+$/, '')
}

/** Motivo de recusa em português, ou null se a pasta pode ser liberada. */
export function folderRejection(rawPath: string): string | null {
  const path = normalize(rawPath)
  if (!path) return rawPath.trim() === '/' ? 'Pasta larga demais (raiz do disco).' : 'Escolha uma pasta.'
  if (path.startsWith('//')) return 'Pasta de rede não é aceita: mapeie uma letra de unidade.'
  if (/^[a-z]:$/i.test(path)) return 'Pasta larga demais (raiz do disco).'
  if (!/^(?:[a-z]:\/|\/)/i.test(path)) return 'Use o caminho completo da pasta.'
  if (SYSTEM_FOLDERS.test(`${path}/`)) return 'Pasta do sistema não é aceita.'
  if (path.split('/').includes('..')) return 'Caminho com ".." não é aceito.'
  return null
}

/** `//c/Users/x` é a grafia absoluta das regras de permissão do Claude. */
function claudeRulePath(rawPath: string): string {
  const path = normalize(rawPath)
  const drive = /^([a-z]):\/(.*)$/i.exec(path)
  return drive ? `//${drive[1].toLowerCase()}/${drive[2]}` : `/${path}`
}

/** Argumentos do Claude: `--add-dir` por pasta; "leitura" nega Edit nela. Pastas inválidas saem. */
export function buildClaudeFolderArgs(folders: readonly AgentFolder[] | undefined): string[] {
  const valid = (folders ?? []).filter((f) => folderRejection(f.path) === null).slice(0, AGENT_FOLDERS_MAX)
  // Forma `--flag=valor`: as flags são variádicas e a outra forma engoliria um argumento posicional depois.
  const args = valid.map((f) => `--add-dir=${f.path.trim()}`)
  for (const f of valid) {
    if (f.mode === 'leitura') args.push(`--disallowedTools=Edit(${claudeRulePath(f.path)}/**)`)
  }
  return args
}

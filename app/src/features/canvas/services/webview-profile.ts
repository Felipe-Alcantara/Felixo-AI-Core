import { readFrameColor } from '../components/frame-colors'
import type { FrameColor } from '../types'

/**
 * Perfil do navegador interno (blocos Página Web): uma partição própria do
 * Electron por perfil, então logins de perfis diferentes não se misturam.
 *
 * O perfil "Padrão" é a partição que JÁ existia (`persist:felixo-webview`):
 * blocos antigos, sem `profileId`, continuam nela e ninguém é deslogado.
 */

export const DEFAULT_WEBVIEW_PROFILE_ID = 'default'
export const DEFAULT_WEBVIEW_PARTITION = 'persist:felixo-webview'
const PARTITION_PREFIX = 'persist:felixo-webview-'
export const WEBVIEW_PROFILE_NAME_MAX = 40
// Mesma regra do processo principal (`webview-profile-partition.cjs`): o id
// entra num nome de partição, então só passa o que casa com isto.
const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,39}$/

export type WebviewProfile = {
  id: string
  name: string
  color?: FrameColor
}

export const DEFAULT_WEBVIEW_PROFILE: WebviewProfile = {
  id: DEFAULT_WEBVIEW_PROFILE_ID,
  name: 'Padrão',
}

export function isCustomProfileId(id: unknown): id is string {
  return typeof id === 'string' && PROFILE_ID_PATTERN.test(id) && id !== DEFAULT_WEBVIEW_PROFILE_ID
}

/** Partição do webview de um perfil; id desconhecido/inválido cai no Padrão. */
export function partitionForWebviewProfile(profileId: unknown): string {
  return isCustomProfileId(profileId) ? `${PARTITION_PREFIX}${profileId}` : DEFAULT_WEBVIEW_PARTITION
}

/** Valida o que veio do banco; o que a versão atual não entende some. */
export function normalizeWebviewProfile(value: unknown): WebviewProfile | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!isCustomProfileId(raw.id) || !name) return null
  const color = readFrameColor(raw.color)
  return { id: raw.id, name: name.slice(0, WEBVIEW_PROFILE_NAME_MAX), ...(color ? { color } : {}) }
}

/** O Padrão sempre primeiro, depois os da pessoa. */
export function withDefaultProfile(custom: readonly WebviewProfile[]): WebviewProfile[] {
  return [DEFAULT_WEBVIEW_PROFILE, ...custom]
}

export type WebviewProfileDisplay = {
  name: string
  color?: FrameColor
  /** default = sem perfil/Padrão · loading = lista ainda não chegou · removed = perfil excluído. */
  state: 'default' | 'custom' | 'loading' | 'removed'
}

/**
 * Como mostrar o perfil de um bloco. SÓ apresentação: a partição do webview
 * vem direto do `profileId` do bloco (`partitionForWebviewProfile`), nunca da
 * lista. Se viesse da lista, um bloco de um perfil "Trabalho" abriria primeiro
 * na sessão Padrão (lista ainda carregando) e remontaria depois — a página
 * carregaria por um instante na sessão errada, logada como outra pessoa.
 *
 * Bloco de um perfil já excluído mantém a partição (agora vazia, sem login) e
 * aparece como "Perfil removido" até a pessoa escolher outro: nunca é
 * empurrado em silêncio para a sessão Padrão.
 */
export function describeWebviewProfile(
  profileId: unknown,
  custom: readonly WebviewProfile[],
  loaded: boolean,
): WebviewProfileDisplay {
  if (!isCustomProfileId(profileId)) return { name: DEFAULT_WEBVIEW_PROFILE.name, state: 'default' }
  const found = custom.find((profile) => profile.id === profileId)
  if (found) return { name: found.name, ...(found.color ? { color: found.color } : {}), state: 'custom' }
  return loaded ? { name: 'Perfil removido', state: 'removed' } : { name: 'Perfil…', state: 'loading' }
}

/** Mensagem de erro para um nome de perfil, ou `null` quando serve. */
export function validateWebviewProfileName(
  name: string,
  existing: readonly WebviewProfile[],
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Dê um nome ao perfil.'
  if (trimmed.length > WEBVIEW_PROFILE_NAME_MAX) {
    return `O nome pode ter até ${WEBVIEW_PROFILE_NAME_MAX} caracteres.`
  }
  const lower = trimmed.toLowerCase()
  if (lower === DEFAULT_WEBVIEW_PROFILE.name.toLowerCase() || lower === 'default' || lower === 'padrao') {
    return '"Padrão" é o perfil que já existe.'
  }
  if (existing.some((profile) => profile.name.toLowerCase() === lower)) {
    return `Já existe um perfil chamado "${trimmed}".`
  }
  return null
}

/** Id novo e seguro: parte legível do nome + sufixo aleatório (o nome pode repetir depois de excluído). */
export function newWebviewProfileId(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${slug || 'perfil'}-${suffix}`
}

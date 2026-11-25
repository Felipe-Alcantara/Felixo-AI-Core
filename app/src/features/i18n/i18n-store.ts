import { EN } from './messages.en'
import { PT_BR, type MessageKey } from './messages.pt-BR'

export type AppLocale = 'pt-BR' | 'en'

export const LOCALES: readonly AppLocale[] = ['pt-BR', 'en']
export const DEFAULT_LOCALE: AppLocale = 'pt-BR'
export const LOCALE_STORAGE_KEY = 'felixo-ai-core.locale'

const CATALOGS: Record<AppLocale, Partial<Record<MessageKey, string>>> = { 'pt-BR': PT_BR, en: EN }

let current: AppLocale = DEFAULT_LOCALE
const listeners = new Set<() => void>()

export function isAppLocale(value: unknown): value is AppLocale {
  return (LOCALES as readonly unknown[]).includes(value)
}

export function getLocale(): AppLocale {
  return current
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** O tutorial e os leitores de tela leem o idioma do `lang` do documento. */
function applyDocumentLang(locale: AppLocale) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Lê a escolha salva. Sem escolha, fica pt-BR: o idioma do sistema não decide sozinho. */
export function loadLocale(storage: Pick<Storage, 'getItem'> | null = safeStorage()): AppLocale {
  try {
    const saved = storage?.getItem(LOCALE_STORAGE_KEY)
    return isAppLocale(saved) ? saved : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

export function setLocale(locale: AppLocale, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Sem localStorage o idioma vale só para esta sessão.
  }
  if (locale === current) return
  current = locale
  applyDocumentLang(locale)
  listeners.forEach((listener) => listener())
}

/** Chamada uma vez antes do primeiro render (main.tsx). */
export function initLocale() {
  current = loadLocale()
  // pt-BR já é o `lang` do index.html; não mexer evita atropelar o `lang` forçado dos smokes.
  if (current !== DEFAULT_LOCALE) applyDocumentLang(current)
}

/** Traduz `key` para `locale`, com fallback no pt-BR e `{nome}` substituído por `params`. */
export function translate(
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
  locale: AppLocale = current,
): string {
  const text = CATALOGS[locale][key] ?? PT_BR[key]
  return params ? text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match)) : text
}

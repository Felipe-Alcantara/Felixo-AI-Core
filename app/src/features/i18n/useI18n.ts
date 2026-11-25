import { useCallback, useSyncExternalStore } from 'react'
import { getLocale, subscribeLocale, translate } from './i18n-store'
import type { MessageKey } from './messages.pt-BR'

/** Idioma atual e `t`; o componente rerenderiza quando o idioma muda. */
export function useI18n() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale)
  const t = useCallback(
    (key: MessageKey, params?: Readonly<Record<string, string | number>>) => translate(key, params, locale),
    [locale],
  )
  return { locale, t }
}

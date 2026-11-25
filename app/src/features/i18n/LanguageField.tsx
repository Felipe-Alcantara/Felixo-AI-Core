import { Languages } from 'lucide-react'
import { FelixoSelect } from '../shared/components/FelixoSelect'
import { isAppLocale, setLocale } from './i18n-store'
import { useI18n } from './useI18n'

/** Seletor de idioma de Configurações. */
export function LanguageField() {
  const { locale, t } = useI18n()
  const label = t('idioma.rotulo')

  return (
    <div className="block text-xs text-zinc-400">
      <span className="mb-1 flex items-center gap-1.5 text-zinc-300">
        <Languages size={13} aria-hidden="true" />
        {label}
      </span>
      <FelixoSelect
        value={locale}
        options={[
          { value: 'pt-BR', label: t('idioma.opcao.pt-BR') },
          { value: 'en', label: t('idioma.opcao.en') },
        ]}
        onChange={(value) => {
          if (isAppLocale(value)) setLocale(value)
        }}
        aria-label={label}
      />
    </div>
  )
}

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'vitest'
import { EN } from './messages.en'
import { PT_BR } from './messages.pt-BR'
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, loadLocale, setLocale, translate } from './i18n-store'

afterEach(() => setLocale(DEFAULT_LOCALE, null))

describe('i18n', () => {
  it('o padrão é pt-BR e a escolha salva é respeitada', () => {
    assert.equal(loadLocale({ getItem: () => null }), 'pt-BR')
    assert.equal(loadLocale({ getItem: (k) => (k === LOCALE_STORAGE_KEY ? 'en' : null) }), 'en')
    assert.equal(loadLocale({ getItem: () => 'fr' }), 'pt-BR')
  })

  it('traduz por locale', () => {
    assert.equal(translate('idioma.rotulo', undefined, 'en'), 'Language')
    assert.equal(translate('idioma.rotulo', undefined, 'pt-BR'), 'Idioma')
  })

  it('o inglês só tem chaves que existem no pt-BR', () => {
    for (const key of Object.keys(EN)) assert.ok(key in PT_BR, key)
  })

  it('setLocale grava, troca o lang do documento e a tradução corrente', () => {
    const saved: string[] = []
    setLocale('en', { setItem: (_k, v) => void saved.push(v) })
    assert.deepEqual(saved, ['en'])
    assert.equal(translate('autostart.titulo'), 'Start with the system')
    if (typeof document !== 'undefined') assert.equal(document.documentElement.lang, 'en')
  })
})

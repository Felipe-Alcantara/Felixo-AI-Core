import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEBVIEW_PARTITION,
  isCustomProfileId,
  newWebviewProfileId,
  normalizeWebviewProfile,
  partitionForWebviewProfile,
  describeWebviewProfile,
  validateWebviewProfileName,
  withDefaultProfile,
  type WebviewProfile,
} from './webview-profile'

const require = createRequire(import.meta.url)
const main = require('../../../../electron/services/webview-profile-partition.cjs') as {
  isValidProfileId: (id: unknown) => boolean
  partitionForProfile: (id: string) => string
}

const TRABALHO: WebviewProfile = { id: 'trabalho-ab12', name: 'Trabalho', color: 'sky' }

describe('partição por perfil', () => {
  it('bloco antigo (sem perfil) e o Padrão ficam na partição que já existia — ninguém é deslogado', () => {
    expect(DEFAULT_WEBVIEW_PARTITION).toBe('persist:felixo-webview')
    expect(partitionForWebviewProfile(undefined)).toBe('persist:felixo-webview')
    expect(partitionForWebviewProfile('default')).toBe('persist:felixo-webview')
  })

  it('perfil da pessoa ganha partição persistente própria', () => {
    expect(partitionForWebviewProfile('trabalho-ab12')).toBe('persist:felixo-webview-trabalho-ab12')
    expect(partitionForWebviewProfile('trabalho-ab12')).not.toBe(partitionForWebviewProfile('pessoal-cd34'))
  })

  it('id inválido nunca vira partição própria (cai no Padrão)', () => {
    for (const ruim of ['', '../x', 'A B', 'persist:outra', null, 3]) {
      expect(partitionForWebviewProfile(ruim)).toBe(DEFAULT_WEBVIEW_PARTITION)
    }
  })

  it('o renderer e o processo principal concordam sobre id válido e partição (paridade)', () => {
    const amostras = ['trabalho-ab12', 'pessoal-cd34', 'default', '', '../x', 'a', 'x'.repeat(41), 'Maiusc', '-abc', 'persist:x']
    for (const id of amostras) {
      expect(isCustomProfileId(id), id).toBe(main.isValidProfileId(id))
      if (main.isValidProfileId(id) || id === 'default') {
        expect(partitionForWebviewProfile(id), id).toBe(main.partitionForProfile(id))
      }
    }
  })
})

describe('describeWebviewProfile', () => {
  it('bloco sem perfil (ou com o id default) é o Padrão', () => {
    expect(describeWebviewProfile(undefined, [TRABALHO], true)).toEqual({ name: 'Padrão', state: 'default' })
    expect(describeWebviewProfile('default', [], false)).toEqual({ name: 'Padrão', state: 'default' })
  })
  it('mostra nome e cor do perfil da lista', () => {
    expect(describeWebviewProfile('trabalho-ab12', [TRABALHO], true)).toEqual({ name: 'Trabalho', color: 'sky', state: 'custom' })
  })
  it('lista ainda carregando: "loading", nunca "removido" nem Padrão', () => {
    expect(describeWebviewProfile('trabalho-ab12', [], false).state).toBe('loading')
  })
  it('perfil excluído aparece como removido em vez de virar Padrão em silêncio', () => {
    expect(describeWebviewProfile('excluido-9999', [TRABALHO], true)).toEqual({ name: 'Perfil removido', state: 'removed' })
  })
  it('withDefaultProfile põe o Padrão primeiro', () => {
    expect(withDefaultProfile([TRABALHO]).map((p) => p.id)).toEqual(['default', 'trabalho-ab12'])
  })
})

describe('normalizeWebviewProfile', () => {
  it('aceita um perfil íntegro e descarta cor fora da paleta', () => {
    expect(normalizeWebviewProfile(TRABALHO)).toEqual(TRABALHO)
    expect(normalizeWebviewProfile({ ...TRABALHO, color: '#ff0000' })).toEqual({ id: 'trabalho-ab12', name: 'Trabalho' })
  })
  it('recusa o Padrão gravado, id inválido, nome vazio e lixo', () => {
    expect(normalizeWebviewProfile({ id: 'default', name: 'Padrão' })).toBeNull()
    expect(normalizeWebviewProfile({ id: '../x', name: 'X' })).toBeNull()
    expect(normalizeWebviewProfile({ id: 'ok-1234', name: '  ' })).toBeNull()
    expect(normalizeWebviewProfile(null)).toBeNull()
    expect(normalizeWebviewProfile([])).toBeNull()
  })
})

describe('validateWebviewProfileName', () => {
  it('aceita um nome novo e recusa vazio, grande, repetido e "Padrão"', () => {
    expect(validateWebviewProfileName('Pessoal', [TRABALHO])).toBeNull()
    expect(validateWebviewProfileName('   ', [TRABALHO])).toMatch(/nome/)
    expect(validateWebviewProfileName('x'.repeat(41), [TRABALHO])).toMatch(/até 40/)
    expect(validateWebviewProfileName('TRABALHO', [TRABALHO])).toMatch(/Já existe/)
    expect(validateWebviewProfileName('padrão', [])).toMatch(/já existe/)
    expect(validateWebviewProfileName('Default', [])).toMatch(/já existe/)
  })
})

describe('newWebviewProfileId', () => {
  it('gera ids válidos, únicos e sem acento/símbolo', () => {
    const ids = new Set<string>()
    for (const nome of ['Trabalho', 'Conta Pessoal ⚡', '???', 'x'.repeat(80), 'Ação']) {
      const id = newWebviewProfileId(nome)
      expect(isCustomProfileId(id), id).toBe(true)
      ids.add(id)
    }
    expect(ids.size).toBe(5)
    expect(newWebviewProfileId('Trabalho')).not.toBe(newWebviewProfileId('Trabalho'))
    expect(newWebviewProfileId('Ação')).toMatch(/^acao-/)
  })
})

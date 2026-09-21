import { describe, expect, it } from 'vitest'

import {
  describeConfiguredSource,
  describeSystemDesignStatus,
} from './system-design-presentation'
import type { SystemDesignConfig } from './types'

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

function config(overrides: Partial<SystemDesignConfig> = {}): SystemDesignConfig {
  return {
    schemaVersion: 2,
    enabled: true,
    repoUrl: 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git',
    branch: 'main',
    sourceMode: 'default',
    label: 'Felixo System Design',
    syncState: 'synced',
    delivered: {
      repoUrl: 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git',
      branch: 'main',
      sha: SHA,
      syncedAt: '2026-09-21T10:00:00.000Z',
      label: 'Felixo System Design',
    },
    lastSha: SHA,
    lastSyncedAt: '2026-09-21T10:00:00.000Z',
    lastError: null,
    ...overrides,
  }
}

const options = { formatDate: (iso: string) => `<${iso}>` }

describe('describeSystemDesignStatus', () => {
  it('sincronizado: diz a fonte, a branch, o sha curto e quando', () => {
    const view = describeSystemDesignStatus(config(), options)

    expect(view.tone).toBe('ok')
    expect(view.detail).toContain('Felixo System Design · main @ a1b2c3d')
    expect(view.detail).toContain('<2026-09-21T10:00:00.000Z>')
  })

  it('offline: avisa que o conteúdo é o da sincronização anterior', () => {
    const view = describeSystemDesignStatus(config({ syncState: 'offline-fallback' }), options)

    expect(view.tone).toBe('warn')
    expect(view.headline).toMatch(/último conteúdo/)
    expect(view.detail).toContain('seguem recebendo')
  })

  it('fonte trocada e não sincronizada: nomeia a fonte ENTREGUE, não a configurada', () => {
    const view = describeSystemDesignStatus(
      config({
        syncState: 'pending-source-change',
        repoUrl: 'https://github.com/acme/padroes.git',
        branch: 'release',
        sourceMode: 'custom',
        label: 'System Design (padroes)',
      }),
      options,
    )

    expect(view.tone).toBe('warn')
    expect(view.detail).toContain('Felixo System Design · main @ a1b2c3d')
    expect(view.detail).toContain('não System Design (padroes) · release')
  })

  it('nunca sincronizado: convida a sincronizar a fonte configurada', () => {
    const view = describeSystemDesignStatus(
      config({ syncState: 'never-synced', delivered: null, lastSha: null, lastSyncedAt: null }),
      options,
    )

    expect(view.tone).toBe('muted')
    expect(view.detail).toContain('Felixo System Design · main')
  })

  it('desligado: não afirma que há conteúdo sendo entregue', () => {
    const view = describeSystemDesignStatus(config({ enabled: false, syncState: 'disabled' }), options)

    expect(view.headline).toBe('Desligado')
    expect(view.detail).not.toMatch(/recebem Felixo/)
  })

  it('config ainda não carregada não inventa uma fonte', () => {
    const unloaded = config({ repoUrl: '', branch: '', label: '', syncState: 'never-synced', delivered: null })

    expect(describeConfiguredSource(unloaded)).toBe('—')
    expect(describeSystemDesignStatus(unloaded, options).detail).toBeNull()
  })

  it('fonte entregue sem data não escreve uma data vazia', () => {
    const base = config()
    const view = describeSystemDesignStatus(
      config({ delivered: { ...base.delivered!, syncedAt: null } }),
      options,
    )

    expect(view.detail).not.toContain('sincronizado em')
  })
})

describe('describeConfiguredSource', () => {
  it('fonte própria aparece pelo nome do repositório', () => {
    expect(
      describeConfiguredSource(
        config({ label: 'System Design (padroes)', branch: 'release', sourceMode: 'custom' }),
      ),
    ).toBe('System Design (padroes) · release')
  })
})

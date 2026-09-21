import { describe, expect, it } from 'vitest'

import type { SystemDesignConfig, SystemDesignDocumentSummary } from '../types'
import { createSystemDesignPromptBlock } from './system-design-prompt'

const DEFAULT_URL = 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git'
const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

const DOCS: SystemDesignDocumentSummary[] = [
  { path: 'backend.md', title: 'Backend', summary: 'Camadas e erros', byteSize: 10, updatedAt: '2026-09-01' },
]

function config(overrides: Partial<SystemDesignConfig> = {}): SystemDesignConfig {
  return {
    schemaVersion: 2,
    enabled: true,
    repoUrl: DEFAULT_URL,
    branch: 'main',
    sourceMode: 'default',
    label: 'Felixo System Design',
    syncState: 'synced',
    delivered: {
      repoUrl: DEFAULT_URL,
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

describe('createSystemDesignPromptBlock', () => {
  it('desligado ou sem documentos: não injeta nada', () => {
    expect(createSystemDesignPromptBlock(config({ enabled: false }), DOCS)).toBeNull()
    expect(createSystemDesignPromptBlock(config(), [])).toBeNull()
  })

  it('default sincronizado: mantém o texto e a fonte de sempre', () => {
    const block = createSystemDesignPromptBlock(config(), DOCS)!

    expect(block).toContain('Guia obrigatório — Felixo System Design:')
    expect(block).toContain('O usuário ativou "Felixo System Design" como guia.')
    expect(block).toContain(`- Repositório: ${DEFAULT_URL} (branch: main). SHA atual: ${SHA.slice(0, 12)}.`)
    expect(block).toContain('Sincronizado em: 2026-09-21T10:00:00.000Z.')
    expect(block).not.toContain('Estado:')
    expect(block).toContain('`backend.md` (Backend) — Camadas e erros')
  })

  it('fonte própria: o nome do guia é o dela, não "Felixo"', () => {
    const block = createSystemDesignPromptBlock(
      config({
        sourceMode: 'custom',
        label: 'System Design (padroes)',
        repoUrl: 'https://github.com/acme/padroes.git',
        branch: 'release',
        delivered: {
          repoUrl: 'https://github.com/acme/padroes.git',
          branch: 'release',
          sha: SHA,
          syncedAt: null,
          label: 'System Design (padroes)',
        },
      }),
      DOCS,
    )!

    expect(block).toContain('Guia obrigatório — System Design (padroes):')
    expect(block).toContain('https://github.com/acme/padroes.git (branch: release)')
    expect(block).not.toContain('Felixo')
    expect(block).not.toContain('Sincronizado em')
  })

  it('fonte trocada e não sincronizada: cita a entregue e avisa da configurada', () => {
    const block = createSystemDesignPromptBlock(
      config({
        syncState: 'pending-source-change',
        sourceMode: 'custom',
        label: 'System Design (padroes)',
        repoUrl: 'https://github.com/acme/padroes.git',
        branch: 'release',
      }),
      DOCS,
    )!

    expect(block).toContain(`- Repositório: ${DEFAULT_URL} (branch: main).`)
    expect(block).toContain(
      'a fonte configurada agora é System Design (padroes) (branch: release), mas ainda não foi sincronizada',
    )
  })

  it('offline: avisa que os documentos são da sincronização anterior', () => {
    const block = createSystemDesignPromptBlock(config({ syncState: 'offline-fallback' }), DOCS)!

    expect(block).toContain('a última sincronização falhou')
    expect(block).toContain('podem estar desatualizados')
  })

  it('nunca leva credencial da URL nem o texto do erro para o prompt', () => {
    const block = createSystemDesignPromptBlock(
      config({
        repoUrl: 'https://usuario:SEGREDO123@github.com/acme/padroes.git',
        lastError: 'fatal: https://usuario:SEGREDO123@github.com/acme/padroes.git',
        syncState: 'offline-fallback',
        delivered: {
          repoUrl: 'https://usuario:SEGREDO123@github.com/acme/padroes.git',
          branch: 'main',
          sha: SHA,
          syncedAt: null,
          label: 'System Design (padroes)',
        },
      }),
      DOCS,
    )!

    expect(block).not.toContain('SEGREDO123')
    expect(block).not.toContain('fatal:')
  })

  it('sem fonte entregue ainda, cai na configurada com SHA desconhecido', () => {
    const block = createSystemDesignPromptBlock(
      config({ delivered: null, lastSha: null, syncState: 'never-synced' }),
      DOCS,
    )!

    expect(block).toContain(`- Repositório: ${DEFAULT_URL} (branch: main). SHA atual: desconhecido.`)
  })
})

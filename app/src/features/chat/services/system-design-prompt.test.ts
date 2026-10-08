import { describe, expect, it } from 'vitest'

import type { SystemDesignConfig, SystemDesignDocumentSummary, SystemDesignGuide, SystemDesignProject } from '../types'
import { createSystemDesignPromptBlock, createSystemDesignGuidesPromptBlock } from './system-design-prompt'

const DEFAULT_URL = 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git'
const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

const DOCS: SystemDesignDocumentSummary[] = [
  { path: 'backend.md', title: 'Backend', summary: 'Camadas e erros', byteSize: 10, updatedAt: '2026-09-01' },
]

function config(overrides: Partial<SystemDesignConfig> = {}): SystemDesignConfig {
  return {
    schemaVersion: 2,
    enabled: true,
    guides: [],
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

function guide(overrides: Partial<SystemDesignGuide> = {}): SystemDesignGuide {
  return {
    key: `${DEFAULT_URL}#main`,
    kind: 'git',
    repoUrl: DEFAULT_URL,
    branch: 'main',
    label: 'Felixo System Design',
    origin: 'default',
    syncState: 'synced',
    sha: SHA,
    syncedAt: '2026-10-08T10:00:00.000Z',
    lastError: null,
    ...overrides,
  }
}

const DOKTOR = guide({
  key: 'https://github.com/acme/Doktor-SystemDesign#main',
  repoUrl: 'https://github.com/acme/Doktor-SystemDesign.git',
  label: 'System Design (Doktor-SystemDesign)',
  origin: 'custom',
  syncState: 'never-synced',
  sha: null,
})

function project(overrides: Partial<SystemDesignProject> = {}): SystemDesignProject {
  return {
    directory: '/repos/cliente',
    root: '/repos/cliente',
    authorized: true,
    layer: 'projeto',
    guides: [guide({ key: 'local:/repos/cliente/Padrão de qualidade - X', kind: 'local', path: '/repos/cliente/Padrão de qualidade - X', repoUrl: '', branch: '', label: 'X', origin: 'projeto-pasta' })],
    replaced: [guide()],
    file: null,
    folders: [],
    appGuides: [],
    useGuideFolders: true,
    ...overrides,
  }
}

describe('lista de guias e projetos no bloco do orquestrador', () => {
  it('um guia e nenhum projeto com guias próprios: o bloco de sempre, byte a byte', () => {
    const single = config({ guides: [guide()] })

    expect(createSystemDesignGuidesPromptBlock({ config: single, documentsByGuide: { [guide().key]: DOCS } })).toBe(
      createSystemDesignPromptBlock(single, DOCS),
    )
  })

  it('dois guias: uma seção por guia, cada uma com o próprio índice e estado', () => {
    const block = createSystemDesignGuidesPromptBlock({
      config: config({ sourceMode: 'custom', guides: [guide({ origin: 'custom' }), DOKTOR] }),
      documentsByGuide: { [guide().key]: DOCS },
    })

    expect(block).toContain('Guias obrigatórios — Felixo System Design + System Design (Doktor-SystemDesign):')
    expect(block).toContain('Guia: Felixo System Design')
    expect(block).toContain('`backend.md` (Backend) — Camadas e erros')
    expect(block).toContain('Guia: System Design (Doktor-SystemDesign)')
    expect(block).toContain('ainda não sincronizado')
  })

  it('projeto ativo com guias próprios: diz que valem dentro dele no lugar dos gerais', () => {
    const block = createSystemDesignGuidesPromptBlock({
      config: config({ guides: [guide()] }),
      documentsByGuide: {},
      projects: [project(), project({ root: '/repos/outro', directory: '/repos/outro', layer: 'padrao', guides: [] }), project({ authorized: false, root: null })],
    })

    expect(block).toContain('Projetos com guias próprios (dentro deles, valem estes no lugar dos guias acima):')
    expect(block).toContain('- cliente (/repos/cliente): X — pasta /repos/cliente/Padrão de qualidade - X.')
    expect(block).not.toContain('/repos/outro')
  })

  it('nunca leva credencial e não injeta nada com os guias desligados', () => {
    const leaky = guide({ repoUrl: 'https://usuario:SEGREDO123@github.com/acme/x.git', origin: 'custom' })
    const block = createSystemDesignGuidesPromptBlock({ config: config({ guides: [leaky, DOKTOR] }), documentsByGuide: {} })

    expect(block).not.toContain('SEGREDO123')
    expect(createSystemDesignGuidesPromptBlock({ config: config({ enabled: false, guides: [guide(), DOKTOR] }), documentsByGuide: {} })).toBeNull()
  })
})

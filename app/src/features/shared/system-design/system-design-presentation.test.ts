import { describe, expect, it } from 'vitest'

import {
  describeConfiguredSource,
  describeGuideOrigin,
  describeGuideStatus,
  describeProjectFile,
  describeProjectLayer,
  describeSystemDesignStatus,
} from './system-design-presentation'
import type { SystemDesignConfig, SystemDesignGuide, SystemDesignProject } from './types'

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

function config(overrides: Partial<SystemDesignConfig> = {}): SystemDesignConfig {
  return {
    schemaVersion: 3,
    enabled: true,
    guides: [],
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

function guide(overrides: Partial<SystemDesignGuide> = {}): SystemDesignGuide {
  return {
    key: 'https://github.com/acme/doktor#main',
    kind: 'git',
    repoUrl: 'https://github.com/acme/Doktor-SystemDesign.git',
    branch: 'main',
    label: 'System Design (Doktor-SystemDesign)',
    origin: 'custom',
    syncState: 'synced',
    sha: SHA,
    syncedAt: '2026-10-08T10:00:00.000Z',
    lastError: null,
    ...overrides,
  }
}

function project(overrides: Partial<SystemDesignProject> = {}): SystemDesignProject {
  return {
    directory: '/repos/cliente',
    root: '/repos/cliente',
    authorized: true,
    layer: 'padrao',
    guides: [],
    replaced: [],
    file: null,
    folders: [],
    appGuides: [],
    useGuideFolders: true,
    ...overrides,
  }
}

const fixedDate = { formatDate: () => '08/10/2026' }

describe('estado e origem de cada guia', () => {
  it('cada estado tem frase e tom próprios', () => {
    expect(describeGuideStatus(guide(), fixedDate)).toEqual({
      headline: 'Sincronizado @ a1b2c3d',
      detail: 'Última sincronização em 08/10/2026.',
      tone: 'ok',
    })
    expect(describeGuideStatus(guide({ syncState: 'never-synced', sha: null }), fixedDate).tone).toBe('muted')
    expect(describeGuideStatus(guide({ syncState: 'offline-fallback' }), fixedDate).tone).toBe('warn')
    expect(describeGuideStatus(guide({ kind: 'local', path: '/r/Padrão de qualidade - X' })).headline).toBe('Lido do repositório')
  })

  it('a origem diz de qual camada o guia veio', () => {
    expect(describeGuideOrigin('default')).toBe('padrão do app')
    expect(describeGuideOrigin('projeto-arquivo')).toBe('arquivo do projeto')
    expect(describeGuideOrigin('projeto-pasta')).toBe('pasta do projeto')
  })
})

describe('camada de um projeto', () => {
  it('guias do projeto avisam o que substituíram', () => {
    const view = describeProjectLayer(project({ layer: 'projeto', guides: [guide()], replaced: [guide({ label: 'Felixo System Design' })] }))

    expect(view.headline).toBe('Guias do projeto')
    expect(view.detail).toBe('Valem aqui no lugar dos seus (Felixo System Design).')
  })

  it('fora dos projetos registrados diz que nada foi lido', () => {
    expect(describeProjectLayer(project({ authorized: false, root: null })).headline).toBe('Fora dos projetos registrados')
  })

  it('o arquivo pendente pede conferência e diz que nada é buscado antes', () => {
    const view = describeProjectFile({ present: true, path: '.felixo/system-design.json', status: 'pendente', guides: [guide()], problems: [], hash: 'h' })

    expect(view?.headline).toBe('O arquivo do projeto pede 1 guia')
    expect(view?.detail).toContain('nada é buscado')
    expect(describeProjectFile(null)).toBeNull()
    expect(describeProjectFile({ present: false, path: '', status: 'ausente', guides: [], problems: [], hash: null })).toBeNull()
  })

  it('arquivo inválido mostra os problemas', () => {
    const view = describeProjectFile({ present: true, path: '', status: 'invalido', guides: [], problems: ['Guia 1: A URL do repositório é inválida.'], hash: null })

    expect(view?.detail).toContain('Guia 1')
  })
})

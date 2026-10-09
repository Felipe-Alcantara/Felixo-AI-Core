import { beforeEach, describe, expect, it, vi } from 'vitest'

import { describeLoginNotice } from './system-design-presentation'
import { forgetLoginNotices, runAutomaticSync, type SystemDesignSyncBridge } from './system-design-sync'
import type { SystemDesignLoginNeeded, SystemDesignSyncResult } from './types'

function bridgeReturning(result: SystemDesignSyncResult) {
  const sync = vi.fn(async () => result)
  return { bridge: { sync } as SystemDesignSyncBridge, sync }
}

const loginFailure: SystemDesignSyncResult = {
  ok: false,
  reason: 'login',
  message: 'O repositório pede login…',
  results: [
    { key: 'https://github.com/acme/privado#main', ok: false, reason: 'login', label: 'acme/privado' },
    { key: 'https://github.com/acme/publico#main', ok: true },
  ],
}

describe('runAutomaticSync', () => {
  beforeEach(() => forgetLoginNotices())

  it('pede a sincronização SEM login, com a raiz do projeto quando houver', async () => {
    const { bridge, sync } = bridgeReturning({ ok: true, results: [] })

    await runAutomaticSync({ projectRoot: '/projetos/a' }, { bridge, onLoginNeeded: () => {} })
    await runAutomaticSync(undefined, { bridge, onLoginNeeded: () => {} })

    expect(sync).toHaveBeenNthCalledWith(1, { projectRoot: '/projetos/a', interactive: false })
    expect(sync).toHaveBeenNthCalledWith(2, { interactive: false })
  })

  it('avisa só o guia que precisou de login, com o nome dele e o projeto', async () => {
    const { bridge } = bridgeReturning(loginFailure)
    const notices: SystemDesignLoginNeeded[] = []

    await runAutomaticSync({ projectRoot: '/projetos/a' }, { bridge, onLoginNeeded: (notice) => notices.push(notice) })

    expect(notices).toEqual([
      { key: 'https://github.com/acme/privado#main', label: 'acme/privado', projectRoot: '/projetos/a' },
    ])
  })

  it('outras falhas não viram aviso (continuam no estado do guia em Configurações)', async () => {
    const { bridge } = bridgeReturning({
      ok: false,
      reason: 'network',
      results: [{ key: 'k', ok: false, reason: 'network', label: 'x' }],
    })
    const onLoginNeeded = vi.fn()

    await runAutomaticSync(undefined, { bridge, onLoginNeeded })

    expect(onLoginNeeded).not.toHaveBeenCalled()
  })

  it('o mesmo guia avisa uma vez por sessão', async () => {
    const { bridge } = bridgeReturning(loginFailure)
    const onLoginNeeded = vi.fn()

    await runAutomaticSync(undefined, { bridge, onLoginNeeded })
    await runAutomaticSync(undefined, { bridge, onLoginNeeded })

    expect(onLoginNeeded).toHaveBeenCalledTimes(1)
  })

  it('sem o app desktop, não faz nada', async () => {
    const onLoginNeeded = vi.fn()
    await expect(runAutomaticSync(undefined, { bridge: undefined, onLoginNeeded })).resolves.toBeNull()
    expect(onLoginNeeded).not.toHaveBeenCalled()
  })
})

describe('describeLoginNotice', () => {
  it('diz qual guia, por que não atualizou, que nada se perdeu e o que o botão faz', () => {
    const notice = describeLoginNotice({ key: 'k', label: 'acme/privado' })

    expect(notice.title).toBe('Um guia do System Design pede login')
    expect(notice.description).toContain('"acme/privado"')
    expect(notice.description).toMatch(/privado|endereço/)
    expect(notice.description).toMatch(/último conteúdo/)
    expect(notice.primaryLabel).toBe('Fazer login e sincronizar')
    expect(notice.secondaryLabel).toBe('Agora não')
  })

  it('num guia de projeto, diz o projeto', () => {
    const notice = describeLoginNotice({ key: 'k', label: 'acme/privado', projectRoot: '/home/ana/projetos/cliente-a' })
    expect(notice.description).toContain('cliente-a')
  })
})

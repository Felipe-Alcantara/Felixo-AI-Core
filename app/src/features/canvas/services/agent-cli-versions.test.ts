import { afterEach, describe, expect, it } from 'vitest'
import { loadAgentCliVersions } from './agent-cli-versions'

type Bridge = () => Promise<unknown>

function installBridge(cliVersions: Bridge | undefined): void {
  ;(globalThis as { window?: unknown }).window = { felixo: { pty: cliVersions ? { cliVersions } : {} } }
}

describe('loadAgentCliVersions', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  it('devolve as versões do processo principal, com fora do formato como desconhecida', async () => {
    installBridge(async () => ({
      ok: true,
      versions: { claude: '2.1.285', codex: 'codex-cli 0.156.1', gemini: '0.57.0', openia: null },
    }))
    expect(await loadAgentCliVersions()).toEqual({ claude: '2.1.285', codex: null, gemini: '0.57.0', openia: null })
  })

  it('sem ponte, com erro ou com resposta de falha, nenhuma versão é conhecida', async () => {
    installBridge(undefined)
    expect(await loadAgentCliVersions()).toEqual({})

    installBridge(async () => {
      throw new Error('ipc caiu')
    })
    expect(await loadAgentCliVersions()).toEqual({})

    installBridge(async () => ({ ok: false, message: 'falhou' }))
    expect(await loadAgentCliVersions()).toEqual({})
  })
})

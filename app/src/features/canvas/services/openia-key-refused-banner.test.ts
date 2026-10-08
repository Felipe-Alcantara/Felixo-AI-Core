import { describe, expect, it } from 'vitest'
import { OPENIA_CHAVE_RECUSADA, openiaKeyRefusedBanner } from './openia-key-refused-banner'

const RUN = ['run', 'claudecode', '--provider', '--no-model', '--dir', 'C:\\projeto']

describe('openiaKeyRefusedBanner', () => {
  it('aponta onde trocar a chave quando o openia run sai com a recusa', () => {
    const banner = openiaKeyRefusedBanner({
      providerId: 'openia',
      args: RUN,
      activity: 'exited',
      exitCode: OPENIA_CHAVE_RECUSADA,
      accountLabel: 'Pessoal',
    })

    expect(banner?.title).toBe('O OpenRouter recusou a chave')
    expect(banner?.detail).toContain('conta Pessoal')
    expect(banner?.detail).toContain('Chave do OpenRouter')
  })

  it('sem conta escolhida aponta o Login do sistema, sem inventar nome', () => {
    const banner = openiaKeyRefusedBanner({
      providerId: 'openia',
      args: RUN,
      activity: 'error',
      exitCode: 3,
      accountLabel: null,
    })

    expect(banner?.detail).toContain('A chave do Login do sistema')
    expect(banner?.detail).toContain('Agente → Openia → Login do sistema → Chave do OpenRouter')
    expect(banner?.detail).not.toContain('conta null')
  })

  it.each([
    ['outro código', { exitCode: 1 }],
    ['ainda rodando', { activity: 'working', exitCode: undefined }],
    ['outro agente', { providerId: 'claude' }],
    ['menu do Openia, não o run', { args: [] }],
  ])('não aparece: %s', (_caso, mudanca) => {
    expect(
      openiaKeyRefusedBanner({
        providerId: 'openia',
        args: RUN,
        activity: 'exited',
        exitCode: 3,
        accountLabel: 'Pessoal',
        ...mudanca,
      }),
    ).toBeNull()
  })
})

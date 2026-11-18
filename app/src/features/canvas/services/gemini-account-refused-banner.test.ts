import { describe, expect, it } from 'vitest'

import { loadFixture, replayFixture } from '../terminal/__fixtures__/terminal-output/replay-fixture'
import { readViewport } from '../terminal/terminal-buffer-reader'
import { geminiAccountRefusedBanner, showsGeminiAccountRefusal } from './gemini-account-refused-banner'

describe('showsGeminiAccountRefusal', () => {
  it('reconhece a tela de login real que o Google recusou (Gemini CLI 0.62.0), com a frase quebrada dentro da caixa', async () => {
    const terminal = await replayFixture(loadFixture('gemini-erro'))

    expect(showsGeminiAccountRefusal(readViewport(terminal))).toBe(true)
  })

  it('não reconhece uma conversa nem a tela de uma conta que entrou', async () => {
    const answered = await replayFixture(loadFixture('gemini-resposta'))

    expect(showsGeminiAccountRefusal(readViewport(answered))).toBe(false)
    expect(showsGeminiAccountRefusal('Authenticated with gemini-api-key')).toBe(false)
  })
})

describe('geminiAccountRefusedBanner', () => {
  it('explica a recusa e indica a Antigravity', () => {
    const banner = geminiAccountRefusedBanner({ providerId: 'gemini', accountRefused: true })

    expect(banner?.title).toContain('conta pessoal')
    expect(banner?.detail).toContain('Antigravity')
    expect(banner?.detail).toContain('agy')
  })

  it('fica de fora de outra CLI e sem a recusa na tela', () => {
    expect(geminiAccountRefusedBanner({ providerId: 'claude', accountRefused: true })).toBeNull()
    expect(geminiAccountRefusedBanner({ providerId: 'gemini', accountRefused: false })).toBeNull()
    expect(geminiAccountRefusedBanner({ providerId: 'gemini' })).toBeNull()
  })
})

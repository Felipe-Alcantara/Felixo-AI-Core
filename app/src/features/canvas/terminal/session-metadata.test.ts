import { describe, expect, it } from 'vitest'
import { activityLabel, formatSessionAge, formatSessionStart } from './session-metadata'

describe('session metadata formatters', () => {
  it('formata duração curta, longa e com dias', () => {
    const now = 10_000_000
    expect(formatSessionAge(now - 12_000, now)).toBe('12s')
    expect(formatSessionAge(now - (2 * 60 + 4) * 1_000, now)).toBe('2min 4s')
    expect(formatSessionAge(now - (3 * 3_600 + 12 * 60) * 1_000, now)).toBe('3h 12min')
    expect(formatSessionAge(now - (2 * 86_400 + 4 * 3_600 + 8 * 60) * 1_000, now)).toBe('2d 4h 8min')
  })

  it('não inventa duração quando o início não está disponível', () => {
    expect(formatSessionAge(undefined, 10_000)).toBe('tempo indisponível')
    expect(formatSessionStart(undefined)).toBe('início indisponível')
  })

  it('expõe o estado em linguagem de produto', () => {
    expect(activityLabel('working')).toBe('Trabalhando')
    expect(activityLabel('waiting_approval')).toBe('Aguardando aprovação')
    expect(activityLabel('exited')).toBe('Encerrado')
  })
})

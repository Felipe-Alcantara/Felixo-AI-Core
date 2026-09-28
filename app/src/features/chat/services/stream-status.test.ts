import { describe, expect, it } from 'vitest'
import { resolveErrorAvailabilityStatus } from './stream-status'
import type { CliErrorFailure } from '../types'

function errorEvent(message: string, failure?: CliErrorFailure) {
  return { type: 'error' as const, sessionId: 's-1', message, failure }
}

describe('resolveErrorAvailabilityStatus', () => {
  it('usa a classe que o processo principal decidiu, mesmo com palavras de limite no texto', () => {
    // O classificador antigo do renderer checava limite antes de login e
    // devolvia limit_reached aqui.
    const event = errorEvent('API Error: 401 Unauthorized — rate limit headers missing', {
      failureClass: 'auth',
      availabilityStatus: 'no_login',
    })

    expect(resolveErrorAvailabilityStatus(event)).toBe('no_login')
  })

  it('"line 429" classificado como desconhecido não muda a disponibilidade', () => {
    // O classificador antigo casava qualquer "429" e marcava limit_reached.
    const event = errorEvent('Error: failed to parse line 429 of config.toml', {
      failureClass: 'unknown',
      availabilityStatus: null,
    })

    expect(resolveErrorAvailabilityStatus(event)).toBeNull()
  })

  it('rede não vira limite', () => {
    const event = errorEvent('stream disconnected before completion: ECONNRESET', {
      failureClass: 'network',
      availabilityStatus: null,
    })

    expect(resolveErrorAvailabilityStatus(event)).toBeNull()
  })

  it('erro sem classe anexada nunca é adivinhado pelo texto', () => {
    expect(resolveErrorAvailabilityStatus(errorEvent('usage limit reached · 429 too many requests'))).toBeNull()
  })

  it('limite decidido no processo principal chega como limit_reached', () => {
    const event = errorEvent('You’ve hit your usage limit.', {
      failureClass: 'limit',
      availabilityStatus: 'limit_reached',
    })

    expect(resolveErrorAvailabilityStatus(event)).toBe('limit_reached')
  })
})

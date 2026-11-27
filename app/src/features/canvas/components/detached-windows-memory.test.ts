// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ESPERA_PARA_ESQUECER_MS,
  desistirDaReabertura,
  esquecerJanela,
  esquecerJanelaDepois,
  janelasLembradas,
  lembrarJanela,
  prepararReabertura,
  reaberturaPendente,
  reiniciarReaberturaParaTeste,
} from './detached-windows-memory'
import { instalarLocalStorageEmMemoria } from '../../shared/test-support/jsdom-storage'

const CHAVE = 'felixo.canvas.janelas-destacadas'

describe('janelas destacadas lembradas entre execuções', () => {
  beforeEach(() => {
    instalarLocalStorageEmMemoria()
    reiniciarReaberturaParaTeste()
    vi.useFakeTimers()
  })
  afterEach(() => void vi.useRealTimers())

  it('lembra o modo de cada terminal, sem repetir, e esquece', () => {
    lembrarJanela('a', 'janela')
    lembrarJanela('b', 'pip')
    lembrarJanela('a', 'pip')
    expect(janelasLembradas()).toEqual([{ sessionId: 'b', modo: 'pip' }, { sessionId: 'a', modo: 'pip' }])

    esquecerJanela('b')
    expect(janelasLembradas()).toEqual([{ sessionId: 'a', modo: 'pip' }])
  })

  it('conteúdo estragado não derruba nem inventa janela', () => {
    for (const lixo of ['{', 'null', '{"a":1}', '[1,"x",{"sessionId":"","modo":"janela"},{"sessionId":"c","modo":"outra"}]']) {
      localStorage.setItem(CHAVE, lixo)
      expect(janelasLembradas()).toEqual([])
    }
  })

  // Sair do app também fecha as janelas: o X só esquece depois, e quem está saindo nunca chega lá.
  it('o X da janela esquece só depois da espera, e destacar de novo cancela', () => {
    lembrarJanela('a', 'janela')
    esquecerJanelaDepois('a')
    vi.advanceTimersByTime(ESPERA_PARA_ESQUECER_MS - 1)
    expect(janelasLembradas()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(janelasLembradas()).toEqual([])

    lembrarJanela('a', 'janela')
    esquecerJanelaDepois('a')
    lembrarJanela('a', 'pip')
    vi.advanceTimersByTime(ESPERA_PARA_ESQUECER_MS * 2)
    expect(janelasLembradas()).toEqual([{ sessionId: 'a', modo: 'pip' }])
  })

  it('na partida reabre só os blocos que existem, até o teto da gaveta, esquece os órfãos e vale uma vez', () => {
    const blocos = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
    for (const id of ['sumiu', ...blocos]) lembrarJanela(id, id === 'b' ? 'pip' : 'janela')

    expect(prepararReabertura(new Set(blocos))).toEqual(blocos.slice(0, 8))
    expect(reaberturaPendente('b')).toBe('pip')
    expect(reaberturaPendente('i')).toBeNull()
    expect(janelasLembradas().map((j) => j.sessionId)).not.toContain('sumiu')
    // O canvas remonta (ida ao chat): não reabre de novo.
    expect(prepararReabertura(new Set(['a']))).toEqual([])
  })

  it('fechar o painel antes de o terminal existir desiste e esquece', () => {
    lembrarJanela('a', 'janela')
    prepararReabertura(new Set(['a']))

    desistirDaReabertura(['a', 'nunca-pendente'])

    expect(reaberturaPendente('a')).toBeNull()
    expect(janelasLembradas()).toEqual([])
  })
})

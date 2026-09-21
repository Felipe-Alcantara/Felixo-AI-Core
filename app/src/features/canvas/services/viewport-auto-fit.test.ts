import { describe, expect, it } from 'vitest'
import {
  AUTO_FIT_MOVE_WINDOW_MS,
  initialAutoFitState,
  planAutoFit,
  registerViewportMove,
} from './viewport-auto-fit'

describe('enquadramento automático do canvas', () => {
  it('a primeira vez de uma revisão sempre enquadra', () => {
    const plan = planAutoFit(initialAutoFitState(), 0, 1000)
    expect(plan.fit).toBe(true)
    expect(plan.state.revision).toBe(0)
    expect(plan.state.userMoved).toBe(false)
  })

  it('mudança de layout ANTES de a pessoa mexer ainda reenquadra (medida tardia da gaveta/painéis)', () => {
    const first = planAutoFit(initialAutoFitState(), 0, 1000)
    expect(planAutoFit(first.state, 0, 5000).fit).toBe(true)
  })

  it('DEPOIS de a pessoa mexer na visão, mudar o layout NUNCA reenquadra (o bug relatado)', () => {
    const first = planAutoFit(initialAutoFitState(), 0, 1000)
    const moved = registerViewportMove(first.state, 1000 + AUTO_FIT_MOVE_WINDOW_MS + 1)
    expect(moved.userMoved).toBe(true)
    for (let i = 0; i < 20; i += 1) {
      const plan = planAutoFit(moved, 0, 10_000 + i * 100)
      expect(plan.fit).toBe(false)
      expect(plan.state).toBe(moved)
    }
  })

  it('o movimento causado pelo próprio enquadramento não conta como da pessoa', () => {
    const first = planAutoFit(initialAutoFitState(), 0, 1000)
    const during = registerViewportMove(first.state, 1000 + 10)
    expect(during.userMoved).toBe(false)
    expect(registerViewportMove(during, 1000 + AUTO_FIT_MOVE_WINDOW_MS - 1).userMoved).toBe(false)
  })

  it('um canvas novo (outra revisão, ex.: importar arquivo) enquadra de novo e devolve a visão ao automático', () => {
    let state = planAutoFit(initialAutoFitState(), 0, 1000).state
    state = registerViewportMove(state, 5000)
    expect(state.userMoved).toBe(true)
    const next = planAutoFit(state, 1, 9000)
    expect(next.fit).toBe(true)
    expect(next.state.userMoved).toBe(false)
    expect(next.state.revision).toBe(1)
  })

  it('registrar movimento repetido não cria estado novo à toa', () => {
    const moved = registerViewportMove(planAutoFit(initialAutoFitState(), 0, 0).state, 10_000)
    expect(registerViewportMove(moved, 20_000)).toBe(moved)
  })
})

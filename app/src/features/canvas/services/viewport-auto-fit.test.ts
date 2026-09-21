import { describe, expect, it } from 'vitest'
import {
  AUTO_FIT_MOVE_WINDOW_MS,
  initialAutoFitState,
  markAutoFitExecuted,
  planAutoFit,
  registerViewportMove,
} from './viewport-auto-fit'

const PROGRAMATICO = false
const DA_PESSOA = true

describe('enquadramento automático do canvas', () => {
  it('a primeira vez de uma revisão sempre enquadra', () => {
    const plan = planAutoFit(initialAutoFitState(), 0)
    expect(plan.fit).toBe(true)
    expect(plan.state.revision).toBe(0)
    expect(plan.state.userMoved).toBe(false)
  })

  it('mudança de layout ANTES de a pessoa mexer ainda reenquadra (medida tardia da gaveta/painéis)', () => {
    const first = planAutoFit(initialAutoFitState(), 0)
    expect(planAutoFit(first.state, 0).fit).toBe(true)
  })

  it('DEPOIS de a pessoa mexer na visão, mudar o layout NUNCA reenquadra (o bug relatado)', () => {
    let state = planAutoFit(initialAutoFitState(), 0).state
    state = markAutoFitExecuted(state, 1000)
    const moved = registerViewportMove(state, 1000 + AUTO_FIT_MOVE_WINDOW_MS + 1, PROGRAMATICO)
    expect(moved.userMoved).toBe(true)
    for (let i = 0; i < 20; i += 1) {
      const plan = planAutoFit(moved, 0)
      expect(plan.fit).toBe(false)
      expect(plan.state).toBe(moved)
    }
  })

  it('o movimento causado pelo próprio enquadramento não conta como da pessoa', () => {
    const executed = markAutoFitExecuted(planAutoFit(initialAutoFitState(), 0).state, 1000)
    const during = registerViewportMove(executed, 1010, PROGRAMATICO)
    expect(during.userMoved).toBe(false)
    expect(registerViewportMove(during, 1000 + AUTO_FIT_MOVE_WINDOW_MS - 1, PROGRAMATICO).userMoved).toBe(false)
  })

  it('PC/runner lento: o ajuste executa MUITO depois do plano e ainda não é confundido com movimento da pessoa (regressão do #73)', () => {
    // Plano em t=1000; o frame só roda em t=16000 (boot de 15 s no runner Windows).
    let state = planAutoFit(initialAutoFitState(), 0).state
    // Movimento programático antes de o ajuste executar (React Flow aplicando viewport): nosso, não da pessoa.
    state = registerViewportMove(state, 9000, PROGRAMATICO)
    expect(state.userMoved).toBe(false)
    state = markAutoFitExecuted(state, 16_000)
    state = registerViewportMove(state, 16_050, PROGRAMATICO)
    expect(state.userMoved).toBe(false)
    // E as mudanças de layout que chegam depois ainda reenquadram (o que mantém o bloco fora da topbar).
    expect(planAutoFit(state, 0).fit).toBe(true)
  })

  it('evento DOM real (arrastar/roda/toque) é sempre da pessoa, até dentro da janela do ajuste ou com ajuste pendente', () => {
    const pendente = planAutoFit(initialAutoFitState(), 0).state
    expect(registerViewportMove(pendente, 1000, DA_PESSOA).userMoved).toBe(true)
    const executado = markAutoFitExecuted(pendente, 1000)
    expect(registerViewportMove(executado, 1010, DA_PESSOA).userMoved).toBe(true)
  })

  it('botão de zoom/foco (programático) depois da janela é da pessoa', () => {
    const executado = markAutoFitExecuted(planAutoFit(initialAutoFitState(), 0).state, 1000)
    expect(registerViewportMove(executado, 1000 + AUTO_FIT_MOVE_WINDOW_MS + 50, PROGRAMATICO).userMoved).toBe(true)
  })

  it('um canvas novo (outra revisão, ex.: importar arquivo) enquadra de novo e devolve a visão ao automático', () => {
    let state = markAutoFitExecuted(planAutoFit(initialAutoFitState(), 0).state, 1000)
    state = registerViewportMove(state, 5000, DA_PESSOA)
    expect(state.userMoved).toBe(true)
    const next = planAutoFit(state, 1)
    expect(next.fit).toBe(true)
    expect(next.state.userMoved).toBe(false)
    expect(next.state.revision).toBe(1)
  })

  it('registrar movimento repetido não cria estado novo à toa', () => {
    const moved = registerViewportMove(planAutoFit(initialAutoFitState(), 0).state, 10_000, DA_PESSOA)
    expect(registerViewportMove(moved, 20_000, DA_PESSOA)).toBe(moved)
    expect(markAutoFitExecuted(moved, 30_000)).toBe(moved)
  })
})

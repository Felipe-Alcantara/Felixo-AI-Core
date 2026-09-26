import { useCallback, useEffect, useRef, useState } from 'react'
import { requestCliDiagnosis, type CliDiagnosisReport } from './cli-diagnosis'

export type CliDiagnosisState = {
  running: boolean
  /** Último diagnóstico concluído; continua na tela enquanto um novo roda. */
  report: CliDiagnosisReport | null
  error: string | null
}

const IDLE: CliDiagnosisState = { running: false, report: null, error: null }

/**
 * Diagnóstico sob demanda das CLIs de IA, para quem já está olhando para elas
 * (gerenciador de modelos, aviso de falha da instalação).
 *
 * O resultado é uma fotografia: `reset` o descarta quando a tela muda de
 * assunto, e uma resposta que chega depois disso é ignorada — mostrar o
 * diagnóstico de antes de uma instalação como se fosse o de agora seria pior
 * do que não mostrar nada.
 */
export function useCliDiagnosis(): {
  /** Há ponte com o processo principal (falso no navegador e nos testes). */
  available: boolean
  state: CliDiagnosisState
  /** O painel tem algo a mostrar: rodando, com resultado ou com erro. */
  active: boolean
  run: () => void
  reset: () => void
} {
  const [state, setState] = useState<CliDiagnosisState>(IDLE)
  const requestRef = useRef(0)

  useEffect(
    () => () => {
      requestRef.current += 1
    },
    [],
  )

  const run = useCallback(() => {
    const request = ++requestRef.current
    setState((current) => ({ ...current, running: true, error: null }))

    void requestCliDiagnosis(window.felixo?.cliSetup).then((outcome) => {
      if (request !== requestRef.current) return

      setState((current) =>
        outcome.ok
          ? { running: false, report: outcome.report, error: null }
          : { running: false, report: current.report, error: outcome.message },
      )
    })
  }, [])

  const reset = useCallback(() => {
    requestRef.current += 1
    setState(IDLE)
  }, [])

  return {
    available: Boolean(window.felixo?.cliSetup?.diagnose),
    state,
    active: state.running || state.report !== null || state.error !== null,
    run,
    reset,
  }
}

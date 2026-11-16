import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  IDLE,
  MAX_RECORDING_MS,
  describeDictationCost,
  describeMicrophoneError,
  describeMicrophoneStatus,
  dictationReducer,
  sanitizeDictatedText,
} from '../services/dictation'
import { costConsent, dictationCostConsentKey } from '../services/usage-cost-consent'
import { createVoiceRecorder } from '../services/voice-recorder'

type Options = {
  /**
   * Entrega o texto já limpo e devolve um aviso para mostrar (ou `null`). Quem
   * chama decide o destino: digitar no terminal ativo ou, sem terminal, copiar.
   */
  deliver: (text: string) => Promise<string | null>
}

/**
 * Ditado por voz: grava, transcreve no processo principal e entrega o texto.
 * O texto NUNCA é enviado sozinho — quem entrega só digita na linha de entrada.
 */
export function useDictation({ deliver }: Options) {
  const [state, dispatch] = useReducer(dictationReducer, IDLE)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const recorderRef = useRef<ReturnType<typeof createVoiceRecorder> | null>(null)
  const startedAtRef = useRef(0)
  const pendingCostKeyRef = useRef<string | null>(null)
  const deliverRef = useRef(deliver)
  const stateRef = useRef(state)

  useEffect(() => {
    deliverRef.current = deliver
  }, [deliver])
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const platform = window.felixo?.platform ?? 'linux'

  const getRecorder = useCallback(() => {
    if (!recorderRef.current) {
      recorderRef.current = createVoiceRecorder({
        getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
        MediaRecorderCtor: MediaRecorder as unknown as Parameters<typeof createVoiceRecorder>[0]['MediaRecorderCtor'],
      })
    }
    return recorderRef.current
  }, [])

  const finish = useCallback(async () => {
    const recorder = getRecorder()
    dispatch({ type: 'stop' })
    try {
      const recorded = await recorder.stop()
      const result = await window.felixo?.speech?.transcribe({ audio: recorded.audio, mimeType: recorded.mimeType })
      if (!result?.ok || !result.text) {
        dispatch({ type: 'fail', message: result?.message ?? 'Não consegui transcrever a gravação.' })
        return
      }
      const text = sanitizeDictatedText(result.text)
      if (!text) {
        dispatch({ type: 'fail', message: 'A transcrição não tinha texto que possa ser digitado.' })
        return
      }
      setNotice(await deliverRef.current(text))
      dispatch({ type: 'done' })
    } catch (error) {
      dispatch({ type: 'fail', message: error instanceof Error ? error.message : 'A gravação falhou.' })
    }
  }, [getRecorder])

  /** `confirmedCostKey`: o destino cujo custo a pessoa acabou de confirmar no balão. */
  const begin = useCallback(async (confirmedCostKey: string | null = null) => {
    setNotice(null)
    const speech = window.felixo?.speech
    if (!speech) {
      dispatch({ type: 'fail', message: 'O ditado por voz só funciona no aplicativo.' })
      return
    }
    // Sem chave não vale a pena gravar: a pessoa falaria para o nada.
    const config = await speech.getConfig()
    // Servidor local não exige chave (`keyRequired: false`); a nuvem exige.
    if (!config.ok || !config.config || (config.config.keyRequired !== false && !config.config.keyConfigured)) {
      dispatch({ type: 'fail', message: 'Cadastre a chave da API de transcrição em Configurações → Ditado por voz.' })
      return
    }
    // A nuvem cobra por minuto de áudio: sem um "sim" (agora ou lembrado) para
    // este endereço e modelo, nem grava. O servidor local não cobra.
    if (config.config.keyRequired !== false) {
      const key = dictationCostConsentKey(config.config.baseUrl, config.config.model)
      if (key !== confirmedCostKey && !costConsent.has(key)) {
        pendingCostKeyRef.current = key
        dispatch({ type: 'ask-cost', message: describeDictationCost(config.config) })
        return
      }
    }
    let status = (await speech.getMicrophoneStatus()).status
    if (status === 'not-determined') status = (await speech.requestMicrophone()).status
    const blocked = describeMicrophoneStatus(status, platform)
    if (blocked) {
      dispatch({ type: 'fail', message: blocked })
      return
    }
    try {
      await getRecorder().start()
    } catch (error) {
      dispatch({ type: 'fail', message: describeMicrophoneError(error, platform) })
      return
    }
    startedAtRef.current = Date.now()
    setElapsedMs(0)
    dispatch({ type: 'start' })
  }, [getRecorder, platform])

  // Com o balão de custo aberto, o atalho não decide por ninguém: só os botões dele.
  const toggle = useCallback(() => {
    const phase = stateRef.current.phase
    if (phase === 'recording') void finish()
    else if (phase === 'idle' || phase === 'error') void begin()
  }, [begin, finish])

  /** "Gravar" no balão de custo; `remember` é o "não perguntar de novo". */
  const confirmCost = useCallback(
    (remember: boolean) => {
      const key = pendingCostKeyRef.current
      if (stateRef.current.phase !== 'confirming' || !key) return
      // Um duplo clique em "Gravar" não abre o microfone duas vezes.
      pendingCostKeyRef.current = null
      if (remember) costConsent.remember(key)
      void begin(key)
    },
    [begin],
  )

  const cancel = useCallback(() => {
    getRecorder().cancel()
    dispatch({ type: 'cancel' })
  }, [getRecorder])

  const dismiss = useCallback(() => {
    dispatch({ type: 'dismiss' })
    setNotice(null)
  }, [])

  // Cronômetro e parada automática (o áudio tem teto de tamanho).
  useEffect(() => {
    if (state.phase !== 'recording') return undefined
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current
      setElapsedMs(elapsed)
      if (elapsed >= MAX_RECORDING_MS) void finish()
    }, 250)
    return () => window.clearInterval(timer)
  }, [finish, state.phase])

  // Fechar o app/painel no meio de uma gravação não pode deixar o microfone aceso.
  useEffect(() => () => recorderRef.current?.cancel(), [])

  return { state, elapsedMs, notice, toggle, confirmCost, cancel, dismiss }
}

export type Dictation = ReturnType<typeof useDictation>

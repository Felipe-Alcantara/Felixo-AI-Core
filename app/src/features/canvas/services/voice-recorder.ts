/**
 * Gravador de voz sobre `getUserMedia` + `MediaRecorder`. As dependências
 * entram por parâmetro: o teste usa dublês, e o app usa as do navegador.
 *
 * Duas garantias que o teste cobre: (1) o microfone é SEMPRE liberado — todas
 * as faixas param ao terminar, cancelar ou falhar, senão o indicador de
 * gravação do sistema ficaria aceso; (2) o tipo do áudio é o que o
 * `MediaRecorder` de fato usa, não um palpite.
 */

/** Ordem de preferência: webm/opus é o que Chromium (Electron) grava e as APIs aceitam. */
export const PREFERRED_AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

export type RecordedAudio = { audio: Uint8Array; mimeType: string; durationMs: number }

type TrackLike = { stop: () => void }
type StreamLike = { getTracks: () => TrackLike[] }
type RecorderLike = {
  mimeType: string
  state: string
  start: () => void
  stop: () => void
  ondataavailable: ((event: { data: { size: number; arrayBuffer: () => Promise<ArrayBuffer> } }) => void) | null
  onstop: (() => void) | null
  onerror: ((event: unknown) => void) | null
}
type RecorderConstructor = {
  new (stream: StreamLike, options?: { mimeType?: string }): RecorderLike
  isTypeSupported: (type: string) => boolean
}

export type VoiceRecorderDeps = {
  getUserMedia: (constraints: { audio: boolean }) => Promise<StreamLike>
  MediaRecorderCtor: RecorderConstructor
  now?: () => number
}

export function pickAudioType(isSupported: (type: string) => boolean): string | undefined {
  return PREFERRED_AUDIO_TYPES.find((type) => isSupported(type))
}

export function createVoiceRecorder({ getUserMedia, MediaRecorderCtor, now = () => Date.now() }: VoiceRecorderDeps) {
  let stream: StreamLike | null = null
  let recorder: RecorderLike | null = null
  let chunks: Array<Promise<ArrayBuffer>> = []
  let startedAt = 0

  function release() {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    recorder = null
    chunks = []
  }

  return {
    get active() {
      return recorder !== null
    },

    /** Abre o microfone e começa a gravar. Lança o erro do navegador (NotAllowedError…). */
    async start(): Promise<void> {
      if (recorder) return
      const opened = await getUserMedia({ audio: true })
      try {
        const type = pickAudioType((candidate) => MediaRecorderCtor.isTypeSupported(candidate))
        const created = new MediaRecorderCtor(opened, type ? { mimeType: type } : undefined)
        created.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data.arrayBuffer())
        }
        stream = opened
        recorder = created
        chunks = []
        startedAt = now()
        created.start()
      } catch (error) {
        opened.getTracks().forEach((track) => track.stop())
        stream = null
        recorder = null
        throw error
      }
    },

    /** Para e devolve o áudio inteiro; o microfone é liberado de qualquer jeito. */
    stop(): Promise<RecordedAudio> {
      const current = recorder
      if (!current) return Promise.reject(new Error('Nenhuma gravação em andamento.'))
      const durationMs = now() - startedAt
      return new Promise<RecordedAudio>((resolve, reject) => {
        let settled = false
        const finish = async () => {
          if (settled) return
          settled = true
          try {
            const parts = await Promise.all(chunks)
            const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
            const audio = new Uint8Array(total)
            let offset = 0
            for (const part of parts) {
              audio.set(new Uint8Array(part), offset)
              offset += part.byteLength
            }
            resolve({ audio, mimeType: current.mimeType || 'audio/webm', durationMs })
          } catch (error) {
            reject(error)
          } finally {
            release()
          }
        }
        current.onstop = () => void finish()
        current.onerror = (event) => {
          if (settled) return
          settled = true
          release()
          reject(event instanceof Error ? event : new Error('Falha na gravação.'))
        }
        try {
          if (current.state === 'inactive') void finish()
          else current.stop()
        } catch (error) {
          settled = true
          release()
          reject(error)
        }
      })
    },

    /** Descarta a gravação e libera o microfone. */
    cancel(): void {
      const current = recorder
      if (current) {
        current.ondataavailable = null
        current.onstop = null
        current.onerror = null
        try {
          if (current.state !== 'inactive') current.stop()
        } catch {
          // Já parado.
        }
      }
      release()
    },
  }
}

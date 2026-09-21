import { describe, expect, it, vi } from 'vitest'
import { PREFERRED_AUDIO_TYPES, createVoiceRecorder, pickAudioType } from './voice-recorder'

type Ctor = Parameters<typeof createVoiceRecorder>[0]['MediaRecorderCtor']
type Chunk = { size: number; arrayBuffer: () => Promise<ArrayBuffer> }

function chunk(bytes: number[]): Chunk {
  return { size: bytes.length, arrayBuffer: async () => new Uint8Array(bytes).buffer }
}

function setup({ supported = ['audio/webm;codecs=opus'], startError, mime = 'audio/webm;codecs=opus' }: {
  supported?: string[]; startError?: Error; mime?: string
} = {}) {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] }
  const instances: FakeRecorder[] = []
  class FakeRecorder {
    mimeType = mime
    state = 'inactive'
    ondataavailable: ((event: { data: Chunk }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: ((event: unknown) => void) | null = null
    stream: unknown
    options?: { mimeType?: string }
    constructor(streamArg: unknown, options?: { mimeType?: string }) {
      this.stream = streamArg
      this.options = options
      instances.push(this)
    }
    start() {
      if (startError) throw startError
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: chunk([1, 2]) })
      this.ondataavailable?.({ data: chunk([3]) })
      this.onstop?.()
    }
    static isTypeSupported = (type: string) => supported.includes(type)
  }
  let clock = 1000
  const getUserMedia = vi.fn(async () => stream)
  const recorder = createVoiceRecorder({
    getUserMedia,
    MediaRecorderCtor: FakeRecorder as unknown as Ctor,
    now: () => clock,
  })
  return { recorder, track, getUserMedia, instances, advance: (ms: number) => { clock += ms } }
}

describe('pickAudioType', () => {
  it('escolhe o primeiro tipo suportado, na ordem de preferência', () => {
    expect(pickAudioType(() => true)).toBe(PREFERRED_AUDIO_TYPES[0])
    expect(pickAudioType((t) => t === 'audio/mp4')).toBe('audio/mp4')
    expect(pickAudioType(() => false)).toBeUndefined()
  })
})

describe('createVoiceRecorder', () => {
  it('grava, junta os pedaços em ordem e LIBERA o microfone', async () => {
    const { recorder, track, advance } = setup()
    await recorder.start()
    expect(recorder.active).toBe(true)
    advance(2500)
    const result = await recorder.stop()
    expect([...result.audio]).toEqual([1, 2, 3])
    expect(result.mimeType).toBe('audio/webm;codecs=opus')
    expect(result.durationMs).toBe(2500)
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(recorder.active).toBe(false)
  })

  it('usa o tipo suportado e cai no padrão do navegador quando nenhum da lista serve', async () => {
    const primeiro = setup({ supported: ['audio/ogg;codecs=opus'] })
    await primeiro.recorder.start()
    expect(primeiro.instances[0].options).toEqual({ mimeType: 'audio/ogg;codecs=opus' })
    const nenhum = setup({ supported: [] })
    await nenhum.recorder.start()
    expect(nenhum.instances[0].options).toBeUndefined()
  })

  it('cancelar libera o microfone e não entrega áudio', async () => {
    const { recorder, track } = setup()
    await recorder.start()
    recorder.cancel()
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(recorder.active).toBe(false)
    await expect(recorder.stop()).rejects.toThrow(/Nenhuma gravação/)
  })

  it('se o MediaRecorder falha ao iniciar, o microfone é liberado e o erro sobe', async () => {
    const { recorder, track } = setup({ startError: new Error('boom') })
    await expect(recorder.start()).rejects.toThrow('boom')
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(recorder.active).toBe(false)
  })

  it('erro de permissão do getUserMedia sobe intacto (a mensagem por SO é de quem chama)', async () => {
    const negado = Object.assign(new Error('x'), { name: 'NotAllowedError' })
    const recorder = createVoiceRecorder({
      getUserMedia: async () => { throw negado },
      MediaRecorderCtor: class {} as unknown as Ctor,
    })
    await expect(recorder.start()).rejects.toBe(negado)
    expect(recorder.active).toBe(false)
  })

  it('iniciar duas vezes não abre dois microfones', async () => {
    const { recorder, getUserMedia } = setup()
    await recorder.start()
    await recorder.start()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })
})

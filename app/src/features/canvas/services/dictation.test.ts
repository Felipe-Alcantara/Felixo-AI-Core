import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DICTATION_SHORTCUT,
  IDLE,
  OPENAI_TRANSCRIPTION_USD_PER_MINUTE,
  describeDictationCost,
  describeMicrophoneError,
  describeMicrophoneStatus,
  dictationReducer,
  formatElapsed,
  formatShortcut,
  isLoopbackEndpoint,
  matchesShortcut,
  readShortcut,
  sanitizeDictatedText,
  shortcutFromEvent,
  type DictationState,
} from './dictation'

// Caracteres perigosos montados por código: o arquivo de teste não carrega
// nenhum controle nem invisível como literal.
const c = (...codes: number[]) => String.fromCharCode(...codes)
const ESC = c(0x1b)
const BEL = c(0x07)
const NUL = c(0)
const DEL = c(0x7f)
const CSI_C1 = c(0x9b)
const RLO = c(0x202e)
const ZWSP = c(0x200b)
const BOM = c(0xfeff)
const LRI = c(0x2066)
const PDI = c(0x2069)
const hasControl = (text: string) => [...text].some((ch) => ch.charCodeAt(0) < 0x20 || (ch.charCodeAt(0) >= 0x7f && ch.charCodeAt(0) <= 0x9f))

describe('sanitizeDictatedText — o que pode ser digitado no terminal', () => {
  it('quebra de linha vira espaço: NUNCA executa o comando (critério "sem envio automático")', () => {
    expect(sanitizeDictatedText('ls -la\nrm -rf /\r\n')).toBe('ls -la rm -rf /')
    expect(sanitizeDictatedText('a\rb')).toBe('a b')
    expect(sanitizeDictatedText('um\tdois')).toBe('um dois')
  })

  it('remove qualquer controle: ESC/CSI (mexem no terminal), NUL, DEL, C1', () => {
    expect(sanitizeDictatedText(`oi${ESC}[31mvermelho${ESC}[0m`)).toBe('oi[31mvermelho[0m')
    expect(sanitizeDictatedText(`a${NUL}b${BEL}c${DEL}d${CSI_C1}e`)).toBe('abcde')
    expect(hasControl(sanitizeDictatedText(`x${ESC}]0;titulo${BEL}y\r\n`))).toBe(false)
  })

  it('remove o que disfarça texto: direção (RLO), largura zero, BOM, isolamentos', () => {
    expect(sanitizeDictatedText(`rm${RLO} -fr${ZWSP} /${BOM}`)).toBe('rm -fr /')
    expect(sanitizeDictatedText(`a${LRI}b${PDI}`)).toBe('ab')
  })

  it('preserva acentos, emoji e pontuação, colapsa espaços e apara', () => {
    expect(sanitizeDictatedText('  ação   rápida — 🎤  ')).toBe('ação rápida — 🎤')
  })

  it('limita o tamanho e devolve vazio para só-controle', () => {
    expect(sanitizeDictatedText('x'.repeat(5000)).length).toBe(2000)
    expect(sanitizeDictatedText(`\n\r${ESC}\t `)).toBe('')
  })
})

describe('mensagens do microfone', () => {
  it('permissão negada diz ONDE reabilitar, por sistema', () => {
    const negado = Object.assign(new Error('x'), { name: 'NotAllowedError' })
    expect(describeMicrophoneError(negado, 'darwin')).toMatch(/Ajustes do Sistema.*Microfone/)
    expect(describeMicrophoneError(negado, 'win32')).toMatch(/Configurações.*Privacidade.*Microfone/)
    expect(describeMicrophoneError(negado, 'linux')).toMatch(/permissão de microfone do seu sistema/)
  })
  it('sem microfone, em uso e desconhecido têm mensagens próprias', () => {
    expect(describeMicrophoneError(Object.assign(new Error(), { name: 'NotFoundError' }), 'linux')).toMatch(/Nenhum microfone/)
    expect(describeMicrophoneError(Object.assign(new Error(), { name: 'NotReadableError' }), 'linux')).toMatch(/em uso/)
    expect(describeMicrophoneError(new Error('?'), 'linux')).toMatch(/Não foi possível iniciar/)
    expect(describeMicrophoneError('lixo', 'linux')).toMatch(/Não foi possível iniciar/)
  })
  it('status do sistema: bloqueado explica; concedido/desconhecido não bloqueia', () => {
    expect(describeMicrophoneStatus('denied', 'darwin')).toMatch(/bloqueado/)
    expect(describeMicrophoneStatus('restricted', 'win32')).toMatch(/bloqueado/)
    for (const ok of ['granted', 'not-determined', 'unknown', undefined]) {
      expect(describeMicrophoneStatus(ok, 'linux')).toBeNull()
    }
  })
})

describe('dictationReducer', () => {
  const run = (state: DictationState, ...actions: Array<Parameters<typeof dictationReducer>[1]>) =>
    actions.reduce(dictationReducer, state)

  it('fluxo feliz: idle → recording → transcribing → idle', () => {
    expect(run(IDLE, { type: 'start' })).toEqual({ phase: 'recording' })
    expect(run(IDLE, { type: 'start' }, { type: 'stop' })).toEqual({ phase: 'transcribing' })
    expect(run(IDLE, { type: 'start' }, { type: 'stop' }, { type: 'done' })).toEqual(IDLE)
  })
  it('gravar de novo durante gravação/transcrição é ignorado', () => {
    expect(run(IDLE, { type: 'start' }, { type: 'start' })).toEqual({ phase: 'recording' })
    expect(run(IDLE, { type: 'start' }, { type: 'stop' }, { type: 'start' })).toEqual({ phase: 'transcribing' })
  })
  it('parar sem estar gravando, e concluir sem transcrever, não fazem nada', () => {
    expect(dictationReducer(IDLE, { type: 'stop' })).toBe(IDLE)
    expect(dictationReducer(IDLE, { type: 'done' })).toBe(IDLE)
  })
  it('falha vira erro; dá para dispensar ou gravar de novo', () => {
    const erro = run(IDLE, { type: 'start' }, { type: 'fail', message: 'sem chave' })
    expect(erro).toEqual({ phase: 'error', message: 'sem chave' })
    expect(dictationReducer(erro, { type: 'dismiss' })).toEqual(IDLE)
    expect(dictationReducer(erro, { type: 'start' })).toEqual({ phase: 'recording' })
  })
  it('cancelar volta ao repouso; dispensar fora de erro não faz nada', () => {
    expect(run(IDLE, { type: 'start' }, { type: 'cancel' })).toEqual(IDLE)
    expect(dictationReducer({ phase: 'recording' }, { type: 'dismiss' })).toEqual({ phase: 'recording' })
  })
  it('custo pela nuvem: pergunta antes de gravar; "Gravar" grava, dispensar volta ao repouso sem gravar', () => {
    const perguntando = run(IDLE, { type: 'ask-cost', message: 'custa' })
    expect(perguntando).toEqual({ phase: 'confirming', message: 'custa' })
    expect(dictationReducer(perguntando, { type: 'start' })).toEqual({ phase: 'recording' })
    expect(dictationReducer(perguntando, { type: 'dismiss' })).toEqual(IDLE)
    // Parar ou transcrever não acontece sem ter gravado.
    expect(dictationReducer(perguntando, { type: 'stop' })).toBe(perguntando)
    // Durante a gravação não se pergunta de novo.
    expect(dictationReducer({ phase: 'recording' }, { type: 'ask-cost', message: 'x' })).toEqual({ phase: 'recording' })
  })
})

describe('describeDictationCost — o que a pessoa lê antes de gravar pela nuvem', () => {
  it('na OpenAI, com o modelo na tabela, diz o preço por minuto e o teto de uma gravação', () => {
    expect(describeDictationCost({ baseUrl: 'https://api.openai.com/v1', model: 'whisper-1' })).toBe(
      'O ditado envia o áudio para api.openai.com (modelo whisper-1), que cobra US$ 0,0060 por minuto (tabela da OpenAI de 15/11/2026). Cada gravação vai até 1 min 30 s: no máximo US$ 0,0090.',
    )
    expect(describeDictationCost({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini-transcribe' })).toMatch(
      /US\$ 0,0030 por minuto/,
    )
  })
  it('outro provedor ou modelo fora da tabela não ganha preço inventado', () => {
    const groq = describeDictationCost({ baseUrl: 'https://api.groq.com/openai/v1', model: 'whisper-large-v3' })
    expect(groq).toMatch(/api\.groq\.com \(modelo whisper-large-v3\), que pode cobrar/)
    expect(groq).not.toMatch(/US\$/)
    expect(describeDictationCost({ baseUrl: 'https://api.openai.com/v1', model: 'modelo-novo' })).not.toMatch(/US\$/)
    expect(OPENAI_TRANSCRIPTION_USD_PER_MINUTE['whisper-1']).toBe(0.006)
  })
})

describe('atalho', () => {
  const ev = (
    key: string,
    mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {},
  ) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

  it('Ctrl no Windows/Linux e Cmd no macOS viram "Mod"', () => {
    expect(shortcutFromEvent(ev('m', { ctrlKey: true, shiftKey: true }), 'linux')).toBe('Mod+Shift+M')
    expect(shortcutFromEvent(ev('m', { metaKey: true, shiftKey: true }), 'darwin')).toBe('Mod+Shift+M')
    // Ctrl no macOS NÃO é Mod (é outra tecla no Mac).
    expect(shortcutFromEvent(ev('m', { ctrlKey: true, shiftKey: true }), 'darwin')).toBeNull()
  })
  it('tecla solta ou só modificador não vira atalho (roubaria a digitação)', () => {
    expect(shortcutFromEvent(ev('m'), 'linux')).toBeNull()
    expect(shortcutFromEvent(ev('Shift', { shiftKey: true }), 'linux')).toBeNull()
    expect(shortcutFromEvent(ev('Control', { ctrlKey: true }), 'linux')).toBeNull()
    expect(shortcutFromEvent(ev('m', { shiftKey: true }), 'linux')).toBeNull()
  })
  it('matchesShortcut compara pelo mesmo formato', () => {
    expect(matchesShortcut(ev('M', { ctrlKey: true, shiftKey: true }), DEFAULT_DICTATION_SHORTCUT, 'win32')).toBe(true)
    expect(matchesShortcut(ev('m', { ctrlKey: true }), DEFAULT_DICTATION_SHORTCUT, 'win32')).toBe(false)
  })
  it('formatShortcut mostra Ctrl ou ⌘', () => {
    expect(formatShortcut('Mod+Shift+M', 'linux')).toBe('Ctrl+Shift+M')
    expect(formatShortcut('Mod+Shift+M', 'darwin')).toBe('⌘ShiftM')
  })
  it('readShortcut aceita o formato gerado e devolve o padrão para lixo', () => {
    expect(readShortcut('Mod+Alt+D')).toBe('Mod+Alt+D')
    expect(readShortcut('Alt+F9')).toBe('Alt+F9')
    for (const ruim of ['M', 'Shift+M', '', 'a b', null, 3, 'Mod+']) {
      expect(readShortcut(ruim)).toBe(DEFAULT_DICTATION_SHORTCUT)
    }
  })
})

describe('formatElapsed', () => {
  it('mostra m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(7400)).toBe('0:07')
    expect(formatElapsed(83_000)).toBe('1:23')
    expect(formatElapsed(-5)).toBe('0:00')
  })
})

describe('isLoopbackEndpoint — servidor local × nuvem', () => {
  it('só endereços desta máquina contam como servidor local', () => {
    for (const local of ['http://localhost:8080/v1', 'http://127.0.0.1:9000', 'https://localhost/v1']) {
      expect(isLoopbackEndpoint(local), local).toBe(true)
    }
    for (const remoto of ['https://api.openai.com/v1', 'http://192.168.0.5:8080', 'https://localhost.evil.com/v1', 'http://x', '', null, 3]) {
      expect(isLoopbackEndpoint(remoto), String(remoto)).toBe(false)
    }
  })

  it('renderer e processo principal concordam (paridade): é a regra que decide se a chave é exigida', () => {
    const require = createRequire(import.meta.url)
    const main = require('../../../../electron/services/speech/speech-settings-store.cjs') as {
      isLoopbackBaseUrl: (value: unknown) => boolean
    }
    const amostras = [
      'http://localhost:8080/v1', 'http://127.0.0.1:9000', 'http://[::1]:8080/v1', 'https://localhost/v1',
      'https://api.openai.com/v1', 'http://192.168.0.5:8080', 'https://localhost.evil.com/v1',
      'http://user:pass@localhost/v1', 'ftp://localhost', 'localhost:8080', '', '   ',
    ]
    for (const amostra of amostras) {
      expect(isLoopbackEndpoint(amostra), amostra).toBe(main.isLoopbackBaseUrl(amostra))
    }
  })
})

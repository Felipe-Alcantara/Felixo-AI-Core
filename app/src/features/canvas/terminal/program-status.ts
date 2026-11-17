/**
 * Program Status Protocol (OSC 7501, revisão 0.4): o programa diz o que está
 * fazendo, em vez de o app adivinhar pela tela. Módulo puro, sem DOM: recebe o
 * que o xterm entrega ao tratador do OSC (o texto depois de `7501;`) e devolve
 * o relato validado ou `null` (descartado inteiro, como manda a especificação).
 * Tudo aqui é não confiável: texto puro, sem controle, com tamanho limitado.
 */

export type ProgramState = 'idle' | 'working' | 'done' | 'blocked' | 'error'
export type ProgramBlockKind = 'permission' | 'question' | 'auth'

export type ProgramStatusMessage =
  | { type: 'probe' }
  | { type: 'clear'; id?: string }
  | {
      type: 'report'
      state: ProgramState
      /** Registro raiz quando ausente; só o raiz manda no selo do bloco. */
      id?: string
      kind?: ProgramBlockKind
      progress?: number
      app?: string
      title?: string
      msg?: string
    }

/** Resposta ao `OSC 7501 ; ? ST`: o terminal declara o que entende. */
export const PROGRAM_STATUS_PROBE_REPLY =
  '\x1b]7501;?:states=idle,working,done,blocked,error:kinds=permission,question,auth\x1b\\'

const STATES: ReadonlySet<string> = new Set(['idle', 'working', 'done', 'blocked', 'error'])
const KINDS: ReadonlySet<string> = new Set(['permission', 'question', 'auth'])
const PAIR_VALUE = /^[A-Za-z0-9_.,+/=-]*$/
const KEY = /^[a-z]{1,16}$/
const SEGMENT = /^[A-Za-z0-9_.+-]{1,32}$/
const APP = /^[A-Za-z0-9_.+-]{1,32}$/
const MAX_TITLE_BYTES = 192
const MAX_MSG_BYTES = 2048
// 4096 do protocolo, menos o prefixo `ESC ] 7501 ;` e o terminador.
const MAX_BODY_CHARS = 4096

const CONTROL_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]/u
// Bidi e invisíveis: não são "controle" para a especificação, mas enganam a leitura.
const INVISIBLE_CHARS = /\p{Cf}/gu

function decodeBase64Text(value: string, maxBytes: number): string | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null
  try {
    const binary = atob(value)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    if (bytes.length > maxBytes) return null
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (CONTROL_CHARS.test(text)) return null
    return text.replace(INVISIBLE_CHARS, '').trim()
  } catch {
    return null
  }
}

function validId(id: string): boolean {
  const segments = id.split('/')
  return id.length <= 128 && segments.length <= 8 && segments.every((segment) => SEGMENT.test(segment))
}

export function parseProgramStatus(data: string): ProgramStatusMessage | null {
  if (data.length > MAX_BODY_CHARS) return null
  if (data.trim() === '?') return { type: 'probe' }

  const pairs = new Map<string, string>()
  for (const raw of data.split(':')) {
    const index = raw.indexOf('=')
    if (index < 0) continue
    const key = raw.slice(0, index).trim()
    const value = raw.slice(index + 1).trim()
    // Par malformado é pulado; o resto do relato segue valendo.
    if (!KEY.test(key) || !PAIR_VALUE.test(value)) continue
    pairs.set(key, value)
  }

  const state = pairs.get('state')
  if (!state) return null
  const id = pairs.get('id')
  if (id !== undefined && !validId(id)) return null

  if (state === 'clear') return id === undefined ? { type: 'clear' } : { type: 'clear', id }
  if (!STATES.has(state)) return null

  const report: Extract<ProgramStatusMessage, { type: 'report' }> = {
    type: 'report',
    state: state as ProgramState,
  }
  if (id !== undefined) report.id = id

  const kind = pairs.get('kind')
  if (state === 'blocked' && kind && KINDS.has(kind)) report.kind = kind as ProgramBlockKind

  const progress = pairs.get('progress')
  if (progress !== undefined && /^\d{1,3}$/.test(progress) && (state === 'working' || state === 'blocked')) {
    const value = Number(progress)
    if (value <= 100) report.progress = value
  }

  const app = pairs.get('app')
  if (app && APP.test(app)) report.app = app

  for (const [key, max] of [['title', MAX_TITLE_BYTES], ['msg', MAX_MSG_BYTES]] as const) {
    const encoded = pairs.get(key)
    if (encoded === undefined) continue
    const text = decodeBase64Text(encoded, max)
    // Base64 inválido ou controle no texto descarta o relato inteiro.
    if (text === null) return null
    if (text) report[key] = text
  }
  return report
}

/**
 * Assunto da conversa a partir do título da janela (OSC 0/2): tira o glifo de
 * estado do começo (`✳`, `◐`, braille do Codex), o nome da própria CLI e
 * qualquer controle ou invisível. Devolve `undefined` quando sobra só ruído.
 */
const GENERIC_TITLES = new Set(['claude code', 'claude', 'codex', 'gemini', 'openia'])

export function subjectFromTitle(title: string): string | undefined {
  const cleaned = title
    .replace(new RegExp(CONTROL_CHARS.source, 'gu'), ' ')
    .replace(INVISIBLE_CHARS, '')
    // glifos de estado no início: estrelas/asteriscos, círculos, braille
    .replace(/^[\s\p{So}\p{Script=Braille}*]+/u, '')
    .trim()
  const parts = cleaned.split('|').map((part) => part.trim()).filter((part) => !GENERIC_TITLES.has(part.toLowerCase()))
  const subject = parts.join(' | ').slice(0, 120).trim()
  return subject || undefined
}

/** Título trabalhando = glifo de spinner no início (`◐◑◒◓` do Claude, braille do Codex). */
export function titleSaysWorking(title: string): boolean {
  return /^[\p{So}\p{Script=Braille}]/u.test(title.trimStart()) && !/^[✳✱]/u.test(title.trimStart())
}

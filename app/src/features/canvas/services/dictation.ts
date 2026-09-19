/**
 * Regras do ditado por voz que não dependem de React nem do navegador: o que
 * pode ser digitado no terminal, o que dizer quando o microfone falha, a
 * máquina de estados da gravação e o atalho. Puro, para ter teste em vez de
 * revisão visual.
 */

// ── Texto ditado → terminal ────────────────────────────────────────────────

const MAX_DICTATED_CHARS = 2000

// Montados por código (e não escritos como literais) para o arquivo-fonte não
// carregar caracteres invisíveis nem de controle.
//   C0, DEL e C1 — inclui ESC e CSI: nada de controle chega ao PTY.
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}-${String.fromCharCode(0x9f)}]`, 'g')
//   Largura zero, marcas e sobreposições de direção, isolamentos e BOM:
//   escondem o que o texto realmente diz (ex.: uma sobreposição RTL).
const INVISIBLE_CHARS = new RegExp(
  `[${['200b-200f', '202a-202e', '2060-2064', '2066-2069', 'feff'].map((range) => range.split('-').map((hex) => String.fromCharCode(parseInt(hex, 16))).join('-')).join('')}]`,
  'g',
)
const LINE_BREAKS = /[\r\n\t\v\f]+/g

/** Há algum caractere de controle (C0/DEL/C1)? É a checagem de "isto pode ser digitado sem executar nada". */
export function containsControlChars(text: string): boolean {
  return new RegExp(CONTROL_CHARS.source).test(text)
}

/**
 * Limpa o texto transcrito ANTES de digitá-lo no PTY. O texto vem de uma API
 * externa e vai para um shell/agente: uma quebra de linha o EXECUTARIA (o
 * critério "sem envio automático"), e uma sequência de escape mexeria no
 * terminal. Por isso sai tudo que é controle e tudo que disfarça texto;
 * quebras e tabs viram espaço.
 */
export function sanitizeDictatedText(raw: string): string {
  return raw
    .replace(LINE_BREAKS, ' ')
    .replace(CONTROL_CHARS, '')
    .replace(INVISIBLE_CHARS, '')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, MAX_DICTATED_CHARS)
}

// ── Erros do microfone ─────────────────────────────────────────────────────

export type MicrophonePlatform = 'darwin' | 'win32' | 'linux' | string

/** Onde a pessoa reabilita o microfone, por sistema. */
function permissionHint(platform: MicrophonePlatform): string {
  if (platform === 'darwin') return 'Abra Ajustes do Sistema → Privacidade e Segurança → Microfone e ative o Felixo AI Core.'
  if (platform === 'win32') return 'Abra Configurações → Privacidade e segurança → Microfone e permita que apps de desktop usem o microfone.'
  return 'Confira a permissão de microfone do seu sistema (portal/PipeWire/PulseAudio) para o Felixo AI Core.'
}

/** Mensagem clara para uma falha ao abrir o microfone. */
export function describeMicrophoneError(error: unknown, platform: MicrophonePlatform): string {
  const name =
    error instanceof Error
      ? error.name
      : typeof error === 'object' && error
        ? String((error as { name?: unknown }).name ?? '')
        : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return `O acesso ao microfone foi negado. ${permissionHint(platform)}`
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Nenhum microfone foi encontrado. Conecte um microfone (ou headset) e tente de novo.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'Não consegui usar o microfone: ele pode estar em uso por outro app ou desconectado.'
  }
  return 'Não foi possível iniciar a gravação do microfone.'
}

/** Mensagem quando o SISTEMA já informa que o acesso está bloqueado (macOS/Windows). */
export function describeMicrophoneStatus(status: string | undefined, platform: MicrophonePlatform): string | null {
  if (status === 'denied' || status === 'restricted') {
    return `O acesso ao microfone está bloqueado neste sistema. ${permissionHint(platform)}`
  }
  return null
}

// ── Máquina de estados da gravação ─────────────────────────────────────────

export type DictationState =
  | { phase: 'idle' }
  | { phase: 'recording' }
  | { phase: 'transcribing' }
  | { phase: 'error'; message: string }

export type DictationAction =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'cancel' }
  | { type: 'done' }
  | { type: 'fail'; message: string }
  | { type: 'dismiss' }

export const IDLE: DictationState = { phase: 'idle' }

/**
 * Transições permitidas. Gravar de novo durante a transcrição é ignorado (o
 * áudio anterior ainda está a caminho), e um erro pode ser dispensado ou
 * substituído por uma nova gravação.
 */
export function dictationReducer(state: DictationState, action: DictationAction): DictationState {
  switch (action.type) {
    case 'start':
      return state.phase === 'idle' || state.phase === 'error' ? { phase: 'recording' } : state
    case 'stop':
      return state.phase === 'recording' ? { phase: 'transcribing' } : state
    case 'cancel':
      return state.phase === 'recording' || state.phase === 'transcribing' ? IDLE : state
    case 'done':
      return state.phase === 'transcribing' ? IDLE : state
    case 'fail':
      return { phase: 'error', message: action.message }
    case 'dismiss':
      return state.phase === 'error' ? IDLE : state
  }
}

// ── Atalho ─────────────────────────────────────────────────────────────────

/** `Mod` = Ctrl no Windows/Linux e Cmd no macOS. */
export const DEFAULT_DICTATION_SHORTCUT = 'Mod+Shift+M'

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift', 'AltGraph', 'OS'])

/** Atalho digitado pela pessoa → texto (`Mod+Shift+M`); `null` se for só modificador ou não tiver Mod/Alt. */
export function shortcutFromEvent(event: KeyEventLike, platform: MicrophonePlatform): string | null {
  if (MODIFIER_KEYS.has(event.key) || !event.key) return null
  const mod = platform === 'darwin' ? event.metaKey : event.ctrlKey
  // Tecla solta (sem Mod/Alt) viraria um atalho que rouba a digitação.
  if (!mod && !event.altKey) return null
  const parts: string[] = []
  if (mod) parts.push('Mod')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key)
  return parts.join('+')
}

/** O evento corresponde ao atalho guardado? */
export function matchesShortcut(event: KeyEventLike, shortcut: string, platform: MicrophonePlatform): boolean {
  return shortcutFromEvent(event, platform) === shortcut
}

/** Texto do atalho para mostrar: `Mod` vira Ctrl ou ⌘. */
export function formatShortcut(shortcut: string, platform: MicrophonePlatform): string {
  const mac = platform === 'darwin'
  return shortcut
    .split('+')
    .map((part) => (part === 'Mod' ? (mac ? '⌘' : 'Ctrl') : part))
    .join(mac ? '' : '+')
}

/** Só um atalho no formato que `shortcutFromEvent` gera vale (vindo do localStorage pode ser lixo). */
export function readShortcut(value: unknown): string {
  return typeof value === 'string' && /^(Mod\+)?(Alt\+)?(Shift\+)?[^+\s]+$/.test(value) && /^(Mod|Alt)\+/.test(value)
    ? value
    : DEFAULT_DICTATION_SHORTCUT
}

// ── Cronômetro ─────────────────────────────────────────────────────────────

export const MAX_RECORDING_MS = 90_000

/** 0:07, 1:23 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

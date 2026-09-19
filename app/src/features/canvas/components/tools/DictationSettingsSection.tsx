import { useEffect, useState } from 'react'
import { Mic } from 'lucide-react'
import { useDictationShortcut } from '../../hooks/useDictationShortcut'
import {
  DEFAULT_DICTATION_SHORTCUT,
  describeMicrophoneStatus,
  formatShortcut,
  shortcutFromEvent,
} from '../../services/dictation'

type Config = { baseUrl: string; model: string; language: string; keyConfigured: boolean }

const CAMPO = 'felixo-control w-full text-sm'
const ROTULO = 'felixo-field-label'

/**
 * Ditado por voz: você fala, o áudio é transcrito por uma API compatível com a
 * da OpenAI e o texto entra na linha de entrada do terminal aberto — sem ser
 * enviado. A chave fica cifrada no processo principal; esta tela só sabe SE
 * ela existe.
 */
export function DictationSettingsSection() {
  const platform = window.felixo?.platform ?? 'linux'
  const speech = window.felixo?.speech
  const { shortcut, setShortcut } = useDictationShortcut()
  const [config, setConfig] = useState<Config | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [micStatus, setMicStatus] = useState<string | undefined>()
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    void speech?.getConfig().then((result) => {
      if (result?.ok && result.config) setConfig(result.config)
    })
    void speech?.getMicrophoneStatus().then((result) => {
      if (result?.ok) setMicStatus(result.status)
    })
  }, [speech])

  // Captura o próximo atalho digitado; Esc cancela.
  useEffect(() => {
    if (!capturing) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') return setCapturing(false)
      const next = shortcutFromEvent(event, platform)
      if (!next) {
        setMessage({ tone: 'error', text: 'Use Ctrl/Cmd ou Alt junto de uma tecla (ex.: Ctrl+Shift+M).' })
        return
      }
      setShortcut(next)
      setCapturing(false)
      setMessage(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturing, platform, setShortcut])

  if (!speech) {
    return <p className="text-[11px] text-zinc-500">O ditado por voz só está disponível no aplicativo.</p>
  }

  async function saveConfig() {
    if (!config) return
    const result = await speech!.saveConfig({ baseUrl: config.baseUrl, model: config.model, language: config.language })
    if (result?.ok && result.config) {
      setConfig(result.config)
      setMessage({ tone: 'ok', text: 'Configuração salva.' })
    } else {
      setMessage({ tone: 'error', text: result?.message ?? 'Não foi possível salvar.' })
    }
  }

  async function saveKey() {
    const result = await speech!.setKey(keyDraft)
    if (!result?.ok) return setMessage({ tone: 'error', text: result?.message ?? 'Não foi possível guardar a chave.' })
    setKeyDraft('')
    setConfig((current) => (current ? { ...current, keyConfigured: true } : current))
    setMessage({ tone: 'ok', text: 'Chave guardada com criptografia do sistema.' })
  }

  async function clearKey() {
    await speech!.clearKey()
    setConfig((current) => (current ? { ...current, keyConfigured: false } : current))
    setMessage({ tone: 'ok', text: 'Chave removida.' })
  }

  async function allowMic() {
    const result = await speech!.requestMicrophone()
    if (result?.ok) setMicStatus(result.status)
  }

  const blocked = describeMicrophoneStatus(micStatus, platform)

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-black/10 p-3">
      <header className="mb-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-100">
          <Mic size={14} aria-hidden="true" />
          Ditado por voz
        </h3>
      </header>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-400">
        Aperte o atalho, fale, aperte de novo: o texto entra na linha de entrada do terminal aberto e
        <strong> não é enviado sozinho</strong>. O áudio é transcrito por uma API compatível com a da OpenAI —{' '}
        <strong>ele sai do seu computador e vai para o endereço abaixo</strong>.
      </p>

      {message && (
        <p role="status" className={`mb-2 rounded p-2 text-[11px] ${message.tone === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {message.text}
        </p>
      )}

      <label htmlFor="dictation-key" className={ROTULO}>Chave da API de transcrição</label>
      <div className="mb-3 flex items-center gap-2">
        <input
          id="dictation-key"
          type="password"
          autoComplete="off"
          value={keyDraft}
          onChange={(event) => setKeyDraft(event.target.value)}
          placeholder={config?.keyConfigured ? 'Chave já configurada (digite para trocar)' : 'sk-…'}
          className={`${CAMPO} min-w-0 flex-1`}
        />
        <button type="button" onClick={() => void saveKey()} disabled={!keyDraft.trim()} className="felixo-btn felixo-secondary-action rounded px-2 py-1 text-[11px] disabled:opacity-50">
          Guardar
        </button>
        {config?.keyConfigured && (
          <button type="button" onClick={() => void clearKey()} className="felixo-btn rounded px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/10">
            Remover
          </button>
        )}
      </div>

      <label htmlFor="dictation-url" className={ROTULO}>Endereço da API</label>
      <input
        id="dictation-url"
        value={config?.baseUrl ?? ''}
        onChange={(event) => setConfig((current) => (current ? { ...current, baseUrl: event.target.value } : current))}
        placeholder="https://api.openai.com/v1"
        className={`${CAMPO} mb-1`}
      />
      <p className="mb-3 text-[11px] text-zinc-500">Só https (ou http em localhost) recebe a chave e o áudio.</p>

      <div className="mb-3 flex gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="dictation-model" className={ROTULO}>Modelo</label>
          <input id="dictation-model" value={config?.model ?? ''} onChange={(event) => setConfig((current) => (current ? { ...current, model: event.target.value } : current))} className={CAMPO} />
        </div>
        <div className="w-20">
          <label htmlFor="dictation-lang" className={ROTULO}>Idioma</label>
          <input id="dictation-lang" value={config?.language ?? ''} onChange={(event) => setConfig((current) => (current ? { ...current, language: event.target.value } : current))} placeholder="pt" className={CAMPO} />
        </div>
      </div>
      <button type="button" onClick={() => void saveConfig()} className="felixo-btn felixo-secondary-action mb-3 rounded px-2 py-1 text-[11px]">
        Salvar endereço, modelo e idioma
      </button>

      <p className={ROTULO}>Atalho</p>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCapturing((value) => !value)}
          className="felixo-btn felixo-secondary-action rounded px-2 py-1 text-[11px]"
          aria-pressed={capturing}
        >
          {capturing ? 'Pressione as teclas… (Esc cancela)' : formatShortcut(shortcut, platform)}
        </button>
        {shortcut !== DEFAULT_DICTATION_SHORTCUT && (
          <button type="button" onClick={() => setShortcut(DEFAULT_DICTATION_SHORTCUT)} className="text-[11px] text-zinc-400 hover:text-zinc-200">
            Restaurar padrão
          </button>
        )}
      </div>

      <p className={ROTULO}>Microfone</p>
      <p className="mb-1 text-[11px] text-zinc-400">
        {micStatus === 'granted' && 'Acesso permitido pelo sistema.'}
        {micStatus === 'not-determined' && 'O sistema ainda não perguntou. Ele pergunta na primeira gravação.'}
        {blocked}
        {(micStatus === 'unknown' || !micStatus) && 'Este sistema não informa o estado; a permissão é pedida ao gravar.'}
      </p>
      <button type="button" onClick={() => void allowMic()} className="felixo-btn felixo-secondary-action rounded px-2 py-1 text-[11px]">
        Verificar/permitir microfone
      </button>
    </section>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { describeQuestionOrigin, optionIndexForKey, pickPendingQuestion } from './agent-question-dialog'
import type { CanvasAgentQuestion } from '../types'

/**
 * Diálogo global para perguntas que um agente faz com `felixo perguntar`.
 *
 * É global (montado no CanvasView), não um painel de ferramenta: quem
 * perguntou está BLOQUEADO esperando a resposta, então a pergunta precisa
 * aparecer na frente da pessoa mesmo sem ela ter aberto nada. Só um humano
 * responde — clicando numa opção ou com as teclas 1–4; Esc dispensa.
 * O texto da pergunta vem do agente e é mostrado como texto puro.
 */
export function AgentQuestionDialog() {
  const [requests, setRequests] = useState<CanvasAgentQuestion[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    const result = await window.felixo?.canvas?.listQuestions?.()
    if (mountedRef.current && result?.ok) setRequests(result.requests ?? [])
  }, [])

  useEffect(() => {
    void load()
    return window.felixo?.canvas?.onQuestions?.((data) => setRequests(data.requests ?? []))
  }, [load])

  const question = useMemo(() => pickPendingQuestion(requests), [requests])

  const answer = useCallback(
    async (indice: number | null) => {
      if (!question || busy) return
      setBusy(true)
      setError(null)
      try {
        const result = await window.felixo?.canvas?.answerQuestion?.({ id: question.id, indice })
        if (mountedRef.current && !result?.ok) {
          setError(result?.message ?? 'Não foi possível responder.')
        }
      } finally {
        if (mountedRef.current) setBusy(false)
        void load()
      }
    },
    [busy, load, question],
  )

  useEffect(() => {
    if (!question) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void answer(null)
        return
      }
      const indice = optionIndexForKey(event.key, question.opcoes.length)
      if (indice !== null) void answer(indice)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [answer, question])

  if (!question) return null

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-question-title"
        className="w-full max-w-md rounded-xl border border-white/10 bg-(--f-surface-panel) p-4 text-(--f-core-white-soft) shadow-2xl"
      >
        <p className="mb-2 flex items-center gap-1.5 text-[11px] opacity-70">
          <MessageCircleQuestion size={13} aria-hidden /> {describeQuestionOrigin(question)}
        </p>
        <h2 id="agent-question-title" className="mb-3 whitespace-pre-wrap text-sm font-medium">
          {question.pergunta}
        </h2>
        <div className="flex flex-col gap-2">
          {question.opcoes.map((opcao, indice) => (
            <button
              key={`${indice}-${opcao.label}`}
              type="button"
              disabled={busy}
              onClick={() => void answer(indice)}
              className="felixo-btn rounded-sm border border-white/10 bg-white/4 px-3 py-2 text-left text-sm hover:border-white/30 hover:bg-white/10 disabled:opacity-50"
            >
              <span className="mr-2 opacity-50">{indice + 1}</span>
              {opcao.label}
              {opcao.descricao && (
                <span className="mt-0.5 block whitespace-pre-wrap text-xs opacity-60">{opcao.descricao}</span>
              )}
            </button>
          ))}
        </div>
        {error && <p className="mt-2 rounded-sm bg-red-500/10 p-2 text-xs text-red-400">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={() => void answer(null)}
          className="mt-3 text-xs opacity-60 hover:opacity-100 disabled:opacity-40"
        >
          Dispensar (Esc)
        </button>
      </div>
    </div>
  )
}

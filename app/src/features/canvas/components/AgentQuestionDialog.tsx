import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import {
  describeQuestionOrigin,
  pickPendingQuestion,
  questionFocusReturnTarget,
  questionKeyAction,
} from './agent-question-dialog'
import { focusWasLost, getFocusableElements, tabTrapTarget } from '../services/keyboard-focus'
import type { CanvasAgentQuestion } from '../types'

/** A região do canvas: para onde o foco vai se quem o tinha antes da pergunta saiu da página. */
const CANVAS_REGION_SELECTOR = '[data-felixo-region="canvas"]'

/** O que o tratamento de tecla precisa do evento (o do React e o nativo servem). */
type KeyEventLike = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'> & {
  preventDefault(): void
  stopPropagation(): void
}

/**
 * Diálogo global para perguntas que um agente faz com `felixo perguntar`.
 *
 * É global (montado no CanvasView), não um painel de ferramenta: quem
 * perguntou está BLOQUEADO esperando a resposta, então a pergunta precisa
 * aparecer na frente da pessoa mesmo sem ela ter aberto nada. Só um humano
 * responde — clicando numa opção ou com as teclas 1–4; Esc dispensa.
 * O texto da pergunta vem do agente e é mostrado como texto puro.
 *
 * É modal de verdade (`aria-modal`): ao abrir pega o foco (no painel, que tem o
 * nome da pergunta; nunca numa opção, para um Enter apressado não responder), o
 * Tab e o Shift+Tab ficam dentro dele, as teclas são tratadas no próprio
 * contêiner e engolidas (nada age no canvas, na gaveta ou no tutorial por
 * baixo), e ao fechar o foco volta a quem o tinha. Esc fecha só a pergunta.
 */
export function AgentQuestionDialog() {
  const [requests, setRequests] = useState<CanvasAgentQuestion[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  const isOpen = question !== null
  const questionId = question?.id ?? null
  const optionCount = question?.opcoes.length ?? 0

  // Abrir guarda quem tinha o foco; fechar devolve. Só uma vez por aberta: a fila
  // de perguntas troca a pergunta sem fechar o diálogo.
  useLayoutEffect(() => {
    if (!isOpen) return undefined
    const active = document.activeElement
    const saved = active instanceof HTMLElement && active !== document.body ? active : null
    const overlay = overlayRef.current
    return () => {
      const current = document.activeElement
      // O diálogo já saiu da página: o foco que estava nele caiu no body.
      const focusLost = focusWasLost(current, document.body) || Boolean(overlay?.contains(current))
      questionFocusReturnTarget({
        saved,
        focusLost,
        fallback: () => document.querySelector<HTMLElement>(CANVAS_REGION_SELECTOR),
      })?.focus({ preventScroll: true })
    }
  }, [isOpen])

  // A cada pergunta o foco vai ao painel: as opções da anterior saíram da página e
  // o foco que estava nelas cairia no body, onde Delete e `q` agem no canvas.
  useEffect(() => {
    if (questionId === null) return
    panelRef.current?.focus({ preventScroll: true })
  }, [questionId])

  const handleKey = useCallback(
    (event: KeyEventLike) => {
      // Nada do que se digita com a pergunta aberta chega ao que está por baixo.
      event.stopPropagation()
      const action = questionKeyAction({
        key: event.key,
        optionCount,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      })
      if (action.tipo === 'dispensar') {
        event.preventDefault()
        void answer(null)
      } else if (action.tipo === 'opcao') {
        event.preventDefault()
        void answer(action.indice)
      } else if (action.tipo === 'tab') {
        const panel = panelRef.current
        if (!panel) return
        const elements = getFocusableElements(panel)
        if (elements.length === 0) {
          event.preventDefault()
          panel.focus()
          return
        }
        const active = document.activeElement
        const target = tabTrapTarget(
          elements,
          active instanceof HTMLElement ? active : null,
          event.shiftKey,
          active instanceof Node && panel.contains(active),
        )
        if (target) {
          event.preventDefault()
          target.focus()
        }
      }
    },
    [answer, optionCount],
  )

  // O foco pode ter caído fora da pergunta (o body, depois de um controle sair da
  // página): a tecla não chega ao contêiner, e Delete apagaria o bloco selecionado.
  // Na fase de captura do documento, antes de qualquer outro ouvinte, ela é tratada
  // aqui. Foco dentro da pergunta é do `onKeyDown` do contêiner; foco noutro diálogo
  // modal (o "Trocar de conta?" fica por cima) é dele.
  useEffect(() => {
    if (!isOpen) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      const overlay = overlayRef.current
      const target = event.target
      if (!overlay || (target instanceof Node && overlay.contains(target))) return
      if (target instanceof Element && target.closest('[aria-modal="true"]')) return
      handleKey(event)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [handleKey, isOpen])

  // Clicar no fundo não leva o foco ao canvas (o ancestral focável): ele fica onde estava.
  const keepFocusOnBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) event.preventDefault()
  }

  if (!question) return null

  return (
    // `nokey`: Delete/Backspace com o foco aqui não chegam ao React Flow, que apagaria o
    // bloco selecionado atrás do diálogo. Camada flutuante (`shared/focus/floating-layer.ts`):
    // clicar na pergunta não é "clicar fora" da gaveta do terminal e não a fecha.
    <div
      ref={overlayRef}
      data-felixo-floating-layer
      onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => handleKey(event)}
      onMouseDown={keepFocusOnBackdropClick}
      className="nokey fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-question-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-xl border border-white/10 bg-(--f-surface-panel) p-4 text-(--f-core-white-soft) shadow-2xl focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-sky-400"
      >
        <p className="mb-2 flex items-center gap-1.5 text-[11px] opacity-70">
          <MessageCircleQuestion size={13} aria-hidden /> {describeQuestionOrigin(question)}
        </p>
        <h2 id="agent-question-title" className="mb-3 whitespace-pre-wrap text-sm font-medium">
          {question.pergunta}
        </h2>
        <div className="flex flex-col gap-2">
          {question.opcoes.map((opcao, indice) => (
            // `aria-disabled`, não `disabled`: o botão focado que fica desabilitado perde o
            // foco para o body, e Delete passaria a apagar o bloco por baixo. `answer` ignora
            // o clique enquanto responde.
            <button
              key={`${indice}-${opcao.label}`}
              type="button"
              aria-disabled={busy}
              onClick={() => void answer(indice)}
              className="felixo-btn rounded-sm border border-white/10 bg-white/4 px-3 py-2 text-left text-sm hover:border-white/30 hover:bg-white/10 aria-disabled:opacity-50"
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
          aria-disabled={busy}
          onClick={() => void answer(null)}
          className="mt-3 text-xs opacity-60 hover:opacity-100 aria-disabled:opacity-40"
        >
          Dispensar (Esc)
        </button>
      </div>
    </div>
  )
}

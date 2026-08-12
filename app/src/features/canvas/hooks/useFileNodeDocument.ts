import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * O conteúdo por trás de um bloco de arquivo, venha ele de onde vier.
 *
 * Um bloco pode estar ligado a duas coisas diferentes:
 *
 * - um `.md` da pasta do próprio app (`fileName`), que o bloco criou e é dono;
 * - um arquivo que já existe no disco (`filePath`), aberto pela pessoa e que
 *   pertence a um projeto — o bloco só aponta para ele.
 *
 * As duas fontes têm IPC próprio, por razões de segurança que não interessam a
 * quem desenha o bloco. Este hook resolve qual usar e entrega sempre a mesma
 * coisa, para o componente cuidar de aparência e não de origem.
 */

/** Espera entre a última tecla e a gravação. */
const SAVE_DEBOUNCE_MS = 300

export type FileNodeDocument = {
  content: string
  /** Caminho absoluto, para copiar e entregar a um agente. */
  absolutePath: string
  /** Mensagem quando o arquivo não pôde ser lido (sumiu, grande demais, sem permissão). */
  error: string
  /** Registra o texto novo na hora e agenda a gravação. */
  save: (next: string) => void
}

type Binding = {
  /** Arquivo da pasta do app. */
  fileName?: string
  /** Arquivo externo já autorizado. */
  filePath?: string
}

export function useFileNodeDocument({ fileName, filePath }: Binding): FileNodeDocument {
  const [content, setContent] = useState('')
  /**
   * Só o arquivo da pasta do app precisa ser resolvido, e isso chega por IPC.
   * Um arquivo externo já *é* o caminho absoluto: guardá-lo em estado seria
   * copiar um dado que a prop já tem.
   */
  const [resolvedCanvasPath, setResolvedCanvasPath] = useState('')
  /**
   * O erro carrega de qual arquivo ele veio.
   *
   * Guardar só a mensagem obrigaria a limpá-la ao trocar de arquivo, e limpar
   * no corpo do efeito é justamente a renderização em cascata que a regra
   * `set-state-in-effect` evita. Amarrado à origem, o erro do arquivo anterior
   * simplesmente deixa de valer quando a origem muda.
   */
  const [error, setError] = useState<{ source: string; message: string } | null>(null)
  const source = filePath || fileName || ''

  /**
   * O que este bloco gravou por último.
   *
   * Gravar dispara o observador do próprio arquivo, que recarrega e reescreve o
   * estado — no meio de uma digitação isso devolve texto antigo e joga o cursor
   * para o fim. Comparar com o que acabamos de gravar distingue "o arquivo
   * mudou por fora" de "o arquivo mudou porque fomos nós".
   */
  const lastWrittenRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Gravação pendente, para a saída do bloco não levar a última edição junto. */
  const pendingSaveRef = useRef<(() => void) | null>(null)

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    pending?.()
  }, [])

  useEffect(() => {
    const canvasFiles = window.felixo?.canvasFiles
    const textFiles = window.felixo?.textFiles
    let cancelled = false

    const applyContent = (next: string) => {
      if (cancelled) return
      // Eco da nossa própria gravação: o texto na tela já é este.
      if (lastWrittenRef.current !== null && next === lastWrittenRef.current) {
        return
      }
      lastWrittenRef.current = null
      setContent(next)
    }

    if (filePath && textFiles) {
      const load = () => {
        void textFiles.read({ path: filePath }).then((result) => {
          if (cancelled) return
          if (result?.ok) {
            applyContent(result.content ?? '')
            setError(null)
          } else {
            setError({
              source: filePath,
              message: result?.message ?? 'Não foi possível ler o arquivo.',
            })
          }
        })
      }

      load()
      void textFiles.watch({ path: filePath })
      const off = textFiles.onChanged((event) => {
        if (event.path === filePath) load()
      })

      return () => {
        cancelled = true
        off()
        void textFiles.unwatch({ path: filePath })
      }
    }

    if (fileName && canvasFiles) {
      const load = () => {
        void canvasFiles.read({ name: fileName }).then((result) => {
          if (!cancelled && result?.ok) applyContent(result.content ?? '')
        })
      }

      load()
      void canvasFiles.resolve({ name: fileName }).then((result) => {
        if (!cancelled && result?.ok && result.path) setResolvedCanvasPath(result.path)
      })
      void canvasFiles.watch({ name: fileName })
      const off = canvasFiles.onChanged((event) => {
        if (event.name === fileName) load()
      })

      return () => {
        cancelled = true
        off()
        void canvasFiles.unwatch({ name: fileName })
      }
    }

    return () => {
      cancelled = true
    }
  }, [fileName, filePath])

  // Uma edição não gravada não pode morrer com o bloco: fechar, apagar ou
  // trocar o arquivo do bloco precisa levar a última tecla ao disco.
  useEffect(() => flushPendingSave, [flushPendingSave, fileName, filePath])

  const save = useCallback(
    (next: string) => {
      setContent(next)

      const write = () => {
        lastWrittenRef.current = next
        if (filePath) {
          void window.felixo?.textFiles?.write({ path: filePath, content: next })
        } else if (fileName) {
          void window.felixo?.canvasFiles?.write({ name: fileName, content: next })
        }
      }

      // Agrupar as teclas evita gravar (e acordar o observador) a cada letra —
      // num arquivo de projeto de verdade isso é escrita real em disco.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      pendingSaveRef.current = write
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null
        pendingSaveRef.current = null
        write()
      }, SAVE_DEBOUNCE_MS)
    },
    [fileName, filePath],
  )

  return {
    content,
    absolutePath: filePath || resolvedCanvasPath,
    // Um erro de outro arquivo não fala sobre este.
    error: error && error.source === source ? error.message : '',
    save,
  }
}

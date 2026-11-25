import { useEffect, useRef, useState } from 'react'

interface MediaFilePreviewProps {
  kind: 'audio' | 'video'
  /** Caminho já autorizado pelo processo principal; ele devolve uma URL opaca. */
  path: string
}

/**
 * Áudio/vídeo do bloco de arquivo. O renderer não lê o arquivo: pede ao
 * processo principal uma URL `app://felixo/__midia/<id>` que o `<audio>`/`<video>`
 * lê em partes (Range). Sem reprodução automática, e só um bloco toca por vez.
 */
export function MediaFilePreview({ kind, path }: MediaFilePreviewProps) {
  const [state, setState] = useState<{ path: string; url: string; error: string }>({ path: '', url: '', error: '' })
  const [playbackError, setPlaybackError] = useState('')
  const mediaRef = useRef<HTMLMediaElement>(null)

  useEffect(() => {
    let cancelled = false
    const mediaUrl = window.felixo?.textFiles?.mediaUrl
    if (!mediaUrl) {
      queueMicrotask(() => !cancelled && setState({ path, url: '', error: 'Reprodução indisponível nesta janela.' }))
      return
    }
    void mediaUrl({ path })
      .then((result) => {
        if (cancelled) return
        setState(
          result?.ok && result.url
            ? { path, url: result.url, error: '' }
            : { path, url: '', error: result?.message ?? 'Não foi possível abrir a mídia.' },
        )
      })
      .catch(() => !cancelled && setState({ path, url: '', error: 'Não foi possível abrir a mídia.' }))
    return () => {
      cancelled = true
    }
  }, [path])

  // Um bloco toca por vez: ao começar, pausa os outros reprodutores do canvas.
  const pauseOthers = () => {
    document.querySelectorAll<HTMLMediaElement>('audio[data-canvas-media], video[data-canvas-media]').forEach((el) => {
      if (el !== mediaRef.current) el.pause()
    })
  }

  const current = state.path === path ? state : { path, url: '', error: '' }
  const error = current.error || playbackError
  const common = {
    controls: true,
    preload: 'metadata' as const,
    'data-canvas-media': '',
    onPlay: pauseOthers,
    onError: () => setPlaybackError('Este formato não toca aqui. Abra o arquivo no sistema.'),
    className: 'nodrag nowheel nopan',
  }

  return (
    <div className="nodrag nowheel nopan flex min-h-0 flex-1 flex-col items-stretch justify-center gap-2 p-3">
      {current.url &&
        (kind === 'video' ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={current.url}
            {...common}
            className="nodrag nowheel nopan min-h-0 w-full flex-1 rounded-sm bg-black object-contain"
          />
        ) : (
          <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={current.url} {...common} className="nodrag nowheel nopan w-full" />
        ))}
      {error ? (
        <p role="alert" className="text-[11px] text-theme-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

import type { CSSProperties } from 'react'

/**
 * Marca oficial do Felixo AI Core.
 *
 * A arte cyber-cat é o único asset visual da marca. Este componente só
 * controla escala e contexto de uso; nunca redesenha o símbolo.
 */

type FelixoMarkTone = 'light' | 'dark'

function brandPngAsset(path: string) {
  return `${import.meta.env.BASE_URL}brand/logos/png/${path}`
}

type FelixoSymbolProps = {
  /** Lado do símbolo em pixels. */
  size?: number
  className?: string
  tone?: FelixoMarkTone
  alt?: string
}

export function FelixoSymbol({
  size = 20,
  className,
  tone = 'light',
  alt = 'Felixo AI Core',
}: FelixoSymbolProps) {
  // A mesma arte monocromática é usada nos dois contextos de tema.
  void tone
  const filename = 'felixo-cyber-cat-4096.png'

  return (
    <img
      width={size}
      height={size}
      src={brandPngAsset(filename)}
      alt={alt}
      className={className}
      draggable={false}
      decoding="async"
    />
  )
}

type FelixoLockupProps = {
  /** Lado aproximado do símbolo; o lockup oficial acompanha em proporção. */
  size?: number
  className?: string
}

/** Usa o ícone cyber-cat com o nome da marca em texto para manter a leitura do lockup. */
export function FelixoLockup({ size = 18, className }: FelixoLockupProps) {
  return (
    <span
      className={`felixo-lockup ${className ?? ''}`.trim()}
      style={{ '--felixo-lockup-size': `${size}px` } as CSSProperties}
      role="img"
      aria-label="Felixo AI Core"
    >
      <img
        src={brandPngAsset('felixo-cyber-cat-4096.png')}
        alt=""
        className="felixo-lockup-mark"
        width={Math.round(size * 2.1)}
        height={Math.round(size * 2.1)}
        draggable={false}
        decoding="async"
      />
      <span className="felixo-lockup-text">
        <strong>Felixo</strong>
        <span>AI Core</span>
      </span>
    </span>
  )
}

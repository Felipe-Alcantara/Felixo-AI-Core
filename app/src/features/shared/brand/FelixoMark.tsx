/**
 * Marca oficial do Felixo AI Core.
 *
 * Os PNGs transparentes em `public/brand/logos/png` são as versões de UI do
 * Brand Kit. Este componente só controla escala e contexto de uso; ele não
 * redesenha, simplifica ou reinterpreta a geometria do símbolo.
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
  const filename = tone === 'dark' ? 'felixo-symbol-black-256.png' : 'felixo-symbol-white-256.png'

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

/** Usa o lockup horizontal master do Brand Kit, sem reconstruir a tipografia. */
export function FelixoLockup({ size = 18, className }: FelixoLockupProps) {
  return (
    <img
      src={brandPngAsset('felixo-ai-core-lockup-white-4096.png')}
      alt="Felixo AI Core"
      className={`felixo-lockup felixo-lockup-asset ${className ?? ''}`.trim()}
      width={Math.round(size * 7.8)}
      height={Math.round(size * 2.34)}
      draggable={false}
      decoding="async"
    />
  )
}

import { createPortal } from 'react-dom'
import type { CSSProperties, PropsWithChildren, Ref } from 'react'

type Props = PropsWithChildren<{
  surfaceRef?: Ref<HTMLDivElement>
  className?: string
  style?: CSSProperties
  role?: string
  id?: string
  ariaLabel?: string
  placement?: 'top' | 'bottom'
}>

/** Shared surface for Felixo menus. Portaling keeps compact panels from being clipped by the sidebar. */
export function FelixoPopoverSurface({
  children,
  surfaceRef,
  className = '',
  style,
  role,
  id,
  ariaLabel,
  placement = 'bottom',
}: Props) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={surfaceRef}
      id={id}
      role={role}
      aria-label={ariaLabel}
      data-placement={placement}
      data-felixo-popover-surface="true"
      className={`felixo-popover-surface ${className}`.trim()}
      style={style}
      // A portaled surface is logically inside the menu that opened it, even
      // though it lives under document.body. Stop the event at this boundary
      // so an ancestor's "click outside" handler cannot close the parent
      // panel after an option has already unmounted this surface.
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

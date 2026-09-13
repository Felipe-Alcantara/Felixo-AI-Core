import {
  Check,
  ChevronDown,
  LoaderCircle,
  Search,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { FelixoPopoverSurface } from './FelixoPopoverSurface'
import { claimFelixoSelect } from './felixo-select-coordinator'

export type FelixoSelectOption = {
  value: string
  label: ReactNode
  /** Plain text used to filter options when the visible label is composed. */
  searchText?: string
  description?: ReactNode
  meta?: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

type Props = {
  id?: string
  value: string
  options: readonly FelixoSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  invalid?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  menuLabel?: string
  className?: string
  autoFocus?: boolean
  'aria-label'?: string
}

type Position = {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

function optionText(option: FelixoSelectOption) {
  if (option.searchText) return option.searchText
  return [option.label, option.description, option.meta]
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
}

function firstEnabledIndex(options: readonly FelixoSelectOption[], fallback = 0) {
  const index = options.findIndex((option) => !option.disabled)
  return index >= 0 ? index : fallback
}

/** Compact, portal-backed listbox used by the Felixo form system. */
export function FelixoSelect({
  id,
  value,
  options,
  onChange,
  placeholder = 'Selecionar…',
  disabled = false,
  loading = false,
  invalid = false,
  searchable = false,
  searchPlaceholder = 'Buscar…',
  menuLabel,
  className = '',
  autoFocus = false,
  'aria-label': ariaLabel,
}: Props) {
  const generatedId = useId()
  const triggerId = id ?? `${generatedId}-trigger`
  const listboxId = `${triggerId}-listbox`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<Position | null>(null)

  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!searchable || !normalizedQuery) return options
    return options.filter((option) => optionText(option).toLocaleLowerCase().includes(normalizedQuery))
  }, [options, query, searchable])

  const selectedOption = options.find((option) => option.value === value)
  const safeActiveIndex = visibleOptions[activeIndex] && !visibleOptions[activeIndex]?.disabled
    ? activeIndex
    : firstEnabledIndex(visibleOptions)
  const activeOption = visibleOptions[safeActiveIndex]

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportPadding = 10
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding
    const availableAbove = rect.top - viewportPadding
    const naturalHeight = surfaceRef.current?.scrollHeight ?? 260
    const preferredHeight = Math.min(320, Math.max(150, naturalHeight))
    const placeBelow = availableBelow >= Math.min(preferredHeight, 220) || availableBelow >= availableAbove
    const maxHeight = Math.max(120, Math.min(320, placeBelow ? availableBelow : availableAbove))
    const width = rect.width
    const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding)
    const top = placeBelow
      ? rect.bottom + 6
      : Math.max(viewportPadding, rect.top - maxHeight - 6)
    setPosition({
      top,
      left,
      width,
      maxHeight,
      placement: placeBelow ? 'bottom' : 'top',
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return undefined

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, query, updatePosition, visibleOptions.length])

  useEffect(() => {
    if (!open) return undefined

    // Todos os FelixoSelect compartilham a mesma camada portal. Abrir um novo
    // menu fecha o anterior, sem tocar no formulário que contém os campos.
    return claimFelixoSelect(() => {
      setOpen(false)
      setQuery('')
    })
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || surfaceRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [open])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  const selectOption = useCallback((option: FelixoSelectOption | undefined) => {
    if (!option || option.disabled) return
    onChange(option.value)
    close()
    triggerRef.current?.focus()
  }, [close, onChange])

  const moveActive = useCallback((delta: number) => {
    if (visibleOptions.length === 0) return
    setActiveIndex((current) => {
      let next = safeActiveIndex
      for (let step = 0; step < visibleOptions.length; step += 1) {
        next = (next + delta + visibleOptions.length) % visibleOptions.length
        if (!visibleOptions[next]?.disabled) return next
      }
      return current
    })
  }, [safeActiveIndex, visibleOptions])

  const openMenu = () => {
    if (disabled || loading) return
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options))
    setQuery('')
    setOpen(true)
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        openMenu()
        if (event.key === 'Home') setActiveIndex(firstEnabledIndex(options))
        if (event.key === 'End') setActiveIndex(Math.max(0, options.length - 1))
      }
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'Tab') {
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
        setActiveIndex(firstEnabledIndex(visibleOptions))
    } else if (event.key === 'End') {
      event.preventDefault()
      for (let index = visibleOptions.length - 1; index >= 0; index -= 1) {
        if (!visibleOptions[index]?.disabled) {
          setActiveIndex(index)
          break
        }
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectOption(activeOption)
    }
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      triggerRef.current?.focus()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
      triggerRef.current?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
      triggerRef.current?.focus()
    }
  }

  const optionId = (index: number) => `${listboxId}-option-${index}`

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-busy={loading || undefined}
        aria-activedescendant={open && activeOption ? optionId(safeActiveIndex) : undefined}
        disabled={disabled || loading}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        className={`felixo-select-trigger ${open ? 'is-open' : ''} ${loading ? 'is-loading' : ''} ${invalid ? 'is-invalid' : ''} ${className}`.trim()}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="felixo-select-value">
          {loading ? (
            <span className="felixo-select-leading" aria-hidden="true"><LoaderCircle className="felixo-select-loading" size={14} strokeWidth={1.5} /></span>
          ) : selectedOption?.icon && <span className="felixo-select-leading" aria-hidden="true">{selectedOption.icon}</span>}
          <span className={selectedOption ? 'felixo-select-label' : 'felixo-select-label is-placeholder'}>
            {loading ? 'Carregando…' : selectedOption?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown className="felixo-select-chevron" size={14} strokeWidth={1.6} aria-hidden="true" />
      </button>

      {open && (
        <FelixoPopoverSurface
          surfaceRef={surfaceRef}
          id={listboxId}
          ariaLabel={menuLabel}
          placement={position?.placement}
          className="felixo-select-menu"
          style={position ? {
            top: position.top,
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
            visibility: 'visible',
          } : { visibility: 'hidden' }}
        >
          {menuLabel && <div className="felixo-select-menu-label">{menuLabel}</div>}
          {searchable && (
            <label className="felixo-select-search">
              <Search size={13} strokeWidth={1.6} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoFocus
              />
            </label>
          )}
          <div className="felixo-select-options" role="listbox" aria-label={menuLabel ?? ariaLabel}>
            {visibleOptions.length === 0 ? (
              <div className="felixo-select-empty">Nenhuma opção encontrada</div>
            ) : visibleOptions.map((option, index) => (
              <div
                id={optionId(index)}
                key={`${option.value}-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                className={`felixo-select-option ${option.value === value ? 'is-selected' : ''} ${index === safeActiveIndex ? 'is-active' : ''} ${option.disabled ? 'is-disabled' : ''}`.trim()}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={(event) => {
                  // Selecting an item closes only this listbox. The parent
                  // form/flyout must stay mounted for the next step (account,
                  // model, effort, project…).
                  event.stopPropagation()
                  selectOption(option)
                }}
              >
                {option.icon && <span className="felixo-select-option-icon" aria-hidden="true">{option.icon}</span>}
                <span className="felixo-select-option-copy">
                  <span className="felixo-select-option-label">{option.label}</span>
                  {option.description && <span className="felixo-select-option-description">{option.description}</span>}
                  {option.meta && <span className="felixo-select-option-meta">{option.meta}</span>}
                </span>
                {option.value === value && <Check className="felixo-select-check" size={14} strokeWidth={1.8} aria-hidden="true" />}
              </div>
            ))}
          </div>
        </FelixoPopoverSurface>
      )}
    </>
  )
}

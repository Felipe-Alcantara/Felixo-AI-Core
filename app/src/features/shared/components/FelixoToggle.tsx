type FelixoToggleProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

/** Interruptor on/off compartilhado — mesmo visual em qualquer tela de configurações. */
export function FelixoToggle({ checked, onChange, label, disabled }: FelixoToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="felixo-switch"
    >
      <span className="felixo-switch-thumb" />
    </button>
  )
}

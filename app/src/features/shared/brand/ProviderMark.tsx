import { Terminal } from 'lucide-react'
import { providerIdentity } from './provider-identity'

/** One optical slot across canvas, inspector and launcher. No network at runtime. */
export function ProviderMark({ command, size = 16 }: { command?: string; size?: number }) {
  const provider = providerIdentity(command)
  const providerClass = provider.asset ? `felixo-provider-mark--${provider.id}` : ''
  return (
    <span className={`felixo-provider-mark ${providerClass}`} title={provider.label} aria-label={provider.label}
      style={{ width: size, height: size }}>
      {provider.asset ? (
        <img src={`${import.meta.env.BASE_URL}brand/providers/${provider.asset}.svg`}
          width={size} height={size} alt="" draggable={false} />
      ) : <Terminal size={size} strokeWidth={1.5} aria-hidden />}
    </span>
  )
}

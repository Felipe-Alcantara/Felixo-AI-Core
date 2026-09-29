import { describeLinkDestination } from './link-destination'

/**
 * Um link que não abriu, como o processo principal manda
 * (`external-links.cjs`, canal `external-links:open-failed`): `recusado` pela
 * política, com o código do motivo, ou `falhou` no sistema.
 */
export type ExternalOpenFailure = { url: string; kind: 'recusado' | 'falhou'; reason?: string }

/**
 * O aviso de um link que não abriu. O processo principal manda
 * `{ url, kind, reason? }` (`external-links.cjs`) depois que o menu já fechou:
 * `falhou` é o sistema, que não entregou o endereço a um navegador (sem
 * navegador padrão, por exemplo); `recusado` é a política do main, que confere
 * de novo o que o renderer já aprovou.
 */
export type LinkOpenFailureNotice = {
  title: string
  detail: string
  /** O que o botão de copiar escreve: o endereço como foi pedido. */
  copyText: string
  /** "Copiar link", ou "Copiar endereço" num e-mail (o rótulo do menu). */
  copyLabel: string
}

/**
 * Confere o que chegou pelo IPC: o evento vem de outro processo, e um campo
 * que não é texto lançaria ao entrar num template. Devolve `null` para o que
 * não dá para mostrar.
 */
export function parseLinkOpenFailure(value: unknown): ExternalOpenFailure | null {
  if (!value || typeof value !== 'object') return null
  const { url, kind, reason } = value as Record<string, unknown>
  if (typeof url !== 'string' || !url) return null
  if (kind !== 'falhou' && kind !== 'recusado') return null
  return { url, kind, ...(typeof reason === 'string' && reason ? { reason } : {}) }
}

/**
 * O texto do aviso. Na recusa, o motivo sai da mesma política do renderer, em
 * português comum; o código que o main manda (`reason`) é só para log.
 */
export function describeLinkOpenFailure(failure: ExternalOpenFailure): LinkOpenFailureNotice {
  if (failure.kind === 'recusado') {
    const destination = describeLinkDestination(failure.url, 'markdown')
    return {
      title: 'O app não abriu este link',
      detail: destination.ok
        ? 'O endereço foi recusado na hora de abrir.'
        : `${capitalize(destination.reason)}.`,
      copyText: failure.url,
      copyLabel: 'Copiar link',
    }
  }
  // Um `mailto:` vai para o app de e-mail, não para o navegador.
  if (/^\s*mailto:/i.test(failure.url)) {
    return {
      title: 'Não foi possível abrir o app de e-mail',
      detail: 'O sistema não entregou o endereço a um app de e-mail. Copie o endereço e use no seu e-mail.',
      copyText: failure.url,
      copyLabel: 'Copiar endereço',
    }
  }
  return {
    title: 'Não foi possível abrir no navegador',
    detail: 'O sistema não entregou o endereço a um navegador. Copie o link e cole no navegador.',
    copyText: failure.url,
    copyLabel: 'Copiar link',
  }
}

function capitalize(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text
}

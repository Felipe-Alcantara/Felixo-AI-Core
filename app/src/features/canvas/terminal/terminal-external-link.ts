/**
 * Links vindos da saída de uma CLI não são conteúdo confiável. O terminal só
 * pode delegar ao navegador URLs web explícitas, e apenas quando a pessoa
 * confirma a intenção com Ctrl/Cmd+clique.
 */
export function isAllowedTerminalExternalLink(uri: string): boolean {
  const normalizedUri = uri.trim()

  // URL normaliza tab/newline antes de fazer o parse; uma saída de terminal
  // com ANSI ou controles não pode ganhar uma rota diferente nesse passo.
  if (!normalizedUri || hasTerminalControl(normalizedUri)) {
    return false
  }

  try {
    const { protocol, hostname } = new URL(normalizedUri)
    return Boolean(hostname) && (protocol === 'http:' || protocol === 'https:')
  } catch {
    return false
  }
}

function hasTerminalControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)

    if ((code >= 0 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) {
      return true
    }
  }

  return false
}

export function hasTerminalLinkModifier(event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey !== event.metaKey
}

type OpenExternalLink = (uri: string) => void

/** Abre uma URL já validada no navegador externo. */
export function openAllowedTerminalExternalLink(
  uri: string,
  openExternalLink: OpenExternalLink = (url) => window.open(url, '_blank'),
): boolean {
  if (!isAllowedTerminalExternalLink(uri)) {
    return false
  }

  openExternalLink(uri.trim())
  return true
}

/**
 * Opens a terminal URL through Electron's existing window-open handler, which
 * redirects it to the system browser instead of navigating the app window.
 */
export function activateTerminalExternalLink(
  event: MouseEvent,
  uri: string,
  openExternalLink: OpenExternalLink = (url) => window.open(url, '_blank'),
): boolean {
  if (!hasTerminalLinkModifier(event)) {
    return false
  }

  return openAllowedTerminalExternalLink(uri, openExternalLink)
}

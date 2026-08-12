/**
 * Turning a pasted image into something a terminal can carry.
 *
 * The PTY moves text and nothing else, so an image has to become a file path
 * before it can reach an agent. Chromium hands us the bitmap on the paste event
 * in most cases; when it does not — some Linux screenshot tools publish a
 * clipboard format the page never sees — the Electron main process reads the OS
 * clipboard natively instead. Both roads end in the same place: a path typed
 * into the prompt, identical on every OS and for every agent CLI.
 *
 * These helpers are the decisions that path needs, kept free of DOM events and
 * IPC so they can be tested directly.
 */

/**
 * The first image on the clipboard, or `null` when there is none.
 *
 * Chromium exposes a pasted image under `items` and a dragged/copied file under
 * `files`; which one is populated depends on the source app, so both are
 * consulted rather than guessed at.
 */
export function findClipboardImage(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) {
    return null
  }

  const fromItems = Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .find((file): file is File => file !== null)

  return fromItems ?? Array.from(clipboardData.files ?? []).find(isImageFile) ?? null
}

/**
 * Whether the clipboard carries text worth pasting as text.
 *
 * This is the guard that keeps the feature invisible: an ordinary text paste
 * must keep taking xterm's own path, untouched.
 */
export function hasClipboardText(clipboardData: DataTransfer | null): boolean {
  return Boolean(clipboardData?.getData('text/plain'))
}

/**
 * Renders a saved image path for the agent's prompt line.
 *
 * Quoted only when it contains whitespace — the agent CLIs read an unquoted
 * path fine and quotes would be noise, but a user directory with a space in it
 * would otherwise split into two arguments. The trailing space lets the person
 * keep typing right after the paste.
 */
export function formatImagePathForPrompt(filePath: string): string {
  const trimmed = filePath.trim()

  if (!trimmed) {
    return ''
  }

  return /\s/.test(trimmed) ? `"${trimmed}" ` : `${trimmed} `
}

/**
 * Se este `keydown` é o atalho de colar do sistema (Ctrl+V, Cmd+V no macOS).
 *
 * Existe porque o evento `paste` não é confiável para imagem: com uma imagem na
 * área de transferência não há nada para inserir como texto, o comando de colar
 * do Chromium vira um no-op e nenhum evento nasce. A tecla, essa, sempre chega.
 *
 * `Ctrl+Shift+V` fica de fora de propósito: esse atalho não tem acelerador de
 * menu, segue o caminho nativo do navegador e já gera um `paste` de verdade —
 * tratá-lo aqui também colaria a mesma imagem duas vezes.
 */
export function isImagePasteShortcut(event: KeyboardEvent): boolean {
  if (event.type !== 'keydown' || event.shiftKey || event.altKey) {
    return false
  }

  // No macOS o atalho é Cmd+V; em Windows e Linux, Ctrl+V.
  const usesCommandKey = event.metaKey && !event.ctrlKey
  const usesControlKey = event.ctrlKey && !event.metaKey

  return (usesCommandKey || usesControlKey) && event.key.toLowerCase() === 'v'
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

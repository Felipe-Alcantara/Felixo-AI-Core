/**
 * Resolve o `src` de uma imagem de Markdown para algo que o navegador
 * consiga carregar de fato.
 *
 * URL de verdade (`https://…`, `data:…`) passa direto. Caminho relativo
 * (`./foto.png`, a convenção do blog para imagem de post — ver
 * `src/content/posts/<slug>/` no felixo-blog) só carrega se soubermos de que
 * pasta ele é relativo: por isso todo caminho sem esquema é resolvido contra
 * `baseDir` (a pasta do arquivo aberto) e vira uma URL `file://`.
 *
 * Sem `baseDir` (uso em contexto sem arquivo em disco, como uma mensagem de
 * chat), caminho relativo sai como veio — o mesmo comportamento de antes
 * desta função existir.
 */
export function resolveMarkdownImageSrc(
  src: string | undefined,
  baseDir: string | undefined,
): string | undefined {
  if (!src) return src

  // Checado antes do esquema genérico: "C:\..." bate em `[a-z]+:`, que sem
  // essa ordem seria lido (errado) como um protocolo chamado "c".
  if (isPosixAbsolute(src) || isWindowsAbsolute(src)) {
    return toFileUrl(src)
  }

  if (hasUrlScheme(src)) return src

  if (!baseDir) return src

  return toFileUrl(joinAndNormalize(baseDir, src))
}

/**
 * Pasta de um caminho de arquivo absoluto, para virar o `baseDir` de
 * `resolveMarkdownImageSrc`. `undefined`/vazio devolve `undefined` — quem
 * ainda não tem o caminho do arquivo (documento novo, ainda salvando) não
 * deveria fingir que sabe a pasta.
 */
export function dirnameOf(absolutePath: string | undefined): string | undefined {
  if (!absolutePath) return undefined

  const normalized = absolutePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const lastSlash = normalized.lastIndexOf('/')

  if (lastSlash <= 0) return normalized.slice(0, lastSlash + 1) || '/'
  return normalized.slice(0, lastSlash)
}

/** `http:`, `https:`, `data:`, `file:`, `mailto:`, … — qualquer esquema já resolvido. */
function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

function isPosixAbsolute(value: string): boolean {
  return value.startsWith('/')
}

function isWindowsAbsolute(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value)
}

function joinAndNormalize(baseDir: string, relative: string): string {
  const base = baseDir.replace(/\\/g, '/').replace(/\/+$/, '')
  const path = relative.replace(/\\/g, '/')
  const isAbsolute = base.startsWith('/')
  const drive = /^[a-zA-Z]:/.exec(base)?.[0] ?? ''
  const withoutDrive = drive ? base.slice(drive.length) : base

  const segments = `${withoutDrive}/${path}`.split('/').filter(Boolean)
  const stack: string[] = []

  for (const segment of segments) {
    if (segment === '.') continue
    if (segment === '..') {
      stack.pop()
      continue
    }
    stack.push(segment)
  }

  const joined = stack.join('/')
  return `${drive}${isAbsolute || drive ? '/' : ''}${joined}`
}

/** Monta uma `file://` URL, com cada segmento do caminho escapado à parte. */
function toFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  const encoded = withLeadingSlash
    .split('/')
    // A letra de unidade do Windows ("C:") não é um nome de arquivo — não
    // teria por que escapar o ":" dela.
    .map((segment) =>
      /^[a-zA-Z]:$/.test(segment) ? segment : encodeURIComponent(segment),
    )
    .join('/')

  return `file://${encoded}`
}

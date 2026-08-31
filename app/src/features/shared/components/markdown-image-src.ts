/**
 * Resolve o `src` de uma imagem de Markdown para algo que o navegador
 * consiga carregar de fato.
 *
 * URLs remotas (`http:`/`https:`) e imagens `data:` pequenas e rasterizadas
 * passam por uma política explícita. Caminho relativo (`./foto.png`, a
 * convenção do blog para imagem de post — ver `src/content/posts/<slug>/` no
 * felixo-blog) só carrega se soubermos de que pasta ele é relativo: por isso
 * ele é resolvido contra `baseDir` (a pasta do arquivo aberto) e vira uma URL
 * `file://`.
 *
 * Sem `baseDir` (uso em contexto sem arquivo em disco, como uma mensagem de
 * chat), caminho relativo é recusado. Isso evita que conteúdo externo ganhe
 * acesso implícito à origem local do renderer.
 */
export const MAX_INLINE_MARKDOWN_IMAGE_BYTES = 2 * 1024 * 1024

const SAFE_DATA_IMAGE =
  /^data:(image\/(?:apng|avif|gif|jpe?g|png|webp));base64,([a-z0-9+/]+={0,2})$/i

export function resolveMarkdownImageSrc(
  src: string | undefined,
  baseDir: string | undefined,
): string | undefined {
  if (!src) return src

  const normalizedSrc = src.trim()

  if (!isSafeMarkdownImageReference(normalizedSrc)) return undefined

  if (isRemoteImageUrl(normalizedSrc) || isSafeDataImage(normalizedSrc)) {
    return normalizedSrc
  }

  if (!baseDir) return undefined

  return toFileUrl(joinAndNormalize(baseDir, decodeRelativePath(normalizedSrc)))
}

/**
 * Transformação final usada pelo `react-markdown` para todo atributo de URL.
 * O `rehype-sanitize` protege o AST; esta segunda barreira garante que os
 * componentes React e o resolver de imagens recebam somente referências que
 * esta aplicação decidiu suportar.
 */
export function sanitizeMarkdownUrl(value: string, key: string): string {
  const normalizedValue = value.trim()

  if (!normalizedValue) return ''

  if (key === 'href') {
    return isSafeMarkdownLink(normalizedValue) ? normalizedValue : ''
  }

  if (key === 'src') {
    return isSafeMarkdownImageReference(normalizedValue) ? normalizedValue : ''
  }

  return isSafeRemoteUrl(normalizedValue) ? normalizedValue : ''
}

function isSafeMarkdownLink(value: string): boolean {
  if (value.startsWith('#')) return true
  return isSafeRemoteUrl(value, ['http:', 'https:', 'mailto:'])
}

function isSafeMarkdownImageReference(value: string): boolean {
  // Checado antes do esquema genérico: `C:\\...` bate em `[a-z]+:`, que sem
  // essa ordem seria lido (errado) como um protocolo chamado `c`.
  if (isPosixAbsolute(value) || isWindowsAbsolute(value) || value.startsWith('//')) {
    return false
  }

  if (isRemoteImageUrl(value) || isSafeDataImage(value)) return true
  if (hasUrlScheme(value)) return false

  // Fragmentos e query strings não são caminhos de imagem locais.
  return !value.startsWith('#') && !value.startsWith('?') && value !== ''
}

function isRemoteImageUrl(value: string): boolean {
  return isSafeRemoteUrl(value, ['http:', 'https:'])
}

function isSafeRemoteUrl(value: string, protocols = ['http:', 'https:']): boolean {
  const scheme = getUrlScheme(value)
  return scheme ? protocols.includes(scheme) : false
}

function getUrlScheme(value: string): string | undefined {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(value)
  return match?.[1].toLowerCase() + ':'
}

function isSafeDataImage(value: string): boolean {
  const match = SAFE_DATA_IMAGE.exec(value)
  if (!match) return false

  const payload = match[2]
  if (payload.length % 4 === 1) return false

  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  const decodedBytes = Math.floor((payload.length * 3) / 4) - padding

  return decodedBytes > 0 && decodedBytes <= MAX_INLINE_MARKDOWN_IMAGE_BYTES
}

function decodeRelativePath(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    // A malformed escape is treated as a literal path character and will be
    // escaped safely by `toFileUrl` below.
    return value
  }
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

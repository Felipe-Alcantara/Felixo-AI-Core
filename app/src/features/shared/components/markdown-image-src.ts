/**
 * Resolve o `src` de uma imagem de Markdown para algo que o navegador
 * consiga carregar de fato.
 *
 * Imagens `data:` pequenas e rasterizadas passam por uma política explícita;
 * URLs remotas (`http:`/`https:`) são bloqueadas no renderer para não criar
 * requests automáticos. Caminho relativo (`./foto.png`, a
 * convenção do blog para imagem de post — ver `src/content/posts/<slug>/` no
 * felixo-blog) só carrega se soubermos de que pasta ele é relativo: por isso
 * ele é resolvido contra `baseDir` (a pasta do arquivo aberto) e vira uma URL
 * `file://`.
 *
 * Sem `baseDir` (uso em contexto sem arquivo em disco, como uma mensagem de
 * chat), caminho relativo é recusado. Isso evita que conteúdo externo ganhe
 * acesso implícito à origem local do renderer.
 */
import {
  EXTERNAL_WEB_SCHEMES,
  classifyExternalUrl,
  hasHiddenUrlCharacters,
} from '../external-url-policy'

/** O mínimo de um nó mdast que este arquivo precisa ler. */
type MarkdownUrlNode = {
  type: string
  url?: string
  identifier?: string
  data?: { hProperties?: Record<string, unknown> }
  children?: MarkdownUrlNode[]
}

/**
 * Propriedade hast em que o destino recusado por invisível segue até o
 * `rehypeKeepWrittenHref` do `MarkdownContent`, que a tira antes do sanitize.
 * Só vale com invisível de fato: HTML cru que escreva o atributo não ganha um
 * destino que abre, porque o que tem invisível nunca abre.
 */
export const HIDDEN_HREF_PROPERTY = 'dataMarkdownHiddenHref'

/**
 * Plugin remark que tira o destino de link com caractere escondido ANTES de
 * ele virar `href`. O `mdast-util-to-hast` codifica a URL (`normalizeUri`)
 * antes do `urlTransform`: U+202E vira `%E2%80%AE` e U+200B no host some no
 * parse, e a política recebe algo que já parece limpo. Aqui ainda se vê o texto
 * cru. O link vira texto (o `MarkdownLink` recebe href vazio), e o endereço de
 * um autolink continua visível e copiável, como no terminal.
 *
 * O destino cru vai junto, à parte (`HIDDEN_HREF_PROPERTY`), para o
 * `MarkdownLink` explicar a recusa com os invisíveis à mostra. Num link por
 * referência (`[texto][ref]`), o destino é o da definição.
 */
export function remarkRefuseHiddenUrlCharacters() {
  return (tree: MarkdownUrlNode) => {
    const hiddenDefinitions = new Map<string, string>()
    const keepHidden = (node: MarkdownUrlNode, url: string) => {
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, [HIDDEN_HREF_PROPERTY]: url } }
    }
    const refuse = (node: MarkdownUrlNode) => {
      if (
        (node.type === 'link' || node.type === 'definition') &&
        typeof node.url === 'string' &&
        hasHiddenUrlCharacters(node.url)
      ) {
        if (node.type === 'link') keepHidden(node, node.url)
        else if (node.identifier) hiddenDefinitions.set(node.identifier, node.url)
        node.url = ''
      }
      node.children?.forEach(refuse)
    }
    const explainReferences = (node: MarkdownUrlNode) => {
      const hidden = node.type === 'linkReference' && node.identifier ? hiddenDefinitions.get(node.identifier) : undefined
      if (hidden) keepHidden(node, hidden)
      node.children?.forEach(explainReferences)
    }
    refuse(tree)
    if (hiddenDefinitions.size > 0) explainReferences(tree)
  }
}

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

  if (isSafeDataImage(normalizedSrc)) {
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

  if (!normalizedValue || hasUrlControl(normalizedValue)) return ''

  if (key === 'href') {
    // Âncora rola o próprio documento; o resto passa pela política única de
    // URL externa (a mesma do terminal e do processo principal) e sai na
    // forma serializada, que é exatamente o que o opener vai receber.
    if (normalizedValue.startsWith('#')) return normalizedValue
    const decision = classifyExternalUrl(normalizedValue)
    return decision.ok ? decision.url : ''
  }

  if (key === 'src') {
    return isSafeMarkdownImageReference(normalizedValue) ? normalizedValue : ''
  }

  const decision = classifyExternalUrl(normalizedValue, EXTERNAL_WEB_SCHEMES)
  return decision.ok ? decision.url : ''
}

/**
 * Link relativo a outro arquivo do mesmo conjunto de documentos
 * (`OUTRO.md`, `../docs/GUIA.md#secao`). `sanitizeMarkdownUrl` o descarta
 * porque, sozinho, ele só apontaria para a origem do próprio renderer; quem
 * sabe a que conjunto o documento pertence decide para onde ele leva.
 *
 * Fica de fora tudo que já é destino por si: esquema (`https:`, `file:`,
 * `C:\`), host (`//exemplo.com`), âncora (`#secao`) e query solta.
 */
export function isRelativeMarkdownLink(value: string): boolean {
  const normalizedValue = value.trim()

  if (!normalizedValue || hasUrlControl(normalizedValue)) return false
  if (/^(?:#|\?|\/\/|\\)/.test(normalizedValue)) return false
  if (isWindowsAbsolute(normalizedValue)) return false

  return !hasUrlScheme(normalizedValue)
}

function isSafeMarkdownImageReference(value: string): boolean {
  // Checado antes do esquema genérico: `C:\\...` bate em `[a-z]+:`, que sem
  // essa ordem seria lido (errado) como um protocolo chamado `c`.
  if (isPosixAbsolute(value) || isWindowsAbsolute(value) || value.startsWith('//')) {
    return false
  }

  // Uma URL remota tem protocolo permitido, mas não pode disparar tracking ou
  // transferir contexto a um servidor externo sem uma concessão explícita.
  if (isSafeDataImage(value)) return true
  if (isRemoteImageUrl(value)) return false
  if (hasUrlScheme(value)) return false

  // Fragmentos e query strings não são caminhos de imagem locais.
  return !value.startsWith('#') && !value.startsWith('?') && value !== ''
}

function isRemoteImageUrl(value: string): boolean {
  return isSafeRemoteUrl(value, ['http:', 'https:'])
}

function isSafeRemoteUrl(value: string, protocols = ['http:', 'https:']): boolean {
  const scheme = getUrlScheme(value)
  if (!scheme || !protocols.includes(scheme)) return false

  try {
    const parsed = new URL(value)
    return parsed.protocol === scheme && Boolean(parsed.hostname)
  } catch {
    return false
  }
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

function hasUrlControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)

    if ((code >= 0 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) {
      return true
    }
  }

  return false
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

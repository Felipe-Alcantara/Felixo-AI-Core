/**
 * Para onde um link pode ir, dito para a pessoa antes de ela escolher.
 *
 * Toda superfície que mostra link vindo de conteúdo (saída do terminal,
 * Markdown, página aberta no bloco Página Web) pergunta aqui o que oferecer. A
 * regra de segurança continua sendo a de `external-url-policy`; este módulo só
 * traduz a decisão dela em escolhas e, quando recusa, num motivo legível. O
 * portão de verdade segue no processo principal, que classifica de novo antes
 * de qualquer `shell.openExternal`.
 */
import {
  EXTERNAL_OPENER_SCHEMES,
  EXTERNAL_WEB_SCHEMES,
  MAX_EXTERNAL_URL_CHARS,
  classifyExternalUrl,
  revealHiddenUrlCharacters,
  type ExternalUrlBlockReason,
} from '../external-url-policy'

/** De onde o link veio. Decide os esquemas aceitos e o tom do motivo. */
export type LinkOrigin = 'terminal' | 'markdown' | 'pagina-web'

/**
 * O terminal e a página aberta no bloco só levam a página web: é a política
 * que o app já aplicava a eles. O Markdown aceita também `mailto:`, que ele
 * oferecia antes da política única (ver `justificativas` no JSON dela).
 */
export function allowedSchemesFor(origin: LinkOrigin): readonly string[] {
  return origin === 'markdown' ? EXTERNAL_OPENER_SCHEMES : EXTERNAL_WEB_SCHEMES
}

type ApprovedDestination = {
  ok: true
  /** A serialização da política: é exatamente isto que abre ou é copiado. */
  url: string
  /**
   * O que a pessoa lê primeiro: o host da página ou o endereço de e-mail,
   * encurtado pelo meio quando é gigante (ver `shortenAddress`).
   */
  headline: string
}

/** Destinatários que um campo da query de um `mailto:` acrescenta. */
export type MailtoRecipients = {
  /** O nome do campo como um programa de e-mail em português o mostra. */
  label: 'Também para' | 'Cc' | 'Cco'
  /** Os endereços, decodificados, com os invisíveis à mostra e encurtados. */
  addresses: string
}

export type LinkDestination =
  | (ApprovedDestination & { kind: 'web' })
  | (ApprovedDestination & {
      kind: 'email'
      /**
       * O que a query acrescenta (`to`, `cc`, `bcc`), nessa ordem. A URL
       * aparece cortada no menu, e um `bcc` para um terceiro passaria sem a
       * pessoa ver.
       */
      extraRecipients: MailtoRecipients[]
    })
  | {
      ok: false
      /** Frase curta, sem jargão, que completa "Link recusado: …". */
      reason: string
      /**
       * O texto como veio, com invisíveis e controles à mostra (`⟨U+200B⟩`):
       * quem lê vê o disfarce em vez de um endereço que parece normal.
       */
      shownText: string
      /** O que "Copiar link" leva: o texto cru. Copiar nunca abre nada. */
      copyText: string
    }

export function describeLinkDestination(raw: string, origin: LinkOrigin): LinkDestination {
  const allowed = allowedSchemesFor(origin)
  const decision = classifyExternalUrl(raw, allowed)
  const text = typeof raw === 'string' ? raw.trim() : ''

  if (!decision.ok) {
    return {
      ok: false,
      reason: describeRefusal(decision.reason, decision.scheme, allowed),
      shownText: revealHiddenUrlCharacters(text),
      copyText: text,
    }
  }

  const parsed = new URL(decision.url)
  if (decision.scheme === 'mailto:') {
    return {
      ok: true,
      url: decision.url,
      kind: 'email',
      // O e-mail é decodificado para ser lido, e um invisível codificado nele
      // fica à mostra.
      headline: shortenAddress(revealHiddenUrlCharacters(decodeMailtoPart(parsed.pathname))),
      extraRecipients: describeMailtoRecipients(parsed.search),
    }
  }
  return {
    ok: true,
    url: decision.url,
    kind: 'web',
    // `hostname` vem em Punycode (`xn--…`) para domínio com acento: é a forma
    // que não se confunde com outro domínio de letras parecidas.
    headline: shortenAddress(parsed.hostname),
  }
}

/** Campos da query de um `mailto:` que acrescentam destinatários, na ordem do menu. */
const MAILTO_RECIPIENT_FIELDS: ReadonlyArray<readonly [string, MailtoRecipients['label']]> = [
  ['to', 'Também para'],
  ['cc', 'Cc'],
  ['bcc', 'Cco'],
]

/**
 * Os destinatários da query de um `mailto:`, um item por campo; o mesmo campo
 * repetido junta os endereços.
 *
 * A query é lida à mão, e não por `URLSearchParams`: ele troca `+` por
 * espaço, como num formulário, e no `mailto:` o `+` é do endereço
 * (`fulana+tag@example.com`, RFC 6068). O nome do campo não diferencia
 * caixa (`CC=` também é cópia), como na política.
 */
function describeMailtoRecipients(search: string): MailtoRecipients[] {
  const byField = new Map<string, string[]>()
  for (const pair of search.slice(1).split('&')) {
    const separator = pair.indexOf('=')
    if (separator <= 0) continue
    const field = decodeMailtoPart(pair.slice(0, separator)).toLowerCase()
    const value = decodeMailtoPart(pair.slice(separator + 1))
    if (value) byField.set(field, [...(byField.get(field) ?? []), value])
  }

  return MAILTO_RECIPIENT_FIELDS.flatMap(([field, label]) => {
    const values = byField.get(field)
    return values
      ? [{ label, addresses: shortenAddress(revealHiddenUrlCharacters(values.join(', '))) }]
      : []
  })
}

/**
 * Quanto de um endereço (o host, ou os destinatários de um e-mail) vai para a
 * tela. A política aprova até 8.192 caracteres: um host desse tamanho, ou um
 * `mailto:` com 300 destinatários, virava um menu de milhares de pixels, com
 * as opções fora da janela. Nenhum host que o DNS resolve passa de 253, e os
 * de até 200 aparecem inteiros.
 */
export const MAX_SHOWN_ADDRESS_CHARS = 200

/**
 * Encurta pelo meio, guardando mais do fim. No host é o fim que diz de quem é
 * o site (`paypal.com.<…>.exemplo.net` é de `exemplo.net`), e no e-mail é onde
 * fica o domínio. Cortar o fim, como faria um `line-clamp`, esconderia
 * justamente o que decide para onde o link vai. Conta caracteres, não
 * unidades UTF-16: um emoji no destinatário não se parte ao meio.
 */
export function shortenAddress(text: string, max = MAX_SHOWN_ADDRESS_CHARS): string {
  const chars = Array.from(text)
  if (chars.length <= max) return text
  const head = Math.floor((max - 1) / 3)
  const tail = max - 1 - head
  return `${chars.slice(0, head).join('')}…${chars.slice(chars.length - tail).join('')}`
}

const REFUSAL_REASONS: Record<Exclude<ExternalUrlBlockReason, 'esquema'>, string> = {
  vazia: 'o endereço está vazio',
  longa: `o endereço passa de ${MAX_EXTERNAL_URL_CHARS.toLocaleString('pt-BR')} caracteres`,
  controle: 'o endereço tem caracteres de controle, que mudam o que se lê',
  invisivel: 'o endereço tem caracteres invisíveis, que podem disfarçar o destino',
  espaco: 'o endereço tem espaço no meio',
  'sem-esquema': 'falta o começo do endereço (como https://)',
  malformada: 'o endereço está malformado',
  'sem-destino': 'o endereço não diz para onde vai',
  parametro: 'o link de e-mail traz um campo que o app não repassa, como anexo',
  credenciais: 'o endereço traz usuário ou senha, que podem disfarçar o destino',
}

/** Completa "Link recusado: …" com o motivo da política, em português comum. */
export function describeRefusal(
  reason: ExternalUrlBlockReason,
  scheme: string | undefined,
  allowed: readonly string[],
): string {
  if (reason !== 'esquema') return REFUSAL_REASONS[reason]
  const accepted = listSchemes(allowed)
  return scheme
    ? `endereços ${scheme.slice(0, 32)} não abrem pelo app, só ${accepted}`
    : `o app só abre ${accepted}`
}

/** `['http:', 'https:', 'mailto:']` → `http, https e mailto`. */
function listSchemes(schemes: readonly string[]): string {
  const names = schemes.map((scheme) => scheme.replace(/:$/, ''))
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}

/** Um pedaço de `mailto:` (destinatários, nome ou valor de campo) como se lê. */
function decodeMailtoPart(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    // `%` sem par válido: mostra o texto como está, em vez de nada.
    return part
  }
}

export type LinkChoice = 'abrir-no-navegador' | 'abrir-como-pagina-web' | 'copiar-link'

export type LinkChoiceEntry = { choice: LinkChoice; label: string }

/**
 * As escolhas oferecidas, na ordem do menu.
 *
 * Link recusado não some: só perde as ações que abrem, e "Copiar link" fica —
 * é o único destino de um `file:` vindo de um hyperlink OSC 8, que a pessoa
 * pode levar adiante. A Página Web só aparece para página web e onde há um
 * canvas para receber o bloco (a tela do chat não tem).
 */
export function linkChoiceEntries(
  destination: LinkDestination,
  options: { canOpenWebpage: boolean },
): LinkChoiceEntry[] {
  if (!destination.ok) return [{ choice: 'copiar-link', label: 'Copiar link' }]

  if (destination.kind === 'email') {
    return [
      { choice: 'abrir-no-navegador', label: 'Abrir no app de e-mail' },
      { choice: 'copiar-link', label: 'Copiar endereço' },
    ]
  }

  return [
    { choice: 'abrir-no-navegador', label: 'Abrir no navegador' },
    ...(options.canOpenWebpage
      ? [{ choice: 'abrir-como-pagina-web' as const, label: 'Abrir como Página Web' }]
      : []),
    { choice: 'copiar-link', label: 'Copiar link' },
  ]
}

export type LinkChoiceEffects = {
  /** Entrega ao processo principal, que aplica a política de novo e chama o sistema. */
  openExternal: (url: string) => void
  /** Cria o bloco Página Web; `undefined` quando não há canvas montado. */
  openWebpage?: (url: string) => void
  copy: (text: string) => void
}

/**
 * Executa a escolha. Classifica de novo em vez de confiar no que o menu
 * mostrou: a escolha nunca abre algo que a política recusaria agora.
 * "Copiar" só conhece `copy` — copiar nunca abre.
 */
export function runLinkChoice(
  choice: LinkChoice,
  raw: string,
  origin: LinkOrigin,
  effects: LinkChoiceEffects,
): void {
  const destination = describeLinkDestination(raw, origin)

  if (choice === 'copiar-link') {
    effects.copy(destination.ok ? destination.url : destination.copyText)
    return
  }
  if (!destination.ok) return

  if (choice === 'abrir-no-navegador') {
    effects.openExternal(destination.url)
    return
  }
  if (destination.kind === 'web') effects.openWebpage?.(destination.url)
}

/**
 * Textos do tutorial, do aviso de novidade e da Ajuda, com i18n próprio.
 *
 * O app inteiro está em pt-BR, então pt-BR é o catálogo completo e a referência:
 * `MessageKey` é derivado dele, e todo outro locale é parcial, com fallback para
 * pt-BR. Sem biblioteca de i18n (peso no bundle sem necessidade real).
 *
 * O locale sai do `lang` do documento, nunca de `navigator.language`: o override
 * en-US do smoke trocaria o idioma do tour com o app em português.
 *
 * `en-XA` é um pseudo-locale gerado do pt-BR (acentos + cerca de 40% a mais de
 * texto). Serve para provar que nenhuma instrução é cortada quando o texto cresce;
 * não é tradução, e só é alcançável com o `lang` do documento alterado.
 *
 * Os textos dos passos são rascunho, com orçamento de título até 32 e corpo até
 * 240 caracteres (conferido em teste). O corpo de cada alvo cita o nome acessível
 * real do alvo; mudar um rótulo na interface exige mudar o texto aqui.
 */

import { HELP_BUTTON_LABEL, HELP_BUTTON_LABEL_WITH_NEWS } from './onboarding-help-label'

export type Message = string | { one: string; other: string }

export const PT_BR = {
  // Tours e novidades
  'tour.inicial.titulo': 'Tutorial do canvas',
  'tour.novidade-ajuda.titulo': 'Novidade: Ajuda',
  'novidade.ajuda.titulo': 'Ajuda',

  // Passos do tutorial inicial (um corpo por alvo da cadeia)
  'passo.projeto.titulo': 'Projeto',
  'passo.projeto.corpo':
    'Em Projetos você escolhe a pasta do computador onde os agentes trabalham. Sem projeto, o agente abre no modo Local.',
  'passo.agente.titulo': 'Agente',
  'passo.agente.corpo':
    'Em Criar, o botão Agente abre um terminal com a CLI escolhida. A seta ao lado configura CLI, modelo e projeto antes de abrir. O tutorial não abre nenhum agente.',
  'passo.agente.corpo-secao': 'Abra a seção Criar para ver o botão Agente.',
  'passo.agente.corpo-menu': 'Abra o menu do canvas para ver Criar e o botão Agente.',
  'passo.contexto.titulo': 'Contexto',
  'passo.contexto.corpo':
    'Novo bloco cria um arquivo .md no canvas. Ligue o bloco a um agente para ele ler e editar esse contexto.',
  'passo.contexto.corpo-secao': 'Abra a seção Criar para ver o botão Novo bloco.',
  'passo.contexto.corpo-menu': 'Abra o menu do canvas para ver Criar e o botão Novo bloco.',
  'passo.terminal.titulo': 'Terminais',
  'passo.terminal.corpo':
    'Cada agente é um terminal de verdade. Em Elementos você acompanha os terminais do canvas. Para um terminal comum, escolha Nenhum (shell) ao configurar o agente.',
  'passo.terminal.corpo-puck': 'Elementos está recolhido neste botão. Abra para ver os terminais.',
  'passo.terminal.corpo-canvas': 'Os terminais aparecem como blocos aqui no canvas.',
  'passo.ferramentas.titulo': 'Ferramentas',
  'passo.ferramentas.corpo':
    'Ferramentas reúne os painéis de apoio, como Notas e Prompts. Abra a seção quando precisar.',
  'passo.ferramentas.corpo-menu':
    'Abra o menu do canvas para ver Ferramentas, com painéis de apoio como Notas e Prompts.',
  'passo.ajuda.titulo': 'Onde rever',
  'passo.ajuda.corpo':
    'Pronto. Para rever este tutorial ou ver novidades, use Ajuda nesta barra. O tutorial não criou nada nem abriu agentes.',

  // Mini-tour da novidade "Ajuda"
  'passo.ajuda-novidade.titulo': 'Ajuda',
  'passo.ajuda-novidade.corpo':
    'Novidade: a Ajuda reúne o tutorial do canvas e as novidades. Reabra o tutorial quando quiser.',

  // Card do tour
  'card.contador': 'Passo {n} de {m}',
  'card.pular': 'Pular tutorial',
  'card.voltar': 'Voltar',
  'card.proximo': 'Próximo',
  'card.concluir': 'Concluir',

  // Região live (anúncios para leitor de tela)
  'anuncio.passo': 'Passo {n} de {m}: {titulo}',
  'anuncio.aberto-sem-foco': 'Tutorial do canvas aberto ao lado da barra lateral. Passo 1 de {m}: {titulo}.',
  'anuncio.retomado': 'Tutorial retomado no passo {n} de {m}: {titulo}.',
  'anuncio.concluido': 'Tutorial concluído. Reabra em Ajuda.',
  'anuncio.fechado': 'Tutorial fechado. Reabra em Ajuda.',
  'anuncio.novidade': 'Novidade em Ajuda: {titulo}.',

  // Aviso de novidade
  'aviso.rotulo': 'Novidade',
  'aviso.titulo': 'Novidade: {titulo}',
  'aviso.ver': 'Ver',
  'aviso.agora-nao': 'Agora não',

  // Ajuda
  // O botão do rail formata no chunk do canvas; as constantes são as mesmas.
  'ajuda.botao': HELP_BUTTON_LABEL,
  'ajuda.botao-novidades': { ...HELP_BUTTON_LABEL_WITH_NEWS },
  'ajuda.menu.rotulo': 'Ajuda',
  'ajuda.secao.tutorial': 'Tutorial do canvas',
  'ajuda.secao.novidades': 'Novidades',
  'ajuda.status.nao-visto': 'Não visto',
  'ajuda.status.em-andamento': 'Em andamento',
  'ajuda.status.interrompido': 'Interrompido no passo {n}',
  'ajuda.status.pulado': 'Pulado',
  'ajuda.status.concluido': 'Concluído em {data}',
  'ajuda.status.atualizado': 'Atualizado',
  'ajuda.status.novo': 'Novo',
  'ajuda.status.indisponivel': 'Indisponível nesta versão',
  'ajuda.acao.iniciar': 'Iniciar',
  'ajuda.acao.continuar': 'Continuar do passo {n}',
  'ajuda.acao.rever': 'Rever',
  'ajuda.acao.recomecar': 'Recomeçar',
  'ajuda.acao.ver': 'Ver',
  'ajuda.novidades.vazio': 'Nenhuma novidade por enquanto.',
  'ajuda.redefinir': 'Redefinir tutoriais',
  'ajuda.redefinir.pergunta': 'Redefinir o progresso de todos os tutoriais?',
  'ajuda.redefinir.confirmar': 'Redefinir',
  'ajuda.redefinir.cancelar': 'Cancelar',
  'ajuda.sem-persistencia': 'O progresso não será salvo nesta sessão.',
} satisfies Record<string, Message>

/** Toda chave de mensagem; pt-BR é completo por construção. */
export type MessageKey = keyof typeof PT_BR

export type MessageCatalog = Partial<Record<MessageKey, Message>>

export type OnboardingLocale = 'pt-BR' | 'en-XA'

export const DEFAULT_ONBOARDING_LOCALE: OnboardingLocale = 'pt-BR'
export const ONBOARDING_LOCALES: readonly OnboardingLocale[] = Object.freeze(['pt-BR', 'en-XA'])

export type MessageParams = Readonly<Record<string, string | number>>

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g
const PSEUDO_LOCALE = /-x[ab]$/i

/** Acentos do pseudo-locale: um code point por letra, então o tamanho só cresce pelo preenchimento. */
const PSEUDO_LETTERS: Readonly<Record<string, string>> = Object.freeze({
  a: 'ȧ', b: 'ƀ', c: 'ƈ', d: 'ḓ', e: 'ḗ', f: 'ƒ', g: 'ɠ', h: 'ħ', i: 'ī', j: 'ĵ', k: 'ķ', l: 'ŀ', m: 'ḿ',
  n: 'ƞ', o: 'ǿ', p: 'ƥ', q: 'ɋ', r: 'ř', s: 'ş', t: 'ŧ', u: 'ŭ', v: 'ṽ', w: 'ẇ', x: 'ẋ', y: 'ẏ', z: 'ẑ',
  A: 'Ȧ', B: 'Ɓ', C: 'Ƈ', D: 'Ḓ', E: 'Ḗ', F: 'Ƒ', G: 'Ɠ', H: 'Ħ', I: 'Ī', J: 'Ĵ', K: 'Ķ', L: 'Ŀ', M: 'Ḿ',
  N: 'Ƞ', O: 'Ǿ', P: 'Ƥ', Q: 'Ɋ', R: 'Ř', S: 'Ş', T: 'Ŧ', U: 'Ŭ', V: 'Ṽ', W: 'Ẇ', X: 'Ẋ', Y: 'Ẏ', Z: 'Ẑ',
})

/**
 * Pseudo-localiza um texto: troca letras por variantes acentuadas, preserva os
 * placeholders `{nome}` intactos e acrescenta cerca de 40% de preenchimento entre
 * colchetes, para simular um idioma mais longo que o português.
 */
export function pseudoLocalize(text: string): string {
  const converted = text
    .split(/(\{[A-Za-z][A-Za-z0-9]*\})/)
    .map((part) =>
      /^\{[A-Za-z][A-Za-z0-9]*\}$/.test(part)
        ? part
        : Array.from(part, (char) => PSEUDO_LETTERS[char] ?? char).join(''),
    )
    .join('')
  const padding = '·'.repeat(Math.max(0, Math.ceil(text.length * 0.4) - 3))
  return `[${converted} ${padding}]`
}

function pseudoMessage(message: Message): Message {
  return typeof message === 'string'
    ? pseudoLocalize(message)
    : { one: pseudoLocalize(message.one), other: pseudoLocalize(message.other) }
}

let pseudoCatalog: MessageCatalog | null = null

function enXaCatalog(): MessageCatalog {
  if (!pseudoCatalog) {
    const entries = (Object.keys(PT_BR) as MessageKey[]).map((key) => [key, pseudoMessage(PT_BR[key])] as const)
    pseudoCatalog = Object.freeze(Object.fromEntries(entries)) as MessageCatalog
  }
  return pseudoCatalog
}

/** Catálogos disponíveis por locale. Injetável nos testes para simular um locale parcial. */
export type LocaleCatalogs = Readonly<Record<string, MessageCatalog | (() => MessageCatalog)>>

export const DEFAULT_LOCALE_CATALOGS: LocaleCatalogs = Object.freeze({
  'pt-BR': PT_BR,
  'en-XA': enXaCatalog,
})

function catalogFor(locale: string, catalogs: LocaleCatalogs): MessageCatalog | null {
  if (!Object.hasOwn(catalogs, locale)) return null
  const entry = catalogs[locale]
  return typeof entry === 'function' ? entry() : entry
}

/**
 * Escolhe o locale do tutorial a partir do `lang` do documento. Casa exato
 * (sem diferenciar maiúsculas), depois só o idioma (`pt` → `pt-BR`), e cai em
 * pt-BR quando não há catálogo para o idioma pedido (`en-US`, `fr`).
 */
export function resolveOnboardingLocale(
  lang: string | null | undefined,
  catalogs: LocaleCatalogs = DEFAULT_LOCALE_CATALOGS,
): string {
  const requested = typeof lang === 'string' ? lang.trim().toLowerCase() : ''
  if (!requested) return DEFAULT_ONBOARDING_LOCALE
  const available = Object.keys(catalogs)
  const exact = available.find((locale) => locale.toLowerCase() === requested)
  if (exact) return exact
  // Pseudo-locales (região XA/XB) só valem pelo nome exato: `en-US` nunca vira `en-XA`.
  const language = requested.split('-')[0]
  const sameLanguage = available.find(
    (locale) => !PSEUDO_LOCALE.test(locale) && locale.toLowerCase().split('-')[0] === language,
  )
  return sameLanguage ?? DEFAULT_ONBOARDING_LOCALE
}

/**
 * Locale efetivo de um card: tudo ou nada. Se falta qualquer chave do card no
 * locale pedido, o card inteiro usa pt-BR, e o `lang` do card nunca mente sobre
 * o idioma do texto que ele mostra.
 */
export function resolveCardLocale(
  locale: string,
  keys: readonly MessageKey[],
  catalogs: LocaleCatalogs = DEFAULT_LOCALE_CATALOGS,
): string {
  const catalog = catalogFor(locale, catalogs)
  if (!catalog) return DEFAULT_ONBOARDING_LOCALE
  return keys.every((key) => Object.hasOwn(catalog, key)) ? locale : DEFAULT_ONBOARDING_LOCALE
}

function pluralCategory(locale: string, count: number): 'one' | 'other' {
  try {
    return new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other'
  } catch {
    return count === 1 ? 'one' : 'other'
  }
}

/**
 * Formata uma mensagem: escolhe a forma plural pelo parâmetro `n` com
 * `Intl.PluralRules` do locale e troca `{nome}` pelos parâmetros. Uma chave que
 * falta no locale usa o texto pt-BR; um placeholder sem parâmetro fica como está.
 */
export function formatOnboardingMessage(
  locale: string,
  key: MessageKey,
  params: MessageParams = {},
  catalogs: LocaleCatalogs = DEFAULT_LOCALE_CATALOGS,
): string {
  const catalog = catalogFor(locale, catalogs)
  const fromLocale = catalog && Object.hasOwn(catalog, key) ? catalog[key] : undefined
  const message: Message = fromLocale ?? PT_BR[key]
  const pluralLocale = fromLocale ? locale : DEFAULT_ONBOARDING_LOCALE
  const template =
    typeof message === 'string'
      ? message
      : message[pluralCategory(pluralLocale, typeof params.n === 'number' ? params.n : Number(params.n))]
  return template.replace(PLACEHOLDER, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

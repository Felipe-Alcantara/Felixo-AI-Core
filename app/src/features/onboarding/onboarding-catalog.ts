import type { CanvasTool } from '../canvas/components/tools/CanvasToolsMenu'
import type { CanvasTriggerNodeType } from './onboarding-canvas-triggers'
import type { MessageKey } from './onboarding-messages'

/**
 * Catálogo versionado do tutorial e das novidades.
 *
 * O catálogo diz O QUE existe neste build: os tours, os passos, onde cada passo
 * aponta e quais funções contam como novidade. O que a pessoa já viu fica no
 * estado persistido (`onboarding-state.ts`), e a detecção de "novo" é sempre por
 * IDENTIDADE: um id deste catálogo que não está em `knownFeatures`. Nunca por
 * versão do app, hash ou comparação de arquivo, que mudam a cada build sem que
 * nada de novo exista para a pessoa.
 *
 * Os textos ficam só como chaves (`MessageKey`): as mensagens moram no chunk
 * preguiçoso da interface. Este módulo vem no chunk preguiçoso da store (a
 * interface o reusa); o chunk do canvas não o carrega.
 *
 * Como anunciar uma função nova: acrescente a entrada em `ONBOARDING_FEATURES`
 * (e o tour dela em `ONBOARDING_TOURS`), suba `ONBOARDING_CATALOG_REVISION` e
 * registre a revisão nova em `CATALOG_HISTORY`. Um gatilho de canvas também põe
 * o tipo do bloco em `CANVAS_TRIGGER_NODE_TYPES` (`onboarding-canvas-triggers.ts`);
 * sem isso o build reprova. Ids nunca são removidos nem renomeados: uma entrada
 * aposentada ganha `retired: true`.
 */

/** Onde um passo pode apontar; cada id vira um seletor estável no DOM. */
export type AnchorId =
  | 'rail-menu'
  | 'rail-projetos'
  | 'rail-ajuda'
  | 'secao-criar'
  | 'criar-agente'
  | 'criar-bloco'
  | 'secao-ferramentas'
  | 'inspector-elementos'
  | 'inspector-puck'
  | 'canvas'

export type CardSide = 'direita' | 'esquerda' | 'baixo' | 'cima'

/**
 * Um alvo de um passo. Os alvos de um passo formam uma cadeia: o primeiro visível
 * vence, e o texto (`body`) acompanha o alvo escolhido. `label` é o nome acessível
 * real do alvo, e o texto precisa citá-lo (conferido em teste e no smoke).
 */
export type StepTarget = {
  anchor: AnchorId
  body: MessageKey
  label: string
  side?: CardSide
}

export type StepDef = {
  id: string
  title: MessageKey
  targets: readonly StepTarget[]
  /** Passo omitido quando a capability não está disponível neste ambiente. */
  requires?: string
  /** Ferramentas citadas pelo nome no texto, conferidas contra `TOOL_LABELS`. */
  citaFerramentas?: readonly CanvasTool[]
}

export type TourKind = 'primeiro-uso' | 'novidade'

export type TourDef = {
  id: string
  /** Sobe quando o roteiro muda; não reabre nada, só marca "Atualizado" na Ajuda. */
  version: number
  kind: TourKind
  title: MessageKey
  steps: readonly StepDef[]
  retired?: boolean
}

export type FeatureTrigger =
  | { tipo: 'capability'; requires?: string }
  | { tipo: 'canvas'; nodeType: string }

export type FeatureDef = {
  id: string
  tourId: string
  title: MessageKey
  trigger: FeatureTrigger
  /** Quem já usava o app antes desta função também recebe o aviso (uma vez). */
  anunciarParaQuemJaUsa?: boolean
  retired?: boolean
}

/** Forma genérica do catálogo, usada também pelos catálogos de fixture dos testes. */
export type OnboardingCatalog = {
  revision: number
  tours: Readonly<Record<string, TourDef>>
  features: readonly FeatureDef[]
}

const anchor = (id: AnchorId) => `[data-felixo-tour-anchor="${id}"]`

/** Seletor de cada âncora. O canvas usa a própria região, que sempre existe no canvas. */
export const ONBOARDING_ANCHORS: Readonly<Record<AnchorId, string>> = Object.freeze({
  'rail-menu': anchor('rail-menu'),
  'rail-projetos': anchor('rail-projetos'),
  'rail-ajuda': anchor('rail-ajuda'),
  'secao-criar': anchor('secao-criar'),
  'criar-agente': anchor('criar-agente'),
  'criar-bloco': anchor('criar-bloco'),
  'secao-ferramentas': anchor('secao-ferramentas'),
  'inspector-elementos': anchor('inspector-elementos'),
  'inspector-puck': anchor('inspector-puck'),
  canvas: '[data-felixo-region="canvas"]',
})

/**
 * Âncoras que não somem com a sidebar recolhida nem com seção fechada. Toda cadeia
 * de alvos termina numa delas, então nenhum passo fica sem ter para onde apontar.
 */
export const ALWAYS_VISIBLE_ANCHORS: readonly AnchorId[] = Object.freeze([
  'rail-menu',
  'rail-projetos',
  'rail-ajuda',
  'canvas',
])

export type TourId = 'inicial' | 'novidade-ajuda'
export type FeatureId = 'feature.ajuda'
/** Nenhuma capability condicional no catálogo v1; o tipo existe para os passos e features futuros. */
export type CapabilityId = string

export const ONBOARDING_CATALOG_REVISION = 1

/**
 * Livro de versões do catálogo: cada revisão lista TODOS os ids vigentes nela.
 * O teste exige que os ids atuais sejam a união do histórico, que a última
 * revisão seja a atual e que nenhum id suma. Um bump esquecido reprova o teste,
 * mas nunca quebra a detecção, que é por id.
 */
export const CATALOG_HISTORY = [
  { revision: 1, tours: ['inicial', 'novidade-ajuda'], features: ['feature.ajuda'] },
] as const

const PASSO_MENU_AGENTE = {
  anchor: 'rail-menu',
  body: 'passo.agente.corpo-menu',
  label: 'menu do canvas',
  side: 'direita',
} as const satisfies StepTarget

export const ONBOARDING_TOURS = {
  inicial: {
    id: 'inicial',
    version: 1,
    kind: 'primeiro-uso',
    title: 'tour.inicial.titulo',
    steps: [
      {
        id: 'projeto',
        title: 'passo.projeto.titulo',
        targets: [{ anchor: 'rail-projetos', body: 'passo.projeto.corpo', label: 'Projetos', side: 'direita' }],
      },
      {
        id: 'agente',
        title: 'passo.agente.titulo',
        targets: [
          // A moldura das duas metades, nunca a metade "Agente" que lança a CLI.
          { anchor: 'criar-agente', body: 'passo.agente.corpo', label: 'Agente', side: 'direita' },
          { anchor: 'secao-criar', body: 'passo.agente.corpo-secao', label: 'Criar', side: 'direita' },
          PASSO_MENU_AGENTE,
        ],
      },
      {
        id: 'contexto',
        title: 'passo.contexto.titulo',
        targets: [
          { anchor: 'criar-bloco', body: 'passo.contexto.corpo', label: 'Novo bloco', side: 'direita' },
          { anchor: 'secao-criar', body: 'passo.contexto.corpo-secao', label: 'Criar', side: 'direita' },
          { anchor: 'rail-menu', body: 'passo.contexto.corpo-menu', label: 'menu do canvas', side: 'direita' },
        ],
      },
      {
        id: 'terminal',
        title: 'passo.terminal.titulo',
        targets: [
          { anchor: 'inspector-elementos', body: 'passo.terminal.corpo', label: 'Elementos', side: 'esquerda' },
          { anchor: 'inspector-puck', body: 'passo.terminal.corpo-puck', label: 'elementos', side: 'esquerda' },
          { anchor: 'canvas', body: 'passo.terminal.corpo-canvas', label: 'canvas' },
        ],
      },
      {
        id: 'ferramentas',
        title: 'passo.ferramentas.titulo',
        // O cabeçalho da seção; a seção continua fechada (o tour nunca expande nada).
        targets: [
          { anchor: 'secao-ferramentas', body: 'passo.ferramentas.corpo', label: 'Ferramentas', side: 'direita' },
          { anchor: 'rail-menu', body: 'passo.ferramentas.corpo-menu', label: 'menu do canvas', side: 'direita' },
        ],
        citaFerramentas: ['notes', 'prompts'],
      },
      {
        id: 'ajuda',
        title: 'passo.ajuda.titulo',
        targets: [{ anchor: 'rail-ajuda', body: 'passo.ajuda.corpo', label: 'Ajuda', side: 'direita' }],
      },
    ],
  },
  'novidade-ajuda': {
    id: 'novidade-ajuda',
    version: 1,
    kind: 'novidade',
    title: 'tour.novidade-ajuda.titulo',
    steps: [
      {
        id: 'ajuda-novidade',
        title: 'passo.ajuda-novidade.titulo',
        targets: [{ anchor: 'rail-ajuda', body: 'passo.ajuda-novidade.corpo', label: 'Ajuda', side: 'direita' }],
      },
    ],
  },
} as const satisfies Record<TourId, TourDef & { id: TourId }>

/**
 * Gatilho aceito no catálogo deste build: um de canvas só com tipo listado em
 * `CANVAS_TRIGGER_NODE_TYPES`, que é o que o canvas observa sem carregar o catálogo.
 */
type BuildFeatureTrigger =
  | Extract<FeatureTrigger, { tipo: 'capability' }>
  | { tipo: 'canvas'; nodeType: CanvasTriggerNodeType }

export const ONBOARDING_FEATURES = [
  {
    id: 'feature.ajuda',
    tourId: 'novidade-ajuda',
    title: 'novidade.ajuda.titulo',
    trigger: { tipo: 'capability' },
    // A própria Ajuda é novidade para quem já usava o app: sem o aviso, ninguém
    // descobriria onde reabrir o tutorial (decisão a + c do plano).
    anunciarParaQuemJaUsa: true,
  },
] as const satisfies ReadonlyArray<FeatureDef & { id: FeatureId; tourId: TourId; trigger: BuildFeatureTrigger }>

/**
 * Guarda de compilação: toda ferramenta do canvas é "base" (coberta pelo tutorial
 * ou fora dele de propósito) ou uma novidade do catálogo. Uma ferramenta nova em
 * `CanvasTool` reprova o build até alguém decidir o que ela é.
 */
export const CANVAS_TOOL_FEATURES = {
  search: 'base',
  notifications: 'base',
  projects: 'base',
  notes: 'base',
  models: 'base',
  prompts: 'base',
  skills: 'base',
  git: 'base',
  fetchAll: 'base',
  notionTasks: 'base',
  agentUsage: 'base',
  orchestrator: 'base',
  qaLogger: 'base',
  agentCanvasWrite: 'base',
  agentPresets: 'base',
  settings: 'base',
} as const satisfies Record<CanvasTool, 'base' | FeatureId>

export const defaultOnboardingCatalog: OnboardingCatalog = Object.freeze({
  revision: ONBOARDING_CATALOG_REVISION,
  tours: ONBOARDING_TOURS,
  features: ONBOARDING_FEATURES,
})

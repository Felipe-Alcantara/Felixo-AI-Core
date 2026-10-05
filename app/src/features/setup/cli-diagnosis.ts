/**
 * Traduz o diagnóstico das CLIs de IA (`clis:diagnose`) no que a interface
 * mostra.
 *
 * O processo principal já separa "não instalada" de "instalada, mas invisível
 * ao app" e escreve a próxima ação de cada caso. Aqui fica só o que é da tela:
 * validar a resposta do IPC, dar um rótulo curto a cada causa e decidir se
 * ainda vale oferecer "Instalar" — reinstalar não resolve PATH, permissão,
 * atalho quebrado nem falta de rede, e oferecer o botão nesses casos repetiria
 * o laço que o diagnóstico existe para quebrar.
 */

/** Causas que o processo principal devolve (ver `cli-diagnostics.cjs`). */
export type CliDiagnosisCause =
  | 'not-installed'
  | 'path'
  | 'permission'
  | 'timeout'
  | 'shim'
  | 'exec-error'
  | 'package'
  | 'network'

export type CliDiagnosis = {
  id: string
  name: string
  status: 'ready' | 'unavailable'
  /** `null` quando a CLI respondeu; texto livre se o processo principal ganhar causa nova. */
  cause: string | null
  recommendInstall: boolean
  nextAction: { kind: string; text: string }
}

/** Uma pasta do PATH com que o app procurou as CLIs. */
export type CliEffectivePathEntry = {
  /** 1 = consultada primeiro: a primeira pasta que tem o comando vence. */
  position: number
  /** De onde a pasta veio (`CLI_PATH_ORIGINS` em `cli-process-manager.cjs`). */
  origin: string
  /** Já minimizado: `~` no lugar da pasta pessoal, sem nome de usuário. */
  path: string
}

export type CliDiagnosisReport = {
  diagnoses: CliDiagnosis[]
  /** Vazio quando o processo principal não manda a lista (versão anterior). */
  effectivePath: CliEffectivePathEntry[]
  /** Já sai minimizado do processo principal: sem usuário, URL nem segredo. */
  supportText: string
}

export type CliDiagnoseOutcome =
  | { ok: true; report: CliDiagnosisReport }
  | { ok: false; message: string }

/** Tom visual da linha: pronta, ausente de fato ou presente mas inutilizável. */
export type CliDiagnosisTone = 'ready' | 'missing' | 'problem'

export type CliDiagnosisSummary = {
  label: string
  tone: CliDiagnosisTone
  detail: string
}

type CliDiagnoseBridge = { diagnose?: () => Promise<unknown> } | undefined

const DIAGNOSE_FAILURE = 'Falha ao diagnosticar as CLIs.'
const DESKTOP_ONLY = 'O diagnóstico das CLIs só existe no app desktop.'

/**
 * O rótulo diz primeiro se a CLI está no disco: é essa a pergunta que decide
 * entre instalar e consertar.
 */
const CAUSE_LABELS: Record<CliDiagnosisCause, string> = {
  'not-installed': 'Não instalada',
  path: 'Instalada, mas invisível ao app',
  permission: 'Bloqueada por permissão',
  timeout: 'Instalada, mas não respondeu a tempo',
  shim: 'Instalada, mas o atalho não executa',
  'exec-error': 'Instalada, mas falhou ao responder',
  package: 'Instalação incompleta',
  network: 'Instalação falhou por rede',
}

/** A origem de cada pasta do PATH em palavras da tela. */
const PATH_ORIGIN_LABELS: Record<string, string> = {
  configurada: 'configurada em FELIXO_CLI_PATHS',
  usuario: 'pasta pessoal',
  sistema: 'pasta do sistema',
  processo: 'herdada do PATH',
  app: 'ferramentas do app',
  gerenciada: 'CLIs instaladas pelo app',
}

/**
 * Valida a resposta do IPC antes de ela chegar à tela.
 *
 * A ponte é tipada, mas o valor atravessa processos: um item malformado é
 * descartado em vez de derrubar o gerenciador inteiro, e `recommendInstall`
 * só vale quando é `true` de fato — na dúvida, não sugerir reinstalar.
 */
export function parseCliDiagnoseResult(raw: unknown): CliDiagnoseOutcome {
  if (!isRecord(raw)) {
    return { ok: false, message: DIAGNOSE_FAILURE }
  }

  if (raw.ok !== true) {
    return {
      ok: false,
      message:
        typeof raw.message === 'string' && raw.message.trim()
          ? raw.message
          : DIAGNOSE_FAILURE,
    }
  }

  const diagnoses = Array.isArray(raw.diagnoses)
    ? raw.diagnoses.flatMap((item) => {
        const diagnosis = parseDiagnosis(item)
        return diagnosis ? [diagnosis] : []
      })
    : []

  return {
    ok: true,
    report: {
      diagnoses,
      effectivePath: parseEffectivePath(raw.effectivePath),
      supportText: typeof raw.supportText === 'string' ? raw.supportText : '',
    },
  }
}

/**
 * Pede o diagnóstico ao processo principal. Só lê: nada é instalado nem
 * alterado. Nunca rejeita — o erro vira mensagem para a tela.
 */
export async function requestCliDiagnosis(
  bridge: CliDiagnoseBridge,
): Promise<CliDiagnoseOutcome> {
  if (!bridge?.diagnose) {
    return { ok: false, message: DESKTOP_ONLY }
  }

  try {
    return parseCliDiagnoseResult(await bridge.diagnose())
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.message ? error.message : DIAGNOSE_FAILURE,
    }
  }
}

export function describeCliDiagnosis(diagnosis: CliDiagnosis): CliDiagnosisSummary {
  const detail = diagnosis.nextAction.text

  if (diagnosis.status === 'ready') {
    return { label: 'Pronta', tone: 'ready', detail }
  }

  if (diagnosis.cause === 'not-installed') {
    return { label: CAUSE_LABELS['not-installed'], tone: 'missing', detail }
  }

  const label = isKnownCause(diagnosis.cause) ? CAUSE_LABELS[diagnosis.cause] : 'Indisponível'
  return { label, tone: 'problem', detail }
}

/**
 * Vale mostrar "Instalar" para uma CLI que o app não detectou?
 *
 * Sem diagnóstico, o gerenciador mantém o comportamento de sempre. Com ele, só
 * quando o próprio diagnóstico recomenda — CLI no disco, mas fora do PATH, não
 * se conserta instalando outra cópia.
 */
export function shouldOfferCliInstall({
  detected,
  diagnosis,
}: {
  detected: boolean
  diagnosis?: CliDiagnosis
}): boolean {
  if (detected) return false
  return diagnosis ? diagnosis.recommendInstall : true
}

/** Origem desconhecida (processo principal mais novo) aparece como veio. */
export function describeCliPathOrigin(origin: string): string {
  return Object.hasOwn(PATH_ORIGIN_LABELS, origin) ? PATH_ORIGIN_LABELS[origin] : origin
}

export function indexCliDiagnoses(
  report: CliDiagnosisReport | null,
): Record<string, CliDiagnosis> {
  return Object.fromEntries((report?.diagnoses ?? []).map((item) => [item.id, item]))
}

function parseDiagnosis(item: unknown): CliDiagnosis | null {
  if (!isRecord(item) || !isRecord(item.nextAction)) return null

  const { id, name, status, cause, recommendInstall, nextAction } = item
  if (typeof id !== 'string' || !id || typeof name !== 'string') return null
  if (status !== 'ready' && status !== 'unavailable') return null
  if (typeof nextAction.text !== 'string') return null

  return {
    id,
    name,
    status,
    cause: typeof cause === 'string' ? cause : null,
    recommendInstall: recommendInstall === true,
    nextAction: {
      kind: typeof nextAction.kind === 'string' ? nextAction.kind : 'none',
      text: nextAction.text,
    },
  }
}

/** Item malformado sai da lista; a ordem é a que o processo principal mandou. */
function parseEffectivePath(raw: unknown): CliEffectivePathEntry[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((item) => {
    if (!isRecord(item)) return []
    const { position, origin, path } = item
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 1) return []
    if (typeof origin !== 'string' || typeof path !== 'string' || !path) return []
    return [{ position, origin, path }]
  })
}

function isKnownCause(cause: string | null): cause is CliDiagnosisCause {
  return cause !== null && Object.hasOwn(CAUSE_LABELS, cause)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

import type { Edge } from '@xyflow/react'
import type { FrameColor } from '../types'
import type { NewTerminalOptions } from './new-terminal-options'

/**
 * Template de time de agentes (Fase 1 da Vitis): um coordenador, dois
 * produtores e um checador, já ligados pelo handoff. A estrutura se repete em
 * todo time: um coordenador, um plano compartilhado, entregas definidas e
 * agentes que conferem o trabalho uns dos outros.
 *
 * Módulo puro: só monta as opções dos terminais e as ligações. Quem cria os
 * blocos e grava as ligações é o canvas.
 */

type TeamRole = {
  name: string
  color: FrameColor
  /** Índices (em `TEAM_ROLES`) de quem recebe a entrega deste papel. */
  handsOffTo: number[]
  prompt: string
}

const SHARED_RULES =
  'Vocês trabalham como um time no canvas: um coordenador, dois produtores e um checador. A ligação entre os blocos mostra para quem você entrega. Conversa e saída não passam sozinhas de um terminal para o outro: registre o plano, as entregas e os bloqueios em arquivos .md compartilhados no canvas.'

export const TEAM_ROLES: readonly TeamRole[] = [
  {
    name: 'Coordenador',
    color: 'violet',
    handsOffTo: [1, 2],
    prompt: `${SHARED_RULES}\n\nPapel: COORDENADOR. Mantenha um único plano compartilhado (objetivo, divisão do trabalho, estado e próximo passo). Divida a tarefa entre o Produtor 1 e o Produtor 2 com entregas definidas e critério de aceite para cada uma. Não produza o entregável você mesmo: acompanhe o plano, destrave bloqueios e decida quando o Checador aprova ou devolve.`,
  },
  {
    name: 'Produtor 1',
    color: 'sky',
    handsOffTo: [3],
    prompt: `${SHARED_RULES}\n\nPapel: PRODUTOR 1. Receba a sua parte do Coordenador e produza o entregável combinado. Ao terminar, registre o que fez no plano compartilhado e envie o resultado (um arquivo .md) pelo comando \`felixo revisao enviar <arquivo.md>\`: ele espera o Checador e só imprime o caminho liberado depois da aprovação. Não entregue o resultado a ninguém antes disso. Se vier RECUSADO, corrija pelo motivo e envie de novo; depois de 3 recusas seguidas, pare e avise a pessoa. Se a parte não estiver clara, pergunte ao Coordenador em vez de supor.`,
  },
  {
    name: 'Produtor 2',
    color: 'emerald',
    handsOffTo: [3],
    prompt: `${SHARED_RULES}\n\nPapel: PRODUTOR 2. Receba a sua parte do Coordenador e produza o entregável combinado. Ao terminar, registre o que fez no plano compartilhado e envie o resultado (um arquivo .md) pelo comando \`felixo revisao enviar <arquivo.md>\`: ele espera o Checador e só imprime o caminho liberado depois da aprovação. Não entregue o resultado a ninguém antes disso. Se vier RECUSADO, corrija pelo motivo e envie de novo; depois de 3 recusas seguidas, pare e avise a pessoa. Se a parte não estiver clara, pergunte ao Coordenador em vez de supor.`,
  },
  {
    name: 'Checador',
    color: 'amber',
    handsOffTo: [],
    prompt: `${SHARED_RULES}\n\nPapel: CHECADOR. Confira o trabalho dos dois Produtores contra o critério de aceite do Coordenador, sem refazer o entregável. Liste o que espera revisão com \`felixo revisao pendentes\` e leia com \`felixo revisao ler <id>\`. Quando estiver certo, rode \`felixo revisao aprovar <id>\`; se houver problema, rode \`felixo revisao recusar <id> --motivo "<problema e evidência>"\` (o motivo fica registrado e volta ao Produtor). Depois de aprovar, diga ao Coordenador que pode fechar.`,
  },
]

export type TeamLaunch = {
  /** Um terminal por papel, na ordem de `TEAM_ROLES`. */
  options: NewTerminalOptions[]
  /** Entregas: pares [de, para] de índices em `options`. */
  links: [number, number][]
}

/**
 * Deriva os quatro terminais da configuração escolhida (CLI, modelo, pasta,
 * conta). O ticket e a origem da cadeia são de uso único e não se repetem.
 */
export function buildTeamLaunch(base: NewTerminalOptions): TeamLaunch {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { chainTicket, chainOrigin, planningFile, preset, ...shared } = base
  const options = TEAM_ROLES.map(
    (role): NewTerminalOptions => ({
      ...shared,
      label: role.name,
      preset: {
        name: role.name,
        contextPrompt: [role.prompt, preset?.contextPrompt].filter(Boolean).join('\n\n'),
        skillIds: preset?.skillIds ?? [],
        color: role.color,
      },
    }),
  )
  const links = TEAM_ROLES.flatMap((role, from) =>
    role.handsOffTo.map((to): [number, number] => [from, to]),
  )
  return { options, links }
}

/** Liga cada par de blocos pelo id; `ids` segue a ordem de `TeamLaunch.options`. */
export function buildTeamEdges(
  ids: readonly string[],
  links: readonly [number, number][],
  newId: () => string,
): Edge[] {
  return links.map(([from, to]) => ({ id: newId(), source: ids[from], target: ids[to] }))
}

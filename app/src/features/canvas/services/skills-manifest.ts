import type { CanvasSkill } from '../types'

/**
 * O bloco de skills entregue ao agente **no nascimento do terminal**.
 *
 * Deliberadamente uma LISTA, não o conteúdo: cada skill custa uma linha de
 * contexto (nome, para que serve, onde está), e o agente lê o arquivo inteiro
 * só quando a tarefa combina com a descrição. Colar dezessete skills no prompt
 * inicial gastaria o contexto justamente com o que quase nunca é necessário —
 * é o "progressive disclosure" da especificação Agent Skills.
 *
 * A descrição é o que faz a skill disparar na hora certa; por isso ela entra
 * inteira, mesmo sendo a parte mais longa de cada linha.
 */

/** Quantas skills cabem na lista antes de ela virar ruído no prompt inicial. */
const MAXIMO_LISTADO = 40

const CABECALHO = 'Skills disponíveis neste sistema (leia o arquivo/URL só quando a tarefa combinar):'

const RODAPE = [
  'Como usar: quando a tarefa se encaixar na descrição de uma skill, ABRA o arquivo (ou a URL) indicado e siga o que está escrito nele antes de agir.',
  'Não precisa pedir permissão para ler uma skill, e não leia todas por precaução — leia a que serve.',
  'Se nenhuma servir, siga normalmente; a lista é oferta, não obrigação.',
].join('\n')

function descreverOrigem(skill: CanvasSkill): string {
  if (skill.source === 'community') {
    return skill.origin ? ` [terceiros: ${skill.origin}]` : ' [terceiros]'
  }
  return ''
}

/**
 * Monta o bloco de skills para o prompt inicial do terminal.
 *
 * @returns O bloco pronto, ou string vazia quando não há skill nenhuma — nesse
 *   caso o prompt inicial não ganha uma seção vazia só para existir.
 */
export function buildSkillsManifestPrompt(skills: CanvasSkill[]): string {
  const validas = skills.filter(
    (skill) => skill.name?.trim() && skill.path?.trim(),
  )
  if (validas.length === 0) {
    return ''
  }

  const listadas = validas.slice(0, MAXIMO_LISTADO)
  const linhas = listadas.map((skill) => {
    const descricao = skill.description?.trim()
    const detalhe = descricao ? ` — ${descricao}` : ''
    return `- ${skill.name.trim()}${descreverOrigem(skill)}${detalhe}\n  Arquivo: ${skill.path.trim()}`
  })

  const excedente =
    validas.length > listadas.length
      ? [`- (+${validas.length - listadas.length} outras skills no painel de Skills do canvas)`]
      : []

  return [CABECALHO, '', ...linhas, ...excedente, '', RODAPE].join('\n')
}

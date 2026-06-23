/**
 * The instruction injected into a terminal when a file block is linked to it.
 *
 * The linked `.md` is not a prompt — it's a *living scratchpad* shared by every
 * agent working through the canvas: what we're doing, where it stands, what's
 * blocking, and what comes next. It is intentionally light so cheaper models can
 * keep it accurate in a loop, refining the work pass after pass, instead of
 * drowning in a heavy "MVP plan" ceremony.
 *
 * Two flavors live here:
 * - the default link prompt, for a file that already has content to follow;
 * - the bootstrap prompt (an empty file inside a repo), which asks the agent to
 *   diagnose the repository into concrete, observable categories rather than to
 *   invent a broad product plan.
 */

/** The four fixed sections any agent keeps current — the whole scratchpad. */
const SCRATCHPAD_SHAPE = `O arquivo é um SCRATCHPAD VIVO, leve e de formato livre. Mantenha estas seções fixas e curtas:

## Objetivo
O que estamos tentando fazer, em uma ou duas frases.

## Estado atual
O que já foi feito e o que está em pé agora (use checklist: [ ] pendente, [~] em andamento, [x] concluído).

## Travas
O que está bloqueado, aguardando decisão ou dependendo de outra coisa. Vazio se não houver.

## Próximo passo
A próxima ação concreta. Sempre deixe esta seção preenchida ao encerrar.

## Sinais entre agentes
Linhas curtas e datadas para coordenar com os outros agentes, uma por evento. Formato:
- [data hora] {{agent}} — o que fez / precisa — status (ex.: feito, aguardando, bloqueado por X).`

export const DEFAULT_FILE_LINK_PROMPT = `Você está em um NÓ DO CANVAS, conectado a um ARQUIVO SCRATCHPAD do canvas (markdown) compartilhado entre vários agentes. Caminho: {{path}}

${SCRATCHPAD_SHAPE}

Como trabalhar com ele:
1. LEIA o arquivo inteiro antes de começar — ele é a fonte da verdade do trabalho em andamento.
2. Trabalhe a partir do que está em "Próximo passo" e do que falta em "Estado atual". Não invente escopo fora do que está registrado.
3. MANTENHA o arquivo atualizado conforme avança, preservando as seções acima. Atualize o checklist e os "Sinais entre agentes" no mesmo passo do trabalho.
4. Se marcar algo como [~] em andamento, isso é provisório: antes de encerrar a resposta, volte ao arquivo e feche a entrada com um estado final claro (concluído, bloqueado, aguardando decisão ou interrompido com motivo). Nunca termine o turno deixando o scratchpad preso em "em andamento".
5. SINALIZE bloqueios e dependências em "Sinais entre agentes" para outro agente não refazer nem colidir com você.
6. Edite de forma incremental; não apague o trabalho de outros agentes.

Comece lendo {{path}} e me diga qual é o próximo passo.`

/**
 * Fills the prompt template with the resolved file path (and optional agent
 * name), normalizing line endings for the PTY.
 */
export function buildFileLinkPrompt(
  template: string,
  filePath: string,
  agentName = 'este agente',
): string {
  const filled = template
    .replaceAll('{{path}}', filePath)
    .replaceAll('{{agent}}', agentName)
  // Trailing newline submits the line; \r keeps it tidy across shells/agents.
  return `${filled}\n`
}

/**
 * Bootstrap instruction used as an EXCEPTION: when the terminal is in a project
 * repository AND the linked .md is still empty, the agent first surveys the repo
 * and *writes the scratchpad itself*, seeding "Estado atual" with a concrete,
 * observable DIAGNOSIS of the codebase — not a broad MVP plan. The categories
 * are things the agent can find by reading the code, so even a cheap model can
 * produce something actionable.
 */
export const DEFAULT_FILE_BOOTSTRAP_PROMPT = `Você está em um NÓ DO CANVAS, dentro de um REPOSITÓRIO, e foi conectado a um ARQUIVO SCRATCHPAD do canvas ainda VAZIO: {{path}}

Sua tarefa agora é INICIAR esse scratchpad a partir do código real, com um DIAGNÓSTICO concreto e observável — nada de plano de produto genérico. Tudo o que você listar deve vir do que existe no repositório.

1. ANALISE o repositório: leia a estrutura, o README, a documentação, as dependências e o código principal para entender o que o projeto é, o que faz e em que estado está.
2. ESCREVA no arquivo {{path}} um scratchpad em markdown com estas seções fixas:

## Objetivo
O que o projeto é hoje, em uma ou duas frases honestas.

## Estado atual
Um diagnóstico do repositório dividido nestas categorias (omita uma categoria se não encontrar nada real nela):
- 🐛 Problemas — bugs, coisas quebradas, erros visíveis no código.
- 🚧 Incompleto — fases/funcionalidades começadas e não terminadas, TODOs, stubs.
- 🔧 Funções auxiliares — utilitários/suporte que faltam ou estão pela metade.
- 📈 Melhorias incrementais — separe em PEQUENO PORTE (quick wins, ajustes localizados) e GRANDE PORTE (refatorações, expansões, mudanças estruturais).
Use checklist ([ ] pendente) em cada item para virar trabalho rastreável.

## Travas
Decisões em aberto e pontos em que o usuário precisa escolher. Vazio se não houver.

## Próximo passo
A primeira ação concreta que você recomenda, escolhida entre os itens acima.

## Sinais entre agentes
- [data hora] {{agent}} — diagnóstico inicial escrito — concluído.

3. Seja concreto e fundamente cada item no que existe no repositório. Não invente funcionalidades.
4. Depois de escrever, resuma o diagnóstico e me diga por qual item você sugere começar.

Comece analisando o repositório e depois escreva o scratchpad em {{path}}.`

/** Builds the bootstrap prompt; same placeholders as buildFileLinkPrompt. */
export function buildBootstrapPrompt(
  template: string,
  filePath: string,
  agentName = 'este agente',
): string {
  return buildFileLinkPrompt(template, filePath, agentName)
}

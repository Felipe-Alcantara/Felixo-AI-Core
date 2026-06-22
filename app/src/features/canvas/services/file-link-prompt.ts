/**
 * The instruction injected into a terminal when a file block is linked to it.
 *
 * The linked `.md` is not a prompt — it's a *living plan* shared by every agent
 * working on the project: phases, checklists, tests, goals, decisions, and
 * cross-agent signalling. This protocol tells the agent how to read it, keep it
 * updated, coordinate with other agents through it, and commit per phase.
 */

export const DEFAULT_FILE_LINK_PROMPT = `Voce esta conectado a um ARQUIVO DE PLANO VIVO (markdown) compartilhado entre varios agentes. Caminho: {{path}}

Como trabalhar com ele:
1. LEIA o arquivo inteiro antes de comecar. Ele e a fonte da verdade do projeto: fases, metas, decisoes, modelos e o que cada agente esta fazendo.
2. Trabalhe seguindo as FASES descritas. Nao pule fases nem invente escopo fora do que esta planejado.
3. MANTENHA o arquivo atualizado conforme avanca. Use marcacoes claras, por exemplo:
   - [ ] tarefa pendente   - [x] tarefa concluida   - [~] em andamento
   - "Fase 1 (em andamento por {{agent}})", "Fase 2 / front-end (aguardando)"
4. SINALIZE para os outros agentes: anote bloqueios, dependencias e quando voce esta esperando uma decisao (ex.: "Claude aguardando decisao sobre X").
5. Marque o que for GRANDE DEMAIS para o MVP e ofereca OPCOES para o usuario decidir, ao inves de decidir sozinho.
6. Registre DECISOES e o porque delas, para outro agente nao refazer.
7. Faca COMMITS alinhados as fases (uma fase coesa por vez), com mensagens descritivas.
8. Voce pode LER e ESCREVER neste arquivo. Edite-o de forma incremental; nao apague o trabalho de outros agentes.

Comece lendo {{path}} e me diga em que fase vamos atuar.`

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

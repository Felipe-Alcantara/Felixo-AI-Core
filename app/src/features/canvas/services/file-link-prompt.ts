/**
 * The instruction injected into a terminal when a file block is linked to it.
 *
 * The linked `.md` is not a prompt — it's a *living plan* shared by every agent
 * working on the project: phases, checklists, tests, goals, decisions, and
 * cross-agent signalling. This protocol tells the agent how to read it, keep it
 * updated, coordinate with other agents through it, and commit per phase.
 */

export const DEFAULT_FILE_LINK_PROMPT = `Você está conectado a um ARQUIVO DE PLANO VIVO (markdown) compartilhado entre vários agentes. Caminho: {{path}}

Como trabalhar com ele:
1. LEIA o arquivo inteiro antes de começar. Ele é a fonte da verdade do projeto: fases, metas, decisões, modelos e o que cada agente está fazendo.
2. Trabalhe seguindo as FASES descritas. Não pule fases nem invente escopo fora do que está planejado.
3. MANTENHA o arquivo atualizado conforme avança. Use marcações claras, por exemplo:
   - [ ] tarefa pendente   - [x] tarefa concluída   - [~] em andamento
   - "Fase 1 (em andamento por {{agent}})", "Fase 2 / front-end (aguardando)"
4. SINALIZE para os outros agentes: anote bloqueios, dependências e quando você está esperando uma decisão (ex.: "{{agent}} aguardando decisão sobre X").
5. Marque o que for GRANDE DEMAIS para o MVP e ofereça OPÇÕES para o usuário decidir, em vez de decidir sozinho.
6. Registre as DECISÕES e o porquê delas, para outro agente não refazer.
7. Faça COMMITS alinhados às fases (uma fase coesa por vez), com mensagens descritivas.
8. Você pode LER e ESCREVER neste arquivo. Edite-o de forma incremental; não apague o trabalho de outros agentes.

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

/**
 * Bootstrap instruction used as an EXCEPTION: when the terminal is in a project
 * repository AND the linked .md is still empty, the agent should analyze the
 * repo and *write* the evolution plan itself into the file — so the living plan
 * starts from the actual codebase instead of a blank slate.
 */
export const DEFAULT_FILE_BOOTSTRAP_PROMPT = `Você está em um REPOSITÓRIO e foi conectado a um ARQUIVO DE PLANO ainda VAZIO: {{path}}

Sua tarefa agora é CRIAR esse plano a partir do código real:
1. ANALISE o repositório: leia a estrutura, o README e a documentação, as dependências e o código principal para entender o que o projeto é, o que faz e em que estado está.
2. ESCREVA no arquivo {{path}} um PLANO DE EVOLUÇÃO em markdown, com FASES de melhoria, expansão e escala. Sugestão de estrutura:
   - Visão geral: o que o projeto é hoje (um resumo honesto do estado atual).
   - Fases numeradas (Fase 1, Fase 2, ...), cada uma com objetivo, tarefas em checklist ([ ]), critérios de pronto e testes.
   - Marque o que é MVP e o que é grande demais para agora.
   - Aponte riscos, decisões em aberto e pontos em que o usuário precisa escolher.
   - Reserve espaço para a sinalização entre agentes (ex.: "Fase 1 em andamento por {{agent}}").
3. Seja concreto e fundamente tudo no que existe no repositório — não invente funcionalidades genéricas.
4. Depois de escrever, faça um resumo do plano e me diga por qual fase começamos.

Comece analisando o repositório e depois escreva o plano em {{path}}.`

/** Builds the bootstrap prompt; same placeholders as buildFileLinkPrompt. */
export function buildBootstrapPrompt(
  template: string,
  filePath: string,
  agentName = 'este agente',
): string {
  return buildFileLinkPrompt(template, filePath, agentName)
}

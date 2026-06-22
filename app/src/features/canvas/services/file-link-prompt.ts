/**
 * The instruction injected into a terminal when a file block is linked to it.
 *
 * The linked `.md` is not a prompt — it's a *living plan* shared by every agent
 * working on the project: phases, checklists, tests, goals, decisions, and
 * cross-agent signalling. The prompts ask the agent to follow the project's
 * context template (TEMPLATE-CONTEXTO-IA / IA.md) when writing the plan, so the
 * file stays in the project's standard instead of an ad-hoc format.
 */

/** Where the agent can find the quality standard / context template. */
const STANDARD_HINT = `Para o formato e as seções do plano, siga o padrão de contexto do projeto (o template "IA.md" / TEMPLATE-CONTEXTO-IA). Procure os guias na pasta "Padrão de qualidade - Felixo System Design/" dentro do repositório; se ela não existir, use a fonte: https://github.com/Felipe-Alcantara/Felixo-System-Design`

export const DEFAULT_FILE_LINK_PROMPT = `Você está em um NÓ DO CANVAS e conectado a um ARQUIVO DE PLANO VIVO do canvas (markdown) compartilhado entre vários agentes. Caminho: {{path}}

Como trabalhar com ele:
1. LEIA o arquivo inteiro antes de começar. Ele é a fonte da verdade do projeto: objetivo, fases, metas, decisões, testes e o que cada agente está fazendo.
2. Trabalhe seguindo as FASES descritas. Não pule fases nem invente escopo fora do que está planejado.
3. MANTENHA o arquivo atualizado conforme avança, preservando a estrutura/seções que ele já segue. Use marcações claras, por exemplo:
   - [ ] tarefa pendente   - [x] tarefa concluída   - [~] em andamento
   - "Fase 1 (em andamento por {{agent}})", "Fase 2 / front-end (aguardando)"
   - Se você marcar algo como "em andamento", isso é provisório: antes de encerrar a resposta, volte ao md do canvas e feche a entrada com um estado final claro (concluído, bloqueado, aguardando decisão ou interrompido com motivo). Nunca termine o turno deixando o plano só como "em andamento".
4. SINALIZE para os outros agentes: anote bloqueios, dependências e quando você está esperando uma decisão (ex.: "{{agent}} aguardando decisão sobre X").
5. Marque o que for GRANDE DEMAIS para o MVP e ofereça OPÇÕES para o usuário decidir, em vez de decidir sozinho.
6. Registre as DECISÕES e o porquê delas, para outro agente não refazer.
7. Faça COMMITS alinhados às fases (uma fase coesa por vez), com mensagens descritivas.
8. Você pode LER e ESCREVER neste arquivo. Edite-o de forma incremental; não apague o trabalho de outros agentes.

${STANDARD_HINT}

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
 * repo and *write* the evolution plan itself into the file — following the
 * project's context template so the living plan starts in the standard format.
 */
export const DEFAULT_FILE_BOOTSTRAP_PROMPT = `Você está em um NÓ DO CANVAS, dentro de um REPOSITÓRIO, e foi conectado a um ARQUIVO DE PLANO do canvas ainda VAZIO: {{path}}

Sua tarefa agora é CRIAR esse plano a partir do código real, seguindo o padrão de contexto do projeto:
1. ANALISE o repositório: leia a estrutura, o README e a documentação, as dependências e o código principal para entender o que o projeto é, o que faz e em que estado está.
2. ESCREVA no arquivo {{path}} um PLANO DE EVOLUÇÃO em markdown, com FASES de melhoria, expansão e escala. Use as seções do template de contexto do projeto (objetivo, metas/milestones, stack, decisões de arquitetura, testes, etc.) e, dentro de Metas, descreva as fases numeradas:
   - Visão geral: o que o projeto é hoje (um resumo honesto do estado atual).
   - Fases numeradas (Fase 1, Fase 2, ...), cada uma com objetivo, tarefas em checklist ([ ]), critérios de pronto e testes.
   - Marque o que é MVP e o que é grande demais para agora.
   - Aponte riscos, decisões em aberto e pontos em que o usuário precisa escolher.
   - Reserve espaço para a sinalização entre agentes (ex.: "Fase 1 em andamento por {{agent}}").
   - Se uma fase precisar ficar em andamento durante a escrita, a última passada antes de encerrar deve atualizar o status para um estado final claro no md do canvas, nunca deixar o arquivo terminando apenas como "em andamento".
3. Seja concreto e fundamente tudo no que existe no repositório — não invente funcionalidades genéricas.
4. Depois de escrever, faça um resumo do plano e me diga por qual fase começamos.

${STANDARD_HINT}

Comece analisando o repositório e depois escreva o plano em {{path}}.`

/** Builds the bootstrap prompt; same placeholders as buildFileLinkPrompt. */
export function buildBootstrapPrompt(
  template: string,
  filePath: string,
  agentName = 'este agente',
): string {
  return buildFileLinkPrompt(template, filePath, agentName)
}

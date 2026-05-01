# Implementacao - Orquestracao Multi-Agente

## Contexto

A tasklist `docs/Tasklists/ORQUESTRACAO-MULTI-AGENTE.md` implementa a
arquitetura descrita em `docs/arquitetura/ORQUESTRACAO-MULTI-AGENTE.md`.
O objetivo e fazer o Felixo AI Core reconhecer eventos estruturados de
orquestracao emitidos pelos CLIs e, nas fases seguintes, assumir o controle
do loop de sub-agentes.

## Fase 1 - Protocolo e tipos

Status: concluida.

Mudancas implementadas:

- `StreamEvent` agora inclui `spawn_agent`, `awaiting_agents` e `final_answer`.
- A bridge IPC tipada em `vite-env.d.ts` aceita esses eventos no stream da CLI.
- Os adapters `codex`, `claude` e `gemini` reconhecem eventos JSONL top-level
  de orquestracao antes de aplicar o parsing especifico de cada provedor.
- A validacao dos eventos exige campos obrigatorios e `cliType` conhecido para
  evitar encaminhamento acidental de JSON incompleto.
- Os tres adapters receberam testes unitarios para os novos tipos.

Validacao:

- `npm test -- --test-reporter=spec electron/services/adapters/codex-adapter.test.cjs electron/services/adapters/claude-adapter.test.cjs electron/services/adapters/gemini-adapter.test.cjs`

## Fase 2 - Backend: OrchestrationRun + Store

Status: concluida.

Mudancas implementadas:

- Criado `app/electron/services/orchestration/orchestration-store.cjs`.
- O store mantem `OrchestrationRun` em memoria com `create`, `get`, `update` e
  `list`, sempre retornando clones para proteger o estado interno.
- Jobs de agente agora tem ciclo `pending`, `running`, `completed` e `error`.
- Foram implementados limites configuraveis de `maxTurns`,
  `maxAgentsPerTurn`, `maxTotalAgents` e `maxRuntimeMinutes`.
- O store expoe erros especificos para limites e validacao, preparando a
  integracao com o runner e IPC.
- O script `npm test` passou a incluir `electron/services/orchestration/*.test.cjs`.

Validacao:

- `node --test electron/services/orchestration/orchestration-store.test.cjs`

## Fase 3 - Backend: OrchestrationRunner

Status: concluida.

Mudancas implementadas:

- Criado `app/electron/services/orchestration/orchestration-runner.cjs`.
- `handleOrchestrationEvent()` intercepta `spawn_agent`, `awaiting_agents` e
  `final_answer`.
- `spawn_agent` cria um `agentJob`, emite evento operacional e chama a
  callback injetada `spawnAgent` para iniciar o sub-agente.
- `awaiting_agents` marca o run como `waiting_agents` e pode re-invocar o
  orquestrador imediatamente caso todos os jobs do turno ja estejam terminais.
- `final_answer` completa o run e encaminha o evento final ao chat.
- `onAgentJobCompleted()` atualiza jobs concluidos ou com erro, verifica se o
  turno terminou e re-invoca o orquestrador com os resultados injetados no
  prompt.
- O runner trata falhas de spawn, erro de job, limite de turnos/agentes e
  timeout de runtime, marcando o run como `failed` e emitindo erro para o chat.
- As dependencias `spawnAgent`, `invokeOrchestrator`, `sendChatEvent` e
  `emitTerminalEvent` sao injetadas para manter o runner testavel sem Electron.

Validacao:

- `node --test electron/services/orchestration/orchestration-runner.test.cjs electron/services/orchestration/orchestration-store.test.cjs`

## Fase 4 - Integracao com ipc-handlers

Status: concluida.

Mudancas implementadas:

- O handler `cli:send` foi refatorado internamente para reutilizar o mesmo
  fluxo de envio quando o runner precisa spawnar sub-agentes ou re-invocar o
  orquestrador.
- Criada `orchestration-ipc-bridge.cjs` para decidir quando um evento JSONL de
  CLI deve ser delegado ao runner, suprimido ou encaminhado ao frontend.
- Eventos `spawn_agent`, `awaiting_agents` e `final_answer` agora sao
  interceptados no fluxo JSONL e nao seguem diretamente para o frontend.
- Sub-agentes sao iniciados com o mesmo mecanismo de `cli:send`, usando um
  modelo leve derivado do `cliType` recebido no evento.
- Eventos `done` de threads filhas sao conectados a `onAgentJobCompleted()`,
  com buffer textual do sub-agente injetado no prompt de re-invocacao.
- O fluxo persistente tambem passa pela ponte de orquestracao para suportar
  CLIs com processo persistente.
- Foram adicionados testes da ponte IPC com runner real e testes auxiliares dos
  eventos/modelos criados pelo IPC.

Validacao:

- `node --test electron/services/ipc-handlers.test.cjs electron/services/orchestration/orchestration-ipc-bridge.test.cjs`

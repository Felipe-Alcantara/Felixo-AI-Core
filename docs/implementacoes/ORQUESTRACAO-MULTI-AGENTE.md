# Implementacao - Orquestracao Multi-Agente

Status: concluido.

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

## Fase 5 - Terminal events e observabilidade

Status: concluida.

Mudancas implementadas:

- Eventos operacionais de orquestracao agora sao formatados por
  `terminal-event-formatter.cjs`.
- Foram adicionados eventos de terminal para spawn de sub-agente, resultado
  recebido, re-invocacao do orquestrador e estado de espera por agentes.
- Eventos de terminal carregam `parentThreadId` quando pertencem a uma thread
  filha, permitindo agrupamento no frontend.
- `useTerminalOutput.ts` preserva `parentThreadId` na sessao de terminal.
- A bridge `window.felixo.cli` ganhou `orchestrationStatus()`.
- O backend registrou o handler IPC `cli:orchestration-status`, que consulta
  runs por `runId`, `threadId` ou lista todos os runs conhecidos.
- Tipos frontend foram ampliados com `OrchestrationRun` e estruturas de
  `agentJobs`.

Validacao:

- `node --test electron/services/terminal-event-formatter.test.cjs electron/services/ipc-handlers.test.cjs`

## Fase 6 - Frontend: UI de orquestracao

Status: concluida.

Mudancas implementadas:

- `StreamEvent` recebeu suporte ao evento interno `orchestration_status` e
  `runId` nos eventos de stream.
- O runner preserva o `sessionId` original da resposta para que
  `final_answer` complete a mensagem correta depois de re-invocacoes.
- `ChatWorkspace.tsx` trata `spawn_agent`, `awaiting_agents`,
  `orchestration_status` e `final_answer`.
- O chat mostra uma barra compacta de estado enquanto aguarda sub-agentes ou
  re-invoca o orquestrador.
- `TerminalPanel.tsx` agrupa visualmente threads filhas logo abaixo da thread
  pai e mostra indicador de papel (`Pai`, `Orq`, `Sub`).
- `useTerminalOutput.ts` ja preserva `parentThreadId` nas sessoes, permitindo
  o agrupamento do painel.

Validacao:

- `node --test electron/services/orchestration/orchestration-runner.test.cjs electron/services/orchestration/orchestration-ipc-bridge.test.cjs`
- `npm run build`
- `npm run lint`

## Ajuste para testes reais

CLIs reais como Codex e Gemini tendem a embrulhar a resposta do modelo dentro
do JSONL do provedor. Por isso, os adapters tambem passaram a reconhecer
eventos de orquestracao quando o conteudo textual do assistente for um objeto
JSON ou um bloco fenced `json` com `spawn_agent`, `awaiting_agents` ou
`final_answer`.

Depois do primeiro teste real via UI, o Codex chamou `gemini` por
`command_execution`, o que deixou a execucao invisivel como sub-agente nativo
do Felixo. Para corrigir isso, o prompt enviado ao orquestrador agora injeta
instrucoes de protocolo quando a mensagem do usuario menciona outro
agente/CLI/modelo ou pede explicitamente spawn. Nesses casos, o orquestrador e
orientado a emitir `spawn_agent` em vez de executar o CLI por shell.

Tambem foi adicionado suporte a eventos textuais em lote no formato JSONL, para
que uma resposta possa conter `spawn_agent` seguido de `awaiting_agents`.

Validacao:

- `node --test electron/services/adapters/codex-adapter.test.cjs electron/services/adapters/claude-adapter.test.cjs electron/services/adapters/gemini-adapter.test.cjs`
- `node --test electron/services/adapters/codex-adapter.test.cjs electron/services/orchestration/orchestration-ipc-bridge.test.cjs`
- `npm test`
- `npm run build`
- `npm run lint`

## Fase 7 - Robustez: tratamento de erros, cleanup e observabilidade

Status: concluida.

Mudancas implementadas:

### Adapters

- **Claude adapter**: filtra eventos `system` com `subtype !== 'init'` para
  evitar captura incorreta de session ID. Trata payloads `assistant` com erro
  (rate limit) e resultados com `is_error: true`, surfaceando mensagem
  user-friendly.
- **Codex adapter**: sessoes agora sao sempre efemeras (`--ephemeral`) e
  `canResume()` retorna `false`, alinhado ao modelo stateless de re-invocacao.
- **Gemini adapter**: detecta erros de ferramenta indisponivel
  (`run_shell_command`/`write_file` nao encontrados) como fatal stderr.
  Reconhece mensagens de retry de capacidade esgotada.

### Orchestration runner

- `resetThread(threadId)` falha runs ativos e limpa mapas de contexto e jobs
  quando o usuario reseta a conversa.
- `forgetRunContext(runId)` remove entradas de `runContexts` e
  `threadAgentJobs` apos conclusao ou falha, evitando estado orfao.
- `final_answer` agora preserva o `sessionId` original da resposta pai e
  inclui `parentThreadId` no evento de chat.
- O prompt de re-invocacao inclui instrucoes detalhadas para formatar a
  resposta final (formato estruturado, sem Markdown, com detalhes concretos).
- Eventos `orchestration_agent_result` agora incluem `result` e `error`.

### IPC handlers

- Eventos de erro do CLI (`done`, `error`, crash) passam por
  `dispatchCliEvent()`/`dispatchPersistentCliEvent()` que delegam ao bridge
  de orquestracao antes de enviar ao frontend.
- `cli:reset-thread` coleta a familia completa da thread (pai + filhos
  recursivos) via `collectThreadFamily()` e reseta todas as sessoes e runs
  associados.
- Mensagem de reset diferencia thread individual de thread com filhas.

### Terminal formatter

- Eventos de orquestracao (`spawn_agent`, `awaiting_agents`, `final_answer`)
  geram entradas descritivas no terminal mostrando decisoes do orquestrador.
- Resultado de sub-agente exibe preview do resultado visivel ou erro.
- Prompt enviado ao CLI e exibido para mensagens curtas e omitido para
  contexto interno de orquestracao.
- Label de cache renomeado para "Cache do provedor".

### Frontend

- `ChatWorkspace.tsx` gera hints de orquestracao para pedidos abertos
  ("pergunte qualquer coisa"), escolhendo topico nao-tecnico via hash
  deterministica.
- Reset de conversa coleta todos os thread IDs conhecidos (conversa, stream,
  sessoes de terminal) para limpeza completa do backend.
- `TerminalPanel.tsx` merge sessoes `orchestrator-turn-*` na sessao pai para
  uma visualizacao mais limpa. Exibe todos os tipos de evento (nao so tools).
  Labels de papel ajustados para `Orq`/`Sub`.
- `StreamEvent` inclui `parentThreadId` para rastreamento de orquestracao.

Validacao:

- `npm test` — 169 testes passando
- Teste real via UI com Codex como orquestrador, Gemini e Claude como sub-agentes

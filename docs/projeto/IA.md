# IA.md — Contexto Operacional do Felixo AI Core

Status: concluido.

## Objetivo do Projeto

[2026-04-28] Felixo AI Core é uma aplicação desktop Linux-first para centralizar ideias, agentes, CLIs de IA e fluxos de trabalho em uma interface única.

[2026-04-28] Primeiro corte: interface simples de chatbot para iniciar ideias, sem integração real com modelos ainda.

## Metas & Milestones

[2026-04-28] Concluído — Scaffold inicial em `app/` com Electron, React, TypeScript, Vite e Tailwind.

[2026-04-28] Concluído — Primeira tela útil: chat local de ideação com seletor visual de modelos.

[2026-04-28] Concluído — Criado `start_app.py` para iniciar o app pela raiz usando Python.

[2026-04-28] Concluído — Interface compactada e arredondada para uma experiência mais leve e menos parecida com dashboard genérico de IA.

[2026-04-28] Concluído — Frontend reorganizado em `src/features/chat/` com componentes, dados, tipos e serviço local separados.

[2026-04-28] Concluído — Processo Electron modularizado em `core/`, `services/` e `windows/`, seguindo separação de responsabilidades do padrão backend Felixo.

[2026-04-28] Concluído — Layout ajustado para o padrão desktop com sidebar fixa, landing central e prompt em destaque inspirado nas referências enviadas.

[2026-04-28] Concluído — Layout adaptado para zoom in/out: sidebar oculta em viewport compacto, prompt quebra controles em múltiplas linhas, landing ganha scroll vertical e janela aceita dimensões menores.

[2026-04-28] Pendente — Conectar os scripts de `ai-clis/` ao Electron via processo controlado.

[2026-04-28] Pendente — Salvar histórico local de conversas e ideias.

[2026-04-29] Em progresso — Integração real com CLIs iniciada pelo backend Electron: gerenciador de processos, adapters JSONL e IPC criados.

[2026-04-29] Concluído — Contratos do renderer atualizados com `cliType`, `StreamEvent` e bridge `window.felixo.cli` tipada.

[2026-04-29] Concluído — Chat React conectado ao bridge `window.felixo.cli`, com resposta assistente vazia, append incremental, cursor de streaming e botão de parar.

## Stack & Dependências

[2026-04-28] Desktop: Electron 41.

[2026-04-28] Frontend: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 3.

[2026-04-28] UI: `lucide-react` para ícones.

[2026-04-28] Tooling: ESLint 10, npm, Node 25.9.0 via `.nvmrc`.

[2026-04-29] Testes: `node:test` para validar adapters de streaming e leitor JSONL do backend Electron.

## Decisões de Arquitetura

[2026-04-28] TypeScript foi escolhido para o primeiro protótipo porque Electron e Vite têm integração direta com a stack frontend recomendada nos padrões Felixo.

[2026-04-28] Python permanece como opção forte para automações, agentes e serviços auxiliares depois que a interface desktop estiver validada.

[2026-04-28] A primeira resposta do chatbot é local e determinística; isso permite validar layout e fluxo antes de conectar CLIs reais.

[2026-04-28] Electron usa `contextIsolation: true`, `nodeIntegration: false` e preload dedicado para preservar uma base segura.

[2026-04-28] Layout padrão da janela ajustado para `1320x760`, com sidebar fixa e área central aproveitando todo o espaço útil.

[2026-04-28] A UI deve tratar zoom como redução do viewport útil: evitar larguras fixas rígidas na área central e preferir breakpoints, wrapping e scroll controlado.

[2026-04-28] `App.tsx` deve permanecer como composição de alto nível; regras e estado do chat ficam em `features/chat`.

[2026-04-28] O processo principal do Electron deve continuar fino, delegando criação de janela e serviços auxiliares para módulos dedicados.

[2026-04-29] Integração de CLIs segue padrão de adapters: `claude`, `codex` e `gemini` convertem formatos próprios de JSONL para um contrato único de evento de stream.

[2026-04-29] `cli-process-manager.cjs` concentra ciclo de vida dos processos filhos; IPC apenas valida entrada, orquestra adapter/processo e publica eventos para o renderer.

[2026-04-29] Leitura de stdout JSONL foi isolada em `jsonl-line-reader.cjs` para preservar linhas parciais entre chunks e facilitar teste unitário.

[2026-04-29] Modelos salvos passaram a carregar `cliType`; registros antigos sem esse campo são normalizados por inferência a partir de nome, origem e comando.

[2026-04-29] `ChatWorkspace` mantém uma sessão ativa por vez para evitar concorrência acidental no MVP; novas mensagens são bloqueadas enquanto há processo CLI em execução.

## Comandos Importantes

```bash
cd app
nvm use
npm install
npm run dev
```

```bash
python3 start_app.py
```

```bash
cd app
npm test
```

```bash
cd app
npm run lint
npm run build
```

## Próximo Passo Técnico

[2026-04-28] Implementar uma camada Electron IPC para executar comandos cadastrados com controle de processo, output incremental e botão de interrupção.

[2026-04-29] Próximo passo: conectar `window.felixo.cli` ao estado do chat React, adicionando `cliType` aos modelos, mensagem assistente vazia, streaming incremental e botão de parar.

## Testes Importantes

[2026-04-29] ✅ `npm test` — valida adapters `claude`, `codex`, `gemini` e preservação de linhas parciais no leitor JSONL.

[2026-04-29] ✅ `npm run build` e `npm run lint` — validação da fase de contratos TypeScript para modelos, stream events e preload bridge.

[2026-04-29] ✅ `npm test`, `npm run build` e `npm run lint` — validação da fase de UI streaming com Composer, ChatWorkspace e ChatThread.

[2026-04-29] BUG: Codex encerrava com código 1 ao enviar prompt pelo app.
CAUSA: adapter executava `codex exec` em um diretório sem git confiável e não passava `--skip-git-repo-check`.
FIX: `codex-adapter.cjs` agora inclui `--skip-git-repo-check`; teste de args atualizado para evitar regressão.

[2026-04-29] BUG: zoom out funcionava, mas zoom in não respondia em alguns teclados.
CAUSA: Electron/Chromium recebia o atalho de zoom in como `Ctrl+=`/`Ctrl++`, sem tratamento explícito no app.
FIX: adicionado `window-zoom-shortcuts.cjs` para capturar `Ctrl/Cmd +`, `Ctrl/Cmd =`, `Ctrl/Cmd -` e `Ctrl/Cmd 0`; testes cobrem os atalhos.

[2026-04-29] BUG: Gemini podia ficar com resposta vazia no chat.
CAUSA: Gemini CLI pode abrir prompt interativo de confiança/autenticação e emitir texto fora de JSONL; como stdout não fechava linha JSON, o chat ficava aguardando.
FIX: `gemini-adapter.cjs` passa `--skip-trust` e `ipc-handlers.cjs` detecta stdout não-JSON para exibir erro claro e encerrar o processo.

[2026-04-29] BUG: Gemini ainda podia ficar vazio quando stdout começava com chunk em branco antes do prompt não-JSON.
CAUSA: a inspeção de stdout era marcada como concluída no primeiro chunk vazio.
FIX: adicionado `jsonl-output-guard.cjs`, que espera conteúdo não vazio antes de decidir entre JSONL e saída interativa.

[2026-04-29] Concluído — Adicionado QA Logger no rodapé do workspace para observar eventos do backend Electron em tempo real.
DETALHE: `qa-logger.cjs` mantém buffer de logs e publica eventos IPC; `QaLoggerPanel.tsx` mostra spawn, stdout, stderr, non-JSON output, close, stop e erros de processo.

[2026-04-29] BUG: Gemini recebia resposta no stdout, mas o chat podia ficar sem o texto real e mostrar apenas o placeholder do Composer.
CAUSA: versão atual do Gemini CLI emite mensagens JSONL com `role:"assistant"` e `delta:true`; o adapter aceitava apenas `role:"model"`.
FIX: `gemini-adapter.cjs` agora aceita mensagens `model` e `assistant`; teste cobre deltas do formato atual do Gemini CLI.

[2026-04-29] BUG: perguntas sobre histórico, como "Qual foi minha última pergunta?", podiam travar no Gemini.
CAUSA: cada envio iniciava uma CLI stateless só com a mensagem atual; o Gemini tentava procurar histórico em arquivos e podia ficar preso em retries `429` sem emitir texto.
FIX: `ChatWorkspace` envia os últimos turnos como contexto embutido no prompt e `ipc-handlers.cjs` interrompe sessões sem saída textual após 120s com erro claro.

[2026-04-30] Concluído — Terminal visual deixou de ser apenas stdout/stderr bruto e passou a receber eventos humanizados via `cli:terminal-output`.
DETALHE: `terminal-event-formatter.cjs` converte lifecycle, resposta, ferramentas, métricas, stderr e erros em eventos consumidos pelo `TerminalPanel`; o JSONL bruto permanece no `QA Logger`.

[2026-04-30] Concluído — Separação formal entre `threadId` e `sessionId`.
DETALHE: `threadId` identifica conversa/modelo/terminal/processo; `sessionId` identifica a mensagem assistente que recebe streaming. Isso permite agrupar várias mensagens no mesmo terminal sem misturar chunks de respostas diferentes.

[2026-04-30] Concluído parcial — Claude agora usa processo persistente real.
DETALHE: `claude-adapter.cjs` expõe `getPersistentSpawnArgs()` com `--input-format stream-json` e `createPersistentInput()` para escrever novas mensagens no `stdin` aberto. `ipc-handlers.cjs` reutiliza o processo por `threadId` e fecha sessões persistentes ociosas após 30 minutos.

[2026-04-30] Concluído — Codex e Gemini passaram a retomar a conversa nativa quando há sessão do provedor.
DETALHE: `codex-adapter.cjs` expõe `getResumeArgs()` com `codex exec resume --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox <providerSessionId>` e `canResume()` só retorna true após capturar `providerSessionId`. `gemini-adapter.cjs` reativou `canResume()` para `providerSessionId` e usa `gemini --resume <session_id> --prompt ... --output-format stream-json --skip-trust --yolo`.
OBS: Ainda não é processo vivo via stdin para Codex/Gemini; cada prompt cria um processo CLI novo, mas ele retoma o mesmo chat do provedor em vez de iniciar uma conversa nova.

[2026-04-30] Documentação — Criado `docs/projeto/STATUS-ATUAL.md` com resumo consolidado do que está pronto, do que ficou parcial e do que falta.
DETALHE: Também foram atualizados `ROADMAP.md`, `TERMINAL-PERSISTENTE.md`, `docs/backend/ELECTRON.md`, `docs/arquitetura/VISAO-GERAL.md`, `docs/app/README.md`, `docs/frontend/SERVICOS.md` e `docs/frontend/COMPONENTES.md`.

[2026-04-30] Arquitetura — Adaptado o modelo para orquestrador híbrido com MCP.
DETALHE: `providers/terminal-adapter-registry.cjs` separa seleção de Terminal Adapters; `orchestrator/cli-execution-planner.cjs` decide processo persistente, retomada nativa ou one-shot; `mcp/felixo-tool-catalog.cjs` define o catálogo inicial das tools Felixo com escrita marcada para confirmação.
TESTE: `npm test` validou adapters, registry, planner, catálogo MCP e serviços existentes.

[2026-05-07] Refatoração — Lógica de seleção de modelo extraída para `orchestrator/spawn-model-selector.cjs`.
DETALHE: `resolveOrchestrationSpawnModel`, `scoreSpawnModel`, `classifySpawnPrompt` e helpers correlatos saíram de `ipc-handlers.cjs` (que apenas reexporta) e ganharam suíte de testes própria. Critério de modulação seguido: separar regra de seleção do ciclo de vida IPC (design system seções 2.2 e 4.1).

[2026-05-07] Decisão de roteamento — Scoring por tipo de tarefa reescrito com prioridades explícitas do usuário.
DETALHE: Código → Claude (+100) > Codex (+75) > Gemini (+25); long-context dividido em sub-kinds `long-context-doc` (Gemini lidera) e `long-context-reasoning` (Codex lidera); nova categoria `reasoning` para prompts gerais com sinais de análise/planejamento/feature/trade-off, roteando preferencialmente para Codex; bônus default Claude (+5) atua só como tie-breaker quando o usuário não configurou `preferredModelIds`.
OBS: Vocabulário ampliado via prefix-match (regex sem `\b` final), robusto a flexões em português após normalização NFD.

[2026-05-07] Decisão de roteamento — Defaults de variant/effort por cliType aplicados no spawn.
DETALHE: `applyVariantDefaults` preenche `providerModel`/`reasoningEffort` quando o catálogo não especifica: Claude→`opus`/`medium`, Codex/codex-app-server→`gpt-5.5`/`xhigh`, Gemini/gemini-acp→`gemini-3-pro-preview`/`high`. Configurações vindas do frontend continuam prevalecendo. Garante que sub-agentes sempre rodem na melhor capacidade disponível.

[2026-05-07] Confiabilidade — Spawn garantido em último caso para nunca abortar a tarefa.
DETALHE: Quando nenhum provider está operacional (todos rate-limited/cooldown), o seletor agora retorna `ok:true` com `selectionRule: 'last-resort'`, escolhendo o melhor modelo não-bloqueado mesmo com limite reportado. Bloqueios explícitos do usuário continuam respeitados — `ok:false` só ocorre quando nada está cadastrado ou tudo foi bloqueado.
OBS: Princípio: a tarefa deve concluir de alguma forma. Indisponibilidade transitória nunca deve interromper o fluxo.

[2026-05-07] Confiabilidade — Mid-task fallback: re-spawn de sub-agente em outro modelo ao bater limite durante a execução.
DETALHE: Em `orchestration-runner.cjs`, antes de marcar um job como falho, `tryMidTaskFallback` detecta se o erro é availability issue (via `detectAvailabilityIssue`), registra no `modelAvailabilityRegistry`, pede ao `validateSpawnAgent` um modelo alternativo e re-spawna mantendo `agentId`/`threadId`. Prompt de continuação inclui tarefa original + progresso parcial (capturado no bridge via `consumeOutput`). Limite configurável `maxAgentFallbackAttempts` (default 2). Erros não-quota seguem direto para `failAgentJob`. Emite `orchestration_agent_fallback` no terminal para auditoria.
FIX: `orchestration-ipc-bridge.cjs` agora propaga `partialOutput` ao `onAgentJobCompleted` em caso de erro — antes, o output capturado era descartado.

[2026-05-07] Observabilidade — Registry de disponibilidade ganha `subscribe()` e seletor expõe fila de fallback.
DETALHE: `createModelAvailabilityRegistry` aceita listeners notificados em transições (model passou a `limit_reached`/`no_login` ou voltou a `available` via `clearForModel`); não re-notifica entradas idênticas. Runner se inscreve automaticamente quando o contexto da run inclui um registry e propaga como `orchestration_model_availability` no terminal. `getFallbackOrderForCliType` no seletor retorna candidatos ordenados por tier (`operational` → `cross-provider` → `last-resort`), respeitando bloqueios e indisponibilidade — função pura, sem cache (filter+sort em listas pequenas, cache seria invalidation hell sem ganho real).

[2026-05-07] TESTE — Suíte completa em verde após as 6 mudanças do orquestrador.
DETALHE: `node --test` em `app/electron/services/`: 240 pass, 0 fail, 7 skipped. Cobertura nova: classificação de prompt e sub-kinds, prioridades por tipo de tarefa, defaults de variant, last-resort, mid-task fallback (3 cenários), notificação de availability, fila de fallback ordenada.

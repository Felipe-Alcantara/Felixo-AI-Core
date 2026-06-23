# IA.md — Contexto Operacional do Felixo AI Core

Status: em evolução ativa — canvas estilo n8n como produto principal.

> Este arquivo segue o template de contexto do padrão de qualidade (`TEMPLATE-CONTEXTO-IA`). O "Histórico de Evolução" mantém a trilha cronológica densa das fases; as seções fixas acima consolidam o estado atual.

## Protocolo de Encerramento

[2026-06-22] Regra operacional — Quando um agente marcar algo como "em andamento" no md do canvas, esse estado só pode existir como passagem intermediária. Antes de encerrar a resposta, o agente precisa voltar ao arquivo e deixar a linha/fase em um estado final claro: concluído quando terminou, ou bloqueado/aguardando decisão/interrompido com motivo quando parou no meio. O arquivo não deve ficar com a última atualização presa em "em andamento".

## Objetivo do Projeto

[2026-04-28] Felixo AI Core é uma aplicação desktop Linux-first para centralizar ideias, agentes, CLIs de IA e fluxos de trabalho em uma interface única.

[2026-04-28] Primeiro corte: interface simples de chatbot para iniciar ideias, sem integração real com modelos ainda.

[2026-06-22] PIVÔ — O produto principal passou a ser um canvas estilo n8n: blocos visuais (terminais reais, notas, arquivos .md compartilhados, grupos) que o usuário arranja e conecta. Cada terminal é um pseudo-terminal de verdade (node-pty + xterm.js) onde o agente roda nativo. O chat continua acessível por um toggle, mas o canvas é a tela padrão.

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

[2026-06-18] Terminal interativo: `node-pty` (PTY real) + `@electron/rebuild` para o pivô de chat mascarado → terminais de verdade. Frontend de terminal (xterm.js) entra na fase seguinte.

[2026-06-18] Terminal no renderer: `@xterm/xterm` + `@xterm/addon-fit` para pintar os bytes crus do PTY.

[2026-06-18] Canvas: `@xyflow/react` (React Flow 12) para o dashboard de blocos estilo n8n.

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

[2026-06-18] Dois caminhos de terminal coexistem: o `child_process` + JSONL (orquestração estruturada do chat) permanece intacto; o caminho PTY (`pty-process-manager.cjs`) é paralelo e serve os blocos do canvas com bytes crus.

[2026-06-19] No canvas, os terminais vivem numa store própria (`TerminalSessionStore`) fora dos componentes React, então a sessão PTY continua rodando em background mesmo quando o bloco está recolhido; o elemento xterm é movido (attach) entre o card e o drawer lateral em vez de recriado.

[2026-06-21] O estado das conversas é externalizado em arquivos `.md` reais em `userData/canvas-files` (fora dos projetos, para não vazar no git de quem usa); blocos-arquivo renderizam e observam esses arquivos, e os agentes os editam — memória compartilhada entre agentes via arquivos.

[2026-06-22] `src/features/` separado em três irmãs com dependência num sentido só: `canvas` → `shared`, `chat` → `shared`, `shared` não depende de ninguém. Canvas e chat não se importam mais. `App.tsx` renderiza o canvas por padrão e mantém o chat por um toggle.

[2026-06-22] Portabilidade do canvas usa manifesto JSON versionado `.fxcanvas`: layout e conexões ficam no contrato estruturado, enquanto somente os `.md` referenciados por blocos de arquivo levam conteúdo. A importação valida todo o manifesto antes de substituir dados, grava nós/conexões em transação e restaura os arquivos anteriores se a operação falhar.

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

[2026-05-07] Decisão de design — Orquestrador é estritamente delegador, nunca executor.
DETALHE: Adicionada seção `delegationOnly` em `orchestrator-prompt-presets.json` com regra explícita: toda tarefa concreta (código, edição, análise, planejamento, escrita) deve ser spawnada via `spawn_agent`, mesmo quando o cliType escolhido coincida com o do orquestrador rodando. Múltiplas tarefas independentes devem ser emitidas em paralelo (vários `spawn_agent` + `awaiting_agents`), nunca serializadas. Frontend (`ChatWorkspace.tsx`) injeta a seção no topo do protocolo enviado à CLI.
OBS: Sem essa regra, a IA-pai com bom poder de execução tendia a responder direto, perdendo o sentido do projeto ("usar IA custo-benefício para coordenar várias inteligentes").

[2026-05-07] Helper público — `getPriorityOrderFor(category)` exposto pelo seletor.
DETALHE: Retorna o ranking estático de cliTypes para `code`, `reasoning`, `long-context-doc`, `long-context-reasoning` e `general`, espelhando os bônus do `scoreSpawnModel`. Categoria desconhecida cai em `general`. Sempre retorna cópia fresca para callers poderem mutar. Útil para UI/diagnóstico exibir a fila de prioridade por tipo de tarefa sem inspecionar lógica de scoring.

[2026-05-07] Confiabilidade — Anti-stampede: distribuir fallbacks simultâneos entre providers.
DETALHE: Quando vários sub-agentes batem o mesmo limite em janela curta, cada `tryMidTaskFallback` consultava o seletor independentemente e todos eram empilhados no mesmo provider. Agora o runner mantém `cliTypeFallbackLoad` (Map por run, limpo em `forgetRunContext`) e, ao atingir `fallbackLoadThreshold` (default 2) num cliType, percorre `getFallbackOrderForCliType` no mesmo tier para escolher o provider menos carregado. Tier worse-than-validated nunca é escolhido só para espalhar — qualidade vem antes. Evento `orchestration_agent_fallback` ganha `spreadFromCliType` para auditoria.

[2026-05-07] Observabilidade UI — Painel consolidado de orquestração no frontend.
DETALHE: `useOrchestrationDashboard` (hook) agrega eventos `cli:terminal-output` filtrados por `kind:'lifecycle'`/`source:'system'` em estado estruturado (runs → agentes com status, modelo atual, histórico de fallbacks; lista de modelos com limite). `OrchestrationDashboardPanel.tsx` renderiza esse estado abaixo do chat, expansível, mostrando "X runs · Y/Z agentes ativos · N modelos com limite", lista de modelos limitados com reset previsto, e detalhamento por run (agente, status, fallbacks). Formatador (`terminal-event-formatter.cjs`) ganhou cases para `orchestration_agent_fallback` e `orchestration_model_availability` para alimentar o hook com `metadata` rico.

[2026-05-07] TESTE — Suíte estendida após commits de paralelismo e UI.
DETALHE: 246 pass, 0 fail, 7 skipped. Novos: scoring helper, spread anti-stampede, formatadores de fallback/availability. `tsc --noEmit` em `app/` limpo após adicionar hook + componente do dashboard.

[2026-05-07] Confiabilidade — Trava mecânica anti-intuição: orquestrador é proibido de responder direto quando o pedido exige trabalho.
DETALHE: Preset `delegationOnly` reforçado com linguagem firme contra "intuição/autoconfiança/urgência percebida"; nova chave `delegationGuard.rejectionPrompt` para reinjetar quando a guard ativa. Novo módulo `orchestrator/delegation-policy.cjs` expõe `requiresDelegation(prompt)`: heurística com (i) regex de verbos de ação em flexões `[ae]` cobrindo conjugações pt-BR, (ii) prefixos triviais (saudações/ack), (iii) threshold de 120 chars para prompts longos sempre exigirem delegação, (iv) default seguro pra prompts médios sem verbo. Runner ganha `tryDelegationGuard`: ao receber `final_answer` sem nenhum agente spawnado *e* `originalPrompt` requer delegação, re-invoca o orquestrador com `rejectionPrompt`. Limite `maxDelegationGuardAttempts` (default 1) evita loop caso o LLM-pai insista. Emite `orchestration_delegation_rejected` no terminal. Cobertura: 7 testes da heurística + 4 do guard no runner. Suíte total: 257 pass.
OBS: Combinação de preset firme (camada de instrução) + guard mecânico (camada de imposição) — sem o guard, o LLM podia ignorar o preset; sem o preset, o guard rejeitaria sem explicar a regra ao modelo.

[2026-05-07] BUG CRÍTICO — `spawnOrchestrationAgent` removida acidentalmente no commit dc70f64.
CAUSA: A extração do seletor pra módulo próprio levou junto a função `spawnOrchestrationAgent`, mas a referência em `ipc-handlers.cjs:174` (dentro do construtor do `orchestrationRunner`) ficou. Em runtime, qualquer spawn real explodia ReferenceError; testes não pegaram porque mockam `spawnAgent` direto no construtor.
FIX: Função restaurada em `ipc-handlers.cjs` com mesmo corpo do original e exportada para teste de regressão. 2 novos testes cobrem caminho ok (model com defaults `opus`/`medium`, role=agent, agentId propagado) e ok:false (sem modelo disponível).

[2026-05-07] FIX — Orquestrador agora vê o `providerModel` real que será usado no spawn.
CAUSA: `createModelCapabilityProfiles` em `orchestrator-settings-storage.ts` exibia `modelo=padrao` quando o catálogo (`models.ts`) não tinha `providerModel` setado — o que é o caso default. O LLM-pai então adivinhava com base no modelo dele próprio, descrevendo coisas como "haiku" / "flash-lite" mesmo que o spawn fosse usar opus.
FIX: Adicionado `CLI_TYPE_VARIANT_DEFAULTS` no frontend (espelho do backend) + helpers `getEffectiveProviderModel` / `getEffectiveReasoningEffort` aplicados ao construir o profile. Comentário explícito de "manter em sync com o seletor". Preferências do catálogo seguem prevalecendo.

[2026-05-07] BUG — Protocolo de delegação só era injetado quando o prompt mencionava agentes/CLIs/modelos.
CAUSA: `shouldUseOrchestrationProtocol` em ChatWorkspace.tsx só ativava o protocolo (delegationOnly + multiAgentProtocol + orchestrationContextBlock) quando o prompt continha "gemini|claude|codex|agente|cli|modelo". Tarefas reais como "crie um arquivo" iam à CLI sem qualquer instrução de delegação, então o LLM-pai respondia direto por intuição. Pior: o orquestrador nem sabia que existiam outros modelos spawnaveis (descrevia só o Claude porque é o que ele é).
FIX: Criado `services/delegation-policy.ts` (espelho TS do `delegation-policy.cjs` do backend, com comentário "manter em sync"). `shouldUseOrchestrationProtocol` agora também consulta `requiresDelegation(prompt)` — qualquer prompt que exija trabalho real recebe o protocolo + a descrição completa dos modelos spawnaveis.

[2026-05-07] BUG — Texto livre do orquestrador escapava do `delegationGuard`.
CAUSA: O guard adicionado anteriormente só atuava quando o LLM-pai emitia `final_answer` (JSON). Se ele escolhesse responder em texto puro, o stream passava direto pro chat sem chegar ao runner — a regra anti-intuição não era acionada.
FIX: Novo método `runner.checkOrchestratorDoneWithoutSpawn({ threadId, context })` invocado pelo `orchestration-ipc-bridge.cjs` quando `cliEvent.type === 'done'` chega num thread que **não é** de sub-agente. Se a run ainda não tem `agentJobs` *e* `requiresDelegation(originalPrompt)` é true, dispara `tryDelegationGuard` (mesmo fluxo do `final_answer`): re-invoca o orquestrador com o `rejectionPrompt`. Cobertura: 3 novos testes no runner (free-text re-invoca, trivial é no-op, com agentes spawnados é no-op).
OBS: A primeira resposta direta ainda pode aparecer brevemente no chat antes do guard atuar — caminho passivo (caminho 2 do trade-off discutido). Caminho estrito (interromper o stream) ficou fora porque correria risco de cortar JSON legítimo emitido após explicação curta.

[2026-05-07] BUG/FIX combinado — Orquestrador rodando em modelo fraco + brecha 'trivial' + vazamento de resposta direta.
CAUSA: Log capturado mostrou Claude Code CLI rodando como orquestrador-mor com `providerModel=haiku reasoningEffort=low` (escolha do usuário no Composer não era sobrescrita), classificando metaperguntas como "checagem trivial" e respondendo direto em texto puro com fatos imprecisos sobre o sistema (descreveu Gemini 2.5 flash lite quando o catálogo Felixo manda gemini-3-pro-preview).
FIX (3 commits):
1. Preset endurecido (`delegationOnly`): metaperguntas sobre o sistema (capacidades, modelos, limites, tools, "como funciona", "voce sabe X") declaradas explicitamente como NÃO-triviais — exigem sub-agente que consulte o estado real do código/config. Lista binária do que é direto-permitido: (a) `final_answer` pós-agente, (b) cumprimento literal isolado, (c) recusa por segurança. Autonomia preservada via regra explícita: "você decide como dividir, qual cliType, qual prompt; o que você não tem autonomia é pular a delegação".
2. Tier topo forçado no orquestrador-mor: `services/delegation-policy.ts` ganha `applyOrchestratorTierOverride(model)`. `ChatWorkspace.tsx` aplica quando `shouldUseOrchestrationProtocol(content)` é true: substitui `providerModel`/`reasoningEffort` do `selectedModel` por `opus/medium`, `gpt-5.5/xhigh` ou `gemini-3-pro-preview/high`. Composer continua respeitado em chat direto sem orquestração.
3. Timeout proativo no bridge: `orchestration-ipc-bridge.cjs` ganha `freeTextTimeoutMs` (default 4s) + `abortStream` callback. Quando o orquestrador emite texto antes de qualquer evento estruturado, agenda timer; se nenhum JSON estruturado chegar a tempo, aborta o processo via `cliManager.kill(sessionId)` e dispara o guard cedo, reduzindo o vazamento visual da resposta direta. Estado limpo em `done`/`error` ou quando o evento estruturado chega. Cobertura: 2 testes (timeout dispara + abort, structured-event chega a tempo cancela timer). Suíte total: 271 pass.

[2026-05-07] Decisão de roteamento — Tier-pickup dentro do mesmo cliType (opus > sonnet > haiku, etc).
DETALHE: `scoreSpawnModel` ganhou `getProviderModelTierBonus(providerModel)` aplicado quando o modelo NÃO está em `preferredModelIds`. Ranking: top tier (`opus`, `gpt-5.5`, `gemini-3-pro`) +50; mid (`sonnet`, `gpt-5.5-codex`, `gpt-5.4`, `flash`) entre +12 e +25; bottom (`haiku`, `mini`, `lite`, `flash-lite`) entre −15 e −20. Substitui o bônus invertido anterior (`+10/+8` pra `lite/mini`) que favorecia tiers baixos. Fallback de tier dentro do cliType acontece naturalmente: quando o topo está rate-limited, `isModelOperational` filtra antes do scoring e o próximo tier vence. Cobertura: 6 novos testes (rankings por família, opus vs haiku, preferência do usuário sobrescreve tier, fallback intra-cliType). Suíte total: 266 pass.
OBS: Configuração explícita do usuário (preferredModelIds) sempre vence o tier — quem quiser haiku rodando consegue.

[2026-05-07] Persistência — Migração de localStorage para SQLite (automations + models).
DETALHE: Migration 002 cria tabela `automations` (id/name/description/prompt/scope/is_default), migration 003 cria tabela `models` (id/name/command/source/cli_type/provider_model/reasoning_effort). Ambas com soft delete via `archived_at` e índices por scope/cli_type. Frontend ganha `loadXFromBackend`/`saveXToBackend`/`hasXBackendMigrationRun` no padrão dos demais módulos; `ChatWorkspace.tsx` faz dual-write (localStorage + backend) e migra dados existentes do localStorage no primeiro load. `orchestrator-settings-store` já consolidado em `settings` (key `orchestrator.settings`) — JSON legado em `~/.config/felixo-ai-core/config/orchestrator-settings.json` é lido uma vez como migração. Tema continua em localStorage (decisão consciente, preferência leve). Doc atualizada em `docs/backend/PERSISTENCIA-SQLITE.md` com tabela de schema e seção de portabilidade Postgres (Railway).

[2026-05-07] Feature — Auto-import de Felixo-System-Design como guia obrigatório.
DETALHE: Migration 004 cria `system_design_documents` (path PK/title/summary/content/byte_size/source_sha/updated_at). Service `system-design-service.cjs` clona via `git clone --depth 1` (primeiro run) e atualiza via `fetch + reset --hard origin/<branch>` (runs subsequentes), em `~/.config/felixo-ai-core/config/system-design/repo`. Lê todos os `.md` (cap 256KB cada), extrai title (primeiro h1) e summary (primeira linha de parágrafo), indexa via `system-design-repository.cjs` com `deleteMissing` para limpar arquivos removidos do repo upstream. IPC: `get-config`, `save-config`, `list-documents`, `get-document`, `sync`, `reset-cache`. Config persistida em `settings.system-design.config` (toggle `enabled`, `repoUrl`, `branch`, `lastSha`, `lastSyncedAt`, `lastError`). UI: nova seção em `FelixoSettingsModal` com checkbox "Usar como guia obrigatório", info de última sync/SHA/contagem, botões "Sincronizar agora" e "Limpar cache", índice expansível. Hook `useSystemDesignSettings` encapsula state + IPC; ativar pela primeira vez dispara sync automático. Injeção no prompt via `createSystemDesignPromptBlock` em `services/system-design-prompt.ts` — quando enabled, anexa ao `orchestrationContextBlock` instrução "você DEVE seguir os padrões" + repo URL + SHA + índice (path/título/summary curto) para sub-agentes consultarem com Read. Cobertura: 8 testes (parser de markdown, defaults da config, normalização). Suíte total: 279 pass.
OBS: Ainda sem auto-sync periódico — apenas no startup do app (via primeira leitura da config) ou via botão manual. Pode evoluir depois se necessário.

## Histórico de Evolução

> Registro cronológico denso das fases. Mantido como trilha auditável (decisões, bugs e validações na ordem em que aconteceram). As decisões estruturais consolidadas estão resumidas em "Decisões de Arquitetura" acima.

[2026-06-18] PIVÔ — De chat mascarado para terminais interativos reais (node-pty + xterm.js).
CONTEXTO: O caminho de mascarar o terminal como chat era instável porque `cross-spawn` usa pipes (não PTY); CLIs interativos detectam `isatty()=false` e se comportam de forma imprevisível, e o parser de stdout→chat era frágil. Nova essência do projeto: dashboard estilo n8n onde cada nó é um terminal de verdade, com o qual o humano interage direto. Orquestração permanece humana por ora (um passo de cada vez para não travar como antes).
DECISÃO (conviver, não substituir): mantido o caminho `child_process` + JSONL (orquestração estruturada existente, ~352 testes) intacto; ADICIONADO um caminho PTY paralelo. Contrato preservado conforme Guia Mínimo de Qualidade (preservar contratos / mudança pequena e rastreável).
DETALHE: Novo `services/pty-process-manager.cjs` — classe `PtyProcessManager` espelhando o contrato do `CliProcessManager` (`spawn`/`get`/`has`/`write`/`kill`/`killAll`) com semântica PTY: `spawn` roda o shell (ou comando) num pseudo-terminal e faz stream dos bytes crus via `onData`; `resize(cols,rows)` mantém o CLI redesenhando para o tamanho da view; kill graceful (SIGTERM→SIGKILL após 5s, timer `unref`) vs `force` imediato; reusa `createCliEnv` e `platform.getDefaultShell`. Saída crua é destinada ao xterm.js no renderer — distinta do terminal humanizado (`cli:terminal-output`), que continua servindo o caminho JSONL.
ABI/BUILD: `node-pty` é addon nativo; ABI do Node (testes) ≠ ABI do Electron (app). Para nunca cair em erro de ABI confuso: `npm run dev` roda `rebuild:electron` antes de subir; `pretest` roda `rebuild:node` antes dos testes; `electron-builder` rebuilda sozinho no `dist`/`pack` (npmRebuild default). O `require('node-pty')` é lazy dentro de `resolveSpawnPty()` e injetável (factory fake nos testes), então `node:test` nunca toca o binário nativo.
TESTE: `pty-process-manager.test.cjs` — 10 testes com PTY fake injetado (spawn+stream, command/args/dims explícitos, write isolado por sessão, resize com bookkeeping + skip redundante, clamp de dims inválidas, kill force vs graceful, cleanup no exit, re-spawn substituindo sessão, killAll). Suíte total: 362 pass, 0 fail. `npm run lint` limpo.
PRÓXIMO PASSO: Fase 2 — componente xterm.js no renderer + IPC `pty:*`. Depois Fase 3: canvas estilo n8n (React Flow) com cada nó embutindo um terminal expansível.

[2026-06-18] Fase 2 — Terminal interativo visível (xterm.js + IPC PTY).
DETALHE: `services/pty-ipc-handlers.cjs` (padrão `register*IpcHandlers`) liga o renderer ao `PtyProcessManager`: `pty:spawn`/`pty:write`/`pty:resize`/`pty:kill` (invoke) + push de `pty:data` (bytes crus) e `pty:exit` para a janela via `webContents.send`. `dispose()` faz `killAll({force})` e é chamado no `before-quit` do `main.cjs`. Bridge `window.felixo.pty` exposta no `preload.cjs` e tipada no `vite-env.d.ts`.
COMPONENTE: `features/chat/components/LiveTerminalPanel.tsx` — monta um `Terminal` xterm.js + `FitAddon`, liga `terminal.onData`→`pty.write` (teclado→PTY), `pty.onData`→`terminal.write` (PTY→tela), `ResizeObserver`→`fit()`+`pty.resize` (view→PTY). Cleanup no unmount: remove listeners, `pty.kill(force)`, `terminal.dispose()`. Nome distinto do `TerminalPanel.tsx` humanizado (caminho JSONL) — são dois renderizadores diferentes. Distinto: este pinta bytes crus, o outro mostra eventos formatados.
TESTE-VISUAL: botão flutuante "Terminal" em `App.tsx` abre overlay com o `LiveTerminalPanel` (id de sessão por abertura). Ponto de teste descartável até a Fase 3 (canvas) substituir por nós.
TESTE: `pty-ipc-handlers.test.cjs` — 8 testes (validação de sessionId, shaping de erro, spawn encaminha data/exit à janela, erro sem sessionId, write/resize/kill encaminhados, dispose→killAll). Stub de `electron` via `Module._load` para carregar sob `node:test`. Suíte total: 370 pass, 0 fail. `npm run build` (tsc+vite) e `npm run lint` limpos.
PRÓXIMO PASSO: Fase 3 — canvas estilo n8n (React Flow), cada nó embutindo um `LiveTerminalPanel` expansível, com conexões visuais entre nós.

[2026-06-18] BUG — Terminal mostrava "Processo encerrado (codigo 0)" com o agente vivo.
CAUSA: React StrictMode monta o efeito do `LiveTerminalPanel` duas vezes em dev com o mesmo `sessionId`. O cleanup da 1ª montagem dava `pty.kill` na sessão que a 2ª acabara de criar (id compartilhado), e o `pty:exit` resultante vazava para a view ativa.
FIX: cada montagem do efeito gera um id de sessão PTY único (`sessionId::uuid`) e filtra `pty:data`/`pty:exit` por esse id, isolando as montagens. Segue a convenção `crypto.randomUUID?.()` já usada no projeto.

[2026-06-18] ✅ VALIDAÇÃO VISUAL — Pivô confirmado de ponta a ponta pelo usuário.
DETALHE: Claude Code rodou interativo dentro do `LiveTerminalPanel` (banner ASCII colorido renderizando nativo via PTY — algo impossível no caminho antigo de pipes), e o terminal permanece aberto aguardando entrada após o fix do StrictMode. Fases 1 e 2 do pivô (chat mascarado → terminais reais) entregues e funcionais.

[2026-06-18] Fase 3 — Canvas estilo n8n como tela principal (React Flow).
CONTEXTO: Essência nova do projeto. Decisões do usuário: canvas vira a tela principal (chat acessível por toggle), 2 tipos de nó (terminal + nota), e persistência em SQLite já nesta fase.
STACK: `@xyflow/react` (React Flow 12) adicionado.
BACKEND: Migration `005_canvas.sql` cria `canvas_nodes` (id/type∈{terminal,note}/position_x/position_y/width/height/data_json/timestamps/archived_at, índice por updated_at), seguindo o padrão soft-delete das migrations 002-004. `storage/canvas-repository.cjs` (factory list/save/delete, normalize+map, dims opcionais como null) espelha `notes-repository`. `canvas-ipc-handlers.cjs` (`canvas:list/save/delete`) no padrão `register*IpcHandlers`, wired no `main.cjs` com `{ database }`. Bridge `window.felixo.canvas` no preload + tipo `PersistedCanvasNode` no vite-env. Glob de teste do `package.json` passou a incluir `electron/services/storage/*.test.cjs` (antes os testes de storage não eram coletados pelo `npm test`).
FRONTEND: Feature isolada em `features/canvas/`. `CanvasView` monta o React Flow com `nodeTypes` {terminal, note}, toolbar para adicionar nós, Background/Controls/MiniMap, conexões entre nós (decorativas). `TerminalNode` embute o `LiveTerminalPanel` (id do nó = identidade da sessão PTY) com `NodeResizer`. `NoteNode` é um textarea editável (sticky note). `useCanvasPersistence` (hook) é dono do estado dos nós, hidrata do backend uma vez e persiste posição/tamanho/data com debounce de 400ms (salva no commit do drag/resize, não a cada frame); callbacks injetados (onTextChange) são removidos antes de persistir (data tem que ser JSON puro). `App.tsx`: canvas é a tela default, com toggle flutuante canvas↔chat (botão de terminal de teste da Fase 2 removido — terminais agora são nós).
DECISÃO (set-state-in-effect): hidratação dos nós persistidos foi movida para dentro do hook (no callback do load), e a injeção do `onTextChange` acontece em render time via `useMemo`, evitando `setState` derivado em `useEffect` (regra `react-hooks/set-state-in-effect`).
TESTE: `canvas-repository.test.cjs` — 4 testes (CRUD + soft-delete, nota com dims null, normalize rejeita type/id inválidos, coerção de defaults). Suíte total: 374 pass, 0 fail. `npm run build` (tsc+vite) e `npm run lint` limpos.

[2026-06-18] ✅ VALIDAÇÃO VISUAL — Fase 3 confirmada pelo usuário.
DETALHE: Dois nós-terminal independentes lado a lado no canvas, ambos com shell vivo (status "ativo"), redimensionáveis (NodeResizer), refletidos no MiniMap. Toolbar Terminal/Nota e toggle Chat funcionando. O pivô completo (chat mascarado → dashboard n8n com terminais reais) está de pé como tela principal.
PRÓXIMO PASSO: ideias para quem contribuir — persistir edges/conexões (hoje visuais, não salvam), nós orquestrados (ler saída estruturada), presets de prompt por nó.

[2026-06-19] Fase 3.1 — Rodada de melhorias do canvas (feedback do usuário, commits pequenos).
1. DRAG: nós não moviam (corpo é nodrag para poder digitar). Cada nó ganhou um `NodeHeader` que é o único drag handle (prop `dragHandle`); header também remove o nó. `GroupNode` tem seu próprio header editável.
2. UI: minimap/controles do React Flow colidiam com o rodapé (toggle Chat) e usavam tema claro. Minimap foi para o topo-direito, controles ganharam margem, e há override de CSS para o tema escuro (`.react-flow__controls-button`, `.react-flow__minimap`).
3. COR DA NOTA: seletor de cor no header (amber/emerald/sky/rose/zinc) via `note-colors.ts`; cor persiste. Callback do nó virou `onDataChange(id, patch)` genérico (era `onTextChange`).
4. MARKDOWN NA NOTA: toggle editar/visualizar; preview reusa `MarkdownContent` (remark-gfm → checklists `- [ ]`) sobre painel escuro; edição em textarea monospace.
5. PROJETO NO TERMINAL: botão Terminal virou `TerminalMenu` (split + caret) — "Local (sem projeto)" usa cwd padrão, ou escolhe um projeto e abre o terminal na pasta dele (cwd=path). Projetos vêm de `window.felixo.projects.list`.
6. NÓS-GRUPO: tipo `group` (subflow). Migration 006 amplia o CHECK de type e adiciona `parent_id` (SQLite recria a tabela). `GroupNode` (título editável), reparenting por drag-stop (hit-test sobre limites do grupo), grupos renderizados atrás dos filhos. Persistência carrega `parentId`+`extent:'parent'`.
TESTE: suíte 375 pass, 0 fail (novo teste de grupo+parentId). `npm run build` e `npm run lint` limpos. Cada item saiu em commit próprio (feat/fix) seguindo a política de git.
NOTA DE DÍVIDA: reparenting só reparenta nós top-level (posição absoluta); arrastar um filho para fora ou entre grupos não foi coberto nesta rodada.

[2026-06-19] Fase 3.2 — Reconcepção do terminal: blocos recolhidos + drawer lateral (pedido do usuário).
VISÃO (do usuário): não quer terminais grandes "jogados" no canvas. Cada nó deve ser um BLOCO PEQUENO e limpo (título/status/preview); ao EXPANDIR, o terminal real abre num PAINEL LATERAL à direita (redimensionável), sem inflar o canvas. O terminal deve RODAR EM BACKGROUND mesmo recolhido e INDICAR se o agente está trabalhando ou já terminou.
ARQUITETURA: O `LiveTerminalPanel` criava/matava o xterm+PTY junto do componente — incompatível com "vivo em background". Extraído para uma camada de sessões: `terminal/terminal-session-store.ts` (`TerminalSessionStore`) é dona do `Terminal` (xterm) e do PTY, mantém vivos, e expõe `ensure/attach/detach/fit/focus/subscribe/remove`. O elemento DOM do xterm é MOVIDO (attach) entre o card e o drawer — não recriado — então scrollback e processo sobrevivem. Provider/hooks separados por causa do react-refresh: `TerminalSessionProvider.tsx` (só componente) + `terminal-session-context.ts` (`useTerminalSessions`, `useSessionSnapshot`).
ATIVIDADE (working/idle): derivada do FLUXO de output, sem parsear texto. Recebeu bytes → `working`; silêncio por 1.5s → `idle` (terminou o turno/esperando); `pty:exit` → `exited`. O card mostra spinner (trabalhando) / ponto verde (aguardando) / encerrado.
UI: `TerminalNode` virou um card compacto (ícone, título, badge de atividade, preview das últimas ~6 linhas sem ANSI) com botão expandir. `TerminalDrawer` é o painel lateral direito redimensionável (drag na borda) que faz `attach` do xterm vivo. `CanvasView` virou `CanvasView`(provider) + `CanvasInner`; guarda `expandedTerminalId`, encolhe o canvas (flex) quando o drawer abre, injeta `onExpand` nos nós-terminal.
LIMPEZA: `LiveTerminalPanel.tsx` removido (órfão; lógica migrou para a store).
TESTE: build (tsc+vite) e lint limpos; suíte 375 pass, 0 fail.
DÍVIDA/PRÓXIMO: heurística de idle é por tempo (1.5s) — pode marcar idle no meio de uma pausa do agente; persistência do tamanho do drawer e do estado expandido não foi feita; store ainda sem teste unitário próprio (depende de xterm/DOM).

[2026-06-19] Fase 3.3 — Rodada de refinamentos do terminal/canvas (feedback do usuário, commits pequenos).
6. CWD: `pty-process-manager` usava `process.cwd()` como fallback (pasta do app) — terminal 'Local' abria em .../FelixoVerse. Trocado para `os.homedir()`: sem projeto abre em ~.
5. PREVIEW: o card lia o stream cru e removia ANSI na mão, deixando lixo ('T T T'). Agora `computePreview` lê do buffer já renderizado do xterm (`terminal.buffer.active`, `translateToString`), e `markWorking` só emite na transição working/idle (sem re-render por byte). Card renderiza cada linha truncada.
4. NOMES: `NodeHeader` ganhou modo de título editável (input controlado pelo valor persistido). `TerminalNode` usa para renomear o bloco (persiste em `data.label`); grupos já eram nomeáveis.
3. TROCAR DRAWER: clicar em outro card já trocava `expandedTerminalId`, mas o elemento do terminal anterior ficava no container, empilhando. `attach()` agora limpa terminais estranhos do container antes de montar.
1. SELEÇÃO MÚLTIPLA: `<ReactFlow>` com `selectionOnDrag` + `panOnDrag={[1,2]}` + `multiSelectionKeyCode=['Shift']` + `panActivationKeyCode='Space'`. Arrastar no vazio = caixa de seleção; Espaço/botão-do-meio = pan.
2. AGENTE+PROJETO: `TerminalMenu` virou um painel com seletor de agente (Nenhum/Claude/Gemini/Codex → comando) e de projeto (Local/projeto → cwd); abre com qualquer combinação (ou nada). Comandos reais vêm do cli-detector (`claude`/`gemini`/`codex`). Nome do bloco derivado: '<Agente> · <projeto|local>'.
TESTE: build (tsc+vite) e lint limpos; suíte 375 pass, 0 fail. Cada item em commit próprio (feat/fix).
PENDENTE: grupos (subflow) seguem com o reparenting limitado da Fase 3.1 — usuário deixou para depois.

[2026-06-20] Fase 3.4 — Funções do chat trazidas para o canvas (menu retrátil de ferramentas).
DECISÃO (do usuário): painéis PRÓPRIOS do canvas, falando direto no IPC, sem mexer no ChatWorkspace (zero risco de regressão; aceita leve duplicação visual). Menu retrátil no canto superior esquerdo.
BASE: `components/tools/CanvasToolsMenu` (botão "Ferramentas" que expande a lista) + `CanvasPanel` (painel flutuante reutilizável). `CanvasView` guarda `activeTool` e renderiza o painel ativo. Adicionar painel novo = 1 componente + 1 entrada no menu + 1 linha no switch.
PAINÉIS (todos direto no bridge, sem o chat): Projetos (`projects.*` — listar/adicionar via pickFolder+detectRepos/remover; ao mudar, recarrega a lista do TerminalMenu), Notas (`notes.*` — CRUD inline), Modelos (`models.*` — listar/remover; criação fica no chat), Prompts (`defaultAutomations` + `automations.list` — copia o prompt pro clipboard, já que no canvas não há chat para "aplicar"), Git (`git.getSummary/stageAll/commit` — escolhe projeto, mostra branch/status, stage all, commit).
TESTE: build (tsc+vite) e lint limpos; suíte 375 pass, 0 fail. Um commit por painel.
PENDENTE/PRÓXIMO: Skills, Exportar e Configurações (Felixo/orquestrador) ainda não trazidos (mais acoplados ao chat). Edição/salvamento das notas/projetos é por keystroke (sem debounce). Painéis abrem um de cada vez (activeTool único).

[2026-06-21] Fase 3.5 — Atalho Q e bloco-arquivo .md compartilhado (memória entre agentes).
ATALHO: tecla 'Q' alterna select/pan, mas só com o canvas focado (pane do React Flow ou body) — `isCanvasFocused`. Decisão do usuário: em vez de listar onde NÃO disparar, só disparar no canvas nu (nunca em campo/terminal/painel).
CONTEXTO (ideia do usuário, melhor que persistir scrollback): o estado das conversas vira ARQUIVOS .md no disco. Um bloco-arquivo no canvas = um .md real; o agente (que recebe o caminho absoluto) edita o arquivo enquanto trabalha, o bloco re-renderiza ao vivo, e outros agentes leem/escrevem o mesmo arquivo → memória compartilhada. Persistência sai de graça (estado mora no arquivo, não no terminal efêmero). DECISÃO: arquivos em userData/canvas-files (NÃO no projeto — não pode vazar pro git de quem usa); novo tipo de bloco (coexiste com a nota); file watcher.
BACKEND: `app-paths` ganhou `canvasFiles` (userData/canvas-files, criada no init). `canvas-files-ipc-handlers`: list/read/write/resolve + watch/unwatch (fs.watchFile, push `canvas-file:changed`). `resolveSafePath` confina nomes ao diretório (só basename, força .md, bloqueia traversal/absoluto) — com testes. `resolve()` devolve o caminho absoluto para dar ao agente. dispose() para os watchers no before-quit. Migration 007 amplia o type para 'file'.
FRONTEND: `FileNode` renderiza o .md (MarkdownContent), observa mudanças (re-lê no `canvas-file:changed`), edita (grava de volta), botão "copiar caminho" (para colar no agente: "edite este arquivo"). Botão "Arquivo" na toolbar cria o .md e o bloco; `fileName` persiste no data do nó.
TESTE: build (tsc+vite) e lint limpos; suíte 378 pass, 0 fail (+3 do resolveSafePath).
SOBRE CONEXÕES (pergunta do usuário): ligar blocos hoje é só visual e NÃO persiste (edges não tocam o backend) — adiado de propósito; o usuário priorizou a persistência via arquivos primeiro. Ideias futuras anotadas: encadear saída→contexto, gatilho ao terminar, anexar prompt a terminal.

[2026-06-21] Fase 3.6 — Conexões com significado: arquivo→terminal + edges persistidas.
DECISÃO (usuário): ligar um bloco-arquivo a um terminal deve INFORMAR O CAMINHO ao agente (não colar conteúdo); dispara no momento da ligação (onConnect); e as conexões PERSISTEM.
EDGES PERSISTIDAS: migration 008 cria `canvas_edges` (source/target, soft-delete). `canvas-repository` ganhou listEdges/saveEdge/deleteEdge (+normalizeEdge, com testes). IPC `canvas:list-edges/save-edge/delete-edge` + bridge + tipo `PersistedCanvasEdge`. Frontend: `canvas-storage` ganhou load/save/deleteCanvasEdge; `CanvasView` hidrata edges ao montar, salva no onConnect, remove no onEdgesChange. As linhas voltam ao reabrir.
AÇÃO ARQUIVO→TERMINAL: `TerminalSessionStore.sendText(id, texto)` injeta texto no PTY. No onConnect, `announceFileToTerminal` detecta um par file↔terminal (qualquer direção), resolve o caminho absoluto do .md (`canvasFiles.resolve`) e digita no terminal uma linha-comentário com o caminho ("leia e mantenha suas anotacoes nele"), para o agente reconhecer/editar o arquivo. Combina com o file watcher: o agente edita → o FileNode re-renderiza ao vivo.
TESTE: build (tsc+vite) e lint limpos; suíte 380 pass, 0 fail.
PENDENTE/IDEIAS: a linha é enviada como comentário (inerte no shell; o agente lê). Outros tipos de conexão (terminal→terminal encadeando saída, gatilho ao terminar) seguem em aberto.

[2026-06-22] Fase 3.7 — Prompt do "plano vivo" ao ligar arquivo→terminal (configurável).
VISÃO (usuário): o .md ligado NÃO é um prompt — é um PLANO VIVO compartilhado (estilo plan.md): fases, checklists, testes, metas, modelos, decisões, e sinalização entre agentes (ex.: "Fase 1 em andamento por Claude", "Codex no front-end", "Claude aguardando decisão", "grande demais pro MVP", opções pro usuário). Agentes seguem e registram progresso ali, commitam por fase, e coordenam pelo arquivo.
PROMPT PADRÃO: `services/file-link-prompt.ts` — `DEFAULT_FILE_LINK_PROMPT` (protocolo completo) + `buildFileLinkPrompt(template, path, agent)` com placeholders {{path}}/{{agent}}. Substituiu a linha-comentário fraca anterior. `announceFileToTerminal` passou a usar o template e o nome do agente (comando do terminal).
EDITÁVEL: o texto é salvo em settings (chave `canvas.file-link-prompt`) — IPC `canvas:get/set-file-link-prompt` (settings-repository genérico), bridge `getFileLinkPrompt/setFileLinkPrompt`. O canvas carrega o valor salvo num ref no início; `SettingsPanel` (novo item "Configuracoes" no menu de ferramentas) edita/salva/restaura padrão e atualiza o ref na hora.
TESTE: build (tsc+vite) e lint limpos; suíte 380 pass, 0 fail.

[2026-06-22] Refatoração — Separação chat ↔ canvas com features/shared (branch refactor/separa-chat-canvas).
MOTIVO: o canvas virou o produto principal mas o repo ainda misturava chat e canvas; o canvas importava de `features/chat`. Por ser refatoração estrutural, foi feita em branch (política de git) com validação a cada passo.
RESULTADO: `src/features/` agora tem três irmãs com dependência só num sentido: `canvas` → `shared`, `chat` → `shared`, e `shared` não depende de ninguém. **canvas e chat não se importam mais** (acoplamento zero). O que era compartilhado saiu de `chat/`: `MarkdownContent` → `shared/components`; tipos `AutomationDefinition/AutomationScope` → `shared/types/automations` (re-exportados por `chat/types` para não quebrar o chat); catálogo `defaultAutomations` → `shared/data/automations`.
PADRÃO (modo padrão): `App.tsx` já renderiza o canvas por default e mantém o chat acessível por um toggle — comportamento preservado, agora com a estrutura coerente. Nada do chat foi removido (legado já preservado em `legacy/chat-mascarado`).
TESTE: cada passo com tsc+vite+lint+test verdes; suíte 380 pass, 0 fail. Commits pequenos (refactor:).

[2026-06-22] Fase 3.8 — Exceção de bootstrap: agente em repo + .md vazio escreve o plano.
REGRA (usuário): ao ligar arquivo→terminal, SE o terminal está em um projeto (tem cwd) E o .md está vazio/em branco, o próprio agente deve analisar o repositório e ESCREVER no .md um plano de evolução (fases de melhoria/expansão/escala). Caso contrário (sem projeto, ou .md já preenchido) mantém o prompt normal de plano vivo.
IMPL: `file-link-prompt.ts` ganhou `DEFAULT_FILE_BOOTSTRAP_PROMPT` (analisar repo → escrever plano com visão geral, fases numeradas + checklists/testes, MVP vs grande demais, riscos/decisões, sinalização entre agentes) + `buildBootstrapPrompt`. `announceFileToTerminal` agora lê o conteúdo do .md (`canvasFiles.read`), checa `cwd` do terminal e `.trim()` do conteúdo; escolhe bootstrap vs normal. "Em repo" = terminal aberto com projeto (cwd); "vazio" = sem conteúdo útil (trim). Editável: settings `canvas.file-bootstrap-prompt` (IPC get/set + bridge); `SettingsPanel` refatorado em `PromptField` reutilizável com 2 campos (normal + bootstrap), salvar atualiza o ref na hora.
TESTE: build (tsc+vite) e lint limpos; suíte 380 pass, 0 fail.

[2026-06-22] Padrão de linguagem — Prompts e textos de UI do canvas reescritos com português acentuado/correto, seguindo o padrão de linguagem do projeto. Os prompts (plano vivo + bootstrap) passaram a instruir o agente a seguir o template de contexto (`TEMPLATE-CONTEXTO-IA` / IA.md) ao escrever o `.md`, apontando os guias na pasta `Padrão de qualidade - Felixo System Design/` do repo ou, se ausente, na fonte no GitHub (`Felixo-System-Design`).

[2026-06-22] Lembrete de padrão de qualidade — Terminal aberto COM agente (Claude/Gemini/Codex) recebe, logo após o spawn, uma instrução para sempre seguir o padrão de qualidade (independente do prompt), apontando a pasta de padrões no repo ou a fonte no GitHub. `quality-standard-prompt.ts` define o texto padrão; a store injeta via `initialText` em `ensure()` (~1.2s após spawn; transiente — não persiste nem reenvia ao reabrir). Editável + toggle (default ligado) nas Configurações, persistido em `settings` (`canvas.quality-standard-prompt`/`-enabled`). Shell puro não recebe.

[2026-06-22] Opções de spawn do agente (modelo/esforço/yolo) — Ao criar um terminal-agente, o menu oferece modelo, esforço e yolo por agente, montando as FLAGS REAIS de cada CLI (verificadas via `<cli> --help` na máquina, não chutadas): Claude `--model`/`--effort <low|medium|high|max>`/`--dangerously-skip-permissions`; Codex `--model`/`-c model_reasoning_effort=<low|medium|high|xhigh>`/`--dangerously-bypass-approvals-and-sandbox`; Gemini `--model`/(sem esforço)/`--yolo`. `services/agent-launch-options.ts` cataloga agentes+modelos e `buildAgentArgs` gera os args; os campos se adaptam (Gemini não mostra esforço). Os args ficam no `data` do nó (persistem ao reabrir, já fluem store→IPC→pty-process-manager→node-pty). Modelos são listas extensíveis por agente.

[2026-06-22] Detecção de repositórios ao adicionar pasta — `projects:detect-repos` agora: se a pasta selecionada já é um repo (`.git` próprio), retorna só ela e NÃO desce (evita registrar um repo aninhado — ex.: o repo de padrões vendorizado dentro de outro projeto — como projeto à parte; cobre o aviso do usuário sobre repo-dentro-de-repo). Senão, varre as subpastas diretas (1 nível) e retorna um por repo; o frontend salva cada um. Dedupe por caminho no frontend (ProjectsPanel e addProjectFolder) — readicionar uma pasta-mãe não cria duplicatas; `addProjectFolder` retorna o id existente quando o caminho já está cadastrado. DÍVIDA: `projects-repository.save` ainda dedupa só por id (ON CONFLICT(id)); a dedupe por caminho vive no frontend.

[2026-06-22] Limpeza completa e portabilidade do canvas — A barra do canvas ganhou **Limpar**, **Exportar** e **Importar**. Limpar exige confirmação, cancela saves pendentes, encerra PTYs/watchers e remove fisicamente nós, conexões e `.md` do diretório dedicado. Exportar gera um manifesto `.fxcanvas` versionado (`felixo-canvas`, versão 1) com o estado vivo do React Flow e somente os Markdown registrados; arquivo registrado mas ausente entra vazio para ser recriado. Importar lê até 60 MB, valida formato, versão, limites, IDs, grupos, conexões e nomes confinados antes da confirmação; depois substitui os `.md` e troca o SQLite numa transação, com restauração dos arquivos anteriores se qualquer etapa falhar. Caminhos `cwd` e argumentos de terminal não viajam; apenas `claude`, `codex` e `gemini` são preservados como comandos conhecidos, usando opções padrão. Entradas tentam impedir traversal, arquivos duplicados, comandos arbitrários e pacotes acima dos limites. O renderer remonta o React Flow após importar para restabelecer watchers, e saves pendentes são reagendados se a importação operacional falhar. TESTE: build e lint limpos; suíte 390 pass, incluindo manifesto portátil, segurança, arquivos, transação SQLite e fluxo IPC com rollback.

[2026-06-22] Correções do canvas (scroll/terminal) e animações.
1. SCROLL NO ARQUIVO: bloco-arquivo não rolava com o mouse — o React Flow capturava o wheel para zoom/pan. `FileNode` ganhou a classe `nowheel` (do React Flow) na visualização e no textarea; agora o conteúdo rola normalmente sob o cursor.
2. TERMINAL CORTADO + SELEÇÃO BUGADA: o CSS do xterm (`@xterm/xterm/css/xterm.css`) nunca era importado — sem ele a tela e a camada de seleção ficavam mal posicionadas, cortando a última linha e bugando a seleção de texto. Importado em `main.tsx`. O `TerminalDrawer` ganhou um `ResizeObserver` que re-ajusta (`fit`) o terminal quando a caixa estabiliza (após a animação de abertura), eliminando a linha cortada.
3. ANIMAÇÕES: keyframes em `index.css` (slide do drawer, fade/scale dos painéis e do menu de ferramentas) + hook `useExitAnimation` (toca a saída antes de desmontar). Aplicado em `CanvasPanel` (todas as abas), `TerminalDrawer` e `CanvasToolsMenu`. Respeita `prefers-reduced-motion`.
TESTE: suíte 392 pass. DÍVIDAS (resolvidas na rodada seguinte de 06-23): lint acusava `react-hooks/refs` em `CanvasView.tsx`; e o `tsc -b` (o typecheck real do build) estava quebrado — a verificação tinha usado `tsc --noEmit` no tsconfig raiz (`files: []`), que não checa nada. Lição: validar com `npm run build`/`tsc -b`, não `tsc --noEmit` na raiz.

[2026-06-22] Atividade do terminal — fim do "sempre trabalhando".
BUG (usuário): o card do terminal ficava eternamente "trabalhando" mesmo com o agente parado. CAUSA: CLIs de agente animam um spinner/contador continuamente enquanto aguardam input; cada frame emitia bytes, chamava `markWorking` e reiniciava o timer de idle, que nunca disparava. FIX em `terminal-session-store.ts`: `computeSignature` lê o viewport do xterm normalizando fora glifos de animação (braille, `|/-\`, blocos, cursor) e contadores de tempo (`12s`, `1m04s`); `onOutput` só conta como trabalho real quando a assinatura muda; `scheduleIdleCheck` só marca `idle` após silêncio significativo real (sem mudança de assinatura por `IDLE_AFTER_MS`). Substitui a heurística antiga de "qualquer byte = working" (dívida anotada na Fase 3.2).

[2026-06-23] Reconcepção do .md do canvas — de "plano para MVP" para SCRATCHPAD VIVO.
VISÃO (usuário): a ideia central do projeto é servir de harness onde modelos mais baratos fiquem em loop refinando o trabalho através do arquivo do canvas. O formato "plano para MVP" (fases numeradas, MVP vs grande demais, template de contexto formal) virou complexidade desnecessária e atrapalhava esse loop. O .md deve ser leve o suficiente para um modelo barato manter preciso a cada passada, e o canal de conversa entre agentes deve ser simples.
DECISÃO: o .md vira um SCRATCHPAD de formato livre com seções fixas curtas — Objetivo / Estado atual / Travas / Próximo passo / Sinais entre agentes. "Sinais entre agentes" (linhas datadas: agente — o quê — status) é o canal de coordenação, desacoplado de fases. O bootstrap (repo + .md vazio) deixa de gerar um plano de evolução amplo e passa a escrever um DIAGNÓSTICO concreto e observável do repo, em categorias que o agente encontra lendo o código: 🐛 problemas, 🚧 incompleto, 🔧 funções auxiliares, 📈 melhorias (pequeno e grande porte). Motivo de trocar "MVP" por categorias: "MVP" é amplo/subjetivo demais para um modelo barato; categorias observáveis viram checklist de trabalho real.
IMPL: `file-link-prompt.ts` reescrito (`DEFAULT_FILE_LINK_PROMPT` + `DEFAULT_FILE_BOOTSTRAP_PROMPT`); `quality-standard-prompt.ts`, `CanvasView.tsx` e `SettingsPanel.tsx` tiveram a linguagem "plano vivo" alinhada para "scratchpad" (comentários, help da UI). A lógica de *quando* disparar bootstrap (repo + vazio) não mudou — só o conteúdo dos prompts. As Fases 3.7/3.8 acima descrevem o formato "plano vivo" anterior e ficam como trilha histórica.
SEGUIMENTO: o toggle por bloco abaixo (mesma data) entregou a parte que ficou pendente.
TESTE: suíte 392 pass (typecheck real validado depois, junto do fix de build).

[2026-06-23] Toggle por bloco (scratchpad ↔ plano) + diagnóstico sob demanda.
DECISÃO (usuário): em vez do diagnóstico disparar automático ao ligar arquivo→terminal, ele vira uma AÇÃO EXPLÍCITA por bloco. O bloco-arquivo ganha modo `scratchpad` (padrão) ou `plan`, persistido em `data.mode` (JSON puro, sobrevive ao `stripFunctions`).
IMPL: `FileNodeData.mode` + `DiagnosisRequestStatus` em `types.ts`. `FileNode` mostra um seletor Scratchpad/Plano no header; no modo Plano, botão "Gerar diagnóstico" chama `onGenerateDiagnosis(id)` (injetado pelo CanvasView no memo dos nós-arquivo) e exibe feedback (ok / sem terminal ligado / etc.). `CanvasView`: `announceFileToTerminal` simplificada (sempre injeta o prompt de scratchpad no connect; não decide mais bootstrap); nova `requestRepoDiagnosis(fileNodeId, nodes, edges, store, bootstrap)` acha o terminal conectado ao arquivo e dispara o prompt de diagnóstico, retornando status pra UI. `generateDiagnosis` (useCallback) declarada antes do memo que a usa (ordem importa pro lint `react-hooks`).
FIX JUNTO (dívidas da rodada anterior): (a) `react-hooks/refs` — o quality standard virou estado (`useState`) com ref espelhado só pros callbacks; o memo recomputa quando o padrão carrega/salva (corrige bug latente do initialText preso). (b) build quebrado — nós tipados como `CanvasFlowNode = Node<CanvasNodeData>` em `useCanvasPersistence`, restaurando a checagem de `data` no `tsc -b`.
TESTE: `npm run build` (tsc -b + vite), `npm run lint` e suíte (392 pass) limpos.
PENDENTE/IDEIAS: o modo é só por bloco e não muda o conteúdo já escrito; o diagnóstico assume 1 terminal conectado (pega o primeiro); sem teste unitário próprio do FileNode (depende de DOM/React Flow).

[2026-06-23] Paridade chat→canvas — busca visual e skills; decisões de descarte.
CONTEXTO: revisão de quais funções do antigo modo chat faltavam no canvas. Decisões do usuário sobre cada lacuna:
- DESCARTADO POR DESIGN: exportar conversa (não faz sentido no terminal); QA Logger e painel de Código (observabilidade de backend — esta versão não dá problema o bastante para justificar). Histórico de sessões/Composer/ChatThread são intrínsecos ao chat e já têm substituto no canvas (terminais reais + scratchpads .md).
- ADIADO: Orquestrador (Configurações + Dashboard) — não existe camada de orquestração no modo canvas ainda; fica para quando ela for construída.
- MANTIDO COMO ESTÁ: painel Modelos do canvas (lista/remove). Pergunta em aberto registrada: ele pode ser redundante com as opções de agente/modelo/esforço do menu do terminal — decidir em rodada futura.
- ENTREGUE nesta rodada: busca visual + skills (abaixo).
BUSCA VISUAL: `SearchPanel` (novo item "Pesquisar" no menu de ferramentas) busca BLOCOS por título, nome do arquivo, texto da nota e comando do terminal (sem buscar o conteúdo dos .md em disco — só os campos do `data`). Clicar num resultado chama `focusNode`: `setCenter(x,y,{zoom})` na instância do React Flow capturada no `onInit` (os painéis ficam fora do `<ReactFlow>`, então não têm `useReactFlow`) e seleciona só aquele nó. `FlowPositionMapper` foi ampliado para incluir `setCenter`.
SKILLS: design do usuário — skill = ponteiro nomeado para um arquivo (nome/descrição/caminho), não um prompt embutido. `SkillsPanel` faz CRUD; `buildSkillActivationPrompt` monta a instrução "use a skill em <caminho>, leia e siga". Ativar envia ao terminal expandido (`store.sendText`) ou copia para o clipboard se nenhum estiver aberto. Persistência na tabela `settings` via `canvas:get/set-skills` (chave `canvas.skills`), sanitizada no backend (`sanitizeSkills` descarta entradas sem id/nome/caminho) — sem migration nova, no padrão dos outros ajustes do canvas. Tipo `CanvasSkill` em `types.ts` e espelhado no `vite-env.d.ts`.
TESTE: `npm run build` (tsc -b + vite), `npm run lint` e suíte (393 pass, +1 do round-trip/sanitização de skills) limpos.

## Decisões de Design & Convenções

[2026-04-28] Nomes de variáveis/funções em inglês; comentários e textos de UI em português (acentuado, seguindo o padrão de linguagem).

[2026-04-28] Commits seguem Conventional Commits (`feat`/`fix`/`docs`/`refactor`/`chore`), em commits pequenos e coesos. Branch só para feature grande, refatoração significativa ou alto risco (política de git do padrão de qualidade).

[2026-06-18] Persistência segue o padrão de migrations numeradas (`NNN_nome.sql`) + repository com `list/save/delete` e soft-delete via `archived_at`. IPC segue `register*IpcHandlers`; bridge exposta em `window.felixo.*`.

[2026-06-22] Novos painéis/blocos do canvas falam direto com o IPC (sem acoplar ao chat). O que é compartilhado entre chat e canvas vive em `features/shared`.

## Bugs & Fixes Relevantes

> Bugs e correções estão registrados em ordem no "Histórico de Evolução" acima (StrictMode no terminal, minimap branco, preview com lixo, troca de terminal no drawer, scroll do bloco-arquivo, CSS do xterm ausente cortando/bugando o terminal, terminal "sempre trabalhando", etc.) e na seção "Testes Importantes" (bugs do período do chat/orquestração).

## Integrações & Serviços Externos

[2026-05-07] Felixo-System-Design — clonado/sincronizado como guia obrigatório (sem segredos). Detalhe no "Histórico de Evolução".

[2026-06-22] CLIs de agentes invocadas no terminal: `claude`, `gemini`, `codex` (comandos do `cli-detector.cjs`). Sem tokens no código.

## Notas Gerais

[2026-06-22] Os guias do padrão de qualidade ficam, na maioria das vezes, na pasta `Padrão de qualidade - Felixo System Design/` dentro do repositório (gitignored); se ausente, a fonte é https://github.com/Felipe-Alcantara/Felixo-System-Design

[2026-06-22] O main process do Electron não tem hot-reload: ao alterar arquivos `.cjs`, reinicie o app inteiro (o HMR só atualiza o frontend).

## Resumos de Decisão

[2026-06-21] CONTEXTO: Como persistir as conversas dos terminais entre sessões (o PTY morre ao fechar o app e o scrollback é efêmero).
ALTERNATIVAS: (a) salvar o scrollback do xterm no SQLite; (b) externalizar o estado em arquivos `.md` reais que os agentes editam.
DECISÃO: (b) — o estado vira um arquivo no disco (`userData/canvas-files`), que o bloco renderiza/observa e os agentes editam. Resolve persistência de graça e habilita memória compartilhada entre agentes. Arquivos fora dos projetos para não vazar no git de quem usa.
VALIDAÇÃO: usuário confirmou de ponta a ponta — Claude leu o protocolo, entendeu o arquivo e respondeu corretamente. Suíte 380 pass.

[2026-06-22] CONTEXTO: Separar o modo chat do modo canvas seguindo o padrão de qualidade, com canvas como padrão.
ALTERNATIVAS: (a) canvas + chat + `shared`; (b) chat como legado; (c) só cortar a dependência sem mover pastas.
DECISÃO: (a) — três features irmãs, o compartilhado em `shared`, dependência num sentido só. Feito em branch `refactor/` (política), validando a cada passo.
VALIDAÇÃO: tsc+vite+lint+test verdes em cada passo; canvas deixou de importar de `chat`. Suíte 380 pass.

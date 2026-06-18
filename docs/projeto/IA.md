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

[2026-06-18] Terminal interativo: `node-pty` (PTY real) + `@electron/rebuild` para o pivô de chat mascarado → terminais de verdade. Frontend de terminal (xterm.js) entra na fase seguinte.

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
PRÓXIMO PASSO: ideias para quem contribuir — persistir edges/conexões, nós orquestrados (ler saída estruturada), presets de prompt por nó, ligar projeto a um nó.

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

[2026-06-25] Ligar muitos agentes a um arquivo `.md`: o modelo de conexões (edges) já suportava N ligações — a limitação era só visual (um handle alvo à esquerda, um fonte à direita). `FileNode` e `TerminalNode` passaram a expor handles nos quatro lados (par fonte+alvo sobreposto por lado, cada um aceitando quantas edges quiser), então dá para puxar um fio de qualquer borda para quantos agentes quiser. Além do arrastar, o bloco-arquivo ganhou um rodapé "Agentes ligados" com contagem, lista dos terminais conectados (com botão desligar por item) e um menu "+ Ligar agente" que cria a edge e dispara o aviso de arquivo compartilhado ao terminal — mesmo resultado de arrastar. As edges persistidas continuam só `id/source/target` (handle é puramente visual; edges carregadas do disco caem no handle padrão).

[2026-06-25] FIX (Windows) — Spawnar um agente dava "Cannot create process, error code: 2". Causa: `node-pty` no Windows usa `CreateProcess`, que não honra `PATHEXT` nem busca o PATH como um shell; o comando do agente (`claude`/`codex`/`gemini`) é instalado via npm como shim `.cmd` (ex.: `%AppData%\npm\claude.cmd`), então o `claude` cru não era encontrado. `createPtyLaunchSpec` em `pty-process-manager.cjs` só envolvia o comando no login shell para `darwin`; agora também trata `win32`, lançando via `cmd.exe /d /s /c <comando> <args>` para o shell resolver a extensão e o PATH (espelha o que o macOS já fazia). Linux segue rodando direto. Cobertura: testes de launch spec para win32 e linux; o teste de "comando explícito" passou a derivar o esperado de `createPtyLaunchSpec` para o SO atual, em vez de fixar o nome cru.

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

[2026-08-11] ✅ `terminal-session-store.test.ts` — primeira suíte do store de terminais, que até então era considerado intestável por depender de PTY. A ponte PTY é falsa, mas o terminal é o do próprio store: os testes alimentam o xterm com o stream de bytes capturado de uma CLI de agente real (preâmbulo de escapes, tela de aviso, REPL pronto) e verificam o que o store escreve de volta. É o padrão a seguir para qualquer comportamento do store que dependa do que está desenhado na tela.

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

[2026-08-11] Concluído — Bug “Prompt inicial no codex demora demais pra chegar no terminal”.
IDENTIDADE: Bug: Prompt inicial no codex demora demais pra chegar no terminal.
CAUSA: a entrega do `initialText` aguardava atrasos fixos de 1,2 s no primeiro ciclo e 2,5 s depois de uma tela de aceite, mesmo quando a linha de entrada já podia ser reconhecida. Isso acumulava latência perceptível e duplicava a espera que o detector de tela já controla.
FIX: `terminal-session-store.ts` reduziu os atrasos de início e pós-aceite para 250 ms. A proteção permanece orientada pela tela: o texto só é escrito quando há saída desenhada, a linha de entrada está visível/pronta e as reconferências continuam ativas.
VALIDAÇÃO: testes automatizados da suíte de terminal preservados; validação completa em execução (`npm test`).

[2026-06-23] Paridade chat→canvas — busca visual e skills; decisões de descarte.
CONTEXTO: revisão de quais funções do antigo modo chat faltavam no canvas. Decisões do usuário sobre cada lacuna:
- DESCARTADO POR DESIGN: exportar conversa (não faz sentido no terminal); QA Logger e painel de Código (observabilidade de backend — esta versão não dá problema o bastante para justificar). Histórico de sessões/Composer/ChatThread são intrínsecos ao chat e já têm substituto no canvas (terminais reais + scratchpads .md).
- ADIADO: Orquestrador (Configurações + Dashboard) — não existe camada de orquestração no modo canvas ainda; fica para quando ela for construída.
- MANTIDO COMO ESTÁ: painel Modelos do canvas (lista/remove). Pergunta em aberto registrada: ele pode ser redundante com as opções de agente/modelo/esforço do menu do terminal — decidir em rodada futura.
- ENTREGUE nesta rodada: busca visual + skills (abaixo).
BUSCA VISUAL: `SearchPanel` (novo item "Pesquisar" no menu de ferramentas) busca BLOCOS por título, nome do arquivo, texto da nota e comando do terminal (sem buscar o conteúdo dos .md em disco — só os campos do `data`). Clicar num resultado chama `focusNode`: `setCenter(x,y,{zoom})` na instância do React Flow capturada no `onInit` (os painéis ficam fora do `<ReactFlow>`, então não têm `useReactFlow`) e seleciona só aquele nó. `FlowPositionMapper` foi ampliado para incluir `setCenter`.
SKILLS: design do usuário — skill = ponteiro nomeado para um arquivo (nome/descrição/caminho), não um prompt embutido. `SkillsPanel` faz CRUD; `buildSkillActivationPrompt` monta a instrução "use a skill em <caminho>, leia e siga". Ativar envia ao terminal expandido (`store.sendText`) ou copia para o clipboard se nenhum estiver aberto. Persistência na tabela `settings` via `canvas:get/set-skills` (chave `canvas.skills`), sanitizada no backend (`sanitizeSkills` descarta entradas sem id/nome/caminho) — sem migration nova, no padrão dos outros ajustes do canvas. Tipo `CanvasSkill` em `types.ts` e espelhado no `vite-env.d.ts`.
TESTE: `npm run build` (tsc -b + vite), `npm run lint` e suíte (393 pass, +1 do round-trip/sanitização de skills) limpos.

[2026-07-04] Auditoria das ferramentas do canvas — 4 correções de UX/robustez + notas do canvas no painel.
CONTEXTO: verificação de que as 8 ferramentas do menu (Pesquisar, Projetos, Notas, Modelos, Prompts, Skills, Git, Configurações) funcionam de ponta a ponta. Todas as pontes IPC existiam; os defeitos eram de painel.
CORREÇÕES: (1) menu Ferramentas fecha ao selecionar (antes cobria o painel recém-aberto); (2) NotesPanel salvava a cada tecla via IPC e recarregava a lista inteira — agora edição local com debounce de 500 ms por nota, timers limpos no unmount; (3) GitPanel engolia erros de status/stage/commit — agora exibe a mensagem do backend, tem botão de refresh e dica quando não há projeto; (4) PromptsPanel protege a cópia contra falha do clipboard.
NOTAS DO CANVAS: o painel Notas lia só o banco de notas do chat (`notes:list`) e dizia "Nenhuma nota ainda" com blocos de nota visíveis no quadro. Agora tem duas seções: "Notas no canvas" (nós `type: 'note'`, clicar chama `focusNode`, "Nova nota" cria bloco via `addNode`) e "Notas salvas" (persistidas via IPC). Props `nodes`/`onFocusNode`/`onAddNote` passadas por `CanvasToolPanels`.
DESCOBERTA: a detecção de repos em Projetos varre só um nível abaixo da pasta escolhida (proposital, não desce em repo já detectado); busca recursiva com limite de profundidade ficou proposta, sem decisão.
TESTE: `npm run build`, lint dos arquivos alterados e suíte (396 pass) limpos.

[2026-07-30] Qualidade da função de prompts (cli-prompt.ts + presets de orquestração) — dedup, testes, heurísticas e conteúdo.
CONTEXTO: pedido explícito de revisão em 4 frentes na lógica que monta o prompt enviado às CLIs orquestradas (`app/src/features/chat/services/cli-prompt.ts` + `orchestrator-prompt-presets.json`).
DEDUP: `deepFreeze`/`createOpenEndedOrchestrationRules` estavam implementados duas vezes (uma em `orchestrator-prompt-presets.cjs` via `require`, outra em `orchestrator-prompt-presets.ts` via `import` do mesmo JSON). Extraídos para `electron/services/orchestration/orchestrator-prompt-presets-core.cjs` (CommonJS puro, `createPromptPresetsRuntime(promptPresets)`), consumido por `require()` do lado Electron e por `import` do lado Vite/frontend. Tipos expostos via `.d.cts` irmão (TS 5+ resolve declaração de `.cjs` só por `.d.cts`, não `.d.ts`) — não foi preciso ligar `allowJs` no tsconfig.
TESTES: não existia nenhum framework de teste em `app/src` (zero `.test.ts`, zero vitest/jest). Instalado `vitest` (natural com Vite já presente) via `npm run test:frontend` (`vitest.config.ts`, `include: src/**/*.test.ts`). Cobertura nova: `cli-prompt.test.ts` (createCliPrompt — contexto enxuto vs completo, protocolo de orquestração condicional, instruções de autonomia do Claude, memórias globais, skills, limite de 12 mensagens de histórico com offset de numeração, diff de projetos adicionados/removidos, anexos com preview; mais `shouldUseOrchestrationProtocol`, `shouldUseLeanContextForCurrentPrompt`, `resolveActiveProjectCwd` isolados) e `delegation-policy.test.ts` (`requiresDelegation`).
HEURÍSTICAS: os testes revelaram um bug real de regex em `TRIVIAL_PROMPT_REGEX` (`delegation-policy.ts` e seu espelho `.cjs`): o stem `obrigad` era seguido de `\b`, mas essa fronteira nunca casa dentro de "obrigado"/"obrigada" (a letra seguinte ainda é caractere de palavra) — agradecimentos comuns caíam no ramo de heurística por tamanho/verbo de ação em vez de trivial. Corrigido para `obrigad[oa]s?` nos dois arquivos (mantidos em sincronia, como o comentário do `.ts` já pedia). Também ampliada `SIMPLE_CURRENT_REQUEST_PATTERNS` em `cli-prompt.ts`: só cobria saudações de abertura fixas; confirmações/agradecimentos curtos de fechamento (valeu, obrigado, blz, beleza, sim, entendi etc.) recebiam contexto completo desnecessário.
CONTEÚDO DO JSON: `orchestrator-prompt-presets.json` mantido com a mesma estrutura de chaves (todos os consumidores — `cli-prompt.ts`, `orchestrator-settings-storage.ts`, `orchestration-runner.cjs`, `orchestrator-prompt-presets.test.cjs` — leem chaves específicas, reorganizar quebraria contrato). Só `delegationOnly.rules` foi enxugado: bullets redundantes sobre "exceção por intuição/urgência" e "metaperguntas" mesclados sem perder nenhuma instrução.
TESTE: `npm run build` (tsc -b + vite), `npm test` (electron, 396 pass) e `npx vitest run` (25 pass, novo) limpos após cada commit.
LIMITAÇÃO: dedup cobre só `deepFreeze`/`createOpenEndedOrchestrationRules` (o pedido de duplicação real de lógica). `delegation-policy.ts`/`.cjs` continuam sendo dois arquivos espelhados por design pré-existente (comentário "Keep in sync" no `.ts`) — fora do escopo pedido, mas o fix de regex foi replicado nos dois para não divergir.

[2026-07-30] FIX — dedup de `orchestrator-prompt-presets-core.cjs` quebrava `npm run dev` (tela preta) na entrada acima.
CONTEXTO: ao rodar o app após o merge da entrada anterior, a janela do Electron abriu preta (só a moldura, sem UI). O `vite build` (produção) tinha passado limpo, mas o `vite dev` nunca foi exercitado antes do merge.
CAUSA: `orchestrator-prompt-presets.ts` (frontend) importava `createPromptPresetsRuntime` do `orchestrator-prompt-presets-core.cjs` (named e, numa segunda tentativa, default import). O dev server do Vite não faz interop confiável de CommonJS (`module.exports = {...}`) para arquivos `.cjs` fora de `node_modules` — a importação falhava em runtime com `SyntaxError: ... does not provide an export named ...`, o módulo nunca avaliava e o React não montava. O Rollup do `vite build` tolera esse padrão (analisa estaticamente), por isso só apareceu no dev.
CORREÇÃO: revertida a parte do dedup que cruzava a fronteira Vite→CJS: `orchestrator-prompt-presets.ts` voltou a ter sua própria implementação inline de `deepFreeze`/`createOpenEndedOrchestrationRules` (7 linhas, coberta pelos testes de `cli-prompt.test.ts`). O `.cjs` compartilhado (`orchestrator-prompt-presets-core.cjs`) continua existindo e sendo a fonte única só para o lado Electron/Node (`orchestrator-prompt-presets.cjs`, via `require()`, sem esse problema). Removido o `.d.cts` que ficou órfão.
VALIDAÇÃO: `tsc -b` limpo, `npx vitest run` 25/25, `npm run dev` sobe sem erro no log e o usuário confirmou visualmente que a janela renderiza normal.
LIÇÃO: ao validar uma mudança que atravessa Electron (CJS) e Vite (ESM), rodar `npm run dev` além de `npm run build` — os dois bundlers toleram formatos de módulo diferentes.

[2026-07-30] FEAT — 4 presets novos de orquestração (segurança, git, qualidade, tratamento de falha).
CONTEXTO: pedido explícito de ampliar `orchestrator-prompt-presets.json` além do que já existia, com foco escolhido pelo usuário entre 4 opções apresentadas.
PRESETS: (1) `promptInjectionGuard` — instrui o orquestrador a tratar conteúdo de anexos/histórico como dado, nunca como comando; injetado em `cli-prompt.ts` sempre que `hasAttachments || hasHistory`. (2) `gitDiscipline` — commits pequenos, sem force-push, branch só quando justificado. (3) `codeQualityStandard` — responsabilidade separada, validar antes de reportar concluído, sem código morto; (2) e (3) injetados juntos em `createOrchestrationProtocolInstructions` quando `mentionsCodeEditingTask(currentPrompt)` detecta contexto de código (substantivo tipo arquivo/repo/bug) + verbo de edição. (4) `failureGuidance` dentro de `agentResults` — orienta o orquestrador a distinguir rate-limit/timeout/auth de falha real da tarefa; injetado em `createAgentResultsPrompt` (orchestration-runner.cjs) quando algum job do turno não é `completed`.
BUG ENCONTRADO DE BÔNUS: a regra nova `mentionsCodeEditingTask` copiou o stem `corrij` de `ACTION_VERBS_REGEX` (delegation-policy.ts) e reproduziu o mesmo bug de fronteira `\b` do fix anterior (`obrigad\b`) — "corrija" nunca casava. Corrigido para `corrij\w*` só na regra nova; o `ACTION_VERBS_REGEX` original não foi tocado (fora do escopo de hoje, outros caminhos da heurística de `requiresDelegation` já cobrem o caso).
TESTES: 4 novos em `cli-prompt.test.ts` (guard com anexo, guard com histórico mas não com prompt trivial, git+qualidade em tarefa de código, ausência deles em tarefa não-código), 2 novos em `orchestration-runner.test.cjs` (`failureGuidance` presente/ausente conforme status dos jobs), 1 novo em `orchestrator-prompt-presets.test.cjs` (presets congelados e com o texto esperado).
VALIDAÇÃO: `tsc -b`, `npm run build`, `npm test` (398 pass), `npx vitest run` (29 pass) limpos.
LIMITAÇÃO: o lado Electron (`orchestration-runner.cjs`) não tem hot-reload — o `failureGuidance` só entra em vigor depois que o usuário reiniciar o app manualmente.

[2026-07-30] FEAT — Canvas: criar/editar/excluir prompts customizados no PromptsPanel.
CONTEXTO: o `PromptsPanel.tsx` do Canvas (`src/features/canvas/components/tools/`) só listava e copiava automations; criar/editar/excluir já existia no Chat (`automation-storage.ts` + IPC `automations:save`/`automations:delete`) mas nunca foi ligado ao Canvas.
IMPLEMENTAÇÃO: seguido o padrão já usado pelo `NotesPanel.tsx` do Canvas — edição inline com autosave debounced (500 ms) via IPC direto (`window.felixo.automations.*`), sem importar do `features/chat` (convenção do projeto: painéis do Canvas falam direto com IPC). Botão "Novo prompt" cria automation com `scope: 'chat'` vazia; campos nome/descrição/prompt/scope editáveis inline só para automations customizadas (`isDefault !== true`); lixeira remove via `automations:delete`. Automations padrão (as 3 pré-fabricadas) continuam somente leitura.
VALIDAÇÃO: `tsc -b`, `npm run build`, `eslint` no arquivo, `npm test` e `npx vitest run` limpos. Sem suíte de teste de componente React no projeto (só serviços puros têm cobertura) — verificação funcional ficou para o usuário conferir manualmente no app.

[2026-07-30] FEAT — Numeração dos terminais abertos + painel "Terminais" para navegar entre eles.
CONTEXTO: pedido de um "id" por terminal do canvas que atualiza conforme os terminais abertos, com uma lista para o usuário passear entre eles.
IMPLEMENTAÇÃO: `nodes` no CanvasView.tsx é sempre append-only (`addNode` faz `[...current, node]`, nunca reordena), então a posição de um terminal nesse array já é a ordem de criação. `renderedNodes` (CanvasView.tsx) computa um `Map<id, posição>` sobre os terminais a cada render e injeta `terminalIndex` (1-based) nos dados renderizados do node — igual à convenção já usada por `initialTextReady`: campo de `TerminalNodeData` documentado como render-time only, nunca persistido (a função que persiste nodes trabalha sobre `nodes`, não sobre `renderedNodes`, então nunca vê esse campo). `TerminalNode.tsx` mostra "#N" no cabeçalho, ao lado do ícone. Nova ferramenta "Terminais" (`TerminalsPanel.tsx`) lista todos os terminais nessa mesma ordem/numeração, com indicador de atividade por linha (`useSessionSnapshot` por item, já que hooks não entram em loop) e clique centraliza+seleciona o bloco — mesmo padrão de `onFocusNode` do `SearchPanel`/`NotesPanel`. Como fecha lacunas a cada render, fechar o terminal #2 de 3 renumera o #3 para #2 automaticamente.
COORDENAÇÃO MULTI-AGENTE: outro agente estava editando `TerminalNode.tsx` e `terminal-session-store.ts` em paralelo (feature não relacionada: badge "aguardando aprovação"/`waiting_approval`), sem deixar nota no diretório de coordenação (`canvas-files` vazio no momento). Para não commitar o WIP alheio: `git stash push --keep-index` nos dois arquivos deles, reaplicada minha edição isolada sobre o HEAD limpo, validado build+testes+lint só com a minha parte, commitado, depois `git stash pop` nos dois (merge automático sem conflito — hunks em regiões diferentes do arquivo). Ao restaurar o trabalho deles, `TerminalsPanel.tsx` ficou com type error (`Record<SessionActivity, string>` sem `waiting_approval`, que só existe no lado deles). Corrigido o mapeamento de cor pra esse estado, mas **deixado sem commit de propósito**: commitar agora faria o histórico do `main` referenciar um valor de tipo que só existe no working tree, quebrando bisect até o outro agente commitar a feature dele. Esse ajuste de uma linha entra junto quando eles (ou eu, depois) commitarem `waiting_approval`.
VALIDAÇÃO: `tsc -b`, `eslint` (types.ts, CanvasView.tsx, CanvasToolPanels.tsx, CanvasToolsMenu.tsx, TerminalNode.tsx, TerminalsPanel.tsx), `npm run build`, `npm test` (398 pass) e `npx vitest run` (29 pass) limpos, testado isoladamente do WIP concorrente antes do commit. Sem verificação visual no app — usuário optou por conferir por conta própria.
LIMITAÇÃO: sem suíte de teste de componente React no projeto, a lógica de numeração (inline dentro do `useMemo` de `renderedNodes`) não tem cobertura automatizada — validada só por leitura + tsc + build.

[2026-07-30] FEAT — Lista de terminais vira dock fixo, clique abre pra digitar, setas navegam rápido.
CONTEXTO: usuário pediu 3 ajustes sobre a lista de terminais da entrada anterior: (1) painel fixo no canvas, não algo que se abre/fecha pelo menu; (2) clicar num terminal da lista deve mostrar no canvas E abrir a janela do terminal pra digitar (antes só centralizava); (3) setas cima/baixo trocam rapidamente entre os terminais.
(1) FIXO: `TerminalsPanel` saiu do switch de `CanvasToolPanels`/`CanvasToolsMenu` (removido de `CanvasTool`) e passou a ser renderizado direto pelo `CanvasView.tsx`, sempre montado (`absolute bottom-4 right-4`, canto livre — Controls fica bottom-left, MiniMap top-right). O componente mesmo decide não renderizar nada quando não há terminal.
(2) CLIQUE ABRE PRA DIGITAR: `onSelect` de cada linha agora chama `onFocusNode` (centraliza/seleciona) E `onExpandNode` (abre o `TerminalDrawer`, que já reusa a sessão xterm em background e foca ela automaticamente via `store.focus`).
(3) SETAS: aqui apareceu uma tensão real de arquitetura — `TerminalDrawer` sempre chama `store.focus(sessionId)` no `useEffect` quando o `sessionId` muda, roubando o foco do teclado do dock para o terminal. Se cada seta abrisse o drawer (como o clique faz), a segunda tecla de seta em sequência iria parar no shell (histórico do bash, não troca de terminal) em vez de continuar navegando a lista. Resolvido separando os dois gestos: seta cima/baixo só move o destaque + centraliza no canvas (`onFocusNode`), sem abrir o drawer — mantém o foco no dock, então dá pra "trocar rapidamente" segurando a seta. Enter (ou clique) confirma a linha destacada e aí sim abre o drawer pra digitar.
BUG DE LINT ENCONTRADO: primeira versão clampava o índice ativo (`activeIndex`) dentro de um `useEffect` chamando `setState` — anti-padrão pego pelo `eslint-plugin-react-hooks` (`set-state-in-effect`, cascata de renders desnecessária). Corrigido calculando o índice clampado no próprio corpo do componente (`Math.min(rawActiveIndex, terminals.length - 1)`) em vez de sincronizar via effect.
COORDENAÇÃO MULTI-AGENTE: mesma técnica da entrada anterior (`git stash push --keep-index` nos dois arquivos do outro agente, valida+commita isolado, `git stash pop` devolve o trabalho dele por cima). Dessa vez sem conflito de merge porque não precisei tocar em `TerminalNode.tsx` de novo. O ajuste de uma linha pra cor do estado `waiting_approval` em `TerminalsPanel.tsx` continua sem commit, pelo mesmo motivo já registrado.
VALIDAÇÃO: `tsc -b`, `eslint` (limpo depois do fix do `set-state-in-effect`), `npm run build`, `npm test` (398 pass) e `npx vitest run` (29 pass), testados isolados do WIP concorrente antes do commit. Sem verificação visual no app.

[2026-07-31] FIX — `start_app.py` corrigido para funcionar em macOS/Windows/Linux, com suíte de testes e CI multiplataforma.
CONTEXTO: o repositório foi apresentado ao time e o setup falhava em várias máquinas macOS. Revisão do launcher encontrou 8 defeitos, sendo o principal de macOS e nenhum coberto por CI (o workflow só validava `app/`).
(1) PEP 668 — CAUSA RAIZ DO PROBLEMA NO MAC: `ensure_python_requirements` e o bootstrap do menu rodavam `pip install` no Python do sistema. Com Homebrew no macOS (e o Python de distro no Debian/Ubuntu) o pip recusa com `error: externally-managed-environment` e o setup morria ali. Como o `requirements.txt` passou a listar `questionary`/`rich`, isso quebrava tanto Instalar quanto Iniciar. FIX: `run_pip_install` detecta a mensagem e repete com `--user`; dentro de venv não repete (lá `--user` é inválido) e falhas de outra natureza não disparam retry. Mensagens de erro passaram a dizer o que fazer (criar venv), em vez de só propagar o código de saída.
(2) INCOMPATIBILIDADE COM PYTHON 3.9 — descoberta ao montar a matriz de CI: `NodeBinAdder = Callable[[Path | str | None], None]` é atribuição de módulo, avaliada na hora do import; `from __future__ import annotations` adia anotações, não isso. Em Python 3.9 (o `python3` de sistema no macOS 12/13, justamente as máquinas afetadas) o import falhava com `TypeError` antes do menu conseguir explicar qualquer coisa. FIX: união entre aspas. Teste de regressão faz auditoria de AST procurando `|` avaliado em tempo de import.
(3) LIMPEZA DE PROCESSOS MATAVA PROGRAMA ALHEIO: `cleanup_app_processes` fazia `pgrep -f <app/node_modules>` e matava tudo que casasse. `pgrep -f` casa a linha de comando inteira, então pegava editor, shell e até o próprio `grep` com aquele caminho aberto — e rodava antes de subir o app, podendo derrubar a sessão de outra pessoa no mesmo checkout. Confirmado na máquina de dev: o processo do Copilot no VS Code casava o filtro antigo. FIX: só encerra processo cuja linha de comando nomeia um binário que o launcher realmente inicia (vite/electron/concurrently/wait-on), nunca a própria árvore de processos.
(4) MENU FALHAVA EM SILÊNCIO: quando o bootstrap do TUI falhava, `main()` caía em `run_direct(parse_args())` e subia o Electron direto — escondendo o erro de setup de quem estava justamente tentando resolvê-lo. FIX: falha com mensagem clara e código 1, como exige o GUIA-START-APP-SCRIPT.
(5) `os.killpg` sem tratamento no Ctrl+C: se o grupo sumisse entre o `poll()` e o kill, saía stack trace cru. FIX: `signal_process_group` cai para o processo isolado e engole erro de processo já colhido.
(6) `_menu_status` montava `str(None)` quando o binário do Node sumia entre a descoberta e a sondagem. FIX: `describe_installed_node` retorna `None` e o Status mostra estado real (incluindo a versão mínima exigida).
(7) CTRL+C TRAVAVA ~16s E MENTIA — encontrado rodando o app de verdade, não por leitura: `stop_process` também roda de dentro do handler de SIGTERM, que interrompe a thread principal já bloqueada em `Popen.wait()`. Nesse estado o objeto `Popen` não serve para colher o filho: tanto `wait(timeout=...)` quanto `poll()` travam no lock que o wait externo segura e nunca reportam a saída. Resultado: os dois timeouts de 8s estouravam sempre, o launcher mandava um SIGKILL desnecessário e imprimia "The app process did not exit" com o processo já morto. FIX: `process_has_exited` usa `os.waitpid(..., WNOHANG)`, que lê o status direto do SO sem passar pelo lock. Medido: Ctrl+C saiu de ~16s para 0.3s (rc 130), sem a mensagem falsa e sem processo órfão. Primeira tentativa de correção usou `poll()` e não resolveu — o diagnóstico só fechou depois de reproduzir o cenário isolado.
(8) SEM CI PARA O LAUNCHER: nenhum dos defeitos acima era pego automaticamente. FIX: job `launcher` no `ci.yml` roda os testes em Linux/Windows/macOS × Python 3.9 e 3.13, sem depender de Node.
VALIDAÇÃO: 55 testes (`python3 -m unittest discover -s tests`) passando, contra 7 antes. Cada correção foi verificada por teste de mutação — revertendo o fix no código, o teste correspondente falha (confirmado para PEP 668, filtro do pgrep, fallback do `main()`, fallback do killpg e a união do 3.9). Fluxo PEP 668 validado fim-a-fim com um interpretador falso que reproduz a recusa do Homebrew: recupera via `--user`. App subiu de verdade (`--skip-install --web`, Vite ok) e a limpeza não deixou processo órfão.
LIMITAÇÃO: não há máquina macOS/Windows nem Python 3.9 neste ambiente — a cobertura nesses alvos vem do CI, não de execução local. A compatibilidade com 3.9 foi verificada por auditoria de AST e emulação da semântica, não por interpretador real.

[2026-07-31] REFACTOR — `start_app.py` modularizado em `felixo_launcher/`, testes divididos por módulo.
CONTEXTO: continuação direta da entrada anterior. Ao revisar a entrega contra o checklist do padrão de qualidade, o item 2 ("arquivos faz-tudo devem ser tratados como sinal de refatoração") apontou um problema que a correção de macOS tinha agravado: o `start_app.py` estava com 1609 linhas e 73 funções cobrindo 9 responsabilidades distintas, e as correções somaram ~355 linhas a ele. Usuário optou por modularizar agora, direto no `main`.
ESTRUTURA: `start_app.py` continua na raiz — o `GUIA-START-APP-SCRIPT.md` exige isso — mas virou entrypoint fino (26 linhas) que só chama o pacote. `felixo_launcher/` ficou com um módulo por responsabilidade: `paths` (caminhos), `config` (arquivo local de configuração), `node` (descoberta de Node/npm), `commands` (resolver/executar comandos filhos), `process` (parar app e limpar processos), `node_deps` (npm install), `python_deps` (pip + bootstrap do menu), `git` (atualizar checkout), `runner` (preparo de ambiente e caminho por flags), `menu` (menu interativo), `cli` (entrypoint). Dois nomes mudaram de casa por pertencerem melhor a outro módulo: `CONFIG_FIELDS` saiu de `paths` para `config`, e `ensure_tui_dependencies` saiu de `menu` para `python_deps`.
TESTES TAMBÉM DIVIDIDOS: manter um `test_start_app.py` único importando tudo de um entrypoint fino recriaria o mesmo arquivo faz-tudo do outro lado. Virou um arquivo de teste por módulo (`test_node`, `test_process`, `test_python_deps`, `test_tui_bootstrap`, `test_status`, `test_windows`, `test_requirements`, `test_python_compat`) + `tests/support.py` com os helpers compartilhados.
ARMADILHA DE `mock.patch` QUE APARECEU AQUI: com módulo único, `patch("start_app.X")` sempre funcionava. Depois de separar, um módulo que faz `from .outro import X` guarda a própria referência a `X` — então patchar no módulo que *define* não afeta quem *importou*. Dois testes passaram a rodar código real sem avisar: o do menu chegou a abrir o menu interativo de verdade e travou a suíte, e o de Status executou o `/bin/node` real (v18.19.1) em vez do mock. Corrigido patchando onde o nome é procurado (`felixo_launcher.cli.ensure_tui_dependencies`, `felixo_launcher.menu.probe_command`), não onde é definido.
`test_python_compat` PASSOU A DESCOBRIR OS ARQUIVOS: antes tinha uma lista fixa (`LAUNCHER_FILES`) que já nascia desatualizada depois da divisão. Agora varre `felixo_launcher/*.py` e `tests/*.py`, com um teste extra que falha se a varredura não encontrar nada — sem isso, um glob vazio faria as outras verificações passarem por vacuidade.
COMANDO DE TESTE MUDOU: `python3 -m unittest discover -s tests -t .` (o `-t .` é necessário para os imports relativos do pacote de testes). CI e README atualizados no mesmo passo; confirmado que o comando antigo falha, para a mudança não ser por suposição.
VALIDAÇÃO: 56 testes passando (era 55; o novo é a guarda da varredura). Comportamento preservado provado por mutação — os 5 defeitos da entrada anterior foram reintroduzidos um a um no código já modularizado e cada um derrubou a suíte (filtro do pgrep, retry PEP 668, fallback do `main()`, colheita via `waitpid`, união do 3.9). App real: menu desenha com as 6 opções, `--web` sobe o Vite, Ctrl+C sai em 0.3s (rc 130) sem mensagem falsa e sem órfão. Auditoria de AST em todos os módulos: nenhum nome indefinido, nenhum import não usado — pegou dois `import` faltando (`json`, `re` em `node.py`) que o parse sozinho não acusaria.

[2026-07-31] FIX — Correções encontradas rodando o app de verdade (o que os testes não pegaram).
CONTEXTO: usuário rodou `python3 start_app.py` na máquina dele (Ubuntu, `/usr/bin/python3`) e a entrega anterior falhou na tela: parede de erro do PEP 668 no Instalar/Setup, e o Iniciar bloqueado com "Falha instalando dependências Python". Correção anterior estava validada só com pip simulado — o simulador aceitava `--user`, o pip real do Debian não. Lição: teste com dublê que eu mesmo escrevi confirma a minha suposição, não a realidade.
(1) `--user` TAMBÉM É BLOQUEADO NO DEBIAN/UBUNTU: o retry que eu tinha adicionado não resolvia nada aqui. Verificado rodando `pip install --user rich` no python do sistema: mesma recusa. FIX: cadeia de fallback — install simples → `--user` → `--break-system-packages` (o override que o próprio PEP 668 define). Homebrew costuma aceitar o `--user`; Debian precisa do terceiro passo.
(2) INSTALAVA O QUE JÁ ESTAVA INSTALADO: `ensure_python_requirements` chamava pip incondicionalmente. Como Ubuntu já traz `questionary`/`rich`, a parede de erro aparecia para instalar pacotes que já estavam lá. FIX: checa `tui_dependencies_importable()` antes e sai com 0 — na máquina do usuário isso sozinho já elimina toda a saída de erro.
(3) DEPENDÊNCIA DO MENU BLOQUEAVA O APP: `_menu_start` e `run_direct` abortavam quando o pip falhava. Mas esses pacotes só desenham o menu — o app é Node e não precisa deles; pior, o menu já estava na tela quando a mensagem aparecia. FIX: avisa em amarelo e segue. `_menu_install` também deixou de chamar tudo de "falhou" quando só a parte Python falhou e o Node ficou pronto.
(4) DETECTOR DE IMPORTS CAPTURAVA COMENTÁRIO: apareceu na tela como `Missing npm dependencies detected: finished a turn, ready for more`. O `[\s\S]*?` da regex atravessava linhas e casava a palavra `import` de um trecho com uma string qualquer muito depois — no caso, prosa dentro de um comentário em `terminal-session-store.ts`. FIX: regex ancorada em início de statement e sem cruzar aspas/;. Validada em 9 casos (incluindo import multilinha e string que contém a palavra import) e contra a base inteira: 23 specifiers reais, zero lixo.
(5) CTRL+C DEMORAVA DEMAIS NO DESKTOP: encontrado rodando o app Electron de verdade, não por leitura. O caminho desktop (npm → concurrently → electron) tem processo que ignora SIGTERM; com os dois timeouts de 8s, o encerramento levava 8s+ mesmo depois do processo morrer. FIX: `GRACEFUL_STOP_TIMEOUT=5s` e `FORCED_STOP_TIMEOUT=2s` — SIGKILL não é capturável, então esperar 8s depois dele era puro desperdício. Medido com árvore que ignora SIGTERM: 8.12s → 5.10s; no caso normal (o que de fato acontece), 0.09s.
(6) FALSO POSITIVO NO GUARD DE 3.9: o teste que criei na entrega anterior acusava `re.MULTILINE | re.VERBOSE` como união PEP 604. É OR de flags, válido em qualquer versão. FIX: o teste passou a distinguir união de *tipos* (operando que nomeia tipo ou `None`) de OR de valores; confirmado que continua pegando a união real por mutação.
VALIDAÇÃO: 61 testes passando (era 56). App desktop rodado de verdade com screenshot da tela: canvas carregado, toolbar completa, terminal ativo e dock de Elementos — o launcher entregou o app funcionando. Menu real dirigido por stdin mostra "Dependências prontas" sem parede de erro, e o Iniciar sobe o Vite em vez de bloquear.
LIMITAÇÃO: as correções (1) e (2) foram verificadas no Debian/Ubuntu real desta máquina; no macOS continuam sem execução real — a cobertura lá segue sendo o CI.

[2026-07-31] FEAT — Atualização automática e silenciosa a cada início do app.
CONTEXTO: usuário pediu que o launcher faça fetch/pull sozinho antes de abrir, para o time não precisar ficar rodando `git pull` só para descobrir se saiu versão nova.
DECISÃO CENTRAL — ATUALIZA A BRANCH ATUAL, NÃO A DE PRODUÇÃO: o `update_source_from_branch` que já existia (menu "Atualizar" e `--update`) puxa de `origin/production`. Usar ele no início seria perigoso: o usuário estava em `main`, e um pull silencioso de `production` arrastaria o checkout para outro lugar sem pedir. O novo `auto_update` só faz fast-forward da branch em que a pessoa **já está**.
SEGUNDA DECISÃO — NUNCA BLOQUEIA O APP: como isso roda em todo início, uma conveniência de fundo não pode ser o motivo de o app não abrir. `auto_update` retorna bool (atualizou ou não) em vez de código de erro, e toda condição adversa simplesmente pula: sem git, fora de checkout, sem rede, tree sujo, histórico divergido, detached HEAD. Isso contrasta de propósito com o `update_source_from_branch`, que é explícito e trata falha como falha — os dois convivem com contratos diferentes e o docstring do módulo registra o porquê.
TREE SUJO É O CASO IMPORTANTE: `merge --ff-only` recusaria de qualquer jeito, mas o risco real era deixar alguém no meio de um conflito num lançamento em que ela só queria abrir o app. Trabalho não commitado sempre ganha da atualização.
TIMEOUT: `fetch` sem rede fica pendurado. Comecei com 10s e medi — 10.1s de espera olhando terminal vazio, ruim demais para toda inicialização. Baixado para 4s, que é o custo total do recurso quando não há rede; com rede e já atualizado, 0.087s (contagem de commits via `rev-list --count` antes de qualquer coisa cara).
DESLIGÁVEL: `FELIXO_AUTO_UPDATE=off` ou `--no-auto-update`. Necessário para CI, que precisa compilar o commit que baixou — verificado que o job atual só roda `--help`, que sai antes de qualquer update.
ORDEM IMPORTA: o auto-update roda **antes** do `ensure_dependencies`, com `force_install` quando puxou commits novos, para que um `package.json` atualizado tenha as dependências instaladas no mesmo início.
VALIDAÇÃO: 78 testes (era 61), sendo 17 novos em `tests/test_git.py` — incluindo 3 de integração que criam repositórios git de verdade e provam o fluxo real: puxa commit novo (v1→v2), preserva arquivo com alteração local não commitada, e não imprime nada quando já está em dia. Demonstração fim-a-fim num clone real: detectou "VERSAO 1" → atualizou → "VERSAO 2 - NOVA". Offline medido em 4.1s (cortado pelo timeout, app abre em seguida).

## Decisões de Design & Convenções

[2026-04-28] Nomes de variáveis/funções em inglês; comentários e textos de UI em português (acentuado, seguindo o padrão de linguagem).

[2026-04-28] Commits seguem Conventional Commits (`feat`/`fix`/`docs`/`refactor`/`chore`), em commits pequenos e coesos. Branch só para feature grande, refatoração significativa ou alto risco (política de git do padrão de qualidade).

[2026-06-18] Persistência segue o padrão de migrations numeradas (`NNN_nome.sql`) + repository com `list/save/delete` e soft-delete via `archived_at`. IPC segue `register*IpcHandlers`; bridge exposta em `window.felixo.*`.

[2026-06-22] Novos painéis/blocos do canvas falam direto com o IPC (sem acoplar ao chat). O que é compartilhado entre chat e canvas vive em `features/shared`.

## Bugs & Fixes Relevantes

> Bugs e correções estão registrados em ordem no "Histórico de Evolução" acima (StrictMode no terminal, minimap branco, preview com lixo, troca de terminal no drawer, scroll do bloco-arquivo, CSS do xterm ausente cortando/bugando o terminal, terminal "sempre trabalhando", etc.) e na seção "Testes Importantes" (bugs do período do chat/orquestração).

[2026-07-04] BUG: `start_app.py` apareceu deletado na working tree (mudança não commitada, causa desconhecida), quebrando os testes Python (`ImportError`) e as instruções do README.
FIX: restaurado do último commit via git; `pytest tests/` voltou a passar (7 pass). Auditoria de conformidade do mesmo dia também limpou o `.gitignore` (linhas duplicadas e com encoding corrompido da pasta do padrão de qualidade) e validou `npm run build` + `npm run lint` verdes em `app/`.

[2026-07-04] REFATORAÇÃO (branch `refactor/quality-split-god-files`) — os três maiores arquivos "faz-tudo" foram divididos seguindo o padrão de qualidade:
- `electron/services/ipc-handlers.cjs` (2298→1284): ciclo de vida de sessões CLI persistentes extraído para `persistent-cli-session.cjs` (factory com estado encapsulado e deps injetadas) e helpers puros para `cli-event-utils.cjs`. Exports públicos preservados.
- `src/features/canvas/components/CanvasView.tsx` (1388→908): geometria em `services/node-geometry.ts`, ligações arquivo↔terminal em `services/file-terminal-links.ts`, projetos em `hooks/useCanvasProjects.ts`, UI em `CanvasToolbar.tsx` e `CanvasToolPanels.tsx`.
- `src/features/chat/components/ChatWorkspace.tsx` (2354→1774): composição de prompt em `services/cli-prompt.ts` e formatação de status/disponibilidade em `services/stream-status.ts`. A lógica de streaming com refs permanece no componente de propósito (alto acoplamento; extração futura exigiria testes de frontend primeiro).
VALIDAÇÃO: `npm run build`, `npm run lint` e `npm test` (396 pass) verdes após cada um dos três passos.

[2026-07-04] PERFORMANCE/UX DO CANVAS (alvo: notebooks modestos — 2 cores/4 threads, iGPU):
- Cache de identidade dos objetos `data` injetados em `renderedNodes` (CanvasView): arrastar um bloco não invalida mais o `React.memo` dos demais. Callbacks injetados (link/unlink/diagnóstico) agora leem nodes/edges via refs para manterem identidade estável.
- `onlyRenderVisibleElements` no ReactFlow: blocos fora da viewport não são renderizados.
- Conforto: `nowheel`/`nopan` nas áreas de conteúdo de NoteNode, TerminalNode e FileNode (roda do mouse rola o conteúdo em vez de dar zoom; no modo pan, arrastar dentro da janela não move mais a tela) e botão "Ver tudo" (fitView) na toolbar.
VALIDAÇÃO: build + lint + npm test (396 pass); interação de drag/scroll/pan requer verificação manual (sem testes de frontend).

[2026-07-04] FEAT — Nomes em todos os blocos do canvas + identidade do agente: NoteNode ganhou label editável (terminal/arquivo/grupo já tinham); todos os fluxos de criação oferecem nome opcional (popover nos botões Nota/Arquivo/Grupo via `NamedCreateButton`, campo "Nome" no TerminalMenu); em terminais com agente, o initialText inclui `buildAgentIdentityPrompt` (nome do bloco, cwd/projeto e aviso de ambiente multi-agente — assinar contribuições e coordenar pelos .md compartilhados). Nome de arquivo .md usa slug do nome + timestamp para unicidade. VALIDAÇÃO: build + lint + 396 pass.

[2026-07-04] FIX — "Ver tudo" não enquadrava canvases espalhados: o `minZoom` padrão do React Flow (0.5) limitava o zoom-out do `fitView` (e do zoom manual). Ajustado `minZoom={0.05}` no ReactFlow. Validação: build + lint + 396 pass; enquadramento confirmado manualmente pelo usuário pendente.

## Integrações & Serviços Externos

[2026-05-07] Felixo-System-Design — clonado/sincronizado como guia obrigatório (sem segredos). Detalhe no "Histórico de Evolução".

[2026-06-22] CLIs de agentes invocadas no terminal: `claude`, `gemini`, `codex` (comandos do `cli-detector.cjs`). Sem tokens no código.

[2026-06-25] Catálogo MCP — registrado o contrato do servidor externo de Notion com
`notion.list_tasks`, `notion.create_task`, `notion.move_status`,
`notion.conclude_task` e `notion.update_project_page`. As quatro operações de escrita
exigem `requiresConfirmation: true`; a conexão de servidores MCP externos continua no
roadmap do cliente.

## Notas Gerais

[2026-06-22] Os guias do padrão de qualidade ficam, na maioria das vezes, na pasta `Padrão de qualidade - Felixo System Design/` dentro do repositório (gitignored); se ausente, a fonte é https://github.com/Felipe-Alcantara/Felixo-System-Design

[2026-06-22] O main process do Electron não tem hot-reload: ao alterar arquivos `.cjs`, reinicie o app inteiro (o HMR só atualiza o frontend).

## Registro de Trabalho — 2026-07-30

Identidade: Sobre a funcao de “Terminais” do “https://github.com/Felipe-Alcantara/Felixo-AI-Core”: Apertar pra cima e pra baixo fora do terminal selecionado nao muda de terminal, a janela esta muito pequena (Cortando os textos) e o terminal a direita nao muda so de mudar o terminal na lista (tem que apertar entender ao inves de ser automatico).

FIX concluído: `TerminalsPanel` agora trata setas globalmente fora de campos editáveis e do terminal, troca e abre automaticamente o drawer e devolve o foco ao dock para navegação contínua. O dock foi ampliado para `w-72`; `TerminalDrawer` inicia responsivamente até 720px, com mínimo de 440px e limite de 75vw. Lint e build passaram sem erros. Estado final: concluído, aguardando somente conferência visual.

## Registro de Trabalho — 2026-07-31

Origem: tarefa Notion "Melhorar a interface do https://github.com/Felipe-Alcantara/Felixo-AI-Core" — pedido do usuário com 4 pontos de UI.

FEITO (concluído):
1. Botão flutuante de Chat (`App.tsx`) sobrepunha o dock de terminais — ambos usavam `bottom-4 right-4`. Movido para `right-4 top-4` (canto vazio nas duas telas), junto da área das funções auxiliares em vez de por cima do canvas de terminais.
2. `CanvasToolbar` (funções auxiliares do canto superior esquerdo) ganhou botão retrátil (chevron): recolhe para um único botão, expande de volta à barra completa.
3. `TerminalsPanel` (dock inferior direito) deixou de listar só `type==='terminal'` — agora lista todos os tipos de bloco do canvas (terminal, nota, arquivo, grupo) com ícone por tipo, renomeado de "Terminais" para "Elementos". Nome deixou de ser cortado com `truncate`/ellipsis — agora quebra em várias linhas (`whitespace-normal break-words`) e mantém `title` com o nome completo.
4. Navegação por teclado trocada de `ArrowUp/ArrowDown` puro para `Shift+ArrowUp/ArrowDown`, funcionando globalmente independente de qual janela/elemento está focado. Navegar já foca E expande automaticamente o elemento (para terminais abre o drawer; outros tipos já mostram conteúdo inline no card do canvas). [Ver bug encontrado nesta mesma navegação logo abaixo, corrigido no mesmo dia.]
FIX colateral: corrigido erro de lint pré-existente em `TerminalsPanel.tsx` (`react-hooks/refs` — ref era escrito durante o render; movido para dentro de `useEffect`).
VALIDAÇÃO: `npm run build`, `npm run lint` sem erros; `npm test` com a mesma falha pré-existente e não relacionada (`terminal-launcher.test.cjs`, teste específico de Linux/konsole rodando no Windows). Sem verificação visual manual nesta sessão.

PENDENTE (não iniciado nesta sessão — ficam para uma próxima passada):
- Item 4 do pedido original: um elemento novo no canvas para abrir o diretório de qualquer pasta e rodar arquivos no terminal, com opção "abrir projetos" à esquerda — hoje só existe o picker de pasta dentro do `TerminalMenu` (`onAddFolder`) associado à criação de terminal; não existe um bloco/elemento dedicado a isso.
- Restaurar `/resume` automático: quando um terminal já estava aberto ao fechar o app anteriormente (indicando trabalho não finalizado), preencher `/resume` no lugar do prompt padrão ao reabrir. Não há hoje persistência desse estado "sessão anterior não finalizada" nem lógica de prefill condicional — só existe `resume` no fluxo de CLI do chat (`ChatWorkspace.tsx`), sem relação com nós de terminal do canvas.
Estado final desta sessão: concluído para os itens 1–4 de UI listados acima; bloqueado por falta de escopo/tempo para os dois itens pendentes, que exigem desenho de um novo tipo de bloco e de persistência de estado de sessão — recomendo tratar como tarefa própria.

BUG relatado pelo usuário logo em seguida: "a função das setinhas tá bugada" (Shift+Seta do item 4 acima).
CAUSA 1 (dupla execução): o handler global (`window.addEventListener('keydown')`) não tinha guarda para eventos originados dentro do próprio dock; como o keydown do `<ul>` não chama `stopPropagation`, ele borbulha até `window` e ambos os handlers rodavam para o mesmo Shift+Seta quando o dock já estava com foco.
CAUSA 2 (mais grave — roubo de foco): `moveActive` sempre reforçava `listRef.current?.focus()` via `requestAnimationFrame`, incondicionalmente. Ao navegar a partir de fora do dock (ex.: Shift+Seta com um terminal focado, que é exatamente o caso de uso pedido — "independente da janela selecionada"), o foco do teclado era puxado de volta para o `<ul>` invisível do dock logo depois de abrir/expandir o novo elemento, atropelando o auto-foco do terminal recém-aberto (ou de qualquer campo que devesse receber o foco) — teclas seguintes iam parar no dock em vez de no elemento selecionado.
FIX: extraída a lógica pura para `terminals-panel-navigation.ts` (`nextActiveIndex`, `shouldHandleGlobalShiftArrow`) — o listener global agora ignora eventos que já vieram de dentro do dock (`[data-terminals-dock]`) e de campos de edição de texto (`input`/`textarea`/`contenteditable`), mas propositalmente NÃO ignora `.xterm` (navegar para fora de um terminal focado é o objetivo do atalho). `moveActive(delta, refocusList)` só força o foco de volta ao dock quando `refocusList=true`, usado apenas pelo `onKeyDown` do próprio `<ul>` (navegação contínua dentro do dock); o listener global sempre chama com `refocusList=false`.
TESTE: sem harness de teste de componente React no repo (só `vitest` com `environment: 'node'` para lógica pura); criado `terminals-panel-navigation.test.ts` cobrindo o wraparound do índice e as quatro combinações do guard (dock, campo de texto, `.xterm`, alvo nulo) — 8 testes, todos verdes.
VALIDAÇÃO: `npm run lint`, `npm run build` e `npx vitest run` (37 pass) sem erros. `npm test` (backend) com a mesma falha pré-existente e não relacionada de antes. Sem verificação visual manual no app rodando — recomendo ao usuário confirmar Shift+Seta a partir de dentro de um terminal focado.
Estado final: concluído — MAS o usuário reportou na sequência que o atalho continuava sem funcionar (ver entrada seguinte). A causa raiz real só apareceu ao rodar o app de verdade; os 8 testes unitários acima davam falsa confiança porque o mock do alvo `.xterm` não replicava o DOM real do xterm.js.

BUG reaberto pelo usuário: "o atalho da setinha ainda não funciona" — mesmo após o fix anterior.
MÉTODO: dessa vez, em vez de só ler o código, o app foi de fato executado e dirigido via Playwright `_electron` (driver descartável em `$CLAUDE_JOB_DIR/tmp`, `playwright-core` instalado só no scratch dir com `--no-save`, `--user-data-dir` isolado para não tocar no userData real do usuário — nenhum agente de IA foi spawnado, só terminais de shell puro). Instrumentado `window.addEventListener('keydown', probe, true/false)` para observar em qual fase o evento chega e se `defaultPrevented` já estava true.
CAUSA RAIZ: o alvo de foco real do xterm.js é `<textarea class="xterm-helper-textarea">` — ou seja, é um `<textarea>` de verdade. O guard `shouldHandleGlobalShiftArrow` (do fix anterior) checava a exclusão de campo de texto (`input, textarea, [contenteditable="true"]`) e retornava `false` para ele, tratando "dentro de um terminal focado" exatamente como "dentro de uma nota/composer" — desabilitando o atalho justamente no caso de uso pedido pelo usuário ("independente da janela selecionada"). Confirmado ao vivo: com o textarea do xterm genuinamente focado, `defaultPrevented` chegava `false` no probe (nosso handler nem rodava a navegação); depois do fix, `true`.
CAUSA RAIZ SECUNDÁRIA (também descoberta rodando o app): mesmo que o guard deixasse passar, `event.preventDefault()` sozinho não bastava — o `_keyDown` interno do xterm.js (registrado com capture no próprio textarea, ver `node_modules/@xterm/xterm/lib/xterm.js`) roda seu próprio `cancel(e, true)` que chama `stopPropagation()` incondicionalmente para teclas de seta, e ainda envia a sequência de escape pro shell (ex.: navegar histórico de comando) a menos que a propagação seja interrompida ANTES do evento alcançar o textarea.
FIX: em `terminals-panel-navigation.ts`, `shouldHandleGlobalShiftArrow` agora checa `.closest('.xterm')` e retorna `true` ANTES de checar a exclusão genérica de campo de texto — deixando o terminal navegar mesmo sendo tecnicamente um `<textarea>`. Em `TerminalsPanel.tsx`, o listener global passou de bubble (`window.addEventListener('keydown', fn)`) para capture (`fn, true`) — necessário porque um listener em bubble no `window` nunca vê o evento depois que o handler do xterm (registrado no próprio textarea) já deu `stopPropagation`; capture no `window` roda antes do evento alcançar o textarea, então sempre vê primeiro. Também passou a chamar `event.stopPropagation()` (além de `preventDefault()`) para impedir que o xterm processe a tecla depois (evitando o duplo efeito: navegar E mandar a seta pro shell).
TESTE: reescrito `terminals-panel-navigation.test.ts` — o teste antigo de ".xterm permitido" usava um mock que não marcava `.xterm` como correspondido (então testava sem querer o fallback `return true` genérico, não o caminho real). Novo teste replica o DOM real: um alvo cujo `closest` corresponde tanto a `.xterm` quanto a `input, textarea, [contenteditable="true"]` — a combinação exata do textarea do xterm — e confirma que o resultado é `true`; mais um teste garantindo que um textarea comum (fora de `.xterm`) continua excluído. 10 testes, todos verdes.
VALIDAÇÃO: `npm run lint`, `npm run build`, `npx vitest run` (39 pass) sem erros. Confirmado ao vivo no Electron real (não só unitário): abrir um terminal shell puro, focar seu textarea de verdade, apertar Shift+Seta duas vezes seguidas (down então up) — o dock avança e depois volta corretamente (wraparound incluso), com o textarea do terminal permanecendo com foco real (`defaultPrevented=true` nos dois casos). Perfis de userData de teste e o driver Playwright descartável foram removidos ao final; nada foi commitado sobre isso.
Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — Resolução do conflito de integração

RESPONSÁVEL: Revisar codigo.

PEDIDO: corrigir o conflito surgido ao integrar os commits remotos de animação do canvas com a correção de posicionamento responsivo e o fluxo de passagem de responsabilidade.

FEITO:
- Resolvidos os conflitos em `NotificationsPanel`, `TerminalMenu`, `toolbar-flyout` e `CanvasToolsMenu`.
- Mantido o posicionamento medido por viewport/zoom e o limite de altura dos flyouts, junto com as animações desaceleradas e as listas em cascata recebidas dos commits remotos.
- Removidos todos os marcadores de conflito e mantida a integração dos testes e do handoff.

TESTE: lint, `npm run build`, `npx vitest run` (180 testes), `npm test` (421 testes) e `git diff --check` concluídos sem erros.

RISCO RESIDUAL: permanece apenas o aviso preexistente de chunk Vite acima de 500 kB e a necessidade de conferência visual manual das animações no Electron.

Estado final: concluído.

BUG relatado pelo usuário na sequência: "o chat ainda está em cima de texto no terminal" — mesmo após mover o botão de `bottom-4 right-4` para `right-4 top-4` no início da sessão.
CAUSA: mover pra outro canto fixo não resolve o problema de fundo — blocos do canvas (incluindo terminais) vivem em espaço de canvas e podem ser arrastados/panados para qualquer lugar da tela, inclusive por baixo de qualquer canto fixo. Além disso o novo canto escolhido (`top-right`) já tinha o `MiniMap` do React Flow (`CanvasView.tsx`, `position="top-right"`) — o botão de chat também sobrepunha o próprio minimapa.
FIX definitivo (o que a task pedia desde o início — "colocar ela junto com as funções auxiliares"): o botão de Chat deixou de ser um elemento `fixed` flutuante independente em `App.tsx` e virou um botão de verdade DENTRO da `CanvasToolbar` (junto com Ferramentas/Terminal/Nota/Arquivo/Grupo/etc.), recolhendo/aparecendo junto com o resto da barra pelo toggle retrátil. `CanvasView` e `ChatWorkspace` ganharam props (`onOpenChat`, `onBack`) para trocar de tela; `ChatWorkspace` ganhou um botão "Canvas" no canto superior direito (perto do badge de runtime) para voltar. Não sobra nenhum elemento `position: fixed` na tela do canvas.
TESTE: sem teste de componente (mesma limitação de sempre); validado ao vivo no Electron real via o mesmo driver Playwright descartável — `document.querySelectorAll('body *')` filtrado por `getComputedStyle(el).position === 'fixed'` na tela do canvas retornou lista vazia; clique no botão "Chat" da toolbar troca de tela, botão "Canvas" no chat volta preservando o estado do canvas (terminal aberto continuou lá).
VALIDAÇÃO: `npm run lint`, `npm run build`, `npx vitest run` (39 pass) sem erros; confirmado visualmente via screenshot do Electron real.
Estado final: concluído.

## Registro de Trabalho — 2026-07-31 (parte 2) — os dois itens que tinham ficado pendentes

Pedido do usuário: "É pra fazer tudo" — implementar os dois itens da task Notion original que a sessão anterior deixou de fora.

### Item 3e — `/resume` automático em terminal restaurado de sessão anterior

IMPLEMENTADO: `CanvasView.tsx` captura, uma única vez (`restoredAgentTerminalIdsCapturedRef`), assim que a hidratação do canvas termina (`hydrated` vira `true`), o conjunto de ids de terminais de AGENTE (`isKnownAgentCommand`, nova função em `agent-launch-options.ts` — só `claude`/`codex`/`gemini`, nunca shell puro nem "rodar arquivo") que já existiam no disco nesse boot — ou seja, ficaram abertos da última vez que o app foi fechado. A captura é uma barreira explícita de spawn: até ela terminar, `TerminalNode` não chama `ensure()`. Assim, o primeiro spawn já sabe se o nó é restaurado e recebe `/resume` seguido de Enter em vez do prompt padrão de qualidade — independente do toggle, porque retomar tem prioridade sobre reafirmar instruções que o agente já viu.
DECISÃO DE ARQUITETURA: a captura usa um único estado imutável com ids e sinal de prontidão; `isTerminalInitialTextReady` também espera a resolução de arquivos do canvas antes do spawn. O cálculo permanece no `useMemo` de renderização, nunca no estado bruto que `persistNode` grava — então `/resume` nunca vaza para o `.md`/sqlite persistido; a cada boot o critério é recalculado do zero a partir do que estava salvo, sem precisar de um novo campo persistido tipo "sessão não finalizada".
TESTE: `quality-standard-prompt.test.ts` cobre `resolveTerminalInitialText` (6 casos: resume prioriza mesmo com padrão desligado, resume não dispara sem comando de agente mesmo se `isRestoredAgent` vier errado do chamador, fallback pro padrão de qualidade, fallback pro texto cru) e a barreira de prontidão do spawn.
VERIFICAÇÃO MANUAL: reinicie o aplicativo com um terminal de agente já salvo no canvas e confirme que `/resume` aparece como o único prompt inicial, depois que a CLI estiver pronta.

### Item 4 — elemento novo "Projetos": abrir pasta e rodar arquivo num terminal

IMPLEMENTADO: novo botão "Projetos" na `CanvasToolbar` (junto das funções auxiliares, como pedido), componente `ProjectsMenu.tsx`. Reusa a mesma lista de pastas (`useCanvasProjects`) e o mesmo picker (`onAddFolder`) que o menu de terminal já usa ("assim como é feito no terminal"). Abre um navegador de pastas em popover (breadcrumb, entrar/sair de subpastas) alimentado por um novo endpoint IPC `projects:list-directory` (`electron/services/projects-ipc-handlers.cjs`, exposto em `preload.cjs` e tipado em `vite-env.d.ts`) que lista uma pasta (ou subpasta, resolvida com `path.resolve` e validada para não escapar da raiz do projeto) e devolve arquivos/pastas ordenados (pastas primeiro). Clicar num arquivo cria um terminal cujo PROCESSO é a execução do arquivo (`command`/`args` = intérprete + arquivo, `cwd` = pasta atual) via novo `runFileInTerminal` em `CanvasView.tsx` — não é "abrir shell e digitar o comando depois", é o processo do terminal já nascer rodando o arquivo, então nada de `initialText` é injetado nele.
DECISÃO DE ARQUITETURA: intérprete por extensão isolado em `run-file-command.ts` (`buildRunCommand`) — `.py`→python, `.js/.mjs/.cjs`→node, `.ts`→`npx tsx`, `.sh`→bash, `.ps1`→powershell; extensão desconhecida cai para o path cru (deixa o shell/SO decidir, mesmo resultado de digitar `./arquivo` manualmente). Criado `isKnownAgentCommand` (`agent-launch-options.ts`) para impedir que ESTES terminais (comando arbitrário tipo `python`) acabem recebendo a injeção de padrão de qualidade/`/resume` só por terem `data.command` preenchido — só os 3 comandos de agente conhecidos contam.
TESTE: `run-file-command.test.ts` (8 casos, todas as extensões + case-insensitive + fallback com/sem extensão).
FIX de lint no caminho: `ProjectsMenu.tsx` batia na mesma regra `react-hooks/set-state-in-effect` (setState síncrono dentro do corpo do efeito) — resolvido movendo o reset do estado de "carregando" para os próprios handlers que trocam de pasta (`openProject`/`openSubfolder`/`goUp`), deixando o efeito só escrever o RESULTADO da requisição assíncrona.

VALIDAÇÃO ESTÁTICA (dos dois itens juntos): `npm run lint`, `npm run build` (`tsc -b && vite build`), `npx vitest run` (53 pass) e `npm test` (backend, 397/398 — mesma falha pré-existente e não relacionada de `terminal-launcher.test.cjs`/Linux-konsole) — todos sem erros.

VALIDAÇÃO AO VIVO (Electron real): BLOQUEADA nesta sessão por instabilidade do ambiente, não do código. Depois de várias rodadas de teste ao vivo bem-sucedidas mais cedo no mesmo dia (chat overlap, shift+seta), lançamentos subsequentes do Electron (via Playwright `_electron` OU via `npm start` puro, sem Playwright) passaram a carregar `dist/index.html` com `#root` permanentemente vazio (nenhum erro de console/pageerror, `window.felixo` presente, bridge preload ok) — inclusive um `npm start` direto imprimiu "Network service crashed or was terminated, restarting service" do Chromium. Tentativas de descartar causas: variável `ELECTRON_RUN_AS_NODE=1` do shell (corrigida — sem ela o `electron.launch()` do Playwright nem completava, `scripts/start-electron.cjs` já tinha esse cuidado); `--user-data-dir` isolado vs. nenhum; `--disable-gpu`; `page.goto()` forçando nova navegação na mesma URL já anexada. Nenhuma mudou o resultado. Hipótese mais provável: exaustão de recurso do Chromium/OS por muitos lançamentos consecutivos de Electron na mesma sessão de terminal, não uma regressão introduzida pelo código (a lógica nova é 100% render-only/pure-function, coberta por unit tests, e o `npm start` sem automação não crashou — só não há como enxergar a janela real sem Playwright).
Estado final: concluído (implementação + validação estática completas); verificação visual ao vivo pendente — recomendo ao usuário testar manualmente `npm run dev` (abre janela normal, fora do ambiente automatizado que ficou instável) ou tentar novamente numa sessão nova deste agente: (1) restaurar um terminal de agente entre reinícios do app e conferir que `/resume` aparece digitado sozinho; (2) usar o novo botão "Projetos" pra navegar até um arquivo `.py`/`.js`/etc. e conferir que ele roda no terminal criado.

## Registro de Trabalho — 2026-07-31 (parte 3) — `start_app.py` não seguia o GUIA-START-APP-SCRIPT

Gatilho: usuário abriu `start_app.py` no editor e pediu "Siga o padrão de qualidade".

ACHADO: `start_app.py` era 100% orientado a flags de `argparse` (`--web`, `--skip-install`, `--update`, `--branch`), sem nenhum menu interativo — violação direta do `core/GUIA-START-APP-SCRIPT.md` do Felixo System Design, que é explícito: "Não use flags de linha de comando como interface principal... a interface é sempre o menu interativo" e exige no mínimo as 4 ações **Iniciar/Rodar, Instalar/Setup, Configurar, Status/Sair** num menu "interativo, colorido e descritivo" (não um prompt cru "digite a letra").

FEITO: `start_app.py` ganhou um menu interativo com `questionary` (navegação por setas, `Choice` descrito em uma linha por opção) + `rich` (painel colorido de cabeçalho, tabela de status) cobrindo as 4 ações mínimas + uma quinta ("Atualizar", que já existia como `--update`). Toda a lógica anterior (detecção de Node/npm cross-platform, instalação de deps Python/Node, `git pull --ff-only`, encerramento gracioso de processo) foi preservada 100% intacta — só ganhou uma camada de menu por cima, chamando as mesmas funções.
DECISÕES:
- **Bootstrap automático das libs do menu**: `ensure_tui_dependencies()` tenta importar `questionary`/`rich`; se faltar, roda `pip install` sozinho antes de desenhar o menu (item 4 do guia — "o script faz um bootstrap mínimo antes de desenhar o menu"), porque numa clonagem nova ainda não rodou o passo de Setup.
- **Flags continuam funcionando** (`--web`/`--skip-install`/`--update`/`--branch`) para não quebrar scripts/CI e a documentação existente (`docs/projeto/RODAR-VIA-CODIGO-FONTE.md` já os documentava) — mas viram um atalho "sem menu" secundário, não a interface principal: `python start_app.py` sem argumento nenhum abre o menu (comportamento padrão/recomendado); qualquer flag pula direto para o comportamento antigo (`run_direct`).
- **Novo item "Configurar"**: os overrides de ambiente que o README já documentava só via `export` manual (`FELIXO_NODE_BIN`, `FELIXO_CLI_PATHS`, `FELIXO_CLAUDE_PERMISSION_MODE`, `FELIXO_CODEX_FULL_ACCESS`, `FELIXO_GEMINI_FULL_ACCESS`, `FELIXO_PRODUCTION_BRANCH`) agora são editáveis pelo menu e persistem em `.felixo-start-config.json` (raiz, adicionado ao `.gitignore` — não é segredo, só preferências locais) aplicado no `env` do subprocesso a cada execução.
- `requirements.txt` deixou de ficar vazio: agora declara `questionary>=2.0` e `rich>=13.0`.
DOCS atualizadas: `README.md` (seção "Como rodar") e `docs/projeto/RODAR-VIA-CODIGO-FONTE.md` (tabela de comandos, seção de variáveis de ambiente) — menu como caminho principal, flags como atalho para automação.
TESTE: sem framework de teste Python no repo (`start_app.py` sempre foi validado manualmente). Verificado nesta sessão: `python -m py_compile` limpo; `ast.parse` confirma sintaxe; caminho `run_direct` (flags) executado de ponta a ponta (`--skip-install --web`, achou Node, resolveu `npm.CMD`, subiu o Vite); `ensure_tui_dependencies()` instalou `questionary`+`rich` do zero com sucesso; `_menu_status` renderizou a tabela Rich corretamente (Node detectado, deps instaladas, branch/estado Git, configs salvas); round-trip completo de `load_config`/`save_config`/`apply_config_to_env`.
LIMITAÇÃO CONHECIDA (não é bug): não foi possível exercitar `questionary.select(...).ask()` de ponta a ponta neste ambiente — tanto o Bash (pty do Git Bash/MSYS, sem console Win32 real) quanto o PowerShell com stdin redirecionado disparam `prompt_toolkit.output.win32.NoConsoleScreenBufferError`/`NoConsoleScreenBufferError`, porque `prompt_toolkit` exige um console Windows de verdade (não um pipe nem um pty emulado) — isso é uma limitação universal de qualquer app baseado em `prompt_toolkit`/`questionary` rodando fora de um terminal real, não algo específico deste código. O painel Rich do cabeçalho renderizou certinho antes de travar na etapa do `select`, e a camada de detecção de console chegou a ser alcançada — só falta confirmar visualmente a navegação por setas num terminal Windows de verdade (`cmd.exe`/PowerShell/Windows Terminal abertos manualmente).
Estado final: concluído — implementação, preservação total da lógica antiga, documentação e validação não-interativa completas; só falta o usuário confirmar visualmente a navegação do menu (setas/Enter) num terminal real, algo que este ambiente de automação não consegue simular.

## Registro de Trabalho — 2026-07-31 (parte 4) — biblioteca de prompts prontos do canvas (Ver/Editar + novos presets)

## Registro de Trabalho — 2026-07-31 (parte 5) — auditoria de dependências e validação do padrão de qualidade

PEDIDO: seguir o padrão de qualidade após a correção das dependências npm.

FEITO: `app/package.json` e `app/package-lock.json` foram atualizados para `electron-builder@26.15.3`, com override explícito de `brace-expansion` para uma versão corrigida. Os scripts de instalação necessários de `electron`, `electron-winstaller` e `node-pty` foram aprovados pelo npm 11, mantendo a instalação reprodutível e sem liberar scripts arbitrários.

SEGURANÇA: `npm audit` no registry oficial passou de 14 vulnerabilidades (13 altas e 1 crítica) para 0 vulnerabilidades.

VALIDAÇÃO: `npm run lint`, `npm run build`, `npx vitest run` (62 pass), `npm test` (398 pass), `python3 -m unittest discover -s tests -t .` (78 pass) e `git diff --check` concluídos sem erros. O único aviso não bloqueante é o tamanho de um chunk produzido pelo Vite; não há falha de build ou teste.

Estado final: concluído.

Pedido do usuário: expandir os prompts prontos ("automations") do painel "Prompts" do canvas para serem mais robustos, permitir inserir direto no terminal aberto em vez de só copiar, visualizar/editar o texto completo de um preset com confirmação explícita, e adicionar dois presets novos ("Auditoria de segurança" e "Iniciar projeto").

FEITO:
- Os 5 `defaultAutomations` existentes (`app/src/features/shared/data/automations.ts`) — Planejar feature, Revisar código, Gerar relatório diário, Preparar commit, Atualizar docs — foram reescritos de prompts de uma frase para instruções estruturadas e numeradas, e depois auditados uma segunda vez contra `Padrão de qualidade - Felixo System Design/core/GUIA_MINIMO_QUALIDADE.md`: todos ganharam "entender antes de alterar" (não inventar stack/convenção se o repo já define), preservação explícita de contratos (API/DTO/props/eventos), proibição de reproduzir segredo/token/dado pessoal no output, tratamento do `IA.md` como linha do tempo (nunca reescrever registro antigo) e fechamento na "frase de controle" do guia (o que mudou / por que / como foi validado / que risco sobrou).
- Novo preset `default-security-audit` ("Auditoria de segurança"): varredura de vulnerabilidades de código, regras de negócio confusas, modularização/arquitetura, repetição de código e qualidade estrutural; condicionalmente (se o sistema estiver em produção) também checa infraestrutura viva (banco, servidor, site) com ferramentas reais e varre logs por padrão de abuso — sempre com severidade + evidência + recomendação por achado, nunca reproduzindo segredo real encontrado durante a investigação.
- Novo preset `default-project-kickoff` ("Iniciar projeto"): NÃO gera plano nem código nesta etapa — lê o contexto que o usuário descrever, analisa o repositório de verdade (README, manifests, config, estrutura) para não perguntar o que já dá pra confirmar lendo o código, e gera um questionário numerado de ~20 perguntas objetivas (formato de escolha A/B/C sempre que possível, não texto livre), priorizando as perguntas mais técnicas/ambíguas/perigosas primeiro, distribuídas em 8 blocos (identificação, stack, dados sensíveis, auth, integrações, decisões caras de reverter, critérios de pronto, evolução esperada). Para plano/arquitetura, é preciso outro turno, com as respostas do questionário já em mãos.
- Novo escopo `AutomationScope.security`, propagado em todo lugar que lista escopos: `PromptsPanel.tsx`, `PromptDetailPanel.tsx`, `AutomationsModal.tsx` (chat) e a validação de persistência `isAutomationScope` em `automation-storage.ts`.
- Botão "Copiar" do painel de prompts do canvas virou "Inserir": digita o prompt direto no terminal expandido via `store.sendText` (mesmo mecanismo que `SkillsPanel` já usava para "Ativar"), com fallback para clipboard se nenhum terminal estiver aberto. Nova função `insertPrompt` em `CanvasView.tsx`, prop `onInsertPrompt` repassada por `CanvasToolPanels.tsx`.
- Botão "Ver" novo em cada preset abre um modo de detalhe (`PromptDetailPanel.tsx`) com nome/descrição/escopo/texto completo editáveis. Edição de preset não sobrescreve o array `defaultAutomations` — vira um "override" persistido via `window.felixo.automations.save` sob o MESMO id do preset (`isDefault: false`), que a lista passa a mostrar no lugar do preset original (badge "editado"); "Restaurar padrão" apaga o override. Edições ficam num rascunho local em vez de autosave — só persistem ao clicar "Salvar" (aparece junto de "Cancelar" quando o rascunho diverge do valor salvo), e "Inserir" fica desabilitado enquanto houver edição pendente, para não confirmar uma mudança sem querer nem inserir texto ainda não confirmado.
DECISÃO DE LAYOUT: a primeira tentativa abriu o detalhe como um SEGUNDO painel flutuante posicionado ao lado do painel de prompts (`left-[21.5rem]`) — quebrou em janelas estreitas (o usuário reportou via screenshot: painel cortado, sobrepondo). Correção definitiva: `PromptDetailPanel` passou a renderizar INLINE dentro do mesmo `CanvasPanel` (troca de conteúdo, não painel novo), com um botão "Voltar à lista" no lugar da lista quando em modo detalhe — elimina qualquer disputa de espaço. `CanvasPanel.tsx` ganhou a prop opcional `widthClassName` (default `w-80`, preservando todo painel existente) para o painel de prompts pedir mais largura (`w-[26rem]` na lista, `w-[36rem]` no detalhe) em vez de cortar texto com scroll/truncate.
REFATORAÇÃO (responsabilidade separada, achada nesta auditoria): a lógica de merge preset+override (`presetIds`, `overridesById`, `prompts` visíveis) e o upsert de override (`editPreset`) viviam misturadas com JSX dentro de `PromptsPanel.tsx` — regra de negócio dentro de componente visual, direto contra o padrão 2 do guia mínimo, e também o motivo de não dar pra testar sem harness de DOM (que o projeto não tem para `.tsx`). Extraído para `app/src/features/canvas/services/prompt-overrides.ts` (`resolveVisiblePrompts`, `buildPresetIds`, `buildOverridesById`, `upsertPresetOverride`), funções puras sem React; `PromptsPanel.tsx` agora só chama essas funções.
TESTE: `prompt-overrides.test.ts` novo — 9 casos cobrindo merge de preset+override+custom na ordem certa, upsert criando override do zero, upsert empilhando edição parcial sobre override já existente (sem resetar campo não tocado), imutabilidade do preset original, e que automações não relacionadas não são afetadas. Sem teste de componente para `PromptsPanel`/`PromptDetailPanel` — mesma limitação de sempre (projeto não tem `testing-library` nem harness de DOM para `.tsx`, só `vitest environment: node` para lógica pura); verificação da UI foi visual, via screenshot do usuário durante a sessão (confirmou o corte de texto e a posição quebrada do painel, que motivaram os dois fixes de layout acima).
VALIDAÇÃO: `npm run lint`, `npx tsc -b`, `npx vitest run` (62 pass, suíte de frontend completa) e `npm test` (398 pass, suíte Electron/Node) sem erros, rodados depois da extração para `prompt-overrides.ts`.
Estado final: concluído.

REORDENAÇÃO (pedido seguinte do usuário, mesma sessão): a ordem dos 7 presets em `defaultAutomations` seguia a ordem de criação (5 originais, depois os 2 novos no fim), sem relação com como alguém realmente usa o painel. Reordenado para seguir o ciclo de vida real de uma tarefa — Iniciar projeto → Planejar feature → Revisar código → Auditoria de segurança → Preparar commit → Atualizar docs → Gerar relatório diário — com um comentário curto no topo do array documentando o critério de ordenação. Só a ordem dos blocos mudou; nenhum texto de prompt/nome/descrição/id foi alterado. `npm run build` (`tsc -b` + `vite build`) e `npm test` (398 pass) reconfirmados depois do reorder.

## Registro de Trabalho — 2026-08-01 — feature "escrever em todos e enviar simultaneamente" + auditoria de qualidade

PEDIDO: tarefa do Notion "Feature: Escrever em todos e enviar simultâneamente" — (1) iniciar vários agentes de uma vez sem configurar terminal por terminal, e (2) escrever uma mensagem diferente para cada terminal e disparar cada uma separadamente. Durante a sessão o usuário pediu três ajustes extras: nome editável nos itens da fila antes de iniciar; renomear um terminal já spawnado avisar o agente no chat; e um botão "enviar para todos" no modo de mensagens em massa. Ao final, pediu para seguir o padrão de qualidade.

FEITO:
- **Fila de terminais** (`TerminalMenu.tsx`): botão "+" empilha a configuração atual (agente/modelo/esforço/yolo/projeto) numa fila local, com o nome de cada item editável antes de iniciar; "Iniciar N terminais" sobe todos de uma vez.
- **Mensagens em massa** (`TerminalsPanel.tsx`): modo "enviar em massa" no dock de elementos — campo de texto + botão de enviar por terminal (`store.sendText`), com os rascunhos vivendo no painel (não em cada linha) para o botão "Enviar para todos" no topo do dock disparar de uma vez todas as mensagens pendentes.
- **Renomear avisa o agente** (`NodeHeader.tsx`, `TerminalNode.tsx`, `CanvasView.tsx`): renomear um terminal já spawnado manda "A partir de agora, seu nome neste canvas é '...'" pro chat dele, disparado só no blur/Enter (não a cada tecla) e só se o valor realmente mudou desde o foco — evita spammar o terminal enquanto o usuário ainda está digitando.

Nenhuma mudança de IPC/backend foi necessária: `pty:spawn`/`pty:write` já eram parametrizados por `sessionId`/nodeId.

AUDITORIA DE QUALIDADE (pedido seguinte, mesma sessão): revisão contra `GUIA_MINIMO_QUALIDADE.md`, item 2 ("regra de negócio não fica misturada com view") — achados dois casos de lógica pura escondida dentro de componente React, mesmo padrão de problema já registrado na sessão anterior sobre `prompt-overrides.ts`:
- O cálculo de posições para a fila de terminais (`addTerminalNodes`) tinha um loop de geometria inline em `CanvasView.tsx`, duplicando o cálculo de viewport que `addNode` já fazia e sem cobertura de teste — risco real: um bug de sobreposição de blocos passaria despercebido. Extraído `findFreeNodePositions` (plural) para `services/node-geometry.ts`, ao lado do `findFreeNodePosition` original que ela reusa internamente; `addNode` e `addTerminalNodes` passaram a compartilhar um único `visibleCanvasBounds()` em vez de repetir o cálculo de viewport duas vezes.
- A seleção de "quais rascunhos estão prontos pra enviar" (`sendAllDrafts`) vivia como `Object.entries(...).filter(...)` dentro de `TerminalsPanel.tsx`. Extraído `pendingDraftNodeIds` para `components/tools/terminals-panel-drafts.ts`, no mesmo padrão do `terminals-panel-navigation.ts` já existente (lógica pura ao lado do componente, sem React).

TESTE: `node-geometry.test.ts` novo (4 casos — lista vazia, batch de 1 bate com `findFreeNodePosition`, batch de 4 sem sobreposição entre si, batch evita nó já existente no canvas). `terminals-panel-drafts.test.ts` novo (3 casos — sem rascunhos, rascunhos vazios/só espaço são ignorados, ordem de inserção preservada).

VALIDAÇÃO: `npx tsc -b`, `npx eslint .`, `npx vite build` e `npx vitest run` (69 pass, 7 a mais que a baseline de 62) sem erros. Sem validação ao vivo no Electron real (Playwright + xvfb sobre app com módulo nativo `node-pty` não está configurado neste repo) — mesma limitação já registrada nas sessões anteriores; risco residual é baixo porque toda a lógica nova ou é função pura testada, ou reusa primitivas já validadas (`store.sendText`, `pty:spawn`/`pty:write`).

Estado final: concluído — as duas features + os três ajustes pedidos + a auditoria de qualidade (extração e teste da lógica que estava misturada em componente) completos.

AUDITORIA CONTRA OS GUIAS COMPLETOS (pedido seguinte, mesma sessão): "Siga os guias do padrão de qualidade" — desta vez os documentos completos (não só o `GUIA_MINIMO_QUALIDADE.md`). `DESIGN_SYSTEM_FRONTEND.md` é majoritariamente identidade visual específica do FelixoVerse (glow roxo, partículas), que o próprio documento diz para adaptar/substituir por projeto — o Felixo AI Core já tem seu próprio tema (zinc escuro + emerald), então essas seções não se aplicam. A seção 8.3 ("Melhorias Sugeridas") lista acessibilidade — "adicionar `aria-label` em todos os botões de ícone" — e o projeto já segue essa convenção de fato (16 arquivos com `aria-label`, incluindo o próprio `TerminalMenu.tsx` antes desta sessão). Achado: os botões de ícone novos desta sessão (fila de terminais em `TerminalMenu.tsx` — "+", lixeira, remover item; alternância de "enviar em massa" e envio por terminal em `TerminalsPanel.tsx`) tinham `title` mas não `aria-label`, quebrando essa convenção local. Corrigido: `aria-label` adicionado em todos (descritivo, incluindo o nome do terminal/item quando fizer diferença — ex.: `Enviar mensagem para "<nome>"`) e `aria-pressed` no toggle de "enviar em massa" (é um botão de estado, não uma ação pontual).
VALIDAÇÃO: `npx tsc -b`, `npx eslint .`, `npx vite build` e `npx vitest run` (69 pass) sem erros.
Estado final: concluído.

## Registro de Trabalho — 2026-08-03 — refatoração real dos 3 maiores arquivos faz-tudo

PEDIDO: aplicar o padrão de qualidade nos 3 arquivos identificados como faz-tudo — `ipc-handlers.cjs` (1284 linhas), `CanvasView.tsx` (1174 linhas) e `ChatWorkspace.tsx` (1790 linhas). Feedback explícito de sessão anterior: "padrão de qualidade" exige refatoração real de código (dividir responsabilidades), não auditoria estrutural (docs, .gitignore etc); refactor puro, sem mudar comportamento, um commit por extração.

FEITO:
- **`ipc-handlers.cjs`** misturava execução/streaming de processos CLI (spawn, stdout/stderr, orquestração) com gerenciamento de conta/catálogo das CLIs oficiais (listar, instalar, login, status, trocar conta) — dois domínios diferentes. Extraídos os 5 handlers `cli:list-official`/`install-official`/`open-official-login`/`official-account-status`/`switch-official-account` para `official-cli-account-ipc-handlers.cjs` novo, registrado separadamente em `main.cjs`. 1284 → 1177 linhas.
- **`CanvasView.tsx`** já tinha boa parte da geometria/regras de negócio extraída em sessões anteriores (`node-geometry.ts`, `file-terminal-links.ts`, `useCanvasPersistence.ts`), mas ainda continha as operações em massa do canvas (limpar tudo, exportar `.fxcanvas`, importar `.fxcanvas`) — confirmações, diálogo de arquivo, (de)serialização do bundle e as flags de busy que as acompanham. Extraído para `hooks/useCanvasTransfer.ts` novo. 1174 → 1050 linhas.
- **`ChatWorkspace.tsx`** (o maior e mais entrelaçado) continha três blocos de estado praticamente independentes, cada um com seu próprio ciclo local-first + migração/sincronização com backend + refs de bookkeeping: notas de projeto, automações customizadas e projetos (+ ids ativos). Extraídos para `hooks/useNotes.ts`, `hooks/useAutomations.ts` e `hooks/useProjects.ts` (este último mantém projects e activeProjectIds juntos, pois a sincronização de activeIds depende do load de projects). Modelos (`models`/`selectedModelId`) foram avaliados mas não extraídos nesta passada — 75 referências cruzadas com `stopStreaming`/`resetConversationThread`/`sendMessage` tornam a extração de baixo risco inviável sem um desenho mais cuidadoso; registrado como próximo passo. 1790 → 1465 linhas.

TESTE: nenhum teste novo — refactor puro reaproveitando comportamento já coberto pela suíte existente (398 testes de backend `node:test`, 69 de frontend `vitest`).

VALIDAÇÃO: a cada extração — `npx tsc -b`, `npx eslint .`, `npm run build` (backend + frontend) e a suíte de testes correspondente (backend: 398 pass; frontend: 69 pass) rodados e verificados verdes antes de prosseguir para o próximo arquivo. `qa-logger.cjs` e o pin do `TerminalDrawer.tsx` (trabalho não commitado de outra tarefa) não foram tocados.

Estado final: concluído — os 3 arquivos refatorados, 3 commits incrementais na branch `refactor/quality-pass-2026-08-03`, build final do repo verde.

## Registro de Trabalho — 2026-08-04 — recuperação de PTY no Windows

PEDIDO: tornar a recuperação de falhas de caminho do PTY previsível em sessões Windows, inclusive ao abrir uma CLI explícita.

FEITO: uma mensagem de erro de caminho no início agora tenta WinPTY (`useConpty: false`) antes de trocar o fluxo de recuperação, tanto para shell quanto para CLI explícita. O diagnóstico informa a camada recuperada sem expor caminhos locais na interface.

TESTE: os testes de regressão de `pty-process-manager.test.cjs` para shell e Codex explícito passaram. A suíte Electron/Node completa (417 testes) e `git diff --check` também concluíram sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — organização manual dos agentes existentes

PEDIDO: possibilitar a matriz também para agentes adicionados em momentos diferentes, sem reposicionar automaticamente o canvas durante o trabalho.

FEITO: adicionado o botão **Organizar** ao lado de **Agente**. Ele só fica ativo com pelo menos dois terminais de agentes conhecidos e reorganiza os agentes independentes em uma matriz livre, usando a mesma geometria da abertura em lote. Shells, arquivos, notas, grupos e terminais filhos de grupos não se movem; os novos posicionamentos são persistidos como qualquer arrasto manual de bloco. Antes de mudar as coordenadas, os blocos recebem uma classe transitória e só então se movem em dois frames de renderização, produzindo um deslocamento suave de 480 ms em vez de teleporte; `prefers-reduced-motion` mantém a troca instantânea.

A sequência de animação da barra também foi ajustada para incluir o novo botão sem alterar o movimento fluido dos controles seguintes durante a abertura ou o recolhimento.

TESTE: `agent-matrix-layout.test.ts` cobre a reorganização de quatro agentes, a preservação de todos os blocos não elegíveis e o no-op com menos de dois agentes independentes.

VALIDAÇÃO: com Node 25.9.0, ESLint, TypeScript, build do Vite, `vitest` (96 testes), suíte Electron/Node (417 testes) e `git diff --check` concluídos sem erros. Não há harness de DOM/Electron para validar a posição visual; a conferência manual recomendada é abrir agentes em momentos diferentes, clicar em **Organizar** e confirmar que apenas os agentes no nível principal se movem com transição suave.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — prevenção de sobreposição em notificações

PEDIDO: evitar que o painel de Notificações cubra a lista de Ferramentas quando ambos estiverem abertos.

FEITO: o estado aberto de Ferramentas agora é encaminhado também para o painel de Notificações. Sem Ferramentas, Notificações usa sua coluna original; com Ferramentas aberto, ela transita para a segunda coluna, preservando a animação sequencial e evitando sobreposição.

VALIDAÇÃO: ESLint, TypeScript, `vitest` (100 testes), build do Vite e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — padronização de qualidade do canvas

PEDIDO: normalizar o conjunto recente de menus e notificações segundo o padrão de qualidade.

FEITO: a revisão aplicou os princípios de responsabilidade única, simplicidade verificável e testes de comportamento. `NotificationsMenu` passou a concentrar o trigger visual, o ciclo de expansão e a animação usados nas versões expandida e recolhida da barra, removendo duplicação em `CanvasToolbar`. As regras de criar e consumir notificações foram extraídas para `terminal/canvas-notifications.ts`; `CanvasView` apenas coordena estado e efeitos de áudio. A sequência de IDs é calculada antes da atualização de estado, sem efeito colateral dentro de updater React.

TESTE: `canvas-notifications.test.ts` cobre criação ordenada, ausência de snapshot e consumo individual. Validação com Node 25.9.0: ESLint, TypeScript, Vite build, `vitest` (100 testes) e `git diff --check` concluídos sem erros.

RISCO RESIDUAL: a animação continua sem harness de DOM/Electron; conferir manualmente a abertura/recolhimento em ambos os estados da barra e com `prefers-reduced-motion`.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — painel de notificações ancorado e legível

PEDIDO: corrigir o botão de notificações deformado, o painel sobreposto sem animação, a ausência da última mensagem útil e a paleta divergente.

FEITO: o painel passou a ser ancorado ao botão de Notificações, abrindo à direita com animação própria e sem cobrir a barra. O botão reserva espaço fixo para o sino e o ponto de alerta, sem contador que comprima o ícone. A paleta passou a ser âmbar, igual à lista; o preview ignora rodapés de CLI (modelo, tokens e indicadores) para preservar a última linha útil do agente.

VALIDAÇÃO: ESLint, TypeScript, `vitest` (98 testes), build do Vite e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — aviso visual e consumo de notificações

PEDIDO: destacar visualmente novas notificações e removê-las quando o usuário abrir o terminal correspondente.

FEITO: o botão **Notificações** recebe borda vermelha, ponto vermelho e contador quando há itens. Cada entrada mostra o nome do agente e a última linha disponível do preview do terminal. Ao clicar, o canvas centraliza/expande o terminal e remove a entrada consumida; outras notificações permanecem ativas.

VALIDAÇÃO: ESLint, TypeScript, `vitest` (98 testes), build do Vite e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — coexistência dos menus Ferramentas e Agente

PEDIDO: impedir que as opções de Ferramentas cubram o formulário de configuração do Agente quando ambos estiverem abertos, sem alterar a expansão já aprovada do botão Agente.

FEITO: `CanvasToolbar` passou a compartilhar o estado aberto de Ferramentas com `TerminalMenu`. Com Ferramentas fechado, o formulário de Agente conserva sua posição original; com os dois abertos, ele transita para a segunda coluna, após as opções de Ferramentas. A largura, duração e sincronização da expansão de Agente foram preservadas.

VALIDAÇÃO: ESLint, TypeScript, `vitest` (98 testes), build do Vite e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — histórico de notificações durante a execução

PEDIDO: manter as notificações disponíveis enquanto o app estiver aberto, limpando-as somente ao fechar o app.

FEITO: o painel deixou de derivar sua lista apenas dos snapshots atuais. `CanvasView` agora mantém um histórico em memória das transições de agentes para `idle`, `waiting_approval` ou `exited`; assim, a notificação continua visível mesmo quando o agente muda de estado depois. O estado é local ao processo e não é persistido no canvas, portanto desaparece ao fechar o app. O contador e o som usam a mesma transição registrada.

VALIDAÇÃO: ESLint, TypeScript, build do Vite, `vitest` (98 testes) e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — correções pós-validação de agentes e notificações

PEDIDO: corrigir sobreposição dos painéis extras, retomada incorreta de sessões restauradas e ausência de notificação quando o agente termina um trabalho.

FEITO: o painel de configuração do Agente passou a ocupar a segunda coluna, depois das opções de Ferramentas, evitando sobreposição quando os dois menus estão abertos. A retomada usa `/resume` com Enter no primeiro spawn de agentes persistidos. O estado `idle` passou a exigir ação e aparece no painel/contador de notificações com mensagem própria, acionando também o alerta sonoro já existente.

VALIDAÇÃO: ESLint, TypeScript, build do Vite, `vitest` (98 testes), suíte Electron/Node (417 testes) e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — alerta sonoro de notificações

PEDIDO: reproduzir um áudio local quando uma nova notificação do app surgir.

FEITO: o alerta recente `ui-alert-synth-beep...mp3` da pasta Downloads foi incorporado como `app/public/sounds/notification.mp3`. `CanvasView` agora compara o conjunto atual de agentes em `waiting_approval` ou `exited` com o conjunto anterior e toca o áudio uma vez quando um novo agente passa a exigir ação. Notificações já presentes durante a hidratação inicial não emitem som; falhas de autoplay são ignoradas com segurança.

TESTE: `session-notifications.test.ts` ganhou cobertura para filtrar apenas terminais e detectar transições novas. ESLint, TypeScript e os 4 testes direcionados passaram.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — matriz para abertura em lote de agentes

PEDIDO: ao iniciar vários agentes pela fila, organizá-los como uma matriz que cresce de modo próximo a um quadrado, em vez de uma sequência horizontal ou vertical que aparentava depender do espaço disponível.

FEITO: `findFreeNodePositions` agora calcula primeiro uma área livre para o lote inteiro e distribui os terminais em uma grade determinística de `ceil(√n)` colunas. A matriz é testada como um conjunto contra os blocos existentes, preservando o espaçamento e evitando que um agente isolado seja deslocado para fora do grupo. Quando a área visível comporta toda a matriz, ela é priorizada; caso contrário, o canvas ainda encontra uma área livre sem sobreposição.

TESTE: `node-geometry.test.ts` cobre matriz 2×2, crescimento para cinco agentes (3 colunas/2 linhas), prioridade para a matriz que cabe inteiramente na área visível e o deslocamento da matriz completa quando a origem já está ocupada.

VALIDAÇÃO: com Node 25.9.0, ESLint, TypeScript, build do Vite, `vitest` (94 testes), suíte Electron/Node (417 testes) e `git diff --check` concluídos sem erros. Como não há harness de DOM/Electron para a disposição visual, a conferência manual recomendada é montar uma fila com 4, 5 e 6 agentes e confirmar as grades 2×2, 3×2 e 3×2.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — colaboração por conexões entre agentes

PEDIDO: ao ligar dois agentes no canvas, ambos precisam reconhecer que trabalham juntos no mesmo projeto ou em contextos relacionados. A conexão já era persistida, mas só a combinação arquivo→terminal recebia ação; terminal→terminal não fazia nada.

FEITO: `agent-collaboration-links.ts` identifica exclusivamente pares de terminais de agentes conhecidos e envia uma instrução recíproca aos dois. Quando os diretórios de trabalho coincidem, a mensagem declara o projeto compartilhado; quando diferem, declara os contextos relacionados pelo canvas. A instrução também deixa explícito que a conexão não repassa conversa/saída automaticamente e orienta a coordenação por arquivos `.md` e notas compartilhados. Shells, comandos arbitrários, auto-conexões e outros tipos de bloco continuam sem receber prompt.

TESTE: `agent-collaboration-links.test.ts` cobre parceria no mesmo projeto, contextos relacionados em diretórios diferentes e exclusão de pares que não são dois agentes.

VALIDAÇÃO: com Node 25.9.0, ESLint, TypeScript, build do Vite, `vitest` (92 testes), suíte Electron/Node (417 testes) e `git diff --check` concluídos sem erros. Como o projeto não possui harness de DOM para o canvas, a checagem visual manual recomendada é ligar dois agentes e confirmar que cada terminal recebe a instrução com o nome do outro.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — qualidade da barra de ações e notificações do canvas

PEDIDO: aplicar o padrão de qualidade ao conjunto recente de mudanças no canvas: abertura sequencial dos menus de Ferramentas e Agente, notificações de agentes e barra retrátil.

FEITO:
- A coordenação de tempo dos dois menus deixou de ser duplicada nos componentes. `menu-panel-timing.ts` concentra a duração e o cálculo do instante de preparação; `useDeferredExpansionPanel.ts` concentra o ciclo de abrir, preparar, concluir e limpar o painel. O botão mantém a transição de 420 ms já aprovada visualmente, enquanto os itens passam a iniciar no ponto correto, sem um atraso extra depois do fim da expansão.
- A regra de negócio que define se um agente requer atenção saiu de `NotificationsPanel.tsx` para `terminal/session-notifications.ts`. Assim, `CanvasView` e o painel usam a mesma regra, sem exportar utilitário a partir de um componente React.
- A assinatura de todas as sessões foi migrada para `useSyncExternalStore`. `TerminalSessionStore` mantém um snapshot imutável e notifica criação, atualização e remoção de sessão, evitando `setState` síncrono em efeito e deixando o contador/painel de notificações consistente.
- Os controles de recolher/expandir receberam rótulos acessíveis explícitos.
- `agent-launch-preferences.ts` passou a persistir e validar a configuração reutilizável completa do launcher (CLI, modelo, esforço, permissões, projeto e arquivo de planejamento), com migração segura da preferência antiga que guardava só a CLI. O nome permanece intencionalmente fora dessa preferência, pois é específico de cada bloco criado.
- Todos os prompts programáticos do canvas agora terminam em CR (Enter), por meio de `terminal-input.ts`. Antes, alguns terminavam em LF e podiam apenas aparecer no terminal sem serem submetidos; isso incluía o arquivo de planejamento quando o padrão de qualidade estava desligado. A instrução do planejamento foi extraída para função pura e aceita qualquer extensão de arquivo.

TESTE: testes unitários novos para o cálculo de sincronização do painel, estados de notificação, normalização do Enter em PTY, preferências do launcher e composição do planejamento. Validação com Node 25.9.0: ESLint, TypeScript, Vite build, `vitest` (92 testes), suíte Electron/Node (417 testes) e `git diff --check` concluídos sem erros.

RISCO RESIDUAL: o repositório não possui harness de DOM/Electron para medir animações. A abertura e o recolhimento dos dois menus, inclusive com `prefers-reduced-motion`, continuam sujeitos à conferência visual manual no app. O build também mantém o aviso já existente de chunk Vite acima de 500 kB; a auditoria não introduziu code splitting fora do escopo.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — submissão confiável de `/resume`

PEDIDO: o terminal restaurado mostrava `/resume`, mas por vezes só inseria uma quebra de linha em vez de efetivamente executar o comando.

FEITO: a entrega do prompt inicial do Codex agora espera o compositor interativo vazio (`›`) estar visível. O texto e a tecla Enter são enviados em duas escritas PTY, com intervalo curto: primeiro `/resume`, depois `CR`. Isso evita que o TUI trate o Enter que chega junto de texto programático como uma nova linha.

TESTE: `terminal-input.test.ts` cobre a separação entre texto normalizado e a tecla Enter. A validação estática e a suíte frontend são executadas nesta alteração.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — notificações sem duplicação e com consumo durável

PEDIDO: em outro computador, as notificações pareciam entrar em loop e não desapareciam ao abrir o terminal do agente.

FEITO: o histórico passou a manter somente um aviso pendente por agente; um evento posterior atualiza o aviso em vez de empilhá-lo. Ao abrir a notificação, todos os avisos residuais daquele agente são consumidos e o agente fica reconhecido até receber um novo prompt. Dessa forma, a atualização visual do terminal ao abrir o drawer não recria nem repete o alerta; uma nova interação real com o agente inicia um novo ciclo de aviso.

TESTE: `canvas-notifications.test.ts` agora cobre a substituição de aviso do mesmo agente e o consumo de todos os itens residuais do agente. ESLint, TypeScript, testes direcionados, suíte frontend e build são executados nesta alteração.

Estado final: concluído.

## Resumos de Decisão

[2026-06-21] CONTEXTO: Como persistir as conversas dos terminais entre sessões (o PTY morre ao fechar o app e o scrollback é efêmero).
ALTERNATIVAS: (a) salvar o scrollback do xterm no SQLite; (b) externalizar o estado em arquivos `.md` reais que os agentes editam.
DECISÃO: (b) — o estado vira um arquivo no disco (`userData/canvas-files`), que o bloco renderiza/observa e os agentes editam. Resolve persistência de graça e habilita memória compartilhada entre agentes. Arquivos fora dos projetos para não vazar no git de quem usa.
VALIDAÇÃO: usuário confirmou de ponta a ponta — Claude leu o protocolo, entendeu o arquivo e respondeu corretamente. Suíte 380 pass.

[2026-06-22] CONTEXTO: Separar o modo chat do modo canvas seguindo o padrão de qualidade, com canvas como padrão.
ALTERNATIVAS: (a) canvas + chat + `shared`; (b) chat como legado; (c) só cortar a dependência sem mover pastas.
DECISÃO: (a) — três features irmãs, o compartilhado em `shared`, dependência num sentido só. Feito em branch `refactor/` (política), validando a cada passo.
VALIDAÇÃO: tsc+vite+lint+test verdes em cada passo; canvas deixou de importar de `chat`. Suíte 380 pass.

## Registro de Trabalho — 2026-08-05 — revisão e correções da semana

PEDIDO: revisar e implementar as melhorias necessárias em todos os commits da semana de 03 a 05/08/2026.

FEITO: os flyouts da barra do canvas passaram a calcular a posição e a altura disponíveis em runtime, mantendo Ferramentas, Agente, Projetos e Notificações acessíveis após resize/zoom. O dock de Elementos recolhido deixou de expor controles focáveis invisíveis e o arraste ganhou guardas contra alteração concorrente da lista. O drawer de terminal passou a usar uma faixa de largura válida em viewport estreita, com limpeza dos estilos globais durante desmontagem. Pacotes `.fxcanvas` não preservam mais `initialText`, evitando execução automática de conteúdo importado. O IPC de projetos passou a validar caminhos reais, prefixos de diretório e symlinks antes de listar ou indexar arquivos.

TESTE: ESLint, TypeScript/Vite build, `npm run test:frontend` (172 testes), `npm test` (420 testes) e `git diff --check` concluídos sem erros. Foram adicionados testes para posicionamento responsivo, largura do drawer, remoção de texto autoenviado em imports e contenção de caminhos.

RISCO RESIDUAL: o repositório ainda não possui harness de DOM/Electron para validar visualmente animações e interação de ponteiro; recomenda-se uma conferência manual em viewport reduzida, com zoom alterado, abertura simultânea de Ferramentas/Notificações e drag do drawer. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — PTY reanexável e passagem de responsabilidade

RESPONSÁVEL: Revisar codigo.

PEDIDO: corrigir o reset prematuro ao desenvolver o Felixo AI Core dentro do próprio canvas e permitir que um agente parado por limite de uso transfira o trabalho para outro agente com o histórico do terminal.

FEITO:
- O PTY do canvas passou a usar um identificador estável por bloco e o processo Electron mantém uma janela limitada de replay. HMR, navegação entre Canvas/Chat e remount do renderer reanexam a sessão existente, restauram a saída e não reenviam a instrução inicial; uma nova sessão só é criada quando o bloco realmente não existe mais.
- Sessões encerradas ficam retidas até remoção explícita do bloco, permitindo restaurar também o estado final. O descarte do bloco e o encerramento do app continuam usando kill forçado para liberar o processo e o buffer.
- Saídas explícitas de limite (`usage limit`, `out of extra usage`, `429`, equivalentes) são marcadas no snapshot. O botão “Passar responsabilidade” só aparece com limite detectado e agente parado, e abre uma confirmação que alerta sobre segredos no transcript.
- A confirmação lê o scrollback completo disponível no xterm, aplica limite de segurança de 160 mil caracteres com marcador quando necessário, escolhe o próximo CLI nativo em ordem determinística, preserva o diretório e as conexões com arquivos `.md`, e envia o contexto como transcript não confiável. O histórico é mantido apenas em memória e `handoffText` é removido da persistência/exportação.

TESTE: lint, `npm run build`, `npx vitest run` (180 testes), `npm test` (421 testes), testes direcionados do PTY (36) e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

VERIFICAÇÃO MANUAL RECOMENDADA: iniciar um agente no canvas apontando para este repositório, alterar um componente para provocar HMR/navegar ao Chat e voltar; confirmar que o mesmo processo continua sem reenviar a instrução. Para o handoff, simular uma saída com limite seguida de encerramento, abrir o drawer, confirmar o aviso de transcript e verificar que o novo CLI recebe o contexto no mesmo diretório e sem gravar o transcript no canvas.

RISCO RESIDUAL: o replay do processo Electron é limitado a 200 mil caracteres e o scrollback do xterm a 20 mil linhas; históricos maiores são deliberadamente truncados para não inundar o próximo agente. A escolha automática pressupõe que o próximo CLI da matriz esteja instalado e autenticado; se não estiver, o novo bloco exibirá o erro de inicialização e o usuário deverá escolher outro agente manualmente.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — animação dos botões restantes

RESPONSÁVEL: Revisar codigo.

PEDIDO: aplicar aos botões que ainda não tinham animação o mesmo feedback de pressão dos controles já padronizados.

FEITO: os botões internos do painel de notificações, os controles de confirmação do handoff e o seletor de arquivo de planejamento passaram a usar `felixo-btn` ou `felixo-btn-icon`, preservando suas classes visuais e comportamentos existentes.

TESTE: `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

RISCO RESIDUAL: a conferência visual de pressão, foco por teclado e `prefers-reduced-motion` ainda deve ser feita no Electron real, pois o repositório não possui harness visual de DOM/Electron.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — cascata nos flyouts da barra do canvas

RESPONSÁVEL: Revisar codigo.

PEDIDO: completar a animação nos controles como “Projetos”, que já tinham feedback de clique, mas ainda abriam o painel sem a cascata visual dos demais menus da barra.

FEITO: os flyouts de Projetos e de criação de Nota, Arquivo e Grupo agora usam `felixo-anim-sequential-panel`, igual a Ferramentas, Agente e Notificações. O posicionamento responsivo, acessibilidade e comportamento de abertura existentes foram preservados.

TESTE: `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

RISCO RESIDUAL: requer conferência visual no Electron real, especialmente com zoom reduzido e `prefers-reduced-motion`, pois não há harness visual de DOM/Electron.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — sequência completa dos menus Projetos e criação

RESPONSÁVEL: Revisar codigo.

PEDIDO: tornar a animação de Projetos realmente igual à de Ferramentas, Agente e Notificações; apenas a classe de cascata não reproduzia a expansão e o momento de montagem do painel.

FEITO: Projetos, Nota, Arquivo e Grupo agora usam `useDeferredExpansionPanel`, expandem o contêiner com a mesma curva e duração dos outros menus, aguardam o ponto sincronizado da expansão e só então exibem o flyout em cascata. Fechamento por botão, clique externo e criação/execução também limpam o estado de preparação.

TESTE: `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

RISCO RESIDUAL: a sequência exige conferência visual no Electron real, sobretudo em zoom reduzido e com `prefers-reduced-motion`, pois o repositório não possui harness visual de DOM/Electron.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — correção visual da cascata de Projetos

RESPONSÁVEL: Revisar codigo.

PEDIDO: a imagem mostrou que Projetos ainda não seguia o padrão visual: o painel aparecia, mas as pastas internas surgiam simultaneamente.

FEITO: a lista de projetos e a lista de arquivos/diretórios passaram a usar `felixo-anim-stagger-list`, que anima cada item na mesma cascata dos menus padronizados. A tentativa anterior de expandir artificialmente o acionador foi removida para preservar a geometria compacta mostrada na barra; o painel lateral continua com a animação de entrada já existente.

TESTE: `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

RISCO RESIDUAL: a confirmação visual final ainda requer abrir Projetos no Electron real com uma lista longa, pois não há harness visual de DOM/Electron.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — equivalência de Projetos com Ferramentas

RESPONSÁVEL: Revisar codigo.

PEDIDO: comparar a animação completa de Ferramentas com Projetos, pois o padrão ainda não era equivalente.

FEITO: validação feita no Electron em desenvolvimento. Projetos passou a usar a mesma sequência de Ferramentas: expansão de `w-36` para `w-[18.5rem]` em 620 ms, alternância do chevron, preparação adiada via `useDeferredExpansionPanel`, montagem após a expansão e flyout abaixo do acionador. A largura de conteúdo permanece em `w-72` para acomodar nomes de pastas; é a única diferença intencional. As listas internas mantêm a cascata item a item.

TESTE: inspeção visual no Electron, `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

RISCO RESIDUAL: conferir o fechamento com `prefers-reduced-motion` e uma lista extensa continua recomendado, apesar de o fluxo aberto ter sido validado visualmente.

Estado final: concluído.

## Registro de Trabalho — 2026-08-08 — auditoria de código e segurança do repositório

RESPONSÁVEL: Revisar codigo.

PEDIDO: code review completo do repositório inteiro (não só do diff) somado a auditoria de segurança, partindo da premissa de projeto maduro construído em blocos independentes — esperando duplicação, camadas mal delimitadas e partes mortas. Exigência de toda afirmação vir ancorada em `arquivo:linha`, com regra anti-ruído explícita (melhor 12 achados sólidos que 60 duvidosos). O pedido original restringia a apenas diagnosticar; a autorização para corrigir veio depois, já durante a execução.

FEITO: auditoria registrada em [`docs/AUDITORIA-2026-08-08.md`](../AUDITORIA-2026-08-08.md), com mapa de arquitetura (diagrama Mermaid), 8 achados e plano de remediação em 3 fases. A premissa do pedido não se confirmou: o backend mostrou SQL 100% parametrizado, `execFile` sem shell, allowlist de argv em `git-service.cjs`, `resolveSafePath` confinando os arquivos do canvas, zero `catch` vazio, zero promise flutuante e `npm audit` limpo. Vários candidatos a achado foram investigados e descartados por não terem gatilho concreto — `JSON.parse` dos adapters (protegido por `parseAdapterLine` em `cli-event-utils.cjs:12-24`), storages do frontend (todos dentro de `try`), e a flag `--dangerously-bypass-approvals-and-sandbox` (opt-in explícito do usuário, não vulnerabilidade).

Corrigidas as Fases 0 e 1: `.env` passou a ser ignorado (o `.env.example:3` mandava criá-lo e nada o cobria); `recentItems` removido de `models.ts` — era código morto contendo títulos de conversas pessoais num repositório público; `toErrorResult`, que estava copiado byte a byte em 9 handlers e define o contrato de erro de todo IPC do app, foi unificado em `services/ipc-result.cjs`; `normalizePositiveInteger`, que existia 2x no mesmo processo com contratos opostos (uma lança, outra retorna `undefined`), foi renomeada pelo que cada uma faz; e a política de novas janelas do webview passou a ser aplicada recursivamente, fechando uma lacuna do código introduzido nesta mesma sessão — um popup de login podia abrir outras janelas sem restrição.

TESTE: `npx tsc -b` limpo e `npm test` com 428/428 passando, incluindo 3 testes novos cobrindo a política de janelas do webview (deny navegando in-place, allow sem arrastar o opener, e herança da política pelo popup). Verificação de `.gitignore` feita com `git check-ignore` confirmando `.env`, `app/.env` e `.env.*` ignorados com `.env.example` preservado. Histórico auditado com `git log --all --diff-filter=A`: `.env` nunca foi commitado.

RISCO RESIDUAL: três frentes seguem abertas e estão registradas no relatório. (1) ARQ-01 e ARQ-02 — `sendCliRequest` com ~570 linhas dentro de uma função de ~790 em `ipc-handlers.cjs:82-871`, e `CanvasView.tsx` com 1611 linhas e 54 hooks — não foram tocadas de propósito: são as únicas mudanças da lista capazes de quebrar comportamento silenciosamente e nenhuma tem hoje rede de testes que pegue a regressão. (2) PRIV-01 é correção parcial: os títulos pessoais saíram do `HEAD` mas permanecem no histórico do Git, cujo expurgo exige `git filter-repo` com force-push — decisão do dono do projeto. (3) A auditoria foi por leitura, sem execução do app; `orchestration-runner.cjs` (1010 linhas) e `persistent-cli-session.cjs` (847 linhas) ficaram sem leitura linha a linha, e o `felixo_launcher/` recebeu só varredura de segurança.

Estado final: concluído — Fases 0 e 1 aplicadas e commitadas (`ce878a1`, `e8518d9`, `8c2e7d3`); Fase 2 aguardando decisão do dono do projeto.

## Registro de Trabalho — 2026-08-09 — conclusão da auditoria: correções, validação no app e 3ª passada

RESPONSÁVEL: Revisar codigo.

PEDIDO: fazer tudo o que tinha ficado em aberto — os 7 achados de concorrência que eu havia deixado documentados em vez de corrigidos, a auditoria do restante de `electron/services` e do `felixo_launcher`, e a validação do bloco de Página Web rodando o app de verdade, com autorização explícita para reiniciar o ambiente e usar automações.

FEITO: **rodar o app foi o que mais rendeu.** Encontrou dois bugs que nenhuma suíte pegaria: o build de produção abria em branco (o Vite não definia `base`, e sob `file://` os assets absolutos apontam para a raiz do disco — existia desde o commit inicial e só afeta o app empacotado), e o `allowpopups` do bloco de Página Web nunca chegava ao DOM. Esse segundo explica por que as duas correções anteriores do login OAuth não funcionaram: `@types/react` declara o atributo como boolean e o React não o serializa em elemento desconhecido; setá-lo por ref também não adianta, porque o Chromium decide sobre popups no instante em que anexa o guest. O `<webview>` passou a ser criado imperativamente, com os atributos antes do `appendChild`, e verifiquei no app que `window.open` voltou a devolver uma janela.

Dos achados de concorrência, cinco foram corrigidos com teste (BUG-01, LEAK-01, LEAK-02, RACE-01 e o BUG-03 da rodada anterior) e um foi **descartado por verificação**: o RACE-03 supunha perda de stdout no fechamento, mas o guard só bufferiza até a primeira inspeção e o único caso de retenção é saída composta apenas de espaço em branco, que o line-reader descartaria de qualquer forma.

A terceira passada cobriu o restante de `electron/services` e o launcher. O achado mais grave foi o `done` de um modelo apagando o limite de toda a CLI: com o limite de uso da Claude ativo, qualquer sub-agente concluindo bem "liberava" um modelo esgotado, e o seletor voltava a escolhê-lo para tomar o mesmo erro, queimando turnos em vez de migrar de provedor. No launcher, quatro achados, dois deles graves: a opção "Pasta do Node.js/npm" do menu não fazia efeito nenhum (a config era aplicada depois da descoberta do Node), e a limpeza de processos matava editores — o filtro aceitava qualquer menção a `/vite`, e `.../node_modules/vite/...` já contém, então um `vim` aberto ali levava SIGTERM e SIGKILL, exatamente o oposto do que o docstring da função promete.

TESTE: 466 testes do backend, 200 do frontend e 89 (+70 subtests) do launcher, todos passando; `tsc -b` limpo. A validação visual foi feita com driver Playwright sobre Xvfb, com `--user-data-dir` isolado para não tocar no banco do usuário. Cada correção seguiu TDD, e dois testes meus foram descartados no caminho por não provarem o que afirmavam — um passava com e sem a correção, outro construía um cenário que nem acionava o código sob teste.

RISCO RESIDUAL: dois achados seguem abertos de propósito. O RACE-02 depende de duas chamadas concorrentes se intercalarem entre a checagem e a atribuição de `activeRun`; o gatilho mais plausível era a dupla reinvocação do RACE-01, agora corrigido, então o cenário pode ter deixado de ser alcançável — confirmar exige reproduzir a corrida, não ler o código. O BUG-02 não é defeito técnico e sim decisão de produto: hoje esgotar `maxTurns` falha o run e descarta o trabalho dos agentes, e sintetizar uma resposta final com o que já existe é comportamento diferente. O frontend (~24k linhas em `app/src/`) segue sem leitura linha a linha, já que as três passadas priorizaram o processo principal e o launcher, que são as superfícies com acesso ao SO. Por fim, o fork `flaviavs-commits/Felixo-AI-Core` ainda carrega o histórico anterior ao expurgo dos dados pessoais: não é uma conta do dono do projeto, então a limpeza depende de quem a controla — o caminho simples é deletar e refazer o fork a partir do repositório já limpo.

Estado final: concluído — 8 commits aplicados (`049e460`, `27b7799`, `1dd9fb0`, `6156e89`, `a63b574`, `5f0dada` e os de documentação); RACE-02 e BUG-02 aguardando decisão do dono do projeto.

## Registro de Trabalho — 2026-08-10 — três bugs de campo: abrir arquivo no Windows, webview duplicado e "Organizar" instável

PEDIDO: três relatos de uso, investigados e corrigidos em sequência — arquivos `.py` que "não abrem nem interagem" no Windows, páginas web abrindo duas vezes (áudio sempre duplicado) e o botão **Organizar** que "às vezes funciona, às vezes só chega os elementos mais perto".

FEITO: **os três eram bugs distintos e nenhum estava no lugar onde o sintoma aparecia.**

*Abrir arquivo no Windows.* O PTY montava `cmd.exe /d /s /c py script.py`, e `/c` encerra o shell junto com o comando — quando o script terminava (ou falhava na primeira linha), o painel morria antes de o usuário ler qualquer coisa. Pior: um `.py` que quebra na importação sai em ~50 ms com código ≠ 0, caindo no `allowEmergencyShellFallback`, que re-spawnava um shell limpo em `os.homedir()` e **descartava o traceback** — daí o relato ser sempre "não abre", nunca o erro real. Quatro correções: `keepShellOpen` faz o Windows usar `/k` e o POSIX devolver um shell interativo em vez de `exec`; sessões "rodar arquivo" saem da retentativa que remove argumentos (para `py script.py` o argumento *é* o trabalho, e removê-lo abria um REPL que ninguém pediu); o `outputBuffer` do processo morto é reproduzido antes de qualquer fallback; e `py` ganhou fallback para `python`, já que o launcher só existe em instalações python.org — Microsoft Store e conda trazem apenas `python`.

*Página web duplicada.* O guard contra webview duplicado consultava `webviewRef.current?.isConnected`, mas o cleanup do ref callback fazia `webviewRef.current = null` **sem remover o elemento do DOM**. Sob `<StrictMode>` (mount → cleanup → mount), o segundo mount lia `null`, o guard não segurava e um segundo `<webview>` era criado sobre o primeiro — ambos vivos, ambos carregando a URL, ambos com áudio. O cleanup passou a remover o elemento; órfãos de montagens anteriores são limpos antes de criar o novo. Duas correções vieram a reboque: o efeito de listeners dependia só de `[id]` e, como refs rodam antes de efeitos, na remontagem lia um ref já anulado e deixava o webview **sem nenhum listener** (sem título, sem persistência de URL, sem back/forward) — passou a depender do elemento via state; e como recriar o guest recarregava `initialUrl`, um `currentUrlRef` acompanha a navegação para a remontagem não rebobinar a página.

*"Organizar" instável.* A âncora da matriz vinha de `placementOrigin(viewport)`, isto é, do canto visível da tela: com o canvas rolado 300px, o destino mudava 300px. Somava-se um fallback silencioso de três níveis — numa tela 1366x768 uma matriz de 4 terminais precisa de 1072x752 contra 1286x640 de área útil, então **nunca** cabia e o resultado era sempre o fallback que empilha os blocos (o "só chega mais perto"); em monitor maior, cabia. O zoom entrava na conta pelo mesmo caminho. O viewport saiu inteiramente do cálculo: a matriz agora ancora no bloco que já está mais ao topo-esquerda, e `fitBounds` enquadra o resultado depois de posicionar. Por decisão do dono do projeto, o escopo passou de "agentes conhecidos" para todos os blocos de topo (grupos entram inteiros, filhos de grupo continuam de fora porque suas coordenadas são relativas ao pai), com célula única dimensionada pelo maior bloco; e blocos ligados por arestas ficam em células vizinhas, via union-find sobre as arestas, com uma regra que impede um componente de ser partido entre duas linhas quando ainda caberia inteiro na seguinte.

CONVENÇÃO/ARQUITETURA: `agent-matrix-layout.ts` foi dividido em três módulos coesos e renomeado, porque o nome passou a mentir sobre o conteúdo (não organiza mais agentes) e o arquivo acumulava três responsabilidades: `node-connectivity.ts` (grafo puro — union-find e ordem de leitura), `matrix-grid.ts` (geometria da grade — célula, âncora, slots, bounds) e `canvas-matrix-layout.ts` (orquestração). As props `onOrganizeAgents`/`agentCount` viraram `onOrganizeBlocks`/`arrangeableCount`, alinhando o contrato da toolbar ao comportamento real.

TESTE: 276 testes de frontend (44 novos: 10 de layout, 12 de grade, 11 de conectividade, 11 de montagem de webview) e 514 do backend, todos passando; `tsc -b`, build do Vite, ESLint e `git diff --check` limpos com Node 25.9.0. Os casos-limite do layout foram verificados à parte (blocos exatamente sobrepostos, coordenadas negativas, bloco sem tamanho medido) e nenhum quebra a âncora.

RISCO RESIDUAL: nada foi validado com o app rodando — o ambiente de testes é `environment: 'node'`, sem DOM, então `fitBounds` está garantido por tipo e pela API do React Flow, não por execução. Três conferências manuais valem a pena: rodar um `.py` no Windows real (o `/k` e o exit 9009 vêm do comportamento documentado do `cmd.exe`), abrir um bloco de Página Web com vídeo e confirmar um único áudio, e clicar em **Organizar** com o canvas rolado para longe. Duas consequências de escopo ficam registradas: `keepShellOpen` é persistido no node, então blocos de "rodar arquivo" criados antes desta mudança continuam fechando ao terminar; e notas e páginas web agora **se movem** ao organizar — quem usa nota como rótulo fixo ao lado de um bloco vai vê-la entrar na grade. Fixar blocos individualmente é uma ideia natural para quem quiser contribuir.

Estado final: concluído — pendente de conferência manual nos três pontos acima.

## Registro de Trabalho — 2026-08-10 (parte 2) — `/resume` digitado mas não enviado

PEDIDO: ao reiniciar o app, nem sempre o `/resume` é enviado ao agente restaurado — "às vezes ele só escreve".

FEITO: o prompt inicial é entregue em duas escritas no PTY: o texto e, 75 ms depois, o Enter. A separação existe por um motivo real (CLIs de tela cheia tratam um CR colado junto com o texto como quebra de linha), mas os 75 ms são um valor fixo e a única guarda antes de enviar a tecla era `!session.disposed` — nada confirmava que o TUI havia consumido o texto. Quando a interface ainda está redesenhando, o Enter se perde e o `/resume` fica parado na linha de entrada. O `INITIAL_TEXT_MAX_WAIT_MS` de 10 s agrava: se a CLI demora mais que isso para ficar pronta, o texto é digitado com a interface ainda inicializando.

A correção troca o palpite de relógio por verificação de estado. Novo módulo `terminal/terminal-submission.ts` com `isSubmissionPending(viewport, text)`, que inspeciona **apenas a linha de entrada** do viewport — depois de uma submissão bem-sucedida a CLI limpa essa linha, e o texto que reaparece acima é histórico da conversa, não pendência. Se o texto ainda estiver lá, o Enter é reenviado, até 3 vezes com 600 ms de intervalo (`SUBMIT_RETRY_LIMIT`/`SUBMIT_RETRY_DELAY_MS`). Reenviar é seguro exatamente porque só ocorre enquanto a linha continua preenchida: se a CLI já submeteu, nada é enviado. O timer novo (`submitRetryTimer`) é limpo em `remove()`, junto dos demais.

O relato do dono do projeto direcionou o diagnóstico e evitou uma correção errada: escolhido "texto escrito e parado, esperando Enter" (e não truncado/embaralhado), o problema ficou isolado na entrega da tecla, não no gate de prontidão — que continua intocado.

TESTE: `terminal-submission.test.ts` (12 casos: linha de entrada do Claude dentro da caixa e do Codex, linha limpa após submissão, prompt ecoado no histórico, cursor de bloco, espaçamento do TUI, dica após o texto, comando diferente, texto vazio, instrução multilinha, viewport sem prompt). **Um teste reprovou a primeira implementação e apontou um defeito real:** o regex exigia o marcador no início da linha, então `│ > /resume` — exatamente o formato do Claude Code, onde a falha foi relatada — não era reconhecido; o padrão passou a aceitar as bordas de caixa que CLIs de tela cheia desenham.

VALIDAÇÃO: 288 testes de frontend, `tsc -b`, build do Vite e ESLint limpos com Node 25.9.0.

RISCO RESIDUAL: não validado com o app rodando — a suíte é `environment: 'node'`, sem DOM nem PTY real, então a detecção foi verificada contra viewports representativos, não contra a saída real das CLIs. A conferência manual é reiniciar o app com um agente Claude salvo e confirmar que o `/resume` é submetido sozinho. Se alguma CLI desenhar a entrada num formato não coberto por `PROMPT_LINE`, a reconferência simplesmente não dispara e o comportamento volta a ser o de antes — degrada para o estado atual, não para pior. Os 75 ms iniciais e o limite de 10 s de espera seguem como estavam: mexer neles é outra decisão, e não era necessária para este defeito.

Estado final: concluído — pendente de conferência manual em reinício real.

## Registro de Trabalho — 2026-08-10 (parte 3) — padrão de qualidade sobre a correção do `/resume`

PEDIDO: aplicar o padrão de qualidade ao trabalho da parte 2.

FEITO: auditoria do `terminal-session-store.ts` contra o item 2 do guia mínimo ("arquivos faz-tudo devem ser tratados como sinal de refatoração"). O arquivo tinha 934 linhas e três responsabilidades sobrepostas: ciclo de vida da sessão (a razão de existir da classe), leitura do buffer renderizado do xterm e interpretação do que a tela mostra. Os dois últimos blocos eram funções puras, sem acesso à classe, e **nenhum tinha teste** — apesar de decidirem se um agente aparece como ocupado, ocioso ou esperando aprovação.

Extraídos dois módulos, na mesma convenção dos demais arquivos de `terminal/` e `services/` (um assunto por arquivo):

- `terminal-buffer-reader.ts` — `readViewport`, `readBuffer`, `readTerminalTail`, `computePreview`, `computeSignature`. Recebe um terminal, devolve texto; não conhece sessão.
- `terminal-screen-state.ts` — `cleanPrompt`, `isBusyScreen`, `looksLikeApprovalPrompt`, `hasCodexInteractivePrompt`, `isCodexTrustPrompt`. Heurísticas sobre texto renderizado; não conhece xterm.

O store caiu para 790 linhas e passou a importar ambos. `BUSY_INDICATOR`, que era testado direto como regex, virou a função `isBusyScreen` — a constante deixou de vazar para fora do módulo que a define. `getInitialTextDelay` ficou no store por depender de `Session`.

TESTE: 29 casos novos (12 para o leitor de buffer, 17 para o reconhecimento de tela), cobrindo o que antes não tinha nenhum: a assinatura que colapsa spinner e contador de tempo mas muda quando há saída real, a rejeição de lista numerada sem pergunta de confirmação, o rodapé fixo da CLI fora da pré-visualização, e o diálogo de confiança do Codex sob ANSI. O leitor usa um `Terminal` mínimo dublado, já que a suíte roda em `environment: 'node'`, sem DOM. Total: 317 testes de frontend e 514 do backend.

VALIDAÇÃO: `tsc -b`, build do Vite, ESLint e `git diff --check` limpos com Node 25.9.0. Dois defeitos apareceram durante a validação e foram corrigidos: o ESLint apontou que a anotação `no-control-regex` do `ANSI_ESCAPE` não veio junto na extração, e um teste meu comparava `'antigo\novo'`, onde o `\n` consumia a letra da palavra seguinte — erro do teste, não do código.

RISCO RESIDUAL: a extração é mecânica e o comportamento não mudou, mas as heurísticas de tela seguem sendo heurísticas: reconhecem os formatos atuais das CLIs e podem precisar de ajuste quando elas mudarem o desenho. Agora, ao menos, cada formato reconhecido está registrado como teste, então uma mudança de formato falha visivelmente em vez de degradar em silêncio. A conferência manual do `/resume` (parte 2) continua pendente.

Estado final: concluído.

## Registro de Trabalho — 2026-08-10 (parte 4) — guias específicos: risco de submeter texto do usuário

PEDIDO: seguir os guias do padrão de qualidade, não só o guia mínimo.

FEITO: leitura de `docs/CORE-PADROES-OBRIGATORIOS.md`, `core/DESIGN_SYSTEM_BACKEND.md` e do índice de `guias/`. Os guias de `guias/frontend|backend|integracao/` tratam de features específicas (heatmap, calendário, scraping, deploy) e nenhum se aplica a este trabalho; o `DESIGN_SYSTEM_FRONTEND.md` é identidade visual, também fora de escopo. O contrato aplicável é a seção 8 do design system de backend — pirâmide de testes, TDD e "o que não pode ficar sem teste" — mais o checklist da seção 11.

A auditoria por esse critério encontrou **uma falha de segurança no código que eu mesmo tinha escrito na parte 2**. O item 8.3 exige teste para "fluxos destrutivos ou irreversíveis", e a reconferência de submissão era exatamente isso sem estar coberta: `isSubmissionPending` usava `startsWith`, então se o usuário começasse a digitar durante a janela de retentativa (até ~1,8 s) e sua frase começasse com o texto que enviamos, a função reportava "pendente" e um Enter era disparado — **submetendo a linha inacabada dele**, sem confirmação, para um agente que pode agir de forma irreversível.

Seguindo o fluxo de TDD da seção 8.2, o teste veio primeiro e reprovou a implementação existente. A correção troca `startsWith` por igualdade: se a linha contém mais do que enviamos, alguém está digitando nela e nada é reenviado. Dicas que o próprio TUI desenha ("enter to send") continuam toleradas porque ficam depois de um espaçamento largo até a borda da caixa, recortado antes da comparação — diferente de digitação contínua, que segue um espaço simples. Casos ambíguos resolvem como "não pendente", ou seja, deixam de reenviar o Enter em vez de arriscar submeter rascunho alheio: a falha segura é o `/resume` não ser enviado, que é o bug original, e não uma ação que ninguém pediu.

Um segundo teste caiu junto no caminho e expôs que meu limiar inicial de espaçamento (3) recortaria instrução legítima com quebra de linha; passou para 5, acima do que o reflow de texto produz entre palavras. Dois testes que eu havia escrito para o mesmo comportamento com espaçamentos diferentes foram consolidados em um, com o critério explicitado no comentário.

TESTE: 318 testes de frontend (13 no módulo de submissão, incluindo o novo caso de segurança) e 514 do backend. `tsc -b`, build do Vite, ESLint e `git diff --check` limpos com Node 25.9.0.

RISCO RESIDUAL: a separação entre "dica do TUI" e "usuário digitando" é heurística de espaçamento e pode errar em uma CLI que alinhe dicas com menos de cinco espaços — nesse caso a reconferência simplesmente não dispara, degradando para o comportamento anterior à correção, nunca para envio indevido. O primeiro Enter (75 ms após o texto) continua sem essa verificação de propósito: ali acabamos de escrever e o usuário não teve janela para digitar; é o comportamento original, preservado. A conferência manual em reinício real segue pendente.

Estado final: concluído.

## Registro de Trabalho — 2026-08-10 (parte 5) — abrir o terminal marca a notificação como lida

PEDIDO: tarefa do Notion "Bug: clicar no terminal com notificação ativa não marca como 'lida'". Com vários terminais no canvas, a notificação continuava ativa depois de eu visitar o agente, então o badge deixava de dizer quais realmente ainda precisam de mim.

CAUSA: "ler" era um efeito colateral escrito à mão dentro do painel de notificações. Só o `onDismiss` do `NotificationsPanel` marcava lida — e ele existia apenas no clique do item da lista. Os outros dois caminhos de abertura (clique no card do terminal no canvas e clique na linha do dock de terminais) chamavam `setExpandedTerminalId` direto, abrindo o agente sem tocar no histórico. Abrir e ler eram a mesma ação para o usuário e duas coisas diferentes no código.

FEITO: `CanvasView` ganhou um `openTerminal` que é o único caminho de abertura — ele abre a gaveta, registra o `lastPrompt` do turno como reconhecido e marca as pendências daquele nó como lidas. Os três pontos que abriam terminal (`onExpand` do bloco, `onExpandNode` do dock, `onExpandNode` do painel) passam por ele. O `onDismiss` do painel virou código morto e foi removido junto com o prop: abrir já é ler, em qualquer caminho.

O reconhecimento em si (guardar o `lastPrompt` + soltar o nó do conjunto de notificações ativas) estava copiado em quatro handlers do painel e virou `acknowledgeNodeNotifications`. Ele lê o snapshot pelo `store.getSnapshot`, não pelo `sessionSnapshots` renderizado — assim o callback é estável e pode ser injetado nos dados dos blocos sem que cada tecla digitada por um agente invalide os nós todos (o `reuseData` não observa esse campo, e uma closure recriada a cada snapshot guardaria prompt velho).

Em `canvas-notifications.ts`, as três funções de marcar como lida eram o mesmo `map` repetido; foram reduzidas a um `markRead(history, alvo, now)` compartilhado que **devolve o próprio histórico quando nada muda**. Isso deixou de ser detalhe quando marcar virou parte de abrir: sem preservar a identidade, todo clique num terminal regravaria o histórico no `localStorage` e re-renderizaria o painel sem nenhuma mudança real.

TESTE: caso novo cobrindo a estabilidade de referência das três funções (marcar de novo o que já está lido, marcar um nó sem pendência, marcar tudo) — é a garantia do clique barato. 319 testes de frontend.

VALIDAÇÃO: `tsc -b`, build do Vite, ESLint e `git diff --check` limpos.

RISCO RESIDUAL: se a gaveta já estiver aberta quando o agente fizer um pedido novo, a notificação dispara mesmo com o terminal à vista — decisão deliberada: o usuário pode ter aberto e saído de perto, e deixar de avisar um pedido real é pior que um badge a mais. Um novo pedido depois da visita volta a notificar normalmente porque o reconhecimento é amarrado ao `lastPrompt` do turno, e um prompt novo é turno novo. Não validado com o app rodando: a suíte é `environment: 'node'`, sem DOM; a conferência manual é deixar um agente ocioso, clicar no card dele no canvas e ver o contador do sino cair na hora.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-11 (parte 3) — execução de `.PY` no macOS

IDENTIDADE: Bug: Não estou conseguindo rodar arquivos no canvas pelo MAC.
PEDIDO: arquivo com extensão `.PY` não abria no terminal na versão macOS.

CAUSA PROVÁVEL: o compositor de execução gerava `env python3 arquivo.PY` para todos os sistemas POSIX. O PTY do macOS já envolve comandos explícitos no shell de login (`zsh -l -i -c`), portanto a camada extra de `env` não era necessária e tornava o caminho diferente dos demais interpretadores.

FEITO: `.py`/`.PY` agora gera `python3 arquivo` diretamente. A resolução continua sendo feita pelo shell de login do macOS, preservando o PATH carregado pelo ambiente do usuário.

TESTE: adicionada regressão explícita para `.PY` em `darwin`; teste existente de `.py` atualizado para o contrato direto `python3`.

DOC: adicionadas orientações de Python 3 no macOS em `docs/projeto/RODAR-VIA-CODIGO-FONTE.md` e `docs/guias/GUIA-USUARIO.md`.

VALIDAÇÃO: pendente nesta máquina Linux — precisa ser executado no macOS com Python 3 instalado e um arquivo `.PY` real.

Estado final: concluído — aguardando conferência manual no macOS.

## Registro de Trabalho — 2026-08-10 (parte 6) — injetar contexto deixou de ser o mesmo que enviar prompt

PEDIDO: tarefa do Notion "Bug: prompt inicial sendo enviado automaticamente". Para alguns agentes, o prompt de contexto — aquele que só prepara o agente — era submetido assim que o terminal subia. O usuário perdia a janela para escrever o pedido real e o agente saía caçando uma tarefa inexistente dentro do texto de contexto, gastando token e produzindo trabalho fora do escopo.

CAUSA: a intenção de executar estava embutida no próprio texto. `composeTerminalInitialText` e `buildCanvasTerminalInitialText` terminavam chamando `toSubmittedTerminalText`, ou seja, todo prompt inicial nascia com o Enter colado nele; o store só obedecia. Não havia, em lugar nenhum, a distinção entre "isto é contexto" e "isto é um pedido".

A divergência entre agentes que o relato descreve era acidental, e a parte 2 desta mesma data a eliminou na direção errada: antes, quando o TUI comia o Enter, o texto ficava parado na linha de entrada e o agente não executava — que é justamente o comportamento desejado, acontecendo por acaso. A confirmação de envio adicionada na parte 2 tornou o disparo confiável para todos, e com isso o defeito de regra deixou de ser intermitente e apareceu inteiro.

FEITO: a quebra de linha final passou a ser o portador explícito da intenção, do compositor até o PTY. `splitTerminalSubmission` devolve `submit: null` quando o prompt não termina em quebra, e o store, nesse caso, escreve o texto e para por aí — sem Enter e sem confirmação de envio, porque não há envio a confirmar. Ganhou companhia de `isSubmittedTerminalText` e `stripTerminalSubmission`, que dão nome à mesma regra nos dois sentidos.

Com isso o contexto permanente (padrão de qualidade + contexto do canvas + identidade + arquivos .md ligados + arquivo de planejamento) sai como texto puro: é digitado na entrada da CLI e fica esperando o usuário escrever a tarefa depois dele. O contexto continua chegando ao agente — chega junto com o pedido, numa mensagem só.

Dois caminhos continuam submetendo, e é decisão consciente, não sobra: o `/resume` de um agente restaurado é um comando cuja razão de existir é rodar (deixá-lo digitado e parado é exatamente o defeito corrigido na parte 2), e a passagem de responsabilidade carrega um pedido que alguém despachou de propósito para aquele terminal. A regra que ficou é "submete quem carrega uma instrução de verdade", e `buildCanvasTerminalInitialText` a aplica propagando a intenção do prompt que recebe, em vez de decidir por conta.

Um detalhe de dados entrou junto: `handoffText` é transitório e pode vir submetido, mas `initialText` é persistido e é sempre contexto. Blocos salvos antes desta mudança guardaram o contexto já com o Enter no fim, então a leitura do dado persistido recorta a quebra final — sem isso, um canvas antigo voltaria a executar sozinho ao reabrir, e o defeito sobreviveria à correção.

TESTE: 325 testes de frontend. Os novos cobrem a regra nos dois lados: contexto permanente não sai submetido (o mesmo caminho serve claude, codex e gemini — a divergência por agente não existe mais para checar uma a uma), passagem de responsabilidade e `/resume` continuam submetidos, terminal comum não ganha envio que nunca teve, e o formato antigo persistido é desarmado na leitura.

VALIDAÇÃO: `tsc -b`, build do Vite, ESLint e `git diff --check` limpos.

RISCO RESIDUAL: `/resume` e passagem de responsabilidade seguem disparando sozinhos — é a leitura que fizemos do pedido ("o prompt inicial de contexto"), e não a leitura literal do critério "nenhum agente envia sozinho o prompt inicial"; se a intenção era incluir esses dois, o lugar de mexer é a mesma linha, e vale como decisão do dono do projeto. Não validado com o app rodando: a suíte é `environment: 'node'`, sem PTY. A conferência manual é abrir um agente novo de cada tipo e ver o contexto parado na entrada, esperando; depois reiniciar o app com um agente salvo e confirmar que o `/resume` continua sendo enviado sozinho.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-10 (parte 7) — passar responsabilidade refeito como ação, não como reação

PEDIDO: tarefa do Notion "Refazer a feature de passar responsabilidade entre agentes (está bugada)". O relato listava cinco sintomas: a detecção de limite de uso quase nunca funciona, o botão pisca (aparece e some), clicar não faz nada além de o terminal piscar, só funciona Claude → Codex, e passa só o texto visível na tela.

CAUSA COMUM: a feature tinha sido construída como **reação a um estado detectado** em vez de **ação do usuário**. Disso saem quatro dos cinco sintomas de uma vez. O botão só existia quando `snapshot.usageLimit` estava preenchido **e** a atividade era `idle`/`exited`/`error`; como a atividade oscila a cada redesenho da CLI, a condição ligava e desligava sozinha — daí o piscar. E como `detectTerminalUsageLimit` era uma lista de expressões regulares contra o texto da tela, o gatilho quase nunca chegava.

FEITO: a passagem virou item fixo da topbar do terminal, sempre clicável, que abre a escolha do agente que vai assumir.

O ponto que decidiu o desenho: a escolha do destino era um **rodízio fixo** (`getNextHandoffAgent`) entre as CLIs conhecidas. Não era só a limitação "Claude → Codex" que o relato aponta — era não perguntar nada: nem modelo, nem esforço, nem projeto, nem nome. Só que o canvas já tem uma tela que pergunta tudo isso, no `TerminalMenu`. Ela estava soldada ao flyout da toolbar, então o único jeito de reusá-la era separá-la:

- `hooks/useAgentConfig.ts` — o estado de "como abrir um agente" (CLI, modelo, esforço, yolo, projeto, nome, arquivo de planejamento), o catálogo de modelos e a tradução disso em opções de terminal.
- `components/AgentConfigFields.tsx` — os campos, sem opinião sobre onde aparecem.
- `services/new-terminal-options.ts` — o tipo compartilhado, que antes morava dentro do componente de menu.

Com isso o `TerminalMenu` ficou só com o que é dele (o flyout e a fila de configurações) e o novo `HandoffDialog` oferece exatamente as mesmas opções. `getNextHandoffAgent` foi removido: qualquer agente, qualquer direção, escolhido por quem está olhando.

O histórico já vinha do buffer inteiro do xterm (`readBuffer`, 20 mil linhas de rolagem), não do viewport — o sintoma "passa só o que está na tela" era, na verdade, o corte: quando o transcript passava do orçamento, `prepareHandoffTranscript` **descartava o começo** e mandava só o fim. Isso entrega um agente que sabe *como* o outro estava mexendo no código e não faz ideia de *para quê*, porque o pedido original está no começo da conversa. Agora o corte preserva as duas pontas e anuncia o buraco no meio. O buffer do processo principal foi considerado e descartado como fonte: ele guarda 200 mil caracteres de bytes crus com ANSI, menos e pior do que as 20 mil linhas já renderizadas.

O prompt de handoff também parou de afirmar que o agente anterior bateu no limite de uso. A passagem agora acontece quando o usuário quiser; dizer o motivo seria inventá-lo.

REMOVIDO: `terminal-usage-limit.ts` e todo o rastro dele — o campo `usageLimit` do snapshot, a checagem por regex a cada chegada de saída (que rodava no caminho quente do `onOutput`), o rótulo "limite de uso atingido" no bloco e na gaveta, o ponto âmbar do trilho e a mensagem correspondente no painel de notificações.

CONVERSA COM A PARTE 6: o `handoffText` continua submetido, e isso é coerente com a correção de hoje mais cedo — contexto permanente é digitado e espera, mas uma passagem de responsabilidade carrega um pedido de verdade, despachado de propósito para aquele terminal. É a mesma regra ("submete quem carrega uma instrução"), aplicada aos dois casos.

TESTE: 323 testes de frontend. Os novos cobrem o corte que preserva as duas pontas (com marca explícita do trecho omitido), o transcript que cabe e não é tocado, e o prompt que não afirma mais o motivo da parada.

VALIDAÇÃO: `tsc -b`, build do Vite, ESLint e `git diff --check` limpos.

RISCO RESIDUAL: "todo o histórico" tem um teto real — 20 mil linhas de rolagem do xterm, e 160 mil caracteres no que é colado. Uma sessão muito longa perde o meio, com aviso, e o começo mais antigo que 20 mil linhas não existe mais no renderer. Não validado com o app rodando: a suíte é `environment: 'node'`, sem PTY nem DOM. A conferência manual é abrir dois agentes de CLIs diferentes, passar responsabilidade em cada direção e perguntar ao que recebeu o que o anterior estava fazendo. O sintoma "o terminal fica piscando sem parar depois de clicar" não pôde ser reproduzido aqui; ele vinha do caminho condicional que deixou de existir, mas isso é dedução, não observação.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-11 (parte 1) — campo de nome do menu de agente travando

PEDIDO: relato de campo — o input "Nome (opcional)" do menu de configuração de agente (toolbar e diálogo de handoff) às vezes fica travado, sem receber clique nem digitação, resolvendo sozinho ao fechar e reabrir o menu.

CAUSA: o campo fica dentro do flyout do menu de ferramentas, posicionado por `useToolbarFlyoutPosition` (`toolbar-flyout.ts`). O `useLayoutEffect` lia o elemento âncora (`containerRef?.current ?? panelRef.current?.parentElement`) uma única vez por abertura; se o ref ainda não estivesse anexado nesse frame exato — reabrir o menu rápido, enquanto ele ainda remonta — o efeito retornava sem agendar nova tentativa nem registrar listeners. O painel ficava preso na classe `invisible` (`visibility: hidden`), que torna todo o conteúdo, inclusive o input, não clicável e não focável — sem nenhum `disabled` visível no DOM, o que tornava o sintoma difícil de diagnosticar pelo DevTools. Nada além de fechar e reabrir o menu (que reseta `open`) fazia o efeito rodar de novo.

FEITO: o efeito agora tenta de novo via `requestAnimationFrame` (`waitForContainer`) até o container existir, e só então anexa os listeners de posicionamento (resize/scroll/`ResizeObserver`). O cleanup passou a cancelar tanto o frame de espera quanto os listeners.

TESTE: sem caso novo — `toolbar-flyout.ts` não tinha suíte própria antes desta mudança (é DOM-dependente: mede `getBoundingClientRect`/`ResizeObserver`, e a suíte de frontend roda em `environment: 'node'`).

VALIDAÇÃO: `npm run build` (`tsc -b` + `vite build`), suíte de frontend e `npm run lint` limpos.

RISCO RESIDUAL: não conferido com o app rodando — a verificação ficou restrita a build/lint, sem PTY nem DOM real. A conferência manual é abrir o menu de agente repetidamente e rápido (o caso que mais provocava o travamento) e confirmar que o campo de nome nunca mais fica preso.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-11 (parte 2) — prompt inicial do Claude Code não chegava sempre

PEDIDO: "não é sempre que o Claude Code recebe o prompt inicial de contexto, mas não sei dizer o por quê".

INVESTIGAÇÃO DESCARTADA: o candidato óbvio — uma condição de corrida no gate `initialTextReady` entre `TerminalNode` e o memo de nodes do `CanvasView` — foi verificado linha a linha e descartado. O design já é sólido: a captura de agentes restaurados e a hidratação de edges bloqueiam corretamente `store.ensure()` até estarem prontas (`restoredAgentTerminalIdsCapturedRef`), e o efeito reage certo quando o valor muda de `false` para `true`, porque `nodeData.initialTextReady` está nas deps. Registrado aqui para não repetir a mesma investigação depois.

CAUSA REAL: específica de Claude em modo yolo (`--dangerously-skip-permissions`), que mostra uma tela de confiança ("Do you trust the files in this folder?") em todo processo novo. O código aceitava essa tela às cegas, num `setTimeout` fixo de 800 ms, sem checar se ela realmente tinha renderizado. Em seguida, a heurística de "processo pronto" que decide quando escrever o texto de contexto (`scheduleInitialText`) olhava só se a tela estava quieta por 500 ms — sem diferenciar se essa quietude era o prompt real ou ainda a tela de aceite (o Codex tem essa diferenciação via `hasCodexInteractivePrompt`; Claude não tinha equivalente). Em boots mais lentos, a tela de confiança ficava "quieta" antes de ser de fato aceita, e o texto de contexto era escrito nela — perdido, sem log nem confirmação, porque texto sem Enter (contexto puro, ver parte 6 de 2026-08-10) nunca teve reconferência de envio.

O Codex já tinha esse mesmo problema resolvido corretamente: `handleCodexTrustPrompt` observa o próprio stream de saída até reconhecer o texto da tela de confiança, só então aceita e reagenda o texto inicial. Claude usava o esquema antigo (delay às cegas) ao lado do esquema novo do Codex, no mesmo arquivo.

FEITO: portado o padrão do Codex para o Claude. `isClaudeTrustPrompt` (`terminal-screen-state.ts`) reconhece a tela por texto normalizado, tolerante a variação de redação entre versões da CLI. `handleClaudeTrustPrompt` (`terminal-session-store.ts`) acumula a saída do processo e só aceita a tela quando `isClaudeTrustPrompt` confirma que ela apareceu de verdade; só então agenda o Enter (150 ms depois) e reagenda o texto de contexto (`CLAUDE_POST_TRUST_INITIAL_TEXT_DELAY_MS`, 2500 ms). A checagem de "processo pronto" em `scheduleInitialText` também passou a recusar escrever enquanto a tela de confiança ainda estiver visível (`claudeTrustPromptShowing`, olhando a tela atual, não uma flag) — cobre o caso raro de a pasta já vir confiada nesta sessão (a tela nunca aparece), sem introduzir espera nova nesse caminho. O delay fixo de 800 ms e a constante `CLAUDE_INITIAL_TEXT_DELAY_MS` saíram; o fallback absoluto de 10 s (`INITIAL_TEXT_MAX_WAIT_MS`) continua como rede de segurança se a tela de confiança nunca for reconhecida.

TESTE: 5 casos novos em `terminal-screen-state.test.ts` para `isClaudeTrustPrompt` (pergunta direta, variante por frases separadas, ANSI, não confundir com aprovação genérica nem com o texto do Codex). Sem caso novo para `handleClaudeTrustPrompt`/`scheduleInitialText` — `terminal-session-store.ts` não tem suíte própria (é PTY-dependente), mesma lacuna já registrada nas partes 3–4 de 2026-08-10 para o restante do arquivo.

VALIDAÇÃO: `npm run build`, `npx vitest run` (328/328) e `npm run lint` limpos.

RISCO RESIDUAL: não conferido com o app rodando — sem PTY real, a heurística de texto foi verificada contra telas representativas, não contra a saída real da CLI, e a redação exata da tela de confiança do Claude pode mudar entre versões (mesma limitação já aceita para `isCodexTrustPrompt`). O gap de "texto de contexto sem confirmação de que chegou" (fire-and-forget, ver parte 6 de 2026-08-10) segue existindo para qualquer CLI — não foi endereçado aqui porque a causa raiz confirmada era a tela de confiança do Claude, não a ausência geral de confirmação. A conferência manual é abrir um terminal Claude yolo em boot mais lento (ou simular) e confirmar que o texto de contexto chega mesmo quando a tela de confiança demora a aparecer.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-11 (parte 3) — prompt inicial do Claude Code não chegava mais

PEDIDO: "o Claude não está mais recebendo o prompt inicial de contexto".

MÉTODO: diferente das rodadas anteriores, a investigação foi feita contra a CLI de verdade. Um PTY real com `claude --dangerously-skip-permissions`, a saída interpretada por um emulador de terminal (pyte, para não confundir cursor-forward com espaço — dois falsos negativos meus vieram de recortar ANSI na mão), e o próprio store rodando sob vitest com uma ponte PTY falsa alimentada com o stream capturado. Todas as afirmações abaixo são observações, não deduções.

CORREÇÃO DA PARTE 2: o diagnóstico da rodada anterior estava errado, e o próprio registro dela já avisava que não tinha sido conferido com PTY real. Em modo yolo o Claude **não** mostra a tela de confiança na pasta — verificado abrindo um repositório com `hasTrustDialogAccepted: false`, onde ela não aparece, justamente porque o modo já dispensa aprovação. O que aparece em todo processo novo é outra tela:

    WARNING: Claude Code running in Bypass Permissions mode
    ❯ 1. No, exit
      2. Yes, I accept

`isClaudeTrustPrompt` exigia "trust" + "this folder", que essa tela não tem, então `handleClaudeTrustPrompt` nunca disparava: a parte 2 removeu o aceite cego que existia e o substituiu por um detector que nunca casa. O aviso ficava na tela, e o texto de contexto era digitado dentro dele.

CAUSA REAL, dois defeitos somados:

1. `\x1b[B\r` numa única escrita não aceita o aviso. Verificado 4 vezes (2 com as teclas juntas, 2 separadas): juntas, o aviso fica intocado na tela; separadas por uma pausa, ele é aceito. É a mesma razão já documentada para separar o texto inicial do seu Enter — ou seja, o aceite automático do modo yolo nunca funcionou de fato, nem antes da parte 2.

2. A checagem de "processo pronto" era vazia para o Claude. `receivedOutput` virava verdadeiro no primeiro byte, e os primeiros bytes de uma CLI de tela cheia são só sequências de escape, que não mudam a tela — então `lastMeaningfulAt` nunca era reiniciado e "quieto há 500 ms" já era verdade desde a criação da sessão. Medido com o stream real: a CLI desenha a interface em 2591 ms e o store escrevia o contexto em 2120 ms, antes de existir qualquer linha de entrada. O Codex tinha `hasCodexInteractivePrompt` para isso; o Claude não tinha equivalente.

Somados: o contexto era escrito cedo, numa tela que não era o REPL, e nada nunca conferia se ele havia chegado — o texto sem Enter (contexto puro, ver parte 6 de 2026-08-10) não tinha reconferência nenhuma. Daí o silêncio.

FEITO: a entrega deixou de ser cronometrada e passou a ser guiada pela tela, com confirmação.

- `hasClaudeInteractivePrompt` / `hasEmptyClaudeInput` (`terminal-screen-state.ts`): a linha de entrada do Claude existe / está vazia. A primeira pergunta só se o REPL subiu (tolerante: menu numerado não conta, porque aí a tela é um diálogo), a segunda é a que reconhece a sugestão `Try "..."` como entrada vazia. `hasCodexInputLine` faz o par equivalente para o Codex, distinguindo "ainda não subiu" de "já tem texto aqui".
- `readInputLineState(command, viewport)` reúne essas leituras numa tabela por CLI e devolve `{ ready, visible, empty }` — ou `undefined` para a CLI que não sabemos ler. O store consulta uma vez e não guarda mais nenhum `command === '...'` sobre telas; é aqui que uma CLI nova entra.
- `isClaudeBypassPermissionsWarning` substitui `isClaudeTrustPrompt`, com a redação real da tela.
- `scheduleInitialText` só escreve quando a linha de entrada da CLI está na tela; o teto para as CLIs que sabemos reconhecer subiu para 60 s (`INITIAL_TEXT_INPUT_WAIT_MS`), porque esperar entrega tarde e escrever cedo não entrega nunca. `paintedOutput` substitui `receivedOutput` na decisão: só conta como "a CLI começou" o que mudou a tela.
- `acceptClaudeBypassWarning` manda a seta e o Enter em escritas separadas (`KEY_SEQUENCE_DELAY_MS`) e reconfere pela tela: enquanto o aviso continuar visível, reenvia (até 3 vezes).
- `confirmContextDelivery` fecha o gap de fire-and-forget: 800 ms depois de escrever, se a linha de entrada estiver vazia, o contexto é reescrito (até 3 vezes, janela de 30 s). Só reescreve com a entrada visível e vazia — se o contexto está lá, se a entrada não apareceu ainda ou se alguém digitou (`inputTouched`), nada é escrito.
- `inputTouched` só é marcado por digitação de verdade: o `onData` do xterm carrega também as respostas do terminal às perguntas da CLI (atributos do dispositivo), que chegam como sequência de escape. Isso apareceu na bancada — a reconferência morria antes da primeira volta — e de passagem consertou o `[?1;2c` que essas respostas colavam no início do prompt registrado no card.

DOC: `GUIA-USUARIO.md` ganhou o comportamento observável que faltava desde a parte 6 de 2026-08-10 — o contexto é digitado sem Enter e espera o pedido do usuário; agora também que ele só é digitado quando a entrada da CLI está pronta, e que o aviso do modo yolo é respondido pelo app.

TESTE: `terminal-session-store.test.ts`, novo — o arquivo nunca teve suíte por depender de PTY, mas o que decide a entrega é a tela, não o PTY. Os testes alimentam o xterm do próprio store com o stream capturado da CLI real (preâmbulo de escapes, aviso do modo yolo, REPL pronto) e olham o que o store escreve: não escreve com só escapes na tela, não escreve dentro do aviso, aceita o aviso em duas escritas na ordem certa, reenvia o aceite enquanto o aviso persistir, escreve quando a entrada aparece, reescreve se a entrada continuar vazia e não reescreve quando o contexto está lá. Em `terminal-screen-state.test.ts`, as telas reais (aviso e REPL pronto) entraram como fixtures, incluindo o caso que mais importa: o rodapé do REPL pronto também diz "bypass permissions on" e não pode ser confundido com o aviso.

VALIDAÇÃO: `npm run build`, `npx vitest run` (348/348) e `npm run lint` limpos. Além disso, o algoritmo do fix foi executado contra um `claude` real, nos dois caminhos: com a tela de aviso (reconhecida em 2018 ms, aceita em 2368 ms, contexto escrito em 4913 ms e confirmado na entrada em 5716 ms) e sem ela (contexto escrito em 2026 ms, confirmado em 2855 ms). Nos dois, o contexto termina digitado na entrada, esperando o pedido do usuário.

RISCO RESIDUAL: não conferido com o app Electron rodando — a validação foi com PTY real, mas fora do app. O aviso do modo yolo só aparece uma vez por máquina: aceitá-lo faz a própria CLI gravar `skipDangerousModePermissionPrompt: true` no `settings.json` do usuário, então esse caminho não é reproduzível de novo sem uma configuração isolada (foi assim que ele foi testado aqui). A redação das telas pode mudar entre versões: se `hasClaudeInteractivePrompt` deixar de reconhecer a entrada, a escrita cai no teto de 60 s em vez de nunca acontecer; se a sugestão `Try "..."` mudar, a reconferência deixa de reescrever, que é o comportamento antigo. Gemini e CLIs sem detector continuam no esquema de silêncio + fallback de 10 s, sem reconferência de entrega.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-12 — colar imagem no terminal do agente (Colar imagnes é dificil no terminal)

PROBLEMA: colar imagem num terminal de agente não funcionava de forma previsível. Cada sistema operacional, terminal e CLI tem um atalho diferente, e no Linux Mint o "Copiar para a área de transferência" da ferramenta nativa de captura não chegava na CLI.

CAUSA: um terminal é um cano de texto — ele não transporta bytes de imagem. As CLIs de agente contornam isso lendo a área de transferência por conta própria, o que no Linux significa chamar `xclip` (X11) ou `wl-paste` (Wayland). Nenhum dos dois vinha instalado na máquina de teste (`xclip`, `xsel`, `wl-paste` e `pngpaste` todos ausentes), então o `Ctrl+V` de imagem falhava em silêncio, independentemente de a captura ter copiado corretamente. Como o app é quem hospeda o terminal, delegar essa leitura para a CLI era o erro de origem: a normalização só existe se o app assumir a responsabilidade.

FEITO: o paste é interceptado no app e a imagem vira um caminho de arquivo antes de chegar na CLI.

- `image-mime-types.cjs`, novo: a lista de formatos de imagem aceitos e a resolução de tipo por nome de arquivo, extraídas de `file-attachments-ipc-handlers.cjs`. Existe porque dois caminhos independentes precisam da mesma resposta — anexo vindo do renderer (que declara o tipo) e imagem vinda da área de transferência (que muitas vezes só tem o nome do arquivo); a lista em um lugar só é o que impede os dois de divergirem.
- `clipboard-image.cjs`, novo: lê a imagem da área de transferência pelo `clipboard` do Electron, que é nativo em todas as plataformas e não depende de binário nenhum. Cobre as duas formas que aparecem na prática: bitmap cru (`readImage()`) e referência a arquivo em disco, que chega como lista de URIs `file://` e nunca como bitmap — `text/uri-list` (multiplataforma) e `x-special/gnome-copied-files` (Nemo/Nautilus, publicado como bytes e prefixado por `copy`/`cut`), com o texto puro como último recurso. Caminho relativo é descartado: a área de transferência não carrega diretório de trabalho, então resolvê-lo seria chutar um arquivo que ninguém copiou.
- `files:save-clipboard-image` (em `file-attachments-ipc-handlers.cjs`): junta a leitura acima ao `saveAttachment` que já existia, reaproveitando limite de 25 MB, validação de formato e a pasta `clipboard-attachments`.
- `terminal-image-paste.ts`, novo: as decisões do lado do renderer, livres de evento DOM e IPC para serem testáveis — achar a imagem no `clipboardData` (`items` e `files`, porque qual dos dois vem populado depende do app de origem), reconhecer um paste de texto comum e formatar o caminho para a linha de entrada (aspas só quando há espaço; espaço no fim para continuar digitando).
- `terminal-session-store.ts`: `bindImagePaste` registra um listener de `paste` em fase de captura no elemento do xterm, que roda antes do handler interno do xterm e pode impedir que a imagem seja colada como string vazia. Texto comum devolve o evento para o caminho normal do xterm. Havendo imagem no evento, ela é salva direto; não havendo imagem nem texto, cai no `files:save-clipboard-image` — que é exatamente o caso do Linux Mint, em que o renderer não enxerga o formato mas a leitura nativa enxerga. O caminho salvo é escrito no PTY por `typeIntoSession`, como se tivesse sido digitado (`inputTouched` + `trackTypedInput`).

Resultado: um atalho só (`Ctrl+V` / `Cmd+V`), mesmo comportamento em Windows, macOS, X11 e Wayland, e para qualquer CLI de agente — todas aceitam caminho de arquivo no prompt. Nenhuma dependência nova para o usuário instalar.

TESTE: `clipboard-image.test.cjs` (9 casos, com um dublê de `clipboard` para não exigir Electron): bitmap lido como PNG sem tocar o disco, queda para referência de arquivo quando o bitmap está vazio, lista do GNOME lida de bytes com o prefixo de operação ignorado, referência morta pulada para a próxima entrada resolver, arquivo que não é imagem recusado, área de transferência sem imagem reportada em vez de estourar, e um `clipboard` sem nenhum dos formatos tratado como simplesmente não ter imagem. `terminal-image-paste.test.ts` (13 casos): imagem por `items` e por `files`, item `string` que acompanha uma imagem copiada ignorado (tratá-lo como arquivo entregaria anexo vazio), documento não confundido com imagem, texto comum reconhecido para preservar o paste do xterm, e a formatação do caminho com e sem espaços.

VALIDAÇÃO: `npm run build`, `npm test` (523/523), `npx vitest run` (109/109) e `npm run lint` limpos.

Além disso, conferido **no app Electron rodando de verdade**, sob Xvfb, com `--user-data-dir` isolado para não tocar o canvas real de ninguém, com um agente Claude Code de verdade aberto no canvas. Os quatro caminhos, cada um com um evento `paste` disparado no elemento do xterm:

1. **Imagem no evento** (caminho rápido): PNG vermelho 8×8 num `DataTransfer`. `defaultPrevented: true` — o interceptador tomou o evento antes do xterm; arquivo gravado em `clipboard-attachments` e caminho digitado na linha de entrada do Claude.
2. **Nada no evento, bitmap no clipboard do SO** (o caso do Linux Mint): PNG azul escrito no clipboard nativo pelo processo principal, e o `paste` disparado com `items: 0` e `text: ""` — literalmente vazio, que é o que o Chromium entrega à página nesse cenário. O fallback nativo achou a imagem, salvou e digitou o caminho. Confirmado pelo pixel (0,0) de cada arquivo: vermelho no caso 1, azul no caso 2 — cada imagem veio pela rota certa.
3. **Texto comum** (regressão): `defaultPrevented: false` e o texto colado normalmente pelo caminho do próprio xterm, intocado.
4. **Arquivo copiado no gerenciador de arquivos**: `x-special/gnome-copied-files` com `copy\nfile://...` apontando para um PNG verde em `/tmp/pasta com espaço/`. Lido, copiado para os anexos e digitado.

E a prova de que a ponta serve para alguma coisa: com o caminho da imagem verde na entrada, o agente foi perguntado "que cor tem essa imagem?" e respondeu **"Verde"** depois de `Read 1 file` — ou seja, a CLI de fato enxergou a imagem colada. Por fim, colar com a área de transferência inteiramente vazia não gravou arquivo nenhum e não quebrou o app.

RISCO RESIDUAL: as imagens coladas se acumulam em `clipboard-attachments` sem limpeza automática, igual ao que já acontecia com os anexos do chat. Se a área de transferência trouxer texto **e** imagem ao mesmo tempo, o texto ganha; é o comportamento esperado de um `Ctrl+V`, mas significa que uma imagem acompanhada de legenda cola só a legenda. Colar por arrastar-e-soltar não foi coberto. A imagem referenciada por um arquivo é **copiada** para a pasta de anexos, não referenciada onde está — o caminho fica estável se o original for movido, ao custo de duplicar o arquivo. A conferência foi em Linux/X11 sob Xvfb; Windows, macOS e Wayland seguem cobertos apenas pelo `clipboard` do Electron ser nativo neles, sem execução real.

Estado final: concluído e validado no app rodando.

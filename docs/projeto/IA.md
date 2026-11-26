# IA.md — Contexto Operacional do Felixo AI Core

Status: em evolução ativa — canvas estilo n8n como produto principal; chat legado depreciado.

> Este arquivo segue o template de contexto do padrão de qualidade (`TEMPLATE-CONTEXTO-IA`). O "Histórico de Evolução" mantém a trilha cronológica densa das fases; as seções fixas acima consolidam o estado atual.

> **Este arquivo não recebe mais entradas novas.** Ele guarda o histórico versionado até 03/11/2026 e continua no repositório porque o CI confere que ele existe. As entradas novas vão para o `IA.md` da raiz, que cada pessoa mantém na própria máquina, fora do repositório (decisão de 18/11/2026; veja `docs/README.md`).

Estado atual (resumo vivo): consulte a seção "Estado atual" do `IA.md` da raiz, na máquina de quem desenvolve.

## Registros arquivados

Registros antigos movidos, na íntegra e sem edição, para o arquivo. A linha do tempo completa
é este arquivo mais os de `docs/ia-archive/`, em ordem cronológica.

- [2026-10-12] Registros de 2026-07 (6 seções) movidos para [../ia-archive/IA-PROJETO-ARCHIVE-2026-07.md](../ia-archive/IA-PROJETO-ARCHIVE-2026-07.md)
- [2026-10-12] Registros de 2026-08 (69 seções) movidos para [../ia-archive/IA-PROJETO-ARCHIVE-2026-08.md](../ia-archive/IA-PROJETO-ARCHIVE-2026-08.md)
- [2026-10-12] Registros de 2026-09 (74 seções) movidos para [../ia-archive/IA-PROJETO-ARCHIVE-2026-09.md](../ia-archive/IA-PROJETO-ARCHIVE-2026-09.md)
- [2026-10-23] Registros de 2026-10 (22 seções) movidos para [../ia-archive/IA-PROJETO-ARCHIVE-2026-10.md](../ia-archive/IA-PROJETO-ARCHIVE-2026-10.md)

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

[2026-09-02] ✅ Lote de patches/minors sem misturar majors — `package.json` e
`package-lock.json` atualizaram 18 dependências dentro das faixas declaradas,
mantendo Electron 41.10.7, Tailwind 3.4.19, TypeScript 6.0.3 e `@types/node`
25.9.5. As notas oficiais de React, xYFlow, Highlight.js, Lucide, Electron
rebuild, Vite, Vitest, ESLint, typescript-eslint, PostCSS e plugins relacionados
foram revisadas por grupo. `npm test`: 983/983; testes nativos: 5/5;
frontend: 760 passados + 1 ignorado; lint sem erros; build e `git diff --check`
passaram. Nenhum major entrou neste lote.

[2026-09-01] ✅ Bundle inicial sob demanda — `App` separa canvas e chat com
`React.lazy`; cada ferramenta do canvas tem loader, prefetch seletivo por
foco/ponteiro e fallback de loading/erro; Markdown e o runtime xterm/PTY
também são adiados até o primeiro uso. `npm run benchmark:bundle:check` abre o
`dist` em Electron com `userData` temporário, verifica que o Fetch All só
aparece após o `import()`, confere 200 referências relativas sem ausência e
registra bytes cru/gzip e percentis. Em dez amostras Linux, o entry caiu de
1.687,23/483,71 KiB para 191,73/60,37 KiB; startup p50/p95 caiu de
1.868,065/2.250,549 ms para 1.588,362/2.193,116 ms. A primeira interação
(menu) ficou em 685,680/731,206 ms, com p95 abaixo dos 741,861 ms do baseline;
o custo do primeiro painel é explicitamente separado e depois fica em cache.
`npm run build`, `npm run lint` e o check do benchmark passaram; o build não
emite mais aviso de chunk acima de 500 kB.

[2026-09-01] ✅ Smoke de release nos três SOs — o instalador ou AppImage/DMG
extraído é executado no runner nativo; o app abre em modo de validação, cria
uma sessão real com `node-pty` e o `npm-runtime` embarcado instala/atualiza uma
CLI local, confere PATH, permissões, prefixo privado e persistência. O JSON
`release-smoke-<plataforma>.json` registra tamanho, startup, erro nativo e
resultado; o job só permite promover a release depois dos três smoke tests.

[2026-08-13] ✅ Instalação automática das CLIs oficiais — o app instalado detecta `claude`, `codex` e `gemini`, instala apenas o que falta em um prefixo privado dentro de `userData`, usando Node/npm empacotados, e exibe progresso/erro com retry no canvas. Suítes: Electron/Node 619 testes, frontend 451 testes, build TypeScript/Vite aprovado e ESLint aprovado após ignorar os artefatos gerados `build/` e `release/`.

[2026-08-13] Concluído — Implementação retomada por Continue o trabalho do claude. Backend, bridge IPC, indicador/toast do canvas, runtime npm empacotado, testes e documentação foram finalizados e validados. Não há trabalho desta etapa marcado como em andamento.

[2026-08-12] Bug: O prompt inicial de contexto está demorando muito para chegar no codex — publicação da correção estabilizada. A primeira tentativa de release do commit `9d7e9e4` passou nos testes locais e no CI após uma falha transitória de rede, mas o Windows travou no passo `electron-builder --publish always`, depois de concluir o build. O workflow foi ajustado para separar empacotamento (`--publish never`) e upload explícito dos arquivos finais via `gh release upload --clobber`; a release `v0.1.23` foi publicada como Latest com os artefatos de Linux, macOS e Windows. Estado final desta alteração: concluído.

[2026-08-12] Bug: O prompt inicial de contexto está demorando muito para chegar no codex — segunda correção concluída. Causa: mesmo com o compositor vazio `›` do Codex visível, o store ainda exigia 500 ms de silêncio e só fazia a primeira checagem após um atraso de polling; essa espera era redundante para CLIs cuja linha de entrada já é reconhecida. Fix: a prontidão do Codex/Claude agora libera o contexto assim que a tela muda e a linha de entrada está pronta; os 500 ms continuam somente no fallback de CLIs sem detector. Teste novo cobre a entrega do contexto do Codex em até 400 ms após o compositor aparecer. Validação: Vitest frontend 401 pass, suíte Electron/Node 544 pass, build e ESLint limpos. A correção foi publicada em `v0.1.23` (Latest) e a conferência manual confirmou que o prompt chega rapidamente no terminal. Estado final: concluído e validado.

[2026-08-12] BUG corrigido — A release `v0.1.18` ficou como pré-lançamento parcial porque os jobs paralelos do `electron-builder` disputavam a criação da mesma release no GitHub; o job macOS recebia `422 already_exists` e o `finalize` era ignorado. O workflow agora cria o container da pré-release uma única vez antes da matriz e deixa cada sistema apenas publicar seus artefatos. Estado: correção concluída e enviada para validação na próxima execução.

[2026-08-12] BUG corrigido — O contexto inicial do agente Codex demorava a aparecer ao abrir um terminal porque o store aplicava uma espera fixa adicional de 1800 ms antes da checagem de prontidão. A espera específica foi removida: a entrega agora usa a mesma janela curta das demais CLIs, mantendo a detecção da linha de entrada e o tratamento da tela de confiança como guardas reais. Estado: concluído nesta sessão; validação manual do Codex permanece como acompanhamento opcional.

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

## Resumos de Decisão

[2026-06-21] CONTEXTO: Como persistir as conversas dos terminais entre sessões (o PTY morre ao fechar o app e o scrollback é efêmero).
ALTERNATIVAS: (a) salvar o scrollback do xterm no SQLite; (b) externalizar o estado em arquivos `.md` reais que os agentes editam.
DECISÃO: (b) — o estado vira um arquivo no disco (`userData/canvas-files`), que o bloco renderiza/observa e os agentes editam. Resolve persistência de graça e habilita memória compartilhada entre agentes. Arquivos fora dos projetos para não vazar no git de quem usa.
VALIDAÇÃO: usuário confirmou de ponta a ponta — Claude leu o protocolo, entendeu o arquivo e respondeu corretamente. Suíte 380 pass.

[2026-06-22] CONTEXTO: Separar o modo chat do modo canvas seguindo o padrão de qualidade, com canvas como padrão.
ALTERNATIVAS: (a) canvas + chat + `shared`; (b) chat como legado; (c) só cortar a dependência sem mover pastas.
DECISÃO: (a) — três features irmãs, o compartilhado em `shared`, dependência num sentido só. Feito em branch `refactor/` (política), validando a cada passo.
VALIDAÇÃO: tsc+vite+lint+test verdes em cada passo; canvas deixou de importar de `chat`. Suíte 380 pass.

[2026-11-03] CONTEXTO: Avaliar coleta opt-in para saber se as recomendações do Modo Performance aparecem na carga adequada e ajudam a priorizar melhorias. Não há pipeline de telemetria no app. A recomendação atual aparece com 10 terminais ativos ou 300 nós; só persiste um marcador local `answered`, sem distinção entre aceitar e dispensar.
ALTERNATIVAS: (a) não coletar e manter apenas benchmarks/feedback voluntário; (b) medir somente ativações; (c) desenhar um piloto opt-in com contagens agregadas de recomendações exibidas e respostas por faixa de carga.
DECISÃO: o usuário escolheu (c), sem autorizar implementação nesta etapa. Preservar opt-in explícito desligado por padrão e não coletar conteúdo de terminal; o desenho deve abordar viés da amostra, consentimento, campos, transporte, retenção e exclusão.
VALIDAÇÃO: política, limiares e persistência local da resposta inspecionados; o app não possui SDK ou endpoint de analytics. Task de desenho aberta: https://app.notion.com/p/Felixo-AI-Core-Performance-desenhar-piloto-opt-in-para-calibrar-recomenda-es-por-carga-40d91f95497e813f85b4dc6b5ef11d93.

[2026-11-22] CONTEXTO: A task de testes dos painéis de ferramenta (3ec91f95) seguia aberta com Modelos e Orquestrador sem teste de interface.
DECISÃO: dois checks novos na sessão J do smoke (`checarModelos`: o modelo gravado aparece e Remover o apaga no main; `checarOrquestrador`: limite e modelo preferido + Salvar, conferidos no main, com as configurações restauradas no fim). Lacuna de Modelos removida do inventário; a do Orquestrador reduzida ao Modo, bloqueados, confirmação sensível e contexto/memórias.
VALIDAÇÃO: os dois checks passaram na sessão J local (Windows). A sessão J inteira falhou localmente no Windows em `checarSourceControl` ("não enviado" não apareceu no Histórico), antes dos meus checks e fora desta mudança; no CI do Linux ela passou. tsc, eslint, `canvas-smoke-paineis.test.cjs` (4) e vitest do inventário (9) verdes.

[2026-11-23] CONTEXTO: A task de testes dos painéis de ferramenta (3ec91f95) ainda tinha o detalhe do preset de prompt (PromptDetailPanel) sem teste de interface.
DECISÃO: `checarDetalheDoPrompt` na sessão J do smoke: Ver abre o preset "Revisar codigo", Cancelar descarta o rascunho sem gravar, Salvar grava a versão personalizada no main, Restaurar padrão a remove e Voltar à lista devolve a lista. O detalhe tem o próprio panelId (`prompt-detail`), e `Ver` só existe em presets (prompt criado à mão edita na linha).
VALIDAÇÃO: sessão J completa passou local no Windows; teste do smoke (4) e inventário (9) verdes, tsc e eslint limpos. Linux e macOS ficam para o CI. Um commit paralelo (6d017876) já cobria Modelos e Orquestrador; o meu check equivalente do Orquestrador foi descartado por ser redundante.

[2026-11-23] CONTEXTO: O CI do Linux falhou duas vezes em `checarPedidosDeEscrita` ("pedido deveria estar recusado: pendente") no commit do detalhe do preset, que roda depois dele.
DECISÃO: a fila de pedidos de agente ordena por `pedidoEm` com precisão de milissegundo (`agent-requests.cjs`, `chaveDeOrdem`); o check registrava os dois pedidos em sequência e, no mesmo ms, o "primeiro" a recusar podia ser o outro. O check agora espera 20 ms entre os registros. Nenhuma mudança no app: a ordem só importa porque o teste assume qual é o primeiro.
VALIDAÇÃO: sessão J passou local no Windows; o CI do Linux é a prova final.

[2026-11-23] CONTEXTO: Fetch All era o painel de maior risco ainda sem teste de interface na task 3ec91f95.
DECISÃO: `checarFetchAll` na sessão J: uma raiz de fixture com dois clones atrasados (remoto fora da raiz), varredura completa, ignorar um clone pela linha, Executar plano com confirmação (só o clone considerado avança por pull --ff-only, conferido com git) e Voltar a varrer a pasta ignorada; raízes e ignoradas originais voltam ao fim. As raízes entram por `saveSettings` (o seletor nativo fica fora). Dois achados do harness: o clone no Windows nasce "sujo" por fim de linha se o `autocrlf` for desligado só depois do clone (o planejador então só reporta pendência), e o `/s+/g` sem barra em `exigirClique` apagava as letras "s" do texto de diagnóstico.
VALIDAÇÃO: sessão J passou local no Windows (com instabilidade na 1ª tentativa por outra task, o Histórico "não enviado"); smoke (4) e inventário (9) verdes, tsc e eslint limpos. Ficam sem teste: escopo amplo, push, commit automático e pedido de agente.

[2026-11-23] CONTEXTO: Exportar canvas e Importar canvas (menu de ferramentas) não tinham teste de interface na task 3ec91f95; o export abre o "Salvar como" nativo, que um teste não aciona.
DECISÃO: mesmo molde do seletor de pasta dos projetos: `devtools-save-file-guard.cjs` troca o `showSaveDialog` só na instância de automação com porta de depuração válida e `FELIXO_DEVTOOLS_SAVE_FILE=<caminho absoluto cuja pasta existe>`; `registerFileExportIpcHandlers` passou a aceitar o diálogo injetado (o app normal usa o do Electron). `checarExportarEImportarCanvas` exporta (arquivo com os blocos), cria um bloco a mais e importa pelo campo de arquivo (`setInputFiles`, confirmação aceita), conferindo que o canvas volta ao exportado. O botão "Importar canvas" não é clicado: o campo de arquivo programático exige gesto do usuário.
VALIDAÇÃO: sessão J passou local no Windows sem instabilidade; suíte Node 3694/0 falhas, guarda nova 3/3, inventário 9/9, tsc e eslint limpos.

[2026-11-23] CONTEXTO: Limites e uso, Cadeia de contas e Registro de trocas seguiam sem teste de interface na task 3ec91f95.
DECISÃO: `checarLimitesEUso` (Atualizar e Reconectar terminam a rodada, que consulta as CLIs de verdade e por isso tem prazo de 90 s; Adicionar outra conta e Remover com a confirmação aceita, conferidos no main; sem CLI detectada o check só confere Atualizar e Reconectar) e `checarCadeiaDeContas` (duas contas Codex de fixture por `cliAccounts.create`, que é de onde a cadeia tira os membros; liga a cadeia, troca a estratégia, botões de mover, cobrança declarada, multiplicador e Conferir agora, tudo conferido em `accountChain.getState`; Atualizar da aba Trocas). Ficam de fora: Ligar coleta (escreve na status line do Claude do usuário), Não era limite e Já recarreguei (exigem cooldown real) e Ir para o bloco (recordManual exige terminal vivo registrado; a sessão C já cobre a troca, mas falha localmente no Windows mesmo sem mudança, e não validei uma edição lá).
VALIDAÇÃO: sessão J passou local no Windows; inventário 9/9, smoke 4/4, tsc e eslint limpos.

[2026-11-23] CONTEXTO: Rolagem do Claude, ditado e os estados Carregando/erro dos painéis seguiam sem teste de interface na task 3ec91f95.
DECISÃO: `checarRolagemEDitado` (o interruptor grava a preferência local `felixo-ai-core.claude-terminal-scroll.v2`; modelo e idioma do ditado salvos e conferidos em `speech.getConfig`; chave e microfone ficam de fora porque dependem do cofre do sistema e de hardware) e `checarCarregamentoDosPaineis` (o módulo do painel Modelos atrasado mostra "Carregando Modelos…" e abre; recusado mostra o erro e "Recarregar app" recarrega a janela; feito com `page.route`, que só vale numa janela recém-recarregada porque o módulo fica em memória).
VALIDAÇÃO: sessão J inteira (20 checks) passou local no Windows numa só tentativa; inventário 9/9, smoke 4/4, tsc e eslint limpos.

[2026-11-23] CONTEXTO: Últimas lacunas de interface dos painéis de ferramenta (task 3ec91f95).
DECISÃO: quatro checks na sessão J: `checarFetchAllPedidosPushECommit` (pedido de agente recusado e aplicado depois de varrer, push, commit automático só para quem não está atrás do remoto, Adicionar pasta pelo seletor da automação e remover raízes; o `main.cjs` passa o diálogo de pasta da automação ao Fetch All), `checarOrquestradorModoBloqueioETextos`, `checarPresetsEditarExportarImportar` (o export usa o gancho `FELIXO_DEVTOOLS_SAVE_FILE`) e `checarTemaEPadraoDeQualidade`; mais testes unitários de `canvas:set-file-link-prompt`, `set-file-bootstrap-prompt`, `set-quality-standard` e `qa-logger:build-report`.
VALIDAÇÃO: sessão J passou local no Windows; `npm test` 3696/0 falhas, inventário 9/9, tsc e eslint limpos. Seguem sem teste: escopo amplo do Fetch All, Ligar coleta, Não era limite/Já recarreguei, Ir para o bloco, chave e microfone do ditado, e as lacunas restantes de Projetos, Prompts, Skills e diff grande.

[2026-11-23] CONTEXTO: Pedido de fechar a task 3ec91f95 por completo.
DECISÃO: mais checks na sessão J (`checarPromptEditadoNaLinha`, `checarEscopoAmploDoFetchAll`, `checarDiffGrandeDoGit`, `checarMotorEChaveDoDitado`; extensões em Skills, Projetos, Exportar/Importar e no detalhe do prompt) e o teste do handler de ligar/desligar a coleta do Claude. Lacunas totalmente cobertas saíram do inventário; ficam as que têm obstáculo real (cooldown de conta, terminal vivo registrado na cadeia, microfone e pedido de permissão do macOS, varredura de todos os discos, canvas travado, atalho do ditado, Claude real no modo clássico). O passo do smoke no CI passou de 15 para 25 minutos: ele já gastava 10 e a sessão J cresceu.
VALIDAÇÃO: sessão J passou local no Windows; `npm test` 3697/0 falhas; inventário 9/9; tsc e eslint limpos.

[2026-11-23] CONTEXTO: Restava sem teste de interface a barra de filtro das contas de Limites e uso (busca, "Precisa de atenção", "Atualizar a conta"), declarada na task 3ec91f95 como lacuna sem obstáculo real.
DECISÃO: novo `checarFiltroDasContas` na sessão J. A barra só aparece com 6 contas (`AGENT_USAGE_FILTER_MIN_ACCOUNTS`), então o check cadastra 6 contas locais do provider codex por `agentUsage.addAccount`, digita o nome de uma ("1 de N contas"), aciona "Atualizar a conta" (aria-busy), "Limpar filtro" e liga/desliga o atalho (aria-pressed). Remove as contas no `finally`; se o painel não listar as contas no ambiente, registra o motivo e sai sem falhar.
VALIDAÇÃO: sessão J passou local (Windows) com 32 checks; inventário 9/9; teste de contrato 4/4; tsc e eslint limpos.

[2026-11-23] CONTEXTO: A task de avisos recortados e posicionamentos errados (3ec91f95-…-8103) listava 9 lacunas do inventário; o código em `main` já tinha mudado desde a abertura.
DECISÃO: corrigidas três: foco em filho de grupo (`getAbsoluteNodePosition` soma a cadeia de pais; `focusNode` a usa), traço fantasma do Desenho (finishStroke limpa o path de prévia) e nome de pasta no Windows (`folderDisplayName` aceita `\` e `/`). Duas saíram do inventário por já estarem resolvidas no código: o balão do ditado (DictationNotice vai por portal, FelixoPopoverSurface) e o rótulo do cabeçalho da gaveta (o cabeçalho não mostra mais estado). Ficam abertas: Enquadrar da pílula, aviso de pouco espaço sob o painel, rótulo do bloco Página Web e largura dos painéis com panelId trocado.
VALIDAÇÃO: tsc, eslint e vitest de `src/features/canvas` verdes (2352 testes); testes novos de `getAbsoluteNodePosition` e `folderDisplayName`. Não vi o ditado nem o traço na tela: a leitura do código é a evidência.

[2026-11-23] CONTEXTO: Fechar as 4 lacunas que restavam da task de avisos recortados/cobertos (3ec91f95-…-8103), depois das três corrigidas no commit 58e7125d.
DECISÃO: (1) Enquadrar da pílula de zoom chama `fitCanvasViewSafely` (área útil) por `onFit`; (2) o aviso de pouco espaço sobe para z-40, acima do painel de ferramenta (z-20/30) que nasce no mesmo canto; (3) o rótulo do bloco Página Web ganha `labelFromPage`: o título gravado pela página segue o título ao reabrir, e nome manual ou bloco antigo (sem marca) continua travado (`labelIsCustomized`); (4) `useResizablePanelWidth`/`Height` releem a memória quando o `panelId` troca sem remontar (Projetos e Prompts: lista → detalhe).
VALIDAÇÃO: tsc, eslint, vitest de `src/features/canvas` verdes; testes novos (`webpage-label`, `canvas-layout-warning-z`) e o check de smoke `checarLarguraPorVistaDoPainel`, que falha sem a correção (detalhe 420 px = largura da lista) e passa com ela. Inventário sem lacunas desta task. Não vi o aviso sob o painel numa janela real: o z-40 é conferido por teste de código-fonte, não por captura.

[2026-11-24] CONTEXTO: Task 3ec91f95-81f7 (overlays sem teste: atualização, hardware, recuperação, Ajuda e alças). Nenhum desses cinco tinha teste de interface; o `auto-updater.cjs` não tinha teste nenhum.
DECISÃO: o repositório testa em Node, sem DOM. Os componentes de apresentação são chamados como função e a árvore devolvida é percorrida por `features/shared/test-support/react-tree.ts` para disparar os `onClick` que a tela ligaria. Testes novos: `UpdateNotice.test.ts`, `HardwareNotices.test.ts`, `RendererRecoveryBoundary.test.ts`, `DialogResizeHandles.test.ts` e `auto-updater.test.cjs` (com `electron` e `electron-updater` falsos, ciclo verificar → baixar → instalar). A resposta à sugestão do Modo Performance saiu do componente para `answerPerformanceSuggestion` (`performance-suggestion.ts`), sem mudar o comportamento. O SB8 do smoke do tutorial passou a clicar Cancelar na confirmação de redefinir. O que só aparece num app rodando (ramo da sugestão com o perfil de CPU, erro de render real, arrasto real das alças, feed real do atualizador) ficou declarado no inventário e na task 42291f95-497e-8199-99e2-e7703485d803.
VALIDAÇÃO: `npm test` 3702 passam e 0 falham; inventário 9/9; tsc e eslint limpos. O SB8 estendido não foi rodado localmente (memória livre de 3 GB, e uma rodada anterior do smoke foi encerrada por pressão de memória); quem o valida é o CI.

[2026-11-24] CONTEXTO: Task 3ec91f95-81e8 (controles de terminal e dos diálogos de agente sem teste): gaveta do terminal, painel Detalhes, menu Agente (fila), campos e presets do agente, passar responsabilidade, trocar de conta, pergunta de agente, pedido de página e o store do PTY. Os componentes têm hooks e efeitos, que o teste em Node sem DOM não executa.
DECISÃO: decidida com a pessoa: adicionar `jsdom` (29.1.1, que aceita Node ≥ 22.13 e ≥ 24: a versão 31 pede 22.22+/24.15+/26+ e a máquina local está no 25) e `@testing-library/react` como devDependencies. `vitest.config.ts` passou a incluir `*.test.tsx`; cada teste declara `// @vitest-environment jsdom` e usa `shared/test-support/` (`jsdom-storage.ts`: o Node 25 traz um `localStorage` experimental que cobre o do jsdom; `jsdom-shims.ts`: `scrollIntoView` e `ResizeObserver`). O lockfile foi regerado no Windows e as podas do npm 11 (`libc`, `peer`, dois pacotes aninhados do tailwind) foram revertidas, ficando só as adições. O jsdom não calcula layout nem desenha xterm: posição, sobreposição e o terminal de verdade seguem no smoke. Testes novos: store do PTY (saída silenciosa, ponte ausente, `copy`) e 11 arquivos `.test.tsx`. O que só aparece num app rodando ficou no inventário e na task 42291f95-497e-81b6-b811-f52c43831eb6.
VALIDAÇÃO: `npx vitest run` 4068 passam, 0 falham; `npm test` 3702 passam, 0 falham; inventário 9/9; tsc e eslint limpos. Não rodei o smoke Electron (2 GB de memória livre); esta task não mexe nos scripts do smoke.

[2026-11-24] CONTEXTO: Task 3ec91f95-8122 (a busca do topo cobriria o nome "Felixo AI Core" em 1600 px). Visto só numa captura da sessão F com viewport emulado de 1600×1100 sobre uma janela de 1280×800.
DECISÃO: não reproduz. Novo `checarTopoLegivelEmLarguras` (sessão I) mede a marca e a caixa de busca em 1280, 1440, 1600 e 1920 px, exige que o nome termine antes da busca, que nada de outro elemento fique na frente do nome e que o topo caiba na janela. Medido no Windows: o nome termina em ~111 px e a busca começa em 410, 461, 512 e 624 px. Tenta redimensionar a janela de verdade (`BrowserWindow.setSize` pelo `mainEval`); o sistema só deixou 1280 px, o resto foi por viewport emulado, e o check registra qual foi qual. Nenhuma mudança de layout. Uma sessão DevTools órfã de uma rodada do smoke encerrada por falta de memória (18:18 de 23/11) bloqueava o `devtools launch`; encerrei com `devtools quit`.
VALIDAÇÃO: check passou na sessão I local (Windows); inventário 9/9; contrato do smoke 3/3; tsc e eslint limpos. Não rodei uma janela real de 1600/1920 px (o sistema limita a janela escondida) nem o Linux (o CI roda).

[2026-11-24] CONTEXTO: O CI do commit 86f3c79e falhou na sessão J (largura da lista de Prompts 416 em vez de 420, ou seja, uma janela de ~756 px), logo depois de o `checarTopoLegivelEmLarguras` redimensionar a janela real pela sessão I.
DECISÃO: o check deixou de redimensionar a janela de verdade e usa só o viewport emulado (o caso da captura original). A causa provável é o app gravar o tamanho da janela no perfil e a sessão seguinte abrir com outra largura; não confirmei, só que a falha apareceu junto com esse redimensionamento e o commit anterior passou. A entrada anterior sobre "janela real" fica superada por esta.
VALIDAÇÃO: o check passa local com o viewport emulado (nome até ~111 px, busca de 410 a 624 px); contrato 3/3 e eslint limpos; a confirmação é o CI.

[2026-11-24] CONTEXTO: Task 3ec91f95-81e7 (sessão D instável: L10, menu do link na Página Web, no app empacotado). Uma ocorrência em 01/10/2026, no AppImage, sob carga alta.
DECISÃO: nos 22 runs de CI, Release e Nightly de 23 e 24/11 (logs lidos um a um) o L10 nunca falhou; a sessão D repetiu uma vez, no Nightly 45230396645, em outro passo (L3). O smoke do canvas no pacote saiu do Release em #124 (19/10/2026), então "5 runs seguidos no pacote" não tem mais fonte automática. Sem reproduzir, endureci o L10 nas duas causas plausíveis: espera o `document.readyState === 'complete'` e os três links dentro do webview (o `getURL()` já esperado só prova o `dom-ready`) e espera a caixa do webview parar de mudar antes de medir o ponto do clique (a câmera anima 240 ms, mais sob carga). Não separei qual das duas causava a falha de 01/10.
VALIDAÇÃO: sessão D da fonte, 5 rodadas seguidas com uma tentativa cada, no Windows local: passa de primeira nas 5, mas com o L9 (toque no link do terminal) desligado só no meu arquivo de trabalho, porque ele falha aqui 5 de 5, inclusive sem a minha mudança (o CI não o vê falhar). Não rodei o pacote.
CORREÇÃO: entrada de 24/11 sobre o check do topo atribuía a falha da sessão J (largura da lista de Prompts 416/417 em vez de 420) ao redimensionamento da janela real. A leitura dos logs mostra o mesmo check repetindo com 386 nos runs 45285325316, 45389975597 e 45399258118, antes e depois, e de novo com 417 depois de eu tirar o redimensionamento (45406400661): é instabilidade própria do check, não efeito do meu. A remoção do redimensionamento seguiu correta, mas não era a causa.

[2026-11-24] CONTEXTO: Task 3ec91f95-811a (SA1 do tutorial instável no pacote do Linux: "o app não parou de gravar sozinho", `canvas:save: 2` numa amostra de 1500 ms, release v0.1.433 de 01/10/2026).
DECISÃO: nenhuma mudança de código; a causa já foi corrigida em d07b3a2 (05/11): o `onChange` do Excalidraw disparava a cada atualização e o bloco gravava a cena sem comparar, cerca de uma vez por segundo com o canvas parado (medido naquele commit: `canvas:save` de 20 em 12 s para 0). Duas gravações numa amostra de 1,5 s é exatamente esse ritmo. A correção tem teste (`excalidraw-scene.test.ts`, `sceneToPersist`) e o SA1 passou a provar zero escritas com o bloco Excalidraw na fixture (2b46bc2e). Nos logs dos 34 runs de CI, Nightly e Release mais recentes (23 e 24/11) o SA1 passou 29 vezes e nenhuma falhou nem repetiu. Não montei o pacote do Linux: o smoke do canvas no pacote saiu do Release em #124 (19/10/2026) e o critério "5 runs no pacote" não tem fonte automática. Que a falha de 01/10 fosse mesmo o laço do Excalidraw é inferência pelo ritmo, não medição no pacote.
VALIDAÇÃO: leitura dos logs (`gh run view --log`) e dos commits; nada executado localmente.

[2026-11-26] CONTEXTO: Task 3f091f95-497e-812f (o app desta máquina ainda roda de `%TEMP%\felixo-release-smoke-4pap4S`, agora 0.1.635; desinstalação em HKLM, item de login, dois atalhos e o ícone da barra de tarefas apontam para lá). A pessoa autorizou a migração sem que o agente, que roda dentro do app, se encerrasse, pediu para manter autostart e ícone e para não desligar o computador.
DECISÃO: `migrar-instalacao-de-temp.ps1` ganhou `-Aguardar` (espera o app ser fechado em vez de recusar) e `-Reabrir` (abre a instalação nova pelo Explorer, sem privilégio de administrador). Passou a copiar instalador e banco antes de remover, a rodar a cópia do instalador (o NSIS se regrava em `felixo-ai-core-updater\installer.exe`), a desinstalar com `--keep-shortcuts` (sem a flag o desinstalador desafixa o ícone da barra), a apontar autostart e ícone para a instalação nova e a gravar `%APPDATA%\felixo-ai-core-migracao\migracao.log`.
VALIDAÇÃO: `migrar-instalacao-de-temp.test.ps1` roda o fluxo inteiro com registro, processos e instaladores falsos numa pasta temporária (8 verificações ok); simulação real sem alterar nada. A migração real e o reinício do Windows não tinham acontecido no momento deste registro.

[2026-11-26] CONTEXTO: Task 3f091f95-497e-814f (validar o ditado por voz no Windows). A pessoa informou não ter microfone disponível e pediu a simulação com um áudio do PC; autorizou desligar e religar o acesso de apps de desktop ao microfone.
DECISÃO: nenhuma mudança no app. Novo `app/scripts/validar-ditado-windows.cjs`, em duas fases: `simulada` (WAV da voz pt-BR do Windows entregue ao Chromium por `--use-file-for-fake-audio-capture`) e `sistema` (dispositivo padrão, com o endereço de transcrição desligado). O uso do microfone é medido pelas sessões do Core Audio (`windows/capturas-de-audio.ps1`) e a chave de privacidade é mudada pela tela de Configurações (`windows/acesso-do-microfone.ps1`): no Windows 11 26300 o `ConsentStore` do registro não registra uso desde 07/10 e gravar `Deny` nele não bloqueou a captura.
VALIDAÇÃO: os oito itens passaram. Fala simulada: texto na linha do `cmd.exe` sem Enter, cronômetro e "transcrevendo", cópia com aviso sem terminal, quatro mensagens de erro sem a chave, webm aceito, chave cifrada (`v10`, chave mestra DPAPI, nenhum arquivo com ela em texto puro). Dispositivo real: captura ativa só enquanto grava (ícone na bandeja confere), liberada ao cancelar, parar e fechar; com a chave desligada, status `denied` e mensagem com o caminho das Configurações; chave religada. NÃO validado: fala de verdade passando pelo microfone até o texto, e o 401 da API real da OpenAI (usei um servidor local que responde 401).

[2026-11-26] CONTEXTO: Task 3f091f95-497e-819e (medir latência, qualidade e custo da transcrição na nuvem). A pessoa não tinha chave da OpenAI nem da Groq agora e autorizou enviar vozes públicas quando houver. **Nenhum número da nuvem foi medido.**
DECISÃO: o conjunto de 05/10 não guardava os ids das frases, então foi montado outro, versionado em `app/scripts/frases-ditado.json` (6 do FLEURS pt_br, CC-BY 4.0, masculinas; 6 do VoxForge pt, GPL, de 3 locutoras) e baixado por `preparar-frases-ditado.py`, sem versionar áudio. `windows/medir-transcricao-nuvem.ps1` mede OpenAI e Groq com um comando, com a chave digitada escondida e só na memória. O medidor ganhou `--minimo-s` (a Groq cobra no mínimo 10 s por pedido) e passou a esconder o pedaço de chave que a API devolve mascarado. Conferido em 26/11 nas páginas oficiais: OpenAI marca o `whisper-1` (padrão do app) como descontinuado, sem data, a US$ 0,006/min; Groq `whisper-large-v3-turbo` a US$ 0,04/h.
VALIDAÇÃO: motor local no mesmo conjunto (faster-whisper, CPU Ryzen 7 5700G, servidor aquecido; masculinas/femininas):

| Modelo | Mediana | WER | Masculinas | Femininas |
| --- | --- | --- | --- | --- |
| tiny | 0,44 s | 57,7% | 23,8% | 91,7% |
| base | 0,75 s | 41,4% | 13,3% | 69,4% |
| small | 2,42 s | 18,8% | 7,1% | 30,6% |

Não é comparável linha a linha com 05/10: outras frases e outra máquina. Testes do medidor 13/13; ensaio do comando único com chave falsa deu 401 sem a chave na tela, no JSON ou no ambiente.

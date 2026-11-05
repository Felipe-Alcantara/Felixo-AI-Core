
---

## Estado atual (resumo vivo)

<!--
  EXCEÇÃO à regra append-only: esta seção é um resumo reescrevível de "onde o projeto está
  AGORA". Reescreva-a a cada mudança de estado; o histórico fica nas entradas datadas abaixo e
  nos arquivos de docs/ia-archive/.
-->

Última atualização: [2026-11-05]

- **Fase:** o canvas é o produto principal (o chat está depreciado). A divisão do `CanvasView`
  (partes 1 a 4) e o bloco Agente na nuvem estão na `main`: PRs #113 a #120 mesclados.
- **Padrão de qualidade:** auditado e alinhado em 2026-10-12, 2026-10-23 e 2026-11-05 (ver as três
  entradas). Gate verde no Windows em 05/11: `tsc`, `eslint`, Python 105, Node 3105, vitest 3377, `test:native` 9;
  `npm audit` sem crítico e sem alto, com a produção em 0 (sobram 46 moderados de desenvolvimento: `glob` e
  `minimatch` embutidos no `npm` e no `@electron/universal`, sem conserto que não seja rebaixar versão). O app está no
  Electron 42.11.16 (`v0.1.509`); a 42 não é a linha mais nova, e a migração para uma linha suportada tem task
  própria. O repositório ficou sem PR aberto, só com a `main`, e sem alerta de secret scanning aberto.
- **Barra de status do canvas (2026-11-05):** vai de borda a borda e o inspector "Elementos" termina logo acima dela; com
  a gaveta do terminal aberta ela encolhe o texto por cortes de container query (`data-corte`), sem quebrar linha, e o
  Remover fica visível e clicável em 768 px ou mais. O cenário `checarBarraComGaveta` do `canvas-smoke` guarda isso.
  Ver a entrada de 2026-11-05 "Layout: a barra de status deixa de encolher para 160 px".
- **Claude por chave de API:** conta do Claude por chave abre um bloco de conversa (Claude Code sem tela, que usa o crédito promocional do Agent SDK); ver a entrada de 2026-10-19.
- **Memória de longo prazo (ai-memory, 2026-10-21):** instalado na máquina (serviço no logon, MCP e hooks por usuário no Claude Code, Codex e Copilot). Este repositório tem o bloco gerenciado no `CLAUDE.md` e no `AGENTS.md` e as skills `ai-memory-*`; a captura vale para todos os projetos e a entrega dos eventos acontece nas fronteiras da sessão. Ver a entrada de 2026-10-21 "ai-memory instalado".
- **Instalador e árvore de processos (2026-10-21):** o `release-smoke.cjs` passou a cancelar e expirar a instalação de uma CLI pelo app empacotado e a provar, com uma sonda independente, que nenhum processo da árvore do npm sobra (`app/scripts/installer-kill-smoke.cjs`, nos três SOs do Release). Visto rodando fora do CI só no Windows; o macOS real segue pendente (roteiro em `docs/validation/CHECKLIST-INSTALADOR-ARVORE-DE-PROCESSOS.md`). Ver a entrada de 2026-10-21 "Instalador: cancelar e expirar pelo app empacotado".
- **Instalador, rotas Python e script (2026-10-22):** a rota do pip (`runBufferedCommand`, hoje só o Openia) passou a encerrar a árvore inteira no prazo e no cancelamento, a procurar um Python que sirva antes de instalar (`core/python-runtime.cjs`) e, junto com o npm, a repetir a falha de rede duas vezes (`core/install-retry.cjs`). Prova com processo real nas 3 rotas em `install-routes-process-tree.test.cjs` (roda no Windows, no Ubuntu e no macOS do CI). Visto rodando fora do CI só no Windows; fechar o app no meio de uma instalação ainda não a cancela. Ver a entrada de 2026-10-22 "Instalador: Python e script".
- **Ciclo de instalação das CLIs no CI (2026-10-22):** o runner que prova que a instalação automática não reinstala na 2ª abertura nem no upgrade (`app/scripts/cli-auto-install-real-repro.cjs`) roda sozinho no `windows-latest` (`ciclo-instalacao-clis.yml`: push por caminho, segunda 09:30 UTC e sob demanda), com veredito que separa regressão do Felixo de falha de infra (códigos 1 e 2) e controle negativo. Fora do PR e do Release. Desde 2026-10-23 a matriz tem também a entrada `instalado`: instala de verdade o NSIS do último Release no runner e roda o ciclo DENTRO do app instalado (`--packaged`), conferindo que o npm usado é o de `resources/npm-runtime` (controle `controle_npm`). Ver `docs/validation/CICLO-INSTALACAO-CLIS.md` e as entradas de 2026-10-22 "CI: o ciclo de instalação das CLIs" e de 2026-10-23 "CI: o ciclo roda dentro do app instalado pelo NSIS".
- **PTY no Windows (2026-10-22, `v0.1.478`):** o `node-pty` falhava no `AttachConsole` em todo `kill()` (o
  auxiliar sobe uns 45 ms depois de o pseudo-console fechar) e segurava o processo por 5 s;
  `app/electron/services/node-pty-windows-kill.cjs` responde a lista de processos localmente nos quatro
  pontos que abrem PTY. O teste `pty-kill.integration.test.cjs` está no `test:native` desde 2026-10-23
  (`v0.1.479`) e `npm run repro:pty-kill` mede o encerramento com e sem o contorno. Ver a entrada de
  2026-10-22 "PTY no Windows" e a de 2026-10-23.
- **Tarefas Notion (2026-10-23, `v0.1.482`):** o botão "Uma por repositório", ao lado de "Nova visualização", cria de uma
  vez uma aba para cada repositório da lista do seletor (`planRepoViews` em `notion-task-views.ts`; sem repetir quem já
  tem a sua) e, quando há tarefa sem repositório, a aba "Sem Repositório". O clique no app real ainda não foi conferido: o cliente do Notion não aponta para um servidor de teste.
  Ver a entrada de 2026-10-23 "Tarefas Notion: Uma por repositório".
- **Terminal do Claude Code (2026-10-23, `v0.1.485`):** o Claude abre em tela cheia, com o mouse dele (a opção "Rolagem
  no terminal do Claude Code" vem desligada: ligada, ela força o modo clássico, que tem a barra do xterm e o histórico, e
  o Claude deixa de aceitar clique). Na tela cheia o xterm não tem barra, então a gaveta mostra um trilho de rolagem do app
  (meia página para cima e para baixo, ir ao fim, e o botão de fim acende quando o Claude mostra "Jump to bottom"); ele não
  mostra a posição, porque o Claude não a informa. O trilho depende das teclas, da frase do aviso e da tela alternativa do
  Claude 2.1.309. Ver a entrada de 2026-10-23 "Terminal: o Claude Code não recebia o mouse". Desde a `v0.1.486` a preferência da rolagem vive na chave `felixo-ai-core.claude-terminal-scroll.v2`, para o padrão desligado chegar a quem tinha um "ligado" antigo.
- **Modo Performance (2026-11-03):** a comparação sintética calibrada atingiu os três critérios
  de FPS, quadro p95 e custo de estilo frente ao baseline `b9e3555`. A validação no notebook
  físico de referência permanece pendente; os resultados e as condições estão na entrada final
  de calibração e em `docs/performance/PERFORMANCE.md`.
- **Atualização automática das CLIs:** Em toda abertura (também na execução da
  fonte), a rodada das CLIs busca a versão mais nova publicada de Claude, Codex e Gemini, inclusive
  pré-lançamento, e atualiza a cópia do app e a do npm global, mesmo com a CLI aberta (o npm troca
  o pacote com o executável antigo rodando). O rodapé avisa "CLIs atualizadas" (entradas de
  2026-10-14 "CLIs: a versão mais nova publicada" e "o Claude não atualizava"). `FELIXO_AUTO_INSTALL_CLIS=0` é o opt-out para automações isoladas. O Agente na nuvem foi movido do botão em *Criar* para uma
  opção do menu Agente (entrada de 2026-10-12 "movido para dentro do menu Agente"): validado no Windows,
  enviado, com o CI verde e publicado na `v0.1.452`. O Release gate não publicou sozinho (o último
  commit do push só mexia em `IA.md`); a release foi disparada à mão para `d952f5b`.
- **Pendente de conferência manual:** o roteiro do Agente na nuvem em
  `docs/validation/CHECKLIST-AGENTE-NUVEM.md` (cria sessão real e gasta crédito, por isso não roda
  no CI) e a retomada do terminal (entrada de 2026-10-09). A atualização do Claude no app instalado
  com a `v0.1.461` (a correção foi validada numa instância isolada da fonte; o app do dia a dia
  deste PC roda de dentro de `%TEMP%`). O "File not found: " vazio ao abrir agentes (entrada de
  2026-10-15) na máquina de quem relatou, depois que o app dela atualizar para a `v0.1.462`. A
  abertura do Codex 0.158+ sem o "timed out discarding buffered terminal input" e a tela de
  confiança nova reconhecida (as duas entradas de 2026-10-19), no Windows: validadas só no Linux,
  mesclado no PR #123 (`9748116`). O CI/CD enxugado (entrada "CI/CD: rodar só o que a mudança
  pede", 2026-10-19): o tempo novo do Windows no CI do PR e se algum job que saiu era check
  obrigatório da `main`.
- **Próximo passo sugerido:** rodar a etapa 18 do checklist do Agente na nuvem em Linux ou macOS com a
  `v0.1.452` (o CI passou, mas a interface só foi conferida no Windows).
- **Riscos abertos:** (1) a suíte vitest completa com os 16 workers padrão ficou instável numa
  máquina com 2 GB de RAM livres; use `npx vitest run --maxWorkers=4` (3151 testes passando, 90 s).
  (2) Um comentário em `app/electron/services/codex-status-screen.cjs` ainda cita a seção
  "Limites e uso por conta" do README, que agora está em `docs/guias/GUIA-CONTAS-E-LIMITES.md`; não
  foi editado porque qualquer mudança em `app/electron/` publica uma release.
  (3) Os artefatos de contexto morrem com o terminal, mas a conversa retomada do agente ainda os cita;
  a entrada de 2026-10-12 "artefato expirado deixava o agente parado" só impede que isso trave o
  agente (texto do erro de `felixo context read`) e não mudou a retenção.
  (4) Um bloco Codex com yolo marcado nasce "encerrado" por flag repetida quando algo fora do app já
  soma a flag. Há fallback e diagnóstico (entrada de 2026-10-12 "Codex: flag de yolo repetida"), mas a
  causa na máquina de quem relatou não foi confirmada; o evento `terminal-launch:early-exit` no QA Logger diz.
   (5) A suíte Node completa tinha três falhas preexistentes/de ambiente, nas descobertas de sessão e no
   terminal por conta; em 2026-10-14 ela passou sem falhas no Windows (2738 testes, 8 ignorados).
  (6) Cada atualização de uma CLI aberta deixa a pasta antiga do pacote (`.claude-code-XXXX`, do
  tamanho do pacote) no npm global até uma instalação seguinte com o processo fechado.
  (7) No Windows, `npm run test:native` completo falhava de forma intermitente em "payload grande chega
  inteiro" (`pty-write-queue`); a causa era o coletor do teste (marcador de fim partido) e foi corrigida
  em `bddc016` (2026-10-22). O "emoji não é partido" não apareceu em 60 repetições no runner. O E2E de
  contexto (`contextIndex` -1) segue aberto na task própria do Notion.
- **Como compactar de novo:** este arquivo e `docs/projeto/IA.md` crescem com cada sessão. Quando
  passarem de uns 1000 linhas, rode `node app/scripts/archive-ia-md.cjs` (dry-run por padrão); o
  passo a passo está no Guia para Desenvolvedores.

## Registros arquivados

Registros antigos movidos, na íntegra e sem edição, para o arquivo. A linha do tempo completa
é este arquivo mais os de `docs/ia-archive/`, em ordem cronológica.

- [2026-10-12] Registros de 2026-08 (66 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-08.md](docs/ia-archive/IA-ARCHIVE-2026-08.md)
- [2026-10-12] Registros de 2026-09 (95 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-09.md](docs/ia-archive/IA-ARCHIVE-2026-09.md)
- [2026-10-23] Registros de 2026-10 (40 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-10.md](docs/ia-archive/IA-ARCHIVE-2026-10.md)
- [2026-11-05] Registros de 2026-10 (21 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-10.md](docs/ia-archive/IA-ARCHIVE-2026-10.md)
- [2026-11-05] Registros de 2026-10 (1 seção) movidos para [docs/ia-archive/IA-ARCHIVE-2026-10.md](docs/ia-archive/IA-ARCHIVE-2026-10.md)

## 2026-11-03 — Limites: scheduler central, backoff por conta e atualização base de 30 s (v0.1.495)

**Pedido.** Tarefa "Felixo AI Core/Limites — scheduler central, backoff e atender o pedido de atualização a cada ~30s": substituir os intervalos independentes do painel por um scheduler coordenado, priorizar fontes econômicas enquanto o painel está visível, reduzir ou pausar conforme o contexto, aplicar backoff e instrumentar carga e deduplicação.

**O que mudou** (commit 3ffa74e). O processo principal agora possui um único scheduler para os consumidores visíveis do painel e do modal. Ele favorece sessões ativas e medições antigas; usa cadência base de 30 s, desacelera para 5 min após 5 min de inatividade e para 2 min na bateria. Pausa quando a janela está oculta ou minimizada, em Modo Performance, durante suspensão ou sem consumidor visível. Consultas agendadas usam somente Codex app-server (account/rateLimits/read) e Openia statusline; Claude continua vindo do watcher local e Gemini interativo é ignorado. O refresh manual suspende/deduplica o agendado.

O backoff é por conta: falha genérica exponencial até 15 min, autenticação em 15 min e rate limit respeitando Retry-After (mínimo de 5 min). A instrumentação agrega duração, tentativas, erros, requests por provider, processos iniciados, CPU, RSS e concorrência, sem identificar contas. Painel, modal e documentação foram atualizados para a política automática.

**Validação.** Testes focados: 62/62; typecheck; testes nativos 9/9; frontend 211 arquivos, 3.361 testes passando e 3 pulados; canvas-context 6/6; lint e build passaram. A suíte Node completa teve 3.060 testes: 3.048 passaram, 3 falharam e 9 foram pulados. As três falhas estão fora dos arquivos alterados e dependem do perfil local: duas em agent-session-discovery (metadados/sessão de fixture não encontrados) e uma em pty-process-manager (CODEX_HOME do perfil local presente quando o teste esperava ausência). O CI 41643528998 passou em Linux, Windows, macOS, ARM e smoke do canvas; Release gate 41644654511 passou; Release 41644702651 publicou v0.1.495 como Latest para Ubuntu, Windows e macOS, incluindo o smoke de atualização silenciosa no Windows.

**Não medido em uso real.** A aplicação e contas reais não foram usadas numa rodada ao vivo; portanto CPU, RAM, duração e cadência instrumentadas ainda não foram observadas com providers reais. O trabalho implementa a coleta desses dados para validação operacional posterior.

## 2026-11-03 — Terminal: origem e detalhes do prompt no painel de atividade (v0.1.496)

**Pedido.** Task "Terminal — unificar TerminalPanel com a proveniência do prompt e expor origem/detalhe": mostrar no painel a origem e os detalhes de cada prompt enviado pelo Terminal, cobrindo envios sucessivos e preservando o texto e o fluxo de envio existentes.

**O que mudou** (commit `09c3840`). `ChatWorkspace` anexa ao envio metadados de proveniência sem o corpo do prompt. O IPC propaga esses metadados tanto no envio direto quanto na sessão persistente; os registros mantêm o histórico e atualizam a proveniência mais recente da sessão. `TerminalPanel` exibe o nome/origem e o modo de envio, e permite expandir o histórico com origem, modo, horário e prévia. O detalhe é somente leitura e não reexecuta o prompt. A cobertura também confirma a preservação dos metadados no fallback inline de arquivo.

**Validação.** Testes focados Node: 39/39; frontend focado: 21/21 nos tipos/armazenamento e 1/1 no painel; fallback de arquivo: 4 passaram (18 ignorados pelo filtro). `npm run test:frontend`: 212 arquivos passaram, 2 ignorados; 3.364 testes passaram e 3 foram ignorados. `npm run typecheck`, `npm run lint`, `npm run build` e `git diff --check` passaram (o build mantém o aviso existente de chunk acima de 500 kB). `npm test`: 3.063 testes, 3.051 passaram, 3 falharam e 9 foram ignorados. Após retirar `CODEX_HOME` herdado, as falhas restantes ficaram em `installer-kill-smoke.test.cjs`: a sonda de processos inclui processos GitHub Desktop já existentes como descendentes. A task de isolamento foi aberta. CI `41652088260` passou em Windows, Linux, ARM, macOS e Canvas smoke; Release gate `41653045630` passou; Release `41653097003` publicou **v0.1.496** como Latest, com instaladores e smoke de atualização silenciosa no Windows aprovados.

**Não validado.** Inspeção visual manual no app Electron; a cobertura do painel é por teste de renderização estática. O detalhe expansível não foi exercitado numa sessão interativa real.

**Acompanhamento.** Task "Testes Windows — isolar a sonda de árvore de processos do harness": https://app.notion.com/p/Testes-Windows-isolar-a-sonda-de-rvore-de-processos-do-harness-40d91f95497e81ed8ac3d491c63ba4a8

Estado: concluído e publicado (v0.1.496).

## 2026-11-03 — Performance: harnesses cruzam modos, observers e baseline histórico

**Pedido.** Tarefa [adaptar harnesses para medir o Modo Performance e cobrir observers](https://app.notion.com/p/Felixo-AI-Core-Performance-adaptar-harnesses-para-medir-Modo-Performance-e-cobrir-observers-minima-3e691f95497e816aa1c9c0b3b37c8046).

**O que mudou.** O commit [`f11da68`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/f11da6839d5955ea527ae8cb62cace6c84e259d4) adaptou os harnesses de conexões, saída do terminal e UI real para cobrir Normal/Performance, settings, persistência, drag ativo, minimapa, céu, tutorial, painel e observers do scheduler. O commit [`125dfa2`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/125dfa25cdf5bd2c9ffeacbbf0d963a058ea1b75) acrescentou comparação reproduzível com um checkout histórico (`--legacy-baseline=<hash>`) e documentou os resultados.

**Comparação final.** Mesmo Windows x64, Microsoft Basic Render Driver por software, CDP throttle 4×, 48 nós/31 arestas, três rodadas de 3 s por condição, um aquecimento, tutorial fechado e dois toggles concluídos por rodada. O pai de `44f8cec`, `b9e3555`, fez 58 FPS, quadro p95 33,3 ms e estilo 0,948 ms/quadro. No build `f11da68`, Normal fez 19,67 FPS, p95 116,57 ms e estilo 19,203 ms/quadro; Performance fez 36,33 FPS, p95 66,6 ms e estilo 1,282 ms/quadro. Performance melhora o Normal atual, mas fica 37,4% abaixo do FPS histórico, com p95 100% maior e estilo por quadro 35,2% maior. O critério de empatar/superar o baseline **não foi atendido**; não é medição num notebook físico.

**Validação.** Frontend completo: 215 arquivos passaram, 2 ignorados; 3.372 testes passaram e 3 foram ignorados. Typecheck, lint, build, inventário de canvas e harnesses focados passaram; o novo teste do baseline fechou em 16/16. `npm test` teve 3 falhas dependentes do perfil local: duas em `agent-session-discovery` (metadados de fixture ausentes) e uma em `pty-process-manager` (`CODEX_HOME` do perfil herdado), fora dos arquivos alterados. CI [`41676452685`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/41676452685) passou em Windows, Linux, ARM, macOS e Canvas smoke. Release Gate [`41677473109`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/41677473109) e Release [`41677540943`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/41677540943) passaram; [`v0.1.497`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.497) é Latest. O segundo CI [`41680750421`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/41680750421) passou nos cinco alvos; Release Gate [`41681888547`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/41681888547) concluiu sem publicar nova versão porque o commit só alterou harness/documentação.

**Acompanhamento.** A tarefa original continua em andamento. A subtarefa [recuperar o baseline pré-44f8cec](https://app.notion.com/p/Felixo-AI-Core-Performance-recuperar-o-baseline-pr-44f8cec-no-Modo-Performance-40d91f95497e81ce8846f7f454a41e16) cobre a otimização e a medição no hardware físico quando disponível. Os relatórios brutos permaneceram em `%TEMP%`, fora do repositório.

## 2026-11-03 — Performance: comparação calibrada e validação física pendente

**Atualização.** Esta entrada sucede a comparação exploratória e o estado de acompanhamento da
entrada anterior. O commit `f23da83` calibrou o harness para exigir dois toggles concluídos por
rodada e calcular FPS pelo tempo real amostrado; também deixou de montar a grade pontilhada no
Modo Performance. A documentação da comparação foi atualizada em `f47b496`.

**Resultado registrado.** No Windows x64, com renderer por software, throttle de CPU 4×, 48 nós,
31 arestas, um aquecimento e cinco rodadas de 3 s por condição, o baseline `b9e3555` registrou
42,18 FPS, p95 de 49,975 ms e 1,442 ms de estilo por quadro. O Modo Performance atual registrou
43,88 FPS, p95 de 49,9 ms e 0,892 ms de estilo por quadro. Os três critérios sintéticos foram
atingidos; a carga do host variou de 18% a 54%. O paint por quadro ficou 3,7% acima do baseline,
fora dos três critérios de aceite. Condições e resultados completos estão em
`docs/performance/PERFORMANCE.md` e `docs/projeto/POLITICA-PERFORMANCE.md`.

**Validação desta atualização.** Os números foram conferidos com os documentos da comparação
calibrada já registrados no repositório; o benchmark não foi repetido nesta atualização. A edição
do resumo e desta entrada foi pontual: uma automação específica teria custo maior que a correção
de contexto.

Estado: comparação sintética concluída; validação no notebook físico de referência pendente de
acesso à máquina.

## 2026-11-03 — Sugestão de Modo Performance por carga

**Pedido.** Sugerir ou ativar o modo quando o canvas ficar carregado, com aviso e escolha da pessoa.

**Entrega.** `CanvasPerformanceSuggestion` usa `classifyPerformanceScenario` após a hidratação:
10 sessões de terminal ativas ou 300 blocos mostram uma sugestão. Sessões encerradas ou com erro
não contam. A pessoa escolhe ligar ou dispensar; a resposta é salva separadamente da sugestão por
hardware. Sem armazenamento, vale durante a sessão. O modo pode ser desligado em Configurações.

**Validação.** Testes focados: 4/4; frontend completo: 3.376 passaram e 3 foram ignorados;
inventário: 9/9; lint e build passaram. A instância de desenvolvimento abriu com perfil isolado e
canvas hidratado. Os cliques no aviso sob carga não foram exercitados no Electron; os testes
invocam as ações e verificam persistência e ativação. O DevTools da instalação empacotada estava
indisponível; a instância de desenvolvimento foi encerrada após o smoke.

Estado: implementação e testes locais concluídos; validação visual sob carga pendente.

## 2026-11-03 — Reduced motion do sistema em todo o canvas

**Pedido.** Combinar a preferência `prefers-reduced-motion` com o Modo Performance
nas superfícies que ainda consultavam somente a opção do app.

**Entrega.** `CanvasAmbientLayer` deixa de montar o campo de estrelas, e `CanvasView`
oculta o minimapa quando o sistema pede menos movimento ou o Modo Performance está
ligado. A preferência continua acompanhada em tempo real pelo hook compartilhado;
isso não altera a opção persistida do app. A regra conjunta está em
`shouldReduceMotion` no módulo de acessibilidade.

**Validação.** A preferência foi emulada na instância de desenvolvimento isolada via
Playwright/CDP. No modo normal, estrelas e minimapa estavam presentes; em
`prefers-reduced-motion: reduce`, ambos desapareceram; ao restaurar `no-preference`,
ambos voltaram. Teste focado 4/4; inventário 9/9; frontend 3.377 testes passaram e 3
foram ignorados. Typecheck/build, lint e `git diff --check` passaram.

Estado: concluído; a preferência do sistema e o Modo Performance aplicam o mesmo corte
às superfícies de movimento do canvas.

## 2026-11-03 — Performance: avaliação de telemetria opt-in

**Pedido.** Avaliar se vale instrumentar o uso do Modo Performance antes de criar
telemetria. O usuário esclareceu que os dados serviriam para calibrar as
recomendações por carga e priorizar melhorias.

**O que foi observado.** `classifyPerformanceScenario` considera o canvas carregado
a partir de 10 terminais ativos ou 300 nós. `CanvasPerformanceSuggestion` mostra
uma recomendação com opções de ligar ou dispensar, mas só persiste um marcador
local `answered`; não conta exibições nem distingue as respostas. Os contadores
propostos na tarefa original só cobririam ativações e não permitiriam medir o
funil da recomendação. Não existe SDK, coletor ou endpoint de analytics no app.

**Decisão.** O usuário escolheu desenhar um piloto opt-in, sem implementar coleta
nesta etapa. O desenho deve avaliar exibições e respostas agregadas por faixa de
carga, manter consentimento explícito desligado por padrão, excluir conteúdo de
terminal e explicar o viés de amostra. Ver a [task de desenho do piloto](https://app.notion.com/p/Felixo-AI-Core-Performance-desenhar-piloto-opt-in-para-calibrar-recomenda-es-por-carga-40d91f95497e813f85b4dc6b5ef11d93).

## 2026-11-03 — Performance: recuperação após encerramento anormal

**Pedido e entrega.** A sessão passa a ter um marcador por processo no perfil.
Uma interrupção ou falha do renderer principal ativa o Modo Performance antes
de montar o workspace na próxima abertura e exibe o motivo. O aviso é dispensável,
o toggle continua manual e nenhum registro de canvas ou terminal é removido.
Instâncias ainda vivas não são tratadas como falhas.

**Validação local.** Quatro testes do serviço passaram, cobrindo saída normal,
interrupção, falha de renderer e instância concorrente. A suíte frontend teve
3.377 testes aprovados e 3 ignorados; lint, build e inventário passaram. Em
Electron com perfil temporário, uma saída abrupta com código 23 foi seguida de
reabertura com modo ligado, aviso e nota persistida; o fechamento normal seguinte
não repetiu o aviso. Um evento de falha do renderer foi simulado em outra sessão,
e o toggle em Configurações desligou o modo e persistiu após reload.

`npm test` terminou com erro em testes alheios à mudança. Reexecutando apenas
`agent-session-discovery` e `pty-process-manager`, 87/90 passaram: os dois testes
de descoberta de sessão e um de isolamento do perfil falharam, como na task
[existente de isolamento](https://app.notion.com/p/Felixo-AI-Core-Testes-isolar-agent-session-discovery-e-CODEX_HOME-do-perfil-local-40d91f95497e811ea808d8c03a40bff5).

**Limite.** O marcador identifica encerramento anormal, sem identificar a causa;
ele não recupera alterações que ainda não haviam sido gravadas na interrupção.
A verificação de processo vivo usa PID e pode confundir PID reutilizado com a
instância original, deixando de detectar aquela interrupção.

## 2026-11-03 — Layout: clique sob o inspetor recolhido

**Investigação.** O inspetor atual usa `inert` e `pointer-events: none` quando
recolhido; a faixa fantasma descrita na task não se reproduziu após o redesenho.
Em Electron com perfil isolado, cliques reais num alvo sob a dock e no botão de
reabertura passaram em 320 e 768 px. Uma regressão injetada que torna a camada
recolhida clicável fez o mesmo teste falhar.

**Entrega.** O smoke do canvas protege esses cliques e o inventário deixa de
apontar o defeito antigo como presente. Inventário 9/9, lint e build passaram.
Em 320 px com a sidebar expandida, ela interceptou o botão de recolher o
inspetor; essa sobreposição diferente precisa de acompanhamento.

## 2026-11-04 — Layout: painel de ferramentas em viewport estreita

Em Electron, o painel Buscar ultrapassava a janela de 320 px (direita em
328 px). O CanvasPanel agora limita a largura visual ao espaço na viewport;
quando a sidebar expandida ocupa quase toda a janela, o painel se posiciona
sobre ela. O cálculo compartilhado de largura da sidebar e da gaveta continua
inalterado.

O smoke verifica os limites do painel em viewports críticos; o inventário foi
atualizado. No Electron isolado, o painel coube em 320 px e seu botão de fechar
funcionou com a sidebar expandida. Os 48 testes de dimensionamento, os nove do
inventário, lint e build passaram. O build mantém o aviso de chunks grandes.

## 2026-11-04 — Layout: "Selecionar" e "Enquadrar" colavam com fonte maior

**Pedido.** Task de 25/09/2026, achada na matriz visual (cenário
`fonte-maior-320`): com a fonte base em 137,5%, os dois botões lado a lado da
seção ORGANIZAR liam "SelecionarEnquadrar". Agente Tasks OpenIA + AI Core.

**Medido.** O espaço entre os botões existia (`gap: 0.22rem`). Em 320 px e
137,5%, a grade fixa de duas colunas deixava cada botão com 67 px para um
conteúdo de 69 px: o ícone SVG encolhia até 0 px e o texto vazava da caixa,
sobrando 5 px entre os rótulos (16 px na fonte normal). Com a borda
transparente, os dois liam como uma frase só.

**O que mudou.** `.felixo-sidebar-button-grid` passou de grade fixa a
`flex-wrap`: cada botão tem `flex: 1 1 0` e `min-width: max-content`, então
ficam lado a lado e com a mesma largura enquanto cabem, e cada um desce para a
própria linha quando não cabem. O recuo lateral caiu de 0.35rem para 0.2rem:
com o conteúdo centralizado ele só define a largura mínima, e com 0.35rem os
dois botões já quebravam de linha na fonte normal, mesmo em 1280 px (medido no
Windows, Segoe UI): o par cabia na grade antiga por menos de 1 px. A fonte é a do sistema, mais larga no Linux; lá a quebra acontece
mais cedo, em vez de o ícone sumir.

**Validação.** Asserção nova no smoke
(`checarDimensoesDeAcessibilidadeAdicionais`): reprova se o ícone de algum
botão da grade tiver menos de 14 px ou se o conteúdo passar da caixa. Antes da
correção, a sessão A falhou nas 3 tentativas (ícone 0, conteúdo 69,4 numa
caixa de 67); depois, passou na primeira. No Electron isolado, fonte normal em
320 e 1280 px: caixas iguais às de antes (60–144 e 148–232), ícones de 15 px.
Em 137,5%, um botão por linha, com 141 px. Lint, build e os 9 testes do
inventário passaram; o build mantém o aviso de chunks grandes.

## 2026-11-04 — Performance: o gate de regressão entre commits fica fora; tempo só no relatório

**Pedido.** Task de 25/09/2026 "devolver métricas de tempo ao gate e conter a
deriva do baseline móvel". Agente Tasks OpenIA + AI Core.

**Achado.** O gate (`app/scripts/benchmark-regression-gate.cjs`) não roda em
nenhum workflow desde o PR #124 (19/10/2026), que o tirou do CI junto com os
benchmarks. O `app/benchmarks/README.md` e o cabeçalho do script ainda o
descreviam como ativo no CI de cada PR.

**Medido.** Relatórios `terminal-scrollback-<os>.json` dos artefatos
`medicoes-<os>` de 15 noites do `Nightly` (20/10 a 03/11/2026), 4 sistemas, 8
cenários `renderer-xterm`. Com o MESMO commit (`49528bd` em 4 noites,
`b36bf81` em 3; 64 grupos), a amplitude típica foi 46% no resume, 2,7% no
frame p95, 23% no long task p95, 5,7% no RSS p95 e 15% no heap; os piores
casos, +111,5%, +139%, +115%, +20% e +131% (este em `count=1`, abaixo do piso
de 32 MiB). Contra a mediana das 5 noites anteriores, o resume ainda passou de
+190% num cenário do macOS. Cada execução do benchmark leva 52–88 s por
sistema.

**Decisões do Felipe** (perguntadas com as medições): o gate fica fora e a
task se resolve em documentação; as métricas de tempo ficam só no relatório;
se o gate um dia voltar, ele avisa no resumo do job em vez de reprovar.

**O que mudou.** README dos benchmarks (seção "Gate de regressão entre
commits": uso manual, histórico, tabela de ruído e as decisões) e o cabeçalho
do script. Testes do gate 21/21, eslint sem erros.

**Não medido.** Repetir o cenário N vezes por execução e comparar a mediana.

## 2026-11-04 — Performance: harness combinado de muitos agentes no mesmo renderer

**Pedido.** Task de 25/09/2026 "harness combinado de muitos agentes com DOM,
listeners, timers e crash", pendente da rodada que criou o gate de regressão.
Agente Tasks OpenIA + AI Core.

**O que mudou.** `scripts/canvas-many-agents-benchmark.cjs`
(`npm run benchmark:many-agents`) sobe o `dist` de produção com o lançador do
`ui-render-performance.cjs`, agora exportado e aceitando variáveis de ambiente
extras. Os agentes usam a CLI roteirizada do processo principal
(`FELIXO_DEVTOOLS_MOCK_PTY=0`, `FELIXO_DEVTOOLS_FAKE_CLI_PTY=1`): cada um recebe
`__felixo_smoke_stream__` a cada 3 s pelo `pty:write` (`canvas:<id do bloco>`).
Junto, os blocos e as conexões do fixture do `ui-render`, uma conexão de cada
agente a uma nota, o painel Buscar e a gaveta de um terminal abertos, zoom
girando e um refresh com os agentes vivos. Mede abertura, carga, refresh, frame,
long task, entrada → quadro, RSS por `app.getAppMetrics`, e, em quatro pontos de
controle, DOM, listeners e documentos (`Performance.getMetrics`), heap e timers
vivos (script injetado antes do app). Também detecta queda do renderer e agente
sem saída. O `--check` usa as metas da `POLITICA-PERFORMANCE.md`. O relatório
tem os campos do `terminal-scrollback`, para o `benchmark-regression-gate.cjs`
comparar à mão.

**Decisões do agente.** Não pluguei no gate nem em workflow: o Felipe decidiu
hoje, na task do gate, mantê-lo fora do CI e as métricas de tempo só no
relatório; o harness segue a mesma linha e roda à mão. A janela é mostrada sem
foco e com opacidade 0 (escondida, o rAF cai para ~2 fps); o relatório grava o
fps ocioso e o `--check` ignora o frame abaixo de 30 fps. Entrada → quadro, RSS,
heap, DOM, listeners e timers ficam só no relatório, porque a política não tem
meta para eles.

**Medido** (Windows 11, `dist` de `a25e73e`, 15 s de carga, uma execução por
cenário): Leve, 9 agentes e 309 blocos — frame p95 83 ms, long task p95 78 ms,
refresh 0,70 s, RSS do renderer p95 715 MiB; Carregado, 20 agentes e 320 blocos
— frame p95 116 ms, long task p95 101 ms, refresh 0,71 s, carga 2,99 s, RSS do
renderer p95 722 MiB e do app 1.791 MiB. Os dois dentro das metas. Durante a
carga do Carregado os listeners ficaram em 4.855 → 4.856, o DOM subiu 130 nós e
os timeouts vivos foram de 1 a 40, voltando a 23 depois do refresh. Todos os
agentes produziram saída; nenhuma queda.

**Validação.** `canvas-many-agents-benchmark.test.cjs` 7/7 (inclui o contador
de timers com agendar, disparar e cancelar), `ui-render-performance.test.cjs`
17/17, eslint sem erros. README dos benchmarks, política de performance e Guia
do Desenvolvedor atualizados; a frase do README que punha o benchmark de
terminal "no CI" passou a dizer `Nightly`.

**Não validado.** Linux e macOS (a bancada usa só APIs do Electron e do CDP,
mas não rodou lá); repetição de cada cenário; o refresh mede até o canvas
hidratado, não até cada terminal redesenhar o histórico.

## 2026-11-04 — Benchmark operacional: o detector de órfãos do Windows comparava só o PID

**Pedido.** Task de 25/09/2026 "yarn-classic deixa processo órfão intermitente no
benchmark operacional do Windows", complementada em 29/10 com a mesma falha no
npm-runtime. Agente Tasks OpenIA + AI Core.

**Medido.**
- Frequência: no `Nightly`, o órfão reprovou 1 de 41 execuções (29/10,
  `40874224575`, npm-runtime, 10 agentes, fase fria, PID 1236). As 10
  instalações saíram com código 0, e o relatório não guardava nome do processo.
- Causa: `windowsProcessIdentitiesScript` montava `$ids=[1,2]` com
  `JSON.stringify`. No PowerShell, `[...]` é um tipo: o script sai com erro de
  sintaxe (código 1, conferido rodando o script). `currentWindowsProcessIdentities`
  devolvia `null` e `findOrphans` caía em `process.kill(pid, 0)`, sem conferir
  nome nem data de criação. Existe desde `c34eaa9` (04/09/2026). A espera de 6 s
  do PR #66 aumentava a janela para um PID ser reaproveitado.
- Reaproveitamento de PID neste Windows 11: em 3 rodadas de ~440 processos curtos
  (10 filas paralelas de `cmd`/`node`), 1, 0 e 2 PIDs já mortos voltaram a
  responder em menos de 6 s, ocupados pelo navegador. É a mesma raridade das
  falhas.
- Sem regressão: a data de criação sai igual nos dois scripts
  (`/Date(1793801673893)/`), então um órfão real continua casando nome e data. A
  configuração do `Nightly` (`--iterations=2 --agents=1,2,5,10 --check`) passou
  aqui em 2 min 28 s, com npm-runtime e pnpm (yarn-classic não está instalado
  nesta máquina).

**O que mudou.** A lista vai como `@(1,2)`. A mesma consulta passou a trazer o
pai e a linha de comando. Quando sobra órfão depois do prazo, a fase grava em
`orphans` nome, pai, data de criação e linha de comando (sem a pasta temporária
nem a do usuário) e observa mais 20 s para anotar se ele saiu (`exitedAfterMs`).
A mensagem do `--check` traz nome e destino de cada órfão. O veredito não mudou.
README dos benchmarks atualizado, inclusive a frase que punha a bancada no CI e
no Release (hoje só no `Nightly`).

**Validação.** `package-manager-operational-performance.test.cjs` 25/25 (5
novos). O teste com um `node` vivo de verdade falhava antes da correção ("o
processo vivo não foi encontrado") e passa depois. eslint sem erros. Não rodei o
`npm test` completo: nesta máquina ele abre janelas `git-askpass` (task aberta
mais cedo, 40e91f95-497e-818e).

**Não validado.** O yarn-classic no Windows (não instalado aqui) e a ausência de
órfão no Nightly com a correção, que só as próximas noites mostram.

## 2026-11-04 — Inicialização: uma instância por pasta de dados, launcher sem reinstalação falsa e .desktop sem MimeType repetido

**Pedido.** Task de 25/09/2026 "impedir segunda instância do app e parar a
reinstalação falsa de dependências no launcher", com o complemento de 29/10 (o
segundo gatilho do boot era a limpeza do cache das CLIs, corrigida na v0.1.494;
a trava seguia como defesa). Agente Tasks OpenIA + AI Core.

**Trava de instância única.** `electron/core/single-instance.cjs` pede
`app.requestSingleInstanceLock()` logo depois do `userData` definido e antes da
GPU e do marcador de sessão; sem a trava, `app.exit(0)`. Medido com o Electron
do projeto: `app.exit(0)` e `process.exit(0)` antes do `ready` não deixam o
código seguinte rodar. Em `second-instance`, um `.fxai/.fxchat/.fxworkflow` do
`argv` vai para o `handleFileOpen` (resolvido na pasta de origem); senão a
janela é restaurada, mostrada e focada (`focusMainWindow`). O release smoke não
pede a trava. O relançamento de GPU do AppImage sobe o processo novo antes de o
velho sair: `gpu-launch.cjs` libera a trava antes de relançar e a retoma se
falhar (e sai se outra abertura a pegou).

Prova no Electron real (fonte, perfil isolado), A aberta e B na mesma pasta com
um `.fxai`: com a correção, B saiu em 549 ms com código 0, o arquivo chegou a A
(`file:opened`, mesmo caminho) e `performance-recovery/` continuou só com o
marcador de A; um app numa pasta diferente seguiu vivo depois de 10 s. Com o
`main.cjs` antigo, B ainda estava vivo depois de 20 s, o arquivo não chegou a A
e B deixou o próprio `<pid>.json` na pasta de A, que a próxima abertura poderia
ler como encerramento anormal.

**Launcher.** `felixo_launcher/node_deps.py` resolvia os imports com as
condições padrão do Node. O `@excalidraw/excalidraw` 0.18.1 exporta `./*` só em
`types` e `./index.css` só em `development`/`production`, então os três imports
do canvas contavam como faltando e cada abertura rodava `npm install`
(reproduzido no Windows). Agora resolve com `--conditions=development
--conditions=types` e confere se o arquivo resolvido existe, porque
`import.meta.resolve` não confere (medido): pacote ausente e arquivo ausente
continuam acusados. Teste novo com um pacote falso no formato do Excalidraw
(falhava com os 3 falsos positivos); no app real, 35 imports externos e nada
faltando.

**.desktop.** O electron-builder 26.15.3 monta o `MimeType` com
`asArray(linux.mimeTypes)`, que devolve o próprio array da configuração, e
empurra nele os tipos das `fileAssociations`. Chamando o
`LinuxTargetHelper.computeDesktopEntry` real uma vez por alvo, a linha tinha 6,
9 e 12 tipos; sem `linux.mimeTypes` (as associações já declaram os tipos), 3, 3
e 3. Teste novo em `package-build-config.test.cjs`, que falha com o
`package.json` antigo.

**Validação.** `single-instance.test.cjs` 4/4; `gpu-launch.test.cjs` com a
ordem nova (libera a trava, relança, sai; ou retoma a trava) e um caso novo;
testes que leem o `main.cjs` 32/32; launcher 105 testes OK; eslint sem erros;
sessão A do smoke do canvas ok em 111611 ms (sobe e encerra o app várias vezes, por perfis isolados). Não rodei o `npm test` completo: nesta
máquina ele abre janelas `git-askpass` (task 40e91f95-497e-818e).

**Não validado.** O app instalado aberto duas vezes por ícone/autostart (a prova
foi com o app de fonte); Linux e macOS (o caminho do `open-file` do macOS não
mudou); o AppImage relançando com a trava; o próximo boot do Felipe.

## 2026-11-04 — Testes: o npm test passa a rodar com um temporário só dele

**Pedido.** Task de 25/09/2026 "limpar as pastas felixo-* que o npm test deixa no
diretório temporário". Agente Tasks OpenIA + AI Core.

**Medido.** Com `TEMP`/`TMP`/`TMPDIR` apontando para uma pasta vazia (para não
misturar com outros agentes), a suíte Node deixa **203 entradas** por execução,
igual em três medições: 63 `felixo-openia-image-`, 35 `felixo-cli-`, 20
`felixo-devtools-test-`, 12 `felixo-pedidos-`, 11 `felixo-paths-` e o resto em
poucas unidades, vindas de 22 arquivos de teste (13 deles não removem nada). No
temporário real desta máquina havia 23.509 entradas `felixo-*` acumuladas; não
apaguei nenhuma, porque entre elas está a `felixo-release-smoke-*` de onde o
Felixo do Felipe roda.

**O que mudou.** `scripts/run-node-unit-tests.cjs` cria `felixo-testes-<pid>-…`
(`scripts/test-support/temporario-dos-testes.cjs`), roda a suíte com
`TEMP`/`TMP`/`TMPDIR` apontando para ela, conta o que os testes deixaram, apaga a
pasta e imprime uma linha com o total e as maiores origens. A pasta de uma execução
interrompida é apagada pela próxima, se o pid dela já não existir. Optei por isso
em vez de consertar os 22 arquivos: cobre os de hoje e os de amanhã com uma mudança
só. Os testes continuam vazando dentro da pasta da execução; a linha final mantém
isso visível, e rodar um arquivo direto (`node --test arquivo`) segue usando o
temporário real.

**Validação.** Executor real com uma pasta base limpa: 3.101 testes, 0 falhas, 204
entradas deixadas e removidas, e a pasta base com 0 entradas antes e depois.
`temporario-dos-testes.test.cjs` 7/7; eslint sem erros.

**Dois achados.**
- O teste do `/status` do Codex (`codex-status-screen.test.cjs`) falha com `TEMP`
  de 116 caracteres ou mais (112 passa), porque o rodapé da tela quebra e a pasta
  de trabalho não é reconhecida. A pasta do runner soma cerca de 27 caracteres ao
  `TEMP` de quem roda.
- As janelas `git-askpass` que apareceram hoje cedo vêm do Git Bash:
  `SSH_ASKPASS=/ucrt64/bin/git-askpass.exe` e `DISPLAY=needs-to-be-defined`. Com
  essas variáveis vazias, `system-design-service.test.cjs` passa em 0,9 s; pelo
  PowerShell também, em 0,6 s, sem janela. A correção anterior no registro
  (“o app abre a janela sem pedir”) estava exagerada: o gatilho é o ambiente.

**Não validado.** Linux e macOS (o runner usa só `fs`/`os`/`path`); o tempo de
remoção da pasta num Windows com antivírus pesado (aqui, instantâneo).

## 2026-11-04 — Benchmark de scrollback: a perda de saída do PTY nativo no Windows vinha da carga de PowerShell da própria bancada

**Pedido.** Task de 25/09/2026 "sessão PTY para no meio no benchmark de scrollback
do Windows (count=20)", aberta há 40 dias com seis atualizações e uma quarentena.
Agente Tasks OpenIA + AI Core.

**Medido.**
- No `Nightly`, 7 das 15 noites de 20/10 a 03/11 perderam saída no `count=20` do
  Windows; 0 em 225 fases nos outros três sistemas e nos outros `count`. A
  quarentena deixava o Nightly verde.
- Nas 12 sessões ativas que pararam em 4 execuções, 11 pararam em `4096·k + 24`
  bytes (163.864 quatro vezes). O filho já tinha saído, o último dado veio cerca
  de 10 s antes e nada chegou nem em 3 s de espera nem depois do `kill`: a saída
  foi perdida, e não ficou presa.
- Cinco rodadas de experimento no `windows-latest`, numa branch descartável. Só
  a terceira em diante reproduziu o Nightly, ao repetir a sequência dele (bancada
  do npm-runtime, bancada de saída do PTY e só então a de scrollback) com um job
  por amostra. Nessa sequência: bancada como estava 8 de 28 (29%); com o
  repositório fora da varredura do Defender 2 de 6; `spawn` do app 0 de 7; **um
  PowerShell por amostra de memória 0 de 23 (Fisher p = 0,005)**; as duas
  mudanças juntas 0 de 14. Fora dessa sequência, em jobs de oito rodadas seguidas,
  a bancada atual perdeu 1 de 16 rodadas.
- `spawn` do app (`createNodePtySpawn`): a bancada caiu com segfault antes do JSON
  em 8 de 49 tentativas (16%) contra 2 de 63 (3%) com o `spawn` cru (p = 0,018), e
  um job de oito rodadas ficou pendurado por mais de 40 minutos.

**O que mudou.** `sumProcessRssKiB` soma a memória dos PTYs com **um** PowerShell
(`Get-Process -Id a,b,c`) no Windows, em vez de um por PID; antes eram 20 em
paralelo a cada 250 ms num runner de 4 núcleos. Duas peças permanentes de
investigação (`f893b4d`): o relatório grava `forensics` quando uma sessão para, e
as linhas e os bytes do resultado passam a ser os do momento do veredito. A
seção "Perda de saída do PTY nativo no Windows" do `app/benchmarks/README.md`
tem a tabela e os run ids.

**Decisões do agente.**
- Não troquei o `spawn` da bancada pelo do app, apesar de a hipótese de 22/10
  apontar para isso: ele reduz a perda e aumenta o crash, e o `kill()` do app é
  outro assunto (task aberta).
- A quarentena continua. Sai quando 10 Nightlies seguidos tiverem o `count=20`
  completo; é decisão que ficou registrada como task, não está no código.
- Não rodei a exclusão do Defender no Nightly: o experimento mostrou que não muda
  nada.

**Validação.** `terminal-scrollback-benchmark.test.cjs` 20/20 (3 testes novos do
`forensics` e 1 da soma de memória, com dois processos `node` de verdade);
eslint sem erros; bancada real aqui (16 núcleos, onde a perda não aparece)
com `count=1`, `5` e `20` completos e a memória dos PTYs coerente (47, 243 e 925 MiB).

**Não validado.** O mecanismo dentro do ConPTY (por que a leitura para em 4 KiB);
o efeito no Nightly de verdade, que só as próximas noites mostram; se o app real
perde saída do mesmo jeito com 20 agentes e outro trabalho criando processos.

## 2026-11-04 — Correção da entrada anterior sobre a perda de saída do PTY nativo

Duas contagens da entrada "a perda de saída do PTY nativo no Windows vinha da carga
de PowerShell da própria bancada" estavam erradas. Os testes novos são 2 do
`forensics` e 1 da soma de memória (a entrada diz 3 e 1). Das 20 sessões ativas
que pararam, somando os Nightlies (7) e o experimento (13), 19 pararam em
`4096·k + 24` bytes: o corte 163.864 apareceu 7 vezes, 167.960 quatro e 172.056
duas, e a exceção parou em 258.071 (a entrada diz 11 de 12 e quatro vezes). O
README dos benchmarks já traz os números certos. O CI do `1ac57c5` passou nos
quatro sistemas, e no Windows do CI o teste da soma de memória rodou com
PowerShell de verdade.

## 2026-11-05 — Release gate: a base do diff é o último commit coberto por um Release, não o último avaliado

**Pedido.** Task de 25/09/2026 "Release gate comparar com o último commit
publicado, não só com HEAD^", com cinco ocorrências reais anotadas (28/09, 29/09,
30/09, 05/10 e 08/10). Agente Tasks OpenIA + AI Core.

**Medido.**
- A correção de 13/10 (`a90e91e`, `release-base.sh`) já tinha trocado `HEAD^` pelo
  último commit que o próprio gate avaliou com sucesso. Isso resolve o cenário da
  task (CI do commit de app falhou, o seguinte é de documentação: o gate pulado
  não conta como avaliado), mas deixa uma brecha: o gate aprova o commit de app, o
  Release despachado falha, e o commit de documentação seguinte compara com esse
  commit "avaliado", vê só documentação e não publica nada, sem aviso.
- Desde 21/09: 114 runs do `release.yml` (106 com sucesso, 4 falhas, 3 cancelados,
  1 pulado). Depois de cada falha ou cancelamento, o próximo Release que publicou
  veio em 0,1 a 0,5 h, menos em 05/10 (44,5 h, com CI vermelho no meio). Ou seja,
  alguém notou e republicou; nenhum caso da brecha foi flagrado, mas nada no gate a
  impedia.
- 188 gates com sucesso desde 21/09: 108 despacharam Release e 80 decidiram "não
  relevante". Só 2 dos 80 aconteceram com outro Release ainda rodando.

**O que mudou.**
- `release-base.sh`: a base é o commit mais novo já **coberto** por um Release:
  publicado (o commit da tag de cada release fora de pré-release, `gh release list`)
  ou em andamento (a run do `release.yml` na fila ou rodando; o título dela traz o
  SHA). `release_base` passou a escolher o mais novo da linha do head, em qualquer
  ordem; `release_candidates` monta a lista; `release_covered` pula o commit que já
  tem Release.
- `release.yml`: `run-name: Release ${{ inputs.commit_sha }}`, para o gate ler o
  SHA nos títulos. Sem o título, um commit de documentação validado com o Release
  de app ainda rodando despacharia outro Release e cancelaria o primeiro, que é o
  que o cabeçalho do gate diz evitar.
- `release-gate.yml`: usa as duas listas em vez dos 1.000 gates anteriores. Falha ao
  listar vira lista vazia, e sem base o gate publica, como antes.
- `GUIA-DESENVOLVEDOR.md` e `POLITICA-VERSIONAMENTO.md` (esta ainda dizia que o gate
  olhava só o último commit do push).

**Validação.** `release-base.test.sh` com 20 casos, seis dos quais falham contra o
`release-base.sh` antigo (inclusive "o Release de R falhou: o commit de
documentação ainda publica" e "o Release de R está em andamento: o commit de
documentação não publica"); os outros cinco `*.test.sh` do `.github/scripts`
passam. O bloco `run:` do passo do gate, executado localmente contra os dados
reais do GitHub, deu: `916f1ca`, `1ac57c5` e `ef9ae2d` "não relevante";
`02f245b` (o `main.cjs`) "relevante" com base na v0.1.505; `745d079`, que já tem
release, "já tem Release". Um comentário meu no `release.yml` citava o caminho do
`release-base.sh` e o `release-relevant.test.sh` o tomou por entrada do Release:
reescrevi sem o caminho.

**Não validado.** O gate de verdade: o primeiro run com esta mudança é o do
próprio commit (ele mexe no `release.yml`, que é relevante, e publica uma
versão). Que o `actions/checkout` com `fetch-depth: 0` traga as tags (sem elas a
lista de publicados fica vazia e o gate publica por precaução, o que aparece no
log). Que `gh run list --status` devolva o título com o `run-name` nas runs em
andamento.

**Validação em produção (gate do `45594f9`, 05/11/2026 08:26).** O log dele
trouxe "Último commit coberto por um Release: e17a2c2", que é o commit da
v0.1.506, a última publicada: o `actions/checkout` com `fetch-depth: 0` trouxe as
tags e a lista de publicados funcionou (a base antiga, o último gate avaliado,
seria `916f1ca`). A run do Release saiu com o título `Release 45594f92…`, então
o `run-name` chega ao `gh run list`. O CI do commit levou 19 s porque o
`ci-scope.sh` pulou os jobs de app (só workflows, scripts e documentação
mudaram). Seguem sem aparecer em produção: um Release que falha seguido de um
commit de documentação, e a lista de publicados vindo vazia.

## 2026-11-05 — Padrão de qualidade, terceira passada: janela de senha do Git, alertas de dependência, IA.md compactado e GitHub limpo

**Contexto.** Pedido do Felipe, com uma captura do GitHub Desktop que mostrava um PR aberto e duas branches além
da `main`: colocar o repositório no padrão de qualidade do Felixo System Design, treze dias depois da segunda
passada (entrada de 2026-10-23). A régua não mudou: o clone local `Felixo-System-Design` está no `cc4aae7`, o mesmo
commit das duas passadas anteriores. A auditoria seguiu o Guia Mínimo de Qualidade (13 itens e checklist), a
política de git, o template de `IA.md`, o guia do `start_app.py` e o de README. A leitura das duas entradas
anteriores evitou refazer o que já estava conforme.

**Já conforme, medido de novo, não refazer.** `start_app.py --help` responde; `requirements.txt` com hashes e
`package-lock.json` versionado; CI em matriz de quatro sistemas; nenhum padrão de segredo fora de testes (chave
privada, `ghp_`, `github_pat_`, `sk-ant-`, `AKIA`, `AIzaSy`) e só o `.env.example` versionado; 168 links relativos
válidos em 148 `.md` (o verificador achou os 2 erros plantados no controle negativo); README com Índice, Estrutura do
repositório, Licença e contribuições e Autor; raiz sem script solto. No GitHub: secret scanning, push protection e
Dependabot de segurança ligados, `main` protegida com 12 checks obrigatórios, branch apagada ao mesclar, licença MIT.

**Gate medido antes de mexer** (Windows 11, Node 25.3.0, npm 11.6.2, Python 3.14.2, `95c8283`): `tsc -b` e
`eslint .` limpos; Python 105 testes OK (2 pulados); Node 3104 testes, 3094 passam, 0 falham, 9 pulados e **1
cancelado por timeout de 45 s**; vitest 216 arquivos e 3377 testes passam (3 pulados), com 4 workers; `test:native`
9 de 9; `npm audit` completo com **51 avisos (48 moderados, 3 altos)** e a produção em 0.

**O estado do GitHub que a captura mostrava.** PR #132 do Dependabot (Electron 41 para 42, `undici`, `fast-uri`)
aberto desde 26/10 e bloqueado por um check de launcher que a `main` já tinha consertado; 22 alertas de Dependabot
abertos (8 altos: `electron` e `undici`), todos em `app/package-lock.json` e de desenvolvimento; 1 alerta de secret
scanning; a branch `fix/abrir-terminal-cancela-fechamento` (PR #128, fechado, com o conteúdo já na `main` em
`ac72475`); e o `dependabot.yml` pedindo 4 labels que o repositório não tinha.

**O que mudou.**

1. **O Git sem clique não abre mais a janela de senha (`d0fe333`).** O teste cancelado era um defeito de produto, o
   mesmo da pendência de 04/11. Para pedir senha por HTTPS o Git procura `GIT_ASKPASS`, `core.askpass` e `SSH_ASKPASS`
   (que o Git Bash define), e `SSH_ASKPASS_REQUIRE` só vale para o `ssh`. `GIT_ASKPASS` vazio, mas definido, no
   ambiente "sem clique" impede a busca. O teste do Git real foi de 45 s (timeout, com um `git-askpass` vivo na tela)
   para 678 ms, sem janela. Publicado na `v0.1.508`.
2. **`IA.md` da raiz compactado (`3529cc6`).** 1970 para 671 linhas; 21 seções de outubro foram para
   `IA-ARCHIVE-2026-10.md`; 0 linhas perdidas na prova independente.
3. **Dependências.** PR #132 (`bac3cfd`): Electron 41.10.7 para 42.11.16, `undici` 6.29.1 e 7.30.2, `fast-uri` 3.1.9;
   o CI do PR passou nos quatro sistemas (13 checks, 0 falhas). Publicado na `v0.1.509`. Depois, só no lock e com o
   npm do próprio projeto (`54521f0`): `npm` embutido 11.21.1 para 11.21.2 (traz `undici` 6.29.1 e `ip-address`
   10.7.5) e `zod` 4.3.6 para 4.6.7. `npm audit`: **51 para 46 avisos, altos 3 para 0, produção 0.**
4. **GitHub.** Os 4 labels do `dependabot.yml` foram criados (o aviso "labels could not be found" do #132 era de
   26/10); a branch do #128 foi apagada (recria com `git branch fix/abrir-terminal-cancela-fechamento
   8ced745fd10de14eb7d73768c615439c9c09dbdd`; o commit segue em `refs/pull/128/head`); o alerta de secret scanning #1
   foi dispensado como `used_in_tests` (o valor é um alfabeto em ordem, fabricado). Alertas do Dependabot: 22 para 5
   depois do merge do #132 (3 altos e 1 médio de `undici`, o 6.29.0 embutido no `npm` 11.21.1, e 1 médio de
   `minimatch`); o lock novo traz o `undici` 6.29.1.

**Gate depois das mudanças** (Windows 11, árvore com Electron 42.11.16 e o lock novo): `tsc -b` e `eslint .`
limpos; Python 105 testes OK (2 pulados); Node 3105 testes, 3096 passam, 0 falham, 0 cancelados, 9 pulados (94 s);
vitest 216 arquivos e 3377 testes passam (3 pulados); `test:native` 9 de 9; `npm audit` com **46 avisos moderados,
0 altos, 0 críticos** e a produção em 0. No Release `v0.1.509` os relatórios de smoke do instalador (`pty.ok`,
`contextDelivery.ok`, `npmRuntime.ok`) deram verdadeiro nos três sistemas, e o do Windows, comparado com o da
`v0.1.508` (Electron 41), só difere em tamanho (instalador 190,6 para 195,6 MB) e tempo (abertura 522 para 414 ms);
`installerKill.control=false` é igual nas duas versões, ou seja, é desenho. O app aberto de fonte com `node
electron/cli/felixo.cjs devtools launch` (perfil isolado) mostrou `Electron/42.11.16` e `Chrome/148` e renderizou o
canvas.

**Armadilhas de método, para a próxima pessoa.**

- **Neste disco (`J:`), `fs.rmSync` volta sem erro e não apaga o arquivo; `fs.unlinkSync` apaga.** Medido com Node 25.3.0
  no Windows: no `C:` os dois funcionam. Um script de limpeza que use `rmSync` aqui deixa lixo na árvore.
- **`gh pr edit` exige o escopo `read:project` no token.** Para rotular um PR sem ele: `gh api -X POST
  repos/<dono>/<repo>/issues/<n>/labels -f 'labels[]=nome'`.
- **`npm audit fix --dry-run` só propõe rebaixar** `eslint`, `electron-builder` e `npm` para majors antigas: as 46
  moderadas que sobram são `glob` e `minimatch` (no `npm` embutido e no `@electron/universal`) e dependem de o upstream
  publicar versões novas. Antes de atualizar o `npm` embutido, conferi o que o tarball traz: `npm pack npm@11.21.2` e
  ler `package/node_modules/<pacote>/package.json`.
- **O lock de dependências se edita com o npm do projeto** (`node app/node_modules/npm/bin/npm-cli.js update <pacote>
  --package-lock-only`), não com o da máquina; conferi com `npm ci --dry-run` e uma instalação limpa.
- **Um push de dependência durante um Release em andamento cancela o Release** (`cancel-in-progress` do
  `release.yml`); só o commit só de documentação é protegido pelo gate. Esperei o Release do Electron terminar antes de
  enviar o do lock.
- **`node_modules/electron/dist/electron.exe` com 4 MB e `spawn EFTYPE` ou "Exec format error" é extração
  interrompida.** Apareceu depois que encerrei à força uma árvore de `npm test` pendurada (os arquivos do `dist` têm o
  horário desse minuto; não sei se foi a causa). Conserto sem baixar de novo: `fs.unlinkSync` em `dist/version` e
  `node node_modules/electron/install.js`, que extrai do cache (`%LOCALAPPDATA%\electron\Cache`).
- **O shim global `%APPDATA%\felixo-ai-core\bin\felixo.cmd` ainda aponta para uma instalação de smoke em `%TEMP%`** e não
  tem `devtools`; de fonte, o caminho é `cd app && node electron/cli/felixo.cjs devtools launch`.
- **Um `npm test` ficou pendurado uma vez e não reproduziu.** Eram 15 arquivos do primeiro lote parados, com CPU ~0,
  por mais de 4 minutos, logo depois de um `npm ci`, com 1,6 GB de RAM livre; rodando de novo na mesma árvore, deu 3105
  testes e 0 cancelados em 94 s. Causa não achada. Das três execuções desta passada, uma pendurou.

**Observações que ficaram como estavam, de propósito.**

- Arquivos grandes, sinal de refatoração segundo o guia: `app/src/index.css` (5542 linhas), `terminal-session-store.ts`
  (3187), `CanvasView.tsx` (2516), `canvas-smoke-onboarding.cjs` (1968). Já eram conhecidos; não é escopo desta passada.
- Cinco comentários de código citam o nome de usuário "Felipe Martins" para documentar o bug do caminho com espaço
  (`cli-detector.cjs`, `cli-diagnostics.cjs`, `openia-service.cjs`, `pty-process-manager.cjs` e
  `openia-windows-limpo.cjs`): não afetam comportamento.
- O Electron 42 também não é a linha mais nova (a 45 existe no registro); a migração para uma linha suportada tem
  task própria. Não conferi o calendário oficial de suporte.
- Sobram 46 avisos moderados de desenvolvimento, sem conserto que não seja rebaixar versão.

**Não validado.** O instalador da `v0.1.509` não foi instalado nem aberto à mão neste Windows (o smoke do Release o
instala e roda no `windows-latest`). Na abertura local de fonte, o terminal (PTY) de verdade não foi exercitado: ele
está coberto pelo `test:native` (9 de 9) e pelo `pty.ok` do smoke do instalador nos três sistemas. A causa do
`npm test` pendurado e a do `electron.exe` truncado seguem sem explicação. A consulta de alertas do Dependabot depois
do push do lock fica para ser conferida (esperado: os 4 de `undici` fecham).

**Evidência.** `app/scripts/archive-ia-md.cjs --file IA.md --keep-from 2026-10-29 --apply` (prova do script e prova
independente do multiconjunto de linhas); `npm audit` antes e depois; runs do CI, do gate e dos Releases de cada
commit; verificador de links com controle negativo (fora do repositório).

**Adendo (2026-11-05, mesmo dia): o CI do primeiro push reprovou, e por quê.** O CI de `e508449` (o lock do `npm` e do
`zod` mais o registro acima) reprovou o `Validate` do Windows e o do macOS, cada um por um teste de temporização
diferente, e o Release gate ficou `skipped`: nenhuma versão com o lock novo saiu nesse commit. Cada falha tem sua
causa:

- **macOS, `terminal-scrollback-benchmark.test.cjs:414`** ("a soma de memória dos PTYs usa todos os pids de uma vez"):
  teste **meu**, de 04/11 (`1ac57c5`). Ele esperava o evento `spawn`, que só diz que o processo foi criado. No macOS do
  CI a soma dos dois `node` era 7504 KiB (uns 3,7 MiB cada, ainda subindo) contra os 40 MiB exigidos; no Windows a
  soma já passa de 99 MiB nesse instante, por isso o teste passou aqui e nos CIs de ontem. Corrigido em `33e631c`: o
  filho imprime uma marca no stdout depois de subir e o teste só mede depois de lê-la. Não reproduzi o macOS
  localmente; o `Validate (macos-latest)` do CI de `33e631c` passou.
- **Windows, `agent-usage-service-load.test.cjs:233`** ("o teto de tempo cancela os comandos em voo e a fila não
  começa"): a rodada com `refreshDeadlineMs: 100` levou mais de 2 s (o teste inteiro, 7,9 s) e a asserção
  `Date.now() - inicio < 2000` falhou. Não mudei nada: o teste passou nas duas execuções completas locais desta
  passada e no CI de `33e631c`. Fica registrado como flake visto uma vez, com 2 s de margem sobre um teto de 100 ms; a
  causa (carga do runner) não foi medida. Se repetir, vale alargar a margem ou separar o tempo de criação do SQLite.

O CI de `33e631c` passou nos quatro sistemas e o Release saiu na `v0.1.510` (os smokes dos três sistemas mostram o
`npm` embutido em 11.21.2 e `pty.ok`, `contextDelivery.ok` e `npmRuntime.ok` verdadeiros). **Dependabot, conferido
depois do lock novo na `main`: 22 alertas abertos no início da passada, 1 agora** (o `minimatch` médio, que depende do upstream); os
3 altos e 2 médios de `undici`, o `zod` e o `ip-address` fecharam sozinhos.

---

## 2026-11-05 — Layout: a barra de status deixa de encolher para 160 px e de quebrar com a gaveta do terminal aberta

**Contexto.** Task `3e791f95-497e-81bd-8e8c-de6f9e16cec5` (achado da verificação do PR #94, que acrescentou "1 bloco
selecionado" e o botão Remover à barra). Com a gaveta aberta, a barra do canvas media 160 px em 1320 px de janela e
quebrava em duas linhas; o Remover ficava fora da caixa e por baixo do inspector. Critério de aceite: com a gaveta
aberta e um bloco selecionado, a barra não quebra linha e o Remover fica visível e clicável em 768 px ou mais.

**Causa (medida no app de fonte, perfil isolado, PTY roteirizado).** A barra era `right: 18rem` para parar na borda
esquerda do inspector "Elementos", e a gaveta (irmã do canvas na linha flex, `min(720 px, 45%)`, mínimo 440 px) tira a
largura do canvas: em 1320 px a área do canvas fica com 736 px, e 736 − sidebar 288 − inspector 288 deixa 160 px. Em 768
px a conta ficava negativa e restava só o padding (32 px). No `HEAD` `474b0a7`, janela de 1320 px: barra de 240 a 446,
Remover de 560 a 682, clique no centro dele não chegava ao botão (o inspector, z 20, cobre a barra, z 18), 291 px de
conteúdo para fora e 2 px de altura extra (quebra).

**Decisão (tomada pelo agente; a task listava três saídas).** A barra passa a ir de borda a borda (`right: 0`), o
wrapper do inspector termina logo acima dela (`bottom` igual à altura da barra) e a barra encolhe o conteúdo por
container query, nunca por quebra. Isto **reverte** o comentário antigo do `TerminalsPanel`, que mandava o inspector
até a borda de baixo para não sobrar uma faixa vazia de canvas sob ele: agora a faixa é a própria barra. Descartados:
só `nowrap` com reticências (cortaria "1 bl…" no meio, pior que tirar a palavra inteira) e a barra por cima do
inspector (z maior), que mantinha a barra com 160 px e quebrava a escala de z documentada.

**O que mudou.**

1. `app/src/index.css`: `.felixo-canvas-statusbar` com `right: 0`, `container: felixo-statusbar / inline-size`,
   `overflow: hidden` e `white-space: nowrap`; bloco `@container felixo-statusbar` com quatro cortes por largura do
   conteúdo (< 40 rem: some o nome do canvas, o "Delete" e o texto do estado; < 28 rem: contagens só em número e sem a
   frase da seleção; < 13 rem: sem contagens quando há botão; < 7 rem: o botão fica só com o ícone). O que sai é
   recortado em 1 px, não removido: continua na árvore de acessibilidade. A regra do `:has()` que levava a barra a
   `right: 1rem` com o inspector recolhido deixou de valer para ela.
2. `CanvasStatusBar.tsx`: `data-corte="N"` marca o que sai em cada corte; o botão nunca tem corte, só o rótulo dele
   (4) e a tecla (1).
3. `TerminalsPanel.tsx`: wrapper com `bottom-(--felixo-statusbar-height)` e puck de `bottom-10` para `bottom-2.5`, que
   o mantém no mesmo lugar da tela (medido: 40 px da borda de baixo, 10 px acima da barra).
4. Testes: `CanvasStatusBar.test.ts` (o botão e o ícone de estado não têm corte); `canvas-smoke-matriz.cjs` ganhou
   `medirBarraDeStatus` (roda no renderer) e `findStatusbarProblems` (puro), com 5 testes em
   `canvas-smoke-matriz.test.cjs` (incluindo o estado de antes com os números medidos); `canvas-smoke.cjs` ganhou
   `checarBarraComGaveta`, chamado com a gaveta aberta em 1320×800 e 768×900, que confere uma linha, sem estouro, o
   Remover dentro da barra, na janela e recebendo o clique (`elementFromPoint`).
5. Docs: decisão em `LAYOUT-SUPERFICIES.md`, entrada `chrome-statusbar` e do dock no inventário (`chrome.ts`, com o
   `INVENTARIO-CANVAS.md` regenerado; o item de lacuna que apontava para esta task saiu e entrou o limite novo), e uma
   frase em `GUIA-CANVAS.md` e `GUIA-USUARIO.md`.

**Medido depois.** Janela de 768 a 1700 px com a gaveta aberta e um bloco selecionado: sem estouro, em uma linha, e
`elementFromPoint` no centro do Remover devolve o próprio botão. Barra de 486 px em 1320 px (contagens com a palavra,
frase da seleção e botão), 344 px em 1024 px (contagens em número e botão), 88 px em 768 px (botão só com o ícone e o
ícone de estado). Larguras naturais dos grupos: 606 px com tudo, 400 px sem o nome do canvas/"Delete"/texto do estado,
168 px sem a frase da seleção, 92 px só o botão e o ícone de estado. O teste novo reprova o `HEAD` nos dois tamanhos
(estouro, quebra, Remover fora da barra e coberto) e passa com a mudança.

**Limites.** Abaixo de ~740 px de janela com a gaveta aberta, ou com a gaveta maximizada (que deixa o canvas com ~120
px), a área do canvas é menor que a sidebar e a barra fica sob ela: é a sobreposição de 320 px já conhecida (task
`3ed91f95-497e-8114-a246-f72c73ae50c4`). Os cortes foram medidos no Windows; a folga entre cada limite e o que o corte
seguinte pede (28 contra 25 rem, 13 contra 10,5, 7 contra 5,8) cobre a diferença de fonte entre sistemas, mas só o CI
do macOS e do Linux confirma. O clique no Remover continua sem teste que remova de verdade (task
`3ec91f95-497e-818f-b9f2-f9710605c303`). Tema claro e alto contraste não foram olhados com os cortes ativos. Na
primeira execução do `canvas-smoke` sessão A (3 tentativas) o `page.screenshot` do primeiro caso da matriz (320×720)
estourou 30 s e a sessão passou na repetição ("passou-com-instabilidade"); uma segunda execução, com uma tentativa só
(`FELIXO_SMOKE_TENTATIVAS=1`), passou de primeira. O cenário novo passou nas três passagens; a causa do estouro de
30 s não foi achada.

**Adendo (2026-11-05, depois do push): CI e Release.** O CI de `e1f6c9f` (run 42048717046) passou em Windows, macOS,
Ubuntu, Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`, que roda o cenário `checarBarraComGaveta` no Linux/xvfb; o Release
gate (run 42049624490) e o Release (run 42049666406) saíram verdes e publicaram a `v0.1.511`, com as etapas "Validate
installed release artifact" em `ok: true` nos três sistemas. **Não conferido:** o cenário novo no Windows e no macOS do
CI, porque o smoke do canvas só roda lá na Nightly das 06:00 UTC (a de 06/11/2026 é a primeira conferência; task aberta
no Notion para ler o resultado, no tema de alto contraste e com a sidebar recolhida). Task aberta também para o estouro
de `page.screenshot` da primeira execução local do smoke.

---

## 2026-11-05 — Deps: o `npm ls --all` volta a sair com 0, o lightningcss já estava alinhado e o lockfile ganha um guarda

**Contexto.** Task `3e791f95-497e-81bc-a366-c4f58fc01463` (aberta em 26/09/2026, na migração para o Tailwind 4, PR #93): o
Tailwind 4.3.3 fixa o lightningcss 1.32.0, o Vite 8 traz o 1.33, e o lock teria resolvido o binário opcional
`lightningcss-linux-x64-musl` para o 1.33, com `npm ls --all` saindo em `ELSPROBLEMS`. Pedido: alinhar as versões e
confirmar que o `npm ls --all` sai com 0.

**O que a medição mostrou (05/11/2026, Windows, Node 25.3.0).**

1. **O lightningcss já estava alinhado.** No lock de hoje, o `@tailwindcss/node` tem o seu `lightningcss` 1.32.0 com os 11
   binários aninhados em 1.32.0, e o Vite tem o 1.33.0 com os 11 binários no topo em 1.33.0. Medi o
   `npm ls --all --package-lock-only` em 11 versões do lockfile (de `d3e2566` a `54521f0`, cada uma num diretório
   temporário): nenhuma teve problema de lightningcss, nem a do merge do #93 (`cc34310`). Não achei o estado em que o
   defeito existiu; a evidência da task provavelmente veio de um `node_modules` instalado antes do lock final.
2. **O `ELSPROBLEMS` de hoje era outro.** O `npm ls --all` desta máquina (npm 11.6.2, o do Node 25.3.0) saía com 1 e três
   `invalid` (`@types/react`, `@types/react-dom`, `react-dom`) desde `f01f69f` (05/10), o commit do override aninhado
   `@excalidraw/excalidraw > sass > chokidar`. O **mesmo lockfile** dá 0 problemas no npm 10.9.4 (o do Node 22 do CI),
   no 11.10.0 e no 11.21.2 (o do projeto), e removendo o override aninhado o 11.6.2 também dá 0: é defeito do npm 11.6.2 com
   override aninhado, não do lock.

**O que mudou.**

1. `app/package.json`: o override passa de `"@excalidraw/excalidraw": { "sass": { "chokidar": "^4.0.3" } }` para
   `"sass": { "chokidar": "^4.0.3" }`. O `sass` só entra como dependência do Excalidraw (`npm ls sass`), então o alcance é o
   mesmo. O `package-lock.json` **não muda**: regenerado numa cópia com o npm do projeto, 0 de 1050 entradas diferentes, e o
   `chokidar` continua 4.0.3 sob o `sass` 1.51.0 (o que tira o `braces` vulnerável, ver `f01f69f`).
2. `app/scripts/lockfile-consistency.test.cjs` (6 testes, entram no `npm test`): cada binário opcional do lightningcss tem
   de resolver, pela regra do Node, para a versão exata que o pai pede (com um teste que reprova o defeito original numa
   árvore sintética); e o `npm ls --all --package-lock-only` do **npm do projeto** (não o do PATH, que varia por máquina)
   tem de sair sem problemas, com um teste que prova que ele enxerga um lock fora do `package.json`.

**Medido depois.** `npm ls --all` na árvore real: saída 0 no npm 11.6.2 e no 11.21.2 (antes: 1 e 0); `npm ci --dry-run` 0;
`npm audit --omit=dev` 0 vulnerabilidades; `npm test` 3116 testes, 3107 passam, 0 falham, 0 cancelados, 9 pulados.

**Limites.** O defeito original do lightningcss não foi reproduzido em nenhum estado do lock, então o teste do lock prova
que o guarda o detectaria (árvore sintética), não que ele já tenha acontecido. Não rodei `npm run build` nem o app: o lock é
idêntico. O defeito do npm 11.6.2 não foi reportado ao npm.

**Adendo (2026-11-05, depois do push): CI e Release.** O CI de `28ecbc7` (run 42056743462) passou em Windows, macOS,
Ubuntu, Ubuntu ARM e no Canvas smoke, com o teste novo (`lockfile-consistency.test.cjs`) rodando com o npm do projeto nos
quatro; o job `Dependency policy` reprovou na primeira tentativa por um **504 (Gateway Time-out)** no download do
`electron-builder` ("Build unpacked application"), sem relação com a mudança, e passou na reexecução do job
(`gh run rerun --failed`). Release gate e Release (run 42058411491) saíram verdes e publicaram a `v0.1.512`, nos três
sistemas. **Correção de precisão:** acima, "npm 10.9.4 (o do Node 22 do CI)" é inferência: medi o 10.9.4 por `npx`, mas não
li no log do CI qual npm o Node 22.x do `setup-node` traz; o teste novo não depende disso, porque usa o npm do projeto.

---

## 2026-11-05 — GPU: os seis não bloqueantes da última revisão da placa de vídeo, cada um com teste que falhava antes

**Contexto.** Task `3e791f95-497e-818e-b0b7-e022c3aa70ec` (aberta em 26/09/2026, da terceira verificação adversarial do PR #95,
v0.1.424): seis pontos de nicho que ficaram fora do PR, com o critério "cada item com teste que falha antes, ou justificado como
'não fazer' no `IA.md`". Os seis foram feitos; nenhum virou "não fazer".

**Os seis itens: o que mudou, o teste que falhava antes e o que foi medido.**

1. **Foco ao salvar (`GpuPreferenceField.tsx`, `gpu-save-flow.ts`).** Sem duas placas e salvando Automático, o store publica a
   escolha nova antes de `saveGpuPreference` devolver; `shouldShowGpuChoice` ficava falso nesse instante e o campo era
   desmontado (foco no BODY), voltando só quando `justSaved` subia. Agora o campo é segurado antes de salvar e o foco volta ao
   seletor (`id` fixo) depois de `saving` virar falso. A ordem mora em `runGpuSave` (puro, 4 testes em
   `gpu-save-flow.test.ts`; trocando a ordem para a antiga, 3 dos 4 reprovam). **No app real** (fonte, perfil isolado,
   Windows, 1 placa AMD, Integrada salva pelo IPC, escolhi Automático e salvei): antes, o nó do campo ficou desconectado
   (remontado) e o foco foi para o BODY; depois, o mesmo nó e o foco em `felixo-gpu-preference-select`.
2. **Textos que se contradiziam (`gpu-preference.ts`).** Com uma placa só, a opção salva aparecia como "Indisponível nesta
   abertura" ao lado de "Nesta abertura: Dedicada."; e o aviso "só dá para voltar para Automático" continuava depois de salvar
   Automático. A opção salva agora diz "Salva e aplicada nesta abertura", "Salva para a próxima abertura" ou "Salva, mas sem
   efeito no modo compatível"; o aviso de limite sai com Automático salvo e, quando a escolha foi aplicada, diz que o Felixo
   aplicou a escolha salva mesmo sem encontrar duas placas. 3 testes novos em `gpu-preference.test.ts` (os três reprovavam).
   **No app real:** a descrição da opção passou de "Indisponível nesta abertura." para "Salva para a próxima abertura.", e o
   aviso de limite sumiu depois de salvar Automático.
3. **`APPIMAGE_EXTRACT_AND_RUN` vazando (`app-relaunch.cjs`, `gpu-launch.cjs`).** O relançamento pôs a variável no ambiente do
   relançado e ela ficava para os terminais abertos pelo app. Agora o relançamento marca a variável que ele mesmo pôs
   (`FELIXO_APPIMAGE_EXTRACT_AND_RUN_ADDED`; a que a pessoa já tinha não leva a marca) e o processo relançado a apaga depois de
   decidir a GPU (`restoreRelaunchEnvironment`, junto com a marca de ambiente limpo). Testes novos em `app-relaunch.test.cjs`
   e `gpu-launch.test.cjs` (reprovavam: a função não existia). **Não rodado** com um AppImage de verdade (só existe no Linux).
4. **Relançamento em andamento (`gpu-start-guard.cjs`, `isGpuRelaunchInProgress`).** Um pid gravado e já morto dentro dos 30 s
   ainda contava como relançado nascendo, e com o relógio atrasado a idade dava "desconhecida" e o teto de 5 min não valia.
   Agora, **com pid, vale o pid** (morto = não está nascendo, mesmo dentro do prazo curto), a idade é o **módulo** da diferença
   (um relógio que voltou 3 h não tira o teto), e data ilegível não segura a escolha. Sem pid, o prazo de 30 s continua. 3
   testes novos em `gpu-start-guard.test.cjs` (reprovavam).
5. **Teste que não pegava a mutação (`gpu-launch.test.cjs`).** O `app.exit()` falso só registrava, então gravar o pid DEPOIS do
   `exit` passava. Agora o falso lança (como o real, que não volta). Medido: com `recordGpuRelaunchChild` movido para depois do
   `exit`, os testes de antes passavam 6/6 e os de agora reprovam em "o pid do relançado vai para o pedido antes de o processo
   sair".
6. **Aviso do modo compatível (`graphics-recommendation.cjs`, `main.cjs`).** A janela de leitura era de 2 s depois do primeiro
   `gpu-info-update`; uma GPU que caía depois não gerava a recomendação. Com `keepWatching` (ligado no `main.cjs`) o app segue
   lendo o status a cada `gpu-info-update` e grava a recomendação para a próxima abertura; a escuta tardia só acrescenta
   (uma leitura saudável nunca a apaga) e devolve `stopWatching`. 2 testes novos reprovavam, com uma sequência de eventos
   simulada. **Não reproduzido no app real:** uma queda tardia da GPU exigiria matar o processo de GPU do Electron.

**Medido (Windows 11, Node 25.3.0, Electron 42.11.16).** `tsc -b` e `eslint .` limpos; vitest 217 arquivos, 3387 testes
(eram 3380); `npm test` 3126 testes, 3116 passam, 0 falham, 0 cancelados, 10 pulados (eram 3110, 9 pulados: o teste novo de
AppImage só roda no Linux e no macOS).

**Limites.** Itens 3 e 6 não foram exercitados fora de testes (AppImage real e queda de GPU real); o foco do item 1 foi medido
por `focus()` e `click()` pelo DOM, não por Tab e Enter. O item 4 assume o que o código já dizia: o pid gravado é o do
`.AppImage`, que vira o Electron no mesmo processo; se o runtime fizesse fork em vez de exec, um pid que morre cedo com o
relançado vivo reverteria a escolha à toa; não medi o pid do AppImage nesta passada (sem Linux por perto).

---

## 2026-11-05 — Canvas: abrir a gaveta do terminal deixa de rolar o shell de lado

**Contexto.** Task `3e891f95-497e-819b-a75f-e5cec04e3173` (achado do PR #96, 26/09/2026): abrir a gaveta rolava o contêiner do
shell (`overflow: hidden`) uns 438 px para o lado por um instante, e a moldura inteira pulava. A task sugeria
`focus({ preventScroll: true })` no terminal "ou corrigir o contêiner que rola".

**O que a medição mostrou (app de fonte, Windows, Electron 42.11.16, clique real do mouse por CDP, sondas de `scrollLeft` a cada 2
ms e evento de rolagem em captura).**

1. **O xterm real não é a causa.** `Terminal.focus()` do xterm 6.0.0 já chama `textarea.focus({ preventScroll: true })`. Com o terminal
   real, abrir a gaveta deu 0 eventos de rolagem em quatro larguras de janela (1320, 1000, 800 e 704 px).
2. **O terminal falso do smoke rola o shell.** `mock-terminal-session-store.ts` foca o `textarea` sem `preventScroll`: com ele
   (`FELIXO_DEVTOOLS_MOCK_PTY=1`, o padrão das sessões A e B do canvas-smoke), o `div.h-screen.overflow-hidden` de `App.tsx` foi a
   **434 px** em 215 ms e voltou a 0 em ~400 ms (1320 px) e a 421 px em janela de 800 px. Foi o que o SA3 do tutorial viu.
3. **Mas existe caminho de produção.** Com a aba **Leitura** ativa, `TerminalDrawer.tsx` chama `readingPanelRef.current?.focus()`
   (e a faixa de retomada, o gatilho recolhido e a troca de aba fazem o mesmo) **sem `preventScroll`**. Com o xterm real e a Leitura
   ativa, o shell foi a 434 px do mesmo jeito. Instrumentando o `focus()`: no instante da chamada a gaveta tinha 1 px de largura
   (`x` 901 a 902), o painel focado estava em `x` 902 a 926, e o shell tinha `scrollWidth` 1754 contra `clientWidth` 1320: o conteúdo da
   gaveta, ainda sem largura, transbordava 434 px à direita, e o navegador rolou o shell (`overflow: hidden` continua sendo um
   contêiner rolável) para mostrar o foco. O valor fica até o layout assentar.

**O que mudou.**

1. `app/src/App.tsx`: o shell passa de `overflow-hidden` a `overflow-clip` (corta igual, mas não rola nunca). É a correção na
   raiz: vale para todo `focus()` sem `preventScroll` dentro da gaveta (Leitura, faixa de retomada, gatilho recolhido) e para
   qualquer `scrollIntoView`, em vez de chamar a lista de pontos um a um. Testado ao vivo antes de editar o código
   (`style.overflow = 'clip'` no app aberto: 0 eventos, `scrollLeft` sempre 0).
2. `app/scripts/canvas-smoke.cjs`: `iniciarSondaDoShell` e `exigirShellSemRolar`, ligados antes do clique que abre a gaveta; leem o
   `scrollLeft` de `[data-felixo-app-shell]` a cada 4 ms e contam os eventos de rolagem por 600 ms. **Reprova sem a correção**:
   `abrir a gaveta rolou o shell de lado: {"maior":434,"eventos":5}`; passa com ela.
3. Docs e comentários: a lacuna saiu do inventário do terminal (`INVENTARIO-CANVAS.md` regenerado); `ARQUITETURA.md`, o
   comentário do `onScroll` do `OnboardingTourLayer.tsx` e o do SA3 em `canvas-smoke-onboarding.cjs` dizem que o shell não rola
   mais (a escuta do tutorial segue valendo para a sidebar e outros contêineres).

**Decisão.** `overflow-clip` no lugar de `preventScroll` nos pontos de foco: o `preventScroll` cobre só o `focus()` que alguém lembrar de
escrever com ele, e o clip cobre também o `scrollIntoView`; o terminal falso do smoke continua focando sem `preventScroll` de
propósito, porque é ele que reproduz um `focus()` comum dentro da gaveta e mantém o guarda honesto.

**Medido.** `tsc -b` e `eslint .` limpos; vitest 217 arquivos e 3387 testes; `npm test` 3126 testes, 0 falham; `canvas-smoke` sessão
A `passou` e sessão B (tutorial) `passou`. Nas rodadas deste dia a sessão A caiu duas vezes antes do guarda, por motivos que não são
este: `page.screenshot` de 30 s no primeiro caso da matriz (a mesma instabilidade já registrada na entrada da barra de status;
mais uma ocorrência, na 1ª tentativa de uma execução com 1 tentativa só) e `arrasto-persistido` com `fixture-note`
`missing-or-hidden` (uma vez, logo depois de `felixo devtools quit`); com as 3 tentativas padrão a sessão passou.

**Limites.** O deslocamento foi medido em janela sem quadros reais (a janela escondida do devtools entrega ~2 quadros por
segundo), então "por um instante" na tela de quem usa não foi cronometrado; o guarda do smoke roda com o terminal falso. Não
olhei o macOS nem o Linux, onde o `overflow: clip` é o mesmo do Chromium.

**Adendo (2026-11-05, depois do push): CI e Release.** O CI de `22b9286` (run 42074304709) passou em Windows, macOS, Ubuntu,
Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`, onde o guarda `exigirShellSemRolar` rodou no Linux/xvfb; o Release gate (run
42075215660) e o Release (run 42075255480) saíram verdes e publicaram a `v0.1.514`, nos três sistemas. **Não conferido:** o guarda
no Windows e no macOS do CI, porque o smoke do canvas só roda lá na Nightly das 06:00 UTC (a de 06/11/2026); no Windows local ele
passou. A instabilidade do `page.screenshot` do primeiro caso da matriz ganhou mais uma ocorrência na task que a investiga.

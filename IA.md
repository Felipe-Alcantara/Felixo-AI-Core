
---

## Estado atual (resumo vivo)

<!--
  EXCEÇÃO à regra append-only: esta seção é um resumo reescrevível de "onde o projeto está
  AGORA". Reescreva-a a cada mudança de estado; o histórico fica nas entradas datadas abaixo e
  nos arquivos de docs/ia-archive/.
-->

Última atualização: [2026-11-09]

- **Windows sem Node (2026-11-09, `v0.1.517`):** o Codex agora abre em máquina sem Node (o `node` do app é o Electron, que não entrega console
  ao `codex.exe`): o app grava `clis\native-bin\codex.cmd`, que abre o executável nativo, e só enquanto falta Node de verdade. Fica
  de fora o Gemini, que precisa de um `node.exe` de verdade. Ver a entrada de 2026-11-09 "Windows sem Node" e a de 2026-11-08
  (PowerShell).
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
- [2026-11-05] Registros de 2026-11 (9 seções) movidos para [docs/ia-archive/IA-ARCHIVE-2026-11.md](docs/ia-archive/IA-ARCHIVE-2026-11.md)

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

---

## 2026-11-05 — Canvas: o bloco Excalidraw para de regravar a cena a cada segundo com o canvas parado

**Contexto.** Task `3e891f95-497e-815b-b675-d1d696a7968e` (achado da sonda de IPC do tutorial, PR #96): com o canvas parado,
um bloco Excalidraw gravava a si mesmo cerca de uma vez por segundo (`canvas:save`), com a cena igual e só o `updatedAt` novo.
O SA1 do tutorial contornava isso tirando o bloco da fixture, e a task pedia que ele voltasse depois da correção.

**O que a medição mostrou (app de fonte, Windows, Electron 42.11.16, `ipcProbe` do processo principal).**

1. **Reproduzido:** bloco Excalidraw vazio e canvas parado, `canvas:save` foi de 30 a 50 em ~12 s (20 gravações).
2. **O ciclo.** O `onChange` do Excalidraw dispara a cada atualização do componente, não só a cada edição. O bloco agendava
   `onDataChange(id, { scene })` (600 ms) sem olhar se a cena mudou; `updateNodeData` sempre chama `persistNode` (400 ms) e
   troca o objeto do nó; o bloco renderiza de novo; o `ExcalidrawCanvas` passa um `onChange` novo a cada render, o Excalidraw
   atualiza e dispara `onChange` outra vez. Cerca de um segundo por volta, para sempre, com a cena igual.

**O que mudou.**

1. `components/excalidraw-scene.ts` (`sceneToPersist`, pura): o texto que seria gravado (`''` sem elementos) comparado ao já
   gravado; igual devolve `null`. Cobre bloco novo (campo indefinido), apagar tudo (grava `''`, senão o desenho voltaria),
   edição de verdade, cor de fundo e a mesma versão do elemento. 6 testes em `excalidraw-scene.test.ts`.
2. `ExcalidrawDrawingNode.tsx`: o callback agendado compara com a cena gravada, guardada numa ref sincronizada por efeito
   (a escrita da ref durante o render é regra do lint) e atualizada antes de chamar `onDataChange`, para um segundo `onChange`
   dentro da espera não regravar.
3. `canvas-smoke-onboarding.cjs`: `removerBlocosQueGravamSozinhos` saiu; o bloco Excalidraw volta à fixture do SA1, que passa a
   provar "zero `canvas:save` com o canvas parado" também para ele (o canal está em `FORBIDDEN_CHANNEL_PATTERNS`).
4. Inventário do bloco Excalidraw: a lacuna saiu e o teste novo entrou (`INVENTARIO-CANVAS.md` regenerado).

**Medido depois.** Bloco vazio e parado: `canvas:save` 1 antes e 1 depois, em 12 s (era 20). Desenhando um retângulo com o mouse
real (CDP): o desenho salva (1 elemento, 541 bytes gravados) e, parado de novo, 10 antes e 10 depois, em 12 s. Recarregado
com a cena não vazia: 1 gravação no carregamento (a ordenação do canvas, que já existia) e depois nenhuma em 12 s, então o
Excalidraw não regrava por normalizar a cena. **O teste que falhava antes:** o SA1 com o bloco na fixture, sem a correção,
reprova com `o app não parou de gravar sozinho antes do percurso. Evidência: {"canaisNaUltimaAmostra":{"canvas:save":3},"amostraMs":1500}`;
com ela, a sessão A `passou` (SA1 e o resto). `tsc -b` e `eslint .` limpos; vitest 218 arquivos e 3393 testes (eram 3387);
`npm test` 3126 testes, 0 falham.

**Limites.** Desenhar gerou 9 gravações enquanto o traço durava (a janela do devtools roda a poucos quadros por segundo e o traço
levou segundos; cada pausa de 1 s entre mudanças fecha um ciclo de debounce): são edições de verdade, e a medição não separou
quantas seriam num uso normal. O `onChange` continua novo a cada render do `ExcalidrawCanvas` (o Excalidraw atualiza sem
necessidade a cada render do pai); a comparação corta a gravação, não esse render, e não mexi nele. O debounce de 600 ms sem
flush ao fechar o app (outra lacuna do inventário) segue como está. Não olhei macOS nem Linux.

**Adendo (2026-11-05, depois do push): CI, Release e uma correção de precisão.** O CI de `2080d8c` (run 42080331611) passou em
Windows, macOS, Ubuntu, Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`, onde o SA1 rodou com o bloco Excalidraw na fixture; o
Release gate (run 42081536576) e o Release (run 42081581788) saíram verdes e publicaram a `v0.1.515`, nos três sistemas. **Não
conferido:** o SA1 com o Excalidraw no Windows e no macOS do CI, porque o smoke do canvas só roda lá na Nightly das 06:00 UTC
(a de 06/11/2026); no Windows local passou. **Correção de precisão:** acima, a gravação única no carregamento da cena não vazia
está atribuída "à ordenação do canvas"; a causa não foi isolada (pode ser a normalização da cena ao abrir). O que a medição
prova é que não há regravação contínua depois dela.

---

## 2026-11-08 — Windows: o Shell do app deixa de recusar `codex`, `claude` e `gemini` pela política de execução do PowerShell

**Contexto.** Feedback de um usuário (Windows, `v0.1.515`, três capturas): (1) um agente Codex fechava ao abrir com
"O Codex encerrou logo ao abrir (código 1)" e `Error: stdin is not a terminal`; (2) num bloco Shell, digitar `codex` dava
"o arquivo `...\felixo-ai-core\clis\codex.ps1` não pode ser carregado porque a execução de scripts foi desabilitada neste sistema".

**Causa do (2) (medida).** O Shell interativo abria `powershell.exe -NoLogo -NoProfile`, sem política de execução. Na pasta
`clis` do app o npm deixa `codex`, `codex.cmd` e `codex.ps1`; o PowerShell prefere o `.ps1`, e a política padrão de uma máquina
cliente (Restricted) o recusa. Reproduzido aqui com `powershell -ExecutionPolicy Restricted -Command "& codex.ps1 --version"`
(a mesma mensagem) e resolvido com `-ExecutionPolicy Bypass` (`codex-cli 0.168.0-alpha.1`).

**O que mudou.** `getShellArgs` do adaptador win32 (e o reserva em `pty-process-manager.cjs`) passa a abrir o PowerShell com
`-NoLogo -NoProfile -ExecutionPolicy Bypass`, o mesmo `POWERSHELL_SCRIPT_FLAGS` que o app já usava para rodar `.ps1` (decisão do
Felipe de 07/10/2026 para o Openia). Vale só para o processo do terminal; uma política de grupo (MachinePolicy/UserPolicy) ainda
vence o flag. O teste de `platform/index.test.cjs` reprovava antes e passa; suíte Node 3126 testes, 0 falham.

**O (1) não foi resolvido.** Não reproduzi. Lançando o Codex como o app faz, com os mesmos argumentos (`--model gpt-5.6-luna -c
model_reasoning_effort=max --dangerously-bypass-approvals-and-sandbox`), pelo ConPTY do node-pty: `cmd.exe /d /s /c call codex.cmd`,
o mesmo sem `call` (caminho sem espaço, como o do usuário) e `powershell -File codex.ps1`, os três sobem a TUI
(`OpenAI Codex (v0.168.0-alpha.1)`). O texto `stdin is not a terminal` vem do próprio `codex.exe`: ele recebeu uma entrada que não
é console. Fica uma task com o roteiro de coleta (log de QA do escopo `terminal-launch`, versão do Windows, se o `codex` roda num
PowerShell fora do Felixo e a versão do Codex), porque sem esses dados qualquer correção seria palpite.

**Limites.** O Bypass vale também para scripts que a pessoa rode no Shell do app (é o preço de `.ps1` funcionar); a alternativa
de apagar os `.ps1` da pasta `clis` foi descartada porque o npm os recria a cada instalação. Não abri o app com a política
Restricted de verdade, só provei o flag no processo.

---

## 2026-11-09 — Windows sem Node: o Codex fechava ao abrir com "stdin is not a terminal"; agora abre pelo executável nativo

**Contexto.** Segunda metade do feedback do usuário `v0.1.515` (as mesmas três capturas da entrada de 2026-11-08): o agente Codex
(`gpt-5.6-luna`, "yolo") do canvas fechava ao abrir com "O Codex encerrou logo ao abrir (código 1)" e `Error: stdin is not a terminal`.
A entrada anterior deixou isso sem conserto porque não reproduziu: a máquina dela tinha Node. O pedido do Felipe é que a instalação
resolva sozinha. O fix do PowerShell daquela entrada já saiu na `v0.1.516`; este é o do Codex.

**Causa (medida).** Sem Node na máquina, o `codex.cmd` do npm chama `node codex.js`, e o `node` que o PATH das CLIs enxerga é o
`runtime-bin\node.cmd` do app: `ELECTRON_RUN_AS_NODE=1 "Felixo AI Core.exe"`. O Electron é um executável de subsistema GUI. Num ConPTY
(node-pty, a mesma rota do app) medi `process.stdin.isTTY` no `node` e no filho dele com `stdio: 'inherit'`:

| `node` do PATH | no `codex.js` | no `codex.exe` (filho) |
|---|---|---|
| Node de verdade | `true` | `true` |
| Electron-como-Node (o `node.cmd` do app) | `undefined` | `undefined` |

O `codex.exe` exige um stdin de console para subir a TUI e, sem ele, sai com `Error: stdin is not a terminal`. Quatro variações do atalho
(`<CON >CON`, `start /b /wait`, `powershell Start-Process -NoNewWindow -Wait` e um Node de verdade repassando os handles com
`spawnSync(electron, { stdio: 'inherit' })`) deram `undefined` do mesmo jeito: não existe `node.cmd` melhor, o Electron é que não entrega o
console. Foi por isso que o agente anterior não reproduziu (Node instalado) e que o erro só aparece para quem não tem Node.

**Reprodução do usuário, antes e depois.** Com o Codex `0.168.0-alpha.1` real, os mesmos argumentos da captura, o `PtyProcessManager` do
app e um PATH sem Node (`ProgramFiles` apontado para o vazio, porque o app injeta `C:\Program Files\nodejs` por conta própria):
antes, `Error: stdin is not a terminal`, código 1, em 1,8 s, idêntico à captura; depois, a TUI `>_ OpenAI Codex (v0.168.0-alpha.1)` sobe
e segue viva aos 12 s.

**O que mudou.** `app/electron/services/managed-codex-native-shim.cjs` (novo) grava `clis\native-bin\codex.cmd`, que abre o
`codex.exe` nativo direto, com as variáveis que o `codex.js` define (`CODEX_MANAGED_BY_NPM`, `CODEX_MANAGED_PACKAGE_ROOT`). `native-bin`
entra no PATH **antes** de `clis` (`getManagedCliPathCandidates`: `native-bin`, `clis`, `runtime-bin`), e o PowerShell resolve por pasta,
não por extensão (medido: um `codex.cmd` numa pasta anterior vence o `codex.ps1` de uma posterior). Assim o agente do canvas, o `codex`
digitado no Shell e as telas que abrem o Codex por PTY (status, limites) usam o mesmo atalho, sem editar os arquivos que o npm recria. O
atalho só existe quando falta Node de verdade (`isNodeProvidedByApp`: o primeiro `node` do PATH é o do app, ou não há nenhum) e o
`codex.exe` está no disco; com um Node de verdade no PATH ele é removido e o `codex.js` oficial segue valendo, então quem tem Node não
muda. `cli-auto-install.cjs` o reconcilia no registro, antes de qualquer terminal nascer (um bloco restaurado lança em segundos, e a
rodada de instalação só começa 4 s depois), e depois de instalar algo (instalação limpa). Não regrava um atalho já certo, porque o
`cmd.exe` lê o `.cmd` aos poucos enquanto roda. Os caminhos saem de `%~dp0` e o arquivo é só ASCII: o `cmd.exe` lê o `.cmd` na página de
código OEM, e um perfil como `C:\Users\João` corromperia um caminho gravado por extenso.

**Validação.**
- `managed-codex-native-shim.test.cjs` (25 testes: gravar, remover, idempotência, os layouts aninhado, içado e antigo do npm, ARM64,
  perfil acentuado, só ASCII e CRLF) e a ordem do PATH em `managed-cli-paths.test.cjs` e `cli-process-manager.test.cjs`.
- `managed-codex-native-shim.integration.test.cjs`, no `test:native` (ConPTY real, perfil `João Antônio` com espaço): o `node.cmd` do app
  e o `codex.cmd` do npm falham de propósito, e o `codex.exe` (uma cópia do Node) recebe stdin e stdout de terminal, os argumentos
  `com espaço` e `ação`, as variáveis e a raiz do pacote normalizada; o PowerShell resolve o atalho nativo, não o `codex.ps1`. 2 de 2; o `test:native` inteiro deu 11 de 11 (eram 9).
- `eslint` limpo nos arquivos tocados. Suíte Node: 3151 testes, 3141 passam, 0 falham, 10 pulados (eram 3126; os 25 novos são do
  módulo). Numa primeira rodada, 5 testes de `agent-session-discovery` e `agent-usage-availability` falharam por herdar
  `CLAUDE_CONFIG_DIR` do perfil isolado em que este agente roda; sem as variáveis `CLAUDE*` passam 28 de 28 e a suíte inteira
  ficou verde. É efeito do ambiente, não do código.

**Limites e pendências.**
- **Gemini** segue sem console quando só há o `node` do app. Medido: com Node de verdade abre a TUI ("Waiting for authentication...");
  com o Electron-como-Node sai com código 41 pedindo um método de autenticação (cai no modo sem terminal). Mesma causa, mas o Gemini é
  JavaScript puro e não tem binário nativo para chamar: precisa de um `node.exe` de verdade (cerca de 85 MB no instalador, ou outra
  rota). É decisão de tamanho do instalador, não resolvida aqui; task própria.
- **Atalhos `node.cmd` e `npm.cmd` com perfil acentuado:** `createWindowsShim` grava UTF-8 e o `cmd.exe` lê em OEM. Com um acento no
  caminho do app (`...\Programação\...`) o atalho dá "O sistema não pode encontrar o caminho especificado" (medido; `chcp 65001`
  resolveu). Afeta o `node` do app para quem tem acento no perfil. Não corrigido aqui.
- **Não conferido:** o app instalado de verdade (só o PTY do app com o Codex real, num ambiente montado) e o Windows ARM64 (só pelos
  testes unitários; o triplo `aarch64-pc-windows-msvc` segue o `codex.js`). `CODEX_MANAGED_BY_NPM=1` está lá por paridade com o
  `codex.js` e pode fazer o Codex oferecer "atualizar via npm" dentro da TUI; o app já atualiza a cada abertura, então é raro, e o `npm`
  que isso chamaria cairia de novo no Electron-como-Node.

**Adendo (CI e Release).** O push de `06154f9` passou no CI (run 42612267275: todos os jobs, com o Validate no Windows, macOS, Ubuntu
x64 e ARM) e no ciclo de instalação das CLIs. O Release gate despachou o Release (run 42613136986), que publicou a `v0.1.517`
(09/11/2026 11:58 UTC) apontando para `06154f9`. O `release-smoke` do Windows (NSIS) deu `passed`: app `0.1.517`, subida em 303 ms,
PTY ok. Esse smoke roda num Windows **com Node**, então prova que o app instalado abre, não que o Codex abre sem Node; a guarda no CI
virou task. Abertas no Notion, ligadas à task do Codex: a decisão do Node para o Gemini, o acento nos atalhos `node.cmd` e `npm.cmd`, a
confirmação com o usuário na `v0.1.517` e a guarda no CI sem Node.

---

## 2026-11-09 — GPU: o que deu para validar no Windows real (uma placa) e o que depende de hardware que não temos

**Contexto.** Task "GPU — validar a escolha de placa em Windows e macOS reais e medir o custo na abertura" (PR #95). Esta máquina é um Windows 11 x64 com **uma** GPU (AMD Radeon) e o Electron 42.11.16 (Chromium 148); não há Optimus nem Mac.

**Passo 2 (Windows com uma placa só): lógica conferida no Electron real.** `app.getGPUInfo('basic')` devolveu duas entradas: a AMD (`0x1002:0x1638`, `gpuPreference` 0) e `0x1414:0x008C`, o Microsoft Basic Render Driver (WARP). `describeGpuDevices` descartou o WARP, deixou 1 dispositivo e deu `multipleGpus: false`, então a opção "Placa de vídeo" não deve aparecer. Conferi a função com o dado real, **não** abri a tela de Configurações para ver a opção sumida.

**Passo 4 (custo na abertura): medido.** `getGPUInfo('basic')`, 3 execuções do Electron, 6 chamadas cada: a primeira custa **28,4 / 21,7 / 19,8 ms** (a que a abertura paga) e as seguintes ~1,5 a 2,3 ms (o resultado é guardado em `readDevices`). Na thread principal são 20 a 30 ms uma vez, sem sinal de DXGI/DXCore lento nesta máquina. Um driver ou notebook híbrido pode custar mais: só o passo 1 mede isso.

**Passos 1 e 3: não executados.** Pedem um notebook Windows Intel+NVIDIA (Optimus) e um Mac com duas GPUs (Intel+AMD) e outro com NVIDIA, que não há aqui. Task aberta no Notion com o roteiro e o que medir.

---

## 2026-11-09 — Onboarding: parte dos não bloqueantes da revisão adversarial do tutorial

**Contexto.** Task "Onboarding — tratar os não bloqueantes da revisão adversarial do tutorial" (PR #96, ~20 itens, prioridade baixa). Tratei os que se provam em teste de unidade; os de UX, foco e concorrência dependem do smoke visual do canvas (SA1, SA5, SA8) e ficaram fora.

**Corrigido (teste que reprova antes e passa depois).**
- `onboarding-store-proxy.ts`: `ensureStore` não ressuscita um tutorial desativado pelo `reportFailure` antes de a store ser pedida (antes, `ready()` baixava a store e repassava a fila velha; o item é o `ensureStore`/`failed` e a mutação M14); uma ponte que lança de forma síncrona na leitura antecipada deixa de escapar do `canvasReady`; no replay, uma chamada guardada que lança não aborta as seguintes e vai para o log.
- A mutação M13 (descartar a chamada mais antiga da fila) agora morre: o teste de cinco chamadas na ordem já passava e a fixa.
- `aria-controls` do botão Ajuda: `helpMenuControls` só o declara com o menu aberto (fechado, o id não existe no DOM).

**Já resolvido ou "não fazer".** `knownFeatures` fora do padrão já é descartado na leitura (`onboarding-state.test.ts:118-142`). "Redefinir" apagar a novidade é desenho testado (`:444`): preservar `knownFeatures` evita uma rajada de novidades; não mudar.

**Não feito (precisa do smoke visual ou de leitor de tela):** card do passo 1 cobrindo Criar a 1280×800, aviso sobre Página Web, rail a 800×500, progresso depois do reinício, downgrade perdendo campos de `context`/`appVersion`, v1 reparável com aviso único, as três concorrências, foco do menu Ajuda pelo teclado e a latência do foco na janela oculta, o prazo de 4 s da leitura inicial, a sonda IPC e o boundary do menu. Task aberta com a lista.

**Validação.** `vitest` inteiro 3398 passam (3 pulados), `tsc -b` e `eslint` limpos; 4 testes novos no procurador e 1 no `aria-controls`. Não rodei o `test:canvas-smoke`.

---

## 2026-11-09 — CI: o falso positivo do `renderer-xterm count=1` já não pode reprovar; o que reprova hoje é o `count=10`

**Contexto.** Task de 27/09/2026 "cenário renderer-xterm count=1 do gate de regressão acusa sem mudança real" (10 ocorrências em PRs de #95 a #103, sempre no delta de heap do stream, nunca no RSS).

**Achado: a task estava resolvida por mudanças posteriores, sem ninguém a fechar.** (1) O piso absoluto do delta de heap subiu de 15 para 32 MiB em 09/10 (`48bc384`, PR #112), medido em 8 runs verdes da main com o mesmo código (12,0 a 35,8 MiB). (2) O gate entre commits saiu do CI no PR #124 (19/10) e hoje é manual (entrada de 2026-11-04). (3) O `--check` do `Nightly` (`benchmark:terminal:check`) só compara o adaptativo com o atual a partir do limite adaptativo (`count >= 10`); o `count=1` não é avaliado.

**Medido.** Reexecutei no gate atual os 9 deltas das ocorrências da task (PRs #95, #96 x2, #97, #98 x2, #99, #102, #103): de 15,0 a 23,7 MiB, **nenhum reprova**. Uma retenção de +40 MiB no `count=1` reprova, e +70 MiB no `count=10` também, então o gate não ficou cego. O teste novo em `benchmark-regression-gate.test.cjs` fixa isso e **reprova** se o piso voltar a 15 MiB (mutação feita e desfeita). "10 execuções seguidas da main": não se aplica, porque nenhum workflow executa esse gate hoje; as 12 últimas noites do `Nightly` não reprovaram por `count=1`.

**O que reprova de fato no Nightly.** 3 falhas em 12 noites (29/10, 03/11, 06/11): a de 29/10 é do benchmark de gerenciadores de pacote, a de 03/11 é do canvas smoke no Windows e a de 06/11 (macOS) é **`adaptive count=10: resume regrediu mais de 25%`**, outro cenário e outra métrica. A entrada de 2026-11-04 mediu amplitude típica de 46% no resume com o mesmo commit, então esse critério de 25% é frágil; virou task.

**Corrigido.** A tabela de instabilidades do `GUIA-DESENVOLVEDOR.md` ainda dizia que o `count=1` reprova no `Nightly`; agora cita o `count=10` e explica por que o `count=1` saiu.

**Limites.** Não vi a mensagem do `--check` das falhas de 29/10 e 03/11 (não são deste benchmark). Não repeti o benchmark real 10 vezes por sistema: o gate que ele alimentaria não roda.

---

## 2026-11-09 — Atualização automática do Codex: reparar shim global e repetir consulta ao registry

**Agente / repositório.** Hotfix AI Core — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`).

**Causa medida.** O pacote global `@openai/codex` estava em `0.168.0-alpha.3`, mas `%APPDATA%\npm\codex.cmd` não existia; só havia arquivos temporários `.codex.cmd-*`. O leitor de instalação olhava apenas `package.json`, então classificava esse estado como atualizado e não reparava o comando. Separadamente, a consulta ao registry que falhava usava o manifesto de fallback, mas a rodada só agendava retry para arquivos `EBUSY`/`EPERM`; uma falha de rede podia ficar sem nova consulta até reiniciar o app.

**Corrigido.** `readSystemNpmInstall` agora valida o shim real do comando e `planSystemUpdates` agenda a reinstalação da versão já instalada quando ela é mais nova que o alvo, sem downgrade. O `cli-auto-install` agenda nova consulta em cinco minutos quando qualquer CLI usa o manifesto de fallback, mesmo sem instalação pendente. O README documenta os dois comportamentos.

**Validação.** Os testes focados de `system-cli-update`, `cli-auto-install-plan` e `cli-auto-install` passaram: 56/56. O gate anterior passou em `npm run typecheck` e `npm run lint`. A suíte completa anterior teve 3 falhas não relacionadas nos testes de `agent-session-discovery` e `pty-process-manager`, causadas pelo ambiente/perfil atual; 3139 passaram, 10 foram pulados.

**Limites.** Não apliquei uma instalação npm global na máquina durante esta sessão, nem publiquei/empacotei o app; a correção precisa entrar na próxima versão do Felixo para o atualizador instalado recebê-la.

Estado: concluído e publicado (v0.1.494).

## 2026-11-09 — Canvas: a pergunta do agente passa a pegar o foco, prender o Tab e tratar o Esc só nela

**Pedido.** Task do Notion "Felixo AI Core/Canvas — AgentQuestionDialog pegar o foco, prender o Tab e tratar o Esc só no diálogo" (aberta em 26/09 e complementada em 29/09 pelos PRs #96 e #98).

**Medido (antes).** O `AgentQuestionDialog` escutava `keydown` na `window`, não pegava o foco e não prendia o Tab, apesar de `aria-modal="true"`. Medido na task: Tab saía para o canvas; clicar no texto levava o foco à "Área de trabalho do canvas", onde `q` troca o modo e Delete apaga o bloco selecionado; um Esc com o foco no gatilho do Handoff dispensava a pergunta **e** fechava a gaveta; o `mousedown` na pergunta fechava uma gaveta solta; o menu de link ficava por cima. Prova de mutação desta task: com o diálogo antigo e o SA3 novo, o smoke reprova em "a pergunta não pegou o foco" (2 de 2 tentativas).

**O que mudou.**
- `AgentQuestionDialog.tsx`: foco no painel (`tabIndex=-1`, nunca numa opção, para um Enter apressado não responder) a cada pergunta; foco anterior guardado ao abrir e devolvido ao fechar (a região do canvas se saiu da página); Tab/Shift+Tab presos com `getFocusableElements` + `tabTrapTarget`; Esc e 1–N no `onKeyDown` do contêiner com `stopPropagation` em toda tecla; overlay `nokey` + `data-felixo-floating-layer`; `mousedown` no fundo não tira o foco; `aria-disabled` no lugar de `disabled` (botão focado que desabilita perde o foco para o body). Ouvinte de captura no documento só para tecla com o foco fora da pergunta e fora de outro modal (o `AccountSwitchDialog` fica por cima).
- `agent-question-dialog.ts`: `questionKeyAction` e `questionFocusReturnTarget` (puras, testadas). Ctrl/Meta/Alt+1–N deixa de escolher opção.
- Tutorial: `nextModalYield` recebe `anterior` (o `relatedTarget` do `focusin`), porque o diálogo já tem o foco quando o tour confere; `focusHoldOnYield` só leva ao ponto de espera se o foco ainda está no tour. Quem devolve o foco ao Próximo ao fechar é o tour (`resolveFocusAfterModal`): o card ainda está `inert` quando o diálogo tenta devolvê-lo.
- Smoke: `conferirPerguntaPrendeOFoco` no SA3 (gaveta aberta, bloco selecionado, Tab/Shift+Tab, clique no texto e no fundo, Delete/Backspace/q, foco no body, Esc fecha só a pergunta e o foco volta ao Handoff). As premissas antigas do SA3 ("o foco levado para fora fica lá", "o foco cedido espera no ponto de espera") foram trocadas pelas novas.

**Decisões do agente.** Foco inicial no painel, não na primeira opção. Ouvinte de captura no documento além do `onKeyDown` do contêiner (a task pedia só o contêiner): sem ele, foco caído no body deixa Delete agir no canvas. Menu de link não ganhou código: o foco no diálogo dispara o `focus-left` que já existe.

**Validação.** `tsc -b` limpo; `eslint .` 0; `vitest` 3380 passando, 3 pulados; `npm test` 3041, 7 falhas **idênticas na árvore limpa** (Windows: descoberta de sessão Claude, razões de CLI ausente, árvore de processos do pip), não são desta task. `FELIXO_SMOKE_SESSOES=A npm run test:canvas-smoke` no app real: sessão A verde, SA3 incluído (SA4 e SA5 também).

**Não validado.** Menu de link fechando quando a pergunta chega (sessão D do smoke não foi estendida; só a regra `focus-left` está coberta por teste). Leitor de tela real (NVDA/VoiceOver). Sessões B–F do smoke (a CI roda). Pergunta aberta junto com `HandoffDialog`/`AccountSwitchDialog`.

Estado: concluído (publicação abaixo, no commit).

## 2026-11-10 — Tutorial do canvas: validação manual da seção 9 do checklist (parcial, nenhum PASS novo)

**Pedido.** Task "Felixo AI Core/Onboarding — validar à mão o que a automação não cobre no tutorial" (Etapa: Delegar; o registro de 09/11 já dizia que nenhum item foi executado).

**Medido.** Item 4 (dois processos no mesmo perfil), Windows 11, Electron do projeto (fonte, não instalado), perfil novo com `FELIXO_DEVTOOLS_ONBOARDING=1`: com a instância 1 aberta (1 página, 1 card do tour), um 2º `electron .` com a mesma `FELIXO_USER_DATA_DIR` e um `.fxai` no argv **saiu com código 0 em 4,8 s**; depois disso a instância 1 seguia com 1 página e 1 card. Coerente com `single-instance.cjs` (trava desde 04/11).

**Não executado, e por quê.** Leitor de tela, janela visível com teclado e mouse físicos, pergunta de uma CLI real, macOS (`activate`), NSIS, fonte do sistema a 150%, boot com até 4 CPUs lógicas, benchmark no hardware de referência e tradução real: dependem de hardware, instalação ou pessoa. O checklist diz que item sem execução não vale como PASS; nenhum foi marcado. O item 4 só conta como **parcial**: faltam o app instalado, o duplo clique real no Explorer e o macOS.

**O que mudou.** `docs/validation/RELEASE_CHECKLIST.md`, itens 3 e 4: a pergunta agora pega o foco e prende o Tab (09/11), e a trava de instância única muda o esperado do item 4.

Estado: aguardando execução humana (a task segue em "Delegar").

## 2026-11-10 — Tutorial do canvas: revisão das 5 decisões de produto (a–e); a (e) foi trocada

**Pedido.** Task "Felixo AI Core/Onboarding — revisar as 5 decisões de produto do tutorial tomadas sem pergunta (a–e)": decisões tomadas em 26/09 sob o pedido "não pergunte nada", devolvidas ao Felipe para confirmar ou trocar.

**Respostas do Felipe (10/11/2026, perguntadas uma a uma, recomendação "manter" nas cinco).**
- a) Quem já usa o app não recebe o tutorial automático: **mantida**.
- b) Primeiro uso abre sozinho, sem bloquear: **mantida**.
- c) Feature nova: aviso discreto e mini-tour só ao clicar em "Ver": **mantida**.
- d) i18n próprio em pt-BR, sem biblioteca: **mantida**.
- e) Roteiro de 5 passos mais "onde reabrir": **trocada pelo roteiro longo** (Organizar, Página Web, Gerar imagem, Tarefas Notion).

**O que mudou.** Só documentação: `PLANO-TUTORIAL-CANVAS.md` ganhou a seção "Revisão das decisões a–e pelo Felipe". Nenhum código: o roteiro no ar segue com 6 telas.

**Decisão do agente.** A troca foi lida como "roteiro mais longo", não "passos interativos" (essa opção estava separada na pergunta); a regra de que o tour nunca clica nem cria continua. A objeção original ("rede e crédito") só vale para passos que agem.

**Pendências.** Task de implementação aberta (ligada a esta), com a pergunta de "substituir ou estender" e de agrupar as ferramentas; localizar onde moram Gerar imagem e Tarefas Notion; subir a versão do tour e a revisão do catálogo; ajustar o smoke (SA1, SA4, SA5, SB1).

**Não validado.** Nada rodou: é decisão e documentação.

Estado: concluído (decisão registrada; implementação em task própria).

## 2026-11-10 — Terminal: Handoff e troca de conta param de prometer o "histórico inteiro" quando o Claude está na tela alternativa

**Pedido.** Task "Felixo AI Core/Terminal — corrigir Handoff e Copiar com o Claude na tela alternativa e o texto de histórico inteiro" (aberta em 28/09, prioridade Alta).

**Medido.** Teste novo com **xterm real** (`terminal-alternate-screen.test.ts`, o mesmo `@xterm/xterm` do app, sem DOM): com a tela alternativa ativa e 30 respostas redesenhadas, o buffer ativo tem **5 linhas (a tela)** e só contém a última resposta; o buffer normal só guarda o que veio antes de o app subir (o `$ claude`). Ou seja, nenhuma leitura do terminal entrega a conversa; a task acertava. No código, `getTranscript` usava `readBuffer(buffer.active)`; `HandoffDialog` dizia "O histórico vai inteiro" e `buildTerminalHandoffPrompt` dizia "histórico completo disponível". O botão Copiar já diz "Copiar seleção (ou a tela visível)": não promete o que não entrega.

**O que mudou.**
- `TerminalTranscript` ganha `screenOnly` (`isAlternateScreen` em `terminal-buffer-reader.ts`; `getTranscript` o preenche).
- `terminal-handoff.ts`: `SCREEN_ONLY_NOTICE` e `describeTranscriptScope`; o prompt do agente diz "SÓ a tela visível… a conversa NÃO está aqui" e manda reconstruir o estado pelo repositório.
- `HandoffDialog` e `AccountSwitchDialog` avisam a pessoa (e a orientam a ligar "Rolagem no terminal do Claude Code", que vale para terminais novos). O flag atravessa `TerminalDrawer` → `CanvasView` → `passResponsibility` e `useAccountContinuation` → `performContinuation`.
- Inventário do canvas: removida a lacuna do Copiar (o botão é honesto); a do Handoff aponta para a task nova.

**Decisões do agente.** Não juntei buffer normal + tela (só adicionaria o `$ claude`, e sugeriria um histórico que não existe). Copiar não foi mudado. A entrega da conversa inteira é feature à parte: ler o `.jsonl` da sessão do Claude (o app já o localiza em `agent-session-discovery.cjs`); task aberta.

**Validação.** `tsc -b` limpo; `eslint src/features/canvas` 0; `vitest` 3422 passando, 3 pulados. Mutação: sem o ramo `screenOnly` do prompt, e sem o texto condicional do diálogo, os 2 testes correspondentes reprovam (restaurado). Smoke no app real, sessão A: verde (SA3 inclui o HandoffDialog; SA5).

**Não validado.** O diálogo de Handoff com um Claude de verdade em tela alternativa (o smoke usa PTY falso, sem xterm); só a marcação do diálogo (renderização no servidor) e o xterm real em Node foram testados, cada um por si. A sessão da troca de conta com `screenOnly` não tem teste de ponta a ponta.

Estado: concluído e publicado (ver commit abaixo).

---

## 2026-11-11 — Terminal: a saída inteira do PTY vai para disco por 14 dias, com Histórico arquivado na gaveta e aviso quando a retomada corta o começo

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Task
`3e991f95-497e-810b-9f94-ed5201606718` (item 2 do pedido de performance de 28/09, que a fatia 1 deixou de fora).

**Contexto.** O replay do processo principal guarda os últimos 200.000 caracteres e o xterm 5.000 ou 20.000 linhas; nada da
saída do PTY do canvas ia para disco (o `terminal-log-store` só atende o `cli:*` do chat). Recarregar a janela ou voltar do
Chat recriava o xterm só com o replay, sem aviso, e não havia "carregar mais".

**Decisões do Felipe (11/11/2026, quatro perguntas pela ferramenta interativa, antes de qualquer código).** Retenção:
**14 dias** (eu recomendei "enquanto o terminal existir"). Segredos: **gravar cru** (eu recomendei redigir com a redação do
log de QA). Exportação do canvas: **entra, opcional**. Escopo: **tudo de uma vez** (arquivo, carregar mais e aviso).

**O que mudou.**

1. `electron/services/pty-output-archive.cjs` (novo): uma pasta por sessão em `userData/pty-output` (hash do id, porque
   `canvas:` tem `:`), segmentos de 8 MB cujo nome é o offset do primeiro byte (apagar um antigo não muda o offset dos outros),
   64 MB por sessão, 1 GB no total, 14 dias sem escrita, poda no boot e a cada rotação sem tocar o segmento em uso. O `append`
   só empilha; um timer único grava o lote de todas as sessões a cada 250 ms (256 K caracteres pendentes gravam já), por uma
   fila por sessão. Falha de disco desliga só aquela sessão até o PTY fechar e nunca lança no `onData`. Leitura paginada do
   fim ao começo, com o começo avançado até um caractere UTF-8 inteiro.
2. `pty-process-manager.cjs`: alimenta o arquivo depois do renderer (como a vigia), escreve a marca
   `── [Felixo] novo processo em … ──` (saindo da tela alternativa) a cada processo novo do bloco, fecha o segmento no
   `cleanup` e expõe `replayTruncated(sessionId)` (o processo já emitiu mais que o replay).
3. `pty-ipc-handlers.cjs`: `pty:spawn` do reanexo devolve `replayTruncated`; canal novo `pty:archive-read`; o `dispose` grava
   o último lote síncrono antes de matar os PTYs. `main.cjs` cria o arquivo e poda no boot.
4. Renderer: `TerminalArchivePanel.tsx` (carregado sob demanda: 3,76 kB, o xterm fica fora do pacote inicial) com xterm só de
   leitura, `scrollOnEraseInDisplay` (o `ESC[2J` do ConPTY e das TUIs manda a tela para o histórico em vez de apagar a marca),
   link OSC 8 desligado e janela de 2 MB (`terminal-output-archive.ts`, puro); botão **Histórico arquivado** na gaveta; o aviso
   de histórico ganhou o corte da retomada e passou a apontar o arquivo. `ptySessionIdForNode` saiu do store para
   `pty-session-id.ts`, que a gaveta importa sem puxar o xterm.
5. Exportação: **Exportar com a saída dos terminais** em Ferramentas → Transferência. O `.fxcanvas` leva `terminalOutputs`
   (cauda de até 1 MB por terminal, 8 MB no total), validado no `parseCanvasBundle` (bloco existente, sem duplicata, tamanho);
   a importação devolve a saída só ao arquivo do bloco, depois de trocar o canvas e sem desfazê-lo se falhar.
6. `benchmark:pty-output` ganhou a variante `atual+arquivo` (tetos antes de medir: extra por pedaço p50 ≤ 10% ou ≤ 0,5 µs,
   lote de todas as sessões p95 ≤ 2 ms, e a saída inteira de cada sessão conferida no disco).
7. Inventário do canvas (`terminal-archive` novo, gaveta, store, transferência), guia do usuário e arquitetura.

**Medido.** `npm test` 3168 passam, 0 falham (22 testes novos no main e no benchmark); vitest 220 arquivos, 3427 testes;
`tsc -b`, `eslint .` e `vite build` limpos, tudo depois de mesclar o `main` de outros agentes (só o `INVENTARIO-CANVAS.md`
conflitou, regenerado). Benchmark padrão (20 terminais × 2000 pedaços × 5): `atual+arquivo` 0,366–0,414 µs/pedaço contra
0,349–0,359 sem arquivo; lote p95 0,40–0,41 ms; saída inteira em disco: sim (8.841.380 bytes por rodada). Com um timer por
sessão (primeira versão) o custo extra por bloco era p50 25%; com o timer único, 18–20% (0,02–0,06 µs), aprovado pelo piso
absoluto da vigia. App de fonte isolado (devtools, Windows): PowerShell real imprimindo 4.000 linhas de 92 caracteres gravou
376.168 bytes num segmento só, com a linha 1, a 4000 e `FIM-DA-SAIDA`; o reanexo devolveu `replayTruncated: true`; o cartão e
a gaveta mostraram o aviso novo; o painel abriu com "Mostrando 256 KB de 367 KB guardados.", o Carregar mais chegou a "desde o
começo" com a marca e a `linha 00001` no topo e o botão desabilitado; o xterm vivo ficou `inert`. Exportar sem a opção não
levou `terminalOutputs`; com ela levou os 376.168 bytes, e o pacote passou no `canvas:validate-import`. Antes do
`scrollOnEraseInDisplay` a marca não aparecia: o `ESC[2J` do ConPTY a apagava no visualizador (visto no começo cru do arquivo).

**Limites.** A saída fica crua em disco e no `.fxcanvas` exportado com a opção (decisão acima): token impresso por uma CLI fica
lá por até 14 dias. Não validei macOS nem Linux, nem o app empacotado; a importação de um pacote com saída só tem teste
unitário. O visualizador com TUI de tela cheia (Claude Code) não foi medido: os redesenhos entram como telas sucessivas no
histórico. A poda só roda no boot e a cada rotação de 8 MB; **Limpar** o canvas não apaga o arquivo (sai pelos 14 dias). No
fechamento, uma escrita assíncrona ainda em voo pode chegar depois do último lote síncrono, ou não chegar. Nenhum smoke abre o
Histórico arquivado (lacuna no inventário, task `3ec91f95-497e-81e8-8f18-e2a529b0568e`).

**Adendo (2026-11-11, depois do push): CI e Release.** O CI de `c783124` (run 43021733813, 09:35–09:42) passou no escopo, no
Validate em Windows, macOS, Ubuntu e Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`, que roda a gaveta com o botão novo; o
Release gate (run 43022705005) e o Release (run 43022741363, 09:43–09:52) saíram verdes e publicaram a `v0.1.522` nos três
sistemas, com a validação do app instalado e a atualização silenciosa com o app aberto no Windows (3 min 46 s, no normal de
3 a 3,7 min). **Não conferido:** o Histórico arquivado no app instalado: a validação do artefato (`release-smoke.cjs`) abre um PTY real,
mas por um `PtyProcessManager` próprio, sem o arquivo.

---

## 2026-11-11 — Terminal: `pty:data` em lote no processo principal, controle de fluxo por marca d'água e `write` do xterm à prova de exceção

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Task
`3e991f95-497e-81d4-af04-fc0a218a66dc` (pendência da fatia 1 de performance, 28/09).

**Contexto.** Cada pedaço do node-pty virava uma mensagem `pty:data`, sem agrupamento nem controle de fluxo; e o store do
renderer incrementava `pendingWrites` antes de várias checagens e chamava `terminal.write` sem `try/catch`: acima de 50 MB
pendentes o xterm 6 lança "write data discarded", o pedaço sumia e o `exit` nunca era mostrado.

**O que mudou.**

1. `electron/services/pty-data-batcher.cjs` (novo): a saída de todas as sessões sai numa mensagem a cada 8 ms
   (`[{ sessionId, data }]`, concatenada por sessão), na hora acima de 64 K caracteres pendentes da sessão, nos 100 ms depois de
   um `pty:write` (eco) e antes do `pty:exit` e do `pty:kill`. No reanexo o pendente é **descartado**, não enviado: o replay que o
   main reenvia já o contém, e mandar os dois duplicaria o fim no xterm novo. O preload desdobra o lote, isolando a exceção de uma
   sessão para não tirar a saída das outras.
2. Controle de fluxo: `terminal-flow-control.ts` conta o que foi entregue ao `terminal.write` e ainda não processado; acima de
   2 M caracteres o renderer pede `pty:flow` (pausa o socket do node-pty, a CLI bloqueia ao escrever), abaixo de 500 K retoma.
   `PtyProcessManager.setFlowPaused` ignora PTY sem `pause` e retoma sozinho no reanexo (o xterm que pediu a pausa não existe mais).
   **Por que marcas altas:** com a janela minimizada o Chromium desacelera os timers do xterm, e uma marca baixa frearia agentes
   em segundo plano; e, pausado, o socket segura o `exit` no Windows e é destruído 200 ms depois do fim do processo no Linux e no
   macOS (`node-pty` `unixTerminal.js`, `DESTROY_SOCKET_TIMEOUT_MS`), perdendo o resto do buffer do sistema.
3. `terminal-session-store.ts`: `writeOutput` sobe o `pendingWrites` só junto do `write`, captura a exceção, soma os caracteres em
   `scrollback.droppedOutputChars` e segue o fim normalmente; o aviso aponta o Histórico arquivado (a saída está no disco).
4. `benchmark:pty-output` ganhou a variante `ipc` (timers reais, 20 terminais a um pedaço por 10 ms): mensagens por segundo,
   serialização (`v8.serialize`), espera de um pedaço, eco e conferência de ordem e completude. Tetos antes de medir: mensagens
   agrupadas ≤ 25% das de antes, eco p95 ≤ 2 ms, serialização não maior.
5. Inventário: a lacuna "pty:data chega pedaço a pedaço" saiu; `pty:flow` e o estado de saída descartada entraram.

**Medido.** `npm test` 3182 passam, 0 falham (14 novos, entre eles a propriedade do agrupador com 200 sementes: nada perdido,
nada reordenado, fim depois do último dado); vitest 221 arquivos, 3432 testes; `test:native` 11/11; `tsc -b`, `eslint .` e
`vite build` limpos. **Os dois testes novos do store falham sem a correção** (rodados contra o store anterior e restaurados).
Bancada (Node, Windows): 1.282 mensagens/s antes contra 109 depois (0,085), serialização 10,5 → 5,0 ms/s, eco p95 0,02 ms,
saída inteira e em ordem nos dois lados; a espera de um pedaço comum ficou em ~15,7 ms (o timer de 8 ms cai na granularidade
de 15,6 ms do Windows). App isolado (devtools): três shells com um laço de spinner entregaram 672 eventos por sessão em 250
mensagens; uma enxurrada de 11,2 MB passou sem pausar (o xterm acompanhou); com o renderer travado 4 s durante uma enxurrada
de 33,6 MB, o `pty:flow` foi chamado 2 vezes (pausa e retomada), o arquivo terminou em `FIM-TRAVADA-42` e a tela mostrou o fim
sem aviso de descarte.

**Limites.** Não validei macOS nem Linux no app; o risco do socket destruído 200 ms depois do fim do processo pausado é real
lá e só foi reduzido (marca alta), não eliminado. O descarte no reanexo perde um aviso sintético do main (`[Felixo] Camada…`)
que esteja nos 8 ms do lote, porque ele não entra no replay. Não medi a latência do eco no app (só na bancada) nem com 20
terminais reais. O flake de perda de saída do PTY nativo no Windows (`count=20`) continua em quarentena e não tem relação
com esta mudança.

**Adendo (2026-11-11, depois do push): CI e Release.** O CI de `b18c07a` (run 43027484226, 10:15–10:22) passou no escopo, no
Validate em Windows, macOS, Ubuntu e Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`; o Release gate (run 43028481767) e o
Release (run 43028520221, 10:22–10:32) saíram verdes e publicaram a `v0.1.523` nos três sistemas, com a validação do app
instalado e a atualização silenciosa com o app aberto no Windows (3 min 52 s).

---

## 2026-11-11 — Canvas: o arrasto só recria o bloco arrastado, sessões e dock param de re-renderizar o que não mostram, e a trava de montagem ganha cenário no smoke

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Task
`3e991f95-497e-81c5-ad8f-f058eb3b93b7` (item 4 do pedido de performance de 28/09).

**Contexto (conferido no código de hoje, não só na investigação de 28/09).** `renderedNodes` criava `{ ...node, dragHandle }`
para todo bloco a cada mudança de `nodes`, e o React Flow 12.11.6 só reaproveita o nó interno quando recebe o mesmo objeto
(`userNode === internalNode.internals.userNode`, `@xyflow/system`), então todo NodeWrapper montado re-renderizava a cada
`pointermove`; `orderedNodes` e `edgesWithHandles` também recriavam objetos; o índice de conexões, o `data` injetado e a
assinatura de agentes (O(arquivos × terminais)) rodavam por quadro; o minimapa fazia um `nodes.find` por bloco. O
`CanvasView` re-renderizava a cada transição de qualquer sessão (`useCanvasNotifications` → `useSessionSnapshots`) para usar
só o conjunto de blocos que pedem ação; a linha da dock assinava o snapshot inteiro para mostrar a atividade; a dock recolhida
mantinha as linhas montadas; o spinner do cartão girava sob reduced motion e no Modo Performance.

**O que mudou.**

1. `node-data-cache.ts`: `createReusePass` (genérico; `createNodeDataReuse` virou um caso dele), `stableNodeStructure` e
   `createNodeStructureTracker`. No `CanvasView`, a lista estrutural (mesma enquanto só posição, tamanho ou seleção mudam)
   alimenta o índice, o `data` injetado (`nodeDataById`, assinatura de terminais uma vez por passagem) e os rótulos do
   minimapa (`Map`); por quadro, `renderedNodes`, `orderedNodes` e `edgesWithHandles` reaproveitam o objeto de quem não mudou.
2. `terminal-session-context.ts`: `createStableValue`, `useSessionSnapshotsSelector` e `useSessionActivity`;
   `useCanvasNotifications` assina só o conjunto que pede ação (`sameIdSet`) e lê o resto do store na hora do efeito; a linha
   da dock usa `useSessionActivity`.
3. Dock recolhida desmonta as linhas 260 ms depois (fim da dobra de 220 ms) e as remonta na hora ao abrir; spinner do cartão
   com `motion-safe:animate-spin` e regra do Modo Performance (`.felixo-busy-spin`).
4. `canvas-smoke.cjs`: `checarTravaDeMontagemSolta` (depois do `checarZoomVisual`) abre e fecha a gaveta, tira o foco do
   gatilho, aproxima o zoom em passos de 1,2× (abaixo do `maxZoom` 2) até um bloco do fixture sair do DOM e volta o mesmo
   número de passos, conferindo a escala exata do viewport. Primeira versão falhou "34% → 47%": cada clique saía no meio da
   animação de 180 ms; agora o passo seguinte espera a escala parar.
5. Bancada opt-in `canvas-drag-frame-benchmark.ts` (300 e 1.000 blocos, 60 quadros), inventário (lacunas resolvidas, a que
   sobrou reescrita) e arquitetura.

**Medido.** Bancada: 300 blocos 1,08 → 0,11 ms por quadro (p50) e 300 → 1 objeto de nó com identidade nova por quadro;
1.000 blocos 9,05 → 0,32 ms e 1.000 → 1; arestas 100/333 → 0. App de fonte (devtools, Windows, React de desenvolvimento),
300 notas montadas, arrasto de 30 passos com `?canvas-profiler=1`, 3 rodadas de cada lado com o canvas resemeado e o bloco
conferido no lugar final: antes 122 commits e 6.205–6.272 ms somados; depois 62 commits e 3.901–3.950 ms (−49% e −37%).
`tsc -b`, `eslint .` e `vite build` limpos; vitest 222 arquivos, 3439 testes; `npm test` 3182, 0 falham. Smoke local com as
mudanças: A (com o cenário novo), B, D e F passam; C4 e P3 falham **igual no `main` sem as mudanças** (A/B com `git stash`)
e passam no CI (Windows e macOS no Nightly 43032576510): falha desta máquina, task aberta.

**Limites.** O custo por commit do arrasto ficou em ~35–45 ms nesse build: não é mais o NodeWrapper dos blocos parados, e sim
o próprio `CanvasView` e o minimapa, que seguem re-renderizando por quadro (task aberta para medir em produção e cortar). Não
contei renders de NodeWrapper diretamente (o React Profiler do app mede o `CanvasView` inteiro): a prova é a identidade dos
objetos na bancada, o código do xyflow e a queda de commits. O seletor de sessão relê o conjunto a cada transição (O(blocos)),
só não re-renderiza. A dock recolhida no Modo Performance (sem transição) ainda espera os 260 ms para desmontar.

**Adendo (2026-11-11, depois do push): CI e Release.** O CI de `76d52b9` (run 43039543532, 11:33–11:38) passou no escopo, no
Validate em Windows, macOS, Ubuntu e Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`, onde o cenário novo rodou
(`[canvas-visual] trava-de-montagem-solta`) com as sessões A a F; o Release gate (run 43040504818) e o Release (run
43040539242, 11:39–11:47) saíram verdes e publicaram a `v0.1.524` nos três sistemas. **Não conferido:** o cenário novo no
Windows e no macOS do CI, que só rodam o smoke no Nightly das 06:00 UTC (o de 12/11/2026); no Windows local passou.

---

## 2026-11-11 — Terminal: as varreduras das telas de aceite param quando o REPL é reconhecido

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Task
`3e991f95-497e-8109-832d-f789917f708d` (pendência da fatia 1 de performance, 28/09).

**Contexto.** `handleCodexTrustPrompt`, `handleClaudeBypassWarning` e `handleClaudeTrustPrompt` refaziam `(buffer + pedaço).slice(-12000)`
e rodavam os reconhecedores a cada pedaço até a tela delas aparecer — numa pasta já confiável, a sessão inteira; o aviso do modo e a
confiança do Claude mantinham dois buffers com o mesmo fluxo; `trackCodexUpdateBanner` copiava a janela a cada pedaço só para o
`finishExit` ler no fim. Não dava para parar pelo `initialTextSent`: o prazo de emergência de `scheduleInitialText` o marca pelo relógio.

**O que mudou.**

1. `terminal/rolling-text.ts` (novo): janela rolante dos últimos N caracteres, pedaço = inserção numa lista (técnica do
   `pty-replay-buffer.cjs`), junção só na leitura.
2. `terminal-session-store.ts`: uma janela só para as três varreduras (`scanAcceptScreens`), rolante também a do banner de update;
   sinal positivo `replRecognized` em `trackReplRecognized`, chamado a cada mudança de tela no `onOutput` enquanto alguma varredura
   está pendente: linha de entrada pronta (`readInputLineState`), sem tela de decisão (`looksLikeApprovalPrompt`) e, no Codex 0.158+,
   com o chat de verdade aberto (`isCodexStillStarting` falso — o compositor provisório vem antes da tela de confiança). Reconhecido,
   as varreduras não rodam mais e a janela é esvaziada.
3. Inventário: a lacuna "as varreduras continuam depois do REPL" saiu.

**Medido.** Testes novos no store (xterm real): com espião em `isClaudeTrustPrompt`/`isClaudeBypassPermissionsWarning`, rodam antes do
REPL e nenhuma vez depois, nem com 20 quadros de spinner e uma tela de confiança na sequência; o mesmo para `isCodexTrustPrompt` depois do
compositor; e uma tela de confiança tardia, depois de o prazo de emergência ter digitado o contexto pelo relógio, sem REPL, ainda é aceita
(seta e Enter). **O teste do espião falha com o store anterior** (`git checkout` do arquivo, `1 failed`) e o da tela tardia passa nos
dois. Janela rolante: propriedade com 200 sementes igual ao `concat + slice`, e teto de memória. Medição por pedaço de spinner (100
caracteres, 20.000 pedaços, Node): varredura do Claude antes do REPL 99,33 → 94,01 µs (o custo agora é dos reconhecedores, só na
abertura); depois do REPL, as varreduras não rodam; janela do banner de update 2,76 → 0,47 µs. Essa medição pegou um defeito da
primeira versão da janela (guardava a junção inteira e crescia sem teto quando lida a cada pedaço: 486 µs), corrigido antes do
commit e coberto pelo teste do teto. vitest 223 arquivos, 3445 testes; `npm test` 3182, 0 falham; `tsc -b`, `eslint .` e `vite build`
limpos; smoke local A, B, D e F passam (C e E têm a falha só desta máquina, registrada à parte).

**Limites.** Não abri o Claude Code nem o Codex reais no app: os testes usam saídas capturadas das CLIs num PTY real. Antes do REPL a
varredura ainda custa ~94 µs por pedaço (os reconhecedores compactam a janela de 12.000), só durante a abertura. CLIs sem leitor de
linha de entrada (Gemini, Openia) não têm varredura de aceite, então nada muda para elas.

**Adendo (2026-11-11, depois do push): CI e Release.** O CI de `afabd0c` (run 43047183720, 12:19–12:26) passou no escopo, no
Validate em Windows, macOS, Ubuntu e Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`; o Release gate (run 43048435370) e o Release
(run 43048476681, 12:27–12:34) saíram verdes e publicaram a `v0.1.525` nos três sistemas.

---

## 2026-11-11 — Terminal: ir ao Chat solta o store de terminais em vez de deixá-lo órfão, sem matar os PTYs

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Task
`3e991f95-497e-8104-a090-d5b295ba4747` (pendência da fatia 1 de performance, 28/09).

**Contexto.** Ir ao Chat desmonta o canvas; na volta, o `TerminalSessionProvider` cria outro store, e o antigo ficava para trás com
os xterms (e o scrollback deles), os timers e o ouvinte do `pty:data` da ponte vivos. Os processos PTY devem sobreviver (o novo
store reanexa pelo replay); o que sobrava era o lado do renderer.

**O que mudou.**

1. `TerminalSessionStore.detachAll()`: o desligamento do `remove` (timers, ouvintes do DOM, rotas `pty:data`/`pty:exit`/`pty:session`,
   `terminal.dispose()`) sem `pty.kill` e sem liberar os arquivos de contexto (são do processo, que segue vivo), num `releaseRenderer`
   comum aos dois. Retoma o PTY que o xterm tinha pausado pelo controle de fluxo: sem isso, a CLI ficaria bloqueada escrevendo até
   alguém voltar ao canvas. Os ouvintes do React por id ficam, para uma sessão recriada no mesmo store os reaproveitar.
2. `DeferredTerminalSessionStore.detachAll()`: avança a mesma geração do `clear`, cancelando os `ensure` enfileirados antes de o
   runtime carregar — é o que torna seguro o desmonte simulado do StrictMode no desenvolvimento. `MockTerminalSessionStore`: sem
   efeito (o PTY falso vive dentro da sessão).
3. `TerminalSessionProvider`: `useEffect(() => () => store.detachAll(), [store])`.
4. Inventário: as duas lacunas do store órfão saíram.

**Medido.** App de fonte (devtools, Windows): 4 shells com 3.000 linhas cada, cinco idas ao Chat e voltas, heap depois de
`HeapProfiler.collectGarbage` a cada volta (playwright-core via CDP). Antes (código anterior via `git stash`): 27,4 → 37,5 → 45,5 →
56,1 → 69,4 → 85,1 MB (+57,7 MB, ~11,5 MB por volta). Depois: 30,4 → 31,9 → 31,8 → 32,0 → 32,3 → 32,6 MB e, numa segunda
rodada, 27,7 → 32,3 (primeira carga do Chat) → 32,3 → 32,4 → 32,7 → 33,0 MB. Em todas as voltas as quatro sessões reanexaram pelo
replay (a espera exigia a última linha impressa de cada uma). Testes novos: no store real (xterm de verdade), `detachAll` chama
`dispose`, zera os ouvintes da ponte, não chama `pty.kill` nem `contextFiles.release`, nenhum timer escreve depois, e um store novo
reanexa (spawn com reuso) mostrando o replay sem redigitar o contexto; o PTY pausado é retomado; no store adiado, o `ensure`
enfileirado antes do runtime é cancelado e a remontagem seguinte vale, e com o runtime carregado a sessão sai sem kill. vitest 223
arquivos, 3449 testes; `npm test` 3182, 0 falham; `tsc -b`, `eslint .` e `vite build` limpos; smoke local A, B, D (duas rodadas de
primeira) e F passam.

**Limites.** O provider não tem teste de componente (o repositório não testa `.tsx`): a ligação foi conferida pela medição de heap no
app. O L9 do smoke (toque em link do terminal) é instável nesta máquina com ou sem a mudança (no `main` falhou na 1ª tentativa e
passou na 2ª); registrado na task das falhas locais do smoke.

**Adendo (2026-11-11, depois do push): CI e Release.** O CI de `818070b` (run 43053517966, 12:57–13:04) passou no escopo, no
Validate em Windows, macOS, Ubuntu e Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`; o Release gate (run 43054671784) e o Release
(run 43054719317, 13:04–13:13) saíram verdes e publicaram a `v0.1.526` nos três sistemas.

---

## 2026-11-11 — Logs: custo dos logs do chat legado e do orquestrador no processo principal limitado

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Task
`3e991f95-497e-81a5-9814-f17fb58c9240` (pendência da fatia 1 de performance, 28/09).

**Contexto.** A investigação de 28/09 confirmou cinco custos que não tocam a carga do canvas, só o chat legado e os sub-agentes do
orquestrador: o QA Logger gravava um `debug` por pedaço de stdout e por linha JSONL; o `terminal-log-store` relia e agregava o JSONL
inteiro de forma quadrática a cada `getSessions` (exportação do chat, `felixo canvas ler`), sem teto; o `TerminalPanel` do chat
mesclava e reordenava tudo a cada flush, mesmo fechado; o prune do QA só rodava no boot e apagava o dia atual acima de 5 MiB; os
`outputBuffers` da ponte de orquestração não tinham teto e ficavam retidos quando o sub-agente era parado; o `jsonl-line-reader`
refazia o split do pendente inteiro a cada push.

**Decisões do Felipe (Trilha B, 11/11/2026).** stdout e JSONL viram um resumo por execução; stderr segue um registro por pedaço;
teto do arquivo de saída das CLIs de 256 MB; sem remoção automática de sessões encerradas no painel.

**O que mudou.**

1. `jsonl-line-reader`: guarda os pedaços da linha aberta e só junta quando ela fecha (linear).
2. `terminal-log-store`: agregação no lugar (push e `visibleChars` incremental); `getSessions` lê em fluxo pelo leitor JSONL (o
   `readline` quebra em U+2028, que o JSON guarda literal); teto de 256 MB em dois arquivos de 128 MB que se revezam. Sem cache
   residente: guardaria até 256 MB no processo principal, e a leitura linear já cumpre o critério.
3. QA Logger: `cli:stdout`/`cli:jsonl` por pedaço saem; `createStdoutSummary` (em `cli-event-utils`) leva
   `stdout: { chunks, bytes, jsonlLines, lastLinePreview }` ao `cli:close` da execução única e do processo persistente. O buffer de
   400 muda no lugar em vez de recopiar o array; `getEntries` devolve cópia.
4. QA em disco: o dia é gravado em partes de 1 MiB (`qa-AAAA-MM-DD.jsonl`, `qa-AAAA-MM-DD.N.jsonl`); o prune roda também ao virar
   o dia ou abrir uma parte e nunca apaga a parte em uso; ordenação por dia e parte.
5. Ponte de orquestração: `discardThread` (chamado em `cli:stop` e `cli:reset-thread`) apaga o buffer do sub-agente e a guarda de
   texto livre do orquestrador, que antes ainda disparava depois da parada; o texto do sub-agente guarda no máximo o último
   1.000.000 de caracteres, com aviso no início do que saiu.
6. `TerminalPanel`: fechado, deriva sobre lista vazia; a mescla pai + turnos é reaproveitada por identidade dos objetos; as ordenações
   leem o horário uma vez por item. As derivações foram para `terminal-panel-sessions.ts`.

**Medido** (Windows, Node 25.3, scripts do agente; antes = código anterior via `git stash`). `getSessions` de ponta a ponta:
10.000 eventos de uma sessão 226,8 → 32,7 ms; 20.000 de uma sessão 1.554,6 → 52,7 ms; 20.000 em 20 sessões 140,9 → 53,7 ms.
Agregação pura, 20.000 eventos de uma sessão: 1.640,9 → 48,1 ms (10.000 → 20.000 dobra). Leitor JSONL, linha de 8 MB em pedaços de
64 KB: 193,7 → 5,1 ms. QA Logger por pedaço de stdout: ~72 µs síncronos, ~500 µs com o disco e ~1,2 KB por entrada (2.000 entradas
reais com disco) → ~0,25 µs e nenhuma entrada. Painel, derivação por flush (240 pedaços por sessão): 20 sessões 8,7 → 1,0 ms; 50
sessões 24,3 → 2,7 ms, com a mesma assinatura de resultado; fechado, nada. Testes que falhavam antes: leitor linear (1.065 ms com teto
de 300), agregação de 20.000 (1.559 ms com teto de 400), revezamento dos arquivos, resumo e ausência de debug por pedaço, prune sem
apagar o dia e com partes, descarte e teto da ponte, painel fechado sem derivar e mescla reaproveitada; equivalência do painel com a
implementação anterior em 60 cenários aleatórios. vitest 224 arquivos, 3452 testes; `npm test` 3204, 0 falham; `tsc -b`, `eslint .`
e `vite build` limpos. Smoke no app de fonte (devtools): boot grava `logs/qa/qa-2026-11-11.jsonl`, `getTerminalLogs` responde pelo
caminho em fluxo, nenhuma entrada por pedaço.

**Limites.** Nenhuma CLI real foi rodada no chat (gastaria a conta): o resumo no `cli:close` foi conferido por teste unitário e
estrutural. Passados 256 MB numa execução, a exportação e o `felixo canvas ler` começam no trecho mais antigo guardado, sem aviso na
sessão. O teste do painel fechado espia o módulo; o resto do componente segue sem teste de render além do existente.

**Adendo (2026-11-11, depois do push): CI e Release.** O CI de `6e39f5c` (run 43060930176, 13:42–13:49) passou no escopo, no
Validate em Windows, macOS, Ubuntu e Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`; o Release gate (run 43062040266) e o Release
(run 43062080158, 13:49–13:58) saíram verdes e publicaram a `v0.1.527` nos três sistemas. Pendências abertas no Notion: conferir com
uma CLI real o resumo no `cli:close` e avisar quando o teto de 256 MB descartar o começo da execução.

---

## 2026-11-11 — Performance: estado real do canvas com terminais e gaveta medido, e frame, long task e eco no gate

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Task
`3e991f95-497e-811a-93e3-c3dfe8629bcd` (pendência da fatia 1 de performance, 28/09).

**Contexto.** A fatia 1 (28/09) provou os ganhos do renderer só por teste. Faltava medir o app real: canvas com terminais, gaveta
aberta e fechada, arrasto, nós fora da janela, latência de tecla → eco com 20 terminais transmitindo, frame e long task no gate
entre commits, a sessão de heap no Windows e um baseline local. Desde 04/11 a `canvas-many-agents-benchmark.cjs` já cobria parte
(agentes vivos pelo PTY roteirizado, gaveta sempre aberta, roda), e o relatório dela já tinha os campos do gate.

**Decisões do Felipe (Trilha B, 11/11/2026).** Gate com +20% e piso absoluto (frame +8 ms, long task +50 ms, eco +16 ms); gate
manual; antes/depois com as mudanças de hoje (a bancada não existe na fatia 1); tudo de uma vez.

**O que mudou.**

1. `canvas-many-agents-benchmark.cjs`: três fases (gaveta fechada, gaveta aberta com digitação, arrasto), cada uma um resultado
   `canvas-many-agents:<fase>` para o gate; tecla → eco (keydown de `q`/`z`/`w` ao quadro seguinte à chegada do eco pelo
   `pty:data`) num terminal parado a mais, porque no PTY falso o eco entra na fila atrás do roteiro (2,5 s medidos no agente que
   transmite) e o `x` aparecia no eco do gatilho (`felixo`); blocos montados e fora da área, e mutações de DOM dentro deles com o
   controle dos blocos à vista; zoom fixo de 6 passos abaixo do terminal de digitação (enquadrado, tudo cabe na tela e a
   virtualização não aparece); tempo até a virtualização voltar; coletores desligados no fim de cada fase.
2. `benchmark-regression-gate.cjs`: métricas `frameMs.p95` (fora quando a janela está estrangulada), `longTaskMs.p95` (0 quando
   não houve nenhuma, decidido só pelo piso) e `keyEchoMs.p95`; cenário casado também por `nodes`; várias rodadas por vírgula
   em `--baseline`/`--current`, com a mediana por métrica.
3. `canvas-long-session-heap-capture.cjs`: no Windows a tabela de processos vem do `Win32_Process` pelo PowerShell, no formato
   do `ps`.
4. Documentação: README das bancadas (fases, gate, procedimento por worktree, resultado), `docs/performance/PERFORMANCE.md`
   (baseline local e o fim do "NÃO MEDIDO" de latência), três relatórios do `main` como baseline local, e a política com
   símbolos no lugar de `CanvasView.tsx:2730`/`:2310`, corrigindo a linha que dizia que o Modo Performance corta fit/pan (a
   pílula de zoom tem duração fixa de 180/240 ms).

**Medido** (Windows 11, 16 núcleos, 13,8 GiB; `dist` de produção; 20 agentes, 300 blocos + o terminal de digitação; 15 s por
fase). Antes = `main` em `25ed4ad` (10/11) por worktree; depois = `main` em `c064518`; mediana de 3 rodadas intercaladas:
gaveta fechada frame p95 33,3 → 33,3 ms, long task p95 61,0 → 63,6 ms, entrada → quadro 49,0 → 49,2 ms; gaveta aberta 49,8 →
49,8 ms, 84,2 → 86,0 ms, tecla → eco p95 104,3 → 108,9 ms (36 teclas); arrasto 16,8 → 16,7 ms, 100,8 → 66,0 ms; refresh 670 →
632 ms; virtualização de volta 578 → 566 ms; RSS p95 do renderer 774 → 742 MiB. A gaveta aberta monta os 321 blocos (300 fora da
área) contra 53 com ela fechada, e sobe o frame p95 um quadro. Fora da área, zero mutação de DOM em todas as fases e rodadas,
contra 5–10/s nos blocos à vista. Gate: antes × depois, mediana de 3, sem regressão nas 6 métricas dos 4 cenários; controles com
o mesmo código: 1 × 1 acusou 3 falsas regressões (frame 33,3 → 49,9 ms; eco 89,9 → 118,5 ms), 2 × 2 acusou o eco no limite
(+20,0%), 3 × 3 nos dois sentidos, nenhuma. Sessão de heap no Windows: 387 processos lidos em 1,2 s; RSS da árvore 823,7 MiB (8
processos) no início e 872,5 MiB (11: electron, 3 shells e conhost) com a fixture. Testes: 12 novos (gate, bancada, tabela de
processos), os que pedem comportamento novo falhavam antes; `npm test` 3216, 0 falham; vitest 3452; `tsc -b` e `eslint .` limpos.

**Limites.** A sessão de heap foi interrompida pelo Claude Code por falta de memória na máquina depois do segundo ponto de
controle; a sessão completa (30 min) no Windows ficou para outra task. Uma rodada da bancada leva ~1,5 min e o gate pede três de
cada lado. A pílula de zoom não respeita o Modo Performance, como a política dizia; virou task.

**Adendo (2026-11-11, depois do push): CI, Release e uma correção.** O CI de `19892eb` (run 43071022791, 14:44–14:50) passou no
escopo, no Validate em Windows, macOS, Ubuntu e Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`; o Release gate (run 43072021039,
14:50–14:52) saiu verde e pulou o Release, porque nada do app mudou (só scripts de bancada e documentação) — a versão publicada
segue a `v0.1.527`. Correção da política: o enquadramento depois de **Organizar** (`useMatrixArrange`) respeita o Modo Performance;
só os botões da pílula de zoom não (o texto do commit `0cedbed` dava a entender que nenhum fit/pan respeitava). Pendências
abertas no Notion: o quadro a mais da gaveta aberta e a pílula de zoom; a sessão de heap completa no Windows entrou como nota na
task da matriz de heap, e a bancada nova, na task do harness em Linux, macOS e 1.000 blocos. A espera do CI em segundo plano e a
sessão de heap foram interrompidas pelo Claude Code por falta de memória na máquina.

---

## 2026-11-11 — Limites: retenção das amostras de uso, leitura repetida da status line confirma em vez de gravar, e a status line do app reconhecida sem a marca

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Tasks
`3e991f95-497e-8189-81c1-e2068468cd65` (retenção) e, a pedido do Felipe, a irmã `3fa91f95-497e-8199-a29e-cd1128c23e9d` (parar de
gravar e reenviar o painel inteiro a cada resposta do Claude).

**Contexto.** `agent_usage_samples` só recebia INSERT: nesta máquina, 46.502 linhas e ~62 MB de um banco de 69 MB, com até 2.700
linhas num dia. A maior parte vinha da status line do Claude, que grava um `measuredAt` novo a cada resposta enquanto a
comparação exigia o mesmo horário — cada leitura repetida virava linha e remontava e reenviava o painel inteiro para a tela,
com o painel aberto ou fechado. O `settings.json` desta máquina perdeu a marca `felixoManaged`, e o painel chamava o próprio
script de "status line alheia", sem jeito de desligar.

**Decisões do Felipe (Trilha B, 11/11/2026).** 200 amostras por conta (sempre com a última com métrica); VACUUM uma vez; nenhuma
cópia do que sai; as duas tasks juntas.

**O que mudou.**

1. `agent-usage-repository.cjs`: poda por conta em cada `saveSample` (as 200 mais recentes e a última com status
   `current`/`stale` e métrica); `maintainSamples` no boot, antes da janela, numa transação, com VACUUM só depois de uma poda de
   5.000+ linhas; `updateSampleMetadata`. O `main.cjs` registra a poda no QA Logger (`agent-usage:retencao`).
2. `agent-usage-service.cjs`: `refreshLocal` compara fonte, identidade e métricas normalizadas com a última amostra; repetidas,
   só avança o `measuredAt` dela (`kind: 'confirmed'`), números novos gravam (`kind: 'sample'`); `describeAccount` monta uma
   conta só (`buildDashboardAccount`, extraída do `buildDashboard`).
3. `agent-usage-ipc-handlers.cjs` e o agendador: o watcher manda `agent-usage:account-changed` com a conta — número novo sempre,
   confirmação só com o painel ou o modal visível (`isConsumerVisible`), porque a tela calcula o "desatualizado" pelo
   `measuredAt` que recebeu. O preload ganhou `onAccountChanged`; o painel troca a conta com `replaceAgentUsageAccount`.
4. `claude-statusline-service.cjs`: é do app a status line marcada ou cujo `command` é `node "<caminho>"` do script desta pasta;
   religar por cima dela mantém o backup antigo (guardá-la como "anterior" faria o desligar religar).
5. Inventário do painel de Limites (estados, controle da coleta, persistência e o canal novo) e `INVENTARIO-CANVAS.md`
   regenerado.

**Medido.** Banco desta máquina, só em leitura: 46.460 amostras (43.665 da conta Claude), a tabela com 50,2 MB e os índices
dela com 12,5 MB de 72,3 MB; uma conta com 188 amostras sem métrica depois da última boa. A primeira cópia por `cp` saiu
corrompida (o app gravava no meio): o banco real passou no `quick_check`, e as cópias seguintes foram pela API de backup do
SQLite. Na cópia, pelo caminho do boot (migrações + `maintainSamples`): 46.502 → 1.928 linhas, 69,1 → 12 MiB, 1,1 s na
primeira vez e 2,6 ms na seguinte; a última amostra e a última com métrica das 14 contas intactas. Poda de manutenção: 0,14 ms
por gravação. No app (devtools, perfil isolado, painel fechado), 50 capturas da status line com os mesmos números e
`measuredAt` novo: antes (código anterior via `git stash`) 49 amostras e 49 painéis inteiros enviados à tela; depois 1 amostra
com o `measuredAt` da última captura, nenhum painel inteiro e 1 aviso de conta. A status line desta máquina (sem a marca) passa
a ler `installed: true`. Testes novos (falhavam antes): retenção por conta com a última boa preservada, manutenção do boot,
confirmação de leitura repetida, aviso por conta e confirmação só com o painel visível, `isConsumerVisible`, status line sem a
marca e religar sem guardar a si mesma, `replaceAgentUsageAccount`. `npm test` 3224, 0 falham; vitest 3454; `tsc -b`,
`eslint .` e `vite build` limpos.

**Limites.** A poda do boot bloqueia o processo principal ~1,1 s uma vez (antes da janela). A confirmação com o painel aberto
não foi exercitada no app (abrir o painel chama as CLIs reais da conta); está coberta por teste. O botão de desligar a coleta
na status line sem a marca não foi clicado no app desta máquina (mexeria no `~/.claude/settings.json` real); está coberto por
teste com um settings igual ao desta máquina.

**Adendo (2026-11-11, depois do push): CI e Release.** O CI de `63a65d6` (run 43084992157, 16:12–16:18) passou no escopo, no
Validate em Windows, macOS, Ubuntu e Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`; o Release gate (run 43085946864) e o Release
(run 43085981244, 16:18–16:28) saíram verdes e publicaram a `v0.1.528` nos três sistemas. A primeira abertura dessa versão em cada
máquina faz a poda grande e o VACUUM. Pendência aberta no Notion: conferir no app, com uma sessão real do Claude, a confirmação com
o painel aberto e o desligar da coleta sem a marca.

---

## 2026-11-11 — Testes: o app-relaunch no Windows sem link simbólico já estava resolvido (conferido)

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Task
`3e991f95-497e-8176-ab39-c5772fb56d11` (pendência da fatia 1 de performance, 28/09).

**Contexto.** Em 28/09 o `npm test` falhava no Windows sem Modo Desenvolvedor: a fixture de AppImage do
`electron/core/app-relaunch.test.cjs` criava um link simbólico ao carregar o módulo, e o `EPERM` derrubava o arquivo inteiro.

**Estado conferido.** O commit `85c1cdf` (12/10/2026) já tolera o `EPERM` só no Windows, onde os testes que usam o link são
pulados por `SO_EM_POSIX`; fora do Windows, ou com outro erro, a falha continua alta. Nada a mudar no código.

**Medido.** Esta máquina não tem o privilégio (`fs.symlinkSync` → `EPERM`), ou seja, é o caso da task: o arquivo dá 6 passam, 5
pulados com o motivo e 0 falhas; o `npm test` inteiro de hoje deu 3214 passam e 0 falhas. No CI 43084992157 (`63a65d6`), os 5
casos de AppImage, inclusive "TMPDIR por link simbólico", rodam e passam no Ubuntu e no macOS (`ok 103`) e só o Windows os pula
(`# SKIP montagem de AppImage com caminhos POSIX`).

---

## 2026-11-11 — Contas: a fila do botão Agente confirma a conta "Automática (cadeia)" ao iniciar

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Task
`3e991f95-497e-81ce-9286-cbe3532f3044` (aberta na trilha da interface da cadeia, PR #97).

**Contexto.** Com "Automática (cadeia)", o "Adicionar à fila" chamava o `prepareForLaunch`, que confirmava a cadeia e guardava um
ticket de uso único (2 min, `TICKET_TTL_MS`); o `buildOptions` levava esse ticket para o item. Iniciar a fila depois disso fazia o
`pty:spawn` ser recusado (`TICKET_EXPIRED`): o bloco nascia em erro, sem cobrança.

**Decisões do Felipe (Trilha B, 11/11/2026).** Opção A (confirmar ao iniciar a fila); um item cuja conta deixou de ser apta fica
de fora com o motivo e a conta nova sugerida, nunca abre noutra; cada item da cadeia como se abrisse sozinho.

**O que mudou.**

1. `useAgentConfig`: `prepareForLaunch({ confirmChain: false })` — para a fila, a cadeia só precisa da conta mostrada (prévia
   pronta); a confirmação fica para depois. Sem argumento (abrir agora, passar responsabilidade), confirma como antes.
2. `services/terminal-launch-queue.ts`: `startLaunchQueue` confirma cada item da cadeia na conta mostrada, ao iniciar, e devolve os
   que abrem (com `accountMode: 'chain'` e o ticket novo) e os que ficam (com o motivo e a prévia recalculada, ou uma prévia nova
   quando a proposta venceu).
3. `TerminalMenu`: a fila guarda `{ options, chain: { proposal, summary } }`, mostra "Automática (cadeia): Vai abrir na conta …" e
   "Não abriu: <motivo>", pede uma prévia nova depois de cada item da cadeia e só fecha quando tudo abriu.
4. Inventário: os controles da fila descrevem o fluxo novo; a lacuna do ticket na fila saiu.

**Medido.** Testes de `startLaunchQueue` (4, falhavam antes: o módulo não existia): itens da cadeia confirmados só ao iniciar, na
ordem, com o ticket novo e a conta confirmada; conta fixa passa intacta; conta que ficou inapta fica na fila com o motivo e a
prévia recalculada; proposta vencida pede prévia nova; sem conta apta, nada abre. No serviço real da cadeia com relógio
controlado: confirmar e usar o ticket 3 min depois dá `TICKET_EXPIRED`; prévia e confirmação 3 min depois abrem. `npm test` 3224
(3214 passam, 0 falham); vitest 3458; `tsc -b`, `eslint .` e `vite build` limpos.

**Limites.** O fluxo não foi exercitado no app: o perfil isolado não tem cadeia configurada (exige contas com login conferido).
A fila na interface (adicionar, remover, esvaziar, iniciar) continua sem teste de componente (lacuna própria no inventário).

**Adendo (2026-11-11, depois do push): CI e Release.** O CI de `05c4d5c` (run 43090250630, 16:46–16:53) passou no escopo, no
Validate em Windows, macOS, Ubuntu e Ubuntu ARM e no `Canvas smoke (ubuntu-latest)`; o Release gate (run 43091385529) e o Release
(run 43091421068, 16:53–17:02) saíram verdes e publicaram a `v0.1.529` nos três sistemas. Pendência aberta no Notion: conferir no
app a fila iniciada depois de 2 minutos, com a cadeia ligada; nota deixada na task das prévias acumuladas (reaproveitar a prévia
aberta não pode juntar dois itens da fila na mesma proposta).

---

## 2026-11-11 — Contas: espera de limite vencida oferece "Conferir login" no lugar do "Não era limite" sem efeito

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core (`J:/Programação/GitHub/Repositórios/Felixo-AI-Core`). Task
`3e991f95-497e-814a-ba35-d65bacdde06f` (aberta na revisão da interface da cadeia, PR #97).

**Contexto.** Vencida pelo prazo (`released_by = vencimento`), a espera de limite continua bloqueando até uma checagem de login
posterior (regra 5 da política; `cooldownBlocks`). A lista da cadeia mostrava "espera vencida · precisa conferir o login antes de
voltar" com o botão "Não era limite" ao lado, e o `releaseCooldown` devolvia `released: false`: o clique não fazia nada.

**Decisões do Felipe (Trilha B, 11/11/2026).** Opção B (manter a regra 5 e trocar o botão por "Conferir login"); o botão fica na
linha da espera; a faixa do bloco do terminal fica como está (lá o clique fecha o aviso daquela sessão).

**O que mudou.** `cooldownAction` (`account-chain-view.ts`) escolhe o botão da espera — `check-login` com `needsCheck`,
`not-a-limit` com a espera de limite correndo, `recharged` na de cobrança — e a `AccountChainSection` mostra "Conferir login" (a
mesma checagem do "Conferir agora") nesse estado. A política diz que o "Não era limite" vale com a espera correndo. Inventário:
controle novo e as duas lacunas desta task removidas. Main e faixa sem mudança.

**Medido.** No serviço real da cadeia, com a regra real da espera (o dublê de política do harness trata qualquer espera liberada
como livre): espera de limite com fim em 10 min, 11 min depois a varredura a marca `vencimento`; o membro segue `em-espera`;
"Não era limite" devolve `{ ok: true, released: false }` e ele continua `em-espera`; uma checagem de login OK o tira da espera.
`cooldownAction` com 2 testes (falhavam antes). `npm test` 3226 (3216 passam, 0 falham); vitest 3460; `tsc -b`, `eslint .` e
`vite build` limpos.

**Limites.** O botão não foi clicado no app (o perfil isolado não tem cadeia configurada); a lista da cadeia segue sem teste de
componente, como o inventário já registrava.

**Adendo (2026-11-11, depois do push): CI e Release.** O CI de `530c73e` (run 43094438080) falhou na 1ª tentativa por dois motivos
alheios à mudança: o `installer-kill-smoke.test.cjs` no Windows contou quatro processos a mais como órfãos (nenhum dos 40 CIs
anteriores tinha falhado; virou task no Notion) e o envio dos artefatos do smoke do canvas falhou com o GitHub instável (502 e a
execução presa ~50 min depois de todos os passos). A 2ª tentativa (só os jobs que falharam, 18:03–18:10) passou no Validate em
Windows e no `Canvas smoke (ubuntu-latest)`; os demais já tinham passado. O Release gate (run 43100802457) e o Release (run
43100835830, 18:10–18:18) saíram verdes e publicaram a `v0.1.530` nos três sistemas.

---

## 2026-11-11 — Orquestrador: Parar na conversa encerra o run que espera a confirmação de troca de provedor

**Pedido.** Task do Notion "Felixo AI Core/Orquestrador — decidir se parar a conversa encerra o run que espera confirmação de troca de provedor". A pergunta vem da validação final da cadeia de contas (28/09, arquivo de 2026-09): "se o stop do chat encerra o run" ficou como decisão de produto em aberto. A página do Notion não abriu daqui (o conector está em outro workspace); o escopo saiu do título, do arquivo do IA e do código.

**Medido (antes).** Reprodução no runner real, com script avulso fora do repositório:
- **A — um sub-agente, esperando a confirmação.** Depois do Parar, a pergunta saía cancelada, mas o run ficava em `waiting_agents` e ainda ligado à thread. Só o timeout do run o derrubava, mandando um erro atrasado ao chat. A mensagem seguinte da mesma conversa caía nesse run velho, com o job cancelado (`a1:error`) e o `originalPrompt` antigo.
- **B — dois sub-agentes, um esperando e outro rodando.** Quando o outro terminava, o orquestrador era reinvocado sozinho (1 vez), apesar do Parar.
- Pela leitura do código, o `cli:stop` só matava o processo da thread da conversa. Turno reinvocado (`<runId>:orchestrator-turn-N`) e sub-agentes seguiam vivos. Com o orquestrador já fechado, `kill` devolvia `false` e só a tela marcava "Execução interrompida.".

**Decisão do dono (11/11/2026, pergunta com três opções, recomendação "encerra tudo").** **Parar encerra tudo:** a pergunta é cancelada, o run é marcado como interrompido, os sub-agentes que ainda rodam param, nada reinvoca o orquestrador e a próxima mensagem abre um run novo. As outras opções eram encerrar deixando os sub-agentes terminarem com o resultado descartado, ou manter como estava.

**O que mudou.**
- `orchestration-runner.cjs`: `stopRunsForThread(threadId)` substitui `cancelProviderSwitchesForThread`. As decisões do run ou da thread saem como `cancelled` (registro `refused`/`cancelled`, como antes). O run ativo falha com "Execução interrompida pela pessoa." e o contexto é esquecido. O método devolve os runs encerrados. Saiu o `reinvoke: false` de `finishAgentJob`/`refuseProviderSwitch`, que só existia para esse caminho, e o ramo `cancelled` de `describeRefusedSwitchError`.
- `ipc-handlers.cjs`: o `cli:stop` chama `stopRunsForThread` e para também o turno reinvocado e os sub-agentes `running` (`collectRunProcessThreadIds`, exportada). Cada um passa por `stopCliProcess`, que marca `stoppedSessions` para o `close` não virar erro nem `done`. As threads paradas recebem o "Interrompido" (o terminal do sub-agente fica `stopped`). Quando havia run, o chat recebe `done` com `stopped: true` e o IPC devolve `ok: true`, mesmo sem processo do orquestrador vivo. `getOrchestratorTurnThreadId` é a única fonte do nome da thread do turno. Integrado sobre o `b3e81eae` (mesmo dia): o `orchestrationBridge.discardThread` que ele pôs no `cli:stop` agora vale também para o turno e os sub-agentes parados, para a saída retida deles não ficar na ponte.
- Documentação: `GUIA-USUARIO.md` (o Parar no card de troca), `ARQUITETURA.md` (orquestrador do chat) e `PLANO-CADEIA-CONTAS.md` §10.3.

**Decisões do agente.** A regra vale para qualquer run ativo da conversa, não só para o que espera a confirmação. Com sub-agentes rodando e sem pergunta pendente, o mesmo defeito B aparecia, e um Parar que encerra só às vezes seria incoerente com a resposta do dono. Os jobs do run parado ficam no status em que estavam, como no `resetThread`; quem conta é o status `failed` do run. O Parar não manda `error` ao chat.

**Validação.**
- `node --test` no runner (47/47) e no `ipc-handlers` (22/22). Dois testes novos no runner (A e B acima, incluindo a próxima mensagem abrir `run-2`) e um no IPC (escolha das threads a parar).
- Mutação: sem o `failRun` e o `forgetRunContext` em `stopRunsForThread`, os dois testes novos do runner reprovam. O arquivo foi restaurado idêntico (`cmp`).
- `eslint` nos quatro arquivos: 0.
- Depois de integrar sobre a `main` de `2f7ef8a5` (worktree separado, para não tocar no trabalho não commitado de outro agente no checkout principal): runner 47/47, `ipc-handlers` 22/22, `orchestration-ipc-bridge` 13/13, `expired-runs-sweeper` 5/5, `eslint` 0. A suíte completa abaixo rodou na base anterior (`25ed4ad2`).
- `npm test` (Windows): 3.180 testes, 3.163 passaram, 12 pulados, nenhuma falha em orquestração ou IPC. As falhas, todas fora desta mudança:
  - `devtools-fake-cli-pty-guard` ("contrato do main"): lê o `main.cjs`, modificado no working tree por outro trabalho em andamento (arquivo de saída do PTY) e fora deste diff.
  - `agent-usage-refresh-account` (teto de tempo) e `terminal-scrollback-benchmark` (dreno do PTY): passam isolados (13/13 e 20/20); a falha só aparece com a suíte sob carga.
  - `install-routes-process-tree` (duas falhas de "árvore inteira" e a rota pip): as falhas de ambiente do Windows já registradas em 09/11.

**Não validado.** O Parar no app real, com orquestrador, sub-agente e card de troca vivos: nenhum smoke cobre o orquestrador com troca de provedor, e o `cli:stop` não tem teste de handler (só a parte pura). A corrida em que o turno reinvocado emite `spawn_agent` entre o fim do run e o `kill` não foi exercitada; nesse caso o chat receberia um erro de run já finalizado.

Estado: concluído e publicado (ver commits abaixo).

**Adendo (2026-11-11, 22:4x, Resolver hotfix): deploy e registro no Notion.** O CI de `0f46efb` (run 43126449286, 21:19–21:25)
passou, e o Release gate (run 43127180224) e o Release (run 43127212095, 21:25–21:34) publicaram a `v0.1.531`. Conferido no
`main` atual: runner e `ipc-handlers` 69/69, inclusive "cli:stop na conversa encerra o run que espera a troca; a próxima mensagem
abre outro" (run `failed` com "Execução interrompida pela pessoa.", nenhuma reinvocação, a pergunta sai `cancelled`, outra thread
não é afetada). Como a página da task não abria do lado do agente que fez a mudança, a evidência, o relatório do dia e a conclusão
foram registrados no Notion por esta sessão, sem mudar código.

---

## 2026-11-12 — Contas: o mesmo limite depois de "Agora não" avisa no bloco, e a troca sai só a pedido

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-81c9-a900-f0d5585956f9` (aberta no teste de
ponta a ponta da cadeia, sessão C do PR #97).

**Contexto.** Depois de "Agora não", o mesmo limite na mesma sessão não gerava proposta nem faixa: só a saída do terminal o
mostrava, e a pessoa podia esquecer que recusou e perder a opção de continuar em outra conta.

**Medido (antes).** Havia duas camadas de silêncio, não uma. O serviço silencia a evidência recusada (I6). Antes dele, a vigia do
terminal guarda cada `evidence_hash` da sessão (LRU de 32) e nunca o emite de novo, então a linha repetida pela CLI nem chegava ao
serviço. Só uma vigia nova (o PTY reaberto no mesmo bloco) a deixava passar. Mexer só no serviço não mudaria nada no app.

**Decisões do Felipe (Trilha B, 12/11/2026).** Opção B: aviso discreto no bloco, sem proposta automática. **Trocar de conta**
sob demanda abre a proposta e o diálogo dela. O aviso fica só no bloco (nada nas notificações). As alternativas eram manter o
silêncio (a troca fica em Limites e uso) ou reabrir a proposta depois de X minutos.

**O que mudou.**
- Vigia (`account-output-watcher.cjs`): `markSubmit(outputChars)` arma a vigia. Se a mesma evidência aparecer no que a CLI imprimiu
  depois do Enter, ela sai de novo uma vez, marcada `repeat`. Redesenho sem Enter continua mudo. O `PtyProcessManager` chama o
  `markSubmit` em todo `write` com Enter fora de colagem entre colchetes (`scanSubmittedInput`) e passa `readOutputChars`.
- Serviço: o `repeat` só responde quando a última proposta daquela evidência foi recusada com "Agora não". Todo o resto (proposta
  aberta, "Não era limite", rede, ambíguo, bloco fixo) segue valendo uma vez por sessão, como antes. A recusa repetida publica a
  detecção `declined_again`, com um id guardado por sessão. `requestSwitch` abre a proposta só a pedido e vale uma vez por aviso. A
  saída da sessão e o reinício limpam esses ids.
- IPC `account-chain:request-switch` (`{ detectionId }` → `{ ok, proposalId }`), preload e tipos. A view manda `declinedAt`.
- Faixa do bloco: "Limite de uso da conta Pessoal de novo às 14:40 · você recusou a troca às 14:33", tom informativo, com
  **Trocar de conta** e **Dispensar**. O clique abre o diálogo da proposta nova.
- Smoke da sessão C: etapa C6b (o mesmo gatilho no bloco recusado → faixa sem proposta nem diálogo → **Trocar de conta** abre o
  diálogo → Esc fecha sem `pty:spawn`).
- Política (Confirmação), guia do usuário, plano da cadeia (vigia, I6, canal novo) e inventário (ação, canal, lacuna removida).

**Decisões do agente.** "De novo" é a CLI imprimir a linha depois de um Enter da pessoa. Um redesenho não conta, porque reabrir a
faixa a cada redesenho a faria voltar depois do "Dispensar". O `repeat` não cria proposta em nenhum caso, só o aviso da recusa,
para não mudar o que já valia nos outros estados.

**Validação.**
- Testes que falhavam antes da mudança: o do serviço ("depois de Agora não, o mesmo limite avisa no bloco…") e o da vigia ("o
  mesmo aviso impresso de novo depois de um Enter…"), conferidos com a mudança fora. Novos: o `repeat` só responde à recusa
  (serviço), o canal `request-switch` de ponta a ponta com o runtime real (formato, `INVALID`, `NOT_PENDING` na 2ª vez,
  proposta `opened` antes da resposta), o Enter no manager (inclusive o Enter dentro de colagem, que não conta) e a faixa
  (texto, tom, ações).
- `npm test`: 3234 testes, 3224 passam, 10 pulados, 0 falham. vitest: 3461 passam. `tsc -b`, `eslint .` e `vite build` limpos;
  inventário regenerado.

**Não validado.** A sessão C do smoke não roda nesta máquina (Windows). Ela para no C4 ("bloco fixo") porque o bloco nasce na
borda da área visível e o terminal fica estreito demais para a frase. O `main` sem esta mudança falha igual, então o problema é
local e anterior. A etapa C6b fica com o CI (Ubuntu). O botão não foi clicado no app com contas reais. Numa TUI que redesenha o
aviso inteiro a cada Enter, cada Enter conta como repetição. Isso só mostra de novo a faixa da recusa, nunca uma proposta.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-12, 09:47): CI, duas correções e Release.** O CI de `bf509f7` (run 43215712608, 09:11–09:17) passou no
Validate dos quatro sistemas. O smoke do canvas parou na etapa nova: a faixa "você recusou a troca" apareceu, sem proposta nem
diálogo (a reemissão da vigia funcionou no app), mas o clique em **Trocar de conta** não achava o botão estável. O bloco recusado
fica em parte fora da área visível, atrás da barra lateral, e o C6 já usa foco + Enter nele pelo mesmo motivo. `dc0bcc9` passou a
C6b para o teclado. No CI seguinte (run 43216643905, 09:18–09:23) o pedido criou a proposta (a faixa virou "a cadeia tem uma
proposta de troca"), mas o diálogo não abriu. O `openProposal` procura a proposta no estado do renderer no instante da resposta
do IPC, e ela ainda não estava lá. Em `d08400d` o hook relê o estado (`store.refresh()`) quando a proposta pedida falta, e a C6b
passou a relatar o texto do bloco e as propostas abertas se o diálogo não abrir. O CI de `d08400d` (run 43218491733, 09:30–09:36)
passou inteiro, com "C6b … [Trocar de conta] abre o diálogo e o Esc fecha sem pty:spawn: ok" na primeira tentativa. O Release
gate (run 43219437312) e o Release (run 43219477627, 09:36–09:45) publicaram a `v0.1.532` nos três sistemas. A causa exata do
atraso (a ordem entre o push `opened` e a resposta do `invoke`) não foi isolada. O hook não depende mais dela.

---

## 2026-11-12 — Contas: continuação para outro provedor pergunta o Yolo no diálogo, marcado por padrão

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-81cb-b09d-ebb8d88079c6` (aberta na política da
cadeia, PR #97).

**Contexto.** A continuação em outro provedor (decisão 2: qualquer provedor) herdava calada o modo de permissão do bloco antigo. O
`buildContinuationLaunch` lia nos argumentos antigos as flags de Yolo (`--dangerously-skip-permissions`,
`--dangerously-bypass-approvals-and-sandbox`, `--yolo`) e punha a do destino. O diálogo avisava que modelo e esforço voltam ao
padrão, mas não falava da permissão.

**Decisões do Felipe (Trilha B, 12/11/2026).**
- **Outro provedor:** a caixa de Yolo fica "sempre ativa, com opção de desativar". Ela aparece no diálogo marcada mesmo que o bloco
  antigo não tivesse Yolo. As alternativas eram herdar e só avisar, usar sempre o padrão do destino, ou mostrar a caixa marcada
  com o padrão do destino (desmarcada) ou com o estado do bloco antigo.
- **Mesmo provedor:** só dizer, sem controle. Os argumentos continuam se repetindo.
- **Openia:** esconder a caixa e explicar que ele pergunta as permissões no próprio menu.

**O que mudou.**
- `account-switch-dialog.ts`:
  - O modelo ganha `offersYoloChoice`, para outro provedor de agente nativo, e `permissionNotice` ("Abre com Yolo (acesso total,
    sem confirmações), como o bloco antigo." / "Abre sem Yolo, como o bloco antigo." / "O Openia pergunta as permissões no
    próprio menu ao abrir.").
  - `hasYoloFlag` sai exportada.
  - `buildContinuationLaunch` recebe `yolo` da caixa e deixa de deduzir dos argumentos antigos.
- `AccountSwitchDialog`: caixa "Yolo no bloco novo" (começa marcada), mais o aviso. O `onConfirm` leva `yolo`, que passa pelo hook
  e pelo `performContinuation`. O hook lê o Yolo do bloco antigo ao abrir o diálogo, e não no render (regra `react-hooks/refs`).
- Smoke da sessão C, C7 (Codex → Codex): o diálogo diz o modo e não mostra a caixa.
- Política (Confirmação), guia do usuário, plano (§9.1) e inventário.

**Validação.**
- Antes da mudança falhavam três testes: o modelo (caixa só em outro provedor, aviso no mesmo provedor e no Openia), o lançamento
  (desmarcado tira o Yolo mesmo com o antigo em Yolo; marcado põe o Yolo mesmo sem ele no antigo) e o `performContinuation`
  (Codex → Claude com a escolha do diálogo).
- Novo: o diálogo renderizado em HTML (`modal-dialogs-keys.test.ts`), com a caixa marcada em outro provedor e só o aviso no mesmo.
- `npm test`: 3234 testes, 3224 passam, 10 pulados, 0 falham. `tsc -b`, `eslint .` e `vite build` limpos. Inventário regenerado.
- vitest inteiro: 3462 e 3463 passam em duas rodadas. Em cada uma falhou um teste diferente, ambos fora desta mudança
  (`deferred-terminal-session-store` na 1ª, `canvas-context-e2e` na 2ª), e os dois passam isolados (9/9). Instabilidade sob carga.

**Não validado.** A caixa não foi clicada em nenhum teste de interface: a sessão C só tem contas Codex, sem destino em outro
provedor. Ela fica coberta pelo HTML renderizado e pelo modelo, e a lacuna está no inventário. Também não foi conferida no app com
contas reais de dois provedores.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-12, 10:30): CI e Release.** O CI de `cf4f40b` (run 43224887062, 10:11–10:17) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas, inclusive com "C7 … o diálogo dizendo o modo de permissão (mesmo provedor) …:
ok" na sessão C. O Release gate (run 43225965519) e o Release (run 43226008454, 10:18–10:27) publicaram a `v0.1.533` nos três
sistemas.

## 2026-11-12 — Contas: o estado da cadeia sobrevive ao reload, e "Conferir login agora" roda a CLI

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-811e-bcb6-d4bc81d44e99` (aberta na revisão do
PR #97).

**O que a task mediu (28/09) e o estado em 12/11.**
1. O `view.state` descartava as `ambiguousDetections` do serviço, e as faixas de detecção só chegavam por push: um reload do
   renderer perdia "Tratar como limite?", os avisos e o "você recusou a troca". Seguia aberto.
2. `alternativeUntilAt` saía sempre `null`: a política calculava os dois horários (medição e texto), mas a espera só gravava o
   que vale. Seguia aberto.
3. "Conferir login agora" chamava `checkLogin(accountId)` sem opções, e o runtime não repassava `force`: uma amostra do painel com
   login de até 15 min valia como checagem. Seguia aberto.
4. A segunda instância no mesmo perfil já estava resolvida pela trava de instância única (`core/single-instance.cjs`, task de
   25/09): ela sai antes do `ready`, longe do `recoverOnStartup`. O `felixo devtools --real-profile` recusa abrir com o perfil em
   uso, e o release smoke usa pasta própria.

**O que mudou.**
- Serviço: guarda a última detecção publicada por sessão (mesmo `id` e `detectedAt` do push) e o `getState` a devolve em
  `detections`. Ficam de fora a proposta aberta (que tem faixa própria), a pergunta já respondida e o aviso de "Agora não" já
  usado. `dismissDetection` (canal `account-chain:dismiss-detection`) esquece a detecção só se o id for o que a pessoa viu. A
  sessão que encerra e a recuperação limpam tudo.
- Renderer: o store junta as detecções do `get-state` às do push (`mergeDetections`). A mais nova da sessão vence, porque a
  ordem entre o push e a resposta não é garantida, e uma faixa dispensada nesta janela não volta. O `clearDetection` avisa o main.
- Migration 021: `alternative_until_at` e `alternative_until_source` em `account_cooldowns`. A política devolve o horário que
  perdeu com a fonte, o serviço o grava e a view o mostra.
- `force: true` no "Conferir login agora", repassado pelo runtime até `account-eligibility`.
- Teste de contrato: `claimSingleInstance` vem antes do `recoverOnStartup` no `main.cjs`.
- Smoke da sessão C, C10: a faixa do bloco fixo (C4) tem de voltar depois do reload.

**Validação.**
- Antes da mudança falhavam 8 testes: política (alternativo), repositório (alternativo gravado), migration 021 sobre um banco
  na versão 20, serviço (detecções no `getState`, alternativo na espera, `force`), IPC (reload pelo `get-state` e dispensar) e
  o aviso de "Agora não" relido no `get-state`. O teste do store (vitest) também falhava antes.
- `npm test`: 3239 testes, 3229 passam, 10 pulados, 0 falham. vitest inteiro: 3465 passam. `eslint .` e `npm run build` limpos.
- Smoke da sessão C local (Windows): falha no C4 ("bloco fixo: nada troca sozinho" não aparece) com e sem esta mudança (rodado
  também com `git stash`), então é do ambiente local. O C10 novo vale no CI (Ubuntu).

**Não validado.** Reload no app instalado com contas reais; a pergunta "Tratar como limite?" depois do reload só tem teste de
unidade e de IPC (o smoke não tem gatilho ambíguo).

Estado: concluído (deploy no adendo).

**Adendo (2026-11-12, 13:40): CI e Release.** O CI de `5ab853e` (run 43257395610, 13:19–13:31) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. Na sessão C saíram "C4 … faixa "bloco fixo" …: ok" e "C10 reload sem reenvio
(pty:write 105 → 105) e a faixa do bloco fixo continua: ok", então o C4 que falha na máquina local passa no Ubuntu. O Release gate
(run 43259203561) e o Release (run 43259243823, 13:29–13:37) publicaram a `v0.1.534` nos três sistemas.

**Adendo (2026-11-12, 13:58): inventário.** O inventário ainda dizia que "Dispensar" só limpava a detecção local; `a8a0835`
corrige a frase (agora avisa o main pelo `account-chain:dismiss-detection`) e regenera o `INVENTARIO-CANVAS.md`. CI 43261085296
(13:39–13:45) verde, Release gate 43262206665 e Release 43262253317 (13:46–13:55) verdes: `v0.1.535`.

## 2026-11-12 — Contas: a prévia de "Automática (cadeia)" não acumula propostas nem entra no registro de trocas

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-81b4-ac92-d7db960c9ae0` (aberta na revisão do
PR #97).

**O que foi medido (12/11, antes da mudança).**
- Script com o serviço e o SQLite reais: 10 prévias seguidas deixaram 10 propostas `launch` abertas e 10 linhas no registro de
  trocas, com 1 checagem de login. A checagem já não se repetia: qualquer resultado gravado vale 15 min, e a
  `account-eligibility` junta as checagens em voo da mesma conta.
- No `TerminalMenu` o `useAgentConfig` fica montado: abrir e fechar o painel não pedia prévia nova. As propostas vinham de três
  lugares:
  - cada troca de provedor com "Automática (cadeia)" escolhida;
  - cada abertura do Handoff, que monta o hook de novo com a última conta salva;
  - a prévia pedida depois de cada abertura ou item da fila.
  Nenhuma era solta: ficavam `proposed` por 30 min, entravam no registro e ocupavam a retenção de 1000 linhas.

**O que mudou.**
- Repositório:
  - `deleteLaunchPreview` apaga só a `launch` ainda `proposed`.
  - `listSwitchEvents` (o registro) e `pruneSwitchEvents` deixam de fora as `launch` nunca confirmadas (`decided_at` nulo ou
    substituída). O prune as apaga antes de contar a retenção.
- Serviço `discardPreview` e canal `account-chain:discard-preview` (UUID).
- `useAgentConfig`:
  - Deriva a proposta que segura e a descarta quando ela sai da tela: outro provedor, outra conta, prévia nova ou desmontagem.
  - A prévia que chega depois de a pessoa já ter mudado também é descartada.
  - A que virou abertura ou item da fila fica (`refreshChainPreview({ keepCurrent })`).
- `TerminalMenu`: remover um item ou esvaziar a fila descarta as propostas dos itens da cadeia.
- Smoke da sessão C, C4: depois de trocar "Automática (cadeia)" pela conta fixa, nenhuma `launch` fica aberta.
- Não fiz debounce de checagem (a medição mostrou que não há repetição) nem reuso entre configuradores no main. Pela nota de
  11/11, a fila guarda uma proposta por item, e dois itens com a mesma proposta receberiam o mesmo ticket.

**Validação.**
- Antes da mudança falhavam 3 testes de node: repositório (registro, descarte e retenção), serviço (10 aberturas e fechamentos com
  no máximo 1 aberta e 1 checagem de login no TTL) e IPC (`discard-preview` e registro sem a prévia). O teste do
  `discardChainPreview` (vitest) é novo.
- Depois: `npm test` com 3242 testes, 3232 passam, 10 pulados e 0 falham. vitest com 3466 passando. `eslint .` e `npm run build`
  limpos. O mesmo script de medição dá 0 linhas de prévia no registro.

**Não validado.** O descarte pelo hook só tem o C4 do smoke (troca para a conta fixa), que roda no CI; esta máquina para no C4
por um problema antigo. Handoff fechado, troca de provedor e itens removidos da fila não têm teste de interface. Um reload da
janela não descarta a prévia segurada: ela vence em 30 min e sai do registro e da retenção.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-12, 16:52): CI e Release.** O CI de `68f2dda` (run 43291537437, 16:34–16:41) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. Na sessão C saiu "C4 a prévia da cadeia some ao escolher a conta fixa; …: ok".
O Release gate (run 43292706405) e o Release (run 43292746227, 16:41–16:49) publicaram a `v0.1.536` nos três sistemas.

## 2026-11-12 — Limites: o painel mede a conta com perfil no mesmo ambiente do terminal dela

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-810a-8e0f-f8fceb130110` (Pesquisa/Decisão,
aberta na revisão do PR #97).

**O que foi medido (antes).**
- Havia dois caminhos de ambiente para uma conta com perfil:
  - `createProfileCommandEnv`, igual ao spawn do terminal: monta o ambiente do app e depois aplica o perfil. Era usado na
    checagem de login.
  - `createCommandEnv` e a mesma montagem repetida no `claude-usage-query`, no `codex-app-server-client` e no
    `codex-status-screen`: filtravam as credenciais do `process.env` e só depois montavam o PATH. Eram usados nos comandos de
    uso e nas consultas ao vivo.
- Script comparando os dois por provedor: Codex e Claude dão ambientes idênticos.
- No perfil que troca o HOME (Gemini), o segundo caminho calcula as pastas de CLI pela home do perfil. O teste novo mediu que
  ele perde a `~/.volta/bin` da home real.

**Decisões do Felipe (Trilha B, 12/11/2026).**
- **Ambiente:** A, o mesmo do terminal ("o que é conferido é o que será lançado"), em vez de B, manter só o filtro de
  credenciais.
- **Alcance:** todos os processos de conta, e não só o serviço do painel.
- **Proteção:** teste painel × terminal por provedor, sem teste de contrato.

**O que mudou.**
- `createAccountCliEnv({ providerId, profileEnv })` em `cli-process-manager.cjs` é o caminho único: `createCliEnv()` e depois
  `buildAccountProcessEnv`. Sem perfil é o Login do sistema, com o ambiente intacto.
- Usam a função nova:
  - o spawn do PTY;
  - o painel (login e uso);
  - a checagem da cadeia (`account-eligibility`);
  - o uso ao vivo do Claude;
  - o `/status` e o app-server do Codex;
  - o bloco do Claude por chave (`main.cjs`).
- Saíram `createCommandEnv` e `createProfileCommandEnv`.
- A sessão na nuvem mantém a regra própria (filtra até no Login do sistema) e já montava na ordem do terminal.
- Regra de "é conta": perfil não vazio. O PTY usava o `accountId`; os dois só diferem numa conta sem perfil, o que hoje só
  acontece no Openia sem chave, que não tem credencial herdada para tirar.

**Validação.**
- `account-process-env.test.cjs` (novo; falhava antes) captura o ambiente no ponto de chamada real, com o spawn trocado por um
  dublê:
  - terminal × painel (login e uso), uso ao vivo do Claude, `/status` e app-server do Codex, com a loja de contas real;
  - Login do sistema com as chaves;
  - o HOME trocado com o PATH da home real.
- `npm test`: 3244 testes, 3234 passam, 10 pulados, 0 falham. vitest com 3466 passando. `eslint .` e `npm run build` limpos.

**Não validado.** Nenhuma medição real do painel com contas Gemini: o painel não roda comando de uso nem de login para o Gemini
hoje, então a diferença de PATH só valia para quem viesse a usar esse caminho.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-12, 17:57): CI e Release.** O CI de `6b9099d` (run 43302430078, 17:39–17:45) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas; o "Ciclo de instalação das CLIs (Windows)" (run 43302430101) também, porque
o `cli-process-manager.cjs` mudou. O Release gate (run 43303453650) e o Release (run 43303488393, 17:45–17:55) publicaram a
`v0.1.537` nos três sistemas.

## 2026-11-13 — Testes: a suíte node não depende do ambiente de um terminal do Felixo

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-810a-b0d0-ce2b87dd9403` (aberta na revisão do
PR #97).

**O que a task pedia e o estado em 13/11.**
- `classicScreen` falhando com `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` herdada: **já resolvido** em `8617f80` (29/09). O teste
  apaga a variável e a restaura; passa com ela definida.
- `openia-image-service.test.cjs` travando sob carga: **já resolvido** em `28a64c6` (15/10). A causa eram esperas fixas de
  30 ms; no Node 25 o runner esperava para sempre uma promessa pendurada.
- Medido agora, com stdin aberto (um pipe que não fecha) e `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`:
  - 12 cópias paralelas do teste do Openia: 12 de 12, 35/35 cada;
  - `npm test` com um laço de 4 cópias do Openia rodando junto: 3234 passam e 0 falham, com 68 cópias de carga verdes.

**O que a medição achou além da task.** O caso real de "uma sessão do Claude Code" aqui é um agente rodando a suíte num terminal
de conta do Felixo. Com o ambiente desse terminal, **8 testes falhavam**:
- `CLAUDE_CONFIG_DIR` derrubava 5 (`agent-session-discovery` e `agent-usage-availability`).
- `CODEX_HOME` derrubava 3 (`agent-session-discovery` e o "sem conta segue o login do sistema" do `pty-process-manager`).
- As chaves de API e a variável da rolagem clássica não derrubavam nenhum.

**O que mudou.**
- `discoverAgentSession`: o `env` padrão passa de `process.env` para `{}`. Em produção o PTY sempre passa o `env` do spawn
  (`selectDiscoveryContext`); o padrão só servia aos testes e deixava o ambiente do processo escolher a pasta procurada.
- Teste do PTY: sem conta, o terminal recebe o `CODEX_HOME` da pessoa (`process.env.CODEX_HOME`), em vez de exigir `undefined`.
- `agent-usage-test-fixtures`: `pasta()` só aceita as pastas falsas `/perfis/<id>`; uma herdada não se passa por conta do teste.
  O teste do ENOENT identifica a conta pela pasta, não pela presença de `CLAUDE_CONFIG_DIR`.
- Guia do desenvolvedor (Testes): a regra para teste novo que dependa dessas variáveis.

**Validação.**
- Os 8 testes falhavam com `CLAUDE_CONFIG_DIR`/`CODEX_HOME` definidos e agora passam: 123/123 nos 4 arquivos, com cada variável.
- `npm test` passou nos três ambientes, com stdin aberto, 3234 passam e 0 falham em cada um:
  - ambiente de terminal de conta, com 52 cópias de carga do Openia em paralelo;
  - HOME trocado do Gemini;
  - ambiente normal.
- vitest no ambiente de conta: 3466 passam. `eslint .` limpo.

**Não validado.** A suíte não roda no CI com o ambiente de um terminal do Felixo, então uma regressão só aparece quando alguém
roda dentro do app. Abri task para decidir isso.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-13, 02:28): CI e Release.** O CI de `84d1701` (run 43370158317, 02:09–02:16) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. O Release gate (run 43371001628) e o Release (run 43371030034, 02:17–02:25)
publicaram a `v0.1.538`; houve release porque o `agent-session-discovery.cjs` é código do app.

## 2026-11-13 — Performance: bancada da vigia e app com 10 blocos, Modo Performance ligado e desligado (tetos mantidos)

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-8169-940e-f7cc40b75228` (aberta na revisão do
PR #97).

**Máquina.** Desktop do dono: Ryzen 7 5700G, 16 threads, 14 GiB, Windows 11, Node 25.3.0. Durante a medição, o uso de fundo foi
de 17% da CPU total, com o navegador (7%) e o Felixo instalado (5%) abertos. **Não** é o notebook de referência (2c/4t, HD 520)
do §15.1 do plano.

**Bancada** (`npm run benchmark:pty-output -- --sessions=20 --chunks=2000 --iterations=5 --json`, 3 rodadas, `--check` verde):

| Métrica | Rodadas | Teto |
| --- | --- | --- |
| Vigia, custo extra por pedaço p50 (spinner) | 6,9 · 9,0 · 9,0% (0,028 · 0,033 · 0,024 µs) | ≤ 10% ou ≤ 0,5 µs |
| Vigia, varredura p95 (spinner / pior caso) | 0,03 / 0,154 · 0,139 · 0,142 ms | pior caso ≤ 1 ms |
| Vigia, CPU com 20 sessões | 0,77 · 0,70 · 0,71% de um núcleo | ≤ 5% |
| Arquivo, custo extra p50 | 18,3 · 20,1 · 20,2% (0,033 · 0,073 · 0,065 µs) | ≤ 10% ou ≤ 0,5 µs |
| Arquivo, lote p95 | 0,47 · 0,40 · 0,43 ms | ≤ 2 ms |
| IPC, mensagens depois/antes · eco p95 | 0,085 · 0,015 a 0,07 ms | ≤ 0,25 · ≤ 2 ms |
| Ganho do buffer sobre o concat+slice | 243 a 250× | ≥ 10× |

**Nightly de 12/11** (run 43241570381, `--chunks=500 --iterations=3`):
- Vigia, custo extra p50: Ubuntu 11,6%, Windows 13,5%, macOS 8,5%, Ubuntu ARM 8,9%. Os dois acima de 10% aprovam só pelo piso
  de 0,5 µs.
- Varredura do pior caso p95: de 0,089 a 0,2 ms. CPU da vigia: de 0,45 a 1%.
- Em setembro, no notebook 2c/4t carregado (carga média de 14 a 19): 0,714 ms e 3,57%.

**App com 10 blocos transmitindo.**
- Montagem: `felixo devtools` de fonte, em perfil isolado, com a janela renderizando (opacidade 0, sem foco). Dez blocos `codex`
  com um Codex falso no começo do PATH via `FELIXO_CLI_PATHS`. Ele imprime um spinner de ~105 caracteres a cada 10 ms, ~640
  pedaços/s no total, pelo node-pty real e com a vigia anexada.
- CPU por processo em `app.getAppMetrics()`, 60 s por rodada, % de um núcleo (principal / renderer / GPU):
  - Normal: 20,1 / 37,7 / 95,6.
  - Performance: 17,3 / 19,2 / 12,0.
  - Normal de novo: 18,6 / 23,7 / 98,2.
  - Controle pareado, os mesmos fluxos como `node` (sem vigia) e depois como `codex` (com vigia): principal 20,0 e 19,0.
- O modo não muda o processo principal, e a vigia não se distingue do ruído. O ganho do modo está na GPU e no renderer. Tabela em
  `POLITICA-PERFORMANCE.md`.
- Uma rodada intermediária foi descartada: limpar o canvas pela ponte não mata os PTYs, e ela mediu as sessões antigas. As
  sessões foram encerradas por `pty.kill` e o controle refeito.

**Decisões do Felipe (Trilha B, 13/11/2026).**
- **Os tetos ficam como estão.** O desktop não é a referência, e no notebook a varredura carregada já usou 71% do teto.
- **O teto em % por pedaço fica junto do piso de 0,5 µs.** Em sub-microssegundo o percentual é ruído, e o piso cobre isso.
- **Abrir task para medir no notebook 2c/4t** com a máquina livre, com o mesmo roteiro.

**Não validado.** O notebook de referência; o macOS e o Linux no app (só o Windows do desktop).

Estado: concluído. Sem mudança de código; os tetos do `validateReport` não mudaram.

## 2026-11-13 — Contas: a conta Openia sem crédito na medição atual fica fora da cadeia

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-8150-8074-f439cf12b0a5` (aberta na revisão do
PR #97).

**O que foi medido.**
- A elegibilidade só via a medição por `findExhaustedWindow` e `readPercentWindows`, que olham métricas em %.
- O Openia mede o saldo do OpenRouter em US$ (`parseOpeniaCredits`, métrica `credits`, `unit: 'US$'`) e não imprime mensagem de
  falta de crédito. Por isso, uma conta Openia com US$ 0 medido agora passava como apta e podia receber uma troca.
- Os dois testes novos falhavam antes da mudança.

**O que mudou.**
- Política, `findExhaustedCredits`: métrica em US$ com `remaining ≤ 0` numa medição atual. É a mesma regra estrita das janelas:
  só amostra `current` com horário de até 15 min.
- Razão nova `sem-credito-pela-medicao` ("A medição atual mostra a conta sem créditos."), logo depois de `esgotada-pela-medicao`.
  Ela entrou no contrato da view, na união TS e no glossário do renderer ("sem créditos pela medição atual").
- Não nasce espera de cobrança: o bloqueio dura enquanto a medição atual mostrar o saldo zerado. A conta volta quando o painel mede
  crédito, ou quando a medição deixa de ser atual, como na regra das janelas.
- `POLITICA-CONTAS.md` (detecção e elegibilidade) e `PLANO-CADEIA-CONTAS.md` (§6.1).

**Validação.**
- `account-chain-policy.test.cjs`:
  - a razão na ordem da política;
  - US$ 0 e negativo ficam fora, e US$ 3,20 fica apto;
  - medição de 16 min atrás, sem horário ou com erro não prova nada;
  - uma janela em % zerada continua sendo a outra razão.
- `npm test`: 3245 testes, 3235 passam, 10 pulados, 0 falham. vitest com 3466 passando. `eslint .` e `npm run build` limpos.

**Não validado.** Nenhuma conta Openia real sem crédito foi medida no app.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-13, 08:14): CI e Release.** O CI de `d7d10df` (run 43412886504, 07:55–08:01) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. O Release gate (run 43413688055) e o Release (run 43413730650, 08:01–08:11)
publicaram a `v0.1.539` nos três sistemas.

## 2026-11-13 — Contas: o Gemini entra na cadeia conferido por uma chamada mínima ao modelo; Antigravity CLI avaliada

**Agentes / repositório.** Felixo-AI-Core, task `3e991f95-497e-811d-93e4-c6f283e26dde` (aberta na revisão do PR #97). Dois agentes
pegaram a mesma task. A implementação é do commit `da1c0d3`, de outra sessão. Esta entrada é do Resolver hotfix, que mediu a CLI,
corrigiu o CI, avaliou a Antigravity e fez os registros.

**O que foi medido (Gemini CLI 0.69.0-preview.0, a gerenciada pelo Felixo).**
- Não existe comando de status de login. `gemini --list-models` e `gemini models -o json` respondem a mesma lista fixa com o HOME
  vazio, sem login, então não provam nada.
- `gemini -p … -o json` sem login sai em ~2 s com o código 41 (`FatalAuthenticationError`, conferido no pacote). O JSON de erro
  ("Please set an Auth method…") vai para o **stderr** e o stdout fica vazio. Com login, ele chama o modelo e gasta uma requisição.
- Numa pasta não confiável, `--approval-mode plan` vira `default`; `--skip-trust` evita isso.
- O Gemini real desta máquina não tem login, então nenhuma requisição foi gasta e a saída logada não foi vista.

**Decisão do Felipe (Trilha B, 13/11/2026).** Checar o login do Gemini com um `gemini -p` mínimo. As alternativas eram manter o
Gemini fora ou ler só o método configurado. Ele pediu também a avaliação da Antigravity CLI na mesma task.

**O que mudou.**
- `da1c0d3` (outro agente):
  - `chainLoginCheck` no Gemini (`gemini -p 'Responda só: ok' -m gemini-3.1-flash-lite -o json --skip-trust`, `NO_BROWSER`, prazo
    de 150 s), lido por `getChainLoginSource`;
  - o `auth` do Gemini continua nulo, então o painel, que atualiza sozinho, nunca gasta cota;
  - leitor `parseGeminiModelCallAuth`: resposta do modelo é login, código 41 é falta de login, e conta individual recusada vira erro
    com motivo fixo;
  - elegibilidade, política, view, tela e docs.
- `e576be3` (este agente): o CI de `da1c0d3` reprovou no Ubuntu e no Windows no `canvas-inventory.test`. A lacuna "Contas do Gemini
  ficam travadas…" saiu à mão do `INVENTARIO-CANVAS.md`, mas continuava em `inventory/data/tools-agents.ts`, de onde o Markdown é
  gerado. Ela saiu da fonte e o documento foi regenerado.

**Antigravity CLI (`agy`), avaliada pela documentação oficial** (`antigravity.google/docs/install?tab=cli` e
`/docs/cli/reference/`):
- Desde 18/06/2026 a Gemini CLI não atende contas individuais (Gemini Code Assist for individuals, Google AI Pro e Ultra), e o
  Google aponta a Antigravity CLI como substituta (`developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals`).
- O login fica no **chaveiro do sistema operacional**, sem escolha de perfil. O `settings.json` fica em
  `~/.gemini/antigravity-cli/`, sem variável nem flag para outro diretório. O isolamento do Felixo, pelo ambiente do terminal de
  cada conta, não separa duas contas Google; só contas por chave (`GEMINI_API_KEY` com `"modelProvider": "gemini"`) seriam isoláveis.
- Não há comando de status, whoami ou auth. A checagem seria um `agy -p` (gasta cota), com códigos de saída não documentados.
- Binário fechado, instalado por script (`curl | bash` e `irm | iex`). O instalador gerenciado das CLIs precisaria suportar isso.
- **Conclusão:** não cabe na cadeia hoje para contas Google. Ficou uma task de decisão: suportar só contas por chave, ou esperar a
  CLI ganhar perfis e status.

**Validação.**
- `npm test`: 3248 testes, 3238 passam, 10 pulados, 0 falham. vitest com 3469 passando. `eslint .` e `npm run build` limpos.
- CI 43441667890 verde nos 4 sistemas e no smoke.

**Não validado.** A saída do `gemini -p` com login de verdade (nenhuma conta Gemini logada nesta máquina) e a checagem no app com
uma conta Gemini corporativa ou por chave.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-13, 11:38): CI e Release.** O CI de `da1c0d3` (run 43429248704) reprovou no inventário e teve o Release gate
pulado. O CI de `e576be3` (run 43441667890, 11:19–11:26) passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do
canvas. O Release gate (run 43442694797) e o Release (run 43442725486, 11:26–11:35) publicaram a `v0.1.540`, a primeira com o
Gemini na cadeia.

## 2026-11-13 — CLIs: a Antigravity CLI (`agy`) entra no terminal do canvas e no painel de limites, fora da cadeia

**Pedido.** Mesma task da entrada anterior ("Contas — checagem de login por conta do Gemini para entrar na cadeia"), na sessão que fez o `da1c0d3`. Diante da conclusão de que a Antigravity não cabe na cadeia, o Felipe pediu (13/11/2026) para **instalar a CLI agora e implementar**. A entrada anterior avaliou só pela documentação; esta mede a CLI real.

**Medido (Windows 11, `agy` 1.5.8).**
- **Instalação.** O script oficial (`irm https://antigravity.google/cli/install.ps1 | iex`) foi lido antes de rodar. Ele baixa um manifesto, confere o SHA-512, grava `%LOCALAPPDATA%\agy\bin\agy.exe` (244 MB) e põe a pasta só no PATH do usuário; um app já aberto não a enxerga.
- **Sem login.** `agy models` sai com código 1 em 3 s ("Please sign in to view available models"), mesmo com HOME, USERPROFILE, APPDATA e LOCALAPPDATA isolados. Os dados vão para `HOME/.gemini/antigravity-cli` e `HOME/.gemini/config`.
- **Login.** Foi feito pela pessoa, na `agy` interativa. Antes dele o Gerenciador de Credenciais não tinha nenhuma entrada do Google ou da Antigravity; depois apareceu `LegacyGeneric:target=gemini:antigravity`.
- **HOME não isola.** `agy models` lista os mesmos 6 modelos com a HOME real (4,8 s) e com a isolada (3,6 s). Isso confirma por medição o que a entrada anterior tirou da documentação: a cadeia não tem como separar contas Google da Antigravity.
- **Opções.** A ajuda não tem subcomando de auth, status nem uso. Tem `--model`, `--effort low|medium|high|xhigh|max` e `--dangerously-skip-permissions`. O binário traz `fileTokenStorage`, mas não há opção conhecida para usá-lo no lugar do cofre.

**O que mudou.**
- **Catálogo e detecção.** Entrada `antigravity` (`agy`) no catálogo de CLIs oficiais e no `cli-detector`. `%LOCALAPPDATA%\agy\bin` entrou nas pastas de CLI do Windows; no Unix o script grava em `~/.local/bin`, que o app já procura.
- **Instalação.** Pelo script oficial: rota "script", a mesma linha da matriz de `install-routes-process-tree.test.cjs`. Exige confirmação (`requiresConfirmation`) e fica fora da instalação automática (`autoInstall: false`). O catálogo ganhou `install.windowsArgs` (PowerShell no Windows, bash no resto). A atualização é `agy update`, e a CLI também se atualiza sozinha.
- **Painel de limites.** Fonte `antigravity` com `auth: agy models` (confere o login sem gastar cota) e uso `unsupported`, com o motivo.
- **Prazo por fonte.** `checkAccountAuth` usa `source.auth.timeoutMs` quando ninguém passa outro prazo: 60 s na Antigravity, 150 s na chamada ao modelo do Gemini da cadeia. Na primeira rodada no app, a Antigravity deu erro por `timeout` com os 30 s padrão.
- **Canvas.** Agente `antigravity` com modelos do `agy models`, esforço e yolo. A identidade "Antigravity" vem do comando, com o ícone de terminal (não há SVG próprio).
- **Fora da cadeia.** A Antigravity não entrou em `CHAIN_PROVIDER_IDS` nem nos perfis de conta: com o login no cofre não existe conta com pasta própria. Guias de usuário e de contas e limites, e política de contas, atualizados.

**Decisões do agente.** Ficam para a task de pesquisa da Antigravity, que já existe:
- retomada de conversa (`--continue`/`--conversation`) e descoberta de sessões;
- ícone próprio;
- modelos no chat e no orquestrador;
- contas por chave (`GEMINI_API_KEY`).

**Validação.**
- Testes novos: catálogo e rota "script" (confirmação, PowerShell e bash, clone de `windowsArgs`); instalação; parser do `agy models` com as saídas medidas; prazo por fonte (60 s na `agy`, 30 s no Codex); argumentos e identidade do `agy`. Ajustados os que contavam 4 CLIs.
- Suíte Node (`scripts/run-node-unit-tests.cjs`): 3.252 testes, 3.234 passam, 12 pulados e 6 falham.
  - Três eram desta mudança e foram corrigidas, passando depois (83/83 nos arquivos delas): duas em `cli-auto-install-real-repro`, que listavam as 4 CLIs do catálogo, e a do `node-pty-windows-kill`, que reprovou porque o `lib` do `node-pty` tinha sido recompilado (ver o ponto de atenção abaixo).
  - As outras não tocam esta mudança: as duas de árvore de processos e a rota pip do instalador, já registradas como de ambiente no Windows; o dreno do PTY nativo, sob carga; e `terminal-log-store` "agrega 20.000 eventos", 929 ms contra o teto (arquivo não tocado).
- vitest completo: 3.469 passam e 2 falham, ambas explicadas. O inventário já estava corrigido pelo `e576be3`. O `canvas-context-e2e` falhou sob carga e passa isolado. `tsc -b` limpo e `eslint` 0 nos arquivos tocados.
- App real (`felixo devtools`, perfil isolado, da fonte):
  - a Antigravity aparece detectada (1.5.8, instalação com confirmação);
  - depois do prazo próprio, a conta do painel fica `unavailable` com o motivo e o login `logged_in` (13,3 s sozinha);
  - a rodada inteira levou 75,7 s, sem `timeout` na Antigravity. Na mesma rodada, o Claude teve `timeout` na leitura ao vivo do `/status`, um caminho que não mudou.
- O verificador real, fora do app, com um shell que não tinha a pasta no PATH, achou a `agy` pelo PATH do app (`logged_in`, 13 s).

**Não validado.**
- O bloco da `agy` aberto e usado no canvas: só os argumentos e a identidade foram testados.
- O botão "Instalar" da Antigravity no app (o script foi rodado à mão).
- Linux e macOS.

**Ponto de atenção do ambiente.** Rodar `npm test` num worktree cujo `node_modules` é um link para o do checkout principal faz o `pretest` (`npm rebuild node-pty`) regravar o `lib` do `node-pty` desse checkout. Aqui o `tsc` do TypeScript 6 regravou os 36 arquivos com outro JavaScript e ainda acusou TS5108 (`target=ES5`); o teste `node-pty-windows-kill` reprovou por isso. O `lib` foi reposto a partir do pacote publicado (`npm pack node-pty@1.1.0`, `diff -r` igual); sobra só um `lib/tsconfig.tsbuildinfo` inerte. Os binários nativos (`prebuilds`) não mudaram, e um PTY real abriu depois. Num worktree assim, rode a suíte direto por `scripts/run-node-unit-tests.cjs`.

Estado: concluído e publicado (ver o commit abaixo).

## 2026-11-13 — Contas: acessibilidade da interface da cadeia (os não bloqueantes da revisão do PR #97)

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-815c-845c-da8829970c0c`.

**O que foi medido (código de 13/11; os seis itens de 28/09 seguiam abertos).**
1. "Configurar cadeia" com o painel "Limites e uso" já aberto: o pedido de aba (`requestAgentUsageTab`) só era lido ao montar, e
   o diálogo fechava sem devolver o foco, que caía no `body`.
2. "Fixar nesta conta" / "Voltar para a cadeia" no painel de detalhes:
   - eram dois botões diferentes, e o focado desmontava na troca;
   - `disabled` durante o pedido já tirava o foco no Chromium.
3. Card de troca de provedor do orquestrador: a região inteira era `aria-live`, e o "em N min" do prazo, que se atualiza a cada
   30 s, reanunciava o card.
4. Faixas da cadeia: cada uma nascia já preenchida dentro do próprio `role="status"`, e o leitor de tela não anuncia uma região viva
   que entra no DOM com o texto pronto.
5. §8.2: o custo do diálogo no Openia não dizia o preço do modelo.
6. Registro de trocas: todos os "Ir para o bloco" tinham o mesmo nome acessível.

**O que mudou** (um commit por item, de `3925c0c` a `69c835c`, mais `bc040fe` do smoke e `bde4fd5` do inventário):
1. O painel montado assina os pedidos de aba (`subscribeAgentUsageTabRequests`) e põe o foco na aba pedida, também ao montar.
2. Um botão só, que troca de texto, com `aria-disabled`. Se ele some (cadeia desligada), o foco vai para o texto do modo.
3. O parágrafo do prazo fica `aria-live="off"` e a região anuncia só os cards novos (`aria-relevant="additions"`).
4. `TerminalChainAnnouncer`: uma região viva invisível, montada com o bloco, em que cada faixa entra como um parágrafo novo. A faixa
   visível passa a ser `data-terminal-chain-banner`.
5. De Openia para Openia, o hook lê o `--model` do bloco antigo e busca o preço no catálogo (`openia.listModels`). O custo diz
   "(modelo X: $N/M tokens de saída)" ou "gratuito". De outro provedor o Openia abre sem modelo, e nada é inventado.
6. `row.focusLabel`: "Ir para o bloco: origem para destino, hora", único por linha, começando pelo texto visível.

**Validação.**
- vitest: os testes novos dos itens 1, 3, 4, 5 e 6 falhavam antes da mudança (o do item 3 conferido também com `git stash`).
- Item 2: o passo C6c do smoke da sessão C aciona os dois textos com Enter e exige o foco no botão.
- C4, C6b, C7 e C10 passaram a procurar a faixa por `data-terminal-chain-banner`. A região viva invisível também é `role="status"`
  e tem o mesmo texto, então passaria pelo seletor antigo.
- `npm test`: 3252 testes, 3242 passam, 10 pulados, 0 falham. vitest com 3478 passando. `eslint .` e `npm run build` limpos.
  Inventário regenerado.

**Não validado.**
- O item 1 não foi conferido pelo teclado no app: "Configurar cadeia" só aparece no diálogo sem conta apta, que o smoke não monta.
- Nenhum leitor de tela real (NVDA, VoiceOver) foi usado.
- As faixas de retomada e de chave recusada do mesmo bloco seguem com o padrão antigo (`role="status"` já preenchido); ficaram fora
  do escopo da cadeia.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-13, 12:46): CI e Release.** O CI de `fa290c8` (run 43452779202, 12:27–12:35) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. Na sessão C saiu "C6c "Fixar nesta conta" e "Voltar para a cadeia" pelo teclado: o
foco fica no botão nas duas trocas: ok", e C4, C6b, C7 e C10 passaram com `data-terminal-chain-banner`. O Release gate (run
43454078840) e o Release (run 43454118543, 12:35–12:43) publicaram a `v0.1.542`.

## 2026-11-13 — Contas: a vigia classifica o que chegou desde a última varredura

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-819f-9830-fcf2afe2d03d`.

**O que foi medido.**
- A vigia (`account-output-watcher.cjs`) classificava a janela inteira, ou seja, as últimas 40 linhas que passam no pré-filtro.
  `classifyFailure` devolve só uma falha, escolhida por precedência (`auth` > `billing` > `limit` > ...).
- Uma linha antiga de login, já emitida, continuava na janela. Por isso um aviso de limite que chegava depois perdia para ela.
  A varredura devolvia de novo a mesma evidência de `auth`, e o dedupe descartava essa repetição. O limite novo não saía.
- Teste com um aviso de refresh token do Codex, seguido do banner de limite do Codex: a segunda varredura devolvia `[]`.

**O que mudou.**
- A vigia guarda quanto da saída já tinha visto na última varredura (`scannedChars`, lido de `readOutputChars`).
- Quando a falha de topo da janela já foi emitida, ela classifica de novo só o trecho que chegou depois (`unmaskedFailure`).
  O corte recua até o começo da linha, para não partir uma frase que chegou em dois pedaços.
- Se esse trecho tem uma falha que ainda não foi vista, é ela que sai. Se não tem, o resultado da janela vale como antes.
- O `push` continua O(1). A segunda classificação só roda quando a falha de topo é repetida, e só sobre o trecho novo.

**Validação.**
- Dois testes novos em `account-output-watcher.test.cjs` falhavam sem a mudança (conferido com `git stash`):
  - login antigo seguido de um limite novo;
  - uma frase partida entre duas varreduras.
  Os 21 testes do arquivo passam.
- Bancada `npm run benchmark:pty-output -- --sessions=20 --chunks=2000 --iterations=5 --check`: exit 0, varredura do pior caso
  p95 0,139 ms (teto 1 ms), CPU 0,695% (teto 5%).
- Medida à parte, só do caso mascarado: p95 de 0,024 ms, contra 0,018 ms da varredura comum.
- Gate:
  - `npm test`: 3254 testes, 3244 passam, 10 pulados, 0 falham;
  - vitest: 3478 passam;
  - `eslint .` limpo.

**Não validado.**
- CLI real (Codex, Claude) batendo no limite depois de um aviso de login: só a saída gravada nos testes.
- Redesenho de tela inteira (Claude em tela alternativa): a linha antiga volta no trecho novo, e a precedência vale até ela sair da
  tela. O limite está documentado em `unmaskedFailure`.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-13, 13:15): CI e Release.** O CI de `add87c7` (run 43458105431, 12:59–13:06) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. O Release gate (run 43459269767) e o Release (run 43459307259, 13:06–13:13)
publicaram a `v0.1.543`.

## 2026-11-13 — Deps: `allowScripts` alinhado ao lockfile

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-8108-bf74-f5ec9466cb07`.

**O que foi medido.**
- A task (28/09) citava o Electron 41.10.7. O lock de hoje instala o 42.11.16, e o pacote 42 não tem mais script de instalação:
  ele baixa o binário na primeira execução (`downloadElectron` em `index.js`). A entrada `electron@41.3.0` não cobria nenhum
  pacote. O `npm install-scripts prune --dry-run` a dá como "package not installed".
- O lock tem três pacotes com script de instalação: `electron-winstaller@5.4.0` e `node-pty@1.1.0`, ambos cobertos, e
  `fsevents@2.3.3` (`node-gyp rebuild`), que é opcional, só é instalado no macOS e não estava coberto.
- Quem avisava era o npm 11.21 do projeto (`devDependency`), e não o 10.9.9 do runner. No CI do macOS (run 43458105431), o
  `npm rebuild node-pty` do `pretest` avisava "1 package has install scripts not yet covered by allowScripts".
- Reproduzido no Windows com `npm ci --os=darwin --cpu=arm64 --strict-allow-scripts --dry-run`, que falhava com
  `ESTRICTALLOWSCRIPTS` e "fsevents@2.3.3".

**O que mudou.**
- `allowScripts`: saiu `electron@41.3.0` e entrou `fsevents@2.3.3`, aprovado como o script já rodava. `node-pty` e
  `electron-winstaller` seguem fixados na versão do lock.
- Teste novo, `scripts/allow-scripts-policy.test.cjs`. Ele usa a regra de casamento do próprio npm (`script-allowed.js` do arborist)
  e lê só o `package.json` e o lock, então vale em todas as plataformas. Exige duas coisas:
  - todo pacote do lock com script de instalação tem entrada;
  - toda entrada cobre algum pacote.

**Validação.**
- O teste novo falhava antes da mudança, com os dois casos (`node_modules/fsevents@2.3.3` e `electron@41.3.0`), e agora passa.
- Com o npm do projeto, numa cópia temporária:
  - `npm ci --os=darwin --cpu=arm64 --strict-allow-scripts --dry-run` sai com 0;
  - um `npm ci` real no Windows sai com 0 e sem nenhum aviso de allowScripts;
  - `npm install-scripts ls` diz "No packages with unreviewed install scripts".
- Gate:
  - `npm test`: 3256 testes, 3246 passam, 10 pulados, 0 falham;
  - vitest: 3478 passam;
  - `eslint .` limpo.

**Não validado.**
- O `npm ci` real no macOS fica para o CI; aqui foi só a simulação com `--os=darwin`.

**Ponto de atenção.** Não rode `npm install-scripts prune` no Windows nem no Linux. O comando olha só o que está instalado e tiraria
o `fsevents@2.3.3`. Se isso acontecer, o teste novo falha.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-13, 13:56): CI e Release.**

- O CI de `52b21d2` (run 43463503408) passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e na Dependency policy. No macOS,
  o `npm rebuild node-pty` do `pretest` terminou sem o aviso de allowScripts, e os dois testes novos passaram.
- O Canvas smoke reprovou na primeira rodada: o SA3 ("o foco ir para o campo da Busca") falhou 3 de 3 no mesmo runner. Na nova
  rodada do job (attempt 2), passou. Era o mesmo código de app do `add87c7`, então a falha não vem desta mudança. Ficou uma task
  aberta para a instabilidade.
- O Release gate (run 43465813229) e o Release (run 43465853513, 13:45–13:54) publicaram a `v0.1.544`.

## 2026-11-13 — Canvas: criar um agente abre o terminal na gaveta (feedback de usuário)

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Origem: feedback de um usuário no Discord, anexado à task `3e991f95-497e-8142-8839-e213ac8db0da`. Ele relatou: "faz ele abrir um chat e ficar aguardando input; aí você tem que abrir o console na lateral pra ele voltar ao normal".

**O que foi medido (app isolado, `felixo devtools`).**
- Clicar em "Agente" criava o bloco recolhido e centralizava o canvas nele, mas a gaveta não abria. O foco voltava ao botão: o
  `TerminalMenu` devolve o foco no quadro seguinte ao clique.
- O Claude abria na tela de confiança na pasta, ou esperando o primeiro pedido numa pasta já confiável. O cartão mostrava
  "aguardando aprovação" e "Enter to confirm", mas nada do que a pessoa digitava chegava à CLI. Só abrir a gaveta deixava responder.
- Fora do yolo, o app não responde sozinho à confiança na pasta, de propósito (`handleClaudeTrustPrompt`): a decisão é da pessoa.
  Só que a pessoa não via o terminal.
- Nenhum commit desde 20/10 mudou quando a gaveta abre. Não é regressão de código: a gaveta nunca abria ao criar.

**O que mudou.**
- `addTerminalNode` abre o terminal novo na gaveta (`openTerminal`) um quadro depois de criar o bloco. O quadro de atraso existe
  porque o menu devolve o foco ao botão nesse quadro.
- Vale para todo pedido explícito de um terminal: o botão Agente, "Abrir agente", o terminal de login do painel de Limites e o
  arquivo executado pelo painel de projetos.
- Criar vários de uma vez (`addTerminalNodes`, a fila) continua só com os cartões.
- Fechar a gaveta devolve o foco ao cartão novo.

**Validação.**
- No app isolado:
  - "Agente" abre a gaveta com o foco em `xterm-helper-textarea`;
  - "Fechar terminal" devolve o foco ao `data-terminal-expand-trigger` do bloco novo.
- Smoke: o SA3 passou a exigir que a gaveta abra e que o foco vá para o terminal depois de "Agente". Antes ele só fechava a gaveta
  se ela existisse. A sessão A passou aqui (`FELIXO_SMOKE_SESSOES=A`).
- Inventário do canvas atualizado e regenerado.
- Gate:
  - `npm test`: 3256 testes, 3246 passam, 10 pulados, 0 falham;
  - vitest: 3478 passam;
  - `eslint .` e `tsc -b` limpos.

**Não validado.**
- Com a CLI do próprio usuário: não se sabe a versão nem a pasta dele.
- macOS e Linux, a não ser pelo smoke do CI (Ubuntu).

Estado: concluído (deploy no adendo).

**Adendo (2026-11-13, 15:05): CI, Release e resposta ao usuário.**

- O CI de `86cbe8d` (run 43473820210) reprovou no Canvas smoke, na sessão C, passo C7. O clique em "Ver opções" foi tomado pela
  barra lateral: cada "Abrir agente" agora abre a gaveta e reenquadra o canvas, e o bloco ficou embaixo dela.
- `8e9ac1c` passou o C7 para o teclado, como o C6 e o `digitarNoBloco` já faziam. O CI 43476064067 passou em todas as sessões do
  smoke de primeira, inclusive o SA3 com a gaveta e o C7, e no Validate dos quatro sistemas.
- O Release gate (43477039925) e o Release (43477078309, 14:52–15:01) publicaram a `v0.1.545`.
- A resposta ao usuário foi enviada no Discord, a pedido do Felipe.

## 2026-11-13 — Contas: banner de limite gravado da TUI real nos três sistemas

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-8142-8839-e213ac8db0da`. Decisões do Felipe: simular pela CLI real; gravar Codex, Claude e Gemini; macOS e Linux por um workflow manual.

**O que foi medido.**
- **Simulação pela CLI real:** a CLI de verdade, apontada para um servidor local que responde 429 como o backend no limite, desenha o próprio banner, sem conta nenhuma:
  - Codex: provedor próprio, `usage_limit_reached`;
  - Claude: token no formato da assinatura e os cabeçalhos `anthropic-ratelimit-unified-*`. Com chave de API ele só repete a chamada ("Retrying… attempt N/10");
  - Gemini: chave falsa e `GOOGLE_GEMINI_BASE_URL`.
- **No terminal cru** (node-pty sem xterm), a TUI do Codex parava em "Working". Com o xterm do app respondendo ao terminal, ela desenha o banner.
- **Gravações em Windows, macOS e Linux** (Codex 0.169.0, Claude 2.1.323, Gemini 0.68.0; run 43483569728). Passadas pela vigia, pedaço a pedaço:
  - Codex: `■ You’ve hit your usage limit…`, quebrado no meio da URL com 100 colunas: detectado;
  - Claude: `Usage limit reached · continuing automatically at…`. No macOS a linha abre com `⏺`; no Linux e no Windows, com `●`. Detectado;
  - **Gemini: não detectado.** Desde a 0.68 a cota é um diálogo em caixa, `│ Usage limit reached for <modelo>. │` (trocar de modelo / parar), no lugar do `[API Error: …]` que o vocabulário (0.57) conhecia. O pré-filtro do Gemini (`exhausted`) nem deixava a linha chegar à taxonomia.
- **Outros achados**, que ficaram numa task:
  - no Claude 2.1.323 a linha `You've hit your 5-hour limit · resets…` e o rodapé `⚠ Usage limit reached · limit resets…` dão `unknown`;
  - o extrator acusa 6 frases do Claude e 2 do Codex como ausentes dos pacotes novos;
  - o banner do Claude ainda é detectado pela linha da continuação automática.

**O que mudou.**
- **`scripts/record-limit-banner.cjs`**, com teste:
  - o ambiente vai sem variáveis das CLIs, e as pastas de configuração são temporárias;
  - a gravação é anonimizada e conferida como as da Leitura;
  - usa o `spawn` e o ajuste do `spawn-helper` do app;
  - espera a sessão sair depois do `kill`.
- **Workflow manual** `.github/workflows/gravar-banner-limite.yml`, nos três sistemas.
- **Gemini:** padrão `Usage limit reached for` (limite, escopo modelo). O pré-filtro ganha `reached` sozinho. Vocabulário do Gemini em 0.69.0-preview.0, com 5 de 5 frases no pacote (conferido pelo extrator). O Claude e o Codex não mudaram.
- **As 9 gravações** em `electron/__fixtures__/limit-banners`. O teste da vigia exige a cobertura (3 CLIs × 3 sistemas) e a detecção de `limit` em todas, sem outra classe.
- **Docs:** `ARQUITETURA.md`, `PLANO-CADEIA-CONTAS.md` (lista de arquivos e risco 2) e `POLITICA-CONTAS.md` (limitações).

**Validação.**
- Sem o padrão novo (`git stash`), o teste falha: `gemini 0.68.0 em darwin: o banner não foi detectado ([])`. Com ele, as 9 dão `limit`.
- Gate:
  - `npm test`: 3262 testes, 3252 passam, 10 pulados, 0 falham;
  - vitest: 3478 passam;
  - `eslint .` limpo.
- Bancada `--check`: exit 0, varredura do pior caso p95 0,128 ms, CPU 0,64%.

**Não validado.**
- O limite real de uma conta: o backend foi simulado, e a resposta real pode diferir da imitada.
- Blocos mais estreitos que 100 colunas.
- O Gemini e o Claude logados com conta Google ou assinatura de verdade.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-13, 16:00): CI e Release.** O CI de `3ebf3f9` (run 43484989664, 15:40–15:48) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. O teste das 9 gravações rodou nos quatro sistemas. O Release gate (run 43486171296) e
o Release (run 43486209570, 15:48–15:57) publicaram a `v0.1.546`. Gravações: workflow "Gravar banner de limite", run 43483569728.
A primeira tentativa (run 43481594507) falhou no `posix_spawnp` do macOS e no Gemini estável recusando a pasta, e foi corrigida em `206fdf3`.

## 2026-11-13 — Contas: cancelar com um clique a continuação automática do Claude no terminal antigo

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-812d-b877-e7bb0162a60f`.

**O que foi medido.** Claude Code 2.1.323 real, em modo de assinatura, contra o backend local do gravador do banner
(`scripts/record-limit-banner.cjs`), sem conta. No limite, a tela mostra o rodapé
`Continuing automatically at 7:20pm · Esc to cancel`.
- **Um Esc:** `● Automatic continue cancelled · /rate-limit-options to re-arm`, e o rodapé some.
- **O segundo Esc** (2,5 s depois): nada muda, e não abre o "voltar a uma mensagem anterior".
- **Com texto digitado na caixa:** um Esc **não cancela** e não apaga o texto; o rodapé continua.
- **Linha do histórico:** `● Usage limit reached · continuing automatically at … · esc to cancel`, em minúsculas, fica na tela
  depois de cancelar ou de o Claude voltar a trabalhar. Contá-la como "armada" faria um Esc interromper o Claude trabalhando.

**O que mudou.**
- **Reconhecimento da tela** (`terminal-screen-state.ts`):
  - `isClaudeAutoContinueArmed` procura o rodapé, com "Continuing" e "Esc" maiúsculos;
  - `isClaudeAutoContinueCancelled` procura "Automatic continue cancelled".
- **Store:** `cancelClaudeAutoContinue(id)`.
  - Sem sessão ou sem o rodapé, não escreve nada (`no-session` / `not-armed`).
  - Com o rodapé, escreve um único Esc no PTY e confere a tela por até 3 s (`cancelled` / `not-cancelled`).
  - Mock e store diferido acompanham.
- **Diálogo "Trocar de conta?"**, seção Terminal antigo, só quando o Claude está programado para continuar sozinho:
  - botão **Cancelar a continuação automática**, com `aria-disabled` enquanto confere e depois de resolvido;
  - o resultado aparece numa região `role="status"`, montada antes.
  - O aviso agora sugere o botão, e "não receberá nada" passou a dizer "ao abrir o bloco novo".
- **Docs:** `POLITICA-CONTAS.md` e `PLANO-CADEIA-CONTAS.md` registram a exceção: a única escrita no terminal antigo é esse Esc, e só
  com o clique. Inventário do canvas atualizado e regenerado.

**Validação.**
- Testes novos:
  - reconhecimento com as telas medidas: armada, cancelada e trabalhando depois de continuar;
  - store: um Esc só e `cancelled`; `not-cancelled` sem segundo Esc; nada escrito com o Claude trabalhando, sem sessão ou com o
    processo encerrado;
  - modelo: as mensagens;
  - HTML do diálogo: o botão com e sem a continuação programada.
- As funções de reconhecimento passaram pelo viewport real do xterm da sonda: no limite, armada; depois do Esc, cancelada; com
  texto digitado, armada depois do Esc.
- Gate:
  - `npm test`: 3262 testes, 3252 passam, 10 pulados, 0 falham;
  - vitest: 3488 passam;
  - `eslint .` e `tsc -b` limpos.

**Não validado.**
- O clique no app com uma proposta real da cadeia: o smoke da sessão C só tem contas Codex, e a CLI falsa não tem o banner do
  Claude (nota na task de cobertura do smoke).
- Uma conta Claude com limite de verdade.
- Versões do Claude diferentes da 2.1.323: se o rodapé mudar, o botão diz que não há o que cancelar e não escreve nada.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-13, 16:46): CI e Release.** O CI de `abc6225` (run 43492776673, 16:30–16:36) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. O Release gate (run 43493877899) e o Release (run 43493913227, 16:37–16:44)
publicaram a `v0.1.547`.

## 2026-11-13 — Canvas: a "Passar responsabilidade" manual redige segredos

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-811e-a0a3-c9c0dd6d0c48`.

**O que foi medido.**
- **Passagem manual:** o `CanvasView.passResponsibility` montava o texto (`buildTerminalHandoffPrompt`) com o histórico cru. Só a continuação da cadeia passava pelo `account-chain:redact-transcript` (`redactSecrets` no main).
- **Ponta a ponta no app isolado**, com a CLI falsa do smoke (`FELIXO_DEVTOOLS_FAKE_CLI_PTY=1`), já com a redação ligada:
  - digitei `export OPENAI_API_KEY=sk-proj-… e GH ghp_…` e passei a responsabilidade;
  - o `handoff.txt` entregue ao bloco novo trouxe `OPENAI_API_KEY=[oculto]`, mas também `0123456789abcdefghijABCDEFGHIJ012345`, a cauda do token do GitHub.
- **Causa:** a linha quebrou na largura da gaveta. O `readBuffer` devolve cada linha do buffer, sem juntar as quebras automáticas (`isWrapped`), então o token chegava partido e nenhum padrão o reconhecia. O mesmo valia para a continuação da cadeia.

**O que mudou.**
- **`readTranscript`** (`terminal-buffer-reader.ts`):
  - o buffer inteiro com as linhas quebradas só pela largura juntadas de volta;
  - a linha que continua na seguinte guarda os espaços do fim, porque a quebra pode cair entre palavras.

  O `getTranscript` (passagem manual e continuação da cadeia) passa a usá-lo. O `readBuffer` segue para os outros usos.
- **`buildRedactedHandoffText`** (`account-continuation.ts`): redige com o mesmo `prepareRedactedTranscript` da cadeia e monta o texto. Se a redação falha, nada é enviado e o diálogo mostra o erro. O `passResponsibility` usa essa função.
- **Docs:** inventário do canvas (efeito, IPC e testes da "Passar responsabilidade"; a lacuna foi fechada) e `PLANO-CADEIA-CONTAS.md` (§9.1 e §16).

**Validação.**
- Testes novos:
  - com o `redactSecrets` real atrás da ponte: nenhuma das chaves no texto; sem segredo, o texto é idêntico ao de antes; sem a ponte ou com falha, nada é enviado;
  - com um xterm real de 20 colunas: o token partido na largura volta inteiro; as quebras de verdade e o espaço na borda ficam.
  - Os dois conjuntos falhavam antes.
- **Ponta a ponta de novo, com a mudança:** com duas chaves partidas na largura (OpenAI e duas do GitHub), nenhuma chegou ao `handoff.txt`. As linhas saíram inteiras: `OPENAI_API_KEY=[oculto]` e `https://[oculto]@github.com/…`.
- Gate:
  - `npm test`: 3262 testes, 3252 passam, 10 pulados, 0 falham;
  - vitest: 3493 passam;
  - `eslint .` e `tsc -b` limpos.

**Não validado.**
- Segredo partido por uma quebra **da própria CLI** (linha nova de verdade, sem `isWrapped`, como o Claude faz em respostas longas): continua passando em pedaços.
- Segredo que o `redactSecrets` não reconhece: a redação é a mesma da cadeia, por padrões.

**Mudança de formato.** O histórico das duas passagens agora traz as linhas longas inteiras, e não cortadas na largura do terminal. Sem segredo, a redação não muda nada.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-13, 17:23): CI e Release.** O CI de `bd1e066` (run 43498119647, 17:04–17:11) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. O Release gate (run 43499319136) e o Release (run 43499353136, 17:12–17:20)
publicaram a `v0.1.548`.

## 2026-11-14 — Contas: colisão de refresh de token no mesmo perfil, medida e corrigida no Codex

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `3e991f95-497e-8159-a58b-f623d1fba62b`.

**Como foi medido (sem conta nenhuma).** Usei as CLIs reais com credenciais falsas e vencidas, numa pasta de perfil temporária, e um servidor local no papel do endpoint de token, com **rotação**: cada refresh token vale uma vez, e o reuso recebe o erro de reuso. Cada pedido ao backend leva a geração do token que usou.
- **Codex 0.171.0-alpha.4:** `CODEX_REFRESH_TOKEN_URL_OVERRIDE`.
- **Claude Code 2.1.323:** proxy local (`HTTPS_PROXY`) que atende `platform.claude.com` e `api.anthropic.com` com uma CA de teste (`NODE_EXTRA_CA_CERTS`, só no processo da bancada) e recusa qualquer outro host.
- **Ressalva:** duas rodadas do Claude, antes do proxy, mandaram um refresh token **falso** (`sk-ant-ort01-teste-1`, sem dado da pessoa) ao endpoint real da Anthropic, que o recusou.

**O que foi medido.**

| Cenário | Codex | Claude Code |
| --- | --- | --- |
| A checagem renova o token? | **não**: `codex login status` não fez pedido nem tocou o `auth.json` | **sim**, com o token vencido; mas o refresh é serializado entre processos |
| Checagem + sessão juntas | 1 refresh; sem colisão | 1 refresh; sem colisão (nas duas ordens) |
| Duas sessões juntas | **2 refresh com o mesmo token; um recusado** | 1 refresh; sem colisão |
| Duas sessões, recusa antes de o vencedor gravar | **sessão sem login:** 4 refresh recusados, 13 pedidos com o token vencido, "refresh token was already used. Please log out and sign in again" | sem colisão |
| `codex app-server` (painel) ×2 | **colide igual** (renova ao abrir) | — |

- No Codex, quando a recusa chega **depois** de o vencedor gravar o `auth.json`, quem perdeu relê o arquivo e segue: os 50 pedidos saíram com o token novo.
- O `auth.json` nunca ficou estragado.
- No Felixo, a sessão sem login viraria falha `auth` na vigia e tiraria a conta da cadeia sem motivo.

**O que mudou.**
- **`codex-launch-gate.cjs`:** a vez de abrir o Codex em cada perfil (`CODEX_HOME`, ou `padrao` no login do sistema). O primeiro abre na hora, e o seguinte do mesmo perfil espera `CODEX_LAUNCH_SPACING_MS` (2,5 s) depois do anterior. Com o perfil livre, abre no mesmo tique.
- **Terminais:** o `pty:spawn` espera a vez nas aberturas novas do Codex, com o perfil vindo de `PtyProcessManager.codexProfileFor`. O reanexo não espera. O `pty:kill` na espera cancela a abertura (`PTY_SPAWN_CANCELLED`) e devolve o ticket da cadeia sem uso; o `dispose` cancela as que esperam. PTY injetado (testes, CLI roteirizada do smoke) fica fora.
- **Painel:** o `runCodexAppServerSession` (só com o processo de verdade) e a leitura do `/status` entram na mesma vez. O `app-server` e o `/status` da mesma conta deixam de abrir juntos.
- **Fora, de propósito:**
  - a checagem de login, que não renova;
  - o Claude, que já serializa;
  - o chat (`cli-process-manager`, síncrono, um processo por pedido da pessoa), que ficou sem a vez.
- **Docs:** `PLANO-CADEIA-CONTAS.md` (risco 10, §16) e `POLITICA-CONTAS.md` (limitações).

**Validação.**
- **Prova com a CLI real** (duas sessões do Codex, recusa primeiro):

| Abertura | Refresh | "already used" | Pedidos com o token vencido |
| --- | --- | --- | --- |
| juntas | 1 ok + 4 recusados | 5 | 13 |
| com 2,5 s de espaço | 1 ok | 0 | 0 |

- Testes novos:
  - a vez (ordem, perfis e chave);
  - o `pty:spawn`: o segundo espera; outro perfil, outra CLI e o reanexo não esperam; o `pty:kill` na espera cancela e devolve o ticket;
  - o `app-server` espera e não abre se cancelado na espera;
  - o `codexProfileFor`.
- Gate:
  - `npm test`: 3270 testes, 3260 passam, 10 pulados, 0 falham;
  - vitest: 3493 passam;
  - `eslint .` limpo.

**Não validado.**
- Contas reais e os servidores reais: a rotação e o tempo de resposta foram imitados. Se a renovação de verdade passar de 2,5 s, a colisão volta a ser possível.
- O Codex estável (0.169); aqui foi o 0.171.0-alpha.4.
- O Gemini: as contas da cadeia são por chave ou corporativas, com o refresh do Google, que não gira o token.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-14, 12:24): CI e Release.** O CI de `b12b069` (run 43608274813, 12:05–12:12) passou no Validate de Windows,
macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. O Release gate (run 43608913443) e o Release (run 43608933929, 12:12–12:21)
publicaram a `v0.1.549`.


## 2026-11-15 — CLIs: instalação incompleta do Claude ou do Codex deixa de passar por instalada ("não é compatível com a versão do Windows")

**Agente / repositório.** Resolver hotfix — Felixo-AI-Core. Task `41991f95-497e-81ef-aaa1-fdef9e3ba17e`.

**Relato.** Depois de algumas atualizações, abrir um agente voltou a dar, no Windows, "Esta versão de …\clis\node_modules\@anthropic-ai\claude-code\bin\claude.exe não é compatível com a versão do Windows sendo executada". Era a terceira ou quarta volta do mesmo tipo de erro de abertura.

**Causa raiz.** Toda conferência de "CLI instalada" confiava no `package.json` e na existência de arquivo. Nenhuma olhava o executável que o terminal abre:
- O `@anthropic-ai/claude-code` publica `bin/claude.exe` como **placeholder de texto** (500 bytes), e só o `postinstall` (`install.cjs`) copia o binário nativo da plataforma por cima. Quando o `postinstall` não roda, ou o pacote da plataforma não chega, o `install.cjs` sai com 0, e o npm também.
- O Claude não tinha conferência nenhuma (`verifyManagedCliInstallation` devolvia `ok` sem pacote de plataforma no manifesto). O Codex só conferia o `package.json` do pacote nativo, e só no Windows.
- O atualizador do npm **do sistema** só conferia se o atalho (`claude.cmd`) existia.
- Resultado: a instalação quebrada ficava "instalada" para sempre. A abertura seguinte não reparava, porque a versão era a do alvo e o estado dizia sucesso.

**Como foi medido** (npm 11.21.2, o do app, e o Claude Code 2.1.323 real do cache do app, sem rede para o pacote):
- `npm_config_ignore_scripts=true` (conselho comum de segurança no `.npmrc`): "added 2 packages", código 0, `bin/claude.exe` = o placeholder. A verificação antiga respondia **`instalada: true`**.
- `npm_config_omit=optional` na instalação global: o npm instalou o pacote nativo mesmo assim, então não é causa.
- npm morto no meio da extração do pacote nativo: sobra exatamente o estado achado no npm global desta máquina (o placeholder no `bin`, o nativo cortado em 100 de 373 MB, sem `package.json`). O npm 11 também tira os atalhos antigos do lugar (`.claude.cmd-tY1bWhwZ`). Sem os atalhos, o app já reinstalava; o caso que **prende** é o npm terminar com sucesso.
- Pacote da plataforma com erro 500 no registry (teste novo, npm real): o npm trata a optionalDependency como opcional, sai com 0 e deixa o placeholder.
- Reinstalar a **mesma versão** por cima ("changed 2 packages") extrai tudo de novo e roda o `postinstall`: o reparo que já existia (a nova tentativa de `installAndVerifyManagedCli`) basta, desde que a verificação dispare.
- Nesta máquina, sem relação com o app: o Claude do npm global (2.1.324) está com o placeholder e o nativo cortado em 201 de 373 MB. Mexeram nele às 16:58 e às 17:01 de 13/11, sem registro no log de QA do app; é provável o autoatualizador do próprio Claude. O pacote nativo do Codex gerenciado está cortado: 68 de 80 MB de outro executável, sem o `codex.exe`.

**Mesma suposição em outro lugar, achada e corrigida.** No Linux e no macOS, `npm -g --prefix` grava os pacotes em `<prefix>/lib/node_modules`, e o app lia `<prefix>/node_modules`. A versão gerenciada saía desconhecida e `isTargetNewer(null, alvo)` dava verdadeiro: a cópia gerenciada era **reinstalada a cada abertura** fora do Windows. Ninguém via, porque o ciclo de instalação real só rodava no Windows.

**O que mudou.**
- **`core/native-executable.cjs` (novo):** confere, só pelo cabeçalho, se um arquivo é um programa deste sistema. Lê o PE no Windows, o ELF no Linux e o Mach-O (inclusive o universal) no macOS. Confere a arquitetura, aceitando o x64 emulado no Windows e no macOS ARM, e se o arquivo tem todos os bytes que o cabeçalho promete (seções, assinatura Authenticode, segmentos). Distingue `ausente`, `stub`, `formato`, `arquitetura` e `truncado`. Lê só o cabeçalho (alguns KB), sem executar nada; os 9 arquivos reais conferidos, entre eles o `claude.exe` de 367 MB, levaram 0,15 s com a partida do Node.
- **`managed-cli-health.cjs`:** `verifyManagedCliInstallation` confere o executável real: o `bin/claude.exe` no Claude e o `vendor/<alvo>/bin/codex(.exe)` do pacote da plataforma no Codex, nos três sistemas. A mensagem cita o caminho relativo, sem o nome do usuário. A mesma conferência (`verifyCliPackage`) vale para o npm global do sistema.
- **Manifesto:** o Codex declara o pacote nativo também no Linux e no macOS.
- **Layout:** `getManagedCliLayout` traz `nodeModules` (`lib/node_modules` no POSIX), e a versão gerenciada é lida dali.
- **npm:** `--ignore-scripts=false` na instalação gerenciada e na atualização do npm do sistema. Sem o `postinstall` o Claude não funciona, então o `.npmrc` da pessoa não pode desligá-lo para esse pacote.
- **`system-cli-update.cjs`:** `executableReady` exige o atalho **e** o executável nativo inteiro; reprovado, o plano repara a instalação do sistema.
- **CI:** o teste novo `managed-cli-npm.integration.test.cjs` entra no `test:native`, que roda no Validate do Windows, do macOS, do Ubuntu e do Ubuntu ARM e trava o Release. O ciclo de instalação real (`ciclo-instalacao-clis.yml`) ganhou o Claude no `ubuntu-latest` e no `macos-latest`.

**Validação.**
- **Testes que falham antes da correção:**
  - Saúde: o Claude com o placeholder, o Claude cortado, o Codex com o pacote mas sem o `codex.exe` inteiro, o Codex no Linux e no macOS, e a versão em `lib/node_modules`.
  - Abertura: o Claude com o placeholder e a versão em dia agora é reinstalado.
  - npm do sistema: o Claude com o placeholder não conta como pronto.
  - Integração com o npm real: sem a correção, o `claude --version` devolve **a mesma mensagem do relato** ("não é compatível com a versão do Windows").
- **Integração (npm 11.21.2 real, registry local, o Node como binário nativo):**
  - com `ignore-scripts=true`, o `claude --version` responde;
  - com o pacote nativo em erro 500, o npm sai com 0 e deixa o placeholder; a verificação recusa e a reinstalação repara.
  - Leva 19 s.
- **Mutação:** com a checagem de truncamento desligada de propósito, 2 testes do verificador falham.
- **Nas instalações reais desta máquina:**
  - Claude gerenciado: `ok`.
  - Codex gerenciado: recusado (já era).
  - Gemini: `ok`.
  - Claude do npm global: `executableReady=false`. Antes era `true`, só pelo atalho.
- **Gate:**
  - `npm test`: 3288 testes, 3278 passam, 10 pulados, 0 falham;
  - `test:native`: 13 de 13;
  - `eslint .` limpo.

**Não validado.**
- O Linux e o macOS de verdade só pelo CI. Aqui não há distribuição Linux no WSL, e o macOS não está disponível.
- **Quem interrompeu as extrações** nesta máquina e na do relato: não dá para provar daqui. Pode ter sido o autoatualizador do Claude, o app fechado no meio de uma atualização ou queda de rede. A correção não depende do gatilho.
- **O terminal com a CLI quebrada antes do reparo:** se a reinstalação falhar (sem rede), o terminal continua mostrando o erro do sistema até a próxima abertura do app; a interface mostra a falha da instalação.
- O AppImage e o DMG não passam pelo ciclo real (só o NSIS do Windows).

Estado: concluído (deploy no adendo).

**Adendo (2026-11-15, 19:06): CI e Release.**
- O CI de `7e32cf3` (run 43765056679) falhou no Validate do Ubuntu e do macOS. O instalador falso do `cli-auto-install-real-repro.test.cjs` gravava o package.json em `<prefix>/node_modules`, a mesma suposição de Windows que a correção tirou do app. Corrigido em `896c146` com `layout.nodeModules`.
- O CI de `896c146` (run 43765960119) passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas. Os dois cenários do `managed-cli-npm.integration.test.cjs` passaram nos quatro.
- O Release gate (run 43766515343) e o Release (run 43766532637, até 19:05) publicaram a `v0.1.550`.
- O ciclo com o registry real (run 43765056611) passou nos 5 jobs. O Claude Code de verdade, no `ubuntu-latest` e no `macos-latest`, instalou e não reinstalou na segunda abertura nem no upgrade; com o binário apagado, reinstalou.

## 2026-11-15 — Custo: gerar imagem e ditar pela nuvem só cobram depois de um "sim", com o preço na tela

Task: Felixo AI Core/Custo — confirmar custo na geração de imagem e no ditado (Notion `3e991f95-497e-8172-b092-f3aa9f111ccc`), aberta em 28/09 na investigação da cadeia de contas (PR #97). Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 21:01 em diante.

**Antes.**
- **Gerar imagem:** o primeiro clique em "Gerar" já mandava o pedido ao Openia, que cobra dos créditos do OpenRouter. Havia só a frase "pode cobrar créditos", sem preço.
- **Ditado pela nuvem:** gravava e transcrevia sem nenhum aviso de custo.
- O inventário do canvas registrava as duas lacunas.

**Medido.**
- **Catálogo de imagem:** o `GET /api/v1/images/models` (público) não traz preço. O preço está em `GET /api/v1/images/models/<id>/endpoints`, por fornecedor, em `pricing[]` com `billable`, `unit` e `cost_usd`. Consultado em 15/11/2026:
  - `black-forest-labs/flux-3-image`: por imagem, de US$ 0,041 (768) a 0,607 (4k);
  - `openai/gpt-image-1-mini`: por token de imagem gerada, US$ 0,000008;
  - `google/gemini-3.1-flash-image`: por token, US$ 0,00006 a 0,000066 conforme o fornecedor.
- **Transcrição:** página de preços da OpenAI (developers.openai.com/api/docs/pricing), em 15/11/2026: `whisper-1` e `gpt-4o-transcribe` a US$ 0,006/min, `gpt-4o-mini-transcribe` a 0,003, `gpt-transcribe` a 0,0045. Uma gravação vai até 90 s, então custa no máximo US$ 0,009.

**Feito.**
- **Processo principal:** `openia:image-pricing` (`openia-image-service.cjs`) consulta o preço só de modelo do catálogo, com os mesmos limites do catálogo (sem chave, sem redirecionamento, 10 s, 2 MiB). `summarizeImagePricing` fica só com `output_image`:
  - por imagem quando houver, com a faixa entre variantes e fornecedores;
  - senão, por token;
  - `cost_usd` nulo ou vazio não vira zero.
  - O cache dura 10 min, e a falha não fica guardada.
- **Imagem, renderer:** a `store` busca o preço ao trocar de modelo, e o atrasado de outro modelo não sobrescreve. O `generate()` só chama o Openia com `{ confirmed: true }` ou com o modelo em `localStorage felixo:cost-consent`; sem isso, devolve `field: 'cost'`.
  - O popover mostra o preço (`describeImagePricing`). Gerar troca os botões por "Confirmar e gerar" e "Voltar", com o preço e "Não perguntar de novo para este modelo".
  - "Voltar a perguntar" desfaz a escolha.
- **Ditado:** fase nova `confirming` no `dictationReducer`. O `begin()` pergunta antes de abrir o microfone quando o motor é a nuvem e o endereço e o modelo não estão lembrados.
  - O balão diz o destino, o modelo, o preço por minuto (tabela acima, só para api.openai.com) e o teto da gravação.
  - Outro provedor recebe "confira o preço no painel do provedor", sem número inventado. O servidor local não pergunta.
  - A seção Custo das configurações mostra a escolha e tem "Voltar a perguntar".
- **Registro comum:** `usage-cost-consent.ts`, com a lista de destinos lembrados. Registro ilegível ou armazenamento bloqueado valem como "nada lembrado".

**Decisões do agente.**
- A trava fica na `store`, e não só no botão, para nenhum caminho gerar sem confirmação e para dar teste sem DOM.
- "Não perguntar de novo" vale por modelo, ou por endereço e modelo, porque o preço muda com eles.
- A confirmação do ditado vem antes de gravar, não depois: perguntar depois de a pessoa falar arriscaria perder a fala.
- O preço por token é mostrado por milhão, porque não dá para saber o total antes de gerar.

**Validação.**
- **Testes novos:** 4 da `store` de imagem, 1 de `describeImagePricing`, 2 do serviço, 2 do ditado e 3 do registro.
- **Mutações:**
  - desligar a trava do custo derrubou 3 testes da `store`;
  - trocar a guarda do preço ausente por `Number(raw)` derrubou o teste do resumo.
- **Gates:**
  - `npm test`: 3290 testes, 3280 passam, 10 pulados, 0 falham;
  - `vitest run`: 3504 passam e 4 pulados;
  - `eslint .` e `tsc -b` limpos.
- **App de fonte com perfil isolado** (`devtools`):
  - o FLUX 3 Image mostrou o preço real ("de US$ 0,04 a US$ 0,61 por imagem");
  - Gerar abriu a confirmação, e o `ipcProbe` registrou só `openia:image-models` e `openia:image-pricing`, sem `openia:generate-image`;
  - com uma chave falsa no perfil isolado, o microfone abriu o balão do ditado, sem `speech:microphone-status` nem `speech:transcribe`, e "Cancelar" voltou ao repouso;
  - nas configurações, "Voltar a perguntar" esvaziou `felixo:cost-consent`.

**Não validado.**
- Os botões "Confirmar e gerar" e "Gravar" não foram clicados no app. O primeiro usaria a chave real do OpenRouter no Openia; o segundo mandaria áudio à API.
- O caminho depois da confirmação é o mesmo de antes, e a confirmação está coberta na `store`.
- Não há teste de interface do botão nem do balão; a lacuna antiga do ditado continua.
- **Preço do ditado:** é uma tabela fixa e envelhece. Outro provedor não tem número.
- **Preço da imagem por token:** mostra a tarifa, não o total.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-15, 21:37): CI e Release.**
- **CI** de `23a6557` (run 43779848444): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas.
- **Release:** o gate (run 43780441966) e o Release (run 43780463324, concluído às 21:35) publicaram a `v0.1.551`.
- **Efeito colateral da validação:** ao subir, a sessão isolada do `devtools` rodou a atualização automática das CLIs do sistema e atualizou o Codex do npm global da máquina de 0.171.0-alpha.4 para 0.171.0-alpha.7. É o comportamento normal do app; o perfil isolado não isola as CLIs do sistema.

## 2026-11-15 — Chat e orquestrador: a conversa e os sub-agentes rodam na conta escolhida, inclusive pela cadeia

Task: Felixo AI Core/Orquestrador — usar as contas da cadeia em vez do login do sistema (Notion `3e991f95-497e-81d8-9b29-f440d7efac0c`), aberta em 28/09 no PR #97. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 22:10 em diante.

**Antes.** Os três caminhos do chat terminavam em `cliManager.spawn` com `createCliEnv()`, o Login do sistema:
- a mensagem (`cli:send`);
- o turno do orquestrador (`invokeOrchestrator`);
- o sub-agente (`spawnOrchestrationAgent`).

Nenhum recebia conta, e o processo persistente era reaproveitado comparando só modelo e pasta.

**Decisões do Felipe** (perguntas pelo `AskUserQuestion`):
1. **Escolha:** um seletor que pode ser trocado a qualquer momento no chat.
2. **Sub-agentes:** na cadeia, cada um pega a conta apta do próprio provedor. Com conta fixa, o mesmo provedor usa a conta e outro provedor usa o Login do sistema.
3. **Sem conta apta:** o pedido cai no Login do sistema com aviso. É diferente do bloco, que recusa a abertura.
4. **Limite no meio da tarefa:** o card propõe a próxima conta, com confirmação.

**Feito.**
- **`chat-account.cjs` (novo):** `createChatAccountResolver` resolve a conta de cada pedido (`system`, `pinned` ou `chain`) e o ambiente dela (`createAccountCliEnv`). Quando cai no sistema, devolve o aviso.
- **Serviço da cadeia:**
  - `pickAccount` usa a mesma escolha do bloco novo (`selectDestination`, com o provedor e as contas já tentadas), sem proposta nem ticket;
  - `recordAccountFailure` põe a conta em espera quando o chat vê limite, login ou crédito. O limite só do modelo, o caso ambíguo e a rede não entram.
- **`ipc-handlers.cjs`:**
  - `sendCliRequest` ficou assíncrono: resolve a conta e chama `startCliRequest`, que é o corpo antigo;
  - o Codex numa conta entra na vez de abertura do perfil (`openOnCodexTurn`); no Login do sistema, o chat segue fora da vez, como antes;
  - a falha numa conta vai para a espera da cadeia (`threadAccounts`), não para a disponibilidade global;
  - o sub-agente recebe `accountSelection` e, na troca aceita, `forcedAccountId`.
- **Processo persistente:** só é reaproveitado com a mesma conta (`canReusePersistentSession`) e abre com o ambiente dela.
- **Terminal do chat:** mostra "Conta: …" no início de cada pedido.
- **Executor:** guarda a conta de cada sub-agente (`agentJobAccounts`). No limite, em conta da cadeia, `planAccountSwitch` pede a próxima conta e abre a pergunta `kind: 'account'`.
  - O aceite respawna no mesmo modelo, na conta confirmada; a recusa e o prazo vencido falham com o erro original.
  - Sem outra conta, segue o fallback de provedor. O registro de trocas grava os rótulos das contas.
- **Interface:**
  - seletor "Conta do chat" no compositor (`useChatAccount`, `localStorage felixo:chat-account`), ativo também durante a resposta;
  - o aviso de queda no Login do sistema aparece acima do compositor;
  - o card diz "Trocar de conta?" com as duas contas.

**Validação.**
- **Testes novos:** 6 do resolvedor, 2 da cadeia, 3 do executor, 1 do processo persistente e 4 + 1 do renderer. Os 2 testes de `spawnOrchestrationAgent` viraram assíncronos e conferem a escolha e a conta confirmada.
- **Mutação:** tirar a conta da comparação de reuso derrubou o teste do processo persistente.
- **Gates:**
  - `npm test`: 3302 testes, 3292 passam, 10 pulados, 0 falham;
  - `vitest run`: 3509 passam e 4 pulados;
  - `eslint .` e `tsc -b` limpos.
- **App de fonte com perfil isolado:**
  - o seletor aparece com Login do sistema e "Automática (cadeia)", com o aviso de cadeia desligada;
  - uma conta de teste do Codex aparece como "Conta fixa" e continua escolhida depois de recarregar;
  - com a CLI trocada para o Claude, o seletor mostra "Login do sistema" sem apagar a escolha guardada.

**Não validado.**
- Nenhuma mensagem foi enviada no app: rodaria uma CLI real numa conta real.
- O caminho do envio está coberto pelos testes do resolvedor, do executor e do processo persistente.
- Não há teste de ponta a ponta do `cli:send` com o `cliManager` real, porque o módulo instancia o gerenciador no topo.
- O turno do orquestrador que bate o limite na conta não pergunta: só os sub-agentes trocam de conta no meio da tarefa.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 00:01): CI e Release.**
- **CI** de `37a9b2a` (run 43793979495): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas.
- **Ciclo de instalação das CLIs** (run 43793979523): passou.
- **Release:** o gate (run 43794645676) e o Release (run 43794674898, concluído às 23:59 de 15/11) publicaram a `v0.1.552`.

## 2026-11-16 — Orquestrador: teto de custo e confirmação de ações sensíveis passam a valer em código

Task: Felixo AI Core/Orquestrador — aplicar em código o teto de custo e a confirmação de ações sensíveis (Notion `3e991f95-497e-812b-8456-e0073877e9d7`), aberta em 28/09 no PR #97. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 00:29 em diante.

**Antes.** `maxCostEstimate` e `requireConfirmationForSensitiveActions` só entravam no texto do prompt. O processo principal não lia nenhum dos dois, e o inventário registrava a lacuna como risco alto.

**Medido.**
- **Custo:** só o adapter do Claude informa custo (`total_cost_usd`); Codex e Gemini não informam nada. No processo persistente, o total do Claude é acumulado. O bloco Claude API já tratava isso e calculava a diferença.
- **Permissões:** os sub-agentes rodavam com acesso total:
  - Claude em `bypassPermissions`;
  - Codex com `danger-full-access` e `approval_policy="never"`;
  - Gemini com `--yolo`.

  Os pedidos de aprovação do Codex App Server e do Gemini ACP eram aprovados sozinhos.
- **Definição:** "ação sensível" não existia em lugar nenhum do código.

**Decisões do Felipe** (`AskUserQuestion`):
1. **Medição:** soma o custo informado, e o que não informa fica de fora com aviso.
2. **No teto:** pausa e pergunta.
3. **Ação sensível:** é o pedido de permissão da própria CLI.
4. **Escopo:** os dois juntos.

**Feito.**
- **`cli-request-policy.cjs`:** `maxCostEstimate` e `requireConfirmationForSensitiveActions` chegam ao processo principal. O teto vai para os limites da execução como `maxCostUsd`.
- **Executor:** `recordRunCost` soma o custo das respostas da execução, contando as que vêm sem custo. `checkCostCap` pausa um sub-agente novo no teto com a pergunta `kind: 'cost'`, uma só por execução; quem chega enquanto ela está aberta espera junto.
  - "Continuar" libera mais um teto.
  - "Parar", ou o prazo vencido, falha quem esperava, e os próximos falham sem perguntar.
  - O teto não entra no registro de trocas.
- **Ponte do orquestrador:** todo `done` vai para `recordRunCost`.
- **Processo persistente:**
  - o custo da resposta é a diferença do total acumulado (`takeResponseCost`);
  - com a opção ligada, o pedido de permissão fica retido (`holdPermissionRequest`), vira o card `kind: 'permission'` e só segue com a resposta (`respondPermission`), ou é negado em 10 minutos (`expirePermissionRequests`, na varredura de 60 s);
  - a opção entra na chave de reuso do processo.
- **Opções de abertura e adapters:** com a opção, o Codex App Server abre com `workspace-write` e `on-request`, e o Gemini ACP sem `--yolo`. Os adapters entregam a resposta de aprovar, a de negar e a descrição (comando, pasta, motivo; ferramenta).
- **IPC:** `cli:provider-switch:list` junta os pedidos de permissão; `respond` manda o pedido de permissão para a sessão persistente, e o resto para o executor.
- **Card do chat:** título, botões, prazo e detalhes por tipo.
- **Configurações:** "Teto de custo (US$)", e o texto que explica a confirmação de ações sensíveis.

**Defeito achado no app e corrigido.** `toProviderSwitchRequest` copiava só uma lista fixa de campos. Os campos novos sumiam no caminho do evento até o card, e isso também valia para os rótulos de conta da v0.1.552: o card de troca de conta mostraria "conta atual → outra conta".
- O teste pelo caminho do evento falhou antes da correção e passou depois.
- No app, os três cards (teto, permissão e conta) apareceram completos, com eventos injetados pelo processo principal.

**Validação.**
- **Testes novos:** 3 do executor (teto), 3 do processo persistente (retenção e negação, prazo e sem a opção, custo por resposta), 4 dos adapters, 1 do IPC, 1 da política e 3 do renderer. Os 2 testes de formato da política foram atualizados.
- **Mutações:**
  - desligar a pausa no teto derrubou 2 testes do executor;
  - aprovar sem reter o pedido derrubou 2 testes do processo persistente.
- **Gates:**
  - `npm test`: 3314 testes, 3304 passam, 10 pulados, 0 falham;
  - `vitest`: 3508 passam;
  - `eslint .` e `tsc -b` limpos.
  - Três testes do terminal do canvas falharam com a máquina carregada pela suíte do Node rodando junto e passaram sozinhos (9 de 9).

**Não validado.**
- Nenhuma CLI real rodou: nem o Codex App Server pedindo aprovação de verdade, nem o Gemini sem `--yolo`, nem o teto com o Claude.
- Quantas perguntas uma tarefa comum gera, em especial no Gemini.
- O Claude e o Codex de uma resposta seguem com acesso total, por decisão do Felipe.
- O teto de tokens de contexto continua só no prompt. Ficou task.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 01:14): CI e Release.**
- **CI** de `897ea98` (run 43801192651): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas.
- **Release:** o gate (run 43801850411) e o Release (run 43801884621, concluído às 01:12) publicaram a `v0.1.553`.

## 2026-11-16 — Contas: o código estruturado das CLIs vira a fonte primária da taxonomia no chat e no orquestrador

Task: Felixo AI Core/Contas — usar os códigos estruturados das CLIs como fonte primária da taxonomia (Notion `3e991f95-497e-8163-a069-d8502ee1f129`), aberta em 28/09 no PR #97. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 01:20 em diante. Trilha A: a direção estava na task.

**Antes.** A taxonomia (`failure-taxonomy.cjs`) classificava só pelo texto do erro. Os adapters tinham o código em mãos e o jogavam fora.

**Medido nas versões instaladas** (sem rede nem conta; `app/electron/__fixtures__/cli-error-codes.json`):
- **Claude Code 2.1.323:** o binário traz a lista `api_error:*`, com `authentication_failed`, `oauth_org_not_allowed`, `account_on_hold`, `verification_required`, `cloud_credential_error`, `billing_error`, `rate_limit`, `overloaded`, `server_error`, `invalid_request`, `model_not_found`, `max_output_tokens` e `unknown`.
  - O código chega no campo `error` da mensagem `assistant`, e o `result` traz `api_error_status`.
  - A fixture real "You're out of extra usage · resets 1:20pm" vem com `rate_limit` e 429.
- **Codex 0.171.0-alpha.7:** `codex app-server generate-json-schema` dá o `CodexErrorInfo`, com 23 códigos. Ele é um enum ou um objeto com `httpStatusCode`.
  - A notificação `error` traz `{ error: TurnError, threadId, turnId, willRetry }`.
  - O adapter lia `params.message`, que não existe: a mensagem real se perdia, e um erro com `willRetry` (que o Codex tenta de novo) encerrava o pedido.
- **Gemini CLI 0.69.0-preview.0 (ACP):** o erro JSON-RPC do pedido sai com `code` igual ao status HTTP (`new RequestError(status, …)`, 429 com "Rate limit exceeded"), e `-32000` é "Authentication required". O `stopReason` só diz como a resposta terminou.

**Feito.**
- **`accounts/cli-failure-codes.cjs` (novo):** tabela por provedor que reaproveita a de status HTTP (`STATUS_CODES`).
  - Código conhecido que não é da conta vira `unknown`.
  - `unknown` do Claude e `other` do Codex devolvem a decisão ao texto.
  - Na variante de conexão do Codex, o status que vier junto decide.
- **`failure-taxonomy.cjs`:** `classifyFailure` aceita `code` e `httpStatus`. Na origem `fluxo`, o código decide; o `pty` não muda.
  - O escopo continua vindo do texto quando a classe é a mesma.
  - A evidência é a primeira linha redigida.
  - O resultado diz `source` (`codigo` ou `texto`) e `code`.
- **Adapters:**
  - Claude: `failureCode` e `httpStatus`;
  - Codex App Server: `failureCode` e `httpStatus`, a mensagem certa, e `willRetry` não encerra;
  - Gemini ACP: `failureCode` com o `code`.
- **Caminho até a decisão:** `model-availability` (`recordCliEvent`, `detectAvailabilityIssue`, `describeCliFailure`), `ipc-handlers` (`withCliFailure`, espera da conta), a ponte e o executor (`errorCode`, `errorHttpStatus`).

**Mudança de comportamento registrada.** "Out of extra usage · resets …" passa a ser limite no chat, pelo código, e volta no horário. No terminal continua cobrança, pelo texto. Ficou task para decidir se o terminal acompanha.

**Validação.**
- **Testes novos:**
  - 4 dos códigos: toda versão medida tem decisão; o código vence o texto; status; reserva e `pty`;
  - 2 do Codex App Server;
  - 1 do Gemini ACP;
  - 1 da disponibilidade;
  - 1 do executor.
- **Testes ajustados:** 3 dos adapters passam a esperar o código.
- **Mutação:** sem a decisão pelo código, 4 testes falham.
- **Gates:**
  - `npm test`: 3322 testes, 3312 passam, 10 pulados, 0 falham;
  - `eslint .` e `tsc -b` limpos;
  - `vitest`: tudo passa, menos 2 testes de `deferred-terminal-session-store`, que falham só na suíte inteira (perto de 1 s de espera sob carga) e passaram 3 de 3 rodando sozinhos. Não são desta mudança; ficou task.

**Não validado.**
- Nenhum erro real das CLIs foi provocado. As formas vêm do binário, do esquema e do bundle instalados, e a única fixture de execução real é a do Claude.
- O Codex de uma resposta (`codex exec --json`) e o Gemini de uma resposta não têm código no evento de erro e continuam no texto.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 01:50): CI e Release.**
- **CI** de `2e6eba8` (run 43804644766): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas.
- **Release:** o gate (run 43805399003) e o Release (run 43805417670, concluído às 01:48) publicaram a `v0.1.554`.

## 2026-11-16 — Contas: troca antecipada por limiar de uso, com confirmação

Task: Felixo AI Core/Contas — trocar de conta de forma proativa por limiar de uso (Notion `3e991f95-497e-812a-aa9e-deb225922147`), aberta em 28/09 no PR #97. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 02:02 em diante.

**Antes.** A cadeia só propunha troca depois da falha (limite, login, crédito).
- A política já tinha a medição atual (`isMeasurementCurrent`, até 15 min) e as janelas em % (`readPercentWindows`).
- O fluxo de proposta já tratava um terminal de origem ainda ativo (`SOURCE_ACTIVE`, com `acknowledgeSourceActive`).
- Faltavam o gatilho e a opção.

**Decisões do Felipe** (`AskUserQuestion`):
1. **Opção:** desligada por padrão; ao ligar, 90%.
2. **Ao aceitar:** igual à troca por limite (bloco novo com o contexto; o antigo fica, com o aviso de que ainda trabalha).
3. **Destino:** a conta acima do limiar fica por último.
4. **Frequência:** uma vez por janela, e "Agora não" silencia até renovar.

**Feito.**
- **Migração 022:** `proactive_enabled` (0/1, padrão 0) e `proactive_threshold_percent` (50 a 99, padrão 90) em `account_chain_settings`. O repositório, o serviço, o IPC (`parseSettingsUpdate`) e a visão levam os dois campos.
- **Política:** `findWindowOverThreshold` acha a janela mais usada de uma medição atual que passou do limiar. Reset já passado, janela de um modelo só e medição velha não contam.
- **Serviço:**
  - `onUsageMeasured({ accountId })` propõe para cada bloco vivo em cadeia daquela conta (`proposeAhead`);
  - a proposta é `continuation` com classe `threshold`: não põe a conta em espera e tem motivo "Uso em N% na conta X (janela), acima do limiar de L%";
  - a impressão digital é `limiar|conta|janela|reset`, então qualquer evento anterior da mesma janela no bloco silencia;
  - `lastAboveThreshold` põe a conta acima do limiar no fim da fila de destinos.
- **`main.cjs`:** o `saveSample` do repositório de uso avisa a cadeia depois de gravar. Ele roda fora do caminho da gravação (`setImmediate`), e a referência só existe depois de a cadeia nascer.
- **Interface:**
  - "Trocar antes do limite" e "Limiar de uso" na aba Cadeia; o limiar é salvo ao sair do campo, e fora da faixa volta ao gravado;
  - classe `threshold` com o rótulo "uso acima do limiar", sem "Não era limite".

**Validação.**
- **Testes novos:**
  - 4 do serviço: propõe sem espera; uma vez por janela e "Agora não"; opção desligada, abaixo do limiar, medição velha e bloco fixo; destino por último;
  - 1 da política;
  - 1 do repositório;
  - 1 do IPC;
  - 1 da faixa.
- **Testes ajustados:** o padrão do repositório, o contrato do IPC e as fixtures do renderer ganham os campos.
- **Mutações:** sem o gatilho, 3 testes falham; sem o "fica por último", 1.
- **Gates:**
  - `npm test`: 3329 testes, 3319 passam, 10 pulados, 0 falham;
  - `vitest`: 3513 passam;
  - `eslint .` e `tsc -b` limpos.
- **App de fonte com perfil isolado:**
  - a migração 022 roda num banco novo (desligada, 90%);
  - ligar pela ponte grava;
  - na aba Cadeia, o interruptor aparece ligado e o limiar mudou para 95% ao sair do campo, conferido no main;
  - 120 voltou para 95.

**Não validado.**
- A proposta disparada por uma medição real com bloco vivo no app: precisa de contas e de uma medição acima do limiar. O gatilho está coberto no serviço com SQLite real.
- A rapidez da troca depende de quantas amostras chegam. O Claude atualiza a cada resposta pela statusline; os demais, pela coleta do painel. A captura por sessão (task `3fa91f95-497e-81ad-a876-ec56a37b3b53`) continua em Entrada.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 02:52): CI e Release.**
- **CI** de `603d0c0` (run 43809743132): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas.
- **Release:** o gate (run 43810573692) e o Release (run 43810595183, concluído às 02:39) publicaram a `v0.1.555`.

## 2026-11-16 — Onboarding: a cadeia de contas entra no catálogo de novidades

Task: Felixo AI Core/Onboarding — anunciar a cadeia de contas no catálogo de novidades (Notion `3e991f95-497e-817d-b6a4-c2c1825b3afc`), aberta em 28/09 no PR #97. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 02:59 em diante. Trilha A: a direção estava na task.

**Antes.** O catálogo (`onboarding-catalog.ts`, revisão 1) só tinha a novidade da Ajuda. A cadeia vem desligada, e nada avisava quem atualizava. O inventário do canvas registrava essa lacuna apontando para esta task.

**Medido.**
- **Quem recebe:** a linha de base dá como conhecidas, no primeiro uso, todas as novidades de capability. Quem já usava recebe as que têm `anunciarParaQuemJaUsa`, e quem já tem estado recebe toda entrada que falta em `knownFeatures`.
- **Ordem:** depois de "Agora não" ou de concluir, as novidades são reavaliadas uma de cada vez (plano do tutorial, §"Depois de CONCLUIR, PULAR ou AVISO_DISPENSAR").
- **Capability:** nenhum código chama `setCapability`. Um `requires` seguraria a novidade para sempre, então a entrada fica sem ele, como a da Ajuda.
- **Âncora:** a cadeia mora em Limites e uso, que não tem âncora própria.

**Feito.**
- **Catálogo (revisão 2):**
  - `feature.cadeia-contas` com `anunciarParaQuemJaUsa`;
  - mini-tour `novidade-cadeia-contas` com um passo que aponta a seção Ferramentas (fechada; o tour não expande nada), com `rail-menu` de reserva e `citaFerramentas: ['agentUsage']`;
  - textos: "quando uma conta bate o limite, a cadeia de contas propõe outra, sempre com a sua confirmação. Vem desligada; ligue em Ferramentas, Limites e uso, aba Cadeia."
- **Testes:**
  - as fixtures passam a usar `CURRENT_FEATURE_IDS` e `NEXT_CATALOG_REVISION`, em vez de "revisão 2" e `['feature.ajuda']` fixos;
  - o teste de "uso anterior" da store cobre a fila: Ajuda, depois cadeia, cada uma uma vez, e nada no restart.
- **Smoke:**
  - SB5 e SB6 semeiam só a Ajuda como novidade (`soAjudaNova`);
  - o SB7 deixa de reescrever `knownFeatures` no estado quebrado. Sem isso, a segunda novidade abriria no meio dos cenários.
- **Docs:**
  - GUIA-USUARIO (o aviso em "Como ligar");
  - GUIA-DESENVOLVEDOR (função sem âncora própria; fila; testes que não fixam a lista);
  - inventário (lacuna resolvida; "Agora não" traz a próxima novidade).

**Validação.**
- **Mutação:** sem a entrada no catálogo, o teste de "uso anterior" falha.
- **Smoke da sessão B:** com o smoke antigo e o catálogo novo, falha nas três tentativas (SB6 espera o aviso sumir, e o da cadeia aparece). Com o ajuste, SB1 a SB8 passam (33,7 s).
- **Gates:**
  - `npm test`: 3329 testes, 3319 passam, 10 pulados, 0 falham;
  - `vitest`: 3513 passam;
  - `eslint .` e `tsc -b` limpos.
- **App de fonte com perfil isolado e `FELIXO_DEVTOOLS_ONBOARDING=1`:**
  - primeiro uso: as duas novidades entram como conhecidas e nada é avisado;
  - estado de quem atualiza (sem `feature.cadeia-contas`): o aviso "Novidade: Cadeia de contas" aparece ao lado da Ajuda sem tirar o foco, e o leitor de tela ouve "Novidade em Ajuda: Cadeia de contas.";
  - "Ver" abre o mini-tour no cabeçalho Ferramentas (fechado);
  - "Concluir" e reload: nada volta.

**Não validado.** O aviso não foi conferido no app instalado, atualizando de uma versão anterior com estado real. O smoke e o estado semeado cobrem o mesmo caminho.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 03:34): CI e Release.**
- **CI** de `4f5af2a` (run 43815577185): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas.
- **Release:** o gate (run 43816345030) e o Release (run 43816367733, concluído às 03:32) publicaram a `v0.1.556`.

## 2026-11-16 — Contas: o configurador lembra uma conta por provedor (`accountByProvider`)

Task: Felixo AI Core/Contas — preferência de conta por provedor no configurador (Notion `3e991f95-497e-817b-b2e7-c5ab8c016dfa`), item 12 do §16 do plano da cadeia (PR #97). Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 03:39 em diante. Trilha A: a direção estava na task.

**Antes.** `felixo:last-agent-launch-preferences` guardava uma conta só (`accountId` e `accountLabel`), a do último agente. O configurador só a reaproveitava no mesmo provedor (`contaSalvaRef.providerId`).
- A gravação roda a cada mudança do formulário. Ao trocar de agente, o campo zera antes de a lista do provedor novo chegar, e esse vazio era gravado.
- Resultado: trocar de agente perdia a conta do outro.

**Feito.**
- **`agent-launch-preferences.ts`:**
  - `accountByProvider` (id do provedor → `{ accountId, accountLabel? }`). A leitura sempre devolve o mapa, descartando provedor desconhecido e conta sem id.
  - Migração: sem o mapa, a conta única vira a do provedor do agente salvo (o shell não tem provedor).
  - `accountId` e `accountLabel` continuam sendo gravados, os do agente atual, que uma versão anterior ainda lê.
  - `rememberProviderAccount` decide o mapa a gravar. Só entra a conta de um provedor cuja seleção já foi decidida; vazio decidido (Login do sistema) tira o provedor do mapa.
- **`useAgentConfig.ts`:**
  - `contasSalvasRef` (o mapa) e `contaDecididaRef`;
  - a lista aplicada e a escolha explícita (`setAccountId`) marcam o provedor como decidido; `changeAgent` desmarca;
  - `aplicarListagem` usa a conta lembrada do provedor da lista;
  - `savePreferences` grava o mapa.
- **Ponto de atenção da task:** conta lembrada que sumiu continua no aviso "A conta salva X não existe mais" (`selectAccountFromList` → `saved-missing`), que bloqueia a abertura. Nada cai no Login do sistema sem escolha.
- **Docs:** GUIA-USUARIO ("Uma conta por agente", em "Mudanças que você pode notar ao atualizar") e o inventário do canvas (campos Agente e Conta).

**Validação.**
- **Testes:** 6 novos em `agent-launch-preferences.test.ts` e 2 ajustados (a leitura devolve o mapa).
  - migração, inclusive a do shell;
  - mapa com três provedores e leitura que descarta lixo;
  - `rememberProviderAccount`: grava sem mexer nos outros, o vazio da troca não apaga, Login do sistema tira do mapa, sem mudança devolve o mesmo mapa.
- **Mutações:** sem a guarda de seleção decidida, 1 teste falha; sem a migração, 2.
- **Gates:**
  - `npm test`: 3329 testes, 3319 passam, 10 pulados, 0 falham;
  - `vitest`: 3519 passam;
  - `eslint .` e `tsc -b` limpos.
- **App de fonte com perfil isolado e duas contas de teste** (pastas de perfil, sem login):
  - Claude com "Teste Claude" e Codex com "Teste Codex": voltar a cada um restaura a conta dele, inclusive depois do reload;
  - removida a conta do Codex, voltar ao Codex mostra "Selecionar…" e o alerta "A conta salva "Teste Codex" não existe mais", com o campo inválido;
  - uma preferência no formato antigo virou `accountByProvider.claude` no primeiro reload.

**Não validado.** O app instalado não foi aberto, atualizando de uma versão anterior com contas reais. A migração foi conferida no app de fonte com o formato antigo gravado à mão.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 04:11): CI e Release.**
- **CI** de `56ed024` (run 43819857971): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas.
- **Release:** o gate (run 43820830876) e o Release (run 43820853685, concluído às 04:09) publicaram a `v0.1.557`.

## 2026-11-16 — Release: os 10,7 s do Ubuntu na v0.1.426 eram o runner, não a cadeia de contas

Task: Felixo AI Core/Release — investigar a abertura do pacote no Ubuntu em 10,7 s na v0.1.426 (Notion `3e991f95-497e-81f0-b704-cc0a99cc8751`). Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 04:16 em diante. Trilha A (investigação com critério medível).

**Suspeita da task.** Depois do PR #97, o `startupMs` do `release-smoke-ubuntu-latest.json` foi de 786 ms (v0.1.425) para 10.720 ms (v0.1.426), e a cadeia acrescentou ao início a migração 017, o runtime e o `recoverOnStartup`.

**Medido.**
- **O que a métrica cobre:**
  - `startupMs` = `status.readyAt` − spawn (`scripts/release-smoke.cjs:606`);
  - o `readyAt` é marcado em `electron/release-smoke.cjs` logo depois de conferir o `userData`;
  - no modo de validação, o `main.cjs` roda o smoke e retorna no começo do `app.whenReady()`, antes de `createStorageDatabase`, das migrações e de `createAccountChainRuntime`/`recoverOnStartup` (v0.1.426: linhas 311–319 contra 352, 603 e 626);
  - da cadeia, só o `require` do módulo no topo do `main.cjs` entra na medição.
- **Série de 155 releases (v0.1.400 a v0.1.557, 154 com medição do Ubuntu),** lida pela API sem salvar os pacotes:

  | Faixa | Ubuntu (p50 / p90 / máx.) | macOS (p50 / máx.) | Windows (p50 / máx.) |
  | --- | --- | --- | --- |
  | v0.1.400–425 (antes da cadeia) | 3,0 / 6,6 / 15,0 s | 1,5 / 2,8 s | 0,47 / 0,57 s |
  | v0.1.426–450 | 3,8 / 7,7 / 15,4 s | 1,8 / 4,4 s | 0,50 / 0,57 s |
  | v0.1.451–500 | 3,0 / 7,9 / 17,2 s | 1,7 / 3,8 s | 0,52 / 0,86 s |
  | v0.1.501–530 | 1,5 / 3,2 / 5,0 s | 2,0 / 4,0 s | 0,38 / 0,59 s |
  | v0.1.531–557 | 1,6 / 3,4 / 6,6 s | 1,8 / 4,1 s | 0,34 / 0,48 s |

  Picos acima de 10 s já existiam antes da cadeia: v0.1.404 marcou 12,7 s e v0.1.405, 15,0 s. Todas as amostras do Ubuntu são AppImage.
- **Custo da cadeia com o código real e SQLite real** (Windows, Node 25, 3 rodadas; script no scratchpad):
  - `require` frio do runtime: 55–81 ms;
  - migração 017 isolada: 11–19 ms; as 22 migrações num perfil novo: 246–281 ms;
  - `createAccountChainRuntime`: cerca de 1–2 ms;
  - `recoverOnStartup`: 1,6–2,7 ms num perfil novo e 34–49 ms num perfil com 2000 eventos (200 propostas vencidas, 1000 podados).
- **Critério de aceite:** as três últimas releases ficaram abaixo de 4,2 s: v0.1.555 com 2,0 s, v0.1.556 com 1,5 s e v0.1.557 com 2,1 s.

**Conclusão.** Não há regressão da cadeia no `startupMs`. A métrica não executa a cadeia, e os 10,7 s estão dentro da oscilação que o Ubuntu do runner já mostrava antes do PR #97. No início real do app, a cadeia custa dezenas de milissegundos, e não há o que adiar. A recuperação continua síncrona e fail-closed, como estava.

**Feito.**
- GUIA-DESENVOLVEDOR: o que o `startupMs` mede e a orientação de comparar a série, não um valor.
- Comentário de uma linha no `readyAt` (`electron/release-smoke.cjs`).
- O job antigo não foi rodado de novo: re-rodar o Release de uma versão publicada republica os artefatos, e as 127 medições do Ubuntu depois dela já dão a distribuição.

**Validação.** `npm test`: 3329 testes, 3319 passam, 10 pulados, 0 falham. `eslint` do arquivo tocado limpo. Os 7 testes de `electron/release-smoke.test.cjs` passam.

**Não validado.** Não medi o Electron subindo numa máquina Linux real, fora do runner. O checklist de prontidão (task `3fa91f95-497e-81d7-a265-c9ba906be39c`) já pede essa medição.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 04:42): CI e Release.**
- **CI** de `917d568` (run 43823514099): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas.
- **Release:** o gate (run 43824331947) e o Release (run 43824359989, concluído às 04:40) publicaram a `v0.1.558`, porque o comentário tocou um arquivo do app.
- **Mais uma medição:** o release-smoke da v0.1.558 marcou `startupMs` de 2917 ms no Ubuntu (macOS 1809, Windows 389). É a quarta seguida abaixo de 4,2 s (2012, 1463, 2054 e 2917 ms).

## 2026-11-16 — Segurança: sites na Página Web só usam permissões depois de perguntar à pessoa

Task: Felixo AI Core/Segurança — decidir por permissão o que um site no bloco Página Web pode usar, perguntando à pessoa (Notion `3ea91f95-497e-812a-bc4b-ccfe144bd56c`), aberta em 29/09 a partir da política única de URL. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 04:45 em diante.

**Antes.** `decidePermissionRequest` concedia toda permissão que não fosse `openExternal`, em todas as sessões, inclusive nas partições dos perfis do navegador interno. Não havia `setPermissionCheckHandler`, então `navigator.permissions.query` dizia "concedido".

**Decisões do Felipe** (`AskUserQuestion`):
1. **Padrão:** perguntar tudo (toda permissão pede confirmação, inclusive tela cheia e escrita no clipboard).
2. **Onde perguntar:** numa faixa no próprio bloco; sem resposta, conta como negado.
3. **Memória:** por site e perfil, até revogar.
4. **Revogar:** nos dois lugares, no menu do perfil do bloco e nas Configurações.

**Medido no Electron 42.11.16** (janela escondida numa partição de teste, com página local em 127.0.0.1):
- **Perfil da sessão:** o `storagePath` de uma partição é `<userData>/Partitions/felixo-webview[-<id>]` e o da sessão padrão é o `userData`. Daí sai o perfil da sessão, sem rastrear webviews.
- **Verificação negada:** com o check handler devolvendo `false`, `permissions.query` e `Notification.permission` dizem `denied` (o Electron não tem "perguntar"). Mesmo assim, `Notification.requestPermission`, `getCurrentPosition`, `getUserMedia` (com `mediaTypes`), `clipboard.readText`, `clipboard.writeText` e `requestFullscreen` chegam ao handler de pedido.

**Feito.**
- **`webview-site-permissions.cjs`:** política pura e broker.
  - Rótulo de cada permissão; `media` vira microfone e/ou câmera.
  - Origem só de http(s).
  - Negação lembrada nega o pedido inteiro; o que falta decidir vai para a faixa.
  - Pedidos repetidos viram uma faixa só, com no máximo 4 pendentes por webContents.
  - Navegar no quadro principal ou fechar nega o que estava pendente.
  - Popup de um bloco pergunta no bloco que o abriu (`linkPopup`).
  - Uma resposta resolve os outros pendentes do mesmo site e perfil.
- **Migração 023 e repositório:** `webview_site_permissions` (perfil, origem, permissão, decisão, data). Excluir o perfil apaga as decisões dele (`onProfileDeleted`).
- **`session-security.cjs`:**
  - `classifySession` lê a sessão no pedido: perfil do navegador interno (pergunta pelo broker), sessão padrão do app (concede, como antes: ditado e clipboard) ou outra (nega);
  - `openExternal` segue a política de URL em toda sessão;
  - novo `setPermissionCheckHandler`, coerente com as decisões gravadas.
- **IPC:** `webview-permissions:pending|respond|list|revoke`, com os avisos `webview-permissions:pending|changed`. O renderer só responde pedidos criados pelo main e só revoga.
- **Interface:**
  - faixa no bloco Página Web ("‹site› quer …", Permitir/Negar, sem foco automático);
  - "Permissões dos sites neste perfil" no menu do perfil (Revogar por site);
  - seção "Permissões dos sites (Página Web)" nas Configurações (revogar por permissão).
- **Docs:** GUIA-USUARIO, ARQUITETURA e inventário do canvas. As travas de texto do `navigation-guard.test.cjs` passaram a procurar o prefixo das chamadas, que ganharam argumentos.

**Validação.**
- **Testes:**
  - 8 do broker e da política, com SQLite real;
  - 1 novo do `session-security` (o antigo "as outras permissões continuam com o padrão do Electron" saiu);
  - 4 do renderer;
  - os de exclusão de perfil cobrem o `onProfileDeleted`.
- **Mutações:**
  - site concedendo sem perguntar: 1 teste falha;
  - verificação dizendo "concedido" sem decisão: 1;
  - negação lembrada ignorada: 2.
- **Gates:**
  - `npm test`: 3337 testes, 3327 passam, 10 pulados, 0 falham;
  - `vitest`: 3523 passam;
  - `eslint .` e `tsc -b` limpos.
- **App de fonte com perfil isolado e um bloco Página Web em http://127.0.0.1:8787:**
  - a notificação mostrou a faixa sem tirar o foco; Permitir deu `granted` no site, na consulta e no `Notification.permission`, e a decisão ficou gravada;
  - Negar a localização deu `erro:1`, e o segundo pedido foi negado sem faixa;
  - Revogar no menu do perfil zerou as decisões, a consulta voltou a `denied` e o site perguntou de novo;
  - o × das Configurações revogou;
  - `getUserMedia` na sessão do app continuou concedido (ditado).

**Não validado.**
- **Site real:** não testei um site de verdade (vídeo-chamada, passkey/WebAuthn, o editor do n8n da task relacionada).
- **Popup:** só coberto por teste.
- **Leitura do clipboard:** num site sem foco, o Chromium recusa antes de perguntar.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 06:02): CI, correção de foco e Release.**
- **CI de `90d0be0` (run 43828675082) falhou:** o smoke do canvas no Ubuntu travou no SA3 nas três tentativas (Esc no configurador do agente e Ctrl+K: a Busca abria, mas o foco não chegava nela).
  - **A/B local:** com o `WebpageNode.tsx` e o `WebviewProfileMenu.tsx` antigos, o SA3 passou; a captura da falha mostrava o foco na seta "Configurar novo agente".
  - **Causa:** os menus devolviam o foco ao botão num `requestAnimationFrame` sem conferir se ele já tinha ido para outro lugar. Na janela escondida (~2 fps) esse quadro chega depois do Ctrl+K. As re-renderizações novas do bloco mudaram o tempo o bastante para a corrida aparecer.
- **Correção em duas etapas:**
  - `bfab59a` corrigiu os menus de Agente e Página Web da barra, mas o CI dele (run 43831851677) ainda falhou o SA3 na primeira tentativa;
  - `ecdf4bb` corrigiu o caminho certo, o `TerminalMenu` (o configurador do agente). `restoreFocusIfLost` (`services/restore-focus.ts`) só devolve o foco se ele caiu no body, e vale para os três menus.
- **CI de `ecdf4bb` (run 43833791737):** passou em todos os jobs, e o SA3 passou de primeira.
- **Release:**
  - o gate 43832877066 e o Release 43832905684 publicaram a `v0.1.559` (até `bfab59a`, concluído às 05:46);
  - o gate 43834691368 e o Release 43834730059 publicaram a `v0.1.560` (com `ecdf4bb`, concluído às 06:00).

## 2026-11-16 — Navegador: popups da Página Web mostram o site no título, têm limite por bloco e fecham com o bloco

Task: Felixo AI Core/Navegador — mostrar a origem e limitar a quantidade dos popups de login do bloco Página Web (Notion `3ea91f95-497e-8129-acde-f3b1049c09ed`), aberta em 29/09 a partir da política única de URL. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 06:06 em diante. Trilha A: a direção estava na task; o título da janela (e não uma barra) e o aviso no bloco foram escolhas técnicas.

**Antes** (`webview-lifecycle.cjs`):
- `resolveWindowOpenAction` aprovava todo `window.open` que não fosse aba, sem contar janelas.
- A janela do popup mostrava o título que a página escolhia, e nada indicava o site.
- Popups de um bloco removido ficavam abertos.

**Feito.**
- **`popupWindowTitle`:** "‹site› — ‹título da página›", com "http://" visível e "Abrindo…" no `about:blank` do começo. `labelPopupWindow` cancela o `page-title-updated` da janela e mantém o site no título a cada navegação. A barra de título é do sistema, e o site não a falsifica.
- **`createPopupTracker`:** no máximo 2 popups ao mesmo tempo por bloco (o webContents do bloco), contando os que um popup abre.
  - A vaga é reservada ao aprovar e vira janela no `did-create-window`.
  - Reserva que nunca vira janela expira em 10 s.
  - Janela fechada libera a vaga.
  - O excedente é negado, e o main manda `webview-popups:blocked` para o bloco, que mostra "Esta página tentou abrir mais de 2 janelas ao mesmo tempo…" até fechar o aviso ou navegar.
- **Órfãos:** o `destroyed` do webview do bloco fecha os popups dele (bloco removido ou webview recriado pela troca de perfil).
- **Login:** nada muda na criação da janela (sem `parent` nem `modal`), então o handshake de login fica como estava.
- **Docs:** GUIA-USUARIO ("Janelas de login da Página Web"), ARQUITETURA e o inventário do canvas.

**Validação.**
- **Testes:**
  - `webview-lifecycle.test.cjs`: 6 novos (título; título que a página não troca; limite com aviso e vaga liberada; popup de popup no mesmo bloco; reserva que expira; bloco destruído fechando os popups);
  - o fake de janela dos testes antigos ganhou `on`, `setTitle`, `isDestroyed` e `close`.
- **Mutações:** sem o limite, 4 testes falham; sem fechar os órfãos, 1; com a página trocando o título, 1.
- **Gates:**
  - `npm test`: 3343 testes, 3333 passam, 10 pulados, 0 falham;
  - `vitest`: 3523 passam;
  - `eslint .` e `tsc -b` limpos;
  - o smoke do canvas, sessões A e D, passou de primeira localmente.
- **App de fonte, com site de teste em http://127.0.0.1:8788:**
  - o popup abriu com o título "http://127.0.0.1:8788 — Banco Exemplo - entre aqui", e o `postMessage` de volta chegou a quem abriu (`token-ok:?n=1`);
  - 5 `window.open` seguidos: 1 abriu e 4 foram negados, 2 janelas no total, com a faixa no bloco;
  - remover o bloco fechou as 2 janelas.

**Não validado.** O login real do Google (precisa de uma conta) e o comportamento no macOS. A task "conferir a faixa de permissão com sites reais" (`41a91f95-497e-813a-8503-d10794366b4a`) já cobre o popup de login real.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 06:36): CI e Release.**
- **CI** de `f9c4c38` (run 43838467152): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas, sem nova tentativa.
- **Release:** o gate (run 43839320271) e o Release (run 43839353801, concluído às 06:33) publicaram a `v0.1.561`.

## 2026-11-16 — Segurança: a URL do bloco Página Web sai sem tokens no .fxcanvas e na leitura por agentes

Task: Felixo AI Core/Segurança — redigir tokens de URL no bloco Página Web, no .fxcanvas e na leitura por agentes (Notion `3ea91f95-497e-8126-88c8-c6a7ce21bee0`), aberta em 29/09 a partir da política única de URL. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 06:42 em diante.

**Antes.**
- O `data.url` do bloco (com query e fragmento) ia inteiro para o banco, para o `.fxcanvas` (`normalizeCanvasBundle` já tirava o `filePath` dos blocos de arquivo, mas não tocava na URL) e para o rótulo que `canvas-agent-read.cjs` dá aos agentes.

**Decisões do Felipe** (`AskUserQuestion`):
1. **Estratégia:** "gravar completa; redigir só fora". O SQLite local guarda a URL inteira, e o bloco reabre onde estava; só o `.fxcanvas` e a leitura pelos agentes saem redigidos. A recomendação era redigir em tudo.
2. **Parâmetro sensível:** sai da URL, em vez de virar `[redigido]`.
3. **Canvas já salvos:** só daqui para frente. Como o export e a leitura redigem na hora, valem também para canvas antigos sem mexer no que está gravado.

**Feito.**
- **`url-secret-redaction.cjs` (`redactUrlSecrets`):** tira da URL o que é sensível.
  - **O que sai:** usuário e senha; os parâmetros de nome sensível (os de `isSensitiveKeyName` do `git-secret-redaction.cjs`, mais `code`, `key`, `auth`, `otp`, `ticket`, `jwt`, `session`, `assertion`, `SAMLResponse`, `oauth_verifier`…); os prefixos `X-Amz-*` e `X-Goog-*`; e valores com cara de token (JWT, `ghp_`, `sk-`…).
  - **Fragmento:** só é tratado quando é de pares (`#access_token=…&token_type=…`); uma âncora comum fica.
  - **Sem nada a tirar:** a URL volta exatamente como veio (sem reserializar a query nem pôr "/" no fim).
- **Aplicado em:** `canvas-transfer.cjs` (blocos `webpage` no `.fxcanvas`) e `canvas-agent-read.cjs` (rótulo do bloco para os agentes).
- **Inventário:** saíram as lacunas desta task e as das duas anteriores (permissões e popups), que tinham ficado para trás.
- **Docs:** GUIA-USUARIO (export) e ARQUITETURA.

**Validação.**
- **Testes:**
  - 16 casos em tabela no `url-secret-redaction.test.cjs` (OAuth, redefinição de senha, login mágico, AWS, Google, Azure SAS, JWT num nome inocente, usuário e senha, busca e documento intactos);
  - o critério de aceite no `canvas-transfer.test.cjs`: o export de `https://x.com/cb?code=abc&lang=pt#access_token=def` não contém `abc` nem `def` e mantém `lang=pt`;
  - no `canvas-agent-read.test.cjs`, o agente vê `https://x.com/cb`.
- **Mutações:** sem a redação no export, 1 teste falha; na leitura por agentes, 1.
- **Gates:**
  - `npm test`: 3346 testes, 3336 passam, 10 pulados, 0 falham;
  - `vitest`: 3523 passam;
  - `eslint .` e `tsc -b` limpos.
- **App de fonte:** com um bloco em `http://127.0.0.1:8788/cb?code=abc123&lang=pt#access_token=def456&token_type=bearer`, o banco guardou a URL completa e o `exportBundle` saiu com `http://127.0.0.1:8788/cb?lang=pt#token_type=bearer`, sem `abc123` nem `def456`.

**Não validado.**
- **Leitura pelos agentes no app:** não foi conferida pela fila da CLI; o `listarElementos` que ela usa está testado.
- **Exportar com a saída dos terminais:** leva a saída como saiu, e um token impresso no terminal viaja. Isso já está avisado no guia e fica fora desta task.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 07:14): CI e Release.**
- **CI** de `ff76dcc` (run 43844198358): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas, sem nova tentativa.
- **Release:** o gate (run 43845122474) e o Release (run 43845160452, concluído às 07:12) publicaram a `v0.1.562`.

## 2026-11-16 — Navegador: downloads passam pelo diálogo de salvar, programas pedem confirmação com a origem e o registro sai sem query

Task: Felixo AI Core/Navegador — tratar downloads do bloco Página Web com política de tipo, destino e registro redigido (Notion `3ea91f95-497e-8155-a6bc-ea704c00ef65`), aberta em 29/09 a partir da política única de URL. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 07:17 em diante.

**Antes.** Não havia `will-download` em lugar nenhum. Os downloads de sites e do app seguiam o padrão do Electron, sem política de tipo, sem destino definido e sem registro.

**Decisões do Felipe** (`AskUserQuestion`, todas na opção recomendada):
1. **Programa ou script:** confirmação mostrando a origem.
2. **Destino:** diálogo de salvar, começando em Downloads.
3. **Onde perguntar:** numa janela do sistema.

**Medido no app de fonte** (site de teste em 127.0.0.1:8789 e ganchos de automação):
- **Pausar quebra o `blob:`:** pausar e retomar um download `blob:` da janela do app terminava como `interrupted`, porque o `blob:` não retoma. Por isso o fluxo não pausa.
- **Playwright desvia os downloads da janela do app:** o `felixo devtools` controla essa janela via `connectOverCDP`. O download terminava como `completed` fora do caminho definido (`rename` com ENOENT). O webview dos blocos não é afetado.
- **O caminho do app funciona fora da automação:** numa janela escondida noutra sessão, um `blob:` com o `revokeObjectURL` imediato, como na exportação do chat, foi salvo.

**Feito.**
- **`download-guard.cjs`:**
  - `classifyDownload`: extensões de programa, script, atalho e imagem de disco de Windows, macOS e Linux. O MIME só conta sem extensão.
  - `describeDownloadSource`: esquema + host; num `blob:`, a origem de dentro; `data:`.
  - `safeFileName`.
  - `handleDownload`: temporário em `<temp>/felixo-downloads` com nome aleatório; confirmação se for perigoso; diálogo de salvar em Downloads; move no fim, com cópia entre discos; recusar ou cancelar apaga o temporário.
  - `createDownloadDialogs`: `showMessageBox` com Cancelar padrão e `showSaveDialog`, assíncronos e com a janela do app como mãe. Só na automação, `FELIXO_DEVTOOLS_DOWNLOAD_DIR`/`_CONFIRM` respondem os diálogos.
- **`session-security.cjs`:** `onDownload` no `will-download` de toda sessão endurecida.
- **`main.cjs`:** registro `scope: download` no QA Logger (resultado, origem, nome, bytes, extensão e se é perigoso).
- **Docs:** GUIA-USUARIO ("Downloads da Página Web") e ARQUITETURA. A lacuna da task saiu do inventário.

**Validação.**
- **Testes:**
  - 8 novos em `download-guard.test.cjs`, com arquivos reais numa pasta temporária;
  - 1 em `session-security.test.cjs` (o `will-download` das duas sessões chega ao `onDownload`).
- **Mutações:** sem a confirmação, 2 testes falham; sem apagar o temporário, 1.
- **Gates:**
  - `npm test`: 3355 testes, 3345 passam, 10 pulados, 0 falham;
  - `vitest`: 3523 passam;
  - `eslint .` e `tsc -b` limpos.
- **App de fonte com a automação respondendo:**
  - confirmação "não": `relatorio.pdf` foi salvo (registro `salvo`, origem `http://127.0.0.1:8789`, sem o `?token=segredo`); `instalador.exe` não foi salvo (`recusado`); a exportação `blob:` do site foi salva;
  - confirmação "sim": o `.exe` foi salvo (`salvo-com-confirmacao`);
  - numa janela noutra sessão: um `blob:` com revoke imediato foi salvo.

**Não validado.**
- **Diálogos de verdade:** não abri o diálogo de salvar nem a confirmação reais, porque abririam na tela de quem usa. Na automação, eles respondem sozinhos.
- **Exportação do chat:** não foi conferida na janela do app, por causa do desvio do Playwright.
- **macOS e Linux:** o comportamento dos diálogos não foi conferido.

Estado: concluído (deploy no adendo).

**Adendo (2026-11-16, 07:46): CI e Release.**
- **CI** de `4192384` (run 43849597367): passou no Validate de Windows, macOS, Ubuntu e Ubuntu ARM e no smoke do canvas, sem nova tentativa.
- **Release:** o gate (run 43850467467) e o Release (run 43850517120, concluído às 07:44) publicaram a `v0.1.563`.

## 2026-11-16 — Segurança: a imagem relativa do Markdown não sai da raiz autorizada

Task: Felixo AI Core/Segurança — prender a imagem relativa do Markdown a uma raiz autorizada (Notion `3ea91f95-497e-8181-a158-c32ba5c25cc4`), aberta em 29/09 a partir da política única de URL. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 08:25 em diante. Trilha A: a direção estava na task (raiz = projeto aberto ou, fora de projeto, a pasta do arquivo).

**Antes** (`markdown-image-src.ts`):
- `resolveMarkdownImageSrc` decodificava o caminho (`%2e%2e/` vira `../`) e o `joinAndNormalize` resolvia `..` com `stack.pop()` sem limite inferior.
- Medido no teste antes da correção: `../../../../x.png` virava `file:///x.png`, a raiz do disco.
- A CSP (`img-src file:`) não segura essa saída.

**Feito.**
- **`resolveMarkdownImageSrc(src, baseDir, rootDir = baseDir)`:**
  - depois de decodificar, recusa o relativo que virou absoluto (`%2Fetc`, `C%3A%5C`, `%5C%5Cservidor`);
  - depois de normalizar, exige que o caminho final esteja dentro de `rootDir`, pasta a pasta (`/home/pedro` não está em `/home/p`) e sem diferenciar maiúsculas quando há letra de unidade;
  - fora da raiz, a imagem vira só o texto alternativo, como já acontecia com as recusas.
- **`markdownImageRoot(absolutePath, projectRoots)`:** o projeto aberto mais específico que contém o arquivo; sem projeto, a pasta do arquivo.
- **Fiação:**
  - `ProjectRootsContext`, novo, fornecido pelo `CanvasView` com as pastas de `useCanvasProjects`;
  - o `FileNode` calcula a raiz;
  - `DeferredMarkdownContent`, `MarkdownContent` e `MarkdownImage` levam `imageRoot` até o resolvedor, inclusive no Markdown aninhado do bloco de código.
- **Symlink:** a checagem é pelo caminho, no renderer. Um link simbólico dentro da raiz que aponte para fora não é seguido aqui; para isso seria preciso um `realpath` no processo principal.
- **Docs:** GUIA-USUARIO.

**Validação.**
- **Testes de tabela em `markdown-image-src.test.ts`:**
  - 12 saídas da raiz: `../`, `%2e%2e/`, `..%2f`, maiúsculas codificadas, barra invertida e `%5c`, `docs/../../..`, sem projeto, absolutos codificados, UNC codificado e pasta irmã;
  - o que segue dentro: `../assets` de `docs/`, relativo simples e Windows sem diferenciar maiúsculas;
  - a escolha da raiz: projeto mais específico, fora de projeto, prefixo de nome.
- **`MarkdownContent.test.ts`:** renderizado, `../assets/logo.png` vira `file:///home/p/proj/assets/logo.png` com a raiz do projeto, nada de `segredo` vira `file:`, e sem projeto `../assets` já fica de fora.
- **Teste antigo ajustado:** "resolve subida de diretório" passa a informar a raiz do projeto.
- **Antes da correção**, os testes novos falharam (`expected 'file:///x.png' to be undefined`).
- **Mutações:** sem a checagem de raiz, 1 teste falha; com a imagem ignorando o `imageRoot`, 1.
- **Gates:**
  - `npm test`: 3355 testes, 3345 passam, 10 pulados, 0 falham;
  - `vitest`: 3527 passam;
  - `eslint .` e `tsc -b` limpos.

**Não validado.** O bloco de arquivo com imagens não foi conferido no app de fonte: o clique sintético em "Criar" não criou o bloco, e abrir um `.md` externo pede o seletor de arquivos nativo. A fiação até a imagem foi conferida no teste de componente; a do `FileNode`, pelo `tsc`.

Estado: concluído (deploy no adendo).

**Adendo de deploy (08:51).** v0.1.564 publicada a partir de `3f2b89b`: CI verde (08:33 → 08:39), Release gate verde (08:39), Release verde (08:39 → 08:49), 20 artefatos (Windows, macOS, Linux .deb e AppImage). O app instalado não foi aberto para conferir a prévia do Markdown.

## 2026-11-16 — Release: o smoke de release confere a CSP do renderer no artefato dos três SOs

Task: Felixo AI Core/Release — validar a CSP do renderer no artefato real dos três SOs pelo release-smoke (Notion `3ea91f95-497e-8166-b6a7-de55f657eb56`), aberta em 29/09 a partir da política única de URL. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 09:33 em diante. Trilha A: a direção estava na task.

**Antes.**
- A CSP só existe no build: uma `<meta>` no `dist/index.html`, que o app instalado abre por `file://` de dentro do asar.
- O `--release-smoke` exercitava o PTY, a entrega de contexto e o npm do pacote, mas não abria o renderer.
- Resultado: nenhuma checagem de CSP rodava sobre o artefato. Uma diretiva faltando ou um hash errado só apareceria no app instalado.

**Medido no Electron 42, com o build.**
- **Sem os handlers de IPC** (o modo de smoke sai antes deles), o React monta: o `BootMarker` liga `data-felixo-app-ready`.
- **Canais:**
  - **`console-message`:** recebe as violações de carregamento de recurso ("Loading the image … violates …") e a do script inline, mas não a de um `eval` recusado. Essa só chega como issue do DevTools e como `securitypolicyviolation`.
  - **Ouvinte posto pelo CDP** (`Page.addScriptToEvaluateOnNewDocument`): entra antes de qualquer script do documento. O CDP só responde depois de a janela ter um documento (`about:blank`); antes disso, o `Log.enable` não voltava.
- **Prova contrária**, com três cópias do `dist` com a CSP estragada; as três reprovam:
  - **hash do script inline trocado:** `script-src-elem inline`;
  - **sem `blob:` no `img-src`:** a sonda `imagemBlob` falha, mais `img-src blob`;
  - **sem a `<meta>`:** o controle positivo inteiro em falso.
- **Worker de fontes do Excalidraw** (`subset-worker.chunk-*.js`): a CSP deixa carregar, mas ele quebra ao rodar com `ReferenceError: document is not defined`. É um defeito do build, fora desta task, e fica em `notes`.

**Feito.**
- **`electron/release-smoke-renderer.cjs` (novo):** abre o `dist/index.html` do pacote numa janela oculta, com as opções e o preload da janela principal.
  - **Isolamento:** sem rede (só `file:`, `data:`, `blob:` e `devtools:` passam), sem navegação e sem `window.open`.
  - **Sondas:** imagem `data:` e `blob:`, o som de notificação, worker `blob:`, `import()` do chunk do Excalidraw e o worker de fontes dele.
  - **Controle positivo:** um `eval` e uma imagem `https:` precisam ser barrados e vistos.
  - **Reprova** com qualquer violação, sonda falha ou boot que não acontece.
- **`electron/release-smoke.cjs`:** roda o passo antes do PTY e grava `rendererCsp` no status. O `scripts/release-smoke.cjs` copia o campo para o relatório e reprova sem ele.
- **Duas correções que a validação no pacote mostrou:**
  - **Smoke derrubado no Windows e no Linux:** destruir a janela oculta disparava o `window-all-closed`, e o app saía no meio do smoke. No CI, a release teria reprovado nesses dois SOs. Agora `shouldQuitWhenAllWindowsClosed` devolve `false` em `--release-smoke`, porque quem encerra é o smoke.
  - **Diagnóstico lotado de ruído:** cada chamada do renderer sem handler imprimia "No handler registered" no stderr, e o diagnóstico guarda só os primeiros 2000 caracteres, o que escondia o erro real. Agora o ruído vira a contagem `ipcSemHandler`, e o `console.error` volta ao original no fim do passo.
- **Docs:** ARQUITETURA ("CSP do renderer") e GUIA-DESENVOLVEDOR (smoke do artefato).

**Validação.**
- **Testes:** 12 em `release-smoke-renderer.test.cjs`, 1 novo em `release-smoke.test.cjs` (reprova antes do PTY) e 1 em `app-lifecycle.test.cjs`, que falhou antes da correção (`AssertionError: win32`).
- **Mutações**, todas pegas:
  - sem o controle positivo;
  - sem as violações da página;
  - sem as do console;
  - sem o boot;
  - sem as sondas;
  - sem o portão em `runPackagedReleaseSmoke`.
  
  A checagem da `<meta>` não decide (vira diagnóstico): sem ela, o controle positivo já reprova, e uma CSP por cabeçalho também passaria.
- **Pacote real do Windows**, com `electron-builder --dir` e `release-smoke.cjs --artifact`:
  - `rendererCsp.ok: true`;
  - seis sondas ok;
  - controle positivo visto nos dois canais;
  - zero violações, em cerca de 1,5 a 2,4 s.
- **Passada manual** no mesmo pacote (`felixo devtools launch --packaged`, perfil isolado): Página Web com `https://example.com` carregada e zero violações no renderer.
- **Gates:**
  - `npm test`: 3369 testes, 3359 passam, 10 pulados, 0 falham. Na primeira rodada, `installer-kill-smoke` falhou por tempo; isolado, passou 3 de 3;
  - `vitest`: 3527 passam;
  - `eslint .` e `tsc -b` limpos.

**Não validado.**
- **macOS e Linux:** só o deploy (smoke da Release) prova.
- **Entrega de contexto local:** o smoke completo local reprova nela. No PowerShell do PTY, `felixo` é uma função do perfil desta máquina, de outro projeto, que tem precedência sobre o shim. O relatório local de 13/10 já reprovava igual.
- **Markdown no app instalado:** a passada manual não cobriu imagem relativa nem `data:`. A criação do bloco de arquivo pela automação não funcionou.
- **Renderização completa do Excalidraw:** só o `import()` do chunk e o worker foram cobertos.

**Ambiente.** O disco J: chegou a 0 bytes livres durante o empacotamento, e o `electron-builder` saiu com código 0 deixando um pacote incompleto. Os empacotamentos foram para o C:.

Estado: concluído (deploy no adendo).

**Adendo de deploy (11:17).** v0.1.565 publicada a partir de `82ae421`: CI verde (10:19 → 10:25), Release gate verde, Release verde. A Release ficou 40 min na fila do GitHub (10:26 → 11:06, com um incidente aberto no status do GitHub) e terminou às 11:14. O smoke de cada SO trouxe `rendererCsp.ok: true`, as seis sondas ok, o controle positivo visto e zero violações: Windows em 1,3 s, Ubuntu em 2,0 s e macOS em 6,5 s. O `ReferenceError` do worker de fontes do Excalidraw apareceu nos três. São 20 artefatos.

## 2026-11-16 — Canvas: as fontes do Excalidraw saem do build e a CSP fica sem host remoto

Task: Felixo AI Core/Canvas — servir as fontes do Excalidraw pelo build e tirar https://esm.sh da CSP (Notion `3ea91f95-497e-8146-ad00-e32071c3366b`), aberta em 29/09 a partir da política única de URL. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 11:43 em diante. Trilha híbrida: uma pergunta ao Felipe ("Todas, com a Xiaolai", em vez da recomendação de deixar a Xiaolai de fora), depois a implementação.

**Antes.**
- Sem `window.EXCALIDRAW_ASSET_PATH`, o Excalidraw buscava as fontes do desenho no esm.sh, e a CSP liberava `https://esm.sh` em `font-src`.
- O `fetch` das mesmas fontes no export batia no `connect-src 'self'`, então o export não embutia a fonte.

**Medido.**
- **Tamanho das fontes (Excalidraw 0.18.1):** 13,1 MB em 234 `.woff2`. A Xiaolai (CJK) tem 12,7 MB; as outras oito famílias somam 0,4 MB. Os instaladores da v0.1.565 têm de 183 a 230 MB.
- **URL das fontes:** o `createUrls` do Excalidraw resolve "/…" e "./…" contra `location.origin`, que sob `file://` é `"null"`. Daí a URL absoluta.
- **Arquivo local sob a CSP:** no renderer do build, `FontFace` e `fetch` de uma fonte local por `file://` funcionam (`loaded`; 200, 2656 bytes).
- **CDN como última URL:** mesmo com o caminho local, o Excalidraw põe o CDN no fim da lista de cada fonte. No app empacotado, a montagem do desenho gerava **230 violações `font-src`**: o Chromium checa a CSP de cada URL ao criar a `FontFace`. As fontes ainda carregavam da URL local, como a armadilha no construtor da `FontFace` e o `load()` mostraram.
- **Export:** a redução da fonte (subset) usa WASM. Como o worker de subset quebra no build, o Excalidraw a faz na thread principal, e a CSP recusa o WASM (`script-src eval`, "Skipped glyph subsetting"). O export embute a face inteira: a Excalifont entrou com 24957 bytes, o arquivo da face tem 24956.

**Feito.**
- **`scripts/excalidraw-fonts.cjs` (novo, com tipos e teste):**
  - lista as fontes do pacote;
  - resolve o pedido de fonte no dev server, sem sair da pasta (`..`, codificado ou não, é recusado);
  - tira do código do Excalidraw o `push` da URL do CDN (`stripExcalidrawCdnFallback`).
- **Plugin `felixo-excalidraw-fonts` no `vite.config.ts`:**
  - **no build:** emite as 234 fontes em `dist/excalidraw-assets/fonts/` e aplica o corte do CDN. O build falha se o trecho não sair exatamente uma vez, ou se não houver fontes;
  - **em dev:** serve a mesma URL direto do `node_modules`.
- **`src/excalidraw-asset-path.ts`:** o `main.tsx` define `window.EXCALIDRAW_ASSET_PATH` com a URL absoluta antes do render, e o chunk do Excalidraw é preguiçoso.
- **CSP:** `font-src 'self' data:`. O teste agora exige que nenhuma diretiva libere origem de rede, inclusive host sem esquema.
- **Smoke de release:** sonda `fonteExcalidraw`. O caminho dado ao Excalidraw precisa ser local e absoluto, e uma Excalifont do build carrega por `FontFace` e por `fetch`.
- **Inventário:** sai a lacuna desta task e entra a do export sem subset, apontando para a task do worker de fontes. Também a ARQUITETURA.

**Validação.**
- **Testes:**
  - 6 em `excalidraw-fonts.test.cjs`, incluindo um que confere que toda fonte pedida pelo código do pacote existe no build e um que roda o corte no código instalado;
  - 4 em `excalidraw-asset-path.test.ts`;
  - o teste da CSP falhou antes da mudança (`font-src libera origem de rede`);
  - a sonda do smoke (12 testes).
- **Prova contrária e mutações:**
  - **padrão do CDN quebrado:** o `vite build` falha ("a URL do CDN saiu 0 vez(es) … esperava 1") e 2 testes falham;
  - **`dist` sem as fontes:** a sonda reprova ("fonte não encontrada");
  - **build sem a linha do `main.tsx`:** a sonda reprova ("caminho: undefined").
- **Pacote real do Windows** (`electron-builder --dir`, saída no C:): o `app.asar` passou de 285,0 para 298,2 MB (+13,2 MB). O `rendererCsp` do smoke saiu `ok`, com `fonteExcalidraw: ok` e zero violações.
- **App empacotado** (`felixo devtools --packaged`, perfil isolado, CSP do pacote):
  - **montagem do desenho:** 232 `FontFace`, todas com a URL `file://…/app.asar/dist/excalidraw-assets/fonts/…`, nenhuma com CDN e zero violações;
  - **texto "Olá mundo 你好":** carregou a Excalifont (faixa latina) e duas faixas da Xiaolai;
  - **"Copy to clipboard as SVG":** SVG de 147 KB com 3 `@font-face` em `data:` (Xiaolai ×2, Excalifont), sem CDN e sem `file://`. Uma violação `script-src eval` veio do WASM do subset, como medido acima.
- **Dev** (`felixo devtools`, servidor do Vite): a rota `/excalidraw-assets/fonts/…` responde 200 `font/woff2`, e 230 faces usam essa URL primeiro.
- **Build:** ler as 234 fontes leva de 20 a 35 ms, e o tempo total do build oscilou de 1,8 a 4,0 s, com e sem a mudança.
- **Gates:**
  - `npm test`: 3375 testes, 3365 passam, 10 pulados, 0 falham;
  - `vitest`: 3531 passam;
  - `eslint .` e `tsc -b` limpos.

**Não validado.**
- **Rede desligada de verdade:** não desliguei a rede da máquina. O que vale como prova é a CSP sem host remoto mais as URLs locais medidas, além do smoke, que cancela todo request fora de `file:`.
- **macOS e Linux:** ficam para o smoke da Release.
- **Export PNG:** não foi conferido; só o SVG.

**Ambiente.** O disco J: segue com cerca de 480 MB livres. O `emptyOutDir` do Vite não apaga nesse disco, então os `dist` anteriores foram movidos para o C:.

Estado: concluído (deploy no adendo).

**Adendo de deploy (12:41).** O primeiro CI (`183c301`, 12:12 → 12:19) reprovou no Validate do Ubuntu x64 e do macOS. O teste do dev server esperava que `..%5c..%5c` fosse recusado, mas no POSIX a barra invertida é nome de arquivo, e o resultado mudava conforme o SO. A correção `427f7e9` aceita só a forma `<Família>/<arquivo>.woff2` antes de qualquer operação de caminho e testa com `path.posix` e `path.win32`; o teste falhou antes da correção. Com ela, CI verde (12:22 → 12:28), Release gate verde e Release verde (12:29 → 12:39), publicando a **v0.1.566**. O smoke de cada SO saiu com `fonteExcalidraw: ok` e zero violações (Windows 1,3 s, Ubuntu 1,3 s, macOS 3,2 s). Instaladores contra a v0.1.565: exe +12,8 MB (+6,9%), dmg +12,6 MB (+5,8%), deb +12,5 MB (+6,8%), AppImage +12,5 MB (+5,4% e +5,5%).

## 2026-11-16 — Terminal: regex própria para os links em texto plano, com teste diferencial contra o portão

Task: Felixo AI Core/Terminal — trocar a regex do WebLinksAddon por uma própria com teste diferencial destacado ⇒ aprovado (Notion `3ea91f95-497e-81df-93af-f88d506b52b7`), aberta em 29/09 a partir da política única de URL. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 12:52 em diante. Trilha A: a direção e os casos estavam na task.

**Antes.**
- O `WebLinksAddon` (0.12.0) usava a `strictUrlRegex` padrão. Ela cortava `…/wiki/Rust_(programming_language)` em `Rust_`, e o clique abria a página errada.
- O esquema dela era `(https?|HTTPS?)`, então `Https://` não era destacado.
- O provedor de URLs quebradas em várias linhas (`terminal-spanning-url-links.ts`) tinha uma terceira regra, só em minúsculas, com corte de pontuação à mão.

**Medido.**
- **Como o addon decide o link:** o `LinkComputer` usa `match[0]` inteiro como link, a única checagem é o `isUrl`, e as flags da regex passada são mantidas (mais `g`). Não há como pós-processar o trecho: a regex sozinha precisa produzir o link certo.
- **IDN:** o `isUrl` compara o texto com o host em punycode, então um host IDN (`https://münchen.de`) nunca é destacado, com qualquer regex.
- **O portão** (`isAllowedTerminalExternalLink`) recusa usuário na autoridade, invisível e controle. Destacar só o pedaço antes do caractere abriria outro host.
- **Backtracking:** em linhas de 10 mil caracteres, os 11 padrões patológicos levaram de 0,0 a 1,2 ms; com 1 MB, no máximo 27 ms. É linear.

**Feito.**
- **`terminal-url-regex.ts`, com `TERMINAL_URL_REGEX`:**
  - esquema sem diferenciar caixa;
  - `( )` e `[ ]` só em par (um nível), o que cobre a Wikipedia e o IPv6;
  - aspas ASCII e tipográficas (`\p{Pi}`/`\p{Pf}`), colchetes de qualquer escrita (`\p{Ps}`/`\p{Pe}`), crase, `<>`, `\`, `^` e `|` encerram a URL;
  - a pontuação final (`.,:;!?*`, `…` e a de largura cheia) fica fora do link;
  - dois lookaheads impedem o destaque de URL com usuário na autoridade ou com controle/invisível.
- **Montagem:** a regex é montada a partir do `.source` de literais com `String.raw`, sem escapes `\u`/`\x`.
- **Uso:** o store passa a regex ao `WebLinksAddon` (`urlRegex`), e o provedor de várias linhas usa a mesma, sem o corte de pontuação próprio.
- **Docs:** ARQUITETURA (links no terminal) e o teste novo no inventário do bloco Terminal.

**Validação.**
- **`terminal-url-regex.test.ts`** roda o `WebLinksAddon` de verdade num terminal falso de uma linha (o provedor que ele registra roda o próprio laço, o `isUrl` e o mapeamento de posição):
  - tabela com 24 casos (Wikipedia, `(…)`, `Https://`, Markdown, aspas, `<>`, `[]`, pontuação, IPv6, negrito, CJK, unicode no caminho, aspas tipográficas, largura cheia, `#!`, `@` no caminho, usuário, invisível, RTL e esquemas não web);
  - o inverso: cada URL esperada é aprovada pelo portão;
  - o diferencial com 3000 linhas geradas por semente fixa: mais de 1000 destaques, todos aprovados pelo portão e iguais ao que ele abriria;
  - os 7 padrões patológicos com menos de 200 ms (medidos em cerca de 1 ms);
  - a trava no teste do store (`_options.urlRegex`);
  - um caso novo no provedor de várias linhas (`Https://` quebrado, usuário na autoridade).
- **Antes da mudança:**
  - com a regex padrão do addon, 14 dos 34 testes de tabela/diferencial falham;
  - a trava do store falhou (`expected undefined`);
  - o caso novo do provedor de várias linhas falhou com a versão antiga dele.
- **Mutações**, uma por regra, todas pegas:
  - sem a regra do usuário: 4 falhas;
  - sem a do invisível: 2;
  - sem parênteses no meio: 1;
  - pontuação no fim: 8;
  - esquema com caixa: 2.
- **App de fonte** (`felixo devtools`, terminal "Nenhum (shell)"), com `echo` das URLs da task e mouse simulado sobre elas. O xterm sublinhou:
  - `https://en.wikipedia.org/wiki/Rust_(programming_language)` inteira, sem o ponto;
  - `Https://Example.com/A`, atravessando a quebra de linha;
  - `https://x.com/b`, sem o `(` e o `).`.
- **Gates:**
  - `npm test`: 3376 testes, 3366 passam, 10 pulados, 0 falham;
  - `vitest`: 3566 passam;
  - `eslint .` e `tsc -b` limpos.

**Não validado.**
- **Host IDN:** continua sem destaque (limite do `isUrl` do addon, do lado seguro).
- **Aspas dentro da query** (`?q='a'`): encerram a URL, por escolha. O destaque vai só até a aspa.
- **Dica e menu do clique:** não foram conferidos no app, só o sublinhado. Eles não mudaram nesta task.

Estado: concluído (deploy no adendo).

**Adendo de deploy (13:30).** v0.1.567 publicada a partir de `091a48b`: CI verde na primeira tentativa (13:11 → 13:17, os quatro Validate e o smoke do canvas), Release gate verde e Release verde (13:18 → 13:28) nos três SOs. A mudança é de comportamento no renderer: o smoke de release não exercita o destaque de links do terminal.

## 2026-11-16 — Arquitetura: o renderer empacotado passa a carregar por app:// (decisão e implementação)

Task: Felixo AI Core/Arquitetura — avaliar um protocolo próprio (app://) no lugar de file:// para o renderer (Notion `3ea91f95-497e-81e5-a47c-cdad5bfe38d2`), aberta em 29/09 a partir da política única de URL. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 13:49 em diante. Trilha B: prova de conceito medida, depois três perguntas ao Felipe. As respostas foram:
- "Fazer agora, nesta task" (a recomendação era uma task própria);
- "Copiar uma vez e manter a antiga";
- "Rota no processo principal".

**Prova de conceito** (script no Electron 42, renderer do build):
- **`file://`:** um `<script src="file:///…">` de outra pasta do disco **executou**, e imagem e `fetch` de fora do build carregaram.
- **`app://felixo`:** os três foram bloqueados, e o *traversal* pela página deu 404.
- **Boot até o app pronto:** 93 ms com `file://` e 89 ms com `app://` (mediana de 8); numa segunda rodada, 88 e 95 ms. Sem diferença.
- **Smoke de CSP sob `app://`:** as sete sondas ok, o controle positivo visto e zero violações.
- **Armazenamento:** a origem nova começa vazia (cerca de 30 chaves de `localStorage`, sem IndexedDB). A migração medida copiou 4 chaves em 146 ms e devolveu o tema.
- **Imagem relativa do Markdown:** `file://` é bloqueado sob `app://`.

**Feito.**
- **`electron/core/app-protocol.cjs` (novo):**
  - esquema `app` privilegiado (`standard`, `secure`, `supportFetchAPI`, `stream`), registrado antes do `ready`;
  - handler que serve só o `dist`, conferindo o caminho resolvido contra a raiz;
  - rota `__imagem-local?caminho=…`, autorizada pelo `text-file-access` e com imagem raster exigida também no destino real;
  - página vazia `__migracao-origem`;
  - arquivo ilegível vira 404.
- **`text-file-access.authorizeImageNear`:** projeto registrado ou pasta (e subpastas) de um arquivo escolhido no seletor, pelo caminho real. É a mesma raiz que o renderer usa e fecha o symlink/junção para fora.
- **`renderer-origin-migration.cjs` (novo):** copia o `localStorage` da origem `file://` para `app://felixo` uma vez, antes da janela principal, sem sobrescrever e mantendo a cópia antiga. O marcador `origem-app-migrada.json` só é gravado no fim; se falhar, o app tenta de novo no próximo início.
- **`main.cjs`:** registro do esquema, handler no começo do `whenReady` (antes do smoke) e migração antes da janela principal.
- **`main-window`:** `loadURL('app://felixo/index.html')`.
- **`navigation-guard`:** reconhece o documento `app://` (as rotas internas não).
- **CSP:** sem `file:` no `img-src`.
- **Renderer:** a imagem relativa do Markdown monta a rota `__imagem-local` no lugar de `file://`.
- **Smoke de release:** abre o renderer por `app://` (`rendererUrl`) e deixa `app:` passar no filtro de rede.
- **Duas falhas que só o pacote mostrou, corrigidas:**
  - o app saía com código 0 logo depois de migrar: as janelas ocultas fechavam antes da principal existir. Agora `shouldQuitWhenAllWindowsClosed` não encerra antes da janela principal;
  - o `statSync` dentro do asar imprimia DEP0180 no stderr do smoke. Agora é `existsSync`, e um `fetch` que falha vira 404.
- **Docs:** ARQUITETURA, com a seção "Protocolo app:// do renderer" (decisão, medições, o que mudou e a migração), mais a CSP e as imagens do Markdown; GUIA-USUARIO.

**Validação.**
- **Testes novos ou alterados:**
  - **`app-protocol.test.cjs`:** 10 testes, com *traversal* em `path.posix` e `path.win32`, a autorização da imagem, a página de migração, o 404 de fetch e uma trava estática da ordem no `main.cjs`;
  - **`text-file-access`:** 3 testes de imagem (projeto, pasta do arquivo escolhido, link para fora, raiz do disco);
  - **`renderer-origin-migration`:** 4 testes, com o script de cópia rodando num `vm`;
  - **`navigation-guard`:** 1 teste;
  - **`app-lifecycle`:** 1 teste, que falhou antes;
  - **CSP:** 1 teste, que falhou antes (`img-src libera file:`);
  - **Markdown:** a rota e a recusa de `app://` escrito à mão;
  - **smoke:** com `rendererUrl`.
- **Mutações**, rodadas uma por vez com restauração por cópia:
  - `dist` sem limite: 4 falhas;
  - destino sem checar: 1;
  - migração que sobrescreve: 1;
  - pasta na raiz do disco: 0. É redundante, porque o `isPathInside` já recusa uma raiz, a mesma defesa do `authorize`.
- **Integração no Electron real com os módulos reais:**
  - migração de 3 chaves em 244 ms, e a segunda chamada responde "feita";
  - app pronto por `app://felixo` com o tema migrado aplicado;
  - imagem: dentro do projeto carrega; fora, junção para fora, `.md` e `file://` direto são recusados; depois de escolher o `.md` de fora, a imagem da pasta dele carrega.
- **Pacote real do Windows** (`electron-builder --dir`):
  - smoke com `rendererCsp.ok` sob `app://` (sete sondas, zero violações);
  - o app abre por `app://felixo/index.html` e não sai depois da migração (157 a 201 ms com perfil vazio);
  - a Página Web carrega `https://example.com` sem violações;
  - registrar projeto pela página exige o seletor nativo, então no pacote só as recusas da rota foram vistas.
- **Gates:**
  - `npm test`: 3397 testes, 3387 passam, 10 pulados, 0 falham. Numa rodada intermediária, o teste do Openia falhou por tempo; isolado, passou 2 de 2;
  - `vitest`: 3569 passam;
  - `eslint .` e `tsc -b` limpos.

**Erro de procedimento meu, corrigido.** Na primeira rodada de mutações, restaurei os arquivos com `git checkout --`. Em arquivo novo isso não faz nada, e num arquivo já versionado volta ao HEAD: o `authorizeImageNear` foi apagado, e duas mutações ficaram no código. Os três arquivos foram consertados e as mutações refeitas com cópia de segurança.

**Não validado.**
- **macOS e Linux:** ficam para o smoke da Release.
- **Migração com o perfil real de uso:** feita com perfis de teste.
- **Rota de imagem com um projeto de verdade dentro do pacote:** o seletor nativo não é automatizável.
- **Volta a `file://`:** não exercitada, embora a cópia antiga seja mantida.

Estado: concluído (deploy no adendo).

**Adendo de deploy (14:51).** O CI de `e8da885` reprovou na primeira tentativa (14:28 → 14:39) só no teste nativo de PTY do Windows ("consulta o /status do Claude por PTY nativa e navega até Usage", a navegação não atravessou a PTY em 356 ms). Esse teste não é tocado por esta task; na segunda tentativa, só do job que falhou, ficou verde. Release gate verde e Release verde (14:39 → 14:48), publicando a **v0.1.568**. O smoke de cada SO, com o renderer aberto por `app://felixo`, saiu com `rendererCsp.ok: true`, as sete sondas ok e zero violações: Windows em 1,5 s, Ubuntu em 1,9 s e macOS em 4,3 s.

## 2026-11-16 — Build: o dist local fica só com o que o build gravou (o rmSync do Node 25 não apagava em caminho com acento)

Task: Felixo AI Core/Build — limpar os chunks órfãos de dist/assets antes de empacotar (Notion `3ea91f95-497e-8114-b945-e2f8d1d3e604`), aberta em 29/09 a partir da política única de URL. Agente: Resolver hotfix (Claude Code, Claude Opus 5.5), 15:13 em diante. Trilha A: a direção estava na task.

**Causa medida.**
- **O defeito:** no Node 25.3.0 (o desta máquina), `fs.rmSync`, em arquivo ou em pasta com `recursive` e `force`, volta **sem erro e não apaga** quando o caminho tem caractere fora do ASCII no Windows.
- **Não é o disco J:** no C:, numa pasta `ação-…`, o `rmSync` também falhou; no J:, numa pasta só ASCII, ele apagou. A memória anterior ("rmSync não apaga em J:") apontava a causa errada e foi corrigida.
- **O que funciona:** `unlinkSync`, `rmdirSync` de pasta vazia e `fs.promises.rm`.
- **Quem não tem o defeito:** o Node do Electron 42 (24.19) e o do CI (22). O produto não é afetado, e o CI, com checkout limpo e caminho ASCII, nunca viu o problema.
- **Consequências nesta máquina** (checkout em "Programação\…\Repositórios"):
  - o `emptyOutDir` do Vite (que usa `rmSync`) nunca limpou o `dist`: hoje cedo `dist/assets` tinha 9194 arquivos, e o pacote local de 21/10 levava 1282 assets, com 7 `index-*.js` e 7 chunks do `ExcalidrawCanvas`;
  - o `bundle-npm-runtime` não apagava o runtime anterior, e o `cpSync` por cima falhava com "The operation completed successfully". Foi isso que me fez afastar o `build/npm-runtime` à mão em todos os empacotamentos de hoje.

**Feito.**
- **`scripts/build-output.cjs` (novo, com tipos e teste):**
  - `removeTreeSync` apaga arquivo ou árvore com `unlinkSync`/`rmdirSync`, sem seguir link, e **lança se algo ficou**;
  - `findStaleOutputFiles` e `removeStaleOutput` apagam o que não está no bundle nem na `public` (pela lista exata do bundle, não por busca de nome) e podam as pastas vazias.
- **Plugin `felixo-clean-build-output` no `vite.config.ts`:** no `writeBundle`, deixa no `dist` só o que este build gravou e o que veio da `public`, e informa quantas sobras tirou. Se uma sobra resistir, o build falha.
- **`bundle-npm-runtime.cjs`:** usa `removeTreeSync` no lugar do `rmSync`.
- **Docs:** GUIA-DESENVOLVEDOR (o porquê e a regra "não use `rmSync` em caminho do repositório") e ARQUITETURA (build).

**Validação.**
- **Teste que falhou antes:** `bundle-npm-runtime`, com o destino numa pasta acentuada e uma sobra do runtime anterior. Falhou exatamente com "The operation completed successfully" no `cpSync`; passa depois.
- **`build-output.test.cjs`:** 5 testes, em caminho com acento:
  - remoção de árvore;
  - link apagado sem apagar o destino;
  - `fs` mudo que não apaga e precisa fazer lançar;
  - sobras achadas e removidas, com o emitido e a `public` mantidos e a pasta vazia podada;
  - `dist` inexistente.
- **Mutações**, restauradas por cópia: sem a conferência final, apagando a `public`, sem podar pastas e o runtime de volta ao `rmSync`. Cada uma faz 1 teste falhar.
- **Dois builds seguidos, com sobras plantadas** (chunks com outro hash, uma fonte antiga e uma pasta):
  - **sem o plugin**, com uma cópia do config: as 4 sobras ficaram (529 arquivos);
  - **com o plugin:** "4 arquivo(s) de builds anteriores removido(s)" (525 arquivos);
  - **segundo build:** nada a remover (525).
- **Pacote local** (`electron-builder --dir`, sem afastar o `npm-runtime` à mão e com uma sobra plantada nele):
  - o empacotamento passou, e a sobra sumiu do `build` e do pacote;
  - o `app.asar` tem exatamente os 525 arquivos do `dist`, com um `index-*.js`, e mede 298 MB (o de 21/10 tinha 333 MB, sem as fontes do Excalidraw).
- **Gates:**
  - `npm test`: 3403 testes, 3393 passam, 10 pulados, 0 falham;
  - `vitest`: 3569 passam;
  - `eslint .` e `tsc -b` limpos.

**Não validado / fora do escopo.**
- **Outros scripts do repositório** usam `fs.rmSync` em pastas do repositório (por exemplo, a evidência do `canvas-smoke` e benchmarks) e também não apagam nesta máquina. Ficou uma task.
- **`dist` antigo:** o que afastei de manhã (`app/release/dist-antigo-1116`, 435 MB) continua lá; é sobra de build, que pode ser apagada.

Estado: concluído (deploy no adendo).

**Adendo de deploy (15:44).** v0.1.569 publicada a partir de `7dbf9a4`: CI verde na primeira tentativa (15:26 → 15:32), Release gate verde e Release verde nos três SOs (15:32 → 15:41). No checkout limpo do CI, o plugin não teve nada a remover (nenhuma mensagem `[build-output]`), e os instaladores ficaram do mesmo tamanho da v0.1.568: a mudança vale para o build local.

---

## 2026-11-17 — Release gate: a lista vazia da API do GitHub deixa de virar "publicar"

**Contexto.** Em 22/10 o gate publicou duas vezes sem necessidade porque a listagem do Actions voltou vazia (exit 0, sem erro) e vazio vira "sem base: publica". Desde 05/11 o gate lê as releases publicadas (`gh release list`) e os `release.yml` em andamento, e as duas chamadas escondiam o erro com `2>/dev/null || true`.

**O que mudou.**
- **`release-base.sh`:** nova `release_listar <exigir> <comando...>`, com o `gh` injetável. Repete (5 tentativas, 5 s, ajustáveis por `GATE_TENTATIVAS`/`GATE_ESPERA`) até vir não vazia quando `exigir=1`, ou só até o comando não falhar quando `exigir=0`. Esgotadas, devolve o que veio e o gate publica na dúvida. O motivo de cada tentativa ruim vai para o log do gate. Não derruba o passo sob `set -e`.
- **`release-gate.yml`:** as releases publicadas usam `exigir=1` (vazio nunca é legítimo: o repositório tem releases); as runs em andamento usam `exigir=0` (vazio é o normal, e repetir somaria 25 s a cada push).
- **`release-base.test.sh`:** 6 casos com `gh` falso (vazio, vazio e depois a lista; vazio sempre; falha e depois sucesso; vazio aceito; limite de tentativas).
- **GUIA-DESENVOLVEDOR:** a regra de repetição.

**Validação.** `release-base.test.sh`: todos passam (antes, `release_listar` nem existia). Com `bash -e`, uma listagem que falha sempre não mata o shell. Workflow valida como YAML. Nenhum arquivo release-relevante foi tocado, então este commit não publica. Não validado em produção: depende do próximo push observar o log do gate.

---

## 2026-11-17 — Limites: remover conta com login próprio não derruba mais a lista

**Contexto.** Achado na task do refresh por conta: "Remover" numa conta de perfil (login próprio) fazia o `removeAccount` lançar `UNIQUE constraint failed: agent_usage_accounts.id` e todo `list()` seguinte também, deixando o painel de Limites e o modal do chat sem carregar.

**Causa.** `archiveAccount` só preenche `archived_at` (a linha fica com o mesmo id). `list()` roda `ensureDiscoveredAccounts`, que não vê o perfil entre as contas ativas e faz `INSERT` com o id do perfil, já ocupado pela linha arquivada.

**Feito (só a parte técnica).**
- `agent-usage-repository.cjs`: `isAccountArchived(id)`.
- `agent-usage-service.cjs` (`ensureDiscoveredAccounts`): não recria conta de perfil cujo id está arquivado. Efeito: a conta removida fica escondida enquanto o perfil existir. Cobre também o caminho do `mergeAccountIds`, que arquiva do mesmo jeito.
- Teste novo em `agent-usage-refresh-account.test.cjs`: remover conta de perfil e chamar `list()` duas vezes. Falhava com o UNIQUE antes; passa depois.

**Em aberto (decisão do Felipe).** O que o botão "Remover" faz numa conta de perfil: A) sair do botão nessas contas (recomendado), B) reativar com histórico zerado, C) dispensar com opção de desfazer. O texto do `window.confirm` e o `GUIA-CONTAS-E-LIMITES.md` só mudam depois da escolha.

**Validação.** `node --test` da área 14/14; `run-node-unit-tests` 3392 passam, 0 falham; `vitest` 3569 passam; lint e typecheck limpos. Não reproduzido no app real.

---

## 2026-11-17 — Canvas: `felixo canvas ler` passa a ler os terminais de agente

**Contexto.** A leitura de um bloco de terminal respondia "Terminal sem saída registrada ainda." para qualquer terminal do canvas, inclusive com 40 minutos de saída na tela. Conferido de novo no app empacotado em 17/11/2026, em um bloco de agente aberto: mesma resposta.

**Causa.** A leitura procurava a saída no log do chat legado (`terminalLogStore`), que o PTY do canvas nunca alimenta, e comparava com o id puro do bloco, enquanto o PTY usa `canvas:<id>`. O teste existente passava com um dublê (`sessionId: 't1'`) que o caminho real não produz.

**O que mudou.**
- `PtyProcessManager.readOutput(sessionId)`: devolve o buffer de replay (até 200.000 caracteres) e o tamanho do PTY.
- `terminal-screen-text.cjs` (novo): renderiza essa saída no `@xterm/headless`, no tamanho real do PTY, e devolve o texto da tela, com a rolagem; em tela alternativa vale o que está visível. Sob demanda, nunca a cada pedaço de saída.
- `canvas-agent-read.cjs`: o terminal é lido primeiro do PTY (`canvas:<id>`); o log do chat legado fica como alternativa. Limite de 200 linhas e redação de segredos como antes. Nota e arquivo não mudaram.
- `main.cjs` passa o gerenciador de PTY ao handler; a skill `ler-elementos-do-canvas` documenta o limite (só o que está no buffer de replay).

**Validação.**
- Testes novos com o `PtyProcessManager` real e id `canvas:<id>` (tela normal com ANSI e segredo, tela alternativa, PTY ausente): 2 falham com o código antigo (conteúdo vazio) e os 3 passam depois.
- Não coberto: o passo no smoke do canvas (fica com o orquestrador) e a leitura do arquivo em disco além do buffer.

---

## 2026-11-17 — Limites: o Remover sai das contas com login próprio (decisão do Felipe)

**Decisão.** Em 17/11/2026 o Felipe escolheu a opção "Tirar o botão" para a task do UNIQUE: o Remover não aparece em conta com login próprio (cadastrada em *Conta por terminal*, `ownLogin`), só em conta cadastrada à mão. O `window.confirm` ("o perfil de login dos terminais não será alterado") passa a valer só para estas.

**Feito.** `canRemoveAgentUsageAccount` em `agent-usage.ts` (`!account.ownLogin`); o `AccountRow` só desenha o botão quando ela é verdadeira. O guarda do `ensureDiscoveredAccounts` (id arquivado não é recriado) fica para os caminhos que ainda arquivam por id (`mergeAccountIds`); o comentário `shortcut:` foi reescrito. `GUIA-CONTAS-E-LIMITES.md` atualizado. Teste novo em `agent-usage.test.ts`: conta de perfil sem a ação, conta manual com ela.

**Validação.** lint e typecheck limpos; `run-node-unit-tests` 3392 passam, 0 falham; `vitest` 3570 passam. App real (`felixo devtools`) não aberto.

---

## 2026-11-17 — Canvas: a nota volta a ser papel claro nos três temas

**Contexto.** No tema escuro (o padrão) o texto da nota saía quase preto (`#151515`) sobre o fundo escuro do cartão (`rgb(12,12,14)`), contraste perto de 1:1.

**Causa.** `.felixo-canvas-card` (`index.css`, fora de camada) define `background: var(--f-surface-panel)` e vence o `bg-[#...]` do Tailwind em `note-colors.ts`. O texto seguia o papel claro, o fundo não.

**O que mudou.**
- `note-colors.ts`: o papel vai na variável `--note-paper` (`[--note-paper:#ede9e0]`, etc.) em vez de `bg-[#...]`; placeholder de `black/35` para `black/60`; comentário corrigido. As chaves de `NoteColor` não mudaram.
- `index.css`: `.felixo-canvas-card-note { background: var(--note-paper) }`, depois da regra do cartão; removido o ajuste de placeholder do tema claro, que deixou de ser necessário. O painel de preview Markdown continua com a superfície do tema.

**Validação.** `eslint .` e `tsc -b` limpos; `vitest`: 3569 passam, 4 pulados; testes Node passam (uma execução falhou sob carga e passou na repetição). Contraste calculado à mão: texto `#151515` sobre o papel ~14:1; placeholder preto a 60% ~5,5:1. **Não medido com `getComputedStyle`:** o `felixo devtools launch` não abriu o CDP nesta máquina (2 tentativas).

---

## 2026-11-17 — Canvas: adendo, a nota mantém o papel claro também quando selecionada

A regra `.react-flow__node.selected .felixo-canvas-card` (especificidade 0,3,0, `index.css`) trocava o fundo para o painel escuro com a nota selecionada, justo quando se escreve. Acrescentei `.react-flow__node.selected .felixo-canvas-card-note { background: var(--note-paper) }` logo depois dela (mesma especificidade, vem depois; sem `!important`); a marca de seleção segue na borda e no brilho. Nenhuma outra regra de cartão troca `background` (hover só mexe na borda). Guarda: `note-paper-css.test.ts` lê o `index.css` e confere `--note-paper` nas regras normal e selecionada (jsdom não calcula a cascata); com a regra selecionada trocada por outra declaração, o teste falha. Gate: lint e typecheck limpos, testes Node exit 0.

---

## 2026-11-17 — Windows: o atalho node.cmd lê o caminho acentuado do executável (chcp 65001)

Task: Felixo AI Core/CLI no Windows — corrigir o atalho node.cmd que quebra com acento no caminho do executável (Notion `40091f95-497e-817f-bb30-f571eccd82e5`), achada em 21/10 no smoke do instalador. Agente: subagente da Orquestração (Claude Code, Claude Sonnet 5.5), 09:31 em diante. Trilha A: a direção (A, `chcp 65001`) estava na task.

**Causa.** `createWindowsShim` grava o `.cmd` em UTF-8 e o `cmd.exe` o lê na página de código OEM do console (cp850/cp437). Um acento no caminho do executável (`C:UsersJoão...`) virava "O sistema não pode encontrar o caminho especificado". Vale para `node.cmd` e `npm.cmd`, que saem da mesma função.

**Feito.**
- **`managed-cli-runtime.cjs`:** o atalho agora guarda a página atual (última palavra da saída do `chcp`, em qualquer idioma), roda `chcp 65001` antes da linha do comando, e no fim restaura a página e sai com o código da CLI. `setlocal` evita vazar variáveis para um `cmd.exe` interativo.
- **`installer-kill-smoke.cjs`:** removida a trava `assertShimSafeExecutable` (e o teste dela).
- **Teste real:** `managed-cli-runtime.integration.test.cjs` (no `test:native`) copia o Node para uma pasta com acento, gera o atalho e o chama sob `chcp 850` e `chcp 437`, conferindo saída, código de saída (7) e a página depois da chamada. Teste unitário do texto do atalho em `managed-cli-runtime.test.cjs`.
- **Docs:** CHECKLIST-INSTALADOR-ARVORE-DE-PROCESSOS.

**Validação.**
- **Falhou antes:** com o atalho antigo, os dois testes reais falham com "O sistema não pode encontrar o caminho especificado" (850 e 437); passam depois (2,1 s e 1,3 s).
- **Cenário do instalador em `--source` com o executável numa pasta acentuada** (cópia do node.exe): `cancel` e `timeout` passam, zero sobreviventes. O mesmo cenário em pasta sem acento também passa.
- Pasta temporária acentuada apagada com `removeTreeSync` e conferida (o `rmSync` do Node 25 não apaga).

**Não validado.** Conta de Windows com acento no nome de usuário (só pasta acentuada de laboratório); o app empacotado (o smoke empacotado usa o `app.asar` já construído, com o atalho antigo); a página realmente usada com `windowsHide` sem console (a simulação é por `chcp`); saída das CLIs com acento no terminal do app; o atalho morto no meio (`taskkill`) deixa o console em 65001.

Estado: concluído (commit na branch; deploy pelo orquestrador).

---

## 2026-11-17 — CLI no Windows: adendo do node.cmd (a página de código volta antes de a CLI rodar)

Adendo à entrada "Windows: o atalho node.cmd lê o caminho acentuado do executável (chcp 65001)", por revisão do orquestrador.

**Problema da primeira forma.** O atalho deixava o console em 65001 durante toda a execução da CLI, e portanto também do git, do PowerShell 5.1 e de ferramentas que escrevem bytes OEM e que ela dispara. Era muito além do que a task pedia: só a **leitura** do caminho pelo `cmd.exe` precisava de UTF-8.

**Agora.** O atalho decodifica o caminho sob `chcp 65001`, guarda cada parte do comando numa variável (`FELIXO_EXE0`, e `FELIXO_EXE1` no `npm.cmd`; o `cmd.exe` guarda UTF-16, então a expansão não depende mais da página), **devolve a página anterior antes de executar** e roda `"%FELIXO_EXE0%" ... %*`, saindo com `exit /b %errorlevel%`. A linha que executa não carrega o caminho literal.

**Validação.**
- A sonda do teste real (`managed-cli-runtime.integration.test.cjs`) imprime a página de código durante a execução. Com a forma anterior deu `durante=65001` e o teste reprovou (850 e 437); com a atual dá a página original. A página depois da chamada, a saída e o código de saída (7) continuam conferidos: 2/2 passam sob `chcp 850` e `chcp 437`.
- O teste unitário passou a prender a forma nova: caminho lido sob `chcp 65001`, uma variável por parte (1 no `node.cmd`, 2 no `npm.cmd`), `chcp` de volta antes da linha que executa.
- Cenário do instalador (`installer-kill-smoke.cjs --source`) com o executável numa pasta acentuada: `cancel` e `timeout` passam, zero sobreviventes. Pasta temporária apagada com `removeTreeSync` e conferida.

---

## 2026-11-17 — Canvas smoke: investigação da falha intermitente do F3 no Windows do Nightly

Contexto: a task investigava o Nightly de 22/10 (sessão F, passo F3, "o xterm ficou menor que a gravação (100×50)", 65 colunas). Motivo da entrada: a falha não é do tema claro, é intermitente. Medido: o Nightly voltou a verde em 23/10 com o mesmo código, e a mesma falha se repetiu só em 09/11 (63 colunas, 3 de 3 tentativas), com o Nightly de 10/11 verde na mesma imagem do runner (20261103.629). Em 40 Nightlies o F3 do Windows falhou 2 vezes. Local (Windows, `FELIXO_SMOKE_SESSOES=F FELIXO_SMOKE_TENTATIVAS=1`) a sessão F passou 4 de 4 quando o Electron abriu, com 107 a 122 colunas após maximizar e gaveta de 864 px estável. O que mudou: o `tamanhoDoXterm` do smoke da Leitura devolve também `screenPx`, `charPx`, `drawerPx` e `innerWidth`, só como evidência de falha. Validação: eslint do arquivo limpo e sessão F verde.

---

## 2026-11-17 — System Design: fonte escolhida e reabrir o app provados por teste (migração v3)

Task: Felixo AI Core/System Design — conferir a migração v3 numa instalação com fonte escolhida (André) e depois de reabrir o app (Notion `3f491f95-497e-8164-b757-d27353370893`). Continuação da entrada de 09/10 (commit `79768240`), que só viu a fonte padrão.

**Motivo.** Uma migração que trocasse a fonte escolhida pelo padrão faria os agentes seguirem outro guia sem aviso. A instalação do André (fonte escolhida) e o reinício do app do Felipe só se conferem nas máquinas deles; daqui deu para provar o caminho de código.

**Leitura do código.** `loadState` (`system-design-ipc-handlers.cjs`) só regrava a config quando `JSON.stringify(raw) !== JSON.stringify(config)`. `migrateStoredConfig` mantém `custom` quando há ao menos um guia válido em `customSources` e devolve a v3 na mesma forma que grava; logo uma v3 já gravada nunca é tocada e uma v1/v2 é gravada uma vez e depois fica estável.

**Feito.** Teste novo em `system-design-ipc-handlers.test.cjs` (v2 e v3 com fonte escolhida, SQLite real): continua `custom`, `origin: custom`, URL dela, rótulo diferente do Felixo; "reabre o app" (novos handlers no mesmo banco) e relê duas vezes sem mudar `updated_at` (uma v3 com `2026-10-09T15:04:14Z` mantém exatamente esse valor).

**Validação.** `node --test` do arquivo: 27 passam, 1 ignorado (link simbólico no Windows), 0 falham.

**Não validado.** A instalação real do André e o reinício real do app do Felipe (passos humanos na task): ver `updated_at` da `system-design.config` e o selo "escolhida por você" em Configurações → System Design.

Estado: concluído do lado do código; conferência nas máquinas fica manual.

---

## 2026-11-17 — Release: guia de assinatura e notarização (nada ligado)

- Contexto: o app do macOS sai com assinatura ad-hoc (o Gatekeeper rejeita) e o instalador do Windows sem assinatura. Assinar exige conta Apple (US$ 99/ano) e SignPath ou certificado de CA.
- Decisões do Felipe: publicador pessoa física; Windows só se desse sem cadastro (não dá, todo caminho exige); smoke exigente só depois de assinar.
- O que mudou: `docs/guias/GUIA-ASSINATURA-DE-RELEASE.md`, com o passo humano, os secrets com nome exato e o diff pronto do electron-builder e do `release.yml`. Nenhuma configuração ativa, porque `hardenedRuntime` sem certificado muda o app.
- Validação: só documentação; nenhum teste rodado.

---

## 2026-11-17 — Ditado/macOS: entitlement de microfone para build assinada

**Contexto:** a task de validação do ditado no macOS empacotado só fecha com um Mac. Conferido daqui: `NSMicrophoneUsageDescription` presente (`mac.extendInfo`), pedido de permissão correto (`speech:request-microphone` chama `askForMediaAccess('microphone')` só no darwin; `useDictation` pede quando `not-determined`).

**Motivo:** `package.json` não tem `identity: null`; a build de release não é assinada por `CSC_IDENTITY_AUTO_DISCOVERY: false` (release.yml). Mas um `dist:mac` num Mac com certificado no chaveiro assina com hardened runtime (padrão do electron-builder) e o plist padrão dele não traz `com.apple.security.device.audio-input`: o macOS negaria o microfone sem mostrar o diálogo.

**O que mudou:** `app/installer/entitlements.mac.plist` (padrão do electron-builder + audio-input), apontado por `mac.entitlements` e `mac.entitlementsInherit`; teste-guarda em `macos-microphone-packaging.test.cjs`; ARQUITETURA.md atualizada. Sem efeito nas builds atuais (não assinadas).

**Validação:** teste novo falha sem as chaves no `package.json` e passa com elas (2/2); lint e typecheck limpos; node 3396 pass/0 fail; vitest 3572 pass. Diálogo do sistema e os oito itens do roteiro seguem sem conferência no macOS.

---

## 2026-11-17 — Performance: roteiro e coletor para validar o baseline no notebook físico

**Contexto:** a comparação do Modo Performance com `b9e3555` passou os três limites, mas só em Microsoft Basic Render Driver (software) com CPU simulada. A validação no notebook físico de referência segue aberta e depende de hardware.

**O que mudou:** `docs/performance/PERFORMANCE.md` ganhou o roteiro com os comandos exatos (worktree do baseline, `vite build`, os dois `ui-render-performance.cjs`, junção). Novo `app/scripts/ui-render-compare.cjs` junta os dois JSONs em `validacao.json` + `validacao.md` com hardware, driver, backend, medianas, rodadas e veredito (`aprovado`, `reprovado` ou `invalido`). É `invalido` com renderer de software, config diferente entre os builds ou toggles incompletos.

**Validação:** `node --test scripts/ui-render-compare.test.cjs` 3/3 e `eslint` limpo. Nenhum benchmark foi rodado (máquina carregada e não é o notebook de referência). Status MANUAL: falta executar o roteiro no notebook.

---

## 2026-11-17 — Retomada: job de CI manual que empacota sem publicar e roda o E2E com o Claude real nos três SOs

**Contexto.** O E2E da retomada no app empacotado só tinha sido feito à mão no Windows (30/09). O único job que empacota nos três SOs é o `release.yml`, que publica. Decisão do Felipe: usar a credencial da conta, só disparo manual.

**O que mudou.**
- `.github/workflows/retomada-e2e-empacotado.yml`: só `workflow_dispatch`, `permissions: contents: read`. O job `secret` falha em segundos se `CLAUDE_CODE_OAUTH_TOKEN` estiver vazio. A matriz ubuntu/macos/windows empacota com `electron-builder --dir --publish never`, instala o Claude Code em pasta isolada (`CLAUDE_CONFIG_DIR` próprio), roda o E2E (no Linux sob `xvfb-run`) e publica capturas e `cartoes.json`.
- `app/scripts/retomada-e2e-empacotado.cjs` (+ teste): marca onboarding e confiança da pasta no `.claude.json`, grava duas conversas datadas de 3 e 1 dia atrás, semeia cinco cartões (ausente, no disco, projeto movido, conta removida, Gemini) e confere os desfechos por `felixo devtools --packaged`.
- Secret: token OAuth (`claude setup-token`), não chave de API. O app tira a variável só de cartões com conta própria; o E2E usa cartões sem conta.
- `release-relevant.test.sh`: o workflow e o script novos não publicam versão (casos fixados). Nenhuma regra mudou.
- `GUIA-DESENVOLVEDOR.md`: seção com o passo de cadastrar o secret.

**Validação.** YAML carregado (só `workflow_dispatch`); teste do script 4/4; `release-relevant.test.sh` verde; eslint limpo nos arquivos novos; `run-node-unit-tests` 3398/3411 com uma falha instável de benchmark (`pty-output-path-benchmark`, eco não medido sob carga) fora da área. O E2E em si não foi executado: exige o secret e os runners.

Estado: concluído; pendente o Felipe criar o secret e disparar o workflow uma vez.

---

## 2026-11-17 — Lançamento: checklist de prontidão fechado, decisões do Felipe e titular único do LICENSE

**Contexto.** A task de prontidão (aberta em 15/10) listava 20 itens candidatos a bloquear a divulgação. Em 17/11 vários já tinham mudado (`main` 1.600 commits adiante, release v0.1.569), então cada item foi reconferido.

**Decisões do Felipe.** (1) Divulgar sem assinar, nos três sistemas (não era a recomendação do agente); a página de download precisa ensinar a liberar o app no Mac (Gatekeeper) e explicar o SmartScreen. (2) Titular único "Felipe Martin". (3) Canal estável para o público, diário só para a equipe e CLIs em pré-lançamento como opção que pergunta antes de mexer no npm global (não implementado: vira task com plano). (4) Escopo: Brasil, Windows, Linux e Mac Apple Silicon. Premissa do agente: oferta open source e gratuita.

**O que mudou.**
- `LICENSE:3` passa a "Felipe Martin", igual a `app/package.json:8,76`. O nome do perfil no GitHub e o `user.name` do git local são "Felipe Martin"; fica o aviso para conferir.
- `docs/validation/RELEASE_CHECKLIST.md` ganhou a seção 11, com 22 itens, classe, evidência e task, e o registro das decisões acima.

**Medido.**
- Resolvidos: instância única (`single-instance.cjs:27`), `npm audit --omit=dev` com 0 vulnerabilidades, `source-map-js` 1.2.2, laço do `canvas:save` (`d07b3a2`, `2b46bc2`), npm embutido 11.21.2.
- Abertos: perda silenciosa de edição (duas lacunas altas ainda no código), texto de permissões do README (`README.md:312`), e-mail pessoal e caminhos em `docs/ia-archive`, nenhuma rodada em máquina limpa.
- README e GUIA-USUARIO já trazem as instruções de liberação no Mac e no Windows; a página de download ainda não existe.

**Não validado.** Nenhum item foi executado em máquina real; só documentação, sem gate de código. O item das skills da Anthropic para Codex e Gemini não foi lido no código.

Estado: concluído (commits na branch; pendências abertas como tasks pelo orquestrador).

---

## 2026-11-17 — System Design: guia do desenvolvedor sem o aviso do git-askpass

- **Contexto:** a correção do ambiente do Git sem clique (`gitEnvironment` esvazia `GIT_ASKPASS`) já estava na main desde `d0fe333`, com testes em `git-failure.test.cjs` e `system-design-service.test.cjs`. O guia ainda mandava rodar `SSH_ASKPASS= DISPLAY= npm test` por causa desse teste.
- **O que mudou:** só o texto de `docs/guias/GUIA-DESENVOLVEDOR.md`: o teste não abre mais a janela no Git Bash.
- **Validação:** com `SSH_ASKPASS` e `GIT_ASKPASS` apontando para um `git-askpass`, `node --test` dos dois arquivos: 33 testes, 0 falhas, o teste de git real em 1,2 s, sem janela.

---

## 2026-11-17 — Canvas: o laço de canvas:save do SA1 era o Excalidraw ressuscitado; a task estava feita desde 05/11 e o inventário ainda a listava

**Contexto.** Task `3ea91f95-497e-812a-8c6d-fcc953edc59b` ("achar o laço de canvas:save que reprova o SA1 do tutorial no Windows e no macOS"). Em setembro o SA1 reprovou no Windows e no macOS do CI com `{"canvas:save":2}` em 1,5 s durante os 30 s de espera, e a hipótese era um `ResizeObserver` ou `fit()` que não assenta.

**Causa (medida).** Não era medida de layout: era o bloco Excalidraw regravando a si mesmo cerca de uma vez por segundo (corrigido em `d07b3a2`, 05/11, entrada "o bloco Excalidraw para de regravar a cena a cada segundo"). Em setembro o SA1 tentava contornar isso apagando o Excalidraw da fixture pelo IPC (`canvas:delete`) e recarregando; mas o bloco vivo na tela continuava com o `onChange` e o debounce armados, e o primeiro `canvas:save` depois do `delete` recriava a linha. O reload então carregava o bloco de volta, e ele seguia gravando para sempre. Era uma corrida entre o `delete` e a próxima volta do laço: perde em máquina lenta (runner do CI), ganha em máquina rápida.

**Reprodução (app de fonte, Windows, Electron 42, harness descartável fora do repo: semeia o bloco da fixture, apaga pelo IPC, recarrega, mede 6 s).**
- Com o `ExcalidrawDrawingNode.tsx` de antes de `d07b3a2`: o bloco voltou em 7 de 8 ciclos, com 8 a 23 `canvas:save` na janela (cerca de 1 por segundo).
- Com o código atual: 4 de 4 ciclos sem o bloco voltar e 0 `canvas:save` na janela.

**Frequência hoje.** Sessão A do smoke no Windows local: 3 de 3 passaram o SA1 na primeira amostra de 1,5 s (uma delas com o processo limitado a 2 núcleos), mais a das 09:54. No CI, nas 11 Nightlies desde 06/11, os 44 jobs de Windows e macOS (smoke completo e matriz visual) tiveram 0 ocorrências de "o app não parou de gravar" e 53 passagens do SA1.

**O que mudou.** Só documentação viva: a lacuna "Laço de canvas:save que reprova o SA1" saiu do inventário do canvas (`inventory/data/chrome.ts` e `overlays.ts`) e o `INVENTARIO-CANVAS.md` foi regenerado (249 para 247 lacunas, 62 para 61 tasks). Nenhum código de produto mudou.

**Validação.** `lint` e `typecheck` limpos; `run-node-unit-tests.cjs` 3395 passam, 0 falham (12 pulados); `vitest run` 233 arquivos passam e 3 pulados (3572 testes). O teste do inventário passa sem `-u`.

**Não validado.** macOS físico (a evidência de lá é só o CI); o harness roda com um Vite próprio na porta 5199, não com o da CI.

Estado: concluído (commit na branch; deploy pelo orquestrador).

---

## 2026-11-17 — Segurança: confirmações nos modos sem terminal (prazo aplica a recomendada, aviso de acesso total)

**Contexto.** A task pedia que o Gemini (ACP) e o Codex (app-server) deixassem de aprovar sozinhos e que os adaptadores não subissem com acesso total. A `main` já tinha o "Confirmar ações sensíveis" (6e3f38b), que serve também aos agentes do orquestrador, pois `startCliRequest` usa o mesmo `orchestratorSettings`.

**Decisões do Felipe (17/11/2026).** (1) O padrão continua sendo acesso total, contra a recomendação do agente; nada muda para quem já usa. (2) Modo autônomo explícito e visível. (3) Sem resposta em 10 minutos, vale a opção recomendada do pedido; sem recomendada, a mais segura (negar).

**O que mudou.** `persistent-cli-session.cjs`: o pedido guarda `permission.recommendedAllow` (só `true` explícito conta) e a varredura de 10 minutos permite ou nega conforme isso; a mensagem diz qual foi aplicada. Hoje nenhum adaptador marca recomendada, então o comportamento real segue sendo negar. `OrchestratorPanel.tsx` e `FelixoSettingsModal.tsx`: com a confirmação desligada, aparece "Acesso total ativo".

**Validação.** Teste novo em `persistent-cli-session.test.cjs` (recomendada aplica; o antigo cobre o negar). lint e typecheck limpos; `run-node-unit-tests` 3396 ok de 3408 (0 falhas); vitest de chat e ferramentas do canvas 269 ok.

---

## 2026-11-17 — Terminal: o estado e o assunto que a CLI anuncia (OSC 7501 e título) passam a mandar no cartão

Task: Felixo AI Core/Terminal — ler o estado e o assunto que as CLIs já anunciam (Notion `3fa91f95-497e-81ee-a838-df766edb0832`). Agente: subagente da Orquestração (Claude Code, Claude Sonnet 5.5), 10:11 em diante. Trilha A.

**Contexto.** O estado do cartão ("trabalhando", "aguardando", "aguardando aprovação") era adivinhado olhando a tela (`computeSignature`, `IDLE_AFTER_MS`, `looksLikeApprovalPrompt`), e já deu três bugs. O Claude Code 2.1.295+ anuncia o estado pelo Program Status Protocol (OSC 7501, rev. 0.4) e Claude e Codex mandam o assunto no título da janela (OSC 0).

**Feito.**
- **`program-status.ts` (novo, puro):** `parseProgramStatus` valida o relato como a especificação manda (chaves, `id` em árvore até 8 níveis, base64 de `title` e `msg` com 192 e 2048 bytes, sem controle, relato inteiro descartado se algo estoura), `subjectFromTitle` tira glifo de estado e o nome da CLI, `titleSaysWorking` reconhece o spinner (`◐◑` do Claude, braille do Codex).
- **`terminal-session-store.ts`:** `watchProgramStatus` registra o OSC 7501 e o `onTitleChange`. Precedência OSC 7501 > título > tela: `working` = trabalhando; `blocked` = aguardando aprovação com `blockKind`; `done` = aguardando com aviso; `idle` = aguardando **sem** aviso (`silentIdle`); `error` = em repouso com aviso (o `error` da atividade significa "não subiu"); `clear` devolve à tela. Com relato ativo, `onOutput`, `markWorking` e o relógio de ociosidade não mexem no estado. Sem 7501, o spinner no título segura "trabalhando" com a tela parada.
- **Sondagem:** respondida pelo caminho do xterm (`terminal.input(resposta, false)`, que sai pelo `onData` na ordem do parser, antes da resposta ao `CSI c`). Sondagem que chega antes de o `pty.spawn` responder é replay até prova em contrário: se o PTY é `reused`, não se responde; se é novo, responde depois.
- **Snapshot:** `statusSource`, `blockKind`, `progress`, `subject`, `silentIdle`. O cartão mostra o assunto ao lado da pasta e uma barra fina de progresso; `isActionRequired` ignora o `idle` silencioso.
- **Codex segue pela tela** (o 7501 dele só abre o chat, como antes); Gemini, Openia e shell não mudam.
- **Docs:** `GUIA-USUARIO.md` (estado dos agentes).

**Validação.** `program-status.test.ts`: 13 testes (relatos válidos, inválidos, limites, títulos reais das gravações de Claude e Codex). `terminal-session-store.test.ts`: 10 testes novos (sondagem uma vez e antes do DA1, não responde no reanexo, responde se chegou antes do spawn, estados e `kind`, tela parada 5 s não muda o estado anunciado, `clear`, filho e relato inválido ignorados, Codex fora, assunto, spinner no título). Gate: lint e typecheck limpos, vitest 234 arquivos / 3595 testes, testes Node 3395 passando.

**Não validado.** Nenhuma sessão real do Claude Code (o repositório não tem gravação com 7501 do Claude, e a task proibia sessão real): o formato do 7501 do Claude foi lido da especificação, não de captura. Ver sondagem/`kind` no app real e gravar a fixture é a pendência.

---

## 2026-11-17 — System Design: fonte padrão decidida e sugestões por área (Felixo back-end, Doktor front-end)

Contexto. A task pedia decidir entre Felixo System Design (https://github.com/Felipe-Alcantara/Felixo-System-Design, cc4aae7, 29/07/2026) e Doktor (https://github.com/AndreGustavoms/Doktor-SystemDesign, 7fc7f5e, 04/09/2026, 78 .md contra 32). Nenhum código do app usava o Doktor além de fixtures de teste.

Decisão do Felipe. "Felixo focado para back, Doktor para front, mas é bom sempre perguntar": o app oferece as duas fontes por área e pergunta, sem impor. Decisão do agente: o desenho mais simples com o que já existe. O padrão do app (`DEFAULT_REPO_URL`) continua Felixo, então nenhuma instalação muda e `LEGACY_DEFAULT_SOURCES` não precisa de acréscimo; a pergunta vira um bloco "Sugestões por área" nas Configurações, e a seleção por lista já permite seguir as duas.

O que mudou.
- `system-design-suggestions.ts`: constante com Felixo (back-end) e Doktor (front-end), URL, branch e commit revisado, mais `isSuggestionInList` e `withSuggestion` (sem duplicar; tolera `.git`, barra final e caixa).
- `SystemDesignSettingsSection.tsx`: botão "Adicionar Doktor" (e "Adicionar Felixo") com rótulo, área, branch e commit visíveis; vira "Já adicionado" quando a fonte está na lista.
- `docs/guias/GUIA-SYSTEM-DESIGN.md`: decisão datada, links, política (offline e configuração antiga inalteradas; nunca copiar assinatura, identidade nem links).

Validação. `vitest` da pasta system-design: 6 arquivos, 47 testes passando (4 novos). `typecheck` limpo.

Não feito (pendência). Perguntar por área na configuração de cada projeto (`ProjectGuidesSection`) com as sugestões já marcadas.

---

## 2026-11-17 — Notion: smoke automatizado do editor de visualização do painel, com handlers IPC falsos (sessão G do canvas smoke)

- **Contexto:** o hotfix do filtro "Sem <propriedade>" (`da81082`) e o botão "Uma por repositório" (`786b6e0`) só tinham teste das funções puras e uma conferência manual com `felixo devtools`. O clique, o `confirm`, os chips e a aba criada não tinham teste automatizado. A task `40191f95-497e-81c7-9e4f-dc793c88dafc` pedia um comando sem rede nem token do Notion que falhasse se o chip sumisse ou se a aba não listasse as tarefas sem repositório.
- **O que mudou:** sessão G do `canvas-smoke.cjs` (`scripts/canvas-smoke-notion.cjs`, perfil isolado novo). Ela grava um canvas só com o bloco "Tarefas Notion", troca no processo principal os cinco handlers IPC `notion:*` por falsos (`devtools:main-eval` registra em `mainWindow.webContents.ipc`; a ponte do preload é congelada) e troca `window.confirm` por um gravador. Dados em `scripts/canvas-smoke-notion-fixture.cjs` (uma conexão, uma database, seis tarefas, três sem repositório, uma delas concluída). Passos: N1 "Uma por repositório" (botão aparece; recusar o confirm não muda as abas; aceitar cria 3 abas e a mensagem "Criei 3 visualizações"; repetir diz "Já existe uma visualização para cada repositório da lista" sem criar nem perguntar); N2 editor (chips "Sem Repositório", "Felixo-AI-Core", "notion-tasks-cli" nessa ordem, chip marcado, aba criada e selecionada, tabela só com as sem repositório; a concluída só entra depois de "Mostrar tarefas concluídas"); N3 com o Painel agrupando por uma ligação o botão não aparece. O CI já roda a sessão: `npm run test:canvas-smoke` roda todas por padrão (`A,B,C,D,E,F,G`); `FELIXO_SMOKE_SESSOES=G` roda só ela.
- **Achado:** o script da conferência manual dava aos campos `select`/`status`/`multi_select` o formato `{ name }`, mas o `notion-client.cjs` entrega texto (`''` para vazio) e lista de textos. Com o formato errado todas as tarefas caíam em "sem repositório". A fixture usa o formato real. Outro achado: as concluídas ficam escondidas em todas as abas (inclusive nas de "Todos os estados") até o ícone do olho; o smoke trava esse comportamento.
- **Validação:** `FELIXO_SMOKE_SESSOES=G node scripts/canvas-smoke.cjs` passou (75 s no Windows local, app de fonte, máquina dividida). Mutação: com o item "Sem <propriedade>" removido de `filterValueChoices`, a sessão reprova em N2 com `os chips não são "Sem Repositório" seguido dos valores`; código restaurado. Teste novo `canvas-smoke-notion-fixture.test.cjs` (2 testes). Resultados do gate no relatório da task.
- **Não validado:** Linux/Xvfb e macOS (só a CI); a primeira carga de um Vite frio nesta máquina carregada passou de 30 s no `page.reload` (a sessão G dá 60 s ao reload; as sessões C a F não foram alteradas).

---

## 2026-11-17 — Notion: reabrir o bloco sem rede lista as databases com snapshot e abre a última lista

**Contexto.** Na release v0.1.433, reabrir o bloco Tarefas Notion sem rede mostrava o aviso de rede, mas a lista de databases ficava vazia (só vinha da API) e o nome/data do snapshot não apareciam. A persistência da conexão e da database no bloco já existia (commit cc0b793), e `getCachedTasks`/`listTasks` já devolvem o snapshot com `stale`; faltava a lista offline.

**Feito.**
- **Migração 024:** coluna `name` em `notion_sync_state`, para rotular o snapshot.
- **`notion-cache-repository.cjs`:** `setName` e `listSnapshots({ connectionId })` (só as databases dessa conexão que têm tarefas em cache, da mais recente à mais antiga; nunca mistura conexões).
- **`notion-service.cjs`:** `listTasks` grava o nome ao sincronizar; `listDatabases`, quando a rede falha (erro de transporte: `timeout`, `network_error`, `ENOTFOUND`/`ECONNREFUSED`/`ETIMEDOUT`/`ECONNRESET`, `AbortError`, `fetch failed`) ou o Notion responde 5xx, e há snapshot, devolve essas databases com `stale: true`, `fetchedAt` e mensagem; sem snapshot, relança o erro como antes. Os 4xx (401, 403, 404, 400, 429) nunca viram modo offline: sobem, para a pessoa ver que a conexão quebrou. A regra é `isOfflineError`, exportada e testada.
- **`NotionTasksPanel.tsx`:** mostra a mensagem da lista offline e o rótulo "nome · sincronizada <data>" no seletor.

**Validação.** Teste novo com cache SQLite real e cliente que falha como proxy morto: sem snapshot o erro continua; depois de um sync a lista offline traz só a database da conexão (a de outra conexão não aparece), com nome e data, e `listTasks` devolve a tarefa salva com `stale`. Testes novos: 401 com snapshot devolve o erro, 503 mostra o snapshot, tabela de `isOfflineError`. `notion-service.test.cjs` e `notion-cache-repository.test.cjs`: 26 de 26.

**Não validado.** Reabrir o app real sem rede (não rodei o app); não há teste de componente do painel. Snapshots criados antes desta versão não têm nome e aparecem como "Database sincronizada" até a próxima sincronização.

---

## 2026-11-17 — Contas: "out of extra usage · resets …" é limite no terminal, e a espera vencida pede confirmação

**Contexto.** Desde a v0.1.554 o chat classifica pelo código da CLI, e a fixture real do Claude Code 2.1.323 traz "You're out of extra usage · resets 1:20pm" com `rate_limit`/429. No terminal e no texto sem código a mesma frase continuava `billing`, então os caminhos divergiam.

**Decisão do Felipe.** "Sempre usar o limite normal; se houver reset, perguntar se pode usar": a frase com horário é limite; a conta não volta sozinha a gastar uso extra; sem horário continua como antes (cobrança).

**O que mudou.**
- `cli-failure-patterns.cjs`: a frase "You're out of extra usage" vira `limit` com "resets" na linha e segue `billing` sem ele (regra nova `unless`, ao lado de `alsoRequires`; vale no terminal e no fluxo, e na lista genérica). `failure-taxonomy.cjs` compila e aplica o `unless`.
- Decisão do agente: a pergunta no reset reaproveita a regra 5 da política (`cooldownBlocks`): a espera de limite vencida só libera com checagem de login posterior, então a conta nunca volta sozinha; a pessoa confere pelo "Conferir login" da lista da cadeia. Só o texto muda: `formatCooldown` mostra "espera vencida · confira o login para liberar o uso extra" quando a evidência é de extra usage. Nenhuma tela, tabela ou fluxo novo; o comportamento do bloco com conta fixa não foi tocado.
- Fixture `cli-failure-vocabulary.json`: a entrada de cobrança passa a ter o exemplo sem horário, e a nova `claude.limit.out-of-extra-usage-resets` cobre o caso com "resets". `model-availability.test.cjs`: com horário, o orquestrador registra "Limite detectado pela CLI", não "Sem crédito".

**Validação.** `failure-taxonomy.test.cjs` 27/27 (pty e fluxo, com e sem "resets"; espera vencida não solta a conta sem checagem); `account-chain-view.test.ts` com o texto novo; lint e typecheck limpos; `run-node-unit-tests` 3398/3410 passam, 0 falhas. Não rodei o app real.

Estado: concluído; a "pergunta" é a confirmação por "Conferir login" na lista da cadeia, sem diálogo próprio (se o Felipe quiser uma faixa ou proposta explícita no bloco, é outra task).

---

## 2026-11-17 — Agentes: a descoberta de modelos roda no Windows e uma falha não apaga a lista do agente

Task: Felixo AI Core/Agentes — fazer a descoberta de modelos rodar no Windows e parar de apagar a lista de um agente quando a consulta dele falha (Notion `3fa91f95-497e-81c3-b3f4-c3a7ce7217cb`). Agente: subagente da Orquestração (Claude Code, Claude Sonnet 5.5), 10:11 em diante. Trilha A:

**Causa.** O `runCli` de `agent-models-ipc-handlers.cjs` chamava `execFile('claude', ...)` sem shell: no Windows o `claude` do npm é um atalho (`.cmd`/`.ps1`) e dava ENOENT, então só o Codex (arquivo local) era descoberto, nas 50 rodadas medidas pelo log de QA. Além disso, `store.save` regravava o arquivo só com o que a rodada achou (uma falha apagava a lista boa do agente), o `refresh()` do renderer não tinha `catch` e cada diálogo abria uma rodada nova.

**Feito.**
- **`agent-models/agent-model-runner.cjs` (novo):** resolve o executável como o resto do app. No Windows, o Claude vai ao `claude.exe` por trás do atalho (`resolveNativeClaude`, sem shell); os demais usam o caminho do `PATH` de `createCliEnv()`; `.cmd` roda pelo `cmd.exe` com o caminho entre aspas e a flag dentro da linha (como `detectCli`), recusando argumento fora de `[\w./=-]`; `.ps1` pelo PowerShell. Fora do Windows o caminho é o de antes.
- **Gemini:** a descoberta não abre mais `gemini -p "/model"` (nunca devolve lista e consulta a cota); o motivo ("a CLI do Gemini não lista modelos fora do modo interativo") vai para a tela.
- **`agent-model-catalog.cjs`:** `mergeDiscovered` junta ao cache anterior por agente, com `discoveredAt` e `labels` de cada um; `resolveAgentCatalog` (só os testes o usavam) foi apagado, a escolha cache/fixa é a do `agent-model-overlay.ts`.
- **`agent-model-refresher.cjs` (novo):** uma rodada por vez (pedidos simultâneos esperam a mesma promessa), não regrava o cache sem descoberta nova e devolve `agents: { claude|codex|gemini: { origem: 'descoberta'|'cache'|'fixa', motivo, discoveredAt } }`.
- **Renderer:** `useAgentModelCatalog` ganhou `catch` e devolve `agentStatus`/`refreshError`; `AgentConfigFields` mostra sob o seletor de modelo uma linha como "Lista da CLI, atualizada há 2 h." ou "Lista fixa do app (a CLI do Gemini não lista modelos fora do modo interativo)." (`describeModelListStatus`).
- **Docs:** `INVENTARIO-CANVAS.md` (regenerado) e `inventory/data/terminal.ts`; o item "Atualizar lista de modelos não avisa a falha" saiu da lista de riscos.

**Validação.**
- **Antes/depois no Windows real:** `execFile('claude', ['--version'])` com o env do app dá `ENOENT`; o runner novo devolve `2.1.326 (Claude Code)` para o `claude` e `codex-cli 0.171.0-alpha.11` para o `codex`. Só `--version` foi executado, nenhuma sessão.
- Testes novos: runner (7: `.exe` sem shell, `.cmd` com caminho com espaço entre aspas, argumento recusado, ENOENT, Linux inalterado, stderr, saída vazia), refresher (3: Claude falha na 2ª rodada e a lista continua, sem regravar, rodadas simultâneas viram uma), discovery (Gemini sem processo, motivo por agente), catalog (junção por agente) e overlay (texto da linha). Gate: ver relatório.

**Não validado.** Abrir o app de verdade no Windows com o Claude respondendo ao `/model` (o `claude -p "/model"` não foi executado para não arriscar uso); o `.ps1` do Claude só tem teste de resolução por injeção, não execução real.

Estado: concluído (commit na branch; deploy pelo orquestrador).

---

## 2026-11-17 — Limites: captura do consumo de cada terminal do Claude, por sessão e sem digitar no terminal (1ª parte)

Task: Felixo AI Core/Limites — capturar, por sessão e sem digitar no terminal, o consumo de cada agente aberto e a janela da conta dele (Notion `3fa91f95-497e-81ad-a876-ec56a37b3b53`). Entrega a primeira parte coesa (Claude); Codex, Gemini e o cabeçalho ficam como pendências.

**Problema.** A status line do app só rodava se a pessoa a instalasse no `~/.claude/settings.json`, gravava um arquivo único sem sessão nem conta, e com duas contas do Claude (`pickLocalTarget`) a leitura era jogada fora. Perfil com `CLAUDE_CONFIG_DIR` nunca era capturado, e nada guardava o consumo por terminal.

**Feito.**
- **Lançamento:** `PtyProcessManager.withClaudeSessionCapture` acrescenta `--settings <userData>/claude-statusline/session-settings.json` (antes dos argumentos, fora de `entry.args`) e `FELIXO_PTY_SESSION_ID` ao ambiente de todo terminal do Claude. Não age se a pessoa já passou `--settings`, se o ID não cabe em nome de arquivo ou se o preparo falha.
- **Script (`claude-statusline-script.cjs`):** com o ID no ambiente grava `sessions/<id>.json` (temporário + renomear) só com lista branca; chama a status line da pessoa (`CLAUDE_CONFIG_DIR` ou `~/.claude`) e mostra a saída dela. Sem o ID, comportamento antigo. Script de terminal próprio (`felixo-session-statusline.cjs`), para desligar a coleta global não apagar o de terminais vivos.
- **`agent-usage-session-capture.cjs` (novo):** `stat` por segundo por terminal vivo do Claude, leitura só quando o `mtime`/tamanho muda, validação dos campos, mapa em memória por ID do terminal, lote `{ changed, removed }` e limpeza do arquivo ao fechar (e das sobras na partida).
- **Conta:** `refreshLocal(providerId, { reading, accountId })` grava a janela na conta do terminal (sem adivinhar identidade) e ignora leitura mais velha que a última medição da conta. Terminal sem conta segue a regra antiga (conta única).
- **IPC:** `agent-usage:sessions` e `agent-usage:session-changed`; `window.felixo.agentUsage.listSessions` e `onSessionsChanged`; tipo `AgentUsageSessionReading`.
- **Docs:** `GUIA-CONTAS-E-LIMITES.md`, `INVENTARIO-CANVAS.md`.

**Revisão: o argumento chega inteiro no Windows.** Teste nativo novo (`pty-claude-settings-launch.integration.test.cjs`, no `test:native`): ConPTY real, `claude.cmd` falso numa pasta com espaço e acento, `settingsPath` também com espaço e acento, lançado pelo `PtyProcessManager`. O falso grava o `argv`: `['--settings', <caminho exato>, '--model', 'opus', 'com espaço', 'ação']` e o ID do terminal no ambiente. Passa sem mexer nas aspas. Na primeira rodada o `claude` do PATH (o real) foi o que abriu e recusou só porque o arquivo não existia, citando o caminho acentuado inteiro: o argumento chegou íntegro ao Claude de verdade também.

**Custo da status line por atualização** (script real, 20 rodadas, Windows): `node` vazio 62 ms (p50); script do app sozinho 66 ms (p90 98); script do app chamando a status line da pessoa (outro `node` por um shell) 231 ms (p90 400). O Claude roda a status line depois de cada mensagem do assistente (debounce de 300 ms), não por token; com 10 terminais respondendo são dezenas de execuções curtas por minuto, em processo separado, fora do processo principal do app.

**Decisão do agente.** Status line da pessoa: o script do app chama a dela (a opção recomendada pela task).

**Validação.** `test:native`: o teste novo passa; `pty-write-queue` oscila por tempo sob carga (também na `main`). Testes novos: captura (5, incluindo o script real com caminho com espaço, lista branca sem caminho/título, atômico e a status line da pessoa), terminal (2), serviço (1), IPC (1). Gate: lint e typecheck limpos; `run-node-unit-tests` 3404 passam, 0 falham; vitest 3571 passam, 2 do `deferred-terminal-session-store` falham só sob carga e passam isolados.

**Não validado.** Claude real com `--settings` num perfil de conta (não abri sessão que gasta uso); CPU com 10 agentes; macOS e Linux; o app rodando.

---

## 2026-11-17 — Testes: descoberta de sessão presa contra CODEX_HOME e CLAUDE_CONFIG_DIR herdados

- **Contexto:** a task pedia isolar `agent-session-discovery` e o `CODEX_HOME` do perfil local, por três falhas vistas em 03/11. Ao reproduzir na `main` (9a92d2b), as três já passavam: o commit b0c831b trocou `env = process.env` por `env = {}` em `discoverAgentSession` e fez o teste do PTY comparar com `process.env.CODEX_HOME`.
- **Motivo:** nada travava essa regra; voltar a ler o ambiente do processo só quebraria na máquina de quem tem `CODEX_HOME` definido, que o CI limpo não pega.
- **O que mudou:** um teste novo em `agent-session-discovery.test.cjs` define `CODEX_HOME` e `CLAUDE_CONFIG_DIR` falsos no processo (restaura no `finally`) e confirma que a sessão da fixture, em `homeDir` temporário, continua sendo achada.
- **Validação:** o teste novo falha com `env = process.env` e passa com `env = {}`. Suíte node inteira com HOME/USERPROFILE/CODEX_HOME/CLAUDE_CONFIG_DIR numa pasta temporária vazia: 3418 testes, 3405 aprovados, 12 ignorados, 1 falha, idêntica à rodada normal (benchmark de PTY sob carga, passa isolado 11/11). Vitest 3572 aprovados. A pasta temporária ficou sem nenhuma sessão criada.

---

## 2026-11-17 — Inicialização: job manual que valida no Linux a instância única, o relançamento de GPU do AppImage, o .desktop e o launcher

**Contexto.** Task "validar no Linux a instância única (inclusive o relançamento de GPU do AppImage), o .desktop e o launcher" (`40e91f95-497e-8184-b156-c84b95b8f0da`). Os commits `02f245b` (trava de instância única), `0682ba7` (launcher sem falso positivo do Excalidraw) e `d438c85` (`.desktop` sem MimeType repetido) só foram provados no Windows. O CI e o Release já rodavam no Ubuntu, mas só com ambiente falso: testes de unidade do `single-instance`, do `gpu-launch` e do gerador do `.desktop`, o `unittest` do launcher em Ubuntu 24.04 (Python 3.9) e Ubuntu 26.04 (3.13), e o release smoke do AppImage extraído (PTY, userData, contexto, CSP). Nenhum abria duas instâncias do AppImage, nenhum exercitava o relançamento de GPU real (que só existe no AppImage), nenhum lia o `.desktop` do `.deb` ou do AppImage gerados.

**Motivo.** O Linux físico é a máquina do relato de 25/09, mas quase tudo o que a task pede pode ser visto num runner Ubuntu com `xvfb`: o que depende de placa de vídeo real, do gerenciador de arquivos, do menu de aplicativos e de um boot não pode, e ficou declarado.

**O que mudou.**
- `.github/workflows/linux-instalado-e2e.yml` (só `workflow_dispatch`, `ubuntu-24.04`, sem secret, sem publicar): instala `libfuse2t64`, faz `npm ci`, confere o launcher, empacota AppImage e `.deb` x64 com `electron-builder --publish never` e roda o script duas vezes, com o AppImage montado por FUSE e com `--appimage-extract-and-run`.
- `app/scripts/linux-instalado-e2e.cjs`: (1) lê o `.desktop` do `.deb` (`dpkg-deb -x`) e o do AppImage (`--appimage-extract '*.desktop'`) e exige uma linha `MimeType` com os três tipos uma vez cada; (2) abre o AppImage com `XDG_CONFIG_HOME` isolado, abre de novo e exige código 0 na segunda e um processo principal só (lido em `/proc`, sem os filhos `--type=`); (3) grava Integrada no `gpu-preference.json`, abre com `DRI_PRIME=1` e `__NV_PRIME_RENDER_OFFLOAD=1` e exige: lançador sai com 0, o processo novo nasce com pid diferente, fica sozinho depois de 8 s, o `/proc/<pid>/environ` dele não tem as variáveis e tem `FELIXO_GPU_ENV_SANITIZED=1`, e o `pendingRelaunch` e o `fallback` do arquivo ficam vazios (o relançado apaga o pedido só se chegar ao `main.cjs` com a trava). Na passada sem FUSE confere também `APPIMAGE_EXTRACT_AND_RUN=1` com a marca `FELIXO_APPIMAGE_EXTRACT_AND_RUN_ADDED`.
- Passo do launcher no mesmo job: `get_missing_node_dependencies` vazio e `node_modules_is_current` verdadeiro depois do `npm ci`.
- `app/scripts/linux-instalado-e2e.test.cjs`: 2 testes de unidade da análise do `.desktop` (6 tipos repetidos são acusados) e da leitura de `/proc` (só o processo principal conta; sem zygote, crashpad nem `AppRun`; ambiente lido de `environ`), com um `/proc` falso.
- `release-relevant.test.sh` fixa os arquivos novos como não relevantes para publicar; `GUIA-DESENVOLVEDOR.md` documenta o job e o que o runner não prova.

**Validação.** `lint` e `typecheck` limpos; `run-node-unit-tests.cjs` com 3419 testes, 3406 passam, 12 pulados e 1 falha em `pty-output-path-benchmark.test.cjs` sob a carga da suíte inteira, que passa isolado (11 de 11); `vitest run` 232 arquivos passam e 1 falha (`canvas-context-e2e.test.ts`, 3 de 3 execuções, também isolado; nenhum arquivo de `app/src` foi alterado aqui); `bash .github/scripts/release-relevant.test.sh` passa. O job não foi disparado: esta máquina é Windows e o script só roda no Linux.

**Não validado.** O job nunca rodou num runner; a primeira execução pode pedir ajuste fino (nome do executável, FUSE no runner, AppArmor do 24.04). Não cobre: placa de vídeo real e `prime-run` (o ambiente é simulado por variáveis), entrega de um `.fxai` à janela aberta, `felixo-ai-core-autostart.log` do próximo boot, e o vazamento de `APPIMAGE_EXTRACT_AND_RUN` num terminal aberto pelo Felixo. Esses ficam para o Linux físico.

Estado: concluído (commit na branch; deploy pelo orquestrador).

---

## 2026-11-17 — Canvas: remoções destrutivas pedem confirmação e a trava do canvas impede remover

**Problema.** O cadeado da pílula de zoom só travava seleção e o Remover da barra de status: Delete/Backspace sobre a seleção feita antes de travar, o X do cabeçalho de todo bloco e o "Remover grupo" continuavam apagando. Além disso, "Remover grupo" levava em cascata os blocos filhos (terminais com processo vivo, imagens temporárias do disco) sem avisar, e o X do terminal matava o PTY direto (`store.remove`) antes mesmo de qualquer portão.

**O que mudou.**
- `services/canvas-removal-guard.ts` (`judgeCanvasRemoval`): função pura que, com a trava ligada, recusa a remoção; e, sem a trava, monta a confirmação quando a lista a remover inclui grupo com filhos, terminal com processo vivo ou imagem temporária, dizendo quantos blocos saem junto. Bloco comum e grupo vazio saem sem confirmação.
- `CanvasView` liga o guarda ao `onBeforeDelete` do React Flow, o único portão por onde passam a tecla, o Remover da barra, o X do bloco e o "Remover grupo" (a lista já vem com os filhos em cascata).
- `TerminalNode`: o X deixou de chamar `store.remove` antes do `deleteElements`; o PTY é encerrado no `onNodesChange` (`releaseRemovedCanvasNodes`), depois do portão.
- Comentário de `onNodeDragStop` corrigido: não existe desagrupar (filho preso por `extent: "parent"`); o texto antigo prometia "drop it out to detach".
- Fora do React Flow (revisão do orquestrador): "Limpar" da barra lateral, importar `.fxcanvas` (`useCanvasTransfer`) e "Remover temporário" da imagem (`useImageNodeActions`) apagavam blocos sem passar pelo `onBeforeDelete`. Agora `allowWholeCanvasReplace` faz o `clearAll` e o `importFile` recusarem com a trava ligada, o botão Limpar fica desabilitado com `title`/`aria-label` de canvas travado (`clearButtonState`), e o Remover temporário confere um `lockedRef`. Varredura: não há outro consumidor de `canvas:delete`/`canvas:clear` (só o renderer; nenhum caminho de agente/IPC do main).
- Inventário (`INVENTARIO-CANVAS.md` regenerado): cinco lacunas desta task saíram, os efeitos/falhas dos controles foram ajustados e o novo teste entrou nos elementos afetados.

**Validação.** `canvas-removal-guard.test.ts` 7/7 (arquivo novo: o teste não existia antes da correção). `npm run lint` e `typecheck` limpos; `vitest run` 3576 pass, 4 skipped e 3 falhas só sob carga (as 2 de `detachAll` conhecidas e `canvas-context-e2e`); os dois arquivos passam isolados, 9/9. `run-node-unit-tests` 3404 pass, 1 falha sob carga (`pty-output-path-benchmark`, 11/11 isolado); `canvas-inventory.test.ts` 9/9 com o `.md` regenerado.

**Não validado.** Clique real no app (confirmação nativa, trava com Delete); o X e o "Remover grupo" com a trava ligada ficam sem efeito, mas continuam visíveis (não ficam desabilitados). Desagrupar continua inexistente.

Estado: concluído (commit na branch; deploy pelo orquestrador).

---

## 2026-11-17 — MCP: registro central com segredo no cofre e injeção no terminal (Claude e Codex)

Task: Felixo AI Core/MCP — instalar um MCP uma vez no app e entregá-lo a todo agente e toda conta (Notion `3fa91f95-497e-81c9-b7bc-e3abb5893986`). Entrega **parcial** (primeira parte que se sustenta sozinha); o resto está em "Não feito".

**Contexto.** `app/electron/services/mcp/` só tinha um catálogo estático de ferramentas planejadas que nada consumia. Cada MCP era registrado à mão por CLI e por conta, com o segredo em texto no arquivo da CLI.

**Feito.**
- **`mcp-registry.cjs`:** definições sem segredo em `userData/mcp/servers.json`; valores secretos (env do stdio, cabeçalho do HTTP listados em `segredos`) cifrados por `safeStorage` em `secrets.bin`, que recusa o backend `basic`. `list` devolve só os nomes dos segredos guardados; `resolve(ids)` (só no principal) devolve os valores. Id removido depois de o agente ser configurado é ignorado.
- **`mcp-injection.cjs`:** Claude por `--mcp-config <arquivo de sessão>` com só `${FELIXO_MCP_<ID>_<NOME>}` e o valor no ambiente do terminal (medido, ver abaixo); Codex por `-c mcp_servers.<id>.*` com o segredo só no ambiente (`env_vars` no stdio, `env_http_headers` apontando para `FELIXO_MCP_<ID>_<NOME>` no HTTP), nunca em argv. Dois servidores com o mesmo nome de segredo e valores diferentes: o Codex recusa (um ambiente só). O conteúdo do `settings.json` do Gemini (`url` + `type: "http"`) está pronto, sem entrega.
- **`pty-process-manager.cjs` / `pty-ipc-handlers.cjs` / `main.cjs`:** opção `mcpIds` no spawn (só ids atravessam do renderer). Os args do MCP vão à frente dos originais; `args` guardados, retomada por ID e fallback de argumentos seguem como eram. O arquivo de sessão (sem segredo) sai na saída do processo, no `cleanup`, se o spawn falhar, e ao criar a injeção na abertura do app (sobra de app que caiu). Nada é gravado em `~/.claude.json`, `config.toml` nem `settings.json`.
- **Docs:** README, ARQUITETURA e GUIA-DESENVOLVEDOR deixam de apresentar a "MCP Layer" como entregue.

**Medição (Claude Code 2.1.326, `claude -p` com chave inválida e `CLAUDE_CONFIG_DIR` temporário, sem gastar uso).** O `--mcp-config` expande `${VAR}` em `args`, `env`, `url` e `headers`: um servidor stdio gravou `Y=valor-do-ambiente ARG=valor-do-ambiente` e um servidor HTTP local recebeu o cabeçalho `X-Token: tok-ok` na rota `/mpath-ok`. Por isso o segredo do Claude não vai mais ao disco. `claude mcp list` não aceita `--mcp-config`. Efeito colateral: as variáveis `FELIXO_MCP_*` ficam no ambiente do terminal, visíveis a quem o agente executar, como já no Codex.

**Validação.** 16 testes novos (registro, adaptadores, spawn com PTY falso): segredo ausente de `servers.json`, `secrets.bin`, argv e do arquivo de sessão do Claude; arquivo velho some ao criar a injeção; `pty-process-manager.test.cjs` 83/83. Gate: lint e typecheck limpos, `run-node-unit-tests` 3406 pass / 0 fail, vitest 3572 pass. Nenhuma CLI real foi aberta e nenhuma config real foi tocada.

**Não feito / não validado.** Sem interface nem IPC para cadastrar; `mcpIds` no `AgentPreset` e seletor; entrega ao Gemini (pasta-sombra por `GEMINI_CLI_HOME`, medição pendente); importação do que já existe; "usar também fora do AI Core"; política de ferramentas que agem fora em yolo; OAuth remoto; `felixo mcp executar` (hoje os dois levam o segredo no ambiente do terminal). Precedência do `--mcp-config` do Claude e do `-c` do Codex sobre nome já existente e o quoting do `-c` sob o PowerShell do Windows não foram medidos.

Estado: parcial, concluído nesta fatia (commit na branch; deploy pelo orquestrador).

---

## 2026-11-17 — Limites: a rodada completa não abre a consulta do login do sistema quando nenhuma conta a recebe

- **Contexto:** com só contas de perfil (login próprio), `refreshInternal` abria, além das consultas dos perfis, uma consulta do login do sistema por provider. `saveSnapshot` descarta a amostra do sistema quando todas as contas do provider são de perfil, então era uma CLI aberta (no Claude, um PTY de `/status`) sem efeito.
- **O que mudou:** `providerIds` em `agent-usage-service.cjs` só inclui providers com pelo menos uma conta que não é de perfil ("Conta desta máquina" ou cadastrada à mão). O catálogo vem de `readCatalog` (antes de `providerIds`), não da consulta do sistema; `refreshLocal` não muda.
- **Validação:** `agent-usage-refresh-account.test.cjs` 15/15 (só perfis: 3 consultas; com a conta da máquina: 3 + `sistema`); trocar o filtro por `() => true` derruba 2 testes. Node 3432 pass/0 fail; vitest 3611 pass; lint e typecheck limpos.

---

## 2026-11-17 — Orquestrador: as respostas de "Permitir?" ao Codex App Server e ao Gemini ACP usavam o vocabulário errado do protocolo

- **Contexto:** a task pedia conferir com as CLIs reais o card "Permitir?" e o teto de custo. Gastar uso real é passo do Felipe, então a conferência foi feita contra o protocolo: `codex app-server generate-json-schema` (offline, Codex 0.171) e o bundle instalado do Gemini CLI 0.69 (`RequestPermissionResponseSchema`, `basicPermissionOptions`).
- **Motivo:** os dois adaptadores respondiam em formato que a CLI real não aceita. Codex: `{decision:'approved'|'denied'}` é o vocabulário v1 (`ExecCommandApproval`); os pedidos `item/commandExecution|fileChange/requestApproval` esperam `accept`/`decline`, e `item/permissions/requestApproval` espera `{permissions, scope}`. Gemini: a opção do ACP traz `optionId` (o adaptador lia `id`) e a resposta é `{outcome:{outcome:'selected', optionId}}` (o adaptador mandava `outcome` plano). Com a confirmação ligada, "Permitir" e "Negar" não funcionariam de verdade; testes com adaptador falso não pegavam porque as fixtures repetiam o formato errado.
- **O que mudou:** `codex-app-server-adapter.cjs` responde `accept`/`decline` (comando e arquivo) e, na permissão extra, devolve o perfil pedido (permitir) ou `{}` (negar), `scope: 'turn'`. `gemini-acp-adapter.cjs` lê `optionId` (com `id` de reserva, padrão `proceed_once`) e aninha o `outcome`. Fixtures e testes passaram ao formato real; teste novo para a permissão extra do Codex.
- **Validação:** testes dos dois adaptadores e dos agentes falsos passam (38 e 25). Nenhuma CLI real rodou; o roteiro de conferência real (custo esperado) está no relatório da task.

---

## 2026-11-17 — Custo: o bloco Claude API avisa que a conta por chave cobra por token, uma vez ao abrir

**Problema.** O bloco Claude API roda com uma conta por chave, cobrada por token a cada mensagem, e só mostrava o custo depois de cada resposta. Imagem e ditado já pediam um "sim" antes de cobrar; este bloco não.

**Decisão do Felipe.** Aviso ao abrir o bloco, uma vez por conta, com "não perguntar de novo"; gasto da conversa sempre visível; sem teto por conversa (confirmação por mensagem foi descartada pelo atrito).

**O que mudou.**
- `services/claude-api-cost-notice.ts` (`createClaudeApiCostNotice`): decide se o aviso é necessário. Ler o aviso vale enquanto o bloco está aberto; "não perguntar de novo" usa o registro comum `felixo:cost-consent` com a chave `claude-api:<conta>` (`claudeApiCostConsentKey` em `usage-cost-consent.ts`), por conta, em qualquer bloco.
- `ClaudeApiNode`: faixa de aviso acima do campo de mensagem, com caixa "Não perguntar de novo para esta conta" e botão "Entendi, continuar"; enquanto o aviso está aberto o envio fica desabilitado. O gasto da conversa (`formatUsd(totalCostUsd)`) já ficava sempre no cabeçalho, mesmo zerado.

**Validação.** `claude-api-cost-notice.test.ts` (4 testes: aviso na primeira abertura por conta, ler vale por bloco, "não perguntar de novo" gravado e valendo após reabrir só para aquela conta, gasto sempre exibido) e `usage-cost-consent.test.ts`: 7/7. Gate completo no relatório.

**Não validado.** Clique real no app. Sem preço por modelo: o repositório não tem tabela, então o aviso mostra só o custo em dólar que o Claude Code informa a cada resposta (nada é estimado antes da primeira). Sem teto de gasto, por decisão do Felipe.

Estado: concluído (commit na branch; deploy pelo orquestrador).

---

## 2026-11-17 — Terminal: avisar e reparar ao abrir um agente cuja CLI ficou incompleta

Task: Felixo AI Core/Terminal — avisar e reparar ao abrir um agente cuja CLI ficou incompleta, em vez do erro do sistema (Notion `41991f95-497e-813c-8b50-e4cf377392b7`). Agente: subagente da Orquestração (Claude Code, Claude Sonnet 5.5), 11:29 em diante. Trilha A:

**Causa.** Desde a v0.1.550 o app confere o executável da CLI ao abrir o app e depois de instalar, mas o `pty:spawn` não conferia nada: se a reinstalação falhasse ou a CLI quebrasse no meio da sessão, abrir um agente mostrava o erro cru do sistema. Além disso, o plano de instalação marcava a CLI como "presente" assim que existia uma do sistema, então uma cópia do app incompleta (caso medido hoje: Codex do app em 0.169.0-alpha.3 sem `codex.cmd` nem `codex.ps1`, sobra de um npm) nunca era reparada.

**Feito.**
- **`pty-cli-health-gate.cjs` (novo):** antes do spawn de Claude/Codex, resolve o comando pelo PATH das CLIs. Cópia do app incompleta: dispara `run('repair')` (no máximo uma vez a cada 10 min por CLI) e, se é a cópia que o terminal abriria, o `pty:spawn` devolve `{ ok: false, code: 'CLI_INCOMPLETE', message }` ("A instalação do Claude ficou incompleta; reinstalando…") sem abrir o processo; a mensagem aparece no cartão pela faixa de erro de sempre. CLI do sistema com `.exe` quebrado (placeholder, truncado): só um aviso amarelo escrito no terminal antes da saída do processo.
- **`cli-auto-install.cjs` / `cli-auto-install-plan.cjs`:** `inspectManaged` (pacote instalado = versão no `package.json`, mas sem binário/executável inteiro = incompleta) e `managedIncomplete` no plano: entra na fila mesmo com a CLI do sistema detectada; motivo `repair` ignora o registro de falhas.
- **`pty-ipc-handlers.cjs` / `main.cjs`:** `cliHealthGate` injetado (desligado com o fake do devtools).

**Validação.** `pty-cli-health-gate.test.cjs` (5), 2 testes novos no handler e 1 no plano. Node 3438 testes, 3426 passam, 0 falham; vitest 3603 passam, 1 falha só sob carga (`canvas-context-e2e`) e passa isolado (6/6); lint e typecheck limpos.

**Não validado.** Abrir o app real com a CLI quebrada; reparo de ponta a ponta com npm real (só por injeção).

Estado: concluído (commit na branch; deploy pelo orquestrador).

---

## 2026-11-17 — Terminal: a gaveta abre de 2 a 4 agentes vivos lado a lado (primeira parte da task)

**Contexto.** Só um xterm vivia por vez, na gaveta da direita (`expandedTerminalId`); os cartões do canvas são só prévia, e o xterm dentro do cartão errou o mouse com o zoom do React Flow, então a divisão mora na gaveta, fora do canvas transformado.

**O que mudou.**
- **Arranjo puro** em `terminal-drawer-panes.ts`: painéis (1 a 4), foco, divisão (`auto`, colunas, linhas, grade) e zoom, num redutor com testes. `expandedTerminalId` virou o painel em foco, então Prompts, Skills, ditado, dock e notificações seguem como estavam.
- **`TerminalDrawer`** virou a casca (largura, recolher, maximizar, fixar, fechar) mais um `TerminalPane` por agente, cada um com o próprio `attachTerminalFitLifecycle`. Com um painel só, a tela é a de antes (os controles da gaveta ficam no cabeçalho do painel).
- **Abrir ao lado:** Ctrl/Cmd+clique no cartão, no Expandir e na linha do painel Elementos. O clique comum troca só o painel em foco. No 5º pedido, sai o painel sem foco usado há mais tempo.
- **Divisão:** botões colunas, linhas e grade 2×2 na barra da gaveta (com 2 ou mais painéis); abaixo de 440 px por painel os painéis empilham e a barra avisa.
- **Foco e teclado:** clique ou Alt+Shift+setas movem o foco; Alt+Shift+Z e o botão dão zoom no painel (os outros param de desenhar, o agente segue vivo). Alt+Shift para não colidir com o Alt+↑/↓ do diff do Claude Code.
- **Fechar painel** nunca encerra o agente. Com 2 ou mais painéis o clique fora não fecha a gaveta.
- Inventário do canvas regenerado, `GUIA-USUARIO.md` atualizado.

**Validação.**
- 24 testes novos do redutor, da geometria, da vizinhança e do atalho; vitest inteiro: no primeiro passe 3.595 passaram e 1 falhou (teste do guia, sob carga), no segundo tudo verde; testes Node: 3.407, 3.395 passaram, 0 falhas; lint e typecheck limpos.
- Rodado de verdade (`devtools launch`, janela 1920×1080): 2 agentes lado a lado (592 px cada, gaveta maximizada), 4 em grade 2×2, 3 com o último cobrindo a linha, empilhado em 1304 px, zoom e volta, Alt+Shift+← moveu o foco do DOM, Fechar painel manteve os 4 cartões.

**Não feito (fica para tasks).** Persistir o arranjo, atalho configurável, bancada de performance (20 terminais com 4 visíveis), cenário no `test:canvas-smoke`, Modo Performance limitando painéis, modo grade no canvas.

---

## 2026-11-17 — Arquitetura: versão do npm embutido registrada e versão instalada das CLIs conferida

**Contexto.** O manifesto das CLIs (`managed-cli-manifest.cjs`) já fixava versão e hash de Codex, Claude e Gemini (hash conferido no registry antes do `npm install`), mas o npm embutido no instalador não deixava rastro de versão e, depois do install, ninguém conferia o que ficou no disco. Task de 12/09.

**O que mudou.**
- `scripts/bundle-npm-runtime.cjs`: `copyNpmRuntime` grava `build/npm-runtime/npm-runtime.json` (`{name, version}` lido do `package.json` do npm copiado), ao lado de `npm/`; no pacote vira `resources/npm-runtime/npm-runtime.json`.
- `electron/services/managed-cli-installer.cjs`: depois de um `npm install` bem-sucedido de `pkg@versao` com hash esperado, `installManagedPackage` lê `package.json` em `layout.nodeModules` (`readInstalledPackageVersion`, injetável como `readInstalledVersion`) e recusa se a versão diverge ou não é legível.

**Validação.** `node --test` nos arquivos da área: 143 testes, 143 passam (3 novos: arquivo irmão com a versão, recusa de versão divergente, leitura do `package.json`).

---

## 2026-11-17 — Dependências: Electron 42 para 45 (macOS 13+) e leitura da área de transferência na API nova

**Contexto.** O Electron 42 saiu da janela de suporte (só 43, 44 e 45 recebem correção; a 45 estabilizou em 21/10). A task irmã "migrar da linha 41" já tinha sido cumprida pelo PR #132 (41 para 42); esta é a etapa que faltava. Decisão do Felipe: Electron 45 e exigir macOS 13 ou mais novo (a 44 removeu o macOS 12). A 43 foi descartada (suporte acaba com a 46, em cerca de 1 mês) e a 44 não ganha nada sobre a 45.

**O que mudou.**
- `app/package.json`: `electron` de `^42.11.16` para `^45.3.3` (instalado 45.3.3: Chromium 156, Node 24.22.3); `mac.minimumSystemVersion: "13.0"` no electron-builder (o `Info.plist` recusa o macOS 12 com aviso claro).
- `app/package-lock.json`: só a entrada do `electron` e a do `node-abi` (4.29.0 para 4.40.0). Sem o `node-abi` novo o `@electron/rebuild` falha com "Could not detect abi for version 45.3.3". A faixa `^4.2.0` do `@electron/rebuild` já admite a 4.40.0. O `npm install` no Windows reescreve o lockfile inteiro (apaga `libc` e os `@emnapi` embutidos do oxide-wasm32-wasi, e o teste `lockfile-consistency` reprova); por isso as duas entradas foram editadas à mão sobre o lockfile da main.
- `app/electron/services/clipboard-image.cjs` (+ teste): o Electron 44 reescreveu o `clipboard` do processo principal (assíncrono, itens W3C; `readImage`/`readBuffer` removidos, `readText` virou Promise). A leitura agora faz um `clipboard.read()`, pega a imagem por `ClipboardItem.getType` (PNG primeiro, depois qualquer tipo de imagem aceito) e resolve listas de arquivos (`text/uri-list`, GNOME direto e pelo formato `electron application/osclipboard`). Sem isso, colar print como anexo quebraria.
- README (Stack: Electron 45, Chromium 156, requisito macOS 13+) e `docs/guias/GUIA-USUARIO.md` (seção macOS).

**Medido / conferido.**
- `node-pty@1.1.0` é N-API (`node-addon-api`): a troca de ABI 146 para 150 não exige recompilar. `npm run test:native` 15/15.
- Quebras da 43 a 45 mapeadas no código: só o clipboard era quebra real. `setLoginItemSettings` só usa `openAtLogin`; o preload só importa `electron`; as janelas e o `<webview>` já são `sandbox: true`; `display-capture` já está no broker de permissões de sites.
- Leitura real no Electron 45 (Windows, script temporário fora do repositório): `clipboard.write` de um PNG e `readClipboardImage()` devolveram `ok`, `image/png`; com só texto, `ok: false`.
- `npx electron-builder --dir -c.npmRebuild=false` gerou `release/win-unpacked` com Electron 45.3.3 e `node-pty/prebuilds` (win32 e darwin) fora do asar. `npm run pack` direto falha no Windows sem toolchain C++ (node-gyp recompila o `node-pty`; é o mesmo motivo de o release usar `npmRebuild=false` no Windows), não por causa da 45.
- Gate: eslint limpo; `tsc -b` limpo; `run-node-unit-tests` 3405/3419 com 2 falhas (a de `lockfile-consistency`, corrigida acima e 6/6 depois, e `pty-output-path-benchmark`, instável, 11/11 sozinho); `vitest` 233 arquivos / 3572 testes verdes; `test:native` 15/15.

**Não validado / pendente.** Linux (`x-special/gnome-copied-files` e `osclipboard`) e macOS não foram exercitados; o app não foi aberto com `devtools launch` nem foi rodado o smoke do canvas/instalador (ficam para o orquestrador depois do merge); o `safeStorage` síncrono (Notion, ditado, contas) está deprecado na 45 e é removido na 46 (task própria); os diálogos de arquivo passam a abrir em Downloads (mudança da 43).

---

## 2026-11-17 — Canvas: o inventário declara o controle do aviso de custo do bloco Claude API

Task: conserto da main, CI vermelho nos três SOs desde d2d55a1 (sem task no Notion). Agente: subagente da Orquestração (Claude Code, Claude Haiku 5.5), 12:28 em diante. Trilha A:

**Causa.** O commit d4b2913 pôs o botão "Entendi, continuar" no aviso de custo do bloco Claude API (`app/src/features/canvas/components/ClaudeApiNode.tsx:514`) e não atualizou o inventário do canvas. O teste "declara exatamente os controles que cada arquivo dono tem" compara a contagem de `<button`, roles, select, toggle e rail do arquivo dono com a soma declarada: 6 no código, 5 no inventário.

**Feito.**
- `app/src/features/canvas/inventory/data/nodes.ts`: controle `Entendi, continuar` (tipo `button`) no bloco `claude-api`, com efeito, falha conhecida e `disabledWhen`, no formato dos vizinhos. A caixa "Não perguntar de novo para esta conta" não entra na contagem, porque o padrão do teste não conta checkbox; o efeito dela está descrito no botão.
- `docs/projeto/INVENTARIO-CANVAS.md` regenerado com `npx vitest run src/features/canvas/inventory -u`: controles de 397 para 398, e a linha nova na tabela.

**Validação.** Antes: `canvas-inventory.test.ts` com 1 falha em 9 ("ClaudeApiNode.tsx: 6 no código, 5 no inventário"). Depois: 9 em 9. Gate: `lint` e `typecheck` sem erro; `node scripts/run-node-unit-tests.cjs` com 3457 passando, 0 falhas e 12 pulados; `vitest run` inteiro com 3639 passando e 4 pulados, em 238 arquivos.

**Não validado.** Clique real no app (mudança só de inventário, sem efeito visível). `npm run build`, que o CI roda, não foi executado localmente.

Estado: concluído (commit `0ad0fce` na branch `orq/fix-inventario-claude-api`; push e deploy pelo orquestrador).

---

## 2026-11-17 — CLIs: o Claude aberto pelo app deixa de se atualizar sozinho

**Contexto.** Duas instalações de CLI apareceram cortadas no meio da extração. A task pedia medir se o Claude e o Codex abertos no terminal do Felixo se atualizam sozinhos.

**Medição (npm falso na frente do PATH, binário copiado, config isolada, nenhum prompt, nada gasto).** O Claude Code 2.1.311/2.1.326 roda, cerca de 10 s depois de abrir, `npm view ...@latest version` e `npm install -g ...@<versão>` com o primeiro `npm` do PATH, sem prefixo, na pasta pessoal. O destino é o prefixo global desse npm (a cópia do sistema), não a pasta gerenciada; fechar o terminal no meio corta a instalação. `DISABLE_AUTOUPDATER=1` e `DISABLE_UPDATES=1` impedem até o `npm view`. O Codex não instala sozinho: só pergunta ("Update now") e instala se a pessoa escolher.

**Decisão do Felipe.** Desligar em todos os terminais do Felixo. Usei só `DISABLE_AUTOUPDATER`, porque `DISABLE_UPDATES` também barraria o `claude update` manual.

**O que mudou.** `createCliEnv` (`electron/services/cli-process-manager.cjs`) define `DISABLE_AUTOUPDATER=1`. Todo ambiente de CLI parte dele (`createAccountCliEnv`): o PTY do canvas, as sessões sem terminal e os processos auxiliares (uso, status, modelos). O Codex ficou como está. Teste novo em `cli-process-manager.test.cjs` prova o valor no ambiente padrão, com `DISABLE_AUTOUPDATER=0` herdado e com conta própria.

**Validação.** lint e typecheck limpos; `run-node-unit-tests` 3454 de 3466 passando (0 falhas, o resto são testes pulados); vitest 3613 passando e 2 falhas alheias: `canvas-inventory.test.ts` (ClaudeApiNode.tsx tem 6 controles e o inventário 5) e o E2E de contexto do canvas, que passou isolado.

---

## 2026-11-17 — Agentes: workflow manual `openia-macos-limpo.yml` para validar o Openia empacotado no macOS

**Contexto.** A validação de 21/09/2026 do Openia empacotado só rodou no Windows. Nenhum CI do macOS tocava no Openia (Release, Nightly, `ciclo-instalacao-clis`, `official-cli-install` e `retomada-e2e-empacotado` não o instalam). Decisão do Felipe em 17/11/2026: o runner `macos-latest`, um macOS real e descartável, substitui o Mac físico, no molde do `openia-windows-limpo.yml`.

**O que mudou.**
- `.github/workflows/openia-macos-limpo.yml`: só `workflow_dispatch`, sem publicar. Baixa o `.dmg` da release (ou constrói do commit com `construir`), usa o Python do sistema (sem setup-python, para ver o PEP 668 do Homebrew) e sobe o relatório como artefato. Secret opcional `OPENIA_TEST_KEY`; sem ele usa chave-sentinela.
- `app/scripts/openia-macos-limpo.cjs`: roteiro em Node, portado do de Windows e reaproveitando as funções de segredo dele. Etapas: linha de base (`pip list --user` fotografado), `.dmg` (hdiutil + ditto), instalação consentida (recusar, interromper o pip, repetir, retry `--break-system-packages` registrado, `openia` em `~/Library/Python/<x.y>/bin`), chave pelo campo do app, terminal Openia, exportação do canvas e varredura do perfil/logs atrás do valor, e desfazer (app removido, pip de volta à linha de base). Fora de propósito: NSIS, aliases `.cmd`/`.ps1`, usuário com espaço, launcher legado (só existem no Windows).
- `openia-windows-limpo.cjs` passa a exportar `custoDaChave` e `higienizarSaida`; comportamento igual.

**Não fica release-relevante.** `release-relevant.sh` devolve `false` para os arquivos novos (workflow, script e teste), então não publicam instalador.

**Validação.** `node --test` do teste novo e do do Windows: 8/8. Lint, typecheck e `run-node-unit-tests` (3456 pass, 0 fail) verdes. Vitest: 3636 pass, 3 falhas em onboarding/canvas-inventory sem relação com estes arquivos (uma persiste isolada em `canvas-inventory.test.ts`). O roteiro em si não rodou: precisa de macOS, e a primeira run do workflow é a validação (limites: não prova Gatekeeper/assinatura nem Intel).

---

## 2026-11-17 — Segurança: eval do processo principal da instância de devtools sem escape pelo `vm`

- **Contexto:** `felixo devtools main "<expr>"` (canal `devtools:main-eval`) avaliava JS com `vm.runInNewContext` e objetos do host (`app`, `BrowserWindow`, `mainWindow`, `ipcProbe`). O comentário prometia "sem `require`/`process`", mas `app.constructor.constructor('return process')()` devolvia o `process` do main. O eval só existe com `FELIXO_DEVTOOLS_PORT` (perfil isolado); o app normal não o registra.
- **O que mudou:** o eval saiu do `main.cjs` para `electron/core/devtools-main-eval.cjs`. Cada objeto do host entra por uma membrana (Proxy sobre casca vazia) que nega `constructor`/`__proto__`/`prototype`, devolve protótipo `null` e embrulha retornos, erros e argumentos de callbacks; o resultado é desembrulhado antes de voltar por IPC. O comentário do `main.cjs` agora diz a verdade: continua sendo controle total de `app`/`mainWindow`, não sandbox para código não confiável.
- **Uso legítimo preservado:** `ipcProbe.snapshot()`, `mainWindow.webContents.send/setZoomLevel`, `app.getPath`, registrar handlers IPC com callback (fixture do smoke do Notion), arrays (`getAppMetrics`) e promises. Limite: `new` sobre objetos do host não é suportado.
- **Validação:** `electron/core/devtools-main-eval.test.cjs` (4 testes): uso legítimo, 20 tentativas de escape (construtores, protótipos, erros, callbacks, `arguments.callee.caller`, `typeof process/require`) sem alcançar `process`/`Function` do host, validação da expressão e canal não registrado sem porta de depuração válida. Sem a membrana a mesma tentativa devolve `process` (medido).

---

## 2026-11-17 — Onboarding: o tutorial `inicial` ganha o roteiro longo (Página Web, Gerar imagem, Organizar, Tarefas Notion)

**Contexto.** Task "implementar o roteiro longo do tutorial decidido em 10/11" (`41491f95-497e-8198-9df0-e4676e329230`). Em 10/11 o Felipe trocou a decisão (e) do `PLANO-TUTORIAL-CANVAS.md`: em vez do roteiro curto, quer o roteiro longo, sem passos interativos (o tour continua só destacando). O tour `inicial` tinha 6 passos e nenhuma âncora para esses quatro controles.

**Motivo.** O tutorial deve apresentar as ferramentas de criação e organização, não só o básico.

**O que mudou.**
- `onboarding-catalog.ts`: três âncoras novas (`criar-pagina-web`, `criar-imagem`, `secao-organizar`) e quatro passos novos no `inicial`, que passa a ter 10 (`projeto`, `agente`, `contexto`, `pagina-web`, `gerar-imagem`, `organizar`, `terminal`, `ferramentas`, `tarefas-notion`, `ajuda`) e `version` 2. Cada passo tem cadeia de alvos que termina em `rail-menu`. Tarefas Notion não tem âncora própria: aponta `secao-ferramentas` (fechada) e cita `notionTasks`. `ONBOARDING_CATALOG_REVISION` continua 2: nenhum id de tour ou feature nasceu, e quem já concluiu o tutorial vê "Atualizado" na Ajuda, sem reabrir nada.
- `onboarding-messages.ts`: título e corpo (mais as variantes de seção e de menu) dos quatro passos, todos dizendo que o tutorial não abre, gera nem move nada.
- `CanvasToolbar.tsx` e `GenerateImageButton.tsx`: `data-felixo-tour-anchor` nos gatilhos de Página Web e Gerar imagem (prop nova `tourAnchor`) e `anchorId` no cabeçalho da seção Organizar.
- Testes: totais "Passo N de 10" e índices do roteiro em `OnboardingUi`, `onboarding-state`, `onboarding-store` e `onboarding-catalog`; as fixtures de versão do tour passaram a derivar da versão atual (`CATALOG_WITH_TOUR_V2`).
- Smoke (`canvas-smoke-onboarding.cjs`): `PASSOS_INICIAL`, `ALVO_PRIMARIO`, `ROTULO_DA_ANCORA`, os totais "de 10" e o SA8 (variantes de menu recolhido nos passos novos, volta até o passo Agente).
- Docs: `PLANO-TUTORIAL-CANVAS.md` (decisão e e roteiro v2), `GUIA-USUARIO.md` (dez passos) e `GUIA-DESENVOLVEDOR.md` (como acrescentar um passo ao `inicial`).

**Decisão do agente.** Um passo por controle (quatro), e não os dois passos agrupados que a task recomendava: o anel marca um alvo só, e agrupar deixaria um dos dois controles sem destaque.

**Validação.** `npm run lint` e `typecheck` limpos. Arquivos do tutorial: 759 testes passam (os testes que varrem o código estouravam 5 s sob carga e passam com `--testTimeout`). `vitest run` inteiro: 236 arquivos, 3619 testes passam, 4 pulados. `run-node-unit-tests.cjs`: 3443 testes, 3431 passam, 12 pulados, 0 falhas. Smoke do canvas, sessões A e B (`FELIXO_SMOKE_SESSOES=A,B`): SA0 a SA10 e SB1 a SB8 ok; o SA1 percorre os 10 passos com `onboarding:write` 2 e `devtools:main-eval` 1 de IPC (nenhuma ação nos alvos) e o SB3 confirma a revisão 2 inalterada. A sessão A só passou na 2ª tentativa: a 1ª caiu em `page.screenshot` com 30 s de timeout em `checarInteracoes`, antes dos cenários do tutorial (máquina carregada); antes disso, cinco rodadas falharam por infraestrutura, nenhuma num cenário do tutorial (sessão DevTools ocupada por outro agente, canvas sem montar em 45 s, Electron sem abrir o CDP, conexão CDP com timeout e o mesmo timeout de screenshot).

**Não validado.** Clique manual nos quatro passos novos com o app instalado; macOS e Linux; leitor de tela real. O texto dos passos novos não passou por revisão do Felipe.

Estado: concluído (commit na branch; deploy pelo orquestrador).

---

## 2026-11-17 — Chat: pedido de agente para abrir página aparece também na tela do chat

**Contexto.** Desde a decisão "Pedir confirmação" (29/09), `felixo browser open` deixa o pedido pendente e o `AgentBrowserRequestCard` só era montado dentro do `CanvasView`. Na tela do chat (o canvas é desmontado, `App.tsx`) o pedido esperava sem aviso até vencer em 1 hora.

**Mudança.** O cartão passou a ser montado no `App`, nas duas telas (saiu do `CanvasView`). Na tela do chat recebe `onOpenCanvas`: o botão "Abrir como Página Web" vira "Ir para o canvas" e só troca de tela, sem decidir, porque o bloco Página Web precisa do canvas (decidir "embutido" sem o canvas montado aceitaria o pedido sem abrir nada). "Abrir no navegador" e "Recusar" valem iguais; as travas (600 ms, clique repetido, conteúdo `{id, destino, url, perfil}` conferido no main) são as do cartão e não mudaram. Inventário do canvas e `ARQUITETURA.md` atualizados.

**Validação.** lint e typecheck limpos; `run-node-unit-tests` 3457 pass/0 fail; vitest 3640 pass, 1 falha (`canvas-inventory.test.ts`, `ClaudeApiNode.tsx: 6 no código, 5 no inventário`, que já falha na `main`). Dois testes novos no `agent-browser-request.test.ts`. Não abri o app real nem rodei o smoke.

---

## 2026-11-17 — Canvas: parar de perder edição e estado em falhas de gravação e ao fechar painéis

Task: Felixo AI Core/Canvas — parar de perder edição e estado em falhas de gravação e ao fechar painéis (Notion `3ec91f95-497e-81a3-9be3-c0d354bf7621`).

**Contexto.** O inventário do canvas listou 13 lacunas em que a pessoa perde trabalho sem saber: o IPC responde `{ ok: false }` e ninguém olha, a leitura falha e vira "canvas vazio", e os debounces de painéis e do canvas eram cancelados ao fechar em vez de gravados.

**O que mudou.**
- `services/canvas-persistence-status.ts` (novo): registro das falhas de gravação por chave (`node:`, `edge:`, `file:`), que só saem quando a próxima gravação daquela chave dá certo. A `CanvasStatusBar` mostra a falha (`role="alert"`).
- `canvas-storage.ts`: `saveCanvasNode`, `deleteCanvasNode`, `saveCanvasEdge` e `deleteCanvasEdge` conferem `ok` e exceção (antes: catch vazio). `loadCanvasNodes` passou a devolver `{ nodes, failed }` e `loadCanvasEdges` registra a falha: lista vazia de verdade e "não consegui ler" deixam de ser a mesma coisa. Com leitura falha o histórico de notificações não é podado (`useCanvasNotifications`/`CanvasView`).
- `services/debounced-save-queue.ts` (novo): debounce por chave com `flush`. `useCanvasPersistence` grava o pendente ao desmontar e no `pagehide`; `NotesPanel` e `PromptsPanel` gravam ao fechar. `cancelPendingSaves` (Limpar/importar) continua descartando de propósito.
- Bloco Arquivo: `useFileNodeDocument` confere o resultado de `canvas-file:write`/`text-file:write` (`services/file-node-write.ts`), mostra a falha numa faixa no bloco e na barra de status, e a leitura falha do `.md` do app também aparece. `addFileNode` só cria o bloco se o `.md` foi criado.
- `ExcalidrawDrawingNode`: o timer não sobrevive ao bloco; fechar entrega a cena pendente ao canvas.
- `GitPanel`: commit que falha mantém a mensagem digitada (`runAction` devolve se deu certo).
- `OrchestratorPanel`: `saveOrchestratorSettings` devolve o valor gravado e a tela passa a mostrá-lo (0 ou decimal viram o padrão visível).
- `CanvasPanel` ganhou `confirmClose`: Esc e Fechar no detalhe de prompt com rascunho não salvo perguntam antes (`PromptDetailPanel` avisa o estado sujo).
- Inventário regenerado: 12 lacunas saíram, falhas/efeitos ajustados e os testes novos citados. Ficam duas lacunas desta task: a sincronização automática do Notion (a conexão/database/visualização do Painel já persistiam) e o Excalidraw ao desmontar o canvas inteiro.

**Validação.** Testes novos (falham antes, passam depois): `canvas-storage.test.ts` 4 (4 falhas com o código antigo), `orchestrator-settings-storage.test.ts` 1 (falhava antes), `file-node-write.test.ts` 3 e `debounced-save-queue.test.ts` 3 (módulos novos). `npm run lint` e `typecheck` limpos; `vitest run` 3622 pass, 4 skipped, 0 falha; `run-node-unit-tests` 3444 pass, 0 falha.

**Não validado.** Nenhum painel ou bloco foi montado (o vitest do projeto roda em node, sem renderizador): o flush de Notas/Prompts, o confirm do detalhe, a faixa do bloco e a barra de status não foram vistos rodando; o app não foi aberto.

Estado: concluído com ressalvas (commit na branch; deploy pelo orquestrador).

---

## 2026-11-17 — Links: alvo de toque do menu de destino com 44 px; leitor e toque reais seguem pendentes

Task: Felixo AI Core/Links — validar o menu de destino com leitor de tela e tela sensível ao toque reais (Notion `3ea91f95-497e-812b-a108-fb89c94fa528`). Agente: subagente da Orquestração (Claude Code, Claude Haiku 5.5, effort max), 12:24–12:45. Trilha manual; estado MANUAL.

**Contexto.** O menu "para onde abrir" (navegador, Página Web ou copiar) serve o terminal, o Markdown e o bloco Página Web. Até aqui ele só foi testado por automação: sem NVDA, Orca ou VoiceOver e sem dedo numa tela de toque. Leitor e toque reais são passo humano; o que dá para provar daqui foi medido.

**O que mudou.**
- `LinkChooserHost.tsx`: a escolha do menu usa `any-pointer-coarse:min-h-11` no lugar de `any-pointer-coarse:py-2.5`. No toque, a escolha ia a 36 px (texto de 16 px e 10 px de padding em cima e embaixo); agora tem 44 px (WCAG 2.5.5). Com o mouse segue em 28 px.
- `link-chooser-menu.test.ts`: trava de que o JSX mantém a altura de toque (a suíte roda sem DOM, como em `floating-layer.test.ts`).

**Validação.**
- App vivo (`devtools launch --timeout 120000`, perfil isolado, janela invisível, toque emulado pelo CDP): escolhas com 44 px no toque e 28 px no mouse; foco no primeiro item ao abrir (clique e Enter); setas e End andam; Esc fecha e devolve o foco ao link. `devtools quit` encerrou a sessão.
- Réplica do menu com o CSS compilado do repo, no Chromium: 36 px antes, 44 px depois.
- Árvore de acessibilidade do app: o `menu` "Abrir link" tem a descrição com o destino; os três `menuitem` não têm descrição.
- `vitest src/features/shared/links`: 5 arquivos, 95 testes verdes. Lint e typecheck limpos. Testes Node: 3469, com 3457 passando e 0 falhando. Vitest inteiro: 3639 passam; 1 falha em `canvas-inventory.test.ts` (`ClaudeApiNode.tsx`: 6 controles no código e 5 no inventário, desde d4b2913). Fora desta mudança.

**Não validado.** Leitor de tela real e toque com dedo em tela real. Se o NVDA não ler o destino ao cair no primeiro item (a descrição está só no menu), a correção é `aria-describedby` em cada escolha. No terminal, sem a tecla de menu e sem o hover não há caminho de teclado até o link: decisão pendente no Notion.

Estado: MANUAL (roteiro no relatório e no corpo da task). Commit na branch `orq/links-validar-menu-destino-com`; push e deploy pelo orquestrador.

---

## 2026-11-17 — Prompts: teste que reproduz a falha do pty:write ao entregar a referência do catálogo

Task: Felixo AI Core/Prompts — reproduzir cenário de falha: pty:write falho ao entregar a referência (Notion `3d791f95-497e-81cd-b05c-c9d6370c81a3`). Agente: subagente da Orquestração (Claude Haiku 5.5, effort max), 12:24 em diante. Trilha A.

**Contexto.** O painel de Prompts digita a referência do catálogo no terminal aberto pelo `pty:write`. Quando a escrita falha, o painel precisa mostrar o aviso e deixar a nova tentativa funcionar. O harness de origens (`app/src/features/canvas/terminal/prompt-origins-e2e.test.ts`) simulava só o `pty:write` que responde `ok: false`; o caso em que a ponte lança (IPC caído) não passava pela cadeia do painel.

**O que mudou.** O harness aceita um `Error` na fila de `pty.write` e o lança. Caso novo "PTY lança na primeira escrita": prova o aviso em erro (`describeSingleInsertFeedback`, `isError: true`), nada gravado como inserção, e a nova tentativa como única entrega confirmada, sem Enter. Nenhuma mudança de código de produto.

**Validação.** `prompt-origins-e2e.test.ts`: 22/22 antes, 23/23 depois. Com o aviso em `isError: false`, ou a falha lida como `'sent'`, o caso novo falha (mutações temporárias, arquivo restaurado). Gate: lint sem avisos (exit 0), typecheck limpo (exit 0), testes Node 3457 passam e 0 falham, vitest 3639 passam e 1 falha que já existe na `main`: `canvas-inventory` declara 5 controles do `ClaudeApiNode.tsx` onde o código tem 6, desde d4b2913 (não relacionada a este commit).

**Não validado.** Clique real no app empacotado (task irmã `3d791f95-497e-81bf-a6c7-efef573d87ae`). O JSX do painel não é renderizado pelo vitest (ambiente `node`).

**Achados da mesma falha, não corrigidos.** Em `app/src/features/canvas/terminal/terminal-session-store.ts`: a mensagem do processo principal some (`erro` é lido, `message` é enviado: linhas 1749 e 1807); o aviso "usou o fallback inline" permanece depois de uma falha do PTY (linha 2795); `contextArtifactNames` marca como digitada uma referência recusada (linhas 2779 e 1755). Viraram pendências.

Estado: concluído (commit `ea03bb9` na branch; deploy pelo orquestrador).

---

## 2026-11-17 — Terminal: o toque acha o link na célula em que o mouse parou por último

Task: Felixo AI Core/Terminal — fazer o toque achar o link na célula em que o mouse esteve por último (Notion `3ea91f95-497e-81f7-87db-e708280f2710`). Agente: subagente da Orquestração (Claude Sonnet 5.5, effort medium). Trilha A.

**Contexto.** O Linkifier do `@xterm/xterm` 6.0.0 só consulta os provedores de link quando o ponteiro muda de célula do buffer (`_lastBufferCell`, `Linkifier.ts:83`), e o `mouseleave` não esquece essa célula. Passar o mouse num link, tirá-lo do terminal e tocar no mesmo link gerava um `mousemove` na mesma célula: sem link corrente, o toque não abria o menu de destino.

**O que mudou.**
- `terminal-mouse-selection.ts`: `neighborCellClientX` devolve um x na célula vizinha (direita; na última coluna, esquerda).
- `terminal-session-store.ts` (`bindMouseSelection`): ouvinte de `pointerdown` em captura. Para toque e caneta, dispara um `mousemove` sintético na célula vizinha antes do `mousemove` real que o Chromium sintetiza; o real então muda de célula e o Linkifier consulta os links. Sem campo privado do xterm; mouse comum não passa por aqui, então seleção por arrasto e clique com mouse tracking (que dependem do `mousedown`) ficam intactos.
- `canvas-smoke-links.cjs`: `tocar(x, y, { visitado: true })` passa o mouse pelo próprio ponto antes de tirá-lo; os dois toques do terminal (L9) usam isso.
- `terminal-mouse-selection.test.ts`: 2 testes novos do cálculo da célula vizinha.

**Não validado.** O passo L9 do smoke não foi rodado (a regra do contrato reserva o `test:canvas-smoke` ao orquestrador); o toque real em tela sensível também não. Issue/PR no xterm.js (opção a da task) fica de fora.

---

## 2026-11-17 — Links: o link do terminal pelo teclado fica como limitação aceita

Task: Felixo AI Core/Links — decidir se o link do terminal abre pelo teclado (Notion `41b91f95-497e-81c9-b12f-edb0b8ed0b2d`). Agente: subagente da Orquestração (Claude Haiku 5.5, effort max), 12:57–13:22. Trilha: decisão do Felipe (17/11) registrada como documentação.

**Contexto.** A validação do menu de destino com leitor de tela (task `3ea91f95-497e-812b-a108-fb89c94fa528`) achou que, no terminal, quem usa só o teclado não tem caminho até um link: o menu só nasce com o mouse sobre o link. A task deixou a escolha para o Felipe: uma task própria para desenhar o caminho pelo teclado, ou aceitar a limitação.

**Decisão.** Felipe, em 17/11/2026: abrir um link do terminal só pelo teclado fica como limitação aceita (opção 2 da task). A opção 1 não foi aberta.

**O que mudou.**
- `app/src/features/canvas/inventory/data/terminal.ts`: lacuna nova no elemento "Ciclo do processo PTY no renderer" (dono `terminal-session-store.ts`), com a decisão e as linhas medidas: Ctrl/Cmd+clique em `:765-776`; hover em `:779-781`; clique direito e tecla de menu em `:1283-1292`; o handler de teclas do xterm em `:1052` não abre link. Risco médio; a task da decisão é a referência.
- `docs/projeto/INVENTARIO-CANVAS.md`: regenerado com `npx vitest run src/features/canvas/inventory -u`. Lacunas de 229 para 230 (médio de 118 para 119) e tasks de 61 para 62.

**Validação.** `npx vitest run src/features/canvas/inventory --testTimeout=60000`: 9 de 9. Sem o flag, dois testes do inventário estouram 5 s neste P: (medido: 9,5 s e 2,5 s; a linha de base sem a mudança já tinha 2 timeouts). Gate: `npm run lint` exit 0 (277 s); `npm run typecheck` exit 0 (66 s); `scripts/run-node-unit-tests.cjs`: 3463 de 3477 passam, 2 falham, 12 pulados; `npx vitest run`: 3655 de 3666 passam, 7 falham, 4 pulados, e nenhuma das falhas importa o inventário. A mudança não tem efeito visível: o app não importa o inventário, então não abri o app.

**Não validado.** Leitor de tela real e toque com dedo em tela real seguem na task de origem. As falhas fora desta mudança estão no relatório da task e viraram pendências no Notion: timeouts de leitura de arquivos e falhas que só aparecem na suíte inteira.

Estado: concluído (commit `266440ad` na branch; push e deploy pelo orquestrador).

---

## 2026-11-17 — Segurança: o renderer recusa os rótulos xn-- que o main recusa

**Contexto.** A revisão da política única de URL externa mostrou que o Chromium aprova hosts como `https://xn--a.com/`, `xn--ab--c.com`, `xn---a.com` e `XN--A-ECP.ru`, que o Node (ada) recusa no parse. O terminal mostrava a dica de clique e o Markdown renderizava `<a>`, mas o main reclassificava como `malformada` e nada abria. Falhava fechado, sem bypass, mas era link morto.

**O que mudou.** `app/src/features/shared/external-url-policy.ts` ganhou `decodePunycode` (RFC 3492, sem dependência, recusa caractere fora do alfabeto, estouro de inteiro, acima de U+10FFFF e surrogate) e `hasInvalidPunycodeLabel`: para esquemas web, depois do `new URL`, recusa como `malformada` o rótulo `xn--` cujo decode falha, não gera caractere não-ASCII, ou cuja recodificação (`new URL('https://' + decodificado + '/')`) difere do rótulo. A tabela `external-url-policy.cases.json` ganhou 6 casos (5 recusas e o IDN legítimo `xn--e1afmkfd.xn--p1ai`).

**Validação.** `external-url-policy.test.ts`: 100 testes passam (eram 90); `node --test external-url-policy.test.cjs`: 90 passam; node unit completo: 3471 pass, 0 fail. No Node a decisão já era recusa, então a tabela não distingue antes/depois; `decodePunycode` e `hasInvalidPunycodeLabel` têm teste direto, mais 20 mil rótulos aleatórios (renderer nunca aprova o que o main recusa) e 5 mil IDNs legítimos (decisão igual ao main).

**NÃO verificado.** Não rodou no Chromium: o Electron não abriu (nem `felixo devtools launch`) nesta sessão. Divergência conhecida e segura: em Punycode não canônico (`xn---sor.com`) o Node aceita e o renderer recusa.

---

## 2026-11-17 — Links: o menu de destino diz em que perfil a Página Web nova vai abrir

Task: Felixo AI Core/Links — dizer no menu em que perfil a Página Web nova vai abrir (Notion `3ea91f95-497e-8128-b79e-e492f3bbd486`). Agente: subagente da Orquestração (Claude Sonnet 5.5, effort medium). Trilha A.

**Contexto.** "Abrir como Página Web", a partir de uma Página Web num perfil do navegador interno, cria o bloco novo no mesmo perfil (`webpageProfileForLinkSource`), com a sessão e o login dele. O menu dizia só "Abrir como Página Web": a pessoa escolhia sem saber em que conta a página ia abrir.

**O que mudou.**
- `link-chooser-store.ts`: `LinkChooserRequest.webpageProfileName` (opcional), o nome do perfil da origem. O menu não lê o canvas; o nome vem pronto de quem abre o pedido.
- `WebpageNode.tsx`: lê o perfil do bloco (`describeWebviewProfile` + `useWebviewProfiles`) e manda o nome no pedido só quando o perfil é próprio (`state === 'custom'`). No Padrão, perfil removido ou lista ainda carregando, não manda nada e o menu fica como antes.
- `link-destination.ts`: `linkChoiceEntries` aceita `webpageProfileName` e rotula a opção "Abrir como Página Web (perfil NOME)". Sem canvas (tela do chat), a opção continua ausente e o nome não aparece em lugar nenhum.
- `LinkChooserHost.tsx`: repassa o nome a `linkChoiceEntries`.
- Inventário do canvas (`inventory/data/overlays.ts`) e `docs/projeto/INVENTARIO-CANVAS.md` regenerados: estado normal do menu e a linha citada da lacuna do clipboard (`LinkChooserHost.tsx:330-333`, deslocada em 4 linhas).
- O nome do perfil é dado da pessoa: não vai para log.

**Validação.** Testes novos em `link-destination.test.ts` (com perfil: rótulo com o nome; sem canvas: nome ausente); os de antes provam que sem perfil nada muda. O lint pegou uma escrita em ref durante o render (`react-hooks/refs`) e ela foi para um `useEffect`. Gate e números no relatório da task.

**Não validado.** Menu aberto de verdade a partir de uma Página Web num perfil próprio (o passo de smoke que a task pedia não foi acrescentado: virou pendência). Perfil removido: o bloco novo herda a partição vazia e o menu não avisa.

Estado: concluído (commit na branch `orq/links-dizer-menu-que-perfil`; push e deploy pelo orquestrador).

---

## 2026-11-17 — Canvas: rastro `[felixo:selo]` para diagnosticar o selo "trabalhando" grudado

Task: Felixo AI Core/Canvas — diagnosticar badge trabalhando grudado com terminal parado (Notion `3d791f95-497e-8190-84e0-df5328591a14`). Agente: subagente da Orquestração (Claude Sonnet 5.5, effort medium), sobre o diagnóstico de leitura de um Haiku. Trilha A.

**Contexto.** O selo ficava aceso com o terminal parado. O log temporário `[felixo:signature]` saiu em `639c3571` (12/09) sem ter sido lido, e o `25b5f177` (OSC 7501 e título) tirou a tela da decisão para o Claude que responde à sondagem. Sobram dois caminhos sem prova: o relato `working` do Claude não tem prazo no app, e o título com spinner (repintado a cada 0,1 a 1,3 s nas gravações) segura o selo com a tela parada. Prazo ou mudança de precedência alteram o que o usuário vê, e sem reprodução seria chute.

**O que mudou.** `terminal-session-store.ts` ganhou `traceSelo`, desligado por padrão: só liga com `localStorage.setItem('felixo:selo','1')` (lida uma vez por sessão do terminal, campo `seloTraceOn`; desliga com `removeItem`), porque as linhas trazem texto da tela e não devem rodar para todo usuário. Ligado, ele só observa e escreve uma linha `[felixo:selo] <ms> <session.id> <evento> <detalhe>` no console. Eventos: `assinatura` (a tela mudou de verdade, com o fim de antes e depois e o `programStatus`, no máximo 1 por segundo), `titulo` (cada OSC 0/2 e se o spinner gira), `7501` (cada relato aceito, `clear` incluso), `titulo-segura` e `tela-ocupada` (o selo foi mantido pelo spinner do título ou pela faixa de trabalho; no máximo 1 por 5 s por sessão). Nenhuma decisão mudou: `computeSignature`, `isBusyScreen` e a precedência 7501 > título > tela ficam como estavam. O comentário no método diz como remover (ao fechar esta task).

**Validação.** `terminal-session-store.test.ts`: 148 antes, 151 depois (3 novos: desligado nada é escrito; ligado o rastro registra 7501, título e assinatura sem mudar o estado; a limitação de 5 s do `titulo-segura`). Gate: ver relatório.

**Não validado.** Nenhuma sessão ao vivo com o Claude de hoje. O reproduzir é passo do Felipe (roteiro na task, status MANUAL). O rastro mostra até 120 caracteres do fim da tela: não cole as linhas em lugar público sem olhar.

Estado: rastro entregue; task em MANUAL. Commit na branch `orq/canvas-diagnosticar-badge-trabalhando-gr`; push e deploy pelo orquestrador.

---

## 2026-11-17 — CI: o smoke grava o diagnóstico do "APP NÃO MONTOU" e sobe o log do Vite

Task: Felixo AI Core/CI — investigar o canvas que não montou em 45 s na sessão A do smoke no Windows (Notion `3ea91f95-497e-813a-a18c-c844403fb7b3`). Agente: subagente da Orquestração (Claude Sonnet 5.5, effort medium), continuando a coleta de um Haiku (133 execuções do CI, 79 do Nightly).

**Contexto.** Cinco travamentos de 45 s no CI do Windows (29/09 a 07/10), nenhum no Nightly; nenhuma montagem caiu entre 30 e 45 s, então são travamentos, não lentidão. A causa não saía dos logs: o smoke só dizia "APP NÃO MONTOU". O log do Electron já ia no artefato (o smoke o liga sozinho), mas o do Vite não existia.

**O que mudou.**
- `canvas-smoke.cjs` (`checarMontagem`): na falha grava `felixoAppReady`, `[data-felixo-app-shell]`, `readyState`, texto do `role="status"`, as entradas de `performance` da `CanvasView` (saiu? status? terminou?) e erros de console/`pageerror`. No CI continua esperando até 135 s além do teto (`FELIXO_SMOKE_POS_MONTAGEM_MS`; 0 fora do CI) e loga se a `CanvasView` apareceu (lentidão) ou não (travou). O teto de 45 s não mudou.
- `canvas-smoke-diagnostics.cjs`: `descreverEstadoDoShell` e `descreverDesfecho` (puras, com teste).
- `felixo-devtools.cjs` (`ensureVite`): `FELIXO_DEVTOOLS_VITE_LOG` manda a saída do Vite para um arquivo; o smoke liga por padrão e o copia limpo para `canvas-smoke-evidencia` (artefato que ci.yml e nightly.yml já sobem). Sem a variável o Vite segue silencioso.
- `GUIA-DESENVOLVEDOR.md`: a "causa conhecida" (runner lento) passou a "não confirmada".

**Validação.** `node --test` dos 3 arquivos tocados: 37 de 37; `run-node-unit-tests.cjs`: 3474 passam, 0 falham, 12 pulados; eslint dos 5 arquivos: exit 0. Não rodei o smoke nem forcei uma falha, então o caminho de falha (o `evaluate` e a espera estendida) só foi checado por sintaxe e pelos testes das funções puras.

---

## 2026-11-17 — Sessões: a descoberta do Codex acha os rollouts recentes acima de 3000 arquivos

- **Contexto:** `collectFiles` (`agent-session-discovery.cjs`) percorria `~/.codex/sessions/AAAA/MM/DD` na ordem do diretório e parava em `MAX_FILES = 3000`. Com mais de 3000 rollouts, o teto enchia com as pastas antigas e a descoberta devolvia `null`.
- **O que mudou:** cada diretório lido agora ordena as entradas por nome decrescente antes de enfileirar; o teto corta só os mais antigos. O teto não foi ampliado.
- **Validação:** teste novo (3100 rollouts vazios em 2025/01/01 + 1 de hoje) falha antes (13 pass, 1 fail) e passa depois (14 pass); `run-node-unit-tests.cjs`: 3487 testes, 3475 pass, 0 fail. O teste usa pasta temporária, não lê o `~/.codex` real.
- **Não verificado:** custo síncrono da varredura no processo principal (não medido); varredura assíncrona ou intervalo crescente ficam fora.

---

## 2026-11-17 — Canvas: tipos dos testes do rastro do selo (CI vermelho na main)

Agente: subagente da Orquestração (Claude Haiku 5.5, effort max). Conserto urgente, sem task no Notion.

**Contexto.** O CI de `42cface6` quebrou no passo Build renderer (typecheck) com seis `TS7006` em `app/src/features/canvas/terminal/terminal-session-store.test.ts`, nos testes do rastro `[felixo:selo]` que entraram hoje. O helper `linhas` tipava o spy como `ReturnType<typeof vi.spyOn>`, e os callbacks de `map`, `filter` e `some` saíam sem tipo.

**O que mudou.** O parâmetro de `linhas` passa a `{ mock: { calls: unknown[][] } }`; os callbacks herdam o tipo, como no resto do arquivo. Uma linha, sem mudança de comportamento.

**Validação.** Typecheck: os seis `TS7006` somem e nenhum erro novo aparece (listas de erro comparadas antes e depois). `vitest run` do arquivo: 151 de 151. `eslint` no arquivo: sem erros. Localmente o typecheck ainda acusa 105 `TS7016` do `lucide-react`, por pacote sem declarações na `node_modules` compartilhada; o CI não tem esses erros.

**Não validado.** `npm run lint` completo e a suíte inteira não rodaram nesta correção.

Estado: concluído na branch `orq/fix-tipos-teste-selo`; push e deploy pelo orquestrador.

---

## 2026-11-17 — Terminal: o relançamento automático do Codex respeita a escolha da faixa de retomada

Task: Felixo AI Core/Terminal — fazer o relançamento automático do Codex respeitar a escolha da faixa de retomada (Notion `3eb91f95-497e-8178-bc58-cd545a4f4cc8`). Agente: subagente da Orquestração (Claude Sonnet 5.5, effort medium).

**Contexto.** Achado R5 da revisão do fluxo de retomada. Se a pessoa escolhia "Escolher na lista (/resume)" ou "Abrir conversa nova" e o Codex se atualizava e saía, o store relançava sem a escolha: não digitava `/resume`, não dava ao agente o aviso de conversa nova, e o cartão dizia que reiniciou numa conversa nova (passando por cima do que ela acabara de pedir).

**O que mudou.**
- `terminal-session-store.ts`: `SessionOptions.resumeChoice`. No relançamento pós-update, havendo escolha e retomada não exata, o texto vem de `resolveTerminalInitialText` (a fonte única do primeiro spawn) e o aviso "conversa nova" não é montado. Sem escolha, nada muda; passagem de responsabilidade continua nunca reenviada.
- `TerminalNode.tsx` (`ensure`) e `CanvasView.tsx` (`relaunchTerminal`) passam `resumeChoice` do nó para a sessão.
- `ARQUITETURA.md`: seção do relançamento automático do Codex.

**Validação.** `terminal-session-store.test.ts`: 151 antes, 153 depois (2 novos: lista e conversa nova sobrevivem ao relançamento); os 2 falham sem a correção e passam com ela.

**Não validado.** Auto-update real do Codex com a faixa aberta (só no harness do store).

Estado: concluído (commit na branch `orq/terminal-fazer-relancamento-automatico-c`; push e deploy pelo orquestrador).

---

## 2026-11-17 — Chat: a retomada da conversa só vale na mesma pasta e conta, e o Gemini nunca vai por ID

**Contexto.** O canvas decide a retomada por `explainAgentResume` (mesma pasta, mesma conta, Gemini só por versão provada). O chat guardava `providerSessionId` por thread em memória (`cliThreadSessions`) sem conferir nada: o Claude persistente subia com `--resume <id>` depois de a pasta ou a conta mudar (a cadeia automática troca de conta a cada pedido), abrindo o histórico de uma conta na cobrança de outra ou falhando com o erro cru da CLI.

**O que mudou.**
- `electron/services/chat-resume-plan.cjs` (novo): `checkChatThreadResume` carimba pasta e conta na thread e, quando mudam, zera `providerSessionId` e `hasStarted` (a thread recomeça com o histórico no pedido) e devolve os motivos com os mesmos códigos do canvas (`cwd-mismatch`, `account-mismatch`), sem ID. `ipc-handlers.cjs` chama antes do spawn e devolve `resume` no resultado de `cli:send`.
- `src/features/chat/services/chat-resume-notice.ts` (novo): o aviso usa `describeAgentResumeForPerson` do canvas, que ganhou `subject: 'bloco' | 'chat'` (padrão `bloco`, o canvas não muda). O aviso aparece no compositor, no lugar do aviso de conta (`ChatWorkspace.tsx`).
- Gemini: `getResumeArgs` (que montava `--resume <uuid>`) saiu dos adapters `gemini` e `gemini-acp`; `canResume()` já era `false`, agora com o porquê (o modo `-p`/ACP não foi medido).
- Guia do usuário: parágrafo "E no chat?" em "Retomar conversas de agentes".

**Validação.** `node --test` dos adapters Gemini e do plano: 45/45; vitest de `chat-resume-notice` (paridade entre o plano do chat e `explainAgentResume` em 4 casos) e `agent-session`: 44/44; suíte node 3478/3491 (a única falha, `pty-output-archive` "o lote sai sozinho", passa isolada 12/12); lint limpo.

---

## 2026-11-17 — CLI do contexto: a leitura negada pelo Windows (EPERM) ganha teste de reprodução

Task: Felixo AI Core/Prompts — reproduzir cenário de falha: permissão negada ao ler o arquivo de contexto (Notion `3d791f95-497e-818c-ad35-d87e2283c8a2`). Agente: subagente da Orquestração (Claude Haiku 5.5, effort max).

**Contexto.** A task-mãe pede, para o cenário "permissão negada ao ler o arquivo de contexto", confirmar aviso visível e retry funcional. O teste de negação em `electron/cli/context-command.test.cjs` só cobria `EACCES`, o código do POSIX. Num ACL que nega a leitura de verdade, o Windows devolve `EPERM`.

**O que mudou.** Três testes novos em `app/electron/cli/context-command.test.cjs`: `EPERM` não gera nova tentativa e grava `failed` no QA; depois da negação, a mesma leitura entrega o corpo e o QA guarda `failed` e `read`; no Windows, ACL real via `icacls` (pulado nos outros sistemas). Nenhum código de produto mudou. O aviso no bloco do terminal não existe e fica como decisão para o Felipe, no relatório da task.

**Validação.** Medido no Windows, com perfil temporário: leitura normal sai com código 0; com ACL negado, o shim sai com código 2 e `EPERM` no stderr; restaurada a permissão, a mesma leitura sai com código 0. `node --test electron/cli/context-command.test.cjs`: 18 de 18 (eram 15). Mutação temporária em `ERROS_QUE_VALEM_NOVA_TENTATIVA` (incluindo `EPERM`) e no registro QA: o teste novo falha nas duas; o arquivo foi restaurado e conferido com `cmp`. `run-node-unit-tests.cjs` (depois do rebase na main): 3478 passam, 0 falham, 12 pulados, de 3490.

**Não verificado.** App empacotado e bloco na tela (não rodados); o teste de ACL no CI do Windows (não rodado lá).

---

## 2026-11-17 — Retomada: a faixa lista as conversas da pasta e da conta para escolher outra

Task: Felixo AI Core/Retomada — listar no app as conversas da pasta e da conta para escolher outra (Notion `3eb91f95-497e-81bb-a374-eb2e336c73c6`). Agente: subagente da Orquestração (Claude Sonnet 5.5, effort medium).

**Contexto.** A faixa de retomada só oferecia o `/resume` da CLI, que filtra por pasta: no motivo "a conversa nasceu em outra pasta" a conversa certa não aparecia e a pessoa concluía que ela não existia. A descoberta já sabia onde cada provider e perfil de conta guardam o histórico.

**Decisões.** (1) Só data e pasta na lista, sem título: o título pode ter dado sensível e o critério da task é não ler conteúdo além de metadados; vira lacuna declarada no inventário. (2) A lista só é oferecida onde a retomada por ID vale (`capability.method === 'exact-id'`, bloco com pasta), para não prometer o que o Gemini anterior à 0.57 não faz. (3) Escolher conversa de outra pasta muda o `cwd` do bloco, com `confirm`.

**O que mudou.**
- `agent-session-discovery.cjs`: `listAgentSessions` reaproveita os leitores de metadado, as pastas por provider e a regra de pasta (Gemini normalizado) da descoberta; devolve `{ folder, account }` com ID, pasta e `modifiedAt`, até 30 por grupo e 400 arquivos abertos. `readFirstLine` virou `readHead` + `firstLine` (sem mudança de comportamento).
- `pty-process-manager.cjs` (`listAgentSessions`, com o ambiente da conta do bloco), `pty-ipc-handlers.cjs` (`pty:list-sessions`), `preload.cjs` e `vite-env.d.ts`.
- Renderer: `agent-session-list.ts` (valida o que vem do main), `ResumeSessionPicker.tsx` (cartão e gaveta), ação `choose` e `chooser` na faixa, `chosenSessionPatch` (associa a conversa, guarda a anterior, troca a pasta, limpa falha e escolha) e `handleChooseResumeSession` no `CanvasView`.
- Inventário do canvas atualizado e `INVENTARIO-CANVAS.md` regenerado; `GUIA-USUARIO.md` e `ARQUITETURA.md`.

**Validação.** `agent-session-discovery.test.cjs` e `pty-ipc-handlers.test.cjs`: 55/55 (6 testes novos de lista com árvores sintéticas de Codex, Claude e Gemini, `CODEX_HOME` da conta, teto, subagente e nenhum texto de conversa na saída; 2 do IPC); `pty-process-manager.test.cjs`: lista lê a pasta da conta, não a do login; vitest `terminal-resume-banner` (51) e `agent-session-list` (3). Gate: lint e typecheck limpos; node 3487/3500 (a falha, `pty-output-path-benchmark` "variante ipc", passa isolada 11/11); vitest 3698 passaram, 4 ignorados.

**Não validado.** O app não foi aberto (porta 5173 ocupada por outro agente): a lista no cartão e na gaveta, os `confirm` e a retomada real depois da escolha não foram vistos. Nenhum smoke cobre a lista.

Estado: concluído na branch `orq/retomada-listar-app-conversas-pasta`; push e deploy pelo orquestrador.

---

## 2026-11-17 — Notion: "Enviar para agente" no bloco Tarefas Notion, com a CLI já autenticada

Task: Felixo AI Core/Notion — enviar uma task do bloco Tarefas Notion para um agente com a CLI do Notion pronta e autenticada (Notion `3eb91f95-497e-81a5-8c4d-d2d9561a0bc8`). Agente: subagente da Orquestração (Claude Sonnet 5.5, effort medium).

**Contexto.** O bloco listava, editava e concluía tasks, mas não havia como levar uma delas a um agente; e o app não entregava credencial ao terminal, então o agente dependia de a CLI `notion-tasks` estar instalada e logada na máquina. O registro central de MCPs (hoje) guarda segredo no cofre e injeta no terminal, mas prefixa as variáveis (`FELIXO_MCP_<ID>_<NOME>`) e tem cópia própria dos segredos; a CLI lê `NOTION_TOKEN` literal e a conexão do Notion já tem cofre (`notion-connection-store.cjs`). Por isso o caminho é o mesmo padrão (cofre `safeStorage` mais ambiente do terminal, id pelo IPC, valor só no main), sem duplicar o token no registro de MCPs.

**O que mudou.**
- `electron/services/notion-agent-env.cjs` (novo): `createNotionAgentEnv` (id da conexão para `{ NOTION_TOKEN }`, lido do cofre; ausente/sem token = `null`) e `checkNotionCli` (roda `notion-tasks --json perfis listar` sem token no ambiente; devolve `installed` e `activeProfile`, nunca a saída).
- `pty-process-manager.cjs`: `injectNotionToken` depois do `injectMcp`, só com `notionConnectionId` e comando; `pty-ipc-handlers.cjs` repassa só o id; `main.cjs` liga ao cofre de `notionHandlers` (lazy). IPC `notion:cli:status` e `window.felixo.notion.cliStatus`.
- Renderer: `notion-task-agent.ts` monta o terminal do preset "Tasks do Notion" (Codex) com link, propriedades e corpo no contexto inicial (por arquivo) e `notionConnectionId`; o id viaja por `NewTerminalOptions`, dados do bloco, `TerminalNode`, `terminal-session-store` e o spawn. `NotionTasksPanel`: botão "Enviar para agente" na linha e no detalhe; confere a CLI antes e avisa o `pipx install notion-automacoes` se faltar; `CanvasView` entrega `onSendToAgent` pela ponte estável de abrir terminal.
- Inventário do canvas: 2 controles novos, documento regenerado (398 para 400). README atualizado.

**Decisão sobre o token.** Direção do Felipe: reaproveitar cofre e ambiente do terminal. O token fica no ambiente do processo do agente (e dos filhos dele), como no registro de MCPs; nunca em argv, log, arquivo de contexto, renderer, commit ou Notion. Limite medido: a CLI aplica o perfil ativo dela depois do ambiente, então um perfil ativo vence o `NOTION_TOKEN` do app; o painel avisa o nome do perfil.

**Validação.** `vitest` de `notion-task-agent` (3), `node --test` de `notion-agent-env` (3) e do `pty-process-manager` (teste novo do token só no terminal que pediu); diagnóstico real contra a CLI instalada (`installed: true`, perfil ativo lido, token nunca na saída).

**Não validado.** App aberto (porta ocupada por outro agente), clique real no bloco, agente subindo com a CLI autenticada de ponta a ponta, máquina sem a CLI e instalação por `pipx` (só o aviso existe; a instalação automática ficou como pendência).

Estado: concluído nesta fatia (commit na branch `orq/notion-enviar-uma-task-bloco`; push e deploy pelo orquestrador).

---

## 2026-11-17 — Canvas: os embeds do Excalidraw voltam (14 domínios), com script de terceiro isolado da origem do app

Task: Felixo AI Core/Canvas — decidir se os embeds do Excalidraw voltam, com frame-src restrito a hosts escolhidos (Notion `3ea91f95-497e-818f-a7ed-cb6a84c376d6`). Agente: subagente da Orquestração (Claude Sonnet 5.5, effort medium). Decisão do Felipe em 17/11/2026: a lista inteira do Excalidraw volta, com os 14 domínios, inclusive X, Reddit e Gist, sabendo que é a opção de maior risco. Requisito do orquestrador: script de terceiro nunca roda com a origem do app.

**Contexto.** Desde 29/09 o bloco Desenho recusava todo embed (`validateEmbeddable={false}` e CSP `frame-src 'none'`); em 16/11 a CSP ficou sem nenhum host remoto, travada por teste. Risco medido: o Excalidraw 0.18.1 monta X, Reddit e Gist como `srcdoc` com `<script src>` do site e, em X e Reddit, com `allow-same-origin`; um script assim herdaria a origem do app.

**O que mudou.**
- `scripts/renderer-csp.cjs`: `frame-src` com 11 hosts https (www.youtube.com, player.vimeo.com, www.figma.com, link.excalidraw.com, gist.github.com, platform.twitter.com, embed.reddit.com, *.simplepdf.eu, stackblitz.com, val.town, giphy.com), um por domínio da lista. Nenhuma outra diretiva ganhou host: `script-src` segue `'self'` com hashes. Exporta `EXCALIDRAW_EMBED_FRAME_HOSTS`, `EXCALIDRAW_EMBED_LINK_HOSTS` (14) e `ISOLATED_EMBED_SANDBOX`.
- `src/features/canvas/services/excalidraw-embeds.ts` (novo): `isExcalidrawEmbedLink` (https + um dos 14 domínios, sempre boolean; `undefined` cairia na lista embutida do Excalidraw) e `isolatedEmbedSrc` (X, Reddit e Gist viram a página de embed do próprio site, usando as mesmas expressões, não ancoradas, que o Excalidraw usa para escolher o `srcdoc`).
- `IsolatedEmbedFrame.tsx` (novo): iframe `src` com `sandbox` sem `allow-same-origin` e sem `allow-top-navigation`. `ExcalidrawCanvas.tsx` passa `validateEmbeddable={isExcalidrawEmbedLink}` e `renderEmbeddable`, que manda os três para esse frame. YouTube, Vimeo, Figma e os demais seguem no iframe do Excalidraw, de outra origem, limitado pelo `frame-src`.
- Testes: `renderer-csp.test.cjs` (a regra de 16/11 "nenhuma origem de rede" virou "só o `frame-src` tem host", com os hosts exatos; o acoplamento "frame-src 'none' + validateEmbeddable=false" virou o acoplamento novo), `excalidraw-embeds.test.ts` (vitest: lista, validador, frame sem `allow-same-origin`) e `excalidraw-embeds.test.cjs` + `test-support/embed-isolation-electron.cjs` (prova no Chromium do Electron do projeto, fora do app).
- Docs: `ARQUITETURA.md` (seção "CSP do renderer"); inventário do canvas (`nodes.ts` e `INVENTARIO-CANVAS.md` regenerado): estado `denied` e a lacuna de validar no app (task `41b91f95-497e-8109-9ae0-e01470ee50d4`).

**Validação.** `excalidraw-embeds.test.cjs` sobe uma página com a CSP real do build e três frames com um script que tenta `parent.document`, `parent.location.origin`, `parent.localStorage` e `top.location`: no frame isolado (srcdoc sem `allow-same-origin`) e na página de outra origem os três acessos ao pai dão `SecurityError` e a janela não navega (0 requisições a `/hijacked`); o controle com `allow-same-origin` alcança o pai (`parentOrigin` igual à origem do app), então o teste enxerga a diferença. 3 execuções seguidas verdes, 2 a 9 s. Gate: lint e typecheck limpos; node 3482 de 3494 passam, 0 falha; vitest 3697 passam, 4 puladas.

**Não validado.** O app não foi aberto (a porta 5173 estava ocupada por outro agente): nenhum host foi carregado de verdade no app. Em X, Reddit e Gist a URL da página de embed (`platform.twitter.com/embed/Tweet.html`, `embed.reddit.com/.../?embed=true`, `gist.github.com/<u>/<id>.pibb`) vem do conhecimento do formato público, não foi medida: pode recusar o frame (X-Frame-Options). Roteiro de conferência na task `41b91f95-497e-8109-9ae0-e01470ee50d4`.

Estado: concluído em código e teste (commit na branch `orq/canvas-decidir-embeds-excalidraw-voltam`; push e deploy pelo orquestrador); validação no app pendente.

---

## 2026-11-17 — Release: empacotamento local com --dir e versão de Node no guia

Task: Felixo AI Core/Release — empacotar localmente no Node 25 (fs.cpSync do bundle-npm-runtime) e documentar o contorno (Notion `3eb91f95-497e-8197-89ea-e8a7a876a357`). Agente: subagente da Orquestração (Claude Haiku 5.5, effort max).

**Contexto.** A nota de 30/09 atribuía a quebra do `bundle-npm-runtime` no Node 25.3 ao `fs.cpSync` de `node-gyp-bin/node-gyp`. Medido em 17/11: o `cpSync` só falha ao sobrescrever um arquivo que já existe, em caminho com acento (o `unlink` interno devolve "The operation completed successfully"). `fs.rmSync` no mesmo caminho não apaga e não lança. A correção já estava na main (`8f3a26ac`, 16/11): `removeTreeSync` apaga a cópia anterior antes do `cpSync`.

**O que mudou.** Só `docs/guias/GUIA-DESENVOLVEDOR.md`. Os requisitos apontam para `engines`, a CI (22.x) e o `.nvmrc` (25.9.0). A reprodução do checkout usa `--dir --publish never`, com `-c.npmRebuild=false` no Windows. O parágrafo do `removeTreeSync` explica o `cpSync`, e há uma seção nova, "Versão de Node". Nenhuma linha de código.

**Validação.** Reprodução numa pasta com acento, nos Nodes 25.3.0 e 24.22.3 (Electron 45.3.3): cópia em destino novo passa nos dois; `cpSync` por cima de cópia pronta falha só no 25.3; `copyNpmRuntime` por cima de cópia pronta passa nos dois. `node --test app/scripts/bundle-npm-runtime.test.cjs`: 4/4 no 25.3 e 4/4 no 24.22. Com o `removeTreeSync` retirado (mutante, restaurado depois), o teste 4 falha no 25.3 com o mesmo erro. Gate: lint 0, typecheck 0, node 3480/3492 pass (0 fail, 12 skipped), vitest 3689/3694 com 1 falha de E2E sob carga (`canvas-context-e2e`), que passa isolado 6/6.

**Não validado.** O empacotamento completo (`electron-builder --dir`) em nenhum dos Nodes, porque a máquina estava carregada. O smoke do artefato também não rodou. O contorno com o Node embutido do Electron saiu com código 1 em 02/10 (causa não investigada); o guia não o recomenda.

Estado: documentação entregue na branch `orq/release-empacotar-localmente-node-cpsync` (commit `9509e2f8`); push e deploy pelo orquestrador. Pendências abertas: versão de Node do build (`.nvmrc` × CI), app empacotado com código 1, validação completa nos Nodes e o E2E instável sob carga.

---

## 2026-11-17 — Contas: o TUI do Codex 0.159.2 não sobe com CODEX_HOME acima de 64 caracteres; comentários de versão dos perfis atualizados

Task: Felixo AI Core/Contas — validar o Codex 0.159 com CODEX_HOME longo e atualizar os comentários de versão dos perfis (Notion `3eb91f95-497e-8139-8008-ede2a7c8d531`). Agente: subagente da Orquestração (Claude Haiku 5.5, effort max).

**Contexto.** A task vinha de 30/09: o Notion registrava `path must be shorter than SUN_LEN` com `CODEX_HOME` de 156 caracteres e pedia o limite exato no TUI. A pasta de perfil do app é `%APPDATA%\felixo-ai-core\cli-profiles\codex\<uuid>`, com 96 caracteres mais o nome do usuário.

**O que mudou.**
- `app/electron/services/cli-account-profiles.cjs`, só comentários: a linha do Codex passa a citar 0.159.2; a linha do Gemini deixa de dizer que `GEMINI_CLI_HOME` só afeta `settings.json` (no bundle 0.69.0-preview.0 ele muda o `~/.gemini`; login não testado); a lista dos nomes conferidos cita o Codex 0.159.2; o isolamento do Gemini ganha um `shortcut:` com o limite (HOME arrasta git, ssh e npm); `getProfileDir` ganha a nota do limite de 65 caracteres no Windows.
- `docs/guias/GUIA-USUARIO.md`, parágrafo "No Codex 0.159": limite medido (até 64 abre, 65 falha) e a versão 0.171.0-alpha.11, que também falha.

**Validação.** CLI direto, sem o app e sem login: `codex` 0.159.2 instalado numa pasta de teste, TUI num pseudo-console (ConPTY), `CODEX_HOME` de comprimento exato em pasta vazia.
- 28 caracteres: tela "Welcome to Codex / Sign in with ChatGPT" em 19 s (segunda execução na mesma pasta; a primeira só clona e copia). 64 caracteres: a mesma tela em 97 s (primeira execução).
- 65 caracteres: `Error: path must be shorter than SUN_LEN` em 114 s. O socket é `CODEX_HOME\app-server-control\app-server-control.sock`: sufixo de 43 caracteres; 107 bytes cabem, 108 não.
- 156 caracteres: mesmo erro em 58 s. Com `--no-daemon`: tela de login em 3,4 s, sem daemon no diagnóstico.
- 0.171.0-alpha.11 (npm global, o que o `PATH` resolve hoje): mesmo erro com 156 em 35 s.
- `codex login status` (0.159.2): "Not logged in" com 28 e com 156, sem SUN_LEN.
- `node --test electron/services/cli-account-profiles.test.cjs`: 19 de 19. `eslint` do arquivo: exit 0. O `git diff` do `.cjs` não tem nenhuma linha de código.

**Não validado.** macOS e Linux (outro limite de socket, não medido); login real e o terminal aberto pelo app (exige cadastrar conta); `--no-daemon` com `resume` e com a retomada; o gate completo não rodou porque o commit só mexe em comentário e doc. A correção (`--no-daemon` nos terminais de conta, ou pasta de perfil curta) é código de produto e fica para o redespacho.

Estado: parcial. Commit na branch `orq/contas-validar-codex-159-com`; correção pendente (PRECISA_SONNET).


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

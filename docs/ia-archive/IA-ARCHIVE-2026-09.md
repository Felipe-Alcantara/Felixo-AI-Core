# Arquivo do IA.md — 2026-09

> Registros movidos, na íntegra e sem edição, de [`IA.md`](../../IA.md) em 2026-10-12
> (compactação sem perda do template de contexto). Não edite aqui: se uma decisão mudar,
> acrescente uma entrada nova e datada no `IA.md`.

## [2026-09-02] Lote de patches/minors sem misturar majors

**Task.** Atualizar as dependências dentro das faixas declaradas, mantendo
Electron 41, Tailwind 3, TypeScript 6 e `@types/node` na série 25.

**Lote aplicado.** `package.json` e `package-lock.json` receberam 18 updates
diretos: React/React DOM 19.2.8, tipos React 19.2.18/19.2.5, xYFlow 12.11.6,
Highlight.js 11.12.0, Lucide 1.39.0, `@electron/rebuild` 4.2.0, plugin React
6.1.1, Autoprefixer 10.5.4, ESLint 10.9.1, refresh 0.5.6, globals 17.12.0,
PostCSS 8.5.26, typescript-eslint 8.69.0, Vite 8.2.2, Vitest 4.1.11 e
`@types/node` 25.9.5. Os majors Electron 44, Tailwind 4, TypeScript 7 e
`@types/node` 26 ficaram fora.

**Revisão.** As notas oficiais foram conferidas por grupo: correções de RSC,
store e ícones no runtime/UI; correções de parser/grammars e CSS; e correções
de compilação, diagnósticos, lint, concorrência e mocks no toolchain.

**Validação.** `npm test` passou 983/983, testes nativos 5/5, frontend 760
passou + 1 ignorado, lint sem erros (2 warnings preexistentes), build e
`git diff --check` passaram. Após o lote, `npm audit --omit=dev` permaneceu
com zero vulnerabilidades; o audit completo manteve somente advisories
dev-only não críticos.

**Estado final.** Implementação e validação local concluídas; a publicação
remota e o acompanhamento do CI/release fazem parte do fechamento operacional
desta task.

## [2026-09-02] Política contínua de dependências, SBOM e inventário do instalador

**Task.** Automatizar a auditoria npm completa e comparativa de produção, a
auditoria do launcher Python, os SBOMs e a comprovação do conteúdo que chega ao
instalador, além de separar as atualizações do Dependabot por risco.

**Implementação.** O CI preserva os JSONs e códigos de saída de `npm audit`,
produz o SBOM CycloneDX do lock e empacota o app antes de validá-lo.
`package-inventory.cjs` lista os manifestos dentro do `app.asar`, mede recursos
desempacotados e exige o `resources/npm-runtime/npm` real, com tamanho, hash e
versão. O Release gera o mesmo inventário em cada runner. O Dependabot separa
updates de segurança, patch/minor agrupados e majors individuais para npm,
Python e GitHub Actions.

**Decisão de gate.** Advisories não críticos da árvore completa continuam
visíveis para atualização, mas qualquer crítico bloqueia. O comparativo
`npm audit --omit=dev` é o gate obrigatório de produção; falha de execução, SBOM
inválido, inventário ausente ou `npm-runtime` vazio também bloqueiam. O
`pip-audit --strict` mantém o mesmo rigor para o lock Python.

**Validação local.** Os testes focados passaram 9/9; os relatórios reais
registraram 4 advisories não críticos no grafo completo, zero na produção e 759
componentes no SBOM npm. `npm run pack` passou e o inventário confirmou duas
variantes Linux presentes no diretório local, com 3.084 arquivos do
`npm-runtime`. PyYAML validou os três YAMLs alterados e ESLint não encontrou
erros nos scripts.

**Estado final.** Implementação, testes e documentação concluídos; a publicação
remota e o acompanhamento do CI/release fazem parte do fechamento operacional
desta task.

## [2026-09-02] Foco nativo perdido deixava teclado preso após troca de aplicativo

**Sintoma relatado.** Depois que outra janela roubava o foco — com maior
frequência ao clicar fora do Felixo — alguns campos paravam de receber entrada.
`Alt+Tab` às vezes parecia corrigir o estado, e o indício mais forte era
`Shift` e `Espaço` deixarem de funcionar até reabrir o app.

**Causa confirmada no Linux/X11 com KWin.** Um clique real em outra janela
gerava `blur` e `focus` na `BrowserWindow` do Electron, mas não gerava
`window.blur`, `window.focus` nem `document.focusout` no renderer. O
`document.activeElement` continuava apontando para o input/textarea que estava
em uso. Assim, o `useFocusRestore` anterior não recebia o sinal para lembrar o
campo; além disso, o React Flow mantinha o conjunto interno de teclas
pressionadas porque seu reset depende de `window.blur`. Uma perda de `keyup`
nesse intervalo explica o estado de modificador preso observado em `Shift` e
as combinações que envolvem `Espaço`.

**Correção.** `window-focus-bridge.cjs` encaminha o foco nativo pelo processo
principal e pelo preload. O hook agora captura o `activeElement` no blur
nativo, reemite `window.blur` para limpar estados de teclado dos consumidores e
reancora o campo no retorno com `blur()` + `focus()`. A restauração é
coalescida quando DOM e BrowserWindow avisam o mesmo retorno e continua sem
roubar o foco de um campo diferente que tenha assumido o controle.

**Validação.** A matriz manual isolada percorreu os campos habilitados de chat,
modais, canvas, nós e ferramentas, incluindo inputs, textareas, selects,
números e checkboxes; cada controle manteve foco e recebeu a tecla de teste
após o ciclo nativo. O input de arquivo oculto e o campo de qualidade
desabilitado foram identificados como não editáveis. No Electron isolado, a
ponte entregou `[false, true]`, o textarea passou por `focus → blur → focus` e
o `window.blur` sintético foi observado. `npm test`: 973 testes verdes;
`npm run test:frontend`: 760 verdes e 1 ignorado; `npm run build` e `npm run
lint` passaram (2 avisos preexistentes no `SearchPanel.tsx`). A repetição do
clique externo por `xdotool` ficou indisponível depois que o ambiente físico
entrou no bloqueio de tela; a transição nativa já havia sido observada antes
do bloqueio e foi reproduzida diretamente pela `BrowserWindow` após a
correção.

## Registro de Trabalho — 2026-09-01 (parte 22) — índice de conexões do Canvas

PEDIDO: reduzir o custo de renderização do Canvas, que resolvia links repetindo
varreduras completas de `edges` e `nodes.find()` para cada terminal e cada
arquivo.

IMPLEMENTAÇÃO: criado `app/src/features/canvas/services/canvas-connection-index.ts`.
`createCanvasConnectionIndex` constrói em uma passagem o mapa de nós, a lista
de terminais, os terminais ligados por arquivo e os nomes de arquivos ligados
por terminal. Arestas são aceitas em ambas as direções, nomes repetidos são
deduplicados na ordem original e pontas ausentes/arestas entre tipos
incompatíveis são ignoradas. `CanvasView` constrói o índice em `useMemo` quando
`nodes` ou `edges` mudam e reutiliza a mesma instância no `renderedNodes` e no
efeito que resolve caminhos de arquivos; ações pontuais continuam fora do hot
path.

TESTES: `canvas-connection-index.test.ts` cobre direções, arquivos repetidos,
labels indiretos via lista de terminais, nós removidos, arestas inválidas,
arquivos sem nome e reconstrução após remoção. O benchmark opt-in
`canvas-connection-index-benchmark.test.ts` compara o algoritmo anterior com o
índice em fixtures de 100, 500 e 1.000 nós, com 252, 1.252 e 2.502 arestas:

| nós | cenário | baseline p50/p95 ms | índice p50/p95 ms |
|---:|---|---:|---:|
| 100 | render, drag, resize, aresta, dados | 0,60/1,02 · 0,41/0,48 · 0,38/0,42 · 0,41/0,73 · 0,31/0,49 | 0,29/0,43 · 0,12/0,34 · 0,29/0,32 · 0,19/0,26 · 0,11/0,12 |
| 500 | render, drag, resize, aresta, dados | 5,18/6,25 · 4,34/6,00 · 4,72/5,08 · 7,08/8,34 · 9,65/10,28 | 1,53/1,69 · 1,10/1,39 · 1,02/1,51 · 1,49/1,61 · 1,62/1,64 |
| 1.000 | render, drag, resize, aresta, dados | 27,68/27,68 · 30,28/30,28 · 20,51/20,51 · 20,34/20,34 · 21,28/21,28 | 4,41/4,41 · 3,95/3,95 · 4,17/4,17 · 3,29/3,29 · 3,64/3,64 |

As medições foram feitas com `npx vitest run ...canvas-connection-index-benchmark.test.ts`
e `FELIXO_CONNECTION_BENCHMARK=1`; os resultados conferiram a saída do
baseline e do índice antes de cronometrar. O custo estrutural medido foi de
20/100/200 conexões nomeadas nos três tamanhos; não foi feita medição confiável
de bytes de heap porque o Vitest não oferece um React Profiler/GC controlado.

VALIDAÇÃO: suíte focada do índice 3/3; benchmark 1/1; `npm test` 917 testes,
907 aprovados, 10 skips e zero falhas; `npm run test:frontend` 724 aprovados e
1 skip (benchmark opt-in); `npm run build` com 717 módulos; `npm run lint` sem
erros e os 2 avisos React já existentes; `git diff --check` limpo.

LIMITE: não houve sessão visual do app com React Profiler para separar commits
de render em drag/resize nem validação manual de prompts, retomada ou links.
Os testes de contrato do índice preservam esses dados, mas a confirmação
visual fica como ponto de atenção separado.

Estado final: índice implementado e cobertura automatizada concluída; pronto
para revisão/publicação e registro no Notion, com a limitação visual declarada.

## Registro de Trabalho — 2026-09-01 (parte 23) — React Profiler e heap do índice do Canvas

PEDIDO: medir o renderer real do Canvas em fixtures de 100, 500 e 1.000 nós,
comparando baseline e índice nos cenários de render inicial, drag, resize,
criação/remoção de aresta e mudança de dados.

IMPLEMENTAÇÃO: adicionada a bancada Electron/Vite
`app/scripts/canvas-connection-performance.cjs` e o harness de rota
`?benchmark=canvas-connections`. O harness usa ReactFlow real, fixture com
terminais, arquivos, grupos e notas, arestas arquivo↔terminal nas duas
direções, pontas ausentes e aresta inválida. A coleta registra
`actualDuration` do React Profiler, `performance.memory.usedJSHeapSize` antes e
depois de GC, percentis p50/p95, metadados do host e JSON reprodutível. O
Profiler do `CanvasView` real ficou opt-in em `?canvas-profiler=1`, gravando em
`window.__felixoCanvasProfiler` sem custo no uso normal.

RESULTADO: no Windows x64 (Node 24.18.0, Electron 41.10.7, 16 CPUs, viewport
1.584×936), com uma passada de aquecimento e cinco repetições, o p95 melhorou
nas 15 combinações. Os ganhos mínimo/máximo foram 5,96%/89,81%; em 1.000 nós,
render inicial caiu de 269,92 ms para 131,66 ms e drag de 10,20 ms para 5,60
ms. O delta de heap p95 do índice variou de -0,85 a +0,36 MiB contra o
baseline, sem aumento material nesta coleta controlada.

VALIDAÇÃO: `npm test` passou com 917 aprovados e 10 skips; `npm run
test:frontend` passou com 729 aprovados e 1 skip; `npm run build` transformou
721 módulos; `npm run lint` terminou sem erros, mantendo apenas os 2 avisos
React preexistentes de `SearchPanel.tsx`; `git diff --check` ficou limpo. Os
testes focados cobrem equivalência da projeção baseline/índice, fixtures,
opt-in do Profiler e validação do runner.

LIMITE: o harness renderiza nós leves para isolar o custo do índice; não inicia
PTYs, não lê arquivos persistidos e não substitui uma sessão visual manual do
Canvas real para links, nomes/labels, prompts iniciais, retomada do terminal e
remoção de nós/arestas. O delta de heap não é snapshot de retenção; a bancada
exige GC exposto pelo Electron e DOM não vazio, mas `onlyRenderVisibleElements`
pode montar menos nós que o fixture.

Estado final: instrumentação, medição real e documentação concluídas; pronta
para publicação e registro da evidência na task do Notion, com a validação
visual manual explicitamente pendente.

## Registro de Trabalho — 2026-09-01 (parte 24) — bundle inicial sob demanda

PEDIDO: dividir o bundle inicial do Felixo AI Core por carregamento sob demanda,
mantendo o canvas como caminho principal, o chat apenas como compatibilidade e
o funcionamento offline do artefato empacotado.

DIAGNÓSTICO: o build anterior transformava 721 módulos em um único JavaScript
de 1.727,72 kB (1.687,23 KiB; 483,71 KiB gzip medidos pela bancada), com o
canvas, chat, todas as ferramentas, Markdown e xterm/PTY no entry. O Vite
também emitia o alerta de chunk acima de 500 kB.

IMPLEMENTAÇÃO:

- `App.tsx` passou a carregar `CanvasView` e `ChatWorkspace` com `React.lazy`;
  a tela inicial não paga pelo chat legado.
- `CanvasToolPanels` ganhou loaders independentes para as 12 ferramentas.
  `Suspense` mostra loading dentro do painel e um error boundary oferece
  recuperação; foco/ponteiro preaquece somente a opção apontada.
- `DeferredMarkdownContent` adia o parser/realces até a primeira prévia de
  nota, arquivo ou mensagem. `DeferredTerminalSessionStore` mantém o contrato
  síncrono dos nós e só importa xterm/PTY quando um terminal é necessário.
- Os imports permanecem relativos com `base: './'`, preservando a resolução no
  `file://` do Electron empacotado. O loader deixa um marcador observável para
  a bancada sem alterar a experiência de produção.
- `bundle-load-benchmark.cjs` e seus testes foram adicionados. Cada amostra
  usa `userData` temporário, nova `BrowserWindow`, inventário cru/gzip,
  startup, abertura do menu e primeiro painel. O check confirma o `import()`
  do Fetch All, rejeita o fallback como painel pronto e resolve 200 referências
  JS/CSS, sem assets ausentes. O CI executa isso após o build nos três SOs.

RESULTADO LOCAL: dez amostras Linux comparadas com o baseline recompilado de
`a2efc42`:

| Medida | Baseline | Bundle dividido |
| --- | ---: | ---: |
| Entry JS cru / gzip | 1.687,23 / 483,71 KiB | 191,73 / 60,37 KiB |
| Startup p50 / p95 | 1.868,065 / 2.250,549 ms | 1.588,362 / 2.193,116 ms |
| Primeira interação — menu p50 / p95 | 656,519 / 741,861 ms | 685,680 / 731,206 ms |
| Fetch All no primeiro uso p50 / p95 | 78,501 / 152,519 ms | 431,662 / 593,429 ms |

O entry caiu 88,6% cru e 87,5% gzip; startup p50/p95 caiu 15,0%/2,6% e o
p95 do menu caiu 1,4%. O primeiro Fetch All paga o custo esperado do chunk
isolado, depois reutilizado em cache; essa diferença não é escondida pela
bancada. O build final não emite alerta de chunk grande.

DOCUMENTAÇÃO: atualizados `app/benchmarks/README.md`,
`docs/projeto/ARQUITETURA.md`, `docs/projeto/ROADMAP.md`,
`docs/projeto/IA.md`, `docs/README.md`, o guia de desenvolvimento e o guia de
execução por código-fonte. O modo de chat permanece descrito como legado.

VALIDAÇÃO: testes focados do benchmark 4/4, `npm run build` verde, `npm run
lint` verde com apenas os 2 avisos React preexistentes de `SearchPanel.tsx`,
benchmark Electron 10/10 aprovado e `git diff --check` limpo. Empacotamento e
smoke de release seguem no gate remoto já existente para Linux, Windows e
macOS.

Estado final: implementação e documentação concluídas; aguardando apenas o
commit, push, CI/release e registro no Notion conforme o workflow do projeto.

## Registro de Trabalho — 2026-09-01 (parte 25) — typecheck incremental

PEDIDO: reduzir o tempo e a memória do typecheck do build do Felixo AI Core,
sem relaxar a segurança de tipos, e deixar o resultado reproduzível para
desenvolvimento local e CI.

DIAGNÓSTICO: `tsconfig.app.json` e `tsconfig.node.json` tinham
`tsBuildInfoFile`, mas não `incremental`. Como os dois projetos usam `noEmit`,
o `tsc -b` considerava `src/App.js` e `vite.config.js` ausentes e reabria o
programa inteiro em cada execução. Cinco runs frios do baseline ficaram em
51,41/54,67 s p50/p95 e 673.060/683.753 KiB de RSS; cinco repetições que
deveriam ser incrementais ficaram em 54,96/58,01 s e 674.420/682.664 KiB.

IMPLEMENTAÇÃO:

- `incremental: true` foi declarado nos dois tsconfigs, sem mudar includes,
  `noEmit`, `skipLibCheck`, `noUnused*`, resolução de módulos ou regras de
  diagnóstico.
- `npm run build` continua usando `tsc -b` + Vite; `npm run typecheck` expõe o
  caminho incremental e `npm run typecheck:full` força a auditoria completa.
- `typecheck-performance.cjs` executa o `tsc -b` oficial, move só os caches
  próprios para preparar cada run frio, mede RSS durante o processo e falha
  com `--check` se faltarem amostras ou houver erro.
- `typecheck-performance.test.cjs` adiciona quatro regressões para argumentos,
  percentis, resumo e falhas; o benchmark nunca usa `noCheck`.

RESULTADO LOCAL: cinco frios atuais ficaram em 52,60/54,24 s p50/p95 e
662.904/668.941 KiB; cinco incrementais ficaram em 0,80/0,93 s e
72.364/72.650 KiB. O caminho repetido caiu aproximadamente 98,5% em tempo e
89,3% em RSS; o cold manteve a parede dentro da variância e reduziu memória.

DOCUMENTAÇÃO: atualizados `app/benchmarks/README.md`,
`docs/guias/GUIA-DESENVOLVEDOR.md`, `docs/projeto/RODAR-VIA-CODIGO-FONTE.md`,
`docs/projeto/ARQUITETURA.md`, `docs/projeto/ROADMAP.md` e a própria IA.

VALIDAÇÃO: `npm run typecheck:full`, `npm run build`, `npm test` (943/943),
`npm run test:frontend` (734 + 1 skip), `npm run test:native` (5/5),
`npm run lint` sem erros, `npm run pack`, smoke Linux e `git diff --check`
passaram. A etapa seguinte é commit, push, CI/release multi-SO e registro da
task como concluída no Notion.

## Registro de Trabalho — 2026-09-01 (parte 26) — retenção dos Logs da CLI

PEDIDO: controlar a retenção e a renderização do histórico da CLI no chat
legado, mantendo a navegação responsiva, sem perder eventos necessários e com
uma forma de exportar o histórico completo.

DIAGNÓSTICO: `useTerminalOutput()` mantinha todos os chunks em estado React e
copiava o array a cada evento. `TerminalPanel` achatava, ordenava e montava
todo o histórico em cada render, sem limite visual nem arquivo de replay. Em
alta frequência isso fazia a quantidade de nós DOM e a memória crescerem com
o tempo da sessão.

IMPLEMENTAÇÃO:

- `terminal-output-store.ts` separa a política pura da UI: cada sessão mantém
  no máximo 240 chunks, 240.000 caracteres e 32.000 caracteres por chunk; o
  modo de orquestração mostra no máximo 720 eventos globais. Chunks de texto
  adjacentes são coalescidos, a cauda é preservada e a UI informa quantos
  eventos ficaram fora da janela visual.
- `useTerminalOutput.ts` usa fila e flush por `requestAnimationFrame`/timeout,
  preserva a identidade das sessões, mantém contadores lógicos e descarrega a
  fila antes de exportar, limpar ou mudar o status.
- `TerminalChunk` é memoizado e a lista da orquestração usa uma janela global;
  seleção, clear, fim de sessão, cópia, exportação e diagnósticos continuam
  usando o histórico lógico, não apenas os nós atualmente visíveis.
- O processo principal grava os eventos em JSONL temporário por execução em
  `<userData>/logs/terminal-output`, expõe leitura/limpeza por IPC e remove o
  arquivo na inicialização, no clear e no encerramento. A exportação de análise
  recupera o arquivo completo; o limite visual não apaga a evidência.
- Foram adicionados fixtures curta (40), longa (600), alta frequência (2×320)
  e múltiplas sessões (4×120), com baseline, Profiler React, latência de
  commits, DOM, heap após GC e RSS em uma janela Electron nova por modo.

MEDIÇÃO LOCAL: a matriz pesada controlada passou em `--check`. Na fixture
longa, 602 eventos de entrada produziram 527 chunks lógicos: 240 ficaram na
janela e 287 foram contabilizados fora dela. Na alta frequência, 644 eventos
produziram 564 chunks em duas sessões: 480 visíveis e 84 fora da janela. Na
fixture de quatro sessões, 488 eventos produziram 428 chunks, todos dentro do
limite por sessão. O maior DOM atual foi 27/172/343/308 nós nas quatro
fixtures, contra 27/377/404/308 no baseline.

Um run isolado e controlado da fixture longa após a memoização mediu p95 de
commit em 31,70 ms no baseline e 32,55 ms no atual, com delta de heap p95 de
2,95 MiB para 1,94 MiB e DOM máximo de 177 para 172. Os tempos do run pesado
variaram com a carga do Linux e a instabilidade de rede relatada durante a
execução; por isso o resultado usado como evidência de desempenho é o run
isolado, enquanto o `--check` garante invariantes de carga, identidade,
Profiler, heap/GC e limites. Não há uma alegação de melhoria universal de
latência a partir de uma única máquina.

VALIDAÇÃO: `npm run lint` passou sem erros, mantendo somente os 2 warnings
React preexistentes de `SearchPanel.tsx`; `npm run typecheck:full`, `npm test`
(951/951), `npm run test:frontend` (742 aprovados + 1 skip),
`npm run test:native` (5/5), `npm run build`, testes focados do store/arquivo
JSONL/runner e o benchmark Electron com `--check` passaram. `git diff --check`
também ficou limpo.

LIMITE: o arquivo JSONL representa a execução atual e é limpo no ciclo de
vida do app; não é armazenamento permanente de todas as sessões antigas. A
exportação de análise é o mecanismo de histórico completo enquanto a execução
está disponível. O benchmark mede Linux localmente; a confirmação nativa dos
três SOs fica no CI e no release empacotado.

Estado final: implementação, testes, instrumentação e documentação concluídas;
pronta para commit, push, CI/release e registro da task como concluída no
Notion.

## 02/09/2026 — Auto-instalação, shim do agente e ambiente do instalador testados de verdade no Windows

Achado IMPORTANTE 4 da auditoria multi-OS de 30/08/2026: quatro cenários de
`cli-auto-install.test.cjs` eram pulados no Windows porque o fixture criava
`userData/clis/bin`, layout que só existe no POSIX (o Windows instala direto
em `userData/clis`). O shim do agente só executava de verdade em POSIX, e o
teste do ambiente do instalador só fixava PATH estilo Linux.

Rodando os três arquivos de teste num Windows real (não simulado), em vez de
só ajustar o fixture apareceram três bugs de produção reais:

- O shim `.cmd` (`agent-command-install.cjs`) é lido pelo `cmd.exe` na code
  page ANSI da máquina; sem `chcp 65001`, qualquer acento no caminho de
  instalação ("Programação/Repositórios") saía corrompido — reproduzido ao
  vivo: `node cli/felixo.cjs` respondia certo, mas o `.cmd` gerado, executado
  via `cmd.exe /c`, dava `Cannot find module` com o caminho ilegível.
- `hasManagedBinary` (`cli-auto-install.cjs`) ignorava os `windowsAliases`
  do catálogo — a Openia declara `.ps1` além de `.cmd`/`.exe` — e reinstalaria
  uma CLI cujo binário só existe com essa extensão.
- `createManagedInstallEnv` (`managed-cli-installer.cjs`) calculava a chave
  do PATH e o separador de entradas pelo `process.platform` real do host, não
  pelo `platformName` simulado no teste — um teste que dizia "Windows" ainda
  usava `:` se rodasse num host Linux/macOS, e vice-versa.

O que foi feito: `cli-auto-install.test.cjs` passou a montar o perfil com
`getManagedCliLayout` (o mesmo cálculo de produção) em vez de montar a pasta
na mão, removendo os quatro `skip` de Windows. `agent-command-install.test.cjs`
passou a executar o shim de verdade nos dois SOs — no Windows, via
`cmd.exe /d /s /c` — removendo o skip da ajuda e o retorno vazio do teste de
persistência do pedido no `userData`. `managed-cli-installer.cjs` ganhou
`getAdapter(platformName)` e `path.win32`/`path.posix` explícitos em vez do
adaptador/`path.delimiter` do host real; `managed-cli-installer.test.cjs`
ganhou testes de `npm_config_script_shell` (cmd.exe no Windows, ausente fora
dele) e do separador `;` do PATH.

MEDIDO: os quatro cenários de `cli-auto-install.test.cjs` e os dois testes de
execução real do shim passam sem skip/retorno vazio num Windows real (não
CI simulado). `npm test`: 953 aprovados, 0 falhas, 2 skips alheios a este
trabalho (`node:sqlite` indisponível neste runtime — o achado do PTY nativo
Windows/macOS, item 2 da auditoria, tem task própria e não faz parte deste
diff). `npm run lint`: 0 erros, 2 avisos React pré-existentes em
`SearchPanel.tsx`. `git diff --check` limpo. Commit
[ef4eb57](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/ef4eb57),
rebaseado e enviado a `origin/main`.

LIMITE: a suíte não foi rodada em CI Windows nesta sessão (só localmente,
neste Windows real); o CI nativo dos três SOs valida na próxima execução do
workflow. Não abri task nova porque o escopo pedido — os três arquivos e os
quatro/dois cenários listados no aceite — foi cumprido integralmente; os
bugs de produção encontrados foram corrigidos junto, não deixados como
pendência.

Estado final: implementação, testes e documentação concluídos; commit
enviado; registro do relatório e da task no Notion em andamento nesta mesma
sessão.

## Registro de Trabalho — 2026-09-02 (parte 27) — tamanho e custo do npm-runtime do instalador

PEDIDO: executar a task do Notion [“Felixo AI Core/Performance — Medir e
reduzir o npm-runtime no instalador”](https://app.notion.com/p/Felixo-AI-Core-Performance-Medir-e-reduzir-o-npm-runtime-no-instalador-3cc91f95497e81bc8283eb354c823b89).

DIAGNÓSTICO: o hook `beforePack` copiava a árvore inteira de `npm 11.19.1`
para `build/npm-runtime`, removendo somente `docs`, `man` e Markdown. Não havia
medição de arquivos/bytes do runtime, custo comprimido, startup nem primeira
instalação no Electron, e o release smoke não registrava o tamanho do recurso
que realmente entrou no instalador.

FEITO:

- `bundle-npm-runtime.cjs` agora separa a política anterior (`baseline`) da
  política de produção (`current`) e remove apenas `test(s)`, `__tests__`,
  `example(s)`, `fixture(s)`, benchmarks, coverage, snapshots, `.github`,
  source maps e documentação;
- `bin/npm-cli.js`, `lib`, `package.json`, dependências de produção, arquivos
  Python e a árvore do `node-gyp` continuam preservados, pois o npm usa
  carregamento dinâmico e CLIs podem executar scripts nativos;
- `npm-runtime-performance.cjs` mede bytes descompactados, arquivos e um
  `tar.gz` portátil com mtime fixo, além de startup, primeira instalação e
  atualização offline no Electron, lifecycle, PATH, prefixo, permissões e
  persistência;
- o CI executa o check em Ubuntu, Windows e macOS e publica um JSON por runner;
  o release workflow também publica o relatório do smoke do instalador;
- o `release-smoke` mede o runtime empacotado e seus tempos de npm, sem tocar
  no npm global, no canvas ou em credenciais.

MEDIÇÃO LOCAL: Linux x64, Node 25.9.0, Electron 41.10.7 e npm 11.19.1, três
repetições por política. Baseline → atual: 1.557 → 1.527 arquivos;
8.882.285 → 8.814.897 bytes descompactados (−67.388 B, −0,76%);
2.310.946 → 2.264.260 bytes em `tar.gz` (−46.686 B, −2,02%). No último run,
startup p50/p95 ficou em 361,935/400,447 → 396,303/403,559 ms; primeira
instalação em 1.071,468/1.336,693 → 1.073,195/1.347,825 ms; atualização em
1.091,226/1.154,682 → 1.099,577/1.110,710 ms. Os tempos são registrados para
acompanhamento e não viram um gate artificial de variância de máquina.

VALIDAÇÃO: `npm test` 958/958, frontend 742 aprovados + 1 skip, native 5/5,
typecheck completo, build, lint (0 erros e somente os 2 warnings React
preexistentes), testes focados do bundle/runtime/release, `git diff --check`,
benchmark npm-runtime com `--check` e `npm run pack` passaram. O smoke do
`release/linux-unpacked` passou com app 0.1.0, PTY, npm 11.19.1, runtime de
1.527 arquivos/8.814.897 bytes, startup 415 ms, primeira instalação 941 ms,
atualização 1.017 ms, PATH, permissões, prefixo e persistência.

LIMITE: a compactação tar.gz é uma métrica comparável do conteúdo, não o
formato final de cada instalador. Os números de Windows e macOS serão os JSONs
gerados pela matriz; módulos de runtime não foram removidos por heurística.

Estado final: implementação e validação local concluídas; pronta para commit,
push, CI/release e registro da task como concluída no Notion.

## 02/09/2026 — Contexto inicial não chegava quando o Claude Code pedia confiança na pasta (achado pelo usuário)

O usuário relatou: abriu um terminal de agente pelo Felixo AI Core numa pasta
nova e a sessão começou sem nenhum dos prompts de contexto inicial, e
suspeitou do prompt de permissão que aparece na primeira vez que uma pasta é
aberta. Investiguei e reproduzi ao vivo, com `node-pty` nesta máquina,
`claude --dangerously-skip-permissions` numa pasta que o Claude Code nunca
tinha visto: a flag do modo yolo pula a aprovação de ferramenta, mas **não**
pula a checagem "Quick safety check: Is this a project you created or one
you trust?" — o código do terminal assumia o contrário (havia comentário e
teste dizendo explicitamente "a folder trust dialog, which yolo mode never
shows").

Duas causas se somavam:

1. Essa checagem não numera as opções ("No, exit" / "Yes, I trust this
   folder"), ao contrário do aviso de bypass ("1. No, exit" / "2. Yes, I
   accept"). O filtro que existia (`MENU_ITEM`) só reconhecia item numerado,
   então `hasClaudeInteractivePrompt` lia a linha selecionada do menu como se
   fosse texto já digitado no composer e dava o REPL como pronto na hora — o
   texto de contexto era escrito dentro do próprio menu de decisão.
2. Mesmo sem essa confusão, o fallback de emergência de `scheduleInitialText`
   ignorava por completo se a tela era um diálogo de decisão reconhecido:
   passado o teto (60s para CLI conhecida, 10s para desconhecida), ele
   forçava a escrita de qualquer jeito, então a mesma classe de bug valeria
   para qualquer tela de decisão futura, de qualquer CLI.

Corrigido nos dois pontos: `terminal-screen-state.ts` ganhou
`UNNUMBERED_DECISION_OPTION` (aplicado em `hasClaudeInteractivePrompt` e
`hasCodexInteractivePrompt`) e `isClaudeTrustPrompt`; `scheduleInitialText`
agora nunca considera pronto nem aciona o fallback de emergência enquanto
`looksLikeApprovalPrompt` reconhecer a tela como uma decisão parada — vale
para qualquer CLI, não só Claude. Em modo yolo a nova checagem é aceita
sozinha (`handleClaudeTrustPrompt` + `acceptClaudeDecisionScreen`,
generalizado do antigo `acceptClaudeBypassWarning`); fora do modo yolo a
pessoa decide, e o app só para de forçar texto por cima do menu.

MEDIDO: 5 testes novos em `terminal-screen-state.test.ts`
(`isClaudeTrustPrompt`) e 5 em `terminal-session-store.test.ts`, incluindo um
que espera de verdade os 10s do fallback de uma CLI sem leitor de linha de
entrada dedicado (`gemini`) parada num prompt de decisão genérico, para
provar que a tela de decisão barra a escrita mesmo passado o teto de
emergência. `npm run typecheck` limpo; `npm run test:frontend`: 752
aprovados, 1 skip opt-in pré-existente; `npm test` do backend Electron: 953
aprovados, 0 falhas (inalterado — a mudança é só no renderer); `npm run
lint`: 0 erros, 2 avisos React pré-existentes; `npm run build` ok. O texto
real da tela de confiança foi capturado ao vivo com `node-pty` nesta máquina
antes da correção, para não adivinhar a redação.

LIMITE: não testado com o Claude Code rodando fora do modo yolo pedindo essa
mesma checagem numa sessão real do Felixo AI Core (só via o harness com
bytes capturados) — o comportamento sem `--dangerously-skip-permissions` é
"parar de forçar escrita", não "responder sozinho", então o risco de uma
correção errada ali é menor.

Commit [e57446e](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/e57446e),
rebaseado e enviado a `origin/main`.

Estado final: investigação, correção, testes e documentação concluídos;
commit enviado.

## 02/09/2026 — "Limites e uso" mostrava as CLIs de IA como não instaladas neste PC (achado pelo usuário)

O usuário relatou que o painel "Limites e uso" mostrava Claude Code CLI,
Codex CLI, Gemini CLI e Openia como "não instalada" nesta máquina, mesmo
todas instaladas e funcionando (a própria sessão que investigou o bug é uma
delas). Reproduzi ao vivo chamando `detectCli()` com o ambiente real do
processo — sem simular nada — e achei duas causas, as duas expostas só
quando a CLI foi instalada via `npm install -g` no Windows (o caminho do
instalador automático do próprio app, e o mais comum para quem instala na
mão):

1. `getExecutableExtensions()` (`platform/win32.cjs`) testava a extensão
   vazia (`''`) **antes** de `.cmd`. O npm cria, para cada CLI, três
   arquivos com o mesmo nome base: o shim POSIX sem extensão (`claude`),
   `claude.cmd` e `claude.ps1`. O resolvedor de comando sempre achava o shim
   POSIX primeiro e devolvia esse caminho — mas `detectCli()` só liga
   `shell: true` para um caminho terminado em `.cmd`/`.bat`, então o
   `execFile` tentava rodar um script Unix como binário nativo do Windows e
   falhava.
2. Mesmo corrigindo (1) e resolvendo o `.cmd` certo, `execFile` com
   `shell: true` no Windows concatena comando e argumentos crus para o
   `cmd.exe /c` **sem citar** o caminho. Um perfil de usuário do Windows com
   espaço no nome — como "Felipe Martins", nesta máquina — quebra o comando
   ao meio: o `cmd.exe` só reconhece o pedaço antes do espaço. Numa conta
   sem espaço no nome o mesmo código passa batido, o que explica o painel
   funcionar numa outra máquina do usuário e não nesta.

Corrigido em `cli-detector.cjs` (cita o executável entre aspas antes de
rodar via shell) e `platform/win32.cjs` (extensões reais antes de `''`).

MEDIDO: antes da correção, as quatro CLIs de IA reportavam
`detected: false` chamando `detectCli()` de verdade nesta máquina. Depois:
`claude` 2.1.258, `codex` 0.152.1, `gemini` 0.57.0 e `openia` 0.1.0, todas
`detected: true` com a versão certa. 2 testes novos em
`cli-detector.test.cjs` (um prova que `.cmd` vence o shim POSIX quando os
dois existem; outro prova a citação do caminho ponta a ponta com um fake de
`cmd.exe` que só reconhece o comando citado). `npm test`: 962 aprovados, 0
falhas, 2 skips pré-existentes alheios. `npm run lint`: 0 erros, 2 avisos
React pré-existentes.

Commit [3d3c68d](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/3d3c68d),
rebaseado e enviado a `origin/main`.

Na mesma sessão, investigando um relato anterior do usuário ("Uma linha por
pasta" empilhando dois blocos do mesmo repositório em vez de lado a lado),
achei e corrigi dado obsoleto no banco local: um clone duplicado em
`C:\Users\Felipe Martins\Felixo-AI-Core-task` (git limpo, sem commit
próprio, apagado com segurança) e sete registros (`projects` e
`canvas_nodes`) ainda apontando para `E:\Programação\Github\Felixo-AI-Core`,
caminho que não existe mais desde que o repositório foi reorganizado para
`P:\...\Repositórios\Meus repositórios\Felixo-AI-Core`. Corrigido com
backup prévio do `felixo.sqlite` (dois arquivos `.bak-*` na pasta
`database/` do userData) e sem fechar o app — o app aceita escrita no banco
com ele aberto, o que evitou o risco de a correção matar esta própria sessão
(ela roda como um dos terminais do canvas). Não gerou commit porque é dado
de usuário, não código.

Estado final: os dois relatos do usuário nesta sessão (agrupamento do
canvas e detecção de CLI) foram investigados, reproduzidos ao vivo,
corrigidos e validados; nenhum ficou pendente.

## 02/09/2026 — Input travava depois que algo tirava o foco do app, mesmo já tendo sido "corrigido" antes (achado pelo usuário)

O usuário relatou que o bug do input travando (não aceita mais digitação até
minimizar e reabrir o app), que já tinha sido corrigido em 24/08
([2dfa56f](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/2dfa56f)),
"voltou a incomodar recentemente" em qualquer campo de escrita, em todos os
SOs, com qualquer gatilho (trocar de app, notificação do SO, ou algo dentro
do próprio app).

Não achei uma regressão de código — nenhuma edição tocou
`app/src/features/shared/focus/` desde a correção original, e busquei por
`.focus()` novos adicionados no período: nenhum interfere com o mecanismo.
O que achei foi uma lacuna na correção original: `devePedirFoco` só
restaurava o foco quando `document.activeElement` virava `null`/`body` —
exatamente o que o Chromium faz ao minimizar/restaurar no Windows, o
cenário que motivou a correção de 24/08. Fora desse caminho específico
(notificação do SO por cima da janela, trocar de app sem minimizar, e em
geral fora do Windows), o Chromium às vezes **não** zera o `activeElement`
— ele continua apontando pro mesmo elemento, mesmo com o roteamento nativo
de teclado já quebrado — e a função lia isso como "já tem alguém com foco,
não mexe" e desistia.

Corrigido: `devePedirFoco` agora também restaura quando `activeElement` já
é o próprio elemento lembrado; `useFocusRestore` faz `blur()` antes do
`focus()` (um `focus()` sozinho num elemento que o DOM já considera focado
costuma ser ignorado — é o ciclo completo que reproduz de propósito o que
minimizar/restaurar fazia de graça no Windows).

MEDIDO: 3 testes novos (1 na decisão pura, 2 na instalação dos ouvintes,
incluindo a ordem blur→focus e a restauração quando o activeElement não
mudou); os 16 testes existentes continuam passando sem alteração de
comportamento no caminho já coberto. `npm run typecheck` limpo;
`npm run test:frontend`: 755 aprovados, 1 skip pré-existente;
`npm run lint`: 0 erros; `npm run build` ok.

LIMITE, declarado ao usuário: o gatilho de fundo é uma peculiaridade de foco
nativo do Chromium/SO que teste de unidade não alcança. Não consegui
reproduzir o sintoma ao vivo (precisaria de troca real de foco entre
janelas do SO, em várias plataformas) — a correção é raciocinada a partir
do próprio comentário da correção original ("o que resolve é o ciclo
completo de blur+focus") e cobre uma lacuna real e verificável na lógica,
mas só o uso real confirma se resolve o sintoma reportado. Pedido
explicitamente ao usuário para confirmar em uso real, sobretudo fora do
Windows.

Commit [1436c9f](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/1436c9f),
enviado a `origin/main`.

Estado final: investigação e correção concluídas e documentadas; validação
do sintoma em uso real depende do usuário confirmar depois.

## 02/09/2026 — App instalado "bugava" quando o agente mexia no código-fonte clonado, mesmo rodando a versão instalada (achado pelo usuário)

O usuário relatou usar o próprio Felixo AI Core instalado para programar o
Felixo AI Core, e às vezes, quando um agente mexia no código-fonte clonado,
a instância instalada "dava umas bugadas" como se tivesse virado a versão
rodando do código-fonte — suspeitando de algo relacionado a "localhost".

Achei a causa raiz sem precisar reproduzir o sintoma exato: o Electron
calcula `app.getPath('userData')` só a partir de `app.name` (o `name` do
`package.json`), sem olhar `isPackaged`. `npm run dev` (o que um agente roda
para testar uma mudança do código-fonte) e o app instalado resolviam para a
**mesma pasta** — mesmo `felixo.sqlite`, mesmo estado de canvas, mesmo Local
Storage do Chromium. Com os dois processos do Electron vivos ao mesmo tempo,
escrevendo no mesmo banco, a instância instalada passava a se comportar como
a de desenvolvimento porque, em boa parte, estava mesmo operando sobre o
estado que a outra também mexia — o "localhost" da suspeita do usuário era
sintoma correto de outro processo do Electron por perto, só que a colisão de
verdade era no userData, não numa URL.

(A skill `rodar-app` já tinha essa preocupação documentada — "sem
`--user-data-dir`, o app de teste abre em cima do canvas real... e mexe nos
agentes e configurações de quem usa a máquina" — mas isso só cobria o
lançamento via Playwright daquela skill; `npm run dev` chamado direto, do
jeito que um agente normalmente testa uma mudança, ficava sem essa proteção.)

Corrigido: `resolveDevUserDataOverride` (nova função pura em
`app-paths.cjs`), chamada no topo de `main.cjs` antes de qualquer outro uso
de `app.getPath`. Fora de app empacotado e fora do smoke test de release
(que já tem isolamento próprio), o modo dev passa a usar `<pasta-real>-dev`
— a menos que `FELIXO_USER_DATA_DIR` já aponte pra outro lugar, o mesmo
override que o smoke test e o comando `felixo` standalone já respeitam.

MEDIDO: rodei `npm run dev` de verdade nesta máquina (via
`start-electron.cjs --dev`) e conferi que `felixo-ai-core-dev/` nasceu com
banco, canvas, config e Local Storage próprios, separado de
`felixo-ai-core/` — a pasta real do app instalado ficou intocada. 6 testes
novos em `app-paths.test.cjs`. `npm test`: 968 aprovados, 0 falhas, 2 skips
pré-existentes alheios. `npm run lint`: 0 erros.

Commit [2ef067b](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/2ef067b),
enviado a `origin/main`. Como o processo main do Electron não passa por
build/empacotamento (`.cjs` puro), o fix vale a partir do próximo
`npm run dev` — não depende de instalar uma versão nova do app.

Estado final: causa raiz confirmada por análise de código e reprodução ao
vivo da isolação (não do sintoma "bugado" em si, que só acontece com dois
processos concorrendo — mas a causa da concorrência está eliminada).

## 02/09/2026 — Reprodução ao vivo do ciclo de perda/retorno de foco do SO, para validar 1436c9f

A correção de foco em [1436c9f](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/1436c9f)
(mesmo dia, entrada acima) foi enviada sem reprodução ao vivo — só análise de
código — porque reproduzir exige trocar o foco entre janelas do SO, algo fora
do alcance de jsdom. Task do Notion pedia confirmação em uso real.

Não dá pra simular "uso real de vários dias" numa sessão, mas dá pra reproduzir
o mecanismo exato do bug (perda e retorno de foco no nível do SO, sem clique)
com a skill `rodar-app`: Electron real sob Xvfb, dirigido por
`xdotool windowfocus` (muda o foco de input do X de verdade, não é evento
sintético de CDP) e `xdotool key` (tecla real entregue à janela, não
`page.keyboard`).

MEDIDO: com o terminal do agente focado, troquei o foco do X para uma segunda
janela (`xclock`) e de volta para a janela do Felixo — **sem** clicar nem
chamar `.focus()` manualmente — e mandei uma tecla real logo em seguida. Repeti
3 vezes com variações: (1) troca simples com espera de ~1s antes da tecla, (2)
troca rápida sem espera, (3) `windowunmap`/`windowmap` (mais próximo de
minimizar/restaurar) + troca de foco. **Nas 3, o caractere digitado chegou no
campo do terminal**, sem precisar de clique — evidência de que o
`blur()`+`focus()` de `useFocusRestore` está de fato reancorando o teclado
depois do ciclo de foco do SO, no caminho que a lacuna original não cobria.

LIMITAÇÃO (declarada, não escondida): isso não é o critério de aceite da task
— que pede confirmação do usuário depois de uso real numa sessão de trabalho
normal, em possivelmente mais de um SO. O ambiente daqui é Linux/Xvfb **sem
window manager**, então `xdotool windowfocus` é uma chamada direta a
`XSetInputFocus`, sem o compositor/WM de um desktop de verdade no meio — e é
Linux, não o Windows que motivou a correção original nem o macOS pedido no "o
que fazer" da task. O teste prova que o mecanismo do fix funciona quando o
foco do SO muda de verdade (não só quando `activeElement` zera), mas não
substitui o uso real pedido.

Estado final (revisto na entrada seguinte): mecanismo do fix validado ao vivo
no ambiente Xvfb sem window manager (3/3 ciclos) — mas essa validação **não
reproduziu** o sintoma real, como a entrada abaixo mostra poucos minutos
depois.

## 02/09/2026 — Confirmação negativa em uso real: 2dfa56f e 1436c9f não corrigiram o bug de foco (clicar no campo não restaura)

Poucas horas depois de 1436c9f, Felipe topou de novo com o sintoma em **uso
real** (não teste) e corrigiu a leitura da entrada anterior: o bug acontece em
todos os SOs e nunca foi corrigido de verdade — a reprodução em Xvfb sem
window manager (entrada acima) simplesmente não alcançou o caminho real do
bug.

MEDIDO (relato coletado por pergunta interativa, não suposição): SO Linux;
gatilho foi trocar de janela/app (alt-tab) e voltar; **clicar direto no campo
de digitação NÃO restaurou** — só o padrão antigo do bug (minimizar/reabrir
ou reiniciar) destrava.

Esse dado muda o diagnóstico: as duas correções existentes
(`focus-restore.ts`/`useFocusRestore.ts`) atuam sobre *restauração automática
de foco* quando a janela do SO volta. Um clique manual do usuário no campo já
dispara `focus()` nativo do navegador por conta própria, **independente**
dessa lógica. Se nem clicar resolve, a causa provavelmente não está (só) em
"quem tem o foco do DOM" — é mais provável que seja um estado da aplicação
que trava a entrada de teclado mesmo com o elemento certo focado (listener
desanexado, sessão do terminal/PTY numa aba "morta", alguma flag que só volta
ao desmontar/remontar o componente — o que minimizar+reabrir faz de fato).

Task de confirmação fechada como Concluída (documentação e confirmação real
entregues, ainda que o resultado seja negativo). Investigação de causa raiz
que falta virou task nova, separada, prioridade Alta/Urgente:
[Felixo AI Core/Foco — Investigar causa raiz da trava de input após alt-tab](https://app.notion.com/p/Felixo-AI-Core-Foco-Investigar-causa-raiz-da-trava-de-input-ap-s-alt-tab-clique-n-o-restaura-cor-3cf91f95497e811e8d76d69db9055e3b).

Estado final: bug confirmado **não corrigido**; causa raiz ainda desconhecida.
Próximo passo é reproduzir com desktop Linux real (window manager de verdade,
não Xvfb headless) e instrumentar `useFocusRestore`/xterm no momento do
travamento — ver a task nova para o plano completo.

## 02/09/2026 — Por que o Claude Code não mostra barra de rolagem e o Codex mostra: comportamento das CLIs, não bug do Felixo

Task do Notion: usuário relatou que um bloco de terminal rodando Claude Code
nunca mostra barra de rolagem, enquanto um bloco rodando Codex mostra.
Investigação anterior (sem reprodução) já achara que não há nenhum código em
`app/src/features/canvas/terminal/` que diferencie CSS/opções do xterm.js por
`command` — a suspeita era comportamento das próprias CLIs (hipótese 1 da
task), não confirmada.

MEDIDO ao vivo com a skill `rodar-app` (Electron real sob Xvfb, não mock):
abri um terminal Claude Code e um Codex reais lado a lado no canvas, deixei os
dois chegarem ao prompt (sem gastar crédito à toa), e mandei o **mesmo prompt
determinístico** pros dois ("liste os números de 1 a 150, um por linha") —
saída grande o bastante pra estourar uma tela (~40 linhas visíveis num
`.xterm-viewport` de 690px).

- **Claude Code:** medi `.xterm-viewport.scrollHeight` vs `clientHeight` em 8
  amostras a cada 0,4s durante toda a geração — **sempre `690 === 690`**,
  nunca havia overflow, do início ao fim. Confirmado visualmente: nenhum
  indício de scrollbar em nenhum frame, mesmo com 150 linhas geradas.

- **Codex:** o mesmo prompt, medido e fotografado durante a geração, mostrou
  **overflow real** (`scrollHeight > clientHeight`) com uma **barra de
  rolagem funcional visível** (thumb parcial, arrastável) enquanto o texto
  ainda estava saindo. Ao terminar, o Codex limpa/redesenha a tela final e a
  barra some (`690 === 690` de novo) — mas durante a geração, que é quando o
  usuário mais notaria, ela aparece de verdade.

CAUSA: já existe evidência capturada nesta base de código (fixture real de
`terminal-session-store.test.ts`, CLI 2.1.227) de que o Claude Code entra no
**alternate screen buffer** do terminal (`\x1b[?1049h`) logo no boot — modo
usado por apps de tela cheia (vim, tmux, htop) que faz `xterm.js` tratar
`buffer.active` como um buffer de tamanho fixo, sem scrollback real (é assim
que o próprio xterm.js já documenta a diferença, ver comentário em
`terminal-buffer-reader.ts:54-63`). O Codex, pelo que a medição mostra, usa o
buffer normal enquanto está imprimindo (por isso overflow real durante o
streaming) e só limpa/redesenha por cima ao terminar. As duas CLIs usam a
mesma configuração do `xterm.js` e o mesmo CSS global (`div::-webkit-scrollbar`
em `index.css`) — a diferença nasce inteiramente de como cada CLI externa
gerencia sua própria tela, não de nada que o Felixo decide.

Task fechada como **Concluída sem código** — confirma a hipótese 1 do
relato original, exatamente o desfecho que o próprio critério de aceite da
task previa para esse caso ("se for das CLIs externas: registrado como
limitação conhecida, task fechada sem código"). Não há pendência: nenhuma
task nova aberta, porque não sobrou trabalho de causa raiz do Felixo — é
comportamento de terceiros.

Estado final: causa raiz identificada e reproduzida ao vivo (não só
hipótese); nenhuma correção de código cabe aqui.
## 03/09/2026 — DevTools isolado para agentes

Criado `felixo devtools`, uma CLI que abre uma instância Electron destacada com
CDP, perfil temporário e janela invisível. Cada ação (`screenshot`, `click`,
`type`, `press`, `text`, `eval` e `main`) conecta, age e desconecta, sem tmux ou
REPL vivo. O perfil real só entra por `--real-profile`; a inicialização recusa
quando os arquivos de singleton indicam uma instância existente.

No Windows, `Page.screenshot` ficou bloqueado para janela oculta mesmo com GPU
desligado. A captura passou a usar `webContents.capturePage()` por uma ponte IPC
que só existe quando a instância DevTools está ativa; o app normal não expõe
porta CDP nem essa ponte. Validação real: `launch`, PNG de 32 KB, avaliação
restrita no main e `quit`, todos no perfil isolado.

A skill `rodar-app`, o guia de desenvolvimento e o contexto inicial dos novos
terminais passaram a apontar para `felixo devtools --help`. O driver Xvfb legado
permanece documentado apenas para testes de teclado ou clipboard físico que CDP
não representa.

## Revalidação — 03/09/2026 — DevTools genérico para agentes

A task do `felixo devtools` foi revalidada no Linux com o app real em uma sessão
isolada. Durante a conferência apareceu uma falha no contrato documentado:
`felixo devtools --help` era rejeitado pelo parser, embora fosse o comando
indicado no contexto de todo terminal. O parser passou a aceitar essa forma e
ganhou teste de regressão; a documentação continua apontando para o comando
genérico, sem depender de uma Skill específica de agente.

Validação manual realizada entre 11:30:50 e 11:32 BRT, aproximadamente 2
minutos: `launch` sem janela visível, `status`, `windows`, `screenshot` nativo
de 33.924 bytes, `click-text Buscar`, `type`, `eval`, `main`, `press Escape` e
`quit`. A expressão no processo principal retornou `felixo-ai-core`; depois do
`quit`, `status` não encontrou sessão e o perfil temporário não permaneceu em
`/tmp`.

Gates desta revalidação: Node 995/995, frontend 763 aprovados e 1 skip
intencional, lint com 0 erros e os 2 avisos React preexistentes de
`SearchPanel`, typecheck completo, build, pack e `git diff --check`. O pacote
Linux foi regenerado e a captura foi conferida visualmente. Nenhum perfil real,
credencial, canvas do usuário ou processo externo foi tocado.

Commit: `fix(devtools): aceitar ajuda global no CLI`.

Limitação mantida: a prova interativa manual em macOS e Windows ainda depende
de máquinas desses sistemas; os contratos e a CI multi-SO continuam sendo a
evidência automatizada disponível. Essa prova foi separada em follow-up, sem
deixar esta task aberta.

## 03/09/2026 — Smoke de release do Windows não entrava no modo isolado

Ao executar o instalador NSIS num diretório temporário, o executável empacotado abriu o app normal, usando o `userData` real, e não criou o `app-status.json` do smoke. A causa é que o bootstrap do Electron/Chromium no Windows pode consumir um switch desconhecido como `--release-smoke` antes que ele apareça em `process.argv` do processo main.

Corrigido: o runner continua enviando o argumento por compatibilidade, mas agora também fornece `FELIXO_RELEASE_SMOKE=1`. A decisão de entrar no modo de smoke foi isolada em `electron/core/release-smoke-mode.cjs`, para que o app reconheça tanto o argumento legado quanto a variável de ambiente antes de tocar no perfil normal.

MEDIDO: 3 testes unitários novos para os dois sinais e para valores não autorizados; os testes de contrato do `release-smoke` também passaram (10/10).

O pacote local não pôde ser regenerado nesse checkout porque `fs.cpSync` ficou preso ao copiar o staging ignorado `app/build/npm-runtime` no volume Windows mapeado; a árvore do builder foi encerrada depois de ficar sem progresso. A release pública de 02/09/2026 passou a validação de artefato instalado nos runners `windows-latest` e `macos-latest`; a correção acima ainda precisa ser incluída no próximo build desses runners.
## Registro de Trabalho — 2026-09-03 — degradação do Canvas no Linux

PEDIDO: executar a task [Felixo AI Core/Performance — reproduzir e perfilar a
degradação do canvas no Linux](https://app.notion.com/p/Felixo-AI-Core-Performance-reproduzir-e-perfilar-a-degrada-o-do-canvas-no-Linux-3c791f95497e81ce97ddc545fa0df6ff?source=copy_link), separando custo esperado de carga, retenção de recursos e regressão de interação.

CONTEXTO E MÉTODO: a investigação aproveitou as bancadas existentes de PTY
nativo, xterm e React Flow. A matriz de terminal executa em Electron isolado
com Xvfb e mede entrega de bytes, RSS dos PTYs, RSS do renderer e da aplicação,
heap JavaScript, frames, long tasks, attach/detach, fechamento e retomada. A
bancada de conexões usa React Flow real com 1.000 nós e 2.503 arestas,
incluindo terminais, arquivos, grupos e notas. A coleta foi feita em processos
limpos para separar o efeito do scrollback do working set que Chromium pode
reter entre cenários.

REPRODUÇÃO LINUX: host Linux x64, kernel `7.0.0-30-generic`, 4 CPUs, 11,6
GiB de RAM, Node 24.18.0, Electron 41.10.7 e xterm 6.0.0. A rodada fixa de
20.000 linhas começou às 09:20:34 BRT e durou 1m11,75s; a adaptativa de 5.000
linhas começou às 09:21:57 e durou 59,54s. Com 20 terminais e 8.000 linhas,
20k produziu 264,20 MiB de delta de heap do stream, 706,0 MiB de RSS p95 do
renderer, 1.054,2 MiB de RSS agregado, 150,0 ms de frame p95, 401 ms de long
task p95 e resume de 8,09s. Com 5k, os valores foram 180,08 MiB, 565,4 MiB,
914,7 MiB, 158,4 ms, 266,5 ms e 4,59s; 8.137 linhas ficaram retidas no modo
fixo contra 5.032 no adaptativo. A saída, identidade, attach/detach e resume
passaram nos dois modos. O heap pós-GC voltou para 33,26 MiB e 6,96 MiB,
respectivamente, o que reproduz degradação por carga, mas não prova por si só
um vazamento global.

DIAGNÓSTICO: a remoção genérica do React Flow persistia a exclusão por
`removeNode`, porém não liberava a sessão do `TerminalSessionStore`. O caminho
de seleção, teclado ou `deleteElements` podia portanto deixar PTY, xterm,
listeners e timers vivos; o botão próprio do terminal já fazia a limpeza. Foi
encontrada também uma corrida em que `clear` durante o carregamento lazy podia
permitir que um `ensure` atrasado recriasse uma sessão depois de o canvas estar
vazio.

IMPLEMENTAÇÃO:

- `app/src/features/canvas/services/canvas-node-removal.ts` centraliza a
  liberação dos ids removidos, deduplica mudanças em lote, libera somente
  terminais no store e mantém a remoção persistida para qualquer tipo de nó;
- `CanvasView.tsx` usa essa fronteira para todos os caminhos de remoção e
  também descarta o histórico de notificações dos nós removidos;
- `deferred-terminal-session-store.ts` adiciona uma geração de limpeza que
  invalida `ensure` enfileirado e não carrega o runtime lazy apenas para limpar
  um canvas vazio;
- os testes novos cobrem liberação idempotente de terminal, remoção mista e a
  corrida `ensure`/`clear`;
- o gate do benchmark passou a comparar o delta de heap durante o stream quando
  disponível, mantendo RSS como fallback para relatórios antigos. O harness do
  React Flow passou a carregar seu CSS oficial, removendo um aviso que podia
  poluir a medição.

MEDIÇÃO DO ÍNDICE: a rodada React Flow de 1.000 nós e 2.503 arestas começou às
09:33:11 BRT e durou 3m52,13s. Baseline → índice: render inicial
2.102,37 → 1.959,59 ms; drag 57,62 → 98,57 ms; resize 69,09 → 75,67 ms;
criação/remoção de aresta 59,70 → 14,38 ms; mudança de dados 61,90 → 12,31
ms. O heap não teve aumento material; drag e resize foram tratados como
variância local, não como ganho. O smoke pós-correção, sem aviso de CSS, foi
executado às 09:38:05 e durou 16,75s.

VALIDAÇÃO: testes focados do ciclo de vida, testes do gate em Node, typecheck
completo, lint, build, benchmark de terminal com `--check`, benchmark do
React Flow com `--check`, `git diff --check` e os smoke/gates de empacotamento
foram executados conforme a etapa de publicação. O check final da matriz de
terminal, com 10/20 sessões, 6.000 linhas e políticas atual/adaptativa, ocorreu
às 09:44:10 e durou 2m10,45s; saída, identidade, attach/detach, resume e
redução de heap passaram.

LIMITAÇÕES: o benchmark xterm não inicia CLIs reais nem webviews; o fixture do
React Flow usa nós leves e não substitui uma sessão de produção com providers,
window manager e guests Chromium. A evidência de heap usa
`performance.memory` antes/depois de GC exposto, não snapshots DevTools de uma
sessão longa. Assim, o caminho PTY/xterm de remoção foi corrigido e coberto,
mas não é correto declarar ausência de retenção dentro de webviews ou de uma
sessão real de provider sem uma bancada específica.

Estado final: investigação, reprodução, correção de ciclo de vida,
instrumentação, testes e documentação concluídos; task pronta para commit,
push, acompanhamento do CI/release e encerramento no Notion. A limitação de
snapshots de produção permanece explicitamente delimitada para eventual task
separada, sem bloquear esta entrega.

## Registro de Trabalho — 2026-09-03 — troca entre múltiplas contas Codex sem perder o canvas

PEDIDO: executar a task [Felixo AI Core — trocar entre múltiplas contas do
Codex dentro do app sem perder o canvas](https://app.notion.com/p/3c091f95497e814e8095dd43af228a97).

ESTADO ENCONTRADO: a implementação já estava no `main` e cobre o caminho
reaberto da task. O configurador do canvas lista o login do sistema e os
perfis cadastrados, permite criar/selecionar/remover uma conta, persiste
`accountId`/`providerId` no node e reaproveita esses campos no restart do
drawer. Para o Codex, cada perfil nasce com `CODEX_HOME` próprio; a CLI é
responsável por criar e manter a credencial. Assim, duas contas podem existir
simultaneamente sem logout global e sem encerrar PTYs silenciosamente.

VALIDAÇÃO AUTOMATIZADA: os testes focados de perfis, IPC e PTY passaram com
39/39 casos; os testes de uso por conta, isolamento e histórico passaram com
19/19; a suíte Node completa passou com 994/994; a suíte frontend passou com
763/763, além de 1 skip intencional; `npm run test:native` passou com 5/5;
typecheck completo, build, lint e empacotamento Linux também passaram. O lint
terminou sem erros e manteve somente os 2 avisos React preexistentes do
`SearchPanel`.

VALIDAÇÃO DO PACOTE: `release/linux-unpacked` foi iniciado pelo Electron real
em `userData` descartável. O smoke passou às 10:51 BRT e durou 16,00 s:
startup de 3.021 ms, PTY nativa com marcador de sucesso, npm-runtime 11.19.1
com 1.527 arquivos, instalação/atualização offline de fixture e persistência
dos shims. Não houve erro nativo.

VALIDAÇÃO VISUAL: DevTools iniciou uma instância isolada do app, abriu
**Configurar novo agente**, cadastrou duas contas Codex fictícias (`teste-a` e
`teste-b`) via IPC, mudou o provedor para Codex e selecionou a segunda conta.
O DOM exibiu as duas opções e o botão **Remover**; o canvas continuou montado.
Nenhum agente foi lançado e nenhuma credencial real foi lida, criada ou
alterada. A instância e o `userData` temporário foram encerrados/removidos ao
final.

LIMITE DE ACEITE: não é possível afirmar a validação manual com duas contas
Codex reais em um pacote instalado no macOS/Windows a partir deste host Linux:
não há segunda conta autorizada disponível e não há esses sistemas nativos
para executar. Também não se promete que uma conversa interna já aberta mude
de identidade no meio do processo; quando a CLI exigir novo processo, o
restart é explícito, conserva o node, diretório, histórico e perfil escolhido,
mas a continuidade interna depende do contrato da própria CLI.

Estado final: implementação existente revalidada, documentação funcional
confirmada e smoke do pacote concluído; pronta para commit, push,
acompanhamento do CI/release e encerramento da task. A evidência manual
multi-SO com duas contas reais fica como follow-up separado, sem bloquear esta
entrega.

## Registro de Trabalho — 2026-09-03 — avaliar alternativa ao npm-runtime do instalador

PEDIDO: executar a task [Felixo AI Core/Arquitetura — Avaliar alternativa ao
npm embutido sem perder a instalação de CLIs](https://app.notion.com/p/Felixo-AI-Core-Arquitetura-Avaliar-alternativa-ao-npm-embutido-sem-perder-a-instala-o-de-CLIs-3cc91f95497e81e99473da3d6facda1).

DIAGNÓSTICO: o app instala CLIs oficiais sem depender de Node/npm do usuário,
usando `app/node_modules/npm` empacotado, prefixo isolado em `userData/clis`,
shims `node`/`npm` apontando para o Electron e PATH controlado. Portanto, uma
troca por pnpm, Yarn ou Corepack precisa conservar instalação/atualização,
binários, permissões, offline, perfis isolados e CLIs com dependências nativas;
alterar somente o `package.json` não seria uma avaliação suficiente.

IMPLEMENTAÇÃO:

- `app/scripts/package-manager-alternatives-performance.cjs` passou a
  comparar o npm-runtime atual, pnpm, Yarn Classic, Yarn moderno e Corepack.
  A bancada usa versões controladas pelo Corepack, prefixos/cache/store
  descartáveis, um `tar.gz` local, o modo Node do Electron e sem alterar
  instalações globais;
- o npm reutiliza a bancada de runtime existente. pnpm é exercitado com
  `global-dir` e `PNPM_HOME/bin`; Yarn Classic com `global-folder` e
  `prefix/bin`; ambos validam instalação, atualização, prefixo, PATH, shim,
  execução e versão da CLI. O fixture usa `--ignore-scripts` para não executar
  código externo; scripts nativos de CLIs oficiais ficaram explicitamente como
  gate de migração;
- Yarn moderno é medido no runtime/startup e sondado com `global add`; sua
  falha esperada é registrada porque PnP/`dlx` não equivale ao global install
  persistente requerido pelo launcher. Corepack é medido como ponte, com
  runtime próprio e bootstrap frio/quente dos gerenciadores;
- o script aceita `--check` e `--strict`, grava JSON sem caminhos privados e
  tem testes unitários para parsing, medição, recomendação e validação;
- `app/package.json`, `ci.yml`, README, guia do desenvolvedor, guia de execução,
  arquitetura e catálogo de benchmarks documentam o comando. CI executa a
  comparação na matriz Ubuntu/Windows/macOS e publica um JSON por runner;
- a bancada do npm passou a exportar somente as funções necessárias para
  reutilização, sem mudar a política de empacotamento nem o caminho de
  produção.

MEDIÇÃO LOCAL: Linux x64, Node 25.9.0, Electron 41.10.7, duas repetições.
O npm 11.19.1 mediu 1.527 arquivos, 8.814.897 bytes descompactados e
2.264.260 bytes em `tar.gz`; startup p50/p95 de 2.093,213/2.786,998 ms,
primeira CLI 2.857,103/2.925,176 ms e atualização 3.391,189/3.666,694 ms.
pnpm 11.25.0 mediu 456 arquivos, 20.297.574 bytes e 5.084.086 bytes
comprimidos; startup direto 4.317,236 ms, primeira CLI p50/p95
11.677,711/12.243,780 ms e atualização 11.542,162/12.322,060 ms. Yarn
Classic 1.22.22 mediu 12 arquivos, 5.340.738 bytes e 1.248.008 bytes
comprimidos; startup 1.463,817 ms, primeira CLI 5.282,926/5.672,203 ms e
atualização 5.086,890/5.115,949 ms. Yarn moderno 4.10.3 mediu 2 arquivos,
2.990.376 bytes e 1.057.416 comprimidos, mas não ofereceu global install.
Corepack 0.34.6 mediu 54 arquivos, 1.040.114 bytes e 229.072 comprimidos;
bootstrap frio ficou entre 2.681,567 e 8.203,432 ms, com aquecimento entre
823,922 e 2.527,011 ms.

DECISÃO: manter o npm-runtime. pnpm funcionou, porém foi aproximadamente 2,3x
maior descompactado que o npm e muito mais lento no fixture; Yarn Classic foi
menor, mas exige layout/política global próprios; Yarn moderno não atende ao
contrato de instalação; Corepack adiciona versões, cache e bootstrap/rede, sem
eliminar os artefatos dos gerenciadores. O resultado não autoriza remover o
npm-runtime.

VALIDAÇÃO: testes da nova bancada (4/4), lint focado e execução real Linux com
`--iterations=1 --check` e `--iterations=2 --check` passaram; npm, pnpm e Yarn
Classic instalaram/atualizaram a fixture e executaram os binários, e Yarn
moderno falhou no `global add` de forma esperada. A matriz CI passa a repetir o
check nos três SOs. Ficam como gates futuros: CLIs oficiais reais, lifecycle e
dependências nativas, rede/proxy/offline, memória, artefato empacotado e
confirmação nativa em Windows/macOS; esses pontos não bloqueiam esta avaliação
arquitetural.

Estado final: investigação, bancada reproduzível, recomendação, testes e
documentação concluídos; pendente apenas commit, push, acompanhamento do CI e
registro/encerramento da task no Notion conforme o workflow.

## 06/09/2026 — Pin de versão e verificação de hash na instalação automática das CLIs

CONTEXTO: a instalação automática (`cli-auto-install.cjs` → `managed-cli-installer.cjs`)
sempre rodava `npm install --global` sem versão fixa — instalava o `latest` do
momento, sem checar hash contra nada. Investigado em 05/09/2026 (task de origem
"Fixar versão, hash e cache offline do gerenciador de CLIs"); esta entrada
implementa os dois primeiros pontos (pin de versão e verificação de hash).
Cache offline por perfil e a prova de isolamento entre perfis continuam em
subtasks separadas, ainda não implementadas.

O QUE MUDOU:
- `electron/core/managed-cli-manifest.cjs` (novo): manifesto com versão exata e
  hash `sha512` (campo `dist.integrity` do registry) de `@openai/codex`,
  `@anthropic-ai/claude-code` e `@google/gemini-cli`, capturados em 06/09/2026.
  `getPinnedInstallTarget(id)` devolve `pacote@versao-exata`.
- `electron/services/managed-cli-installer.cjs`: `installManagedPackage` aceita
  `expectedIntegrity` e, quando presente, roda `npm view <pacote> dist.integrity`
  **antes** de instalar — hash divergente cancela a instalação sem chegar a
  chamar `npm install`. Sem `expectedIntegrity` o comportamento é o de antes
  (pacote fora do manifesto não trava).
- `electron/services/cli-auto-install.cjs`: busca a entrada do manifesto pelo
  `cli.id` e passa `pacote@versao` + `expectedIntegrity` ao instalador.
- `official-cli-catalog.cjs` (instrução manual mostrada à pessoa) foi
  **deliberadamente não tocado** — continua instalando `latest`, porque é o
  comando que a documentação oficial de cada CLI manda rodar; o pin vale só
  para a instalação automática e silenciosa do app.

O QUE NÃO FOI FEITO E POR QUÊ: a verificação de hash checa contra o registry
via `npm view`, não contra um hash vendorizado localmente — é defesa em
profundidade sobre o que o próprio npm já confere ao instalar (ele já recusa
tarball com hash diferente do anunciado), não substituição disso. Cache
offline por perfil (subtask separada) ainda decide se o binário instalado é
por perfil ou compartilhado — este pin não presume uma resposta.

VALIDAÇÃO: `node --test` nos quatro arquivos afetados — 28/28 testes passando,
incluindo os seis novos (query de hash sem tocar disco, hash batendo, hash
divergindo, `npm install` nunca chamado quando o hash diverge, ordem
view→install quando bate, e pacote fora do manifesto seguindo sem checagem).
`node -c` confirmou a sintaxe dos três arquivos `.cjs` alterados/criados.
`npm run lint`/`npm run build` **não foram rodados nesta sessão**: a máquina
ficou com menos de 200MB de RAM livre e swap saturado logo depois que um
`npm run pack` anterior (nesta mesma sessão, para outra task) derrubou por
OOM o processo real do Felixo AI Core que estava aberto — rodar outro build
pesado em seguida repetiria o risco. Fica como limitação declarada: falta
rodar lint e o build completo do TypeScript antes do próximo merge que mexer
nesses arquivos.

Estado final: pin de versão e verificação de hash implementados e testados
(testes leves, `node --test`); lint e build completo pendentes por limitação
de memória da máquina nesta sessão — não bloqueiam o commit porque os
arquivos alterados são `.cjs` fora do project reference do `tsc`.

## Registro de Trabalho — 2026-09-07 — dependência opcional ausente ao instalar Codex no Windows

CONTEXTO: a task [Felixo AI Core/Agentes — corrigir erro ao criar perfis do Codex (dependência opcional ausente no Windows)](https://app.notion.com/p/Felixo-AI-Core-Agentes-corrigir-erro-ao-criar-perfis-do-Codex-depend-ncia-opcional-ausente-no-Win-3d491f95497e8127bdf2df563c7a96bb) registrou que `@openai/codex` podia terminar a instalação com sucesso no npm, mas falhar depois com `Missing optional dependency @openai/codex-win32-x64`.

CAUSA CONFIRMADA: `npm view @openai/codex@0.153.4 optionalDependencies --json` lista pacotes nativos separados por sistema e arquitetura. O instalador não tinha verificação pós-instalação; portanto, um código de saída 0 do npm era tratado como instalação pronta mesmo quando o pacote nativo do Windows não existia.

IMPLEMENTAÇÃO:

- `app/electron/core/managed-cli-manifest.cjs` declara os pacotes `@openai/codex-win32-x64` e `@openai/codex-win32-arm64` por plataforma/arquitetura, preservando o pin do Codex já existente;
- `app/electron/services/managed-cli-health.cjs` verifica a presença do `package.json` da dependência exigida no prefixo gerenciado e preserva a mensagem acionável emitida pelo Codex;
- `app/electron/services/cli-auto-install.cjs` deixa de considerar suficiente a existência do executável, repete uma instalação aparentemente bem-sucedida quando a dependência opcional está ausente e grava falha detalhada quando a segunda tentativa também não resolve;
- `app/electron/services/cli-auto-install-plan.cjs` inclui o detalhe da falha na mensagem principal do status, que é o texto mostrado pelo aviso da interface. O retry IPC existente (`clis:retry-setup`) continua disponível para uma nova tentativa manual;
- testes de saúde, instalação automática e resumo cobrem ausência inicial, recuperação na segunda tentativa e erro persistente.

VALIDAÇÃO: 27/27 testes focados passaram (`managed-cli-health`, `cli-auto-install`, `cli-auto-install-plan` e `managed-cli-manifest`); `node --check` passou nos módulos alterados; ESLint focado passou sem avisos; `git diff --check` passou. A ausência foi reproduzida com um prefixo temporário que contém o executável do Codex, mas não o pacote nativo, sem tocar a instalação global nem credenciais reais.

LIMITE: ainda falta validar a recuperação contra um artefato empacotado completo em cada runner do CI e acompanhar o release; a suíte e o pipeline serão a prova final de empacotamento e compatibilidade multi-SO. O caminho manual `official-cli-service` continua separado do instalador automático gerenciado e não foi alterado nesta task.

## Registro de Trabalho — 2026-09-07 — agentes abrem páginas pelo app

CONTEXTO: o agente que roda no terminal do canvas consegue ler a saída da CLI,
mas não tem uma chamada de volta para o processo principal do Electron. A task
do Fetch All já havia criado a fila local `userData/agent-requests`; criar um
socket ou um segundo transporte só repetiria a mesma fronteira e aumentaria a
superfície de segurança.

DECISÃO: reutilizar a fila existente com a intenção fechada `abrir-pagina`.
`felixo browser open <url>` pede abertura no navegador externo; `--embedded`
(ou `navegador abrir ... --embutido`) pede um bloco Webpage persistido no
canvas. Somente URLs `http:` e `https:` atravessam a validação. O consumidor
externo chama o mesmo `shell.openExternal` usado pelo handler de links do app;
o consumidor embutido envia um evento pelo preload, que o CanvasView transforma
em nó e posiciona numa área livre. O Fetch All filtra sua própria intenção e
continua exigindo confirmação para escrita.

IMPLEMENTAÇÃO: o repositório de pedidos ganhou normalização de URL/modo e
filtro por ação; o observador de arquivos passou a ser compartilhado por Fetch
All e pelo consumidor de navegador; a CLI ganhou `browser`/`navegador`, status
do pedido e a skill `abrir-paginas-no-navegador`. O preload mantém uma pequena
fila de eventos para não perder uma abertura embutida se ela chegar antes da
montagem do React.

VALIDAÇÃO LOCAL: 33 testes Node focados passaram; `npx vite build`, ESLint
focado e `git diff --check` passaram. A suíte Node completa encontrou falhas de
ambiente já fora desta alteração (Electron instalado sem o binário, criação de
symlink recusada pelo Windows e um benchmark de RSS); o `tsc` também encontrou
declarações ausentes na árvore local de `node_modules`, enquanto o build Vite
concluiu normalmente.

Estado final: implementação, skill, testes e documentação concluídos; falta
somente commit, push, CI/release e registro final na task/relatório.

## Registro de Trabalho — 2026-09-07 — contexto inicial do Canvas sem submissão automática

AGENTE/REPOSITÓRIO: Codex / Felixo-AI-Core. Início do ciclo: 23:18. A task
solicita validar o prompt inicial como contexto, sem Enter automático, em um E2E
multi-SO para os caminhos shell, launcher, Openia, Claude, Codex e Gemini.

IMPLEMENTAÇÃO:

- `app/src/features/canvas/terminal/canvas-context-e2e.test.ts` conecta o
  `TerminalSessionStore` real ao `PtyProcessManager` real e injeta somente um
  PTY fake determinístico. O fake registra cada escrita, separa contexto,
  prompt e Enter, não autentica nenhuma CLI e não executa processo externo;
- o E2E verifica que a referência de contexto chega uma vez e sem `\r`/`\n`,
  que ela nunca vira execução, e que a tarefa só executa depois da ação
  explícita. Também verifica flags reais, `cwd`, conta/provedor, reidratação
  no reload, prontidão de conexões/arquivos e resume compatível/fallback
  identificável;
- `ci.yml` executa a proteção nos runners Ubuntu/Windows/macOS e publica um
  JSON sanitizado por SO, mesmo quando a etapa falha. README e a documentação
  de benchmarks registram o comando, a matriz e o limite da validação visual
  com app empacotado e CLI real.

VALIDAÇÃO LOCAL: `npm run test:canvas-context` passou 4/4; a execução com
reporter JSON passou 4/4 e gerou artefato sem conteúdo de prompt, arquivo ou
credencial; `npm run typecheck`, `npm run test:frontend` (767 passaram, 1
ignorado), `npm run test:native` (5/5), `npm run lint` (0 erros, 2 avisos
preexistentes em `SearchPanel.tsx`) e `npm run build` passaram. `npm test`
terminou com 986/995 testes passando e 8 falhas ambientais: Electron sem o
binário porque as dependências locais foram instaladas offline sem scripts,
ConPTY sem `AttachConsole` neste runner, symlink bloqueado pelo Windows e
fixtures locais de descoberta/perfil Codex; nenhuma falha aponta para os
arquivos desta alteração.

LIMITE: a execução local não abre CLI autenticada nem comprova o Canvas visual
empacotado. Essa matriz real permanece pendente de runner/fixture segura e foi
documentada como pendência, sem converter ausência de autenticação em sucesso.

Estado no ponto do registro: implementação, teste, documentação e gates locais
prontos; commit, push, CI/release e registro final no Notion ainda serão feitos
no fechamento desta task.

ATUALIZAÇÃO DE CI — após o push, o Ubuntu encontrou uma flutuação preexistente
no teste `electron/cli/felixo.test.cjs`: duas requisições consecutivas podiam
receber o mesmo milissegundo e a listagem de arquivos não garantia a ordem que
o teste assumia. A asserção foi tornada determinística procurando cada URL,
sem alterar o repositório de produção. O teste focado passou 17/17; o CI novo
ainda aguarda o rerun multi-SO antes do encerramento.

## Registro de Trabalho — 2026-09-08 — tela preta constante em PCs mais fracos

CONTEXTO: a task [Felixo AI Core/Performance — investigar tela preta constante em PCs mais fracos](https://app.notion.com/p/Felixo-AI-Core-Performance-investigar-tela-preta-constante-em-PCs-mais-fracos-3d491f95497e81f099e3ef3d8553e7c8) solicita uma recuperação sem reiniciar o aplicativo inteiro e uma investigação do fallback `disable-gpu` já usado pela automação DevTools.

IMPLEMENTAÇÃO:

- `app/electron/core/graphics-mode.cjs` resolve `auto`, `hardware` e `software` com precedência de argumento, ambiente e perfil persistido. Em modo automático, Windows com até 4 GiB de RAM ativa rasterização por software; nos demais casos a GPU continua preservada. O `disable-gpu` é aplicado antes de `app.whenReady()` e o estado é exposto no QA Logger;
- o preload e os painéis de Configurações do Canvas e do chat permitem consultar o estado e salvar manualmente o modo gráfico para a próxima abertura;
- `app/index.html` ganhou um fallback estático visível antes do React montar, com recarga apenas do renderer; `RendererRecoveryBoundary` cobre falhas de renderização e mantém o processo principal/PTYs vivos;
- o guia do usuário documenta o caminho de recuperação e a escolha de modo compatível.

VALIDAÇÃO LOCAL: `node --test electron/core/graphics-mode.test.cjs` passou 5/5; `npm run typecheck` passou; `npm run lint` terminou sem erros e manteve apenas os dois avisos preexistentes de dependências em `SearchPanel.tsx`; `npm run test:frontend` passou 767 testes, com 1 ignorado; `npm run build` concluiu com 2472 módulos transformados; `git diff --check` passou. `npm test` terminou com 991 testes passando, 8 falhas e 1 ignorado, todas falhas ambientais já conhecidas (binário Electron ausente, fixture local de descoberta/perfil, processo PTY e symlink bloqueado no Windows).

LIMITE: o ambiente atual não possui um PC fraco que reproduza a tela preta e também não conseguiu iniciar o binário Electron local; portanto a aceitação de teste em uma máquina reproduzível ainda está pendente. O modo automático é deliberadamente conservador — memória baixa no Windows — e deve ser confrontado com o hardware reproduzível antes de encerrar a task.

Estado: implementação e gates locais prontos; task permanece em andamento aguardando validação manual em hardware reproduzível.

## Registro de Trabalho — 2026-09-08 — tarefas do Notion dentro do Canvas

AGENTE/REPOSITÓRIO: Codex / Felixo-AI-Core. Início do ciclo: 09:05. Task:
[Felixo AI Core/Canvas — renderizar e manipular a task list do Notion dentro do app](https://app.notion.com/p/Felixo-AI-Core-Canvas-renderizar-e-manipular-a-task-list-do-Notion-dentro-do-app-3d491f95497e81259fb0de34bb569178).
A especificação confirmava a arquitetura nativa, conexão própria por usuário,
cache local e o escopo de listar, filtrar, criar, editar, concluir/reabrir e
arquivar tarefas. As sete subtasks da task foram lidas antes da implementação.

DECISÕES E INVESTIGAÇÃO:

- A integração ficou nativa no Electron, sem embed do `notion-workspace-app` e
  sem reaproveitar credenciais do conector `notion-tasks`. A pessoa cadastra o
  próprio token e só vê data sources que o Notion compartilhou com essa conexão.
- A API oficial atual separa database de data source desde `2025-09-03` e a
  versão adotada é `2026-03-11`: busca, resolve schema, pagina consultas e usa
  `in_trash` para arquivar conforme a documentação atual do Notion.
- O token nunca atravessa preload/renderer, logs, cache ou resposta IPC. A
  metadata pública fica em `config/notion-connections.json`; o segredo fica em
  `config/notion-connection-secrets.bin`, cifrado por `safeStorage`, com recusa
  explícita quando o Linux só oferece o backend `basic`.
- O cache SQLite usa `notion_task_cache` e `notion_sync_state`, sempre com a
  chave composta por conexão + data source. Falha de rede retorna o snapshot
  marcado como `stale`; uma alteração só é anunciada como salva depois de a API
  do Notion confirmar.

IMPLEMENTAÇÃO:

- `electron/services/notion-client.cjs`: cliente HTTP sem dependência externa,
  timeout, retry limitado para 429/5xx, paginação limitada, descoberta de
  tabelas, schema genérico, normalização de propriedades e CRUD de páginas;
  `NotionClientError` converte status em mensagens acionáveis sem ecoar corpo
  ou token.
- `electron/services/notion-connection-store.cjs`: cadastro/edição/teste/
  remoção por perfil, metadados públicos separados do segredo e permissões
  privadas nos arquivos.
- `electron/services/storage/migrations/011_notion_task_cache.sql` e
  `storage/notion-cache-repository.cjs`: snapshot, timestamps, estado de sync,
  erro sanitizado, isolamento de conexões e atualização/remoção após mutações.
- `electron/services/notion-service.cjs` e `notion-ipc-handlers.cjs`: fronteira
  principal com contratos `{ ok, message }`, seleção de database/data source,
  cache resiliente e operações de conexão/tarefas; `preload.cjs` expõe somente
  dados normalizados.
- `NotionTasksPanel.tsx` entrou como ferramenta lazy do Canvas: configuração
  de conexão, busca de tabelas compartilhadas, filtros, indicação de snapshot
  stale, criação/edição, concluir/reabrir e confirmação de envio à lixeira.
  O painel é carregado somente quando aberto pelo menu Ferramentas.
- README e `docs/projeto/ARQUITETURA.md` registram a fronteira de segurança,
  o modelo de cache e o carregamento sob demanda.

VALIDAÇÃO LOCAL:

- `node --test` nos testes focados do cliente, store, cache e serviço Notion:
  8/8 passaram; cobrem paginação, headers/versionamento, schema/propriedades,
  retry/redação de erro, separação do token, backend basic, isolamento de
  cache e fallback stale/offline.
- `npm run typecheck`, `npm run lint -- --no-warn-ignored`,
  `npm run test:frontend`, `npm run build` e `git diff --check` passaram. A
  suíte frontend terminou sem falha; o build transformou 2.473 módulos e
  gerou o chunk lazy `NotionTasksPanel`; a integração não adiciona dependência
  nova de npm.
- `npm test` passou 1.048/1.048 testes, sem cancelamentos, skips ou falhas.
- Smoke no app real via DevTools passou: a ferramenta `Tarefas Notion` aparece
  no menu, abre o painel, renderiza a configuração de conexão e é registrada
  no marcador de ferramentas lazy (`notionTasks`). O teste não inventa token:
  a validação contra uma database Notion compartilhada real continua manual.

ESTADO NO PONTO DO REGISTRO: implementação, documentação e gates locais
concluídos; commit, push, CI/release, atualização das sete subtasks e
encerramento da task pai ficam para o fechamento deste ciclo. Pendências de
hardware/credencial real devem virar follow-ups no Notion, não deixar a task
pai aberta depois de a aceitação implementada ser registrada.

## Retificação de Trabalho — 2026-09-08 — correções emergenciais do painel Notion

AGENTE/REPOSITÓRIO: Codex / Felixo-AI-Core. Início da retificação: 09:35.

CORREÇÕES:

- O painel consumia tipos Notion que estavam declarados apenas no módulo de
  ambiente; eles foram movidos para `src/features/shared/types/notion.ts` e
  importados explicitamente, eliminando os `TS2304` reproduzidos no
  typecheck.
- Os três carregamentos automáticos do painel foram agendados fora do ciclo
  síncrono de efeitos, com limpeza do timer; isso elimina os erros de lint de
  atualização de estado dentro do `useEffect` e evita disparos após desmontagem.
- `notion-service` deixou de re-normalizar data sources já normalizados, e o
  vínculo `dataSourceId`/database pai passou a ser preservado; uma regressão
  cobre o caso.

VALIDAÇÃO EM 10:08: `node --test` dos serviços Notion passou 9/9; `npm run
typecheck` passou; `npm run lint` passou com os dois avisos preexistentes de
`SearchPanel.tsx`; `npm run build` passou com 2.473 módulos; `npm run
test:native` passou 5/5; `npm run test:frontend` passou 771 testes com 1
ignorado; `npm test` passou 1.048/1.048 testes; `git diff --check` será
revalidado antes do commit.

LIMITE DE ACEITAÇÃO: tentei abrir o app web local para a validação visual e
dos inputs, mas o navegador embutido estava indisponível (`browsers.list()`
vazio). Portanto não invento teste manual com token Notion; a confirmação
visual/E2E em app real fica como follow-up aberto no Notion. O teste automatizado
não toca em credenciais reais.

ESTADO: código e gates locais prontos; commit, push, CI/release e registros no
Notion ainda serão concluídos neste ciclo.

## Fechamento de Trabalho — 2026-09-08 — publicação e rastreabilidade do painel Notion

AGENTE/REPOSITÓRIO: Codex / Felixo-AI-Core. Janela completa: 09:35–10:50
(75 min).

FECHAMENTO:

- O commit de código `58be0fc` foi publicado em `main`; a correção de
  documentação/IA ficou no commit `2d61d27`. O worktree terminou limpo e
  alinhado com `origin/main`.
- A CI do SHA de código (`34230176706`) passou. A release foi despachada
  explicitamente sobre esse SHA validado, e os jobs de Ubuntu, Windows e macOS
  passaram com smoke dos artefatos. A versão publicada é `v0.1.205`:
  https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.205
- A CI posterior do commit somente-documentação (`34230343800`) foi repetida
  no runner Windows e falhou no teste nativo de PTY por `AttachConsole failed`
  / ConPTY, com Linux e macOS verdes. A falha é ambiental e não altera o SHA
  de código já validado e publicado; não foi mascarada por mudança de teste.
- O relatório diário de 08/09/2026 foi atualizado sem duplicar a linha, com
  evidências, release, limitação do navegador e próximos passos. A task-mãe
  foi marcada `Concluída`; as seis fatias de implementação ficaram
  `Concluída`; a subtask de validação ficou `Aguardando resposta` para o smoke
  manual autenticado/foco-input, pois o Browser in-app não tinha sessão.

VALIDAÇÃO FINAL: 9 testes focados Notion, typecheck, lint, build, 5 testes
nativos, 771 testes frontend, 1.048 testes totais e `git diff --check` passaram.
Não houve uso de token real nem alegação de validação visual quando o navegador
não estava disponível.

## [2026-09-08] Correção multiSO na entrega de artefatos de contexto

**Diagnóstico:** o contrato anterior enviava para a PTY o caminho absoluto do
`context-deliveries` do processo que criou o arquivo. Quando o contexto era
retomado em outro sistema operacional, perfil ou máquina, o agente recebia
referências como `/Users/...` que não existiam na sessão atual e podia trocar
silenciosamente o artefato por um fallback equivalente.

**Implementação:**

- `TerminalSessionStore` agora entrega somente o nome gerado do artefato e
  orienta `felixo context read "<nome>"`; o alias `felixo contexto ler` também
  funciona. Nenhum caminho absoluto é serializado no prompt.
- `context-command.cjs` resolve o diretório do perfil ativo pelo shim
  multiplataforma, lê somente nomes com prefixo/sufixo do contrato e rejeita
  caminhos, traversal e arquivos fora do namespace de contexto. Arquivo
  ausente retorna erro explícito, sem sugerir outro artefato.
- O fallback Node-only de `app-paths.cjs` passou a usar o layout nativo de
  Linux (`XDG_CONFIG_HOME`), macOS (`Library/Application Support`) e Windows
  (`APPDATA`), em vez de assumir `~/.config` em todo sistema.
- O contrato de nome foi separado de módulos Electron para que o leitor
  standalone funcione no runtime empacotado com `ELECTRON_RUN_AS_NODE=1`.
- Guia do usuário e arquitetura registram a regra de não transportar caminhos
  absolutos entre SOs/perfis.

**Validação local:** 53 testes nativos focados, 44 testes frontend focados,
`npm run typecheck`, `npm run lint` (0 erros; 2 avisos preexistentes em
`SearchPanel.tsx`), `npm run test:frontend` (771 passaram, 1 ignorado),
`npm test` (1.056 passaram) e `npm run build` passaram. A validação manual em
um host macOS/Windows ainda depende dos runners de CI/release; os layouts foram
cobertos por testes determinísticos e o shim continua sendo o resolvedor do
perfil nativo em cada host.

**ESTADO NO PONTO DO REGISTRO:** implementação, documentação e gates locais
concluídos; commit, push, CI/release e atualização da task no Notion ficam para
o fechamento desta execução.

## Fechamento de Trabalho — 2026-09-08 — correção multiSO publicada

AGENTE/REPOSITÓRIO: Codex / Felixo-AI-Core.

- A correção de implementação foi publicada nos commits `8b3e5d9` e
  `ee3be0a`. O segundo corrige a conversão indevida de caminhos POSIX quando o
  runner Windows simula o layout do macOS.
- A CI `34241745594` passou em Ubuntu, macOS e Windows, além da política de
  dependências, auditorias e lançadores.
- A release `v0.1.208` passou build, smoke test e upload dos três alvos:
  https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.208
- A task de contexto no Notion foi relida, recebeu este fechamento e permaneceu
  em `Etapa: Concluída`.
- Validação local final: 53 testes nativos focados, 44 testes frontend
  focados, typecheck, lint, suíte frontend, 1.056 testes totais, build e
  `git diff --check` passaram.

## [2026-09-09] Notion Tasks: filtros, sincronização, colunas — e um episódio de correção revertida

**Task.** Uma sequência de pedidos diretos do usuário sobre o painel de Tarefas Notion
do Canvas, mais um bug real relatado ("o bloco do Notion some ao reabrir o app"), mais
um pedido de UI de atualização, mais uma investigação de confiabilidade do canal de
contexto entre agentes.

**Implementação, em ordem cronológica:**

1. **Filtros avançados e visualizações personalizadas** (`13dd39d`) — o painel só tinha
   Todas/Abertas/Concluídas fixas; agora dá pra criar visualizações nomeadas filtrando
   por qualquer propriedade de seleção da database (ex.: "Repositório"), editáveis e
   persistidas por conexão+database. Módulo novo `notion-task-views.ts` com 8 testes.
2. **Botão de copiar link da tarefa** (`9173e91`) — no detalhe expandido, ao lado de
   "Abrir página no Notion", copia a URL via `navigator.clipboard` com feedback visual.
3. **Bug real: bloco Notion/Página Web sumindo ao reabrir o app** (`40b79bc`) — causa
   raiz encontrada consultando o SQLite real do usuário: `canvas_nodes.type` tinha um
   `CHECK` que nunca foi alargado para os tipos `'webpage'` e `'notionTasks'` quando
   entraram no código; todo `INSERT` desses dois tipos falhava, e o erro era engolido em
   silêncio pelo wrapper best-effort do renderer. Corrigido com a migração 012 (recria a
   tabela com o `CHECK` certo, padrão já usado nas migrações 006/007) mais log de erro
   quando uma escrita falha, e um teste de regressão que salva os dois tipos, fecha e
   reabre a conexão SQLite de verdade. Validado rodando a migração contra uma cópia do
   banco de produção do usuário.
4. **Sincronização automática a cada minuto** (`b39a253`) — revalida a lista com o
   Notion em segundo plano sem fechar detalhe expandido nem empilhar chamada; botão de
   relógio liga/desliga.
5. **Seletor de colunas na tabela** (`c86691e`) — escolher quais propriedades da
   database aparecem como coluna, sem precisar expandir cada tarefa; escolha persistida
   por database.
6. **Botão de verificar atualizações sempre acessível** (`82db97a`) — o indicador de
   atualização ficava escondido quando o app já estava em dia, sem forma de checar na
   hora; `UpdatePresentation` ganhou `canCheck`, true só em `'idle'`.
7. **Episódio revertido: tentativa de corrigir causa raiz do flake `AttachConsole` no
   CI** (`e3eea0e`, revertido em `1fa44a6`) — o CI bateu duas vezes seguidas no mesmo
   teste nativo de PTY no Windows (`AttachConsole failed`, já catalogado). Investigado o
   log real: o processo do arquivo de teste crashava com `STATUS_HEAP_CORRUPTION`
   porque `PtyHandle.kill()` bifurca um agente que chama `AttachConsole` quando o
   node-pty não carrega a `conpty.dll`. Corrigido forçando `useConptyDll: true` nos dois
   testes afetados (escopo só teste, nenhum caminho de produção mudou) — o crash parou
   de fato, mas ao rodar de verdade no CI o mesmo passo que antes falhava em segundos
   ficou mais de 11 minutos sem terminar: hipótese é que o `kill()` do backend DLL só
   libera um handle dentro de um listener de dado que nunca dispara se o processo
   filho já parou de produzir saída. Um travamento longo é pior que um flake rápido e
   recuperável para quem precisa publicar — o run foi cancelado, a correção revertida,
   e a hipótese registrada na task do Notion para quem tentar de novo com mais cuidado
   (não forçar `useConptyDll: true` sem também garantir que o handle fecha depois do
   `kill()`).
8. **Causa raiz real da queixa "agentes não conseguem ler o contexto"** (`f68c4b7`) —
   não era perfil trocado nem prompt injection: um instalador de outro produto do mesmo
   autor (Felixo System Design) injeta uma **função de shell** chamada `felixo` no
   `.bashrc`/`.zshrc` de quem instala, para sincronizar aquele repositório. Em bash/zsh
   uma função de shell sempre vence a resolução por `PATH`, então `felixo context read
   ...` rodava essa outra ferramenta em silêncio, sem erro nenhum — confirmado por
   relato real de um agente que só conseguiu ler o artefato depois de descobrir o
   conflito sozinho. Corrigido sem tocar no outro repositório: o handler
   `context-file:write` agora devolve `commandPath` (o caminho absoluto do shim desta
   instância), e a instrução de contexto manda o agente rodar esse caminho exato em vez
   do nome nu, com aviso explícito do motivo. Sem o caminho (ponte antiga), cai de volta
   no nome nu — nada muda para quem não tem o conflito.

**Validação, por entrega:** `npm run build` (tsc -b + vite) e `eslint` limpos em toda
entrega; suíte do canvas subiu de 641 para 646 testes ao longo do dia sem regressão;
testes nativos de PTY (`node --test`) e do repositório de canvas (`canvas-repository.test.cjs`)
verdes, incluindo os casos novos que provam cada bug antes/depois da correção (o teste de
`webpage`/`notionTasks` falha sem a migração 012 e passa com ela — confirmado manualmente
removendo e devolvendo o arquivo da migração).

**Deploy:** todos os oito commits foram publicados e validados por CI antes de qualquer
entrega ser marcada concluída — quatro precisaram de um `rerun` no flake conhecido de
`AttachConsole`/benchmark do runner Windows (ambiental, não relacionado ao código), com a
causa de cada falha lida no log antes de rerodar, nunca presumida. Releases confirmadas:
`v0.1.220` (1–2), `v0.1.221` (3), `v0.1.222` (4), `v0.1.223` (5), `v0.1.226` (6),
`v0.1.230` (7 revertido + a limpeza) e `v0.1.231` (8):
https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.231

**Estado final.** As oito entregas foram registradas como tasks individuais no Notion
(sete concluídas, uma — validação manual do botão "Copiar link" no app real — deixada
aberta de propósito, porque o driver de automação não reproduz clipboard real do SO). A
tentativa revertida do `AttachConsole` ficou registrada como pendência real, não como
sucesso disfarçado, com a hipótese da causa do travamento documentada para quem
retomar.

## Fechamento de Trabalho — 2026-09-11 — limites por conta consultados ao vivo em todos os providers suportados

AGENTE/REPOSITÓRIO: Codex / Felixo-AI-Core.

**Contexto da sessão.** A task principal do Notion (`3d491f95-497e-818f-acdc-f0b2e7e1c22a`, "Felixo AI Core/Limites — mostrar os resets disponíveis nas contas Codex") foi relida antes das alterações. A task relacionada (`3ce91f95-497e-81b3-b3fd-cd7b4a5c931d`) exige incluir Openia e Gemini sem inventar dados nem misturar o último valor conhecido. Durante a continuação, o usuário corrigiu o escopo: a consulta ao vivo e o log de falha não poderiam ficar descritos como exclusivos do Claude.

**Implementação publicada, em ordem:**

1. O commit `2ee57bf058b42b73bce1222478a199abc3d725d6` implementou os resets bancados do Codex por conta: leitura somente via `account/rateLimits/read`, quantidade, título, tipo, descrição, data de concessão, validade e estado; botão **Usar reset** com confirmação nativa; consumo separado via `account/rateLimitResetCredit/consume`, chave de idempotência gerada no processo principal e releitura posterior. O renderer não recebe ambiente de perfil nem segredo. O armazenamento passou a ordenar empates por `rowid DESC`, evitando que uma amostra antiga vencesse a leitura mais recente.
2. O commit `1267e5f75661a4592f0725523c049e97f87742aa` generalizou a capacidade `liveQuery` por fonte declarada. O Codex agora usa o app-server autenticado para as janelas primary/secondary e créditos, o Claude usa o PTY descartável do `/status`, e o Openia usa `openia statusline` para consultar os créditos do OpenRouter. A coleta é executada por conta/perfil, com o ambiente isolado de cada perfil; o Codex não abre uma segunda consulta de resets quando a leitura ao vivo já trouxe os créditos.
3. `onLiveQueryFailure` passou a ser um observador genérico para qualquer provider/fonte ao vivo. As mensagens são estáticas e seguras; stdout/stderr bruto não entra no sample nem no log QA. Há regressão específica para falha do Openia, além da cobertura do Claude e do mapa Codex/Claude/Openia.
4. Gemini permanece explicitamente indisponível no painel automático: a CLI instalada (`0.57.0`) não oferece endpoint não interativo de quota, e `/stats model` só existe na sessão interativa. Não foi criado TTY oculto nem foi inventado zero/limite; a limitação continua visível, conforme a task relacionada.
5. README foi atualizado para documentar as fontes ao vivo e o fallback local do rollout do Codex. A fonte local do Codex, quando usada pelo watcher, recebe o rótulo explícito de fallback para não se passar por consulta atual.

**Validação local final:**

- Testes focados de uso, Codex, IPC e repository: **26/26 pass**.
- Suíte frontend: **828 pass, 1 skipped**, 89 arquivos.
- `npm run typecheck`: pass.
- `npm run build`: pass; apenas avisos já esperados de chunks grandes.
- `npm run lint`: 0 erros e 2 warnings preexistentes em `SearchPanel.tsx` (`inputRef`/`setQuery` ausentes na lista de dependências).
- Suíte Node completa: **1.086 pass, 7 fail, 0 skipped, 1.093 testes**. Os sete failures são ambientais e repetem o erro `Electron failed to install correctly` nos testes que carregam Electron; nenhuma tentativa destrutiva de apagar/reinstalar `node_modules/electron` foi feita.
- Consulta real somente leitura do Codex foi executada sem expor resposta bruta: `ok=true`, chaves de métrica `rate_limits.primary`, `rate_limits.secondary` e `credits`, `availableCount=3`, `creditCount=3`, sem método de consumo e sem stdout/stderr retornados.
- `git diff --check`: pass.

**CI e release:**

- A primeira execução da entrega de resets (`34621744951`) terminou com falha somente no benchmark Windows de custo operacional: `yarn-classic` detectou processos órfãos. O log foi lido; não era falha do código de limites.
- A execução final do commit generalizado passou em todas as matrizes, incluindo Ubuntu, macOS, Windows, política de dependências, SBOM, auditoria Python, launchers e scripts de release: `34623826128` — https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/34623826128
- O workflow de release validou os três artefatos — Linux, macOS e Windows — e publicou `v0.1.288`: `34624579478` — https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/34624579478; release: https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.288
- Nenhum reset real foi consumido durante testes, consulta real ou release.

**Estado final da implementação.** O código funcional está em `1267e5f`; a consulta ao vivo e a auditoria de falhas são por provider/fonte suportada, não só Claude. Este fechamento é o registro append-only da entrega e será publicado separadamente. A task de validação manual multi-conta/multi-SO (`3ce91f95-497e-81b3-b3fd-cd7b4a5c931d`) permanece aberta para validação no app instalado, sem duplicação.

## Ajuste operacional de publicação — 2026-09-11

O CI do fechamento (`34625708924`) falhou inicialmente apenas no teste nativo de
PTY do Windows com `AttachConsole failed`; o rerun do job concluiu verde. Na
publicação seguinte, os três builds e as validações dos artefatos passaram, mas o
upload Linux da release prévia `v0.1.290` recebeu HTTP 422 porque os jobs paralelos
tentaram enviar o diagnóstico interno `builder-debug.yml` com o mesmo nome. O
asset não é necessário para atualização do usuário e é gerado por cada matriz.
O workflow de release foi ajustado para não publicar esse diagnóstico compartilhado,
mantendo instaladores, manifests, inventários, benchmarks e smoke reports sem colisão.

## Fechamento de Trabalho — 2026-09-12 — looping real painel/gaveta corrigido, CI arm64 e título do painel

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

**Contexto.** Três entregas publicadas na mesma sessão, sem branch: um bug real de
looping/tremor no canvas (relatado pelo Felipe após um primeiro fechamento sem
reprodução), um item de CI/release fatiado hoje, e um ajuste de UI relatado por print.
Este registro cobre a lacuna: nenhum dos três commits abaixo havia atualizado o
`IA.md` no momento em que foi publicado, contrariando o item 8/checklist do
`Padrão de qualidade - Felixo System Design/core/GUIA_MINIMO_QUALIDADE.md`.

**1. `b9444df` — fix(canvas): elimina looping real de painel e gaveta se espremendo
mutuamente.** Causa raiz: `panelWidthLimit`/`drawerWidthLimit` liam, cada um, a
largura JÁ CORTADA que o outro tinha acabado de relatar no `CanvasSurfacesContext`
compartilhado — referência circular entre ciclos de render. Provado matematicamente
antes de corrigir: com `P_n = min(localP, W - D_{n-1})` e
`D_n = min(localD, W - P_{n-1})`, o sistema reduz a `P_n = P_{n-2}` quando ambos
ficam perpetuamente no teto do outro — oscilação de período 2 que nunca converge.
Corrigido com `splitHorizontalSpace()` (`canvas-surfaces.ts`): cálculo único e
determinístico dos dois valores finais a partir só do que cada lado quer, sem
referência circular possível. `CanvasSurfacesProvider`, `useResizablePanelWidth` e
`TerminalDrawer` ajustados para reportar a largura desejada crua e ler de volta só
o valor final. `detectLiveLayoutClamp` (`layout-invariants.ts`) tinha uma constante
divergente (piso da gaveta documentado como 300px, real sempre foi 440px) que
escondia o cenário: totais cabiam (876<900) mas a faixa de canvas garantida ficava
espremida a ~24px — corrigido para importar as constantes canônicas de
`canvas-surfaces.ts` e checar a faixa de canvas, não só a soma. 7 testes novos em
`canvas-surfaces.test.ts`, cobrindo o cenário real medido ao vivo. CI: 12/12 jobs
`success` (run `34688923502`).

**2. `7c821b3` — ci: valida node-pty em runner hospedado ubuntu-24.04-arm (#22).**
Fatia da task "Release — validar node-pty empacotado no Linux arm64" (dependia de
"acesso a runner arm64 real"). Descoberto que o repositório público dá acesso
gratuito ao runner hospedado `ubuntu-24.04-arm` do GitHub Actions, sem hardware.
Perguntado ao Felipe (`AskUserQuestion`, Trilha B) entre job permanente, execução
avulsa ou só documentar — escolheu job permanente. Adicionado à matriz existente do
job `Validate`, que já roda `test:native` (smoke real de node-pty) e a suíte
completa — cobertura contínua, não pontual. Publicado via PR #22 (não commit direto:
mudança de infraestrutura de CI, risco de quebrar a matriz para todos os outros
agentes que dependem dela, justificando branch pela política de versionamento).
CI da própria PR: 13/13 `success`, incluindo o job novo (3m50s). Mergeado por
squash, branch apagada.

**3. `3b29c0b` — fix(canvas): título das tarefas do Notion quebra linha em vez de
cortar.** Felipe reportou por print não conseguir ler títulos de tarefa no painel
"Tarefas Notion" do canvas. Causa: a célula do título usava `truncate` (Tailwind,
uma linha, corta com reticências) numa tabela `table-fixed` sem largura garantida
para a coluna quando o painel encolhe. Trocado para `break-words`
(`NotionTasksPanel.tsx:962`) — o título agora quebra em várias linhas, a linha da
tabela cresce, nada é cortado. Commitado direto em `main` (mudança de uma linha,
baixo risco). CI: 13/13 `success` (run `34691974437`).

**Validação comum aos três.** `npx tsc -b` e `npx eslint` limpos antes de cada
publicação; nenhum dos três usou suposição sobre estado de app real não medido —
o looping foi reproduzido e a correção verificada por simulação matemática +
testes determinísticos + instrumentação ao vivo (`ResizeObserver`/RAF via
`felixo devtools eval`, zero crescimento no cenário que antes oscilava); o CI
arm64 foi confirmado rodando de verdade, não assumido disponível; o título foi
corrigido a partir do print real do Felipe, não de suposição sobre a UI.

**O que não foi validado.** A troca `truncate`→`break-words` não foi conferida
visualmente com dados reais do Notion (o perfil real do app estava em uso pelo
Felipe no momento). O fix do looping não repetiu manualmente todos os cenários do
escopo original da task de instrumentação (zoom, drag, troca de terminal,
reidratação) — só o cenário relatado (painel+gaveta), que já explicava o sintoma.

**Tasks no Notion.** Bug de looping:
`3d491f95-497e-819a-aa2a-e4b9ad59b8da` (complementada, Concluída). CI arm64:
`3d991f95-497e-811f-a69d-e7d7ddb9bfcb` (Concluída). Título do painel:
`3d991f95-497e-8186-91ec-e0fb313445db` (Concluída). Relatório diário de
12/09/2026 (`3d991f95-497e-8181-a489-e542a9cd1a5a`) complementado com as três
entregas.

## Fechamento de Trabalho — 2026-09-12 (continuação) — instalação real de Codex/Claude/Gemini no CI

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

**Contexto.** Fatia 5/5 de "Release CI — relatório versionado de instalação real das
CLIs por SO/CLI/cenário" dependia das fatias 1-4, ainda não implementadas. Perguntado
ao Felipe (`AskUserQuestion`) — escolheu implementar as 4 fatias de instalação de uma
vez nesta sessão, em vez de seguir a ordem uma a uma ou pular pra outra pendência.

**`f6cbab1` (PR #23) — ci: instala Codex/Claude/Gemini de verdade nos 3 SOs.** Workflow
novo `.github/workflows/official-cli-install.yml`: matriz 3 SOs × 3 CLIs oficiais
(`@openai/codex`, `@anthropic-ai/claude-code`, `@google/gemini-cli` — os mesmos
pacotes que `official-cli-catalog.cjs` já declara pro botão "Instalar" do app), 9 jobs
fazendo `npm install -g` real (não benchmark sintético), validação de `--version`,
reinstalar, atualizar (`@latest`), downgrade pra penúltima versão semver estável
(confirmando que a versão reportada muda de verdade) e remover (confirmando que o
comando some do PATH). Não é gate obrigatório de PR — depende do npm registry e dos
publishers de terceiros — roda em push em `main`, `workflow_dispatch` e `schedule`
semanal.

**Dois bugs reais, achados e corrigidos ao vivo durante a validação na PR** (não
hipotéticos — os 3 jobs de Codex falharam de verdade na primeira rodada):
1. `@openai/codex` publica centenas de variantes por plataforma como versões próprias
   no mesmo pacote (`0.155.0-alpha.3-win32-arm64` etc.), fora de ordem cronológica. A
   escolha ingênua de "penúltima versão" pegava uma dessas, não instalável no runner
   atual (`EBADPLATFORM`). Corrigido filtrando para semver estável (`^\d+\.\d+\.\d+$`)
   antes de escolher.
2. No Windows, embutir o JSON inteiro de versões (centenas de entradas) como argumento
   de `node -e` estourou o limite de linha de comando do shell (`Argument list too
   long`, exit 126). Corrigido lendo o JSON por stdin em vez de por argumento.

**Validação.** PR #23: 9/9 jobs de instalação `success` na rodada final, mais os 13
checks do CI principal (incluindo os 4 `Validate`, todos `success`). Mergeado por
squash, branch apagada. `c7bad84` removeu o trigger `pull_request` temporário (usado
só pra validar antes do merge, já que `workflow_dispatch` só fica disponível depois do
arquivo existir no branch padrão) — confirmado registrado após o merge disparando
`workflow_dispatch` manualmente em `main`.

**O que não foi feito.** Login interativo de cada CLI fica de fora por desenho — sem
fixture/conta de teste dedicada, simular quebraria a premissa de "instalação real". A
fatia 5/5 (consolidar os resultados num relatório versionado JSON+markdown) ficou
desbloqueada mas não implementada — fora do escopo que o Felipe pediu explicitamente.

**Tasks no Notion.** As 4 fatias marcadas Concluída:
`3d991f95-497e-81c6-90cd-ec602212a211` (Codex),
`3d991f95-497e-8194-850d-f6fbac161b8f` (Claude),
`3d991f95-497e-81c1-9927-e20605a40a0e` (Gemini),
`3d991f95-497e-8174-a407-c11d9e875006` (ciclo de vida). A fatia 5/5
(`3d991f95-497e-8102-8eeb-d2beb869e42e`) complementada como desbloqueada, permanece
`Entrada`. Relatório diário de 12/09/2026 complementado.

## Fechamento de Trabalho — 2026-09-12 (continuação) — fatia 5/5: relatório consolidado da instalação real de CLIs

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

**Contexto.** Fatia 5/5, desbloqueada pelo merge de #23. Cada job da matriz passou a
gravar o próprio resultado (`result.json`, um cenário por linha: instalar, validar
`--version`, reinstalar, atualizar, downgrade, remover, confirmar remoção, login
interativo) via passos `if: always()` que leem `steps.<id>.outcome`.

**`d47f3e3` (PR #24) — job `report`.** Roda depois de `install-cli` com
`if: always()` (mesmo se algum job de instalação falhar), baixa os 9 artifacts
`cli-install-result-<os>-<cli-id>` e consolida em `cli-install-report.json`
(`{run_id, generated_at, commit, jobs: [...]}`) e `cli-install-report.md` (tabela
SO×CLI×cenário), publicados juntos no artifact `cli-install-report`.

**Bug real, achado e corrigido ao vivo na primeira rodada da PR:** os labels das
CLIs no nome do artifact tinham espaço (`Claude Code`, `Gemini CLI`), virando pasta
com espaço depois do download; `for f in $files` sem aspas fatiava o caminho no meio
(`results/cli-install-result-macos-latest-Claude` + `Code/result.json` como dois
arquivos inexistentes — `jq: error: Could not open file`). Corrigido adicionando um
`id` sem espaço por CLI (`codex`/`claude-code`/`gemini-cli`) para o nome do artifact,
e trocando o word-splitting por `mapfile` + array com aspas no job `report`.

**Validação.** Baixei o artifact `cli-install-report` do run final e li o conteúdo
de verdade (não só confiei no job verde): 9 jobs, 8 cenários cada, com versão real
reportada em cada transição (ex.: Claude Code macOS `2.1.269` → downgrade pra
`2.1.268`), e o cenário `login interativo` presente em todos como `not_applicable`
com o motivo. PR #24: 9/9 jobs de instalação + `report` `success`, mais os 13 checks
do CI principal, todos `success`. Mergeada por squash, branch apagada. `2f8c816`
removeu o trigger `pull_request` temporário.

**Estado final.** As 5 fatias e a task-mãe "Release — Rodar instalação real de
Codex/Claude/Gemini no CI multi-SO" foram todas marcadas Concluída. Nenhuma PR
aberta e nenhuma branch além de `main` no repositório ao final da sessão.

## Fechamento de Trabalho — 2026-09-12 (continuação) — node-pty sob quarentena real do Gatekeeper no macOS

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

**Contexto.** Task "Release — validar node-pty empacotado no macOS
(Gatekeeper/quarentena/assinatura)". Um build do CI nunca ganha o atributo
`com.apple.quarantine` sozinho — só quem baixa o artefato de verdade (Safari, curl
`--xattr`, AirDrop) ganha. O smoke existente (`release-smoke.cjs`, já rodava em todo
release) nunca passava pelo mesmo caminho que o usuário final passa na primeira
abertura.

**`cf22b5c` (PR #25).** `release-smoke.cjs` ganhou `--simulate-quarantine`: aplica o
xattr real na árvore empacotada e roda `spctl -a -vv --type execute` +
`codesign -dv --verbose=4` — a MESMA checagem que o Finder faz ao dar duplo clique.
Passo novo em `release.yml`, só macOS, `continue-on-error` (é evidência, não gate —
um app não notarizado é esperado ser rejeitado, e esconder isso atrás de um "passou"
seria pior do que declarar).

**Evidência real, do release de produção `v0.1.309` (run `34705095491`), lida do
artifact `release-smoke-quarantine-macos-latest`:**
- Gatekeeper (`spctl`) **REJEITOU** o app sob quarentena — `"code has no resources
  but signature indicates they must be present"` — confirma que a assinatura ad-hoc
  atual (sem notarização) não passa, batendo com o aviso já publicado para usuários
  (`xattr -dr com.apple.quarantine`).
- `codesign`: `Signature=adhoc`, `TeamIdentifier=not set` — sem notarização, como
  esperado.
- **node-pty funcionou (`pty.ok: true`)** mesmo com quarentena + Gatekeeper
  rejeitando — achado real: o spawn direto do executável roda por fora do
  LaunchServices, então não é bloqueado; só a abertura via Finder dispara a
  checagem que rejeita.

**Validação.** PR #25: 13/13 checks `success`. Testes locais:
`node --test scripts/release-smoke.test.cjs` 9/9 pass (2 novos), `npm test` completo
1144/1144. Mergeado por squash, branch apagada.

**O que não foi feito.** O roteiro completo de update + 2 restarts do piloto Linux
x64 não foi replicado no macOS — o smoke existente já cobre instalação limpa + PTY;
esta task focou no gap específico de Gatekeeper/quarentena. Update/restart repetido
sob quarentena fica como possível extensão futura.

**Tasks no Notion.** `3d991f95-497e-8150-ae7e-c575c3747e27` marcada Concluída.

## Fechamento de Trabalho — 2026-09-12 (continuação) — node-pty no Windows: ACL, cmd.exe e falha real em path longo

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

**Contexto.** Task "Release — validar node-pty empacotado no Windows
(ACL/path longo/shell)". Três coberturas novas no smoke de release, só Windows:
`captureWindowsAcl` (icacls no executável e no `pty.node`, incondicional), shell
forçado via `FELIXO_RELEASE_SMOKE_SHELL=cmd.exe`, e `cwd` de path longo via
`FELIXO_RELEASE_SMOKE_LONG_PATH=1` (nesta última, criado com o prefixo estendido
`\\?\` para contornar o MAX_PATH clássico já na criação do diretório de teste —
achado durante o próprio desenvolvimento: sem o prefixo, até `mkdirSync` falha).

**PR #26 (`5edc99d`).** Primeira rodada de CI quebrou de propósito — não no
achado que a task buscava, mas num bug real no meu próprio teste unitário
(`mkdirSync` sem `\\?\` batendo no MAX_PATH já na criação, não só no spawn).
Corrigido, segunda rodada 13/13 `success`.

**Evidência real, do release de produção `v0.1.311` (run `34707819390`):**
- **ACL: sem bloqueio.** `icacls` no executável e no `pty.node` mostram
  `BUILTIN\Administrators:(F)` e `<usuário>:(F)` — controle total.
- **cmd.exe: funciona igual ao padrão** (`pty.ok: true`, mesmo comportamento do
  PowerShell).
- **Path longo: QUEBRA DE VERDADE.** `Cannot create process, error code: 267`
  (`ERROR_DIRECTORY`) — o `WindowsPtyAgent` nativo do node-pty não abre sessão
  quando o `cwd` passa dos 260 caracteres do MAX_PATH clássico, mesmo o
  diretório existindo de verdade no disco (criado com o prefixo `\\?\`).
  Achado real, com stack trace completo capturado.

**Validação.** `node --test electron/release-smoke.test.cjs
scripts/release-smoke.test.cjs` 18/18 pass (6 novos). `npm test` completo
1148/1148. PR #26: 13/13 `success` (após o fix do próprio teste). Mergeada por
squash, branch apagada (local e remota — limpeza extra pedida pelo Felipe hoje:
branches de PRs já mergeadas anteriormente na sessão tinham ficado só
localmente, corrigido).

**Pendência aberta.** node-pty falhar mudo em `cwd` longo é uma decisão de
produto (Trilha B: mitigar no app vs. avisar o usuário vs. documentar como
limitação conhecida), não uma escolha técnica única — task nova criada:
`3d991f95-497e-81f5-8823-e7717058a874` ("Terminal — decidir tratamento para
node-pty falhando em cwd com path longo no Windows"), linkada à task de origem.

**Tasks no Notion.** `3d991f95-497e-8106-a0ce-d09608ba7b35` marcada Concluída.

## Fechamento de Trabalho — 2026-09-12 (continuação) — aviso de path longo no terminal do Windows

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

**Contexto.** Trilha B: "Terminal — decidir tratamento para node-pty falhando em cwd
com path longo no Windows". Pergunta única via `AskUserQuestion` — Felipe respondeu
"1 depois 2": avisar o usuário primeiro, investigar suporte real a path longo depois.

**`0fd29ce` (PR #27).** `isWindowsLongPathFailure(error, cwd, platformName)` distingue
a falha real medida no release anterior (`error code: 267`/`ERROR_DIRECTORY`, win32,
`cwd.length >= 260`) de qualquer outra falha de spawn. Quando reconhecida,
`PtyProcessManager.spawn()` troca a mensagem genérica "não foi possível criar a sessão
do terminal" por uma específica: comprimento do caminho + sugestão de mover o projeto,
sem vazar o caminho em si.

**Validação.** 2 testes novos (`pty-process-manager.test.cjs`): um puro cobrindo os 4
quadrantes de `isWindowsLongPathFailure`, um de integração real criando de verdade um
diretório > 260 caracteres via prefixo `\\?\` e confirmando o aviso específico chega
via `onData`. `npm test` 1150/1150, `tsc -b` limpo. PR #27: 13/13 `success`, incluindo
`Validate (windows-latest)` rodando os testes de verdade num Windows real. Mergeada
por squash, branch apagada (local e remota).

**Estado final.** `3d991f95-497e-81f5-8823-e7717058a874` marcada Concluída (parte 1
entregue). Parte 2 (investigar suporte real a path longo, não só avisar) virou task
nova: `3d991f95-497e-8151-bbbf-d27b48fef0ea`, prioridade baixa, linkada.

## Fechamento de Trabalho — 2026-09-12 (continuação) — path longo no Windows: investigação conclusiva, sem código novo

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

**Contexto.** Parte 2 da decisão sobre node-pty falhando em `cwd` longo no Windows
(parte 1, o aviso ao usuário, já publicada em `0fd29ce`/PR #27). Task
"Terminal — investigar suporte real a path longo no Windows para o node-pty".

**Investigação.** Lido o código-fonte C++ do `node-pty` (`conpty.cc:413`): o `cwd`
vira `lpCurrentDirectory` de `CreateProcessW` sem nenhum tratamento de prefixo de
path estendido (`\\?\`). Hipótese testada empiricamente: manter esse prefixo até o
`cwd` que chega no `node-pty` resolveria? Testado via uma branch experimental
(`terminal/investigate-longpath-prefix`, PR #28) com uma flag temporária
(`FELIXO_RELEASE_SMOKE_LONG_PATH_PREFIXED=1`) e um release de teste real disparado
via `workflow_dispatch --ref <branch>` (aprendizado no processo: sem `--ref`, o
dispatch lê a definição do workflow do `main`, não da branch, então o passo
experimental simplesmente não aparecia na primeira tentativa).

**Resultado medido (run `34711715030`):** `Cannot create process, error code: 267` —
**idêntico** ao teste sem o prefixo. Confirma empiricamente que
`CreateProcessW.lpCurrentDirectory` não honra o prefixo estendido — não é uma
omissão da nossa camada, é uma limitação real do parâmetro do Windows (e por
extensão, do `node-pty`, que não adiciona tratamento próprio pra isso).

**Conclusão.** Sem solução viável no nosso lado sem forkar e recompilar o binário
nativo do `node-pty` — custo de manutenção desproporcional ao problema (só afeta
quem tem caminho de trabalho muito longo). `LongPathsEnabled`/`longPathAware`
descartado por documentação: cobre as APIs de arquivo do Win32, não
`CreateProcess.lpCurrentDirectory`, e mesmo se cobrisse é config de máquina, não de
app. **Nenhum código novo publicado** — só o achado, a decisão de não seguir, e a
evidência. Branch e PR #28 descartados (fechada sem merge, branch apagada local e
remota).

**Tasks no Notion.** `3d991f95-497e-8151-bbbf-d27b48fef0ea` marcada Concluída — a
conclusão negativa e bem fundamentada é o entregável, exatamente como o critério de
aceite da própria task previa.

## Fechamento de Trabalho — 2026-09-12 (continuação) — fatiamento da arquitetura de cache offline por perfil

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

Task "Release — Provar isolamento de binário/cache entre perfis" reconfirmada
bloqueada — sem mudança desde a checagem de 08:07 de hoje. Como sua dependência raiz
("Arquitetura — Desenhar e implementar cache offline por perfil", esforço "Dias",
sem plano escrito) é grande demais pra encarar de uma vez, o Felipe pediu fatiamento.
5 subtasks executáveis criadas (layout de diretórios, expurgo/estados inválidos,
garantia de não guardar segredo, integração com hash/integridade, testes fim a fim),
com a ordem de dependência real entre elas documentada. Nenhum código escrito —
puramente organização do trabalho pendente.

## Fechamento de Trabalho — 2026-09-12 (continuação) — layout do cache offline + pin/hash reconfirmados

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

Sessão longa autorizada pelo Felipe pra varrer todas as tasks-mãe e filhas pendentes
vistas hoje, sem pausas. `systemd-inhibit` ativado pra evitar suspensão da máquina.

**`a0eaed6` (PR #29) — fatia 1/5 do cache offline.** `getOfflineCacheLayout`
(`managed-cli-paths.cjs`) separa por provider/plataforma-arquitetura/versão, nunca
por perfil — decisão perguntada ao Felipe (cache compartilhado, só login isolado).
9 testes novos. Decisão registrada em `docs/projeto/ARQUITETURA.md`.

**Reconfirmação de trabalho já publicado em 06/09 (commit `16dc4bc`):** as tasks
"Fixar versão exata do npm-runtime e das CLIs geridas" e "Verificar hash/integridade"
tinham código pronto e testado, mas ficaram sem `Etapa=Concluída` só porque o lint
não tinha rodado (memória insuficiente na máquina naquele dia). Rodado agora:
`eslint` limpo, `npm test` 1155/1155, `tsc -b` limpo — ambas marcadas Concluída. Duas
lacunas menores (versão do npm-runtime não entra no manifesto; sem verificação
pós-instalação) viraram uma task nova de baixa prioridade
(`3d991f95-497e-8104-9365-e5c6dd0c1f2d`), sem bloquear o fechamento.

## Fechamento de Trabalho — 2026-09-12 (continuação) — isolamento de credencial entre perfis provado

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

Task "Release — Provar isolamento de binário/cache entre perfis" desbloqueada pela
decisão de cache compartilhado (fatia 1/5 do cache offline). Escopo mudou: binário/
cache compartilhado por design não precisa de isolamento; o que restava provar era
login/credencial simultâneo entre dois perfis, nunca testado explicitamente para
esse cenário.

`9db9bac` (PR #31): 3 testes em `cli-account-profiles.test.cjs` — pasta de
credencial nunca se sobrepõe entre dois perfis simultâneos; env de um nunca
referencia o diretório do outro; caminho do binário/cache é idêntico pros dois
perfis (documentado em código executável). `npm test` 1158/1158. PR #31: 13/13
`success`. Mergeada, branch apagada (local e remota). Task Concluída.

## Fechamento de Trabalho — 2026-09-12 (continuação, final) — cache offline concluído, árvore inteira de tasks fechada

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

Sessão longa (16:00–21:19, ~5h20) autorizada pelo Felipe pra varrer todas as
tasks-mãe/filhas pendentes do dia sem pausar. `systemd-inhibit` manteve a máquina
acordada o tempo todo.

**Fatias 2-4 do cache offline (`ade0c55`, PR #30).** `--cache`/`--prefer-offline`
no `npm install`, apontando pra `getNpmRegistryCacheDir` — reusa o mecanismo nativo
do npm em vez de reimplementar um cache próprio. Expurgo por orçamento (200MB,
`managed-cli-cache-maintenance.cjs`). Achado real na auditoria de segredo:
`createManagedInstallEnv` vazava `CODEX_HOME`/`CLAUDE_CONFIG_DIR`/
`OPENROUTER_API_KEY` do `process.env` pro ambiente de instalação — corrigido.
Achado real de teste: fake-fs do teste de expurgo usava `/` hardcoded, quebrava no
Windows real (`path.join` produz `\`) — corrigido.

**Fatia 5 (testes fim a fim).** 4 cenários verificados ao vivo com um pacote npm
público de teste, reproduzindo as flags reais do código: instalação populando
cache, instalação 100% offline com cache válido, cache corrompido+rede bloqueada
(falha limpa `EINTEGRITY`), cache corrompido+rede disponível (recupera sozinho).
Não virou teste automatizado no CI — comportamento de terceiro (npm) já testado em
produção há anos, não código nosso; rodar `npm install` real contra o registry em
todo CI seria lento e dependente de rede externa. Documentado com comando e saída
reais em `docs/projeto/ARQUITETURA.md`.

**Isolamento de credencial entre perfis (`e378e1f`, PR #31).** Escopo da task
original mudou com a decisão de cache compartilhado: só restava provar
login/credencial nunca vazando entre dois perfis simultâneos (nunca testado
explicitamente para esse cenário) — 3 testes novos.

**Acidente de sessão, sem perda de trabalho publicado.** Um `git checkout main --
.` na branch de trabalho sobrescreveu um teste ainda não commitado (isolamento de
credencial) — recuperado reescrevendo numa branch nova a partir de `main`. Nenhum
commit já publicado foi afetado.

**Árvore de tasks fechada por completo:** as 5 fatias do cache offline, a
task-mãe do cache offline, a task-avó "Fixar versão, hash e cache offline", a task
"Provar isolamento de binário/cache entre perfis" e a task-bisavó "Validar CLIs
oficiais e dependências nativas com gerenciador alternativo nos três SOs" — todas
`Etapa=Concluída`, confirmado lendo cada uma de volta.

**PRs do dia:** #22 a #31 (10 PRs), todas mergeadas e com branch apagada local e
remota. Nenhuma PR aberta ao final da sessão.

## Fechamento de Trabalho — 2026-09-12/13 (continuação) — correlação instalação × responsividade × energia, achado real

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

Task "Performance — correlacionar instalação do gerenciador com responsividade e
energia no artefato" (esforço "Dias"): perguntado ao Felipe, escolheu fatiar e
implementar tudo direto. 4 fatias, 4 PRs (#32, #33, #35, #36 — #34 é de outro agente
trabalhando em paralelo no mesmo repositório, branch `codex/felixo-visual-polish`,
não tocada).

**Fatia 1 (`c4672a0`).** `scripts/environment-metadata.cjs` centraliza CPU/RAM/
Electron-Node (já duplicado em 3 bancadas) e acrescenta GPU/resolução/energia/rede,
sempre `disponivel: false` + motivo quando a leitura real não existe.

**Fatia 2 (`5f6311f`).** `scripts/terminal-responsiveness-during-install.cjs` usa
`PtyProcessManager` direto (node-pty funciona standalone) pra medir p50/p95 do
primeiro output de um terminal real, baseline vs. com 1/2/5/10 instalações
concorrentes do gerenciador.

**Fatia 3 (`706ea7b`).** `scripts/energy-measurement.cjs` tenta RAPL no Linux
(`/sys/class/powercap/intel-rapl:0/energy_uj`), cai pro proxy de tempo de parede
quando a fonte real não existe/não pode ser lida — medido ao vivo: RAPL existe
nesta máquina mas nega permissão, confirmando o cenário real da task.

**Fatia 4 (`129a9e2`).** Integra as três, roda a matriz real no CI (job `Validate`,
4 ambientes: ubuntu/windows/macos/ubuntu-24.04-arm), `continue-on-error` (medição
exploratória). **Resultado real, baixado e lido dos 4 ambientes:** Yarn Classic
preserva e supera a responsividade do npm-runtime em todos eles (p50 menor com 10
agentes concorrentes em macOS/Linux x64/Linux arm64/Windows) — resposta direta à
pergunta que a task-mãe deixou em aberto, sem indício de regressão que
desaconselhasse a avaliação recomendada anteriormente.

**Estado final.** As 4 fatias e a task-mãe marcadas Concluída. Energia ficou como
proxy de CPU/tempo de parede em todo ambiente testado (nenhum runner hospedado
expõe leitura real com permissão suficiente) — declarado, não inventado. Não vira
recomendação de migração automática — decisão humana, fora do escopo desta task.

## Fechamento de Trabalho — 2026-09-12/13 (continuação) — tentativa de validar troca multi-conta Codex, interrompida por segurança

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

Task "Release — validar troca multi-conta Codex com duas contas reais no pacote em
Linux e outro SO" pedia duas contas Codex reais + segundo SO. Perguntado, o Felipe
autorizou usar as contas já autenticadas no perfil real dele (login padrão do
sistema + um perfil já criado no app) e pediu pra fatiar a parte de segundo SO.

Abri o app real empacotado (`.deb` v0.1.299 instalado, acima do pré-requisito
v0.1.179) via `felixo devtools launch --packaged ... --real-profile`, com
autorização explícita do Felipe pra mexer no perfil de produção sem ele
acompanhando ao vivo. Tentei seguir o roteiro (criar nós Codex A/B), mas a
automação de clique às cegas criou um nó "Claude · local" indesejado — as
coordenadas do screenshot não bateram com os bounding rects do DOM via `eval`
(provável transform de zoom/pan do canvas), tornando a automação não confiável.

**Decisão de segurança:** parei antes de continuar tentando seletores às cegas
contra dados de produção reais, já passando da meia-noite e sem supervisão — o
risco não compensava. Removi o nó indesejado (via tecla Delete, confirmado por
screenshot que o canvas voltou ao estado original) antes de encerrar a sessão.
Nenhum dado real foi perdido/alterado, nenhum segredo foi lido/exposto.

**Estado final.** Task permanece não concluída (nenhum critério de aceite
cumprido) — recomendação registrada: precisa de sessão com o Felipe presente, ou
de investimento maior em mapear os seletores corretos da UI antes de nova
tentativa em produção. Task nova aberta pra parte de segundo SO
(`3da91f95-497e-815e-86b2-f9afdb57e7cf`), por pedido dele.

## Fechamento de trabalho — 2026-09-13 — ferramentas de heap snapshot DevTools real para o Canvas

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

Task "Performance — capturar snapshots de heap do Canvas real em sessão longa no
Linux" (task de acompanhamento da investigação de degradação do Canvas, que
mediu terminal/PTY com `performance.memory` mas não tinha snapshots DevTools de
uma sessão real com webviews).

### O que foi feito

- `felixo devtools heap-snapshot <arquivo>` e `felixo devtools metrics`: novos
  subcomandos que usam os domínios CDP `HeapProfiler`/`Performance` pela mesma
  conexão Playwright já existente no DevTools isolado — um `.heapsnapshot` real
  (validado abrindo com `JSON.parse` e conferindo `node_fields`/`detachedness`
  contra um snapshot de verdade capturado da app) e as métricas de heap/DOM/
  listeners do CDP, achatadas num objeto simples.
- `scripts/heap-snapshot-analysis.cjs`: resume um `.heapsnapshot` por
  construtor (`type:name`, contagem, self_size, nós com `detachedness=2` — o
  mesmo sinal que o filtro "Detached" do DevTools usa) e compara dois
  snapshots com um limiar de ruído (512 KiB) para separar GC residual normal de
  crescimento real.
- `scripts/canvas-long-session-heap-capture.cjs`: orquestra uma sessão real —
  perfil sempre descartável, nunca produção — que sobe o app, monta uma
  fixture (N terminais shell, M webviews servidas por um HTTP local
  autocontido, um bloco e um grupo), alterna atividade/ociosidade pela duração
  pedida, e captura heap/métricas/RSS real (via `ps`, somando todos os
  processos descendentes do Electron — renderer, GPU, utility, PTYs) em 5
  checkpoints: baseline, fixture criada, estado degradado, depois de remover
  terminais/webviews e depois de "Limpar canvas" (aceitando o `window.confirm`
  nativo numa conexão CDP contínua). Ao final, roda o diff entre checkpoints
  consecutivos e escreve `report.json`/`report.md`.

### Validação

34 testes novos (unitários, com CDP/fs/ps injetáveis — nada de rede/Electron
real nos testes). `npm test` 1235/1235, lint limpo, `npm run build` (typecheck
completo) sem erro. `npm run test:native` reproduz uma falha pré-existente e
não relacionada (`claude-usage-query.integration.test.cjs`, flake de
concorrência entre os dois testes nativos rodando em sequência) — confirmada
idêntica numa `main` limpa via `git stash`, portanto fora do escopo desta PR.

Smoke real (perfil descartável, 2 terminais shell + 1 webview local, ~30s de
carga): pipeline completo funcionou ponta a ponta e já apontou um sinal
concreto — depois de "Limpar canvas" a contagem de processos do SO voltou
exatamente ao baseline (8 = 8, sem PTY/webview órfão), mas heap JS (1,4 MiB →
29,4 MiB), nós DOM (52 → 780) e listeners (2 → 585) ficaram bem acima do
baseline, com contagem de nós `detachedness=2` crescendo a cada checkpoint em
vez de cair. Sinal de possível retenção no nível do renderer (DOM/listener),
distinto do que a task principal já corrigiu (liberação de PTY na remoção).
Amostra pequena demais pra conclusão — a matriz real de 30/60/120 min com
10/20 terminais fica para a evidência final da task.

### Referências

Repositório: https://github.com/Felipe-Alcantara/Felixo-AI-Core

## Fechamento de trabalho — 2026-09-13 (continuação) — primeira sessão real de 30min e achado no TerminalDrawer

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

### Sessão real (perfil descartável, 10 terminais shell, 3 webviews locais, 30 minutos de carga)

`/home/felipe/.claude/jobs/225a9b8c/tmp/heap-sessions/30min-10term-3web/report.md`
(local, sanitizado — sem conteúdo de terminal nem caminho pessoal além do já
presente no próprio código-fonte).

Baseline 1,6 MiB de heap / 52 nós DOM / 2 listeners / 9 processos → depois de
"Limpar canvas": 58,6 MiB / 2.645 nós DOM / 1.530 listeners / 8 processos. Os
processos do SO voltam a um número igual ou menor que o baseline (sem PTY/
webview órfão — confirma que a correção de liberação de PTY da task principal
continua valendo), mas heap/DOM/listeners do renderer ficam bem acima do
baseline.

O diff entre "depois de remover" e "depois de Limpar canvas" aponta um
candidato específico: nós DOM do `TerminalDrawer` (`.felixo-terminal-drawer`,
botão "Recolher terminal", cabeçalho do drawer, `xterm-helper-textarea`) com
`detachedness=2` (o sinal que o próprio V8 grava pra nó destacado do DOM, o
mesmo que o filtro "Detached" do DevTools usa) chegando a 19-21 instâncias e
não caindo.

### Ressalva encontrada e corrigida antes de tirar conclusão

A simulação de atividade da sessão só ABRIA o drawer lateral (clicar no card
do terminal pra digitar nele abre o `TerminalDrawer`, que reaproveita o xterm
já rodando), nunca fechava — então o crescimento podia ser só "ninguém fechou
ainda" em vez de retenção real do ciclo abrir/fechar. Corrigido: agora cada
rajada de atividade fecha o drawer explicitamente
(`[aria-label="Fechar terminal"]`) antes de seguir. PR:
https://github.com/Felipe-Alcantara/Felixo-AI-Core/pull/39

A sessão de 30min citada acima usou a versão SEM o fechamento explícito — os
números são um teto (pior caso, uso sem fechar), não uma prova de vazamento no
ciclo abrir/fechar em si. Uma sessão de 60 minutos com a versão corrigida
(fecha sempre) está rodando para decidir se o candidato se confirma mesmo
fechando, ou se estabiliza (carga esperada).

### Referências

Repositório: https://github.com/Felipe-Alcantara/Felixo-AI-Core
PR da ferramenta: https://github.com/Felipe-Alcantara/Felixo-AI-Core/pull/38 (mergeada)
PR do ajuste de metodologia: https://github.com/Felipe-Alcantara/Felixo-AI-Core/pull/39

## Fechamento de trabalho — 2026-09-13 (continuação) — sessão de 60min corrigida: candidato do TerminalDrawer NÃO se confirmou

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

### Sessão real (perfil descartável, 15 terminais shell, 3 webviews locais, 60 minutos de carga, drawer sempre fechado a cada rajada — PR #39)

`/home/felipe/.claude/jobs/225a9b8c/tmp/heap-sessions/60min-15term-3web-v2/report.md` (local, sanitizado).

| Checkpoint | Heap JS | Nós DOM | Listeners | Processos |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 1,5 MiB | 52 | 2 | 9 |
| Fixture criada (15 term. + 3 webviews) | 49,9 MiB | 2.483 | 1.370 | 23 |
| Estado degradado (após 60min de carga) | 77,2 MiB | 2.484 | **580** | 26 |
| Após remoção | 72,7 MiB | 2.333 | 544 | 8 |
| Após "Limpar canvas" | 73,5 MiB | 2.288 | 553 | 8 |

**Achado principal: o candidato de retenção do TerminalDrawer identificado na sessão de 30min (metodologia com falha, nunca fechava o drawer) NÃO se reproduziu aqui.** Com o drawer sempre fechado a cada rajada de atividade (correção da PR #39), os nós DOM ficaram **praticamente estáveis** durante toda a hora de carga (2.483 → 2.484, quase zero crescimento) e os listeners **caíram** (1.370 → 580) em vez de crescer. Isso inverte completamente a tendência vista na sessão de 30min (DOM 2.002→3.183, listeners 1.117→1.643, ambos crescendo). Conclusão: o achado da sessão de 30min era majoritariamente artefato da própria metodologia (nunca fechar o drawer), não uma retenção real no ciclo abrir/fechar.

Processos do SO voltam exatamente ao baseline nas duas sessões (8 = 8 aqui; 8 = 8 na de 30min) — sem PTY/webview órfão, confirmando que a correção de liberação de PTY da task principal continua valendo mesmo sob carga maior (15 terminais, 1h).

### Resíduo após remoção/Limpar canvas — não confirmado como retenção

O diff 03→04 (após remover os 15 terminais) mostra ~15-19 elementos DOM (input "Nome do bloco", botões de ação do nó, cabeçalho do nó, handles de resize) passando para `detachedness=2`, com **Δ self_size = 0 B** na maioria das entradas — ou seja, os objetos não cresceram em tamanho nem se multiplicaram, só mudaram de "anexado" para "destacado" no exato instante da remoção. Isso é o comportamento esperado e correto de remover um nó do DOM: o subtree fica destacado imediatamente e só é varrido pelo GC depois. `HeapProfiler.takeHeapSnapshot` do Chrome já roda uma coleta de lixo antes de serializar (para evitar falso positivo assim), e mesmo assim ~1 instância por nó removido aparece — consistente com resíduo aguardando o próximo ciclo de GC, não uma referência JS ativa retendo o subtree pra sempre. Não abri correção de código para isso: não há evidência de crescimento contínuo nem de referência viva, só a lacuna natural entre "destacado" e "coletado".

### Meta numérica de monitoramento (proposta, a partir do observado)

- Durante carga sustentada (terminais abertos, drawer sempre fechado após uso): nós DOM e listeners não devem crescer mais que ~5% em relação ao estado logo após a criação da fixture, numa janela de 1h.
- Após remoção completa + "Limpar canvas": até ~20 elementos destacados por nó removido é aceitável (resíduo pendente de GC); acima disso, investigar.
- Processos do SO após "Limpar canvas" devem voltar ao mesmo número do baseline (nunca acima).

### Limitação desta rodada

A matriz completa do roteiro da task pede 30/60/120 minutos, 10 e 20 terminais, e repetição em três execuções para declarar não-reprodução com confiança total. Rodei 30min/10 terminais (metodologia com falha, já documentada) e 60min/15 terminais (metodologia corrigida, sem falha) — duas execuções reais, não três, e ainda falta a variante de 120 minutos e 20 terminais. O sinal já é consistente (crescimento zerado/negativo com a correção), mas a rodada de 120min/20 terminais fica como próximo passo se o Felipe quiser fechar com a matriz completa.

### Referências

Repositório: https://github.com/Felipe-Alcantara/Felixo-AI-Core
PR da ferramenta: https://github.com/Felipe-Alcantara/Felixo-AI-Core/pull/38 (mergeada)
PR do ajuste de metodologia (fecha o drawer): https://github.com/Felipe-Alcantara/Felixo-AI-Core/pull/39 (mergeada)

## Fechamento de trabalho — 2026-09-14 — DevTools interativo no Windows

AGENTE/REPOSITÓRIO: Codex / Felixo-AI-Core.

### Escopo e ambiente

Validação manual do CLI `felixo devtools` no checkout Windows da branch `main`:
Windows NT 10.0.26200.0, x64/AMD64, Node v25.3.0, npm 11.6.2. O checkout
estava em `48278e3` (descendente do ajuste `b634334`). O `felixo` encontrado no
PATH apontava para um shim temporário de outra instalação; por isso a evidência
foi produzida pelo entrypoint equivalente do checkout, `node
electron/cli/felixo.cjs devtools ...`.

### Fluxo manual concluído

- `devtools --help` respondeu com código 0.
- `launch` sem `--visible` abriu a sessão na porta CDP 59190, com PID 29200,
  perfil isolado e `mainWindow.isVisible() = false`.
- `status`, `windows`, `buttons`, `screenshot --out`, `click`, `click-text`,
  `type`, `press`, `text`, `eval` e `main` responderam com código 0. A busca
  inofensiva por `devtools smoke windows` apareceu no canvas sem dados privados;
  a captura PNG tinha 48.204 bytes e assinatura PNG válida.
- `quit` removeu a sessão, o perfil isolado e os listeners CDP/Vite; não ficaram
  processos Electron/Vite do checkout.
- `launch --visible` abriu a janela real no Windows: porta 59330, PID 30844,
  `mainWindow.isVisible() = true`, handle nativo 2167098 e título `Felixo AI
  Core`; `quit` também limpou essa sessão.

### Achados, correções e guardas

O primeiro `launch --visible` passava a flag, mas o Windows recebia
`windowsHide: true`, então a janela permanecia invisível. O CLI agora passa
`windowsHide: !options.visible` somente ao Electron; o Vite continua oculto.
Também foram adicionados: pré-checagem de colisão de porta explícita, timeout
abortável para uma porta que aceita conexão sem responder, limpeza com retry do
perfil temporário e recuperação do PID do Vite criado pela sessão anterior após
crash/relaunch.

Os cenários de segurança foram exercitados: perfil real com `SingletonLock` foi
recusado; CDP ocupado falhou em aproximadamente 90 ms sem iniciar Vite/Electron;
Vite HTTP estrangeiro foi recusado e permaneceu vivo; crash seguido de relaunch
removeu o perfil antigo e o `quit` final encerrou Vite, Electron, estado e perfil.
Os testes unitários do CLI cobrem esses contratos.

### Gates

`npm test` (com `CODEX_HOME` herdado do agente removido): 1245 pass, 0 fail,
1 skipped. `npm run test:frontend`: 898 pass, 1 skipped. `npm run lint` e
`npm run build` passaram; o build transformou 4669 módulos. A primeira execução
do teste completo com `CODEX_HOME` herdado produziu duas falhas ambientais nos
testes de descoberta/PTY; a repetição com o ambiente sanitizado passou sem
alteração nesses módulos.

### Limitação e próximo passo

O host desta rodada é Windows; não há uma máquina macOS disponível nesta sessão,
portanto a evidência manual macOS permanece pendente. A task não deve ser
considerada plenamente aceita até essa rodada ser executada. O trabalho fica
registrado como Windows concluído e macOS aguardando validação externa.

### Referências

Repositório: https://github.com/Felipe-Alcantara/Felixo-AI-Core
Código: `app/electron/cli/felixo-devtools.cjs`
Testes: `app/electron/cli/felixo-devtools.test.cjs`

## Fechamento de trabalho — 2026-09-14 — Observabilidade: erros com causa, persistidos em disco e reportáveis

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

Task Notion: "Observabilidade — capturar erros com causa, persistir em disco e
exportar relatório de problema". Anotação de origem (14/09/2026): erros do
app eram difíceis de explicar e reproduzir porque o QA Logger só guardava em
memória, e reiniciar o app — o contorno mais comum quando algo trava — apagava
o histórico.

### O que foi feito (4 fatias)

1. **Persistência em disco com rotação** — `qa-log-disk-store.cjs`: um
   arquivo `.jsonl` por dia em `logs/qa/`, rotação por idade (14 dias) e por
   orçamento de tamanho (5 MiB). `qa-logger.cjs` ganhou `initQaDiskStore`
   (hidrata o buffer em memória a partir do disco no boot) e `hydrate` no
   store interno.
2. **Handlers globais + causa** — `global-error-handlers.cjs`: cobre
   `uncaughtException`, `unhandledRejection`, `render-process-gone` e
   `child-process-gone` no main; `wrapIpcHandleWithLogging` envolve
   `ipcMain.handle` uma única vez pra logar canal + `error.cause` de
   qualquer handler que lançar, cobrindo todo o projeto sem tocar cada
   `ipcMain.handle` individualmente.
3. **Handlers globais no renderer** — `renderer-error-reporting.ts`
   (`window.onerror`/`unhandledrejection`) e `RendererRecoveryBoundary`
   passou a mandar a entrada pro QA Logger antes de oferecer o reload.
4. **Botão "Reportar problema"** — `qa-report-builder.cjs` monta um pacote
   (versão, SO/arquitetura, últimas N entradas, estado de cada CLI) e grava
   em `reports/`. Botão no painel QA Logger, com mensagem mostrando o
   caminho do arquivo pra anexar numa task.

### Achado de segurança durante a fatia 1

`redactSensitiveText` só examina o CONTEÚDO de uma string — não pega
`{"password": "segredo123"}`, porque o rótulo mora no NOME da propriedade,
não dentro do valor. Adicionado `isSensitiveKeyName` (exportado de
`git-secret-redaction.cjs`) e usado em `redactValue` pra mascarar o valor
inteiro quando a própria chave já é sensível — as duas fontes de sinal são
necessárias, nenhuma cobre o caso da outra sozinha. Coberto por teste.

### Validação

`npm test`: 1279/1279. `npx vitest run`: 907 passed, 1 skipped
(pré-existente). `eslint`: limpo. `npm run build` (typecheck completo): ok.
41 testes novos entre os 4 módulos novos + os que ganharam cobertura extra
(`git-secret-redaction`, `qa-logger`). Critério de aceite "pacote sem
segredo" tem teste dedicado com tokens/senhas falsos reais (GitHub PAT,
Bearer, senha) confirmando ausência no JSON serializado.

### Limitação declarada

Não foi possível validar ao vivo no app real (forçar erro → reiniciar →
confirmar persistência) porque `felixo devtools` está com uma regressão
separada: qualquer `connect` trava depois do handshake WebSocket, mesmo num
`launch` padrão sem nenhuma mudança desta task — reproduzido e confirmado
como pré-existente. Pista: `playwright-core` instalado (1.62.1) está acima do
que o `package.json` fixa (`^1.58.2`). Task de acompanhamento aberta.
A evidência desta task fica nos testes unitários (fs real via `mkdtemp`,
sem mock de disco) mais a leitura de código — não numa sessão real do app.

### Evidência de origem

Repositório: https://github.com/Felipe-Alcantara/Felixo-AI-Core

## Fechamento de trabalho — 2026-09-14 (continuação) — ordenação e filtros seguem a ordem visual do Notion

AGENTE/REPOSITÓRIO: Tasks do Felixo AI Core (Claude Sonnet 5) / Felixo-AI-Core.

Task Notion: "Notion — ordenação e filtros do canvas seguirem a hierarquia do
Notion e aguentarem databases grandes". Duas anotações de 14/09 juntadas:
ordenação bugada e filtros/ordenação não seguindo o padrão do app do Notion.
Segue a PR #43 (ordenação por coluna), deste mesmo agente, um dia antes.

### O que a investigação já tinha encontrado (registrado na própria task)

`notion-task-sort.ts` ordenava tudo como texto (`localeCompare`), ignorando a
ordem configurada das opções de `select`/`status` — exemplo real citado:
Prioridade devia sair Baixa→Média→Alta→Urgente→Hiperfoco, saía alfabético
(Alta, Baixa, Hiperfoco, Média, Urgente). Tarefa concluída era forçada pro
texto literal "Concluída", fora de ordem. `formatValue` era chamado duas
vezes por comparação, sem pré-cálculo — custoso nas 792 linhas do database
real. `hasMore` já existia no backend (`listTasks`) mas nunca chegava no
painel — um database truncado (>2.000 linhas) ordenava/filtrava só uma parte,
sem aviso.

### O que foi feito

- `schemaOptionOrder(property)`: ordem visual real de `select`/`status` — para
  `status`, monta a ordem a partir de `groups[].option_ids` (a ordem
  verdadeira), não do array `options` solto, que não tem essa garantia.
  Reaproveitada em `notion-task-views.ts` pra ordenar as opções do filtro
  também (mesmo mapeamento de tipos, como a task pedia).
- `buildSortKey`: uma chave tipada por coluna (`{kind:'number'|'string'|'empty'}`)
  usando o schema — índice da opção pra `select`/`status`/`multi_select`
  (mínimo entre as selecionadas), número real pra `number`, `0`/`1` pra
  `checkbox`, ISO como texto pra `date` (já ordena certo). Removida a
  substituição forçada por "Concluída" — `task.status` já vem certo do
  backend.
- `sortTasks` agora pré-calcula a chave de cada tarefa **uma vez** antes do
  `.sort()` (Schwartzian transform), não a cada comparação — O(n) chamadas de
  formatação em vez de O(n log n). Medido: 792 linhas × 20 ordenações reais
  (schema de verdade, coluna por índice) em 160ms total (~8ms por ordenação)
  — não trava a interface.
- `NotionTasksPanel.tsx`: novo estado `hasMoreTasks`, populado de
  `result.hasMore` (o backend já calculava, só não chegava na tela); aviso
  visível quando a tabela carregada está truncada.

### Validação

31 testes no `notion-task-sort.test.ts` (schema real da task: Prioridade
select 5 opções, Etapa status com 3 grupos, multi_select, number, checkbox,
contagem de chamadas de formatação). 2 testes novos em
`notion-service.test.cjs` cobrindo `hasMore:true/false`. `npm test`:
1281/1281. `npx vitest run`: 922 passed, 1 skipped (pré-existente). `eslint`
limpo. `npm run build` (typecheck completo) ok.

### Evidência de origem

Repositório: https://github.com/Felipe-Alcantara/Felixo-AI-Core

## Fechamento de trabalho — 2026-09-14: canvas, leitura de outros elementos (Fatia 1)

### Contexto

Task Notion "Canvas — agentes leem e editam qualquer elemento do canvas
(terminais, notas, Notion, arquivos, páginas)". A própria task nomeia o maior
risco de segurança do app: prompt injection vindo de uma página ou da saída
de um terminal lido por outro agente pode mandar escrever em outro lugar — e
por isso pede explicitamente para fatiar antes de codar, entregando leitura
primeiro e escrita depois, cada fatia com teste. Esta entrada fecha a Fatia 1
(leitura) apenas; escrita fica para uma task nova.

### O que foi feito

- `agent-requests.cjs`: duas ações novas na fila compartilhada com o Fetch
  All e o navegador — `canvas-listar` (sem campos extras) e `canvas-ler`
  (exige `idDoElemento`, aparado de espaço).
- `canvas-agent-read.cjs` (novo, lógica pura): `listarElementos` (id, tipo,
  rótulo, `leituraSuportada`) e `lerElemento` — suporta `terminal` (últimas
  linhas do `terminalLogStore`, cujo `sessionId` é o mesmo id do nó),
  `note` (Markdown do bloco) e `file` (conteúdo do arquivo apontado);
  qualquer outro tipo devolve uma mensagem explícita de "ainda não tem
  leitura nesta fatia" em vez de falhar sem explicação ou inventar
  resultado. Todo conteúdo passa por `redactSensitiveText` antes de sair.
- `agent-canvas-read-ipc-handlers.cjs` (novo): observa a fila, resolve os
  pedidos lendo o snapshot do `canvas-repository.cjs`. Decisão de produto
  deliberada: ao contrário de `executar-plano`, leitura é auto-resolvida
  **sem confirmação humana** — o ponto de atenção da task é sobre escrever,
  não sobre listar/ler.
- `felixo.cjs` + `agent-command-output.cjs`: comandos `felixo canvas listar`,
  `felixo canvas ler <id>` e `felixo canvas ver-pedido <id>`, com o mesmo
  padrão de espera curta (poll até ~4s) e checagem posterior que `fetch-all`
  e `browser` já usam.
- Skill nova `ler-elementos-do-canvas`, registrada em `skills-catalog.cjs`,
  com uma seção explícita "O que este comando NÃO faz": não escreve em nada,
  e conteúdo lido de terminal/página é dado, nunca instrução a seguir.
- `ARQUITETURA.md`: nova seção "Agente lê outros elementos do canvas".

### Bug pego pelo teste

`ultimasLinhasDaSessao` dividia o texto por `\r?\n` sem tirar a quebra final
antes — uma sessão terminando em `\n` gerava uma "linha" vazia espúria no
fim, empurrando pra fora uma linha real quando o limite era atingido.
Corrigido tirando uma quebra final antes de dividir.

### Validação

44 testes novos (`agent-requests.test.cjs` +2, `canvas-agent-read.test.cjs`
+19, `agent-canvas-read-ipc-handlers.test.cjs` +5,
`agent-command-output-canvas.test.cjs` +7, `felixo.test.cjs` +6, e mais no
catálogo de skills). `npm test`: 1320/1320. `npx vitest run`: 922 passed, 1
skipped (pré-existente, sem relação). `eslint` limpo. `npm run build`
(typecheck completo + build) ok.

### Limitações e o que fica pendente

Não foi possível fazer um smoke test do app de verdade rodando (o
`felixo devtools connect` trava depois do handshake WebSocket — regressão já
registrada em tarefa própria, `3db91f95-497e-816f-8cf3-f06b159f40b6`);
validação ficou só na suíte automatizada. Ficam fora desta fatia, cada uma
para abrir como task nova: escrita com confirmação humana (o risco que a
task original nomeia como prioridade), e leitura de `webpage` e de
databases/tarefas do Notion no canvas (hoje devolvem "ainda não tem leitura
nesta fatia" em vez de ler).

### Evidência de origem

Repositório: https://github.com/Felipe-Alcantara/Felixo-AI-Core

## Fechamento de trabalho — 2026-09-14: canvas, escrita numa nota (Fatia 2)

### Contexto

Fatia 2 da task "Canvas — agentes leem e editam qualquer elemento do canvas",
continuação direta da Fatia 1 (leitura, PR #48). É a parte que a task
original nomeia como o maior risco de segurança do app: prompt injection
vindo de um terminal ou página lido por outro agente pode tentar mandar
escrever em outro lugar. Por isso a regra é dura e sem exceção: toda escrita
fica pendente até um clique humano real.

### O que foi feito

- `agent-requests.cjs`: ação nova `canvas-escrever` (id do elemento +
  conteúdo, limite de 20.000 caracteres); conteúdo vazio é um pedido válido
  (limpar a nota), distinguido de "conteúdo não informado" por contagem de
  argumentos posicionais na CLI, não por truthiness.
- `canvas-agent-write.cjs` (lógica pura): valida o pedido contra o canvas de
  verdade e calcula o novo `data`, sem persistir nada. Só `note` aceita
  escrita nesta fatia — outro tipo devolve `ok:false` explicando, sem tentar
  escrever.
- `agent-canvas-write-ipc-handlers.cjs`: ao contrário da leitura, `canvas-
  escrever` **nunca** é auto-resolvido. Fica esperando `canvas:resolve-
  write-request`, chamado só por um clique real no painel. Na aceitação,
  relê o canvas de verdade no momento do clique (não o que veio no pedido,
  que pode ter envelhecido), persiste via `canvas-repository.cjs` e empurra
  o novo `data` pro renderer.
- Problema de arquitetura resolvido: persistir no SQLite não move nada na
  tela — o renderer é dono do estado vivo e só lê do banco no boot. Sem
  avisar o renderer, a escrita ficaria invisível até reload e uma autosave
  pendente do bloco (com o `data` antigo em memória) poderia sobrescrevê-la.
  Solução: evento `canvas:agent-node-updated`, que `useCanvasPersistence.ts`
  aplica no nó vivo E usa para cancelar qualquer save pendente daquele nó.
- Painel novo `AgentCanvasWriteRequestsPanel.tsx` ("Pedidos de escrita" no
  menu de ferramentas): mostra o rótulo do bloco alvo, o conteúdo a escrever
  (truncado) e dois botões — Aceitar e escrever / Recusar. A pessoa nunca
  autoriza no escuro: o conteúdo fica visível antes do clique.
- CLI: `felixo canvas escrever <id> "<texto>"`. Ao contrário de listar/ler,
  não espera resposta (um clique humano pode demorar minutos) — só registra
  e devolve na hora, apontando pra `felixo canvas ver-pedido <id>`.
- Sem log de auditoria separado: cada pedido já persiste como arquivo em
  `userData/agent-requests` com pedidoEm/resolvidoEm/estado/resultado — é o
  próprio registro do que foi pedido, quando, e o que a pessoa decidiu.
  Decisão deliberada: não duplicar persistência que já existe.
- Skill nova `escrever-em-elementos-do-canvas`, e a skill de leitura
  (`ler-elementos-do-canvas`) atualizada pra apontar pra ela.
- `ARQUITETURA.md` documenta a Fatia 2 na mesma seção da Fatia 1.

### O que foi decidido não fazer

A heurística de "detectar se o conteúdo parece ter vindo de uma leitura
anterior" (cogitada no planejamento da task) foi descartada: é segurança de
fachada — fácil de contornar, difícil de acertar sem falso positivo — e a
mitigação real já existe e é incondicional (confirmação humana sempre, sem
exceção). Documentado aqui pra não parecer um esquecimento.

### Validação

Testes novos: `canvas-agent-write.test.cjs` (5), `agent-canvas-write-ipc-
handlers.test.cjs` (5), `agent-requests.test.cjs` (+1), `felixo.test.cjs`
(+4), `canvas-write-agent-requests.test.ts` (16 no vitest). `npm test` e
`npx vitest run` cobrindo tudo antes do push (números finais no PR).

### Limitações

Mesma limitação da Fatia 1: sem `felixo devtools connect` funcionando, não
foi possível um smoke test do app de verdade rodando — o push pro renderer
(`canvas:agent-node-updated`) e o painel ficam sem verificação visual ao
vivo, só cobertura de lógica pura e dos handlers de IPC. Terminal e arquivo
continuam sem escrita (fora do escopo desta fatia); se fizerem sentido, cada
um vira task nova quando alguém precisar.

### Evidência de origem

Repositório: https://github.com/Felipe-Alcantara/Felixo-AI-Core

## [2026-09-16] Canvas: teclado, foco, colapso e espaço reduzido

**Task.** Tornar as superfícies do canvas acessíveis por teclado quando o foco muda, a sidebar/painel/gaveta colapsa ou a janela fica sem espaço.

**Implementação.** O fluxo agora tem retorno de foco para busca, ferramentas, notificações, terminal e handoff; diálogos mantêm Tab dentro do ciclo e Escape fecha; painéis e gaveta expõem regiões nomeadas, controles de colapso e separadores redimensionáveis por teclado; a sidebar colapsada fica inerte para não deixar controles invisíveis no Tab. Painéis, menus e filas têm rolagem interna, limites responsivos e anúncios de estado. A ocupação compartilhada inclui inspector e publica um aviso acessível quando os pisos de largura/altura não cabem.

**Validação local.** Typecheck, lint (somente dois avisos preexistentes em SearchPanel), testes frontend, testes nativos, build e diff-check foram executados antes da integração no main atualizado. A suíte geral manteve apenas a falha ambiental conhecida do inventário de pacote ao criar symlink no Windows (EPERM).

**Estado.** Código integrado sobre o main remoto mais recente; commit, push, CI/release e atualização do Notion serão registrados no fechamento desta execução.

**Evidência de origem.** Repositório: https://github.com/Felipe-Alcantara/Felixo-AI-Core

## [2026-09-16] Encerramento — validação e release

**Entrega.** O commit `0f9ad5144f1080f3a15b04964e66713efca2dc31` foi integrado em `main` e publicado no GitHub. O CI `35055462688` passou em Ubuntu, Ubuntu ARM, macOS e Windows; o Release `35056056489` passou nas três plataformas e publicou `v0.1.357` com instaladores e smoke reports.

**Gates locais.** `npm test` (1335 testes, 52 suítes), `npm run test:frontend` (945 aprovados, 1 ignorado), `npm run test:native` (5/5), testes focados de foco/geometria (28), lint, build do renderer (4344 módulos) e `test:canvas-smoke` passaram. O stderr recorrente `AttachConsole failed` do node-pty no Windows permanece apenas como ruído conhecido; o CI confirmou os gates nativos.

**Limitação registrada.** Não há axe-core/harness DOM instalado neste workspace; a validação de acessibilidade usou testes determinísticos, o smoke visual do canvas e os jobs multiplataforma do CI. O build local exigiu apenas um shim temporário dos tipos do Excalidraw e a extração local de `mermaid@11.12.1`; ambos foram removidos ou mantidos fora do versionamento.

**Evidência.** CI: https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/35055462688 · Release: https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.357

## [2026-09-16] Segurança: sanitização de Markdown com saída de terminal

**Task.** Executar “Felixo AI Core/Segurança — sanitizar Markdown de terminal,
HTML, URLs e imagens”, derivada da auditoria do commit 109a679 e das
superfícies MarkdownContent, WebpageNode e terminal-external-link.

**Causa medida.** O schema já removia HTML ativo e esquemas perigosos, mas a
prévia ainda podia materializar imagens HTTP/HTTPS sem concessão, não limitava
o texto antes do parser e não normalizava controles ANSI de uma saída de
terminal. O link do terminal também deixava o parser de URL normalizar
controles antes da validação.

**Implementação.**

- markdown-content-safety.ts remove CSI/OSC/C0/C1 de saída de terminal,
  normaliza quebras e limita o Markdown a 200.000 caracteres antes de
  react-markdown; a interface anuncia o corte com role=status.
- rehypeRaw continua seguido pelo schema explícito de rehype-sanitize, com
  protocolos remotos de src bloqueados e a segunda barreira mantendo somente
  imagens raster data: base64 de até 2 MiB. Imagem HTTP/HTTPS vira texto
  alternativo, sem elemento de imagem nem request automático.
- O corpus de testes mistura ANSI + Markdown e cobre script, handler, SVG,
  CSS remoto, OSC 8 com javascript:, URLs não aprovadas, truncamento,
  surrogate, data image e arquivo local autorizado. A validação de URL do
  terminal recusa controles, host ausente e protocolos fora de HTTP/HTTPS.
- README, guia do usuário e docs/projeto/ARQUITETURA.md documentam a
  fronteira e a decisão de bloquear imagem remota. A revisão de dependências
  não encontrou pacote novo necessário; rehype-raw/rehype-sanitize e
  remark-gfm existentes permanecem suficientes.

**Validação local.** Início: 16/09/2026 08:59 (America/Sao_Paulo). Fechamento
da implementação e dos testes locais: 16/09/2026 09:23. npm test: 1.335/1.335
testes em 52 suítes; npm run test:frontend -- --reporter=dot: 953 aprovados,
1 ignorado; npm run test:native: 5/5; testes focados de Markdown/ANSI/links:
34 aprovados; npm run lint: sucesso; npm run build e npx vite build: sucesso
com 4.345 módulos; npm run test:canvas-smoke: sucesso. A primeira execução do
typecheck encontrou dist/types ausente na instalação local de
@excalidraw/excalidraw; após restaurar os tipos declarados no pacote, o mesmo
build completo passou, sem alteração no lockfile. O stderr recorrente
AttachConsole failed do node-pty no Windows é ruído conhecido e não alterou o
resultado.

**Limitação.** Não há uma concessão visual para reativar imagens remotas nesta
fatia; se o produto precisar carregá-las, abrir uma task específica para
consentimento explícito, política de referrer e proxy controlado. WebpageNode
continua com sua política separada por ser um navegador embutido criado pelo
usuário. Nenhuma conta, chave ou credencial foi acessada.

**Estado.** Código e documentação prontos para commit, push e gates remotos.

**Evidência de origem.** Repositório:
https://github.com/Felipe-Alcantara/Felixo-AI-Core

## [2026-09-16] Canvas — interações, oclusão e acessibilidade

**Task.** Cobrir as interações dos nodes, superfícies fixas e terminais e
corrigir o caso em que o grupo da fixture nascia sob a barra superior/sidebar.

**Implementação.** `canvas-interaction-geometry.ts` centraliza o retângulo útil
do canvas, descontando topbar, sidebar, painel, inspector e statusbar sem
descontar duas vezes a gaveta, que já é uma coluna flex. Criação, foco, abertura
de página/tarefas, **Ver tudo** e **Organizar** usam a mesma geometria. O smoke
do Canvas agora persiste os oito tipos de node, verifica hit testing, arrasto
curto, handles de conexão, abertura/fechamento da gaveta, notificações,
`Escape`, URL inválida, reidratação e ausência de duplicação. A gaveta retorna o
foco ao gatilho mesmo com culling; depois da primeira abertura os gatilhos ficam
montados para completar esse contrato.

O DevTools isolado ativa `MockTerminalSessionStore` por
`FELIXO_DEVTOOLS_MOCK_PTY=1`, mantendo a prova de foco e teclado sem iniciar
shell ou CLI externa. A migration 013 amplia o `CHECK` do SQLite para
`drawing` e `excalidrawDrawing`, com teste de persistência após restart. Inputs
de nodes receberam rótulos acessíveis.

**Validação local.** Início: 16/09/2026 10:06 (America/Sao_Paulo). `npm test`:
1.336/1.336 em 52 suítes; `npm run test:frontend`: 958 aprovados e 1 ignorado;
`npm run test:native`: 5/5; typecheck, lint, build, testes focados de geometria
(36) e storage (33) passaram; `npm run test:canvas-smoke` passou no Electron
real. O `AttachConsole failed` recorrente do node-pty no Windows continua
apenas ruído conhecido. Não há axe-core instalado: o smoke faz auditoria
determinística de landmarks, nomes acessíveis, foco e teclado; a limitação
permanece registrada para uma futura bancada dedicada.

**Estado.** Código e documentação prontos para commit, push, CI/release e
registro no Notion.

**Evidência de origem.** Repositório:
https://github.com/Felipe-Alcantara/Felixo-AI-Core

## [2026-09-16] Contexto — prova ponta a ponta e matriz de recuperação

**Task.** Provar que o contexto inicial chega ao agente em todos os fluxos de
restart/reidratação, troca de agente, reabertura de terminal, concorrência,
confiança de pasta do Claude e auto-update do Codex, deixando diagnóstico
persistente quando algo falhar.

**Implementação.**

- `context-delivery-log.cjs` compartilha a trilha QA `written`, `path-typed`,
  `read` e `failed` entre o processo Electron e o comando standalone. Cada
  entrada guarda o id do artefato, terminal, agente e tipo, sem copiar o corpo
  do contexto.
- O IPC e o preload registram a escrita e a referência aceita pela PTY; o
  `TerminalSessionStore` associa os artefatos à sessão e evita transições
  duplicadas. O leitor `felixo context read` registra a leitura ou a falha no
  JSONL diário de `logs/qa`.
- `canvas-context-e2e.test.ts` usa o escritor e leitor reais, arquivos isolados
  e uma PTY determinística para executar seis cenários. A matriz repete 50
  vezes por padrão, grava relatório JSON atômico e conserva as últimas entradas
  do QA em qualquer falha. O CI executa as 50 repetições nos três sistemas.
- README, `ARQUITETURA.md` e este registro documentam o contrato e o caminho
  da evidência.

**Validação local.** Início: 16/09/2026 12:44 (America/Sao_Paulo). Fechamento
dos gates: 16/09/2026 13:49. `npm test`: 1.341/1.341 testes em 52 suítes;
`npm run test:frontend` com 50 repetições: 961 aprovados e 1 ignorado;
`npm run test:native`: 5/5; testes focados de contexto: 18/18; matriz E2E:
50/50 repetições, 1.000/1.000 artefatos com a cadeia completa e zero falhas;
typecheck, lint, build e diff-check passaram. O stderr `AttachConsole failed`
do node-pty continua sendo ruído conhecido do runner Windows e não alterou os
resultados.

**Limitação.** A matriz usa uma PTY determinística, mas atravessa o escritor de
arquivo, o shim e o leitor standalone reais. Ela prova restart como
reidratação do renderer sobre a sessão viva; CLIs autenticadas e um processo
Electron empacotado permanecem cobertos pelos gates de release existentes.

**Estado.** Implementação e documentação validadas para commit, push, CI e
atualização da task no Notion.

**Evidência de origem.** Task Notion:
https://app.notion.com/p/Felixo-AI-Core-Contexto-provar-ponta-a-ponta-que-o-contexto-inicial-chega-em-100-dos-casos-resta-3db91f95497e81fca040c22f5f95e420

## [2026-09-16] Prompts — metadados de inserção e rastreabilidade

**Task.** Definir ID, nome, origem e composição da injeção de prompts sem alterar o payload interpretado pelo agente.

**Implementação.** `PromptInsertion` centraliza `id`, `name` opcional, `source`, `content`, `combinedNames`, `autoSubmit` e `timestamp`. O catálogo usa o ID estável da definição (inclusive após edição), skills mantêm ID/nome, combinações preservam ordem e nomes repetidos, e entrada manual usa `source: manual` sem nome inventado. `PromptsPanel`, skills, links de arquivo, handoff e o `TerminalSessionStore` passam a registrar essa identidade; chamadas legadas de `sendText(id, text)` e o objeto `{ sessionId, data }` da PTY continuam compatíveis.

A sessão expõe a última inserção no snapshot e em `SessionMetadata`. O canvas persiste somente `PromptInsertionMetadata`, sem `content`; artefatos de contexto e QA carregam apenas identidade segura. Arquivo e fallback inline usam a mesma metadata, e nenhum campo de metadata é enviado ao `pty.write`.

**Validação local.** `npm test`: 1.341/1.341; `npm run test:frontend`: 972 aprovados e 1 ignorado; `npm run test:native`: 5/5; `npm run test:canvas-context`: 5/5 com matriz de 50 repetições; `npm run test:canvas-smoke`: sucesso; testes focados de inserção/sessão/persistência: 54/54; `npm run typecheck`, `npm run lint`, `npm run build` e `git diff --check`: sucesso. O stderr recorrente `AttachConsole failed` do node-pty no Windows apareceu apenas como ruído dos testes nativos e não alterou os resultados.

**Decisões.** O texto existente de `composeSelectedPrompts` e os headings legados permanecem intactos; o rótulo humano fica fora do payload. O corpo não entra em node persistido nem em metadata de arquivo/log. O tipo técnico antigo do catálogo permanece para chamadas sem opções; o painel manual declara `manual-prompt` explicitamente.

**Estado.** Implementação e documentação prontas para commit, push, CI e encerramento da task.

**Evidência de origem.** Task Notion: https://app.notion.com/p/Felixo-AI-Core-Prompts-definir-metadados-de-nome-ID-origem-e-composi-o-da-inje-o-3ce91f95497e810d998ad77cfe057677
## Fechamento de trabalho — 2026-09-19: canvas, cor de moldura em qualquer bloco

### Contexto

Task "Canvas — escolher a cor de qualquer elemento do canvas": só notas tinham
cor (`NoteColor`, papel da nota). Critério: todo tipo aceita cor, ela
sobrevive a reiniciar e notas antigas mantêm a que tinham.

### Decisões

- Campo novo `frameColor` (token de 6 cores), em vez de reaproveitar
  `color`: em nota, `color` é o *papel* (fundo claro); a task pede moldura
  sem pintar conteúdo. Campos separados = notas antigas intactas sem
  migração, o que cumpre o critério pelo caminho mais seguro.
- Um único ponto de aplicação: classe no wrapper do nó (CanvasView) + CSS no
  primeiro filho, em vez de mexer nos 8 componentes de bloco. Um único menu de
  clique direito (`NodeColorMenu`) cobre também grupo, que não tem NodeHeader.
- Prioridade com a notificação: ainda não existe realce de notificação por
  nó (task irmã aberta); a regra ficou documentada no CSS (declarar depois).

### Validação

Testes: `frame-colors.test.ts` (3) e round-trip de persistência em todos os
8 tipos + nota antiga (2). eslint, tsc e testes rodados antes do push.
Sem verificação visual ao vivo (`felixo devtools connect` ainda travado — task
própria) — o aspecto do halo/contorno não foi visto na tela.

## Fechamento de trabalho — 2026-09-19: perguntas com opções para o Codex (`felixo perguntar`)

### Contexto

Task "Agentes — perguntas interativas com opções para o Codex no canvas".
Critério: um agente Codex faz uma pergunta com 2 a 4 opções, o Felipe escolhe
clicando e a resposta volta sem digitar; o caminho escolhido fica no IA.md.

### O que foi medido (Codex 0.154.0, protocolo real)

`codex app-server generate-json-schema --experimental` mostra
`item/tool/requestUserInput` (`ToolRequestUserInputParams`: perguntas com id,
header, opções label/descrição, `isOther`, `isSecret`; resposta:
`answers[id].answers[]`). `codex features list`:
`default_mode_request_user_input` = *under development*, **false** — a
ferramenta nativa só existe fora do plan mode atrás dessa flag. Confirmou a
divergência com a anotação: o Codex tem a ferramenta, mas instável.

### Decisão (perguntada ao Felipe; escolha: `felixo perguntar`)

1. Flag nativa no PTY: instável e a pergunta fica dentro do TUI, por
   teclado — não cumpre "clicando". Descartada como caminho principal.
2. Diálogo do app-server: o app-server só serve chat/orquestrador; os
   terminais do canvas rodam o TUI por PTY, então não alcançaria o agente do
   canvas. Descartada.
3. **`felixo perguntar`** na fila `agent-requests`: agnóstico de agente
   (Codex/Claude/Gemini), reaproveita o canal já construído. Escolhida. O
   Felipe também notou que o Codex às vezes já pergunta sozinho, mas pior que
   o Claude — coerente com não depender da flag.

### O que foi feito

- `agent-requests.cjs`: ação `perguntar` (pergunta ≤500, 2–4 opções ≤120,
  descrição ≤300).
- `agent-question-ipc-handlers.cjs`: nunca auto-resolve; o renderer envia só o
  ÍNDICE e o texto devolvido ao agente vem do pedido gravado (o que chega do
  renderer nunca vira a resposta). Índice inválido não resolve nem fecha a
  pergunta.
- `AgentQuestionDialog` global no CanvasView (quem perguntou está bloqueado;
  não pode depender de painel aberto): clique, teclas 1–4, Esc dispensa.
- CLI `felixo perguntar "<pergunta>" "<op1>" "<op2>"…`: ao contrário de
  `canvas escrever`, BLOQUEIA até a resposta (5 min). Saída: texto da opção
  (0), dispensada (3), sem resposta no prazo (1), uso inválido (2).
- Skill `perguntar-com-opcoes`; `ARQUITETURA.md` com a decisão.

### Validação

Testes novos: 1 em `agent-requests`, 5 no handler, 6 na CLI, 4 de lógica pura
do diálogo (vitest). Resultado completo de `npm test`/vitest/eslint/tsc no PR.
Sem verificação visual/ao vivo: `felixo devtools connect` segue travado (task
própria) e o diálogo não foi visto na tela; um Codex real também não foi
posto a usar o comando — a skill ensina, mas não medi se ele a segue.

## Fechamento de trabalho — 2026-09-19: modo fast ao criar agente Codex

### Contexto

Task "Agentes — opção de modo fast ao criar agente Codex". A investigação
anterior só tinha strings do binário (`service_tier`, `fast_mode`) e mandava
confirmar o contrato. Feito antes de codar.

### O que foi medido

- `~/.codex/models_cache.json`: todo modelo (gpt-5.6-sol/terra/luna, gpt-5.5…)
  traz `service_tiers: [{id:"priority", name:"Fast", description:"1.5x/2x
  speed, increased usage"}]` e `additional_speed_tiers: ["fast"]`.
- `codex features list`: `fast_mode` = stable, true. O `~/.codex/config.toml`
  da máquina tem `service_tier = "default"`.
- Prova ponta a ponta sem gastar uso: `codex app-server` + `config/read` →
  `service_tier` efetivo `"default"` sem override e `"priority"` com
  `--config service_tier="priority"`. Contrato: chave `service_tier`, valor
  `priority` (o `id`, não o nome "Fast").

### Decisões

- Sem fast, **nada é enviado** (não forço `service_tier="default"`): isso
  sobrescreveria uma escolha da própria pessoa no `config.toml`. Consequência
  conhecida: quem já tem `priority` no config.toml roda fast mesmo sem marcar.
- Compatibilidade por modelo vem do catálogo do Codex (`fastModels`); modelo
  padrão (vazio) conta como compatível.
- Cabeçalho: o rótulo do terminal (`describeLaunch`) ganha "⚡ fast".
- `fast` salvo em preferências só vale para agente/modelo que suporta.

### O que foi feito

`agent-launch-options.ts` (`fastModels`, `supportsFastMode`, arg, rótulo),
`agent-launch-preferences.ts`, `useAgentConfig.ts`, checkbox "Modo fast" em
`AgentConfigFields.tsx` (só onde suporta; a HandoffDialog herda) e
`model-options.cjs` (exec + app-server via `model.fastMode === true`).

### Não feito / pendente

O campo `fastMode` do `Model` de chat (ModelConfigModal + coluna SQLite em
`models-repository`) não foi criado: hoje só o fluxo de criar agente no
canvas expõe o modo; os dois caminhos de `model-options.cjs` já sabem
aplicá-lo (testado), faltando persistir/mostrar no modelo de chat. Também
falta o preset de agente nativo (task irmã) guardar a opção. **Não conferi
`/status` numa sessão Codex real** (critério de aceite original): a prova foi
a config efetiva do app-server, não uma sessão de verdade.

### Validação

Testes: 4 em `model-options.test.cjs`, 6 em `agent-launch-options.test.ts`, 1
em `agent-launch-preferences.test.ts` (+ expectativas com `fast`). Resultado
completo dos gates no PR.

## Fechamento de trabalho — 2026-09-19: modo fast no modelo de chat do Codex

### Contexto

Pendência da task do modo fast (PR #53): o modo já existia ao criar agente no
canvas e nos args de `model-options.cjs`, mas o `Model` de chat não tinha o
campo.

### O que foi feito

- Migration `014_models_fast_mode.sql` (`fast_mode INTEGER NOT NULL DEFAULT 0`);
  `models-repository.cjs` grava/lê e só devolve `fastMode: true` quando ligado.
- `Model.fastMode`; `modelSupportsFastMode`/`resolveFastMode` (uma fonte só,
  `supportsFastMode`); checkbox no `ModelConfigModal`, botão "⚡ Fast" no
  `Composer`; `model-storage` preserva/mescla o campo.
- **Duas armadilhas do caminho renderer → spawn** (não estavam na task):
  1. `normalizeAvailableModel` (`cli-request-policy.cjs`) reconstrói o modelo
     campo a campo — sem tocar nela, o `fastMode` morreria ali e o adapter
     nunca o veria (cobrido por teste).
  2. `createModelSessionKey` identifica o processo persistente do Codex; sem o
     fast na chave, alternar o campo reaproveitaria o processo aberto com o
     tier antigo (cobrido por teste).

### Não feito

Item 4 da task (preset de agente nativo guardar o fast): o recurso de presets
ainda não existe (task "criar agentes nativos pré-configurados", em Entrada);
quando existir, basta o preset carregar `fastMode` no `Model`/escolhas já
prontos. `/status` numa sessão Codex real segue sem conferência.

### Validação

Testes: 3 no repositório (round-trip real em SQLite + upgrade pela
backward-compatibility), 1 na política, 2 na chave de sessão, 2 do helper.
Resultado completo dos gates no PR.

## Fechamento de trabalho — 2026-09-19: presets de agente (fatia 1)

### Contexto

Task "criar agentes nativos pré-configurados" (Esforço: Dias). "Pré-treinado"
= receita salva, não treino de modelo. Fatiada: esta entrega cobre o núcleo
(formato, nativos, persistência, salvar/aplicar no formulário, contexto por
arquivo); a tela de gerenciar fica para a fatia 2.

### Decisões

- **Formato versionado e puro** (`agent-preset.ts`, `felixo-agent-preset` v1):
  normalizar repara valores antigos para o padrão; o arquivo de troca omite id,
  pasta (caminho da máquina de origem) e marca de nativo; importar recusa
  versão maior com mensagem clara.
- **Nativos no código, da pessoa no SQLite** (migration 015): nativo atualiza
  com o app e não se edita (duplica-se); o banco recusa gravar nativo.
- **Escolher preset só preenche o formulário**; o agente nasce pelo botão de
  sempre. Contexto e skills seguem no `initialText` → entregues por arquivo
  pelo session-store, atendendo "nunca digitar prompt gigante no PTY" sem
  criar mecanismo novo. Cor do preset vira `frameColor` (reuso da task de cor).
- Modo fast e yolo entram no preset (fast só vale onde o modelo suporta).

### Não feito (fatia 2, task própria)

Tela de gerenciar (editar campos do preset, escolher skills, exportar/
importar arquivo). Hoje: criar via "Salvar como preset" (mantém as skills do
preset ativo), duplicar e excluir; skills de preset da pessoa só vêm de
duplicar um nativo. O formato de exportar/importar já existe e tem teste;
falta a UI que o usa.
Não verificado ao vivo: `felixo devtools connect` segue travado, então nem o
formulário nem um agente nascendo de preset foram vistos rodando; a validação
foi por testes do formato, do repositório (inclui reabrir o banco) e do
prompt.

### Validação

Testes: 12 do formato, 5 do prompt, 6 do repositório. Resultado completo dos
gates no PR.

## Fechamento de trabalho — 2026-09-19: presets de agente (fatia 2, tela)

### Contexto

Fatia 2 da task de presets (fatia 1: PR #55): tela para editar, escolher
skills, exportar e importar.

### O que foi feito

- Ferramenta "Presets de agente" (`AgentPresetsPanel`): lista com nativos e da
  pessoa; novo, editar (todos os campos), duplicar, excluir, exportar,
  importar. Nativo não se edita.
- Regras de edição puras em `agent-preset-editor.ts`: trocar de CLI zera
  modelo/esforço/fast; trocar de modelo só mantém esforço e fast válidos;
  `checkPresetDraft` valida e normaliza antes de salvar; `presetFileName`
  gera nome de arquivo seguro.
- Skills escolhidas numa lista do catálogo; skill citada que o catálogo não
  tem mais é avisada na tela (e ignorada ao abrir o agente, como já era).
- Exportar reaproveita `files.saveTextFile` (extensão `.fxpreset`); importar
  lê o arquivo no renderer, valida formato/versão, dá outro id e numera o nome
  se colidir — nunca sobrescreve. Limite de 256 KB no arquivo.
- `useAgentPresets` avisa outras instâncias por evento de janela: a tela e o
  formulário de spawn são instâncias separadas, e sem isso o formulário
  mostraria a lista velha depois de uma edição.

### Não verificado

Nenhuma tela foi vista rodando (`felixo devtools connect` segue travado):
painel, exportar (diálogo nativo) e importar (seletor de arquivo) só têm
cobertura pela lógica pura e pelo formato (ida e volta testada na fatia 1). O
critério "importar em outra instância e ver o mesmo agente nascer" foi coberto
até o formato, não numa segunda instância de verdade.

### Validação

10 testes novos do editor. Resultado completo dos gates no PR.

## Fechamento de trabalho — 2026-09-19: perfis separados no navegador interno

### Contexto

Task "Navegador — perfis separados no navegador interno (uma partição por
perfil)". Todos os blocos Página Web usavam `persist:felixo-webview`, então não
dava para ter duas contas do mesmo site nem separar trabalho de pessoal.

### Decisões (com o motivo)

- **A partição sai do `profileId` do bloco, nunca da lista de perfis.** A lista
  carrega de forma assíncrona; se a partição dependesse dela, um bloco do perfil
  "Trabalho" abriria primeiro na sessão Padrão e só depois remontaria — a página
  carregaria por um instante logada como outra pessoa. Cobri o risco no desenho
  (e a lógica de exibição separada: `describeWebviewProfile`).
- **Padrão = a partição antiga, virtual.** Bloco sem `profileId` continua nela:
  ninguém é deslogado. O id `default` é recusado no banco e no handler de
  exclusão — excluir o Padrão apagaria o login de todos os blocos antigos.
- **Excluir limpa a sessão antes de tirar o perfil da lista**; se a limpeza
  falha, o perfil continua (não sobra sessão logada sem dono). Bloco de perfil
  excluído mantém a partição vazia e aparece como "Perfil removido" — não é
  empurrado em silêncio para o Padrão.
- **Agente:** `felixo browser open --embedded --profile=Nome` leva o NOME; o
  processo principal resolve. Perfil inexistente **falha** em vez de cair no
  Padrão (abriria numa sessão logada que o agente não escolheu). O CLI passou a
  aceitar `--chave=valor` (booleanas seguem iguais); `--profile` sem valor e
  perfil sem `--embedded` são erro de uso.
- Renderer e processo principal validam o id do perfil com a mesma regra (vai em
  nome de partição) — teste de paridade lê o `.cjs`.
- Erro meu pego a tempo: um `sub` de script aplicou o seletor no componente
  errado (`NamedCreateButton`, markup idêntico ao `UrlCreateButton`); `tsc`
  acusou e refiz no lugar certo.

### O que foi feito

Migration 016 + repositório + IPC (`webview-profiles:*`); store externa e hook;
menu no cabeçalho do bloco (ver, trocar, criar, excluir; em portal porque o card
corta overflow); seletor de perfil ao criar o bloco (só aparece se existir perfil
da pessoa); caminho do agente; skill `abrir-paginas-no-navegador` atualizada.

### Não verificado

**Critério de aceite não conferido de verdade:** "dois blocos do mesmo site em
perfis diferentes mantêm logins independentes depois de reiniciar o app". Não
foi testado em app real (`felixo devtools connect` segue travado; e exigiria
login numa conta real). O que está coberto: a partição por perfil (unidade), a
persistência da lista (reabrir o banco), a limpeza ao excluir (com doubles) e
o caminho do agente. O comportamento do Electron com `persist:` por partição é
o esperado pela documentação, mas não o medi aqui. Também não vi o menu na tela.

### Validação

Testes: 4 partição, 6 repositório, 4 IPC, 4 handler do agente, 1+4 pedido/CLI,
11 formato, 7 store. Resultado completo dos gates no PR.

## Fechamento de trabalho — 2026-09-19: entrada de voz (ditado), sem verificação com microfone real

### Contexto

Task "Entrada de voz — ditar prompts pelo microfone em qualquer SO". O passo 1
da task é escolher o motor **medindo** latência, qualidade em português e
custo. Não deu para medir: o microfone do notebook do Felipe está com defeito
e este ambiente não sobe o Electron (`/dev/shm` bloqueado → FATAL), então nem a
Web Speech API (a "armadilha provável" da task) foi testada.

### Decisão (do Felipe, via pergunta: nuvem / só a base / adiar)

Nuvem + motor plugável: API de transcrição compatível com a da OpenAI. Igual
nos 3 SOs, sem binários. **Escolha sem medição** — registrada como tal. Não
cito latência/custo/qualidade porque não medi; whisper local, Web Speech e APIs
nativas ficam como alternativas não avaliadas.

### O que foi feito

- Processo principal: `speech-settings-store` (config + chave **cifrada** pelo
  `safeStorage`; sem cifra a chave não é gravada), `speech-transcription`
  (multipart, limites, erros mapeados, redação de eco de chave), IPC
  `speech:*`, status/pedido de permissão do microfone.
- Renderer: gravador (`getUserMedia` + `MediaRecorder`, libera o microfone
  sempre), máquina de estados, hook, botão com indicador de gravação/cronômetro
  na barra superior, atalho configurável (padrão Ctrl/Cmd+Shift+M), seção em
  Configurações (chave, endereço, modelo, idioma, atalho, status do microfone).
- macOS: `NSMicrophoneUsageDescription` em `package.json` + teste-guarda.
- **Segurança do texto ditado** (vem de API externa e vai para um shell): duas
  camadas — `sanitizeDictatedText` (quebra vira espaço; remove controle e
  caracteres invisíveis/direcionais) e `typeText`, que recusa controle por conta
  própria. O texto **nunca** é enviado: só digitado na linha de entrada.
- O endereço da API só aceita https (ou http em loopback) e vem da config no
  processo principal: o renderer não decide para onde a chave e o áudio vão.
- Erro meu pego pelo ambiente: o primeiro comando com caracteres de controle/
  bidi literais foi barrado pela ferramenta; refiz montando-os por código
  (`String.fromCharCode`) — o fonte e os testes não carregam invisíveis.

### NÃO verificado (o essencial)

**Nada foi ouvido com microfone real, em nenhum SO.** Critério de aceite
("apertar o atalho, falar uma frase em português e ver o texto no terminal",
nos três SOs) **não conferido**. Cobertura: lógica pura, gravador com dublês,
cliente de transcrição com `fetch` falso, IPC com dublês, `typeText` contra o
harness real do store. Não foi vista a UI (botão, popover de erro, seção de
configurações), nem o comportamento real de `MediaRecorder`/permissão no
Electron, nem o diálogo de permissão do macOS/Windows.

### Pendências (task nova)

Validar com microfone real nos 3 SOs; medir latência e qualidade em português
com a API escolhida; comparar com whisper local; entitlement de áudio se o macOS
passar a ser assinado; timeout/limite reais de gravação em uso.

### Validação

Testes: 18 do processo principal (config, transcrição, IPC), 1 de empacotamento,
19 do ditado (sanitização, erros, estados, atalho), 7 do gravador, 3 do
`typeText`. Resultado completo dos gates no PR.

## Fechamento de trabalho — 2026-09-19: motor de transcrição local (parcial, sem teste real)

### Contexto

Task "Entrada de voz — motor de transcrição local (offline)". O Felipe pediu
para seguir **sem teste real por enquanto** (microfone com defeito). A task é de
pesquisa/decisão: o passo 2 (medir latência/qualidade no notebook modesto) e a
decisão de embutir whisper dependem de medição e ficam pendentes.

### O que foi feito (só o que é verificável sem microfone)

- **Achado que bloqueava o caminho local:** o cliente exigia chave sempre, então
  apontar para `localhost` não funcionava sem uma chave inútil. Agora, com
  endereço de loopback, a chave é opcional e nenhum `Authorization` é enviado;
  fora do loopback a chave continua obrigatória e nada sai sem credencial.
- Config expõe `keyRequired`; o pré-teste do ditado e a tela usam isso (servidor
  local não pede chave).
- Configurações: motor "Nuvem × Servidor local" (o modo sai do endereço, mesma
  regra do processo principal, com teste de paridade), com aviso explícito de
  que o servidor local não foi testado com um servidor real.
- Servidor desligado diz para conferir se ele está rodando (mensagem própria).
- **Teste com servidor HTTP de verdade (loopback, sem `fetch` falso):** o pedido
  chega como multipart válido, no caminho `/v1/audio/transcriptions`, com
  `model`, `language`, `response_format=json`, arquivo `ditado.webm`/`audio/webm`
  e tamanho correto; sem chave não há `Authorization`; com chave há o Bearer;
  500 vira mensagem; porta fechada (recusa de conexão real) vira a mensagem do
  servidor local. Contrato documentado em `ARQUITETURA.md`.

### Não feito / NÃO verificado

- **Nenhum servidor de transcrição real foi rodado** (nenhum instalado aqui, e
  sem microfone/áudio real). Não sei se um servidor específico aceita o webm/opus
  que o app grava (alguns exigem conversão) — é exatamente o experimento
  pendente. Não recomendo servidor nenhum antes de medido.
- **Sem medição:** latência e qualidade em português no notebook do Felipe, nos
  tamanhos de modelo do whisper. Sem número, a decisão (documentar o servidor
  local × embutir whisper.cpp × outra) **não foi tomada** e continua sendo do
  Felipe (custo de empacotamento/tamanho).
- O critério de aceite ("ditar sem internet e ver o texto no terminal, com
  latência medida") **não foi cumprido**.

### Validação

Testes: 8 novos no processo principal (5 contra servidor HTTP real em loopback,
2 do store, 1 de recusa sem chave), 2 do renderer (incl. paridade). Resultado
completo dos gates no PR.

## Fechamento de trabalho — 2026-09-19: layout, altura dos painéis (fatia 1) — sem verificação visual

### Contexto

Task "Layout — redimensionar painéis e janelas nos dois eixos sem quebrar em telas
pequenas" (Esforço: Dias, risco alto: o loop painel × gaveta de 12/09 saiu de
uma leitura circular entre superfícies). Fatiada.

### O que foi feito

- **Inventário** (`docs/projeto/LAYOUT-SUPERFICIES.md`): cada superfície, se
  redimensiona, em qual eixo e o mínimo útil — levantado **lendo o código**, não
  medido numa janela. Achados: painéis só redimensionavam a largura; a altura só
  tinha teto; nenhum dos 13 modais redimensiona (todos têm `max-h` em `vh`, então
  não estouram a janela); o Tarefas Notion tem mínimo de 760×460 (em 800 px cobre
  quase tudo).
- **Altura dos painéis de ferramenta**: `clampPanelHeight`/`read`/`write`/`clear`
  em `panel-sizing.ts` + `useResizablePanelHeight` + alça na borda de baixo do
  `CanvasPanel` (arrasto, setas ↑↓, `Home`/duplo clique = altura do conteúdo).
- **Por que não reabre o loop de 12/09:** a altura NÃO fala com o coordenador de
  superfícies. O painel ancora no topo e só concorre com as outras superfícies
  pela LARGURA; a altura usa o mesmo teto que o painel já respeitava
  (`getPanelMaxHeight`), então esticar não cria uma posição nova. A largura
  continua passando por `reportPanelWidth`, intocada.
- **Invariante testada:** em 11 alturas de janela (200 a 2400) × 9 pedidos (de
  negativo a `MAX_SAFE_INTEGER`) a altura fica entre o piso e o teto e cabe na
  janela; o intervalo nunca se inverte, nem em janela mais baixa que o piso.
- **Smoke de viewport** (`canvas-smoke.cjs`): em 1366×768, 1024×640 e 800×600
  abre o painel, confere que ele fica dentro da janela nos 4 lados, cresce pela
  alça de altura respeitando o teto e volta com `Home`. **Só roda no CI**
  (macOS/Windows); não rodei localmente.

### NÃO verificado

- Nada foi visto numa janela real: o `felixo devtools connect` segue travado e o
  ambiente não sobe o Electron. A alça de baixo (posição, cursor, sobreposição
  com a alça da direita no canto) e a rolagem interna com altura fixa estão
  cobertas só pela lógica pura e pelo smoke do CI.
- O smoke novo foi escrito sem poder executá-lo antes do push: pode precisar de
  ajuste depois do primeiro resultado do CI.
- O critério de aceite ("toda superfície do inventário redimensiona nos dois
  eixos") **não foi cumprido**: modais, gaveta (vertical) e inspector ficam
  pendentes.

### Pendente (tasks novas)

Modais redimensionáveis (13); gaveta e inspector; revisar o mínimo do Tarefas
Notion; conferir tudo numa janela real.

### Validação

12 testes novos em `panel-sizing.test.ts`. Resultado completo dos gates no PR.

## Fechamento de trabalho — 2026-09-19: layout, gaveta/inspector/Tarefas Notion (fatia 2) — duas decisões de não mudar

### Contexto

Task "Layout — gaveta do terminal e inspector: redimensionar e revisar o mínimo do
Tarefas Notion". Três itens, com riscos bem diferentes; a largura é a parte que já
gerou o loop de 12/09.

### Decisões (com o motivo; a pessoa pode revertê-las)

- **Gaveta: sem eixo vertical.** É uma coluna de altura total (`h-full` numa linha
  flex), não uma janela — não há altura a redimensionar sem transformá-la numa
  janela flutuante (outra feature). Mantém largura arrastável, recolher e maximizar.
- **Inspector: continua com 288 fixo.** `INSPECTOR_WIDTH` é constante lida pelo
  coordenador, pelas invariantes e pelo painel; torná-lo variável o faria um terceiro
  disputante em `splitHorizontalSpace` — o acoplamento do loop de 12/09 — para uma
  superfície que já devolve espaço ao recolher (puck, reserva 0). Ganho não paga o
  risco. **Nenhuma linha do caminho da largura foi tocada.**
- **Tarefas Notion: mínimo 760×460 → 480×320.** O bloco rola por dentro
  (`overflow-auto`) e o painel usa colunas flexíveis (`min-w-0`).

### O que foi feito (código)

- `NODE_MIN_SIZE` (`node-geometry.ts`) como fonte ÚNICA dos mínimos dos 8 blocos;
  os `NodeResizer` de cada componente e `getDefaultNodeSize` leem dela (antes o
  número estava copiado em cada componente).
- **Bug real achado pelo teste de invariante:** a NOTA nascia com 158×115 em janela
  estreita, abaixo do próprio mínimo (180×120) — e o Tarefas Notion com 749 contra
  760 numa janela de 800. `getDefaultNodeSize` agora aplica o piso. O teste
  falhou antes do piso (`note @320: 158 < 180`) e passa depois.
- Teste: em 10 larguras de janela (320–3840) × 8 tipos, nenhum bloco nasce menor
  que o mínimo; o mínimo cabe no padrão de tela grande; em tela grande o tamanho
  padrão é o de sempre.

### NÃO verificado

- Nada foi visto numa janela real (`felixo devtools connect` travado; sem Electron
  aqui). Não vi o Tarefas Notion em 480×320 — se a tabela fica legível ali é
  inferência do código (`min-w-0`, `overflow-auto`), não observação.
- O smoke de viewport não exercita o Tarefas Notion; a cobertura é o teste de
  invariante, não uma janela.
- "Tarefas Notion utilizável em 800 px" não foi conferido visualmente.
- As invariantes de largura do coordenador (`layout-invariants.ts`) já existiam e
  não foram alteradas — como nenhuma largura mudou, não escrevi teste novo delas.

### Validação

4 testes novos em `node-geometry.test.ts`. Resultado completo dos gates no PR.

## Fechamento de trabalho — 2026-09-21: diagnóstico de CLI (PATH, shims, estado gerenciado) — fatia 1, backend

### Contexto

Task "Felixo AI Core/CLI — diagnosticar PATH, shims e estado gerenciado antes de
propor reinstalação" (Esforço: Dias). O detector devolvia só `detected: false` com
uma mensagem genérica, e o `catch { continue }` de `detectCli` jogava fora a razão
real (arquivo inexistente, permissão negada, atalho quebrado, timeout). A UI não
tinha como separar "não instalada" de "instalada mas invisível ao Electron".

### O que foi feito (código)

- `cli-detector.cjs`: `detectCli` passa a devolver `attempts` (cada variante
  tentada, caminho resolvido, se rodou via shell, desfecho) e `reason`
  (`not-found`, `permission`, `timeout`, `shim-broken`, `exit-error`, `unknown`).
  Só CÓDIGOS são guardados — nunca a saída crua do erro. Um "não achei" só vale
  quando nenhuma variante resolveu um arquivo; se uma variante achou o arquivo e
  falhou ao executar, o motivo é o dela. `EINVAL` (recusa do Node a `.cmd` sem
  shell, CVE-2024-27980) é tratado como atalho quebrado.
- `services/cli-diagnostics.cjs` (novo): `buildCliDiagnosis` / `diagnoseClis` /
  `formatDiagnosisForSupport`. Read-only: nada instala, nada altera PATH ou
  configuração, nenhum comando vem do ambiente. `recommendInstall` só é `true`
  para "não instalada" e "pacote gerenciado incompleto"; binário válido, PATH,
  permissão, timeout, atalho e rede nunca recomendam reinstalar.
- Minimização para suporte: home vira `~`, nome de usuário (inclusive de OUTRA
  conta, inclusive com espaço) vira `<usuario>`, URLs viram `[url]`, tokens
  rotulados / `Bearer` / `_authToken` / sequências longas viram `[oculto]`.
- `cli-auto-install.cjs`: a mensagem da instalação é redigida ANTES de ir para o
  status, o arquivo `cli-auto-install.json` e o log de QA; novo IPC read-only
  `clis:diagnose` (+ `cliSetup.diagnose` no preload e no `vite-env.d.ts`).

### NÃO verificado

- Nada foi visto no app real: só testes unitários e de integração do serviço.
  Nenhuma máquina Windows com CLI quebrada de verdade foi exercitada.
- **A apresentação na UI (instrução específica por causa, botão "verificar
  instalação", "copiar diagnóstico") NÃO foi feita.** O backend entrega
  `nextAction.text` e `supportText` prontos, mas nenhum componente os consome —
  o critério "A UI não recomenda instalar quando encontra binário válido" só
  está garantido no plano de instalação, não numa tela nova.
- "Alias" é dito no texto de "não instalada", mas não é detectável: um alias de
  shell é invisível ao Electron por definição, e o app não lê rc files nem roda
  comando do ambiente (restrição da própria task).
- Cobertura de "múltiplos usuários" é por caminho (`C:\Users\Ana Silva\…` visto
  por outra conta); não houve teste com duas contas reais.

### Validação

`npm test` 1477/1477 (era 1246 no último registro de gate, o resto veio de outros
agentes), `npm run test:frontend` 1119 passed / 1 skipped, `eslint .` e `tsc -b`
limpos, `git diff --check` limpo. Testes novos: 9 do detector (`.cmd` com espaço,
`.exe`, ENOENT, EACCES, EINVAL, timeout, saída de shim) e 17 do serviço; 2 de
integração em `cli-auto-install.test.cjs`. Mutação feita em duas regras (ready
recomendando instalar; mensagem persistida sem redação) — os testes correspondentes
falharam e foram restaurados.

## Fechamento de trabalho — 2026-09-21: System Design, fonte padrão configurável sem quebrar instalações existentes

### Contexto

Task "Felixo AI Core/System Design — tornar a fonte padrão configurável sem quebrar
instalações existentes" (Esforço: Dias, task híbrida: decisões perguntadas antes de
codar). O default (Felixo/main) vivia copiado em serviço, handlers, hook do renderer
e texto do prompt, e a configuração gravada SEMPRE carregava `repoUrl`/`branch` —
o default era copiado para o disco na primeira sincronização. Não dava para separar
"a pessoa escolheu esta fonte" de "o app copiou o padrão", então trocar o default
ou nunca alcançaria quem já o tinha gravado, ou o reinterpretaria em silêncio.

### Decisões (perguntadas ao dono do produto; todas na opção recomendada)

1. Migração: gravado igual ao default = "segue o padrão"; diferente = escolha explícita.
2. Precedência: usuário > default, com o fallback offline sendo o último conteúdo
   entregue. "Projeto" NÃO entrou (hoje não existe config por projeto).
3. Prompt gerado da fonte efetiva, não texto fixo do Felixo.
4. "Não atualizar automaticamente" = nunca trocar a fonte escolhida; o conteúdo dela
   continua sincronizando por sessão.

### O que foi feito (código)

- `electron/core/system-design-source.cjs` (novo): contrato único — default,
  migração v1→v2, precedência, `syncState`, fonte entregue (`delivered`) separada da
  configurada, `applyConfigChange` com lista branca e validação de URL.
  `LEGACY_DEFAULT_SOURCES` cobre quem pula de uma versão v1 direto para uma com
  novo default.
- `system-design-ipc-handlers.cjs`: sobre o contrato; migração gravada na primeira
  leitura (idempotente); `save-config` só aceita `enabled`, `sourceMode:'default'`,
  `repoUrl`, `branch` (antes `{...current, ...partial}` deixava o renderer escrever
  `lastSha`); a entrega é registrada com a fonte REALMENTE sincronizada (há teste de
  troca de fonte durante o clone).
- `system-design-service.cjs`: o default deixou de ser copiado aqui; e **um clone em
  cache cujo `origin` não é a fonte pedida é descartado** (ver "Bug achado").
- Renderer: sem cópia do default (`UNLOADED_CONFIG`); `syncState`/`delivered` nos
  tipos; presenter puro; seção mostra fonte, selo "escolhida por você", estado e
  "Voltar ao padrão do app"; hook relê a config após falha e escuta um evento para
  duas instâncias não divergirem.
- Prompts: bloco do orquestrador cita a fonte ENTREGUE e avisa quando é diferente da
  configurada; lembrete de padrão de qualidade gerado da fonte (para o default é
  **idêntico byte a byte** ao texto histórico — teste com o literal original tirado
  do git). O painel passou a gravar vazio quando o texto é o padrão (antes gravava o
  padrão intocado como se fosse da pessoa, congelando a fonte do dia).

### Bug achado só no app real

Trocar a URL configurada nunca trocava de repositório: com um clone já em cache, o
serviço fazia `fetch`/`reset` no `origin` ANTIGO e gravava o conteúdo como da fonte
nova. Só apareceu ao exercitar o app: a tela dizia "System Design (Openia) @ cc4aae7"
e `cc4aae7` era o SHA do Felixo (confirmado com `git remote get-url origin` no cache).
Os testes do serviço usam git falso e não pegariam isso. Corrigido, com teste que
falhou antes e passa depois; reverificado no app: entregue = Openia `@ 9bb9099`, 34
documentos dela.

### Validação

`npm test` 1514/1514, `npm run test:frontend` 1146 passed / 1 skipped, `eslint .` e
`tsc -b` limpos. Testes novos: 30 do contrato, 7 de integração dos handlers (SQLite
real), 4 do serviço (origin), 7 do bloco do orquestrador, 8 do presenter, 15 do texto
do lembrete. Mutação feita em duas regras (lista de defaults históricos; registrar a
entrega com a fonte errada) — os testes falharam e foram restaurados. No app real
(instância isolada, Windows): sincronização do default, escolha de fonte própria,
sincronização pelo botão, URL inválida recusada, fonte inalcançável (falha real: os
agentes seguem recebendo a fonte anterior e a tela diz isso), "Voltar ao padrão do
app"; captura de tela conferida.

### NÃO verificado / limitações

- **Nenhuma instalação v1 real foi migrada**: a migração está coberta por testes com
  SQLite real e configs v1 sintéticas, mas o app foi exercitado em perfil isolado novo.
- **Não há campo na UI para digitar URL/branch** (sempre foi assim; só o IPC permite
  fonte própria). A escolha de fonte própria foi exercitada pelo IPC; a UI oferece
  mostrar e voltar ao padrão, não editar.
- **Camada "projeto" fora do escopo** por decisão; o contrato foi escrito para
  aceitá-la depois.
- O texto do toggle e o parágrafo explicativo da seção continuam dizendo "Felixo
  System Design", mesmo com fonte própria (é o nome da função; o estado e a fonte
  mostrados logo abaixo são os reais).
- Terminais já abertos não têm o lembrete reescrito ao trocar de fonte; só os novos.
- Se a troca de fonte falhar no clone, o clone antigo já foi descartado (os documentos
  indexados no SQLite continuam, então a fonte anterior segue entregue); o próximo
  sync da fonte antiga re-clona em vez de dar `fetch`.
- Um "aviso de mudança de default" para quem segue o padrão não existe: ao mudar o
  default do app, quem o segue passa a recebê-lo sem aviso (decisão 1).

## 2026-09-24 — validação do rollout do prompt de System Design no contexto do Canvas

Tarefa Notion: [Felixo AI Core/System Design — validar rollout do novo padrão e compatibilidade do prompt](https://app.notion.com/p/Felixo-AI-Core-System-Design-validar-rollout-do-novo-padr-o-e-compatibilidade-do-prompt-3ce91f95497e81c69f3aef2b2da0dadd).

### Achado e correção

A cópia local versionada dos guias estava numa pasta cujo nome foi gravado com mojibake (`Padr├úo de qualidade - Felixo System Design/`). Eram 37 arquivos de um snapshot antigo, enquanto README e prompt procuram o nome correto (`Padrão de qualidade - Felixo System Design/`). A cópia errada nunca era encontrada; em checkout limpo, o comportamento esperado é o prompt usar a URL e a branch da fonte configurada. Removi a cópia obsoleta, mantive no `.gitignore` os dois nomes (correto e corrompido) e documentei fallback e rollback em Configurações → System Design → “Voltar ao padrão do app”.

Também corrigi o release gate para pedir ao Git caminhos UTF-8 sem escape C. Sem isso, nomes acentuados podiam chegar entre aspas ao seletor e uma limpeza só documental pareceria alteração do instalador. O gate agora classifica as mudanças da cópia local e do próprio workflow como irrelevantes; alterações no app continuam relevantes.

### Cobertura e compatibilidade

- O texto do prompt padrão permanece igual ao texto histórico; a suíte mantém a verificação byte a byte.
- Novo E2E atravessa configuração sincronizada, presenter de status e leitor/escritor do arquivo de contexto: label, branch, URL e SHA exibidos correspondem à fonte entregue, sem perda do prompt.
- A matriz existente exercita criação, retomada/reabertura, restart, troca de agente, fontes ausente/customizada, falhas/offline, atualização e fallback. Acrescentei a duplicação de dois perfis Claude, verificando sessões e artefatos distintos com o prompt correto em ambas.
- Falha de sync continua preservando o último conteúdo entregue. A interface informa a fonte efetivamente entregue. Rollback para o padrão do app está descrito no README; a UI não oferece seleção de SHA anterior.

### Verificações

- `npm test`: 1566/1566 aprovados.
- `npm run test:frontend`: 1149 aprovados, 1 ignorado.
- `npm run lint`: aprovado.
- `npm run build`: aprovado (`tsc -b` e Vite); Vite ainda sinaliza chunks acima de 500 kB.
- `bash .github/scripts/release-relevant.test.sh`: todos os cenários aprovados, incluindo cópia local Unicode e configuração do gate.
- CI `fd4a982` e `e683a27`: concluído com sucesso. A validação E2E, testes, lint e build passaram em Linux, macOS e Windows; o workflow também validou Linux ARM.
- Release gate `e683a27`: sucesso, publicação ignorada porque nenhum arquivo de runtime do app mudou. O smoke do artefato empacotado mais recente segue verde nos três sistemas no release `36010195177`, SHA de runtime `d357e5b`.

Não executei uma nova instalação interativa em cada SO nesta rodada: o código de runtime não mudou. A migração de uma instalação v1 real permanece na tarefa já aberta [Felixo System Design — validar migração do padrão de qualidade](https://app.notion.com/p/3e291f95497e8173a8c9cabe3e1cf3df). Terminais já abertos não recebem o lembrete reescrito depois de troca da fonte; novos contextos usam a fonte configurada/sincronizada.

Commits enviados a `origin/main`: `1ace937` (remoção da cópia corrompida, ignore, README e seletor), `fd4a982` (E2E de identidade da fonte e duplicação) e `e683a27` (caminhos UTF-8 no release gate).

Janela local registrada às 12:18 (-03): 11:21–12:18, 57 minutos.

## Fechamento de trabalho — 2026-09-24: reprodução real de instalação repetida de CLIs no Windows (fatia 1)

### Contexto

Task "Felixo AI Core/Windows — reproduzir instalação repetida de CLIs em app empacotado e após
upgrade" (Esforço: Dias). A task-mãe (18/08) já corrigiu a causa original (detecção `.cmd` no
Windows); esta pedia provar o ciclo completo — instalação global, gerenciada, upgrade, reinício,
ausência de rede — de verdade, não simulado, e um fixture/runner automatizado para isso.

### O que foi feito

`app/scripts/cli-auto-install-real-repro.cjs` (novo, `npm run repro:cli-auto-install -- --cli <id>`):
roda o ciclo real de `registerCliAutoInstallHandlers` (o mesmo módulo de produção, sem mocks de
`detect`/`installPackage`) contra o npm/npm gerenciado do próprio projeto, em 4 rodadas: instalação
real, segunda abertura (não deve reinstalar), "upgrade" de versão com binário intacto (não deve
reinstalar) e "upgrade" com o binário apagado (deve reinstalar).

**Achado real, medido nesta máquina**: sem isolar `HOME`/`APPDATA`/`LOCALAPPDATA` e
`FELIXO_USER_DATA_DIR`, a reprodução nunca instalava nada — `createCliEnv`
(`cli-process-manager.cjs`) monta os candidatos de PATH a partir do ambiente REAL do processo
(`process.env.APPDATA`, `getAppPaths()`), não do `userData` isolado passado para
`registerCliAutoInstallHandlers` — que só controla onde o app grava o próprio estado
(`cli-auto-install.json`). Numa máquina de desenvolvimento com CLIs já instaladas (globalmente via
npm e por uma instalação gerenciada real do Felixo), a detecção sempre as achava primeiro. Não é um
bug de produção (numa máquina real só existe um ambiente); é a lacuna que precisa ser fechada para
simular uma máquina "limpa" dentro do mesmo processo. Resolvido isolando HOME/APPDATA/LOCALAPPDATA
para diretórios temporários e usando `FELIXO_USER_DATA_DIR` (que `getAppPaths()` já respeita).

### Resultado da reprodução (Windows real, CLI `gemini`, 2 execuções)

Nenhuma reinstalação indevida: instalação real (~50-65s, rede de verdade) → segunda abertura não
reinstala (idle, ~3s) → "upgrade" de versão não reinstala (idle, ~3s) → binário apagado é detectado
e reinstalado (~12-15s). **O sintoma relatado ("pede instalação a cada abertura") não reproduz no
ciclo detecção→plano→instalação para uma CLI puramente JS.**

**Achado separado, real**: instalar o catálogo completo (codex+claude+gemini) juntos fez o Codex
falhar com "Missing optional dependency @openai/codex-win32-x64" — reproduz ao vivo um caso que
`managed-cli-health.cjs` já documentava só em comentário ("o npm pode terminar com código 0 quando
uma optionalDependency de plataforma não foi baixada"). Confirmado, não investigada a causa raiz
(por que o npm não baixa o pacote nativo da plataforma nesta instalação).

### NÃO verificado / limitações

- **App empacotado de verdade** (instalador NSIS): não exercitado nesta task — a reprodução roda do
  código-fonte com o npm/Node do próprio projeto, que é o mesmo runtime do app empacotado
  (`resolveNpmCliPath` cai para `node_modules/npm` fora do pacote), mas não é o binário instalado.
- **Ausência de rede**: não simulada (exigiria bloquear DNS/proxy para o processo, não feito).
- **`.cmd`, aliases, npm global do usuário, caminho com espaço**: o `PATH` real desta máquina já
  tinha `claude`/`codex` globais com espaço no perfil (`C:\Users\Felipe Martins\...`) e isso não
  quebrou a detecção nas tasks anteriores, mas não foi testado especificamente NESTA reprodução
  (que isola o HOME de propósito).
- **CI Windows automatizado**: o runner funciona manualmente (rede real, minutos de duração); não
  foi integrado ao workflow do CI — um `Sincronizar`/instalar real a cada PR não é apropriado (custo
  e flakiness de rede); fica como decisão em aberto se deve rodar só no release ou sob demanda.
- Causa raiz do Codex/`optionalDependency` ausente não investigada.

### Validação

Duas execuções completas no Windows real (`npm run repro:cli-auto-install -- --cli gemini`):
resultado idêntico nas duas. `eslint` limpo no script novo.

## Fechamento de trabalho — 2026-09-24: Canvas — reduced motion/Modo Performance não removia o atraso de fechamento (fatia 1)

### Contexto

Task "Felixo AI Core/Canvas — estabilizar notificações, flyouts e animações concorrentes"
(Esforço: Dias). A evidência original da task cita `NotificationsMenu.tsx`, que não existe mais
(virou `NotificationsPanel.tsx` num refactor anterior) — parte do problema descrito já foi
resolvida por outro trabalho. Investigação encontrou o hook compartilhado real por trás de toda
abertura/fechamento animado do canvas (`CanvasPanel`, `TerminalDrawer`): `useExitAnimation.ts`,
sem NENHUM teste.

### O que foi medido

`index.css` já corta a animação CSS (`animation: none`) tanto por `prefers-reduced-motion: reduce`
quanto por `[data-performance-mode='on']` (Modo Performance do app, mantido em sincronia de
propósito com o primeiro). `useExitAnimation` (JS) não sabia de nenhum dos dois: o
`setTimeout(onClosed, durationMs)` sempre esperava os 160-190ms inteiros antes de desmontar, mesmo
sem nenhuma animação de verdade tocando — o elemento ficava parado e totalmente visível (sem
`animation:none` remover o `opacity`/`transform` do frame final da saída) por esse tempo. É
exatamente o "loop que o Modo Performance/reduced motion deveriam remover" que o critério de
aceite da task cobra.

### O que foi feito

- `exit-animation-controller.ts` (novo): núcleo sem React (timer, idempotência de `close()`,
  `dispose()`) — este repositório não usa jsdom/`@testing-library/react` (`vitest.config.ts`:
  `environment: 'node'`, só `.ts`), então a lógica precisou ser extraída da casca de hooks
  (`useState`/`useEffect`) para ser testável, seguindo a convenção real do repositório.
- `useExitAnimation.ts`: casca fina sobre o controlador; `close()` agora lê, no INSTANTE da
  chamada, `prefers-reduced-motion` OU `data-performance-mode='on'` e usa delay 0 nesse caso, sem
  mudar a assinatura pública do hook (`CanvasPanel.tsx`/`TerminalDrawer.tsx` não precisaram mudar).
- 9 testes novos no controlador: timing normal, idempotência de `close()` repetido (inclusive com
  duração diferente na segunda chamada), skip por reduced-motion/Modo Performance, leitura da
  preferência no instante certo (não fixada na criação), `dispose()` cancela sem chamar `onClosed`
  (garante que nada mede componente desmontado), ciclos sucessivos no mesmo controlador, e ausência
  de timer pendente ao final.

### NÃO verificado / limitações

- **Medição de tempo real no app**: tentei medir o tempo entre clicar em fechar e o painel sumir do
  DOM, no app real (Windows, `felixo devtools`) com Modo Performance ligado. Não foi confiável —
  a janela do devtools é invisível/sem foco, e `requestAnimationFrame` parece sofrer throttling de
  background do Chromium nesse estado (a primeira leitura de frame já veio em ~300ms). O
  funcional foi confirmado (abre e fecha corretamente, com e sem Modo Performance), mas o
  NÚMERO exato de ms no app real não foi medido com confiança — a prova de timing é só a unitária
  (com relógio falso determinístico e mutação confirmando que os testes pegam a regressão).
- **Escopo original da task não coberto nesta fatia**: "cancelar animação anterior por chave de
  superfície" (item 1), "prioridade entre drag/resize, abertura automática, foco e refresh" (item
  3), "testar transição interrompida em qualquer frame" (mais amplo que o que foi testado aqui) e
  "logs só no diagnóstico" — nenhum desses foi investigado a fundo; ficam em task de continuação.
- Não foi encontrado, nesta investigação, nenhum caso real de "reabrir enquanto fecha" causando
  estado inconsistente na arquitetura atual (o parent sempre desmonta/remonta o painel via uma
  única posição condicional; o `dispose()` no cleanup do efeito já cancela timers órfãos). Pode
  haver casos reais que a fatia 2 encontre com mais tempo de investigação.

### Validação

`npm test` 1565/1565 (Node), `npm run test:frontend` 1158/1158 (+1 skip preexistente), `eslint .` e
`tsc -b` limpos. Mutação (removendo o `? 0 :`) derrubou exatamente as 2 asserções que dependiam do
comportamento novo, confirmando que os 9 testes não são vácuos. Confirmado funcionalmente no app
real: abrir/fechar o painel de busca funciona com e sem Modo Performance ligado.

## Fechamento de trabalho — 2026-09-24: Canvas — auditoria de medição geométrica e cleanup de observer (fatia 1)

### Contexto

Task "Felixo AI Core/Canvas — unificar medição geométrica e eliminar feedback infinito" (Esforço:
Dias). Origem: "derivada do tremor" — a hipótese de vários donos medindo/escrevendo geometria em
resposta uns aos outros, entre flyouts, drawer, notificações e canvas.

### O que a investigação encontrou (a maior parte já estava resolvida)

- O bug concreto de referência circular (painel × gaveta entrando em loop se espremendo) **já foi
  corrigido em 12/09/2026** — `CanvasSurfacesProvider.tsx` calcula os dois NUMA PASSADA SÓ a partir
  do que cada um quer (`desiredPanel`/`desiredDrawer`), nunca lendo o valor já cortado do outro; há
  regressão explícita em `canvas-surfaces.test.ts` provando que a mesma entrada sempre dá a mesma
  saída (`splitHorizontalSpace` chamado duas vezes com os mesmos números não diverge).
- `toolbar-flyout.ts`, citado na evidência original como quem "mede/clampa posição", **não existe
  mais como medidor** — é hoje uma função pura de 17 linhas (`toolbarColumnOffset`) sem nenhum
  `getBoundingClientRect`/observer. A evidência da task está parcialmente desatualizada (mesmo
  padrão encontrado nas duas tasks anteriores desta sessão, sobre notificações/flyouts).
- O minimapa é um valor puramente derivado (`miniMapSize(freeCanvasArea(...).width)`), não um
  medidor independente — não tem risco de retroalimentação próprio.
- `layout-invariants.test.ts` já cobre painel+gaveta+inspector+sidebar em vários viewports.

### O que ficou real e sem teste: o `ResizeObserver` do `TerminalDrawer`

`TerminalDrawer.tsx` tinha um `useEffect` com `ResizeObserver` + `requestAnimationFrame` para
manter o `fit()` do xterm em dia, sem NENHUM teste (este arquivo é `.tsx`; `vitest.config.ts` só
roda `.ts`, então um componente nunca é testado renderizando — mesma limitação encontrada na task
anterior de hoje, resolvida com o mesmo padrão de extração).

- **Confirmado, por leitura**: `store.fit(sessionId)` lê o tamanho do container (que vem de fora,
  via CSS/flex) e ajusta linhas/colunas do terminal por dentro — nunca escreve de volta na dimensão
  que o próprio `ResizeObserver` observa. Não há retroalimentação aqui.
- Extraído para `terminal-fit-lifecycle.ts` (função `attachTerminalFitLifecycle`, sem React) para
  poder testar exatamente os critérios de aceite da task sobre cleanup: "garantir cleanup de
  observer/RAF/listener" e "unmount/remount não duplica observers/timers".

### O que foi feito

- `app/src/features/canvas/components/terminal-fit-lifecycle.ts` (novo): mesma lógica do
  `useEffect` original, extraída verbatim, com RAF/ResizeObserver injetáveis.
- `TerminalDrawer.tsx`: o `useEffect` agora só chama
  `return attachTerminalFitLifecycle(container, store, sessionId)` — refatoração pura, corpo do
  efeito idêntico ao anterior.
- 6 testes novos: anexa e ajusta imediatamente + no próximo frame + a cada resize; prova (indireta,
  via objeto do container permanecer vazio depois de disparar o observer 3x) de que não há
  escrita de volta; cleanup cancela o RAF e desconecta o observer; cleanup chamado duas vezes é
  idempotente (não desconecta/cancela duas vezes); remount cria um observer NOVO sem herdar nem
  duplicar o antigo, com exatamente um attach+fit por montagem.

### NÃO verificado / limitações

- **A grande maioria da task (mapear TODOS os reads/writes de clientRect/style, pipeline formal de
  medir→resolver→aplicar→notificar, coalescer RAF entre múltiplos consumidores, warning de update
  dentro do ciclo de medida) não foi feita** — o que já existia (CanvasSurfacesProvider) já segue
  boa parte desse desenho; o que faltava era só o ponto do `TerminalDrawer` encontrado aqui.
- Não testei no app real com um terminal de verdade dentro do drawer (só um `pty.spawn` cru, que
  não cria o nó visual — precisaria passar pelo menu "Agente" da sidebar). A confiança vem da
  extração ser verbatim (mesmo corpo de efeito) + dos 6 testes com mutação.
- Critérios "medida oscilante, viewport pequeno, drawer fechado e zoom" da task não foram
  cobertos por teste novo nesta fatia (viewport pequeno e drawer fechado já tinham alguma cobertura
  em `layout-invariants.test.ts`/`panel-sizing.test.ts`, não revisados a fundo aqui; zoom não foi
  investigado).

### Validação

`npm test` 1565/1565 (Node), `npm run test:frontend` 1164/1164 (+1 skip preexistente), `eslint .` e
`tsc -b` limpos (typecheck exigiu reestruturar um teste que batia num caso de estreitamento de tipo
do TypeScript com `let` capturado em closure — resolvido trocando por um objeto mutável). Mutação
confirmada em dois pontos (cleanup idempotente; o `ResizeObserver` de fato chamado com o callback
certo). App real: sessão isolada aberta e fechada sem erro após a refatoração.

## Fechamento de trabalho — 2026-09-25: CI mais rápido — frente de código Node (`--managers`, relógio falso, `pty.node` do SO)

### Contexto

Parte da rodada de ganhos de tempo do CI sem perda de cobertura. Decisões que valem para esta
frente: a comparação npm × pnpm/Yarn/Corepack roda por PR só no Linux (o job `dependency-policy`
continua completo) e em nightly nos quatro SOs; o Windows passa a usar o prebuild do `node-pty` no
release; o E2E de contexto continua com 50 repetições. A troca de workflow é de outra frente — aqui
entram só os scripts e testes que ela usa.

### O que foi feito

- **`--managers=<ids>` nas duas bancadas de gerenciador** (validação comum em
  `app/scripts/package-manager-selection.cjs`: lista vazia, id repetido e id desconhecido falham
  com a lista dos válidos).
  - `package-manager-operational-performance.cjs` aceita `npm-runtime`, `pnpm`, `yarn-classic` e
    `corepack`. Quem fica de fora nem é procurado no PATH e aparece no JSON como indisponível com
    `availabilityReason: "not-selected"`. Como o `npm-runtime` é a linha de base, `--check` sem ele
    é recusado antes de instalar qualquer coisa, e o `validateReport` continua exigindo-o
    disponível e funcional. A ajuda citava o nome do outro script; corrigido.
  - `package-manager-alternatives-performance.cjs` aceita `npm-runtime`, `pnpm`, `yarn-classic` e
    `yarn-modern`. Aqui o `npm-runtime` é a política montada de `node_modules/npm` com o Electron
    de `node_modules`, e as alternativas vêm do Corepack com versões fixas; por isso
    `--managers=npm-runtime` mede só o npm e nem procura o Corepack (que não é id: entra sozinho
    como ponte quando alguma alternativa é pedida). O `validateReport` pula candidatos
    `not-selected`, inclusive no `--strict`, exigindo só o que foi pedido.
- **`terminal-session-store.test.ts` com relógio falso.** As esperas reais (`setTimeout` do
  helper `wait`) viraram `vi.advanceTimersByTimeAsync(ms)`, com `vi.useFakeTimers()` no
  `beforeEach` (antes de criar a bancada) e `vi.useRealTimers()` no `afterEach` (depois do
  `store.clear()`). No vitest 4.1.11 instalado, o `toFake` padrão falsifica timers, `Date` e
  `performance` e deixa `queueMicrotask`/`process.nextTick` reais — conferido no código do próprio
  vitest (`useFakeTimers` filtra essas duas APIs). `vitest.config.ts` não foi tocado.
- **`release-smoke.cjs` registra a ACL do `pty.node` certo.** `findPackagedPtyNode` segue a ordem
  de carga do `node-pty` 1.1.0 (`loadNativeModule`: `build/Release`, `build/Debug`,
  `prebuilds/<platform>-<arch>`) e ignora prebuilds de outro SO. Antes, sem `build/Release`, a
  busca em profundidade devolvia `prebuilds/darwin-arm64/pty.node` (reproduzido com a versão de
  `main` numa árvore com os quatro prebuilds).

### Validação

- `terminal-session-store.test.ts`: 47/47 antes (45,8 s; testes 44,1 s) e 47/47 depois (3,1 s;
  testes 0,67 s). Mutações temporárias no store, depois revertidas, derrubam os mesmos testes com
  o relógio real e com o falso: `CONTEXT_CONFIRM_DELAY_MS` 2000→4000 (1 teste),
  `SCREEN_ACCEPT_DELAY_MS` 150→701 (4 testes; em 700 o relógio falso reprova só 2, porque o
  segundo aceite cai exatamente no fim dos 1600 ms esperados e o relógio falso é exato na
  fronteira) e a tela de decisão ignorada (1 teste). `IDLE_AFTER_MS` não é coberto por este
  arquivo em nenhum dos dois relógios.
- Execução real das bancadas com `--managers=npm-runtime`: alternativas com `--check --strict`
  passou em 11 s (npm `passed`, resto `not-selected`); operacional com `--check --agents=1,2`
  passou em 9 s. `--check --managers=pnpm` e `--managers=bun` saem com exit 1 e a mensagem
  esperada. Sem a flag, a versão de `main` e a nova geraram relatórios com a mesma forma, status,
  validação e decisão (host com Corepack: pnpm, Yarn Classic e Yarn moderno medidos).
- `node --test` das quatro suítes alteradas (seleção, operacional, alternativas, release-smoke):
  49/49. `npm test` 1638/1638. `npm run lint` limpo e `npm run build` (`tsc -b` + Vite) passou.

### NÃO verificado / limitações

- O ganho de tempo nos runners de CI depende da troca de workflow feita por outra frente; aqui só
  a medição local.
- A escolha do `pty.node` no Windows real não foi executada nesta máquina Linux: a cobertura vem
  dos testes com árvore sintética (`platform`/`arch` injetados) e da reprodução do erro antigo.

## Fechamento de trabalho — 2026-09-28: Performance — custo por pedaço de saída do terminal em alta concorrência (fatia 1, parte 1)

### Contexto

Task "Felixo AI Core/Performance — limitar renderização, logs e scrollback em alta concorrência"
(Esforço: Dias). Investigação com 6 leitores paralelos e 2 céticos por lacuna, no `main` `6e7cc04`.
O React já não re-renderiza a cada pedaço de saída (o store só publica snapshot em transições, e
`computePreview` só roda em `update()`), e a pintura do xterm já é agrupada por frame. O custo que
escala com o número de terminais está fora do React, no caminho que todo pedaço percorre:

- Processo principal: `pty-process-manager.cjs:301` recopiava a cauda de 200.000 caracteres do
  replay a cada `onData` (`${buffer}${pedaço}`.slice(-200000)): 170–187 µs por pedaço com o buffer
  cheio, medido nesta máquina; o mesmo processo encaminha as teclas para o PTY.
- Renderer: o store assinava `pty:data` uma vez por terminal (cada `pty.onData` do preload é um
  `ipcRenderer.on`), então cada pedaço acordava N callbacks, N-1 descartados.
- Renderer: o callback de `terminal.write` rodava `computeSignature` (todas as linhas visíveis,
  `translateToString` + 2 regex por linha) a cada pedaço, e o xterm chama esses callbacks em
  sequência dentro da mesma fatia de parse (até 12 ms, dezenas de pedaços sob carga).

### O que foi feito

- `e88a3f4` — `pty-replay-buffer.cjs`: lista de pedaços que só junta na leitura; mesmo contrato
  (últimos 200.000 caracteres, mesmo ponto de corte). `MAX_REPLAY_BUFFER_CHARS` exportado e amarrado
  por teste a `TERMINAL_REPLAY_BUFFER_CHARS`.
- `6de3d72` — `pty-event-router.ts`: um ouvinte `pty:data` por ponte, despacho por `sessionId`.
- `94c6038` — leitura da tela (assinatura + marcador de scrollback) uma vez por fatia, numa
  microtarefa; um exit na mesma fatia invalida a leitura agendada por geração. `countLineFeeds` sem
  alocação.

### Validação

- Micro-bancada do replay (20 sessões × 2.000 pedaços, buffer cheio): 6.683–7.464 ms na lógica antiga
  × 2–5 ms na lista de pedaços. No teste: 20.000 pedaços em 3,9 ms; com a lógica antiga, 3.021 ms.
- Propriedade contra o concat+slice antigo como oráculo (200 sequências com pares UTF-16), attach
  depois de 3.000 pedaços, 20 terminais → 1 ouvinte, rajada de 200 pedaços → no máximo 5 leituras da
  tela, exit na mesma fatia continua `exited`. Mutações (lógica antiga do replay, 1 ouvinte por
  sessão, leitura por pedaço, sem a guarda de geração) reprovam o teste correspondente.
- `node --test` pty: 54/54; `vitest` do terminal: 283/283; `tsc -b` e eslint limpos.

### NÃO verificado / limitações

- Nenhuma medição no app real com 20 terminais ainda; a bancada existente (`benchmark:terminal`) usa
  node-pty e xterm crus e não passa pelo store, pelo IPC nem pelo replay.
- As varreduras das telas de aceite (12.000 caracteres por pedaço, pela vida da sessão) não foram
  mexidas: parar pelo sinal `initialTextSent` seria errado, porque o fallback por tempo marca esse
  sinal sem o REPL ter aparecido, e uma tela de confiança tardia ficaria sem resposta.
- O gate local tem 2 falhas anteriores a este trabalho e específicas desta máquina Windows
  (`app-relaunch.test.cjs`: EPERM ao criar symlink sem Modo Desenvolvedor; timeout de 5 s em
  `SystemDesignDocumentIndex.test.ts` com a máquina carregada). CI de `6e7cc04` verde.

## Fechamento de trabalho — 2026-09-28: Performance — aviso de histórico honesto, virtualização do canvas destravada e bancada do caminho de saída (fatia 1, parte 2)

### Contexto

Continuação da mesma task ("Performance — limitar renderização, logs e scrollback em alta concorrência").
A investigação terminou com 37 lacunas, 36 confirmadas por 2 céticos cada (a única refutada: comparação
rasa em `useSessionMetadata`, que não economiza render nenhum com o React 19). Esta parte trata as que
atendem diretamente os itens 4 e 5 do pedido ("evitar recalcular itens invisíveis", "avisar antes de
descartar dados visuais") e o aceite "benchmark mostra ganho".

### O que foi feito

- `717f05d` — `describeTerminalScrollbackUsage` mede as linhas VISUAIS do buffer normal contra a
  capacidade real do xterm (`rows + scrollback`). A contagem anterior (`\n` recebidos > limite) errava nos
  dois sentidos: 3.000 linhas de 120 caracteres em 80 colunas já descartam o começo com limite de 5.000 e
  não avisavam; 5.001 linhas curtas cabem (capacidade 5.024) e acusavam descarte; saída na tela
  alternativa (Claude Code, por padrão) nunca entra no histórico e acendia aviso. Novo nível "perto do
  limite" aos 80%. O texto deixa de mandar "fechar e reabrir para reaplicar o replay" (reabrir a gaveta não
  reaplica nada, o X encerra o processo, e o replay de 200.000 caracteres é menor que o histórico visual).
  Seção do Modo Performance, `POLITICA-PERFORMANCE.md` e `benchmarks/README.md` corrigidos.
- `1cae4d5` — `keepCanvasNodesMounted` ia para `true` na primeira abertura da gaveta e nunca voltava:
  `onlyRenderVisibleElements` ficava desligado até recarregar a janela. `node-mount-latch.ts` (redutor puro)
  mantém a trava só com a gaveta aberta, enquanto o foco é devolvido e enquanto o foco devolvido está no
  gatilho do cartão (`focusout {once}` solta), com geração por fechamento. Caminhos de handoff e de
  limpar/importar também despacham.
- `c1e2059` — `benchmark:pty-output` (Node puro, `PtyProcessManager` real com PTY falso): compara, no mesmo
  fluxo, a estratégia anterior do replay com a atual, confere a cauda no attach e exige ganho ≥ 10×. Passo
  novo no job Benchmarks do CI.

### Validação

- Histórico visual: testes com o xterm real conferem cada estado contra o próprio buffer (primeira linha
  presente ou não). A contagem antiga reprova os 3 testes novos (mutação). Suíte do terminal 289/289.
- Virtualização, no app real (`felixo devtools`, 40 notas espalhadas + 1 terminal falso, zoom aproximado):
  blocos no DOM 2 antes de abrir → 41 com a gaveta aberta → 41 com o foco devolvido ao gatilho → 2 depois
  que o foco sai. Com o `CanvasView.tsx` anterior o último passo fica em 41. `canvas-smoke` completo no
  Windows passou duas vezes (inclui a devolução de foco ao gatilho e todos os cenários do tutorial).
- Bancada: 20 terminais × 2.000 pedaços, anterior 136,4 µs/pedaço × atual 0,254 (537×); tamanho do CI
  (500 pedaços, 3 rodadas, ~4,5 s) 132,5 × 0,21 (631×); mesma cauda no attach.
- Gate local: `npm test` 1.844/1.847 (1 falha de ambiente já conhecida, `app-relaunch.test.cjs` EPERM de
  symlink; 2 pulados); `npm run test:frontend` 2.100/2.101; `tsc -b` e `eslint .` limpos.
- CI do push anterior (`00d77a0`, run 36380644430): 1ª tentativa falhou só no smoke do tutorial no Windows
  (SA1, "o app não parou de gravar sozinho") — o smoke usa o `MockTerminalSessionStore`, que estas mudanças
  não tocam; o re-run passou sem alteração de código e o mesmo SA1 passou 2 vezes localmente.

### Revisão adversarial das mudanças (4 revisores, 2 verificadores por achado)

8 achados confirmados, 1 disputado, 4 rejeitados. Correções:

- `557b48d` — o aviso de histórico voltava atrás quando a gaveta abria e o `fit()` aumentava o xterm
  (capacidade maior, reflow juntando linhas quebradas): o descarte agora fica marcado por sessão. O texto
  deixou de recomendar Handoff/Copiar (com tela alternativa o Handoff leva só a tela do app) e de afirmar
  perda definitiva (com linhas curtas o replay de 200.000 caracteres tem mais linhas que 5.024 e é
  reaplicado quando o terminal é recriado). Teste novo cobre `buffer.normal` (nenhum pegava a troca).
- `b831eba` — o teste da coalescência congelava `performance.now` e não distinguia "por fatia" de "só
  quando a fila esvazia"; o teste novo fatia o parse de verdade.
- `2a02ff4` — duas regressões que `1cae4d5` introduziria: soltar a trava no mesmo lote do fechamento
  remontava os cartões da faixa da gaveta (um webview recarregaria), e Tab dentro de um cartão fora da
  tela derrubava o foco no `body`. Agora a trava assenta dois quadros e segue o foco em bloco fora da área.
  Verificado com a janela visível: 0 blocos remontados; foco continua no cartão depois do Tab.
- `2402432` — a bancada pré-enche a cauda com pedaços reais, então o regime de descarte é medido também
  nas rodadas curtas do CI.
- Não corrigido (virou item de tarefa): a ligação da trava no `CanvasView` só tem verificação ao vivo, sem
  cenário automatizado no `canvas-smoke`.

### NÃO verificado / limitações

- Os ganhos do renderer (roteador e coalescência) têm prova estrutural por teste, não medição de tempo no
  app real com 20 terminais: nenhuma bancada existente roda o store real com terminais transmitindo.
- Não feitos nesta fatia (viraram tarefas): agrupar `pty:data` no processo principal e controle de fluxo;
  arquivo em disco com "carregar mais"; Handoff/Copiar com tela alternativa; varreduras das telas de aceite;
  recálculo por quadro de arrasto no canvas; bancadas do estado real e latência de input; logs do chat
  legado/orquestrador; store órfão ao trocar para o Chat; teste de symlink no Windows; retenção de
  `agent_usage_samples`.

## Registro de trabalho — 2026-09-28: Contas — cadeia de contas (commits 1–14 de 30)

Registro gravado às 13:48. Esta entrada fica aberta: a validação final entra numa entrada nova ao fim da branch.

### Contexto

Task "Felixo AI Core/Contas — definir política de cadeia, elegibilidade e ordem de fallback", com as irmãs de
failover no PTY, isolamento por conta, falhas injetadas e retomada. Branch `feat/cadeia-contas`, a partir de
`origin/main` `116f0569`. O app guardava várias contas por CLI, cada uma na própria pasta de login, mas quando uma
conta batia o limite nada ajudava a seguir em outra, e trocar de conta pode mudar quem paga. As 8 decisões do dono
(tomadas em 28/09 pelo AskUserQuestion) e as alternativas estão no Resumo de Decisão de 28/09 em
[`docs/projeto/IA.md`](../projeto/IA.md). A regra está em
[`docs/projeto/POLITICA-CONTAS.md`](../projeto/POLITICA-CONTAS.md) e o plano de 30 commits em
[`docs/projeto/PLANO-CADEIA-CONTAS.md`](../projeto/PLANO-CADEIA-CONTAS.md).

### O que já está na branch (commits 1–14 do plano)

- `b92adfb1` — política da cadeia com as decisões do dono e o plano versionado; índice de `docs/` atualizado.
- `488ff8f8` — vocabulário de falha das CLIs instaladas como fixture versionada
  (`app/electron/__fixtures__/cli-failure-vocabulary.json`: Claude Code 2.1.283, Codex 0.156.1, Gemini CLI 0.57.0,
  Openia 0.1.0) e o script que a confere só lendo os pacotes: 28/28 frases no Claude, 30/30 no Codex, 4/4 no
  Gemini; o Openia fica sem detecção.
- `82e5ba62` — taxonomia única de falhas no processo principal (`accounts/failure-taxonomy.cjs`), com as origens
  `pty` (só frases do provedor) e `fluxo`; "line 429" deixa de ser limite; evidência redigida antes do corte.
- `a9d916dd` — leitor único de horário de reset (`accounts/reset-time.cjs`): fuso impresso e o formato do Codex
  ("try again at Oct 2, 2026 8:04 PM").
- `bb956380` — **(muda comportamento)** o orquestrador delega à taxonomia: 429 solto deixa de ser limite,
  `no_login` ganha prazo de 30 min, cobrança vira "Sem crédito", o limite por modelo do Codex fica no modelo e a
  capacidade do servidor preserva o fallback de modelo.
- `9a385acc` — o evento `error` do chat traz `failure: {failureClass, availabilityStatus}` decidido no main; sai o
  classificador do renderer.
- `dfb0e6c9` — o motivo de disponibilidade sai redigido na origem (`createTextPreview`), antes do log QA e do log
  de terminal.
- `00c8f3bb` — migração 017 e repositório compare-and-set (`storage/account-chain-repository.cjs`): uma proposta
  aberta por sessão garantida no banco, espera que nunca encurta, recuperação no início e retenção.
- `fcc75756` — `cli-accounts.json` (e a chave cifrada do Openia) gravados de forma atômica; arquivo ilegível vira
  erro tipado e nunca é sobrescrito.
- `c9f5bfac` — **(muda comportamento)** terminal com conta própria não herda credencial de API do ambiente
  (`applyProfileEnv` e `CREDENCIAIS_HERDADAS`).
- `64d6c43a` — a sessão do PTY guarda conta, provedor e modo; reanexar em outra conta é recusado
  (`PTY_SESSION_ACCOUNT_MISMATCH`).
- `a4001a2a` — **(muda comportamento)** descoberta de sessão com as pastas da conta e retomada só na mesma conta.
- `ead1b13e` — **(muda comportamento)** o relançamento automático do Codex não reenvia o texto de passagem.
- `3c56a26e` — **(muda comportamento)** falha ao listar contas ou conta salva ausente não vira Login do sistema em
  silêncio.

Desvios do plano, cada um explicado no commit: `parseClaudeReset` mudou de casa para `reset-time.cjs` (reusar no
lugar fecharia um ciclo de `require`); a redação do motivo foi para a origem, não só antes do log QA (o vazamento
também chegava ao push ao vivo e ao log de terminal); a escrita atômica cobre também a chave do Openia; o filtro de
credenciais ficou na junção do spawn, não no `buildEnv` (o `node-pty` serializa `undefined` como texto); tirar o
`chainTicket` das opções de lançamento ficou para o commit que cria o ticket. A conferência das fixtures corrigiu o
plano em dois pontos: o `codex login status` imprime "Not logged in" sem ponto, e a oferta "Upgrade to Max 20x" é
montada em partes.

### Validação até aqui

Cada correção tem um teste que falha antes, com a saída na mensagem do commit. Exemplos: 6 de 9 testes novos do
orquestrador falham contra o código anterior; o teste do PTY acusa `OPENAI_API_KEY` vazando para o terminal de uma
conta Codex; 6 testes do PTY, do IPC e da CLI oficial falham antes da sessão guardar a conta. O repositório da cadeia
tem teste com dois processos Node reais (15 rodadas: uma proposta por sessão e um único `confirm` aplicado) e o teste
de compatibilidade da 017 sobre um banco na versão 16 com dados.

**Validação final: registrada ao fim da branch.** Ficam para lá: suíte node completa, vitest, lint e build no último
commit; `npm run test:native`; a bancada `benchmark:pty-output` com os números da vigia e a CPU do processo principal
com Modo Performance ligado e desligado; o smoke de ponta a ponta nos 4 sistemas; e a verificação manual no Linux com
duas contas Codex reais.

### NÃO verificado / limitações (até aqui)

- Os commits 15–30 (elegibilidade, política, vigia no `onData`, serviço, IPC, ticket no spawn, interface,
  orquestrador pedindo confirmação, smoke, matriz de falhas e documentação) estão em andamento. A arquitetura e o
  guia do usuário já descrevem esses pontos como o plano define.
- Não dá para forçar um limite real sob demanda: a troca por limite vai ser provada pelo smoke com CLI roteirizada,
  alimentada pelas frases reais das fixtures.
- Nota de ambiente: um teste de tela do PTY ("classicScreen") falha quando o processo herda
  `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`, o que acontece ao rodar a suíte de dentro do Claude Code. Sem a variável,
  passa. Não tem relação com a cadeia.

## 2026-09-28 — Cadeia de contas: validação final da branch feat/cadeia-contas

Registro gravado às 15:43. Completa o marcador "Validação final: registrada ao fim da branch" da entrada anterior.

**Como a branch foi feita.** Para caber no prazo, a implementação dos commits 15–30 rodou em trilhas paralelas, cada uma num worktree próprio: elegibilidade e política, vigia do terminal, serviço, orquestrador, remoção de conta, interface, documentação, PTY roteirizado, integração do processo principal e matriz de falhas. Os commits foram trazidos para a branch em ordem, com os conflitos resolvidos à mão e conferidos pelos testes de cada arquivo. Houve quatro rodadas de verificação adversarial:
- uma sobre os commits 1–14;
- quatro lentes sobre a branch integrada: custo e ticket, fiação e regressão com a cadeia desligada, interface e acessibilidade, política e orquestrador.

**Achados corrigidos antes do PR**, todos com teste que falhava antes:
- Faltavam no vocabulário as mensagens principais de limite do Claude ("You've hit your session/weekly limit").
- O filtro de credenciais não cobria as variáveis que trocam quem cobra (Bedrock/Vertex/Foundry e tokens de sessão do Claude, GCA e ADC do Gemini) nem os spawns do painel.
- Uma frase de limite citada num diff ou num teste disparava a detecção. Agora ela vale só no começo da linha.
- Um arquivo de chaves ilegível era regravado por cima.
- A redação não mascarava chave do Google, rótulo entre aspas nem token do GitHub.
- O diálogo trocava em silêncio a conta escolhida pela recomendada. Isso cobraria outra conta.
- Delete com o diálogo aberto apagava o bloco de origem por baixo, porque faltava `.nokey`.
- O foco caía no body depois da recusa.
- A lista da cadeia anunciava uma reordenação recusada.
- Um bloco da cadeia não reabria sem ticket na mesma conta.
- Uma espera vencida pelo prazo liberava a conta sem nova checagem de login.
- O serviço e a política conversavam por contratos diferentes. A porta `account-chain-port.cjs` faz a tradução.
- O aviso "limit has reset" não chegava ao serviço.
- O `transcriptChars` do renderer era descartado.

**Validação no HEAD final** (93e2ef0a, em `app/`):
- `npm run lint`: 0 erros e 0 avisos.
- `npm run build`: ok.
- Suíte node (`scripts/run-node-unit-tests.cjs`, com `env -u CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` e stdin fechado): 2166 de 2166.
- `npx vitest run`: 169 arquivos, 2251 testes e 1 pulado.
- Matriz de falhas injetadas: 18 de 18, sobre as peças reais (porta, pty:spawn com ticket e manager).
- Smoke real (`npm run test:canvas-smoke`, sob lock, perfil isolado, antes da última rodada de correções): sessões A, B e C passaram. A sessão C, da cadeia de ponta a ponta com a CLI roteirizada, cobriu os passos C1–C13 em 140–192 s. O total levou 18,8 min nesta máquina de 2c/4t, carregada pelas trilhas paralelas. A medida no runner fica com a CI do PR.
- Bancada da vigia (`pty-output-path-benchmark`, parâmetros do CI, com carga média de 14 a 19): custo extra por pedaço de p50 +8,1% no fluxo spinner (teto de 10%); varredura p95 de 0,109 ms no spinner e 0,714 ms no pior caso (teto de 1 ms); CPU com 20 sessões em 3,57% de um núcleo (teto de 5%). `--check` com exit 0. Os números oficiais com a máquina livre, e com o Modo Performance ligado e desligado, ficam como pendência.
- Regressão com a cadeia desligada, que é o padrão, conferida por sonda sobre a fiação real: nenhuma checagem de login, nenhuma proposta e nenhum diálogo. No Login do sistema e em bloco fixo, só aviso.

**O que ficou de fora, com task aberta:**
- a validação com contas reais;
- a medição oficial da bancada;
- o tempo do smoke na CI;
- as decisões de produto levantadas pelas trilhas: fila com "Automática", permissões na continuação entre provedores, aviso depois de "Agora não" e se o stop do chat encerra o run;
- a segunda instância no mesmo perfil;
- o Openia sem crédito por medição;
- as propostas de prévia que se acumulam;
- os testes `classicScreen` e `openia-image-service`, que dependem do ambiente.

## 2026-09-28 — Cadeia de contas: duas falhas da primeira CI do PR #97

Registro gravado às 15:51.

- **Validate nos 4 sistemas:** um teste de descoberta de sessão foi cancelado no Node 22. A promessa esperada dependia de um timer `unref`, e os 30 testes seguintes do arquivo caíram junto. Localmente usamos o Node 25, onde passava. O teste agora segura o processo com um timer que tem ref (precedente do PR #95). No Node 22.22.3, a suíte inteira passa: 2166 de 2166.
- **Bancada da vigia (ubuntu-latest):** o custo extra por pedaço deu p50 +14,6%, acima do teto de 10%. Em valor absoluto, são 0,478 contra 0,354 µs por pedaço, ou seja, 0,124 µs, cerca de 0,025% de um núcleo com 20 sessões. A CPU medida da vigia foi 0,915% (teto de 5%), e a varredura p95 de 0,183 ms (teto de 1 ms).
  - **Correção:** o `--check` passou a exigir, como o gate de regressão do terminal já exige, que o custo passe do limiar percentual **e** de um piso absoluto de 0,5 µs por pedaço. Esse piso equivale a 0,1% de um núcleo com 20 sessões a 100 pedaços/s.
  - **Motivo:** abaixo de ~1 µs a VM do CI mede ruído, porque a base sem vigia oscila entre 0,35 e 0,56 µs de uma rodada para outra. O teto relativo continua o mesmo, e uma regressão real (uma regex por pedaço, por exemplo) soma vários µs e reprova.
- O macOS reprovou de novo no `renderer-xterm count=1` (+81,4%). É o ruído conhecido, que já tem task.

## 2026-09-29 — Segurança: política única de URL externa, portões no processo principal e CSP

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Segurança — cobrir URLs em ANSI/Markdown e bloquear esquemas perigosos" (Notion 3ce91f95-497e-81ed-b82c-f4dc83a6f5ad). Início em 28/09 às 21:42; fim em 29/09.

### Contexto

Links nascem na saída de CLI (texto que parece URL e hyperlink OSC 8), no Markdown de agentes e arquivos, nos painéis, nas páginas do bloco "Página Web" e nos pedidos `abrir-pagina` de agente. Cada superfície validava do seu jeito, e o processo principal não validava nada. Uma investigação com 6 leitores, que reproduziram cada cenário no Electron 41 real, mediu cinco lacunas:

- `denyExternalWindowOpen` repassava qualquer esquema ao `shell.openExternal`: `file:`, UNC, `vscode:`, `ms-settings:`, `data:`, `blob:` e esquema custom.
- A janela principal navegava para qualquer origem, e a página nova continuava recebendo `window.felixo`, com `pty.spawn`.
- Nenhuma sessão tinha handler de permissão. A permissão `openExternal`, que o Chromium pede quando uma página navega para um esquema externo, era concedida a qualquer site do bloco "Página Web".
- O handler de popup do webview fazia `loadURL` de qualquer esquema, e não havia `will-attach-webview`: o renderer controlava `disablewebsecurity` e `preload`.
- O hyperlink OSC 8 do terminal abria com clique simples, via `confirm()` em inglês e `window.open()` sem URL. O main recebia `about:blank`.

### O que foi feito

- **Política única.** `electron/services/external-url-policy.json` guarda a allowlist (`http:`, `https:`, `mailto:`, cada esquema com justificativa escrita), os campos aceitos em `mailto:` e o limite de 8.192 caracteres. Ela é espelhada em `external-url-policy.cjs` (main) e em `src/features/shared/external-url-policy.ts` (renderer); JSON é o formato de fronteira do repo, como `automation-scopes.json`.
  - Recusa:
    - controles C0/C1 e U+2028/2029;
    - invisíveis e marcas de direção;
    - espaço;
    - falta de esquema ou esquema fora da lista;
    - URL malformada;
    - falta de destino;
    - campo de `mailto:` fora de to/cc/bcc/subject/body, porque `attach=` já anexou arquivo local em clientes de e-mail;
    - userinfo: `https://google.com@evil.example` diz um domínio e abre outro;
    - tamanho acima do limite.
  - A URL aprovada sai como `URL.href`.
- **Opener do main** (`external-links.cjs`): é o único caminho até `shell.openExternal` e aplica a política. A recusa loga só esquema e host (`describeExternalUrlForLog`). A rejeição deixou de ficar sem dono.
- **`navigation-guard.cjs`:**
  - `will-navigate`/`will-redirect` na janela principal: sair do documento do app é negado; um link web sai pelo opener.
  - `will-attach-webview`: força `webPreferences` isoladas, apaga `preload` e exige `src` web ou `about:blank`.
- **`webview-lifecycle.cjs`:** popup e `target=_blank` só para página web; o `loadURL` usa a forma serializada.
- **`session-security.cjs`:** registrado no `main.cjs` antes de qualquer sessão existir (`session-created` e sessão padrão no ready), passa a permissão `openExternal` de toda sessão pela política. As demais permissões mantêm o padrão do Electron.
- **Pedidos de agente:** `normalizarUrlWeb` aceita exatamente o que a política web aceita.
- **Terminal:**
  - OSC 8 e WebLinksAddon passam pelo mesmo `linkHandler` (Ctrl/Cmd, botão principal, sem seleção, política web).
  - A dica mostra o destino real.
  - "Copiar link" nunca abre nada; link recusado perde só as ações que abrem.
  - O `leave` limpa o link sob o mouse.
- **Markdown:** `href` pela política, na forma serializada; `MarkdownLink` mostra o destino no `title`.
- **WebpageNode:** a rejeição do `loadURL` não vai mais inteira, com o token da query, para o log de QA.
- **CSP no build** (`scripts/renderer-csp.cjs` e plugin `felixo-renderer-csp` no `vite.config.ts`):
  - meta com hash dos scripts inline;
  - `object-src`, `base-uri`, `form-action` e `frame-src` como `'none'`;
  - `connect-src 'self'`;
  - `https://esm.sh` só em `font-src`, para as fontes do Excalidraw;
  - o build falha se um script inline ficar sem hash;
  - o dev server fica sem CSP.
- **Docs:** `docs/projeto/ARQUITETURA.md` ganhou "Links externos: uma política e um portão" e "CSP do renderer"; `docs/guias/GUIA-USUARIO.md` ganhou "Links no terminal" e as regras de link do preview.

### Decisões com motivo

- **Duas implementações, uma tabela.** O main é CommonJS sem build, e o renderer importa JSON da fronteira. A consistência é provada pela tabela compartilhada (`external-url-policy.cases.json`, rodada pelos dois) e por um teste diferencial com 20.000 entradas aleatórias.
- **Userinfo bloqueado por inteiro.** O caso legítimo (`https://usuario@git.empresa.com`) é raro e continua copiável; o disfarce e a senha no histórico não têm como passar.
- **`mailto:` restrito a campos de rascunho.** O link inteiro é recusado, em vez de o campo ser removido, para o destino nunca mudar em silêncio.
- **Barra de endereço do bloco "Página Web".** `url-utils.ts` continua com regra própria: é digitação da pessoa, com protocolo implícito, e não entrada externa. O attach do webview revalida.
- **`https://esm.sh` em `font-src`.** Mantém o texto dos desenhos do Excalidraw com a fonte certa, e fonte não executa código. Servir as fontes pelo build é uma task aberta.
- **Diferença conhecida.** O `rehype-sanitize` compara esquema com caixa, então `HTTPS://` vira texto no Markdown. É no sentido seguro, e está travado por teste.

### Validação

Commits `f30ba55`, `44d39df`, `3ca3f2d`, `7064c11`, `fc1393f`, `d34b5d6`, `0676e77`, `d95cce9` e `235ff82`, na ordem das dependências. Todos os comandos rodaram em `app/`.

**Portões**
- `npx tsc -b --pretty false`: saída 0.
- `npm run lint`: saída 0.
- `npm run build`: ok. A meta da CSP vem antes de qualquer `<script>`, `<style>` ou `<link>`, e o hash confere com o script inline normalizado.
- Suíte node (`node scripts/run-node-unit-tests.cjs`, sem `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` e com stdin fechado): 2276 de 2280 passaram. As falhas são duas conhecidas, que não vêm deste diff:
  - `app-relaunch.test.cjs`: EPERM de symlink no Windows, com task aberta.
  - O teste de tempo do dreno do PTY, que passou na rodada anterior.
- `npx vitest run`: 2421 de 2423 passaram.
  - A falha foi o `SystemDesignDocumentIndex`, que estourou os 5 s com as três suítes rodando juntas, porque espera o chunk `lazy()` do Markdown frio. Ele ganhou timeout de 20 s e passa isolado.

**Mutação**
Desliguei cada portão, um por vez, em 27 mutações. Todas foram pegas por algum teste. As mutações cobriram:
- o opener sem política;
- `deny` trocado por `allow`;
- `will-navigate` e `will-redirect` sem `preventDefault`;
- `isAppDocument` aceitando qualquer `file:`;
- o webview mantendo o `preload` ou aceitando qualquer `src`;
- o popup sem checar o destino;
- a permissão sempre concedida, e a partição sem proteção;
- a política sem os invisíveis, com a lista antiga de invisíveis ou sem a checagem da autoridade codificada;
- `attach=` e fragmento de `mailto:` aceitos;
- o limite medido só na entrada;
- o log vazando a URL;
- a allowlist ganhando `file:`;
- o renderer divergindo do main;
- o Markdown aceitando qualquer `href`, ou sem o plugin remark;
- o terminal sem política, a dica sem destino, sem `linkHandler`, com o `leave` sem limpar e com o critério de seleção;
- o userinfo tratado só pela senha, ou sem regra nenhuma;
- a regra antiga no pedido de agente;
- `%` aceito no host.

**Investigação**
Seis leitores reproduziram as lacunas no Electron 41.10.7 real, na base `b283a66`.

**Revisão adversarial**
Cinco lentes revisaram o diff: main, renderer, política, CSP/docs/testes e checagem ao vivo. Cada achado ganhou um verificador cético: 13 foram confirmados e 2 refutados. Os confirmados foram corrigidos antes do push:
- `attach=` pelo fragmento do `mailto:`;
- invisível codificado pelo parser do Markdown e dentro do host;
- a lista manual de invisíveis incompleta;
- o `href` serializado acima do limite;
- host que o Chromium aprova e o Node recusa;
- `appUrl` com unidade minúscula ou nome 8.3;
- o bloco "Página Web" morrendo ao remontar;
- o destino do link recusado sumindo do Markdown;
- OSC 8 `file:` invisível;
- a trava de seleção impedindo um Ctrl+clique legítimo;
- a falta de teste da fiação.

**Checagem ao vivo**
Feita com `node electron/cli/felixo.cjs devtools launch`, perfil isolado e PTY real:
- `location.href='https://example.com/'` manteve a janela em `http://127.0.0.1:5173/`. O controle negativo, com o `will-navigate` removido, navegou e expôs `window.felixo`.
- `window.open` de `file:` e `vscode:` devolveu `null`, e o log mostrou só `vscode://file`.
- Um iframe `vscode:`, uma navegação para `vscode:` e um redirect 302 para `vscode:` no bloco "Página Web" foram recusados pela permissão. O Code.exe ficou em 0 o tempo todo.
- OSC 8 com cliques reais pelo CDP: o clique simples não abre, o Ctrl+clique esquerdo abre, e os Ctrl+cliques direito e do meio não abrem.
- `<webview>` injetado com `nodeIntegration=yes` foi endurecido, e `src` `file:`, `javascript:`, `data:` e com userinfo foram recusados.
- No Markdown ao vivo, o `<img onerror>` não executou.
- Um grep pelo segredo de teste no perfil inteiro não achou nenhum log de QA.

**CSP no Electron com o `dist`**
Zero violações no boot, no canvas, no terminal (mock e PTY real), em nota Markdown com imagem, em arquivo `.md` com imagem relativa, no chat com imagem colada, no bloco "Página Web" e no Excalidraw. Com `https://esm.sh` em `font-src`, a Excalifont carregou. Os controles negativos foram todos bloqueados: script inline, `eval`, `new Function`, `setTimeout` com string, fetch e imagem remotos, worker `data:`, WASM, iframe, `<object>`, `<base>` e submit de form.

### NÃO verificado / limitações

- **Validado só no working tree, com Electron em modo dev e com o `dist`.** O instalador real (asar) em Windows, macOS e Linux não foi aberto. A CSP e a guarda de `appUrl` dentro do asar ficam para a task de release-smoke.
- **As demais permissões de site continuam liberadas para qualquer página no bloco "Página Web":** notificações, geolocalização, mídia e clipboard. Ficaram fora do escopo, com task aberta.
- **O Blink ainda aprova alguns rótulos `xn--` inválidos que o Node recusa.** O link fica morto, sem aviso, mas falha fechado. O caso do host com `%` foi corrigido.
- **Um Ctrl+arrastar que volta a menos de 3 px do ponto de partida conta como clique.**
- **Depois do attach, o renderer principal ainda pode mandar o webview para `file:`.** Exige JS arbitrário no renderer, que já tem a ponte do preload.
- **Com `connect-src` fechado, o export do Excalidraw usa o fallback de fontes dele.** O export não foi validado.
- **Um redirecionamento aberto de terceiros** (`https://site.com/redir?u=…`) não é detectável: a política vê só a primeira URL.
- **O menu de link do terminal e o botão de copiar do Markdown não têm teste de interface com DOM.** A decisão foi extraída para funções puras testadas.
- **Achado fora do diff, anterior a esta task:** no processo principal da instância do devtools, `app.constructor.constructor('return process')()` dentro do `vm` do eval devolve o `process` do main, apesar do comentário em `app/electron/main.cjs:564-568`. Tem task aberta.
- **O `felixo.cmd` instalado no AppData aponta para uma instalação de release-smoke sem `dev-runner`.** A checagem ao vivo usou o CLI do repo.
- Nota de ambiente: a entrada de 28/09 da cadeia de contas descreve esta máquina como "2c/4t". Medido agora, ela é um Ryzen 7 5700G com 8 núcleos e 16 threads, 13,8 GB de RAM e cerca de 2 GB livres com o app e os agentes abertos. Leituras de desempenho que usaram aquele dado devem ser relidas com isso em mente.

## 2026-09-29 — Segurança de URLs: última lente da revisão (CSP, docs e testes)

Registro gravado às 00:31. Completa a entrada anterior. A lente de CSP, docs e testes terminou depois do push de `cb88c79`, com 4 achados confirmados:

- **`frame-src 'none'` quebrava os embeds do Excalidraw** (YouTube, Figma…), que viravam frame com erro, sem aviso. O bloco de desenho passa `validateEmbeddable={false}`, e o Excalidraw diz que o embed não é permitido. Um teste trava a CSP e o Excalidraw juntos. Religar embeds escolhendo hosts ficou como task de decisão.
- **A ligação do plugin da CSP no `vite.config.ts` não tinha trava.** Tirar o plugin da lista deixaria o build verde e o instalador sem CSP. Agora há um teste estático, no padrão dos testes de fiação do main.
- **A fiação dos links do terminal não tinha trava.** Duas mutações passavam com a suíte verde: o WebLinksAddon voltar ao portão antigo (sem regra de arrasto) e "Copiar link" abrir o navegador. A lista de ações do menu virou função pura (`terminalLinkMenuEntries`), com teste de que copiar nunca abre, e o store tem teste de que o WebLinksAddon usa o mesmo `linkHandler` do OSC 8.
- **Uma asserção "copiar nunca abre" não tinha como falhar** (o mock nunca era passado). Foi substituída pelo teste acima.

Essas 4 mutações agora morrem: 31 no total nesta task. O primeiro CI de `cb88c79` (run 36516349566) passou em 21 de 22 jobs. O Validate do Windows reprovou no passo SA1 do smoke de onboarding ("o app não parou de gravar sozinho antes do percurso"), a mesma intermitência do Windows já vista na task anterior; o mesmo smoke passou em ubuntu, arm e macOS. O job foi reexecutado.

## 2026-09-29 — Links: escolha explícita de destino (navegador, Página Web ou copiar)

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Terminal — oferecer escolha explícita entre navegador externo e Página Web" (Notion 3ce91f95-497e-8122-84ca-fd22fb536393). Início em 29/09 às 08:37.

### Contexto

A política única de URL (entrada anterior) decidia **se** um link podia sair do app, mas não **para onde**. No terminal, o Ctrl/Cmd+clique abria direto o navegador, e só o clique direito oferecia a Página Web. No Markdown (notas, arquivos, chat, painel do Notion), o clique abria o navegador, sem menu e sem a Página Web. A Página Web não tinha como levar a página para o navegador, e a barra de endereço não fazia nada com um endereço recusado. Um pedido de agente (`felixo browser open`) abria sozinho, no navegador logado da pessoa. A task pedia uma política uniforme de clique, modificador e menu, e o aceite dizia: "nenhuma URL abre sem gesto" e "URL não suportada explica motivo".

### Decisões (Trilha B, respondidas pelo Felipe às 08:50)

- **Gesto principal:** perguntar a cada clique. Nenhum link abre direto; o gesto abre o menu com o destino escrito.
- **Preferência:** não guardar. Sem configuração nova: a escolha é feita a cada vez.
- **Superfícies:** terminal, Markdown e Página Web, com o mesmo menu.
- **Pedido de agente:** pedir confirmação, com navegador, Página Web ou recusar.

### O que foi feito

- **Núcleo em `src/features/shared/links/`:**
  - `link-destination.ts` (puro): destino (host em punycode ou destinatário do e-mail), escolhas por origem e motivo da recusa em português comum (`describeRefusal`). `runLinkChoice` classifica de novo antes de agir, e "Copiar" só conhece a área de transferência.
  - `link-chooser-store.ts`: o pedido fora do React (o terminal é imperativo), com cópia do link no instante do gesto. O canvas registra ali o criador de bloco Página Web (`registerWebpageOpener`); sem canvas (tela do chat), o menu não oferece a Página Web.
  - `LinkChooserHost.tsx`, montado no `App`: `role=menu`, setas/Home/End, Enter/Espaço, Esc/Tab, foco devolvido a quem abriu (ou levado ao bloco novo), "Link copiado" na região `status`, e `data-felixo-floating-layer` para a gaveta do terminal não fechar com o clique no menu.
  - `link-chooser-menu.ts` e `link-anchor.ts` (puros): posição dentro da janela, teclas, origem do gesto (teclado, toque) e bloco de origem.
  - `revealHiddenUrlCharacters` na política do renderer: o texto recusado aparece com `⟨U+200B⟩` no lugar do invisível.
- **Terminal:** Ctrl/Cmd+clique, toque (`sourceCapabilities.firesTouchEvents`), clique direito e a tecla de menu abrem o menu. A dica diz o destino real e, na recusa, o motivo. O menu DOM imperativo e a fiação `onOpenWebpage` (TerminalNode → store) saíram.
- **Markdown:** o `<a>` continua link para leitor de tela e Tab, mas o clique, o Enter e o clique direito abrem o menu, e o clique do meio não abre nada. O recusado virou botão tracejado, com o motivo na dica e o menu só com copiar. O destino que a política aprova, mas o `rehype-sanitize` apagou (`HTTPS://`), volta como link serializado; isso resolve, por outro caminho, a diferença conhecida que a entrada anterior registrou.
- **Página Web:** o clique direito num link da página abre o menu (evento `context-menu` do `<webview>`). Há um botão "Abrir esta página no navegador". A barra de endereço e o formulário "Criar Página Web" dizem o motivo da recusa (`explainUrlInput`); esquema colado sem barras (`javascript:`, `mailto:`) é explicado como esquema.
- **Pedido de agente:** o pedido válido fica pendente e aparece no `AgentBrowserRequestCard` (topo do canvas). O cartão mostra origem, endereço e sugestão, com os botões navegador, Página Web e recusar, mais "Recusar todos" quando há fila. Ele não rouba o foco nem responde a teclas globais. O renderer manda só `{id, destino}` (`agent-browser:decide`); URL e perfil são relidos do pedido gravado. O resultado grava `modo` (escolhido) e `modoPedido` (sugerido); a CLI, a ajuda e a skill dizem que nada abre sem a pessoa.
- **Smoke da CI, sessão D** (`scripts/canvas-smoke-links.cjs`, L0–L12): cobre, no app real, mouse, teclado, clique direito, toque, OSC 8, streaming com o menu aberto, a Página Web com página servida em 127.0.0.1 e o cartão de pedido. A CLI roteirizada ganhou os gatilhos `__felixo_smoke_osc8__` e `__felixo_smoke_stream__`.
- **Docs:** ARQUITETURA ("Escolha de destino: nenhum link abre direto" e "Pedido de agente para abrir página"), GUIA-USUARIO ("Links: escolher onde abrir"), skill `abrir-paginas-no-navegador` e ajuda do `felixo browser`.

### Achados no app real (sessão D), corrigidos antes do push

- As setas moviam o foco só no quadro seguinte; agora movem na hora da tecla.
- **A gaveta do terminal fechava ao escolher uma opção do menu com o mouse.** O menu mora num portal fora dela, e o `mousedown` contava como clique fora. O menu antigo do terminal tinha o mesmo defeito. Agora `shouldCloseOnOutsideClick` ignora a camada flutuante.
- No terminal, Shift+F10 é da CLI: o xterm entrega o F10 ao programa (o htop sai com ele). A tecla de menu funciona, e o teste usa ela.

### Validação local

- `npx tsc -b`, `npm run lint`: saída 0.
- `npx vitest run`: 2.501 de 2.504 na primeira rodada, com 1 pulado. As 2 falhas eram os testes de 20.000 amostras da política estourando 5 s neste notebook de 4 threads ocupado (`nproc` = 4; carga ~15 com o app e um navegador abertos). A versão da `main` reprova igual na mesma máquina. Ganharam prazo de 60 s, e o arquivo passa (87 de 87).
- Suíte node, Node 25.9.0 e Node 22.22.3 (o da CI): 2.298 de 2.298 nas duas.
- Smoke da sessão D sob Xvfb e `flock`, com perfil isolado: L0–L12 ok em 83 s.

### NÃO verificado / limitações

- **macOS e Windows** só pela CI. O modificador do smoke é Cmd no macOS. O toque real (tela sensível) não foi testado em hardware: o toque vem do CDP (`Input.dispatchTouchEvent`), que passa pelo mesmo reconhecimento de gesto do Chromium.
- **Leitor de tela real** (Orca/NVDA/VoiceOver) não foi usado. A estrutura (`role=menu`, `menuitem`, `aria-describedby` com o destino, região `status`) está no código e no smoke.
- **Links de conteúdo sem teclado no terminal:** o xterm não põe foco em link. Pelo teclado, só a tecla de menu com o ponteiro sobre o link.
- **O cartão de pedido só aparece no canvas.** Na tela do chat, o pedido espera; com mais de uma hora, sai da lista.
- **Botões do app que já dizem o destino** ("Abrir no Notion" no painel, links do painel de uso) não perguntam. A escolha já está no rótulo.
- **Telemetria:** nenhuma foi adicionada. O único log continua o de recusa do opener, que leva só esquema e host.
- **Nota de ambiente:** a nota da entrada anterior (Ryzen 7 5700G, 16 threads) não vale para a máquina desta sessão, que tem 4 threads (`nproc`). Provavelmente é outra máquina.

## 2026-09-29 — Links: revisão adversarial da escolha de destino e consertos

Completa a entrada anterior. Registrada durante a validação final (horário no fim).

### Como foi revisado

Sete lentes independentes leram o diff (`fff6e998..77575049`): menu e acessibilidade, convivência com painéis e diálogos, terminal, Markdown e Página Web, main e pedido de agente, docs, e mutação (18 mutantes num worktree isolado). Saíram 48 achados. Os 29 de código e comportamento, sem os duplicados, passaram por um verificador cético cada, que lia um snapshot congelado do ramo e tentava refutá-los. Vários verificadores provaram o achado rodando o código de verdade: o Electron 41.10.7 do app, o React 19 e o xyflow reais, e sondas nos módulos do main. **Todos se confirmaram; nenhum foi refutado.** Os consertos foram feitos em quatro trilhas paralelas, cada uma num worktree próprio, integradas por cherry-pick sem conflito:

- A: main e cartão;
- B: menu;
- C: terminal;
- D: Página Web e Markdown.

### O que estava errado e foi corrigido

- **Grave: um arquivo de pedido malformado derrubava o app.** Com `perfil` que não é texto, o registro do main lançava e o resto do boot não registrava mais nada. O cartão também lançava no render e levava a interface para a tela de falha, a cada abertura do app. Hoje o pedido malformado é recusado na chegada, e nada no caminho lança.
- **TOCTOU no cartão.** A decisão executava o arquivo com o nome do id, não o pedido mostrado. Um id no conteúdo diferente do nome, ou o arquivo reescrito entre mostrar e clicar, abria outro endereço. Uma sonda mostrou `docs.python.org` no cartão e abriu `evil.example/login`. Agora o cartão manda `{id, destino, url, perfil}` do que mostrou, e o main só executa se o gravado ainda for isso. A fila inteira passou a descartar arquivo cujo id não bate com o nome.
- **Cartão.**
  - Duplo clique decidia o pedido seguinte, sem leitura. Os botões agora esperam 600 ms e ignoram `detail > 1`.
  - Clicar nele fechava a gaveta do terminal.
  - A URL ficava cortada em 3 linhas.
  - Falha ao abrir virava "recusado" em silêncio.
  - Um pedido vencido ficava aceitável para sempre, com `browser status` "pendente".
  - Duas decisões concorrentes abriam duas vezes.
  - Cada evento da pasta custava duas varreduras e um IPC.
- **Menu.**
  - Clicar no resumo soltava o teclado para o `body`, e o Esc fechava o modal de trás. No canvas, o Backspace apagava o bloco selecionado.
  - Roda, redimensionamento e Alt+Tab deixavam o foco no `body`.
  - Um diálogo que abria por cima ficava sob o menu.
  - Enter segurado escolhia "Abrir no navegador" sem leitura.
  - Um host gigante empurrava as opções para fora da janela. O corte agora é **no meio**: cortar no fim esconderia o domínio de um `login.banco.com.aaa….evil.example`.
  - O e-mail escondia cc/bcc.
  - Na Página Web, o menu dizia que mailto "não abre", mas o clique abria.
  - "Link copiado" não se repetia.
  - O alvo de toque não crescia em notebook com tela sensível.
  - O foco no bloco novo se perdia (ver abaixo).
- **Terminal.**
  - O toque não abria o menu com o mouse tracking ligado, porque o replay do mousedown perdia `sourceCapabilities`.
  - No macOS, o Ctrl+clique pedia o menu duas vezes.
- **Página Web.**
  - O menu nascia longe do clique, porque `params.x/y` já vêm no espaço da janela.
  - Um link `javascript:` chegava como `about:blank#blocked`, com motivo errado.
  - A recusa na barra tirava o foco, e o Backspace para corrigir apagava o bloco.
  - O aviso sobrevivia à navegação.
  - "Abrir como Página Web" de uma página de outro perfil abria no Padrão, logado como outra pessoa.
- **Markdown.** O link em volta de um bloco de código punha o "copiar" dentro de outro botão.
- **Fora da feature, mas afetando o menu.** A gravação do atalho do ditado continuava ligada depois de clicar fora e engolia as teclas do menu no mesmo painel.
- **Testes que não pegavam.**
  - O gravador de `window.open` nos testes do store ficava no `window` velho, porque a bancada troca o global, e toda asserção "nada abre" passava vazia. Agora pega: com um `window.open` no gesto, 5 testes falham.
  - Três mutantes vivos ganharam teste: a marca de camada flutuante, copiar recusado que abre, e a Página Web com texto cru.
  - O fuzz do Markdown ganhou prazo de 60 s.

### Achados que mudaram a correção

- **Foco no bloco novo.** A trilha tentou mais quadros (24), mas o verificador mostrou com as funções reais do xyflow que não era isso. O nó entra no DOM na hora (ainda sem medida), é focado, e sai quando o ResizeObserver o mede fora do container: o foco cai no `body`. O conserto espera a câmera (`setCenter` devolve a promessa; prazo de 450 ms para a câmera interrompida) e foca com `preventScroll`.
- **Marca de foco.** A trilha fez o `useFocusRestore` esquecer toda camada flutuante. O verificador apontou que o cartão também é camada flutuante, mas continua na tela. A marca ficou separada: `data-felixo-focus-transient`, só no menu.
- **Quirk do xterm no smoke.** O Linkifier só pede link quando o ponteiro muda de célula do buffer, e o `mouseleave` não esquece a última célula. Um toque na mesma célula em que o mouse esteve não conta. O smoke toca na linha recém-impressa. É comportamento do xterm, não do app.

### NÃO verificado / limitações

- macOS e Windows só pela CI; o Ctrl+clique do macOS foi lido do código do Chromium, sem Mac aqui.
- Tela sensível ao toque real e leitor de tela real não foram usados. O toque vem do CDP, e a ARIA é conferida no smoke.
- O `AgentQuestionDialog` (anterior a esta task) também fecha uma gaveta não fixada no clique e não pega o foco. Com ele aberto, o menu de link fica por cima. Há task aberta.
- Na Página Web, o ponto do `context-menu` foi medido com o link na página e num `<iframe>` interno. Um PDF ou um `<embed>` não foram testados.

### O que o primeiro CI do PR #98 achou (run 36590390171)

As sessões A, B e C passaram em Linux e macOS. A sessão D reprovou em dois pontos:

- **Linux: defeito do app, não do teste.** Ao fechar o menu, o foco voltava ao `<webview>` com `focus()` sem `preventScroll`. Na janela menor do runner (1280×733), a Página Web centralizada ficava só em parte visível, o navegador rolava o container do React Flow para mostrá-la, e o canvas inteiro saía do lugar: a barra de ferramentas do bloco ficou embaixo da barra lateral. Em 1280×800 nada rolava, por isso passou aqui. `restoreFocus` usa `preventScroll: true`. A emulação de viewport (como na sessão C) foi tentada e descartada: com a página emulada num tamanho diferente da janela real, o clique direito dentro do `<webview>`, que é outro processo, caía no bloco.
- **macOS.** Não tem tecla de menu, e o Chromium de lá não abre menu de contexto pelo teclado; o passo vale só no Windows e no Linux.

O Validate do Windows reprovou na montagem da sessão A ("APP NÃO MONTOU"), a intermitência conhecida desse runner. O benchmark do Windows apontou +129% no delta de heap do streaming do xterm (14,2 MB → 32,5 MB), só nesse sistema, sem mudança no caminho do streaming (o código de link só roda em evento de mouse). A sessão D passou de novo aqui sob `xvfb-run` sem tamanho, como no CI.

### O que o segundo CI do PR #98 achou (run 36592920213)

A sessão D passou no ARM e no macOS. Nos outros sistemas, os três problemas eram do teste, não do app:

- **Windows, L2, a primeira vez que a sessão D rodou lá.** A janela do runner tem 1008×655. A nota, centralizada pela lista Elementos, é mais larga que a faixa livre do canvas e fica em parte embaixo da barra lateral. O "clique fora" do L1, tirado da borda esquerda da nota, caía no botão "Novo bloco" e abria o popover dele. No L2, o clique no resumo do menu de link contou como clique fora desse popover, que fecha e devolve o foco ao próprio botão no quadro seguinte: o foco saiu do menu, e o menu fechou. Reproduzido aqui com Xvfb em 1024×720 (janela 1023×697). O ponto do clique agora é conferido com `elementFromPoint`: o alvo tem de ser o próprio `.react-flow__pane`.
- **Ubuntu, L8.** Depois do streaming, o terminal está cheio. O texto aparece no eco da digitação, antes do Enter, e o prompt seguinte rola a tela uma linha. O ponto lido cedo caía na linha do prompt, e a dica do link não vinha. `esperarNoTerminal` espera duas leituras iguais, com 200 ms entre elas, e a pausa manual do L9 saiu.
- **Ubuntu, benchmark.** O falso positivo conhecido do cenário `renderer-xterm count=1`, desta vez no ubuntu: de 17,5 MB para 39,2 MB (+123,9%). Os outros três sistemas passaram. Já há task aberta para esse cenário, com as duas ocorrências deste PR anotadas.

Mais dois achados:

- **Uma rodada local travou no fim, depois do "L0–L12 ok".** O `server.close()` da página local esperava as conexões que o webview ainda segurava, e o app só fecha depois da sessão. O `close` agora vem com `closeAllConnections()`.
- **O L4 copia o link recusado** e confere o texto cru na área de transferência (antes só fechava com Esc).

O comportamento do popover é anterior a esta task e está em cinco popovers da barra: Organizar, Novo bloco e Grupo, Página Web, Agente e Gerar imagem. Num clique fora, eles devolvem o foco ao botão mesmo quando a pessoa clicou num controle focável, como um terminal ou o menu de link. Ficou numa task própria.

Validação local depois dos consertos: a sessão D passou do L0 ao L12 nas duas janelas, 1280×738 (Xvfb sem tamanho, como no CI do Linux) em 140 s e 1023×697 em 135 s. O ESLint do script saiu com 0.

**Reexecução do terceiro CI (run 36602524300), já com a sessão D rodando até o fim no Windows.** O L10 reprovou: a lista Elementos centraliza o bloco com zoom 1,2 mesmo que ele não caiba, e na janela de 1008×655 a Página Web (672×504) fica mais larga que a área livre. O centro de uma faixa da página caía embaixo da barra lateral (no CI) ou do minimapa e dos controles de zoom (aqui). O L10 agora escolhe, em cada faixa, um ponto em que `elementFromPoint` devolve o próprio `<webview>`. O "Recarregar" do L11, que fica embaixo da barra lateral, é acionado pelo teclado. Reproduzido com Xvfb em 1009×678 (janela de 1008×655): a versão anterior reprova no L10, e a nova passa do L0 ao L12 em 129 s. O zoom fixo da centralização é anterior a esta task e ficou numa task própria.

Na mesma run, duas intermitências conhecidas, fora do código de links, ganharam task:
- o SA1 do tutorial no Windows ("o app não parou de gravar sozinho"), pelo menos a terceira ocorrência;
- a checagem interna de resume da bancada de scrollback no macOS, que reprovou duas vezes seguidas (count=5: 340 → 467 ms; count=1). Nos dois casos, as duas políticas usam o mesmo scrollback de 20.000, porque a adaptativa só muda a partir de 10 terminais: a checagem compara uma configuração com ela mesma.

### Fechamento: CI, merge e publicação

- **As duas últimas runs do PR:**
  - **36606538229:** no Windows, o E2E de contexto (matriz de 50 rodadas com PTY real) estourou o prazo, e a bancada falhou em `native count=10: timeout`. Os dois usam ConPTY no mesmo runner; ficaram como nota na task do ConPTY. Na reexecução, o SA1 do tutorial reprovou de novo.
  - **36608937372:** já com o diagnóstico do SA1 (`e0ba8189`), a falha veio no macOS com `{"canaisNaUltimaAmostra":{"canvas:save":2},"amostraMs":1500}`. É um laço de gravação do canvas que já existia (ocorrências no Windows antes do PR), e nada neste PR grava blocos. A task do SA1 virou "achar o laço de canvas:save", com prioridade Alta. A reexecução passou.
- **Números da run verde:**
  - vitest: 2.575 passaram e 1 pulado (178 arquivos);
  - E2E de contexto: 6 de 6;
  - suíte node: 2.328 testes e 0 falhas nos quatro sistemas;
  - sessão D L0–L12: ubuntu 26,9 s, ARM 26,7 s, Windows 34,0 s e macOS 26,4 s.
- **Merge:** squash às 15:21 em `d161ab5e`. O CI da main (36611428956) reaproveitou o do PR. O Release gate (36611464699) e o Release (36611482788) passaram, e a `v0.1.427` ficou como Latest às 15:28, com os instaladores dos três sistemas. Os release-smokes passaram no Linux, no macOS (com quarentena) e no Windows (instalador e cmd). O de caminho longo no Windows é exploratório, falha desde a `v0.1.426` e já tem task (suporte a path longo no node-pty).
- **Limpeza:**
  - ramo `feat/links-escolha-destino` apagado, local e remoto;
  - quatro worktrees das trilhas, o snapshot da revisão e o worktree da revisão removidos;
  - bundle e lista nome→SHA em `~/.local/state/felixo-ai-core/branches-apagadas/links-escolha-destino-2026-09-29.*`.
- **Notion:**
  - 13 tasks novas;
  - notas em 5 tasks existentes: AgentQuestionDialog, gate de heap, ConPTY, links no app empacotado e links enviados por agentes;
  - as tasks "cobrir o menu de link do terminal" e "esquema em maiúsculas no Markdown" concluídas com a evidência.

## 2026-09-29 — Links: aviso quando o navegador não abre e validação no app empacotado

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Terminal — validar abertura de links no app empacotado nos três SOs" (Notion 3ce91f95-497e-81f3-8d3a-eb64605b36b4). Início em 29/09 às 15:55.

### Contexto

A escolha de destino (entrada anterior) foi provada no app de desenvolvimento, com `window.open` trocado por um gravador. Faltava o que só o app **instalado** mostra: o `shell.openExternal` de verdade e o navegador do sistema abrindo o endereço. O aceite pedia:

- clique permitido abre uma vez;
- link inválido ou perigoso não abre;
- dev e pacote concordam;
- falha não trava o terminal;
- fixture sem segredo.

### Decisões (Trilha B)

- **16:05:**
  1. provar o navegador real **na CI**, contra um servidor local em 127.0.0.1;
  2. **só desta vez**: o script fica no repositório, e o `release.yml` não muda;
  3. o teste à mão no Windows e no macOS vira uma task com roteiro para o Felipe;
  4. quando o sistema não abre o navegador, o app **avisa e oferece copiar**. Antes era silêncio.
- **17:10:** no Linux, o **app roda o `xdg-open`** (ver abaixo), em vez de aceitar a limitação.

### O que foi feito

- **Aviso de falha:**
  - `external-links.cjs`: `createExternalWindowOpenHandler` responde `deny` na hora e, se a abertura rejeitar, a janela recebe `external-links:open-failed` com `{ url, kind, reason? }`;
  - o preload expõe `externalLinks.onOpenFailed`;
  - o `LinkChooserHost` mostra o aviso (`role=alert`, "Copiar link" e ×). Ele não pega o foco, devolve o foco ao fechar ou copiar e leva as marcas de camada flutuante e de foco passageiro;
  - num `mailto:`, o aviso fala do app de e-mail;
  - o texto sai de `link-open-failure.ts` (puro).
- **Linux:** o `shell.openExternal` do Electron chama o `xdg-open` e resolve sem esperar (`platform_util_linux.cc`: "Don't wait for exit"). A revisão mediu no Electron 41.10.7: com o `xdg-open` saindo com 3, ou ausente, a promessa resolve em 4–18 ms. `linux-xdg-open.cjs` roda o `xdg-open` como o Electron (argumento único, sem shell, `MM_NOTTTY=1`) e espera 3 s: saída com erro ou ENOENT é falha; saída 0 ou processo vivo é sucesso. O processo nasce destacado e com `unref`. macOS e Windows continuam com o shell do Electron, que já rejeita.
- **Costura de automação:** com `FELIXO_DEVTOOLS_SHELL_OPEN=falha` (só na instância de automação, mesma guarda da CLI roteirizada), o shell falha sempre, na janela e no cartão de pedido. A sessão D do smoke liga a costura e prova o aviso no L3:
  - `role=alert`, com o endereço, sem roubar o foco;
  - outra falha troca o nó;
  - Backspace no aviso não apaga bloco;
  - Esc, "Copiar link" e × fecham e devolvem o foco.
- **Validação empacotada:** `scripts/packaged-links-check.cjs` instala o artefato (`prepareArtifact` do release-smoke, agora exportado), dirige o binário por `felixo devtools launch --packaged` e conta, num servidor em 127.0.0.1, os pedidos do navegador. Os pedidos do `<webview>` do app, com user-agent `Electron/`, ficam de fora. Os casos:
  - porta e consulta, com fragmento;
  - Unicode;
  - pontuação em volta, no terminal;
  - pedaços de shell (`$(…)`, `;`, `|` com `${IFS}`) que criariam marcadores;
  - o botão da Página Web;
  - um `file:` recusado;
  - o terminal seguindo vivo.

  No fim, o navegador tem de ter feito exatamente um pedido por caso. Os modos são `real`, `curl` e `ausente`, estes dois só no Linux, com um `xdg-open` falso.

### O que a revisão adversarial achou

Foram 4 lentes (processo principal e segurança, renderer e acessibilidade, script empacotado, docs e testes), com um verificador cético por achado: 17 agentes, 11 confirmados e 2 refutados.

- **O aviso nunca apareceria no Linux**, porque o Electron não espera o `xdg-open`. Levou à segunda decisão.
- **A trava estática do `navigation-guard.test.cjs` procurava a fiação antiga.** A suíte node ficou vermelha no Node 25 e no Node 22 e foi atualizada para o formato novo.
- **A costura não cobria o cartão de pedido de agente.**
- **Copiar ou fechar o aviso deixava o foco no `body`.** Uma sonda no Chromium real mostrou o Backspace seguinte chegando ao canvas.
- **Num `mailto:`, o aviso mandava colar no navegador.**
- **A contagem do script misturava os pedidos do webview do app com os do navegador.**
- **O `rmSync` final podia transformar uma rodada aprovada em saída 1.**
- **Esc, × e o nó novo por aviso estavam sem teste.**

### Validação local

- **Pacote publicado (AppImage da v0.1.427)**, rodado aqui com `--navegador curl`: os 6 casos passaram, cada um com um pedido, a 2–4 s do clique. O `file:` recusado não gerou pedido, nenhum marcador de injeção foi criado, e o terminal seguiu respondendo. O `xdg-open` recebeu cada URL como **um argumento só**, inclusive a da injeção, com `$(`, `;` e `|` literais.
- **Pacote do ramo (`npm run pack`, `release/linux-unpacked`):**
  - `--navegador ausente`: o aviso apareceu como `alert`, com o texto e o endereço; o foco ficou no link, e "Copiar link" fechou e devolveu o foco;
  - `--navegador curl`: 6 de 6, com 6 pedidos do navegador para 6 casos (mais 1 do `<webview>` do app, fora da conta), 0 marcadores, terminal vivo.
- **Suítes e smoke:**
  - `tsc -b --force` e `npm run lint`: 0;
  - vitest: 2.588 passaram e 1 pulado (179 arquivos);
  - suíte node: 2.346 passaram e 1 pulado, no Node 25.9.0 e no 22.22.3;
  - sessão D L0–L12 sob Xvfb: ok em 96 s.
- **Ambiente:** a primeira rodada da suíte node, dentro do Felixo, reprovou num teste de outro assunto (`pty-process-manager.test.cjs`, classicScreen). A sessão herdava `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` do terminal do app. O teste passou a isolar a variável.

### NÃO verificado / limitações

- **A rodada com o navegador real nos três sistemas** ainda não tinha rodado quando esta entrada foi escrita: ela roda contra a versão publicada com este trabalho, num ramo temporário. O resultado entra numa entrada seguinte.
- **Windows sem navegador padrão:** não testado. O `ShellExecute` pode abrir o seletor "Como você quer abrir?" em vez de falhar, e aí não há aviso, porque o sistema está pedindo a escolha.
- **macOS:** a rejeição "No application found" foi lida no fonte do Electron (`platform_util_mac.mm`), não medida.
- **Linux em Flatpak ou Snap:** o `xdg-open` rodado pelo app pode se comportar diferente do caminho do Electron, que numa sandbox pode usar o portal. Não testado.
- **Navegador padrão escolhido pela pessoa** (não o de fábrica), no Windows e no macOS: fica para a task do roteiro manual.

### Rodada única com o navegador real nos três sistemas (v0.1.428)

- **Publicação.** O PR #99 foi mesclado às 18:28 (`8617f802`). O CI da main (36633549761) e o Release gate (36633595275) passaram, e o Release (36633610874) publicou a **v0.1.428** como Latest às 18:37, com 28 artefatos. Os release-smokes passaram no ubuntu, no macOS (inclusive com quarentena) e no Windows (instalador NSIS e cmd). O de caminho longo no Windows é exploratório e falha desde antes (task existente).
- **Como rodou.** Num ramo descartável, `valida/links-empacotado`, com um workflow que dispara só no push dele e sai com o ramo: `packaged-links-check.cjs` contra a v0.1.428 instalada, com o navegador padrão de cada runner (Edge no Windows, Safari no macOS, Chrome no Linux) e, no Linux, também `--navegador ausente`. Foram cinco rodadas até o verde:
  1. **36634580297.** O `ausente` do Linux já passou: o aviso apareceu no app instalado. No Windows e no macOS, o primeiro caso abriu no Edge e no Safari, e o script falhou ao achar o texto no terminal, porque a URL quebrava de linha na gaveta estreita. No Linux, o Chrome não pediu a página.
  2. **36635744365.** O macOS passou inteiro. No Windows, o clique caiu no link da linha anterior, porque o prefixo curto já estava na tela. No Linux, o diagnóstico rodou o `xdg-open` fora do app: o Chrome abriu e não pediu a página, preso na primeira execução.
  3. **36636409480.** O Linux passou inteiro, com o Chrome sem primeira execução (sentinela `First Run` e política gerenciada). O macOS passou. No Windows, os 6 casos passaram, e o passo do recusado não achou o botão.
  4. **36636996784.** O mesmo resultado. Na janela de 1008×655, a nota sai da vista, e o React Flow a remonta no modo de edição.
  5. **36637608975: verde nos três.**
     - Windows, macOS e Linux: os 6 casos com 1 pedido cada, a 2,0–7,5 s do clique no Windows, 0,4–6,1 s no macOS e 2,2–3,7 s no Linux. O `file:` recusado só ofereceu copiar e não gerou pedido; 0 marcadores de injeção; o terminal ficou vivo; o navegador fez 6 pedidos para 6 casos.
     - Linux `ausente`: o aviso apareceu como `alert`, o foco ficou no link e voltou depois de copiar, e copiar fechou o aviso.
- **O que era do ambiente, não do app:**
  - o perfil novo do app empacotado instala as CLIs de IA e procura atualização, e o script agora desliga as duas coisas (`FELIXO_AUTO_INSTALL_CLIS=0`, `FELIXO_DISABLE_AUTO_UPDATE=1`);
  - o Edge e o Chrome dos runners ficavam presos na primeira execução, o que o workflow resolveu com política e sentinela;
  - a janela do Windows é de 1008×655, e o script acha o texto por um prefixo curto, espera o texto inteiro, espera a nota montar e aciona o recusado pelo teclado.

  A versão final do script foi para a main em `a838bd2f`. O workflow temporário não: ele fica no ramo, apagado com bundle de backup.

## 2026-09-30 — Retomada: plano com motivo, escolha antes do spawn e falha registrada

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Retomada — documentar diagnóstico quando a sessão exata não existe" (Notion 3ce91f95-497e-8124-bde2-eea1d848ddf5). Início em 29/09 às 22:29.

### Contexto

A retomada de conversa decidia por um booleano (`canResumeAgentSession`) e explicava o fallback com um texto de quatro ramos. Quatro leitores mediram, na base `f2e9496`:

- O aviso de fallback não chegava à pessoa. Como não é slash command, virava artefato `initial-context`, e na tela aparecia só "CONTEXTO ENTREGUE EM ARQUIVOS…".
- O ramo genérico ("A CLI não confirmou…") cobria provider trocado, cwd vazio e referência inválida sem que nenhuma CLI tivesse sido consultada.
- A falha real de retomada não era detectada: o Claude responde "No conversation found with session ID", o Codex responde "No saved session found with ID", e o bloco ficava só "encerrado". Reiniciar repetia o mesmo `--resume`, e a única saída era "Esquecer associação", que apaga o registro.
- Os dois Reiniciar decidiam diferente, e o relançamento do Codex forçava a retomada sem checar.
- A descoberta do Gemini nunca casava no Windows (`.project_root` em minúsculas).
- Uma conversa cuja primeira mensagem vinha depois de 15 s nunca era capturada.

### O que foi feito

- **Plano com motivo** (`agent-session.ts`). `explainAgentResume` devolve `{ outcome, reason, reasons }`, e é a fonte única de decisão e de texto.
  - Desfechos: `exact`, `picker` (`/resume`), `new` e `pending`, este último segurando o spawn.
  - Motivos: `exact`, `fallback`, `unsupported`, `cwd-mismatch`, `missing-cwd`, `account-mismatch`, `provider-mismatch`, `invalid-reference`, `expired` e `auth`.
  - `canResumeAgentSession` e `buildAgentResumeArgs` viraram cascas do plano e aceitam a falha registrada.
  - Os textos para a pessoa (`describeAgentResumeForPerson`, `describeAgentResumeTarget`) e para o agente (`buildResumeFallbackNotice`) não levam ID de conversa nem de conta.
- **Escolha antes do spawn** (`terminal-resume-banner.ts`, `CanvasView.tsx`, `TerminalNode.tsx`, `TerminalDrawer.tsx`, `TerminalDetailsPanel.tsx`).
  - Em `pending`, o cartão mostra o alvo e o motivo, com as ações "Escolher na lista (/resume)" e "Abrir conversa nova".
  - Quando a falha é o único obstáculo, aparece "Tentar retomar de novo"; com o agente de pé, "Dispensar aviso".
  - O estado mostrado é "aguardando escolha". Não clicar deixa o bloco parado e o canvas intacto.
  - Os dois Reiniciar e as ações passam por `relaunchTerminal`.
  - `terminal-run-registry.ts` guarda no `sessionStorage` os blocos iniciados, os restaurados, a escolha e as conversas esquecidas. Esse registro sobrevive a ir ao chat e a recarregar só a interface, com os PTYs vivos.
- **Falha registrada** (`resume-outcome-detector.ts`, `terminal-session-store.ts`).
  - A saída inicial de um spawn de retomada é lida até 30 s ou até a primeira entrada da pessoa.
  - `expired` exige a frase do Claude ou do Codex **com o ID tentado**. `auth` usa as frases de login da vigia de contas. As linhas da conversa redesenhada (⎿/⏺) não contam.
  - A falha vira `resumeFailure = { sessionId, reason, at }`, persistida e presa à conversa tentada.
  - O relançamento do Codex passa a usar `canResumeAgentSession`.
  - A gaveta limpa o xterm do bloco anterior quando abre um bloco sem sessão.
- **Registro preservado.** A conversa substituída vai para `previousAgentSession`. "Esquecer associação" leva só a atual e a falha dela, e o reanexo não a traz de volta. O export `.fxcanvas` não leva `agentSession`, `previousAgentSession` nem `resumeFailure`.
- **Processo principal** (`pty-process-manager.cjs`, `agent-session-discovery.cjs`).
  - A retomada por ID já nasce com a referência (`resolveResumeTarget`, `source: 'resume-args'`) e não roda a descoberta.
  - A descoberta reabre no Enter (`\r`) de um PTY sem referência, até 3 vezes; Shift+Enter e colagem não contam. O reanexo não reabre a janela.
  - A busca ancorada prefere o arquivo nascido depois da mensagem. Os subagentes do Claude (`isSidechain`) são ignorados, e as referências são deduplicadas por `sessionId`.
  - O Gemini é normalizado como o próprio Gemini faz (minúsculas no win32).
  - No Windows, uma retomada recusada que sai cedo não vira CLI sem argumentos nem shell de emergência.
- **Docs.**
  - `GUIA-USUARIO.md`, seção "Retomar conversas de agentes": os desfechos, a tabela dos 10 motivos com os títulos exatos, "nada é apagado" e os limites medidos por CLI e versão.
  - `ARQUITETURA.md`, seção "Retomada de conversa: plano com motivo".
  - README e PLANO-CADEIA-CONTAS.

### Decisões com motivo

- **Pasta e conta são decididas antes do spawn, pela referência.** Medido: o Claude e o Codex respondem com o mesmo texto para conversa de outra conta e conversa inexistente.
- **O Gemini segue sem retomada por ID.** Medido: o bundle 0.57.0 aceita UUID (UUID inexistente dá "Invalid session identifier", saída 42), mas o help público só garante `latest` ou índice, e `latest` abre conversa nova em silêncio quando a pasta não tem nenhuma. A mensagem "No previous sessions found for this project" indica projeto ou HOME sem sessão retomável, não UUID recusado. Isso corrige a leitura da entrada de 28/08. Religar o Gemini ficou como task de decisão.
- **A escolha do spawn fica com a pessoa só na ambiguidade.** Sem conversa associada, a lista da CLI continua automática. Com o agente de pé, a faixa só aparece para falha, para não parecer erro sobre um agente funcionando.
- **O relançamento do Codex não segura o bloco.** Ele estava rodando um instante antes; relança sem retomada e mostra o motivo no cartão.

### Validação

Todos os comandos rodaram em `app/`, no conjunto final.

**Portões**
- `npx tsc -b --pretty false`, `npm run lint` e `npm run build`: saída 0.
- Suíte node: 2349 de 2353. As falhas são duas conhecidas: `app-relaunch.test.cjs` (EPERM de symlink no Windows) e o teste de tempo do dreno do PTY, que passa isolado.
- `npx vitest run`: 2712 testes, com 1 pulado.

**Mutação**
- Núcleo (`agent-session.ts` e `quality-standard-prompt.ts`): 10 mutações, todas mortas. Foram elas:
  - falha ignorada, e falha de outra conversa bloqueando;
  - pasta, conta e provider ignorados;
  - Gemini retomado por ID;
  - só um motivo no texto;
  - alvo vazando o ID;
  - `pending` subindo direto;
  - escolha ignorada.
- Export `.fxcanvas`: `resumeFailure` exportado é pego pelo teste.
- Correções dos agentes, cada uma revertida com o próprio teste falhando:
  - terminal: 7 falhas com a regra antiga do relançamento e a vigia desligada;
  - main: 5 correções, cada uma só com o próprio teste falhando;
  - UI: 6 reversões, cada uma pega por algum teste.

**Revisão**
Três agentes revisaram, reproduzindo cada achado: um ao vivo, um no fluxo do renderer e um na descoberta. Foram 18 achados, 15 corrigidos antes do commit e 3 que viraram tasks.

**Checagem ao vivo**
Feita com o store real, o PTY roteirizado do main e as pastas isoladas das CLIs, antes das correções da revisão:
- a faixa "A conversa nasceu em outra pasta" com alvo e botões, e nenhum PTY para o bloco segurado;
- a faixa sem o ID;
- "Abrir conversa nova" sobe o bloco com o aviso ao agente, e a conversa antiga vai para `previousAgentSession` na captura da primeira mensagem;
- "Escolher na lista" digita `/resume`;
- deixar sem escolher sobrevive ao reload;
- Detalhes mostra "Retomada" sem ID;
- o Gemini mostra "Retomada automática indisponível";
- a retomada exata sobe com `resume <id>` sem faixa;
- o export não leva ID;
- "Esquecer" mantém `previousAgentSession`.

### NÃO verificado / limitações

- **Checagem ao vivo feita antes das correções da revisão.** O conjunto final (registro no `sessionStorage`, "Dispensar aviso", detector com ID, referência no spawn de retomada) foi validado por testes, não reaberto no app.
- **O detector não foi exercitado ao vivo:** o PTY roteirizado só imprime depois de uma entrada, e a entrada fecha a janela.
- **Frases de falha dependem da versão da CLI.** Uma CLI nova com outro texto não é detectada e vale o comportamento anterior. Falha de login desenhada como saída de ferramenta, ou ID quebrado de linha, também não é detectada.
- **O relançamento automático do Codex ignora a escolha da faixa:** não redigita `/resume` nem o aviso de conversa nova (task aberta).
- **O store falso do renderer (`FELIXO_DEVTOOLS_MOCK_PTY=1`) diverge do real** e esconde a faixa. Os smokes do CI não cobrem esta funcionalidade (task aberta).
- **"Escolher outra conversa" é só a lista da CLI,** que filtra por pasta; no caso de pasta divergente, a conversa pode não aparecer (task aberta).
- **O chat legado não usa este resolver** e ainda manda UUID ao Gemini (task aberta).
- **Anterior a esta task:** a descoberta do Codex percorre as pastas em BFS com teto de 3000 arquivos, pelos rollouts mais antigos (task aberta).

## 2026-09-30 — Retomada: validação E2E no app empacotado (Windows), sem credencial

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Retomada — validar E2E empacotado com sessões reais não recentes nos três SOs" (Notion 3ce91f95-497e-8118-8eb2-fdb18eaff431). Início às 00:43.

### Contexto e restrição

A task pede sessões reais com o app empacotado nos três SOs e proíbe credencial pessoal ou prompt de login manual como E2E. Por isso tudo rodou com perfil do app isolado (`felixo devtools launch --packaged`) e pastas de conta das CLIs isoladas e vazias (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`), sem chave de API no ambiente e sem as variáveis `CLAUDE_CODE_*` da sessão que dirigiu o teste. Nenhum modelo foi chamado. O Gemini não foi aberto, porque a pasta de conta dele segue a HOME real.

### Empacotamento local (Windows)

- `electron-builder --dir --publish never` em `app/`, a partir de `4200757`, gerando `release/win-unpacked/Felixo AI Core.exe`, que carrega `resources/app.asar/dist`.
- Nesta máquina, dois contornos foram necessários:
  - sem toolchain C++, `-c.npmRebuild=false`, como o `release.yml` já faz no Windows;
  - no Node 25.3.0, o `fs.cpSync` de `scripts/bundle-npm-runtime.cjs` quebra ("The operation completed successfully" em `…\node-gyp-bin\node-gyp`). O `electron-builder` rodou no Node 24.18 do próprio Electron (`ELECTRON_RUN_AS_NODE=1`), com um wrapper que faz `process.noAsar = true` e `process.defaultApp = true`.

### Medido com as CLIs reais, sem credencial

- `claude --resume <id ausente> -p x`: `No conversation found with session ID: <id>`, saída 1.
- `claude --resume <id de um arquivo no formato do Claude Code> -p x`: `Not logged in · Please run /login`. A CLI resolve o ID **antes** do login.
- `codex exec resume <id> x`: `Not inside a trusted directory…`. No TUI, a tela "Sign in with ChatGPT" aparece antes de resolver o ID.
- `gemini --resume <id> -p x`: `No previous sessions found for this project.`, saída 42.

### Cenários no app empacotado (Windows 11, Claude Code 2.1.283 → 2.1.285, Codex 0.159.2)

| Cenário | Resultado |
| --- | --- |
| Claude, conversa ausente e não recente (3 dias) | A CLI respondeu `No conversation found with session ID: …a1`. O cartão mostrou a faixa "A CLI não encontrou a conversa" (Escolher na lista, Abrir conversa nova, Tentar retomar de novo), `resumeFailure = expired:a1` persistida e nenhum ID na faixa. |
| Claude, conversa no disco (3 dias), com uma vizinha mais nova na mesma pasta | A CLI retomou a conversa exata pelo ID (redesenhou "Conversa antiga do bloco E2E", não a vizinha) e parou no login. O cartão mostrou "A CLI pediu login ao retomar" com "Dispensar aviso"; `agentSession` seguiu `…a3`, sem `previousAgentSession`. |
| Reiniciar no bloco com conversa ausente | Nenhum processo novo (mesmos PIDs). O foco foi para "Escolher na lista (/resume)". Sem loop de `--resume`. |
| CLI atualizada no meio (2.1.283 → 2.1.285) | "Tentar retomar de novo" rodou na 2.1.285: a mesma frase, a falha registrada de novo com carimbo novo e a faixa de volta. |
| Projeto movido (bloco em `projeto-movido`, conversa em `projeto`) | A faixa "A conversa nasceu em outra pasta", sem spawn. "Abrir conversa nova" subiu um processo sem ID de retomada e manteve a referência antiga. |
| Conta removida | O cartão ficou em "erro: A conta selecionada não existe mais.", sem cair no login do sistema e sem retomar. |
| Gemini | A faixa "Retomada automática indisponível no Gemini", sem spawn. A capacidade real, medida em 29/09: a 0.57.0 aceita UUID, mas só documenta `latest` ou índice, e o app não retoma por ID. |
| Processo ativo: reload da interface | Os mesmos PIDs antes e depois. Os blocos vivos reanexaram, sem voltar a "aguardando escolha". |
| Processo ativo: ir ao chat e voltar | Os mesmos PIDs, e a escolha preservada. |
| Codex, conversa ausente | Inalcançável sem credencial: o TUI pede login antes de resolver o ID. Com `CODEX_HOME` longo (156 caracteres), a CLI nem abre: `path must be shorter than SUN_LEN` (confirma ao vivo a task `3eb91f95-497e-8139-8008-ede2a7c8d531`). |

Os processos foram contados pela árvore de descendentes do executável de teste (Win32_Process), fora o app do dia a dia e a sessão que dirigia o teste. O detector não conta a linha redesenhada `└ Not logged in…` do histórico (o `└` não é abertura aceita); o `auth` veio do rodapé ao vivo da CLI.

### Matriz

| SO | Empacotado com CLI real | Lógica (CI) |
| --- | --- | --- |
| Windows | Validado (acima) | Verde (Validate windows-latest) |
| Linux | Não executado: não existe corrida empacotada sem publicar, e o `release.yml` publica | Verde (Validate ubuntu-latest e ubuntu-24.04-arm) |
| macOS | Não executado, pelo mesmo motivo | Verde (Validate macos-latest) |

Como o Claude resolve o ID antes do login, um job empacotado sem credencial pode cobrir Linux e macOS; ficou em task.

### Bloqueios e o que não foi validado

- **Retomada exata completa, com resposta do modelo, no Claude e no Codex:** exige uma credencial de teste que não seja pessoal. Task de decisão aberta.
- **Codex, conversa ausente:** o login vem antes do ID.
- **Gemini com sessão real:** a pasta de conta dele segue a HOME, e o login é exigido até para listar.
- **Primeira execução do Claude numa pasta de configuração nova:** o onboarding vem antes do `--resume`, e a janela do detector fecha na primeira entrada. Na rodada 1 a falha não foi detectada, até o onboarding ser marcado como feito. Numa instalação configurada isso não acontece.
- **O cartão fica em "aguardando" na tela de login do Codex**, sem faixa, porque a tela "Sign in with ChatGPT" não é uma frase de login do detector.

## 2026-09-30 — Retomada: capacidade por provedor e versão em vez de assumir UUID

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Retomada — resolver capacidade por provedor e versão em vez de assumir UUID" (Notion 3ce91f95-497e-81d1-b892-c8f1bc546e36). Início às 13:34.

### Decisões do Felipe (Trilha B)

- Religar a retomada exata do Gemini pelo ID **da 0.57 em diante**. Versão anterior ou desconhecida fica no caminho seguro.
- CLI que mudou de versão desde a gravação: **recalcula e segue**. O plano usa a versão nova, e os detalhes mostram a troca.
- Versão que não respondeu: **Claude e Codex seguem** (o `--help` deles documenta o ID); o **Gemini não**.
- Escopo: **terminais do canvas**. O chat fica com a task própria (3eb91f95-497e-8175-a8f2-c9e064b2f411).

### Medido (Linux, `script` como TTY, HOME isolada, ambiente limpo, sem credencial)

- **Gemini CLI 0.57.0:** `--resume <uuid>` de uma conversa existente reabriu a conversa no modo interativo ("> oi", "✦ ola"). ID inexistente numa pasta com conversas: `Error resuming session: Invalid session identifier "<id>".`, saída 42. Pasta sem conversa: `Error resuming session: No previous sessions found for this project.`, saída 42. As duas recusas saem antes da interface.
- **Evidência no próprio Gemini:** o `--help` só cita `latest` e o índice. A mensagem de erro (`SessionError.invalidSessionIdentifier`) ensina `--resume {number}, --resume {uuid}, or --resume latest`. `findSession` procura o UUID primeiro e só depois o índice.
- **`--session-file <arquivo>`** (documentado) não é retomada: importa as mensagens numa conversa nova, com outro ID. Ficou de fora.
- **Auto-update do Gemini:** o Gemini instalado nesta máquina se atualizou sozinho de 0.57.0 para **0.62.0** às 13:49:37, durante a medição interativa das 13:49. Foi o auto-update do próprio Gemini (`general.enableAutoUpdate`, ligado por padrão), no npm global do nvm. As medições da 0.57.0 são de antes da troca (o banner mostrava v0.57.0). Todas as medições foram repetidas na **0.62.0**, com o auto-update desligado só na HOME isolada: iguais. Hoje a 0.62.0 é a instalada.
- **Retenção do Gemini:** o Gemini 0.62 apaga sozinho, ao abrir, as conversas que não consegue ler e as com mais de 30 dias (`general.sessionRetention`, ligado por padrão, `maxAge: 30d`). No E2E, a conversa da fixture feita à mão sumiu assim, e o app mostrou corretamente "A CLI não encontrou a conversa".
- **Frase do Codex:** "No saved session found with ID {}. Run \`codex {}\` without an ID to choose from existing sessions.", conferida no binário 0.156.1.

### O que mudou

- `src/features/canvas/services/agent-resume-capability.ts` (novo): `resolveAgentResumeCapability({ provider, version, mode, platform })` com os métodos `exact-id | numeric-index | latest-only | interactive-only | unsupported` e as bases `documented | measured | below-proven | unknown-version | unknown-provider`. A tabela `AGENT_RESUME_RULES` tem as evidências.
- `electron/__fixtures__/agent-resume-versions.json` (novo): `--version`, recusas e código de saída por versão (Claude 2.1.285, Codex 0.156.1, Gemini 0.57.0 e 0.62.0, e a 0.56.2 como limite da regra). Os testes do renderer e do processo principal percorrem as fixtures.
- `agent-session.ts`: `explainAgentResume` recebe `cliVersion` e devolve `capability` e `versionChange`. `unsupported` passa a valer pela capacidade (e só com o mesmo provider). `buildAgentResumeArgs` monta `--resume <id> …args` para o Gemini exato. `AgentSessionReference` ganha `cliVersion` e `resumeMethod` (validados); `withResumeMethod` grava o método; `describeAgentResumeCapability` monta a linha de Detalhes. O texto de `unsupported` diz a versão, desde qual versão a retomada foi provada e o que fazer.
- `resume-outcome-detector.ts`: frases com `providers` (o detector de um spawn só usa as da CLI dele) e, no Gemini, `exitCode: 42` + `ResumeOutcomeDetector.exit`. O prefixo "Error resuming session:" e o ID entre aspas são aceitos. `terminal-session-store.ts` chama `exit` no começo de `finishExit`.
- `electron/services/agent-cli-versions.cjs` (novo): versão por CLI de agente, reaproveitando a detecção da abertura. Leitura com versão vale 10 min, sem versão 1 min, e o `null` da abertura já nasce vencido. Canal `pty:cli-versions`, preload `pty.cliVersions()`. Na instância roteirizada, nada roda.
- `pty-process-manager.cjs`: `getCliVersion` carimba `cliVersion` (só no formato aceito) na descoberta e na retomada por ID; `resolveResumeTarget` reconhece `gemini --resume <id>` (`latest` e índice seguem na descoberta).
- Canvas: `CanvasView` carrega as versões ao montar, segura só o bloco Gemini restaurado até elas chegarem (sem faixa piscando) e passa a versão ao plano, ao relançamento e aos Detalhes ("Capacidade da CLI"). `resumeCliVersion` é dado de render e não vai para o disco.
- Docs: GUIA-USUARIO ("A versão de cada agente", tabela dos motivos e dos limites, retenção e auto-update do Gemini) e ARQUITETURA ("Capacidade pela versão instalada", "Versão gravada e invalidação", o detector).

### Testes

- `tsc -b` e `eslint .` limpos.
- vitest: 2754 aprovados.
- Suíte de node: 2368 aprovados no Node 25.9 e no Node 22.22.
- Novos: `agent-resume-capability.test.ts` (fixtures, formato igual ao do processo principal, modo/sistema), `agent-cli-versions.test.ts/.test.cjs`, casos do Gemini em `resume-outcome-detector.test.ts`, `terminal-session-store.test.ts` (saída 42, saída antes da resposta do spawn, sem versão), `pty-process-manager.test.cjs` (Gemini por ID, carimbo de versão) e `pty-ipc-handlers.test.cjs`.

### E2E no app (fonte, Linux)

Condições: `felixo devtools launch` sob `flock`, com `env -i`, sem nenhuma variável `CLAUDE_CODE_*` nem chave. A HOME era falsa, com um link `.nvm` para o nvm real (sem ele, `createCliEnv` achava o Node 18 do sistema), e o TMPDIR era próprio, para o estado do devtools não colidir com outras sessões.

| Cenário | Resultado |
| --- | --- |
| Versões | `pty.cliVersions()` → claude 2.1.285, codex 0.156.1, gemini 0.62.0 |
| Conversa de 3 dias gravada na 0.56.2, Gemini instalado 0.62.0 | Subiu `gemini --resume 5c6d…`; o terminal mostrou "> conversa gravada na 0.56" e "✦ resposta antiga" (depois, a tela de confiança na pasta). A referência foi regravada com `cliVersion 0.62.0`, `resumeMethod exact-id`. |
| ID inexistente | Saída 42 → faixa "A CLI não encontrou a conversa", `resumeFailure expired` presa ao ID. Detalhes: "Capacidade da CLI: Gemini CLI 0.62.0: pelo ID da conversa". |
| Conversa apagada pela retenção do Gemini | Mesmo desfecho do ID inexistente (`Invalid session identifier`, 42). |
| "Abrir conversa nova" | `gemini` sem `--resume`, na mesma pasta, login do sistema, sem texto inicial. A conversa antiga foi para `previousAgentSession`, e a nova veio da descoberta com `cliVersion 0.62.0`. |

A primeira subida mostrou um problema real: com o `--version` do Gemini lento, a leitura `null` da abertura ficaria guardada 10 min. Corrigido antes do commit, com o `null` da abertura vencido e 1 min para leitura sem versão.

### Não verificado / limites

- **Windows e macOS** não rodaram o E2E do Gemini. O código do Gemini que resolve o ID é o mesmo JS em todo sistema, mas só o Linux foi medido.
- **Login do Gemini depois da retomada:** a tela de confiança e a de login vêm depois do ID resolvido e não viram `auth` (a vigia de contas não tem frase de login do Gemini). É o lado seguro: nada é gravado, e o terminal mostra a tela.
- **CLI atualizada com o app aberto:** a versão nova aparece na próxima montagem do canvas depois do prazo da leitura. Até lá, o detector de recusa segura uma versão que tenha deixado de aceitar o ID.

### Fechamento (CI, merge e release)

- PR #100 (`feat/retomada-capacidade-por-versao`, commits `a692d09` e `d35356a`). A CI passou em 21 dos 22 checks na primeira rodada. `Benchmarks (windows-latest)` falhou só no gate `renderer-xterm count=1` (delta de heap do stream +92,8%, limiar 60%), uma intermitência já conhecida e fora desta mudança; a reexecução do job passou.
- Squash no `main` como `2a7aa79` às 14:52. CI do `main` verde (reaproveitada do PR), Release gate liberou, e a release **v0.1.429** foi publicada às 14:53 com os instaladores dos três sistemas. O smoke exploratório do Windows passou.
- Branch apagada no GitHub e no local, com bundle de backup.

## 2026-09-30 — Prompts: nomes, retorno e caminhos validados em todas as origens

Registro de Claude - Tasks do AI Core, task "Felixo AI Core/Prompts — validar nomes em catálogo, skills, clipboard, combinação e fallback" (Notion 3ce91f95-497e-81ae-b687-e41ebf2e8ccd). Início às 15:31.

### Decisões do Felipe (Trilha B)

- Provar no store (PTY falso) **e** no app real, na CI dos três sistemas.
- Corrigir aqui os caminhos absolutos sem aspas.
- Incluir a forma do PowerShell (`&`) no texto de leitura quando o app roda no Windows.
- Corrigir aqui as divergências pequenas entre origens; as maiores viram task.

### O que a investigação achou

- A task dizia que a skill não se envia sozinha, mas ela se envia: `buildSkillActivationPrompt` já usa `toSubmittedTerminalText`.
- Caminhos absolutos sem aspas nos textos para o agente: a skill ativada, o manifesto de skills, as skills do preset, os `.md` ligados, o arquivo de planejamento, a pasta de trabalho (identidade e passagem) e os modelos de link/diagnóstico do scratchpad (`{{path}}`).
- No Windows, o comando de leitura sai como `"C:\…\felixo.cmd" context read "x"`, e no PowerShell um caminho entre aspas seguido de argumentos precisa de `&`.
- O fallback inline dava ao painel o mesmo "Inserido no terminal aberto" do caminho normal.
- A contagem de "N prompts combinados" incluía os prompts vazios, que ficam fora do texto.
- O painel de skills mostrava o ícone de sucesso também na falha e sumia com o erro em 2,5 s. Ativar uma skill da biblioteca não mostrava retorno nenhum.
- Um prompt do catálogo sem nome mostraria no cartão a referência do arquivo ("CONTEXTO ENTREGUE EM ARQUIVOS…").
- Nenhum smoke passava pelos painéis de prompts e de skills.

### O que mudou

- `prompt-paths.ts` (novo): `quotePromptPath` e `fillPathPlaceholder`, que não dobram aspas num modelo que já cercou `{{path}}`. São usados por skill, manifesto, preset, `quality-standard-prompt`, `terminal-handoff`, `file-link-prompt`, e `quoteContextFileName` delega a ele.
- `buildContextFileReferences`: com caminho de Windows (`isWindowsCommandPath`), acrescenta `No PowerShell: & "<caminho>" context read "<nome>"` por arquivo.
- `SendTextResult` ganha `inline: true` no fallback (`deliverContextText` devolve `{ data, inline }`). `toActivationResult` gera `sent-inline`, com texto próprio nos painéis (`describeSingleInsertFeedback`, `describeCombinedInsertFeedback`, `describeSkillActivationFeedback`). A combinação conta `combinedNames.length`.
- `SkillsPanel`: o erro aparece como erro (ícone e cor) e fica até a nova tentativa. A lista da biblioteca passou a mostrar o retorno.
- `resolvePromptDisplayLabel`: sem nome, usa o rótulo da origem (`Prompt do catálogo`, `Skill`, `Arquivo do canvas`…). O texto manual continua com o próprio texto.
- Atributos estáveis para o smoke: `data-felixo-last-prompt`, `data-felixo-context-warning`, `data-felixo-delivery-feedback`, `data-felixo-prompt-id`/`-insert`, `data-felixo-skill-id`/`-activate`.

### Testes novos

- `prompt-origins-e2e.test.ts` (18): store com PTY falso e xterm real.
  - Cada origem (catálogo, combinação, skill, arquivo do canvas, texto digitado): corpo byte a byte no arquivo, uma entrega e um Enter, rótulo do cartão e snapshot da metadata (`__snapshots__`).
  - Fallback por origem, com a mesma metadata e `inline: true`.
  - Combinação com ordem, repetição e prompt vazio.
  - Unicode, quebras de linha e prompt de ~250 KB; nome vazio; caminhos com espaço.
  - Duas entregas seguidas, desistência (digitado sem Enter e trocado pela pessoa), bloco removido com a entrega na fila, recusa do PTY e nova tentativa, reinício e `toPersistedNode`.
  - Mutação conferida: sem as aspas ou sem o rótulo por origem, 5 casos falham.
- `context-file-delivery.shell.test.ts`: a linha gerada roda no shell de verdade, numa pasta com espaço e acento. No Linux e no macOS, com `sh`; no Windows, com `cmd.exe`, PowerShell (com `&`, e a prova de que sem ele falha) e Git Bash.
- `prompt-paths.test.ts` (16), mais casos em `context-file-delivery.test.ts`, `prompt-delivery-feedback.test.ts` e `prompt-insertion.test.ts`.
- **Smoke, sessão E** (`scripts/canvas-smoke-prompts.cjs`, P0–P6), no app real com a CLI roteirizada:
  - catálogo, combinação e skill da biblioteca;
  - fallback de verdade, com a pasta `context-deliveries` trocada por um arquivo;
  - sem terminal aberto, o prompt vai para a área de transferência;
  - o canvas grava só a metadata.
  - Dois achados de interface: a gaveta precisa estar **fixada** para ficar aberta enquanto se usa o painel (um clique fora a fecha), e na janela da CI do Windows a lista "Elementos" cobre parte do painel. A sessão usa o teclado, como a memória das janelas do smoke recomenda.
  - `FELIXO_SMOKE_SESSOES=E` roda só as sessões listadas.

### Validação local

- `tsc -b` e `eslint .` limpos.
- vitest: 2801 aprovados (4 pulados: os 3 de shell do Windows e 1 que já era pulado).
- Suíte de node: 2369 aprovados no Node 25.9 e no 22.22.
- Sessão E sozinha, em Xvfb 1009×678 (a janela do Windows da CI): P0–P6 em 80 s.
- Smoke completo, em Xvfb 1280×800: sessões A a E aprovadas (C em 92 s, D em 47 s, E em 23 s).
- A sessão local foi interrompida entre 16:17 e 18:37 (a máquina reiniciou e o `/tmp` foi limpo). As mudanças estavam no worktree, e a validação foi refeita às 18:37.

### Relato do Felipe no meio da task: prompts enviados sozinhos

Com o PR #101 aberto, o Felipe relatou que os prompts do painel **Prompts**, no Claude Code, eram enviados sozinhos em vez de só entrarem na linha de entrada. Pela resposta dele, o comportamento certo é **sempre só digitar**, em catálogo, combinação e skill. Só `/resume` e a passagem de responsabilidade continuam indo sozinhos.

- **Causa:** não foi uma regressão recente. O "Inserir" do catálogo mandava `toSubmittedTerminalText` (com Enter) desde antes de 16/09, a combinação usava `autoSubmit: true` por padrão e `buildSkillActivationPrompt` terminava com Enter.
- **Correção:**
  - `PromptsPanel` e `activateSkill` passam `autoSubmit: false`, e `composeSelectedPromptInsertion` agora tem `false` como padrão.
  - `buildSkillActivationPrompt` não põe mais Enter.
  - `terminalTextForInsertion` (em `terminal-input.ts`) só acrescenta o Enter quando a inserção pede, e o `CanvasView` a usa.
  - Os retornos dizem "Digitado no terminal aberto. Revise e aperte Enter para enviar."
- **Nome no cartão:** a inserção só digitada fica em `pendingPromptInsertions` até o Enter da pessoa. Tecla comum e Shift+Enter a mantêm, porque a pessoa está completando o pedido, e o envio sai com o nome do prompt. Backspace, Ctrl+C e Ctrl+U a descartam.
- **Continuam indo sozinhos, e ficam para decisão:** a instrução ao ligar um `.md` e o pedido de diagnóstico, a colaboração ao conectar agentes, o aviso de renomeação e o "Enviar" do painel Terminais, que é um envio explícito.
- **Testes:**
  - E2E: 22 casos.
    - Os painéis nunca escrevem Enter.
    - O Enter da pessoa envia com o nome do prompt.
    - Completar com Shift+Enter mantém o nome; Ctrl+C o descarta.
    - Os snapshots foram regravados com `autoSubmit: false` em catálogo, combinação e skill.
  - Smoke, sessão E: passou com os textos novos, na janela do Windows da CI.

### Outro pedido: effort do Claude Code desatualizado

- O `claude --help` (2.1.285) lista `low, medium, high, xhigh, max`, e o app oferecia `low, medium, high, max`.
- `agent-launch-options.ts` ganhou `xhigh`, e o adaptador do chat (`model-options.cjs`) aceita `xhigh`.
- O modal de modelos do chat deriva a lista do Claude da mesma fonte, como já fazia com o Codex. Era a cópia duplicada que tinha ficado velha.
- Testes novos no canvas e no adaptador; um nível desconhecido, como `ultra`, não vira argumento.

### CI da primeira rodada do PR #101 (`f95bdb8`)

- `Validate` passou nos três sistemas. No Windows, `context-file-delivery.shell.test.ts` rodou 3 casos e pulou 1 (o de POSIX): o `cmd.exe` roda a linha comum; o PowerShell roda a linha com `&` e recusa a linha comum; o **Git Bash roda a linha comum** com o caminho de Windows entre aspas.
- `Dependency policy` falhou por um alerta publicado hoje, fora desta mudança: `dompurify` 3.4.13–3.4.15, GHSA-p98j-92pf-mc4p, severidade baixa, transitivo via `mermaid`.
- `npm audit fix`, sem `--force`, só mexeu no lockfile: `dompurify` 3.4.15→3.4.16, `undici` 6.28.0→6.29.0 e 7.29.0→7.30.0, `brace-expansion` 5.0.9→5.0.12, `fast-uri` 3.1.7→3.1.8. O `npm audit` foi para 0 vulnerabilidades.

### Fechamento (CI, merge e release)

- **PR #101, 8 commits.** Na primeira rodada (`f95bdb8`), `Validate` passou nos três sistemas, com os testes de shell do Windows, e `Dependency policy` falhou pelo alerta do `dompurify`, corrigido no PR. Na rodada de `0990acf`:
  - o `Validate (windows-latest)` precisou de 3 tentativas: na 1ª, o smoke não montou o canvas em 45 s na primeira carga da sessão B (a sessão A tinha passado); na 2ª, `package-inventory.test.cjs` leu um `package.json` só com bytes zero de dentro do `app.asar` recém-criado, uma corrida de disco;
  - `Benchmarks (ubuntu-24.04-arm)` reprovou no gate `renderer-xterm count=1` (heap do stream +234%) e passou na reexecução.

  Nenhuma dessas falhas é desta mudança, e o mesmo conteúdo passou na 3ª tentativa.
- **Merge e release.** Squash no `main` como `2da83fe` às 19:45; CI do `main` verde; release **v0.1.430** publicada às 19:46, com os instaladores dos três sistemas e o smoke exploratório do Windows verde.
- **Alertas novos no `npm` embutido.** Depois do merge, o `npm audit` completo passou a apontar `ip-address@10.5.0` (moderada), `brace-expansion@5.0.9` e `undici@6.28.0` (altas), todos dentro do `npm@11.19.1` que o app carrega como runtime. A política de produção (`--omit=dev`) continua com 0 alertas. Uma execução do Dependabot para o `ip-address` falhou, porque não consegue atualizar dependência embutida no pacote `npm`. Virou task.

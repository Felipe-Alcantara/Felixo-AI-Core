# Benchmark de scrollback do terminal

Esta bancada mede os custos que podem ser confundidos quando há vários
terminais abertos:

- `native-pty`: processos `node-pty`, entrega de bytes, latência da primeira
  saída e RSS dos filhos, sem criar xterm;
- `renderer-xterm`: buffers visuais xterm, escrita, frames, long tasks,
  attach/detach, fechamento e replay de resume.

O histórico visual do xterm não é o mesmo que o replay em memória do processo
principal. Hoje o manager mantém até 200.000 caracteres para reanexar uma
sessão. O xterm usa 20.000 linhas até 9 terminais e 5.000 linhas quando um
canvas já tem 10 ou mais terminais; o limite é escolhido quando a sessão nasce
e não muda depois, para nunca apagar histórico existente silenciosamente.

Quando o buffer visual rola além do limite, o terminal informa isso no cartão e
na gaveta. Fechar e reabrir a sessão reaplica o replay vivo que o processo
principal ainda mantém (até 200.000 caracteres); as ações Copiar e Handoff
continuam deliberadamente limitadas ao trecho visual atualmente disponível.

## Como executar

Em Linux, com um display virtual:

```bash
xvfb-run -a npm run benchmark:terminal -- --out=/tmp/felixo-terminal-scrollback.json
```

Para uma verificação menor que falha se houver perda de saída:

```bash
xvfb-run -a npm run benchmark:terminal -- \
  --counts=1,5,10,20 --scrollbacks=5000,20000 \
  --lines=128 --native-lines=128 --check
```

O `--check` padrão mede também a política adaptativa: compara o baseline fixo
de 20.000 com o limite compacto nos cenários de 10 e 20 sessões. Além de
contagem e resume, o check lê marcadores de identidade no xterm, verifica que o
trecho final é contíguo e confirma que attach/detach não o modifica. Quando o
relatório contém `heapBefore` e `heapAfterStream`, o ganho de memória é
validado pelo delta de heap durante o stream. Isso evita um falso negativo
quando o working set do Chromium fica retido entre cenários no mesmo renderer;
relatórios antigos continuam usando RSS como fallback. Para validar o ganho de
memória, use pelo menos uma carga maior que o limite compacto, por exemplo
`--lines=8000`.

No CI, o mesmo comando roda nos três runners suportados. Linux usa `xvfb-run`;
Windows e macOS abrem o Electron nativamente. Os JSONs são publicados como
artefatos do job para comparar p95 de RSS do renderer, latência de resume e
qualquer diferença de retenção entre sistemas.

Os limites das opções são deliberados: a bancada não aceita mais de 20
sessões, 50.000 linhas de scrollback ou 30.000 linhas por sessão. A coleta de
heap é habilitada pelo script npm e é forçada entre cenários para reduzir a
contaminação de uma rodada pela anterior.

## Baseline medido em 31/08/2026

Host: Linux x64, kernel `7.0.0-30-generic`, 4 CPUs, 11.6 GiB de RAM, Node
24.15.0, Electron 41.3.0 e xterm 6.0.0. A matriz usou 1/5/10/20 sessões,
8.000 linhas por terminal no renderer, 500 linhas por PTY nativo, 120 colunas,
prompts de 4.096 caracteres a cada 2.000 linhas, saída ativa em metade das
sessões e amostragem de 250 ms. Os valores são p50/p95 quando indicados.

### PTY nativo

| Sessões | Saída total | Primeira saída p50/p95 | RSS dos PTYs p95 |
| ---: | ---: | ---: | ---: |
| 1 | 64.995 B | 263/263 ms | 42.0 MiB |
| 5 | 324.975 B | 543/665 ms | 208.3 MiB |
| 10 | 649.950 B | 1.204/1.281 s | 418.7 MiB |
| 20 | 1.299.910 B | 2.145/2.146 s | 830.5 MiB |

Todas as sessões entregaram as 500 linhas pedidas. Esse custo é do backend e
de seus processos; ele existe mesmo quando não há buffer xterm.

### Renderer e scrollback

`heap Δ` é o aumento de heap usado entre o baseline coletado e o fim da
streaming, por cenário. RSS é o working set do renderer; `app RSS` soma os
processos Electron observados. Replay é agregado para todas as sessões.

| Sessões | Scrollback | Replay | Linhas retidas/terminal | Heap Δ | Renderer RSS p95 | App RSS p95 | Frame p95 | Long task p95 | Resume |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 5k | 0.59 MiB | 5.032 | 11.2 MiB | 213.0 MiB | 555.3 MiB | 50.0 ms | 327 ms | 0.84 s |
| 5 | 5k | 2.95 MiB | 5.032 | 43.3 MiB | 304.6 MiB | 649.2 MiB | 100.1 ms | 340 ms | 2.40 s |
| 10 | 5k | 5.89 MiB | 5.032 | 90.8 MiB | 417.9 MiB | 765.6 MiB | 150.0 ms | 321 ms | 4.15 s |
| 20 | 5k | 11.79 MiB | 5.032 | 167.2 MiB | 557.1 MiB | 905.2 MiB | 316.6 ms | 398 ms | 8.36 s |
| 1 | 20k | 0.95 MiB | 8.137 | 13.8 MiB | 277.9 MiB | 619.1 MiB | 50.1 ms | 226 ms | 0.77 s |
| 5 | 20k | 4.73 MiB | 8.137 | 70.6 MiB | 324.7 MiB | 668.6 MiB | 83.4 ms | 491 ms | 2.65 s |
| 10 | 20k | 9.46 MiB | 8.137 | 144.9 MiB | 448.9 MiB | 795.6 MiB | 100.0 ms | 490 ms | 5.68 s |
| 20 | 20k | 18.92 MiB | 8.137 | 264.0 MiB | 663.1 MiB | 1,014.1 MiB | 216.6 ms | 530 ms | 12.83 s |

## Decisão

A política adaptativa foi aplicada com 20.000 linhas para 1–9 terminais e
5.000 linhas a partir de 10. O resultado do baseline anterior mostra por que a
mudança é limitada ao cenário de carga: com 20 sessões, 5k reduziu o heap do
renderer de 264,0 para 167,2 MiB e o RSS p95 do renderer de 663,1 para 557,1
MiB, ao custo de 3.105 linhas visuais por terminal. A política conserva os
20k em canvases pequenos e evita redimensionar sessões já iniciadas.

O aceite só considera a política válida quando o `--check` comprova, no
runner de cada SO, saída final completa, suffix contíguo, attach/detach
preservado, resume não vazio, ausência de regressão de resume e ganho de heap
nos cenários de 10/20 sessões. O RSS continua publicado como evidência
observacional do custo do processo. Se um SO falhar esse contrato, o artefato
adaptativo não deve ser habilitado naquele release.

## Degradação do Canvas no Linux

A investigação de 03/09/2026 separou duas perguntas que costumavam aparecer
misturadas: quanto custa manter muitos terminais vivos e se a remoção de um
bloco deixa recursos retidos. A bancada de scrollback mede PTYs nativos e
xterm em um Electron isolado; a bancada do índice mede o React Flow real com
uma fixture de nós e arestas. Nenhuma delas altera o canvas persistido do
usuário.

Para repetir a matriz de terminal em Linux com display virtual:

```bash
xvfb-run -a npm run benchmark:terminal -- \
  --counts=10,20 --scrollbacks=20000 --policies=current \
  --lines=8000 --native-lines=128 --sample-interval-ms=500 \
  --out=/tmp/felixo-canvas-linux-current-8k.json

xvfb-run -a npm run benchmark:terminal -- \
  --counts=10,20 --scrollbacks=20000 --policies=adaptive \
  --lines=8000 --native-lines=128 --sample-interval-ms=500 \
  --out=/tmp/felixo-canvas-linux-adaptive-8k.json
```

Os dois comandos foram executados em processos limpos, no Linux x64 com
kernel `7.0.0-30-generic`, 4 CPUs, 11,6 GiB de RAM, Node 24.18.0, Electron
41.10.7 e xterm 6.0.0. `heap Δ stream` é o heap usado depois da carga menos o
heap usado antes dela; o heap após limpeza foi coletado depois de GC exposto
pelo Electron. O RSS é p95 do working set do renderer, e `app RSS` soma os
processos Electron observados.

| Política | Sessões | Scrollback | Linhas retidas | Heap Δ stream | Renderer RSS p95 | App RSS p95 | Frame p95 | Long task p95 | Resume |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Atual | 10 | 20k | 8.137 | 151,33 MiB | 490,2 MiB | 841,5 MiB | 50,1 ms | 506 ms | 3,67 s |
| Atual | 20 | 20k | 8.137 | 264,20 MiB | 706,0 MiB | 1.054,2 MiB | 150,0 ms | 401 ms | 8,09 s |
| Adaptativa | 10 | 5k | 5.032 | 91,94 MiB | 432,3 MiB | 783,0 MiB | 66,7 ms | 410,85 ms | 2,28 s |
| Adaptativa | 20 | 5k | 5.032 | 180,08 MiB | 565,4 MiB | 914,7 MiB | 158,4 ms | 266,5 ms | 4,59 s |

Com 20 terminais, o limite adaptativo reduziu o RSS p95 do renderer em 19,9%,
o RSS agregado em 13,2%, o delta de heap do stream em 31,8% e o resume em
43,2%. A saída, a identidade das linhas, o attach/detach e o resume foram
preservados; a redução para 5.000 linhas é intencional e o replay do processo
principal continua limitado a 200.000 caracteres. O resultado reproduz a
degradação por carga acumulada, mas o heap pós-GC próximo da linha de base não
prova, sozinho, um vazamento.

A inspeção do ciclo de vida encontrou uma retenção concreta: a exclusão
genérica pelo React Flow chamava `removeNode` para persistência, mas não
chamava `TerminalSessionStore.remove`. Assim, excluir por seleção/teclado podia
deixar PTY, xterm, listeners e timers vivos, enquanto o botão próprio do
terminal já fazia a limpeza. `releaseRemovedCanvasNodes` agora é a fronteira
única do caminho de remoção: deduplica mudanças, libera somente ids de
terminal e remove o dado persistido para todos os tipos. O
`DeferredTerminalSessionStore` também invalida `ensure` enfileirado durante um
`clear`, impedindo que uma sessão lazy reapareça depois de limpar o canvas.

No React Flow real, a matriz de 03/09/2026 usou 1.000 nós e 2.503 arestas,
incluindo terminais, arquivos, grupos e notas. O p95 baseline → índice foi:
render inicial 2.102,37 → 1.959,59 ms; drag 57,62 → 98,57 ms; resize
69,09 → 75,67 ms; criação/remoção de aresta 59,70 → 14,38 ms; mudança de
dados 61,90 → 12,31 ms. A fixture confirmou a projeção do índice e não
mostrou aumento material de heap; drag e resize ficaram sujeitos à variância
local e não são tratados como ganho. O harness passou a carregar o CSS do
React Flow para que a medição não dependa de um aviso de estilo ausente.

Validação associada: os testes focados do ciclo de vida e do benchmark, os
testes do gate em Node, typecheck, build, lint e os smoke/benchmarks Electron.
O harness de xterm não cria webviews nem inicia CLIs reais; o harness do React
Flow usa nós leves. A coleta usa `performance.memory` antes/depois de GC, não
um snapshot DevTools de uma sessão de produção com webviews, providers e
window manager real. Portanto, a investigação fecha o caminho de terminal e
remoção identificado, mas não declara ausência de retenção dentro de guests
webview ou de uma sessão real de provider; esse cenário deve ser tratado em
uma tarefa específica se voltar a ser necessário.

## Logs da CLI no chat legado

O painel `Logs da CLI` do chat é uma superfície diferente do xterm dos
terminais do Canvas. Para não manter o stream inteiro no estado React, o
processo principal grava os eventos normalizados em JSONL temporário em
`<userData>/logs/terminal-output`. O renderer mantém apenas a janela necessária
para a navegação:

- até **240 chunks lógicos** e **240.000 caracteres** por sessão;
- até **32.000 caracteres** de um chunk individual, preservando o final com um
  marcador de truncamento;
- até **720 chunks** combinados na visão de orquestração;
- coalescência dos fragmentos contíguos do mesmo item `assistant` e atualização
  agrupada por `requestAnimationFrame`.

O contador e o aviso da UI distinguem o que está retido do que saiu da janela.
Status, metadados de início e tamanho acumulado continuam sendo mantidos. O
arquivo JSONL conserva o stream completo da execução atual, inclusive as
entradas que saíram do renderer; a opção **Markdown para análise** lê esse
arquivo antes de exportar. Limpar os logs, iniciar outra execução do app ou
encerrar o app remove o arquivo temporário. Se o arquivo não estiver disponível
(por exemplo, no preview web), a exportação declara que só possui a janela
visual.

### Como medir

Com o Vite disponível, em Linux use um display virtual:

```bash
xvfb-run -a npm run benchmark:terminal-output -- \
  --iterations=3 --check --out=/tmp/felixo-terminal-output.json
```

A bancada abre o `TerminalPanel` real no Electron e executa os mesmos fixtures
curto, longo, de alta frequência e com quatro sessões nos dois modos. Ela coleta
`actualDuration` e latência do commit do React em p50/p95, quantidade máxima de
chunks no DOM, heap usado antes/depois de GC e working set (RSS) do renderer por
modo. A carga controlada usa 40 eventos brutos no fixture curto, 600 no longo,
2×320 no de alta frequência e 4×120 no de múltiplas sessões; o fixture longo
ultrapassa deliberadamente a janela visual. Cada modo roda em uma nova janela
Electron para evitar que o aquecimento de um modo contamine o RSS do outro. A
comparação usa a mesma cadência de um evento por atualização para isolar
retenção/coalescência de render; o batching de produção por frame é validado
separadamente pelo hook e pelos testes do fixture.

O relatório JSON registra a política, a carga, o host, os commits, a janela
visível e as limitações da coleta. O modo `--check` falha se faltar Profiler,
heap/GC, RSS, fixture ou se a janela atual montar mais de 720 chunks na visão
de orquestração. Esse benchmark usa Vite de desenvolvimento para manter o
Profiler observável e não inicia CLIs, PTYs nem altera dados persistidos.

## Benchmark do scanner do Fetch All

O scanner também tem uma bancada reproduzível. A raiz é obrigatória para evitar
que a própria medição inicie uma varredura da máquina inteira:

```bash
npm run benchmark:fetch-all -- \
  --root="/caminho/explicitamente-escolhido" \
  --iterations=5 --concurrency=16
```

Ela informa diretórios visitados, repositórios encontrados, concorrência e os
percentis p50/p95 do tempo de cada passada. No checkout do AI Core em
31/08/2026, com 5 passadas e concorrência 16, o resultado foi:

| Escopo | Diretórios | Repositórios | Concorrência | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| raiz do checkout | 187 | 1 | 16 | 40,006 ms | 42,125 ms |

Como referência da auditoria de 30/08/2026, uma raiz de trabalho maior mediu
3.335 diretórios e 51 repositórios, com p95 de 289 ms na concorrência 16. O
caso antigo de configuração vazia visitou aproximadamente 191.500 diretórios,
encontrou 0 repositórios e continuou por mais de 30 s. Depois da barreira, a
mesma configuração sem confirmação resolve 0 raízes e visita 0 diretórios; a
prévia de discos é apenas metadata. A varredura ampla continua disponível só
após confirmação explícita do escopo exibido.

## Benchmark do renderer do índice de conexões

O custo do índice também pode ser medido no renderer React real do Electron,
sem tocar no canvas persistido:

```bash
npm run benchmark:canvas-connections -- \
  --check --out=/tmp/felixo-canvas-connection.json
```

No Windows, o mesmo comando grava o caminho indicado por `--out`. A bancada
sobe o Vite de desenvolvimento, carrega a rota `?benchmark=canvas-connections`
em uma janela Electron fora da área visível e coleta `actualDuration` do React
Profiler, `performance.memory.usedJSHeapSize` antes/depois e `window.gc` quando
exposto pelo Electron. O Vite de desenvolvimento é intencional: o bundle de
produção não emite os callbacks do Profiler sem uma variante de profiling.

O padrão é 100/500/1.000 nós, 253/1.253/2.503 arestas e 20/100/200 conexões
nomeadas, nos cenários render inicial, drag, resize, criação/remoção de aresta
e mudança de dados. Cada combinação baseline/índice faz uma passada de
aquecimento, alterna a ordem dos modos por cenário e repete cinco vezes. A
tabela usa p50/p95 interpolados; `--check` exige repetições, commits do
Profiler, heap, GC e nós no DOM.

### Resultado reproduzível em 01/09/2026

Host Windows x64 (`10.0.26200`), 16 CPUs, 13,8 GiB, Node 24.18.0, Electron
41.10.7, viewport 1.584 × 936, cinco repetições e um aquecimento por
combinação. `heap Δ` é o delta de heap usado no fim da passada depois de GC;
não é um snapshot de retenção.

| Nós | Cenário | Baseline p50/p95 (ms) | Índice p50/p95 (ms) | Ganho p95 | Heap Δ p95 baseline → índice (MiB) |
| ---: | --- | ---: | ---: | ---: | ---: |
| 100 | render inicial | 17,50/38,00 | 17,30/32,06 | 15,63% | 5,75 → 4,92 |
| 100 | drag | 0,30/0,66 | 0,20/0,50 | 24,24% | 5,79 → 6,14 |
| 100 | resize | 0,50/0,76 | 0,30/0,40 | 47,37% | 6,12 → 6,16 |
| 100 | criação/remoção de aresta | 0,60/0,84 | 0,30/0,66 | 21,43% | 5,78 → 5,93 |
| 100 | mudança de dados | 0,30/0,56 | 0,30/0,46 | 17,86% | 5,79 → 5,75 |
| 500 | render inicial | 73,80/123,12 | 65,80/115,78 | 5,96% | 8,17 → 8,13 |
| 500 | drag | 3,30/3,56 | 0,90/1,16 | 67,42% | 8,85 → 8,00 |
| 500 | resize | 2,70/4,26 | 0,70/0,88 | 79,34% | 11,42 → 11,74 |
| 500 | criação/remoção de aresta | 2,40/3,42 | 0,70/1,02 | 70,18% | 8,64 → 7,85 |
| 500 | mudança de dados | 2,70/3,24 | 0,90/1,30 | 59,88% | 8,20 → 8,26 |
| 1.000 | render inicial | 144,70/269,92 | 126,80/131,66 | 51,22% | 9,99 → 9,95 |
| 1.000 | drag | 8,80/10,20 | 1,20/5,60 | 45,10% | 10,70 → 10,44 |
| 1.000 | resize | 10,20/15,50 | 1,20/1,58 | 89,81% | 11,06 → 11,11 |
| 1.000 | criação/remoção de aresta | 8,90/13,82 | 1,30/5,48 | 60,35% | 10,57 → 10,32 |
| 1.000 | mudança de dados | 9,40/9,84 | 1,40/1,96 | 80,08% | 10,54 → 10,60 |

O p95 melhorou em todas as combinações, de 5,96% a 89,81%. A diferença de
delta de heap entre os modos ficou pequena nesta coleta (mínimo -0,85 MiB,
máximo +0,36 MiB), sem aumento material; isso não substitui uma análise de
retenção ou de vazamento em sessão longa.

O fixture inclui terminais, arquivos, grupos e notas, links arquivo↔terminal
nas duas direções, pontas ausentes e uma aresta arquivo↔nota inválida. O
renderer é o `ReactFlow` real, mas os nós da bancada são componentes visuais
leves: não iniciam PTYs, não leem arquivos e não substituem a confirmação
manual do Canvas com links, nomes/labels, prompts iniciais, retomada do
terminal e remoção de nós/arestas. A projeção baseline/índice é conferida por
testes e a bancada exige DOM não vazio; por usar `onlyRenderVisibleElements`,
`domNodeCount` pode ser menor que a quantidade do fixture.

Para instrumentar o Canvas real sem deixar o Profiler ativo no uso normal,
abra o app com `?canvas-profiler=1`; os commits ficam disponíveis em
`window.__felixoCanvasProfiler`.

## Benchmark do bundle inicial

O build de produção usa carregamento sob demanda em três fronteiras:

- `App` carrega `CanvasView` (superfície padrão) e `ChatWorkspace` (legado)
  separadamente;
- cada ferramenta do menu do canvas (`Fetch All`, uso, configurações, Git,
  projetos e demais painéis) é um chunk próprio, com `Suspense` para loading e
  um estado recuperável de erro;
- o renderer Markdown e o runtime xterm/PTY também só entram quando uma nota,
  arquivo, mensagem renderizada ou terminal realmente os exige.

O foco ou a entrada do ponteiro em uma opção preaquece somente aquela opção.
Abrir o menu não baixa todos os painéis. Os chunks são relativos (`base: './'`)
para continuarem funcionando no `file://` usado pelo Electron empacotado.

### Como executar

Após `npm run build`, em Linux:

```bash
xvfb-run -a npm run benchmark:bundle:check -- \
  --iterations=10 --out=bundle-load-local.json
```

O script dá a cada iteração um `userData` temporário, abre uma nova
`BrowserWindow`, mede startup, abertura do menu e primeira ferramenta, além de
inventariar bytes crus/gzip. Também confirma que o chunk de `Fetch All` não foi
carregado no startup, que aparece depois da intenção de abrir a ferramenta e
que todas as referências relativas a JS/CSS existem no `dist`.

### Resultado reproduzível em 01/09/2026

Linux x64 local, dez amostras, perfil Electron limpo por amostra. A bancada
antiga foi recompilada no commit anterior (`a2efc42`) para a comparação.

| Medida | Baseline | Bundle dividido | Variação |
| --- | ---: | ---: | ---: |
| Entry JS cru / gzip | 1.687,23 / 483,71 KiB | 191,73 / 60,37 KiB | −88,6% / −87,5% |
| Arquivos JavaScript | 1 | 41 | chunks sob demanda |
| Startup p50 / p95 | 1.868,065 / 2.250,549 ms | 1.588,362 / 2.193,116 ms | −15,0% / −2,6% |
| Primeira interação — menu p50 / p95 | 656,519 / 741,861 ms | 685,680 / 731,206 ms | p95 −1,4% |
| Fetch All no primeiro uso p50 / p95 | 78,501 / 152,519 ms | 431,662 / 593,429 ms | custo explícito do lazy load |

O custo adicional do primeiro painel é intencional e fica isolado do startup:
depois que o chunk é carregado, novas aberturas usam o módulo em cache. O
benchmark verifica o comportamento sem aceitar o fallback de loading como
painel pronto. A variação do p50 do menu é a animação fixa de 620 ms somada à
jitter de criação de processos; o p95 melhorou, e o caminho comum do canvas
teve a redução principal no startup. O build final termina sem o aviso de chunk
JavaScript acima de 500 kB.

## Benchmark do typecheck

Os projetos TypeScript do renderer usam `noEmit`, mas ainda precisam manter o
typecheck completo. Sem `incremental: true`, o `tsc -b` gerava `.tsbuildinfo`
mas considerava `src/App.js` e `vite.config.js` ausentes em toda execução,
reabrindo os dois programas. Os tsconfigs agora declaram o incremental
explicitamente, então o build mode reconhece o próprio `.tsbuildinfo` como
saída observável e pula projetos sem entradas alteradas.

Comandos:

```bash
npm run typecheck                  # caminho incremental usado pelo build
npm run typecheck:full             # auditoria forçada dos dois projetos
npm run benchmark:typecheck:check  # cinco frias + cinco incrementais
```

O benchmark executa o `tsc -b app/tsconfig.json` real, move somente caches
próprios para um diretório temporário ao preparar cada amostra fria e mede
tempo de parede e pico de RSS durante o processo. `--check` exige cinco
amostras completas e código de saída zero; em plataformas sem consulta de RSS,
o relatório informa `null` em vez de estimar memória.

### Resultado reproduzível em 01/09/2026

Linux x64, Node 25.9.0, TypeScript 6.0.3, cinco amostras por modo, percentil
linear. O baseline foi medido com o mesmo `tsc -b` antes de declarar
`incremental: true`; a versão atual mantém `noEmit`, `skipLibCheck`,
`noUnusedLocals`, `noUnusedParameters` e os mesmos includes.

| Modo | Baseline p50/p95 | Atual p50/p95 | RSS baseline p50/p95 | RSS atual p50/p95 |
| --- | ---: | ---: | ---: | ---: |
| Frio | 51,41 / 54,67 s | 52,60 / 54,24 s | 673.060 / 683.753 KiB | 662.904 / 668.941 KiB |
| Sem mudança (incremental) | 54,96 / 58,01 s | 0,80 / 0,93 s | 674.420 / 682.664 KiB | 72.364 / 72.650 KiB |

O caminho repetido ficou aproximadamente 98,5% mais rápido e 89,3% menor em
RSS. A execução fria não foi artificialmente acelerada nem deixou de validar
tipos: o tempo p50 variou 2,3% dentro da medição local, o p95 caiu 0,8% e o
RSS caiu 1,5% no p50 e 2,2% no p95. Quando uma verificação limpa for necessária,
`npm run typecheck:full` usa `--force`; o CI e o build normal usam o cache
seguro, sem `noCheck`, exclusões novas ou permissões mais frouxas.

## Benchmark do npm-runtime do instalador

O instalador precisa levar uma árvore própria do npm porque o usuário pode não
ter Node/npm instalado. O hook `scripts/bundle-npm-runtime.cjs` copia essa
árvore para `resources/npm-runtime/npm`; ele mantém `bin`, `lib`,
`package.json`, dependências de produção e arquivos auxiliares necessários ao
`node-gyp`, mas não leva documentação, mapas de source e diretórios de testes,
exemplos, fixtures, benchmarks, coverage ou `.github`.

### Como executar

```bash
npm run benchmark:npm-runtime -- \
  --iterations=3 --check --out=/tmp/felixo-npm-runtime.json
```

O relatório compara duas cópias do mesmo `app/node_modules/npm`:

- `baseline`: a política anterior, que removia apenas `docs`, `man` e
  Markdown;
- `current`: a política usada pelo `beforePack`, com a poda conservadora dos
  artefatos que não são carregados pelo npm em produção.

Para cada política a bancada mede bytes descompactados, quantidade de
arquivos e um `tar.gz` portátil com `mtime` fixo. Também abre o `npm-cli.js`
com o binário do Electron (`ELECTRON_RUN_AS_NODE=1`) e mede startup, primeira
instalação e atualização em um prefixo/cache descartáveis. A fixture é local e
usa `--offline`; seus scripts de ciclo de vida, binário via PATH, prefixo,
permissões POSIX/Windows e persistência entre processos são conferidos sem
alterar o npm global ou usar credenciais.

O `--check` falha se a política atual não reduzir bytes e arquivos ou se
qualquer uma das duas políticas deixar de instalar/atualizar a fixture. O
benchmark não impõe um ganho artificial de tempo: startup e instalação são
registrados por SO, enquanto a decisão de aceitar a poda exige redução de
artefato e smoke funcional completo.

No CI, o check roda depois do `npm ci` em Ubuntu, Windows e macOS e publica um
JSON por runner. Depois do empacotamento, `release-smoke-<SO>.json` mede ainda
o tamanho da árvore que realmente foi para `resources/npm-runtime` e os
tempos do npm dentro do artefato; o relatório é publicado como artefato do
workflow de release.

## Custo operacional de gerenciadores alternativos

`scripts/package-manager-operational-performance.cjs` mede o custo operacional
de uma fixture de CLI local nos gerenciadores detectados no `PATH`. O `npm-runtime`
vem de `release/*/resources/npm-runtime` quando o diretório existe; fora de um
artefato, o relatório marca a origem como `source-runtime`.

```bash
npm run benchmark:package-managers:performance:check -- \
  --iterations=2 --agents=1,2,5,10 \
  --out=build/package-manager-alternatives.json
```

Cada cenário usa um prefixo por agente e cache temporário, executa a instalação
offline em paralelo e repete a mesma operação no prefixo já preenchido para
representar o caminho quente. São registrados p50/p95 de duração, RSS, CPU,
árvore de processos, I/O de processo quando o SO fornece a métrica, arquivos e
bytes em disco antes/depois da repetição quente e o crescimento persistente.
O JSON inclui deltas contra o `npm-runtime`, ranking de
alternativas elegíveis e os budgets do gate: 120 s de p95, 512 MiB de RSS, 64
processos e 512 MiB em disco.

O escopo é o gerenciador e a CLI de fixture; o runner não abre o renderer nem
mede responsividade do canvas/terminal ou energia. Esses sinais continuam no
`release-smoke`/benchmarks Electron e devem ser combinados ao analisar uma
migração.

`--check` exige que o npm-runtime esteja disponível, que todas as fases fria e
quente tenham terminado com sucesso e que as métricas não estejam ausentes ou
fora dos budgets. pnpm, Yarn ou Corepack ausentes são mantidos no relatório como
`available: false`; isso permite comparar os três sistemas operacionais sem
instalar ou alterar gerenciadores do usuário. O CI e o workflow de release
publicam um relatório por artefato/SO.

### Resultado reproduzível em 02/09/2026

Linux x64, Node 25.9.0, Electron 41.10.7 e npm 11.19.1, três repetições por
política. O tamanho é lógico (soma dos bytes dos arquivos); o tarball serve
para comparação estável do conteúdo, não é o formato final do instalador.

| Medida | Baseline | Política atual | Variação |
| --- | ---: | ---: | ---: |
| Arquivos | 1.557 | 1.527 | −30 (−1,93%) |
| Runtime descompactado | 8,47 MiB | 8,41 MiB | −67.388 B (−0,76%) |
| Runtime `tar.gz` | 2,20 MiB | 2,16 MiB | −46.686 B (−2,02%) |
| Startup p50 / p95 | 361,935 / 400,447 ms | 396,303 / 403,559 ms | medido; p95 +0,78% |
| Primeira instalação p50 / p95 | 1.071,468 / 1.336,693 ms | 1.073,195 / 1.347,825 ms | medido; dentro da variância |
| Atualização p50 / p95 | 1.091,226 / 1.154,682 ms | 1.099,577 / 1.110,710 ms | medido; p95 −3,81% |

O ganho é deliberadamente conservador: os 30 arquivos retirados são testes,
exemplos e um PNG de exemplo. Não foram removidos módulos por nome, arquivos
JavaScript/JSON/Python ou a árvore do `node-gyp`, porque o npm pode carregá-los
dinamicamente durante instalação de uma CLI. O smoke local passou nas duas
políticas com instalação e atualização offline, lifecycle, PATH, prefixo,
permissões e persistência; os valores de Windows e macOS ficam nos JSONs da
matriz CI/release.

## Avaliação de alternativas ao npm-runtime

Esta bancada responde à pergunta arquitetural de trocar o npm embutido sem
perder a instalação automática das CLIs. Ela não altera o runtime do produto.
O comando usa a bancada do npm para a política atual e, para pnpm e Yarn
Classic, cria em diretórios temporários um pacote local `tar.gz`, um prefixo,
um cache/store e os shims `node` do Electron. Cada alternativa é executada sem
rede depois do bootstrap do gerenciador; são conferidos instalação, atualização,
prefixo, binário no PATH, execução e isolamento. O `--ignore-scripts` torna a
comparação segura, portanto scripts nativos de CLIs reais continuam sendo um
gate de migração separado.

```bash
npm run benchmark:package-managers -- \
  --iterations=2 --check --out=/tmp/felixo-package-managers.json
```

O relatório JSON não grava caminhos da máquina nem saída ilimitada de processos.
Ele separa cinco papéis:

| Candidato | O que é medido | Limite importante |
| --- | --- | --- |
| npm-runtime | árvore embutida, startup, instalação e atualização offline | é o contrato já exercitado por CLIs oficiais, lifecycle, PATH, permissões e persistência |
| pnpm | runtime, bootstrap Corepack, startup e global add/update em `global-dir` + `PNPM_HOME/bin` | exige política própria de store, `PNPM_HOME`, scripts de build e cache offline |
| Yarn Classic | runtime, bootstrap Corepack, startup e `global add/update` em prefix/global-folder | mantém global install, mas não usa o layout nem os comandos de prefixo do npm |
| Yarn moderno | runtime, bootstrap e prova do comando global | PnP/`dlx` não fornece o global install npm-style que o launcher atual exige |
| Corepack | seu próprio runtime e bootstrap frio/quente de versões fixas | é uma ponte; não substitui os artefatos/cache dos gerenciadores nem remove a política de rede |

### Resultado reproduzível em 03/09/2026

Linux x64, Node 25.9.0, Electron 41.10.7, duas repetições de instalação e
atualização. Os bytes são a soma lógica da distribuição do gerenciador; o
`tar.gz` portátil é uma referência comparável, não o formato final do
instalador. O startup das alternativas é uma execução direta de `--version`;
o npm tem p50/p95 da bancada própria. Os números de instalação são p50/p95.

| Candidato | Versão | Arquivos / descompactado / `tar.gz` | Startup | Primeira CLI | Atualização |
| --- | --- | ---: | ---: | ---: | ---: |
| npm-runtime | 11.19.1 | 1.527 / 8,41 MiB / 2,16 MiB | 2.093 / 2.787 ms | 2.857 / 2.925 ms | 3.391 / 3.667 ms |
| pnpm | 11.25.0 | 456 / 19,36 MiB / 4,85 MiB | 4.317 ms | 11.678 / 12.244 ms | 11.542 / 12.322 ms |
| Yarn Classic | 1.22.22 | 12 / 5,09 MiB / 1,19 MiB | 1.464 ms | 5.283 / 5.672 ms | 5.087 / 5.116 ms |
| Yarn moderno | 4.10.3 | 2 / 2,85 MiB / 1,01 MiB | 1.509 ms | não aplicável | não aplicável |
| Corepack | 0.34.6 | 54 / 1016,0 KiB / 223,7 KiB | bootstrap frio: 2.682–8.203 ms | depende do gerenciador | depende do gerenciador |

O pnpm foi funcional, mas levou cerca de 2,3 vezes o tamanho descompactado do
npm e teve instalação/atualização mais lentas nesta máquina. Yarn Classic foi
menor que o npm, porém ainda precisou de uma hierarquia global própria e ficou
mais lento na instalação. Yarn moderno confirmou a incompatibilidade: em um
diretório sem projeto, `yarn global add` falhou de forma esperada; o fluxo
documentado é `yarn dlx`/projeto, que não mantém a CLI no prefixo isolado do
app. Corepack exigiu download no primeiro uso em cache vazia; um produto
offline teria de fixar versão/hash e distribuir ou pré-popular esse cache.

A decisão desta task é **manter o npm-runtime**. A alternativa não é aprovada
por ser menor em um único aspecto: ela precisa preservar instalação global de
CLIs oficiais, atualização, binários, shims, permissões, isolamento por
`userData`, lifecycle nativo, funcionamento offline e os três sistemas
operacionais. Uma migração futura só pode começar depois de fixar versões e
hashes, repetir o smoke em Linux/Windows/macOS com o artefato empacotado e
medir CLIs reais, memória, proxy e primeiro uso sem rede.

Referências de comportamento: [npm install global](https://docs.npmjs.com/cli/v11/commands/npm-install/), [pnpm install offline](https://pnpm.io/cli/install), [pnpm setup e PNPM_HOME](https://pnpm.io/cli/setup), [Yarn Classic global](https://classic.yarnpkg.com/lang/en/docs/cli/global/), [Yarn moderno `dlx`](https://yarnpkg.com/cli/dlx), [PnP do Yarn](https://yarnpkg.com/features/pnp) e [Corepack](https://github.com/nodejs/corepack#offline-workflow).

No CI, `ci.yml` executa `--check` na matriz Ubuntu/Windows/macOS e publica um
JSON por runner. A ausência de um gerenciador opcional fica explícita como
`unavailable`; se ele estiver presente e falhar no smoke, o job falha. `--strict`
fica disponível para uma bancada que exija pnpm e Yarn Classic no host.

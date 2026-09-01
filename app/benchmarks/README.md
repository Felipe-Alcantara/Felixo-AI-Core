# Benchmark de scrollback do terminal

Esta bancada mede os custos que podem ser confundidos quando há vários
terminais abertos:

- `native-pty`: processos `node-pty`, entrega de bytes, latência da primeira
  saída e RSS dos filhos, sem criar xterm;
- `renderer-xterm`: buffers visuais xterm, escrita, frames, long tasks,
  attach/detach, fechamento e replay de resume.

O histórico visual do xterm não é o mesmo que o replay persistido pelo processo
principal. Hoje o manager mantém até 200.000 caracteres para reanexar uma
sessão, enquanto cada xterm nasce com `TERMINAL_SCROLLBACK = 20_000` linhas.

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

O limite de 20.000 permanece como contrato padrão. Ele preserva mais contexto
para leitura e resume; reduzir globalmente para 5.000 diminuiria o custo, mas
também faria o terminal perder 3.105 linhas visuais por sessão neste cenário.
Os dados justificam investigar uma política adaptativa para 10 ou mais sessões,
mas não justificam aplicá-la silenciosamente: ainda é preciso decidir o que a
UI deve mostrar quando um terminal antigo fica fora do buffer e validar a
restauração com sessões reais.

Por isso este change centraliza o limite, cobre-o com teste e deixa o benchmark
com `--check` como regressão reproduzível. Uma futura alteração adaptativa deve
ser comparada contra este baseline e preservar input, output, foco, resize,
fila de escrita, attach/detach e resume.

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

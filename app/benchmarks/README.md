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

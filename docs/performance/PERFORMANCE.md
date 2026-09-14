# Auditoria de performance — Felixo AI Core

Última revisão: 2026-09-12  
Escopo: renderer do Canvas, terminal/xterm, carregamento do bundle e árvore de
processos Electron.

Este documento separa medições reais de hipóteses. Números sem uma execução
registrada ficam como **NÃO MEDIDO**.

## Contexto da medição

- Windows `10.0.19045`, x64
- 12 CPUs lógicas, 16.310 MiB de RAM
- Node `v24.18.0`, Electron `41.10.7`, xterm `6.0.0`
- Renderer dos benchmarks: viewport `1592×948`, device pixel ratio `1`
- App observado: árvore Electron de desenvolvimento com raiz PID `21896`
- A árvore de desenvolvimento tinha 7 processos; as amostras de memória
  abaixo somam a árvore inteira, não apenas o renderer.

## Mapa de execução auditado

```text
Electron main
├── janelas e ciclo de vida
├── IPC / preload tipado
├── PTY, node-pty e processos de agentes
├── persistência SQLite / preferências
└── serviços de arquivos, Git, modelos e automação
        │
        ▼
React renderer
├── App → CanvasView (rota principal, lazy)
├── CanvasSurfacesProvider (painéis, viewport e dimensões)
├── React Flow (nodes, edges, culling e minimap)
├── TerminalNode → TerminalSessionStore → xterm
├── CanvasToolPanels (ferramentas sob demanda)
└── camada ambiental CSS/SVG (decorativa, sem dados do grafo)
```

Decisões já saudáveis encontradas durante a auditoria:

- `onlyRenderVisibleElements` já está ativo no React Flow.
- O índice de conexões evita buscas completas repetidas por aresta.
- Nodes de terminal são memoizados e a sessão viva fica fora da árvore React.
- Saída de terminal é limitada por política de chunks/scrollback e preserva
  integridade no attach/detach/resume.
- Chat legado, Markdown pesado, Excalidraw e painéis raros entram por chunks
  sob demanda.
- A assinatura usada para distinguir trabalho real de spinner só publica
  transições relevantes; não há atualização React por byte de saída.

## Baseline observado

### Canvas / React Profiler

O benchmark de conexões compara duas projeções do mesmo fixture (busca
baseline versus índice). Ele não é um antes/depois isolado do patch ambiental;
serve para localizar a escala do Canvas e confirmar a área de maior custo.

| Fixture | Cenário | p50 | p95 | Heap Δ p95 | DOM |
|---|---|---:|---:|---:|---:|
| 100 nodes | render baseline | 43,85 ms | 45,515 ms | 6.106.981 B | 65 |
| 100 nodes | render indexado | 23,85 ms | 27,135 ms | 4.225.626 B | 65 |
| 100 nodes | drag baseline/indexado | 0,60 / 0,50 ms | 0,69 / 0,50 ms | 6.299.835 / 4.704.709 B | 65 |
| 500 nodes | render baseline | 108,30 ms | 133,68 ms | 7.825.010 B | 145 |
| 500 nodes | render indexado | 104,40 ms | 132,48 ms | 7.861.359 B | 145 |
| 500 nodes | drag baseline/indexado | 2,90 / 1,05 ms | 2,90 / 1,275 ms | 8.707.464 / 8.169.145 B | 145 |

Conclusão: o caminho normal de drag fica abaixo do orçamento de um frame no
fixture, mas o mount inicial de 500 nodes é naturalmente pesado e continua
acima de `16,67 ms`. Isso permanece um gargalo conhecido, não escondido.

### Terminal / xterm

Os cenários reduzidos escreveram 1.000 linhas por sessão, com 1 e 5 sessões.
As duas rodadas preservaram todas as linhas, o trecho final e o attach/detach.
As diferenças de tempo abaixo não devem ser tratadas como ganho do patch
ambiental, pois são janelas Electron novas e o cenário mede a política de
scrollback já existente.

| Rodada | Sessões | Política | Frame p50/p95 | Write p50/p95 | RSS renderer p95 |
|---|---:|---|---:|---:|---:|
| Antes | 1 | current / 5.000 | 6,9 / 7,0 ms | 5,3 / 7,96 ms | 133,006 MiB |
| Depois | 1 | current / 5.000 | 6,9 / 7,0 ms | 5,4 / 8,04 ms | 132,277 MiB |
| Antes | 5 | current / 5.000 | 7,0 / 27,7 ms | 5,8 / 17,57 ms | 186,103 MiB |
| Depois | 5 | current / 5.000 | 16,7 / 33,22 ms | 6,1 / 16,28 ms | 176,596 MiB |

O teste de saída de CLI em cenário curto também preservou DOM máximo (`27 →
27`) e heap p95 praticamente estável (`1.192.191 → 1.194.147 B`), sem perda
de chunks. A variação de p95 não é suficiente para declarar regressão do
produto com duas repetições.

### Idle da árvore Electron

Uma amostra de 15 segundos com a mesma raiz de desenvolvimento registrou:

| Métrica | Antes | Depois |
|---|---:|---:|
| CPU acumulada em 15 s | 0,000 s | 0,047 s |
| Working set da árvore | 557,8 MiB | 549,6 MiB |
| Private bytes da árvore | 499,2 MiB | 491,3 MiB |

Isso representa uma observação daquele estado da máquina, não uma garantia
universal. O custo de CPU ficou próximo de zero; a amostra posterior equivale
a aproximadamente `0,31%` de um core durante 15 s.

### Bundle e carregamento

O build posterior produziu:

- `10.137.916` bytes em `dist`;
- `201` assets JavaScript inventariados;
- entry inicial de `197.489` bytes;
- `0` referências de asset ausentes.

Os maiores chunks continuam sendo Excalidraw, runtime compartilhado,
Markdown/cytoscape e terminal. Eles já estão fora do caminho inicial quando a
arquitetura permite.

Startup real empacotado, primeira interação e abertura de Fetch All: **NÃO
MEDIDO**. A bancada `bundle-load-benchmark.cjs` conseguiu inventariar os
assets, mas o renderer empacotado falhou ao executar o script de medição em
duas tentativas nesta máquina Windows; a limpeza do perfil temporário também
encontrou `EPERM`. O erro foi mantido como limitação, não convertido em
latência falsa.

## Otimizações aplicadas nesta passada

1. A textura de grain da atmosfera saiu de um SVG com `feTurbulence` em tela
   inteira e virou um padrão CSS estático microscópico. A composição continua
   autoral e visualmente sutil, sem filtro procedural recalculado.
2. A rota ambiental superior deixou de usar animação CSS infinita. As rotas
   são composição estática e não consomem uma atualização contínua quando o
   app está ocioso, desfocado ou minimizado.
3. O callback de movimento do React Flow agora atualiza o percentual de zoom
   somente quando o valor arredondado mudou. Pan/drag não gera state update de
   zoom redundante.
4. Foi removido um `console.log` diagnóstico que copiava recortes de saída do
   terminal a cada mudança significativa. A lógica de assinatura, status,
   idle check e notificações permanece igual.
5. As transições de drawer, painel, toolbar, menus e dock foram reduzidas para
   uma faixa de aproximadamente `140–240 ms`. O feedback continua animado,
   mas nenhuma abertura fica aguardando uma coreografia longa.
6. O arrasto direto de nodes desabilita easing de posição durante o gesto. As
   duas bordas redimensionáveis coalescem eventos em `requestAnimationFrame` e
   ainda aplicam a última posição no `mouseup`, mantendo o movimento aderente
   ao ponteiro sem uma atualização React por evento de mouse.

Nenhuma dessas mudanças altera contratos de IPC, criação de PTY, persistência,
seleção, conexão, expansão de sidebar, ferramentas, arquivos ou agents.

## Guardrails para próximas mudanças

- Não adicionar loop `requestAnimationFrame`, `setInterval` ou polling para
  decoração. Se houver movimento futuro, ele deve ser orientado a estado e
  desligar com `prefers-reduced-motion`.
- Não usar `feTurbulence`, `backdrop-filter` amplo, blur gigante ou glow em
  centenas de elementos do canvas.
- Não serializar o grafo inteiro em `mousemove`, `onMove` ou cada frame.
- Não ligar a saída de cada byte do terminal a state React global.
- Manter nodes fora do viewport podados e evitar que uma mudança local invalide
  sidebar, inspector e todos os nodes.
- Batching de output deve preservar ordem, replay, attach/detach e limite de
  memória; qualquer alteração precisa rodar as bancadas de terminal.
- `will-change` só pode existir durante uma transição real, nunca como padrão
  em toda a superfície.
- Toda nova camada ambiental deve ser validada em canvas vazio e canvas cheio.

## Modo Performance (2026-09-13)

Motivo: feedback direto de um usuário com notebook mais fraco relatando o app
pesado. Em vez de só ajustar internamente, a saída ficou visível e sob
controle da pessoa: um interruptor em Configurações (logo abaixo do tema,
tanto no canvas quanto no chat), persistido em `localStorage` e aplicado via
`data-performance-mode` no elemento raiz — sem reload, sem reiniciar
terminal.

Quando ligado, corta apenas decoração e coreografia, nunca dado ou contrato:

- O céu animado do canvas (`CanvasAmbientLayer`) não monta: ~1.280 sombras de
  estrela e a camada de compositor que as anima somem, não só a animação.
- O minimapa do React Flow não monta.
- Painéis, menus, docas, toolbar, controles de formulário e o pulso da aresta
  ativa perdem transição/animação — o mesmo corte que `prefers-reduced-motion`
  já aplicava, agora também disponível por escolha manual (`index.css`, blocos
  logo após cada `@media (prefers-reduced-motion: reduce)`).
- `useDeferredExpansionPanel` para de esperar uma animação que não vai rodar.

Fora do escopo desta passada, de propósito: scrollback do xterm, política de
batching de saída do terminal e modo gráfico (GPU/software, que já tem seu
próprio controle em "Renderização e recuperação"). Nenhum dado, replay,
attach/detach ou contrato de IPC muda.

## Reexecução

Na pasta `app/`:

```powershell
npm run typecheck:full
npm run build
$env:VITE_DEV_SERVER_URL='http://127.0.0.1:5173'
npx electron scripts/canvas-connection-performance.cjs --sizes=100,500 --scenarios=render-inicial,drag --iterations=2 --out=../docs/performance/after-canvas-dev.json
npx electron scripts/terminal-output-performance.cjs --scenarios=curta --iterations=2 --out=../docs/performance/after-terminal-output-dev.json
```

Artefatos desta auditoria:

- [baseline-canvas-dev.json](baseline-canvas-dev.json)
- [after-canvas-dev.json](after-canvas-dev.json)
- [baseline-terminal-output-dev.json](baseline-terminal-output-dev.json)
- [after-terminal-output-dev.json](after-terminal-output-dev.json)
- [baseline-terminal-scrollback.json](baseline-terminal-scrollback.json)
- [after-terminal-scrollback.json](after-terminal-scrollback.json)
- [baseline-bundle.json](baseline-bundle.json)
- [after-bundle.json](after-bundle.json)

Os JSONs de bundle incluem o inventário de assets mesmo quando a parte de
startup falhou. Os JSONs são evidência bruta; este documento é a interpretação
com as limitações acima.

## Validação desta passada

- TypeScript completo: passou.
- Build Vite: passou; o aviso de chunks grandes existente permanece.
- ESLint: passou com os dois warnings React pré-existentes em
  `features/chat/components/SearchPanel.tsx`; nenhum erro.
- Suíte frontend completa: passou — `90` arquivos, `836` testes e `1` skip.
- `git diff --check`: passou; o repositório tem alterações prévias amplas e
  não foi resetado.
- Input latency humana/frame time durante gesto: **NÃO MEDIDO** nesta rodada;
  a garantia aqui é estrutural (sem easing no drag e batching por frame), não
  uma promessa de milissegundos para todo hardware.

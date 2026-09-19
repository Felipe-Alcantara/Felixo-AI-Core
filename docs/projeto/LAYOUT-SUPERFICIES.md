# Inventário de superfícies do layout

Levantado lendo o código (não medido numa janela real) em 19/09/2026, para a task
"redimensionar painéis e janelas nos dois eixos sem quebrar em telas pequenas".
Cada linha diz se a superfície redimensiona, em qual eixo e o tamanho mínimo útil.
Onde não deu para conferir na tela, está dito.

Fonte dos números: `panel-sizing.ts`, `canvas-surfaces.ts`, `terminal-drawer-pin.ts`,
`NodeResizer` de cada bloco e as classes de cada modal.

## Regra que não pode ser quebrada

Painel, gaveta do terminal e inspector **disputam a largura**; o que sobra é o
canvas (`MIN_CANVAS_STRIP` = 160 px). Essa divisão é calculada **numa passada só**
por `splitHorizontalSpace` — nunca cada superfície lendo o valor já cortado da
outra. Foi essa leitura circular que gerou o loop "painel e gaveta se espremendo"
de 12/09/2026. Qualquer redimensionamento novo na LARGURA passa por
`useCanvasSurfaces().reportPanelWidth`; um eixo que não disputa espaço com as
outras superfícies (a altura do painel) não precisa falar com o coordenador.

## Painéis e barras

| Superfície | Largura | Altura | Mínimo útil | Observação |
|---|---|---|---|---|
| Painéis de ferramenta (`CanvasPanel`, ~15) | **sim** (arrasto na borda direita, setas, `Home`/duplo clique = padrão) | **sim, a partir desta fatia** (borda de baixo, setas ↑↓, `Home`/duplo clique = altura do conteúdo) | largura 260–380 por porte (`sm`…`xl`); altura 240 | Largura: `PANEL_SPECS`, teto `min(spec.max, viewport − 340)`. Altura: piso 240, teto `viewport − 112` (`getPanelMaxHeight`). Persistem por painel no `localStorage`. |
| Painel "workspace" (Tarefas Notion) | não (ocupa a largura livre) | não (altura toda) | — | Página, não janela: por desenho. |
| Gaveta do terminal (`TerminalDrawer`) | **sim** (`col-resize`) | não (preenche) | 440 (`DRAWER_MIN_WIDTH`) | Só existe com um terminal expandido. |
| Inspector "Elementos" | não (288 fixo, `INSPECTOR_WIDTH`) | preenche | 288 | Recolhe para um puck (não reserva espaço). |
| Sidebar | não (288 expandida / 52 trilho) | preenche | 52 | Recolher/expandir. |
| Mini Map | encolhe sozinho (200×150 → 96×72) | idem | 96×72 | É a única superfície que **pode sumir** (nenhuma ação depende dele). |

## Blocos do canvas (`NodeResizer`, dois eixos)

| Bloco | Mínimo (largura×altura) |
|---|---|
| Terminal | 200 × 120 |
| Nota | 180 × 120 |
| Arquivo | 220 × 140 |
| Grupo | 240 × 180 |
| Desenho leve | 220 × 180 |
| Página Web | 360 × 280 |
| Desenho Excalidraw | 360 × 280 |
| Tarefas Notion | 760 × 460 |

Todos redimensionam nos dois eixos. O Tarefas Notion tem o maior mínimo (760 × 460):
em uma janela de 800 px ele já cobre quase tudo — candidato a revisão.

## Modais (tamanho fixo por `max-w`/`max-h`; **nenhum redimensiona**)

Nenhum estoura a janela (todos têm `max-h` em `vh`/`dvh`), mas o tamanho é dado pelo
componente, não pela pessoa.

| Modal | Máximo declarado |
|---|---|
| `HandoffDialog` | `max-w-md`, `max-h calc(100dvh − 2rem)` |
| `AgentQuestionDialog` | `max-w-md` (bloqueante; redimensionar não faz sentido) |
| `ModelConfigModal` | 400 px, 80vh |
| `ModelManagerModal` | 480 px, 85vh |
| `ChatExportModal` | 340–460 px |
| `ProjectsModal` | `max-w-lg` |
| `AgentUsageLimitsModal` | 1040 px, 92vh |
| `NotesModal` | 900 px, 82vh (altura fixa) |
| `AutomationsModal` | 860 px, 86vh |
| `OrchestratorSettingsModal` | 640 px, 82vh |
| `FelixoSettingsModal` | 620 px, 86vh |
| `SkillsModal` | 900 px, 86vh |
| `CodePanel` | 820 px, 86vh |

## Flyouts e menus (fixos, pequenos)

`NodeColorMenu` (176 px), `WebviewProfileMenu` (208 px, com posição limitada à janela),
flyouts da barra (`toolbar-flyout.ts`), `TerminalMenu`. Não redimensionam; o risco aqui
não é tamanho, é ficar fora da tela em janela estreita.

## Estado desta fatia

Feito: altura dos painéis de ferramenta (hook próprio, sem tocar no coordenador),
invariantes testadas (a altura cabe na janela em qualquer altura de 200 a 2400),
smoke de viewport em 1366×768, 1024×640 e 800×600.

Pendente (tasks próprias): modais (13 componentes), gaveta e inspector na vertical/
horizontal, revisão do mínimo do bloco Tarefas Notion, e conferir tudo numa janela
real — nada disto foi visto rodando por quem escreveu este documento.

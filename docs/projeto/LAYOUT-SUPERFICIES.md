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
| Gaveta do terminal (`TerminalDrawer`) | **sim** (`col-resize`) | não — **por decisão** (ver abaixo) | 440 (`DRAWER_MIN_WIDTH`) | Coluna de altura total (`h-full`); só existe com um terminal expandido. Tem recolher e maximizar. |
| Inspector "Elementos" | não — **por decisão** (288 fixo, `INSPECTOR_WIDTH`) | preenche | 288 | Recolhe para um puck (não reserva espaço). |
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
| Tarefas Notion | **480 × 320** (era 760 × 460) |

Todos redimensionam nos dois eixos. Os mínimos vêm de uma fonte única,
`NODE_MIN_SIZE` (`node-geometry.ts`), que os `NodeResizer` e `getDefaultNodeSize` leem;
um teste garante que nenhum bloco nasce menor que o próprio mínimo em nenhuma largura
de janela (a nota nascia com 158 px contra um mínimo de 180).

## Modais (redimensionáveis nos dois eixos, exceto `AgentQuestionDialog`)

Os 12 modais usam `useResizableDialog(id)` + `<DialogResizeHandles>` (`features/shared/dialog/`):
alças na borda direita, na inferior e no canto; setas ajustam, `Home`/`Enter`/duplo clique
voltam ao original. Sem ajuste não há estilo inline — o modal segue exatamente como era.
Depois de ajustado o tamanho é fixo, sempre dentro de [mínimo 320×240, janela − 16 px] e
lembrado por modal (`felixo:dialog-size:<id>`). Como o modal é centralizado, arrastar uma
borda por `dx` cresce `2·dx` (a borda acompanha o ponteiro). Soltar o mouse fora da moldura
dispararia `click` no fundo e fecharia o modal: `swallowNextClick` engole esse clique.
O hook é chamado antes do `return null` antecipado de cada componente. A tabela abaixo
mostra o tamanho ORIGINAL (o que vale até a pessoa ajustar); o `AgentQuestionDialog` fica
fora porque é bloqueante.

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

## Decisões (podem ser revistas)

**Gaveta do terminal: sem eixo vertical.** Ela é uma coluna encostada na direita, de
altura total (`h-full` dentro da linha flex do canvas), não uma janela. Não há altura a
redimensionar sem transformá-la numa janela flutuante — outra feature, com outro
custo (posição, sobreposição, foco). Continua com largura arrastável, recolher e
maximizar.

**Inspector "Elementos": continua com 288 fixo.** `INSPECTOR_WIDTH` é uma constante
lida pelo coordenador de superfícies, por `layout-invariants.ts` e pelo próprio painel.
Torná-lo variável faria dele um terceiro disputante em `splitHorizontalSpace`
(painel × gaveta × inspector) — exatamente o acoplamento que gerou o loop de
12/09 — para uma superfície que já devolve espaço quando recolhida (vira um puck e
reserva 0). O ganho não paga o risco. Se a pessoa precisar de mais espaço, recolhe.

**Tarefas Notion: mínimo 480 × 320** (era 760 × 460). O conteúdo do bloco rola por dentro
e o painel usa colunas flexíveis. O tamanho padrão continua o de sempre (1040 × 680,
escalado pela janela).

## Estado

Feito: altura dos painéis (PR #60); fonte única dos mínimos dos blocos, piso em
`getDefaultNodeSize` e mínimo do Tarefas Notion reduzido (esta fatia), com teste de
invariante em 10 larguras de janela (320–3840) × 8 tipos de bloco.

Feito também: modais (12 componentes; teste de invariante de janela e do clique de soltar). Pendente: para tudo isto: conferir numa
janela real — nada foi visto rodando por quem escreveu este documento.

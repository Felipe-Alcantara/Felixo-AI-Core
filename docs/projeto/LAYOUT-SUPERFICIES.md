# Inventário de superfícies do layout

> Este documento trata de **tamanho e eixo**. O inventário operacional (estados, botões
> com efeito e falha, persistência, IPC, testes e lacunas de cada elemento) está em
> [INVENTARIO-CANVAS.md](INVENTARIO-CANVAS.md), gerado do código e conferido por teste.

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

## Overlays do tutorial (não reservam largura)

O tutorial do canvas (26/09/2026) não entra na disputa de largura: card, anel,
aviso de novidade e menu Ajuda são `position: fixed` por cima do layout, fora de
`splitHorizontalSpace` e de `useCanvasSurfaces`. Nenhum deles empurra o canvas, a
gaveta ou o inspector. A posição é calculada por `computeCardPlacement`
(`onboarding-layout.ts`, puro) e escrita pela ref, sem re-render por quadro.

| Superfície | Tamanho | Posição | Observação |
|---|---|---|---|
| Card do tour | `min(22rem, 100vw − 24px)`; altura até o espaço do lado escolhido | Ancorado ao lado do alvo (preferido do passo, depois baixo, cima, esquerda), a 10 px dele e a 12 px da borda | Nunca cruza o alvo. Viewport compacto (largura < 480 ou altura < 360 CSS px) vira **folha** de largura cheia na borda oposta ao alvo, com altura `max(160, 60%)`; o corpo rola e o rodapé fica visível. Quando nenhuma borda recebe a folha sem cobrir o alvo (zoom alto na janela mínima, ≈ 416×289, com o alvo no meio da altura), a folha vai para a **coluna ao lado do alvo** (no mínimo 160 px de largura, no máximo a do card), na faixa livre mais próxima dele. Só um alvo maior que meia janela (a região do canvas) pode ficar sob o card |
| Anel | O retângulo do alvo, contido na janela | Sobre o alvo | `outline` de 2 px com 2 px de folga, `pointer-events: none` |
| Aviso de novidade | `min(18rem, 100vw − 24px)` | Ancorado à direita da Ajuda, pelo mesmo cálculo | Sem timer e sem foco automático |
| Menu Ajuda | Conteúdo, com `max-height` da janela − 16 px | À direita do botão Ajuda, contido na janela | `FelixoPopoverSurface` (portal) |

**Obstáculos.** O card e o aviso desviam de `[data-felixo-tour-avoid]` (a caixa do
toast das CLIs, no canto inferior direito, e a do `NoticeToast`, embaixo no centro)
e de `[data-canvas-layout-warning]` sempre que há lado livre. Na folha, a borda sem
obstáculo vence; com as duas ocupadas, a altura encolhe até o piso de 160 px; sem
isso, vale a coluna ao lado do alvo; e só então o card cobre o obstáculo
(limitação declarada: card em z 55 sobre o aviso em z 50) até a pessoa avançar ou
pular. O alvo pequeno nunca é o preço: cobrir o obstáculo vem antes. A última
limitação declarada é uma janela sem coluna de 160 px de nenhum lado do alvo e sem
160 px acima ou abaixo dele; aí a folha cobre o alvo.

**Escala de z.** statusbar e topbar (18) < dock e painéis (20/30) < sidebar (26) <
overlay `isBusy`, toast das CLIs, `NoticeToast` e menu de cor (50) < anel (54) <
card e aviso (55) < `AgentQuestionDialog` e `HandoffDialog` (60) <
`WebviewProfileMenu` (70) < `FelixoSelect` e menu Ajuda (1000). Os tokens
`--felixo-z-onboarding-ring` e `--felixo-z-onboarding` ficam em `index.css`.
Enquanto um diálogo modal (z 60) está aberto, o card e o aviso ficam `inert`, no
mesmo passo e no mesmo lugar, e voltam quando ele fecha: o overlay os cobre, então
nem o foco nem o teclado podem ficar neles. A posição congela (`placementFrozen`)
porque o fundo do diálogo cobre todos os alvos, e o teste do centro jogaria o card
no alvo reserva, com outro texto, por baixo do diálogo. O foco que era deles espera num elemento invisível
com `nokey`, irmão do card (`OnboardingFocusHold`), e nunca no body: no body o
React Flow trata Delete e Backspace como teclas do canvas e apagaria o bloco
selecionado por baixo do diálogo.

**Rail.** A Ajuda é o sexto botão do grupo de cima (≈ 271 px dentro de ≈ 289 px na
altura mínima). Um botão novo acima dela exige refazer essa conta, senão o alvo do
último passo é recortado.

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

## Mapa de medição e escrita de geometria

Levantado em 26/10/2026 para a task "mapear pipeline de medição geométrica e coalescer RAF
entre superfícies": leitura de todo `app/src` (171 ocorrências de `getBoundingClientRect`,
`ResizeObserver`, `requestAnimationFrame`, `innerWidth`…) e medição no app real
(`felixo devtools`, perfil isolado, terminal de verdade na gaveta).

### Regra para superfície nova (o pipeline "medir, resolver, aplicar uma vez, notificar só mudança efetiva")

O desenho já existia em `CanvasSurfacesProvider`; a decisão desta task foi **escrevê-lo como
regra**, não criar um framework (o motivo está em "Decisões" abaixo).

1. **Pedir, não cortar.** A superfície publica o que QUER (`report*Width`), sem se limitar
   pelo vizinho.
2. **Resolver numa passada.** Uma conta pura decide todas as larguras de uma vez
   (`splitHorizontalSpace`), só a partir dos pedidos. Teste de ponto fixo: reaplicar a saída
   como pedido não muda nada (`canvas-surfaces.test.ts`).
3. **Ler o resultado, nunca recalcular o teto do outro.** O valor final volta por
   `useCanvasSurfaces().occupancy`.
4. **Medir sem escrever no que se observa.** Observer e evento só leem; a posição de um
   popover vai por `style.left/top` (não muda o tamanho que o observer vigia) e o gesto de
   arrasto é coalescido em no máximo um RAF por consumidor.
5. **Notificar só o que mudou.** Os setters comparam com o valor atual
   (`current === width ? current : width`); o processo principal ignora `pty:resize` com as
   mesmas colunas e linhas (`pty-process-manager.cjs:809`); o clamp só loga na transição.
6. **Cleanup simétrico e testável.** Todo observer, listener, RAF e intervalo é desfeito no
   cleanup; a lógica que não precisa de DOM mora num módulo puro
   (`terminal-fit-lifecycle.ts`, `canvas-surfaces.ts`), porque o repositório não tem jsdom.
7. **Piso da própria superfície.** Nenhuma superfície some por falta de espaço: o teto é
   `Math.max(piso, disponível)`, inclusive o trilho recolhido (44 px).

### Quem lê e quem escreve geometria

| Quem | Lê | Escreve | Gatilho / agendamento | Limpeza |
|---|---|---|---|---|
| `CanvasSurfacesProvider.tsx:44-51` | `innerWidth/innerHeight` | estado `viewport` | `resize`, síncrono (React agrupa) | `removeEventListener` |
| `useResizablePanelWidth.ts:69-177` | `innerWidth`, `clientX` | estado `width`, `body.style.cursor/userSelect` | `resize`; `mousemove` com 1 RAF coalescido (`:125-134`) | cancela RAF e ouvintes ao desmontar |
| `useResizablePanelHeight.ts:54-116` | `innerHeight`, `clientY`, `getBoundingClientRect` só no início do arrasto (`:119`) | estado `height` | idem | idem |
| `useResizableSidebarWidth.ts:67-125` | `innerWidth`, `clientX` | estado `width` | idem | idem |
| `TerminalDrawer.tsx:396-475` | `innerWidth`, `clientX` | estado `width` | `mousemove` com 1 RAF coalescido (`:425-434`) | idem |
| `TerminalDrawer.tsx:352-368` + `terminal-fit-lifecycle.ts:33-62` | container do xterm (via `fitAddon.fit()`) | linhas/colunas do xterm, `pty:resize` | efeito de `effectiveWidth`; `ResizeObserver` + 1 RAF no attach | `disconnect` + `cancelAnimationFrame`, idempotente (testado) |
| `CanvasView.tsx:793-812` (auto-enquadramento) | `getBoundingClientRect` do container (`useSafeViewport.ts`) | câmera do React Flow (`setViewport`) | efeito de `fitCanvasViewSafely` (muda com `occupancy`); cancela o RAF pendente e pede outro | `cancelAnimationFrame` |
| `CanvasView.tsx:503-571` (fechar a gaveta) | retângulos do nó e do container | foco, `dispatchNodeMountLatch` | 2 RAF de acomodação + até 12 tentativas de foco | só termina sozinho |
| `CanvasPanel.tsx:265-270` | `innerHeight` | estado `maxHeight` | `resize` | `removeEventListener` |
| `TerminalsPanel.tsx:387-396` (inspector) | nada: largura fixa | `reportInspectorWidth` | muda de estado | zera ao desmontar |
| `DictationButton.tsx:99-118` | âncora e caixa | `style.left/top` | `ResizeObserver` na caixa + `resize` | `disconnect` + `removeEventListener` |
| `OnboardingHelpMenu.tsx:168-191` | âncora e caixa | `style.left/top/maxHeight` | idem | idem |
| `OnboardingTourLayer.tsx:232-324` | alvos, card, região do canvas | `style.top/left/width/maxHeight` do card e do anel | `ResizeObserver`, 2 `MutationObserver`, `resize`, `scroll`, `transitionend`, `animationend`, intervalo de reverificação (só age no fallback); tudo passa por 1 RAF (`schedule`) | desfaz tudo |
| `useResizableDialog.ts:26-99` | `innerWidth/innerHeight`, `offsetWidth/Height` | estado do tamanho do modal | `mousemove` do arrasto | cleanup do efeito |
| `FelixoSelect.tsx:111-120`, `LinkChooserHost.tsx:163,249`, `WebviewProfileMenu.tsx:36-38` | âncora e janela | posição do menu | uma leitura ao abrir | — |
| `ClaudeApiNode.tsx:321-335`, `TerminalReadingPanel.tsx:74-89` | `scrollHeight/clientHeight` | `scrollTop` | `ResizeObserver` do conteúdo | `disconnect` |
| `useMatrixArrange.ts:131-132` | — | posições dos blocos | 2 RAF aninhados (animação) | cancela ao reorganizar |
| `getDefaultNodeSize(tipo, window.innerWidth)` (`CanvasView.tsx` ×6, `useWebpageOpeners.ts` ×2) | `innerWidth` na hora de criar | tamanho inicial do bloco | uma leitura | — |
| RAF só de foco (barra de ferramentas ×13, `TerminalMenu` ×3, `GenerateImageButton`, `AccountChainSection`, `useAccountContinuation`, `useFocusRestore`…) | — | foco | 1 RAF por ação | — |

De terceiros, sem dono no app: o `ResizeObserver` do React Flow (`@xyflow/react` 12.11.6) no
container do canvas e o laço de repintura do xterm (RAF próprio).

### Medido no app real (26/10/2026)

Perfil isolado, terminal de verdade (Claude) na gaveta, janela de teste exibida sem foco e
transparente (janela escondida estrangula o RAF a ~2 quadros/s). Os tempos absolutos não valem
(renderização sem GPU real); vale a comparação entre cenários.

| Cenário | Resultado |
|---|---|
| Arrasto da gaveta, 120 quadros (3 repetições) | 120 RAF do `scheduleResize` (1 por quadro), 39–43 do auto-enquadramento, ~45 do xterm; observers novos 0; listeners líquidos 0 |
| `fit()` por quadro de arrasto | ≈ 1,8 (efeito + callback do observer): 67–77 `pty:resize` por arrasto. Cada ida e volta de IPC custa 0,2 ms (p95 0,6 ms), e o principal ignora o repetido. Redundante e irrelevante |
| Mesmo arrasto com a câmera nas mãos da pessoa (auto-enquadramento desligado) | RAF do `CanvasView` 0 e `getBoundingClientRect` 0 (contra 54–64); 4,0–4,1 s contra 5,2–5,5 s; p95 69–71 ms contra 118–134 ms. Ocioso: mediana 12,4 ms |
| Resize real da janela, 90 passos (1000–1500 px), painel + gaveta abertos | geometria assentou 2 quadros depois do último passo; observers novos 0; listeners líquidos 0 |
| Abrir/fechar a gaveta 15× e o painel 15× | observers vivos voltam a 0 (1 com a gaveta aberta); listeners de `window`/`document` líquidos 0 |
| Zoom de página (janela de 1304 px, painel + gaveta) | +3 → 754×403: painel 260 e gaveta 440 nos pisos, sobreposição declarada e aviso "Pouco espaço horizontal"; −3 → 2253×1202: painel 380, gaveta 492, sem aviso; assenta em 0 quadros |
| Aviso `ResizeObserver loop completed with undelivered notifications` | 15–21 por arrasto de 120 quadros; era 153 de 176 entradas `error` do QA Logger |
| Trilho recolhido da gaveta, janela de 720 px, sidebar e inspector expandidos | 16 px antes da correção, 44 px depois |

### Decisões e o que ficou de fora

- **Não há agendador de RAF compartilhado.** Só um gesto de arrasto existe por vez, cada
  consumidor pede no máximo um RAF por quadro (120 pedidos para 120 movimentos, não mais), o
  `resize` da janela é síncrono e o React agrupa as atualizações. Um coalescedor central não
  reduziria nenhum desses números. O único consumidor com custo medido é o
  auto-enquadramento da câmera, que refaz o enquadramento a cada largura nova da gaveta;
  mudar isso (esperar o soltar do arrasto) altera o que a pessoa vê e ficou como task.
- **O aviso do `ResizeObserver` é do React Flow, não do `fit()` do xterm.** O callback do
  observer do React Flow dispara um render que aplica a largura pendente da gaveta dentro da
  mesma entrega (o `div.react-flow__renderer` muda 836→852 px e o corpo da gaveta 467→451 px),
  então o Chromium adia o resto para o quadro seguinte. É benigno (nada se perde e converge), por isso
  `renderer-error-reporting.ts` o grava como `warn` com escopo `renderer:resize-observer-loop`,
  uma entrada por janela de 10 s com a contagem das omitidas, em vez de `error`. Se um dia
  subir para centenas por janela, é o sinal de laço real.
- **Não coberto por teste de componente:** os hooks de arrasto e os posicionadores de popover
  (o repositório não tem jsdom). A cobertura é a de lógica pura, a do ciclo do `fit` e a medição
  acima.

## Estado

Feito: altura dos painéis (PR #60); fonte única dos mínimos dos blocos, piso em
`getDefaultNodeSize` e mínimo do Tarefas Notion reduzido (esta fatia), com teste de
invariante em 10 larguras de janela (320–3840) × 8 tipos de bloco.

Feito também: modais (12 componentes; teste de invariante de janela e do clique de soltar). Pendente: para tudo isto: conferir numa
janela real — nada foi visto rodando por quem escreveu este documento.

Feito em 26/10/2026: o mapa e a regra de superfície nova (acima), medidos num app real com
terminal de verdade; testes de medida oscilante, ponto fixo, janela pequena, gaveta fechada ou
recolhida e zoom de página; o trilho recolhido deixou de sumir na janela mínima; o aviso do
`ResizeObserver` virou `warn` contado em vez de `error`. Não validado: `prefers-reduced-motion`
do sistema, app empacotado e macOS.

# Arquivo do IA.md — 2026-08

> Registros movidos, na íntegra e sem edição, de [`docs/projeto/IA.md`](../projeto/IA.md) em 2026-10-12
> (compactação sem perda do template de contexto). Não edite aqui: se uma decisão mudar,
> acrescente uma entrada nova e datada no `docs/projeto/IA.md`.

## Registro de Trabalho — 2026-08-05 — Resolução do conflito de integração

RESPONSÁVEL: Revisar codigo.

PEDIDO: corrigir o conflito surgido ao integrar os commits remotos de animação do canvas com a correção de posicionamento responsivo e o fluxo de passagem de responsabilidade.

FEITO:
- Resolvidos os conflitos em `NotificationsPanel`, `TerminalMenu`, `toolbar-flyout` e `CanvasToolsMenu`.
- Mantido o posicionamento medido por viewport/zoom e o limite de altura dos flyouts, junto com as animações desaceleradas e as listas em cascata recebidas dos commits remotos.
- Removidos todos os marcadores de conflito e mantida a integração dos testes e do handoff.

TESTE: lint, `npm run build`, `npx vitest run` (180 testes), `npm test` (421 testes) e `git diff --check` concluídos sem erros.

RISCO RESIDUAL: permanece apenas o aviso preexistente de chunk Vite acima de 500 kB e a necessidade de conferência visual manual das animações no Electron.

Estado final: concluído.

BUG relatado pelo usuário na sequência: "o chat ainda está em cima de texto no terminal" — mesmo após mover o botão de `bottom-4 right-4` para `right-4 top-4` no início da sessão.
CAUSA: mover pra outro canto fixo não resolve o problema de fundo — blocos do canvas (incluindo terminais) vivem em espaço de canvas e podem ser arrastados/panados para qualquer lugar da tela, inclusive por baixo de qualquer canto fixo. Além disso o novo canto escolhido (`top-right`) já tinha o `MiniMap` do React Flow (`CanvasView.tsx`, `position="top-right"`) — o botão de chat também sobrepunha o próprio minimapa.
FIX definitivo (o que a task pedia desde o início — "colocar ela junto com as funções auxiliares"): o botão de Chat deixou de ser um elemento `fixed` flutuante independente em `App.tsx` e virou um botão de verdade DENTRO da `CanvasToolbar` (junto com Ferramentas/Terminal/Nota/Arquivo/Grupo/etc.), recolhendo/aparecendo junto com o resto da barra pelo toggle retrátil. `CanvasView` e `ChatWorkspace` ganharam props (`onOpenChat`, `onBack`) para trocar de tela; `ChatWorkspace` ganhou um botão "Canvas" no canto superior direito (perto do badge de runtime) para voltar. Não sobra nenhum elemento `position: fixed` na tela do canvas.
TESTE: sem teste de componente (mesma limitação de sempre); validado ao vivo no Electron real via o mesmo driver Playwright descartável — `document.querySelectorAll('body *')` filtrado por `getComputedStyle(el).position === 'fixed'` na tela do canvas retornou lista vazia; clique no botão "Chat" da toolbar troca de tela, botão "Canvas" no chat volta preservando o estado do canvas (terminal aberto continuou lá).
VALIDAÇÃO: `npm run lint`, `npm run build`, `npx vitest run` (39 pass) sem erros; confirmado visualmente via screenshot do Electron real.
Estado final: concluído.

## Registro de Trabalho — 2026-08-01 — feature "escrever em todos e enviar simultaneamente" + auditoria de qualidade

PEDIDO: tarefa do Notion "Feature: Escrever em todos e enviar simultâneamente" — (1) iniciar vários agentes de uma vez sem configurar terminal por terminal, e (2) escrever uma mensagem diferente para cada terminal e disparar cada uma separadamente. Durante a sessão o usuário pediu três ajustes extras: nome editável nos itens da fila antes de iniciar; renomear um terminal já spawnado avisar o agente no chat; e um botão "enviar para todos" no modo de mensagens em massa. Ao final, pediu para seguir o padrão de qualidade.

FEITO:
- **Fila de terminais** (`TerminalMenu.tsx`): botão "+" empilha a configuração atual (agente/modelo/esforço/yolo/projeto) numa fila local, com o nome de cada item editável antes de iniciar; "Iniciar N terminais" sobe todos de uma vez.
- **Mensagens em massa** (`TerminalsPanel.tsx`): modo "enviar em massa" no dock de elementos — campo de texto + botão de enviar por terminal (`store.sendText`), com os rascunhos vivendo no painel (não em cada linha) para o botão "Enviar para todos" no topo do dock disparar de uma vez todas as mensagens pendentes.
- **Renomear avisa o agente** (`NodeHeader.tsx`, `TerminalNode.tsx`, `CanvasView.tsx`): renomear um terminal já spawnado manda "A partir de agora, seu nome neste canvas é '...'" pro chat dele, disparado só no blur/Enter (não a cada tecla) e só se o valor realmente mudou desde o foco — evita spammar o terminal enquanto o usuário ainda está digitando.

Nenhuma mudança de IPC/backend foi necessária: `pty:spawn`/`pty:write` já eram parametrizados por `sessionId`/nodeId.

AUDITORIA DE QUALIDADE (pedido seguinte, mesma sessão): revisão contra `GUIA_MINIMO_QUALIDADE.md`, item 2 ("regra de negócio não fica misturada com view") — achados dois casos de lógica pura escondida dentro de componente React, mesmo padrão de problema já registrado na sessão anterior sobre `prompt-overrides.ts`:
- O cálculo de posições para a fila de terminais (`addTerminalNodes`) tinha um loop de geometria inline em `CanvasView.tsx`, duplicando o cálculo de viewport que `addNode` já fazia e sem cobertura de teste — risco real: um bug de sobreposição de blocos passaria despercebido. Extraído `findFreeNodePositions` (plural) para `services/node-geometry.ts`, ao lado do `findFreeNodePosition` original que ela reusa internamente; `addNode` e `addTerminalNodes` passaram a compartilhar um único `visibleCanvasBounds()` em vez de repetir o cálculo de viewport duas vezes.
- A seleção de "quais rascunhos estão prontos pra enviar" (`sendAllDrafts`) vivia como `Object.entries(...).filter(...)` dentro de `TerminalsPanel.tsx`. Extraído `pendingDraftNodeIds` para `components/tools/terminals-panel-drafts.ts`, no mesmo padrão do `terminals-panel-navigation.ts` já existente (lógica pura ao lado do componente, sem React).

TESTE: `node-geometry.test.ts` novo (4 casos — lista vazia, batch de 1 bate com `findFreeNodePosition`, batch de 4 sem sobreposição entre si, batch evita nó já existente no canvas). `terminals-panel-drafts.test.ts` novo (3 casos — sem rascunhos, rascunhos vazios/só espaço são ignorados, ordem de inserção preservada).

VALIDAÇÃO: `npx tsc -b`, `npx eslint .`, `npx vite build` e `npx vitest run` (69 pass, 7 a mais que a baseline de 62) sem erros. Sem validação ao vivo no Electron real (Playwright + xvfb sobre app com módulo nativo `node-pty` não está configurado neste repo) — mesma limitação já registrada nas sessões anteriores; risco residual é baixo porque toda a lógica nova ou é função pura testada, ou reusa primitivas já validadas (`store.sendText`, `pty:spawn`/`pty:write`).

Estado final: concluído — as duas features + os três ajustes pedidos + a auditoria de qualidade (extração e teste da lógica que estava misturada em componente) completos.

AUDITORIA CONTRA OS GUIAS COMPLETOS (pedido seguinte, mesma sessão): "Siga os guias do padrão de qualidade" — desta vez os documentos completos (não só o `GUIA_MINIMO_QUALIDADE.md`). `DESIGN_SYSTEM_FRONTEND.md` é majoritariamente identidade visual específica do FelixoVerse (glow roxo, partículas), que o próprio documento diz para adaptar/substituir por projeto — o Felixo AI Core já tem seu próprio tema (zinc escuro + emerald), então essas seções não se aplicam. A seção 8.3 ("Melhorias Sugeridas") lista acessibilidade — "adicionar `aria-label` em todos os botões de ícone" — e o projeto já segue essa convenção de fato (16 arquivos com `aria-label`, incluindo o próprio `TerminalMenu.tsx` antes desta sessão). Achado: os botões de ícone novos desta sessão (fila de terminais em `TerminalMenu.tsx` — "+", lixeira, remover item; alternância de "enviar em massa" e envio por terminal em `TerminalsPanel.tsx`) tinham `title` mas não `aria-label`, quebrando essa convenção local. Corrigido: `aria-label` adicionado em todos (descritivo, incluindo o nome do terminal/item quando fizer diferença — ex.: `Enviar mensagem para "<nome>"`) e `aria-pressed` no toggle de "enviar em massa" (é um botão de estado, não uma ação pontual).
VALIDAÇÃO: `npx tsc -b`, `npx eslint .`, `npx vite build` e `npx vitest run` (69 pass) sem erros.
Estado final: concluído.

## Registro de Trabalho — 2026-08-03 — refatoração real dos 3 maiores arquivos faz-tudo

PEDIDO: aplicar o padrão de qualidade nos 3 arquivos identificados como faz-tudo — `ipc-handlers.cjs` (1284 linhas), `CanvasView.tsx` (1174 linhas) e `ChatWorkspace.tsx` (1790 linhas). Feedback explícito de sessão anterior: "padrão de qualidade" exige refatoração real de código (dividir responsabilidades), não auditoria estrutural (docs, .gitignore etc); refactor puro, sem mudar comportamento, um commit por extração.

FEITO:
- **`ipc-handlers.cjs`** misturava execução/streaming de processos CLI (spawn, stdout/stderr, orquestração) com gerenciamento de conta/catálogo das CLIs oficiais (listar, instalar, login, status, trocar conta) — dois domínios diferentes. Extraídos os 5 handlers `cli:list-official`/`install-official`/`open-official-login`/`official-account-status`/`switch-official-account` para `official-cli-account-ipc-handlers.cjs` novo, registrado separadamente em `main.cjs`. 1284 → 1177 linhas.
- **`CanvasView.tsx`** já tinha boa parte da geometria/regras de negócio extraída em sessões anteriores (`node-geometry.ts`, `file-terminal-links.ts`, `useCanvasPersistence.ts`), mas ainda continha as operações em massa do canvas (limpar tudo, exportar `.fxcanvas`, importar `.fxcanvas`) — confirmações, diálogo de arquivo, (de)serialização do bundle e as flags de busy que as acompanham. Extraído para `hooks/useCanvasTransfer.ts` novo. 1174 → 1050 linhas.
- **`ChatWorkspace.tsx`** (o maior e mais entrelaçado) continha três blocos de estado praticamente independentes, cada um com seu próprio ciclo local-first + migração/sincronização com backend + refs de bookkeeping: notas de projeto, automações customizadas e projetos (+ ids ativos). Extraídos para `hooks/useNotes.ts`, `hooks/useAutomations.ts` e `hooks/useProjects.ts` (este último mantém projects e activeProjectIds juntos, pois a sincronização de activeIds depende do load de projects). Modelos (`models`/`selectedModelId`) foram avaliados mas não extraídos nesta passada — 75 referências cruzadas com `stopStreaming`/`resetConversationThread`/`sendMessage` tornam a extração de baixo risco inviável sem um desenho mais cuidadoso; registrado como próximo passo. 1790 → 1465 linhas.

TESTE: nenhum teste novo — refactor puro reaproveitando comportamento já coberto pela suíte existente (398 testes de backend `node:test`, 69 de frontend `vitest`).

VALIDAÇÃO: a cada extração — `npx tsc -b`, `npx eslint .`, `npm run build` (backend + frontend) e a suíte de testes correspondente (backend: 398 pass; frontend: 69 pass) rodados e verificados verdes antes de prosseguir para o próximo arquivo. `qa-logger.cjs` e o pin do `TerminalDrawer.tsx` (trabalho não commitado de outra tarefa) não foram tocados.

Estado final: concluído — os 3 arquivos refatorados, 3 commits incrementais na branch `refactor/quality-pass-2026-08-03`, build final do repo verde.

## Registro de Trabalho — 2026-08-04 — recuperação de PTY no Windows

PEDIDO: tornar a recuperação de falhas de caminho do PTY previsível em sessões Windows, inclusive ao abrir uma CLI explícita.

FEITO: uma mensagem de erro de caminho no início agora tenta WinPTY (`useConpty: false`) antes de trocar o fluxo de recuperação, tanto para shell quanto para CLI explícita. O diagnóstico informa a camada recuperada sem expor caminhos locais na interface.

TESTE: os testes de regressão de `pty-process-manager.test.cjs` para shell e Codex explícito passaram. A suíte Electron/Node completa (417 testes) e `git diff --check` também concluíram sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — organização manual dos agentes existentes

PEDIDO: possibilitar a matriz também para agentes adicionados em momentos diferentes, sem reposicionar automaticamente o canvas durante o trabalho.

FEITO: adicionado o botão **Organizar** ao lado de **Agente**. Ele só fica ativo com pelo menos dois terminais de agentes conhecidos e reorganiza os agentes independentes em uma matriz livre, usando a mesma geometria da abertura em lote. Shells, arquivos, notas, grupos e terminais filhos de grupos não se movem; os novos posicionamentos são persistidos como qualquer arrasto manual de bloco. Antes de mudar as coordenadas, os blocos recebem uma classe transitória e só então se movem em dois frames de renderização, produzindo um deslocamento suave de 480 ms em vez de teleporte; `prefers-reduced-motion` mantém a troca instantânea.

A sequência de animação da barra também foi ajustada para incluir o novo botão sem alterar o movimento fluido dos controles seguintes durante a abertura ou o recolhimento.

TESTE: `agent-matrix-layout.test.ts` cobre a reorganização de quatro agentes, a preservação de todos os blocos não elegíveis e o no-op com menos de dois agentes independentes.

VALIDAÇÃO: com Node 25.9.0, ESLint, TypeScript, build do Vite, `vitest` (96 testes), suíte Electron/Node (417 testes) e `git diff --check` concluídos sem erros. Não há harness de DOM/Electron para validar a posição visual; a conferência manual recomendada é abrir agentes em momentos diferentes, clicar em **Organizar** e confirmar que apenas os agentes no nível principal se movem com transição suave.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — prevenção de sobreposição em notificações

PEDIDO: evitar que o painel de Notificações cubra a lista de Ferramentas quando ambos estiverem abertos.

FEITO: o estado aberto de Ferramentas agora é encaminhado também para o painel de Notificações. Sem Ferramentas, Notificações usa sua coluna original; com Ferramentas aberto, ela transita para a segunda coluna, preservando a animação sequencial e evitando sobreposição.

VALIDAÇÃO: ESLint, TypeScript, `vitest` (100 testes), build do Vite e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — padronização de qualidade do canvas

PEDIDO: normalizar o conjunto recente de menus e notificações segundo o padrão de qualidade.

FEITO: a revisão aplicou os princípios de responsabilidade única, simplicidade verificável e testes de comportamento. `NotificationsMenu` passou a concentrar o trigger visual, o ciclo de expansão e a animação usados nas versões expandida e recolhida da barra, removendo duplicação em `CanvasToolbar`. As regras de criar e consumir notificações foram extraídas para `terminal/canvas-notifications.ts`; `CanvasView` apenas coordena estado e efeitos de áudio. A sequência de IDs é calculada antes da atualização de estado, sem efeito colateral dentro de updater React.

TESTE: `canvas-notifications.test.ts` cobre criação ordenada, ausência de snapshot e consumo individual. Validação com Node 25.9.0: ESLint, TypeScript, Vite build, `vitest` (100 testes) e `git diff --check` concluídos sem erros.

RISCO RESIDUAL: a animação continua sem harness de DOM/Electron; conferir manualmente a abertura/recolhimento em ambos os estados da barra e com `prefers-reduced-motion`.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — painel de notificações ancorado e legível

PEDIDO: corrigir o botão de notificações deformado, o painel sobreposto sem animação, a ausência da última mensagem útil e a paleta divergente.

FEITO: o painel passou a ser ancorado ao botão de Notificações, abrindo à direita com animação própria e sem cobrir a barra. O botão reserva espaço fixo para o sino e o ponto de alerta, sem contador que comprima o ícone. A paleta passou a ser âmbar, igual à lista; o preview ignora rodapés de CLI (modelo, tokens e indicadores) para preservar a última linha útil do agente.

VALIDAÇÃO: ESLint, TypeScript, `vitest` (98 testes), build do Vite e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — aviso visual e consumo de notificações

PEDIDO: destacar visualmente novas notificações e removê-las quando o usuário abrir o terminal correspondente.

FEITO: o botão **Notificações** recebe borda vermelha, ponto vermelho e contador quando há itens. Cada entrada mostra o nome do agente e a última linha disponível do preview do terminal. Ao clicar, o canvas centraliza/expande o terminal e remove a entrada consumida; outras notificações permanecem ativas.

VALIDAÇÃO: ESLint, TypeScript, `vitest` (98 testes), build do Vite e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — coexistência dos menus Ferramentas e Agente

PEDIDO: impedir que as opções de Ferramentas cubram o formulário de configuração do Agente quando ambos estiverem abertos, sem alterar a expansão já aprovada do botão Agente.

FEITO: `CanvasToolbar` passou a compartilhar o estado aberto de Ferramentas com `TerminalMenu`. Com Ferramentas fechado, o formulário de Agente conserva sua posição original; com os dois abertos, ele transita para a segunda coluna, após as opções de Ferramentas. A largura, duração e sincronização da expansão de Agente foram preservadas.

VALIDAÇÃO: ESLint, TypeScript, `vitest` (98 testes), build do Vite e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — histórico de notificações durante a execução

PEDIDO: manter as notificações disponíveis enquanto o app estiver aberto, limpando-as somente ao fechar o app.

FEITO: o painel deixou de derivar sua lista apenas dos snapshots atuais. `CanvasView` agora mantém um histórico em memória das transições de agentes para `idle`, `waiting_approval` ou `exited`; assim, a notificação continua visível mesmo quando o agente muda de estado depois. O estado é local ao processo e não é persistido no canvas, portanto desaparece ao fechar o app. O contador e o som usam a mesma transição registrada.

VALIDAÇÃO: ESLint, TypeScript, build do Vite, `vitest` (98 testes) e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — correções pós-validação de agentes e notificações

PEDIDO: corrigir sobreposição dos painéis extras, retomada incorreta de sessões restauradas e ausência de notificação quando o agente termina um trabalho.

FEITO: o painel de configuração do Agente passou a ocupar a segunda coluna, depois das opções de Ferramentas, evitando sobreposição quando os dois menus estão abertos. A retomada usa `/resume` com Enter no primeiro spawn de agentes persistidos. O estado `idle` passou a exigir ação e aparece no painel/contador de notificações com mensagem própria, acionando também o alerta sonoro já existente.

VALIDAÇÃO: ESLint, TypeScript, build do Vite, `vitest` (98 testes), suíte Electron/Node (417 testes) e `git diff --check` concluídos sem erros.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — alerta sonoro de notificações

PEDIDO: reproduzir um áudio local quando uma nova notificação do app surgir.

FEITO: o alerta recente `ui-alert-synth-beep...mp3` da pasta Downloads foi incorporado como `app/public/sounds/notification.mp3`. `CanvasView` agora compara o conjunto atual de agentes em `waiting_approval` ou `exited` com o conjunto anterior e toca o áudio uma vez quando um novo agente passa a exigir ação. Notificações já presentes durante a hidratação inicial não emitem som; falhas de autoplay são ignoradas com segurança.

TESTE: `session-notifications.test.ts` ganhou cobertura para filtrar apenas terminais e detectar transições novas. ESLint, TypeScript e os 4 testes direcionados passaram.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — matriz para abertura em lote de agentes

PEDIDO: ao iniciar vários agentes pela fila, organizá-los como uma matriz que cresce de modo próximo a um quadrado, em vez de uma sequência horizontal ou vertical que aparentava depender do espaço disponível.

FEITO: `findFreeNodePositions` agora calcula primeiro uma área livre para o lote inteiro e distribui os terminais em uma grade determinística de `ceil(√n)` colunas. A matriz é testada como um conjunto contra os blocos existentes, preservando o espaçamento e evitando que um agente isolado seja deslocado para fora do grupo. Quando a área visível comporta toda a matriz, ela é priorizada; caso contrário, o canvas ainda encontra uma área livre sem sobreposição.

TESTE: `node-geometry.test.ts` cobre matriz 2×2, crescimento para cinco agentes (3 colunas/2 linhas), prioridade para a matriz que cabe inteiramente na área visível e o deslocamento da matriz completa quando a origem já está ocupada.

VALIDAÇÃO: com Node 25.9.0, ESLint, TypeScript, build do Vite, `vitest` (94 testes), suíte Electron/Node (417 testes) e `git diff --check` concluídos sem erros. Como não há harness de DOM/Electron para a disposição visual, a conferência manual recomendada é montar uma fila com 4, 5 e 6 agentes e confirmar as grades 2×2, 3×2 e 3×2.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — colaboração por conexões entre agentes

PEDIDO: ao ligar dois agentes no canvas, ambos precisam reconhecer que trabalham juntos no mesmo projeto ou em contextos relacionados. A conexão já era persistida, mas só a combinação arquivo→terminal recebia ação; terminal→terminal não fazia nada.

FEITO: `agent-collaboration-links.ts` identifica exclusivamente pares de terminais de agentes conhecidos e envia uma instrução recíproca aos dois. Quando os diretórios de trabalho coincidem, a mensagem declara o projeto compartilhado; quando diferem, declara os contextos relacionados pelo canvas. A instrução também deixa explícito que a conexão não repassa conversa/saída automaticamente e orienta a coordenação por arquivos `.md` e notas compartilhados. Shells, comandos arbitrários, auto-conexões e outros tipos de bloco continuam sem receber prompt.

TESTE: `agent-collaboration-links.test.ts` cobre parceria no mesmo projeto, contextos relacionados em diretórios diferentes e exclusão de pares que não são dois agentes.

VALIDAÇÃO: com Node 25.9.0, ESLint, TypeScript, build do Vite, `vitest` (92 testes), suíte Electron/Node (417 testes) e `git diff --check` concluídos sem erros. Como o projeto não possui harness de DOM para o canvas, a checagem visual manual recomendada é ligar dois agentes e confirmar que cada terminal recebe a instrução com o nome do outro.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — qualidade da barra de ações e notificações do canvas

PEDIDO: aplicar o padrão de qualidade ao conjunto recente de mudanças no canvas: abertura sequencial dos menus de Ferramentas e Agente, notificações de agentes e barra retrátil.

FEITO:
- A coordenação de tempo dos dois menus deixou de ser duplicada nos componentes. `menu-panel-timing.ts` concentra a duração e o cálculo do instante de preparação; `useDeferredExpansionPanel.ts` concentra o ciclo de abrir, preparar, concluir e limpar o painel. O botão mantém a transição de 420 ms já aprovada visualmente, enquanto os itens passam a iniciar no ponto correto, sem um atraso extra depois do fim da expansão.
- A regra de negócio que define se um agente requer atenção saiu de `NotificationsPanel.tsx` para `terminal/session-notifications.ts`. Assim, `CanvasView` e o painel usam a mesma regra, sem exportar utilitário a partir de um componente React.
- A assinatura de todas as sessões foi migrada para `useSyncExternalStore`. `TerminalSessionStore` mantém um snapshot imutável e notifica criação, atualização e remoção de sessão, evitando `setState` síncrono em efeito e deixando o contador/painel de notificações consistente.
- Os controles de recolher/expandir receberam rótulos acessíveis explícitos.
- `agent-launch-preferences.ts` passou a persistir e validar a configuração reutilizável completa do launcher (CLI, modelo, esforço, permissões, projeto e arquivo de planejamento), com migração segura da preferência antiga que guardava só a CLI. O nome permanece intencionalmente fora dessa preferência, pois é específico de cada bloco criado.
- Todos os prompts programáticos do canvas agora terminam em CR (Enter), por meio de `terminal-input.ts`. Antes, alguns terminavam em LF e podiam apenas aparecer no terminal sem serem submetidos; isso incluía o arquivo de planejamento quando o padrão de qualidade estava desligado. A instrução do planejamento foi extraída para função pura e aceita qualquer extensão de arquivo.

TESTE: testes unitários novos para o cálculo de sincronização do painel, estados de notificação, normalização do Enter em PTY, preferências do launcher e composição do planejamento. Validação com Node 25.9.0: ESLint, TypeScript, Vite build, `vitest` (92 testes), suíte Electron/Node (417 testes) e `git diff --check` concluídos sem erros.

RISCO RESIDUAL: o repositório não possui harness de DOM/Electron para medir animações. A abertura e o recolhimento dos dois menus, inclusive com `prefers-reduced-motion`, continuam sujeitos à conferência visual manual no app. O build também mantém o aviso já existente de chunk Vite acima de 500 kB; a auditoria não introduziu code splitting fora do escopo.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — submissão confiável de `/resume`

PEDIDO: o terminal restaurado mostrava `/resume`, mas por vezes só inseria uma quebra de linha em vez de efetivamente executar o comando.

FEITO: a entrega do prompt inicial do Codex agora espera o compositor interativo vazio (`›`) estar visível. O texto e a tecla Enter são enviados em duas escritas PTY, com intervalo curto: primeiro `/resume`, depois `CR`. Isso evita que o TUI trate o Enter que chega junto de texto programático como uma nova linha.

TESTE: `terminal-input.test.ts` cobre a separação entre texto normalizado e a tecla Enter. A validação estática e a suíte frontend são executadas nesta alteração.

Estado final: concluído.

## Registro de Trabalho — 2026-08-04 — notificações sem duplicação e com consumo durável

PEDIDO: em outro computador, as notificações pareciam entrar em loop e não desapareciam ao abrir o terminal do agente.

FEITO: o histórico passou a manter somente um aviso pendente por agente; um evento posterior atualiza o aviso em vez de empilhá-lo. Ao abrir a notificação, todos os avisos residuais daquele agente são consumidos e o agente fica reconhecido até receber um novo prompt. Dessa forma, a atualização visual do terminal ao abrir o drawer não recria nem repete o alerta; uma nova interação real com o agente inicia um novo ciclo de aviso.

TESTE: `canvas-notifications.test.ts` agora cobre a substituição de aviso do mesmo agente e o consumo de todos os itens residuais do agente. ESLint, TypeScript, testes direcionados, suíte frontend e build são executados nesta alteração.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — revisão e correções da semana

PEDIDO: revisar e implementar as melhorias necessárias em todos os commits da semana de 03 a 05/08/2026.

FEITO: os flyouts da barra do canvas passaram a calcular a posição e a altura disponíveis em runtime, mantendo Ferramentas, Agente, Projetos e Notificações acessíveis após resize/zoom. O dock de Elementos recolhido deixou de expor controles focáveis invisíveis e o arraste ganhou guardas contra alteração concorrente da lista. O drawer de terminal passou a usar uma faixa de largura válida em viewport estreita, com limpeza dos estilos globais durante desmontagem. Pacotes `.fxcanvas` não preservam mais `initialText`, evitando execução automática de conteúdo importado. O IPC de projetos passou a validar caminhos reais, prefixos de diretório e symlinks antes de listar ou indexar arquivos.

TESTE: ESLint, TypeScript/Vite build, `npm run test:frontend` (172 testes), `npm test` (420 testes) e `git diff --check` concluídos sem erros. Foram adicionados testes para posicionamento responsivo, largura do drawer, remoção de texto autoenviado em imports e contenção de caminhos.

RISCO RESIDUAL: o repositório ainda não possui harness de DOM/Electron para validar visualmente animações e interação de ponteiro; recomenda-se uma conferência manual em viewport reduzida, com zoom alterado, abertura simultânea de Ferramentas/Notificações e drag do drawer. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — PTY reanexável e passagem de responsabilidade

RESPONSÁVEL: Revisar codigo.

PEDIDO: corrigir o reset prematuro ao desenvolver o Felixo AI Core dentro do próprio canvas e permitir que um agente parado por limite de uso transfira o trabalho para outro agente com o histórico do terminal.

FEITO:
- O PTY do canvas passou a usar um identificador estável por bloco e o processo Electron mantém uma janela limitada de replay. HMR, navegação entre Canvas/Chat e remount do renderer reanexam a sessão existente, restauram a saída e não reenviam a instrução inicial; uma nova sessão só é criada quando o bloco realmente não existe mais.
- Sessões encerradas ficam retidas até remoção explícita do bloco, permitindo restaurar também o estado final. O descarte do bloco e o encerramento do app continuam usando kill forçado para liberar o processo e o buffer.
- Saídas explícitas de limite (`usage limit`, `out of extra usage`, `429`, equivalentes) são marcadas no snapshot. O botão “Passar responsabilidade” só aparece com limite detectado e agente parado, e abre uma confirmação que alerta sobre segredos no transcript.
- A confirmação lê o scrollback completo disponível no xterm, aplica limite de segurança de 160 mil caracteres com marcador quando necessário, escolhe o próximo CLI nativo em ordem determinística, preserva o diretório e as conexões com arquivos `.md`, e envia o contexto como transcript não confiável. O histórico é mantido apenas em memória e `handoffText` é removido da persistência/exportação.

TESTE: lint, `npm run build`, `npx vitest run` (180 testes), `npm test` (421 testes), testes direcionados do PTY (36) e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

VERIFICAÇÃO MANUAL RECOMENDADA: iniciar um agente no canvas apontando para este repositório, alterar um componente para provocar HMR/navegar ao Chat e voltar; confirmar que o mesmo processo continua sem reenviar a instrução. Para o handoff, simular uma saída com limite seguida de encerramento, abrir o drawer, confirmar o aviso de transcript e verificar que o novo CLI recebe o contexto no mesmo diretório e sem gravar o transcript no canvas.

RISCO RESIDUAL: o replay do processo Electron é limitado a 200 mil caracteres e o scrollback do xterm a 20 mil linhas; históricos maiores são deliberadamente truncados para não inundar o próximo agente. A escolha automática pressupõe que o próximo CLI da matriz esteja instalado e autenticado; se não estiver, o novo bloco exibirá o erro de inicialização e o usuário deverá escolher outro agente manualmente.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — animação dos botões restantes

RESPONSÁVEL: Revisar codigo.

PEDIDO: aplicar aos botões que ainda não tinham animação o mesmo feedback de pressão dos controles já padronizados.

FEITO: os botões internos do painel de notificações, os controles de confirmação do handoff e o seletor de arquivo de planejamento passaram a usar `felixo-btn` ou `felixo-btn-icon`, preservando suas classes visuais e comportamentos existentes.

TESTE: `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

RISCO RESIDUAL: a conferência visual de pressão, foco por teclado e `prefers-reduced-motion` ainda deve ser feita no Electron real, pois o repositório não possui harness visual de DOM/Electron.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — cascata nos flyouts da barra do canvas

RESPONSÁVEL: Revisar codigo.

PEDIDO: completar a animação nos controles como “Projetos”, que já tinham feedback de clique, mas ainda abriam o painel sem a cascata visual dos demais menus da barra.

FEITO: os flyouts de Projetos e de criação de Nota, Arquivo e Grupo agora usam `felixo-anim-sequential-panel`, igual a Ferramentas, Agente e Notificações. O posicionamento responsivo, acessibilidade e comportamento de abertura existentes foram preservados.

TESTE: `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

RISCO RESIDUAL: requer conferência visual no Electron real, especialmente com zoom reduzido e `prefers-reduced-motion`, pois não há harness visual de DOM/Electron.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — sequência completa dos menus Projetos e criação

RESPONSÁVEL: Revisar codigo.

PEDIDO: tornar a animação de Projetos realmente igual à de Ferramentas, Agente e Notificações; apenas a classe de cascata não reproduzia a expansão e o momento de montagem do painel.

FEITO: Projetos, Nota, Arquivo e Grupo agora usam `useDeferredExpansionPanel`, expandem o contêiner com a mesma curva e duração dos outros menus, aguardam o ponto sincronizado da expansão e só então exibem o flyout em cascata. Fechamento por botão, clique externo e criação/execução também limpam o estado de preparação.

TESTE: `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

RISCO RESIDUAL: a sequência exige conferência visual no Electron real, sobretudo em zoom reduzido e com `prefers-reduced-motion`, pois o repositório não possui harness visual de DOM/Electron.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — correção visual da cascata de Projetos

RESPONSÁVEL: Revisar codigo.

PEDIDO: a imagem mostrou que Projetos ainda não seguia o padrão visual: o painel aparecia, mas as pastas internas surgiam simultaneamente.

FEITO: a lista de projetos e a lista de arquivos/diretórios passaram a usar `felixo-anim-stagger-list`, que anima cada item na mesma cascata dos menus padronizados. A tentativa anterior de expandir artificialmente o acionador foi removida para preservar a geometria compacta mostrada na barra; o painel lateral continua com a animação de entrada já existente.

TESTE: `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

RISCO RESIDUAL: a confirmação visual final ainda requer abrir Projetos no Electron real com uma lista longa, pois não há harness visual de DOM/Electron.

Estado final: concluído.

## Registro de Trabalho — 2026-08-05 — equivalência de Projetos com Ferramentas

RESPONSÁVEL: Revisar codigo.

PEDIDO: comparar a animação completa de Ferramentas com Projetos, pois o padrão ainda não era equivalente.

FEITO: validação feita no Electron em desenvolvimento. Projetos passou a usar a mesma sequência de Ferramentas: expansão de `w-36` para `w-[18.5rem]` em 620 ms, alternância do chevron, preparação adiada via `useDeferredExpansionPanel`, montagem após a expansão e flyout abaixo do acionador. A largura de conteúdo permanece em `w-72` para acomodar nomes de pastas; é a única diferença intencional. As listas internas mantêm a cascata item a item.

TESTE: inspeção visual no Electron, `npm run lint`, `npm run build` e `git diff --check` concluídos sem erros. O build mantém o aviso preexistente de chunk Vite acima de 500 kB.

RISCO RESIDUAL: conferir o fechamento com `prefers-reduced-motion` e uma lista extensa continua recomendado, apesar de o fluxo aberto ter sido validado visualmente.

Estado final: concluído.

## Registro de Trabalho — 2026-08-08 — auditoria de código e segurança do repositório

RESPONSÁVEL: Revisar codigo.

PEDIDO: code review completo do repositório inteiro (não só do diff) somado a auditoria de segurança, partindo da premissa de projeto maduro construído em blocos independentes — esperando duplicação, camadas mal delimitadas e partes mortas. Exigência de toda afirmação vir ancorada em `arquivo:linha`, com regra anti-ruído explícita (melhor 12 achados sólidos que 60 duvidosos). O pedido original restringia a apenas diagnosticar; a autorização para corrigir veio depois, já durante a execução.

FEITO: auditoria registrada em [`docs/AUDITORIA-2026-08-08.md`](../AUDITORIA-2026-08-08.md), com mapa de arquitetura (diagrama Mermaid), 8 achados e plano de remediação em 3 fases. A premissa do pedido não se confirmou: o backend mostrou SQL 100% parametrizado, `execFile` sem shell, allowlist de argv em `git-service.cjs`, `resolveSafePath` confinando os arquivos do canvas, zero `catch` vazio, zero promise flutuante e `npm audit` limpo. Vários candidatos a achado foram investigados e descartados por não terem gatilho concreto — `JSON.parse` dos adapters (protegido por `parseAdapterLine` em `cli-event-utils.cjs:12-24`), storages do frontend (todos dentro de `try`), e a flag `--dangerously-bypass-approvals-and-sandbox` (opt-in explícito do usuário, não vulnerabilidade).

Corrigidas as Fases 0 e 1: `.env` passou a ser ignorado (o `.env.example:3` mandava criá-lo e nada o cobria); `recentItems` removido de `models.ts` — era código morto contendo títulos de conversas pessoais num repositório público; `toErrorResult`, que estava copiado byte a byte em 9 handlers e define o contrato de erro de todo IPC do app, foi unificado em `services/ipc-result.cjs`; `normalizePositiveInteger`, que existia 2x no mesmo processo com contratos opostos (uma lança, outra retorna `undefined`), foi renomeada pelo que cada uma faz; e a política de novas janelas do webview passou a ser aplicada recursivamente, fechando uma lacuna do código introduzido nesta mesma sessão — um popup de login podia abrir outras janelas sem restrição.

TESTE: `npx tsc -b` limpo e `npm test` com 428/428 passando, incluindo 3 testes novos cobrindo a política de janelas do webview (deny navegando in-place, allow sem arrastar o opener, e herança da política pelo popup). Verificação de `.gitignore` feita com `git check-ignore` confirmando `.env`, `app/.env` e `.env.*` ignorados com `.env.example` preservado. Histórico auditado com `git log --all --diff-filter=A`: `.env` nunca foi commitado.

RISCO RESIDUAL: três frentes seguem abertas e estão registradas no relatório. (1) ARQ-01 e ARQ-02 — `sendCliRequest` com ~570 linhas dentro de uma função de ~790 em `ipc-handlers.cjs:82-871`, e `CanvasView.tsx` com 1611 linhas e 54 hooks — não foram tocadas de propósito: são as únicas mudanças da lista capazes de quebrar comportamento silenciosamente e nenhuma tem hoje rede de testes que pegue a regressão. (2) PRIV-01 é correção parcial: os títulos pessoais saíram do `HEAD` mas permanecem no histórico do Git, cujo expurgo exige `git filter-repo` com force-push — decisão do dono do projeto. (3) A auditoria foi por leitura, sem execução do app; `orchestration-runner.cjs` (1010 linhas) e `persistent-cli-session.cjs` (847 linhas) ficaram sem leitura linha a linha, e o `felixo_launcher/` recebeu só varredura de segurança.

Estado final: concluído — Fases 0 e 1 aplicadas e commitadas (`ce878a1`, `e8518d9`, `8c2e7d3`); Fase 2 aguardando decisão do dono do projeto.

## Registro de Trabalho — 2026-08-09 — conclusão da auditoria: correções, validação no app e 3ª passada

RESPONSÁVEL: Revisar codigo.

PEDIDO: fazer tudo o que tinha ficado em aberto — os 7 achados de concorrência que eu havia deixado documentados em vez de corrigidos, a auditoria do restante de `electron/services` e do `felixo_launcher`, e a validação do bloco de Página Web rodando o app de verdade, com autorização explícita para reiniciar o ambiente e usar automações.

FEITO: **rodar o app foi o que mais rendeu.** Encontrou dois bugs que nenhuma suíte pegaria: o build de produção abria em branco (o Vite não definia `base`, e sob `file://` os assets absolutos apontam para a raiz do disco — existia desde o commit inicial e só afeta o app empacotado), e o `allowpopups` do bloco de Página Web nunca chegava ao DOM. Esse segundo explica por que as duas correções anteriores do login OAuth não funcionaram: `@types/react` declara o atributo como boolean e o React não o serializa em elemento desconhecido; setá-lo por ref também não adianta, porque o Chromium decide sobre popups no instante em que anexa o guest. O `<webview>` passou a ser criado imperativamente, com os atributos antes do `appendChild`, e verifiquei no app que `window.open` voltou a devolver uma janela.

Dos achados de concorrência, cinco foram corrigidos com teste (BUG-01, LEAK-01, LEAK-02, RACE-01 e o BUG-03 da rodada anterior) e um foi **descartado por verificação**: o RACE-03 supunha perda de stdout no fechamento, mas o guard só bufferiza até a primeira inspeção e o único caso de retenção é saída composta apenas de espaço em branco, que o line-reader descartaria de qualquer forma.

A terceira passada cobriu o restante de `electron/services` e o launcher. O achado mais grave foi o `done` de um modelo apagando o limite de toda a CLI: com o limite de uso da Claude ativo, qualquer sub-agente concluindo bem "liberava" um modelo esgotado, e o seletor voltava a escolhê-lo para tomar o mesmo erro, queimando turnos em vez de migrar de provedor. No launcher, quatro achados, dois deles graves: a opção "Pasta do Node.js/npm" do menu não fazia efeito nenhum (a config era aplicada depois da descoberta do Node), e a limpeza de processos matava editores — o filtro aceitava qualquer menção a `/vite`, e `.../node_modules/vite/...` já contém, então um `vim` aberto ali levava SIGTERM e SIGKILL, exatamente o oposto do que o docstring da função promete.

TESTE: 466 testes do backend, 200 do frontend e 89 (+70 subtests) do launcher, todos passando; `tsc -b` limpo. A validação visual foi feita com driver Playwright sobre Xvfb, com `--user-data-dir` isolado para não tocar no banco do usuário. Cada correção seguiu TDD, e dois testes meus foram descartados no caminho por não provarem o que afirmavam — um passava com e sem a correção, outro construía um cenário que nem acionava o código sob teste.

RISCO RESIDUAL: dois achados seguem abertos de propósito. O RACE-02 depende de duas chamadas concorrentes se intercalarem entre a checagem e a atribuição de `activeRun`; o gatilho mais plausível era a dupla reinvocação do RACE-01, agora corrigido, então o cenário pode ter deixado de ser alcançável — confirmar exige reproduzir a corrida, não ler o código. O BUG-02 não é defeito técnico e sim decisão de produto: hoje esgotar `maxTurns` falha o run e descarta o trabalho dos agentes, e sintetizar uma resposta final com o que já existe é comportamento diferente. O frontend (~24k linhas em `app/src/`) segue sem leitura linha a linha, já que as três passadas priorizaram o processo principal e o launcher, que são as superfícies com acesso ao SO. Por fim, o fork `flaviavs-commits/Felixo-AI-Core` ainda carrega o histórico anterior ao expurgo dos dados pessoais: não é uma conta do dono do projeto, então a limpeza depende de quem a controla — o caminho simples é deletar e refazer o fork a partir do repositório já limpo.

Estado final: concluído — 8 commits aplicados (`049e460`, `27b7799`, `1dd9fb0`, `6156e89`, `a63b574`, `5f0dada` e os de documentação); RACE-02 e BUG-02 aguardando decisão do dono do projeto.

## Registro de Trabalho — 2026-08-10 — três bugs de campo: abrir arquivo no Windows, webview duplicado e "Organizar" instável

PEDIDO: três relatos de uso, investigados e corrigidos em sequência — arquivos `.py` que "não abrem nem interagem" no Windows, páginas web abrindo duas vezes (áudio sempre duplicado) e o botão **Organizar** que "às vezes funciona, às vezes só chega os elementos mais perto".

FEITO: **os três eram bugs distintos e nenhum estava no lugar onde o sintoma aparecia.**

*Abrir arquivo no Windows.* O PTY montava `cmd.exe /d /s /c py script.py`, e `/c` encerra o shell junto com o comando — quando o script terminava (ou falhava na primeira linha), o painel morria antes de o usuário ler qualquer coisa. Pior: um `.py` que quebra na importação sai em ~50 ms com código ≠ 0, caindo no `allowEmergencyShellFallback`, que re-spawnava um shell limpo em `os.homedir()` e **descartava o traceback** — daí o relato ser sempre "não abre", nunca o erro real. Quatro correções: `keepShellOpen` faz o Windows usar `/k` e o POSIX devolver um shell interativo em vez de `exec`; sessões "rodar arquivo" saem da retentativa que remove argumentos (para `py script.py` o argumento *é* o trabalho, e removê-lo abria um REPL que ninguém pediu); o `outputBuffer` do processo morto é reproduzido antes de qualquer fallback; e `py` ganhou fallback para `python`, já que o launcher só existe em instalações python.org — Microsoft Store e conda trazem apenas `python`.

*Página web duplicada.* O guard contra webview duplicado consultava `webviewRef.current?.isConnected`, mas o cleanup do ref callback fazia `webviewRef.current = null` **sem remover o elemento do DOM**. Sob `<StrictMode>` (mount → cleanup → mount), o segundo mount lia `null`, o guard não segurava e um segundo `<webview>` era criado sobre o primeiro — ambos vivos, ambos carregando a URL, ambos com áudio. O cleanup passou a remover o elemento; órfãos de montagens anteriores são limpos antes de criar o novo. Duas correções vieram a reboque: o efeito de listeners dependia só de `[id]` e, como refs rodam antes de efeitos, na remontagem lia um ref já anulado e deixava o webview **sem nenhum listener** (sem título, sem persistência de URL, sem back/forward) — passou a depender do elemento via state; e como recriar o guest recarregava `initialUrl`, um `currentUrlRef` acompanha a navegação para a remontagem não rebobinar a página.

*"Organizar" instável.* A âncora da matriz vinha de `placementOrigin(viewport)`, isto é, do canto visível da tela: com o canvas rolado 300px, o destino mudava 300px. Somava-se um fallback silencioso de três níveis — numa tela 1366x768 uma matriz de 4 terminais precisa de 1072x752 contra 1286x640 de área útil, então **nunca** cabia e o resultado era sempre o fallback que empilha os blocos (o "só chega mais perto"); em monitor maior, cabia. O zoom entrava na conta pelo mesmo caminho. O viewport saiu inteiramente do cálculo: a matriz agora ancora no bloco que já está mais ao topo-esquerda, e `fitBounds` enquadra o resultado depois de posicionar. Por decisão do dono do projeto, o escopo passou de "agentes conhecidos" para todos os blocos de topo (grupos entram inteiros, filhos de grupo continuam de fora porque suas coordenadas são relativas ao pai), com célula única dimensionada pelo maior bloco; e blocos ligados por arestas ficam em células vizinhas, via union-find sobre as arestas, com uma regra que impede um componente de ser partido entre duas linhas quando ainda caberia inteiro na seguinte.

CONVENÇÃO/ARQUITETURA: `agent-matrix-layout.ts` foi dividido em três módulos coesos e renomeado, porque o nome passou a mentir sobre o conteúdo (não organiza mais agentes) e o arquivo acumulava três responsabilidades: `node-connectivity.ts` (grafo puro — union-find e ordem de leitura), `matrix-grid.ts` (geometria da grade — célula, âncora, slots, bounds) e `canvas-matrix-layout.ts` (orquestração). As props `onOrganizeAgents`/`agentCount` viraram `onOrganizeBlocks`/`arrangeableCount`, alinhando o contrato da toolbar ao comportamento real.

TESTE: 276 testes de frontend (44 novos: 10 de layout, 12 de grade, 11 de conectividade, 11 de montagem de webview) e 514 do backend, todos passando; `tsc -b`, build do Vite, ESLint e `git diff --check` limpos com Node 25.9.0. Os casos-limite do layout foram verificados à parte (blocos exatamente sobrepostos, coordenadas negativas, bloco sem tamanho medido) e nenhum quebra a âncora.

RISCO RESIDUAL: nada foi validado com o app rodando — o ambiente de testes é `environment: 'node'`, sem DOM, então `fitBounds` está garantido por tipo e pela API do React Flow, não por execução. Três conferências manuais valem a pena: rodar um `.py` no Windows real (o `/k` e o exit 9009 vêm do comportamento documentado do `cmd.exe`), abrir um bloco de Página Web com vídeo e confirmar um único áudio, e clicar em **Organizar** com o canvas rolado para longe. Duas consequências de escopo ficam registradas: `keepShellOpen` é persistido no node, então blocos de "rodar arquivo" criados antes desta mudança continuam fechando ao terminar; e notas e páginas web agora **se movem** ao organizar — quem usa nota como rótulo fixo ao lado de um bloco vai vê-la entrar na grade. Fixar blocos individualmente é uma ideia natural para quem quiser contribuir.

Estado final: concluído — pendente de conferência manual nos três pontos acima.

## Registro de Trabalho — 2026-08-10 (parte 2) — `/resume` digitado mas não enviado

PEDIDO: ao reiniciar o app, nem sempre o `/resume` é enviado ao agente restaurado — "às vezes ele só escreve".

FEITO: o prompt inicial é entregue em duas escritas no PTY: o texto e, 75 ms depois, o Enter. A separação existe por um motivo real (CLIs de tela cheia tratam um CR colado junto com o texto como quebra de linha), mas os 75 ms são um valor fixo e a única guarda antes de enviar a tecla era `!session.disposed` — nada confirmava que o TUI havia consumido o texto. Quando a interface ainda está redesenhando, o Enter se perde e o `/resume` fica parado na linha de entrada. O `INITIAL_TEXT_MAX_WAIT_MS` de 10 s agrava: se a CLI demora mais que isso para ficar pronta, o texto é digitado com a interface ainda inicializando.

A correção troca o palpite de relógio por verificação de estado. Novo módulo `terminal/terminal-submission.ts` com `isSubmissionPending(viewport, text)`, que inspeciona **apenas a linha de entrada** do viewport — depois de uma submissão bem-sucedida a CLI limpa essa linha, e o texto que reaparece acima é histórico da conversa, não pendência. Se o texto ainda estiver lá, o Enter é reenviado, até 3 vezes com 600 ms de intervalo (`SUBMIT_RETRY_LIMIT`/`SUBMIT_RETRY_DELAY_MS`). Reenviar é seguro exatamente porque só ocorre enquanto a linha continua preenchida: se a CLI já submeteu, nada é enviado. O timer novo (`submitRetryTimer`) é limpo em `remove()`, junto dos demais.

O relato do dono do projeto direcionou o diagnóstico e evitou uma correção errada: escolhido "texto escrito e parado, esperando Enter" (e não truncado/embaralhado), o problema ficou isolado na entrega da tecla, não no gate de prontidão — que continua intocado.

TESTE: `terminal-submission.test.ts` (12 casos: linha de entrada do Claude dentro da caixa e do Codex, linha limpa após submissão, prompt ecoado no histórico, cursor de bloco, espaçamento do TUI, dica após o texto, comando diferente, texto vazio, instrução multilinha, viewport sem prompt). **Um teste reprovou a primeira implementação e apontou um defeito real:** o regex exigia o marcador no início da linha, então `│ > /resume` — exatamente o formato do Claude Code, onde a falha foi relatada — não era reconhecido; o padrão passou a aceitar as bordas de caixa que CLIs de tela cheia desenham.

VALIDAÇÃO: 288 testes de frontend, `tsc -b`, build do Vite e ESLint limpos com Node 25.9.0.

RISCO RESIDUAL: não validado com o app rodando — a suíte é `environment: 'node'`, sem DOM nem PTY real, então a detecção foi verificada contra viewports representativos, não contra a saída real das CLIs. A conferência manual é reiniciar o app com um agente Claude salvo e confirmar que o `/resume` é submetido sozinho. Se alguma CLI desenhar a entrada num formato não coberto por `PROMPT_LINE`, a reconferência simplesmente não dispara e o comportamento volta a ser o de antes — degrada para o estado atual, não para pior. Os 75 ms iniciais e o limite de 10 s de espera seguem como estavam: mexer neles é outra decisão, e não era necessária para este defeito.

Estado final: concluído — pendente de conferência manual em reinício real.

## Registro de Trabalho — 2026-08-10 (parte 3) — padrão de qualidade sobre a correção do `/resume`

PEDIDO: aplicar o padrão de qualidade ao trabalho da parte 2.

FEITO: auditoria do `terminal-session-store.ts` contra o item 2 do guia mínimo ("arquivos faz-tudo devem ser tratados como sinal de refatoração"). O arquivo tinha 934 linhas e três responsabilidades sobrepostas: ciclo de vida da sessão (a razão de existir da classe), leitura do buffer renderizado do xterm e interpretação do que a tela mostra. Os dois últimos blocos eram funções puras, sem acesso à classe, e **nenhum tinha teste** — apesar de decidirem se um agente aparece como ocupado, ocioso ou esperando aprovação.

Extraídos dois módulos, na mesma convenção dos demais arquivos de `terminal/` e `services/` (um assunto por arquivo):

- `terminal-buffer-reader.ts` — `readViewport`, `readBuffer`, `readTerminalTail`, `computePreview`, `computeSignature`. Recebe um terminal, devolve texto; não conhece sessão.
- `terminal-screen-state.ts` — `cleanPrompt`, `isBusyScreen`, `looksLikeApprovalPrompt`, `hasCodexInteractivePrompt`, `isCodexTrustPrompt`. Heurísticas sobre texto renderizado; não conhece xterm.

O store caiu para 790 linhas e passou a importar ambos. `BUSY_INDICATOR`, que era testado direto como regex, virou a função `isBusyScreen` — a constante deixou de vazar para fora do módulo que a define. `getInitialTextDelay` ficou no store por depender de `Session`.

TESTE: 29 casos novos (12 para o leitor de buffer, 17 para o reconhecimento de tela), cobrindo o que antes não tinha nenhum: a assinatura que colapsa spinner e contador de tempo mas muda quando há saída real, a rejeição de lista numerada sem pergunta de confirmação, o rodapé fixo da CLI fora da pré-visualização, e o diálogo de confiança do Codex sob ANSI. O leitor usa um `Terminal` mínimo dublado, já que a suíte roda em `environment: 'node'`, sem DOM. Total: 317 testes de frontend e 514 do backend.

VALIDAÇÃO: `tsc -b`, build do Vite, ESLint e `git diff --check` limpos com Node 25.9.0. Dois defeitos apareceram durante a validação e foram corrigidos: o ESLint apontou que a anotação `no-control-regex` do `ANSI_ESCAPE` não veio junto na extração, e um teste meu comparava `'antigo\novo'`, onde o `\n` consumia a letra da palavra seguinte — erro do teste, não do código.

RISCO RESIDUAL: a extração é mecânica e o comportamento não mudou, mas as heurísticas de tela seguem sendo heurísticas: reconhecem os formatos atuais das CLIs e podem precisar de ajuste quando elas mudarem o desenho. Agora, ao menos, cada formato reconhecido está registrado como teste, então uma mudança de formato falha visivelmente em vez de degradar em silêncio. A conferência manual do `/resume` (parte 2) continua pendente.

Estado final: concluído.

## Registro de Trabalho — 2026-08-10 (parte 4) — guias específicos: risco de submeter texto do usuário

PEDIDO: seguir os guias do padrão de qualidade, não só o guia mínimo.

FEITO: leitura de `docs/CORE-PADROES-OBRIGATORIOS.md`, `core/DESIGN_SYSTEM_BACKEND.md` e do índice de `guias/`. Os guias de `guias/frontend|backend|integracao/` tratam de features específicas (heatmap, calendário, scraping, deploy) e nenhum se aplica a este trabalho; o `DESIGN_SYSTEM_FRONTEND.md` é identidade visual, também fora de escopo. O contrato aplicável é a seção 8 do design system de backend — pirâmide de testes, TDD e "o que não pode ficar sem teste" — mais o checklist da seção 11.

A auditoria por esse critério encontrou **uma falha de segurança no código que eu mesmo tinha escrito na parte 2**. O item 8.3 exige teste para "fluxos destrutivos ou irreversíveis", e a reconferência de submissão era exatamente isso sem estar coberta: `isSubmissionPending` usava `startsWith`, então se o usuário começasse a digitar durante a janela de retentativa (até ~1,8 s) e sua frase começasse com o texto que enviamos, a função reportava "pendente" e um Enter era disparado — **submetendo a linha inacabada dele**, sem confirmação, para um agente que pode agir de forma irreversível.

Seguindo o fluxo de TDD da seção 8.2, o teste veio primeiro e reprovou a implementação existente. A correção troca `startsWith` por igualdade: se a linha contém mais do que enviamos, alguém está digitando nela e nada é reenviado. Dicas que o próprio TUI desenha ("enter to send") continuam toleradas porque ficam depois de um espaçamento largo até a borda da caixa, recortado antes da comparação — diferente de digitação contínua, que segue um espaço simples. Casos ambíguos resolvem como "não pendente", ou seja, deixam de reenviar o Enter em vez de arriscar submeter rascunho alheio: a falha segura é o `/resume` não ser enviado, que é o bug original, e não uma ação que ninguém pediu.

Um segundo teste caiu junto no caminho e expôs que meu limiar inicial de espaçamento (3) recortaria instrução legítima com quebra de linha; passou para 5, acima do que o reflow de texto produz entre palavras. Dois testes que eu havia escrito para o mesmo comportamento com espaçamentos diferentes foram consolidados em um, com o critério explicitado no comentário.

TESTE: 318 testes de frontend (13 no módulo de submissão, incluindo o novo caso de segurança) e 514 do backend. `tsc -b`, build do Vite, ESLint e `git diff --check` limpos com Node 25.9.0.

RISCO RESIDUAL: a separação entre "dica do TUI" e "usuário digitando" é heurística de espaçamento e pode errar em uma CLI que alinhe dicas com menos de cinco espaços — nesse caso a reconferência simplesmente não dispara, degradando para o comportamento anterior à correção, nunca para envio indevido. O primeiro Enter (75 ms após o texto) continua sem essa verificação de propósito: ali acabamos de escrever e o usuário não teve janela para digitar; é o comportamento original, preservado. A conferência manual em reinício real segue pendente.

Estado final: concluído.

## Registro de Trabalho — 2026-08-10 (parte 5) — abrir o terminal marca a notificação como lida

PEDIDO: tarefa do Notion "Bug: clicar no terminal com notificação ativa não marca como 'lida'". Com vários terminais no canvas, a notificação continuava ativa depois de eu visitar o agente, então o badge deixava de dizer quais realmente ainda precisam de mim.

CAUSA: "ler" era um efeito colateral escrito à mão dentro do painel de notificações. Só o `onDismiss` do `NotificationsPanel` marcava lida — e ele existia apenas no clique do item da lista. Os outros dois caminhos de abertura (clique no card do terminal no canvas e clique na linha do dock de terminais) chamavam `setExpandedTerminalId` direto, abrindo o agente sem tocar no histórico. Abrir e ler eram a mesma ação para o usuário e duas coisas diferentes no código.

FEITO: `CanvasView` ganhou um `openTerminal` que é o único caminho de abertura — ele abre a gaveta, registra o `lastPrompt` do turno como reconhecido e marca as pendências daquele nó como lidas. Os três pontos que abriam terminal (`onExpand` do bloco, `onExpandNode` do dock, `onExpandNode` do painel) passam por ele. O `onDismiss` do painel virou código morto e foi removido junto com o prop: abrir já é ler, em qualquer caminho.

O reconhecimento em si (guardar o `lastPrompt` + soltar o nó do conjunto de notificações ativas) estava copiado em quatro handlers do painel e virou `acknowledgeNodeNotifications`. Ele lê o snapshot pelo `store.getSnapshot`, não pelo `sessionSnapshots` renderizado — assim o callback é estável e pode ser injetado nos dados dos blocos sem que cada tecla digitada por um agente invalide os nós todos (o `reuseData` não observa esse campo, e uma closure recriada a cada snapshot guardaria prompt velho).

Em `canvas-notifications.ts`, as três funções de marcar como lida eram o mesmo `map` repetido; foram reduzidas a um `markRead(history, alvo, now)` compartilhado que **devolve o próprio histórico quando nada muda**. Isso deixou de ser detalhe quando marcar virou parte de abrir: sem preservar a identidade, todo clique num terminal regravaria o histórico no `localStorage` e re-renderizaria o painel sem nenhuma mudança real.

TESTE: caso novo cobrindo a estabilidade de referência das três funções (marcar de novo o que já está lido, marcar um nó sem pendência, marcar tudo) — é a garantia do clique barato. 319 testes de frontend.

VALIDAÇÃO: `tsc -b`, build do Vite, ESLint e `git diff --check` limpos.

RISCO RESIDUAL: se a gaveta já estiver aberta quando o agente fizer um pedido novo, a notificação dispara mesmo com o terminal à vista — decisão deliberada: o usuário pode ter aberto e saído de perto, e deixar de avisar um pedido real é pior que um badge a mais. Um novo pedido depois da visita volta a notificar normalmente porque o reconhecimento é amarrado ao `lastPrompt` do turno, e um prompt novo é turno novo. Não validado com o app rodando: a suíte é `environment: 'node'`, sem DOM; a conferência manual é deixar um agente ocioso, clicar no card dele no canvas e ver o contador do sino cair na hora.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-11 (parte 3) — execução de `.PY` no macOS

IDENTIDADE: Bug: Não estou conseguindo rodar arquivos no canvas pelo MAC.
PEDIDO: arquivo com extensão `.PY` não abria no terminal na versão macOS.

CAUSA PROVÁVEL: o compositor de execução gerava `env python3 arquivo.PY` para todos os sistemas POSIX. O PTY do macOS já envolve comandos explícitos no shell de login (`zsh -l -i -c`), portanto a camada extra de `env` não era necessária e tornava o caminho diferente dos demais interpretadores.

FEITO: `.py`/`.PY` agora gera `python3 arquivo` diretamente. A resolução continua sendo feita pelo shell de login do macOS, preservando o PATH carregado pelo ambiente do usuário.

TESTE: adicionada regressão explícita para `.PY` em `darwin`; teste existente de `.py` atualizado para o contrato direto `python3`.

DOC: adicionadas orientações de Python 3 no macOS em `docs/projeto/RODAR-VIA-CODIGO-FONTE.md` e `docs/guias/GUIA-USUARIO.md`.

VALIDAÇÃO: pendente nesta máquina Linux — precisa ser executado no macOS com Python 3 instalado e um arquivo `.PY` real.

Estado final: concluído — aguardando conferência manual no macOS.

## Registro de Trabalho — 2026-08-10 (parte 6) — injetar contexto deixou de ser o mesmo que enviar prompt

PEDIDO: tarefa do Notion "Bug: prompt inicial sendo enviado automaticamente". Para alguns agentes, o prompt de contexto — aquele que só prepara o agente — era submetido assim que o terminal subia. O usuário perdia a janela para escrever o pedido real e o agente saía caçando uma tarefa inexistente dentro do texto de contexto, gastando token e produzindo trabalho fora do escopo.

CAUSA: a intenção de executar estava embutida no próprio texto. `composeTerminalInitialText` e `buildCanvasTerminalInitialText` terminavam chamando `toSubmittedTerminalText`, ou seja, todo prompt inicial nascia com o Enter colado nele; o store só obedecia. Não havia, em lugar nenhum, a distinção entre "isto é contexto" e "isto é um pedido".

A divergência entre agentes que o relato descreve era acidental, e a parte 2 desta mesma data a eliminou na direção errada: antes, quando o TUI comia o Enter, o texto ficava parado na linha de entrada e o agente não executava — que é justamente o comportamento desejado, acontecendo por acaso. A confirmação de envio adicionada na parte 2 tornou o disparo confiável para todos, e com isso o defeito de regra deixou de ser intermitente e apareceu inteiro.

FEITO: a quebra de linha final passou a ser o portador explícito da intenção, do compositor até o PTY. `splitTerminalSubmission` devolve `submit: null` quando o prompt não termina em quebra, e o store, nesse caso, escreve o texto e para por aí — sem Enter e sem confirmação de envio, porque não há envio a confirmar. Ganhou companhia de `isSubmittedTerminalText` e `stripTerminalSubmission`, que dão nome à mesma regra nos dois sentidos.

Com isso o contexto permanente (padrão de qualidade + contexto do canvas + identidade + arquivos .md ligados + arquivo de planejamento) sai como texto puro: é digitado na entrada da CLI e fica esperando o usuário escrever a tarefa depois dele. O contexto continua chegando ao agente — chega junto com o pedido, numa mensagem só.

Dois caminhos continuam submetendo, e é decisão consciente, não sobra: o `/resume` de um agente restaurado é um comando cuja razão de existir é rodar (deixá-lo digitado e parado é exatamente o defeito corrigido na parte 2), e a passagem de responsabilidade carrega um pedido que alguém despachou de propósito para aquele terminal. A regra que ficou é "submete quem carrega uma instrução de verdade", e `buildCanvasTerminalInitialText` a aplica propagando a intenção do prompt que recebe, em vez de decidir por conta.

Um detalhe de dados entrou junto: `handoffText` é transitório e pode vir submetido, mas `initialText` é persistido e é sempre contexto. Blocos salvos antes desta mudança guardaram o contexto já com o Enter no fim, então a leitura do dado persistido recorta a quebra final — sem isso, um canvas antigo voltaria a executar sozinho ao reabrir, e o defeito sobreviveria à correção.

TESTE: 325 testes de frontend. Os novos cobrem a regra nos dois lados: contexto permanente não sai submetido (o mesmo caminho serve claude, codex e gemini — a divergência por agente não existe mais para checar uma a uma), passagem de responsabilidade e `/resume` continuam submetidos, terminal comum não ganha envio que nunca teve, e o formato antigo persistido é desarmado na leitura.

VALIDAÇÃO: `tsc -b`, build do Vite, ESLint e `git diff --check` limpos.

RISCO RESIDUAL: `/resume` e passagem de responsabilidade seguem disparando sozinhos — é a leitura que fizemos do pedido ("o prompt inicial de contexto"), e não a leitura literal do critério "nenhum agente envia sozinho o prompt inicial"; se a intenção era incluir esses dois, o lugar de mexer é a mesma linha, e vale como decisão do dono do projeto. Não validado com o app rodando: a suíte é `environment: 'node'`, sem PTY. A conferência manual é abrir um agente novo de cada tipo e ver o contexto parado na entrada, esperando; depois reiniciar o app com um agente salvo e confirmar que o `/resume` continua sendo enviado sozinho.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-10 (parte 7) — passar responsabilidade refeito como ação, não como reação

PEDIDO: tarefa do Notion "Refazer a feature de passar responsabilidade entre agentes (está bugada)". O relato listava cinco sintomas: a detecção de limite de uso quase nunca funciona, o botão pisca (aparece e some), clicar não faz nada além de o terminal piscar, só funciona Claude → Codex, e passa só o texto visível na tela.

CAUSA COMUM: a feature tinha sido construída como **reação a um estado detectado** em vez de **ação do usuário**. Disso saem quatro dos cinco sintomas de uma vez. O botão só existia quando `snapshot.usageLimit` estava preenchido **e** a atividade era `idle`/`exited`/`error`; como a atividade oscila a cada redesenho da CLI, a condição ligava e desligava sozinha — daí o piscar. E como `detectTerminalUsageLimit` era uma lista de expressões regulares contra o texto da tela, o gatilho quase nunca chegava.

FEITO: a passagem virou item fixo da topbar do terminal, sempre clicável, que abre a escolha do agente que vai assumir.

O ponto que decidiu o desenho: a escolha do destino era um **rodízio fixo** (`getNextHandoffAgent`) entre as CLIs conhecidas. Não era só a limitação "Claude → Codex" que o relato aponta — era não perguntar nada: nem modelo, nem esforço, nem projeto, nem nome. Só que o canvas já tem uma tela que pergunta tudo isso, no `TerminalMenu`. Ela estava soldada ao flyout da toolbar, então o único jeito de reusá-la era separá-la:

- `hooks/useAgentConfig.ts` — o estado de "como abrir um agente" (CLI, modelo, esforço, yolo, projeto, nome, arquivo de planejamento), o catálogo de modelos e a tradução disso em opções de terminal.
- `components/AgentConfigFields.tsx` — os campos, sem opinião sobre onde aparecem.
- `services/new-terminal-options.ts` — o tipo compartilhado, que antes morava dentro do componente de menu.

Com isso o `TerminalMenu` ficou só com o que é dele (o flyout e a fila de configurações) e o novo `HandoffDialog` oferece exatamente as mesmas opções. `getNextHandoffAgent` foi removido: qualquer agente, qualquer direção, escolhido por quem está olhando.

O histórico já vinha do buffer inteiro do xterm (`readBuffer`, 20 mil linhas de rolagem), não do viewport — o sintoma "passa só o que está na tela" era, na verdade, o corte: quando o transcript passava do orçamento, `prepareHandoffTranscript` **descartava o começo** e mandava só o fim. Isso entrega um agente que sabe *como* o outro estava mexendo no código e não faz ideia de *para quê*, porque o pedido original está no começo da conversa. Agora o corte preserva as duas pontas e anuncia o buraco no meio. O buffer do processo principal foi considerado e descartado como fonte: ele guarda 200 mil caracteres de bytes crus com ANSI, menos e pior do que as 20 mil linhas já renderizadas.

O prompt de handoff também parou de afirmar que o agente anterior bateu no limite de uso. A passagem agora acontece quando o usuário quiser; dizer o motivo seria inventá-lo.

REMOVIDO: `terminal-usage-limit.ts` e todo o rastro dele — o campo `usageLimit` do snapshot, a checagem por regex a cada chegada de saída (que rodava no caminho quente do `onOutput`), o rótulo "limite de uso atingido" no bloco e na gaveta, o ponto âmbar do trilho e a mensagem correspondente no painel de notificações.

CONVERSA COM A PARTE 6: o `handoffText` continua submetido, e isso é coerente com a correção de hoje mais cedo — contexto permanente é digitado e espera, mas uma passagem de responsabilidade carrega um pedido de verdade, despachado de propósito para aquele terminal. É a mesma regra ("submete quem carrega uma instrução"), aplicada aos dois casos.

TESTE: 323 testes de frontend. Os novos cobrem o corte que preserva as duas pontas (com marca explícita do trecho omitido), o transcript que cabe e não é tocado, e o prompt que não afirma mais o motivo da parada.

VALIDAÇÃO: `tsc -b`, build do Vite, ESLint e `git diff --check` limpos.

RISCO RESIDUAL: "todo o histórico" tem um teto real — 20 mil linhas de rolagem do xterm, e 160 mil caracteres no que é colado. Uma sessão muito longa perde o meio, com aviso, e o começo mais antigo que 20 mil linhas não existe mais no renderer. Não validado com o app rodando: a suíte é `environment: 'node'`, sem PTY nem DOM. A conferência manual é abrir dois agentes de CLIs diferentes, passar responsabilidade em cada direção e perguntar ao que recebeu o que o anterior estava fazendo. O sintoma "o terminal fica piscando sem parar depois de clicar" não pôde ser reproduzido aqui; ele vinha do caminho condicional que deixou de existir, mas isso é dedução, não observação.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-11 (parte 1) — campo de nome do menu de agente travando

PEDIDO: relato de campo — o input "Nome (opcional)" do menu de configuração de agente (toolbar e diálogo de handoff) às vezes fica travado, sem receber clique nem digitação, resolvendo sozinho ao fechar e reabrir o menu.

CAUSA: o campo fica dentro do flyout do menu de ferramentas, posicionado por `useToolbarFlyoutPosition` (`toolbar-flyout.ts`). O `useLayoutEffect` lia o elemento âncora (`containerRef?.current ?? panelRef.current?.parentElement`) uma única vez por abertura; se o ref ainda não estivesse anexado nesse frame exato — reabrir o menu rápido, enquanto ele ainda remonta — o efeito retornava sem agendar nova tentativa nem registrar listeners. O painel ficava preso na classe `invisible` (`visibility: hidden`), que torna todo o conteúdo, inclusive o input, não clicável e não focável — sem nenhum `disabled` visível no DOM, o que tornava o sintoma difícil de diagnosticar pelo DevTools. Nada além de fechar e reabrir o menu (que reseta `open`) fazia o efeito rodar de novo.

FEITO: o efeito agora tenta de novo via `requestAnimationFrame` (`waitForContainer`) até o container existir, e só então anexa os listeners de posicionamento (resize/scroll/`ResizeObserver`). O cleanup passou a cancelar tanto o frame de espera quanto os listeners.

TESTE: sem caso novo — `toolbar-flyout.ts` não tinha suíte própria antes desta mudança (é DOM-dependente: mede `getBoundingClientRect`/`ResizeObserver`, e a suíte de frontend roda em `environment: 'node'`).

VALIDAÇÃO: `npm run build` (`tsc -b` + `vite build`), suíte de frontend e `npm run lint` limpos.

RISCO RESIDUAL: não conferido com o app rodando — a verificação ficou restrita a build/lint, sem PTY nem DOM real. A conferência manual é abrir o menu de agente repetidamente e rápido (o caso que mais provocava o travamento) e confirmar que o campo de nome nunca mais fica preso.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-11 (parte 2) — prompt inicial do Claude Code não chegava sempre

PEDIDO: "não é sempre que o Claude Code recebe o prompt inicial de contexto, mas não sei dizer o por quê".

INVESTIGAÇÃO DESCARTADA: o candidato óbvio — uma condição de corrida no gate `initialTextReady` entre `TerminalNode` e o memo de nodes do `CanvasView` — foi verificado linha a linha e descartado. O design já é sólido: a captura de agentes restaurados e a hidratação de edges bloqueiam corretamente `store.ensure()` até estarem prontas (`restoredAgentTerminalIdsCapturedRef`), e o efeito reage certo quando o valor muda de `false` para `true`, porque `nodeData.initialTextReady` está nas deps. Registrado aqui para não repetir a mesma investigação depois.

CAUSA REAL: específica de Claude em modo yolo (`--dangerously-skip-permissions`), que mostra uma tela de confiança ("Do you trust the files in this folder?") em todo processo novo. O código aceitava essa tela às cegas, num `setTimeout` fixo de 800 ms, sem checar se ela realmente tinha renderizado. Em seguida, a heurística de "processo pronto" que decide quando escrever o texto de contexto (`scheduleInitialText`) olhava só se a tela estava quieta por 500 ms — sem diferenciar se essa quietude era o prompt real ou ainda a tela de aceite (o Codex tem essa diferenciação via `hasCodexInteractivePrompt`; Claude não tinha equivalente). Em boots mais lentos, a tela de confiança ficava "quieta" antes de ser de fato aceita, e o texto de contexto era escrito nela — perdido, sem log nem confirmação, porque texto sem Enter (contexto puro, ver parte 6 de 2026-08-10) nunca teve reconferência de envio.

O Codex já tinha esse mesmo problema resolvido corretamente: `handleCodexTrustPrompt` observa o próprio stream de saída até reconhecer o texto da tela de confiança, só então aceita e reagenda o texto inicial. Claude usava o esquema antigo (delay às cegas) ao lado do esquema novo do Codex, no mesmo arquivo.

FEITO: portado o padrão do Codex para o Claude. `isClaudeTrustPrompt` (`terminal-screen-state.ts`) reconhece a tela por texto normalizado, tolerante a variação de redação entre versões da CLI. `handleClaudeTrustPrompt` (`terminal-session-store.ts`) acumula a saída do processo e só aceita a tela quando `isClaudeTrustPrompt` confirma que ela apareceu de verdade; só então agenda o Enter (150 ms depois) e reagenda o texto de contexto (`CLAUDE_POST_TRUST_INITIAL_TEXT_DELAY_MS`, 2500 ms). A checagem de "processo pronto" em `scheduleInitialText` também passou a recusar escrever enquanto a tela de confiança ainda estiver visível (`claudeTrustPromptShowing`, olhando a tela atual, não uma flag) — cobre o caso raro de a pasta já vir confiada nesta sessão (a tela nunca aparece), sem introduzir espera nova nesse caminho. O delay fixo de 800 ms e a constante `CLAUDE_INITIAL_TEXT_DELAY_MS` saíram; o fallback absoluto de 10 s (`INITIAL_TEXT_MAX_WAIT_MS`) continua como rede de segurança se a tela de confiança nunca for reconhecida.

TESTE: 5 casos novos em `terminal-screen-state.test.ts` para `isClaudeTrustPrompt` (pergunta direta, variante por frases separadas, ANSI, não confundir com aprovação genérica nem com o texto do Codex). Sem caso novo para `handleClaudeTrustPrompt`/`scheduleInitialText` — `terminal-session-store.ts` não tem suíte própria (é PTY-dependente), mesma lacuna já registrada nas partes 3–4 de 2026-08-10 para o restante do arquivo.

VALIDAÇÃO: `npm run build`, `npx vitest run` (328/328) e `npm run lint` limpos.

RISCO RESIDUAL: não conferido com o app rodando — sem PTY real, a heurística de texto foi verificada contra telas representativas, não contra a saída real da CLI, e a redação exata da tela de confiança do Claude pode mudar entre versões (mesma limitação já aceita para `isCodexTrustPrompt`). O gap de "texto de contexto sem confirmação de que chegou" (fire-and-forget, ver parte 6 de 2026-08-10) segue existindo para qualquer CLI — não foi endereçado aqui porque a causa raiz confirmada era a tela de confiança do Claude, não a ausência geral de confirmação. A conferência manual é abrir um terminal Claude yolo em boot mais lento (ou simular) e confirmar que o texto de contexto chega mesmo quando a tela de confiança demora a aparecer.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-11 (parte 3) — prompt inicial do Claude Code não chegava mais

PEDIDO: "o Claude não está mais recebendo o prompt inicial de contexto".

MÉTODO: diferente das rodadas anteriores, a investigação foi feita contra a CLI de verdade. Um PTY real com `claude --dangerously-skip-permissions`, a saída interpretada por um emulador de terminal (pyte, para não confundir cursor-forward com espaço — dois falsos negativos meus vieram de recortar ANSI na mão), e o próprio store rodando sob vitest com uma ponte PTY falsa alimentada com o stream capturado. Todas as afirmações abaixo são observações, não deduções.

CORREÇÃO DA PARTE 2: o diagnóstico da rodada anterior estava errado, e o próprio registro dela já avisava que não tinha sido conferido com PTY real. Em modo yolo o Claude **não** mostra a tela de confiança na pasta — verificado abrindo um repositório com `hasTrustDialogAccepted: false`, onde ela não aparece, justamente porque o modo já dispensa aprovação. O que aparece em todo processo novo é outra tela:

    WARNING: Claude Code running in Bypass Permissions mode
    ❯ 1. No, exit
      2. Yes, I accept

`isClaudeTrustPrompt` exigia "trust" + "this folder", que essa tela não tem, então `handleClaudeTrustPrompt` nunca disparava: a parte 2 removeu o aceite cego que existia e o substituiu por um detector que nunca casa. O aviso ficava na tela, e o texto de contexto era digitado dentro dele.

CAUSA REAL, dois defeitos somados:

1. `\x1b[B\r` numa única escrita não aceita o aviso. Verificado 4 vezes (2 com as teclas juntas, 2 separadas): juntas, o aviso fica intocado na tela; separadas por uma pausa, ele é aceito. É a mesma razão já documentada para separar o texto inicial do seu Enter — ou seja, o aceite automático do modo yolo nunca funcionou de fato, nem antes da parte 2.

2. A checagem de "processo pronto" era vazia para o Claude. `receivedOutput` virava verdadeiro no primeiro byte, e os primeiros bytes de uma CLI de tela cheia são só sequências de escape, que não mudam a tela — então `lastMeaningfulAt` nunca era reiniciado e "quieto há 500 ms" já era verdade desde a criação da sessão. Medido com o stream real: a CLI desenha a interface em 2591 ms e o store escrevia o contexto em 2120 ms, antes de existir qualquer linha de entrada. O Codex tinha `hasCodexInteractivePrompt` para isso; o Claude não tinha equivalente.

Somados: o contexto era escrito cedo, numa tela que não era o REPL, e nada nunca conferia se ele havia chegado — o texto sem Enter (contexto puro, ver parte 6 de 2026-08-10) não tinha reconferência nenhuma. Daí o silêncio.

FEITO: a entrega deixou de ser cronometrada e passou a ser guiada pela tela, com confirmação.

- `hasClaudeInteractivePrompt` / `hasEmptyClaudeInput` (`terminal-screen-state.ts`): a linha de entrada do Claude existe / está vazia. A primeira pergunta só se o REPL subiu (tolerante: menu numerado não conta, porque aí a tela é um diálogo), a segunda é a que reconhece a sugestão `Try "..."` como entrada vazia. `hasCodexInputLine` faz o par equivalente para o Codex, distinguindo "ainda não subiu" de "já tem texto aqui".
- `readInputLineState(command, viewport)` reúne essas leituras numa tabela por CLI e devolve `{ ready, visible, empty }` — ou `undefined` para a CLI que não sabemos ler. O store consulta uma vez e não guarda mais nenhum `command === '...'` sobre telas; é aqui que uma CLI nova entra.
- `isClaudeBypassPermissionsWarning` substitui `isClaudeTrustPrompt`, com a redação real da tela.
- `scheduleInitialText` só escreve quando a linha de entrada da CLI está na tela; o teto para as CLIs que sabemos reconhecer subiu para 60 s (`INITIAL_TEXT_INPUT_WAIT_MS`), porque esperar entrega tarde e escrever cedo não entrega nunca. `paintedOutput` substitui `receivedOutput` na decisão: só conta como "a CLI começou" o que mudou a tela.
- `acceptClaudeBypassWarning` manda a seta e o Enter em escritas separadas (`KEY_SEQUENCE_DELAY_MS`) e reconfere pela tela: enquanto o aviso continuar visível, reenvia (até 3 vezes).
- `confirmContextDelivery` fecha o gap de fire-and-forget: 800 ms depois de escrever, se a linha de entrada estiver vazia, o contexto é reescrito (até 3 vezes, janela de 30 s). Só reescreve com a entrada visível e vazia — se o contexto está lá, se a entrada não apareceu ainda ou se alguém digitou (`inputTouched`), nada é escrito.
- `inputTouched` só é marcado por digitação de verdade: o `onData` do xterm carrega também as respostas do terminal às perguntas da CLI (atributos do dispositivo), que chegam como sequência de escape. Isso apareceu na bancada — a reconferência morria antes da primeira volta — e de passagem consertou o `[?1;2c` que essas respostas colavam no início do prompt registrado no card.

DOC: `GUIA-USUARIO.md` ganhou o comportamento observável que faltava desde a parte 6 de 2026-08-10 — o contexto é digitado sem Enter e espera o pedido do usuário; agora também que ele só é digitado quando a entrada da CLI está pronta, e que o aviso do modo yolo é respondido pelo app.

TESTE: `terminal-session-store.test.ts`, novo — o arquivo nunca teve suíte por depender de PTY, mas o que decide a entrega é a tela, não o PTY. Os testes alimentam o xterm do próprio store com o stream capturado da CLI real (preâmbulo de escapes, aviso do modo yolo, REPL pronto) e olham o que o store escreve: não escreve com só escapes na tela, não escreve dentro do aviso, aceita o aviso em duas escritas na ordem certa, reenvia o aceite enquanto o aviso persistir, escreve quando a entrada aparece, reescreve se a entrada continuar vazia e não reescreve quando o contexto está lá. Em `terminal-screen-state.test.ts`, as telas reais (aviso e REPL pronto) entraram como fixtures, incluindo o caso que mais importa: o rodapé do REPL pronto também diz "bypass permissions on" e não pode ser confundido com o aviso.

VALIDAÇÃO: `npm run build`, `npx vitest run` (348/348) e `npm run lint` limpos. Além disso, o algoritmo do fix foi executado contra um `claude` real, nos dois caminhos: com a tela de aviso (reconhecida em 2018 ms, aceita em 2368 ms, contexto escrito em 4913 ms e confirmado na entrada em 5716 ms) e sem ela (contexto escrito em 2026 ms, confirmado em 2855 ms). Nos dois, o contexto termina digitado na entrada, esperando o pedido do usuário.

RISCO RESIDUAL: não conferido com o app Electron rodando — a validação foi com PTY real, mas fora do app. O aviso do modo yolo só aparece uma vez por máquina: aceitá-lo faz a própria CLI gravar `skipDangerousModePermissionPrompt: true` no `settings.json` do usuário, então esse caminho não é reproduzível de novo sem uma configuração isolada (foi assim que ele foi testado aqui). A redação das telas pode mudar entre versões: se `hasClaudeInteractivePrompt` deixar de reconhecer a entrada, a escrita cai no teto de 60 s em vez de nunca acontecer; se a sugestão `Try "..."` mudar, a reconferência deixa de reescrever, que é o comportamento antigo. Gemini e CLIs sem detector continuam no esquema de silêncio + fallback de 10 s, sem reconferência de entrega.

Estado final: concluído — pendente de conferência manual no app rodando.

## Registro de Trabalho — 2026-08-12 — colar imagem no terminal do agente (Colar imagnes é dificil no terminal)

PROBLEMA: colar imagem num terminal de agente não funcionava de forma previsível. Cada sistema operacional, terminal e CLI tem um atalho diferente, e no Linux Mint o "Copiar para a área de transferência" da ferramenta nativa de captura não chegava na CLI.

CAUSA: um terminal é um cano de texto — ele não transporta bytes de imagem. As CLIs de agente contornam isso lendo a área de transferência por conta própria, o que no Linux significa chamar `xclip` (X11) ou `wl-paste` (Wayland). Nenhum dos dois vinha instalado na máquina de teste (`xclip`, `xsel`, `wl-paste` e `pngpaste` todos ausentes), então o `Ctrl+V` de imagem falhava em silêncio, independentemente de a captura ter copiado corretamente. Como o app é quem hospeda o terminal, delegar essa leitura para a CLI era o erro de origem: a normalização só existe se o app assumir a responsabilidade.

FEITO: o paste é interceptado no app e a imagem vira um caminho de arquivo antes de chegar na CLI.

- `image-mime-types.cjs`, novo: a lista de formatos de imagem aceitos e a resolução de tipo por nome de arquivo, extraídas de `file-attachments-ipc-handlers.cjs`. Existe porque dois caminhos independentes precisam da mesma resposta — anexo vindo do renderer (que declara o tipo) e imagem vinda da área de transferência (que muitas vezes só tem o nome do arquivo); a lista em um lugar só é o que impede os dois de divergirem.
- `clipboard-image.cjs`, novo: lê a imagem da área de transferência pelo `clipboard` do Electron, que é nativo em todas as plataformas e não depende de binário nenhum. Cobre as duas formas que aparecem na prática: bitmap cru (`readImage()`) e referência a arquivo em disco, que chega como lista de URIs `file://` e nunca como bitmap — `text/uri-list` (multiplataforma) e `x-special/gnome-copied-files` (Nemo/Nautilus, publicado como bytes e prefixado por `copy`/`cut`), com o texto puro como último recurso. Caminho relativo é descartado: a área de transferência não carrega diretório de trabalho, então resolvê-lo seria chutar um arquivo que ninguém copiou.
- `files:save-clipboard-image` (em `file-attachments-ipc-handlers.cjs`): junta a leitura acima ao `saveAttachment` que já existia, reaproveitando limite de 25 MB, validação de formato e a pasta `clipboard-attachments`.
- `terminal-image-paste.ts`, novo: as decisões do lado do renderer, livres de evento DOM e IPC para serem testáveis — achar a imagem no `clipboardData` (`items` e `files`, porque qual dos dois vem populado depende do app de origem), reconhecer um paste de texto comum e formatar o caminho para a linha de entrada (aspas só quando há espaço; espaço no fim para continuar digitando).
- `terminal-session-store.ts`: `bindImagePaste` registra um listener de `paste` em fase de captura no elemento do xterm, que roda antes do handler interno do xterm e pode impedir que a imagem seja colada como string vazia. Texto comum devolve o evento para o caminho normal do xterm. Havendo imagem no evento, ela é salva direto; não havendo imagem nem texto, cai no `files:save-clipboard-image` — que é exatamente o caso do Linux Mint, em que o renderer não enxerga o formato mas a leitura nativa enxerga. O caminho salvo é escrito no PTY por `typeIntoSession`, como se tivesse sido digitado (`inputTouched` + `trackTypedInput`).

Resultado: um atalho só (`Ctrl+V` / `Cmd+V`), mesmo comportamento em Windows, macOS, X11 e Wayland, e para qualquer CLI de agente — todas aceitam caminho de arquivo no prompt. Nenhuma dependência nova para o usuário instalar.

TESTE: `clipboard-image.test.cjs` (9 casos, com um dublê de `clipboard` para não exigir Electron): bitmap lido como PNG sem tocar o disco, queda para referência de arquivo quando o bitmap está vazio, lista do GNOME lida de bytes com o prefixo de operação ignorado, referência morta pulada para a próxima entrada resolver, arquivo que não é imagem recusado, área de transferência sem imagem reportada em vez de estourar, e um `clipboard` sem nenhum dos formatos tratado como simplesmente não ter imagem. `terminal-image-paste.test.ts` (13 casos): imagem por `items` e por `files`, item `string` que acompanha uma imagem copiada ignorado (tratá-lo como arquivo entregaria anexo vazio), documento não confundido com imagem, texto comum reconhecido para preservar o paste do xterm, e a formatação do caminho com e sem espaços.

VALIDAÇÃO: `npm run build`, `npm test` (523/523), `npx vitest run` (109/109) e `npm run lint` limpos.

Além disso, conferido **no app Electron rodando de verdade**, sob Xvfb, com `--user-data-dir` isolado para não tocar o canvas real de ninguém, com um agente Claude Code de verdade aberto no canvas. Os quatro caminhos, cada um com um evento `paste` disparado no elemento do xterm:

1. **Imagem no evento** (caminho rápido): PNG vermelho 8×8 num `DataTransfer`. `defaultPrevented: true` — o interceptador tomou o evento antes do xterm; arquivo gravado em `clipboard-attachments` e caminho digitado na linha de entrada do Claude.
2. **Nada no evento, bitmap no clipboard do SO** (o caso do Linux Mint): PNG azul escrito no clipboard nativo pelo processo principal, e o `paste` disparado com `items: 0` e `text: ""` — literalmente vazio, que é o que o Chromium entrega à página nesse cenário. O fallback nativo achou a imagem, salvou e digitou o caminho. Confirmado pelo pixel (0,0) de cada arquivo: vermelho no caso 1, azul no caso 2 — cada imagem veio pela rota certa.
3. **Texto comum** (regressão): `defaultPrevented: false` e o texto colado normalmente pelo caminho do próprio xterm, intocado.
4. **Arquivo copiado no gerenciador de arquivos**: `x-special/gnome-copied-files` com `copy\nfile://...` apontando para um PNG verde em `/tmp/pasta com espaço/`. Lido, copiado para os anexos e digitado.

E a prova de que a ponta serve para alguma coisa: com o caminho da imagem verde na entrada, o agente foi perguntado "que cor tem essa imagem?" e respondeu **"Verde"** depois de `Read 1 file` — ou seja, a CLI de fato enxergou a imagem colada. Por fim, colar com a área de transferência inteiramente vazia não gravou arquivo nenhum e não quebrou o app.

RISCO RESIDUAL: as imagens coladas se acumulam em `clipboard-attachments` sem limpeza automática, igual ao que já acontecia com os anexos do chat. Se a área de transferência trouxer texto **e** imagem ao mesmo tempo, o texto ganha; é o comportamento esperado de um `Ctrl+V`, mas significa que uma imagem acompanhada de legenda cola só a legenda. Colar por arrastar-e-soltar não foi coberto. A imagem referenciada por um arquivo é **copiada** para a pasta de anexos, não referenciada onde está — o caminho fica estável se o original for movido, ao custo de duplicar o arquivo. A conferência foi em Linux/X11 sob Xvfb; Windows, macOS e Wayland seguem cobertos apenas pelo `clipboard` do Electron ser nativo neles, sem execução real.

Estado final: concluído — mas a validação tinha um furo, corrigido na parte 7 deste mesmo dia: os quatro caminhos foram exercitados com `ClipboardEvent` **sintético**, o que prova o tratamento do evento e não que o atalho do teclado produz esse evento. Com `Ctrl+V` ele não produzia, e só `Ctrl+Shift+V` funcionava de verdade.

## Registro de Trabalho — 2026-08-12 (parte 2) — skill para dirigir o app (Colar imagnes é dificil no terminal)

MOTIVO: a conferência do paste de imagem no app rodando (parte 1) custou uma descoberta inteira que ia se perder com a sessão — xvfb, `--no-sandbox`, userData isolado e, o que mais atrasa, o fato de o elemento `.xterm` só existir depois que a gaveta do terminal abre. Antes disso `document.querySelector(".xterm")` devolve `null` e o app parece quebrado.

FEITO: `.claude/skills/rodar-app/`, com `SKILL.md`, `driver.mjs` e `d.sh`. O driver é um REPL sobre o `_electron` do Playwright: uma linha de texto por comando, resposta terminada por `--done--`, que é o que permite dirigi-lo de dentro do tmux sem dormir tempo fixo. Além do básico (`launch`, `ss`, `click-text`, `type`, `press`, `eval`, `main`), traz o que a feature de colar imagem exigiu: `expand` (abre a gaveta e confirma que o xterm montou), `paste image|text|empty` e `clipboard-image` / `clipboard-file` / `clipboard-clear`, que escrevem no clipboard **do sistema operacional** pelo processo principal — é assim que se testa a leitura nativa sem xclip e sem ninguém apertando "copiar" em outro programa.

`playwright-core` fica fora do `package.json` (`npm install --no-save`, dentro de `app/`): serve só para dirigir o app e não vale pesar a instalação de quem só quer usar o Felixo. Como ele mora em `app/node_modules`, fora da cadeia de resolução da skill, o driver o resolve com `createRequire` a partir do `package.json` do app — sem isso o `import` não o acha.

VALIDAÇÃO: a skill foi executada seguindo o próprio `SKILL.md`, do zero: instalar, subir o tmux, `launch`, abrir um agente Claude Code real, `expand`, `focus-terminal` e os quatro caminhos de paste. As cores confirmaram qual rota entregou cada imagem (vermelho pelo evento DOM, azul pelo clipboard nativo, e o arquivo copiado pelo `clipboard-file`), e colar com o clipboard vazio não gravou nada. O guard do `d.sh` para sessão tmux ausente também foi conferido.

DOC: `GUIA-DESENVOLVEDOR.md`, seção "Conferir no app rodando", aponta para a skill. `.claude/settings.local.json` entrou no `.gitignore` — é da máquina de quem edita (caminhos absolutos, versões de node), ao contrário das skills do projeto, que são versionadas.

RISCO RESIDUAL: um `npm ci` apaga o `playwright-core` instalado com `--no-save`; o `SKILL.md` avisa que basta repetir o comando. O driver abre a build de produção (`app/dist/`), então mudança no renderer sem `npm run build` não aparece e a tela mostra a versão antiga sem erro nenhum — está nos "detalhes que custaram tempo". Conferido só em Linux/X11 sob Xvfb.

Estado final: concluído e validado.

## Registro de Trabalho — 2026-08-12 (parte 3) — ordem alfabética na aba Projetos (Colar imagnes é dificil no terminal)

PEDIDO: a aba "Projetos" do canvas deveria listar em ordem alfabética.

ESTADO ANTERIOR: `projects:list` devolve `ORDER BY updated_at DESC` (`projects-repository.cjs`) — o projeto mexido por último no topo. Faz sentido para um seletor, em que o mais recente costuma ser o próximo, mas numa lista que existe para *encontrar* uma pasta a ordem muda a cada uso e obriga a varrer tudo de novo. A navegação de arquivos dentro do projeto (`projects:list-directory`) já era ordenada, com pastas antes de arquivos.

FEITO:

- `projects-panel-order.ts`, novo, ao lado do painel (mesmo padrão de `terminals-panel-reorder.ts`): `sortProjectsByName` com um `Intl.Collator` de módulo. `numeric: true` põe `projeto2` antes de `projeto10`; `sensitivity: 'base'` ignora acento e caixa, sem o que `Álbum` iria para depois de `Zulu` (`Á` vem depois de `z` por código de caractere) e todo nome com inicial maiúscula viria antes de qualquer minúscula. Sem locale fixo: quem usa decide, pela configuração do sistema. O caminho desempata, para dois nomes equivalentes ao collator (`Api`/`API`) não trocarem de lugar sozinhos entre recargas.
- `ProjectsPanel.tsx` aplica a ordem num `useMemo` sobre o estado, não a cada `setProjects` — assim a ordem é consequência da lista, e não algo que cada ponto de carga precise lembrar de aplicar. O memo evita reordenar em renders que não mexeram nos projetos; o painel re-renderiza a cada passo da remoção em dois toques.
- **A ordenação foi feita só no painel, de propósito.** `projects:list` também alimenta o menu de terminais, o painel Git e os projetos do chat, onde "usado por último primeiro" continua sendo a ordem útil. Mudar o `ORDER BY` no repositório teria alcance bem maior do que o pedido.
- `projects-ipc-handlers.cjs`: o `localeCompare` da listagem de arquivos virou um `Intl.Collator` de módulo com `numeric: true`. Sem isso as duas listas da mesma aba discordavam na tela — a de projetos mostrando `projeto2, projeto10` e a de arquivos logo abaixo mostrando `script10.sh, script2.sh`. Apareceu na conferência visual, não nos testes.

TESTE: `projects-panel-order.test.ts`, 8 casos — ordem alfabética, caixa ignorada, acento tratado como letra base, número por valor, desempate por caminho, lista de origem preservada, lista vazia/de um item e demais campos do projeto intactos.

VALIDAÇÃO: `npm run build`, `npm test` (523/523), `npx vitest run` (373/373) e `npm run lint` limpos. Conferido também no app rodando, pela skill `rodar-app`: sete projetos gravados fora de ordem, com o backend devolvendo `["Marte","projeto2","projeto10","Ação","Álbum","alfa","Zulu"]` e a tela mostrando `Ação, Álbum, alfa, Marte, projeto2, projeto10, Zulu` — o contraste entre as duas listas é a prova de que a ordenação está agindo. A navegação de arquivos passou a mostrar `script2.sh` antes de `script10.sh`. A remoção em dois toques foi refeita ponta a ponta: a linha de confirmação aparece na posição certa e o projeto some do banco.

DE PASSAGEM: a skill `rodar-app` ganhou uma correção achada aqui — o `click-text` casava por trecho antes de casar exato, então `click-text Remover` acertava a lixeira do primeiro projeto (`aria-label` "Remover <nome> dos projetos") em vez do botão "Remover" da confirmação. O clique parecia ter funcionado, no alvo errado. Agora tenta exato primeiro.

RISCO RESIDUAL: as outras listas alimentadas por `projects:list` seguem por `updated_at DESC` — se a ordem alfabética for desejada nelas também, o lugar é o `ORDER BY` do repositório, e aí vale rever se o menu de terminais perde algo. `sensitivity: 'base'` faz `Api` e `API` empatarem no nome, e é o caminho que decide a ordem entre eles.

Estado final: concluído e validado no app rodando.

## Registro de Trabalho — 2026-08-12 (parte 4) — abrir arquivos de texto do disco no canvas (Colar imagnes é dificil no terminal)

PEDIDO: abrir arquivos de texto no canvas, editar, com modo de visualização de markdown no topo do bloco.

ESTADO ANTERIOR: o bloco de arquivo já editava e já alternava edição/visualização no topbar — mas era **preso a `.md` dentro da pasta `canvas-files` do próprio app**. O `resolveSafePath` força a extensão e confina ao diretório; não havia como apontar para um arquivo que já existisse no disco.

DECISÕES DO FELIPE (perguntadas antes de implementar, porque mudavam o trabalho):
1. Abrir **dos dois jeitos** — pela aba Projetos e por um seletor livre.
2. Num arquivo que não é markdown, a visualização mostra **texto puro**.

FEITO:

- `text-file-access.cjs`, novo — o coração da entrega. Abrir "qualquer arquivo do disco" tira o chão que confinar numa pasta dava: sem regra explícita, `text-file:read` passa a ler qualquer caminho que o renderer resolva nomear. A regra é uma só: **o renderer nunca autoriza um caminho, ele só usa um caminho já autorizado**. Um caminho entra por dois jeitos legítimos — estar dentro de um projeto registrado (a fronteira que o app já aceita em `projects:list-directory`) ou ter sido escolhido **pela pessoa** num diálogo nativo, com o processo principal guardando aquele caminho exato. As concessões vivem em memória e morrem com o app.
- Resolver com `realpath` antes de comparar é o que fecha a porta do link simbólico: sem isso, um atalho dentro de um projeto apontando para fora dele passaria pela verificação de prefixo. Tem teste para esse caso e para `..`.
- `text-file-ipc-handlers.cjs`, novo — `pick`/`open-in-project`/`read`/`write`/`watch`/`unwatch`. Nada cria nem apaga: o bloco não é dono do arquivo, só aponta. Limite de 2 MB porque o editor é um `<textarea>`, não um editor com virtualização — recusar cedo é melhor do que congelar a janela.
- `registerProjectsIpcHandlers` passou a devolver `listProjectRoots`. Expõe só os caminhos, e não o repositório, para ninguém passar a gravar projetos por fora dali.
- `canvas:clear` também revoga as concessões: limpar o canvas apaga os blocos que as carregavam, e mantê-las vivas seria guardar acesso sem dono.
- `useFileNodeDocument.ts`, novo — resolve qual das duas fontes usar e entrega sempre a mesma coisa, para o componente cuidar de aparência e não de origem. Resolve também dois problemas que existiam **antes** e ficariam piores num arquivo de projeto de verdade: (a) gravar dispara o observador do próprio arquivo, que recarregava e jogava o cursor para o fim no meio da digitação — agora o hook compara com o que acabou de gravar e distingue "mudou por fora" de "fomos nós"; (b) gravava a cada tecla, agora agrupa em 300 ms, com descarga garantida ao sair do bloco para nenhuma edição morrer com ele.
- `file-node-preview.ts`, novo — `.md`/`.markdown`/`.mdx` viram markdown formatado; qualquer outra coisa vira texto puro em `<pre>`. Formatar markdown num `.py` não é preview, é leitura errada: `#` viraria título e a indentação, que ali *é* o programa, sumiria.
- `FileNode.tsx` — o alternador do topbar agora diz o que vai fazer neste arquivo ("Visualizar como markdown" ou "Visualizar texto"). Num arquivo externo, a faixa Scratchpad/Plano dá lugar ao caminho: "Gerar diagnóstico" num README ofereceria sobrescrever o arquivo de outra pessoa.
- Entradas: botão de abrir no canvas em cada arquivo da aba Projetos (ao lado do de rodar) e "Abrir arquivo existente…" dentro do popover do botão Arquivo — junto de "Criar" porque as duas respondem à mesma intenção, e um botão a mais na barra faria a coluna crescer por uma diferença que só importa depois.

TESTE: `text-file-access.test.cjs`, 11 casos com um dublê de `realpath` que monta link simbólico sem tocar o disco — dentro do projeto autoriza, fora recusa, escolher autoriza, a concessão vale para o arquivo e não para a pasta, link simbólico e `..` não escapam, raiz consultada a cada verificação, raiz sumida não derruba a checagem, revogação devolve o acesso. `file-node-preview.test.ts`, 8 casos, incluindo os que separam extensão de sufixo parecido (`notas.mdo`) e pasta de arquivo (`docs.md/notas.txt`).

VALIDAÇÃO: `npm run build`, `npm test` (534/534), `npx vitest run` (381/381) e `npm run lint` limpos. No app rodando, pela skill `rodar-app`: `window.felixo.textFiles.read({path:"/etc/passwd"})` foi recusado com a mensagem certa (a fronteira segura de verdade, não só em teste); um `.md` do projeto abriu renderizado com o caminho no lugar da faixa de modos; editar no bloco chegou no arquivo em disco; trocar o arquivo por fora atualizou o bloco ao vivo; um `.py` abriu como texto puro com a indentação preservada e o `#` sem virar título; e o scratchpad `.md` do próprio canvas continua criando, editando e gravando (regressão, já que a carga dele passou pelo hook novo).

RISCO RESIDUAL: **o seletor nativo não foi exercitado.** Sob Xvfb não há portal de diálogo, então `dialog.showOpenDialog` não abre e a chamada fica pendurada — o caminho "escolher no seletor → bloco abre" só está coberto por tipos e pelos testes de `grant`/`authorize`, não por execução. Vale conferir à mão. Fora isso: as concessões do seletor morrem com o app, então um bloco apontando para fora dos projetos pede o arquivo de novo ao reabrir (é o comportamento seguro, mas é uma aspereza — persistir isso exigiria decidir por quanto tempo uma permissão dada uma vez continua valendo). Um arquivo aberto e depois removido do projeto deixa de ser autorizado e o bloco passa a mostrar erro. O editor é um `<textarea>`: sem realce de sintaxe, e por isso o limite de 2 MB.

Estado final: concluído e validado no app rodando, com a ressalva do seletor nativo acima.

## Registro de Trabalho — 2026-08-12 (parte 5) — "Falha ao atualizar" logo após o deploy (Colar imagnes é dificil no terminal)

SINTOMA: depois de subir o deploy da v0.1.14, o app mostrou "Falha ao atualizar".

CAUSA: corrida no workflow de release, não no código do app. Os três jobs de plataforma publicavam **na mesma release já pública**, e ela nascia pública no primeiro asset enviado. Os horários de upload da v0.1.14 mostram a janela:

```
15:01:01  Felixo-AI-Core-0.1.14-linux-x86_64.AppImage   <- release fica publica
15:01:36  latest-mac.yml
15:02:06  latest-linux.yml                              <- 65 s depois
15:03:58  Felixo-AI-Core-0.1.14-win-x64.exe
15:04:02  latest.yml (Windows)                          <- ~3 min depois
```

Entre 15:01:01 e 15:02:06 a release já era a "latest" sem o `latest-linux.yml`. O app checa 10 s após abrir e a cada 10 min; caindo nessa janela, toma 404 no manifesto da própria plataforma e o `autoUpdater.on('error')` vira `state: 'error'`, que a `update-presentation.ts` mostra como "Falha ao atualizar". No Windows a janela era de quase 3 minutos.

DESCARTADO com evidência, para não consertar o que não estava quebrado: o app instalado é o `.deb` (`/opt/Felixo AI Core`, 0.1.13), e `resources/package-type` traz `deb`, então o electron-updater usa o `DebUpdater` — não é o erro clássico de `APPIMAGE env is not defined`. Rodando o binário instalado com `--user-data-dir` isolado, o update baixou inteiro (`New version 0.1.14 has been downloaded`). Ou seja, release e updater estão sãos; o erro foi de janela de tempo.

FEITO: a release passa a nascer rascunho e só vira pública quando os três jobs passarem.

- `app/package.json`: `releaseType` de `release` para `draft`. O electron-updater ignora rascunho, então deixa de existir estado intermediário visível — ou a release está completa, ou ela não existe para quem procura atualização.
- `.github/workflows/release.yml`: job `finalize` com `needs: publish`, que roda `gh release edit --draft=false --latest`. Com `needs` numa matriz, ele só roda se as três plataformas passarem; e como `fail-fast: false` deixa as outras terminarem quando uma falha, uma release parcial simplesmente fica em rascunho em vez de ir ao ar pela metade.
- O aviso de Gatekeeper do macOS mudou do job de matriz para o `finalize`: é edição de metadados da release, igual à publicação, e no job de matriz precisava de um `if: matrix.os == 'ubuntu-latest'` só para não ser anexado três vezes.
- Os dois passos são idempotentes (aviso já presente / release já pública), para reexecutar o workflow não ser erro.

VALIDAÇÃO: YAML validado e a sintaxe shell dos passos conferida com `bash -n`. **O caminho completo não foi executado** — só um release de verdade exercita rascunho→público, e isso depende de um push.

RISCO RESIDUAL: se `gh release view` não enxergar a release em rascunho no runner, o `finalize` falha e a release fica em rascunho — ninguém recebe uma release quebrada, mas o deploy não sai e é preciso publicar à mão (`gh release edit vX.Y.Z --draft=false --latest`). É o modo de falha seguro, e vale conferir a primeira execução. Além disso, a v0.1.14 já saiu no esquema antigo; o rascunho só vale da próxima em diante.

Estado final: **este fix estava errado e foi substituído na parte 8**. Rascunho não cria tag no git, e sem tag o GitHub aceita várias releases com o mesmo `tag_name` — os três jobs paralelos deixaram de colidir e criaram três rascunhos separados na v0.1.15.

## Registro de Trabalho — 2026-08-12 (parte 6) — ler e editar arquivo de projeto no terminal (Colar imagnes é dificil no terminal)

RELATO: clicar num `.md` na aba Projetos abria um terminal com `README.md: comando não encontrado`; e o botão de abrir no canvas (parte 4) não era o que se queria para ler — a preferência é ler e editar **no terminal**.

CAUSA do "comando não encontrado": `buildRunCommand` só conhece interpretador para `.py/.js/.ts/.sh/.ps1`; qualquer outra extensão caía no fallback `{ command: fileName, args: [] }`, que entrega o caminho nu ao shell — o equivalente a digitar `./README.md`. Para um script sem shebang isso ainda é um erro informativo; para um markdown é uma ação que nunca fez sentido.

DECISÕES DO FELIPE: clique abre **editor direto** (`$VISUAL`/`$EDITOR`, senão o primeiro instalado); o bloco de canvas **continua**, como ação secundária.

FEITO:

- `editor-command.cjs`, novo — `$VISUAL` antes de `$EDITOR` (quem configurou já disse o que quer), e sem configuração cai numa lista **conferida no PATH** com o `resolveCommandPath` que já existia: `nano`, `micro`, `vim`, `vi` no POSIX, `notepad` no Windows. Conferir importa: oferecer um editor não instalado só mudaria o "comando não encontrado" de lugar, que é o bug que este módulo existe para matar. Editor configurado não passa pelo PATH — pode ser caminho absoluto ou função do shell. A configuração é separada respeitando aspas, para `code -w` virar comando + argumento e um caminho com espaço no Windows continuar sendo um comando só.
- `text-file:resolve-editor` — resolvido no processo principal porque depende de `process.env` e do PATH, que o renderer não enxerga.
- `project-file-action.ts`, novo — `resolveProjectFileClick` devolve `edit` para texto e `run` para binário (abrir um `.png` no nano só mostraria lixo), e `canRunProjectFile` diz se vale oferecer o botão de rodar. A lista de binários é de **exclusão**, não de inclusão: arquivo de texto sem extensão é comum num projeto (`Makefile`, `LICENSE`, `Dockerfile`) e uma lista de inclusão deixaria todos eles de fora.
- `ProjectsPanel` — o clique na linha agora abre o editor; rodar virou botão próprio, oferecido **só** onde rodar significa alguma coisa; abrir no canvas continua como terceira ação. O ícone da linha deixou de ser o ▶ e passou a ser o lápis, para a linha dizer a verdade sobre o que o clique faz. Editar reaproveita o mesmo `onRunFile`: para o canvas, editar e rodar são a mesma coisa — um bloco de terminal com um comando e um diretório.
- **Rodar deixou de ser o clique padrão mesmo em `.py`/`.sh`.** É mudança de comportamento consciente: clicar num script para lê-lo não deve executá-lo sem aviso, e o botão de rodar continua a um hover de distância.

SOBRE O PASTE, que veio no mesmo relato: não era defeito. Os dois arquivos foram gravados (12:15:20 e 12:17:08), um por `Ctrl+V`, e o caminho foi digitado na entrada — foi assim que as imagens chegaram para leitura. A expectativa era ver `[Image #1]` como no Claude Code fora do app, e isso não é alcançável aqui: no xterm o `Ctrl+V` é consumido pelo navegador como evento de paste e nunca chega ao processo da CLI como tecla, então a CLI não tem como ler o clipboard sozinha. O caminho de arquivo é o que dá para entregar, e o agente lê a imagem por ele.

TESTE: `editor-command.test.cjs`, 10 casos com dublê de PATH — precedência `VISUAL`>`EDITOR`, opção junto do comando, caminho entre aspas, candidato ausente sendo pulado, ordem de preferência, Windows, nenhum editor disponível e variável vazia. `project-file-action.test.ts`, 11 casos — texto vai para o editor, binário não, arquivo sem extensão e oculto tratados como texto, rodar oferecido só onde cabe, caixa da extensão ignorada e pasta não decidindo pelo arquivo.

VALIDAÇÃO: `npm run build`, `npm test` (544/544), `npx vitest run` (392/392) e `npm run lint` limpos. No app rodando, pela skill `rodar-app`: `resolveEditor` devolveu `nano` (a máquina não tem `$EDITOR`); as ações por arquivo saíram certas — `README.md` e `dados.json` com editor + canvas e **sem** botão de rodar, `script.py` com os três; clicar no `README.md` abriu `GNU nano 7.2 README.md` num terminal do canvas com o conteúdo na tela; e digitar + `Ctrl+O` + Enter gravou no arquivo em disco.

RISCO RESIDUAL: se `$EDITOR` apontar para um editor gráfico (`code`, `gedit`), o clique abre esse programa fora do terminal — é a configuração da pessoa sendo respeitada, mas não é "editar no terminal". Um editor que não existe e está configurado em `$EDITOR` volta a dar "comando não encontrado", porque configuração explícita não passa pelo PATH de propósito. A lista de extensões binárias é finita: um formato binário fora dela abriria no editor mostrando lixo — sem risco de corromper, já que sair sem salvar não grava nada.

Estado final: concluído e validado no app rodando.

## Registro de Trabalho — 2026-08-12 (parte 7) — Ctrl+V não colava imagem; só Ctrl+Shift+V (Colar imagnes é dificil no terminal)

CORREÇÃO DE ROTA: a parte 1 deu a feature de colar imagem como validada no app rodando. Estava errado, e o Felipe apontou: o que funcionava era `Ctrl+Shift+V`; o `Ctrl+V` não colava nada. A validação de lá disparava um `ClipboardEvent` **sintético** no elemento do xterm — isso prova que o tratamento do evento funciona, e não que o atalho do teclado produz esse evento. A tecla real nunca passou pelo teste.

CAUSA, reproduzida com tecla de verdade (`xdotool` sobre o Xvfb, não `page.keyboard`):

- `Ctrl+V` com imagem na área de transferência: **nenhum evento `paste`** chega à página (log de eventos vazio) e nada acontece.
- `Ctrl+Shift+V` com a mesma imagem: o evento chega — com `items: 0` e texto vazio, ou seja, quem salva é o fallback nativo.
- O `keydown` do `Ctrl+V`, esse, **chega** na página e no textarea do xterm.

O app não define menu próprio, então herda o menu padrão do Electron, cujo Editar tem `role: 'paste'` com acelerador `Ctrl+V`. A tecla aciona `webContents.paste()`, e o comando de colar do Chromium num `<textarea>` só sabe inserir texto: com a área de transferência contendo apenas imagem não há nada a inserir, o comando vira no-op e **nenhum evento `paste` é disparado**. `Ctrl+Shift+V` não tem acelerador de menu, segue o caminho nativo do navegador e gera o evento.

Conferido de propósito antes de mexer: `Ctrl+V` com **texto** continua colando normalmente (o `webContents.paste()` insere direto no textarea), então não havia regressão a consertar ali.

FEITO: o atalho passa a ser tratado onde ele comprovadamente chega — no `attachCustomKeyEventHandler` do xterm.

- `isImagePasteShortcut` (`terminal-image-paste.ts`): reconhece `Ctrl+V` e `Cmd+V`, e **ignora `Ctrl+Shift+V`** de propósito — esse já gera evento de verdade, e tratar os dois colaria a mesma imagem duas vezes.
- `pasteClipboardImageFromOs` no store: lê a imagem pela área de transferência do sistema e digita o caminho. O handler de tecla devolve `true` (não consome), para que, havendo texto, o caminho normal de colar continue valendo — a leitura de imagem simplesmente não acha nada.
- `claimImagePaste` + `lastImagePasteAt`: janela de 500 ms que impede o evento e a tecla de atenderem o mesmo Ctrl+V. Em Linux só um dos dois dispara, mas o comportamento do menu padrão varia por plataforma e um duplo salvamento seria silencioso.

DE PASSAGEM, a skill `rodar-app` foi cúmplice do erro e ganhou o que faltava: comando `realkey`, que manda tecla de verdade pelo X (`xdotool`), e um item nos "detalhes que custaram tempo" avisando que `press`/`paste` entram pelo CDP e **não** acionam acelerador de menu nem caminho nativo. Também ficou registrado que `xdotool windowfocus` tira o foco do elemento — foi o que fez o primeiro teste do fix parecer falho quando já estava certo.

TESTE: `isImagePasteShortcut` ganhou 5 casos em `terminal-image-paste.test.ts` — Ctrl+V, Cmd+V, Ctrl+Shift+V recusado, combinações que não são colar, e tipo de evento diferente de `keydown`.

VALIDAÇÃO: `npm run build`, `npm test` (544/544), `npx vitest run` (397/397) e `npm run lint` limpos. E, desta vez, **com tecla de verdade no app rodando**: `Ctrl+V` com imagem passou a salvar o arquivo e digitar o caminho; `Ctrl+V` com texto colou o texto sem criar arquivo nenhum; `Ctrl+Shift+V` com imagem continuou funcionando e salvou **um** arquivo, não dois. O `realkey` da skill foi exercitado no fluxo completo.

RISCO RESIDUAL: `Ctrl+Shift+V` com texto não foi testado. O comportamento do menu padrão do Electron pode diferir em Windows e macOS — lá o `Ctrl/Cmd+V` pode gerar evento e tecla ao mesmo tempo, e é para isso que existe a janela de 500 ms, que não foi exercitada nessas plataformas. A leitura continua sendo do sistema operacional, então uma área de transferência com texto e imagem juntos segue colando o texto.

Estado final: concluído e validado no app rodando, com tecla real.

## Registro de Trabalho — 2026-08-12 (parte 8) — o fix de release da parte 5 quebrou o deploy (Colar imagnes é dificil no terminal)

SINTOMA: o Felipe subiu e a atualização não chegou no app.

O QUE ACONTECEU: a v0.1.15 saiu como **três releases separadas com a mesma tag**, e a que ficou pública tinha só os artefatos de macOS. O `/releases/latest` — que é o que o app consulta — devolvia uma release sem `latest-linux.yml`, então no Linux não havia atualização nenhuma a encontrar. Linux e Windows ficaram presos em rascunhos invisíveis.

CAUSA, confirmada lendo `electron-publish/out/gitHubPublisher.js` e não por hipótese. O próprio comentário do arquivo diz: *"we don't use 'Get a release by tag name' because 'tag name' means existing git tag, but we draft release and don't create git tag"*. Rascunho **não cria tag**. Sem tag, o GitHub aceita várias releases com o mesmo `tag_name`, então:

- `getOrCreateRelease` lista as releases, não acha nenhuma com a tag (os três jobs correm juntos) e cada um chama `createRelease`;
- criar a segunda release não devolve `422 already_exists`, porque não há tag para colidir;
- resultado: três releases, cada uma com o que aquele job subiu.

Era justamente esse 422 — tratado por `doesErrorMeanAlreadyExists` — que fazia os três jobs convergirem na mesma release enquanto o tipo era `release`. A parte 5 removeu esse mecanismo sem perceber que ele existia.

FEITO: `releaseType` passou de `draft` para **`prerelease`**.

- Pré-lançamento **cria a tag**, então o 422 volta e os três jobs voltam a convergir na mesma release — é exatamente o mesmo caminho de código que funcionava antes.
- `/releases/latest` do GitHub ignora pré-lançamento tanto quanto rascunho, e o app tem `allowPrerelease = false` por padrão. A propriedade que a parte 5 queria (release invisível enquanto incompleta) continua valendo.
- `finalize` agora faz `gh release edit --prerelease=false --latest`.
- E ganhou uma guarda contra o defeito que acabou de acontecer: se existir **mais de uma** release com a tag, o job falha em vez de publicar uma delas. Publicar pela metade é pior do que não publicar.

SOBRE A v0.1.15: fica como está. Assim que a próxima release sair, ela vira a `latest` e a v0.1.15 quebrada deixa de ser alcançável — apagar release publicada é destrutivo e não é necessário para destravar. Os dois rascunhos órfãos são invisíveis; limpá-los é opcional.

VALIDAÇÃO: YAML validado, shell dos passos conferido com `bash -n`, `allowPrerelease` conferido no `auto-updater.cjs`. O mecanismo do 422 está **verificado no código do electron-publish**, e é o mesmo caminho que a v0.1.14 usou com sucesso — ou seja, a falha específica da v0.1.15 não pode se repetir. O que segue sem execução real é o passo final `--prerelease=false --latest`.

RISCO RESIDUAL: quem rodar com `FELIXO_UPDATE_PRERELEASE=1` passa a enxergar a release enquanto ela ainda está incompleta — é o preço de usar pré-lançamento como estado intermediário. Se o `finalize` falhar, a release fica como pré-lançamento e ninguém a recebe: modo de falha seguro, mas o deploy não sai e é preciso rodar `gh release edit vX.Y.Z --prerelease=false --latest` à mão.

LIÇÃO: a parte 5 mudou um comportamento de publicação sem ler como o publicador decide criar ou reaproveitar uma release. O sintoma original — uma janela de ~1 min mostrando "Falha ao atualizar" — era cosmético e se resolvia sozinho; o conserto quebrou o deploy inteiro. Ler o `getOrCreateRelease` levou dez minutos e teria evitado tudo.

VALIDADO NA v0.1.16, execução real: os três jobs convergiram numa **única** release (contra três na v0.1.15), o `finalize` rodou `--prerelease=false --latest` e a release terminou com os 13 artefatos — Linux, macOS, Windows e os quatro manifestos. Conferido que o 404 não pode mais acontecer: `latest-linux.yml` foi baixado e os dois arquivos que ele referencia responderam HTTP 206. O caminho pré-lançamento→definitiva, que era a pendência explícita, está exercitado.

Estado final: concluído e validado numa release real.

## Registro de Trabalho — 2026-08-12 (parte 9) — o erro de atualização era um beco sem saída (Colar imagnes é dificil no terminal)

MOTIVO: enquanto a v0.1.16 subia, o app do Felipe mostrou "Falha ao atualizar" e o indicador **ficou preso**. Os horários explicam: o erro foi registrado às 16:03:15 e o `finalize` promoveu a release às 16:05:59 — ou seja, o erro antecedeu o conserto em 2m44s. Só que o app guarda o último status e a verificação automática só volta a cada dez minutos (`CHECK_INTERVAL_MS`), então um erro que já não valia mais ocupou a tela por todo esse tempo.

O AGRAVANTE: não havia como tentar de novo. A ponte `updates.check()` existe no preload e no processo principal desde sempre, mas **nenhum componente a chamava** — conferido com busca em todo o `app/src`: a interface só usava `install`. Restavam esperar dez minutos ou reiniciar o app.

FEITO:

- `canRetry` na `UpdatePresentation`, verdadeiro **só** no estado de erro. A decisão de quando oferecer nova tentativa fica onde já moram as outras decisões de apresentação, e não espalhada no componente.
- `check()` no `useUpdateStatus`, chamando `updates.check()`. Não faz nada com o retorno de propósito: o processo principal já emite o novo status por IPC (inclusive o `checking`), então a interface reage ao fluxo como no resto do ciclo.
- `UpdateIndicator` passou a escolher a ação em vez de olhar só `canInstall`: instalar quando há o que instalar, verificar de novo quando falhou, e continuar sendo um rótulo (não botão) quando não há ação — a regra que já existia ali e que vale manter, porque botão que não faz nada é pior que texto honesto. O `title` no erro mantém a mensagem técnica e acrescenta o convite; a mensagem é o que diz o que houve, a tentativa entra ao lado, não no lugar.

TESTE: três casos novos em `update-presentation.test.ts` — o erro oferece nova tentativa, nenhum outro estado oferece (incluindo `null`), e instalar e tentar de novo nunca aparecem juntos, já que o indicador é um botão só e duas ações concorrendo tornariam o clique imprevisível.

VALIDAÇÃO: `npm run build`, `npx vitest run` (400/400) e `npm run lint` limpos. No app rodando: como a build de desenvolvimento não é empacotada, o updater fica desligado e o indicador não aparece sozinho — então o status de erro foi injetado pelo IPC (`webContents.send('updates:status', …)`), que é exatamente o que o processo principal faz. O indicador virou `BUTTON` com o `title` `"Cannot find latest-linux.yml in the latest release artifacts\n\nClique para verificar de novo."`, e clicar nele disparou a verificação de verdade — o indicador saiu do estado de erro, o que só acontece se a chamada chegou ao processo principal.

RISCO RESIDUAL: se a verificação falhar de novo, o indicador volta ao erro — correto, mas sem qualquer espera entre tentativas: clicar repetidamente dispara uma verificação por clique. Como é ação humana e a chamada é barata, não vale um limitador agora. O intervalo automático de dez minutos continua o mesmo; o que mudou é existir uma saída manual.

Estado final: concluído e validado no app rodando.

## Registro de Trabalho — 2026-08-12 (parte 10) — o Codex demorava 60s para receber o prompt (Bug: Codex demora muito pra receber os prompts)

MOTIVO: abrir um agente Codex e ver o contexto chegar na entrada só depois de quase um minuto. Três commits anteriores atacaram o relógio (`CODEX_INITIAL_TEXT_DELAY_MS`, o silêncio de 500 ms, o polling) e nenhum resolveu, porque o atraso nunca esteve num intervalo configurado.

A CAUSA: `hasCodexInteractivePrompt` exigia uma linha com **só** o marcador (`/^\s*›\s*$/`) para declarar o composer pronto. O Codex 0.147 nunca desenha essa linha: o composer vazio traz uma sugestão apagada sorteada de uma lista embutida na CLI — `› Summarize recent commits`, `› Explain this codebase`, `› Write tests for @filename`, … Confirmado lendo os literais do binário e capturando a tela real num PTY (o script respondia às consultas de terminal — `CSI 6n`, DA1, OSC 10/11 — que o Codex faz antes de pintar qualquer coisa; sem resposta ele não pinta e a captura sai vazia).

Ou seja: `ready` era **sempre falso**. O texto só saía quando estourava `INITIAL_TEXT_INPUT_WAIT_MS`, a espera de emergência de 60 s. Os ajustes de intervalo anteriores não podiam funcionar — eles encurtavam o caminho que nunca era tomado.

FEITO:

- `hasCodexInteractivePrompt` passou a perguntar o que o nome dela diz: **o composer está de pé?**. Vira o espelho exato de `hasClaudeInteractivePrompt` — qualquer linha com o marcador que não seja item de menu numerado. Item de menu fica de fora porque a tela de confiança na pasta usa o mesmo `›` (`› 1. Yes, continue`) e é decisão, não entrada.
- `hasEmptyCodexInput` nasceu para a outra pergunta (a entrada está vazia?), e `hasCodexInputLine` saiu: com a exclusão de menu, "visível" e "pronto" respondem à mesma coisa, como no Claude.

LIMITE ASSUMIDO: com a sugestão na tela não dá para separar, só pelo texto renderizado, a dica da CLI do que alguém digitou. `empty` responde "não está vazio", então a reconferência de entrega não reescreve o composer do Codex. É de propósito: escrever por cima de texto que pode ser do usuário é pior do que não reescrever, e a entrega agora acontece no momento certo, que era o que faltava.

TESTE: sete casos novos — o composer com a sugestão da CLI, o composer com texto, a tela de confiança (que não pode ser lida como entrada) e o store escrevendo o contexto na tela real do Codex. Os antigos que fixavam "só o composer vazio é pronto" foram substituídos, porque descreviam a tela errada.

VALIDAÇÃO no app rodando, A/B com a mesma build e userData limpo: **sem o fix, o contexto apareceu na entrada aos 63 s; com o fix, aos 3 s** — abaixo do primeiro instante em que dá para medir. `npm run build`, `npx vitest run` (406/406) e `npm run lint` limpos.

Estado final: concluído e validado no app rodando, com medição antes e depois.

## Registro de Trabalho — 2026-08-12 (parte 11) — um Ctrl+V colava duas imagens no Codex (Bug: Codex demora muito pra receber os prompts)

RELATO: depois do conserto do Ctrl+V (parte 7), colar uma imagem num agente **Codex** anexava a imagem duas vezes — `[Image #1][Image #2]` por um único Ctrl+V. Só no Codex.

A CAUSA: a tecla era atendida **duas vezes**, por dois programas diferentes. O tratador de teclas devolvia `true` depois de disparar a leitura da área de transferência, então o xterm seguia o caminho normal e mandava o `^V` (0x16) para o PTY — `evaluateKeyboardEvent` mapeia Ctrl+letra para o caractere de controle, conferido no `xterm.js`. O Codex lê a área de transferência por conta própria, com biblioteca nativa e sem depender de `xclip` (o binário traz `no image on clipboard`), então ele anexava a imagem ao receber o `^V`, e nós anexávamos de novo ao digitar o caminho do arquivo salvo. O Claude Code não faz essa leitura, e por isso o defeito só aparecia no Codex.

A PROVA que separou as duas rotas: `Ctrl+Shift+V` sempre colou **uma** imagem só. Ele não tem acelerador de menu, não vira `^V` no PTY e portanto nunca chega à CLI — a única diferença entre os dois atalhos era exatamente a tecla vazando para o Codex. O contador de arquivos confirmou o resto: um Ctrl+V salvava **um** arquivo em `clipboard-attachments` e produzia **duas** anexações na tela, ou seja, a segunda imagem não vinha de uma segunda gravação nossa.

FEITO: o tratador devolve `false` para o atalho de colar, e o xterm deixa de repassar o `^V`. Colar texto não depende dessa tecla — quem cola é o evento `paste`, que continua nascendo normalmente — então a mudança atinge só o que precisava mudar: a CLI para de ver um atalho que o app já atendeu.

VALIDAÇÃO no app rodando, com Codex de verdade e dados isolados, medindo tela e arquivos gravados a cada passo:

| ação | antes | depois |
| --- | --- | --- |
| Ctrl+V com imagem | `[Image #1][Image #2]`, 1 arquivo | `[Image #1]`, 1 arquivo |
| Ctrl+Shift+V com imagem | 1 imagem, 1 arquivo | 1 imagem, 1 arquivo |
| Ctrl+V com texto | texto colado | texto colado, nenhum arquivo |
| Ctrl+C | interrompe | interrompe (compositor limpo) |

`npm run build`, `npx vitest run` (406/406) e `npm run lint` limpos.

RISCO RESIDUAL: **este caminho não tem teste automatizado.** A suíte roda em ambiente `node`, sem DOM, e o `keydown` do xterm exige elemento montado — um teste de verdade aqui pediria `jsdom` no projeto, dependência que a suíte inteira não usa hoje. Ficou coberto por conferência no app rodando e pelos testes de `isImagePasteShortcut`, que é o predicado usado tanto para atender quanto para suprimir. O `^V` deixa de chegar a qualquer CLI e a qualquer shell: em shell isso significa perder o *quoted-insert* do readline, consequência aceita de o app ser dono do Ctrl+V no terminal.

Estado final: concluído e validado no app rodando.

## Registro de Trabalho — 2026-08-12 (parte 12) — badge de versão instalada no canvas (Feature: preciso de um lugar que eu possa ver a versão atual do programa)

MOTIVO: o usuário não tinha como saber qual versão do Felixo AI Core estava rodando. O `app/package.json` fica travado em `0.1.0` de propósito — o número real (ex.: `0.1.23`) só é atribuído pelo workflow de release, no empacotamento — então mostrar o valor do `package.json` na interface exibiria sempre o mesmo número errado; era preciso o valor real do binário empacotado, em runtime.

FEITO:

- `app:get-version`, um handler IPC no processo principal que devolve `app.getVersion()` (a API do Electron que lê a versão do pacote empacotado, não a do repositório).
- `window.felixo.getVersion()` no `preload.cjs`, expondo o handler ao renderer pelo mesmo padrão já usado por `updates.getStatus()`.
- `useAppVersion`, hook que busca essa versão ao montar; fica `null` fora do Electron (navegador, testes), e quem exibe decide o que fazer com isso.
- `AppVersionBadge`, componente que mostra `vX.Y.Z` discreto na barra do canvas, ao lado do indicador de atualização — some sozinho enquanto a versão não chega, em vez de mostrar um espaço vazio.

VALIDAÇÃO: `npm run build` (`tsc -b && vite build`), `npm run lint` e `npx vitest run src/features/updates` (19/19) limpos.

RISCO RESIDUAL: nenhum teste automatizado cobre o hook/handler novos — são poucas linhas que só encaminham um valor do Electron, sem lógica própria a testar; a badge foi conferida lendo o resultado do build. Fora do Electron empacotado (build de desenvolvimento, navegador) a badge não aparece, porque não há `window.felixo` nem versão real para mostrar.

Estado final: concluído e validado (build + lint + testes).

## Registro de Trabalho — 2026-08-12 (parte 13) — preview renderizado a partir do terminal (Feature: botão de visualização renderizada no topbar do terminal)

MOTIVO: quem edita um `.md` num terminal com `nano`/`vim` não tem como conferir título, código destacado e imagem sem sair do app e olhar o arquivo publicado. O bloco "arquivo" do canvas já resolve isso — toggle 👁/✏️ que renderiza markdown com `MarkdownContent` (remark-gfm + highlight.js + `<img>`) — mas só existe pra quem abriu o arquivo por ali; quem trabalha dentro do terminal não tinha ponte nenhuma até esse bloco.

O LIMITE ASSUMIDO DE PROPÓSITO: o terminal é um pty de texto puro (xterm.js) — não renderiza HTML nem imagem, por natureza da tecnologia, não por lacuna a fechar. Em vez de simular renderização dentro do grid de caracteres, o botão novo detecta qual arquivo está aberto e abre o bloco "arquivo" de verdade ao lado, reaproveitando a renderização que já existia.

FEITO:

- `findLastEditedFile` (`terminal-open-file.ts`): lê o scrollback do terminal (`store.getTranscript`) e acha o último `nano`/`vim`/`vi <arquivo>` digitado, resolvendo caminho relativo pelo `cwd` da sessão e ignorando flags (`-R`, `-c`, …) como se fossem o caminho.
- Botão 👁 no topbar do `TerminalDrawer`, ao lado de "Reiniciar terminal": aciona `findLastEditedFile` sobre o transcript atual e chama `onOpenFilePreview`. Sem arquivo detectado, mostra aviso inline (mesmo padrão visual do erro de handoff), em vez de abrir um bloco vazio.
- `CanvasView` liga `onOpenFilePreview` a `openTextFileNode` — a mesma função que o painel Projetos usa para abrir um arquivo existente, então o bloco criado é idêntico ao que já existia (preview aberto por padrão, sem editar nada).

TESTE: `terminal-open-file.test.ts`, 6 casos — caminho relativo resolvido pelo cwd, caminho absoluto, aspas em nome com espaço, múltiplos comandos (usa o mais recente), flag tratada como não-caminho, e nenhum editor rodado no terminal.

VALIDAÇÃO: `npx tsc -b`, `npx eslint` nos arquivos tocados e `npx vitest run` (95/95 em `features/canvas/components`, incluindo os 6 novos) limpos.

RISCO RESIDUAL: a detecção lê texto do scrollback — se o histórico rolar além do buffer do xterm antes de clicar no botão, ou se o comando usar um alias/wrapper em vez de `nano`/`vim`/`vi` diretamente, nada é encontrado e o aviso aparece (falha visível, não falha silenciosa). Build empacotado (`/opt/Felixo AI Core`) ainda não tem essa mudança — só entra depois de `npm run build`/reinstalação.

Estado final: concluído e validado (typecheck + lint + testes). Pendente apenas rebuild do binário instalado para o usuário ver o botão em uso.

BUG ENCONTRADO NO USO REAL (commit `e751549`, mesmo dia): o primeiro clique no botão abriu um bloco "arquivo" chamado `7.2`, "Arquivo não encontrado". O regex original (`/(?:^|[;&|]|\s)(?:nano|vim?)\s+(.+)$/`) só exigia *um espaço* antes de `nano`/`vim`, não que o editor estivesse no início do comando — então o próprio banner que o nano imprime na tela (`GNU nano 7.2`) também batia, e `7.2` virava "o arquivo". Corrigido ancorando o editor no início de um comando: a linha é primeiro fatiada nos separadores de encadeamento (`;`, `&&`, `|`), cada pedaço tem o prefixo de prompt (`$`, `#`, `>`, `%`) removido, e só então testado com `^(?:nano|vim?)\s+`. Dois testes de regressão cobrem o banner do nano e um comando encadeado (`cd x && nano y`). `tsc -b` + `eslint` + `vitest` (97/97) limpos.

SEGUNDO BUG NO USO REAL, mesmo dia: depois do conserto acima, o botão passou a errar do outro lado — "Não achei nenhum arquivo aberto com nano/vim neste terminal", mesmo com o nano visivelmente aberto na tela. CAUSA: `getShellHistory`/detecção usava `store.getTranscript`, que lê `terminal.buffer.active`. Enquanto um app de tela cheia (nano, vim, less, htop…) está rodando, o xterm troca pro *alternate screen buffer* — `buffer.active` passa a apontar pra ele, que só contém a tela atual do app, sem o histórico do shell. O comando `$ nano ola-mundo.md` que abriu o editor continua vivo no **buffer normal**, que fica por baixo, só deixa de ser o ativo. Ou seja: o botão só teria funcionado depois de fechar o editor — o oposto do caso de uso principal (ver o preview *enquanto* edita).

CORREÇÃO: `readShellHistory` (`terminal-buffer-reader.ts`) lê `terminal.buffer.normal` explicitamente, nunca `.active`; `getShellHistory` no `TerminalSessionStore` expõe isso; `TerminalDrawer` passou a chamar `store.getShellHistory` em vez de `store.getTranscript` no botão de preview. `readBuffer`/`getTranscript` continuam intocados — servem a outros usos (handoff de responsabilidade, cópia) que devem mesmo mostrar a tela atual, alternate ou não. Dois testes novos em `terminal-buffer-reader.test.ts` simulam `buffer.normal` divergindo do `buffer.active` (o caso exato do nano aberto) e confirmam que cada leitor lê o buffer certo. `tsc -b` + `eslint` + `vitest` (368/368 em `features/canvas`) limpos.

TERCEIRO BUG NO USO REAL, mesmo dia: mesmo após o conserto acima, o botão continuou dizendo "Não achei nenhum arquivo aberto com nano/vim". CAUSA REAL, confirmada contra o dado persistido de verdade (`~/.config/felixo-ai-core/database/felixo.sqlite`, tabela `canvas_nodes`, não suposição): o bloco criado por "editar no terminal" no painel Projetos nasce com `command:"nano"`, `args:["ola-mundo.md"]`; o processo principal (`createPtyLaunchSpec`) empacota isso como `bash -i -c "nano ola-mundo.md; exec bash -i"`. Um comando passado via `bash -c` **nunca é ecoado na tela** — nem no buffer normal, nem no alternate. As duas correções anteriores (ancorar o regex, trocar de buffer) atacavam sintomas reais, mas nenhuma delas podia funcionar pra esse caso, porque não havia texto nenhum pra ler: o comando não passa pelo terminal como entrada de usuário, é argv direto pro PTY.

CORREÇÃO: `findLaunchedEditorFile` lê a **opção de lançamento do bloco** (`command`/`args`/`cwd`, já disponíveis em `restartOptions` no `TerminalDrawer` — dado que o app registrou ao criar o bloco, não inferência sobre texto). `resolveOpenEditorFile` tenta essa fonte primeiro e cai para `findLastEditedFile` (histórico do shell) só quando o bloco não foi lançado como editor — cobrindo quem digitou `nano arquivo.md` à mão num terminal comum. `TerminalDrawer` passou a chamar essa função combinada em vez de só o histórico. 7 testes novos, incluindo um com os valores exatos do bloco real do canvas do usuário (`command`, `args`, `cwd` lidos do sqlite). `tsc -b` + `eslint` + `vitest` (375/375) limpos.

LIÇÃO: as duas primeiras tentativas foram validadas só por teste unitário + leitura de código, sem checar contra o dado real que o app persiste — e erraram a causa raiz duas vezes seguidas por isso. Esta terceira foi verificada primeiro contra `canvas_nodes` de verdade antes de escrever qualquer correção.

## Registro de Trabalho — 2026-08-12 (parte 14) — imagem relativa no preview renderizado (Feature: o preview do bloco arquivo também mostra imagem?)

MOTIVO: confirmado que `MarkdownContent` já renderiza `<img>`, mas o `src` ia direto do Markdown pro DOM sem nenhuma resolução — funciona para URL absoluta (`https://…`), mas o blog documenta imagem de post como caminho **relativo** (`./foto.png`, pasta `src/content/posts/<slug>/` ao lado do `.md`, ver README do felixo-blog). Nesse formato o preview cairia sempre no fallback "Imagem indisponível", porque `./foto.png` resolve relativo à origem da própria página do app, não à pasta do arquivo no disco.

FEITO:

- `resolveMarkdownImageSrc(src, baseDir)` (`markdown-image-src.ts`): URL com esquema (`http:`, `data:`, …) passa direto; caminho absoluto (POSIX ou Windows, com letra de unidade) vira `file://` direto; caminho relativo é resolvido contra `baseDir` (join + normalização de `.`/`..`) e também vira `file://`, com cada segmento escapado (espaço, acento) via `encodeURIComponent`. Sem `baseDir`, comportamento idêntico a antes — caminho relativo passa como veio.
- `dirnameOf(absolutePath)`: pasta de um caminho de arquivo, pra virar o `baseDir`.
- `MarkdownContent` ganhou prop opcional `baseDir`; `createMarkdownComponents(baseDir)` — fábrica, não mais objeto fixo — fecha `baseDir` por closure no `img` e no `pre` (que pode renderizar outro `MarkdownContent` aninhado quando recupera markdown engolido por um code fence; sem repassar `baseDir` explicitamente ali, o aninhado nasceria sem saber a pasta). Primeira versão usava React Context; trocado por closure porque `pre` não é um componente com nome maiúsculo aos olhos do `eslint-plugin-react-hooks`, e chamar `useContext` nele quebrava a regra dos hooks.
- `FileNode` passa `baseDir={dirnameOf(absolutePath)}` pro `MarkdownContent` — o preview de qualquer arquivo aberto no canvas (não só do painel Projetos) ganha resolução de imagem relativa de graça.

TESTE: 10 casos em `markdown-image-src.test.ts` — URL/data URI intocada, caminho relativo (com e sem `./`), subida de diretório (`..`), sem `baseDir` (comportamento antigo preservado), caminho absoluto POSIX e Windows (letra de unidade preservada), escape de espaço/acento, `undefined`/vazio sem quebrar, e `dirnameOf` com e sem caminho. `tsc -b`, `eslint` e `vitest` (385/385) limpos.

ERRO NO CAMINHO, CORRIGIDO ANTES DO COMMIT: rodei `npx prettier --write` sem notar que este repositório não tem `.prettierrc` — caiu no padrão do prettier (aspas duplas, `;`), destoando do resto do código (aspas simples, sem `;`, confirmado lendo arquivo vizinho intocado). Refeito com `--single-quote --no-semi --print-width 90` explícitos antes de qualquer commit.

RISCO RESIDUAL: `<img src="file://…">` só carrega no **build empacotado** (a janela principal usa `loadFile`, origem `file://` — imagem local de mesma origem carrega sem CORS). Em modo dev (`npm run dev`, Vite em `http://localhost`), o Chromium bloqueia carregar `file://` a partir de uma origem `http`, então imagem relativa continuaria caindo no fallback ali — limitação conhecida do Electron, não deste código, e não afeta o uso real (app instalado). Não testado no app rodando (nenhum post do usuário tem imagem ainda para conferir visualmente); a cobertura ficou nas funções puras que decidem a URL.

Estado final: concluído e validado por teste automatizado; validação visual no app pendente até existir um post com imagem relativa para abrir no preview.

## Registro de Trabalho — 2026-08-12 (parte 15) — agente pergunta em texto corrido em vez da ferramenta interativa (Feedback: agente sempre manda pergunta no chat em vez de usar o questionário)

RELATO: agentes rodando num terminal do canvas às vezes escrevem uma pergunta de múltipla escolha como texto corrido no chat ("Questionário (responda uma a uma)...") em vez de usar a ferramenta interativa de pergunta que a própria CLI oferece (ex.: `AskUserQuestion` no Claude Code) — que dá botão/campo de verdade pra responder, não um parágrafo pra escrever a resposta na mão.

CAUSA: a instrução permanente que todo terminal-com-agente recebe (`DEFAULT_QUALITY_STANDARD_PROMPT`, digitada e submetida em todo terminal aberto com Claude/Gemini/Codex) nunca mencionava a ferramenta de pergunta interativa — só padrão de qualidade de código/commit/doc. Sem essa instrução, a CLI decide por conta própria como perguntar, e nem sempre escolhe a ferramenta interativa.

FEITO: acrescentado um parágrafo ao `DEFAULT_QUALITY_STANDARD_PROMPT` pedindo que, ao precisar perguntar algo ao usuário, o agente use a ferramenta interativa de pergunta da própria CLI (se existir) em vez de escrever a pergunta como texto corrido.

VALIDAÇÃO: `tsc -b`, `eslint` e `vitest` (375/375 em `features/canvas`, 16/16 no arquivo tocado) limpos — os testes cobrem comportamento de composição do prompt, não o texto literal, então a frase nova não quebrou nada.

LIMITE ASSUMIDO: isto só muda o prompt **padrão** do código (`DEFAULT_QUALITY_STANDARD_PROMPT`). Quem já salvou um prompt customizado nas Configurações (`window.felixo.canvas.setQualityStandard`) não recebe a frase nova automaticamente — precisa clicar "Padrão" e "Salvar" de novo, ou editar manualmente. Conferido no banco do usuário (`settings` no sqlite) que ele **não** tem prompt customizado salvo hoje, então a mudança já vale para os próximos terminais dele sem ação nenhuma. Também não propaga pra fora do app: um `CLAUDE.md`/`AGENTS.md` estático de outro repositório (ex.: `felixo-blog`) que copiou este texto manualmente em algum momento não é atualizado por esta mudança.

Estado final: concluído e validado por typecheck/lint/teste; efeito no app precisa de um terminal novo pra ser observado (terminal já aberto não relê a instrução).

## Registro de Trabalho — 2026-08-13 (parte 16) — lista de projetos fora de ordem e som de notificação mudo (Feedback: dois relatos do usuário)

### Lista de projetos fora de ordem alfabética

RELATO: o dropdown "Projeto" (usado ao configurar um agente/terminal) mostrava as pastas na ordem em que foram registradas, não em ordem alfabética — difícil de achar um projeto numa lista de dezenas.

CAUSA: `useCanvasProjects` (hook que carrega e recarrega a lista) repassava direto o array que vinha do backend, sem ordenar.

CORREÇÃO: `sortByName` (`useCanvasProjects.ts`), comparação por `localeCompare('pt-BR', { sensitivity: 'base' })` — alfabética e sem diferenciar maiúsculas/minúsculas —, aplicada tanto na carga inicial quanto em todo `reloadProjects` (adicionar/remover pasta). Função exportada e pura, sem mutar o array de entrada.

TESTE: 3 casos novos em `useCanvasProjects.test.ts` — ordem alfabética a partir de ordem de chegada arbitrária, case-insensitive, e não-mutação do array recebido.

VALIDAÇÃO: `tsc -b`, `eslint` e `vitest` (378/378 em `features/canvas`) limpos.

### Som de notificação não tocava

RELATO: o app deveria tocar um som quando um agente termina o turno ou pede aprovação, mas nada tocava.

CAUSA: `CanvasView` criava o elemento de áudio com caminho absoluto (`new Audio('/sounds/notification.mp3')`). Isso funciona em dev (Vite serve a partir da raiz do próprio servidor), mas quebra no app empacotado: a janela principal carrega o renderer via `loadFile` (protocolo `file://`), onde um caminho começando com `/` resolve para a raiz do disco, não para a pasta do app — exatamente o problema que `base: './'` em `vite.config.ts` já existe para evitar nos demais assets, mas que passou batido neste `new Audio(...)`, por não ser processado pelo pipeline de assets do Vite. O `.catch()` do `audio.play()` engolia o erro de carregamento silenciosamente, então não havia nem log indicando a falha.

CORREÇÃO: caminho relativo (`./sounds/notification.mp3`), que resolve corretamente nos dois casos — dev (relativo à raiz do servidor) e produção (relativo ao `dist/index.html`, mesma pasta de `dist/sounds/`).

VALIDAÇÃO: `tsc -b`, `eslint` e `vitest` (378/378 em `features/canvas`) limpos; `npm run build` confirma `dist/sounds/notification.mp3` no mesmo diretório de `dist/index.html`. Não testado ouvindo o som no app empacotado de verdade (exigiria rodar o instalador) — a validação ficou na correção do caminho, cuja causa raiz é a mesma documentada e já resolvida para os outros assets do projeto.

RISCO RESIDUAL: build empacotado (`/opt/Felixo AI Core`) ainda não tem essa correção — só entra depois de rebuild/reinstalação, como já registrado noutras entregas deste arquivo.

Estado final: concluído e validado por typecheck/lint/teste; verificação sonora real no app empacotado fica pendente até o próximo rebuild/reinstalação do usuário.

## Registro de Trabalho — 2026-08-13 (parte 17) — Fetch All como ferramenta nativa do canvas (Feature: implementar o Fetch-All dentro do Felixo AI Core)

PEDIDO: trazer o projeto Fetch All (sincronizador de todos os repositórios Git da máquina, escrito em Python) para dentro do Felixo AI Core como ferramenta nativa, com escopo completo — varredura, pull/push, commit automático, cache, relatório — mais a possibilidade de ignorar uma pasta.

DECISÃO: **porte para Node**, não ponte para o Python. A alternativa era empacotar o `fetchall/` original e chamá-lo por subprocesso com um modo `--json`, mas isso exigiria Python 3.10+ e um `.venv` provisionado na máquina de quem usa o app instalado, vendorizar um segundo repositório no build do Electron e manter mudanças coordenadas em dois repositórios. O porte deixa a ferramenta com as mesmas dependências do resto do app (nenhuma) e no mesmo padrão dos outros serviços do processo principal (`git-service.cjs`). Custo assumido: a lógica passa a existir em dois lugares, e correções no Fetch All original não chegam aqui sozinhas.

ARQUITETURA: domínio isolado em `electron/services/fetch-all/` — `repo-scanner` (descoberta nos discos, poda de montagens virtuais/de rede, exclusões e caminhos ignorados), `repo-analyzer` (fetch + classificação nos 11 estados, ações git conservadoras), `sync-planner` (análise em lote, plano, execução revalidada), `scan-cache`, `fetch-all-settings`, `run-report` e `secret-redaction`. Acima disso, `fetch-all-service.cjs` guarda o plano da passada e serializa uma passada por vez; `fetch-all-ipc-handlers.cjs` faz a ponte e devolve sempre `{ ok, … }`. No renderer, `FetchAllPanel.tsx` no menu Ferramentas, com as regras de leitura do plano extraídas para `fetch-all-plan.ts`.

SEGURANÇA PRESERVADA DO ORIGINAL: fluxo em duas fases (a varredura só lê; pull/push/commit exigem confirmação explícita); pull sempre `--ff-only`; push só quando o branch está estritamente à frente; estados problemáticos apenas reportados; `GIT_TERMINAL_PROMPT=0` para um repositório sem credencial falhar como `FETCH_ERROR` em vez de travar a varredura; lista de permissão de argumentos do git, no mesmo modelo do `git-service.cjs` (a interface escolhe *qual* ação rodar, nunca monta a linha de comando); redação de credenciais em toda saída do git antes de ela chegar à tela ou ao relatório. O estado de cada repositório é relido imediatamente antes de cada escrita — se mudou desde a revisão do plano, a ação é recusada com a transição registrada.

NOVO EM RELAÇÃO AO ORIGINAL: **ignorar uma pasta**. O ícone ao lado de qualquer repositório listado grava o caminho em `ignoredPaths` e o tira do plano na hora, além das varreduras seguintes — inclusive das rápidas, que vêm do cache. A lista de ignoradas é gerenciável no rodapé do painel. Também novo: o progresso da passada é publicado por evento (limitado a um a cada 150 ms, porque a varredura visita milhares de pastas por segundo e mandar cada uma entupiria o IPC), e o plano vive no processo principal — fechar e reabrir o painel não perde a varredura.

DIFERENÇA DELIBERADA: no Windows os discos são detectados testando as letras de unidade, e não pela API `GetDriveTypeW` do original — a API exigiria dependência nativa no processo principal do Electron, e o teste por letra cobre fixas e removíveis (unidades de rede não respondem como diretório local).

TESTE: 43 casos novos. No backend, `node:test` — scanner (parsers de montagem, poda, aninhamento, cancelamento), analisador contra repositórios git de verdade com remoto *bare* local e offline (atualizado, pull, push, sujo, divergido, sem remoto, desanexado, merge inacabado, fora de repositório), planejador (classificação, candidatos a commit automático, recusa por mudança de estado, ciclo commit+push completo), relatório (injeção de Markdown e vazamento de segredo), configuração/cache e o serviço ponta a ponta (varredura, ignorar, cache, recusas). No frontend, `vitest` para as regras de leitura do plano. A trava mais importante — pull recusado em divergência, sem criar merge e sem mover o `HEAD` — tem teste próprio.

VALIDAÇÃO: `npm run build` (tsc -b + vite), `eslint` e as duas suítes limpos — 594/594 no `node:test` e 445/445 no `vitest`.

LIMITE ASSUMIDO: o cancelamento durante a execução impede a *próxima* ação, mas não interrompe o comando git em curso — abortar um push pela metade seria pior do que esperá-lo terminar. Herdado do original: só o branch atual de cada repositório é sincronizado, e `push -u` não é criado automaticamente para branch sem upstream. A ferramenta ainda não expõe na interface a edição das raízes de varredura nem dos nomes excluídos (o serviço já persiste os dois; a interface hoje só edita a lista de ignoradas).

CONTEXTO MULTI-AGENTE: outro agente estava editando `main.cjs` e `preload.cjs` em paralelo (instalação automática de CLIs). O commit desta entrega foi montado por hunk para levar só os trechos do Fetch All, deixando o trabalho em andamento do outro agente intacto na árvore.

Estado final: concluído e validado por build/lint/testes; verificação no app rodando fica para o usuário, já que uma varredura real percorre os discos da máquina dele.

## Registro de Trabalho — 2026-08-27 (parte 18) — clique da CLI e arrasto para seleção no terminal

RESPONSÁVEL: Continue o trabalho do Claude.

CORREÇÃO: o `bindMouseSelection` agora retém somente o `mousedown` primário de sessões com mouse tracking ativo. Se o ponteiro ultrapassa três pixels, o gesto é redisparado como seleção forçada; se solta sem arrastar, o par `mousedown`/`mouseup` é reproduzido sem modificadores, devolvendo o clique à CLI. O primeiro `mousemove` também é reenviado ao alvo original quando o cursor já saiu do terminal. Listeners pendentes são removidos no blur e ao destruir a sessão.

VALIDAÇÃO: `npm run test:frontend -- --run src/features/canvas/terminal/terminal-mouse-selection.test.ts` — 19/19; `git diff --check` limpo. `npm run build`, `npm run lint` e `npx tsc -b` foram iniciados, mas excederam o limite de execução do ambiente sem saída de erro; não houve validação manual com o app, xdotool ou mouse real.

Estado final: concluído quanto à implementação e aos testes automatizados disponíveis; validação completa de build/lint e comportamento visual com mouse real pendente por limitação de tempo do ambiente.

## Registro de Trabalho — 2026-08-31 (parte 19) — documentação canvas-first e gates sincronizados

PEDIDO: atualizar todas as docs do AI Core considerando que o modo de chat foi
defasado, registrar o trabalho e preparar a entrega.

DECISÃO: o canvas é a superfície principal. O chat fica documentado como
legado de compatibilidade para sessões e exportações antigas, sem novos fluxos
de produto. A documentação pública continua sem caminhos privados,
identificadores de contas ou credenciais.

FEITO: README, índice de docs, guias de usuário e desenvolvedor, arquitetura,
roadmap, política de versionamento e execução via código-fonte foram corrigidos
para refletir a implementação atual. Foi criado `docs/projeto/ARQUITETURA.md`;
`docs/_legado/` continua reservado ao histórico. Também foram corrigidos os
fluxos de branch/update/release, `.env.example` e o gate de docs do CI. O
roadmap passou a apontar oportunidades de contribuição em performance,
multi-SO, provedores, orquestração e experiência de contribuição. O fixture do
teste de uso ao vivo do Claude passou a usar relógio determinístico para não
envelhecer artificialmente para `stale`; o `--help` e os comentários do
launcher também foram alinhados à branch configurável do update explícito.

VALIDAÇÃO: auditoria de links locais em 10 docs ativos sem referências
quebradas; build com 709 módulos; `npm test` 859/859;
`npm run test:frontend` 698/698; launcher Python 95/95; lint com 0 erros e os
3 avisos React já existentes; `git diff --check` limpo. O build ainda informa o
aviso conhecido de chunk JavaScript acima de 500 kB.

LIMITE: nenhuma conta ou credencial real foi alterada. O release será gerado
pelo workflow do GitHub após o push e acompanhado separadamente.

Estado final: concluído e pronto para commit/push.

## Registro de Trabalho — 2026-08-31 (parte 20) — autorização de caminhos nos IPCs de projetos

PEDIDO: fechar a autorização de caminhos apontada pela auditoria de segurança
de 30/08/2026.

FEITO: `projects-path-security.cjs` passou a concentrar a concessão nativa,
`realpath`, validação de diretório, bloqueio de raízes do sistema, contenção e
rejeição de links simbólicos nas raízes persistidas. `projects:pick-folder`,
`projects:detect-repos` e `projects:save` não aceitam mais uma raiz inventada
pelo renderer. Listagem e indexação exigem a raiz registrada exata; os IPCs de
texto recebem somente raízes sanitizadas e mantêm a concessão exata para um
arquivo escolhido no seletor nativo. Testes IPC cobrem inexistente, raiz ampla,
pasta externa, arquivo interno e link simbólico externo.

VALIDAÇÃO: `npm test` — 868 testes, 858 aprovados, 10 skips e zero falhas;
`npm run test:frontend` — 699/699; `npm run build` — 709 módulos; `npm run
lint` — zero erros e os 3 avisos React já existentes; `git diff --check`
limpo. O gate Python do launcher foi executado, mas 4 dos 95 testes de
descoberta de Node falharam no Windows com PATH sintético; não houve alteração
em Python nesta entrega.

Estado final: concluído quanto à task de segurança e pronto para commit/push.

## Registro de Trabalho — 2026-08-31 (parte 21) — fixtures nativas do scanner do Fetch All

PEDIDO: cobrir os caminhos nativos do scanner de projetos em Windows e macOS,
sem depender dos discos reais do runner.

FEITO: `repo-scanner.cjs` passou a aceitar plataforma, semântica de caminhos e
IO injetáveis nas funções de inventário e comparação. A produção mantém os
defaults nativos: letras de unidade no Windows, `/proc/mounts` ou `mount` no
POSIX, exclusão de montagens virtuais/de rede, `/System/Volumes` e
`Library/CloudStorage` no macOS. A varredura também recebe os adapters de
filesystem e caminho, mantendo a comparação case-insensitive correta quando a
plataforma simulada é Windows.

TESTES: `repo-scanner.test.cjs` passou a usar fixtures para letras de unidade
fixas/removíveis, fallback BSD, `/proc/mounts`, montagens de rede, exclusões
macOS, CloudStorage, raízes POSIX e comparação Windows. Os testes provam que
essas decisões não consultam discos reais; a suíte focada terminou com 21/21 e
`npm test` com 878 testes, 868 aprovados, 10 skips e zero falhas.

VALIDAÇÃO: `node --check` e ESLint dos arquivos do scanner passaram. Build,
frontend e lint completos ficam no gate final desta entrega; o aviso de chunk
grande e os 3 avisos React existentes continuam não bloqueantes.

Estado final: implementação e cobertura concluídas; pronta para os gates,
commit/push e atualização da task no Notion.

## Registro de Trabalho — 2026-08-31 (parte 22) — ambiente de conta não fica stale ao trocar de agente

PEDIDO: executar a task do Notion “Felixo AI Core/Agentes — Impedir ambiente de conta stale ao trocar de agente”, originada na auditoria de código de 24–30/08/2026.

CAUSA: a configuração do canvas mantinha a conta anterior enquanto a listagem assíncrona do novo agente ainda não respondia. Em paralelo, o PTY recebia somente `accountId`; a ponte não verificava se a conta pertencia ao provedor do comando antes de compor o ambiente. Uma troca rápida podia, portanto, levar o ambiente de uma conta OpenRouter/Openia para Claude, Codex ou outra CLI.

FEITO NO RENDERER: `useAgentConfig` limpa conta e lista imediatamente no `changeAgent`, invalida requisições anteriores por token e descarta respostas fora de ordem ou de outro provedor. A seleção só preserva uma conta que ainda existe na lista atual; callbacks tardios de criação/remoção também não conseguem reintroduzir seleção stale. O `providerId` acompanha as opções do terminal e é persistido no node, na sessão e na ponte preload.

FEITO NO PROCESSO PRINCIPAL: `pty-account-validation.cjs` resolve o provedor do comando (inclusive shims/caminhos Windows), confere `providerId` explícito e valida `accountId` contra a loja antes de reutilizar sessão, montar ambiente ou chamar `spawnPty`. A validação acontece na entrada IPC e novamente no `PtyProcessManager`; contas de nodes antigos sem `providerId` usam a inferência segura pelo comando. Sem conta, o comportamento de login do sistema e shells arbitrários permanece intacto; com conta inexistente ou provedor incompatível, o PTY é recusado sem compor variáveis de ambiente.

TESTE: regressões em três camadas — unidade da corrida assíncrona no frontend, validação de contrato/legado no backend e rejeição antes do ambiente/PTY no IPC e gerenciador. Os gates finais passaram: `npm test` 887/887, `npm run test:frontend` 704/704, `npx tsc --noEmit --pretty false`, `npm run build` (710 módulos), `npm run lint` com zero erros e `git diff --check` limpo. O lint ainda lista apenas os 2 avisos React já existentes em `src/features/chat/components/SearchPanel.tsx`; o build mantém o aviso conhecido de chunk JavaScript acima de 500 kB.

DOCUMENTAÇÃO: README, guia de usuário e arquitetura agora descrevem a limpeza síncrona, a proteção contra respostas assíncronas antigas e a validação provider/conta/comando no boundary do PTY.

LIMITE: a validação foi coberta por testes automatizados e pelos gates do Linux; a matriz de CI é responsável pela confirmação específica de Windows/macOS. Nenhuma conta, chave ou credencial real foi alterada.

Estado final: implementação concluída e validada localmente; pronta para commit, push, acompanhamento do CI/release e registro da task no Notion.

## Registro de Trabalho — 2026-08-31 (parte 23) — restart do drawer preserva a conta do terminal

PEDIDO: executar a task “Felixo AI Core/Terminal — Preservar accountId ao reiniciar terminal pelo drawer”, originada no achado IMPORTANTE 3 da auditoria técnica semanal de 24–30/08/2026.

CAUSA: `TerminalDrawer` já chamava `store.restart`, mas o tipo de `restartOptions` não declarava `accountId` e `providerId`. `CanvasView` também montava as opções do terminal expandido sem copiar esses campos do node. Ao reiniciar por esse caminho, o PTY recebia opções sem conta e caía no login do sistema, embora o bloco tivesse um perfil próprio.

FEITO: o contrato do drawer agora carrega `accountId` e `providerId`; `CanvasView` copia os valores persistidos no node para o drawer, que os repassa intactos ao `TerminalSessionStore.restart` e, depois, à ponte `pty.spawn`. O caminho sem `accountId` continua deliberadamente sem ambiente de perfil e usa o login do sistema.

TESTE: o harness do `TerminalSessionStore` passou a registrar os parâmetros de autenticação enviados à ponte. Foram adicionadas regressões para restart com perfil Claude selecionado e para restart sem `accountId`; ambas verificam o payload efetivo recebido pelo PTY.

VALIDAÇÃO: teste focado `terminal-session-store.test.ts` — 25/25; suíte frontend — 72 arquivos e 706 testes; suíte backend — 887/887; `npx tsc --noEmit --pretty false`, `npm run build` (710 módulos) e `git diff --check` aprovados. `npm run lint` terminou sem erros, mantendo somente os 2 avisos preexistentes de dependências em `SearchPanel.tsx`.

Estado final: implementação concluída e validada localmente; pronta para commit, push, acompanhamento do CI/release e registro da task no Notion.

## Registro de Trabalho — 2026-08-31 (parte 24) — chave do Openia vinculada à conta no lançamento

PEDIDO: executar a task do Notion “Felixo AI Core/Openia — Unificar a chave por conta do Openia com a validação de lançamento”.

CAUSA: o configurador do canvas consultava apenas `openia.keyStatus()`, que
representa a chave global, embora a loja de contas já pudesse preparar
`OPENROUTER_API_KEY` para uma conta específica. Assim, uma conta válida podia
ser recusada sem chave global, enquanto uma conta sem chave poderia só falhar
tarde, depois de o PTY nascer.

DECISÃO: a conta selecionada é a fonte exclusiva da chave. O login global só
vale quando o configurador está em **Login do sistema**; nenhuma conta herda
esse segredo silenciosamente.

FEITO: a listagem de contas Openia agora devolve somente `secretConfigured`, um
booleano seguro sem conteúdo de chave. O formulário grava a chave selecionada
na loja cifrada da conta e continua usando `openia key set-stdin` apenas para o
login global. `useAgentConfig` atualiza o indicador conforme a conta, relê a
fonte antes do lançamento e cobre troca de perfil; `validateAccount` no
processo principal bloqueia conta Openia sem chave antes de montar o ambiente ou
criar o PTY. A interface também explica qual origem está ativa sem expor
segredos.

TESTE: regressões da resolução de fonte cobrem conta com chave, conta sem chave
mesmo quando há chave global, login do sistema e troca entre perfis. A loja
testa o booleano público sem vazamento da chave e a barreira que aceita a conta
configurada e recusa a não configurada. Os gates passaram: `npm test` 889/889,
`npm run test:frontend` — 72 arquivos e 708/708, `npx tsc --noEmit --pretty
false`, `npm run build` (710 módulos), `npm run lint` sem erros e
`git diff --check` limpo. O lint mantém somente os 2 avisos React preexistentes
em `src/features/chat/components/SearchPanel.tsx`; o build mantém o aviso
conhecido de chunk JavaScript acima de 500 kB.

LIMITE: a chave global existente não é migrada automaticamente para uma conta;
ela continua disponível somente no login do sistema. Nenhuma conta, chave ou
credencial real foi alterada durante a validação.

Estado final: implementação concluída e validada localmente; pronta para
commit, push, acompanhamento do CI/release e registro da task no Notion.

## Registro de Trabalho — 2026-08-31 (parte 25) — remoção de perfil não perde a conta quando a pasta falha

PEDIDO: executar a task do Notion “Felixo AI Core/Contas — Corrigir remoção de
perfis quando apagar a pasta falha”, originada no achado IMPORTANTE 1 da
auditoria técnica semanal de 24–30/08/2026.

CAUSA: `cli-account-store.remove` capturava qualquer erro do `rmSync` e seguia
com `forgetSecret` e `writeStore`. Uma falha real de permissão, lock ou I/O
apagava a conta do registro enquanto a pasta de login e a credencial ainda
podiam permanecer no disco.

FEITO: a remoção agora trata somente `ENOENT` como sucesso idempotente, para o
caso em que a pasta já foi removida por fora. Qualquer outro erro interrompe a
operação antes de esquecer a chave ou atualizar o registro, lança um diagnóstico
sem caminho nem segredo e chega ao renderer como falha `{ ok: false }`. A
interface já devolve essa mensagem ao painel e a conta permanece disponível para
uma nova tentativa.

TESTE: o store ganhou filesystem injetável e regressões para falha `EACCES`,
confirmando que a pasta, o registro e a chave cifrada continuam preservados e
que uma segunda tentativa funciona; outro caso confirma que `ENOENT` continua
permitindo a remoção. Um teste de IPC verifica a resposta segura do canal
`cli-accounts:remove`.

DOCUMENTAÇÃO: README e guia do usuário explicam a regra `ENOENT`, a preservação
da conta diante de falha real e a possibilidade de retry.

VALIDAÇÃO: teste focado — 15/15; `npm test` — 892/892; `npm run test:frontend` —
72 arquivos e 708/708; `npx tsc --noEmit --pretty false`; `npm run build` (710
módulos); `npm run lint` sem erros; `git diff --check` limpo. O lint mantém
somente os 2 avisos React preexistentes em `src/features/chat/components/SearchPanel.tsx`,
e o build mantém o aviso conhecido de chunk JavaScript acima de 500 kB.

LIMITE: a falha pode deixar a pasta intacta de propósito, para não separar a
credencial da conta; depois de corrigir o bloqueio, a remoção deve ser repetida.
Nenhuma conta ou credencial real foi alterada durante a validação.

Estado final: implementação concluída e validada localmente; pronta para
commit, push, acompanhamento do CI/release e registro da task no Notion.

## Registro de Trabalho — 2026-08-31 (parte 26) — sanitização de Markdown externo

PEDIDO: executar a task “Felixo AI Core/Segurança — Sanitizar Markdown externo
antes de renderizar HTML e URLs”, originada na auditoria de segurança de
30/08/2026.

CAUSA: `MarkdownContent` usava `rehypeRaw` sem um schema de sanitização, o
renderer de links passava `href` diretamente e o resolver de imagens aceitava
esquemas arbitrários. Conteúdo de agentes, arquivos e histórico podia,
portanto, introduzir HTML, navegação ou carregamento de recursos sem uma
política explícita.

FEITO: o pipeline agora executa `rehypeRaw` seguido de `rehype-sanitize` com
schema explícito, mantendo GFM e os elementos visuais necessários, mas
removendo HTML ativo, embeds, SVG, mídia e atributos de evento. A transformação
final `sanitizeMarkdownUrl` repete a política no boundary do React: links
aceitam `http:`, `https:`, `mailto:` e âncoras; imagens remotas aceitam apenas
`http:`/`https:`; `data:` fica limitado a imagens raster base64 de até 2 MiB.
Referências relativas só viram `file://` quando há `baseDir` derivado de um
arquivo já autorizado; caminhos absolutos, `file:`, `javascript:` e esquemas
desconhecidos são recusados. O resolver também evita dupla codificação de
caminhos com espaço/acento entregues já escapados pelo parser.

TESTE: `MarkdownContent.test.ts` cobre HTML bruto, eventos, script, iframe,
links perigosos e externos, imagens remotas/data/locais, fallback sem
`baseDir` e preservação de task list, tabela e strikethrough GFM.
`markdown-image-src.test.ts` cobre a política de protocolos, caminhos absolutos,
data URI raster e limite de tamanho. A suíte focada passou com 18/18; a suíte
frontend passou com 73 arquivos e 716/716 testes; `npm test` passou com 892/892;
typecheck, lint e build passaram; `git diff --check` ficou limpo. O lint
continua exibindo somente os 2 avisos React preexistentes de `SearchPanel.tsx`,
e o build mantém o aviso conhecido de chunk acima de 500 kB.

VALIDAÇÃO REAL: a janela do app foi iniciada em Electron 41 com renderer
Chromium real e o componente foi montado em memória com conteúdo malicioso. O
smoke confirmou `xssFlag=false`, zero `<script>`, `<iframe>`, atributos `on*`
ou `href/src` perigosos, preservando o link e a imagem HTTPS legítimos. A
execução não alterou arquivos do usuário; o perfil Electron temporário foi
isolado. A cobertura automatizada do repositório continua sendo estática/SSR,
enquanto o smoke cobriu a execução real do renderer.

DOCUMENTAÇÃO: README, guia do usuário e `docs/projeto/ARQUITETURA.md` passaram
a documentar a fronteira de sanitização, os protocolos aceitos, o limite de
data images e a regra de `baseDir`.

PUBLICAÇÃO: a implementação foi publicada no commit
`109a679b2280fe696dcc5c32a69171f98e60a7d5`, com CI multi-SO
`33416332453` e release `v0.1.122`/workflow `33416541676` concluídos com
sucesso. O registro desta entrada documental foi acrescentado no commit
subsequente e será publicado com o novo release após o gate remoto.

LIMITE: o preview permite imagens HTTP/HTTPS remotas porque são uma capacidade
visual existente; o código não faz download nem valida o conteúdo MIME real do
servidor. A decisão restringe protocolo e data URI, mas não transforma uma URL
externa em uma origem confiável. Nenhuma conta, chave ou credencial foi tocada.

Estado final: correção implementada, testada no renderer real e pronta para o
segundo push documental e acompanhamento do release.

## Registro de Trabalho — 2026-08-31 (parte 27) — credenciais do Git não chegam aos erros persistidos

PEDIDO: executar a task “Felixo AI Core/System Design — Redigir credenciais nos erros do Git antes de persistir”, originada no achado de segurança da auditoria de 30/08/2026.

CAUSA: `system-design-service.cjs` executava `git` com URL e coletava erros
de `execFile` que podiam repetir a linha de comando, a URL privada, o stderr e
tokens. O handler IPC persistia `error.message` em `lastError`, no SQLite e no
QA Logger, além de devolvê-lo ao renderer. Uma configuração antiga também podia
manter userinfo de credencial na URL do repositório.

FEITO: `git-secret-redaction.cjs` passou a ser a política compartilhada pelo
System Design e pelo Fetch All. URLs são normalizadas antes de persistir ou
chamar o Git, removendo userinfo, parâmetros sensíveis e fragmentos. Mensagens
redigem userinfo, tokens conhecidos, parâmetros, cabeçalhos de autorização e
argumentos sensíveis; linhas de comando completas são descartadas e o detalhe é
compactado e limitado. O erro que atravessa o serviço carrega somente etapa,
código, branch, destino seguro e stderr já redigido. O IPC aplica a mesma
barreira ao SQLite, QA Logger e renderer e regrava configurações legadas já
sanitizadas.

AUTENTICAÇÃO PRIVADA: o fluxo de sucesso continua usando o credential helper
do Git, Keychain do macOS, Credential Manager do Windows ou equivalente
configurado no sistema. Credencial embutida na URL não é necessária nem
suportada; a URL deve conter apenas o destino do repositório.

TESTE: novas regressões cobrem URL com userinfo e query sensível, tokens,
Bearer/Basic, cabeçalhos, stderr, linha de comando, persistência SQLite, QA
Logger, resposta IPC, migração de configuração legada e a URL sanitizada que
chega ao executor Git. O teste focado passou com 18/18 e `npm test` passou com
900/900. `npm run test:frontend` passou com 73 arquivos e 716/716 testes;
typecheck, lint e build também passaram (`715` módulos). O lint mantém somente
os 2 avisos React preexistentes em `src/features/chat/components/SearchPanel.tsx`,
e o build mantém o aviso conhecido de chunk JavaScript acima de 500 kB.

DOCUMENTAÇÃO: README, guia de usuário e `docs/projeto/ARQUITETURA.md` agora
descrevem a autenticação segura de repositórios privados, a normalização de
URLs, o diagnóstico redigido e a migração de dados legados.

PUBLICAÇÃO: a implementação foi publicada no commit
`fb87526e95501e9b2dbabbdbec7f3b48c2d88c81`, com CI multi-SO
`33420945011` concluído com sucesso e release pública `v0.1.124` pelo workflow
`33421160893`, contendo os instaladores de Linux, macOS e Windows.

LIMITE: nenhum segredo real foi usado ou alterado. A política remove formatos
reconhecíveis e qualquer segredo fornecido na URL antes do Git, mas a
autenticação efetiva continua dependendo da configuração segura do credential
helper/gerenciador do sistema; URLs sem essa configuração falham sem expor a
credencial. Dados históricos fora da configuração migrada não são reescritos
automaticamente.

Estado final: correção implementada, testada, publicada e pronta para o push
documental desta entrada e o acompanhamento do release correspondente.

## Registro de Trabalho — 2026-08-31 (parte 28) — lock do launcher Python e pip-audit

PEDIDO: executar a task do Notion “Felixo AI Core/Python — Fixar dependências do launcher e automatizar pip-audit”, originada na auditoria de dependências, segurança, atualizações e otimizações de 30/08/2026.

CAUSA: `requirements.txt` aceitava faixas abertas para `questionary` e `rich` e não fixava o grafo transitivo nem os hashes. O launcher podia resolver ambientes diferentes entre máquinas; o CI também não auditava esse conjunto.

FEITO: `requirements.in` passou a conter apenas as dependências diretas editáveis. `requirements.txt` agora é um lock universal gerado pelo `uv`, com versões exatas, marcadores para Python 3.9+ e hashes das distribuições. A resolução preserva `prompt-toolkit`/`markdown-it-py` compatíveis com Python 3.9 e versões atuais em Python 3.10+. O launcher continua instalando o lock, incluindo os retries PEP 668 existentes.

CI: a matriz do launcher instala `requirements.txt` com `--require-hashes` em Ubuntu, Windows e macOS, Python 3.9 e 3.13. O job `python-dependency-audit` instala `pip-audit==2.10.1` e audita o lock com `--strict`.

TESTE: a instalação real via pip do lock com hashes passou em Python 3.9 e 3.12, com `pip check`; `start_app.py --help`, `compileall` e `git diff --check` passaram. A suíte do launcher passou com 98/98 testes. `pip-audit` retornou “No known vulnerabilities found”. A matriz remota confirmou instalação e execução em todos os três sistemas operacionais e nas versões Python 3.9/3.13.

PUBLICAÇÃO: a implementação foi publicada no commit [`3003222`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/300322212d41f6819dc9c690ecc494e4720d70fb). O CI [`33432510778`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/33432510778) terminou verde, incluindo o novo job de auditoria. O release [`v0.1.127`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.127), workflow [`33432726718`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/33432726718), foi publicado com 14 artefatos para Linux, macOS e Windows.

LIMITE: o lock foi resolvido contra o PyPI e deve ser regenerado a partir de `requirements.in` sempre que houver atualização de dependência, repetindo a auditoria. Os avisos de depreciação do Node.js 20 nas actions do GitHub são não bloqueantes e não pertencem a esta correção.

Estado final: task concluída, dependências do launcher reproduzíveis, auditoria automatizada no CI, publicada e registrada.

## Registro de Trabalho — 2026-08-31 (parte 29) — retomada segura de sessões do Gemini

PEDIDO: executar a task do Notion “Felixo AI Core/Retomada — `--resume` do
Gemini CLI não aceita mais UUID (mudança de versão)”.

DIAGNÓSTICO: o `gemini` instalado (`0.57.0`) documenta `--resume` com
`"latest"` ou índice numérico, enquanto a referência persistida pelo canvas
é um UUID. A implementação local dessa versão ainda contém uma busca interna
por UUID, mas a disponibilidade depende do projeto e do `HOME` exatos da
conta; além disso, consultar `--list-sessions` no lançamento executa a geração
de resumos e pode pedir autenticação. Converter um UUID em índice sem essa
confirmação poderia abrir outra conversa.

FEITO: `canResumeAgentSession` agora recusa a retomada automática do Gemini
quando só há o UUID persistido, e `buildAgentResumeArgs` não deixa esse UUID
chegar ao PTY. O canvas exibe um fallback explícito explicando que o índice
muda com a lista de sessões e orienta a pessoa a usar `/resume` no diretório
correto. Codex e Claude continuam usando seus IDs persistidos normalmente.
Não foi feita uma consulta automática nem um palpite de índice.

TESTE: regressões cobrem o resolvedor puro, o texto de fallback e o spawn real
do `TerminalSessionStore`, confirmando que `gemini-session-123` não aparece nos
argumentos. O teste focado passou com 51/51; `npm run test:frontend` passou com
74 arquivos e 721/721 testes; `npm test` passou com 905/905; `npm run lint`
terminou sem erros; `npm run build` transformou 716 módulos; e
`git diff --check` ficou limpo. O lint mantém somente os 2 avisos React
preexistentes em `src/features/chat/components/SearchPanel.tsx`, e o build
mantém o aviso conhecido de chunk JavaScript acima de 500 kB.

VALIDAÇÃO REAL: `gemini --help` e a versão instalada foram consultados. Uma
tentativa controlada de `gemini --list-sessions` parou no prompt de
autenticação do ambiente atual; nenhuma autenticação, conta, sessão ou
credencial foi alterada. Por isso, a correção entrega o fallback honesto
previsto pela task, em vez de afirmar uma retomada real que não pôde ser
validada nesta conta.

Estado final: correção implementada e validada localmente; pronta para commit,
push, acompanhamento do CI/release e registro da task no Notion.

## Registro de Trabalho — 2026-08-31 (parte 30) — vulnerabilidades do Electron e do npm empacotado

PEDIDO: executar a task do Notion [“Felixo AI Core/Dependências — Corrigir
vulnerabilidades do Electron e do npm empacotado”](https://app.notion.com/p/Felixo-AI-Core-Depend-ncias-Corrigir-vulnerabilidades-do-Electron-e-do-npm-empacotado-3cc91f95497e812ca5bcd487dda2240e).

DIAGNÓSTICO: a auditoria inicial completa encontrava 8 vulnerabilidades
(7 altas e 1 moderada), envolvendo Electron 41.3.0, `extract-zip`, a árvore
do npm 11.19.0 empacotada em `build/npm-runtime`, além de `tar`,
`brace-expansion`, `ip-address`, `undici` e `nanoid`. `npm audit --omit=dev`
retornava zero e mascarava o risco porque o Electron, o npm e suas
dependências são distribuídos com o app.

FEITO: Electron foi atualizado para `^41.10.7`, o último patch disponível na
linha 41 e dentro da faixa aceita pela task; a atualização substituiu o
`extract-zip` vulnerável por `@electron-internal/extract-zip` `1.0.5`. O npm
empacotado foi atualizado para `^11.19.1`, último npm 11 compatível com o
contrato atual `node >=22.12.0`. A resolução do lockfile também atualizou o
`tar` empacotado para `7.5.22`, `brace-expansion` para `5.0.9`,
`ip-address` para `10.5.0`, `undici` para `6.28.0` e `nanoid` para `3.3.18`.
O npm 12 não foi adotado porque suas versões atuais elevam o mínimo de Node
além do contrato declarado pelo app.

ABI E EMPACOTAMENTO: `node-pty` foi reconstruído para o Node local e para o
ABI do Electron 41.10.7. O hook `beforePack` foi exercitado pelo
`electron-builder --dir`; o artefato final em `release/linux-unpacked` contém
`npm 11.19.1`, executa esse npm pelo binário do Electron e não contém o
diretório legado `extract-zip`.

AUDITORIA: `npm audit --json` completo terminou com 0 vulnerabilidades
críticas, altas, moderadas ou baixas; a auditoria sem devDependencies também
terminou com 0. O lockfile não deixou advisories residuais conhecidos.

TESTE: `npm test` passou com 905/905 testes em 34 suítes; `npm run
test:frontend` passou com 74 arquivos e 721/721 testes; typecheck e build
passaram, transformando 716 módulos; `npm run lint` terminou sem erros e
mantém apenas os 2 avisos React preexistentes de `SearchPanel.tsx`; o
empacotamento Linux terminou com sucesso. O build continua exibindo o aviso
conhecido de chunk JavaScript acima de 500 kB.

SUPORTE: as [notas oficiais do Electron 41.10.7](https://github.com/electron/electron/releases/tag/v41.10.7)
registram backports de Chromium/V8, mas também avisam que a linha 41.x
entrou em fim de suporte. A versão foi mantida por exigência da task e para
evitar uma migração major sem validação; deve ser aberta uma atualização
posterior para uma linha suportada, antes de tratar este patch como solução
de longo prazo. A [lista oficial de releases estáveis](https://releases.electronjs.org/release?channel=stable)
deve orientar essa próxima migração.

PUBLICAÇÃO: a implementação e este registro foram publicados no
[commit c9ae351](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/c9ae351f4a16d7cb35f71cc7b446b6717613d59c). O [CI multi-SO
33443389252](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/33443389252)
terminou verde em Ubuntu, macOS e Windows, e o [release workflow
33443583904](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/33443583904)
publicou a [release v0.1.130](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.130)
com 14 artefatos. Nenhuma conta, chave ou credencial foi tocada.

Estado final: vulnerabilidades corrigidas no grafo completo e no npm que
chega ao artefato distribuído, publicada e registrada na task e no relatório
de hoje.

## Registro de Trabalho — 2026-08-31 (parte 31) — Fetch All sem varredura implícita de disco inteiro

PEDIDO: executar a task do Notion [“Felixo AI Core/Fetch All — Impedir
varredura sem limite quando não há raízes configuradas”](https://app.notion.com/p/Felixo-AI-Core-Fetch-All-Impedir-varredura-sem-limite-quando-n-o-h-ra-zes-configuradas-3cd91f95497e818b9658fb3d21037c0d).

DIAGNÓSTICO: `resolveScanRoots([])` tratava configuração vazia como autorização
para chamar `listLocalDrives()`. No Linux, isso incluía `/`; uma execução real
continuou por mais de 30 s, visitou aproximadamente 191.500 diretórios e não
encontrou repositórios. O painel também não mostrava o escopo efetivo nem
limpava o plano anterior quando uma nova passada era cancelada.

FEITO: `resolveScanRoots` agora devolve `[]` por padrão quando não há raízes e
só inventaria discos com `allowUnconfigured: true`. O serviço expõe, antes do
I/O recursivo, raízes configuradas, raízes efetivas, discos locais disponíveis,
motivo, custo esperado e uma `scopeKey`. O `FetchAllPanel` mostra essas
informações, lista os caminhos candidatos e exige um clique explícito para
registrar a confirmação do escopo amplo; a confirmação é vinculada à lista
exibida e é invalidada se as montagens/discos mudarem. O IPC e a CLI preservam
essa confirmação; o terminal oferece `--todos-discos` como opt-in explícito.

CANCELAMENTO E CACHE: iniciar uma nova passada limpa o plano anterior; erro ou
cancelamento termina em `idle`, descarta resultados parciais e mantém o botão
de cancelar no estado ocupado. O cache ganhou versão e chave de ambiente que
considera raízes, exclusões, caminhos ignorados, montagens podadas e discos
locais detectados; portanto a varredura rápida não reutiliza resultado de outro
escopo.

TESTES: foram adicionados casos para a barreira de configuração vazia e o
opt-in nos três SOs, confirmação rejeitada após mudança de montagem,
cancelamento com limpeza do plano, encaminhamento IPC, cache contextual e a
opção `--todos-discos`. A suíte backend passou com 917/917 testes; a suíte
frontend passou com 74 arquivos e 721/721 testes; `npm run build` transformou
716 módulos; `npm run lint` terminou sem erros, mantendo apenas os 2 avisos
React preexistentes de `src/features/chat/components/SearchPanel.tsx`.

BENCHMARK: a nova bancada `npm run benchmark:fetch-all` exige uma raiz
explícita e mede diretórios, repositórios, concorrência, p50 e p95. No checkout
em 31/08/2026, com 5 passadas e concorrência 16, mediu 187 diretórios, 1
repositório, p50 de 40,006 ms e p95 de 42,125 ms. O baseline maior da auditoria
registrou 3.335 diretórios, 51 repositórios e p95 de 289 ms na concorrência 16;
o cenário antigo sem raiz visitou cerca de 191.500 diretórios, enquanto o
novo caminho sem confirmação resolve 0 raízes e não entra no scanner.

VALIDAÇÃO REAL: o Vite local subiu para a checagem visual, mas não havia
navegador conectado nesta sessão para abrir o painel. A checagem visual fica
registrada como limitação da sessão; não foi iniciada nenhuma varredura real de
`/`.

PUBLICAÇÃO: a implementação foi publicada no commit
[`8b1bb7b`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/8b1bb7bca47b88f45df76ebd8cc12573946ddf52). O primeiro CI
[`33447196380`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/33447196380)
revelou uma expectativa de caminho POSIX não portátil no novo teste; o ajuste
foi publicado no commit
[`6e3dcfb`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/commit/6e3dcfb62a412c6223fca73976fd4d0d579f0d7c).
O CI final
[`33447565699`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/33447565699)
terminou verde nas matrizes Linux, macOS e Windows. O release
[`v0.1.133`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases/tag/v0.1.133),
workflow [`33447760779`](https://github.com/Felipe-Alcantara/Felixo-AI-Core/actions/runs/33447760779),
foi publicado com 14 artefatos para os três SOs.

Estado final: task concluída, correção implementada, testada, publicada e
pronta para registro na task e no relatório de hoje.

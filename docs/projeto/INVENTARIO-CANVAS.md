# Inventário operacional do canvas

<!-- Gerado por src/features/canvas/inventory/canvas-inventory.ts. Não edite à mão: rode `npm run docs:inventario-canvas` em app/. -->

Contrato visual/E2E da superfície principal. Cada elemento diz quem é o dono, em que estado
pode estar e por quê, o que cada controle faz e como falha, onde o estado persiste, que
canais IPC usa, que testes o cobrem e quais lacunas estão abertas, cada uma com task.

## Como o contrato é conferido

`canvas-inventory.test.ts` (vitest) falha quando:

- um tipo de bloco (`CanvasNodeType`) ou uma ferramenta (`CanvasTool`) não tem entrada (o `tsc` já recusa);
- um arquivo de `src/features/canvas/components/` com controle não é dono de nenhum elemento;
- o número de controles declarados de um arquivo difere do que o código tem (`<button`, `role="button"`/`role="menuitem"`, `<FelixoSelect`, `<FelixoToggle`, `<ActivityRailButton`);
- o localizador de um controle não aparece no arquivo dono, ou falta efeito ou falha conhecida;
- um canal IPC citado não existe em `electron/preload.cjs`;
- um teste citado não existe, ou a função de smoke citada não está no script;
- uma lacuna não aponta uma task do Notion;
- este documento não bate com os dados.

Ferramenta, bloco ou botão novo: acrescente a entrada em `src/features/canvas/inventory/data/` e rode
`npm run docs:inventario-canvas` (em `app/`) para regenerar este arquivo.

**Escopo.** Tudo que o canvas renderiza. Os modais de `features/chat` ficam de fora: o chat é
legado e o canvas não os abre. "Presente no código" não é "funcionando": o efeito de cada
controle foi lido no código e, quando há teste, o teste é citado na linha. Controle sem teste
é efeito lido, não visto rodando.

## Números

- **Elementos:** 94 (8 blocos, 16 ferramentas, 70 outras superfícies)
- **Controles:** 351, dos quais 55 com teste específico
- **Elementos sem nenhum teste:** 4
- **Lacunas:** 273 (alto 10, médio 146, baixo 117), em 77 tasks

## Moldura do canvas

### Trilho de ícones da sidebar

- **ID:** `chrome-activity-rail` · **Dono:** `src/features/canvas/components/CanvasToolbar.tsx`
- **Persistência:** localStorage felixo:canvas-sidebar-collapsed (sidebar recolhida); nenhuma para a ferramenta ativa (activeTool) e o menu Ajuda
- **IPC:** nenhum
- **Depende de:** `useHelpMenu`, `useOnboardingNovelties`, `onboardingStore`, `loadOnboardingUi`, `OnboardingErrorBoundary`, `setActiveTool (CanvasView)`, `changeSidebarCollapsed (CanvasView)`
- **Sobreposição:** nav.felixo-activity-rail dentro da aside da sidebar (z-26), coluna fixa de 52 px na borda esquerda, acima da topbar e da statusbar (18). Ajuda é o sexto botão do grupo de cima (≈ 271 de ≈ 289 px na altura mínima): um botão novo acima dela recorta o alvo. O menu Ajuda abre em portal (z 1000).
- **Testes:** `scripts/canvas-smoke-onboarding.cjs` → `alternarSidebar`, `scripts/canvas-smoke-onboarding.cjs` → `conferirTecladoDoMenuAjuda`, `scripts/canvas-smoke.cjs` → `checarAuditoriaDeAcessibilidade`, `scripts/canvas-smoke.cjs` → `checarLandmarksVisiveis`, `src/features/onboarding/onboarding-boundaries.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Sempre visível (52 px), expandida ou recolhida a sidebar: menu do canvas, Chat, Buscar, Projetos, Notificações e Ajuda no grupo de cima; Configurações e recolher/expandir no de baixo. |
| pending | Sino com notificationCount > 0: badge numérico e contorno pulsante (felixo-activity-rail-button-highlight); Ajuda com novidades: ponto e rótulo com a contagem (helpButtonLabel). |
| success | Botão da ferramenta aberta com is-active (Notificações, Ajuda e menu do canvas); aria-expanded nos que alternam. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `felixo-btn-icon felixo-activity-rail-button relative` (button) | clique | Base de todos os ícones do trilho (ActivityRailButton): aria-label e title iguais ao rótulo, aria-expanded só nos que alternam, data-notifications-trigger, data-felixo-help-trigger, data-canvas-tool-trigger e data-felixo-tour-anchor conforme as props; o clique executa o onClick de cada uso. | Sem falha própria; o resultado é o de cada uso abaixo. | — |
| `Abrir menu do canvas` (rail) | clique | toggleSidebar → changeSidebarCollapsed: abre ou recolhe a coluna da sidebar, grava felixo:canvas-sidebar-collapsed ("1"/"0") e muda o toolbarWidth do provider (painéis, topbar, statusbar e pílula de zoom acompanham). | Sem localStorage a escolha vale só nesta sessão (catch documentado). | `scripts/canvas-smoke-onboarding.cjs` → `alternarSidebar` |
| `label="Chat"` (rail) | clique | onOpenChat → App troca a tela para o chat (setScreen("chat")); o CanvasView inteiro desmonta. | Ao desmontar, saves com debounce ainda pendentes são descartados e o store de terminais fica órfão (ver lacunas). | `scripts/canvas-smoke-contas.cjs` → `checarCardDoOrquestrador` |
| `label="Buscar"` (rail) | clique | onSelectTool("search"): abre o painel Buscar com o foco no campo, ou fecha se já estava aberto (setActiveTool alterna). | Sem falha própria; o painel tem o próprio tratamento de erro. | `scripts/canvas-smoke.cjs` → `checarFocoAoAbrirFerramenta` |
| `label="Projetos"` (rail) | clique | onSelectTool("projects"): abre ou fecha o painel Projetos. | Sem falha própria; o painel tem o próprio tratamento de erro. | — |
| `highlight={notificationCount > 0}` (rail) | clique | onSelectTool("notifications"): abre ou fecha o painel Notificações; ao fechar pelo painel o foco volta a este botão (data-notifications-trigger). Mostra o badge com agentes aguardando + atualização pendente. | Sem falha própria. | `scripts/canvas-smoke.cjs` → `checarInteracoes` |
| `helpButtonLabel(help.novidades)` (rail) | clique | help.toggle: ao abrir dispensa o aviso de novidade (onboardingStore.dismissNotice) e carrega o menu Ajuda pelo chunk preguiçoso (loadOnboardingUi); fechar devolve o foco ao botão. | Falha do chunk ou do menu vira "nada na tela" (OnboardingErrorBoundary devolve null e registra no QA Logger); a próxima abertura tenta de novo. | `scripts/canvas-smoke-onboarding.cjs` → `abrirMenuAjuda` |
| `label="Configurações"` (rail) | clique | onSelectTool("settings"): abre ou fecha o painel Configurações. | Sem falha própria; o painel tem o próprio tratamento de erro. | — |
| `Expandir sidebar` (rail) | clique | O mesmo toggleSidebar do menu do canvas, no grupo de baixo, com rótulo "Recolher sidebar"/"Expandir sidebar" e o ícone do painel. | Sem localStorage a escolha vale só nesta sessão. | `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Projetos e Configurações do trilho não são clicados por nenhum teste (Projetos só é medido como âncora do tutorial). | baixo | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| Trocar para o Chat desmonta o canvas e deixa o store de terminais órfão. | médio | `3e991f95-497e-8104-a090-d5b295ba4747` |

### Coluna da sidebar (marca, alça e rodapé)

- **ID:** `chrome-sidebar-frame` · **Dono:** `src/features/canvas/components/CanvasToolbar.tsx`
- **Persistência:** localStorage felixo:canvas-sidebar-collapsed; localStorage felixo:canvas:sidebar-width (alça de largura; Home ou duplo clique esquece); processo principal: canvas:clear apaga o canvas salvo e os .md
- **IPC:** `canvas:clear`
- **Depende de:** `useResizableSidebarWidth`, `useCanvasTransfer`, `useAppVersion`, `deveMostrarRodapeDeStatus`, `SidebarSection`
- **Sobreposição:** aside absolute (top 0, bottom 0, left 0) z-26, por cima da topbar (18, largura total) e da statusbar (18); abaixo do overlay isBusy (50), dos diálogos (60) e dos menus em portal (1000). A alça (felixo-resize-handle, z-2) ocupa 6 px na borda direita. Os popovers de Criar e Organizar são inline (rolam dentro da coluna), não flutuam.
- **Testes:** `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos`, `scripts/canvas-smoke.cjs` → `checarAuditoriaDeAcessibilidade`, `scripts/canvas-smoke-onboarding.cjs` → `sa2`, `src/features/canvas/components/toolbar-flyout.test.ts`, `src/features/canvas/components/toolbar-status.test.ts`, `electron/services/canvas-ipc-handlers.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Expandida (largura var(--felixo-sidebar-width), 240–560 px, padrão 288): marca, "Canvas / Meu canvas", seções Criar, Organizar e Ferramentas, e rodapé com versão, Limpar e status de atualização/CLIs. |
| pending | isClearing: o botão mostra "Limpando…". |
| disabled | Recolhida (sidebarCollapsed): só o trilho; o conteúdo fica aria-hidden e inert. "Limpar" desabilitado com isBusy. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `felixo-sidebar-collapse-button` (button) | clique | Botão ao lado da marca: toggleSidebar recolhe a coluna (o mesmo efeito do trilho) e grava felixo:canvas-sidebar-collapsed. (desabilitado: some com a sidebar recolhida (conteúdo inert)) | Sem localStorage a escolha vale só nesta sessão. | — |
| `Excluir todos os blocos, conexões e arquivos .md do canvas` (button) | clique | Limpar: clearAll pede window.confirm, cancela saves pendentes e chama canvas:clear (apaga nós, arestas e os .md do canvas no processo principal); depois limpa o store de terminais, fecha gaveta e ferramenta e zera nós e arestas na tela. (desabilitado: isBusy (limpando, exportando ou importando)) | Recusa do processo principal vira window.alert com a mensagem ("Não foi possível limpar o canvas."); cancelar o confirm não muda nada. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| "Limpar" (destrutivo, com confirm e alert nativos) não tem teste de interface; o smoke só garante que o Tab do tutorial não passa por ele. | médio | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| A alça de largura da sidebar (arrasto, setas, Shift+setas, Home e duplo clique; role="separator") não é exercitada por teste. | baixo | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| Com a sidebar expandida há dois botões chamados "Recolher sidebar" (marca e trilho), o que deixa o nome ambíguo para leitor de tela (o smoke precisa escopar pelo trilho). | baixo | `3ec91f95-497e-8197-a218-ef49c302013d` |
| A sidebar expandida não recolhe sozinha em janelas estreitas: em 320 px ela cobre o canvas e empurra a barra superior; o smoke recolhe à mão antes de medir. | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Seção Criar da sidebar

- **ID:** `chrome-sidebar-create` · **Dono:** `src/features/canvas/components/CanvasToolbar.tsx`
- **Persistência:** canvas salvo (canvas:save via persistNode); processo principal: o .md do bloco novo (canvas-file:write)
- **IPC:** `files:pick-image`, `text-file:pick`, `canvas-file:write`, `canvas:save`
- **Depende de:** `NamedCreateButton`, `UrlCreateButton`, `useWebviewProfiles`, `explainUrlInput`, `addNode (CanvasView)`, `findFreeNodePosition`
- **Sobreposição:** Dentro da sidebar (z-26); os popovers são inline (felixo-sidebar-inline-panel) e empurram a seção para baixo em vez de cobrir o canvas. O menu de perfis (FelixoSelect) abre em portal (z 1000).
- **Testes:** `scripts/canvas-smoke.cjs` → `checarInteracoes`, `src/features/canvas/services/url-utils.test.ts`, `src/features/canvas/services/node-geometry.test.ts`, `electron/services/file-attachments-ipc-handlers.test.cjs`, `electron/services/canvas-files-ipc-handlers.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Seção "Criar" aberta: Agente (TerminalMenu), Novo bloco, Abrir imagem, Gerar imagem, Grupo e Página Web; cada botão com nome abre um popover inline. |
| error | Página Web com endereço recusado: "Endereço não aceito: <motivo>." ou "Informe o endereço do site." (role="alert", campo com aria-invalid). |
| disabled | Sidebar recolhida: a seção fica inert. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Abrir uma imagem autorizada no bloco do canvas` (button) | clique | onOpenImage → pickAndOpenImageFile: seletor nativo (files:pick-image); a imagem escolhida vira um bloco de arquivo de imagem (fileKind "image"), selecionado e centralizado na área útil, e é salvo (canvas:save). | erro engolido: imagem não suportada ou maior que 25 MB volta ok:false com mensagem, e o renderer ignora (CanvasView.tsx:2483); cancelar o seletor não faz nada. | — |
| `data-felixo-tour-anchor={tourAnchor}` (button) | clique | Gatilho de NamedCreateButton (usado por "Novo bloco" e "Grupo"): abre ou fecha o popover com o campo de nome (aria-expanded); Esc ou clique fora fecha e devolve o foco ao gatilho. | Sem falha própria. Clique fora puxa o foco de volta ao botão mesmo quando a pessoa clicou em outro lugar (ver lacuna). | — |
| `onCreate(name.trim() \|\| undefined)` (button) | clique | Criar (ou Enter no campo): "Novo bloco" chama addFileNode (cria nome-<timestamp>.md por canvas-file:write e um bloco de arquivo); "Grupo" chama addNode("group") com o nome ou "Grupo". O bloco nasce numa posição livre da área visível, entra no fim do dock (orderIndex) e é salvo por canvas:save. | erro engolido: a criação do .md (canvas-file:write) é void e não é conferida (CanvasView.tsx:2426); o bloco nasce mesmo se o arquivo falhar. Falha do canvas:save só vai para o console. | — |
| `{secondaryLabel}` (button) | clique | "Abrir arquivo existente…" (só em Novo bloco): fecha o popover e chama pickAndOpenTextFile (text-file:pick); o arquivo escolhido vira um bloco de arquivo apontando para ele. (desabilitado: só existe no popover de "Novo bloco") | erro engolido: falha do seletor volta ok:false com mensagem e o renderer ignora (CanvasView.tsx:2512). | — |
| `buttonLabel="Página Web"` (button) | clique | Gatilho de UrlCreateButton: abre ou fecha o popover com endereço, nome e perfil; Esc ou clique fora fecha e devolve o foco. | Sem falha própria. | `scripts/canvas-smoke.cjs` → `checarInteracoes` |
| `menuLabel="Perfil do navegador"` (select) | clique | Escolhe o perfil do navegador interno do bloco novo ("Perfil: Padrão" = sem perfil); vai como profileId no data do bloco. (desabilitado: some quando useWebviewProfiles não devolve perfis) | Sem falha própria; sem perfis cadastrados o seletor nem aparece. | — |
| `onCreate(result.url, name.trim() \|\| undefined, profileId \|\| undefined)` (button) | clique | Criar (ou Enter) da Página Web: explainUrlInput valida; aceito, addNode("webpage", { url, label?, profileId? }) cria e salva o bloco, limpa os campos e fecha. | Endereço recusado mostra o motivo (role="alert") e devolve o foco ao campo; o popover continua aberto. | `scripts/canvas-smoke.cjs` → `checarInteracoes` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Novo bloco, Grupo, Abrir imagem, "Abrir arquivo existente…" e uma Página Web válida não são criados por nenhum teste de interface; o smoke só confere a recusa de javascript:. | médio | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| Os seletores engolem o erro: "Abrir imagem" ignora o ok:false de files:pick-image ("Selecione um arquivo de imagem suportado e menor que 25 MB.", CanvasView.tsx:2483) e "Abrir arquivo existente…" ignora o de text-file:pick (CanvasView.tsx:2512). A pessoa escolhe o arquivo e nada acontece. | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| addFileNode dispara canvas-file:write sem esperar nem conferir (CanvasView.tsx:2426): o bloco aponta para um .md que pode não ter sido criado. | baixo | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| Fechar os popovers por clique fora devolve o foco ao gatilho mesmo quando a pessoa clicou em outro controle. | baixo | `3ea91f95-497e-81d9-a3d8-ed3971b18a24` |

### Seção Organizar da sidebar

- **ID:** `chrome-sidebar-organize` · **Dono:** `src/features/canvas/components/CanvasToolbar.tsx`
- **Persistência:** canvas salvo (posições via canvas:save); nenhuma para o modo seleção/mover
- **IPC:** `canvas:save`
- **Depende de:** `OrganizeButton`, `arrangeNodesAsMatrix`, `fitCanvasViewSafely (CanvasView)`, `fitBoundsSafely (CanvasView)`, `usePerformanceMode`
- **Sobreposição:** Dentro da sidebar (z-26); o grupo de modos é inline (felixo-sidebar-inline-panel) e não cobre o canvas. Organizar continua ativo com o canvas travado (a trava só desliga arrastar, conectar e selecionar).
- **Testes:** `src/features/canvas/services/canvas-matrix-layout.test.ts`, `src/features/canvas/services/canvas-interaction-geometry.test.ts`, `scripts/canvas-smoke-onboarding.cjs` → `conferirTeclasDoCanvasSobAPergunta`

| Estado | Quando |
| --- | --- |
| normal | Organizar (botão dividido com setinha), Selecionar/Mover e Enquadrar. |
| pending | Matriz animando: os blocos movidos levam AGENT_MATRIX_MOVING_CLASS até o fim da animação (sem animação no Modo Performance ou com reduced motion). |
| disabled | arrangeableCount < 2: as duas metades de Organizar ficam desabilitadas ("Adicione pelo menos dois blocos para organizá-los"). |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Modo seleção — Q para mover a tela` (button) | clique | onToggleMode alterna canvasMode entre "select" (arrastar no fundo desenha caixa de seleção) e "pan" (arrastar move a tela, cursor de mão); o rótulo vira "Selecionar"/"Mover". Mesmo efeito da tecla Q com foco no canvas. | Sem falha própria; o modo não persiste entre sessões. | — |
| `onClick={onFitView}` (button) | clique | Enquadrar: fitCanvasViewSafely(240) calcula o viewport que cabe todos os blocos na área útil (desconta topbar, statusbar, sidebar, painel e inspector) e anima até ele. | Sem instância do React Flow não faz nada; sem área útil cai no fitView padrão e desloca para a área útil depois. | — |
| `Adicione pelo menos dois blocos para organizá-los` (button) | clique | Corpo de Organizar: organize("single") arruma os blocos numa matriz na ordem do dock (arrangeNodesAsMatrix), salva as posições que mudaram (canvas:save) e enquadra a matriz (fitBoundsSafely). (desabilitado: menos de dois blocos organizáveis) | Nada muda quando os blocos já estão nas posições da matriz. | — |
| `aria-controls="canvas-organize-modes"` (button) | clique | Setinha "Modos de organização": abre ou fecha o grupo inline com os três modos e foca o primeiro; Esc ou clique fora fecha e devolve o foco ao corpo. (desabilitado: menos de dois blocos organizáveis) | Sem falha própria. | — |
| `Matriz única` (button) | clique | organize("single"): o mesmo do corpo do botão; fecha o grupo e devolve o foco. | Nada muda quando já está organizado. | — |
| `Uma matriz por repositório` (button) | clique | organize("by-repository"): uma faixa por pasta de trabalho, blocos sem pasta por último; salva e enquadra. | Nada muda quando já está organizado. | — |
| `Uma linha por pasta` (button) | clique | organize("by-repository-row"): uma linha lado a lado por pasta de trabalho; salva e enquadra. | Nada muda quando já está organizado. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Organizar (os três modos), Selecionar/Mover e o Enquadrar da sidebar não são clicados por nenhum teste; só o algoritmo da matriz e a geometria da área útil têm teste unitário. | médio | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| Fechar o grupo de modos por clique fora devolve o foco ao botão mesmo quando a pessoa clicou em outro controle. | baixo | `3ea91f95-497e-81d9-a3d8-ed3971b18a24` |

### Gerar imagem (Openia)

- **ID:** `chrome-generate-image` · **Dono:** `src/features/canvas/components/GenerateImageButton.tsx`
- **Persistência:** localStorage felixo:openia-image-model (último modelo); sessionStorage felixo:openia-image-pending (pedido em andamento, reconsultado por openia:image-status ao recarregar); processo principal: arquivo da imagem gerada (openia-image-service) e o bloco salvo pelo canvas
- **IPC:** `openia:image-models`, `openia:generate-image`, `openia:cancel-image`, `openia:image-status`, `canvas:image-generated`
- **Depende de:** `useOpeniaImageGeneration`, `openiaImageStore`, `FelixoSelect`, `addImageNodeFromArtifact (CanvasView)`
- **Sobreposição:** Popover inline dentro da sidebar (z-26), não flutua sobre o canvas; o menu de modelos (FelixoSelect) abre em portal (z 1000). O Esc que fecha o menu de modelos não fecha o popover junto (defaultPrevented).
- **Testes:** `src/features/canvas/services/openia-image-store.test.ts`, `electron/services/openia-image-service.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Botão "Gerar imagem" na seção Criar; aberto, popover com descrição (até 4.000 caracteres), modelo, aviso de custo e Gerar/Cancelar. |
| loading | Catálogo carregando (models.status === "loading", seletor com loading). |
| empty | Catálogo sem modelo de imagem: "Nenhum modelo de imagem no catálogo" e seletor desabilitado. |
| error | Catálogo indisponível (mensagem + "Tentar de novo"), descrição vazia/longa ou sem modelo (role="alert" no campo), falha da geração (mensagem do serviço) e, com o popover fechado, ícone de alerta no gatilho. |
| pending | generation.status === "pending": gatilho com "Gerando imagem…" e spinner, linha de estado com segundos; "Cancelando…" depois de cancelar. Sobrevive a fechar o popover e a recarregar (sessionStorage). |
| success | "Imagem adicionada ao canvas." (ou "N imagens…"); a imagem chega pelo evento canvas:image-generated e o CanvasView cria o bloco. |
| disabled | Seletor de modelo sem opções; Gerar com aria-disabled durante a geração; Cancelar com aria-disabled sem geração ou já cancelando. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Gerar uma imagem por IA com o Openia (OpenRouter) e colocá-la no canvas` (button) | clique | toggle: abre o popover e pede o catálogo (loadModels → openia:image-models, uma vez; o serviço guarda 10 min); fechar (também Esc e clique fora) esquece o desfecho mostrado (acknowledge) e devolve o foco; uma geração em andamento continua. | Catálogo que falha vira estado de erro no popover; sem a ponte, "A integração do Openia não está disponível nesta versão do Felixo." | — |
| `menuLabel="Modelos que geram imagem"` (select) | clique | Escolhe o modelo (setModel) e grava felixo:openia-image-model; com mais de 8 modelos o menu tem busca. (desabilitado: catálogo sem opções (carregando, erro ou vazio)) | Modelo lembrado que saiu do catálogo é descartado ao carregar (a pessoa escolhe outro). | — |
| `Consultar o catálogo de modelos de imagem de novo` (button) | clique | "Tentar de novo": loadModels({ force: true }) consulta openia:image-models de novo. (desabilitado: só aparece com o catálogo em erro) | Nova falha mantém o estado de erro com a mensagem do serviço. | — |
| `onClick={pending ? undefined : submit}` (button) | clique | Gerar (ou Ctrl/Cmd+Enter): valida descrição e modelo, grava o pedido em sessionStorage felixo:openia-image-pending e chama openia:generate-image; o processo principal grava a imagem e emite canvas:image-generated, que vira bloco de imagem selecionado e centralizado. (desabilitado: aria-disabled durante a geração) | Descrição vazia ou longa e modelo ausente viram role="alert" com foco no campo; pedido já em andamento: "Já há uma imagem sendo gerada. Aguarde ou cancele."; falha do serviço vira o estado de erro com a mensagem. | — |
| `Interromper a geração em andamento` (button) | clique | Cancelar: marca cancelling e chama openia:cancel-image; o desfecho "A geração de imagem foi cancelada." chega pela resposta do pedido. (desabilitado: aria-disabled sem geração em andamento ou já cancelando) | erro engolido: falha de openia:cancel-image cai num catch vazio (openia-image-store.ts:241); o botão fica em "Cancelando…" até o pedido terminar, e a geração pode concluir (e cobrar). | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| O popover não tem teste de interface (abrir, escolher modelo, Gerar, Cancelar, Tentar de novo, alerta no gatilho); só a store e o serviço do processo principal são testados. | médio | `3e391f95-497e-8144-be4c-cd800cf6fd52` |
| Gerar cobra créditos do OpenRouter sem confirmação; só há o aviso de texto no popover. | médio | `3e991f95-497e-8172-b092-f3aa9f111ccc` |
| erro engolido: falha de openia:cancel-image não aparece (catch vazio em openia-image-store.ts:241); a pessoa vê "Cancelando…" e a imagem pode sair mesmo assim. | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Fechar o popover por clique fora devolve o foco ao gatilho mesmo quando a pessoa clicou em outro controle. | baixo | `3ea91f95-497e-81d9-a3d8-ed3971b18a24` |

### Barra superior

- **ID:** `chrome-topbar` · **Dono:** `src/features/canvas/components/CanvasTopbar.tsx`
- **Persistência:** nenhuma
- **IPC:** nenhum
- **Depende de:** `setActiveTool (CanvasView)`
- **Sobreposição:** header absolute top 0, largura total (left/right 0 !important), z-18 e overflow: hidden (index.css:3216): fica sob a sidebar (26) à esquerda e recorta tudo que tentar sair dela para baixo (ver o aviso do ditado). pointer-events só nos filhos.
- **Testes:** `scripts/canvas-smoke.cjs` → `checarLandmarksVisiveis`, `scripts/canvas-smoke.cjs` → `checarOclusaoDoFixture`, `scripts/canvas-smoke.cjs` → `checarMatrizVisual`, `scripts/canvas-smoke-onboarding.cjs` → `sa3`

| Estado | Quando |
| --- | --- |
| normal | Faixa de 3rem com a marca, o campo "Pesquisar no canvas ou executar comando…" centralizado e, à direita, o botão de ditado. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Pesquisar no canvas ou executar comando` (button) | clique | onOpenSearch → setActiveTool("search"): abre o painel Buscar (não alterna: com o painel aberto continua aberto). Mesmo efeito de Ctrl/Cmd+K. | Sem falha própria. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| O clique no campo de comando da barra não é exercitado (o smoke abre Buscar pelo trilho e por Ctrl+K). | baixo | `3ec91f95-497e-818f-b9f2-f9710605c303` |

### Ditado por voz

- **ID:** `chrome-dictation` · **Dono:** `src/features/canvas/components/DictationButton.tsx`
- **Persistência:** localStorage felixo:dictation-shortcut (atalho); processo principal: configuração e chave cifrada do ditado (speech-settings-store)
- **IPC:** `speech:get-config`, `speech:microphone-status`, `speech:request-microphone`, `speech:transcribe`, `pty:write`
- **Depende de:** `useDictation`, `useDictationShortcut`, `createVoiceRecorder`, `useTerminalSessions (typeText)`
- **Sobreposição:** Dentro da barra superior (z-18, overflow hidden). O balão usa z-50, mas o z vale só dentro da barra e a área dele fica fora do recorte (some). Se o recorte sair, o balão (w-72, à direita) cai sobre o inspector "Elementos" (z-20, fora do contexto da barra) e ficaria por baixo dele.
- **Testes:** `src/features/canvas/services/dictation.test.ts`, `src/features/canvas/services/voice-recorder.test.ts`, `electron/services/speech/speech-ipc-handlers.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Microfone na barra superior: "Ditar por voz (<atalho>)", atalho padrão Mod+Shift+M. |
| loading | Transcrevendo (state.phase === "transcribing"): spinner e botão desabilitado. |
| error | state.phase === "error": ícone de microfone cortado e mensagem (falha da gravação ou da transcrição, texto sem nada digitável). |
| pending | Gravando (state.phase === "recording"): fundo vermelho, ponto pulsando, cronômetro e "Descartar gravação"; para sozinho em 90 s. |
| success | Aviso depois da entrega (notice), por exemplo "Nenhum terminal aberto: copiei o texto ditado. Cole onde quiser." |
| disabled | Durante a transcrição o botão principal fica desabilitado. |
| denied | Sem chave de transcrição ("Cadastre a chave da API de transcrição em Configurações → Ditado por voz."), microfone bloqueado pelo sistema (describeMicrophoneStatus) ou fora do aplicativo. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `data-dictation-state={state.phase}` (button) | clique | toggle: parado ou com erro, confere a configuração (speech:get-config) e o microfone (speech:microphone-status, speech:request-microphone) e começa a gravar; gravando, para, transcreve no processo principal (speech:transcribe) e entrega o texto sem Enter: digita na gaveta aberta (pty:write via typeText) ou, sem gaveta, copia para a área de transferência. (desabilitado: transcrevendo) | Cada recusa vira state.phase "error" com a mensagem; a entrega que falha no terminal diz "O texto foi copiado." sem copiar (ver lacuna). | — |
| `Descartar gravação` (button) | clique | cancel: para o gravador sem transcrever (recorder.cancel) e volta ao estado parado. (desabilitado: só aparece gravando) | Sem falha própria. | — |
| `onClick={dismiss}` (button) | clique | Fechar do aviso: dispatch "dismiss" e limpa o notice; o balão some. (desabilitado: só aparece com erro ou aviso) | Sem falha própria. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| O balão de erro e de aviso do ditado (absolute top-full, DictationButton.tsx:66) fica abaixo da barra superior, que tem overflow: hidden (index.css:3216): a mensagem é recortada e não aparece. A pessoa não vê por que o ditado falhou (sem chave, microfone negado). | alto | `3ec91f95-497e-8103-b360-c1979d6992f4` |
| Quando typeText falha, o aviso diz "Não consegui digitar no terminal. O texto foi copiado." mas nada é copiado (CanvasView.tsx:1839): o texto ditado se perde. | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Nenhum teste de interface do ditado (gravar, transcrever, descartar, fechar o aviso, atalho global). | baixo | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| A transcrição pela nuvem pode cobrar e não pede confirmação. | baixo | `3e991f95-497e-8172-b092-f3aa9f111ccc` |

### Barra de status

- **ID:** `chrome-statusbar` · **Dono:** `src/features/canvas/components/CanvasStatusBar.tsx`
- **Persistência:** nenhuma (só exibe o estado do canvas)
- **IPC:** `canvas:delete`, `canvas:delete-edge`
- **Depende de:** `summarizeCanvasSelection`, `removeSelection (CanvasView)`
- **Sobreposição:** footer absolute bottom 0, left var(--felixo-sidebar-width) (3.25rem recolhida), right 18rem (1rem com o inspector no puck), z-18, pointer-events só no botão. Fica sob sidebar (26), dock e painéis (20/30); a pílula de zoom fica logo acima (margem statusbar + 0,5rem).
- **Testes:** `src/features/canvas/components/CanvasStatusBar.test.ts`, `src/features/canvas/services/canvas-selection.test.ts`, `scripts/canvas-smoke.cjs` → `checarMontagem`, `scripts/canvas-smoke.cjs` → `checarMatrizVisual`

| Estado | Quando |
| --- | --- |
| normal | "Canvas pronto", "N blocos" e "N conexões"; com seleção, a frase da seleção e o botão Remover. |
| loading | hydrated && edgesHydrated falso: "Carregando canvas…". |
| disabled | Canvas travado (removeDisabled = canvasLocked): Remover desabilitado com "Destrave o canvas para remover". |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-keyshortcuts="Delete Backspace"` (button) | clique | Remover: removeSelection chama deleteElements do React Flow com os blocos e conexões selecionados (o mesmo caminho da tecla Delete): onNodesChange apaga o bloco (canvas:delete, sessão do terminal liberada) e onEdgesChange apaga as conexões (canvas:delete-edge). (desabilitado: canvas travado; some sem seleção) | Sem seleção não faz nada; falha de canvas:delete ou canvas:delete-edge é engolida (best effort) e o item volta no próximo carregamento. | `src/features/canvas/components/CanvasStatusBar.test.ts` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| A barra encolhe para 160 px e quebra com a gaveta do terminal aberta. | médio | `3e791f95-497e-81bd-8e8c-de6f9e16cec5` |
| O clique em Remover não é exercitado: o teste só renderiza o botão (rótulo, atalho e desabilitado). | baixo | `3ec91f95-497e-818f-b9f2-f9710605c303` |

### Pílula de zoom

- **ID:** `chrome-zoom-pill` · **Dono:** `src/features/canvas/components/CanvasZoomPill.tsx`
- **Persistência:** nenhuma (zoom, pan e trava vivem só na sessão)
- **IPC:** nenhum
- **Depende de:** `useReactFlow`, `Panel (@xyflow/react)`, `handleCanvasMove (CanvasView)`
- **Sobreposição:** Panel do React Flow (bottom-left), margem esquerda var(--felixo-sidebar-width) + 1,25rem (4,5rem recolhida) e inferior statusbar + 0,5rem. Mora dentro do wrapper do React Flow, que tem z-index 0: fica abaixo de toda a moldura (statusbar 18, dock e painéis 20/30, sidebar 26).
- **Testes:** `scripts/canvas-smoke.cjs` → `checarZoomVisual`, `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos`

| Estado | Quando |
| --- | --- |
| normal | Pílula "− N% +" no canto inferior esquerdo com Enquadrar e o cadeado; o número vem do onMove do React Flow (zoomPercent). |
| disabled | Canvas travado (locked): cadeado fechado com is-active e aria-pressed; arrastar, conectar e selecionar ficam desligados. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Reduzir zoom` (button) | clique | zoomOut({ duration: 180 }) do React Flow; o número da pílula cai (até o mínimo 5%). | Sem falha própria; no mínimo não muda. | `scripts/canvas-smoke.cjs` → `checarZoomVisual` |
| `Aumentar zoom` (button) | clique | zoomIn({ duration: 180 }) do React Flow; o número da pílula sobe. | Sem falha própria; no máximo não muda. | — |
| `Enquadrar todos os blocos` (button) | clique | fitView({ padding: 0.15, duration: 240 }) do React Flow: enquadra todos os blocos no container inteiro. | Não desconta a área útil: blocos podem ficar sob a sidebar, a topbar ou o inspector (ver lacuna). | `scripts/canvas-smoke.cjs` → `checarZoomVisual` |
| `Travar o canvas` (button) | clique | onLockedChange(!locked) → setCanvasLocked: desliga nodesDraggable, nodesConnectable, elementsSelectable e a seleção por arrasto; o Remover da statusbar fica desabilitado. | A trava não persiste e não impede Delete/Backspace de apagar a seleção feita antes de travar (ver lacuna na área do canvas). | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Enquadrar da pílula usa fitView direto (CanvasZoomPill.tsx:54), sem a área útil que o Enquadrar da sidebar usa (fitCanvasViewSafely, CanvasView.tsx:1196): o smoke de links registra que ele deixa blocos sob a barra lateral em 1280×800. | médio | `3ec91f95-497e-8103-b360-c1979d6992f4` |
| Aumentar zoom e o cadeado não são exercitados por teste. | baixo | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| Abaixo de 768 px a faixa vazia do dock de terminais (data-terminals-dock) intercepta os cliques na pílula; o smoke dispara o clique pelo DOM para contornar. | médio | `3e691f95-497e-810e-a39b-f26d90a38c8e` |
| Um painel de ferramenta alto (z-20, até viewport − 112 px, a partir da mesma borda esquerda) cobre a pílula, que está dentro do React Flow (z 0); não há teste dessa combinação. | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Área do canvas (React Flow)

- **ID:** `chrome-canvas-area` · **Dono:** `src/features/canvas/components/CanvasView.tsx`
- **Persistência:** canvas salvo (posição e tamanho ao soltar, canvas:save com debounce de 400 ms; conexões por canvas:save-edge e canvas:delete-edge na hora); nenhuma para viewport (pan e zoom), modo seleção/mover e trava
- **IPC:** `canvas:save`, `canvas:delete`, `canvas:list-edges`, `canvas:save-edge`, `canvas:delete-edge`, `canvas:image-generated`, `files:remove-generated-image`
- **Depende de:** `ReactFlow (@xyflow/react)`, `useCanvasPersistence`, `useCanvasSurfaces`, `useCanvasTransfer`, `useTerminalSessions`, `usePerformanceMode`, `getCanvasSafeArea`, `planAutoFit (viewport-auto-fit)`, `releaseRemovedCanvasNodes`
- **Sobreposição:** Região relativa (flex-1, role="region" "Área de trabalho do canvas") que contém sidebar (26), topbar e statusbar (18), dock e painéis (20/30), aviso de layout (10) e overlay isBusy (50). O wrapper do React Flow tem z-index 0: blocos, pílula de zoom e Mini Map ficam abaixo de toda a moldura, e um bloco sob ela recebe o clique da moldura. A área útil (getCanvasSafeArea) desconta topbar, statusbar, sidebar, painel e inspector; a gaveta é irmã flex fora do container. Clique direito num bloco abre o NodeColorMenu (z 50) no ponto do clique; clique no fundo fecha.
- **Testes:** `scripts/canvas-smoke.cjs` → `checarMontagem`, `scripts/canvas-smoke.cjs` → `checarNavegacaoPorTab`, `scripts/canvas-smoke.cjs` → `checarOclusaoDoFixture`, `scripts/canvas-smoke.cjs` → `checarInteracoes`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`, `scripts/canvas-smoke.cjs` → `checarViewportMinimo`, `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos`, `scripts/canvas-smoke-onboarding.cjs` → `conferirTeclasDoCanvasSobAPergunta`, `scripts/canvas-smoke-onboarding.cjs` → `sa3`, `src/features/canvas/services/canvas-interaction-geometry.test.ts`, `src/features/canvas/services/viewport-auto-fit.test.ts`, `src/features/canvas/services/canvas-selection.test.ts`, `src/features/canvas/services/canvas-node-removal.test.ts`, `src/features/canvas/services/keyboard-focus.test.ts`, `src/features/canvas/components/modal-dialogs-keys.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Blocos e conexões renderizados (só os visíveis, salvo com a gaveta aberta), modo seleção: arrastar no fundo desenha caixa de seleção parcial, Shift soma, botão do meio ou direito move a tela. |
| loading | hydrated falso: nós ainda não carregados (data-felixo-hydrated="false"); o primeiro enquadramento espera hydrated e flowReady. |
| empty | nodes.length === 0: só o fundo, a grade e a atmosfera plena (atmosfera 1); o inspector mostra "Canvas livre". |
| pending | isBusy (limpar, exportar ou importar): overlay de espera por cima da região. |
| disabled | canvasLocked: nodesDraggable, nodesConnectable, elementsSelectable e selectionOnDrag desligados. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Com o canvas travado, Delete/Backspace ainda apaga a seleção feita antes de travar: o deleteKeyCode do React Flow (CanvasView.tsx:3193) não olha a trava, enquanto o Remover da statusbar fica desabilitado ("Destrave o canvas para remover"). | médio | `3ec91f95-497e-8143-a0b4-cceb0ace7599` |
| focusNode centraliza pelo node.position (CanvasView.tsx:1753), que num filho de grupo é relativo ao grupo: o item do inspector "Elementos" e o das Notificações levam a câmera para o lugar errado quando o bloco está dentro de um grupo. | médio | `3ec91f95-497e-8103-b360-c1979d6992f4` |
| Os atalhos do canvas só têm teste negativo (Delete, Backspace e Q não agem sob um diálogo): apagar com Delete/Backspace, alternar com Q, Shift para somar à seleção e soltar um bloco num grupo não são exercitados. | médio | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| Recálculo por quadro durante o arrasto e renders nas transições de sessão. | médio | `3e991f95-497e-81c5-ad8f-f058eb3b93b7` |
| Centralizar um bloco com zoom que caiba na área livre em telas pequenas (focusNode usa zoom fixo 1,2). | médio | `3ea91f95-497e-819a-bdd9-fbc178f27b3e` |
| A visão que não reseta mais ao abrir e fechar gaveta ou painel (planAutoFit) ainda não foi conferida no app real. | baixo | `3e291f95-497e-815a-9863-d4b9f8f15e8f` |

### Mini Map

- **ID:** `chrome-minimap` · **Dono:** `src/features/canvas/components/CanvasView.tsx`
- **Persistência:** nenhuma
- **IPC:** nenhum
- **Depende de:** `MiniMap (@xyflow/react)`, `useCanvasSurfaces (minimap)`, `usePerformanceMode`, `miniMapNode (CanvasView)`
- **Sobreposição:** Panel do React Flow (bottom-right, mb-10), margem direita 19rem para não ficar sob o inspector (1rem com o puck, via :has()), opacidade 0,45 até hover/foco. Dentro do wrapper do React Flow (z 0): o dock (20) cobre o mapa se a margem falhar; o mapa cobre blocos no canto inferior direito.
- **Testes:** `src/features/canvas/services/canvas-surfaces.test.ts`, `scripts/canvas-smoke.cjs` → `checarOclusaoDoFixture`, `scripts/canvas-smoke.cjs` → `checarMatrizVisual`

| Estado | Quando |
| --- | --- |
| normal | miniMap && !performanceMode: mapa no canto inferior direito (200×150, encolhe até 96×72 com a área livre), arrastável e com zoom; terminais com o nome escrito. |
| empty | Some quando a área livre não comporta 96 px (miniMapSize devolve null). |
| disabled | Modo Performance ligado: não é renderizado. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Arrastar e dar zoom pelo Mini Map (pannable, zoomable) não é exercitado; o smoke só mede o retângulo. | baixo | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| Custo do Mini Map (re-render do miniMapNode a cada mudança de nós) e o caminho do Modo Performance sem medição nos harnesses. | baixo | `3e691f95-497e-816a-a1c9-c0b3b37c8046` |

### Inspector "Elementos"

- **ID:** `chrome-elements-inspector` · **Dono:** `src/features/canvas/components/tools/TerminalsPanel.tsx`
- **Persistência:** localStorage felixo:elements-dock-collapsed (recolhido); canvas salvo (ordem do dock em data.orderIndex, via reorderNodes → canvas:save); nenhuma para modo de envio em massa e rascunhos
- **IPC:** `pty:write`, `canvas:save`
- **Depende de:** `useCanvasSurfaces (reportInspectorWidth)`, `useTerminalSessions`, `useSessionSnapshot`, `terminals-panel-groups`, `terminals-panel-reorder`, `terminals-panel-navigation`, `terminals-panel-drafts`, `terminals-panel-collapse`
- **Sobreposição:** Wrapper data-terminals-dock absolute (top-12, bottom-7, right-0) z-20, pointer-events-none; o inspector (w-72) e o puck (bottom-3 right-3) religam os cliques. Abaixo da topbar (começa em 48 px) e acima da statusbar; topbar, statusbar e Mini Map reservam 18rem (1rem com o puck) via :has(). Publica a largura em reportInspectorWidth, que encolhe painel e gaveta.
- **Testes:** `scripts/canvas-smoke-onboarding.cjs` → `recolherInspector`, `scripts/canvas-smoke-links.cjs` → `focar`, `scripts/canvas-smoke-prompts.cjs` → `abrirTerminal`, `scripts/canvas-smoke.cjs` → `checarOclusaoDoFixture`, `src/features/canvas/components/tools/terminals-panel-collapse.test.ts`, `src/features/canvas/components/tools/terminals-panel-drafts.test.ts`, `src/features/canvas/components/tools/terminals-panel-groups.test.ts`, `src/features/canvas/components/tools/terminals-panel-navigation.test.ts`, `src/features/canvas/components/tools/terminals-panel-reorder.test.ts`, `src/features/canvas/services/canvas-surfaces.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Expandido (288 px, INSPECTOR_WIDTH) na direita: todos os blocos agrupados por pasta de trabalho e numerados (#N) na ordem do dock; recolhido, vira um puck com a contagem no canto (escolha lembrada). |
| loading | Terminal trabalhando: spinner na linha. |
| empty | Sem blocos: "Canvas livre — Crie um agente, arquivo ou grupo para começar a organizar seu fluxo." |
| error | Terminal com activity "error": ponto vermelho na linha. |
| pending | Modo de envio em massa com rascunhos: "Enviar para todos (N)". |
| disabled | "Enviar para todos" sem rascunho e o envio de uma linha com campo vazio ficam desabilitados. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Abrir elementos"` (button) | clique | Puck: toggleCollapsed expande o inspector, grava felixo:elements-dock-collapsed = "0" e publica INSPECTOR_WIDTH (reportInspectorWidth); topbar, statusbar e Mini Map voltam a reservar 18rem. (desabilitado: só visível e focável com o inspector recolhido) | Sem localStorage a escolha vale só nesta sessão. | `scripts/canvas-smoke-onboarding.cjs` → `recolherInspector` |
| `aria-label="Recolher elementos"` (button) | clique | Cabeçalho "Elementos": recolhe para o puck, grava felixo:elements-dock-collapsed = "1" e publica largura 0; painel, gaveta e Mini Map ganham o espaço. | Sem localStorage a escolha vale só nesta sessão. | `scripts/canvas-smoke-onboarding.cjs` → `recolherInspector` |
| `Alternar modo de enviar mensagens em massa` (button) | clique | Liga ou desliga o modo de envio em massa (campo de mensagem sob cada terminal); ligar com o inspector recolhido também o expande. | Sem falha própria; o modo e os rascunhos não persistem. | — |
| `onClick={sendAllDrafts}` (button) | clique | Enviar para todos: para cada rascunho não vazio, store.sendText com Enter (prompt manual) no PTY do terminal (pty:write) e limpa o rascunho. (desabilitado: nenhum rascunho pendente) | erro engolido: o resultado de sendText é ignorado e o rascunho é apagado mesmo se a entrega falhar (TerminalsPanel.tsx:193). | — |
| `onClick={onSelect}` (button) | clique | Linha do bloco: marca a linha ativa, focusNode centraliza e seleciona o bloco e, se for terminal, openTerminal abre a gaveta e marca as notificações dele como lidas. Shift+↑/↓ faz o mesmo de qualquer lugar; Alt+↑/↓ e o grip reordenam dentro da pasta (orderIndex salvo). | Bloco dentro de grupo é centralizado no lugar errado (ver lacuna de foco na área do canvas). | `scripts/canvas-smoke-links.cjs` → `focar` |
| `Enviar mensagem para` (button) | clique | Envio de uma linha (ou Enter no campo): store.sendText com Enter só para aquele terminal e limpa o rascunho. (desabilitado: campo vazio; só existe no modo de envio em massa) | erro engolido: o resultado de sendText é ignorado; o rascunho some mesmo se não chegou ao PTY. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Abaixo de 768 px a lista interna do dock intercepta cliques numa faixa da borda direita mesmo vazia (o container tem pointer-events-none, a lista não). | alto | `3e691f95-497e-810e-a39b-f26d90a38c8e` |
| Com a gaveta aberta, a lista "Elementos" cobre os painéis Prompts e Skills. | médio | `3eb91f95-497e-814a-8b2c-e471e09f6ff3` |
| Envio em massa e envio por linha apagam o rascunho sem olhar o resultado de store.sendText (TerminalsPanel.tsx:193): mensagem que não chegou ao PTY se perde sem aviso. | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Modo de envio em massa, reordenar pelo grip ou Alt+↑/↓ e Shift+↑/↓ global não são exercitados por teste de interface (só as funções puras). | baixo | `3ec91f95-497e-818f-b9f2-f9710605c303` |

### Camada de atmosfera do canvas

- **ID:** `chrome-ambient-layer` · **Dono:** `src/features/canvas/components/CanvasAmbientLayer.tsx`
- **Persistência:** nenhuma
- **IPC:** nenhum
- **Depende de:** `usePerformanceMode`, `canvas-starfield`
- **Sobreposição:** absolute inset-0 z-0, pointer-events none e aria-hidden: fica por baixo de tudo na região do canvas e não intercepta clique.
- **Testes:** `src/features/canvas/components/canvas-starfield.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Fundo preto com campo de estrelas em camadas (folha de estilo estática gerada uma vez). |
| empty | Canvas vazio: atmosfera plena (--felixo-atmosphere 1); com blocos ela recua (0,75 / 0,5 / 0,3) e a classe is-dense entra. |
| disabled | Modo Performance: o campo de estrelas não é montado; só o fundo preto. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| O caminho do Modo Performance (sem campo de estrelas) e o custo da camada não são medidos nos harnesses. | baixo | `3e691f95-497e-816a-a1c9-c0b3b37c8046` |

### Coordenação de largura das superfícies

- **ID:** `chrome-surfaces-provider` · **Dono:** `src/features/canvas/components/CanvasSurfacesProvider.tsx`
- **Persistência:** nenhuma (estado de React; as larguras escolhidas persistem em cada superfície)
- **IPC:** `qa-logger:log`
- **Depende de:** `CanvasSurfacesContext`, `splitHorizontalSpace`, `detectLiveLayoutClamp`, `freeCanvasArea`, `miniMapSize`, `dockReservedBottom`
- **Sobreposição:** Sem superfície própria; é ele que impede painel, gaveta e inspector de se cobrirem (MIN_CANVAS_STRIP 160 px). Em janelas menores que a soma dos mínimos o painel não cede de 260 px e passa da viewport.
- **Testes:** `src/features/canvas/services/canvas-surfaces.test.ts`, `src/features/canvas/services/layout-invariants.test.ts`, `scripts/canvas-smoke.cjs` → `checarPainelNosDoisEixos`, `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos`

| Estado | Quando |
| --- | --- |
| normal | Painel, gaveta e inspector publicam a largura desejada (reportPanelWidth, reportDrawerWidth, reportInspectorWidth) e o provider divide o espaço numa passada só (splitHorizontalSpace), com a sidebar como toolbarWidth; publica também área livre, reserva do dock e tamanho do Mini Map. |
| error | Clamp ao vivo (detectLiveLayoutClamp): a primeira entrada em cada regra vira log warn "canvas:layout-clamp" no QA Logger; falha ao gravar o log é engolida de propósito. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| O resize da janela vira um setState por evento, sem coalescer em quadro com as outras medições de superfície. | baixo | `3e691f95-497e-8116-8cbd-fad2823ce1da` |

### Aviso de pouco espaço

- **ID:** `chrome-layout-warning` · **Dono:** `src/features/canvas/components/CanvasView.tsx`
- **Persistência:** nenhuma
- **IPC:** nenhum
- **Depende de:** `canvasSurfaceLayoutWarning`, `useCanvasSurfaces`
- **Sobreposição:** pointer-events-none, absolute top-16, z-10, largura até a área livre − 32. Abaixo de painéis (20/30), sidebar (26) e topbar (18); o card do tutorial desvia dele ([data-canvas-layout-warning]).
- **Testes:** `src/features/canvas/services/canvas-surfaces.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Oculto: nenhum painel ou gaveta expandido, ou espaço suficiente para todos os mínimos. |
| error | canvasSurfaceLayoutWarning devolve texto: "Pouco espaço horizontal: recolha o painel ou o terminal…" ou "Pouco espaço vertical: role o conteúdo do painel…" (role="status", aria-live polite). |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| O aviso (z-10, top-16, left = sidebar + 16, CanvasView.tsx:2982) nasce exatamente sob o painel de ferramenta (z-20, top-16, left = sidebar + 1rem, CanvasPanel.tsx:165); com o painel expandido, a causa mais comum do aviso, ele fica coberto e não é visto. | médio | `3ec91f95-497e-8103-b360-c1979d6992f4` |

### Overlay de operação em andamento

- **ID:** `chrome-busy-overlay` · **Dono:** `src/features/canvas/components/CanvasView.tsx`
- **Persistência:** nenhuma
- **IPC:** nenhum
- **Depende de:** `useCanvasTransfer`
- **Sobreposição:** z-50 dentro da região do canvas: cobre sidebar (26), topbar e statusbar (18), dock e painéis (20/30); não cobre a gaveta do terminal (irmã fora do container) nem diálogos (60).
- **Testes:** nenhum

| Estado | Quando |
| --- | --- |
| normal | Ausente. |
| pending | isBusy (isClearing ou isTransferring): div absolute inset-0 z-50 com cursor de espera e aria-hidden por cima da região do canvas. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| O overlay não tem teste: nada confere que ele aparece em limpar, exportar ou importar nem que some ao terminar. | baixo | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| O overlay só bloqueia o ponteiro: o teclado continua chegando ao canvas (Delete, Ctrl/Cmd+K, Q) durante limpar ou importar, e a gaveta do terminal fica fora dele. | baixo | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Persistência do canvas

- **ID:** `chrome-canvas-persistence` · **Dono:** `src/features/canvas/hooks/useCanvasPersistence.ts`
- **Persistência:** processo principal: SQLite do canvas (canvas-repository), nós por canvas:save/canvas:delete e conexões por canvas:save-edge/canvas:delete-edge
- **IPC:** `canvas:list`, `canvas:save`, `canvas:delete`, `canvas:agent-node-updated`, `canvas:list-edges`, `canvas:save-edge`, `canvas:delete-edge`
- **Depende de:** `canvas-storage`, `sortByOrderIndex`, `withOrderIndex`, `toPersistedNode`, `toFlowNode`
- **Sobreposição:** Sem superfície própria; o estado aparece na barra de status ("Carregando canvas…"/"Canvas pronto") e em data-felixo-hydrated na raiz do canvas.
- **Testes:** `src/features/canvas/hooks/useCanvasPersistence.test.ts`, `electron/services/canvas-ipc-handlers.test.cjs`, `scripts/canvas-smoke.cjs` → `checarInteracoes`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`

| Estado | Quando |
| --- | --- |
| normal | Carregado: nós ordenados por data.orderIndex (a ordem carregada é carimbada e regravada uma vez); cada mudança de posição, tamanho ou dados salva com debounce de 400 ms por nó; escrita confirmada de agente (canvas:agent-node-updated) cancela o save pendente daquele nó. |
| loading | Antes de canvas:list responder: hydrated falso, nós vazios. |
| empty | canvas:list devolve lista vazia — ou falha (ver lacuna): os dois casos ficam iguais na tela. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| erro engolido: falha de canvas:list (ok:false ou exceção) vira lista vazia (canvas-storage.ts:23-27, useCanvasPersistence.ts:30): o canvas abre vazio com "Canvas pronto", sem aviso, e a reconciliação do histórico de notificações apaga as notificações dos terminais "sumidos". | alto | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| erro engolido: deleteCanvasNode, saveCanvasEdge e deleteCanvasEdge ignoram o ok:false e caem em catch "Best effort" (canvas-storage.ts:61, 181, 195); saveCanvasNode só escreve no console. Bloco apagado volta e conexão criada some no próximo carregamento, sem aviso. | médio | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| Ao desmontar (trocar para o Chat, recarregar), o cleanup cancela os saves com debounce ainda pendentes em vez de gravá-los (useCanvasPersistence.ts:54): a última mudança de até 400 ms se perde. | médio | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| Laço de canvas:save que reprova o SA1 do tutorial no Windows e no macOS. | médio | `3ea91f95-497e-812a-8c6d-fcc953edc59b` |

### Indicador da instalação das CLIs no rodapé da sidebar

- **ID:** `cli-setup-indicador` · **Dono:** `src/features/setup/CliSetupNotice.tsx`
- **Persistência:** processo principal: estado das tentativas de instalação (arquivo de estado do cli-auto-install em userData)
- **IPC:** `clis:get-setup-status`, `clis:setup-status`, `clis:retry-setup`
- **Depende de:** `useCliSetupStatus`, `presentCliSetupStatus`, `deveMostrarRodapeDeStatus (CanvasToolbar)`
- **Sobreposição:** No rodapé da sidebar (z 26), coluna de 288 px; o rótulo é truncado e não cobre o canvas.
- **Testes:** `src/features/setup/cli-setup-presentation.test.ts`, `src/features/canvas/components/toolbar-status.test.ts`, `electron/services/cli-auto-install.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Estado "idle" ou "disabled" (app do código-fonte): nenhum indicador. |
| loading | Estado "checking": "Verificando CLIs…" com o ícone girando, como rótulo (não é botão). |
| error | Estado "error": vira botão com AlertTriangle, a descrição no title e "Clique para tentar instalar de novo." |
| pending | Estado "installing": rótulo com o andamento da fila, como rótulo (não é botão). |
| success | Estado "done": CheckCircle2 e o resumo; o detalhe fica no title. |
| disabled | Sidebar recolhida: o rodapé fica aria-hidden e inert. O rodapé de status só é desenhado com a versão do app ou o indicador de atualização visível (deveMostrarRodapeDeStatus), por decisão registrada em toolbar-status.ts. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Clique para tentar instalar de novo.` (button) | clique | retry() → window.felixo.cliSetup.retry() → clis:retry-setup: o processo principal roda run("manual") e o novo status chega por clis:setup-status (indicador e aviso passam a "installing"). (desabilitado: só é botão no estado "error" (canRetry)) | Erro engolido: o retorno é descartado (void). Com a instalação automática desligada o main devolve { ok: false } sem emitir status e o clique não muda nada; exceção vira unhandledrejection só no QA Logger. Lacuna registrada no aviso das CLIs. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum smoke mostra o indicador: fora do app empacotado a instalação automática é "disabled" e tudo fica oculto. | médio | `3e691f95-497e-81c8-ba05-c3074dc036f0` |

### Indicador de atualização, Verificar atualizações e versão no rodapé da sidebar

- **ID:** `atualizacao-indicador` · **Dono:** `src/features/updates/UpdateNotice.tsx`
- **Persistência:** nenhuma no renderer; o download fica com o electron-updater no processo principal
- **IPC:** `updates:get-status`, `updates:status`, `updates:check`, `updates:install`, `app:get-version`
- **Depende de:** `useUpdateStatus (CanvasView)`, `useAppVersion (CanvasToolbar)`, `presentUpdateStatus`, `deveMostrarRodapeDeStatus`
- **Sobreposição:** No rodapé da sidebar (z 26), coluna de 288 px; rótulo truncado, nada sobre o canvas. O aviso flutuante de atualização foi para as notificações do canvas (CanvasView).
- **Testes:** `src/features/updates/update-presentation.test.ts`, `src/features/canvas/components/toolbar-status.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Estado "idle": só a versão (AppVersionBadge) e o botão "Verificar atualizações" (canCheck). |
| loading | Estado "checking": "Verificando…" como rótulo, sem ação. |
| empty | Sem versão (fora do Electron ou IPC sem resposta) e sem indicador: o rodapé de status não é desenhado. |
| error | Estado "error": vira botão "Falha ao atualizar" com a mensagem no title e "Clique para verificar de novo." |
| pending | Estados "available"/"downloading": "Versão X baixando" ou "Baixando n%" com o ícone girando, sem ação. |
| success | Estado "downloaded": vira botão "Versão X pronta" (title "Reiniciar agora para aplicar a atualização"). |
| disabled | Estado "disabled" (app do código-fonte): nada. Sidebar recolhida: rodapé aria-hidden e inert. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={action.onClick}` (button) | clique | "downloaded": onInstall → updates.install() → updates:install → autoUpdater.quitAndInstall(false, true): o app fecha e reabre na versão nova. "error": onRetry → updates.check() → updates:check → status "checking" por updates:status. (desabilitado: só é botão com canInstall ou canRetry) | Erro engolido na instalação: retorno descartado (void); fora de "downloaded" o main devolve { ok: false } sem mudar a tela e uma exceção de quitAndInstall vira unhandledrejection só no QA Logger. Na verificação, a falha volta como status "error" (visível). | — |
| `Verificar atualizações` (button) | clique | onCheck → updates.check() → updates:check → autoUpdater.checkForUpdates; o evento checking-for-update emite status por updates:status e o botão some (canCheck falso). (desabilitado: só no estado "idle" (canCheck)) | Falha da verificação vira status "error" emitido por updates:status (indicador "Falha ao atualizar"); fora do app empacotado o main responde "disabled" e tudo some. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum teste renderiza ou clica o indicador e electron/services/auto-updater.cjs não tem teste; o ciclo verificar → baixar → reiniciar só é visto no app publicado. | médio | `3ec91f95-497e-81f7-8b12-c5c252d020c7` |
| Erro engolido em useUpdateStatus.ts:68 (install sem tratar { ok: false } nem a rejeição) e :41 (getStatus inicial sem catch): a pessoa clica "Versão X pronta" e, se o main recusar, nada acontece na tela. | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

## Blocos

### Bloco Terminal (cartão recolhido do agente)

- **ID:** `bloco-terminal` · **Dono:** `src/features/canvas/components/TerminalNode.tsx`
- **Persistência:** canvas salvo (canvas_nodes.data_json: label, command, args, cwd, accountId/accountMode, agentSession, resumeFailure, lastPromptInsertion só com metadata, sessionStartedAt, chainSuccessorNodeId, frameColor); processo principal: PTY vivo no pty-process-manager (sobrevive a reload da interface e à ida ao chat); memória do renderer: resumeChoice no terminalRunRegistry (TRANSIENT_DATA_KEYS, nunca vai ao disco)
- **IPC:** `pty:spawn`, `pty:kill`, `pty:write`, `pty:data`, `pty:exit`, `pty:session`, `account-chain:get-state`, `account-chain:changed`, `account-chain:decline`, `account-chain:resolve-ambiguous`, `account-chain:release-cooldown`, `canvas:save`, `canvas:delete`
- **Depende de:** `useTerminalSessions`, `useSessionSnapshot`, `useSessionMetadata`, `usePerformanceMode`, `useReactFlow`, `useCliAccountLabel`, `useAccountChain`, `useAccountChainActions (AccountChainActionsContext)`, `visibleTerminalResumeBanner (terminal-resume-banner)`, `buildTerminalChainBanners (account-chain-view)`, `relaunchTerminal / handleResumeAction (CanvasView)`
- **Sobreposição:** Bloco do React Flow, sem z próprio: fica abaixo de toda superfície fixa (topbar e statusbar 18, dock e painéis 20/30, sidebar 26, menus 50+). O cartão é overflow-hidden, então nada que nasce dentro dele passa das bordas. Faixas de retomada e da cadeia vivem dentro do cartão (nodrag nowheel nopan). A gaveta do terminal (coluna à direita) e a dock de terminais recolhidos cobrem o bloco quando ele cai embaixo delas.
- **Testes:** `src/features/canvas/services/terminal-resume-banner.test.ts`, `src/features/canvas/services/account-chain-view.test.ts`, `src/features/canvas/services/terminal-run-registry.test.ts`, `src/features/canvas/services/repository-grouping.test.ts`, `src/features/canvas/terminal/terminal-session-store.test.ts`, `src/features/canvas/terminal/terminal-scrollback.test.ts`, `src/features/canvas/terminal/prompt-origins-e2e.test.ts`, `scripts/canvas-smoke.cjs` → `prepararFixture`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`, `scripts/canvas-smoke.cjs` → `checarInteracoes`, `scripts/canvas-smoke.cjs` → `checarVariosAgentes`, `scripts/canvas-smoke-contas.cjs` → `abrirBlocoDaCadeia`, `scripts/canvas-smoke-prompts.cjs` → `esperarCartao`

| Estado | Quando |
| --- | --- |
| normal | Processo de pé: selo "trabalhando" (spinner) ou "aguardando" (ponto), contexto (#índice, repositório, modelo, selo da conta), último prompt (data-felixo-last-prompt) e as últimas linhas da saída na prévia — com a Leitura ligada no bloco (readingMode), a prévia é o fim da última fala desenhado como texto com estilo (TerminalReadingPreview, data-felixo-reading-preview), sem link nem botão dentro do botão do cartão. |
| loading | activity "starting" (selo "iniciando…") enquanto o PTY sobe ou enquanto initialTextReady é falso (arestas e arquivos do canvas ainda resolvendo, versão da CLI chegando); antes da primeira linha a prévia diz o que o spawn faz (describeTerminalResumeStart). |
| empty | Sem nenhuma linha de saída: "Sem saída ainda…". |
| error | activity "error" (selo "erro"), activity "exited" com código ≠ 0, ou snapshot.message em vermelho na prévia; erro de uma ação da cadeia em role="alert". |
| pending | activity "waiting_approval" (selo "aguardando aprovação"), ou retomada pendente sem processo: selo "aguardando escolha" + faixa de retomada (data-terminal-resume-banner) e a prévia "Nada foi iniciado: escolha acima como abrir a conversa.". |
| success | activity "exited" com código 0: selo "encerrado (0)", a prévia guarda as últimas linhas. |
| denied | A CLI recusou a retomada (resumeFailure: conversa inexistente ou login) e a faixa oferece "Tentar retomar de novo"; ou a cadeia detectou limite de conta e a faixa oferece "Ver opções". |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Reiniciar terminal"` (button) | clique | Com retomada pendente não derruba nada: revela a faixa de retomada (mesmo guardada com o agente de pé) e foca o primeiro botão dela. Senão pede window.confirm se o processo está vivo e chama onRestart → relaunchTerminal: store.restart mata e sobe o PTY (pty:kill + pty:spawn) pelo plano de retomada e grava sessionStartedAt no bloco. | Cancelar o confirm não faz nada. Falha do spawn aparece no cartão (selo "erro", snapshot.message). Se o plano segura ("held", ex.: esperando a versão da CLI com a faixa ainda nula) ou o bloco sumiu ("missing"), nada acontece e nada avisa. | — |
| `aria-label="Ver detalhes do terminal"` (button) | clique | onDetails → setDetailsTerminalId: abre o painel de detalhes (TerminalDetailsPanel) deste bloco. | Sem falha própria (estado local do canvas). | — |
| `aria-label="Expandir terminal"` (button) | clique | onExpand → openTerminal: abre a gaveta TerminalDrawer com o xterm vivo deste bloco e foca o terminal; ao fechar a gaveta o foco volta a este botão (data-terminal-expand-trigger). | Sem falha própria: o PTY segue no store com ou sem a gaveta. | `scripts/canvas-smoke.cjs` → `checarInteracoes` |
| `onClick={() => runResumeAction(action.id)}` (button) | clique | Botões da faixa de retomada ("Escolher na lista (/resume)", "Abrir conversa nova", "Tentar retomar de novo", "Dispensar aviso"). Os que relançam pedem confirm com processo vivo; onResumeAction → handleResumeAction grava resumeChoice (transitória, só no registro da execução) ou limpa resumeFailure (persistida) e relança pelo mesmo plano do Reiniciar. "Dispensar aviso" só limpa a falha, o agente de pé continua. (desabilitado: Só existe com a faixa de retomada visível.) | Cancelar o confirm não faz nada. Se a CLI recusar de novo, onResumeFailure grava a falha e a faixa volta com o motivo. | — |
| `chainActions.onBannerAction({` (button) | clique | Ações das faixas da cadeia de contas (BANNER_ACTION_LABELS, via useAccountContinuation.onBannerAction): "Ver opções" abre o diálogo de troca de conta; "Não era limite" recusa a proposta ou solta a espera (account-chain:decline / release-cooldown); "Sim, tratar como limite" e "Ignorar" resolvem a detecção ambígua (account-chain:resolve-ambiguous); "Dispensar" só limpa a detecção local; "Refazer login neste terminal" abre a gaveta; "Passar responsabilidade…" abre o Handoff; "Ir para o bloco novo" foca o sucessor. (desabilitado: Só existe com AccountChainActionsContext e uma faixa com ações.) | A mensagem de erro da ação aparece no cartão em role="alert" (chainActions.errorFor). Sem o contexto da cadeia os botões não aparecem. | `scripts/canvas-smoke-contas.cjs` → `confirmarTroca` |
| `aria-label={`Abrir ${nodeData.label \|\| provider.label}`}` (button) | clique | A prévia inteira é um botão: onExpand abre a gaveta do terminal, como o Expandir. Mostra selo de atividade, último prompt, aviso de contexto (data-felixo-context-warning), aviso de scrollback cortado e as últimas linhas. | Sem falha própria. No bloco mínimo (200×120), faixas de retomada e da cadeia espremem a prévia até ela sumir. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| A faixa de retomada (data-terminal-resume-banner) e os botões dela só têm teste da lógica (terminal-resume-banner.test.ts); nenhum smoke clica neles. | médio | `3eb91f95-497e-811b-8eb0-e620c6f37e21` |
| O relançamento automático do Codex não respeita a escolha feita na faixa de retomada. | médio | `3eb91f95-497e-8178-bc58-cd545a4f4cc8` |
| Selo "trabalhando" grudado com o terminal parado (ActivityBadge lê snapshot.activity). | médio | `3d791f95-497e-8190-84e0-df5328591a14` |
| Reiniciar terminal, Ver detalhes e a prévia ("Abrir …") não são clicados por nenhum teste; o confirm do processo vivo e o caminho "held" silencioso não têm cobertura. | médio | `3ec91f95-497e-8141-b6c1-d1833aac5664` |
| Remover o bloco (X do cabeçalho, TerminalNode.tsx:291-294) chama store.remove e mata o PTY sem confirmar, enquanto o Reiniciar pede confirm com o processo vivo. | médio | `3ec91f95-497e-8143-a0b4-cceb0ace7599` |
| No bloco mínimo (200×120) a faixa de retomada (até 4 linhas + botões) e as faixas da cadeia empurram a prévia para fora do cartão overflow-hidden; nenhum teste mede. | baixo | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Bloco Nota (markdown)

- **ID:** `bloco-nota` · **Dono:** `src/features/canvas/components/NoteNode.tsx`
- **Persistência:** canvas salvo (canvas_nodes.data_json: text, label, color, frameColor); modo visualizar: nenhuma
- **IPC:** `canvas:save`, `canvas:delete`, `canvas:agent-node-updated`
- **Depende de:** `useReactFlow`, `resolveNoteTheme / NOTE_COLORS (note-colors)`, `DeferredMarkdownContent`, `onDataChange (updateNodeData, CanvasView)`, `onNodeUpdated (useCanvasPersistence) para a escrita aprovada de um agente`
- **Sobreposição:** Bloco do React Flow, sem z próprio: fica abaixo de toda superfície fixa (topbar e statusbar 18, dock e painéis 20/30, sidebar 26, menus 50+). O cartão é overflow-hidden, então nada que nasce dentro dele passa das bordas. Um handle de entrada à esquerda e um de saída à direita, sem id. As bolinhas de cor dividem o cabeçalho com o título editável: num bloco estreito (mín. 180) o título encolhe.
- **Testes:** `scripts/canvas-smoke.cjs` → `prepararFixture`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`, `scripts/canvas-smoke.cjs` → `checarInteracoes`, `scripts/canvas-smoke-links.cjs` → `mostrarNotaRenderizada`, `scripts/canvas-smoke-links.cjs` → `markdownComMouse`, `electron/services/canvas-agent-write.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Textarea de markdown na cor da nota (âmbar por padrão); cada tecla grava data.text. |
| loading | Na visualização, o renderizador de markdown carrega sob demanda (DeferredMarkdownContent, Suspense). |
| empty | Na visualização, texto vazio mostra "Nota vazia.". |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label={`Cor ${color}`}` (button) | clique | Cada bolinha (amber, emerald, sky, rose, zinc) grava data.color via onDataChange → updateNodeData → canvas:save; o tema do cartão, do cabeçalho e do texto muda na hora. | Falha de canvas:save só vai ao console ("[canvas] Falha ao salvar o nó"): a cor some no próximo início. | — |
| `onClick={() => setPreview((current) => !current)}` (button) | clique | Alterna edição ↔ visualização (aria-label "Visualizar nota" / "Editar nota"); na visualização o markdown é renderizado e os links abrem o menu de destino de link. | Sem falha própria (estado local, não persiste: a nota reabre em edição). | `scripts/canvas-smoke-links.cjs` → `mostrarNotaRenderizada` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Trocar a cor da nota não tem teste; a ressincronização do texto escrito por um agente (lastSyncedTextRef, NoteNode.tsx:45-51) só é testada no processo principal, nunca na tela: uma regressão faria a próxima tecla apagar a escrita aprovada. | médio | `3ec91f95-497e-8141-b6c1-d1833aac5664` |

### Bloco Grupo (moldura)

- **ID:** `bloco-grupo` · **Dono:** `src/features/canvas/components/GroupNode.tsx`
- **Persistência:** canvas salvo (canvas_nodes: label, posição, tamanho; os filhos guardam parent_id)
- **IPC:** `canvas:save`, `canvas:delete`, `canvas:delete-edge`, `pty:kill`, `files:remove-generated-image`
- **Depende de:** `useReactFlow`, `NODE_DRAG_HANDLE_CLASS (NodeHeader)`, `onDataChange (updateNodeData, CanvasView)`
- **Sobreposição:** Grupos renderizam antes dos outros blocos (orderedNodes) e ficam por baixo deles; sem z próprio. O smoke confere que o grupo do fixture não fica sob topbar, sidebar, statusbar, inspector e minimapa (checarOclusaoDoFixture).
- **Testes:** `scripts/canvas-smoke.cjs` → `prepararFixture`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`, `scripts/canvas-smoke.cjs` → `checarInteracoes`, `scripts/canvas-smoke.cjs` → `checarOclusaoDoFixture`, `scripts/canvas-smoke.cjs` → `checarZoomVisual`, `electron/services/storage/canvas-repository.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Moldura tracejada com o título editável (padrão "Grupo") na barra de arrasto; o resto é área livre para soltar blocos. |
| empty | Grupo sem filhos: só a moldura. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Remover grupo"` (button) | clique | deleteElements do grupo: o React Flow leva junto todos os filhos (parentId) e as arestas deles; onNodesChange encerra o PTY dos terminais filhos (store.remove), apaga imagens temporárias (files:remove-generated-image) e chama canvas:delete de cada um. | Sem confirmação nem desfazer. Falha de canvas:delete é engolida (deleteCanvasNode com catch vazio) e o bloco reaparece no próximo início. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Remover grupo (GroupNode.tsx:60) apaga em cascata todos os blocos filhos, inclusive terminais com processo vivo e imagens temporárias no disco, sem confirmar e sem dizer quantos blocos vão junto (getElementsToRemove do @xyflow inclui quem tem parentId; CanvasView.tsx:2181-2199). | alto | `3ec91f95-497e-8143-a0b4-cceb0ace7599` |
| Com o canvas travado (cadeado da pílula de zoom), o X dos blocos e o "Remover grupo" continuam removendo: só a seleção e o Remover da barra de status respeitam o cadeado (NodeHeader.tsx:61-72, GroupNode.tsx:57-64; CanvasView.tsx:3200-3202 e 3269). | médio | `3ec91f95-497e-8143-a0b4-cceb0ace7599` |
| Remover grupo e renomear o grupo não são exercitados por nenhum teste (o smoke só seleciona e mede o grupo vazio). | médio | `3ec91f95-497e-8141-b6c1-d1833aac5664` |

### Bloco Arquivo (.md do app, arquivo externo ou imagem)

- **ID:** `bloco-arquivo` · **Dono:** `src/features/canvas/components/FileNode.tsx`
- **Persistência:** canvas salvo (canvas_nodes.data_json: fileName ou filePath, fileLabel, fileKind, image, mode, label, frameColor); disco: .md da pasta do app (canvas-file:write) ou o arquivo externo autorizado (text-file:write); SQLite canvas_edges para os agentes ligados; edição, zoom e menu de agentes: nenhuma
- **IPC:** `canvas-file:read`, `canvas-file:write`, `canvas-file:resolve`, `canvas-file:watch`, `canvas-file:unwatch`, `canvas-file:changed`, `text-file:read`, `text-file:write`, `text-file:watch`, `text-file:unwatch`, `text-file:changed`, `files:read-image-attachment`, `files:open-image`, `files:save-image-copy`, `files:duplicate-image`, `files:pick-image`, `files:remove-generated-image`, `canvas:save`, `canvas:delete`, `canvas:save-edge`, `canvas:delete-edge`, `pty:write`
- **Depende de:** `useFileNodeDocument`, `useReactFlow`, `isSafeImagePreviewMimeType / resolvePreviewKind (file-node-preview)`, `DeferredMarkdownContent`, `createCanvasConnectionIndex (connectedAgents / availableAgents)`, `requestRepoDiagnosis / announceFileNodeToTerminalNode (file-terminal-links)`, `duplicateImageNode, repairImageNode, removeTemporaryImageNode, linkAgentToFile, unlinkAgentFromFile (CanvasView)`
- **Sobreposição:** Bloco do React Flow, sem z próprio: fica abaixo de toda superfície fixa (topbar e statusbar 18, dock e painéis 20/30, sidebar 26, menus 50+). O cartão é overflow-hidden, então nada que nasce dentro dele passa das bordas. Quatro pares de handles (source + target sobrepostos em cada lado). O menu "Ligar agente" é z-10 dentro do próprio cartão e é cortado pelas bordas dele (não usa portal, ao contrário do menu de perfil da Página Web).
- **Testes:** `src/features/canvas/components/file-node-preview.test.ts`, `src/features/canvas/services/canvas-connection-index.test.ts`, `src/features/canvas/terminal/prompt-origins-e2e.test.ts`, `electron/services/canvas-files-ipc-handlers.test.cjs`, `electron/services/text-file-access.test.cjs`, `electron/services/file-attachments-ipc-handlers.test.cjs`, `scripts/canvas-smoke.cjs` → `prepararFixture`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`

| Estado | Quando |
| --- | --- |
| normal | Conteúdo do arquivo: markdown renderizado (.md) ou texto puro em <pre>; edição na textarea grava no disco 300 ms depois da última tecla. Imagem: preview com zoom, metadados e ações. |
| loading | Imagem: "Carregando preview…" enquanto files:read-image-attachment responde. |
| empty | Arquivo vazio: "Arquivo vazio. Clique no lápis para editar."; sem agente: "Nenhum agente ligado ainda."; menu sem terminais: "Nenhum agente disponível. Crie um terminal primeiro.". |
| error | Arquivo externo ilegível: faixa vermelha com document.error. Imagem: "A referência da imagem não está disponível neste canvas.", "Preview de imagem indisponível nesta janela.", "O arquivo não é uma imagem válida ou está corrompido." e "Referência local indisponível — selecione reparar.". |
| pending | "Solicitando…" (diagnóstico), "Duplicando…" e "Reparando…" com o botão desabilitado. |
| success | Feedback em texto: "Diagnóstico solicitado ao terminal conectado.", "Imagem aberta no sistema.", "Cópia salva.", "Imagem duplicada no canvas.", "Referência da imagem reparada."; ✓ no Copiar caminho por 1,5 s. |
| disabled | Zoom sem preview ou no limite; ações da imagem sem caminho; diagnóstico enquanto solicita. |
| denied | Formato sem preview seguro (isSafeImagePreviewMimeType recusa: "use abrir ou salvar uma cópia"); diagnóstico sem terminal ligado: "Ligue este arquivo a um terminal com agente primeiro.". |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Copiar caminho"` (button) | clique | Copia o caminho absoluto do arquivo (canvas-file:resolve ou filePath) com navigator.clipboard e mostra ✓ por 1,5 s. | Erro engolido: sem caminho não faz nada; sem navigator.clipboard mostra ✓ sem copiar; writeText rejeitado vira unhandledrejection (void copyPath()), sem aviso. | — |
| `onClick={() => setEditing((value) => !value)}` (button) | clique | Alterna edição ↔ visualização ("Editar" / "Visualizar como markdown" / "Visualizar texto"); editando, cada tecla chama useFileNodeDocument.save, que grava no disco (canvas-file:write ou text-file:write) 300 ms depois e na saída do bloco. (desabilitado: Some em bloco de imagem.) | Erro engolido: o resultado de canvas-file:write/text-file:write não é conferido; a tela mostra o texto e o disco pode não ter recebido. | — |
| `onClick={() => setMode('scratchpad')}` (button) | clique | Grava data.mode = "scratchpad" (onDataChange → canvas:save), limpa o feedback de diagnóstico e esconde "Gerar diagnóstico". (desabilitado: Some em arquivo externo e em imagem.) | Falha de canvas:save só vai ao console. | — |
| `onClick={() => setMode('plan')}` (button) | clique | Grava data.mode = "plan" e mostra o botão "Gerar diagnóstico". (desabilitado: Some em arquivo externo e em imagem.) | Falha de canvas:save só vai ao console. | — |
| `onClick={() => void generateDiagnosis()}` (button) | clique | requestRepoDiagnosis: acha o primeiro terminal ligado, resolve o caminho do .md (canvas-file:resolve) e digita no agente o prompt de diagnóstico com Enter (pty:write); mostra o feedback do status (ok, no-terminal, no-file, resolve-failed). (desabilitado: Enquanto solicita; só existe no modo Plano.) | try/finally sem catch: rejeição do resolve vira unhandledrejection e nenhum feedback aparece. "ok" sai sem esperar a entrega ao PTY. | — |
| `title="Escolher novamente o arquivo de imagem"` (button) | clique | "Reparar referência": abre o seletor de imagem (files:pick-image) e grava filePath, fileLabel, fileKind e image (local-image, não temporária) no bloco; o preview recarrega. (desabilitado: Enquanto repara; só aparece quando não há preview.) | Cancelar ou falha: "A imagem não foi reparada." (repairImageNode devolve false; o IPC tem .catch). | — |
| `aria-label="Diminuir zoom"` (button) | clique | Zoom do preview −25% (mínimo 50%), estado local; atalho "-" com o preview focado. (desabilitado: Sem preview ou em 50%.) | Sem falha própria. | — |
| `aria-label="Aumentar zoom"` (button) | clique | Zoom do preview +25% (máximo 300%), estado local; atalhos "+"/"=". (desabilitado: Sem preview ou em 300%.) | Sem falha própria. | — |
| `aria-label="Redefinir zoom"` (button) | clique | Volta o zoom do preview a 100%; atalho "0". (desabilitado: Sem preview ou já em 100%.) | Sem falha própria. | — |
| `title="Abrir a imagem no aplicativo padrão do sistema"` (button) | clique | "Abrir no sistema": files:open-image com o caminho absoluto; feedback "Imagem aberta no sistema." ou a mensagem do processo principal. (desabilitado: Sem caminho.) | Sem a API não faz nada; rejeição do IPC não é tratada (unhandledrejection, sem feedback). | — |
| `title="Salvar uma cópia da imagem"` (button) | clique | "Salvar cópia": files:save-image-copy abre o diálogo de salvar; feedback "Cópia salva." ou a mensagem de erro; cancelar não mostra nada. (desabilitado: Sem caminho.) | Sem a API não faz nada; rejeição do IPC não é tratada. | — |
| `title="Criar uma cópia interna deste artefato"` (button) | clique | "Duplicar": files:duplicate-image copia o arquivo e cria um bloco de imagem novo 32 px à direita deste; feedback "Imagem duplicada no canvas.". (desabilitado: Sem caminho ou duplicando.) | "Não foi possível duplicar a imagem." (duplicateImageNode tem .catch e devolve false). | — |
| `title="Remover o arquivo temporário e este bloco"` (button) | clique | "Remover temporário": files:remove-generated-image apaga o arquivo do disco e, se der certo, tira o bloco, as arestas dele (canvas:delete-edge) e o registro (canvas:delete). Sem confirmação. (desabilitado: Sem caminho; só aparece em imagem temporária.) | "Não foi possível remover o arquivo temporário." quando o processo principal recusa; rejeição fora do .catch interno não tem tratamento. | — |
| `aria-label={`Desligar ${agent.label}`}` (button) | clique | Um por agente ligado: unlinkAgentFromFile remove todas as arestas entre o arquivo e o terminal (estado e canvas:delete-edge); o agente some de "Agentes ligados". O agente não é avisado. (desabilitado: Some sem onUnlinkAgent; fica invisível (opacity-0) até o hover, inclusive com foco de teclado.) | Erro engolido: deleteCanvasEdge tem catch vazio e a aresta pode voltar no próximo início. | — |
| `title="Ligar este arquivo a um agente do canvas"` (button) | clique | "Ligar agente": abre/fecha o menu com os terminais ainda não ligados; clique fora fecha. (desabilitado: Some sem onLinkAgent e em imagem.) | Sem falha própria. O menu abre para cima dentro do cartão overflow-hidden e pode ser cortado num bloco baixo. | — |
| `onClick={() => onLink(agent.id)}` (button) | clique | Um por terminal disponível: linkAgentToFile cria a aresta (canvas:save-edge) se faltar e digita no agente o aviso do arquivo com Enter (announceFileNodeToTerminalNode → pty:write); fecha o menu. | Erro engolido: saveCanvasEdge tem catch vazio; arquivo externo (sem fileName) ou resolve falho não avisam o agente e nada diz isso. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum dos 16 controles do bloco é clicado por teste: modos, diagnóstico, ações de imagem, zoom e ligar/desligar agente são efeito lido no código. | médio | `3ec91f95-497e-8141-b6c1-d1833aac5664` |
| Gravação do arquivo sem retorno (useFileNodeDocument.ts, função write do save): o resultado de text-file:write/canvas-file:write é ignorado e a leitura do .md do app ignora falha; a pessoa edita, a tela mostra o texto e o disco pode não ter recebido nada. | alto | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| Promessas sem catch em FileNode.tsx:239-309: copyPath, openImageInSystem, saveImageCopy e removeTemporaryImage não tratam rejeição; generateDiagnosis, duplicateImage e repairImage usam try/finally sem catch. A rejeição vira unhandledrejection e o bloco não diz nada; copyPath mostra ✓ mesmo sem navigator.clipboard. | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| requestRepoDiagnosis (services/file-terminal-links.ts:125-135) devolve "ok" sem esperar o resultado de store.sendText: "Diagnóstico solicitado ao terminal conectado." aparece mesmo se o pty:write falhar. | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Botão "Desligar <agente>" (FileNode.tsx:816) é opacity-0 até o hover e não tem focus-visible: com teclado ele recebe foco invisível. | baixo | `3ec91f95-497e-8197-a218-ef49c302013d` |
| O menu "Ligar agente" (absolute bottom-full, max-h-44) abre para cima dentro do cartão overflow-hidden: num bloco baixo ou com muitos agentes ligados ele é cortado na borda de cima. Nenhum teste mede. | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Bloco Página Web (webview)

- **ID:** `bloco-pagina-web` · **Dono:** `src/features/canvas/components/WebpageNode.tsx`
- **Persistência:** canvas salvo (canvas_nodes.data_json: url persistível, label, profileId, frameColor); processo principal: cookies e logins na partição do perfil (persist:…); histórico de navegação: só na sessão do webview, nunca serializado
- **IPC:** `canvas:save`, `canvas:delete`, `external-links:open-failed`
- **Depende de:** `useReactFlow`, `partitionForWebviewProfile (webview-profile)`, `explainUrlInput / persistableNavigationUrl (url-utils)`, `resolveGuestSrc / shouldCreateGuest / staleGuests (webview-mount)`, `webviewLinkMenu (webview-context-menu)`, `openLinkChooser / runLinkChoice`, `WebviewProfileMenu`
- **Sobreposição:** Bloco do React Flow, sem z próprio: fica abaixo de toda superfície fixa (topbar e statusbar 18, dock e painéis 20/30, sidebar 26, menus 50+). O cartão é overflow-hidden, então nada que nasce dentro dele passa das bordas. O <webview> composita por cima do DOM do cartão e engole o mousedown nas bordas: um véu (pointer-events-auto) só liga durante o resize. Cliques dentro do guest não chegam ao document, então menus que fecham por mousedown fora (perfil) ficam abertos.
- **Testes:** `src/features/canvas/services/url-utils.test.ts`, `src/features/canvas/services/webview-mount.test.ts`, `src/features/canvas/services/webview-context-menu.test.ts`, `electron/services/webview-lifecycle.test.cjs`, `electron/services/webview-profile-partition.test.cjs`, `scripts/canvas-smoke-links.cjs` → `paginaWebBarraEBotao`, `scripts/canvas-smoke-links.cjs` → `paginaWebMenuDeLink`, `scripts/canvas-smoke.cjs` → `prepararFixture`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`

| Estado | Quando |
| --- | --- |
| normal | Webview na URL gravada (ou google.com), barra de endereço com a URL atual, título da página como rótulo enquanto a pessoa não renomeia. |
| loading | Antes do dom-ready o guest está em branco e Voltar/Avançar ficam desabilitados; não há indicador de carregamento. |
| error | did-fail-load (exceto -3, ABORTED): faixa vermelha com a descrição do erro. |
| disabled | Voltar/Avançar sem histórico (canGoBack/canGoForward falsos). |
| denied | Endereço recusado pela política de URL (explainUrlInput): faixa role="alert" "Endereço não aberto: …", aria-invalid na barra e o foco fica nela. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Voltar"` (button) | clique | webview.goBack(); did-navigate atualiza a barra, o histórico e grava a URL persistível (data.url). (desabilitado: Sem histórico para trás.) | Sem try: antes do dom-ready do guest (ex.: logo após trocar de perfil, com canGoBack ainda do guest antigo) o Electron lança síncrono. | — |
| `aria-label="Avançar"` (button) | clique | webview.goForward(); mesma atualização da barra e da URL gravada. (desabilitado: Sem histórico para frente.) | Mesmo risco do Voltar: lança antes do dom-ready. | — |
| `aria-label="Recarregar"` (button) | clique | webview.reload(); a navegação troca o texto da barra pela URL real e apaga o aviso de endereço recusado. | Sem try e sempre habilitado: clicado antes do dom-ready (página inicial carregando, guest recriado pela troca de perfil) lança síncrono. | `scripts/canvas-smoke-links.cjs` → `paginaWebBarraEBotao` |
| `aria-label="Abrir esta página no navegador"` (button) | clique | runLinkChoice("abrir-no-navegador") com a URL atual do guest (ou a última boa): window.open → o processo principal entrega ao navegador do sistema sob a política única de URL. | Recusa ou falha do sistema volta por external-links:open-failed e o LinkChooserHost avisa; URL fora da política não faz nada. | `scripts/canvas-smoke-links.cjs` → `paginaWebBarraEBotao` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Voltar e Avançar não são clicados por nenhum teste. | baixo | `3ec91f95-497e-8141-b6c1-d1833aac5664` |
| Voltar, Avançar e Recarregar (WebpageNode.tsx:319, 329, 339) chamam o guest sem try, ao contrário de navigateTo e openInExternalBrowser: antes do dom-ready o Electron lança síncrono. Recarregar fica sempre habilitado e, depois de trocar de perfil, canGoBack/canGoForward continuam com o valor do guest antigo. | médio | `3ec91f95-497e-8176-bef0-dfde828936dc` |
| Rótulo pelo título da página (WebpageNode.tsx:84 e 190-194): sem nome manual, o rótulo segue cada título durante a sessão, mas ao reabrir o app labelCustomizedRef nasce verdadeiro (há label gravado) e o rótulo trava no último título. O comentário diz "wins once". | baixo | `3ec91f95-497e-8103-b360-c1979d6992f4` |
| A URL gravada (data.url) e o .fxcanvas levam tokens de query; a leitura por agentes também. | médio | `3ea91f95-497e-8126-88c8-c6a7ce21bee0` |
| Permissões pedidas pelo site (câmera, notificação…) não perguntam à pessoa. | médio | `3ea91f95-497e-812a-bc4b-ccfe144bd56c` |
| Downloads do bloco sem política de tipo, destino e registro. | médio | `3ea91f95-497e-8155-a6bc-ea704c00ef65` |
| Popups de login (allowpopups) sem origem visível nem limite de quantidade. | médio | `3ea91f95-497e-8129-acde-f3b1049c09ed` |
| Foco no bloco Página Web que nasce fora da tela sem cobertura no smoke. | baixo | `3ea91f95-497e-81c4-84ff-f279d9ba4683` |

### Bloco Tarefas Notion (contêiner)

- **ID:** `bloco-tarefas-notion` · **Dono:** `src/features/canvas/components/NotionTasksNode.tsx`
- **Persistência:** canvas salvo (canvas_nodes: posição, tamanho, label "Tarefas Notion"); um por canvas: a ferramenta foca o existente
- **IPC:** `canvas:save`, `canvas:delete`
- **Depende de:** `useReactFlow`, `React.lazy(NotionTasksPanel)`, `openNotionTasksNode (CanvasView)`
- **Sobreposição:** Bloco do React Flow, sem z próprio: fica abaixo de toda superfície fixa (topbar e statusbar 18, dock e painéis 20/30, sidebar 26, menus 50+). O cartão é overflow-hidden, então nada que nasce dentro dele passa das bordas. Bloco grande (padrão 1040×680, mínimo 480×320). Os FelixoSelect do painel abrem em portal z 1000, acima de tudo; o seletor de colunas é absolute z-10 dentro do overflow-auto do bloco.
- **Testes:** `scripts/canvas-smoke.cjs` → `prepararFixture`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`, `scripts/canvas-smoke.cjs` → `checarAuditoriaDeAcessibilidade`

| Estado | Quando |
| --- | --- |
| normal | Cabeçalho fixo "Tarefas Notion" e o NotionTasksPanel rolando por dentro (nodrag nowheel nopan). |
| loading | Suspense do painel lazy: "Carregando tarefas do Notion…". |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Blocos lazy sem error boundary (NotionTasksNode.tsx:45-53, ExcalidrawDrawingNode.tsx:82-91): falha ao baixar o chunk ou erro de render do painel sobe até a raiz e derruba o canvas inteiro; os painéis de ferramenta têm ToolPanelErrorBoundary, os blocos não. | médio | `3ec91f95-497e-8176-bef0-dfde828936dc` |

### Bloco Desenho leve (SVG)

- **ID:** `bloco-desenho` · **Dono:** `src/features/canvas/components/DrawingNode.tsx`
- **Persistência:** canvas salvo (canvas_nodes.data_json: strokes em JSON, label, frameColor); cor e espessura da caneta: nenhuma
- **IPC:** `canvas:save`, `canvas:delete`
- **Depende de:** `useReactFlow`, `onDataChange (updateNodeData, CanvasView)`
- **Sobreposição:** Bloco do React Flow, sem z próprio: fica abaixo de toda superfície fixa (topbar e statusbar 18, dock e painéis 20/30, sidebar 26, menus 50+). O cartão é overflow-hidden, então nada que nasce dentro dele passa das bordas. O SVG ocupa o corpo (nodrag nowheel nopan, touch-none); cinco cores + três espessuras + dois botões dividem o cabeçalho com o título num bloco de mínimo 220 px.
- **Testes:** `scripts/canvas-smoke.cjs` → `prepararFixture`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`, `scripts/canvas-smoke.cjs` → `checarInteracoes`

| Estado | Quando |
| --- | --- |
| normal | Traços SVG; o traço em andamento aparece num path de prévia (data-preview) e vira traço gravado ao soltar. |
| empty | Sem traços: Desfazer e Limpar desabilitados. |
| error | data.strokes inválido vira desenho vazio sem aviso (parseStrokes devolve []) e o próximo traço sobrescreve o dado. |
| disabled | Desfazer e Limpar sem traços. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label={`Cor ${swatch}`}` (button) | clique | Uma bolinha por cor (5): troca a cor do próximo traço. Estado local, volta ao branco ao remontar. | Sem falha própria. | — |
| `aria-label={`Espessura ${width}px`}` (button) | clique | Uma por espessura (2, 4, 8 px): troca a espessura do próximo traço. Estado local. | Sem falha própria. | — |
| `aria-label="Desfazer último traço"` (button) | clique | Remove o último traço e grava data.strokes (onDataChange → canvas:save). (desabilitado: Sem traços.) | O traço desfeito continua visível no path de prévia até o próximo traço (bug suspeito); falha de canvas:save só no console. | — |
| `aria-label="Limpar desenho"` (button) | clique | Apaga todos os traços e grava strokes vazio. Sem confirmação e sem como desfazer. (desabilitado: Sem traços.) | O último traço desenhado continua visível no path de prévia (bug suspeito); falha de canvas:save só no console. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Traço fantasma (DrawingNode.tsx:90-119 e 208): handlePointerMove escreve o "d" do path de prévia direto no DOM e finishStroke nunca o limpa; o React não controla esse atributo. Depois de Desfazer ou Limpar, o último traço desenhado continua na tela (na cor/espessura atuais) até o próximo traço ou um reload. | médio | `3ec91f95-497e-8103-b360-c1979d6992f4` |
| Nenhum controle do desenho é exercitado: cor, espessura, desfazer, limpar e o próprio traço por ponteiro não têm teste (o smoke só usa o handle do bloco para conectar). | médio | `3ec91f95-497e-8141-b6c1-d1833aac5664` |

### Bloco Desenho Excalidraw

- **ID:** `bloco-excalidraw` · **Dono:** `src/features/canvas/components/ExcalidrawDrawingNode.tsx`
- **Persistência:** canvas salvo (canvas_nodes.data_json: scene em JSON com elements e viewBackgroundColor, label, frameColor)
- **IPC:** `canvas:save`, `canvas:delete`
- **Depende de:** `useReactFlow`, `React.lazy(ExcalidrawCanvas)`, `onDataChange (updateNodeData, CanvasView)`
- **Sobreposição:** Bloco do React Flow, sem z próprio: fica abaixo de toda superfície fixa (topbar e statusbar 18, dock e painéis 20/30, sidebar 26, menus 50+). O cartão é overflow-hidden, então nada que nasce dentro dele passa das bordas. Os menus e diálogos internos do Excalidraw ficam presos ao cartão: num bloco de mínimo 360×280 a barra de ferramentas e os popovers podem ser cortados.
- **Testes:** `scripts/canvas-smoke.cjs` → `prepararFixture`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`, `scripts/canvas-smoke.cjs` → `checarInteracoes`

| Estado | Quando |
| --- | --- |
| normal | Excalidraw completo com a cena gravada; cada mudança agenda a gravação da cena 600 ms depois. |
| loading | Suspense do módulo lazy (~47 MB descompactado): spinner "Carregando Excalidraw…". |
| empty | Cena sem elementos: grava scene vazio e reabre em branco (#ffffff). |
| error | data.scene inválido ou sem "elements" vira cena vazia sem aviso (parseScene devolve null). |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| O bloco regrava a cena a cada segundo com o canvas parado (onChange do Excalidraw dispara em qualquer mudança de appState). | médio | `3e891f95-497e-815b-b675-d1d696a7968e` |
| Debounce de 600 ms sem flush (ExcalidrawDrawingNode.tsx:52-63): fechar ou recarregar o app logo depois de desenhar perde a última edição, e o timer sobrevive à desmontagem; useFileNodeDocument faz o flush que falta aqui. | baixo | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| Sem error boundary em volta do lazy: falha do chunk ou cena que faz o Excalidraw lançar derruba o canvas inteiro. | médio | `3ec91f95-497e-8176-bef0-dfde828936dc` |
| Desenhar, gravar e reabrir a cena não tem teste (o smoke só conecta no handle e a auditoria de acessibilidade ignora .excalidraw). | médio | `3ec91f95-497e-8141-b6c1-d1833aac5664` |

### Cabeçalho do bloco (arrasto, nome e remover)

- **ID:** `cabecalho-do-bloco` · **Dono:** `src/features/canvas/components/NodeHeader.tsx`
- **Persistência:** canvas salvo (data.label a cada tecla; posição gravada 400 ms depois do arrasto)
- **IPC:** `canvas:save`, `canvas:delete`, `canvas:delete-edge`, `pty:kill`, `pty:write`, `files:remove-generated-image`
- **Depende de:** `NODE_DRAG_HANDLE_CLASS (dragHandle do React Flow)`, `onTitleChange / onTitleCommit / onRemove de cada bloco`, `releaseRemovedCanvasNodes (canvas-node-removal)`
- **Sobreposição:** Dentro do cartão de cada bloco, sem z próprio. A área de ações é nodrag; o nome é um input nodrag. Pode ficar sob a dock de terminais e sob a sidebar/rail quando o bloco encosta nelas.
- **Testes:** `scripts/canvas-smoke.cjs` → `checarInteracoes`, `src/features/canvas/services/canvas-node-removal.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Barra de arrasto (canvas-node-drag) com grip, ícone, nome editável ("Nome do bloco") ou título fixo, ações do bloco e o X. |
| empty | Nome vazio mostra o placeholder do tipo (Terminal, Nota, Desenho, Página Web…). |
| disabled | Canvas travado: o grip não arrasta (nodesDraggable falso), mas o X continua removendo. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Remover no"` (button) | clique | onRemove do bloco: deleteElements → onNodesChange tira o bloco e as arestas dele, chama canvas:delete e canvas:delete-edge e apaga imagem temporária do disco; no terminal, store.remove mata o PTY antes. (desabilitado: Some quando o bloco não passa onRemove.) | Sem confirmação nem desfazer; deleteCanvasNode e deleteCanvasEdge engolem erro e o bloco pode voltar no próximo início. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| O X ("Remover no") e o nome editável não são exercitados por nenhum teste com asserção (só o script de heap clica no X, sem conferir o efeito). | médio | `3ec91f95-497e-8141-b6c1-d1833aac5664` |
| Renomear um terminal (onTitleCommit) digita no agente "A partir de agora, seu nome neste canvas é …" já submetido com Enter. | baixo | `3eb91f95-497e-8126-8750-d9834c65f306` |
| Com o canvas travado o X ainda remove (NodeHeader.tsx:61-72 ignora o cadeado; a barra de status desabilita o Remover). | médio | `3ec91f95-497e-8143-a0b4-cceb0ace7599` |
| A dock de terminais recolhidos intercepta cliques em grip, nome e X dos blocos embaixo dela em telas < 768 px, mesmo vazia. | médio | `3e691f95-497e-810e-a39b-f26d90a38c8e` |

### Superfície Excalidraw (wrapper do editor)

- **ID:** `excalidraw-canvas` · **Dono:** `src/features/canvas/components/ExcalidrawCanvas.tsx`
- **Persistência:** nenhuma própria: o ExcalidrawDrawingNode grava data.scene
- **IPC:** nenhum
- **Depende de:** `@excalidraw/excalidraw (lazy)`, `onSceneChange (ExcalidrawDrawingNode)`
- **Sobreposição:** Dentro do bloco Excalidraw (nodrag nowheel nopan, h-full); os menus do editor não saem do cartão.
- **Testes:** `scripts/renderer-csp.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Editor Excalidraw com a cena inicial; cada onChange entrega elements + viewBackgroundColor ao bloco. |
| empty | Cena inicial nula: elementos vazios e fundo #ffffff. |
| denied | validateEmbeddable={false}: todo link de embed é recusado pelo próprio Excalidraw (a CSP do build tem frame-src 'none'). |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Decidir se os embeds do Excalidraw voltam, com frame-src restrito a hosts escolhidos. | baixo | `3ea91f95-497e-818f-a7ed-cb6a84c376d6` |
| As fontes do Excalidraw vêm de https://esm.sh pela CSP em vez do build. | baixo | `3ea91f95-497e-8146-ad00-e32071c3366b` |
| Popovers e diálogos internos do Excalidraw ficam presos ao cartão overflow-hidden; num bloco pequeno são cortados e nenhum teste mede (a auditoria do smoke ignora .excalidraw). | baixo | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

## Arestas e grupos

### Conexões entre blocos (arestas)

- **ID:** `arestas-conexoes` · **Dono:** `src/features/canvas/services/edge-handle-routing.ts`
- **Persistência:** SQLite canvas_edges (id, source, target) via canvas:save-edge e canvas:delete-edge; handles: nenhuma (recalculados a cada render)
- **IPC:** `canvas:list-edges`, `canvas:save-edge`, `canvas:delete-edge`
- **Depende de:** `useEdgesState`, `edgeHandlesBetween / nearestSides (node-geometry)`, `onConnect / onEdgesChange / edgesWithHandles (CanvasView)`, `saveCanvasEdge / deleteCanvasEdge (canvas-storage)`
- **Sobreposição:** SVG de arestas do React Flow, abaixo dos blocos; sem z próprio. Terminal e arquivo têm source e target sobrepostos em cada lado; os outros blocos, um handle de entrada à esquerda e um de saída à direita.
- **Testes:** `src/features/canvas/services/edge-handle-routing.test.ts`, `src/features/canvas/services/canvas-selection.test.ts`, `electron/services/storage/canvas-repository.test.cjs`, `electron/services/canvas-ipc-handlers.test.cjs`, `scripts/canvas-smoke.cjs` → `checarInteracoes`, `scripts/canvas-smoke.cjs` → `prepararFixture`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`

| Estado | Quando |
| --- | --- |
| normal | Aresta desenhada pelos handles dos lados que se encaram (edgeHandlesBetween + nearestSides), recalculada a cada render; blocos sem handle lateral usam o handle único (null). |
| error | Aresta com ponta inexistente volta sem handles e o React Flow não a desenha; pedir handle com id a bloco que não tem faria a aresta sumir da tela (por isso SIDE_HANDLE_NODE_TYPES). |
| pending | Antes de canvas:list-edges responder (edgesHydrated falso) os terminais seguram o texto inicial. |
| success | Classe felixo-edge-route-active por 900 ms depois de uma entrega real ao PTY pela conexão (só nas criadas por arrasto: onConnect → markRouteDelivered). |
| disabled | Canvas travado: nodesConnectable falso, arrastar de um handle não conecta. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Erros engolidos em services/canvas-storage.ts:54-66 e 173-198: saveCanvasEdge, deleteCanvasEdge e deleteCanvasNode têm catch vazio e não conferem ok; uma aresta criada some (ou uma removida volta) no próximo início sem aviso nem log. | médio | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| Remover aresta (selecionar + Delete/Backspace ou Remover da barra de status) não tem teste; o smoke só cria por arrasto e confere a persistência. | baixo | `3ec91f95-497e-8141-b6c1-d1833aac5664` |
| edgesWithHandles depende de nodes e recalcula todas as arestas a cada quadro de arrasto. | baixo | `3e991f95-497e-81c5-ad8f-f058eb3b93b7` |

### Ligação arquivo ↔ terminal (contexto do agente)

- **ID:** `ligacao-arquivo-terminal` · **Dono:** `src/features/canvas/services/canvas-connection-index.ts`
- **Persistência:** derivada das arestas (canvas_edges); nada próprio
- **IPC:** `canvas-file:resolve`, `pty:write`
- **Depende de:** `createCanvasConnectionIndex`, `announceFileToTerminal / announceFileNodeToTerminalNode / requestRepoDiagnosis (file-terminal-links)`, `announceAgentCollaboration`, `isTerminalInitialTextReady`
- **Sobreposição:** Sem superfície própria: aparece como aresta (ver Conexões entre blocos) e como a lista "Agentes ligados" do bloco Arquivo.
- **Testes:** `src/features/canvas/services/canvas-connection-index.test.ts`, `src/features/canvas/services/canvas-connection-performance.test.ts`, `src/features/canvas/services/agent-collaboration-links.test.ts`, `src/features/canvas/terminal/prompt-origins-e2e.test.ts`, `src/features/canvas/terminal/canvas-context-e2e.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Aresta entre arquivo e terminal em qualquer direção: o terminal entra em "Agentes ligados" do arquivo e o .md da pasta do app entra no texto inicial do agente (getConnectedCanvasFileNames). |
| empty | Arquivo sem terminal: "Nenhum agente ligado ainda." e o diagnóstico devolve no-terminal. |
| pending | Terminal com arquivos ligados espera canvas-file:resolve de todos (isTerminalInitialTextReady) antes do primeiro spawn. |
| success | Ao ligar (arrasto ou "Ligar agente"), o agente recebe o aviso do arquivo digitado com Enter (announceFileToTerminal / announceFileNodeToTerminalNode); terminal ↔ terminal declara colaboração recíproca. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Ligar um arquivo externo (filePath, sem fileName) a um agente (services/file-terminal-links.ts:75-83; canvas-connection-index.ts só indexa fileName): a aresta aparece e o agente entra em "Agentes ligados", mas nenhum aviso é digitado e o caminho não entra no texto inicial; canvas-file:resolve falho também retorna calado. | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| O aviso de ligação de .md sai submetido (autoSubmit: true), enquanto os painéis de prompt só digitam. | baixo | `3eb91f95-497e-8126-8750-d9834c65f306` |

### Grupo: blocos filhos e encaixe

- **ID:** `grupo-blocos-filhos` · **Dono:** `src/features/canvas/components/CanvasView.tsx`
- **Persistência:** SQLite canvas_nodes.parent_id do filho (toPersistedNode grava, toFlowNode restaura com extent "parent")
- **IPC:** `canvas:save`, `canvas:delete`
- **Depende de:** `onNodeDragStop (CanvasView)`, `isInside (node-geometry)`, `orderedNodes (grupos antes dos filhos)`, `toPersistedNode / toFlowNode (useCanvasPersistence)`, `getElementsToRemove do @xyflow/system (remoção em cascata)`
- **Sobreposição:** Grupos renderizam primeiro e ficam sob os filhos. Só a ponta superior esquerda conta no encaixe: um bloco maior que o grupo vira filho e fica preso aos limites dele.
- **Testes:** `electron/services/storage/canvas-repository.test.cjs`, `scripts/canvas-smoke.cjs` → `checarOclusaoDoFixture`

| Estado | Quando |
| --- | --- |
| normal | Bloco solto cuja ponta superior esquerda cai dentro de um grupo ao fim do arrasto vira filho (parentId + extent "parent", posição relativa) e passa a se mover com o grupo. |
| empty | Grupo sem filhos. |
| disabled | Filho não sai do grupo (extent "parent" e onNodeDragStop ignora quem tem parentId); grupo não entra em outro grupo; canvas travado não arrasta. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Não há como desagrupar (CanvasView.tsx:2873-2880): o comentário promete "drop it out to detach", mas onNodeDragStop sai cedo para quem tem parentId e extent "parent" prende o filho; o bloco só sai do grupo se for apagado. | médio | `3ec91f95-497e-8143-a0b4-cceb0ace7599` |
| Encaixar um bloco no grupo (isInside, sem teste unitário) e a persistência do parent_id depois do reload não têm teste na tela; o grupo do fixture não tem filhos. | médio | `3ec91f95-497e-8141-b6c1-d1833aac5664` |

## Terminal e processo

### Gaveta do terminal

- **ID:** `terminal-drawer` · **Dono:** `src/features/canvas/components/TerminalDrawer.tsx`
- **Persistência:** localStorage felixo:terminal-drawer-pinned; localStorage felixo:terminal-drawer-collapsed; localStorage felixo:terminal-drawer-width (gravado ao soltar o arrasto, setas ou Home); processo principal: PTY vivo (fechar ou recolher não encerra); canvas salvo (dados do nó): resumeChoice, resumeFailure e sessionStartedAt gravados pelas ações; canvas salvo (dados do nó): readingMode, gravado pelas abas Terminal \| Leitura
- **IPC:** `pty:spawn`, `pty:kill`, `pty:resize`
- **Depende de:** `TerminalSessionProvider`, `useTerminalSessions`, `useSessionSnapshot`, `useCanvasSurfaces`, `useExitAnimation`, `terminal-drawer-pin`, `attachTerminalFitLifecycle`, `visibleTerminalResumeBanner`, `resolveOpenEditorFile`, `CanvasView.relaunchTerminal`, `CanvasView.handleResumeAction`
- **Sobreposição:** Coluna encostada à direita, relative z-20 (focus-within z-30), altura total; a largura (mínimo 440, recolhida 44) é negociada com o painel e o inspector por splitHorizontalSpace, então empurra o canvas em vez de cobri-lo. Fica abaixo do cartão de pedido de página e dos toasts (z 50) e dos modais (z 60); clicar numa camada flutuante (data-felixo-floating-layer) não conta como clique fora.
- **Testes:** `src/features/canvas/components/terminal-drawer-pin.test.ts`, `src/features/canvas/components/terminal-fit-lifecycle.test.ts`, `src/features/canvas/components/terminal-open-file.test.ts`, `src/features/canvas/services/canvas-surfaces.test.ts`, `src/features/shared/focus/floating-layer.test.ts`, `scripts/canvas-smoke.cjs` → `checarInteracoes`, `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos`, `scripts/canvas-smoke-prompts.cjs` → `criarSessaoDePrompts`, `scripts/canvas-smoke-links.cjs` → `criarSessaoDeLinks`, `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia`

| Estado | Quando |
| --- | --- |
| normal | Bloco expandido: o xterm vivo da sessão é anexado (attach + fit) e o PTY segue de pé; o cabeçalho mostra "trabalhando" (working), "aguardando" (idle) ou "encerrado" (exited). |
| loading | Sem snapshot ou com activity "starting": rótulo vazio no cabeçalho e ponto amarelo no trilho recolhido. |
| empty | Passar responsabilidade sem histórico ("Este terminal ainda não tem histórico para transferir.") ou prévia sem nano/vim ("Não achei nenhum arquivo aberto com nano/vim neste terminal.") em faixa vermelha. |
| error | snapshot.message (spawn recusado, "encerrou sem produzir saída", ponte PTY ausente) em faixa vermelha; contextWarning e aviso de scrollback em faixa amarela. |
| pending | Retomada pendente sem processo (awaitingResumeChoice): rótulo "aguardando escolha" e a faixa de retomada com as saídas. |
| disabled | Recolhida (trilho de 44 px, COLLAPSED_WIDTH): só Expandir e Fechar; o xterm fica invisível e aria-hidden, o PTY continua rodando. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Recolher terminal` (button) | clique | Alterna recolhida (trilho de 44 px) e expandida, grava localStorage felixo:terminal-drawer-collapsed ("1"/"0") e sai do maximizado; ao expandir refaz o fit (pty:resize) e devolve o foco ao xterm. | Sem falha própria: o PTY não é tocado. setItem sem try/catch: storage bloqueado lançaria dentro do updater do estado. | — |
| `Maximizar terminal` (button) | clique | Pede a largura innerWidth − 120 ao coordenador (splitHorizontalSpace decide a final) e marca aria-pressed; tira o recolhido e grava felixo:terminal-drawer-collapsed="0". O maximizado não é persistido. (desabilitado: some com a gaveta recolhida) | Sem falha própria; a largura final pode sair menor que a pedida quando o painel da esquerda ocupa espaço. | — |
| `aria-label="Reiniciar terminal"` (button) | clique | Com retomada pendente não sobe nada: revela a faixa para o processo atual e foca o primeiro botão dela. Sem pendência, pede window.confirm se o processo está vivo e chama relaunchTerminal do CanvasView (resolveTerminalRelaunch → store.restart → pty:kill + pty:spawn, generation + 1, sessionStartedAt gravado no nó). (desabilitado: some com a gaveta recolhida) | Cancelar o confirm não faz nada. O retorno "held"/"missing" de relaunchTerminal é ignorado: nada acontece e nada é dito. Spawn recusado vira activity "error" com a mensagem na faixa vermelha. | — |
| `Ver arquivo em modo renderizado` (button) | clique | resolveOpenEditorFile acha o arquivo aberto com nano/vim (opções de lançamento ou histórico do shell via getShellHistory) e chama openTextFileNode: cria ou reaproveita o bloco arquivo em visualização ao lado. (desabilitado: some recolhida ou sem onOpenFilePreview) | Sem arquivo detectado: faixa vermelha "Não achei nenhum arquivo aberto com nano/vim neste terminal.". | — |
| `data-canvas-handoff-trigger` (button) | clique | Lê o histórico inteiro do xterm (getTranscript) e abre o HandoffDialog com ele (setHandoff no CanvasView). (desabilitado: some recolhida ou sem onPassResponsibility) | Histórico vazio: faixa vermelha "Este terminal ainda não tem histórico para transferir." e nenhum diálogo. Com o Claude na tela alternativa o histórico pode sair incompleto. | `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos` |
| `Fixar terminal` (button) | clique | Alterna fixada e grava localStorage felixo:terminal-drawer-pinned; fixada, o mousedown fora não fecha a gaveta (shouldCloseOnOutsideClick). (desabilitado: some com a gaveta recolhida) | Sem falha própria; desafixada, clicar na sidebar ou num painel fecha a gaveta. | `scripts/canvas-smoke-prompts.cjs` → `criarSessaoDePrompts` |
| `aria-label="Fechar terminal"` (button) | clique, Esc fora do xterm ou mousedown fora da gaveta não fixada (exceto camada flutuante) | Animação de saída (DRAWER_EXIT_MS) e closeExpandedTerminal: a gaveta desmonta, reporta largura 0 e o foco volta ao gatilho do bloco; o PTY segue vivo. | Sem falha própria: fechar nunca encerra o processo. | `scripts/canvas-smoke.cjs` → `checarInteracoes` |
| `data-felixo-terminal-tab` (button) | clique, ou seta esquerda/direita na lista de abas | Abas Terminal \| Leitura (WAI-ARIA tabs): grava readingMode no nó (updateNodeData, persistido no canvas) e leva o foco junto — ao xterm no Terminal, ao painel na Leitura. Na Leitura o xterm fica por baixo, do mesmo tamanho, inert e aria-hidden; o PTY não é redimensionado. (desabilitado: some recolhida) | Sem falha própria: trocar de aba não toca o processo. Só aparece com onReadingModeChange e um perfil de leitura. | `scripts/canvas-smoke-leitura.cjs` → `copiarEAbas` |
| `runResumeAction(action.id)` (button) | clique | Botão repetido da faixa (Escolher na lista (/resume), Abrir conversa nova, Tentar retomar de novo, Dispensar aviso): handleResumeAction grava terminalResumeActionPatch no nó (resumeChoice ou limpa resumeFailure), espelha a escolha no sessionStorage felixo:canvas-terminal-run e relança por relaunchTerminal; "Dispensar aviso" só limpa a falha. (desabilitado: some recolhida ou sem faixa visível) | As ações que relançam pedem o mesmo confirm do Reiniciar com processo vivo; cancelar não grava nada. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Recolher, Maximizar e Ver arquivo em modo renderizado não são clicados em nenhum teste (o smoke só abre, fixa, passa responsabilidade e fecha). | médio | `3ec91f95-497e-81e8-8f18-e2a529b0568e` |
| Reiniciar e os botões da faixa de retomada na gaveta não têm teste de clique; o store falso do smoke A não reproduz a faixa. | médio | `3eb91f95-497e-811b-8eb0-e620c6f37e21` |
| O cabeçalho não nomeia "waiting_approval", "starting" nem "error": o rótulo fica vazio justo quando o agente pede aprovação (TerminalDrawer.tsx:533-541; o cartão e a notificação dizem "Precisa de resposta"). | baixo | `3ec91f95-497e-8103-b360-c1979d6992f4` |
| Abrir a gaveta rola o shell para o lado por um instante. | baixo | `3e891f95-497e-819b-a75f-e5cec04e3173` |
| Desafixada, clicar num painel da sidebar (Prompts, Skills) fecha a gaveta antes de o texto chegar ao terminal. | médio | `3eb91f95-497e-814a-8b2c-e471e09f6ff3` |
| Com a gaveta aberta, a barra de status encolhe até 160 px e quebra. | médio | `3e791f95-497e-81bd-8e8c-de6f9e16cec5` |

### Leitura do terminal

- **ID:** `terminal-reading` · **Dono:** `src/features/canvas/components/TerminalReadingPanel.tsx`
- **Persistência:** canvas salvo (dados do nó): readingMode; nenhuma para o conteúdo: relido da tela a cada abertura
- **IPC:** nenhum
- **Depende de:** `useTerminalReading`, `terminal-session-store.getReadingSource`, `terminal-session-store.subscribeOutput`, `terminal/reading (reading-lines, reading-blocks, reading-markdown, reading-profiles)`, `DeferredMarkdownContent`, `TerminalCopyButton`
- **Sobreposição:** Absoluta por cima do xterm, dentro da gaveta (inset-0, fundo opaco): não muda o tamanho do terminal nem cria camada própria acima da gaveta.
- **Testes:** `src/features/canvas/terminal/reading/terminal-reading.fixtures.test.ts`, `src/features/canvas/terminal/reading/terminal-reading.stream.test.ts`, `src/features/canvas/terminal/reading/reading-markdown.test.ts`, `scripts/canvas-smoke-leitura.cjs` → `claudeNaLeitura`, `scripts/canvas-smoke-leitura.cjs` → `codexERolagem`, `scripts/canvas-smoke-leitura.cjs` → `temaTamanhoEMovimento`

| Estado | Quando |
| --- | --- |
| normal | Aba Leitura da gaveta: a conversa da tela em falas (Você, Agente, Aviso da CLI, Saída), cada uma com o Markdown reconstruído da tela do xterm (título, listas, código, tabela, citação, link). Relida no máximo a cada 250 ms durante o stream; acompanha o fim só se a pessoa já estava no fim. |
| loading | Runtime do terminal ainda carregando: getReadingSource devolve undefined e o painel fica vazio até o primeiro aviso de saída. |
| empty | Sem fala reconhecida (CLI abrindo, só logotipo): "Nada para ler ainda." |
| error | Fala cuja estrutura não confere com a tela (ou que lança erro): sai como texto puro, com "mostrado como texto: a formatação não conferiu". |
| disabled | CLI sem perfil gravado (Gemini, Openia, shell): a saída aparece como veio, num bloco de texto, com o aviso de que não há leitura formatada. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| O Gemini não tem perfil: a conta pessoal foi recusada pelo Gemini CLI 0.62 e não houve resposta para gravar; ele aparece como texto puro. | médio | `3ec91f95-497e-8113-afb0-eecb92e4eb23` |
| Palavra partida pela largura da CLI vira espaço; código sem cor sai como parágrafo; versão nova das CLIs pode desenhar diferente sem teste que avise. | baixo | `3ec91f95-497e-8122-a08b-d26d4991acca` |

### Botão Copiar do terminal

- **ID:** `terminal-copy-button` · **Dono:** `src/features/canvas/components/TerminalCopyButton.tsx`
- **Persistência:** nenhuma
- **IPC:** nenhum
- **Depende de:** `useTerminalSessions`, `terminal-session-store.copy`
- **Sobreposição:** Mora no cabeçalho da gaveta (z-20/30) e no cabeçalho do cartão (nodrag); herda a camada de quem o contém, sem risco próprio.
- **Testes:** nenhum

| Estado | Quando |
| --- | --- |
| normal | Ícone de copiar no cabeçalho da gaveta e no cartão do bloco. |
| empty | Sem seleção e sem texto visível (ou sessão inexistente): store.copy devolve "" e nada muda. |
| success | Havia texto: ícone vira ✓ por 1,5 s. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `label = 'Copiar do terminal'` (button) | clique | store.copy(sessionId): copia a seleção do xterm ou, sem seleção, a tela visível (readViewport) com navigator.clipboard.writeText e mostra ✓. | erro engolido: a rejeição do clipboard vira promessa sem tratamento, sem aviso; sem navigator.clipboard o ✓ aparece sem ter copiado nada. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Falha do clipboard é engolida e, sem navigator.clipboard, o ✓ aparece sem copiar (terminal-session-store.ts:1716-1728, TerminalCopyButton.tsx:22-28); store.copy não tem teste. | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Copiar com o Claude na tela alternativa pega só a tela, não o histórico inteiro. | médio | `3e991f95-497e-81e0-8c54-f507189f8729` |

### Detalhes do terminal

- **ID:** `terminal-details-panel` · **Dono:** `src/features/canvas/components/TerminalDetailsPanel.tsx`
- **Persistência:** canvas salvo (dados do nó): agentSession, resumeFailure e accountMode; sessionStorage felixo:canvas-terminal-run (conversas esquecidas); processo principal: modo da sessão na cadeia de contas
- **IPC:** `account-chain:set-session-mode`, `pty:cli-versions`
- **Depende de:** `CanvasPanel`, `useSessionMetadata`, `useAccountChain`, `useCliAccountLabel`, `changeSessionAccountMode`, `explainAgentResume`, `AccountSwitchHistory`, `CanvasView.forgetAgentSession`, `terminal-run-registry`
- **Sobreposição:** CanvasPanel absolute top-16 z-20 (focus-within z-30), à direita da sidebar; disputa a largura pelo coordenador de superfícies, mas não a posição com o painel de ferramenta aberto ao mesmo tempo.
- **Testes:** `src/features/canvas/services/account-chain-client.test.ts`, `src/features/canvas/services/account-chain-view.test.ts`, `src/features/canvas/terminal/session-metadata.test.ts`, `src/features/canvas/services/agent-session.test.ts`, `src/features/canvas/services/terminal-run-registry.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Painel com pasta, estado, idade e início da sessão PTY, IDs do elemento e da sessão, agente, conversa associada, plano de retomada (explainAgentResume), capacidade da CLI, conversa anterior, última inserção, conta, modo e trocas do bloco. |
| empty | Sem metadados (sessão não iniciada): "sessão não iniciada" e "não informado"; sem conversa: "sem conversa associada: ao reabrir, a CLI mostra a lista (/resume)". |
| error | Main recusou ou está fora: mensagem em role="alert" abaixo do modo. |
| pending | busy durante a troca de modo da conta: Fixar nesta conta e Voltar para a cadeia desabilitados. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Esquecer associação da conversa` (button) | clique | Depois de window.confirm, forgetAgentSession limpa agentSession e resumeFailure do nó (canvas salvo) e registra o ID esquecido em felixo:canvas-terminal-run, para o reanexo do mesmo PTY não regravá-lo; o terminal atual não é encerrado. (desabilitado: some sem conversa associada) | Cancelar o confirm não faz nada. | — |
| `Copiar ${label}` (button) | clique | Botão repetido em cada detalhe copiável (pasta, ID do elemento, ID da sessão PTY, ID da conversa): navigator.clipboard.writeText do valor. (desabilitado: some quando o detalhe não tem valor copiável) | erro engolido: promessa com void, sem retorno visual de sucesso nem de erro. | — |
| `Fixar nesta conta` (button) | clique | changeSessionAccountMode(pinned) → account-chain:set-session-mode; grava accountMode "pinned" no nó mesmo com o main fora (ficar fixo nunca troca nada). (desabilitado: busy; só aparece com conta própria em modo cadeia) | Recusa ou main fora: mensagem em role="alert"; o modo fixo é gravado assim mesmo. | — |
| `Voltar para a cadeia` (button) | clique | changeSessionAccountMode(chain) → account-chain:set-session-mode; só grava accountMode "chain" no nó se o main aceitar. Vale para as próximas detecções e o próximo spawn, nunca toca o processo vivo. (desabilitado: busy; só com conta própria, modo fixo e cadeia ligada) | Recusa ou main fora: mensagem em role="alert" e nada é gravado. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum smoke abre o painel: Esquecer associação, Copiar e a troca de modo da conta só têm teste das funções puras. | médio | `3ec91f95-497e-81e8-8f18-e2a529b0568e` |
| Copiar ${label} não diz se copiou e engole a falha do clipboard (TerminalDetailsPanel.tsx:173). | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| O painel é um CanvasPanel (absolute top-16) aberto fora de activeTool: com uma ferramenta aberta, os dois ocupam o mesmo lugar e só o focus-within z-30 decide quem fica por cima. | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Menu Agente (novo terminal)

- **ID:** `terminal-menu` · **Dono:** `src/features/canvas/components/TerminalMenu.tsx`
- **Persistência:** localStorage felixo:last-agent-launch-preferences; fila: só em memória (estado do menu, some ao desmontar)
- **IPC:** `account-chain:preview-launch`, `account-chain:confirm`, `cli-accounts:list`, `pty:spawn`
- **Depende de:** `useAgentConfig`, `AgentConfigFields`, `isFelixoPopoverTarget`, `CanvasToolbar (onAdd, onAddMany, onAddFolder)`
- **Sobreposição:** Dentro da sidebar (z 26); o flyout é inline (empurra a seção Criar, não flutua). Os menus do FelixoSelect abrem em portal z 1000.
- **Testes:** `src/features/canvas/services/agent-launch-preferences.test.ts`, `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia`, `scripts/canvas-smoke-onboarding.cjs` → `criarCenariosDoTutorial`

| Estado | Quando |
| --- | --- |
| normal | Pílula "Agente \| seta" na seção Criar da sidebar; flyout fechado. |
| empty | Fila vazia: a seção Fila some. |
| error | prepareForLaunch recusou: o flyout reabre e o erro aparece nos campos. |
| pending | launching (preparo da conta, da cadeia ou do Openia): Agente, Abrir agente e + desabilitados. |
| disabled | accountSelectionIssue: Abrir agente e + desabilitados, com o motivo no title. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `ref={triggerRef}` (button) | clique | Metade "Agente": prepareForLaunch → buildOptions → savePreferences (localStorage felixo:last-agent-launch-preferences) → onAdd cria o bloco terminal, que sobe o PTY; limpa o nome, fecha o flyout e devolve o foco. (desabilitado: launching) | Configuração inválida reabre o flyout com o erro. Exceção do prepareForLaunch (IPC rejeitado) não é capturada: try/finally sem catch. | `scripts/canvas-smoke-onboarding.cjs` → `criarCenariosDoTutorial` |
| `onClick={toggleSettings}` (button) | clique | Abre ou fecha o flyout inline (role="group" "Configurar novo agente") com os campos do agente; Esc dentro dele e clique fora (exceto popover do FelixoSelect) fecham e devolvem o foco à pílula. | Sem falha própria. | `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia` |
| `Abrir agente` (button) | clique | Mesmo caminho da metade "Agente" (openTerminal) com o flyout aberto: cria o bloco e sobe o PTY com a conta, o modelo e o projeto escolhidos. (desabilitado: launching ou accountSelectionIssue) | Configuração inválida mantém o flyout com o erro; exceção do preparo sem catch. | `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia` |
| `aria-label="Adicionar à fila de terminais"` (button) | clique | queueCurrent: prepareForLaunch e savePreferences, depois empilha buildOptions na fila local do menu e limpa o nome. (desabilitado: launching ou accountSelectionIssue) | Configuração inválida não enfileira (erro nos campos). Com "Automática (cadeia)" o ticket é pedido na hora de enfileirar. | — |
| `aria-label="Esvaziar fila de terminais"` (button) | clique | Esvazia a fila de uma vez, sem confirmação. (desabilitado: some com a fila vazia) | Sem falha própria. | — |
| `Remover "${item.label}" da fila` (button) | clique | Botão repetido em cada item: tira aquele item da fila. | Sem falha própria. | — |
| `Iniciar {queue.length} terminais` (button) | clique | onAddMany(queue): o canvas acha posições livres para todos (findFreeNodePositions) e cria os blocos de uma vez; esvazia a fila e fecha o flyout. (desabilitado: some com a fila vazia) | Itens preparados há tempo (ticket da cadeia, conta removida) podem falhar só no spawn de cada bloco. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| A fila (adicionar, remover, esvaziar, iniciar N) não é exercitada por nenhum teste. | médio | `3ec91f95-497e-81e8-8f18-e2a529b0568e` |
| A fila com a conta "Automática (cadeia)" guarda tickets pedidos no enfileiramento. | médio | `3e991f95-497e-81ce-9286-cbe3532f3044` |
| openTerminal e queueCurrent usam try/finally sem catch: IPC rejeitado no preparo vira rejeição não tratada, sem aviso (TerminalMenu.tsx:99-136). | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Campos de configuração do agente

- **ID:** `agent-config-fields` · **Dono:** `src/features/canvas/components/AgentConfigFields.tsx`
- **Persistência:** localStorage felixo:last-agent-launch-preferences; processo principal: perfis de conta (cli-accounts) e chave do OpenRouter cifrada; processo principal: cache de modelos das CLIs (agent-models)
- **IPC:** `cli-accounts:list`, `cli-accounts:create`, `cli-accounts:remove`, `cli-accounts:set-secret`, `openia:list-interfaces`, `openia:list-models`, `openia:key-status`, `openia:set-key`, `agent-models:get`, `agent-models:refresh`, `account-chain:preview-launch`, `projects:pick-folder`, `projects:detect-repos`
- **Depende de:** `useAgentConfig`, `useAgentModelCatalog`, `useAgentPresets`, `useAccountChain`, `FelixoSelect`, `AgentPresetFields`, `agent-launch-preferences`, `useCanvasProjects`
- **Sobreposição:** Sem camada própria: vive no flyout do menu Agente (sidebar, z 26) e dentro do HandoffDialog (z 60). Os menus do FelixoSelect abrem em portal z 1000, acima de qualquer modal.
- **Testes:** `src/features/canvas/services/agent-launch-preferences.test.ts`, `src/features/canvas/services/agent-account-selection.test.ts`, `src/features/canvas/services/account-removal.test.ts`, `src/features/canvas/services/agent-model-overlay.test.ts`, `src/features/canvas/services/agent-launch-options.test.ts`, `src/features/canvas/services/openia-launch-config.test.ts`, `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia`

| Estado | Quando |
| --- | --- |
| normal | Nome, preset, agente, conta, modelo, esforço, yolo, fast, arquivo de planejamento e projeto; com o Openia, interface, modelo e chave. |
| loading | openiaLoading: selects do Openia com "Carregando interfaces…"; refreshing: ícone de atualizar girando. |
| empty | Openia sem interfaces: "Openia não disponível"; sem contas: só Login do sistema e Nova conta… |
| error | accountSelectionIssue em role="alert" (lista ilegível, conta salva ausente), openiaError, chainLaunchError, erroRemocao e erro do cadastro em vermelho. |
| pending | "A cadeia está escolhendo a conta…" (aria-busy) até a prévia; "Salvando…", "Criando…" e "Removendo…" nos botões. |
| disabled | Interface e Modelo do Openia sem dados; Salvar sem rascunho de chave; Criar conta sem nome ou com lista ilegível. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Agente"` (select) | clique | changeAgent: troca a CLI e zera conta, modelo, esforço, fast e preset de outra CLI; lista as contas do novo provedor (cli-accounts:list). | Lista de contas ilegível vira accountSelectionIssue e bloqueia a abertura. | `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia` |
| `aria-label="Interface Openia"` (select) | clique | Escolhe a interface do Openia (openiaInterfaceKey) usada no lançamento. (desabilitado: openiaLoading ou sem interfaces) | Sem interfaces: opção desabilitada "Openia não disponível" e openiaError. | — |
| `aria-label="Modelo Openia"` (select) | clique | Escolhe o modelo do OpenRouter (ou o padrão da interface) aplicado antes da interface abrir. (desabilitado: openiaLoading ou sem modelos) | Modelo que sumiu da lista volta ao padrão no preparo. | — |
| `aria-label="Modelo"` (select) | clique | changeModel: grava o modelo e limpa esforço e fast que o modelo novo não aceita. | Sem falha própria. | — |
| `aria-label="Esforço de raciocínio"` (select) | clique | Grava o nível de esforço passado à CLI. (desabilitado: some quando o modelo não tem níveis) | Sem falha própria. | — |
| `aria-label="Projeto"` (select) | clique | Escolhe o projeto (cwd do terminal); "Adicionar pasta…" chama onAddFolder (projects:pick-folder + projects:detect-repos) e seleciona o primeiro projeto criado. | Cancelar o seletor deixa "Local (sem projeto)"; rejeição de onAddFolder sem tratamento. | — |
| `aria-label="Conta"` (select) | clique | setAccountId (Login do sistema, Automática (cadeia), perfil local) ou "Nova conta…" abre o cadastro inline. | Conta que não pode abrir marca o campo como inválido e mostra o motivo em role="alert". | `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia` |
| `aria-label="Atualizar configuração do Openia"` (button) | clique | refreshOpenia: openia:list-interfaces, openia:list-models (refresh), cli-accounts:list e openia:key-status. (desabilitado: openiaLoading) | Falha vira openiaError em texto vermelho. | — |
| `onClick={() => void config.saveOpeniaKey()}` (button) | clique | saveOpeniaKey: com conta escolhida, cli-accounts:set-secret (cifrada no perfil); no login do sistema, openia:set-key. Limpa o rascunho e marca a chave como configurada. (desabilitado: openiaSaving ou rascunho vazio) | Recusa ou exceção: openiaError com a mensagem. | — |
| `aria-label="Atualizar lista de modelos"` (button) | clique | Catálogo de modelos: agent-models:refresh consulta as CLIs; um catálogo vazio mantém a lista atual. (desabilitado: refreshing) | erro engolido: promessa sem catch; só o ícone para de girar. | — |
| `aria-label="Selecionar arquivo de planejamento"` (button) | clique | Abre o input de arquivo oculto; o caminho vem de getFilePath (webUtils) e vai para o campo. | Sem caminho, cai no nome do arquivo, que não é caminho absoluto. | — |
| `Remover a conta "${contaAtual.label}"` (button) | clique | removeAccount: cli-accounts:remove sem confirmação devolve os terminais vivos; window.confirm nomeia cada um; confirmado, cli-accounts:remove { confirmed: true } apaga o perfil e o login. (desabilitado: removendo; some sem conta escolhida) | Falha em role="alert"; exceção vira "Não foi possível remover a conta.". | — |
| `Tentar de novo` (button) | clique | retryAccountList: cli-accounts:list do provedor atual de novo. (desabilitado: só aparece com a lista ilegível) | Lista ainda ilegível mantém o aviso. | — |
| `Recalcular` (button) | clique | refreshChainPreview: novo account-chain:preview-launch para "Automática (cadeia)" (cada prévia cria uma proposta launch no main). (desabilitado: só com "Automática (cadeia)" sem problema de conta) | Prévia não pronta deixa "A cadeia está escolhendo a conta…". | — |
| `onClick={() => void criar()}` (button) | clique | criar: cli-accounts:create (no Openia também cli-accounts:set-secret, desfeito com remove se a chave falhar), recarrega a lista e seleciona a conta nova. (desabilitado: nome vazio, salvando ou lista ilegível) | Recusa: erro em texto. IPC rejeitado: "Criando…" fica preso (try sem catch). | — |
| `Cancelar` (button) | clique | Fecha o cadastro de conta e limpa o erro. | Sem falha própria. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Só Agente e Conta são exercitados (sessão C); Openia, modelo, esforço, arquivo de planejamento, projeto, remover, criar, tentar de novo e recalcular não têm teste de interface. | médio | `3ec91f95-497e-81e8-8f18-e2a529b0568e` |
| criar() não tem catch: se cli-accounts:create, set-secret ou remove rejeitarem, "Criando…" fica preso até remontar (AgentConfigFields.tsx:448-464, useAgentConfig.ts:503-521). | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Cada prévia de "Automática (cadeia)" (inclusive Recalcular) cria uma proposta e uma checagem de login no main. | médio | `3e991f95-497e-81b4-ac92-d7db960c9ae0` |
| Atualizar lista de modelos não avisa quando a consulta às CLIs falha (useAgentModelCatalog.ts, promessa sem catch). | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Preset de agente no configurador

- **ID:** `agent-preset-fields` · **Dono:** `src/features/canvas/components/AgentPresetFields.tsx`
- **Persistência:** processo principal: SQLite (agent-presets); preset ativo e contexto editado: só em memória
- **IPC:** `agent-presets:list`, `agent-presets:save`, `agent-presets:delete`
- **Depende de:** `useAgentConfig`, `useAgentPresets`, `FelixoSelect`, `agent-preset`
- **Sobreposição:** Sem camada própria: dentro dos campos do agente (sidebar ou HandoffDialog); o select abre em portal z 1000.
- **Testes:** `src/features/canvas/services/agent-preset.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Select com os presets nativos e os salvos; detalhes recolhidos com contexto inicial e "salvar como preset". |
| empty | Sem presets salvos: só os nativos e "Nenhum (configurar à mão)". |
| error | error do useAgentPresets (salvar ou excluir recusado) em vermelho. |
| pending | "Salvando…" no botão enquanto salva. |
| disabled | Salvar como preset sem nome, sem agente ou com o Openia (launcher). |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Preset de agente"` (select) | clique | applyPreset: preenche agente, modelo, esforço, fast, yolo, projeto (pelo cwd) e contexto inicial; "Nenhum" volta ao manual. | Sem falha própria; preset de outra CLI troca o agente e zera a conta escolhida. | — |
| `Salvar como preset` (button) | clique | saveAsPreset → agent-presets:save; o evento felixo:agent-presets-changed atualiza as outras instâncias e o preset salvo vira o ativo. (desabilitado: nome vazio, saving, sem agente ou com o Openia) | Recusa: error em vermelho. IPC rejeitado: try/finally sem catch, sem aviso. | — |
| `Duplicar` (button) | clique | duplicate(active) → agent-presets:save com nome numerado; a cópia não vira a ativa. (desabilitado: some sem preset ativo) | Recusa: error em vermelho. | — |
| `Excluir` (button) | clique | remove(active.id) → agent-presets:delete sem confirmação; deu certo, o formulário volta ao manual. (desabilitado: some sem preset ativo ou com preset nativo) | Recusa: error em vermelho. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Aplicar, salvar, duplicar e excluir preset não têm teste de interface; Excluir apaga do SQLite sem confirmação. | baixo | `3ec91f95-497e-81e8-8f18-e2a529b0568e` |
| handleSave usa try/finally sem catch: IPC rejeitado não mostra erro (AgentPresetFields.tsx:35-45). | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Pedido de agente para abrir página

- **ID:** `agent-browser-request-card` · **Dono:** `src/features/canvas/components/AgentBrowserRequestCard.tsx`
- **Persistência:** processo principal: fila de pedidos de agente (pasta agent-requests)
- **IPC:** `agent-browser:list-requests`, `agent-browser:decide`, `agent-browser:requests`, `agent-browser:open-webpage`
- **Depende de:** `agent-browser-request`, `describeLinkDestination`, `floating-layer`, `window.felixo.canvas`
- **Sobreposição:** fixed inset-x-0 top-4 z-50, centralizado (max-w-md), pointer-events só no cartão; acima da topbar (18), da gaveta (20/30) e dos painéis, abaixo dos modais (60). data-felixo-floating-layer: clicar nele não fecha a gaveta. Não rouba o foco.
- **Testes:** `src/features/canvas/components/agent-browser-request.test.ts`, `electron/services/agent-browser-ipc-handlers.test.cjs`, `src/features/shared/focus/floating-layer.test.ts`, `scripts/canvas-smoke-links.cjs` → `criarSessaoDeLinks`

| Estado | Quando |
| --- | --- |
| normal | Pedido mais antigo com origem, host e endereço inteiro (caixa com rolagem), sugestão do agente destacada e "+N na fila". |
| empty | Sem pedido pendente: não renderiza. |
| error | Decisão recusada: role="alert" preso ao pedido que falhou. |
| pending | busy ou nos 600 ms depois de trocar de pedido (BROWSER_REQUEST_ARM_MS): botões desabilitados. |
| denied | Endereço recusado pela política (describeLinkDestination): "Endereço recusado: …" e só Recusar. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Abrir no navegador` (button) | clique | agent-browser:decide (externo): o main abre o endereço no navegador do sistema, se o pedido gravado ainda for o mostrado. (desabilitado: busy, janela de 600 ms ou endereço recusado) | Recusa ou pedido mudado: role="alert"; o segundo clique de um duplo clique é ignorado. | — |
| `Abrir como Página Web` (button) | clique | agent-browser:decide (embutido): o main emite agent-browser:open-webpage e o canvas cria o bloco Página Web; o pedido fica "aceito" com o modo escolhido. (desabilitado: busy, janela de 600 ms ou endereço recusado) | Recusa: role="alert". | `scripts/canvas-smoke-links.cjs` → `criarSessaoDeLinks` |
| `onClick={onChoose([request], null)}` (button) | clique | Recusar: agent-browser:decide (null) marca o pedido como recusado e o cartão passa ao próximo. (desabilitado: busy ou janela de 600 ms) | Recusa: role="alert"; duplo clique decide só o pedido visto. | `scripts/canvas-smoke-links.cjs` → `criarSessaoDeLinks` |
| `Recusar todos` (button) | clique | Recusa todos os pedidos em série (um agent-browser:decide por pedido). (desabilitado: busy, janela de 600 ms; só com fila) | Para no primeiro que falhar e mostra o erro dele. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Abrir no navegador e Recusar todos não são clicados no smoke (o caminho externo só é testado no handler do main). | baixo | `3ec91f95-497e-81e8-8f18-e2a529b0568e` |
| Cartão fixed top-4 z-50 pode cobrir a topbar e o topo da gaveta ou do painel em janela estreita; sem teste de sobreposição. | baixo | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |
| decide e load não tratam IPC rejeitado (try/finally sem catch), sem aviso (AgentBrowserRequestCard.tsx:54-101). | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Faixa de retomada do terminal

- **ID:** `terminal-resume-banner` · **Dono:** `src/features/canvas/services/terminal-resume-banner.ts`
- **Persistência:** canvas salvo (dados do nó): agentSession, resumeFailure e previousAgentSession; sessionStorage felixo:canvas-terminal-run (resumeChoice desta execução, não vai ao disco)
- **IPC:** `pty:cli-versions`, `pty:session`, `pty:spawn`
- **Depende de:** `explainAgentResume`, `describeAgentResumeForPerson`, `resolveTerminalRelaunch`, `CanvasView.handleResumeAction`, `CanvasView.relaunchTerminal`, `terminal-run-registry`, `TerminalNode e TerminalDrawer (renderizam os botões)`
- **Sobreposição:** Sem camada própria: faixa amarela (role="status") no cartão do bloco e abaixo do cabeçalho da gaveta, no fluxo do conteúdo.
- **Testes:** `src/features/canvas/services/terminal-resume-banner.test.ts`, `src/features/canvas/services/agent-session.test.ts`, `src/features/canvas/services/agent-resume-capability.test.ts`, `src/features/canvas/services/agent-cli-versions.test.ts`, `src/features/canvas/services/terminal-run-registry.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Sem faixa: plano exato, lista automática sem conversa associada, conversa nova ou escolha já feita (buildTerminalResumeBanner devolve null). |
| empty | Registro de conversa ilegível: a faixa sai sem o alvo (agente · pasta · quando · conta). |
| error | A CLI recusou a conversa (expired ou auth): failure, aparece mesmo com o agente de pé; ganha Tentar retomar de novo quando a falha é o único obstáculo e Dispensar aviso com o processo vivo. |
| pending | Plano "pending" (pasta, conta ou agente divergente; CLI sem retomada por ID, como o Gemini anterior à 0.57) com bloco sem processo, processo encerrado ou Reiniciar revelado: "aguardando escolha" e Escolher na lista (/resume) ou Abrir conversa nova. |
| success | Escolha gravada: a faixa some e o bloco (re)sobe com /resume, conversa nova ou a retomada exata. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum smoke mostra a faixa nem clica nos botões dela (cartão ou gaveta); o store falso não a reproduz. | médio | `3eb91f95-497e-811b-8eb0-e620c6f37e21` |
| O relançamento automático do Codex (auto-update) não respeita a escolha feita na faixa. | médio | `3eb91f95-497e-8178-bc58-cd545a4f4cc8` |
| A faixa só oferece a lista da CLI; as conversas da pasta e da conta não aparecem no app. | baixo | `3eb91f95-497e-81bb-a374-eb2e336c73c6` |

### Ciclo do processo PTY no renderer

- **ID:** `terminal-pty-session` · **Dono:** `src/features/canvas/terminal/terminal-session-store.ts`
- **Persistência:** processo principal: PTY vivo, reanexado por canvas:<id> (reuseExisting) depois de recarregar ou voltar do chat; memória do renderer: xterm e scrollback (o main reemite o buffer de replay no reanexo)
- **IPC:** `pty:spawn`, `pty:write`, `pty:resize`, `pty:kill`, `pty:data`, `pty:exit`, `pty:session`, `context-file:write`, `context-file:path-typed`, `context-file:release`, `files:save-attachment`, `files:save-clipboard-image`
- **Depende de:** `TerminalSessionProvider`, `pty-event-router`, `resume-outcome-detector`, `terminal-input`, `terminal-screen-state`, `terminal-scrollback`, `context-file-delivery`, `xterm (FitAddon, WebLinksAddon)`
- **Sobreposição:** Não renderiza superfície própria: o elemento xterm é anexado ao cartão ou à gaveta (attach limpa o container antes, para não empilhar terminais).
- **Testes:** `src/features/canvas/terminal/terminal-session-store.test.ts`, `src/features/canvas/terminal/pty-event-router.test.ts`, `src/features/canvas/terminal/terminal-output-coalescing.test.ts`, `src/features/canvas/terminal/terminal-screen-state.test.ts`, `src/features/canvas/terminal/terminal-scrollback.test.ts`, `src/features/canvas/terminal/canvas-context-e2e.test.ts`, `electron/services/pty-ipc-handlers.test.cjs`, `electron/services/pty-process-manager.test.cjs`, `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia`

| Estado | Quando |
| --- | --- |
| normal | working (tela mudando além do spinner) ou idle (1,5 s sem mudança significativa e sem banner de ocupado): PTY canvas:<id> de pé. |
| loading | starting: xterm criado e pty:spawn pedido, até a primeira saída ou o retorno do spawn. |
| error | Spawn recusado (result.ok false) com a mensagem do main; saída sem saída em menos de 5 s: "O comando … encerrou sem produzir saída."; sem ponte: "Bridge PTY indisponível.". |
| pending | waiting_approval: tela parada que parece aprovação (looksLikeApprovalPrompt). |
| success | exited com código 0; reanexo (result.reused) não reenvia o texto inicial nem vigia retomada. |
| denied | Conta de outra sessão viva (PTY_SESSION_ACCOUNT_MISMATCH), conta inexistente ou ticket da cadeia recusado: spawn recusado com código. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| pty.spawn(...).then sem catch: se o invoke rejeitar, a sessão fica em "starting" para sempre, sem mensagem (terminal-session-store.ts:965-1036). | baixo | `3ec91f95-497e-8176-bef0-dfde828936dc` |
| A saída silenciosa ("encerrou sem produzir saída"), a ponte ausente e store.copy não têm teste no store. | médio | `3ec91f95-497e-81e8-8f18-e2a529b0568e` |
| Falha do pty:write do texto inicial é engolida (.catch vazio). | médio | `3d791f95-497e-81cd-b05c-c9d6370c81a3` |
| pty:data chega pedaço a pedaço, sem agrupamento nem controle de fluxo no main. | médio | `3e991f95-497e-81d4-af04-fc0a218a66dc` |
| As varreduras de telas de aceite continuam depois de o REPL ser reconhecido. | baixo | `3e991f95-497e-8109-832d-f789917f708d` |
| O erro de spawn só diz para verificar instalação e autenticação; o diagnóstico da CLI não aparece na interface. | baixo | `3e291f95-497e-8109-8851-e4ff2193c4db` |
| O scrollback do xterm encolhe o histórico; não há arquivo em disco nem "carregar mais". | baixo | `3e991f95-497e-810b-9f94-ed5201606718` |

### Provedor e carregamento do runtime de terminal

- **ID:** `terminal-session-runtime` · **Dono:** `src/features/canvas/terminal/TerminalSessionProvider.tsx`
- **Persistência:** nenhuma (o store vive enquanto o CanvasView estiver montado)
- **IPC:** nenhum
- **Depende de:** `TerminalSessionContext`, `DeferredTerminalSessionStore`, `MockTerminalSessionStore`, `useTerminalSessions`
- **Sobreposição:** Não renderiza superfície: só fornece o contexto do store aos blocos, à gaveta e aos painéis.
- **Testes:** `src/features/canvas/terminal/deferred-terminal-session-store.test.ts`, `scripts/canvas-smoke.cjs` → `checarReloadSemDuplicacao`

| Estado | Quando |
| --- | --- |
| normal | Um store para o canvas inteiro: DeferredTerminalSessionStore importa terminal-session-store na primeira chamada; com window.felixo.devtools.mockPty, MockTerminalSessionStore (smoke da sessão A). |
| loading | Import do runtime em andamento: snapshots vazios e ensure/restart enfileirados na mesma promessa. |
| error | Import falhou: só console.error; o bloco fica sem sessão e sem mensagem. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Falha ao importar o runtime do terminal fica só no console: o bloco não mostra erro nem sai de "iniciando" (deferred-terminal-session-store.ts:78-85). | médio | `3ec91f95-497e-8176-bef0-dfde828936dc` |
| O store de terminais fica órfão ao trocar para o Chat. | médio | `3e991f95-497e-8104-a090-d5b295ba4747` |
| O store falso do smoke A diverge do real (sem faixa, sem retomada). | médio | `3eb91f95-497e-811b-8eb0-e620c6f37e21` |

### Vigia da retomada recusada

- **ID:** `terminal-resume-watch` · **Dono:** `src/features/canvas/terminal/resume-outcome-detector.ts`
- **Persistência:** canvas salvo (dados do nó): resumeFailure, via onResumeFailure
- **IPC:** `pty:data`, `pty:exit`
- **Depende de:** `terminal-session-store (watchResumeOutcome, watchResumeExit)`, `resumeFailurePatch`, `CanvasView.handleResumeFailure`
- **Sobreposição:** Não renderiza superfície: o desfecho aparece pela faixa de retomada.
- **Testes:** `src/features/canvas/terminal/resume-outcome-detector.test.ts`, `src/features/canvas/terminal/terminal-session-store.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Spawn sem argumentos de retomada, ou reanexo a PTY vivo: sem vigia. |
| error | Frase de recusa com o ID tentado na linha (expired) ou de login (auth); no Gemini só com o código de saída medido: onResumeFailure grava resumeFailure no nó. |
| pending | Vigiando a saída do spawn de retomada por até 30 s (RESUME_FAILURE_WINDOW_MS) ou até a primeira tecla da pessoa. |
| success | A janela passa sem frase de recusa: a retomada vale. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| A tela de login do Codex e o onboarding do Claude não são reconhecidos como recusa. | médio | `3eb91f95-497e-817d-baf1-fbf8f400f399` |
| As frases de retomada recusada ainda não vêm do vocabulário de falhas extraído das CLIs. | baixo | `3eb91f95-497e-8175-ac71-d0cf6e878ecd` |
| Sem E2E com a CLI real nos três sistemas (só o detector puro e o store com PTY falso). | médio | `3eb91f95-497e-813b-9b1e-e0710ab60372` |

### Envio de texto ao terminal (Enter)

- **ID:** `terminal-submission` · **Dono:** `src/features/canvas/terminal/terminal-input.ts`
- **Persistência:** nenhuma
- **IPC:** `pty:write`, `context-file:write`
- **Depende de:** `terminal-session-store (sendText, scheduleInitialText)`, `terminal-submission`, `prompt-insertion`
- **Sobreposição:** Não renderiza superfície.
- **Testes:** `src/features/canvas/terminal/terminal-input.test.ts`, `src/features/canvas/terminal/terminal-submission.test.ts`, `src/features/canvas/terminal/prompt-origins-e2e.test.ts`, `scripts/canvas-smoke-prompts.cjs` → `criarSessaoDePrompts`

| Estado | Quando |
| --- | --- |
| normal | Prompt com quebra final pede execução: texto e "\r" vão separados ao PTY (splitTerminalSubmission), com uma volta de render entre eles. |
| pending | Sem quebra final é rascunho: o texto fica digitado na entrada da CLI e quem envia é a pessoa (painéis de prompts e skills). |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Falta conferir no app empacotado que Inserir/combinar entrega exatamente um Enter na PTY. | médio | `3d791f95-497e-81bf-a6c7-efef573d87ae` |
| Os avisos automáticos (ligar .md, colaboração, renomear) ainda enviam com Enter. | baixo | `3eb91f95-497e-8126-8750-d9834c65f306` |

### Registro de terminais desta execução

- **ID:** `terminal-run-registry` · **Dono:** `src/features/canvas/services/terminal-run-registry.ts`
- **Persistência:** sessionStorage felixo:canvas-terminal-run (cai para memória se falhar)
- **IPC:** nenhum
- **Depende de:** `window.sessionStorage`, `CanvasView (captureRestored, applyChoices, recordNodePatch, forgetAgentSessions, acceptAgentSession, markStarted)`
- **Sobreposição:** Não renderiza superfície.
- **Testes:** `src/features/canvas/services/terminal-run-registry.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Guarda os blocos iniciados, os restaurados do disco, a escolha transitória da faixa e as conversas esquecidas desta execução da janela. |
| empty | Storage ausente ou conteúdo ilegível: começa vazio, nunca lança. |
| error | sessionStorage bloqueado ou cheio: segue só em memória (sobrevive à ida ao chat, não ao recarregamento). |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum smoke recarrega a interface com um agente restaurado e retomada pendente para provar o "holdable" e a escolha reaplicada. | baixo | `3eb91f95-497e-811b-8eb0-e620c6f37e21` |

### Status do terminal e notificação

- **ID:** `terminal-status-notification` · **Dono:** `src/features/canvas/terminal/notification-category.ts`
- **Persistência:** localStorage felixo:notification-history; localStorage felixo:notification-preferences
- **IPC:** nenhum
- **Depende de:** `useSessionSnapshots`, `session-notifications (getActionRequiredNodeIds)`, `canvas-notifications`, `notification-history-storage`, `notification-preferences`, `CanvasView (histórico e borda)`, `NotificationsPanel`
- **Sobreposição:** Sem superfície própria: a borda é classe no wrapper do nó (felixo-notify-<categoria>) e a lista mora no painel de notificações.
- **Testes:** `src/features/canvas/terminal/notification-category.test.ts`, `src/features/canvas/terminal/session-notifications.test.ts`, `src/features/canvas/terminal/canvas-notifications.test.ts`, `src/features/canvas/services/notification-history-storage.test.ts`, `src/features/canvas/services/notification-preferences.test.ts`

| Estado | Quando |
| --- | --- |
| normal | snapshot → categoria: idle e exited 0 = "Terminou"; exited diferente de 0 e error = "Falhou"; o resto = "Precisa de resposta"; a cor vem do token --felixo-notify-<categoria>. |
| empty | Sem notificação não lida no nó: sem borda; abrir o terminal marca as dele como lidas. |
| error | exited com código diferente de 0: categoria "Falhou" e borda correspondente. |
| pending | Um terminal passa a idle, exited ou waiting_approval (isActionRequired): entra uma notificação não lida, com som se ligado, e a borda da categoria no nó. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| activity "error" (spawn recusado, saída silenciosa) nunca gera notificação: isActionRequired a exclui (e o teste fixa isso), então a categoria "Falhou" de error em notification-category nunca chega ao histórico (session-notifications.ts:6-12, notification-category.ts:30-35). | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Badge "trabalhando" grudado com o terminal parado. | médio | `3d791f95-497e-8190-84e0-df5328591a14` |
| A borda de notificação no nó não foi conferida numa janela real nem no smoke. | baixo | `3e191f95-497e-81fd-b657-d7a63b5d17f0` |

## Ferramentas e painéis

### Busca de blocos (Pesquisar)

- **ID:** `tool-search` · **Dono:** `src/features/canvas/components/tools/SearchPanel.tsx`
- **Persistência:** nenhuma para o termo (useSearchQuery é useState: fechar o painel apaga a busca); localStorage felixo:canvas-panel-width:search e felixo:canvas-panel-height:search (moldura)
- **IPC:** nenhum
- **Depende de:** `useSearchQuery`, `useSearchInputFocus`, `CanvasPanel`, `focusNode (CanvasView)`
- **Sobreposição:** CanvasPanel absolute z-20 (z-30 com foco dentro), top-16, left = 1rem + largura viva da sidebar; abaixo da sidebar (26), dos toasts/overlay isBusy (50), dos diálogos (60) e do FelixoSelect (1000); mesmo z da lista Elementos (z-20, direita). Porte sm; em 320 px sai ~8 px da viewport (PANEL_MIN_WIDTH 260 não cede), registrado como knownIssue no smoke
- **Testes:** `scripts/canvas-smoke.cjs` → `checarFocoAoAbrirFerramenta`, `scripts/canvas-smoke.cjs` → `checarPainelNosDoisEixos`, `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos`, `scripts/canvas-smoke-onboarding.cjs` → `sb6`

| Estado | Quando |
| --- | --- |
| normal | aberta pelo botão Buscar do rail ou Ctrl/Cmd+K; o campo recebe o foco (useSearchInputFocus) e a lista mostra os blocos cujo label, nome de arquivo, texto ou comando contém o termo, com um trecho do texto encontrado |
| empty | termo preenchido sem correspondência: "Nenhum bloco encontrado."; campo vazio: lista vazia, sem aviso |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => onFocusNode(hit.id)}` (button) | clique | focusNode do CanvasView: centraliza o bloco na área livre com zoom 1,2 e marca só ele como selecionado; o painel continua aberto | bloco removido entre a busca e o clique: focusNode não acha o nó e não faz nada (sem aviso) | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| nenhum teste clica num resultado e confere que o bloco foi centralizado e selecionado (o smoke só abre, foca, mede e fecha) | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |

### Projetos (lista e navegador de pastas)

- **ID:** `tool-projects` · **Dono:** `src/features/canvas/components/tools/ProjectsPanel.tsx`
- **Persistência:** processo principal: lista de projetos (projects:save / projects:delete), a mesma do menu de terminais; canvas salvo: blocos de terminal ou de arquivo criados pelo navegador; localStorage felixo:canvas-panel-width:projects e felixo:canvas-panel-height:projects (a vista project-browser grava na própria chave, mas a moldura não a relê; ver lacuna da moldura); nenhuma para a pasta navegada (reabrir volta à lista)
- **IPC:** `projects:list`, `projects:pick-folder`, `projects:detect-repos`, `projects:save`, `projects:delete`, `projects:list-directory`, `text-file:open-in-project`, `text-file:resolve-editor`
- **Depende de:** `useCanvasProjects (removeProjectFolder, reloadProjects)`, `sortProjectsByName`, `buildRunCommand`, `canRunProjectFile`, `resolveProjectFileClick`, `runFileInTerminal / openTextFileNode (CanvasView)`, `CanvasPanel`
- **Sobreposição:** CanvasPanel absolute z-20 (z-30 com foco dentro), top-16, left = 1rem + largura viva da sidebar; abaixo da sidebar (26), dos toasts/overlay isBusy (50), dos diálogos (60) e do FelixoSelect (1000); mesmo z da lista Elementos (z-20, direita). Porte md; lista e navegador dividem a mesma moldura (trocar de vista não reanima nem refaz o foco). Rodar e Abrir no canvas ficam com opacity 0 até hover/foco
- **Testes:** `src/features/canvas/components/tools/projects-panel-order.test.ts`, `src/features/canvas/services/project-file-action.test.ts`, `src/features/canvas/services/run-file-command.test.ts`, `src/features/canvas/components/terminal-open-file.test.ts`, `src/features/canvas/hooks/useCanvasProjects.test.ts`, `electron/services/projects-ipc-handlers.test.cjs`, `electron/services/projects-path-security.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | lista de projetos registrados em ordem alfabética (sortProjectsByName); abrir um projeto troca a lista pelo navegador de pastas na mesma moldura (panelId project-browser) |
| loading | navegador sem entradas e sem erro: "Carregando…" com spinner; Adicionar pasta mostra "Adicionando…" enquanto busy |
| empty | sem projetos: "Nenhum projeto ainda."; pasta sem arquivos: "Pasta vazia." |
| error | projects:list-directory com ok=false, text-file:open-in-project recusado ou sem editor de terminal: mensagem em vermelho (loadError) acima da lista |
| pending | remoção em dois toques: a linha vira "Tirar <nome> da lista?" com Remover e Cancelar (pendingRemovalId) |
| disabled | Adicionar pasta desabilitado enquanto busy |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Voltar para a pasta anterior"` (button) | clique | goUp: sobe um nível; na raiz do projeto volta à lista de projetos (browsing = null) | sem falha própria; o loadError da pasta anterior não é limpo ao subir (ver lacuna) | — |
| `onClick={() => openEntry(entry)}` (button) | clique | pasta: abre a subpasta (projects:list-directory); arquivo executável (resolveProjectFileClick = run): cria um bloco de terminal que roda o arquivo na pasta atual e fecha o painel; outro arquivo: pede o editor de terminal (text-file:resolve-editor) e abre um terminal com o editor e o arquivo, fechando o painel | sem editor: loadError "Nenhum editor de terminal disponível." (ou a mensagem do processo principal); listagem com ok=false vira loadError; erro engolido: listagem rejeitada deixa "Carregando…" para sempre | — |
| `onClick={() => runFile(entry)}` (button) | clique | cria um bloco de terminal cujo processo é o arquivo (comando de buildRunCommand, com fallbackCommand quando existe), rótulo "<arquivo> · <projeto>", cwd = pasta atual, e fecha o painel (desabilitado: não renderiza para pastas nem para arquivos que canRunProjectFile recusa; transparente até hover/foco) | sem falha própria no painel: erro ao iniciar aparece no bloco de terminal criado | — |
| `onClick={() => void openFileInCanvas(entry)}` (button) | clique | text-file:open-in-project autoriza o arquivo dentro do projeto registrado; com ok, cria um bloco de arquivo no canvas (onOpenFileInCanvas) e fecha o painel (desabilitado: não renderiza para pastas; transparente até hover/foco) | recusa: loadError com a mensagem do processo principal ou "Não foi possível abrir o arquivo." | — |
| `onClick={() => void addProject()}` (button) | clique | projects:pick-folder abre o seletor do sistema; projects:detect-repos registra a pasta (ou cada repositório filho de primeiro nível) com projects:save, pulando caminhos já registrados; relê a lista (projects:list) e avisa o canvas (onProjectsChanged → menu de terminais) (desabilitado: busy (adição em andamento)) | cancelar o seletor não faz nada; erro engolido: o resultado de projects:save não é lido e uma rejeição de IPC escapa do try/finally sem aviso (só o botão volta ao normal) | — |
| `onClick={() => void removeProject(project.id)}` (button) | clique | onRemoveFolder → useCanvasProjects.removeProjectFolder: tira o projeto da lista (projects:delete; nada sai do disco), relê a lista e avisa o canvas | erro engolido: o boolean devolvido não é lido; se o delete falhou, a releitura mostra o projeto de volta sem mensagem | — |
| `onClick={() => setPendingRemovalId(null)}` (button) | clique | desiste da remoção: a linha volta ao normal (pendingRemovalId = null) | sem falha própria (estado local) | — |
| `onClick={() => openProject(project)}` (button) | clique | abre o navegador de pastas na raiz do projeto: limpa entradas, erro e remoção pendente e chama projects:list-directory | ok=false vira loadError; erro engolido: rejeição deixa "Carregando…" sem aviso | — |
| `onClick={() => setPendingRemovalId(project.id)}` (button) | clique | pede confirmação na própria linha (pendingRemovalId = id), sem window.confirm (desabilitado: transparente até hover/foco (invisível em toque)) | sem falha própria (estado local) | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| nenhum smoke abre o painel Projetos: adicionar pasta, remover em dois toques, navegar e rodar/abrir arquivo só têm teste das funções puras e dos handlers | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| ProjectsPanel.tsx:133: sem repositório na pasta escolhida, o nome sai de folder.split("/"); no Windows o caminho (realpath) usa "\" e o projeto é registrado com o caminho inteiro como nome | baixo | `3ec91f95-497e-8103-b360-c1979d6992f4` |
| ProjectsPanel.tsx:188-199: goUp não limpa loadError — o erro de abrir arquivo/editor continua na tela depois de subir de pasta, sobre uma listagem que carregou bem | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| erro engolido: ProjectsPanel.tsx:116-154 e 158-166 ignoram o resultado de projects:save e de onRemoveFolder; pickFolder/detectRepos/save/listDirectory sem catch (listDirectory rejeitado prende o "Carregando…") | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Notas (blocos do canvas e notas salvas)

- **ID:** `tool-notes` · **Dono:** `src/features/canvas/components/tools/NotesPanel.tsx`
- **Persistência:** processo principal: notas salvas (notes:save / notes:delete), as mesmas do chat; canvas salvo: blocos nota, desenho e Excalidraw criados pelos botões Novo; localStorage felixo:canvas-panel-width:notes e felixo:canvas-panel-height:notes
- **IPC:** `notes:list`, `notes:save`, `notes:delete`
- **Depende de:** `CanvasPanel`, `addNode (CanvasView)`, `focusNode (CanvasView)`
- **Sobreposição:** CanvasPanel absolute z-20 (z-30 com foco dentro), top-16, left = 1rem + largura viva da sidebar; abaixo da sidebar (26), dos toasts/overlay isBusy (50), dos diálogos (60) e do FelixoSelect (1000); mesmo z da lista Elementos (z-20, direita). Porte sm; o conteúdo rola por dentro (overflow-auto)
- **Testes:** nenhum

| Estado | Quando |
| --- | --- |
| normal | três listas dos blocos do canvas (nota, desenho, Excalidraw) com botão de criar, e as notas salvas compartilhadas com o chat, editáveis no lugar |
| empty | cada lista tem seu aviso: "Nenhum bloco de nota no canvas.", "Nenhum bloco de desenho no canvas.", "Nenhum bloco Excalidraw no canvas.", "Nenhuma nota salva ainda." — este também quando notes:list falha (erro mascarado) |
| pending | edição de título ou conteúdo de nota salva espera 500 ms (SAVE_DEBOUNCE_MS) antes do notes:save |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={onAddNote}` (button) | clique | cria um bloco de nota vazio no canvas (addNode note), o mesmo fluxo do botão da barra; o bloco entra na lista de cima | sem falha própria no painel; a gravação do bloco é a do canvas | — |
| `title="Centralizar esta nota no canvas"` (button) | clique | focusNode: centraliza o bloco de nota com zoom 1,2 e seleciona só ele | bloco removido entre o render e o clique: nada acontece | — |
| `onClick={onAddDrawing}` (button) | clique | cria um bloco de desenho leve vazio no canvas (addNode drawing) | sem falha própria no painel; a gravação do bloco é a do canvas | — |
| `<Pencil size={14}` (button) | clique | focusNode: centraliza o bloco de desenho leve e seleciona só ele | bloco removido entre o render e o clique: nada acontece | — |
| `onClick={onAddExcalidrawDrawing}` (button) | clique | cria um bloco Excalidraw vazio no canvas (addNode excalidrawDrawing); o Excalidraw carrega sob demanda dentro do bloco | falha do chunk do Excalidraw aparece no bloco, não no painel | — |
| `<PenTool size={14}` (button) | clique | focusNode: centraliza o bloco Excalidraw e seleciona só ele | bloco removido entre o render e o clique: nada acontece | — |
| `onClick={() => void addSavedNote()}` (button) | clique | grava "Nova nota" com notes:save e só então a acrescenta à lista de notas salvas | erro engolido: o resultado de notes:save não é lido — a nota aparece na lista mesmo sem ter sido gravada; rejeição escapa sem aviso | — |
| `aria-label="Remover nota"` (button) | clique | cancela o salvamento pendente da nota, chama notes:delete e tira a nota da lista, sem confirmação | erro engolido: o resultado de notes:delete não é lido; a nota some e volta ao reabrir o painel se o delete falhou | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| nenhum teste (unitário ou smoke) cobre o painel Notas: criar blocos, centralizar, criar/editar/remover nota salva | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| NotesPanel.tsx:64-68: ao desmontar (Fechar, Esc, trocar de ferramenta) os timers de 500 ms são cancelados sem gravar — a última edição feita a menos de ~340 ms do fechamento (500 ms − 160 ms de saída; trocar de ferramenta desmonta na hora) se perde | médio | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| erro engolido: NotesPanel.tsx:72-74, 113 e 123 chamam notes:save/notes:delete sem ler o resultado nem tratar rejeição; notes:list falho vira "Nenhuma nota salva ainda." | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Modelos configurados

- **ID:** `tool-models` · **Dono:** `src/features/canvas/components/tools/ModelsPanel.tsx`
- **Persistência:** processo principal: modelos (models:delete), os mesmos do chat; localStorage felixo:canvas-panel-width:models e felixo:canvas-panel-height:models
- **IPC:** `models:list`, `models:delete`
- **Depende de:** `CanvasPanel`
- **Sobreposição:** CanvasPanel absolute z-20 (z-30 com foco dentro), top-16, left = 1rem + largura viva da sidebar; abaixo da sidebar (26), dos toasts/overlay isBusy (50), dos diálogos (60) e do FelixoSelect (1000); mesmo z da lista Elementos (z-20, direita). Porte sm
- **Testes:** nenhum

| Estado | Quando |
| --- | --- |
| normal | lista dos modelos configurados (nome, CLI e comando), só leitura e remover; criar continua no fluxo do chat |
| empty | "Nenhum modelo configurado." — também enquanto models:list não respondeu e quando falhou (não há estado de carregando nem de erro) |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => void removeModel(model.id)}` (button) | clique | models:delete sem confirmação e relê a lista (models:list): o modelo some | erro engolido: o resultado do delete não é lido; se falhou, a releitura mantém o modelo sem mensagem; rejeição escapa sem aviso | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| nenhum teste cobre o painel Modelos (listar e remover) | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| erro engolido: ModelsPanel.tsx:29 (list sem catch: falha vira lista vazia) e 39-45 (remoção sem confirmação, sem leitura do resultado e sem retorno) | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Prompts (catálogo de automações)

- **ID:** `tool-prompts` · **Dono:** `src/features/canvas/components/tools/PromptsPanel.tsx`
- **Persistência:** processo principal: prompts personalizados e edições de preset (automations:save / automations:delete); canvas salvo: lastPromptInsertion do bloco de terminal (nome e origem, sem o corpo); arquivo temporário de contexto em <userData>/context-deliveries (context-file:write); localStorage felixo:canvas-panel-width:prompts e felixo:canvas-panel-height:prompts; nenhuma para filtro, seleção e rascunho
- **IPC:** `automations:list`, `automations:save`, `automations:delete`, `context-file:write`, `pty:write`
- **Depende de:** `CanvasPanel`, `insertPrompt (CanvasView)`, `terminal-session-store.sendText`, `prompt-overrides`, `prompt-composition`, `prompt-delivery-feedback`, `custom-automation-creation`, `defaultAutomations`, `FelixoSelect`
- **Sobreposição:** CanvasPanel absolute z-20 (z-30 com foco dentro), top-16, left = 1rem + largura viva da sidebar; abaixo da sidebar (26), dos toasts/overlay isBusy (50), dos diálogos (60) e do FelixoSelect (1000); mesmo z da lista Elementos (z-20, direita). Porte xl (o mais largo); disputa largura com a gaveta fixada e fica sob a lista Elementos em janela pequena
- **Testes:** `scripts/canvas-smoke-prompts.cjs` → `catalogo`, `scripts/canvas-smoke-prompts.cjs` → `combinacao`, `scripts/canvas-smoke-prompts.cjs` → `fallback`, `scripts/canvas-smoke-prompts.cjs` → `semTerminalAberto`, `src/features/canvas/terminal/prompt-origins-e2e.test.ts`, `src/features/canvas/services/prompt-composition.test.ts`, `src/features/canvas/services/prompt-delivery-feedback.test.ts`, `src/features/canvas/services/prompt-overrides.test.ts`, `src/features/canvas/services/custom-automation-creation.test.ts`, `src/features/shared/data/automations.test.ts`, `src/features/shared/types/prompt-insertion.test.ts`

| Estado | Quando |
| --- | --- |
| normal | catálogo agrupado por escopo (presets do app + personalizados) com filtro por texto; marcar vários monta uma única tarefa; presets só se editam pelo detalhe (Ver) |
| empty | filtro sem correspondência: os grupos somem sem aviso; sem seleção: "Nenhum prompt selecionado." |
| error | failed: "O terminal não confirmou o recebimento. Tente novamente." e o botão vira "Tentar de novo" até nova tentativa; gravação falha: "Não foi possível salvar este prompt. Tente novamente." por 2,5 s; rascunho recusado: mensagem do createCustomAutomation abaixo dele |
| pending | Inserir/Enviar conjunto aguardando a confirmação real do PTY: "Enviando…" e o botão travado (pendingId); rascunho sendo criado: "Criando…" |
| success | retorno role=status com data-felixo-delivery-feedback: sent "Digitado no terminal aberto. Revise e aperte Enter para enviar.", sent-inline (fallback sem arquivo de contexto, com aviso no bloco), copied "Sem terminal aberto — copiado para a área de transferência."; some em 2,5 s |
| disabled | Novo prompt com rascunho aberto; Enviar conjunto sem seleção ou enviando; Inserir enquanto aquele prompt envia; Criar prompt enquanto cria |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={startCustomAutomation}` (button) | clique | abre o rascunho local "Novo prompt" (escopo chat) acima da lista; nada é gravado ainda (desabilitado: já há um rascunho aberto (sem estilo visual de desabilitado)) | sem falha própria (estado local) | — |
| `aria-label="Cancelar novo prompt"` (button) | clique | descarta o rascunho sem gravar | sem falha própria (estado local) | — |
| `value={draft.scope}` (select) | clique | muda o escopo do rascunho (updateDraft); só vale ao criar | sem falha própria (estado local) | — |
| `onClick={() => void createDraftAutomation()}` (button) | clique | createCustomAutomation recusa texto vazio ("Preencha o texto do prompt para criá-lo."); senão automations:save e, com ok, o prompt entra na lista e o rascunho fecha (desabilitado: criação em andamento (isCreatingDraft)) | IPC recusado ou rejeitado: "Não foi possível criar este prompt. Tente novamente." abaixo do rascunho, que continua aberto | — |
| `onClick={() => void insertSelected()}` (button) | clique | composeSelectedPromptInsertion junta os marcados na ordem do catálogo e insertPrompt digita no terminal expandido, sem Enter, pelo arquivo de contexto (context-file:write) + pty:write; o cartão do bloco mostra os nomes combinados; sem terminal expandido, copia (desabilitado: nenhum prompt marcado ou envio em andamento) | PTY sem confirmação: "Tentar de novo" + aviso em vermelho; erro engolido: sem terminal aberto, uma rejeição de navigator.clipboard.writeText escapa do try/finally e nenhum retorno aparece | `scripts/canvas-smoke-prompts.cjs` → `combinacao` |
| `onClick={() => setDetailId(prompt.id)}` (button) | clique | troca a lista pelo detalhe do preset (PromptDetailPanel, panelId prompt-detail) na mesma moldura (desabilitado: só aparece em presets) | sem falha própria (estado local) | — |
| `data-felixo-prompt-insert` (button) | clique | digita o prompt no terminal expandido sem Enter (autoSubmit false): grava o arquivo de contexto (context-file:write) e escreve a referência no PTY (pty:write); o cartão do bloco mostra o nome (data-felixo-last-prompt) e o canvas grava só a metadata (lastPromptInsertion); sem terminal expandido, copia o texto (desabilitado: aquele prompt está enviando) | PTY sem confirmação: "Tentar de novo" com aviso em vermelho; pasta de contexto indisponível: entrega inline (sent-inline) com aviso no bloco; erro engolido se o clipboard rejeitar; sem navigator.clipboard o painel diz "copiado" sem copiar | `scripts/canvas-smoke-prompts.cjs` → `catalogo` |
| `aria-label="Remover prompt"` (button) | clique | cancela o salvamento pendente, chama automations:delete e tira o prompt da lista, sem confirmação (desabilitado: só aparece em prompts personalizados) | erro engolido: resultado do delete ignorado; o prompt volta ao reabrir se não foi apagado | — |
| `value={prompt.scope}` (select) | clique | muda o escopo de um prompt personalizado; grava com debounce de 500 ms (automations:save) e o prompt muda de grupo | "Não foi possível salvar este prompt. Tente novamente." por 2,5 s no item; fechar antes de 500 ms descarta a gravação | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| com a gaveta aberta, clicar na sidebar a fecha (o smoke precisa fixá-la) e, na janela de 1008×655, a lista Elementos cobre parte do painel (o smoke aciona pelo teclado) | médio | `3eb91f95-497e-814a-8b2c-e471e09f6ff3` |
| o retorno failed ("Tentar de novo") nunca é exercitado: o smoke cobre sent, sent-inline e copied | médio | `3d791f95-497e-81cd-b05c-c9d6370c81a3` |
| Inserir e Enviar conjunto só foram clicados com a CLI roteirizada do smoke, não no app empacotado com CLI real | médio | `3d791f95-497e-81bf-a6c7-efef573d87ae` |
| Novo prompt/Criar, edição com autosave, troca de escopo e Remover não têm teste de interface (só as funções puras) | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| PromptsPanel.tsx:95-99: ao desmontar, os timers de 500 ms (edição de prompt personalizado e Salvar do detalhe) são cancelados sem gravar — fechar ou trocar de ferramenta logo depois de editar perde a edição | médio | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| erro engolido: PromptsPanel.tsx:138-146 e 168-177 não tratam a rejeição de navigator.clipboard.writeText (CanvasView.tsx:1826), e sem navigator.clipboard o retorno diz "copiado" sem copiar; automations:delete sem leitura do resultado (PromptsPanel.tsx:311) | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Skills (biblioteca e skills próprias)

- **ID:** `tool-skills` · **Dono:** `src/features/canvas/components/tools/SkillsPanel.tsx`
- **Persistência:** processo principal: skills próprias (canvas:set-skills) e configuração da biblioteca — terceiros e ocultas (canvas:set-skills-settings); canvas salvo: lastPromptInsertion do bloco de terminal ao ativar; memória do CanvasView: availableSkillsRef (lista que o próximo agente recebe); localStorage felixo:canvas-panel-width:skills e felixo:canvas-panel-height:skills
- **IPC:** `canvas:get-skills`, `canvas:set-skills`, `canvas:list-available-skills`, `canvas:set-skills-settings`, `context-file:write`, `pty:write`
- **Depende de:** `CanvasPanel`, `activateSkill (CanvasView)`, `skills-panel-catalog (readSkillsCatalog, hideSkillId, restoreSkillId)`, `describeSkillActivationFeedback`, `terminal-session-store.sendText`
- **Sobreposição:** CanvasPanel absolute z-20 (z-30 com foco dentro), top-16, left = 1rem + largura viva da sidebar; abaixo da sidebar (26), dos toasts/overlay isBusy (50), dos diálogos (60) e do FelixoSelect (1000); mesmo z da lista Elementos (z-20, direita). Porte sm; a lista do sistema tem max-h-40 com rolagem interna e respiro para o anel de foco
- **Testes:** `scripts/canvas-smoke-prompts.cjs` → `skill`, `scripts/canvas-smoke-prompts.cjs` → `gravado`, `src/features/canvas/components/tools/skills-panel-catalog.test.ts`, `electron/services/canvas-ipc-handlers.test.cjs`, `src/features/canvas/services/prompt-delivery-feedback.test.ts`, `src/features/canvas/terminal/prompt-origins-e2e.test.ts`

| Estado | Quando |
| --- | --- |
| normal | seção "Skills do sistema" (biblioteca do app + terceiros, a lista que todo agente novo recebe) com Ativar, ocultar, checkbox "Usar skills de terceiros" e a lista de ocultas recolhível; abaixo, as skills próprias da pessoa |
| empty | sem skills próprias: "Nenhuma skill sua ainda — …"; sem ocultas: "Nenhuma skill oculta. …" |
| error | Ativar sem confirmação do PTY: "O terminal não confirmou o recebimento. Tente novamente." até nova tentativa; canvas:set-skills-settings recusado: role=alert com a mensagem (erroSistema) |
| success | Ativar: retorno role=status "Digitada no terminal aberto. Revise e aperte Enter para enviar." ou "Sem terminal aberto — copiada para a área de transferência." por 2,5 s |
| disabled | Salvar sem nome ou sem caminho |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={startNew}` (button) | clique | abre o formulário (nome, caminho, descrição) com foco no nome | sem falha própria (estado local) | — |
| `onClick={() => void saveDraft()}` (button) | clique | nova: acrescenta a skill; edição: substitui; grava a lista com canvas:set-skills, relê o catálogo (canvas:list-available-skills) e avisa o CanvasView (onCatalogChange → availableSkillsRef) para o próximo agente já nascer com ela (desabilitado: nome ou caminho vazio) | erro engolido: o resultado de canvas:set-skills não é lido — a lista local já mostra a skill (setSkills otimista) mesmo sem gravar; o caminho não é validado | — |
| `Cancelar` (button) | clique | fecha o formulário e descarta o rascunho | sem falha própria (estado local) | — |
| `data-felixo-skill-activate` (button) | clique | buildSkillActivationPrompt: digita no terminal expandido, sem Enter, a instrução de ler o arquivo da skill (context-file:write + pty:write); o cartão do bloco mostra o nome e o canvas grava lastPromptInsertion com source skill; sem terminal, copia | PTY sem confirmação: aviso em vermelho até nova tentativa; erro engolido: activate não tem try, e a rejeição do clipboard (CanvasView.tsx:1801) não mostra retorno; sem estado "enviando" nem trava de duplo clique | `scripts/canvas-smoke-prompts.cjs` → `skill` |
| `data-skill-action="ocultar"` (button) | clique | leva o foco ao mesmo botão da linha vizinha (ou a "Ocultas"), grava hiddenBuiltinIds com canvas:set-skills-settings e relê o catálogo: a skill sai da lista dos agentes novos | recusa: role=alert com a mensagem (ou "Não foi possível salvar a configuração das skills.") e o catálogo relido mostra o que está gravado | — |
| `aria-controls={listaOcultasId}` (button) | clique | abre/fecha a lista de skills ocultas (aria-expanded) | sem falha própria (estado local) | — |
| `data-skill-action="restaurar"` (button) | clique | tira o id de hiddenBuiltinIds (canvas:set-skills-settings) e relê o catálogo: a skill volta à lista dos agentes | recusa: role=alert com a mensagem e o catálogo relido | — |
| `title="Ativar: enviar ao terminal aberto (ou copiar)"` (button) | clique | mesma ativação da biblioteca para uma skill própria: digita a instrução no terminal expandido sem Enter, ou copia | PTY sem confirmação: aviso em vermelho na linha; erro engolido na rejeição do clipboard; sem trava de duplo clique | — |
| `onClick={() => startEdit(skill)}` (button) | clique | abre o formulário preenchido com a skill (editingId) | sem falha própria (estado local) | — |
| `onClick={() => void removeSkill(skill.id)}` (button) | clique | tira a skill da lista e grava com canvas:set-skills, sem confirmação; relê o catálogo | erro engolido: resultado de canvas:set-skills ignorado; a skill some da tela mesmo se a gravação falhou | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| mesma disputa do Prompts: com a gaveta aberta e sem fixá-la, clicar na sidebar fecha a gaveta; a lista Elementos cobre parte do painel em janela pequena | médio | `3eb91f95-497e-814a-8b2c-e471e09f6ff3` |
| só o Ativar da biblioteca é exercitado (P4); Ativar de skill própria, criar/editar/remover, ocultar/restaurar e o checkbox de terceiros não têm teste de interface | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| erro engolido: SkillsPanel.tsx:168-172 (persist ignora o resultado de canvas:set-skills e mostra a lista nova mesmo sem gravar) e 209-218 (activate sem try: rejeição do clipboard em CanvasView.tsx:1801 sem retorno) | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Source Control (Git)

- **ID:** `tool-git` · **Dono:** `src/features/canvas/components/tools/GitPanel.tsx`
- **Persistência:** repositório git no disco: commit, stage, branch e remoto (pull/push); nenhuma para repositório escolhido, filtro, aba e explorador (fechar o painel zera tudo); sem chave de largura/altura: a variante workspace não tem alças
- **IPC:** `projects:list`, `git:get-summary`, `git:list-files`, `git:list-branches`, `git:switch-branch`, `git:get-log`, `git:pull`, `git:push`, `git:commit`
- **Depende de:** `CanvasPanel (variant workspace)`, `useCanvasSurfaces (reportPanelWidth)`, `parseStatusEntries`, `repo-tree (buildRepoTree, dirsWithChanges, ancestorPaths)`, `FelixoSelect`, `GitExplorer`, `GitChangesList`, `GitHistory`, `GitDiffView`
- **Sobreposição:** variante workspace: absolute z-20 (z-30 com foco), top-4, left = 1rem + sidebar, right = inspector + 16 px, altura toda (maxHeight); reporta a largura ao coordenador (reportPanelWidth) e deixa a faixa mínima de canvas (MIN_CANVAS_STRIP 160 px); recolhido vira coluna de 44 px
- **Testes:** `src/features/canvas/components/tools/git-status.test.ts`, `src/features/canvas/components/tools/repo-tree.test.ts`, `src/features/canvas/components/tools/git-diff.test.ts`, `electron/services/git-service.test.cjs`, `electron/services/git-secret-redaction.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | variante workspace: cabeçalho com repositório, branch e pull/push/atualizar; colunas explorador, alterações/histórico e leitor |
| loading | Atualizar gira (felixo-spin) enquanto busy; explorador "Lendo o repositório…", histórico "Lendo o histórico…", leitor "Lendo diferenças…" |
| empty | sem projetos: "Nenhum projeto cadastrado. Adicione um na ferramenta Projetos."; sem repositório escolhido: só o seletor; repositório limpo: "Sem alterações pendentes." |
| error | git:get-summary ou ação recusada: texto em vermelho (felixo-scm-error) com a mensagem do git ou o fallback ("Falha ao consultar o repositório Git.", "Falha ao criar o commit." …) |
| success | saída de push/pull/troca de branch aparece como aviso (felixo-scm-notice) quando não há erro |
| disabled | Branch, Pull, Push, Atualizar e Commit travados enquanto busy; Pull sem upstream; Push sem branch; Commit sem mensagem ou sem nada no stage |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-pressed={explorerOpen}` (button) | clique | mostra/esconde a coluna do explorador (desabilitado: só aparece com um repositório carregado) | sem falha própria (estado local, não persiste) | — |
| `aria-label="Repositório"` (select) | clique | selectProject: limpa seleção, leitor, aviso e filtro e carrega em paralelo git:get-summary, git:list-files, git:list-branches e git:get-log; abre as pastas com mudança | summary recusado: mensagem em vermelho e o corpo some; falha de list-files/list-branches/get-log vira lista vazia sem aviso (ver lacuna); rejeição de IPC não tratada | — |
| `aria-label="Branch"` (select) | clique | git:switch-branch para a branch escolhida (ignora a atual) e relê status, árvore, histórico e branches, limpando o leitor (desabilitado: busy) | recusa (ex.: alterações que impedem a troca): mensagem do git em vermelho; nada é relido | — |
| `window.felixo?.git?.pull({ projectPath })` (button) | clique | git:pull só com avanço rápido (--ff-only) e relê status, árvore, histórico e branches; a saída do git vira aviso (desabilitado: busy ou branch sem upstream) | recusa: mensagem do git ou "Falha ao atualizar (pull)." em vermelho | — |
| `window.felixo?.git?.push({ projectPath })` (button) | clique | git:push sem force (define o upstream em origin quando falta) e relê status, histórico e branches (desabilitado: busy ou sem branch) | recusa: mensagem do git ou "Falha ao enviar (push)." em vermelho | — |
| `onClick={() => void refreshAll()}` (button) | clique | relê summary, árvore, branches e histórico em paralelo (desabilitado: busy) | summary recusado vira mensagem em vermelho; os outros três caem em lista vazia sem aviso | — |
| `onClick={() => setView('changes')}` (button) | clique | coluna do meio mostra mensagem de commit, Commit e os grupos Stage/Alterações | sem falha própria (estado local) | — |
| `onClick={() => setView('history')}` (button) | clique | coluna do meio mostra o histórico (GitHistory), com os commits não enviados marcados | sem falha própria (estado local) | — |
| `onClick={() => void commit()}` (button) | clique | git:commit com a mensagem aparada e relê status, árvore, histórico e branches; limpa o leitor e a mensagem (desabilitado: busy, mensagem vazia ou nada no stage) | recusa: mensagem do git ou "Falha ao criar o commit." em vermelho — e a mensagem digitada é apagada mesmo assim (ver lacuna) | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| nenhum teste de interface do Source Control: escolher repositório, trocar branch, pull/push, commit e as abas (só o serviço do processo principal e as funções puras) | alto | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| GitPanel.tsx:323-334: commit() chama setMessage("") depois de runAction mesmo quando o commit falhou — a mensagem digitada some junto com o erro | médio | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| GitPanel.tsx:119, 137 e 148: falha de git:list-files, git:list-branches e git:get-log vira lista vazia sem erro — o explorador diz "Nenhum arquivo corresponde ao filtro." e o histórico "Nenhum commit ainda." | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| erro engolido: GitPanel.tsx:192-212 (selectProject) e 284-321 (runAction) não têm catch — uma rejeição de IPC escapa sem mensagem | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| a variante workspace com a gaveta do terminal aberta nunca foi medida: painel, gaveta e inspector disputam a largura e o painel pode cair no piso de 260 px | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Fetch All

- **ID:** `tool-fetch-all` · **Dono:** `src/features/canvas/components/tools/FetchAllPanel.tsx`
- **Persistência:** processo principal: userData/config/fetch-all-settings.json (raízes da varredura e pastas ignoradas); processo principal: plano vivo em memória e cache da última varredura completa (usado pela Rápida); reabrir o painel retoma por fetch-all:get-state; processo principal: relatório de cada execução em userData/reports; processo principal: pedidos de agentes em userData/agent-requests; nenhuma: a confirmação do escopo amplo é estado do componente
- **IPC:** `fetch-all:get-state`, `fetch-all:get-settings`, `fetch-all:save-settings`, `fetch-all:pick-roots`, `fetch-all:get-scope`, `fetch-all:scan`, `fetch-all:execute`, `fetch-all:cancel`, `fetch-all:ignore-path`, `fetch-all:unignore-path`, `fetch-all:progress`, `fetch-all:list-requests`, `fetch-all:resolve-request`, `fetch-all:agent-requests`
- **Depende de:** `window.felixo.fetchAll`, `CanvasPanel`, `FetchAllScanRoots`, `fetch-all-plan (buildPlanSections, planHasSafeActions, summarizeResults)`, `fetch-all-agent-requests (pickPendingRequest, applyAgentRequestResult)`, `fetch-all-roots (addPickedRoots, removeScanRoot)`
- **Sobreposição:** CanvasPanel: absolute z-20 (z-30 com foco dentro), top-16, à direita da barra lateral e deslocado quando o menu de ferramentas abre (toolsMenuOpen); largura limitada a viewport − barra − inspector Elementos (288 px) e altura a viewport − 112. Os menus do FelixoSelect abrem em portal z-1000 por cima; toasts (z 50) e AgentQuestionDialog/HandoffDialog (z 60) cobrem o painel. Em janela <768 px o painel passa da viewport (PANEL_MIN_WIDTH 260, task 3e691f95-497e-815c-a129-f4d2d6405cbc). Tamanho md; a lista de discos (max-h-20), as seções (max-h-40) e os resultados rolam por dentro
- **Testes:** `src/features/canvas/components/tools/fetch-all-plan.test.ts`, `src/features/canvas/components/tools/fetch-all-agent-requests.test.ts`, `src/features/canvas/components/tools/fetch-all-roots.test.ts`, `electron/services/fetch-all-ipc-handlers.test.cjs`, `electron/services/fetch-all-service.test.cjs`, `electron/services/fetch-all/agent-requests.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Cartão "Escopo da varredura" com raízes, motivo e custo esperado, e os botões Varredura completa/Rápida; com plano, as contagens de pull/push/pendências e uma seção por grupo de repositórios |
| loading | scopeLoading mostra "Calculando o escopo disponível…"; busy mostra a faixa com spinner, describeProgress (ou "Preparando…") e o botão de cancelar |
| empty | Sem raiz: "nenhuma raiz — a varredura está bloqueada"; sem disco: "Nenhum disco local foi detectado."; sem pasta ignorada, a lista explica o ícone de ignorar |
| error | `error` preenchido (falha de get-scope, scan, execute, ignore-path, save-settings ou resolve-request) vira faixa vermelha acima do plano |
| pending | Pedido de agente pendente (cartão âmbar "Nada foi executado — depende de você"); escopo amplo esperando confirmação (requiresConfirmation sem confirmedScopeKey); execução esperando "Confirmar execução" |
| success | results preenchido mostra summarizeResults, o caminho do relatório e só as ações que falharam; "Escopo amplo confirmado nesta sessão" depois de confirmar |
| disabled | Botões de varrer desabilitados com SCAN_BLOCKED_HINT quando !scanAllowed; "Executar plano" desabilitado sem ação segura; tudo que escreve fica desabilitado durante busy |
| denied | Recusar o pedido do agente resolve o pedido como recusado (aceito: false) e ele sai da fila |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Aplicar o plano revisado` (button) | clique | fetch-all:resolve-request com aceito: true: o main executa o plano que está na tela (com commit se o pedido trouxe comCommit), revalidando cada repositório antes da escrita; dando certo, o pedido sai da fila como aceito, aparecem resultados e relatório e o plano some (desabilitado: só aparece com pedido pendente, plano na tela e nada rodando (agentRequestAction = aplicar)) | Execução que falha mantém o pedido pendente e mostra a mensagem em vermelho (applyAgentRequestResult); pedido que já não está pendente volta "Esse pedido não está mais pendente." | — |
| `Varrer para revisar` (button) | clique | Mesma varredura completa (fetch-all:scan sem cache) para gerar o plano que o pedido do agente vai aplicar; nada é escrito (desabilitado: busy ou !scanAllowed; ocupa o lugar de "Aplicar" enquanto não há plano) | Falha da varredura vira faixa vermelha; sem escopo liberado o botão fica desabilitado com SCAN_BLOCKED_HINT | — |
| `Recusar` (button) | clique | fetch-all:resolve-request com aceito: false: o pedido fica gravado como recusado em userData/agent-requests e o cartão some (listRequests recarrega) (desabilitado: busy) | Pedido que já não está pendente volta ok sem mudar nada; falha do IPC aparece em vermelho | — |
| `Confirmar escopo amplo e habilitar varredura` (button) | clique | Guarda o scopeKey exibido em confirmedScopeKey: os botões de varrer habilitam e a próxima fetch-all:scan vai com confirmUnconfiguredScope e scopeKey (desabilitado: busy ou nenhum disco disponível; só aparece com requiresConfirmation) | Se os discos mudarem, o main devolve needsScopeConfirmation (ou outro scopeKey) e a confirmação é zerada; a confirmação é estado do componente e some ao fechar o painel | — |
| `Varredura completa` (button) | clique | fetch-all:scan sem cache: percorre o escopo exibido, faz fetch em cada repositório (só mexe em .git) e mostra o plano com o modo da varredura; o progresso chega por fetch-all:progress (desabilitado: busy ou !scanAllowed) | "Já existe uma passada em andamento." ou a mensagem do main em vermelho; cancelada, volta cancelled e o plano fica vazio | — |
| `Rápida` (button) | clique | fetch-all:scan com useCache: reaproveita a lista de repositórios da última varredura completa (não acha repositório novo) e refaz o plano (desabilitado: busy ou !scanAllowed) | Mesmas falhas da varredura completa, em vermelho | — |
| `Cancelar a passada` (button) | clique | fetch-all:cancel aborta a passada: a varredura para na próxima pasta; na execução a ação git em curso termina e nenhuma outra começa (desabilitado: só aparece durante busy) | Retorno ignorado (void); sem passada ativa o main devolve cancelled: false e nada muda | — |
| `Ignorar esta pasta nas próximas varreduras` (button) | clique | fetch-all:ignore-path grava a pasta em ignoredPaths (fetch-all-settings.json) e o main devolve o plano já sem ela (desabilitado: busy; o ícone só aparece no hover da linha (opacity-0)) | "Falha ao ignorar a pasta." (ou a mensagem do main) em vermelho | — |
| `Confirmar execução` (button) | clique | fetch-all:execute com o autoCommit da caixa: pull --ff-only e push só nos repositórios seguros (e commit automático dos candidatos, se marcado); mostra resultados e relatório e descarta o plano executado (desabilitado: busy) | "Já existe uma passada em andamento.", "Faça uma varredura antes de executar." ou falha do git em vermelho; ações que falharam aparecem listadas | — |
| `onClick={() => setConfirmingExecute(false)}` (button) | clique | Botão "Cancelar" da confirmação: volta ao "Executar plano" sem chamar o main | sem falha própria | — |
| `Executar plano` (button) | clique | Primeiro passo da execução: troca o botão pelo par "Confirmar execução"/"Cancelar" (confirmingExecute) (desabilitado: busy ou planHasSafeActions falso) | sem falha própria; sem ação segura o botão fica desabilitado com o title "O plano não tem nenhuma ação segura" | — |
| `Pastas ignoradas (` (button) | clique | Abre e fecha a lista de settings.ignoredPaths, com a contagem no rótulo | sem falha própria; se get-settings falhou, mostra 0 e a lista vazia (ver lacuna) | — |
| `Voltar a varrer esta pasta` (button) | clique | fetch-all:unignore-path tira a pasta de ignoredPaths e a lista se atualiza com as configurações devolvidas | erro engolido: com ok: false nada acontece na tela (FetchAllPanel.tsx:280-285) | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum teste de interface abre o Fetch All: varrer, confirmar o escopo amplo, executar com confirmação, ignorar/reincluir pasta e responder pedido de agente só têm cobertura no main e nas funções puras | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| Erros engolidos: falha de fetch-all:get-settings (FetchAllPanel.tsx:89-94) deixa settings nulo sem aviso — raízes desabilitadas e "Pastas ignoradas (0)" —, e falha de fetch-all:unignore-path (FetchAllPanel.tsx:280-285) não mostra nada | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Pedido de agente que chega com o painel fechado não acende nada no canvas: só FetchAllPanel escuta fetch-all:agent-requests, e a pessoa só vê o pedido se abrir a ferramenta | médio | `3eb91f95-497e-81b8-a70f-dfce2a446a3e` |

### Limites e uso

- **ID:** `tool-agent-usage` · **Dono:** `src/features/canvas/components/tools/AgentUsagePanel.tsx`
- **Persistência:** processo principal: SQLite agent_usage_accounts e agent_usage_samples (contas extras e amostras de uso); ~/.claude/settings.json: statusLine do app ao ligar a coleta, com backup da anterior; script e captura em userData/claude-statusline; nenhuma: aba e intervalo de reconsulta são estado do componente
- **IPC:** `agent-usage:list`, `agent-usage:refresh`, `agent-usage:add-account`, `agent-usage:remove-account`, `agent-usage:consume-reset-credit`, `agent-usage:claude-statusline-status`, `agent-usage:enable-claude-statusline`, `agent-usage:disable-claude-statusline`, `agent-usage:changed`
- **Depende de:** `window.felixo.agentUsage`, `CanvasPanel`, `consumeRequestedAgentUsageTab`, `rovingIndex`, `FelixoSelect`, `shouldRunScheduledAgentUsageRefresh`, `getAccountStatus`, `AgentUsageResetCreditsView`, `AgentUsageStatusDetailsView`, `ProviderSummaryTable`, `summarizeProviderAccounts`, `AccountChainSection`, `AccountSwitchHistory`
- **Sobreposição:** CanvasPanel: absolute z-20 (z-30 com foco dentro), top-16, à direita da barra lateral e deslocado quando o menu de ferramentas abre (toolsMenuOpen); largura limitada a viewport − barra − inspector Elementos (288 px) e altura a viewport − 112. Os menus do FelixoSelect abrem em portal z-1000 por cima; toasts (z 50) e AgentQuestionDialog/HandoffDialog (z 60) cobrem o painel. Em janela <768 px o painel passa da viewport (PANEL_MIN_WIDTH 260, task 3e691f95-497e-815c-a129-f4d2d6405cbc). Tamanho lg (o mais largo desta parte); o window.confirm do Remover é diálogo nativo, fora da escala de z
- **Testes:** `src/features/shared/agent-usage/agent-usage.test.ts`, `src/features/canvas/components/tools/AgentUsageProviderSummary.test.ts`, `electron/services/agent-usage-ipc-handlers.test.cjs`, `electron/services/agent-usage-service.test.cjs`, `electron/services/claude-statusline-service.test.cjs`, `electron/services/codex-status-query.test.cjs`, `electron/services/codex-status-screen.test.cjs`, `scripts/canvas-smoke-contas.cjs` → `abrirLimitesEUso`

| Estado | Quando |
| --- | --- |
| normal | Aba "Uso agora": um cartão por provider com versão, a tabela de resumo das contas (AgentUsageProviderSummary.tsx: uma linha por conta com identidade, plano, quanto sobra em cada janela da conta, selo de status e aviso de bloqueio) e, por conta, "— /status completo" recolhido num <details> que guarda o próprio estado entre coletas: barras por janela com reset (a de um modelo só leva a etiqueta "só este modelo"), fonte, horário da medição, resets bancados e os dados completos do /status; o cartão do Codex avisa que os campos da conversa aberta ficam fora de propósito; as abas Cadeia e Trocas montam AccountChainSection e AccountSwitchHistory |
| loading | loading=true na abertura (lista o salvo e em seguida agent-usage:refresh) e no Atualizar; sem conteúdo mostra "Consultando as CLIs instaladas…" e o ícone gira |
| empty | !hasContent e !loading: "Nenhuma CLI foi detectada nesta máquina."; provider sem conta: "Nenhuma conta vinculada a este provider."; conta sem amostra mostra a limitação da fonte por extenso, nunca zero |
| error | statusMessage em faixa âmbar (falha de list/refresh/remover/reset ou "Não foi possível falar com o processo principal."); sem ponte: "Este painel só funciona no app desktop."; amostra com errorMessage aparece na linha da conta |
| success | Selo "ao vivo" depois de um refresh ou de agent-usage:changed; "Reset aplicado com sucesso." depois de usar um reset |
| disabled | Atualizar desabilitado durante loading; "Adicionar ao painel" sem nome; botão da coleta durante busy, e ausente quando ~/.claude/settings.json não é legível ou já tem outra statusLine |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `role="tab"` (button) | clique ou setas/Home/End no tablist (rovingIndex) | Troca a aba entre Uso agora, Cadeia e Trocas (só o tabpanel ativo monta); a aba inicial pode vir pedida por consumeRequestedAgentUsageTab | sem falha própria | `scripts/canvas-smoke-contas.cjs` → `irParaAba` |
| `Atualizar` (button) | clique | agent-usage:refresh: por conta e perfil, abre uma sessão PTY descartável de /status (Claude e Codex; no Codex junto com o app-server, que traz os números), regrava as amostras e acende "ao vivo" (desabilitado: loading) | ok: false ou exceção viram statusMessage âmbar; o painel continua com o último valor conhecido, marcado como antigo pelo selo; a rodada tem teto (REFRESH_DEADLINE_MS, 90 s): estourar cancela a consulta (app-server e PTY do Codex inclusive) e volta com refreshError em vez de girar para sempre | — |
| `Reconectar` (button) | clique | agent-usage:reconnect: abandona a rodada em andamento (aborta as consultas dela, que encerram o PTY do Claude e o app-server do Codex) e refaz do zero; só a resposta do pedido mais recente é aplicada no painel | ok: false ou exceção viram statusMessage âmbar, como no Atualizar; nunca desabilitado — é durante uma coleta presa que ele serve | `electron/services/agent-usage-service.test.cjs` |
| `Intervalo de reconsulta` (select) | clique | Liga um setInterval de 5/15/30 min que chama agent-usage:refresh só quando shouldRunScheduledAgentUsageRefresh deixa (janela visível e Modo Performance desligado); 0 = só ao abrir/atualizar | sem falha própria; a escolha não persiste e volta a 0 ao reabrir o painel | — |
| `Ligar coleta do rate limit` (button) | clique | agent-usage:enable-claude-statusline (ou disable, quando já instalada): grava ou remove a statusLine do app em ~/.claude/settings.json, com backup da anterior, e recarrega o painel (desabilitado: busy; só existe no cartão do Claude, com settings legível e sem statusLine alheia) | erro engolido: a mensagem de falha do main nunca aparece; se o handler lançar, o resultado de erro vira o estado e o botão some atrás de "Não foi possível ler ~/.claude/settings.json" (AgentUsagePanel.tsx:190-204) | — |
| `Remover a conta` (button) | clique e confirmação em window.confirm | agent-usage:remove-account apaga a conta e o histórico local de uso do painel (o perfil de login dos terminais não muda) e redesenha com o dashboard devolvido | "Não foi possível remover a conta do painel." em faixa âmbar; cancelar o confirm não chama nada | — |
| `Adicionar outra conta` (button) | clique | Abre e fecha o formulário de conta extra (desabilitado: só aparece quando há algum provider (hasContent)) | sem falha própria | — |
| `Provider da conta` (select) | clique | Escolhe o provider da conta nova (estado do formulário) | sem falha própria | — |
| `Adicionar ao painel` (button) | clique | agent-usage:add-account com provider, nome local e identificador público; o dashboard volta com a conta, os campos limpam e o formulário fecha (desabilitado: nome vazio) | Mensagem do main (ou "Não foi possível adicionar a conta.") em vermelho dentro do formulário | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Atualizar, Reconsultar, Remover, Adicionar conta e Ligar coleta não têm teste de interface (o smoke de contas só abre o painel e troca de aba); enable/disable da statusLine também não aparece em agent-usage-ipc-handlers.test.cjs | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| AgentUsagePanel.tsx:190-204 e 580-633: a resposta de agent-usage:enable/disable-claude-statusline substitui o estado sem olhar ok; a mensagem de falha (ex.: "Não foi possível gravar o script da status line.") nunca é exibida, e um erro lançado no handler vira estado sem settingsReadable, escondendo o botão atrás de "Não foi possível ler ~/.claude/settings.json" | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| O refresh abre um PTY de /status por conta: erros e lentidão no uso real ainda não foram medidos | médio | `3eb91f95-497e-81fb-9909-fcd86abe2e3f` |

### Orquestrador

- **ID:** `tool-orchestrator` · **Dono:** `src/features/canvas/components/tools/OrchestratorPanel.tsx`
- **Persistência:** processo principal: orchestrator-settings.json na pasta config do userData; localStorage felixo-ai-core.orchestrator-settings (legado: reserva quando o IPC falha; migrado e apagado quando o IPC responde); nenhuma: a execução ao vivo vem de cli:terminal-output e vive só enquanto o painel está montado
- **IPC:** `settings:load-orchestrator`, `settings:save-orchestrator`, `models:list`, `cli:terminal-output`
- **Depende de:** `useOrchestrationDashboard`, `loadOrchestratorSettings`, `saveOrchestratorSettings`, `normalizeOrchestratorSettings`, `window.felixo.models`, `FelixoSelect`, `CanvasPanel`
- **Sobreposição:** CanvasPanel: absolute z-20 (z-30 com foco dentro), top-16, à direita da barra lateral e deslocado quando o menu de ferramentas abre (toolsMenuOpen); largura limitada a viewport − barra − inspector Elementos (288 px) e altura a viewport − 112. Os menus do FelixoSelect abrem em portal z-1000 por cima; toasts (z 50) e AgentQuestionDialog/HandoffDialog (z 60) cobrem o painel. Em janela <768 px o painel passa da viewport (PANEL_MIN_WIDTH 260, task 3e691f95-497e-815c-a129-f4d2d6405cbc). Tamanho md; a lista de modelos e as duas áreas de texto crescem o painel até o teto e rolam por dentro
- **Testes:** `electron/services/orchestrator-settings-store.test.cjs`, `electron/services/cli-request-policy.test.cjs`, `electron/services/orchestration/orchestration-store.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Execução ao vivo no topo (runs, agentes por run com status e fallbacks, modelos que bateram limite) e o formulário: modo, seis limites por execução, confirmação de ações sensíveis, modelos preferidos/bloqueados, contexto fixo e memórias globais |
| loading | Até loadOrchestratorSettings resolver, "Carregando configurações…" ocupa o lugar do formulário |
| empty | "Nenhuma orquestração ativa…" sem runs nem modelos limitados; "Nenhum modelo configurado para orquestração." sem modelo com cliType conhecido |
| error | Agente com status error ganha selo vermelho "erro"; modelo que bateu limite aparece em faixa âmbar com o reset previsto |
| success | "Salvo" com ícone de check por 2 s depois de salvar |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Modo do orquestrador` (select) | clique | Troca draft.mode (Manual, Semiautomático, Automático, Somente leitura, Experimental); só vale depois de Salvar | sem falha própria; fechar o painel sem salvar descarta a escolha | — |
| `onClick={() => void save()}` (button) | clique | saveOrchestratorSettings normaliza o rascunho e grava por settings:save-orchestrator (orchestrator-settings.json); o processo principal aplica agentes por rodada, rodadas, total e minutos em cada execução (cli-request-policy/orchestration-store); mostra "Salvo" por 2 s | IPC que falha cai no localStorage legado e mostra "Salvo" do mesmo jeito; 0 ou decimal nos limites inteiros vira o padrão sem aviso (ver lacuna); se o localStorage também lançar, a promessa rejeita sem aviso | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Painel sem teste de interface (modo, limites, preferidos/bloqueados, Salvar) e sem teste da camada orchestrator-settings-storage do renderer | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| OrchestratorPanel.tsx:101-107 aceita 0 e decimais em Agentes por rodada, Rodadas, Agentes no total e Minutos; normalizePositiveInteger (orchestrator-settings-storage.ts:497) troca esses valores pelo padrão (3, 5, 10, 20) ao salvar, mas a tela continua mostrando o número digitado com "Salvo" | médio | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| Custo estimado, Tokens de contexto e "Pedir confirmação em ações sensíveis" só entram no texto do prompt: nenhum código do processo principal lê maxCostEstimate, maxContextTokens ou requireConfirmationForSensitiveActions | alto | `3e991f95-497e-812b-8456-e0073877e9d7` |
| A execução ao vivo só mostra orquestrações disparadas pela tela de chat; o canvas ainda não orquestra sub-agentes | baixo | `3eb91f95-497e-8131-9977-f8d21c950c68` |

### QA Logger

- **ID:** `tool-qa-logger` · **Dono:** `src/features/canvas/components/tools/QaLoggerPanel.tsx`
- **Persistência:** processo principal: buffer de 400 entradas, hidratado do log em disco (qa-log-disk-store) no boot; processo principal: relatórios problema-<data>.json em userData/reports
- **IPC:** `qa-logger:get`, `qa-logger:clear`, `qa-logger:entry`, `qa-logger:cleared`, `qa-logger:build-report`
- **Depende de:** `window.felixo.qaLogger`, `CanvasPanel`
- **Sobreposição:** CanvasPanel: absolute z-20 (z-30 com foco dentro), top-16, à direita da barra lateral e deslocado quando o menu de ferramentas abre (toolsMenuOpen); largura limitada a viewport − barra − inspector Elementos (288 px) e altura a viewport − 112. Os menus do FelixoSelect abrem em portal z-1000 por cima; toasts (z 50) e AgentQuestionDialog/HandoffDialog (z 60) cobrem o painel. Em janela <768 px o painel passa da viewport (PANEL_MIN_WIDTH 260, task 3e691f95-497e-815c-a129-f4d2d6405cbc). Tamanho lg; a lista cresce até 400 entradas e rola dentro do painel (scrollIntoView no fim)
- **Testes:** `electron/services/qa-logger.test.cjs`, `electron/services/qa-report-builder.test.cjs`, `electron/services/qa-log-disk-store.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Contador de entradas e a lista (até 400) com hora, nível colorido, escopo, mensagem, sessão abreviada e detalhes; rola até o fim a cada entrada nova |
| loading | "Gerando…" enquanto qa-logger:build-report não volta |
| empty | "Aguardando eventos do backend." sem entradas |
| error | "Não foi possível gerar o relatório: <mensagem>" em faixa âmbar (ok falso ou exceção do IPC) |
| success | "Relatório salvo em <caminho>. Anexe este arquivo na task." |
| disabled | "Reportar problema" desabilitado durante a geração |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Reportar problema` (button) | clique | qa-logger:build-report monta versão, SO, arquitetura, as últimas entradas e a detecção das CLIs, grava problema-<data>.json em userData/reports e mostra o caminho (desabilitado: reportState building) | ok falso vira o genérico "Não foi possível gerar o relatório." (a mensagem do main não é usada); exceção (ex.: pasta sem permissão) mostra a mensagem do erro | — |
| `Limpar` (button) | clique | qa-logger:clear esvazia o buffer do processo principal e o evento qa-logger:cleared zera a lista | Retorno ignorado; o log em disco não é apagado, e as entradas voltam no próximo boot (ver lacuna) | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Sem teste de interface do painel; os handlers qa-logger:build-report e qa-logger:clear também não são exercitados em qa-logger.test.cjs | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| Suspeito: "Limpar" só esvazia a memória (qa-logger.cjs:43-47); initQaDiskStore (qa-logger.cjs:19-22) hidrata de novo do disco no boot e as entradas limpas voltam depois de reiniciar | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| scrollIntoView({ block: "end" }) a cada entrada rola todos os ancestrais roláveis; com o painel passando da viewport (janela pequena) pode deslocar a moldura do canvas, e nenhum teste confere | baixo | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Pedidos de escrita

- **ID:** `tool-agent-canvas-write` · **Dono:** `src/features/canvas/components/tools/AgentCanvasWriteRequestsPanel.tsx`
- **Persistência:** processo principal: fila em userData/agent-requests, um arquivo por pedido com pedidoEm, resolvidoEm, estado e resultado (é também a auditoria); canvas salvo: a nota alvo é regravada pelo canvasRepository ao aceitar
- **IPC:** `canvas:list-write-requests`, `canvas:resolve-write-request`, `canvas:agent-write-requests`, `canvas:agent-node-updated`
- **Depende de:** `window.felixo.canvas (listWriteRequests, resolveWriteRequest, onWriteRequests)`, `canvas-write-agent-requests (pickPendingWriteRequest, applyWriteRequestResult)`, `CanvasPanel`, `nodes do CanvasView (rótulo da nota alvo)`
- **Sobreposição:** CanvasPanel: absolute z-20 (z-30 com foco dentro), top-16, à direita da barra lateral e deslocado quando o menu de ferramentas abre (toolsMenuOpen); largura limitada a viewport − barra − inspector Elementos (288 px) e altura a viewport − 112. Os menus do FelixoSelect abrem em portal z-1000 por cima; toasts (z 50) e AgentQuestionDialog/HandoffDialog (z 60) cobrem o painel. Em janela <768 px o painel passa da viewport (PANEL_MIN_WIDTH 260, task 3e691f95-497e-815c-a129-f4d2d6405cbc). Tamanho md; a prévia do conteúdo tem max-h-40 e rola por dentro
- **Testes:** `src/features/canvas/components/tools/canvas-write-agent-requests.test.ts`, `electron/services/agent-canvas-write-ipc-handlers.test.cjs`, `electron/services/fetch-all/agent-requests.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Cartão do pedido pendente mais antigo: frase com o rótulo da nota alvo e a origem, hora do pedido e prévia do conteúdo truncada |
| loading | busy: "Aplicando…" no botão de aceitar enquanto canvas:resolve-write-request não volta |
| empty | "Nenhum pedido de escrita esperando." com a dica felixo canvas escrever |
| error | Faixa vermelha com a mensagem: falha do IPC, nota alvo apagada ou de outro tipo (prepararEscrita) ou "Não foi possível escrever." |
| pending | Pedido com estado pendente: nada é escrito até um clique; a fila anda por ordem de chegada |
| success | "Escrita aplicada." quando o main grava a nota e não há outro pedido na fila |
| disabled | Os dois botões ficam desabilitados durante busy |
| denied | Recusar resolve como recusado; nota alvo que não aceita escrita é resolvida como recusada pelo main, com o motivo |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Aceitar e escrever` (button) | clique | canvas:resolve-write-request com aceito: true: o main relê o canvas, prepara a escrita na nota alvo, grava pelo canvasRepository, resolve o pedido como aceito e empurra canvas:agent-node-updated para o bloco vivo mudar na tela (desabilitado: busy) | Nota alvo sumida ou de outro tipo: pedido resolvido como recusado e a mensagem em vermelho; pedido que já não está pendente mostra "Não foi possível escrever." (a frase "Esse pedido não está mais pendente." do main se perde) | — |
| `Recusar` (button) | clique | canvas:resolve-write-request com aceito: false: o arquivo do pedido em userData/agent-requests fica como recusado e a fila recarrega (desabilitado: busy) | Falha do IPC aparece em vermelho; pedido já resolvido volta ok sem mudança | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| É a porta de confirmação de escrita por agente (risco de prompt injection) e não tem E2E: aceitar/recusar pelo painel e o bloco mudando por canvas:agent-node-updated só são cobertos no handler do main e nas funções puras | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| Pedido de escrita que chega com o painel fechado não avisa ninguém: só este painel escuta canvas:agent-write-requests, então o agente fica esperando sem a pessoa saber | médio | `3eb91f95-497e-81b8-a70f-dfce2a446a3e` |

### Presets de agente

- **ID:** `tool-agent-presets` · **Dono:** `src/features/canvas/components/tools/AgentPresetsPanel.tsx`
- **Persistência:** processo principal: SQLite agent_presets (presets da pessoa; excluir marca archived_at); nativos: NATIVE_PRESETS no código, nunca gravados; arquivo .fxpreset onde a pessoa escolher, ao exportar
- **IPC:** `agent-presets:list`, `agent-presets:save`, `agent-presets:delete`, `files:save-text`, `canvas:list-available-skills`
- **Depende de:** `useAgentPresets`, `agent-preset-editor (checkPresetDraft, changePresetAgent, togglePresetSkill)`, `agent-launch-options (getEffortLevels, supportsFastMode)`, `serializePreset`, `FelixoSelect`, `CanvasPanel`
- **Sobreposição:** CanvasPanel: absolute z-20 (z-30 com foco dentro), top-16, à direita da barra lateral e deslocado quando o menu de ferramentas abre (toolsMenuOpen); largura limitada a viewport − barra − inspector Elementos (288 px) e altura a viewport − 112. Os menus do FelixoSelect abrem em portal z-1000 por cima; toasts (z 50) e AgentQuestionDialog/HandoffDialog (z 60) cobrem o painel. Em janela <768 px o painel passa da viewport (PANEL_MIN_WIDTH 260, task 3e691f95-497e-815c-a129-f4d2d6405cbc). Tamanho md; a lista de skills tem max-h-44 e rola por dentro; o window.confirm do Excluir e o diálogo de salvar são nativos
- **Testes:** `src/features/canvas/services/agent-preset.test.ts`, `src/features/canvas/services/agent-preset-editor.test.ts`, `electron/services/storage/agent-presets-repository.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Lista dos presets nativos (marcados "nativo") e dos da pessoa, com agente, modelo, fast e número de skills, e as ações Editar/Duplicar/Exportar/Excluir |
| empty | "Nenhuma skill disponível no catálogo." no formulário; skill do preset que sumiu do catálogo aparece em aviso âmbar |
| error | Faixa vermelha (role=status): validação de checkPresetDraft, arquivo grande/ilegível/inválido na importação, falha de salvar/excluir/exportar ou o erro do hook useAgentPresets |
| pending | Rascunho aberto: formulário com nome, ícone, descrição, cor, agente, modelo, esforço, fast, yolo, pasta, contexto e skills até Salvar ou Cancelar |
| success | Faixa verde: preset salvo, exportado, importado ou excluído |
| disabled | Preset nativo não tem Editar nem Excluir (só duplica); Esforço só aparece quando o modelo tem níveis; Modo fast só quando agente e modelo suportam |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Sem cor` (button) | clique | Tira a cor da moldura do rascunho (aria-checked no radiogroup) | sem falha própria | — |
| `aria-label={FRAME_COLOR_LABELS[color]}` (button) | clique | Escolhe a cor da moldura dos blocos abertos com o preset (uma amostra por FRAME_COLORS) | sem falha própria | — |
| `Agente do preset` (select) | clique | changePresetAgent troca o agente e ajusta modelo, esforço e fast ao que ele suporta; só agentes nativos (sem launcher) entram na lista | sem falha própria | — |
| `Modelo do preset` (select) | clique | changePresetModel troca o modelo ("Padrão da CLI" = vazio) e revalida esforço e fast | sem falha própria | — |
| `Esforço do preset` (select) | clique | Grava o nível de raciocínio no rascunho ("Padrão" = vazio) (desabilitado: some quando getEffortLevels não devolve níveis para o modelo) | sem falha própria | — |
| `onClick={() => void handleSave()}` (button) | clique | Salvar: checkPresetDraft valida, useAgentPresets.save grava por agent-presets:save (SQLite), atualiza a lista, avisa as outras instâncias por felixo:agent-presets-changed, fecha o formulário e mostra o aviso verde | Validação mostra a mensagem de checkPresetDraft; falha do main mostra a mensagem do hook (ou "Não foi possível salvar o preset.") | — |
| `onClick={() => setDraft(null)}` (button) | clique | Cancelar: fecha o formulário e descarta o rascunho | sem falha própria | — |
| `Novo preset` (button) | clique | Abre o formulário com blankPreset e um id novo | sem falha própria | — |
| `<Upload size={12} aria-hidden /> Importar` (button) | abre o seletor de arquivo do input escondido (.fxpreset/json) | Lê o arquivo (até 256 KB), parsePresetFile valida formato e versão, dá id novo, numera o nome se já existir e salva como preset da pessoa | "O arquivo é grande demais…", "Não foi possível ler o arquivo selecionado.", a mensagem de parsePresetFile ou "Não foi possível salvar o preset importado." em vermelho | — |
| `Editar` (button) | clique | Abre o formulário com o preset da pessoa (desabilitado: não aparece em preset nativo) | sem falha própria | — |
| `Duplicar` (button) | clique | Salva uma cópia com id novo e nome numerado (duplicatePresetName); vale também para nativos | Falha do main aparece pelo erro do hook; o sucesso não mostra aviso, só a linha nova | — |
| `Exportar` (button) | clique | files:save-text abre o diálogo de salvar com presetFileName e grava serializePreset (sem a pasta padrão) num .fxpreset | Mensagem do main ou "Não foi possível salvar o arquivo." em vermelho; cancelar o diálogo não mostra nada; exceção vira a mensagem do erro | — |
| `Excluir` (button) | clique e confirmação em window.confirm | agent-presets:delete arquiva o preset (archived_at), tira da lista, fecha o formulário se era ele e mostra o aviso verde (desabilitado: não aparece em preset nativo) | Falha do main aparece pelo erro do hook; cancelar o confirm não chama nada | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Sem teste de interface: criar, editar, duplicar, importar, exportar e excluir preset pelo painel | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| CanvasToolPanels.tsx:274 passa onClose cru em vez de closeActiveTool: fechar Presets de agente não devolve o foco ao gatilho do menu; o foco cai no body, onde o React Flow trata Delete/Backspace como teclas do canvas | médio | `3ec91f95-497e-8197-a218-ef49c302013d` |
| Erro do hook gruda: useAgentPresets só limpa error em save/remove bem-sucedidos (useAgentPresets.ts:68 e :100) e AgentPresetsPanel.tsx:135-145 mostra error antes de message, então uma exportação certa depois de uma falha continua exibindo a falha antiga; falha de agent-presets:list (useAgentPresets.ts:27-37) é engolida e só os nativos aparecem | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Configurações

- **ID:** `tool-settings` · **Dono:** `src/features/canvas/components/tools/SettingsPanel.tsx`
- **Persistência:** localStorage felixo-ai-core.theme; processo principal: settings do SQLite canvas.file-link-prompt e canvas.file-bootstrap-prompt; processo principal: settings do SQLite canvas.quality-standard-prompt e canvas.quality-standard-enabled; seções embutidas (Modo Performance, placa de vídeo, inicialização automática, System Design, ditado, rolagem do Claude) persistem por conta própria
- **IPC:** `canvas:get-file-link-prompt`, `canvas:set-file-link-prompt`, `canvas:get-file-bootstrap-prompt`, `canvas:set-file-bootstrap-prompt`, `canvas:get-quality-standard`, `canvas:set-quality-standard`, `system-design:get-config`
- **Depende de:** `useAppTheme`, `useReducedMotionPreference`, `subscribeSystemDesignConfig`, `buildDefaultQualityStandardPrompt`, `window.felixo.canvas`, `window.felixo.systemDesign`, `FelixoSelect`, `FelixoToggle`, `PerformanceModeSection`, `GraphicsRecoverySection`, `AutoStartSection`, `SystemDesignSettingsSection`, `DictationSettingsSection`, `ClaudeTerminalScrollSection`
- **Sobreposição:** CanvasPanel: absolute z-20 (z-30 com foco dentro), top-16, à direita da barra lateral e deslocado quando o menu de ferramentas abre (toolsMenuOpen); largura limitada a viewport − barra − inspector Elementos (288 px) e altura a viewport − 112. Os menus do FelixoSelect abrem em portal z-1000 por cima; toasts (z 50) e AgentQuestionDialog/HandoffDialog (z 60) cobrem o painel. Em janela <768 px o painel passa da viewport (PANEL_MIN_WIDTH 260, task 3e691f95-497e-815c-a129-f4d2d6405cbc). Tamanho padrão; é o painel mais comprido desta parte e rola por dentro
- **Testes:** `src/features/canvas/services/quality-standard-prompt.test.ts`, `src/features/canvas/services/quality-standard-source.test.ts`, `src/features/shared/accessibility/reduced-motion-preference.test.ts`, `scripts/hardware-check.cjs` → `openGpuOption`

| Estado | Quando |
| --- | --- |
| normal | Tema, Modo Performance, recuperação gráfica, inicialização automática, ditado, rolagem do Claude, System Design, padrão de qualidade e as duas instruções de arquivo; com movimento reduzido no sistema, um aviso role=status explica que as animações estão desligadas |
| success | "Salvo" por 1,5 s (useSavedFlash) depois de salvar uma instrução ou o padrão de qualidade |
| disabled | Texto do padrão de qualidade desabilitado com o lembrete desligado |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Tema"` (select) | clique | useAppTheme.setTheme troca entre Escuro e Alto contraste na hora e grava localStorage felixo-ai-core.theme | Sem localStorage o tema vale só para a sessão (theme-storage engole o erro de propósito) | — |
| `await persist(value)` (button) | clique | Salvar de cada instrução de arquivo: grava canvas:set-file-link-prompt ou canvas:set-file-bootstrap-prompt, avisa o canvas sem recarregar (onPromptSaved/onBootstrapSaved) e mostra "Salvo" | erro engolido: o retorno do IPC não é lido — "Salvo" aparece mesmo com ok: false, e uma rejeição não mostra nada (SettingsPanel.tsx:251-255) | — |
| `onClick={() => setValue(defaultValue)}` (button) | clique | Padrão: volta o texto da instrução a DEFAULT_FILE_LINK_PROMPT/DEFAULT_FILE_BOOTSTRAP_PROMPT só na tela; vale depois de Salvar | sem falha própria | — |
| `label="Sempre lembrar o agente do padrão de qualidade"` (toggle) | clique | Liga/desliga o lembrete no rascunho e habilita/desabilita o texto; só é gravado ao clicar em Salvar | sem falha própria; fechar o painel sem salvar perde a mudança | — |
| `await window.felixo?.canvas?.setQualityStandard` (button) | clique | Salvar do padrão de qualidade: canvas:set-quality-standard com o texto personalizado (vazio = segue o padrão da fonte de System Design) e o liga/desliga, avisa o canvas (onQualityStandardSaved) e mostra "Salvo" | erro engolido: "Salvo" aparece sem conferir ok (SettingsPanel.tsx:338-343) | — |
| `onClick={() => setCustomText(null)}` (button) | clique | Padrão: descarta a personalização e volta ao texto da fonte atual (buildDefaultQualityStandardPrompt); vale depois de Salvar | sem falha própria | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Sem teste de interface do tema, das instruções de arquivo e do padrão de qualidade (hardware-check só abre o painel para a placa de vídeo); canvas:set-file-link-prompt, set-file-bootstrap-prompt e set-quality-standard não aparecem em canvas-ipc-handlers.test.cjs | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| SettingsPanel.tsx:251-255 (PromptField) e :338-343 (QualityStandardField) mostram "Salvo" sem olhar o { ok } devolvido; falha do settings do SQLite passa como sucesso e a instrução antiga continua valendo | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Notificações

- **ID:** `tool-notifications` · **Dono:** `src/features/canvas/components/NotificationsPanel.tsx`
- **Persistência:** localStorage felixo:notification-history (até 200 itens; poda de 7 dias e de blocos que sumiram); localStorage felixo:notification-preferences (som ligado e volume); nenhuma para filtro, busca e "Depois" da atualização (estado de React)
- **IPC:** `updates:install`
- **Depende de:** `CanvasPanel`, `useUpdateStatus`, `useAccountContinuation`, `acknowledgeNodeNotifications (CanvasView)`, `canvas-notifications`, `notification-history-storage`, `notification-preferences`, `notification-category`
- **Sobreposição:** CanvasPanel absolute z-20 (z-30 com foco dentro), top-16, left = sidebar + 1rem; a lista rola por dentro (max-h 38vh). Fica abaixo da sidebar (26) e acima de topbar e statusbar (18) e do aviso de layout (z-10, no mesmo canto: cobre o aviso). Disputa largura com gaveta e inspector por reportPanelWidth (splitHorizontalSpace). Marcar e remover do item só aparecem no hover ou com foco (opacity-0).
- **Testes:** `scripts/canvas-smoke.cjs` → `checarInteracoes`, `scripts/canvas-smoke-contas.cjs` → `checarPropostaENotificacao`, `scripts/canvas-smoke-contas.cjs` → `checarRedeSemItem`, `src/features/canvas/terminal/canvas-notifications.test.ts`, `src/features/canvas/terminal/notification-category.test.ts`, `src/features/canvas/services/notification-history-storage.test.ts`, `src/features/canvas/services/notification-preferences.test.ts`, `src/features/canvas/components/notification-time.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Painel aberto pelo sino do trilho (activeTool === "notifications"), dentro do CanvasPanel, no filtro "Não lidas": agentes que pediram atenção, do mais novo para o mais antigo. Só entram notificações de blocos de terminal que ainda existem no canvas. |
| loading | Atualização baixando: item fixo no topo com barra de progresso (presentation.progress !== null e !presentation.canInstall). |
| empty | Nada a mostrar e sem atualização nem proposta: "Nenhum agente aguardando ação." (Não lidas), "Nenhuma notificação encontrada." (com busca) ou "Nenhuma notificação nos últimos 7 dias." (Histórico). |
| pending | Proposta de troca de conta pendente (chainItems): item fixo "A cadeia tem uma proposta de troca" com [Ver opções]; nada troca sem o clique. |
| success | Atualização baixada (presentation.canInstall): o item mostra "Reiniciar agora" e "Depois". |
| disabled | "Marcar todas como lidas" fica desabilitado com 0 não lidas; o volume fica desabilitado quando está mudo e com volume 0. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Marcar todas como lidas` (button) | clique | onMarkAllRead: reconhece cada bloco com notificação não lida (acknowledgeNodeNotifications) e marca todas como lidas (markAllCanvasNotificationsRead). O badge do sino cai para 0 (ou 1, se houver atualização) e o histórico é gravado em felixo:notification-history. (desabilitado: nenhuma notificação não lida (unreadCount === 0)) | Sem falha própria: estado local e localStorage best effort (escrita recusada é ignorada). | — |
| `Mutar notificações` (button) | clique | Alterna o som (setNotificationSoundEnabled), grava felixo:notification-preferences e liga ou desliga o som que toca quando um agente novo pede ação; aria-pressed indica mudo e o rótulo vira "Ativar som das notificações". | erro engolido: se o Chromium bloquear o áudio, audio.play().catch vazio (CanvasView.tsx:670) não avisa nada; sem localStorage a escolha vale só nesta sessão. | — |
| `Limpar busca` (button) | clique | Zera o campo "Buscar notificações" (setQuery); a lista volta ao filtro atual sem busca. (desabilitado: some com o campo de busca vazio) | Sem falha própria (estado local). | — |
| `Limpar notificações lidas` (button) | clique | onClearRead: remove do histórico todas as notificações lidas (clearReadCanvasNotifications) e grava felixo:notification-history, sem pedir confirmação. (desabilitado: só aparece no filtro Histórico com pelo menos uma lida) | Sem falha própria; não há desfazer. | — |
| `onExpandNode(node.id)` (button) | clique | Item do agente: focusNode centraliza o bloco na área útil (zoom 1,2) e o seleciona, openTerminal abre a gaveta do terminal e marca as notificações daquele bloco como lidas, e o painel fecha. | Bloco removido não aparece (a lista filtra terminais vivos). Bloco dentro de grupo é centralizado no lugar errado (ver lacuna de foco no elemento da área do canvas). | — |
| `title="Marcar como lida"` (button) | clique | onMarkRead: reconhece o bloco e marca só aquela notificação como lida (markCanvasNotificationRead); ela sai de "Não lidas" e do badge. (desabilitado: some quando a notificação já está lida; só aparece no hover ou com foco no item) | Sem falha própria. | — |
| `title="Remover notificação"` (button) | clique | onRemove: se a notificação ainda não foi lida, reconhece o bloco; depois tira o item do histórico (removeCanvasNotification). (desabilitado: só aparece no hover ou com foco no item) | Sem falha própria; não há desfazer. | — |
| `Reiniciar agora` (button) | clique | updates.install → IPC updates:install → autoUpdater.quitAndInstall: o app fecha e instala a versão já baixada. (desabilitado: só existe com atualização baixada) | Resposta ignorada (void): se o processo principal recusar ("Nenhuma atualizacao baixada para instalar.") nada aparece. O botão só existe com canInstall (estado downloaded), o que estreita o caso. | — |
| `Depois` (button) | clique | updates.dismiss: guarda em memória a chave da notícia; o item some do painel e deixa de contar no badge do sino. (desabilitado: só existe com atualização baixada) | Sem falha própria; a notícia volta ao recarregar (não persiste). | — |
| `Dispensar aviso de atualização` (button) | clique | X do item de atualização: o mesmo updates.dismiss de "Depois" (item some e sai do badge). | Sem falha própria; a notícia volta ao recarregar (não persiste). | — |
| `Ver opções` (button) | clique | accountContinuation.openProposal(firstProposalId, botão): abre o diálogo "Trocar de conta?" (AccountSwitchDialog) para aquela proposta, com o botão como gatilho de retorno do foco. | O desfecho (aceitar, recusar, proposta já vencida) é do diálogo; sem onViewChainOptions o botão não é renderizado. | — |
| `aria-pressed={active}` (button) | clique | FilterTab (as duas abas "Não lidas" e "Histórico"): troca o filtro (setFilter) e marca a aba ativa com aria-pressed; o número entre parênteses vem do histórico. | Sem falha própria; o filtro volta para "Não lidas" quando o painel reabre. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum botão interno do painel (marcar lida, remover, marcar todas, filtros, busca, limpar lidas, mudo, Reiniciar agora, Depois, Ver opções) é clicado por teste; o smoke só abre pelo sino, fecha com Esc e confere que o item da cadeia aparece. | médio | `3ec91f95-497e-818f-b9f2-f9710605c303` |
| O realce do bloco com notificação não lida (notificationClassName em orderedNodes, CanvasView) não é conferido numa janela real nem no smoke. | baixo | `3e191f95-497e-81fd-b657-d7a63b5d17f0` |
| erro engolido: o som da notificação falha em silêncio quando o Chromium bloqueia o áudio (audio.play().catch vazio, CanvasView.tsx:670); a pessoa liga o som e não sabe por que não toca. | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Como todo CanvasPanel, o painel passa da viewport em janelas abaixo de 768 px (PANEL_MIN_WIDTH 260 nunca cede). | médio | `3e691f95-497e-815c-a129-f4d2d6405cbc` |

### Tarefas Notion (ferramenta e conteúdo do bloco)

- **ID:** `ferramenta-tarefas-notion` · **Dono:** `src/features/canvas/components/tools/NotionTasksPanel.tsx`
- **Persistência:** processo principal: notion-connections.json (rótulo e perfil; token cifrado com safeStorage); processo principal: SQLite notion_task_cache (snapshot por conexão e database); localStorage felixo:notion-task-views:<conexão>:<database>; localStorage felixo:notion-task-sort:<conexão>:<database>; localStorage felixo:notion-table-columns:<conexão>:<database>; nenhuma para conexão e database selecionadas, visualização ativa e sincronização automática
- **IPC:** `notion:connections:list`, `notion:connections:save`, `notion:connections:remove`, `notion:connections:test`, `notion:databases:list`, `notion:tasks:list`, `notion:tasks:cached`, `notion:tasks:content`, `notion:tasks:create`, `notion:tasks:update`, `notion:tasks:archive`
- **Depende de:** `window.felixo.notion`, `FelixoSelect`, `createRefreshCoordinator / targetChanged (notion-refresh-coordinator)`, `nextAutoSyncDelayMs (notion-sync-backoff)`, `decideSyncStatusAfterNetwork (notion-sync-status)`, `notion-task-views / notion-task-sort / notion-table-columns / notion-table-view`, `DeferredMarkdownContent`
- **Sobreposição:** Mora dentro do bloco Tarefas Notion (overflow-auto). FelixoSelect em portal z 1000 fica acima de tudo, inclusive de diálogos; o seletor de colunas (absolute z-10) é cortado pela rolagem do bloco e só aparece rolando. Colunas sticky (z-10) ficam sob o seletor.
- **Testes:** `src/features/canvas/services/notion-refresh-coordinator.test.ts`, `src/features/canvas/services/notion-sync-backoff.test.ts`, `src/features/canvas/services/notion-sync-status.test.ts`, `src/features/canvas/services/notion-table-columns.test.ts`, `src/features/canvas/services/notion-table-view.test.ts`, `src/features/canvas/services/notion-task-sort.test.ts`, `src/features/canvas/services/notion-task-views.test.ts`, `electron/services/notion-ipc-handlers.test.cjs`, `electron/services/notion-service.test.cjs`, `electron/services/notion-connection-store.test.cjs`, `electron/services/notion-client.test.cjs`, `electron/services/storage/notion-cache-repository.test.cjs`, `scripts/canvas-smoke.cjs` → `checarAuditoriaDeAcessibilidade`

| Estado | Quando |
| --- | --- |
| normal | Tabela da database com a visualização ativa, contagem, ordenação por coluna, colunas extras escolhidas e "Sincronizado <data>"; sincronização automática a cada 1 min (backoff dobrando até 15 min a cada falha). |
| loading | Primeira visita a uma database sem snapshot local: busy (spinners) até notion:tasks:list; "Revalidando com o Notion…" durante a sincronização; "Carregando conteúdo da página…" no detalhe. |
| empty | Sem conexão ou database: "Sua lista do Notion aparece aqui" + "Configurar agora"; "Nenhuma tarefa encontrada."; "Adicione uma conexão para começar…"; "Esta database não tem outras propriedades.". |
| error | role="alert" com a mensagem do processo principal (guard devolve ok:false), "A ponte do Notion não está disponível nesta versão do app."; rede fora: "Snapshot local desatualizado" / "Dados locais"; erro do conteúdo da página com "Tentar novamente". |
| pending | busyTaskId desabilita os botões da linha durante concluir/arquivar; syncing desabilita "Sincronizar tarefas". |
| success | role="status": "Conexão Notion guardada…", "Conexão validada para …", "Tarefa criada no Notion.", "Tarefa atualizada no Notion.", "Tarefa enviada para a lixeira do Notion.", "Link copiado". |
| disabled | busy desabilita Nova tarefa, Testar, Remover, Atualizar, Buscar e Guardar; Testar sem token; Guardar conexão com armazenamento seguro indisponível. |
| denied | Conflito de versão (expectedUpdatedAt): "Esta tarefa foi alterada no Notion. Revise antes de salvar de novo." e a lista recarrega; armazenamento seguro indisponível (secureStorage.reason). |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => onSort(column)}` (button) | clique | Cabeçalho ordenável (Tarefa/Nome, Estado, Prioridade, Prazo e colunas extras): alterna crescente → decrescente → sem ordem e grava em localStorage felixo:notion-task-sort:<conexão>:<database>. | localStorage indisponível: ordena na sessão e não lembra (try/catch em notion-task-sort). | — |
| `aria-label="Database Notion"` (select) | clique | Troca a database: volta à primeira visualização, mostra o snapshot local (notion:tasks:cached) e revalida com notion:tasks:list; respostas da database anterior são descartadas (notion-refresh-coordinator). (desabilitado: Só aparece com databases listadas.) | Erro da rede em role="alert"; a escolha não persiste e volta à primeira database ao remontar. | — |
| `onClick={() => setShowWorkspaceSettings((value) => !value)}` (button) | clique | "Configurar": abre/fecha a seção de conexão e database (aria-expanded). | Sem falha própria. | — |
| `onClick={startCreatingTask}` (button) | clique | "Nova tarefa": abre o formulário vazio de tarefa. (desabilitado: busy; só aparece com conexão e database.) | Sem falha própria. | — |
| `onClick={() => setShowConnectionForm((value) => !value)}` (button) | clique | "Adicionar"/"Fechar": mostra o formulário de conexão (nome, perfil, token). | Sem falha própria. | — |
| `aria-label="Conexão Notion"` (select) | clique | Troca a conexão: recarrega as databases (notion:databases:list) e as tarefas. (desabilitado: Só aparece com conexões cadastradas.) | Erro em role="alert"; a escolha não persiste (volta à primeira conexão ao remontar). | — |
| `aria-label="Testar conexão"` (button) | clique | notion:connections:test; "Conexão validada para <identidade>." e a lista de conexões recarrega. (desabilitado: busy ou conexão sem token.) | role="alert" com "A conexão não respondeu." ou a mensagem do processo principal. | — |
| `aria-label="Remover conexão"` (button) | clique | Pede confirm e chama notion:connections:remove (token cifrado apagado); limpa databases e tarefas e avisa que o cache local fica sem credencial. (desabilitado: busy.) | role="alert" "Não foi possível remover a conexão."; cancelar o confirm não faz nada. | — |
| `aria-label="Atualizar tabelas"` (button) | clique | notion:databases:list com o filtro atual; mantém a database escolhida se ela ainda existir. (desabilitado: busy ou sem conexão.) | role="alert" "Não foi possível listar as tabelas compartilhadas.". | — |
| `<RefreshCw size={13} /> Buscar` (button) | clique | "Buscar": mesma listagem de databases com o texto do filtro (Enter no campo faz o mesmo). (desabilitado: busy.) | role="alert" com a mensagem do processo principal. | — |
| `<Save size={13} /> Guardar conexão` (button) | clique | notion:connections:save (token vazio mantém o atual); limpa o campo do token, fecha o formulário, recarrega as conexões e seleciona a gravada. (desabilitado: busy ou armazenamento seguro indisponível (secureStorage.ok === false).) | role="alert" "Não foi possível guardar a conexão.". | — |
| `<Settings2 size={13} /> Configurar agora` (button) | clique | No estado vazio, abre a seção de configuração. | Sem falha própria. | — |
| `aria-label="Sincronizar tarefas"` (button) | clique | loadTasks manual: fecha o detalhe aberto, mostra o snapshot local e revalida com notion:tasks:list (fila única com o auto-sync); Enter na busca faz o mesmo. (desabilitado: busy ou sincronizando.) | role="alert" com a mensagem; com rede fora exibe o snapshot e "Exibindo o último snapshot salvo; a rede está indisponível.". | — |
| `aria-pressed={autoSyncEnabled}` (button) | clique | Liga/desliga a sincronização automática silenciosa (1 min, backoff até 15 min). | Sem falha própria; não persiste (volta ligada ao remontar). | — |
| `aria-label="Escolher colunas da tabela"` (button) | clique | Abre/fecha o seletor de colunas; cada caixa grava em localStorage felixo:notion-table-columns:<conexão>:<database>. | Sem falha própria; localStorage indisponível só deixa de lembrar. | — |
| `aria-label="Mostrar filtros e configuração"` (button) | clique | Abre a seção de configuração (não alterna). | Sem falha própria. | — |
| `onClick={() => setActiveViewId(view.id)}` (button) | clique | Aba de visualização (role="tab"): filtra a tabela por estado e propriedade; só estado local. | Sem falha própria; a visualização ativa não persiste. | — |
| `aria-label={`Editar visualização ${view.name}`}` (button) | clique | Abre o editor preenchido com a visualização própria. (desabilitado: Só nas visualizações próprias e só no hover (hidden group-hover:flex): fora do alcance do teclado.) | Sem falha própria. | — |
| `aria-label={`Excluir visualização ${view.name}`}` (button) | clique | Pede confirm e tira a visualização de felixo:notion-task-views:<conexão>:<database>; se era a ativa, volta à primeira. (desabilitado: Só nas visualizações próprias e só no hover.) | Cancelar o confirm não faz nada. | — |
| `aria-label="Criar nova visualização"` (button) | clique | "Nova visualização": abre o editor vazio. | Sem falha própria. | — |
| `aria-label="Fechar editor de visualização"` (button) | clique | Fecha o editor de visualização e descarta o rascunho. | Sem falha própria. | — |
| `aria-label="Estado incluído na visualização"` (select) | clique | Escolhe Todos/Só abertas/Só concluídas no rascunho da visualização. | Sem falha própria. | — |
| `aria-label="Propriedade para filtrar"` (select) | clique | Escolhe a propriedade (select, multi-select, status) do filtro e zera os valores marcados. (desabilitado: Só aparece se a database tiver propriedades filtráveis.) | Sem falha própria. | — |
| `onClick={() => toggleViewDraftValue(option)}` (button) | clique | Um por valor da propriedade: marca/desmarca o valor no rascunho do filtro. | Sem falha própria. | — |
| `onClick={cancelViewBuilder}>Cancelar` (button) | clique | Cancela o editor de visualização. | Sem falha própria. | — |
| `{editingViewId ? 'Salvar alterações' : 'Criar visualização'}` (button) | clique | Submit: grava a visualização em felixo:notion-task-views:<conexão>:<database> e a ativa. | Nome vazio não envia (required); localStorage indisponível perde a visualização ao remontar. | — |
| `aria-label="Fechar editor" title="Fechar editor"` (button) | clique | Fecha o formulário de tarefa e descarta o rascunho. | Sem falha própria. | — |
| `aria-label="Estado da tarefa"` (select) | clique | Escolhe o estado da tarefa no rascunho (opções lidas do schema; vazio = automático). | Sem falha própria. | — |
| `onClick={cancelTaskComposer}>Cancelar` (button) | clique | Cancela o formulário de tarefa. | Sem falha própria. | — |
| `{editingId ? 'Salvar alterações' : 'Criar tarefa'}` (button) | clique | Submit: notion:tasks:create, ou notion:tasks:update com expectedUpdatedAt; fecha o formulário, avisa e recarrega a lista. (desabilitado: busy.) | role="alert" "Não foi possível salvar a tarefa."; conflito recusa a escrita, avisa e recarrega; título vazio não envia. | — |
| `onClick={() => void toggleTask(task)}` (button) | clique | Um por linha ("Concluir …"/"Reabrir …"): notion:tasks:update com completed invertido e expectedUpdatedAt; recarrega a lista. (desabilitado: Enquanto a própria linha está ocupada; só no modo tarefa (hasTaskRoles).) | role="alert" "Não foi possível alterar o estado da tarefa."; conflito avisa e recarrega. | — |
| `onClick={() => toggleTaskDetails(task)}` (button) | clique | Um por linha: expande/recolhe o detalhe (propriedades fora das colunas + conteúdo da página por notion:tasks:content, uma vez por tarefa). | Erro do conteúdo mostra a mensagem com "Tentar novamente"; o texto da tarefa fica como fallback. | — |
| `aria-label={`Editar ${task.title}`}` (button) | clique | Um por linha: abre o formulário preenchido e guarda o updatedAt para a checagem de conflito. (desabilitado: Enquanto a linha está ocupada.) | Sem falha própria. | — |
| `aria-label={`Excluir ${task.title}`}` (button) | clique | Um por linha: pede confirm e manda a tarefa para a lixeira do Notion (notion:tasks:archive); recarrega. (desabilitado: Enquanto a linha está ocupada.) | role="alert" "Não foi possível arquivar a tarefa."; cancelar o confirm não faz nada. | — |
| `onClick={() => void loadTaskContent(task)}>Tentar novamente` (button) | clique | No detalhe com erro: refaz notion:tasks:content. (desabilitado: Só aparece com erro no conteúdo.) | Mantém o erro com a nova mensagem. | — |
| `onClick={() => void copyTaskLink(task)}` (button) | clique | "Copiar link": copia a URL da página com navigator.clipboard e mostra "Link copiado" por 1,5 s. (desabilitado: Só aparece em tarefa com URL.) | role="alert" "Não foi possível copiar o link automaticamente. Copie manualmente: <url>". | — |
| `Mostrar mais {ROW_PAGE_SIZE}` (button) | clique | Monta mais 200 linhas no DOM (nextRowLimit); reinicia ao trocar de database. (desabilitado: Só aparece com mais linhas que o limite montado.) | Sem falha própria. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum dos 37 controles é clicado por teste (o smoke só vê o estado vazio, sem conexão); conexão real, sincronização e a matriz multi-SO não foram validadas no canvas. | médio | `3d591f95-497e-810c-9f26-ff8a3e6e53ce` |
| Copiar link nunca foi validado no app real. | baixo | `3d691f95-497e-8105-b007-f7767fe10405` |
| Isolamento entre conexões e DevTools do app empacotado só por checklist manual. | baixo | `3d791f95-497e-8139-8417-f90dd73f2777` |
| Seleção que não persiste (NotionTasksPanel.tsx:120, 128, 136 e 148): conexão, database, visualização ativa e sincronização automática vivem só em useState; ao reabrir o app (ou remontar o bloco) a lista volta à primeira conexão e à primeira database, embora o bloco seja "persistente". | médio | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |
| O aviso role="status" nunca é limpo (NotionTasksPanel.tsx:161; não há setMessage(null)): "Exibindo o último snapshot salvo; a rede está indisponível." continua na tela depois que a rede volta e sincroniza, e "Tarefa criada…" fica até o próximo aviso. | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Editar e Excluir visualização (NotionTasksPanel.tsx:925) ficam em "hidden group-hover:flex": display none fora do hover, então o teclado nunca chega neles. | baixo | `3ec91f95-497e-8197-a218-ef49c302013d` |

### Hospedeiro dos painéis de ferramenta

- **ID:** `tool-panel-host` · **Dono:** `src/features/canvas/components/CanvasToolPanels.tsx`
- **Persistência:** nenhuma: activeTool vive em useState do CanvasView (o reload fecha qualquer painel)
- **IPC:** nenhum
- **Depende de:** `CanvasView (activeTool, setActiveTool)`, `canvas-tool-loaders (Lazy*)`, `TOOL_LABELS`, `CanvasPanel`
- **Sobreposição:** sem superfície própria além dos fallbacks, que usam a moldura CanvasPanel (porte sm, z-20/z-30). Fechar devolve o foco no próximo quadro: Busca → [data-canvas-tool-trigger="search"]; demais → menu de ferramentas ou botão do rail que não esteja aria-hidden/inert. Trocar de ferramenta desmonta o painel anterior na hora, sem animação de saída
- **Testes:** `scripts/canvas-smoke.cjs` → `checarFocoAoAbrirFerramenta`, `scripts/canvas-smoke-prompts.cjs` → `abrirPainel`, `src/features/onboarding/onboarding-catalog.test.ts`

| Estado | Quando |
| --- | --- |
| normal | activeTool escolhe o painel lazy no switch (Notificações e Tarefas Notion moram fora); null não renderiza nada |
| loading | chunk do painel baixando: o Suspense mostra um CanvasPanel "Carregando <ferramenta>…" (role=status, panelId loading-<ferramenta>) |
| error | import do chunk ou render do painel lançou: ToolPanelErrorBoundary mostra "Não foi possível carregar este painel." (role=alert, panelId error-<ferramenta>); trocar de ferramenta zera o erro |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => window.location.reload()}` (button) | clique | Recarregar app: window.location.reload() recarrega o renderer inteiro, e o canvas é relido do processo principal | se o chunk continua faltando (instalação corrompida), o mesmo erro volta ao reabrir a ferramenta; o React.lazy guarda a falha até o reload | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| os estados Carregando e erro do chunk não têm teste: nenhum smoke simula chunk ausente e o botão Recarregar app nunca é clicado | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| CanvasToolPanels.tsx:274: Presets de agente recebe onClose em vez de closeActiveTool — fechar não devolve o foco ao menu/rail e ele cai no body, onde o React Flow trata Delete/Backspace como teclas do canvas | médio | `3ec91f95-497e-8197-a218-ef49c302013d` |

### Moldura comum dos painéis (CanvasPanel)

- **ID:** `tool-panel-frame` · **Dono:** `src/features/canvas/components/tools/CanvasPanel.tsx`
- **Persistência:** localStorage felixo:canvas-panel-width:<panelId> (só depois de arrastar ou usar as setas; Home apaga); localStorage felixo:canvas-panel-height:<panelId>; nenhuma para recolhido
- **IPC:** nenhum
- **Depende de:** `useExitAnimation`, `useResizablePanelWidth`, `useResizablePanelHeight`, `useCanvasSurfaces (occupancy, reportPanelWidth, viewport)`, `getPanelMaxHeight`
- **Sobreposição:** absolute z-20, z-30 com foco dentro (focus-within); top-16 (workspace: top-4), left = 1rem + largura viva da sidebar; maxWidth = viewport − sidebar − inspector − 32 px. Abaixo da sidebar (26), do overlay isBusy/toasts (50), dos diálogos (60) e do FelixoSelect (1000); mesmo z da lista Elementos
- **Testes:** `scripts/canvas-smoke.cjs` → `checarPainelNosDoisEixos`, `scripts/canvas-smoke.cjs` → `checarFocoAoAbrirFerramenta`, `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos`, `scripts/canvas-smoke-onboarding.cjs` → `sb6`, `src/features/canvas/services/panel-sizing.test.ts`, `src/features/canvas/services/canvas-surfaces.test.ts`, `src/features/canvas/hooks/exit-animation-controller.test.ts`

| Estado | Quando |
| --- | --- |
| normal | region rotulada pelo título; entra com felixo-anim-panel-in e se foca se o foco não estiver dentro; largura = occupancy.panel (decidida pelo coordenador), altura do conteúdo até getPanelMaxHeight (janela − 112, piso 240). Recolhido: coluna de 44 px com a inicial do título, conteúdo hidden e sem alças. Alças role=separator (não contadas): largura com arrasto, setas ±24 (Shift ±80), Home/duplo clique = padrão; altura com ↑↓ e Home = altura do conteúdo |
| pending | fechando: felixo-anim-panel-out por 160 ms (PANEL_EXIT_MS) antes do onClose |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => setCollapsed((current) => !current)}` (button) | clique | alterna collapsed: recolhido vira coluna de 44 px (COLLAPSED_SURFACE_WIDTH), esconde conteúdo e alças e reporta 44 px ao coordenador, devolvendo largura ao canvas | sem falha própria; o estado não persiste (reabrir volta expandido) | — |
| `onClick={close}` (button) | clique | close(): toca a animação de saída (160 ms) e chama onClose — o hospedeiro limpa activeTool e devolve o foco ao gatilho; Esc dentro do painel faz o mesmo quando ninguém deu preventDefault (o FelixoSelect aberto dá) | sem falha própria; edições com debounce pendente em Notas e Prompts se perdem ao desmontar, e o rascunho do detalhe de prompt some sem confirmação (ver lacunas desses elementos) | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| em telas < 768 px o painel sai da viewport (~8 px em 320 px: PANEL_MIN_WIDTH 260 + rail 52 + gap); o smoke só registra knownIssue e desliga o bounds-check | médio | `3e691f95-497e-815c-a129-f4d2d6405cbc` |
| mesmo z da lista Elementos (TerminalsPanel absolute right-0 z-20): sem foco dentro do painel, a ordem do DOM decide quem cobre quem; coberto em janela pequena com a gaveta fixada | médio | `3eb91f95-497e-814a-8b2c-e471e09f6ff3` |
| só o painel Buscar tem evidência visual nos viewports críticos; os outros painéis (portes md/xl e workspace) nunca foram medidos | médio | `3ce91f95-497e-81c9-8c3b-def9ed09d58c` |
| Recolher/Expandir e o botão Fechar não são clicados por nenhum teste (o smoke fecha a Busca pelo botão do rail e por Esc); a alça de largura não é exercitada no smoke, só a de altura | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| useResizablePanelWidth.ts:55-60 e useResizablePanelHeight.ts:42-44 leem o localStorage só ao montar; ProjectsPanel (projects → project-browser) e PromptsPanel (prompts → prompt-detail) trocam o panelId sem remontar a moldura — a largura de uma vista vaza para a outra e a gravada da segunda nunca é lida | baixo | `3ec91f95-497e-8103-b360-c1979d6992f4` |

### Menu de ferramentas da sidebar

- **ID:** `tool-menu` · **Dono:** `src/features/canvas/components/tools/CanvasToolsMenu.tsx`
- **Persistência:** nenhuma para o menu (seção Ferramentas sem storageKey: volta recolhida a cada sessão); arquivo .fxcanvas escolhido pela pessoa (exportar); canvas salvo substituído (importar)
- **IPC:** `canvas:export`, `canvas:validate-import`, `canvas:import`, `files:save-text`
- **Depende de:** `preloadCanvasTool`, `CanvasToolbar (SidebarSection Ferramentas, importInputRef)`, `useCanvasTransfer (exportAll, importFile, isBusy)`
- **Sobreposição:** dentro da sidebar (z-26), na seção recolhível "Ferramentas"; com a sidebar recolhida (trilho de 52 px) o menu não aparece. Não cobre nada: os painéis que abre nascem à direita da sidebar
- **Testes:** `scripts/canvas-smoke-prompts.cjs` → `abrirPainel`, `scripts/canvas-smoke-contas.cjs` → `abrirLimitesEUso`, `electron/services/canvas-transfer.test.cjs`, `src/features/onboarding/onboarding-catalog.test.ts`

| Estado | Quando |
| --- | --- |
| normal | seção "Ferramentas" da sidebar (nasce recolhida, sem lembrar) com os grupos Workspace (Projetos, Notas, Modelos, Prompts, Skills, Source Control), Operação (Fetch All, Tarefas Notion, Limites e uso, Orquestrador, QA Logger, Pedidos de escrita, Presets de agente) e Transferência; a ferramenta ativa ganha is-active |
| disabled | Exportar e Importar canvas desabilitados enquanto isBusy (limpando ou transferindo) |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => onSelect(tool)}` (button) | clique | hover/foco pré-carrega o chunk daquela ferramenta (preloadCanvasTool); o clique alterna activeTool no CanvasView (a mesma ferramenta fecha); Tarefas Notion não abre painel: cria/foca o bloco NotionTasksNode | falha no pré-carregamento é engolida de propósito; a falha real aparece no painel de erro do hospedeiro ao abrir | `scripts/canvas-smoke-prompts.cjs` → `abrirPainel` |
| `onClick={run}` (button) | clique | Exportar: canvas:export monta o pacote e files:save-text abre o "Salvar como" de um .fxcanvas; Importar: abre o seletor (input escondido na barra), valida tamanho (60 MB) e conteúdo (canvas:validate-import), pede confirmação e substitui o canvas (canvas:import), fechando qualquer ferramenta (desabilitado: isBusy) | erros viram window.alert com a mensagem ("Não foi possível exportar o canvas.", "Arquivo .fxcanvas inválido." …); cancelar o salvar ou o confirm não faz nada; importação falha regrava os blocos atuais | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Exportar canvas e Importar canvas não são clicados por nenhum teste de interface (só o processo principal tem teste, canvas-transfer.test.cjs) | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |

### Detalhe de preset de prompt

- **ID:** `tool-prompt-detail` · **Dono:** `src/features/canvas/components/tools/PromptDetailPanel.tsx`
- **Persistência:** processo principal: override do preset (automations:save / automations:delete); nenhuma para o rascunho (Esc ou Fechar o descartam sem perguntar); localStorage felixo:canvas-panel-width:prompt-detail e felixo:canvas-panel-height:prompt-detail (gravados ao redimensionar, mas a moldura não os relê ao entrar no detalhe)
- **IPC:** `automations:save`, `automations:delete`, `context-file:write`, `pty:write`
- **Depende de:** `PromptsPanel (editPreset, removeCustomAutomation, insertPrompt)`, `FelixoSelect`, `prompt-overrides`
- **Sobreposição:** dentro da moldura do PromptsPanel (porte xl, z-20/z-30); rodapé de ações colado à borda inferior (-mb-3); a textarea (min-h-80) rola dentro do painel
- **Testes:** `src/features/canvas/services/prompt-overrides.test.ts`

| Estado | Quando |
| --- | --- |
| normal | campos Nome, Descrição, Escopo e Prompt completo do preset como rascunho local, sem autosave, dentro da moldura do PromptsPanel (panelId prompt-detail) |
| pending | rascunho diferente do salvo (isDirty): faixa com Cancelar e Salvar, e Inserir travado |
| success | "Salvo" no lugar de Inserir por 1,5 s depois de Salvar (não aparece na primeira gravação de um preset; ver lacuna) |
| disabled | Restaurar padrão sem edição salva (canResetToPreset falso); Inserir com rascunho pendente |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Voltar à lista` (button) | clique | com rascunho pendente pede window.confirm("Descartar as edições não salvas deste prompt?"); confirmado ou sem rascunho, volta à lista (detailId = null) | cancelar o confirm mantém o detalhe | — |
| `value={scope}` (select) | clique | muda o escopo no rascunho local; só grava em Salvar | sem falha própria (estado local) | — |
| `onClick={cancelDraft}` (button) | clique | volta todos os campos ao texto salvo, sem gravar (desabilitado: só aparece com rascunho pendente) | sem falha própria (estado local) | — |
| `onClick={saveDraft}` (button) | clique | onSave → editPreset: grava o rascunho inteiro como override do preset (upsertPresetOverride) com debounce de 500 ms (automations:save); o item ganha o selo "editado" (desabilitado: só aparece com rascunho pendente) | falha de gravação vira aviso no item da lista, invisível no detalhe e apagado em 2,5 s; fechar o painel antes de 500 ms descarta a gravação | — |
| `onClick={onReset}` (button) | clique | Restaurar padrão: apaga o override (automations:delete) e o texto padrão do preset volta, sem confirmação (desabilitado: sem edição salva) | erro engolido: resultado do delete ignorado; o override volta ao reabrir se não foi apagado | — |
| `onClick={onInsert}` (button) | clique | insertPrompt do PromptsPanel: digita o prompt no terminal expandido sem Enter, ou copia (desabilitado: rascunho pendente) | nenhum retorno no detalhe: Enviando, Feito e Tentar de novo só aparecem na lista; sem trava contra duplo clique | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| nenhum teste abre o detalhe (Ver), edita, salva, restaura ou insere por ele | médio | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| PromptsPanel.tsx:315-339 com PromptDetailPanel.tsx:67-71 e 170-192: Inserir no detalhe não mostra Enviando/Feito/erro nem trava duplo clique; o "Salvo" some na primeira gravação porque a key muda de preset para override e remonta o detalhe (PromptsPanel.tsx:326); falha de automations:save fica invisível | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| CanvasPanel.tsx:133-138: Esc e o botão Fechar desmontam o detalhe sem passar pelo confirm de back() (PromptDetailPanel.tsx:73-78) — o rascunho não salvo some sem pergunta | médio | `3ec91f95-497e-81a3-9be3-c0d354bf7621` |

### Grupos Stage e Alterações (Source Control)

- **ID:** `tool-git-changes` · **Dono:** `src/features/canvas/components/tools/GitChangesList.tsx`
- **Persistência:** repositório git no disco (índice e arquivos descartados)
- **IPC:** `git:stage-all`, `git:unstage-all`, `git:stage-file`, `git:unstage-file`, `git:discard-file`, `git:get-file-diff`
- **Depende de:** `GitPanel (runAction, openFile, discard)`, `git-status (splitPath, statusDescriptor)`
- **Sobreposição:** coluna do meio do Source Control, dentro da moldura workspace; sem camada própria
- **Testes:** `src/features/canvas/components/tools/git-status.test.ts`, `electron/services/git-service.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | um grupo por lado (Stage ou Alterações) com contador, ação em massa e uma linha por arquivo (nome, pasta, letra de status); a linha aberta no leitor ganha is-active |
| empty | grupo sem entradas não renderiza; com os dois vazios o GitPanel mostra "Sem alterações pendentes." |
| disabled | ação em massa, descartar e ação por arquivo travadas enquanto o GitPanel está busy |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={onBulk}` (button) | clique | Stage: "Tirar tudo do stage" (git:unstage-all); Alterações: "Adicionar tudo ao stage" (git:stage-all); relê o status e o leitor (desabilitado: busy) | "Falha ao tirar do stage." / "Falha ao adicionar ao stage." ou a mensagem do git em vermelho no cabeçalho do painel | — |
| `onClick={() => onOpen(entry)}` (button) | clique | abre o arquivo no leitor do lado do grupo (git:get-file-diff com staged/untracked) e revela as pastas dele no explorador | diff recusado: mensagem em vermelho e o leitor diz "Não foi possível ler as diferenças deste arquivo." | — |
| `onClick={() => onDiscard(entry)}` (button) | clique | só no grupo Alterações: window.confirm (arquivo novo: "Apagar o arquivo novo …"; demais: "Descartar as alterações de … e voltar ao último commit?") e git:discard-file; relê status e árvore; se era o arquivo aberto, limpa o leitor (desabilitado: busy; não renderiza no grupo Stage) | cancelar não faz nada; recusa vira "Falha ao descartar as alterações." em vermelho | — |
| `onClick={() => onFileAction(entry)}` (button) | clique | Stage: git:unstage-file; Alterações: git:stage-file; relê o status e o leitor (desabilitado: busy) | "Falha ao tirar do stage." / "Falha ao adicionar ao stage." ou a mensagem do git em vermelho | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| stage/unstage por arquivo e em massa e descartar (destrutivo) sem teste de interface | alto | `3ec91f95-497e-81ca-8319-ee657b0b6492` |

### Explorador do repositório (Source Control)

- **ID:** `tool-git-explorer` · **Dono:** `src/features/canvas/components/tools/GitExplorer.tsx`
- **Persistência:** nenhuma: filtro, pastas abertas e "só o que mudou" vivem no estado do GitPanel
- **IPC:** `git:list-files`, `git:read-file`, `git:get-file-diff`
- **Depende de:** `GitPanel (expanded, query, changedOnly, openPath)`, `repo-tree (filterRepoTree)`, `statusDescriptor`
- **Sobreposição:** primeira coluna do Source Control (some com o botão do explorador); sem camada própria
- **Testes:** `src/features/canvas/components/tools/repo-tree.test.ts`, `src/features/canvas/components/tools/git-status.test.ts`

| Estado | Quando |
| --- | --- |
| normal | árvore do que o git enxerga (sem ignorados), pastas com contador de alterados; filtro por texto e "só o que mudou" abrem a árvore inteira; repositório grande avisa que mostra só os primeiros arquivos |
| loading | "Lendo o repositório…" enquanto git:list-files responde |
| empty | "Nada alterado por aqui." (só alterados) ou "Nenhum arquivo corresponde ao filtro." — este também quando git:list-files falha |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => onChangedOnlyChange(!changedOnly)}` (button) | clique | alterna mostrar só arquivos alterados (aria-pressed); com filtro ativo todas as pastas abrem | sem falha própria (estado do GitPanel, não persiste) | — |
| `onClick={() => onToggleDir(node.path)}` (button) | clique | abre/fecha a pasta (toggleDir em expanded) | sem falha própria (estado local) | — |
| `onClick={() => onOpenFile(node.path)}` (button) | clique | openPath: arquivo alterado abre o diff do lado ainda mexível; arquivo limpo abre o conteúdo (git:read-file) | leitura recusada: mensagem em vermelho e "Não foi possível ler este arquivo."; acima de 1 MB: "Arquivo grande demais para abrir aqui"; binário: aviso de binário | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| sem teste de interface: abrir pasta, filtrar, "só o que mudou" e abrir arquivo limpo | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| GitExplorer.tsx:93: role="tree" com filhos button sem role="treeitem" nem aria-level — o leitor de tela anuncia uma árvore sem itens | baixo | `3ec91f95-497e-8197-a218-ef49c302013d` |

### Histórico da branch (Source Control)

- **ID:** `tool-git-history` · **Dono:** `src/features/canvas/components/tools/GitHistory.tsx`
- **Persistência:** nenhuma (relido a cada abertura e ação via git:get-log)
- **IPC:** `git:get-log`
- **Depende de:** `GitPanel (commits, historyLoading, ahead, historyReadAt)`, `formatRelativeTime`
- **Sobreposição:** coluna do meio, aba Histórico; sem camada própria
- **Testes:** `electron/services/git-service.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | commits recentes (assunto, hash curto, autor, "há X" relativo ao instante da leitura); os primeiros `ahead` vêm marcados "não enviado" |
| loading | "Lendo o histórico…" só sem commits; numa releitura a lista antiga fica até a nova chegar |
| empty | "Nenhum commit ainda." — também quando git:get-log falha (erro mascarado) |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| GitPanel.tsx:148: falha de git:get-log zera os commits sem erro e a aba diz "Nenhum commit ainda." | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| sem teste de interface da aba Histórico (marca "não enviado", tempo relativo) | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |

### Leitor de diff e conteúdo (Source Control)

- **ID:** `tool-git-diff-view` · **Dono:** `src/features/canvas/components/tools/GitDiffView.tsx`
- **Persistência:** nenhuma
- **IPC:** `git:get-file-diff`, `git:read-file`
- **Depende de:** `GitPanel (selected, diff, fileContent, readerLoading)`, `parseDiff (git-diff)`
- **Sobreposição:** terceira coluna do Source Control; rola por dentro (felixo-scm-diff-body); sem camada própria
- **Testes:** `src/features/canvas/components/tools/git-diff.test.ts`

| Estado | Quando |
| --- | --- |
| normal | cabeçalho com caminho e lado (no stage, não preparado, arquivo novo, sem alterações + tamanho) e tabela com números de linha (antiga e nova no diff, uma coluna no conteúdo) |
| loading | "Lendo diferenças…" ou "Lendo o arquivo…" |
| empty | sem arquivo: "Escolha um arquivo para ver o que mudou."; diff vazio: "Sem diferenças de texto para mostrar — pode ser arquivo binário ou apenas mudança de permissão." |
| error | "Não foi possível ler as diferenças deste arquivo." (diff null) ou "Não foi possível ler este arquivo."; binário e arquivo acima de 1 MB têm aviso próprio |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| sem teste de renderização; um diff grande (até 1 MB, GIT_COMMAND_MAX_BUFFER) vira uma tabela inteira sem virtualização | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |

### Carregamento sob demanda dos painéis

- **ID:** `tool-lazy-chunks` · **Dono:** `src/features/canvas/components/canvas-tool-imports.ts`
- **Persistência:** nenhuma (cache de módulos do renderer até o reload)
- **IPC:** nenhum
- **Depende de:** `React.lazy (canvas-tool-loaders.tsx)`, `preloadCanvasTool (canvas-tool-preloaders.ts)`, `CanvasToolPanels (Suspense e ToolPanelErrorBoundary)`
- **Sobreposição:** sem superfície própria: os estados aparecem na moldura CanvasPanel do hospedeiro
- **Testes:** `scripts/bundle-load-benchmark.cjs` → `readFetchAllChunkMarks`, `scripts/bundle-load-benchmark.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | cada painel é um chunk próprio (import dinâmico, React.lazy em canvas-tool-loaders.tsx); ao carregar, markToolLoaded grava a ferramenta em globalThis.__felixoLoadedCanvasTools, no data-felixo-loaded-canvas-tools do <html> e na marca felixo:chunk:<ferramenta>:loaded |
| loading | chunk baixando: o Suspense do hospedeiro mostra "Carregando <ferramenta>…" |
| error | import rejeitado: o ToolPanelErrorBoundary mostra "Não foi possível carregar este painel."; o pré-carregamento por hover/foco (canvas-tool-preloaders.ts) engole a falha de propósito |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| só o chunk do Fetch All é observado (bundle-load-benchmark); nenhum teste força a falha de um chunk para ver o estado de erro | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |

### Raízes da varredura (Fetch All)

- **ID:** `fetch-all-scan-roots` · **Dono:** `src/features/canvas/components/tools/FetchAllScanRoots.tsx`
- **Persistência:** processo principal: scanRoots em userData/config/fetch-all-settings.json
- **IPC:** `fetch-all:pick-roots`, `fetch-all:save-settings`, `fetch-all:get-scope`
- **Depende de:** `scanRootName`, `FetchAllPanel (editScanRoots, addPickedRoots, removeScanRoot)`
- **Sobreposição:** Dentro do cartão de escopo do Fetch All (camada do CanvasPanel); a lista de raízes tem max-h-24 e rola por dentro; o seletor de pastas é diálogo nativo do sistema
- **Testes:** `src/features/canvas/components/tools/FetchAllScanRoots.test.ts`, `src/features/canvas/components/tools/fetch-all-roots.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Título "Raízes configuradas (N)" e uma linha por raiz, com o nome da pasta à frente e o caminho cortado pelo fim |
| loading | saving (seletor aberto ou gravação em curso): o botão mostra "Salvando…" |
| empty | "Nenhuma pasta escolhida." explica que, sem raiz, a varredura volta a pedir o escopo amplo |
| disabled | disabled quando há passada (busy), edição em curso ou as configurações não foram lidas |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Deixar de varrer esta pasta` (button) | clique | removeScanRoot tira a raiz; o FetchAllPanel regrava a configuração inteira por fetch-all:save-settings (mantendo as ignoradas) e recalcula o escopo por fetch-all:get-scope (desabilitado: disabled) | "Falha ao salvar as pastas da varredura." (ou a mensagem do main) na faixa de erro do painel | — |
| `Adicionar pasta` (button) | clique | fetch-all:pick-roots abre o seletor nativo de várias pastas; addPickedRoots junta sem repetir, grava por fetch-all:save-settings e recalcula o escopo — com uma raiz a confirmação do escopo amplo deixa de ser pedida (desabilitado: disabled) | Cancelar o seletor não muda nada; erro do seletor ou da gravação aparece na faixa de erro do painel | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| O render estático é testado, mas adicionar (seletor nativo) e remover raiz nunca são clicados num teste | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |

### Cadeia de contas (aba Cadeia de Limites e uso)

- **ID:** `agent-usage-cadeia` · **Dono:** `src/features/canvas/components/tools/AccountChainSection.tsx`
- **Persistência:** processo principal: SQLite account_chain_settings e account_chain_members (liga/desliga, estratégia, ordem, cobrança e multiplicador declarados), com revisão otimista; nenhuma: rascunho do multiplicador e texto do aria-live
- **IPC:** `account-chain:get-state`, `account-chain:update-settings`, `account-chain:update-members`, `account-chain:check-login`, `account-chain:release-cooldown`, `account-chain:changed`, `account-chain:proposal`, `account-chain:detection`
- **Depende de:** `useAccountChain`, `useClockTick`, `getSharedAccountChainStore`, `account-chain-view (moveChainMember, rowMoveDelta, parseMultiplierInput, summarizeChain)`, `focusWasLost`, `FelixoToggle`, `FelixoSelect`
- **Sobreposição:** Dentro do painel Limites e uso (CanvasPanel z-20/30, tamanho lg); os FelixoSelect de estratégia e cobrança abrem em portal z-1000; Alt+↑/↓ só é tratado quando o alvo é a própria linha, sem disputar teclas com os campos
- **Testes:** `src/features/canvas/services/account-chain-view.test.ts`, `src/features/canvas/services/account-chain-client.test.ts`, `electron/services/account-chain-ipc-handlers.test.cjs`, `electron/services/accounts/account-chain-service.test.cjs`, `electron/services/storage/account-chain-repository.test.cjs`, `scripts/canvas-smoke-contas.cjs` → `ligarEOrdenarCadeia`, `scripts/canvas-smoke-contas.cjs` → `checarNomesAcessiveis`

| Estado | Quando |
| --- | --- |
| normal | Interruptor da cadeia com o resumo (summarizeChain), estratégia com descrição e a lista ordenada: posição, provider, apta/fora agora, motivo, cobrança, multiplicador, login, espera e capacidade; mover anuncia a posição nova por aria-live e o foco segue a linha |
| loading | snapshot.status loading: "Carregando a cadeia de contas…" |
| empty | "Nenhuma conta com login próprio. Crie contas no campo Conta ao abrir um agente." |
| error | snapshot.status error: mensagem role=alert no lugar da aba; mudança recusada ou conflito de revisão aparecem em aviso âmbar (snapshot.message); multiplicador inválido marca aria-invalid e mostra a regra |
| pending | busy: uma ação por vez — enquanto updateSettings/updateMembers/checkLogin/releaseCooldown não volta, todos os controles ficam desabilitados |
| disabled | Sem ponte (fora do app) mostra CHAIN_UNAVAILABLE_MESSAGE; Estratégia desabilitada com a cadeia desligada; conta travada não entra na cadeia; ↑ na primeira e ↓ na última desabilitados |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `label="Cadeia de contas"` (toggle) | clique | account-chain:update-settings com enabled e a revisão atual; o main devolve o estado novo (desligada: nenhum bloco troca de conta; ligada: só propõe e toda troca pede confirmação) (desabilitado: busy) | Conflito de revisão recarrega o estado e mostra o aviso de conflito; recusa do main aparece em âmbar; main fora do ar mostra MAIN_UNREACHABLE_MESSAGE | `scripts/canvas-smoke-contas.cjs` → `ligarEOrdenarCadeia` |
| `Estratégia da cadeia` (select) | clique | account-chain:update-settings com a estratégia escolhida em STRATEGY_OPTIONS; a descrição embaixo acompanha (desabilitado: busy ou cadeia desligada) | Conflito ou recusa do main em aviso âmbar | — |
| `para cima` (button) | clique, ou Alt+↑ com a linha focada | moveChainMember regrava a lista inteira por account-chain:update-members; aceito pelo main, o aria-live anuncia a posição nova e o foco segue a linha (desabilitado: busy ou primeira posição) | Recusa ou conflito: a ordem não muda e o aviso aparece em âmbar | — |
| `para baixo` (button) | clique, ou Alt+↓ com a linha focada | Mesmo caminho do ↑, uma posição para baixo, gravado por account-chain:update-members (desabilitado: busy ou última posição) | Recusa ou conflito: a ordem não muda e o aviso aparece em âmbar | — |
| `Cobrança declarada de` (select) | clique | patchMember grava billingDeclared (Não declarada/Assinatura/Cobrança por uso) por account-chain:update-members; o texto ao lado compara com a cobrança detectada (desabilitado: busy) | Recusa ou conflito em aviso âmbar | — |
| `Conferir agora` (button) | clique | account-chain:check-login da conta no main e recarrega o estado; a linha Login mostra o resultado novo (desabilitado: busy; some em conta travada) | erro engolido: o { ok: false, message } de checkLogin não chega à tela (account-chain-client.ts:252-262 não grava message e AccountChainSection.tsx:191 descarta o retorno) | — |
| `Não era limite` (button) | clique | account-chain:release-cooldown com not-a-limit solta a espera classificada como limite e recarrega o estado (desabilitado: busy; só com espera de classe limit) | erro engolido: a recusa do main não aparece (mesmo caminho do Conferir agora) | — |
| `Já recarreguei` (button) | clique | account-chain:release-cooldown com recharged solta a espera de cobrança e recarrega o estado (desabilitado: busy; só com espera de classe billing) | erro engolido: a recusa do main e o requiresCheck devolvido não aparecem | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Botões ↑/↓, Estratégia (o smoke só lê o valor), Cobrança, multiplicador, Conferir agora, Não era limite e Já recarreguei não são acionados em teste de interface; a reordenação só é exercitada por Alt+↓ na linha | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| Falha de Conferir agora, Não era limite e Já recarreguei é engolida: account-chain-client.ts:252-278 devolve { ok: false, message } sem gravar snapshot.message e AccountChainSection.tsx:191-194 descarta o retorno com void | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| "Não era limite" solta a espera sem regra para uma espera já vencida pelo prazo | baixo | `3e991f95-497e-814a-ba35-d65bacdde06f` |
| Contas do Gemini ficam travadas ("o app não confere o login deste provedor") e não entram na cadeia | baixo | `3e991f95-497e-811d-93e4-c6f283e26dde` |

### Registro de trocas de conta (aba Trocas)

- **ID:** `agent-usage-trocas` · **Dono:** `src/features/canvas/components/tools/AccountSwitchHistory.tsx`
- **Persistência:** processo principal: SQLite account_switch_events (o registro é do main; a aba só lê)
- **IPC:** `account-chain:history`
- **Depende de:** `getAccountChainBridge`, `toHistoryRow`, `useClockTick`, `AgentUsagePanel (onFocusNode, existingNodeIds)`, `TerminalDetailsPanel (sessionFilter, compact)`
- **Sobreposição:** Dentro do painel Limites e uso (z-20/30) ou do painel de detalhes do terminal; sem camada própria
- **Testes:** `src/features/canvas/services/account-chain-view.test.ts`, `scripts/canvas-smoke-contas.cjs` → `checarAbaTrocas`

| Estado | Quando |
| --- | --- |
| normal | Lista "Registro de trocas de conta" com hora absoluta e relativa (<time dateTime>), estado, rota origem → destino, tipo e motivo; no painel de detalhes do terminal aparece compacta e filtrada pela sessão |
| loading | "Carregando o registro…" até a primeira resposta; o ícone do Atualizar gira |
| empty | "Nenhuma troca registrada." (ou "Nenhuma troca registrada para este bloco." com sessionFilter) |
| error | Mensagem role=alert: recusa do main, "Não foi possível falar com o processo principal." ou CHAIN_UNAVAILABLE_MESSAGE sem ponte |
| disabled | Atualizar desabilitado durante loading; "Ir para o bloco" some quando o bloco já não existe ou não há onFocusNode |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Atualizar` (button) | clique | account-chain:history com limite 50 e redesenha a lista (desabilitado: loading; não existe no modo compacto) | Recusa ou exceção viram a mensagem role=alert; a lista anterior continua na tela | — |
| `Ir para o bloco` (button) | clique | onFocusNode centraliza e seleciona no canvas o bloco da troca; só foca, não abre nada | sem falha própria; bloco fechado não oferece o botão | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Atualizar e "Ir para o bloco" não são clicados em teste; a variante compacta do painel de detalhes do terminal não é exercitada | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |

### Ditado por voz (Configurações)

- **ID:** `settings-ditado` · **Dono:** `src/features/canvas/components/tools/DictationSettingsSection.tsx`
- **Persistência:** localStorage felixo:dictation-shortcut; processo principal: userData/config/speech-config.json (endereço, modelo, idioma); processo principal: userData/config/speech-key.bin, cifrado com safeStorage
- **IPC:** `speech:get-config`, `speech:save-config`, `speech:set-key`, `speech:clear-key`, `speech:microphone-status`, `speech:request-microphone`
- **Depende de:** `useDictationShortcut`, `window.felixo.speech`, `dictation (shortcutFromEvent, describeMicrophoneStatus, isLoopbackEndpoint)`
- **Sobreposição:** Seção dentro do painel Configurações (z-20/30); a captura do atalho escuta keydown da janela inteira em fase de captura e para no blur, para não roubar teclas de menus do mesmo painel
- **Testes:** `src/features/canvas/services/dictation.test.ts`, `electron/services/speech/speech-ipc-handlers.test.cjs`, `electron/services/speech/speech-settings-store.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Motor (nuvem ou servidor local, deduzido do endereço), chave (só na nuvem), endereço, modelo, idioma, atalho e estado do microfone |
| error | Mensagem vermelha role=status: atalho sem Ctrl/Cmd ou Alt, falha ao salvar a configuração ou ao guardar a chave |
| pending | capturing: o botão do atalho mostra "Pressione as teclas… (Esc cancela)" e escuta o teclado da janela em fase de captura |
| success | Mensagem verde: "Configuração salva.", "Chave guardada com criptografia do sistema.", "Chave removida." ou o lembrete de salvar depois de trocar o motor |
| disabled | Sem window.felixo.speech: "O ditado por voz só está disponível no aplicativo."; Guardar desabilitado sem chave digitada |
| denied | Microfone denied/restricted: describeMicrophoneStatus diz que o acesso está bloqueado e onde liberar no sistema |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => void saveKey()}` (button) | clique | Guardar: speech:set-key cifra a chave com safeStorage no main (speech-key.bin), limpa o campo e marca keyConfigured (desabilitado: campo de chave vazio; some no motor local) | Mensagem do main ou "Não foi possível guardar a chave." em vermelho | — |
| `onClick={() => void clearKey()}` (button) | clique | Remover: speech:clear-key apaga a chave guardada e mostra "Chave removida." (desabilitado: só aparece com chave configurada e motor na nuvem) | erro engolido: o retorno não é lido e o handler do main não tem try (speech-ipc-handlers.cjs:63-66); se ele lançar, a promessa rejeita sem aviso | — |
| `Salvar endereço, modelo e idioma` (button) | clique | speech:save-config grava baseUrl, model e language em speech-config.json e a tela recebe a configuração normalizada | Mensagem do main ou "Não foi possível salvar." em vermelho; com config nula (get-config falhou) o clique não faz nada | — |
| `aria-pressed={capturing}` (button) | clique liga a captura; a próxima combinação vira o atalho; Esc ou perder o foco cancela | Grava o atalho em localStorage felixo:dictation-shortcut e avisa quem escuta (felixo:dictation-shortcut-changed) | Combinação sem Ctrl/Cmd ou Alt mostra a regra em vermelho e continua capturando | — |
| `Restaurar padrão` (button) | clique | Volta o atalho para DEFAULT_DICTATION_SHORTCUT (desabilitado: só aparece com atalho diferente do padrão) | sem falha própria | — |
| `Verificar/permitir microfone` (button) | clique | speech:request-microphone pede a permissão pelo main no macOS (askForMediaAccess) e mostra o estado que ficou; no Windows e no Linux só informa | Resposta sem ok é ignorada; recusa aparece como estado denied com a dica do sistema | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Sem teste de interface da seção (motor, chave, endereço, atalho, microfone); a própria tela avisa que o servidor local nunca foi testado com um servidor real | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |
| Falhas engolidas: DictationSettingsSection.tsx:87-91 mostra "Chave removida." sem ler o retorno e speech:clear-key não tem try no main (speech-ipc-handlers.cjs:63-66); se speech:get-config falhar (DictationSettingsSection.tsx:35-38), config fica nula, os campos de endereço/modelo/idioma não aceitam digitação e "Salvar endereço, modelo e idioma" não faz nada, sem aviso | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Rolagem no terminal do Claude Code (Configurações)

- **ID:** `settings-rolagem-claude` · **Dono:** `src/features/canvas/components/tools/ClaudeTerminalScrollSection.tsx`
- **Persistência:** localStorage felixo-ai-core.claude-terminal-scroll (on/off)
- **IPC:** nenhum
- **Depende de:** `loadClaudeTerminalScroll`, `saveClaudeTerminalScroll`, `shouldUseClassicScreen`, `FelixoToggle`
- **Sobreposição:** Seção dentro do painel Configurações (z-20/30), sem camada própria
- **Testes:** `src/features/canvas/services/terminal-scroll-preference.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Interruptor desligado por padrão, com a explicação da tela alternativa do Claude Code |
| success | "Ativado — vale para os próximos terminais do Claude Code." com o interruptor ligado |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `label="Rolagem no terminal do Claude Code"` (toggle) | clique | saveClaudeTerminalScroll grava on/off; os próximos terminais do Claude nascem com CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 (shouldUseClassicScreen) e ganham barra de rolagem; os já abertos não mudam | Sem localStorage a escolha vale só até fechar o app (erro engolido de propósito) | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| O efeito no terminal real (menus, seleção com o mouse e redesenho do Claude no modo clássico) não foi conferido numa janela, como a própria seção avisa; nenhum teste liga o interruptor e abre um Claude | baixo | `3ec91f95-497e-81ca-8319-ee657b0b6492` |

## Modais

### Pergunta de agente (felixo perguntar)

- **ID:** `agent-question-dialog` · **Dono:** `src/features/canvas/components/AgentQuestionDialog.tsx`
- **Persistência:** processo principal: fila de pedidos de agente (pasta agent-requests, um arquivo por pedido)
- **IPC:** `canvas:list-questions`, `canvas:answer-question`, `canvas:agent-questions`
- **Depende de:** `agent-question-dialog (pickPendingQuestion, optionIndexForKey)`, `window.felixo.canvas`
- **Sobreposição:** fixed inset-0 z-60 com fundo bg-black/50, montado no CanvasView; cobre canvas, gaveta e painéis; o card do tutorial fica inert por baixo. Não redimensiona (bloqueante, max-w-md).
- **Testes:** `src/features/canvas/components/agent-question-dialog.test.ts`, `electron/services/agent-question-ipc-handlers.test.cjs`, `scripts/canvas-smoke-onboarding.cjs` → `criarCenariosDoTutorial`

| Estado | Quando |
| --- | --- |
| normal | A pergunta pendente mais antiga (pickPendingQuestion) com origem, texto puro e opções numeradas. |
| empty | Sem pergunta pendente: não renderiza nada. |
| error | Resposta recusada: "Não foi possível responder." (ou a mensagem do main) em vermelho. |
| pending | busy enquanto responde: opções e Dispensar desabilitados. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => void answer(indice)}` (button) | clique ou tecla 1–4 (ouvinte na janela inteira) | Botão repetido por opção: canvas:answer-question { id, indice }; o main resolve o pedido com a opção do arquivo gravado e o agente bloqueado recebe a resposta; a lista é recarregada (canvas:list-questions). (desabilitado: busy) | Recusa: mensagem em vermelho. IPC rejeitado: try/finally sem catch, só o busy volta. | `scripts/canvas-smoke-onboarding.cjs` → `criarCenariosDoTutorial` |
| `Dispensar (Esc)` (button) | clique ou Esc em qualquer lugar da janela | answer(null): o main resolve o pedido como recusado (aceito: false) e o diálogo some. (desabilitado: busy) | Mesma da resposta: recusa em vermelho, rejeição sem tratamento. | `scripts/canvas-smoke-onboarding.cjs` → `criarCenariosDoTutorial` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Não pega o foco nem prende o Tab, e Esc e 1–4 são ouvidos na janela inteira: digitar um número no terminal ou num campo com a pergunta aberta responde a pergunta. | alto | `3e891f95-497e-81b3-8857-da9125ff3f49` |
| Mesma camada z 60 do HandoffDialog e do AccountSwitchDialog; pela ordem do DOM a pergunta fica por baixo deles, e as teclas 1–4 continuam valendo. Sem teste dos dois abertos. | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |
| O smoke responde pelo teclado; o clique nas opções e em Dispensar não é exercitado. | baixo | `3ec91f95-497e-81e8-8f18-e2a529b0568e` |
| answer e load não tratam IPC rejeitado: nenhum aviso (AgentQuestionDialog.tsx:28-56). | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Passar responsabilidade

- **ID:** `handoff-dialog` · **Dono:** `src/features/canvas/components/HandoffDialog.tsx`
- **Persistência:** localStorage felixo:dialog-size:handoff; localStorage felixo:last-agent-launch-preferences (só ao confirmar); canvas salvo: bloco de continuação com handoffText; processo principal: registro de trocas (record-manual)
- **IPC:** `account-chain:record-manual`, `account-chain:confirm`, `pty:spawn`
- **Depende de:** `useAgentConfig`, `AgentConfigFields`, `useResizableDialog`, `keyboard-focus (tabTrapTarget)`, `CanvasView.passResponsibility`, `buildTerminalHandoffPrompt`, `getAccountChainBridge`
- **Sobreposição:** fixed inset-0 z-60 (nokey), fundo bg-black/60; prende o Tab e fica por cima do tour (verificado no smoke). Redimensionável (max-w-md, max-h 100dvh − 2rem). Divide a camada z 60 com a pergunta de agente: pela ordem do DOM, fica por cima dela.
- **Testes:** `src/features/canvas/components/modal-dialogs-keys.test.ts`, `src/features/canvas/services/terminal-handoff.test.ts`, `src/features/shared/dialog/dialog-sizing.test.ts`, `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos`, `scripts/canvas-smoke-onboarding.cjs` → `criarCenariosDoTutorial`

| Estado | Quando |
| --- | --- |
| normal | Campos do agente de destino (AgentConfigFields com configuração própria e temporária), aviso de que o histórico vai inteiro e, vindo de detecção, o motivo e o horário. |
| error | Erro em texto: configuração inválida, "O terminal de origem não está mais disponível." ou a mensagem da exceção. |
| pending | busy: "Passando…" e Cancelar desabilitado. |
| disabled | accountSelectionIssue: o confirmar fica desabilitado com o motivo no title. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Fechar"` (button) | clique, Esc ou mousedown no fundo | closeHandoff: fecha sem criar nada; a configuração temporária é descartada. | Sem falha própria. | — |
| `Cancelar` (button) | clique | closeHandoff: mesmo efeito do Fechar. (desabilitado: busy) | Sem falha própria. | — |
| `onClick={() => void confirmar()}` (button) | clique | prepareForLaunch → buildOptions (sufixo " · continuação" sem nome próprio) → passResponsibility monta buildTerminalHandoffPrompt com o histórico e cria o bloco de continuação (createContinuationNode → PTY novo com handoffText); vindo de detecção, account-chain:record-manual; savePreferences e fecha. (desabilitado: busy ou accountSelectionIssue) | Configuração inválida ou origem ausente: erro em texto, diálogo aberto. Falha do record-manual é engolida de propósito (.catch). | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Os smokes só abrem o diálogo e fecham com Esc: confirmar a passagem (bloco novo + PTY) nunca é exercitado ponta a ponta. | médio | `3ec91f95-497e-81e8-8f18-e2a529b0568e` |
| A passagem manual manda o histórico sem redigir segredos (só avisa no texto). | médio | `3e991f95-497e-811e-a0a3-c9c0dd6d0c48` |
| Com o Claude na tela alternativa o histórico enviado pode sair incompleto. | médio | `3e991f95-497e-81e0-8c54-f507189f8729` |
| Falha do account-chain:record-manual some sem aviso: a passagem pode faltar no registro de trocas (HandoffDialog.tsx:127-136, intencional). | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |

### Trocar de conta?

- **ID:** `account-switch-dialog` · **Dono:** `src/features/canvas/components/AccountSwitchDialog.tsx`
- **Persistência:** processo principal: propostas, recusas, tickets e registro de trocas da cadeia de contas; canvas salvo (dados do nó): chainSuccessorNodeId, accountMode e o bloco novo com chainOrigin
- **IPC:** `account-chain:redact-transcript`, `account-chain:confirm`, `account-chain:decline`, `account-chain:set-session-mode`, `account-chain:check-login`, `account-chain:get-state`, `agent-usage:refresh`, `pty:spawn`
- **Depende de:** `useAccountContinuation`, `useAccountChain`, `useClockTick`, `account-switch-dialog (buildAccountSwitchDialogModel)`, `performContinuation`, `keyboard-focus (tabTrapTarget)`
- **Sobreposição:** fixed inset-0 z-60 (nokey), max-w-lg, não redimensiona; prende o Tab e devolve o foco a quem abriu. Viewport 375×667 coberto pela sessão C (C12). Divide a camada z 60 com a pergunta de agente, que pela ordem do DOM fica por baixo.
- **Testes:** `src/features/canvas/components/modal-dialogs-keys.test.ts`, `src/features/canvas/services/account-switch-dialog.test.ts`, `src/features/canvas/services/account-continuation.test.ts`, `electron/services/account-chain-ipc-handlers.test.cjs`, `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia`

| Estado | Quando |
| --- | --- |
| normal | Proposta aberta por "Ver opções": conta de origem com evidência, contas de destino (foco no rádio recomendado), custo, aviso de troca de provedor e o terminal antigo. |
| loading | transcript null: "Mascarando segredos do histórico…" e confirmar desabilitado. |
| empty | model.empty: nenhuma conta apta, com os motivos e Conferir login de novo, Configurar cadeia e Fechar. |
| error | binding.error, falha da redação do histórico, selectionLost e "Esta proposta já foi decidida em outro lugar ou expirou." em role="alert". |
| pending | busy: "Abrindo…", todos os botões desabilitados e o Esc não recusa (escapeDeclines). |
| disabled | Terminal antigo ainda ativo sem a caixa de ciência marcada: confirmar desabilitado. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Agora não"` (button) | clique | onLater: account-chain:decline (later), limpa a detecção da sessão e fecha; o foco vai ao bloco de origem. (desabilitado: busy) | A mensagem de erro do decline é descartada: o diálogo fecha antes da resposta. | `src/features/canvas/components/modal-dialogs-keys.test.ts` |
| `Conferir login de novo` (button) | clique | store.checkLogin das contas excluídas (até 5) → account-chain:check-login e account-chain:get-state; o diálogo atualiza pela proposta ao vivo. (desabilitado: só no estado vazio) | erro engolido: o resultado (e a mensagem de falha) é descartado com void. | — |
| `Configurar cadeia` (button) | clique | Fecha sem devolver o foco e abre Limites e uso na aba "cadeia". (desabilitado: só no estado vazio) | Sem falha própria. | — |
| `onClick={binding.onClose}` (button) | clique | Fecha sem responder (estado vazio); o foco volta a quem abriu. (desabilitado: só no estado vazio) | Sem falha própria: a proposta continua aberta. | — |
| `Medir agora` (button) | clique | agent-usage:refresh e depois account-chain:get-state: a capacidade das opções é recalculada. (desabilitado: só com a estratégia most_capacity) | Falha da medição é engolida de propósito; a lista fica com a capacidade anterior. | — |
| `Ir para o terminal antigo` (button) | clique | focusNode(sourceNodeId): centraliza o bloco de origem por baixo do modal, que continua aberto. | Sem falha própria; o efeito só aparece depois de fechar o diálogo. | — |
| `Fixar este bloco na conta atual` (button) | clique | onPin: account-chain:set-session-mode (pinned); persist grava accountMode "pinned" no nó; a mensagem vai para a faixa do bloco; fecha e foca o bloco. (desabilitado: busy; só com conta própria na origem (canPin)) | Recusa ou main fora: mensagem na faixa do bloco (setBannerError). | — |
| `Não era limite` (button) | clique | onNotALimit: account-chain:decline (not-a-limit), limpa a detecção e fecha. (desabilitado: busy; só com failureClass "limit") | A mensagem de erro do decline é descartada. | — |
| `onClick={binding.onLater} disabled={binding.busy} className={BOTAO_SECUNDARIO}` (button) | clique ou Esc (fora do busy) | Botão de texto "Agora não": mesmo onLater do X, sem nenhum pty:spawn. (desabilitado: busy) | A mensagem de erro do decline é descartada. | `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia` |
| `model.confirmLabel` (button) | clique | performContinuation: account-chain:confirm devolve o ticket, cria o bloco novo na conta de destino com o histórico redigido e chainTicket (pty:spawn), marca o antigo com chainSuccessorNodeId e fecha; clique duplo dá um único spawn. (desabilitado: busy, proposta encerrada em outro lugar, sem destino, histórico não redigido ou ciência pendente) | Erro do main em role="alert"; SOURCE_ACTIVE passa a exigir a caixa de ciência; proposta alterada vira override. | `scripts/canvas-smoke-contas.cjs` → `criarSessaoDaCadeia` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Conferir login, Configurar cadeia, Fechar, Medir agora, Ir para o terminal antigo, Fixar e Não era limite não são clicados em nenhum teste (a sessão C confirma e usa Esc). | médio | `3ec91f95-497e-81e8-8f18-e2a529b0568e` |
| onLater e onNotALimit fecham antes da resposta e descartam a mensagem de erro do decline; onCheckLogin descarta o resultado (useAccountContinuation.ts:367-376 e 392). | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Não bloqueantes de acessibilidade da interface da cadeia. | baixo | `3e991f95-497e-815c-845c-da8829970c0c` |
| O mesmo limite pode voltar a propor depois de "Agora não". | baixo | `3e991f95-497e-81c9-a900-f0d5585956f9` |
| "Não era limite" com espera já vencida pelo prazo. | baixo | `3e991f95-497e-814a-ba35-d65bacdde06f` |
| O aviso de continuação automática do Claude no terminal antigo não oferece cancelar. | médio | `3e991f95-497e-812d-b877-e7bb0162a60f` |

### Alças de redimensionar dos modais

- **ID:** `modal-alcas-redimensionar` · **Dono:** `src/features/shared/dialog/DialogResizeHandles.tsx`
- **Persistência:** localStorage felixo:dialog-size:<id> (no canvas, felixo:dialog-size:handoff)
- **IPC:** nenhum
- **Depende de:** `useResizableDialog`, `readDialogSize`, `writeDialogSize`, `clearDialogSize`, `clampDialogSize`, `resizeCentered`, `swallowNextClick`
- **Sobreposição:** absolute z 10 dentro da moldura do modal (z 60): borda direita (w-2, top-6 bottom-6), inferior (h-2, left-6 right-6) e canto (20 px). swallowNextClick engole o clique de soltar fora da moldura, que fecharia o modal.
- **Testes:** `src/features/shared/dialog/dialog-sizing.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Sem ajuste salvo: nenhum estilo inline, o modal segue o tamanho da classe. No canvas, só o HandoffDialog (id "handoff") usa as alças. |
| error | Valor salvo inválido ou storage que lança nos métodos: tratado como "nunca ajustado". |
| pending | Arrastando (resizing): cursor do body ew/ns/nwse-resize e user-select none; a borda acompanha o ponteiro (dx vira 2·dx). |
| success | Ajustado: tamanho fixo em felixo:dialog-size:<id>, sempre dentro de [320×240, janela − 16 px] e reajustado quando a janela encolhe. Setas mudam 24 px; Home, Enter ou duplo clique voltam ao original. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum smoke arrasta ou usa o teclado nas alças do HandoffDialog; a matemática é testada, a interação não. | baixo | `3ec91f95-497e-81f7-8b12-c5c252d020c7` |
| useResizableDialog.ts:43, :76, :106 e :112 leem window.localStorage fora de try: o getter pode lançar (SecurityError com storage bloqueado) e derrubar o modal no useState inicial. Só os métodos estão protegidos em dialog-sizing.ts. | baixo | `3ec91f95-497e-8176-bef0-dfde828936dc` |
| A alça do canto (20×20, z 10, bottom-0 right-0) fica sobre o canto inferior direito da moldura, onde costumam estar os botões do rodapé; não foi medido se cobre algum. | baixo | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

## Overlays e avisos

### Menu de cor da moldura (clique direito no bloco)

- **ID:** `menu-cor-da-moldura` · **Dono:** `src/features/canvas/components/NodeColorMenu.tsx`
- **Persistência:** canvas salvo (data.frameColor do bloco)
- **IPC:** `canvas:save`
- **Depende de:** `readFrameColor / FRAME_COLORS / FRAME_COLOR_SWATCHES (frame-colors)`, `colorMenu e updateNodeData (CanvasView)`, `frameClassName (orderedNodes)`
- **Sobreposição:** fixed z-50 (mesmo nível de toasts e overlay isBusy): acima de topbar/statusbar (18), dock e painéis (20/30) e sidebar (26); abaixo do anel e do card do tutorial (54/55), dos diálogos (60), do menu de perfil (70) e dos FelixoSelect (1000).
- **Testes:** `src/features/canvas/components/frame-colors.test.ts`, `scripts/canvas-smoke.cjs` → `checarElementosAbertosEmViewportsCriticos`

| Estado | Quando |
| --- | --- |
| normal | role="menu" "Cor da moldura" aberto no ponto do clique direito, com 6 cores em role="menuitemradio" e ✓ na cor ativa. |
| disabled | "Sem cor" quando o bloco não tem cor. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => onSelect(color)}` (button) | clique | Uma por cor: updateNodeData(nodeId, { frameColor }) → canvas:save; o wrapper do bloco ganha felixo-frame felixo-frame-<cor> e a borda muda; o menu fecha. | Falha de canvas:save só no console (a cor some no próximo início). | — |
| `onClick={() => onSelect(undefined)}` (button) | clique | "Sem cor": grava frameColor indefinido, a classe de moldura sai e o menu fecha. (desabilitado: Sem cor ativa.) | Falha de canvas:save só no console. | — |
| `role="menuitem"` (role) | clique | O mesmo "Sem cor" exposto como item de menu (contado à parte pelo padrão role="menuitem"): mesmo efeito do botão. (desabilitado: Sem cor ativa.) | Sem falha própria além da do botão. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Escolher uma cor ou "Sem cor" não é exercitado: o smoke só abre o menu por clique direito no grupo e fecha com Esc, em 1280×800. | baixo | `3ec91f95-497e-8141-b6c1-d1833aac5664` |
| Menu fixed no clientX/clientY sem limite à janela (NodeColorMenu.tsx:39-40): perto da borda direita ou de baixo sai da tela; em 320 px o smoke não abre o menu. | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |
| Sem foco nem teclado (NodeColorMenu.tsx:35-72; CanvasView.tsx:3174-3178): o foco não entra no role="menu", não há setas, e o menu só fecha por Esc, clique no fundo ou escolha — clicar noutro bloco, rolar ou dar zoom o deixam aberto no lugar antigo. | baixo | `3ec91f95-497e-8197-a218-ef49c302013d` |
| O realce de notificação não lida é declarado depois da moldura no CSS e vence a cor escolhida; ainda não conferido numa janela real nem no smoke. | baixo | `3e191f95-497e-81fd-b657-d7a63b5d17f0` |

### Menu de perfil do navegador (Página Web)

- **ID:** `menu-perfil-do-navegador` · **Dono:** `src/features/canvas/components/WebviewProfileMenu.tsx`
- **Persistência:** processo principal: SQLite webview_profiles (id, nome, cor) e a partição persist:… de cada perfil; canvas salvo (data.profileId do bloco)
- **IPC:** `webview-profiles:list`, `webview-profiles:save`, `webview-profiles:delete`, `canvas:save`
- **Depende de:** `useWebviewProfiles (webviewProfilesStore, useSyncExternalStore)`, `describeWebviewProfile / isCustomProfileId (webview-profile)`, `FRAME_COLOR_SWATCHES`, `createPortal`
- **Sobreposição:** Portal fixed z-70, w-52, clampado à largura da janela (left ≥ 8): acima de menu de cor (50), anel/card do tutorial (54/55) e diálogos (60); abaixo só dos FelixoSelect (1000). Não reposiciona quando o canvas se move.
- **Testes:** `src/features/canvas/services/webview-profile.test.ts`, `src/features/canvas/services/webview-profiles-store.test.ts`, `electron/services/webview-profiles-ipc-handlers.test.cjs`, `electron/services/storage/webview-profiles-repository.test.cjs`, `electron/services/webview-profile-partition.test.cjs`

| Estado | Quando |
| --- | --- |
| normal | Botão no cabeçalho com o nome (e a cor) do perfil; aberto, lista Padrão + perfis próprios com ✓ no ativo e campo "Novo perfil…". |
| loading | Perfil próprio antes da lista chegar: "Perfil…". |
| empty | Sem perfis próprios: só "Padrão". |
| error | role="alert" com o motivo (nome vazio, longo, duplicado ou "Padrão"; falha ao salvar ou excluir). |
| disabled | "Criar perfil" com o nome vazio. |
| denied | Perfil excluído ainda gravado no bloco: "Perfil removido" e o bloco fica sem sessão até escolher outro. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-haspopup="menu"` (button) | clique | Abre/fecha o menu em portal (document.body), posicionado sob o botão e contido na largura da janela; Esc e mousedown fora fecham. | Sem falha própria. | — |
| `onChange(item.id)` (button) | clique | Um por perfil (role="menuitemradio"): grava data.profileId no bloco (canvas:save); a partição muda e o webview é recriado na mesma página com os logins do outro perfil; o menu fecha. | Falha de canvas:save só no console; o guest recriado ainda não tem dom-ready e Voltar/Recarregar podem lançar (ver bloco Página Web). | — |
| `aria-label={`Excluir o perfil ${item.name}`}` (button) | clique | Um por perfil próprio: confirm e webview-profiles:delete (o processo principal apaga cookies e logins da partição e tira o perfil); some da lista em todos os blocos. (desabilitado: Não existe no Padrão.) | role="alert" com a mensagem; cancelar o confirm não faz nada; blocos que usavam o perfil passam a "Perfil removido". | — |
| `aria-label="Criar perfil"` (button) | clique | Valida o nome (validateWebviewProfileName), grava em webview-profiles:save, aplica o perfil novo ao bloco e fecha o menu (Enter no campo faz o mesmo). (desabilitado: Nome vazio.) | role="alert" com o motivo da recusa ou "Não foi possível criar o perfil.". | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum dos 4 controles é exercitado na tela: trocar, criar e excluir perfil (que apaga logins) só têm teste de store e de IPC. | médio | `3ec91f95-497e-8141-b6c1-d1833aac5664` |
| Falha ao listar perfis é silenciosa (services/webview-profiles-store.ts:38-45): ok falso deixa ready falso para sempre ("Perfil…" no botão) e uma rejeição nunca é tentada de novo (loaded já é verdadeiro). | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| O menu (z-70) fica acima dos diálogos modais (60) e não acompanha pan/zoom do canvas (posição calculada só ao abrir); clique dentro do webview não fecha. Nenhum teste mede. | baixo | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Tutorial do canvas: montagem, decisão automática e região live

- **ID:** `onboarding-montagem` · **Dono:** `src/features/onboarding/OnboardingMount.tsx`
- **Persistência:** processo principal: SQLite, tabela settings, chave onboarding.state (compare-and-set via onboarding:write); sessionStorage felixo:onboarding:sessao (tour e passo abertos, para retomar depois de um reload; apagado ao pular ou concluir); localStorage felixo:onboarding:primeiro-boot (marcador de primeiro boot; removido depois da primeira leitura ou gravação com estado); sessionStorage felixo:onboarding:falha (só na instância devtools: força falha de render)
- **IPC:** `onboarding:read`, `onboarding:write`, `qa-logger:log`
- **Depende de:** `onboardingStore (createOnboardingStoreProxy)`, `useOnboardingSnapshot`, `loadOnboardingUi`, `OnboardingErrorBoundary`, `createWindowOnboardingStore`, `getOnboardingBootSignals`
- **Sobreposição:** Logo depois da sidebar na árvore (ordem de Tab sidebar → tour → canvas), sem portal. A região live é sr-only e não ocupa espaço; o que aparece é da camada (anel z 54, card e aviso z 55).
- **Testes:** `src/features/onboarding/onboarding-store.test.ts`, `src/features/onboarding/onboarding-store-proxy.test.ts`, `src/features/onboarding/onboarding-store.property.test.ts`, `src/features/onboarding/onboarding-boundaries.test.ts`, `src/features/onboarding/onboarding-boot-signals.test.ts`, `src/features/onboarding/onboarding-state.test.ts`, `electron/services/onboarding-ipc-handlers.test.cjs`, `electron/services/storage/onboarding-state-repository.test.cjs`, `electron/services/storage/onboarding-state-multiprocess.test.cjs`, `electron/core/onboarding-automation.test.cjs`, `scripts/canvas-smoke-onboarding.cjs` → `sa0`, `scripts/canvas-smoke-onboarding.cjs` → `sa4`, `scripts/canvas-smoke-onboarding.cjs` → `sa9`, `scripts/canvas-smoke-onboarding.cjs` → `sa10`, `scripts/canvas-smoke-onboarding.cjs` → `sb1`, `scripts/canvas-smoke-onboarding.cjs` → `sb3sb4`, `scripts/canvas-smoke-onboarding.cjs` → `sb7`

| Estado | Quando |
| --- | --- |
| normal | Canvas hidratado e fase "ocioso": só a região live (sr-only, role="status") existe, com a decisão automática em data-felixo-onboarding-decisao; nada visível. |
| loading | Fase "carregando": a store chega num chunk próprio (preload na montagem) e a leitura de onboarding:read tem prazo de 4 s (ONBOARDING_READ_TIMEOUT_MS); decisão "carregando". |
| empty | Decisão "nada", "recuperado" ou "suprimido:*" (autoOpen falso na automação, tutorial já visto ou concluído): nada abre. |
| error | Fase "desativado": a camada falhou no render ou o chunk não carregou; o OnboardingErrorBoundary devolve null, a store limpa a sessão e registra no QA Logger (escopo renderer:onboarding). Uma abertura nova (outro resetKey) tenta de novo. |
| pending | Tour aberto e canvas fora da tela (chat): canvasUnmounted passa o tour a foco "manter" e para a avaliação; ao voltar, o tour reaparece no mesmo passo sem puxar o foco. |
| success | Primeiro uso reivindicado (REIVINDICAR_INICIAL aplicado): o tour inicial abre sozinho com o foco no card (decisão "aberto"); reload com sessão → decisão "retomada" no mesmo passo. |
| disabled | Persistência "sem-ponte" (dev:web, testes), "indisponivel" (leitura falhou ou passou do prazo, escrita recusada) ou "somente-leitura" (estado de versão mais nova): tudo em memória, nada gravado, sem abertura automática. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| O primeiro uso real (abertura sozinha e gravação) só roda no smoke com FELIXO_DEVTOOLS_ONBOARDING=1; no app instalado de verdade ninguém viu a decisão automática. | baixo | `3e891f95-497e-8148-b00e-f27e78767664` |

### Tutorial do canvas: anel, posicionamento e cessão a diálogo modal

- **ID:** `onboarding-anel-e-camada` · **Dono:** `src/features/onboarding/OnboardingTourLayer.tsx`
- **Persistência:** nenhuma: top/left/width/max-height e data-modo são escritos no DOM pela ref, sem estado React por quadro; sessionStorage felixo:onboarding:sessao (tour e passo abertos, para retomar depois de um reload; apagado ao pular ou concluir)
- **IPC:** `onboarding:write`
- **Depende de:** `useOnboardingSnapshot`, `useSurfacePlacement`, `useYieldToModal`, `computeCardPlacement`, `computeRingRect`, `resolveStepTarget`, `OnboardingFocusHold`
- **Sobreposição:** position: fixed fora de splitHorizontalSpace (não reserva largura). Anel em --felixo-z-onboarding-ring (54), card e aviso em --felixo-z-onboarding (55): acima dos toasts (50), abaixo dos diálogos (60), do menu de link (70) e do menu Ajuda/FelixoSelect (1000). Desvia de [data-felixo-tour-avoid] e [data-canvas-layout-warning]; sem lado livre, cobre o obstáculo (limitação declarada).
- **Testes:** `src/features/onboarding/onboarding-layout.test.ts`, `src/features/onboarding/OnboardingUi.test.ts`, `src/features/onboarding/onboarding-css.test.ts`, `scripts/canvas-smoke-onboarding-geometry.test.cjs`, `scripts/canvas-smoke-onboarding.cjs` → `sa3`, `scripts/canvas-smoke-onboarding.cjs` → `conferirPerguntaSobreOTour`, `scripts/canvas-smoke-onboarding.cjs` → `sa5`, `scripts/canvas-smoke-onboarding.cjs` → `sa8`, `scripts/canvas-smoke-onboarding.cjs` → `sa10`

| Estado | Quando |
| --- | --- |
| normal | Tour aberto: anel (outline de 2 px, pointer-events none) sobre o alvo do passo, contido na janela, e o card ao lado (computeCardPlacement). Alvo preferido fora de alcance: aponta a alternativa do catálogo e reconfere a cada 500 ms. |
| loading | Chunk preguiçoso da interface baixando (Suspense com fallback null): nada na tela. |
| empty | Nenhum candidato a alvo resolvido: o anel some (sem data-visivel) e o card é posicionado sem alvo. |
| error | Exceção no render (ou falhaForcada com sessionStorage felixo:onboarding:falha = render na instância devtools): o boundary derruba só o tutorial, o canvas continua hidratado. |
| pending | Um [aria-modal="true"] está aberto (conferido a cada 250 ms e a cada focusin): card ou aviso ficam inert, a posição congela (placementFrozen) e o foco espera no OnboardingFocusHold (nokey); volta ao mesmo controle quando o diálogo fecha. |

Sem controle próprio: as ações vêm de outros elementos.

| Lacuna | Risco | Task |
| --- | --- | --- |
| A cessão ao diálogo depende de sondagem (MODAL_CHECK_MS = 250 ms) porque o AgentQuestionDialog não pega o foco nem prende o Tab; nesse intervalo só o hasOpenModal dos handlers impede o Enter de avançar o tour por baixo. | médio | `3e891f95-497e-81b3-8857-da9125ff3f49` |

### Card do tutorial (Pular, Voltar, Próximo/Concluir)

- **ID:** `onboarding-card-tour` · **Dono:** `src/features/onboarding/OnboardingTourCard.tsx`
- **Persistência:** processo principal: SQLite, tabela settings, chave onboarding.state (compare-and-set via onboarding:write); sessionStorage felixo:onboarding:sessao (tour e passo abertos, para retomar depois de um reload; apagado ao pular ou concluir)
- **IPC:** `onboarding:write`
- **Depende de:** `describeTourCard`, `OnboardingTourLayer (TourSurface)`, `onboardingStore`
- **Sobreposição:** fixed, z 55, min(22rem, 100vw − 24px), ancorado ao lado do alvo a 10 px dele e a 12 px da borda; em viewport compacto vira folha de largura cheia. Fica inert sob diálogos (60). Coberto pelo menu e pelo aviso de link (70) e pelo menu Ajuda (1000).
- **Testes:** `src/features/onboarding/OnboardingUi.test.ts`, `src/features/onboarding/onboarding-store.test.ts`, `scripts/canvas-smoke-onboarding.cjs` → `sa1`, `scripts/canvas-smoke-onboarding.cjs` → `sa2`, `scripts/canvas-smoke-onboarding.cjs` → `sb2`

| Estado | Quando |
| --- | --- |
| normal | Passo n de N: título do tour, contador, título e corpo do passo e os botões Pular … Voltar, Próximo; role="dialog" com aria-modal="false" e nokey. |
| pending | Nasce invisível (CSS sem data-modo) até ser medido e posicionado no mesmo quadro. |
| success | Último passo: o botão principal vira Concluir (nextAction "concluir"); concluído, a região live anuncia "Tutorial concluído. Reabra em Ajuda." e o foco volta ao botão Ajuda. |
| disabled | Passo 1: Voltar com aria-disabled="true" e sem onClick. Com um diálogo modal por cima: o card inteiro fica inert e os três handlers saem sem efeito (hasOpenModal). |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `data-felixo-onboarding-action="pular"` (button) | clique, Enter ou Espaço (Esc no card faz o mesmo) | store.skip: fecha o card na hora, apaga a sessão, anuncia "fechado" e enfileira PULAR (status pulado, passo e anchorFallbacks) para onboarding:write; o foco volta a quem o tinha na abertura ou ao botão Ajuda. (desabilitado: diálogo modal aberto (card inert)) | Escrita recusada ou estado de versão mais nova: a store degrada para "indisponivel"/"somente-leitura", segue em memória e registra warn no QA Logger; a tela fecha do mesmo jeito. | `scripts/canvas-smoke-onboarding.cjs` → `sb6` |
| `data-felixo-onboarding-action="voltar"` (button) | clique, Enter ou Espaço | store.back: volta um passo (sessionStorage felixo:onboarding:sessao regravado, nada vai ao SQLite); o anel e o card migram para o alvo do passo anterior sem remontar, com o foco no botão. (desabilitado: passo 1 (aria-disabled) ou diálogo modal aberto) | Sem falha própria: no passo 1 o botão fica aria-disabled e o clique não faz nada (o foco não se perde). | `scripts/canvas-smoke-onboarding.cjs` → `sa8` |
| `data-felixo-onboarding-action={model.nextAction}` (button) | clique, Enter ou Espaço | Próximo: store.next avança um passo (só sessionStorage). Concluir (último passo): store.complete apaga a sessão, anuncia a conclusão, enfileira CONCLUIR (status concluido, completedAt) e devolve o foco ao botão Ajuda. (desabilitado: diálogo modal aberto (card inert)) | Concluir com escrita recusada: segue concluído em memória, persistência "indisponivel" e warn no QA Logger; na próxima abertura o tutorial pode reaparecer como interrompido. | `scripts/canvas-smoke-onboarding.cjs` → `sa1` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Leitor de tela e toque reais nunca foram usados no card: a árvore de acessibilidade é lida pelo CDP no SA4, não por NVDA/VoiceOver. | baixo | `3e891f95-497e-8148-b00e-f27e78767664` |
| O aviso "link não abriu" (LinkChooserHost, z 70, embaixo no centro) não é [data-felixo-tour-avoid]: em viewport compacto o card vira folha na borda de baixo e o aviso cobre o rodapé com Pular/Voltar/Próximo. Nenhum teste junta os dois. | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Aviso de novidade do tutorial (Ver, Agora não)

- **ID:** `onboarding-aviso-novidade` · **Dono:** `src/features/onboarding/OnboardingNotice.tsx`
- **Persistência:** processo principal: SQLite, tabela settings, chave onboarding.state (compare-and-set via onboarding:write): announcedAt gravado ao anunciar (ANUNCIAR), seenAt ao abrir pelo Ver
- **IPC:** `onboarding:write`
- **Depende de:** `describeNotice`, `OnboardingTourLayer (NoticeSurface)`, `onboardingStore`
- **Sobreposição:** fixed, z 55, min(18rem, 100vw − 24px), ancorado à direita do botão Ajuda pelo mesmo cálculo do card e desviando dos mesmos obstáculos. Abrir a Ajuda dispensa o aviso, então ele não disputa lugar com o menu.
- **Testes:** `src/features/onboarding/OnboardingUi.test.ts`, `src/features/onboarding/onboarding-store.test.ts`, `scripts/canvas-smoke-onboarding.cjs` → `sb5`, `scripts/canvas-smoke-onboarding.cjs` → `sb6`

| Estado | Quando |
| --- | --- |
| normal | Fase "aviso": role="region" ancorada à direita do botão Ajuda com o título da novidade, Ver e Agora não; sem foco automático e sem timer (fica até uma ação, Esc nele ou abrir a Ajuda). |
| pending | Nasce invisível até o posicionamento; com um tour já na tela a novidade espera o tour fechar. |
| disabled | Diálogo modal aberto: o aviso fica inert no mesmo lugar e os handlers saem sem efeito. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `data-felixo-onboarding-action="ver"` (button) | clique | store.viewNotice → open(tourId, "novidade"): o aviso dá lugar ao mini-tour da feature com o foco no card; ABRIR enfileirado para onboarding:write. (desabilitado: diálogo modal aberto (aviso inert)) | Escrita recusada: o mini-tour abre em memória, persistência "indisponivel" e warn no QA Logger. | `scripts/canvas-smoke-onboarding.cjs` → `sb5` |
| `data-felixo-onboarding-action="agora-nao"` (button) | clique, ou Esc com o foco no aviso | store.dismissNotice: fase volta a "ocioso" sem gravar nada (o anúncio já foi gravado ao aparecer); a novidade fica "Novo" no menu Ajuda e não volta sozinha. O foco volta a quem o tinha. (desabilitado: diálogo modal aberto (aviso inert)) | Sem falha própria (estado da sessão). | `scripts/canvas-smoke-onboarding.cjs` → `sb6` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| O aviso só existe para features do catálogo de novidades; a cadeia de contas ainda não está lá, então ninguém é avisado dela. | baixo | `3e991f95-497e-817d-b6a4-c2c1825b3afc` |

### Menu Ajuda (tutorial, novidades e Redefinir tutoriais)

- **ID:** `onboarding-menu-ajuda` · **Dono:** `src/features/onboarding/OnboardingHelpMenu.tsx`
- **Persistência:** processo principal: SQLite, tabela settings, chave onboarding.state (compare-and-set via onboarding:write); sessionStorage felixo:onboarding:sessao (tour e passo abertos, para retomar depois de um reload; apagado ao pular ou concluir); confirmação de redefinir: nenhuma (estado do componente)
- **IPC:** `onboarding:write`
- **Depende de:** `useOnboardingSnapshot`, `describeHelpMenu`, `helpMenuKeyAction`, `FelixoPopoverSurface`, `useHelpMenu (CanvasToolbar)`
- **Sobreposição:** Portal no fim do body com .felixo-popover-surface (z 1000), à direita do botão Ajuda e contido na janela (max-height = janela − 16 px). Fica acima de tudo, inclusive dos diálogos (60); Esc, Tab para fora e clique fora fecham.
- **Testes:** `src/features/onboarding/OnboardingUi.test.ts`, `src/features/onboarding/onboarding-store.test.ts`, `scripts/canvas-smoke-onboarding.cjs` → `sa1`, `scripts/canvas-smoke-onboarding.cjs` → `conferirTecladoDoMenuAjuda`, `scripts/canvas-smoke-onboarding.cjs` → `sb8`

| Estado | Quando |
| --- | --- |
| normal | Aberto pelo botão Ajuda do rail: FelixoPopoverSurface (portal) à direita do botão, role="group", com o estado do tutorial e a ação certa (Iniciar, Continuar do passo n, Recomeçar, Rever), as novidades e "Redefinir tutoriais". |
| loading | Chunk preguiçoso carregando (Suspense com fallback null) e visibility hidden até data-posicionado. |
| empty | Seção Novidades sem itens: mostra o texto ajuda.novidades.vazio. |
| error | Falha no render ou no chunk: o OnboardingErrorBoundary do CanvasToolbar (resetKey = sessão do menu) devolve null e a store desativa o tutorial na sessão. |
| pending | Confirmação de redefinir na própria tela (confirming): pergunta, Confirmar e Cancelar, com o foco em Cancelar. |
| disabled | Novidade "indisponivel" neste ambiente: item sem botão. Persistência indisponível, somente leitura ou sem ponte: nota ajuda.sem-persistencia no rodapé (as ações seguem em memória). |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `data-felixo-onboarding-action={action.id}` (button) | clique | Fecha o menu (foco no botão Ajuda) e, no quadro seguinte, store.open(tourId, "ajuda", { stepId }): o card abre no passo (Continuar do passo n reabre exatamente onde parou), sessão gravada e ABRIR enfileirado para onboarding:write. Na seção Novidades, Ver abre o mini-tour. | Tour sem nenhum passo visível (capabilities indisponíveis): showTour devolve false e nada abre, sem aviso, com o menu já fechado. Escrita recusada: abre em memória e registra warn no QA Logger. | `scripts/canvas-smoke-onboarding.cjs` → `clicarAcaoDoTutorial` |
| `data-felixo-onboarding-action="confirmar-redefinir"` (button) | clique | Fecha o menu e, no quadro seguinte, store.reset(): REDEFINIR grava resetAt preservando knownFeatures e o tour inicial abre no passo 1 com o foco no card. (desabilitado: só existe depois de "Redefinir tutoriais" (confirming)) | Escrita recusada: o tour abre do mesmo jeito em memória, persistência "indisponivel" e warn no QA Logger. | `scripts/canvas-smoke-onboarding.cjs` → `sb8` |
| `data-felixo-onboarding-action="cancelar-redefinir"` (button) | clique | confirming volta a falso: some a pergunta, volta "Redefinir tutoriais" e o foco vai para ele no quadro seguinte; nada gravado. (desabilitado: só existe durante a confirmação) | Sem falha própria (estado local). | — |
| `data-felixo-onboarding-action="redefinir"` (button) | clique | Pede confirmação na própria tela (nunca window.confirm): mostra a pergunta com Confirmar e Cancelar e leva o foco a Cancelar; nada gravado ainda. (desabilitado: some enquanto a confirmação está na tela) | Sem falha própria (estado local). | `scripts/canvas-smoke-onboarding.cjs` → `sb8` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Cancelar da confirmação de redefinir nunca é clicado: o SB8 só confere que o foco chega nele e segue para Confirmar. | baixo | `3ec91f95-497e-81f7-8b12-c5c252d020c7` |
| Falha de render do menu (CanvasToolbar.tsx:276-281): o boundary devolve null mas help.open continua verdadeiro, então o botão Ajuda fica aria-expanded="true" sem menu e o clique fora não fecha (o ouvinte era do menu); só um segundo clique na Ajuda resolve. | baixo | `3ec91f95-497e-8197-a218-ef49c302013d` |
| O SA1 (percurso manual pela Ajuda) reprova no Windows e no macOS por um laço de canvas:save, então o percurso não é conferido nesses sistemas. | médio | `3ea91f95-497e-812a-8c6d-fcc953edc59b` |

### Aviso flutuante da instalação das CLIs

- **ID:** `cli-setup-aviso` · **Dono:** `src/features/setup/CliSetupNotice.tsx`
- **Persistência:** dispensa: nenhuma (estado do hook; volta a aparecer depois de reload); processo principal: estado das tentativas de instalação (arquivo de estado do cli-auto-install em userData)
- **IPC:** `clis:get-setup-status`, `clis:setup-status`, `clis:retry-setup`, `clis:diagnose`
- **Depende de:** `useCliSetupStatus`, `useCliDiagnosis`, `presentCliSetupStatus`, `cliSetupNoticeKey`, `CliDiagnosisList`, `CliDiagnosisFooter`
- **Sobreposição:** fixed bottom-4 right-4, z 50, w-80, cresce para cima com o diagnóstico; marcado [data-felixo-tour-avoid] (o card do tour desvia). Acima da dock, painéis e gaveta (20/30) e da sidebar (26); abaixo do anel/card (54/55), diálogos (60), menu e aviso de link (70) e menu Ajuda (1000).
- **Testes:** `src/features/setup/cli-setup-presentation.test.ts`, `src/features/setup/cli-diagnosis.test.ts`, `src/features/setup/setup-tailwind-classes.test.ts`, `electron/services/cli-auto-install.test.cjs`, `src/features/onboarding/onboarding-layout.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Sem notícia ("idle", "disabled", "checking") ou sem ponte window.felixo.cliSetup: nada aparece. |
| loading | Diagnóstico rodando: botão "Diagnosticando…" desabilitado; o relatório anterior continua na tela. |
| empty | Dispensado (dismissedKey igual à chave atual): some até chegar um resultado com outra chave. |
| error | Estado "error": AlertTriangle e as ações Ver diagnóstico, Tentar de novo e Depois; fica até dispensar. |
| pending | Estado "installing": título, descrição e barra role="progressbar" com o progresso; fica até dispensar. |
| success | Estado "done": CheckCircle2 e some sozinho em 6 s (dismissedKey = noticeKey). |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Dispensar aviso da instalação das CLIs"` (button) | clique | dismiss(): guarda a chave do aviso atual e o aviso some; volta quando o status troca de assunto (resultado novo). | Sem falha própria; dispensar o andamento também esconde o andamento de uma nova tentativa (lacuna NOVA:bug-cli-aviso-andamento-dispensado). | — |
| `onClick={diagnosis.run}` (button) | clique | useCliDiagnosis.run → requestCliDiagnosis → clis:diagnose (só leitura): a lista por CLI e o rodapé com "Copiar texto para o suporte" entram acima dos botões; o rótulo vira "Diagnosticar de novo". (desabilitado: diagnóstico rodando; some sem window.felixo.cliSetup.diagnose) | Falha ou exceção da IPC vira mensagem role="alert" no rodapé do diagnóstico; resposta de um pedido descartado é ignorada. | — |
| `onClick={onRetry}` (button) | clique | Mesmo retry() do indicador: clis:retry-setup e o aviso passa a "installing" quando o status chega por clis:setup-status. (desabilitado: só no estado "error") | Erro engolido: retorno descartado (void); { ok: false } com a instalação desligada não muda a tela e exceção vira unhandledrejection só no QA Logger. | — |
| `onClick={onDismiss}` (button) | clique | Depois: mesmo dismiss() do ×, o aviso de falha some até um resultado novo. (desabilitado: só no estado "error") | Sem falha própria (estado local). | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Aviso, retry e diagnóstico nunca vistos rodando: só aparecem no app empacotado (FELIXO_AUTO_INSTALL_CLIS ou isPackaged) e nenhum teste renderiza ou clica o aviso. | médio | `3e691f95-497e-81c8-ba05-c3074dc036f0` |
| Dispensar o andamento esconde o andamento da nova tentativa: a chave de "installing"/"checking" é sempre "em-andamento" (cli-setup-presentation.ts:154) e dismissed compara só a chave (useCliSetupStatus.ts:92). Quem dispensou a primeira instalação e clica "Tentar de novo" vê o aviso sumir sem progresso. | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Erro engolido no retry (useCliSetupStatus.ts:88-90) e no getStatus inicial sem catch (useCliSetupStatus.ts:45-49): { ok: false } é descartado e a rejeição vira unhandledrejection só no QA Logger; a pessoa não sabe que a nova tentativa não começou. | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Em janelas com menos de 1024 px de largura o aviso (w-80, canto direito) e o NoticeToast (22rem, centro) se sobrepõem; os dois são z 50 e o NoticeToast, montado depois no App, cobre os botões deste. Os dois podem aparecer juntos na primeira abertura e nenhum teste junta os dois na tela. | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |
| Durante a instalação (minutos) o aviso cobre o canto inferior direito da gaveta do terminal e do Mini Map (z 50 sobre 20/30); não há medição disso. | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Diagnóstico das CLIs dentro do aviso de falha

- **ID:** `cli-diagnostico` · **Dono:** `src/features/setup/CliDiagnosisView.tsx`
- **Persistência:** nenhuma
- **IPC:** nenhum
- **Depende de:** `useCliDiagnosis (CliSetupNotice)`, `describeCliDiagnosis`
- **Sobreposição:** Dentro do aviso das CLIs (z 50), acima dos botões: o aviso cresce para cima a partir do canto inferior direito.
- **Testes:** `src/features/setup/CliDiagnosisView.test.ts`, `src/features/setup/cli-diagnosis.test.ts`

| Estado | Quando |
| --- | --- |
| normal | Não aparece enquanto o diagnóstico não foi pedido no aviso de falha das CLIs. |
| loading | "Diagnosticando as CLIs…" (role="status") até o primeiro relatório. |
| error | Mensagem do erro em role="alert". |
| success | Lista por CLI com a causa e a próxima ação, e o botão de copiar o texto de suporte. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Copiar texto para o suporte` (button) | clique | navigator.clipboard.writeText(supportText) (texto já minimizado pelo main, sem usuário, URL ou segredo); o rótulo vira "Texto copiado" por alguns segundos e a região status anuncia. (desabilitado: só existe com supportText no relatório) | Área de transferência recusada: o rótulo vira "Não foi possível copiar" (falha visível, não engolida). | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| O teste só renderiza o markup; ninguém clicou em copiar no aviso das CLIs do app real. O mesmo componente também aparece no ModelManagerModal do chat legado. | baixo | `3e291f95-497e-8109-8851-e4ff2193c4db` |

### Menu "para onde abrir este link"

- **ID:** `link-menu-destino` · **Dono:** `src/features/shared/links/LinkChooserHost.tsx`
- **Persistência:** nenhuma (pedido em memória no link-chooser-store); "Abrir como Página Web" cria um bloco que vai para o canvas salvo
- **IPC:** `external-links:open-failed`
- **Depende de:** `link-chooser-store (subscribeLinkChooser, closeLinkChooser, getWebpageOpener)`, `describeLinkDestination`, `linkChoiceEntries`, `runLinkChoice`, `placeLinkChooser`, `linkChooserKeyAction`
- **Sobreposição:** Portal no body, fixed, z 70, w-72, max-height da janela − 16 px: acima dos diálogos (60), do card do tour (55) e dos toasts (50), abaixo do menu Ajuda e FelixoSelect (1000). Camada flutuante (data-felixo-floating-layer): clicar nele não fecha a gaveta do terminal de onde o link veio.
- **Testes:** `src/features/shared/links/link-destination.test.ts`, `src/features/shared/links/link-chooser-menu.test.ts`, `src/features/shared/links/link-chooser-store.test.ts`, `src/features/shared/links/link-anchor.test.ts`, `electron/services/external-links.test.cjs`, `scripts/canvas-smoke-links.cjs` → `markdownComMouse`, `scripts/canvas-smoke-links.cjs` → `markdownRecusadoEEmail`, `scripts/canvas-smoke-links.cjs` → `terminalTexto`, `scripts/canvas-smoke-links.cjs` → `paginaWebMenuDeLink`

| Estado | Quando |
| --- | --- |
| normal | Pedido no link-chooser-store (terminal, Markdown ou Página Web): menu no ponto do link com o resumo do destino ("Leva a"/"E-mail para", URL cortada em 600 caracteres) e os itens Abrir no navegador, Abrir como Página Web e Copiar link; foco no primeiro item. |
| pending | Medido fora da tela (visibility hidden) até placeLinkChooser devolver a posição. |
| success | Cópia feita: "Link copiado" flutuante por 1,4 s (z 70) e anúncio na região status. |
| disabled | Sem canvas montado (tela do chat): getWebpageOpener é null e "Abrir como Página Web" não aparece. |
| denied | Link recusado pela política: "Link recusado" com o motivo e só "Copiar link". |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={() => choose(entry.choice)}` (button) | clique | runLinkChoice reclassifica e executa: Abrir no navegador → window.open(url, "_blank") e o main aplica a política e entrega ao sistema; Abrir como Página Web → cria o bloco perto do bloco de origem, a câmera voa e o foco vai ao bloco; Copiar → clipboard + "Link copiado". O menu fecha e o foco volta a quem abriu. | Abertura recusada ou sem navegador: o main emite external-links:open-failed e aparece o aviso "link não abriu". Erro engolido na cópia: clipboard recusado cai em () => undefined, o menu já fechou e nada avisa. | `scripts/canvas-smoke-links.cjs` → `markdownEscolhas` |
| `role="menuitem"` (role) | teclado: setas, Home e End movem o foco; Enter ou Espaço ativam o item; Esc ou Tab fecham | linkChooserKeyAction: o foco anda entre os itens (tabIndex itinerante) na hora da tecla; Esc/Tab fecham sem escolha e devolvem o foco; nenhuma tecla chega aos atalhos do canvas (stopPropagation). | Sem falha própria; Enter/Espaço repetidos de uma tecla segurada são ignorados. O menu também fecha com roda, resize, clique fora, blur da janela ou foco que sai para outro elemento. | `scripts/canvas-smoke-links.cjs` → `markdownComTeclado` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Erro engolido na cópia (LinkChooserHost.tsx:326-329 no menu e :164-170 no aviso de falha): clipboard recusado cai em () => undefined, sem aviso nem log; no menu ele já fechou, no aviso nada muda. | médio | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| Links enviados pelos agentes ainda não abrem no app real e a causa não foi achada. | alto | `3db91f95-497e-81a7-9554-c9cffa821c63` |
| A abertura no navegador do sistema só roda no smoke com o shell falso (FELIXO_DEVTOOLS_SHELL_OPEN=falha); no app instalado do Windows e do macOS não foi conferida. | médio | `3ea91f95-497e-8117-8506-d4abe67709ff` |
| Menu nunca usado com leitor de tela e tela sensível ao toque reais (o smoke simula toque e lê a árvore pelo CDP). | baixo | `3ea91f95-497e-812b-a108-fb89c94fa528` |
| O foco no bloco Página Web que nasce fora da tela (focusCanvasNodeAfterCamera) não é conferido no smoke. | baixo | `3ea91f95-497e-81c4-84ff-f279d9ba4683` |

### Aviso "o link não abriu"

- **ID:** `link-aviso-falha` · **Dono:** `src/features/shared/links/LinkChooserHost.tsx`
- **Persistência:** nenhuma
- **IPC:** `external-links:open-failed`
- **Depende de:** `parseLinkOpenFailure`, `describeLinkOpenFailure`, `revealHiddenUrlCharacters`
- **Sobreposição:** Portal no body, fixed bottom-6 left-1/2, z 70, min(22rem, 100vw − 2rem). data-felixo-floating-layer e data-felixo-focus-transient: clicar nele não é "clicar fora" da gaveta e o foco nele não substitui o anterior.
- **Testes:** `src/features/shared/links/link-open-failure.test.ts`, `electron/services/external-links.test.cjs`, `scripts/canvas-smoke-links.cjs` → `markdownEscolhas`

| Estado | Quando |
| --- | --- |
| normal | Oculto até o main emitir external-links:open-failed. |
| error | Política recusou ou o sistema não entregou a um navegador: role="alert" embaixo no centro com título, detalhe e o endereço (invisíveis à mostra), sem roubar o foco e sem timer; um aviso novo substitui o anterior (key nova). |
| success | Copiado: "Link copiado" aparece acima e o aviso fecha devolvendo o foco. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `aria-label="Fechar aviso"` (button) | clique, ou Esc com o foco no aviso | setFailure(null): o aviso some e, se o foco estava nele ou no body, volta a quem o tinha quando o aviso apareceu. | Sem falha própria (estado local). | `scripts/canvas-smoke-links.cjs` → `markdownEscolhas` |
| `onClick={copy}` (button) | clique | clipboard.writeText(notice.copyText): "Link copiado" acima do aviso, o aviso fecha e o foco volta a quem o tinha. | Erro engolido: clipboard recusado cai em () => undefined e o aviso continua aberto sem dizer que a cópia falhou (lacuna no menu de links). | `scripts/canvas-smoke-links.cjs` → `markdownEscolhas` |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Fixed bottom-6 no centro, z 70, sem [data-felixo-tour-avoid]: cobre o NoticeToast (z 50, também embaixo no centro) e os botões dele, e o card do tour não desvia dele. Nenhum teste põe o aviso junto com o NoticeToast ou com o card. | médio | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Avisos de hardware (volta da placa de vídeo e sugestão do Modo Performance)

- **ID:** `hardware-avisos` · **Dono:** `src/features/shared/hardware/HardwareNotices.tsx`
- **Persistência:** localStorage felixo-ai-core.performance-suggestion (resposta à sugestão); localStorage felixo-ai-core.performance-mode (Modo Performance ligado); processo principal: userData/gpu-preference.json (fallback reconhecido)
- **IPC:** `hardware:get-profile`, `graphics:get-config`, `graphics:gpu-preference-changed`, `graphics:acknowledge-gpu-fallback`
- **Depende de:** `useGpuStatus (gpu-status-store)`, `usePerformanceMode (PerformanceModeContext)`, `shouldSuggestPerformanceMode`, `loadSuggestionAnswered`, `saveSuggestionAnswered`, `NoticeToast`
- **Sobreposição:** Wrapper fixed inset-x-0 bottom-4 z 50 com pointer-events none; a caixa (w-[22rem], pointer-events auto) é [data-felixo-tour-avoid] e o card desvia dela (SB1 confere que os botões continuam clicáveis). Montado no App: vale no canvas e no chat.
- **Testes:** `src/features/shared/performance/performance-suggestion.test.ts`, `src/features/shared/graphics/gpu-status-store.test.ts`, `electron/core/hardware-profile.test.cjs`, `electron/core/gpu-preference.test.cjs`, `scripts/canvas-smoke-onboarding.cjs` → `sb1`

| Estado | Quando |
| --- | --- |
| normal | Sem volta automática da placa de vídeo e sem sugestão pendente: nenhum aviso. |
| error | gpu.fallback no gpu-status-store (o main voltou a GPU para Automático): "Placa de vídeo voltou para Automático" só com Entendi e ×; tem prioridade, um aviso de cada vez. |
| pending | Perfil com poucas CPUs (shouldSuggestPerformanceMode), Modo Performance desligado e sem resposta salva: "Ligar o Modo Performance?" com Ligar, Agora não e ×. |
| success | Modo Performance ligado: <html data-performance-mode="on"> e o aviso some. |
| disabled | Instância de automação sem FELIXO_DEVTOOLS_HARDWARE_NOTICES=1 (o main não sugere), sem ponte, ou perfil ainda não lido: nada aparece. |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `onClick={onPrimary}` (button) | clique | Ligar Modo Performance: saveSuggestionAnswered (localStorage felixo-ai-core.performance-suggestion = answered) e setPerformanceMode(true); o PerformanceModeProvider grava felixo-ai-core.performance-mode = on e põe data-performance-mode="on" no <html>; o aviso some. (desabilitado: só existe na sugestão do Modo Performance (o aviso da GPU não tem ação principal)) | Sem localStorage a resposta e o modo valem só nesta sessão (catch silencioso intencional). | — |
| `{secondaryLabel}` (button) | clique | Placa de vídeo, "Entendi": acknowledgeGpuFallback → graphics:acknowledge-gpu-fallback zera o fallback em userData/gpu-preference.json e o aviso some de todas as telas (Configurações inclusive). Sugestão, "Agora não": só grava a resposta; o modo continua desligado. | Erro engolido na placa de vídeo: se a IPC falhar, o finally some com o aviso mesmo assim, a rejeição de void acknowledgeGpuFallback() vira unhandledrejection só no QA Logger, o fallback continua gravado e o aviso volta na próxima abertura. | `scripts/canvas-smoke-onboarding.cjs` → `sb2` |
| `aria-label={dismissLabel}` (button) | clique | × com rótulo próprio ("Dispensar aviso da placa de vídeo" ou "Dispensar sugestão do Modo Performance"): mesmo onSecondary do botão secundário. | A mesma do botão secundário (na placa de vídeo, rejeição solta e aviso que volta). | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| O SB1/SB2 só mostram e clicam o aviso quando a máquina do CI recebe a sugestão (poucas CPUs); "Ligar Modo Performance" e o × nunca são clicados em teste. | médio | `3ec91f95-497e-81f7-8b12-c5c252d020c7` |
| O aviso da placa de vídeo nunca foi visto rodando: depende de uma volta automática de GPU real. | médio | `3d591f95-497e-8192-b911-cdb759933401` |
| HardwareNotices.tsx:124 chama void acknowledgeGpuFallback(), que rejeita quando a IPC falha (o teste do gpu-status-store confirma): unhandledrejection no QA Logger e o aviso volta na próxima abertura sem a pessoa saber por quê. | baixo | `3ec91f95-497e-8110-b363-cfade2b68b7a` |
| A caixa (22rem, embaixo no centro, z 50) cobre a barra de status (18) e a dock (20) no centro de baixo; só a convivência com o card do tour é medida (SB1). | baixo | `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` |

### Tela "A interface não conseguiu carregar"

- **ID:** `tela-recuperacao-renderer` · **Dono:** `src/RendererRecoveryBoundary.tsx`
- **Persistência:** nenhuma (o reload relê o canvas salvo pelo processo principal)
- **IPC:** `qa-logger:log`
- **Depende de:** `React error boundary (getDerivedStateFromError, componentDidCatch)`
- **Sobreposição:** Substitui a árvore inteira (h-screen w-screen, bg zinc-950): não há sobreposição; os avisos de hardware e de links somem junto com o App.
- **Testes:** `scripts/canvas-smoke-onboarding.cjs` → `sa10`

| Estado | Quando |
| --- | --- |
| normal | Sem erro: renderiza o App (canvas, avisos de hardware e menu de links) normalmente. |
| error | Exceção de render não tratada abaixo de main.tsx: tela cheia no lugar do canvas com "Recarregar interface"; a falha vai ao QA Logger (escopo renderer:recovery-boundary). |

| Controle | Gatilho | Efeito | Falha conhecida | Teste |
| --- | --- | --- | --- | --- |
| `Recarregar interface` (button) | clique | window.location.reload(): recarrega só o renderer; processo principal, PTYs e perfil continuam vivos e o canvas é relido do que o main salvou. | Se o erro se repetir no render, a mesma tela volta; não há limite de tentativas nem outro caminho na tela. | — |

| Lacuna | Risco | Task |
| --- | --- | --- |
| Nenhum teste força a tela de recuperação nem clica "Recarregar interface"; o SA10 só confere que a falha do tutorial NÃO a mostra. | médio | `3ec91f95-497e-81f7-8b12-c5c252d020c7` |

## Tasks das lacunas

- `3ce91f95-497e-81c9-8c3b-def9ed09d58c` — 1 lacuna
- `3d591f95-497e-810c-9f26-ff8a3e6e53ce` — 1 lacuna
- `3d591f95-497e-8192-b911-cdb759933401` — 1 lacuna
- `3d691f95-497e-8105-b007-f7767fe10405` — 1 lacuna
- `3d791f95-497e-8139-8417-f90dd73f2777` — 1 lacuna
- `3d791f95-497e-8190-84e0-df5328591a14` — 2 lacunas
- `3d791f95-497e-81bf-a6c7-efef573d87ae` — 2 lacunas
- `3d791f95-497e-81cd-b05c-c9d6370c81a3` — 2 lacunas
- `3db91f95-497e-81a7-9554-c9cffa821c63` — 1 lacuna
- `3e191f95-497e-81fd-b657-d7a63b5d17f0` — 3 lacunas
- `3e291f95-497e-8109-8851-e4ff2193c4db` — 2 lacunas
- `3e291f95-497e-815a-9863-d4b9f8f15e8f` — 1 lacuna
- `3e391f95-497e-8144-be4c-cd800cf6fd52` — 1 lacuna
- `3e691f95-497e-810e-a39b-f26d90a38c8e` — 3 lacunas
- `3e691f95-497e-8116-8cbd-fad2823ce1da` — 1 lacuna
- `3e691f95-497e-815c-a129-f4d2d6405cbc` — 2 lacunas
- `3e691f95-497e-816a-a1c9-c0b3b37c8046` — 2 lacunas
- `3e691f95-497e-81c8-ba05-c3074dc036f0` — 2 lacunas
- `3e791f95-497e-81bd-8e8c-de6f9e16cec5` — 2 lacunas
- `3e891f95-497e-8148-b00e-f27e78767664` — 2 lacunas
- `3e891f95-497e-815b-b675-d1d696a7968e` — 1 lacuna
- `3e891f95-497e-819b-a75f-e5cec04e3173` — 1 lacuna
- `3e891f95-497e-81b3-8857-da9125ff3f49` — 2 lacunas
- `3e991f95-497e-8104-a090-d5b295ba4747` — 2 lacunas
- `3e991f95-497e-8109-832d-f789917f708d` — 1 lacuna
- `3e991f95-497e-810b-9f94-ed5201606718` — 1 lacuna
- `3e991f95-497e-811d-93e4-c6f283e26dde` — 1 lacuna
- `3e991f95-497e-811e-a0a3-c9c0dd6d0c48` — 1 lacuna
- `3e991f95-497e-812b-8456-e0073877e9d7` — 1 lacuna
- `3e991f95-497e-812d-b877-e7bb0162a60f` — 1 lacuna
- `3e991f95-497e-814a-ba35-d65bacdde06f` — 2 lacunas
- `3e991f95-497e-815c-845c-da8829970c0c` — 1 lacuna
- `3e991f95-497e-8172-b092-f3aa9f111ccc` — 2 lacunas
- `3e991f95-497e-817d-b6a4-c2c1825b3afc` — 1 lacuna
- `3e991f95-497e-81b4-ac92-d7db960c9ae0` — 1 lacuna
- `3e991f95-497e-81c5-ad8f-f058eb3b93b7` — 2 lacunas
- `3e991f95-497e-81c9-a900-f0d5585956f9` — 1 lacuna
- `3e991f95-497e-81ce-9286-cbe3532f3044` — 1 lacuna
- `3e991f95-497e-81d4-af04-fc0a218a66dc` — 1 lacuna
- `3e991f95-497e-81e0-8c54-f507189f8729` — 2 lacunas
- `3ea91f95-497e-8117-8506-d4abe67709ff` — 1 lacuna
- `3ea91f95-497e-8126-88c8-c6a7ce21bee0` — 1 lacuna
- `3ea91f95-497e-8129-acde-f3b1049c09ed` — 1 lacuna
- `3ea91f95-497e-812a-8c6d-fcc953edc59b` — 2 lacunas
- `3ea91f95-497e-812a-bc4b-ccfe144bd56c` — 1 lacuna
- `3ea91f95-497e-812b-a108-fb89c94fa528` — 1 lacuna
- `3ea91f95-497e-8146-ad00-e32071c3366b` — 1 lacuna
- `3ea91f95-497e-8155-a6bc-ea704c00ef65` — 1 lacuna
- `3ea91f95-497e-818f-a7ed-cb6a84c376d6` — 1 lacuna
- `3ea91f95-497e-819a-bdd9-fbc178f27b3e` — 1 lacuna
- `3ea91f95-497e-81c4-84ff-f279d9ba4683` — 2 lacunas
- `3ea91f95-497e-81d9-a3d8-ed3971b18a24` — 3 lacunas
- `3eb91f95-497e-811b-8eb0-e620c6f37e21` — 5 lacunas
- `3eb91f95-497e-8126-8750-d9834c65f306` — 3 lacunas
- `3eb91f95-497e-8131-9977-f8d21c950c68` — 1 lacuna
- `3eb91f95-497e-813b-9b1e-e0710ab60372` — 1 lacuna
- `3eb91f95-497e-814a-8b2c-e471e09f6ff3` — 5 lacunas
- `3eb91f95-497e-8175-ac71-d0cf6e878ecd` — 1 lacuna
- `3eb91f95-497e-8178-bc58-cd545a4f4cc8` — 2 lacunas
- `3eb91f95-497e-817d-baf1-fbf8f400f399` — 1 lacuna
- `3eb91f95-497e-81b8-a70f-dfce2a446a3e` — 2 lacunas
- `3eb91f95-497e-81bb-a374-eb2e336c73c6` — 1 lacuna
- `3eb91f95-497e-81fb-9909-fcd86abe2e3f` — 1 lacuna
- `3ec91f95-497e-8103-b360-c1979d6992f4` — 9 lacunas
- `3ec91f95-497e-8110-b363-cfade2b68b7a` — 43 lacunas
- `3ec91f95-497e-8112-82f9-fd1b86e3ec7d` — 19 lacunas
- `3ec91f95-497e-8113-afb0-eecb92e4eb23` — 1 lacuna
- `3ec91f95-497e-8122-a08b-d26d4991acca` — 1 lacuna
- `3ec91f95-497e-8141-b6c1-d1833aac5664` — 12 lacunas
- `3ec91f95-497e-8143-a0b4-cceb0ace7599` — 6 lacunas
- `3ec91f95-497e-8176-bef0-dfde828936dc` — 6 lacunas
- `3ec91f95-497e-818f-b9f2-f9710605c303` — 14 lacunas
- `3ec91f95-497e-8197-a218-ef49c302013d` — 8 lacunas
- `3ec91f95-497e-81a3-9be3-c0d354bf7621` — 13 lacunas
- `3ec91f95-497e-81ca-8319-ee657b0b6492` — 28 lacunas
- `3ec91f95-497e-81e8-8f18-e2a529b0568e` — 10 lacunas
- `3ec91f95-497e-81f7-8b12-c5c252d020c7` — 5 lacunas

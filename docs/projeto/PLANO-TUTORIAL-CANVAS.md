Status: concluido.

# Plano: tutorial do canvas, Ajuda e novidades com estado versionado

## Contexto e tasks

### Base conferida

O plano parte do HEAD `f42eb661` (#95, placa de vídeo e sugestão de Modo Performance), um commit depois do `d0496cd6` que as propostas usaram como base. Os pontos de que o desenho depende foram conferidos de novo nesse HEAD:

- **Hardware.** `app/src/App.tsx` monta `<HardwareNotices />` no app shell, depois do `Suspense`. O `NoticeToast` (`app/src/features/shared/hardware/HardwareNotices.tsx:41-46`) é `fixed inset-x-0 bottom-4 z-50`, centralizado, e a caixa interna tem `role="status" aria-live="polite"` com largura `w-[22rem]`. Numa máquina com 4 CPUs lógicas ou menos (o notebook de referência) ele aparece no primeiro boot.
- **`app/electron/main.cjs`:**
  - `devtoolsPort` é calculado na linha 163;
  - `createStorageDatabase` fica na linha ~326;
  - `hardware:get-profile` decide a automação no main com o opt-in `FELIXO_DEVTOOLS_HARDWARE_NOTICES=1` (linhas 429-436);
  - `registerOrchestratorSettingsIpcHandlers` está na linha 648 e `app:get-version`/`resolveRuntimeAppVersion` nas linhas 656 e 280;
  - o vm do `devtools:main-eval` só recebe `{ app, BrowserWindow, mainWindow }` (linhas 523-527).
- **`app/electron/preload.cjs`.** O bloco `devtools` só existe com `FELIXO_DEVTOOLS_PORT` e traz `mockPty` (linhas 70-82).
- **SQLite.**
  - `BEGIN IMMEDIATE` já é usado em `sqlite-database.cjs:64`, `canvas-repository.cjs:97/117` e `chat-history-repository.cjs:31`.
  - `busy_timeout = 5000` está em `sqlite-database.cjs:85`.
  - O `settings-repository.cjs` só tem get, set (last-writer-wins), delete e listKeys, e o `parseSettingsValue` lança exceção com JSON inválido.
- **Gravação no mount.** O `ThemeProvider` grava `felixo-ai-core.theme` no primeiro efeito, e o `PerformanceModeProvider` grava `felixo-ai-core.performance-mode` também no mount. Por isso os sinais de uso anterior precisam ser lidos em `main.tsx`, antes do `createRoot`.
- **`CanvasView.tsx`:**
  - a região `[data-felixo-region="canvas"]` (linhas 2498-2505) é `relative`, sem z-index nem transform;
  - `<CanvasToolbar/>` está na linha 2533, `<CliSetupToast />` na 2842 e `data-felixo-hydrated` na 2496;
  - `hydrated && edgesHydrated` já existe (linha 2793).
- **`CanvasToolbar.tsx`:**
  - o aside `data-felixo-region="sidebar"` está na linha 178;
  - o grupo superior do rail tem menu, Chat, Buscar, Projetos e Notificações (linhas 202-239), e o grupo `mt-auto` tem Configurações e o toggle da sidebar;
  - o painel lateral é `inert={sidebarCollapsed}` (linha 256);
  - as seções Criar, Organizar e Ferramentas estão nas linhas 280, 323 e 349, com Ferramentas `defaultOpen={false}`.
- **`TerminalMenu.tsx:171`.** A moldura `.felixo-sidebar-agent-trigger` envolve as duas metades, e a metade "Agente" lança a CLI.
- **`TerminalsPanel.tsx`.** O puck (`aria-label="Abrir elementos"`, linhas 448-460) e o inspector (`.felixo-elements-inspector`, cabeçalho "Elementos" na linha 488) ficam os dois no DOM e alternam por classe.
- **Diálogos modais.** `HandoffDialog.tsx:132` e `AgentQuestionDialog.tsx:78` têm `aria-modal="true"`. O `AgentQuestionDialog` escuta teclado em `window` (linha 68).
- **`scripts/canvas-smoke.cjs`:**
  - `withDevtoolsSession` está na linha 208 e liga `FELIXO_DEVTOOLS_MOCK_PTY`;
  - `main()` está na linha 1023;
  - o gatilho de handoff `[data-canvas-handoff-trigger]` já é usado na linha 934, e o override en-US está na linha 1012.
- **Precedente de pular cenário por CPU.** `scripts/hardware-check.cjs:745-748` pula o cenário quando a máquina tem mais de 4 CPUs lógicas.
- **Testes node.** `npm test` (`scripts/run-node-unit-tests.cjs`) descobre `*.test.cjs` em `electron/` e `scripts/`.
- **Registro.** As entradas datadas recentes (26/09) estão em `docs/projeto/IA.md`.

### Tasks (implementadas juntas, em um PR)

1. **State machine versionada.**
   - Schema com versão do produto e do tour, estado, dismiss, datas e contexto.
   - Gatilhos de primeiro boot, canvas e capability nova.
   - "Visto" separado de "disponível", e reabertura depois pela Ajuda.
   - Cobertura de múltiplas janelas, reset, reinstall e storage inválido, sem reintroduzir o tutorial do chat.
   - Aceites:
     - **T1.a** update sem feature não reabre;
     - **T1.b** feature nova dispara uma vez;
     - **T1.c** storage corrompido usa fallback;
     - **T1.d** o tutorial não bloqueia agente;
     - **T1.e** versão e relógio injetáveis nos testes.
   - Catálogo versionado, sem comparação frágil de arquivo.
2. **Tutorial inicial não bloqueante no canvas.**
   - Roteiro curto: projeto, agente, contexto, terminal e ferramentas.
   - Spotlight/popover com foco, Esc e adaptação ao viewport; pular, voltar, concluir e reabrir em Ajuda.
   - Não cria agente nem envia prompt; i18n e reduced motion preparados.
   - Aceites:
     - **T2.a** o primeiro uso termina sem ação destrutiva;
     - **T2.b** nenhum processo, rede ou crédito é iniciado;
     - **T2.c** cada passo aponta para um elemento visível;
     - **T2.d** o chat não aparece como caminho principal;
     - **T2.e** canvas vazio e reload cobertos;
     - **T2.f** não bloqueia esperando backend;
     - **T2.g** degrada se uma feature opcional faltar.
3. **Validação.**
   - Tab, foco, aria-live, Escape, leitor de tela e foco depois do resize.
   - Texto longo, idiomas, fonte maior, viewport pequeno e reduced motion.
   - Update sem feature e com feature, downgrade, reset e storage inválido; sem tour duplicado em várias janelas; snapshots sem coordenadas frágeis.
   - Aceites:
     - **T3.a** todos os passos têm saída acessível;
     - **T3.b** nenhuma tradução corta instrução;
     - **T3.c** a migração preserva o concluído e abre só o tour novo;
     - **T3.d** restart não duplica o tour.

### Origem deste plano

Este plano sintetiza três propostas e dois julgamentos.

- **Base:** a proposta "mínimo-robusto" (notas 8,2 e 7,5). Tem a menor área tocada, uma só autoridade de persistência e nada em `App.tsx` ou `features/chat`.
- **Enxertos da proposta "testabilidade":**
  - política de automação decidida no main e devolvida em `onboarding:read`, no molde do `hardware:get-profile`;
  - CAS testado com dois processos node reais;
  - invariantes da store testadas com sequências aleatórias;
  - gatilho "canvas" de verdade, testado com catálogo de fixture;
  - falha de render forçada só na instância devtools;
  - verificação dos rótulos reais.
- **Enxertos da proposta "a11y-ux":**
  - host do tour na árvore, logo depois da sidebar, para a ordem de Tab ser natural;
  - lista `canStealFocus`;
  - marcador de primeiro boot;
  - sondas de rede e de diff do localStorage;
  - checagem de que o texto de cada passo contém o rótulo do alvo;
  - alto contraste, forced-colors e contraste medido;
  - livro de versões do catálogo.
- **Correções aplicadas sobre a base:**
  - convivência com o `NoticeToast` dos HardwareNotices;
  - sinal de uso anterior robusto a um primeiro boot interrompido;
  - cenários de update do smoke movidos para a sessão com o tour ligado (na base eles rodavam com a abertura automática suprimida e não podiam passar);
  - smoke enxugado: saiu a segunda BrowserWindow e a bancada de UI com o tour virou medição manual.

## Decisões de produto

### a) Quem já usa o app não recebe o tutorial automático

**Decisão.** Não há estado de tour, mas há sinais de uso anterior: chaves `felixo*` no localStorage antes do primeiro render, sem o marcador de primeiro boot, ou canvas com blocos depois da hidratação. Nesse caso o tutorial fica "disponível" na Ajuda e nada abre sozinho.

**Motivo.** Interromper quem já trabalha no canvas a cada update contraria "update sem feature não reabre" e o espírito não bloqueante. O tutorial ensina o básico, que essa pessoa já conhece.

**Descartado:**
- mostrar o tutorial a todos no primeiro boot depois do update (intrusivo);
- usar só "canvas vazio" como sinal (Limpar, import e falha de carga também esvaziam o canvas: falso primeiro uso).

**Consequência derivada** (combinação de a com c, reversível por uma flag do catálogo): a própria Ajuda é uma capability nova para essa pessoa. A entrada `feature.ajuda` tem `anunciarParaQuemJaUsa: true`, então quem já usa recebe uma vez o aviso discreto de novidade ("Novidade: Ajuda"), que não rouba foco. Ele abre um mini-tour de um passo, só se a pessoa clicar em "Ver".
- Descartado: silêncio total. Ninguém descobriria onde reabrir o tutorial.

### b) Primeiro uso de verdade: abre sozinho depois da hidratação, sem bloquear

**Decisão.** Com estado ausente, sem sinais de uso anterior e canvas hidratado (`hydrated && edgesHydrated`) vazio, o tutorial abre sozinho uma vez. É pulável, não modal, sem escurecer a tela e sem focus trap.

**Motivo.** A descoberta precisa acontecer sem a pessoa procurar. A hidratação garante que os alvos existem e que o sinal "canvas com blocos" já pode ser lido.

**Descartado:**
- overlay bloqueante de boas-vindas (receita do GUIA-ONBOARDING-E-AJUDA: bloqueia o canvas, usa `animate-ping` e `hasSeen` booleano);
- abrir só por clique (ninguém acha).

### c) Feature nova: aviso discreto que abre um mini-tour, uma vez, sem roubar foco

**Decisão.**
- O catálogo e a state machine ficam prontos e testados.
- O disparo é um aviso pequeno (`role="region"`, sem foco automático e sem timer) ancorado na Ajuda, com "Ver" e "Agora não".
- "Ver" abre o mini-tour e move o foco, porque é ação da pessoa.
- O aviso nunca tira o foco de terminal, input ou webview, então Enter e Espaço continuam indo para o PTY.

**Motivo.** Um tour que abre sozinho enquanto a pessoa digita num agente desvia teclas: Enter aciona "Próximo" e o texto não chega à CLI.

**Descartado:**
- abrir o mini-tour sozinho (rouba teclado);
- só um badge silencioso (não cumpre "dispara uma vez").

### d) i18n próprio, sem biblioteca

**Decisão.**
- Catálogo de textos em `onboarding-messages.ts`, com `pt-BR` completo (`satisfies Record<MessageKey, Message>`) e estrutura para outros locales parciais, com fallback para pt-BR.
- O locale sai de `document.documentElement.lang`, hoje fixo em pt-BR.
- O contêiner do card, do aviso, do menu Ajuda e da região live leva `lang` igual ao catálogo efetivamente usado.
- Um pseudo-locale `en-XA`, gerado do pt-BR com cerca de 40% de expansão, serve de teste.

**Motivo.** O app inteiro está em pt-BR e o GUIA_MINIMO pede simplicidade verificável.

**Descartado:**
- i18next ou react-intl (peso no bundle, sem necessidade);
- `navigator.language` (o override en-US do smoke trocaria o idioma do tour com o app em português).

### e) Roteiro de 5 passos mais "onde reabrir", sem ação nos alvos

**Decisão.**
- Os passos são projeto, agente, contexto, terminal e ferramentas, mais um passo final que aponta a Ajuda.
- Cada passo só destaca (anel e card). O tour nunca clica, foca, expande, abre flyout ou painel, cria nó ou grava preferência.
- Nenhum passo foca ou aciona a metade "Agente" que lança a CLI.

**Motivo.** Um tutorial interativo que cria agente inicia processo, rede e autenticação, e gasta crédito.

**Descartado:**
- passos interativos ("clique em Agente");
- um roteiro longo com Organizar, Página Web, Gerar imagem ou Tarefas Notion (rede e crédito).

### Decisões técnicas registradas (alternativas descartadas)

| Decisão | Motivo | Descartado |
|---|---|---|
| Sem focus trap, `aria-modal="false"` | O tour não é modal; prender o foco bloquearia o canvas | Seguir o "modais prendem foco" do System Design (a divergência fica registrada) |
| Host na árvore, logo depois do `<CanvasToolbar/>` | A ordem de Tab fica sidebar → tour → canvas, e Shift+Tab volta à sidebar | Portal no fim do body (o Tab sai para o fim do documento) |
| Autoridade única no SQLite com compare-and-set | É compartilhado entre processos, e o main o enxerga | Espelho em localStorage com reconciliação (regra de mesclagem é fonte de bug) |
| Política de automação no main | Segue o precedente `hardware:get-profile` + `FELIXO_DEVTOOLS_HARDWARE_NOTICES` | Flag nova no preload |
| Marcador de primeiro boot no renderer | Cobre o primeiro boot interrompido sem mexer na ordem de boot do main | Marcador `onboarding.bootstrap` no main antes do `createStorageDatabase` (mais superfície; os sinais da decisão a são do renderer) |
| Ajuda como botão no grupo superior do rail, abrindo um menu | Menor área; visível na altura mínima (6 botões ≈ 271 px dentro de ≈ 289 px) | Menu nativo "Ajuda", `CanvasTool 'help'` com CanvasPanel, três entradas |
| Sem `requestSingleInstanceLock` | Mudaria a abertura de `.fxai/.fxchat/.fxworkflow` com o app aberto (exige repassar o argv em `second-instance`) | Lock de instância única neste PR |
| Sem popover nativo, top layer ou CSS anchor positioning | O top layer ficaria acima do `AgentQuestionDialog` (z 60), e não é testável em node | Atributo `popover` do Chromium 146 |
| Sem escurecer a tela, sem blur, sem pulso, sem animação | Custo de composição no HD 520; BRAND-SYSTEM proíbe pulso permanente | Spotlight com `box-shadow` gigante ou `backdrop-filter` |
| Nunca `scrollIntoView` | Arrasta o aside e o shell com `overflow hidden` | Usar `scrollIntoView` para trazer o alvo |
| `useModalPresence` fora; detecção por `[aria-modal="true"]` | Não mexe no AgentQuestionDialog nem no HandoffDialog | Hook contador registrado em cada diálogo |
| Sem refatoração de `motion-policy`/`useExitAnimation` e sem extrair `canvas-smoke-session` | Não misturar refatoração com feature (GUIA_MINIMO) | Enxertar essas refatorações |

## Arquitetura

Os caminhos são relativos a `app/`.

### Fronteiras e orçamento de bundle

- **Chunk de entrada:** só `src/features/onboarding/onboarding-boot-signals.ts` (menos de 0,5 KiB, sem React).
- **Chunk do canvas (eager):** só o procurador da store (`onboarding-store-proxy.ts`, com os hooks), `onboarding-canvas-triggers.ts`, `onboarding-help-label.ts`, `OnboardingMount` e `OnboardingErrorBoundary` (4,7 kB crus). Estimativa de 3–4 KiB gzip, conferida com `npm run benchmark:bundle:check`.
- **Chunk lazy da store:** estado puro (decisão automática, Ajuda, eventos), store (a autoridade) e catálogo (só chaves de mensagem; o Rolldown o separa num chunk de 2,5 kB porque a interface também o usa). Começa a baixar quando o canvas monta; a leitura do estado começa no `canvasReady`, como antes, e a store recebe essa mesma leitura.
- **Chunk lazy da interface (um só):** mensagens, layout, camada do tour, card, anel, aviso e menu Ajuda. Só é importado com tour ou aviso ativo ou com o menu Ajuda aberto, e sempre depois de a store estar ligada (`loadOnboardingUi`).
- **Medido (26/09/2026, `npm run build`, kB do Vite):** chunk `CanvasView` na `main` 295,89 kB crus e 88,82 kB gzip; com o tutorial todo eager, 324,46 e 98,92 (+10,1 kB gzip); com a divisão acima, 302,64 e 91,44 (+2,62 kB gzip, dentro da estimativa). Store 21,93/7,49, catálogo 2,51/0,69 e interface 32,01/10,58. Detalhes e a medição da decisão em `docs/projeto/IA.md`.
- **Importações permitidas em `features/onboarding`:**
  - o tipo `CanvasTool` e `TOOL_LABELS` (só no teste do catálogo);
  - `FelixoPopoverSurface`, apenas no menu Ajuda;
  - `keyboard-focus`;
  - `reduced-motion-preference`.
- **Importações proibidas (teste estático):** hooks e serviços que criam nó, PTY, edge ou flyout; `features/chat`; `terminal/*`; `fetch`, `XMLHttpRequest`, URLs http(s); `window.felixo.*` fora de `onboarding`, `qaLogger` e `devtools`.

### Renderer, arquivos novos em `src/features/onboarding/`

| Arquivo | Responsabilidade |
|---|---|
| `onboarding-catalog.ts` | Tipos `AnchorId`, `TourId`, `FeatureId`, `CapabilityId`, `StepDef`, `TourDef`, `FeatureDef`. `ONBOARDING_ANCHORS` (id → seletor), `ALWAYS_VISIBLE_ANCHORS`, `ONBOARDING_TOURS`, `ONBOARDING_FEATURES`, `ONBOARDING_CATALOG_REVISION`, `CATALOG_HISTORY` (livro de versões), `CANVAS_TOOL_FEATURES satisfies Record<CanvasTool, 'base' \| FeatureId>` (guarda de compilação) e `defaultOnboardingCatalog`. |
| `onboarding-messages.ts` | `PT_BR` com `satisfies Record<MessageKey, Message>`, `Message = string \| { one; other }`. Funções `ONBOARDING_LOCALES`, `resolveOnboardingLocale(lang)`, `formatOnboardingMessage(locale, key, params)` com `{n}` e `Intl.PluralRules`, `pseudoLocalize(text)` e `resolveCardLocale(locale, keys)`. Esta última é tudo ou nada por card: se falta uma chave no locale pedido, o card inteiro usa pt-BR, e o `lang` nunca mente. |
| `onboarding-state.ts` | Schema v1, `normalizeOnboardingState` (nunca lança), `MIGRATIONS`, `createBaselineState`, `decideAutomaticOpening`, `applyOnboardingEvent` (puro; devolve o mesmo objeto num no-op), `describeHelpEntries`, `serializeOnboardingState` (preserva extras e ids desconhecidos). |
| `onboarding-boot-signals.ts` | `captureOnboardingBootSignals(storage)` → `{ chavesFelixo, marcadorPrimeiroBoot }`, `getOnboardingBootSignals()` e `clearFirstBootMarker(storage)`. Chamado em `main.tsx` antes do `createRoot`. |
| `onboarding-devtools.ts` | `readDevtoolsFault(win)` → `'render' \| null`. Lê `sessionStorage['felixo:onboarding:falha']` só quando `window.felixo?.devtools` existe. |
| `onboarding-store.ts` (lazy) | `createOnboardingStore(deps)` e `createWindowOnboardingStore({ read })`, a store da janela, criada uma vez pelo procurador. |
| `onboarding-store-proxy.ts` (eager) | O singleton `onboardingStore`: procurador que baixa o chunk da store na montagem do canvas, antecipa a leitura no `canvasReady`, guarda as chamadas feitas antes e as repassa na ordem, e espelha o snapshot. `useOnboardingSnapshot()` e `useOnboardingNovelties()` com `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`, com snapshot de servidor constante. `loadOnboardingUi()` entrega a interface com a store já ligada. |
| `onboarding-canvas-triggers.ts` (eager) | `CANVAS_TRIGGER_NODE_TYPES` (o catálogo só aceita gatilho de canvas com tipo da lista), `WATCHES_CANVAS_NODE_TYPES`, `nodeTypesKeyOf` e `parseNodeTypesKey`. |
| `onboarding-layout.ts` | `resolveStepTarget`, `computeCardPlacement`, `computeRingRect`, `computeSidebarReveal`, `decideFocusOnOpen` (com `canStealFocus`), `resolveReturnFocus`, `hasOpenModal` e `ancestorCreatesContainingBlock`. Tudo puro, com DOM e medidas injetados. |
| `OnboardingMount.tsx` (eager) | Host na árvore. Região live sempre montada e vazia. `OnboardingErrorBoundary` em volta do `lazy` da camada. Chama `canvasReady(nodeCount)` e `canvasNodeTypes(key)`. |
| `OnboardingErrorBoundary.tsx` (eager) | Classe no molde do `ToolPanelErrorBoundary`: `getDerivedStateFromError` → fallback `null`, e `componentDidCatch` → `onboardingStore.reportFailure` + `window.felixo?.qaLogger?.log({ level: 'error', scope: 'renderer:onboarding', … })`. O canvas continua de pé. |
| `onboarding-ui-entry.ts` (lazy) | Reexporta `OnboardingTourLayer` e `OnboardingHelpMenu`. Os dois `lazy()` chegam a este módulo por `loadOnboardingUi()`, então há um chunk só de interface. |
| `OnboardingTourLayer.tsx` | Casca: medição, observadores, posição aplicada por ref, teclado e foco. Monta o anel, o card e o aviso. |
| `OnboardingTourCard.tsx` | Apresentacional puro: textos, ids e estado dos botões por props. Sem portal e sem coordenadas. |
| `OnboardingNotice.tsx` | Apresentacional do aviso de novidade. |
| `OnboardingHelpMenu.tsx` | Conteúdo do menu Ajuda, com a confirmação inline de redefinição. |

### Main, arquivos novos em `electron/`

| Arquivo | Responsabilidade |
|---|---|
| `services/storage/onboarding-state-repository.cjs` | `readOnboardingState(connection)` → `{ revision, value, corrupted }`, com leitura crua tolerante, sem `parseSettingsValue`. `compareAndSetOnboardingState(connection, { expectedRevision, value, nowIso })` roda `BEGIN IMMEDIATE`, lê, compara, faz UPSERT na chave `onboarding.state` com o envelope `{"revision":n,"value":{…}}` e dá `COMMIT`, com `ROLLBACK` no erro. |
| `services/onboarding-ipc-handlers.cjs` | `registerOnboardingIpcHandlers({ ipcMain, database, getAppVersion, automation, now })`. Registra os canais `onboarding:read` e `onboarding:write` e valida o payload. |
| `core/onboarding-automation.cjs` | `resolveOnboardingAutomation({ env, devtoolsPort })` → `{ autoOpen: boolean, reason: 'produto' \| 'devtools' \| 'devtools-opt-in' }`. |
| `core/ipc-invoke-probe.cjs` | `installIpcInvokeProbe(ipcMain)` → `{ snapshot() }`. Envolve `ipcMain.handle` e `ipcMain.on` e conta por canal, sem alterar retorno nem erro. |

### Alterações pontuais (sem mudança de comportamento, salvo o botão Ajuda)

- **`src/main.tsx`:** `captureOnboardingBootSignals(window.localStorage)` em `try/catch`, antes do `createRoot`.
- **`src/features/canvas/components/CanvasView.tsx`:**
  - `<OnboardingMount hydrated={hydrated && edgesHydrated} nodeCount={nodes.length} nodeTypesKey={…} />` logo depois do `<CanvasToolbar/>`, dentro de `[data-felixo-region="canvas"]`;
  - `nodeTypesKey` é uma string ordenada dos tipos presentes, via `useMemo`, e só é calculada quando o catálogo tem gatilho de canvas (`WATCHES_CANVAS_NODE_TYPES`, lido sem carregar o catálogo).
- **`src/features/canvas/components/CanvasToolbar.tsx`:**
  - `ActivityRailButton` ganha as props opcionais `tourAnchor`, `expanded` e `controls`;
  - âncoras `rail-menu` (toggle LayoutGrid) e `rail-projetos`;
  - novo botão "Ajuda" (lucide `CircleHelp`) no grupo superior, depois de Notificações, com `tourAnchor="rail-ajuda"`, `data-felixo-help-trigger`, ponto estático de novidade, estado local `helpOpen` e `lazy(OnboardingHelpMenu)` por `loadOnboardingUi()`;
  - `SidebarSection anchorId="secao-criar"` e `anchorId="secao-ferramentas"`;
  - `NamedCreateButton` de "Novo bloco" com `tourAnchor="criar-bloco"`.
- **`src/features/shared/components/SidebarSection.tsx`:** prop opcional `anchorId`, aplicada como `data-felixo-tour-anchor` no botão de título. O AppSidebar do chat não passa essa prop.
- **`src/features/canvas/components/TerminalMenu.tsx`:** `data-felixo-tour-anchor="criar-agente"` na moldura `.felixo-sidebar-agent-trigger`, nunca nas metades.
- **`src/features/canvas/components/tools/TerminalsPanel.tsx`:** `inspector-elementos` no cabeçalho do inspector (a linha com "Elementos") e `inspector-puck` no puck.
- **Obstáculos do posicionamento (`data-felixo-tour-avoid`):**
  - `src/features/setup/CliSetupNotice.tsx`: no cartão do toast;
  - `src/features/shared/hardware/HardwareNotices.tsx`: na caixa interna `role="status"` do `NoticeToast`, não no wrapper `inset-x-0` de largura total.
- **`src/index.css`:**
  - tokens `--felixo-z-onboarding-ring: 54` e `--felixo-z-onboarding: 55` em `@layer base`;
  - classes `.felixo-onboarding-card*`, `.felixo-onboarding-ring` e `.felixo-onboarding-notice`, com o anel de foco no CSS da própria classe (cascata do Tailwind 4);
  - overrides `:root[data-theme='high_contrast']` e `@media (forced-colors: active)`;
  - nenhuma animação nem transição.
- **`src/vite-env.d.ts`:** `onboarding?: { read(): Promise<OnboardingReadResult>; write(req: { expectedRevision: number; value: unknown }): Promise<OnboardingWriteResult> }`.
- **`electron/preload.cjs`:** `onboarding: { read: () => ipcRenderer.invoke('onboarding:read'), write: (request) => ipcRenderer.invoke('onboarding:write', request) }`.
- **`electron/main.cjs`:**
  - `installIpcInvokeProbe(ipcMain)` logo depois do cálculo de `devtoolsPort` (linha ~163), só com porta válida;
  - `registerOnboardingIpcHandlers(...)` logo depois de `registerOrchestratorSettingsIpcHandlers` (linha ~648), com `getAppVersion: resolveRuntimeAppVersion` e `automation: resolveOnboardingAutomation({ env: process.env, devtoolsPort })`;
  - `ipcProbe` acrescentado ao contexto do vm do `devtools:main-eval`, só para leitura.
- **`src/features/setup/setup-tailwind-classes.test.ts`:** a varredura passa a incluir `../onboarding`.

### Scripts

- **Novo `scripts/canvas-smoke-onboarding.cjs`:** exporta os cenários, que recebem `page` e os helpers (`esperarAte`, `measureStableGeometry`, `recordVisualEvidence`) por injeção. É chamado por `canvas-smoke.cjs`.
- **Novo `scripts/canvas-smoke-onboarding-geometry.cjs`,** com `.test.cjs`: `rectInside`, `intersects`, `contains`, `contrastRatio` e `diffChannels`, puros e com casos que DEVEM reprovar.
- **`scripts/canvas-smoke.cjs`:** `withDevtoolsSession(action, { env })` passa a definir e restaurar variáveis extras, como já faz com `FELIXO_DEVTOOLS_MOCK_PTY`, e ganha as chamadas das sessões A e B.
- **`scripts/ui-render-performance.cjs`:** flag `--onboarding`, que abre o tour pela Ajuda antes do cenário. Uso só manual, no HD 520, fora do CI.

### Fora do escopo

`features/chat`, `App.tsx`, menu nativo, `requestSingleInstanceLock`, `ariaLabelConfig` do React Flow (follow-up), rail rolável, empty state do canvas e o gap de reduced motion do `CanvasAmbientLayer`.

## State machine

### Schema persistido v1

O schema é gravado em `settings['onboarding.state']`, dentro do envelope `{ revision, value }`.

```ts
type OnboardingStateV1 = {
  schemaVersion: 1
  createdAt: string                 // ISO do relógio injetado
  updatedAt: string
  origin: 'primeiro-uso' | 'uso-anterior' | 'recuperado'
  appVersion: { first: string | null; last: string | null } // versão do produto: só contexto
  catalogRevision: number           // maior ONBOARDING_CATALOG_REVISION que gravou; nunca diminui
  knownFeatures: string[]           // ids já anunciados ou assumidos como linha de base; só cresce (união)
  resetAt: string | null
  tours: Record<string, TourRecord> // ids desconhecidos preservados intactos
  // chaves de topo desconhecidas: guardadas como extras e regravadas intactas
}

type TourRecord = {
  status: 'disponivel' | 'ativo' | 'dispensado' | 'concluido'
  tourVersion: number               // versão do roteiro na última interação
  step: string | null               // id do passo na última interação
  seenAt: string | null             // "visto" = seenAt != null
  lastShownAt: string | null
  timesShown: number
  dismissedAt: string | null
  completedAt: string | null
  announcedAt: string | null        // tours de novidade
  trigger: 'primeiro-uso' | 'ajuda' | 'novidade' | 'retomada' | null
  context: { appVersion: string | null; nodeCount: number | null; locale: string; anchorFallbacks: string[] }
}
```

### Catálogo versionado (`onboarding-catalog.ts`)

```ts
ONBOARDING_CATALOG_REVISION = 1
CATALOG_HISTORY = [{ revision: 1, tours: ['inicial', 'novidade-ajuda'], features: ['feature.ajuda'] }] as const

ONBOARDING_TOURS = {
  inicial:          { version: 1, kind: 'primeiro-uso', steps: [projeto, agente, contexto, terminal, ferramentas, ajuda] },
  'novidade-ajuda': { version: 1, kind: 'novidade',     steps: [ajudaNovidade] },
}

type StepDef = {
  id: string
  title: MessageKey
  targets: Array<{ anchor: AnchorId; body: MessageKey; label: string; side?: 'direita' | 'esquerda' | 'baixo' | 'cima' }>
  requires?: CapabilityId           // passo omitido quando a capability está indisponível
  citaFerramentas?: CanvasTool[]    // nomes citados no texto, conferidos contra TOOL_LABELS
}

type FeatureDef = {
  id: FeatureId
  tourId: TourId
  title: MessageKey
  trigger: { tipo: 'capability'; requires?: CapabilityId } | { tipo: 'canvas'; nodeType: string }
  anunciarParaQuemJaUsa?: boolean
}

ONBOARDING_FEATURES = [
  { id: 'feature.ajuda', tourId: 'novidade-ajuda', title: 'novidade.ajuda.titulo',
    trigger: { tipo: 'capability' }, anunciarParaQuemJaUsa: true },
]
```

Regras do catálogo:
- A detecção de "novo" é por IDENTIDADE: o id do catálogo não está em `knownFeatures` (molde do `sameFeatureSet` do graphics-recommendation). Nunca por versão do app, hash nem comparação de arquivo.
- `CATALOG_HISTORY` é o livro de versões. O teste exige quatro coisas:
  - ids atuais = união do histórico;
  - último item = `ONBOARDING_CATALOG_REVISION`;
  - nenhum id removido ou renomeado (usar `retired: true`);
  - ids únicos e no padrão.
  Um bump esquecido reprova o teste, mas nunca quebra a detecção, que é por id.
- `tourVersion` sobe quando o roteiro muda. Isso não reabre nada: quem concluiu continua concluído, e a Ajuda mostra "Atualizado".

### Visto × disponível

- **Visto** é persistido e diz o que a pessoa viu: `seenAt`, `status` e `announcedAt`.
- **Disponível** é do ambiente, calculado a cada sessão e nunca persistido: o tour está no catálogo deste build, `availability(requires)` vale `'desconhecido' | 'disponivel' | 'indisponivel'`, e ausência de `requires` vale `'disponivel'`. O estado `desconhecido` segura o disparo, com a guarda `receivedPush` do `useCliSetupStatus`.
- `describeHelpEntries` cruza os dois e dá os estados da Ajuda:
  - Não visto;
  - Em andamento;
  - Interrompido (`ativo` sem sessão viva);
  - Pulado;
  - Concluído em {data};
  - Atualizado (`tourVersion` menor que a do catálogo);
  - Novo (anunciado e não visto);
  - Indisponível nesta versão.

### Sessão (em memória, por janela)

```ts
type OnboardingSnapshot = {
  fase: 'carregando' | 'ocioso' | 'tour' | 'aviso' | 'desativado'
  tour: { tourId; stepIndex; passos: PassoVisivel[]; trigger; foco: 'mover' | 'manter'; ancora: AnchorId | null; instancia: number } | null
  aviso: { featureId; tourId } | null
  persistencia: 'carregando' | 'ok' | 'indisponivel' | 'somente-leitura' | 'sem-ponte'
  automacao: { autoOpen: boolean; reason: string }
  decisao: string        // exposto em data-felixo-onboarding-decisao (ex.: 'suprimido:abriria-inicial')
  ajuda: HelpEntry[]
  novidades: number      // badge da Ajuda
  anuncio: { texto: string; seq: number } | null
}
```

Invariantes:
- no máximo um entre `tour` e `aviso`;
- o aviso nunca tem `foco: 'mover'`;
- nenhuma abertura automática antes de `CANVAS_READY` nem com `autoOpen` falso;
- `concluido` só sai de `concluido` por `REDEFINIR`.

### Eventos e transições

`applyOnboardingEvent(state, evento, ctx)` é puro. A store orquestra o resto.

| Evento | Efeito |
|---|---|
| `LIDO(res)` | `normalize` → `ausente` / `valido` / `futuro` / `invalido`. `futuro` → persistência `somente-leitura`. `corrupted` ou `invalido` → decisão `recuperar`. Se existe estado (qualquer forma), chama `clearFirstBootMarker`. |
| `FALHA_LEITURA(motivo)` | `ok:false`, exceção ou timeout de 4 s (schedule injetável) → persistência `indisponivel`: sem abertura automática, Ajuda só em memória. |
| `CANVAS_READY(nodeCount)` | Avaliado uma vez por instância da store, depois de `LIDO`. Com sessão válida em `sessionStorage['felixo:onboarding:sessao']`, retoma (trigger `retomada`, foco `manter`, sem escrita). Senão, roda `decideAutomaticOpening`. |
| `TIPOS_DO_CANVAS(key)` | Guarda os tipos presentes. Depois de `CANVAS_READY`, um tipo que passa de ausente a presente dispara features `{ tipo: 'canvas' }` não conhecidas. A hidratação nunca dispara. |
| `CAPABILITY(id, disp)` | Reavalia só na fase `ocioso`. `desconhecido` espera; `indisponivel` pula sem marcar; ao virar `disponivel`, anuncia uma vez. |
| `ABRIR(tourId, origem)` | Sempre permitido, mesmo sem `autoOpen` ou persistência. Status `ativo`, salvo `concluido`, que é preservado. `timesShown++` e `seenAt ??= now`. Grava em segundo plano. Foco `mover`. |
| `PROXIMO` / `VOLTAR` | `stepIndex` limitado ao intervalo; só na sessão (`sessionStorage` atualizado); sem escrita. |
| `REALVO(stepId, anchor)` | Troca o texto pela variante da âncora e registra `anchorFallbacks`. |
| `PULAR(via)` | Botão ou Esc. `dispensado` (se já `concluido`, mantém), `dismissedAt` e `step`. Vai para `ocioso` e limpa a sessão. |
| `CONCLUIR` | `concluido`, `completedAt` e `tourVersion` atual. Vai para `ocioso`. |
| `AVISO_VER` | `ABRIR(tourId, 'novidade')`. |
| `AVISO_DISPENSAR` | Vai para `ocioso`. O tour fica "Novo" na Ajuda e não volta sozinho. |
| `REDEFINIR` | Com confirmação inline. Apaga os registros dos tours do catálogo, preserva ids desconhecidos e `knownFeatures`, grava `resetAt` e em seguida faz `ABRIR('inicial', 'ajuda')`. |
| `FALHA_RENDER` | Fase `desativado` na sessão, sem reabertura automática. A Ajuda ainda tenta. |
| Depois de `CONCLUIR`, `PULAR` ou `AVISO_DISPENSAR` | Reavalia novidades (uma de cada vez), incluindo gatilhos de canvas pendentes observados durante o tour. |

### Gatilhos

1. **Primeiro boot.** Estado `ausente`, `!usoAnterior`, `nodeCount === 0` depois de `hydrated && edgesHydrated`, e `autoOpen` → `reivindicar-inicial`. Canvas vazio sozinho nunca dispara.
2. **Canvas.**
   - Portão: toda avaliação automática só acontece com o `CanvasView` montado e hidratado. No chat nada aparece, e ao voltar o `OnboardingMount` remonta.
   - Gatilho de evento: `{ tipo: 'canvas', nodeType }` dispara na transição AO VIVO de 0 para 1 ou mais nós desse tipo depois da hidratação, uma vez por id.
   - O catálogo v1 não tem entradas desse tipo; o gatilho é testado com catálogo de fixture.
3. **Capability nova.** O id do catálogo não está em `knownFeatures`, `availability === 'disponivel'` → `anunciar(featureId)`, uma por vez.

### Decisão automática (`decideAutomaticOpening`, em ordem)

`usoAnterior = nodeCount > 0 || (sinais.chavesFelixo && !sinais.marcadorPrimeiroBoot)`

1. `autoOpen` falso → `nada`. Nenhuma escrita, e a decisão fica exposta como `suprimido:<o que faria>`.
2. `futuro` → `nada` (somente leitura).
3. `invalido` ou `corrupted` → `recuperar`: estado `origin: 'recuperado'` conservador, com `knownFeatures` = catálogo inteiro, `tours` vazio, nada abre e log no QA Logger.
4. `ausente` e `!usoAnterior` → `reivindicar-inicial`: `origin: 'primeiro-uso'`, `inicial` = `ativo` com `seenAt`, `lastShownAt`, `timesShown: 1` e `trigger: 'primeiro-uso'`, `knownFeatures` = features `capability` do catálogo.
5. `ausente` e `usoAnterior` → `linha-de-base`: `origin: 'uso-anterior'`, `knownFeatures` = features `capability` sem `anunciarParaQuemJaUsa`, e o tour `inicial` fica disponível. Depois de aplicado, segue para o passo 6.
6. `valido` → a primeira feature `capability` (ordem do catálogo) que não está em `knownFeatures` e está disponível → `anunciar`.
7. Senão, `nada`.

Features `{ tipo: 'canvas' }` nunca entram na linha de base: disparam só pelo gatilho ao vivo.

### Migração e downgrade

- `MIGRATIONS: Record<number, (raw) => raw>` é aplicado da versão gravada até a atual; está vazio na v1.
- O teste injeta uma tabela v1→v2 de fixture, e o `concluido` precisa sobreviver.
- A escrita da forma migrada só acontece no próximo commit, sem escrita no boot.
- `schemaVersion` maior que 1 → `futuro` → somente leitura: nada abre sozinho e nada é gravado; a Ajuda abre em memória. Voltar para a versão nova encontra o valor intacto. É o contrário do `=== 2` do `system-design-source.cjs:152`, que leria o novo como legado e sobrescreveria.
- Mesmo schema com `catalogRevision` maior ou ids desconhecidos (build antigo lendo estado de build novo): opera normalmente, preserva ids e extras, e `catalogRevision` e `knownFeatures` nunca diminuem. Downgrade seguido de upgrade não redispara nada.
- Update sem feature: catálogo igual, nada novo, zero escritas (a revisão não muda).
- Update com feature: só o id novo dispara, uma vez; o `concluido` do inicial é preservado (T3.c).

### Storage inválido

`normalize` nunca lança (teste de fuzz). Casos:

| Entrada | Resultado |
|---|---|
| Não objeto, `schemaVersion` ausente, não inteiro ou menor que 1, `corrupted: true` | `invalido` → `recuperar` |
| Campo inválido dentro de um v1 | Reparado com o padrão: data não ISO vira `null`, número negativo vira 0, status fora do union vira `disponivel`; um `concluido` válido nunca é rebaixado |
| Chaves `__proto__` ou `constructor` | Ignoradas (`Object.hasOwn`, objetos sem protótipo) |
| Valor acima de 64 KiB | O main recusa a escrita |
| `sessionStorage` inválido | Ignorado |

### Relógio e versão injetáveis (T1.e)

- **Store:** `deps = { backend, session, now: () => number, bootSignals, clearFirstBootMarker, getLocale, getActiveElement, catalog?, schedule?, readFault? }`.
- **`now`** vira ISO só em `onboarding-state.ts`, nunca no render (regra purity do react-hooks 7).
- **`appVersion`** chega na resposta de `onboarding:read` (injetável pelo backend falso). É só contexto gravado e nunca decide nada. Um teste de propriedade prova que `null`, `'0.1.0'`, `'0.1.423'`, `'0.1.423-2-gabc1234-dev'` e `'9.9.9'` produzem as mesmas decisões.
- **Main:** `now` e `getAppVersion` entram nas opções do handler; `env` e `devtoolsPort` na política.
- Nenhum `Date.now`, `matchMedia` ou leitura de ref acontece no render.

## Persistência e múltiplas instâncias

### Onde grava

| Dado | Onde | Quem lê e grava |
|---|---|---|
| Estado durável | SQLite `<userData>/database/felixo.sqlite`, tabela `settings`, chave `onboarding.state`, envelope `{ revision, value }` | O main, por `onboarding:read` e `onboarding:write` |
| Retomada da sessão | `sessionStorage['felixo:onboarding:sessao'] = { v: 1, tourId, stepIndex, trigger }`, por webContents | Store; gravado a cada passo e apagado ao pular, concluir ou falhar |
| Marcador de primeiro boot | `localStorage['felixo:onboarding:primeiro-boot'] = '1'` | `main.tsx` grava quando não há nenhuma chave `felixo*`; a store apaga quando o estado passa a existir |
| Sinal de uso anterior | Foto das chaves `felixo-ai-core.`, `felixo:` e `felixo.` (exceto `felixo:onboarding:`) antes do render | Só leitura |

Não há espelho do estado no localStorage nem backend local no `dev:web`.

### Contrato IPC

- **`onboarding:read`** → `{ ok: true, revision, value, corrupted, appVersion, automation: { autoOpen, reason } }`, ou `{ ok: false, message }` via `toErrorResult`.
  - Uma linha com JSON corrompido devolve `corrupted: true`, `revision: 0` e `value: null`.
- **`onboarding:write({ expectedRevision, value })`** → `{ ok: true, applied: true, revision }`, ou `{ ok: true, applied: false, revision, value, corrupted }`, ou `{ ok: false, message }`.
  - `value`: objeto simples com `schemaVersion` inteiro maior ou igual a 1, e no máximo 64 KiB serializado.
  - `expectedRevision`: inteiro maior ou igual a 0.
  - Uma linha corrompida vale revisão 0 e pode ser sobrescrita com `expectedRevision: 0`.

### Algoritmo de commit (store)

```
repete até 3 vezes:
  next = applyOnboardingEvent(atual.state, evento, ctx)
  se next === atual.state → no-op (nenhuma escrita)
  res = backend.write({ expectedRevision: atual.revision, value: serialize(next) })
  applied  → atual = { res.revision, next }
  conflito → atual = normalize(res.value) em res.revision; reaplica o MESMO evento
  ok:false → persistencia 'indisponivel' (segue em memória, log no QA Logger)
```

- Não há função de mesclagem: reaplicar o evento sobre o estado mais novo basta.
- As reivindicações (primeiro uso, anúncio) são pessimistas: o tour ou o aviso só aparece depois de `applied`. Uma reivindicação que perdeu a corrida vira no-op.
- Abrir pela Ajuda, avançar, pular e concluir são otimistas na UI e persistidos em segundo plano pelo mesmo laço. Uma escrita pendente nunca trava Próximo ou Pular.
- Na persistência `somente-leitura` ou `sem-ponte`, nada é escrito.

### Como evita tour duplicado (T3.d)

| Cenário | Mecanismo |
|---|---|
| StrictMode ou efeito duplo | A store é singleton de módulo; `load()` é uma promise memoizada; `canvasReady` é idempotente por instância |
| Reload do renderer (Exibir > Recarregar, boot-retry) | O estado já está reivindicado, então nada dispara. O `sessionStorage` retoma no mesmo passo, sem escrita e sem mover o foco |
| Restart do app | `sessionStorage` vazio e estado reivindicado: nada reabre. Um tour interrompido aparece como "Interrompido" na Ajuda, com Continuar e Recomeçar |
| Segunda janela no mesmo processo, ou janela recriada no macOS | `sessionStorage` próprio e estado já reivindicado: nada |
| Dois processos no mesmo userData (abrir `.fxai` com o app aberto, `devtools --real-profile`) | O `BEGIN IMMEDIATE` serializa: um aplica e o outro recebe `applied: false` e fica ocioso. Vale também para o anúncio |
| Primeiro boot com duas instâncias quase juntas | As duas leem a revisão 0; a primeira escrita aplica e a segunda conflita, reaplica e vira no-op |
| Renderer morre entre o CAS e a pintura | O tour não volta sozinho e fica "Interrompido" na Ajuda. Escolha consciente: nunca duplicar vale mais que sempre mostrar |

### Sinais de uso anterior e marcador

- `captureOnboardingBootSignals` roda antes do `ThemeProvider` e do `PerformanceModeProvider` gravarem no mount.
  - Sem nenhuma chave `felixo*`: grava o marcador e devolve `{ chavesFelixo: false, marcadorPrimeiroBoot: true }`.
  - Com o marcador presente: devolve `marcadorPrimeiroBoot: true`. Um primeiro boot interrompido antes da reivindicação continua primeiro uso no boot seguinte.
- Se o `localStorage` lançar, o default conservador é `{ chavesFelixo: true, marcadorPrimeiroBoot: false }`: nunca abre por engano.
- Se a captura não rodou (`getOnboardingBootSignals()` sem captura), vale o mesmo default conservador.
- O marcador é apagado quando `LIDO` encontra estado em qualquer forma, ou quando uma reivindicação ou linha de base é aplicada.

### Reset, reinstall e perfis

- **Reset:** Ajuda → "Redefinir tutoriais" → confirmação na própria tela, sem `window.confirm` (trava o renderer e a automação). Aplica o evento `REDEFINIR` e abre o inicial em seguida. Não reativa novidades já anunciadas (evita rajada).
- **Reinstall com NSIS:** sem `deleteAppDataOnUninstall`, o userData sobrevive, o estado persiste e nada reabre. É documentado no GUIA-USUARIO.
- **userData apagado à mão:** estado ausente e localStorage vazio: primeiro uso, e o tour abre uma vez.
- **`npm run dev` (userData `-dev`) e app instalado:** estados independentes, como esperado.
- **`dev:web` e bancada de bundle** (sem `window.felixo`): `backend = null`, persistência `sem-ponte`, `autoOpen` falso, nada é gravado. A Ajuda funciona em memória.

### Limites do main

- O handler é síncrono (`DatabaseSync`), portanto atômico dentro do processo.
- Entre processos, o `BEGIN IMMEDIATE` espera até 5 s (`busy_timeout`) e bloqueia a thread do main nesse caso raro. A transação fica mínima: um SELECT e um UPSERT, sem I/O nem lógica.
- Uma transação já aberta por outro módulo na mesma conexão faz o write falhar com `ok: false`. A store degrada sem abrir e registra no QA Logger.

## UX do tutorial

### Roteiro `inicial` v1 (6 passos)

Os textos são rascunho, com orçamento de título até 32 e corpo até 240 caracteres. Cada cadeia termina num alvo de `ALWAYS_VISIBLE_ANCHORS` (`rail-menu`, `rail-projetos`, `rail-ajuda` ou `canvas`). A coluna "rótulo" é o nome acessível real do alvo, e o texto do passo precisa contê-lo (teste de unidade e smoke).

| # | Passo | Cadeia de alvos `data-felixo-tour-anchor` | Rótulo | Texto (pt-BR, rascunho) |
|---|---|---|---|---|
| 1 | projeto | `rail-projetos` | Projetos | **Projeto.** "Em Projetos você escolhe a pasta do computador onde os agentes trabalham. Sem projeto, o agente abre no modo Local." |
| 2 | agente | `criar-agente` → `secao-criar` → `rail-menu` | Agente / Criar / menu do canvas | **Agente.** "Em Criar, o botão Agente abre um terminal com a CLI escolhida. A seta ao lado configura CLI, modelo e projeto antes de abrir. O tutorial não abre nenhum agente." Variantes: "Abra a seção Criar para ver o botão Agente." / "Abra o menu do canvas para ver Criar e o botão Agente." |
| 3 | contexto | `criar-bloco` → `secao-criar` → `rail-menu` | Novo bloco / Criar / menu do canvas | **Contexto.** "Novo bloco cria um arquivo .md no canvas. Ligue o bloco a um agente para ele ler e editar esse contexto." Variantes iguais às do passo 2. |
| 4 | terminal | `inspector-elementos` → `inspector-puck` → `canvas` | Elementos / elementos / canvas | **Terminais.** "Cada agente é um terminal de verdade. Em Elementos você acompanha os terminais do canvas. Para um terminal comum, escolha Nenhum (shell) ao configurar o agente." Variantes: "Elementos está recolhido neste botão. Abra para ver os terminais." / "Os terminais aparecem como blocos aqui no canvas." |
| 5 | ferramentas | `secao-ferramentas` (cabeçalho; a seção continua fechada) → `rail-menu` | Ferramentas / menu do canvas | **Ferramentas.** "Ferramentas reúne os painéis de apoio, como {ferramentaA} e {ferramentaB}. Abra a seção quando precisar." Os nomes vêm de `TOOL_LABELS[citaFerramentas[i]]`. |
| 6 | ajuda | `rail-ajuda` | Ajuda | **Onde rever.** "Pronto. Para rever este tutorial ou ver novidades, use Ajuda nesta barra. Nada foi criado e nenhum agente foi aberto." Botão principal: Concluir. |

Mini-tour `novidade-ajuda`: um passo em `rail-ajuda`, com "Novidade: a Ajuda reúne o tutorial do canvas e as novidades. Reabra o tutorial quando quiser."

Garantias:
- Nenhuma âncora, chave ou texto casa `/chat/i` (T2.d).
- O anel nunca cruza o botão Chat.
- A âncora `criar-agente` fica na moldura, e o foco nunca vai para a metade "Agente".
- O tour não liga `agentMenuRequest` (o flyout tem `autoFocus` e Enter lança o agente).
- O tour não foca nem passa o ponteiro em itens de Ferramentas, porque o `onFocus` pré-carrega chunks, inclusive o do Fetch All da bancada.

### Card

**Marcação.** `<div role="dialog" aria-modal="false">` com:
- `aria-labelledby` = [título do tour "Tutorial do canvas", título do passo];
- `aria-describedby` = [contador "Passo 2 de 6", corpo];
- `lang` = locale resolvido e `tabIndex={-1}`;
- classes `felixo-onboarding-card nokey` (`nokey`: o React Flow não apaga blocos com Delete ou Backspace);
- `data-felixo-popover-surface="true"`, `data-felixo-onboarding="card"`, `data-passo`, `data-ancora`, `data-modo`, `data-lado` e `data-instancia`.

**Eventos.** O card interrompe `pointerdown`, `mousedown` e `click` como o `FelixoPopoverSurface`, para que clicar no tour não feche flyouts abertos pela pessoa.

**Estrutura.**
- Contador em texto ("Passo n de m"; m conta só os passos visíveis).
- Título `h2` e corpo com `overflow: auto` e `min-height: 0`. O corpo ganha `tabIndex={0}` só quando transborda, para rolar pelo teclado.
- Rodapé fixo, na ordem visual igual à de foco: [Pular tutorial] … [Voltar] [Próximo | Concluir].
  - "Voltar" fica com `aria-disabled="true"` no passo 1 e nunca sai do DOM.
  - "Próximo" e "Concluir" são o mesmo elemento: muda o rótulo e `data-felixo-onboarding-action`.
  - O foco nunca se perde ao trocar de passo.
- Sem X e sem atalhos de letra ou número: 1–4 são do AgentQuestionDialog e Shift+↑/↓ abre a gaveta.

**Tipografia e dimensões.**
- Tamanhos em rem, definidos no CSS das classes `.felixo-onboarding-card__*`, nunca `text-[11px]`.
- Largura `min(22rem, 100vw − 24px)`.
- `overflow-wrap: anywhere`, sem `truncate` nem `line-clamp`.
- Botões com altura mínima de 2rem (acima dos 24 px do WCAG 2.5.8).

### Posicionamento (`computeCardPlacement`, puro)

**Modo folha.** Viewport compacto (largura < 480 ou altura < 360 px CSS: 320×720, 375×667, zoom +3 ≈ 417×289):
- `mode: 'folha'` na borda oposta ao centro do alvo;
- largura cheia menos margens de 12 px;
- `maxHeight = max(160, 60% da altura)`, limitado a `altura − 24`.

**Modo ancorado.**
- Testa os lados nesta ordem: preferido do passo (rail e sidebar → direita; inspector → esquerda), baixo, cima, esquerda.
- Alinha ao alvo com clamp (margem 12, distância 10) e nunca cruza o retângulo do alvo inflado em 4 px.

**Obstáculos:**
- `[data-felixo-tour-avoid]` (toast das CLIs no canto inferior direito e `NoticeToast` dos HardwareNotices embaixo no centro);
- `[data-canvas-layout-warning]`.

São evitados sempre que há lado livre. Na folha:
1. escolhe a borda sem obstáculo;
2. se as duas bordas tiverem obstáculo, encolhe o `maxHeight` para caber entre o obstáculo e o alvo;
3. abaixo de 160 px, cobre o obstáculo (limitação declarada: o card fica em z 55 sobre o toast em z 50 até a pessoa avançar ou pular).

Nenhum lado cabe → folha. Alvos maiores que metade do viewport podem ser cobertos só no modo folha; essa exceção entra nos asserts relacionais.

**Aplicação.**
- Molde do FelixoSelect: `updateLayout` em `useCallback`, chamado no `useLayoutEffect` e nos listeners.
- A posição e `data-modo` são escritos na ref do card e do anel dentro do próprio callback, sem `setState` por quadro. O React só re-renderiza em troca de passo ou de alvo. A medição acontece com `visibility: hidden` e o posicionamento no mesmo frame, sem piscar.

**Recálculo:**
- `resize` (o zoom da janela dispara resize);
- `scroll` em captura no `.felixo-sidebar-scroll`;
- `ResizeObserver` no alvo e no card (o sumiço do alvo gera 0×0);
- `transitionend` e `animationend` em captura, filtrados ao aside e ao inspector;
- `MutationObserver` com `childList+subtree` só em `[data-felixo-region="sidebar"]`, e com `attributes` (`class`, `inert`, `aria-hidden`, `hidden`, `style`), sem subtree, nos candidatos do passo atual (inspector e puck).

Tudo com no máximo um rAF por quadro e ativo só enquanto o tour ou o aviso está visível. Nunca há observador no body ou na dock, onde a saída do xterm muta o DOM sem parar.

### Alvos invisíveis (T2.c)

`resolveStepTarget` aceita um candidato só se ele atender a tudo isto:
- está conectado;
- não está dentro de `[inert]`, `[aria-hidden="true"]` ou `[hidden]`;
- `visibility` diferente de hidden e `opacity` maior que 0;
- retângulo não vazio, com pelo menos 50% dentro do viewport e do `.felixo-sidebar-scroll`;
- `elementFromPoint(centro)` cai no alvo ou num descendente.

Casos:
- **Sidebar recolhida ou seção fechada:** o tour NÃO expande nada (`changeSidebarCollapsed` gravaria `felixo:canvas-sidebar-collapsed`). Cai na alternativa com o texto variante. Quando a pessoa expande ou recolhe, o observador troca o alvo (`REALVO`).
- **Criar recolhida no meio do passo 2:** o `TerminalMenu` desmonta, e o anel migra para `secao-criar` sem erro.
- **Alvo abaixo da dobra do `.felixo-sidebar-scroll`:** `computeSidebarReveal` ajusta o `scrollTop` desse contêiner de forma instantânea.
- **Nada resolvível e sem `requires`:** vai para o último alvo sempre visível. Com `requires` indisponível, o passo é omitido (T2.g).

### Foco

**Abertura automática do primeiro uso.** `decideFocusOnOpen` move o foco para o contêiner do card (`focus({ preventScroll: true })`) só se `canStealFocus(activeElement)`:
- **verdadeiro** para `body`, `html`, `null` ou a própria região do canvas;
- **falso** para input, textarea, select, contenteditable, `.xterm`, `.xterm-helper-textarea`, qualquer coisa dentro de `[data-canvas-terminal-drawer]`, `webview`, `[role="dialog"]`, `[aria-modal="true"]` e `[data-felixo-popover-surface]`.

Quando não pode mover, o card aparece, a região live anuncia a abertura e o foco não muda.

**Outras aberturas.**
- Ajuda e "Ver" no aviso: sempre movem o foco (ação da pessoa).
- Aviso de novidade e retomada: nunca movem o foco.

**Sem trap.**
- O host fica logo depois do `<CanvasToolbar/>`: Tab no último botão segue para o canvas, e Shift+Tab em "Pular" volta à sidebar.
- O leitor lê nome e descrição quando o foco entra no contêiner; o primeiro Tab vai para "Pular".

**Ao fechar** (Pular, Esc ou Concluir), num rAF:
1. elemento salvo na abertura, se ainda estiver conectado, visível e fora de `inert`;
2. senão `[data-felixo-help-trigger]`;
3. senão `[data-felixo-region="canvas"]`.

O foco só é devolvido se ainda estiver dentro do card. Se a pessoa já o levou para outro lugar, fica onde está.

**Resize e zoom.** O card nunca remonta (sem `key` por modo nem por passo; `data-instancia` estável), então o foco permanece nele. O `useFocusRestore` continua devolvendo o foco ao voltar para a janela.

### Esc e teclas

- **`onKeyDown` no próprio card, fase bubble.** Com `Escape`, `!event.defaultPrevented` e `!hasOpenModal(document)`: `preventDefault`, `stopPropagation` e `PULAR('esc')`. Não há listener em `window`, `document` ou captura.
- **Diálogo modal aberto** (AgentQuestionDialog ou HandoffDialog): o card não trata o Esc, a tecla chega ao listener do diálogo, e as teclas 1–4 continuam indo para ele.
- **Esc com o foco fora do card** não toca o tour: xterm, flyout, CanvasPanel e diálogos continuam donos da tecla.
- **Aviso:** o mesmo padrão, e o Esc com o foco dentro dele equivale a `AVISO_DISPENSAR`.
- **Menu Ajuda:** o Esc com escopo fecha o menu e devolve o foco ao botão.

### aria-live

- `OnboardingMount` renderiza sempre `<div class="sr-only" role="status" aria-live="polite" aria-atomic="true" lang data-felixo-onboarding="anuncio" data-felixo-onboarding-decisao>`. Existe vazia desde a montagem do canvas, antes de qualquer mensagem.
- A camada lazy formata o texto e chama `store.announce(texto)`, então as mensagens não entram no chunk eager. Para repetir frases iguais, a região é esvaziada e o texto é escrito no frame seguinte.
- Frases:
  - troca de passo: "Passo {n} de {m}: {título}";
  - abertura sem foco: "Tutorial do canvas aberto ao lado da barra lateral. Passo 1 de {m}: Projeto.";
  - retomada: "Tutorial retomado no passo {n} de {m}: {título}.";
  - conclusão: "Tutorial concluído. Reabra em Ajuda.";
  - fechamento: "Tutorial fechado. Reabra em Ajuda.";
  - novidade: "Novidade em Ajuda: {título}."
- Não anuncia na abertura com foco (o leitor já lê o diálogo) nem com modal aberto.
- Convivência:
  - a statusbar (polite, "Canvas pronto") vem antes, porque a abertura acontece depois da hidratação;
  - o `NoticeToast` e o toast das CLIs também são polite e entram na fila;
  - a região assertiva do React Flow, em inglês, pode atropelar (risco declarado).

### Viewport pequeno, fonte maior e idiomas (T3.b)

- Modo folha em viewport compacto; texto em rem, que cresce com `font-size` a 137,5% e com o zoom.
- O corpo rola e o rodapé com os botões fica sempre visível, então nenhuma instrução é cortada.
- `en-XA` (pseudo, +40%) serve para validar a expansão.
- O `lang` do card, do aviso, do menu e da região live é o do catálogo efetivamente usado. A resolução é tudo ou nada por card, então nunca aparece texto pt-BR com `lang` de outro idioma.

### Reduced motion e HD 520

- O card, o anel e o aviso não têm animação nem transição. Um teste de CSS garante que as regras `.felixo-onboarding-*` não declaram `animation` nem `transition`, salvo `none`. Não há classe nova para esquecer nos dois blocos (reduced motion e `:root[data-performance-mode='on']`).
- Sem pan nem zoom programático (os helpers de `fitView` e `setCenter` ignoram reduced motion).
- O `scrollTop` da sidebar é instantâneo.
- Sem escurecer a tela, sem `backdrop-filter`, sem `box-shadow` grande nem pulso. O anel é um `div` fixo com `outline: 2px solid var(--color-accent)` e `outline-offset: 2px`.

### Camadas e convivência

- **Ordem (z):** statusbar e topbar (18) < dock e painéis (20/30) < sidebar (26) < overlay `isBusy`, toast das CLIs, `NoticeToast` e menu de cor (50) < anel (54) < card e aviso (55) < AgentQuestionDialog e HandoffDialog (60) < WebviewProfileMenu (70) < FelixoSelect e menu Ajuda (`FelixoPopoverSurface`, 1000).
- **Diálogo que bloqueia agente:** fica sempre acima do tour, o Esc cede e o tour não pausa nem some. O tutorial não bloqueia agente (T1.d).
- **HardwareNotices e toast das CLIs:** são obstáculos do posicionamento, e o tour nunca cobre os botões deles quando há espaço.
- **Chat:** o `CanvasView` desmonta e o card some sem marcar conclusão; ao voltar, reaparece no mesmo passo com foco `manter`.
- **`isBusy`:** o tour continua acima do overlay; Próximo e Voltar não fazem nada destrutivo.
- **Stacking context:** o host na árvore depende de nenhum ancestral de `[data-felixo-region="canvas"]` criar containing block ou stacking context. Hoje nenhum cria (a região é `relative` sem z-index). `ancestorCreatesContainingBlock` (transform, filter, perspective, contain, isolation, will-change, backdrop-filter) é verificado no smoke. Plano B: host irmão no app shell.

### Alto contraste

- `:root[data-theme='high_contrast'] .felixo-onboarding-card`: fundo `#000`, texto e borda `#fff`.
- Anel em `var(--color-accent)` do tema.
- `@media (forced-colors: active)`: borda `CanvasText` e anel `Highlight`.
- Contraste do texto de pelo menos 4,5:1 e do anel e controles de pelo menos 3:1, medidos no smoke.

### Aviso de novidade

- **Elemento:** card pequeno `role="region" aria-label="Novidade"` (no máximo 18rem, `lang`), ancorado à direita de `rail-ajuda` pelo mesmo `computeCardPlacement`, evitando os obstáculos. Botões [Ver] e [Agora não].
- **Comportamento:** sem timer (WCAG 2.2.1) e sem foco automático; fica até Ver, Agora não, abrir a Ajuda ou Esc com o foco nele. Aparece uma vez por id; se for ignorado, fica "Novo" na Ajuda e não volta sozinho.

## Ajuda (onde reabrir)

### Botão no rail

- `ActivityRailButton` "Ajuda" (`CircleHelp`) no grupo superior, depois de Notificações. No grupo de baixo ficaria recortado na altura mínima.
- Atributos: `aria-expanded`, `aria-controls`, `data-felixo-help-trigger` e `data-felixo-tour-anchor="rail-ajuda"`.
- Com novidade não vista: ponto estático, sem pulso, e `aria-label="Ajuda (1 novidade)"`, com plural pela contagem.
- Não tem texto "Ferramentas" nem é heading de seção, então não interfere no seletor da bancada de bundle.

### Menu

O menu é um `FelixoPopoverSurface` (portal, z 1000, só enquanto aberto) com `role="group" aria-label="Ajuda"`, classe `nokey` e `lang`. Conteúdo lazy (`OnboardingHelpMenu`):

- **Tutorial do canvas:** status (Não visto, Em andamento, Interrompido no passo n, Pulado, Concluído em {data com `Intl.DateTimeFormat(locale)`}, Atualizado) e ação Iniciar, Continuar do passo n, Rever ou Recomeçar.
- **Novidades:** lista (visto × disponível) com "Ver". O vazio mostra "Nenhuma novidade por enquanto." e o indisponível mostra "Indisponível nesta versão".
- **Redefinir tutoriais:** confirmação na própria tela, em dois cliques.
- **Persistência indisponível ou somente leitura:** uma linha discreta ("O progresso não será salvo nesta sessão.").

Comportamento:
- Esc (com escopo no menu) e clique fora fecham o menu e devolvem o foco ao botão Ajuda.
- Abrir um tour fecha o menu primeiro, e o tour abre no rAF seguinte.
- Depois do tour, o foco volta ao botão Ajuda.

## Automação

### Política (`electron/core/onboarding-automation.cjs`, pura)

| Instância | `autoOpen` | Escritas automáticas |
|---|---|---|
| App normal (sem `FELIXO_DEVTOOLS_PORT`) | sim | sim |
| `felixo devtools`, `canvas-smoke`, `ui-render-performance`, `hardware-check` (com porta) | não, `reason: 'devtools'` | nenhuma: nem linha de base, nem reivindicação, nem anúncio |
| Com porta e `FELIXO_DEVTOOLS_ONBOARDING=1` | sim, `reason: 'devtools-opt-in'` | sim |
| Sem ponte (`dev:web`, `bundle-load-benchmark`, vitest) | não (`backend = null`) | nenhuma |

- Ações explícitas da pessoa pela Ajuda gravam normalmente em qualquer instância com ponte.
- `data-felixo-onboarding-decisao` expõe `suprimido:abriria-inicial`, `suprimido:linha-de-base`, `aberto`, `nada`, `indisponivel` ou `somente-leitura`. Com isso o smoke prova a decisão de primeiro boot sem nada na tela.
- **Efeito nos fluxos existentes:**
  - `canvas-smoke`: Tab, oclusão da fixture, auditoria de nomes, matriz visual e reload ficam intactos; o único elemento novo sempre presente é o botão Ajuda, com nome acessível.
  - `ui-render-performance`: sem o tour, números comparáveis.
  - `bundle-load-benchmark`: sem ponte, então sem tour, com amostras iguais entre si e o chunk lazy fora do startup.
  - `release-smoke`: não cria janela.
- **Falha forçada:** `readDevtoolsFault` lê `sessionStorage['felixo:onboarding:falha'] === 'render'` só com `window.felixo.devtools`. Um teste prova que é ignorada sem a ponte.
- **Sonda IPC:** `installIpcInvokeProbe` só com porta devtools válida; exposta como `ipcProbe` no vm do `devtools:main-eval`, só com `snapshot()`.
- **Uso manual:**
  - `FELIXO_DEVTOOLS_ONBOARDING=1 node electron/cli/felixo.cjs devtools launch --visible` reproduz o primeiro uso (o `felixo-devtools.cjs` repassa `process.env`);
  - `press Tab`, `press Escape` e `eval document.activeElement?.outerHTML` servem para inspeção.
  - Documentado no GUIA-DESENVOLVEDOR e em `.claude/skills/rodar-app/SKILL.md`: todo perfil isolado é primeiro boot e o tour vem suprimido por padrão.
- **Semear estados sem chave literal duplicada:** o smoke usa a própria ponte (`window.felixo.onboarding.read()` e `.write({ expectedRevision, value })` em `page.evaluate`). Não há gancho de escrita crua no main-eval.

## Testes

### Unitários do renderer (vitest, ambiente node, em `src/features/onboarding/`)

- **U-cat** (`onboarding-catalog.test.ts`)
  - Ids únicos e no padrão; toda âncora existe em `ONBOARDING_ANCHORS`; o último alvo de cada cadeia está em `ALWAYS_VISIBLE_ANCHORS`.
  - Toda `MessageKey` existe em `PT_BR`, e o corpo de cada alvo contém o `label` declarado.
  - `citaFerramentas` resolve em `TOOL_LABELS` e o texto contém esses nomes.
  - Nenhuma âncora, chave ou texto casa `/chat/i`; nenhum passo aponta a metade "Agente" nem tem campo de ação.
  - Toda feature tem tour com pelo menos um passo.
  - `CATALOG_HISTORY`: ids atuais = união do histórico, último item = revisão atual, nenhum id removido.
  - `CANVAS_TOOL_FEATURES` cobre `CanvasTool` (compilação) e os `FeatureId` existem.
- **U-msg** (`onboarding-messages.test.ts`)
  - Interpolação; plural pt-BR com 0, 1 e 2.
  - `en-US` e `fr` caem em pt-BR; `resolveCardLocale` é tudo ou nada; chave ausente num locale parcial usa pt-BR.
  - `en-XA` expande pelo menos 30% e preserva placeholders.
  - Orçamento de título ≤ 32 e corpo ≤ 240 caracteres.
- **U-state** (`onboarding-state.test.ts`, relógio fixo e catálogo injetado)
  - `normalize`:
    - `null` → ausente;
    - array, string, número e `{}` → inválido;
    - `schemaVersion` 0, -1, '1' e 1.5 → inválido; 2 → futuro;
    - v1 com campos quebrados → reparado sem rebaixar `concluido`;
    - `__proto__`;
    - fuzz com PRNG semeado (500 valores) nunca lança.
  - `serialize` preserva extras e ids desconhecidos.
  - `decideAutomaticOpening` em tabela: primeiro uso; chaves sem marcador → linha de base; chaves com marcador → primeiro uso; nós > 0 → linha de base; `autoOpen` falso → nada; futuro → nada; inválido → recuperar.
  - Update sem feature → nada. Update com feature → anunciar uma vez, e depois do aplicado → nada.
  - `anunciarParaQuemJaUsa` → o uso anterior recebe um aviso e o primeiro uso nenhum.
  - `requires` `desconhecido` → nada; `indisponivel` → nada e não marcado; `disponivel` → anunciar.
  - Gatilho canvas com catálogo de fixture: hidratar já com o tipo não dispara; a transição 0→1 dispara uma vez; durante o tour fica pendente.
  - `apply`:
    - reivindicar duas vezes → a segunda é no-op;
    - dispensar mantém `concluido`;
    - concluir grava `completedAt` e `tourVersion`;
    - redefinir preserva `knownFeatures` e ids desconhecidos.
  - Migração: estado do catálogo N (inicial concluído) lido pelo N+1 → só a feature nova; tabela v1→v2 de fixture preserva `concluido`.
  - Downgrade: `feature.futura` e `catalogRevision` 5 lidos pelo catálogo 1 → nada abre e tudo é preservado.
  - Propriedade: `appVersion` variada não muda nenhuma decisão.
- **U-store** (`onboarding-store.test.ts`, backend falso com revisão, CAS em memória e latência controlada, `Map` de sessão, relógio e schedule falsos)
  - Primeiro boot abre com foco `mover` e uma escrita.
  - `canvasReady` duas vezes (StrictMode) → uma escrita e uma abertura.
  - Uso anterior → linha de base gravada, ocioso, Ajuda "Não visto" e o aviso de `feature.ajuda` uma vez.
  - Update sem feature → zero escritas. Update com feature → aviso uma vez; nova store no mesmo backend (restart) → nada.
  - Duas stores no mesmo backend com leituras intercaladas → exatamente um tour.
  - Reload com sessão → retoma sem escrever; sem sessão → nada.
  - Primeiro boot interrompido (reivindicação nunca aplicada, marcador presente e chaves de tema) → no próximo boot, primeiro uso.
  - `corrupted: true` → recuperado, nada abre, CAS sobre a revisão lida.
  - `read ok:false`, exceção e timeout de 4 s → indisponível, Ajuda em memória sem escrever; o canvas nunca espera (a store não bloqueia `canvasReady`).
  - Futuro → somente leitura; concluir não escreve.
  - Conflito em pular e concluir reaplica sobre o estado da outra instância sem perder o id que ela acrescentou.
  - Escrita pendente não trava Próximo nem Pular.
  - `autoOpen` falso → zero escritas automáticas, e a decisão é exposta.
  - `backend` null → sem ponte e Ajuda em memória.
  - `reportFailure` → desativado, sem laço.
  - Reset abre o inicial e grava.
  - Reinstall: backend preservado → nada; backend novo com sinais vazios → primeiro uso.
  - `now` e `appVersion` injetados aparecem no registro.
- **U-prop** (`onboarding-store.property.test.ts`): 500 sequências de 40 eventos aleatórios (PRNG semeado) sobre a store, com deps espiãs. Invariantes:
  - só são chamados `backend.read`, `backend.write`, `session.*`, `clearFirstBootMarker` e `getActiveElement`;
  - no máximo um entre tour e aviso;
  - aviso nunca com foco `mover`;
  - nunca abertura automática antes de `CANVAS_READY` nem com `autoOpen` falso;
  - com `autoOpen` falso, nenhuma escrita sem evento explícito da pessoa;
  - `concluido` só sai por `REDEFINIR`;
  - todo valor escrito tem 64 KiB ou menos e sobrevive a `normalize`.
- **U-layout** (`onboarding-layout.test.ts`)
  - `computeCardPlacement` numa matriz: viewports 320×720, 375×667, 417×289, 720×500, 1280×800 e 3840×2160; alvos no rail, na sidebar, cabeçalho do inspector, puck e alvo minúsculo nos quatro cantos; card normal e 2× mais alto (pseudo-locale); com e sem obstáculo bottom-center de 22rem (`NoticeToast`) e bottom-right (toast das CLIs).
  - Asserts só relacionais:
    - card dentro do viewport com margem;
    - sem interseção com o alvo no modo ancorado;
    - modo folha quando compacto;
    - obstáculo evitado quando há espaço;
    - determinismo.
  - `resolveStepTarget` com DOM falso: primário visível; `[inert]`; `opacity 0`; retângulo vazio; fora do viewport; ocluído (`elementFromPoint`); abaixo da dobra → `needsReveal`; nada → `null`.
  - `decideFocusOnOpen` e `canStealFocus` na lista completa; `resolveReturnFocus` com desconectado → Ajuda → canvas, e "foco já fora do card" → não devolve.
  - `hasOpenModal`; `ancestorCreatesContainingBlock`.
- **U-ui** (`OnboardingUi.test.ts`, `renderToStaticMarkup` com `createElement`, sem portal)
  - Card por passo × locale (pt-BR e en-XA): `role="dialog"`, `aria-modal="false"`, ids de labelledby e describedby existentes, `lang`, `nokey` e `data-felixo-popover-surface`.
  - "Passo 1 de 6"; Voltar com `aria-disabled` no passo 1; Concluir no último.
  - Nenhum `style` com top, left ou transform: snapshots sem coordenadas.
  - Sem `truncate` nem `line-clamp`.
  - Aviso: sem `autoFocus`.
  - Menu Ajuda: todos os estados e a confirmação do reset.
- **U-bound** (`onboarding-boundaries.test.ts`): sonda estática das importações e chamadas proibidas; o `OnboardingMount` importa a UI só por `lazy`. Mais os métodos estáticos e de instância do `OnboardingErrorBoundary` com store falsa (fallback `null`, `reportFailure` e log).
- **U-css** (`onboarding-css.test.ts` + `setup-tailwind-classes.test.ts` estendido): nenhuma regra `.felixo-onboarding-*` com `animation` ou `transition`; tamanhos de fonte em rem; foco visível no CSS da classe; override de alto contraste e forced-colors presentes.
- **U-boot** (`onboarding-boot-signals.test.ts` + `onboarding-devtools.test.ts`):
  - prefixos contados e `felixo:onboarding:` ignorado;
  - marcador gravado só sem chaves;
  - marcador existente reconhecido;
  - `localStorage` que lança → conservador;
  - falha forçada ignorada sem `window.felixo.devtools`.

### Unitários do main (`node:test`, `npm test`)

- **N-repo** (`electron/services/storage/onboarding-state-repository.test.cjs`, SQLite real em diretório temporário com as migrations)
  - Ausente → revisão 0.
  - `write(0)` aplica e vai para revisão 1; revisão velha → `applied: false` com o valor atual.
  - Linha corrompida por SQL cru → `corrupted: true` sem lançar e regravável com 0.
  - Duas conexões `createStorageDatabase` no mesmo arquivo, intercaladas → uma aplica e a outra conflita.
  - Reabrir o banco (restart ou reinstall preservando) mantém o estado; diretório novo (reinstall limpo) → ausente.
- **N-mp** (`onboarding-state-multiprocess.test.cjs` + `__fixtures__/onboarding-cas-worker.cjs`, sem `.test` no nome): dois processos node reais com barreira por mensagem, 20 rodadas, exatamente um CAS aplicado por rodada. Roda nos três SOs do CI.
- **N-ipc** (`electron/services/onboarding-ipc-handlers.test.cjs`, `ipcMain` falso)
  - Formatos de resposta; `appVersion` e `automation` presentes.
  - Payload inválido (array, maior que 64 KiB, `schemaVersion` ausente, revisão não inteira) → `ok: false` sem gravar; erro do SQLite → `ok: false`.
  - Contrato: `preload.cjs` contém `onboarding:read` e `onboarding:write`, e `src/vite-env.d.ts` contém `onboarding?:`.
- **N-auto** (`electron/core/onboarding-automation.test.cjs`): matriz de env × porta (sem porta; porta inválida; porta; porta + `FELIXO_DEVTOOLS_ONBOARDING=1`; opt-in sem porta é ignorado).
- **N-probe** (`electron/core/ipc-invoke-probe.test.cjs`): conta por canal em `handle` e `on`, preserva retorno e exceção, e o snapshot é imutável.
- **N-geo** (`scripts/canvas-smoke-onboarding-geometry.test.cjs`): helpers relacionais, `contrastRatio` e `diffChannels`, com casos que devem reprovar.

### Smoke real via CDP (`scripts/canvas-smoke-onboarding.cjs`, chamado por `canvas-smoke.cjs`)

Regras gerais: asserts só relacionais, esperas por `esperarAte` e frames estáveis (`measureStableGeometry`, no máximo 0,5 px), nunca tempo fixo. Cliques via DOM onde a faixa fantasma da dock (abaixo de 768 px) pode interceptar. Evidências em `recordVisualEvidence` com `[data-felixo-onboarding="card"]` e `.felixo-onboarding-ring`, sem x/y nos asserts.

**Sondas** (tiradas antes e depois de cada percurso completo):
- **IPC:** `ipcProbe.snapshot()` via `mainEval`.
  - Delta 0 absoluto em `pty:*`, `cli:*`, `cli-accounts:*`, `openia:*`, `notion:*`, `fetch-all:*`, `git:*`, `projects:pick-folder`, `projects:detect-repos`, `canvas-file:*`, `context-file:*`, `text-file:*`, `speech:*`, `webview-profiles:*`, `agent-presets:*` e escritas `canvas:*` (a lista final sai do preload no commit).
  - Canais vistos no percurso ⊆ canais de uma janela ociosa de controle com a mesma duração ∪ `onboarding:*`.
- **Rede:** `page.on('request')` → nenhuma requisição fora da origem do app (servidor Vite local, `file:`, `data:`, `blob:`, `devtools:`).
- **DOM:** contagens de `.react-flow__node` e de edges iguais; nenhum `.xterm` novo; nenhum `[data-canvas-terminal-drawer]`; nenhum `webview`; `window.felixo.canvas.list()` com o mesmo número de nós.
- **localStorage:** diff ⊆ {remoção de `felixo:onboarding:primeiro-boot`}. `felixo:canvas-sidebar-collapsed` e o `aria-expanded` de Criar e Ferramentas não mudam por ação do tour.

**Sessão A** (a atual: perfil novo, `FELIXO_DEVTOOLS_MOCK_PTY=1`, abertura automática suprimida). SA0 roda logo depois de `checarMontagem`; SA1–SA10 rodam no fim, depois dos fluxos existentes, com viewport 1280×800 e tema escuro restaurados.

- **SA0 supressão e captura**
  - Depois da hidratação e de frames estáveis, não existe card.
  - A região `[data-felixo-onboarding="anuncio"]` existe, vazia e com `lang="pt-BR"`.
  - `data-felixo-onboarding-decisao="suprimido:abriria-inicial"`, o que prova que a captura foi anterior ao tema.
  - `read()` → `value: null`, `revision: 0` (zero escritas).
  - O marcador existe, e o botão Ajuda tem nome acessível.
- **SA1 percurso manual pela Ajuda (canvas não vazio, com a fixture).** Em cada passo:
  - âncora = alvo esperado;
  - alvo fora de `inert` e `aria-hidden`, dentro do viewport, com `elementFromPoint(centro)` no alvo;
  - anel contém o alvo (±2 px);
  - card dentro do viewport, sem interseção com o alvo nem com `[data-felixo-tour-avoid]`;
  - anel ∩ botão Chat = ∅;
  - nome acessível do alvo contém o `label` do passo;
  - geometria estável;
  - `ancestorCreatesContainingBlock` falso.
  Sondas IPC, rede, DOM e localStorage com delta dentro do permitido.
- **SA2 teclado**
  - Tab e Shift+Tab percorrem Pular → Voltar → Próximo; Tab depois do último sai do card para o canvas; Shift+Tab em Pular volta à sidebar (sem trap).
  - Enter em Voltar no passo 1 não faz nada e o foco fica.
  - Enter em Próximo mantém o foco no mesmo botão.
  - Outline de `:focus-visible` computado e visível.
  - Esc no card fecha, e o foco vai ao botão Ajuda.
  - `activeElement` amostrado a cada ação nunca é a metade "Agente" nem "Limpar".
- **SA3 Esc em camadas e não bloqueio**
  - Com o tour aberto, a seta "Configurar novo agente" abre o flyout; Esc no flyout fecha só o flyout.
  - Ctrl+K (Busca, que rouba o foco); Esc fecha só o painel.
  - `[data-canvas-handoff-trigger]` abre o HandoffDialog: o diálogo fica no topo (`elementFromPoint` no centro dele cai dentro dele); Esc com o foco no diálogo fecha só o diálogo; o tour continua no mesmo passo e o foco não é puxado.
  - Fora da janela das sondas: clicar em "Agente" (PTY mock) com o tour aberto cria o terminal e o tour continua (T1.d).
- **SA4 leitor de tela**
  - `Accessibility.getFullAXTree`: dialog com nome ("Tutorial do canvas" + título) e descrição (contador + corpo), botões nomeados.
  - Depois de Próximo, a região live contém "Passo 2 de 6: Agente".
  - `lang="pt-BR"` no card e na região.
- **SA5 viewport, zoom e foco depois do resize**
  - 1280×800 → 375×667 → 320×720 e `mainEval('mainWindow.webContents.setZoomLevel(3)')`: modo folha, card dentro do viewport, botões visíveis e alcançáveis.
  - O mesmo `data-instancia` e o mesmo `activeElement` (`data-felixo-onboarding-action`) antes e depois de cada resize.
  - Zoom restaurado.
- **SA6 fonte e idioma:** `font-size` 137,5% + `document.documentElement.lang = 'en-XA'` e abrir pela Ajuda.
  - Sem overflow horizontal; títulos e botões com `scrollWidth ≤ clientWidth + 1`.
  - O corpo cabe, ou é rolável e focável; os botões ficam dentro do card.
  - `lang="en-XA"` no card.
  - Restaurar.
- **SA7 movimento e contraste**
  - `emulateMedia({ reducedMotion: 'reduce' })` e Modo Performance: `animation-name: none` e `transition-duration: 0s` no card e no anel.
  - Tema `high_contrast`: contraste do texto ≥ 4,5 e do anel ≥ 3 (`contrastRatio` sobre `getComputedStyle`).
  - `emulateMedia({ forcedColors: 'active' })`: borda do card visível.
- **SA8 alvos invisíveis**
  - Sidebar recolhida: os passos 2, 3 e 5 usam `rail-menu` com o texto variante, e `felixo:canvas-sidebar-collapsed` não é alterado pelo tour.
  - A pessoa expande: o anel migra para o primário.
  - Criar recolhida no meio do passo 2: `secao-criar` sem erro.
  - Inspector recolhido: `inspector-puck`.
  - Preferências restauradas.
- **SA9 retomada e chat**
  - No passo 3, reload: um card só, no passo 3, sem mover o foco, com "Tutorial retomado…" anunciado.
  - Ir ao Chat e voltar: mesmo passo, não concluído.
  - Concluir e recarregar: nada. `sessionStorage.clear()` + reload (restart do renderer): nada. A Ajuda mostra "Concluído em …".
- **SA10 falha isolada**
  - `sessionStorage['felixo:onboarding:falha'] = 'render'` e abrir pela Ajuda: nenhum card; `[data-felixo-hydrated="true"]` continua; landmarks visíveis; sem tela "A interface não conseguiu carregar".
  - Remover a chave + reload: a Ajuda funciona.

**Sessão B** (nova `withDevtoolsSession` com `FELIXO_DEVTOOLS_ONBOARDING=1`, `FELIXO_DEVTOOLS_HARDWARE_NOTICES=1` e `FELIXO_DEVTOOLS_MOCK_PTY=1`, perfil novo, canvas vazio):

- **SB1 primeiro uso real**
  - Abre sozinho depois da hidratação, sem clique: exatamente um card, "Passo 1 de 6", foco dentro do card e `lang`.
  - `read()` → `inicial` ativo, revisão 1; marcador removido.
  - Convivência:
    - com 4 CPUs lógicas ou menos: `NoticeToast` visível; card ∩ caixa do aviso = ∅; `elementFromPoint` no centro dos botões do aviso cai neles; o aviso responde a clique;
    - com mais de 4: registra `pulado` com o motivo (precedente do `hardware-check.cjs`).
- **SB2 percurso só por teclado até Concluir**
  - Sondas IPC, rede, DOM e localStorage dentro do permitido (T2.a, T2.b).
  - Região live anuncia a conclusão; o foco vai para o botão Ajuda.
- **SB3 restart e reload:** reload → nada; `sessionStorage.clear()` + reload → nada; revisão inalterada (sem escrita no boot).
- **SB4 update sem feature:** com o estado atual (todas as features conhecidas), reload → nada, revisão e valor byte a byte iguais.
- **SB5 update com feature e migração**
  - `write` de v1 com `inicial: concluido` e `knownFeatures: []`, depois reload.
  - O aviso aparece e o foco não está nele; a região live anuncia a novidade.
  - `read()`: `feature.ajuda` em `knownFeatures`, `announcedAt` preenchido e `inicial` ainda `concluido` (T3.c).
  - "Ver" abre o mini-tour com o foco no card; Concluir; reload → sem aviso.
- **SB6 novidade sem roubar foco**
  - `write` de v1 com `inicial: ativo` e `knownFeatures: []`, mais `sessionStorage` de retomada no passo 3, depois reload.
  - O tour retoma e não há aviso enquanto está aberto.
  - Ctrl+K e digitar "abc" na Busca; clique DOM em "Pular tutorial".
  - O aviso aparece, o `activeElement` continua no input da Busca, e digitar "d" resulta em "abcd".
- **SB7 downgrade e inválido**
  - `write` com `schemaVersion: 2` + reload → nada abre; abrir pela Ajuda funciona em memória; `read()` continua byte a byte igual.
  - `write` com `{ schemaVersion: 1, tours: 'x', … }` → reparado; forma com `schemaVersion: 0` → recuperado, nada abre, canvas de pé, Ajuda funciona.
- **SB8 reset:** Ajuda → Redefinir → confirmar → o inicial abre com foco; Esc → reload → nada; `knownFeatures` preservado.

Fora do CI: a flag `ui-render-performance.cjs --onboarding` roda manualmente no i5-6200U/HD 520 com o Modo Performance ligado e desligado, e o resultado vai para `docs/projeto/IA.md` e `POLITICA-PERFORMANCE.md`.

### Mapa aceite → cobertura

| Aceite | Automatizado | Manual |
|---|---|---|
| T1.a update sem feature não reabre | U-state, U-store, SB4 | — |
| T1.b feature nova dispara uma vez | U-state, U-store, U-prop, SB5, SB6 | — |
| T1.c storage corrompido usa fallback | U-state (fuzz), U-store, N-repo, SB7 | — |
| T1.d tutorial não bloqueia agente | U-layout (`hasOpenModal`), U-prop, SA3 (HandoffDialog z 60, Agente com tour aberto), SB6 | AgentQuestionDialog real sobre o tour (exige CLI) |
| T1.e versão e relógio injetáveis | U-state (propriedade), U-store, N-ipc | — |
| T2.a primeiro uso sem ação destrutiva | U-cat, U-bound, SB1, SB2 (sondas) | — |
| T2.b nenhum processo, rede ou crédito | U-bound, U-prop, SA1 e SB2 (IPC, rede, DOM, localStorage) | — |
| T2.c cada passo aponta para elemento visível | U-cat, U-layout, SA1, SA8 | — |
| T2.d chat não é caminho principal | U-cat (`/chat/i`), SA1 (anel ∩ Chat = ∅), SA9 | — |
| T2.e canvas vazio e reload | SB1 (vazio), SA1 (com fixture), SA9, SB3 | — |
| T2.f não bloqueia esperando backend | U-store (timeout, `ok:false`, sem ponte) | — |
| T2.g degrada sem feature opcional | U-state (`requires`), U-layout (alvo nulo), U-ui (Indisponível) | — |
| T3 Tab, foco, Esc | SA2, SA3, SA5 | Passe com janela visível e input real (RELEASE_CHECKLIST:121-125) |
| T3 aria-live e leitor de tela | U-ui, SA4, SB2, SB5 | Orca, NVDA e VoiceOver |
| T3 texto longo, idiomas, fonte, viewport, reduced motion | U-msg, U-layout, U-css, SA5, SA6, SA7 | Escala de fonte do SO (Windows 150%) |
| T3.a saída acessível em todos os passos | U-ui, SA2, SA4 | — |
| T3.b nenhuma tradução corta instrução | U-msg (orçamento, en-XA), U-ui, SA6 | Tradução real (não existe 2º idioma) |
| T3.c migração preserva concluído e abre só o novo | U-state, SB5 | — |
| T3.d restart não duplica | U-store, U-prop, N-repo, N-mp, SA9, SB3 | Dois processos Electron reais (`.fxai` com o app aberto) em Windows e macOS; janela recriada no macOS |
| T3 downgrade, reset, storage inválido | U-state, U-store, SB7, SB8 | — |
| T3 sem tour duplicado em várias janelas | U-store, N-repo, N-mp | Idem T3.d |
| T3 snapshots sem coordenadas frágeis | U-ui, U-layout (relacional), smoke relacional | — |
| Convivência com HardwareNotices (lacuna dos juízes) | U-layout (obstáculo bottom-center), SB1 | Primeiro boot empacotado no notebook 2c/4t |
| Reinstall | N-repo, U-store | NSIS real preservando o userData e perfil apagado à mão |
| Custo no HD 520 | — | `ui-render-performance --onboarding` com o Modo Performance ligado e desligado |

## Riscos e limitações declaradas

- **Host na árvore:** se um ancestral de `[data-felixo-region="canvas"]` passar a criar containing block ou stacking context (transform, filter, contain, isolation), o `fixed` e o z 55 quebram e o `AgentQuestionDialog` pode ficar por baixo. A mitigação é `ancestorCreatesContainingBlock` no smoke (SA1); o plano B é um host irmão no app shell.
- **Primeiro boot no 2c/4t:** até três avisos polite ao mesmo tempo (NoticeToast, toast das CLIs, statusbar) e a região assertiva em inglês do React Flow. A ordem de anúncio não é garantida. Mitigação parcial: anunciar só passo, retomada, conclusão e novidade, e nunca na abertura com foco. O `ariaLabelConfig` em pt-BR fica como follow-up.
- **Folha em viewport muito pequeno:** pode cobrir o `NoticeToast` ou o toast das CLIs quando não sobram 160 px. É intencional e está nos asserts.
- **`BEGIN IMMEDIATE` no main síncrono:** sob contenção entre processos, bloqueia até 5 s (raro). A transação tem de continuar mínima.
- **Marcador no localStorage:** o comportamento do LevelDB num segundo processo sobre o mesmo userData não foi verificado. Só afeta os sinais, nunca o estado (que está no SQLite). O primeiro processo já terá gravado a reivindicação ou a linha de base.
- **Perder uma exibição:** se o renderer morrer entre o CAS e a pintura, o tour não volta sozinho e fica "Interrompido" na Ajuda.
- **Downgrade em somente leitura:** numa versão antiga, o progresso não persiste. Troca aceita para nunca destruir estado mais novo.
- **Sem `requestSingleInstanceLock`:** um segundo processo não é avisado ao vivo de um tour concluído no primeiro; só vê na próxima leitura.
- **Disciplina do catálogo:** uma feature fora de `CanvasTool` só aparece como novidade se alguém a acrescentar em `ONBOARDING_FEATURES` e no `CATALOG_HISTORY`. A guarda de compilação cobre só ferramentas; o resto depende do checklist no GUIA-DESENVOLVEDOR e da revisão.
- **Aviso da Ajuda para quem já usa:** é uma decisão derivada (a + c). É reversível pela flag `anunciarParaQuemJaUsa` e fica registrada no plano e no GUIA-USUARIO.
- **i18n:** só pt-BR real. `en-XA` prova expansão, não tradução. O pseudo-locale vai no bundle, alcançável só com `lang` alterado, e fica documentado.
- **CI:** a sessão B custa cerca de 60–90 s por SO. Os runners Windows e ARM já têm flakes (timeouts de 20 s, clique fora da viewport, reflow de 2 px), então só esperas por condição e frames estáveis. N-mp roda nos três SOs; se ficar instável no Windows, cai para duas conexões e o teste de dois processos fica em Linux e macOS.
- **Bundle:** a store, o estado e o catálogo entraram no chunk do canvas e custaram +10,1 kB gzip, contra os 3–4 KiB estimados. A mitigação prevista foi aplicada e foi além: a store inteira, o estado e o catálogo foram para um chunk lazy, e fica eager só o procurador (+2,62 kB gzip sobre a `main`, contando âncoras e botão Ajuda). Custo aceito: a decisão automática sai de 18 a 20 ms mais tarde na mediana (medido sem ponte), porque o chunk da store pode ainda estar chegando no `canvasReady`.
- **Observadores enquanto o tour está aberto:** custo de rAF e composição do anel no HD 520. Medição manual; não entra no gate.
- **Tailwind 4 e React Compiler:** uma classe `.felixo-onboarding-*` vence utilities com variante, e setState em effect ou leitura de ref ou relógio no render reprova o lint. Mitigação: U-css e o molde do FelixoSelect, com a escrita de estilo por ref em callback.
- **Divergências registradas:** do GUIA-ONBOARDING-E-AJUDA (sem overlay bloqueante, sem `animate-ping`, sem FAB, sem `hasSeen` booleano) e do "modais prendem foco" do System Design.
- **Rail:** o sétimo botão do grupo superior recortaria o alvo do último passo na altura mínima. Qualquer botão novo acima da Ajuda exige revisar.
- **Textos:** são rascunho. A checagem de rótulo (U-cat, SA1) pega divergência com a UI. O GUIA-USUARIO:344 ("menu Ferramentas (canto superior esquerdo)") e o empty state do MOTION.md:6 são corrigidos no mesmo PR.
- **Componentes compartilhados:** `SidebarSection` (usado também pelo chat) e `HardwareNotices` só ganham prop opcional ou atributo. O PR declara que nada em `features/chat` foi tocado.

## Ordem de commits

1. **Branch.** `feat/tutorial-canvas` a partir de `main` em `f42eb661` (feature grande → branch + PR).
2. **`docs(tutorial): plano do tutorial do canvas, da Ajuda e das novidades`**
   - Este arquivo vira `docs/projeto/PLANO-TUTORIAL-CANVAS.md`.
   - Linha no `docs/README.md`.
   - Entrada datada em `docs/projeto/IA.md` (só acréscimo).
   - No primeiro commit de código, o status passa a `em desenvolvimento.`.
3. **`feat(onboarding): catálogo versionado, textos pt-BR e state machine pura`**
   - `onboarding-catalog.ts`, `onboarding-messages.ts` e `onboarding-state.ts`.
   - Testes U-cat, U-msg e U-state (fuzz, migração, downgrade, gatilho canvas com fixture, propriedade de `appVersion`).
4. **`feat(electron): estado do tutorial no SQLite com compare-and-set e política de automação no main`**
   - `onboarding-state-repository.cjs`, `onboarding-ipc-handlers.cjs` e `onboarding-automation.cjs`.
   - Registro no `main.cjs`, ponte no `preload.cjs` e tipos no `vite-env.d.ts`.
   - Testes N-repo, N-mp, N-ipc (com contrato) e N-auto.
5. **`feat(onboarding): store com sinais de boot, marcador de primeiro boot e retomada por sessão`**
   - `onboarding-store.ts`, `onboarding-boot-signals.ts`, `onboarding-devtools.ts` e a chamada em `main.tsx`.
   - Testes U-store, U-prop e U-boot.
6. **`feat(canvas): âncoras estáveis do tutorial e obstáculos de posicionamento`**
   - `data-felixo-tour-anchor` em CanvasToolbar, SidebarSection, TerminalMenu e TerminalsPanel.
   - `data-felixo-tour-avoid` no CliSetupToast e no `NoticeToast` dos HardwareNotices.
   - Sem mudança de comportamento; o `canvas-smoke` continua verde.
7. **`feat(onboarding): posicionamento, resolução de alvo e regra de foco puros`**
   - `onboarding-layout.ts`.
   - Teste U-layout (matriz relacional com os obstáculos bottom-center e bottom-right).
8. **`feat(onboarding): tutorial não bloqueante no canvas`**
   - `OnboardingMount`, `OnboardingErrorBoundary`, `onboarding-ui-entry`, `OnboardingTourLayer`, `OnboardingTourCard` e `OnboardingNotice`.
   - Montagem no `CanvasView` e CSS (tokens de z, alto contraste, forced-colors, sem animação).
   - Testes U-ui, U-bound e U-css.
9. **`feat(onboarding): Ajuda no rail para reabrir o tutorial, ver novidades e redefinir`**
   - Botão no grupo superior e `OnboardingHelpMenu` com confirmação inline.
   - Markup em U-ui.
10. **`test(devtools): sonda de invocações IPC na instância de automação`**
    - `ipc-invoke-probe.cjs`, instalação condicional e `ipcProbe` no vm.
    - Teste N-probe.
11. **`test(smoke): cenários do tutorial no canvas-smoke`**
    - `canvas-smoke-onboarding.cjs` e geometria com N-geo.
    - `withDevtoolsSession(action, { env })`, SA0 depois de `checarMontagem`, SA1–SA10 e sessão B.
    - `ui-render-performance.cjs --onboarding` (manual).
12. **`docs(tutorial): guia do usuário, arquitetura, superfícies, checklist e registro`**
    - GUIA-USUARIO: seção "Tutorial e Ajuda", reinstall preserva o estado, correção da linha 344.
    - ARQUITETURA: store, canais, chave `onboarding.state` e política de automação.
    - LAYOUT-SUPERFICIES: card, anel, aviso e menu Ajuda como overlays que não reservam largura, fora de `splitHorizontalSpace`, e a escala de z.
    - GUIA-DESENVOLVEDOR: `FELIXO_DEVTOOLS_ONBOARDING`, falha forçada e como anunciar uma feature (catálogo + `CATALOG_HISTORY`).
    - MOTION.md: tour sem animação e correção do empty state.
    - README: capacidades.
    - RELEASE_CHECKLIST: leitor de tela real, janela visível com input real, dois processos, NSIS, macOS `activate`, escala de fonte do SO, HD 520.
    - `.claude/skills/rodar-app/SKILL.md`.
    - Medição do HD 520 em `docs/projeto/IA.md` e `POLITICA-PERFORMANCE.md`.
    - Plano com `Status: concluido.`.
13. **Validação antes do PR** (em `app/`):
    - `npm run build` (inclui `tsc -b`);
    - `npm run lint`;
    - `npm run test:frontend`;
    - `npm test`;
    - `npm run test:canvas-smoke`;
    - `npm run benchmark:bundle:check`;
    - bancada `--onboarding` no HD 520 com o Modo Performance ligado e desligado.

    O PR declara que nada em `features/chat` e em `App.tsx` foi tocado, e o corpo termina com a atribuição do Claude Code.
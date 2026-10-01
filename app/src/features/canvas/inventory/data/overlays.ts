import type { InventoryElement } from '../canvas-inventory-types'

/**
 * Overlays e avisos de outras features desenhados por cima do canvas: o
 * tutorial (montagem, anel, card, aviso de novidade e menu Ajuda), os avisos
 * das CLIs, da atualização, do hardware e dos links, as alças dos modais e a
 * tela de recuperação do renderer. Os de `features/canvas/components` (overlay
 * `isBusy`, aviso de layout) ficam com quem inventaria o canvas.
 */

const SMOKE_TUTORIAL = 'scripts/canvas-smoke-onboarding.cjs'
const SMOKE_LINKS = 'scripts/canvas-smoke-links.cjs'

const ONBOARDING_SQLITE = 'processo principal: SQLite, tabela settings, chave onboarding.state (compare-and-set via onboarding:write)'
const ONBOARDING_SESSAO = 'sessionStorage felixo:onboarding:sessao (tour e passo abertos, para retomar depois de um reload; apagado ao pular ou concluir)'

export const overlaySurfaces: InventoryElement[] = [
  {
    id: 'onboarding-montagem',
    name: 'Tutorial do canvas: montagem, decisão automática e região live',
    layer: 'overlay',
    owner: 'src/features/onboarding/OnboardingMount.tsx',
    states: {
      normal:
        'Canvas hidratado e fase "ocioso": só a região live (sr-only, role="status") existe, com a decisão automática em data-felixo-onboarding-decisao; nada visível.',
      loading:
        'Fase "carregando": a store chega num chunk próprio (preload na montagem) e a leitura de onboarding:read tem prazo de 4 s (ONBOARDING_READ_TIMEOUT_MS); decisão "carregando".',
      pending:
        'Tour aberto e canvas fora da tela (chat): canvasUnmounted passa o tour a foco "manter" e para a avaliação; ao voltar, o tour reaparece no mesmo passo sem puxar o foco.',
      empty:
        'Decisão "nada", "recuperado" ou "suprimido:*" (autoOpen falso na automação, tutorial já visto ou concluído): nada abre.',
      success:
        'Primeiro uso reivindicado (REIVINDICAR_INICIAL aplicado): o tour inicial abre sozinho com o foco no card (decisão "aberto"); reload com sessão → decisão "retomada" no mesmo passo.',
      disabled:
        'Persistência "sem-ponte" (dev:web, testes), "indisponivel" (leitura falhou ou passou do prazo, escrita recusada) ou "somente-leitura" (estado de versão mais nova): tudo em memória, nada gravado, sem abertura automática.',
      error:
        'Fase "desativado": a camada falhou no render ou o chunk não carregou; o OnboardingErrorBoundary devolve null, a store limpa a sessão e registra no QA Logger (escopo renderer:onboarding). Uma abertura nova (outro resetKey) tenta de novo.',
    },
    controls: [],
    persistence: [
      ONBOARDING_SQLITE,
      ONBOARDING_SESSAO,
      'localStorage felixo:onboarding:primeiro-boot (marcador de primeiro boot; removido depois da primeira leitura ou gravação com estado)',
      'sessionStorage felixo:onboarding:falha (só na instância devtools: força falha de render)',
    ],
    ipc: ['onboarding:read', 'onboarding:write', 'qa-logger:log'],
    dependsOn: [
      'onboardingStore (createOnboardingStoreProxy)',
      'useOnboardingSnapshot',
      'loadOnboardingUi',
      'OnboardingErrorBoundary',
      'createWindowOnboardingStore',
      'getOnboardingBootSignals',
    ],
    tests: [
      { file: 'src/features/onboarding/onboarding-store.test.ts' },
      { file: 'src/features/onboarding/onboarding-store-proxy.test.ts' },
      { file: 'src/features/onboarding/onboarding-store.property.test.ts' },
      { file: 'src/features/onboarding/onboarding-boundaries.test.ts' },
      { file: 'src/features/onboarding/onboarding-boot-signals.test.ts' },
      { file: 'src/features/onboarding/onboarding-state.test.ts' },
      { file: 'electron/services/onboarding-ipc-handlers.test.cjs' },
      { file: 'electron/services/storage/onboarding-state-repository.test.cjs' },
      { file: 'electron/services/storage/onboarding-state-multiprocess.test.cjs' },
      { file: 'electron/core/onboarding-automation.test.cjs' },
      { file: SMOKE_TUTORIAL, check: 'sa0' },
      { file: SMOKE_TUTORIAL, check: 'sa4' },
      { file: SMOKE_TUTORIAL, check: 'sa9' },
      { file: SMOKE_TUTORIAL, check: 'sa10' },
      { file: SMOKE_TUTORIAL, check: 'sb1' },
      { file: SMOKE_TUTORIAL, check: 'sb3sb4' },
      { file: SMOKE_TUTORIAL, check: 'sb7' },
    ],
    gaps: [
      {
        what: 'O primeiro uso real (abertura sozinha e gravação) só roda no smoke com FELIXO_DEVTOOLS_ONBOARDING=1; no app instalado de verdade ninguém viu a decisão automática.',
        risk: 'baixo',
        task: '3e891f95-497e-8148-b00e-f27e78767664',
      },
    ],
    overlap:
      'Logo depois da sidebar na árvore (ordem de Tab sidebar → tour → canvas), sem portal. A região live é sr-only e não ocupa espaço; o que aparece é da camada (anel z 54, card e aviso z 55).',
  },
  {
    id: 'onboarding-anel-e-camada',
    name: 'Tutorial do canvas: anel, posicionamento e cessão a diálogo modal',
    layer: 'overlay',
    owner: 'src/features/onboarding/OnboardingTourLayer.tsx',
    states: {
      normal:
        'Tour aberto: anel (outline de 2 px, pointer-events none) sobre o alvo do passo, contido na janela, e o card ao lado (computeCardPlacement). Alvo preferido fora de alcance: aponta a alternativa do catálogo e reconfere a cada 500 ms.',
      loading: 'Chunk preguiçoso da interface baixando (Suspense com fallback null): nada na tela.',
      pending:
        'Um [aria-modal="true"] está aberto (conferido a cada 250 ms e a cada focusin): card ou aviso ficam inert, a posição congela (placementFrozen) e o foco espera no OnboardingFocusHold (nokey); volta ao mesmo controle quando o diálogo fecha.',
      empty: 'Nenhum candidato a alvo resolvido: o anel some (sem data-visivel) e o card é posicionado sem alvo.',
      error:
        'Exceção no render (ou falhaForcada com sessionStorage felixo:onboarding:falha = render na instância devtools): o boundary derruba só o tutorial, o canvas continua hidratado.',
    },
    controls: [],
    persistence: [
      'nenhuma: top/left/width/max-height e data-modo são escritos no DOM pela ref, sem estado React por quadro',
      ONBOARDING_SESSAO,
    ],
    ipc: ['onboarding:write'],
    dependsOn: [
      'useOnboardingSnapshot',
      'useSurfacePlacement',
      'useYieldToModal',
      'computeCardPlacement',
      'computeRingRect',
      'resolveStepTarget',
      'OnboardingFocusHold',
    ],
    tests: [
      { file: 'src/features/onboarding/onboarding-layout.test.ts' },
      { file: 'src/features/onboarding/OnboardingUi.test.ts' },
      { file: 'src/features/onboarding/onboarding-css.test.ts' },
      { file: 'scripts/canvas-smoke-onboarding-geometry.test.cjs' },
      { file: SMOKE_TUTORIAL, check: 'sa3' },
      { file: SMOKE_TUTORIAL, check: 'conferirPerguntaSobreOTour' },
      { file: SMOKE_TUTORIAL, check: 'sa5' },
      { file: SMOKE_TUTORIAL, check: 'sa8' },
      { file: SMOKE_TUTORIAL, check: 'sa10' },
    ],
    gaps: [
      {
        what: 'A cessão ao diálogo depende de sondagem (MODAL_CHECK_MS = 250 ms) porque o AgentQuestionDialog não pega o foco nem prende o Tab; nesse intervalo só o hasOpenModal dos handlers impede o Enter de avançar o tour por baixo.',
        risk: 'médio',
        task: '3e891f95-497e-81b3-8857-da9125ff3f49',
      },
    ],
    overlap:
      'position: fixed fora de splitHorizontalSpace (não reserva largura). Anel em --felixo-z-onboarding-ring (54), card e aviso em --felixo-z-onboarding (55): acima dos toasts (50), abaixo dos diálogos (60), do menu de link (70) e do menu Ajuda/FelixoSelect (1000). Desvia de [data-felixo-tour-avoid] e [data-canvas-layout-warning]; sem lado livre, cobre o obstáculo (limitação declarada).',
  },
  {
    id: 'onboarding-card-tour',
    name: 'Card do tutorial (Pular, Voltar, Próximo/Concluir)',
    layer: 'overlay',
    owner: 'src/features/onboarding/OnboardingTourCard.tsx',
    states: {
      normal:
        'Passo n de N: título do tour, contador, título e corpo do passo e os botões Pular … Voltar, Próximo; role="dialog" com aria-modal="false" e nokey.',
      pending: 'Nasce invisível (CSS sem data-modo) até ser medido e posicionado no mesmo quadro.',
      disabled:
        'Passo 1: Voltar com aria-disabled="true" e sem onClick. Com um diálogo modal por cima: o card inteiro fica inert e os três handlers saem sem efeito (hasOpenModal).',
      success:
        'Último passo: o botão principal vira Concluir (nextAction "concluir"); concluído, a região live anuncia "Tutorial concluído. Reabra em Ajuda." e o foco volta ao botão Ajuda.',
    },
    controls: [
      {
        locator: 'data-felixo-onboarding-action="pular"',
        kind: 'button',
        trigger: 'clique, Enter ou Espaço (Esc no card faz o mesmo)',
        effect:
          'store.skip: fecha o card na hora, apaga a sessão, anuncia "fechado" e enfileira PULAR (status pulado, passo e anchorFallbacks) para onboarding:write; o foco volta a quem o tinha na abertura ou ao botão Ajuda.',
        failure:
          'Escrita recusada ou estado de versão mais nova: a store degrada para "indisponivel"/"somente-leitura", segue em memória e registra warn no QA Logger; a tela fecha do mesmo jeito.',
        disabledWhen: 'diálogo modal aberto (card inert)',
        test: { file: SMOKE_TUTORIAL, check: 'sb6' },
      },
      {
        locator: 'data-felixo-onboarding-action="voltar"',
        kind: 'button',
        trigger: 'clique, Enter ou Espaço',
        effect:
          'store.back: volta um passo (sessionStorage felixo:onboarding:sessao regravado, nada vai ao SQLite); o anel e o card migram para o alvo do passo anterior sem remontar, com o foco no botão.',
        failure: 'Sem falha própria: no passo 1 o botão fica aria-disabled e o clique não faz nada (o foco não se perde).',
        disabledWhen: 'passo 1 (aria-disabled) ou diálogo modal aberto',
        test: { file: SMOKE_TUTORIAL, check: 'sa8' },
      },
      {
        locator: 'data-felixo-onboarding-action={model.nextAction}',
        kind: 'button',
        trigger: 'clique, Enter ou Espaço',
        effect:
          'Próximo: store.next avança um passo (só sessionStorage). Concluir (último passo): store.complete apaga a sessão, anuncia a conclusão, enfileira CONCLUIR (status concluido, completedAt) e devolve o foco ao botão Ajuda.',
        failure:
          'Concluir com escrita recusada: segue concluído em memória, persistência "indisponivel" e warn no QA Logger; na próxima abertura o tutorial pode reaparecer como interrompido.',
        disabledWhen: 'diálogo modal aberto (card inert)',
        test: { file: SMOKE_TUTORIAL, check: 'sa1' },
      },
    ],
    persistence: [ONBOARDING_SQLITE, ONBOARDING_SESSAO],
    ipc: ['onboarding:write'],
    dependsOn: ['describeTourCard', 'OnboardingTourLayer (TourSurface)', 'onboardingStore'],
    tests: [
      { file: 'src/features/onboarding/OnboardingUi.test.ts' },
      { file: 'src/features/onboarding/onboarding-store.test.ts' },
      { file: SMOKE_TUTORIAL, check: 'sa1' },
      { file: SMOKE_TUTORIAL, check: 'sa2' },
      { file: SMOKE_TUTORIAL, check: 'sb2' },
    ],
    gaps: [
      {
        what: 'Leitor de tela e toque reais nunca foram usados no card: a árvore de acessibilidade é lida pelo CDP no SA4, não por NVDA/VoiceOver.',
        risk: 'baixo',
        task: '3e891f95-497e-8148-b00e-f27e78767664',
      },
      {
        what: 'O aviso "link não abriu" (LinkChooserHost, z 70, embaixo no centro) não é [data-felixo-tour-avoid]: em viewport compacto o card vira folha na borda de baixo e o aviso cobre o rodapé com Pular/Voltar/Próximo. Nenhum teste junta os dois.',
        risk: 'médio',
        task: '3ec91f95-497e-8112-82f9-fd1b86e3ec7d',
      },
    ],
    overlap:
      'fixed, z 55, min(22rem, 100vw − 24px), ancorado ao lado do alvo a 10 px dele e a 12 px da borda; em viewport compacto vira folha de largura cheia. Fica inert sob diálogos (60). Coberto pelo menu e pelo aviso de link (70) e pelo menu Ajuda (1000).',
  },
  {
    id: 'onboarding-aviso-novidade',
    name: 'Aviso de novidade do tutorial (Ver, Agora não)',
    layer: 'overlay',
    owner: 'src/features/onboarding/OnboardingNotice.tsx',
    states: {
      normal:
        'Fase "aviso": role="region" ancorada à direita do botão Ajuda com o título da novidade, Ver e Agora não; sem foco automático e sem timer (fica até uma ação, Esc nele ou abrir a Ajuda).',
      pending: 'Nasce invisível até o posicionamento; com um tour já na tela a novidade espera o tour fechar.',
      disabled: 'Diálogo modal aberto: o aviso fica inert no mesmo lugar e os handlers saem sem efeito.',
    },
    controls: [
      {
        locator: 'data-felixo-onboarding-action="ver"',
        kind: 'button',
        effect:
          'store.viewNotice → open(tourId, "novidade"): o aviso dá lugar ao mini-tour da feature com o foco no card; ABRIR enfileirado para onboarding:write.',
        failure: 'Escrita recusada: o mini-tour abre em memória, persistência "indisponivel" e warn no QA Logger.',
        disabledWhen: 'diálogo modal aberto (aviso inert)',
        test: { file: SMOKE_TUTORIAL, check: 'sb5' },
      },
      {
        locator: 'data-felixo-onboarding-action="agora-nao"',
        kind: 'button',
        trigger: 'clique, ou Esc com o foco no aviso',
        effect:
          'store.dismissNotice: fase volta a "ocioso" sem gravar nada (o anúncio já foi gravado ao aparecer); a novidade fica "Novo" no menu Ajuda e não volta sozinha. O foco volta a quem o tinha.',
        failure: 'Sem falha própria (estado da sessão).',
        disabledWhen: 'diálogo modal aberto (aviso inert)',
        test: { file: SMOKE_TUTORIAL, check: 'sb6' },
      },
    ],
    persistence: [
      `${ONBOARDING_SQLITE}: announcedAt gravado ao anunciar (ANUNCIAR), seenAt ao abrir pelo Ver`,
    ],
    ipc: ['onboarding:write'],
    dependsOn: ['describeNotice', 'OnboardingTourLayer (NoticeSurface)', 'onboardingStore'],
    tests: [
      { file: 'src/features/onboarding/OnboardingUi.test.ts' },
      { file: 'src/features/onboarding/onboarding-store.test.ts' },
      { file: SMOKE_TUTORIAL, check: 'sb5' },
      { file: SMOKE_TUTORIAL, check: 'sb6' },
    ],
    gaps: [
      {
        what: 'O aviso só existe para features do catálogo de novidades; a cadeia de contas ainda não está lá, então ninguém é avisado dela.',
        risk: 'baixo',
        task: '3e991f95-497e-817d-b6a4-c2c1825b3afc',
      },
    ],
    overlap:
      'fixed, z 55, min(18rem, 100vw − 24px), ancorado à direita do botão Ajuda pelo mesmo cálculo do card e desviando dos mesmos obstáculos. Abrir a Ajuda dispensa o aviso, então ele não disputa lugar com o menu.',
  },
  {
    id: 'onboarding-menu-ajuda',
    name: 'Menu Ajuda (tutorial, novidades e Redefinir tutoriais)',
    layer: 'overlay',
    owner: 'src/features/onboarding/OnboardingHelpMenu.tsx',
    states: {
      normal:
        'Aberto pelo botão Ajuda do rail: FelixoPopoverSurface (portal) à direita do botão, role="group", com o estado do tutorial e a ação certa (Iniciar, Continuar do passo n, Recomeçar, Rever), as novidades e "Redefinir tutoriais".',
      loading: 'Chunk preguiçoso carregando (Suspense com fallback null) e visibility hidden até data-posicionado.',
      empty: 'Seção Novidades sem itens: mostra o texto ajuda.novidades.vazio.',
      pending: 'Confirmação de redefinir na própria tela (confirming): pergunta, Confirmar e Cancelar, com o foco em Cancelar.',
      disabled:
        'Novidade "indisponivel" neste ambiente: item sem botão. Persistência indisponível, somente leitura ou sem ponte: nota ajuda.sem-persistencia no rodapé (as ações seguem em memória).',
      error:
        'Falha no render ou no chunk: o OnboardingErrorBoundary do CanvasToolbar (resetKey = sessão do menu) devolve null e a store desativa o tutorial na sessão.',
    },
    controls: [
      {
        locator: 'data-felixo-onboarding-action={action.id}',
        kind: 'button',
        effect:
          'Fecha o menu (foco no botão Ajuda) e, no quadro seguinte, store.open(tourId, "ajuda", { stepId }): o card abre no passo (Continuar do passo n reabre exatamente onde parou), sessão gravada e ABRIR enfileirado para onboarding:write. Na seção Novidades, Ver abre o mini-tour.',
        failure:
          'Tour sem nenhum passo visível (capabilities indisponíveis): showTour devolve false e nada abre, sem aviso, com o menu já fechado. Escrita recusada: abre em memória e registra warn no QA Logger.',
        test: { file: SMOKE_TUTORIAL, check: 'clicarAcaoDoTutorial' },
      },
      {
        locator: 'data-felixo-onboarding-action="confirmar-redefinir"',
        kind: 'button',
        effect:
          'Fecha o menu e, no quadro seguinte, store.reset(): REDEFINIR grava resetAt preservando knownFeatures e o tour inicial abre no passo 1 com o foco no card.',
        failure: 'Escrita recusada: o tour abre do mesmo jeito em memória, persistência "indisponivel" e warn no QA Logger.',
        disabledWhen: 'só existe depois de "Redefinir tutoriais" (confirming)',
        test: { file: SMOKE_TUTORIAL, check: 'sb8' },
      },
      {
        locator: 'data-felixo-onboarding-action="cancelar-redefinir"',
        kind: 'button',
        effect: 'confirming volta a falso: some a pergunta, volta "Redefinir tutoriais" e o foco vai para ele no quadro seguinte; nada gravado.',
        failure: 'Sem falha própria (estado local).',
        disabledWhen: 'só existe durante a confirmação',
      },
      {
        locator: 'data-felixo-onboarding-action="redefinir"',
        kind: 'button',
        effect: 'Pede confirmação na própria tela (nunca window.confirm): mostra a pergunta com Confirmar e Cancelar e leva o foco a Cancelar; nada gravado ainda.',
        failure: 'Sem falha própria (estado local).',
        disabledWhen: 'some enquanto a confirmação está na tela',
        test: { file: SMOKE_TUTORIAL, check: 'sb8' },
      },
    ],
    persistence: [ONBOARDING_SQLITE, ONBOARDING_SESSAO, 'confirmação de redefinir: nenhuma (estado do componente)'],
    ipc: ['onboarding:write'],
    dependsOn: ['useOnboardingSnapshot', 'describeHelpMenu', 'helpMenuKeyAction', 'FelixoPopoverSurface', 'useHelpMenu (CanvasToolbar)'],
    tests: [
      { file: 'src/features/onboarding/OnboardingUi.test.ts' },
      { file: 'src/features/onboarding/onboarding-store.test.ts' },
      { file: SMOKE_TUTORIAL, check: 'sa1' },
      { file: SMOKE_TUTORIAL, check: 'conferirTecladoDoMenuAjuda' },
      { file: SMOKE_TUTORIAL, check: 'sb8' },
    ],
    gaps: [
      {
        what: 'Cancelar da confirmação de redefinir nunca é clicado: o SB8 só confere que o foco chega nele e segue para Confirmar.',
        risk: 'baixo',
        task: '3ec91f95-497e-81f7-8b12-c5c252d020c7',
      },
      {
        what: 'Falha de render do menu (CanvasToolbar.tsx:276-281): o boundary devolve null mas help.open continua verdadeiro, então o botão Ajuda fica aria-expanded="true" sem menu e o clique fora não fecha (o ouvinte era do menu); só um segundo clique na Ajuda resolve.',
        risk: 'baixo',
        task: '3ec91f95-497e-8197-a218-ef49c302013d',
      },
      {
        what: 'O SA1 (percurso manual pela Ajuda) reprova no Windows e no macOS por um laço de canvas:save, então o percurso não é conferido nesses sistemas.',
        risk: 'médio',
        task: '3ea91f95-497e-812a-8c6d-fcc953edc59b',
      },
    ],
    overlap:
      'Portal no fim do body com .felixo-popover-surface (z 1000), à direita do botão Ajuda e contido na janela (max-height = janela − 16 px). Fica acima de tudo, inclusive dos diálogos (60); Esc, Tab para fora e clique fora fecham.',
  },
  {
    id: 'cli-setup-indicador',
    name: 'Indicador da instalação das CLIs no rodapé da sidebar',
    layer: 'chrome',
    owner: 'src/features/setup/CliSetupNotice.tsx',
    states: {
      normal: 'Estado "idle" ou "disabled" (app do código-fonte): nenhum indicador.',
      loading: 'Estado "checking": "Verificando CLIs…" com o ícone girando, como rótulo (não é botão).',
      pending: 'Estado "installing": rótulo com o andamento da fila, como rótulo (não é botão).',
      success: 'Estado "done": CheckCircle2 e o resumo; o detalhe fica no title.',
      error: 'Estado "error": vira botão com AlertTriangle, a descrição no title e "Clique para tentar instalar de novo."',
      disabled:
        'Sidebar recolhida: o rodapé fica aria-hidden e inert. O rodapé de status só é desenhado com a versão do app ou o indicador de atualização visível (deveMostrarRodapeDeStatus), por decisão registrada em toolbar-status.ts.',
    },
    controls: [
      {
        locator: 'Clique para tentar instalar de novo.',
        kind: 'button',
        effect:
          'retry() → window.felixo.cliSetup.retry() → clis:retry-setup: o processo principal roda run("manual") e o novo status chega por clis:setup-status (indicador e aviso passam a "installing").',
        failure:
          'Erro engolido: o retorno é descartado (void). Com a instalação automática desligada o main devolve { ok: false } sem emitir status e o clique não muda nada; exceção vira unhandledrejection só no QA Logger. Lacuna registrada no aviso das CLIs.',
        disabledWhen: 'só é botão no estado "error" (canRetry)',
      },
    ],
    persistence: ['processo principal: estado das tentativas de instalação (arquivo de estado do cli-auto-install em userData)'],
    ipc: ['clis:get-setup-status', 'clis:setup-status', 'clis:retry-setup'],
    dependsOn: ['useCliSetupStatus', 'presentCliSetupStatus', 'deveMostrarRodapeDeStatus (CanvasToolbar)'],
    tests: [
      { file: 'src/features/setup/cli-setup-presentation.test.ts' },
      { file: 'src/features/canvas/components/toolbar-status.test.ts' },
      { file: 'electron/services/cli-auto-install.test.cjs' },
    ],
    gaps: [
      {
        what: 'Nenhum smoke mostra o indicador: fora do app empacotado a instalação automática é "disabled" e tudo fica oculto.',
        risk: 'médio',
        task: '3e691f95-497e-81c8-ba05-c3074dc036f0',
      },
    ],
    overlap: 'No rodapé da sidebar (z 26), coluna de 288 px; o rótulo é truncado e não cobre o canvas.',
  },
  {
    id: 'cli-setup-aviso',
    name: 'Aviso flutuante da instalação das CLIs',
    layer: 'overlay',
    owner: 'src/features/setup/CliSetupNotice.tsx',
    states: {
      normal: 'Sem notícia ("idle", "disabled", "checking") ou sem ponte window.felixo.cliSetup: nada aparece.',
      pending: 'Estado "installing": título, descrição e barra role="progressbar" com o progresso; fica até dispensar.',
      success: 'Estado "done": CheckCircle2 e some sozinho em 6 s (dismissedKey = noticeKey).',
      error: 'Estado "error": AlertTriangle e as ações Ver diagnóstico, Tentar de novo e Depois; fica até dispensar.',
      empty: 'Dispensado (dismissedKey igual à chave atual): some até chegar um resultado com outra chave.',
      loading: 'Diagnóstico rodando: botão "Diagnosticando…" desabilitado; o relatório anterior continua na tela.',
    },
    controls: [
      {
        locator: 'aria-label="Dispensar aviso da instalação das CLIs"',
        kind: 'button',
        effect: 'dismiss(): guarda a chave do aviso atual e o aviso some; volta quando o status troca de assunto (resultado novo).',
        failure: 'Sem falha própria; dispensar o andamento também esconde o andamento de uma nova tentativa (lacuna NOVA:bug-cli-aviso-andamento-dispensado).',
      },
      {
        locator: 'onClick={diagnosis.run}',
        kind: 'button',
        effect:
          'useCliDiagnosis.run → requestCliDiagnosis → clis:diagnose (só leitura): a lista por CLI e o rodapé com "Copiar texto para o suporte" entram acima dos botões; o rótulo vira "Diagnosticar de novo".',
        failure: 'Falha ou exceção da IPC vira mensagem role="alert" no rodapé do diagnóstico; resposta de um pedido descartado é ignorada.',
        disabledWhen: 'diagnóstico rodando; some sem window.felixo.cliSetup.diagnose',
      },
      {
        locator: 'onClick={onRetry}',
        kind: 'button',
        effect: 'Mesmo retry() do indicador: clis:retry-setup e o aviso passa a "installing" quando o status chega por clis:setup-status.',
        failure:
          'Erro engolido: retorno descartado (void); { ok: false } com a instalação desligada não muda a tela e exceção vira unhandledrejection só no QA Logger.',
        disabledWhen: 'só no estado "error"',
      },
      {
        locator: 'onClick={onDismiss}',
        kind: 'button',
        effect: 'Depois: mesmo dismiss() do ×, o aviso de falha some até um resultado novo.',
        failure: 'Sem falha própria (estado local).',
        disabledWhen: 'só no estado "error"',
      },
    ],
    persistence: [
      'dispensa: nenhuma (estado do hook; volta a aparecer depois de reload)',
      'processo principal: estado das tentativas de instalação (arquivo de estado do cli-auto-install em userData)',
    ],
    ipc: ['clis:get-setup-status', 'clis:setup-status', 'clis:retry-setup', 'clis:diagnose'],
    dependsOn: ['useCliSetupStatus', 'useCliDiagnosis', 'presentCliSetupStatus', 'cliSetupNoticeKey', 'CliDiagnosisList', 'CliDiagnosisFooter'],
    tests: [
      { file: 'src/features/setup/cli-setup-presentation.test.ts' },
      { file: 'src/features/setup/cli-diagnosis.test.ts' },
      { file: 'src/features/setup/setup-tailwind-classes.test.ts' },
      { file: 'electron/services/cli-auto-install.test.cjs' },
      { file: 'src/features/onboarding/onboarding-layout.test.ts' },
    ],
    gaps: [
      {
        what: 'Aviso, retry e diagnóstico nunca vistos rodando: só aparecem no app empacotado (FELIXO_AUTO_INSTALL_CLIS ou isPackaged) e nenhum teste renderiza ou clica o aviso.',
        risk: 'médio',
        task: '3e691f95-497e-81c8-ba05-c3074dc036f0',
      },
      {
        what: 'Dispensar o andamento esconde o andamento da nova tentativa: a chave de "installing"/"checking" é sempre "em-andamento" (cli-setup-presentation.ts:154) e dismissed compara só a chave (useCliSetupStatus.ts:92). Quem dispensou a primeira instalação e clica "Tentar de novo" vê o aviso sumir sem progresso.',
        risk: 'médio',
        task: '3ec91f95-497e-8110-b363-cfade2b68b7a',
      },
      {
        what: 'Erro engolido no retry (useCliSetupStatus.ts:88-90) e no getStatus inicial sem catch (useCliSetupStatus.ts:45-49): { ok: false } é descartado e a rejeição vira unhandledrejection só no QA Logger; a pessoa não sabe que a nova tentativa não começou.',
        risk: 'baixo',
        task: '3ec91f95-497e-8110-b363-cfade2b68b7a',
      },
      {
        what: 'Em janelas com menos de 1024 px de largura o aviso (w-80, canto direito) e o NoticeToast (22rem, centro) se sobrepõem; os dois são z 50 e o NoticeToast, montado depois no App, cobre os botões deste. Os dois podem aparecer juntos na primeira abertura e nenhum teste junta os dois na tela.',
        risk: 'médio',
        task: '3ec91f95-497e-8112-82f9-fd1b86e3ec7d',
      },
      {
        what: 'Durante a instalação (minutos) o aviso cobre o canto inferior direito da gaveta do terminal e do Mini Map (z 50 sobre 20/30); não há medição disso.',
        risk: 'médio',
        task: '3ec91f95-497e-8112-82f9-fd1b86e3ec7d',
      },
    ],
    overlap:
      'fixed bottom-4 right-4, z 50, w-80, cresce para cima com o diagnóstico; marcado [data-felixo-tour-avoid] (o card do tour desvia). Acima da dock, painéis e gaveta (20/30) e da sidebar (26); abaixo do anel/card (54/55), diálogos (60), menu e aviso de link (70) e menu Ajuda (1000).',
  },
  {
    id: 'cli-diagnostico',
    name: 'Diagnóstico das CLIs dentro do aviso de falha',
    layer: 'overlay',
    owner: 'src/features/setup/CliDiagnosisView.tsx',
    states: {
      normal: 'Não aparece enquanto o diagnóstico não foi pedido no aviso de falha das CLIs.',
      loading: '"Diagnosticando as CLIs…" (role="status") até o primeiro relatório.',
      success: 'Lista por CLI com a causa e a próxima ação, e o botão de copiar o texto de suporte.',
      error: 'Mensagem do erro em role="alert".',
    },
    controls: [
      {
        locator: 'Copiar texto para o suporte',
        kind: 'button',
        effect:
          'navigator.clipboard.writeText(supportText) (texto já minimizado pelo main, sem usuário, URL ou segredo); o rótulo vira "Texto copiado" por alguns segundos e a região status anuncia.',
        failure: 'Área de transferência recusada: o rótulo vira "Não foi possível copiar" (falha visível, não engolida).',
        disabledWhen: 'só existe com supportText no relatório',
      },
    ],
    persistence: ['nenhuma'],
    ipc: [],
    dependsOn: ['useCliDiagnosis (CliSetupNotice)', 'describeCliDiagnosis'],
    tests: [
      { file: 'src/features/setup/CliDiagnosisView.test.ts' },
      { file: 'src/features/setup/cli-diagnosis.test.ts' },
    ],
    gaps: [
      {
        what: 'O teste só renderiza o markup; ninguém clicou em copiar no aviso das CLIs do app real. O mesmo componente também aparece no ModelManagerModal do chat legado.',
        risk: 'baixo',
        task: '3e291f95-497e-8109-8851-e4ff2193c4db',
      },
    ],
    overlap: 'Dentro do aviso das CLIs (z 50), acima dos botões: o aviso cresce para cima a partir do canto inferior direito.',
  },
  {
    id: 'atualizacao-indicador',
    name: 'Indicador de atualização, Verificar atualizações e versão no rodapé da sidebar',
    layer: 'chrome',
    owner: 'src/features/updates/UpdateNotice.tsx',
    states: {
      normal: 'Estado "idle": só a versão (AppVersionBadge) e o botão "Verificar atualizações" (canCheck).',
      loading: 'Estado "checking": "Verificando…" como rótulo, sem ação.',
      pending: 'Estados "available"/"downloading": "Versão X baixando" ou "Baixando n%" com o ícone girando, sem ação.',
      success: 'Estado "downloaded": vira botão "Versão X pronta" (title "Reiniciar agora para aplicar a atualização").',
      error: 'Estado "error": vira botão "Falha ao atualizar" com a mensagem no title e "Clique para verificar de novo."',
      disabled: 'Estado "disabled" (app do código-fonte): nada. Sidebar recolhida: rodapé aria-hidden e inert.',
      empty: 'Sem versão (fora do Electron ou IPC sem resposta) e sem indicador: o rodapé de status não é desenhado.',
    },
    controls: [
      {
        locator: 'onClick={action.onClick}',
        kind: 'button',
        effect:
          '"downloaded": onInstall → updates.install() → updates:install → autoUpdater.quitAndInstall(false, true): o app fecha e reabre na versão nova. "error": onRetry → updates.check() → updates:check → status "checking" por updates:status.',
        failure:
          'Erro engolido na instalação: retorno descartado (void); fora de "downloaded" o main devolve { ok: false } sem mudar a tela e uma exceção de quitAndInstall vira unhandledrejection só no QA Logger. Na verificação, a falha volta como status "error" (visível).',
        disabledWhen: 'só é botão com canInstall ou canRetry',
      },
      {
        locator: 'Verificar atualizações',
        kind: 'button',
        effect:
          'onCheck → updates.check() → updates:check → autoUpdater.checkForUpdates; o evento checking-for-update emite status por updates:status e o botão some (canCheck falso).',
        failure:
          'Falha da verificação vira status "error" emitido por updates:status (indicador "Falha ao atualizar"); fora do app empacotado o main responde "disabled" e tudo some.',
        disabledWhen: 'só no estado "idle" (canCheck)',
      },
    ],
    persistence: ['nenhuma no renderer; o download fica com o electron-updater no processo principal'],
    ipc: ['updates:get-status', 'updates:status', 'updates:check', 'updates:install', 'app:get-version'],
    dependsOn: ['useUpdateStatus (CanvasView)', 'useAppVersion (CanvasToolbar)', 'presentUpdateStatus', 'deveMostrarRodapeDeStatus'],
    tests: [
      { file: 'src/features/updates/update-presentation.test.ts' },
      { file: 'src/features/canvas/components/toolbar-status.test.ts' },
    ],
    gaps: [
      {
        what: 'Nenhum teste renderiza ou clica o indicador e electron/services/auto-updater.cjs não tem teste; o ciclo verificar → baixar → reiniciar só é visto no app publicado.',
        risk: 'médio',
        task: '3ec91f95-497e-81f7-8b12-c5c252d020c7',
      },
      {
        what: 'Erro engolido em useUpdateStatus.ts:68 (install sem tratar { ok: false } nem a rejeição) e :41 (getStatus inicial sem catch): a pessoa clica "Versão X pronta" e, se o main recusar, nada acontece na tela.',
        risk: 'baixo',
        task: '3ec91f95-497e-8110-b363-cfade2b68b7a',
      },
    ],
    overlap: 'No rodapé da sidebar (z 26), coluna de 288 px; rótulo truncado, nada sobre o canvas. O aviso flutuante de atualização foi para as notificações do canvas (CanvasView).',
  },
  {
    id: 'link-menu-destino',
    name: 'Menu "para onde abrir este link"',
    layer: 'overlay',
    owner: 'src/features/shared/links/LinkChooserHost.tsx',
    states: {
      normal:
        'Pedido no link-chooser-store (terminal, Markdown ou Página Web): menu no ponto do link com o resumo do destino ("Leva a"/"E-mail para", URL cortada em 600 caracteres) e os itens Abrir no navegador, Abrir como Página Web e Copiar link; foco no primeiro item.',
      pending: 'Medido fora da tela (visibility hidden) até placeLinkChooser devolver a posição.',
      denied: 'Link recusado pela política: "Link recusado" com o motivo e só "Copiar link".',
      disabled: 'Sem canvas montado (tela do chat): getWebpageOpener é null e "Abrir como Página Web" não aparece.',
      success: 'Cópia feita: "Link copiado" flutuante por 1,4 s (z 70) e anúncio na região status.',
    },
    controls: [
      {
        locator: 'onClick={() => choose(entry.choice)}',
        kind: 'button',
        effect:
          'runLinkChoice reclassifica e executa: Abrir no navegador → window.open(url, "_blank") e o main aplica a política e entrega ao sistema; Abrir como Página Web → cria o bloco perto do bloco de origem, a câmera voa e o foco vai ao bloco; Copiar → clipboard + "Link copiado". O menu fecha e o foco volta a quem abriu.',
        failure:
          'Abertura recusada ou sem navegador: o main emite external-links:open-failed e aparece o aviso "link não abriu". Erro engolido na cópia: clipboard recusado cai em () => undefined, o menu já fechou e nada avisa.',
        test: { file: SMOKE_LINKS, check: 'markdownEscolhas' },
      },
      {
        locator: 'role="menuitem"',
        kind: 'role',
        trigger: 'teclado: setas, Home e End movem o foco; Enter ou Espaço ativam o item; Esc ou Tab fecham',
        effect:
          'linkChooserKeyAction: o foco anda entre os itens (tabIndex itinerante) na hora da tecla; Esc/Tab fecham sem escolha e devolvem o foco; nenhuma tecla chega aos atalhos do canvas (stopPropagation).',
        failure:
          'Sem falha própria; Enter/Espaço repetidos de uma tecla segurada são ignorados. O menu também fecha com roda, resize, clique fora, blur da janela ou foco que sai para outro elemento.',
        test: { file: SMOKE_LINKS, check: 'markdownComTeclado' },
      },
    ],
    persistence: ['nenhuma (pedido em memória no link-chooser-store); "Abrir como Página Web" cria um bloco que vai para o canvas salvo'],
    ipc: ['external-links:open-failed'],
    dependsOn: [
      'link-chooser-store (subscribeLinkChooser, closeLinkChooser, getWebpageOpener)',
      'describeLinkDestination',
      'linkChoiceEntries',
      'runLinkChoice',
      'placeLinkChooser',
      'linkChooserKeyAction',
    ],
    tests: [
      { file: 'src/features/shared/links/link-destination.test.ts' },
      { file: 'src/features/shared/links/link-chooser-menu.test.ts' },
      { file: 'src/features/shared/links/link-chooser-store.test.ts' },
      { file: 'src/features/shared/links/link-anchor.test.ts' },
      { file: 'electron/services/external-links.test.cjs' },
      { file: SMOKE_LINKS, check: 'markdownComMouse' },
      { file: SMOKE_LINKS, check: 'markdownRecusadoEEmail' },
      { file: SMOKE_LINKS, check: 'terminalTexto' },
      { file: SMOKE_LINKS, check: 'paginaWebMenuDeLink' },
    ],
    gaps: [
      {
        what: 'Erro engolido na cópia (LinkChooserHost.tsx:326-329 no menu e :164-170 no aviso de falha): clipboard recusado cai em () => undefined, sem aviso nem log; no menu ele já fechou, no aviso nada muda.',
        risk: 'médio',
        task: '3ec91f95-497e-8110-b363-cfade2b68b7a',
      },
      {
        what: 'Links enviados pelos agentes ainda não abrem no app real e a causa não foi achada.',
        risk: 'alto',
        task: '3db91f95-497e-81a7-9554-c9cffa821c63',
      },
      {
        what: 'A abertura no navegador do sistema só roda no smoke com o shell falso (FELIXO_DEVTOOLS_SHELL_OPEN=falha); no app instalado do Windows e do macOS não foi conferida.',
        risk: 'médio',
        task: '3ea91f95-497e-8117-8506-d4abe67709ff',
      },
      {
        what: 'Menu nunca usado com leitor de tela e tela sensível ao toque reais (o smoke simula toque e lê a árvore pelo CDP).',
        risk: 'baixo',
        task: '3ea91f95-497e-812b-a108-fb89c94fa528',
      },
      {
        what: 'O foco no bloco Página Web que nasce fora da tela (focusCanvasNodeAfterCamera) não é conferido no smoke.',
        risk: 'baixo',
        task: '3ea91f95-497e-81c4-84ff-f279d9ba4683',
      },
    ],
    overlap:
      'Portal no body, fixed, z 70, w-72, max-height da janela − 16 px: acima dos diálogos (60), do card do tour (55) e dos toasts (50), abaixo do menu Ajuda e FelixoSelect (1000). Camada flutuante (data-felixo-floating-layer): clicar nele não fecha a gaveta do terminal de onde o link veio.',
  },
  {
    id: 'link-aviso-falha',
    name: 'Aviso "o link não abriu"',
    layer: 'overlay',
    owner: 'src/features/shared/links/LinkChooserHost.tsx',
    states: {
      normal: 'Oculto até o main emitir external-links:open-failed.',
      error:
        'Política recusou ou o sistema não entregou a um navegador: role="alert" embaixo no centro com título, detalhe e o endereço (invisíveis à mostra), sem roubar o foco e sem timer; um aviso novo substitui o anterior (key nova).',
      success: 'Copiado: "Link copiado" aparece acima e o aviso fecha devolvendo o foco.',
    },
    controls: [
      {
        locator: 'aria-label="Fechar aviso"',
        kind: 'button',
        trigger: 'clique, ou Esc com o foco no aviso',
        effect: 'setFailure(null): o aviso some e, se o foco estava nele ou no body, volta a quem o tinha quando o aviso apareceu.',
        failure: 'Sem falha própria (estado local).',
        test: { file: SMOKE_LINKS, check: 'markdownEscolhas' },
      },
      {
        locator: 'onClick={copy}',
        kind: 'button',
        effect: 'clipboard.writeText(notice.copyText): "Link copiado" acima do aviso, o aviso fecha e o foco volta a quem o tinha.',
        failure: 'Erro engolido: clipboard recusado cai em () => undefined e o aviso continua aberto sem dizer que a cópia falhou (lacuna no menu de links).',
        test: { file: SMOKE_LINKS, check: 'markdownEscolhas' },
      },
    ],
    persistence: ['nenhuma'],
    ipc: ['external-links:open-failed'],
    dependsOn: ['parseLinkOpenFailure', 'describeLinkOpenFailure', 'revealHiddenUrlCharacters'],
    tests: [
      { file: 'src/features/shared/links/link-open-failure.test.ts' },
      { file: 'electron/services/external-links.test.cjs' },
      { file: SMOKE_LINKS, check: 'markdownEscolhas' },
    ],
    gaps: [
      {
        what: 'Fixed bottom-6 no centro, z 70, sem [data-felixo-tour-avoid]: cobre o NoticeToast (z 50, também embaixo no centro) e os botões dele, e o card do tour não desvia dele. Nenhum teste põe o aviso junto com o NoticeToast ou com o card.',
        risk: 'médio',
        task: '3ec91f95-497e-8112-82f9-fd1b86e3ec7d',
      },
    ],
    overlap:
      'Portal no body, fixed bottom-6 left-1/2, z 70, min(22rem, 100vw − 2rem). data-felixo-floating-layer e data-felixo-focus-transient: clicar nele não é "clicar fora" da gaveta e o foco nele não substitui o anterior.',
  },
  {
    id: 'hardware-avisos',
    name: 'Avisos de hardware (volta da placa de vídeo e sugestão do Modo Performance)',
    layer: 'overlay',
    owner: 'src/features/shared/hardware/HardwareNotices.tsx',
    states: {
      normal: 'Sem volta automática da placa de vídeo e sem sugestão pendente: nenhum aviso.',
      error:
        'gpu.fallback no gpu-status-store (o main voltou a GPU para Automático): "Placa de vídeo voltou para Automático" só com Entendi e ×; tem prioridade, um aviso de cada vez.',
      pending:
        'Perfil com poucas CPUs (shouldSuggestPerformanceMode), Modo Performance desligado e sem resposta salva: "Ligar o Modo Performance?" com Ligar, Agora não e ×.',
      disabled:
        'Instância de automação sem FELIXO_DEVTOOLS_HARDWARE_NOTICES=1 (o main não sugere), sem ponte, ou perfil ainda não lido: nada aparece.',
      success: 'Modo Performance ligado: <html data-performance-mode="on"> e o aviso some.',
    },
    controls: [
      {
        locator: 'onClick={onPrimary}',
        kind: 'button',
        effect:
          'Ligar Modo Performance: saveSuggestionAnswered (localStorage felixo-ai-core.performance-suggestion = answered) e setPerformanceMode(true); o PerformanceModeProvider grava felixo-ai-core.performance-mode = on e põe data-performance-mode="on" no <html>; o aviso some.',
        failure: 'Sem localStorage a resposta e o modo valem só nesta sessão (catch silencioso intencional).',
        disabledWhen: 'só existe na sugestão do Modo Performance (o aviso da GPU não tem ação principal)',
      },
      {
        locator: '{secondaryLabel}',
        kind: 'button',
        effect:
          'Placa de vídeo, "Entendi": acknowledgeGpuFallback → graphics:acknowledge-gpu-fallback zera o fallback em userData/gpu-preference.json e o aviso some de todas as telas (Configurações inclusive). Sugestão, "Agora não": só grava a resposta; o modo continua desligado.',
        failure:
          'Erro engolido na placa de vídeo: se a IPC falhar, o finally some com o aviso mesmo assim, a rejeição de void acknowledgeGpuFallback() vira unhandledrejection só no QA Logger, o fallback continua gravado e o aviso volta na próxima abertura.',
        test: { file: SMOKE_TUTORIAL, check: 'sb2' },
      },
      {
        locator: 'aria-label={dismissLabel}',
        kind: 'button',
        effect: '× com rótulo próprio ("Dispensar aviso da placa de vídeo" ou "Dispensar sugestão do Modo Performance"): mesmo onSecondary do botão secundário.',
        failure: 'A mesma do botão secundário (na placa de vídeo, rejeição solta e aviso que volta).',
      },
    ],
    persistence: [
      'localStorage felixo-ai-core.performance-suggestion (resposta à sugestão)',
      'localStorage felixo-ai-core.performance-mode (Modo Performance ligado)',
      'processo principal: userData/gpu-preference.json (fallback reconhecido)',
    ],
    ipc: ['hardware:get-profile', 'graphics:get-config', 'graphics:gpu-preference-changed', 'graphics:acknowledge-gpu-fallback'],
    dependsOn: [
      'useGpuStatus (gpu-status-store)',
      'usePerformanceMode (PerformanceModeContext)',
      'shouldSuggestPerformanceMode',
      'loadSuggestionAnswered',
      'saveSuggestionAnswered',
      'NoticeToast',
    ],
    tests: [
      { file: 'src/features/shared/performance/performance-suggestion.test.ts' },
      { file: 'src/features/shared/graphics/gpu-status-store.test.ts' },
      { file: 'electron/core/hardware-profile.test.cjs' },
      { file: 'electron/core/gpu-preference.test.cjs' },
      { file: SMOKE_TUTORIAL, check: 'sb1' },
    ],
    gaps: [
      {
        what: 'O SB1/SB2 só mostram e clicam o aviso quando a máquina do CI recebe a sugestão (poucas CPUs); "Ligar Modo Performance" e o × nunca são clicados em teste.',
        risk: 'médio',
        task: '3ec91f95-497e-81f7-8b12-c5c252d020c7',
      },
      {
        what: 'O aviso da placa de vídeo nunca foi visto rodando: depende de uma volta automática de GPU real.',
        risk: 'médio',
        task: '3d591f95-497e-8192-b911-cdb759933401',
      },
      {
        what: 'HardwareNotices.tsx:124 chama void acknowledgeGpuFallback(), que rejeita quando a IPC falha (o teste do gpu-status-store confirma): unhandledrejection no QA Logger e o aviso volta na próxima abertura sem a pessoa saber por quê.',
        risk: 'baixo',
        task: '3ec91f95-497e-8110-b363-cfade2b68b7a',
      },
      {
        what: 'A caixa (22rem, embaixo no centro, z 50) cobre a barra de status (18) e a dock (20) no centro de baixo; só a convivência com o card do tour é medida (SB1).',
        risk: 'baixo',
        task: '3ec91f95-497e-8112-82f9-fd1b86e3ec7d',
      },
    ],
    overlap:
      'Wrapper fixed inset-x-0 bottom-4 z 50 com pointer-events none; a caixa (w-[22rem], pointer-events auto) é [data-felixo-tour-avoid] e o card desvia dela (SB1 confere que os botões continuam clicáveis). Montado no App: vale no canvas e no chat.',
  },
  {
    id: 'modal-alcas-redimensionar',
    name: 'Alças de redimensionar dos modais',
    layer: 'modal',
    owner: 'src/features/shared/dialog/DialogResizeHandles.tsx',
    states: {
      normal: 'Sem ajuste salvo: nenhum estilo inline, o modal segue o tamanho da classe. No canvas, só o HandoffDialog (id "handoff") usa as alças.',
      pending: 'Arrastando (resizing): cursor do body ew/ns/nwse-resize e user-select none; a borda acompanha o ponteiro (dx vira 2·dx).',
      success:
        'Ajustado: tamanho fixo em felixo:dialog-size:<id>, sempre dentro de [320×240, janela − 16 px] e reajustado quando a janela encolhe. Setas mudam 24 px; Home, Enter ou duplo clique voltam ao original.',
      error: 'Valor salvo inválido ou storage que lança nos métodos: tratado como "nunca ajustado".',
    },
    controls: [],
    persistence: ['localStorage felixo:dialog-size:<id> (no canvas, felixo:dialog-size:handoff)'],
    ipc: [],
    dependsOn: ['useResizableDialog', 'readDialogSize', 'writeDialogSize', 'clearDialogSize', 'clampDialogSize', 'resizeCentered', 'swallowNextClick'],
    tests: [{ file: 'src/features/shared/dialog/dialog-sizing.test.ts' }],
    gaps: [
      {
        what: 'Nenhum smoke arrasta ou usa o teclado nas alças do HandoffDialog; a matemática é testada, a interação não.',
        risk: 'baixo',
        task: '3ec91f95-497e-81f7-8b12-c5c252d020c7',
      },
      {
        what: 'useResizableDialog.ts:43, :76, :106 e :112 leem window.localStorage fora de try: o getter pode lançar (SecurityError com storage bloqueado) e derrubar o modal no useState inicial. Só os métodos estão protegidos em dialog-sizing.ts.',
        risk: 'baixo',
        task: '3ec91f95-497e-8176-bef0-dfde828936dc',
      },
      {
        what: 'A alça do canto (20×20, z 10, bottom-0 right-0) fica sobre o canto inferior direito da moldura, onde costumam estar os botões do rodapé; não foi medido se cobre algum.',
        risk: 'baixo',
        task: '3ec91f95-497e-8112-82f9-fd1b86e3ec7d',
      },
    ],
    overlap:
      'absolute z 10 dentro da moldura do modal (z 60): borda direita (w-2, top-6 bottom-6), inferior (h-2, left-6 right-6) e canto (20 px). swallowNextClick engole o clique de soltar fora da moldura, que fecharia o modal.',
  },
  {
    id: 'tela-recuperacao-renderer',
    name: 'Tela "A interface não conseguiu carregar"',
    layer: 'overlay',
    owner: 'src/RendererRecoveryBoundary.tsx',
    states: {
      normal: 'Sem erro: renderiza o App (canvas, avisos de hardware e menu de links) normalmente.',
      error:
        'Exceção de render não tratada abaixo de main.tsx: tela cheia no lugar do canvas com "Recarregar interface"; a falha vai ao QA Logger (escopo renderer:recovery-boundary).',
    },
    controls: [
      {
        locator: 'Recarregar interface',
        kind: 'button',
        effect: 'window.location.reload(): recarrega só o renderer; processo principal, PTYs e perfil continuam vivos e o canvas é relido do que o main salvou.',
        failure: 'Se o erro se repetir no render, a mesma tela volta; não há limite de tentativas nem outro caminho na tela.',
      },
    ],
    persistence: ['nenhuma (o reload relê o canvas salvo pelo processo principal)'],
    ipc: ['qa-logger:log'],
    dependsOn: ['React error boundary (getDerivedStateFromError, componentDidCatch)'],
    tests: [{ file: SMOKE_TUTORIAL, check: 'sa10' }],
    gaps: [
      {
        what: 'Nenhum teste força a tela de recuperação nem clica "Recarregar interface"; o SA10 só confere que a falha do tutorial NÃO a mostra.',
        risk: 'médio',
        task: '3ec91f95-497e-81f7-8b12-c5c252d020c7',
      },
    ],
    overlap: 'Substitui a árvore inteira (h-screen w-screen, bg zinc-950): não há sobreposição; os avisos de hardware e de links somem junto com o App.',
  },
]

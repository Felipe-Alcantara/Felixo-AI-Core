import type { CanvasTool } from '../../components/tools/CanvasToolsMenu'
import type { InventoryElement } from '../canvas-inventory-types'

type WorkspaceTool = Extract<CanvasTool, 'search' | 'projects' | 'notes' | 'models' | 'prompts' | 'skills' | 'git'>

const TOOLS = 'src/features/canvas/components/tools'

const SMOKE = 'scripts/canvas-smoke.cjs'
const SMOKE_PROMPTS = 'scripts/canvas-smoke-prompts.cjs'
const SMOKE_ONBOARDING = 'scripts/canvas-smoke-onboarding.cjs'
const SMOKE_CONTAS = 'scripts/canvas-smoke-contas.cjs'

/** Prompts/Skills com a gaveta aberta sem fixá-la e sem a lista Elementos cobrir o painel. */
const TASK_GAVETA_PROMPTS = '3eb91f95-497e-814a-8b2c-e471e09f6ff3'
/** Matriz visual de viewport, tema, zoom e quantidade de agentes. */
const TASK_MATRIZ_VISUAL = '3ce91f95-497e-81c9-8c3b-def9ed09d58c'
/** Prompts: pty:write falho ao entregar a referência. */
const TASK_PROMPT_PTY_FALHO = '3d791f95-497e-81cd-b05c-c9d6370c81a3'
/** Prompts: clicar Inserir/combinar de verdade no app empacotado. */
const TASK_PROMPT_EMPACOTADO = '3d791f95-497e-81bf-a6c7-efef573d87ae'

const NOVA_SMOKE = '3ec91f95-497e-81ca-8319-ee657b0b6492'
const NOVA_SOBREPOSICAO = '3ec91f95-497e-8112-82f9-fd1b86e3ec7d'

/** Sobreposição comum a todo painel flutuante comum (moldura `CanvasPanel`). */
const PANEL_OVERLAP =
  'CanvasPanel absolute z-20 (z-30 com foco dentro), top-16, left = 1rem + largura viva da sidebar; abaixo da sidebar (26), dos toasts/overlay isBusy (50), dos diálogos (60) e do FelixoSelect (1000); mesmo z da lista Elementos (z-20, direita)'

export const workspaceTools: Record<WorkspaceTool, InventoryElement> = {
  search: {
    id: 'tool-search',
    name: 'Busca de blocos (Pesquisar)',
    layer: 'panel',
    owner: `${TOOLS}/SearchPanel.tsx`,
    states: {
      normal:
        'aberta pelo botão Buscar do rail ou Ctrl/Cmd+K; o campo recebe o foco (useSearchInputFocus) e a lista mostra os blocos cujo label, nome de arquivo, texto ou comando contém o termo, com um trecho do texto encontrado',
      empty:
        'termo preenchido sem correspondência: "Nenhum bloco encontrado."; campo vazio: lista vazia, sem aviso',
    },
    controls: [
      {
        locator: 'onClick={() => onFocusNode(hit.id)}',
        kind: 'button',
        effect:
          'focusNode do CanvasView: centraliza o bloco na área livre com zoom 1,2 e marca só ele como selecionado; o painel continua aberto',
        failure:
          'bloco removido entre a busca e o clique: focusNode não acha o nó e não faz nada (sem aviso)',
      },
    ],
    persistence: [
      'nenhuma para o termo (useSearchQuery é useState: fechar o painel apaga a busca)',
      'localStorage felixo:canvas-panel-width:search e felixo:canvas-panel-height:search (moldura)',
    ],
    ipc: [],
    dependsOn: ['useSearchQuery', 'useSearchInputFocus', 'CanvasPanel', 'focusNode (CanvasView)'],
    tests: [
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarBuscaDeBlocos' },
      { file: SMOKE, check: 'checarFocoAoAbrirFerramenta' },
      { file: SMOKE, check: 'checarPainelNosDoisEixos' },
      { file: SMOKE, check: 'checarElementosAbertosEmViewportsCriticos' },
      { file: SMOKE_ONBOARDING, check: 'sb6' },
    ],
    gaps: [
    ],
    overlap: `${PANEL_OVERLAP}. Porte sm; a largura visual é limitada à viewport em telas estreitas.`,
  },

  projects: {
    id: 'tool-projects',
    name: 'Projetos (lista e navegador de pastas)',
    layer: 'panel',
    owner: `${TOOLS}/ProjectsPanel.tsx`,
    states: {
      normal:
        'lista de projetos registrados em ordem alfabética (sortProjectsByName); abrir um projeto troca a lista pelo navegador de pastas na mesma moldura (panelId project-browser)',
      loading:
        'navegador sem entradas e sem erro: "Carregando…" com spinner; Adicionar pasta mostra "Adicionando…" enquanto busy',
      empty: 'sem projetos: "Nenhum projeto ainda."; pasta sem arquivos: "Pasta vazia."',
      error:
        'projects:list-directory com ok=false, text-file:open-in-project recusado ou sem editor de terminal: mensagem em vermelho (loadError) acima da lista',
      pending:
        'remoção em dois toques: a linha vira "Tirar <nome> da lista?" com Remover e Cancelar (pendingRemovalId)',
      disabled: 'Adicionar pasta desabilitado enquanto busy',
    },
    controls: [
      {
        locator: 'aria-label="Voltar para a pasta anterior"',
        kind: 'button',
        effect:
          'goUp: sobe um nível; na raiz do projeto volta à lista de projetos (browsing = null)',
        failure: 'sem falha própria; o loadError da pasta anterior não é limpo ao subir (ver lacuna)',
      },
      {
        locator: 'onClick={() => openEntry(entry)}',
        kind: 'button',
        effect:
          'pasta: abre a subpasta (projects:list-directory); arquivo executável (resolveProjectFileClick = run): cria um bloco de terminal que roda o arquivo na pasta atual e fecha o painel; outro arquivo: pede o editor de terminal (text-file:resolve-editor) e abre um terminal com o editor e o arquivo, fechando o painel',
        failure:
          'sem editor: loadError "Nenhum editor de terminal disponível." (ou a mensagem do processo principal); listagem com ok=false ou rejeitada vira loadError',
      },
      {
        locator: 'onClick={() => runFile(entry)}',
        kind: 'button',
        effect:
          'cria um bloco de terminal cujo processo é o arquivo (comando de buildRunCommand, com fallbackCommand quando existe), rótulo "<arquivo> · <projeto>", cwd = pasta atual, e fecha o painel',
        failure: 'sem falha própria no painel: erro ao iniciar aparece no bloco de terminal criado',
        disabledWhen:
          'não renderiza para pastas nem para arquivos que canRunProjectFile recusa; transparente até hover/foco',
      },
      {
        locator: 'onClick={() => void openFileInCanvas(entry)}',
        kind: 'button',
        effect:
          'text-file:open-in-project autoriza o arquivo dentro do projeto registrado; com ok, cria um bloco de arquivo no canvas (onOpenFileInCanvas) e fecha o painel',
        failure: 'recusa: loadError com a mensagem do processo principal ou "Não foi possível abrir o arquivo."',
        disabledWhen: 'não renderiza para pastas; transparente até hover/foco',
      },
      {
        locator: 'onClick={() => void addProject()}',
        kind: 'button',
        effect:
          'projects:pick-folder abre o seletor do sistema; projects:detect-repos registra a pasta (ou cada repositório filho de primeiro nível) com projects:save, pulando caminhos já registrados; relê a lista (projects:list) e avisa o canvas (onProjectsChanged → menu de terminais)',
        failure:
          'cancelar o seletor não faz nada; falha de projects:save ou rejeição de IPC aparece na barra de status',
        disabledWhen: 'busy (adição em andamento)',
      },
      {
        locator: 'onClick={() => void removeProject(project.id)}',
        kind: 'button',
        effect:
          'onRemoveFolder → useCanvasProjects.removeProjectFolder: tira o projeto da lista (projects:delete; nada sai do disco), relê a lista e avisa o canvas',
        failure:
          'remoção que falha avisa na barra de status em vez de a releitura mostrar o projeto de volta sem mensagem',
      },
      {
        locator: 'onClick={() => setPendingRemovalId(null)}',
        kind: 'button',
        effect: 'desiste da remoção: a linha volta ao normal (pendingRemovalId = null)',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'onClick={() => openProject(project)}',
        kind: 'button',
        effect:
          'abre o navegador de pastas na raiz do projeto: limpa entradas, erro e remoção pendente e chama projects:list-directory',
        failure: 'ok=false ou rejeição vira loadError',
      },
      {
        locator: 'onClick={() => setPendingRemovalId(project.id)}',
        kind: 'button',
        effect: 'pede confirmação na própria linha (pendingRemovalId = id), sem window.confirm',
        failure: 'sem falha própria (estado local)',
        disabledWhen: 'transparente até hover/foco (invisível em toque)',
      },
    ],
    persistence: [
      'processo principal: lista de projetos (projects:save / projects:delete), a mesma do menu de terminais',
      'canvas salvo: blocos de terminal ou de arquivo criados pelo navegador',
      'localStorage felixo:canvas-panel-width:projects e felixo:canvas-panel-height:projects (a vista project-browser grava na própria chave, mas a moldura não a relê; ver lacuna da moldura)',
      'nenhuma para a pasta navegada (reabrir volta à lista)',
    ],
    ipc: [
      'projects:list',
      'projects:pick-folder',
      'projects:detect-repos',
      'projects:save',
      'projects:delete',
      'projects:list-directory',
      'text-file:open-in-project',
      'text-file:resolve-editor',
    ],
    dependsOn: [
      'useCanvasProjects (removeProjectFolder, reloadProjects)',
      'sortProjectsByName',
      'buildRunCommand',
      'canRunProjectFile',
      'resolveProjectFileClick',
      'runFileInTerminal / openTextFileNode (CanvasView)',
      'CanvasPanel',
    ],
    tests: [
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarProjetos' },
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarNotas' },
      { file: 'src/features/shared/ipc/ipc-failures.test.ts' },
      { file: `${TOOLS}/projects-panel-order.test.ts` },
      { file: 'src/features/canvas/services/project-file-action.test.ts' },
      { file: 'src/features/canvas/services/run-file-command.test.ts' },
      { file: 'src/features/canvas/components/terminal-open-file.test.ts' },
      { file: 'src/features/canvas/hooks/useCanvasProjects.test.ts' },
      { file: 'electron/services/projects-ipc-handlers.test.cjs' },
      { file: 'electron/services/projects-path-security.test.cjs' },
    ],
    gaps: [
      {
        what: 'Adicionar pasta (pelo seletor trocado na automação) e remover em dois toques são exercitados (checarProjetos); navegar pelas pastas e rodar/abrir arquivo só têm teste das funções puras e dos handlers.',
        risk: 'médio',
        task: NOVA_SMOKE,
      },
      {
        what: 'ProjectsPanel.tsx:133: sem repositório na pasta escolhida, o nome sai de folder.split("/"); no Windows o caminho (realpath) usa "\\" e o projeto é registrado com o caminho inteiro como nome',
        risk: 'baixo',
        task: '3ec91f95-497e-8103-b360-c1979d6992f4',
      },
    ],
    overlap: `${PANEL_OVERLAP}. Porte md; lista e navegador dividem a mesma moldura (trocar de vista não reanima nem refaz o foco). Rodar e Abrir no canvas ficam com opacity 0 até hover/foco`,
  },

  notes: {
    id: 'tool-notes',
    name: 'Notas (blocos do canvas e notas salvas)',
    layer: 'panel',
    owner: `${TOOLS}/NotesPanel.tsx`,
    states: {
      normal:
        'três listas dos blocos do canvas (nota, desenho, Excalidraw) com botão de criar, e as notas salvas compartilhadas com o chat, editáveis no lugar',
      empty:
        'cada lista tem seu aviso: "Nenhum bloco de nota no canvas.", "Nenhum bloco de desenho no canvas.", "Nenhum bloco Excalidraw no canvas.", "Nenhuma nota salva ainda." — este também quando notes:list falha (erro mascarado)',
      pending:
        'edição de título ou conteúdo de nota salva espera 500 ms (SAVE_DEBOUNCE_MS) antes do notes:save',
    },
    controls: [
      {
        locator: 'onClick={onAddNote}',
        kind: 'button',
        effect:
          'cria um bloco de nota vazio no canvas (addNode note), o mesmo fluxo do botão da barra; o bloco entra na lista de cima',
        failure: 'sem falha própria no painel; a gravação do bloco é a do canvas',
      },
      {
        locator: 'title="Centralizar esta nota no canvas"',
        kind: 'button',
        effect: 'focusNode: centraliza o bloco de nota com zoom 1,2 e seleciona só ele',
        failure: 'bloco removido entre o render e o clique: nada acontece',
      },
      {
        locator: 'onClick={onAddDrawing}',
        kind: 'button',
        effect: 'cria um bloco de desenho leve vazio no canvas (addNode drawing)',
        failure: 'sem falha própria no painel; a gravação do bloco é a do canvas',
      },
      {
        locator: '<Pencil size={14}',
        kind: 'button',
        effect: 'focusNode: centraliza o bloco de desenho leve e seleciona só ele',
        failure: 'bloco removido entre o render e o clique: nada acontece',
      },
      {
        locator: 'onClick={onAddExcalidrawDrawing}',
        kind: 'button',
        effect:
          'cria um bloco Excalidraw vazio no canvas (addNode excalidrawDrawing); o Excalidraw carrega sob demanda dentro do bloco',
        failure: 'falha do chunk do Excalidraw aparece no bloco, não no painel',
      },
      {
        locator: '<PenTool size={14}',
        kind: 'button',
        effect: 'focusNode: centraliza o bloco Excalidraw e seleciona só ele',
        failure: 'bloco removido entre o render e o clique: nada acontece',
      },
      {
        locator: 'onClick={() => void addSavedNote()}',
        kind: 'button',
        effect: 'grava "Nova nota" com notes:save e só então a acrescenta à lista de notas salvas',
        failure:
          'falha de notes:save aparece no painel e a nota só entra na lista se foi gravada',
      },
      {
        locator: 'aria-label="Remover nota"',
        kind: 'button',
        effect:
          'cancela o salvamento pendente da nota, chama notes:delete e tira a nota da lista, sem confirmação',
        failure:
          'falha de notes:delete aparece no painel e a nota continua na lista',
      },
    ],
    persistence: [
      'processo principal: notas salvas (notes:save / notes:delete), as mesmas do chat',
      'canvas salvo: blocos nota, desenho e Excalidraw criados pelos botões Novo',
      'localStorage felixo:canvas-panel-width:notes e felixo:canvas-panel-height:notes',
    ],
    ipc: ['notes:list', 'notes:save', 'notes:delete'],
    dependsOn: ['CanvasPanel', 'addNode (CanvasView)', 'focusNode (CanvasView)'],
    tests: [{ file: 'src/features/shared/ipc/ipc-failures.test.ts' }, { file: 'src/features/canvas/services/debounced-save-queue.test.ts' }],
    gaps: [
    ],
    overlap: `${PANEL_OVERLAP}. Porte sm; o conteúdo rola por dentro (overflow-auto)`,
  },

  models: {
    id: 'tool-models',
    name: 'Modelos configurados',
    layer: 'panel',
    owner: `${TOOLS}/ModelsPanel.tsx`,
    states: {
      normal:
        'lista dos modelos configurados (nome, CLI e comando), só leitura e remover; criar continua no fluxo do chat',
      empty:
        '"Nenhum modelo configurado." — também enquanto models:list não respondeu e quando falhou (não há estado de carregando nem de erro)',
    },
    controls: [
      {
        locator: 'onClick={() => void removeModel(model.id)}',
        kind: 'button',
        effect: 'models:delete sem confirmação e relê a lista (models:list): o modelo some',
        failure:
          'falha ao remover ou ao recarregar a lista aparece no painel',
      },
    ],
    persistence: [
      'processo principal: modelos (models:delete), os mesmos do chat',
      'localStorage felixo:canvas-panel-width:models e felixo:canvas-panel-height:models',
    ],
    ipc: ['models:list', 'models:delete'],
    dependsOn: ['CanvasPanel'],
    tests: [
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarModelos' },
      { file: 'src/features/shared/ipc/ipc-failures.test.ts' },
    ],
    gaps: [],
    overlap: `${PANEL_OVERLAP}. Porte sm`,
  },

  prompts: {
    id: 'tool-prompts',
    name: 'Prompts (catálogo de automações)',
    layer: 'panel',
    owner: `${TOOLS}/PromptsPanel.tsx`,
    states: {
      normal:
        'catálogo agrupado por escopo (presets do app + personalizados) com filtro por texto; marcar vários monta uma única tarefa; presets só se editam pelo detalhe (Ver)',
      empty:
        'filtro sem correspondência: os grupos somem sem aviso; sem seleção: "Nenhum prompt selecionado."',
      pending:
        'Inserir/Enviar conjunto aguardando a confirmação real do PTY: "Enviando…" e o botão travado (pendingId); rascunho sendo criado: "Criando…"',
      success:
        'retorno role=status com data-felixo-delivery-feedback: sent "Digitado no terminal aberto. Revise e aperte Enter para enviar.", sent-inline (fallback sem arquivo de contexto, com aviso no bloco), copied "Sem terminal aberto — copiado para a área de transferência."; some em 2,5 s',
      error:
        'failed: "O terminal não confirmou o recebimento. Tente novamente." e o botão vira "Tentar de novo" até nova tentativa; gravação falha: "Não foi possível salvar este prompt. Tente novamente." por 2,5 s; rascunho recusado: mensagem do createCustomAutomation abaixo dele',
      disabled:
        'Novo prompt com rascunho aberto; Enviar conjunto sem seleção ou enviando; Inserir enquanto aquele prompt envia; Criar prompt enquanto cria',
    },
    controls: [
      {
        locator: 'onClick={startCustomAutomation}',
        kind: 'button',
        effect: 'abre o rascunho local "Novo prompt" (escopo chat) acima da lista; nada é gravado ainda',
        failure: 'sem falha própria (estado local)',
        disabledWhen: 'já há um rascunho aberto (sem estilo visual de desabilitado)',
      },
      {
        locator: 'aria-label="Cancelar novo prompt"',
        kind: 'button',
        effect: 'descarta o rascunho sem gravar',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'value={draft.scope}',
        kind: 'select',
        effect: 'muda o escopo do rascunho (updateDraft); só vale ao criar',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'onClick={() => void createDraftAutomation()}',
        kind: 'button',
        effect:
          'createCustomAutomation recusa texto vazio ("Preencha o texto do prompt para criá-lo."); senão automations:save e, com ok, o prompt entra na lista e o rascunho fecha',
        failure:
          'IPC recusado ou rejeitado: "Não foi possível criar este prompt. Tente novamente." abaixo do rascunho, que continua aberto',
        disabledWhen: 'criação em andamento (isCreatingDraft)',
      },
      {
        locator: 'onClick={() => void insertSelected()}',
        kind: 'button',
        effect:
          'composeSelectedPromptInsertion junta os marcados na ordem do catálogo e insertPrompt digita no terminal expandido, sem Enter, pelo arquivo de contexto (context-file:write) + pty:write; o cartão do bloco mostra os nomes combinados; sem terminal expandido, copia',
        failure:
          'PTY sem confirmação: "Tentar de novo" + aviso em vermelho; sem terminal aberto, clipboard que rejeita ou não existe vira o aviso em vermelho (\'failed\')',
        disabledWhen: 'nenhum prompt marcado ou envio em andamento',
        test: { file: SMOKE_PROMPTS, check: 'combinacao' },
      },
      {
        locator: 'onClick={() => setDetailId(prompt.id)}',
        kind: 'button',
        effect: 'troca a lista pelo detalhe do preset (PromptDetailPanel, panelId prompt-detail) na mesma moldura',
        failure: 'sem falha própria (estado local)',
        disabledWhen: 'só aparece em presets',
      },
      {
        locator: 'onClick={() => void exportPrompts()}',
        kind: 'button',
        effect:
          'salva como .md (cabeçalho YAML com id, name, scope, description, updatedAt, origem + o texto intacto) os prompts marcados, ou o catálogo inteiro se nenhum estiver marcado: um prompt abre "Salvar como" (files:save-text); vários pedem uma pasta (files:save-text-folder) e nunca sobrescrevem arquivo existente',
        failure:
          'recusa ou erro do processo principal: a mensagem aparece em vermelho (role=status) acima da lista; cancelar o diálogo não mostra nada',
      },
      {
        locator: 'data-felixo-prompt-insert',
        kind: 'button',
        effect:
          'digita o prompt no terminal expandido sem Enter (autoSubmit false): grava o arquivo de contexto (context-file:write) e escreve a referência no PTY (pty:write); o cartão do bloco mostra o nome (data-felixo-last-prompt) e o canvas grava só a metadata (lastPromptInsertion); sem terminal expandido, copia o texto',
        failure:
          'PTY sem confirmação: "Tentar de novo" com aviso em vermelho; pasta de contexto indisponível: entrega inline (sent-inline) com aviso no bloco; clipboard que rejeita ou não existe vira o aviso em vermelho (nunca "copiado" sem copiar)',
        disabledWhen: 'aquele prompt está enviando',
        test: { file: SMOKE_PROMPTS, check: 'catalogo' },
      },
      {
        locator: 'aria-label="Remover prompt"',
        kind: 'button',
        effect: 'cancela o salvamento pendente, chama automations:delete e tira o prompt da lista, sem confirmação',
        failure: 'falha ao apagar a automação avisa na barra de status e ela continua na lista',
        disabledWhen: 'só aparece em prompts personalizados',
      },
      {
        locator: 'value={prompt.scope}',
        kind: 'select',
        effect: 'muda o escopo de um prompt personalizado; grava com debounce de 500 ms (automations:save) e o prompt muda de grupo',
        failure: '"Não foi possível salvar este prompt. Tente novamente." por 2,5 s no item; fechar antes de 500 ms grava o pendente na hora',
      },
    ],
    persistence: [
      'processo principal: prompts personalizados e edições de preset (automations:save / automations:delete)',
      'arquivos .md que a pessoa exporta ficam onde ela escolher; importar grava pelos mesmos automations:save',
      'canvas salvo: lastPromptInsertion do bloco de terminal (nome e origem, sem o corpo)',
      'arquivo temporário de contexto em <userData>/context-deliveries (context-file:write)',
      'localStorage felixo:canvas-panel-width:prompts e felixo:canvas-panel-height:prompts',
      'nenhuma para filtro, seleção e rascunho',
    ],
    ipc: ['automations:list', 'automations:save', 'automations:delete', 'context-file:write', 'pty:write', 'files:save-text', 'files:save-text-folder'],
    dependsOn: [
      'CanvasPanel',
      'insertPrompt (CanvasView)',
      'terminal-session-store.sendText',
      'prompt-overrides',
      'prompt-composition',
      'prompt-delivery-feedback',
      'custom-automation-creation',
      'prompt-markdown',
      'PromptImportPreview',
      'defaultAutomations',
      'FelixoSelect',
    ],
    tests: [
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarPrompts' },
      { file: 'src/features/shared/ipc/ipc-failures.test.ts' },
      { file: SMOKE_PROMPTS, check: 'catalogo' },
      { file: SMOKE_PROMPTS, check: 'combinacao' },
      { file: SMOKE_PROMPTS, check: 'fallback' },
      { file: SMOKE_PROMPTS, check: 'semTerminalAberto' },
      { file: 'src/features/canvas/terminal/prompt-origins-e2e.test.ts' },
      { file: 'src/features/canvas/services/prompt-composition.test.ts' },
      { file: 'src/features/canvas/services/prompt-delivery-feedback.test.ts' },
      { file: 'src/features/canvas/services/prompt-overrides.test.ts' },
      { file: 'src/features/canvas/services/custom-automation-creation.test.ts' },
      { file: 'src/features/canvas/services/prompt-markdown.test.ts' },
      { file: 'electron/services/file-export-ipc-handlers.test.cjs' },
      { file: 'src/features/shared/data/automations.test.ts' },
      { file: 'src/features/shared/types/prompt-insertion.test.ts' },
    ],
    gaps: [
      {
        what: 'com a gaveta aberta, clicar na sidebar a fecha (o smoke precisa fixá-la) e, na janela de 1008×655, a lista Elementos cobre parte do painel (o smoke aciona pelo teclado)',
        risk: 'médio',
        task: TASK_GAVETA_PROMPTS,
      },
      {
        what: 'o retorno failed ("Tentar de novo") nunca é exercitado: o smoke cobre sent, sent-inline e copied',
        risk: 'médio',
        task: TASK_PROMPT_PTY_FALHO,
      },
      {
        what: 'Inserir e Enviar conjunto só foram clicados com a CLI roteirizada do smoke, não no app empacotado com CLI real',
        risk: 'médio',
        task: TASK_PROMPT_EMPACOTADO,
      },
      {
        what: 'Novo prompt/Criar (gravado) e o filtro são exercitados (checarPrompts); edição inline com autosave, troca de escopo e Remover pela linha só têm teste das funções puras.',
        risk: 'médio',
        task: NOVA_SMOKE,
      },
    ],
    overlap: `${PANEL_OVERLAP}. Porte xl (o mais largo); disputa largura com a gaveta fixada e fica sob a lista Elementos em janela pequena`,
  },

  skills: {
    id: 'tool-skills',
    name: 'Skills (biblioteca e skills próprias)',
    layer: 'panel',
    owner: `${TOOLS}/SkillsPanel.tsx`,
    states: {
      normal:
        'seção "Skills do sistema" (biblioteca do app + terceiros, a lista que todo agente novo recebe) com Ativar, ocultar, checkbox "Usar skills de terceiros" e a lista de ocultas recolhível; abaixo, as skills próprias da pessoa',
      empty:
        'sem skills próprias: "Nenhuma skill sua ainda — …"; sem ocultas: "Nenhuma skill oculta. …"',
      success:
        'Ativar: retorno role=status "Digitada no terminal aberto. Revise e aperte Enter para enviar." ou "Sem terminal aberto — copiada para a área de transferência." por 2,5 s',
      error:
        'Ativar sem confirmação do PTY: "O terminal não confirmou o recebimento. Tente novamente." até nova tentativa; canvas:set-skills-settings recusado: role=alert com a mensagem (erroSistema)',
      disabled: 'Salvar sem nome ou sem caminho',
    },
    controls: [
      {
        locator: 'onClick={startNew}',
        kind: 'button',
        effect: 'abre o formulário (nome, caminho, descrição) com foco no nome',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'onClick={() => void saveDraft()}',
        kind: 'button',
        effect:
          'nova: acrescenta a skill; edição: substitui; grava a lista com canvas:set-skills, relê o catálogo (canvas:list-available-skills) e avisa o CanvasView (onCatalogChange → availableSkillsRef) para o próximo agente já nascer com ela',
        failure:
          'a lista local só muda depois de canvas:set-skills gravar; falha restaura a lista e avisa na barra de status',
        disabledWhen: 'nome ou caminho vazio',
      },
      {
        locator: 'Cancelar',
        kind: 'button',
        effect: 'fecha o formulário e descarta o rascunho',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'data-felixo-skill-activate',
        kind: 'button',
        effect:
          'buildSkillActivationPrompt: digita no terminal expandido, sem Enter, a instrução de ler o arquivo da skill (context-file:write + pty:write); o cartão do bloco mostra o nome e o canvas grava lastPromptInsertion com source skill; sem terminal, copia',
        failure:
          'PTY sem confirmação: aviso em vermelho até nova tentativa; rejeição e clipboard recusado viram o aviso em vermelho; sem estado "enviando" nem trava de duplo clique',
        test: { file: SMOKE_PROMPTS, check: 'skill' },
      },
      {
        locator: 'data-skill-action="ocultar"',
        kind: 'button',
        effect:
          'leva o foco ao mesmo botão da linha vizinha (ou a "Ocultas"), grava hiddenBuiltinIds com canvas:set-skills-settings e relê o catálogo: a skill sai da lista dos agentes novos',
        failure:
          'recusa: role=alert com a mensagem (ou "Não foi possível salvar a configuração das skills.") e o catálogo relido mostra o que está gravado',
      },
      {
        locator: 'aria-controls={listaOcultasId}',
        kind: 'button',
        effect: 'abre/fecha a lista de skills ocultas (aria-expanded)',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'data-skill-action="restaurar"',
        kind: 'button',
        effect:
          'tira o id de hiddenBuiltinIds (canvas:set-skills-settings) e relê o catálogo: a skill volta à lista dos agentes',
        failure: 'recusa: role=alert com a mensagem e o catálogo relido',
      },
      {
        locator: 'title="Ativar: enviar ao terminal aberto (ou copiar)"',
        kind: 'button',
        effect:
          'mesma ativação da biblioteca para uma skill própria: digita a instrução no terminal expandido sem Enter, ou copia',
        failure:
          'PTY sem confirmação: aviso em vermelho na linha; rejeição do clipboard vira o aviso em vermelho; sem trava de duplo clique',
      },
      {
        locator: 'onClick={() => startEdit(skill)}',
        kind: 'button',
        effect: 'abre o formulário preenchido com a skill (editingId)',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'onClick={() => void removeSkill(skill.id)}',
        kind: 'button',
        effect: 'tira a skill da lista e grava com canvas:set-skills, sem confirmação; relê o catálogo',
        failure: 'falha de canvas:set-skills restaura a lista e avisa na barra de status',
      },
    ],
    persistence: [
      'processo principal: skills próprias (canvas:set-skills) e configuração da biblioteca — terceiros e ocultas (canvas:set-skills-settings)',
      'canvas salvo: lastPromptInsertion do bloco de terminal ao ativar',
      'memória do CanvasView: availableSkillsRef (lista que o próximo agente recebe)',
      'localStorage felixo:canvas-panel-width:skills e felixo:canvas-panel-height:skills',
    ],
    ipc: [
      'canvas:get-skills',
      'canvas:set-skills',
      'canvas:list-available-skills',
      'canvas:set-skills-settings',
      'context-file:write',
      'pty:write',
    ],
    dependsOn: [
      'CanvasPanel',
      'activateSkill (CanvasView)',
      'skills-panel-catalog (readSkillsCatalog, hideSkillId, restoreSkillId)',
      'describeSkillActivationFeedback',
      'terminal-session-store.sendText',
    ],
    tests: [
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarSkills' },
      { file: 'src/features/shared/ipc/ipc-failures.test.ts' },
      { file: SMOKE_PROMPTS, check: 'skill' },
      { file: SMOKE_PROMPTS, check: 'gravado' },
      { file: `${TOOLS}/skills-panel-catalog.test.ts` },
      { file: 'electron/services/canvas-ipc-handlers.test.cjs' },
      { file: 'src/features/canvas/services/prompt-delivery-feedback.test.ts' },
      { file: 'src/features/canvas/terminal/prompt-origins-e2e.test.ts' },
    ],
    gaps: [
      {
        what: 'mesma disputa do Prompts: com a gaveta aberta e sem fixá-la, clicar na sidebar fecha a gaveta; a lista Elementos cobre parte do painel em janela pequena',
        risk: 'médio',
        task: TASK_GAVETA_PROMPTS,
      },
      {
        what: 'Criar skill própria (gravada), ocultar/restaurar da biblioteca e remover a própria são exercitados (checarSkills); Ativar de skill própria, editar e o checkbox de terceiros seguem sem teste de interface.',
        risk: 'médio',
        task: NOVA_SMOKE,
      },
    ],
    overlap: `${PANEL_OVERLAP}. Porte sm; a lista do sistema tem max-h-40 com rolagem interna e respiro para o anel de foco`,
  },

  git: {
    id: 'tool-git',
    name: 'Source Control (Git)',
    layer: 'panel',
    owner: `${TOOLS}/GitPanel.tsx`,
    states: {
      normal:
        'variante workspace: cabeçalho com repositório, branch e pull/push/atualizar; colunas explorador, alterações/histórico e leitor',
      empty:
        'sem projetos: "Nenhum projeto cadastrado. Adicione um na ferramenta Projetos."; sem repositório escolhido: só o seletor; repositório limpo: "Sem alterações pendentes."',
      loading:
        'Atualizar gira (felixo-spin) enquanto busy; explorador "Lendo o repositório…", histórico "Lendo o histórico…", leitor "Lendo diferenças…"',
      error:
        'git:get-summary ou ação recusada: texto em vermelho (felixo-scm-error) com a mensagem do git ou o fallback ("Falha ao consultar o repositório Git.", "Falha ao criar o commit." …)',
      success: 'saída de push/pull/troca de branch aparece como aviso (felixo-scm-notice) quando não há erro',
      disabled:
        'Branch, Pull, Push, Atualizar e Commit travados enquanto busy; Pull sem upstream; Push sem branch; Commit sem mensagem ou sem nada no stage',
    },
    controls: [
      {
        locator: 'aria-pressed={explorerOpen}',
        kind: 'button',
        effect: 'mostra/esconde a coluna do explorador',
        failure: 'sem falha própria (estado local, não persiste)',
        disabledWhen: 'só aparece com um repositório carregado',
      },
      {
        locator: 'aria-label="Repositório"',
        kind: 'select',
        effect:
          'selectProject: limpa seleção, leitor, aviso e filtro e carrega em paralelo git:get-summary, git:list-files, git:list-branches e git:get-log; abre as pastas com mudança',
        failure:
          'summary recusado: mensagem em vermelho e o corpo some; falha de list-files/list-branches/get-log vira lista vazia sem aviso (ver lacuna); rejeição de IPC não tratada',
      },
      {
        locator: 'aria-label="Branch"',
        kind: 'select',
        effect:
          'git:switch-branch para a branch escolhida (ignora a atual) e relê status, árvore, histórico e branches, limpando o leitor',
        failure: 'recusa (ex.: alterações que impedem a troca): mensagem do git em vermelho; nada é relido',
        disabledWhen: 'busy',
      },
      {
        locator: 'window.felixo?.git?.pull({ projectPath })',
        kind: 'button',
        effect:
          'git:pull só com avanço rápido (--ff-only) e relê status, árvore, histórico e branches; a saída do git vira aviso',
        failure: 'recusa: mensagem do git ou "Falha ao atualizar (pull)." em vermelho',
        disabledWhen: 'busy ou branch sem upstream',
      },
      {
        locator: 'window.felixo?.git?.push({ projectPath })',
        kind: 'button',
        effect: 'git:push sem force (define o upstream em origin quando falta) e relê status, histórico e branches',
        failure: 'recusa: mensagem do git ou "Falha ao enviar (push)." em vermelho',
        disabledWhen: 'busy ou sem branch',
      },
      {
        locator: 'onClick={() => void refreshAll()}',
        kind: 'button',
        effect: 'relê summary, árvore, branches e histórico em paralelo',
        failure: 'summary recusado vira mensagem em vermelho; os outros três caem em lista vazia sem aviso',
        disabledWhen: 'busy',
      },
      {
        locator: 'onClick={() => setView(\'changes\')}',
        kind: 'button',
        effect: 'coluna do meio mostra mensagem de commit, Commit e os grupos Stage/Alterações',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'onClick={() => setView(\'history\')}',
        kind: 'button',
        effect: 'coluna do meio mostra o histórico (GitHistory), com os commits não enviados marcados',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'onClick={() => void commit()}',
        kind: 'button',
        effect:
          'git:commit com a mensagem aparada e relê status, árvore, histórico e branches; limpa o leitor e a mensagem',
        failure:
          'recusa: mensagem do git ou "Falha ao criar o commit." em vermelho — e a mensagem digitada é mantida para tentar de novo',
        disabledWhen: 'busy, mensagem vazia ou nada no stage',
      },
    ],
    persistence: [
      'repositório git no disco: commit, stage, branch e remoto (pull/push)',
      'nenhuma para repositório escolhido, filtro, aba e explorador (fechar o painel zera tudo)',
      'sem chave de largura/altura: a variante workspace não tem alças',
    ],
    ipc: [
      'projects:list',
      'git:get-summary',
      'git:list-files',
      'git:list-branches',
      'git:switch-branch',
      'git:get-log',
      'git:pull',
      'git:push',
      'git:commit',
    ],
    dependsOn: [
      'CanvasPanel (variant workspace)',
      'useCanvasSurfaces (reportPanelWidth)',
      'parseStatusEntries',
      'repo-tree (buildRepoTree, dirsWithChanges, ancestorPaths)',
      'FelixoSelect',
      'GitExplorer',
      'GitChangesList',
      'GitHistory',
      'GitDiffView',
    ],
    tests: [
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarSourceControl' },
      { file: 'src/features/shared/ipc/ipc-failures.test.ts' },
      { file: 'scripts/canvas-smoke-sobreposicoes.cjs', check: 'checarGitEAvisoDeClisComGavetaAberta' },
      { file: `${TOOLS}/git-status.test.ts` },
      { file: `${TOOLS}/repo-tree.test.ts` },
      { file: `${TOOLS}/git-diff.test.ts` },
      { file: 'electron/services/git-service.test.cjs' },
      { file: 'electron/services/git-secret-redaction.test.cjs' },
    ],
    gaps: [
      {
        what: 'Medido (checarGitEAvisoDeClisComGavetaAberta): sem gaveta o painel mede 239 px em 768 px e 515 px em 1280 px; com a gaveta aberta em 1280 px ele encolhe para 239 px (abaixo do piso de 260 px) e em 768 px a gaveta (440 px) cobre 145×725 px do painel. Defeito conhecido.',
        risk: 'médio',
        task: NOVA_SOBREPOSICAO,
      },
    ],
    overlap:
      'variante workspace: absolute z-20 (z-30 com foco), top-4, left = 1rem + sidebar, right = inspector + 16 px, altura toda (maxHeight); reporta a largura ao coordenador (reportPanelWidth) e deixa a faixa mínima de canvas (MIN_CANVAS_STRIP 160 px); recolhido vira coluna de 44 px',
  },
}

export const workspaceToolSurfaces: InventoryElement[] = [
  {
    id: 'tool-prompts-import',
    name: 'Prompts — prévia da importação de .md',
    layer: 'panel',
    owner: `${TOOLS}/PromptImportPreview.tsx`,
    states: {
      normal:
        'aparece no topo do painel Prompts depois de "Importar .md" (arquivos, o seletor aceita vários) ou "Importar pasta" (todos os .md da pasta, o resto é ignorado): uma linha por arquivo com nome, tópico, situação (novo, já existe com mudanças, já existe igual, não pode ser importado) e a ação; nada é gravado antes de confirmar',
      empty: 'sem .md na escolha, mais de 200 arquivos ou todos acima de 1 MB: a prévia nem abre e um aviso em vermelho aparece no painel',
      pending: 'confirmação gravando um a um (automations:save): "Importando…" e os botões travados',
      success: 'aviso no painel: "N prompts importados."; os prompts entram ou se atualizam na lista',
      error: 'arquivo inválido (tópico inexistente, corpo vazio, cabeçalho aberto, id repetido na mesma importação) fica na prévia com o motivo e só pode ser pulado; falha ao gravar: "N importados; M não puderam ser salvos."',
      disabled: 'Importar com nada a gravar (tudo em Pular); os dois botões enquanto importa',
    },
    controls: [
      {
        locator: 'aria-label={`O que fazer com',
        kind: 'select',
        effect:
          'escolhe a ação do arquivo: novo cria ou pula; já existe com mudanças sobrescreve (mantém o id, então o histórico de inserções não perde a referência), mantém os dois (cria outro id, nome com "(importado)") ou pula; igual pula por padrão',
        failure: 'sem falha própria (estado local)',
        disabledWhen: 'só aparece em arquivo válido',
      },
      {
        locator: 'onClick={onCancel}',
        kind: 'button',
        effect: 'fecha a prévia sem gravar nada',
        failure: 'sem falha própria (estado local)',
        disabledWhen: 'importação em andamento',
      },
      {
        locator: 'data-felixo-prompt-import-confirm',
        kind: 'button',
        effect: 'grava cada arquivo não pulado por automations:save (id do arquivo mantido ao criar e ao sobrescrever; sem id, gera um) e atualiza a lista',
        failure: 'IPC recusado ou rejeitado em um arquivo: os demais seguem e o aviso conta quantos falharam',
        disabledWhen: 'nada a gravar (tudo em Pular) ou importando',
      },
    ],
    persistence: ['processo principal: automations:save (o mesmo dos prompts personalizados)', 'nenhuma para a prévia e as ações escolhidas'],
    ipc: ['automations:save'],
    dependsOn: ['prompt-markdown', 'FelixoSelect', 'PromptsPanel'],
    tests: [{ file: 'src/features/canvas/services/prompt-markdown.test.ts' }],
    gaps: [],
    overlap: `Dentro do painel Prompts (porte xl), acima da lista`,
  },

  {
    id: 'tool-panel-host',
    name: 'Hospedeiro dos painéis de ferramenta',
    layer: 'panel',
    owner: 'src/features/canvas/components/CanvasToolPanels.tsx',
    states: {
      normal:
        'activeTool escolhe o painel lazy no switch (Notificações e Tarefas Notion moram fora); null não renderiza nada',
      loading:
        'chunk do painel baixando: o Suspense mostra um CanvasPanel "Carregando <ferramenta>…" (role=status, panelId loading-<ferramenta>)',
      error:
        'import do chunk ou render do painel lançou: ToolPanelErrorBoundary mostra "Não foi possível carregar este painel." (role=alert, panelId error-<ferramenta>); trocar de ferramenta zera o erro',
    },
    controls: [
      {
        locator: 'onClick={() => window.location.reload()}',
        kind: 'button',
        effect: 'Recarregar app: window.location.reload() recarrega o renderer inteiro, e o canvas é relido do processo principal',
        failure:
          'se o chunk continua faltando (instalação corrompida), o mesmo erro volta ao reabrir a ferramenta; o React.lazy guarda a falha até o reload',
      },
    ],
    persistence: ['nenhuma: activeTool vive em useState do CanvasView (o reload fecha qualquer painel)'],
    ipc: [],
    dependsOn: [
      'CanvasView (activeTool, setActiveTool, openTool, toolOpenRequest)',
      'canvas-tool-loaders (Lazy*)',
      'TOOL_LABELS',
      'CanvasPanel',
    ],
    tests: [
      { file: 'src/features/canvas/components/focus-keyboard-a11y.test.ts' },
      { file: 'scripts/canvas-smoke-teclado.cjs', check: 'checarFocoAoFecharPresetsDeAgente' },
      { file: SMOKE, check: 'checarFocoAoAbrirFerramenta' },
      { file: SMOKE_PROMPTS, check: 'abrirPainel' },
      { file: 'src/features/onboarding/onboarding-catalog.test.ts' },
    ],
    gaps: [
      {
        what: 'os estados Carregando e erro do chunk não têm teste: nenhum smoke simula chunk ausente e o botão Recarregar app nunca é clicado',
        risk: 'baixo',
        task: NOVA_SMOKE,
      },
    ],
    overlap:
      'sem superfície própria além dos fallbacks, que usam a moldura CanvasPanel (porte sm, z-20/z-30). Fechar devolve o foco no próximo quadro: Busca → [data-canvas-tool-trigger="search"]; demais → menu de ferramentas ou botão do rail que não esteja aria-hidden/inert. Trocar de ferramenta desmonta o painel anterior na hora, sem animação de saída',
  },
  {
    id: 'tool-panel-frame',
    name: 'Moldura comum dos painéis (CanvasPanel)',
    layer: 'panel',
    owner: `${TOOLS}/CanvasPanel.tsx`,
    states: {
      normal:
        'region rotulada pelo título; entra com felixo-anim-panel-in e se foca se o foco não estiver dentro; largura = occupancy.panel (decidida pelo coordenador), altura do conteúdo até getPanelMaxHeight (janela − 112, piso 240). Recolhido: coluna de 44 px com a inicial do título, conteúdo hidden e sem alças. Alças role=separator (não contadas): largura com arrasto, setas ±24 (Shift ±80), Home/duplo clique = padrão; altura com ↑↓ e Home = altura do conteúdo',
      pending:
        'fechando: felixo-anim-panel-out por 160 ms (PANEL_EXIT_MS) antes do onClose; um pedido de abrir a mesma ferramenta nesse intervalo (Ctrl+K, o campo de pesquisa da topbar, a aba Cadeia de Limites e uso) cancela o fechamento e o painel fica aberto',
    },
    controls: [
      {
        locator: 'onClick={() => setCollapsed((current) => !current)}',
        kind: 'button',
        effect:
          'alterna collapsed: recolhido vira coluna de 44 px (COLLAPSED_SURFACE_WIDTH), esconde conteúdo e alças e reporta 44 px ao coordenador, devolvendo largura ao canvas',
        failure: 'sem falha própria; o estado não persiste (reabrir volta expandido)',
      },
      {
        locator: 'onClick={requestClose}',
        kind: 'button',
        effect:
          'requestClose(): consulta confirmClose (o detalhe de prompt com rascunho pergunta) e, se seguir, toca a animação de saída (160 ms) e chama onClose — o hospedeiro limpa activeTool e devolve o foco ao gatilho; Esc dentro do painel faz o mesmo quando ninguém deu preventDefault (o FelixoSelect aberto dá)',
        failure:
          'sem falha própria; edições com debounce pendente em Notas e Prompts são gravadas ao desmontar, e Esc ou Fechar com rascunho não salvo no detalhe de prompt pedem confirmação',
      },
    ],
    persistence: [
      'localStorage felixo:canvas-panel-width:<panelId> (só depois de arrastar ou usar as setas; Home apaga)',
      'localStorage felixo:canvas-panel-height:<panelId>',
      'nenhuma para recolhido',
    ],
    ipc: [],
    dependsOn: [
      'useExitAnimation',
      'usePanelOpenRequest (PanelOpenRequestContext, provido pelo CanvasToolPanels)',
      'useResizablePanelWidth',
      'useResizablePanelHeight',
      'useCanvasSurfaces (occupancy, reportPanelWidth, viewport)',
      'getPanelMaxHeight',
    ],
    tests: [
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarMolduraDosPaineis' },
      { file: SMOKE, check: 'checarPainelNosDoisEixos' },
      { file: SMOKE, check: 'checarFocoAoAbrirFerramenta' },
      { file: SMOKE, check: 'checarReaberturaDuranteSaidaDoPainel' },
      { file: SMOKE, check: 'checarElementosAbertosEmViewportsCriticos' },
      { file: SMOKE_ONBOARDING, check: 'sb6' },
      { file: 'src/features/canvas/services/panel-sizing.test.ts' },
      { file: 'src/features/canvas/services/canvas-surfaces.test.ts' },
      { file: 'src/features/canvas/hooks/exit-animation-controller.test.ts' },
    ],
    gaps: [
      {
        what: 'mesmo z da lista Elementos (TerminalsPanel absolute right-0 z-20): sem foco dentro do painel, a ordem do DOM decide quem cobre quem; coberto em janela pequena com a gaveta fixada',
        risk: 'médio',
        task: TASK_GAVETA_PROMPTS,
      },
      {
        what: 'só o painel Buscar tem evidência visual nos viewports críticos; os outros painéis (portes md/xl e workspace) nunca foram medidos',
        risk: 'médio',
        task: TASK_MATRIZ_VISUAL,
      },
      {
        what: 'useResizablePanelWidth.ts:55-60 e useResizablePanelHeight.ts:42-44 leem o localStorage só ao montar; ProjectsPanel (projects → project-browser) e PromptsPanel (prompts → prompt-detail) trocam o panelId sem remontar a moldura — a largura de uma vista vaza para a outra e a gravada da segunda nunca é lida',
        risk: 'baixo',
        task: '3ec91f95-497e-8103-b360-c1979d6992f4',
      },
    ],
    overlap:
      'absolute z-20, z-30 com foco dentro (focus-within); top-16 (workspace: top-4), left = 1rem + largura viva da sidebar; maxWidth = viewport − sidebar − inspector − 32 px. Abaixo da sidebar (26), do overlay isBusy/toasts (50), dos diálogos (60) e do FelixoSelect (1000); mesmo z da lista Elementos',
  },
  {
    id: 'tool-menu',
    name: 'Menu de ferramentas da sidebar',
    layer: 'panel',
    owner: `${TOOLS}/CanvasToolsMenu.tsx`,
    states: {
      normal:
        'seção "Ferramentas" da sidebar (nasce recolhida, sem lembrar) com os grupos Workspace (Projetos, Notas, Modelos, Prompts, Skills, Source Control), Operação (Fetch All, Tarefas Notion, Limites e uso, Orquestrador, QA Logger, Pedidos de escrita, Presets de agente) e Transferência; a ferramenta ativa ganha is-active',
      disabled: 'Exportar e Importar canvas desabilitados enquanto isBusy (limpando ou transferindo)',
    },
    controls: [
      {
        locator: 'onClick={() => onSelect(tool)}',
        kind: 'button',
        effect:
          'hover/foco pré-carrega o chunk daquela ferramenta (preloadCanvasTool); o clique alterna activeTool no CanvasView (a mesma ferramenta fecha); Tarefas Notion não abre painel: cria/foca o bloco NotionTasksNode',
        failure: 'falha no pré-carregamento é engolida de propósito; a falha real aparece no painel de erro do hospedeiro ao abrir',
        test: { file: SMOKE_PROMPTS, check: 'abrirPainel' },
      },
      {
        locator: 'onClick={run}',
        kind: 'button',
        effect:
          'Exportar: canvas:export monta o pacote e files:save-text abre o "Salvar como" de um .fxcanvas; Exportar com a saída dos terminais: o mesmo, levando a cauda (até 1 MB por terminal, 8 MB no total) do arquivo em disco de cada bloco, crua, que a importação devolve ao arquivo do bloco; Importar: abre o seletor (input escondido na barra), valida tamanho (60 MB) e conteúdo (canvas:validate-import), pede confirmação e substitui o canvas (canvas:import), fechando qualquer ferramenta',
        failure:
          'erros viram window.alert com a mensagem ("Não foi possível exportar o canvas.", "Arquivo .fxcanvas inválido." …); cancelar o salvar ou o confirm não faz nada; importação falha regrava os blocos atuais',
        disabledWhen: 'isBusy',
      },
    ],
    persistence: [
      'nenhuma para o menu (seção Ferramentas sem storageKey: volta recolhida a cada sessão)',
      'arquivo .fxcanvas escolhido pela pessoa (exportar)',
      'canvas salvo substituído (importar)',
    ],
    ipc: ['canvas:export', 'canvas:validate-import', 'canvas:import', 'files:save-text'],
    dependsOn: [
      'preloadCanvasTool',
      'CanvasToolbar (SidebarSection Ferramentas, importInputRef)',
      'useCanvasTransfer (exportAll, importFile, isBusy)',
    ],
    tests: [
      { file: SMOKE_PROMPTS, check: 'abrirPainel' },
      { file: SMOKE_CONTAS, check: 'abrirLimitesEUso' },
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarExportarEImportarCanvas' },
      { file: 'electron/core/devtools-save-file-guard.test.cjs' },
      { file: 'electron/services/canvas-transfer.test.cjs' },
      { file: 'src/features/onboarding/onboarding-catalog.test.ts' },
    ],
    gaps: [
      {
        what: 'Exportar canvas (arquivo gravado com os blocos) e Importar canvas (confirmação aceita, canvas devolvido ao exportado) são exercitados (checarExportarEImportarCanvas); "Exportar com a saída dos terminais", a recusa da confirmação e o canvas travado seguem sem teste de interface',
        risk: 'médio',
        task: NOVA_SMOKE,
      },
    ],
    overlap:
      'dentro da sidebar (z-26), na seção recolhível "Ferramentas"; com a sidebar recolhida (trilho de 52 px) o menu não aparece. Não cobre nada: os painéis que abre nascem à direita da sidebar',
  },
  {
    id: 'tool-prompt-detail',
    name: 'Detalhe de preset de prompt',
    layer: 'panel',
    owner: `${TOOLS}/PromptDetailPanel.tsx`,
    states: {
      normal:
        'campos Nome, Descrição, Escopo e Prompt completo do preset como rascunho local, sem autosave, dentro da moldura do PromptsPanel (panelId prompt-detail)',
      pending: 'rascunho diferente do salvo (isDirty): faixa com Cancelar e Salvar, e Inserir travado',
      success: '"Salvo" no lugar de Inserir por 1,5 s depois de Salvar (não aparece na primeira gravação de um preset; ver lacuna)',
      disabled: 'Restaurar padrão sem edição salva (canResetToPreset falso); Inserir com rascunho pendente',
    },
    controls: [
      {
        locator: 'Voltar à lista',
        kind: 'button',
        effect:
          'com rascunho pendente pede window.confirm("Descartar as edições não salvas deste prompt?"); confirmado ou sem rascunho, volta à lista (detailId = null)',
        failure: 'cancelar o confirm mantém o detalhe',
      },
      {
        locator: 'value={scope}',
        kind: 'select',
        effect: 'muda o escopo no rascunho local; só grava em Salvar',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'onClick={cancelDraft}',
        kind: 'button',
        effect: 'volta todos os campos ao texto salvo, sem gravar',
        failure: 'sem falha própria (estado local)',
        disabledWhen: 'só aparece com rascunho pendente',
      },
      {
        locator: 'onClick={() => void saveDraft()}',
        kind: 'button',
        effect:
          'onSave → editPreset: grava o rascunho inteiro como override do preset (upsertPresetOverride) com debounce de 500 ms (automations:save); o item ganha o selo "editado"',
        failure:
          'falha de gravação vira aviso no item da lista, invisível no detalhe e apagado em 2,5 s; fechar o painel antes de 500 ms grava o pendente na hora',
        disabledWhen: 'só aparece com rascunho pendente',
      },
      {
        locator: 'onClick={onReset}',
        kind: 'button',
        effect: 'Restaurar padrão: apaga o override (automations:delete) e o texto padrão do preset volta, sem confirmação',
        failure: 'falha ao restaurar o padrão avisa na barra de status e o override continua',
        disabledWhen: 'sem edição salva',
      },
      {
        locator: 'onClick={onInsert}',
        kind: 'button',
        effect: 'insertPrompt do PromptsPanel: digita o prompt no terminal expandido sem Enter, ou copia',
        failure: 'nenhum retorno no detalhe: Enviando, Feito e Tentar de novo só aparecem na lista; sem trava contra duplo clique',
        disabledWhen: 'rascunho pendente',
      },
    ],
    persistence: [
      'processo principal: override do preset (automations:save / automations:delete)',
      'nenhuma para o rascunho (Esc, Fechar e Voltar perguntam antes de descartá-lo)',
      'localStorage felixo:canvas-panel-width:prompt-detail e felixo:canvas-panel-height:prompt-detail (gravados ao redimensionar, mas a moldura não os relê ao entrar no detalhe)',
    ],
    ipc: ['automations:save', 'automations:delete', 'context-file:write', 'pty:write'],
    dependsOn: ['PromptsPanel (editPreset, removeCustomAutomation, insertPrompt)', 'FelixoSelect', 'prompt-overrides'],
    tests: [
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarDetalheDoPrompt' },
      { file: 'src/features/shared/ipc/ipc-failures-2.test.ts' },
      { file: 'src/features/canvas/services/prompt-overrides.test.ts' },
    ],
    gaps: [
      {
        what: 'Ver, editar, Cancelar, Salvar e Restaurar padrão são exercitados (checarDetalheDoPrompt); inserir no terminal pelo detalhe e a troca de escopo seguem sem teste de interface',
        risk: 'médio',
        task: NOVA_SMOKE,
      },
    ],
    overlap:
      'dentro da moldura do PromptsPanel (porte xl, z-20/z-30); rodapé de ações colado à borda inferior (-mb-3); a textarea (min-h-80) rola dentro do painel',
  },
  {
    id: 'tool-git-changes',
    name: 'Grupos Stage e Alterações (Source Control)',
    layer: 'panel',
    owner: `${TOOLS}/GitChangesList.tsx`,
    states: {
      normal:
        'um grupo por lado (Stage ou Alterações) com contador, ação em massa e uma linha por arquivo (nome, pasta, letra de status); a linha aberta no leitor ganha is-active',
      empty: 'grupo sem entradas não renderiza; com os dois vazios o GitPanel mostra "Sem alterações pendentes."',
      disabled: 'ação em massa, descartar e ação por arquivo travadas enquanto o GitPanel está busy',
    },
    controls: [
      {
        locator: 'onClick={onBulk}',
        kind: 'button',
        effect:
          'Stage: "Tirar tudo do stage" (git:unstage-all); Alterações: "Adicionar tudo ao stage" (git:stage-all); relê o status e o leitor',
        failure: '"Falha ao tirar do stage." / "Falha ao adicionar ao stage." ou a mensagem do git em vermelho no cabeçalho do painel',
        disabledWhen: 'busy',
      },
      {
        locator: 'onClick={() => onOpen(entry)}',
        kind: 'button',
        effect: 'abre o arquivo no leitor do lado do grupo (git:get-file-diff com staged/untracked) e revela as pastas dele no explorador',
        failure: 'diff recusado: mensagem em vermelho e o leitor diz "Não foi possível ler as diferenças deste arquivo."',
      },
      {
        locator: 'onClick={() => onDiscard(entry)}',
        kind: 'button',
        effect:
          'só no grupo Alterações: window.confirm (arquivo novo: "Apagar o arquivo novo …"; demais: "Descartar as alterações de … e voltar ao último commit?") e git:discard-file; relê status e árvore; se era o arquivo aberto, limpa o leitor',
        failure: 'cancelar não faz nada; recusa vira "Falha ao descartar as alterações." em vermelho',
        disabledWhen: 'busy; não renderiza no grupo Stage',
      },
      {
        locator: 'onClick={() => onFileAction(entry)}',
        kind: 'button',
        effect: 'Stage: git:unstage-file; Alterações: git:stage-file; relê o status e o leitor',
        failure: '"Falha ao tirar do stage." / "Falha ao adicionar ao stage." ou a mensagem do git em vermelho',
        disabledWhen: 'busy',
      },
    ],
    persistence: ['repositório git no disco (índice e arquivos descartados)'],
    ipc: ['git:stage-all', 'git:unstage-all', 'git:stage-file', 'git:unstage-file', 'git:discard-file', 'git:get-file-diff'],
    dependsOn: ['GitPanel (runAction, openFile, discard)', 'git-status (splitPath, statusDescriptor)'],
    tests: [
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarSourceControl' },
      { file: `${TOOLS}/git-status.test.ts` },
      { file: 'electron/services/git-service.test.cjs' },
    ],
    gaps: [
    ],
    overlap: 'coluna do meio do Source Control, dentro da moldura workspace; sem camada própria',
  },
  {
    id: 'tool-git-explorer',
    name: 'Explorador do repositório (Source Control)',
    layer: 'panel',
    owner: `${TOOLS}/GitExplorer.tsx`,
    states: {
      normal:
        'árvore do que o git enxerga (sem ignorados), pastas com contador de alterados; filtro por texto e "só o que mudou" abrem a árvore inteira; repositório grande avisa que mostra só os primeiros arquivos',
      loading: '"Lendo o repositório…" enquanto git:list-files responde',
      empty:
        '"Nada alterado por aqui." (só alterados) ou "Nenhum arquivo corresponde ao filtro." — este também quando git:list-files falha',
    },
    controls: [
      {
        locator: 'onClick={() => onChangedOnlyChange(!changedOnly)}',
        kind: 'button',
        effect: 'alterna mostrar só arquivos alterados (aria-pressed); com filtro ativo todas as pastas abrem',
        failure: 'sem falha própria (estado do GitPanel, não persiste)',
      },
      {
        locator: 'onClick={() => onToggleDir(node.path)}',
        kind: 'button',
        effect: 'abre/fecha a pasta (toggleDir em expanded)',
        failure: 'sem falha própria (estado local)',
      },
      {
        locator: 'onClick={() => onOpenFile(node.path)}',
        kind: 'button',
        effect: 'openPath: arquivo alterado abre o diff do lado ainda mexível; arquivo limpo abre o conteúdo (git:read-file)',
        failure:
          'leitura recusada: mensagem em vermelho e "Não foi possível ler este arquivo."; acima de 1 MB: "Arquivo grande demais para abrir aqui"; binário: aviso de binário',
      },
    ],
    persistence: ['nenhuma: filtro, pastas abertas e "só o que mudou" vivem no estado do GitPanel'],
    ipc: ['git:list-files', 'git:read-file', 'git:get-file-diff'],
    dependsOn: ['GitPanel (expanded, query, changedOnly, openPath)', 'repo-tree (filterRepoTree)', 'statusDescriptor'],
    tests: [
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarSourceControl' },
      { file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarSourceControl' },
      { file: 'src/features/canvas/components/focus-keyboard-a11y.test.ts' },
      { file: `${TOOLS}/repo-tree.test.ts` },
      { file: `${TOOLS}/git-status.test.ts` },
    ],
    gaps: [
    ],
    overlap: 'primeira coluna do Source Control (some com o botão do explorador); sem camada própria',
  },
  {
    id: 'tool-git-history',
    name: 'Histórico da branch (Source Control)',
    layer: 'panel',
    owner: `${TOOLS}/GitHistory.tsx`,
    states: {
      normal:
        'commits recentes (assunto, hash curto, autor, "há X" relativo ao instante da leitura); os primeiros `ahead` vêm marcados "não enviado"',
      loading: '"Lendo o histórico…" só sem commits; numa releitura a lista antiga fica até a nova chegar',
      empty: '"Nenhum commit ainda." — também quando git:get-log falha (erro mascarado)',
    },
    controls: [],
    persistence: ['nenhuma (relido a cada abertura e ação via git:get-log)'],
    ipc: ['git:get-log'],
    dependsOn: ['GitPanel (commits, historyLoading, ahead, historyReadAt)', 'formatRelativeTime'],
    tests: [{ file: 'src/features/shared/ipc/ipc-failures.test.ts' }, { file: 'electron/services/git-service.test.cjs' }],
    gaps: [
    ],
    overlap: 'coluna do meio, aba Histórico; sem camada própria',
  },
  {
    id: 'tool-git-diff-view',
    name: 'Leitor de diff e conteúdo (Source Control)',
    layer: 'panel',
    owner: `${TOOLS}/GitDiffView.tsx`,
    states: {
      normal:
        'cabeçalho com caminho e lado (no stage, não preparado, arquivo novo, sem alterações + tamanho) e tabela com números de linha (antiga e nova no diff, uma coluna no conteúdo)',
      empty:
        'sem arquivo: "Escolha um arquivo para ver o que mudou."; diff vazio: "Sem diferenças de texto para mostrar — pode ser arquivo binário ou apenas mudança de permissão."',
      loading: '"Lendo diferenças…" ou "Lendo o arquivo…"',
      error:
        '"Não foi possível ler as diferenças deste arquivo." (diff null) ou "Não foi possível ler este arquivo."; binário e arquivo acima de 1 MB têm aviso próprio',
    },
    controls: [],
    persistence: ['nenhuma'],
    ipc: ['git:get-file-diff', 'git:read-file'],
    dependsOn: ['GitPanel (selected, diff, fileContent, readerLoading)', 'parseDiff (git-diff)'],
    tests: [{ file: 'scripts/canvas-smoke-paineis.cjs', check: 'checarSourceControl' }, { file: `${TOOLS}/git-diff.test.ts` }],
    gaps: [
      {
        what: 'O diff de um arquivo alterado e o conteúdo de um arquivo limpo são exibidos e conferidos (checarSourceControl); um diff grande (até 1 MB, GIT_COMMAND_MAX_BUFFER) segue virando uma tabela inteira sem virtualização e sem teste de desempenho.',
        risk: 'baixo',
        task: NOVA_SMOKE,
      },
    ],
    overlap: 'terceira coluna do Source Control; rola por dentro (felixo-scm-diff-body); sem camada própria',
  },
  {
    id: 'tool-lazy-chunks',
    name: 'Carregamento sob demanda dos painéis',
    layer: 'panel',
    owner: 'src/features/canvas/components/canvas-tool-imports.ts',
    states: {
      normal:
        'cada painel é um chunk próprio (import dinâmico, React.lazy em canvas-tool-loaders.tsx); ao carregar, markToolLoaded grava a ferramenta em globalThis.__felixoLoadedCanvasTools, no data-felixo-loaded-canvas-tools do <html> e na marca felixo:chunk:<ferramenta>:loaded',
      loading: 'chunk baixando: o Suspense do hospedeiro mostra "Carregando <ferramenta>…"',
      error:
        'import rejeitado: o ToolPanelErrorBoundary mostra "Não foi possível carregar este painel."; o pré-carregamento por hover/foco (canvas-tool-preloaders.ts) engole a falha de propósito',
    },
    controls: [],
    persistence: ['nenhuma (cache de módulos do renderer até o reload)'],
    ipc: [],
    dependsOn: [
      'React.lazy (canvas-tool-loaders.tsx)',
      'preloadCanvasTool (canvas-tool-preloaders.ts)',
      'CanvasToolPanels (Suspense e ToolPanelErrorBoundary)',
    ],
    tests: [
      { file: 'scripts/bundle-load-benchmark.cjs', check: 'readFetchAllChunkMarks' },
      { file: 'scripts/bundle-load-benchmark.test.cjs' },
    ],
    gaps: [
      {
        what: 'só o chunk do Fetch All é observado (bundle-load-benchmark); nenhum teste força a falha de um chunk para ver o estado de erro',
        risk: 'baixo',
        task: NOVA_SMOKE,
      },
    ],
    overlap: 'sem superfície própria: os estados aparecem na moldura CanvasPanel do hospedeiro',
  },
]

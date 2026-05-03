# Frontend — Componentes React

Status: concluido.

Todos os componentes ficam em `app/src/features/chat/components/`.

---

## ChatWorkspace

**Arquivo:** `components/ChatWorkspace.tsx`
**Responsabilidade:** Orquestração central. Gerencia todo o estado da sessão de chat, histórico de sessões e integra com o backend Electron.

### Estado

| Estado | Tipo | Descrição |
|--------|------|-----------|
| `models` | `Model[]` | Lista de modelos salvos (localStorage) |
| `selectedModelId` | `string \| null` | Modelo ativo |
| `messages` | `ChatMessage[]` | Mensagens da conversa atual |
| `sessions` | `ChatSession[]` | Histórico de chats anteriores (em memória) |
| `projects` | `Project[]` | Projetos Git importados |
| `activeProjectIds` | `Set<string>` | Projetos ativos no contexto do prompt |
| `input` | `string` | Texto do campo de entrada |
| `isModelSettingsOpen` | `boolean` | Visibilidade do modal de modelos |
| `isProjectsOpen` | `boolean` | Visibilidade do modal de projetos |
| `activeSessionId` | `string \| null` | Sessão CLI em andamento |
| `isSidebarOpen` | `boolean` | Estado da sidebar |
| `isTerminalPanelOpen` | `boolean` | Estado do painel Terminal |

### Funções

| Função | Descrição |
|--------|-----------|
| `sendMessage()` | Valida input, cria `sessionId`, resolve `threadId`, monta prompt e chama `window.felixo.cli.send()` |
| `handleStreamEvent(event)` | Roteador de eventos: text → append, done → complete, error → error |
| `appendAssistantText(sessionId, text)` | Acumula texto incrementalmente na mensagem ativa |
| `completeAssistantMessage(sessionId, content, status)` | Finaliza resposta, remove `isStreaming` |
| `appendImmediateError(prompt, model, message)` | Cria par user+error sem streaming |
| `stopStreaming()` | Chama `window.felixo.cli.stop({ sessionId, threadId })` e marca sessão como parada |
| `resetChat()` | Salva sessão atual no histórico e limpa messages para o estado inicial |
| `saveCurrentSession()` | Serializa a conversa ativa como `ChatSession` e adiciona ao topo de `sessions` |
| `loadSession(session)` | Salva sessão atual e restaura as mensagens de uma sessão do histórico |
| `getConversationThreadId(model)` | Mantém um `threadId` estável enquanto a conversa usa o mesmo modelo |
| `resetConversationThread(options)` | Reseta thread lógica em novo chat, troca de modelo ou sessão carregada |
| `resolveEventThreadId(event)` | Resolve qual thread do Terminal deve receber status |
| `addProjects(projects)` | Adiciona projetos sem duplicar caminho |
| `toggleProject(project)` | Ativa/desativa projeto no contexto |
| `addModel(model)` | Adiciona ou substitui modelo, salva no localStorage |
| `removeModel(model)` | Remove modelo e salva |
| `clearModels()` | Remove todos e salva |
| `createCliPrompt(...)` | Formata prompt com histórico recente, contagem de mensagens, projetos ativos e diff de projetos |
| `formatHistoryMessage(message, index, models)` | Serializa mensagem histórica como `[User]` ou `[Modelo]` |
| `resolveMessageModelLabel(message, models)` | Resolve nome do modelo da mensagem |
| `createSessionId()` | Gera UUID v4 simples |

### Identidades de execução

- `threadId`: fica estável na conversa enquanto o modelo não muda; alimenta o painel Terminal e o processo persistente quando existe.
- `sessionId`: é criado por mensagem; identifica qual mensagem assistente recebe os chunks do streaming.
- `resumePrompt`: versão curta do prompt, sem histórico completo, usada quando o backend consegue reaproveitar contexto nativo ou processo persistente.

---

## AppSidebar

**Arquivo:** `components/AppSidebar.tsx`
**Responsabilidade:** Navegação lateral com lista de modelos, histórico de sessões e redimensionamento por drag. Hospeda o `SearchPanel` internamente.

### Props

| Prop | Tipo | Descrição |
|------|------|-----------|
| `models` | `Model[]` | Lista de modelos para exibir |
| `sessions` | `ChatSession[]` | Histórico de chats para pesquisa |
| `isOpen` | `boolean` | Sidebar visível ou recolhida |
| `onNewIdea` | `() => void` | Callback para novo chat |
| `onOpenModelSettings` | `() => void` | Abre modal de modelos |
| `onToggleSidebar` | `() => void` | Recolhe a sidebar |
| `onOpenProjects` | `() => void` | Abre o ProjectsModal |
| `onSelectSession` | `(session: ChatSession) => void` | Carrega uma sessão do histórico |
| `onToggleProject` | `(project: Project) => void` | Ativa/desativa um projeto (toggle) |
| `projects` | `Project[]` | Lista de projetos para exibir na subseção |
| `activeProjectIds` | `Set<string>` | Projetos atualmente ativos |

### Constantes

| Constante | Valor | Descrição |
|-----------|-------|-----------|
| `MIN_WIDTH` | 160 | Largura mínima em px |
| `MAX_WIDTH` | 480 | Largura máxima em px |
| `DEFAULT_WIDTH` | 244 | Largura padrão em px |

### Funções

| Função | Descrição |
|--------|-----------|
| `handleDragStart(e)` | Inicia drag, registra posição inicial e desativa transição CSS |
| `handleNavClick(label)` | "Novo chat" → reset; "Pesquisar" → abre SearchPanel; "Projetos" → toggle expansão |
| `onMouseMove` | Calcula nova largura com clamp entre MIN e MAX |
| `onMouseUp` | Encerra drag, restaura cursor e transição |

### Itens de navegação

`Novo chat`, `Pesquisar`, `Projetos`, `Automações`

#### Comportamento de Projetos

- Clique no item "Projetos" expande/colapsa a lista (seta indica o estado)
- Colapsado por padrão; quando há projeto ativo, ele aparece abaixo mesmo com a lista colapsada
- Botão `+` ao lado do título abre o `ProjectsModal` sem expandir a lista
- Expandido mostra todos os projetos ou "Nenhum projeto selecionado"
- Projeto ativo destacado em âmbar; clicar faz toggle (ativa/desativa)

### Estado interno

| Estado | Tipo | Descrição |
|--------|------|-----------|
| `isSearchOpen` | `boolean` | Controla visibilidade do SearchPanel |
| `isProjectsExpanded` | `boolean` | Controla expansão da lista de projetos |

---

## ProjectsModal

**Arquivo:** `components/ProjectsModal.tsx`
**Responsabilidade:** Modal para adicionar e remover projetos Git. Suporta importação de repositório único ou workspace com detecção automática de repos.

### Props

| Prop | Tipo | Descrição |
|------|------|-----------|
| `isOpen` | `boolean` | Visibilidade do modal |
| `projects` | `Project[]` | Lista atual de projetos |
| `onClose` | `() => void` | Fecha o modal |
| `onAddProjects` | `(projects: Project[]) => void` | Adiciona um ou mais projetos |
| `onRemoveProject` | `(project: Project) => void` | Remove um projeto |

### Abas

| Aba | Descrição |
|-----|-----------|
| `Repositório` | Seleciona uma pasta única via dialog nativo do Electron |
| `Workspace` | Seleciona uma pasta-pai; detecta subpastas com `.git` e exibe checklist para importação em lote |

### Funções

| Função | Descrição |
|--------|-----------|
| `pickRepo()` | Chama `window.felixo.projects.pickFolder()` e adiciona o repo diretamente |
| `pickWorkspace()` | Chama `pickFolder()` e depois `detectRepos()` para popular a lista de detecção |
| `toggleSelected(path)` | Marca/desmarca repo no checklist do workspace |
| `confirmWorkspace()` | Chama `onAddProjects` com os repos selecionados e limpa a detecção |

### Comportamento

- Fecha com `Escape`
- Fecha ao clicar no overlay externo
- Botões ficam desabilitados durante loading
- Repos já existentes em `projects` são filtrados da detecção de workspace
- Lista de projetos adicionados exibida na parte inferior do modal com botão de remoção individual

---

## SearchPanel

**Arquivo:** `components/SearchPanel.tsx`
**Responsabilidade:** Painel de busca em tempo real sobreposto à sidebar. Filtra sessões por título e conteúdo das mensagens enquanto o usuário digita.

### Props

| Prop | Tipo | Descrição |
|------|------|-----------|
| `sessions` | `ChatSession[]` | Lista de sessões a pesquisar |
| `isOpen` | `boolean` | Painel visível ou oculto |
| `onClose` | `() => void` | Fecha o painel |
| `onSelectSession` | `(session: ChatSession) => void` | Carrega a sessão selecionada |

### Comportamento

- Foca o input automaticamente ao abrir (`useEffect` + `setTimeout`)
- Fecha com tecla `Escape`
- Busca case-insensitive no título e no conteúdo de todas as mensagens
- Destaca o trecho encontrado com `<mark>` via `dangerouslySetInnerHTML`
- Exibe snippet da primeira mensagem que contém o termo buscado (truncado em 80 chars)

---

## ChatThread

**Arquivo:** `components/ChatThread.tsx`
**Responsabilidade:** Renderiza o histórico de mensagens com scroll automático para o final.

### Props

| Prop | Tipo | Descrição |
|------|------|-----------|
| `messages` | `ChatMessage[]` | Histórico completo |
| `models` | `Model[]` | Para resolver labels de modelos |

### Comportamento

- Usa `useRef` + `useEffect` para scroll automático após cada mensagem
- Exibe ícone de usuário (`User`) ou bot (`Bot`) por role
- Mostra cursor piscando quando `isStreaming: true`
- Exibe timestamp formatado em pt-BR (HH:mm)

---

## Composer

**Arquivo:** `components/Composer.tsx`
**Responsabilidade:** Campo de entrada, seletor de modelo e botões de enviar/parar.

### Props

| Prop | Tipo | Descrição |
|------|------|-----------|
| `input` | `string` | Valor atual do textarea |
| `starters` | `string[]` | Sugestões de início rápido |
| `models` | `Model[]` | Lista de modelos disponíveis |
| `selectedModel` | `Model \| null` | Modelo selecionado |
| `variant` | `'home' \| 'dock'` | Layout da tela inicial ou do chat ativo |
| `isStreaming` | `boolean` | Bloqueia envio durante streaming |
| `onInputChange` | `(v: string) => void` | Atualiza input |
| `onSelectModel` | `(id: ModelId) => void` | Troca modelo ativo |
| `onSubmit` | `() => void` | Envia mensagem |
| `onStop` | `() => void` | Para streaming |

### Funções

| Função | Descrição |
|--------|-----------|
| `handleSubmit(event)` | Previne default e chama onSubmit se não estiver em streaming |
| `handleKeyDown(event)` | Enter sem Shift envia; Shift+Enter quebra linha |

---

## ModelSettingsModal

**Arquivo:** `components/ModelSettingsModal.tsx`
**Responsabilidade:** Modal para importar, configurar e remover CLIs locais.

### Props

| Prop | Tipo | Descrição |
|------|------|-----------|
| `models` | `Model[]` | Lista atual de modelos |
| `selectedModel` | `Model \| null` | Modelo selecionado atualmente |
| `isOpen` | `boolean` | Visibilidade do modal |
| `onClose` | `() => void` | Fecha modal |
| `onAddModel` | `(m: Model) => void` | Adiciona modelo |
| `onRemoveModel` | `(m: Model) => void` | Remove modelo |
| `onClearModels` | `() => void` | Remove todos |

### Funções

| Função | Descrição |
|--------|-----------|
| `handleFileChange(event)` | Processa arquivo selecionado, extrai nome e comando |
| `handleSubmit(event)` | Valida campos e chama onAddModel |
| `removeModel(model)` | Chama onRemoveModel |
| `clearModels()` | Chama onClearModels |
| `createSelectionFromBrowserFile(file)` | Extrai `ModelFileSelection` do arquivo do browser |
| `createCommandPath(fileName, filePath)` | Normaliza caminho relativo a `ai-clis/` |
| `inferModelName(content, fileName)` | Extrai nome de comentário `#` no topo do arquivo |
| `getFileNameFromCommand(command)` | Extrai nome do arquivo do comando |

---

## TerminalPanel

**Arquivo:** `components/TerminalPanel.tsx`
**Responsabilidade:** Painel lateral direito que mostra eventos legíveis da thread CLI ativa ou de threads anteriores.

### Props

| Prop | Tipo | Descrição |
|------|------|-----------|
| `sessions` | `TerminalOutputSession[]` | Threads de terminal acumuladas pelo hook |
| `isOpen` | `boolean` | Painel aberto ou recolhido |
| `onToggleOpen` | `() => void` | Abre/recolhe painel |
| `onClear` | `() => void` | Limpa eventos locais do terminal |

### Comportamento

- Lista threads por `sessionId` do Terminal, que corresponde ao `threadId` da conversa.
- Exibe status `running`, `completed`, `error` ou `stopped`.
- Mostra quantidade de eventos e bytes acumulados por thread.
- Faz scroll automático enquanto o usuário está no fim da saída.
- Pausa o autoscroll quando o usuário rola para cima.
- Mescla chunks consecutivos de resposta do assistente para reduzir ruído visual.
- Mostra metadados como tokens, custo, duração, modo de execução e id de provedor quando disponíveis.

### Tipos de evento exibidos

| kind | Origem |
|------|--------|
| `lifecycle` | Início, retomada, prompt recebido, processamento |
| `assistant` | Texto de resposta |
| `tool` | Uso ou resultado de ferramenta |
| `metrics` | Duração, custo e tokens |
| `stderr` | Avisos ou erros vindos de stderr |
| `error` | Falhas controladas do backend/adapter |

---

## QaLoggerPanel

**Arquivo:** `components/QaLoggerPanel.tsx`
**Responsabilidade:** Painel de debug no rodapé que exibe eventos do backend em tempo real.

### Níveis e Cores

| Nível | Cor |
|-------|-----|
| `error` | Vermelho |
| `warn` | Amarelo |
| `info` | Azul (sky) |
| `debug` | Verde |

### Funções

| Função | Descrição |
|--------|-----------|
| `clearLogs()` | Invoca `window.felixo.qaLogger.clear()` |
| `formatTime(value)` | Formata ISO string para HH:mm:ss |
| `formatDetails(details)` | Serializa detalhes em JSON legível |
| `getLevelClassName(level)` | Retorna classe CSS de cor por nível |

### Eventos capturados

Eventos de QA vêm do backend com `scope`, `level`, `sessionId`, `message` e `details`. Escopos comuns:

`cli:spawn`, `cli:persistent-spawn`, `cli:persistent-write`, `cli:process`, `cli:jsonl`, `cli:stdout`, `cli:stderr`, `cli:timeout`, `cli:close`, `cli:stop`, `cli:error`.

---

## Atualização 30/04/2026

### ChatWorkspace

- Mantém `customAutomations` e `contextAttachments`.
- Abre modais separados para Automações, Code e Felixo.
- "Novo chat" chama `cli:reset-thread`, limpa terminal local, input e anexos antes de gerar uma nova thread.
- `createCliPrompt(...)` inclui anexos de contexto com nome, tipo, tamanho, caminho local e preview textual quando disponível.

### AppSidebar

- Projetos continuam visíveis quando ativos, mesmo com a seção colapsada.
- Clicar em um modelo chama `onOpenModelSettingsFor(modelId)`, seleciona o modelo e abre suas configurações.
- Botões de rodapé foram separados:
  - `Code` abre `CodePanel`.
  - `Felixo` abre `FelixoSettingsModal`.

### Composer

- O botão `+` abre seletor de arquivos.
- Arquivos pequenos de texto entram no prompt com preview truncado.
- Arquivos binários entram como metadados de contexto.
- Selects de modelo, modelo do provedor e effort usam tema escuro para evitar fundo branco com texto branco.

### ModelSettingsModal

- Mostra capacidades por `cliType`.
- Permite editar `providerModel` e `reasoningEffort` do modelo selecionado.
- Continua permitindo importar/remover CLIs locais.

### AutomationsModal

**Arquivo:** `components/AutomationsModal.tsx`

Responsabilidade:

- listar automações padrão;
- criar automações personalizadas;
- remover automações personalizadas;
- aplicar o prompt da automação no composer.

Escopos suportados: `planning`, `code`, `docs`, `git`, `chat`.

### CodePanel

**Arquivo:** `components/CodePanel.tsx`

Responsabilidade:

- exibir resumo Git read-only dos projetos ativos;
- priorizar projetos ativos e, se não houver nenhum ativo, listar todos;
- consultar `window.felixo.git.getSummary({ projectPath })`;
- renderizar branch, status, diff stat e commits recentes.

### FelixoSettingsModal

**Arquivo:** `components/FelixoSettingsModal.tsx`

Responsabilidade:

- manter configurações/estado do app separados do modal de Modelos;
- exibir runtime, quantidade de projetos, projetos ativos e automações;
- editar memórias globais do usuário que entram no prompt normal e no contexto do orquestrador.

### TerminalPanel

- Pode ser recolhido para barra lateral compacta.
- Pode ser redimensionado horizontalmente.
- Alterna entre visão `Threads` e `Orquestrador`.

### QaLoggerPanel

- Recebe `isOpen` e `onToggleOpen`.
- Pode ser recolhido para barra inferior compacta.
- Pode ser redimensionado verticalmente.
- Continua escutando eventos quando recolhido para preservar a contagem.

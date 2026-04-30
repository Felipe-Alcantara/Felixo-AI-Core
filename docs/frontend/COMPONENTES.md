# Frontend — Componentes React

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
| `input` | `string` | Texto do campo de entrada |
| `isModelSettingsOpen` | `boolean` | Visibilidade do modal de modelos |
| `activeSessionId` | `string \| null` | Sessão CLI em andamento |
| `isSidebarOpen` | `boolean` | Estado da sidebar |

### Funções

| Função | Descrição |
|--------|-----------|
| `sendMessage()` | Valida input, cria sessionId, chama `window.felixo.cli.send()` |
| `handleStreamEvent(event)` | Roteador de eventos: text → append, done → complete, error → error |
| `appendAssistantText(sessionId, text)` | Acumula texto incrementalmente na mensagem ativa |
| `completeAssistantMessage(sessionId, content, status)` | Finaliza resposta, remove `isStreaming` |
| `appendImmediateError(prompt, model, message)` | Cria par user+error sem streaming |
| `stopStreaming()` | Chama `window.felixo.cli.stop()` e marca sessão como parada |
| `resetChat()` | Salva sessão atual no histórico e limpa messages para o estado inicial |
| `saveCurrentSession()` | Serializa a conversa ativa como `ChatSession` e adiciona ao topo de `sessions` |
| `loadSession(session)` | Salva sessão atual e restaura as mensagens de uma sessão do histórico |
| `addModel(model)` | Adiciona ou substitui modelo, salva no localStorage |
| `removeModel(model)` | Remove modelo e salva |
| `clearModels()` | Remove todos e salva |
| `createCliPrompt(input, messages, models)` | Formata prompt com histórico (últimas 12 mensagens) |
| `formatHistoryMessage(message, index, models)` | Serializa mensagem histórica como `[User]` ou `[Modelo]` |
| `resolveMessageModelLabel(message, models)` | Resolve nome do modelo da mensagem |
| `createSessionId()` | Gera UUID v4 simples |

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
| `onSelectSession` | `(session: ChatSession) => void` | Carrega uma sessão do histórico |

### Estado interno

| Estado | Tipo | Descrição |
|--------|------|-----------|
| `isSearchOpen` | `boolean` | Controla visibilidade do SearchPanel |

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
| `handleNavClick(label)` | Mapeia label do item de nav para callback correto; "Pesquisar" abre o SearchPanel |
| `onMouseMove` | Calcula nova largura com clamp entre MIN e MAX |
| `onMouseUp` | Encerra drag, restaura cursor e transição |

### Itens de navegação

`Novo chat`, `Pesquisar`, `Projetos`, `Automações`

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
| `variant` | `'landing' \| 'chat'` | Layout da landing ou do chat ativo |
| `isStreaming` | `boolean` | Bloqueia envio durante streaming |
| `onInputChange` | `(v: string) => void` | Atualiza input |
| `onSelectModel` | `(m: Model) => void` | Troca modelo ativo |
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
| `isOpen` | `boolean` | Visibilidade do modal |
| `onClose` | `() => void` | Fecha modal |
| `onAddModel` | `(m: ModelFileSelection) => void` | Adiciona modelo |
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

`spawn`, `stdout`, `stderr`, `non-json-output`, `close`, `stop`, `error`

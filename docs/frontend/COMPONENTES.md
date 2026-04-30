# Frontend — Componentes React

Todos os componentes ficam em `app/src/features/chat/components/`.

---

## ChatWorkspace

**Arquivo:** `components/ChatWorkspace.tsx`
**Responsabilidade:** Orquestração central. Gerencia todo o estado da sessão de chat e integra com o backend Electron.

### Estado

| Estado | Tipo | Descrição |
|--------|------|-----------|
| `models` | `Model[]` | Lista de modelos salvos (localStorage) |
| `selectedModelId` | `string \| null` | Modelo ativo |
| `messages` | `ChatMessage[]` | Histórico da conversa |
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
| `resetChat()` | Limpa messages para o estado inicial |
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
**Responsabilidade:** Navegação lateral com lista de modelos e redimensionamento por drag.

### Props

| Prop | Tipo | Descrição |
|------|------|-----------|
| `models` | `Model[]` | Lista de modelos para exibir |
| `isOpen` | `boolean` | Sidebar visível ou recolhida |
| `onNewIdea` | `() => void` | Callback para novo chat |
| `onOpenModelSettings` | `() => void` | Abre modal de modelos |
| `onToggleSidebar` | `() => void` | Recolhe a sidebar |
| `onSearch` | `() => void` | Ação de pesquisa |

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
| `handleNavClick(label)` | Mapeia label do item de nav para callback correto |
| `onMouseMove` | Calcula nova largura com clamp entre MIN e MAX |
| `onMouseUp` | Encerra drag, restaura cursor e transição |

### Itens de navegação

`Novo chat`, `Pesquisar`, `Projetos`, `Automações`

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

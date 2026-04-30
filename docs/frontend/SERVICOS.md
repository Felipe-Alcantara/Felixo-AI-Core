# Frontend — Serviços e Dados

---

## chat-service.ts

**Arquivo:** `app/src/features/chat/services/chat-service.ts`
**Responsabilidade:** Factory functions para criação de mensagens de chat.

### Exports

| Export | Tipo | Descrição |
|--------|------|-----------|
| `initialMessages` | `ChatMessage[]` | Array vazio — estado inicial do chat |
| `formatTime()` | `() => string` | Retorna hora atual em HH:mm (pt-BR) |
| `createUserMessage(content)` | `(string) => ChatMessage` | Cria mensagem com role `user` e timestamp |
| `createAssistantMessage(model, sessionId)` | `(Model \| null, string) => ChatMessage` | Cria mensagem vazia com `isStreaming: true` |

---

## model-storage.ts

**Arquivo:** `app/src/features/chat/services/model-storage.ts`
**Responsabilidade:** Persistência e normalização de modelos no `localStorage`.

### Exports

| Função | Assinatura | Descrição |
|--------|-----------|-----------|
| `loadModels` | `(fallback: Model[]) => Model[]` | Carrega do localStorage, aplica fallback se falhar |
| `saveModels` | `(models: Model[]) => void` | Serializa e salva no localStorage |
| `createModelId` | `(name: string) => string` | Gera ID único: slug do nome + timestamp |
| `detectModelCliType` | `(model) => CliType` | Detecta CliType pelo command/name/source |
| `normalizeCliType` | `(value: unknown) => CliType` | Valida e normaliza, fallback para `'unknown'` |
| `normalizeModel` | `(value: unknown) => Model \| null` | Valida shape do objeto, normaliza campos |
| `detectCliType` | `(value: string) => CliType` | Detecta por keywords: claude, codex, gemini |
| `isCliType` | `(value: unknown) => value is CliType` | Type guard para CliType |

### Chave no localStorage

`felixo-ai-core:models`

---

## types.ts

**Arquivo:** `app/src/features/chat/types.ts`
**Responsabilidade:** Definição central de todos os tipos da aplicação.

### Tipos

#### `CliType`
```ts
'claude' | 'codex' | 'gemini' | 'unknown'
```

#### `Model`
```ts
{
  id: string
  name: string
  command: string
  source: string
  cliType: CliType
}
```

#### `ModelFileSelection`
`Omit<Model, 'id'>` — usado ao importar antes de gerar ID.

#### `StreamEvent`
Union de eventos do chat. Todos carregam `sessionId`; a maioria também pode carregar `threadId`.

| type | Campos extras | Descrição |
|------|--------------|-----------|
| `'text'` | `text, sessionId, threadId?` | Chunk de texto do assistente |
| `'tool_use'` | `tool, input, sessionId, threadId?` | Uso de ferramenta |
| `'tool_result'` | `output, sessionId, threadId?` | Resultado de ferramenta |
| `'done'` | `cost?, duration?, stopped?, sessionId, threadId?` | Fim da resposta |
| `'error'` | `message, sessionId, threadId?` | Erro durante execução |

#### `TerminalOutputEvent`

Evento legível usado pelo painel Terminal.

```ts
{
  sessionId: string
  source: 'stdout' | 'stderr' | 'system'
  chunk: string
  severity?: 'debug' | 'info' | 'warn' | 'error'
  kind?: 'assistant' | 'error' | 'lifecycle' | 'metrics' | 'stderr' | 'tool'
  title?: string
  metadata?: Record<string, string | number | boolean | null | undefined>
}
```

No Terminal, `sessionId` representa a thread do terminal (`threadId` no fluxo do chat).

#### `QaLogEntry`
```ts
{
  id: number
  createdAt: string        // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  sessionId?: string
  message: string
  details: unknown
}
```

#### `ChatMessage`
```ts
{
  id: number
  role: 'user' | 'assistant'
  content: string
  model?: string
  sessionId?: string
  isStreaming?: boolean
  createdAt: string
}
```

#### `Project`
```ts
{
  id: string
  name: string   // nome da pasta do repositório
  path: string   // caminho absoluto no sistema de arquivos
}
```

#### `ChatSession`
```ts
{
  id: string
  title: string          // primeira mensagem do usuário, truncada em 60 chars
  messages: ChatMessage[]
  createdAt: string      // ISO 8601
  updatedAt: string      // ISO 8601
}
```

---

## data/models.ts

**Arquivo:** `app/src/features/chat/data/models.ts`
**Responsabilidade:** Dados estáticos da interface.

### Exports

| Export | Tipo | Descrição |
|--------|------|-----------|
| `initialModels` | `Model[]` | Array vazio (modelos carregados do localStorage) |
| `ideaStarters` | `string[]` | Labels dos botões de início rápido |
| `quickPrompts` | `string[]` | 4 prompts de exemplo para o Composer |

---

## vite-env.d.ts

**Arquivo:** `app/src/vite-env.d.ts`
**Responsabilidade:** Type definitions da bridge `window.felixo` exposta pelo preload.

### `window.felixo`

```ts
{
  platform: string
  versions: { chrome?: string; electron?: string; node?: string }
  getFilePath(file: File): string

  cli: {
    send(params: {
      sessionId: string
      threadId?: string
      prompt: string
      resumePrompt?: string
      model: Model
      cwd?: string
    }): Promise<CliInvokeResult>
    stop(params: { sessionId: string; threadId?: string }): Promise<CliInvokeResult>
    onStream(callback: (event: StreamEvent) => void): () => void
    onRawOutput(callback: (event: TerminalOutputEvent) => void): () => void
    onTerminalOutput(callback: (event: TerminalOutputEvent) => void): () => void
  }

  projects: {
    pickFolder(): Promise<string | null>
    detectRepos(folderPath: string): Promise<{ name: string; path: string }[]>
  }

  qaLogger: {
    getEntries(): Promise<QaLogEntry[]>
    clear(): Promise<CliInvokeResult>
    onEntry(callback: (entry: QaLogEntry) => void): () => void
    onCleared(callback: () => void): () => void
  }
}
```

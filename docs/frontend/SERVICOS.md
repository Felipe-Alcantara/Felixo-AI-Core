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
Union de 5 tipos:

| type | Campos extras | Descrição |
|------|--------------|-----------|
| `'text'` | `text, sessionId` | Chunk de texto do assistente |
| `'tool_use'` | `tool, input, sessionId` | Uso de ferramenta |
| `'tool_result'` | `output, sessionId` | Resultado de ferramenta |
| `'done'` | `cost?, duration?, stopped?, sessionId` | Fim da resposta |
| `'error'` | `message, sessionId` | Erro durante execução |

#### `QaLogEntry`
```ts
{
  id: string
  createdAt: string        // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  sessionId?: string
  message: string
  details?: unknown
}
```

#### `ChatMessage`
```ts
{
  id: string
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
    send(params: { prompt: string; cliType: CliType; sessionId: string; modelCommand: string }): Promise<CliInvokeResult>
    stop(params: { sessionId: string }): Promise<void>
    onStream(callback: (event: StreamEvent) => void): () => void
  }

  qaLogger: {
    getEntries(): Promise<QaLogEntry[]>
    clear(): Promise<void>
    onEntry(callback: (entry: QaLogEntry) => void): () => void
    onCleared(callback: () => void): () => void
  }
}
```

# Plano: Integrar CLIs de IA como backend do Felixo AI Core

## Contexto

O Felixo AI Core e um app Electron + React que hoje tem uma interface de chat funcional mas sem backend real — as respostas sao templates locais. O objetivo e usar os CLIs de IA (Claude Code, Codex, Gemini) como backend, spawnar processos em background, e mostrar as respostas em streaming na interface do app.

## Formato de streaming confirmado por testes reais

### Claude CLI

Comando: `claude --print --output-format stream-json --verbose --include-partial-messages [prompt]`

```jsonl
{"type":"system","subtype":"init","session_id":"...","model":"claude-opus-4-6",...}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Vou"}}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":" refatorar"}}}
{"type":"assistant","message":{"content":[{"type":"text","text":"Vou refatorar..."}]}}
{"type":"result","total_cost_usd":0.01,"duration_ms":2772,...}
```

### Codex CLI

Comando: `codex exec --json [prompt]`

```jsonl
{"type":"thread.started","thread_id":"..."}
{"type":"turn.started"}
{"type":"item.completed","item":{"type":"agent_message","text":"Hello"}}
{"type":"turn.completed","usage":{"input_tokens":13261,"output_tokens":5}}
```

Nota: Codex tem bug com UTF-8 nos paths (acentos em "Programacao"). Solucao: usar `--cd /path` com path ASCII ou rodar de diretorio sem acentos.

### Gemini CLI

Comando: `gemini --prompt "..." --output-format stream-json`

```jsonl
{"type":"init","timestamp":"...","session_id":"...","model":"gemini-3-flash-preview"}
{"type":"message","timestamp":"...","role":"user","content":"..."}
{"type":"message","timestamp":"...","role":"model","content":"..."}
{"type":"result","timestamp":"...","usage":{...}}
```

## Arquitetura

```
Renderer (React)                    Main Process (Node.js)
-----------------                   ----------------------
ChatWorkspace                       cli-process-manager.cjs
  |-- Composer ----IPC send-------> ipc-handlers.cjs
  |-- ChatThread <--IPC stream----    |-- adapters/
  |                                       |-- claude-adapter.cjs
  |                                       |-- codex-adapter.cjs
  |                                       |-- gemini-adapter.cjs
  |                                  (child_process.spawn)
  |                                       |
  |                                  CLI real (stdout JSONL)
```

### Fluxo completo

1. Usuario digita prompt no Composer e clica Enviar
2. ChatWorkspace cria mensagem do usuario + mensagem assistente vazia
3. Chama `window.felixo.cli.send({sessionId, prompt, modelCommand})`
4. Preload bridge encaminha via `ipcRenderer.invoke('cli:send', ...)`
5. Main process recebe, identifica o CLI pelo modelCommand
6. `cli-process-manager` spawna o processo com as flags corretas
7. stdout emite linhas JSONL
8. Adapter correto (claude/codex/gemini) parseia cada linha em StreamEvent normalizado
9. Main process envia StreamEvent via `webContents.send('cli:stream', event)`
10. Preload bridge entrega ao callback registrado com `onStream()`
11. ChatWorkspace recebe evento, appenda texto a ultima mensagem assistente
12. ChatThread re-renderiza com o texto novo (streaming em tempo real)
13. Quando chega evento `done`, libera o input e mostra custos/duracao

### Evento normalizado (StreamEvent)

```typescript
type StreamEvent =
  | { type: 'text'; text: string; sessionId: string }
  | { type: 'tool_use'; tool: string; input: string; sessionId: string }
  | { type: 'tool_result'; output: string; sessionId: string }
  | { type: 'done'; cost?: number; duration?: number; sessionId: string }
  | { type: 'error'; message: string; sessionId: string }
```

Cada adapter transforma o formato especifico do CLI neste formato unico.

## Fase 1: MVP com os 3 CLIs

### 1.1 Gerenciador de processos

**Criar:** `app/electron/services/cli-process-manager.cjs`

- `spawn(sessionId, command, args, cwd)` — `child_process.spawn()` com env correto
- `kill(sessionId)` — SIGTERM, SIGKILL apos 5s
- `Map<sessionId, ChildProcess>` para rastrear processos
- Cleanup em `app.before-quit`
- ENV com PATH: `/home/felipe/.nvm/versions/node/v25.9.0/bin:/home/felipe/.npm-global/bin`

### 1.2 Adapters (um por CLI)

**Criar:** `app/electron/services/adapters/claude-adapter.cjs`
- Parseia `stream_event.event.content_block_delta.delta.text` → `{type:'text'}`
- Parseia `result` → `{type:'done', cost, duration}`

**Criar:** `app/electron/services/adapters/codex-adapter.cjs`
- Parseia `item.completed.item.text` → `{type:'text'}`
- Parseia `turn.completed` → `{type:'done'}`
- Ignora `error` de reconexao (tipo reconnect)

**Criar:** `app/electron/services/adapters/gemini-adapter.cjs`
- Parseia `message` com `role:"model"` → `{type:'text'}`
- Parseia `result` → `{type:'done'}`

### 1.3 Selecao de adapter

O `cli-process-manager` ou `ipc-handlers` escolhe o adapter baseado no `cliType` do modelo:

```javascript
const adapters = {
  claude: require('./adapters/claude-adapter.cjs'),
  codex: require('./adapters/codex-adapter.cjs'),
  gemini: require('./adapters/gemini-adapter.cjs'),
}

// Cada adapter exporta:
// - getSpawnArgs(prompt) → { command, args }
// - parseLine(jsonLine) → StreamEvent | null
```

### 1.4 IPC Handlers

**Criar:** `app/electron/services/ipc-handlers.cjs`

```javascript
ipcMain.handle('cli:send', (event, { sessionId, prompt, model }) => {
  const adapter = adapters[model.cliType]
  const { command, args } = adapter.getSpawnArgs(prompt)
  const process = cliManager.spawn(sessionId, command, args, cwd)

  process.stdout.on('data', (chunk) => {
    // split em linhas, parseia cada uma
    for (const line of splitLines(chunk)) {
      const event = adapter.parseLine(line)
      if (event) {
        mainWindow.webContents.send('cli:stream', { ...event, sessionId })
      }
    }
  })
})

ipcMain.handle('cli:stop', (event, { sessionId }) => {
  cliManager.kill(sessionId)
})
```

### 1.5 Preload bridge

**Modificar:** `app/electron/preload.cjs`

```javascript
contextBridge.exposeInMainWorld('felixo', {
  // ... existente ...
  cli: {
    send: (params) => ipcRenderer.invoke('cli:send', params),
    stop: (params) => ipcRenderer.invoke('cli:stop', params),
    onStream: (callback) => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('cli:stream', handler)
      return () => ipcRenderer.removeListener('cli:stream', handler)
    },
  },
})
```

### 1.6 Tipos

**Modificar:** `app/src/vite-env.d.ts` — tipos do `window.felixo.cli`

**Modificar:** `app/src/features/chat/types.ts`:
- Adicionar `StreamEvent`
- Adicionar `cliType: 'claude' | 'codex' | 'gemini' | 'unknown'` ao `Model`

### 1.7 Chat service

**Modificar:** `app/src/features/chat/services/chat-service.ts`
- Remover `createLocalReply` e `compactIdea`
- `createAssistantMessage` cria mensagem vazia para streaming

### 1.8 ChatWorkspace

**Modificar:** `app/src/features/chat/components/ChatWorkspace.tsx`
- `sessionId` via `crypto.randomUUID()`
- `useEffect` com `onStream()` listener
- Handler: appenda texto, detecta done/error
- `isStreaming` state
- Botao parar via `cli.stop()`

### 1.9 ChatThread

**Modificar:** `app/src/features/chat/components/ChatThread.tsx`
- Cursor piscando durante streaming
- whitespace-pre-wrap por enquanto

### 1.10 Model storage

**Modificar:** `app/src/features/chat/services/model-storage.ts`
- `normalizeModel` aceita e valida `cliType`

## Arquivos — resumo

**Criar (4):**
1. `app/electron/services/cli-process-manager.cjs`
2. `app/electron/services/adapters/claude-adapter.cjs`
3. `app/electron/services/adapters/codex-adapter.cjs`
4. `app/electron/services/adapters/gemini-adapter.cjs`

**Modificar (8):**
5. `app/electron/main.cjs` — registrar IPC handlers
6. `app/electron/preload.cjs` — expor cli bridge
7. `app/src/vite-env.d.ts` — tipos bridge
8. `app/src/features/chat/types.ts` — StreamEvent, cliType
9. `app/src/features/chat/services/chat-service.ts` — remover replies locais
10. `app/src/features/chat/services/model-storage.ts` — normalizar cliType
11. `app/src/features/chat/components/ChatWorkspace.tsx` — streaming + IPC
12. `app/src/features/chat/components/ChatThread.tsx` — indicador streaming

## Verificacao

1. `npx tsc --noEmit` — sem erros
2. `npm run dev` — app abre
3. Importar modelo Claude, digitar prompt → streaming funciona
4. Importar modelo Codex, digitar prompt → streaming funciona
5. Importar modelo Gemini, digitar prompt → streaming funciona
6. Botao parar → processo CLI encerrado
7. Fechar app → nenhum processo orfao

## Fases futuras

- Multi-sessao (tabs por thread)
- Markdown rendering (react-markdown + shiki)
- Visualizacao de tool use (diffs, comandos)
- Persistencia de sessoes em disco
- Auto-deteccao de CLIs instalados


❯ /plan                                                                                            
  ⎿  Current Plan
     /home/felipe/.claude/plans/polished-sprouting-volcano.md

     Plano: Integrar CLIs de IA como backend do Felixo AI Core

     Contexto

     O Felixo AI Core e um app Electron + React que hoje tem uma interface de chat
     funcional mas sem backend real — as respostas sao templates locais. O objetivo e
      usar os CLIs de IA (Claude Code, Codex, Gemini) como backend, spawnar processos
      em background, e mostrar as respostas em streaming na interface do app.

     Formato de streaming confirmado por testes reais

     Claude CLI

     Comando: claude --print --output-format stream-json --verbose --include-partial-messages
     [prompt]

     {"type":"system","subtype":"init","session_id":"...","model":"claude-opus-4-6",.
     ..}
     {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"te
     xt_delta","text":"Vou"}}}
     {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"te
     xt_delta","text":" refatorar"}}}
     {"type":"assistant","message":{"content":[{"type":"text","text":"Vou
     refatorar..."}]}}
     {"type":"result","total_cost_usd":0.01,"duration_ms":2772,...}

     Codex CLI

     Comando: codex exec --json [prompt]

     {"type":"thread.started","thread_id":"..."}
     {"type":"turn.started"}
     {"type":"item.completed","item":{"type":"agent_message","text":"Hello"}}
     {"type":"turn.completed","usage":{"input_tokens":13261,"output_tokens":5}}

     Nota: Codex tem bug com UTF-8 nos paths (acentos em "Programacao"). Solucao:
     usar --cd /path com path ASCII ou rodar de diretorio sem acentos.

     Gemini CLI

     Comando: gemini --prompt "..." --output-format stream-json

     {"type":"init","timestamp":"...","session_id":"...","model":"gemini-3-flash-prev
     iew"}
     {"type":"message","timestamp":"...","role":"user","content":"..."}
     {"type":"message","timestamp":"...","role":"model","content":"..."}
     {"type":"result","timestamp":"...","usage":{...}}

     Arquitetura

     Renderer (React)                    Main Process (Node.js)
     -----------------                   ----------------------
     ChatWorkspace                       cli-process-manager.cjs
       |-- Composer ----IPC send-------> ipc-handlers.cjs
       |-- ChatThread <--IPC stream----    |-- adapters/
       |                                       |-- claude-adapter.cjs
       |                                       |-- codex-adapter.cjs
       |                                       |-- gemini-adapter.cjs
       |                                  (child_process.spawn)
       |                                       |
       |                                  CLI real (stdout JSONL)

     Fluxo completo

     1. Usuario digita prompt no Composer e clica Enviar
     2. ChatWorkspace cria mensagem do usuario + mensagem assistente vazia
     3. Chama window.felixo.cli.send({sessionId, prompt, modelCommand})
     4. Preload bridge encaminha via ipcRenderer.invoke('cli:send', ...)
     5. Main process recebe, identifica o CLI pelo modelCommand
     6. cli-process-manager spawna o processo com as flags corretas
     7. stdout emite linhas JSONL
     8. Adapter correto (claude/codex/gemini) parseia cada linha em StreamEvent
     normalizado
     9. Main process envia StreamEvent via webContents.send('cli:stream', event)
     10. Preload bridge entrega ao callback registrado com onStream()
     11. ChatWorkspace recebe evento, appenda texto a ultima mensagem assistente
     12. ChatThread re-renderiza com o texto novo (streaming em tempo real)
     13. Quando chega evento done, libera o input e mostra custos/duracao

     Evento normalizado (StreamEvent)

     type StreamEvent =
       | { type: 'text'; text: string; sessionId: string }
       | { type: 'tool_use'; tool: string; input: string; sessionId: string }
       | { type: 'tool_result'; output: string; sessionId: string }
       | { type: 'done'; cost?: number; duration?: number; sessionId: string }
       | { type: 'error'; message: string; sessionId: string }

     Cada adapter transforma o formato especifico do CLI neste formato unico.

     Fase 1: MVP com os 3 CLIs

     1.1 Gerenciador de processos

     Criar: app/electron/services/cli-process-manager.cjs

     - spawn(sessionId, command, args, cwd) — child_process.spawn() com env
     correto
     - kill(sessionId) — SIGTERM, SIGKILL apos 5s
     - Map<sessionId, ChildProcess> para rastrear processos
     - Cleanup em app.before-quit
     - ENV com PATH:
     /home/felipe/.nvm/versions/node/v25.9.0/bin:/home/felipe/.npm-global/bin

     1.2 Adapters (um por CLI)

     Criar: app/electron/services/adapters/claude-adapter.cjs
     - Parseia stream_event.event.content_block_delta.delta.text → {type:'text'}
     - Parseia result → {type:'done', cost, duration}

     Criar: app/electron/services/adapters/codex-adapter.cjs
     - Parseia item.completed.item.text → {type:'text'}
     - Parseia turn.completed → {type:'done'}
     - Ignora error de reconexao (tipo reconnect)

     Criar: app/electron/services/adapters/gemini-adapter.cjs
     - Parseia message com role:"model" → {type:'text'}
     - Parseia result → {type:'done'}

     1.3 Selecao de adapter

     O cli-process-manager ou ipc-handlers escolhe o adapter baseado no cliType
      do modelo:

     const adapters = {
       claude: require('./adapters/claude-adapter.cjs'),
       codex: require('./adapters/codex-adapter.cjs'),
       gemini: require('./adapters/gemini-adapter.cjs'),
     }

     // Cada adapter exporta:
     // - getSpawnArgs(prompt) → { command, args }
     // - parseLine(jsonLine) → StreamEvent | null

     1.4 IPC Handlers

     Criar: app/electron/services/ipc-handlers.cjs

     ipcMain.handle('cli:send', (event, { sessionId, prompt, model }) => {
       const adapter = adapters[model.cliType]
       const { command, args } = adapter.getSpawnArgs(prompt)
       const process = cliManager.spawn(sessionId, command, args, cwd)

       process.stdout.on('data', (chunk) => {
         // split em linhas, parseia cada uma
         for (const line of splitLines(chunk)) {
           const event = adapter.parseLine(line)
           if (event) {
             mainWindow.webContents.send('cli:stream', { ...event, sessionId })
           }
         }
       })
     })

     ipcMain.handle('cli:stop', (event, { sessionId }) => {
       cliManager.kill(sessionId)
     })

     1.5 Preload bridge

     Modificar: app/electron/preload.cjs

     contextBridge.exposeInMainWorld('felixo', {
       // ... existente ...
       cli: {
         send: (params) => ipcRenderer.invoke('cli:send', params),
         stop: (params) => ipcRenderer.invoke('cli:stop', params),
         onStream: (callback) => {
           const handler = (_event, data) => callback(data)
           ipcRenderer.on('cli:stream', handler)
           return () => ipcRenderer.removeListener('cli:stream', handler)
         },
       },
     })

     1.6 Tipos

     Modificar: app/src/vite-env.d.ts — tipos do window.felixo.cli

     Modificar: app/src/features/chat/types.ts:
     - Adicionar StreamEvent
     - Adicionar cliType: 'claude' | 'codex' | 'gemini' | 'unknown' ao Model

     1.7 Chat service

     Modificar: app/src/features/chat/services/chat-service.ts
     - Remover createLocalReply e compactIdea
     - createAssistantMessage cria mensagem vazia para streaming

     1.8 ChatWorkspace

     Modificar: app/src/features/chat/components/ChatWorkspace.tsx
     - sessionId via crypto.randomUUID()
     - useEffect com onStream() listener
     - Handler: appenda texto, detecta done/error
     - isStreaming state
     - Botao parar via cli.stop()

     1.9 ChatThread

     Modificar: app/src/features/chat/components/ChatThread.tsx
     - Cursor piscando durante streaming
     - whitespace-pre-wrap por enquanto

     1.10 Model storage

     Modificar: app/src/features/chat/services/model-storage.ts
     - normalizeModel aceita e valida cliType

     Arquivos — resumo

     Criar (4):
     1. app/electron/services/cli-process-manager.cjs
     2. app/electron/services/adapters/claude-adapter.cjs
     3. app/electron/services/adapters/codex-adapter.cjs
     4. app/electron/services/adapters/gemini-adapter.cjs

     Modificar (8):
     5. app/electron/main.cjs — registrar IPC handlers
     6. app/electron/preload.cjs — expor cli bridge
     7. app/src/vite-env.d.ts — tipos bridge
     8. app/src/features/chat/types.ts — StreamEvent, cliType
     9. app/src/features/chat/services/chat-service.ts — remover replies locais
     10. app/src/features/chat/services/model-storage.ts — normalizar cliType
     11. app/src/features/chat/components/ChatWorkspace.tsx — streaming + IPC
     12. app/src/features/chat/components/ChatThread.tsx — indicador streaming

     Verificacao

     1. npx tsc --noEmit — sem erros
     2. npm run dev — app abre
     3. Importar modelo Claude, digitar prompt → streaming funciona
     4. Importar modelo Codex, digitar prompt → streaming funciona
     5. Importar modelo Gemini, digitar prompt → streaming funciona
     6. Botao parar → processo CLI encerrado
     7. Fechar app → nenhum processo orfao

     Fases futuras

     - Multi-sessao (tabs por thread)
     - Markdown rendering (react-markdown + shiki)
     - Visualizacao de tool use (diffs, comandos)
     - Persistencia de sessoes em disco
     - Auto-deteccao de CLIs instalados

     "/plan open" to edit this plan in VS Code

───────────────────────────────────────────────────────────────────────────────────────────────────
❯  
───────────────────────────────────────────────────────────────────────────────────────────────────
  ⏸ plan mode on · 1 shell · ↓ to manage
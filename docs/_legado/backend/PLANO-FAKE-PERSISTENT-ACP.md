# Plano: Fake Persistent CLIs + AgentEvent/AgentSession + Gemini ACP

Status: concluido.

## Contexto

O Felixo AI Core consegue manter Claude como processo persistente via stream-json.
O proximo passo e validar que a arquitetura aguenta protocolos de sessao mais complexos
(como Gemini ACP) **antes** de plugar o Gemini real. Para isso, criamos dois fake agents
que simulam os protocolos, padronizamos os tipos de evento, e depois implementamos o
adapter Gemini ACP de verdade.

## Etapas

### 1. Criar tipos padrao AgentEvent e AgentSession

**Arquivo:** `app/electron/services/protocols/agent-events.cjs`

Exportar constantes/factories para os eventos padrao:

- `text_delta` — chunk de texto
- `tool_call` — chamada de ferramenta
- `session` — sessionId capturado
- `status` — mensagem de lifecycle
- `done` — fim com custo/duracao opcionais
- `error` — erro

E a interface logica AgentSession (em JSDoc):

- `start()` — inicia sessao
- `sendPrompt(prompt)` — envia prompt, retorna async iterable de AgentEvent
- `cancel()` — cancela execucao corrente
- `dispose()` — encerra processo

### 2. Criar fake-stream-json-agent.cjs

**Arquivo:** `app/electron/services/adapters/testing/fake-stream-json-agent.cjs`

Script Node.js standalone que simula o protocolo Claude stream-json:

- Le stdin como JSONL
- Emite `system` com session_id
- Emite `stream_event` com `content_block_delta` (texto em chunks)
- Emite `result` com done
- Fica vivo esperando proximo input
- Suporta multiplos prompts na mesma sessao

### 3. Criar fake-acp-agent.cjs

**Arquivo:** `app/electron/services/adapters/testing/fake-acp-agent.cjs`

Script Node.js standalone que simula o protocolo Gemini ACP (JSON-RPC 2.0):

- Aceita `initialize` — responde com capabilities
- Aceita `newSession` — responde com sessionId
- Aceita `prompt` — emite notifications com chunks + response final
- Aceita `cancel` — interrompe
- Fica vivo via stdio

### 4. Criar GeminiACPAdapter

**Arquivo:** `app/electron/services/adapters/gemini-acp-adapter.cjs`

Novo adapter que implementa a interface de terminal adapter mas para modo ACP:

- `getPersistentSpawnArgs(context)` — retorna `{ command: 'gemini', args: ['--acp'] }`
- `createPersistentInput(prompt, context)` — formata JSON-RPC dependendo da fase:
  - fase `session`: envia `initialize` + `newSession`
  - fase `prompt`: envia `prompt`
- `parseLine(line)` — parseia JSON-RPC responses/notifications para AgentEvent

### 5. Registrar novo adapter e atualizar planner

**Arquivos:**

- `app/electron/services/providers/terminal-adapter-registry.cjs` — adicionar `gemini-acp`
- `app/electron/services/orchestrator/cli-execution-planner.cjs` — sem mudanca necessaria (ja suporta persistent generico)

### 6. Testes

**Arquivos:**

- `app/electron/services/adapters/testing/fake-stream-json-agent.test.cjs`
- `app/electron/services/adapters/testing/fake-acp-agent.test.cjs`
- `app/electron/services/adapters/gemini-acp-adapter.test.cjs`
- `app/electron/services/protocols/agent-events.test.cjs`

Todos com `node:test` + `node:assert/strict`, seguindo o padrao existente.

### 7. Documentar

- `docs/backend/PROTOCOLOS-PERSISTENTES.md` — atualizar com ACP
- `docs/projeto/STATUS-ATUAL.md` — registrar bloco

## Arquivos criticos existentes (referencia)

- `app/electron/services/ipc-handlers.cjs` — fluxo persistente (linhas 505-987)
- `app/electron/services/adapters/claude-adapter.cjs` — referencia de interface
- `app/electron/services/adapters/gemini-adapter.cjs` — adapter atual (sem persistent)
- `app/electron/services/cli-process-manager.cjs` — spawn/write/kill
- `app/electron/services/orchestrator/cli-execution-planner.cjs` — planner

## Verificacao

1. `npm test` deve passar com os novos testes
2. Fake stream-json agent deve funcionar como processo persistente real:
   `echo '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"oi"}]}}' | node fake-stream-json-agent.cjs`
3. Fake ACP agent deve responder JSON-RPC:
   `echo '{"jsonrpc":"2.0","method":"initialize","id":1}' | node fake-acp-agent.cjs`
4. GeminiACPAdapter.parseLine() deve converter JSON-RPC para os mesmos tipos que claude-adapter.parseLine()

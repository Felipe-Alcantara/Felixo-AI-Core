# Plano: Codex App-Server Adapter Persistente

Status: concluido.

## Contexto

O Codex hoje roda em native-resume (`codex exec resume`), abrindo um processo
novo por prompt. O `codex app-server` oferece um protocolo JSON-RPC 2.0 sobre
stdio/JSONL que permite manter o processo vivo entre prompts — igual ao que ja
funciona com Claude (stream-json) e Gemini (ACP).

O schema foi gerado localmente com `codex app-server generate-json-schema`
(codex-cli 0.125.0).

## Protocolo do app-server

Transporte: `stdio://` (default), JSONL linha por linha.
No `codex-cli 0.125.0`, as mensagens reais podem omitir o campo `jsonrpc`.

### Fluxo principal

```
Client → initialize (clientInfo: {name, version})
Server → response (result: userAgent/codexHome/capabilities)
Client → notification: initialized
Client → thread/start (cwd, model?, baseInstructions?)
Server → response (result: thread)
Server → notification: thread/started (thread)
Client → turn/start (threadId, input: [{type: "text", text}])
Server → notification: turn/started (threadId, turn)
Server → notification: item/agentMessage/delta (delta, threadId, turnId)  [N vezes]
Server → notification: turn/completed (threadId, turn)
```

### Aprovacoes (server → client requests)

O servidor pode pedir aprovacao antes de executar comandos ou alterar arquivos:

- `item/commandExecution/requestApproval` — execucao de comando shell
- `item/fileChange/requestApproval` — alteracao de arquivo
- `item/permissions/requestApproval` — permissoes

O cliente deve responder com `{decision: "approved"}`, `{decision: "denied"}`,
ou variantes. **Na primeira versao, o adapter auto-aprova tudo** para simplificar
o fluxo. Depois isso vira confirmacao na UI.

### Metodos do client

| Metodo | Quando usar |
|--------|-------------|
| `initialize` | Handshake inicial |
| `thread/start` | Criar nova thread/sessao |
| `thread/resume` | Retomar thread existente |
| `turn/start` | Enviar prompt (com threadId) |
| `turn/interrupt` | Cancelar execucao |

### Notifications do server (streaming)

| Notification | O que carrega |
|--------------|--------------|
| `thread/started` | thread.id |
| `turn/started` | threadId, turn |
| `item/agentMessage/delta` | delta (texto), threadId, turnId |
| `item/reasoning/textDelta` | delta de raciocinio |
| `turn/completed` | threadId, turn final |
| `error` | erro |

## Etapas de implementacao

### 1. fake-codex-app-server-agent.cjs

Script standalone que simula o protocolo:

- Aceita `initialize` → responde com capabilities
- Aceita `initialized` notification → ignora
- Aceita `thread/start` → emite `thread/started` notification + responde
- Aceita `turn/start` → emite `turn/started`, N `item/agentMessage/delta`,
  `turn/completed`
- Aceita `turn/interrupt` → responde ok
- Fica vivo via stdio

### 2. codex-app-server-adapter.cjs

Adapter persistente com handshake multi-fase:

- `getPersistentSpawnArgs()` → `{command: 'codex', args: ['app-server']}`
- `createPersistentInput(prompt, context)`:
  - fase `initial` → `initialize` + `initialized` notification
  - fase `session` → `thread/start`
  - fase `prompt` → `turn/start`
  - reuse → `turn/start` direto
- `parseLine(line)`:
  - `thread/started` → `{type: 'session', providerSessionId}`
  - `item/agentMessage/delta` → `{type: 'text', text}`
  - `turn/completed` → `{type: 'done'}`
  - `error` → `{type: 'error', message}`
  - `item/commandExecution/requestApproval` → auto-aprova
  - `item/fileChange/requestApproval` → auto-aprova

### 3. Registrar no terminal-adapter-registry

Adicionar `codex-app-server` como novo adapter.

### 4. Testes

- fake-codex-app-server-agent.test.cjs
- codex-app-server-adapter.test.cjs

## Diferenca vs Gemini ACP

| Aspecto | Gemini ACP | Codex app-server |
|---------|-----------|-----------------|
| Handshake | initialize → newSession → prompt | initialize → initialized → thread/start → turn/start |
| Texto | notification textChunk | notification item/agentMessage/delta |
| Fim | response do prompt | notification turn/completed |
| Aprovacao | nao tem | server requests para comandos/arquivos |
| Thread resume | nao tem | thread/resume |

## Verificacao

1. `npm test` deve passar com todos os testes novos
2. Fake agent deve funcionar end-to-end via stdin/stdout
3. Adapter parseLine deve converter todas as notifications para os mesmos
   tipos que claude-adapter e gemini-acp-adapter

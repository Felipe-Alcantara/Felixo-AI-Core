# Protocolos Persistentes de CLI

Status: concluido.

## Objetivo

Manter a CLI do provedor literalmente aberta entre prompts da mesma conversa quando houver um protocolo estruturado que permita:

- enviar uma nova mensagem sem respawnar processo;
- receber chunks de resposta com delimitador parseavel;
- detectar fim de resposta sem depender de texto solto de TUI;
- correlacionar cada prompt com a mensagem correta da UI.

Isso é diferente de retomada nativa. Retomada nativa reutiliza a conversa do provedor, mas ainda abre um processo novo para cada prompt.

## Modos aceitos

| Modo | Processo fica aberto? | Conversa do provedor continua? | Quando usar |
|------|------------------------|----------------------------------|-------------|
| Processo persistente | Sim | Sim | Quando a CLI oferece stdin/stdout estruturado ou transporte estruturado com eventos de fim |
| Retomada nativa | Nao | Sim | Quando a CLI oferece `resume`, mas nao oferece protocolo persistente parseavel |
| Contexto explicito | Nao | Parcial, via prompt | Fallback antes de capturar uma sessao nativa |

## Claude

Claude ja usa processo persistente real.

- Comando: `claude --print --input-format stream-json --output-format stream-json --permission-mode bypassPermissions`.
- Transporte: stdin/stdout JSONL.
- Inicializacao: o processo recebe mensagens JSONL pelo stdin.
- Streaming: eventos `stream_event` e `result`.
- Fim de resposta: evento `result`.
- Retomada apos queda: `--resume <session_id>`.

Esse contrato encaixa no `CliProcessManager` atual, porque ele mantem `stdin` aberto e parseia linhas JSONL do `stdout`.

## Gemini

Gemini tem dois caminhos relevantes.

### `--prompt-interactive`

Nao deve ser usado aqui como base persistente. A CLI local rejeita `--prompt-interactive` quando stdin esta pipeado, e esse modo e orientado a TUI/interacao humana, nao a JSONL delimitado para backend Electron.

### `--acp`

Esse e o caminho persistente correto para Gemini.

- Comando: `gemini --acp --yolo`.
- Transporte: JSON-RPC por NDJSON em stdin/stdout.
- Inicializacao esperada:
  - `initialize`
  - `session/new`
  - `session/prompt`
- Streaming: notificacoes `session/update`.
- Fim de resposta: resposta JSON-RPC do request `session/prompt`.
- Sessao: o `sessionId` local da conversa pode ser usado como id ACP.

Como ACP usa NDJSON em stdin/stdout, ele cabe no gerenciador persistente existente. O adapter precisa montar as linhas JSON-RPC e traduzir `session/update` para eventos `text`, `done` e `error` da UI.

## Codex

Codex tem retomada nativa implementada e um candidato a processo persistente.

### `codex exec resume`

Hoje e o caminho seguro:

- Comando inicial: `codex exec --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox`.
- Continuidade: `codex exec resume --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox <providerSessionId>`.
- Processo: one-shot por prompt.
- Conversa: continua no provedor quando o `providerSessionId` foi capturado.

### `codex app-server` (persistente)

Esse e o caminho persistente correto para Codex.

- Comando: `codex app-server` (transporte default `stdio://`).
- Transporte: JSON-RPC 2.0 sobre stdin/stdout JSONL.
- Schema gerado localmente via `codex app-server generate-json-schema`.
- No `codex-cli 0.125.0`, responses/notifications reais podem omitir o campo
  `jsonrpc`; o adapter aceita as duas formas.
- Handshake:
  - `initialize` (clientInfo: {name, version}) → capabilities response
  - `initialized` (client notification)
  - `thread/start` (cwd, model?) → response/`thread/started` com `thread.id`
- Prompt:
  - `turn/start` (threadId, input: [{type: "text", text}])
  - → `turn/started` notification
  - → `item/agentMessage/delta` notifications (N vezes, com delta de texto)
  - → `turn/completed` notification
- Cancelamento: `turn/interrupt`
- Aprovacoes: o servidor pode enviar `item/commandExecution/requestApproval`
  e `item/fileChange/requestApproval` antes de executar acoes. O adapter
  auto-aprova na primeira versao.

Esse contrato cabe no `CliProcessManager` atual porque usa stdin/stdout JSONL,
igual ao Claude stream-json e Gemini ACP.

### `codex exec-server` (WebSocket, nao usado)

Alternativa via WebSocket com JSON-RPC. Nao e utilizado no Felixo porque
exige cliente WebSocket persistente e framing separado. O `app-server` via
stdio e preferido.

## Fake agents para teste

Dois scripts standalone simulam os protocolos persistentes para teste sem
depender de CLI real, login, internet ou quota.

### fake-stream-json-agent.cjs

Simula o protocolo Claude stream-json:

- Le JSONL do stdin, emite `system`, `stream_event` (text_delta) e `result`.
- Fica vivo entre prompts na mesma sessao.
- Caminho: `app/electron/services/adapters/testing/fake-stream-json-agent.cjs`.

### fake-acp-agent.cjs

Simula o protocolo Gemini ACP (JSON-RPC 2.0):

- Aceita `initialize`, `newSession`, `prompt` e `cancel`.
- Emite notifications `textChunk` durante prompt.
- Caminho: `app/electron/services/adapters/testing/fake-acp-agent.cjs`.

### fake-codex-app-server-agent.cjs

Simula o protocolo Codex app-server (JSON-RPC 2.0):

- Aceita `initialize`, `thread/start`, `turn/start` e `turn/interrupt`.
- Emite notifications `thread/started`, `item/agentMessage/delta` e `turn/completed`.
- Suporta multiplos turns na mesma thread.
- Caminho: `app/electron/services/adapters/testing/fake-codex-app-server-agent.cjs`.

## AgentEvent padrao

O modulo `app/electron/services/protocols/agent-events.cjs` define factories
para os tipos de evento que qualquer adapter deve produzir:

- `textDelta(text)` — chunk de texto
- `toolCall(tool, input)` — chamada de ferramenta
- `session(providerSessionId)` — sessao capturada
- `status(message)` — lifecycle
- `done(opts?)` — fim com custo/duracao opcionais
- `error(message)` — erro

Adapters atuais ainda retornam objetos literais compativeis. A migracao para
factories e incremental.

## Gemini ACP adapter

O adapter `gemini-acp-adapter.cjs` implementa o protocolo multi-fase:

1. `initial` → envia `initialize` (JSON-RPC)
2. `session` → envia `newSession` (apos receber capabilities)
3. `prompt` → envia `prompt` (apos receber sessionId)

O IPC persistente ja suporta essas fases via `readyForSession` e
`readyForPrompt` nos eventos parseados.

Quando o processo ja esta vivo (reuse), o adapter pula handshake e envia
`prompt` direto.

## Codex app-server adapter

O adapter `codex-app-server-adapter.cjs` implementa o protocolo multi-fase:

1. `initial` → envia `initialize` + notification `initialized`
2. `session` → envia `thread/start` (apos receber capabilities)
3. `prompt` → envia `turn/start` (apos receber threadId via `thread/started`)

O texto chega via notifications `item/agentMessage/delta` e o fim via
`turn/completed`.

Aprovacoes de comandos e arquivos (`item/commandExecution/requestApproval`,
`item/fileChange/requestApproval`) sao auto-aprovadas na primeira versao.
O evento retornado inclui `responseInput` que o IPC escreve no stdin.

Quando o processo ja esta vivo (reuse), o adapter envia `turn/start` direto.

## Decisao de implementacao

1. Manter Claude como processo persistente real (stream-json).
2. Gemini persistente via ACP — adapter implementado, aguardando teste com `gemini --acp` real.
3. Codex persistente via app-server — adapter implementado com auto-aprovacao, aguardando teste com `codex app-server` real.
4. Nao usar TUI interativa como backend de chat enquanto nao houver delimitador confiavel de inicio/fim de resposta.

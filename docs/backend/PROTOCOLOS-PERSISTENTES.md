# Protocolos Persistentes de CLI

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

- Comando: `claude --print --input-format stream-json --output-format stream-json`.
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

- Comando: `gemini --acp --skip-trust`.
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

- Comando inicial: `codex exec --json --skip-git-repo-check`.
- Continuidade: `codex exec resume --json --skip-git-repo-check <providerSessionId>`.
- Processo: one-shot por prompt.
- Conversa: continua no provedor quando o `providerSessionId` foi capturado.

### `codex exec-server`

Esse e o candidato para processo literalmente aberto.

- Comando: `codex exec-server --listen ws://127.0.0.1:0`.
- Transporte: WebSocket com JSON-RPC.
- Inicializacao validada localmente:
  - request `initialize` exige `clientName` e `clientVersion`;
  - response inclui `sessionId`.
- Metodos vistos no binario local: `initialize`, `exec`, `auth`, `cancel`, `prompts/list`, `prompts/get`.
- Observacao: metodos como `thread/start` e `turn/start` pertencem ao app-server, nao ao `exec-server`.

Esse contrato nao cabe diretamente no `CliProcessManager` atual, porque ele nao e stdin/stdout JSONL: exige um cliente WebSocket persistente, framing de JSON-RPC e mapeamento do metodo `exec` antes de trocar a execucao atual. Ate esse mapeamento estar validado, Codex deve continuar em retomada nativa para nao perder delimitacao confiavel de resposta.

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

## Decisao de implementacao

1. Manter Claude como processo persistente real.
2. Implementar Gemini persistente via ACP primeiro, porque o protocolo e estruturado e compativel com stdin/stdout NDJSON.
3. Manter Codex em retomada nativa por enquanto e isolar a proxima etapa em um transporte WebSocket para `exec-server`.
4. Nao usar TUI interativa como backend de chat enquanto nao houver delimitador confiavel de inicio/fim de resposta.


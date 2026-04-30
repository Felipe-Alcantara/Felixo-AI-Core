# Backend Electron

## Responsabilidade

O processo principal do Electron funciona como backend local do Felixo AI Core. Ele recebe chamadas do renderer pelo preload, executa CLIs reais, interpreta JSONL em streaming e devolve eventos normalizados para a interface.

## Camadas recentes

Os últimos commits separaram três responsabilidades que antes ficavam mais
misturadas no fluxo de IPC.

### Provider registry

Arquivo:

- `app/electron/services/providers/terminal-adapter-registry.cjs`

Responsabilidade:

- mapear `cliType` para adapter real;
- retornar `null` para tipos desconhecidos;
- manter `ipc-handlers.cjs` desacoplado da lista concreta de CLIs.

### Orchestrator Core

Arquivo:

- `app/electron/services/orchestrator/cli-execution-planner.cjs`

Responsabilidade:

- escolher `persistent-process`, `native-resume` ou `one-shot`;
- decidir entre `prompt` completo e `resumePrompt`;
- normalizar entrada persistente de adapters simples ou multi-etapa.

### MCP Layer inicial

Arquivo:

- `app/electron/services/mcp/felixo-tool-catalog.cjs`

Responsabilidade:

- registrar as tools MCP planejadas;
- classificar acesso como `read` ou `write`;
- marcar operações sensíveis com `requiresConfirmation`;
- impedir que o primeiro contrato exponha comando livre.

## Principais arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `app/electron/main.cjs` | Inicialização do Electron e registro de handlers |
| `app/electron/preload.cjs` | Bridge segura `window.felixo` para o renderer |
| `app/electron/services/ipc-handlers.cjs` | Orquestra IPC, adapters, processos, stream e terminal |
| `app/electron/services/providers/terminal-adapter-registry.cjs` | Resolve o adapter de terminal por `cliType` |
| `app/electron/services/orchestrator/cli-execution-planner.cjs` | Decide modo de execução, prompt e contrato persistente |
| `app/electron/services/mcp/felixo-tool-catalog.cjs` | Catálogo inicial de tools MCP do Felixo |
| `app/electron/services/cli-process-manager.cjs` | Spawn, escrita em stdin, kill e cleanup de processos |
| `app/electron/services/jsonl-line-reader.cjs` | Divide stdout JSONL por linha |
| `app/electron/services/jsonl-output-guard.cjs` | Bloqueia stdout fora de JSONL esperado |
| `app/electron/services/terminal-event-formatter.cjs` | Converte eventos brutos em eventos legíveis para Terminal |
| `app/electron/services/qa-logger.cjs` | Log de debug do backend para o painel QA Logger |
| `app/electron/services/adapters/*.cjs` | Contratos específicos de Claude, Codex e Gemini |

## IPC exposto ao frontend

### `cli:send`

Entrada esperada:

```ts
{
  sessionId: string
  threadId?: string
  prompt: string
  resumePrompt?: string
  model: Model
  cwd?: string
}
```

Campos:

- `sessionId`: id da mensagem assistente que receberá o streaming.
- `threadId`: id lógico da conversa/modelo, usado para terminal e processo persistente.
- `prompt`: prompt completo, com histórico e contexto explícito.
- `resumePrompt`: prompt curto, usado quando o adapter já mantém contexto nativo ou processo persistente.
- `model`: modelo selecionado no frontend, incluindo `cliType`.
- `cwd`: workspace opcional.

Retorno:

```ts
{
  ok: boolean
  message?: string
}
```

### `cli:stop`

Entrada esperada:

```ts
{
  sessionId: string
  threadId?: string
}
```

O stop usa `threadId` quando disponível, porque o processo real é indexado pela thread da conversa.

## Eventos enviados ao frontend

### `cli:stream`

Atualiza a mensagem do chat.

Eventos principais:

| Tipo | Uso |
|------|-----|
| `text` | Append de texto na mensagem assistente |
| `tool_use` | Indica ferramenta usada pela CLI |
| `tool_result` | Resultado de ferramenta |
| `done` | Finaliza a resposta |
| `error` | Finaliza com erro |

Todos carregam `sessionId`; quando possível também carregam `threadId`.

### `cli:terminal-output`

Atualiza o painel Terminal com evento legível.

Campos principais:

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

Neste evento, `sessionId` representa a thread do terminal, não necessariamente a mensagem do chat.

## Gerenciamento de processos

`CliProcessManager` mantém processos em `Map<threadId, childProcess>`.

Recursos atuais:

- `spawn(threadId, command, args, cwd, options)`.
- `write(threadId, input)` para processos com `stdin` aberto.
- `get(threadId)` e `has(threadId)` para verificar processo vivo.
- `kill(threadId)` com `SIGTERM` e fallback para `SIGKILL`.
- `kill(threadId, { force: true })` para encerramento imediato.
- `killAll({ force: true })` no `before-quit`.

No Linux, processos são criados como grupo separado (`detached`) para permitir matar filhos junto com a CLI principal.

## Estratégias de execução

As estratégias são escolhidas pelo Orchestrator Core em
`cli-execution-planner.cjs`. O IPC apenas valida entrada, chama o planner e
executa o plano.

Modos do planner:

| Modo | Quando usar | Processo fica vivo? |
|------|-------------|---------------------|
| `persistent-process` | Adapter tem `getPersistentSpawnArgs()` e `createPersistentInput()` | Sim |
| `native-resume` | Adapter consegue retomar por `providerSessionId` | Não |
| `one-shot` | Não há protocolo persistente ou sessão capturada | Não |

### Processo persistente

Usado quando o adapter implementa:

- `getPersistentSpawnArgs(context)`.
- `createPersistentInput(prompt, context)`.

Hoje isso está ativo para Claude.

Fluxo:

1. Backend cria processo por `threadId`.
2. Mantém `stdin` aberto.
3. Cria uma execução ativa por `sessionId`.
4. Escreve a mensagem no `stdin` como JSONL.
5. Roteia `stdout` parseado para o `sessionId` da resposta atual.
6. Ao receber `done`, libera a thread para a próxima mensagem.
7. Se ficar ocioso por 30 minutos, encerra o processo.

### One-shot com retomada

Usado quando o adapter não tem protocolo persistente confiável.

Fluxo:

1. Backend spawna um processo novo por mensagem.
2. Se o adapter já capturou `providerSessionId`, usa a retomada nativa da CLI e envia `resumePrompt`.
3. Se ainda não há sessão capturada, envia prompt completo com histórico/contexto explícito.
4. Parseia stdout JSONL até `done`.
5. Processo encerra naturalmente.

Hoje Codex e Gemini estão nesse modo: eles não mantêm o processo vivo, mas não precisam abrir uma conversa nova depois que a sessão do provedor foi capturada.

## Camada MCP inicial

MCP é tratado como camada de ferramentas e contexto, não como mecanismo para
chamar modelos por assinatura.

O arquivo `felixo-tool-catalog.cjs` define os nomes e a política inicial das
tools que futuramente poderão ser expostas por um servidor MCP do Felixo:

- `project.read_file`
- `project.search`
- `project.write_file`
- `git.status`
- `git.diff`
- `git.commit_message`
- `memory.save`
- `memory.search`
- `summary.create`
- `terminal.run_allowlisted`

Tools com escrita já nascem marcadas como `requiresConfirmation`. O app ainda
não expõe um servidor MCP completo; o catálogo existe para fixar contrato,
escopo e segurança antes do transporte.

Regras do catálogo atual:

- `terminal.run` não existe.
- A execução local planejada é apenas `terminal.run_allowlisted`.
- Toda tool com `access: "write"` precisa de confirmação.
- O primeiro servidor MCP deve nascer read-only antes de liberar escrita.

## Estado por adapter

| Adapter | Estado atual | Pendência |
|---------|--------------|-----------|
| Claude | Processo persistente real via `--input-format stream-json`; suporta `--session-id` e `--resume` | Teste de integração com processo fake e validação manual mais longa |
| Codex | One-shot com `codex exec --json`; continua a conversa com `codex exec resume --json` após capturar id do provedor | Validar protocolo alternativo persistente para manter processo vivo |
| Gemini | One-shot com `--output-format stream-json`; continua a conversa com `--resume <session_id>` após capturar `init.session_id` | Investigar `--prompt-interactive`/`--acp` para manter processo vivo |

## Tratamento de erros

- Prompt/session inválidos são rejeitados antes do spawn.
- CLI sem adapter retorna erro controlado.
- Stdout fora de JSONL encerra a execução como erro.
- Stderr fatal pode abortar a execução conforme adapter.
- Sem saída textual visível dentro do timeout, o processo é interrompido.
- Stop manual emite `done` com `stopped: true`.

## O que falta

- Extrair gerência de sessão persistente para serviço próprio se `ipc-handlers.cjs` continuar crescendo.
- Criar testes de integração com CLI fake persistente.
- Persistir logs relevantes do QA Logger quando necessário.
- Definir contrato formal versionado para adapters.
- Implementar processos vivos em Codex/Gemini apenas depois de validar protocolo confiável; por enquanto eles usam retomada nativa da conversa.

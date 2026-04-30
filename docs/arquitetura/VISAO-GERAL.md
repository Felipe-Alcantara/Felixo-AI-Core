# Arquitetura — Visão Geral

## Estrutura de Camadas

```
Felixo AI Core
├── UI Desktop
│   ├── Chat
│   ├── Editor/Projetos
│   ├── Terminal
│   ├── Git
│   └── Painel de modelos
├── Orchestrator Core
│   ├── decisão de modo de execução
│   ├── seleção de prompt completo vs. prompt curto
│   ├── estado de thread/providerSessionId
│   └── política de continuidade por modelo
├── Terminal Adapters
│   ├── claude
│   ├── codex
│   └── gemini
├── MCP Layer
│   ├── catálogo Felixo de ferramentas
│   ├── filesystem/projeto
│   ├── Git
│   ├── memória
│   └── skills/prompts
└── Backend Electron
    ├── IPC seguro via preload
    ├── processos locais
    ├── streaming JSONL/NDJSON
    └── logging/observabilidade
```

## Decisão Arquitetural

MCP não é tratado como substituto das CLIs nem como API universal de modelos.
No Felixo AI Core, as CLIs autenticadas por assinatura continuam sendo
controladas por **Terminal Adapters**. MCP entra como a camada de
**ferramentas, contexto, memória, Git e skills**.

Essa separação evita misturar três problemas diferentes:

- chamar modelos por terminal;
- padronizar ferramentas disponíveis para IAs;
- orquestrar qual provedor, contexto e estratégia usar em cada tarefa.

Detalhamento: [ORQUESTRADOR-HIBRIDO-MCP.md](./ORQUESTRADOR-HIBRIDO-MCP.md).

## Mapeamento no Código

| Camada | Arquivos principais |
|--------|---------------------|
| UI Desktop | `app/src/features/chat/` |
| Bridge | `app/electron/preload.cjs` |
| Orchestrator Core | `app/electron/services/orchestrator/cli-execution-planner.cjs` |
| Terminal Adapters | `app/electron/services/adapters/*.cjs` |
| Provider registry | `app/electron/services/providers/terminal-adapter-registry.cjs` |
| MCP Layer inicial | `app/electron/services/mcp/felixo-tool-catalog.cjs` |
| Processos locais | `app/electron/services/cli-process-manager.cjs` |
| IPC | `app/electron/services/ipc-handlers.cjs` |

## Fluxo de Dados

```
Usuário digita no Composer
        ↓
ChatWorkspace.sendMessage()
        ↓
Gera threadId da conversa/modelo + sessionId da mensagem assistente
        ↓
window.felixo.cli.send({ sessionId, threadId, prompt, resumePrompt, model })
        ↓  [IPC — contextIsolation]
ipc-handlers.cjs → cli:send
        ↓
Provider registry seleciona Terminal Adapter (claude | codex | gemini)
        ↓
Orchestrator Core cria plano de execução
        ↓
Decide estratégia:
  - processo persistente quando o adapter suporta stdin JSONL
  - processo one-shot quando não há protocolo persistente confiável
  - retomada nativa quando já existe providerSessionId
        ↓
CliProcessManager.spawn(threadId, command, args, cwd)
        ↓
stdout/stderr do processo
        ↓
JsonlOutputGuard → valida que stdout é JSONL
        ↓
JsonlLineReader → split por \n
        ↓
adapter.parseLine(line) → StreamEvent normalizado
        ↓
terminal-event-formatter.cjs → TerminalOutputEvent humanizado
        ↓
ipcRenderer.send('cli:stream', event)
ipcRenderer.send('cli:terminal-output', event)
        ↓  [IPC — preload]
window.felixo.cli.onStream(callback)
window.felixo.cli.onTerminalOutput(callback)
        ↓
ChatWorkspace.handleStreamEvent(event)
useTerminalOutput.appendTerminalOutput(event)
        ↓
appendAssistantText() / completeAssistantMessage()
TerminalPanel atualiza thread selecionada
        ↓
ChatThread renderiza resposta
```

## Fluxo Persistente por Adapter

```
Claude
  ↓
claude --print --input-format stream-json --output-format stream-json
  ↓
stdin permanece aberto
  ↓
novas mensagens da mesma thread são escritas como JSONL no mesmo processo
```

```
Codex/Gemini
  ↓
processo one-shot por prompt
  ↓
retomada nativa por providerSessionId quando disponível
  ↓
fallback para histórico/contexto explícito antes da sessão ser capturada
```

## Observabilidade

```
stdout JSONL do processo
        ↓
QA Logger recebe evento bruto/preview para debug
        ↓
Terminal recebe evento legível para acompanhamento em tempo real
```

## Segurança

- `contextIsolation: true` — renderer não acessa Node diretamente
- `nodeIntegration: false` — sem acesso a módulos Node no renderer
- `sandbox: false` — necessário para IPC via preload
- Toda comunicação renderer ↔ main passa pelo preload via `ipcRenderer.invoke` / `ipcRenderer.on`

## Sessões

O app usa duas identidades diferentes:

- `threadId`: fixo enquanto a conversa usa o mesmo modelo. Agrupa eventos no painel Terminal e identifica o processo persistente quando ele existe.
- `sessionId`: gerado a cada mensagem enviada. Correlaciona o streaming com a mensagem assistente correta no chat.

Essa separação permite manter um terminal contínuo sem misturar chunks de resposta entre mensagens diferentes.

## Processos concorrentes

`ChatWorkspace` mantém uma sessão ativa por vez no MVP. Novas mensagens são bloqueadas enquanto há processo CLI em execução (`isStreaming`).

No backend, o processo persistente também aceita apenas uma resposta ativa por `threadId`. Uma tentativa de enviar outra mensagem antes do `done` retorna erro controlado.

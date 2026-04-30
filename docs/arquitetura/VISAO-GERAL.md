# Arquitetura — Visão Geral

## Estrutura de Camadas

```
┌─────────────────────────────────────────────────────┐
│                  FELIXO AI CORE                      │
├─────────────────────────────────────────────────────┤
│  FRONTEND REACT (app/src/)                           │
│  └─ features/chat/ → componentes, serviços, tipos   │
├─────────────────────────────────────────────────────┤
│  BRIDGE (app/electron/preload.cjs)                   │
│  └─ window.felixo → cli, qaLogger, platform         │
├─────────────────────────────────────────────────────┤
│  BACKEND ELECTRON (app/electron/)                    │
│  ├─ core/ → caminhos, config de janela              │
│  ├─ windows/ → factory da janela principal          │
│  └─ services/ → IPC, processos, adapters, logging   │
└─────────────────────────────────────────────────────┘
```

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
Seleciona adapter (claude | codex | gemini)
        ↓
Decide estratégia:
  - processo persistente quando o adapter suporta stdin JSONL
  - processo one-shot quando não há protocolo persistente confiável
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

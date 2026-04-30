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
window.felixo.cli.send({ prompt, cliType, sessionId })
        ↓  [IPC — contextIsolation]
ipc-handlers.cjs → cli:send
        ↓
Seleciona adapter (claude | codex | gemini)
        ↓
CliProcessManager.spawn(sessionId, command, args, cwd)
        ↓
stdout do processo
        ↓
JsonlOutputGuard → valida que é JSON
        ↓
JsonlLineReader → split por \n
        ↓
adapter.parseLine(line) → StreamEvent
        ↓
ipcRenderer.send('cli:stream', event)
        ↓  [IPC — preload]
window.felixo.cli.onStream(callback)
        ↓
ChatWorkspace.handleStreamEvent(event)
        ↓
appendAssistantText() / completeAssistantMessage()
        ↓
ChatThread re-renderiza com novo conteúdo
```

## Segurança

- `contextIsolation: true` — renderer não acessa Node diretamente
- `nodeIntegration: false` — sem acesso a módulos Node no renderer
- `sandbox: false` — necessário para IPC via preload
- Toda comunicação renderer ↔ main passa pelo preload via `ipcRenderer.invoke` / `ipcRenderer.on`

## Sessões

Cada envio gera um `sessionId` (UUID). Isso permite:
- Correlacionar eventos de stream com a mensagem correta
- Ignorar eventos de sessões já encerradas
- Matar processos individualmente por ID

## Processos concorrentes

`ChatWorkspace` mantém uma sessão ativa por vez no MVP. Novas mensagens são bloqueadas enquanto há processo CLI em execução (`isStreaming`).

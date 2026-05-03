# Orquestração Multi-Agente

Status: concluido.

## Problema

Quando um CLI orquestrador (ex: Codex) spawna outro agente (ex: Claude Code)
como subprocesso, toda a atividade interna do sub-agente fica invisível para
o Felixo AI Core. O app só vê o que o orquestrador reporta via JSONL
(`aggregated_output`), perdendo visibilidade completa das ações, ferramentas
e raciocínio do sub-agente.

## Solução: App-Owned Orchestration

O Felixo AI Core vira o scheduler/state manager do loop de orquestração.
CLIs são workers temporários e stateless entre turnos.

### Fluxo

```
Usuário envia objetivo
        |
App invoca Orquestrador (Codex/Gemini/Claude)
        |
Orquestrador responde com eventos estruturados:
  spawn_agent, awaiting_agents, final_answer
        |
Orquestrador encerra (processo morre normalmente)
        |
App spawna sub-agentes como sessoes Felixo nativas
  (visiveis no Terminal Panel como threads separadas)
        |
Sub-agentes executam e completam
        |
App coleta resultados
        |
App re-invoca Orquestrador com resultados no contexto
        |
Orquestrador avalia -> spawn mais agentes ou final_answer
        |
Loop ate o orquestrador encerrar
```

### Principios

1. **Orquestrador stateless** — cada invocacao e um processo novo com
   contexto acumulado. Nao depende de processo persistente.
2. **App como cerebro** — o Felixo mantém estado, controla permissões,
   rastreia jobs, coleta resultados e decide quando re-invocar.
3. **Sub-agentes de primeira classe** — cada sub-agente roda como sessão
   nativa do Felixo, visível no Terminal Panel com todas as ações.
4. **CLI-agnostico** — funciona com qualquer CLI (Codex, Claude, Gemini)
   sem depender de features especificas de nenhuma.

## Protocolo JSONL

### Eventos emitidos pelo orquestrador

#### spawn_agent

Solicita que o app crie um sub-agente.

```json
{
  "type": "spawn_agent",
  "agentId": "reviewer-1",
  "cliType": "claude",
  "prompt": "Revise as alteracoes atuais e aponte riscos."
}
```

Campos:
- `agentId` — identificador unico do job (gerado pelo orquestrador)
- `cliType` — tipo do CLI a usar (`claude`, `codex`, `gemini`, `gemini-acp`)
- `prompt` — prompt completo para o sub-agente

#### awaiting_agents

Sinaliza que o orquestrador terminou de emitir spawn_agents e aguarda
resultados. O processo pode encerrar apos este evento.

```json
{
  "type": "awaiting_agents",
  "agentIds": ["reviewer-1", "researcher-2"]
}
```

#### final_answer

Resposta final do orquestrador. Encerra o loop.

```json
{
  "type": "final_answer",
  "content": "A revisao foi concluida. Os principais pontos sao..."
}
```

### Eventos internos do app (nao emitidos por CLIs)

#### agent_result (contexto injetado na re-invocacao)

Quando o app re-invoca o orquestrador, injeta os resultados dos
sub-agentes no prompt como contexto:

```
Resultados dos sub-agentes solicitados:

--- Agente reviewer-1 (claude) ---
Status: concluido
Resultado:
O codigo esta correto, mas ha um risco de SQL injection na linha 42.

--- Agente researcher-2 (gemini) ---
Status: erro
Mensagem: Timeout apos 120s sem resposta.
```

## Entidade: OrchestrationRun

Estado mantido pelo app durante o loop de orquestracao.

```json
{
  "runId": "run-abc123",
  "status": "waiting_agents | running_orchestrator | completed | failed",
  "parentThreadId": "thread-codex-1",
  "orchestratorCliType": "codex",
  "orchestratorModel": { "id": "...", "name": "...", "cliType": "codex" },
  "originalPrompt": "Revise e documente o projeto",
  "currentTurn": 2,
  "maxTurns": 5,
  "agentJobs": [
    {
      "agentId": "reviewer-1",
      "cliType": "claude",
      "prompt": "Revise as alteracoes...",
      "status": "running | completed | error",
      "threadId": "thread-claude-1",
      "result": "...",
      "error": null,
      "startedAt": "2026-05-01T12:00:00Z",
      "completedAt": "2026-05-01T12:01:30Z"
    }
  ],
  "turns": [
    {
      "turn": 1,
      "agentIds": ["reviewer-1"],
      "orchestratorResponse": "spawn_agent + awaiting_agents"
    }
  ],
  "createdAt": "2026-05-01T12:00:00Z",
  "updatedAt": "2026-05-01T12:01:30Z"
}
```

## Limites de Seguranca

```json
{
  "maxTurns": 5,
  "maxAgentsPerTurn": 3,
  "maxTotalAgents": 10,
  "maxRuntimeMinutes": 20
}
```

Sem esses limites, um orquestrador poderia criar agentes infinitamente.

## Arquivos a Criar/Modificar

### Novos arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `app/electron/services/orchestration/orchestration-runner.cjs` | Gerencia o loop: invoca orquestrador, intercepta spawn_agent, spawna sub-agentes, re-invoca com resultados |
| `app/electron/services/orchestration/orchestration-store.cjs` | Mantém estado dos OrchestrationRuns em memória |

### Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `app/electron/services/ipc-handlers.cjs` | Detectar eventos `spawn_agent`/`awaiting_agents`/`final_answer` no output JSONL e delegar para orchestration-runner |
| `app/electron/services/terminal-event-formatter.cjs` | Criar eventos de terminal para atividade de orquestracao (spawn, resultado, re-invocacao) |
| `app/electron/services/adapters/*.cjs` | Adaptar `parseLine()` para reconhecer os novos tipos de evento |
| `app/src/features/chat/components/TerminalPanel.tsx` | Mostrar sub-agentes como threads filhas, agrupadas pelo run pai |
| `app/src/features/chat/components/ChatWorkspace.tsx` | Tratar `final_answer` como resposta do assistente no chat |
| `app/src/features/chat/hooks/useTerminalOutput.ts` | Adicionar conceito de parentThreadId para agrupar sessoes |
| `app/src/features/chat/types.ts` | Adicionar `spawn_agent`, `awaiting_agents`, `final_answer` ao StreamEvent |

## Dependencias entre implementacoes

```
1. Protocolo (tipos + parseLine nos adapters)
   |
2. orchestration-store.cjs (OrchestrationRun)
   |
3. orchestration-runner.cjs (loop principal)
   |
4. ipc-handlers.cjs (integracao com o runner)
   |
5. terminal-event-formatter.cjs (eventos visuais)
   |
6. Frontend (types, useTerminalOutput, TerminalPanel, ChatWorkspace)
   |
7. Robustez (error handling, cleanup, observabilidade)
```

## Tratamento de Erros e Cleanup

### Thread Reset

Quando o usuario reseta a conversa, o app coleta a familia completa de threads
(pai + filhos recursivos) e:

1. Mata processos CLI de todas as threads da familia
2. Falha runs de orquestracao ativos associados
3. Limpa mapas de contexto e jobs do runner
4. Envia evento de reset ao terminal

### Error Routing

Eventos de erro do CLI (crash, stderr fatal, exit code != 0) passam pela
ponte de orquestracao antes de chegar ao frontend. Se o erro pertence a um
sub-agente de orquestracao, o runner trata como falha do job em vez de
propagar diretamente.

### Adapters

- Claude: filtra eventos `system` nao-init, trata rate limits e `is_error`
- Codex: sessoes efemeras, sem resume nativo
- Gemini: detecta ferramentas indisponiveis e retry de capacidade

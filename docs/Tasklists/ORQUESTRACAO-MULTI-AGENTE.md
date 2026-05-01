# Tasklist — Orquestração Multi-Agente

Referencia: [docs/arquitetura/ORQUESTRACAO-MULTI-AGENTE.md](../arquitetura/ORQUESTRACAO-MULTI-AGENTE.md)

## Fase 1 — Protocolo e tipos

- [x] 1.1 Adicionar `spawn_agent`, `awaiting_agents`, `final_answer` ao `StreamEvent` em `types.ts`
- [x] 1.2 Adicionar tipos correspondentes em `vite-env.d.ts` (IPC)
- [x] 1.3 Atualizar `parseLine()` no `codex-adapter.cjs` para reconhecer os novos eventos
- [x] 1.4 Atualizar `parseLine()` no `claude-adapter.cjs` para reconhecer os novos eventos
- [x] 1.5 Atualizar `parseLine()` no `gemini-adapter.cjs` para reconhecer os novos eventos
- [x] 1.6 Testes unitarios para os novos tipos em cada adapter

## Fase 2 — Backend: OrchestrationRun + Store

- [x] 2.1 Criar `orchestration-store.cjs` com create/get/update/list de OrchestrationRun
- [x] 2.2 Implementar estado de agentJobs (pending, running, completed, error)
- [x] 2.3 Implementar limites (maxTurns, maxAgentsPerTurn, maxTotalAgents)
- [x] 2.4 Testes unitarios para orchestration-store

## Fase 3 — Backend: OrchestrationRunner (loop principal)

- [x] 3.1 Criar `orchestration-runner.cjs` com funcao `handleOrchestrationEvent()`
- [x] 3.2 Implementar interceptacao de `spawn_agent` → criar agentJob + spawnar sub-agente
- [x] 3.3 Implementar interceptacao de `awaiting_agents` → marcar run como waiting
- [x] 3.4 Implementar interceptacao de `final_answer` → marcar run como completed, enviar resposta ao chat
- [x] 3.5 Implementar `onAgentJobCompleted()` → verificar se todos os jobs completaram
- [x] 3.6 Implementar re-invocacao do orquestrador com resultados injetados no prompt
- [x] 3.7 Implementar tratamento de erros (job falhou, timeout, limites atingidos)
- [x] 3.8 Testes unitarios para orchestration-runner

## Fase 4 — Integracao com ipc-handlers

- [x] 4.1 Modificar handler de JSONL em `ipc-handlers.cjs` para detectar eventos de orquestracao
- [x] 4.2 Delegar eventos de orquestracao para orchestration-runner em vez de enviar direto ao frontend
- [x] 4.3 Spawnar sub-agentes via o mesmo mecanismo de `cli:send` (reutilizar fluxo existente)
- [x] 4.4 Conectar `onAgentJobCompleted` ao evento `done` dos sub-agentes
- [x] 4.5 Testes de integracao do fluxo completo

## Fase 5 — Terminal events e observabilidade

- [x] 5.1 Criar eventos de terminal para: spawn de sub-agente, resultado recebido, re-invocacao
- [x] 5.2 Atualizar `terminal-event-formatter.cjs` com os novos eventos
- [x] 5.3 Adicionar `parentThreadId` ao `useTerminalOutput.ts` para agrupar sessoes
- [x] 5.4 IPC handler `cli:orchestration-status` para frontend consultar estado do run

## Fase 6 — Frontend: UI de orquestracao

- [ ] 6.1 Atualizar `StreamEvent` types no frontend com os novos eventos
- [ ] 6.2 `ChatWorkspace.tsx` — tratar `final_answer` como resposta do assistente
- [ ] 6.3 `ChatWorkspace.tsx` — mostrar estado do run (aguardando agentes, re-invocando)
- [ ] 6.4 `TerminalPanel.tsx` — agrupar threads filhas sob o run pai
- [ ] 6.5 `TerminalPanel.tsx` — mostrar indicador visual de sub-agente vs orquestrador
- [ ] 6.6 `useTerminalOutput.ts` — suportar parentThreadId na criacao de sessoes

## Fase 7 — Testes end-to-end com CLIs reais

- [ ] 7.1 Testar loop completo com Codex como orquestrador e Claude como sub-agente
- [ ] 7.2 Testar loop com Gemini como orquestrador
- [ ] 7.3 Testar cenario de erro (sub-agente falha, timeout)
- [ ] 7.4 Testar limites (maxTurns, maxAgents)
- [ ] 7.5 Testar multiplos sub-agentes em paralelo

## Ordem de implementacao

```
Fase 1 (tipos) → Fase 2 (store) → Fase 3 (runner) → Fase 4 (ipc) → Fase 5 (terminal) → Fase 6 (frontend) → Fase 7 (testes reais)
```

Cada fase gera um commit descritivo ao ser concluida.

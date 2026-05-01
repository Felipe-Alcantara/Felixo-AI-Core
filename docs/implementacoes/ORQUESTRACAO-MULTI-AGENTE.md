# Implementacao - Orquestracao Multi-Agente

## Contexto

A tasklist `docs/Tasklists/ORQUESTRACAO-MULTI-AGENTE.md` implementa a
arquitetura descrita em `docs/arquitetura/ORQUESTRACAO-MULTI-AGENTE.md`.
O objetivo e fazer o Felixo AI Core reconhecer eventos estruturados de
orquestracao emitidos pelos CLIs e, nas fases seguintes, assumir o controle
do loop de sub-agentes.

## Fase 1 - Protocolo e tipos

Status: concluida.

Mudancas implementadas:

- `StreamEvent` agora inclui `spawn_agent`, `awaiting_agents` e `final_answer`.
- A bridge IPC tipada em `vite-env.d.ts` aceita esses eventos no stream da CLI.
- Os adapters `codex`, `claude` e `gemini` reconhecem eventos JSONL top-level
  de orquestracao antes de aplicar o parsing especifico de cada provedor.
- A validacao dos eventos exige campos obrigatorios e `cliType` conhecido para
  evitar encaminhamento acidental de JSON incompleto.
- Os tres adapters receberam testes unitarios para os novos tipos.

Validacao:

- `npm test -- --test-reporter=spec electron/services/adapters/codex-adapter.test.cjs electron/services/adapters/claude-adapter.test.cjs electron/services/adapters/gemini-adapter.test.cjs`

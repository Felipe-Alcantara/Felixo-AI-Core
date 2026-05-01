# Novo Chat — Comportamento de Limpeza de Sessão

Status: concluido.

## Contexto

Ao apertar no botão **Novo Chat**, o app deve iniciar uma sessão limpa. Isso significa descartar estado da conversa atual sem perder configurações globais do usuário.

## O que é limpo

| Estado                        | Ação                                         |
|-------------------------------|----------------------------------------------|
| Mensagens do chat             | Resetadas para `initialMessages`             |
| Campo de input                | Limpo                                        |
| Anexos de contexto            | Removidos                                    |
| Streaming ativo               | Interrompido via `cli:stop`                  |
| Threads do backend            | Resetadas via `cli:reset-thread` para cada thread conhecida |
| Sessão ativa                  | Ref e state zerados                          |
| Terminal output               | Todas as sessões limpas, chunk id resetado   |
| Orquestração                  | Run id e status text limpos                  |
| Thread de conversa            | Refs de threadId, modelId e messageThreadIds zerados |
| Diff de projetos              | Ref de `lastSentProjectIds` zerada           |
| QA Logger                     | Entradas limpas via `qa-logger:clear`        |

## O que é preservado

| Estado                        | Motivo                                       |
|-------------------------------|----------------------------------------------|
| Lista de modelos              | Configuração do usuário                      |
| Modelo selecionado            | Preferência do usuário                       |
| Lista de projetos             | Configuração do workspace                    |
| Projetos ativos               | Seleção do usuário                           |
| Automações customizadas       | Configuração do usuário                      |
| Sessões salvas (sidebar)      | Histórico do usuário                         |
| Estado visual dos painéis     | Preferência de layout                        |
| Providers cadastrados         | Configuração global                          |

## Sessão anterior

Antes de limpar, o app salva automaticamente a sessão atual na lista de sessões do sidebar, desde que existam mensagens com conteúdo. O título é extraído da primeira mensagem do usuário (até 60 caracteres).

## Fluxo backend

1. `collectKnownBackendThreadIds()` coleta todos os threadIds conhecidos da conversa, terminal e orquestração.
2. Para cada threadId único, `cli:reset-thread` é chamado no backend.
3. O backend coleta a família de threads (parent + filhos), encerra processos, fecha sessões persistentes e marca runs de orquestração como `failed`.
4. O QA Logger é limpo para que logs da sessão anterior não poluam a nova sessão.

## Arquivos envolvidos

- `app/src/features/chat/components/ChatWorkspace.tsx` — função `resetChat()`
- `app/src/features/chat/hooks/useTerminalOutput.ts` — `clearSessions()`
- `app/electron/services/ipc-handlers.cjs` — handler `cli:reset-thread`
- `app/electron/services/orchestration/orchestration-runner.cjs` — `resetThread()`
- `app/electron/services/qa-logger.cjs` — handler `qa-logger:clear`

## Possíveis problemas conhecidos

- Um subagente em execução pode terminar depois do novo chat e tentar inserir resultado na sessão errada. Mitigado por: o backend marca runs como `failed` e os IDs de sessão não coincidem.
- Limpar tudo agressivamente poderia apagar configurações. Mitigado por: apenas estado de sessão é limpo, não configurações globais.

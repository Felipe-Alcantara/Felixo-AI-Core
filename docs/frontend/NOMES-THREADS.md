# Nomes de Threads — Modelo e Contexto Inicial

Status: concluido.

## Contexto

As threads no painel de terminal exibiam apenas IDs técnicos como `a78a144b` ou `run-16ee`, dificultando a identificação rápida. Agora exibem o nome do modelo e um resumo curto do prompt inicial.

## Formato atual

```text
Threads

Orq  Claude Opus · Planejar arquitetura de subagentes
Concluído · 31 eventos · 3.6 KB

Sub  Gemini · Investigar alternativas de workflow
Concluído · 6 eventos · 704 B
```

## Como funciona

### Metadados propagados

O backend envia `modelName` e `promptHint` como metadados no evento de início de cada sessão terminal:

- `modelName` vem de `model.name` no momento do spawn.
- `promptHint` vem do prompt enviado à CLI, truncado para 60 caracteres.
- `cliType` é usado como fallback quando `modelName` não está disponível.

### Extração no frontend

A função `extractSessionLabel(session)` no `TerminalPanel.tsx` percorre os chunks da sessão e localiza o primeiro chunk com metadados de lifecycle. A partir dele extrai:

1. `modelName` (preferido) ou `cliType` (fallback)
2. `promptHint` (quando disponível)
3. Se nenhum metadado existir, usa `sessionId.slice(0, 8)` como último recurso.

O formato final é: `{modelo} · {prompt}` ou apenas `{modelo}` ou `{id}`.

### ID técnico preservado

O `sessionId` completo continua disponível como `title` no atributo HTML do elemento, visível via tooltip ao passar o mouse.

## Arquivos envolvidos

- `app/electron/services/terminal-event-formatter.cjs` — `createStartTerminalEvent()` agora aceita e propaga `promptHint`
- `app/electron/services/ipc-handlers.cjs` — passa `promptHint: spawnPrompt` ao criar evento de início
- `app/src/features/chat/components/TerminalPanel.tsx` — `extractSessionLabel()` e exibição atualizada

## Limitações conhecidas

- Prompts muito grandes são truncados para 60 caracteres no metadado.
- Sub-agentes podem receber prompts técnicos do orquestrador, gerando nomes menos legíveis.
- Sessões criadas antes da mudança continuam exibindo ID técnico.

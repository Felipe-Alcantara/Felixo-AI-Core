# Skills — Superprompts Persistentes

Status: concluido.

## Objetivo

Permitir que o usuário cadastre instruções persistentes para ensinar o agente a usar uma ferramenta, plataforma, estilo de trabalho ou padrão técnico.

## Modelo

As skills ficam dentro de `OrchestratorSettings.skills` para reaproveitar a mesma persistência das memórias globais.

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador local da skill |
| `name` | Nome exibido na UI |
| `description` | Contexto curto de uso |
| `prompt` | Superprompt completo |
| `enabled` | Define se entra no próximo prompt |
| `createdAt` | Data de criação |
| `updatedAt` | Data da última alteração |

## Fluxo de UI

- A sidebar possui botão `Skills`.
- O modal permite criar, editar, ativar/desativar e remover skills.
- Skills ativas entram no prompt enviado para a CLI em um bloco separado das memórias globais.
- Skills inativas permanecem salvas, mas não entram no prompt.

## Injeção no prompt

`createSkillsContextBlock(settings)` monta o bloco:

```text
Skills e superprompts ativos:
- Use estes blocos como instrucoes persistentes de tecnica, ferramenta, plataforma, estilo ou modo de trabalho.
- Se a mensagem atual do usuario conflitar com uma skill, priorize a mensagem atual.
```

Depois disso cada skill ativa entra com título, descrição opcional e superprompt.

## Arquivos

- `app/src/features/chat/components/SkillsModal.tsx`
- `app/src/features/chat/components/AppSidebar.tsx`
- `app/src/features/chat/components/ChatWorkspace.tsx`
- `app/src/features/chat/services/orchestrator-settings-storage.ts`
- `app/src/features/chat/types.ts`

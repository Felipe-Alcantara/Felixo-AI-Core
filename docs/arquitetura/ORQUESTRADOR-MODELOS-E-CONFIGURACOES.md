# Orquestrador — Modelos, Capacidades e Configurações

Status: concluido.

## Contexto

O orquestrador não deve decidir subagentes apenas por `cliType`. Ele precisa receber contexto sobre os modelos disponíveis, capacidades, limites configurados, preferências e bloqueios definidos pelo usuário.

## Modelo de dados inicial

### Capacidades por modelo

Cada modelo enviado ao orquestrador é resumido em um bloco compacto:

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador local do modelo no frontend |
| `name` | Nome exibido ao usuário |
| `cliType` | Adapter que pode executar o modelo |
| `providerModel` | Modelo do provedor, quando configurado |
| `reasoningEffort` | Nível de esforço, quando configurado |
| `execution` | Tipo esperado: processo persistente, retomada nativa, one-shot ou protocolo app-server/ACP |
| `supportsTools` | Se o adapter suporta ferramentas ou tool events |
| `supportsMcp` | Se pode participar de fluxos MCP planejados |
| `supportsFileEdits` | Se é indicado para alterações de arquivos |
| `supportsLongContext` | Indicação operacional de contexto longo |
| `strengths` | Tarefas indicadas: código, revisão, resumo, planejamento, escrita |
| `limits` | Limites de uso conhecidos ou configurados |
| `cost` | Estimativa de custo por provedor/modelo |
| `status` | Disponível, bloqueado, indisponível, erro, sem login, limite atingido ou desconhecido |

## Configurações do orquestrador

| Configuração | Escopo inicial |
|--------------|----------------|
| Contexto personalizado | Global/local |
| Memórias globais | Global/local, editadas no perfil Felixo |
| Skills habilitadas | Global/local |
| Modelos preferidos | Global/local |
| Modelos bloqueados | Global/local |
| Workflow padrão | Global/local |
| Modo de operação | Manual, semiautomático, automático, somente leitura, experimental |
| Limites | Máximo de subagentes, turnos, tempo, custo estimado e contexto (tokens) |

## Regras de spawn

1. O frontend envia ao backend os modelos disponíveis e as configurações do orquestrador no `cli:send`.
2. O prompt do orquestrador recebe uma lista compacta de modelos e regras.
3. Ao receber `spawn_agent`, o backend valida:
   - se `cliType` está disponível;
   - se o modelo não está bloqueado;
   - se há adapter compatível;
   - se os limites da run ainda permitem o spawn.
4. O backend escolhe o modelo preferido daquele `cliType`, quando existir, ou o primeiro modelo disponível do tipo.
5. Reinvocações do orquestrador preservam a mesma lista de modelos, configurações e limites da run original.
6. Se não existir modelo disponível, o run falha com mensagem explícita.

## Limitações conhecidas

- Limites de assinatura de CLIs como Claude Code, Codex ou Gemini podem não estar disponíveis programaticamente.
- Custos e janelas de contexto mudam fora do app; o sistema deve tratar esses dados como contexto operacional, não como verdade permanente.
- O primeiro recorte não calcula tokens nem custo real.
- O usuário ainda precisa configurar modelos locais antes de usar subagentes.
- Limites de assinatura, disponibilidade real e erros recentes ainda dependem de telemetria futura para ficarem totalmente automáticos.

## Arquivos esperados

- `app/src/features/chat/services/orchestrator-settings-storage.ts`
- `app/src/features/chat/components/OrchestratorSettingsModal.tsx`
- `app/src/features/chat/components/ChatWorkspace.tsx`
- `app/electron/services/orchestrator-settings-store.cjs`
- `app/electron/services/orchestrator-settings-ipc-handlers.cjs`
- `app/electron/services/ipc-handlers.cjs`
- `app/electron/services/orchestration/orchestration-runner.cjs`

## Recorte implementado

- Modal local de configurações do orquestrador.
- Persistência das configurações na tabela `settings` do SQLite, com migração/fallback do JSON legado em `app.getPath('userData')/config/orchestrator-settings.json`.
- Lista compacta de capacidades enviada ao prompt do orquestrador.
- `availableModels` e `orchestratorSettings` enviados ao backend no `cli:send`.
- Contexto de modelos, configurações e limites preservado entre turnos da mesma run.
- Validação de `spawn_agent` antes de criar o job da run.
- Escolha do modelo preferido do mesmo `cliType`, quando configurado.
- Falha explícita quando o modelo está bloqueado ou não existe entre os modelos disponíveis.
- Evento de terminal `orchestration_model_choice` com `selectedModelId`, `selectedModelName`, regra de seleção, quantidade de candidatos, bloqueios ignorados e motivo textual.
- `ModelAvailabilityStatus` estendido para: `available`, `blocked`, `unavailable`, `error`, `no_login`, `limit_reached`, `unknown`.
- `createModelCapabilityProfiles` aceita mapa opcional de disponibilidade dinâmica por modelo.
- Regras de escolha no prompt do orquestrador impedem spawn de modelos com status de erro, sem login ou limite atingido.
- Campos `maxCostEstimate` e `maxContextTokens` adicionados às configurações do orquestrador.
- Modal exibe campos de custo estimado e limite de contexto (tokens).
- Badge visual de status de disponibilidade (`Disponível`, `Bloqueado`, `Erro`, `Sem login`, `Limite atingido`, `Indisponível`, `Desconhecido`) exibido ao lado do nome de cada modelo na lista de spawn do modal.
- O botão de perfil `Felixo` permite editar memórias globais salvas nas settings do orquestrador; quando preenchidas, elas entram no prompt normal e também no contexto enviado ao orquestrador.

## Próximos passos

- Alimentar `dynamicAvailability` a partir de erros reais de spawn/execução dos adapters.
- Permitir escolha por modelo específico, não apenas por `cliType`.

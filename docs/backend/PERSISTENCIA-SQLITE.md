# Persistência com SQLite

Status: planejado.

## Objetivo

Planejar a persistência local com SQLite para histórico, sessões, threads, mensagens, resultados de agentes, notas, configurações e memória futura.

## Por que SQLite

- Funciona localmente sem serviço externo.
- É suficiente para protótipo desktop.
- Permite migrações versionadas.
- Facilita backup/exportação.
- Evita depender de cloud para histórico pessoal.

## Separação conceitual

| Dado | Descrição |
|------|-----------|
| Histórico | Chats, mensagens e sessões |
| Threads | Execuções, subagentes e eventos relevantes |
| Notas | Conteúdo salvo manualmente pelo usuário |
| Memória | Conhecimento persistente escolhido ou extraído |
| Configurações | Preferências, modelos, temas e limites |

## Escopo inicial

- Projetos/workspaces.
- Chats.
- Mensagens.
- Threads.
- Eventos relevantes de terminal.
- Resultados de subagentes.
- Configurações simples.
- Notas.

## Cuidados técnicos

- Migrações obrigatórias desde a primeira versão.
- Limite e limpeza de eventos grandes.
- Backup e exportação.
- Privacidade local.
- Separar histórico de memória para evitar envio involuntário de contexto.

## Próximo passo

Criar schema mínimo e camada de repositório no backend Electron antes de migrar histórico, notas, modelos e projetos restantes.

## Recorte já entregue

- Configurações do orquestrador persistem fora do `localStorage` em `app.getPath('userData')/config/orchestrator-settings.json`.
- O renderer ainda lê `localStorage` apenas como migração/fallback quando a bridge Electron não está disponível.

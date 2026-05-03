# Plano: Persistência SQLite, Memória e Compactação

Status: em desenvolvimento.

## Objetivo

Implementar a base de persistência local do Felixo AI Core com SQLite, preparada para:

- salvar chats, mensagens, threads, eventos, notas e configurações;
- transformar mensagens úteis em memória recuperável;
- compactar histórico frio sem perder rastreabilidade;
- manter contratos que possam receber um adapter PostgreSQL no futuro.

## Decisão de arquitetura

O app deve usar repositórios no backend Electron, não SQL direto no renderer.

```text
React Renderer
  -> preload / IPC
    -> storage repositories
      -> SQLite adapter local
      -> PostgreSQL adapter futuro
```

SQLite é o caminho de desenvolvimento e produção desktop. PostgreSQL fica para produção servidor/cloud/multiusuário.

## Modelo HOT/WARM/COLD

| Camada | Estado | Uso |
|--------|--------|-----|
| HOT | texto normal, recente, usado com frequência | entra primeiro no contexto |
| WARM | texto normal ou resumo, indexado | recuperado por busca/relevância |
| COLD | resumo + metadados + bloco compactado | recuperado só sob demanda |

## Tabelas do recorte inicial

| Tabela | Status | Observação |
|--------|--------|------------|
| `schema_migrations` | implementado no schema | controle de versão do banco |
| `projects` | implementado no schema | workspaces locais |
| `chats` | implementado no schema | conversas por projeto |
| `messages` | implementado no schema | conteúdo, token usage agregado, score e tier |
| `threads` | implementado no schema | execuções de CLIs/providers |
| `terminal_events` | implementado no schema | eventos relevantes, com retenção |
| `agent_results` | implementado no schema | subagentes e orquestração |
| `notes` | implementado no schema | notas manuais |
| `settings` | implementado no schema | preferências simples |
| `memory_items` | implementado no schema | memórias candidatas/aprovadas |
| `conversation_summaries` | implementado no schema | resumos por faixa |
| `message_archives` | implementado no schema | blocos frios compactados |

## Ordem de implementação

1. Criar migrations SQL e loader de migrações.
2. Criar política de tier/compactação para mensagens.
3. Criar repositórios e contratos de dados.
4. Migrar `settings` simples para SQLite.
5. Migrar `notes`.
6. Migrar `projects`.
7. Migrar `chats` e `messages`.
8. Persistir `threads`, `terminal_events` e `agent_results`.
9. Criar extração/curadoria de `memory_items`.
10. Criar compactação de COLD com `conversation_summaries` e `message_archives`.

## Implementando agora

- [x] Migration inicial com schema das tabelas.
- [x] Loader de migrations versionadas.
- [x] Política inicial HOT/WARM/COLD para classificar mensagens.
- [x] Testes unitários do schema e da política.
- [x] Driver SQLite escolhido: `node:sqlite` nativo do Node/Electron.
- [x] Banco real aberto em `app.getPath('userData')/database/felixo.sqlite`.
- [x] Migrations executadas automaticamente na inicialização do app.
- [x] Repositório inicial de `settings`.
- [x] Configurações do orquestrador migradas do JSON legado para SQLite.
- [x] Repositório de `notes`.
- [x] IPCs de `notes`.
- [x] Migração inicial das notas do `localStorage` para SQLite.
- [x] Repositório de `projects`.
- [x] IPCs de `projects`.
- [x] Migração inicial de projetos e projetos ativos do `localStorage` para SQLite.

Arquivos implementados:

- `app/electron/services/storage/migrations/001_initial_persistence.sql`
- `app/electron/services/storage/migration-loader.cjs`
- `app/electron/services/storage/memory-tier-policy.cjs`
- `app/electron/services/storage/sqlite-database.cjs`
- `app/electron/services/storage/settings-repository.cjs`
- `app/electron/services/storage/notes-repository.cjs`
- `app/electron/services/notes-ipc-handlers.cjs`
- `app/electron/services/storage/projects-repository.cjs`
- `app/electron/services/storage-persistence.test.cjs`

## Pendências

- [ ] Criar transações e helpers de consulta.
- [ ] Criar IPCs de persistência para histórico.
- [ ] Migrar dados restantes do `localStorage`.
- [ ] Migrar configurações do orquestrador para remover fallback JSON legado em versão futura.
- [ ] Criar busca textual.
- [ ] Criar compactação real de mensagens COLD.
- [ ] Criar tela/controle para revisar memórias candidatas.
- [ ] Criar exportação/backup do banco.
- [ ] Criar adapter PostgreSQL futuro.

## Critérios de aceite do primeiro recorte

- [x] Existe uma migration SQL versionada com schema inicial.
- [x] Existe teste impedindo migration duplicada e cobrindo arquivos fora do padrão.
- [x] Existe política testada para classificar mensagem como HOT, WARM ou COLD.
- [x] A documentação indica claramente o que foi implementado e o que ficou pendente.
- [x] Banco SQLite real abre em filesystem temporário e aplica migrations uma única vez.
- [x] `settings` salva/consulta JSON pelo SQLite.

## Cuidados

- Não migrar histórico real antes de existir migração versionada.
- Não adicionar dependência nativa SQLite sem avaliar impacto no empacotamento.
- Não compactar mensagens sem manter resumo, metadados e IDs recuperáveis.
- Não tratar toda conversa antiga como memória ativa.

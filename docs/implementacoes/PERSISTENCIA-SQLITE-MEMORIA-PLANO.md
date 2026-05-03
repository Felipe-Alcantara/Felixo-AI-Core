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
| `schema_migrations` | planejado | controle de versão do banco |
| `projects` | planejado | workspaces locais |
| `chats` | planejado | conversas por projeto |
| `messages` | planejado | conteúdo, token usage agregado, score e tier |
| `threads` | planejado | execuções de CLIs/providers |
| `terminal_events` | planejado | eventos relevantes, com retenção |
| `agent_results` | planejado | subagentes e orquestração |
| `notes` | planejado | notas manuais |
| `settings` | planejado | preferências simples |
| `memory_items` | planejado | memórias candidatas/aprovadas |
| `conversation_summaries` | planejado | resumos por faixa |
| `message_archives` | planejado | blocos frios compactados |

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

- [ ] Migration inicial com schema das tabelas.
- [ ] Loader de migrations versionadas.
- [ ] Política inicial HOT/WARM/COLD para classificar mensagens.
- [ ] Testes unitários do schema e da política.

## Pendências

- [ ] Escolher driver SQLite final para Electron.
- [ ] Abrir banco real em `app.getPath('userData')/database/felixo.sqlite`.
- [ ] Criar IPCs de persistência.
- [ ] Migrar dados existentes do `localStorage`.
- [ ] Criar busca textual.
- [ ] Criar compactação real de mensagens COLD.
- [ ] Criar tela/controle para revisar memórias candidatas.
- [ ] Criar exportação/backup do banco.
- [ ] Criar adapter PostgreSQL futuro.

## Critérios de aceite do primeiro recorte

- Existe uma migration SQL versionada com schema inicial.
- Existe teste impedindo migration duplicada, fora de ordem ou sem versão.
- Existe política testada para classificar mensagem como HOT, WARM ou COLD.
- A documentação indica claramente o que foi implementado e o que ficou pendente.

## Cuidados

- Não migrar histórico real antes de existir migração versionada.
- Não adicionar dependência nativa SQLite sem avaliar impacto no empacotamento.
- Não compactar mensagens sem manter resumo, metadados e IDs recuperáveis.
- Não tratar toda conversa antiga como memória ativa.

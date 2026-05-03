# Persistência com SQLite

Status: em desenvolvimento.

## Objetivo

Planejar e implementar a persistência local com SQLite para histórico, sessões, threads, mensagens, resultados de agentes, notas, configurações e memória futura.

O banco deve permitir que o Felixo salve bastante contexto local sem enviar tudo para os modelos. A regra central é:

- guardar histórico completo quando fizer sentido;
- transformar mensagens úteis em memória recuperável;
- compactar histórico frio que não precisa estar sempre disponível;
- escolher pouco e bem antes de montar o prompt.

## Por que SQLite

- Funciona localmente sem serviço externo.
- É suficiente para protótipo desktop.
- Permite migrações versionadas.
- Facilita backup/exportação.
- Evita depender de cloud para histórico pessoal.

## SQLite e PostgreSQL

SQLite é o banco padrão para desenvolvimento local e para o app desktop empacotado. PostgreSQL fica reservado para uma fase futura com backend remoto, sincronização, multiusuário, acesso pelo celular ou servidor 24/7.

A aplicação não deve acoplar a UI ao SQL. O renderer chama IPCs e o backend Electron expõe repositórios, por exemplo:

- `saveMessage(...)`
- `listChats(...)`
- `saveMemoryItem(...)`
- `searchMemory(...)`
- `compactColdMessages(...)`

Por baixo, o primeiro adapter será SQLite. Um adapter PostgreSQL futuro deve reaproveitar os mesmos contratos sempre que possível.

## Separação conceitual

| Dado | Descrição |
|------|-----------|
| Histórico | Chats, mensagens e sessões |
| Threads | Execuções, subagentes e eventos relevantes |
| Notas | Conteúdo salvo manualmente pelo usuário |
| Memória | Conhecimento persistente escolhido ou extraído |
| Configurações | Preferências, modelos, temas e limites |

## Camadas de memória e histórico

Nem todo histórico deve virar memória ativa. O banco deve separar o que está quente, morno e frio:

| Camada | Uso | Exemplo | Estratégia |
|--------|-----|---------|------------|
| HOT | Contexto recente e frequentemente útil | mensagens recentes, decisões fixadas, preferências usadas sempre | fica em texto normal e entra primeiro na seleção de contexto |
| WARM | Memórias e resumos recuperáveis | decisões de projeto, aprendizados, trechos relevantes, resumos por conversa | indexado por tags, escopo e score; entra no prompt só quando relevante |
| COLD | Histórico antigo pouco usado | conversas longas antigas, logs já resumidos, deltas de streaming | fica compactado ou resumido; descompacta só sob demanda |

Essa separação evita dois problemas:

- mandar contexto demais para o modelo;
- perder informação útil porque ela não cabia no prompt naquele momento.

## O que será salvo

| Categoria | Salvar? | Detalhe |
|-----------|---------|---------|
| Chats e conversas | Sim | mensagens completas, status, modelo, projeto e timestamps |
| Histórico de sessões | Sim | chats, threads, providers, sessão externa e estado da execução |
| Uso de tokens | Sim | contadores agregados por mensagem/run, não cada token individual |
| Memórias | Sim | itens extraídos ou aprovados, separados do histórico bruto |
| Eventos do terminal | Parcial | eventos relevantes e logs com retenção/limite |
| Respostas de subagentes | Sim | prompt enviado, resultado, erro, status e tempos |
| Arquivos do projeto | Não por padrão | guardar caminho/metadados; snapshot só quando explicitamente necessário |
| Deltas brutos de streaming | Limitado | úteis para debug, mas devem expirar ou compactar |

## Token usage

O banco deve salvar uso agregado, por exemplo:

```json
{
  "inputTokens": 1200,
  "outputTokens": 850,
  "totalTokens": 2050,
  "estimatedCost": 0.02,
  "provider": "codex",
  "model": "gpt-5.4"
}
```

Não é objetivo salvar cada token individual. Isso aumenta volume, piora consulta e raramente ajuda o usuário.

## Memória curada

Memória não é igual a histórico. O fluxo planejado:

1. salvar a conversa completa como histórico;
2. extrair candidatos de memória;
3. classificar como `candidate`, `approved`, `rejected` ou `auto`;
4. associar escopo: `global`, `project`, `repo`, `chat` ou `agent`;
5. usar score, tags e data de uso para decidir o que entra no prompt.

Exemplos de tipos de memória:

- `fact`: fato estável sobre projeto/usuário;
- `preference`: preferência operacional;
- `decision`: decisão técnica tomada;
- `task`: tarefa recorrente ou pendente;
- `insight`: aprendizado útil extraído de conversa;
- `warning`: cuidado/riscos que precisam reaparecer.

## Escopo inicial

- Projetos/workspaces.
- Chats.
- Mensagens.
- Threads.
- Eventos relevantes de terminal.
- Resultados de subagentes.
- Configurações simples.
- Notas.
- Memórias candidatas e aprovadas.
- Resumos compactos de conversas.
- Arquivos compactados de mensagens frias.

## Tabelas planejadas

| Tabela | Finalidade | Recorte |
|--------|------------|---------|
| `schema_migrations` | controle de migrações aplicadas | inicial |
| `projects` | projetos/workspaces locais | inicial |
| `chats` | conversas agrupadas por projeto | inicial |
| `messages` | mensagens do usuário, assistente, sistema e tools | inicial |
| `threads` | execuções por modelo/provider/thread | inicial |
| `terminal_events` | eventos relevantes do terminal | inicial |
| `agent_results` | resultados de subagentes/orquestração | inicial |
| `notes` | notas salvas manualmente | inicial |
| `settings` | preferências e configurações simples | inicial |
| `memory_items` | memórias curadas/candidatas | inicial |
| `conversation_summaries` | resumos por faixa de mensagens | inicial |
| `message_archives` | blocos frios compactados | inicial |

## Cuidados técnicos

- Migrações obrigatórias desde a primeira versão.
- Limite e limpeza de eventos grandes.
- Backup e exportação.
- Privacidade local.
- Separar histórico de memória para evitar envio involuntário de contexto.
- Não compactar antes de existir resumo e metadados pesquisáveis.
- Não enviar memória automaticamente sem regra de relevância.
- Não salvar snapshots de arquivos grandes sem ação explícita do usuário.
- Manter SQL inicial compatível o suficiente para facilitar Postgres futuro.

## Política de retenção inicial

| Dado | Retenção sugerida | Observação |
|------|-------------------|------------|
| `messages` HOT/WARM | indefinida até política de limpeza manual | texto pesquisável |
| `messages` COLD | compactar após resumo | manter IDs e metadados |
| `terminal_events` | limitar por chat/thread | salvar eventos importantes, não todo ruído |
| `agent_results` | manter enquanto o chat existir | necessário para auditoria da orquestração |
| `memory_items` | manter até rejeição/remoção | usuário deve poder editar/remover |
| `message_archives` | manter enquanto o usuário quiser histórico profundo | exportável |

## Recuperação de contexto

Fluxo esperado antes de chamar um modelo:

1. carregar mensagens recentes do chat;
2. buscar memórias relevantes por projeto/repositório/agente;
3. buscar resumos WARM quando a conversa for antiga;
4. descompactar COLD apenas se uma busca apontar para aquele bloco ou se o usuário pedir histórico profundo;
5. montar prompt com orçamento de tokens e registrar o que foi usado.

## Próximo passo

Criar schema mínimo, migrações versionadas e camada de repositório no backend Electron antes de migrar histórico, notas, modelos e projetos restantes.

## Recorte já entregue

- Configurações do orquestrador persistem fora do `localStorage` em `app.getPath('userData')/config/orchestrator-settings.json`.
- O renderer ainda lê `localStorage` apenas como migração/fallback quando a bridge Electron não está disponível.
- Migration inicial criada com tabelas de histórico, memória, resumo, arquivos compactados, notas, settings e eventos.
- Loader de migrations versionadas criado no backend Electron.
- Política inicial HOT/WARM/COLD criada para classificar e decidir compactação de mensagens.

## Ainda não implementado

- Driver SQLite final no Electron.
- Abertura real do banco em `app.getPath('userData')/database/felixo.sqlite`.
- Execução de migrations contra banco real.
- IPCs de leitura/escrita.
- Migração dos dados atuais do `localStorage`.
- Compactação real de mensagens COLD.
- Busca textual/semântica.

## Plano de implementação

Plano detalhado: [PERSISTENCIA-SQLITE-MEMORIA-PLANO.md](../implementacoes/PERSISTENCIA-SQLITE-MEMORIA-PLANO.md).

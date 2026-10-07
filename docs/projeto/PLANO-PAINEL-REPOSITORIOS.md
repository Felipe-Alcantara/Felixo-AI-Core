# Painel de repositórios no bloco Tarefas Notion — desenho e plano

> **Para agentes:** plano executado tarefa a tarefa, com `- [ ]` para acompanhar.
> Ideia aprovada em 07/10/2026; este arquivo é o registro do desenho e da ordem de execução.

**Objetivo:** mostrar as tarefas de uma database do Notion como um painel de cartões, um por
repositório (ou por qualquer valor de uma coluna de agrupamento), com placar de progresso — o mesmo
jeito de ler o trabalho que uma página "Repositórios" em galeria do Notion dá, sem sair do canvas.

**Arquitetura:** os cartões são montados no renderer, por funções puras, a partir das tarefas que o
bloco já carregou. Os detalhes de cada repositório (link, linguagem, arquivado) vêm de uma segunda
database — a que a coluna de ligação das tarefas aponta — lida pelo mesmo canal `notion:tasks:list`,
com o mesmo cache local. Nada muda no processo principal.

**Stack:** React 19 + TypeScript, Vitest (ambiente node), Tailwind, `FelixoSelect`.

## Decisões de produto

| Pergunta | Decisão |
| --- | --- |
| De onde vêm os cartões | Das duas fontes: o placar sai da coluna de agrupamento das tarefas (ex.: `Repositório`); quando o nome bate com uma linha da database ligada (ex.: `GITHUB`), o cartão ganha link, etiquetas e o estado de arquivado. |
| Onde aparece | Aba **Painel**, a primeira da faixa de visualizações do bloco Tarefas Notion. |
| Clique no cartão | Abre a tabela (visualização "Todas") filtrada naquele valor, com um chip removível. O filtro é temporário: não vira visualização salva. |
| Arquitetura | Cartões no renderer; segunda database pelo IPC existente. |

## Regras do cartão

- **Agrupamento:** coluna `select`, `multi_select`, `status` ou `relation` das tarefas. Automático:
  a primeira cujo nome lembra "repositório"; senão "projeto"; senão nenhuma (o painel pede a escolha).
  Em `multi_select`, a tarefa conta em cada valor. Em `relation`, a chave é o ID da página ligada e o
  nome vem da database de detalhes.
- **Placar:** total, abertas (`!completed`), concluídas e `% = round(concluídas / total × 100)`.
  `completed` é o campo já calculado pelo processo principal (Etapa "Concluída" ou caixa de conclusão).
- **Sem valor:** as tarefas sem a coluna preenchida viram o cartão "Sem <coluna>", sempre no fim.
- **Ordem:** mais abertas primeiro; empate por total; depois por nome (pt-BR).
- **Detalhes:** a coluna de ligação automática é a própria coluna de agrupamento, quando ela é
  `relation`; senão, a primeira `relation` cujo nome lembra "projeto"/"repositório". A database lida é
  o alvo dessa ligação no schema (`relation.data_source_id`, com `database_id` de reserva).
- **Casamento por nome (agrupamento que não é ligação):** compara o valor do grupo, normalizado (sem
  acento, minúsculo, `-`/`_`/espaço/ponto equivalentes), com o trecho do título depois da última `/`
  (`dono/repositório`) e com o último trecho do caminho do link. Com mais de um candidato (o mesmo
  repositório em duas contas): vence o mais ligado pelas tarefas daquele grupo; depois o que não é
  fork (caixa `Fork`); depois o título em ordem alfabética.
- **Link:** primeira coluna `url` cujo nome lembra "github"/"repositório"; senão a chamada `URL`;
  senão a primeira `url`.
- **Etiquetas:** valores das colunas escolhidas da database de detalhes (`select`, `multi_select`,
  `status`). Automático: as que lembram linguagem, stack, tecnologia, status ou estado. Linha com a
  caixa "Arquivado" marcada ganha a etiqueta "Arquivado".
- **Repositórios sem tarefas:** escondidos por padrão (a database medida tinha 77 de 91 linhas sem
  nenhuma tarefa). A opção "Mostrar repositórios sem tarefas" traz os que não são fork nem arquivados.
- **Busca:** no Painel, o campo de busca filtra os cartões pelo nome, sem recarregar do Notion.
- **Preferências:** `felixo:notion-repo-board:<conexão>:<database>` guarda coluna de agrupamento,
  ligação de detalhes, etiquetas, "mostrar sem tarefas" e se o Painel era a aba aberta.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `app/src/features/canvas/services/notion-repo-board.ts` (novo) | Funções puras: preferências, colunas elegíveis, resolução do automático, cartões, filtro por grupo. |
| `app/src/features/canvas/services/notion-repo-board.test.ts` (novo) | Contrato das funções acima. |
| `app/src/features/canvas/hooks/useNotionDetailsSource.ts` (novo) | Carrega a database de detalhes (cache local, depois rede). |
| `app/src/features/canvas/components/tools/NotionRepoBoard.tsx` (novo) | Grade de cartões e a configuração do Painel. |
| `app/src/features/canvas/components/tools/NotionTasksPanel.tsx` | Aba Painel, chip do filtro temporário, busca sem recarga no Painel. |
| `app/src/features/canvas/inventory/data/*` + `docs/projeto/INVENTARIO-CANVAS.md` | Contrato dos controles novos (gerado). |

## Tarefas

### Tarefa 1 — Funções do painel (`notion-repo-board.ts`)

**Produz:**

- `REPO_BOARD_VIEW: NotionTaskView` (`id: 'painel'`, `statusFilter: 'all'`), `NO_GROUP_KEY`
- `type RepoBoardSettings = { groupBy: string | null; detailsVia: string | null; tagProperties: string[] | null; showEmpty: boolean; open: boolean }` — `null` = automático; `detailsVia: ''` = nenhuma
- `readRepoBoardSettings(connectionId, dataSourceId, storage?)` / `saveRepoBoardSettings(..., settings, storage?)`
- `listGroupableProperties(schema): string[]`, `listRelationProperties(schema): string[]`
- `resolveGroupBy(schema, settings): string`, `resolveDetailsVia(schema, settings, groupBy): string`
- `relationTarget(schema, name): { dataSourceId: string | null; databaseId: string | null } | null`
- `listTagCandidates(detailsSchema): string[]`, `resolveTagProperties(detailsSchema, settings): string[]`
- `type RepoCard = { key; label; total; open; done; percent; tags: string[]; link: string | null; archived: boolean; clickable: boolean }`
- `buildRepoCards({ tasks, schema, groupBy, detailsVia, details, tagProperties, showEmpty, search }): RepoCard[]`
- `type RepoGroupFilter = { property: string; key: string; label: string }`, `filterTasksByGroup(tasks, schema, filter)`

- [x] Testes que falham primeiro: agrupamento por select (placar e %), multi_select (conta em cada
  valor), relation (nome vindo dos detalhes), cartão "Sem Repositório" no fim, ordem, casamento
  `dono/nome` e pelo link, desempate por ligação e por fork, arquivado, "mostrar sem tarefas", busca,
  automático das colunas, preferências com JSON inválido, `filterTasksByGroup` (inclui o grupo vazio).
- [x] Implementar até passar (`npx vitest run src/features/canvas/services/notion-repo-board.test.ts`).
- [x] Commit `feat(notion): montar o placar de repositórios a partir das tarefas`.

### Tarefa 2 — Aba Painel no bloco

**Consome:** a Tarefa 1.

- [x] `useNotionDetailsSource({ api, connectionId, target, enabled, refreshKey })` →
  `{ details: { rows, schema } | null, status: 'idle' | 'loading' | 'ready' | 'error', message }`.
- [x] `NotionRepoBoard` com a grade e a configuração (Agrupar por, Detalhes pela ligação,
  Etiquetas, Mostrar sem tarefas).
- [x] No painel: aba Painel antes das visualizações; no Painel a carga usa `status: 'all'` e busca
  vazia; clique → visualização "Todas" + chip; troca de conexão/database limpa o chip e reabre a aba
  guardada.
- [x] Inventário do canvas atualizado e regenerado (`npm run docs:inventario-canvas`).
- [x] `npm run lint`, `npm run build`, vitest e a suíte node.
- [x] Commit `feat(canvas): aba Painel com cartões de repositório no bloco Tarefas Notion`.

### Tarefa 3 — Ver rodando e documentar

- [x] Renderizar o painel com dados de fixture fora do app e capturar a tela (Painel, configuração,
  clique → tabela filtrada).
- [x] README, guia do usuário, arquitetura e `IA.md` no mesmo passo.
- [x] Commit `docs(notion): painel de repositórios`.

## Pontos de atenção (sem teste automático de componente)

1. Trocar de aba enquanto a carga anterior ainda chega: o placar não pode usar a lista filtrada de
   outra visualização (o Painel só desenha com tarefas carregadas em `status: 'all'` e busca vazia).
2. Database de detalhes não compartilhada com a integração: os cartões continuam com o placar e o
   painel diz que os detalhes não carregaram.
3. Database sem nenhuma coluna agrupável: o Painel explica e não quebra.
4. Mais de 2.000 tarefas: o aviso de carga parcial que o bloco já mostra vale também para o placar.
5. Preferência salva apontando para coluna que foi renomeada: volta ao automático.

## Fora do escopo

- Pasta local do repositório ("Sem repositório local" no Notion de origem).
- Sincronização automática da database de detalhes (ela recarrega ao abrir o Painel e no botão Sincronizar).
- Editar a database de detalhes pelo AI Core.

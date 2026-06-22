# Tasklist 04-05-2026 — Plano de Execucao

Status: concluido.

## Objetivo

Executar a tasklist de 04/05/2026 em recortes incrementais, documentando antes e depois de implementar. O foco deste ciclo e reduzir confusao na interface, limpar contexto entre chats, tornar a orquestracao mais legivel e ampliar o painel Code com operacoes Git basicas.

## Escopo

| Grupo | Entrega |
|------|---------|
| Chat e historico | Novo chat zera estado efemero da conversa anterior, sidebar ganha rolagem, chats recentes mostram os ultimos 5 com acesso a busca completa. |
| Skills e memorias | Novo botao dedicado a Skills, com superprompts persistidos junto ao perfil local; contexto e limites avancados saem do modal principal do orquestrador e ficam concentrados nas configuracoes do Felixo. |
| Modelos | Lista sem duplicatas, exclusao direta pela sidebar e bloqueio de instalar/importar CLI ja existente. |
| Orquestracao | Prompt do orquestrador exige Markdown organizado, separa processo em Terminal e resposta util no chat, orienta uso de anexos e melhora o ciclo com sub-agentes. |
| Markdown | Respostas do chat passam a renderizar Markdown basico, incluindo titulos, listas, codigo inline e blocos de codigo/bash. |
| Code/Git | Painel Code deixa de ser apenas read-only e adiciona funcoes Git basicas com confirmacao: stage, unstage e commit. |

## Decisoes de implementacao

- Manter as mudancas dentro do padrao React/Electron existente, sem introduzir biblioteca externa de Markdown neste ciclo.
- Persistir Skills dentro de `OrchestratorSettings` para reaproveitar o armazenamento ja versionado entre renderer, preload e backend.
- Tratar operacoes Git de escrita como allowlist explicita no backend Electron e com confirmacao no frontend.
- Continuar mostrando qualquer processo de orquestracao no Terminal/QA Logger; o chat deve receber apenas a resposta final util.
- Evitar refatoracoes amplas de arquitetura. O recorte deve ser pequeno o suficiente para validar com `npm test`, `npm run lint`, `npm run build` e `git diff --check`.

## Validacao esperada

- `npm test`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Resultado deste ciclo

- Novo chat reforcado para zerar estado efemero, `sessionId`, `threadId`, diff de projetos, terminal e QA Logger, preservando memorias globais e configuracoes explicitas.
- Sidebar ganhou rolagem na area central; rodape `Code`/`Felixo` permanece fixo.
- Chats recentes mostram os ultimos 5 e usam `SearchPanel` para localizar todos.
- Modelos sao deduplicados por comando normalizado; sidebar permite remover modelo direto; instalar/importar CLI oficial ja cadastrada fica bloqueado.
- Botao `Skills` adicionado com modal para criar, editar, ativar/desativar e remover superprompts persistentes.
- Modal `Orquestrador` foi simplificado para modelos spawnaveis; contexto, workflow, modo e limites globais foram movidos para `Felixo`, junto das memorias globais.
- Prompt normal injeta skills ativas em bloco separado de memorias, historico e anexos.
- Chat passou a renderizar Markdown basico para respostas do assistente, com titulos, listas, codigo inline e blocos fenced.
- Protocolo de orquestracao passou a exigir `final_answer` em Markdown organizado, orientar anexos para sub-agentes e manter processo/logs no Terminal/QA Logger.
- Painel Code recebeu operacoes Git basicas com confirmacao: stage de tudo, unstage de tudo e commit staged com mensagem de uma linha.
- Documentacao criada/atualizada em `docs/frontend/SKILLS.md`, `docs/frontend/MARKDOWN-CHAT.md`, `docs/projeto/PAINEL-GIT-INTEGRADO.md`, `docs/frontend/COMPONENTES.md`, `docs/frontend/NOVO-CHAT.md` e `docs/arquitetura/ORQUESTRADOR-MODELOS-E-CONFIGURACOES.md`.
- Tasklist `docs/Tasklists/Tasklist - 04-05-2026.md` marcada como concluida.

## Commits deste ciclo

- `e92bef4` — docs: planejar tasklist 04-05-2026
- `d16994e` — feat: ajustar sidebar e modelos
- `51acb62` — feat: adicionar skills e simplificar orquestrador
- `f86b46f` — docs: marcar progresso da tasklist
- `1ee31c3` — feat: renderizar markdown no chat
- `7a915e6` — feat: adicionar acoes git basicas

## Validacao executada

- `npm run lint`
- `npm run build`
- `npm test`
- `git diff --check`

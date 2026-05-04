# Tasklist 04-05-2026 — Plano de Execucao

Status: em desenvolvimento.

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

Pendente enquanto a implementacao esta em andamento.

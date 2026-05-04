# Painel Git Integrado

Status: em desenvolvimento.

## Objetivo

Evoluir o painel Code para um painel Git com funções semelhantes ao GitHub Desktop, começando por operações seguras e avançando para escrita com confirmação.

## Estado atual

O app já possui consulta Git inicial:

- branch atual;
- status curto;
- diff stat;
- commits recentes;
- stage de todas as alterações;
- unstage de todas as alterações;
- commit das alterações staged com mensagem de uma linha.

## Escopo inicial recomendado

- Detectar repositório Git.
- Mostrar branch atual.
- Mostrar arquivos modificados.
- Separar staged e unstaged.
- Mostrar diff por arquivo.
- Stage por arquivo.
- Unstage por arquivo.
- Stage de tudo. Concluído no recorte de 04/05/2026.
- Escrever mensagem de commit. Concluído no recorte de 04/05/2026.
- Gerar mensagem de commit com IA.
- Criar commit com confirmação. Concluído no recorte de 04/05/2026.

## Escopo intermediário

- Listar branches locais.
- Criar branch.
- Trocar branch.
- Pull.
- Push.
- Histórico simples de commits.
- Detalhe de commit.

## Escopo avançado

- Merge.
- Resolução de conflitos com IA.
- Stash.
- Tags.
- Remotes.
- Descartar alterações com confirmação forte.

## Política de segurança

Operações destrutivas ou remotas exigem confirmação explícita. `reset`, descarte de alterações, merge e push não devem ser automáticos.

## Recorte implementado em 2026-05-04

### Backend

- `git-service.cjs` expõe allowlist de comandos Git aceitos.
- `git:add --all`, `git:restore --staged -- .` e `git commit -m` são os únicos comandos de escrita adicionados.
- Mensagens de commit são normalizadas para uma linha, com até 200 caracteres.
- `git-ipc-handlers.cjs` expõe:
  - `git:stage-all`;
  - `git:unstage-all`;
  - `git:commit`.

### Frontend

- `CodePanel` ganhou botões `Stage tudo`, `Unstage` e `Commit`.
- Cada operação de escrita pede confirmação via `window.confirm`.
- Depois de uma operação, o painel atualiza o resumo Git.
- O campo de commit fica bloqueado quando não há mensagem.

# Painel Git Integrado

Status: planejado.

## Objetivo

Evoluir o painel Code para um painel Git com funções semelhantes ao GitHub Desktop, começando por operações seguras e avançando para escrita com confirmação.

## Estado atual

O app já possui consulta read-only de Git:

- branch atual;
- status curto;
- diff stat;
- commits recentes.

## Escopo inicial recomendado

- Detectar repositório Git.
- Mostrar branch atual.
- Mostrar arquivos modificados.
- Separar staged e unstaged.
- Mostrar diff por arquivo.
- Stage por arquivo.
- Unstage por arquivo.
- Stage de tudo.
- Escrever mensagem de commit.
- Gerar mensagem de commit com IA.
- Criar commit com confirmação.

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

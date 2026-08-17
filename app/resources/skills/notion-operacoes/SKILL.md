---
name: notion-operacoes
description: Contrato para operar o Notion pela CLI notion-tasks sem estragar nada. Use sempre que a tarefa envolver ler, criar ou editar páginas, tarefas, databases ou relações no Notion — especialmente quando o usuário só mandar um link.
---

# Operar o Notion sem estragar nada

Cada regra aqui corresponde a um erro que já custou trabalho perdido. Siga na ordem.

## 1. Descubra o que o link é, antes de tudo

```bash
notion-tasks conteudo <id>
```

A resposta diz se é página ou database, e traz **as propriedades antes do corpo**.

> ⚠️ **Se vier o campo `databases_dentro`, pare.** Aquela página **contém** uma
> tabela. O conteúdo de verdade são as **linhas** dela, não o corpo da página.
> Escrever ali cria um parágrafo solto embaixo da tabela: não vira linha, não
> aparece em nenhuma view, e ninguém encontra depois. Pegue o `database_id` e
> trabalhe nas linhas.

Este é o erro mais comum de quem recebe um link do Notion sem abrir. A CLI
**recusa** essa escrita por padrão — se ela recusar, não force com
`--mesmo-com-database`: siga o caminho que a mensagem de erro indica.

## 2. Leia o schema antes de escrever num database que você não conhece

```bash
notion-tasks schema <database_id>            # tudo
notion-tasks schema <database_id> --editaveis # só o que aceita escrita
```

Devolve, de uma vez: nome exato de cada coluna, tipo, **valores aceitos** por
select/status, o que o Notion calcula (e recusa em PATCH) e como cada relação
está configurada. Escrever antes disso é adivinhar — e o erro aparece depois de
gravado, não na hora.

## 3. Aprenda o padrão local antes de escrever conteúdo

```bash
notion-tasks linhas <database_id>
notion-tasks conteudo <linha_id>   # leia 2 a 4 linhas existentes
```

Copie o formato que já existe: como o título é escrito, quais seções o corpo
tem, que nível de detalhe é esperado. Não invente um formato novo.

## 4. Escreva na ordem certa

**Linha nova** — tudo numa chamada:

```bash
notion-tasks criar "Título" --status "Entrada" --duracao "Poucas horas" \
  --set "Prioridade=Alta" --set "Projeto=<id>" \
  --conteudo "## Contexto

Texto em Markdown."
```

**Linha existente** — propriedades primeiro, corpo depois:

```bash
notion-tasks editar-linha <linha_id> --set "Etapa=Concluída"
notion-tasks escrever <linha_id> "## Resultado

..."
```

`--append` acrescenta texto a uma coluna de texto sem perder o que já está lá.

## 5. Para ligar duas linhas, use `relacionar` — nunca `editar-linha` na mão

```bash
notion-tasks relacionar <page_a> <page_b> --coluna "Subtarefas relacionadas"
notion-tasks relacionar <page_a> <page_b> --coluna "Depende de" --desfazer
```

Por quê: o tipo declarado da relação (`single_property` / `dual_property`)
**não permite prever** se o Notion espelha o outro lado sozinho. Já foi medido
espelhando quando o tipo dizia que não espelharia. Assumir "espelha" deixa
metade da malha faltando; assumir "não espelha" gasta requisição e pode
duplicar. O comando **confere** a outra ponta e grava só o que falta — é
idempotente e funciona nos dois casos.

## 6. Não destrua o que a ferramenta não sabe repor

`escrever --substituir` apaga o corpo antes de escrever, mas **preserva**
imagem, arquivo, embed, subpágina e `child_database` — e diz o que preservou.

`--apagar-tudo` remove essas exceções também. **Só use com pedido explícito do
usuário**: a URL de arquivo do Notion é assinada e expira, e apagar um
`child_database` leva o database inteiro (restaurar da lixeira gera um ID novo
e quebra todos os links salvos para ele).

## 7. Prefira script a operação manual repetida

Se a mesma ação se repete mais de três vezes, escreva um script **idempotente**
(que pule o que já existe) em vez de repetir comandos. Script vira patrimônio
reutilizável; clique manual não deixa rastro.

## 8. "Recurso não encontrado" quase nunca é permissão

```bash
notion-tasks perfis listar
```

O perfil ativo salvo na CLI **vence o `NOTION_TOKEN` do ambiente**, em silêncio.
Confira o workspace antes de concluir que a página não foi compartilhada.
Use `--perfil <alias>` para uma execução pontual.

## 9. Releia o que gravou

Depois de qualquer escrita, `notion-tasks conteudo <id>` e confirme que ficou
como você pretendia. Relate o que mudou, onde, e o que deixou de fazer.

## Referência rápida

| Preciso… | Comando |
| --- | --- |
| Saber o que é este link | `conteudo <id>` |
| Saber as colunas de um database | `schema <database_id>` |
| Listar linhas | `linhas <database_id>` |
| Criar linha completa | `criar "Título" --set ... --conteudo ...` |
| Editar colunas | `editar-linha <id> --set "Col=valor"` |
| Escrever corpo | `escrever <id> "# Markdown"` |
| Ligar duas linhas | `relacionar <a> <b> --coluna "Nome"` |
| Guia completo (escrito para IAs) | `notion-tasks --help` |

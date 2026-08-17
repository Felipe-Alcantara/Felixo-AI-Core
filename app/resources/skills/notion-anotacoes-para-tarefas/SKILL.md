---
name: notion-anotacoes-para-tarefas
description: Transformar um bloco de anotações cruas em tarefas ricas num database do Notion — investigando cada link e repositório citado antes de escrever, e sem executar o trabalho que as tarefas descrevem. Use quando o usuário mandar uma lista de ideias/pedidos e apontar um database de tarefas.
---

# Anotações cruas viram tarefas no Notion

**Escopo, antes de tudo:** sua entrega é a **tarefa escrita**, não o trabalho
que ela descreve. Não conserte o bug, não escreva o artigo, não faça a
auditoria — descreva cada um desses trabalhos bem o bastante para outra pessoa
(ou outro agente) executar **sem refazer sua investigação**.

Leia antes: a skill `notion-operacoes` (contrato de escrita) e
`destilar-anotacoes` (como ler texto cru sem perder informação).

## Etapa 1 — Prepare o terreno

```bash
notion-tasks conteudo <id_do_link>     # se vier "databases_dentro", vá pelo database
notion-tasks schema <database_id>      # colunas, valores aceitos, relações
notion-tasks linhas <database_id>      # o que já existe
notion-tasks conteudo <linha_id>       # leia 2 a 4 tarefas, e COPIE o padrão delas
```

Não invente um formato novo. O padrão do database vence sua preferência.

## Etapa 2 — Investigue cada anotação antes de escrever a tarefa dela

Esta é a etapa que separa tarefa útil de lembrete inútil.

- **Abra todo link citado** e leia de verdade.
- Em repositório: `README`, `IA.md`/`AGENTS.md`, `git log --oneline`. Quando a
  anotação descrever um comportamento errado, **ache o código responsável** e
  cite arquivo e função.
- **Procure a causa, não o sintoma.** Se dois itens da lista têm a mesma raiz
  técnica, isso vale mais que as duas descrições separadas — e vira uma
  ligação entre as tarefas.
- **Anote números** (linhas, tamanhos, datas, commits, custos). Número medido
  vence adjetivo.
- Se algo que a anotação afirma **não se confirmar** no código, registre a
  divergência na tarefa em vez de repetir a anotação.

## Etapa 3 — Escreva a tarefa

- **Título**: a frase entre aspas da anotação é como o usuário anotou, **não é
  o título**. Escreva um título próprio, específico e acionável.
- **Corpo**: contexto com os links reais em Markdown → o problema por extenso →
  o que a investigação encontrou (arquivo/linha/commit/número) → o que fazer,
  em passos → pontos de atenção → critérios de aceite verificáveis.
- **Propriedades**: preencha todas as que fizerem sentido, com valores que o
  schema aceita.

Numa chamada só:

```bash
notion-tasks criar "Título" --status "Entrada" --duracao "Muitas horas" \
  --set "Prioridade=Alta" --set "Projeto=<id>" --conteudo "## Contexto..."
```

## Etapa 4 — Ligue o que se relaciona

```bash
notion-tasks relacionar <a> <b> --coluna "<coluna de relação>"
```

E explique **o motivo da ligação** no corpo das duas, com link clicável. A
propriedade serve à interface; o texto com link serve ao agente que lê a página.

## Etapa 5 — Script, não repetição

Mais de três tarefas? Escreva um script idempotente (pula o que já existe pelo
título) em vez de repetir comandos. Ele pode ser rodado de novo sem duplicar e
vira patrimônio reutilizável.

## Ao final, relate

Quantas tarefas criou, quais ligações fez, **o que você descobriu que o usuário
não sabia**, e qualquer decisão que tomou sozinho (juntou dois itens? dividiu
um em dois? diga).

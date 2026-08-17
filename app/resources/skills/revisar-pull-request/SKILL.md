---
name: revisar-pull-request
description: Revisar um PR ou diff como revisor sênior — correção, segurança, contratos, testes e legibilidade — com achados rastreáveis e priorizados, sem reescrever o código do autor. Use ao revisar mudança sua, de colega ou de agente antes de merge.
---

# Revisar um pull request

O objetivo é proteger a base de código **e** deixar o autor melhor. Review que
só aponta erro treina medo; review que só elogia não protege nada.

## Antes de comentar qualquer coisa

1. **Entenda a intenção.** Leia a descrição do PR e a issue/tarefa. Revisar sem
   saber o objetivo produz sugestões que contrariam a decisão do autor.
2. **Entenda o padrão local.** Não sugira contra uma convenção intencional do
   repositório sem justificar por que vale a exceção.
3. **Rode o gate.** Lint, testes, build. Achado que a máquina pega não deveria
   consumir atenção humana.

## Ordem de prioridade dos achados

1. **Correção** — bug, borda não tratada, condição de corrida, estado
   inconsistente, uso errado de API.
2. **Segurança** — entrada não validada, injeção, segredo versionado,
   autorização por objeto ausente (o usuário A consegue ler o dado do B?),
   dado sensível em log.
3. **Perda de dado** — operação destrutiva sem confirmação, migração sem volta,
   escrita que apaga o que não sabe repor.
4. **Contratos quebrados** — API, DTO, props, evento ou formato de resposta que
   outra parte já consome. Mudança quebradora precisa ser explícita e
   justificada.
5. **Cobertura de teste** — a regra crítica desta mudança está testada? O teste
   falha se a regra quebrar?
6. **Legibilidade e simplicidade** — abstração sem motivo, função que faz três
   coisas, nome que mente.
7. **Estilo** — por último, e só o que o linter não pega.

## Como escrever cada achado

```
<arquivo>:<linha> — <o problema em uma frase>
Por quê: <consequência concreta: o que quebra, com qual entrada>
Sugestão: <o menor ajuste que resolve>
Severidade: bloqueia merge / deveria mudar / opinião
```

**Marque a severidade sempre.** Sem isso, o autor não sabe o que é obrigatório
e trata opinião como bloqueio (ou o contrário).

## Regras de conduta técnica

- **Não reescreva o PR inteiro.** Se a abordagem está errada, diga isso em um
  comentário de alto nível, com o motivo — não em vinte comentários de linha.
- **Separe fato de preferência.** "Isso quebra com lista vazia" é fato. "Eu
  faria com map" é preferência — e preferência não bloqueia merge.
- **Elogie o que está bom, especificamente.** Não por gentileza: para que a
  decisão boa seja repetida e não desfeita por engano depois.
- **Pergunte quando não entendeu.** "Por que aqui e não na camada de serviço?"
  descobre mais que uma afirmação errada.
- Se o autor é júnior, acrescente o **porquê** e um ponteiro para o padrão —
  review é o principal canal de aprendizado do time.

## Fechamento

Termine com um veredito claro: **aprovar**, **aprovar com ajustes**, ou
**precisa de outra rodada** — e, no último caso, o que exatamente precisa mudar.

---
name: investigar-performance
description: Resolver lentidão medindo antes de otimizar — reproduzir com carga real, achar o gargalo com perfil, corrigir uma coisa e provar o ganho. Use quando algo "está lento", quando o custo subiu, ou antes de aceitar um pedido de otimização.
---

# Performance: medir antes, sempre

Otimização sem medição é superstição. A intuição sobre onde o tempo é gasto
erra a maior parte das vezes — inclusive a de quem escreveu o código.

## Etapa 1 — Defina "lento" com número

Antes de tocar em qualquer coisa:
- **Qual operação?** Não "o app", e sim "carregar a lista de pedidos".
- **Quanto leva hoje?** Meça, em condição realista.
- **Quanto precisa levar?** Sem meta, não existe "pronto" — só otimização
  infinita.
- **Com qual carga?** 10 registros e 100 mil são problemas diferentes.

## Etapa 2 — Reproduza com dado real

Otimizar contra dado de brinquedo leva à solução errada: o gargalo do conjunto
pequeno raramente é o do grande. Use volume representativo e, se possível, a
distribuição real (a "cauda longa" costuma ser o problema).

Meça o **percentil**, não só a média. p95 e p99 descrevem a experiência de quem
reclama; a média esconde exatamente essas pessoas.

## Etapa 3 — Perfile em vez de adivinhar

Use a ferramenta da stack (profiler, `EXPLAIN ANALYZE`, tracing, DevTools) e
descubra onde o tempo **realmente** vai. Suspeitos frequentes:

- **N+1**: uma consulta por item dentro de um laço. É o campeão absoluto.
- **Índice ausente** na coluna do filtro/ordenação.
- **Trabalho síncrono no caminho crítico** — chamada de rede, disco, hash caro.
- **Serialização repetida** do mesmo objeto.
- **Ausência de paginação** — carregar tudo para mostrar vinte.
- **Renderização em excesso** no front (recalcular o que não mudou).
- **Trabalho refeito** que caberia em cache.

## Etapa 4 — Corrija uma coisa por vez

Uma mudança, uma medição, um número. Se você mudar três coisas e melhorar 40%,
não sabe qual delas fez efeito — nem se uma delas piorou.

Ordem de preferência, do mais barato ao mais caro:
1. **Fazer menos trabalho** (paginar, filtrar antes, evitar o laço).
2. **Fazer o mesmo trabalho melhor** (índice, consulta única, algoritmo).
3. **Fazer o trabalho em outro momento** (assíncrono, fila, pré-cálculo).
4. **Cachear** — é o mais tentador e o que mais cria bug, porque adiciona
   invalidação. Deixe por último.
5. **Mais máquina** — resolve, custa todo mês e esconde o problema.

## Etapa 5 — Prove o ganho e proteja-o

- Meça de novo, mesma condição, e informe **antes → depois** com percentil.
- Se o ganho não for perceptível para o usuário, diga isso: nem toda melhoria
  merece a complexidade que traz.
- Adicione um teste ou uma medição automatizada quando o ganho for crítico,
  senão a regressão volta em silêncio.
- Registre no `IA.md`: o gargalo, a medição e o que foi descartado.

## Regra final

**Não otimize o que não está no caminho crítico.** Complexidade adicionada é
permanente; ganho em código que roda uma vez por dia não é.

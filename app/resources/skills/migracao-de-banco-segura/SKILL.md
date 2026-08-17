---
name: migracao-de-banco-segura
description: Alterar schema de banco em produção sem downtime e sem perder dado — expand/contract, migração reversível, e o cuidado com o que não volta. Use ao criar/alterar/remover coluna ou tabela, renomear campo, ou consolidar migrações bagunçadas.
---

# Migração de banco sem perder dado

Código quebrado se reverte com um commit. Dado perdido não volta. Trate
migração como a operação mais perigosa do seu dia.

## O princípio: expand / migrate / contract

Nunca faça mudança quebradora num passo só. Divida em três releases:

1. **Expand** — adicione o novo (coluna, tabela, índice) **sem remover o
   antigo**. O código antigo continua funcionando.
2. **Migrate** — passe a escrever nos dois, faça o backfill dos dados
   existentes, e mova a leitura para o novo. Valide que os dois batem.
3. **Contract** — só depois que nada mais lê o antigo, remova-o.

Isso permite reverter o deploy em qualquer ponto sem que a aplicação antiga
encontre um schema que ela não conhece.

**Renomear coluna** é o caso clássico: não é `RENAME`, é adicionar → copiar →
ler do novo → parar de escrever no antigo → remover.

## Antes de rodar qualquer migração

- **Backup verificado.** Backup que nunca foi restaurado não é backup — é
  esperança. Saiba quanto tempo a restauração leva.
- **Teste em cópia dos dados reais**, com volume real. Migração que leva 200 ms
  em dev pode travar a tabela por minutos em produção.
- **Saiba se a operação bloqueia.** Adicionar coluna com valor default, criar
  índice, alterar tipo — o custo varia por banco e por versão. Prefira a variante
  concorrente/não bloqueante quando existir.
- **Escreva o caminho de volta** antes de aplicar o de ida. Migração sem
  reversão precisa ser decisão consciente, registrada.

## Higiene do histórico de migrações

Sintomas de que o histórico vai dar problema:
- Numeração ambígua (dois arquivos com o mesmo número).
- Migração aplicada por código de aplicação **e** por arquivo, em paralelo.
- Erro silenciado (`catch` vazio) no runner de migração — a pior de todas: o
  banco fica em estado desconhecido e ninguém sabe.
- Migração editada depois de já ter rodado em produção.

Regra: migração aplicada é **imutável**. Corrigir se faz com migração nova.

## Dados, não só schema

- Backfill em **lotes** com pausa, não em uma transação gigante.
- Backfill precisa ser **idempotente e retomável** — ele vai ser interrompido.
- Cheque o que acontece com registro inválido: pular em silêncio esconde perda.
- Ao remover coluna, confirme que ninguém lê — inclusive relatório, job noturno,
  integração externa e query manual de alguém.

## Depois

- Confirme contagens antes/depois.
- Monitore erro e latência logo após o deploy — o índice que faltou aparece aí.
- Registre no `IA.md`: o que mudou, por quê, e se a fase de *contract* ficou
  pendente. Migração parada entre expand e contract é dívida invisível.

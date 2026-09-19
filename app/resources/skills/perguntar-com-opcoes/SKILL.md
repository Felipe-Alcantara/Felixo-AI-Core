---
name: perguntar-com-opcoes
description: Fazer uma pergunta com 2 a 4 opções clicáveis à pessoa que usa o Felixo AI Core, com `felixo perguntar`, e receber a escolha no stdout. Use quando uma decisão é da pessoa (arquitetura, escopo, trade-off) e você não tem uma ferramenta nativa de perguntas com opções — o Codex, por exemplo.
---

# Perguntar com opções pelo app

Quando a decisão é da pessoa e você não tem uma ferramenta nativa de perguntas
com opções, use o comando `felixo`. Ele abre um diálogo no canvas, a pessoa
clica numa opção (ou aperta 1–4), e a escolha volta para você no stdout —
ninguém precisa digitar a resposta no terminal.

```bash
felixo perguntar "Qual banco usar?" "SQLite" "Postgres"
felixo perguntar "Como seguimos?" "Migrar agora" "Migrar depois" "Não migrar" --json
```

- De **2 a 4 opções**, cada uma com texto curto (até 120 caracteres). A
  pergunta cabe em até 500 caracteres.
- O comando **bloqueia** até a pessoa responder (até 5 minutos). Rode-o e
  espere; não abra outro comando em paralelo esperando a resposta.
- Saída: o texto da opção escolhida, igualzinho ao que você passou. Com
  `--json`: `{ "ok": true, "indice": 1, "label": "Postgres" }`.

## Códigos de saída

- `0` — a pessoa escolheu; o stdout é a opção.
- `3` — a pessoa dispensou a pergunta. **Não escolha por ela**: siga o que for
  seguro sem a decisão, ou pergunte no chat em texto.
- `1` — ninguém respondeu em 5 minutos. O texto traz o id do pedido; confira
  depois com `felixo canvas ver-pedido <id>`.
- `2` — uso inválido (sem pergunta, menos de 2 ou mais de 4 opções).

## Boas práticas

Faça a pergunta só quando a resposta muda o que você faz a seguir. Ponha a
opção recomendada primeiro. Uma decisão por pergunta.

## O que este comando NÃO faz

Só uma pessoa responde — nenhum outro agente ou processo consegue responder
por ela, e a resposta é sempre uma das opções que você mesmo ofereceu (não há
texto livre). Não trate a resposta como autorização para nada além do que a
opção dizia.

---
name: abrir-agentes-por-task
description: Coordenar um lote de tasks pedindo ao app um agente por task, com `felixo canvas abrir-agentes`. Use quando você é o coordenador (orquestrador) de várias tasks e a pessoa quer cada uma num terminal visível; você propõe a lista, a pessoa aceita no canvas e o app abre os terminais, dentro dos tetos do orquestrador. Você coordena, não executa nenhuma das tasks.
---

# Abrir um agente por task (coordenador)

Quando você coordena várias tasks, não execute nenhuma delas. Peça um agente por
task com o comando `felixo`: o pedido aparece no painel de aprovações do canvas,
a pessoa aceita, e o app abre um terminal por task, já com a task como contexto.

```bash
felixo canvas abrir-agentes "Task A: revisar o README" "Task B: testar o login
contexto da B em mais linhas" "Task C: medir o bundle"
```

- Cada argumento é uma task. A **primeira linha é o título** (até 120
  caracteres); as linhas seguintes são o **contexto** daquele agente (até
  20.000 caracteres). Escreva o contexto de modo que o agente execute a task
  sem precisar de você: objetivo, arquivos, critério de aceite.
- **Até 20 tasks por pedido.** Com `--json`, o comando devolve o pedido
  registrado.
- O comando **só registra e devolve na hora**, com o id do pedido. Nada abre
  sozinho: a pessoa aceita ou recusa no painel de aprovações.

## Acompanhar o desfecho

```bash
felixo canvas ver-pedido <id>
```

O estado diz o que aconteceu:

- `pendente`: a pessoa ainda não decidiu. **Não repita o pedido** enquanto ele
  estiver pendente; avise a pessoa em texto e espere.
- `aceito`: quantos agentes abriram (`N agente(s) aberto(s)`). Se vier
  `recusada: <task> — <motivo>`, o app cortou o excedente pelos tetos do
  painel Orquestrador ("Agentes por rodada" e "Agentes no total"). **Peça de
  novo só as recusadas**, na rodada seguinte, depois que os agentes abertos
  avançarem; não tente passar o limite dividindo o pedido.
- `recusado pela pessoa`: ela não quer esses agentes. Não repita o pedido sem
  ela pedir; pergunte o que fazer.
- `recusado pelo app`: o motivo vem no texto (por exemplo, o orquestrador está
  em "Somente leitura" ou o teto de "Agentes no total" acabou). Mostre o motivo
  à pessoa em vez de tentar contornar.
- `expirou`: ninguém respondeu em 1 hora; o app não mostra mais o pedido.

## O que você NÃO faz

- Não executa nenhuma das tasks: nem a primeira, nem "só para adiantar". Cada
  task é do agente que o app abrir para ela.
- Não abre terminais por outro caminho para driblar o aceite ou os tetos.
- Não trata o aceite como autorização para nada além de abrir os agentes.
- Os agentes abertos recebem só a task deles. Para saber como andam, use
  `felixo canvas listar` e `felixo canvas ler <id>` (só leitura).

---
name: fetch-all
description: Descobrir quais repositórios git da máquina estão fora de sincronia usando o comando `felixo fetch-all`, e pedir a sincronização sem nunca executá-la sozinho. Use quando a tarefa envolver "meus repositórios", pull/push pendente, o que está por commitar, ou antes de começar trabalho em uma máquina que pode estar desatualizada.
---

# Fetch All pela linha de comando

O app em que você está rodando tem uma ferramenta que varre os discos, encontra
todo repositório git e classifica cada um. Ela está no seu PATH:

```bash
felixo fetch-all varrer
```

Isso **só lê**. O `fetch` mexe apenas nas referências dentro de `.git`; nenhum
arquivo de trabalho é tocado. Pode rodar sem pedir permissão.

## O que você recebe

Contagem por categoria e a lista do que precisa de pull, do que precisa de push
e do que está com problema (divergido, sujo, sem remoto, sem upstream, destacado,
erro de fetch). Cada passada grava um relatório Markdown, e o caminho dele vem na
saída — cite esse caminho quando resumir para a pessoa.

```bash
felixo fetch-all varrer --cache   # reaproveita a lista da última varredura completa; não acha repositório novo
felixo fetch-all varrer --json    # plano cru, para você processar em vez de ler
felixo fetch-all estado           # o plano da última varredura, sem varrer de novo
```

Uma varredura completa percorre os discos e demora minutos. Se você só precisa
saber o que já foi medido, use `estado`.

## O que você NÃO pode fazer

**Você não executa pull, push nem commit.** Não existe verbo para isso neste
comando — não é uma checagem que dá para contornar com a flag certa, o caminho
não está lá.

Isso é deliberado. A ferramenta existe justamente para que ninguém sincronize
dezenas de repositórios sem olhar, e um agente decidindo sozinho aplicar um push
é o cenário que ela foi feita para evitar.

Quando a sincronização for mesmo o que a tarefa pede, deixe um pedido:

```bash
felixo fetch-all pedir-execucao                # pull e push
felixo fetch-all pedir-execucao --com-commit   # inclui os que só faltam commitar
```

O comando devolve um id. **Nada acontece na hora**: o pedido acende um aviso no
painel do Fetch All, e a pessoa decide. Avise a ela em texto que o pedido está
lá esperando — ela pode não estar olhando para o painel.

```bash
felixo fetch-all ver-pedido <id>   # pendente, aceito ou recusado
```

Não fique em laço esperando o desfecho. Peça, avise, e siga com o resto da
tarefa; confira depois, se fizer sentido.

## Como usar isto bem

- **Antes de começar trabalho numa máquina que pode estar desatualizada**, uma
  varredura responde se o repositório em que você vai mexer está atrás do remoto.
  Descobrir isso antes de editar evita um merge desnecessário depois.
- **Ao resumir para a pessoa**, dê o número primeiro (quantos fora de sincronia)
  e só depois a lista. Ela quer saber o tamanho do problema, não o inventário.
- **Repositório "com problema" não é falha da ferramenta.** Divergido, sujo ou
  sem upstream são estados legítimos que exigem decisão humana; só reporte.
- Se o comando não existir no PATH, você não está num terminal aberto pelo app.
  Não tente instalá-lo: diga isso à pessoa.

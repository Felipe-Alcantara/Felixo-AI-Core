---
name: capturar-contexto-da-sessao
description: Salva o contexto vivo de uma sessão de trabalho num arquivo durável antes que ele se perca — decisões, descobertas, becos sem saída, estado real e próximo passo. Use quando a sessão estiver longa, quando o limite de uso se aproximar, antes de trocar de assunto, ou quando o usuário pedir para guardar/anotar o contexto.
---

# Capturar o contexto da sessão antes que ele evapore

O que você descobriu nesta sessão vale pouco se morrer com ela. O terminal
apaga o texto de cima, o histórico não é pesquisável, e a próxima sessão começa
do zero. Esta skill transforma contexto volátil em **artefato**.

## Quando disparar (sem esperar o usuário pedir)

- A sessão passou de algumas horas ou de muitas trocas.
- Você acabou de descobrir algo que custou caro descobrir.
- Está prestes a trocar de assunto, de repositório ou de agente.
- O uso está perto do limite.
- Você tomou uma decisão que outra pessoa vai questionar depois.

## Onde salvar (nesta ordem de preferência)

1. **Bloco de arquivo do canvas** já ligado a este terminal, se existir — é o
   scratchpad vivo compartilhado entre agentes, e é onde outro agente vai olhar.
2. **`IA.md` do projeto**, quando o que você descobriu é decisão de arquitetura
   ou comportamento do sistema (veja a skill `memoria-viva-ia-md`).
3. Um arquivo novo em `docs/` ou no diretório de notas, com data no nome.

Nunca só no chat. Chat não é armazenamento.

## O que registrar — nesta ordem

### 1. Estado atual, em uma frase
Onde o trabalho parou. "Backend responde e falta ligar a identidade às telas de
`/app/`" é estado. "Está quase pronto" não é.

### 2. O que foi decidido e por quê
Cada decisão com o motivo e a alternativa descartada. Sem o porquê, a decisão
vira dogma e alguém a reverte por engano daqui a um mês.

### 3. O que foi descoberto (e não estava escrito em lugar nenhum)
- Comportamento real de uma API que contradiz a documentação.
- Número medido (tamanho, custo, duração, contagem).
- Onde mora a causa de um bug, com arquivo e função.
- Uma armadilha: algo que parece óbvio e está errado.

Toda vez que você se surpreendeu durante a sessão, há um item para esta seção.

### 4. Becos sem saída
Os caminhos tentados e abandonados, com o motivo. **Esta é a seção que mais
economiza tempo** — sem ela, o próximo agente refaz suas tentativas fracassadas
uma a uma.

### 5. O que ficou em aberto
Separe explicitamente:
- **Falta fazer** — trabalho conhecido, só não foi feito.
- **Falta decidir** — depende de alguém, e de quem.
- **Não verificado** — você assumiu e não confirmou. Incerteza declarada é
  informação; incerteza escondida vira bug.

### 6. Próximo passo concreto
Um só, acionável, com o comando ou o arquivo por onde começar.

## Regras de escrita

- **Fato medido vence adjetivo.** Trocou "grande", "lento" ou "bagunçado" por
  número? Bom. Não trocou? Meça.
- **Caminhos e links completos**, copiáveis.
- **Escreva para quem não viu a conversa.** Zero contexto implícito, nenhum
  "como conversamos", nenhum "aquele arquivo".
- **Acrescente, não reescreva.** Em arquivo vivo, entrada nova datada; o
  histórico anterior fica.
- **Nunca encerre marcando o trabalho como "em andamento".** Feche com estado
  final claro: concluído, bloqueado, aguardando decisão, ou interrompido com o
  motivo.

## Modelo pronto

```markdown
## [AAAA-MM-DD] <assunto da sessão>

**Estado:** <uma frase>

**Decidido:**
- <decisão> — porque <motivo>; descartado <alternativa> porque <motivo>.

**Descoberto:**
- <fato com arquivo/linha/número/comando>

**Becos sem saída:**
- <tentativa> — não funcionou porque <motivo>. Não repita.

**Em aberto:**
- Falta fazer: <...>
- Falta decidir: <...> (quem decide: <...>)
- Não verificado: <...>

**Próximo passo:** <ação concreta + comando/arquivo>
```

Ao terminar, diga ao usuário **onde** você salvou e o que ficou registrado.

---
name: postmortem-de-incidente
description: Conduzir a análise depois de uma falha — linha do tempo, causa sistêmica, e ações que impedem a repetição — sem procurar culpado. Use após bug em produção, perda de dado, indisponibilidade, ou qualquer erro que custou caro.
---

# Postmortem sem culpado

O objetivo não é descobrir quem errou: é descobrir **por que o sistema permitiu
que o erro chegasse até aqui**. Postmortem que termina em nome de pessoa não
muda nada — a próxima pessoa erra igual.

## Etapa 1 — Estabilize antes de analisar

Primeiro pare o sangramento (reverter, desligar a feature, restaurar). Só
depois investigue. Análise durante o incêndio atrasa a resposta e produz
conclusão ruim.

Enquanto estabiliza, **preserve evidência**: logs, estado do banco, versão
implantada, horários. Muita evidência some com o rollback.

## Etapa 2 — Linha do tempo factual

Com horários e fonte de cada item:

```
HH:MM  <o que aconteceu>            (fonte: log/deploy/mensagem/monitor)
```

Cubra: quando começou de verdade (quase sempre antes do que se percebeu),
quando alguém notou, como notou, o que foi tentado, o que resolveu.

A distância entre **começou** e **alguém notou** costuma ser o achado mais
importante do postmortem inteiro.

## Etapa 3 — Impacto medido

- Quem foi afetado, quantos, por quanto tempo.
- O que se perdeu (dado, dinheiro, confiança) e o que foi recuperado.
- O que **não** aconteceu por sorte — quase-acidente conta, e é de graça.

## Etapa 4 — Causa, em camadas

Não pare na primeira. Para cada resposta, pergunte "e por que isso foi
possível?":

- **Gatilho** — o que disparou agora (deploy, pico, dado estranho).
- **Falha técnica** — o que quebrou no código/infra.
- **Falha de detecção** — por que o monitor não avisou antes.
- **Falha de barreira** — que revisão, teste ou validação deveria ter pego e
  não pegou, e **por quê**.

A causa útil quase nunca é "fulano esqueceu". É "nada impedia esquecer".

## Etapa 5 — Ações que realmente impedem a repetição

Ordene por robustez:

1. **Tornar o erro impossível** — restrição no banco, tipo, API que não aceita
   o estado inválido.
2. **Tornar o erro detectável na hora** — teste, validação, gate no CI.
3. **Tornar o erro visível rápido** — alerta, log, monitor.
4. **Tornar a recuperação rápida** — rollback fácil, backup testado.
5. **Documentar / treinar** — o mais fraco. Se a única ação for "avisar o time",
   o postmortem falhou.

Cada ação com **dono e prazo**. Ação sem dono não acontece.

## Etapa 6 — Registre onde será encontrado

`IA.md` do projeto, com data: o que aconteceu, a causa em camadas, e o que
mudou por causa disso. Um postmortem que ninguém acha daqui a seis meses é
trabalho perdido.

## Tom

Escreva de forma que a pessoa que cometeu o erro possa ler sem se sentir
atacada — inclusive porque frequentemente é você. Postmortem punitivo produz
gente escondendo incidente, e incidente escondido é o mais caro de todos.

---
name: memoria-viva-ia-md
description: Manter o IA.md de um projeto como linha do tempo confiável — o que foi decidido, quando, por quê e com qual validação — em vez de um resumo reescrito que perde o histórico. Use ao terminar qualquer mudança relevante de arquitetura, comportamento ou processo, e ao criar o IA.md de um projeto que ainda não tem.
---

# IA.md como memória viva do projeto

O `IA.md` existe para que outra IA (ou outro mantenedor) retome o trabalho sem
reler todo o código nem o histórico de conversa. Ele falha de dois jeitos:
ficando vazio, e sendo reescrito a cada sessão até virar um resumo sem passado.

## A regra que sustenta tudo: append-only

Registros datados **não são apagados nem reescritos**. Mudou uma decisão? Entra
uma **entrada nova, datada**, explicando o que mudou e por quê. A entrada antiga
continua lá — ela é o motivo pelo qual alguém não vai refazer o caminho velho.

A única seção reescrevível é o **Estado atual (resumo vivo)**, que serve à
retomada rápida.

## Estrutura

```markdown
# 🤖 IA.md — Contexto operacional do <projeto>

## 📊 ESTADO ATUAL (RESUMO VIVO)
Última atualização: [AAAA-MM-DD]
- Fase: <onde o projeto está>
- Em andamento: <o que está aberto agora>
- Próximo passo sugerido: <um, concreto>
- Risco aberto: <ou "nenhum conhecido">

## 🎯 OBJETIVO DO PROJETO
## 🏁 METAS & MILESTONES
## 🛠️ STACK & DEPENDÊNCIAS
## 📐 DECISÕES DE ARQUITETURA
## 🐛 BUGS E CORREÇÕES RELEVANTES
## ✅ VALIDAÇÕES E TESTES
```

## O que merece uma entrada

- Decisão de arquitetura, e a alternativa descartada.
- Bug cuja **causa** foi não óbvia — registre a causa, não só a correção.
- Comportamento de API/biblioteca que contradiz a documentação, **com a
  evidência** (o experimento que provou).
- Número medido que vai embasar decisão futura (custo, duração, tamanho).
- Convenção nova que o projeto passa a seguir.
- Validação feita de verdade: o comando rodado e a saída observada.

## O que **não** merece entrada

- Mudança cosmética.
- Repetição do que o `git log` já conta.
- Intenção sem execução ("vamos avaliar X depois").

## Como escrever uma entrada

```markdown
## [AAAA-MM-DD] <título curto do que mudou>

**Contexto.** O que motivou — o problema real, não a tarefa.

**O que foi feito.** A mudança, com arquivos e nomes.

**Por quê / alternativas.** Por que assim, e o que foi descartado.

**Evidência.** O experimento, o número, a saída do comando. Se você afirmou
que algo se comporta de certo jeito, mostre como sabe.

**Validação.** Comando rodado + resultado. "329 testes verdes, ruff limpo."
```

## Anti-alucinação

Uma afirmação no `IA.md` vira verdade para todo agente futuro. Por isso:

- **Só afirme o que você executou e observou.** "Deve funcionar" não entra.
- **Distinga medido de suposto.** Se você não testou no Windows, escreva que
  não testou no Windows.
- **Se uma hipótese caiu**, registre a queda. Um `IA.md` que só guarda acertos
  ensina menos que um que guarda o erro e a correção.

## Compactação sem perda

Quando o arquivo crescer demais, mova registros antigos para
`docs/ia-archive/` — **mova, nunca apague** — e deixe no `IA.md` um ponteiro
para o arquivo movido.

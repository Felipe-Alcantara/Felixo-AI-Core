---
name: retomar-contexto
description: Entrar em um trabalho já começado (por você, por outra pessoa ou por outro agente) e ficar produtivo rápido, sem refazer investigação e sem confiar cegamente no que está escrito. Use ao abrir um repositório novo com histórico, ao receber um scratchpad/handoff, ou quando o usuário disser "continue de onde parou".
---

# Retomar um trabalho já começado

O erro dos dois extremos: ou você ignora o que já foi escrito e refaz tudo, ou
acredita em tudo e propaga informação velha. O caminho é **ler primeiro,
verificar o que importa, e declarar o que não conferiu**.

## Etapa 1 — Leia, na ordem, o que existir

1. **Scratchpad / arquivo compartilhado do canvas** ligado a este terminal — é
   o mais recente e o mais específico.
2. **`IA.md`** do projeto — memória operacional: decisões datadas, estado atual,
   riscos. Comece pelo "Estado atual", depois leia as entradas datadas **de trás
   para frente** até entender como se chegou aqui.
3. **`AGENTS.md` / `CLAUDE.md`** — as regras de trabalho deste repositório. Elas
   valem mais que suas preferências.
4. **README** — o que o projeto é, para quem, como roda.
5. **`git log --oneline -30`** e o diff dos commits recentes — o que o texto diz
   e o que o código diz podem divergir; o código é a verdade.

## Etapa 2 — Reconcilie documento com realidade

Documentação envelhece calada. Antes de agir, confira os pontos que mudariam
sua decisão:

- O "estado atual" descrito ainda bate com o código?
- O "próximo passo" registrado já foi feito por alguém?
- Os arquivos citados ainda existem, com os mesmos nomes?
- O gate (lint, testes, build) passa **agora**? Rode antes de mexer — assim
  você sabe se quebrou algo ou se já estava quebrado.

Quando achar divergência, **registre-a** em vez de corrigir em silêncio: ela é
informação sobre o projeto, não só um detalhe seu.

## Etapa 3 — Reconstitua o raciocínio, não só os fatos

Procure ativamente por:
- **Decisões com motivo** — respeite-as. Reverter uma decisão sem entender o
  porquê é como refatorar sem teste.
- **Becos sem saída registrados** — não repita a tentativa que já falhou.
- **Convenções locais** — nomes, camadas, idioma do código, estilo de commit.
  Escreva como o repositório escreve, não como você escreveria.

## Etapa 4 — Diga o que você entendeu, antes de agir

Devolva ao usuário um resumo curto:

```
Estado que encontrei: <...>
Divergências entre doc e código: <...> (ou "nenhuma")
Vou continuar por: <próximo passo> — porque <motivo>
Não verifiquei: <...>
```

Isso custa trinta segundos e evita horas gastas na direção errada. Se o
resumo estiver errado, o usuário corrige agora — não depois do commit.

## Etapa 5 — Trabalhe sem apagar o passado

- Não reescreva histórico datado; acrescente.
- Não apague trabalho de outro agente para "limpar".
- Em ambiente multiagente, verifique se outra sessão está no mesmo arquivo
  antes de reescrevê-lo.
- Ao terminar, atualize o mesmo lugar de onde você tirou o contexto — quem vem
  depois vai procurar lá (veja `capturar-contexto-da-sessao`).

## Se não houver contexto escrito nenhum

Diga isso explicitamente e comece criando um. Um repositório sem `IA.md` e sem
scratchpad é um repositório onde toda sessão recomeça do zero — e essa é a
primeira coisa a consertar.

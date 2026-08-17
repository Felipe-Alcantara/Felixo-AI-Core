---
name: briefing-de-atualizacao
description: Responder "me atualiza sobre X" com um briefing baseado em evidência — o que mudou, o que está travado, o que exige decisão — cruzando código, git, documentação e notas. Use quando o usuário pedir status, panorama, "como está o projeto", ou preparar-se para uma reunião/relatório.
---

# Briefing de atualização

"Me atualiza sobre o projeto" costuma render um resumo do README. Isso não é
atualização — é apresentação. Atualização responde: **o que mudou desde a
última vez, e o que exige a minha atenção agora?**

## Etapa 1 — Estabeleça o marco temporal

Pergunte-se (ou ao usuário): atualizar **desde quando**? Última conversa,
última semana, último release. Sem marco, o briefing vira resumo genérico.

Fontes, na ordem:
- `git log --since="<data>" --oneline` e o diff do que importa.
- Entradas do `IA.md` depois daquela data.
- Scratchpad do canvas / notas da sessão.
- Issues, PRs e tarefas do Notion relacionadas.

## Etapa 2 — Meça, não impressione

Números que fazem um briefing valer:
- Commits no período, e por quem.
- Testes: quantos, passando ou não. **Rode o gate**, não confie no último
  registro.
- O que está no ar e responde (verifique a URL, não presuma).
- Tamanho/custo quando for relevante à decisão.

## Etapa 3 — Separe em quatro baldes

1. **Pronto e verificado** — funciona, e você confirmou como.
2. **Feito mas não validado** — existe código, ninguém provou. Diga isso.
3. **Travado** — e **por quem/pelo quê**. Bloqueio sem dono não sai do lugar.
4. **Precisa de decisão** — a decisão em si, as opções e a consequência de cada
   uma. Esta é a seção que transforma briefing em reunião útil.

## Etapa 4 — Diga o que piorou

Briefing que só traz avanço é propaganda. Inclua:
- O que regrediu ou quebrou.
- O que está parado há tempo demais (com a data do último commit).
- Documentação que ficou mentindo.
- Dívida que passou de incômodo a risco.

## Etapa 5 — Ajuste ao leitor

O mesmo fato muda de forma conforme quem lê:
- **Quem executa** quer arquivo, comando, próximo passo.
- **Quem lidera o produto** quer estágio, risco e o que depende dele.
- **Quem investe** quer valor, custo, tração e risco — com número medido.

Se houver mais de uma versão do briefing (idiomas, públicos), derive todas de
**uma fonte única de fatos**. Versões que divergem em números destroem a
confiança nas duas.

## Formato de saída

```
DESDE <marco>

Pronto e verificado
- <item> (como verifiquei: <comando/URL>)

Feito, não validado
- <item> — falta <validação>

Travado
- <item> — bloqueado por <quem/o quê> desde <data>

Precisa de decisão
- <decisão> — opções: A) <...> B) <...>; consequência: <...>

Piorou / atenção
- <item>

Não verifiquei
- <item>
```

Termine com **o próximo passo mais valioso**, um só.

---
name: refatorar-com-rede-de-seguranca
description: Refatorar código sem mudar comportamento — caracterizar o que existe com testes antes de mexer, mover em passos reversíveis e provar equivalência. Use ao modularizar arquivo grande, extrair camada, renomear conceito ou limpar dívida técnica.
---

# Refatorar sem quebrar

Refatoração é mudar a **forma** preservando o **comportamento**. Se o
comportamento muda, não é refatoração — é reescrita, e ela precisa de outro
combinado com o usuário.

## Etapa 0 — A rede de segurança vem antes

Não existe refatoração segura sem forma de detectar quebra.

1. **Rode o gate atual** (lint + testes + build) e anote o resultado. Se já
   estava vermelho, resolva isso ou registre — senão você não distingue o seu
   estrago do que já existia.
2. **Se não houver teste na área**, escreva **testes de caracterização**: eles
   não julgam se o comportamento está certo, apenas **fixam o que ele é hoje**.
   Rode o código, capture a saída real, transforme em asserção. É a única forma
   honesta de refatorar código legado.
3. Se a área for impossível de testar sem refatorar antes, faça a **menor**
   mudança que a torne testável, isolada e commitada sozinha.

## Etapa 1 — Entenda antes de mover

- Quem chama o quê? Mapeie as fronteiras reais, não as pretendidas.
- Que estado é compartilhado? Estado global é o que transforma "separar
  arquivos" em modularização de fachada.
- Que contratos são públicos (API, props, eventos, formato de retorno)? Eles
  são **preservados por padrão**.

## Etapa 2 — Passos pequenos e reversíveis

Um passo = uma transformação com nome, com o gate verde no fim, commitável
sozinho:

- Extrair função / extrair módulo.
- Mover função para o módulo certo.
- Renomear para o nome que o domínio usa.
- Inverter dependência (a camada de baixo deixa de conhecer a de cima).
- Substituir condicional espalhada por despacho único.

**Nunca misture refatoração com mudança de comportamento no mesmo commit.** Se
você achar um bug no meio, ou anote para depois, ou corrija em commit separado
e explícito.

## Etapa 3 — Modularização real, não cosmética

Sinais de que a divisão foi só aparência:
- Arquivos separados, estado global compartilhado.
- Um arquivo de 8 mil linhas virou dois de 4 mil.
- Funções movidas sem fronteira de responsabilidade.
- Módulo cujo nome não descreve uma responsabilidade nomeável.
- CSS/JS ainda inline no HTML.

O teste honesto: **você consegue descrever a responsabilidade de cada módulo em
uma frase, sem usar "e"?**

## Etapa 4 — Prove a equivalência

- Gate verde antes e depois.
- Testes de caracterização passando **sem alteração**. Se você precisou mudar a
  asserção, o comportamento mudou — pare e decida conscientemente.
- Em transformação grande, compare saídas reais lado a lado (mesma entrada,
  antes e depois), não só o resultado dos testes.

## Etapa 5 — Deixe rastro

- Commit por passo, com mensagem que diz **o que foi movido e por quê**.
- `IA.md`: registre a decisão de arquitetura e o que foi descartado.
- Se o arquivo mudou de nome, diga o nome antigo na mensagem — quem procurar
  pelo antigo precisa achar.

## Quando NÃO refatorar

- Sem teste e sem tempo de escrever caracterização.
- Véspera de entrega, na área que a entrega usa.
- Só porque "está feio". Feio e estável perde para bonito e quebrado.
- Em código que será apagado em breve.

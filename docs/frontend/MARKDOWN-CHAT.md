# Markdown no Chat

Status: concluido.

## Objetivo

Renderizar respostas do assistente com Markdown basico para melhorar leitura de topicos, titulos, comandos e codigo.

## Escopo implementado

O componente `MarkdownContent` suporta:

- titulos `#`, `##` e `###`;
- listas com `-`, `*` e `1.`;
- codigo inline com crases;
- negrito simples com `**texto**`;
- blocos fenced com ```` ``` ```` e linguagem opcional, incluindo `bash`;
- paragrafos com quebra de linha preservada.

## Comportamento

- Mensagens do usuario continuam em texto simples com quebras preservadas.
- Mensagens do assistente passam pelo `MarkdownContent`.
- Blocos de codigo usam fonte monospace, rolagem interna e cabecalho com a linguagem declarada.
- O cursor de streaming continua aparecendo enquanto a resposta esta ativa.

## Arquivos

- `app/src/features/chat/components/MarkdownContent.tsx`
- `app/src/features/chat/components/ChatThread.tsx`

## Limites

Este recorte evita dependencia externa de Markdown. O parser e propositalmente pequeno e cobre a formatacao esperada das respostas do app, nao o Markdown completo do GitHub.

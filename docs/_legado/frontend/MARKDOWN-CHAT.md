# Markdown no Chat

Status: concluido.

## Objetivo

Renderizar respostas do assistente com Markdown basico para melhorar leitura de topicos, titulos, comandos e codigo.

## Escopo implementado

O componente `MarkdownContent` usa `react-markdown` com `remark-gfm` e `rehype-raw`, e suporta:

- titulos `#` a `######`;
- listas com `-`, `*`, `1.` e listas de tarefas;
- codigo inline com crases;
- negrito, italico e riscado;
- citacoes, links, divisorias e tabelas GFM;
- blocos fenced com ```` ``` ```` e linguagem opcional, incluindo `bash`, com destaque de sintaxe para linguagens comuns;
- HTML simples embutido, como `<br>` e `<span style="color:red">`;
- fallback textual para imagens que nao carregam;
- paragrafos com quebra de linha preservada.

## Comportamento

- Mensagens do usuario continuam em texto simples com quebras preservadas.
- Mensagens do assistente passam pelo `MarkdownContent`.
- Blocos de codigo usam fonte monospace, rolagem interna e cabecalho com a linguagem declarada.
- Blocos declarados como `markdown`/`md` sao normalizados para evitar que respostas validas aparecam como codigo cru.
- Imagens com URL ausente ou quebrada mostram o texto alternativo sem icone de imagem quebrada.
- O cursor de streaming continua aparecendo enquanto a resposta esta ativa.

## Arquivos

- `app/src/features/chat/components/MarkdownContent.tsx`
- `app/src/features/chat/components/ChatThread.tsx`
- `app/src/index.css`
- `app/package.json`
- `app/package-lock.json`

## Limites

HTML bruto e renderizado para cobrir exemplos simples no chat. Conteudo complexo ou interativo ainda deve ser enviado como bloco de codigo fenced.

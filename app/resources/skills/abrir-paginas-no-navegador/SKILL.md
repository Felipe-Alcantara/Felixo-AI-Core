---
name: abrir-paginas-no-navegador
description: Abrir uma URL http(s) a pedido do agente usando o app Felixo AI Core. Use quando precisar mostrar uma página no navegador do sistema ou criar um bloco Webpage embutido no canvas.
---

# Abrir páginas no navegador pelo app

O terminal do canvas não tem acesso direto ao processo principal do Electron.
Use o comando `felixo`: ele deixa uma intenção JSON na mesma fila local que o
Fetch All já usa, e o app atende essa intenção.

## Navegador externo

```bash
felixo browser open https://example.com
```

## Página embutida no canvas

```bash
felixo browser open https://example.com --embedded
```

O equivalente em português é `felixo navegador abrir ... --embutido`. O app
cria um bloco Webpage no canvas, posiciona-o numa área livre e persiste a URL.

O comando aceita somente URLs `http://` e `https://`. Não tente passar
`file:`, `javascript:`, `data:` ou um comando de shell: eles são recusados na
fronteira do pedido.

## Acompanhar

O comando imprime um id. Consulte o resultado se precisar confirmar que o app
já consumiu a intenção:

```bash
felixo browser status <id>
felixo browser status <id> --json
```

Não crie outro servidor, socket ou mecanismo de IPC para abrir páginas. A
integração deve continuar usando a fila `userData/agent-requests`, compartilhada
com o Fetch All.

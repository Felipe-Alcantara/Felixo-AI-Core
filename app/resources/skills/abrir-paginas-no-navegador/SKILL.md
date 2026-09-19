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

### Perfil do navegador interno

Cada bloco Webpage pertence a um **perfil** do navegador interno, e perfis
diferentes têm logins (cookies, sessões) separados — por exemplo "Trabalho" e
"Pessoal". Sem perfil, o bloco abre no **Padrão**, que é o que já existia.

```bash
felixo browser open https://example.com --embedded --profile=Trabalho
```

- Escreva `--profile=Nome` colado, sem espaço (`--profile="Conta Pessoal"`
  quando o nome tem espaço). O equivalente em português é `--perfil=Nome`.
- Só vale junto de `--embedded`; no navegador do sistema o comando recusa.
- O perfil **precisa existir** (quem cria é a pessoa, no cabeçalho do bloco).
  Um perfil inexistente falha — o comando não cai no Padrão, porque isso
  abriria a página numa sessão logada que você não escolheu.
- `felixo browser status <id>` diz se o pedido falhou por perfil inexistente.

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

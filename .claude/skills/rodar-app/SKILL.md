---
name: rodar-app
description: Abre e dirige o Felixo AI Core em segundo plano com o CLI genérico `felixo devtools`, com perfil isolado e janela invisível por padrão.
---

# Rodar o app sem interromper a área de trabalho

Use o CLI genérico a partir de `app/`. Ele mantém uma única sessão Electron destacada, com DevTools remoto restrito ao processo local e `userData` temporário. Nenhum REPL, tmux ou janela visível é necessário.

```bash
cd app
felixo devtools launch
felixo devtools status
felixo devtools screenshot --out ../tmp/felixo.png
felixo devtools buttons
felixo devtools quit
```

## Comandos

| Comando | Uso |
| --- | --- |
| `launch [--visible] [--port N]` | Inicia a sessão isolada. `--visible` é opt-in para depuração humana. |
| `status` / `quit` | Mostra ou encerra a sessão e limpa o perfil temporário. |
| `screenshot [--out arquivo]` | Salva captura PNG da janela Electron, inclusive quando invisível. |
| `buttons` / `windows` / `text [seletor]` | Inspeciona a interface. |
| `click <seletor>` / `click-text <texto>` | Aciona controles pelo DOM. |
| `type <texto>` / `press <tecla>` | Envia teclado pelo CDP. |
| `eval <expressão>` | Avalia JavaScript no renderer. |
| `main <expressão>` | Avalia uma expressão curta no processo principal, no contexto limitado de desenvolvimento. |

Execute `felixo devtools --help` para a referência da sintaxe. Mantenha a sessão aberta entre comandos; cada comando se conecta por CDP, executa uma ação e se desconecta.

## Segurança do perfil

O padrão é sempre isolado. `felixo devtools launch --real-profile` só deve ser usado com consentimento explícito, para validar dados reais, e é recusado se os arquivos `Singleton*` indicarem outra instância usando o perfil. O comando `quit` nunca remove um perfil real.

## Limites conhecidos

`type` e `press` são eventos sintéticos do CDP: não validam atalhos que dependem do teclado ou clipboard do sistema operacional. Para esse caso excepcional, use a bancada legada desta pasta com Xvfb, `driver.mjs` e `d.sh`; ela continua sendo a referência para clipboard físico no Linux.

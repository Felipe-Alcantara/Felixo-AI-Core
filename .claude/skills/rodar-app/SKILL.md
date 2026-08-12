---
name: rodar-app
description: Abre o app Electron do Felixo AI Core e interage com ele de verdade (screenshot, clique, abrir agente no canvas, digitar no terminal, colar imagem/texto). Use quando pedirem para rodar, abrir, iniciar ou tirar screenshot do app, ou para conferir que uma mudanca funciona no app rodando e nao so nos testes.
---

O Felixo AI Core e um app Electron. Sem uma pessoa na frente da tela, ele se
dirige pelo REPL Playwright em `.claude/skills/rodar-app/driver.mjs`, rodando
sob xvfb: cada comando e uma linha de texto, e `d.sh` manda a linha e devolve a
resposta.

Caminhos abaixo sao relativos a raiz do repositorio.

## Preparo

O driver precisa do `playwright-core`, que **nao** e dependencia do projeto —
ele serve so para dirigir o app, e nao vale pesar o `package.json` de quem so
quer usar o Felixo. Instale sem gravar no manifesto:

```bash
cd app && npm install --no-save playwright-core
```

Um `npm ci` depois disso apaga a instalacao; e so repetir o comando.

Em Linux sem servidor grafico, tambem sao necessarios o xvfb e as bibliotecas do
Chromium:

```bash
sudo apt-get install -y xvfb libnss3 libgbm1 libgtk-3-0 libasound2t64
```

## Build

O driver abre a build de producao (`app/dist/`), nao o servidor do Vite:

```bash
cd app && npm run build
```

Refaça a build sempre que mexer no renderer — o driver **nao** recarrega
sozinho. Mudanca em `app/electron/` so precisa relançar o app (`quit`, `launch`).

## Rodar

```bash
cd .claude/skills/rodar-app
tmux new-session -d -s felixo -x 220 -y 50
tmux send-keys -t felixo "cd $PWD && xvfb-run -a --server-args='-screen 0 1600x1000x24' node driver.mjs" Enter
sleep 3
./d.sh launch
./d.sh ss inicio
```

Depois **abra o PNG** em `/tmp/shots/` (mude com `SCREENSHOT_DIR`). Tela preta
ou vazia e falha de abertura, nao "deu certo".

Ao terminar: `./d.sh quit`, `tmux kill-session -t felixo` e
`rm -rf /tmp/felixo-test-userdata`.

## Comandos

| comando | o que faz |
|---|---|
| `launch` | abre o app com userData isolado |
| `ss [nome]` | screenshot em `/tmp/shots/<nome>.png` |
| `buttons` | lista os botoes com indice e rotulo |
| `click-text <txt>` | clica por texto visivel ou `aria-label` |
| `click <sel>` | clica por seletor CSS |
| `expand` | abre a gaveta do primeiro terminal — **necessario antes de mexer no xterm** |
| `focus-terminal` | poe o foco na entrada do terminal |
| `type <txt>` / `press <tecla>` | teclado sintético (CDP) |
| `realkey <combo>` | **tecla de verdade** pelo X (`realkey ctrl+v`) — precisa de `xdotool` |
| `paste image [cor]` | dispara paste com imagem no evento |
| `paste text <txt>` | dispara paste de texto |
| `paste empty` | dispara paste sem nada (o caso do Linux Mint) |
| `clipboard-image <cor>` | poe um PNG no clipboard **do SO** (red/green/blue) |
| `clipboard-file <caminho>` | simula copiar um arquivo no gerenciador do GNOME |
| `clipboard-clear` | esvazia o clipboard do SO |
| `eval <js>` | avalia no renderer |
| `main <js>` | avalia no processo principal; recebe o modulo `electron` |
| `text [sel]` | imprime `innerText` |
| `windows` | lista as janelas |
| `quit` | fecha o app |

## Um agente no canvas

O canvas comeca vazio (userData isolado). Para chegar a um terminal de verdade:

```bash
./d.sh "click-text Agente"   # abre um agente com a ultima configuracao
sleep 8                      # a CLI leva alguns segundos para subir
./d.sh expand                # so aqui o .xterm passa a existir
./d.sh focus-terminal
```

Isso abre a CLI configurada de verdade (Claude Code, Codex, …) e consome a conta
de quem estiver na maquina. Para conferir interface, prefira `ss`; so envie
prompt quando o teste for justamente a resposta do agente.

O prompt inicial de contexto fica **digitado sem Enter** na entrada. Para limpar
antes de um teste: `focus-terminal` e `press Control+u` (algumas vezes).

## Conferir o paste de imagem

Os quatro caminhos de `terminal-image-paste.ts` / `clipboard-image.cjs`:

```bash
# Evento sintetico: cobre o tratamento do evento, NAO o atalho do teclado.
./d.sh "paste image red"          # defaultPrevented: true  → interceptador pegou
./d.sh "paste text ola mundo"     # defaultPrevented: false → xterm colou o texto
./d.sh "clipboard-file /tmp/x.png"
./d.sh "paste empty"              # arquivo copiado no gerenciador

# Atalho de verdade: e isto que prova que colar funciona para quem usa o app.
./d.sh "clipboard-image blue"
./d.sh focus-terminal
./d.sh "realkey ctrl+v"           # Ctrl+V nao gera evento `paste` com imagem
./d.sh "realkey ctrl+shift+v"     # este gera; os dois devem salvar UM arquivo
```

Confira o resultado em `/tmp/felixo-test-userdata/clipboard-attachments/` (o
arquivo salvo) e num `ss` (o caminho digitado na entrada da CLI). Cores
diferentes por caminho provam qual rota entregou a imagem.

## Detalhes que custaram tempo

- **`press` e `paste` nao sao teclas de verdade.** Eles entram pelo CDP e nunca
  viram evento do sistema, entao nao acionam acelerador de menu do Electron nem
  o caminho nativo do Chromium. Isso ja escondeu um bug inteiro: `paste image`
  passava e o `Ctrl+V` do app nao colava nada, porque com imagem na area de
  transferencia o comando de colar do Chromium e um no-op e **nenhum evento
  `paste` nasce**. Para qualquer atalho que dependa do sistema, use `realkey`.
- **`realkey` exige o foco no elemento.** Rode `focus-terminal` antes; e nao
  chame `xdotool windowfocus` depois, que devolve o foco a janela e tira do
  elemento — a tecla chega e nao faz nada, parecendo bug do app.
- **O `.xterm` nao existe ate a gaveta abrir.** O card recolhido mostra so um
  preview em texto; o elemento so e montado no `attach` do
  `TerminalSessionStore`. `document.querySelector(".xterm")` retorna `null` e
  parece bug do app. Rode `expand` antes.
- **userData isolado nao e opcional.** Sem `--user-data-dir`, o app de teste
  abre em cima do canvas real (`~/.config/felixo-ai-core`) e mexe nos agentes e
  configuracoes de quem usa a maquina. O driver ja passa a flag.
- **Clique pelo DOM, nao por coordenada.** O canvas aplica zoom e pan nos
  blocos, entao a coordenada que o Playwright calcula erra o alvo. `click` e
  `click-text` usam `el.click()`.
- **`main` nao tem `require`.** O `app.evaluate` do Playwright roda num contexto
  sem modulos; use o argumento (`(e) => e.clipboard...`). `Buffer` existe.
- **O driver abre `app/dist/`.** Mudanca no renderer sem `npm run build` nao
  aparece, e a tela mostra a versao antiga sem nenhum erro.
- **Espere depois de `launch` e de `click-text Agente`.** O canvas monta em
  etapas e a CLI leva segundos para desenhar o REPL; nao ha sinal de "pronto".

## Problemas

- **`sessao tmux 'felixo' nao existe`** — o `d.sh` fala com o tmux; inicie a
  sessao como na secao "Rodar".
- **Timeout no `launch`** — falta `app/dist/` (`npm run build`) ou falta
  `playwright-core` (veja "Preparo").
- **`Missing X server`** — esqueceu o `xvfb-run`.
- **Xvfb travado** — `pkill Xvfb; rm -f /tmp/.X*-lock`.

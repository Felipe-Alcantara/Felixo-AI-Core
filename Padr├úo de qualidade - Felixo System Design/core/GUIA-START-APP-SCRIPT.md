# GUIA-START-APP-SCRIPT — MENU DE ENTRADA PADRAO (OBRIGATORIO)

> **O que e**: Um contrato obrigatorio que define que **todo programa** do `Felixo System Design` — web, CLI, automacao, script, desktop, bot, o que for — deve trazer um **`start_app.py` na raiz** que abre um **menu interativo, colorido e descritivo**. Esse menu e a **porta de entrada unica** do programa para qualquer pessoa: por ele a pessoa instala, configura, inicia e deixa tudo pronto para usar.
>
> **Por que e obrigatorio**: O `start_app.py` e a interface entre o programa e quem vai usar. Nem todo mundo tem facilidade com terminal, ninguem deveria precisar decorar comandos, e cada projeto que reinventa o "como rodar" gera atrito. Um menu de entrada padronizado torna **qualquer** programa imediatamente utilizavel: a pessoa roda `python start_app.py`, le opcoes claras e escolhe.
>
> **Quando aplicar**: Sempre. Todo programa rodavel do repositorio precisa do seu `start_app.py`. Nao importa se e um site, um CLI, uma automacao agendada ou um scraper — todos passam pela mesma porta de entrada.

---

## 1. Regra central

> **Todo programa e obrigado a ter um `start_app.py` na raiz que abre um menu interativo, colorido e descritivo — a porta de entrada unica por onde a pessoa instala, configura, inicia e deixa o programa pronto para usar.**

O objetivo e que qualquer pessoa — mesmo sem experiencia com terminal — rode **um comando**:

```bash
python start_app.py
```

…e a partir dai navegue por um **menu**, sem precisar saber nada do programa de antemao. O menu apresenta, descreve e executa as acoes. A pessoa **escolhe** o que quer ativar/rodar.

### O menu nao bloqueia nada

O menu e a porta de entrada, nao um portao trancado. Ele **lista** o que da pra fazer e deixa a pessoa **escolher** — instalar, configurar, iniciar este ou aquele componente, ver status. Nenhuma acao e pre-condicao obrigatoria de outra a ponto de travar o fluxo: se algo ainda nao esta pronto (ex: dependencias faltando), o menu avisa de forma clara e oferece a opcao de resolver, mas quem decide e a pessoa.

### Sempre menu interativo — nada de flags

**Nao use flags de linha de comando** (`--start`, `--no-browser`, `restart`, etc.) como interface principal. A interface e **sempre o menu interativo** no terminal. Quem usa nao precisa decorar argumento nenhum: roda `python start_app.py`, le as opcoes e escolhe. Toda acao que o programa oferece deve estar **acessivel pelo menu**.

---

## 2. Como o menu deve ser

A regra mais importante de aparencia: **fuja do terminal cru "digite a letra" em branco no fundo preto.** O menu deve ser **interativo, colorido e bem descritivo**.

- **Interativo** — navegacao por setas/numero com selecao clara do item atual, nao um texto solto pedindo "digite 1, 2 ou 3".
- **Colorido** — use cor para hierarquia: titulo, opcao em foco, estado (ok/erro/pendente), dicas. Cor com proposito, nao enfeite.
- **Descritivo** — cada opcao explica **o que faz** em uma linha. A pessoa entende a escolha sem abrir o README.
- **Com configuracoes e escolhas** — onde fizer sentido, o menu oferece sub-escolhas (porta, perfil, qual componente subir, variaveis), nao assume tudo em silencio.
- **Com feedback** — ao executar uma acao, mostre progresso e o resultado (sucesso/erro legivel), e volte ao menu.

### Bibliotecas sugeridas (Python continua o padrao)

O start continua sendo **Python** (`start_app.py`). Para o menu interativo e colorido, use bibliotecas de TUI — declaradas como dependencia do proprio script:

| Biblioteca | Para que |
|---|---|
| [`questionary`](https://github.com/tmbo/questionary) | Menus de selecao por setas, prompts, confirmacoes. |
| [`rich`](https://github.com/Textualize/rich) | Cor, tabelas, paineis, barras de progresso, status. |
| [`textual`](https://github.com/Textualize/textual) | TUI completa quando o menu cresce (apps com varias telas). |

> Mantenha o start leve: se for so menu + algumas acoes, `questionary` + `rich` bastam. So traga `textual` quando a porta de entrada virar, de fato, uma interface com varias telas.

---

## 3. Acoes minimas do menu

Todo menu de entrada deve oferecer, no minimo, estas quatro acoes:

| Acao | O que faz |
|---|---|
| **Iniciar / Rodar** | Sobe/executa o programa — servidor web, CLI, automacao, scraper, etc. Acao principal. Quando houver mais de um componente, deixa a pessoa **escolher qual** (ex: backend, frontend, ambos). |
| **Instalar / Setup** | Instala dependencias e prepara o ambiente: venv, `pip install`, `npm install`, `.env` a partir de exemplo, pastas necessarias. |
| **Configurar** | Ajusta configuracoes: portas, variaveis de ambiente, perfis, escolhas do usuario. Sem editar arquivo na mao. |
| **Status / Sair** | Mostra o estado (instalado? rodando? em que porta?), permite parar uma instancia, e sair do menu de forma limpa. |

Programas maiores podem ter mais opcoes (testes, logs, limpar cache, atualizar) — mas as quatro acima sao o **piso obrigatorio**.

---

## 4. Adaptar por tipo de programa

So muda **o que cada acao executa**. O menu e o contrato; o conteudo das acoes e por projeto.

| Tipo | "Iniciar / Rodar" faz | Observacao |
|---|---|---|
| **App web** (Django, FastAPI, Flask, Vite/React) | Sobe o servidor local e, se a pessoa quiser, abre o navegador na URL. | Abrir o navegador vira **uma opcao/escolha do menu**, nao um efeito automatico obrigatorio. |
| **CLI / ferramenta** | Executa o comando principal, ou abre um submenu com os subcomandos disponiveis. | Cada subcomando descrito em uma linha. |
| **Automacao / script** (scraper, ETL, job) | Roda a tarefa (ex: "setup + coleta"), mostrando progresso. | Pode oferecer escolhas: rodar uma vez, agendar, escopo. |
| **Fullstack** | Deixa escolher: subir backend, frontend ou ambos. | Um `start_app.py` na raiz orquestra; ou um por app, mas a **porta de entrada e sempre o menu**. |
| **Desktop / bot / outro** | Inicia o processo correspondente. | Mesma porta de entrada: `python start_app.py` → menu. |

> Para **app web**, abrir o navegador deixa de ser regra automatica e passa a ser uma escolha dentro do menu (a pessoa pode estar num servidor sem navegador). Continua valendo: subir/derrubar instancia, ver em que porta esta, reiniciar — tudo via menu.

---

## 5. Requisitos tecnicos do script

Independente do tipo de programa, o `start_app.py`:

1. **Cross-platform** — Windows, Linux, macOS. Use `sys.executable`, `webbrowser`, nada preso a um SO so.
2. **Falha de forma clara** — sem Python/Node, porta ocupada, dependencia faltando, comando inexistente: mensagem legivel dizendo **o que fazer**, e volta ao menu (nao quebra com stack trace cru).
3. **Nao guarda segredo** — o script orquestra; config sensivel continua em variavel de ambiente / `.env` ignorado pelo git.
4. **Instala suas proprias deps de TUI** — se o menu usa `questionary`/`rich`, o passo de Instalar/Setup garante que elas existem (ou o script faz um bootstrap minimo antes de desenhar o menu).
5. **Estado real** — "Status" deve checar de verdade (porta em uso, venv presente, `.env` existe), nao chutar.

---

## 6. Documentar no README

O `README.md` do projeto **deve** apontar o menu como o caminho principal:

```md
## Como rodar

Forma mais simples — abre o menu interativo onde voce instala, configura e inicia:

\`\`\`bash
python start_app.py
\`\`\`

No menu voce escolhe: **Instalar/Setup**, **Configurar**, **Iniciar/Rodar** e **Status/Sair**.
```

Nao documente flags como interface principal: a interface e o menu.

---

## 7. Checklist

- [ ] Existe um `start_app.py` na raiz para **todo programa rodavel** do projeto (nao so apps web).
- [ ] `python start_app.py` abre um **menu interativo, colorido e descritivo** — nao um prompt cru de "digite a letra".
- [ ] O menu oferece, no minimo: **Iniciar/Rodar**, **Instalar/Setup**, **Configurar**, **Status/Sair**.
- [ ] Cada opcao do menu descreve em uma linha o que faz.
- [ ] Toda acao do programa esta acessivel **pelo menu** — sem depender de flags decoradas.
- [ ] O menu nao trava o fluxo: avisa o que falta e deixa a pessoa escolher como resolver.
- [ ] Funciona em Windows, Linux e macOS, e falha com mensagem clara (voltando ao menu).
- [ ] Nao contem segredo — config sensivel fica em variavel de ambiente.
- [ ] O `README.md` documenta `python start_app.py` (o menu) como forma principal de rodar.

---

## 8. Ideias para quem quiser contribuir

- Um **template de referencia** de `start_app.py` com menu (`questionary` + `rich`) pronto para copiar e adaptar por tipo de programa.
- Um pequeno **modulo compartilhado** de menu (estilo, cores, helpers de status) reaproveitavel entre projetos do Felixo.
- Receitas de "Iniciar/Rodar" por stack (Django, FastAPI, Flask, Vite, scraper, CLI) plugaveis no mesmo menu.

---

> **Assinatura de Origem**  
> Este arquivo faz parte do repositorio **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versao: 2026-06-24

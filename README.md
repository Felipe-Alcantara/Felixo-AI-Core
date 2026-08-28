# Felixo AI Core

Felixo AI Core é o núcleo inteligente do ecossistema FelixoVerse: uma aplicação desktop para controlar, organizar e orquestrar múltiplas IAs, agentes, terminais, repositórios e fluxos de trabalho.

> **Pare de trocar de IA. Comece a orquestrar.**

---

## O que é

Uma aplicação desktop que centraliza, em uma única interface, as CLIs de IA que você já usa no terminal — Claude, Codex, Gemini e outros.

O objetivo de longo prazo é evoluir para um sistema capaz de escolher modelos, coordenar agentes, manter memória persistente e executar pipelines inteligentes com base em custo, contexto e objetivo da tarefa.

## Arquitetura alvo

O projeto agora segue uma arquitetura híbrida:

- **Terminal Adapters** controlam CLIs autenticadas por assinatura.
- **Orchestrator Core** decide modo de execução, continuidade e contexto.
- **MCP Layer** padroniza ferramentas, Git, memória, prompts, skills e contexto.

MCP não substitui as CLIs nem vira uma API universal de modelos. No Felixo AI Core, MCP é a camada de ferramentas; os modelos continuam entrando por adapters de terminal, APIs futuras ou modelos locais.

Ver [Orquestrador Híbrido com MCP](./docs/arquitetura/ORQUESTRADOR-HIBRIDO-MCP.md).

---

## Status atual

Primeira versão funcional entregue:

- Interface de chat com seletor visual de modelos/CLIs
- Backend Electron executando CLIs reais em streaming
- Adapters para `claude`, `codex` e `gemini`
- Launcher Openia para as interfaces compatíveis com OpenRouter, sem duplicar seu catálogo de modelos
- Perfis padrão para CLIs instaladas no sistema, sem depender dos scripts locais em `ai-clis/`
- Registry de Terminal Adapters
- Orchestrator Core inicial para decidir processo persistente, retomada nativa ou one-shot
- Catálogo inicial de ferramentas MCP do Felixo
- Empacotamento Electron Builder e base de auto-update via GitHub Releases
- Append incremental de resposta com cursor de streaming
- Botão de parar para interromper processo em andamento
- Canvas visual para organizar agentes, arquivos compartilhados, notas, grupos e páginas web (mini-navegador embutido)
- Launcher **Agente** com reutilização das últimas configurações e arquivo de planejamento opcional
- Frontend organizado por feature em `app/src/features/chat/`
- Processo Electron modularizado em `core/`, `services/` e `windows/`
- Testes unitários para adapters, orquestrador, catálogo MCP e leitura JSONL

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Electron 41 |
| Frontend | React 19 + TypeScript 6 + Vite 8 |
| Estilos | Tailwind CSS 3 |
| Ícones | lucide-react |
| Tooling | ESLint 10, Node 25.9.0 via `.nvmrc` |
| Testes | `node:test` nativo |

---

## Como rodar

Forma mais simples — abre o menu interativo onde você instala, configura e inicia:

```bash
python3 start_app.py
```

No menu você tem: **Iniciar/Rodar** (app desktop ou preview web), **Instalar/Setup**, **Configurar** (CLIs, permissões dos agentes, branch de produção) e **Status/Sair**.

### Atualização automática

Ao iniciar, o launcher verifica sozinho se há uma versão nova da branch em que você está e atualiza antes de abrir o app — você não precisa ficar rodando `git pull` para saber se saiu novidade. Quando já está em dia, não mostra nada e não custa nada perceptível.

No macOS, ao escolher **Iniciar/Rodar**, aparece também uma confirmação de
atualização forçada, ativada por padrão. Se confirmada, ela sincroniza a branch
atual exatamente com `origin/<branch>` antes de abrir; alterações locais são
guardadas em `git stash`; commits locais divergentes são substituídos, mas
ficam recuperáveis pelo reflog do Git. Se essa atualização explícita falhar, o
app não abre uma versão antiga silenciosamente.

A atualização automática silenciosa só atualiza quando é seguro e **nunca impede o app de abrir**. Ela pula a atualização quando:

- há alterações locais não commitadas (seu trabalho sempre ganha da atualização);
- não há rede, ou o `fetch` demora demais (é interrompido e o app abre normalmente);
- o histórico divergiu, quando um fast-forward reescreveria commits locais;
- o checkout está em *detached HEAD*, sem branch para atualizar.

Atualiza a branch em que você **já está** — não troca de branch nem puxa de `production` quando você está em `main`.

Para desligar (necessário em CI, que deve compilar exatamente o commit que baixou):

```bash
FELIXO_AUTO_UPDATE=off python3 start_app.py
python3 start_app.py --no-auto-update --web
```

Ou manualmente:

```bash
cd app
nvm use
npm install
npm run dev
```

Scripts/CI que já chamam `start_app.py` com flags continuam funcionando sem o menu (`--web`, `--skip-install`, `--update`, `--branch`) — ver [`docs/projeto/RODAR-VIA-CODIGO-FONTE.md`](docs/projeto/RODAR-VIA-CODIGO-FONTE.md).

## Rodar em outro PC

Pré-requisitos:

- Git
- Python 3
- Node.js 22+ com npm
- Pelo menos uma CLI de IA instalada e autenticada: `codex`, `claude` ou `gemini`

Linux/macOS:

```bash
git clone -b production https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
cd Felixo-AI-Core
python3 start_app.py
```

Windows PowerShell:

```powershell
git clone -b production https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
cd Felixo-AI-Core
py start_app.py
```

O `start_app.py` instala dependências Python de `requirements.txt` (hoje `questionary` e `rich`, usadas pelo menu interativo) e dependências Node com `npm install` quando necessário.

### Se o Python for "externally managed" (macOS com Homebrew, Debian/Ubuntu)

Nessas instalações o `pip` recusa instalar pacotes no Python do sistema e responde `error: externally-managed-environment` (PEP 668).

O launcher lida com isso sozinho: primeiro verifica se os pacotes já estão disponíveis (é o caso de várias distribuições Linux, e aí nem tenta instalar); se faltarem, tenta `--user` e, se o sistema também bloquear, `--break-system-packages`.

Essas dependências servem só para desenhar o menu — o app em si é Node. Se a instalação falhar mesmo assim, o launcher avisa e **segue rodando o app normalmente**.

Se quiser o ambiente mais previsível em qualquer SO, use um virtualenv:

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python3 start_app.py
```

No macOS, o launcher procura Node/npm em instalações comuns de Homebrew Apple Silicon, Homebrew Intel, MacPorts, NVM, fnm, Volta, asdf, mise e nodenv, mesmo quando o app é iniciado por uma GUI com `PATH` reduzido. Se precisar forçar um diretório específico, use `FELIXO_NODE_BIN=/caminho/do/bin`.

No Windows, o launcher resolve `npm.cmd` automaticamente e também procura Node.js em instalações comuns do instalador oficial, NVM for Windows, Volta, Scoop e `%APPDATA%\npm`.

Se quiser apenas abrir sem instalar dependências automaticamente:

```bash
python3 start_app.py --skip-install
```

Se alguma CLI não estiver no `PATH`, defina `FELIXO_CLI_PATHS` com a pasta onde o comando está instalado. Por padrão, as CLIs rodam em modo de automação com acesso total: Claude usa `--permission-mode bypassPermissions`, Codex usa `--dangerously-bypass-approvals-and-sandbox` e Gemini usa `--yolo`/`--skip-trust`. Para reduzir permissões, use `FELIXO_CLAUDE_PERMISSION_MODE=default|plan|auto|dontAsk|acceptEdits|off`, `FELIXO_CODEX_FULL_ACCESS=off` ou `FELIXO_GEMINI_FULL_ACCESS=off`.

### Organizar os blocos do canvas

O botão **Organizar** reposiciona os blocos de topo numa matriz quase quadrada, mantendo em células vizinhas os que estão ligados por uma aresta. Duas coisas definem o resultado, e nenhuma delas é a tela:

- **A ordem das células é a ordem do dock "Elementos"** — a mesma numeração `#N` que aparece no cabeçalho de cada terminal, e que você reordena arrastando as linhas do dock. Arrastar um bloco pelo canvas não muda mais para qual célula ele vai: dois cliques seguidos produzem o mesmo arranjo, e um bloco novo entra numa célula no fim, sem deslocar os que já estavam.
- **A âncora é o canto do bloco mais ao topo-esquerda**, não o canto visível da tela, então pan, zoom e tamanho de janela não alteram o destino.

A setinha ao lado do botão abre os dois modos:

| Modo | O que faz |
| --- | --- |
| **Matriz única** | Todos os blocos numa grade só (o clique direto no botão faz isso). |
| **Uma matriz por repositório** | Uma faixa por diretório de trabalho (`cwd`), empilhadas. Blocos sem diretório — notas, arquivos, páginas — ficam na última faixa. |

Para saber a que repositório um terminal pertence **sem abri-lo**, o cabeçalho do bloco mostra o nome da última pasta do `cwd` ao lado do `#N` (o caminho completo fica no *tooltip*). É a informação que não envelhece: o nome do bloco é escolhido na criação e costuma ficar desatualizado quando a mesma sessão segue para outra tarefa.

### Conta da CLI oficial: ver e trocar

No gerenciador de CLIs (Modelos > CLIs oficiais), uma CLI que expõe operações de conta — hoje o Codex — ganha dois botões:

- **Status da conta** roda o comando de status da própria CLI (`codex login status`) e mostra o que ela responder. Identidade (conta, plano, organização) só aparece quando a CLI a imprime; quando ela informa apenas "conectado", a tela diz exatamente isso, em vez de sugerir qual conta está em uso. O app não lê arquivo de credencial nem deduz identidade por caminho no disco, e a saída do comando é redigida antes de virar mensagem ou linha de log.
- **Trocar conta** abre uma confirmação antes de qualquer coisa: ela mostra a conta autenticada, lista os terminais do canvas que estão rodando aquela CLI e explica o efeito. Só depois de confirmar é que o app executa o logout e abre o login oficial em um terminal do sistema. Cancelar não desconecta nada.

**Efeito sobre terminais abertos.** O app não encerra nenhum processo durante a troca: o cartão, o diretório e o histórico do terminal continuam no canvas. Isso não é o mesmo que preservar a autenticação — um processo que já estava rodando pode perder a autorização no meio do trabalho, porque a credencial que ele carregou é a da conta anterior. Quando isso acontecer, reinicie aquele terminal pelo botão de reiniciar do próprio cartão: o nó e o diretório são reaproveitados; o contexto interno da CLI, não.

**Recuperação manual.** Se o app não conseguir abrir um terminal para o login, a troca informa o comando a rodar à mão (`codex login`). Para conferir o estado a qualquer momento, `codex login status` no terminal responde o mesmo que o botão.

## Openia como launcher de OpenRouter

O gerenciador de modelos (Modelos > CLIs oficiais) também identifica o `openia` como
launcher oficial. Ele não é apresentado como um modelo fictício: o Felixo inicia o
comando `openia` no diretório escolhido, e o menu do Openia continua sendo a fonte
de verdade para as interfaces, a chave do OpenRouter e a seleção de modelo.

Quando o Openia não está instalado, o botão **Instalar** mostra o repositório de
origem e pede confirmação antes de executar o `pip` remoto. A instalação usa o
Python do sistema (`python3` no Linux/macOS ou `py` no Windows), não depende de um
clone local e não entra na instalação automática baseada em npm do app. Depois de
instalado, **Abrir configuração** abre o menu próprio do Openia em um terminal.

O Felixo não lê, migra ou imprime `keys.json`/`.env` do Openia, não passa a chave em
argumentos e não mantém uma segunda lista de modelos. Se Python, `pip` ou o comando
`openia` não estiverem disponíveis, o cartão informa a falha e o restante do app
continua utilizável. A versão pode ser conferida com `openia --version`.

## Como distribuir

Build local:

```bash
cd app
npm run dist
```

O workflow `.github/workflows/release.yml` publica instaladores para Linux, Windows e macOS quando houver push na branch `production`. O app empacotado verifica atualizações no início e periodicamente; quando encontra uma versão nova publicada no GitHub Releases, baixa automaticamente e instala ao fechar.

Observações importantes:

- Usuários precisam ter as CLIs `codex`, `claude` e/ou `gemini` instaladas e autenticadas no próprio sistema; para usar o launcher Openia, precisam também de Python 3 e pip.
- Se a CLI não estiver no `PATH`, defina `FELIXO_CLI_PATHS` com os diretórios extras onde os comandos estão instalados.
- No Linux, prefira o AppImage para auto-update dentro do app; pacote `.deb` é útil para instalação tradicional, mas não segue o mesmo fluxo de atualização automática.
- **macOS: os artefatos não são assinados nem notarizados**, então o Gatekeeper bloqueia a primeira abertura — às vezes com uma mensagem confusa que sugere procurar um app na App Store. O usuário precisa liberar manualmente em **Ajustes do Sistema > Privacidade e Segurança**, ou rodar `xattr -dr com.apple.quarantine "/Applications/Felixo AI Core.app"`. Resolver isso de vez exige uma conta do Apple Developer Program (US$ 99/ano) e os secrets de assinatura no workflow de release.
- No Windows, o SmartScreen pode alertar enquanto não houver assinatura, mas o app abre após confirmar.

Detalhes de instalação por sistema operacional: [Guia do Usuário](./docs/guias/GUIA-USUARIO.md#2-instalação-por-sistema-operacional).

---

## Validação

Aplicação:

```bash
cd app
npm test
npm run lint
npm run build
```

Launcher (`start_app.py`) — não precisa de Node nem de dependências instaladas:

```bash
python3 -m unittest discover -s tests -t .
```

Os testes do launcher cobrem o que costuma quebrar entre sistemas operacionais: descoberta de Node no macOS (Homebrew Apple Silicon/Intel, gerenciadores de versão, `PATH` reduzido de apps de GUI), `Path`/`npm.cmd` no Windows, instalação de pacotes em Python "externally managed" (PEP 668) e a limpeza de processos, que só pode encerrar processos iniciados pelo próprio launcher. O CI roda esses testes em Linux, Windows e macOS.

### Estrutura do launcher

O `start_app.py` na raiz é a porta de entrada (exigida pelo padrão de qualidade) e apenas chama o pacote `felixo_launcher/`, onde cada módulo tem uma responsabilidade:

| Módulo | Responsabilidade |
|---|---|
| `paths` | Caminhos do repositório e configurações compartilhadas |
| `config` | Arquivo local de configuração escrito pelo menu |
| `node` | Encontrar Node.js/npm e montar o ambiente dele |
| `commands` | Resolver e executar comandos filhos |
| `process` | Parar o app e limpar processos de execuções anteriores |
| `node_deps` | Manter `app/node_modules` em dia com o `package.json` |
| `python_deps` | Instalar as dependências Python do próprio launcher |
| `git` | Atualizar o checkout a partir da branch de produção |
| `runner` | Preparo de ambiente e o caminho sem menu (flags) |
| `menu` | O menu interativo — interface principal do launcher |

Cada módulo tem seu arquivo de teste correspondente em `tests/`.

---

## Roadmap

Ver [ROADMAP.md](./docs/projeto/ROADMAP.md) para fases, checklists, metas e backlog completo.

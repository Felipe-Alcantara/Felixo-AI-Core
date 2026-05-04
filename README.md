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
- Perfis padrão para CLIs instaladas no sistema, sem depender dos scripts locais em `ai-clis/`
- Registry de Terminal Adapters
- Orchestrator Core inicial para decidir processo persistente, retomada nativa ou one-shot
- Catálogo inicial de ferramentas MCP do Felixo
- Empacotamento Electron Builder e base de auto-update via GitHub Releases
- Append incremental de resposta com cursor de streaming
- Botão de parar para interromper processo em andamento
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

Atalho recomendado:

```bash
python3 start_app.py
```

Ou manualmente:

```bash
cd app
nvm use
npm install
npm run dev
```

Para atualizar uma cópia rodada pelo código-fonte a partir da branch de produção:

```bash
python3 start_app.py --update
```

Esse comando faz `git pull --ff-only origin production` antes de abrir o app e bloqueia a atualização se houver alterações locais não commitadas.

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

O `start_app.py` instala dependências Python de `requirements.txt` quando houver pacotes listados e instala dependências Node com `npm install` quando necessário. Hoje o `requirements.txt` fica sem pacotes porque o launcher usa apenas a biblioteca padrão do Python.

No macOS, o launcher procura Node/npm em instalações comuns de Homebrew Apple Silicon, Homebrew Intel, MacPorts, NVM, fnm, Volta, asdf, mise e nodenv, mesmo quando o app é iniciado por uma GUI com `PATH` reduzido. Se precisar forçar um diretório específico, use `FELIXO_NODE_BIN=/caminho/do/bin`.

No Windows, o launcher resolve `npm.cmd` automaticamente e também procura Node.js em instalações comuns do instalador oficial, NVM for Windows, Volta, Scoop e `%APPDATA%\npm`.

Se quiser apenas abrir sem instalar dependências automaticamente:

```bash
python3 start_app.py --skip-install
```

Se alguma CLI não estiver no `PATH`, defina `FELIXO_CLI_PATHS` com a pasta onde o comando está instalado.

## Como distribuir

Build local:

```bash
cd app
npm run dist
```

O workflow `.github/workflows/release.yml` publica instaladores para Linux, Windows e macOS quando houver push na branch `production`. O app empacotado verifica atualizações no início e periodicamente; quando encontra uma versão nova publicada no GitHub Releases, baixa automaticamente e instala ao fechar.

Observações importantes:

- Usuários precisam ter as CLIs `codex`, `claude` e/ou `gemini` instaladas e autenticadas no próprio sistema.
- Se a CLI não estiver no `PATH`, defina `FELIXO_CLI_PATHS` com os diretórios extras onde os comandos estão instalados.
- No Linux, prefira o AppImage para auto-update dentro do app; pacote `.deb` é útil para instalação tradicional, mas não segue o mesmo fluxo de atualização automática.
- Releases públicas de macOS/Windows ainda devem receber assinatura/notarização antes de distribuição ampla.

Detalhes: [Distribuição e Atualizações](./docs/projeto/DISTRIBUICAO-E-ATUALIZACOES.md).

---

## Validação

```bash
cd app
npm test
npm run lint
npm run build
```

---

## Roadmap

Ver [ROADMAP.md](./docs/projeto/ROADMAP.md) para fases, checklists, metas e backlog completo.

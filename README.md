# Felixo AI Core

Felixo AI Core é o núcleo inteligente do ecossistema FelixoVerse: uma aplicação desktop para controlar, organizar e orquestrar múltiplas IAs, agentes, terminais, repositórios e fluxos de trabalho.

> **Pare de trocar de IA. Comece a orquestrar.**

---

## O que é

Uma aplicação desktop Linux-first que centraliza, em uma única interface, as CLIs de IA que você já usa no terminal — Claude, Codex, Gemini e outros.

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
- Registry de Terminal Adapters
- Orchestrator Core inicial para decidir processo persistente, retomada nativa ou one-shot
- Catálogo inicial de ferramentas MCP do Felixo
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
# Felixo AI Core

Felixo AI Core é o núcleo inteligente do ecossistema FelixoVerse: uma aplicação desktop para controlar, organizar e orquestrar múltiplas IAs, agentes, terminais, repositórios e fluxos de trabalho.

> **Pare de trocar de IA. Comece a orquestrar.**

---

## O que é

Uma aplicação desktop Linux-first que centraliza, em uma única interface, as CLIs de IA que você já usa no terminal — Claude, Codex, Gemini e outros.

O objetivo de longo prazo é evoluir para um sistema capaz de escolher modelos, coordenar agentes, manter memória persistente e executar pipelines inteligentes com base em custo, contexto e objetivo da tarefa.

---

## Status atual

Primeira versão funcional entregue:

- Interface de chat com seletor visual de modelos/CLIs
- Backend Electron executando CLIs reais em streaming
- Adapters para `claude`, `codex` e `gemini`
- Append incremental de resposta com cursor de streaming
- Botão de parar para interromper processo em andamento
- Frontend organizado por feature em `app/src/features/chat/`
- Processo Electron modularizado em `core/`, `services/` e `windows/`
- Testes unitários para adapters e leitura JSONL

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

Ver [ROADMAP.md](./ROADMAP.md) para fases, checklists, metas e backlog completo.

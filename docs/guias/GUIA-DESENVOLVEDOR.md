# Guia para Desenvolvedores

Status: concluido.

## Objetivo

Documentar como contribuir com o Felixo AI Core, entender a estrutura do projeto e seguir os padrões estabelecidos.

---

## Setup de desenvolvimento

### Requisitos

- Node.js ≥ 22.12.0 (definido em `.nvmrc`)
- npm ≥ 10.x
- Git ≥ 2.30
- Python 3.8+ (opcional, para `start_app.py`)

### Instalação

```bash
git clone https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
cd Felixo-AI-Core/app
npm install
```

### Rodando em modo dev

```bash
npm run dev       # Vite + Electron com hot reload
npm run dev:web   # Apenas frontend (navegador)
```

---

## Estrutura de pastas

```
Felixo-AI-Core/
├── app/                          # Aplicação principal
│   ├── electron/                 # Backend (main process)
│   │   ├── core/                 # Módulos centrais (paths, shell, CLI detector)
│   │   ├── main.cjs              # Ponto de entrada do Electron
│   │   ├── preload.cjs           # Bridge main↔renderer
│   │   ├── services/             # Serviços do backend
│   │   │   ├── adapters/         # Adapters de CLIs (claude, codex, gemini)
│   │   │   ├── mcp/              # MCP Layer (catálogo de tools)
│   │   │   ├── orchestration/    # Orquestração multi-agente
│   │   │   ├── orchestrator/     # Planner de execução
│   │   │   ├── protocols/        # AgentEvent e protocolos
│   │   │   └── providers/        # Registry de Terminal Adapters
│   │   └── windows/              # Configuração de janelas
│   ├── src/                      # Frontend (renderer)
│   │   ├── features/             # Componentes React por feature
│   │   ├── App.tsx               # Componente raiz
│   │   ├── main.tsx              # Entry point React
│   │   └── index.css             # Estilos globais + design tokens
│   ├── public/                   # Assets estáticos
│   ├── package.json              # Deps e scripts
│   └── vite.config.ts            # Configuração Vite
├── docs/                         # Documentação do projeto
│   ├── Tasklists/                # Tasklists por data
│   ├── arquitetura/              # Documentação de arquitetura
│   ├── backend/                  # Docs do backend
│   ├── frontend/                 # Docs do frontend
│   ├── projeto/                  # Docs gerais do projeto
│   └── relatorios/               # Relatórios diários
├── .github/workflows/            # CI e Release
├── start_app.py                  # Script de inicialização
└── README.md                     # Visão geral
```

---

## Comandos principais

| Comando | Diretório | Descrição |
|---------|-----------|-----------|
| `npm run dev` | app/ | Inicia Vite + Electron |
| `npm run dev:web` | app/ | Inicia apenas Vite |
| `npm run build` | app/ | Compila TypeScript + Vite |
| `npm run test` | app/ | Roda testes unitários |
| `npm run lint` | app/ | Roda ESLint |
| `npm run pack` | app/ | Gera build empacotado local |
| `npm run dist:linux` | app/ | Gera instaladores Linux |
| `npm run dist:win` | app/ | Gera instaladores Windows |
| `npm run dist:mac` | app/ | Gera instaladores macOS |

---

## Padrão de commits

O projeto segue Conventional Commits:

```
tipo(escopo): descrição curta

Corpo detalhado opcional.
```

### Tipos

| Tipo | Uso |
|------|-----|
| `feat` | Nova feature |
| `fix` | Correção de bug |
| `docs` | Documentação |
| `refactor` | Refatoração sem mudança funcional |
| `test` | Adição ou correção de testes |
| `chore` | Manutenção, dependências |
| `style` | Formatação, sem mudança funcional |

### Escopos comuns

`chat`, `terminal`, `orchestration`, `adapters`, `git`, `ui`, `theme`, `export`, `portability`, `ci`, `build`

### Exemplos

```
feat(chat): add message export to markdown format
fix(terminal): prevent duplicate events from persistent sessions
docs(portability): document cross-platform path strategy
refactor(adapters): extract common JSONL parsing to shared module
test(cli-detector): add version parsing edge cases
```

---

## Política de branch

| Branch | Propósito |
|--------|----------|
| `main` | Desenvolvimento ativo |
| `production` | Branch de release — push gera build automático |
| `feature/*` | Features em desenvolvimento |
| `fix/*` | Correções de bugs |

### Fluxo

1. Criar branch a partir de `main`: `git checkout -b feature/nome-da-feature`
2. Desenvolver, testar, commitar.
3. Abrir PR para `main`.
4. Após aprovação/merge, se pronto para release: merge `main` → `production`.
5. Push em `production` dispara release automática.

---

## Política de release

- Push em `production` dispara o workflow `release.yml`.
- O workflow gera builds para Linux, Windows e macOS.
- Artefatos são publicados automaticamente no GitHub Releases.
- Versão é gerada automaticamente: `{base_version}.{run_number}`.

**Cuidado:** Push direto em `production` gera release. Sempre verifique o estado do código antes de enviar.

---

## Testes

Os testes usam o test runner nativo do Node.js:

```bash
cd app
npm test
```

Convenção de arquivos: `*.test.cjs` no mesmo diretório do módulo.

Exemplos:
- `cli-detector.cjs` → `cli-detector.test.cjs`
- `shell-adapter.cjs` → `shell-adapter.test.cjs`

---

## CI Pipeline

O arquivo `.github/workflows/ci.yml` roda em:
- Pull requests
- Push em `main` e `production`

Passos:
1. Checkout
2. Setup Node 22
3. `npm ci`
4. `npm test`
5. `npm run lint`
6. `npm run build`

---

## Documentação

Toda feature deve ser documentada em `/docs/`:

1. **Antes de implementar:** criar plano se a feature alterar arquitetura.
2. **Depois de implementar:** atualizar docs com comportamento real.
3. **Formato:** Markdown com `Status:` no topo (`concluido.`, `em desenvolvimento.`, `planejado.`).
4. **Commit separado:** não misturar docs com implementação grande.

---

## Como adicionar uma nova CLI/Provider

1. Criar adapter em `app/electron/services/adapters/{nome}-adapter.cjs`.
2. Registrar no `app/electron/services/providers/terminal-adapter-registry.cjs`.
3. Adicionar ao catálogo em `app/electron/core/cli-detector.cjs`.
4. Criar testes unitários.
5. Documentar em `/docs/adapters/` ou `/docs/backend/`.

---

## Como rodar em cada SO

| SO | Comando |
|----|---------|
| Linux | `npm run dev` (nativo) |
| Windows | `npm run dev` (requer Git Bash ou terminal com npm) |
| macOS | `npm run dev` (requer Xcode Command Line Tools) |

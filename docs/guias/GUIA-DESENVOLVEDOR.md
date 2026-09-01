# Guia para Desenvolvedores

Status: concluido.
Última revisão: 2026-08-31.

## Objetivo

Documentar como contribuir com o Felixo AI Core, entender a estrutura do
projeto e seguir os padrões estabelecidos. O canvas é a superfície de produto
vigente; o modo de chat permanece no código apenas como compatibilidade legada
e não deve receber novos fluxos de produto.

---

## Setup de desenvolvimento

### Requisitos

- Node.js ≥ 22.12.0 (definido em `.nvmrc`)
- npm ≥ 10.x
- Git ≥ 2.30
- Python 3.9+ (opcional, para `start_app.py`)

### Instalação

```bash
git clone https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
cd Felixo-AI-Core/app
npm install
```

O launcher Python mantém suas dependências fora de `app/`: edite somente os
pacotes diretos em `requirements.in` e regenere `requirements.txt` com `uv`.
O lock contém versões transitivas exatas e hashes para instalação repetível em
Python 3.9+:

```bash
uv pip compile --universal --python-version 3.9 --generate-hashes \
  --upgrade --output-file requirements.txt requirements.in
```

O scanner usado pelo CI pode ser reproduzido localmente com:

```bash
python3 -m pip install pip-audit==2.10.1
python3 -m pip_audit --requirement requirements.txt --strict --progress-spinner off
```

### Rodando em modo dev

```bash
npm run dev       # Vite + Electron com hot reload
npm run dev:web   # Apenas frontend (navegador), com ciclo de porta coordenado
```

O modo de desenvolvimento passa pelo `scripts/dev-runner.cjs`: ele só encerra
uma instância antiga depois que ela responde com o marcador do Felixo, recusa
uma porta de outro projeto sem tocá-la e cria uma árvore nova e coordenada. No
macOS, fechar a última janela encerra o Electron apenas no modo de
desenvolvimento; o app empacotado continua seguindo o comportamento do Dock.

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
│   │   │   ├── adapters/         # Adapters de CLIs e sessões estruturadas
│   │   │   ├── mcp/              # MCP Layer (catálogo de tools)
│   │   │   ├── orchestration/    # Orquestração multi-agente
│   │   │   ├── orchestrator/     # Planner de execução
│   │   │   ├── protocols/        # AgentEvent e protocolos
│   │   │   ├── providers/        # Registry de Terminal Adapters
│   │   │   └── storage/          # Persistência SQLite e repositórios
│   │   └── windows/              # Configuração de janelas
│   ├── src/                      # Frontend (renderer)
│   │   ├── features/canvas/       # Produto principal: canvas e terminais PTY
│   │   ├── features/chat/        # Modo legado, mantido para compatibilidade
│   │   ├── features/shared/       # Tipos e serviços compartilhados
│   │   ├── App.tsx               # Componente raiz
│   │   ├── main.tsx              # Entry point React
│   │   └── index.css             # Estilos globais + design tokens
│   ├── public/                   # Assets estáticos
│   ├── package.json              # Deps e scripts
│   └── vite.config.ts            # Configuração Vite
├── felixo_launcher/              # Launcher Python e atualização do checkout
├── tests/                        # Testes do launcher
├── docs/                         # Documentação vigente
│   ├── guias/                    # Guias de usuário e desenvolvimento
│   ├── projeto/                  # Contexto, arquitetura e operação
│   └── _legado/                  # Documentação histórica, não normativa
├── .github/workflows/            # CI e Release
├── start_app.py                  # Script de inicialização
└── README.md                     # Visão geral
```

---

## Comandos principais

| Comando | Diretório | Descrição |
|---------|-----------|-----------|
| `npm run dev` | app/ | Inicia Vite + Electron |
| `npm run dev:web` | app/ | Inicia apenas Vite com limpeza coordenada |
| `npm run build` | app/ | Compila TypeScript + Vite |
| `npm run test` | app/ | Roda testes unitários |
| `npm run test:frontend` | app/ | Roda a suíte Vitest do renderer |
| `npm run lint` | app/ | Roda ESLint |
| `npm run pack` | app/ | Gera build empacotado local |
| `npm run dist:linux` | app/ | Gera instaladores Linux |
| `npm run dist:win` | app/ | Gera instaladores Windows |
| `npm run dist:mac` | app/ | Gera instaladores macOS |
| `npm run release:smoke` | app/ | Valida o artefato instalado no SO atual |
| `npm run publish:github` | app/ | Publica uma release pelo electron-builder; usar apenas no fluxo de release |

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

`canvas`, `terminal`, `orchestration`, `adapters`, `usage`, `accounts`, `git`, `ui`, `portability`, `ci`, `build` (`chat` só para manutenção legada)

### Exemplos

```
feat(canvas): add live account usage panel
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
| `production` | Branch legada/configurável usada apenas pelo atalho explícito `--update` |
| `feature/*` | Features em desenvolvimento |
| `fix/*` | Correções de bugs |
| `docs/*` | Atualizações de documentação |

### Fluxo

1. Criar branch a partir de `main`: `git checkout -b feature/nome-da-feature`
2. Desenvolver, testar, commitar.
3. Abrir PR para `main`.
4. Após aprovação, fazer merge em `main`.
5. O CI de `main` valida o commit; a conclusão verde aciona o workflow de release.

---

## Política de release

- Uma execução verde do CI para um commit em `main` dispara o workflow `release.yml`.
- O workflow também aceita execução manual, mas exige o SHA exato de um commit que passou no CI.
- O workflow gera builds para Linux, Windows e macOS.
- O workflow cria primeiro uma pré-release, publica todos os artefatos e só então a promove para release normal.
- Versão é gerada automaticamente: `{base_version}.{run_number}`.

**Cuidado:** a publicação altera o GitHub Releases e deve ocorrer somente pelo
workflow validado. `npm run publish:github` não é um substituto para esse
fluxo.

---

### Smoke do artefato de release

Depois de `electron-builder --publish never`, o workflow instala ou extrai o
artefato real do sistema e executa `npm run release:smoke`. O smoke:

- abre o executável empacotado em modo de validação e cria uma sessão PTY real
  com `node-pty`;
- localiza o `npm-cli.js` em `resources/npm-runtime`, instala e atualiza uma CLI
  local de fixture sem rede e sem tocar no npm global da máquina;
- confere o PATH, os shims `node`/`npm`, permissões POSIX ou `.cmd` no Windows,
  prefixo privado e persistência entre processos;
- grava tamanho do artefato, tempo até o app ficar pronto, resultado do PTY,
  versão do npm e diagnósticos nativos em
  `release/release-smoke-<plataforma>.json`.

Para reproduzir no checkout, gere um artefato para o SO atual e rode:

```bash
cd app
npm run build
npx electron-builder --publish never
npm run release:smoke -- --release-dir release --keep-temp
```

No Linux sem sessão gráfica, envolva o comando com `xvfb-run -a`. O workflow
executa essa validação na matriz dos três sistemas antes de permitir que a
pré-release seja promovida; o JSON do smoke sobe junto dos artefatos da
release para deixar o resultado auditável.

## Testes

Os testes são divididos entre backend Electron, renderer e launcher Python:

```bash
cd app
npm test
npm run test:native
npm run test:frontend
```

`npm test` descobre os `*.test.cjs` unitários de `electron/` e `scripts/` com um
runner Node portável; as integrações `*.integration.test.cjs` são executadas
por `npm run test:native`.

Convenção de arquivos: `*.test.cjs` no mesmo diretório do módulo.

O comando de integração de PTY deve ser executado no sistema que se quer
validar: Linux usa o launch direto, macOS o shell de login e Windows o
`cmd.exe` com ConPTY. As fixtures não usam credenciais nem rede e falham com
diagnóstico explícito quando o shell ou `node-pty` não é compatível; não se
deve transformar essa cobertura em `skip` por plataforma.

Exemplos:
- `cli-detector.cjs` → `cli-detector.test.cjs`
- `shell-adapter.cjs` → `shell-adapter.test.cjs`

Para o launcher, rode na raiz do repositório:

```bash
python3 -m unittest discover -s tests -t .
```

### Conferir no app rodando

Teste verde não é a mesma coisa que funcionar na tela. Para abrir o app de
verdade e interagir com ele — inclusive sem servidor gráfico, em CI ou por um
agente —, use a skill em [`.claude/skills/rodar-app/`](../../.claude/skills/rodar-app/SKILL.md).
Ela abre o Electron sob xvfb com dados isolados (não encosta no canvas real de
quem está usando a máquina) e expõe comandos para clicar, tirar screenshot,
digitar no terminal de um agente e simular colagens.

---

## CI Pipeline

O arquivo `.github/workflows/ci.yml` roda em:
- Pull requests
- Push em `main`

O job `launcher` instala o lock Python com `--require-hashes`, testa Linux,
Windows e macOS com Python 3.9 e 3.13 e executa `start_app.py --help`. O job
`python-dependency-audit` roda `pip-audit==2.10.1` contra o mesmo lock e falha
se houver advisory ou erro de coleta. O job `release-scripts` valida os
scripts Bash usados na publicação. O job `validate` testa o app nos três
sistemas com Node 22, `npm test`, `npm run lint` e `npm run build`, além de
verificar os arquivos de documentação vigentes.

---

## Documentação

Toda feature deve ser documentada em `/docs/`:

1. **Antes de implementar:** criar plano se a feature alterar arquitetura.
2. **Depois de implementar:** atualizar docs com comportamento real no mesmo
   commit coeso quando a mudança de comportamento exigir documentação.
3. **Formato:** Markdown com `Status:` no topo (`concluido.`, `em desenvolvimento.`, `planejado.`).
4. **Histórico operacional:** acrescentar uma entrada datada ao `IA.md`; não
   reescrever registros antigos nem deixar trabalho encerrado como "em andamento".
5. **Produto atual:** novas telas, fluxos e exemplos devem tratar o canvas como
   caminho principal; o chat só deve aparecer em documentação de compatibilidade.

---

## Como adicionar uma nova CLI/Provider

1. Criar adapter em `app/electron/services/adapters/{nome}-adapter.cjs`.
2. Registrar no `app/electron/services/providers/terminal-adapter-registry.cjs`.
3. Adicionar ao catálogo em `app/electron/core/cli-detector.cjs`.
4. Criar testes unitários.
5. Documentar o comportamento em um guia vigente de `docs/` e atualizar o
   índice de [`docs/README.md`](../README.md) se uma nova página for criada.

---

## Como rodar em cada SO

| SO | Comando |
|----|---------|
| Linux | `npm run dev` (nativo) |
| Windows | `npm run dev` (requer Git Bash ou terminal com npm) |
| macOS | `npm run dev` (requer Xcode Command Line Tools) |

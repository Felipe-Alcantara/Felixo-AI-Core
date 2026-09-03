# Guia para Desenvolvedores

Status: concluido.
Última revisão: 2026-09-02.

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

### Política de dependências e SBOM

O job `dependency-policy` do CI mantém quatro evidências separadas para o app
Electron: `npm audit` do grafo completo, `npm audit --omit=dev` da árvore de
produção, SBOM npm em CycloneDX e inventário do app empacotado. O grafo completo
inclui ferramentas e o `npm-runtime` distribuído; advisories não críticos nessa
árvore ficam registrados para atualização, enquanto um advisory crítico bloqueia
o job. Qualquer vulnerabilidade na árvore de produção também bloqueia.

Para reproduzir a parte npm localmente:

```bash
cd app
npm audit --json
npm audit --omit=dev --json
npm sbom --package-lock-only --sbom-format=cyclonedx --sbom-type=application
npm run pack
npm run inventory:package -- --release-dir release --out build/dependency-policy/package-inventory.json
```

O `npm audit` completo pode retornar código diferente de zero quando encontrar
advisories de desenvolvimento; o CI preserva esse código junto do JSON e aplica
o gate de criticidade no validador. O comparativo `--omit=dev` é o gate de
execução. O job `python-dependency-audit` mantém o `pip-audit` estrito do lock e
também publica um SBOM CycloneDX do launcher. O `.github/dependabot.yml` separa
atualizações de segurança, patch/minor agrupadas e majors individuais; cada
trilha deve passar pelos mesmos gates antes de entrar em `main`.

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
| `npm run typecheck` | app/ | Executa `tsc -b` incremental nos projetos app/node |
| `npm run typecheck:full` | app/ | Força o typecheck completo dos dois projetos |
| `npm run build` | app/ | Typecheck incremental + Vite |
| `npm run benchmark:typecheck:check` | app/ | Compara cinco execuções frias e cinco incrementais |
| `npm run benchmark:npm-runtime:check` | app/ | Compara tamanho e smoke do npm levado ao instalador |
| `npm run benchmark:package-managers -- --check` | app/ | Compara npm-runtime, pnpm, Yarn e bootstrap Corepack em prefixos descartáveis |
| `npm run inventory:package` | app/ | Lista o `app.asar`, pacotes e `npm-runtime` presentes no artefato |
| `npm run benchmark:bundle:check` | app/ | Mede o bundle de produção no Electron e valida chunks/assets |
| `npm run test` | app/ | Roda testes unitários |
| `npm run test:frontend` | app/ | Roda a suíte Vitest do renderer |
| `npm run lint` | app/ | Roda ESLint |
| `npm run pack` | app/ | Gera build empacotado local |
| `npm run dist:linux` | app/ | Gera instaladores Linux |
| `npm run dist:win` | app/ | Gera instaladores Windows |
| `npm run dist:mac` | app/ | Gera instaladores macOS |
| `npm run release:smoke` | app/ | Valida o artefato instalado no SO atual |
| `npm run publish:github` | app/ | Publica uma release pelo electron-builder; usar apenas no fluxo de release |
| `npm run benchmark:terminal-output -- --check` | app/ | Compara retenção/renderização dos Logs da CLI no renderer Electron |

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

O chat está depreciado; mudanças nele devem preservar compatibilidade e
exportação. O painel `Logs da CLI` mantém uma janela visual limitada, enquanto
o processo principal guarda o stream completo em JSONL temporário para a
exportação de análise. Para medir a mudança, use o benchmark de
`terminal-output`; ele exige Electron e, no Linux, `xvfb-run`.

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

### Avaliação de alternativas ao npm-runtime

Para reproduzir a decisão arquitetural sem alterar o npm global, execute:

```bash
cd app
npm run benchmark:package-managers -- \
  --iterations=2 --check --out=/tmp/felixo-package-managers.json
```

A bancada mede o runtime, bootstrap Corepack, startup, instalação e
atualização de uma CLI local em prefixos descartáveis. pnpm usa seu
`global-dir`/`PNPM_HOME`, Yarn Classic usa `global-folder`/`prefix`, e Yarn
moderno é apenas sondado porque não oferece o `global add` exigido pelo
launcher. O fixture não executa scripts de terceiros; CLIs oficiais com
dependências nativas, rede bloqueada e os três sistemas operacionais devem ser
validados antes de qualquer migração. O CI executa o check na matriz e publica
um JSON por SO. A recomendação atual, baseada no resultado Linux de
03/09/2026, é manter o npm-runtime.

### Smoke do artefato de release

Depois de `electron-builder --publish never`, o workflow instala ou extrai o
artefato real do sistema e executa `npm run release:smoke`. O smoke:

- abre o executável empacotado em modo de validação e cria uma sessão PTY real
  com `node-pty`;
- localiza o `npm-cli.js` em `resources/npm-runtime`, instala e atualiza uma CLI
  local de fixture sem rede e sem tocar no npm global da máquina;
- confere o PATH, os shims `node`/`npm`, permissões POSIX ou `.cmd` no Windows,
  prefixo privado e persistência entre processos;
- grava tamanho do artefato, tamanho/quantidade de arquivos do
  `npm-runtime`, startup do npm, tempos de primeira instalação/atualização,
  tempo até o app ficar pronto, resultado do PTY, versão do npm e diagnósticos
  nativos em
  `release/release-smoke-<plataforma>.json`.

Para medir a árvore antes de empacotar, use a comparação offline entre a
política anterior e a atual:

```bash
cd app
npm run benchmark:npm-runtime:check -- \
  --iterations=3 --out=/tmp/felixo-npm-runtime.json
```

O CI repete o check em Linux, Windows e macOS. A fixture usa o binário do
Electron como Node, um prefixo descartável, lifecycle scripts, PATH e uma
fonte local; nenhuma CLI ou credencial da máquina é alterada. O relatório do
release confirma depois o tamanho da árvore que entrou no instalador real.

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

### Typecheck e cache incremental

`tsconfig.app.json` e `tsconfig.node.json` mantêm o typecheck completo, mas
declaram `incremental: true` e gravam os diagnósticos em
`node_modules/.tmp/tsconfig.*.tsbuildinfo`. O build oficial usa `npm run
typecheck`, que chama `tsc -b` e permite ao build mode pular um projeto quando
nenhuma entrada mudou. Isso é diferente de `noCheck`: erros de tipo continuam
sendo diagnosticados em toda entrada alterada e o CI segue falhando em erro.

Para uma auditoria limpa, sem confiar no cache:

```bash
cd app
npm run typecheck:full
```

Para reproduzir a medição de tempo e memória:

```bash
cd app
npm run benchmark:typecheck:check -- --out=/tmp/felixo-typecheck.json
```

O relatório separa cinco execuções frias de cinco sem mudanças, exibe p50/p95
de tempo e RSS e valida que os dois projetos retornaram código zero. A bancada
move apenas os caches que ela mesma controla para `/tmp`; ela não remove código
nem altera o escopo dos tsconfigs.

O comando de integração de PTY deve ser executado no sistema que se quer
validar: Linux usa o launch direto, macOS o shell de login e Windows o
`cmd.exe` com ConPTY. As fixtures não usam credenciais nem rede e falham com
diagnóstico explícito quando o shell ou `node-pty` não é compatível; não se
deve transformar essa cobertura em `skip` por plataforma. O runner usa
concorrência 1 para manter uma única fixture nativa ativa por vez; isso evita
disputa artificial entre handles ConPTY sem reduzir a cobertura dos três SOs.

Exemplos:
- `cli-detector.cjs` → `cli-detector.test.cjs`
- `shell-adapter.cjs` → `shell-adapter.test.cjs`

Para o launcher, rode na raiz do repositório:

```bash
python3 -m unittest discover -s tests -t .
```

### Conferir no app rodando

Teste verde não é a mesma coisa que funcionar na tela. Para abrir o app de
verdade e interagir com ele em segundo plano, use o CLI `felixo devtools`, que
qualquer agente consegue chamar:

```bash
cd app
felixo devtools launch
felixo devtools screenshot --out ../tmp/felixo.png
felixo devtools click-text Agente
felixo devtools quit
```

Ele usa CDP em uma instância Electron destacada, com `userData` temporário e
janela invisível por padrão. `--real-profile` é excepcional e recusa iniciar se
o perfil aparentar já estar em uso. O CLI expõe `buttons`, `text`, `click`,
`type`, `press`, `eval` e `main` em chamadas curtas; `screenshot` usa a captura
nativa do Electron para funcionar também quando a janela oculta não pinta pelo
GPU no Windows. Em CI Linux sem display, Xvfb continua sendo o fallback do
ambiente. A skill [`.claude/skills/rodar-app/`](../../.claude/skills/rodar-app/SKILL.md)
aponta para esse fluxo e preserva o driver legado somente para casos de teclado
ou clipboard físico que CDP não representa.

---

## CI Pipeline

O arquivo `.github/workflows/ci.yml` roda em:
- Pull requests
- Push em `main`

O job `dependency-policy` instala o lock npm, registra o audit completo e o
comparativo `--omit=dev`, gera o SBOM CycloneDX, empacota o app e valida o
inventário de `app.asar` e `npm-runtime`. O gate bloqueia vulnerabilidades na
árvore de produção, advisories críticos no grafo completo e qualquer relatório
ausente ou inválido; advisories completos não críticos permanecem disponíveis
como evidência e aviso para as trilhas do Dependabot. O job `launcher` instala o
lock Python com `--require-hashes`, testa Linux, Windows e macOS com Python 3.9
e 3.13 e executa `start_app.py --help`. O job `python-dependency-audit` roda
`pip-audit==2.10.1` contra o mesmo lock, falha se houver advisory ou erro de
coleta e publica o SBOM do launcher. O job `release-scripts` valida os scripts
Bash usados na publicação. O job `validate` testa o app nos três sistemas com
Node 22, `npm test`, `npm run lint` e `npm run build`, além de verificar os
arquivos de documentação vigentes. Como `npm run build` chama o typecheck
incremental oficial, o CI reutiliza o cache quando o runner o tiver; uma
auditoria forçada pode ser executada separadamente com `npm run typecheck:full`
sem alterar o caminho de produção. O workflow de Release repete o inventário
no diretório produzido em cada SO e anexa o JSON à execução e à release.

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

# Levantamento da Arquitetura Atual — Portabilidade

Status: concluido.

## Objetivo

Documentar como o Felixo AI Core funciona hoje e quais partes podem quebrar quando o app for executado em diferentes sistemas operacionais ou empacotado como aplicativo.

---

## Stack atual do app desktop

| Camada | Tecnologia |
|--------|-----------|
| Framework desktop | Electron 41.x |
| Frontend | React 19 + Vite 8 + TypeScript 6 + Tailwind CSS 3 |
| Backend (main process) | Node.js ≥ 22.12 (CommonJS `.cjs`) |
| Empacotamento | electron-builder 26.x |
| Auto-update | electron-updater 6.x |
| Spawn de processos | cross-spawn 7.x |
| Linting | ESLint 10 |
| Testes | Node.js built-in test runner |

---

## Como o app é iniciado

### Modo desenvolvimento (código-fonte)

```bash
python3 start_app.py        # detecta Node/NVM, instala deps, roda npm run dev
# ou diretamente:
cd app && npm run dev        # concurrently: Vite + Electron
```

- `npm run dev` usa `concurrently` para rodar Vite dev server (`localhost:5173`) e depois iniciar Electron apontando para essa URL.
- O script `start_app.py` é o ponto de entrada recomendado para usuários de código-fonte. Detecta NVM, instala dependências automaticamente e aceita `--update` para fast-forward da branch `production`.

### Modo empacotado (release)

- `npm run dist` ou `npm run dist:linux` gera artefatos em `app/release/`.
- Electron carrega `dist/index.html` (build Vite) diretamente.
- O `electron-updater` verifica e baixa atualizações automaticamente do GitHub Releases.

---

## Scripts existentes

| Script | Função |
|--------|--------|
| `dev` | Roda Vite + Electron em paralelo |
| `dev:web` | Roda apenas o Vite dev server |
| `build` | `tsc -b && vite build` — compila TypeScript e gera bundle |
| `pack` | Build + electron-builder `--dir` (pasta sem instalador) |
| `dist` | Build + electron-builder (gera instaladores) |
| `dist:linux` | Build + instaladores Linux (AppImage + deb) |
| `dist:mac` | Build + instaladores macOS (dmg + zip) |
| `dist:win` | Build + instaladores Windows (NSIS exe) |
| `publish:github` | Build + publica no GitHub Releases |
| `test` | Roda testes unitários com Node.js test runner |
| `lint` | ESLint |
| `start` | Inicia Electron diretamente |

---

## Dependências nativas

O projeto **não** usa módulos nativos (N-API, node-gyp). Todas as dependências são JavaScript puro:

- `cross-spawn`: spawn de processos portátil
- `electron-updater`: auto-update
- `lucide-react`: ícones
- `react`, `react-dom`: UI

Isso simplifica o empacotamento multiplataforma.

---

## Onde o app executa comandos de terminal

| Arquivo | Responsabilidade |
|---------|-----------------|
| `cli-process-manager.cjs` | Spawn centralizado de processos CLI via `cross-spawn`. Gerencia ciclo de vida, stdin, kill (SIGTERM/SIGKILL) e limpeza. |
| `ipc-handlers.cjs` | Orquestração de fluxo: recebe pedido de CLI do frontend, monta argumentos via adapters, delega spawn ao `CliProcessManager`. |
| `git-service.cjs` | Execução de comandos Git read-only via `child_process.execFile`. |
| `start_app.py` | Script Python para iniciar o app (modo código-fonte). Usa `subprocess` para npm/git. |

**Portabilidade:** O `CliProcessManager` já usa `cross-spawn` e trata `process.platform === 'win32'` para `detached`, `signalChildProcess` e paths de CLI. O `git-service.cjs` usa `execFile` (não shell) mas assume que `git` está no PATH.

---

## Onde o app acessa arquivos locais

| Tipo de acesso | Localização atual |
|---------------|-------------------|
| Assets internos (logo, ícone) | `app/public/brand/` |
| Projetos Git do usuário | Selecionados via `dialog.showOpenDialog`, armazenados em `localStorage` |
| Notas do usuário | `localStorage` no renderer |
| Configurações do orquestrador | `localStorage` no renderer |
| Tema e preferências visuais | `localStorage` no renderer |
| Histórico de sessões | Memória + `localStorage` |
| QA Logger | Arquivo rotativo via `qa-logger.cjs` |

---

## Onde o app salva configurações

**Toda a persistência de configuração está em `localStorage` do renderer.** Não há uso atual de `electron-store`, SQLite ou arquivo de config no filesystem principal.

---

## Onde o app salva cache e logs

| Tipo | Local |
|------|-------|
| QA Logger | `qa-logger.cjs` — salva em arquivo via `logQaEvent()` |
| Cache de sessão | Memória do processo principal (`Map`s em `ipc-handlers.cjs`) |
| Logs de terminal | Apenas em memória no frontend (`useTerminalOutput`) |

---

## Onde o app chama CLIs externas

| CLI | Adapter(s) | Invocação |
|-----|-----------|-----------|
| `claude` | `claude-adapter.cjs` | `claude --print --input-format stream-json --output-format stream-json --verbose` |
| `codex` | `codex-adapter.cjs`, `codex-app-server-adapter.cjs` | `codex exec --json --skip-git-repo-check` |
| `gemini` | `gemini-adapter.cjs`, `gemini-acp-adapter.cjs` | `gemini --prompt ... --output-format stream-json --skip-trust` |
| `git` | `git-service.cjs` | `git status/diff/log/branch` (read-only, allowlisted) |

Todos os comandos são invocados pelo **nome do executável** (não por caminho absoluto), e o `CliProcessManager.createCliEnv()` adiciona candidatos de PATH comuns para NVM, Volta, asdf, Homebrew, npm global e diretórios do sistema.

---

## Partes que usam caminho fixo absoluto

**Nenhum caminho absoluto hardcoded foi encontrado no código de produção.** Todos os paths são resolvidos relativamente via `path.join(__dirname, ...)` ou `path.resolve()`.

O `paths.cjs` resolve:
- `appRoot`: `path.join(__dirname, '..')`
- `preloadPath`: `path.join(appRoot, 'preload.cjs')`
- `rendererBuildPath`: `path.join(appRoot, '../dist/index.html')`

Esses paths são relativos ao diretório do Electron, funcionando tanto em modo dev quanto empacotado.

---

## Partes que assumem Linux como ambiente padrão

| Parte | Risco |
|-------|-------|
| `start_app.py` | Usa `os.killpg` e `pgrep` (Unix). Já tem fallback para `os.name == 'nt'`. |
| `cli-process-manager.cjs` | Usa `-childProcess.pid` para SIGTERM em grupo. Já trata `win32`. |
| `getSystemCliPathCandidates()` | Já tem branches para `darwin`, `win32` e Linux. |
| `getUserCliPathCandidates()` | Já tem branches para Windows (APPDATA, LOCALAPPDATA) e Unix (~/.local/bin, etc). |

**O código já é razoavelmente portátil.** As principais adaptações por SO já existem.

---

## Riscos de portabilidade identificados

### Risco 1 — localStorage para persistência

A persistência em `localStorage` funciona em desenvolvimento, mas em apps empacotados o armazenamento pode ser perdido em atualizações ou se o diretório de dados do Electron mudar. As configurações do orquestrador já foram migradas para `app.getPath('userData')/config/orchestrator-settings.json`; modelos, projetos, notas e histórico ainda devem migrar para store Electron ou SQLite.

### Risco 2 — CLIs externas podem não estar no PATH

Usuários em Windows podem ter CLIs instaladas via scoop, chocolatey ou instaladores que não adicionam ao PATH do sistema. O `createCliEnv()` cobre npm global e NVM, mas não cobre todos os gerenciadores de pacotes.

### Risco 3 — Git read-only assume `git` no PATH

O `git-service.cjs` usa `execFile('git', ...)` sem fallback para caminho alternativo. Em Windows, Git pode estar em `C:\Program Files\Git\bin\git.exe` ou instalado via Scoop.

### Risco 4 — Sinais de processo no Windows

O `CliProcessManager` usa `process.kill(-pid, signal)` para matar grupo de processos em Unix. Em Windows usa `childProcess.kill(signal)`. O SIGKILL não existe nativamente no Windows — `cross-spawn` e Node.js traduzem para `TerminateProcess`, mas o comportamento pode ser diferente.

### Risco 5 — QA Logger e diretório de dados

O `qa-logger.cjs` precisa de um diretório de escrita. Em modo empacotado, o diretório do app é read-only. O caminho correto seria usar `app.getPath('userData')` para logs.

### Risco 6 — Configurações do usuário dentro da pasta do app

Configurações migradas para filesystem devem ficar em `app.getPath('userData')`, não dentro da pasta de instalação. O primeiro recorte já usa `userData/config` para as configurações do orquestrador.

### Risco 7 — macOS sandbox e notarização

Apps distribuídos fora da Mac App Store sem assinatura/notarização sofrem bloqueio pelo Gatekeeper. A distribuição atual não inclui assinatura.

### Risco 8 — Windows SmartScreen

Apps `.exe` sem assinatura de código recebem alerta do Windows SmartScreen. Usuários podem recusar a execução.

---

## Diferenças entre rodar via código-fonte e rodar empacotado

| Aspecto | Código-fonte | Empacotado |
|---------|-------------|-----------|
| Vite dev server | Sim, hot reload | Não, usa bundle estático |
| `app.isPackaged` | `false` | `true` |
| Auto-update | Desabilitado | Ativo (electron-updater) |
| Assets | Servidos pelo Vite | Incluídos no bundle `dist/` |
| node_modules | Presentes no filesystem | Incluídos no asar |
| Diretórios do app | Gravável | Pode ser read-only |
| Dados do usuário | `localStorage` | `localStorage` + `app.getPath('userData')` recomendado |
| CLIs externas | PATH do terminal do desenvolvedor | PATH do sistema (pode ser mais restrito) |
| Debug | DevTools abertos | DevTools fechados por padrão |
| Atualização | `git pull` + `npm install` | Auto-update silencioso |

---

## Conclusão

O código base do Felixo AI Core **já possui boa portabilidade básica**:

- Usa `cross-spawn` em vez de `child_process.spawn` direto.
- Trata `process.platform` para Windows, macOS e Linux em múltiplos pontos.
- Resolve paths com `path.join` e `path.resolve` (nunca com `/` hardcoded).
- Não usa módulos nativos que requeiram compilação.
- O `package.json` já configura targets de build para Linux (AppImage, deb), Windows (NSIS) e macOS (dmg, zip).
- CI e Release workflows já existem em `.github/workflows/`.

Os maiores riscos residem na **persistência via localStorage** (que deve migrar para algo mais robusto), na **detecção de CLIs externas** (que pode falhar em PATH mais restrito do modo empacotado) e na **falta de assinatura de código** para distribuição pública.

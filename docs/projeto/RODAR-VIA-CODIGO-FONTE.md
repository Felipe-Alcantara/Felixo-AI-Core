# Rodar via Código-Fonte

Status: concluido.
Última revisão: 2026-09-01.

## Objetivo

Documentar como qualquer pessoa pode clonar o repositório e rodar o Felixo AI
Core em ambiente de desenvolvimento. O app abre no canvas, que é a superfície
vigente; o modo de chat está depreciado e fica disponível somente para
compatibilidade com histórico legado.

---

## Requisitos mínimos

| Requisito | Versão mínima | Notas |
|-----------|--------------|-------|
| Node.js | ≥ 22.12.0 | Definido em `.nvmrc` |
| npm | ≥ 10.x | Vem com Node.js 22+ |
| Python | ≥ 3.9 | Apenas para `start_app.py` (opcional). 3.9 é o `python3` de sistema no macOS 12/13 e é a versão mínima verificada no CI |
| Git | ≥ 2.30 | Para clonar e usar funcionalidades Git |
| Sistema operacional | Linux, Windows 10+, macOS 12+ | |

### Dependências opcionais do sistema

| Dependência | Para quê |
|------------|----------|
| Claude CLI | Usar modelos Claude via terminal |
| Codex CLI | Usar modelos OpenAI via terminal |
| Gemini CLI | Usar modelos Google via terminal |
| Ollama | Modelos locais (futuro) |

---

## Instalação rápida

### Opção 1: Com `start_app.py` (recomendado)

```bash
git clone https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
cd Felixo-AI-Core
python3 start_app.py
```

Sem argumentos, `start_app.py` abre um **menu interativo colorido** (biblioteca `questionary` + `rich`, instaladas automaticamente no primeiro uso) com quatro ações:

| Ação do menu | O que faz |
|---|---|
| **Iniciar / Rodar** | Detecta Node/npm, instala dependências e sobe o app — desktop (Electron) ou preview web, a sua escolha. |
| **Instalar / Setup** | Instala dependências Python do lock (`requirements.txt`) e Node (`npm install`) sem abrir o app. |
| **Configurar** | Ajusta, sem editar arquivo na mão, os overrides opcionais de ambiente: pasta do Node, pastas extras de CLI, modo de permissão de cada agente e branch do atalho explícito de atualização. Fica salvo em `.felixo-start-config.json` (gitignored). |
| **Status / Sair** | Mostra Node detectado, se as dependências estão instaladas, branch/estado do Git e as configurações salvas; sai do menu. |

No macOS, ao escolher **Iniciar / Rodar**, o launcher pergunta se deve forçar a
atualização para a versão de `origin/<branch-atual>` antes de abrir. Essa opção
vem ativada por padrão: pressionar Enter confirma. Alterações não commitadas e
arquivos não rastreados são guardados em um `git stash`; a branch local é então
sincronizada com o estado do GitHub. Commits locais divergentes são
substituídos, mas continuam recuperáveis pelo reflog do Git. Se a atualização
falhar, o app não abre a versão antiga silenciosamente.

O menu não trava o fluxo: se algo estiver faltando (Node, dependências), ele avisa e deixa você escolher como resolver.

As dependências diretas do launcher ficam em `requirements.in`. O
`requirements.txt` é o lock gerado pelo `uv`, com o grafo transitivo, versões
exatas, hashes e marcadores que mantêm compatibilidade com Python 3.9 até
3.13. O launcher sempre instala o lock; não edite esse arquivo manualmente.

Para atualizar e auditar o lock:

```bash
uv pip compile --universal --python-version 3.9 --generate-hashes \
  --upgrade --output-file requirements.txt requirements.in
python3 -m pip install pip-audit==2.10.1
python3 -m pip_audit --requirement requirements.txt --strict --progress-spinner off
```

No macOS, a detecção de Node cobre Apple Silicon e Intel, incluindo Homebrew (`/opt/homebrew/bin` e `/usr/local/bin`), MacPorts (`/opt/local/bin`), NVM, fnm, Volta, asdf, mise, nodenv, `PATH` atual e paths customizados. O launcher valida `node --version` e `npm --version` antes de instalar dependências, então instalações quebradas são puladas quando houver outro Node funcional disponível.

### Opção 2: Diretamente com npm

```bash
git clone https://github.com/Felipe-Alcantara/Felixo-AI-Core.git
cd Felixo-AI-Core/app
npm install
npm run dev
```

### Opção 3: Apenas preview web (sem Electron)

```bash
cd Felixo-AI-Core/app
npm install
npm run dev:web
# Abra http://127.0.0.1:5173/ no navegador
```

---

## Comandos principais

| Comando | Diretório | O que faz |
|---------|-----------|-----------|
| `python3 start_app.py` | raiz | Abre o menu interativo (Iniciar/Instalar/Configurar/Status) |
| `python3 start_app.py --web` | raiz | **Atalho sem menu**, para scripts/CI: inicia apenas preview web |
| `python3 start_app.py --update` | raiz | **Atalho sem menu**: faz `fetch` + `pull --ff-only` da branch definida para a atualização explícita (por padrão, `production`) |
| `python3 start_app.py --skip-install` | raiz | **Atalho sem menu**: pula instalação de deps |
| `npm run dev` | app/ | Inicia Vite + Electron |
| `npm run dev:web` | app/ | Inicia apenas o Vite dev server com limpeza coordenada |
| `npm run typecheck` | app/ | Executa `tsc -b` incremental nos projetos app/node |
| `npm run typecheck:full` | app/ | Força o typecheck completo, ignorando o cache |
| `npm run build` | app/ | Typecheck incremental + Vite bundle |
| `npm run benchmark:typecheck:check` | app/ | Mede cinco runs frios e cinco incrementais do typecheck |
| `npm run benchmark:bundle:check` | app/ | Mede startup/menu no bundle e valida chunks relativos no Electron |
| `npm run test` | app/ | Roda testes unitários |
| `npm run test:frontend` | app/ | Roda os testes Vitest do renderer |
| `npm run lint` | app/ | Roda ESLint |
| `npm run pack` | app/ | Gera build empacotado local |
| `npm run dist:linux` | app/ | Gera instaladores Linux |
| `npm run dist:mac` | app/ | Gera instaladores macOS |
| `npm run dist:win` | app/ | Gera instaladores Windows |

### Typecheck incremental

O renderer continua sendo validado pelos dois projetos referenciados:
`tsconfig.app.json` cobre `src` e `tsconfig.node.json` cobre
`vite.config.ts`. Ambos mantêm `noEmit`, `skipLibCheck` e as regras de uso
seguro de tipos, mas agora declaram `incremental: true`. O `tsc -b` consegue
assim observar os arquivos `.tsbuildinfo` e não reprocessar projetos sem
entradas alteradas.

```bash
cd app
npm run typecheck                 # usado por npm run build
npm run typecheck:full            # força os dois projetos
npm run benchmark:typecheck:check # cinco frios + cinco incrementais
```

O benchmark mede tempo de parede e pico de RSS do comando real, valida cinco
amostras de cada modo e move apenas seus próprios caches temporários. A
otimização é de cache do compilador; ela não usa `noCheck`, não exclui fontes
e não troca um typecheck por uma mera compilação Vite.

### Ciclo de vida do Vite no modo dev

`npm run dev` e `npm run dev:web` usam `scripts/dev-runner.cjs`. Antes de
iniciar, ele consulta `__felixo_dev_marker`: se a porta 5173 já responder com
o marcador do Felixo, a instância antiga é encerrada de forma controlada antes
de iniciar uma árvore nova; se responder outra coisa, a execução para sem
matar o processo estrangeiro. Ao encerrar a sessão, o Vite criado é liberado,
inclusive quando o Electron fecha a última janela no macOS. O app empacotado não
usa o Vite de desenvolvimento.

---

## Configuração de CLIs externas

O Felixo AI Core não inclui CLIs de IA no pacote. O usuário precisa instalar e autenticar separadamente:

### Claude CLI

```bash
npm install -g @anthropic-ai/claude-code
claude --version
# Autenticar: claude configure
```

### Codex CLI

```bash
npm install -g @openai/codex
codex --version
# Autenticar: configurar OPENAI_API_KEY
```

### Gemini CLI

```bash
npm install -g @google/gemini-cli
gemini --version
# Autenticar: gemini configure
```

### Paths personalizados

Se as CLIs não estiverem no PATH padrão:

```bash
export FELIXO_CLI_PATHS=/caminho/custom/bin:/outro/caminho
python3 start_app.py
```

---

## Variáveis de ambiente

`FELIXO_CLI_PATHS`, `FELIXO_CLAUDE_PERMISSION_MODE`, `FELIXO_CODEX_FULL_ACCESS`, `FELIXO_GEMINI_FULL_ACCESS`, `FELIXO_NODE_BIN` e `FELIXO_PRODUCTION_BRANCH` também podem ser ajustadas pelo menu do `start_app.py` (**Configurar**), sem precisar exportar nada manualmente — o menu persiste em `.felixo-start-config.json` (gitignored) e aplica no processo antes de instalar/rodar.

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `FELIXO_CLI_PATHS` | Diretórios extras para buscar CLIs | vazio |
| `FELIXO_CLAUDE_PERMISSION_MODE` | Modo de permissão passado ao Claude Code (`default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions` ou `off`) | `bypassPermissions` |
| `FELIXO_CODEX_FULL_ACCESS` | Ativa/desativa `--dangerously-bypass-approvals-and-sandbox` e config full access do Codex (`off` para desativar) | ligado |
| `FELIXO_GEMINI_FULL_ACCESS` | Ativa/desativa `--yolo` no Gemini (`off` para desativar) | ligado |
| `FELIXO_SHELL` | Shell override para execução de comandos | `$SHELL` ou padrão do SO |
| `FELIXO_NODE_BIN` | Diretório do Node.js override | auto-detectado |
| `FELIXO_NODE_SEARCH_PATHS` | Diretórios extras para buscar Node/npm | vazio |
| `FELIXO_PRODUCTION_BRANCH` | Branch usada pelo `--update` explícito | `production` |
| `FELIXO_AUTO_UPDATE` | Controla o update silencioso da branch atual (`off`, `0`, `false` ou `no` desabilita) | ligado |
| `FELIXO_UPDATE_PRERELEASE` | Aceita pre-releases | `0` |
| `FELIXO_UPDATE_CHANNEL` | Canal de update | vazio |

---

## Troubleshooting

### Terminal de depuração no Windows

Ao escolher **Iniciar / Rodar → App desktop (Electron)**, o `start_app.py`
abre uma janela de terminal dedicada para o processo de desenvolvimento. Ela
mostra a saída completa de `npm`, Vite e Electron, mantém a janela aberta após
o encerramento e salva a mesma saída em `logs/startup/` na raiz do repositório.
Esses arquivos são locais e ignorados pelo Git; envie o arquivo mais recente
ao relatar um erro. A sessão preserva as permissões das CLIs configuradas no
Felixo, mas usa os privilégios normais da conta do Windows — não solicita UAC.

### "npm was not found"

O Node.js não está instalado ou não está no PATH.

**Solução:** Instale o Node.js 22+ via NVM, Volta ou [nodejs.org](https://nodejs.org/).

```bash
# Via NVM (recomendado):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 22
nvm use 22
```

### macOS: Code Runner/VS Code não acha Node/npm

Quando o app é iniciado por uma GUI no macOS, o processo pode não herdar o mesmo `PATH` do Terminal. O `start_app.py` tenta os caminhos comuns automaticamente, mas você também pode fixar o diretório do Node:

```bash
export FELIXO_NODE_BIN=/opt/homebrew/bin      # Homebrew Apple Silicon
export FELIXO_NODE_BIN=/usr/local/bin         # Homebrew Intel ou instalador oficial
export FELIXO_NODE_BIN="$HOME/.nvm/versions/node/v25.9.0/bin"
python3 start_app.py
```

Se quiser adicionar mais de um local de busca:

```bash
export FELIXO_NODE_SEARCH_PATHS="/opt/homebrew/bin:$HOME/.volta/bin:$HOME/.asdf/shims"
python3 start_app.py
```

### macOS: erro `npm-prefix.js` ou "Could not determine Node.js install directory"

Esse erro costuma aparecer quando o wrapper do npm do Homebrew é executado pelo caminho interno da Cellar em vez do caminho estável (`/opt/homebrew/bin` ou `/usr/local/bin`). O launcher agora preserva o diretório encontrado no `PATH` e valida o npm antes de usar. Se ainda acontecer, reinstale o Node do Homebrew e rode de novo:

```bash
brew reinstall node
python3 start_app.py
```

### Windows: `FileNotFoundError` ao instalar com npm

No Windows, o npm geralmente é executado por `npm.cmd`. O `start_app.py` resolve o comando real antes de chamar subprocessos, então `npm install`, `npm run dev` e `npm run dev:web` funcionam mesmo quando o PowerShell não executa `npm` como arquivo direto.

Se o Node não estiver no `Path`, defina o diretório manualmente:

```powershell
$env:FELIXO_NODE_BIN = "C:\Program Files\nodejs"
py start_app.py
```

Também são considerados os caminhos comuns de Node.js oficial, NVM for Windows, Volta, Scoop e `%APPDATA%\npm`.

### "python3: command not found"

O Python não está instalado (necessário apenas para `start_app.py`).

**Solução:** Use `npm run dev` diretamente em `app/`, ou instale Python 3.

### macOS: arquivo `.py` não inicia pelo painel Projetos

O painel executa arquivos `.py` e `.PY` com `python3` dentro de um terminal
interativo. Confirme que o interpretador está disponível no mesmo ambiente do
app:

```bash
python3 --version
```

Se o comando não existir, instale o Python 3 e reinicie o Felixo. Quando o app
é aberto por uma GUI, o shell de login do macOS é usado para carregar o PATH;
isso também cobre instalações feitas por Homebrew em Apple Silicon e Intel.

### "CLI não encontrada" (claude, codex, gemini)

A CLI não está instalada ou não está no PATH.

**Solução:**
1. Instale a CLI conforme instruções acima.
2. Verifique com `which claude` (Linux/macOS) ou `where claude` (Windows).
3. Se instalada fora do PATH, use `FELIXO_CLI_PATHS`.

### "Modelo sem CLI compatível configurada"

O modelo selecionado não tem adapter configurado.

**Solução:** Verifique se a CLI correspondente está instalada e funcionando.

### Vite não inicia (porta ocupada)

Outro serviço está usando a porta 5173 e não respondeu com o marcador do
Felixo. O launcher não mata esse processo automaticamente, porque ele pode ser
outro projeto.

**Solução:**
```bash
# Verificar o que está na porta:
lsof -i :5173   # Linux/macOS
netstat -aon | findstr :5173   # Windows

# Se for uma instância antiga do próprio Felixo, encerre-a pelo app/terminal e
# tente novamente; o dev-runner libera automaticamente uma instância confirmada.
python3 start_app.py
```

### Erro de build TypeScript

**Solução:**
```bash
cd app
rm -rf node_modules
npm install
npm run build
```

---

## Atualização via código-fonte

O launcher tem dois caminhos diferentes. No uso normal, iniciar sem flags faz
um `fetch` silencioso e tenta atualizar por fast-forward **a branch em que o
checkout já está**; se houver alterações locais, divergência, falta de rede ou
outro impedimento, o app abre sem interromper o trabalho.

Para pedir explicitamente a branch configurada para esse atalho (por padrão,
`production`), use:

```bash
python3 start_app.py --update
```

Isso executa:
1. `git fetch origin <branch-configurada>`
2. `git pull --ff-only origin <branch-configurada>`
3. `npm install` (se o código mudou)
4. Inicia o app

Também é possível selecionar outra branch sem alterar a configuração salva:

```bash
python3 start_app.py --update --branch main
```

**Nota:** Se houver alterações locais não commitadas, a atualização explícita é
bloqueada para proteger o trabalho do usuário. `--no-auto-update` e
`FELIXO_AUTO_UPDATE=off` só controlam o caminho silencioso; não desabilitam o
`--update` explícito.

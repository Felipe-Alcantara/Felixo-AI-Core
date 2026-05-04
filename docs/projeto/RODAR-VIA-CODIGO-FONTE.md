# Rodar via Código-Fonte

Status: concluido.

## Objetivo

Documentar como qualquer pessoa pode clonar o repositório e rodar o Felixo AI Core em ambiente de desenvolvimento.

---

## Requisitos mínimos

| Requisito | Versão mínima | Notas |
|-----------|--------------|-------|
| Node.js | ≥ 22.12.0 | Definido em `.nvmrc` |
| npm | ≥ 10.x | Vem com Node.js 22+ |
| Python | ≥ 3.8 | Apenas para `start_app.py` (opcional) |
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

O script `start_app.py`:
1. Detecta uma instalação funcional de Node.js/npm.
2. Instala dependências automaticamente (`npm install`).
3. Instala dependências Python se houver `requirements.txt`.
4. Inicia o app com `npm run dev`.
5. Trata encerramento gracioso de processos.

No macOS, a detecção cobre Apple Silicon e Intel, incluindo Homebrew (`/opt/homebrew/bin` e `/usr/local/bin`), MacPorts (`/opt/local/bin`), NVM, fnm, Volta, asdf, mise, nodenv, `PATH` atual e paths customizados. O launcher valida `node --version` e `npm --version` antes de instalar dependências, então instalações quebradas são puladas quando houver outro Node funcional disponível.

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
| `python3 start_app.py` | raiz | Detecta deps, instala, inicia app |
| `python3 start_app.py --web` | raiz | Inicia apenas preview web |
| `python3 start_app.py --update` | raiz | Atualiza código da branch production |
| `python3 start_app.py --skip-install` | raiz | Pula instalação de deps |
| `npm run dev` | app/ | Inicia Vite + Electron |
| `npm run dev:web` | app/ | Inicia apenas Vite dev server |
| `npm run build` | app/ | Compila TypeScript + Vite bundle |
| `npm run test` | app/ | Roda testes unitários |
| `npm run lint` | app/ | Roda ESLint |
| `npm run pack` | app/ | Gera build empacotado local |
| `npm run dist:linux` | app/ | Gera instaladores Linux |

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

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `FELIXO_CLI_PATHS` | Diretórios extras para buscar CLIs | vazio |
| `FELIXO_SHELL` | Shell override para execução de comandos | `$SHELL` ou padrão do SO |
| `FELIXO_NODE_BIN` | Diretório do Node.js override | auto-detectado |
| `FELIXO_NODE_SEARCH_PATHS` | Diretórios extras para buscar Node/npm | vazio |
| `FELIXO_PRODUCTION_BRANCH` | Branch de produção para `--update` | `production` |
| `FELIXO_DISABLE_AUTO_UPDATE` | Desabilita auto-update | `0` |
| `FELIXO_UPDATE_PRERELEASE` | Aceita pre-releases | `0` |
| `FELIXO_UPDATE_CHANNEL` | Canal de update | vazio |

---

## Troubleshooting

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

Outra instância do Vite ou outro serviço está usando a porta 5173.

**Solução:**
```bash
# Verificar o que está na porta:
lsof -i :5173   # Linux/macOS
netstat -aon | findstr :5173   # Windows

# Ou matar processos anteriores do app:
python3 start_app.py   # O script limpa automaticamente
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

Para atualizar o app para a versão mais recente da branch `production`:

```bash
python3 start_app.py --update
```

Isso executa:
1. `git fetch origin production`
2. `git pull --ff-only origin production`
3. `npm install` (se o código mudou)
4. Inicia o app

**Nota:** Se houver alterações locais não commitadas, a atualização é bloqueada para proteger o trabalho do usuário.

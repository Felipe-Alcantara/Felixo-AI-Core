# Modo Desenvolvimento vs Modo Produção

Status: concluido.

## Objetivo

Definir claramente a diferença entre executar o Felixo AI Core pelo código-fonte (modo desenvolvimento) e como app empacotado (modo produção), e como o app detecta e se adapta a cada modo.

---

## Definição dos modos

### Development mode (código-fonte)

O usuário clona o repositório, instala dependências e executa o app localmente. O Vite dev server fornece hot reload, o DevTools está disponível, e o auto-update está desabilitado.

**Indicador programático:** `app.isPackaged === false`

**Características:**
- Vite serve o frontend em `http://127.0.0.1:5173/`.
- Electron carrega a URL do Vite (hot reload ativo).
- `node_modules` existem fisicamente no filesystem.
- O diretório do app é gravável.
- CLIs externas usam o PATH do terminal do desenvolvedor.
- Auto-update desativado.
- QA Logger e DevTools disponíveis para debug.

### Production packaged mode (app empacotado)

O usuário baixa um instalador ou executável (AppImage, .deb, .exe, .dmg) e executa o app sem interagir com código-fonte.

**Indicador programático:** `app.isPackaged === true`

**Características:**
- Electron carrega `dist/index.html` do bundle Vite pré-compilado.
- O diretório do app pode ser read-only (especialmente em Linux AppImage e macOS .app).
- CLIs externas dependem do PATH do sistema (mais restrito).
- Auto-update ativo via `electron-updater`.
- DevTools fechados por padrão.

---

## Detecção de ambiente

O app usa `app.isPackaged` (Electron API) como indicador principal:

```javascript
// auto-updater.cjs
const status = app.isPackaged ? 'idle' : 'disabled'

// Onde for necessário:
if (app.isPackaged) {
  // modo produção empacotado
} else {
  // modo desenvolvimento
}
```

Variáveis de ambiente auxiliares:
- `FELIXO_DISABLE_AUTO_UPDATE=1` — desabilita auto-update mesmo em modo empacotado.
- `FELIXO_UPDATE_PRERELEASE=1` — permite receber pre-releases no auto-update.
- `FELIXO_UPDATE_CHANNEL` — canal de update customizado.
- `FELIXO_CLI_PATHS` — diretórios extras para buscar CLIs.

---

## Paths por modo

### Assets internos

| Modo | Resolução |
|------|-----------|
| Desenvolvimento | Servidos pelo Vite dev server a partir de `app/public/` |
| Produção | Incluídos no bundle em `dist/` dentro do asar |

O `paths.cjs` resolve o `rendererBuildPath` de forma relativa ao Electron main:
```javascript
const rendererBuildPath = path.join(appRoot, '../dist/index.html')
```
Isso funciona nos dois modos porque o `__dirname` do Electron sempre aponta para o diretório correto.

### Configurações do usuário

| Modo | Local atual | Local recomendado |
|------|------------|-------------------|
| Desenvolvimento | `localStorage` para dados legados; orquestrador em `userData/config` | `userData` ou SQLite para dados que precisam sobreviver a builds |
| Produção | Orquestrador em `userData/config`; dados legados ainda no renderer | `app.getPath('userData')` via Electron API |

**Local padrão por SO (`userData`):**
- Linux: `~/.config/felixo-ai-core/`
- Windows: `%APPDATA%/felixo-ai-core/`
- macOS: `~/Library/Application Support/felixo-ai-core/`

### Logs

| Modo | Local atual | Local recomendado |
|------|------------|-------------------|
| Desenvolvimento | Console + QA Logger local | Mesmo |
| Produção | QA Logger em `userData` | `app.getPath('logs')` |

**Local padrão por SO (`logs`):**
- Linux: `~/.config/felixo-ai-core/logs/`
- Windows: `%APPDATA%/felixo-ai-core/logs/`
- macOS: `~/Library/Logs/felixo-ai-core/`

### Cache

| Modo | Local atual | Local recomendado |
|------|------------|-------------------|
| Ambos | Memória (Map) | `app.getPath('sessionData')` ou SQLite em `userData` |

### Banco local

Ainda não implementado. Quando SQLite for adicionado, o banco deve ficar em `app.getPath('userData')`.

---

## Erros de ambiente

Quando o app detecta problema de ambiente, deve exibir mensagem amigável:

| Situação | Mensagem sugerida |
|----------|-------------------|
| CLI não encontrada | "A CLI {nome} não foi encontrada no sistema. Instale-a seguindo as instruções em {link}." |
| Git não instalado | "Git não foi detectado. Instale o Git para usar funcionalidades de controle de versão." |
| Permissão negada | "Sem permissão para acessar o diretório {caminho}. Verifique as permissões do sistema." |
| Diretório read-only | "Não foi possível salvar em {caminho}. O diretório é somente leitura." |

---

## Resumo da diferenciação implementada

| Funcionalidade | Desenvolvimento | Produção |
|---------------|-----------------|----------|
| Hot reload | ✅ Vite HMR | ❌ Bundle estático |
| Auto-update | ❌ Desabilitado | ✅ electron-updater |
| DevTools | ✅ Abertos | ❌ Fechados |
| Assets | Vite dev server | Bundle dist/ |
| PATH de CLIs | Terminal do dev | Sistema (restrito) |
| Dados do usuário | localStorage | localStorage → migrar para userData |
| Atualização | `git pull` / `start_app.py --update` | Download automático |
| Diretório do app | Gravável | Pode ser read-only |

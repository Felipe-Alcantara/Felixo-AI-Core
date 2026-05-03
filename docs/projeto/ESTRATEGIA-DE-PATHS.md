# Estratégia de Paths — Camada Adaptativa

Status: concluido.

## Objetivo

Centralizar a resolução de caminhos do Felixo AI Core para garantir compatibilidade entre Linux, Windows e macOS, tanto em modo desenvolvimento quanto empacotado.

---

## Módulo central: `app-paths.cjs`

Localização: `app/electron/core/app-paths.cjs`

O módulo expõe:

- `getAppPaths()` — retorna objeto com todos os paths resolvidos.
- `initAppPaths()` — cria diretórios de dados do usuário no startup.
- `ensureDir(path)` — cria diretório recursivamente se não existir.
- `getCacheBase()` — retorna diretório base de cache por SO.

---

## Paths resolvidos

| Path | Descrição | Linux | Windows | macOS |
|------|-----------|-------|---------|-------|
| `userData` | Raiz dos dados do usuário | `~/.config/felixo-ai-core/` | `%APPDATA%/felixo-ai-core/` | `~/Library/Application Support/felixo-ai-core/` |
| `config` | Configurações do app | `userData/config/` | `userData/config/` | `userData/config/` |
| `logs` | Logs do app | `~/.config/felixo-ai-core/logs/` | `%APPDATA%/felixo-ai-core/logs/` | `~/Library/Logs/felixo-ai-core/` |
| `cache` | Cache temporário | `~/.cache/felixo-ai-core/` | `%LOCALAPPDATA%/felixo-ai-core/` | `~/Library/Caches/felixo-ai-core/` |
| `temp` | Arquivos temporários | `/tmp/felixo-ai-core/` | `%TEMP%/felixo-ai-core/` | `/tmp/felixo-ai-core/` |
| `database` | Banco SQLite futuro | `userData/database/` | `userData/database/` | `userData/database/` |
| `exports` | Exportações de chat | `userData/exports/` | `userData/exports/` | `userData/exports/` |
| `notes` | Notas do usuário | `userData/notes/` | `userData/notes/` | `userData/notes/` |
| `reports` | Relatórios gerados | `userData/reports/` | `userData/reports/` | `userData/reports/` |
| `assets` | Assets internos do app | `public/` (dev) ou `dist/` (prod) | Idem | Idem |

---

## Regras de resolução

1. **Nunca usar caminhos absolutos fixos.** Sempre resolver via `path.join()` ou `path.resolve()`.
2. **Nunca usar separador `/` manual.** Sempre usar `path.join()` ou `path.sep`.
3. **Dados do usuário nunca dentro da pasta do app.** Sempre em `app.getPath('userData')`.
4. **Cache e temp podem ser apagados.** Dados importantes ficam em `userData`.
5. **Paths com espaços e acentos.** Suportados nativamente por `path.join()` e Node.js.
6. **Nomes de usuário com caracteres especiais.** Resolvidos via `os.homedir()` (nunca hardcoded).

---

## Uso no código

```javascript
const { getAppPaths, initAppPaths } = require('./core/app-paths.cjs')

// No startup do app (main.cjs):
app.whenReady().then(() => {
  const paths = initAppPaths() // cria todos os diretórios
  console.log('Dados em:', paths.userData)
})

// Em qualquer serviço:
const paths = getAppPaths()
const dbPath = path.join(paths.database, 'felixo.db')
```

---

## Testes

Testes unitários em `app/electron/core/app-paths.test.cjs` cobrem:

- Presença de todas as chaves esperadas.
- Todos os paths são absolutos.
- `ensureDir` cria diretórios recursivamente.
- `ensureDir` não falha se o diretório já existe.
- `initAppPaths` cria todas as pastas de dados do usuário.

---

## Compatibilidade com paths existentes

O módulo `paths.cjs` original (`appRoot`, `preloadPath`, `rendererBuildPath`) continua funcionando e não é substituído. O `app-paths.cjs` trata apenas de dados do usuário e assets, complementando o `paths.cjs` existente.

O `CliProcessManager.createCliEnv()` continua responsável por resolver o PATH de CLIs externas — essa é uma responsabilidade diferente (detecção de executáveis, não armazenamento de dados).

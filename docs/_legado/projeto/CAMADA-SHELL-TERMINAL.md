# Camada Adaptativa de Shell e Terminal

Status: concluido.

## Objetivo

Garantir que a execução de comandos e CLIs externas funcione de forma compatível com Linux, macOS e Windows.

---

## Módulo central: `shell-adapter.cjs`

Localização: `app/electron/core/shell-adapter.cjs`

### Funções exportadas

| Função | Descrição |
|--------|-----------|
| `detectDefaultShell(options?)` | Detecta o shell padrão do SO. Suporta override via `FELIXO_SHELL`. |
| `escapeShellArg(arg, platform?)` | Escapa argumentos para uso seguro em comandos shell. |
| `getTerminationStrategy(platform?)` | Retorna estratégia de terminação de processos por SO. |
| `buildSpawnOptions({ cwd, env })` | Gera opções de spawn compatíveis com cross-spawn. |
| `getPlatformInfo(platform?)` | Retorna informações e limitações conhecidas por SO. |

---

## Shell padrão por SO

| SO | Shell padrão | Fallback | Configuração manual |
|----|-------------|----------|---------------------|
| Linux | `$SHELL` ou `/bin/bash` | `/bin/bash` | `FELIXO_SHELL=/usr/bin/fish` |
| macOS | `$SHELL` ou `/bin/zsh` | `/bin/zsh` | `FELIXO_SHELL=/bin/bash` |
| Windows | `pwsh.exe` ou `cmd.exe` | `cmd.exe` | `FELIXO_SHELL=C:\...\pwsh.exe` |

---

## Diferenças de shell por SO

| Aspecto | Linux/macOS | Windows CMD | Windows PowerShell |
|---------|-------------|-------------|-------------------|
| Quoting | Single quotes `'arg'` | Double quotes `"arg"` | Double quotes ou backtick |
| Path separator | `:` | `;` | `;` |
| Process groups | `kill -PID` suportado | Não suportado | Não suportado |
| Variáveis | `$VAR` | `%VAR%` | `$env:VAR` |
| Pipe | `\|` | `\|` | `\|` |
| Escape | `\` ou `'...'` | `^` | `` ` `` |

---

## Estratégia de terminação de processos

| Plataforma | Pode matar grupo? | Método |
|------------|-------------------|--------|
| Linux | ✅ Sim | `process.kill(-pid, 'SIGTERM')` |
| macOS | ✅ Sim | `process.kill(-pid, 'SIGTERM')` |
| Windows | ❌ Não | `childProcess.kill('SIGTERM')` → traduzido para `TerminateProcess` |

O `CliProcessManager` já implementa essa diferenciação em `signalChildProcess()`.

---

## Spawn seguro

O Felixo AI Core usa `cross-spawn` para todas as invocações de CLI. O `cross-spawn` trata automaticamente:

- Resolução de executáveis `.cmd` e `.bat` no Windows.
- Quoting de argumentos por plataforma.
- Variáveis de ambiente.

O `buildSpawnOptions()` do `shell-adapter.cjs` complementa com:
- `detached: true` em Unix (para permitir kill de grupo).
- `windowsHide: true` em Windows (para não abrir janela de console).

---

## Paths com espaços

Todos os paths são tratados como strings opacas pelo `cross-spawn` e `path.join()`. O `escapeShellArg()` deve ser usado quando paths forem embutidos em strings de comando (ex: `shell -c "cd /path/com espaço && ..."`) — mas esse padrão é evitado quando possível em favor de `spawn(command, [args...], { cwd })`.

---

## Limitações conhecidas

| Limitação | SO | Impacto |
|-----------|-----|---------|
| ANSI colors podem não renderizar | Windows < 10 | Baixo — Terminal do Windows 10+ suporta |
| TTY interativo não disponível | Todos (spawn) | CLIs que exigem TTY podem não funcionar |
| Process group kill indisponível | Windows | Processos filhos podem sobreviver ao kill |
| `.exe` vs comando sem extensão | Windows | `cross-spawn` resolve automaticamente |

---

## Testes

Testes unitários em `app/electron/core/shell-adapter.test.cjs` cobrem:

- Detecção de shell em Linux, macOS e Windows.
- Override via `FELIXO_SHELL`.
- Escaping de argumentos com espaços e caracteres especiais.
- Estratégias de terminação por plataforma.
- Informações de plataforma.

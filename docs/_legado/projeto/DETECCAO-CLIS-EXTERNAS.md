# Detecção de CLIs Externas

Status: concluido.

## Objetivo

Permitir que o Felixo AI Core encontre e use CLIs externas instaladas no sistema, reportando status de disponibilidade de forma clara.

---

## Módulo: `cli-detector.cjs`

Localização: `app/electron/core/cli-detector.cjs`

### CLIs suportadas

| CLI | Comando | Categoria | URL de instalação |
|-----|---------|-----------|-------------------|
| Claude CLI | `claude` | ai-provider | https://docs.anthropic.com/en/docs/claude-code/overview |
| Codex CLI | `codex` | ai-provider | https://github.com/openai/codex |
| Gemini CLI | `gemini` | ai-provider | https://github.com/google-gemini/gemini-cli |
| Git | `git` | tool | https://git-scm.com/downloads |
| Node.js | `node` | runtime | https://nodejs.org/ |
| Python | `python3` | runtime | https://www.python.org/downloads/ |
| Ollama | `ollama` | ai-provider | https://ollama.ai/ |

### Funções exportadas

| Função | Descrição |
|--------|-----------|
| `detectCli(cliInfo, env?)` | Detecta uma CLI específica. Retorna nome, versão, path e status. |
| `detectAllClis(env?)` | Detecta todas as CLIs suportadas. |
| `detectProviderClis(env?)` | Detecta apenas CLIs de AI providers. |
| `formatDetectionSummary(results)` | Gera resumo legível com ✅/❌ por CLI. |
| `createCliNotFoundMessage(name)` | Mensagem amigável quando CLI não é encontrada. |
| `parseVersionFromOutput(output)` | Extrai versão de saída de `--version`. |
| `resolveCommandPath(command, env?)` | Resolve path completo de um executável no PATH. |

---

## Como funciona a detecção

1. Para cada CLI, executa `<command> --version` com timeout de 5 segundos.
2. Se o comando retornar com sucesso, a CLI é considerada **detectada**.
3. A versão é extraída da saída via regex.
4. O path completo é resolvido buscando no PATH do sistema.
5. Em Windows, tenta também aliases com extensão `.exe`, `.cmd`.

---

## Diferenças por SO

| Aspecto | Linux | macOS | Windows |
|---------|-------|-------|---------|
| Extensão do executável | Nenhuma | Nenhuma | `.exe`, `.cmd`, `.bat` |
| Instalação típica | npm, apt, snap, brew | brew, npm | npm, scoop, chocolatey, instalador |
| PATH padrão | `/usr/local/bin`, `~/.local/bin` | `/opt/homebrew/bin`, `/usr/local/bin` | `%APPDATA%/npm`, `C:\Program Files\nodejs` |

O `CliProcessManager.createCliEnv()` já adiciona candidatos de PATH comuns por SO. O `cli-detector` usa o PATH expandido para detecção.

---

## Mensagens amigáveis

Quando uma CLI não é encontrada, o app deve exibir:

> **Claude CLI não foi encontrado no sistema.**
> Para instalar, acesse: https://docs.anthropic.com/en/docs/claude-code/overview

Para CLIs desconhecidas:

> **A CLI "xyz" não foi encontrada no sistema.**
> Verifique se está instalada e disponível no PATH.

---

## Configuração manual

O usuário pode configurar paths extras via variável de ambiente:

```bash
FELIXO_CLI_PATHS=/custom/cli/path:/another/path
```

Ou futuramente via UI de configurações.

---

## Testes

Testes unitários em `app/electron/core/cli-detector.test.cjs` cobrem:

- Lista de CLIs suportadas tem campos obrigatórios.
- Parsing de versão em formatos variados.
- Mensagens de erro amigáveis para CLIs conhecidas e desconhecidas.
- Formatação do resumo de detecção.

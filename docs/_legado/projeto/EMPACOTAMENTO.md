# Empacotamento do App

Status: concluido.

## Objetivo

Documentar como o Felixo AI Core é empacotado para distribuição como aplicativo instalável.

---

## Ferramenta de empacotamento

O projeto usa **electron-builder** (v26.x) para gerar artefatos de instalação.

Configuração principal em `app/package.json` → campo `"build"`.

---

## Metadados do app

| Campo | Valor |
|-------|-------|
| App ID | `com.felixoverse.felixo-ai-core` |
| Nome do produto | `Felixo AI Core` |
| Copyright | `Copyright © 2026 Felipe Alcantara` |
| Autor | Felipe Alcantara |
| Repositório | https://github.com/Felipe-Alcantara/Felixo-AI-Core |
| Versão base | `0.1.0` |

---

## Artefatos por plataforma

### Linux

| Formato | Arquiteturas | Comando |
|---------|-------------|---------|
| AppImage | x64, arm64 | `npm run dist:linux` |
| .deb | x64 | `npm run dist:linux` |

Padrão de nome: `Felixo-AI-Core-{version}-{os}-{arch}.{ext}`

### Windows

| Formato | Arquiteturas | Comando |
|---------|-------------|---------|
| .exe (NSIS) | x64 | `npm run dist:win` |

Configuração NSIS:
- `oneClick: false` — mostra opções de instalação.
- `allowToChangeInstallationDirectory: true` — usuário pode escolher pasta.
- `perMachine: false` — instalação por usuário.

### macOS

| Formato | Arquiteturas | Comando |
|---------|-------------|---------|
| .dmg | x64, arm64 | `npm run dist:mac` |
| .zip | x64, arm64 | `npm run dist:mac` |

Categoria: `public.app-category.developer-tools`

---

## Arquivos incluídos no pacote

Definidos em `build.files`:

```json
[
  "dist/**/*",
  "electron/**/*",
  "package.json",
  "public/**/*"
]
```

O que está incluído:
- `dist/` — bundle Vite compilado (HTML, JS, CSS).
- `electron/` — todo o backend (main process, adapters, services).
- `package.json` — metadados e dependências.
- `public/` — assets estáticos (ícones, logos).

---

## Arquivos excluídos automaticamente

O electron-builder exclui por padrão:
- `node_modules` de devDependencies.
- Arquivos de teste (`*.test.cjs`).
- Arquivos de configuração de desenvolvimento.

### Exclusões de segurança obrigatórias

Estes arquivos **nunca** devem entrar no pacote:

| Arquivo/Padrão | Motivo |
|----------------|--------|
| `.env` | Pode conter tokens e chaves |
| `.env.*` | Variantes de ambiente |
| `*.log` | Logs podem conter dados sensíveis |
| `.git/` | Histórico do repositório |
| `docs/` | Documentação de desenvolvimento |
| `ai-clis/` | Scripts locais do desenvolvedor |
| `__pycache__/` | Cache Python |
| `.agents/`, `.claude/`, `.codex/`, `.sixth/` | Configs de IA do dev |
| `felixo-standards/` | Padrões internos |
| `plan` | Arquivo de planejamento |
| `start_app.py` | Script de desenvolvimento |
| `requirements.txt` | Dependências Python de dev |

O `.gitignore` do app (`app/.gitignore`) já exclui `node_modules`, `dist` e `release`.

---

## Scripts de empacotamento

| Script | O que faz |
|--------|-----------|
| `npm run build` | Compila TypeScript + Vite bundle |
| `npm run pack` | Build + electron-builder `--dir` (pasta local sem instalador) |
| `npm run dist` | Build + gera instaladores para o SO atual |
| `npm run dist:linux` | Build + instaladores Linux |
| `npm run dist:mac` | Build + instaladores macOS |
| `npm run dist:win` | Build + instaladores Windows |
| `npm run publish:github` | Build + publica no GitHub Releases |

---

## Publicação

O projeto publica releases no GitHub via `electron-builder --publish always`.

Provider de publicação:
```json
{
  "provider": "github",
  "owner": "Felipe-Alcantara",
  "repo": "Felixo-AI-Core",
  "releaseType": "release"
}
```

Requer `GH_TOKEN` como variável de ambiente.

---

## Processo local

Para testar empacotamento localmente:

```bash
cd app
npm run build         # compila
npm run pack          # gera pasta empacotada (sem instalador)
# Testar o executável em release/linux-unpacked/ (ou win-unpacked/, mac/)
```

Para gerar instalador completo:

```bash
npm run dist:linux    # gera AppImage + .deb
```

---

## Associação de arquivos (File Associations)

O app registra tipos de arquivo personalizados no sistema operacional. Ao instalar o Felixo AI Core, o SO associa automaticamente esses tipos ao app, permitindo abrir arquivos com duplo clique.

### Tipos registrados

| Extensão | Nome | Descrição | MIME Type | Role |
|----------|------|-----------|-----------|------|
| `.fxai` | Felixo AI Project | Arquivo de projeto | `application/x-felixo-project` | Editor |
| `.fxchat` | Felixo AI Chat | Chat exportado | `application/x-felixo-chat` | Viewer |
| `.fxworkflow` | Felixo AI Workflow | Workflow visual | `application/x-felixo-workflow` | Editor |

### Comportamento

- **Windows**: o instalador NSIS registra as extensões automaticamente.
- **Linux**: os MIME types são declarados no `.deb` e detectados via `xdg-mime`.
- **macOS**: as associações são declaradas no `Info.plist` do `.app`.

### Fluxo técnico

1. O usuário clica em um arquivo `.fxai`, `.fxchat` ou `.fxworkflow`.
2. O SO abre o Felixo AI Core (ou traz a janela existente para frente).
3. O main process (`main.cjs`) captura o caminho via:
   - `app.on('open-file')` no macOS.
   - `process.argv` no Windows/Linux.
4. O caminho é enviado ao renderer via IPC (`file:opened`).
5. O renderer processa o arquivo conforme a extensão.

### API IPC

| Canal | Direção | Descrição |
|-------|---------|-----------|
| `file:get-pending` | renderer → main | Consulta arquivo pendente de abertura |
| `file:opened` | main → renderer | Notifica abertura de arquivo associado |

### Preload API

```javascript
window.felixo.fileOpen.getPending()   // retorna { filePath, ext } ou null
window.felixo.fileOpen.onOpened(cb)   // callback ao abrir arquivo
```

---

## Ícone do app

O ícone deve estar em `app/public/brand/` nos formatos:
- `icon.png` (512x512 mínimo, para Linux)
- `icon.icns` (para macOS)
- `icon.ico` (para Windows)

Configuração no `build` do `package.json` via campo `icon` (se não definido, electron-builder busca automaticamente em `build/`).

---

## Cuidados

- Verificar artefato gerado antes de publicar release.
- Testar instalação/execução do artefato em SO limpo quando possível.
- Confirmar que assets (logo, ícones) estão incluídos.
- Confirmar que CLIs externas não foram empacotadas dentro do app.
- Confirmar que tokens/credenciais não foram incluídos.

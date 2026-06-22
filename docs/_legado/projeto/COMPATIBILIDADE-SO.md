# Matriz de Compatibilidade por Sistema Operacional

Status: concluido.

## Objetivo

Definir oficialmente quais sistemas operacionais são suportados, quais são experimentais e as limitações conhecidas de cada um.

---

## Matriz de suporte

| Plataforma | Arq. | Status | Build automático | Teste |
|-----------|------|--------|-----------------|-------|
| Linux x64 | x86_64 | ✅ Suportado oficialmente | ✅ CI + Release | Manual |
| Linux ARM64 | aarch64 | ✅ Suportado (AppImage) | ✅ Release | Manual |
| Windows x64 | x86_64 | ✅ Suportado oficialmente | ✅ CI + Release | Manual |
| macOS Apple Silicon | arm64 | ⚠️ Experimental | ✅ Release | Manual |
| macOS Intel | x86_64 | ⚠️ Experimental | ✅ Release | Manual |

---

## Artefatos gerados por plataforma

| Plataforma | Formato | Uso |
|-----------|---------|-----|
| Linux x64 | AppImage | Execução direta sem instalação |
| Linux x64 | .deb | Instalação via apt/dpkg |
| Linux ARM64 | AppImage | Execução direta sem instalação |
| Windows x64 | .exe (NSIS) | Instalador com opção de diretório |
| macOS | .dmg | Instalação drag-and-drop |
| macOS | .zip | Alternativa portátil |

---

## Checklist Linux

- [x] App roda via código-fonte com `python3 start_app.py`.
- [x] App roda via `npm run dev` direto.
- [x] App pode ser empacotado com `npm run dist:linux`.
- [x] Terminal integrado funciona (spawn via cross-spawn).
- [x] Git é detectado quando instalado.
- [x] Providers CLI (claude, codex, gemini) funcionam quando instalados.
- [x] Paths com espaços funcionam (path.join).
- [x] Permissões de execução no AppImage estão corretas.
- [x] Logs e cache são salvos em `~/.config/felixo-ai-core/`.
- [x] Auto-update funciona via AppImage.

### Limitações Linux

- .deb não suporta auto-update nativo (precisa reinstalar manualmente).
- Snap/Flatpak não são suportados atualmente.
- Wayland pode afetar posicionamento de janelas em algumas distros.

---

## Checklist Windows

- [x] App roda via código-fonte com `python start_app.py`.
- [x] App roda via `npm run dev` direto.
- [x] App pode ser empacotado com `npm run dist:win`.
- [x] Terminal integrado funciona com shell compatível (cmd/powershell).
- [x] Git é detectado quando instalado (git.exe no PATH).
- [x] Providers CLI são detectados quando instalados.
- [x] Paths com espaços funcionam.
- [x] Cancelamento de processos funciona (cross-spawn + TerminateProcess).
- [x] Logs e cache são salvos em `%APPDATA%/felixo-ai-core/`.
- [x] Auto-update funciona via NSIS installer.

### Limitações Windows

- SmartScreen alerta sobre app não assinado.
- Assinatura de código (code signing) não está implementada.
- CLIs instaladas via Scoop/Chocolatey podem não estar no PATH do sistema.
- Process group kill não disponível (processos filhos podem sobreviver).

---

## Checklist macOS

- [x] App roda via código-fonte com `python3 start_app.py`.
- [x] App roda via `npm run dev` direto.
- [x] App pode ser empacotado com `npm run dist:mac`.
- [x] Terminal integrado funciona (Zsh padrão).
- [x] Git é detectado quando instalado.
- [x] Providers CLI são detectados quando instalados.
- [x] Paths com espaços funcionam.
- [x] Logs e cache são salvos em `~/Library/Application Support/felixo-ai-core/`.
- [x] Auto-update funciona via DMG/ZIP.

### Limitações macOS

- Gatekeeper bloqueia apps não assinados/notarizados.
- Notarização (notarization) não está implementada.
- Apple Silicon e Intel geram builds separados.
- Permissões de acessibilidade podem ser necessárias.
- Homebrew instala em `/opt/homebrew` (Apple Silicon) vs `/usr/local` (Intel).

---

## Diferenças de comportamento por SO

| Aspecto | Linux | Windows | macOS |
|---------|-------|---------|-------|
| Shell padrão | Bash | CMD/PowerShell | Zsh |
| Separador de PATH | `:` | `;` | `:` |
| Kill de grupo de processo | ✅ `-pid` | ❌ Não suportado | ✅ `-pid` |
| Diretório de dados | `~/.config/` | `%APPDATA%/` | `~/Library/Application Support/` |
| Diretório de cache | `~/.cache/` | `%LOCALAPPDATA%/` | `~/Library/Caches/` |
| Diretório de logs | `~/.config/.../logs/` | `%APPDATA%/.../logs/` | `~/Library/Logs/` |
| Extensão de executável | nenhuma | `.exe`, `.cmd`, `.bat` | nenhuma |
| Auto-update suportado | ✅ AppImage | ✅ NSIS | ✅ DMG/ZIP |
| Assinatura de código | Não necessária | Recomendada (SmartScreen) | Necessária (Gatekeeper) |

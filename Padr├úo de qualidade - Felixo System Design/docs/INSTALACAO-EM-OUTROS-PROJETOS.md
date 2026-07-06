# Como Usar em Outros Projetos

Este documento reune todas as formas de baixar e sincronizar o **Felixo System Design** em outros projetos, do metodo mais usual ao mais especifico.

> Voltar ao [README](../README.md).

> **Sobre o submodulo `components-database/`**
> Este repositorio inclui o submodulo `components-database/` (banco de componentes UI). Ele **so e necessario** se voce quiser o banco de componentes — para os padroes `core/` e `guias/` ele e dispensavel. Por isso cada metodo abaixo traz duas variantes: **sem o submodulo** (mais leve) e **com o submodulo** (completo). ZIP e `npx degit` nunca trazem submodulos — para o banco de componentes, use uma das variantes `git`.

## 1. Sincronizar `Padrão de qualidade - Felixo System Design` com a versao mais recente (Recomendado)

Melhor opcao quando voce quer manter uma pasta local sem vinculo com o git original e poder rodar o comando quantas vezes quiser para atualizar.

**Linux / macOS / Git Bash (sem submodulo):**
```bash
tmp_dir="$(mktemp -d)" && git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git "$tmp_dir/repo" && rm -rf "$tmp_dir/repo/.git" && mkdir -p "./Padrão de qualidade - Felixo System Design" && rsync -a --delete "$tmp_dir/repo/" "./Padrão de qualidade - Felixo System Design/" && rm -rf "$tmp_dir"
```

**Linux / macOS / Git Bash (com submodulo):**
```bash
tmp_dir="$(mktemp -d)" && git clone --depth 1 --recurse-submodules https://github.com/Felipe-Alcantara/Felixo-System-Design.git "$tmp_dir/repo" && find "$tmp_dir/repo" -name .git -prune -exec rm -rf {} + && mkdir -p "./Padrão de qualidade - Felixo System Design" && rsync -a --delete "$tmp_dir/repo/" "./Padrão de qualidade - Felixo System Design/" && rm -rf "$tmp_dir"
```

**PowerShell (Windows) — sem submodulo:**
```powershell
$tmpDir = Join-Path $env:TEMP ("felixo-standards-" + [guid]::NewGuid())
git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git $tmpDir
Remove-Item -Recurse -Force (Join-Path $tmpDir ".git")
New-Item -ItemType Directory -Force -Path "./Padrão de qualidade - Felixo System Design" | Out-Null
robocopy $tmpDir "./Padrão de qualidade - Felixo System Design" /MIR | Out-Null
Remove-Item -Recurse -Force $tmpDir
```

**PowerShell (Windows) — com submodulo:**
```powershell
$tmpDir = Join-Path $env:TEMP ("felixo-standards-" + [guid]::NewGuid())
git clone --depth 1 --recurse-submodules https://github.com/Felipe-Alcantara/Felixo-System-Design.git $tmpDir
Get-ChildItem $tmpDir -Recurse -Force -Filter ".git" | Remove-Item -Recurse -Force
New-Item -ItemType Directory -Force -Path "./Padrão de qualidade - Felixo System Design" | Out-Null
robocopy $tmpDir "./Padrão de qualidade - Felixo System Design" /MIR | Out-Null
Remove-Item -Recurse -Force $tmpDir
```

**CMD (Windows) — sem submodulo:**
```cmd
set TMP_DIR=%TEMP%\felixo-standards-%RANDOM% && git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git %TMP_DIR% && rmdir /s /q %TMP_DIR%\.git && if not exist "Padrão de qualidade - Felixo System Design" mkdir "Padrão de qualidade - Felixo System Design" && robocopy %TMP_DIR% "Padrão de qualidade - Felixo System Design" /MIR >nul && rmdir /s /q %TMP_DIR%
```

**CMD (Windows) — com submodulo:**
```cmd
set TMP_DIR=%TEMP%\felixo-standards-%RANDOM% && git clone --depth 1 --recurse-submodules https://github.com/Felipe-Alcantara/Felixo-System-Design.git %TMP_DIR% && for /d /r %TMP_DIR% %G in (.git) do @if exist "%G" rmdir /s /q "%G" && if not exist "Padrão de qualidade - Felixo System Design" mkdir "Padrão de qualidade - Felixo System Design" && robocopy %TMP_DIR% "Padrão de qualidade - Felixo System Design" /MIR >nul && rmdir /s /q %TMP_DIR%
```

- **Use quando**: quer todos os arquivos como base independente, com atualizacao simples depois
- **Requisito**: Git
- **Vinculo com o git original?** Nao

### Comando global `felixo` (instalador multiplataforma)

Em vez de copiar a funcao na mao, use os instaladores em [`scripts/`](../scripts/). Eles registram o comando `felixo` no seu terminal com **logs coloridos, barra de loading e avisos de erro**. Depois de instalado, rode `felixo` em qualquer pasta para baixar a versao mais recente — **tudo, menos o submodulo** `components-database`. Use `felixo --with-submodules` (ou `-s`) para incluir tambem o banco de componentes.

**Qual script usar para o seu terminal:**

| Seu terminal | Sistemas | Script |
|--------------|----------|--------|
| **Bash** ou **Zsh** | Linux, macOS, Git Bash (Windows), WSL (Windows) | [`scripts/bash-zsh/install-felixo-bash-zsh.sh`](../scripts/bash-zsh/install-felixo-bash-zsh.sh) |
| **PowerShell** (5.1+ / 7+) | Windows, Linux, macOS | [`scripts/powershell/install-felixo-powershell.ps1`](../scripts/powershell/install-felixo-powershell.ps1) |
| **CMD** (Prompt classico) | Windows | [`scripts/cmd/install-felixo-cmd.cmd`](../scripts/cmd/install-felixo-cmd.cmd) |

> **Por que o CMD tem dois arquivos?** No Bash e no PowerShell o instalador
> *escreve a funcao `felixo` dentro do arquivo de config* (`.bashrc` / `$PROFILE`),
> entao um unico arquivo basta. No CMD nao existe esse mecanismo: um "comando"
> precisa ser um arquivo proprio numa pasta do PATH. Por isso a pasta `cmd/` tem dois:
> - [`scripts/cmd/install-felixo-cmd.cmd`](../scripts/cmd/install-felixo-cmd.cmd) — o **instalador** (voce roda uma vez). Copia o `felixo-command.cmd` para `%LOCALAPPDATA%\felixo` (como `felixo.cmd`) e adiciona ao PATH.
> - [`scripts/cmd/felixo-command.cmd`](../scripts/cmd/felixo-command.cmd) — o **comando `felixo`** em si (faz o clone/copia). **Nao e instalador e voce nao roda ele diretamente** — quem o executa e o `felixo` que voce digita depois de instalar.

**Bash / Zsh** (Linux, macOS, Git Bash, WSL):
```bash
git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git /tmp/felixo-setup
bash /tmp/felixo-setup/scripts/bash-zsh/install-felixo-bash-zsh.sh
# desinstalar: bash /tmp/felixo-setup/scripts/bash-zsh/install-felixo-bash-zsh.sh --uninstall
```

**PowerShell** (Windows / Linux / macOS):
```powershell
git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git $env:TEMP\felixo-setup
& "$env:TEMP\felixo-setup\scripts\powershell\install-felixo-powershell.ps1"
# desinstalar: & "$env:TEMP\felixo-setup\scripts\powershell\install-felixo-powershell.ps1" -Uninstall
```

**CMD** (Windows classico):
```cmd
git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git "%TEMP%\felixo-setup"
"%TEMP%\felixo-setup\scripts\cmd\install-felixo-cmd.cmd"
:: desinstalar: "%TEMP%\felixo-setup\scripts\cmd\install-felixo-cmd.cmd" --uninstall
```

Depois de instalar, **abra um novo terminal** e use:

```bash
felixo                   # baixa tudo, menos o submodulo components-database
felixo --with-submodules # inclui o banco de componentes
```

Ao terminar, o `felixo` mostra um **resumo do que mudou** — arquivos **novos**, **atualizados** e **removidos** (com a contagem e a lista completa, em cores). Assim voce ve exatamente o que foi sincronizado.

Os instaladores sao **idempotentes**: rodar de novo apenas atualiza a definicao do comando, sem duplicar.

> **Ja tinha o `felixo` instalado?** Rode o instalador de novo de tempos em tempos: a definicao do comando evolui junto com o repositorio (por exemplo, o caminho do submodulo de componentes ja mudou de nome), e reinstalar garante que o seu terminal use a versao atual.

---

## 2. Baixar o repositorio inteiro como ZIP

> **Submodulo:** o ZIP do GitHub **nunca** inclui o submodulo `components-database/` (limitacao da plataforma). Se precisar do banco de componentes, use o metodo 1 (com submodulo) ou o metodo 4.

**PowerShell (Windows):**
```powershell
Invoke-WebRequest -Uri "https://github.com/Felipe-Alcantara/Felixo-System-Design/archive/refs/heads/main.zip" -OutFile "felixo.zip"
Expand-Archive "felixo.zip" -DestinationPath .
Rename-Item "Felixo-System-Design-main" "Padrão de qualidade - Felixo System Design"
Remove-Item "felixo.zip"
```

**CMD (Windows):**
```cmd
curl -L https://github.com/Felipe-Alcantara/Felixo-System-Design/archive/refs/heads/main.zip -o felixo.zip
tar -xf felixo.zip
ren Felixo-System-Design-main "Padrão de qualidade - Felixo System Design"
del felixo.zip
```

**Linux / macOS:**
```bash
curl -L https://github.com/Felipe-Alcantara/Felixo-System-Design/archive/refs/heads/main.zip -o felixo.zip
unzip felixo.zip && mv Felixo-System-Design-main "Padrão de qualidade - Felixo System Design" && rm felixo.zip
```

---

## 3. Baixar com `npx degit`

> **Submodulo:** `degit` **nao** baixa submodulos. O comando abaixo traz `core/` e `guias/`, mas `components-database/` vem vazia. Para o banco de componentes, use o metodo 1 (com submodulo) ou o metodo 4.

```bash
npx degit Felipe-Alcantara/Felixo-System-Design "./Padrão de qualidade - Felixo System Design"
```

---

## 4. Clonar com `git`

**Sem submodulo** (apenas `core/` e `guias/`):
```bash
git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git "./Padrão de qualidade - Felixo System Design"
```

**Com submodulo** (inclui `components-database/`):
```bash
git clone --depth 1 --recurse-submodules https://github.com/Felipe-Alcantara/Felixo-System-Design.git "./Padrão de qualidade - Felixo System Design"
```

> Se ja clonou sem `--recurse-submodules` e quiser o submodulo depois, rode dentro do repositorio:
> ```bash
> git submodule update --init --recursive
> ```

---

## 5. Baixar apenas `guias/` com `npx degit`

> **Submodulo:** nao se aplica — `components-database/` fica fora de `guias/`.

```bash
npx degit Felipe-Alcantara/Felixo-System-Design/guias ./felixo-guias
```

---

## 6. Baixar apenas `core/` com `git sparse-checkout`

> **Submodulo:** nao se aplica — `components-database/` fica fora de `core/`.

```bash
mkdir felixo-core
cd felixo-core
git init
git remote add -f origin https://github.com/Felipe-Alcantara/Felixo-System-Design.git
git sparse-checkout init --no-cone
git sparse-checkout set core
git pull origin main
```

---

## 7. Baixar apenas `guias/` com `git sparse-checkout`

> **Submodulo:** nao se aplica — `components-database/` fica fora de `guias/`.

```bash
mkdir felixo-guias
cd felixo-guias
git init
git remote add -f origin https://github.com/Felipe-Alcantara/Felixo-System-Design.git
git sparse-checkout init --no-cone
git sparse-checkout set guias
git pull origin main
```

---

## 8. Clonar tudo e copiar so a pasta desejada

**Sem submodulo:**
```bash
git clone --depth 1 https://github.com/Felipe-Alcantara/Felixo-System-Design.git "./Padrão de qualidade - Felixo System Design"
```

**Com submodulo** (inclui `components-database/`):
```bash
git clone --depth 1 --recurse-submodules https://github.com/Felipe-Alcantara/Felixo-System-Design.git "./Padrão de qualidade - Felixo System Design"
```

Depois, copie manualmente a pasta desejada:

- `./Padrão de qualidade - Felixo System Design/core`
- `./Padrão de qualidade - Felixo System Design/guias`
- `./Padrão de qualidade - Felixo System Design/components-database` (se clonou com submodulo)

---

## Escolha Rapida por Cenario

| Cenario | Melhor opcao | Traz o submodulo? |
|---------|--------------|-------------------|
| Quero `core/` + `guias/` com atualizacao simples | sincronizacao sem `.git`, variante **sem submodulo** (metodo 1 / `felixo`) | Nao |
| Quero tudo, incluindo o banco de componentes | sincronizacao **com submodulo** (metodo 1 / `felixo -s`) | Sim |
| Quero tudo da forma mais simples | ZIP | Nao (ZIP nao suporta) |
| Quero tudo sem `.git` via terminal | `npx degit` | Nao (degit nao suporta) |
| Quero tudo e depois atualizar via git | `git clone` (com ou sem `--recurse-submodules`) | Depende da flag |
| Quero so `guias/` sem `git` | `npx degit` em `guias` | N/A |
| Quero so `guias/` com atualizacao futura | `git sparse-checkout` | N/A |
| Quero so `core/` com atualizacao futura | `git sparse-checkout` | N/A |
| Quero uma opcao universal | clone completo (`--recurse-submodules`) + copiar a pasta | Sim |

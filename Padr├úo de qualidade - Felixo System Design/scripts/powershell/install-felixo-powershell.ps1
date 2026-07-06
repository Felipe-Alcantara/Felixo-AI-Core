<#
.SYNOPSIS
  Instalador do comando global "felixo".

  >>> PARA QUAL TERMINAL <<<
    Shell:    PowerShell (Windows PowerShell 5.1+ ou PowerShell 7+)
    Sistemas: Windows, Linux, macOS
    Use os outros instaladores se o seu terminal for:
      - Bash ou Zsh (Linux, macOS, Git Bash, WSL) -> bash-zsh/install-felixo-bash-zsh.sh
      - CMD (Prompt classico do Windows)          -> cmd/install-felixo-cmd.cmd

.DESCRIPTION
  Adiciona a funcao "felixo" ao seu $PROFILE do PowerShell. Depois de instalado,
  digite "felixo" em qualquer sessao para baixar a versao mais recente do
  repositorio Felixo System Design — tudo, MENOS o submodulo components-database.
  Use "felixo -WithSubmodules" (ou "-s") para incluir o banco de componentes.

.PARAMETER Uninstall
  Remove a funcao "felixo" do $PROFILE.

.EXAMPLE
  .\install-felixo-powershell.ps1
  .\install-felixo-powershell.ps1 -Uninstall

.NOTES
  Requisitos: PowerShell 5.1+ e git no PATH.
#>
[CmdletBinding()]
param(
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$RepoUrl    = 'https://github.com/Felipe-Alcantara/Felixo-System-Design.git'
$DestName   = 'Padrão de qualidade - Felixo System Design'
$BlockBegin = '# >>> felixo command (managed by install-felixo.ps1) >>>'
$BlockEnd   = '# <<< felixo command (managed by install-felixo.ps1) <<<'

function Write-Info  ($m) { Write-Host "[felixo-install] $m"   -ForegroundColor Cyan }
function Write-Ok    ($m) { Write-Host "[felixo-install OK] $m" -ForegroundColor Green }
function Write-Warn2 ($m) { Write-Host "[felixo-install !] $m"  -ForegroundColor Yellow }
function Write-Err2  ($m) { Write-Host "[felixo-install X] $m"  -ForegroundColor Red }

# Bloco com a definicao da funcao felixo (colorida, com barra de loading).
$FelixoBlock = @"
$BlockBegin
function felixo {
    [CmdletBinding()]
    param([switch]`$WithSubmodules, [Alias('s')][switch]`$s, [switch]`$Help)

    `$repoUrl = '$RepoUrl'
    `$dest    = Join-Path (Get-Location) '$DestName'

    function _flog  (`$m) { Write-Host "[felixo] `$m"   -ForegroundColor Cyan }
    function _fok   (`$m) { Write-Host "[felixo OK] `$m" -ForegroundColor Green }
    function _fwarn (`$m) { Write-Host "[felixo !] `$m"  -ForegroundColor Yellow }
    function _ferr  (`$m) { Write-Host "[felixo X] `$m"  -ForegroundColor Red }

    if (`$Help) {
        _flog 'Uso: felixo [-WithSubmodules|-s]'
        _flog '  (sem flag)        baixa core/ e guias/'
        _flog '  -WithSubmodules   inclui o banco de componentes'
        return
    }

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        _ferr 'git nao encontrado no PATH. Instale o Git e tente novamente.'
        return
    }

    `$withSub = `$WithSubmodules.IsPresent -or `$s.IsPresent
    `$cloneArgs = @('clone', '--depth', '1', '--quiet')
    if (`$withSub) {
        `$cloneArgs += '--recurse-submodules'
        _flog 'Modo completo: incluindo submodulo components-database.'
    }

    _flog "Sincronizando com `$repoUrl"
    _flog "Destino: `$dest"

    `$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
    `$repoTmp = Join-Path `$tmpDir 'repo'
    New-Item -ItemType Directory -Force -Path `$tmpDir | Out-Null
    `$cloneArgs += @(`$repoUrl, `$repoTmp)

    try {
        # Clone em background com barra de loading indeterminada.
        `$proc = Start-Process -FilePath 'git' -ArgumentList `$cloneArgs -NoNewWindow -PassThru
        `$bw = 24; `$pos = 0; `$dir = 1
        while (-not `$proc.HasExited) {
            `$bar = (0..(`$bw-1) | ForEach-Object { if (`$_ -eq `$pos) { '#' } else { '-' } }) -join ''
            Write-Host ("`r[felixo] Clonando [`$bar]") -NoNewline -ForegroundColor Cyan
            `$pos += `$dir
            if (`$pos -ge (`$bw-1)) { `$dir = -1 } elseif (`$pos -le 0) { `$dir = 1 }
            Start-Sleep -Milliseconds 80
        }
        Write-Host ("`r" + (' ' * (`$bw + 22)) + "`r") -NoNewline
        if (`$proc.ExitCode -ne 0) {
            _ferr "Falha ao clonar (codigo `$(`$proc.ExitCode)). Verifique a conexao e o acesso a `$repoUrl."
            return
        }
        _fok 'Repositorio clonado.'

        `$sha = (git -C `$repoTmp rev-parse --short HEAD 2>`$null)
        if (-not `$sha) { _fwarn 'Nao foi possivel ler o SHA do commit.'; `$sha = '?' }

        Get-ChildItem -Path `$repoTmp -Recurse -Force -Filter '.git' | Remove-Item -Recurse -Force
        # Sem o modo completo, remove a pasta do submodulo (fica vazia no clone raso).
        if (-not `$withSub) {
            `$subPath = Join-Path `$repoTmp 'components-database'
            if (Test-Path `$subPath) { Remove-Item -Recurse -Force `$subPath }
        }
        New-Item -ItemType Directory -Force -Path `$dest | Out-Null

        _flog 'Aplicando arquivos...'

        # Classifica as mudancas (novo / atualizado / removido) comparando o
        # destino atual com a nova versao ANTES de aplicar.
        function _relmap(`$root) {
            `$map = @{}
            if (Test-Path `$root) {
                Get-ChildItem -Path `$root -Recurse -File -Force | ForEach-Object {
                    `$rel = `$_.FullName.Substring(`$root.Length).TrimStart('\','/')
                    `$map[`$rel] = (Get-FileHash -Path `$_.FullName -Algorithm MD5).Hash
                }
            }
            `$map
        }
        `$srcMap = _relmap `$repoTmp
        `$dstMap = _relmap `$dest
        `$novo = @(); `$upd = @(); `$del = @()
        foreach (`$k in `$srcMap.Keys) {
            if (-not `$dstMap.ContainsKey(`$k)) { `$novo += `$k }
            elseif (`$dstMap[`$k] -ne `$srcMap[`$k]) { `$upd += `$k }
        }
        foreach (`$k in `$dstMap.Keys) { if (-not `$srcMap.ContainsKey(`$k)) { `$del += `$k } }

        # Aplica os arquivos (espelhando o destino).
        if (Get-Command robocopy -ErrorAction SilentlyContinue) {
            `$null = robocopy `$repoTmp `$dest /MIR /NFL /NDL /NJH /NJS /NP
            if (`$LASTEXITCODE -ge 8) { _ferr 'Falha ao sincronizar os arquivos (robocopy).'; return }
        } else {
            Get-ChildItem -Path `$dest -Force | Remove-Item -Recurse -Force
            Copy-Item -Path (Join-Path `$repoTmp '*') -Destination `$dest -Recurse -Force
        }

        `$total = `$novo.Count + `$upd.Count + `$del.Count
        if (`$total -gt 0) {
            Write-Host ("[felixo OK] Atualizado para `$sha`: `$total mudanca(s) -> ") -NoNewline -ForegroundColor Green
            Write-Host ("+`$(`$novo.Count) novo(s)") -NoNewline -ForegroundColor Green
            Write-Host ', ' -NoNewline
            Write-Host ("~`$(`$upd.Count) atualizado(s)") -NoNewline -ForegroundColor Yellow
            Write-Host ', ' -NoNewline
            Write-Host ("-`$(`$del.Count) removido(s)") -ForegroundColor Red
            foreach (`$f in `$novo) { Write-Host ('  + novo:       ' + `$f) -ForegroundColor Green }
            foreach (`$f in `$upd)  { Write-Host ('  ~ atualizado: ' + `$f) -ForegroundColor Yellow }
            foreach (`$f in `$del)  { Write-Host ('  - removido:   ' + `$f) -ForegroundColor Red }
        } else {
            _fok "Ja estava atualizado em `$sha. Nenhuma mudanca."
        }
        _fok "Concluido em `$dest"
    }
    catch {
        _ferr "Erro inesperado: `$(`$_.Exception.Message)"
    }
    finally {
        if (Test-Path `$tmpDir) { Remove-Item -Recurse -Force `$tmpDir -ErrorAction SilentlyContinue }
    }
}
$BlockEnd
"@

function Get-ProfilePath {
    if ($PROFILE -and $PROFILE.CurrentUserAllHosts) { return $PROFILE.CurrentUserAllHosts }
    return $PROFILE
}

function Remove-FelixoBlock([string]$path) {
    if (-not (Test-Path $path)) { return }
    $content = Get-Content -Path $path -Raw
    $pattern = [regex]::Escape($BlockBegin) + '.*?' + [regex]::Escape($BlockEnd)
    $cleaned = [regex]::Replace($content, $pattern, '', 'Singleline')
    $cleaned = $cleaned.TrimEnd() + "`r`n"
    Set-Content -Path $path -Value $cleaned -NoNewline
}

function Invoke-Install {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Err2 'git nao encontrado no PATH. Instale o Git e rode novamente.'
        exit 1
    }
    $profilePath = Get-ProfilePath
    $dir = Split-Path -Parent $profilePath
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    if (-not (Test-Path $profilePath)) { New-Item -ItemType File -Force -Path $profilePath | Out-Null }

    $action = 'instalado'
    if ((Get-Content -Path $profilePath -Raw -ErrorAction SilentlyContinue) -match [regex]::Escape($BlockBegin)) {
        $action = 'atualizado'
        Remove-FelixoBlock $profilePath
    }

    Add-Content -Path $profilePath -Value ("`r`n" + $FelixoBlock)

    Write-Ok   "Comando `"felixo`" $action em: $profilePath"
    Write-Info "Pasta de destino: $DestName"
    Write-Info "Abra um novo terminal ou rode: . `"$profilePath`""
    Write-Info "Depois, em qualquer pasta:"
    Write-Info "  felixo                  -> baixa core/ e guias/"
    Write-Info "  felixo -WithSubmodules  -> inclui o banco de componentes"
}

function Invoke-Uninstall {
    $profilePath = Get-ProfilePath
    if ((Test-Path $profilePath) -and ((Get-Content -Path $profilePath -Raw) -match [regex]::Escape($BlockBegin))) {
        Remove-FelixoBlock $profilePath
        Write-Ok "Comando `"felixo`" removido de: $profilePath"
        Write-Info 'Abra um novo terminal para aplicar.'
    } else {
        Write-Warn2 "Nenhuma instalacao do comando `"felixo`" encontrada em: $profilePath"
    }
}

if ($Uninstall) { Invoke-Uninstall } else { Invoke-Install }

<#
.SYNOPSIS
  Tira o Felixo AI Core de uma cópia instalada em %TEMP% e o reinstala no lugar
  normal (%LOCALAPPDATA%\Programs), para o usuário atual.

.DESCRIPTION
  Corrige o estado deixado por um release smoke local antigo: o instalador NSIS,
  rodado com /S /D=%TEMP%\felixo-release-smoke-* num shell elevado, registrou a
  cópia de teste como A instalação do Felixo (desinstalação e InstallLocation em
  HKLM, atalhos no Menu Iniciar e na Área de Trabalho pública). Daí em diante o
  app do dia a dia, o auto-update e o "iniciar com o sistema" usavam a pasta
  temporária. Ver docs/projeto/IA.md, entrada de 05/10/2026.

  Por padrão o script SÓ SIMULA: mostra o que faria e não muda nada.
  Com -Executar ele aplica. Canvas, perfis e banco ficam em
  %APPDATA%\felixo-ai-core e não são tocados.

  Passos com -Executar:
    1. Recusa continuar se o Felixo estiver aberto (nunca encerra o app).
    2. Roda o desinstalador da cópia em %TEMP% (exige administrador quando a
       cópia foi registrada para todos os usuários, em HKLM).
    3. Remove o item de login e os atalhos que ainda apontem para %TEMP%.
    4. Instala o instalador oficial com /currentuser — sem isso, rodando
       elevado, o NSIS repetiria a instalação "para todos os usuários".
    5. Confere que a nova instalação mora fora de %TEMP%.

.PARAMETER Executar
  Aplica as mudanças. Sem ele, só simula.

.PARAMETER Instalador
  Instalador oficial (.exe) a usar. Padrão: o último baixado pelo auto-update,
  em %LOCALAPPDATA%\felixo-ai-core-updater\installer.exe.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File migrar-instalacao-de-temp.ps1
  (simulação)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File migrar-instalacao-de-temp.ps1 -Executar
#>
[CmdletBinding()]
param(
  [switch]$Executar,
  [string]$Instalador = (Join-Path $env:LOCALAPPDATA 'felixo-ai-core-updater\installer.exe')
)

$ErrorActionPreference = 'Stop'
$NomeDoApp = 'Felixo AI Core'
$ItemDeLogin = 'electron.app.Felixo AI Core'

function Resolver-Caminho([string]$caminho) {
  # O Windows mistura nome curto 8.3 (FELIPE~1) e nome longo; comparar texto
  # cru falharia. GetFullPath + Get-Item devolvem a forma longa quando existe.
  if (-not $caminho) { return $null }
  $limpo = $caminho.Trim('"')
  try { return (Get-Item -LiteralPath $limpo -ErrorAction Stop).FullName } catch { return [IO.Path]::GetFullPath($limpo) }
}

$PastasTemporarias = @($env:TEMP, $env:TMP, [IO.Path]::GetTempPath()) |
  Where-Object { $_ } | ForEach-Object { (Resolver-Caminho $_).TrimEnd('\') } | Select-Object -Unique

function Esta-Em-Temp([string]$caminho) {
  $resolvido = Resolver-Caminho $caminho
  if (-not $resolvido) { return $false }
  foreach ($pasta in $PastasTemporarias) {
    if ($resolvido.StartsWith($pasta + '\', [StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return $false
}

function Passo([string]$texto) { Write-Host "-> $texto" }
function Acao([string]$texto, [scriptblock]$bloco) {
  if ($Executar) { Write-Host "   [executando] $texto"; & $bloco } else { Write-Host "   [simulação] $texto" }
}

Write-Host ($(if ($Executar) { '== Migração do Felixo AI Core (EXECUTANDO) ==' } else { '== Migração do Felixo AI Core (SIMULAÇÃO — nada será alterado) ==' }))

# 1. App aberto?
Passo 'Conferindo se o Felixo está aberto'
$abertos = @(Get-Process -Name $NomeDoApp -ErrorAction SilentlyContinue)
if ($abertos.Count -gt 0) {
  Write-Host "   O Felixo está aberto ($($abertos.Count) processo(s)). Feche todas as janelas antes de executar."
  if ($Executar) { exit 2 }
}

# 2. Instalações registradas que moram em %TEMP%
Passo 'Procurando instalações registradas em pasta temporária'
$raizes = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
)
$registros = foreach ($raiz in $raizes) {
  Get-ChildItem $raiz -ErrorAction SilentlyContinue | ForEach-Object {
    $v = Get-ItemProperty $_.PSPath
    if ($v.DisplayName -like "$NomeDoApp*") {
      $desinstalador = if ($v.UninstallString -match '^"([^"]+)"') { $Matches[1] } else { ($v.UninstallString -split ' /')[0] }
      [pscustomobject]@{
        Chave = $_.PSPath
        Versao = $v.DisplayVersion
        Desinstalador = $desinstalador
        TodosOsUsuarios = $raiz -like 'HKLM:*'
        EmTemp = Esta-Em-Temp $desinstalador
      }
    }
  }
}
$emTemp = @($registros | Where-Object EmTemp)
$normais = @($registros | Where-Object { -not $_.EmTemp })
foreach ($r in $registros) {
  Write-Host ("   {0} {1} — {2} — {3}" -f $NomeDoApp, $r.Versao, $(if ($r.EmTemp) { 'EM %TEMP%' } else { 'fora de %TEMP%' }), $r.Desinstalador)
}
if ($emTemp.Count -eq 0) { Write-Host '   Nenhuma instalação em %TEMP% registrada.' }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (($emTemp | Where-Object TodosOsUsuarios) -and -not $admin) {
  Write-Host '   A cópia em %TEMP% foi registrada para todos os usuários: rode este script como administrador.'
  if ($Executar) { exit 3 }
}

foreach ($r in $emTemp) {
  $argumentos = @('/S') + $(if ($r.TodosOsUsuarios) { @('/allusers') } else { @('/currentuser') })
  Acao "Desinstalar '$($r.Desinstalador)' $($argumentos -join ' ')" {
    if (-not (Test-Path -LiteralPath $r.Desinstalador)) { throw "Desinstalador não encontrado: $($r.Desinstalador)" }
    $p = Start-Process -FilePath $r.Desinstalador -ArgumentList $argumentos -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "O desinstalador terminou com código $($p.ExitCode)." }
  }
}

# 3. Item de login e atalhos que ainda apontam para %TEMP%
Passo 'Procurando item de login e atalhos apontando para %TEMP%'
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$valorLogin = (Get-ItemProperty $run -ErrorAction SilentlyContinue).$ItemDeLogin
if ($valorLogin -and (Esta-Em-Temp ($valorLogin -replace '^"([^"]+)".*$', '$1'))) {
  Acao "Remover o item de login '$ItemDeLogin' -> $valorLogin" { Remove-ItemProperty -Path $run -Name $ItemDeLogin }
} elseif ($valorLogin) {
  Write-Host "   Item de login já aponta para fora de %TEMP%: $valorLogin"
} else {
  Write-Host '   Sem item de login do Felixo.'
}

$shell = New-Object -ComObject WScript.Shell
$pastasDeAtalho = @(
  [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'),
  [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('CommonPrograms')
) | Where-Object { $_ -and (Test-Path $_) }
foreach ($pasta in $pastasDeAtalho) {
  Get-ChildItem $pasta -Filter "$NomeDoApp*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $alvo = $shell.CreateShortcut($_.FullName).TargetPath
    if (Esta-Em-Temp $alvo) {
      $atalho = $_.FullName
      Acao "Remover atalho '$atalho' -> $alvo" { Remove-Item -LiteralPath $atalho -Force }
    }
  }
}

# 4. Instalação oficial, sempre para o usuário atual
Passo 'Instalação oficial'
if ($normais.Count -gt 0) {
  Write-Host '   Já existe instalação fora de %TEMP%; pulando a reinstalação.'
} elseif (-not (Test-Path -LiteralPath $Instalador)) {
  Write-Host "   Instalador não encontrado: $Instalador. Baixe o mais recente em https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases e passe -Instalador <caminho>."
  if ($Executar) { exit 4 }
} else {
  $versao = (Get-Item -LiteralPath $Instalador).VersionInfo.ProductVersion
  Acao "Instalar '$Instalador' ($versao) com /S /currentuser" {
    $p = Start-Process -FilePath $Instalador -ArgumentList @('/S', '/currentuser') -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "O instalador terminou com código $($p.ExitCode)." }
  }
}

# 5. Conferência
if ($Executar) {
  Passo 'Conferindo o resultado'
  $exe = Join-Path $env:LOCALAPPDATA "Programs\$NomeDoApp\$NomeDoApp.exe"
  if (-not (Test-Path -LiteralPath $exe)) { Write-Host "   ATENÇÃO: $exe não existe."; exit 5 }
  if (Esta-Em-Temp $exe) { Write-Host '   ATENÇÃO: a nova instalação ainda está em %TEMP%.'; exit 5 }
  Write-Host "   OK: $exe"
  Write-Host '   Agora: abra o Felixo por esse caminho, religue "Iniciar com o sistema" em Configurações e reinicie o Windows para conferir.'
} else {
  Write-Host ''
  Write-Host 'Nada foi alterado. Feche o Felixo e rode de novo com -Executar (como administrador, se indicado acima).'
}

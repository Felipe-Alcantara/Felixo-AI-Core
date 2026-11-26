# Roda a migração inteira contra uma máquina falsa numa pasta temporária:
#   powershell -NoProfile -ExecutionPolicy Bypass -File migrar-instalacao-de-temp.test.ps1
# Registro, processos e instaladores são funções falsas (função do chamador vence
# cmdlet); nada da instalação real é lido ou alterado.
param([string]$Script = (Join-Path $PSScriptRoot 'migrar-instalacao-de-temp.ps1'))
$ErrorActionPreference = 'Stop'

$raiz = Join-Path ([IO.Path]::GetTempPath()) "migracao-teste-$([guid]::NewGuid().ToString('N'))"
$env:TEMP = $env:TMP = Join-Path $raiz 'Temp'
$env:APPDATA = Join-Path $raiz 'Roaming'
$env:LOCALAPPDATA = Join-Path $raiz 'Local'
$velho = Join-Path $env:TEMP 'felixo-release-smoke-x\Felixo AI Core\Felixo AI Core.exe'
$novo = Join-Path $env:LOCALAPPDATA 'Programs\Felixo AI Core\Felixo AI Core.exe'
$instalador = Join-Path $env:LOCALAPPDATA 'felixo-ai-core-updater\installer.exe'
$barra = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'
foreach ($arquivo in $velho, $instalador, (Join-Path $env:APPDATA 'felixo-ai-core\database\banco.db')) {
  New-Item -ItemType Directory -Force (Split-Path $arquivo) | Out-Null
  Set-Content -LiteralPath $arquivo 'falso'
}
New-Item -ItemType Directory -Force $barra | Out-Null
$wsh = New-Object -ComObject WScript.Shell
$pin = $wsh.CreateShortcut("$barra\Felixo AI Core.lnk"); $pin.TargetPath = $velho; $pin.Save()

$global:chamadas = New-Object System.Collections.ArrayList
$global:leituras = 0
$global:velhoExe = $velho
$global:novoExe = $novo
$desinstalador = Join-Path (Split-Path $velho) 'Uninstall Felixo AI Core.exe'

# O app "fecha" depois de duas leituras.
function Get-Process { $global:leituras++; if ($global:leituras -le 2) { [pscustomobject]@{ ProcessName = 'Felixo AI Core'; Path = $global:velhoExe } } }
function Start-Sleep { }
function Get-ChildItem {
  if ($args[0] -like 'HKCU:*') { return [pscustomobject]@{ PSPath = 'falso' } }
  if ($args[0] -like 'HKLM:*') { return }
  Microsoft.PowerShell.Management\Get-ChildItem @args
}
function Get-ItemProperty {
  if ($args[0] -eq 'falso') { return [pscustomobject]@{ DisplayName = 'Felixo AI Core 1'; DisplayVersion = '1'; UninstallString = "`"$desinstalador`" /currentuser" } }
  [pscustomobject]@{ 'electron.app.Felixo AI Core' = "`"$global:velhoExe`"" }
}
function Remove-ItemProperty { [void]$global:chamadas.Add('remove-login') }
function Set-ItemProperty($Path, $Name, $Value) { [void]$global:chamadas.Add("login=$Value") }
function Remove-Item { param($LiteralPath, [switch]$Force) [void]$global:chamadas.Add("remove-atalho=$LiteralPath") }
function Start-Process {
  param($FilePath, $ArgumentList, [switch]$Wait, [switch]$PassThru)
  [void]$global:chamadas.Add("processo=$FilePath $($ArgumentList -join ' ')")
  if ($FilePath -like '*Uninstall*') { Microsoft.PowerShell.Management\Remove-Item -LiteralPath $global:velhoExe }
  elseif ($FilePath -ne 'explorer.exe') {
    New-Item -ItemType Directory -Force (Split-Path $global:novoExe) | Out-Null
    Set-Content -LiteralPath $global:novoExe 'falso'
  }
  [pscustomobject]@{ ExitCode = 0 }
}
Set-Content -LiteralPath $desinstalador 'falso'

$global:LASTEXITCODE = 0
try { & $Script -Executar -Aguardar -Reabrir *> (Join-Path $raiz 'saida.txt') } finally { try { Stop-Transcript | Out-Null } catch {} }

$falhas = 0
function Confere($nome, $condicao) { if ($condicao) { "ok    $nome" } else { "FALHA $nome"; $script:falhas++ } }
$tudo = $global:chamadas -join "`n"
Confere 'esperou o app fechar antes de agir' ($global:leituras -ge 5)
Confere 'desinstala mantendo os atalhos' ($tudo -like '*--keep-shortcuts /currentuser*')
Confere 'instala a partir da cópia do instalador' ($tudo -like '*felixo-ai-core-migracao\installer.exe /S /currentuser*')
Confere 'religa o iniciar com o sistema na instalação nova' ($global:chamadas -contains "login=`"$novo`"")
Confere 'aponta o ícone da barra para a instalação nova' ($wsh.CreateShortcut("$barra\Felixo AI Core.lnk").TargetPath -eq $novo)
Confere 'reabre pelo Explorer' ($tudo -like '*processo=explorer.exe*')
Confere 'copia o banco' ([bool](Microsoft.PowerShell.Management\Get-ChildItem "$env:APPDATA\felixo-ai-core-migracao\database-*\banco.db" -ErrorAction SilentlyContinue))
Confere 'não remove nada fora da pasta falsa' (-not ($global:chamadas | Where-Object { $_ -like 'remove-atalho=*' -and $_ -notlike "*$raiz*" }))
if ($falhas) { Get-Content (Join-Path $raiz 'saida.txt'); "$falhas falha(s). Pasta: $raiz"; exit 1 }
'Tudo certo.'

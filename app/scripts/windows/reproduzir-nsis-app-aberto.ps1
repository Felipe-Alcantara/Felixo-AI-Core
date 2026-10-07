<#
.SYNOPSIS
  Reproduz o instalador NSIS silencioso que não avança com o Felixo aberto e
  deixa processo elevado (task 3e291f95497e81058292f38d63a3034c).

.DESCRIPTION
  Só roda em runner descartável (GITHUB_ACTIONS/CI): cada cenário instala o
  Felixo AI Core, abre o app, roda um segundo instalador e depois mata e
  desinstala tudo. Numa máquina com trabalho aberto isso fecharia o app — é
  exatamente a hipótese investigada.

  Para cada cenário mede: se o instalador terminou dentro do limite, código de
  saída, tempo, CPU dos processos presos nos últimos 20 s, texto das janelas
  que eles mostram (MessageBox), arquivos no destino, registro e se o app
  continuou aberto. Grava relatorio.json e uma captura de tela por cenário
  preso em -Saida.

  Com -Verificar vira gate (smoke do Release): sai com 1 se algum cenário
  escolhido não terminou, saiu com código diferente de 0, deixou o app aberto,
  deixou processo de instalador vivo ou deu erro. Use com cenários que DEVEM
  passar com o instalador novo (I e L, que travavam antes da correção).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$Base,
  [Parameter(Mandatory)] [string]$Novo,
  [Parameter(Mandatory)] [string]$Saida,
  [int]$LimiteSegundos = 180,
  [string[]]$Cenarios = @(),
  [switch]$Verificar
)

$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -and $env:CI -ne 'true') {
  throw 'Recusado: este roteiro instala, abre, mata e desinstala o Felixo. Só roda em runner descartável (GITHUB_ACTIONS/CI).'
}

$Nome = 'Felixo AI Core'
$Guid = '38f15219-ae73-5ead-9234-72a65f4ddfd3'
$Trabalho = 'C:\fx'
New-Item -ItemType Directory -Force -Path $Saida, $Trabalho | Out-Null
# Usuário padrão do cenário G precisa ler os instaladores e escrever no destino.
& icacls $Trabalho /grant '*S-1-5-32-545:(OI)(CI)M' | Out-Null

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class JanelasFelixo {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, StringBuilder l, uint flags, uint timeout, out IntPtr result);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern uint GetLongPathName(string s, StringBuilder l, uint n);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern uint GetShortPathName(string s, StringBuilder l, uint n);

  // WM_GETTEXT direto: GetWindowText não lê controles de outro processo.
  static string Texto(IntPtr h) {
    var sb = new StringBuilder(2048);
    IntPtr r;
    SendMessageTimeout(h, 0x000D, (IntPtr)sb.Capacity, sb, 0x0002, 1000, out r);
    return sb.ToString();
  }

  public static string[] Listar(int[] pids) {
    var alvo = new HashSet<uint>();
    foreach (var p in pids) alvo.Add((uint)p);
    var saida = new List<string>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (!alvo.Contains(pid)) return true;
      var classe = new StringBuilder(256);
      GetClassName(h, classe, 256);
      var filhos = new List<string>();
      EnumChildWindows(h, delegate (IntPtr hc, IntPtr lc) {
        var t = Texto(hc);
        if (t.Length > 0) filhos.Add(t.Replace("\r", " ").Replace("\n", " "));
        return true;
      }, IntPtr.Zero);
      saida.Add(String.Format("pid={0} classe={1} visivel={2} titulo=\"{3}\" textos=\"{4}\"",
        pid, classe, IsWindowVisible(h), Texto(h), String.Join(" | ", filhos)));
      return true;
    }, IntPtr.Zero);
    return saida.ToArray();
  }

  public static string Longo(string p) {
    var sb = new StringBuilder(1024);
    return GetLongPathName(p, sb, 1024) > 0 ? sb.ToString() : p;
  }

  public static string Curto(string p) {
    var sb = new StringBuilder(1024);
    return GetShortPathName(p, sb, 1024) > 0 ? sb.ToString() : p;
  }
}
'@

$NomesDeInstalador = @((Split-Path $Base -Leaf), (Split-Path $Novo -Leaf), 'old-uninstaller.exe', "Uninstall $Nome.exe") |
  Select-Object -Unique

function Processos-Do-App { @(Get-CimInstance Win32_Process -Filter "Name='$Nome.exe'") }

function Pids-Do-Instalador([int]$raiz) {
  $todos = @(Get-CimInstance Win32_Process)
  $pids = [System.Collections.Generic.HashSet[int]]::new()
  $fila = [System.Collections.Generic.Queue[int]]::new()
  $fila.Enqueue($raiz)
  while ($fila.Count -gt 0) {
    $atual = $fila.Dequeue()
    if (-not $pids.Add($atual)) { continue }
    foreach ($filho in $todos | Where-Object { $_.ParentProcessId -eq $atual }) { $fila.Enqueue([int]$filho.ProcessId) }
  }
  # Instância elevada do UAC ou desinstalador antigo que sobreviveu ao pai.
  foreach ($p in $todos | Where-Object { $NomesDeInstalador -contains $_.Name }) { [void]$pids.Add([int]$p.ProcessId) }
  @($todos | Where-Object { $pids.Contains([int]$_.ProcessId) } | ForEach-Object { [int]$_.ProcessId })
}

function Cpu-De([int[]]$pids) {
  $total = 0.0
  foreach ($p in Get-CimInstance Win32_Process | Where-Object { $pids -contains [int]$_.ProcessId }) {
    $total += ([double]$p.KernelModeTime + [double]$p.UserModeTime) / 1e7
  }
  [math]::Round($total, 2)
}

function Parar-Pids([int[]]$pids) {
  $falhas = @()
  foreach ($id in $pids) {
    try { Stop-Process -Id $id -Force -ErrorAction Stop } catch { $falhas += "pid $id`: $($_.Exception.Message)" }
  }
  $falhas
}

function Contar-Arquivos([string]$pasta) {
  if (-not (Test-Path -LiteralPath $pasta)) { return 0 }
  @(Get-ChildItem -LiteralPath $pasta -Recurse -File -Force -ErrorAction SilentlyContinue).Count
}

function Capturar-Tela([string]$arquivo) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $bmp.Save($arquivo, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Split-Path $arquivo -Leaf
  } catch { "sem captura: $($_.Exception.Message)" }
}

function Estado-Do-Registro {
  $estado = [ordered]@{}
  foreach ($raiz in 'HKLM:', 'HKCU:') {
    $local = (Get-ItemProperty "$raiz\Software\$Guid" -ErrorAction SilentlyContinue).InstallLocation
    $des = Get-ItemProperty "$raiz\Software\Microsoft\Windows\CurrentVersion\Uninstall\$Guid" -ErrorAction SilentlyContinue
    $estado[$raiz.TrimEnd(':')] = if ($local -or $des) { [ordered]@{ installLocation = $local; versao = $des.DisplayVersion } } else { $null }
  }
  $estado
}

function Instalar-Base([string]$modo, [string]$pastaD) {
  $p = Start-Process -FilePath $Base -ArgumentList "/S /$modo /D=$pastaD" -PassThru
  $null = $p.Handle
  if (-not $p.WaitForExit(300000)) { Parar-Pids (Pids-Do-Instalador $p.Id) | Out-Null; throw 'a instalação base passou de 300 s' }
  if ($p.ExitCode -ne 0) { throw "a instalação base saiu com $($p.ExitCode)" }
  $raiz = if ($modo -eq 'allusers') { 'HKLM:' } else { 'HKCU:' }
  $local = (Get-ItemProperty "$raiz\Software\$Guid" -ErrorAction SilentlyContinue).InstallLocation
  if (-not $local) { throw "a instalação base não gravou InstallLocation em $raiz" }
  $exe = Join-Path ([JanelasFelixo]::Longo($local)) "$Nome.exe"
  if (-not (Test-Path -LiteralPath $exe)) { throw "exe da instalação base não encontrado: $exe" }
  Write-Host "   base: /$modo em '$local' (exe por caminho longo: $exe)"
  [ordered]@{ modo = $modo; installLocation = $local; exe = $exe }
}

function Rodar-Limitado([string]$exe, [string]$argumentos) {
  # Tarefa agendada com RunLevel Limited: o processo nasce com o token filtrado
  # do runneradmin (integridade média), como o agente dentro do Felixo em 21/09.
  # O runner tem ConsentPromptBehaviorAdmin=0: o UAC eleva sem caixa — no PC do
  # Felipe (=5) é o mesmo caminho, com a caixa de consentimento no meio.
  $nomeTarefa = 'felixo-limitado-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
  $acao = if ($argumentos) { New-ScheduledTaskAction -Execute $exe -Argument $argumentos } else { New-ScheduledTaskAction -Execute $exe }
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
  Register-ScheduledTask -TaskName $nomeTarefa -Action $acao -Principal $principal -Settings $config -Force | Out-Null
  Start-ScheduledTask -TaskName $nomeTarefa
  $nomeTarefa
}

function Abrir-App([string]$exe, [switch]$Limitado) {
  $perfil = Join-Path $Trabalho ('perfil-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Force -Path $perfil | Out-Null
  $tarefa = $null
  if ($Limitado) {
    # A tarefa não herda este ambiente: um abridor define as variáveis do app.
    $abridor = Join-Path $Trabalho 'abrir-app.ps1'
    Set-Content -LiteralPath $abridor -Encoding utf8 -Value @(
      'param([string]$Exe, [string]$Perfil)',
      '$env:FELIXO_DISABLE_AUTO_UPDATE = "1"; $env:FELIXO_AUTO_INSTALL_CLIS = "0"; $env:FELIXO_USER_DATA_DIR = $Perfil',
      'Start-Process -FilePath $Exe'
    )
    $tarefa = Rodar-Limitado "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$abridor`" -Exe `"$exe`" -Perfil `"$perfil`""
  } else {
    $env:FELIXO_USER_DATA_DIR = $perfil
    $null = Start-Process -FilePath $exe -PassThru
  }
  Start-Sleep -Seconds 20
  if ($tarefa) { Unregister-ScheduledTask -TaskName $tarefa -Confirm:$false -ErrorAction SilentlyContinue }
  $vivos = Processos-Do-App
  if ($vivos.Count -eq 0) { throw "o app não ficou aberto (limitado=$([bool]$Limitado))" }
  Write-Host "   app aberto (limitado=$([bool]$Limitado)): $($vivos.Count) processo(s) em $($vivos[0].ExecutablePath)"
  [ordered]@{ limitado = [bool]$Limitado; processos = $vivos.Count; caminho = $vivos[0].ExecutablePath }
}

# Instaladores, desinstaladores antigos e tudo o que eles abriram (PowerShell
# da checagem de app, taskkill...). Devolve o HashSet inteiro (vírgula).
function Arvore-De($todos) {
  $conjunto = [System.Collections.Generic.HashSet[int]]::new()
  $fila = [System.Collections.Generic.Queue[int]]::new()
  foreach ($proc in $todos) { if ($NomesDeInstalador -contains $proc.Name) { $fila.Enqueue([int]$proc.ProcessId) } }
  if ($script:RaizAtual) { $fila.Enqueue([int]$script:RaizAtual) }
  while ($fila.Count -gt 0) {
    $atual = $fila.Dequeue()
    if (-not $conjunto.Add($atual)) { continue }
    foreach ($filho in $todos) { if ([int]$filho.ParentProcessId -eq $atual -and [int]$filho.ProcessId -ne $atual) { $fila.Enqueue([int]$filho.ProcessId) } }
  }
  , $conjunto
}

function Medir([string]$instalador, [string]$argumentos, [string]$destino, [int]$limite = $LimiteSegundos, [string]$modo = 'direto', [pscredential]$credencial = $null) {
  $inicio = Get-Date
  $p = $null
  $tarefa = $null
  $script:RaizAtual = $null
  if ($modo -eq 'limitado') {
    $tarefa = Rodar-Limitado $instalador $argumentos
  } else {
    $sp = @{ FilePath = $instalador; PassThru = $true }
    if ($argumentos) { $sp.ArgumentList = $argumentos }
    $temp = $env:TEMP
    if ($modo -eq 'padrao') {
      # O processo de outro usuário herda este ambiente; o %TEMP% do runner não é dele.
      $tempPadrao = Join-Path $Trabalho 'temp-padrao'
      New-Item -ItemType Directory -Force -Path $tempPadrao | Out-Null
      $env:TEMP = $tempPadrao; $env:TMP = $tempPadrao
      $sp.Credential = $credencial
      $sp.WorkingDirectory = $Trabalho
    }
    try { $p = Start-Process @sp } finally { $env:TEMP = $temp; $env:TMP = $temp }
    $null = $p.Handle
    $script:RaizAtual = $p.Id
  }

  # Linha do tempo: cada processo novo da árvore do instalador (com a linha de
  # comando, que mostra o $INSTDIR usado na checagem de app) e cada mudança no
  # número de processos do app.
  $linha = [System.Collections.Generic.List[string]]::new()
  $vistos = [System.Collections.Generic.HashSet[int]]::new()
  $appUltimo = -1
  $viuInstalador = $false
  $terminou = $false
  while ($true) {
    $t = [math]::Round(((Get-Date) - $inicio).TotalSeconds, 1)
    $todos = @(Get-CimInstance Win32_Process)
    $arvore = Arvore-De $todos
    foreach ($proc in $todos) {
      $id = [int]$proc.ProcessId
      if (($arvore.Contains($id) -or $proc.Name -eq 'consent.exe') -and $vistos.Add($id)) {
        $cmd = "$($proc.CommandLine)"
        if ($cmd.Length -gt 400) { $cmd = $cmd.Substring(0, 400) + '...' }
        $linha.Add(("{0,6}s +{1} (pai {2}) {3}: {4}" -f $t, $id, $proc.ParentProcessId, $proc.Name, $cmd))
      }
    }
    $app = @($todos | Where-Object { $_.Name -eq "$Nome.exe" }).Count
    if ($app -ne $appUltimo) { $linha.Add(("{0,6}s app: {1} processo(s)" -f $t, $app)); $appUltimo = $app }
    $instaladoresVivos = @($todos | Where-Object { $NomesDeInstalador -contains $_.Name }).Count
    if ($instaladoresVivos -gt 0) { $viuInstalador = $true }
    if ($p) { $terminou = $p.HasExited }
    elseif ($viuInstalador) { $terminou = $instaladoresVivos -eq 0 }
    elseif ($t -gt 30) { $terminou = $true; $linha.Add("${t}s o instalador não apareceu em 30 s") }
    if ($terminou -or $t -ge $limite) { break }
    Start-Sleep -Milliseconds 400
  }

  $m = [ordered]@{
    modo = $modo
    argumentos = $argumentos
    terminou = $terminou
    segundos = [math]::Round(((Get-Date) - $inicio).TotalSeconds, 1)
  }
  if ($p -and $p.HasExited) { $m.codigoDeSaida = $p.ExitCode }
  if ($tarefa) {
    $info = Get-ScheduledTaskInfo -TaskName $tarefa -ErrorAction SilentlyContinue
    if ($info) { $m.codigoDeSaida = $info.LastTaskResult }
  }
  if ($terminou) {
    Start-Sleep -Seconds 3
    $sobras = @(Get-CimInstance Win32_Process | Where-Object { $NomesDeInstalador -contains $_.Name })
    $m.processosQueSobraram = @($sobras | ForEach-Object { "$($_.ProcessId) $($_.Name)" })
    if ($sobras.Count -gt 0) {
      $m.janelas = @([JanelasFelixo]::Listar([int[]]@($sobras | ForEach-Object { [int]$_.ProcessId })))
      $m.falhasAoEncerrar = @(Parar-Pids @($sobras | ForEach-Object { [int]$_.ProcessId }))
    }
  } else {
    $pids = @((Arvore-De @(Get-CimInstance Win32_Process)) | ForEach-Object { $_ })
    $cpu = Cpu-De $pids
    Start-Sleep -Seconds 20
    $pids = @((Arvore-De @(Get-CimInstance Win32_Process)) | ForEach-Object { $_ })
    $m.cpuNosUltimos20s = [math]::Round((Cpu-De $pids) - $cpu, 2)
    $m.processosPresos = @(Get-CimInstance Win32_Process | Where-Object { $pids -contains [int]$_.ProcessId } |
      ForEach-Object { "$($_.ProcessId) (pai $($_.ParentProcessId)) $($_.Name): $($_.CommandLine)" })
    $consent = @(Get-CimInstance Win32_Process -Filter "Name='consent.exe'")
    $m.consentAberto = $consent.Count
    $alvosDeJanela = @($pids) + @($consent | ForEach-Object { [int]$_.ProcessId })
    $m.janelas = if ($alvosDeJanela.Count -gt 0) { @([JanelasFelixo]::Listar([int[]]$alvosDeJanela)) } else { @() }
    $m.captura = Capturar-Tela (Join-Path $Saida "$($script:CenarioAtual).png")
    $m.falhasAoEncerrar = if ($pids.Count -gt 0) { @(Parar-Pids $pids) } else { @() }
  }
  if ($tarefa) { Unregister-ScheduledTask -TaskName $tarefa -Confirm:$false -ErrorAction SilentlyContinue }
  $m.linhaDoTempo = $linha
  if ($destino) { $m.arquivosNoDestino = Contar-Arquivos $destino }
  $m.appAindaAberto = (Processos-Do-App).Count
  $m.registroDepois = Estado-Do-Registro
  Write-Host ("   instalador ({0}): terminou={1} código={2} {3}s cpu20s={4} app-aberto={5} arquivos={6}" -f $modo, $m.terminou, $m.codigoDeSaida, $m.segundos, $m.cpuNosUltimos20s, $m.appAindaAberto, $m.arquivosNoDestino)
  foreach ($l in $linha) { Write-Host "   | $l" }
  foreach ($j in @($m.janelas)) { if ($j) { Write-Host "   janela: $j" } }
  foreach ($pp in @($m.processosPresos)) { if ($pp) { Write-Host "   preso: $pp" } }
  $m
}

function Limpar {
  Get-ScheduledTask -TaskName 'felixo-limitado-*' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
  Processos-Do-App | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process | Where-Object { $NomesDeInstalador -contains $_.Name } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  foreach ($raiz in 'HKLM:', 'HKCU:') {
    $des = Get-ItemProperty "$raiz\Software\Microsoft\Windows\CurrentVersion\Uninstall\$Guid" -ErrorAction SilentlyContinue
    if ($des -and $des.UninstallString -match '^"([^"]+)"') {
      $desinstalador = $Matches[1]
      if (Test-Path -LiteralPath $desinstalador) {
        $modo = if ($raiz -eq 'HKLM:') { '/allusers' } else { '/currentuser' }
        $p = Start-Process -FilePath $desinstalador -ArgumentList "/S $modo" -PassThru
        if (-not $p.WaitForExit(120000)) { Parar-Pids (Pids-Do-Instalador $p.Id) | Out-Null }
      }
    }
    Remove-Item "$raiz\Software\$Guid", "$raiz\Software\Microsoft\Windows\CurrentVersion\Uninstall\$Guid" -Recurse -Force -ErrorAction SilentlyContinue
  }
  foreach ($pasta in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('CommonDesktopDirectory'),
      [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('CommonPrograms'))) {
    if ($pasta) { Get-ChildItem -LiteralPath $pasta -Filter "$Nome*.lnk" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue }
  }
  Get-ChildItem -LiteralPath $Trabalho -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notin 'instaladores', 'temp-padrao' } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $env:TEMP -Directory -Filter 'fx-*' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

$resultados = [System.Collections.Generic.List[object]]::new()
# `pwsh -File` entrega "A,G,I" como um texto só.
$Cenarios = @($Cenarios | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
function Cenario([string]$id, [string]$descricao, [scriptblock]$corpo) {
  if ($Cenarios.Count -gt 0 -and $Cenarios -notcontains $id.Substring(0, 1)) { return }
  $script:CenarioAtual = $id
  Write-Host ''
  Write-Host "=== $id — $descricao"
  $r = [ordered]@{ id = $id; descricao = $descricao }
  try { Limpar; & $corpo $r } catch {
    $r.erro = "$($_.Exception.Message) (linha $($_.InvocationInfo.ScriptLineNumber))"
    Write-Host "   ERRO: $($r.erro)"
  }
  finally { try { Limpar } catch { $r.erroNaLimpeza = $_.Exception.Message } }
  $resultados.Add($r)
}

# --- Ambiente -------------------------------------------------------------
$politica = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
$ambiente = [ordered]@{
  usuario = [Environment]::UserName
  elevado = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  enableLUA = $politica.EnableLUA
  consentPromptBehaviorAdmin = $politica.ConsentPromptBehaviorAdmin
  consentPromptBehaviorUser = $politica.ConsentPromptBehaviorUser
  temp = $env:TEMP
  tempLongo = [JanelasFelixo]::Longo($env:TEMP)
  base = [ordered]@{ arquivo = (Split-Path $Base -Leaf); versao = (Get-Item $Base).VersionInfo.ProductVersion }
  novo = [ordered]@{ arquivo = (Split-Path $Novo -Leaf); versao = (Get-Item $Novo).VersionInfo.ProductVersion }
  oitoPontoTres = ((& fsutil 8dot3name query C: 2>&1) -join ' ')
}
$env:FELIXO_DISABLE_AUTO_UPDATE = '1'
$env:FELIXO_AUTO_INSTALL_CLIS = '0'
Write-Host ($ambiente | ConvertTo-Json -Depth 4)

# Pasta curta como a do release smoke de 02/09: %TEMP% vem em 8.3 (RUNNER~1),
# e o exe aberto pelo atalho vem pelo caminho longo.
$baseCurta = Join-Path ([JanelasFelixo]::Curto($env:TEMP)) 'fx-base'
$ambiente.baseCurta = $baseCurta
$baseLonga = Join-Path $Trabalho 'base'
$destinoNovo = Join-Path $Trabalho 'novo'

Cenario 'A-allusers-curto-app-aberto-com-D' 'como em 21/09: instalação para todos em pasta 8.3, app aberto, /S /D= para outra pasta' {
  param($r)
  $r.base = Instalar-Base 'allusers' $baseCurta
  $r.app = Abrir-App $r.base.exe
  $r.medicao = Medir $Novo "/S /D=$destinoNovo" $destinoNovo
}

Cenario 'B-allusers-curto-app-fechado-com-D' 'mesma base de A, app fechado' {
  param($r)
  $r.base = Instalar-Base 'allusers' $baseCurta
  $r.medicao = Medir $Novo "/S /D=$destinoNovo" $destinoNovo
}

Cenario 'C-allusers-curto-app-aberto-sem-D' 'base de A, app aberto, /S por cima da mesma pasta' {
  param($r)
  $r.base = Instalar-Base 'allusers' $baseCurta
  $r.app = Abrir-App $r.base.exe
  $r.medicao = Medir $Novo '/S' ([JanelasFelixo]::Longo($r.base.installLocation))
}

Cenario 'D-allusers-longo-app-aberto-sem-D' 'instalação para todos em caminho longo, app aberto, /S' {
  param($r)
  $r.base = Instalar-Base 'allusers' $baseLonga
  $r.app = Abrir-App $r.base.exe
  $r.medicao = Medir $Novo '/S' $r.base.installLocation
}

Cenario 'E-usuario-longo-app-aberto-sem-D' 'instalação por usuário (perMachine:false), app aberto, /S' {
  param($r)
  $r.base = Instalar-Base 'currentuser' $baseLonga
  $r.app = Abrir-App $r.base.exe
  $r.medicao = Medir $Novo '/S' $r.base.installLocation
}

Cenario 'F-usuario-longo-app-aberto-com-D' 'instalação por usuário, app aberto, /S /D= para outra pasta' {
  param($r)
  $r.base = Instalar-Base 'currentuser' $baseLonga
  $r.app = Abrir-App $r.base.exe
  $r.medicao = Medir $Novo "/S /D=$destinoNovo" $destinoNovo
}

Cenario 'G-usuario-padrao-sobre-allusers' 'usuário sem admin roda /S /D= numa máquina com instalação para todos (pede elevação)' {
  param($r)
  $r.base = Instalar-Base 'allusers' $baseLonga
  $nomeUsuario = 'felixo-padrao'
  $bytes = [byte[]]::new(18)
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $senha = 'Fx!' + [Convert]::ToBase64String($bytes) + 'a1'
  $computador = [ADSI]"WinNT://$env:COMPUTERNAME,computer"
  try { [void]$computador.psbase.Invoke('Delete', 'User', $nomeUsuario) } catch { }
  # ADSI em vez de `net user`: a senha não aparece em linha de comando.
  $u = $computador.psbase.Children.Add($nomeUsuario, 'User')
  [void]$u.psbase.Invoke('SetPassword', $senha)
  $u.psbase.CommitChanges()
  try {
    $grupo = (New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-545').Translate([Security.Principal.NTAccount]).Value.Split('\')[-1]
    try { [void]([ADSI]"WinNT://$env:COMPUTERNAME/$grupo,group").psbase.Invoke('Add', "WinNT://$env:COMPUTERNAME/$nomeUsuario,user") } catch { }
    $credencial = New-Object pscredential $nomeUsuario, (ConvertTo-SecureString $senha -AsPlainText -Force)
    $destinoG = Join-Path $Trabalho 'g'
    New-Item -ItemType Directory -Force -Path $destinoG | Out-Null
    $r.medicao = Medir $Novo "/S /D=$destinoG" $destinoG 120 'padrao' $credencial
  } finally {
    $senha = $null
    try { [void]$computador.psbase.Invoke('Delete', 'User', $nomeUsuario) } catch { }
  }
}

Cenario 'H-usuario-longo-app-aberto-interativo' 'instalação por usuário, app aberto, sem /S (assistente)' {
  param($r)
  $r.base = Instalar-Base 'currentuser' $baseLonga
  $r.app = Abrir-App $r.base.exe
  $r.medicao = Medir $Novo '' $null 30
}

Cenario 'I-limitado-allusers-curto-app-aberto-com-D' 'réplica de 21/09: chamador SEM elevação (token limitado), instalação para todos em pasta 8.3, app aberto sem elevação, /S /D=' {
  param($r)
  $r.base = Instalar-Base 'allusers' $baseCurta
  $r.app = Abrir-App $r.base.exe -Limitado
  $r.medicao = Medir $Novo "/S /D=$destinoNovo" $destinoNovo $LimiteSegundos 'limitado'
}

Cenario 'J-limitado-allusers-curto-app-fechado-com-D' 'base de I, app fechado, chamador sem elevação' {
  param($r)
  $r.base = Instalar-Base 'allusers' $baseCurta
  $r.medicao = Medir $Novo "/S /D=$destinoNovo" $destinoNovo $LimiteSegundos 'limitado'
}

Cenario 'K-limitado-usuario-longo-app-aberto-sem-D' 'instalação por usuário (o caso comum), app aberto, chamador sem elevação, /S' {
  param($r)
  $r.base = Instalar-Base 'currentuser' $baseLonga
  $r.app = Abrir-App $r.base.exe -Limitado
  $r.medicao = Medir $Novo '/S' $r.base.installLocation $LimiteSegundos 'limitado'
}

Cenario 'L-limitado-allusers-curto-app-aberto-sem-D' 'chamador sem elevação, instalação para todos em pasta 8.3, app aberto, /S por cima da mesma pasta ($INSTDIR curto)' {
  param($r)
  $r.base = Instalar-Base 'allusers' $baseCurta
  $r.app = Abrir-App $r.base.exe -Limitado
  $r.medicao = Medir $Novo '/S' ([JanelasFelixo]::Longo($r.base.installLocation)) $LimiteSegundos 'limitado'
}

$relatorio = [ordered]@{ ambiente = $ambiente; cenarios = $resultados }
$relatorio | ConvertTo-Json -Depth 8 | Out-File -Encoding utf8 (Join-Path $Saida 'relatorio.json')
Write-Host ''
Write-Host '=== Resumo'
foreach ($c in $resultados) {
  $m = $c.medicao
  if (-not $m) { Write-Host ("{0}: erro — {1}" -f $c.id, $c.erro); continue }
  Write-Host ("{0}: terminou={1} código={2} {3}s cpu20s={4} app-aberto={5} arquivos={6}" -f $c.id, $m.terminou, $m.codigoDeSaida, $m.segundos, $m.cpuNosUltimos20s, $m.appAindaAberto, $m.arquivosNoDestino)
}

if ($Verificar) {
  $falhas = @(foreach ($c in $resultados) {
    $m = $c.medicao
    if (-not $m) { "$($c.id): erro — $($c.erro)"; continue }
    if (-not $m.terminou) { "$($c.id): o instalador não terminou em $($m.segundos) s" }
    elseif ($m.codigoDeSaida -ne 0) { "$($c.id): o instalador saiu com $($m.codigoDeSaida)" }
    if ($m.appAindaAberto -gt 0) { "$($c.id): o app continuou aberto ($($m.appAindaAberto) processo(s))" }
    if (@($m.processosQueSobraram).Count -gt 0) { "$($c.id): sobraram processos do instalador: $(@($m.processosQueSobraram) -join ', ')" }
    if ($m.arquivosNoDestino -le 0) { "$($c.id): nenhum arquivo no destino" }
  })
  if ($resultados.Count -eq 0) { $falhas += 'nenhum cenário rodou' }
  if ($falhas.Count -gt 0) {
    foreach ($f in $falhas) { Write-Host "::error::$f" }
    exit 1
  }
  Write-Host "Verificação: $($resultados.Count) cenário(s) terminaram com código 0, app fechado e sem processo preso."
}

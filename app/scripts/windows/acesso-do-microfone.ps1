# Lê ou muda a chave "Permitir que aplicativos da área de trabalho acessem o
# microfone" pela própria tela de Configurações (gravar no registro não surte
# efeito no Windows 11 26300). Imprime o estado final: On ou Off.
param([ValidateSet('Ler', 'On', 'Off')][string]$Estado = 'Ler')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Start-Process 'ms-settings:privacy-microphone'
$A = [System.Windows.Automation.AutomationElement]
$porId = New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, 'SystemSettings_CapabilityAccess_Microphone_ClassicGlobal_ToggleSwitch')
$chave = $null
foreach ($tentativa in 1..40) {
  Start-Sleep -Milliseconds 500
  # Só pelo AutomationId: o título da janela muda com o idioma do Windows.
  foreach ($janela in $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    if ($janela.Current.ClassName -ne 'ApplicationFrameWindow') { continue }
    $chave = $janela.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $porId)
    if ($chave) { $dona = $janela; break }
  }
  if ($chave) { break }
}
if (-not $chave) { throw 'Chave de acesso ao microfone não encontrada nas Configurações.' }
$padrao = $chave.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
if ($Estado -ne 'Ler' -and "$($padrao.Current.ToggleState)" -ne $Estado) {
  $padrao.Toggle()
  Start-Sleep -Seconds 2
}
"$($padrao.Current.ToggleState)"
try { $dona.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close() } catch {}

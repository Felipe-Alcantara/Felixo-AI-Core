# Mede a transcrição na nuvem (OpenAI e Groq) com um comando só:
#   powershell -ExecutionPolicy Bypass -File app\scripts\windows\medir-transcricao-nuvem.ps1
# Pede cada chave com entrada escondida (Enter pula o provedor). A chave fica só
# na memória deste processo, durante a medição: não vai para arquivo nem para a tela.
# Envia 12 frases humanas públicas (frases-ditado.json); custo de poucos centavos de dólar.
$ErrorActionPreference = 'Stop'
$scripts = Split-Path $PSScriptRoot
$pasta = Join-Path $env:LOCALAPPDATA 'felixo-ai-core-medicao'
$frases = Join-Path $pasta 'frases'
if (-not (Test-Path (Join-Path $frases '12.txt'))) {
  Write-Host 'Baixando as 12 frases públicas (uma vez, cerca de 250 MB de leitura)...'
  python -I (Join-Path $scripts 'preparar-frases-ditado.py') $frases
  if ($LASTEXITCODE -ne 0) { throw 'Não consegui preparar as frases.' }
}
# Preços e mínimo conferidos em 26/11/2026 nas páginas dos provedores.
$provedores = @(
  @{ Nome = 'OpenAI'; Argumentos = @('--base-url', 'https://api.openai.com/v1', '--modelo', 'whisper-1', '--preco-min', '0.006') },
  @{ Nome = 'Groq'; Argumentos = @('--base-url', 'https://api.groq.com/openai/v1', '--modelo', 'whisper-large-v3-turbo', '--preco-min', '0.000667', '--minimo-s', '10') }
)
foreach ($p in $provedores) {
  $segredo = Read-Host -AsSecureString "Cole a chave da $($p.Nome) e aperte Enter (vazio pula)"
  if ($segredo.Length -eq 0) { Write-Host "$($p.Nome): pulado."; continue }
  $ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segredo)
  try {
    $env:FELIXO_CHAVE_TRANSCRICAO = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro)
    $saida = Join-Path $pasta "resultado-$($p.Nome.ToLower()).json"
    $argumentos = $p.Argumentos
    node (Join-Path $scripts 'medir-transcricao-nuvem.cjs') $frases --saida $saida @argumentos
    Write-Host "$($p.Nome): resultado em $saida (código $LASTEXITCODE)."
  } finally {
    Remove-Item Env:FELIXO_CHAVE_TRANSCRICAO -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
  }
}
Read-Host 'Pronto. Aperte Enter para fechar' | Out-Null

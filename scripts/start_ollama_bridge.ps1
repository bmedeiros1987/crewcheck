param(
  [Parameter(Mandatory=$false)][int]$Pr,
  [Parameter(Mandatory=$false)][string]$Model = $(if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { 'gemma4:26b' }),
  [switch]$Smoke,
  [switch]$Once,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw 'Python não encontrado no PATH.'
}

if (-not $Smoke -and -not $env:GITHUB_TOKEN) {
  throw 'Defina GITHUB_TOKEN apenas nesta sessão do PowerShell antes de iniciar o bridge.'
}

$argsList = @('scripts/ollama_bridge.py', '--model', $Model)

if ($Smoke) {
  $argsList += '--smoke'
} else {
  if (-not $Pr) { throw 'Informe -Pr <numero>.' }
  $argsList += @('--pr', "$Pr")
}

if ($Once) { $argsList += '--once' }
if ($DryRun) { $argsList += '--dry-run' }

Write-Host "CrewCheck Ollama Bridge"
Write-Host "Model: $Model"
if ($Pr) { Write-Host "PR: #$Pr" }
Write-Host 'O token GitHub permanece somente no processo local e não é enviado ao Ollama.'

& python @argsList
exit $LASTEXITCODE

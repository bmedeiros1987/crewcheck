param(
  [Parameter(Mandatory=$false)][int]$Pr,
  [Parameter(Mandatory=$false)][string]$Model = $(if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { 'gemma4:26b' }),
  [switch]$Smoke,
  [switch]$Once,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$pythonExe = $null
$pythonPrefix = @()

if (Get-Command py -ErrorAction SilentlyContinue) {
  & py -3 -c "import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)" *> $null
  if ($LASTEXITCODE -eq 0) {
    $pythonExe = 'py'
    $pythonPrefix = @('-3')
  }
}

if (-not $pythonExe -and (Get-Command python -ErrorAction SilentlyContinue)) {
  & python -c "import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)" *> $null
  if ($LASTEXITCODE -eq 0) {
    $pythonExe = 'python'
  }
}

if (-not $pythonExe) {
  throw 'Python 3 não encontrado. Instale Python 3 ou disponibilize o launcher py -3 no PATH.'
}

if (-not $Smoke -and -not $env:GITHUB_TOKEN) {
  throw 'Defina GITHUB_TOKEN apenas nesta sessão do PowerShell antes de iniciar o bridge.'
}

$argsList = @('scripts/ollama_bridge.py', '--model', $Model)

if ($Smoke) {
  $argsList += '--smoke'
} elseif ($Pr) {
  $argsList += @('--pr', "$Pr")
}

if ($Once) { $argsList += '--once' }
if ($DryRun) { $argsList += '--dry-run' }

Write-Host "CrewCheck Ollama Bridge"
Write-Host "Model: $Model"
if ($Smoke) {
  Write-Host 'Mode: smoke test'
} elseif ($Pr) {
  Write-Host "Mode: PR #$Pr only"
} else {
  Write-Host 'Mode: all open PRs'
}
Write-Host 'O token GitHub permanece somente no processo local e não é enviado ao Ollama.'

& $pythonExe @pythonPrefix @argsList
exit $LASTEXITCODE

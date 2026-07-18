# Launches VS Code with all Factory dev secrets injected from the local
# Infisical instance, so .mcp.json ${VAR} expansion resolves from the vault
# and the setx machine env vars become unnecessary.
#
# Usage:  powershell -File scripts\code-with-secrets.ps1
# Requires: Infisical stack running (docker compose -f infisical/docker-compose.yml up -d)
# NOTE: keep this file pure ASCII - Windows PowerShell 5.1 reads it as ANSI,
# and UTF-8 punctuation (em dashes, curly quotes) corrupts the parse.

$repo = Split-Path $PSScriptRoot -Parent
$adminEnv = Join-Path $repo 'infisical\.env.admin.local'
if (-not (Test-Path $adminEnv)) {
  Write-Error "Missing $adminEnv - see infisical/README.md"
  exit 1
}
$token = ((Get-Content $adminEnv) -match '^INFISICAL_IDENTITY_TOKEN=') -replace '^INFISICAL_IDENTITY_TOKEN=', ''
if ($token -is [array]) { $token = $token | Select-Object -First 1 }
if (-not $token) {
  Write-Error 'INFISICAL_IDENTITY_TOKEN not found in infisical/.env.admin.local'
  exit 1
}

# The npm shim is a POSIX script that breaks on Windows shells; call the exe.
$infisical = Join-Path $env:APPDATA 'npm\node_modules\@infisical\cli\bin\infisical.exe'
if (-not (Test-Path $infisical)) {
  Write-Error 'Infisical CLI not found - npm install -g @infisical/cli'
  exit 1
}

$env:INFISICAL_API_URL = 'http://localhost:8085/api'
Set-Location $repo
& $infisical run --token $token --projectId 419db77e-f95c-4bc6-a238-451fed0f22a5 --env dev -- code $repo

$ErrorActionPreference = 'Stop'
$pidFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'tools\kosit\daemon.pid'
if (-not (Test-Path $pidFile)) { Write-Host 'No managed KoSIT daemon PID file found.'; exit 0 }
$processId = [int](Get-Content -Raw $pidFile)
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
if ($process -and $process.ProcessName -eq 'java') { Stop-Process -Id $processId; Write-Host 'Stopped the local KoSIT daemon.' }
Remove-Item -LiteralPath $pidFile -Force

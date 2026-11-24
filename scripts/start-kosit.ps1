$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'tools\kosit'
$jar = Join-Path $dir 'validator-1.6.3-standalone.jar'
$config = Join-Path $dir 'xrechnung-3.0.2'
$scenarios = Join-Path $config 'scenarios.xml'
$port = if ($env:KOSIT_PORT) { [int]$env:KOSIT_PORT } else { 8081 }
$hostName = if ($env:KOSIT_BIND) { $env:KOSIT_BIND } else { '127.0.0.1' }
if (-not (Test-Path $jar) -or -not (Test-Path $scenarios)) { throw 'KoSIT is not installed. Run npm run setup:kosit first.' }
$health = "http://${hostName}:${port}/server/health"
try { Invoke-WebRequest -Uri $health -TimeoutSec 2 | Out-Null; Write-Host "KoSIT is already listening at $health"; exit 0 } catch {}
$java = (Get-Command java -ErrorAction Stop).Source
$arguments = @('-jar', "`"$jar`"", '-s', "`"$scenarios`"", '-r', "`"$config`"", '-D', '-H', $hostName, '-P', [string]$port, '-G')
$process = Start-Process -FilePath $java -ArgumentList $arguments -WorkingDirectory $dir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dir 'daemon.out.log') -RedirectStandardError (Join-Path $dir 'daemon.err.log')
Set-Content -Path (Join-Path $dir 'daemon.pid') -Value $process.Id -NoNewline
for ($attempt=0; $attempt -lt 90; $attempt++) {
  Start-Sleep -Seconds 1
  try { Invoke-WebRequest -Uri $health -TimeoutSec 2 | Out-Null; Write-Host "KoSIT Validator 1.6.3 is ready at $health (PID $($process.Id))."; exit 0 } catch {}
}
if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
throw "KoSIT did not become ready at $health. Check Java and port availability."

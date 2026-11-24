$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'tools\mustang'
$jar = Join-Path $target 'Mustang-CLI-2.26.0.jar'
$url = 'https://repo.maven.apache.org/maven2/org/mustangproject/Mustang-CLI/2.26.0/Mustang-CLI-2.26.0.jar'
$expected = '42D7868CB68264874A7B8CAB4C3587B03B23CCC7CD72373DA917F66758BB9736'
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Java 11 or newer is required. Install a JDK and run this setup again.' }
New-Item -ItemType Directory -Force $target | Out-Null
if (-not (Test-Path -LiteralPath $jar)) { Write-Host 'Downloading Mustang CLI 2.26.0 from Maven Central...'; Invoke-WebRequest -Uri $url -OutFile $jar -TimeoutSec 180 }
$sha = [Security.Cryptography.SHA256]::Create()
try { $actual = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($jar))).Replace('-','') } finally { $sha.Dispose() }
if ($actual -ne $expected) { Remove-Item -LiteralPath $jar -Force; throw 'SHA-256 check failed for Mustang CLI. The downloaded file was removed.' }
& java -jar $jar --help *> $null
if ($LASTEXITCODE -ne 0) { throw 'Mustang CLI did not start. Check the Java installation.' }
Write-Host 'Mustang CLI 2.26.0 installed and SHA-256 verified.'

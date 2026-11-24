$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root 'tools\kosit'
$zip = Join-Path $target 'xrechnung-3.0.2-validator-configuration-2026-08-31.zip'
$jar = Join-Path $target 'validator-1.6.3-standalone.jar'
$config = Join-Path $target 'xrechnung-3.0.2'
$jarUrl = 'https://repo1.maven.org/maven2/org/kosit/validator/1.6.3/validator-1.6.3-standalone.jar'
$zipUrl = 'https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip'
$expected = @{
  'validator-1.6.3-standalone.jar' = '799E64BEFCA97D4080E03608C80B85DD5A5ECC5F4AE4F35D1116EC2855B9A7C9'
  'xrechnung-3.0.2-validator-configuration-2026-08-31.zip' = '2530CD107C414511C5D0462EC10F886910395ABFCA820DB82E83D70BF01221A8'
}
New-Item -ItemType Directory -Force $target | Out-Null
if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Java 11 or newer is required. Install a JDK and run this setup again.' }
foreach ($file in @(@{Path=$jar;Url=$jarUrl},@{Path=$zip;Url=$zipUrl})) {
  if (-not (Test-Path -LiteralPath $file.Path)) {
    Write-Host "Downloading $([IO.Path]::GetFileName($file.Path)) from its official release source..."
    Invoke-WebRequest -Uri $file.Url -OutFile $file.Path -TimeoutSec 120
  }
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $actual = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($file.Path))).Replace('-','') } finally { $sha.Dispose() }
  $name = [IO.Path]::GetFileName($file.Path)
  if ($actual -ne $expected[$name]) { Remove-Item -LiteralPath $file.Path -Force; throw "SHA-256 check failed for $name. The downloaded file was removed." }
}
if (-not (Test-Path -LiteralPath (Join-Path $config 'scenarios.xml'))) {
  New-Item -ItemType Directory -Force $config | Out-Null
  Expand-Archive -LiteralPath $zip -DestinationPath $config -Force
}
if (-not (Test-Path -LiteralPath (Join-Path $config 'resources\ubl\2.1\xsd\maindoc\UBL-Invoice-2.1.xsd'))) { throw 'The XRechnung bundle is incomplete: UBL 2.1 schema not found.' }
if (-not (Test-Path -LiteralPath (Join-Path $config 'resources\xrechnung-report.xsl'))) { throw 'The XRechnung bundle is incomplete: report stylesheet not found.' }
Write-Host 'KoSIT Validator 1.6.3 and XRechnung 3.0.2 ruleset installed and SHA-256 verified.'

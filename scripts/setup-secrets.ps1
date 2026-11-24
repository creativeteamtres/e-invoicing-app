$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root '.env'
if (Test-Path $envPath) { $content = Get-Content -Raw $envPath } else { $content = '' }
if ($content -match '(?m)^LEDGERLY_ENCRYPTION_KEY\s*=\s*([^\r\n]+)') { Write-Host 'A workspace encryption key is already set in .env; leaving it unchanged.'; exit 0 }
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$key = [BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()
[Array]::Clear($bytes,0,$bytes.Length)
if (-not (Test-Path $envPath)) { Set-Content -Path $envPath -Value '# Local development secrets (do not commit).' -Encoding utf8 }
Add-Content -Path $envPath -Value "LEDGERLY_ENCRYPTION_KEY=$key" -Encoding utf8
Write-Host 'Generated a random 256-bit SMTP credential encryption key in the ignored .env file.'

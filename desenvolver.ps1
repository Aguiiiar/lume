$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path -LiteralPath $cargoBin) { $env:PATH = $cargoBin + ';' + $env:PATH }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Cargo não encontrado. Instale Rust ou atualize o PATH.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
& npm.cmd run tauri dev
exit $LASTEXITCODE

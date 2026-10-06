# Oeffentlicher Kassen-PAR-Planer: https://par.pickadoc-tunnel.com
#
# vite preview liefert NUR den Build aus dist\ auf 127.0.0.1:5202 aus (kein Quellcode).
# Der Cloudflare-Tunnel "pickadoc-mas" (%USERPROFILE%\.cloudflared\config.yml)
# leitet par.pickadoc-tunnel.com dorthin.
#
# Aktualisieren: im Projekt "npm run build" - preview liefert danach die neuen Dateien aus.
# Start bei der Anmeldung: Autostart\par-oeffentlich.cmd. Idempotent: laeuft der Server schon, passiert nichts.

$ErrorActionPreference = 'Continue'
$Root = Split-Path $PSScriptRoot -Parent
$Port = 5202
$Logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) { exit 0 }

if (-not (Test-Path (Join-Path $Root 'dist\index.html'))) {
    Push-Location $Root
    & npm run build *> (Join-Path $Logs 'build.log')
    Pop-Location
}

Start-Process -FilePath 'node' -ArgumentList 'node_modules\vite\bin\vite.js', 'preview' `
    -WorkingDirectory $Root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Logs 'preview.log') `
    -RedirectStandardError  (Join-Path $Logs 'preview.err.log')

# Oeffentlicher Fuellungs-MKV-Planer: https://mkv.pickadoc-tunnel.com
#
# vite preview liefert NUR den Build aus dist\ auf 127.0.0.1:5204 aus (kein Quellcode).
# Der Cloudflare-Tunnel "pickadoc-mas" (%USERPROFILE%\.cloudflared\config.yml)
# leitet mkv.pickadoc-tunnel.com dorthin.
#
# Aktualisieren: im Projekt "npm run build" - preview liefert danach die neuen Dateien aus.
# Idempotent: laeuft der Server schon, passiert nichts.

$ErrorActionPreference = 'Continue'
$Root = Split-Path $PSScriptRoot -Parent
$Port = 5204
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

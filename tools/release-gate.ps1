<#
.SYNOPSIS
  Zentrales Release-Gate für das gesamte PlanR-Repository (Start + alle 12 Planer).

.DESCRIPTION
  Verhindert Regressionen und Verschlimmbesserungen vor Commit und Deploy:
  1. Prüft mit tools/gemeinsam.mjs --pruefen, ob alle geteilten Module & Preislisten synchron sind.
  2. Prüft TypeScript (tsc) für Start (Frontend + Server) und alle 12 Planer.
  3. Führt alle Vitest-Testsuites (inkl. Abrechnungs-Golden-Master) über alle 13 Pakete aus.

.PARAMETER Schnell
  Führt nur Synchronitäts-Check und TypeScript-Prüfungen aus (ohne Vitest).
#>
param([switch]$Schnell)
$ErrorActionPreference = 'Stop'
$wurzel = (Resolve-Path "$PSScriptRoot\..").Path
$startZeit = Get-Date

$planer = @(
  'ZE\HKP',
  'ZE\HKP-Probe',
  'ZE\Privat-HKP',
  'Implantologie\Privat-Impl',
  'KONS\MKV',
  'KONS\Privat-Kons',
  'PAR\Kassen-PAR',
  'PAR\Privat-PAR',
  'KB\Kassen-KB',
  'KB\Privat-KB',
  'KFO\Kassen-KFO',
  'KFO\Privat-KFO'
)

function Schritt([string]$titel) {
  Write-Host "`n=== $titel ===" -ForegroundColor Cyan
}

Push-Location $wurzel
try {
  Schritt '1/3 Gemeinsame Bausteine & Preislisten (tools/gemeinsam.mjs --pruefen)'
  node tools/gemeinsam.mjs --pruefen
  if ($LASTEXITCODE -ne 0) { throw 'Gemeinsame Bausteine weichen ab. Bitte zuerst "node tools/gemeinsam.mjs" ausführen.' }

  Schritt '2/3 TypeScript-Prüfung (Start Frontend + Server + alle 12 Planer)'
  Push-Location (Join-Path $wurzel 'Start')
  try {
    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript-Fehler im Start-Frontend (Start/tsconfig.json).' }
    npx tsc -p tsconfig.server.json --noEmit
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript-Fehler im Start-Server (Start/tsconfig.server.json).' }
    Write-Host '[OK  ] Start (Frontend + Server)' -ForegroundColor Green
  } finally { Pop-Location }

  foreach ($p in $planer) {
    Push-Location (Join-Path $wurzel $p)
    try {
      npx tsc -b --noEmit
      if ($LASTEXITCODE -ne 0) { throw "TypeScript-Fehler in $p." }
      Write-Host "[OK  ] $p" -ForegroundColor Green
    } finally { Pop-Location }
  }

  if (-not $Schnell) {
    Schritt '3/3 Alle Testsuites & Abrechnungs-Golden-Master (13 Pakete)'
    $alle = @('Start') + $planer
    $gesamtTests = 0
    foreach ($p in $alle) {
      Push-Location (Join-Path $wurzel $p)
      try {
        $vorherEap = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $ausgabe = npx vitest run 2>&1 | Out-String
        $rc = $LASTEXITCODE
        $ErrorActionPreference = $vorherEap
        $kurz = ($ausgabe -split "`n" | Where-Object { $_ -match 'Test Files|Tests\s+\d' } | ForEach-Object { $_.Trim() }) -join ' | '
        if ($rc -ne 0) {
          Write-Host "[FAIL] $p" -ForegroundColor Red
          Write-Host $ausgabe
          throw "Tests fehlgeschlagen in $p."
        }
        if ($kurz -match '(\d+)\s+passed') {
          $m = [regex]::Matches($kurz, 'Tests\s+(\d+)\s+passed')
          if ($m.Count -gt 0) { $gesamtTests += [int]$m[$m.Count - 1].Groups[1].Value }
        }
        Write-Host ("[OK  ] {0,-26} {1}" -f $p, $kurz) -ForegroundColor Green
      } finally { Pop-Location }
    }
    $dauer = [math]::Round(((Get-Date) - $startZeit).TotalSeconds, 1)
    Write-Host "`nRELEASE-GATE GRÜN: 13 Pakete, $gesamtTests bestandene Tests in ${dauer}s." -ForegroundColor Green
  } else {
    $dauer = [math]::Round(((Get-Date) - $startZeit).TotalSeconds, 1)
    Write-Host "`nSCHNELL-GATE GRÜN: Synchronität & TypeScript für 13 Pakete OK in ${dauer}s." -ForegroundColor Green
  }
} finally {
  Pop-Location
}

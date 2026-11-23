<#
.SYNOPSIS
  Baut alle Auslieferungsdateien der PlanR-Bridge 2.0 (C#, eigenständig, win-x86, ohne Python):
    - PlanR-Bridge-Update.zip + PlanR-Bridge-Update.json (RSA-3072-signiertes Update-Manifest)
    - PlanR-Bridge-Setup.exe (Einrichtungsfenster + Windows-Dienst + Entfernen in einer Datei)
    - PlanR-Bridge.zip (Manuelles Paket mit Installieren.cmd, Entfernen.cmd, LIESMICH.txt)

  Enthält keine Praxisschlüssel; PlanR hängt beim Download den Einrichtungscode an den Setup-Dateinamen
  bzw. legt einrichtung.json ins ZIP.

.PARAMETER Ziel
  Zielpfad für PlanR-Bridge.zip; Setup und Update-Paket werden im selben Ordner erzeugt.

.PARAMETER Zertifikat
  Fingerabdruck (SHA-1) eines Code-Signing-Zertifikats im Zertifikatspeicher; dann wird PlanR-Bridge-Setup.exe signiert.

.PARAMETER UpdateSchluessel
  Pfad zum privaten RSA-3072-PEM-Schlüssel für das Update-Manifest (Standard: $env:PLANR_UPDATE_SCHLUESSEL oder ~\.planr\bridge-update.pem).

.PARAMETER OhneSignatur
  Überspringt das Signieren des Update-Manifests (nur für lokale Testläufe ohne privaten Schlüssel).

.PARAMETER OhneTests
  Überspringt dotnet test vor dem Paketbau.

.PARAMETER Probe
  Zusätzlich PlanR-Bridge-Probe.exe in %TEMP%: läuft ohne Administratorrechte, richtet in %TEMP% ein und startet
  die Bridge als Kindprozess statt als Dienst (zum Testen gegen einen lokalen PlanR: /planr http://127.0.0.1:5188).

.EXAMPLE
  .\paket-bauen.ps1 -Ziel F:\PlanR\Start\data\downloads\PlanR-Bridge.zip

.EXAMPLE
  .\paket-bauen.ps1 -Ziel "$env:TEMP\planr-bridge-test\PlanR-Bridge.zip" -Probe
#>
param(
  [string]$Ziel = 'F:\PlanR\Start\data\downloads\PlanR-Bridge.zip',
  [string]$Zertifikat = '',
  [string]$Zeitstempel = 'http://time.certum.pl',
  [string]$UpdateSchluessel = '',
  [switch]$OhneSignatur,
  [switch]$OhneTests,
  [switch]$Probe
)
$ErrorActionPreference = 'Stop'
$bridge = $PSScriptRoot
$bau = Join-Path $env:TEMP ('planr-bridge-paket-' + [guid]::NewGuid().ToString('n').Substring(0, 8))
$wurzel = Join-Path $bau 'PlanR-Bridge'
$programm = Join-Path $wurzel 'programm'
$zielOrdner = Split-Path -Parent ([IO.Path]::GetFullPath($Ziel))

# Auf Rechnern mit x86- und x64-.NET liegt das SDK oft unter "C:\Program Files\dotnet", während PATH x86 zuerst führt.
$dotnet = Join-Path $env:ProgramFiles 'dotnet\dotnet.exe'
if (-not (Test-Path $dotnet)) { $dotnet = (Get-Command dotnet -ErrorAction Stop).Source }
$sdks = & $dotnet --list-sdks 2>$null
if ($LASTEXITCODE -or -not $sdks) { throw "Kein .NET-8-SDK gefunden ($dotnet)." }

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw '.NET-Framework-4-Compiler (csc.exe) fehlt.' }

try {
  if (-not $OhneTests) {
    Write-Host 'Führe Unit-Tests aus ...'
    & $dotnet test (Join-Path $bridge 'PlanR.Bridge.Tests\PlanR.Bridge.Tests.csproj') -c Release
    if ($LASTEXITCODE) { throw 'Unit-Tests fehlgeschlagen.' }
  }

  New-Item -ItemType Directory -Force $programm | Out-Null
  New-Item -ItemType Directory -Force $zielOrdner | Out-Null

  Write-Host 'Veröffentliche PlanR.Bridge.Dienst (win-x86, eigenständig) ...'
  & $dotnet publish (Join-Path $bridge 'PlanR.Bridge.Dienst\PlanR.Bridge.Dienst.csproj') `
    -c Release -r win-x86 --self-contained true `
    -p:DebugType=None -p:DebugSymbols=false `
    -o $programm
  if ($LASTEXITCODE) { throw 'dotnet publish fehlgeschlagen.' }

  # Keine Debug-Symbole ins Auslieferungspaket
  Get-ChildItem $programm -Filter '*.pdb' -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force

  $dienstExe = Join-Path $programm 'PlanR.Bridge.Dienst.exe'
  if (-not (Test-Path $dienstExe)) { throw 'PlanR.Bridge.Dienst.exe wurde nicht erzeugt.' }
  $bridgeVersion = (& $dienstExe --version | Select-Object -Last 1)
  if ($LASTEXITCODE -or -not $bridgeVersion) { throw 'PlanR.Bridge.Dienst.exe --version fehlgeschlagen.' }
  $bridgeVersion = $bridgeVersion.Trim()
  $programmDateien = @(Get-ChildItem $programm -Recurse -File).Count
  Write-Host "Bridge $bridgeVersion veröffentlicht ($programmDateien Dateien)."

  # Dienst-Wrapper vorab kompilieren zur Syntax-Prüfung (wird auf dem Zielserver aus PlanRBridgeDienst.cs gebaut)
  $dienstTestExe = Join-Path $bau 'PlanRBridgeDienst.check.exe'
  & $csc /nologo /target:exe /optimize "/out:$dienstTestExe" /reference:System.ServiceProcess.dll (Join-Path $bridge 'installer\PlanRBridgeDienst.cs')
  if ($LASTEXITCODE) { throw 'installer\PlanRBridgeDienst.cs lässt sich nicht übersetzen.' }

  # Selbstaktualisierung der installierten Bridges: nur programm\, RSA-3072-signiert
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $update = Join-Path $zielOrdner 'PlanR-Bridge-Update.zip'
  $updateJson = Join-Path $zielOrdner 'PlanR-Bridge-Update.json'
  Remove-Item $update -Force -ErrorAction SilentlyContinue
  [IO.Compression.ZipFile]::CreateFromDirectory($programm, $update, [IO.Compression.CompressionLevel]::Optimal, $true)
  $updateGroesse = (Get-Item $update).Length
  if ($updateGroesse -gt 120000000) {
    throw ("Update-Paket ist mit {0:N1} MB größer als das Limit (120 MB)." -f ($updateGroesse / 1MB))
  }
  if (-not $OhneSignatur) {
    $vorherPem = $env:PLANR_UPDATE_SCHLUESSEL
    try {
      if ($UpdateSchluessel) { $env:PLANR_UPDATE_SCHLUESSEL = $UpdateSchluessel }
      & $dienstExe --update-signieren $update $bridgeVersion $updateJson
      if ($LASTEXITCODE) { throw 'Das Update-Paket lässt sich nicht signieren.' }
    } finally {
      if ($UpdateSchluessel) {
        if ($null -eq $vorherPem) { Remove-Item Env:PLANR_UPDATE_SCHLUESSEL -ErrorAction SilentlyContinue }
        else { $env:PLANR_UPDATE_SCHLUESSEL = $vorherPem }
      }
    }
    Write-Host ("{0}: {1:N1} MB, signiert (Version {2})" -f $update, ($updateGroesse / 1MB), $bridgeVersion)
  } else {
    Write-Host ("{0}: {1:N1} MB, NICHT signiert (-OhneSignatur)" -f $update, ($updateGroesse / 1MB))
  }

  # Setup: programm\ als eingebettete Ressource payload.zip, bevor die ZIP-Startdateien dazukommen
  $payload = Join-Path $bau 'payload.zip'
  [IO.Compression.ZipFile]::CreateFromDirectory($wurzel, $payload, [IO.Compression.CompressionLevel]::Optimal, $false)

  $setupQuelle = Join-Path $bridge 'installer\setup'
  $ico = Join-Path $bau 'planr.ico'
  & $csc /nologo /target:exe "/out:$bau\icon.exe" /reference:System.Drawing.dll "$setupQuelle\Logo.cs" "$setupQuelle\IconBauen.cs"
  if ($LASTEXITCODE) { throw 'Das Icon-Werkzeug lässt sich nicht übersetzen.' }
  & "$bau\icon.exe" $ico
  if ($LASTEXITCODE -or -not (Test-Path $ico)) { throw 'Das Icon lässt sich nicht erzeugen.' }

  $bezuege = 'System.Windows.Forms', 'System.Drawing', 'System.ServiceProcess', 'System.Management', 'System.IO.Compression', 'System.Web.Extensions' |
    ForEach-Object { "/reference:$_.dll" }
  function SetupUebersetzen($aus, [string[]]$extra) {
    & $csc /nologo /target:winexe /optimize /platform:anycpu "/out:$aus" "/win32icon:$ico" "/resource:$payload,payload.zip" @bezuege @extra "$setupQuelle\PlanRBridge.cs" "$setupQuelle\Logo.cs"
    if ($LASTEXITCODE) { throw "Das Setup lässt sich nicht übersetzen ($aus)." }
  }

  $setup = Join-Path $zielOrdner 'PlanR-Bridge-Setup.exe'
  SetupUebersetzen $setup @("/win32manifest:$setupQuelle\app.manifest")
  if ($Zertifikat) {
    $signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $signtool) { throw 'signtool.exe fehlt (Windows SDK).' }
    & $signtool.FullName sign /sha1 $Zertifikat /fd SHA256 /tr $Zeitstempel /td SHA256 /d 'PlanR-Bridge' /du 'https://planr.pickadoc.de' $setup
    if ($LASTEXITCODE) { throw 'Code-Signing hat nicht geklappt.' }
  }
  Write-Host ("{0}: {1:N1} MB{2}" -f $setup, ((Get-Item $setup).Length / 1MB), $(if ($Zertifikat) { ', signiert' } else { ', NICHT signiert' }))

  if ($Probe) {
    $probeExe = Join-Path $env:TEMP 'PlanR-Bridge-Probe.exe'
    SetupUebersetzen $probeExe @('/define:PROBE')
    Write-Host ("{0}: {1:N1} MB (nur zum Testen)" -f $probeExe, ((Get-Item $probeExe).Length / 1MB))
  }

  # Manuelles ZIP-Paket (Installieren.cmd, Entfernen.cmd, LIESMICH.txt + installer\)
  $installerZiel = Join-Path $wurzel 'installer'
  New-Item -ItemType Directory -Force $installerZiel | Out-Null
  Copy-Item (Join-Path $bridge 'installer\dienst-installieren.ps1') (Join-Path $installerZiel 'dienst-installieren.ps1') -Force
  Copy-Item (Join-Path $bridge 'installer\PlanRBridgeDienst.cs') (Join-Path $installerZiel 'PlanRBridgeDienst.cs') -Force

  function StartDatei($name, $text, $argument) {
    $cmd = @"
@echo off
rem $text
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer\dienst-installieren.ps1" $argument
echo.
pause
"@
    [IO.File]::WriteAllText((Join-Path $wurzel $name), $cmd.Replace("`r`n", "`n").Replace("`n", "`r`n"), [Text.Encoding]::ASCII)
  }
  StartDatei 'Installieren.cmd' 'PlanR-Bridge 2.0 auf diesem Server einrichten (DS-Win, DENSoffice bzw. Z1.PRO).' ''
  StartDatei 'Entfernen.cmd' 'PlanR-Bridge vollstaendig von diesem Server entfernen.' '-Entfernen'

  $liesmich = @'
PlanR-Bridge 2.0
================

Verbindet DS-Win, DENSoffice bzw. CGM Z1.PRO auf diesem Server mit PlanR (https://planr.pickadoc.de).
Die Verbindung geht nur von hier nach außen; am Server wird kein Port geöffnet.

Einrichten
  1. Diesen Ordner auf den Server kopieren, auf dem Ihr Praxisprogramm liegt (z. B. auf den Desktop).
  2. Installieren.cmd doppelklicken und die Windows-Abfrage mit „Ja“ bestätigen.
  3. Fertig, wenn „Connector bereit“ und „PlanR verbunden“ erscheint. Die Bridge startet ab jetzt mit Windows.
  Danach kann dieser Ordner gelöscht werden.

  Eingaben sind nicht nötig: Das Paket aus PlanR kennt Ihre Praxis. Nur wenn das Praxisprogramm nicht gefunden wird
  oder auf einem Arbeitsplatz-PC statt auf dem Server installiert wird, fragt die Einrichtung nach.

Entfernen:       Entfernen.cmd doppelklicken (oder Windows-Einstellungen → Apps → PlanR-Bridge).
Notaus:          Datei STOP in C:\ProgramData\PlanR-Bridge anlegen (die Bridge nimmt keine Aufträge mehr an).
Protokoll:       C:\ProgramData\PlanR-Bridge\agent.log
'@
  [IO.File]::WriteAllText((Join-Path $wurzel 'LIESMICH.txt'), $liesmich, (New-Object Text.UTF8Encoding $true))

  Remove-Item $Ziel -Force -ErrorAction SilentlyContinue
  [IO.Compression.ZipFile]::CreateFromDirectory($wurzel, $Ziel, [IO.Compression.CompressionLevel]::Optimal, $true)
  Write-Host ("{0}: {1} Programmdateien, {2:N1} MB" -f $Ziel, $programmDateien, ((Get-Item $Ziel).Length / 1MB))
}
finally {
  Remove-Item $bau -Recurse -Force -ErrorAction SilentlyContinue
}

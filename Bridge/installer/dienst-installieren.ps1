<#
.SYNOPSIS
  Richtet die PlanR-Bridge 2.0 (C#, ohne Python) als Windows-Dienst auf dem Praxisserver ein.

.DESCRIPTION
  Kopiert die eigenständige PlanR-Bridge (programm\PlanR.Bridge.Dienst.exe) nach %ProgramData%\PlanR-Bridge
  (nur SYSTEM und Administratoren), schreibt agent.json, baut den Dienst-Wrapper PlanRBridgeDienst.exe mit dem
  .NET-Compiler aus Windows, prüft Connector und PlanR-Verbindung einmal und startet den Dienst „PlanR-Bridge“
  (automatischer Start, Neustart bei Absturz, atomare Selbstaktualisierung). Praxis und Schlüssel bringt das
  persönliche Paket aus PlanR mit (einrichtung.json); gefragt wird nur, wenn das Praxisprogramm nicht gefunden
  wird oder auf einem Arbeitsplatz-PC statt auf dem Server installiert wird.

.EXAMPLE
  .\dienst-installieren.ps1 -Mandant praxis-mueller -Schluessel <schlüssel>

.EXAMPLE
  .\dienst-installieren.ps1 -Entfernen
#>
param(
  [string]$PlanR = 'https://planr.pickadoc.de',
  [string]$Mandant,
  [string]$Schluessel,
  [string]$CfClientId = '',
  [string]$CfClientSecret = '',
  [ValidateSet('auto', 'dampsoft', 'dens', 'cgm-z1pro')][string]$Pvs = 'auto',
  [switch]$NurLesen,
  [string]$DsWin = '',
  [string]$DensIni = '',
  [string]$Z1Mdb = '',
  [string]$DienstKonto = '',
  [string]$DienstKennwort = '',
  [switch]$Entfernen
)
$ErrorActionPreference = 'Stop'
$dienst = 'PlanRBridge'
$ziel = Join-Path $env:ProgramData 'PlanR-Bridge'
$hier = Split-Path -Parent $MyInvocation.MyCommand.Path
$paketWurzel = Split-Path -Parent $hier

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Bitte in einer PowerShell als Administrator ausführen.' }

$uninstall = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PlanRBridge'
$agentJson = Join-Path $ziel 'agent.json'
$alt = if (Test-Path $agentJson) { Get-Content $agentJson -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
if (-not $Entfernen) {
  # Persönliches Paket aus PlanR (Einrichtung → Herunterladen): PlanR legt einrichtung.json unter programm\agent\ ab.
  $vorgabe = @(
    (Join-Path $paketWurzel 'programm\agent\einrichtung.json'),
    (Join-Path $hier 'einrichtung.json'),
    (Join-Path $paketWurzel 'einrichtung.json')
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($vorgabe) {
    $e = Get-Content $vorgabe -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $Mandant) { $Mandant = [string]$e.mandant }
    if (-not $Schluessel) { $Schluessel = [string]$e.schluessel }
    if ($e.planr -and -not $PSBoundParameters.ContainsKey('PlanR')) { $PlanR = [string]$e.planr }
    if ($e.praxis) { Write-Host "Bridge für: $($e.praxis)" }
  }
  if (-not $Mandant -and $alt) { $Mandant = $alt.mandant }
  if (-not $Schluessel -and $alt) { $Schluessel = $alt.schluessel }
  if (-not $Mandant -or $Mandant -notmatch '^[a-z0-9-]{1,40}$' -or -not $Schluessel -or $Schluessel.Length -lt 32) {
    throw 'Diesem Paket fehlen die Zugangsdaten Ihrer Praxis. Bitte das Paket in PlanR unter Einrichtung herunterladen (angemeldet als Praxis-Admin) und erneut starten.'
  }
}

# Laufenden Dienst anhalten; die frühere Installation „PlanR-Agent“ wird ganz entfernt.
foreach ($d in $dienst, 'PlanRAgent') {
  if (Get-Service $d -ErrorAction SilentlyContinue) {
    Stop-Service $d -Force -ErrorAction SilentlyContinue
    sc.exe delete $d | Out-Null
    Start-Sleep 2
    Write-Host "Alter Dienst $d entfernt."
  }
}
Remove-Item (Join-Path $env:ProgramData 'PlanR-Agent') -Recurse -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith("$ziel\", [StringComparison]::OrdinalIgnoreCase) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "Laufende Bridge beendet: $($_.Name) ($($_.ProcessId))." }
Start-Sleep 1
if ($Entfernen) {
  Remove-Item $uninstall -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $ziel -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host 'PlanR-Bridge ist vollständig entfernt.'
  return
}

# Programmdateien nach %ProgramData%\PlanR-Bridge; vorhandenes programm\ wird ersetzt, agent.json bleibt.
New-Item -ItemType Directory -Force $ziel | Out-Null
icacls $ziel /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
$programm = Join-Path $ziel 'programm'
$zielInstaller = Join-Path $ziel 'installer'
$gleichesZiel = (Resolve-Path $paketWurzel).Path.TrimEnd('\') -ieq (Resolve-Path $ziel).Path.TrimEnd('\')

if (-not $gleichesZiel) {
  $quelleProgramm = Join-Path $paketWurzel 'programm'
  if (-not (Test-Path (Join-Path $quelleProgramm 'PlanR.Bridge.Dienst.exe'))) {
    $repoPublish = Join-Path $paketWurzel 'PlanR.Bridge.Dienst\bin\Release\net8.0-windows\win-x86\publish'
    $repoBin = Join-Path $paketWurzel 'PlanR.Bridge.Dienst\bin\Release\net8.0-windows\win-x86'
    if (Test-Path (Join-Path $repoPublish 'PlanR.Bridge.Dienst.exe')) { $quelleProgramm = $repoPublish }
    elseif (Test-Path (Join-Path $repoBin 'PlanR.Bridge.Dienst.exe')) { $quelleProgramm = $repoBin }
    else { throw "PlanR.Bridge.Dienst.exe nicht gefunden unter $quelleProgramm. Bitte zuerst Bridge\paket-bauen.ps1 ausführen oder das komplette Paket vollständig entpacken." }
  }

  foreach ($rest in 'programm', 'python', 'programm.alt', 'update') {
    $p = Join-Path $ziel $rest
    if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue }
  }
  if (Test-Path $programm) { throw "$programm lässt sich nicht ersetzen (Datei in Benutzung?). Bitte den Server neu starten und erneut installieren." }

  New-Item -ItemType Directory -Force $programm | Out-Null
  Copy-Item (Join-Path $quelleProgramm '*') $programm -Recurse -Force
  # Persönliche Zugangsdaten landen nur in agent.json, nicht als Kopie unter programm\agent\.
  Remove-Item (Join-Path $programm 'agent\einrichtung.json') -Force -ErrorAction SilentlyContinue

  New-Item -ItemType Directory -Force $zielInstaller | Out-Null
  foreach ($datei in 'dienst-installieren.ps1', 'PlanRBridgeDienst.cs') {
    $von = Join-Path $hier $datei
    if (Test-Path $von) { Copy-Item $von (Join-Path $zielInstaller $datei) -Force }
  }
  Get-ChildItem $ziel -Recurse -File | Unblock-File
}

$bridgeExe = Join-Path $programm 'PlanR.Bridge.Dienst.exe'
if (-not (Test-Path $bridgeExe)) {
  throw "PlanR.Bridge.Dienst.exe fehlt unter $bridgeExe. Bitte das Paket vollständig entpacken und erneut installieren."
}
$bridgeVersion = (& $bridgeExe --version | Select-Object -Last 1)
if ($LASTEXITCODE -or -not $bridgeVersion) {
  if ($paketWurzel -match '\.zip\.\d+\\') { throw 'Das Paket wurde nicht entpackt. Bitte PlanR-Bridge.zip mit Rechtsklick > „Alle extrahieren“ auspacken und dann Installieren.cmd im ausgepackten Ordner starten.' }
  throw 'PlanR.Bridge.Dienst.exe startet nicht. Blockiert ein Virenschutz den Ordner C:\ProgramData\PlanR-Bridge?'
}
$bridgeVersion = $bridgeVersion.Trim()
Write-Host "PlanR-Bridge $bridgeVersion kopiert."

function RufeEinrichten($befehl, $eingabe = '{}') {
  $aus = $eingabe | & $bridgeExe --einrichten $befehl
  if ($LASTEXITCODE) { return $null }
  $letzte = $aus | Where-Object { $_ -and $_.Trim().StartsWith('{') } | Select-Object -Last 1
  if (-not $letzte) { return $null }
  try { return ($letzte | ConvertFrom-Json) } catch { return $null }
}

# DS-Win-Ordner fest eintragen: ein Dienst sieht keine Netzlaufwerk-Buchstaben, nur lokale Pfade und UNC-Pfade.
function Gueltig($p) { $p -and (Test-Path -LiteralPath (Join-Path $p 'daten\patient.dbf') -ErrorAction SilentlyContinue) }
function UncVon($p) {
  if ($p -match '^([A-Za-z]):(\\.*)?$') {
    $buchstabe, $rest = $Matches[1], $Matches[2]
    $rp = (Get-ItemProperty "HKCU:\Network\$buchstabe" -ErrorAction SilentlyContinue).RemotePath
    if (-not $rp) { $rp = (Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${buchstabe}:' AND DriveType=4" -ErrorAction SilentlyContinue).ProviderName }
    if ($rp) { $p = $rp.TrimEnd('\') + $rest }
  }
  # Freigabe auf diesem Rechner (Installation am Server über dessen eigenes Netzlaufwerk): Der Dienst läuft als
  # SYSTEM und darf die eigene Freigabe oft nicht öffnen – also den lokalen Ordner dahinter nehmen.
  if ($p -match '^\\\\([^\\]+)\\([^\\]+)(\\.*)?$' -and $Matches[1].Split('.')[0] -in @($env:COMPUTERNAME, 'localhost', '127')) {
    $freigabe, $rest = $Matches[2], $Matches[3]
    $lokal = (Get-CimInstance Win32_Share -Filter "Name='$($freigabe -replace "'", "''")'" -ErrorAction SilentlyContinue).Path
    if ($lokal -and (Gueltig ($lokal.TrimEnd('\') + $rest))) { return $lokal.TrimEnd('\') + $rest }
  }
  $p
}

if (-not $DsWin -and $alt -and $alt.dswin) { $DsWin = $alt.dswin }
if (-not $DensIni -and $alt -and $alt.densini) { $DensIni = $alt.densini }
if (-not $Z1Mdb -and $alt -and $alt.z1mdb) { $Z1Mdb = $alt.z1mdb }

$densIni = if ($DensIni) { $DensIni } elseif ($env:DENS_OFFICE_INI) { $env:DENS_OFFICE_INI } else { 'C:\Dens\DensOffice\Module\Ini\DENSoffice.ini' }
if (-not (Test-Path -LiteralPath $densIni)) {
  $densErgebnis = RufeEinrichten 'dens'
  if ($densErgebnis -and $densErgebnis.ini -and (Test-Path -LiteralPath $densErgebnis.ini)) {
    $densIni = [string]$densErgebnis.ini
  }
}
$z1mdb = if ($Z1Mdb) { $Z1Mdb } elseif ($env:Z1_MDB) { $env:Z1_MDB } else { 'C:\CGM\Z1\data\z1.mdb' }
if ($Pvs -eq 'cgm-z1pro') {
  if (-not (Test-Path -LiteralPath $z1mdb)) { throw "Z1-Datenbank nicht gefunden ($z1mdb). -Z1Mdb oder Z1_MDB setzen oder die Datei an den üblichen Ort legen." }
  $DsWin = ''
  Write-Host "Z1.PRO: $z1mdb"
}
if ($Pvs -eq 'dampsoft' -or ($Pvs -eq 'auto' -and -not (Test-Path -LiteralPath $densIni))) {
  if (-not $DsWin) {
    $dsErgebnis = RufeEinrichten 'dswin'
    if ($dsErgebnis -and $dsErgebnis.dswin) { $DsWin = [string]$dsErgebnis.dswin }
  }
  if ($DsWin) { $DsWin = UncVon $DsWin }
  if (-not (Gueltig $DsWin)) {
    foreach ($n in Get-ChildItem HKCU:\Network -ErrorAction SilentlyContinue) {
      $rp = $n.GetValue('RemotePath')
      if (-not $rp) { continue }
      $kandidaten = @("$rp\TDAMP\DS", "$rp\DS", $rp) + @(Get-ChildItem -LiteralPath $rp -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'TDAMP\DS' })
      $treffer = $kandidaten | Where-Object { Gueltig $_ } | Select-Object -First 1
      if ($treffer) { $DsWin = $treffer; break }
    }
  }
  if (-not (Gueltig $DsWin) -and $Pvs -eq 'auto' -and (Test-Path -LiteralPath $z1mdb)) {
    $Pvs = 'cgm-z1pro'
    $DsWin = ''
    Write-Host "Z1.PRO: $z1mdb"
  }
  while ($Pvs -ne 'cgm-z1pro' -and -not (Gueltig $DsWin)) {
    if ($DsWin) { Write-Warning "$DsWin enthält kein daten\patient.dbf oder ist nicht erreichbar." }
    $DsWin = UncVon (Read-Host 'DS-Win-Ordner (enthält daten\patient.dbf), z. B. D:\TDAMP\DS oder \\SERVER\TDAMP\DS').Trim().Trim('"').TrimEnd('\')
  }
  if ($Pvs -ne 'cgm-z1pro') { Write-Host "DS-Win: $DsWin" }
}

# Liegt DS-Win auf einem anderen Rechner, braucht der Dienst ein Konto, das die Freigabe öffnen darf.
$freigabeHost = if ($DsWin -match '^\\\\([^\\]+)\\') { $Matches[1] } else { '' }
$sid = $null
if ($freigabeHost -and $freigabeHost -notin @($env:COMPUTERNAME, 'localhost', '127.0.0.1', '.') -and -not $DienstKonto) {
  $ich = [Security.Principal.WindowsIdentity]::GetCurrent()
  $DienstKonto = $ich.Name
  $sid = $ich.User.Value
  Write-Host "DS-Win liegt auf $freigabeHost. Die Bridge läuft deshalb mit Ihrem Windows-Konto $DienstKonto."
}
$cred = $null
if ($DienstKonto) {
  if ($DienstKonto -like '.\*') { $DienstKonto = "$env:COMPUTERNAME\" + $DienstKonto.Substring(2) }
  if ($DienstKonto -notlike '*\*') { $DienstKonto = "$env:COMPUTERNAME\$DienstKonto" }
  if (-not $sid) {
    try { $sid = (New-Object Security.Principal.NTAccount $DienstKonto).Translate([Security.Principal.SecurityIdentifier]).Value }
    catch { throw "Das Windows-Konto $DienstKonto gibt es auf diesem PC nicht." }
  }
  icacls $ziel /grant:r "*${sid}:(OI)(CI)M" | Out-Null
  for ($versuch = 1; -not $cred; $versuch++) {
    $sicher = if ($DienstKennwort -and $versuch -eq 1) { ConvertTo-SecureString $DienstKennwort -AsPlainText -Force }
      else { Read-Host "Windows-Kennwort von $DienstKonto (das Anmelde-Kennwort dieses PCs, nicht die PIN)" -AsSecureString }
    if ($sicher.Length -eq 0) {
      if ($versuch -ge 3) { throw 'Ohne Kennwort startet Windows den Dienst nicht unter diesem Konto. Bitte dem Konto ein Kennwort geben und erneut installieren.' }
      Write-Warning 'Bitte das Kennwort eingeben – ohne Kennwort startet Windows den Dienst nicht unter diesem Konto.'
      continue
    }
    $probeCred = New-Object Management.Automation.PSCredential $DienstKonto, $sicher
    try {
      $pruefPfad = Join-Path $DsWin 'daten\patient.dbf'
      $probe = Start-Process $bridgeExe -ArgumentList '--datei-pruefen', "`"$pruefPfad`"" -Credential $probeCred -WorkingDirectory $programm -WindowStyle Hidden -Wait -PassThru
    } catch [InvalidOperationException] {
      if ($versuch -ge 3) { throw "Die Anmeldung als $DienstKonto klappt nicht: $($_.Exception.Message)" }
      Write-Warning 'Das Kennwort stimmt nicht – bitte noch einmal.'
      continue
    }
    if ($probe.ExitCode) { throw "$DienstKonto kann $DsWin nicht lesen – bitte Freigabe-Rechte prüfen." }
    $cred = $probeCred
  }
  Write-Host "$DienstKonto erreicht DS-Win."
}

# Das gefundene Praxisprogramm steht fest in der Konfiguration: Der Dienst (SYSTEM) sucht sonst bei jedem Start neu
# und findet DENSoffice nicht, wenn es nur im Benutzerprofil eingetragen ist.
$densDa = Test-Path -LiteralPath $densIni
if ($Pvs -eq 'auto') {
  if ($densDa) { $Pvs = 'dens' } elseif (Gueltig $DsWin) { $Pvs = 'dampsoft' }
}
if ($Pvs -eq 'dens' -and -not $densDa) { throw "DENSoffice nicht gefunden ($densIni). -DensIni oder DENS_OFFICE_INI auf die DENSoffice.ini setzen (liegt im DENSoffice-Ordner unter Module\Ini)." }
$konfig = [ordered]@{
  planr = $PlanR.TrimEnd('/'); mandant = $Mandant; schluessel = $Schluessel
  cfClientId = $CfClientId; cfClientSecret = $CfClientSecret; pvs = $Pvs; schreiben = -not $NurLesen; dswin = $DsWin
  z1mdb = $(if ($Pvs -eq 'cgm-z1pro') { $z1mdb } else { '' })
  densini = $(if ($densDa) { $densIni } else { '' })
}
[IO.File]::WriteAllText($agentJson, ($konfig | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$dienstQuelle = Join-Path $zielInstaller 'PlanRBridgeDienst.cs'
if (-not (Test-Path $dienstQuelle)) { $dienstQuelle = Join-Path $hier 'PlanRBridgeDienst.cs' }
$exe = Join-Path $ziel 'PlanRBridgeDienst.exe'
& $csc /nologo /target:exe /optimize "/out:$exe" /reference:System.ServiceProcess.dll $dienstQuelle
if ($LASTEXITCODE) { throw 'Dienst-Wrapper ließ sich nicht bauen.' }
[IO.File]::WriteAllLines((Join-Path $ziel 'dienst.ini'), @("exe=$bridgeExe", "config=$agentJson"))

Write-Host 'Prüfe Connector und Verbindung zu PlanR ...'
& $bridgeExe --config $agentJson --pruefen
if ($LASTEXITCODE) { Write-Warning 'Die Prüfung meldet einen Fehler (siehe oben und agent.log). Der Dienst wird trotzdem eingerichtet und versucht es weiter.' }

sc.exe create $dienst binPath= "`"$exe`"" start= delayed-auto DisplayName= 'PlanR-Bridge' | Out-Null
sc.exe description $dienst 'Verbindet DS-Win, DENSoffice bzw. CGM Z1.PRO dieses Servers mit PlanR (nur ausgehend, kein offener Port).' | Out-Null
sc.exe failure $dienst reset= 86400 actions= restart/60000/restart/60000/restart/300000 | Out-Null
if (-not [Diagnostics.EventLog]::SourceExists($dienst)) { New-EventLog -LogName Application -Source $dienst }
if ($cred) {
  # „Als Dienst anmelden“ für das Konto (sc.exe vergibt das Recht nicht selbst).
  $tmp = Join-Path $env:TEMP 'planr-bridge-rechte'
  New-Item -ItemType Directory -Force $tmp | Out-Null
  secedit /export /cfg "$tmp\alt.inf" /areas USER_RIGHTS | Out-Null
  $zeile = Get-Content "$tmp\alt.inf" | Where-Object { $_ -like 'SeServiceLogonRight*' } | Select-Object -First 1
  if (-not ($zeile -and $zeile -match [regex]::Escape("*$sid"))) {
    $neu = if ($zeile) { "$zeile,*$sid" } else { "SeServiceLogonRight = *$sid" }
    Set-Content "$tmp\neu.inf" -Encoding Unicode -Value @('[Unicode]', 'Unicode=yes', '[Version]', 'signature="$CHICAGO$"', 'Revision=1', '[Privilege Rights]', $neu)
    secedit /configure /db "$tmp\rechte.sdb" /cfg "$tmp\neu.inf" /areas USER_RIGHTS | Out-Null
  }
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  sc.exe config $dienst obj= $DienstKonto password= $cred.GetNetworkCredential().Password | Out-Null
  if ($LASTEXITCODE) { throw "Dienstkonto $DienstKonto ließ sich nicht setzen." }
}
# Eintrag unter Windows „Apps“, damit sich die Bridge auch ohne das entpackte Paket entfernen lässt.
$selbst = Join-Path $zielInstaller 'dienst-installieren.ps1'
New-Item $uninstall -Force | Out-Null
$eintrag = @{
  DisplayName = 'PlanR-Bridge'; DisplayVersion = $bridgeVersion; Publisher = 'Pickadoc GmbH'; DisplayIcon = "$env:WINDIR\System32\shell32.dll,13"
  InstallLocation = $ziel; NoModify = 1; NoRepair = 1
  UninstallString = "powershell.exe -NoProfile -Command `"Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \`"$selbst\`" -Entfernen'`""
}
foreach ($k in $eintrag.Keys) {
  $typ = if ($eintrag[$k] -is [int]) { 'DWord' } else { 'String' }
  New-ItemProperty $uninstall -Name $k -Value $eintrag[$k] -PropertyType $typ -Force | Out-Null
}

$beginn = Get-Date
Start-Service $dienst
Write-Host 'Warte auf die Bridge ...'
$log = Join-Path $ziel 'agent.log'
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep 1
  if ((Test-Path $log) -and (Get-Item $log).LastWriteTime -gt $beginn -and (Select-String -Path $log -Pattern 'bereit:|ERROR' -SimpleMatch:$false | Where-Object { $_.Line -match '^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d' -and [datetime]::ParseExact($_.Line.Substring(0, 19), 'yyyy-MM-dd HH:mm:ss', $null) -ge $beginn.AddSeconds(-1) })) { break }
}
Get-Content $log -Tail 4 -ErrorAction SilentlyContinue
Write-Host "Dienst 'PlanR-Bridge' ist eingerichtet. Protokoll: $log  –  Notaus: Datei $ziel\STOP anlegen."

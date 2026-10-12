<#
.SYNOPSIS
  Bringt PlanR auf planr.pickadoc.de (Strato-Server, ssh asterisk-live): Startseite/Server, alle Planer unter /planer/<name>/.

.DESCRIPTION
  Baut die Startseite und die Planer (mit Basis /planer/<name>/, eigener Ausgabeordner – die Tunnel-Builds in dist\
  bleiben), lädt sie hoch und führt einrichten.sh aus (Dienst planr, Benutzer planr, /srv/planr).
  Der MAS-Schlüssel kommt aus F:\MAS-2\backend\.env und wird nur als Datei übertragen (/etc/planr/planr.env, 600).

.PARAMETER Daten
  Daten (data\ ohne Sitzungen) vom Praxis-PC übernehmen und die auf dem Server ersetzen. Nur beim Umzug.

.PARAMETER Caddy
  Caddy-Eintrag für planr.pickadoc.de anlegen (nur beim ersten Mal nötig).
#>
param([switch]$Daten, [switch]$Caddy)
$ErrorActionPreference = 'Stop'
$wurzel = (Resolve-Path "$PSScriptRoot\..\..\..").Path
$hier = $PSScriptRoot
$bau = Join-Path $env:TEMP 'planr-strato'
$server = 'asterisk-live'
$utf8 = New-Object Text.UTF8Encoding($false)
$planer = [ordered]@{
  'hkp' = 'ZE\HKP'; 'privat-hkp' = 'ZE\Privat-HKP'; 'implantologie' = 'Implantologie\Privat-Impl'; 'mkv' = 'KONS\MKV'
  'kons' = 'KONS\Privat-Kons'; 'par' = 'PAR\Kassen-PAR'; 'privat-par' = 'PAR\Privat-PAR'; 'kb' = 'KB\Kassen-KB'
  'privat-kb' = 'KB\Privat-KB'; 'kfo' = 'KFO\Kassen-KFO'; 'privat-kfo' = 'KFO\Privat-KFO'
}

Remove-Item $bau -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$bau\start", "$bau\planer" | Out-Null

foreach ($h in $planer.Keys) {
  Push-Location (Join-Path $wurzel $planer[$h])
  npx vite build --base "/planer/$h/" --outDir "$bau\planer\$h" --emptyOutDir --logLevel error
  if ($LASTEXITCODE) { Pop-Location; throw "Planer $h ließ sich nicht bauen." }
  Pop-Location
  Write-Host "Planer $h gebaut"
}

Push-Location (Join-Path $wurzel 'Start')
npm run build --silent
if ($LASTEXITCODE) { Pop-Location; throw 'Startseite ließ sich nicht bauen.' }
robocopy . "$bau\start" /E /XD node_modules data logs tools .vite /XF tsconfig.tsbuildinfo *.test.ts /NFL /NDL /NJH /NJS /NP | Out-Null
Pop-Location

tar -czf "$bau\start.tgz" -C "$bau\start" .
tar -czf "$bau\planer.tgz" -C "$bau\planer" .
$hoch = @("$bau\start.tgz", "$bau\planer.tgz")
if ($Daten) {
  tar -czf "$bau\data.tgz" --exclude=sitzungen.json --exclude=bridge-weiter.json --exclude=cf-access.json -C (Join-Path $wurzel 'Start\data') .
  $hoch += "$bau\data.tgz"
}

$key = ((Get-Content F:\MAS-2\backend\.env) -match '^\s*PLANR_HKP_KEY\s*=' | Select-Object -First 1) -replace '^\s*PLANR_HKP_KEY\s*=\s*["'']?([^"''#]*).*', '$1'
if (-not $key.Trim()) { throw 'PLANR_HKP_KEY fehlt in F:\MAS-2\backend\.env' }
[IO.File]::WriteAllText("$bau\planr.env", "PLANR_HKP_KEY=$($key.Trim())`nPLANR_MAS=https://mas.pickadoc-tunnel.com`nPLANR_DATEN=/srv/planr/data`nNODE_ENV=production`n", $utf8)
$hoch += "$bau\planr.env"

foreach ($s in 'einrichten.sh', 'caddy.sh', 'caddy-planr.txt') {
  [IO.File]::WriteAllText("$bau\$s", ([IO.File]::ReadAllText("$hier\$s")).Replace("`r`n", "`n"), $utf8)
}
scp -q @hoch "$bau\einrichten.sh" "$bau\caddy.sh" "$bau\caddy-planr.txt" "${server}:/tmp/"
Remove-Item "$bau\planr.env"
if ($LASTEXITCODE) { throw 'Hochladen fehlgeschlagen.' }

$mitDaten = if ($Daten) { 'DATEN=1 ' } else { '' }
ssh -o BatchMode=yes $server "mv /tmp/einrichten.sh /tmp/planr-einrichten.sh && ${mitDaten}bash /tmp/planr-einrichten.sh"
if ($Caddy) { ssh -o BatchMode=yes $server 'mv /tmp/caddy.sh /tmp/planr-caddy.sh && bash /tmp/planr-caddy.sh' }

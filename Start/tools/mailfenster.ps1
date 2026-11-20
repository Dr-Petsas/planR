# Öffnet auf diesem Windows-PC eine neue E-Mail mit Anhang.
# Hört nur auf 127.0.0.1:8791. PlanR schickt den fertigen Entwurf (.eml).
# Das neue Outlook hat kein COM; die .eml-Datei öffnet das Mailprogramm als neue Nachricht.
# Start: powershell -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File mailfenster.ps1
param([switch]$Pruefen)
$ErrorActionPreference = 'Stop'
$prefix = 'http://127.0.0.1:8791/'

function Antwort($ctx, $code, $text) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $res = $ctx.Response
  $res.StatusCode = $code
  $res.ContentType = 'application/json; charset=utf-8'
  $res.Headers['Access-Control-Allow-Origin'] = '*'
  $res.Headers['Access-Control-Allow-Private-Network'] = 'true'
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.Close()
}

function EmlOeffnen([string]$eml) {
  if ($eml.Length -lt 20 -or $eml -notmatch 'Content-Disposition: attachment') { throw 'Entwurf ohne Anhang' }
  $ordner = Join-Path $env:TEMP 'planr-mail'
  New-Item -ItemType Directory -Force -Path $ordner | Out-Null
  $pfad = Join-Path $ordner ('kostenvoranschlag-' + [guid]::NewGuid().ToString('n').Substring(0, 8) + '.eml')
  [IO.File]::WriteAllText($pfad, $eml, [Text.UTF8Encoding]::new($false))
  if ($Pruefen) { return $pfad }
  Start-Process -FilePath $pfad
}

if ($Pruefen) {
  $probe = "X-Unsent: 1`r`nSubject: Pruefung`r`nMIME-Version: 1.0`r`nContent-Type: multipart/mixed; boundary=`"g`"`r`n`r`n--g`r`nContent-Disposition: attachment; filename=`"a.pdf`"`r`n`r`nQQ==`r`n--g--`r`n"
  $pfad = EmlOeffnen $probe
  if (-not (Test-Path -LiteralPath $pfad)) { throw 'Datei fehlt' }
  exit 0
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    if ($req.HttpMethod -eq 'OPTIONS') {
      $res = $ctx.Response
      $res.StatusCode = 204
      $res.Headers['Access-Control-Allow-Origin'] = '*'
      $res.Headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
      $res.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
      $res.Headers['Access-Control-Allow-Private-Network'] = 'true'
      $res.Close()
      continue
    }
    if ($req.HttpMethod -ne 'POST' -or $req.Url.AbsolutePath -ne '/oeffnen') {
      Antwort $ctx 404 '{"ok":false}'
      continue
    }
    if ($req.ContentLength64 -lt 1 -or $req.ContentLength64 -gt 20000000) {
      Antwort $ctx 413 '{"ok":false}'
      continue
    }
    try {
      $lesen = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
      $roh = $lesen.ReadToEnd()
      $lesen.Close()
      $b = $roh | ConvertFrom-Json
      EmlOeffnen ([string]$b.eml)
      Antwort $ctx 200 '{"ok":true}'
    } catch {
      Antwort $ctx 500 ('{"ok":false,"meldung":"' + ($_.Exception.Message -replace '"', "'") + '"}')
    }
  }
} finally {
  $listener.Stop()
}

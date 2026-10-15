#!/bin/bash
# Erlaubt das Einbetten von PlanR in Pickadoc (Sophie) und in die Clara-App (Flip-Seite Befund):
# frame-ancestors im planr.pickadoc.de-Block. Mehrfach aufrufbar; ersetzt eine ältere Liste.
set -eu
F=/etc/caddy/Caddyfile
QUELLEN="'self' https://cal.pickadoc.de https://docgenda.web.app https://docgenda.firebaseapp.com https://mas.pickadoc-tunnel.com http://localhost:3000"
if grep -qF "frame-ancestors $QUELLEN\"" "$F"; then
  echo "schon drin"
  exit 0
fi
cp "$F" "$F.vor-einbetten-$(date +%Y%m%d-%H%M)"
awk -v q="$QUELLEN" '
  /^planr\.pickadoc\.de \{/ { imBlock = 1 }
  imBlock && /^\}/ { imBlock = 0 }
  imBlock && /Content-Security-Policy "frame-ancestors/ { next }
  { print }
  imBlock && /Referrer-Policy strict-origin-when-cross-origin/ { print "        Content-Security-Policy \"frame-ancestors " q "\"" }
' "$F" > /tmp/Caddyfile.neu
if caddy validate --config /tmp/Caddyfile.neu --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
  install -m 644 /tmp/Caddyfile.neu "$F"
  systemctl reload caddy
  sleep 2
  systemctl is-active caddy
  echo "eingetragen"
else
  tail -3 /tmp/caddy-validate.log
  exit 1
fi

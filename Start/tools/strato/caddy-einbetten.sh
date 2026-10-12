#!/bin/bash
# Erlaubt das Einbetten von PlanR in Pickadoc (Sophie): frame-ancestors im planr.pickadoc.de-Block.
set -eu
F=/etc/caddy/Caddyfile
if grep -q "frame-ancestors 'self' https://cal.pickadoc.de" "$F"; then
  echo "schon drin"
  exit 0
fi
cp "$F" "$F.vor-einbetten-$(date +%Y%m%d-%H%M)"
awk '
  /^planr\.pickadoc\.de \{/ { imBlock = 1 }
  { print }
  imBlock && /Referrer-Policy strict-origin-when-cross-origin/ {
    print "        Content-Security-Policy \"frame-ancestors '\''self'\'' https://cal.pickadoc.de https://docgenda.web.app https://docgenda.firebaseapp.com http://localhost:3000\""
    imBlock = 0
  }
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

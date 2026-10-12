#!/bin/bash
set -eu
F=/etc/caddy/Caddyfile
if grep -q 'planr.pickadoc.de' "$F"; then
  echo "schon drin"
else
  cp "$F" "$F.vor-planr-$(date +%Y%m%d-%H%M)"
  tr -d '\r' < /tmp/caddy-planr.txt > /tmp/caddy-planr.lf
  cat "$F" /tmp/caddy-planr.lf > /tmp/Caddyfile.neu
  if caddy validate --config /tmp/Caddyfile.neu --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
    install -m 644 /tmp/Caddyfile.neu "$F"
    echo "eingetragen"
  else
    tail -3 /tmp/caddy-validate.log
    exit 1
  fi
fi
systemctl reload caddy
sleep 3
systemctl is-active caddy
curl -s -o /dev/null -w "liveavatar %{http_code}\n" https://liveavatar.pickadoc.ai/
curl -s -o /dev/null -w "planr ueber caddy (http, Host) %{http_code}\n" -H "Host: planr.pickadoc.de" http://127.0.0.1/
journalctl -u caddy --since "-1 min" --no-pager | grep -i "planr" | tail -3 | cut -c1-240

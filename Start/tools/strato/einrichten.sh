#!/bin/bash
# PlanR auf dem Strato-Server einrichten (planr.pickadoc.de). Idempotent.
set -euo pipefail
[ "$(hostname -I | awk '{print $1}')" = "212.132.104.205" ] || { echo "falscher Server"; exit 1; }

id planr >/dev/null 2>&1 || useradd --system --home /srv/planr --shell /usr/sbin/nologin planr
install -d -o planr -g planr -m 755 /srv/planr
install -d -o planr -g planr -m 755 /srv/planr/start
install -d -o planr -g planr -m 700 /srv/planr/data
install -d -o root -g root -m 755 /srv/planr/planer

# Programm
rm -rf /srv/planr/start.neu && mkdir /srv/planr/start.neu
tar -xzf /tmp/start.tgz -C /srv/planr/start.neu
if [ -d /srv/planr/start/node_modules ]; then mv /srv/planr/start/node_modules /srv/planr/start.neu/; fi
rm -rf /srv/planr/start.alt; [ -d /srv/planr/start ] && mv /srv/planr/start /srv/planr/start.alt
mv /srv/planr/start.neu /srv/planr/start
chown -R planr:planr /srv/planr/start
cd /srv/planr/start
sudo -u planr -H env HOME=/srv/planr npm ci --no-audit --no-fund --loglevel=error

# Planer (statisch, Caddy liest)
rm -rf /srv/planr/planer.neu && mkdir /srv/planr/planer.neu
tar -xzf /tmp/planer.tgz -C /srv/planr/planer.neu
chmod -R a+rX /srv/planr/planer.neu
rm -rf /srv/planr/planer.alt; mv /srv/planr/planer /srv/planr/planer.alt; mv /srv/planr/planer.neu /srv/planr/planer

# Daten nur beim ersten Mal bzw. mit DATEN=1 übernehmen
if [ "${DATEN:-0}" = "1" ] || [ -z "$(ls -A /srv/planr/data)" ]; then
  tar -xzf /tmp/data.tgz -C /srv/planr/data
  # Sitzungen gelten nur für die Domain, unter der sie entstanden sind (Cookie), und tragen Firebase-Tokens
  rm -f /srv/planr/data/sitzungen.json
  # Gehören zum Tunnel am Praxis-PC: Weiterleitung hierher bzw. Cloudflare Access
  rm -f /srv/planr/data/bridge-weiter.json /srv/planr/data/cf-access.json
  chown -R planr:planr /srv/planr/data
  chmod -R go-rwx /srv/planr/data
  echo "Daten übernommen"
fi

# Schlüssel
install -d -o root -g root -m 700 /etc/planr
if [ -f /tmp/planr.env ]; then install -o root -g root -m 600 /tmp/planr.env /etc/planr/planr.env; shred -u /tmp/planr.env; fi

cat > /etc/systemd/system/planr.service <<'UNIT'
[Unit]
Description=PlanR (planr.pickadoc.de)
After=network-online.target
Wants=network-online.target

[Service]
User=planr
Group=planr
WorkingDirectory=/srv/planr/start
EnvironmentFile=/etc/planr/planr.env
ExecStart=/usr/bin/node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5189 --strictPort
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/srv/planr/data /srv/planr/start/node_modules
MemoryMax=1G

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable planr >/dev/null 2>&1
systemctl restart planr
sleep 6
systemctl is-active planr
curl -s -o /dev/null -w "lokal / %{http_code}\n" -H "Host: planr.pickadoc.de" http://127.0.0.1:5189/
curl -s -w " [%{http_code}]\n" -H "Host: planr.pickadoc.de" http://127.0.0.1:5189/api/anmeldung
rm -f /tmp/start.tgz /tmp/planer.tgz /tmp/data.tgz

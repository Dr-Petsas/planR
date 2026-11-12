#!/usr/bin/env bash
# Probe auf pickadoc1: eine Datei einlesen und das Ergebnis kurz zeigen.
#   ./probe.sh /pfad/plan.pdf [auto|immer|nie]
# Die volle Antwort liegt danach in /tmp/einlesen_probe.json (enthält den Planinhalt, danach löschen).
set -euo pipefail
cd "$(dirname "$0")"
DATEI="${1:?Datei fehlt}"
MODUS="${2:-auto}"
TOKEN=$(grep '^EINLESEN_TOKEN=' .env | cut -d= -f2)
curl -s -H "Authorization: Bearer $TOKEN" -F "datei=@$DATEI" \
  "http://127.0.0.1:8214/einlesen?ergaenzung=$MODUS" > /tmp/einlesen_probe.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/einlesen_probe.json'))
if 'seiten' not in d:
    print('FEHLER', d); raise SystemExit(1)
print('dauer', d['dauer_s'], '| schwache seiten', d['schwache_seiten'], '| vollstaendig', d['vollstaendig'])
for s in d['seiten']:
    print(' seite', s['seite'], 'zeichen', s['zeichen'], 'tabellen', s['tabellen'])
for t in d['tabellen']:
    print(' tabelle seite', t['seite'], f"{t['zeilen']}x{t['spalten']}", 'zellen', len(t['zellen']),
          '|', ' · '.join(z['text'][:12] for z in t['zellen'][:10]))
e = d['ergaenzung']
if not e:
    print('ergaenzung: nicht gelaufen')
elif 'fehler' in e:
    print('ergaenzung: FEHLER', e['fehler'])
else:
    for s in e['seiten']:
        unsicher = sum(1 for t in s['teile'] if (t['sicher'] or 0) < 0.9)
        print(' paddle seite', s['seite'], 'teile', len(s['teile']), 'unsicher', unsicher)
    print(' paddle dauer', e['dauer_s'])
PY

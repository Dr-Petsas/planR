"""Vergleicht die Leserouten des Python-Connectors für DENSoffice mit der kompilierten PlanR-Bridge.

Beide lesen dieselbe DENS-Datenbank (über shared locks). Es wird nichts geschrieben.
Ausgegeben werden nur Pfade, Zähler und Namen abweichender Felder, keine Patientendaten.

Aufruf: python dens_vergleich.py [--connector F:\\pvsConnectoR\\connectors\\dens] [--max 400]
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HIER = Path(__file__).resolve().parent
EXE = HIER.parent / 'PlanR.Bridge.Dienst' / 'bin' / 'Release' / 'net8.0-windows' / 'win-x86' / 'PlanR.Bridge.Dienst.exe'


def unterschiede(a, b, weg=''):
    """Feldnamen, an denen sich zwei JSON-Werte unterscheiden. 1 und 1.0 sind gleich."""
    if isinstance(a, dict) and isinstance(b, dict):
        aus = []
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                aus.append(f'{weg}/{k} (fehlt {"Python" if k not in a else "C#"})')
            else:
                aus += unterschiede(a[k], b[k], f'{weg}/{k}')
        return aus
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f'{weg} (Länge {len(a)} / {len(b)})']
        aus = []
        for i, (x, y) in enumerate(zip(a, b)):
            aus += unterschiede(x, y, f'{weg}[{i}]')
        return aus
    if isinstance(a, bool) != isinstance(b, bool):
        return [weg]
    return [] if a == b else [weg]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--connector', default=r'F:\pvsConnectoR\connectors\dens')
    parser.add_argument('--max', type=int, default=400)
    args = parser.parse_args()
    sys.path.insert(0, args.connector)
    import dens_connector_service as dienst
    import dens_native

    cfg = dens_native.installation_config()
    patient_file = cfg['bank'] / 'PATIENT.DAT'
    server = dienst.make_server(patient_file, port=0)
    port = server.server_port
    threading.Thread(target=server.serve_forever, daemon=True).start()

    def python(pfad):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}{pfad}', timeout=180) as r:
                return r.status, json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode('utf-8'))

    patienten = dens_native.read_patients(patient_file)
    nummern = [p['id'] for p in patienten]
    schritt = max(1, len(nummern) // args.max)
    probe = nummern[::schritt][:args.max]
    pfade = [
        '/health', '/kartei-stand', '/praxis/katalog', '/leistungskatalog', '/hkps/offen',
        '/gibt/es/nicht', '/patients/999999999', '/patients/999999999/befunde/01',
        '/patients/999999999/hkps/1/planr',
        '/patients?alle=1', '/patients', '/patients?q=', '/patients?limit=0&q=a',
        '/patients?limit=101&q=a', '/patients?limit=abc&q=a', '/patients?q=a',
        '/patients?q=e&limit=100', '/patients?q=19&limit=50', '/patients?q=.0&limit=100',
        '/patients?firstName=a', '/patients?lastName=m&limit=100',
        '/patients?vorname=a&nachname=e',
    ]
    for p in patienten[:: max(1, len(patienten) // 40)]:
        for wort in (p['lastName'], p['firstName'], f"{p['firstName']} {p['lastName']}", p['birthDate']):
            if wort.strip():
                pfade.append('/patients?' + urllib.parse.urlencode({'q': wort, 'limit': 100}))
        if p['firstName'] or p['lastName']:
            pfade.append('/patients?' + urllib.parse.urlencode({'firstName': p['firstName'][:2], 'lastName': p['lastName'][:3]}))

    plaene = 0
    for nr in probe:
        pfade += [f'/patients/{nr}', f'/patients/{nr}/befunde/01', f'/patients/{nr}/clinical']
        cl = dens_native.clinical_list(patient_file, nr)
        for plan in cl.get('hkps') or []:
            pfade.append(f"/patients/{nr}/hkps/{plan['number']}/planr")
            plaene += 1

    env = dict(os.environ, DENS_BEFUND_DIR=str(Path(args.connector) / 'befund01'))
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write('\n'.join(pfade))
    lauf = subprocess.run([str(EXE), '--dens-datei', f.name], capture_output=True, text=True, encoding='utf-8', env=env, timeout=3600)
    Path(f.name).unlink()
    if lauf.returncode:
        print('Kompilierte Bridge:', lauf.stderr.strip()[:2000])
        return 2
    kompiliert = [json.loads(z) for z in lauf.stdout.splitlines() if z.strip()]
    if len(kompiliert) != len(pfade):
        print(f'Kompilierte Bridge lieferte {len(kompiliert)} von {len(pfade)} Antworten.')
        return 2

    abweichend = 0
    for pfad, cs in zip(pfade, kompiliert):
        status, daten = python(pfad)
        diff = [f'Status {status} / {cs["status"]}'] if status != cs['status'] else []
        if status == 400 and isinstance(daten, dict) and 'invalid literal for int()' in str(daten.get('error', '')) and isinstance(cs['daten'], dict) and cs['daten'].get('error'):
            pass
        else:
            diff += unterschiede(daten, cs['daten'])
        if diff:
            abweichend += 1
            if abweichend <= 30:
                print('ABWEICHUNG', pfad.split('?')[0], '|', '; '.join(diff[:8]))
    print(f'{len(patienten)} Patienten in DENS, {len(probe)} davon geprüft, {plaene} Pläne, {len(pfade)} Aufrufe, {abweichend} abweichend.')
    return 1 if abweichend else 0


if __name__ == '__main__':
    sys.exit(main())

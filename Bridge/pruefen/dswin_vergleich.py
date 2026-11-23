"""Vergleicht die Leserouten des Python-Connectors für DS-Win mit der kompilierten PlanR-Bridge.

Beide lesen dieselbe DS-Win-Installation (nur lesend). Es wird nichts geschrieben.
Ausgegeben werden nur Pfade, Zähler und Namen abweichender Felder, keine Patientendaten.

Aufruf: python dswin_vergleich.py [--connector F:\\pvsConnectoR\\connectors\\dampsoft] [--root F:\\TDAMP\\DS] [--max 200]
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
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return [] if abs(float(a) - float(b)) < 1e-9 else [weg]
    return [] if a == b else [weg]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--connector', default=r'F:\pvsConnectoR\connectors\dampsoft')
    parser.add_argument('--root', default=r'F:\TDAMP\DS')
    parser.add_argument('--max', type=int, default=200)
    args = parser.parse_args()
    os.environ['DSWIN_ROOT'] = args.root
    sys.path.insert(0, args.connector)

    import connector_service as dienst
    import dswin_path

    root = Path(args.root)
    dbf = root / 'daten' / 'patient.dbf'
    enc = dswin_path.guess_encoding(dbf)
    server = dienst.make_server(str(dbf), enc, port=0, enable_write=False, read_only_reason='Nur lesend im Vergleich.')
    port = server.server_port
    threading.Thread(target=server.serve_forever, daemon=True).start()

    def python(pfad, kopf=None):
        req = urllib.request.Request(f'http://127.0.0.1:{port}{pfad}', headers=kopf or {})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.status, json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode('utf-8'))

    patienten = dienst.read_patients(str(dbf), enc)
    nummern = [p['patientNumber'] for p in patienten]
    schritt = max(1, len(nummern) // args.max)
    probe = nummern[::schritt][:args.max]

    # (kopf_dict, pfad)
    aufrufe = [
        ({}, '/praxen'),
        ({'X-DSWin-Praxen': '1'}, '/praxen'),
        ({'X-DSWin-Praxen': '99'}, '/praxen'),
        ({}, '/praxis/katalog'),
        ({'X-DSWin-Praxen': '1'}, '/praxis/katalog'),
        ({}, '/hkps/offen'),
        ({'X-DSWin-Praxen': '1'}, '/hkps/offen'),
        ({}, '/gibt/es/nicht'),
        ({}, '/patients/99999'),
        ({}, '/patients/99999/befunde/01'),
        ({}, '/patients/99999/hkps'),
        ({}, '/patients/99999/hkps/1/planr'),
        ({}, '/patients/abc'),
        ({}, '/patients'),
        ({}, '/patients?q='),
        ({}, '/patients?limit=0&q=a'),
        ({}, '/patients?limit=101&q=a'),
        ({}, '/patients?offset=-1&q=a'),
        ({}, '/patients?q=a&extra=1'),
        ({}, '/patients?q=a'),
        ({}, '/patients?q=e&limit=50&offset=5'),
        ({}, '/patients?q=19&limit=50'),
        ({'X-DSWin-Praxen': '1'}, '/patients?q=a&limit=50'),
        ({'X-DSWin-Praxen': '99'}, '/patients?q=a&limit=50'),
        ({}, '/praxen?x=1'),
        ({}, '/hkps/offen?x=1'),
        ({}, '/praxis/katalog?x=1'),
    ]

    for p in patienten[:: max(1, len(patienten) // 25)]:
        for wort in (p.get('lastName', ''), p.get('firstName', ''), f"{p.get('firstName', '')} {p.get('lastName', '')}", p.get('birthDate', '')):
            if wort.strip():
                aufrufe.append(({}, '/patients?' + urllib.parse.urlencode({'q': wort, 'limit': 100})))

    plaene = 0
    for nr in probe:
        aufrufe.append(({}, f'/patients/{nr}'))
        aufrufe.append(({}, f'/patients/{nr}/befunde/01'))
        aufrufe.append(({}, f'/patients/{nr}/hkps'))
        st, daten = python(f'/patients/{nr}/hkps')
        if st == 200:
            for item in daten.get('items', []):
                aufrufe.append(({}, f"/patients/{nr}/hkps/{item['number']}/planr"))
                plaene += 1
            aufrufe.append(({}, f'/patients/{nr}/hkps/999999/planr'))
    if probe:
        aufrufe.append(({'X-DSWin-Praxen': '99'}, f'/patients/{probe[0]}'))
        aufrufe.append(({'X-DSWin-Praxen': '99'}, f'/patients/{probe[0]}/hkps'))
        aufrufe.append(({'X-DSWin-Praxen': '1'}, f'/patients/{probe[0]}/befunde/01'))

    zeilen = []
    for kopf, pfad in aufrufe:
        pre = ''.join(f'H {k}:{v} ' for k, v in kopf.items())
        zeilen.append(pre + pfad)

    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write('\n'.join(zeilen))
        datei = f.name

    try:
        env = dict(os.environ)
        env['DSWIN_ROOT'] = args.root
        proc = subprocess.run([str(EXE), '--dswin-datei', datei], capture_output=True, text=True, encoding='utf-8', env=env)
        if proc.returncode != 0:
            print('C#-Lauf fehlgeschlagen:', proc.stderr)
            sys.exit(2)
        csharp = [json.loads(z) for z in proc.stdout.splitlines() if z.strip()]
    finally:
        os.unlink(datei)

    abweichungen = 0
    for (kopf, pfad), cs in zip(aufrufe, csharp):
        py_status, py_daten = python(pfad, kopf)
        if py_status != cs['status']:
            abweichungen += 1
            if abweichungen <= 30:
                print(f'STATUS {pfad} {kopf}: Python {py_status} != C# {cs["status"]}')
            continue
        diffs = unterschiede(py_daten, cs['daten'])
        if diffs:
            abweichungen += 1
            if abweichungen <= 30:
                print(f'DIFF {pfad} {kopf}: {", ".join(diffs[:8])}')

    server.shutdown()
    print(f'Geprüft: {len(aufrufe)} Aufrufe ({len(probe)} Patienten von {len(patienten)}, {plaene} Pläne). Abweichungen: {abweichungen}.')
    sys.exit(1 if abweichungen else 0)


if __name__ == '__main__':
    main()

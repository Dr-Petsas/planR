"""Schreibt dieselben Aufträge mit dem Python-Connector und mit der kompilierten PlanR-Bridge
in je eine KOPIE der Z1-Datenbank und vergleicht Antworten und die geschriebenen Tabellen.

Die Praxisdatenbank selbst wird nur gelesen (kopiert). Ausgegeben werden Zähler und Feldnamen,
keine Patientendaten.

Aufruf: python z1_schreib_echt.py [--connector F:\\pvsConnectoR\\connectors\\z1] [--patienten 5]
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path

from z1_vergleich import EXE, unterschiede

TABELLEN = 'ZPLAN,LBLOCK,LBLOCKENTRY,BEH,ABEFUND,PAT'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--connector', default=r'F:\pvsConnectoR\connectors\z1')
    parser.add_argument('--patienten', type=int, default=5)
    parser.add_argument('--behalten', action='store_true', help='Kopien nach dem Lauf nicht löschen')
    args = parser.parse_args()
    sys.path.insert(0, args.connector)
    import z1_connector_service as dienst
    import z1_lesen
    import z1_stamm

    quelle = z1_lesen.mdb_pfad()
    ordner = Path(tempfile.mkdtemp(prefix='z1-schreibvergleich-'))
    kopie = {'py': ordner / 'python.mdb', 'cs': ordner / 'kompiliert.mdb'}
    for ziel in kopie.values():
        shutil.copyfile(quelle, ziel)

    # Vorlagen aus der unveränderten Datenbank: vorhandene Pläne als PlanR-Privatplan, dazu die Referenzpläne.
    patienten = z1_stamm.patienten()[:args.patienten]
    gold = json.loads(Path(__file__).with_name('z1_gold.json').read_text('utf-8'))
    auftraege = []  # (Pfad, Body oder None)

    def plan(text):
        return {'json': text if isinstance(text, str) else json.dumps(text, ensure_ascii=False)}

    erster = patienten[0]['id']
    hkp = next(g['json'] for g in gold if g['op'] == 'hkp')
    auftraege += [
        ('/patients/999999999/hkps', plan(hkp)),
        (f'/patients/{erster}/hkps', {}),
        (f'/patients/{erster}/hkps', None),
        (f'/patients/{erster}/hkps', {'json': ''}),
        (f'/patients/{erster}/hkps', {'json': 'x', 'mehr': 1}),
        (f'/patients/{erster}/hkps', [1]),
        (f'/patients/{erster}/plaene/import', {'json': '{}'}),
        (f'/patients/{erster}/plaene/import', plan(hkp)),
        (f'/patients/{erster}/dokumentation', {}),
        (f'/patients/{erster}/dokumentation', {'text': '   '}),
        (f'/patients/{erster}/dokumentation', {'text': 'wort ' * 120}),
        (f'/patients/{erster}/dokumentation', {'text': 'Kontrolle', 'date': 'kein Datum'}),
        (f'/patients/{erster}/dokumentation', {'text': 'Kontrolle', 'date': 7}),
        (f'/patients/{erster}/dokumentation', {'text': 'Kontrolle', 'extra': 1}),
        (f'/patients/{erster}/dokumentation', {'text': 'Haken \u2713 geht nicht'}),
        ('/patients/999999999/dokumentation', {'text': 'Kontrolle'}),
        (f'/patients/{erster}/befunde/01', {'version': 'falsch', 'teeth': {'11': 'k'}}),
        (f'/patients/{erster}/befunde/01', {'version': 7, 'teeth': {'11': 'k'}}),
        ('/patients/999999999/befunde/01', {'version': 'x', 'teeth': {'11': 'k'}}),
        (f'/patients/{erster}/gibtesnicht', {'json': 'x'}),
    ]
    fehlerfaelle = len(auftraege)
    for p in patienten:
        nr = p['id']
        for g in gold:
            auftraege.append((f'/patients/{nr}/hkps' if g['op'] == 'hkp' else f'/patients/{nr}/plaene/import', plan(g['json'])))
        kopf = {'format': 'planr-plan', 'version': 1, 'datum': '2026-11-03'}
        auftraege += [
            (f'/patients/{nr}/plaene/import', plan(dict(kopf, planart='kva', titel='Kostenvoranschlag   Prophylaxe und mehr als vierzig Zeichen Titel', positionen=[
                {'ebene': 'GOZ', 'nr': '1040', 'zahn': '', 'anzahl': 1, 'faktor': 2.3, 'betrag': 3.62},
                {'ebene': 'GOZ', 'nr': '2197', 'zahn': '16', 'anzahl': 2, 'faktor': 3.5, 'einzelpreis': 25.59, 'bezeichnung': 'Adhäsive  Befestigung'},
                {'ebene': 'GOAE', 'nr': '5000', 'zahn': '36', 'anzahl': 1, 'faktor': 1.8},
                {'ebene': 'GOAE', 'nr': 'Ä1', 'zahn': '', 'anzahl': 1},
                {'ebene': 'BEB', 'nr': '0010', 'zahn': '16', 'anzahl': 1, 'labor': 'eigen', 'betrag': 12.5},
                {'ebene': 'BEL', 'nr': '0010', 'zahn': '16', 'anzahl': 1, 'labor': 'fremd'},
                {'ebene': 'MAT', 'nr': '', 'zahn': '16', 'anzahl': 1, 'bezeichnung': 'Legierung'},
                {'ebene': 'XYZ', 'nr': '1', 'zahn': '', 'anzahl': 1}]))),
            (f'/patients/{nr}/plaene/import', plan(dict(kopf, planart='mkv', titel='', positionen=[
                {'ebene': 'GOZ', 'nr': '2080', 'zahn': '26', 'anzahl': 1, 'faktor': 2.3, 'betrag': 71.92, 'mkv': True},
                {'ebene': 'BEMA', 'nr': '13b', 'zahn': '26', 'anzahl': 1, 'betrag': 48.11},
                {'ebene': 'GOZ', 'nr': '2100', 'zahn': '27', 'anzahl': 1, 'faktor': 3.5, 'betrag': 131.66, 'mkv': True},
                {'ebene': 'BEMA', 'nr': '13c', 'zahn': '27', 'anzahl': 1, 'betrag': 57.2}]))),
            (f'/patients/{nr}/plaene/import', plan(dict(kopf, planart='mkv', positionen=[{'ebene': 'GOZ', 'nr': '2080', 'zahn': '26', 'anzahl': 1}]))),
            (f'/patients/{nr}/plaene/import', plan(dict(kopf, planart='kva', positionen=[{'ebene': 'GOZ', 'nr': '2080', 'zahn': '26', 'anzahl': 1, 'faktor': 12}]))),
            (f'/patients/{nr}/plaene/import', plan(dict(kopf, planart='kva', positionen=[{'ebene': 'BEMA', 'nr': '13b', 'zahn': '26'}]))),
        ]
        auftraege += [
            (f'/patients/{nr}/dokumentation', {'text': '  Kontrolle  o. B.,   Zahnstein entfernt (Größe: 3 €) ' + 'und weiter ' * 12}),
            (f'/patients/{nr}/dokumentation', {'text': 'Nachtrag', 'date': '2026-11-02'}),
            (f'/patients/{nr}/befunde/01', 'BEFUND', {'11': 'k', '36': 'missing', '18': 'kw', '47': 'SW'}),
            (f'/patients/{nr}/befunde/01', 'BEFUND', {'11': 'k'}),
            (f'/patients/{nr}/befunde/01', 'BEFUND', {'11': 'healthy', '36': '', '21': ')(', '22': 'ur'}),
            (f'/patients/{nr}/befunde/01', 'BEFUND', {'11': 'unbekannt'}),
            (f'/patients/{nr}/befunde/01', 'BEFUND', {'11': 'qq'}),
            (f'/patients/{nr}/befunde/01', 'BEFUND', {}),
        ]

    # Python-Connector auf seiner Kopie
    os.environ['Z1_MDB'] = str(kopie['py'])
    server = dienst.make_server(0, True)
    port = server.server_port
    threading.Thread(target=server.serve_forever, daemon=True).start()

    def python(pfad, body=None, post=False):
        daten = None if not post else b'' if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8')
        anfrage = urllib.request.Request(f'http://127.0.0.1:{port}{pfad}', data=daten, method='POST' if post else 'GET',
                                         headers={'Content-Type': 'application/json'} if post else {})
        try:
            with urllib.request.urlopen(anfrage, timeout=180) as r:
                return r.status, json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode('utf-8'))

    zeilen, python_antworten = [], []
    for auftrag in auftraege:
        pfad, body = auftrag[0], auftrag[1]
        if body == 'BEFUND':  # Version wie PlanR: vorher lesen
            body = {'version': python(pfad)[1].get('version', ''), 'teeth': auftrag[2]}
        python_antworten.append(python(pfad, body, post=True))
        zeilen.append(f'POST {pfad}' + ('' if body is None else ' ' + json.dumps(body, ensure_ascii=False)))
    lesen = []
    for p in patienten:
        nr = p['id']
        lesen += [f'/patients/{nr}/befunde/01', f'/patients/{nr}/hkps', f'/patients/{nr}/clinical']
        lesen += [f"/patients/{nr}/hkps/{x['number']}/planr" for x in python(f'/patients/{nr}/hkps')[1].get('items', [])]
    lesen.append('/hkps/offen')
    python_antworten += [python(pfad) for pfad in lesen]
    zeilen += lesen
    server.shutdown()

    # Kompilierte Bridge auf ihrer Kopie
    umgebung = dict(os.environ, Z1_MDB=str(kopie['cs']))
    with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write('\n'.join(zeilen))
    lauf = subprocess.run([str(EXE), '--z1-datei', f.name, '--z1-schreiben'], capture_output=True, text=True, encoding='utf-8', timeout=3600, env=umgebung)
    Path(f.name).unlink()
    if lauf.returncode:
        print('Kompilierte Bridge:', lauf.stderr.strip()[:2000])
        return 2
    kompiliert = [json.loads(z) for z in lauf.stdout.splitlines() if z.strip()]
    if len(kompiliert) != len(zeilen):
        print(f'Kompilierte Bridge lieferte {len(kompiliert)} von {len(zeilen)} Antworten.')
        return 2

    abweichend, status = 0, {}
    for i, ((code, daten), cs) in enumerate(zip(python_antworten, kompiliert)):
        if i < len(auftraege):
            status[code] = status.get(code, 0) + 1
        diff = ([f'Status {code} / {cs["status"]}'] if code != cs['status'] else []) + unterschiede(daten, cs['daten'])
        if diff:
            abweichend += 1
            if abweichend <= 30:
                art = 'Fehlerfall' if i < fehlerfaelle else 'Schreiben' if i < len(auftraege) else 'Lesen danach'
                weg = '/'.join(zeilen[i].split(' ')[1 if zeilen[i].startswith('POST ') else 0].split('/')[3:]) or zeilen[i].split('?')[0]
                print(f'ABWEICHUNG {art} #{i} {weg} |', '; '.join(diff[:8]))

    # Geschriebene Tabellen beider Kopien
    def abzug(mdb):
        lauf = subprocess.run([str(EXE), '--z1-abzug', TABELLEN], capture_output=True, text=True, encoding='utf-8', timeout=3600, env=dict(os.environ, Z1_MDB=str(mdb)))
        if lauf.returncode:
            raise RuntimeError(lauf.stderr.strip()[:2000])
        aus = {}
        for zeile in lauf.stdout.splitlines():
            tabelle, _, satz = zeile.partition('\t')
            aus.setdefault(tabelle, []).append(json.loads(satz))
        return aus

    vorher, py, cs = abzug(quelle), abzug(kopie['py']), abzug(kopie['cs'])
    tabellen_ab = 0
    for tabelle in TABELLEN.split(','):
        a, b, alt = py.get(tabelle, []), cs.get(tabelle, []), vorher.get(tabelle, [])
        spalten = set()
        if len(a) == len(b):
            for x, y in zip(a, b):
                spalten |= {k for k in set(x) | set(y) if x.get(k) != y.get(k)}
        gleich = len(a) == len(b) and not spalten
        tabellen_ab += not gleich
        neu = len(a) - len(alt)
        geaendert = sum(1 for x in a if x not in alt) - max(neu, 0)
        print(f'{tabelle}: {len(alt)} Sätze vorher, Python {len(a)}, kompiliert {len(b)} ({neu} neu, {geaendert} geändert) – '
              + ('gleich' if gleich else 'ABWEICHEND ' + (', '.join(sorted(spalten)) or 'Satzzahl')))
    print(f'{len(auftraege)} Schreibaufträge an {len(patienten)} Patienten ({fehlerfaelle} Fehlerfälle; Antworten: '
          + ', '.join(f'{n}x {c}' for c, n in sorted(status.items())) + f'), {len(lesen)} Leseaufrufe danach; '
          f'{abweichend} Antworten abweichend, {tabellen_ab} Tabellen abweichend.')
    gruende = {}
    for (code, daten), zeile in zip(python_antworten[fehlerfaelle:len(auftraege)], zeilen[fehlerfaelle:]):
        if code >= 400:
            grund = zeile.split(' ')[1].split('/')[-1] + ': ' + ''.join('#' if c.isdigit() else c for c in str(daten.get('error', '')))[:90]
            gruende[grund] = gruende.get(grund, 0) + 1
    for grund, n in sorted(gruende.items()):
        print(f'  abgelehnt {n}x {grund}')
    if args.behalten:
        print('Kopien:', ordner)
    else:
        shutil.rmtree(ordner, ignore_errors=True)
    return 1 if abweichend or tabellen_ab else 0


if __name__ == '__main__':
    sys.exit(main())

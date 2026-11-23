"""Echter Schreib-Paritätsvergleich für DS-Win: Python-Connector vs. kompilierte C#-Bridge.

Legt zwei identische temporäre Kopien der DS-Win-Tabellen an (F:\\TDAMP\\DS wird NIE beschrieben),
führt identische POST-Schreibaufträge gegen Python (Kopie A) und C# (Kopie B) aus,
vergleicht alle HTTP-Antworten, alle Post-Write-Leserouten UND die resultierenden DBF/Memo-Zeilen.

Aufruf: python dswin_schreib_echt.py [--connector F:\\pvsConnectoR\\connectors\\dampsoft] [--root F:\\TDAMP\\DS]
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

HIER = Path(__file__).resolve().parent
EXE = HIER.parent / 'PlanR.Bridge.Dienst' / 'bin' / 'Release' / 'net8.0-windows' / 'win-x86' / 'PlanR.Bridge.Dienst.exe'

SKIP_PREFIXES = ('pzndb', 'ebm', 'icd10', 'ops05', 'aktflyer', 'akass')


def kopiere_dswin(quelle: Path, ziel: Path):
    """Kopiert die für den Connector relevanten DS-Win-Dateien (~15 MB) in ein temporäres Verzeichnis."""
    ziel.mkdir(parents=True, exist_ok=True)
    for item in quelle.iterdir():
        if item.is_file() and (item.name.lower() in ('cbstand.dll', 'cbstandx64.dll', 'server.cfg') or item.suffix.lower() in ('.cfg', '.ini')):
            shutil.copy2(item, ziel / item.name)
    daten_q = quelle / 'daten'
    daten_z = ziel / 'daten'
    daten_z.mkdir(parents=True, exist_ok=True)
    for item in daten_q.iterdir():
        low = item.name.lower()
        if item.is_file():
            if any(low.startswith(p) for p in SKIP_PREFIXES):
                continue
            shutil.copy2(item, daten_z / item.name)
        elif item.is_dir() and low.startswith('prax'):
            shutil.copytree(item, daten_z / item.name)


def normalisiere(obj):
    """Entfernt rein zufällige/zeitabhängige Felder (backup-ID, Uhrzeit HH:MM, Pfad), behält alles Fachliche."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in ('backup', 'source'):
                out[k] = '<MASK>'
            elif k == 'time' and isinstance(v, str) and len(v) == 5 and v[2] == ':':
                out[k] = '<HH:MM>'
            else:
                out[k] = normalisiere(v)
        return out
    if isinstance(obj, list):
        return [normalisiere(x) for x in obj]
    return obj


def unterschiede(a, b, weg=''):
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
        return [] if abs(float(a) - float(b)) < 1e-9 else [f'{weg} ({a} != {b})']
    return [] if a == b else [f'{weg} ({a!r} != {b!r})']


def vergleiche_tabellen(py_root: Path, cs_root: Path, connector_dir: Path, quelle: Path):
    sys.path.insert(0, str(connector_dir))
    from dbf_tables import table, value
    import dswin_path

    enc = dswin_path.guess_encoding(py_root / 'daten' / 'patient.dbf')
    rel_pfade = [
        'daten/NOTIZEN.DBF',
        'daten/GOZ08.DBF',
        'daten/PRAX1/BEFUND.DBF',
        'daten/PRAX1/HKPPLAN.DBF',
        'daten/PRAX1/HKPPLAN2.DBF',
        'daten/PRAX1/HKPLST.DBF',
    ]
    for cand in ('BEB.DBF', 'BEB97.DBF', 'BEB1.DBF', 'BEB2.DBF', 'BEB3.DBF', 'BEB4.DBF', 'BEB5.DBF'):
        if (py_root / 'daten' / cand).is_file():
            rel_pfade.append(f'daten/{cand}')

    mask_fields = {'E_ZEIT', 'G_ZEIT', 'UHRZEIT'}
    diffs = []
    for rel in rel_pfade:
        pa, pb = py_root / rel, cs_root / rel
        if not pa.is_file() or not pb.is_file():
            continue
        fa, ra, wa = table(pa)
        fb, rb, wb = table(pb)
        if fa != fb or wa != wb or len(ra) != len(rb):
            diffs.append(f'{rel}: Struktur/Zeilenanzahl ({len(ra)} vs {len(rb)})')
            continue
        for idx, (row_a, row_b) in enumerate(zip(ra, rb)):
            if row_a == row_b:
                continue
            for name, (kind, o, n, _) in fa.items():
                if name in mask_fields:
                    continue
                if kind == 'M':
                    # Memo-Pointer können je nach Block-Allokation gleich sein; prüfe mindestens ob beide 0 oder beide >0
                    va = value(row_a, fa, name, enc)
                    vb = value(row_b, fb, name, enc)
                    if bool(va) != bool(vb):
                        diffs.append(f'{rel}[{idx}].{name}: memo {va} vs {vb}')
                    continue
                if row_a[o:o+n] != row_b[o:o+n]:
                    diffs.append(f'{rel}[{idx}].{name}: {row_a[o:o+n]!r} != {row_b[o:o+n]!r}')
    # Memo-Inhalte aus HKPLST.FPT vergleichen (über CodeBase in Python)
    from hkp_writer import Appender
    import ctypes as C
    app_a = Appender(quelle / 'cbstandx64.dll')
    app_b = Appender(quelle / 'cbstandx64.dll')
    try:
        ha = app_a.open(py_root / 'daten' / 'PRAX1' / 'HKPLST.DBF')
        hb = app_b.open(cs_root / 'daten' / 'PRAX1' / 'HKPLST.DBF')
        fa, ra, _ = table(py_root / 'daten' / 'PRAX1' / 'HKPLST.DBF')
        for recno in range(1, len(ra) + 1):
            app_a.e.go(ha, recno, 1)
            app_b.e.go(hb, recno, 1)
            for mf in ('GRUENDE', 'ROEBEF'):
                if mf not in fa:
                    continue
                fa_p = app_a.e.field(ha, mf.encode())
                fb_p = app_b.e.field(hb, mf.encode())
                la, lb = app_a.memo_len(fa_p), app_b.memo_len(fb_p)
                ba = C.string_at(app_a.memo_ptr(fa_p), la) if la else b''
                bb = C.string_at(app_b.memo_ptr(fb_p), lb) if lb else b''
                if ba != bb:
                    diffs.append(f'HKPLST[{recno}].{mf}: {ba!r} != {bb!r}')
    finally:
        app_a.close()
        app_b.close()
    return diffs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--connector', default=r'F:\pvsConnectoR\connectors\dampsoft')
    parser.add_argument('--root', default=r'F:\TDAMP\DS')
    args = parser.parse_args()
    quelle = Path(args.root)
    connector_dir = Path(args.connector)

    with tempfile.TemporaryDirectory(prefix='dswin-schreib-test-', ignore_cleanup_errors=True) as tmp:
        tmp_p = Path(tmp)
        py_root = tmp_p / 'py_ds'
        cs_root = tmp_p / 'cs_ds'
        cs_bak = tmp_p / 'cs_backups'
        kopiere_dswin(quelle, py_root)
        kopiere_dswin(quelle, cs_root)

        # WICHTIG: DSWIN_ROOT auf py_root setzen BEVOR connector_service importiert wird!
        os.environ['DSWIN_ROOT'] = str(py_root)
        sys.path.insert(0, str(connector_dir))
        import connector_service as dienst
        import dswin_path

        dbf = py_root / 'daten' / 'patient.dbf'
        enc = dswin_path.guess_encoding(dbf)
        server = dienst.make_server(str(dbf), enc, port=0, enable_write=True, read_only_reason=None)
        port = server.server_port
        threading.Thread(target=server.serve_forever, daemon=True).start()

        def py_call(methode, pfad, body=None, kopf=None):
            data = json.dumps(body).encode('utf-8') if body is not None else None
            headers = dict(kopf or {})
            if data is not None:
                headers.setdefault('Content-Type', 'application/json')
            req = urllib.request.Request(f'http://127.0.0.1:{port}{pfad}', data=data, headers=headers, method=methode)
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    return r.status, json.loads(r.read().decode('utf-8'))
            except urllib.error.HTTPError as exc:
                return exc.code, json.loads(exc.read().decode('utf-8'))

        # Patienten + Kassenstatus ermitteln
        patienten = dienst.read_patients(str(dbf), enc)
        kasse_pat = next((p['patientNumber'] for p in patienten if p.get('insuranceType') != 'PKV'), patienten[0]['patientNumber'])
        privat_pat = next((p['patientNumber'] for p in patienten if p.get('insuranceType') == 'PKV'), None)

        # Aktuelle Befund-Version lesen (identisch in py_root und cs_root)
        st_b, bef0 = py_call('GET', f'/patients/{kasse_pat}/befunde/01')
        assert st_b == 200, f'Befund lesen fehlgeschlagen: {st_b} {bef0}'
        bef_ver = bef0['version']

        # Test-Payloads aufbauen
        hkp_payload = {
            'verwaltung': {'ausstellungsdatum': '2026-11-23', 'erlaeuterung': 'Paritätstest Krone 16'},
            'zuschuss': {'bonus': 70},
            'zaehne': {
                '16': {'B': 'ww', 'R': 'KM', 'TP': 'KV'},
                '15': {'B': 'f', 'R': '', 'TP': ''},
            },
            'positionen': [
                {'id': 'p1', 'ebene': 'BEMA', 'nr': '20b', 'anzahl': 1, 'zahn': '16'},
                {'id': 'p2', 'ebene': 'GOZ', 'nr': '2210', 'anzahl': 1, 'zahn': '16'},
                {'id': 'p3', 'ebene': 'BEL', 'nr': '0010', 'anzahl': 1, 'zahn': '16', 'labor': 'fremd'},
                {'id': 'p4', 'ebene': 'BEB', 'nr': '0001', 'anzahl': 1, 'zahn': '16', 'labor': 'eigen'},
                {'id': 'p5', 'ebene': 'MAT', 'nr': '', 'bezeichnung': 'Praxismaterial Abformung', 'anzahl': 1, 'zahn': '16'},
            ],
            'ergebnis': {
                'summen': {
                    'bemaHonorar': 180.0, 'gozHonorar': 260.0, 'materialUndLabor': 310.0,
                    'gesamt': 750.0, 'festzuschuss': 280.0, 'festzuschuss100': 400.0,
                    'eigenanteil': 470.0, 'fremdNetto': 100.0, 'fremdMwst': 7.0,
                },
                'positionen': [
                    {'id': 'p1', 'betrag': 180.0, 'einzelpreis': 180.0, 'punkte': 150.0, 'punktwert': 1.2},
                    {'id': 'p2', 'betrag': 260.0, 'einzelpreis': 260.0, 'faktor': 2.3},
                    {'id': 'p3', 'betrag': 100.0, 'einzelpreis': 100.0, 'labor': 'fremd'},
                    {'id': 'p4', 'betrag': 150.0, 'einzelpreis': 150.0, 'labor': 'eigen'},
                    {'id': 'p5', 'betrag': 60.0, 'einzelpreis': 60.0},
                ],
                'befunde': [
                    {'nr': '1.1', 'zahnGebiet': '16', 'anzahl': 1, 'betrag100': 400.0, 'betrag': 280.0},
                ],
            },
        }

        kva_payload = {
            'format': 'planr-plan', 'version': 1, 'planart': 'kva', 'art': 'IM',
            'datum': '2026-11-23', 'titel': 'Parität KVA Implantat 36',
            'zaehne': {'36': {'B': 'f'}},
            'positionen': [
                {'ebene': 'GOZ', 'nr': '9010', 'anzahl': 1, 'zahn': '36', 'faktor': 3.5, 'einzelpreis': 255.82, 'betrag': 255.82,
                 'bezeichnung': 'Implantatinsertion',
                 'begruendung': 'Erhöhter Zeitaufwand und Schwierigkeitsgrad wegen schmalem Kieferkamm und dichtem Knochen in Region 36.'},
                {'ebene': 'GOZ', 'nr': '0110', 'anzahl': 1, 'zahn': '36', 'faktor': 2.3, 'einzelpreis': 52.21, 'betrag': 52.21,
                 'bezeichnung': 'OP-Mikroskop Zuschlag'},
                {'ebene': 'GOAE', 'nr': '5000', 'anzahl': 1, 'zahn': '36', 'faktor': 1.8, 'einzelpreis': 10.49, 'betrag': 10.49,
                 'bezeichnung': 'Röntgen Zahnfilm'},
                {'ebene': 'GOZ', 'nr': '9999a', 'anzahl': 1, 'zahn': '36', 'faktor': 2.3, 'einzelpreis': 115.0, 'betrag': 115.0,
                 'bezeichnung': 'Knochenersatz Sonderleistung'},
                {'ebene': 'BEB', 'nr': '0001', 'anzahl': 1, 'zahn': '36', 'einzelpreis': 45.0, 'betrag': 45.0, 'labor': 'fremd', 'bezeichnung': 'Modellherstellung'},
                {'ebene': 'BEB', 'nr': '8899', 'anzahl': 1, 'zahn': '36', 'einzelpreis': 85.0, 'betrag': 85.0, 'labor': 'eigen', 'bezeichnung': 'Individuelle Bohrschablone PlanR'},
                {'ebene': 'MAT', 'nr': '', 'anzahl': 1, 'zahn': '36', 'einzelpreis': 195.0, 'betrag': 195.0, 'labor': 'eigen', 'bezeichnung': 'Implantatkörper ICX-Templant 4.1x10'},
                {'ebene': 'LABOR', 'nr': '', 'anzahl': 1, 'zahn': '36', 'einzelpreis': 30.0, 'betrag': 30.0, 'labor': 'fremd', 'bezeichnung': 'Pauschale Versand'},
            ],
            'summen': {'honorar': 433.52, 'laborEigen': 280.0, 'laborFremd': 75.0, 'gesamt': 788.52},
        }

        mkv_payload = {
            'format': 'planr-plan', 'version': 1, 'planart': 'mkv', 'art': 'KO',
            'datum': '2026-11-23', 'titel': 'Parität MKV Füllung 24',
            'zaehne': {'24': {'B': 'c', 'TP': 'Y2'}},
            'positionen': [
                {'ebene': 'GOZ', 'nr': '2080', 'mkv': True, 'anzahl': 1, 'zahn': '24', 'faktor': 2.3, 'einzelpreis': 94.39, 'betrag': 94.39, 'bezeichnung': 'Komposit zweiflächig'},
                {'ebene': 'BEMA', 'nr': '13b', 'anzahl': 1, 'zahn': '24', 'punkte': 39, 'punktwert': 1.25, 'einzelpreis': 48.75, 'betrag': 48.75, 'bezeichnung': 'Kassenfüllung zweiflächig'},
            ],
            'summen': {'honorar': 94.39, 'laborEigen': 0.0, 'laborFremd': 0.0, 'gesamt': 45.64},
        }

        edit_hdr = {'X-DSWIN-EDIT': '1'}
        schritte = [
            # Dokumentation (Notizen)
            ('POST', f'/patients/{kasse_pat}/dokumentation', {'text': 'Befundkontrolle unauffällig. ÄÖÜß Test.'}, edit_hdr),
            ('POST', f'/patients/{kasse_pat}/dokumentation', {'text': ' '.join(['Dokumentationszeile'] * 12), 'date': '2026-11-20'}, edit_hdr),
            ('POST', f'/patients/{kasse_pat}/dokumentation', {'text': '   '}, edit_hdr),
            ('POST', f'/patients/{kasse_pat}/dokumentation', {'text': 'Test', 'date': 'kein-datum'}, edit_hdr),
            ('POST', f'/patients/{kasse_pat}/hkps', None, {}),
            ('POST', '/patients/99999/dokumentation', {'text': 'Fremder Patient'}, edit_hdr),
            # Befund 01
            ('POST', f'/patients/{kasse_pat}/befunde/01', {'version': bef_ver, 'teeth': {'16': 'k', '15': 'f'}}, edit_hdr),
            ('POST', f'/patients/{kasse_pat}/befunde/01', {'version': bef_ver, 'teeth': {'16': 'w'}}, edit_hdr),  # veraltete Version -> 409
            ('POST', f'/patients/{kasse_pat}/befunde/01', {'version': '0' * 64, 'teeth': {'16': 'UNGUELTIG'}}, edit_hdr),
            # HKP Import + Fehlerfälle
            ('POST', f'/patients/{kasse_pat}/hkps/import', {'json': json.dumps(hkp_payload)}, edit_hdr),
            ('POST', f'/patients/{kasse_pat}/hkps/import', {'json': '{"ungueltig": true}'}, edit_hdr),
            # KVA Import
            ('POST', f'/patients/{kasse_pat}/plaene/import', {'json': json.dumps(kva_payload)}, edit_hdr),
            # MKV Import
            ('POST', f'/patients/{kasse_pat}/plaene/import', {'json': json.dumps(mkv_payload)}, edit_hdr),
            # Plan Fehlerfall
            ('POST', f'/patients/{kasse_pat}/plaene/import', {'json': '{"format":"falsch"}'}, edit_hdr),
        ]
        if privat_pat:
            schritte.append(('POST', f'/patients/{privat_pat}/plaene/import', {'json': json.dumps(mkv_payload)}, edit_hdr))

        # Post-Write Leseaufrufe
        schritte += [
            ('GET', f'/patients/{kasse_pat}/befunde/01', None, {}),
            ('GET', f'/patients/{kasse_pat}/hkps', None, {}),
            ('GET', '/hkps/offen', None, {}),
            ('GET', '/praxis/katalog', None, {}),
        ]

        # 1) Gegen Python ausführen
        py_erg = []
        neue_plaene = []
        for m, pfad, body, kopf in schritte:
            st, daten = py_call(m, pfad, body, kopf)
            py_erg.append((st, daten))
            if m == 'POST' and st == 201 and ('/hkps/import' in pfad or '/plaene/import' in pfad) and 'number' in daten:
                neue_plaene.append(daten['number'])
        for nr in neue_plaene:
            p = f'/patients/{kasse_pat}/hkps/{nr}/planr'
            schritte.append(('GET', p, None, {}))
            py_erg.append(py_call('GET', p, None, {}))
        server.shutdown()

        # 2) Identische Schrittfolge gegen C# ausführen (auf cs_root)
        zeilen = []
        for m, pfad, body, kopf in schritte:
            pre = ''.join(f'H {k}:{v} ' for k, v in kopf.items())
            if m == 'POST':
                zeilen.append(f'{pre}POST {pfad}' if body is None else f'{pre}POST {pfad} {json.dumps(body, ensure_ascii=False)}')
            else:
                zeilen.append(f'{pre}{pfad}')

        batch = tmp_p / 'cs_batch.txt'
        batch.write_text('\n'.join(zeilen), encoding='utf-8')
        env = dict(os.environ)
        env['DSWIN_ROOT'] = str(cs_root)
        proc = subprocess.run(
            [str(EXE), '--dswin-datei', str(batch), '--dswin-schreiben', '--dswin-backup', str(cs_bak)],
            capture_output=True, text=True, encoding='utf-8', env=env,
        )
        if proc.returncode != 0:
            print('C#-Lauf fehlgeschlagen:', proc.stderr)
            sys.exit(2)
        cs_erg = [json.loads(z) for z in proc.stdout.splitlines() if z.strip()]

        # 3) Antworten vergleichen
        antwort_diffs = 0
        for i, ((m, pfad, _, _), (py_st, py_d), cs) in enumerate(zip(schritte, py_erg, cs_erg)):
            if py_st != cs['status']:
                antwort_diffs += 1
                print(f'[{i}] STATUS {m} {pfad}: Python {py_st} != C# {cs["status"]} | py={py_d} cs={cs["daten"]}')
                continue
            d = unterschiede(normalisiere(py_d), normalisiere(cs['daten']))
            if d:
                antwort_diffs += 1
                print(f'[{i}] DIFF {m} {pfad}: {", ".join(d[:8])}')

        # 4) Resultierende DBF-Tabellen + FPT-Memos vergleichen
        tab_diffs = vergleiche_tabellen(py_root, cs_root, connector_dir, quelle)
        for td in tab_diffs[:25]:
            print('TABELLE DIFF:', td)

        print(f'Schreibvergleich: {len(schritte)} Aufrufe ({len(neue_plaene)} neue Pläne). Antwort-Diffs: {antwort_diffs}. Tabellen-Diffs: {len(tab_diffs)}.')
        sys.exit(1 if (antwort_diffs or tab_diffs) else 0)


if __name__ == '__main__':
    main()

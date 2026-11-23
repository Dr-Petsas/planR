"""Schreibt dieselben Aufträge mit dem Python-Connector und mit der kompilierten PlanR-Bridge
in je eine KOPIE der DENS-Datenbank und vergleicht Antworten sowie alle danach gelesenen Daten.

Die echte DENS-Datenbank wird nur kopiert, niemals beschrieben. Ausgegeben werden nur Zähler
und Namen abweichender Felder, keine Patientendaten.

Aufruf: python dens_schreib_echt.py [--connector F:\\pvsConnectoR\\connectors\\dens]
"""
import argparse
import configparser
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

from dens_vergleich import EXE, unterschiede


def ini_kopie(echte_ini: Path, bank_dir: Path, ziel_ini: Path, tenant: str):
    raw = echte_ini.read_text(encoding='cp1252')
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.optionxform = str
    cfg.read_string(raw)
    cfg['MANDANTEN'][f'DBPATH{tenant}'] = str(bank_dir)
    with ziel_ini.open('w', encoding='cp1252') as f:
        cfg.write(f, space_around_delimiters=False)


def ohne_zeit(wert):
    """Entfernt minuten-/sekundenabhängige Felder (Uhrzeit der Anlage, RDM-Recordadresse)."""
    if isinstance(wert, dict):
        return {k: ohne_zeit(v) for k, v in wert.items() if k not in ('time', 'address')}
    if isinstance(wert, list):
        return [ohne_zeit(x) for x in wert]
    return wert


def baue_auftraege(pat_id: str, befund_version_fn):
    def p(obj):
        return {'json': json.dumps(obj, ensure_ascii=False)}

    # 1) Regelversorgung HKP (BEMA + BEL + fehlender Zahn 15 -> Planbefund 3)
    hkp_regel = {
        'verwaltung': {'ausstellungsdatum': '2026-11-15'},
        'zuschuss': {'bonus': '60', 'haertefall': False},
        'zaehne': {
            '14': {'B': 'kw', 'R': 'K', 'TP': 'K'},
            '15': {'B': 'f', 'R': 'B', 'TP': 'B'},
            '16': {'B': 'kw', 'R': 'K', 'TP': 'K'},
        },
        'positionen': [
            {'id': 'b1', 'ebene': 'BEMA', 'nr': '91b', 'zahn': '14', 'anzahl': 1},
            {'id': 'b2', 'ebene': 'BEMA', 'nr': '92', 'zahn': '15', 'anzahl': 1},
            {'id': 'b3', 'ebene': 'BEMA', 'nr': '91b', 'zahn': '16', 'anzahl': 1},
            {'id': 'l1', 'ebene': 'BEL', 'nr': '0010', 'zahn': '14-16', 'anzahl': 1, 'labor': 'fremd', 'bezeichnung': 'Modell'},
            {'id': 'l2', 'ebene': 'BEL', 'nr': '1022', 'zahn': '14-16', 'anzahl': 2, 'labor': 'fremd', 'bezeichnung': 'Vollkrone Metall'},
        ],
        'ergebnis': {
            'versorgungsart': 'regel',
            'summen': {
                'bemaHonorar': 286.65, 'gozHonorar': 0.0, 'materialUndLabor': 241.82,
                'gesamt': 528.47, 'festzuschuss': 317.08, 'festzuschuss100': 528.47, 'eigenanteil': 211.39,
            },
            'positionen': [
                {'id': 'b1', 'punkte': 142, 'punktwert': 0.735, 'betrag': 104.37},
                {'id': 'b2', 'punkte': 106, 'punktwert': 0.735, 'betrag': 77.91},
                {'id': 'b3', 'punkte': 142, 'punktwert': 0.735, 'betrag': 104.37},
                {'id': 'l1', 'einzelpreis': 12.00, 'betrag': 12.00, 'labor': 'fremd'},
                {'id': 'l2', 'einzelpreis': 107.00, 'betrag': 214.00, 'labor': 'fremd'},
            ],
            'befunde': [
                {'nr': '2.1', 'zahnGebiet': '15', 'anzahl': 1, 'betrag100': 528.47},
            ],
        },
    }

    # 2) Gleichartiger HKP (BEMA + GOZ + BEB + MAT Hochgold + MAT Zirkon)
    # GOZ 2210: 1475 Punkte * 0.0562421 * 2.3 = 190.80
    hkp_gleich = {
        'verwaltung': {'ausstellungsdatum': '2026-11-16'},
        'zuschuss': {'bonus': 70, 'haertefall': False},
        'zaehne': {
            '24': {'B': 'kw', 'R': 'K', 'TP': 'KV'},
        },
        'positionen': [
            {'id': 'g1', 'ebene': 'GOZ', 'nr': '2210', 'zahn': '24', 'anzahl': 1},
            {'id': 'b1', 'ebene': 'BEMA', 'nr': '91b', 'zahn': '24', 'anzahl': 1},
            {'id': 'l1', 'ebene': 'BEB', 'nr': '0021', 'zahn': '24', 'anzahl': 1, 'labor': 'eigen', 'bezeichnung': 'Sägemodell'},
            {'id': 'l2', 'ebene': 'BEB', 'nr': '2999', 'zahn': '24', 'anzahl': 1, 'labor': 'fremd', 'bezeichnung': 'PlanR Spezialverblendung'},
            {'id': 'm1', 'ebene': 'MAT', 'nr': '', 'zahn': '24', 'anzahl': 1, 'labor': 'fremd', 'bezeichnung': 'Hochgoldlegierung 1g'},
            {'id': 'm2', 'ebene': 'MAT', 'nr': '', 'zahn': '24', 'anzahl': 1, 'labor': 'fremd', 'bezeichnung': 'Zirkonoxid Rohling'},
        ],
        'ergebnis': {
            'versorgungsart': 'gleichartig',
            'summen': {
                'bemaHonorar': 104.37, 'gozHonorar': 190.80, 'materialUndLabor': 246.10,
                'gesamt': 541.27, 'festzuschuss': 280.00, 'festzuschuss100': 400.00, 'eigenanteil': 261.27,
            },
            'positionen': [
                {'id': 'g1', 'punkte': 1475, 'faktor': 2.3, 'einzelpreis': 190.80, 'betrag': 190.80},
                {'id': 'b1', 'punkte': 142, 'punktwert': 0.735, 'betrag': 104.37},
                {'id': 'l1', 'einzelpreis': 25.00, 'betrag': 25.00, 'labor': 'eigen'},
                {'id': 'l2', 'einzelpreis': 85.00, 'betrag': 85.00, 'labor': 'fremd'},
                {'id': 'm1', 'einzelpreis': 70.00, 'betrag': 70.00, 'labor': 'fremd'},
                {'id': 'm2', 'einzelpreis': 50.00, 'betrag': 50.00, 'labor': 'fremd'},
            ],
            'befunde': [{'nr': '1.1', 'zahnGebiet': '24', 'anzahl': 1, 'betrag100': 400.00}],
        },
    }

    # 3) KVA Kons + GOÄ (inkl. Ä34 fehlend -> skipped + lange Begründung > 86 Zeichen + Labor)
    kva_kons = {
        'format': 'planr-plan', 'version': 1, 'planart': 'kva', 'art': 'KO',
        'datum': '2026-11-16', 'titel': 'KVA Kons und Prophylaxe Testplan',
        'positionen': [
            {'ebene': 'GOZ', 'nr': '2197', 'zahn': '16', 'anzahl': 2, 'faktor': 3.5, 'einzelpreis': 25.59,
             'bezeichnung': 'Adhäsive Befestigung',
             'begruendung': 'Erhöhter Zeitaufwand wegen erschwerter Trockenlegung bei subgingivalem Kavitätenrand und starkem Speichelfluss im Molarenbereich.'},
            {'ebene': 'GOAE', 'nr': 'Ä1', 'zahn': '', 'anzahl': 1, 'faktor': 2.3, 'einzelpreis': 10.72, 'bezeichnung': 'Beratung'},
            {'ebene': 'GOAE', 'nr': '34', 'zahn': '', 'anzahl': 1, 'faktor': 2.3, 'einzelpreis': 40.22, 'betrag': 40.22, 'bezeichnung': 'Erörterung'},
            {'ebene': 'BEB', 'nr': '0021', 'zahn': '16', 'anzahl': 1, 'einzelpreis': 18.50, 'betrag': 18.50, 'labor': 'eigen', 'bezeichnung': 'Sägemodell', 'mwst': 7},
            {'ebene': 'MAT', 'nr': '', 'zahn': '16', 'anzahl': 1, 'einzelpreis': 12.00, 'betrag': 12.00, 'labor': 'eigen', 'bezeichnung': 'Komposit Material', 'mwst': 19},
        ],
    }

    # 4) MKV Füllung
    mkv_plan = {
        'format': 'planr-plan', 'version': 1, 'planart': 'mkv', 'art': 'KO',
        'datum': '2026-11-16', 'titel': 'MKV Komposit 26 27',
        'positionen': [
            {'ebene': 'GOZ', 'nr': '2080', 'zahn': '26', 'anzahl': 1, 'faktor': 2.3, 'einzelpreis': 71.92, 'mkv': True, 'bezeichnung': 'Komposit 2fl'},
            {'ebene': 'BEMA', 'nr': '13b', 'zahn': '26', 'anzahl': 1, 'punkte': 41, 'punktwert': 1.15},
            {'ebene': 'GOZ', 'nr': '2100', 'zahn': '27', 'anzahl': 1, 'faktor': 3.5, 'einzelpreis': 131.66, 'mkv': True, 'bezeichnung': 'Komposit 3fl', 'begruendung': 'Tiefe Approximalkaries'},
            {'ebene': 'BEMA', 'nr': '13c', 'zahn': '27', 'anzahl': 1, 'punkte': 52, 'punktwert': 1.15},
        ],
    }

    # 5) Privat-ZE (Privatprothetik mit fehlendem Zahn 36 + Analogziffer 9000a + Labor + Begründung)
    # Labor: 1 * 120.00 * 1.07 = 128.40 + 1 * 30.00 * 1.07 = 32.10 -> 160.50
    privat_ze = {
        'format': 'planr-plan', 'version': 1, 'planart': 'kva', 'art': 'ZE',
        'datum': '2026-11-16', 'titel': 'Privat-ZE Implantatkrone 36',
        'zaehne': {'36': {'B': 'f'}, '35': {'B': 'kw'}},
        'summen': {'laborEigen': 32.10, 'laborFremd': 128.40},
        'positionen': [
            {'ebene': 'GOZ', 'nr': '2200', 'zahn': '36', 'anzahl': 1, 'faktor': 2.3, 'einzelpreis': 170.30, 'bezeichnung': 'Vollkrone', 'begruendung': 'Erschwerte Präparation'},
            {'ebene': 'GOZ', 'nr': '9000a', 'zahn': '36', 'anzahl': 1, 'faktor': 2.3, 'einzelpreis': 95.00, 'bezeichnung': 'Digitale Bohrschablone'},
            {'ebene': 'BEB', 'nr': '0021', 'zahn': '36', 'anzahl': 1, 'einzelpreis': 30.00, 'betrag': 30.00, 'labor': 'eigen', 'bezeichnung': 'Sägemodell', 'mwst': 7},
            {'ebene': 'LABOR', 'nr': '', 'zahn': '36', 'anzahl': 1, 'einzelpreis': 120.00, 'betrag': 120.00, 'labor': 'fremd', 'bezeichnung': 'Zirkonkrone vollanatomisch', 'mwst': 7},
        ],
    }

    # 6) Privat-ZE mit fehlender GOÄ Ä34 -> streicht Ä34, wechselt automatisch in Privatprothetik!
    privat_ze_goae = dict(privat_ze, titel='Privat-ZE mit Ä34', positionen=privat_ze['positionen'] + [
        {'ebene': 'GOAE', 'nr': '34', 'zahn': '', 'anzahl': 1, 'faktor': 2.3, 'einzelpreis': 40.22, 'betrag': 40.22, 'bezeichnung': 'Erörterung'},
    ])

    auftraege = [
        # Fehlerfälle
        (f'/patients/{pat_id}/hkps', {}),
        (f'/patients/{pat_id}/hkps', {'json': '{}'}),
        (f'/patients/{pat_id}/hkps', {'json': 'x', 'mehr': 1}),
        (f'/patients/{pat_id}/plaene/import', {'json': '{}'}),
        (f'/patients/{pat_id}/plaene/import', p({'format': 'planr-plan', 'version': 1, 'planart': 'hkp', 'art': 'KO', 'positionen': []})),
        (f'/patients/{pat_id}/dokumentation', {}),
        (f'/patients/{pat_id}/dokumentation', {'text': '   '}),
        (f'/patients/{pat_id}/dokumentation', {'text': 'Kontrolle', 'date': 'falsch'}),
        (f'/patients/{pat_id}/dokumentation', {'text': 'Kontrolle', 'extra': 1}),
        (f'/patients/{pat_id}/dokumentation', {'text': 'Haken \u2713 geht nicht'}),
        (f'/patients/{pat_id}/leistung', {}),
        (f'/patients/{pat_id}/leistung', {'code': '01', 'anzahl': 0}),
        (f'/patients/{pat_id}/befunde/01', {'version': 'falsch', 'teeth': {'11': 'k'}}),
        ('/patients/999999999/befunde/01', {'version': 'x', 'teeth': {'11': 'k'}}),
        # Echte Schreibaufträge
        (f'/patients/{pat_id}/hkps', p(hkp_regel)),
        (f'/patients/{pat_id}/hkps', p(hkp_gleich)),
        (f'/patients/{pat_id}/plaene/import', p(kva_kons)),
        (f'/patients/{pat_id}/plaene/import', p(mkv_plan)),
        (f'/patients/{pat_id}/plaene/import', p(privat_ze)),
        (f'/patients/{pat_id}/plaene/import', p(privat_ze_goae)),
        (f'/patients/{pat_id}/dokumentation', {'text': 'Kontrolle o. B., Zahnstein entfernt (3 €).'}),
        (f'/patients/{pat_id}/dokumentation', {'text': 'Langer Befundbericht ' + 'Detailabschnitt mit Umlauten äöü ß. ' * 10, 'date': '2026-11-10'}),
        (f'/patients/{pat_id}/leistung', {'code': '01', 'zahn': '', 'anzahl': 1}),
        (f'/patients/{pat_id}/leistung', {'code': '2197', 'zahn': '16', 'anzahl': 2}),
        # 01-Befund (Version wird dynamisch aus der jeweiligen Kopie gelesen)
        (f'/patients/{pat_id}/befunde/01', 'BEFUND', {'11': 'k', '36': 'missing', '18': 'kw', '47': 'ww'}),
        (f'/patients/{pat_id}/befunde/01', 'BEFUND', {'11': 'k'}),
        (f'/patients/{pat_id}/befunde/01', 'BEFUND', {'11': 'healthy', '36': '', '18': 'f'}),
        (f'/patients/{pat_id}/befunde/01', 'BEFUND', {'11': 'unbekannt'}),
        (f'/patients/{pat_id}/befunde/01', 'BEFUND', {}),
    ]
    return auftraege


def kopiere_bank(echte_bank: Path, ziel: Path):
    ziel.mkdir(parents=True, exist_ok=True)
    for f in echte_bank.iterdir():
        if f.is_file() and f.suffix.lower() in ('.dat', '.key', '.dbd', '.ctb', '.ini'):
            shutil.copy2(f, ziel / f.name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--connector', default=r'F:\pvsConnectoR\connectors\dens')
    parser.add_argument('--behalten', action='store_true')
    parser.add_argument('--details', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, args.connector)
    import dens_connector_service as dienst
    import dens_native

    echte_cfg = dens_native.installation_config()
    echte_bank = echte_cfg['bank']
    echte_ini = echte_cfg['profile']
    tenant = echte_cfg['tenant']

    basis = Path(r'F:\PlanR\Bridge\.tmp')
    basis.mkdir(parents=True, exist_ok=True)
    ordner = Path(tempfile.mkdtemp(prefix='dens-stage-', dir=str(basis)))
    py_bank, cs_bank = ordner / 'py', ordner / 'cs'
    kopiere_bank(echte_bank, py_bank)
    kopiere_bank(echte_bank, cs_bank)
    py_ini, cs_ini = ordner / 'py.ini', ordner / 'cs.ini'
    ini_kopie(echte_ini, py_bank, py_ini, tenant)
    ini_kopie(echte_ini, cs_bank, cs_ini, tenant)
    py_befund_dir, cs_befund_dir = ordner / 'py_befund01', ordner / 'cs_befund01'
    py_backup_dir, cs_backup_dir = ordner / 'py_backups', ordner / 'cs_backups'
    for d in (py_befund_dir, cs_befund_dir, py_backup_dir, cs_backup_dir):
        d.mkdir(parents=True, exist_ok=True)
    # Vorhandene befund01 kopieren, falls welche existieren
    alt_b01 = Path(args.connector) / 'befund01'
    if alt_b01.is_dir():
        for f in alt_b01.glob('*.json'):
            shutil.copy2(f, py_befund_dir / f.name)
            shutil.copy2(f, cs_befund_dir / f.name)

    try:
        # 1) Python-Lauf auf py_bank (dens-stage mit Modus 'o', exakt wie test_native_worker.py)
        os.environ['DENS_OFFICE_INI'] = str(py_ini)
        os.environ['DENS_LABORZUORDNUNG'] = str(Path(args.connector) / 'dens_laborzuordnung.json')
        dens_native._LESE_MERK.clear()
        dens_native._befund_merk = lambda pid: py_befund_dir / f'{tenant}-{int(pid)}.json'
        orig_bank_sichern = dens_native.bank_sichern
        bak_nr = [0]
        def py_sichern(path, anlass='sicherung', ordner=None):
            bak_nr[0] += 1
            return orig_bank_sichern(path, anlass, py_backup_dir / str(bak_nr[0]))
        dens_native.bank_sichern = py_sichern
        orig_run = dens_native.subprocess.run
        def run_stage(cmd, *a, **kw):
            if isinstance(cmd, list) and cmd and str(cmd[0]).lower().endswith('densnative.exe') and len(cmd) == 3:
                cmd = list(cmd) + ['o']
            return orig_run(cmd, *a, **kw)
        dens_native.subprocess.run = run_stage

        patient_file_py = py_bank / 'PATIENT.DAT'
        patienten = dens_native.read_patients(patient_file_py)
        pat_id = patienten[0]['id']

        server = dienst.make_server(patient_file_py, port=0)
        port = server.server_port
        threading.Thread(target=server.serve_forever, daemon=True).start()

        def py_call(pfad, body=None, post=False):
            daten = None if not post else json.dumps(body, ensure_ascii=False).encode('utf-8')
            req = urllib.request.Request(
                f'http://127.0.0.1:{port}{pfad}', data=daten,
                method='POST' if post else 'GET',
                headers={'Content-Type': 'application/json'} if post else {},
            )
            try:
                with urllib.request.urlopen(req, timeout=180) as r:
                    return r.status, json.loads(r.read().decode('utf-8'))
            except urllib.error.HTTPError as exc:
                return exc.code, json.loads(exc.read().decode('utf-8'))

        auftraege = baue_auftraege(pat_id, None)
        py_antworten = []
        cs_zeilen = []
        # Für Befund-Aufträge braucht C# die jeweilige aktuelle Version (die identisch zur Python-Version ist!)
        for eintrag in auftraege:
            pfad = eintrag[0]
            if len(eintrag) == 3 and eintrag[1] == 'BEFUND':
                _, cur = py_call(pfad)
                body = {'version': cur['version'], 'teeth': eintrag[2]}
            else:
                body = eintrag[1]
            py_antworten.append(py_call(pfad, body, post=True))
            cs_zeilen.append(f'POST {pfad} ' + json.dumps(body, ensure_ascii=False))

        # Lese-Nachprüfung nach allen Schreibvorgängen
        lese_pfade = [
            f'/patients/{pat_id}/clinical',
            f'/patients/{pat_id}/befunde/01',
            '/praxis/katalog',
            '/leistungskatalog',
            '/hkps/offen',
        ]
        cl_py = py_call(f'/patients/{pat_id}/clinical')[1]
        for h in cl_py.get('hkps') or []:
            lese_pfade.append(f"/patients/{pat_id}/hkps/{h['number']}/planr")
        py_lesen = [py_call(p) for p in lese_pfade]
        cs_zeilen.extend(lese_pfade)

        # KVA-Liste aus Python-Kopie (über DensNative direkt)
        py_kvas = dens_native.invoke(py_bank, 'kva-list', {'id': str(pat_id)})

        # 2) C#-Lauf auf cs_bank
        cs_env = dict(os.environ)
        cs_env['DENS_OFFICE_INI'] = str(cs_ini)
        cs_env['DENS_OPEN_MODE'] = 'o'
        cs_env['DENS_BEFUND_DIR'] = str(cs_befund_dir)
        cs_env['DENS_BACKUP_DIR'] = str(cs_backup_dir)
        cs_env['DENS_LABORZUORDNUNG'] = str(Path(args.connector) / 'dens_laborzuordnung.json')
        with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as f:
            f.write('\n'.join(cs_zeilen))
            befehlsdatei = Path(f.name)
        lauf = subprocess.run(
            [str(EXE), '--dens-datei', str(befehlsdatei), '--dens-schreiben'],
            capture_output=True, text=True, encoding='utf-8', env=cs_env, timeout=600,
        )
        befehlsdatei.unlink()
        if lauf.returncode:
            print('Kompilierte Bridge fehlgeschlagen:', lauf.stderr.strip()[:2000])
            return 2
        cs_roh = [json.loads(z) for z in lauf.stdout.splitlines() if z.strip()]
        if len(cs_roh) != len(cs_zeilen):
            print(f'Kompilierte Bridge lieferte {len(cs_roh)} von {len(cs_zeilen)} Antworten.')
            return 2

        cs_antworten = cs_roh[:len(auftraege)]
        cs_lesen = cs_roh[len(auftraege):]

        # 3) KVA-Liste aus cs_bank mit Python-DensNative zurücklesen -> beweist 100% Byte-Parität der KVA-Sätze!
        os.environ['DENS_OFFICE_INI'] = str(cs_ini)
        dens_native._LESE_MERK.clear()
        cs_kvas = dens_native.invoke(cs_bank, 'kva-list', {'id': str(pat_id)})

        abw_schreib = 0
        for idx, ((py_st, py_d), cs) in enumerate(zip(py_antworten, cs_antworten), 1):
            diff = [f'Status {py_st} / {cs["status"]}'] if py_st != cs['status'] else []
            if py_st == 400 and cs['status'] == 400 and 'does not match format' in str(py_d.get('error', '')) and cs['daten'].get('error'):
                pass
            else:
                diff += unterschiede(ohne_zeit(py_d), ohne_zeit(cs['daten']))
            if diff:
                abw_schreib += 1
                print(f'SCHREIB-ABWEICHUNG #{idx} {cs["pfad"]} |', '; '.join(diff[:8]))
                if args.details:
                    print('  py.error:', repr(py_d.get('error')), 'cs.error:', repr(cs['daten'].get('error')))
                    if '/version' in diff:
                        pt = {k: v['status'] for k, v in (py_d.get('current') or {}).get('teeth', {}).items() if v.get('status')}
                        ct = {k: v['status'] for k, v in (cs['daten'].get('current') or {}).get('teeth', {}).items() if v.get('status')}
                        print('  py.teeth:', pt, 'cs.teeth:', ct)

        abw_lese = 0
        for pfad, (py_st, py_d), cs in zip(lese_pfade, py_lesen, cs_lesen):
            diff = [f'Status {py_st} / {cs["status"]}'] if py_st != cs['status'] else []
            diff += unterschiede(ohne_zeit(py_d), ohne_zeit(cs['daten']))
            if diff:
                abw_lese += 1
                print(f'LESE-ABWEICHUNG {pfad} |', '; '.join(diff[:8]))

        kva_diff = unterschiede(py_kvas, cs_kvas)
        if kva_diff:
            print('KVA-BYTE-ABWEICHUNG |', '; '.join(kva_diff[:8]))

        print(f'DENS-Schreibvergleich: {len(auftraege)} Schreibaufträge ({abw_schreib} abweichend), '
              f'{len(lese_pfade)} Leseprüfungen ({abw_lese} abweichend), '
              f'{len(py_kvas)} KVAs byte-geprüft ({len(kva_diff)} abweichend).')
        return 1 if (abw_schreib or abw_lese or kva_diff) else 0
    finally:
        if not args.behalten:
            shutil.rmtree(ordner, ignore_errors=True)
            try:
                basis.rmdir()
            except OSError:
                pass


if __name__ == '__main__':
    sys.exit(main())

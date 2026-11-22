"""Vergleicht die Schreib-Umsetzung für Z1: Python-Connector gegen kompilierte PlanR-Bridge.

Verglichen werden die Zeilen, die an den Z1-Schreiber gehen (plan_zeilen(plan_aus_json/plan_aus_planr))
und der Befundauftrag. Es wird nichts in die Datenbank geschrieben; gelesen werden nur Gebührenliste,
Makros und vorhandene Pläne. Ausgegeben werden Zähler und Feldnamen, keine Patientendaten.

Aufruf: python z1_schreib_vergleich.py [--connector F:\\pvsConnectoR\\connectors\\z1] [--faelle 3000]
"""
import argparse
import json
import random
import subprocess
import sys
import tempfile
from pathlib import Path

from z1_vergleich import EXE, unterschiede

EBENEN = ['GOZ', 'BEMA', 'BEL', 'BEB', 'MAT', 'GOAE', 'HINWEIS', '', None, 'goz']
ANZAHL = [1, 1, 1, 2, 3, 0.5, 1.25, 12, 99, 100, 0, None, '2', 'x', 1.005, 2.0, True, '', '1,5']
ZAHN = ['16', '16', '15-13', '15,13', '', '', 'OK', 'UK', 'OK,UK', '1 6', '19', '16-', 'abc', 16, None, '11-28,31', '48', '51']
GELD = [None, 0, 1, 19, 41.73, 383.68, 191.84, 2.3, 0.7321, 6.16, 98.16, 0.005, 1234.565, -5, '12.5', 'x', '', 1e6, 3.5]
BEFUND = ['', 'kw', 'ww', 'f', 'k', 'b', 'e', 'i', 'x', 't', ')(', 'pw', 'tw', 'KW', None, 3]
PLANUNG = ['', 'K', 'KV', 'BV', 'B', 'XY', 'kv', 'TK', 'E', None, 'PK', 'KM', 'BM', 'SK', 'TV', 'H', 'O']
TEXT = [None, '', 'Gold', 'Lücke im Seitenzahnbereich', 'x' * 70, '  viele   Leerzeichen  ', 'Äußerst "schwierig"', 7]
ZAEHNE = [str(q * 10 + n) for q in (1, 2, 3, 4) for n in range(1, 9)]


def w(r, pool):
    return r.choice(pool)


def position(r, nummern, i):
    p = {}
    for name, pool in (('ebene', EBENEN[:6] * 3 + EBENEN), ('nr', nummern), ('anzahl', ANZAHL), ('zahn', ZAHN),
                       ('labor', [None, 'fremd', 'eigen', '']), ('bezeichnung', TEXT), ('betrag', GELD),
                       ('einzelpreis', GELD), ('faktor', [None, 1, 2.3, 3.5, 1.0, '2,3', 0]), ('mkv', [None, None, True, False, 1]),
                       ('begruendung', TEXT), ('punkte', GELD), ('text', TEXT)):
        if r.random() < 0.7:
            p[name] = w(r, pool)
    if r.random() < 0.8:
        p['id'] = f'p{i}'
    return p


def hkp(r, nummern):
    positionen = [position(r, nummern, i) for i in range(r.choice([0, 1, 1, 2, 3, 4, 6, 9]))]
    if r.random() < 0.05:
        positionen.append(w(r, ['x', None, 3, []]))
    zaehne = {}
    for z in r.sample(ZAEHNE, r.choice([0, 1, 2, 4, 8])):
        zaehne[z] = {k: w(r, BEFUND if k == 'B' else PLANUNG) for k in ('B', 'R', 'TP', 'planung') if r.random() < 0.7}
    if r.random() < 0.05:
        zaehne[w(r, ['99', 'x', '16'])] = w(r, ['kw', None, {}])
    ergebnis = {}
    if r.random() < 0.8:
        ergebnis['summen'] = {k: w(r, GELD) for k in ('festzuschuss', 'gesamt', 'eigenanteil', 'labor', 'honorar') if r.random() < 0.7}
    if r.random() < 0.8:
        ergebnis['befunde'] = [{k: v for k, v in (('nr', w(r, ['1.1', '2.1', '3.1', '4.6', '', None, 1.1, 'zzzzzzzz'])),
                                                 ('zahnGebiet', w(r, ZAHN)), ('anzahl', w(r, ANZAHL)), ('einzelbetrag', w(r, GELD)),
                                                 ('betrag', w(r, GELD)), ('text', w(r, TEXT))) if r.random() < 0.8}
                               for _ in range(r.choice([0, 1, 1, 2, 3]))]
    if r.random() < 0.8:
        ergebnis['positionen'] = [{k: v for k, v in (('id', f'p{i}'), ('betrag', w(r, GELD)), ('punkte', w(r, GELD)),
                                                    ('punktwert', w(r, GELD)), ('einzelpreis', w(r, GELD)),
                                                    ('faktor', w(r, [None, 2.3, 3.5, 1]))) if r.random() < 0.8}
                                  for i in range(len(positionen)) if r.random() < 0.8]
    daten = {'verwaltung': w(r, [{'ausstellungsdatum': '2026-11-10'}, {'ausstellungsdatum': '10.11.2026'}, {}, None,
                                 {'ausstellungsdatum': '2026-02-30', 'bemerkung': 'Test'}, {'ausstellungsdatum': 5}]),
             'positionen': positionen, 'zaehne': zaehne, 'ergebnis': ergebnis}
    for name, pool in (('titel', TEXT), ('label', TEXT), ('bemerkung', TEXT), ('planart', ['', 'ZE', 'kva', None]),
                       ('versicherung', ['gkv', 'pkv', None]), ('bonus', [0, 20, 30, None, '30'])):
        if r.random() < 0.4:
            daten[name] = w(r, pool)
    for weg in ('zaehne', 'ergebnis', 'positionen', 'verwaltung'):
        if r.random() < 0.03:
            daten[weg] = w(r, [None, 'x', 3, [], {}])
        elif r.random() < 0.02:
            del daten[weg]
    return daten


def planr(r, nummern):
    positionen = []
    for i in range(r.choice([0, 1, 2, 3, 5, 8])):
        p = position(r, nummern, i)
        positionen.append(p)
        if p.get('ebene') == 'GOZ' and p.get('mkv') and r.random() < 0.8:
            positionen.append({'ebene': 'BEMA', 'nr': w(r, ['13b', '13c', '', None]), 'zahn': p.get('zahn') if r.random() < 0.9 else '11',
                               'betrag': w(r, GELD)})
    daten = {'format': w(r, ['planr-plan'] * 12 + ['x', None]), 'version': w(r, [1] * 12 + [2, '1', 1.0]),
             'planart': w(r, ['kva'] * 6 + ['mkv'] * 6 + ['hkp', None]), 'positionen': positionen,
             'datum': w(r, ['2026-11-10', '2026-11-10T08:00:00', '', None, 'x', 20261110]), 'titel': w(r, TEXT)}
    if r.random() < 0.03:
        daten['positionen'] = w(r, [None, 'x', {}])
    return daten


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--connector', default=r'F:\pvsConnectoR\connectors\z1')
    parser.add_argument('--faelle', type=int, default=3000)
    parser.add_argument('--zeige', type=int, nargs='*', default=[])
    args = parser.parse_args()
    sys.path.insert(0, args.connector)
    import z1_befund
    import z1_connector_service as dienst
    import z1_hkp
    import z1_plan
    import z1_stamm

    katalog = json.loads(json.dumps(dienst._lesen(dienst.zeilen), default=str))
    makros = sorted({str(m.get('id') or '').strip() for m in dienst._lesen(dienst.makros)['makros']
                     if str(m.get('go') or '').strip() in ('4', '5')})
    echte = sorted({str(z.get('nr') or '').strip() for z in katalog})
    r = random.Random(20261123)
    nummern = r.sample(echte, min(60, len(echte))) + ['2200', '2030a', '40', '0010', '19', '5010', '', None, 'zu-lange-nummer',
                                                      'äö.1', 12, ' 2200 ', '9999', 'MKF']

    def klein(daten):
        """Nur die Katalogzeilen, deren Nummer im Fall vorkommen kann – hält die Anfragen klein, ändert nichts am Ergebnis."""
        if len(katalog) <= 400:
            return katalog
        text = json.dumps(daten, ensure_ascii=False)
        return [z for z in katalog if str(z.get('nr') or '').strip() and str(z.get('nr') or '').strip() in text]

    faelle = []
    gold = json.loads(Path(__file__).with_name('z1_gold.json').read_text('utf-8'))
    for g in gold:
        faelle.append(dict(g, json=json.dumps(g['json'])))
    # Vorhandene Z1-Pläne: als PlanR-JSON gelesen und wieder in beide Schreibwege gegeben.
    for p in dienst._lesen(z1_stamm.patienten):
        for plan in dienst._lesen(z1_stamm.plaene, p['id']):
            roh = dienst._lesen(z1_stamm.plan, p['id'], plan['number'])
            if not roh:
                continue
            text = json.dumps(dienst.planr_aus_z1(p, roh), ensure_ascii=False, default=str)
            for op in ('hkp', 'planr'):
                faelle.append({'op': op, 'patnr': str(p['id']), 'json': text, 'zeilen': katalog if op == 'hkp' and len(faelle) < 40 else klein(text),
                               'makros': makros})
    echt = len(faelle) - len(gold)
    for i in range(args.faelle):
        art = i % 3
        if art == 0:
            daten = hkp(r, nummern)
            fall = {'op': 'hkp', 'patnr': w(r, ['1', '3', '12', '', 'x', ' 7 ']), 'json': json.dumps(daten, ensure_ascii=r.random() < 0.5),
                    'zeilen': klein(daten), 'makros': w(r, [makros, makros, ['kv', 'bv'], []])}
            if r.random() < 0.03:
                fall['json'] = w(r, ['', '   ', '{', '[]', '"x"', 'null', ' ' * 70000])
            if r.random() < 0.1:
                del fall['makros']
        elif art == 1:
            daten = planr(r, nummern)
            fall = {'op': 'planr', 'patnr': w(r, ['1', '3', '', 'x']), 'json': json.dumps(daten), 'zeilen': klein(daten)}
            if r.random() < 0.05:
                del fall['zeilen']
        else:
            zeichen = ''.join(z1_befund.AUS_Z1) + ' ?#'
            alt = w(r, [''.join(r.choice(zeichen) for _ in range(r.choice([32, 32, 32, 0, 10, 40]))), None])
            teeth = {w(r, ZAEHNE + ['19', 'x', '', '016']): w(r, BEFUND + ['healthy', 'missing', ' kw ', 'zulangeswort'])
                     for _ in range(r.choice([0, 1, 2, 5, 16, 32, 40]))}
            fall = {'op': 'befund', 'roh': w(r, [{'befund': alt}, {'befund': alt}, None, {}]), 'teeth': teeth}
        faelle.append(fall)

    def python(fall):
        try:
            if fall['op'] == 'befund':
                neu, ge, un = z1_befund.auftrag(fall['roh'], fall['teeth'])
                return {'ok': {'neu': neu, 'geaendert': ge, 'ungefaehr': un, 'meldung': z1_befund.meldung(ge, un)}}
            if fall['op'] == 'planr':
                plan = z1_hkp.plan_aus_planr(fall['json'], fall['patnr'], fall.get('zeilen'))
            else:
                plan = z1_hkp.plan_aus_json(fall['json'], fall['patnr'], fall.get('zeilen'), set(fall['makros']) if 'makros' in fall else None)
            return {'ok': {'zeilen': z1_plan.plan_zeilen(plan), 'hinweise': plan['hinweise'], 'label': plan.get('label')}}
        except (z1_hkp.HkpFehler, z1_befund.BefundFehler) as exc:
            return {'error': str(exc)}
        except Exception as exc:  # Absturz im Python-Connector (dort HTTP 500)
            return {'absturz': type(exc).__name__}

    with tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False, encoding='utf-8') as f:
        f.write('\n'.join(json.dumps(x, ensure_ascii=False) for x in faelle))
    lauf = subprocess.run([str(EXE), '--z1-schreib-datei', f.name], capture_output=True, text=True, encoding='utf-8', timeout=3600)
    Path(f.name).unlink()
    if lauf.returncode:
        print('Kompilierte Bridge:', lauf.stderr.strip()[:2000])
        return 2
    kompiliert = [json.loads(z) for z in lauf.stdout.splitlines() if z.strip()]
    if len(kompiliert) != len(faelle):
        print(f'Kompilierte Bridge lieferte {len(kompiliert)} von {len(faelle)} Antworten.')
        return 2

    zahl = {'gleich': 0, 'abweichend': 0, 'ok': 0, 'fehler': 0, 'absturz': 0}
    muster = {}
    for i, (fall, cs) in enumerate(zip(faelle, kompiliert)):
        py = json.loads(json.dumps(python(fall)))
        if 'absturz' in py:
            zahl['absturz'] += 1
            diff = [] if str(cs.get('error', '')).startswith('Vergleich:') else [f"Python stürzt ab ({py['absturz']}), C#: {'ok' if 'ok' in cs else 'Fehler'}"]
        else:
            zahl['ok' if 'ok' in py else 'fehler'] += 1
            diff = unterschiede(py, cs)
            if diff and 'error' in py and 'error' in cs:
                diff = [f"Meldung: {py['error'][:60]!r} / {cs['error'][:60]!r}"]
        if diff and i in args.zeige and i >= len(gold) + echt:  # nur erzeugte Fälle, nie echte Pläne
            print(f'--- Fall {i}\n{json.dumps({k: v for k, v in fall.items() if k != "zeilen"}, ensure_ascii=False)}\nPython: {json.dumps(py, ensure_ascii=False)}\nC#:     {json.dumps(cs, ensure_ascii=False)}')
        if diff:
            zahl['abweichend'] += 1
            schluessel = f"{fall['op']} | {'; '.join(diff[:4])}"
            muster.setdefault(schluessel, []).append(i)
        else:
            zahl['gleich'] += 1
    for schluessel, wo in sorted(muster.items(), key=lambda x: -len(x[1]))[:40]:
        print(f'ABWEICHUNG {len(wo):4}x  Fall {wo[0]}  {schluessel}')
    print(f"{len(faelle)} Fälle ({len(gold)} Referenz, {echt} aus vorhandenen Z1-Plänen, {args.faelle} erzeugt): "
          f"{zahl['ok']} umgesetzt, {zahl['fehler']} abgelehnt, {zahl['absturz']} Python-Abstürze; "
          f"{zahl['gleich']} gleich, {zahl['abweichend']} abweichend.")
    return 1 if zahl['abweichend'] else 0


if __name__ == '__main__':
    sys.exit(main())

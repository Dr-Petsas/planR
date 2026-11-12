"""GOZ-Katalog nach Behandlungsschritten, nicht nach Nummernreihenfolge."""
import json
from pathlib import Path

roh = json.loads(Path(r"F:\PlanR\KONS\Privat-Kons\src\data\goz-2012.json").read_text(encoding="utf-8"))

def schritt(nr: str) -> str:
    if nr in {"0050", "0060", "0065"}:
        return "Abformung"
    if nr in {"0080", "0090", "0100"}:
        return "Anästhesie"
    if nr in {"0110", "0120", "0500", "0510", "0520", "0530"}:
        return "Zuschläge"
    n = int(nr)
    if n < 1000:
        return "Untersuchung und Planung"
    if n < 2000:
        return "Prophylaxe"
    if n <= 2040:
        return "Vor der Füllung"
    if n <= 2130:
        return "Füllung"
    if n <= 2170:
        return "Einlagefüllung und Onlay"
    if n <= 2197:
        return "Aufbau und adhäsive Befestigung"
    if n <= 2240:
        return "Krone, Teilkrone, Veneer"
    if n <= 2320:
        return "Provisorium, Entfernen, Wiedereinsetzen"
    if n < 3000:
        return "Wurzelbehandlung"
    if n < 4000:
        return "Chirurgie"
    if n < 5000:
        return "Parodontologie"
    if n < 6000:
        return "Zahnersatz herausnehmbar"
    if n < 7000:
        return "Kieferorthopädie"
    if n < 8000:
        return "Aufbissbehelfe und Schienen"
    if n < 9000:
        return "Funktionsanalyse"
    return "Implantologie"

REIHEN = [
    "Untersuchung und Planung", "Anästhesie", "Abformung", "Prophylaxe", "Vor der Füllung",
    "Füllung", "Einlagefüllung und Onlay", "Aufbau und adhäsive Befestigung",
    "Krone, Teilkrone, Veneer", "Provisorium, Entfernen, Wiedereinsetzen", "Wurzelbehandlung",
    "Chirurgie", "Parodontologie", "Zahnersatz herausnehmbar", "Kieferorthopädie",
    "Aufbissbehelfe und Schienen", "Funktionsanalyse", "Implantologie", "Zuschläge",
]
gruppen: dict[str, list[dict]] = {s: [] for s in REIHEN}
for e in roh["eintraege"]:
    gruppen[schritt(e["nr"])].append({"nr": e["nr"], "text": e["text"].split("Der Zuschlag")[0].strip()})

zeilen = ["/** Aus dem GOZ-Verzeichnis, gegliedert nach dem Behandlungsschritt. */", "export interface GozEintrag { nr: string; text: string }", "export interface GozSchritt { name: string; eintraege: GozEintrag[] }", "export const GOZ_SCHRITTE: GozSchritt[] = ["]
for name in REIHEN:
    if not gruppen[name]:
        continue
    zeilen.append(f"  {{ name: {json.dumps(name, ensure_ascii=False)}, eintraege: [")
    for e in gruppen[name]:
        zeilen.append(f"    {{ nr: {json.dumps(e['nr'])}, text: {json.dumps(e['text'], ensure_ascii=False)} }},")
    zeilen.append("  ] },")
zeilen.append("]")
zeilen.append("export const GOZ_TEXT = new Map(GOZ_SCHRITTE.flatMap((s) => s.eintraege.map((e) => [e.nr, e.text] as const)))")
Path(r"F:\PlanR\Start\src\gozSchritte.ts").write_text("\n".join(zeilen) + "\n", encoding="utf-8")
print(sum(len(v) for v in gruppen.values()), "ziffern")

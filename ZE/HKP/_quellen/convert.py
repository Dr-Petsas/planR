"""Wandelt die heruntergeladenen Quelldokumente in JSON-Preislisten für die App um."""
import csv
import json
import re
from pathlib import Path

SRC = Path(__file__).parent
OUT = SRC.parent / "src" / "data"
OUT.mkdir(parents=True, exist_ok=True)


def num(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))


def write(name, obj):
    (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    print(name, len(obj["eintraege"]))


# ---------- BEL II Bayern (VDDS-CSV: Nr;Nr;Text;Kz;Praxis;Gewerbe) ----------
# Praxislabor = 95 % des Gewerbepreises; Versand (9330) nur beim Gewerbelabor.
bel = []
with open(SRC / "bel_bayern_2026.csv", encoding="latin-1") as f:
    for row in csv.reader(f, delimiter=";"):
        if len(row) < 6 or not row[0].strip():
            continue
        bel.append({
            "nr": row[0].strip(),
            "text": row[2].strip(),
            "gewerbe": num(row[5]) if row[5].strip() else 0,
            "praxis": num(row[4]) if row[4].strip() else 0,
        })
write("bel2-bayern-2026.json", {
    "typ": "bel2", "name": "BEL II Bayern (KZVB)", "gueltigAb": "2026-01-01",
    "quelle": "https://www.kzvb.de/fileadmin/user_upload/Abrechnung/BEL/11la0126.csv",
    "eintraege": bel,
})

# ---------- Festzuschüsse 2026 ----------
txt = (SRC / "fz_betraege_2026.txt").read_text(encoding="utf-8")
lines = [l.strip() for l in txt.splitlines()]
amount = r"(\d{1,3}(?:\.\d{3})*,\d{2})"
row7 = re.compile(r"(?:^|\s)" + r"\s+".join([amount] * 7) + r"\s*$")
fz, cur = [], None
for l in lines:
    m_head = re.match(r"^(\d\.\d{1,2}(?:\.\d)?)\s+(.*)$", l)
    m_amt = row7.search(l)
    if m_head and not re.match(r"^\d\.\d+\s+(\d|EUR)", l):
        cur = {"nr": m_head.group(1), "text": m_head.group(2)}
        if m_amt:
            cur["text"] = l[len(m_head.group(1)):m_amt.start()].strip()
    elif cur and not m_amt and not l.startswith(("Festzuschuss", "Zahnersatz-Punktwert", "BEL II", "Befunde", "60%")):
        if "betraege" not in cur:
            cur["text"] += " " + l
    if cur and m_amt and "betraege" not in cur:
        v = [num(x) for x in m_amt.groups()]
        cur["honorar"], cur["mul"] = v[0], v[1]
        cur["betraege"] = {"100": v[2], "60": v[3], "70": v[4], "75": v[5]}
        cur["text"] = re.sub(r"\s+", " ", cur["text"]).strip()
        # Hinweistexte (Kombinationsregeln) vom Befundtext trennen
        cur["text"] = re.split(r" Bei gleichzeitigem Vorliegen", cur["text"])[0]
        fz.append(cur)
        cur = None
write("festzuschuss-2026.json", {
    "typ": "festzuschuss", "name": "Festzuschüsse ab 01.01.2026 (G-BA / GKV-SV)", "gueltigAb": "2026-01-01",
    "quelle": "https://www.gkv-spitzenverband.de/media/dokumente/krankenversicherung_1/zahnaerztliche_versorgung/rili_g_ba/2026-01-01-FZ-Betraege.pdf",
    "eintraege": fz,
})

# ---------- GOZ (Anlage 1, gesetze-im-internet.de) ----------
goz_src = Path(r"C:\Users\Anmeldung2\.cursor\projects\f-HKP\agent-tools\2fae149c-299e-4c99-8b89-ec394143d0e0.txt")
goz = []
abschnitt = ""
abschnitte = {"A": "Allgemeine Leistungen", "B": "Prophylaxe", "C": "Konservierende Leistungen",
              "D": "Chirurgie", "E": "Parodontium", "F": "Prothetik", "G": "Kieferorthopädie",
              "H": "Aufbissbehelfe/Schienen", "J": "Funktionsanalyse", "K": "Implantologie", "L": "Zuschläge"}
def abschnitt_von(nr: str) -> str:
    n = int(nr[:4])
    if 500 <= n < 1000:
        k = "L"
    else:
        k = {0: "A", 1: "B", 2: "C", 3: "D", 4: "E", 5: "F", 6: "G", 7: "H", 8: "J", 9: "K"}[n // 1000]
    return f"{k} {abschnitte[k]}"


for l in goz_src.read_text(encoding="utf-8").splitlines():
    l = re.sub(r"^\s*\d+\|", "", l)
    m = re.match(r"^([A-L])\.$", l.strip())
    if m:
        abschnitt = m.group(1)
    m = re.match(r"^\| (\d{4}a?) \| (.*) \| (\d*) \|$", l)
    if not m:
        continue
    text = m.group(2)
    parts = re.split(r"(?<=[a-zäöüß\)\.,%])(?=[A-ZÄÖÜ1-9]\.?\s?[A-Za-zÄÖÜäöü])(?<!\d\.)", text, maxsplit=1)
    goz.append({
        "nr": m.group(1),
        "text": parts[0].strip(),
        "hinweis": parts[1].strip() if len(parts) > 1 else "",
        "punkte": int(m.group(3)) if m.group(3) else 0,
        "abschnitt": abschnitt_von(m.group(1)),
    })
write("goz-2012.json", {
    "typ": "goz", "name": "GOZ Gebührenverzeichnis (Anlage 1, Stand 2012)", "gueltigAb": "2012-01-01",
    "punktwert": 0.0562421,
    "quelle": "https://www.gesetze-im-internet.de/goz_1987/anlage_1.html",
    "eintraege": goz,
})


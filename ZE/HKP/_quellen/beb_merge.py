"""Kombiniert OCR-Preise (ITZ GmbH 2024) mit sauberen BEB-Bezeichnungen (2te-zahnarztmeinung.de)."""
import html
import json
import re
import urllib.request
from pathlib import Path

SRC = Path(__file__).parent
OUT = SRC.parent / "src" / "data"

page = urllib.request.urlopen(
    urllib.request.Request("https://www.2te-zahnarztmeinung.de/lexikon/beb/", headers={"User-Agent": "Mozilla/5.0"})
).read().decode("utf-8")
text = html.unescape(re.sub(r"<[^>]+>", "\n", page))
names = {}
for m in re.finditer(r"BEB (\d{4}):\s*\n\s*([^\n]+)", text):
    name = m.group(2).strip()
    if name and not name.startswith("BEB "):
        names[m.group(1)] = re.sub(r"^BEB \d{4}\s*", "", name)
    elif name.startswith("BEB "):
        names[m.group(1)] = re.sub(r"^BEB \d{4}\s*", "", name)

def norm(s: str) -> str:
    s = s.lower()
    for a, b in (("ä", "a"), ("ö", "o"), ("ü", "u"), ("ß", "b")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]", "", s)


by_name = {}
for k, v in names.items():
    by_name.setdefault(norm(v), k)

eintraege, seen = [], set()
for line in (SRC / "beb_itz_2024_ocr.txt").read_text(encoding="utf-8").splitlines():
    m = re.match(r"^(\d{1,4})\s+(.+?)\s+(\d{1,4},\d{2})$", line.strip())
    if not m:
        # OCR hat die Nummer verschluckt: über den Namen zuordnen
        m2 = re.match(r"^([A-Za-zÄÖÜäöü].+?)\s+(\d{1,4},\d{2})$", line.strip())
        nr2 = by_name.get(norm(m2.group(1))) if m2 else None
        if not nr2:
            continue
        m = re.match(r"^(\d+) (.+) (\S+)$", f"{nr2} {m2.group(1)} {m2.group(2)}")
    nr = m.group(1).zfill(4)
    if nr in seen:
        continue
    seen.add(nr)
    ocr_text = m.group(2)
    eintraege.append({
        "nr": nr,
        "text": names.get(nr) or re.sub(r"(?<=[a-zß])(?=[A-ZÄÖÜ])", " ", ocr_text),
        "preis": float(m.group(3).replace(",", ".")),
    })

json.dump({
    "typ": "beb", "name": "BEB Preisliste ITZ GmbH (Stand 23.01.2024)", "gueltigAb": "2024-01-23",
    "quelle": "https://itzgmbh.de/wp-content/uploads/BEB-2024.pdf",
    "hinweis": "Per Texterkennung aus einem Scan übernommen – Preise vor Verwendung prüfen.",
    "eintraege": eintraege,
}, open(OUT / "beb-itz-2024.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(eintraege), "Einträge;", sum(1 for e in eintraege if e["nr"] in names), "mit Lexikon-Namen")
for nr in ["0001", "2101", "2121", "2281", "2361", "2353", "2612", "3001", "4001", "6001"]:
    print(next((e for e in eintraege if e["nr"] == nr), nr + " fehlt"))


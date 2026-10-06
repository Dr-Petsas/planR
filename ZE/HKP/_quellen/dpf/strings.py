import re
import sys
from pathlib import Path

muster = re.compile(r"(Regelversorgung|Therapie|Gleich-Anders|Festzuschuss|\[BEMA|\[GOZ|Befund\]|Aufruf)", re.I)
for datei in sys.argv[1:]:
    daten = Path(datei).read_bytes()
    gefunden = set()
    for m in re.finditer(rb"[\x20-\x7e\xc0-\xff]{5,}", daten):
        s = m.group().decode("latin-1")
        if muster.search(s) and len(s) < 80:
            gefunden.add(s)
    for m in re.finditer(rb"(?:[\x20-\x7e\xc0-\xff]\x00){5,}", daten):
        s = m.group().decode("utf-16-le")
        if muster.search(s) and len(s) < 80:
            gefunden.add(s)
    print("==", datei, len(gefunden))
    for s in sorted(gefunden)[:80]:
        print(" ", s)

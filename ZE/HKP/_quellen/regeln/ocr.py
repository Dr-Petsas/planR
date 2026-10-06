"""Texterkennung für PDFs mit unbrauchbarer Textebene (KZBV-Kompendium)."""
import sys
from pathlib import Path

import pypdfium2 as pdfium
from rapidocr_onnxruntime import RapidOCR

HIER = Path(__file__).parent
name = sys.argv[1]
von = int(sys.argv[2]) if len(sys.argv) > 2 else 1
bis = int(sys.argv[3]) if len(sys.argv) > 3 else 10_000

doc = pdfium.PdfDocument(HIER / name)
ocr = RapidOCR()
ziel = HIER / f"{Path(name).stem}_ocr.txt"
with ziel.open("a", encoding="utf-8") as f:
    for i in range(von - 1, min(bis, len(doc))):
        bild = doc[i].render(scale=2.5).to_numpy()
        ergebnis, _ = ocr(bild)
        zeilen = []
        # nach Zeilen sortieren (y), dann x
        for box, text, _conf in sorted(ergebnis or [], key=lambda r: (round(r[0][0][1] / 12), r[0][0][0])):
            zeilen.append(text)
        f.write(f"\n===== Seite {i + 1} =====\n" + "\n".join(zeilen) + "\n")
        f.flush()
        print("Seite", i + 1, len(zeilen), "Zeilen", flush=True)

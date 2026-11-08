"""Textebene der PAR-Quellen (KZV-LB-FAQ, KZBV-Anlage 14c, Dampsoft-Handbuch) als .txt neben die PDFs."""
import sys
from pathlib import Path

import pypdfium2 as pdfium

HIER = Path(__file__).parent
for name in sys.argv[1:]:
    doc = pdfium.PdfDocument(HIER / name)
    teile = []
    for i in range(len(doc)):
        text = doc[i].get_textpage().get_text_range()
        teile.append(f"\n===== Seite {i + 1} =====\n{text}")
    ziel = HIER / f"{Path(name).stem}.txt"
    ziel.write_text("".join(teile), encoding="utf-8")
    print(name, len(doc), "Seiten", ziel.stat().st_size, "Bytes")

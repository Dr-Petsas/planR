"""OCR der gescannten BEB-Preisliste (ITZ GmbH 2024) -> Zeilen mit Nr, Text, Preis."""
import json
import re

import pypdfium2 as pdfium
from rapidocr_onnxruntime import RapidOCR

engine = RapidOCR()
pdf = pdfium.PdfDocument("beb_itz_2024.pdf")
rows = []
for i in range(len(pdf)):
    img = pdf[i].render(scale=3).to_numpy()
    res, _ = engine(img)
    # Boxen nach Zeilen (y) gruppieren
    items = sorted(((b[0][1] + b[2][1]) / 2, b[0][0], t) for b, t, _ in res or [])
    lines, cur, last_y = [], [], None
    for y, x, t in items:
        if last_y is not None and abs(y - last_y) > 18:
            lines.append(cur)
            cur = []
        cur.append((x, t))
        last_y = y
    if cur:
        lines.append(cur)
    for ln in lines:
        rows.append(" ".join(t for _, t in sorted(ln)))
    print("Seite", i + 1, len(lines))

open("beb_itz_2024_ocr.txt", "w", encoding="utf-8").write("\n".join(rows))

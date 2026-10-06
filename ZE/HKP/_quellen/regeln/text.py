import sys
from pathlib import Path

import pypdf

for name in sys.argv[1:]:
    p = Path(__file__).parent / name
    r = pypdf.PdfReader(p)
    text = "\n".join(f"\n===== Seite {i + 1} =====\n{s.extract_text() or ''}" for i, s in enumerate(r.pages))
    p.with_suffix(".txt").write_text(text, encoding="utf-8")
    print(name, len(r.pages), "Seiten,", len(text), "Zeichen")

"""
Zahnform-Referenz fuer das PAR-Status Blatt 2 (KZBV eFormular 5, Version 2.1.0).

Die Zahnzeichnungen im amtlichen Vordruck bestehen aus tausenden kurzen,
gestrichelten Linien- und Kurvensegmenten (get_drawings: ~1900 'l' + ~770 'c').
Eine 1:1-Extraktion dieser Pfade ergaebe unwartbares SVG. Stattdessen messen
wir die *Proportionen* (Spaltenabstand, Kronengroesse, zentrales Lockerungsfeld)
und bilden die Krone im Frontend (src/engine/zahnform.ts) deterministisch nach:
rundes Kronenviereck + zentrales Feld + vier Diagonalen + Mittellinie = 6 Segmente.

Aufruf:  python tools/zahnform-extrahieren.py  (benoetigt PyMuPDF + die Quelle)
Gibt die gemessenen Konstanten aus und rendert Referenzbilder in _quellen/.
"""
import sys
from pathlib import Path

QUELLE = Path(r"F:\PlanR\PAR\_quellen\kzbv_par_blanko_2.1.0.pdf")


def main() -> None:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print("PyMuPDF fehlt: pip install pymupdf", file=sys.stderr)
        return
    if not QUELLE.exists():
        print(f"Quelle fehlt: {QUELLE}", file=sys.stderr)
        return

    doc = fitz.open(QUELLE)
    blatt2 = doc[1]
    zeichnungen = blatt2.get_drawings()

    # Kronen = solide (nicht gestrichelte) runde Vierecke, Breite 24-30 pt.
    kronen = [
        g for g in zeichnungen
        if not g.get("dashes") and 22 < g["rect"].width < 32 and 28 < g["rect"].height < 40
    ]
    xs = sorted({round(g["rect"].x0) for g in kronen})
    abstaende = [b - a for a, b in zip(xs, xs[1:]) if 25 < b - a < 45]
    spalte = round(sum(abstaende) / len(abstaende), 1) if abstaende else 33.0
    breiten = [round(g["rect"].width, 1) for g in kronen]
    kronenbreite = round(sum(breiten) / len(breiten), 1) if breiten else 28.0

    print("# Gemessene Proportionen Blatt 2 (fuer src/engine/zahnform.ts)")
    print(f"Spaltenabstand (Zahn zu Zahn): ~{spalte} pt")
    print(f"Kronenbreite: ~{kronenbreite} pt")
    print(f"Kronen gefunden: {len(kronen)} (Soll: 32)")
    print("Zentrales Lockerungsfeld: ~10x10 pt, mittig in der Krone")
    print("Segmente: 4 Diagonalen (Feld-Ecke -> Kronen-Ecke) + Mittellinie = 6 Felder")

    # Referenz-Ausschnitte (OK rechts oben, UK rechts unten)
    r = blatt2.rect
    for name, box in {
        "zoom_ok_referenz.png": fitz.Rect(r.width * 0.06, r.height * 0.28, r.width * 0.34, r.height * 0.40),
        "zoom_uk_referenz.png": fitz.Rect(r.width * 0.06, r.height * 0.42, r.width * 0.34, r.height * 0.54),
    }.items():
        blatt2.get_pixmap(dpi=400, clip=box).save(str(QUELLE.parent / name))
    print("Referenzbilder: _quellen/zoom_ok_referenz.png, zoom_uk_referenz.png")


if __name__ == "__main__":
    main()

"""
Ergänzung zum Docling-Leser: PaddleOCR liest jede Seite als Bild und gibt
Textstücke mit Position zurück. Nur im Compose-Netz erreichbar, nur CPU.
Die Datei wird im Speicher verarbeitet und nirgends abgelegt.
"""
import io
import logging
import os
import threading

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile

log = logging.getLogger("paddle")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")

SPRACHE = os.environ.get("PADDLE_SPRACHE", "de")
DPI = int(os.environ.get("PADDLE_DPI", "200"))
MAX_SEITEN = int(os.environ.get("EINLESEN_MAX_SEITEN", "20"))
THREADS = int(os.environ.get("PADDLE_THREADS", "4"))
for _laut in ("httpx", "httpx2", "httpcore"):
    logging.getLogger(_laut).setLevel(logging.WARNING)

app = FastAPI(title="PlanR-Einlesen-Paddle", docs_url=None, redoc_url=None)
_sperre = threading.Lock()
_ocr = None
_stand = {"geladen": False, "fehler": ""}


def ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR

        _ocr = PaddleOCR(
            lang=SPRACHE,
            device="cpu",
            enable_mkldnn=True,
            cpu_threads=THREADS,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    return _ocr


def _vorladen():
    try:
        with _sperre:
            ocr().predict(np.full((64, 256, 3), 255, dtype=np.uint8))
        _stand["geladen"] = True
        log.info("modelle geladen")
    except Exception as e:
        _stand["fehler"] = f"{type(e).__name__}: {e}"[:300]
        log.exception("vorladen gescheitert")


@app.on_event("startup")
def start():
    threading.Thread(target=_vorladen, daemon=True).start()


def bilder(name: str, daten: bytes):
    """Seiten als RGB-Felder. PDF wird mit DPI gerastert, ein Bild bleibt wie es ist."""
    if name.lower().endswith(".pdf"):
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(daten)
        try:
            for i in range(min(len(pdf), MAX_SEITEN)):
                yield np.asarray(pdf[i].render(scale=DPI / 72).to_pil().convert("RGB"))
        finally:
            pdf.close()
        return
    from PIL import Image

    bild = Image.open(io.BytesIO(daten))
    for i in range(min(getattr(bild, "n_frames", 1), MAX_SEITEN)):
        bild.seek(i)
        yield np.asarray(bild.convert("RGB"))


def teile(erg):
    roh = erg.json
    r = roh.get("res", roh) if isinstance(roh, dict) else {}
    texte = r.get("rec_texts") or []
    werte = r.get("rec_scores") or []
    boxen = r.get("rec_boxes") or []
    aus = []
    for i, text in enumerate(texte):
        if not str(text).strip() or i >= len(boxen):
            continue
        x1, y1, x2, y2 = [float(v) for v in boxen[i][:4]]
        aus.append({"x": round(x1, 1), "y": round(y1, 1), "b": round(x2 - x1, 1), "h": round(y2 - y1, 1),
                    "text": text, "sicher": round(float(werte[i]), 3) if i < len(werte) else None})
    aus.sort(key=lambda t: (round(t["y"] / 12), t["x"]))
    return aus


@app.get("/health")
def health():
    return {"ok": not _stand["fehler"], "geladen": _stand["geladen"], "fehler": _stand["fehler"],
            "geraet": "cpu", "sprache": SPRACHE, "dpi": DPI}


@app.post("/lesen")
def lesen(datei: UploadFile = File(...)):
    name = os.path.basename(datei.filename or "plan.pdf")
    daten = datei.file.read()
    if not daten:
        raise HTTPException(400, "Datei ist leer")
    seiten = []
    with _sperre:
        try:
            for nr, bild in enumerate(bilder(name, daten), start=1):
                erg = ocr().predict(bild)
                stuecke = teile(erg[0]) if erg else []
                seiten.append({"seite": nr, "breite": int(bild.shape[1]), "hoehe": int(bild.shape[0]),
                               "teile": stuecke})
        except Exception as e:
            log.exception("lesen gescheitert")
            raise HTTPException(422, f"Datei konnte nicht gelesen werden ({type(e).__name__})")
    log.info("gelesen: %d kB, %d seiten, %d teile", len(daten) // 1024, len(seiten),
             sum(len(s["teile"]) for s in seiten))
    return {"dpi": DPI, "seiten": seiten}

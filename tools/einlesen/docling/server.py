"""
PlanR-Einlesen: HKP und Privatpläne (PDF oder Bild) strukturiert lesen.

Hauptleser ist Docling (Layout, Tabellen Zelle für Zelle, Texterkennung nur bei
Scans). Liefert Docling auf einer Seite zu wenig, liest PaddleOCR im
Nachbar-Container dieselbe Datei zusätzlich.

Nur CPU. Die Datei wird im Speicher verarbeitet und nirgends abgelegt; ins
Protokoll kommen nur Größe, Seitenzahl und Dauer.
"""
import hmac
import io
import logging
import os
import threading
import time

import httpx
from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile

log = logging.getLogger("einlesen")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")

for _laut in ("httpx", "httpcore"):
    logging.getLogger(_laut).setLevel(logging.WARNING)

TOKEN = os.environ.get("EINLESEN_TOKEN", "").strip()
PADDLE_URL = os.environ.get("PADDLE_URL", "").strip().rstrip("/")
THREADS = int(os.environ.get("EINLESEN_THREADS", "6"))
MAX_MB = int(os.environ.get("EINLESEN_MAX_MB", "30"))
MAX_SEITEN = int(os.environ.get("EINLESEN_MAX_SEITEN", "20"))
OCR_SPRACHEN = [s for s in os.environ.get("EINLESEN_OCR_SPRACHEN", "deu,eng").split(",") if s]
# Unter so vielen Zeichen auf einer Seite gilt sie als schlecht gelesen.
MIN_ZEICHEN = int(os.environ.get("EINLESEN_MIN_ZEICHEN", "80"))

ENDUNGEN = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}

app = FastAPI(title="PlanR-Einlesen", docs_url=None, redoc_url=None)
_sperre = threading.Lock()
_wandler = None
_stand = {"geladen": False, "fehler": ""}


def wandler():
    global _wandler
    if _wandler is not None:
        return _wandler
    from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import (
        PdfPipelineOptions,
        TableFormerMode,
        TableStructureOptions,
        TesseractCliOcrOptions,
    )
    from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption

    opt = PdfPipelineOptions()
    opt.do_ocr = True
    opt.do_table_structure = True
    opt.table_structure_options = TableStructureOptions(mode=TableFormerMode.ACCURATE, do_cell_matching=True)
    opt.ocr_options = TesseractCliOcrOptions(lang=OCR_SPRACHEN)
    opt.accelerator_options = AcceleratorOptions(num_threads=THREADS, device=AcceleratorDevice.CPU)
    _wandler = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=opt),
            InputFormat.IMAGE: ImageFormatOption(pipeline_options=opt),
        }
    )
    return _wandler


def _vorladen():
    try:
        with _sperre:
            wandler().initialize_pipeline(_pdf_format())
        _stand["geladen"] = True
        log.info("modelle geladen")
    except Exception as e:  # der Dienst bleibt erreichbar, /health zeigt den Fehler
        _stand["fehler"] = f"{type(e).__name__}: {e}"[:300]
        log.exception("vorladen gescheitert")


def _pdf_format():
    from docling.datamodel.base_models import InputFormat

    return InputFormat.PDF


@app.on_event("startup")
def start():
    threading.Thread(target=_vorladen, daemon=True).start()


def pruefe_token(authorization: str | None):
    if not TOKEN:
        raise HTTPException(503, "EINLESEN_TOKEN ist nicht gesetzt")
    erhalten = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(erhalten, TOKEN):
        raise HTTPException(401, "Token fehlt oder ist falsch")


def kasten(bbox, seite_nr, seiten):
    if bbox is None:
        return None
    hoehe = seiten.get(seite_nr, {}).get("hoehe") or 0
    b = bbox.to_top_left_origin(page_height=hoehe) if hoehe else bbox
    return {"x": round(b.l, 1), "y": round(b.t, 1), "b": round(b.r - b.l, 1), "h": round(b.b - b.t, 1)}


def ausgabe(doc):
    seiten = {
        nr: {"seite": nr, "breite": round(s.size.width, 1), "hoehe": round(s.size.height, 1)}
        for nr, s in doc.pages.items()
    }
    zeichen = {nr: 0 for nr in seiten}

    texte = []
    for t in doc.texts:
        if not t.prov or not (t.text or "").strip():
            continue
        p = t.prov[0]
        texte.append({"seite": p.page_no, "art": str(getattr(t.label, "value", t.label)), "text": t.text,
                      **(kasten(p.bbox, p.page_no, seiten) or {})})
        zeichen[p.page_no] = zeichen.get(p.page_no, 0) + len(t.text)

    tabellen = []
    for tab in doc.tables:
        nr = tab.prov[0].page_no if tab.prov else 0
        zellen = []
        for z in tab.data.table_cells:
            zellen.append({
                "zeile": z.start_row_offset_idx, "spalte": z.start_col_offset_idx,
                "zeilen": z.end_row_offset_idx - z.start_row_offset_idx,
                "spalten": z.end_col_offset_idx - z.start_col_offset_idx,
                "kopf": bool(z.column_header or z.row_header),
                "text": z.text,
                **(kasten(z.bbox, nr, seiten) or {}),
            })
            zeichen[nr] = zeichen.get(nr, 0) + len(z.text or "")
        tabellen.append({
            "seite": nr, "zeilen": tab.data.num_rows, "spalten": tab.data.num_cols,
            **(kasten(tab.prov[0].bbox, nr, seiten) or {} if tab.prov else {}),
            "zellen": zellen,
        })

    for nr, s in seiten.items():
        s["zeichen"] = zeichen.get(nr, 0)
        s["tabellen"] = sum(1 for t in tabellen if t["seite"] == nr)
    return {"seiten": list(seiten.values()), "texte": texte, "tabellen": tabellen,
            "markdown": doc.export_to_markdown()}


def paddle_lesen(name: str, daten: bytes):
    r = httpx.post(f"{PADDLE_URL}/lesen", files={"datei": (name, daten)}, timeout=600)
    r.raise_for_status()
    return r.json()


@app.get("/health")
def health():
    paddle = None
    if PADDLE_URL:
        try:
            paddle = httpx.get(f"{PADDLE_URL}/health", timeout=3).json()
        except Exception as e:
            paddle = {"ok": False, "fehler": type(e).__name__}
    return {"ok": not _stand["fehler"], "geladen": _stand["geladen"], "fehler": _stand["fehler"],
            "geraet": "cpu", "threads": THREADS, "ocr": {"maschine": "tesseract", "sprachen": OCR_SPRACHEN},
            "token": bool(TOKEN), "paddle": paddle}


@app.post("/einlesen")
def einlesen(
    datei: UploadFile = File(...),
    ergaenzung: str = Query("auto", pattern="^(auto|immer|nie)$"),
    authorization: str | None = Header(None),
):
    pruefe_token(authorization)
    name = os.path.basename(datei.filename or "plan.pdf")
    endung = os.path.splitext(name)[1].lower()
    if endung not in ENDUNGEN:
        raise HTTPException(415, f"Dateityp {endung or '?'} wird nicht gelesen")
    daten = datei.file.read(MAX_MB * 1024 * 1024 + 1)
    if len(daten) > MAX_MB * 1024 * 1024:
        raise HTTPException(413, f"Datei ist größer als {MAX_MB} MB")
    if not daten:
        raise HTTPException(400, "Datei ist leer")

    from docling.datamodel.base_models import ConversionStatus, DocumentStream

    start = time.time()
    with _sperre:
        try:
            erg = wandler().convert(DocumentStream(name="plan" + endung, stream=io.BytesIO(daten)),
                                    max_num_pages=MAX_SEITEN, raises_on_error=False)
        except Exception as e:
            log.exception("docling gescheitert")
            raise HTTPException(422, f"Datei konnte nicht gelesen werden ({type(e).__name__})")
    if erg.status not in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
        raise HTTPException(422, f"Datei konnte nicht gelesen werden ({erg.status.value})")

    aus = ausgabe(erg.document)
    aus["quelle"] = "docling"
    aus["vollstaendig"] = erg.status == ConversionStatus.SUCCESS
    dauer_docling = round(time.time() - start, 2)

    schwach = [s["seite"] for s in aus["seiten"] if s["zeichen"] < MIN_ZEICHEN or s["tabellen"] == 0]
    aus["schwache_seiten"] = schwach
    aus["ergaenzung"] = None
    if PADDLE_URL and (ergaenzung == "immer" or (ergaenzung == "auto" and schwach)):
        t0 = time.time()
        try:
            aus["ergaenzung"] = {"quelle": "paddleocr", **paddle_lesen("plan" + endung, daten),
                                 "dauer_s": round(time.time() - t0, 2)}
        except Exception as e:
            log.warning("paddle gescheitert: %s", type(e).__name__)
            aus["ergaenzung"] = {"quelle": "paddleocr", "fehler": type(e).__name__}

    aus["dauer_s"] = {"docling": dauer_docling, "gesamt": round(time.time() - start, 2)}
    log.info("gelesen: %d kB, %d seiten, %d tabellen, schwach=%s, %.1fs", len(daten) // 1024,
             len(aus["seiten"]), len(aus["tabellen"]), schwach, aus["dauer_s"]["gesamt"])
    return aus

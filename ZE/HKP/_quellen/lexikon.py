"""Liest die Erläuterungen je Position aus den BEL-/BEB-Lexika von 2te-zahnarztmeinung.de."""
import html
import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SRC = Path(__file__).parent
OUT = SRC.parent / "src" / "data"
UA = {"User-Agent": "Mozilla/5.0 (HKP-Planer Datenimport)"}


def laden(url: str) -> str:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode("utf-8")


def text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def abschnitte(seite: str) -> dict:
    body = seite.split("<h1", 1)[-1]
    titel = text(body.split("</h1>", 1)[0].split(">", 1)[-1])
    teile = re.split(r"<h2[^>]*>", body)
    ergebnis = {"titel": titel}
    for t in teile[1:]:
        kopf, _, inhalt = t.partition("</h2>")
        kopf = text(kopf)
        inhalt = inhalt.split("Inhaltsverzeichnis")[0]
        absaetze = [text(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", inhalt, re.S)]
        punkte = [text(li) for li in re.findall(r"<li[^>]*>(.*?)</li>", inhalt, re.S)]
        k = kopf.lower()
        if k.startswith("was bedeutet") or k.startswith("was ist"):
            ergebnis["beschreibung"] = " ".join(absaetze)[:700]
        elif "voraussetzung" in k or "indikat" in k:
            ergebnis["voraussetzungen"] = " ".join(absaetze)[:700]
        elif "begriffe" in k:
            ergebnis["begriffe"] = punkte[:8]
        elif "für wen" in k:
            ergebnis["zielgruppe"] = " ".join(absaetze)[:400]
    return ergebnis


def lexikon(index_url: str, praefix: str, ziel: str):
    idx = laden(index_url)
    links = sorted(set(re.findall(rf'href="(https://www\.2te-zahnarztmeinung\.de/lexikon/{praefix}-(\d{{4}})[^"]*)"', idx)))

    def eins(link):
        url, nr = link
        try:
            return nr, {**abschnitte(laden(url)), "url": url}
        except Exception as e:  # noqa: BLE001
            return nr, {"fehler": str(e), "url": url}

    with ThreadPoolExecutor(6) as ex:
        daten = dict(ex.map(eins, links))
    fehler = [n for n, d in daten.items() if "fehler" in d]
    (OUT / ziel).write_text(json.dumps({
        "quelle": index_url,
        "hinweis": "Allgemeine Erläuterungen für Patienten (2te-zahnarztmeinung.de) – keine verbindlichen Abrechnungsbestimmungen.",
        "eintraege": daten,
    }, ensure_ascii=False, indent=0), encoding="utf-8")
    print(ziel, len(daten), "Positionen,", len(fehler), "Fehler", fehler[:5])


lexikon("https://www.2te-zahnarztmeinung.de/lexikon/bel", "bel", "lexikon-bel.json")
lexikon("https://www.2te-zahnarztmeinung.de/lexikon/beb/", "beb", "lexikon-beb.json")

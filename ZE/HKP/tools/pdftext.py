"""Text eines PDFs (pypdf) bzw. Prüfsumme eines Gesetzes-XML-ZIP für tools/listen-aktualisieren.ts."""
import hashlib
import re
import sys
import zipfile

if sys.argv[1] == "text":
    import pypdf

    r = pypdf.PdfReader(sys.argv[2])
    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(p.extract_text() for p in r.pages))
elif sys.argv[1] == "zipxml":
    z = zipfile.ZipFile(sys.argv[2])
    daten = b"".join(z.read(n) for n in sorted(z.namelist()) if n.endswith(".xml"))
    # builddate ändert sich bei jeder Neuerzeugung des Downloads, nicht mit dem Normtext
    daten = re.sub(rb'builddate="[^"]*"', b"", daten)
    print(hashlib.sha256(daten).hexdigest())

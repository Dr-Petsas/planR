import pypdf,sys
for f in ["bel_bayern_2026.pdf","fz_betraege_2026.pdf","bema_kurz_2026.pdf","kuerzel.pdf"]:
    r=pypdf.PdfReader(f)
    open(f.replace(".pdf",".txt"),"w",encoding="utf-8").write("\n".join(p.extract_text() for p in r.pages))
    print(f,len(r.pages))

import json
z = json.load(open("/srv/planr/data/zugaenge.json"))
print("BENUTZER")
for uid, b in z.get("benutzer", {}).items():
    print(uid[:8], b.get("email"), str(b.get("clientId", ""))[:8], b.get("role"), str(b.get("name", ""))[:40], str(b.get("zuletzt", ""))[:19])
print("MANDANTEN")
for cid, m in z.get("mandanten", {}).items():
    praxen = [(p.get("nummer"), p.get("name")) for p in m.get("praxen", [])]
    print(cid[:8], m.get("mandant"), "register", str(m.get("register", ""))[:8], praxen)
s = json.load(open("/srv/planr/data/sitzungen.json"))
liste = s if isinstance(s, list) else []
print("SITZUNGEN", len(liste))
gesehen = []
for x in liste:
    c = x.get("konto") or {}
    zeile = (c.get("email"), str(c.get("clientId", ""))[:8], c.get("role"), str(c.get("uid", ""))[:8])
    if zeile not in gesehen:
        gesehen.append(zeile)
print("KONTEN")
for g in gesehen:
    print(*g)

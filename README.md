# planR

Planungsmodule für die Praxis (HKP, PAR, KFO, …). PVS-unabhängig: PlanR spricht kein DENSoffice direkt an.

Für die **HKP-Übernahme nach DENSoffice** braucht ihr den lokalen Sibling-Connector [pvsConnectoR](https://github.com/Dr-Petsas/pvsConnectoR).

## Checkout

Beide Repos nebeneinander:

```text
…\Dr-Petsas\
  planR\            ← dieses Repo
  pvsConnectoR\     ← https://github.com/Dr-Petsas/pvsConnectoR.git
```

```powershell
cd D:\dev\Dr-Petsas   # oder euer gemeinsamer Elternordner
git clone https://github.com/Dr-Petsas/planR.git
git clone https://github.com/Dr-Petsas/pvsConnectoR.git
```

## HKP lokal starten

```powershell
cd D:\dev\Dr-Petsas\planR\ZE\HKP
npm install
npm run dev
```

Browser öffnet die Vite-Dev-URL (meist http://127.0.0.1:5173).  
Der Dev-Server proxied `/pvs` → `http://127.0.0.1:8770` (dens-Connector).

## HKP nach DENSoffice übergeben

Alles lokal am gleichen Rechner.

### 1. Connector

Siehe [pvsConnectoR/README.md](../pvsConnectoR/README.md): DENSoffice-Mandant ok, dann:

```powershell
cd D:\dev\Dr-Petsas\pvsConnectoR
python connectors/dens/dens_connector_service.py
```

Health: http://127.0.0.1:8770/health → u. a. `"clinicalCreate": true`.

### 2. PlanR HKP

`npm run dev` in `ZE/HKP` (siehe oben).

### 3. In der UI

1. Plan wie gewohnt erfassen (Befund / Regelversorgung / Ergebnis).
2. **PVS-Verbindung:** Connector-URL leer lassen (= Proxy `/pvs`). Optional prüfen über den Verbindungsdialog.
3. Patient per Suche + Lupe im PVS finden und **aus der Trefferliste auswählen** (ohne Auswahl kein Anlegen).
4. **HKP anlegen** — PlanR sendet natives JSON; Mapping (Kürzel, BEL-Format, UK-Zahnschema) macht nur der Connector.

Danach den Plan in DENSoffice am Patienten öffnen und prüfen.

### Wenn etwas hakt

| Symptom | Typische Ursache |
|--------|-------------------|
| Route nicht gefunden / alter Stand | Connector-Prozess auf 8770 neu starten |
| Keine Verbindung | Connector nicht gestartet; Vite läuft nicht; URL nicht leer und falsch |
| Anlegen grau | Kein Patient aus der Suche ausgewählt |
| Laborkatalog-Fehler | Mapping/Catalog im Connector — nicht in PlanR ändern |
| UK-Zahnschema vertauscht | Connector-Zahnschema — PlanR speichert normales HKP-Papier-Layout |

## Was PlanR bewusst nicht macht

- Keine DENS-Kürzel- oder BEL-Sonderformate
- Keine PVS-Datenbankpfade, keine Hersteller-DLLs
- Kein Schreiben in DENSoffice ohne laufenden pvsConnectoR

Details und Einrichtung des Connectors: **pvsConnectoR**-README im Sibling-Repo.

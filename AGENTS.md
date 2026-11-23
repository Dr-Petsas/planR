# Arbeitsregeln PlanR (verbindlich für alle Sessions)

PlanR rechnet zahnärztliche Heil- und Kostenpläne (BEMA, GOZ, GOÄ, BEL II, BEB,
Festzuschüsse) für echte Praxen auf `https://planr.pickadoc.de/`. Hier geht es
um Abrechnungen und Geld — **erreichte, geprüfte Abrechnungslogik darf durch
spätere Korrekturen nicht beschädigt werden.**

## Eiserne Regeln

1. **Release-Gate vor jedem Commit und Deploy:**
   - Vollständig (~45 s, Pflicht vor Commit & Deploy):
     `powershell -ExecutionPolicy Bypass -File tools\release-gate.ps1`
   - Schnell (~15 s, Synchronität + TypeScript für alle 13 Pakete):
     `powershell -ExecutionPolicy Bypass -File tools\release-gate.ps1 -Schnell`
   - Gate rot => **NICHT committen, NICHT deployen**, erst Ursache beheben.
   - `Start\tools\strato\deploy.ps1` führt das Release-Gate automatisch vor dem
     Bauen aus; `einrichten.sh` rollt bei fehlgeschlagenem Start oder HTTP-Check
     automatisch auf `/srv/planr/start.alt` und `/srv/planr/planer.alt` zurück.

2. **Geteilter Code gehört nach `_gemeinsam/src/`:**
   - Gemeinsame Bausteine (`Befundleiste`, `Mandant`, `Stammdaten`, `Ablage`,
     `Versand`, `Eigenlabor`, `Punktwerte`, `KiZeile` usw.) **immer nur in
     `_gemeinsam/src/` ändern** und anschließend mit `node tools/gemeinsam.mjs`
     in alle Planer verteilen.
   - Niemals nur eine einzelne Kopie in einem Planer patchen — das Gate
     (`node tools/gemeinsam.mjs --pruefen`) schlägt sonst sofort an.

3. **Regression-First bei Abrechnungs- und Parser-Bugs:**
   - Bevor ein Fehler in einem Rechenkern (`*/src/engine/*`) oder beim Einlesen
     behoben wird, zuerst einen minimalen Testfall schreiben, der den Fehler
     reproduziert.
   - Die **Golden-Master-Tests** (`ZE/HKP/src/engine/golden-master.test.ts`,
     `ZE/Privat-HKP/src/engine/golden-master.test.ts`,
     `Implantologie/Privat-Impl/src/engine/golden-master.test.ts`) frieren
     reale Praxisfälle Cent- und Ziffer-genau ein. Sie dürfen **nie blind mit
     `-u` aktualisiert** werden — jede Abweichung muss fachlich begründet sein.

4. **Server-Typprüfung bleibt grün:**
   - `Start/plaene-server.ts` und alle Server-Module im `Start/`-Root werden
     über `Start/tsconfig.server.json` geprüft (`npm run typecheck` in `Start/`).

5. **Bridge-Schutz:**
   - `Bridge/` und die Bridge-API-Verträge (`/api/pvs/*`, Long-Poll-Protokoll)
     nicht „nebenbei“ ändern — Änderungen an der Bridge bedeuten ein Update auf
     den Praxisservern und erfolgen nur nach ausdrücklicher Freigabe.

6. **Engine-Synchronisation mit MAS/Clara:**
   - Nach bewussten Änderungen am Rechenkern von `ZE/HKP`, `ZE/Privat-HKP`,
     `Implantologie/Privat-Impl`, `KONS/*`, `KB/Privat-KB` prüfen, ob
     `npm run build:engine` für MAS/Clara mitgezogen werden muss.

7. **Git ist Pflicht:**
   - Nur eigene, getestete Dateien committen (deutsche Commit-Message: was + warum).
   - Keine lokalen Daten/Secrets (`Start/data/*`, `planr-*.env`) committen.

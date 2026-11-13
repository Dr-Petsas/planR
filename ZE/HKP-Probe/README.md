# PlanR-Probe (Landingpage)

Oberfläche des HKP-Planers für die Probe auf `planr.pickadoc.de/#probe`. Sie wird unter `/planer/probe-hkp/` ausgeliefert und von `Start/src/probe.ts` in einen Rahmen geladen.

Diese Oberfläche und der HKP-Planer (`ZE/HKP`, `/planer/hkp/`) werden getrennt entwickelt:

- **Eigen (hier):** `src/` – App, Komponenten, Stylesheets, Speicher, Einlesen des hochgeladenen Plans (`probeImport.ts`, `probeOriginal.ts`). Änderungen hier wirken nur auf die Probe.
- **Gemeinsam (`@kern` = `ZE/HKP/src`):** `engine/`, `data/`, `clara/`, `types.ts` und was diese selbst einbinden (`format.ts`, `store/plan.ts`, `store/preislisten.ts`, `store/praxiskatalogDaten.ts`). Eine Änderung dort trifft beide Oberflächen.
- `public/` kommt aus `ZE/HKP/public` (Listenstand, Favicon).

Prüfen: `npx tsc -b`, `npx vitest run`. Ausliefern: `Start\tools\strato\deploy.ps1`.

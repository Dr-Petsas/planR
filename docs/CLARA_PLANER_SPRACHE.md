# Gesamtplan: Clara steuert alle PlanR-Planer per Sprache

Stand 07.10.2026. Vorlage ist die HKP-Strecke (Kassen-HKP), die seit dem
05./06.10.2026 live läuft. Ziel: Für **jeden** Planer gilt derselbe Ablauf,
dieselben Sicherungen und dieselbe Bedienung am Handy.

> Gehört als Arbeitspaket-Block auf die Warteliste von
> `F:\MAS-2\docs\MASTERPLAN_CLARA_2026-07.md`. Erst nach Freigabe durch den
> Chef wird gebaut, Paket für Paket bis zur Definition of Done.

---

## 1. Der Ablauf, den der Chef erwartet

```
Chef:  "Clara, mach mir einen Implantat-Kostenvoranschlag für Frau Greisinger,
        Implantate regio 36 und 46, mit Sinuslift ist nichts, DVT haben wir."
Clara: (sucht Patientin, ggf. Namensvetter-Frage)
       "Noch zur Ausführung: wie üblich medentis ICX und Lokalanästhesie?"
Chef:  "Ja, wie immer."
Clara: "Bevor ich anlege: Frau Inge Greisinger, geboren 3. März 1961.
        Zwei Implantate, eins drei sechs und vier sechs, mit DVT, ICX,
        Lokalanästhesie. Gesamt voraussichtlich 4.380 Euro.
        Soll ich den Entwurf so anlegen?"
Chef:  "Ja."
Clara: "Ist angelegt. Ich lege Ihnen die Regler aufs Handy."
       -> Handy klappt auf die Planer-Ansicht (Regler, Summen, Freigeben)
Chef:  (schiebt den GOZ-Faktor) ... "Mach den Faktor auf 2,8."
Clara: "Faktor zwei Komma acht, Gesamt jetzt 4.910 Euro."
       -> Ansicht lädt die neuen Werte nach
Chef:  "Passt, das mache ich gleich am PC fertig."
Clara: -> Handy klappt zurück auf Clara
       "Gut, der Entwurf wartet in PlanR auf Sie. Was kann ich noch tun?"
       (wartet auf das nächste Kommando, legt NICHT auf)
```

Freigabe bleibt wie beim HKP **ausschließlich ein Klick** (Handy-Ansicht oder
PlanR am PC). Clara gibt nie per Sprache frei.

---

## 2. Was es heute schon gibt (HKP-Strecke)

| Baustein | Ort | Wiederverwendbar? |
|---|---|---|
| Clara-Werkzeuge `hkp_*` (Gruppe `hkp`, `speak_result: verbatim`) | `Clara-Voice/profiles/clara_meddent/profile.json` | Muster ja, Namen HKP-spezifisch |
| Deterministisches Routing, Ja-Wächter, offener Auftrag, parallele Aufträge | `Clara-Voice/services/intent_router.py` (~26 HKP-Funktionen) | Muster ja, Code HKP-spezifisch |
| Vollzugs-, Vorschau-, Recall-Isolation-Wächter | `response_guard.py`, `tool_subsetting.is_hkp_reply` | ja, um Art `plan` erweitern |
| MAS-Routen `/tools/hkp-*`, Vorschau je Patient (max. 6, 10 min), Ausführungs-Rückfrage, Namensvetter | `MAS-2/backend/src/routes/hkp.js` | Logik ja, Route HKP-fest |
| Register in Firestore `clients/{id}/hkp`, Status `wartet_auf_freigabe` … `verworfen` | `MAS-2/backend/src/hkp/store.js` | Schema ja |
| Link-/Freigabe-Schlüssel (HMAC, 14 bzw. 3 Tage) | `routes/hkp.js` L210–255 | ja, Zweck um Planer-Typ erweitern |
| Karte `kind: "hkp"` über LiveKit `pickadoc.evt` | Worker `worker_llm_turn.py` L1469 | ja |
| Vollbild-iframe mit PlanR `?ansicht=mobil`, Schließen per Knopf / `postMessage` | `MAS-2/backend/public/m/call.html` L832–891 | nur HKP fest verdrahtet |
| Stille-Fenster 180 s nach HKP-Karte | `CLARA_HKP_ANSICHT_S` | ja |
| Engine-Bündel nach MAS | `PlanR/ZE/HKP` `npm run build:engine` -> `src/vendor/hkp-engine.mjs` | Muster ja |
| Rückgängig ("doch nicht") | `MAS clara/rueckgaengig.js` | ja |

**Was fehlt (auch beim HKP):**

1. Clara kann die Handy-Ansicht **nicht selbst schließen oder öffnen**.
   Schließen geht nur per Knopf am Handy oder implizit durch eine neue
   Nicht-HKP-Karte.
2. Kein Intent für "mach ich am PC / gleich in PlanR / später".
3. Regler-Änderungen am Handy werden erst bei der Freigabe gespeichert —
   Clara kennt den Stand nicht, wenn der Chef danach etwas sagt.
4. Eine Sprach-Änderung, während die Ansicht offen ist, lädt die Ansicht
   nicht neu.
5. Die fünf anderen Planer haben weder Sprach-Parser noch Engine-Bündel noch
   Handy-Ansicht noch MAS-Register (nur `localStorage`).

---

## 3. Architektur-Entscheidung: EINE Planer-Strecke statt fünf HKP-Kopien

Fünfmal `routes/hkp.js` + fünfmal 26 Router-Funktionen wäre nicht wartbar
und würde Claras Prompt mit ~30 zusätzlichen Werkzeug-Schemas füllen
(Kontextfenster-Vorfall 16.06.!). Deshalb:

### 3.1 PlanR: je Planer ein reiner Engine-Eingang `src/clara/index.ts`

Jeder Planer bleibt unabhängig (eigene Kopie, keine Querimporte), bekommt aber
**dieselbe Schnittstelle**:

```ts
export const PLANER = 'impl'            // privat-ze | impl | par | mkv | kons
export const ENGINE_STAND = '2026-10-xx'
auftragVerstehen(text): Auftrag | Rueckfrage   // gesprochener Auftrag -> Struktur
ausfuehrungFehlt(auftrag): Frage | null         // EINE Rückfrage vor der Vorschau
planAusAuftrag(auftrag, befund?, praxis?): Plan | Rueckfrage
rechnen(plan, praxis): Ergebnis                  // die vorhandene Engine
zusammenfassen(plan, ergebnis): string           // Vorlese-Text (Vorschau/Details)
summenSatz(ergebnis): string                     // "Gesamt ..., Mehrkosten ..."
reglerVerstehen(text): Partial<Regler> | null   // "Faktor auf 2,8", "25 Euro pro Fläche"
reglerSetzen(plan, teil): Plan
ausfuehrungAendern(plan, text): Plan | Rueckfrage
planNormalisieren(json): Plan
```

- **Keine React-Importe** im Engine-Pfad (der HKP-Bündel schleppt React mit,
  weil `clara/` die Stores importiert — bei den neuen gleich sauber trennen).
- `npm run build:engine` -> `MAS-2/backend/src/vendor/<planer>-engine.mjs`
  (Kopierskript wie `tools/engine-nach-mas.mjs`).
- Parser-Tests in vitest mit echten Sätzen aus Anrufen (wie `auftrag.test.ts`).

### 3.2 PlanR: Handy-Ansicht `?plan=<id>&t=…&f=…&ansicht=mobil`

Je Planer eine schlanke `PlanMobil.tsx` im einheitlichen Design (heute schon
angeglichen): Kopf mit Patient + Summe, **dieselben Schieberegler** wie am PC,
mitlaufende Summen, Knöpfe **Freigeben · Später · Zurück zu Clara**.

- Laden: `GET /mas/planr/plan-link/:id` (Header `X-PlanR-Link`).
- **Neu:** Regler-Änderungen werden nach 800 ms Ruhe als Entwurf
  zurückgeschrieben (`PATCH /mas/planr/plan-link/:id`, ohne Freigabe-Recht),
  damit Clara und der PC denselben Stand sehen.
- Freigeben: `PUT` mit Freigabe-Schlüssel (nur aus der Karte, nie per SMS).
- `postMessage({ type: 'planr-plan', planer, id, aktion: 'zurueck' | 'freigegeben', summen })`.
- **Neu:** hört auf `postMessage({ type: 'planr-neu-laden' })` und lädt den
  Plan frisch (nach einer Sprach-Änderung).
- Vite-Preview bekommt wie der HKP den Proxy `/mas -> 127.0.0.1:4000`.
  Tunnel-Hosts existieren schon (`phkp`, `pimpl`, `par`, `mkv`, `kons`).

### 3.3 PlanR am PC: "Von Clara angelegt"

Damit "mach ich am PC" funktioniert, muss der Planer am PC den Entwurf
**finden**: Reiter Patient bekommt oben eine Liste "Wartet auf Freigabe
(von Clara)" aus `GET /mas/planr/plaene?planer=impl&status=wartet_auf_freigabe`
(Praxis-Schlüssel `X-PlanR-Key` wie beim HKP-Register). Öffnen lädt den
Entwurf, Speichern schreibt zurück, Freigeben setzt den Status.
Ein am Handy zuletzt zurückgeklappter Plan steht dort ganz oben
("vor 2 min am Handy bearbeitet").

### 3.4 MAS: generische Route `routes/planr-plaene.js`

- Register `clients/{id}/plaene/{planId}` mit `planer`, `patient`, `planJson`,
  `summen`, `status` (gleiche Werte wie HKP), `version`, `quelle: 'clara'`,
  `zuletztAmHandy`.
- Clara-Werkzeuge (siehe 3.5) als `/tools/plan-*`, jeweils mit `planer`.
- Die HKP-Logik wird **nicht** umgebaut, sondern ihre Bausteine werden
  herausgelöst und geteilt: Patientenauflösung + Namensvetter
  (`patientCatalog`), Vorschau je Patient (`vorschauMerken/-Finden`),
  Ausführungs-Rückfrage, Token (Zweck `plan-link:<planer>`), Rückgängig.
- Karte `kind: "plan"`, `planer: "impl"`, `planId`, `url`, `version`,
  `items` (Gesamt / Kasse / Eigenanteil bzw. Mehrkosten).
- Kasse vs. privat: MAS kennt die Kassenart aus der Kartei. "HKP" bei
  Kassenpatient = Kassen-HKP (bestehend), bei Privatpatient = Privat-ZE.
  Fehlt die Angabe: eine Rückfrage "Kasse oder privat?".

### 3.5 Clara: fünf generische Werkzeuge, Gruppe `plan`

| Werkzeug | Zweck |
|---|---|
| `plan_entwurf` | `planer`, `name`, `hint`, `auftrag`, `befund`, `bestaetigt`, `alte_verwerfen` — Vorschau, dann Anlage |
| `plan_details` | vorlesen / Summenfrage (`frage`) |
| `plan_regler` | Preisanpassung per Sprache ("Faktor 2,8", "30 Euro pro Fläche", "Stufe erweitert") — Vorschlag + Ja |
| `plan_ausfuehrung_aendern` | Material, Vereinbarungsart, Implantatsystem … — Vorschlag + Ja |
| `plan_ansicht` | `aktion: oeffnen | schliessen | neu_laden`, `grund: pc | spaeter | fertig` — steuert das Handy |

Kein Freigabe-Werkzeug. Der Kassen-HKP behält seine `hkp_*`-Werkzeuge;
nur `plan_ansicht` gilt für beide.

Routing (`intent_router.planer_erkennen`, deterministisch, vor dem Modell):

| Sprechweise | Planer |
|---|---|
| "Implantat-KV", "Implantologie", "Implantate regio …", "Sinuslift" | `impl` |
| "Privat-KV Zahnersatz", "HKP" bei Privatpatient | `privat-ze` |
| "PAR", "Parodontitis-Antrag", "PAR-Plan" | `par` |
| "Mehrkosten(vereinbarung)", "MKV", "Komposit statt Amalgam" bei Kassenpatient | `mkv` |
| "Wurzelbehandlung privat", "Endo-KV", "Bleaching", "Privat-Kons" | `kons` |
| "HKP", "Heil- und Kostenplan" bei Kassenpatient | bestehender HKP |

Unklar -> eine Rückfrage ("Meinen Sie den Implantat-Kostenvoranschlag oder
den Zahnersatz?"), nie raten.

---

## 4. Bildschirm-Steuerung ("flippen") — neu, gilt auch für den HKP

### 4.1 Transport

Neues Ereignis über denselben LiveKit-Kanal `pickadoc.evt`:

```json
{ "type": "ansicht", "aktion": "schliessen", "grund": "pc" }
{ "type": "ansicht", "aktion": "oeffnen",  "planId": "…" }
{ "type": "ansicht", "aktion": "neu_laden", "planId": "…", "version": 7 }
```

`call.html`: das HKP-Blatt wird zum allgemeinen **Planer-Blatt** (`kind`
`hkp` oder `plan`), `hkpOeffnen/hkpSchliessen` -> `blattOeffnen/blattSchliessen`.
`neu_laden` schickt `planr-neu-laden` ins iframe. Das Handy meldet Öffnen /
Schließen zurück (`pickadoc.cmd`: `{"type":"ansicht_status","offen":false}`),
damit Clara weiß, was der Chef gerade sieht.

### 4.2 Wann Clara zurückklappt

Fest erkannt (`intent_router.ansicht_zurueck_call`, vor dem Modell, nur wenn
eine Planer-Ansicht offen ist oder in den letzten 10 min eine Planer-Karte kam):

- "mach ich am PC / am Rechner / in PlanR (fertig)", "das mache ich gleich
  selbst", "ich schau's mir am Computer an" -> `grund: pc`
- "später", "nicht jetzt", "lass mal offen" -> `grund: spaeter`
- "zurück", "zu Clara", "mach das zu", "Ansicht schließen", "passt so" (nur
  wenn die Ansicht offen ist) -> `grund: fertig`

Ablauf: Ansicht schließen -> Status im Register `zuletztAmHandy` setzen (der
Entwurf bleibt `wartet_auf_freigabe`) -> **ein** kurzer Satz:

- pc: "Gut, der Entwurf wartet in PlanR auf Sie. Was kann ich noch tun?"
- spaeter: "In Ordnung, er bleibt als Entwurf liegen. Sonst noch etwas?"
- fertig: "Gern. Was kann ich noch tun?"

Danach **wartet** Clara: kein Auflegen. Das Stille-Fenster bleibt wie nach einer
HKP-Karte auf `CLARA_HKP_ANSICHT_S` (180 s), danach die normale
Abschieds-Frage ("Brauchen Sie noch etwas?") statt sofortigem Auflegen.

Nie zurückklappen bei "Nein, das ist falsch …", "Am PC habe ich gesehen,
dass …" (Aussage mit Inhalt), Fragen ("Kann ich das am PC ändern?" ->
Antwort "Ja, der Entwurf liegt in PlanR"), oder wenn gar keine Ansicht offen ist.

### 4.3 Wann Clara aufklappt

- nach dem Anlegen (wie heute beim HKP: Karte -> Ansicht),
- "zeig mir den Plan / die Regler nochmal", "mach die Regler auf" ->
  `plan_ansicht(oeffnen)` mit dem Plan im Gespräch,
- nach einer Sprach-Änderung bei offener Ansicht nur `neu_laden`, kein
  erneutes Aufklappen.

---

## 5. Planer-spezifisch: was Clara erfragt und vorliest

| Planer | Auftrag (Beispiel) | Eine Rückfrage vor der Vorschau | Regler per Sprache | Vorlesen |
|---|---|---|---|---|
| **Füllungs-MKV** | "MKV für Herrn Petsas, 16 MOD und 26 OD Komposit" | Modell, falls keine Praxisvorgabe ("25 Euro pro Fläche wie üblich?"); Hinweis bei Frontzahn/Austausch intakter Füllung | "30 pro Fläche", "pauschal 60 pro Füllung", "Faktor 3" | je Zahn Flächen + Mehrkosten, Kassenanteil, Mehrkosten gesamt; "über 3,5 braucht ein eigenes Blatt" |
| **Privat-Kons** | "Endo-KV für Frau X, 36 drei Kanäle, mit Mikroskop" | Vereinbarungsart (privat / Kasse komplett privat / Kasse mit Zusatzleistungen), falls nicht aus Kartei ableitbar | "Stufe erweitert", "Faktor 3,0", "Material Premium" | Therapie je Zahn, Zusatzleistungen, Summe; Analog-Hinweis |
| **Privat-ZE** | "KV für Frau X, 14 bis 16 Brücke Zirkon" (Parser vom HKP kopiert) | Material, Abformung, Labor (wie HKP) | "GOZ-Faktor 2,8", "Laborstufe 2", "BEB plus 5 %" | Versorgung, Honorar, Labor, Gesamt |
| **Implantologie** | "Implantate 36 und 46 für Herrn X, mit Knochenaufbau" | System, Bildgebung, Sedierung | "Begleitleistungen Stufe 2", "GOÄ-Faktor 1,8" | Implantate, Augmentation, GOZ/GOÄ/Material, Gesamt; Verweis ZE-KV |
| **Kassen-PAR** | "PAR-Antrag für Herrn X" | Stadium/Grad nur, wenn Befund vorliegt; sonst ehrlich: "Die Messwerte brauche ich aus dem Befund" | "Umsatz-Ziel 1.800 Euro" (Strecke) | Diagnose, Strecke, UPT-Termine, Summe |

**PAR ist Sonderfall:** Der Antrag braucht Sondierungstiefen je Zahn. Per
Telefon-Sprache nicht sinnvoll — die Messwerte kommen aus dem
PAR-Befund (Lena/iPad-Diktat oder PVS). Clara legt den Fall an, liest Strecke
und Summen vor und klappt die Ansicht auf; Messwerte diktieren ist ein
eigenes Lena-Paket (Isolationsregel Clara/Lena beachten).

---

## 6. Sicherungen (alle aus der HKP-Strecke übernommen)

- **Erst vorlesen, dann anlegen**; angelegt nur auf reines Ja zu GENAU dieser
  Vorschau (10 min, gleicher Patient, kein neuer Inhalt). Ja-Wächter streicht
  ein vom Modell gesetztes `bestaetigt`.
- **Vollzugs-Wächter** Art `plan`: "angelegt", "geändert", "Faktor gesetzt"
  nur mit dem passenden Werkzeug und "ist angelegt"/"Erledigt" im Ergebnis.
- **Vorschau-Wächter**: erfundene Summen/Vorschauen ohne Werkzeug -> Ersatzsatz.
- **Recall-Isolation**: `is_plan_reply()` — ein Ja auf einen Planer-Satz gibt
  nie den Recall frei.
- **Parallele Pläne** je Patient und Planer (wie HKP parallel): "Jetzt Frau
  Greisinger" wechselt den aktiven Auftrag.
- **Rückgängig**: "doch nicht" nach Anlage -> Entwurf verworfen.
- **Sprech-Schicht**: Zahnnummern ziffernweise, Beträge in Worten, keine
  Datumsangaben aus dem Kopf.
- **Werkzeug-Subsetting**: Gruppe `plan` nur bei Planer-Intent oder offenem
  Auftrag; nie im Unklar-Fallback; kurze Folgesätze erben die Gruppe.
- **Notaus je Stufe**: `CLARA_PLAN_TOOLS=0`, `CLARA_ANSICHT_STEUERN=0`,
  `MAS_PLAN_TOOLS=0`, `MAS_PLAN_KARTE=0`, `MAS_PLAN_HANDY_SPEICHERN=0`,
  je Planer `MAS_PLAN_<PLANER>=0`.

---

## 7. Arbeitspakete (Reihenfolge, je mit Definition of Done)

**P0 – Bildschirm-Steuerung für den bestehenden HKP** (schneller Gewinn, klein)
- `ansicht`-Ereignis im Worker, Planer-Blatt in `call.html`, Rückmeldung
  `ansicht_status`, Intent `ansicht_zurueck_call`, Stille-Fenster bleibt.
- HKP-Handyansicht speichert Regler-Stand als Entwurf und lädt auf
  `planr-neu-laden` nach.
- DoD: `test_ansicht.py` im Release-Gate (Sätze von 4.2 inkl. Negativfälle),
  MAS-Test, Nachstellung mit echtem Modell, Live-Anruf "HKP anlegen ->
  Regler -> mach ich am PC -> nächstes Kommando".

**P1 – Generische Planer-Strecke in MAS + Clara, Pilot Füllungs-MKV**
- MAS `routes/planr-plaene.js`, Register, Token, Karte `kind: plan`,
  geteilte Bausteine aus `hkp.js` herausgelöst (HKP-Tests bleiben grün).
- MKV: `src/clara/index.ts`, Parser ("16 MOD Komposit", "zweiflächig",
  "25 pro Fläche"), `PlanMobil`, Liste "von Clara" am PC, `build:engine`.
- Clara: Gruppe `plan`, fünf Werkzeuge, `planer_erkennen`, Wächter Art `plan`.
- DoD: vitest-Parser mit ≥ 30 echten Sätzen, MAS `run-tests plan`,
  `test_plan_routing.py` im Gate, Voll-Gate grün, Live-Anruf.

**P2 – Privat-Kons** (Parser für Therapie-Kürzel in Worten: "Wurzelbehandlung
drei Kanäle", "Aufbau mit Glasfaserstift", Vereinbarungsart)

**P3 – Privat-ZE** (HKP-Parser als Kopie übernehmen, Privat-Ausführung)

**P4 – Implantologie** (Regionen, Augmentation, System; Verknüpfung mit dem
Privat-ZE-Entwurf desselben Patienten)

**P5 – Kassen-PAR** (Fall anlegen, Strecke vorlesen, Regler; Messwerte über
Lena-Paket)

**P6 – Feinschliff**: Nachtlauf-Prüfliste um Planer-Gespräche erweitern,
Morgenmeldung "3 Entwürfe von Clara warten auf Freigabe".

---

## 8. Offene Entscheidungen für den Chef

1. **Regler per Sprache**: Soll Clara Preise auch auf Zuruf ändern ("Faktor
   2,8") oder nur die Regler aufs Handy legen? (Plan oben: beides, Änderung
   immer mit Vorschlag + Ja.)
2. **Kasse/privat**: reicht die Kassenart aus der Kartei, oder soll Clara
   immer nachfragen?
3. **Nach "mach ich am PC"**: nur zurückklappen und warten (so geplant) —
   oder zusätzlich nach 3 Minuten Stille fragen "Soll ich auflegen?"
4. **PAR per Sprache**: reicht "Fall anlegen + vorlesen", oder sollen
   Messwerte auch am Telefon diktiert werden können?
5. **Reihenfolge**: MKV als Pilot (einfachster Auftrag) oder Implantologie
   zuerst (höchster Betrag)?

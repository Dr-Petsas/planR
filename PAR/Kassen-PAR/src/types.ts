// Datenmodell des Kassen-PAR-Planers (Parodontitis-Behandlung nach PAR-Richtlinie).
// Nachgebaut nach KZBV eFormular 5 (PAR-Status), Version 2.1.0, gueltig ab 01.04.2026.

// ---------------------------------------------------------------------------
// Zahnbefund (Blatt 2)
// ---------------------------------------------------------------------------

/** Zahnstatus-Code im PAR-Status Blatt 2. */
export type ZahnStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6
// 0 = vorhanden/erhaltungswuerdig, 1 = fehlend, 2 = nicht erhaltungswuerdig,
// 3 = Krone, 4 = Brueckenpfeiler, 5 = Ersatz (Brueckenglied), 6 = Implantat

export type Grad0123 = 0 | 1 | 2 | 3

/** Befund eines einzelnen Zahns (2 Messstellen: mesial, distal). */
export interface ZahnBefund {
  zs: ZahnStatus
  st: (number | null)[] // 2 Sondierungstiefen in mm: [mesial, distal]
  bop: boolean[] // 2 Blutungsflags (Sondierungsbluten, "*")
  lockerung: Grad0123 // zentrales Feld der Krone
  fb: Grad0123 // Furkationsbefall
  aitOverride: boolean | null // AIT-Zeile: null = automatisch (ST>=4mm), sonst manuell
}

/** Phasen, in denen ein vollstaendiger Blatt-2-Befund erhoben wird. */
export type BefundPhase = 'initial' | 'beva' | 'bevb' | 'upt'

export interface Befund {
  id: string
  phase: BefundPhase
  datum: string
  bezeichnung: string // z.B. "Initialbefund", "BEV a", "UPT g 1. Jahr"
  zaehne: Record<string, ZahnBefund>
}

// ---------------------------------------------------------------------------
// Diagnose / Staging / Grading (Blatt 1)
// ---------------------------------------------------------------------------

export type RaucherStatus = 'nein' | 'unter10' | 'ab10'
export type DiabetesStatus = 'nein' | 'hba1c_unter7' | 'hba1c_ab7'

export interface Diagnose {
  alter: number
  knochenabbauProzent: number // max. roentgenologischer Knochenabbau in % der Wurzellaenge
  knochenabbauZahn: string
  calMax: number // max. interdentaler klinischer Attachmentverlust (mm)
  zahnverlustPar: number // Anzahl wegen Parodontitis verlorener Zaehne
  raucher: RaucherStatus
  diabetes: DiabetesStatus
  // Komplexitaetsfaktoren (koennen das Stadium anheben)
  st6plus: boolean // ST >= 6 mm, vertikaler KA >= 3 mm, FB Grad II/III
  vertikalerKA3: boolean
  furkationII_III: boolean
  komplexeReha: boolean // komplexe Rehabilitation mastikatorischer Dysfunktion
  mipMuster: boolean // Molaren-Inzisiven-Muster (Ausmass, manuell)
  diagnoseTyp: 'parodontitis' | 'systemisch' | 'sonstige_vergroesserung'
}

/** Anamnese-Block Blatt 1. */
export interface Anamnese {
  diabetesMellitus: boolean
  tabakkonsum: boolean
  sonstiges: string
  fruehereParTherapie: boolean
  fruehereParJahr: string
}

/** Antragskopf Blatt 1. */
export interface Antragskopf {
  antragsnummer: string
  antragsnummerUrspruenglich: string // bei Folgeplaenen
  verarbeitungskennzeichen: string
  artBehandlungsplan: 'initial' | 'bev' | 'cpt' | 'upt_verlaengerung'
  wechselkennzeichen: '' | 'kasse' | 'zahnarzt'
  aktenzeichenPVS: string
  logVersion: string // "2.1.0"
}

export type KkEntscheidung = 'offen' | 'uebernommen' | 'nicht_uebernommen'
export type Gutachten = 'offen' | 'befuerwortet' | 'nicht_befuerwortet'

// ---------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------

export interface Patient {
  name: string
  vorname: string
  geburtsdatum: string
  kasse: string
  versichertennr: string
  kostentraegerkennung: string // 9-stellig (IK der Kasse)
  kassennummer: string // Versichertenart/Regionalkennzeichen (erste 2 Ziffern = Regionalkennzeichen)
  kassenart: Kassenart
}

export type Kassenart = 'primaer' | 'ersatz'

export interface Praxis {
  name: string
  strasse: string
  plz: string
  ort: string
  telefon: string
  zahnarztNr: string
  abrechnungsNr: string
  behandler: string
}

// ---------------------------------------------------------------------------
// Behandlungsstrecke: Termine mit Leistungs-Kacheln (geplant + erbracht)
// ---------------------------------------------------------------------------

export type TerminArt =
  | 'befund' // 4 Parodontalstatus (+ Roentgen)
  | 'atg' // ATG, MHU
  | 'pzr' // private Vorbehandlung (optional)
  | 'ait' // AIT a/b
  | 'bev' // BEV a
  | 'cpt' // CPT a/b
  | 'nachbehandlung' // 111
  | 'bevb' // BEV b
  | 'upt' // UPT a-g
  | 'kontrolle'

/** UPT-Module einer Sitzung. */
export type UptModul = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g'

export type AbrechnungsModus = 'bema' | 'bemaplus'

/** Ein Termin der PAR-Strecke. Geplant und – nach Haken – erbracht. */
export interface Termin {
  id: string
  /** stabiler Plan-Schluessel, z.B. "ait-2", "upt-3" (fuer Neuberechnung) */
  schluessel: string
  art: TerminArt
  titel: string
  datum: string
  datumManuell: boolean // von Hand verschoben -> wird bei Neuberechnung behalten
  erbracht: boolean
  /** behandelte Zaehne; null = automatisch aus dem Befund */
  zaehne: string[] | null
  module: UptModul[] // nur UPT
  verlaengerung: boolean // UPT im Verlaengerungszeitraum
  auswahl: string[] // von Hand zugeschaltete Kachel-IDs
  abgewaehlt: string[] // von Hand abgeschaltete Kern-Kacheln
  auto: string[] // vom Regler zugeschaltete Kachel-IDs (Stern)
  mengen: Record<string, number> // Mengen-Override je Positionsschluessel "SYS|Nr"
  faktoren: Record<string, number> // Steigerungsfaktor je Positionsschluessel (GOZ/GOAE)
  /** Roentgen von Hand gewaehlt (BEMA-Nr.); '' = nach Befund */
  roentgen: string
  bemerkung: string
}

export interface Planung {
  start: string // Datum Befundaufnahme
  genehmigungTage: number // Befund -> ATG (Genehmigung abwarten)
  mitPzr: boolean
  aitSitzungen: 1 | 2 | 4 // 1 = alles, 2 = je Kiefer, 4 = je Quadrant
  aitAbstandTage: number
  cptSitzungen: 1 | 2 | 4
  einstieg: 'komplett' | 'ait' | 'bev' | 'upt' // Uebernahmefall
  uptAb: number // Uebernahme: Einstieg ab UPT Nr.
  uptStart: string // Datum der ersten UPT; '' = nach der Befundevaluation
  verlaengerungMonate: number // 0-6
  par22a: boolean // Versorgung nach § 22a SGB V
  werktage: 5 | 6
}

// ---------------------------------------------------------------------------
// Fall (ehemals Plan)
// ---------------------------------------------------------------------------

export interface ParFall {
  nummer: string
  datum: string
  patient: Patient
  antrag: Antragskopf
  anamnese: Anamnese
  diagnose: Diagnose
  befunde: Befund[] // initial + BEV + UPT-g-Befunde (fuer TT-Verlauf)
  termine: Termin[]
  planung: Planung
  modus: AbrechnungsModus
  zielGesamt: number // globaler Regler (EUR), 0 = aus
  mitCPT: boolean // chirurgisches Vorgehen (CPT) vorgesehen
  uebernahmefall: boolean // PAR-Fall von anderer Praxis uebernommen
  kkEntscheidung: KkEntscheidung
  gutachten: Gutachten
  zusatz: Zusatzformulare
  bemerkung: string
}

/** Angaben fuer die Zusatzformulare (Zusatzseite, 5d, 5e, MIT 8). */
export interface Zusatzformulare {
  // Zusatzseite – Krankenkassen-/Zahnarztwechsel
  wechselText: string
  wechselAntragsnummerVorher: string
  wechselIkVorher: string
  vorherLeistungen: Record<'4' | 'ATG' | 'MHU' | 'AITa' | 'AITb' | 'BEVa', number>
  vorherLetzteUpt: number
  // 5d – Verlaengerung der UPT
  verlaengerungUeber6: boolean
  verlaengerungMonateGesamt: number
  verlaengerungBegruendung: string
  // 5e – § 22a SGB V
  par22aMundhygiene: boolean
  par22aKooperation: boolean
  par22aNarkoseGeschlossen: boolean
  par22aNarkoseOffen: boolean
  // MIT 8 – Mitteilung CPT
  mitteilungsnummer: string
  cptUeberweisung: boolean
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

export interface Einstellungen {
  praxis: Praxis
  kzvNr: string // feste Zuordnung (ueberschreibt PLZ-Ableitung); '' = aus PLZ
  bemaPunktwertOverride: number | null // manueller Punktwert (EUR), null = aus Tabelle
  /** Punktwert BEMA Teil 1 (Anaesthesie, Roentgen); null = wie PAR-Punktwert */
  kchPunktwertOverride: number | null
  gozFaktor: number // Standardfaktor GOZ/GOAE (2,3)
  roentgenFaktor: number // Standardfaktor GOAE Abschnitt O (1,8)
  /** Punktzahlen der Analog-Positionen (§ 6 GOZ) – Praxis-Analogliste */
  analogPunkte: Record<string, number>
  naechsteNummer: number
}

// ---------------------------------------------------------------------------
// Rechen-Ergebnisse
// ---------------------------------------------------------------------------

export interface DiagnoseErgebnis {
  stadium: 1 | 2 | 3 | 4
  stadiumText: string
  ausmass: 'lokalisiert' | 'generalisiert' | 'molaren-inzisiven'
  grad: 'A' | 'B' | 'C'
  gradBasis: string
  kaIndex: number // KA%/Alter
  befalleneZaehne: number
  gesamtZaehne: number
  anteilProzent: number
  hinweise: string[]
}


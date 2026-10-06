// Datentypen des Kassen-PAR-Planers (Parodontitis-Behandlungsplan nach PAR-Richtlinie)

/** Zahnstatus im PAR-Status Blatt 2. */
export type ZahnStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6
// 0 = vorhanden/erhaltungswürdig, 1 = fehlend, 2 = nicht erhaltungswürdig,
// 3 = Krone, 4 = Brückenpfeiler, 5 = Ersatz (Brückenglied), 6 = Implantat

export type Grad0123 = 0 | 1 | 2 | 3

/** Befund eines einzelnen Zahns (6 Messstellen). */
export interface ZahnBefund {
  zs: ZahnStatus
  st: (number | null)[] // 6 Sondierungstiefen in mm: [mb,b,db,mo,o,do]
  bop: boolean[] // 6 Blutungsflags (Sondierungsblutung)
  lockerung: Grad0123
  fb: Grad0123 // Furkationsbefall
  aitOverride: boolean | null // AIT-Zeile: null = automatisch (ST>=4mm), sonst manueller Wert
}

export type BefundPhase = 'initial' | 'beva' | 'bevb'

export interface Befund {
  datum: string
  zaehne: Record<string, ZahnBefund>
}

export type RaucherStatus = 'nein' | 'unter10' | 'ab10'
export type DiabetesStatus = 'nein' | 'hba1c_unter7' | 'hba1c_ab7'

/** Diagnose-Eingaben für Staging/Grading. */
export interface Diagnose {
  alter: number
  knochenabbauProzent: number // max. röntgenologischer Knochenabbau in % (Wurzellänge)
  knochenabbauZahn: string
  calMax: number // max. interdentaler klinischer Attachmentverlust (mm)
  zahnverlustPar: number // Anzahl wegen Parodontitis verlorener Zähne
  raucher: RaucherStatus
  diabetes: DiabetesStatus
  // Komplexitätsfaktoren (heben das Stadium)
  st6plus: boolean // ST >= 6 mm vorhanden
  vertikalerKA3: boolean // vertikaler Knochenabbau >= 3 mm
  furkationII_III: boolean // Furkationsbefall Grad II/III
  komplexeReha: boolean // < 20 Restzähne / Kaufunktionsverlust / Rehabilitation
  // Klassifikation (Netz): Manifestation / sonstige
  diagnoseTyp: 'parodontitis' | 'systemisch' | 'sonstige'
}

export interface Patient {
  name: string
  geburtsdatum: string
  kasse: string
  versichertennr: string
  kostentraegerkennung: string
}

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

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  diagnose: Diagnose
  befunde: {
    initial: Befund
    beva?: Befund
    bevb?: Befund
  }
  mitCPT: boolean // chirurgisches Vorgehen vorgesehen
  neben: {
    n108: number // Einschleifen (108), Anzahl Sitzungen
    n111: number // PAR-Nachbehandlung (111), Anzahl Sitzungen
  }
  bemerkung: string
}

export interface Einstellungen {
  praxis: Praxis
  bemaPunktwert: number // regionaler KZV-Punktwert (€)
  naechsteNummer: number
}

/** Ergebnis der Diagnose-Logik. */
export interface DiagnoseErgebnis {
  stadium: 1 | 2 | 3 | 4
  stadiumText: string
  ausmass: 'lokalisiert' | 'generalisiert' | 'molaren-inzisiven'
  grad: 'A' | 'B' | 'C'
  gradBasis: string // Begründung (KA%/Alter, Raucher, Diabetes)
  kaIndex: number // KA%/Alter
  befalleneZaehne: number
  gesamtZaehne: number
  anteilProzent: number
  hinweise: string[]
}

/** Eine geplante/abrechenbare BEMA-Position. */
export interface StreckePosition {
  nr: string // BEMA-Kürzel/Nummer
  titel: string
  anzahl: number
  punkteEinzel: number
  punkteGesamt: number
  phase: string // Abschnitt der Strecke
  detail?: string
}

/** UPT-Terminplan über zwei Jahre. */
export interface UptTermin {
  index: number
  label: string
  monatAbStart: number // frühestmöglich (Monate ab erster UPT)
  leistungen: string[] // BEMA-UPT-Kürzel in dieser Sitzung
}

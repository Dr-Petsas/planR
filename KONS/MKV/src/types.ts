// Datentypen des Füllungs-MKV-Planers (Mehrkostenvereinbarung nach § 28 Abs. 2 SGB V).
// Nur Füllungen sind mehrkostenfähig: Komposit in Adhäsivtechnik im Seitenzahn-
// bereich, Mehrfarbentechnik, Einlagefüllungen (Inlays) und Goldhämmerfüllungen.
// Die Kasse trägt die vergleichbare preisgünstigste plastische Füllung (BEMA 13a-d),
// der Patient die Differenz zum GOZ-Honorar.

export type Therapie = 'komposit' | 'mehrfarben' | 'inlay' | 'goldhaemmer'

/** Wie die Praxis die Mehrkosten plastischer Füllungen festlegt. */
export type MkvModell = 'gozDifferenz' | 'proZahn' | 'proFlaeche'

export type Kassenart = 'primaer' | 'ersatz'

export type Ebene = 'GOZ' | 'ANALOG' | 'LABOR' | 'BEMA'

export type Region = 'OK-R' | 'OK-F' | 'OK-L' | 'UK-R' | 'UK-F' | 'UK-L'

export interface ListenEintrag {
  nr: string
  text: string
  punkte: number
}

export interface ZahnLeistung {
  therapie: Therapie
  flaechen: number // 1..5
  labor?: string // Laborleistung (Inlay)
  kofferdam?: boolean
  anaesthesie?: boolean // bei Einlagefüllungen privat (BEMA-Abrechnungsbestimmung Nr. 2 zu 13)
  austausch?: boolean // Austausch einer intakten Füllung: keine Mehrkostenregelung (§ 28 Abs. 2 S. 5 SGB V)
  faktor?: number // eigener Faktor für diesen Zahn (nur GOZ-Differenz)
}

export interface Regler {
  modell: MkvModell
  proZahn: number // € Mehrkosten je Füllung
  proFlaeche: number // € Mehrkosten je Fläche
  faktor: number // GOZ-Faktor plastischer Füllungen (Modell GOZ-Differenz) und Begleitleistungen
  inlayFaktor: number // GOZ-Faktor Einlage-/Goldhämmerfüllungen
  laborKlasse: number // 0 günstig · 1 Standard · 2 hochwertig
}

export interface Patient {
  name: string
  geburtsdatum: string
  kasse: string
  kassennummer: string
  versichertennr: string
  kassenart: Kassenart
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  zaehne: Record<string, ZahnLeistung>
  regler: Regler
  bemerkung: string
}

export interface Praxis {
  name: string
  zahnarzt: string
  strasse: string
  plz: string
  ort: string
  telefon: string
  email: string
}

export interface LaborPreis {
  id: string
  name: string
  preis: number
}

export interface Einstellungen {
  praxis: Praxis
  modell: MkvModell
  proZahn: number
  proFlaeche: number
  faktor: number
  inlayFaktor: number
  gueltigMonate: number
  naechsteNummer: number
  kzvNr: string // fest gesetzt, sonst aus der Praxis-PLZ
  punktwertOverride: number | null
  laborPreise: LaborPreis[]
}

/** Eine gerechnete Zeile im Plan. */
export interface Zeile {
  zahn?: string
  ebene: Ebene
  nr: string
  text: string
  anzahl: number
  faktor?: number
  einzel: number
  summe: number
}

export interface ZahnErgebnis {
  zahn: string
  titel: string
  therapie: Therapie
  flaechen: number
  zeilen: Zeile[] // privat (GOZ, analog, Labor)
  kasse: Zeile | null // BEMA-Gegenrechnung
  privat: number
  kassenanteil: number
  mehrkosten: number
  faktor: number // Faktor der Hauptleistung
  ziel?: number // Zielbetrag bei Modell pro Zahn / pro Fläche
  hinweise: string[]
  warnungen: string[]
}

export interface Rechnung {
  zaehne: ZahnErgebnis[]
  begleit: Zeile[] // Kofferdam je Kieferhälfte / Frontzahnbereich
  privat: number
  kassenanteil: number
  mehrkosten: number
  punktwert: number
  punktwertHinweis: string
  vereinbarung2: Zeile[] // Positionen über dem 3,5-fachen Satz (§ 2 Abs. 1 und 2 GOZ)
  hinweise: string[]
}

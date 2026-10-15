// Datentypen des Füllungs-MKV-Planers (Mehrkostenvereinbarung nach § 28 Abs. 2 SGB V).
// Nur Füllungen sind mehrkostenfähig: Komposit in Adhäsivtechnik im Seitenzahn-
// bereich, Mehrfarbentechnik, Einlagefüllungen (Inlays) und Goldhämmerfüllungen.
// Die Kasse trägt die vergleichbare preisgünstigste plastische Füllung (BEMA 13a-d),
// der Patient die Differenz zum GOZ-Honorar.

export type Therapie = 'komposit' | 'mehrfarben' | 'inlay' | 'goldhaemmer' | 'aufbau'

/** Wie die Praxis die Mehrkosten plastischer Füllungen festlegt. */
export type MkvModell = 'gozDifferenz' | 'proZahn' | 'proFlaeche'

import type { Patient, Praxis } from './stammdaten'
import type { Leistungsbereich } from './punktwerte'
import type { EigenPosition } from './engine/eigenlabor'
import type { Abformung } from './engine/inlaylabor'

export type { Kassenart, Patient, Praxis } from './stammdaten'

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
  /** besondere Maßnahmen beim Präparieren/Füllen (GOZ 2030), nur wegen des Mehraufwands der Mehrkostenfüllung */
  bmf?: boolean
  anaesthesie?: boolean // bei Einlagefüllungen privat (BEMA-Abrechnungsbestimmung Nr. 2 zu 13)
  /** Provisorium beim Inlay/Goldhämmer (GOZ 2260) */
  provisorium?: boolean
  /** Glasfaserstift beim Aufbau (GOZ 2195): keine MKV, Privatvereinbarung nach § 8 Abs. 7 BMV-Z */
  stift?: boolean
  /** Aufbau als mehrschichtiger dentinadhäsiver Kompositaufbau, analog 2120 statt 2180 */
  mehrschicht?: boolean
  austausch?: boolean // Austausch einer intakten Füllung: keine Mehrkostenregelung (§ 28 Abs. 2 S. 5 SGB V)
  faktor?: number // eigener Faktor für diesen Zahn (nur GOZ-Differenz)
}

/** Leistungen außerhalb der Mehrkostenregelung, privat vereinbart nach § 8 Abs. 7 BMV-Z */
export interface PrivatWunsch {
  /** Oberflächenanästhesie (GOZ 0080) je Kieferhälfte/Frontzahnbereich mit Füllung */
  oberflaeche?: boolean
  /** lokale Fluoridierung (GOZ 1020), je Sitzung */
  fluorid?: boolean
  /** adhäsive Befestigung (GOZ 2197) neben Kompositfüllungen – strittig, nur ausdrücklich vereinbart */
  adhaesivKomposit?: boolean
}

export interface Regler {
  modell: MkvModell
  proZahn: number // € Mehrkosten je Füllung
  proFlaeche: number // € Mehrkosten je Fläche
  faktor: number // GOZ-Faktor plastischer Füllungen (Modell GOZ-Differenz) und Begleitleistungen
  inlayFaktor: number // GOZ-Faktor Einlage-/Goldhämmerfüllungen
  laborKlasse: number // 0 günstig · 1 Standard · 2 hochwertig
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  zaehne: Record<string, ZahnLeistung>
  regler: Regler
  bemerkung: string
  privat?: PrivatWunsch
  /** Inlays: Abdruck mit Gipsmodellen oder Intraoralscan mit digitalem Laborablauf */
  abformung?: Abformung
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
  /** Fest eingetragene Punktwerte (leer = Tabelle der KZV der Praxis) */
  punktwertFest: Partial<Record<Leistungsbereich, number | null>>
  laborPreise: LaborPreis[]
  /** Glasfaserstift als Material (Privatvereinbarung neben GOZ 2195) */
  stiftPreis: number
  /** praxiseigene Laborpositionen aus dem PVS (BEB) – Inlay-Labor einzeln statt Pauschale */
  eigenlabor?: EigenPosition[]
  praxiskatalog?: { pvs: string; stand: string; anzahl: number }
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
  /** Leistungen dieses Zahns außerhalb der MKV (§ 8 Abs. 7 BMV-Z), z. B. Glasfaserstift */
  privat7: Zeile[]
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
  /** Privatvereinbarung nach § 8 Abs. 7 BMV-Z (nicht Teil der Mehrkosten) */
  privat7: Zeile[]
  privat7Summe: number
}

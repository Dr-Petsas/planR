// Datentypen des Privat-Kons-Planers: konservierende Leistungen rein nach GOZ,
// ohne Kassenanteil. Füllungs-Mehrkosten für Kassenpatienten rechnet der eigene
// Füllungs-MKV-Planer (KONS/MKV).

import type { Patient, Praxis } from './stammdaten'
export type { Patient, Praxis } from './stammdaten'

export type Therapie =
  | 'komposit' | 'inlay' | 'goldhaemmer'
  | 'endo' | 'revision' | 'vital'
  | 'versiegelung' | 'aufbau' | 'infiltration' | 'veneer' | 'bleaching'

/**
 * pkv: Privatpatient (Kostenvoranschlag).
 * gkvPrivat: Kassenpatient, Behandlung komplett privat (§ 8 Abs. 7 BMV-Z).
 * gkvZusatz: Kassenpatient, BEMA-Grundleistung bleibt bei der Kasse, privat nur
 *   die eigenständigen Zusatzleistungen (§ 8 Abs. 7 BMV-Z).
 */
export type Vereinbarungsart = 'pkv' | 'gkvPrivat' | 'gkvZusatz'

export type Ebene = 'GOZ' | 'ANALOG' | 'GOAE' | 'MAT' | 'LABOR' | 'ZUSCHLAG'

export type Region = 'OK-R' | 'OK-F' | 'OK-L' | 'UK-R' | 'UK-F' | 'UK-L'

export type VitalArt = 'indirekt' | 'direkt' | 'pulpotomie'

export interface ListenEintrag {
  nr: string
  text: string
  punkte: number
}

export interface ZahnLeistung {
  therapie: Therapie
  flaechen?: number // Füllung, Inlay, Veneer
  kanaele?: number // Endo, Revision
  sitzungen?: number // Endo, Revision, Bleaching
  vital?: boolean // Endo: vitale Pulpa (2360) oder avital
  vitalArt?: VitalArt
  labor?: string // Inlay
  aufbauStift?: boolean // Aufbau mit Glasfaserstift (2195) statt plastisch (2180)
  zusatz?: string[] // ausdrücklich gewählte Zusatzleistungen
  abgewaehlt?: string[] // automatisch vorgeschlagene, aber abgewählte Zusatzleistungen
  faktor?: number
}

export interface Regler {
  faktor: number // GOZ-Faktor aller Leistungen (je Zahn übersteuerbar)
  stufe: number // 0 nur Grundleistung · 1 Standard · 2 erweitert · 3 mit Analog/Exoten
  materialKlasse: number // 0 günstig · 1 Standard · 2 hochwertig (Labor und Material)
}

export interface FreiePosition {
  key: string
  nr: string
  zahn?: string
  anzahl: number
  faktor: number
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  vereinbarung: Vereinbarungsart
  behandlungstage: number // für die Zuschläge 0110/0120 (je Behandlungstag)
  zaehne: Record<string, ZahnLeistung>
  frei: FreiePosition[]
  regler: Regler
  bemerkung: string
}

export interface Preis {
  id: string
  name: string
  preis: number
}

export interface Einstellungen {
  praxis: Praxis
  faktor: number
  stufe: number
  gueltigMonate: number
  naechsteNummer: number
  laborPreise: Preis[]
  materialPreise: Preis[]
}

export interface Zeile {
  zahn?: string
  ebene: Ebene
  nr: string
  text: string
  anzahl: number
  faktor?: number
  einzel: number
  summe: number
  zusatz?: string // Kennung der Zusatzleistung
  hinweis?: string
}

export interface ZahnErgebnis {
  zahn: string
  titel: string
  zeilen: Zeile[]
  summe: number
  hinweise: string[]
  warnungen: string[]
  ausgeschlossen?: string // Grund, wenn die Grundleistung nicht in diesen Plan gehört
}

export interface Rechnung {
  zaehne: ZahnErgebnis[]
  begleit: Zeile[] // je Kieferhälfte, je Kiefer, je Sitzung, je Behandlungstag
  frei: Zeile[]
  summe: number
  vereinbarung2: Zeile[]
  hinweise: string[]
}

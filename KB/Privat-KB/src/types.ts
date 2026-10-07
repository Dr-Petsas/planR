// Datentypen des Privat-KB-Planers: Kostenvoranschlag für Aufbissbehelfe, Schienen,
// Langzeitprovisorien und Funktionsdiagnostik nach GOZ (Abschnitte H und J) mit
// Laborkosten nach BEB (§ 9 GOZ).

import type { Patient, Praxis } from './stammdaten'

export type { Patient, Praxis } from './stammdaten'

export type Ebene = 'GOZ' | 'LABOR' | 'MATERIAL'

export interface Position {
  id: string
  ebene: Ebene
  nr: string
  anzahl: number
  /** eigener Faktor (GOZ); leer = Regler */
  faktor?: number
  /** eigener Preis (Labor/Material); leer = Laborpreisliste */
  preis?: number
  /** freier Text (Material oder abweichende Bezeichnung) */
  text?: string
}

export interface Regler {
  /** GOZ-Faktor Aufbissbehelfe, Schienen, Provisorien */
  faktor: number
  /** GOZ-Faktor Funktionsanalyse (Abschnitt J) */
  faFaktor: number
  /** 0 günstig · 1 Standard · 2 hochwertig */
  laborKlasse: number
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  /** Befund / Diagnose (erscheint im Kostenvoranschlag) */
  diagnose: string
  positionen: Position[]
  regler: Regler
  bemerkung: string
}

export interface Einstellungen {
  praxis: Praxis
  faktor: number
  faFaktor: number
  gueltigMonate: number
  naechsteNummer: number
  /** Name des Labors im Kostenvoranschlag */
  laborName: string
  /** Praxis-Laborpreise je BEB-Nummer (überschreiben die Laborpreisliste) */
  laborPreise: Record<string, number>
}

export interface Zeile {
  id: string
  ebene: Ebene
  nr: string
  text: string
  anzahl: number
  faktor?: number
  einzel: number
  summe: number
  /** Preis fehlt (Labor ohne Listen- und Praxispreis) */
  ohnePreis?: boolean
}

export interface Rechnung {
  honorar: Zeile[]
  labor: Zeile[]
  summeHonorar: number
  summeLabor: number
  gesamt: number
  /** Positionen über dem 3,5-fachen Satz (§ 2 Abs. 1 und 2 GOZ) */
  vereinbarung2: Zeile[]
  /** Positionen über 2,3 (Begründung nach § 10 Abs. 3 GOZ) */
  begruendung: Zeile[]
  hinweise: string[]
  warnungen: string[]
}

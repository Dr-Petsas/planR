// Datentypen des Privat-KB-Planers: Kostenvoranschlag für Aufbissbehelfe, Schienen,
// Langzeitprovisorien und Funktionsdiagnostik nach GOZ (Abschnitte H und J) mit
// Laborkosten nach BEB (§ 9 GOZ).

import type { Patient, Praxis } from './stammdaten'
import type { LaborImport } from './laborxml'

export type { Patient, Praxis } from './stammdaten'

export type Ebene = 'GOZ' | 'LABOR' | 'MATERIAL'
export type Abformung = 'abdruck' | 'scan'

export interface Fremdlabor {
  name: string
  import?: LaborImport
}

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
  /** Analogleistung nach § 6 Abs. 1 GOZ: `nr` ist die Bemessungsleistung, `text` die erbrachte Leistung */
  analog?: boolean
  /** aus dem Labor-XML übernommen */
  ausXml?: boolean
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
  abformung: Abformung
  fremdlabor: Fremdlabor
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
  /** Bemessungsleistung der UKPS-Anfertigung (analog § 6 Abs. 1 GOZ) */
  ukpsAnalog: string
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
  /** Analogleistung: `nr` endet auf „a“, `bemessung` ist die GOZ-Nummer, nach der bemessen wird */
  bemessung?: string
  /** Platzhalterpreis für Fremdlabor – durch Kostenvoranschlag ersetzen */
  platzhalter?: boolean
  ausXml?: boolean
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

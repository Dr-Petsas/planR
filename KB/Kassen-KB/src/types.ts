// Datentypen des Kassen-KB-Planers: Behandlungsplan für Kiefergelenkserkrankungen und
// Kieferbruch (eFormular 2, BMV-Z Anlage 14c) mit BEMA Teil 2, Kieferbruch nach GOÄ
// und Laborkosten nach BEL II der KZV der Praxis.

import type { Patient, Praxis } from './stammdaten'
import type { Leistungsbereich } from './punktwerte'

export type { Kassenart, Patient, Praxis } from './stammdaten'

export type Art = 'kiefergelenk' | 'kieferbruch'
export type Labor = 'praxis' | 'gewerbe'
export type Ebene = 'BEMA' | 'BEL' | 'MATERIAL'

export interface Position {
  id: string
  ebene: Ebene
  nr: string
  anzahl: number
  /** eigener Preis (BEL/Material); leer = BEL-II-Liste bzw. Pauschale */
  preis?: number
  text?: string
}

export interface Angaben {
  art: Art
  unfall: boolean
  /** Ort, Zeit und Ursache sowie Art der Verletzung (nur Kieferbruch) */
  verletzung: string
  /** Anamnese, Befunde, Diagnose (nur Kiefergelenkserkrankung) */
  befund: string
  /** Vorgesehene Behandlung */
  behandlung: string
  stationaer: boolean
  krankenhaus: string
  von: string
  bis: string
  /** UKPS: Veranlassung durch Vertragsarzt mit Zusatzbezeichnung Schlafmedizin liegt vor */
  schlafmedizin: boolean
  /** Landesvertrag: Kasse verzichtet auf die Genehmigung von K1–K4 */
  genehmigungsverzicht: boolean
  antragsnummer: string
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  angaben: Angaben
  positionen: Position[]
  labor: Labor
  bemerkung: string
}

export interface Einstellungen {
  praxis: Praxis
  labor: Labor
  /** Kieferbruch-Leistungen (GOÄ) mit dem KCH-Punktwert statt KB (regionale Vorgabe) */
  kieferbruchKch: boolean
  /** Pauschale je Abformung (Ordnungsnummer 605) */
  abformPauschale: number
  naechsteNummer: number
  punktwertFest: Partial<Record<Leistungsbereich, number | null>>
}

export interface Zeile {
  id: string
  ebene: Ebene
  nr: string
  text: string
  anzahl: number
  punkte?: number
  punktwert?: number
  einzel: number
  summe: number
  ohnePreis?: boolean
}

export interface Rechnung {
  honorar: Zeile[]
  labor: Zeile[]
  material: Zeile[]
  summeHonorar: number
  summeLabor: number
  summeMaterial: number
  gesamt: number
  punktwertKb: number
  punktwertKch: number
  punktwertHinweis: string
  belListe: string
  /** K1–K4 im Plan einer Kiefergelenkserkrankung: Genehmigung der Kasse nötig */
  genehmigungspflichtig: boolean
  hinweise: string[]
  warnungen: string[]
}

// Datentypen des Privat-KFO-Planers: Heil- und Kostenplan für kieferorthopädische
// Behandlung nach GOZ Abschnitt G mit Diagnostik (GOZ/GOÄ), Material- und Laborkosten
// (§ 9 GOZ) und Mehrkosten für Material über dem Standard (Allg. Bestimmung Abschnitt G).

import type { Patient, Praxis } from './stammdaten'

export type { Patient, Praxis } from './stammdaten'

/** GOZ (auch analog: Nr. "6100a"), GOÄ, Labor, Material, Material-Mehrkosten */
export type Ebene = 'GOZ' | 'GOAE' | 'LABOR' | 'MATERIAL' | 'MEHR'

export interface Position {
  id: string
  ebene: Ebene
  nr: string
  anzahl: number
  /** eigener Faktor (GOZ/GOÄ); leer = Regler */
  faktor?: number
  /** eigener Preis (Labor/Material) bzw. Preis des höherwertigen Materials (MEHR) */
  preis?: number
  /** MEHR: Kosten des Standardmaterials je Stück, das abgezogen wird */
  abzug?: number
  /** freier Text (Material, Analogleistung) */
  text?: string
}

/** Kriterien a–e für den Umfang der Kieferumformung (GOZ 6030–6050) */
export type KriteriumUmformung = 'a' | 'b' | 'c' | 'd' | 'e'
/** Kriterien a–c für den Umfang der Einstellung in den Regelbiss (GOZ 6060–6080) */
export type KriteriumRegelbiss = 'a' | 'b' | 'c'

/** Behandlungsaufgabe: die Komplexleistungen des Falls (bis zu vier Jahre) */
export interface Aufgabe {
  umformungOk: boolean
  kriterienOk: KriteriumUmformung[]
  umformungUk: boolean
  kriterienUk: KriteriumUmformung[]
  regelbiss: boolean
  kriterienRegelbiss: KriteriumRegelbiss[]
  /** GOZ 6090 je Kiefer – nur bei abgeschlossener Wachstumsphase */
  alveolaerOk: boolean
  alveolaerUk: boolean
}

export interface Regler {
  /** GOZ-Faktor Abschnitt G */
  kfoFaktor: number
  /** GOZ-Faktor übrige Leistungen und GOÄ außerhalb Abschnitt O */
  faktor: number
  /** GOÄ-Faktor Röntgen (Abschnitt O, höchstens 2,5) */
  roeFaktor: number
  /** 0 günstig · 1 Standard · 2 hochwertig */
  laborKlasse: number
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  /** Befund / Diagnose */
  diagnose: string
  /** Behandlungsziel und vorgesehene Behandlungsmittel */
  therapie: string
  aufgabe: Aufgabe
  /** geplante Behandlungsdauer für die Abschlagszahlungen */
  quartale: number
  /** digitale Radiographie: Zuschlag GOÄ 5298 */
  digitalRoentgen: boolean
  positionen: Position[]
  regler: Regler
  bemerkung: string
}

export interface MehrPreis { preis: number; standard: number }

export interface Einstellungen {
  praxis: Praxis
  kfoFaktor: number
  faktor: number
  roeFaktor: number
  quartale: number
  digitalRoentgen: boolean
  gueltigMonate: number
  naechsteNummer: number
  /** Name des Labors im Heil- und Kostenplan */
  laborName: string
  /** Praxis-Laborpreise je Labornummer (überschreiben die Laborpreisliste) */
  laborPreise: Record<string, number>
  /** Praxispreise für höherwertiges Material und das abzuziehende Standardmaterial */
  mehrPreise: Record<string, MehrPreis>
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
  /** Preis fehlt (Labor/Material ohne Preis, Analog ohne Bezug) */
  ohnePreis?: boolean
  /** "entsprechend GOZ …" bei Analogleistungen (§ 10 Abs. 4 GOZ) */
  analog?: string
  /** aus der Behandlungsaufgabe bzw. als Zuschlag automatisch gebildet */
  auto?: boolean
  /** MEHR: Preis des höherwertigen Materials und des Standardmaterials je Stück */
  preisMehr?: number
  preisStandard?: number
  /** Schwelle und Höchstsatz der Position */
  schwelle?: number
  hoechst?: number
}

export interface Rechnung {
  /** Komplexleistungen 6030–6090 aus der Behandlungsaufgabe */
  aufgabe: Zeile[]
  /** übrige Honorarpositionen (GOZ, analog, GOÄ, Zuschläge) */
  honorar: Zeile[]
  labor: Zeile[]
  mehr: Zeile[]
  summeAufgabe: number
  summeHonorar: number
  summeLabor: number
  summeMehr: number
  gesamt: number
  /** Abschlag je Quartal auf die Behandlungsaufgabe */
  abschlag: number
  /** Positionen über dem Höchstsatz 3,5 (Vereinbarung nach § 2 Abs. 1 und 2 GOZ) */
  vereinbarung2: Zeile[]
  /** Positionen über der Schwelle (Begründung nach § 10 Abs. 3 GOZ / § 12 Abs. 3 GOÄ) */
  begruendung: Zeile[]
  hinweise: string[]
  warnungen: string[]
}

// Datentypen des Kassen-KFO-Planers: kieferorthopädischer Behandlungsplan (eFormular 4,
// BMV-Z Anlage 14c/14d) mit BEMA Teil 3, Laborkosten nach BEL II der KZV der Praxis,
// Eigenanteil nach § 29 SGB V und Mehr-/Zusatzleistungen nach Vordruck 4d (Anlage B BMV-Z).

import type { Patient, Praxis } from './stammdaten'
import type { Leistungsbereich } from './punktwerte'

export type { Kassenart, Patient, Praxis } from './stammdaten'

export type Labor = 'praxis' | 'gewerbe'
/** BEMA = Kassenleistung, BEL = Labor, MATERIAL = Praxismaterial, PRIVAT = Mehr-/Zusatz-/andere Leistung (Vordruck 4d) */
export type Ebene = 'BEMA' | 'BEL' | 'MATERIAL' | 'PRIVAT'
/** M = Mehrleistung, Z = Zusatzleistung, A = andere Leistung (Muster Vordruck 4d) */
export type PrivatArt = 'M' | 'Z' | 'A'

export type PlanArt = 'plan' | 'aenderung' | 'verlaengerung'
/** Regelbehandlung, Frühbehandlung (Richtlinie B8 c), frühe Behandlung (B8 d), kombiniert kieferchirurgisch (Erwachsene, B4) */
export type BehandlungsArt = 'regel' | 'frueh' | 'fruehe' | 'kombi'
export type KigGruppe = 'A' | 'U' | 'S' | 'D' | 'M' | 'O' | 'T' | 'B' | 'K' | 'E' | 'P'

export interface Position {
  id: string
  ebene: Ebene
  nr: string
  anzahl: number
  /** eigener Preis (BEL/Material/freie Privatleistung); leer = Liste */
  preis?: number
  text?: string
  /** Privatleistung: Steigerungsfaktor GOZ */
  faktor?: number
  art?: PrivatArt
  /** Mehrleistung: vergleichbare BEMA-Leistung, die die Kasse trägt */
  vergleich?: string
  vergleichAnzahl?: number
  /** private Material- und Laborkosten je Einheit */
  material?: number
}

/** Gewählte Stufe je Kriterium (0 = linke, 1 = mittlere, 2 = rechte Spalte des BEMA-Rasters) */
export type Stufen = (0 | 1 | 2 | null)[]

export interface Einstufung {
  okAktiv: boolean
  ok: Stufen
  ukAktiv: boolean
  uk: Stufen
  bissAktiv: boolean
  biss: Stufen
}

export interface Angaben {
  planArt: PlanArt
  behandlungsArt: BehandlungsArt
  kigGruppe: KigGruppe | ''
  kigGrad: number
  /** gesondertes Feld E3/E4 in der UK-Front (UK-Frontzahnretainer als Kassenleistung) */
  e34Uk: boolean
  unfall: boolean
  /** Eigenanteil 10 %: zweites oder weiteres Kind gleichzeitig in Behandlung (§ 29 Abs. 2 SGB V) */
  geschwister: boolean
  anamnese: string
  diagnoseOk: string
  diagnoseUk: string
  diagnoseBiss: string
  therapieOk: string
  therapieUk: string
  therapieBiss: string
  geraete: string
  /** voraussichtliche Behandlungsdauer in Quartalen einschließlich Retention */
  quartale: number
  antragsnummer: string
  /** Therapieänderung/Verlängerung: Nummer des ursprünglichen Antrags */
  bezugsantrag: string
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  angaben: Angaben
  einstufung: Einstufung
  positionen: Position[]
  labor: Labor
  bemerkung: string
}

export interface Einstellungen {
  praxis: Praxis
  labor: Labor
  naechsteNummer: number
  punktwertFest: Partial<Record<Leistungsbereich, number | null>>
  /** Faktor für Privatleistungen nach GOZ (Vordruck 4d) */
  gozFaktor: number
  /** Röntgen zur KFO mit dem KFO- statt dem KCH-Punktwert (Vorgabe der KZV) */
  roentgenKfo: boolean
  /** BEMA 121–124 ohne Eigenanteil (Vorgabe KZV Bayerns) */
  ohneEigenanteil121: boolean
  /** private Material- und Laborkosten je Einheit für die Mehr-/Zusatzleistungen des Katalogs */
  materialPreise: Record<string, number>
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
  /** gehört nicht zur Bemessung des Eigenanteils (§ 29 Abs. 2 Satz 2 SGB V bzw. Einstellung) */
  ohneEigenanteil?: boolean
  /** automatisch aus der Einstufung (119/120) */
  auto?: boolean
}

export interface PrivatZeile {
  id: string
  art: PrivatArt
  nr: string
  text: string
  faktor?: number
  anzahl: number
  /** Betrag nach GOZ (bzw. freier Preis) */
  betrag: number
  vergleich?: string
  vergleichText?: string
  vergleichAnzahl: number
  /** von der Kasse zu tragender Kostenanteil nach BEMA */
  bema: number
  /** Kostenanteil der/des Versicherten */
  anteil: number
  material: number
  ohnePreis?: boolean
}

export interface EinstufungErgebnis {
  bereich: 'ok' | 'uk' | 'biss'
  punkte: number
  vollstaendig: boolean
  /** a–d oder '' */
  stufe: string
  nr: string
}

export interface Rechnung {
  einstufung: EinstufungErgebnis[]
  /** Anzahl der Abschlagszahlungen je 119/120 (12, Frühbehandlung 6) */
  abschlaege: number
  honorar: Zeile[]
  labor: Zeile[]
  material: Zeile[]
  privat: PrivatZeile[]
  summeHonorar: number
  summeLabor: number
  summeMaterial: number
  /** voraussichtliche Gesamtkosten des Kassenplans */
  gesamt: number
  eigenanteilSatz: number
  eigenanteilBasis: number
  eigenanteil: number
  kassenanteil: number
  summePrivat: number
  summePrivatBema: number
  summePrivatAnteil: number
  summePrivatMaterial: number
  privatGesamt: number
  punktwertKfo: number
  punktwertKch: number
  punktwertHinweis: string
  belListe: string
  alter: number | null
  kassenleistung: boolean
  hinweise: string[]
  warnungen: string[]
}

// Datentypen des Privat-PAR-Planers: systematische Parodontitistherapie nach GOZ mit
// den Analogleistungen der BZÄK (Neubewertung 2026) bzw. des Beratungsforums
// (PAR/_quellen/privat-par.json).

import type { Patient, Praxis } from './stammdaten'

export type { Kassenart, Patient, Praxis } from './stammdaten'

/** 'aktuell' = BZÄK-Neubewertung 2026, 'beratungsforum' = Beschlüsse mit PKV/Beihilfe */
export type Variante = 'aktuell' | 'beratungsforum'
export type Grad = 'A' | 'B' | 'C'
export type Stadium = 'I' | 'II' | 'III' | 'IV'
export type Phase = 'diagnostik' | 'atg' | 'ait' | 'bev' | 'cpt' | 'upt' | 'zusatz'

export interface Optionen {
  /** GOZ 0030 schriftlicher Heil- und Kostenplan */
  hkp: boolean
  /** GOZ 1040 neben der subgingivalen Instrumentierung (AIT) */
  pzrAit: boolean
  /** Befundevaluation nach CPT */
  bevCpt: boolean
}

export interface Zusatz {
  id: string
  /** GOZ-Nummer; 'Mat.' = Material/Auslage */
  nr: string
  anzahl: number
  faktor?: number
  preis?: number
  text?: string
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  /** gesetzlich versichert: Privatvereinbarung nach § 8 Abs. 7 BMV-Z nötig */
  gkv: boolean
  stadium: Stadium
  grad: Grad
  diagnose: string
  /** FDI-Nummern der fehlenden Zähne */
  fehlend: string[]
  /** FDI-Nummern mit chirurgischer Therapie (CPT) */
  cpt: string[]
  variante: Variante
  optionen: Optionen
  /** UPT-Jahre im Plan */
  uptJahre: number
  /** Anteil der Zähne mit Resttaschen in der UPT (0–100 %) */
  resttaschen: number
  /** GOZ-Faktor für Honorar und Analogleistungen (Zuschläge immer 1,0) */
  faktor: number
  /** eigener Faktor je Nummer */
  faktoren: Record<string, number>
  zusatz: Zusatz[]
  bemerkung: string
}

export interface Einstellungen {
  praxis: Praxis
  faktor: number
  variante: Variante
  gueltigMonate: number
  naechsteNummer: number
}

export interface Zeile {
  id: string
  phase: Phase
  nr: string
  text: string
  /** "entsprechend GOZ … " bei Analogleistungen (§ 10 Abs. 4 GOZ) */
  analog?: string
  anzahl: number
  faktor: number
  einzel: number
  summe: number
  /** Zuschlag: nur einfacher Satz */
  fest?: boolean
}

export interface Rechnung {
  zeilen: Zeile[]
  summen: Record<Phase, number>
  honorar: number
  material: number
  gesamt: number
  ein: number
  mehr: number
  uptSitzungen: number
  begruendung: Zeile[]
  vereinbarung2: Zeile[]
  hinweise: string[]
  warnungen: string[]
}

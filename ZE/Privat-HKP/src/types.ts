import type { EigenPosition } from './engine/eigenlabor'
import type { Werkstoff } from './engine/material'

export type Ebene = 'GOZ' | 'BEB' | 'MAT'

export interface Zahn {
  /** Befund (Status), Kürzel wie im HKP: k, kw, ww, f, x … */
  B: string
  /** Planung, Kürzel wie im HKP: K, KM, B, BM, SK, T, E … */
  TP: string
  /** Brückenanfang bzw. -ende, eingegeben als „-K“ bzw. „K-“ */
  bAnfang?: boolean
  bEnde?: boolean
}

export interface Position {
  /** stabiler Schlüssel: automatisch aus der Planung („auto:…“) oder manuell */
  id: string
  ebene: Ebene
  nr: string
  zahn: string
  anzahl: number
  /** nur GOZ */
  faktor?: number
  /** BEB/MAT: Einzelpreis (überschreibt die Liste); MAT immer */
  preis?: number
  /** Leistungstext (MAT, sonst aus der Liste) */
  text?: string
  /** Begründung nach § 10 Abs. 3 GOZ bei Faktor > 2,3 */
  begruendung?: string
  auto?: boolean
  /** von einem Regler hinzugefügt */
  zusatz?: 'goz' | 'labor'
  /** Anlass der Zusatzleistung (Tooltip) */
  grund?: string
  /** Legierung bzw. Rohling aus der Kronenmaterial-Wahl (zahntechnisch, mit MwSt.) */
  material?: boolean
}

export interface Regler {
  /** Stufe zusätzlicher GOZ-Leistungen (0 = keine) */
  gozStufe: number
  /** GOZ-Faktor für alle nicht einzeln angepassten Positionen (0 = Standardfaktor) */
  gozFaktor: number
  /** Qualitätsstufe der Laborleistungen (0 = Standard) */
  laborStufe: number
  /** Auf-/Abschlag auf die BEB-Preisliste in % */
  laborAufschlag: number
  /** abgewählte Zusatzleistungen (Schlüssel ebene|nr|zahn) */
  aus: string[]
}

/** Änderungen an automatisch erzeugten Positionen bleiben über Neuberechnungen erhalten */
export type Anpassung = Partial<Pick<Position, 'anzahl' | 'faktor' | 'preis' | 'begruendung'>>

/** '' = noch nicht festgelegt (die Abformung der Zähne wird bei jedem neuen Plan abgefragt) */
export type Abformung = 'scan' | 'abdruck' | ''

export interface ImplantatAngaben {
  /** ID aus der Implantatdatenbank (data/implantatsysteme) */
  system: string
  /** Löffel bei konventioneller Abformung */
  loeffel: 'geschlossen' | 'offen'
  abutment: 'standard' | 'individuell' | 'keramik'
}

export interface Patient {
  anrede: string
  vorname: string
  name: string
  geburtsdatum: string
  strasse: string
  plzOrt: string
  kostentraeger: string
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  zaehne: Record<string, Zahn>
  /** Abformung der präparierten Zähne bzw. Primärkronen */
  abformung: Abformung
  /** zweite Abformung für den herausnehmbaren Teil einer Kombinationsarbeit (Scan oder Überabdruck) */
  abformungProthese: Abformung
  implantat: ImplantatAngaben
  /** Kronenmaterial je Zahn; fehlt ein Eintrag, gilt der Standard (NEM bzw. Zirkon/Presskeramik) */
  werkstoffe?: Record<string, Werkstoff>
  /** manuell hinzugefügte Positionen */
  manuell: Position[]
  /** Anpassungen automatischer Positionen (Schlüssel = Positions-ID) */
  anpassungen: Record<string, Anpassung>
  /** abgewählte automatische Positionen */
  entfernt: string[]
  regler: Regler
  bemerkung: string
}

export interface Praxis {
  name: string
  zahnarzt: string
  strasse: string
  plzOrt: string
  telefon: string
  email: string
}

export interface Einstellungen {
  praxis: Praxis
  gozFaktor: number
  /** MwSt. auf zahntechnische Leistungen in % */
  mwst: number
  /** Gültigkeit des Kostenvoranschlags in Monaten */
  gueltigMonate: number
  /** Laufende Nummer für neue Kostenvoranschläge */
  naechsteNummer: number
  /** praxiseigene Laborpositionen */
  eigenlabor: EigenPosition[]
}

export interface ListenEintrag {
  nr: string
  text: string
  punkte?: number
  preis?: number
  abschnitt?: string
}

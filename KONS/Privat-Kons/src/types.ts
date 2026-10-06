// Datentypen des Kons-MKV-Planers (Mehrkostenvereinbarung konservierende Zahnheilkunde)

export type Region = 'OK-R' | 'OK-F' | 'OK-L' | 'UK-L' | 'UK-F' | 'UK-R'

/** Abrechnungsebene einer Position. */
export type Ebene = 'GOZ' | 'BEMA' | 'MAT'

/** Art der Leistung gegenüber der Kasse. */
export type LeistungsArt = 'mehrkosten' | 'verlangen'
//  mehrkosten = gleichartige Mehrleistung, Kasse zahlt Sachleistungsanteil (§ 28 Abs. 2 SGB V)
//  verlangen  = keine Kassenleistung, voll privat (§ 1 Abs. 2, § 2 Abs. 3 GOZ)

/** Füllungs-Mehrkostenmodell (Kernwunsch: pauschal ODER pro Fläche). */
export type FuellungModell = 'pauschal' | 'proFlaeche' | 'gozDifferenz'

export interface ListenEintrag {
  nr: string
  kurz?: string
  text: string
  punkte: number
}

/** Pro Zahn gewählte Kons-Leistung samt Parametern. */
export interface ZahnLeistung {
  therapie: string // Katalog-id, z.B. 'fuellung' | 'inlay' | 'endo' | 'versiegelung' | ...
  flaechen?: number // Füllung/Inlay (1..5)
  kanaele?: number // Endo (1..4)
  material?: string // Material-id
  kofferdam?: boolean
  mikroskop?: boolean
  elektrometrie?: boolean
  maschinell?: boolean // maschinelle Aufbereitung (Endo)
  revision?: boolean // Endo-Revision
  notiz?: string
}

/** Eine abrechenbare Position (GOZ-Honorar, BEMA-Kassenanteil oder Material). */
export interface Position {
  key: string
  ebene: Ebene
  nr: string
  zahn?: string
  anzahl: number
  faktor?: number // GOZ
  preis?: number // Material-Einzel / BEMA-Kassenanteil-Einzel
  text?: string
  begruendung?: string
  auto?: boolean
  gruppe: string // Gruppierungsschlüssel (ein Zahn + Therapie oder 'manuell')
}

/** Metadaten einer Leistungsgruppe (ein Zahn + Therapie). */
export interface GruppeMeta {
  key: string
  zahn?: string
  titel: string
  kategorie: string // 'fuellung' | 'inlay' | 'endo' | 'versiegelung' | 'vitalerhaltung' | 'aufbau' | 'prophylaxe' | 'manuell'
  art: LeistungsArt
  flaechen?: number
  begruendung?: string
}

/** Fertig gerechnete Position für Anzeige/Dokument. */
export interface GruppePosition {
  key: string
  ebene: Ebene
  nr: string
  text: string
  anzahl: number
  faktor?: number
  einzel: number
  summe: number
  kassen: boolean // true = BEMA-Kassenanteil
}

export interface Leistungsgruppe {
  key: string
  zahn?: string
  titel: string
  kategorie: string
  art: LeistungsArt
  positionen: GruppePosition[]
  gozSumme: number // Privatleistung (GOZ + Material)
  kassenanteil: number // BEMA-Sachleistungsanteil (von der Kasse getragen)
  mehrkosten: number // Betrag, den der Patient zahlt
  modellHinweis?: string
  begruendung?: string
}

export interface Kalkulation {
  gruppen: Leistungsgruppe[]
  gozGesamt: number
  kassenGesamt: number
  mehrkostenGesamt: number
  hinweise: string[]
}

export interface Regler {
  fuellungModell: FuellungModell
  fuellungPauschale: number // € je Füllung (pauschal)
  fuellungProFlaeche: number // € je Fläche
  gozFaktor: number
  materialKlasse: number // 0..2
}

export interface Patient {
  name: string
  geburtsdatum: string
  kasse: string
  versichertennr: string
}

export interface Praxis {
  name: string
  strasse: string
  plz: string
  ort: string
  telefon: string
  email: string
  zahnarzt: string
}

export interface Anpassung {
  key: string
  anzahl?: number
  faktor?: number
  preis?: number
  begruendung?: string
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  zaehne: Record<string, ZahnLeistung>
  regler: Regler
  anpassungen: Anpassung[]
  manuell: Position[]
  entfernt: string[]
  bemerkung: string
}

export interface MaterialPreis {
  id: string
  name: string
  preis: number
  einheit: string
}

export interface Einstellungen {
  praxis: Praxis
  gozFaktor: number
  gueltigMonate: number
  naechsteNummer: number
  stundensatz: number
  materialPreise: MaterialPreis[]
  bemaPunktwert: number
  kassenanteile: Record<string, number> // BEMA-key -> € Kassenanteil (regional editierbar)
}

// Datenmodell des Privat-Implantologie-Planers.
// Aufbau 1:1 wie der Privat-ZE-Planer (F:\PlanR\ZE\Privat-HKP), nur das Thema
// ist Implantatchirurgie statt Zahnersatz: GOZ Abschnitt K, die für Zahnärzte
// geöffnete GOÄ (§ 6 Abs. 2 GOZ), Analogpositionen (§ 6 Abs. 1 GOZ),
// Eigenblut-/Laborprotokolle und Material.

export type Ebene = 'GOZ' | 'GOAE' | 'MAT' | 'BEB'

/** Die sechs Kieferregionen (Zahnschema OK/UK, rechts/Front/links). */
export type Region = 'OK-R' | 'OK-F' | 'OK-L' | 'UK-L' | 'UK-F' | 'UK-R'

export const REGIONEN: Region[] = ['OK-R', 'OK-F', 'OK-L', 'UK-L', 'UK-F', 'UK-R']

export const REGION_NAME: Record<Region, string> = {
  'OK-R': 'Oberkiefer rechts',
  'OK-F': 'Oberkiefer Front',
  'OK-L': 'Oberkiefer links',
  'UK-L': 'Unterkiefer links',
  'UK-F': 'Unterkiefer Front',
  'UK-R': 'Unterkiefer rechts',
}

export interface Zahn {
  /** Befund (Status), Kleinbuchstaben: f (fehlt), x (nicht erhaltungswürdig), k … */
  B: string
  /** Planung, Großbuchstaben: I (Implantat), IK (Implantat + Krone geplant), A (Augmentation) … */
  TP: string
}

/** Detailangaben zu einem gesetzten Implantat (je Zahnposition). */
export interface ImplantatDetail {
  /** ID aus data/implantatsysteme */
  system: string
  durchmesser: number
  laenge: number
  /** Sofort- oder Spätimplantation */
  zeitpunkt: 'sofort' | 'verzoegert' | 'spaet'
  /** einzeitig gedeckt (Einheilkappe) oder zweizeitig (Deckschraube + spätere Freilegung) */
  deckung: 'offen' | 'gedeckt'
  abutment: 'standard' | 'individuell' | 'keramik'
}

/** Pro Kieferregion wählbare chirurgische Zusatzmaßnahmen (Einstellboxen). */
export interface RegionOptionen {
  /** interner Sinuslift (Kieferhöhle, osteotom, 9120) */
  sinusIntern?: boolean
  /** externer Sinuslift (laterales Fenster, 9120 je Kieferhälfte) */
  sinusExtern?: boolean
  /** gesteuerte Knochenregeneration / Augmentation (9100) */
  augmentation?: boolean
  /** Bone Splitting / Spreading (9130) */
  boneSplitting?: boolean
  /** Entnahme eines Knochenblocks (retromolar/Kinn, 9140) */
  blockEntnahme?: boolean
  /** Entnahme eines Knochenrings */
  ringEntnahme?: boolean
  /** Knochen-/Weichgewebekollektor (Safescraper, Filter) */
  kollektor?: boolean
  /** Herkunft des Augmentats */
  material?: 'autolog' | 'allogen' | 'xenogen' | 'synthetisch' | ''
  /** Membran / Barriere */
  membran?: 'keine' | 'resorbierbar' | 'nicht-resorbierbar' | 'titan' | 'vlies'
  /** Membran-/Blockfixierung mit Pins oder Osteosyntheseschrauben (9140) */
  fixierung?: boolean
  /** plastische Deckung / Weichgewebe (9130, 9140, GOÄ 2381/2386) */
  weichgewebe?: 'keine' | 'rolllappen' | 'fst' | 'btt' | 'vestibulumplastik' | 'tuberplastik'
  /** Eigenblutmembran (PRF/A-PRF/i-PRF) in dieser Region einbringen */
  eigenblut?: boolean
}

/** Globale, nicht regionsgebundene Angaben (Einstellboxen oben). */
export interface GlobalOptionen {
  bildgebung: 'keine' | 'opg' | 'dvt' | 'opg+dvt'
  /** navigierte Chirurgie mit Bohrschablone */
  navigation: boolean
  sedierung: 'keine' | 'lokal' | 'lachgas' | 'analgosedierung' | 'itn'
  /** Risikopatient (Antikoagulation/ASA III) → erhöhter Aufwand, GOÄ-Begleitung */
  risiko: boolean
  /** Eigenblutverfahren (bestimmt die Laborprotokolle) */
  blut: 'keine' | 'prf' | 'prgf' | 'prp'
  /** Anzahl Blutröhrchen/Kits */
  roehrchen: number
  /** Praxis-eigene Blutaufbereitung (Hämatologie/Minilabor) statt Fremdlabor */
  eigenesBlutlabor: boolean
}

export interface Position {
  /** stabiler Schlüssel: automatisch aus der Planung („auto:…") oder manuell */
  id: string
  ebene: Ebene
  nr: string
  /** Zahn, Region (OK-R …) oder '' für kieferübergreifend */
  zahn: string
  anzahl: number
  /** GOZ/GOÄ-Faktor */
  faktor?: number
  /** BEB/MAT/Analog: Einzelpreis (überschreibt die Liste); MAT immer */
  preis?: number
  /** Leistungstext (MAT/Analog, sonst aus der Liste) */
  text?: string
  /** Begründung nach § 10 GOZ / § 5 GOÄ bzw. § 6 Abs. 1 GOZ */
  begruendung?: string
  auto?: boolean
  /** von einem Regler hinzugefügt */
  zusatz?: 'begleit' | 'analog'
  /** Anlass (Tooltip) */
  grund?: string
  /** zahntechnisches/Praxis-Material (mit MwSt.) */
  material?: boolean
  // ── Analogbewertung nach § 6 Abs. 1 GOZ ───────────────────────────────
  /** Analogposition: Vergleichsziffer aus dieser Gebührenordnung */
  analog?: boolean
  basisEbene?: 'GOZ' | 'GOAE'
  /** beschriebene (tatsächlich erbrachte) Leistung */
  analogText?: string
  /** Erstattungsrisiko in der PKV/Beihilfe */
  risiko?: 'niedrig' | 'mittel' | 'hoch'
  /** Behandlungssitzung (für die Gruppierung im Dokument) */
  sitzung?: number
  /** Gebührenanteil nach GOZ-Bestimmung (1 = voll, 0,5 = halbe, 0,333… = ein Drittel) */
  gebuehrenanteil?: number
}

/** Änderungen an automatisch erzeugten Positionen bleiben über Neuberechnungen erhalten */
export type Anpassung = Partial<Pick<Position, 'anzahl' | 'faktor' | 'preis' | 'begruendung' | 'analogText'>>

export interface Regler {
  /** Begleit-/Nebenleistungen (Nachsorge, Verbandplatte, Kontrollen) 0–4 */
  begleitStufe: number
  /** Analog-/Exotenleistungen 0–5 (je höher, desto mehr seltene Positionen) */
  analogStufe: number
  /** Analogbewertung: wie hoch die Vergleichsziffer greift (0 knapp … 2 großzügig) */
  analogBewertung: number
  /** GOZ-Faktor für alle nicht einzeln angepassten GOZ-Positionen (0 = Standard) */
  gozFaktor: number
  /** GOÄ-Faktor für alle nicht einzeln angepassten GOÄ-Positionen (0 = Standard) */
  goaeFaktor: number
  /** Materialklasse 0–3 (Standard … Premium) */
  materialKlasse: number
  /** Bohrschablone/navigierte Chirurgie 0–3 */
  schabloneStufe: number
  /** Auf-/Abschlag auf die BEB-Laborliste in % */
  laborAufschlag: number
  /** abgewählte Zusatzpositionen (Schlüssel ebene|nr|zahn) */
  aus: string[]
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

export interface Praxis {
  name: string
  zahnarzt: string
  strasse: string
  plzOrt: string
  telefon: string
  email: string
}

/** Verweis auf einen zugehörigen Privat-ZE-Kostenvoranschlag (prothetische Fortsetzung). */
export interface ZeVerweis {
  nummer: string
  datum: string
  betrag: number
  zusammenfassung: string
}

export interface Plan {
  nummer: string
  datum: string
  patient: Patient
  zaehne: Record<string, Zahn>
  implantate: Record<string, ImplantatDetail>
  regionen: Partial<Record<Region, RegionOptionen>>
  global: GlobalOptionen
  /** manuell hinzugefügte Positionen */
  manuell: Position[]
  /** Anpassungen automatischer Positionen (Schlüssel = Positions-ID) */
  anpassungen: Record<string, Anpassung>
  /** abgewählte automatische Positionen */
  entfernt: string[]
  regler: Regler
  bemerkung: string
  /** importierter ZE-Plan (prothetische Fortsetzung) */
  zeVerweis?: ZeVerweis
}

export interface Einstellungen {
  praxis: Praxis
  /** Standard-GOZ-Faktor (Schwelle 2,3) */
  gozFaktor: number
  /** Standard-GOÄ-Faktor (Schwelle je Abschnitt) */
  goaeFaktor: number
  /** MwSt. auf Material/Labor in % */
  mwst: number
  gueltigMonate: number
  naechsteNummer: number
  /** GOZ-Faktoren über 3,5 zulassen (nur mit § 2-Vereinbarung) */
  erlaubeUeber35: boolean
  /** Kalkulations-Stundensatz der Praxis für die Analogbewertung (€/h) */
  stundensatz: number
  /** Material bei Analogleistungen einkalkulieren (true) oder gesondert ausweisen (strittig) */
  materialAnalog: boolean
  /** Preis-Überschreibungen je Material-/Katalog-ID */
  materialPreise: Record<string, number>
}

export interface ListenEintrag {
  nr: string
  text: string
  punkte?: number
  preis?: number
  abschnitt?: string
  /** GOÄ: Faktorrahmen */
  kat?: string
  maxFaktor?: number
  schwelle?: number
}

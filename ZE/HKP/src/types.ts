import type { Werkstoff } from './engine/material'
import type { Patient } from './stammdaten'

export type ListenTyp = 'bema' | 'goz' | 'bel2' | 'beb' | 'festzuschuss'

export interface BemaEintrag {
  nr: string
  text: string
  punkte: number
}

export interface GozEintrag {
  nr: string
  text: string
  punkte: number
  hinweis?: string
  abschnitt?: string
}

export interface BelEintrag {
  nr: string
  text: string
  gewerbe: number
  praxis: number
}

export interface BebEintrag {
  nr: string
  text: string
  preis: number
  /** Standardposition mit Richtpreis, bis die Praxis den Preis anpasst */
  richtpreis?: boolean
}

export interface FestzuschussEintrag {
  nr: string
  text: string
  honorar: number
  mul: number
  betraege: Record<'60' | '70' | '75' | '100', number>
}

export interface EintragNachTyp {
  bema: BemaEintrag
  goz: GozEintrag
  bel2: BelEintrag
  beb: BebEintrag
  festzuschuss: FestzuschussEintrag
}

export interface Preisliste<T extends ListenTyp = ListenTyp> {
  id: string
  typ: T
  name: string
  gueltigAb: string
  /** BEL II: KZV-Nummer des Abrechnungsbereichs (src/data/kzv.ts) */
  kzv?: string
  quelle?: string
  hinweis?: string
  /** BEMA: Euro je Punkt, GOZ: Euro je Punkt */
  punktwert?: number
  eintraege: EintragNachTyp[T][]
  /** true, wenn die Liste mit der App ausgeliefert wurde */
  standard?: boolean
  geaendertAm?: string
}

export type Ebene = 'BEMA' | 'GOZ' | 'BEL' | 'BEB' | 'MAT'

export interface Position {
  id: string
  ebene: Ebene
  nr: string
  zahn: string
  anzahl: number
  /** nur GOZ */
  faktor?: number
  /** manueller Einzelpreis (überschreibt Preisliste); bei MAT immer gesetzt */
  preis?: number
  text?: string
  /** durch die Regelengine erzeugt */
  auto?: boolean
  /** Vorschlag, der nicht zwingend anfällt (DPF: "?") */
  fakultativ?: boolean
  /** BEL/BEB: herstellendes Labor (Standard aus den Einstellungen); MAT: 'fremd' = Material aus der Laborrechnung */
  labor?: Labor
  /** aus einer Labor-XML (Laborabrechnungsdaten) übernommen */
  ausXml?: boolean
  /** vom Regler „zusätzliche GOZ-Leistungen“ abgeleitet (nicht im Plan gespeichert) */
  zusatz?: boolean
  /** aus der Kronenmaterial-Wahl abgeleitet (nicht im Plan gespeichert) */
  material?: boolean
  /** erst während der Behandlung angefallen (z. B. Stiftaufbau, Entfernen einer alten Krone) */
  nachtraeglich?: boolean
  /** GOZ: eigene Begründung für einen Faktor über 2,3 (§ 10 Abs. 3 GOZ); leer = Standardtext */
  faktorBegruendung?: string
}

export type Labor = 'eigen' | 'fremd'

/** Gewerbliches Labor: Austausch über die XML-Schnittstelle Laborabrechnungsdaten (KZBV/VDZI/VDDS) */
export interface Fremdlabor {
  name: string
  auftragsnummer: string
  laufendeNr: number
  import?: {
    datei: string
    eingelesen: string
    rechnungsnummer: string
    lieferdatum: string
    herstellungsort: string
    abrechnungsbereich: string
    netto: number
    mwst: number
    brutto: number
    software?: string
  }
}

export interface FestzuschussBefund {
  id: string
  nr: string
  zahnGebiet: string
  anzahl: number
  auto?: boolean
  fakultativ?: boolean
  /** 1.4/1.5 nach der Bewilligung: keine erneute Genehmigung, Abrechnung als „Nachträgliche Befunde“ */
  nachtraeglich?: boolean
}

export interface ZahnZeilen {
  B: string
  R: string
  TP: string
  /** Brückenanfang bzw. -ende in Zeile TP, eingegeben als „-K“ bzw. „K-“ */
  bAnfang?: boolean
  bEnde?: boolean
}

export type Versorgungsart = 'regel' | 'gleichartig' | 'andersartig'

export interface WeitereAngaben {
  unfall: boolean
  ser: boolean
  immediatOK: boolean
  immediatUK: boolean
  interimOK: boolean
  interimUK: boolean
  unbrauchbarOK: boolean
  unbrauchbarUK: boolean
  alterOK: string
  alterUK: string
  nem: boolean
  direktabrechnung: boolean
}

/** Klinische Angaben, die sich nicht aus dem Zahnschema ergeben (Zuschlagsbefunde) */
export interface KlinischeAngaben {
  /** 1.4: endodontisch behandelte Zähne mit konfektioniertem Stiftaufbau */
  stiftKonfektioniert: string[]
  /** 1.5: endodontisch behandelte Zähne mit gegossenem Stiftaufbau */
  stiftGegossen: string[]
  /** 1.4 gleichartig: adhäsiv befestigter bzw. nicht-metallischer Stift (Glasfaser, Keramik) – GOZ 2180/2195/2197 */
  stiftAdhaesiv: string[]
  /** Zähne, deren Stiftbefund (1.4/1.5) erst nach der Bewilligung angefallen ist */
  stiftNachtraeglich: string[]
  /** 2.6: disparallele Pfeilerzähne (Brückenanker) */
  disparallel: string[]
  /** 4.5: Notwendigkeit einer Metallbasis (Nr. 30 ZE-Richtlinie) */
  metallbasisOK: boolean
  metallbasisUK: boolean
  /** 4.9: Stützstiftregistrierung nötig */
  stuetzstift: boolean
  /** 7.6: atrophierter zahnloser Kiefer (Ausnahmefall Nr. 36 ZE-Richtlinie) */
  atrophieOK: boolean
  atrophieUK: boolean
}

/** Wiederherstellung / Erweiterung (Befundklasse 6, 7.3, 7.4, 7.7) */
export interface Reparatur {
  id: string
  art: string
  /** Kiefer (OK/UK) bzw. Zähne, je nach Art */
  gebiet: string
}

/** Implantatprothetik: Abformung, Abutment und System für Implantatkronen (TP SK…/ST…) */
export interface ImplantatAngaben {
  /** ID aus dem Materialkatalog der Implantatsysteme */
  system: string
  /** Löffel bei konventioneller Abformung; 'scan' nur noch aus älteren Plänen (maßgeblich ist HkpPlan.abformung) */
  abformung: '' | 'scan' | 'offen' | 'geschlossen'
  abutment: 'standard' | 'individuell' | 'keramik'
}

/** '' = noch nicht festgelegt (wird vor dem Berechnen erfragt) */
export type Abformung = '' | 'scan' | 'abdruck'

export type AbformungWahl = Partial<Pick<HkpPlan, 'abformung' | 'abformungProthese'>>

export interface HkpPlan {
  /** Einheitliche Anmeldedaten; name/vorname/geburtsdatum liest das HKP-Register in MAS */
  patient: Patient
  verwaltung: {
    /** Lfd.-Nr. oben rechts im Vordruck */
    lfdNr: string
    /** nach der Eingliederung vom Zahnarzt einzutragen */
    eingliederungsdatum: string
    herstellungsortEingliederung: string
    antragsnummer: string
    art: 'HKP' | 'WE'
    therapieschritt: string
    therapieschritteGesamt: string
    ausstellungsdatum: string
    herstellungsort: string
    abrechnungsNr: string
    zahnarztNr: string
    antragsnummerUrspruenglich: string
    aktenzeichen: string
    erlaeuterung: string
  }
  zaehne: Record<string, ZahnZeilen>
  bemerkungen: string
  weitere: WeitereAngaben
  klinisch: KlinischeAngaben
  reparaturen: Reparatur[]
  /** Abformung der präparierten Zähne bzw. Primärkronen (und Implantate) */
  abformung: Abformung
  /** zweite Abformung für den herausnehmbaren Teil einer Kombinations-/Prothesenarbeit */
  abformungProthese: Abformung
  implantat: ImplantatAngaben
  /** Kronenmaterial je Zahn; fehlt ein Eintrag, gilt der Standard (NEM bzw. Zirkon/Presskeramik) */
  werkstoffe: Record<string, Werkstoff>
  befunde: FestzuschussBefund[]
  positionen: Position[]
  /** bewusst entfernte Positionen der Regelengine („ebene|nr|zahn“) – kommen beim Neuberechnen nicht wieder */
  ausgeschlossen: string[]
  zuschuss: { bonus: '60' | '70' | '75'; haertefall: boolean }
  versorgungsart: 'auto' | Versorgungsart
  fremdlabor: Fremdlabor
  einstellungen: Einstellungen
}

export interface Einstellungen {
  bemaListe: string
  gozListe: string
  belListe: string
  bebListe: string
  fzListe: string
  labor: 'gewerbe' | 'praxis'
  mwstLabor: number
  gozFaktor: number
  /** Honorar-Regler: GOZ-Mindestfaktor für alle Positionen (0 = aus, max. 3,5 nach § 5 GOZ) */
  honorarFaktor: number
  /** Honorar-Regler: Stufe der zusätzlichen GOZ-Leistungen (0 = aus) */
  gozZusatzStufe: number
  /** einzeln abgewählte Zusatzleistungen („nr|zahn“) */
  gozZusatzAus: string[]
  /** Eigenlabor Kasse: Anteil am BEL-II-Höchstpreis für Praxislabore in % (max. 100) */
  eigenKasseProzent: number
  /** Eigenlabor privat: Aufschlag in % auf die BEB-Preisliste */
  eigenPrivatAufschlag: number
  /** Eigenlabor: Stufe der Aufwertung von Kassen- zu Privatausführungen (0 = Kasse) */
  eigenPrivatStufe: number
  /** vom Aufwertungs-Regler gesetzte Therapiekürzel je Zahn (werden beim Zurückstellen wieder entfernt) */
  eigenPrivatTp: Record<string, string>
  /** abgewählte Privatleistungen des Aufwertungs-Reglers (Positions-ID „aufw-nr-gebiet“) */
  eigenPrivatAus: string[]
  /** Postleitzahl der Praxis (Standortnummer der Labor-Auftragsnummer, KZV-Bereich) */
  praxisPlz: string
  /** KZV-Nummer für die BEL-II-Höchstpreise ('' = aus der Praxis-PLZ) */
  kzv: string
}

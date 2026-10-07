// Analogleistungen nach § 6 Abs. 1 GOZ (Exoten).
// Grundlage: BZÄK-Analogkatalog (Stand Juli 2025), Euro-Beispiele aus
// Kammer-Veröffentlichungen (BLZK, ZÄK Berlin). Jede Leistung trägt ihre
// Vergleichsziffern (gleichwertige GOZ/GOÄ-Nummern) mit Beleg, die PKV-Haltung
// und das Erstattungsrisiko. Die Vergleichsziffern sind von der niedrigsten zur
// höchsten Kammer-Empfehlung sortiert (für den Regler „Analogbewertung").

export type BasisEbene = 'GOZ' | 'GOAE'

export interface Vergleichsziffer {
  ebene: BasisEbene
  nr: string
  /** Faktor, mit dem das Kammerbeispiel gerechnet ist */
  faktor: number
  /** Euro-Betrag des Kammerbeispiels */
  euro: number
  quelle: string
}

export interface AnalogLeistung {
  id: string
  titel: string
  /** beschriebene, tatsächlich erbrachte Leistung (Text im KV nach § 10 Abs. 4 GOZ) */
  beschreibung: string
  /** BZÄK-Abschnitt der Vergleichsleistung */
  abschnitt: 'A' | 'D' | 'K'
  einheit: 'Sitzung' | 'Implantat' | 'Kieferhälfte' | 'Region' | 'Zahn' | 'Fall'
  /** typischer Zeitaufwand in Minuten (für die Praxiskalkulation, Analogbewertung Stufe 2) */
  minuten: number
  /** ist das Material in der Analoggebühr enthalten (ZÄK Berlin) oder gesondert? */
  materialEinkalkuliert: boolean
  /** Erstattungsrisiko in PKV/Beihilfe */
  risiko: 'niedrig' | 'mittel' | 'hoch'
  /** PKV-Kommentierung (Erstattungshinweis) */
  pkv: string
  /** Vergleichsziffern (aufsteigend nach Euro sortiert) */
  vergleich: Vergleichsziffer[]
  /** Regler-Stufe „Analog/Exoten" (1–5), ab der die Leistung angeboten wird */
  stufe: number
  /** erscheint nur, wenn die Planung diese Grundlage enthält */
  bedarf: 'planung' | 'insertion' | 'freilegung' | 'augmentation' | 'extraktion' | 'sedierung' | 'antikoagulation' | 'eigenblut' | 'immer'
}

export const ANALOG_KATALOG: AnalogLeistung[] = [
  // ── Stufe 1: digitale Planung ──────────────────────────────────────────
  {
    id: 'virtuelle-implantation',
    titel: 'Virtuelle Implantatplanung (3D)',
    beschreibung: 'Dreidimensionale virtuelle Implantatplanung auf DVT-Datensatz einschließlich Auswertung und Positionsfestlegung, entsprechend GOZ-Nr. 2160',
    abschnitt: 'K', einheit: 'Fall', minuten: 45, materialEinkalkuliert: false, risiko: 'mittel',
    pkv: 'Teilweise als mit 9000 abgegolten angesehen; Analogansatz bei eigenständiger virtueller Planung vertretbar.',
    vergleich: [{ ebene: 'GOZ', nr: '2160', faktor: 2.3, euro: 175.41, quelle: 'BLZK-Empfehlung 2024' }],
    stufe: 1, bedarf: 'planung',
  },
  {
    id: 'schablonenaufwand',
    titel: 'Aufwand für die Bohrschablone (Konstruktion/Anpassung)',
    beschreibung: 'Konstruktion und klinische Anpassung einer statischen Bohrschablone, entsprechend GOZ-Nr. 3030',
    abschnitt: 'K', einheit: 'Fall', minuten: 20, materialEinkalkuliert: false, risiko: 'mittel',
    pkv: 'Neben 9003/9005 strittig; getrennter Analogansatz für den Konstruktionsaufwand möglich.',
    vergleich: [{ ebene: 'GOZ', nr: '3030', faktor: 2.3, euro: 45.27, quelle: 'BLZK-Empfehlung 2024' }],
    stufe: 1, bedarf: 'planung',
  },
  // ── Stufe 2: Implantat-Qualitätssicherung ─────────────────────────────
  {
    id: 'rfa-isq',
    titel: 'Resonanzfrequenzanalyse / Stabilitätsmessung (ISQ)',
    beschreibung: 'Messung der Implantatstabilität mittels Resonanzfrequenzanalyse (ISQ), entsprechend GOZ-Nr. 5170',
    abschnitt: 'K', einheit: 'Implantat', minuten: 10, materialEinkalkuliert: false, risiko: 'mittel',
    pkv: 'Als Zusatzdiagnostik häufig nicht erstattet; Analogansatz vertretbar, wenn eigenständig dokumentiert.',
    vergleich: [
      { ebene: 'GOZ', nr: '5170', faktor: 2.3, euro: 32.34, quelle: 'BLZK-Empfehlung 2024' },
      { ebene: 'GOZ', nr: '4100', faktor: 2.3, euro: 35.57, quelle: 'BLZK-Empfehlung 2024' },
    ],
    stufe: 2, bedarf: 'insertion',
  },
  {
    id: 'emergenzprofil',
    titel: 'Ausformung des Emergenzprofils',
    beschreibung: 'Weichgewebliche Ausformung des Emergenzprofils mit individuellem Gingivaformer, entsprechend GOZ-Nr. 9050',
    abschnitt: 'K', einheit: 'Implantat', minuten: 15, materialEinkalkuliert: false, risiko: 'mittel',
    pkv: 'Teilweise als prothetische Leistung dem ZE zugeordnet; Analogansatz bei chirurgischer Ausformung vertretbar.',
    vergleich: [
      { ebene: 'GOZ', nr: '9050', faktor: 2.3, euro: 40.49, quelle: 'BLZK-Empfehlung 2024' },
      { ebene: 'GOZ', nr: '3230', faktor: 2.3, euro: 56.92, quelle: 'BLZK-Empfehlung 2024' },
    ],
    stufe: 2, bedarf: 'freilegung',
  },
  // ── Stufe 3: Sicherheit / Komfort ─────────────────────────────────────
  {
    id: 'lachgas',
    titel: 'Lachgas-Sedierung (Analgosedierung)',
    beschreibung: 'Sedierung mit Lachgas (N2O/O2) einschließlich Überwachung, entsprechend GOÄ-Nr. 2442 analog',
    abschnitt: 'A', einheit: 'Sitzung', minuten: 30, materialEinkalkuliert: true, risiko: 'hoch',
    pkv: 'In der PKV regelmäßig abgelehnt (keine eigene GOZ/GOÄ-Ziffer); als Verlangensleistung nach § 2 Abs. 3 vereinbaren.',
    vergleich: [{ ebene: 'GOAE', nr: '2442', faktor: 2.3, euro: 120.65, quelle: 'ZÄK-Berlin-Beispiel' }],
    stufe: 3, bedarf: 'sedierung',
  },
  {
    id: 'pulsoxymetrie',
    titel: 'Pulsoxymetrische Überwachung',
    beschreibung: 'Kontinuierliche pulsoxymetrische Überwachung während der Sedierung, entsprechend GOÄ-Nr. 253 analog',
    abschnitt: 'A', einheit: 'Sitzung', minuten: 5, materialEinkalkuliert: false, risiko: 'hoch',
    pkv: 'Als mit der Sedierung abgegolten angesehen; Erstattung unwahrscheinlich.',
    vergleich: [{ ebene: 'GOAE', nr: '253', faktor: 2.3, euro: 9.38, quelle: 'GOÄ § 5 (2,3-fach)' }],
    stufe: 3, bedarf: 'sedierung',
  },
  {
    id: 'gerinnungstest',
    titel: 'Gerinnungs-Schnelltest (INR/POCT)',
    beschreibung: 'Patientennahe Bestimmung des Gerinnungsstatus (INR) vor dem Eingriff, entsprechend GOÄ-Nr. 250 analog',
    abschnitt: 'D', einheit: 'Sitzung', minuten: 10, materialEinkalkuliert: true, risiko: 'mittel',
    pkv: 'Bei dokumentierter Antikoagulation meist anerkannt.',
    vergleich: [{ ebene: 'GOAE', nr: '250', faktor: 1.8, euro: 4.20, quelle: 'GOÄ § 5 Abs. 3 (höchstens 2,5)' }],
    stufe: 3, bedarf: 'antikoagulation',
  },
  // ── Stufe 4: Biologisierung (Eigenblut) ───────────────────────────────
  {
    id: 'prf-matrix',
    titel: 'Herstellung und Einbringen einer Eigenblut-/PRF-Matrix',
    beschreibung: 'Herstellung und Applikation einer thrombozytenreichen Fibrinmatrix (PRF) aus Eigenblut, entsprechend GOZ-Nr. 2150',
    abschnitt: 'D', einheit: 'Region', minuten: 20, materialEinkalkuliert: false, risiko: 'hoch',
    pkv: 'Die PKV sieht PRF teilweise als mit GOZ 4110 + GOÄ 250 abgegolten an; Analogansatz der Matrix ist strittig.',
    vergleich: [
      { ebene: 'GOZ', nr: '2150', faktor: 2.3, euro: 147.60, quelle: 'BLZK-Empfehlung 2024' },
      { ebene: 'GOZ', nr: '5210', faktor: 2.3, euro: 181.10, quelle: 'BLZK-Empfehlung 2024' },
    ],
    stufe: 4, bedarf: 'eigenblut',
  },
  // ── Stufe 5: regenerative Exoten ──────────────────────────────────────
  {
    id: 'socket-preservation-kem',
    titel: 'Alveolenmanagement mit Knochenersatzmaterial (Socket Preservation)',
    beschreibung: 'Auffüllung und Konturerhalt der Extraktionsalveole mit Knochenersatzmaterial und Abdeckung, entsprechend GOÄ-Nr. 2442 analog (Material einkalkuliert)',
    abschnitt: 'D', einheit: 'Zahn', minuten: 25, materialEinkalkuliert: true, risiko: 'mittel',
    pkv: 'ZÄK-Berlin-Beispiel: GOÄ 2442 analog, Material inklusive. Erstattung uneinheitlich.',
    vergleich: [{ ebene: 'GOAE', nr: '2442', faktor: 2.3, euro: 120.65, quelle: 'ZÄK-Berlin-Beispiel (inkl. Material)' }],
    stufe: 5, bedarf: 'extraktion',
  },
  {
    id: 'socket-shield',
    titel: 'Socket-Shield-Technik (partielle Wurzelerhaltung)',
    beschreibung: 'Belassen eines bukkalen Wurzelsegments zum Erhalt der Alveolenkontur bei Sofortimplantation, entsprechend GOZ-Nr. 3230',
    abschnitt: 'K', einheit: 'Zahn', minuten: 30, materialEinkalkuliert: false, risiko: 'hoch',
    pkv: 'Noch keine etablierte Erstattungslinie; als Verlangensleistung nach § 2 Abs. 3 absichern.',
    vergleich: [{ ebene: 'GOZ', nr: '3230', faktor: 2.3, euro: 56.92, quelle: 'BLZK-Empfehlung 2024' }],
    stufe: 5, bedarf: 'extraktion',
  },
  {
    id: 'kollagenmatrix',
    titel: 'Einbringen einer Kollagen-/Weichgewebematrix',
    beschreibung: 'Einbringen und Fixierung einer volumenstabilen Kollagenmatrix zur Weichgewebeverdickung, entsprechend GOZ-Nr. 4130',
    abschnitt: 'D', einheit: 'Region', minuten: 25, materialEinkalkuliert: false, risiko: 'mittel',
    pkv: 'Als Ersatz des Bindegewebstransplantats (4133) teilweise anerkannt.',
    vergleich: [{ ebene: 'GOZ', nr: '4130', faktor: 2.3, euro: 23.28, quelle: 'GOZ § 5 (2,3-fach)' }],
    stufe: 5, bedarf: 'augmentation',
  },
  {
    id: 'laser-dekontamination',
    titel: 'Laser-Dekontamination des Implantatlagers/der Alveole',
    beschreibung: 'Photodynamische bzw. Laser-Dekontamination des OP-Gebietes, entsprechend GOZ-Nr. 4080',
    abschnitt: 'A', einheit: 'Region', minuten: 10, materialEinkalkuliert: true, risiko: 'hoch',
    pkv: 'Erstattung unwahrscheinlich; Verlangensleistung.',
    vergleich: [{ ebene: 'GOZ', nr: '4080', faktor: 2.3, euro: 5.82, quelle: 'GOZ § 5 (2,3-fach)' }],
    stufe: 5, bedarf: 'immer',
  },
]

export const analogFinden = (id: string) => ANALOG_KATALOG.find((a) => a.id === id)

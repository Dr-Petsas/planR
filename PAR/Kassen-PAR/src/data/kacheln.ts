// Leistungs-Kacheln je Terminart (nach dem UPT-Planer-Prototyp, Nummern und
// Punktzahlen korrigiert: BEMA aus dem MAS-Katalog, GOZ aus der amtlichen
// Tabelle).
//
// stufe:  kern    = Kassenleistung des Termins, standardmaessig an
//         begleit = Kassen-Begleitleistung (Anaesthesie, Roentgen, 01, 108 ...)
//         zusatz  = private Zusatzleistung (GOZ/GOAE, nur Modus "BEMA + privat")
// Der Regler schaltet erst Begleit-, dann Zusatz-Kacheln zu, jeweils die
// wertvollste zuerst. Kacheln mit "nichtNeben" werden nicht zugeschaltet,
// solange eine ausschliessende Kachel aktiv ist.

import type { TerminArt, UptModul } from '../types'

/** Wie oft eine Position im Termin anfaellt (Grundlage: Zaehne des Termins). */
export type MengenRegel =
  | 'eins' // einmal, wenn der Termin Zaehne hat
  | 'sitzung' // einmal je Sitzung
  | 'alle' // je vorhandenem Zahn
  | 'behandelt' // je behandeltem Zahn
  | 'ein' // je behandeltem einwurzeligen Zahn
  | 'mehr' // je behandeltem mehrwurzeligen Zahn
  | 'ohneErsten' // je weiterem behandelten Zahn
  | 'infiltration' // BEMA 40: OK, jeder zweite Zahn je zusammenhaengender Gruppe
  | 'leitung' // 41a: je Unterkieferseite mit behandelten Zaehnen
  | 'haelften' // je Kieferhaelfte (Quadrant) mit behandelten Zaehnen
  | 'kiefer' // je Kiefer mit behandelten Zaehnen
  | 'roentgen' // Roentgen-Wahl nach Zahl der betroffenen Zaehne
  | 'implantate' // je Implantat im Befund (ZS 6)
  | { anteil: number } // Anteil der behandelten Zaehne (aufgerundet, mind. 1)

export type GebSystem = 'BEMA' | 'GOZ' | 'GOÄ' | 'ANALOG'

export interface KachelPos { sys: GebSystem; nr: string; menge: MengenRegel }

export type Stufe = 'kern' | 'begleit' | 'zusatz'

export const KATEGORIEN = [
  'Kassenleistung',
  'Röntgen',
  'Anästhesie',
  'Begleitleistung Kasse',
  'Diagnostik privat',
  'Prophylaxe privat',
  'Adjuvante Therapie privat',
  'Chirurgie privat',
  'Periimplantitis privat',
  'Beratung privat',
] as const
export type Kategorie = (typeof KATEGORIEN)[number]

export interface Kachel {
  id: string
  label: string
  stufe: Stufe
  kategorie: Kategorie
  /** standardmaessig an (Kern immer; Begleit z. B. Anaesthesie bei AIT) */
  standard: boolean
  /** standardmaessig an, wenn das UPT-Modul im Termin vorgesehen ist */
  standardModul?: UptModul
  pos: KachelPos[]
  modul?: UptModul // UPT-Kernleistung nur, wenn das Modul im Termin vorgesehen ist
  /** nicht neben diesen Kacheln (IDs) im selben Termin */
  nichtNeben?: string[]
  hinweis?: string
}

const k = (
  id: string, label: string, stufe: Stufe, kategorie: Kategorie, pos: KachelPos[], extra: Partial<Kachel> = {},
): Kachel => ({ id, label, stufe, kategorie, standard: stufe === 'kern', pos, ...extra })

const B = (nr: string, menge: MengenRegel = 'sitzung'): KachelPos => ({ sys: 'BEMA', nr, menge })
const G = (nr: string, menge: MengenRegel = 'sitzung'): KachelPos => ({ sys: 'GOZ', nr, menge })
const A = (nr: string, menge: MengenRegel = 'sitzung'): KachelPos => ({ sys: 'GOÄ', nr, menge })
const AN = (nr: string, menge: MengenRegel = 'sitzung'): KachelPos => ({ sys: 'ANALOG', nr, menge })
const kasse = (id: string, label: string, pos: KachelPos[], extra: Partial<Kachel> = {}) =>
  k(id, label, 'kern', 'Kassenleistung', pos, extra)

// Kassen-Begleitleistungen ----------------------------------------------------

const roentgen = (label = 'Röntgen nach Befund', extra: Partial<Kachel> = {}) =>
  k('roentgen', label, 'begleit', 'Röntgen', [B('ROE', 'roentgen')], {
    hinweis: 'Rö2 / Rö5 / Rö8 / Status / OPG – automatisch nach Zahl der betroffenen Zähne oder von Hand',
    ...extra,
  })
const infiltration = (standard: boolean) =>
  k('infiltration', 'Infiltrationsanästhesie (40)', 'begleit', 'Anästhesie', [B('40', 'infiltration')], {
    standard, hinweis: 'Oberkiefer: jeder zweite Zahn je zusammenhängender Gruppe',
  })
const leitung = (standard: boolean) =>
  k('leitung', 'Leitungsanästhesie (41a)', 'begleit', 'Anästhesie', [B('41a', 'leitung')], {
    standard, hinweis: 'Unterkiefer: eine je Seite mit behandelten Zähnen',
  })
const oberflaeche = k('oberflaeche', 'Oberflächenanästhesie (GOZ 0080)', 'zusatz', 'Anästhesie', [G('0080', 'haelften')], {
  hinweis: 'privat, je Kieferhälfte bzw. Frontzahnbereich',
})
const untersuchung = k('u01', 'Eingehende Untersuchung (01)', 'begleit', 'Begleitleistung Kasse', [B('01')], {
  nichtNeben: ['ae1'], hinweis: '1× je Kalenderhalbjahr, frühestens nach 4 Monaten',
})
const beratungKasse = k('ae1', 'Beratung (Ä1)', 'begleit', 'Begleitleistung Kasse', [B('Ä1')], {
  nichtNeben: ['u01', 'uptb'], hinweis: 'nicht neben 01 und nicht neben UPT b',
})
const einschleifen = k('einschleifen', 'Einschleifen (108)', 'begleit', 'Begleitleistung Kasse', [B('108')], {
  hinweis: 'nicht neben konservierenden, prothetischen oder chirurgischen Leistungen',
})
const zahnstein = k('zahnstein', 'Zahnstein entfernen (107)', 'begleit', 'Begleitleistung Kasse', [B('107')], {
  hinweis: '1× je Kalenderjahr, vor Beginn der PAR-Behandlung',
})
const schleimhaut = k('schleimhaut', 'Schleimhautbehandlung (105)', 'begleit', 'Begleitleistung Kasse', [B('105')])

// Private Zusatzleistungen ----------------------------------------------------

const keimtest = k('keimtest', 'Keimbestimmung (Abstrich)', 'zusatz', 'Diagnostik privat', [A('298')], { hinweis: 'Laborkosten gesondert' })
const mmp8 = k('mmp8', 'aMMP-8-Test', 'zusatz', 'Diagnostik privat', [AN('mmp8')])
const speicheltest = k('speicheltest', 'Speicheltest / Risikoanalyse', 'zusatz', 'Diagnostik privat', [AN('speicheltest')])
const fluorid = k('fluorid', 'Fluoridierung', 'zusatz', 'Prophylaxe privat', [G('1020')])
const zunge = k('zunge', 'Zungenreinigung', 'zusatz', 'Prophylaxe privat', [AN('zungenreinigung')])
const sensibel = k('sensibel', 'Überempfindliche Zahnflächen', 'zusatz', 'Prophylaxe privat', [G('2010', 'kiefer')])
const kanten = k('kanten', 'Scharfe Zahnkanten beseitigen', 'zusatz', 'Prophylaxe privat', [G('4030', 'haelften')])
const spuelung = k('spuelung', 'Antiseptische Taschenspülung', 'zusatz', 'Adjuvante Therapie privat', [G('4020')])
const medikament = (anteil: number) =>
  k('medikament', 'Lokale Medikamentenapplikation', 'zusatz', 'Adjuvante Therapie privat', [G('4025', { anteil })], {
    hinweis: `je Zahn, vorgeschlagen für ${Math.round(anteil * 100)} % der behandelten Zähne`,
  })
const pdt = k('pdt', 'Photodynamische Therapie', 'zusatz', 'Adjuvante Therapie privat', [AN('pdt1', 'eins'), AN('pdtw', 'ohneErsten')], {
  hinweis: 'erster Zahn + je weiterer Zahn',
})
const laser = k('laser', 'Laser-Dekontamination', 'zusatz', 'Adjuvante Therapie privat', [AN('laser', 'behandelt')], { hinweis: 'je behandeltem Zahn' })
const schienung = k('schienung', 'Parodontale Schienung (adhäsiv)', 'zusatz', 'Adjuvante Therapie privat', [AN('schienung', 'eins')], {
  hinweis: 'je Interdentalraum – Menge eintragen',
})
const gewohnheiten = k('gewohnheiten', 'Beratung schädliche Gewohnheiten (Rauchstopp)', 'zusatz', 'Beratung privat', [G('6190')])
const psi = k('psi', 'PSI / Gingivalindex (3. und 4. Mal im Jahr)', 'zusatz', 'Diagnostik privat', [AN('psi')], {
  hinweis: 'BZÄK 08/2026: 3210a, erst ab der dritten Erhebung im Jahr',
})
const zungenindex = k('zungenindex', 'Zungenbelag-Index / Halitosis-Messung', 'zusatz', 'Diagnostik privat', [AN('zungenindex')])
const hba1c = k('hba1c', 'Diabetes-Screening (HbA1c-Schnelltest)', 'zusatz', 'Diagnostik privat', [AN('hba1c')], {
  hinweis: 'Parodontitis und Diabetes: Schnelltest in der Praxis, Material gesondert',
})
const biofilm = k('biofilm', 'Subgingivale Biofilmentfernung (Pulverstrahl)', 'zusatz', 'Prophylaxe privat', [AN('biofilm', { anteil: 0.3 })], {
  hinweis: 'nicht in GOZ 1040 enthalten; je Zahn mit Taschen, vorgeschlagen für 30 %',
})
const hyaluron = (anteil: number) =>
  k('hyaluron', 'Hyaluronsäure subgingival', 'zusatz', 'Adjuvante Therapie privat', [AN('hyaluron', { anteil })], {
    hinweis: `je Zahn inkl. Material, vorgeschlagen für ${Math.round(anteil * 100)} % der behandelten Zähne`,
  })
const hypochlorit = k('hypochlorit', 'Hypochlorit-Gel (z. B. Perisolv)', 'zusatz', 'Adjuvante Therapie privat', [AN('hypochlorit', { anteil: 0.3 })], {
  hinweis: 'Taschenkonditionierung vor der Instrumentierung, je Zahn',
})
const ozon = k('ozon', 'Ozon-Desinfektion der Taschen', 'zusatz', 'Adjuvante Therapie privat', [AN('ozon', 'behandelt')], { hinweis: 'je behandeltem Zahn' })
const implReinigung = k('implreinigung', 'Periimplantitis: Reinigung je Implantat (4070)', 'zusatz', 'Periimplantitis privat', [G('4070', 'implantate')], {
  hinweis: 'Implantate sind keine PAR-Kassenleistung; Menge = Implantate im Befund (ZS 6)',
})
const implMed = k('implmed', 'Periimplantitis: Lokalantibiotikum je Implantat', 'zusatz', 'Periimplantitis privat', [AN('implMed', 'implantate')])
const implPdt = k('implpdt', 'Periimplantitis: aPDT je Implantat', 'zusatz', 'Periimplantitis privat', [AN('implPdt', 'implantate')])
const periimplantitis = [implReinigung, implMed, implPdt]

const beratungPrivat = k('beratung', 'Eingehende Beratung (Ernährung, Risiko)', 'zusatz', 'Beratung privat', [A('3')], {
  hinweis: 'GOÄ 3, mind. 10 Minuten',
})

// Katalog --------------------------------------------------------------------

export const KATALOG: Record<TerminArt, Kachel[]> = {
  befund: [
    kasse('par4', 'Parodontalstatus (4)', [B('4')]),
    roentgen('Röntgen nach Befund', { standard: true }),
    untersuchung,
    zahnstein,
    keimtest,
    mmp8,
    speicheltest,
    hba1c,
    zungenindex,
  ],
  atg: [
    kasse('atg', 'Aufklärungs- und Therapiegespräch', [B('ATG')]),
    kasse('mhu', 'Mundhygieneunterweisung', [B('MHU')]),
    einschleifen,
    zahnstein,
    beratungPrivat,
    gewohnheiten,
  ],
  pzr: [
    k('pzr', 'Professionelle Zahnreinigung', 'zusatz', 'Prophylaxe privat', [G('1040', 'alle')], { standard: true }),
    fluorid,
    sensibel,
    kanten,
    zunge,
    biofilm,
    zungenindex,
    oberflaeche,
  ],
  ait: [
    kasse('aita', 'AIT einwurzelig', [B('AIT a', 'ein')]),
    kasse('aitb', 'AIT mehrwurzelig', [B('AIT b', 'mehr')]),
    infiltration(true),
    leitung(true),
    oberflaeche,
    einschleifen,
    spuelung,
    medikament(0.3),
    hyaluron(0.3),
    hypochlorit,
    ozon,
    pdt,
    laser,
    schienung,
    ...periimplantitis,
  ],
  bev: [
    kasse('beva', 'Befundevaluation nach AIT', [B('BEV a')]),
    roentgen('Röntgen-Kontrolle'),
    untersuchung,
    beratungKasse,
    keimtest,
    mmp8,
    speicheltest,
    hba1c,
    gewohnheiten,
  ],
  cpt: [
    kasse('cpta', 'CPT einwurzelig', [B('CPT a', 'ein')]),
    kasse('cptb', 'CPT mehrwurzelig', [B('CPT b', 'mehr')]),
    infiltration(true),
    leitung(true),
    oberflaeche,
    k('mikroskop', 'OP-Mikroskop (Zuschlag 0110)', 'zusatz', 'Chirurgie privat', [G('0110', 'eins')]),
    k('knochen', 'Knochendefekte auffüllen (4110)', 'zusatz', 'Chirurgie privat', [G('4110', { anteil: 0.25 })], { hinweis: 'je Zahn' }),
    k('membran', 'Membran / GTR (4138)', 'zusatz', 'Chirurgie privat', [G('4138', { anteil: 0.25 })], { hinweis: 'je Zahn' }),
    k('osteoplastik', 'Osteoplastik (4136)', 'zusatz', 'Chirurgie privat', [G('4136', { anteil: 0.25 })], { hinweis: 'je Zahn' }),
    k('lappen', 'Gestielter Schleimhautlappen (4120)', 'zusatz', 'Chirurgie privat', [G('4120', 'eins')], { hinweis: 'je Kieferhälfte' }),
    k('fst', 'Schleimhauttransplantat (4130)', 'zusatz', 'Chirurgie privat', [G('4130', 'eins')]),
    k('bgt', 'Bindegewebstransplantat (4133)', 'zusatz', 'Chirurgie privat', [G('4133', 'eins')]),
    k('emdogain', 'Schmelzmatrixproteine (Emdogain)', 'zusatz', 'Chirurgie privat', [AN('emdogain', { anteil: 0.25 })], { hinweis: 'regenerative Therapie, je Zahn' }),
    k('kollagen', '3D-Kollagenmatrix (z. B. Mucograft)', 'zusatz', 'Chirurgie privat', [AN('kollagen', 'eins')], { hinweis: 'Gingivaverdickung statt Bindegewebstransplantat' }),
    k('papille', 'Papillenaufbau mit Hyaluronsäure', 'zusatz', 'Chirurgie privat', [AN('papille', 'eins')], { hinweis: 'je Papille – Menge eintragen' }),
    hyaluron(0.25),
    k('prf', 'PRF aus Eigenblut', 'zusatz', 'Chirurgie privat', [A('250'), AN('prf')], { hinweis: 'Blutentnahme GOÄ 250 + Aufbereitung' }),
    medikament(0.25),
  ],
  nachbehandlung: [
    kasse('nb111', 'Nachbehandlung (111)', [B('111')]),
    schleimhaut,
    spuelung,
  ],
  bevb: [
    kasse('bevb', 'Befundevaluation nach CPT', [B('BEV b')]),
    roentgen('Röntgen-Kontrolle'),
    untersuchung,
    beratungKasse,
    mmp8,
  ],
  upt: [
    kasse('upta', 'UPT a Mundhygienekontrolle', [B('UPT a')], { modul: 'a' }),
    kasse('uptb', 'UPT b Mundhygieneunterweisung', [B('UPT b')], { modul: 'b' }),
    kasse('uptc', 'UPT c Reinigung aller Zähne', [B('UPT c', 'alle')], { modul: 'c' }),
    kasse('uptd', 'UPT d ST-/BOP-Messung', [B('UPT d')], { modul: 'd' }),
    kasse('upte', 'UPT e subgingival einwurzelig', [B('UPT e', 'ein')], { modul: 'e' }),
    kasse('uptf', 'UPT f subgingival mehrwurzelig', [B('UPT f', 'mehr')], { modul: 'f' }),
    kasse('uptg', 'UPT g Parodontal-Untersuchung', [B('UPT g')], { modul: 'g' }),
    roentgen('Röntgen', { standardModul: 'g' }),
    infiltration(false),
    leitung(false),
    oberflaeche,
    untersuchung,
    beratungKasse,
    einschleifen,
    fluorid,
    zunge,
    sensibel,
    medikament(0.2),
    hyaluron(0.2),
    spuelung,
    pdt,
    laser,
    ozon,
    psi,
    mmp8,
    keimtest,
    hba1c,
    zungenindex,
    gewohnheiten,
    ...periimplantitis,
  ],
  kontrolle: [
    untersuchung,
    beratungKasse,
    roentgen('Röntgen'),
    schleimhaut,
    spuelung,
    fluorid,
  ],
}

/** Roentgen-Varianten zur Auswahl von Hand. */
export const ROENTGEN_WAHL: { nr: string; label: string }[] = [
  { nr: 'Ä925a', label: 'Rö2 (bis 2 Aufnahmen)' },
  { nr: 'Ä925b', label: 'Rö5 (bis 5 Aufnahmen)' },
  { nr: 'Ä925c', label: 'Rö8 (bis 8 Aufnahmen)' },
  { nr: 'Ä925d', label: 'Röntgenstatus' },
  { nr: 'Ä935d', label: 'OPG' },
]

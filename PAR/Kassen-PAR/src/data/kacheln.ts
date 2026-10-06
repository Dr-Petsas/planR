// Leistungs-Kacheln je Terminart (nach dem UPT-Planer-Prototyp, Nummern und
// Punktzahlen korrigiert: BEMA aus dem MAS-Katalog, GOZ aus der amtlichen
// Tabelle).
//
// stufe:  kern    = Kassenleistung des Termins, standardmaessig an
//         begleit = Kassen-Begleitleistung (Anaesthesie, Roentgen, 108)
//         zusatz  = private Zusatzleistung (GOZ/GOAE, nur Modus "BEMA + Zusatz")
// Der Regler schaltet erst Begleit-, dann Zusatz-Kacheln zu, jeweils die
// wertvollste zuerst.

import type { TerminArt, UptModul } from '../types'

/** Wie oft eine Position im Termin anfaellt (Grundlage: Zaehne des Termins). */
export type MengenRegel =
  | 'eins' // einmal je Sitzung (nur wenn der Termin Zaehne hat bzw. immer bei Sitzungsleistungen)
  | 'sitzung' // einmal je Sitzung, unabhaengig von Zaehnen
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
  | { anteil: number } // Anteil der behandelten Zaehne (aufgerundet, mind. 1)

export type GebSystem = 'BEMA' | 'GOZ' | 'GOÄ' | 'ANALOG'

export interface KachelPos { sys: GebSystem; nr: string; menge: MengenRegel }

export type Stufe = 'kern' | 'begleit' | 'zusatz'

export interface Kachel {
  id: string
  label: string
  stufe: Stufe
  /** standardmaessig an (Kern immer; Begleit z. B. Anaesthesie bei AIT) */
  standard: boolean
  pos: KachelPos[]
  modul?: UptModul // UPT-Kernleistung nur, wenn das Modul im Termin vorgesehen ist
  nurMitModul?: UptModul // Kachel nur anbieten, wenn Modul im Termin
  hinweis?: string
}

const k = (
  id: string, label: string, stufe: Stufe, pos: KachelPos[], extra: Partial<Kachel> = {},
): Kachel => ({ id, label, stufe, standard: stufe === 'kern', pos, ...extra })

const B = (nr: string, menge: MengenRegel = 'sitzung'): KachelPos => ({ sys: 'BEMA', nr, menge })
const G = (nr: string, menge: MengenRegel = 'sitzung'): KachelPos => ({ sys: 'GOZ', nr, menge })
const A = (nr: string, menge: MengenRegel = 'sitzung'): KachelPos => ({ sys: 'GOÄ', nr, menge })
const AN = (nr: string, menge: MengenRegel = 'sitzung'): KachelPos => ({ sys: 'ANALOG', nr, menge })

// Gemeinsame Kacheln -----------------------------------------------------------

const infiltration = (standard: boolean) =>
  k('infiltration', 'Infiltrationsanästhesie', 'begleit', [B('40', 'infiltration')], {
    standard, hinweis: 'Oberkiefer: jeder zweite Zahn je zusammenhängender Gruppe',
  })
const leitung = (standard: boolean) =>
  k('leitung', 'Leitungsanästhesie', 'begleit', [B('41a', 'leitung')], {
    standard, hinweis: 'Unterkiefer: eine je Seite mit behandelten Zähnen',
  })
const einschleifen = k('einschleifen', 'Einschleifen (108)', 'begleit', [B('108')], {
  hinweis: 'nicht neben konservierenden, prothetischen oder chirurgischen Leistungen',
})
const roentgen = (id: string, label: string, standard = false, extra: Partial<Kachel> = {}) =>
  k(id, label, 'begleit', [B('ROE', 'roentgen')], {
    standard, hinweis: 'Rö2 / Rö5 / Rö8 / Status / OPG nach Zahl der betroffenen Zähne', ...extra,
  })
const oberflaeche = k('oberflaeche', 'Oberflächenanästhesie', 'zusatz', [G('0080', 'haelften')], {
  hinweis: 'privat, je Kieferhälfte bzw. Frontzahnbereich',
})
const spuelung = k('spuelung', 'Antiseptische Taschenspülung', 'zusatz', [G('4020')])
const medikament = (anteil: number) =>
  k('medikament', 'Lokale Medikamentenapplikation', 'zusatz', [G('4025', { anteil })], {
    hinweis: `je Zahn, vorgeschlagen für ${Math.round(anteil * 100)} % der behandelten Zähne`,
  })
const keimtest = k('keimtest', 'Keimbestimmung (Abstrich)', 'zusatz', [A('298')], { hinweis: 'Laborkosten gesondert' })
const mmp8 = k('mmp8', 'aMMP-8-Test', 'zusatz', [AN('mmp8')])
const fluorid = k('fluorid', 'Fluoridierung', 'zusatz', [G('1020')])
const zunge = k('zunge', 'Zungenreinigung', 'zusatz', [AN('zungenreinigung')])
const gewohnheiten = k('gewohnheiten', 'Beratung schädliche Gewohnheiten (Rauchstopp)', 'zusatz', [G('6190')])
const pdt = [
  k('pdt', 'Photodynamische Therapie', 'zusatz', [AN('pdt1', 'eins'), AN('pdtw', 'ohneErsten')]),
]

// Katalog --------------------------------------------------------------------

export const KATALOG: Record<TerminArt, Kachel[]> = {
  befund: [
    k('par4', 'Parodontalstatus (4)', 'kern', [B('4')]),
    roentgen('roentgen', 'Röntgen nach Befund', true),
    keimtest,
    mmp8,
  ],
  atg: [
    k('atg', 'Aufklärungs- und Therapiegespräch', 'kern', [B('ATG')]),
    k('mhu', 'Mundhygieneunterweisung', 'kern', [B('MHU')]),
    einschleifen,
    k('beratung', 'Eingehende Risikoberatung', 'zusatz', [A('3')], { hinweis: 'Ernährung, Allgemeinerkrankung, privat' }),
    gewohnheiten,
  ],
  pzr: [
    k('pzr', 'Professionelle Zahnreinigung', 'zusatz', [G('1040', 'alle')]),
    fluorid,
    k('sensibel', 'Behandlung überempfindlicher Zahnflächen', 'zusatz', [G('2010', 'kiefer')]),
    k('kanten', 'Beseitigung scharfer Zahnkanten', 'zusatz', [G('4030', 'haelften')]),
    zunge,
    oberflaeche,
  ],
  ait: [
    k('aita', 'AIT einwurzelig', 'kern', [B('AIT a', 'ein')]),
    k('aitb', 'AIT mehrwurzelig', 'kern', [B('AIT b', 'mehr')]),
    infiltration(true),
    leitung(true),
    einschleifen,
    oberflaeche,
    spuelung,
    medikament(0.3),
    ...pdt,
    k('schienung', 'Parodontale Schienung', 'zusatz', [AN('schienung', 'eins')], { hinweis: 'je Interdentalraum – Menge eintragen' }),
  ],
  bev: [
    k('beva', 'Befundevaluation nach AIT', 'kern', [B('BEV a')]),
    roentgen('roentgen', 'Röntgen-Kontrolle'),
    keimtest,
    mmp8,
  ],
  cpt: [
    k('cpta', 'CPT einwurzelig', 'kern', [B('CPT a', 'ein')]),
    k('cptb', 'CPT mehrwurzelig', 'kern', [B('CPT b', 'mehr')]),
    infiltration(true),
    leitung(true),
    oberflaeche,
    k('knochen', 'Auffüllen von Knochendefekten', 'zusatz', [G('4110', { anteil: 0.25 })], { hinweis: 'je Zahn' }),
    k('membran', 'Membran (GTR)', 'zusatz', [G('4138', { anteil: 0.25 })], { hinweis: 'je Zahn' }),
    k('bgt', 'Bindegewebstransplantat', 'zusatz', [G('4133', 'eins')]),
    medikament(0.25),
  ],
  nachbehandlung: [
    k('nb111', 'Nachbehandlung (111)', 'kern', [B('111')]),
    spuelung,
  ],
  bevb: [
    k('bevb', 'Befundevaluation nach CPT', 'kern', [B('BEV b')]),
    roentgen('roentgen', 'Röntgen-Kontrolle'),
  ],
  upt: [
    k('upta', 'UPT a Mundhygienekontrolle', 'kern', [B('UPT a')], { modul: 'a' }),
    k('uptb', 'UPT b Mundhygieneunterweisung', 'kern', [B('UPT b')], { modul: 'b' }),
    k('uptc', 'UPT c Reinigung aller Zähne', 'kern', [B('UPT c', 'alle')], { modul: 'c' }),
    k('uptd', 'UPT d ST-/BOP-Messung', 'kern', [B('UPT d')], { modul: 'd' }),
    k('upte', 'UPT e subgingival einwurzelig', 'kern', [B('UPT e', 'ein')], { modul: 'e' }),
    k('uptf', 'UPT f subgingival mehrwurzelig', 'kern', [B('UPT f', 'mehr')], { modul: 'f' }),
    k('uptg', 'UPT g Parodontal-Untersuchung', 'kern', [B('UPT g')], { modul: 'g' }),
    roentgen('roentgen', 'Röntgen zu UPT g', false, { nurMitModul: 'g' }),
    infiltration(false),
    leitung(false),
    einschleifen,
    fluorid,
    zunge,
    medikament(0.2),
    spuelung,
    oberflaeche,
    mmp8,
    gewohnheiten,
    ...pdt,
  ],
  kontrolle: [],
}

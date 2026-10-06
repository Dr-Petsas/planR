/** Prothetische Implantat-Komponenten, deren Preis je System hinterlegt ist (Euro netto, Einzelzahn, Standardplattform) */
export type Komponente = 'abdruckpfosten' | 'scanbody' | 'laboranalog' | 'abutmentStandard' | 'tiBase' | 'schraube'

export const KOMPONENTEN: Record<Komponente, string> = {
  abdruckpfosten: 'Abformpfosten',
  scanbody: 'Scanbody',
  laboranalog: 'Laboranalog',
  abutmentStandard: 'Abutment konfektioniert (Titan)',
  tiBase: 'Klebebasis / Ti-Base',
  schraube: 'Prothetikschraube',
}

export interface Implantatsystem {
  id: string
  hersteller: string
  system: string
  preise: Record<Komponente, number>
  quelle: string
  stand: string
  /** ja = Listenpreise belegt, teilweise = einzelne Werte belegt, geschaetzt = Richtwerte */
  genau: 'ja' | 'teilweise' | 'geschaetzt'
}

type P = Record<Komponente, number>
const sys = (id: string, hersteller: string, system: string, preise: P, quelle: string, stand: string, genau: Implantatsystem['genau']): Implantatsystem =>
  ({ id, hersteller, system, preise, quelle, stand, genau })
const p = (abdruckpfosten: number, scanbody: number, laboranalog: number, abutmentStandard: number, tiBase: number, schraube: number): P =>
  ({ abdruckpfosten, scanbody, laboranalog, abutmentStandard, tiBase, schraube })

/** Listenpreise netto laut Herstellerkatalogen; „geschaetzt“ = keine öffentliche Preisliste gefunden */
const SYSTEME: Implantatsystem[] = [
  sys('straumann-bl', 'Straumann', 'Bone Level / BLT RC (BLX analog)', p(42, 40, 37, 156, 81, 27), 'https://www.straumann.com/content/dam/media-center/straumann/de-de/documents/manual/straumann_de500248_systemuebersicht_bone_level_implantat.pdf', '2026-01', 'ja'),
  sys('nobel-active', 'Nobel Biocare', 'NobelActive / NobelParallel CC RP', p(60, 75, 35, 175, 110, 30), 'geschätzt (Preise nur mit Login)', '2026-10', 'geschaetzt'),
  sys('astra-ev', 'Dentsply Sirona', 'Astra Tech Implant System EV', p(45, 105, 37, 142, 95, 21), 'https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/32672075-DE-2209%20Prosthetics%20product%20catalog_Preisliste_2307_LR.pdf', '2023-07', 'ja'),
  sys('ankylos', 'Dentsply Sirona', 'Ankylos C/X', p(61, 105, 37, 113, 97, 21), 'https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/32671089-DE-1905%20Ankylos%20Product%20Catalog_Preisliste_2307_LR.pdf', '2023-07', 'ja'),
  sys('xive', 'Dentsply Sirona', 'Xive', p(87, 105, 34, 109, 95, 15), 'https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/32670052-DE-2006%20Xive%20Product%20Catalog_Preisliste_2307_LR.pdf', '2023-07', 'teilweise'),
  sys('camlog', 'Camlog', 'CAMLOG / CONELOG', p(46, 37, 20, 88, 71, 17), 'https://ebook.camlog.de/camlog/de/preisliste-camlog/', '2026-05', 'ja'),
  sys('zimmer-tsv', 'Zimmer Biomet', 'Tapered Screw-Vent / T3', p(55, 70, 30, 140, 90, 25), 'geschätzt', '2026-10', 'geschaetzt'),
  sys('biohorizons', 'BioHorizons', 'Tapered Internal', p(50, 60, 28, 120, 85, 22), 'geschätzt', '2026-10', 'geschaetzt'),
  sys('bego-semados', 'BEGO', 'Semados S/RSX', p(45, 36, 26, 95, 55, 19), 'https://security.bego.com/img/file/basic/me_800281_0014_so_de.pdf', '2022-06', 'teilweise'),
  sys('bredent-copasky', 'bredent medical', 'copaSKY', p(39.9, 46, 28.9, 74, 69, 24.9), 'https://bredent-group.com/wp-content/uploads/2026/02/Prospekt-copaSKY-ultrakurz_0099320D-20251106_web.pdf', '2025-12', 'teilweise'),
  sys('champions-revolution', 'Champions-Implants', '(R)Evolution', p(35, 25, 20, 25, 25, 7), 'Preisliste 01/2012, ca. +25 % hochgerechnet', '2012-01', 'teilweise'),
  sys('medentis-icx', 'medentis medical', 'ICX', p(39, 39, 19, 79, 39, 15), 'https://medentis.com/Downloads/epaper/produktkatalog-26/', '2026', 'teilweise'),
  sys('mis-c1', 'MIS (Dentsply Sirona)', 'C1 / V3 Conical Connection', p(56, 79, 37, 77, 79, 22), 'https://www.dentsplysirona.com/content/dam/flagship/de-de/explore/implants/kataloge-preislisten/MIS%20Gesamtpreisliste%20DE%2007_2023_LR.pdf', '2023-07', 'teilweise'),
  sys('neoss-proactive', 'Neoss', 'ProActive', p(55, 65, 30, 130, 85, 25), 'geschätzt (Preise nur mit Login)', '2026-10', 'geschaetzt'),
  sys('osstem-tsiii', 'Osstem', 'TSIII', p(40, 45, 20, 70, 50, 15), 'geschätzt', '2026-10', 'geschaetzt'),
  sys('megagen-anyridge', 'MegaGen', 'AnyRidge', p(45, 50, 22, 80, 60, 18), 'geschätzt', '2026-10', 'geschaetzt'),
  sys('thommen-element', 'Thommen Medical', 'SPI Element / Contact', p(75, 85, 35, 180, 110, 28), 'geschätzt', '2026-10', 'geschaetzt'),
  sys('sic-invent', 'SIC invent', 'SICace / SICmax', p(55, 61, 28, 90, 64, 17), 'https://www.zwp-online.info/files/241578/MA150-02_DE_Produktkatalog_2025-05-30.pdf', '2025-03', 'ja'),
  sys('dentaurum-tiologic', 'Dentaurum', 'tioLogic TWINFIT / ST', p(55, 60, 28, 110, 75, 20), 'geschätzt (Preise nur mit Login)', '2026-10', 'geschaetzt'),
  sys('implantdirect-legacy', 'Implant Direct', 'Legacy / InterActive', p(35, 40, 18, 60, 80, 15), 'US-Listenpreise umgerechnet, Rest geschätzt', '2026-10', 'teilweise'),
]

const mittel = (k: Komponente) => Math.round(SYSTEME.reduce((s, x) => s + x.preise[k], 0) / SYSTEME.length)

export const IMPLANTATSYSTEME: Implantatsystem[] = [
  sys('durchschnitt', 'Mittelwert', `System noch nicht gewählt (Ø aus ${SYSTEME.length} Systemen)`,
    p(mittel('abdruckpfosten'), mittel('scanbody'), mittel('laboranalog'), mittel('abutmentStandard'), mittel('tiBase'), mittel('schraube')),
    'Mittelwert der hinterlegten Systeme', '2026-10', 'geschaetzt'),
  ...SYSTEME,
]

export const implantatsystem = (id: string) => IMPLANTATSYSTEME.find((s) => s.id === id) ?? IMPLANTATSYSTEME[0]

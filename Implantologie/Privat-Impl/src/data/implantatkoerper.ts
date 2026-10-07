// Chirurgische Implantatkomponenten je System: Implantatkörper,
// Verschlussschraube/Deckschraube und Gingivaformer. Netto-Einkaufspreise.
// Stil wie implantatsysteme.ts im Privat-ZE-Planer. Die Prothetikteile
// (Abutment, Ti-Base …) bleiben im ZE-Planer.

export type Teil = 'koerper' | 'deckschraube' | 'gingivaformer'

export const TEILE: Record<Teil, string> = {
  koerper: 'Implantatkörper (enossal)',
  deckschraube: 'Verschluss-/Deckschraube',
  gingivaformer: 'Gingivaformer (Einheilkappe)',
}

export interface Implantatkoerper {
  id: string
  hersteller: string
  system: string
  preise: Record<Teil, number>
  quelle: string
  stand: string
  genau: 'ja' | 'teilweise' | 'geschaetzt'
}

type P = Record<Teil, number>
const p = (koerper: number, deckschraube: number, gingivaformer: number): P => ({ koerper, deckschraube, gingivaformer })
const sys = (id: string, hersteller: string, system: string, preise: P, quelle: string, stand: string, genau: Implantatkoerper['genau']): Implantatkoerper =>
  ({ id, hersteller, system, preise, quelle, stand, genau })

const SYSTEME: Implantatkoerper[] = [
  sys('straumann-bl', 'Straumann', 'Bone Level / BLT RC', p(290, 18, 40), 'Straumann Systemübersicht 2026-01', '2026-01', 'teilweise'),
  sys('nobel-active', 'Nobel Biocare', 'NobelActive / Parallel CC', p(300, 25, 55), 'geschätzt (Login)', '2026-10', 'geschaetzt'),
  sys('astra-ev', 'Dentsply Sirona', 'Astra Tech EV', p(260, 21, 50), 'Dentsply Preisliste 2023-07', '2023-07', 'teilweise'),
  sys('camlog', 'Camlog', 'CAMLOG / CONELOG', p(210, 17, 37), 'CAMLOG Preisliste 2026-05', '2026-05', 'teilweise'),
  sys('medentis-icx', 'medentis medical', 'ICX', p(79, 0, 29), 'medentis Produktkatalog 2026 (All-in-Konzept)', '2026', 'teilweise'),
  sys('bego-semados', 'BEGO', 'Semados S/RSX', p(180, 19, 36), 'BEGO Katalog 2022-06', '2022-06', 'geschaetzt'),
  sys('bredent-copasky', 'bredent medical', 'copaSKY', p(150, 24.9, 35), 'bredent copaSKY 2025-12', '2025-12', 'geschaetzt'),
  sys('mis-c1', 'MIS', 'C1 / V3', p(140, 20, 34), 'MIS Preisliste 2023-07', '2023-07', 'geschaetzt'),
  sys('osstem-tsiii', 'Osstem', 'TSIII', p(95, 0, 25), 'geschätzt', '2026-10', 'geschaetzt'),
  sys('megagen-anyridge', 'MegaGen', 'AnyRidge', p(120, 15, 30), 'geschätzt', '2026-10', 'geschaetzt'),
]

const mittel = (k: Teil) => Math.round(SYSTEME.reduce((s, x) => s + x.preise[k], 0) / SYSTEME.length)

export const IMPLANTATKOERPER: Implantatkoerper[] = [
  sys('durchschnitt', 'Mittelwert', `System noch nicht gewählt (Ø aus ${SYSTEME.length} Systemen)`,
    p(mittel('koerper'), mittel('deckschraube'), mittel('gingivaformer')),
    'Mittelwert der hinterlegten Systeme', '2026-10', 'geschaetzt'),
  ...SYSTEME,
]

export const implantatkoerper = (id: string) => IMPLANTATKOERPER.find((s) => s.id === id) ?? IMPLANTATKOERPER[0]

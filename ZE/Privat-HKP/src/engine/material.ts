/**
 * Kronenmaterial: Legierungen und Keramikrohlinge je Einheit mit mittleren Marktpreisen (netto).
 * Edelmetall wird nach Gewicht × Tagespreis am Verarbeitungstag abgerechnet (§ 10 Abs. 2 Nr. 5 GOZ) –
 * hier steht eine Schätzung aus mittlerem Verbrauch und mittlerem Tagespreis.
 * BEL II: NEM ist mit den Leistungen abgegolten (L-Nr. 970 0), edelmetallhaltige Legierungen sind
 * zusätzlich berechenbar. BEB: Legierungen und Rohlinge werden gesondert berechnet.
 */

export type Werkstoff = 'nem' | 'goldreduziert' | 'hochgold' | 'zirkon' | 'presskeramik' | 'lithiumdisilikat'
export type Werkstoffart = 'metall' | 'keramik'
export type Einheit = 'krone' | 'teilkrone' | 'verblendkrone' | 'glied' | 'anker' | 'teleskop' | 'sekundaerteleskop' | 'veneer'

export interface WerkstoffInfo {
  titel: string
  kurz: string
  art: Werkstoffart
  /** Metall: € je Gramm; Keramik: € je Einheit (anteiliger Rohling) */
  preis: number
  /** Metall: Gewicht relativ zur Hochgoldlegierung (Dichte) */
  dichte?: number
  quelle: string
}

export const MATERIAL_STAND = '05.10.2026'

export const WERKSTOFFE: Record<Werkstoff, WerkstoffInfo> = {
  nem: {
    titel: 'NEM-Legierung (Kobalt-Chrom)', kurz: 'NEM', art: 'metall', preis: 0.85, dichte: 0.5,
    quelle: 'Wirobond C/SG/280, Remanium 2000+/2001: 0,58–1,00 €/g',
  },
  goldreduziert: {
    titel: 'Goldreduzierte Edelmetalllegierung', kurz: 'Gold reduziert', art: 'metall', preis: 105, dichte: 0.82,
    quelle: 'C.Hafner Aurumed, DiGOLD Nettogold, Wegold Eco-SG: 86–114 €/g',
  },
  hochgold: {
    titel: 'Hochgoldlegierung (Au ≥ 75 %)', kurz: 'Hochgold', art: 'metall', preis: 140, dichte: 1,
    quelle: 'Tagespreise Trendgold, DiGOLD, Wegold, C.Hafner, Goldquadrat: 113–166 €/g (Feingold ca. 119 €/g)',
  },
  zirkon: {
    titel: 'Zirkonoxid', kurz: 'Zirkon', art: 'keramik', preis: 15,
    quelle: 'Multilayer-Ronden 85–205 € netto, anteilig 12–18 € je Einheit',
  },
  presskeramik: {
    titel: 'Presskeramik (Lithiumdisilikat, z. B. e.max Press)', kurz: 'Presskeramik', art: 'keramik', preis: 17.5,
    quelle: 'IPS e.max Press Rohling 15,29–19,47 € je Stück',
  },
  lithiumdisilikat: {
    titel: 'Lithiumdisilikat gefräst (z. B. e.max CAD)', kurz: 'LiSi CAD', art: 'keramik', preis: 29.5,
    quelle: 'IPS e.max CAD Block 28,47–30,67 € je Stück',
  },
}

export const EINHEIT_TITEL: Record<Einheit, string> = {
  krone: 'Krone', teilkrone: 'Teilkrone', verblendkrone: 'Verblendkrone (Gerüst)', glied: 'Brückenglied',
  anker: 'Klebebrückenanker', teleskop: 'Teleskop', sekundaerteleskop: 'Sekundärteleskop', veneer: 'Veneer',
}

/** mittlerer Legierungsverbrauch in Gramm bei Hochgold, je Einheit */
const GRAMM: Record<Einheit, number> = {
  krone: 2.5, teilkrone: 1.8, verblendkrone: 1.5, glied: 3, anker: 1.2, teleskop: 3.5, sekundaerteleskop: 2, veneer: 0,
}

/** BEL-Einheiten, für die der NEM-Verarbeitungsaufwand (L-Nr. 970 0) angesetzt ist */
const NEM_AUFWAND_BEL = new Set(['1021', '1022', '1024', '1100'])

/** Laborpositionen, die eine Einheit mit Legierung bzw. Keramik festlegen */
const EINHEITEN: Record<string, { art: Werkstoffart; einheit: Einheit }> = {
  'BEL 1021': { art: 'metall', einheit: 'krone' },
  'BEL 1022': { art: 'metall', einheit: 'teilkrone' },
  'BEL 1024': { art: 'metall', einheit: 'verblendkrone' },
  'BEL 1100': { art: 'metall', einheit: 'glied' },
  'BEL 1200': { art: 'metall', einheit: 'teleskop' },
  'BEL 1201': { art: 'metall', einheit: 'sekundaerteleskop' },
  'BEB 2101': { art: 'metall', einheit: 'krone' },
  'BEB 2104': { art: 'metall', einheit: 'teilkrone' },
  'BEB 2121': { art: 'metall', einheit: 'verblendkrone' },
  'BEB 2126': { art: 'metall', einheit: 'teilkrone' },
  'BEB 2155': { art: 'metall', einheit: 'anker' },
  'BEB 2361': { art: 'metall', einheit: 'glied' },
  'BEB 3001': { art: 'metall', einheit: 'teleskop' },
  'BEB 2281': { art: 'keramik', einheit: 'krone' },
  'BEB 2251': { art: 'keramik', einheit: 'krone' },
  'BEB 2252': { art: 'keramik', einheit: 'krone' },
  'BEB 2351': { art: 'keramik', einheit: 'glied' },
  'BEB 2534': { art: 'keramik', einheit: 'teilkrone' },
  'BEB 2653': { art: 'keramik', einheit: 'veneer' },
}

export const WERKSTOFFE_FUER: Record<Werkstoffart, Werkstoff[]> = {
  metall: ['nem', 'goldreduziert', 'hochgold'],
  keramik: ['zirkon', 'presskeramik', 'lithiumdisilikat'],
}

export interface LaborEinheit {
  zahn: string
  ebene: string
  nr: string
  labor?: string
}

export interface KronenEinheit {
  zahn: string
  art: Werkstoffart
  einheit: Einheit
  ebene: 'BEL' | 'BEB'
  nr: string
  labor?: string
}

/** Einheiten mit Kronenmaterial je Zahn aus den Laborpositionen (erste festlegende Position je Zahn) */
export function kronenEinheiten(positionen: readonly LaborEinheit[]): KronenEinheit[] {
  const out = new Map<string, KronenEinheit>()
  for (const p of positionen) {
    const nr = p.nr.replace(/\s/g, '')
    const e = EINHEITEN[`${p.ebene} ${nr}`]
    const zahn = p.zahn.trim()
    if (!e || !/^\d\d$/.test(zahn) || out.has(zahn)) continue
    out.set(zahn, { zahn, ...e, ebene: p.ebene as 'BEL' | 'BEB', nr, labor: p.labor })
  }
  return [...out.values()].sort((a, b) => a.zahn.localeCompare(b.zahn))
}

export function standardWerkstoff(e: Pick<KronenEinheit, 'art' | 'einheit'>): Werkstoff {
  if (e.art === 'metall') return 'nem'
  return e.einheit === 'teilkrone' || e.einheit === 'veneer' ? 'presskeramik' : 'zirkon'
}

/** gewählter Werkstoff, sofern er zur Einheit passt – sonst der Standard */
export function werkstoffVon(e: KronenEinheit, wahl: Readonly<Record<string, Werkstoff>>): { werkstoff: Werkstoff; gewaehlt: boolean } {
  const w = wahl[e.zahn]
  return w && WERKSTOFFE_FUER[e.art].includes(w) ? { werkstoff: w, gewaehlt: true } : { werkstoff: standardWerkstoff(e), gewaehlt: false }
}

export interface MaterialZeile {
  zahn: string
  werkstoff: Werkstoff
  /** Gramm (Metall) bzw. 1 Einheit (Keramik) */
  menge: number
  einzel: number
  betrag: number
  text: string
  labor?: string
}

export interface MaterialErgebnis {
  zeilen: MaterialZeile[]
  /** BEL-Einheiten mit Edelmetall, an denen der NEM-Verarbeitungsaufwand (L-Nr. 970 0) entfällt */
  edelmetallBel: number
  /** Zähne mit Edelmetall an BEL-Leistungen (im Härtefall nicht von der Kasse getragen) */
  edelmetallKasse: string[]
  hinweise: string[]
}

const runden = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const zahl = (n: number, s = 2) => n.toLocaleString('de-DE', { minimumFractionDigits: s, maximumFractionDigits: s })

/** geschätzte Menge und Kosten einer Einheit */
export function materialSchaetzung(e: Pick<KronenEinheit, 'einheit'>, w: Werkstoff): { menge: number; betrag: number } {
  const info = WERKSTOFFE[w]
  if (info.art === 'keramik') return { menge: 1, betrag: info.preis }
  const menge = Math.round(GRAMM[e.einheit] * (info.dichte ?? 1) * 10 + 1e-9) / 10
  return { menge, betrag: runden(menge * info.preis) }
}

export function materialErmitteln(positionen: readonly LaborEinheit[], wahl: Readonly<Record<string, Werkstoff>>): MaterialErgebnis {
  const zeilen: MaterialZeile[] = []
  const offen: string[] = []
  const edelBel: string[] = []
  let nemAufwand = 0
  const lisiGlied: string[] = []
  for (const e of kronenEinheiten(positionen)) {
    const { werkstoff: w, gewaehlt } = werkstoffVon(e, wahl)
    const info = WERKSTOFFE[w]
    if (!gewaehlt) offen.push(`${e.zahn} ${info.kurz}`)
    if (e.einheit === 'glied' && (w === 'presskeramik' || w === 'lithiumdisilikat') && /[678]$/.test(e.zahn)) lisiGlied.push(e.zahn)
    if (e.ebene === 'BEL' && w === 'nem') continue
    if (e.ebene === 'BEL' && info.art === 'metall') {
      edelBel.push(e.zahn)
      if (NEM_AUFWAND_BEL.has(e.nr)) nemAufwand++
    }
    const { menge, betrag } = materialSchaetzung(e, w)
    zeilen.push({
      zahn: e.zahn, werkstoff: w, menge, einzel: info.preis, betrag, labor: e.labor,
      text: info.art === 'metall'
        ? `${info.titel}, ${EINHEIT_TITEL[e.einheit]}: ca. ${zahl(menge, 1)} g à ${zahl(info.preis)} €/g (mittlerer Tagespreis)`
        : `${info.titel}, ${EINHEIT_TITEL[e.einheit]}: Rohling anteilig (Mittelwert)`,
    })
  }
  const hinweise: string[] = []
  if (offen.length) hinweise.push(`Kronenmaterial nicht gewählt (${offen.join(', ')}) – angenommen und mit Mittelwert berechnet. Unter „Kronenmaterial“ festlegen.`)
  if (edelBel.length) hinweise.push(`Edelmetall statt NEM an ${edelBel.join(', ')}: Legierung wird zusätzlich berechnet${nemAufwand ? ', der NEM-Verarbeitungsaufwand (BEL 970 0) entfällt dort' : ''}; im Härtefall übernimmt die Kasse nur NEM.`)
  if (zeilen.some((z) => z.werkstoff === 'goldreduziert' || z.werkstoff === 'hochgold'))
    hinweise.push(`Edelmetall geschätzt mit mittlerem Verbrauch und Tagespreis (Stand ${MATERIAL_STAND}) – abgerechnet werden Gewicht und Tagespreis am Verarbeitungstag (§ 10 Abs. 2 Nr. 5 GOZ).`)
  if (lisiGlied.length) hinweise.push(`Lithiumdisilikat-Brückenglied an ${lisiGlied.join(', ')}: nur bis zum zweiten Prämolaren freigegeben – im Molarenbereich Zirkonoxid wählen.`)
  return { zeilen, edelmetallBel: nemAufwand, edelmetallKasse: edelBel, hinweise }
}

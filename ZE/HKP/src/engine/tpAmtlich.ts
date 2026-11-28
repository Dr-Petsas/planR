import { OBERKIEFER, UNTERKIEFER } from './zahnschema'

/**
 * Laborweg, wenn das amtliche Therapiekürzel mehrere BEB-Wege hat.
 * Vollanatomie bleibt unverblendet (2251/2252, 2351/2352). Ein Zirkon-Primärteleskop
 * behält den Keramikzuschlag 6905; die vollverblendete Variante zusätzlich 2602.
 */
export type LaborWeg = 'vollanatomisch' | 'zirkon-teleskop' | 'zirkon-teleskop-verblendet'

const IMPLANTAT_BEFUND = new Set(['i', 'ix', 'sk', 'skw', 'sb', 'sbw', 'se', 'sew', 'so', 'sow', 'st', 'stw'])

function reiheVon(zahn: string) {
  return zahn[0] === '1' || zahn[0] === '2' ? OBERKIEFER : UNTERKIEFER
}

function implantKuerzel(code: string) {
  const k = code.trim().toUpperCase()
  return k === 'ZAS' || k === 'STZ' || k === 'STZV' || k.startsWith('S')
}

/** Internes Planungskürzel → amtliches Kürzel der Zeile TP (Anlage 15a BMV-Z). */
export function tpAmtlich(code: string, implantGlied = false): string {
  const k = code.trim().toUpperCase()
  if (k === 'ZA') return 'KM'
  if (k === 'ZAS') return 'SKM'
  if (k === 'ZAB') return implantGlied ? 'SBM' : 'BM'
  if (k === 'TZ' || k === 'TZV') return 'TM'
  if (k === 'STZ' || k === 'STZV') return 'STM'
  return code.trim()
}

export function laborWeg(code: string): LaborWeg | undefined {
  const k = code.trim().toUpperCase()
  if (k === 'ZA' || k === 'ZAS' || k === 'ZAB') return 'vollanatomisch'
  if (k === 'TZV' || k === 'STZV') return 'zirkon-teleskop-verblendet'
  if (k === 'TZ' || k === 'STZ') return 'zirkon-teleskop'
  return undefined
}

/** BEB zur Planung. Ohne Laborweg gilt die Tabelle des amtlichen Kürzels. */
export function bebDerPlanung(k: string, standard: readonly string[], labor?: LaborWeg): string[] {
  if (labor === 'vollanatomisch' && (k === 'KM' || k === 'SKM' || k === 'ZA' || k === 'ZAS')) return ['2251']
  if (labor === 'vollanatomisch' && (k === 'BM' || k === 'SBM' || k === 'ZAB')) return ['2351']
  if (labor === 'zirkon-teleskop' && (k === 'TM' || k === 'STM' || k === 'TZ' || k === 'STZ')) return ['3001', '6905']
  if (labor === 'zirkon-teleskop-verblendet' && (k === 'TM' || k === 'STM' || k === 'TZV' || k === 'STZV')) return ['3001', '6905', '2602']
  return [...standard]
}

/** Frontzahn: unverblendete Vollanatomie trägt die Frontposition, nicht die Seitenzahnposition. */
export function bebFront(k: string, b: string, front: boolean, labor?: LaborWeg): string {
  if (!front) return b
  const krone = k === 'ZA' || k === 'ZAS' || (labor === 'vollanatomisch' && (k === 'KM' || k === 'SKM'))
  const glied = k === 'ZAB' || (labor === 'vollanatomisch' && (k === 'BM' || k === 'SBM'))
  if (krone && b === '2251') return '2252'
  if (glied && b === '2351') return '2352'
  return b
}

/**
 * Schreibt amtliche Kürzel in Zeile TP. Der Laborweg bleibt am Zahn, damit eine
 * unverblendete Vollanatomie und ein Zirkon-Primärteleskop nicht wie die verblendete
 * Keramik abgerechnet werden. Schon amtliche Kürzel bleiben stehen.
 */
export function planungAmtlich<T extends { B?: string; TP?: string; labor?: LaborWeg }>(zaehne: Record<string, T>): Record<string, T> {
  const tp = (z: string) => (zaehne[z]?.TP ?? '').trim().toUpperCase()
  const aus: Record<string, T> = {}
  for (const [z, zahn] of Object.entries(zaehne)) {
    const roh = tp(z)
    if (!roh) { aus[z] = zahn; continue }
    const reihe = reiheVon(z)
    const i = reihe.indexOf(z)
    const nachbar = [reihe[i - 1], reihe[i + 1]].some((n) => !!n && implantKuerzel(tp(n)))
    const befund = (zahn.B ?? '').trim().toLowerCase()
    const implantGlied = roh === 'ZAB' && (nachbar || IMPLANTAT_BEFUND.has(befund))
    const neu = tpAmtlich(zahn.TP ?? '', implantGlied)
    const weg = zahn.labor ?? laborWeg(roh)
    if (neu === (zahn.TP ?? '') && weg === zahn.labor) { aus[z] = zahn; continue }
    aus[z] = { ...zahn, TP: neu, ...(weg ? { labor: weg } : {}) }
  }
  return aus
}

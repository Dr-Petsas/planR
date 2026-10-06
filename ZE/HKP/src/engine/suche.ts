import type { Ebene, Position } from '../types'
import { belNrAnzeige, type Listen } from './berechnung'
import { TP_ZUORDNUNG } from './regeln'
import { IMPLANTAT_TP } from './implantat'
import { THERAPIE_KUERZEL } from './zahnschema'
import { mitDigital } from './digital'

export type VorschlagPosition = Pick<Position, 'ebene' | 'nr'> & { anzahl?: number; labor?: Position['labor'] }

/** GOZ 9050 je Implantat: Abformung und Eingliederung (höchstens dreimal je Implantat) */
const AUFBAU_WECHSEL: VorschlagPosition = { ebene: 'GOZ', nr: '9050', anzahl: 2 }

export interface Vorschlag {
  key: string
  art: 'kuerzel' | 'position'
  /** Kürzel bzw. „Ebene Nr.“ */
  titel: string
  text: string
  positionen: VorschlagPosition[]
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

function kuerzelVorschlaege(q: string): Vorschlag[] {
  const gross = q.trim().toUpperCase()
  const klein = q.trim().toLowerCase()
  const treffer = Object.entries(THERAPIE_KUERZEL)
    .filter(([k, text]) => TP_ZUORDNUNG[k] && (k.startsWith(gross) || (klein.length >= 3 && text.toLowerCase().includes(klein))))
    .sort(([a], [b]) => Number(b === gross) - Number(a === gross) || Number(b.startsWith(gross)) - Number(a.startsWith(gross)) || a.length - b.length || a.localeCompare(b))
  return treffer.flatMap(([k, text]) => {
    const z = TP_ZUORDNUNG[k]
    const weitere = [...(IMPLANTAT_TP.test(k) ? [AUFBAU_WECHSEL] : []), ...z.beb.map((nr): VorschlagPosition => ({ ebene: 'BEB', nr }))]
    const v: Vorschlag[] = [{
      key: `k-${k}`, art: 'kuerzel', titel: k, text,
      positionen: [...(z.goz ? [{ ebene: 'GOZ' as const, nr: z.goz }] : []), ...weitere],
    }]
    if (z.gozAnker) {
      v.push({ key: `k-${k}-anker`, art: 'kuerzel', titel: `${k} als Brückenanker`, text, positionen: [{ ebene: 'GOZ', nr: z.gozAnker }, ...weitere] })
    }
    return v
  })
}

function positionsVorschlaege(q: string, listen: Listen): Vorschlag[] {
  const n = norm(q)
  const t = q.trim().toLowerCase()
  const quellen: [Ebene, { nr: string; text: string }[]][] = [
    ['BEMA', listen.bema?.eintraege ?? []],
    ['GOZ', listen.goz?.eintraege ?? []],
    ['BEL', listen.bel?.eintraege ?? []],
    ['BEB', listen.beb?.eintraege ?? []],
  ]
  const treffer: { v: Vorschlag; rang: number }[] = []
  for (const e of mitDigital(listen.eigen)) {
    const nr = norm(e.nr)
    const rang = nr === n ? 0 : nr.startsWith(n) ? 1 : t.length >= 3 && e.text.toLowerCase().includes(t) ? 2 : -1
    if (rang < 0 || !e.nr) continue
    treffer.push({
      rang,
      v: { key: `p-EIGEN-${e.nr}`, art: 'position', titel: `Eigenlabor ${e.nr}`, text: e.text, positionen: [{ ebene: 'BEB', nr: e.nr, labor: 'eigen' }] },
    })
  }
  for (const [ebene, eintraege] of quellen) {
    for (const e of eintraege) {
      const nr = norm(e.nr)
      const rang = nr === n ? 0 : nr.startsWith(n) ? 1 : t.length >= 3 && e.text.toLowerCase().includes(t) ? 2 : -1
      if (rang < 0) continue
      treffer.push({
        rang,
        v: {
          key: `p-${ebene}-${e.nr}`, art: 'position', titel: `${ebene} ${ebene === 'BEL' ? belNrAnzeige(e.nr) : e.nr}`, text: e.text,
          positionen: [ebene === 'GOZ' && e.nr === '9050' ? AUFBAU_WECHSEL : { ebene, nr: e.nr }],
        },
      })
    }
  }
  return treffer.sort((a, b) => a.rang - b.rang).map((x) => x.v)
}

/** Vorschläge für die Positionssuche: Therapiekürzel (als Leistungspaket) und Einzelpositionen aller Listen. */
export function vorschlaege(q: string, listen: Listen, max = 30): Vorschlag[] {
  if (!q.trim()) return []
  return [...kuerzelVorschlaege(q), ...positionsVorschlaege(q, listen)].slice(0, max)
}

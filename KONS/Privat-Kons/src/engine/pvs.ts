import { kostenvoranschlag, pvsZahn, r2, type PvsPlan, type PvsPosition } from '../pvsplan'
import type { Plan, Rechnung, Zeile } from '../types'
import { MWST_NR } from './listen'

const NR = /^[0-9A-Za-zÄä.-]{1,6}$/

/** Eine Zeile der Kons-Rechnung als Position fürs Praxisprogramm; MwSt.-Zeilen gehen nur in die Laborsumme ein. */
export function pvsPosition(z: Zeile, zahn = z.zahn): PvsPosition | null {
  if (z.anzahl <= 0 || z.einzel < 0 || z.nr === MWST_NR) return null
  const basis = { zahn: pvsZahn(zahn), anzahl: z.anzahl, einzelpreis: z.einzel, betrag: z.summe }
  switch (z.ebene) {
    case 'GOZ': case 'ANALOG': case 'ZUSCHLAG':
      if (!NR.test(z.nr)) return null
      return { ebene: 'GOZ', nr: z.nr, ...basis, faktor: z.faktor ?? 1, ...(z.ebene === 'ANALOG' ? { bezeichnung: z.text.slice(0, 300) } : {}) }
    case 'GOAE': {
      const nr = z.nr.replace(/^Ä/, '')
      return NR.test(nr) ? { ebene: 'GOAE', nr, ...basis, faktor: z.faktor ?? 1 } : null
    }
    case 'MAT':
      return { ebene: 'MAT', ...basis, labor: 'eigen', bezeichnung: z.text.slice(0, 300) }
    case 'LABOR': {
      const beb = z.nr.match(/^BEB (\d{4})$/)
      const eigen = /\(Praxis [^)]+\)$/.test(z.text)
      if (z.nr === 'Mat.') return { ebene: 'MAT', ...basis, labor: 'eigen', bezeichnung: z.text.slice(0, 300) }
      return { ebene: beb ? 'BEB' : 'LABOR', ...(beb ? { nr: beb[1] } : {}), ...basis, labor: eigen ? 'eigen' : 'fremd', bezeichnung: z.text.slice(0, 300) }
    }
  }
  return null
}

/** Laborsumme brutto (zahntechnische Leistungen mit MwSt., Material) aus den Zeilen. */
export const laborBrutto = (zeilen: Zeile[]) => r2(zeilen.filter((z) => z.ebene === 'LABOR' || z.ebene === 'MAT').reduce((s, z) => s + z.summe, 0))

/** Privat-Kons als Kostenvoranschlag (Art Konservierend); der Befund bleibt der aktuelle aus DS-Win. */
export function pvsPlaene(plan: Plan, r: Rechnung): PvsPlan[] {
  const zeilen = [...r.zaehne.flatMap((z) => z.zeilen.map((x) => ({ ...x, zahn: x.zahn ?? z.zahn }))), ...r.begleit, ...r.frei]
  const positionen = zeilen.map((z) => pvsPosition(z)).filter((p): p is PvsPosition => p !== null)
  if (!positionen.some((p) => p.ebene === 'GOZ' || p.ebene === 'GOAE')) return []
  return [kostenvoranschlag({ art: 'KO', titel: `PlanR Kons ${plan.nummer}`, datum: plan.datum, positionen, laborBrutto: laborBrutto(zeilen) })]
}

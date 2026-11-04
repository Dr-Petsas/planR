import { kostenvoranschlag, pvsArt, type PvsPlan, type PvsPosition } from '../pvsplan'
import type { Plan, Rechnung, Zeile } from '../types'
import { begruendungText } from './begruendung'
import { grenzen } from './kb'

const NR = /^[0-9A-Za-zÄÖÜäöü.-]{1,6}$/

/**
 * Eine Zeile des KB-Plans als Position fürs Praxisprogramm. MwSt. wie im Planer: Laborleistungen und Labormaterial
 * aus dem XML mit `mwstSatz`, Praxismaterial ohne; Rabatte (negativer Preis) bleiben nur in der Laborsumme.
 */
export function pvsPosition(z: Zeile, mwstSatz = 0): PvsPosition | null {
  if (z.anzahl <= 0 || z.einzel < 0) return null
  const basis = { zahn: '', anzahl: z.anzahl, einzelpreis: z.einzel, betrag: z.summe }
  const bezeichnung = z.text.slice(0, 300)
  const begr = (z.ebene === 'GOZ' || z.ebene === 'GOAE') && (z.faktor ?? 0) > grenzen(z).schwelle ? { begruendung: begruendungText(z) } : {}
  if (z.ebene === 'GOZ') {
    if (!NR.test(z.nr)) return null
    return {
      ebene: 'GOZ', nr: z.nr, ...basis, faktor: z.faktor ?? 1, art: pvsArt(z.bemessung ?? z.nr, 'ZE'),
      ...(z.bemessung ? { bezeichnung } : {}), ...begr,
    }
  }
  if (z.ebene === 'GOAE') return NR.test(z.nr) ? { ebene: 'GOAE', nr: z.nr, ...basis, faktor: z.faktor ?? 1, art: pvsArt(z.nr, 'ZE'), ...begr } : null
  if (z.ebene === 'MATERIAL') return { ebene: 'MAT', ...basis, labor: z.ausXml ? 'fremd' : 'eigen', bezeichnung, mwst: z.ausXml ? mwstSatz : 0 }
  return {
    ...(/^\d{4}$/.test(z.nr) ? { ebene: 'BEB' as const, nr: z.nr } : { ebene: 'LABOR' as const }),
    ...basis, labor: 'fremd', bezeichnung, mwst: mwstSatz,
  }
}

/** Privat-KB (Schienen, Funktionsdiagnostik) als Kostenvoranschlag: jede GOZ- und Laborzeile einzeln. */
export function pvsPlaene(plan: Plan, r: Rechnung): PvsPlan[] {
  const positionen = [...r.honorar, ...r.labor].map((z) => pvsPosition(z, r.mwstSatz)).filter((p): p is PvsPosition => p !== null)
  if (!positionen.some((p) => p.ebene === 'GOZ')) return []
  return [kostenvoranschlag({ art: 'ZE', titel: `PlanR Schiene ${plan.nummer}`, datum: plan.datum, positionen, laborBrutto: r.summeLabor + r.mwst })]
}

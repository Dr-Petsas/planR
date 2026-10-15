import { befundZeile, kostenvoranschlag, pvsArt, pvsZahn, r2, type PvsPlan, type PvsPosition } from '../pvsplan'
import type { Plan } from '../types'
import type { Kalkulation, Zeile } from './berechnung'

const NR = /^[0-9A-Za-zÄä.-]{1,6}$/

/** Privat-ZE als Kostenvoranschlag im Praxisprogramm: GOZ einzeln, Labor und Material als Summe (wie DS-Win). */
export function pvsPlaene(plan: Plan, kalk: Kalkulation): PvsPlan[] {
  const gueltig = (z: Zeile) => z.anzahl > 0 && z.einzel >= 0
  const labor = (z: Zeile): PvsPosition => ({
    ...(z.ebene === 'BEB' && /^\d{4}$/.test(z.nr) ? { ebene: 'BEB', nr: z.nr } : z.ebene === 'BEB' ? { ebene: 'LABOR' } : { ebene: 'MAT' }),
    zahn: pvsZahn(z.zahn), anzahl: z.anzahl, einzelpreis: z.einzel, betrag: z.betrag,
    labor: z.eigen ? 'eigen' : 'fremd', ...(z.eigen && z.ebene === 'MAT' ? { eigen: z.eigen } : {}), bezeichnung: z.text.slice(0, 300),
  })
  const positionen: PvsPosition[] = [
    ...kalk.honorar.filter((z) => gueltig(z) && NR.test(z.nr)).map((z): PvsPosition => ({
      ebene: 'GOZ', nr: z.nr, zahn: pvsZahn(z.zahn), anzahl: z.anzahl, faktor: z.faktor, einzelpreis: z.einzel, betrag: z.betrag,
      art: pvsArt(z.nr, 'ZE'),
    })),
    ...kalk.labor.filter(gueltig).map(labor),
    // Praxismaterial (ohne MwSt.) zählt zu Material und Labor der Praxis.
    ...kalk.material.filter(gueltig).map((z) => ({ ...labor(z), ebene: 'MAT' as const, labor: 'eigen' as const })),
  ]
  if (!positionen.some((p) => p.ebene === 'GOZ')) return []
  return [kostenvoranschlag({
    art: 'ZE', titel: `PlanR Privat-ZE ${plan.nummer}`, datum: plan.datum, positionen,
    laborBrutto: r2(kalk.summeLaborNetto + kalk.mwst + kalk.summeMaterial), zaehne: befundZeile(plan.zaehne),
  })]
}

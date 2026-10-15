import { befundZeile, kostenvoranschlag, pvsArt, pvsZahn, r2, type PvsPlan, type PvsPosition } from '../pvsplan'
import type { Plan } from '../types'
import type { Kalkulation, Zeile } from './berechnung'

const NR = /^[0-9A-Za-zÄä.-]{1,6}$/

/** Implantologie als Kostenvoranschlag im Praxisprogramm: GOZ und GOÄ einzeln, Material und Labor als Summe. */
export function pvsPlaene(plan: Plan, kalk: Kalkulation): PvsPlan[] {
  const gueltig = (z: Zeile) => z.anzahl > 0 && z.einzel >= 0
  // Analogleistungen tragen die Nummer der Vergleichsleistung; DS-Win führt sie als „NNNNa“.
  const honorar = (ebene: 'GOZ' | 'GOAE') => (z: Zeile): PvsPosition => ({
    ebene, nr: z.analog ? `${z.nr}a` : z.nr, zahn: pvsZahn(z.zahn), anzahl: z.anzahl, ...(z.faktor ? { faktor: z.faktor } : {}),
    einzelpreis: z.einzel, betrag: z.betrag, art: ebene === 'GOAE' ? 'IM' : pvsArt(z.nr, 'IM'),
    ...(z.analog ? { bezeichnung: z.text.slice(0, 300) } : {}),
    // Bei Analogleistungen ist `begruendung` die PKV-Einschätzung aus dem Katalog, keine Faktorbegründung.
    ...(!z.analog && z.begruendung?.trim() ? { begruendung: z.begruendung.trim() } : {}),
  })
  const positionen: PvsPosition[] = [
    ...kalk.honorarGoz.filter((z) => gueltig(z) && NR.test(z.nr)).map(honorar('GOZ')),
    ...kalk.honorarGoae.filter((z) => gueltig(z) && NR.test(z.nr)).map(honorar('GOAE')),
    ...kalk.labor.filter(gueltig).map((z): PvsPosition => ({
      ...(/^\d{4}$/.test(z.nr) ? { ebene: 'BEB' as const, nr: z.nr } : { ebene: 'LABOR' as const }),
      zahn: pvsZahn(z.zahn), anzahl: z.anzahl, einzelpreis: z.einzel, betrag: z.betrag,
      labor: z.eigen ? 'eigen' : 'fremd', bezeichnung: z.text.slice(0, 300), mwst: kalk.mwstSatz,
    })),
    // Implantatteile und Material kauft die Praxis ein: Eigenanteil der Praxis an Material und Labor.
    ...kalk.material.filter(gueltig).map((z): PvsPosition => ({
      ebene: 'MAT', zahn: pvsZahn(z.zahn), anzahl: z.anzahl, einzelpreis: z.einzel, betrag: z.betrag, labor: 'eigen', bezeichnung: z.text.slice(0, 300),
      mwst: kalk.mwstSatz,
    })),
  ]
  if (!positionen.some((p) => p.ebene === 'GOZ' || p.ebene === 'GOAE')) return []
  return [kostenvoranschlag({
    art: 'IM', titel: `PlanR Implantologie ${plan.nummer}`, datum: plan.datum, positionen,
    laborBrutto: r2(kalk.summeMaterialNetto + kalk.summeLaborNetto + kalk.mwst), zaehne: befundZeile(plan.zaehne),
  })]
}

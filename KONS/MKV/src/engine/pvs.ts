import { datumIso, kostenvoranschlag, laborTeilen, pvsZahn, r2, type PvsPlan, type PvsPosition } from '../pvsplan'
import { bemaFuer } from '../data/katalog'
import type { Plan, Rechnung, ZahnErgebnis, Zeile } from '../types'
import { MWST_LABOR, MWST_NR } from './listen'

const NR = /^[0-9A-Za-zÄä.-]{1,6}$/

function position(z: Zeile, zahn = z.zahn): PvsPosition | null {
  if (z.anzahl <= 0 || z.einzel < 0 || z.nr === MWST_NR) return null
  const basis = { zahn: pvsZahn(zahn), anzahl: z.anzahl, einzelpreis: z.einzel, betrag: z.summe }
  if (z.ebene === 'GOZ' || z.ebene === 'ANALOG') {
    if (!NR.test(z.nr)) return null
    return {
      ebene: 'GOZ', nr: z.nr, ...basis, faktor: z.faktor ?? 1, ...(z.ebene === 'ANALOG' ? { bezeichnung: z.text.slice(0, 300) } : {}),
      ...(z.begruendung?.trim() ? { begruendung: z.begruendung.trim() } : {}),
    }
  }
  if (z.ebene !== 'LABOR') return null
  if (z.nr === 'Mat.') return { ebene: 'MAT', ...basis, labor: 'eigen', bezeichnung: z.text.slice(0, 300), mwst: 0 }
  const beb = z.nr.match(/^BEB (\d{4})$/)
  const eigen = /\(Praxis [^)]+\)$/.test(z.text)
  return {
    ebene: beb ? 'BEB' : 'LABOR', ...(beb ? { nr: beb[1] } : {}), ...basis, labor: eigen ? 'eigen' : 'fremd',
    bezeichnung: z.text.slice(0, 300), mwst: MWST_LABOR,
  }
}

const positionen = (zeilen: Zeile[]) => zeilen.map((z) => position(z)).filter((p): p is PvsPosition => p !== null)
const laborBrutto = (zeilen: Zeile[]) => r2(zeilen.filter((z) => z.ebene === 'LABOR').reduce((s, z) => s + z.summe, 0))

/** Kürzel im DS-Win-Befund (Therapieplanung): Werkstoff und Flächen der Mehrkostenfüllung. */
function symbol(plan: Plan, z: ZahnErgebnis): string | undefined {
  const n = Math.min(4, Math.max(1, z.flaechen))
  if (z.therapie === 'komposit' || z.therapie === 'mehrfarben') return `F${n}`
  if (z.therapie === 'goldhaemmer') return `I${n}`
  if (z.therapie === 'inlay') return (plan.zaehne[z.zahn]?.labor ?? 'keramik') === 'gold' ? `I${n}` : `Y${n}`
  return undefined
}

/**
 * Füllungs-MKV fürs Praxisprogramm: Zähne mit Mehrkosten als Mehrkostenvereinbarung (Hauptleistung „…mk“,
 * BEMA 13a–d als Kassenanteil), Austauschfüllungen und Leistungen nach § 8 Abs. 7 BMV-Z als Kostenvoranschlag.
 */
export function pvsPlaene(plan: Plan, r: Rechnung): PvsPlan[] {
  const mkv = r.zaehne.filter((z) => z.kasse && z.mehrkosten > 0)
  const plaene: PvsPlan[] = []
  if (mkv.length) {
    const zeilen: PvsPosition[] = []
    for (const z of mkv) {
      const [haupt, ...rest] = z.zeilen
      const h = position(haupt, z.zahn)
      if (h) zeilen.push({ ...h, mkv: true })
      const bema = bemaFuer(z.flaechen)
      zeilen.push({
        ebene: 'BEMA', nr: bema.nr, zahn: z.zahn, anzahl: 1, einzelpreis: z.kassenanteil, betrag: z.kassenanteil,
        punkte: bema.punkte, punktwert: r.punktwert,
      })
      zeilen.push(...positionen(rest.map((x) => ({ ...x, zahn: x.zahn ?? z.zahn }))))
    }
    zeilen.push(...positionen(r.begleit))
    const labZeilen = [...mkv.flatMap((z) => z.zeilen), ...r.begleit]
    const brutto = laborBrutto(labZeilen)
    const labor = laborTeilen(zeilen.filter((p) => p.ebene === 'BEB' || p.ebene === 'MAT' || p.ebene === 'LABOR'), brutto)
    const honorar = r2(zeilen.filter((p) => p.ebene === 'GOZ').reduce((s, p) => s + p.betrag, 0))
    const kasse = r2(zeilen.filter((p) => p.ebene === 'BEMA').reduce((s, p) => s + p.betrag, 0))
    const zaehne: NonNullable<PvsPlan['zaehne']> = {}
    for (const z of mkv) {
      const tp = symbol(plan, z)
      if (tp) zaehne[z.zahn] = { TP: tp }
    }
    plaene.push({
      format: 'planr-plan', version: 1, planart: 'mkv', art: 'KO', titel: `PlanR Füllungs-MKV ${plan.nummer}`.slice(0, 120),
      datum: datumIso(plan.datum), zaehne, positionen: zeilen,
      summen: { honorar, ...labor, gesamt: r2(honorar - kasse + labor.laborEigen + labor.laborFremd) },
    })
  }

  // Austausch intakter Füllungen (keine Mehrkostenregelung) und § 8 Abs. 7: komplett privat; ohne MKV-Zahn auch die Begleitleistungen.
  const austausch = r.zaehne.filter((z) => !z.kasse).flatMap((z) => z.zeilen.map((x) => ({ ...x, zahn: x.zahn ?? z.zahn })))
  const privat = [...austausch, ...r.privat7, ...(mkv.length || !austausch.length ? [] : r.begleit)]
  const kva = positionen(privat)
  if (kva.some((p) => p.ebene === 'GOZ')) {
    plaene.push(kostenvoranschlag({
      art: 'KO', titel: `PlanR Privatvereinbarung § 8 Abs. 7 BMV-Z ${plan.nummer}`, datum: plan.datum, positionen: kva, laborBrutto: laborBrutto(privat),
    }))
  }
  return plaene
}

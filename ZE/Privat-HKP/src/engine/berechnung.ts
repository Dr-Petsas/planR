import gozDaten from '../data/goz-2012.json'
import bebDaten from '../data/beb-itz-2024.json'
import type { Anpassung, Einstellungen, ListenEintrag, Plan, Position } from '../types'
import { planen } from './planung'
import { standardBegruendung } from './begruendung'
import { LABOR_AUFSCHLAG_MAX, LABOR_AUFSCHLAG_MIN, zusatzleistungen } from './zusatz'
import { eigenFinden } from './eigenlabor'
import { mitDigital } from './digital'
import { materialErmitteln } from './material'

export const GOZ_PUNKTWERT = gozDaten.punktwert
export const GOZ: Map<string, ListenEintrag> = new Map((gozDaten.eintraege as ListenEintrag[]).map((e) => [e.nr, e]))
export const BEB: Map<string, ListenEintrag> = new Map((bebDaten.eintraege as ListenEintrag[]).map((e) => [e.nr, e]))
export const BEB_NAME = bebDaten.name

export const SCHWELLENWERT = 2.3
export const HOECHSTSATZ = 3.5

export interface Zeile extends Position {
  text: string
  einzel: number
  betrag: number
  faktor?: number
  punkte?: number
  /** Nummer der praxiseigenen Laborposition, die Preis und Text liefert */
  eigen?: string
}

export interface Kalkulation {
  honorar: Zeile[]
  labor: Zeile[]
  material: Zeile[]
  summeHonorar: number
  summeLaborNetto: number
  mwst: number
  summeMaterial: number
  gesamt: number
  hinweise: string[]
  nichtAngesetzt: string[]
}

export const runden = (x: number) => Math.round(x * 100) / 100

export function gozEinzel(nr: string, faktor: number) {
  return runden((GOZ.get(nr)?.punkte ?? 0) * GOZ_PUNKTWERT * faktor)
}

/** Positionen aus Planung + Reglern + Anpassungen + manuellen Einträgen zusammenführen */
export function positionen(plan: Plan): { positionen: Position[]; hinweise: string[]; nichtAngesetzt: string[] } {
  const { positionen: auto, hinweise } = planen(plan.zaehne, plan.abformung, plan.implantat, plan.abformungProthese ?? '')
  const r = plan.regler
  const zusatz = zusatzleistungen({
    zaehne: plan.zaehne, abformung: plan.abformung, basis: [...auto, ...plan.manuell],
    gozStufe: r.gozStufe, laborStufe: r.laborStufe, aus: r.aus,
  })
  const entfernt = new Set(plan.entfernt)
  const anpassen = (ps: Position[]) => ps.filter((p) => !entfernt.has(p.id)).map((p) => ({ ...p, ...(plan.anpassungen[p.id] as Anpassung | undefined) }))
  const angepasst = anpassen([...auto, ...zusatz.positionen])
  const mat = materialErmitteln([...angepasst, ...plan.manuell].filter((p) => p.ebene === 'BEB'), plan.werkstoffe ?? {})
  const material = anpassen(mat.zeilen.map((z): Position => ({
    id: `mat:${z.zahn}`, ebene: 'MAT', nr: '', zahn: z.zahn, anzahl: z.menge, preis: z.einzel, text: z.text, auto: true, material: true,
  })))
  return { positionen: [...angepasst, ...plan.manuell, ...material], hinweise: [...hinweise, ...mat.hinweise], nichtAngesetzt: zusatz.nichtAngesetzt }
}

/** Plan ohne Reglerwirkung – Vergleichsbasis für die Differenzen in der Kostenleiste */
export const ohneRegler = (plan: Plan): Plan => ({ ...plan, regler: { gozStufe: 0, gozFaktor: 0, laborStufe: 0, laborAufschlag: 0, aus: [] } })

export function kalkulieren(plan: Plan, e: Einstellungen): Kalkulation {
  const { positionen: alle, hinweise, nichtAngesetzt } = positionen(plan)
  const standardFaktor = plan.regler.gozFaktor > 0 ? plan.regler.gozFaktor : e.gozFaktor
  const aufschlag = Math.min(Math.max(plan.regler.laborAufschlag, LABOR_AUFSCHLAG_MIN), LABOR_AUFSCHLAG_MAX)
  const honorar: Zeile[] = []
  const labor: Zeile[] = []
  const material: Zeile[] = []
  for (const p of alle) {
    if (p.ebene === 'GOZ') {
      const eintrag = GOZ.get(p.nr)
      const faktor = p.faktor ?? standardFaktor
      const einzel = gozEinzel(p.nr, faktor)
      if (!eintrag) hinweise.push(`GOZ ${p.nr} ist im Gebührenverzeichnis nicht vorhanden.`)
      if (faktor > HOECHSTSATZ) hinweise.push(`GOZ ${p.nr}: Faktor ${faktor.toFixed(1).replace('.', ',')} über 3,5 erfordert eine schriftliche Vereinbarung nach § 2 GOZ vor Behandlungsbeginn.`)
      honorar.push({
        ...p, faktor, einzel, punkte: eintrag?.punkte,
        text: p.text || eintrag?.text || '–',
        begruendung: faktor > SCHWELLENWERT ? p.begruendung || standardBegruendung(p.nr) : undefined,
        betrag: runden(einzel * p.anzahl),
      })
    } else if (p.ebene === 'BEB') {
      const eigen = eigenFinden(mitDigital(e.eigenlabor), p.nr)
      if (eigen) {
        const einzel = runden(p.preis ?? eigen.preis)
        labor.push({ ...p, eigen: eigen.nr, einzel, text: p.text || eigen.text, betrag: runden(einzel * p.anzahl) })
        continue
      }
      const eintrag = BEB.get(p.nr)
      const einzel = runden(p.preis ?? (eintrag?.preis ?? 0) * (1 + aufschlag / 100))
      if (!eintrag && p.preis === undefined) hinweise.push(`BEB ${p.nr} ist in der Laborpreisliste nicht vorhanden – Preis bitte eintragen.`)
      labor.push({ ...p, einzel, text: p.text || eintrag?.text || '–', betrag: runden(einzel * p.anzahl) })
    } else {
      const einzel = runden(p.preis ?? 0)
      ;(p.material ? labor : material).push({ ...p, einzel, text: p.text || 'Material', betrag: runden(einzel * p.anzahl) })
    }
  }
  const sortieren = (a: Zeile, b: Zeile) => Number(!!a.material) - Number(!!b.material) || a.nr.localeCompare(b.nr) || a.zahn.localeCompare(b.zahn)
  honorar.sort(sortieren)
  labor.sort(sortieren)
  const summe = (z: Zeile[]) => runden(z.reduce((s, x) => s + x.betrag, 0))
  const summeHonorar = summe(honorar)
  const summeLaborNetto = summe(labor)
  const mwst = runden(summeLaborNetto * e.mwst / 100)
  const summeMaterial = summe(material)
  return {
    honorar, labor, material, summeHonorar, summeLaborNetto, mwst, summeMaterial,
    gesamt: runden(summeHonorar + summeLaborNetto + mwst + summeMaterial),
    hinweise,
    nichtAngesetzt,
  }
}

export const euro = (x: number) => x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

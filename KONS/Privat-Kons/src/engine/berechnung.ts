import type { Einstellungen, GruppeMeta, GruppePosition, Kalkulation, Leistungsgruppe, Plan, Position } from '../types'
import { GOZ_PUNKTWERT, gozPunkte, runden } from './listen'
import { planen } from './planung'
import { MATERIAL_KLASSE_FAKTOR } from '../data/material'

export const euro = (x: number) =>
  x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

const materialFaktor = (klasse: number) => MATERIAL_KLASSE_FAKTOR[klasse] ?? 1

// Materialklasse steckt im Plan (Regler), nicht in Einstellungen – deshalb wird
// sie der Einzelbetrags-Funktion separat übergeben.
function einzelMit(pos: Position, einst: Einstellungen, materialKlasse: number): number {
  if (pos.preis !== undefined && pos.preis !== null) return runden(pos.preis)
  if (pos.ebene === 'GOZ') return runden(gozPunkte(pos.nr) * GOZ_PUNKTWERT * (pos.faktor ?? einst.gozFaktor))
  if (pos.ebene === 'MAT') {
    const m = einst.materialPreise.find((x) => x.id === pos.nr)
    return runden((m?.preis ?? 0) * materialFaktor(materialKlasse))
  }
  return runden(einst.kassenanteile[pos.nr] ?? 0)
}

/** Effektive Positionen: Auto-Positionen minus Entfernte plus manuelle, mit Anpassungen. */
export function effektivePositionen(plan: Plan): { positionen: Position[]; gruppen: GruppeMeta[] } {
  const { positionen, gruppen } = planen(plan)
  const entfernt = new Set(plan.entfernt)
  const anpM = new Map(plan.anpassungen.map((a) => [a.key, a]))

  const auto = positionen
    .filter((p) => !entfernt.has(p.key))
    .map((p) => {
      const a = anpM.get(p.key)
      if (!a) return p
      return {
        ...p,
        anzahl: a.anzahl ?? p.anzahl,
        faktor: a.faktor ?? p.faktor,
        preis: a.preis ?? p.preis,
        begruendung: a.begruendung ?? p.begruendung,
      }
    })

  const alle = [...auto, ...plan.manuell]
  const gruppenAlle = [...gruppen]
  if (plan.manuell.length && !gruppenAlle.some((g) => g.key === 'manuell')) {
    gruppenAlle.push({ key: 'manuell', titel: 'Weitere vereinbarte Leistungen', kategorie: 'manuell', art: 'verlangen' })
  }
  return { positionen: alle, gruppen: gruppenAlle }
}

export function kalkulieren(plan: Plan, einst: Einstellungen): Kalkulation {
  const { positionen, gruppen } = effektivePositionen(plan)
  const klasse = plan.regler.materialKlasse
  const hinweise: string[] = []

  const nachGruppe = new Map<string, Position[]>()
  for (const p of positionen) {
    const arr = nachGruppe.get(p.gruppe) ?? []
    arr.push(p)
    nachGruppe.set(p.gruppe, arr)
  }

  const ergebnis: Leistungsgruppe[] = []
  for (const meta of gruppen) {
    const pos = nachGruppe.get(meta.key) ?? []
    if (!pos.length) continue

    const gpos: GruppePosition[] = pos.map((p) => {
      const einzel = einzelMit(p, einst, klasse)
      return {
        key: p.key,
        ebene: p.ebene,
        nr: p.nr,
        text: p.text ?? p.nr,
        anzahl: p.anzahl,
        faktor: p.ebene === 'GOZ' ? (p.faktor ?? einst.gozFaktor) : undefined,
        einzel,
        summe: runden(einzel * p.anzahl),
        kassen: p.ebene === 'BEMA',
      }
    })

    const gozSumme = runden(gpos.filter((p) => !p.kassen).reduce((s, p) => s + p.summe, 0))
    const kassenanteil = runden(gpos.filter((p) => p.kassen).reduce((s, p) => s + p.summe, 0))

    let mehrkosten: number
    let modellHinweis: string | undefined

    if (meta.kategorie === 'fuellung') {
      const m = plan.regler.fuellungModell
      if (m === 'pauschal') {
        mehrkosten = runden(plan.regler.fuellungPauschale)
        modellHinweis = `Pauschale ${euro(plan.regler.fuellungPauschale)} je Füllung`
      } else if (m === 'proFlaeche') {
        const f = meta.flaechen ?? 1
        mehrkosten = runden(f * plan.regler.fuellungProFlaeche)
        modellHinweis = `${f} × ${euro(plan.regler.fuellungProFlaeche)} je Fläche`
      } else {
        mehrkosten = runden(Math.max(0, gozSumme - kassenanteil))
        modellHinweis = `GOZ ${euro(gozSumme)} − Kasse ${euro(kassenanteil)}`
      }
    } else if (meta.art === 'verlangen') {
      mehrkosten = gozSumme
    } else {
      mehrkosten = runden(Math.max(0, gozSumme - kassenanteil))
    }

    ergebnis.push({
      key: meta.key,
      zahn: meta.zahn,
      titel: meta.titel,
      kategorie: meta.kategorie,
      art: meta.art,
      positionen: gpos,
      gozSumme,
      kassenanteil,
      mehrkosten,
      modellHinweis,
      begruendung: meta.begruendung,
    })
  }

  const gozGesamt = runden(ergebnis.reduce((s, g) => s + g.gozSumme, 0))
  const kassenGesamt = runden(ergebnis.reduce((s, g) => s + g.kassenanteil, 0))
  const mehrkostenGesamt = runden(ergebnis.reduce((s, g) => s + g.mehrkosten, 0))

  if (ergebnis.some((g) => g.kategorie === 'fuellung') && plan.regler.fuellungModell !== 'gozDifferenz') {
    hinweise.push('Füllungs-Mehrkosten als Praxispauschale/pro Fläche vereinbart (nicht GOZ-Differenz).')
  }
  if (ergebnis.some((g) => g.art === 'verlangen')) {
    hinweise.push('Verlangensleistungen (§ 1 Abs. 2, § 2 Abs. 3 GOZ) werden komplett privat berechnet.')
  }

  return { gruppen: ergebnis, gozGesamt, kassenGesamt, mehrkostenGesamt, hinweise }
}

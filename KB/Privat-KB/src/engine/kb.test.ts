import { describe, expect, it } from 'vitest'
import { rechnen, vorlageAnwenden } from './kb'
import { gozPunkte, GOZ_PUNKTWERT } from './listen'
import { VORLAGEN } from '../data/katalog'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import type { Plan } from '../types'

const einst = STANDARD_EINSTELLUNGEN
const planMit = (vorlage: string): Plan => {
  const p = neuerPlan('T-1', einst)
  return { ...p, positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === vorlage)!.pos) }
}

describe('GOZ-Liste', () => {
  it('kennt die Punkte aus Abschnitt H und J', () => {
    expect(gozPunkte('7010')).toBe(800)
    expect(gozPunkte('7000')).toBe(270)
    expect(gozPunkte('8000')).toBe(500)
    expect(gozPunkte('7070')).toBe(90)
    expect(GOZ_PUNKTWERT).toBeCloseTo(0.0562421, 7)
  })
})

describe('Privat-KB-Rechnung', () => {
  it('rechnet die adjustierte Aufbissschiene zum 2,3-fachen Satz', () => {
    const r = rechnen(planMit('michigan'), einst)
    const schiene = r.honorar.find((z) => z.nr === '7010')!
    expect(schiene.einzel).toBe(103.49)
    expect(r.summeHonorar).toBe(103.49)
    // Labor aus der Laborliste: 3 Modelle à 10,40, Dublieren 21,33, Mittelwert 14,75, Schiene 110,70, 2 × Desinfektion 1,80
    expect(r.summeLabor).toBe(181.58)
    expect(r.gesamt).toBe(285.07)
    expect(r.warnungen).toEqual([])
  })

  it('Funktionsanalyse folgt dem eigenen Faktor', () => {
    const p = planMit('fal')
    const r = rechnen({ ...p, regler: { ...p.regler, faFaktor: 3.0 } }, einst)
    expect(r.honorar.find((z) => z.nr === '8000')!.einzel).toBe(84.36)
    expect(r.honorar.find((z) => z.nr === '0040')!.faktor).toBe(2.3)
    expect(r.begruendung.map((z) => z.nr)).toEqual(['8000'])
  })

  it('Praxispreis schlägt die Laborliste, die Preisstufe verschiebt nur Listenpreise', () => {
    const p = planMit('tiefzieh')
    const e = { ...einst, laborPreise: { '7601': 60 } }
    const r = rechnen({ ...p, regler: { ...p.regler, laborKlasse: 2 } }, e)
    expect(r.labor.find((z) => z.nr === '7601')!.einzel).toBe(72)
  })

  it('warnt bei Laborposition ohne Preis', () => {
    const r = rechnen(planMit('knirscher'), einst)
    expect(r.labor.find((z) => z.nr === '7604')!.ohnePreis).toBe(true)
    expect(r.warnungen.length).toBe(1)
  })

  it('Faktor über 3,5 landet in der Vereinbarung nach § 2 GOZ', () => {
    const p = planMit('kontrolle')
    const r = rechnen({ ...p, regler: { ...p.regler, faktor: 4 } }, einst)
    expect(r.vereinbarung2.map((z) => z.nr)).toEqual(['7040', '7050'])
  })

  it('Vorlagen zählen gleiche Positionen zusammen', () => {
    const v = VORLAGEN.find((x) => x.id === 'kontrolle')!.pos
    const pos = vorlageAnwenden(vorlageAnwenden([], v), v)
    expect(pos.find((x) => x.nr === '7040')!.anzahl).toBe(4)
    expect(pos.length).toBe(2)
  })
})

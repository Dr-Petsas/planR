import { describe, expect, it } from 'vitest'
import type { Preisliste } from '../types'
import { eigenlaborMischen, praxisGozListe, type PraxisKatalog } from './praxiskatalog'
import { leererPlan } from './plan'
import { berechnen } from '../engine/berechnung'
import { vorschlaege } from '../engine/suche'

const GOZ: Preisliste<'goz'> = {
  id: 'goz-2012', typ: 'goz', name: 'GOZ', gueltigAb: '2012-01-01', punktwert: 0.0562421, standard: true,
  eintraege: [{ nr: '2210', text: 'Vollkrone', punkte: 1678 }, { nr: '2150', text: 'Inlay einflächig', punkte: 1141 }],
}
const K: PraxisKatalog = {
  pvs: 'DS-Win', stand: '2026-10-12T08:00:00.000Z', listeName: 'Hauslabor',
  eigenlabor: [{ nr: '0002', text: 'Modell Haus', preis: 11, ersetzt: '0002' }, { nr: 'M2', text: 'Bio Herador N', preis: 61.2 }],
  goz: [
    { nr: '2210', text: 'Vollkrone', punkte: 1678, eigen: false, kuerzel: 'K2', faktor: 3.5 },
    { nr: '2060mk', text: 'Komposit MKV', punkte: 527, eigen: true, druckNr: '2060' },
    { nr: 'vm001', text: 'Anästhetikum', punkte: 0, eigen: true, betrag: 1.85 },
  ],
  komplexe: [{ kuerzel: 'I1', text: 'Goldinlay einflächig', positionen: [{ ebene: 'GOZ', nr: '2150' }] }],
}

describe('Praxiskatalog im HKP-Planer', () => {
  const liste = praxisGozListe(GOZ, K)

  it('ergänzt die GOZ um Kürzel, Faktoren und eigene Positionen', () => {
    expect(liste).toMatchObject({ id: 'goz-praxis', standard: false, gueltigAb: '2012-01-01' })
    expect(liste.eintraege.map((e) => e.nr)).toEqual(['2210', '2150', '2060mk', 'vm001'])
    expect(liste.eintraege[0]).toMatchObject({ kuerzel: 'K2', faktor: 3.5 })
  })

  it('ersetzt Eigenlabor-Einträge aus dem PVS, eigene bleiben', () => {
    const neu = eigenlaborMischen([
      { nr: 'E1', text: 'eigene', preis: 5 }, { nr: '0002', text: 'von Hand', preis: 9 }, { nr: 'alt', text: 'aus PVS', preis: 1, quelle: 'pvs' },
    ], K)
    expect(neu.map((e) => [e.nr, e.quelle])).toEqual([['E1', undefined], ['0002', 'pvs'], ['M2', 'pvs']])
  })

  it('rechnet mit dem Praxisfaktor und festen Beträgen', () => {
    const plan = leererPlan()
    plan.positionen = [
      { id: 'a', ebene: 'GOZ', nr: '2210', zahn: '16', anzahl: 1 },
      { id: 'b', ebene: 'GOZ', nr: 'vm001', zahn: '', anzahl: 2 },
      { id: 'c', ebene: 'GOZ', nr: '2210', zahn: '26', anzahl: 1, faktor: 2.3 },
    ]
    const r = berechnen(plan, { goz: liste }).positionen
    expect(r.find((p) => p.id === 'a')).toMatchObject({ faktor: 3.5, einzelpreis: 330.31 })
    expect(r.find((p) => p.id === 'b')).toMatchObject({ einzelpreis: 1.85, betrag: 3.7 })
    expect(r.find((p) => p.id === 'c')?.faktor).toBe(2.3)
  })

  it('findet Praxis-Kürzel und Komplexe in der Suche', () => {
    const listen = { goz: liste, komplexe: K.komplexe }
    expect(vorschlaege('I1', listen)[0]).toMatchObject({ art: 'kuerzel', titel: 'I1', positionen: [{ ebene: 'GOZ', nr: '2150' }] })
    expect(vorschlaege('K2', listen).some((v) => v.titel === 'GOZ 2210 (K2)')).toBe(true)
  })
})

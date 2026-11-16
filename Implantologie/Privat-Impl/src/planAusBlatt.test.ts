import { describe, expect, it } from 'vitest'
import { planAusBlatt } from './planAusBlatt'
import { kalkulieren } from './engine/berechnung'
import { STANDARD_EINSTELLUNGEN } from './planNeu'
import blatt from './testdaten/blattImplantat.json'

/**
 * Vorfall 11/2026: Ein privater Implantat-Kostenvoranschlag aus einem Praxisprogramm (43 Zeilen, fünf Sitzungen)
 * landete im Planer für Zahnersatz, der GOÄ und die Beträge wegwarf. Der Beleg ist das, was der Leser heute liefert.
 */
describe('Plan aus einem eingelesenen Implantat-Kostenvoranschlag', () => {
  const plan = planAusBlatt(1, blatt.schema, blatt.positionen, STANDARD_EINSTELLUNGEN)
  const kalk = kalkulieren(plan, STANDARD_EINSTELLUNGEN)

  it('trägt den Befund ins Zahnschema ein', () => {
    expect(Object.keys(plan.zaehne)).toHaveLength(30)
    expect(plan.zaehne['15'].B).toBe('b')
    expect(plan.zaehne['26']).toEqual({ B: 'i', TP: '' })
  })

  it('trägt die Implantate als Planung ins Zahnschema ein, ohne die Leistungen zu verdoppeln', () => {
    const geplant = Object.keys(plan.zaehne).filter((z) => plan.zaehne[z].TP).sort()
    expect(geplant).toEqual(['11', '13', '15'])
    expect(plan.zaehne['13']).toEqual({ B: 'b', TP: 'I' })
    expect(kalk.honorarGoz.filter((z) => z.nr === '9010')).toHaveLength(1)
    expect(kalk.material.filter((z) => z.auto)).toHaveLength(0)
  })

  it('rechnet ein später nachgetragenes Implantat dazu', () => {
    const mehr = { ...plan, zaehne: { ...plan.zaehne, '14': { B: 'x', TP: 'I' } } }
    const neu = kalkulieren(mehr, STANDARD_EINSTELLUNGEN)
    expect(neu.honorarGoz.filter((z) => z.nr === '9010' && z.zahn === '14')).toHaveLength(1)
    expect(neu.gesamt).toBeGreaterThan(kalk.gesamt)
  })

  it('übernimmt jede Zeile und rechnet nichts dazu', () => {
    expect(plan.manuell).toHaveLength(43)
    expect(kalk.honorarGoz.length + kalk.honorarGoae.length + kalk.material.length + kalk.labor.length).toBe(43)
  })

  it('kommt auf die Summen des Blatts', () => {
    expect(Math.round((kalk.summeGoz + kalk.summeGoae) * 100) / 100).toBe(blatt.summen.honorarGoz)
    expect(Math.round((kalk.summeMaterialNetto + kalk.mwst) * 100) / 100).toBe(blatt.summen.labor)
    expect(kalk.gesamt).toBe(5114.57)
  })

  it('behält Sitzung, GOÄ und Analogleistung', () => {
    const analog = plan.manuell.find((p) => p.nr === '6000')
    expect(analog).toMatchObject({ ebene: 'GOZ', analog: true, basisEbene: 'GOZ', anzahl: 4, preis: 10.35, sitzung: 1 })
    expect(plan.manuell.filter((p) => p.ebene === 'GOAE' && p.nr === '5004').map((p) => p.sitzung)).toEqual([1, 2, 4])
  })

  it('lässt Ziffern aus dem Verzeichnis ohne festen Preis', () => {
    expect(plan.manuell.find((p) => p.nr === '9010')).toMatchObject({ faktor: 3.5, anzahl: 3 })
    expect(plan.manuell.find((p) => p.nr === '9010')?.preis).toBeUndefined()
  })
})

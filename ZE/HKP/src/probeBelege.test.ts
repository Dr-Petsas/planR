import { describe, expect, it } from 'vitest'
import { blattAusEinlesen, type BlattPosition, type BlattSummen } from '../../../Start/src/einlesenZeilen'
import { BELEGE } from '../../../Start/src/testdaten/belege'
import { berechnen, type Listen } from './engine/berechnung'
import { planAusSchema, zuschussAbgleich } from './probeImport'
import { blattUebernehmen, originalErgebnis } from './probeOriginal'
import { leererPlan } from './store/plan'
import { STANDARD_LISTEN } from './store/preislisten'

const l = (typ: string, id: string) => STANDARD_LISTEN.find((x) => x.typ === typ && x.id === id) as never
const LISTEN: Listen = { bema: l('bema', 'bema-2026'), goz: l('goz', 'goz-2012'), bel: l('bel2', 'bel2-bayern-2026'), beb: l('beb', 'beb-itz-2024'), fz: l('festzuschuss', 'fz-2026') }
const r = (n: number) => Math.round(n * 100) / 100

/** Der ganze Weg der Probe: drei Dateien einlesen, vereinen, Plan bauen, Blatt übernehmen. */
function probe(fall: string) {
  const schema: Record<'B' | 'R' | 'TP', Record<string, string>> = { B: {}, R: {}, TP: {} }
  const positionen: BlattPosition[] = []
  let summen: BlattSummen = {}
  for (const teil of ['teil1', 'teil2', 'beleg']) {
    const blatt = blattAusEinlesen(BELEGE[`${fall}_${teil}`].antwort)
    for (const art of ['B', 'R', 'TP'] as const) schema[art] = { ...blatt.schema[art], ...schema[art] }
    positionen.push(...blatt.positionen)
    summen = { ...blatt.summen, ...summen }
  }
  const gebaut = planAusSchema(leererPlan().einstellungen, schema, positionen)
  const abgleich = zuschussAbgleich(gebaut.plan, LISTEN, summen)
  const blatt = blattUebernehmen(abgleich.plan, LISTEN, positionen, summen)
  const ergebnis = originalErgebnis(berechnen(blatt.plan, LISTEN), blatt.original!)
  return { summen, hinweise: blatt.hinweise, ergebnis }
}

describe('Probe mit echten Blättern: alles vom Blatt, nichts gerechnet', () => {
  for (const fall of ['fall1', 'fall2', 'fall3']) {
    it(`${fall}: Summen und Zeilen stehen wie auf dem Blatt`, () => {
      const { summen, hinweise, ergebnis } = probe(fall)
      const s = ergebnis.summen
      expect(s.gozHonorar).toBe(summen.honorarGoz)
      expect(s.bemaHonorar).toBe(summen.honorarBema)
      expect(s.gesamt).toBe(summen.gesamt)
      expect(s.festzuschuss).toBe(summen.festzuschuss)
      expect(s.eigenanteil).toBe(summen.eigenanteil)
      const goz = ergebnis.positionen.filter((p) => p.ebene === 'GOZ')
      expect(r(goz.reduce((n, p) => n + p.betrag, 0))).toBe(summen.honorarGoz)
      expect(ergebnis.positionen.some((p) => 'fehler' in p && p.fehler)).toBe(false)
      expect(hinweise.filter((h) => h.includes('gegenlesen'))).toEqual([])
      expect(ergebnis.positionen.some((p) => p.bezeichnung?.includes('Nicht gelesene'))).toBe(false)
    })
  }

  it('fall1 und fall3: jede Zeile des Eigenbelegs steht einzeln im Plan, die Summe ist die des Belegs', () => {
    for (const fall of ['fall1', 'fall3']) {
      const { summen, ergebnis } = probe(fall)
      const labor = ergebnis.positionen.filter((p) => p.ebene !== 'GOZ' && p.ebene !== 'BEMA')
      expect(r(labor.reduce((n, p) => n + p.betrag, 0)), fall).toBe(summen.laborBeleg)
      expect(labor.map((p) => p.bezeichnung), fall).toEqual(expect.arrayContaining(['Zirkon', '3D- Modellscan zur Computerkonstruktion CAD CAM']))
      expect(labor.some((p) => p.bezeichnung?.startsWith('MwSt. 7 %')), fall).toBe(true)
    }
  })
})

describe('Gegenrechnung der gelesenen Summen', () => {
  const basis = () => {
    const blatt = blattAusEinlesen(BELEGE.fall1_teil2.antwort)
    return { plan: planAusSchema(leererPlan().einstellungen, BELEGE.fall1_teil1.erwartet.schema, blatt.positionen).plan, blatt }
  }
  it('meldet eine falsch gelesene GOZ-Zeile', () => {
    const { plan, blatt } = basis()
    const kaputt = blatt.positionen.map((p, i) => (i === 0 ? { ...p, betrag: 35 } : p))
    expect(blattUebernehmen(plan, LISTEN, kaputt, blatt.summen).hinweise.join(' ')).toContain('GOZ-Zeilen gegenlesen')
  })
  it('meldet Summen, die nicht zueinander passen', () => {
    const { plan, blatt } = basis()
    expect(blattUebernehmen(plan, LISTEN, blatt.positionen, { ...blatt.summen, gesamt: 1341 }).hinweise.join(' ')).toContain('Summen von Teil 2 gegenlesen')
    expect(blattUebernehmen(plan, LISTEN, blatt.positionen, { ...blatt.summen, eigenanteil: 1289.71 }).hinweise.join(' ')).toContain('als Eigenanteil')
  })
  it('bleibt still, wenn alles aufgeht', () => {
    const { plan, blatt } = basis()
    expect(blattUebernehmen(plan, LISTEN, blatt.positionen, blatt.summen).hinweise.filter((h) => h.includes('gegenlesen'))).toEqual([])
  })
})

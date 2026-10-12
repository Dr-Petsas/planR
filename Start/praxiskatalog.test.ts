import { describe, expect, it } from 'vitest'
import { aenderungen, katalogBilden, rohPruefen, unbekannte, wahlPruefen } from './praxiskatalog.ts'

const antwort = {
  pvs: 'DS-Win',
  listen: [
    { nr: 2, name: 'BEL II', mitPreis: [1, 0, 0, 0], art: 'BEL' },
    { nr: 3, name: 'BEB', mitPreis: [2, 1, 0, 0], art: 'BEB' }, { nr: 5, name: 'Hauslabor', mitPreis: [1, 0, 0, 0] },
  ],
  vorschlag: { liste: 5, spalte: 1, quelle: 'HKPs der Praxis' },
  vorschlagKasse: { liste: 2, spalte: 1, quelle: 'HKPs der Praxis' },
  labor: [
    { liste: 2, code: '001-0', bel: '0010', text: 'Modell', preise: [4.75, 0, 0, 0] },
    { liste: 3, code: '50002', nr: '0002', text: 'Modell', preise: [12.5, 14, 0, 0] },
    { liste: 3, code: 'm2', material: 'm', werkstoff: 'hochgold', text: 'Bio Herador N', preise: [61.2, 0, 0, 0] },
    { liste: 5, code: '50002', nr: '0002', text: 'Modell Haus', preise: [11, 0, 0, 0] },
    { liste: 5, code: '59999', text: 'ohne nr', preise: [1, 0, 0, 0] },
  ],
  goz: [
    { nr: '2210', text: 'Vollkrone', punkte: 1678, eigen: false, kuerzel: 'K2', faktor: 3.5 },
    { nr: '2060mk', text: 'Komposit MKV', punkte: 527, eigen: true, druckNr: '2060' },
    { nr: '', text: 'leer', punkte: 1, eigen: true },
  ],
  komplexe: [
    { kuerzel: 'I1', text: 'Goldinlay', positionen: [{ ebene: 'GOZ', nr: '2150' }] },
    { kuerzel: '+x', text: 'nur GOÄ', positionen: [{ ebene: 'GOAE', nr: '1' }] },
  ],
}

const W = (liste: number, spalte: number, faktoren: boolean) => ({ liste, spalte, faktoren, belListe: 2, belSpalte: 1 })

describe('Praxiskatalog aus dem PVS', () => {
  const roh = rohPruefen(antwort)!

  it('übernimmt nur vollständige Zeilen', () => {
    expect(roh.labor.map((z) => z.code)).toEqual(['001-0', '50002', 'm2', '50002'])
    expect(roh.goz.map((g) => g.nr)).toEqual(['2210', '2060mk'])
    expect(roh.komplexe.map((k) => k.kuerzel)).toEqual(['I1'])
    expect(rohPruefen(null)).toBeNull()
  })

  it('nimmt den Vorschlag des PVS, bis die Praxis anders wählt', () => {
    expect(wahlPruefen(null, roh)).toEqual(W(5, 1, true))
    expect(wahlPruefen({ liste: 3, spalte: 2 }, roh, W(5, 1, false))).toEqual(W(3, 2, false))
    expect(wahlPruefen({ liste: 9, spalte: 7, belListe: 3 }, roh, W(3, 1, true))).toEqual(W(3, 1, true))
    expect(wahlPruefen({ liste: 2 }, roh, { liste: 3, spalte: 1, faktoren: true })).toEqual(W(3, 1, true))
  })

  it('bildet Eigenlabor aus der gewählten Liste und Spalte', () => {
    const k = katalogBilden(roh, W(3, 1, true), 'T')
    expect(k.listeName).toBe('BEB')
    expect(k.belListeName).toBe('BEL II')
    expect(k.bel).toEqual([{ nr: '0010', text: 'Modell', preis: 4.75 }])
    expect(katalogBilden(roh, { ...W(3, 1, true), belSpalte: 2 }).bel).toEqual([])
    expect(k.eigenlabor).toEqual([
      { nr: '0002', text: 'Modell', preis: 12.5, ersetzt: '0002' },
      { nr: 'M2', text: 'Bio Herador N', preis: 61.2, material: 'm', werkstoff: 'hochgold' },
    ])
    expect(katalogBilden(roh, W(3, 2, true)).eigenlabor.map((e) => e.preis)).toEqual([14])
    expect(katalogBilden(roh, W(3, 1, false)).goz[0].faktor).toBeUndefined()
  })

  it('zählt Änderungen gegenüber dem letzten Stand', () => {
    const alt = katalogBilden(roh, W(3, 1, true))
    const neu = katalogBilden(roh, W(5, 1, true))
    expect(aenderungen(alt, neu)!.eigenlabor).toEqual({ neu: 0, geaendert: 1, entfallen: 1 })
    expect(aenderungen(null, neu)!.goz).toEqual({ neu: 2, geaendert: 0, entfallen: 0 })
  })

  it('findet Positionen, die PlanR nicht kennt', () => {
    const bekannt = { goz: new Set(['2210']), beb: new Set(['0001']) }
    const plan = { positionen: [
      { ebene: 'GOZ', nr: '2210' }, { ebene: 'GOZ', nr: '2060mk' }, { ebene: 'BEB', nr: '0002' }, { ebene: 'BEB', nr: '0002' }, { ebene: 'BEMA', nr: '91b' },
    ] }
    expect(unbekannte(plan, bekannt)).toEqual(['GOZ 2060mk', 'BEB 0002'])
    expect(unbekannte(plan, bekannt, katalogBilden(roh, W(3, 1, true)))).toEqual([])
  })
})

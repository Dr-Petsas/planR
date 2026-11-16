import { describe, expect, it } from 'vitest'
import { blattAusEinlesen, type EinleseAntwort } from './einlesenZeilen'
import beleg from './testdaten/privatImplantat.json'

const r = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Vorfall 11/2026: Ein privater Implantat-Kostenvoranschlag über vier Seiten kam ohne eine einzige Position an.
 * Das Blatt heißt „Zähne · Geb.-Nr. · Bezeichnung · Anz. · Faktor · Betrag", GOÄ steht als „ä5004",
 * Analogleistungen als „6000a", Verbrauchsmaterial als „vm005", und die Summen heißen „Zahnarzthonorar EUR".
 * Namen und Anschrift im Beleg sind ersetzt.
 */
describe('Privater Implantat-Kostenvoranschlag über mehrere Seiten', () => {
  const blatt = blattAusEinlesen(beleg as EinleseAntwort)
  const p = blatt.positionen
  const summe = (ebenen: string[]) => r(p.filter((x) => ebenen.includes(x.ebene)).reduce((s, x) => s + (x.betrag ?? 0), 0))

  it('liest den Befund beider Kiefer', () => {
    expect(blatt.schema.B).toEqual({
      18: 'f', 16: 'x', 15: 'b', 14: 'x', 13: 'b', 12: 'b', 11: 'b', 21: 'k', 22: 'k', 23: 'b', 24: 'b', 25: 'b', 26: 'i', 28: 'f',
      48: 'f', 47: 'i', 46: 'b', 45: 'i', 44: 'k', 43: 'k', 42: 'k', 41: 'k', 31: 'k', 32: 'k', 33: 'k', 34: 'k', 35: 'i', 36: 'b', 37: 'i', 38: 'f',
    })
  })

  it('liest alle 43 Zeilen, die Beträge ergeben die Summen des Blatts', () => {
    expect(p).toHaveLength(43)
    expect(p.filter((x) => x.ebene === 'GOZ')).toHaveLength(26)
    expect(p.filter((x) => x.ebene === 'GOÄ')).toHaveLength(12)
    expect(p.filter((x) => x.ebene === 'MAT')).toHaveLength(5)
    expect(summe(['GOZ', 'GOÄ'])).toBe(4393.35)
    expect(summe(['MAT'])).toBe(721.22)
    expect(blatt.summen).toMatchObject({ honorarGoz: 4393.35, labor: 721.22, gesamt: 5114.57 })
  })

  it('trennt GOÄ, Analog und Material und behält Faktor, Zähne und Sitzung', () => {
    expect(p[1]).toMatchObject({ ebene: 'GOÄ', nr: '34', anzahl: 1, faktor: 2.3, betrag: 40.22, sitzung: 1 })
    expect(p[2]).toMatchObject({ ebene: 'GOZ', nr: '6000', analog: true, anzahl: 4, betrag: 41.4 })
    expect(p[12]).toMatchObject({ ebene: 'GOZ', nr: '0090', zahn: '15,13,11', anzahl: 18, faktor: 3.5, betrag: 212.58, sitzung: 2 })
    expect(p[13]).toMatchObject({ ebene: 'MAT', anzahl: 15, betrag: 19.95, text: 'Septanest Anästhetikum' })
    expect(p[14]).toMatchObject({ ebene: 'GOÄ', nr: '2442', analog: true })
    // „9050" trägt kein „a", der Hinweis auf § 6 Abs. 1 steht in der Bezeichnung
    expect(p.find((x) => x.nr === '9050')).toMatchObject({ analog: true, sitzung: 4 })
    expect(p[42]).toMatchObject({ ebene: 'GOZ', nr: '6190', sitzung: 5 })
  })

  it('hält gleiche Ziffern aus verschiedenen Sitzungen auseinander', () => {
    expect(p.filter((x) => x.ebene === 'GOÄ' && x.nr === '5004').map((x) => [x.sitzung, x.anzahl])).toEqual([[1, 1], [2, 2], [4, 1]])
  })
})

import { describe, expect, it } from 'vitest'
import { betragVon, blattAusEinlesen, zeilenAusSeite, type EinleseAntwort, type EinleseTeil } from './einlesenZeilen'

/** Ein Textstück wie vom Dienst: linker Rand, Mitte der Zeile, Breite nach Zeichenzahl. */
const t = (x: number, y: number, text: string, sicher = 0.99): EinleseTeil => ({ x, y, b: text.length * 10, h: 20, text, sicher })

const antwort = (...seiten: EinleseTeil[][]): EinleseAntwort => ({
  seiten: [], tabellen: [],
  ergaenzung: { seiten: seiten.map((teile, i) => ({ seite: i + 1, breite: 1654, hoehe: 2339, teile })) },
})

const OBEN = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
const UNTEN = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
const spalte = (i: number) => 200 + i * 70
/** Kürzel mittig unter der Zahnnummer, so wie es auf dem Vordruck steht. */
const kuerzel = (zahn: string, y: number, text: string, sicher = 0.99) => {
  const i = OBEN.includes(zahn) ? OBEN.indexOf(zahn) : UNTEN.indexOf(zahn)
  return t(spalte(i) + 10 - text.length * 5, y, text, sicher)
}

describe('betragVon', () => {
  it('liest die Schreibweisen vom Blatt', () => {
    expect(betragVon('1.234,56')).toBe(1234.56)
    expect(betragVon('678,-')).toBe(678)
    expect(betragVon('106,--')).toBe(106)
    expect(betragVon('1925.-')).toBe(1925)
    expect(betragVon('3,00g')).toBe(3)
    expect(betragVon('0,00')).toBe(0)
    expect(betragVon('EUR')).toBeUndefined()
  })
})

describe('Zeilen aus dem Einlese-Dienst', () => {
  it('fasst Stücke auf gleicher Höhe zu einer Zeile zusammen und trennt Wörter', () => {
    const { zeilen } = zeilenAusSeite({ seite: 1, breite: 1000, hoehe: 1000, teile: [t(300, 103, 'zwei drei'), t(100, 100, 'eins'), t(100, 160, 'unten')] })
    expect(zeilen.map((z) => z.teile.map((e) => e.text))).toEqual([['eins', 'zwei', 'drei'], ['unten']])
  })

  it('liest Befund, Regelversorgung und Therapieplanung am Zahnschema', () => {
    const blatt = blattAusEinlesen(antwort([
      t(100, 500, 'B'), kuerzel('18', 500, 'f'), kuerzel('12', 500, 'k'), kuerzel('26', 500, 'X', 0.64),
      ...OBEN.map((z, i) => t(spalte(i), 540, z)),
      ...UNTEN.map((z, i) => t(spalte(i), 580, z)),
      t(100, 620, 'B'), kuerzel('47', 620, 'f'), kuerzel('46', 620, 'f'), kuerzel('36', 620, 'k'),
      t(100, 660, 'R'), kuerzel('47', 660, 'E'), kuerzel('45', 660, 'H'),
      t(95, 700, 'TP'), kuerzel('47', 700, 'SKM'), kuerzel('46', 700, 'SKM'),
    ]))
    expect(blatt.schema.B).toEqual({ 18: 'f', 12: 'k', 26: 'x', 47: 'f', 46: 'f', 36: 'k' })
    expect(blatt.schema.R).toEqual({ 47: 'E', 45: 'H' })
    expect(blatt.schema.TP).toEqual({ 47: 'SKM', 46: 'SKM' })
    expect(blatt.pruefen).toEqual(['X'])
  })

  it('liest GOZ-Zeilen und Summen aus der Anlage Teil 2', () => {
    const blatt = blattAusEinlesen(antwort([
      t(100, 300, 'Zahn/Gebiet'), t(300, 300, 'GOZ'), t(450, 300, 'Leistungsbeschreibung'), t(1300, 300, 'Anzahl'), t(1420, 300, 'Betrag EUR'),
      t(120, 340, '46,47'), t(300, 340, '2200'), t(450, 340, 'Versorgung eines Zahnes durch eine Vollkrone'), t(1340, 340, '2'), t(1460, 340, '520,--'),
      t(450, 370, '(Tangentialpräparation)'),
      t(120, 400, '12'), t(300, 400, '5070'), t(450, 400, 'Brückenglied'), t(1340, 400, '1'), t(1460, 400, '52,-'),
      t(100, 600, 'Zahnärztliches Honorar GOZ (entsprechend Zeile III/3 HKP):'), t(1300, 600, 'EUR'), t(1440, 600, '678,-'),
      t(100, 640, 'Material und Laborkosten (entsprechend Zeile III/4 HKP):'), t(1300, 640, 'EUR.'), t(1440, 640, '1163.-'),
      t(100, 680, 'abzüglich Festzuschüsse:'), t(1300, 680, 'EUR'), t(1440, 680, '571,29'),
      t(100, 720, 'Ihr voraussichtlicher Eigenanteil wird hiernach betragen EUR'), t(1440, 720, '1269,71'),
    ]))
    expect(blatt.positionen).toEqual([
      { ebene: 'GOZ', nr: '2200', zahn: '46', anzahl: 1, betrag: 260 },
      { ebene: 'GOZ', nr: '2200', zahn: '47', anzahl: 1, betrag: 260 },
      { ebene: 'GOZ', nr: '5070', zahn: '12', anzahl: 1, betrag: 52 },
    ])
    expect(blatt.summen).toEqual({ honorarGoz: 678, labor: 1163, festzuschuss: 571.29, eigenanteil: 1269.71 })
  })

  it('liest den Eigenbeleg: BEL mit Strich, BEB, keine Summenzeilen', () => {
    const blatt = blattAusEinlesen(antwort([
      t(260, 300, 'Nr.'), t(340, 300, 'Leistungsbezeichnung'), t(900, 300, 'Einzelpreis'), t(1080, 300, 'Anzahl'), t(1240, 300, 'Betrag'), t(1400, 300, 'MwSt'),
      t(100, 340, '05.11.2026'), t(250, 340, '001-0'), t(340, 340, 'Modell'), t(960, 340, '7,29'), t(1120, 340, '1'), t(1260, 340, '7,29'),
      t(250, 380, '02281'), t(340, 380, 'Krone aus Keramik gefräst (Anatomisch'), t(940, 380, '129,00'), t(1120, 380, '2'), t(1240, 380, '258,00'),
      t(340, 410, 'Vollzirkon)'),
      t(250, 450, 'SCAN'), t(340, 450, '3D- Modellscan'), t(950, 450, '89,00'), t(1120, 450, '1'), t(1250, 450, '89,00'), t(1400, 450, '7,00%'),
      t(100, 500, 'Summe der Positionen mit 7,00% MwSt'), t(1080, 500, 'EUR'), t(1240, 500, '256,00'), t(1400, 500, '17,92'), t(1500, 500, '273,92'),
      t(100, 560, 'Laborkosten gesamt'), t(1080, 560, 'EUR'), t(1500, 560, '354,29'),
    ]))
    expect(blatt.positionen.map(({ text: _t, ...p }) => p)).toEqual([
      { ebene: 'BEL', nr: '0010', zahn: '', anzahl: 1, betrag: 7.29 },
      { ebene: 'BEB', nr: '02281', zahn: '', anzahl: 2, betrag: 129 },
      { ebene: 'BEB', nr: 'SCAN', zahn: '', anzahl: 1, betrag: 89 },
    ])
    expect(blatt.positionen[0].text).toBe('Modell')
    expect(blatt.summen).toEqual({ laborBeleg: 354.29 })
  })

  it('gibt ohne Ergänzung ein leeres Blatt zurück', () => {
    const blatt = blattAusEinlesen({ seiten: [], tabellen: [], ergaenzung: null })
    expect(blatt.positionen).toEqual([])
    expect(blatt.schema).toEqual({ B: {}, R: {}, TP: {} })
  })
})

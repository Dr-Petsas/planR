import { describe, expect, it } from 'vitest'
import { eigenFinden, textZeilen, uebernehmen, zeilenAnalysieren } from './eigenlabor'

describe('Eigenlabor-Preisliste analysieren', () => {
  it('erkennt Nummer, Text und Preis aus PDF-Spalten', () => {
    const a = zeilenAnalysieren([
      'Preisliste Praxislabor 2026',
      'Nr.\tLeistung\tPreis',
      'E100\tCAD-Konstruktion je Einheit\t100,00 €',
      'E101\tCAD-Verbinder\t10,00 €',
      'E102\tKristallisationsbrand\t18,50',
      'Seite 1 von 2',
    ])
    expect(a.kandidaten.map((k) => [k.nr, k.text, k.preise[0]])).toEqual([
      ['E100', 'CAD-Konstruktion je Einheit', 100],
      ['E101', 'CAD-Verbinder', 10],
      ['E102', 'Kristallisationsbrand', 18.5],
    ])
  })

  it('liest Zeilen ohne Spalten, Tausenderpunkte und mehrzeilige Texte', () => {
    const a = zeilenAnalysieren([
      '0120 Modell aus Superhartgips 12,40 €',
      '1022 Vollkeramikkrone monolithisch,',
      'inkl. Bemalung und Glanzbrand 1.240,00 EUR',
      'Zwischensumme 1.252,40',
    ])
    expect(a.kandidaten.map((k) => [k.nr, k.text, k.preise[0]])).toEqual([
      ['0120', 'Modell aus Superhartgips', 12.4],
      ['1022', 'Vollkeramikkrone monolithisch, inkl. Bemalung und Glanzbrand', 1240],
    ])
    expect(a.warnungen.some((w) => w.includes('Summen'))).toBe(true)
  })

  it('bietet bei netto/brutto die Preisspalte zur Wahl an', () => {
    const a = zeilenAnalysieren(['Nr;Leistung;netto;brutto', 'L1;Kristallisationsbrand;20,00;21,40'])
    expect(a.preisSpalten).toBe(2)
    expect(uebernehmen([], a.kandidaten, 1)[0].preis).toBe(21.4)
  })

  it('vergibt fortlaufende Nummern und aktualisiert vorhandene', () => {
    const a = zeilenAnalysieren(['CAD-Konstruktion\t100,00', 'Kristallisationsbrand\t18,00', 'E-007\tGlanzbrand\t9,00'])
    const k = uebernehmen([{ nr: 'E-007', text: 'alt', preis: 5, ersetzt: '1022' }], a.kandidaten, 0)
    expect(k.map((e) => e.nr)).toEqual(['E-007', 'E-008', 'E-009'])
    expect(k[0]).toEqual({ nr: 'E-007', text: 'Glanzbrand', preis: 9, ersetzt: '1022' })
  })

  it('findet eigene Positionen über Nummer oder ersetzte BEB-Nr.', () => {
    const katalog = [{ nr: 'E1', text: 'CAD-Krone', preis: 180, ersetzt: '1022' }, { nr: '0120', text: 'Modell', preis: 15 }]
    expect(eigenFinden(katalog, '1022')?.nr).toBe('E1')
    expect(eigenFinden(katalog, '120')).toBeUndefined()
    expect(eigenFinden(katalog, '0120')?.preis).toBe(15)
    expect(eigenFinden(katalog, 'E1')?.text).toBe('CAD-Krone')
  })

  it('setzt PDF-Textstücke zu Zeilen mit Spaltentrennern zusammen', () => {
    const z = textZeilen([
      { str: '18,50 €', x: 480, y: 700, breite: 40, hoehe: 10 },
      { str: 'E102', x: 50, y: 700.5, breite: 25, hoehe: 10 },
      { str: 'Kristallisations', x: 120, y: 700, breite: 70, hoehe: 10 },
      { str: 'brand', x: 190, y: 700, breite: 25, hoehe: 10 },
      { str: 'E101', x: 50, y: 686, breite: 25, hoehe: 10 },
    ])
    expect(z).toEqual(['E102\tKristallisationsbrand\t18,50 €', 'E101'])
  })
})

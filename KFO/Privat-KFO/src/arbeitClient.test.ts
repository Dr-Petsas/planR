import { describe, expect, it } from 'vitest'
import { istJa, istNein, istPlanAuftrag, nurLeerlauf, planNameGesucht, pruefBericht, pruefOffen } from './arbeitClient'

describe('Bestätigung der KI-Zeile', () => {
  it('erkennt die Zusage und lässt einen Nachsatz nicht als Ja gelten', () => {
    expect(istJa('meinetwegen ja')).toBe(true)
    expect(istJa('ja.')).toBe(true)
    expect(istJa('ja aber Straumann')).toBe(false)
  })

  it('erkennt die Absage', () => {
    expect(istNein('nein')).toBe(true)
    expect(istNein('nicht ändern')).toBe(true)
    expect(istNein('nicht')).toBe(false)
  })

  it('nimmt den Namen aus einem Öffnen-Satz', () => {
    expect(planNameGesucht('öffne den Plan zaharia')).toBe('zaharia')
    expect(planNameGesucht('zeig mir den HKP von Frau Zaharia')).toBe('Zaharia')
    expect(planNameGesucht('ändere das implantatsystem')).toBeNull()
    expect(planNameGesucht('öffne den Plan und nimm Zirkon')).toBeNull()
  })

  it('unterscheidet einen Planauftrag von einer Frage', () => {
    expect(istPlanAuftrag('ändere das implantatsystem')).toBe(true)
    expect(istPlanAuftrag('geht 9050 2 mal?')).toBe(true)
    expect(istPlanAuftrag('Ist das Zirkon?')).toBe(false)
    expect(istPlanAuftrag('Nimm Zirkon')).toBe(true)
  })
})

describe('Prüfmodul nach einer Änderung der KI-Zeile', () => {
  it('zählt nur Fehler und Warnungen als offen', () => {
    expect(pruefOffen([{ stufe: 'fehler', text: 'A' }, { stufe: 'info', text: 'B' }, { stufe: 'warnung', text: 'C' }, { stufe: 'warnung' }])).toEqual(['A', 'C'])
    expect(pruefOffen(undefined)).toEqual([])
  })
  it('meldet behoben, offen und neu', () => {
    expect(pruefBericht([], [])).toBe('')
    expect(pruefBericht(['A', 'B'], [])).toContain('alle 2 Meldungen sind behoben')
    expect(pruefBericht(['A', 'B'], ['B'])).toContain('1 behoben, 1 noch offen')
    expect(pruefBericht(['A', 'B'], ['B'])).toContain('Offen: B')
    expect(pruefBericht(['A'], ['A', 'N'])).toContain('Neu durch die Änderung: N')
  })
})

describe('zweiter Versuch der KI-Zeile', () => {
  it('gilt nur, wenn der Plan alles schon so stehen hat', () => {
    expect(nurLeerlauf([], ['Zahn 26 steht schon so im Plan.'])).toBe(true)
    expect(nurLeerlauf([], ['Zahn 26 steht schon so im Plan.', 'Die Nummer K99 kenne ich nicht.'])).toBe(false)
    expect(nurLeerlauf(['Zahn 16: Befund ww'], ['Zahn 26 steht schon so im Plan.'])).toBe(false)
    expect(nurLeerlauf([], [])).toBe(false)
  })
})

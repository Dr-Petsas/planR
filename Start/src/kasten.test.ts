import { describe, expect, it } from 'vitest'
import { kastenSatz, schemaSatz, schemaVon, type Kasten } from './kasten'

const befund: Kasten = {
  art: 'befund',
  titel: 'Befund',
  hinweis: 'Stimmt der Befund so?',
  text: 'Oberkiefer: es fehlt 16.',
}

describe('kastenSatz', () => {
  it('übernimmt einen unveränderten Befund als Ja', () => {
    expect(kastenSatz(befund, 'Oberkiefer: es fehlt 16.', [])).toBe('Ja, der Befund stimmt so.')
  })

  it('schickt den geänderten Befund wortwörtlich', () => {
    expect(kastenSatz(befund, 'Oberkiefer: es fehlt 16; 15 ist überkront.', [])).toBe(
      'Oberkiefer: es fehlt 16; 15 ist überkront.',
    )
  })

  it('verlangt bei einer Auswahl einen Haken', () => {
    const wahl: Kasten = {
      art: 'wahl',
      titel: 'Planart',
      gruppen: [{ frage: 'Welche Planart?', punkte: ['Kassen-HKP', 'privat'] }],
    }
    expect(kastenSatz(wahl, '', [[]])).toBeNull()
    expect(kastenSatz(wahl, '', [['Kassen-HKP']])).toBe('Kassen-HKP')
  })

  it('zeichnet den Befundsatz als Zahnschema', () => {
    expect(schemaVon('Oberkiefer: es fehlt 16.')).toEqual({ '16': 'f' })
    expect(schemaVon('Oberkiefer: es fehlen 14 bis 16; überkront: 13.')).toEqual({
      '14': 'f', '15': 'f', '16': 'f', '13': 'k',
    })
    expect(schemaVon('26 fehlt, 16 ist überkront')).toEqual({ '26': 'f', '16': 'k' })
    expect(schemaVon('Guten Tag.')).toEqual({})
  })

  it('spricht nur die geänderten Zähne', () => {
    expect(schemaSatz({ '16': 'f' }, { '16': 'f' })).toBe('Ja, der Befund stimmt so.')
    expect(schemaSatz({ '16': 'f' }, { '16': 'f', '15': 'k' })).toBe('15 ist überkront')
  })

  it('reiht mehrere Zähne an den Befund', () => {
    const beide: Kasten = {
      ...befund,
      gruppen: [{ frage: 'Welche Zähne?', punkte: ['15', '16'], mehrere: true }],
    }
    expect(kastenSatz(beide, befund.text || '', [['15', '16']])).toBe('Ja, der Befund stimmt so. 15, 16')
  })
})

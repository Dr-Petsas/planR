import { describe, expect, it } from 'vitest'
import { aboText, initialen } from './konto'

describe('Avatar-Initialen', () => {
  it('lässt den Titel weg und nimmt Vor- und Nachname', () => {
    expect(initialen('Dr.med.dent. Michael Petsas')).toBe('MP')
    expect(initialen('Prof. Dr. Anna Berger')).toBe('AB')
  })

  it('nimmt bei einer E-Mail den Namen vor dem @', () => {
    expect(initialen('michael.petsas@praxis.de')).toBe('MP')
  })
})

describe('Abo im Konto', () => {
  it('nennt das Paket, ohne einen Betrag zu erfinden', () => {
    expect(aboText({ abo: 'mas' })).toBe('Pickadoc MAS · PlanR ist enthalten')
    expect(aboText({ abo: 'planr', clara: 'planr' })).toBe('PlanR mit Sprach-KI')
    expect(aboText({ abo: 'planr', clara: 'aus' })).toBe('PlanR')
    expect(aboText({})).toBe('Kein Abo hinterlegt')
  })
})

import { describe, expect, it } from 'vitest'
import { NAME_MUSTER, nameSchreibweise } from './src/clara'

// Gleiche Regel wie MAS (backend/src/hkp/planrClara.js rufnameSaeubern): der Name ist zugleich Weckwort.
describe('Name der HKP-Assistentin', () => {
  it('nimmt ein Wort mit 3 bis 20 Buchstaben', () => {
    for (const n of ['Mia', 'Anna-Lena', 'Jürgen', 'Clara', 'x'.repeat(20)]) expect(NAME_MUSTER.test(n), n).toBe(true)
  })
  it('lehnt Leerzeichen, Ziffern, Zeichen und Überlänge ab', () => {
    for (const n of ['Al', 'Frau Holle', 'R2D2', '<b>', '-Mia', 'x'.repeat(21), '']) expect(NAME_MUSTER.test(n), n).toBe(false)
  })
  it('schreibt Großbuchstaben-Namen als Namen, damit die Stimme sie nicht buchstabiert', () => {
    expect(nameSchreibweise('EVA')).toBe('Eva')
    expect(nameSchreibweise('ANNA-LENA')).toBe('Anna-Lena')
    expect(nameSchreibweise('eva')).toBe('Eva')
    expect(nameSchreibweise('McKenzie')).toBe('McKenzie')
  })
})

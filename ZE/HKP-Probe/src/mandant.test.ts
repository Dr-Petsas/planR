import { describe, expect, it } from 'vitest'
import { STANDARD_ID, kennung, schluessel } from './mandant'

describe('Mandant', () => {
  it('Kürzel aus dem Namen', () => {
    expect(kennung('Praxis Dr. Müller & Söhne')).toBe('praxis-dr-muller-sohne')
    expect(kennung('  Weiß-Straße 3 ')).toBe('weiss-strasse-3')
    expect(kennung('!!!')).toBe('')
  })

  it('Standard-Mandant behält die alten Schlüssel', () => {
    expect(schluessel('plan.v1', STANDARD_ID)).toBe('plan.v1')
    expect(schluessel('plan.v1', 'praxis2')).toBe('plan.v1@praxis2')
  })
})

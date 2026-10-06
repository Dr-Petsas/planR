import { describe, expect, it } from 'vitest'
import { linkZugang, mobilGewuenscht, vollansichtSuche } from './mobilLink'

describe('Handy-Ansicht aus dem Clara-Link', () => {
  it('liest HKP, Lese- und Freigabe-Schlüssel und Mandant', () => {
    expect(linkZugang('?hkp=abc&t=1.x&f=2.y&c=praxis2&ansicht=mobil')).toEqual({ id: 'abc', t: '1.x', f: '2.y', c: 'praxis2' })
    expect(linkZugang('?hkp=abc')).toBeNull()
    expect(linkZugang('')).toBeNull()
  })

  it('Karte in der App immer mobil, SMS-Link nur auf schmalem Bildschirm, Vollansicht erzwingbar', () => {
    expect(mobilGewuenscht('?hkp=abc&t=1.x&ansicht=mobil', false)).toBe(true)
    expect(mobilGewuenscht('?hkp=abc&t=1.x', true)).toBe(true)
    expect(mobilGewuenscht('?hkp=abc&t=1.x', false)).toBe(false)
    expect(mobilGewuenscht('?hkp=abc&t=1.x&ansicht=voll', true)).toBe(false)
    expect(mobilGewuenscht('?ansicht=mobil', true)).toBe(false)
  })

  it('Vollansicht gibt den Freigabe-Schlüssel nicht weiter', () => {
    const s = vollansichtSuche({ id: 'abc', t: '1.x', f: '2.y', c: 'praxis2' })
    expect(s).toContain('hkp=abc')
    expect(s).toContain('c=praxis2')
    expect(s).toContain('ansicht=voll')
    expect(s).not.toContain('2.y')
  })
})

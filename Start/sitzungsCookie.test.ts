import { describe, expect, it } from 'vitest'
import { rahmenToken, sitzungsCookie } from './sitzungsCookie.ts'

describe('Sitzungs-Cookie', () => {
  it('bleibt auf der eigenen Seite Lax', () => {
    const zeile = sitzungsCookie('planr_sitzung', 'abc', 86400, true, false)
    expect(zeile).toContain('SameSite=Lax')
    expect(zeile).toContain('; Secure')
    expect(zeile).not.toContain('Partitioned')
    expect(zeile).not.toContain('SameSite=None')
  })

  it('hält im DENS-ONE-Rahmen, weil Lax dort verworfen wird', () => {
    const zeile = sitzungsCookie('planr_sitzung', 'abc', 86400, true, true)
    expect(zeile).toBe('planr_sitzung=abc; Path=/; Max-Age=86400; HttpOnly; SameSite=None; Partitioned; Secure')
  })

  it('setzt ohne https kein SameSite=None', () => {
    const zeile = sitzungsCookie('planr_sitzung', 'abc', 0, false, true)
    expect(zeile).toContain('SameSite=Lax')
    expect(zeile).not.toContain('Secure')
  })

  it('nimmt nur einen echten Sitzungswert aus dem Rahmen-Kopf', () => {
    expect(rahmenToken('a'.repeat(32))).toHaveLength(32)
    expect(rahmenToken('kurz')).toBe('')
    expect(rahmenToken('abc def ghi jkl mno pqrstuv')).toBe('')
    expect(rahmenToken(['abc_def-ghi_jkl-mno_pqrs'])).toBe('abc_def-ghi_jkl-mno_pqrs')
  })
})

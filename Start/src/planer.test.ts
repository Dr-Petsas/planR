import { describe, expect, it } from 'vitest'
import { BEREICHE, adresse } from './planer'

const mkv = BEREICHE.flatMap((b) => b.planer).find((p) => p.kuerzel === 'MKV')!

describe('Adressen', () => {
  it('am Praxis-PC der lokale Port', () => {
    expect(adresse(mkv, { protocol: 'http:', hostname: 'localhost', search: '' })).toBe('http://localhost:5204/')
  })

  it('über den Tunnel die Subdomain, Mandant wird durchgereicht', () => {
    expect(adresse(mkv, { protocol: 'https:', hostname: 'planr.pickadoc-tunnel.com', search: '?mandant=praxis2' }))
      .toBe('https://mkv.pickadoc-tunnel.com/?mandant=praxis2')
  })

  it('Planer in Vorbereitung haben keine Adresse', () => {
    const kb = BEREICHE.flatMap((b) => b.planer).find((p) => p.kuerzel === 'KB')!
    expect(adresse(kb, { protocol: 'http:', hostname: 'localhost', search: '' })).toBeNull()
  })

  it('jeder Port und jede Subdomain nur einmal', () => {
    const alle = BEREICHE.flatMap((b) => b.planer).filter((p) => p.port)
    expect(new Set(alle.map((p) => p.port)).size).toBe(alle.length)
    expect(new Set(alle.map((p) => p.host)).size).toBe(alle.length)
  })
})

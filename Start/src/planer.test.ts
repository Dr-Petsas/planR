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

  it('auf planr.pickadoc.de der Pfad unter derselben Adresse', () => {
    expect(adresse(mkv, { protocol: 'https:', hostname: 'planr.pickadoc.de', search: '' })).toBe('/planer/mkv/')
  })

  it('im Praxisnetz (IP oder Rechnername) der Port', () => {
    expect(adresse(mkv, { protocol: 'http:', hostname: '192.168.0.20', search: '' })).toBe('http://192.168.0.20:5204/')
    expect(adresse(mkv, { protocol: 'http:', hostname: 'praxis-pc', search: '' })).toBe('http://praxis-pc:5204/')
  })

  it('ohne Host keine Adresse', () => {
    const kb = BEREICHE.flatMap((b) => b.planer).find((p) => p.kuerzel === 'KB')!
    expect(adresse({ ...kb, host: undefined, port: undefined }, { protocol: 'http:', hostname: 'localhost', search: '' })).toBeNull()
  })

  it('jeder Port und jede Subdomain nur einmal', () => {
    const alle = BEREICHE.flatMap((b) => b.planer).filter((p) => p.port)
    expect(new Set(alle.map((p) => p.port)).size).toBe(alle.length)
    expect(new Set(alle.map((p) => p.host)).size).toBe(alle.length)
  })
})

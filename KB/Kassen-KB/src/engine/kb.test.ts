import { describe, expect, it } from 'vitest'
import { rechnen, vorlageAnwenden } from './kb'
import { belListeFuer, bemaEintrag, BEL_LISTEN } from './listen'
import { VORLAGEN } from '../data/katalog'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import type { Einstellungen, Plan } from '../types'

const bayern: Einstellungen = { ...STANDARD_EINSTELLUNGEN, praxis: { ...STANDARD_EINSTELLUNGEN.praxis, plz: '80331' }, punktwertFest: { KB: 1.2, KCH: 1.3 } }
const mit = (ids: string[], e = bayern): Plan => {
  const p = neuerPlan('KB-T', e)
  let pos = p.positionen
  for (const id of ids) pos = vorlageAnwenden(pos, VORLAGEN.find((v) => v.id === id)!.pos)
  return { ...p, positionen: pos, angaben: { ...p.angaben, befund: 'Myoarthropathie' } }
}

describe('Listen', () => {
  it('BEMA Teil 2 aus der Recherche', () => {
    expect(bemaEintrag('K1')?.punkte).toBe(106)
    expect(bemaEintrag('K4')?.punkte).toBe(11)
    expect(bemaEintrag('UP3')?.punkte).toBe(223)
    expect(bemaEintrag('Ä2699')?.punkte).toBe(245)
  })
  it('hat für jede KZV eine BEL-II-Liste', () => {
    expect(new Set(BEL_LISTEN.map((l) => l.kzv)).size).toBe(16)
    expect(belListeFuer('11', '2026-10-07')?.id).toBe('bel2-bayern-2026')
  })
})

describe('Kassen-KB-Rechnung', () => {
  it('K1 mit Laborkette der KZV Bayern (Gewerbe)', () => {
    const r = rechnen(mit(['k1']), bayern)
    // BEMA 2 (20 P.) + K1 (106 P.) × 1,2
    expect(r.summeHonorar).toBe(151.2)
    // 2 × 001 0 (8,45) + 012 0 (12,42) + 401 0 (169,75)
    expect(r.summeLabor).toBe(199.07)
    expect(r.summeMaterial).toBe(6)
    expect(r.gesamt).toBe(356.27)
    expect(r.genehmigungspflichtig).toBe(true)
    expect(r.warnungen).toEqual([])
  })

  it('Praxislabor nimmt den Praxispreis der BEL II', () => {
    const p = mit(['k1'])
    const r = rechnen({ ...p, labor: 'praxis' }, bayern)
    expect(r.labor.find((z) => z.nr === '401 0')!.einzel).toBe(161.26)
  })

  it('BEMA 2 nur einmal, K1 und K2 zusammen wird gewarnt', () => {
    const p = mit(['k1', 'k2'])
    expect(p.positionen.filter((x) => x.nr === '2').length).toBe(1)
    expect(p.positionen.find((x) => x.nr === '2')!.anzahl).toBe(1)
    expect(rechnen(p, bayern).warnungen.some((w) => w.includes('nur eine der Leistungen K1, K2 oder K3'))).toBe(true)
  })

  it('UKPS ohne Veranlassung Schlafmedizin wird gewarnt', () => {
    const r = rechnen(mit(['ukps']), bayern)
    expect(r.warnungen.some((w) => w.includes('Schlafmedizin'))).toBe(true)
  })

  it('Kieferbruch: GOÄ-Leistungen wahlweise mit KCH-Punktwert, keine Genehmigung', () => {
    const p = mit(['bruch-schiene'])
    const bruch = { ...p, angaben: { ...p.angaben, art: 'kieferbruch' as const, verletzung: 'Sturz 01.10.2026' } }
    expect(rechnen(bruch, bayern).honorar[0].einzel).toBe(294)
    expect(rechnen(bruch, { ...bayern, kieferbruchKch: true }).honorar[0].einzel).toBe(318.5)
    expect(rechnen(bruch, bayern).genehmigungspflichtig).toBe(false)
  })

  it('Ohne Praxis-PLZ wird die fehlende KZV gemeldet', () => {
    const e = { ...STANDARD_EINSTELLUNGEN, punktwertFest: { KB: 1.2 } }
    expect(rechnen(mit(['k2'], e), e).warnungen.some((w) => w.includes('KZV der Praxis unbekannt'))).toBe(true)
  })
})

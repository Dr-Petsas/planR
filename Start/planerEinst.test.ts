import { describe, expect, it } from 'vitest'
import { altMeldungGilt, einstSetzen, staendePruefen } from './planerEinst'

describe('zentrale Planer-Einstellungen', () => {
  it('legt die erste Fassung an und zählt weiter', () => {
    const a = einstSetzen({}, {}, 'privat-impl', { faktor: 2.3 }, 0, 'a@praxis.de', '2026-11-18T10:00:00Z')
    expect(a).toMatchObject({ ok: true, v: 1 })
    if (!a.ok) return
    expect(a.staende['privat-impl']).toEqual({ v: 1, zeit: '2026-11-18T10:00:00Z', von: 'a@praxis.de' })
    const b = einstSetzen(a.alle, a.staende, 'privat-impl', { faktor: 3.5 }, 1, 'b@praxis.de', '2026-11-18T11:00:00Z')
    expect(b).toMatchObject({ ok: true, v: 2 })
    if (b.ok) expect(b.alle['privat-impl']).toEqual({ faktor: 3.5 })
  })

  it('überschreibt keinen neueren Stand', () => {
    const a = einstSetzen({ x: { p: 1 } }, { x: { v: 3, zeit: '', von: '' } }, 'x', { p: 2 }, 2, 'a', 'jetzt')
    expect(a).toEqual({ ok: false, grund: 'konflikt', v: 3 })
    expect(einstSetzen({ x: { p: 1 } }, {}, 'x', { p: 2 }, 1, 'a', 'jetzt')).toEqual({ ok: false, grund: 'konflikt', v: 0 })
  })

  it('lässt andere Planer unberührt', () => {
    const a = einstSetzen({ y: { p: 9 } }, { y: { v: 4, zeit: 'z', von: 'c' } }, 'x', { p: 2 }, 0, 'a', 'jetzt')
    expect(a.ok && a.alle.y).toEqual({ p: 9 })
    expect(a.ok && a.staende.y.v).toBe(4)
  })

  it('weist Unbrauchbares ab', () => {
    expect(einstSetzen({}, {}, 'x', [1], 0, 'a', 'j')).toEqual({ ok: false, grund: 'ungueltig' })
    expect(einstSetzen({}, {}, 'x', null, 0, 'a', 'j')).toEqual({ ok: false, grund: 'ungueltig' })
    expect(einstSetzen({}, {}, 'x', { t: 'x'.repeat(200_001) }, 0, 'a', 'j')).toEqual({ ok: false, grund: 'ungueltig' })
  })

  it('alte Browser-Meldungen gelten nur ohne zentralen Stand', () => {
    expect(altMeldungGilt({}, 'x')).toBe(true)
    expect(altMeldungGilt({ x: { v: 1, zeit: '', von: '' } }, 'x')).toBe(false)
    expect(staendePruefen({ x: { v: 0 }, y: { v: 2, zeit: 't', von: 'w' }, z: 'quatsch' })).toEqual({ y: { v: 2, zeit: 't', von: 'w' } })
  })
})

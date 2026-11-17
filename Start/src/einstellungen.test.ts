import { describe, expect, it } from 'vitest'
import { einstellungenPruefen, pvsFreiKonten, pvsStehtFest, PVS_LISTE } from './einstellungen'

describe('Einstellungen', () => {
  it('zehn PVS mit eindeutigen Kennungen', () => {
    expect(PVS_LISTE).toHaveLength(10)
    expect(new Set(PVS_LISTE.map((p) => p.id)).size).toBe(10)
  })
  it('übernimmt ein bekanntes PVS mit Bridge', () => {
    expect(einstellungenPruefen({ pvs: 'dens', bridge: true, ordner: ' C:\\DENS\\Import ' })).toMatchObject({ pvs: 'dens', bridge: true, ordner: 'C:\\DENS\\Import' })
  })
  it('ohne oder mit unbekanntem PVS keine Bridge', () => {
    expect(einstellungenPruefen({ pvs: 'gibtsnicht', bridge: true })).toMatchObject({ pvs: '', bridge: false })
    expect(einstellungenPruefen(null)).toMatchObject({ pvs: '', bridge: false, ordner: '' })
  })
  it('Praxisprogramm steht fest, sobald es gewählt und die Bridge eingerichtet ist', () => {
    expect(pvsStehtFest({ pvs: 'dens', bridge: true, frei: false })).toBe(true)
    expect(pvsStehtFest({ pvs: 'dens', bridge: false, frei: false })).toBe(false)
    expect(pvsStehtFest({ pvs: '', bridge: true, frei: false })).toBe(false)
  })
  it('Entwicklerkonto wechselt frei; die Liste kommt aus der Umgebung', () => {
    expect(pvsStehtFest({ pvs: 'dens', bridge: true, frei: true })).toBe(false)
    expect(pvsFreiKonten(undefined).has('contact@maik-music.io')).toBe(true)
    expect([...pvsFreiKonten(' A@b.de, c@d.de ,')]).toEqual(['a@b.de', 'c@d.de'])
    expect(pvsFreiKonten('').size).toBe(0)
  })
  it('Bridge nur bei echtem true', () => {
    expect(einstellungenPruefen({ pvs: 'dampsoft', bridge: 'ja' }).bridge).toBe(false)
  })
})

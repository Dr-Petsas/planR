import { describe, expect, it } from 'vitest'
import { einstellungenPruefen, PVS_LISTE } from './einstellungen'

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
  it('Bridge nur bei echtem true', () => {
    expect(einstellungenPruefen({ pvs: 'dampsoft', bridge: 'ja' }).bridge).toBe(false)
  })
})

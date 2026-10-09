import { describe, expect, it } from 'vitest'
import { befundAusAuftrag, befundDatei, befundDateiName, befundVerstehen, hkpEntwurf } from './index'

const AUFTRAG = 'Brücke von 14 auf 16, 17 fehlt, 24 ist erneuerungsbedürftig'

describe('Befund-Datei', () => {
  const diktat = befundAusAuftrag(AUFTRAG)
  const gesagt = befundVerstehen(diktat, 'OK')
  const r = hkpEntwurf(AUFTRAG, gesagt, {
    patient: { name: 'Meier', vorname: 'Hans', geburtsdatum: '1960-03-02' },
  })

  it('Befundzeile des HKP mit KZBV-Kürzeln, diktierte Zähne markiert', () => {
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    const d = befundDatei(r.plan, { hkpId: 'h1', diktat, diktiert: Object.keys(gesagt), quelle: { art: 'gesprochen' }, erstellt: '2026-10-09T08:00:00.000Z' })
    expect(d).toMatchObject({ format: 'planr-zahnbefund', zahnschema: 'FDI', hkpId: 'h1', quelle: { art: 'gesprochen', diktat } })
    const ok = d.befundzeile.oberkiefer
    expect(ok.zaehne).toEqual(['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'])
    expect(d.befundzeile.unterkiefer.kuerzel).toHaveLength(16)
    const b = (z: string) => ok.kuerzel[ok.zaehne.indexOf(z)]
    expect([b('15'), b('17'), b('24'), b('14')]).toEqual(['f', 'f', 'kw', ''])
    expect(d.zaehne.find((z) => z.zahn === '17')).toEqual({ zahn: '17', kuerzel: 'f', bedeutung: 'fehlender Zahn', diktiert: true })
    expect(d.zaehne.find((z) => z.zahn === '24')).toMatchObject({ kuerzel: 'kw', bedeutung: 'erneuerungsbedürftige Krone' })
    expect(d.legende).toMatchObject({ f: 'fehlender Zahn', kw: 'erneuerungsbedürftige Krone' })
    expect(d.zaehne.every((z) => z.kuerzel)).toBe(true)
    expect(befundDateiName(d)).toBe('Befund_Meier_Hans_2026-10-09.json')
  })

  it('Befund nur aus Lena-01: Datei ohne Diktat, kein Zahn als diktiert markiert', () => {
    if (r.status !== 'ok') return
    const d = befundDatei(r.plan, { hkpId: 'h1', diktat: '', diktiert: [], quelle: { art: 'lena01', datum: '2026-09-01T10:00:00.000Z' } })
    expect(d.quelle).toEqual({ art: 'lena01', datum: '2026-09-01T10:00:00.000Z', diktat: '' })
    expect(d.zaehne.length).toBeGreaterThan(0)
    expect(d.zaehne.some((z) => z.diktiert)).toBe(false)
  })

  it('nicht diktierte Zähne (z. B. aus Lena-01) sind nicht als diktiert markiert', () => {
    if (r.status !== 'ok') return
    const d = befundDatei(r.plan, { hkpId: 'h1', diktat: '17 fehlt', diktiert: ['17'], quelle: { art: 'gesprochen+lena01' } })
    expect(d.zaehne.find((z) => z.zahn === '24')?.diktiert).toBe(false)
    expect(d.zaehne.find((z) => z.zahn === '17')?.diktiert).toBe(true)
  })
})

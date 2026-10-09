import { describe, expect, it } from 'vitest'
import {
  begraben, eingangOffen, ersetzbar, grabAnlegen, hkpKarten, kartePrüfen, loeschbar, modulErsetzen, planDateiAus, planDateiLesen, planFiltern, tagVon,
  type Eingang, type PlanKarte,
} from './plaene'

const karte = (teil: Partial<PlanKarte>): PlanKarte => ({
  modul: 'kassen-par',
  kuerzel: 'PAR',
  art: 'Kasse',
  nummer: '1',
  patient: 'Anna Meier',
  betrag: 10,
  status: 'entwurf',
  geaendert: '2026-10-07T08:00:00.000Z',
  ...teil,
})

describe('Pläne', () => {
  it('nimmt nur vollständige Karten an', () => {
    expect(kartePrüfen({ modul: 'kassen-par', art: 'Kasse', nummer: 'P-1', patient: 'Meier', betrag: 12, status: 'entwurf', geaendert: '2026-10-07T08:00:00.000Z', kuerzel: 'PAR' })?.nummer).toBe('P-1')
    expect(kartePrüfen({ modul: 'x', art: 'Kasse', nummer: '', patient: 'Meier', betrag: 1, geaendert: '2026-10-07T08:00:00.000Z' })).toBeNull()
  })

  it('filtert nach Name und Tag, verwirft Verworfenes', () => {
    const liste = [
      karte({ patient: 'Anna Meier', geaendert: '2026-10-07T08:00:00' }),
      karte({ nummer: '2', patient: 'Bert Sommer', geaendert: '2026-10-06T08:00:00' }),
      karte({ nummer: '3', patient: 'Anna Meier', status: 'verworfen', geaendert: '2026-10-07T09:00:00' }),
    ]
    expect(planFiltern(liste, 'meier', '').map((p) => p.nummer)).toEqual(['1'])
    expect(planFiltern(liste, '', tagVon('2026-10-06T08:00:00')).map((p) => p.nummer)).toEqual(['2'])
    expect(planFiltern(liste, '', '').map((p) => p.nummer)).toEqual(['1', '2'])
    const mitArt = [karte({ kuerzel: 'ZE' }), karte({ nummer: '9', kuerzel: 'IMPL', behandler: 'Dr. Petsas' })]
    expect(planFiltern(mitArt, '', '', 'IMPL').map((p) => p.nummer)).toEqual(['9'])
    expect(planFiltern(mitArt, '', '', '', 'Dr. Petsas').map((p) => p.nummer)).toEqual(['9'])
    expect(planFiltern(mitArt, '', '', '', '__ohne__').map((p) => p.nummer)).toEqual(['1'])
  })

  it('ersetzt nur das genannte Modul', () => {
    const alt = [karte({ modul: 'hkp', nummer: 'a' }), karte({ modul: 'kassen-par', nummer: 'b' })]
    const neu = modulErsetzen(alt, 'kassen-par', [karte({ nummer: 'c', geaendert: '2026-10-08T08:00:00.000Z' })])
    expect(neu.map((p) => `${p.modul}:${p.nummer}`)).toEqual(['kassen-par:c', 'hkp:a'])
  })

  it('ein gelöschter Plan bleibt weg, bis er neu gespeichert wird', () => {
    const k = karte({ nummer: 'KB-1', modul: 'kassen-kb' })
    const graeber = grabAnlegen([], k, new Date('2026-10-07T09:00:00.000Z'))
    expect(begraben(k, graeber)).toBe(true)
    expect(begraben({ ...k, geaendert: '2026-10-07T10:00:00.000Z' }, graeber)).toBe(false)
    expect(begraben({ ...k, modul: 'privat-kb' }, graeber)).toBe(false)
    // erneutes Löschen ersetzt das Grab, alte Gräber verfallen
    const spaeter = grabAnlegen(graeber, karte({ nummer: 'KB-2', modul: 'kassen-kb' }), new Date('2027-06-01T00:00:00.000Z'))
    expect(spaeter.map((g) => g.nummer)).toEqual(['KB-2'])
  })

  it('HKPs nur verwerfen, solange nichts bei der Kasse liegt', () => {
    expect(loeschbar(karte({ modul: 'hkp', status: 'wartet_auf_freigabe' }))).toBe(true)
    expect(loeschbar(karte({ modul: 'hkp', status: 'eingereicht' }))).toBe(false)
    expect(loeschbar(karte({ modul: 'hkp', status: 'abgerechnet' }))).toBe(false)
    expect(loeschbar(karte({ modul: 'kassen-kb', status: 'freigegeben' }))).toBe(true)
  })

  it('macht aus dem HKP-Register Kacheln', () => {
    const k = hkpKarten([{ id: 'abc', status: 'freigegeben', patient: { label: 'Hans Meier' }, summen: { gesamt: 1200 }, aktualisiert: '2026-10-07T10:00:00.000Z' }, { id: 'weg', status: 'verworfen' }])
    expect(k).toHaveLength(1)
    expect(k[0].patient).toBe('Hans Meier')
    expect(k[0].oeffnen).toBe('hkp=abc')
    expect(k[0].betrag).toBe(1200)
  })

  it('HKP-Kachel öffnet mit Lese-Link (Tunnel ohne Praxis-Schlüssel)', () => {
    const k = hkpKarten([{ id: 'abc', status: 'freigegeben', aktualisiert: '2026-10-07T10:00:00.000Z', link: { t: '1791234567.Ab-c_d' } }])
    expect(k[0].oeffnen).toBe('hkp=abc&t=1791234567.Ab-c_d')
    const fremd = hkpKarten([{ id: 'abc', status: 'freigegeben', aktualisiert: '2026-10-07T10:00:00.000Z', link: { t: '1.x', c: 'praxis2' } }])
    expect(fremd[0].oeffnen).toBe('hkp=abc&t=1.x&c=praxis2')
    const bearbeiten = hkpKarten([{ id: 'abc', status: 'freigegeben', aktualisiert: '2026-10-07T10:00:00.000Z', link: { t: '1.x', b: '2.y' } }])
    expect(bearbeiten[0].oeffnen).toBe('hkp=abc&t=1.x&b=2.y')
    const kaputt = hkpKarten([{ id: 'abc', status: 'freigegeben', aktualisiert: '2026-10-07T10:00:00.000Z', link: { t: 'a&b=c' } }])
    expect(kaputt[0].oeffnen).toBe('hkp=abc')
  })

  it('HKP-Kachel kennt die angehängte Befund-Datei', () => {
    const basis = { id: 'abc', status: 'wartet_auf_freigabe', aktualisiert: '2026-10-09T10:00:00.000Z' }
    expect(hkpKarten([{ ...basis, dateien: [{ id: 'befund', art: 'befund' }] }])[0].befund).toBe('befund')
    expect(hkpKarten([basis])[0].befund).toBeUndefined()
    expect(hkpKarten([{ ...basis, dateien: [{ id: '../x', art: 'befund' }] }])[0].befund).toBeUndefined()
  })
})

describe('Plandatei', () => {
  it('Export und Import ergeben denselben Plan', () => {
    const k = karte({ nummer: 'PAR-7' })
    const datei = planDateiAus(k, { nummer: 'PAR-7', zaehne: [1, 2] }, new Date('2026-10-07T09:00:00Z'))
    const { datei: gelesen } = planDateiLesen(JSON.parse(JSON.stringify(datei)))
    expect(gelesen).toMatchObject({ modul: 'kassen-par', nummer: 'PAR-7', patient: 'Anna Meier', plan: { zaehne: [1, 2] } })
  })
  it('erkennt alte HKP-Exporte und lässt das Ergebnis weg', () => {
    const { datei } = planDateiLesen({ patient: { vorname: 'Anna', name: 'Meier' }, zaehne: {}, verwaltung: {}, ergebnis: { summen: { gesamt: 812.5 } } })
    expect(datei).toMatchObject({ modul: 'hkp', patient: 'Anna Meier', betrag: 812.5, status: 'wartet_auf_freigabe' })
    expect(datei?.plan).not.toHaveProperty('ergebnis')
  })
  it('lehnt fremde Dateien ab', () => {
    expect(planDateiLesen([1, 2]).fehler).toBeTruthy()
    expect(planDateiLesen({ hallo: 1 }).fehler).toBeTruthy()
    expect(planDateiLesen({ format: 'planr-plan', modul: '../x', plan: {} }).fehler).toBeTruthy()
    expect(planDateiLesen({ format: 'planr-plan', modul: 'kassen-kb' }).fehler).toBeTruthy()
  })
})

describe('Eingang', () => {
  const e = (teil: Partial<Eingang>): Eingang => ({ modul: 'kassen-kb', nummer: 'KB-1', patient: '', betrag: 0, geaendert: '2026-10-07T10:00:00.000Z', plan: {}, ...teil })
  it('bleibt offen, bis der Planer den Stand meldet', () => {
    const eingang = [e({}), e({ nummer: 'KB-2' })]
    expect(eingangOffen(eingang, [{ modul: 'kassen-kb', nummer: 'KB-1', geaendert: '2026-10-07T09:00:00.000Z' }])).toHaveLength(2)
    expect(eingangOffen(eingang, [{ modul: 'kassen-kb', nummer: 'KB-1', geaendert: '2026-10-07T10:00:00.000Z' }])).toEqual([eingang[1]])
    expect(eingangOffen(eingang, [{ modul: 'privat-kb', nummer: 'KB-2', geaendert: '2026-10-08T00:00:00.000Z' }])).toHaveLength(2)
  })
  it('HKPs nur ersetzbar, solange sie auf Freigabe warten', () => {
    expect(ersetzbar(karte({}))).toBe(true)
    expect(ersetzbar(karte({ modul: 'hkp', status: 'wartet_auf_freigabe' }))).toBe(true)
    expect(ersetzbar(karte({ modul: 'hkp', status: 'freigegeben' }))).toBe(false)
  })
})

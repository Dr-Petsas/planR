import { describe, expect, it } from 'vitest'
import { rechnen, vorlageAnwenden } from './kfo'
import { goaeEintrag, gozPunkte, GOZ_PUNKTWERT, GOAE_PUNKTWERT } from './listen'
import { regelbissNr, umformungNr, VORLAGEN } from '../data/katalog'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import type { Aufgabe, Einstellungen, Plan, Position } from '../types'

const einst = STANDARD_EINSTELLUNGEN
const leer = () => neuerPlan('T-1', einst)
const mit = (vorlage: string, p: Plan = leer()): Plan => ({ ...p, positionen: vorlageAnwenden(p.positionen, VORLAGEN.find((v) => v.id === vorlage)!.pos) })
const aufgabe = (patch: Partial<Aufgabe>, p: Plan = leer()): Plan => ({ ...p, aufgabe: { ...p.aufgabe, ...patch } })
const pos = (p: Plan, ...neu: Omit<Position, 'id'>[]): Plan => ({ ...p, positionen: [...p.positionen, ...neu.map((n, i) => ({ id: `x${i}`, ...n }))] })

describe('Listen', () => {
  it('GOZ Abschnitt G mit den amtlichen Punkten', () => {
    expect(gozPunkte('6030')).toBe(1350)
    expect(gozPunkte('6050')).toBe(3600)
    expect(gozPunkte('6080')).toBe(3600)
    expect(gozPunkte('6090')).toBe(700)
    expect(gozPunkte('6100')).toBe(165)
    expect(gozPunkte('6150')).toBe(500)
    expect(gozPunkte('9020')).toBe(515)
    expect(GOZ_PUNKTWERT).toBeCloseTo(0.0562421, 7)
  })
  it('GOÄ-Röntgen nach dem amtlichen Verzeichnis', () => {
    expect(goaeEintrag('5004')?.punkte).toBe(400)
    expect(goaeEintrag('5090')?.punkte).toBe(400)
    expect(goaeEintrag('5037')?.punkte).toBe(300)
    expect(goaeEintrag('2702')?.punkte).toBe(300)
    expect(GOAE_PUNKTWERT).toBeCloseTo(0.0582873, 7)
  })
})

describe('Umfang aus den Kriterien der GOZ', () => {
  it('Umformung: mittel ab drei, hoch ab vier Kriterien a–e', () => {
    expect(umformungNr(['a', 'b'])).toBe('6030')
    expect(umformungNr(['a', 'b', 'c'])).toBe('6040')
    expect(umformungNr(['a', 'b', 'c', 'e'])).toBe('6050')
  })
  it('Regelbiss: mittel ab einem, hoch ab zwei Kriterien a–c', () => {
    expect(regelbissNr([])).toBe('6060')
    expect(regelbissNr(['a'])).toBe('6070')
    expect(regelbissNr(['a', 'c'])).toBe('6080')
  })
})

describe('Privat-KFO-Rechnung', () => {
  it('Behandlungsaufgabe je Kiefer plus Regelbiss, Abschlag je Quartal', () => {
    const p = aufgabe({ umformungOk: true, kriterienOk: ['a', 'b', 'c'], umformungUk: true, kriterienUk: ['a', 'b', 'c', 'd'], regelbiss: true, kriterienRegelbiss: ['b'] })
    const r = rechnen(p, einst)
    expect(r.aufgabe.map((z) => [z.nr, z.einzel])).toEqual([['6040', 271.65], ['6050', 465.68], ['6070', 336.33]])
    expect(r.summeAufgabe).toBe(1073.66)
    expect(r.abschlag).toBe(89.47)
    expect(r.warnungen).toEqual([])
  })

  it('Diagnostik mit Röntgen 1,8 und digitalem Zuschlag nur zum FRS', () => {
    const r = rechnen(mit('diagnostik'), einst)
    expect(r.honorar.find((z) => z.nr === '5004')!.einzel).toBe(41.97)
    expect(r.honorar.filter((z) => z.nr === '5298').map((z) => z.einzel)).toEqual([5.83])
    expect(r.summeHonorar).toBe(259.23)
    const analog = rechnen({ ...mit('diagnostik'), digitalRoentgen: false }, einst)
    expect(analog.summeHonorar).toBe(253.4)
  })

  it('Einzelleistungen 6190–6260 neben der Behandlungsaufgabe werden gewarnt', () => {
    const p = pos(aufgabe({ umformungOk: true }), { ebene: 'GOZ', nr: '6210', anzahl: 4 })
    expect(rechnen(p, einst).warnungen.some((w) => w.includes('6210 nicht berechnungsfähig'))).toBe(true)
    const ohne = pos(aufgabe({ alveolaerOk: true }), { ebene: 'GOZ', nr: '6210', anzahl: 4 })
    expect(rechnen(ohne, einst).warnungen).toEqual([])
  })

  it('6090 und Einstellung in den Regelbiss schließen sich aus', () => {
    const r = rechnen(aufgabe({ regelbiss: true, alveolaerUk: true }), einst)
    expect(r.warnungen.some((w) => w.includes('Wachstumsphase'))).toBe(true)
  })

  it('Minischraube: 9020 mit Faktor, Zuschlag 0510 immer zum einfachen Satz', () => {
    const p = mit('minipin')
    const r = rechnen({ ...p, regler: { ...p.regler, faktor: 3 } }, einst)
    expect(r.honorar.find((z) => z.nr === '9020')!.einzel).toBe(86.89)
    expect(r.honorar.find((z) => z.nr === '0510')!.einzel).toBe(42.18)
    expect(r.warnungen.some((w) => w.includes('Preis'))).toBe(true)
  })

  it('Material über dem Standard: Preis minus Standardmaterial, eigenes Blatt', () => {
    const e: Einstellungen = { ...einst, mehrPreise: { keramik: { preis: 14, standard: 3.5 } } }
    const r = rechnen(pos(leer(), { ebene: 'MEHR', nr: 'keramik', anzahl: 24 }), e)
    expect(r.mehr[0].einzel).toBe(10.5)
    expect(r.summeMehr).toBe(252)
    expect(r.gesamt).toBe(252)
    expect(r.hinweise.some((h) => h.includes('schriftlicher Vereinbarung'))).toBe(true)
  })

  it('Analogleistung rechnet mit der Bezugsleistung; ohne Bezug gewarnt', () => {
    const r = rechnen(pos(leer(), { ebene: 'GOZ', nr: '6100a', anzahl: 2, text: 'Attachment' }), einst)
    expect(r.honorar[0].einzel).toBe(21.34)
    expect(r.honorar[0].analog).toMatch(/^entsprechend GOZ 6100 /)
    const ohne = rechnen(pos(leer(), { ebene: 'GOZ', nr: 'a', anzahl: 1, text: 'Set-up' }), einst)
    expect(ohne.honorar[0].einzel).toBe(0)
    expect(ohne.warnungen.some((w) => w.includes('Bezugsleistung'))).toBe(true)
  })

  it('Röntgen: Begründung über 1,8, über 2,5 unzulässig', () => {
    const r = rechnen(pos(leer(), { ebene: 'GOAE', nr: '5004', anzahl: 1, faktor: 2.2 }), einst)
    expect(r.begruendung.map((z) => z.nr)).toEqual(['5004'])
    const zuHoch = rechnen(pos(leer(), { ebene: 'GOAE', nr: '5004', anzahl: 1, faktor: 3 }), einst)
    expect(zuHoch.warnungen.some((w) => w.includes('Höchstsatz'))).toBe(true)
  })

  it('KFO-Faktor über 3,5 führt die Behandlungsaufgabe in die Vereinbarung nach § 2', () => {
    const p = aufgabe({ umformungOk: true })
    const r = rechnen({ ...p, regler: { ...p.regler, kfoFaktor: 4 } }, einst)
    expect(r.vereinbarung2.map((z) => z.nr)).toEqual(['6030'])
  })

  it('mehr als 16 Quartale: neuer Behandlungsfall', () => {
    const r = rechnen({ ...aufgabe({ umformungOk: true }), quartale: 18 }, einst)
    expect(r.warnungen.some((w) => w.includes('vier Jahre'))).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { laserZuschlag, rechnen, zusaetzeFuer, zusatzUmschalten } from './kons'
import { neuerPlan, STANDARD_EINSTELLUNGEN as einst } from '../store'
import type { Plan, Vereinbarungsart, ZahnLeistung } from '../types'

function plan(zaehne: Record<string, ZahnLeistung>, stufe = 0, vereinbarung: Vereinbarungsart = 'pkv', faktor = 2.3): Plan {
  const p = neuerPlan('T-1', einst)
  return { ...p, zaehne, vereinbarung, regler: { ...p.regler, stufe, faktor } }
}

const nrn = (p: Plan, zahn: string) => rechnen(p, einst).zaehne.find((z) => z.zahn === zahn)!.zeilen.map((x) => x.nr)
const begleit = (p: Plan) => rechnen(p, einst).begleit

describe('Grundleistungen nach GOZ', () => {
  it('Endo vital: 2360, 2410, 2440 je Kanal', () => {
    const r = rechnen(plan({ '36': { therapie: 'endo', kanaele: 3, vital: true } }), einst)
    expect(r.zaehne[0].zeilen.map((x) => [x.nr, x.anzahl])).toEqual([['2360', 3], ['2410', 3], ['2440', 3]])
  })

  it('Endo avital: Trepanation 2390 statt 2360, ab Stufe 2 nekrotisches Gewebe analog', () => {
    const z = { '36': { therapie: 'endo', kanaele: 3, vital: false } as ZahnLeistung }
    expect(nrn(plan(z), '36')).toEqual(['2390', '2410', '2440'])
    expect(nrn(plan(z, 2), '36')).toContain('2360a')
  })

  it('Revision: alte Wurzelfüllung analog 2300a je Kanal', () => {
    const r = rechnen(plan({ '46': { therapie: 'revision', kanaele: 3 } }, 1), einst)
    expect(r.zaehne[0].zeilen.find((x) => x.nr === '2300a')?.anzahl).toBe(3)
  })

  it('Vitalerhaltung 2330/2340/2350, keine Mikroskop-Option bei der Pulpotomie', () => {
    expect(nrn(plan({ '16': { therapie: 'vital', vitalArt: 'direkt' } }), '16')).toEqual(['2340'])
    const p = plan({ '16': { therapie: 'vital', vitalArt: 'pulpotomie' } }, 3)
    expect(zusaetzeFuer(p.zaehne['16'], p).map((c) => c.zusatz.id)).not.toContain('mikroskop')
  })

  it('Aufbau: Glasfaserstift 2195 + 2197 + Material, mehrschichtig ersetzt 2180', () => {
    expect(nrn(plan({ '15': { therapie: 'aufbau', aufbauStift: true } }), '15')).toEqual(['2195', '2197', 'Mat.'])
    expect(nrn(plan({ '15': { therapie: 'aufbau', zusatz: ['mehrschicht'] } }), '15')).toEqual(['2197', '2120a'])
  })

  it('Analoge Therapien: Kariesinfiltration, Veneer, internes Bleichen je Sitzung', () => {
    expect(nrn(plan({ '11': { therapie: 'infiltration' } }), '11')).toEqual(['2060a'])
    expect(nrn(plan({ '11': { therapie: 'veneer' } }), '11')).toEqual(['2120a'])
    const b = rechnen(plan({ '11': { therapie: 'bleaching', sitzungen: 3 } }), einst).zaehne[0].zeilen[0]
    expect(b).toMatchObject({ nr: '2360a', anzahl: 3, ebene: 'ANALOG' })
  })
})

describe('Zusatzleistungen und Stufen', () => {
  it('Stufe 0: nur die Grundleistung, Stufe 1 bringt Standard-Begleitleistungen', () => {
    const z = { '36': { therapie: 'endo', kanaele: 2, vital: true, sitzungen: 2 } as ZahnLeistung }
    expect(begleit(plan(z, 0))).toEqual([])
    const s1 = nrn(plan(z, 1), '36')
    expect(s1).toEqual(expect.arrayContaining(['0090', 'Ä5000', '2400', '2430', '2020']))
    expect(s1).not.toContain('2420')
    expect(nrn(plan(z, 2), '36')).toEqual(expect.arrayContaining(['2420', 'Mat.']))
  })

  it('Chip abwählen und wieder anwählen', () => {
    const p = plan({ '36': { therapie: 'endo', kanaele: 2, vital: true } }, 1)
    const laenge = zusaetzeFuer(p.zaehne['36'], p).find((c) => c.zusatz.id === 'laenge')!
    expect(laenge.aktiv).toBe(true)
    const aus = zusatzUmschalten(p.zaehne['36'], laenge)
    expect(aus.abgewaehlt).toContain('laenge')
    const p2 = { ...p, zaehne: { '36': aus } }
    const wieder = zusatzUmschalten(aus, zusaetzeFuer(aus, p2).find((c) => c.zusatz.id === 'laenge')!)
    expect(wieder.abgewaehlt).not.toContain('laenge')
  })

  it('Kofferdam je Kieferhälfte und Sitzung über alle Zähne', () => {
    const r = begleit(plan({
      '16': { therapie: 'endo', kanaele: 3, vital: true, sitzungen: 2 },
      '17': { therapie: 'komposit', flaechen: 2 },
      '26': { therapie: 'komposit', flaechen: 1 },
    }, 1))
    expect(r.find((x) => x.nr === '2040')?.anzahl).toBe(3)
  })

  it('Mikroskop 0110 einmal je Behandlungstag, einfacher Satz', () => {
    const r = begleit(plan({
      '16': { therapie: 'endo', kanaele: 3, vital: true, sitzungen: 2 },
      '26': { therapie: 'endo', kanaele: 3, vital: true, sitzungen: 2 },
    }, 2))
    const z = r.find((x) => x.nr === '0110')!
    expect(z).toMatchObject({ anzahl: 2, faktor: 1, einzel: 22.5 })
  })

  it('Laser 0120: einfacher Satz von 2410, höchstens 68 €', () => {
    expect(laserZuschlag()).toBe(22.05)
    const r = begleit(plan({ '16': { therapie: 'endo', kanaele: 3, vital: true, sitzungen: 1, zusatz: ['laser'] } }))
    expect(r.find((x) => x.nr === '0120')?.einzel).toBe(22.05)
  })

  it('Faktor über 3,5 landet in der Vereinbarung nach § 2 GOZ', () => {
    const r = rechnen(plan({ '36': { therapie: 'komposit', flaechen: 2, faktor: 4 } }), einst)
    expect(r.vereinbarung2.map((x) => x.nr)).toEqual(['2080'])
  })
})

describe('Kassenpatient mit BEMA-Grundleistung (§ 8 Abs. 7 BMV-Z)', () => {
  const z = { '36': { therapie: 'endo', kanaele: 3, vital: true, sitzungen: 2 } as ZahnLeistung }

  it('Grundleistung und BEMA-Begleitleistungen fallen weg, eigenständige Zusätze bleiben', () => {
    const p = plan(z, 2, 'gkvZusatz')
    const zeilen = nrn(p, '36')
    expect(zeilen).not.toEqual(expect.arrayContaining(['2360']))
    expect(zeilen).not.toContain('2410')
    expect(zeilen).not.toContain('0090')
    expect(zeilen).not.toContain('Ä5000')
    expect(zeilen).toEqual(expect.arrayContaining(['2400', '2420', 'Mat.', '2340a']))
  })

  it('keine Zuschläge 0110/0120 neben BEMA – dafür die eigenständige Analogleistung', () => {
    const p = plan({ '36': { ...z['36'], zusatz: ['laser'] } }, 3, 'gkvZusatz')
    const b = begleit(p).map((x) => x.nr)
    expect(b).not.toContain('0110')
    expect(b).not.toContain('0120')
    expect(zusaetzeFuer(p.zaehne['36'], p).map((c) => c.zusatz.id)).toContain('laserAnalog')
  })

  it('privater Glasfaser-Aufbau behält 0110 – gezählt nach seinen eigenen Sitzungen', () => {
    const p = plan({ ...z, '15': { therapie: 'aufbau', aufbauStift: true } }, 2, 'gkvZusatz')
    expect(begleit(p).find((x) => x.nr === '0110')?.anzahl).toBe(1)
  })

  it('Füllungen gehören in den MKV-Planer', () => {
    const r = rechnen(plan({ '36': { therapie: 'komposit', flaechen: 2 } }, 1, 'gkvZusatz'), einst)
    expect(r.zaehne[0].ausgeschlossen).toMatch(/MKV/)
    expect(r.summe).toBe(0)
  })

  it('komplett privat (§ 8 Abs. 7 BMV-Z) rechnet wie beim Privatpatienten', () => {
    expect(rechnen(plan(z, 2, 'gkvPrivat'), einst).summe).toBe(rechnen(plan(z, 2, 'pkv'), einst).summe)
  })
})

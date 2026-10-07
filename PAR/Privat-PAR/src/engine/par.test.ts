import { describe, expect, it } from 'vitest'
import { rechnen, zaehne } from './par'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import type { Plan } from '../types'

const plan = (patch: Partial<Plan> = {}): Plan => ({ ...neuerPlan('PPAR-T', STANDARD_EINSTELLUNGEN), uptJahre: 0, ...patch })
const zeile = (p: Plan, nr: string, phase?: string) => rechnen(p).zeilen.find((z) => z.nr === nr && (!phase || z.phase === phase))

describe('Zahnschema', () => {
  it('zählt ohne Weisheitszähne 18 ein- und 10 mehrwurzelige Zähne', () => {
    expect(zaehne(plan())).toMatchObject({ ein: 18, mehr: 10 })
  })
})

describe('Privat-PAR-Rechnung', () => {
  it('Beratungsforum: AIT analog 3010a/4138a mit der Bewertung der Referenzleistung', () => {
    const p = plan()
    const ein = zeile(p, '3010a')!
    expect(ein.anzahl).toBe(18)
    // 110 P. × 0,0562421 × 2,3
    expect(ein.einzel).toBe(14.23)
    expect(ein.analog).toMatch(/^entsprechend GOZ 3010 /)
    expect(zeile(p, '4138a')!.anzahl).toBe(10)
    expect(zeile(p, '8000a')!.einzel).toBe(64.68)
    expect(zeile(p, '2110a')!.einzel).toBe(41.26)
  })

  it('BZÄK 2026: andere Analognummern', () => {
    const p = plan({ variante: 'aktuell' })
    expect(zeile(p, '7080a')!.einzel).toBe(77.61)
    expect(zeile(p, '4000a')!.einzel).toBe(20.7)
    expect(zeile(p, '3130a')!.einzel).toBe(36.22)
    expect(rechnen(p).hinweise.some((h) => h.includes('Erstattungsrisiko'))).toBe(true)
  })

  it('CPT: Front 4090, Seite 4100, Zuschlag 0500 je Quadrant mit Faktor 1,0', () => {
    const p = plan({ cpt: ['11', '16', '17', '46'] })
    expect(zeile(p, '4090')!.anzahl).toBe(1)
    expect(zeile(p, '4100')!.anzahl).toBe(3)
    const z = zeile(p, '0500')!
    expect(z.anzahl).toBe(2)
    expect(z.faktor).toBe(1)
    expect(z.einzel).toBe(22.5)
    expect(zeile(p, '4150')!.anzahl).toBe(4)
    expect(zeile(p, '5070a', 'bev')!.anzahl).toBe(2)
  })

  it('UPT Grad C: 3 Sitzungen, ab der dritten Index-Erhebung analog', () => {
    const p = plan({ grad: 'C', uptJahre: 1, resttaschen: 50 })
    const r = rechnen(p)
    expect(r.uptSitzungen).toBe(3)
    expect(zeile(p, '4005', 'upt')!.anzahl).toBe(2)
    expect(zeile(p, '4005a', 'upt')!.anzahl).toBe(1)
    // Resttaschen 50 %: 9 von 18 ein-, 5 von 10 mehrwurzeligen Zähnen je Sitzung
    expect(zeile(p, '0090a', 'upt')!.anzahl).toBe(27)
    expect(zeile(p, '2197a', 'upt')!.anzahl).toBe(15)
    expect(zeile(p, '1040', 'upt')!.anzahl).toBe(84)
  })

  it('Faktor über 3,5 verlangt die Vereinbarung nach § 2 GOZ', () => {
    const r = rechnen(plan({ faktoren: { '4138a': 3.8 } }))
    expect(r.vereinbarung2.map((z) => z.nr)).toEqual(['4138a'])
  })

  it('GOZ 4000 neben der analogen Diagnostik wird gewarnt', () => {
    const r = rechnen(plan({ zusatz: [{ id: 'x', nr: '4000', anzahl: 1 }] }))
    expect(r.warnungen.some((w) => w.includes('4000'))).toBe(true)
  })
})

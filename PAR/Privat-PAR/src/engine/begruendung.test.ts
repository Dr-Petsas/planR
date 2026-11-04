import { describe, expect, it } from 'vitest'
import { rechnen } from './par'
import { begruendungen, begruendungText } from './begruendung'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import type { Plan } from '../types'

const plan = (patch: Partial<Plan> = {}): Plan => ({ ...neuerPlan('PPAR-T', STANDARD_EINSTELLUNGEN), uptJahre: 0, ...patch })

describe('Begründungen über 2,3', () => {
  it('bis 2,3 keine, darüber je Leistung genau eine, Zuschläge und Material nie', () => {
    expect(begruendungen(rechnen(plan({ faktor: 2.3 })).zeilen)).toEqual([])
    const r = rechnen(plan({ faktor: 3 }))
    const b = begruendungen(r.zeilen)
    expect(b.length).toBeGreaterThan(3)
    expect(new Set(b.map((x) => x.zeile.nr)).size).toBe(b.length)
    expect(b.some((x) => x.zeile.fest || x.zeile.nr === 'Mat.')).toBe(false)
  })

  it('Analogleistungen nach dem Leistungstext, sonst nach der GOZ-Nummer', () => {
    expect(begruendungText({ nr: '3010a', text: 'Subgingivale Instrumentierung (antiinfektiöse Therapie), einwurzeliger Zahn' })).toMatch(/Konkremente/)
    expect(begruendungText({ nr: '4090', text: 'Lappenoperation' })).toMatch(/chirurgische Darstellung/)
    expect(begruendungText({ nr: '9999', text: '' })).toMatch(/Schwierigkeitsgrad/)
  })
})

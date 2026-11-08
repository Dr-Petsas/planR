import { describe, expect, it } from 'vitest'
import { istJa, istNein, istPlanAuftrag, planNameGesucht } from './arbeitClient'

describe('Bestätigung der KI-Zeile', () => {
  it('erkennt die Zusage und lässt einen Nachsatz nicht als Ja gelten', () => {
    expect(istJa('meinetwegen ja')).toBe(true)
    expect(istJa('ja.')).toBe(true)
    expect(istJa('ja aber Straumann')).toBe(false)
  })

  it('erkennt die Absage', () => {
    expect(istNein('nein')).toBe(true)
    expect(istNein('nicht ändern')).toBe(true)
    expect(istNein('nicht')).toBe(false)
  })

  it('nimmt den Namen aus einem Öffnen-Satz', () => {
    expect(planNameGesucht('öffne den Plan zaharia')).toBe('zaharia')
    expect(planNameGesucht('zeig mir den HKP von Frau Zaharia')).toBe('Zaharia')
    expect(planNameGesucht('ändere das implantatsystem')).toBeNull()
    expect(planNameGesucht('öffne den Plan und nimm Zirkon')).toBeNull()
  })

  it('unterscheidet einen Planauftrag von einer Frage', () => {
    expect(istPlanAuftrag('ändere das implantatsystem')).toBe(true)
    expect(istPlanAuftrag('geht 9050 2 mal?')).toBe(true)
    expect(istPlanAuftrag('Ist das Zirkon?')).toBe(false)
    expect(istPlanAuftrag('Nimm Zirkon')).toBe(true)
  })
})

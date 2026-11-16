import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { leererPlan } from './store/plan'
import { berechnen, type Listen } from '@kern/engine/berechnung'
import { STANDARD_LISTEN } from './store/preislisten'
import { planAusSchema, zuschussAbgleich } from './probeImport'
import { blattUebernehmen, originalErgebnis } from './probeOriginal'
import { blattAusEinlesen } from '../../../Start/src/einlesenZeilen'
import antwort from '../../../Start/src/testdaten/thaler.json'

const l = (typ: string, id: string) => STANDARD_LISTEN.find((x) => x.typ === typ && x.id === id) as never
const LISTEN: Listen = { bema: l('bema', 'bema-2026'), goz: l('goz', 'goz-2012'), bel: l('bel2', 'bel2-bayern-2026'), beb: l('beb', 'beb-itz-2024'), fz: l('festzuschuss', 'fz-2026') }

// Plan Thaler (15.11.2026): Brücke 24–26, Teil 1, Teil 2 und Praxislaborbeleg in einem PDF.
describe('Plan Thaler durch die ganze Kette', () => {
  it('steht im Planer mit den Zahlen vom Blatt', () => {
    const blatt = blattAusEinlesen(antwort as never)
    const gelesen = planAusSchema(leererPlan().einstellungen, blatt.schema as never, blatt.positionen as never)
    const zuschuss = zuschussAbgleich(gelesen.plan, LISTEN, blatt.summen as never)
    const b = blattUebernehmen(zuschuss.plan, LISTEN, blatt.positionen as never, blatt.summen as never)
    const roh = berechnen(b.plan, LISTEN)
    const e = originalErgebnis(roh, b.original!)
    if (process.env.THALER_AUS) writeFileSync(process.env.THALER_AUS, JSON.stringify({ plan: b.plan, hinweise: [...b.hinweise, ...zuschuss.hinweise, ...gelesen.hinweise], roh: roh.summen, original: e.summen, positionen: roh.positionen }, null, 1))
    expect(e.summen.gesamt).toBe(2941.54)
    expect(e.summen.festzuschuss).toBe(711.88)
    expect(e.summen.eigenanteil).toBe(2229.66)
    // Ohne Überschreiben mit den Blattsummen: PlanR rechnet aus den gelesenen Zeilen dasselbe.
    expect(Math.abs(roh.summen.gozHonorar - 1100.57)).toBeLessThan(0.05)
    expect(Math.abs(roh.summen.materialUndLabor - 1688.18)).toBeLessThan(0.05)
    expect(Math.abs(roh.summen.festzuschuss - 711.88)).toBeLessThan(0.05)
    expect(Math.abs(roh.summen.gesamt - 2941.54)).toBeLessThan(0.1)
    expect([...b.hinweise, ...zuschuss.hinweise].join(' ')).not.toContain('gegenlesen')
  })
})

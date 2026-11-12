import { describe, expect, it } from 'vitest'
import { leererPlan } from './store/plan'
import { berechnen, type Listen } from './engine/berechnung'
import { STANDARD_LISTEN } from './store/preislisten'
import { blattUebernehmen, ohneBlatt, originalErgebnis, planSchluessel, vomBlatt } from './probeOriginal'
import type { ProbeGebuehr } from './probeImport'

const l = (typ: string, id: string) => STANDARD_LISTEN.find((x) => x.typ === typ && x.id === id) as never
const LISTEN: Listen = { bema: l('bema', 'bema-2026'), goz: l('goz', 'goz-2012'), bel: l('bel2', 'bel2-bayern-2026'), beb: l('beb', 'beb-itz-2024'), fz: l('festzuschuss', 'fz-2026') }

const GEBUEHREN: ProbeGebuehr[] = [
  { ebene: 'GOZ', nr: '2200', zahn: '46', anzahl: 1, betrag: 260 },
  { ebene: 'GOZ', nr: '2200', zahn: '47', anzahl: 1, betrag: 260 },
  { ebene: 'BEB', nr: '02161', zahn: '', anzahl: 2, betrag: 199, text: 'Zirkonkrone' },
]
const SUMMEN = { honorarGoz: 520, honorarBema: 0, labor: 450, gesamt: 970, festzuschuss: 300, eigenanteil: 670, laborBeleg: 450.11 }

describe('Originalzustand vom Blatt', () => {
  it('zeigt die Summen exakt wie auf dem Blatt', () => {
    const b = blattUebernehmen(leererPlan(), LISTEN, GEBUEHREN, SUMMEN)
    expect(b.original).not.toBeNull()
    const e = originalErgebnis(berechnen(b.plan, LISTEN), b.original!)
    expect(e.summen.gozHonorar).toBe(520)
    expect(e.summen.materialUndLabor).toBe(450)
    expect(e.summen.gesamt).toBe(970)
    expect(e.summen.festzuschuss).toBe(300)
    expect(e.summen.eigenanteil).toBe(670)
  })

  it('rechnet nach einer Änderung dicht am Blatt weiter, Labor nicht doppelt', () => {
    const b = blattUebernehmen(leererPlan(), LISTEN, GEBUEHREN, SUMMEN)
    const e = berechnen(b.plan, LISTEN)
    expect(e.summen.materialUndLabor).toBeCloseTo(450.11, 2)
    expect(Math.abs(e.summen.gozHonorar - 520)).toBeLessThan(1)
  })

  it('erkennt den unveränderten Plan am Schlüssel', () => {
    const b = blattUebernehmen(leererPlan(), LISTEN, GEBUEHREN, SUMMEN)
    expect(planSchluessel(b.plan)).toBe(b.original!.schluessel)
    const anders = { ...b.plan, einstellungen: { ...b.plan.einstellungen, honorarFaktor: 3.5 } }
    expect(planSchluessel(anders)).not.toBe(b.original!.schluessel)
  })

  it('nimmt die Blattzeilen vor einem Lauf der Regelengine wieder heraus', () => {
    const start = leererPlan()
    const b = blattUebernehmen(start, LISTEN, GEBUEHREN, SUMMEN)
    const q = ohneBlatt(b.plan, b.original)
    expect(q.positionen.some(vomBlatt)).toBe(false)
    expect(q.einstellungen.mwstLabor).toBe(start.einstellungen.mwstLabor)
  })

  it('meldet, wenn nur Teil 1 hochgeladen ist', () => {
    const b = blattUebernehmen(leererPlan(), LISTEN, [], { festzuschuss: 300 })
    expect(b.original).toBeNull()
    expect(b.hinweise[0]).toContain('Teil 2')
  })

  it('führt Fremdlabor als eigene Summe, wenn Teil 2 mehr ausweist als der Eigenbeleg', () => {
    const b = blattUebernehmen(leererPlan(), LISTEN, GEBUEHREN, { ...SUMMEN, labor: 1000, gesamt: 1520 })
    const e = berechnen(b.plan, LISTEN)
    expect(e.summen.materialUndLabor).toBeCloseTo(1000, 2)
  })
})

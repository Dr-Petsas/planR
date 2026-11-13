import { describe, expect, it } from 'vitest'
import { leererPlan } from './plan'
import { liveSchritte, liveZiel, type LiveStand } from './live'

const stand = (teil: Partial<LiveStand>): LiveStand => ({
  vorgang: 'v1', seq: 1, phase: 'patient', patient: null, befund: null, plan: null, hkpId: '', meldung: '', at: 0, ...teil,
})
const patient = { id: '2', label: 'Herrn Mustermann', name: 'Mustermann', vorname: 'Helmut', geburtsdatum: '1952-05-13' }

describe('Clara plant live', () => {
  it('Patient zuerst, ohne den übrigen Plan anzufassen', () => {
    const von = leererPlan()
    const s = liveSchritte(von, stand({ patient }))
    expect(s).toHaveLength(1)
    expect(s[0].patient.name).toBe('Mustermann')
    expect(s[0].patient.vorname).toBe('Helmut')
    expect(s[0].zaehne).toBe(von.zaehne)
  })

  it('Befund Zahn für Zahn, nicht genannte Zähne leer', () => {
    const von = { ...leererPlan(), zaehne: { ...leererPlan().zaehne, 11: { B: 'k', R: '', TP: '' } } }
    const s = liveSchritte(von, stand({ phase: 'befund', befund: { 16: 'f', 26: 'ww' } }))
    expect(s.map((p) => [p.zaehne[16].B, p.zaehne[26].B, p.zaehne[11].B])).toEqual([['f', '', 'k'], ['f', '', ''], ['f', 'ww', '']])
  })

  it('Planung: erst alle Befunde, dann die Versorgung je Zahn, zuletzt der fertige Plan', () => {
    const plan = leererPlan()
    plan.zaehne[15] = { B: 'f', R: 'B', TP: 'BM' }
    plan.zaehne[16] = { B: 'k', R: 'K', TP: 'K' }
    plan.positionen = [{ id: 'p1' } as never]
    const s = liveSchritte(leererPlan(), stand({ phase: 'plan', plan }))
    expect(s.map((p) => `${p.zaehne[15].B}${p.zaehne[15].TP}|${p.zaehne[16].B}${p.zaehne[16].TP}|${p.positionen.length}`))
      .toEqual(['|k|0', 'f|k|0', 'f|kK|0', 'fBM|kK|0', 'fBM|kK|1'])
    expect(s.at(-1)).toEqual(liveZiel(leererPlan(), stand({ plan })))
  })

  it('nichts Neues: keine Schritte', () => {
    const von = leererPlan()
    expect(liveSchritte(von, stand({}))).toEqual([])
  })
})

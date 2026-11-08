import { describe, expect, it } from 'vitest'
import { hkpDienst, hkpVorschlag } from './arbeitPlan'
import { leererPlan } from './store/plan'
import type { HkpPlan } from './types'

function mit9050(anzahl: number): HkpPlan {
  const plan = leererPlan()
  plan.zaehne['36'] = { ...plan.zaehne['36'], B: 'f', TP: 'SK' }
  plan.positionen = [{ id: 'p9050', ebene: 'GOZ', nr: '9050', zahn: '36', anzahl, auto: true }]
  return plan
}

describe('HKP-Arbeitshilfe', () => {
  it('lässt den Plan stehen und merkt 9050 zweimal vor', () => {
    const plan = mit9050(1)
    const vorher = JSON.stringify(plan)
    const r = hkpVorschlag(plan, 'geht 9050 2 mal?')
    expect(JSON.stringify(plan)).toBe(vorher)
    expect(r.art).toBe('vorschlag')
    if (r.art !== 'vorschlag') return
    expect(r.plan.positionen.find((p) => p.nr === '9050')?.anzahl).toBe(2)
    expect(r.text).toMatch(/üblich/)
    expect(r.text).toMatch(/Soll ich das anpassen\?/)
  })

  it('fragt nach dem System, bevor es eines einträgt', () => {
    const r = hkpVorschlag(mit9050(1), 'ändere das implantatsystem')
    expect(r.art).toBe('antwort')
    if (r.art === 'antwort') expect(r.text).toMatch(/Welches/)
  })

  it('Straumann und die fehlende zweite 9050 kommen in einem Vorschlag', () => {
    const plan = mit9050(1)
    const r = hkpVorschlag(plan, 'ändere das implantatsystem auf Straumann')
    expect(r.art).toBe('vorschlag')
    if (r.art !== 'vorschlag') return
    expect(r.plan.implantat.system).toBe('straumann-bl')
    expect(r.plan.positionen.find((p) => p.nr === '9050')?.anzahl).toBe(2)
    expect(plan.implantat.system).toBe('durchschnitt')
    expect(plan.positionen[0].anzahl).toBe(1)
  })

  it('schreibt erst auf Ja und ein zweites Ja ohne Vorschlag nicht noch einmal', () => {
    const plan = mit9050(1)
    const v = hkpDienst({ aktion: 'vorschlag', text: 'geht 9050 2 mal?' }, () => plan, () => {})
    expect(v.art).toBe('vorschlag')
    if (v.art !== 'vorschlag' || !v.vorschlag) throw new Error('kein Vorschlag')
    let n = 0
    const a = hkpDienst({ aktion: 'anwenden', id: v.vorschlag }, () => plan, (neu) => {
      n += 1
      expect(neu.positionen.find((p) => p.nr === '9050')?.anzahl).toBe(2)
    })
    expect(a.art).toBe('erledigt')
    expect(a.text).toMatch(/^Erledigt:/)
    expect(n).toBe(1)
    const nochmal = hkpDienst({ aktion: 'anwenden', id: v.vorschlag }, () => plan, () => { n += 1 })
    expect(nochmal.art).toBe('hinweis')
    expect(n).toBe(1)
  })

  it('Nein schreibt nicht', () => {
    const plan = mit9050(1)
    const v = hkpDienst({ aktion: 'vorschlag', text: 'geht 9050 2 mal?' }, () => plan, () => {})
    if (v.art !== 'vorschlag' || !v.vorschlag) throw new Error('kein Vorschlag')
    let n = 0
    const r = hkpDienst({ aktion: 'verwerfen', id: v.vorschlag }, () => plan, () => { n += 1 })
    expect(r.text).toMatch(/lasse den Plan/)
    expect(n).toBe(0)
  })

  it('Zirkon wird vorgeschlagen, eine Frage danach nicht geschrieben', () => {
    const plan = leererPlan()
    plan.zaehne['16'] = { ...plan.zaehne['16'], B: 'ww', TP: 'K' }
    const v = hkpVorschlag(plan, 'Nimm Zirkon')
    expect(v.art).toBe('vorschlag')
    if (v.art === 'vorschlag') expect(v.plan.zaehne['16'].TP).toBe('KM')
    expect(plan.zaehne['16'].TP).toBe('K')
    const frage = hkpVorschlag(plan, 'Ist das Zirkon?')
    expect(frage.art).not.toBe('vorschlag')
  })
})

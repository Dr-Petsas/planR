import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { implAnwenden, implBlick } from './kiPlan'
import { ausschlussMeldung, planPruefen } from './pruefung'
import { pruefGemerkt, pruefLaeuft, pruefMerken } from './planKi'
import type { Plan } from './types'

const plan = (): Plan => ({ ...neuerPlan(1), zaehne: { '16': { B: 'f', TP: 'I' } } })

describe('KI-Zeile am Implantatplan', () => {
  it('liest den Plan ohne Patientendaten', () => {
    const b = implBlick({ ...plan(), patient: { ...plan().patient, name: 'Geheim', vorname: 'Ganz' } }, E, false)
    expect(b.positionen.length).toBeGreaterThan(0)
    expect(b.schalter.some((s) => s.name === 'region.OK-R.augmentation' && s.wert === false)).toBe(true)
    expect(JSON.stringify(b)).not.toContain('Geheim')
    expect(b.summen.gesamt).toBeGreaterThan(0)
  })

  it('schaltet den Knochenaufbau ein: GOZ 9100 steht danach im Plan', () => {
    const p = plan()
    expect(implBlick(p, E, false).positionen.some((z) => z.nr === '9100')).toBe(false)
    const r = implAnwenden(p, E, [{ op: 'schalter', name: 'region.OK-R.augmentation', wert: true }])
    expect(r.getan).toHaveLength(1)
    const danach = implBlick(r.plan, E, false)
    expect(danach.positionen.some((z) => z.nr === '9100')).toBe(true)
    expect(danach.summen.gesamt).toBeGreaterThan(implBlick(p, E, false).summen.gesamt)
  })

  it('ändert, entfernt und ergänzt Positionen; unbekannte Nummern bleiben draußen', () => {
    const p = plan()
    const erste = implBlick(p, E, false).positionen.find((z) => z.ebene === 'GOZ' && z.auto)!
    const r = implAnwenden(p, E, [
      { op: 'setze', id: erste.id, faktor: 3.5 },
      { op: 'hinzu', ebene: 'GOZ', nr: '0030', zahn: '', anzahl: 1 },
      { op: 'hinzu', ebene: 'GOZ', nr: '99999', zahn: '', anzahl: 1 },
      { op: 'setze', id: erste.id, faktor: 5 },
    ])
    const b = implBlick(r.plan, E, false)
    expect(b.positionen.find((z) => z.id === erste.id)?.faktor).toBe(3.5)
    expect(b.positionen.some((z) => z.nr === '0030')).toBe(true)
    expect(b.positionen.some((z) => z.nr === '99999')).toBe(false)
    expect(r.nicht.some((n) => n.includes('99999'))).toBe(true)
    expect(r.nicht.some((n) => n.includes('§ 2'))).toBe(true)
    const weg = implAnwenden(r.plan, E, [{ op: 'weg', id: erste.id }])
    expect(implBlick(weg.plan, E, false).positionen.some((z) => z.id === erste.id)).toBe(false)
  })
})

describe('Prüfmodul', () => {
  const z = { id: 'a', ebene: 'GOZ', nr: '9010', zahn: '16', anzahl: 1, faktor: 2.3, betrag: 100, text: 'Implantat' }
  it('findet Fehler und Warnungen', () => {
    const m = planPruefen([
      z, { ...z, id: 'b' }, { ...z, id: 'c', nr: '9100', faktor: 4 }, { ...z, id: 'd', nr: '9040', betrag: 0 },
      { ...z, id: 'e', nr: '9000', faktor: 3, zahn: '' },
    ], { begruendung: true })
    expect(m.filter((x) => x.stufe === 'fehler')).toHaveLength(2)
    expect(m.some((x) => x.text.includes('zweimal'))).toBe(true)
    expect(m.some((x) => x.text.includes('§ 10'))).toBe(true)
    expect(m[0].stufe).toBe('fehler')
  })
  it('meldet nichts an einem sauberen Plan', () => {
    expect(planPruefen([z])).toEqual([])
  })
})

describe('Prüfmodul für die KI-Zeile', () => {
  const z = { id: 'a', ebene: 'GOZ', nr: '9010', zahn: '16', anzahl: 1, faktor: 2.3, betrag: 100, text: 'Implantat' }
  it('jede Meldung nennt Art und betroffene Positionen', () => {
    const m = planPruefen([z, { ...z, id: 'b' }, { ...z, id: 'c', nr: '9100', faktor: 4 }, { ...z, id: 'd', nr: '9040', faktor: 3 }], { begruendung: true })
    expect(m.find((x) => x.art === 'doppelt')?.ids).toEqual(['a', 'b'])
    expect(m.find((x) => x.art === 'faktor_ueber_35')?.ids).toEqual(['c'])
    expect(m.filter((x) => x.art === 'begruendung_fehlt').flatMap((x) => x.ids ?? []).sort()).toEqual(['d'])
    expect(m.every((x) => x.art && x.ids?.length)).toBe(true)
  })
  it('ein Ausschluss vom Server bekommt die ids seiner beiden Nummern', () => {
    const m = ausschlussMeldung({ text: '9130 nicht neben 9100', a: '9130', b: '9100', katalog: 'GOZ' }, [z, { ...z, id: 'x', nr: '9130' }, { ...z, id: 'y', nr: '9100' }, { ...z, id: 'l', ebene: 'BEB', nr: '9100' }])
    expect(m).toMatchObject({ stufe: 'fehler', art: 'ausschluss', ids: ['x', 'y'] })
    expect(ausschlussMeldung({ a: '1', b: '2' }, [z])).toBeNull()
  })
  it('gibt den Stand der Prüfung an die Zeile weiter', () => {
    pruefMerken([{ stufe: 'warnung', text: 't', art: 'begruendung_fehlt', ids: ['a'] }], true)
    expect(pruefLaeuft()).toBe(true)
    pruefMerken([])
    expect(pruefLaeuft()).toBe(false)
    expect(pruefGemerkt()).toEqual([])
  })
  it('eine Begründung aus der Zeile steht danach an der Position', () => {
    const p = plan()
    const ziel = implBlick(p, E, false).positionen.find((x) => x.ebene === 'GOZ')
    if (!ziel) throw new Error('keine GOZ-Position im Plan')
    const text = 'Erhöhter Zeitaufwand durch erschwerten Zugang.'
    const mit = implAnwenden(p, E, [{ op: 'setze', id: ziel.id, faktor: 3.5, begruendung: text }])
    expect(mit.getan.length).toBe(1)
    const danach = implBlick(mit.plan, E, false).positionen
    expect(danach.find((x) => x.id === ziel.id)?.begruendung).toBe(text)
    expect(planPruefen(danach, { begruendung: true }).some((x) => x.art === 'begruendung_fehlt' && x.ids?.includes(ziel.id))).toBe(false)
  })
})

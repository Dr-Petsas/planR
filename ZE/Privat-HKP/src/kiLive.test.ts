import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { zeAnwenden, zeBlick } from './kiPlan'
import { KI_LIVE, kiProbe } from './kiProbe'
import type { Plan } from './types'

/** Echte Sätze gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiLive.test.ts */
const krone = (...zaehne: string[]): Plan =>
  zeAnwenden(neuerPlan(1), E, zaehne.map((z) => ({ op: 'zahn' as const, zahn: z, felder: { befund: 'kw', planung: 'KM' } }))).plan
const zug = (p: Plan, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) =>
  kiProbe({ plan: p, text, verlauf, blick: (x) => zeBlick(x, E, false), anwenden: (x, s) => zeAnwenden(x, E, s) })
const pos = (p: Plan) => zeBlick(p, E, false).positionen
const tp = (p: Plan, z: string) => p.zaehne[z]?.TP ?? ''
const euro = (n: number) => n.toFixed(2).replace('.', ',')

describe.skipIf(!KI_LIVE)('KI-Zeile live: privater ZE-Plan', { timeout: 240_000 }, () => {
  it('beantwortet eine Frage zur Summe, ohne den Plan zu ändern', async () => {
    const p = krone('16')
    const r = await zug(p, 'Wie hoch sind die Gesamtkosten und wie viel davon ist Labor?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text.replace(/\./g, '')).toContain(euro(zeBlick(p, E, false).summen.gesamt))
  })

  it('erklärt, welche Positionen zu einer Krone gehören', async () => {
    const p = krone('16')
    const r = await zug(p, 'Welche Gebührenpositionen rechnen wir für die Krone an 16 ab und wofür stehen sie?')
    expect(r.schritte).toHaveLength(0)
    const nrn = pos(p).filter((z) => z.ebene === 'GOZ').map((z) => z.nr)
    expect(nrn.some((n) => r.text.includes(n))).toBe(true)
  })

  it('erweitert um eine Krone', async () => {
    const r = await zug(krone('16'), 'Zahn 26 ist auch überkronungsbedürftig und bekommt ebenfalls eine Vollkeramikkrone.')
    expect(tp(r.plan, '26')).toBe('KM')
    expect(tp(r.plan, '16')).toBe('KM')
  })

  it('kürzt um eine Krone', async () => {
    const r = await zug(krone('16', '26'), 'Die Krone an 26 machen wir doch nicht.')
    expect(tp(r.plan, '26')).toBe('')
    expect(tp(r.plan, '16')).toBe('KM')
  })

  it('plant eine Brücke aus einem Satz', async () => {
    const r = await zug(neuerPlan(1), 'Zahn 15 fehlt. Plane eine vollkeramische Brücke von 14 auf 16.')
    expect(tp(r.plan, '14')).toBe('KM')
    expect(tp(r.plan, '16')).toBe('KM')
    expect(tp(r.plan, '15')).toMatch(/^B/)
  })

  it('macht aus der Brücke wieder Einzelkronen-frei: Brücke löschen', async () => {
    const mit = (await zug(neuerPlan(1), 'Zahn 15 fehlt. Plane eine vollkeramische Brücke von 14 auf 16.')).plan
    const r = await zug(mit, 'Die Brücke 14 bis 16 bitte komplett wieder herausnehmen, der Patient will ein Implantat.')
    expect(tp(r.plan, '14') + tp(r.plan, '15') + tp(r.plan, '16')).toBe('')
  })

  it('wechselt das Kronenmaterial', async () => {
    const r = await zug(krone('16', '26'), 'Beide Kronen sollen aus Zirkon sein.')
    expect(r.plan.werkstoffe).toMatchObject({ 16: 'zirkon', 26: 'zirkon' })
  })

  it('ändert einen Faktor mit Begründung', async () => {
    const p = krone('16')
    const z = pos(p).find((x) => x.ebene === 'GOZ' && x.nr.startsWith('22'))!
    const r = await zug(p, `Setz die ${z.nr} auf 3,2-fach wegen stark erschwerter Präparation bei tief subgingivalem Defekt.`)
    const neu = pos(r.plan).find((x) => x.id === z.id)!
    expect(neu.faktor).toBe(3.2)
    expect(neu.begruendung ?? '').toMatch(/subgingival|Präparation/i)
  })

  it('trägt eine Position nach und löscht sie wieder', async () => {
    const a = await zug(krone('16'), 'Trag noch eine GOZ 0030 ein.')
    expect(pos(a.plan).filter((z) => z.nr === '0030')).toHaveLength(1)
    const b = await zug(a.plan, 'Die 0030 wieder raus.', a.verlauf)
    expect(pos(b.plan).filter((z) => z.nr === '0030')).toHaveLength(0)
  })

  it('erklärt den Unterschied der Summe nach einer Änderung', async () => {
    const p = krone('16')
    const r = await zug(p, 'Warum ist das Laborhonorar so hoch, was steckt da drin?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text.length).toBeGreaterThan(40)
  })
})

import { describe, expect, it } from 'vitest'
import { leererPlan } from './store/plan'
import { hkpAnwenden, hkpKi } from './kiPlan'
import { listenFuer, rechnen } from './clara'
import { KI_LIVE, kiProbe, probeDienst } from './kiProbe'
import type { HkpPlan } from './types'
import type { KiSchritt } from './planKi'

/** Echte Sätze gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiLive.test.ts */
const zahn = (z: string, felder: Record<string, string | boolean>): KiSchritt => ({ op: 'zahn', zahn: z, felder })
const mit = (...s: KiSchritt[]): HkpPlan => hkpAnwenden(leererPlan(), s).plan
const dienst = probeDienst<HkpPlan>((lesen, schreiben) =>
  hkpKi(() => { const plan = lesen(); return { plan, ergebnis: rechnen(plan), listen: listenFuer(plan), gesperrt: false } }, schreiben))
const zug = (p: HkpPlan, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) => kiProbe({ plan: p, text, verlauf, ...dienst })
const z = (p: HkpPlan, nr: string) => (p.zaehne as unknown as Record<string, { B?: string; TP?: string }>)[nr] ?? {}
const euro = (n: number) => n.toFixed(2).replace('.', ',')
const fz = (p: HkpPlan) => rechnen(p).befunde.map((b) => b.nr)

describe.skipIf(!KI_LIVE)('KI-Zeile live: Kassen-HKP', { timeout: 240_000 }, () => {
  it('nennt Festzuschuss und Eigenanteil, ohne den Plan zu ändern', async () => {
    const p = mit(zahn('16', { befund: 'ww' }))
    const r = await zug(p, 'Wie hoch ist der Festzuschuss und was muss der Patient selbst zahlen?')
    expect(r.schritte).toHaveLength(0)
    const s = rechnen(p).summen
    const t = r.text.replace(/\./g, '')
    expect(t).toContain(euro(s.festzuschuss))
    expect(t).toContain(euro(s.eigenanteil))
  })

  it('erklärt den angesetzten Festzuschuss-Befund', async () => {
    const p = mit(zahn('16', { befund: 'ww' }))
    const r = await zug(p, 'Welcher Festzuschuss-Befund ist hier angesetzt und warum?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text).toContain(fz(p)[0])
  })

  it('erweitert um eine Krone', async () => {
    const r = await zug(mit(zahn('16', { befund: 'ww' })), 'Zahn 26 ist auch weitgehend zerstört und braucht eine Krone.')
    expect(z(r.plan, '26').B).toBe('ww')
    expect(rechnen(r.plan).positionen.some((x) => x.zahn.includes('26'))).toBe(true)
  })

  it('nimmt zwei Kronen dazu, ohne nach dem Befund zu fragen, und lässt die Brücke stehen', async () => {
    const bruecke = mit(zahn('14', { befund: 'kw' }), zahn('15', { befund: 'f' }), zahn('16', { befund: 'kw' }))
    const r = await zug(bruecke, 'Füge noch zwei Kronen hinzu, an 24 und 25.')
    expect(z(r.plan, '24').B).toBe('ww')
    expect(z(r.plan, '25').B).toBe('ww')
    expect(z(r.plan, '15').B).toBe('f')
    expect(rechnen(r.plan).summen.gesamt).toBeGreaterThan(rechnen(bruecke).summen.gesamt)
  })

  it('stellt die Verblendung einer Brücke um', async () => {
    const bruecke = mit(zahn('14', { befund: 'kw' }), zahn('15', { befund: 'f' }), zahn('16', { befund: 'kw' }))
    const voll = await zug(bruecke, 'Die Brücke soll voll verblendet werden.')
    expect(z(voll.plan, '16').TP).toBe('KM')
    const r = await zug(voll.plan, 'vestibuläre Verblendung')
    expect(z(r.plan, '16').TP ?? '').toBe('')
    expect(rechnen(r.plan).summen.gesamt).toBeLessThan(rechnen(voll.plan).summen.gesamt)
  })

  it('kürzt um eine Krone', async () => {
    const r = await zug(mit(zahn('16', { befund: 'ww' }), zahn('26', { befund: 'ww' })), 'Die Krone an 26 machen wir doch nicht, nur 16 bleibt.')
    expect(rechnen(r.plan).positionen.some((x) => x.zahn.includes('26'))).toBe(false)
    expect(rechnen(r.plan).positionen.some((x) => x.zahn.includes('16'))).toBe(true)
  })

  it('plant eine Brücke aus einem Satz', async () => {
    const r = await zug(leererPlan(), 'Zahn 15 fehlt, 14 und 16 sind überkronungsbedürftig. Bitte eine Brücke von 14 auf 16 planen.')
    expect(z(r.plan, '15').B).toBe('f')
    expect(fz(r.plan).some((n) => n.startsWith('2.'))).toBe(true)
  })

  it('setzt Bonus und Härtefall', async () => {
    const p = mit(zahn('16', { befund: 'ww' }))
    const a = await zug(p, 'Der Patient hat sein Bonusheft seit zehn Jahren lückenlos geführt.')
    expect(a.plan.zuschuss.bonus).toBe('75')
    const b = await zug(a.plan, 'Außerdem ist er ein Härtefall.', a.verlauf)
    expect(b.plan.zuschuss.haertefall).toBe(true)
    expect(rechnen(b.plan).summen.festzuschuss).toBeGreaterThan(rechnen(p).summen.festzuschuss)
  })

  it('wechselt auf eine gleichartige Versorgung und erklärt sie', async () => {
    const p = mit(zahn('16', { befund: 'ww' }))
    const a = await zug(p, 'Die Krone an 16 soll vollkeramisch werden.')
    expect(z(a.plan, '16').TP).toBe('KM')
    expect(rechnen(a.plan).summen.eigenanteil).toBeGreaterThan(rechnen(p).summen.eigenanteil)
    const b = await zug(a.plan, 'Warum zahlt der Patient jetzt mehr, der Festzuschuss ist doch derselbe?', a.verlauf)
    expect(b.schritte).toHaveLength(0)
    expect(b.text).toMatch(/gleichartig|Mehrkosten|GOZ|Regelversorgung/i)
  })

  it('ändert das Kronenmaterial nur an dem genannten Zahn', async () => {
    const p = mit(zahn('16', { befund: 'ww' }), zahn('26', { befund: 'ww' }))
    const r = await zug(p, 'Die Krone an 16 soll vollkeramisch werden.')
    expect(r.schritte.some((x) => x.op === 'schalter' && x.name === 'kronenmaterial')).toBe(false)
    expect(r.schritte.filter((x) => x.op === 'zahn').map((x) => (x as { zahn: string }).zahn)).toEqual(['16'])
    expect(z(r.plan, '26')).toEqual(z(p, '26'))
    expect(r.plan.werkstoffe?.['26']).toBe(p.werkstoffe?.['26'])
    const pos = (q: HkpPlan, nr: string) => rechnen(q).positionen.filter((x) => x.zahn.includes(nr)).map((x) => `${x.ebene} ${x.nr} ${x.betrag}`).join('|')
    expect(pos(r.plan, '26')).toBe(pos(p, '26'))
    expect(pos(r.plan, '16')).not.toBe(pos(p, '16'))
  })

  it('geht zurück auf die Regelversorgung', async () => {
    const p = mit(zahn('16', { befund: 'ww', planung: 'KM' }))
    const r = await zug(p, 'Doch nur die Regelversorgung an 16, keine Keramik.')
    expect(z(r.plan, '16').TP ?? '').not.toBe('KM')
    expect(z(r.plan, '16').B).toBe('ww')
  })

  it('löscht den ganzen Zahnersatz aus dem Plan', async () => {
    const p = mit(zahn('16', { befund: 'ww' }), zahn('26', { befund: 'ww' }))
    const r = await zug(p, 'Bitte beide Kronen aus dem Plan nehmen, der Patient hat abgesagt.')
    expect(rechnen(r.plan).positionen.filter((x) => /16|26/.test(x.zahn))).toHaveLength(0)
  })
})

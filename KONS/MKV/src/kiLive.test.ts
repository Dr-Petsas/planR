import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { mkvKi } from './kiPlan'
import { rechnen } from './engine/mkv'
import { KI_LIVE, kiProbe, probeDienst } from './kiProbe'
import type { Plan } from './types'
import type { KiSchritt } from './planKi'

/** Echte Sätze gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiLive.test.ts */
const dienst = probeDienst<Plan>((lesen, schreiben) => mkvKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben))
const zahn = (z: string, felder: Record<string, string | number | boolean>): KiSchritt => ({ op: 'zahn', zahn: z, felder })
const mit = (...s: KiSchritt[]): Plan => dienst.anwenden(neuerPlan('FMKV-1', E), s).plan
const zug = (p: Plan, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) => kiProbe({ plan: p, text, verlauf, ...dienst })
const euro = (n: number) => n.toFixed(2).replace('.', ',')
const komposit = (...zaehne: string[]) => mit(...zaehne.map((z) => zahn(z, { therapie: 'komposit', flaechen: 2 })))

describe.skipIf(!KI_LIVE)('KI-Zeile live: Mehrkostenvereinbarung', { timeout: 240_000 }, () => {
  it('nennt Mehrkosten und Kassenanteil, ohne den Plan zu ändern', async () => {
    const p = komposit('16')
    const r = await zug(p, 'Was zahlt der Patient selbst und was übernimmt die Kasse?')
    expect(r.schritte).toHaveLength(0)
    const s = rechnen(p, E)
    const t = r.text.replace(/\./g, '')
    expect(t).toContain(euro(s.mehrkosten))
    expect(t).toContain(euro(s.kassenanteil))
  })

  it('erklärt, wie die Mehrkosten zustande kommen', async () => {
    const r = await zug(komposit('16'), 'Wie rechnen sich die Mehrkosten bei dieser Füllung?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text).toMatch(/Kassenanteil|Kasse|je Fläche/i)
  })

  it('erstellt den Plan aus einem Satz', async () => {
    const r = await zug(neuerPlan('FMKV-1', E), 'Dreiflächige Kompositfüllung an 36 und eine zweiflächige an 37.')
    expect(r.plan.zaehne['36']).toMatchObject({ therapie: 'komposit', flaechen: 3 })
    expect(r.plan.zaehne['37']).toMatchObject({ therapie: 'komposit', flaechen: 2 })
  })

  it('erweitert um einen Zahn und lässt den Rest stehen', async () => {
    const r = await zug(komposit('16'), 'An 26 kommt noch ein Keramikinlay dazu, zwei Flächen.')
    expect(r.plan.zaehne['26']).toMatchObject({ therapie: 'inlay', flaechen: 2 })
    expect(r.plan.zaehne['16']).toMatchObject({ therapie: 'komposit', flaechen: 2 })
  })

  it('kürzt um einen Zahn', async () => {
    const r = await zug(komposit('16', '26'), 'Die Füllung an 26 entfällt.')
    expect(r.plan.zaehne['26']).toBeUndefined()
    expect(r.plan.zaehne['16']).toBeDefined()
  })

  it('ändert Flächen und Therapie', async () => {
    const a = await zug(komposit('16'), 'Die Füllung an 16 wird doch dreiflächig.')
    expect(a.plan.zaehne['16'].flaechen).toBe(3)
    const b = await zug(a.plan, 'Mach daraus Mehrfarbentechnik.', a.verlauf)
    expect(b.plan.zaehne['16'].therapie).toBe('mehrfarben')
  })

  it('setzt den Faktor', async () => {
    const r = await zug(komposit('16'), 'Rechne die Füllungen mit 3,0-fach.')
    expect(r.plan.regler.faktor).toBe(3)
  })

  it('nimmt Kofferdam an einem Zahn dazu', async () => {
    const r = await zug(komposit('16', '26'), 'Bei 16 arbeiten wir mit Kofferdam.')
    expect(r.plan.zaehne['16'].kofferdam).toBe(true)
    expect(r.plan.zaehne['26'].kofferdam ?? false).toBe(false)
  })

  it('leert den Plan', async () => {
    const r = await zug(komposit('16', '26'), 'Nimm alle Füllungen wieder aus dem Plan.')
    expect(Object.keys(r.plan.zaehne)).toHaveLength(0)
  })

  it('sagt ehrlich, dass freie Positionen hier nicht gehen', async () => {
    const p = komposit('16')
    const r = await zug(p, 'Trag noch eine GOZ 0030 ein.')
    expect(r.plan).toEqual(p)
    expect(r.text).toMatch(/nicht|kein/i)
  })
})

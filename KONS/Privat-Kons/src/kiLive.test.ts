import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { konsKi } from './kiPlan'
import { rechnen } from './engine/kons'
import { KI_LIVE, kiProbe, probeDienst } from './kiProbe'
import type { Plan } from './types'
import type { KiSchritt } from './planKi'

/** Echte Sätze gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiLive.test.ts */
const dienst = probeDienst<Plan>((lesen, schreiben) => konsKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben))
const zahn = (z: string, felder: Record<string, string | number | boolean>): KiSchritt => ({ op: 'zahn', zahn: z, felder })
const mit = (...s: KiSchritt[]): Plan => dienst.anwenden(neuerPlan('PK-1', E), s).plan
const zug = (p: Plan, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) => kiProbe({ plan: p, text, verlauf, ...dienst })
const pos = (p: Plan) => dienst.blick(p).positionen
const euro = (n: number) => n.toFixed(2).replace('.', ',')
const endo = (z: string, kanaele = 3) => zahn(z, { therapie: 'endo', kanaele })

describe.skipIf(!KI_LIVE)('KI-Zeile live: privater Kons-/Endo-Plan', { timeout: 240_000 }, () => {
  it('nennt die Summe, ohne den Plan zu ändern', async () => {
    const p = mit(endo('36'))
    const r = await zug(p, 'Was kostet die Behandlung insgesamt?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text.replace(/\./g, '')).toContain(euro(rechnen(p, E).summe))
  })

  it('erklärt die Positionen der Wurzelbehandlung', async () => {
    const p = mit(endo('36'))
    const r = await zug(p, 'Welche Positionen rechnen wir für die Wurzelbehandlung an 36 ab und warum so oft?')
    expect(r.schritte).toHaveLength(0)
    expect(['2410', '2440', '2400'].some((n) => r.text.includes(n))).toBe(true)
  })

  it('erstellt den Plan aus einem Satz', async () => {
    const r = await zug(neuerPlan('PK-1', E), 'Wurzelbehandlung an 46 mit vier Kanälen und eine dreiflächige Kompositfüllung an 45.')
    expect(r.plan.zaehne['46']).toMatchObject({ therapie: 'endo', kanaele: 4 })
    expect(r.plan.zaehne['45']).toMatchObject({ therapie: 'komposit', flaechen: 3 })
  })

  it('erweitert und kürzt', async () => {
    const a = await zug(mit(endo('36')), 'Dazu kommt eine Revision an 37 mit drei Kanälen.')
    expect(a.plan.zaehne['37']).toMatchObject({ therapie: 'revision', kanaele: 3 })
    expect(a.plan.zaehne['36']).toMatchObject({ therapie: 'endo' })
    const b = await zug(a.plan, 'Die Revision machen wir doch nicht.', a.verlauf)
    expect(b.plan.zaehne['37']).toBeUndefined()
    expect(b.plan.zaehne['36']).toBeDefined()
  })

  it('ändert die Zahl der Kanäle', async () => {
    const r = await zug(mit(endo('36', 3)), 'Zahn 36 hat vier Kanäle, nicht drei.')
    expect(r.plan.zaehne['36'].kanaele).toBe(4)
  })

  it('wählt eine Zusatzleistung an einem Zahn ab', async () => {
    const p = mit(endo('36'))
    expect(pos(p).some((z) => z.nr === '2400')).toBe(true)
    const r = await zug(p, 'Die elektrometrische Längenbestimmung an 36 lassen wir weg.')
    expect(pos(r.plan).some((z) => z.nr === '2400')).toBe(false)
    expect(r.plan.zaehne['36'].therapie).toBe('endo')
  })

  it('setzt den Faktor für alles', async () => {
    const r = await zug(mit(endo('36')), 'Alles mit 3,5-fach rechnen.')
    expect(r.plan.regler.faktor).toBe(3.5)
  })

  it('trägt eine freie Position nach und nimmt sie wieder heraus', async () => {
    const a = await zug(mit(endo('36')), 'Trag noch eine GOZ 0010 ein.')
    expect(a.plan.frei.filter((f) => f.nr === '0010')).toHaveLength(1)
    const b = await zug(a.plan, 'Die 0010 wieder raus.', a.verlauf)
    expect(b.plan.frei.filter((f) => f.nr === '0010')).toHaveLength(0)
  })

  it('leert den Plan', async () => {
    const r = await zug(mit(endo('36'), zahn('45', { therapie: 'komposit', flaechen: 2 })), 'Lösch alle Behandlungen aus dem Plan.')
    expect(Object.keys(r.plan.zaehne)).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import { KI_LIVE, kiProbe, probeDienst } from './kiProbe'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { kfoKi } from './kiPlan'
const dienst = probeDienst<any>((lesen, schreiben) => kfoKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben))
const neu = () => neuerPlan('PKFO-1', E) as any
const schalter = (name: string, wert: string | number | boolean): KiSchritt => ({ op: 'schalter', name, wert } as KiSchritt)

const mit = (p: any, ...s: KiSchritt[]) => dienst.anwenden(p, s).plan
const zug = (p: any, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) => kiProbe({ plan: p, text, verlauf, ...dienst })
const blick = (p: any) => dienst.blick(p)
const pos = (p: any) => blick(p).positionen
const hat = (p: any, nr: string) => pos(p).some((z) => z.nr === nr)
const anz = (p: any, nr: string) => pos(p).filter((z) => z.nr === nr).reduce((s, z) => s + z.anzahl, 0)
const euro = (n: number) => n.toFixed(2).replace('.', ',')
const hinzu = (ebene: string, nr: string, anzahl = 1): KiSchritt => ({ op: 'hinzu', ebene, nr, zahn: '', anzahl } as KiSchritt)
void [mit, hat, anz, euro, hinzu]
describe.skipIf(!KI_LIVE)('KI-Zeile live: privater KFO-Plan', { timeout: 240_000 }, () => {
  it('erstellt den Plan aus einem Satz', async () => {
    const r = await zug(neu(), 'Umformung im Ober- und Unterkiefer und Einstellung in den Regelbiss, Dauer 16 Quartale.')
    expect(r.plan.aufgabe).toMatchObject({ umformungOk: true, umformungUk: true, regelbiss: true })
    expect(r.plan.quartale).toBe(16)
    expect(blick(r.plan).summen.behandlungsaufgabe).toBeGreaterThan(0)
  })
  it('nennt die Summe und erklärt die Abschläge', async () => {
    const p = mit(neu(), schalter('aufgabe.umformungOk', true), schalter('aufgabe.regelbiss', true))
    const r = await zug(p, 'Was kostet die Behandlung insgesamt und wie setzt sich die Behandlungsaufgabe zusammen?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text.replace(/\./g, '')).toContain(euro(blick(p).summen.gesamt))
    expect(r.text).toMatch(/60[3-9]0/)
  })
  it('kürzt die Aufgabe und die Dauer', async () => {
    const p = mit(neu(), schalter('aufgabe.umformungOk', true), schalter('aufgabe.umformungUk', true))
    const r = await zug(p, 'Den Unterkiefer behandeln wir nicht, und es dauert nur acht Quartale.')
    expect(r.plan.aufgabe).toMatchObject({ umformungOk: true, umformungUk: false })
    expect(r.plan.quartale).toBe(8)
  })
  it('erweitert um Leistungen und nimmt sie wieder heraus', async () => {
    const p = mit(neu(), schalter('aufgabe.umformungOk', true))
    const a = await zug(p, 'Dazu 20 Brackets, GOZ 6100.')
    expect(anz(a.plan, '6100')).toBe(20)
    const b = await zug(a.plan, 'Es sind 24 Brackets.', a.verlauf)
    expect(anz(b.plan, '6100')).toBe(24)
    const c = await zug(b.plan, 'Brackets wieder raus.', b.verlauf)
    expect(hat(c.plan, '6100')).toBe(false)
    expect(c.plan.aufgabe.umformungOk).toBe(true)
  })
  it('ändert die Faktoren', async () => {
    const p = mit(neu(), schalter('aufgabe.umformungOk', true))
    const r = await zug(p, 'Die kieferorthopädischen Leistungen bitte mit Faktor 3,0.')
    expect(r.plan.regler.kfoFaktor).toBe(3)
    expect(r.plan.regler.faktor).toBe(2.3)
  })
})
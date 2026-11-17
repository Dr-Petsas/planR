import { describe, expect, it } from 'vitest'
import { KI_LIVE, kiProbe, probeDienst } from './kiProbe'
import type { KiSchritt } from './planKi'
import { neuerFall, STANDARD_EINSTELLUNGEN as E } from './store'
import { parKi } from './kiPlan'
import { preiseAus } from './engine/leistungen'
const preise = preiseAus(E, 1.2, 1.2)
const dienst = probeDienst<any>((lesen, schreiben) => parKi(() => ({ fall: lesen(), gesperrt: false, preise, einst: E }), schreiben))
const neu = () => neuerFall(1) as any
const ohneId = (x: unknown) => JSON.stringify(x, (k, v) => (k === 'id' || k === 'datum' ? undefined : v))
const zahn = (z: string, felder: Record<string, string | number | boolean>): KiSchritt => ({ op: 'zahn', zahn: z, felder })

const mit = (p: any, ...s: KiSchritt[]) => dienst.anwenden(p, s).plan
const zug = (p: any, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) => kiProbe({ plan: p, text, verlauf, ...dienst })
const blick = (p: any) => dienst.blick(p)
const pos = (p: any) => blick(p).positionen
const hat = (p: any, nr: string) => pos(p).some((z) => z.nr === nr)
const anz = (p: any, nr: string) => pos(p).filter((z) => z.nr === nr).reduce((s, z) => s + z.anzahl, 0)
const euro = (n: number) => n.toFixed(2).replace('.', ',')
const hinzu = (ebene: string, nr: string, anzahl = 1): KiSchritt => ({ op: 'hinzu', ebene, nr, zahn: '', anzahl } as KiSchritt)
void [mit, hat, anz, euro, hinzu]
describe.skipIf(!KI_LIVE)('KI-Zeile live: PAR-Fall der Kasse', { timeout: 240_000 }, () => {
  it('beschreibt den Stand, ohne etwas zu ändern', async () => {
    const p = neu()
    const r = await zug(p, 'Wie ist die Strecke gerade geplant und was ist die Diagnose?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text).toMatch(/Stadium/i)
  })
  it('stellt die Planung der Strecke', async () => {
    const r = await zug(neu(), 'AIT bitte in vier Sitzungen, mit PZR und mit chirurgischer Therapie.')
    expect(r.plan.planung.aitSitzungen).toBe(4)
    expect(r.plan.planung.mitPzr).toBe(true)
    expect(r.plan.mitCPT).toBe(true)
  })
  it('stellt auf reine Kassenleistungen um', async () => {
    const r = await zug(neu(), 'Nur Kassenleistungen, keine privaten Zusatzleistungen.')
    expect(r.plan.modus).toBe('bema')
  })
  it('trägt den Befund an Zähnen ein und ändert ihn', async () => {
    const a = await zug(neu(), 'Zahn 16 hat mesial 6 Millimeter und distal 5 Millimeter Sondierungstiefe, mesial blutet es. Zahn 18 fehlt.')
    const soll = mit(neu(), zahn('16', { stMesial: 6, stDistal: 5, bopMesial: true }), zahn('18', { zahnstatus: '1' }))
    expect(ohneId(a.plan.befunde)).toBe(ohneId(soll.befunde))
    const b = await zug(a.plan, 'Bei 16 sind es mesial 7 Millimeter.', a.verlauf)
    const soll2 = mit(soll, zahn('16', { stMesial: 7 }))
    expect(ohneId(b.plan.befunde)).toBe(ohneId(soll2.befunde))
  })
  it('schreibt eine Bemerkung', async () => {
    const r = await zug(neu(), 'Schreib als Bemerkung dazu: Patient ist Raucher.')
    expect(r.plan.bemerkung).toMatch(/Raucher/)
  })
  it('sagt ehrlich, was sie hier nicht kann', async () => {
    const p = neu()
    const r = await zug(p, 'Nimm bitte die BEMA 04 in den ersten Termin.')
    expect(JSON.stringify(r.plan)).toBe(JSON.stringify(p))
    expect(r.text).toMatch(/Kachel|Praxis|nicht/i)
  })
})
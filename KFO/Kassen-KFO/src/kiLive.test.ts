import { describe, expect, it } from 'vitest'
import { KI_LIVE, kiProbe, probeDienst } from './kiProbe'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { kfoKi } from './kiPlan'
const dienst = probeDienst<any>((lesen, schreiben) => kfoKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben))
const neu = () => neuerPlan('KFO-1', E) as any

const mit = (p: any, ...s: KiSchritt[]) => dienst.anwenden(p, s).plan
const zug = (p: any, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) => kiProbe({ plan: p, text, verlauf, ...dienst })
const blick = (p: any) => dienst.blick(p)
const pos = (p: any) => blick(p).positionen
const hat = (p: any, nr: string) => pos(p).some((z) => z.nr === nr)
const anz = (p: any, nr: string) => pos(p).filter((z) => z.nr === nr).reduce((s, z) => s + z.anzahl, 0)
const euro = (n: number) => n.toFixed(2).replace('.', ',')
const hinzu = (ebene: string, nr: string, anzahl = 1): KiSchritt => ({ op: 'hinzu', ebene, nr, zahn: '', anzahl } as KiSchritt)
void [mit, hat, anz, euro, hinzu]
describe.skipIf(!KI_LIVE)('KI-Zeile live: KFO-Plan der Kasse', { timeout: 240_000 }, () => {
  it('erstellt den Plan aus einem Satz', async () => {
    const r = await zug(neu(), 'Zwölf Abschläge 119a und sechs Brackets 126a.')
    expect(anz(r.plan, '119a')).toBe(12)
    expect(anz(r.plan, '126a')).toBe(6)
  })
  it('nennt die Summe, ohne zu ändern', async () => {
    const p = mit(neu(), hinzu('BEMA', '119a', 12))
    const r = await zug(p, 'Wie hoch ist das Honorar und was zahlt der Patient selbst?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text.replace(/\./g, '')).toContain(euro(blick(p).summen.honorar))
  })
  it('erweitert, ändert die Anzahl und kürzt', async () => {
    const a = await zug(mit(neu(), hinzu('BEMA', '119a', 12)), 'Dazu acht Brackets 126a.')
    expect(anz(a.plan, '126a')).toBe(8)
    const b = await zug(a.plan, 'Es sind zehn Brackets.', a.verlauf)
    expect(anz(b.plan, '126a')).toBe(10)
    const c = await zug(b.plan, 'Die Brackets streichen.', b.verlauf)
    expect(hat(c.plan, '126a')).toBe(false)
    expect(anz(c.plan, '119a')).toBe(12)
  })
  it('weist eine unbekannte Nummer ab und sagt es', async () => {
    const p = mit(neu(), hinzu('BEMA', '119a', 12))
    const r = await zug(p, 'Nimm die BEMA 999z dazu.')
    expect(pos(r.plan)).toHaveLength(pos(p).length)
  })
  it('sagt ehrlich, dass Privatleistungen im Planer angelegt werden', async () => {
    const p = neu()
    const r = await zug(p, 'Nimm bitte die GOZ 6100 als Mehrleistung dazu.')
    expect(JSON.stringify(r.plan)).toBe(JSON.stringify(p))
    expect(r.text).toMatch(/Katalog|Planer|Praxis/i)
  })
})
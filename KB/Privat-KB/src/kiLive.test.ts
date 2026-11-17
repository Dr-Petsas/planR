import { describe, expect, it } from 'vitest'
import { KI_LIVE, kiProbe, probeDienst } from './kiProbe'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { kbKi } from './kiPlan'
const dienst = probeDienst<any>((lesen, schreiben) => kbKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben))
const neu = () => neuerPlan('PKB-1', E) as any

const mit = (p: any, ...s: KiSchritt[]) => dienst.anwenden(p, s).plan
const zug = (p: any, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) => kiProbe({ plan: p, text, verlauf, ...dienst })
const blick = (p: any) => dienst.blick(p)
const pos = (p: any) => blick(p).positionen
const hat = (p: any, nr: string) => pos(p).some((z) => z.nr === nr)
const anz = (p: any, nr: string) => pos(p).filter((z) => z.nr === nr).reduce((s, z) => s + z.anzahl, 0)
const euro = (n: number) => n.toFixed(2).replace('.', ',')
const hinzu = (ebene: string, nr: string, anzahl = 1): KiSchritt => ({ op: 'hinzu', ebene, nr, zahn: '', anzahl } as KiSchritt)
void [mit, hat, anz, euro, hinzu]
describe.skipIf(!KI_LIVE)('KI-Zeile live: privater KB-/Schienen-Plan', { timeout: 240_000 }, () => {
  it('erstellt den Plan aus einem Satz', async () => {
    const r = await zug(neu(), 'Adjustierte Aufbissschiene GOZ 7010, dazu die klinische Funktionsanalyse 8000. Diagnose: CMD.')
    expect(hat(r.plan, '7010')).toBe(true)
    expect(hat(r.plan, '8000')).toBe(true)
    expect(r.plan.diagnose).toMatch(/CMD/)
  })
  it('nennt die Summe und erklärt eine Zeile', async () => {
    const p = mit(neu(), hinzu('GOZ', '7010'), hinzu('GOZ', '8000'))
    const r = await zug(p, 'Was kostet das zusammen und wie rechnet sich die 7010?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text.replace(/\./g, '')).toContain(euro(blick(p).summen.gesamt))
    expect(r.text).toMatch(/2,3/)
  })
  it('erweitert, ändert und kürzt', async () => {
    const a = await zug(mit(neu(), hinzu('GOZ', '7010')), 'Dazu dreimal die 7050 für Kontrollen.')
    expect(anz(a.plan, '7050')).toBe(3)
    const b = await zug(a.plan, 'Nur zwei Kontrollen.', a.verlauf)
    expect(anz(b.plan, '7050')).toBe(2)
    const c = await zug(b.plan, 'Kontrollen doch ganz raus.', b.verlauf)
    expect(hat(c.plan, '7050')).toBe(false)
    expect(hat(c.plan, '7010')).toBe(true)
  })
  it('ändert den Faktor einer Zeile und den Regler', async () => {
    const p = mit(neu(), hinzu('GOZ', '7010'), hinzu('GOZ', '8000'))
    const a = await zug(p, 'Die 7010 mit Faktor 3,5.')
    expect(pos(a.plan).find((z) => z.nr === '7010')?.faktor).toBe(3.5)
    expect(pos(a.plan).find((z) => z.nr === '8000')?.faktor).toBe(2.3)
    const b = await zug(p, 'Die Funktionsanalyse rechnen wir generell mit 3,0.')
    expect(pos(b.plan).find((z) => z.nr === '8000')?.faktor).toBe(3)
    expect(pos(b.plan).find((z) => z.nr === '7010')?.faktor).toBe(2.3)
  })
  it('stellt die Abformung auf Scan', async () => {
    const r = await zug(mit(neu(), hinzu('GOZ', '7010')), 'Wir scannen statt abzuformen.')
    expect(r.plan.abformung).not.toBe('abdruck')
  })
})
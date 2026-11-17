import { describe, expect, it } from 'vitest'
import { KI_LIVE, kiProbe, probeDienst } from './kiProbe'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { kbKi } from './kiPlan'
const dienst = probeDienst<any>((lesen, schreiben) => kbKi(() => ({ plan: lesen(), gesperrt: false, einst: E }), schreiben))
const neu = () => neuerPlan('KB-1', E) as any

const mit = (p: any, ...s: KiSchritt[]) => dienst.anwenden(p, s).plan
const zug = (p: any, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) => kiProbe({ plan: p, text, verlauf, ...dienst })
const blick = (p: any) => dienst.blick(p)
const pos = (p: any) => blick(p).positionen
const hat = (p: any, nr: string) => pos(p).some((z) => z.nr === nr)
const anz = (p: any, nr: string) => pos(p).filter((z) => z.nr === nr).reduce((s, z) => s + z.anzahl, 0)
const euro = (n: number) => n.toFixed(2).replace('.', ',')
const hinzu = (ebene: string, nr: string, anzahl = 1): KiSchritt => ({ op: 'hinzu', ebene, nr, zahn: '', anzahl } as KiSchritt)
void [mit, hat, anz, euro, hinzu]
describe.skipIf(!KI_LIVE)('KI-Zeile live: KB-Plan der Kasse', { timeout: 240_000 }, () => {
  it('erstellt den Plan aus einem Satz', async () => {
    const r = await zug(neu(), 'Der Patient bekommt eine adjustierte Aufbissschiene, also K1. Befund: Bruxismus mit Myoarthropathie.')
    expect(hat(r.plan, 'K1')).toBe(true)
    expect(r.plan.angaben.befund).toMatch(/Bruxismus/i)
  })
  it('nennt Summe und Genehmigung, ohne zu ändern', async () => {
    const p = mit(neu(), hinzu('BEMA', 'K1'))
    const r = await zug(p, 'Was bekommt die Praxis dafür und muss das genehmigt werden?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text.replace(/\./g, '')).toContain(euro(blick(p).summen.honorar))
    expect(r.text).toMatch(/genehmig/i)
  })
  it('erweitert, ändert die Anzahl und kürzt', async () => {
    const a = await zug(mit(neu(), hinzu('BEMA', 'K1')), 'Dazu zweimal die K7 für Kontrollen.')
    expect(anz(a.plan, 'K7')).toBe(2)
    const b = await zug(a.plan, 'Mach drei Kontrollen daraus.', a.verlauf)
    expect(anz(b.plan, 'K7')).toBe(3)
    const c = await zug(b.plan, 'Die Kontrollen streichen wir ganz.', b.verlauf)
    expect(hat(c.plan, 'K7')).toBe(false)
    expect(hat(c.plan, 'K1')).toBe(true)
  })
  it('stellt Labor und Abformung', async () => {
    const r = await zug(mit(neu(), hinzu('BEMA', 'K1')), 'Die Schiene macht unser Eigenlabor, abgeformt wird mit dem Scanner.')
    expect(r.plan.labor).not.toBe('gewerbe')
    expect(r.plan.abformung).not.toBe('abdruck')
  })
  it('vermerkt einen Unfall', async () => {
    const r = await zug(neu(), 'Das ist ein Unfall gewesen.')
    expect(r.plan.angaben.unfall).toBe(true)
  })
  it('weist eine unbekannte Nummer ab', async () => {
    const p = mit(neu(), hinzu('BEMA', 'K1'))
    const r = await zug(p, 'Nimm die BEMA K99 dazu.')
    expect(pos(r.plan)).toHaveLength(pos(p).length)
  })
})
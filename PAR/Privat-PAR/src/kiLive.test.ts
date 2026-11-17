import { describe, expect, it } from 'vitest'
import { KI_LIVE, kiProbe, probeDienst } from './kiProbe'
import type { KiSchritt } from './planKi'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './store'
import { parKi } from './kiPlan'
const dienst = probeDienst<any>((lesen, schreiben) => parKi(() => ({ plan: lesen(), gesperrt: false }), schreiben))
const neu = () => neuerPlan('PP-1', E) as any

const mit = (p: any, ...s: KiSchritt[]) => dienst.anwenden(p, s).plan
const zug = (p: any, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) => kiProbe({ plan: p, text, verlauf, ...dienst })
const blick = (p: any) => dienst.blick(p)
const pos = (p: any) => blick(p).positionen
const hat = (p: any, nr: string) => pos(p).some((z) => z.nr === nr)
const anz = (p: any, nr: string) => pos(p).filter((z) => z.nr === nr).reduce((s, z) => s + z.anzahl, 0)
const euro = (n: number) => n.toFixed(2).replace('.', ',')
const hinzu = (ebene: string, nr: string, anzahl = 1): KiSchritt => ({ op: 'hinzu', ebene, nr, zahn: '', anzahl } as KiSchritt)
void [mit, hat, anz, euro, hinzu]
describe.skipIf(!KI_LIVE)('KI-Zeile live: private PAR-Strecke', { timeout: 240_000 }, () => {
  it('nennt die Summe, ohne den Plan zu ändern', async () => {
    const p = neu()
    const r = await zug(p, 'Was kostet die ganze Strecke?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text.replace(/\./g, '')).toContain(euro(blick(p).summen.gesamt))
  })
  it('erklärt eine Position der Strecke', async () => {
    const r = await zug(neu(), 'Warum steht die 4138a zehnmal im Plan und was kostet sie zusammen?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text).toMatch(/4138/)
  })
  it('stellt Stadium, Grad und UPT-Dauer', async () => {
    const r = await zug(neu(), 'Der Patient hat Stadium IV, Grad C. UPT bitte über drei Jahre.')
    expect(r.plan).toMatchObject({ stadium: 'IV', grad: 'C', uptJahre: 3 })
  })
  it('trägt fehlende Zähne ein und nimmt sie zurück', async () => {
    const a = await zug(neu(), 'Die Zähne 16 und 26 fehlen.')
    expect(JSON.stringify(a.plan.fehlend)).toContain('16')
    expect(JSON.stringify(a.plan.fehlend)).toContain('26')
    const b = await zug(a.plan, '16 ist doch vorhanden.', a.verlauf)
    expect(JSON.stringify(b.plan.fehlend)).not.toContain('16')
    expect(JSON.stringify(b.plan.fehlend)).toContain('26')
  })
  it('plant chirurgische Therapie an Zähnen', async () => {
    const r = await zug(neu(), 'An 36 und 37 planen wir eine chirurgische Therapie.')
    expect(JSON.stringify(r.plan.cpt)).toContain('36')
    expect(JSON.stringify(r.plan.cpt)).toContain('37')
    expect(blick(r.plan).summen.cpt).toBeGreaterThan(0)
  })
  it('ändert den Faktor für alles und für eine Nummer', async () => {
    const a = await zug(neu(), 'Bitte alles mit Faktor 3,5 rechnen.')
    expect(a.plan.faktor).toBe(3.5)
    const b = await zug(neu(), 'Die 4005 bitte mit Faktor 3,0.')
    expect(pos(b.plan).filter((z) => z.nr === '4005').every((z) => z.faktor === 3)).toBe(true)
    expect(b.plan.faktor).toBe(2.3)
  })
  it('erweitert um eine Leistung und kürzt sie wieder', async () => {
    const a = await zug(neu(), 'Nimm bitte noch zweimal die GOZ 4020 dazu.')
    expect(anz(a.plan, '4020')).toBe(2)
    const b = await zug(a.plan, 'Die 4020 kommt wieder raus.', a.verlauf)
    expect(hat(b.plan, '4020')).toBe(false)
  })
  it('erreicht einen Zielbetrag', async () => {
    const r = await zug(neu(), 'Die Strecke soll insgesamt 2000 Euro kosten.')
    expect(Math.abs(blick(r.plan).summen.gesamt - 2000)).toBeLessThan(25)
  })
})
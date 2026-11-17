import { describe, expect, it } from 'vitest'
import { neuerPlan, STANDARD_EINSTELLUNGEN as E } from './planNeu'
import { implAnwenden, implBlick } from './kiPlan'
import { KI_LIVE, kiProbe } from './kiProbe'
import type { Plan } from './types'

/** Echte Sätze gegen das echte Modell. Start: VITE_KI_LIVE=1 npx vitest run src/kiLive.test.ts */
const plan = (zaehne: Plan['zaehne'] = { '16': { B: 'f', TP: 'I' } }): Plan => ({ ...neuerPlan(1), zaehne })
const zug = (p: Plan, text: string, verlauf?: { wer: 'ich' | 'clara'; text: string }[]) =>
  kiProbe({ plan: p, text, verlauf, blick: (x) => implBlick(x, E, false), anwenden: (x, s) => implAnwenden(x, E, s) })
const pos = (p: Plan) => implBlick(p, E, false).positionen
const hat = (p: Plan, nr: string, zahn?: string) => pos(p).filter((z) => z.nr === nr && (zahn === undefined || z.zahn === zahn))

describe.skipIf(!KI_LIVE)('KI-Zeile live: Implantatplan', { timeout: 240_000 }, () => {
  it('beantwortet eine Frage zur Summe, ohne den Plan zu ändern', async () => {
    const p = plan()
    const r = await zug(p, 'Was kostet der Plan insgesamt und wie viel davon ist Honorar?')
    expect(r.schritte).toHaveLength(0)
    const gesamt = implBlick(p, E, false).summen.gesamt
    expect(r.text.replace(/\./g, '')).toContain(gesamt.toFixed(2).replace('.', ','))
  })

  it('erklärt eine Position', async () => {
    const r = await zug(plan(), 'Wofür steht die 9010 und warum ist sie in diesem Plan?')
    expect(r.schritte).toHaveLength(0)
    expect(r.text).toMatch(/Implantat/i)
  })

  it('erweitert: Knochenaufbau dazu', async () => {
    const r = await zug(plan(), 'Bitte noch einen Knochenaufbau im Oberkiefer rechts dazunehmen.')
    expect(hat(r.plan, '9100').length).toBeGreaterThan(0)
  })

  it('kürzt: Knochenaufbau wieder raus', async () => {
    const mit = implAnwenden(plan(), E, [{ op: 'schalter', name: 'region.OK-R.augmentation', wert: true }]).plan
    expect(hat(mit, '9100').length).toBeGreaterThan(0)
    const r = await zug(mit, 'Den Knochenaufbau brauchen wir doch nicht, nimm ihn raus.')
    expect(hat(r.plan, '9100')).toHaveLength(0)
  })

  it('erweitert um ein zweites Implantat', async () => {
    const r = await zug(plan({ '16': { B: 'f', TP: 'I' }, '14': { B: 'f', TP: '' } }), 'Regio 14 bekommt auch ein Implantat.')
    expect(hat(r.plan, '9010', '14').length + hat(r.plan, '9010').filter((z) => z.zahn.includes('14')).length).toBeGreaterThan(0)
    expect(r.plan.zaehne['14']?.TP).toBe('I')
  })

  it('kürzt um ein Implantat', async () => {
    const r = await zug(plan({ '16': { B: 'f', TP: 'I' }, '14': { B: 'f', TP: 'I' } }), 'Das Implantat an 14 entfällt, nur 16 bleibt.')
    expect(r.plan.zaehne['14']?.TP ?? '').not.toBe('I')
    expect(r.plan.zaehne['16']?.TP).toBe('I')
  })

  it('ändert einen Faktor und begründet ihn', async () => {
    const r = await zug(plan(), 'Setz die 9010 auf Faktor 3,2 wegen sehr schmalem Kieferkamm.')
    const z = hat(r.plan, '9010')[0]
    expect(z.faktor).toBe(3.2)
    expect(z.begruendung ?? '').toMatch(/schmal|Kieferkamm/i)
  })

  it('trägt eine Position von Hand nach und nimmt sie auf Zuruf wieder zurück', async () => {
    const a = await zug(plan(), 'Trag bitte noch eine GOZ 0030 ein.')
    expect(hat(a.plan, '0030')).toHaveLength(1)
    const b = await zug(a.plan, 'Die 0030 doch wieder löschen.', a.verlauf)
    expect(hat(b.plan, '0030')).toHaveLength(0)
  })

  it('alle Fehler entfernen: zulässige Doppelung bleibt', async () => {
    let p = plan({ '16': { B: 'f', TP: 'I' }, '15': { B: 'f', TP: 'I' } })
    const erste = hat(p, '9010')[0]
    p = implAnwenden(p, E, [{ op: 'setze', id: erste.id, faktor: 3.2 }, { op: 'hinzu', ebene: 'GOZ', nr: '0090', zahn: '16', anzahl: 1 }]).plan
    // Dieselbe Anästhesie ein zweites Mal von Hand: zulässig, das Prüfmodul meldet sie als doppelt.
    p = { ...p, manuell: [...p.manuell, { ...p.manuell[p.manuell.length - 1], id: 'm:zweite' }] }
    const vorher = hat(p, '0090').length
    expect(vorher).toBeGreaterThanOrEqual(2)
    const r = await zug(p, 'Bitte alle Fehler im Plan beheben.')
    expect(hat(r.plan, '9010').length).toBe(hat(p, '9010').length)
    // Die Infiltrationsanästhesie darf bleiben oder die Praxis wird gefragt; still gelöscht wird nichts.
    expect(hat(r.plan, '0090').length === vorher || r.frage !== '').toBe(true)
  })

  it('lehnt Unmögliches ab, statt etwas zu erfinden', async () => {
    const p = plan()
    const r = await zug(p, 'Setz die 9010 auf Faktor 6.')
    expect(hat(r.plan, '9010')[0].faktor).toBeLessThanOrEqual(3.5)
  })
})

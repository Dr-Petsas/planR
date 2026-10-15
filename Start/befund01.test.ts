import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ablageKuerzen, befundAnsicht, befundFreigeben, befundLinkPruefen, nachAenderung, nachLesen, nachSchreiben, offeneKiefer, verwerfen,
  vorgangBeenden, vorgangKarten, vorgangLaeuft, vorgangMelden, type Befund01,
} from './befund01'

const T1 = '2026-10-15T08:00:00.000Z'
const T2 = '2026-10-15T09:00:00.000Z'
const T3 = '2026-10-15T10:00:00.000Z'
const gelesen = (zaehne: Record<string, string>) => ({ patient: '4711', label: 'Muster, Max', geburt: '1960-01-01', pvs: 'DS-Win', zaehne, datum: '2026-09-01' })

describe('aktueller 01-Befund', () => {
  it('erstes Lesen übernimmt das Praxisprogramm', () => {
    const b = nachLesen(undefined, gelesen({ '16': 'k', '26': 'f' }), T1)
    expect(befundAnsicht(b).zaehne).toMatchObject({ '16': 'k', '26': 'f' })
    expect(b.offen).toEqual({})
    expect(b.stand).toBe(T1)
  })

  it('Änderung im Gespräch ist offen und gilt für die Anzeige', () => {
    const b = nachAenderung(nachLesen(undefined, gelesen({ '16': 'k' }), T1), { '26': 'kw', '16': 'k' }, 'Eva', T2)
    expect(b.offen).toEqual({ '26': 'kw' })
    expect(befundAnsicht(b).zaehne['26']).toBe('kw')
    expect(b.offenWer).toBe('Eva')
    expect(b.stand).toBe(T2)
    expect(offeneKiefer(b)).toEqual(['OK'])
  })

  it('Rückgängig auf den Stand im Praxisprogramm ist nicht mehr offen', () => {
    const a = nachAenderung(nachLesen(undefined, gelesen({ '16': 'k' }), T1), { '16': 'x' }, 'Eva', T2)
    const b = nachAenderung(a, { '16': 'k' }, 'Eva', T3)
    expect(b.offen).toEqual({})
    expect(b.offenWer).toBe('')
  })

  it('erneutes Lesen behält offene Änderungen, solange das Praxisprogramm sie nicht hat', () => {
    const a = nachAenderung(nachLesen(undefined, gelesen({ '16': 'k' }), T1), { '26': 'kw', '36': 'f' }, 'Eva', T2)
    const b = nachLesen(a, gelesen({ '16': 'k', '36': 'f' }), T3)
    expect(b.offen).toEqual({ '26': 'kw' })
    expect(b.stand).toBe(T2)
  })

  it('Schreiben erledigt die offenen Zähne der geschriebenen Kiefer', () => {
    const a = nachAenderung(nachLesen(undefined, gelesen({ '16': 'k' }), T1), { '26': 'kw', '36': 'f' }, 'Eva', T2)
    const b = nachSchreiben(a, ['OK'], { ...a.pvsZaehne, ...a.offen }, T3)
    expect(b.offen).toEqual({ '36': 'f' })
    expect(b.pvsZaehne['26']).toBe('kw')
    expect(b.geschrieben).toBe(T3)
  })

  it('Kürzel aus dem Praxisprogramm bleiben unverändert, gesprochene werden klein', () => {
    const a = nachLesen(undefined, gelesen({ '17': 'T1' }), T1)
    expect(a.pvsZaehne['17']).toBe('T1')
    expect(nachAenderung(a, { '27': 'KW' }, 'Eva', T2).offen).toEqual({ '27': 'kw' })
  })

  it('Verwerfen und Ablage kürzen', () => {
    const a = nachAenderung(nachLesen(undefined, gelesen({}), T1), { '26': 'f' }, 'Eva', T2)
    expect(verwerfen(a, T3).offen).toEqual({})
    const ablage: Record<string, Befund01> = { a: { ...a, stand: T1 }, b: { ...a, stand: T3 }, c: { ...a, stand: T2 } }
    expect(Object.keys(ablageKuerzen(ablage, 2)).sort()).toEqual(['b', 'c'])
  })

  it('Großgeschriebenes Kürzel im Praxisprogramm gilt als gleich', () => {
    const a = nachLesen(undefined, gelesen({ '16': 'KW' }), T1)
    expect(nachAenderung(a, { '16': 'kw' }, 'Eva', T2).offen).toEqual({})
  })
})

describe('vom Befund zum Plan', () => {
  const ms = (iso: string) => Date.parse(iso)
  const basis = () => nachLesen(undefined, gelesen({ '16': 'k' }), T1)

  it('beginnt beim Befund, Phasen gehen nur vorwärts', () => {
    const a = vorgangMelden(basis(), { modul: 'hkp', phase: 'befund', auftrag: 'Brücke 14 bis 16' }, T1)
    expect(a.vorgang).toMatchObject({ modul: 'hkp', phase: 'befund', auftrag: 'Brücke 14 bis 16', seit: T1 })
    const b = vorgangMelden(a, { phase: 'planung', plan: { '14': { TP: 'KV', R: 'KV' }, '15': { TP: 'BV', R: 'BV' }, '99': { TP: 'x' } } }, T2)
    expect(b.vorgang!.phase).toBe('planung')
    expect(b.vorgang!.plan).toEqual({ '14': { TP: 'KV', R: 'KV' }, '15': { TP: 'BV', R: 'BV' } })
    const c = vorgangMelden(b, { modul: 'hkp', phase: 'befund' }, T3)
    expect(c.vorgang!.phase).toBe('planung')
    expect(c.vorgang!.seit).toBe(T1)
  })

  it('Planart kommt nach: ein Befund ohne Modul läuft als HKP weiter, eine andere Planart beginnt neu', () => {
    const a = vorgangMelden(basis(), { phase: 'befund' }, T1)
    const b = vorgangMelden(a, { modul: 'hkp' }, T2)
    expect(b.vorgang).toMatchObject({ modul: 'hkp', seit: T1 })
    expect(vorgangMelden(b, { modul: 'par' }, T3).vorgang).toMatchObject({ modul: 'par', seit: T3, phase: 'befund' })
  })

  it('Freigabe gibt die Planung frei; ohne Vorgang ändert sie nichts', () => {
    const a = vorgangMelden(basis(), { modul: 'hkp' }, T1)
    const b = befundFreigeben(a, 'Handy', T2)
    expect(b.vorgang).toMatchObject({ phase: 'planung', freigegeben: T2, freigabeWo: 'Handy' })
    const ohne = basis()
    expect(befundFreigeben(ohne, 'PlanR', T2)).toBe(ohne)
  })

  it('nach dem Anlegen beginnt der nächste Plan neu; Lesen behält den Vorgang', () => {
    const a = vorgangMelden(vorgangMelden(basis(), { modul: 'hkp' }, T1), { phase: 'angelegt', hkpId: 'h1' }, T2)
    expect(vorgangLaeuft(a, ms(T2))).toBe(false)
    expect(vorgangMelden(a, { modul: 'hkp' }, T3).vorgang).toMatchObject({ phase: 'befund', hkpId: '', seit: T3 })
    const l = nachLesen(a, gelesen({ '16': 'k' }), T3)
    expect(l.vorgang?.hkpId).toBe('h1')
    expect(vorgangBeenden(l).vorgang).toBeUndefined()
  })

  it('läuft nach zwölf Stunden ohne Bewegung aus', () => {
    const a = vorgangMelden(basis(), { modul: 'hkp' }, T1)
    expect(vorgangLaeuft(a, ms(T1) + 11 * 3600_000)).toBe(true)
    expect(vorgangLaeuft(a, ms(T1) + 13 * 3600_000)).toBe(false)
  })

  it('Planliste: laufende Vorgänge als eigene Zeilen', () => {
    const befund = vorgangMelden(basis(), { phase: 'befund' }, T1)
    const planung = { ...vorgangMelden(nachAenderung(basis(), { '26': 'f' }, 'Eva', T1), { modul: 'hkp', phase: 'planung' }, T2), patient: '815', label: 'Probe, Paula' }
    const angelegt = { ...vorgangMelden(basis(), { modul: 'hkp', phase: 'angelegt' }, T2), patient: '9' }
    const karten = vorgangKarten({ '4711': befund, '815': planung, '9': angelegt }, ms(T3)).sort((a, b) => a.geaendert.localeCompare(b.geaendert))
    expect(karten.map((k) => [k.kuerzel, k.status, k.oeffnen])).toEqual([['01', 'befund', 'befund=4711'], ['HKP', 'in_planung', 'befund=815']])
    expect(karten[1].vorgang).toMatchObject({ phase: 'planung', offen: 1, patient: '815' })
  })

  it('Handy-Link: nur mit gültiger Signatur, passendem Patienten und Frist', () => {
    const key = 'geheim-test'
    const jetzt = ms(T1)
    const exp = Math.floor(jetzt / 1000) + 12 * 3600
    const sig = createHmac('sha256', key).update(`befund-flip:praxis1/4711:${exp}`).digest('base64url').slice(0, 24)
    const q = (p: string, t = `${exp}.${sig}`) => new URLSearchParams({ c: 'praxis1', p, t })
    expect(befundLinkPruefen(q('4711'), key, jetzt)).toEqual({ clientId: 'praxis1', nummer: '4711' })
    expect(befundLinkPruefen(q('4712'), key, jetzt)).toBeNull()
    expect(befundLinkPruefen(q('4711'), 'anderer', jetzt)).toBeNull()
    expect(befundLinkPruefen(q('4711'), key, (exp + 1) * 1000)).toBeNull()
    expect(befundLinkPruefen(q('4711'), '', jetzt)).toBeNull()
  })
})

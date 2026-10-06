import { describe, expect, it } from 'vitest'
import { IMPLANTATSYSTEME } from '../data/implantatsysteme'
import { ausfuehrungAendern, hkpEntwurf } from '../clara/index'
import { SYSTEM_MUSTER, ausfuehrungIn, ausfuehrungSatz, ausfuehrungVon } from './ausfuehrung'
import { laborVon } from './berechnung'

const BRUECKE = 'Brücke von 14 auf 17 mit 15 und 16 als Brückenglied'
const LUECKE = { 15: 'f', 16: 'f' }
const hat = (plan: { positionen: { ebene: string; nr: string }[] }, ebene: string, nr: string) => plan.positionen.some((p) => p.ebene === ebene && p.nr === nr)

describe('Ausführung verstehen (Anruf 06.10.2026 20:15: „Zirkon statt NEM“)', () => {
  it('Werkstoff: letzte nicht verneinte Nennung gewinnt', () => {
    expect(ausfuehrungIn('Zirkon statt NEM').werkstoff).toBe('zirkon')
    expect(ausfuehrungIn('Nicht NEM, sondern Zirkonkeramik').werkstoff).toBe('zirkon')
    expect(ausfuehrungIn('NEM, nicht Zirkon').werkstoff).toBe('nem')
    expect(ausfuehrungIn(`${BRUECKE} in NEM. Nein, doch lieber Zirkon.`).werkstoff).toBe('zirkon')
    expect(ausfuehrungIn('Das NEM war falsch, Zirkon bitte').werkstoff).toBe('zirkon')
    expect(ausfuehrungIn('reduziertes Gold').werkstoff).toBe('goldreduziert')
    expect(ausfuehrungIn('Hochgold').werkstoff).toBe('hochgold')
    expect(ausfuehrungIn('e.max Press').werkstoff).toBe('presskeramik')
    expect(ausfuehrungIn('e.max CAD').werkstoff).toBe('lithiumdisilikat')
    expect(ausfuehrungIn('Vollkeramik').werkstoff).toBe('zirkon')
    expect(ausfuehrungIn('NEM mit Keramikverblendung').werkstoff).toBe('nem')
    expect(ausfuehrungIn(BRUECKE).werkstoff).toBeUndefined()
  })

  it('Abformung', () => {
    expect(ausfuehrungIn('mit Intraoralscan').abformung).toBe('scan')
    expect(ausfuehrungIn('Intraoralscan-Abformung').abformung).toBe('scan')
    expect(ausfuehrungIn('Abdruck statt Scan').abformung).toBe('abdruck')
    expect(ausfuehrungIn('herkömmliche Abdrücke').abformung).toBe('abdruck')
    expect(ausfuehrungIn('nicht scannen, normale Abformung').abformung).toBe('abdruck')
    expect(ausfuehrungIn('ohne Scan').abformung).toBeUndefined()
    expect(ausfuehrungIn(BRUECKE).abformung).toBeUndefined()
  })

  it('Labor', () => {
    expect(ausfuehrungIn('im Eigenlabor').labor).toBe('praxis')
    expect(ausfuehrungIn('Eigen-Labor').labor).toBe('praxis')
    expect(ausfuehrungIn('Fremdlabor').labor).toBe('gewerbe')
    expect(ausfuehrungIn('Eigenlabor statt Fremdlabor').labor).toBe('praxis')
    expect(ausfuehrungIn('nicht im Eigenlabor, extern').labor).toBe('gewerbe')
    expect(ausfuehrungIn(BRUECKE).labor).toBeUndefined()
  })

  it('Implantatsystem', () => {
    expect(ausfuehrungIn('System medentis').implantatSystem).toBe('medentis-icx')
    expect(ausfuehrungIn('ICX').implantatSystem).toBe('medentis-icx')
    expect(ausfuehrungIn('Straumann').implantatSystem).toBe('straumann-bl')
    expect(ausfuehrungIn('Camlog statt medentis').implantatSystem).toBe('camlog')
    expect(ausfuehrungIn('Implantatkronen auf 14 und 15').implantatSystem).toBeUndefined()
    const ids = new Set(IMPLANTATSYSTEME.map((s) => s.id))
    for (const [id] of SYSTEM_MUSTER) expect(ids.has(id)).toBe(true)
  })

  it('Eigenlabor-Stufe', () => {
    expect(ausfuehrungIn('und den Plan maximal teuer machst im Eigenlabor')).toMatchObject({ privatStufe: 4, labor: 'praxis' })
    expect(ausfuehrungIn('Premium').privatStufe).toBe(4)
    expect(ausfuehrungIn('Stufe Ästhetik').privatStufe).toBe(3)
    expect(ausfuehrungIn('zurück auf Kasse').privatStufe).toBe(0)
    expect(ausfuehrungIn(BRUECKE).privatStufe).toBeUndefined()
  })
})

describe('Ausführung beim Planen', () => {
  it('Zirkon, Intraoralscan, Eigenlabor', () => {
    const r = hkpEntwurf(`${BRUECKE}. Zirkon, Intraoralscan, Eigenlabor`, LUECKE)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.plan.zaehne['14'].TP).toBe('KM')
    expect(r.plan.zaehne['15'].TP).toBe('BM')
    expect(r.plan.abformung).toBe('scan')
    expect(hat(r.plan, 'GOZ', '0065')).toBe(true)
    expect(r.plan.einstellungen.labor).toBe('praxis')
    const lab = r.plan.positionen.filter((p) => p.ebene === 'BEL' || p.ebene === 'BEB')
    expect(lab.length).toBeGreaterThan(0)
    expect(lab.every((p) => laborVon(p, r.plan) === 'eigen')).toBe(true)
    expect(ausfuehrungSatz(ausfuehrungVon(r.plan))).toBe('Zirkon, Intraoralscan, Eigenlabor')
  })

  it('ohne Angabe: Abdruck, Fremdlabor, kein GOZ 0065', () => {
    const r = hkpEntwurf(BRUECKE, LUECKE)
    expect(r.status === 'ok' && r.plan.abformung).toBe('abdruck')
    expect(r.status === 'ok' && hat(r.plan, 'GOZ', '0065')).toBe(false)
    expect(r.status === 'ok' && ausfuehrungSatz(ausfuehrungVon(r.plan))).toBe('Nichtedelmetall, konventioneller Abdruck, Fremdlabor')
  })

  it('Implantatsystem: Praxis-Standard und Ansage', () => {
    const std = hkpEntwurf('Implantatkronen auf 14 und 15', { 14: 'f', 15: 'f' }, { implantatSystem: 'medentis-icx' })
    expect(std.status === 'ok' && std.plan.implantat.system).toBe('medentis-icx')
    expect(std.status === 'ok' && ausfuehrungVon(std.plan).implantatSystem).toBe('medentis-icx')
    const st = hkpEntwurf('Implantatkronen auf 14 und 15, System Straumann', { 14: 'f', 15: 'f' }, { implantatSystem: 'medentis-icx' })
    expect(st.status === 'ok' && st.plan.implantat.system).toBe('straumann-bl')
    const zr = hkpEntwurf('Implantatkronen auf 14 und 15 in Zirkon', { 14: 'f', 15: 'f' })
    expect(zr.status === 'ok' && zr.plan.zaehne['14'].TP).toBe('SKM')
    expect(zr.status === 'ok' && zr.zusammenfassung.implantatkronen).toEqual(['15', '14'])
  })

  it('Eigenlabor Premium setzt die Stufe, im Fremdlabor nur ein Hinweis', () => {
    const e = hkpEntwurf(`${BRUECKE}, Eigenlabor, Premium`, LUECKE)
    expect(e.status === 'ok' && e.plan.einstellungen.eigenPrivatStufe).toBe(4)
    expect(e.status === 'ok' && e.plan.positionen.some((p) => p.id.startsWith('aufw-'))).toBe(true)
    const f = hkpEntwurf(`${BRUECKE}, Fremdlabor, Premium`, LUECKE)
    expect(f.status === 'ok' && f.plan.einstellungen.eigenPrivatStufe).toBe(0)
    expect(f.status === 'ok' && f.hinweise.some((h) => h.includes('nur im Eigenlabor'))).toBe(true)
  })
})

describe('Ausführung eines bestehenden Plans ändern', () => {
  const basis = () => {
    const r = hkpEntwurf(BRUECKE, LUECKE)
    if (r.status !== 'ok') throw new Error('kein Plan')
    return r.plan
  }

  it('NEM → Zirkon und zurück', () => {
    const z = ausfuehrungAendern(basis(), { werkstoff: 'zirkon' })
    expect(z.ok).toBe(true)
    if (!z.ok) return
    expect(z.beschreibung).toBe('Zirkon statt Nichtedelmetall')
    expect(z.plan.zaehne['14'].TP).toBe('KM')
    expect(z.plan.zaehne['16'].TP).toBe('BM')
    expect(z.nachher.gesamt).not.toBe(z.vorher.gesamt)
    const n = ausfuehrungAendern(z.plan, ausfuehrungIn('doch wieder NEM'))
    expect(n.ok).toBe(true)
    if (!n.ok) return
    expect(n.beschreibung).toBe('Nichtedelmetall statt Zirkon')
    expect(Object.values(n.plan.zaehne).every((v) => !v.TP.trim())).toBe(true)
    expect(n.nachher.gesamt).toBeCloseTo(z.vorher.gesamt, 2)
  })

  it('Scan, Labor und Stufe in einem Satz', () => {
    const r = ausfuehrungAendern(basis(), ausfuehrungIn('Mit Intraoralscan und im Eigenlabor, maximal teuer'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Premium = Vollkeramik im Eigenlabor, deshalb wechselt auch das Material
    expect(r.beschreibung).toBe('Zirkon statt Nichtedelmetall, Intraoralscan statt Abdruck, Eigenlabor statt Fremdlabor, Eigenlabor-Stufe Premium statt Kasse')
    expect(hat(r.plan, 'GOZ', '0065')).toBe(true)
    expect(r.plan.positionen.filter((p) => p.ebene === 'BEL' || p.ebene === 'BEB').every((p) => laborVon(p, r.plan) === 'eigen')).toBe(true)
    const f = ausfuehrungAendern(r.plan, { labor: 'gewerbe' })
    expect(f.ok && f.plan.einstellungen.eigenPrivatStufe).toBe(0)
    expect(f.ok && f.beschreibung).toBe('Nichtedelmetall statt Zirkon, Fremdlabor statt Eigenlabor, Eigenlabor-Stufe Kasse statt Premium')
  })

  it('manuelle Positionen bleiben', () => {
    const p = basis()
    p.positionen.push({ id: 'hand-1', ebene: 'GOZ', nr: '2197', zahn: '14', anzahl: 1, faktor: 2.3 })
    const r = ausfuehrungAendern(p, { werkstoff: 'zirkon' })
    expect(r.ok && r.plan.positionen.some((x) => x.id === 'hand-1')).toBe(true)
  })

  it('Implantatsystem wechseln; ohne Implantate ehrlicher Hinweis', () => {
    const i = hkpEntwurf('Implantatkronen auf 14 und 15', { 14: 'f', 15: 'f' }, { implantatSystem: 'medentis-icx' })
    if (i.status !== 'ok') throw new Error('kein Plan')
    const r = ausfuehrungAendern(i.plan, ausfuehrungIn('nimm Straumann'))
    expect(r.ok && r.beschreibung).toBe('Implantatsystem Straumann statt medentis ICX')
    expect(r.ok && r.plan.implantat.system).toBe('straumann-bl')
    const k = ausfuehrungAendern(basis(), { implantatSystem: 'camlog' })
    expect(k).toMatchObject({ ok: false, meldung: 'In diesem HKP sind keine Implantate geplant.' })
  })

  it('nichts verstanden bzw. schon so', () => {
    expect(ausfuehrungAendern(basis(), {})).toMatchObject({ ok: false, grund: 'nichts' })
    expect(ausfuehrungAendern(basis(), { abformung: 'abdruck' })).toMatchObject({ ok: false, grund: 'unveraendert' })
  })
})

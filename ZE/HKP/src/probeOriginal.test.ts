import { describe, expect, it } from 'vitest'
import { leererPlan } from './store/plan'
import { berechnen, type Listen } from './engine/berechnung'
import { STANDARD_LISTEN } from './store/preislisten'
import { blattUebernehmen, ohneBlatt, originalErgebnis, planSchluessel, vomBlatt } from './probeOriginal'
import type { ProbeGebuehr } from './probeImport'
import { privatStufeAufBlatt } from './engine/aufwertung'
import type { HkpPlan } from './types'

const l = (typ: string, id: string) => STANDARD_LISTEN.find((x) => x.typ === typ && x.id === id) as never
const LISTEN: Listen = { bema: l('bema', 'bema-2026'), goz: l('goz', 'goz-2012'), bel: l('bel2', 'bel2-bayern-2026'), beb: l('beb', 'beb-itz-2024'), fz: l('festzuschuss', 'fz-2026') }

const GEBUEHREN: ProbeGebuehr[] = [
  { ebene: 'GOZ', nr: '2200', zahn: '46', anzahl: 1, betrag: 260 },
  { ebene: 'GOZ', nr: '2200', zahn: '47', anzahl: 1, betrag: 260 },
  { ebene: 'BEB', nr: '02161', zahn: '', anzahl: 2, betrag: 199, text: 'Zirkonkrone' },
]
const SUMMEN = { honorarGoz: 520, honorarBema: 0, labor: 450, gesamt: 970, festzuschuss: 300, eigenanteil: 670, laborBeleg: 450.11 }

describe('Originalzustand vom Blatt', () => {
  it('zeigt die Summen exakt wie auf dem Blatt', () => {
    const b = blattUebernehmen(leererPlan(), LISTEN, GEBUEHREN, SUMMEN)
    expect(b.original).not.toBeNull()
    const e = originalErgebnis(berechnen(b.plan, LISTEN), b.original!)
    expect(e.summen.gozHonorar).toBe(520)
    expect(e.summen.materialUndLabor).toBe(450)
    expect(e.summen.gesamt).toBe(970)
    expect(e.summen.festzuschuss).toBe(300)
    expect(e.summen.eigenanteil).toBe(670)
  })

  it('nimmt die Bezeichnung vom Beleg, ohne Text die der Liste (fünfstellige BEB-Nummer)', () => {
    const zeilen: ProbeGebuehr[] = [
      { ebene: 'BEB', nr: '00001', zahn: '', anzahl: 1, betrag: 10.4, text: 'Modell vom Beleg' },
      { ebene: 'BEB', nr: '00021', zahn: '', anzahl: 1, betrag: 23 },
      { ebene: 'BEB', nr: 'SCAN', zahn: '', anzahl: 1, betrag: 89 },
    ]
    const b = blattUebernehmen(leererPlan(), LISTEN, zeilen, { laborBeleg: 122.4 })
    const texte = b.plan.positionen.filter((p) => p.ebene === 'BEB').map((p) => p.text)
    expect(texte[0]).toBe('Modell vom Beleg')
    expect(texte[1]).toBe(LISTEN.beb!.eintraege.find((e) => e.nr.trim().padStart(4, '0') === '0021')!.text)
    expect(texte[2]).toBe('Laborleistung laut Beleg')
  })

  it('rechnet nach einer Änderung dicht am Blatt weiter, Labor nicht doppelt', () => {
    const b = blattUebernehmen(leererPlan(), LISTEN, GEBUEHREN, SUMMEN)
    const e = berechnen(b.plan, LISTEN)
    expect(e.summen.materialUndLabor).toBeCloseTo(450.11, 2)
    expect(Math.abs(e.summen.gozHonorar - 520)).toBeLessThan(1)
  })

  it('erkennt den unveränderten Plan am Schlüssel', () => {
    const b = blattUebernehmen(leererPlan(), LISTEN, GEBUEHREN, SUMMEN)
    expect(planSchluessel(b.plan)).toBe(b.original!.schluessel)
    const anders = { ...b.plan, einstellungen: { ...b.plan.einstellungen, honorarFaktor: 3.5 } }
    expect(planSchluessel(anders)).not.toBe(b.original!.schluessel)
  })

  it('nimmt die Blattzeilen vor einem Lauf der Regelengine wieder heraus', () => {
    const start = leererPlan()
    const b = blattUebernehmen(start, LISTEN, GEBUEHREN, SUMMEN)
    const q = ohneBlatt(b.plan, b.original)
    expect(q.positionen.some(vomBlatt)).toBe(false)
    expect(q.einstellungen.mwstLabor).toBe(start.einstellungen.mwstLabor)
  })

  it('meldet, wenn nur Teil 1 hochgeladen ist', () => {
    const b = blattUebernehmen(leererPlan(), LISTEN, [], { festzuschuss: 300 })
    expect(b.original).toBeNull()
    expect(b.hinweise[0]).toContain('Teil 2')
  })

  it('führt Fremdlabor als eigene Summe, wenn Teil 2 mehr ausweist als der Eigenbeleg', () => {
    const b = blattUebernehmen(leererPlan(), LISTEN, GEBUEHREN, { ...SUMMEN, labor: 1000, gesamt: 1520 })
    const e = berechnen(b.plan, LISTEN)
    expect(e.summen.materialUndLabor).toBeCloseTo(1000, 2)
  })
})

describe('Regler auf dem hochgeladenen Plan', () => {
  const start = () => {
    const p = leererPlan()
    const zaehne = { ...p.zaehne, '46': { ...p.zaehne['46'], B: 'f', R: 'E', TP: 'SKM' }, '47': { ...p.zaehne['47'], B: 'f', R: 'E', TP: 'SKM' } }
    return blattUebernehmen({ ...p, zaehne }, LISTEN, [...GEBUEHREN, { ebene: 'GOZ', nr: '9999x', zahn: '46', anzahl: 1, betrag: 40 }], { ...SUMMEN, honorarGoz: 560, gesamt: 1010, eigenanteil: 710 }).plan
  }
  const mit = (p: HkpPlan, e: Partial<HkpPlan['einstellungen']>): HkpPlan => ({ ...p, einstellungen: { ...p.einstellungen, ...e } })
  const nummern = (p: HkpPlan, ebene: string) => berechnen(p, LISTEN).positionen.filter((x) => x.ebene === ebene && !vomBlatt(x)).map((x) => x.nr)

  it('BEB-Aufschlag hebt den festen Preis vom Beleg', () => {
    const p = start()
    const vorher = berechnen(p, LISTEN).summen.eigenBeb
    const nachher = berechnen(mit(p, { eigenPrivatAufschlag: 10 }), LISTEN).summen.eigenBeb
    expect(vorher).toBeCloseTo(398, 2)
    expect(nachher).toBeCloseTo(437.8, 2)
  })

  it('GOZ-Zusatzstufen setzen auch bei Implantatkronen Leistungen an', () => {
    const p = start()
    expect(nummern(mit(p, { gozZusatzStufe: 2 }), 'GOZ')).toEqual(expect.arrayContaining(['2197', '2040']))
    expect(nummern(mit(p, { gozZusatzStufe: 5 }), 'GOZ')).toEqual(expect.arrayContaining(['8000', '8010', '8020', '8050', '8080', '8090']))
    expect(nummern(mit(p, { gozZusatzStufe: 6 }), 'GOZ').filter((n) => n === '0090')).toHaveLength(2)
    const g = (s: number) => berechnen(mit(p, { gozZusatzStufe: s }), LISTEN).summen.gozHonorar
    for (let s = 1; s <= 6; s++) expect(g(s)).toBeGreaterThanOrEqual(g(s - 1))
    expect(g(6)).toBeGreaterThan(g(0))
  })

  it('Privatstufen fügen BEB-Leistungen hinzu, ohne den Beleg zu doppeln, und lassen sich zurückstellen', () => {
    const p = start()
    const beb = (q: HkpPlan) => q.positionen.filter((x) => x.id.startsWith('aufw-')).map((x) => x.nr)
    const s3 = privatStufeAufBlatt(p, 3).plan
    expect(beb(s3)).toEqual(expect.arrayContaining(['2951', '2033', '0021', '0223', '0404']))
    const s5 = privatStufeAufBlatt(s3, 5).plan
    expect(beb(s5)).toEqual(expect.arrayContaining(['6906', '2972', '1225', '0405', '0521']))
    expect(beb(s5)).not.toContain('2033')
    expect(berechnen(s5, LISTEN).summen.eigenBeb).toBeGreaterThan(berechnen(s3, LISTEN).summen.eigenBeb)
    expect(s5.positionen.filter(vomBlatt)).toEqual(p.positionen.filter(vomBlatt))
    const mitModell = { ...p, positionen: [...p.positionen, { id: 'blatt-BEB-9', ebene: 'BEB' as const, nr: '00021', zahn: '', anzahl: 1, auto: false, labor: 'eigen' as const, preis: 23 }] }
    expect(beb(privatStufeAufBlatt(mitModell, 3).plan)).not.toContain('0021')
    expect(beb(privatStufeAufBlatt(s5, 0).plan)).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import type { HkpPlan, Position, Preisliste } from '../types'
import { leererPlan } from '../store/plan'
import { STANDARD_LISTEN } from '../store/preislisten'
import { berechnen, type Listen } from './berechnung'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden } from './regeln'
import { regelUebernehmen } from './aufwertung'
import { WERKSTOFFE, kronenEinheiten, materialErmitteln } from './material'

const liste = <T extends Preisliste['typ']>(typ: T, id: string) => STANDARD_LISTEN.find((l) => l.typ === typ && l.id === id) as Preisliste<T>
const LISTEN: Listen = {
  bema: liste('bema', 'bema-2026'), goz: liste('goz', 'goz-2012'), bel: liste('bel2', 'bel2-bayern-2026'),
  beb: liste('beb', 'beb-itz-2024'), fz: liste('festzuschuss', 'fz-2026'),
}

function geplant(befund: Record<string, string>, tp: Record<string, string> = {}, labor: HkpPlan['einstellungen']['labor'] = 'gewerbe'): HkpPlan {
  const p = leererPlan()
  p.abformung = 'abdruck'
  p.einstellungen.labor = labor
  for (const [z, b] of Object.entries(befund)) p.zaehne[z].B = b
  for (const [z, t] of Object.entries(tp)) p.zaehne[z].TP = t
  return regelUebernehmen(p, therapieAnwenden(regelversorgungErmitteln(p.zaehne, regelOptionen(p)), p.zaehne, p))
}
const material = (e: ReturnType<typeof berechnen>) => e.positionen.filter((p) => p.material)
const nem9700 = (e: ReturnType<typeof berechnen>) => e.positionen.filter((p) => p.ebene === 'BEL' && p.nr === '9700').reduce((s, p) => s + p.anzahl, 0)

describe('Kronenmaterial', () => {
  it('Regelversorgung mit NEM: keine Materialzeile, 970 0 bleibt, Wahl wird erfragt', () => {
    const e = berechnen(geplant({ 16: 'ww', 26: 'ww' }), LISTEN)
    expect(material(e)).toHaveLength(0)
    expect(nem9700(e)).toBe(2)
    expect(e.hinweise.some((h) => h.stufe === 'warnung' && h.text.startsWith('Kronenmaterial nicht gewählt (16 NEM, 26 NEM)'))).toBe(true)
  })

  it('Hochgold an einer Kassenkrone: Legierung nach Gewicht × Grammpreis, 970 0 entfällt dort', () => {
    const p = geplant({ 16: 'ww', 26: 'ww' })
    p.werkstoffe = { 16: 'hochgold', 26: 'nem' }
    const e = berechnen(p, LISTEN)
    expect(material(e)).toEqual([expect.objectContaining({ zahn: '16', anzahl: 2.5, einzelpreis: 140, betrag: 350, labor: 'fremd' })])
    expect(nem9700(e)).toBe(1)
    expect(e.summen.fremdMat).toBe(350)
    expect(e.hinweise.some((h) => h.text.includes('§ 10 Abs. 2 Nr. 5 GOZ'))).toBe(true)
    expect(e.hinweise.some((h) => h.text.startsWith('Kronenmaterial nicht gewählt'))).toBe(false)
  })

  it('Eigenlabor: Material geht in den Eigenlaborbeleg mit MwSt.', () => {
    const p = geplant({ 16: 'ww' }, {}, 'praxis')
    p.werkstoffe = { 16: 'goldreduziert' }
    const e = berechnen(p, LISTEN)
    const m = material(e)
    expect(m).toEqual([expect.objectContaining({ labor: 'eigen', anzahl: 2.1, einzelpreis: 105 })])
    expect(e.summen.eigenMat).toBe(220.5)
    expect(e.summen.eigenNetto).toBe(Math.round((e.summen.eigenBel + e.summen.eigenBeb + 220.5) * 100) / 100)
    expect(e.summen.material).toBe(0)
  })

  it('Privatkrone vollkeramisch: Zirkon als Standard, Presskeramik und LiSi wählbar', () => {
    const p = geplant({ 16: 'ww', 15: 'ww' }, { 16: 'KM', 15: 'K' })
    const vorher = berechnen(p, LISTEN)
    expect(material(vorher).map((x) => [x.zahn, x.betrag])).toEqual([['15', 1.11], ['16', WERKSTOFFE.zirkon.preis]])
    p.werkstoffe = { 16: 'lithiumdisilikat', 15: 'zirkon' }
    const nachher = berechnen(p, LISTEN)
    expect(material(nachher).find((x) => x.zahn === '16')?.betrag).toBe(29.5)
    expect(material(nachher).find((x) => x.zahn === '15')?.betrag).toBe(1.11)
    expect(nachher.hinweise.some((h) => h.text.includes('nicht gewählt (15 NEM)'))).toBe(true)
  })

  it('Härtefall mit Regelversorgung: Kasse trägt NEM, Edelmetall bleibt beim Patienten', () => {
    const p = geplant({ 16: 'ww' })
    p.zuschuss = { ...p.zuschuss, haertefall: true }
    const nem = berechnen(p, LISTEN)
    expect(nem.summen.eigenanteil).toBe(0)
    p.werkstoffe = { 16: 'hochgold' }
    const gold = berechnen(p, LISTEN)
    expect(gold.summen.eigenanteil).toBe(Math.round(350 * 1.07 * 100) / 100)
  })

  it('Teleskope und Lithiumdisilikat-Glied im Molarenbereich', () => {
    const einheiten = kronenEinheiten([
      { zahn: '14', ebene: 'BEL', nr: '1200' }, { zahn: '24', ebene: 'BEB', nr: '3001' },
      { zahn: '26', ebene: 'BEB', nr: '2351' }, { zahn: '26', ebene: 'BEB', nr: '2612' },
    ])
    expect(einheiten.map((e) => `${e.zahn} ${e.einheit}`)).toEqual(['14 teleskop', '24 teleskop', '26 glied'])
    const m = materialErmitteln(einheiten, { 14: 'hochgold', 24: 'hochgold', 26: 'presskeramik' })
    expect(m.zeilen.map((z) => z.betrag)).toEqual([490, 490, 17.5])
    expect(m.edelmetallBel).toBe(0)
    expect(m.edelmetallKasse).toEqual(['14'])
    expect(m.hinweise.some((h) => h.startsWith('Lithiumdisilikat-Brückenglied an 26'))).toBe(true)
  })

  it('eingelesene Laborrechnung: kein geschätztes Fremdlabor-Material', () => {
    const p = geplant({ 16: 'ww' })
    p.werkstoffe = { 16: 'hochgold' }
    p.fremdlabor = { ...p.fremdlabor, import: { datei: 'x.xml', eingelesen: '', rechnungsnummer: 'R1', lieferdatum: '', herstellungsort: '', abrechnungsbereich: '', netto: 0, mwst: 0, brutto: 0 } }
    p.positionen = p.positionen.filter((x: Position) => x.ebene !== 'BEL')
    expect(material(berechnen(p, LISTEN))).toHaveLength(0)
  })
})

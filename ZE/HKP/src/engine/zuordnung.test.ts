import { describe, expect, it } from 'vitest'
import type { HkpPlan, Position, Preisliste } from '../types'
import { leererPlan } from '../store/plan'
import { STANDARD_LISTEN } from '../store/preislisten'
import { berechnen, type Listen } from './berechnung'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden } from './regeln'
import { regelUebernehmen } from './aufwertung'
import { katalogZuordnen, zuordnungVorschlagen, zuordnungText } from './zuordnung'
import type { EigenPosition } from './eigenlabor'
import { rechnen, type PraxisListen } from '../clara'
import type { PraxisKatalog } from '../store/praxiskatalogDaten'

const liste = <T extends Preisliste['typ']>(typ: T, id: string) => STANDARD_LISTEN.find((l) => l.typ === typ && l.id === id) as Preisliste<T>
const LISTEN: Listen = {
  bema: liste('bema', 'bema-2026'), goz: liste('goz', 'goz-2012'), bel: liste('bel2', 'bel2-bayern-2026'),
  beb: liste('beb', 'beb-itz-2024'), fz: liste('festzuschuss', 'fz-2026'),
}
const pvs = (nr: string, text: string, preis = 10): EigenPosition => ({ nr, text, preis, quelle: 'pvs' })

describe('Zuordnung Praxisposition → Leistungsschritt', () => {
  it('gleiche Nummer nur, wenn der Text dieselbe Leistung meint', () => {
    expect(zuordnungVorschlagen(pvs('0009', 'Scan Spezialmodell, Kunststoff gedruckt je Kiefer, inkl. Konstruktion'))?.fuer).toBe('0009')
    expect(zuordnungVorschlagen(pvs('0021', 'Modell für Sägesegmente'))?.fuer).toBe('0021')
    // BEB 97 „Glasieren“ ist in der BEB-ITZ „Fräsen je Glied“
    expect(zuordnungVorschlagen(pvs('2955', 'Glasieren, je Einheit'))).toBeUndefined()
    expect(zuordnungVorschlagen(pvs('8102', 'Metallbasis aufpassen'))).toBeUndefined()
  })

  it('Fertigungsart: gefräst nur nach Intraoralscan, gegossen nur nach Abdruck', () => {
    expect(zuordnungVorschlagen(pvs('2101', 'Krone gegossen'))).toMatchObject({ fuer: '2101', wenn: 'abdruck' })
    expect(zuordnungVorschlagen(pvs('2151', 'Krone gefräst'))).toMatchObject({ fuer: '2101', wenn: 'scan' })
    expect(zuordnungVorschlagen(pvs('2161', 'Krone gefräst, für Keramik- oder Polymer teilverbl.'))).toMatchObject({ fuer: '2121', wenn: 'scan' })
    expect(zuordnungVorschlagen(pvs('2354', 'Brückenglied gefräst, für Keramik- oder'))).toMatchObject({ fuer: '2362', wenn: 'scan' })
  })

  it('Material ohne BEB-Nummer bekommt eine Rolle', () => {
    expect(zuordnungVorschlagen(pvs('FZ', 'Vita Frontzahn Kunststoff'))?.fuer).toBe('MAT:zahn-front')
    expect(zuordnungVorschlagen(pvs('SZ', 'Vita Seitenzahn Kunststoff'))?.fuer).toBe('MAT:zahn-seite')
    expect(zuordnungVorschlagen(pvs('AB01', 'Alginatabdruck je Kiefer'))?.fuer).toBe('MAT:abform-alginat')
    expect(zuordnungVorschlagen(pvs('F02', 'Doppelmischabformung / Korrekturabformung'))?.fuer).toBe('MAT:abform-praezision')
    expect(zuordnungVorschlagen(pvs('FUTAR', 'Futar Registrierungsmaterial'))?.fuer).toBe('MAT:registrat')
    expect(zuordnungVorschlagen(pvs('F03', 'Straumann Abformpfosten'))?.fuer).toBe('MAT:implantat-abdruckpfosten')
    expect(zuordnungText({ fuer: 'MAT:zahn-front' })).toContain('Konfektionszahn Front')
  })

  it('Labortexte mit anderem Wortlaut als die BEB', () => {
    const fuer = (text: string) => zuordnungVorschlagen({ nr: 'L-1', text })?.fuer
    expect(fuer('Zirkonkrone monolithisch gefräst')).toBe('2281')
    expect(fuer('Lithiumdisilikat-Krone monolithisch')).toBe('2281')
    expect(fuer('Brückenglied Zirkon monolithisch')).toBe('2361')
    expect(fuer('NEM Krone vollverblendet Keramik')).toBe('2121')
    expect(fuer('Teleskopkrone NEM')).toBe('3004')
    expect(fuer('Zirkon Rohling Multilayer')).toBe('MAT:rohling-zirkon')
  })

  it('Praxisliste nach BEB 97 (DS-Win „BEB“)', () => {
    const v = (nr: string, text: string) => { const x = zuordnungVorschlagen(pvs(nr, text)); return x ? `${x.fuer}${x.wenn ? '/' + x.wenn : ''}` : '' }
    expect(v('2101', 'Gusskrone')).toBe('2101/abdruck')
    expect(v('2104', 'Gusskrone für Keramikteilverblendung')).toBe('2121/abdruck')
    expect(v('2107', 'Guß-Dreiviertelkrone')).toBe('2104/abdruck')
    expect(v('2521', 'Keramikinlay, einflächig')).toBe('2551')
    expect(v('2424', 'Kunststoffinlay mehrflächig')).toBe('')
    expect(v('3209', 'Doppelkrone für Keramik-Verbl.sekundär')).toBe('')
    expect(v('0411', 'Individueller Frontzahnführungsteller')).toBe('0522')
    expect(v('2804', 'Frontzahn nach gnathologischen Kriterien')).toBe('')
    expect(v('4615', 'Auflage gegossen')).toBe('4122')
    expect(v('4616', 'Kralle gegossen')).toBe('')
    expect(v('ZFK', 'Frontzähne, Kunststoff (Vitapan)')).toBe('MAT:zahn-front')
  })

  it('ältere Nummerierung: fast wörtlich eine andere Leistung', () => {
    expect(zuordnungVorschlagen(pvs('2361', 'Brückenglied gegossen/gefräst Metall'))?.fuer).toBe('2362')
    expect(zuordnungVorschlagen(pvs('0007', 'Kontrollmodell'))?.fuer).toBe('0008')
    expect(zuordnungVorschlagen(pvs('0404', 'Modellmontage in individuellen Artikulat'))?.fuer).toBe('0405')
    // nur ungefähr anders: bleibt bei der Nummer
    expect(zuordnungVorschlagen(pvs('1003', 'Basis aus Kunststoff'))?.fuer).toBe('1003')
  })

  it('von Hand festgelegte Zuordnung bleibt, auch „keine“', () => {
    const k = katalogZuordnen([
      { nr: 'X1', text: 'irgendwas', preis: 5, fuer: '2101', wenn: 'scan', zuordnung: 'hand' },
      { nr: '2101', text: 'Krone gegossen', preis: 9, fuer: '', zuordnung: 'hand' },
      pvs('2151', 'Krone gefräst'),
    ])
    expect(k.map((e) => [e.nr, e.fuer, e.wenn, e.zuordnung])).toEqual([
      ['X1', '2101', 'scan', 'hand'], ['2101', '', undefined, 'hand'], ['2151', '2101', 'scan', 'auto'],
    ])
  })
})

describe('Berechnung mit zugeordneten Positionen', () => {
  const krone = (abformung: HkpPlan['abformung'], extra: Partial<Position> = {}, labor: HkpPlan['einstellungen']['labor'] = 'praxis') => {
    const p = leererPlan()
    p.abformung = abformung
    p.einstellungen.labor = labor
    p.positionen = [{ id: 'k', ebene: 'BEB', nr: '2101', zahn: '16', anzahl: 1, auto: true, ...extra }]
    return p
  }
  const eigen = [pvs('2101', 'Krone gegossen', 100), pvs('2151', 'Krone gefräst', 120)]
  const zeile = (p: HkpPlan, l: Listen) => berechnen(p, l).positionen.find((x) => x.id === 'k')!

  it('Eigenlabor: Praxisposition je nach Ablauf', () => {
    expect(zeile(krone('scan'), { ...LISTEN, eigen })).toMatchObject({ eigen: '2151', einzelpreis: 120 })
    expect(zeile(krone('abdruck'), { ...LISTEN, eigen })).toMatchObject({ eigen: '2101', einzelpreis: 100 })
    // von Hand gewählte Nummer bleibt genau diese Position
    expect(zeile(krone('scan', { auto: false }), { ...LISTEN, eigen })).toMatchObject({ eigen: '2101', einzelpreis: 100 })
  })

  it('Fremdlabor: eigene Preisliste zugeordnet, bis die Laborrechnung eingelesen ist', () => {
    const fremd = [pvs('L-77', 'Krone gefräst', 130)]
    const p = krone('scan', {}, 'gewerbe')
    expect(zeile(p, { ...LISTEN, eigen, fremd })).toMatchObject({ labor: 'fremd', fremd: 'L-77', einzelpreis: 130 })
    expect(zeile(krone('abdruck', {}, 'gewerbe'), { ...LISTEN, eigen, fremd }).fremd).toBeUndefined()
    const mitRechnung = { ...p, fremdlabor: { ...p.fremdlabor, import: { datei: 'x.xml', eingelesen: '', rechnungsnummer: '1', lieferdatum: '', herstellungsort: '', abrechnungsbereich: '', netto: 0, mwst: 0, brutto: 0 } } }
    expect(zeile(mitRechnung, { ...LISTEN, eigen, fremd }).fremd).toBeUndefined()
  })

  it('gleichwertige Nummer: Laborposition für 2361 gilt beim geplanten Keramik-Brückenglied 2351', () => {
    const p = leererPlan()
    p.einstellungen.labor = 'gewerbe'
    p.positionen = [{ id: 'k', ebene: 'BEB', nr: '2351', zahn: '25', anzahl: 1, auto: true }]
    const fremd = [pvs('Z-9', 'Brückenglied Zirkon monolithisch', 150)]
    expect(zeile(p, { ...LISTEN, fremd })).toMatchObject({ fremd: 'Z-9', einzelpreis: 150 })
  })

  it('Totalprothese: Konfektionszähne je Prothesenzahn, Alginat nur bei Abdruck', () => {
    const ok = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
    const katalog = [pvs('FZ', 'Vita Frontzahn Kunststoff', 4), pvs('SZ', 'Vita Seitenzahn Kunststoff', 5), pvs('AB01', 'Alginatabdruck je Kiefer', 8), pvs('F01', 'Funktionsabformung je Kiefer', 12)]
    const rechne = (abformung: HkpPlan['abformung']) => {
      const p0 = leererPlan()
      for (const z of ok) p0.zaehne[z].B = 'f'
      p0.abformung = abformung
      p0.einstellungen.labor = 'praxis'
      const p = regelUebernehmen(p0, therapieAnwenden(regelversorgungErmitteln(p0.zaehne, regelOptionen(p0)), p0.zaehne, p0))
      return berechnen(p, { ...LISTEN, eigen: katalog }).positionen.filter((x) => x.ebene === 'MAT')
    }
    const abdruck = rechne('abdruck')
    expect(abdruck.map((x) => [x.eigen, x.anzahl, x.einzelpreis]).sort()).toEqual([['AB01', 1, 8], ['F01', 1, 12], ['FZ', 6, 4], ['SZ', 8, 5]])
    expect(rechne('scan').map((x) => x.eigen).sort()).toEqual(['F01', 'FZ', 'SZ'])
  })
})

describe('MAS: Katalog aus PlanR und Zuordnungen aus dem Browser', () => {
  const katalog: PraxisKatalog = {
    pvs: 'DS-Win', stand: '2026-10-14T00:00:00Z', listeName: 'Praxis', goz: [], komplexe: [],
    eigenlabor: [{ nr: '2101', text: 'Krone gegossen', preis: 100 }, { nr: '2151', text: 'Krone gefräst', preis: 120 }],
  }
  const plan = (abformung: HkpPlan['abformung'], labor: HkpPlan['einstellungen']['labor'] = 'praxis') => {
    const p = leererPlan()
    p.abformung = abformung
    p.einstellungen.labor = labor
    p.positionen = [{ id: 'k', ebene: 'BEB', nr: '2101', zahn: '16', anzahl: 1, auto: true }]
    return p
  }
  const zeile = (p: HkpPlan, praxis: PraxisListen) => rechnen(p, praxis).positionen.find((x) => x.id === 'k')!

  it('PVS-Positionen werden ohne Freigabe zugeordnet', () => {
    expect(zeile(plan('scan'), { katalog })).toMatchObject({ eigen: '2151', einzelpreis: 120 })
    expect(zeile(plan('abdruck'), { katalog })).toMatchObject({ eigen: '2101', einzelpreis: 100 })
  })

  it('von Hand gesetzte Zuordnung gilt auch nach neuem PVS-Abgleich', () => {
    const keine: EigenPosition[] = [{ ...pvs('2151', 'Krone gefräst', 99), fuer: '', zuordnung: 'hand' }]
    expect(zeile(plan('scan'), { katalog, eigen: keine }).eigen).toBeUndefined()
    const immer: EigenPosition[] = [{ ...pvs('2151', 'Krone gefräst', 99), fuer: '2101', zuordnung: 'hand' }]
    expect(zeile(plan('scan'), { katalog, eigen: immer })).toMatchObject({ eigen: '2151', einzelpreis: 120 })
    expect(zeile(plan('abdruck'), { katalog, eigen: immer })).toMatchObject({ eigen: '2101', einzelpreis: 100 })
  })

  it('Fremdlabor-Liste aus der Freigabe', () => {
    const fremd = [pvs('L-77', 'Krone gefräst', 130)]
    expect(zeile(plan('scan', 'gewerbe'), { katalog, fremd })).toMatchObject({ fremd: 'L-77', einzelpreis: 130 })
  })
})

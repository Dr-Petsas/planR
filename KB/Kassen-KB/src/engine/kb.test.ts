import { describe, expect, it } from 'vitest'
import { abformungAnwenden, laborXmlUebernehmen, rechnen, vorlageAnwenden } from './kb'
import { laborXmlLesen } from '../laborxml'
import { belListeFuer, bemaEintrag, BEL_LISTEN } from './listen'
import { VORLAGEN } from '../data/katalog'
import { neuerPlan, planMigrieren, STANDARD_EINSTELLUNGEN } from '../store'
import type { Einstellungen, Plan } from '../types'

const bayern: Einstellungen = { ...STANDARD_EINSTELLUNGEN, praxis: { ...STANDARD_EINSTELLUNGEN.praxis, plz: '80331' }, punktwertFest: { KB: 1.2, KCH: 1.3 } }
const mit = (ids: string[], e = bayern): Plan => {
  const p = neuerPlan('KB-T', e)
  let pos = p.positionen
  for (const id of ids) pos = vorlageAnwenden(pos, VORLAGEN.find((v) => v.id === id)!.pos)
  return { ...p, positionen: pos, angaben: { ...p.angaben, befund: 'Myoarthropathie' } }
}

describe('Listen', () => {
  it('BEMA Teil 2 aus der Recherche', () => {
    expect(bemaEintrag('K1')?.punkte).toBe(106)
    expect(bemaEintrag('K4')?.punkte).toBe(11)
    expect(bemaEintrag('UP3')?.punkte).toBe(223)
    expect(bemaEintrag('Ä2699')?.punkte).toBe(245)
  })
  it('hat für jede KZV eine BEL-II-Liste', () => {
    expect(new Set(BEL_LISTEN.map((l) => l.kzv)).size).toBe(16)
    expect(belListeFuer('11', '2026-10-07')?.id).toBe('bel2-bayern-2026')
  })
})

describe('Kassen-KB-Rechnung', () => {
  it('K1 mit Laborkette der KZV Bayern (Gewerbe)', () => {
    const r = rechnen(mit(['k1']), bayern)
    // BEMA 2 (20 P.) + K1 (106 P.) × 1,2
    expect(r.summeHonorar).toBe(151.2)
    // 2 × 001 0 (8,45) + 012 0 (12,42) + 401 0 (169,75)
    expect(r.summeLabor).toBe(199.07)
    expect(r.summeMaterial).toBe(6)
    expect(r.gesamt).toBe(356.27)
    expect(r.genehmigungspflichtig).toBe(true)
    expect(r.warnungen).toEqual([])
  })

  it('Praxislabor nimmt den Praxispreis der BEL II', () => {
    const p = mit(['k1'])
    const r = rechnen({ ...p, labor: 'praxis' }, bayern)
    expect(r.labor.find((z) => z.nr === '401 0')!.einzel).toBe(161.26)
  })

  it('BEMA 2 nur einmal, K1 und K2 zusammen wird gewarnt', () => {
    const p = mit(['k1', 'k2'])
    expect(p.positionen.filter((x) => x.nr === '2').length).toBe(1)
    expect(p.positionen.find((x) => x.nr === '2')!.anzahl).toBe(1)
    expect(rechnen(p, bayern).warnungen.some((w) => w.includes('nur eine der Leistungen K1, K2 oder K3'))).toBe(true)
  })

  it('UKPS ohne Veranlassung Schlafmedizin wird gewarnt', () => {
    const r = rechnen(mit(['ukps']), bayern)
    expect(r.warnungen.some((w) => w.includes('Schlafmedizin'))).toBe(true)
  })

  it('Kieferbruch: GOÄ-Leistungen wahlweise mit KCH-Punktwert, keine Genehmigung', () => {
    const p = mit(['bruch-schiene'])
    const bruch = { ...p, angaben: { ...p.angaben, art: 'kieferbruch' as const, verletzung: 'Sturz 01.10.2026' } }
    expect(rechnen(bruch, bayern).honorar[0].einzel).toBe(294)
    expect(rechnen(bruch, { ...bayern, kieferbruchKch: true }).honorar[0].einzel).toBe(318.5)
    expect(rechnen(bruch, bayern).genehmigungspflichtig).toBe(false)
  })

  it('UKPS bei OSAS: eigene Planart, Laborkette der BEL II', () => {
    const p = mit(['ukps'])
    const u = { ...p, angaben: { ...p.angaben, art: 'ukps' as const, schlafmedizin: true, befund: 'OSAS' } }
    const r = rechnen(u, bayern)
    // UP1 27 + UP2 49 + UP3 223 = 299 P. × 1,2
    expect(r.summeHonorar).toBe(358.8)
    // VDZI lateral: 6×001 5, 2×002 5, 011 5, 012 5, 020 5, 2×021 7, 501 0, 4×510 0, 2×511 0, 4×520 0, 6×933 5
    expect(r.summeLabor).toBe(732.28)
    expect(r.summeMaterial).toBe(0)
    expect(r.warnungen).toEqual([])
    expect(r.summePrivat).toBe(0)
  })

  it('drei VDZI-Abrechnungsrouten, ohne Pauschale und ohne BEMA 2', () => {
    const menge = (id: string, nr: string) =>
      VORLAGEN.find((v) => v.id === id)!.pos.filter((p) => p.nr === nr).reduce((s, p) => s + p.anzahl, 0)
    expect(menge('ukps', '5100')).toBe(4)
    expect(menge('ukps', '5110')).toBe(2)
    expect(menge('ukps', '5200')).toBe(4)
    expect(menge('ukps-oral', '5100')).toBe(1)
    expect(menge('ukps-oral', '5110')).toBe(1)
    expect(menge('ukps-oral', '5200')).toBe(0)
    expect(menge('ukps-flosse', '5020')).toBe(2)
    expect(menge('ukps-flosse', '5100')).toBe(2)
    for (const id of ['ukps', 'ukps-oral', 'ukps-flosse']) {
      const pos = VORLAGEN.find((v) => v.id === id)!.pos
      expect(pos.some((p) => p.nr === '605' || p.nr === '2')).toBe(false)
      expect(pos.filter((p) => p.nr === 'UP1').length).toBe(1)
    }
  })

  it('Intraoralscan: gedruckte Modelle als Privatanteil, keine Abformpauschale', () => {
    const p = mit(['ukps'])
    const scan = { ...p, abformung: 'scan' as const, positionen: abformungAnwenden(p.positionen, 'scan') }
    expect(scan.positionen.some((x) => x.nr === '0015' || x.nr === '0025' || x.nr === '0217' || x.nr === '605')).toBe(false)
    expect(scan.positionen.find((x) => x.ebene === 'PRIVAT')).toMatchObject({ nr: '0009', anzahl: 6 })
    const r = rechnen(scan, bayern)
    expect(r.summePrivat).toBe(138)
    expect(r.summeMaterial).toBe(0)
    expect(r.summeLabor).toBe(588.26)
    expect(r.hinweise.some((h) => h.includes('UP2 enthalten'))).toBe(true)
    // und zurück: Modelle wieder da, bei UKPS ohne Pauschale 605
    const zurueck = abformungAnwenden(scan.positionen, 'abdruck')
    expect(zurueck.find((x) => x.nr === '0015')!.anzahl).toBe(6)
    expect(zurueck.some((x) => x.nr === '605')).toBe(false)
    expect(zurueck.some((x) => x.ebene === 'PRIVAT')).toBe(false)
  })

  it('Labor-XML ersetzt die Laborpositionen, NBL wird Privatanteil', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Laborabrechnung Version="4.5">
 <Rechnung Laborname="Dentallabor Muster" Laborrechnungsnummer="KV-17" Herstellungsort="D-80331 München" Gesamtbetrag_netto="49000" Mehrwertsteuer_gesamt="3430" Gesamtbetrag_brutto="52430">
  <MWST-Gruppe Mehrwertsteuersatz="70" Zwischensumme_netto="49000" Mehrwertsteuerbetrag="3430">
   <Position Art="BEL" Nummer="5010" Beschreibung="Basen UKPS" Einzelpreis="40000" Menge="1000"/>
   <Position Art="BEL" Nummer="5100" Beschreibung="Protrusionselement" Einzelpreis="2000" Menge="2000"/>
   <Position Art="NBL" Beschreibung="0009 Modell gedruckt" Einzelpreis="2500" Menge="2000"/>
  </MWST-Gruppe>
 </Rechnung>
</Laborabrechnung>`
    const x = laborXmlLesen(xml)
    expect(x.fehler).toEqual([])
    const p = mit(['ukps'])
    const { plan, meldungen } = laborXmlUebernehmen({ ...p, labor: 'praxis' }, x, 'kv.xml')
    expect(plan.labor).toBe('gewerbe')
    expect(plan.fremdlabor.name).toBe('Dentallabor Muster')
    expect(plan.positionen.filter((q) => q.ebene === 'BEL').length).toBe(2)
    expect(plan.positionen.some((q) => q.ebene === 'BEMA' && q.nr === 'UP3')).toBe(true)
    expect(plan.positionen.some((q) => q.ebene === 'MATERIAL' && q.nr === '605')).toBe(false)
    expect(meldungen.some((m) => m.includes('Privatanteil'))).toBe(true)
    const r = rechnen(plan, bayern)
    expect(r.summeLabor).toBe(440)
    expect(r.summePrivat).toBe(50)
    expect(r.warnungen.some((w) => w.includes('über dem BEL-II-Höchstpreis') && w.includes('501 0'))).toBe(true)
  })

  it('alte UKPS-Pläne wandern in die Planart UKPS', () => {
    const p = mit(['ukps'])
    const alt = { ...p, abformung: undefined, fremdlabor: undefined } as unknown as Plan
    const m = planMigrieren(alt, bayern)
    expect(m.angaben.art).toBe('ukps')
    expect(m.abformung).toBe('abdruck')
    expect(m.fremdlabor).toEqual({ name: '' })
  })

  it('Ohne Praxis-PLZ wird die fehlende KZV gemeldet', () => {
    const e = { ...STANDARD_EINSTELLUNGEN, punktwertFest: { KB: 1.2 } }
    expect(rechnen(mit(['k2'], e), e).warnungen.some((w) => w.includes('KZV der Praxis unbekannt'))).toBe(true)
  })
})

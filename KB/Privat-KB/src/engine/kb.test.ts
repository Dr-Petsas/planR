import { describe, expect, it } from 'vitest'
import { abformungAnwenden, laborXmlUebernehmen, rechnen, vorlageAnwenden } from './kb'
import { laborXmlLesen } from '../laborxml'
import { gozPunkte, GOZ_PUNKTWERT } from './listen'
import { VORLAGEN } from '../data/katalog'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import type { Plan } from '../types'

const einst = STANDARD_EINSTELLUNGEN
const planMit = (vorlage: string): Plan => {
  const p = neuerPlan('T-1', einst)
  return { ...p, positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === vorlage)!.pos) }
}

describe('GOZ-Liste', () => {
  it('kennt die Punkte aus Abschnitt H und J', () => {
    expect(gozPunkte('7010')).toBe(800)
    expect(gozPunkte('7000')).toBe(270)
    expect(gozPunkte('8000')).toBe(500)
    expect(gozPunkte('7070')).toBe(90)
    expect(GOZ_PUNKTWERT).toBeCloseTo(0.0562421, 7)
  })
})

describe('Privat-KB-Rechnung', () => {
  it('rechnet die adjustierte Aufbissschiene zum 2,3-fachen Satz', () => {
    const r = rechnen(planMit('michigan'), einst)
    const schiene = r.honorar.find((z) => z.nr === '7010')!
    expect(schiene.einzel).toBe(103.49)
    expect(r.summeHonorar).toBe(103.49)
    // Labor aus der Laborliste: 3 Modelle à 10,40, Dublieren 21,33, Mittelwert 14,75, Schiene 110,70, 2 × Desinfektion 1,80
    expect(r.summeLabor).toBe(181.58)
    expect(r.gesamt).toBe(285.07)
    expect(r.warnungen).toEqual([])
  })

  it('Funktionsanalyse folgt dem eigenen Faktor', () => {
    const p = planMit('fal')
    const r = rechnen({ ...p, regler: { ...p.regler, faFaktor: 3.0 } }, einst)
    expect(r.honorar.find((z) => z.nr === '8000')!.einzel).toBe(84.36)
    expect(r.honorar.find((z) => z.nr === '0040')!.faktor).toBe(2.3)
    expect(r.begruendung.map((z) => z.nr)).toEqual(['8000'])
  })

  it('Praxispreis schlägt die Laborliste, die Preisstufe verschiebt nur Listenpreise', () => {
    const p = planMit('tiefzieh')
    const e = { ...einst, laborPreise: { '7601': 60 } }
    const r = rechnen({ ...p, regler: { ...p.regler, laborKlasse: 2 } }, e)
    expect(r.labor.find((z) => z.nr === '7601')!.einzel).toBe(72)
  })

  it('warnt bei Laborposition ohne Preis', () => {
    const r = rechnen(planMit('knirscher'), einst)
    expect(r.labor.find((z) => z.nr === '7604')!.ohnePreis).toBe(true)
    expect(r.warnungen.length).toBe(1)
  })

  it('Faktor über 3,5 landet in der Vereinbarung nach § 2 GOZ', () => {
    const p = planMit('kontrolle')
    const r = rechnen({ ...p, regler: { ...p.regler, faktor: 4 } }, einst)
    expect(r.vereinbarung2.map((z) => z.nr)).toEqual(['7040', '7050'])
  })

  it('UKPS: Analogleistung nach Bemessung aus den Einstellungen, Fremdlabor-Platzhalter', () => {
    const p = { ...neuerPlan('T-1', einst), positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps')!.pos, einst) }
    const r = rechnen(p, einst)
    const analog = r.honorar.find((z) => z.bemessung)!
    expect(analog.nr).toBe('5220a')
    expect(analog.einzel).toBe(239.31)
    expect(analog.text).toContain('entsprechend GOZ 5220')
    // 2 × Superhartgips 10,40 + Mittelwert 14,75 + UKPS Fremdlabor 480 (Platzhalter) + Versand 8,52 + 2 × Desinfektion 1,80
    expect(r.summeLabor).toBe(527.67)
    expect(r.warnungen.some((w) => w.includes('Fremdlabor-Platzhalter (F-UKPS)'))).toBe(true)
    expect(r.hinweise.some((h) => h.includes('Kassenleistung'))).toBe(true)
    expect(r.hinweise.some((h) => h.includes('§ 10 Abs. 4'))).toBe(true)
    // andere Bemessung
    const e = { ...einst, ukpsAnalog: '7010' }
    const p2 = { ...p, positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps')!.pos, e) }
    expect(rechnen(p2, e).honorar.find((z) => z.bemessung)!.nr).toBe('7010a')
  })

  it('Praxispreis für das Fremdlabor ersetzt den Platzhalter', () => {
    const e = { ...einst, laborPreise: { 'F-UKPS': 520 } }
    const p = { ...neuerPlan('T-1', e), positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps')!.pos, e) }
    const r = rechnen({ ...p, regler: { ...p.regler, laborKlasse: 2 } }, e)
    expect(r.labor.find((z) => z.nr === 'F-UKPS')!.einzel).toBe(624)
    expect(r.warnungen).toEqual([])
  })

  it('Intraoralscan: 0065 für beide Kiefer, gedruckte Modelle, Versand bei Datenlieferung', () => {
    const p = { ...neuerPlan('T-1', einst), positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps')!.pos, einst) }
    const scan = abformungAnwenden(p.positionen, 'scan')
    expect(scan.some((x) => x.nr === '0060' || x.nr === '0002' || x.nr === '0701')).toBe(false)
    expect(scan.find((x) => x.nr === '0065')!.anzahl).toBe(6)
    expect(scan.find((x) => x.nr === '0009')!.anzahl).toBe(2)
    expect(scan.find((x) => x.nr === '0036')!.anzahl).toBe(1)
    expect(scan.find((x) => x.analog)!.nr).toBe('5220')
    const r = rechnen({ ...p, abformung: 'scan', positionen: scan }, einst)
    expect(r.hinweise.some((h) => h.startsWith('Intraoralscan'))).toBe(true)
    const zurueck = abformungAnwenden(scan, 'abdruck')
    expect(zurueck.find((x) => x.nr === '0060')!.anzahl).toBe(1)
    expect(zurueck.find((x) => x.nr === '0002')!.anzahl).toBe(2)
    expect(zurueck.find((x) => x.nr === '0701')!.anzahl).toBe(1)
  })

  it('Labor-XML ersetzt die Laborpositionen und beendet den Platzhalter', () => {
    const xml = `<Laborabrechnung Version="4.5"><Rechnung Laborname="Schlaflabor-Technik" Laborrechnungsnummer="KV-9" Gesamtbetrag_netto="51500">
      <MWST-Gruppe Mehrwertsteuersatz="70" Zwischensumme_netto="51500">
        <Position Art="NBL" Beschreibung="UKPS zweiteilig, Protrusionsscharnier" Einzelpreis="46000" Menge="1000"/>
        <Position Art="NBL" Beschreibung="0009 Modell gedruckt" Einzelpreis="2300" Menge="2000"/>
        <Position Art="MAT" Beschreibung="Scharnierset" Einzelpreis="900" Menge="1000"/>
      </MWST-Gruppe></Rechnung></Laborabrechnung>`
    const p = { ...neuerPlan('T-1', einst), positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps')!.pos, einst) }
    const { plan } = laborXmlUebernehmen(p, laborXmlLesen(xml), 'kv9.xml')
    const r = rechnen(plan, einst)
    expect(r.summeLabor).toBe(515)
    expect(r.warnungen).toEqual([])
    expect(plan.fremdlabor.name).toBe('Schlaflabor-Technik')
    expect(plan.positionen.filter((x) => x.ebene === 'GOZ').length).toBe(3)
  })

  it('Vorlagen zählen gleiche Positionen zusammen', () => {
    const v = VORLAGEN.find((x) => x.id === 'kontrolle')!.pos
    const pos = vorlageAnwenden(vorlageAnwenden([], v), v)
    expect(pos.find((x) => x.nr === '7040')!.anzahl).toBe(4)
    expect(pos.length).toBe(2)
  })
})

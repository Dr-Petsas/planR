import { describe, expect, it } from 'vitest'
import { abformungAnwenden, istUkps, laborXmlUebernehmen, rechnen, umfangAnwenden, vorlageAnwenden } from './kb'
import { laborXmlLesen } from '../laborxml'
import { gozPunkte, GOZ_PUNKTWERT } from './listen'
import { VORLAGEN } from '../data/katalog'
import { einstMigrieren, neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
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
    expect(r.mwst).toBe(12.71)
    expect(r.gesamt).toBe(297.78)
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
    expect(r.honorar.filter((z) => z.bemessung).map((z) => z.nr)).toEqual(['4000a', '8050a', '6070a'])
    const analog = r.honorar.find((z) => z.nr === '6070a')!
    expect(analog.einzel).toBeCloseTo(336.32, 1)
    expect(analog.text).toContain('entsprechend GOZ 6070')
    expect(r.hinweise.some((h) => h.includes('2 × 7010a'))).toBe(true)
    // 2 × Superhartgips 10,40 + Mittelwert 14,75 + UKPS Fremdlabor 480 (Platzhalter) + Versand 8,52 + 2 × Desinfektion 1,80
    expect(r.summeLabor).toBe(527.67)
    expect(r.warnungen.some((w) => w.includes('Fremdlabor-Platzhalter (F-UKPS)'))).toBe(true)
    expect(r.hinweise.some((h) => h.includes('Kassenleistung'))).toBe(true)
    expect(r.hinweise.some((h) => h.includes('§ 10 Abs. 4'))).toBe(true)
    // andere Bemessung
    const e = { ...einst, ukpsAnalog: '7010' }
    const p2 = { ...p, positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps')!.pos, e) }
    const r2 = rechnen(p2, e)
    expect(r2.honorar.find((z) => z.nr === '7010a')!.anzahl).toBe(2)
    expect(r2.hinweise.some((h) => h.includes('2 × 7010a'))).toBe(false)
  })

  it('Umfang-Regler: mit dem Faktor kommen Begleitpositionen dazu, ohne Doppel, 8020/8035 schließen sich aus', () => {
    const basis = vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps-resmed')!.pos, einst)
    const nrs = (f: number, pos = basis) => umfangAnwenden(pos, f).filter((p) => p.umfang).map((p) => p.nr)
    expect(nrs(2.3)).toEqual([])
    expect(nrs(2.6)).toEqual(['8000'])
    expect(nrs(3.0)).toEqual(['8000', '8010', '8020'])
    expect(nrs(3.5)).toEqual(['8000', '8010', '8035', '8080'])
    // zurück auf 2,3 entfernt sie wieder
    expect(umfangAnwenden(umfangAnwenden(basis, 3.5), 2.3)).toEqual(basis)
    // von Hand gesetzte 8000 und kinematische Achse bleiben allein
    const mit = [...basis, { id: 'x', ebene: 'GOZ' as const, nr: '8000', anzahl: 1 }, { id: 'y', ebene: 'GOZ' as const, nr: '8030', anzahl: 1 }]
    expect(nrs(3.5, mit)).toEqual(['8010', '8080'])
    // leerer Plan bleibt leer
    expect(umfangAnwenden([], 3.5)).toEqual([])
    const p = { ...neuerPlan('T-1', einst), positionen: umfangAnwenden(basis, 3.5) }
    expect(rechnen(p, einst).hinweise.some((h) => h.startsWith('Begleitpositionen'))).toBe(true)
  })

  it('Labor-Preisstufen bis +80 %, Fremdlabor-Festpreise bleiben', () => {
    const pos = vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'michigan')!.pos, einst)
    const p = neuerPlan('T-1', einst)
    const labor = (k: number) => rechnen({ ...p, positionen: pos, regler: { ...p.regler, laborKlasse: k } }, einst).summeLabor
    expect(labor(4) / labor(1)).toBeCloseTo(1.8, 1)
    const resmed = vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps-resmed')!.pos, einst)
    expect(rechnen({ ...p, positionen: resmed, regler: { ...p.regler, laborKlasse: 4 } }, einst).summeLabor).toBeCloseTo(589.76, 2)
  })

  it('Alte Voreinstellung 5220 wird einmalig auf die BZÄK-Empfehlung 6070 umgestellt', () => {
    expect(einstMigrieren({ ukpsAnalog: '5220' }).ukpsAnalog).toBe('6070')
    expect(einstMigrieren({ ukpsAnalog: '7010' }).ukpsAnalog).toBe('7010')
    expect(einstMigrieren({ ukpsAnalog: '5220', ukpsStand: 'bzaek-2026-07' }).ukpsAnalog).toBe('5220')
  })

  it('Praxispreis für das Fremdlabor ersetzt den Platzhalter', () => {
    const e = { ...einst, laborPreise: { 'F-UKPS': 520 } }
    const p = { ...neuerPlan('T-1', e), positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps')!.pos, e) }
    const r = rechnen({ ...p, regler: { ...p.regler, laborKlasse: 2 } }, e)
    expect(r.labor.find((z) => z.nr === 'F-UKPS')!.einzel).toBe(624)
    expect(r.warnungen).toEqual([])
  })

  it('UKPS ResMed Narval: Laborsumme = ResMed-Rechnung netto, Preisstufe und Abformweg ändern nichts', () => {
    const p = { ...neuerPlan('T-1', einst), positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps-resmed')!.pos, einst) }
    const r = rechnen({ ...p, regler: { ...p.regler, laborKlasse: 2 } }, einst)
    expect(r.summeLabor).toBeCloseTo(589.76, 2)
    expect(r.mwst).toBe(41.28)
    expect(r.labor.find((z) => z.nr === '7607')!.einzel).toBe(389.68)
    expect(istUkps(p.positionen)).toBe(true)
    expect(abformungAnwenden(p.positionen, 'abdruck').filter((x) => x.ebene === 'LABOR')).toEqual(p.positionen.filter((x) => x.ebene === 'LABOR'))
    const mo = { ...p, positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps-resmed-mo')!.pos, einst) }
    expect(rechnen(mo, einst).summeLabor).toBeCloseTo(589.76 + 60.4, 2)
  })

  it('Intraoralscan: 0065 für beide Kiefer, gedruckte Modelle, Versand bei Datenlieferung', () => {
    const p = { ...neuerPlan('T-1', einst), positionen: vorlageAnwenden([], VORLAGEN.find((v) => v.id === 'ukps')!.pos, einst) }
    const scan = abformungAnwenden(p.positionen, 'scan')
    expect(scan.some((x) => x.nr === '0060' || x.nr === '0002' || x.nr === '0701')).toBe(false)
    expect(scan.find((x) => x.nr === '0065')!.anzahl).toBe(6)
    expect(scan.find((x) => x.nr === '0009')!.anzahl).toBe(2)
    expect(scan.find((x) => x.nr === '0036')!.anzahl).toBe(1)
    expect(scan.some((x) => x.analog && x.nr === '6070')).toBe(true)
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
    expect(plan.positionen.filter((x) => x.ebene === 'GOZ').length).toBe(5)
  })

  it('Vorlagen zählen gleiche Positionen zusammen', () => {
    const v = VORLAGEN.find((x) => x.id === 'kontrolle')!.pos
    const pos = vorlageAnwenden(vorlageAnwenden([], v), v)
    expect(pos.find((x) => x.nr === '7040')!.anzahl).toBe(4)
    expect(pos.length).toBe(2)
  })
})

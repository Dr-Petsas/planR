import { describe, expect, it } from 'vitest'
import { alterAm, einstufen, privatAusKatalog, rechnen, vorlageAnwenden } from './kfo'
import { stufe119, stufe120 } from '../data/katalog'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import { standardPraxis } from '../stammdaten'
import type { Einstellungen, Plan, Position } from '../types'

const einst = (patch: Partial<Einstellungen> = {}): Einstellungen => ({
  ...STANDARD_EINSTELLUNGEN,
  praxis: { ...standardPraxis(), plz: '80331', ort: 'München' },
  punktwertFest: { KFO: 1.2, KCH: 1.3 },
  ...patch,
})

const plan = (patch: Partial<Plan> = {}, angaben: Partial<Plan['angaben']> = {}): Plan => {
  const p = neuerPlan('KFO-2026-001', einst())
  return {
    ...p, datum: '2026-10-07',
    patient: { ...p.patient, geburtsdatum: '2014-03-01' },
    angaben: { ...p.angaben, kigGruppe: 'D', kigGrad: 4, ...angaben },
    ...patch,
  }
}

const B = (nr: string, anzahl = 1): Position => ({ id: `b-${nr}`, ebene: 'BEMA', nr, anzahl })

/** OK 18 Punkte (d), UK 10 Punkte (b), Bisslage 12 Punkte (c) */
const EINSTUFUNG: Plan['einstufung'] = {
  okAktiv: true, ok: [2, 2, 2, 1, 1],
  ukAktiv: true, uk: [1, 1, 0, 0, 1],
  bissAktiv: true, biss: [1, 2, 2, 1],
}

describe('Einstufung 119/120 nach BEMA-Raster', () => {
  it('Schwellen 119: 5–7 a, 8–10 b, 11–15 c, ab 16 d', () => {
    expect([5, 7, 8, 10, 11, 15, 16, 23].map(stufe119)).toEqual(['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'])
  })
  it('Schwellen 120: 4–8 a, 9–10 b, 11–12 c, ab 13 d', () => {
    expect([4, 8, 9, 10, 11, 12, 13, 21].map(stufe120)).toEqual(['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'])
  })
  it('Punkte je Kiefer und Bisslage', () => {
    const e = einstufen(plan({ einstufung: EINSTUFUNG }))
    expect(e.map((x) => [x.bereich, x.punkte, x.nr])).toEqual([['ok', 18, '119d'], ['uk', 10, '119b'], ['biss', 12, '120c']])
  })
  it('Lokalisation hat keine mittlere Stufe – unvollständig', () => {
    const e = einstufen(plan({ einstufung: { ...EINSTUFUNG, okAktiv: false, ukAktiv: false, biss: [1, 1, 2, 1] } }))
    expect(e[0].vollstaendig).toBe(false)
    expect(e[0].nr).toBe('')
  })
})

describe('Behandlungsaufgabe in Abschlägen', () => {
  it('Regelbehandlung: 12 Abschläge je 119/120', () => {
    const r = rechnen(plan({ einstufung: EINSTUFUNG }), einst())
    const auf = r.honorar.filter((z) => z.auto)
    expect(auf.map((z) => [z.nr, z.punkte, z.anzahl, z.einzel, z.summe])).toEqual([
      ['119d', 28, 12, 33.6, 403.2], ['119b', 17, 12, 20.4, 244.8], ['120c', 23, 12, 27.6, 331.2],
    ])
    expect(r.summeHonorar).toBe(979.2)
    expect(r.warnungen).toEqual([])
  })
  it('12 Abschläge ergeben genau die Bewertungszahl (119a 12 × 11 = 132)', () => {
    const r = rechnen(plan({ einstufung: { ...EINSTUFUNG, ok: [0, 0, 0, 0, 0], ukAktiv: false, bissAktiv: false } }), einst({ punktwertFest: { KFO: 1, KCH: 1 } }))
    expect(r.honorar[0].nr).toBe('119a')
    expect(r.honorar[0].summe).toBe(132)
  })
  it('Frühbehandlung: höchstens 6 Abschläge', () => {
    const r = rechnen(plan({ einstufung: { ...EINSTUFUNG, ukAktiv: false, bissAktiv: false } }, { behandlungsArt: 'frueh', kigGrad: 5, quartale: 6 }), einst())
    expect(r.abschlaege).toBe(6)
    expect(r.honorar[0].summe).toBe(201.6)
    expect(r.warnungen).toEqual([])
  })
  it('Frühbehandlung bei D4 und über 6 Quartale wird beanstandet', () => {
    const r = rechnen(plan({ einstufung: EINSTUFUNG }, { behandlungsArt: 'frueh', quartale: 8 }), einst())
    expect(r.warnungen.some((w) => w.includes('nicht bei D4'))).toBe(true)
    expect(r.warnungen.some((w) => w.includes('6 Kalenderquartalen'))).toBe(true)
  })
})

describe('Eigenanteil nach § 29 SGB V', () => {
  const positionen: Position[] = [B('5'), B('Ä935d'), B('01k'), { id: 'l1', ebene: 'BEL', nr: '7010', anzahl: 1 }]
  const p = plan({ einstufung: { ...EINSTUFUNG, ukAktiv: false, bissAktiv: false }, positionen })

  it('20 % auf KFO-Honorar, Labor und Material – nicht auf Röntgen und 01k', () => {
    const r = rechnen(p, einst())
    expect(r.honorar.find((z) => z.nr === 'Ä935d')?.summe).toBe(46.8)
    expect(r.honorar.find((z) => z.nr === '01k')?.summe).toBe(36.4)
    expect(r.summeLabor).toBe(77.78)
    expect(r.gesamt).toBe(678.18)
    expect(r.eigenanteilBasis).toBe(594.98)
    expect(r.eigenanteil).toBe(119)
    expect(r.kassenanteil).toBe(559.18)
  })
  it('10 % ab dem zweiten Kind', () => {
    const r = rechnen({ ...p, angaben: { ...p.angaben, geschwister: true } }, einst())
    expect(r.eigenanteilSatz).toBe(10)
    expect(r.eigenanteil).toBe(59.5)
  })
  it('Röntgen mit dem KFO-Punktwert, wenn die KZV es so vorgibt', () => {
    const r = rechnen(p, einst({ roentgenKfo: true }))
    expect(r.honorar.find((z) => z.nr === 'Ä935d')?.summe).toBe(43.2)
  })
  it('KIG unter Grad 3: keine Kassenleistung, kein Eigenanteil', () => {
    const r = rechnen({ ...p, angaben: { ...p.angaben, kigGrad: 2 } }, einst())
    expect(r.kassenleistung).toBe(false)
    expect(r.eigenanteil).toBe(0)
    expect(r.warnungen.some((w) => w.includes('Vordruck 4b'))).toBe(true)
  })
})

describe('Altersgrenze und Indikation', () => {
  it('ab 18 nur kombiniert kieferchirurgisch', () => {
    expect(alterAm('2008-10-07', '2026-10-07')).toBe(18)
    expect(alterAm('2008-10-08', '2026-10-07')).toBe(17)
    const erw = plan({ einstufung: EINSTUFUNG, patient: { ...plan().patient, geburtsdatum: '2000-01-01' } })
    expect(rechnen(erw, einst()).warnungen.some((w) => w.includes('18. Lebensjahr'))).toBe(true)
    const kombi = { ...erw, angaben: { ...erw.angaben, behandlungsArt: 'kombi' as const } }
    expect(rechnen(kombi, einst()).warnungen).toEqual([])
    const e4 = { ...kombi, angaben: { ...kombi.angaben, kigGruppe: 'E' as const } }
    expect(rechnen(e4, einst()).warnungen.some((w) => w.includes('mindestens A5, D4'))).toBe(true)
  })
})

describe('Abrechnungsbestimmungen', () => {
  it('121–124 nicht neben 119/120', () => {
    const r = rechnen(plan({ einstufung: EINSTUFUNG, positionen: [B('122a')] }), einst())
    expect(r.warnungen.some((w) => w.includes('122a ist neben 119/120'))).toBe(true)
  })
  it('Höchstzahlen 116 und 7a', () => {
    const r = rechnen(plan({ einstufung: EINSTUFUNG, positionen: [B('116', 5), B('7a', 4), B('117', 4)] }), einst())
    expect(r.warnungen.some((w) => w.startsWith('116:'))).toBe(true)
    expect(r.warnungen.some((w) => w.startsWith('7a:'))).toBe(true)
    const kombi = rechnen(plan({ einstufung: EINSTUFUNG, positionen: [B('7a', 4), B('117', 4)] }, { behandlungsArt: 'kombi' }), einst())
    expect(kombi.warnungen.some((w) => w.startsWith('7a:') || w.startsWith('117:'))).toBe(false)
  })
  it('BEMA 5 nicht bei Therapieänderung', () => {
    const r = rechnen(plan({ einstufung: EINSTUFUNG, positionen: [B('5')] }, { planArt: 'aenderung', bezugsantrag: 'A-1' }), einst())
    expect(r.warnungen.some((w) => w.includes('BEMA 5'))).toBe(true)
  })
})

describe('Mehr- und Zusatzleistungen (Vordruck 4d)', () => {
  it('Keramikbrackets: GOZ 6100 abzüglich BEMA 126a, Material getrennt', () => {
    const e = einst({ gozFaktor: 3, materialPreise: { keramik: 5 } })
    const keramik = privatAusKatalog('keramik', 10, e)
    const r = rechnen(plan({ einstufung: EINSTUFUNG, positionen: [B('126a', 10), keramik] }), e)
    const z = r.privat[0]
    expect([z.betrag, z.bema, z.anteil, z.material]).toEqual([278.4, 216, 62.4, 50])
    expect(r.privatGesamt).toBe(112.4)
    expect(r.warnungen).toEqual([])
  })
  it('Mehrkosten nie negativ; fehlende Vergleichsleistung im Kassenplan wird gemeldet', () => {
    const keramik = privatAusKatalog('keramik', 10, einst())
    const r = rechnen(plan({ einstufung: EINSTUFUNG, positionen: [keramik] }), einst())
    expect(r.privat[0].betrag).toBe(213.4)
    expect(r.privat[0].anteil).toBe(0)
    expect(r.warnungen.some((w) => w.includes('Vergleichsleistung 126a'))).toBe(true)
  })
  it('Intraoralscan: 4 × GOZ 0065 statt einmal 7a', () => {
    const scan = privatAusKatalog('digital', 4, einst())
    expect(scan.vergleichAnzahl).toBe(1)
    const r = rechnen(plan({ einstufung: EINSTUFUNG, positionen: [B('7a'), scan] }), einst())
    expect([r.privat[0].betrag, r.privat[0].bema, r.privat[0].anteil]).toEqual([41.4, 22.8, 18.6])
  })
  it('Zusatzleistung ohne GOZ-Nummer braucht einen Preis', () => {
    const r = rechnen(plan({ einstufung: EINSTUFUNG, positionen: [privatAusKatalog('retainer-ok', 1, einst())] }), einst())
    expect(r.privat[0].art).toBe('Z')
    expect(r.warnungen.some((w) => w.includes('ohne Preis'))).toBe(true)
  })
  it('Vorlage legt Privatposition an und zählt bei Wiederholung zusammen', () => {
    const v = [{ ebene: 'PRIVAT' as const, nr: 'versiegelung', anzahl: 20, mehr: 'versiegelung' }]
    const pos = vorlageAnwenden(vorlageAnwenden([], v, einst()), v, einst())
    expect(pos).toHaveLength(1)
    expect(pos[0]).toMatchObject({ ebene: 'PRIVAT', art: 'A', nr: '2000', anzahl: 40 })
  })
})

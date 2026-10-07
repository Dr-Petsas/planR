import { describe, expect, it } from 'vitest'
import { csvParsen, ermittlePunktwert } from '../data/punktwerte'
import { STANDARD_EINSTELLUNGEN, leererBefund, neuerFall, zweiMessstellen } from '../store'
import type { Befund, DiagnoseErgebnis, ParFall } from '../types'
import { diagnostizieren } from './diagnose'
import {
  infiltrationen, leitungen, menge, preiseAus, reglerGesamt, reglerTermin, roentgenWahl, terminRechnen,
} from './leistungen'
import { pruefeBefund } from './pruefung'
import { aitZaehne, leistungsblock, subgingivalZaehne } from './strecke'
import { fristenPruefen, plusMonate, terminePlanen, uptSchema, werktag } from './termine'
import { segmente } from './zahnform'

const diagGrad = (grad: 'A' | 'B' | 'C'): DiagnoseErgebnis => ({
  stadium: 3, stadiumText: '', ausmass: 'generalisiert', grad, gradBasis: '', kaIndex: 0.5,
  befalleneZaehne: 10, gesamtZaehne: 28, anteilProzent: 36, hinweise: [],
})

/** Befund mit ST-Werten an den genannten Zaehnen (alle Stellen gleich). */
function befundMit(werte: Record<string, number>, bop = false): Befund {
  const b = leererBefund('initial', 'Initialbefund', '2026-01-05')
  for (const z of Object.keys(b.zaehne)) b.zaehne[z].st = [3, 3]
  for (const [z, w] of Object.entries(werte)) {
    b.zaehne[z].st = [w, w]
    b.zaehne[z].bop = [bop, false]
  }
  return b
}

function fallMit(b: Befund, grad: 'A' | 'B' | 'C' = 'B'): ParFall {
  const f = neuerFall(1)
  f.befunde = [b]
  f.planung = { ...f.planung, start: '2026-01-05' }
  f.termine = terminePlanen(f, diagGrad(grad))
  return f
}

describe('UPT-Schema nach BEMA', () => {
  it('Grad A: 2 UPT, UPT g in der zweiten, kein UPT d', () => {
    const s = uptSchema('A')
    expect(s.map((z) => z.monat)).toEqual([0, 10])
    expect(s[1].module).toContain('g')
    expect(s.some((z) => z.module.includes('d'))).toBe(false)
  })
  it('Grad B: 4 UPT, d in 2 und 4, g in 3', () => {
    const s = uptSchema('B')
    expect(s.map((z) => z.monat)).toEqual([0, 5, 10, 15])
    expect(s.filter((z) => z.module.includes('d')).map((z) => z.nr)).toEqual([2, 4])
    expect(s.filter((z) => z.module.includes('g')).map((z) => z.nr)).toEqual([3])
  })
  it('Grad C: 6 UPT, d viermal, g einmal ab Monat 10', () => {
    const s = uptSchema('C')
    expect(s).toHaveLength(6)
    expect(s.filter((z) => z.module.includes('d')).map((z) => z.nr)).toEqual([2, 3, 4, 6])
    expect(s.filter((z) => z.module.includes('g')).map((z) => z.monat)).toEqual([12])
  })
  it('Verlängerung 6 Monate: weitere UPT ab Monat 24', () => {
    const s = uptSchema('B', 6).filter((z) => z.verlaengerung)
    expect(s.map((z) => z.monat)).toEqual([24, 29])
  })
})

describe('Terminplan und Fristen', () => {
  const b = befundMit({ '16': 5, '11': 4, '36': 6, '46': 5 })
  it('BEV a drei Monate nach der letzten AIT, UPT im Gradabstand', () => {
    const f = fallMit(b, 'B')
    const ait = f.termine.filter((t) => t.art === 'ait')
    const bev = f.termine.find((t) => t.art === 'bev')!
    expect(ait).toHaveLength(2)
    expect(bev.datum >= plusMonate(ait[1].datum, 3)).toBe(true)
    const upt = f.termine.filter((t) => t.art === 'upt')
    expect(upt).toHaveLength(4)
    expect(upt[1].datum >= plusMonate(upt[0].datum, 5)).toBe(true)
    expect(fristenPruefen(f, diagGrad('B')).filter((m) => m.art === 'fehler')).toEqual([])
  })
  it('zu frühe UPT g und zu frühe BEV werden als Fehler gemeldet', () => {
    const f = fallMit(b, 'B')
    const upt3 = f.termine.find((t) => t.schluessel === 'upt-3')!
    const upt1 = f.termine.find((t) => t.schluessel === 'upt-1')!
    upt3.datum = plusMonate(upt1.datum, 8)
    const bev = f.termine.find((t) => t.art === 'bev')!
    const ait2 = f.termine.find((t) => t.schluessel === 'ait-2')!
    bev.datum = plusMonate(ait2.datum, 2)
    const fehler = fristenPruefen(f, diagGrad('B')).filter((m) => m.art === 'fehler').map((m) => m.text)
    expect(fehler.some((t) => t.includes('UPT g frühestens 10 Monate'))).toBe(true)
    expect(fehler.some((t) => t.includes('BEV a frühestens'))).toBe(true)
  })
  it('verschobener Termin bleibt, Folgetermine rechnen ab dort', () => {
    const f = fallMit(b, 'C')
    const i = f.termine.findIndex((t) => t.schluessel === 'upt-2')
    f.termine[i] = { ...f.termine[i], datum: '2027-12-01', datumManuell: true }
    const neu = terminePlanen(f, diagGrad('C'))
    expect(neu.find((t) => t.schluessel === 'upt-2')!.datum).toBe('2027-12-01')
    expect(neu.find((t) => t.schluessel === 'upt-3')!.datum >= '2028-03-01').toBe(true)
  })
  it('Werktage: Samstag wird bei 5-Tage-Woche zum Montag', () => {
    expect(werktag('2026-10-10', 5)).toBe('2026-10-12')
    expect(werktag('2026-10-10', 6)).toBe('2026-10-10')
  })
})

describe('Befund-Auswertung', () => {
  it('AIT a/b nach Wurzelzahl, 14/24 mehrwurzelig, Implantate zählen nicht', () => {
    const b = befundMit({ '11': 5, '14': 4, '16': 6, '36': 4, '45': 4, '26': 5 })
    b.zaehne['26'].zs = 6
    const a = aitZaehne(b)
    expect(a.ein.sort()).toEqual(['11', '45'])
    expect(a.mehr.sort()).toEqual(['14', '16', '36'])
  })
  it('UPT e/f: ST ≥ 4 mm mit BOP oder ≥ 5 mm', () => {
    const b = befundMit({ '11': 4, '21': 5 })
    expect(subgingivalZaehne(b).ein).toEqual(['21'])
    b.zaehne['11'].bop[0] = true
    expect(subgingivalZaehne(b).ein.sort()).toEqual(['11', '21'])
  })
  it('Leistungsblock 2.1.0 zählt 4, ATG, MHU, AIT a/b, BEV a', () => {
    const f = fallMit(befundMit({ '11': 5, '16': 5 }))
    expect(leistungsblock(f)).toEqual({ '4': 1, ATG: 1, MHU: 1, AITa: 1, AITb: 1, BEVa: 1 })
  })
})

describe('Begleitleistungen', () => {
  it('Röntgen nach Zahl der betroffenen Zähne', () => {
    expect(roentgenWahl([])).toBeNull()
    expect(roentgenWahl(['11', '12'])).toBe('Ä925a')
    expect(roentgenWahl(['11', '12', '13'])).toBe('Ä925b')
    expect(roentgenWahl(['11', '12', '13', '14', '15', '16'])).toBe('Ä925c')
    const zehn = ['11', '12', '13', '14', '15', '16', '17', '21', '22', '23']
    expect(roentgenWahl(zehn)).toBe('Ä925d')
    expect(roentgenWahl([...zehn, '31', '32', '33', '34', '35', '36'])).toBe('Ä935d')
  })
  it('Infiltration: jeder zweite OK-Zahn je zusammenhängender Gruppe', () => {
    expect(infiltrationen(['16', '15', '14'])).toBe(2)
    expect(infiltrationen(['16', '14'])).toBe(2)
    expect(infiltrationen(['11', '21'])).toBe(1)
    expect(infiltrationen(['36', '46'])).toBe(0)
  })
  it('Leitung: eine je Unterkieferseite', () => {
    expect(leitungen(['36', '37', '46'])).toBe(2)
    expect(leitungen(['36', '11'])).toBe(1)
  })
  it('Anteil-Regel rundet auf und gibt mindestens 1', () => {
    expect(menge({ anteil: 0.3 }, { alle: [], behandelt: ['11', '12', '13', '14'], roentgen: [] })).toBe(2)
  })
})

describe('Regler', () => {
  const b = befundMit({ '16': 5, '15': 5, '11': 5, '36': 5, '46': 5 })
  const f = fallMit(b, 'B')
  const preise = preiseAus(STANDARD_EINSTELLUNGEN, 1.2)
  const ait = f.termine.find((t) => t.schluessel === 'ait-1')!

  it('AIT: Kern + Anästhesie sind die Grundauswahl, OK-Sitzung nur OK-Zähne', () => {
    const r = terminRechnen(f, ait, preise)
    expect(r.ctx.behandelt).toEqual(['16', '15', '11'])
    const nrs = r.positionen.map((p) => p.nr)
    expect(nrs).toEqual(expect.arrayContaining(['AIT a', 'AIT b', '40']))
    expect(nrs).not.toContain('41a')
    expect(r.basis).toBeCloseTo(r.summe, 2)
  })
  it('Termin-Regler schaltet bis zum Ziel zu, Begleit vor Zusatz', () => {
    const r0 = terminRechnen(f, ait, preise)
    const t = reglerTermin(f, ait, preise, r0.basis + 1)
    expect(t.auto).toHaveLength(1)
    expect(t.auto[0]).toBe('einschleifen')
    const voll = reglerTermin(f, ait, preise, r0.potential)
    const r = terminRechnen(f, voll, preise)
    expect(r.summe).toBeCloseTo(r0.potential, 2)
  })
  it('Von Hand abgewählte Kacheln nimmt der Regler nicht', () => {
    const t = reglerTermin(f, { ...ait, abgewaehlt: ['einschleifen'] }, preise, 10000)
    expect(t.auto).not.toContain('einschleifen')
  })
  it('Gesamt-Regler verteilt reihum und lässt erbrachte Termine stehen', () => {
    const g = { ...f, termine: f.termine.map((t) => (t.schluessel === 'befund' ? { ...t, erbracht: true } : t)) }
    const basis = g.termine.reduce((s, t) => s + terminRechnen(g, t, preise).summe, 0)
    const neu = reglerGesamt(g, preise, basis + 50)
    expect(neu.find((t) => t.schluessel === 'befund')!.auto).toEqual([])
    const mitAuto = neu.filter((t) => t.auto.length > 0)
    expect(mitAuto.length).toBeGreaterThan(1)
    const summe = neu.reduce((s, t) => s + terminRechnen({ ...g, termine: neu }, t, preise).summe, 0)
    expect(summe).toBeGreaterThanOrEqual(basis + 50)
  })
  it('Modus BEMA bietet keine privaten Kacheln an', () => {
    const r = terminRechnen({ ...f, modus: 'bema' }, ait, preise)
    expect(r.kacheln.every((k) => k.kachel.stufe !== 'zusatz')).toBe(true)
  })
  it('01 und Ä1 schließen sich aus, auch beim Regler', () => {
    const upt = f.termine.find((t) => t.schluessel === 'upt-1')!
    const r = terminRechnen(f, { ...upt, auswahl: ['u01'] }, preise)
    expect(r.kacheln.find((k) => k.kachel.id === 'ae1')!.konflikt).not.toBeNull()
    const voll = terminRechnen(f, reglerTermin(f, upt, preise, 100000), preise)
    const nrs = voll.positionen.map((p) => p.nr)
    expect(nrs.includes('01') && nrs.includes('Ä1')).toBe(false)
  })
  it('UPT: Röntgen ist Standard nur mit UPT g, von Hand wählbar', () => {
    const upt1 = f.termine.find((t) => t.schluessel === 'upt-1')!
    const upt3 = f.termine.find((t) => t.schluessel === 'upt-3')!
    expect(upt3.module).toContain('g')
    const nrs = (t: typeof upt1) => terminRechnen(f, t, preise).positionen.map((p) => p.nr)
    expect(nrs(upt1).some((n) => n.startsWith('Ä9'))).toBe(false)
    expect(nrs(upt3).some((n) => n.startsWith('Ä9'))).toBe(true)
    expect(nrs({ ...upt3, roentgen: 'Ä925a' })).toContain('Ä925a')
  })
})

describe('UPT-Startdatum', () => {
  it('erste UPT am gewählten Start, Folge-UPT im Gradabstand', () => {
    const f = fallMit(befundMit({ '16': 5, '11': 5 }), 'B')
    f.planung = { ...f.planung, uptStart: '2027-09-01' }
    const upt = terminePlanen(f, diagGrad('B')).filter((t) => t.art === 'upt')
    expect(upt[0].datum).toBe('2027-09-01')
    expect(upt[1].datum >= plusMonate('2027-09-01', 5)).toBe(true)
  })
})

describe('Diagnose-Grenzen (Blatt 1)', () => {
  const basis = neuerFall(1).diagnose
  const b = befundMit({})
  it('Stadium nach KA % und CAL', () => {
    expect(diagnostizieren({ ...basis, knochenabbauProzent: 14 }, b).stadium).toBe(1)
    expect(diagnostizieren({ ...basis, knochenabbauProzent: 15 }, b).stadium).toBe(2)
    expect(diagnostizieren({ ...basis, knochenabbauProzent: 33 }, b).stadium).toBe(2)
    expect(diagnostizieren({ ...basis, knochenabbauProzent: 34 }, b).stadium).toBe(3)
    expect(diagnostizieren({ ...basis, calMax: 5 }, b).stadium).toBe(3)
    expect(diagnostizieren({ ...basis, calMax: 3, zahnverlustPar: 5 }, b).stadium).toBe(4)
  })
  it('Grad nach KA/Alter mit Rauch- und Diabetes-Modifikator', () => {
    expect(diagnostizieren({ ...basis, knochenabbauProzent: 10, alter: 50 }, b).grad).toBe('A')
    expect(diagnostizieren({ ...basis, knochenabbauProzent: 25, alter: 50 }, b).grad).toBe('B')
    expect(diagnostizieren({ ...basis, knochenabbauProzent: 60, alter: 50 }, b).grad).toBe('C')
    expect(diagnostizieren({ ...basis, knochenabbauProzent: 10, alter: 50, raucher: 'ab10' }, b).grad).toBe('C')
    expect(diagnostizieren({ ...basis, knochenabbauProzent: 10, alter: 50, diabetes: 'hba1c_unter7' }, b).grad).toBe('B')
  })
  it('Von Hand gesetzte Kreuze gehen vor und werden als Hinweis gemeldet', () => {
    const r = diagnostizieren({ ...basis, calMax: 5, stadiumManuell: 2, gradManuell: 'C', ausmassManuell: 'generalisiert' }, b)
    expect(r.stadium).toBe(2)
    expect(r.grad).toBe('C')
    expect(r.ausmass).toBe('generalisiert')
    expect(r.hinweise.some((h) => h.includes('Stadium von Hand'))).toBe(true)
    expect(diagnostizieren({ ...basis, kaIndexManuell: 'B' }, b).grad).toBe('B')
  })
  it('Ausmaß ab 30 % betroffener Zähne generalisiert', () => {
    const viele = befundMit({ '11': 4, '12': 4, '13': 4, '14': 4, '15': 4, '16': 4, '17': 4, '18': 4, '21': 4, '22': 4 })
    expect(diagnostizieren(basis, viele).ausmass).toBe('generalisiert')
    expect(diagnostizieren(basis, befundMit({ '11': 4 })).ausmass).toBe('lokalisiert')
  })
})

describe('Prüfregeln Blatt 2', () => {
  it('Messwerte an fehlendem Zahn, FB ohne FB-Kästchen, AIT ohne 4 mm', () => {
    const b = befundMit({})
    b.zaehne['18'].zs = 1
    b.zaehne['15'].fb = 2
    b.zaehne['11'].aitOverride = true
    const t = pruefeBefund(b).map((m) => m.text).join(' | ')
    expect(t).toContain('Zahn 18 ist fehlend')
    expect(t).toContain('Zahn 15: Furkationsbefall')
    expect(t).toContain('Zahn 11: AIT markiert')
  })
  it('Weniger als zwei Messstellen', () => {
    const b = befundMit({})
    b.zaehne['11'].st = [3, null]
    expect(pruefeBefund(b).some((m) => m.text.includes('weniger als 2 Messstellen'))).toBe(true)
  })
})

describe('Segment-Zuordnung', () => {
  it('zwei Messhälften; mesial zeigt zur Mitte des Kiefers', () => {
    expect(segmente(16)).toHaveLength(2)
    expect(segmente(16).map((s) => s.region)).toEqual(['R', 'L'])
    expect(segmente(26).map((s) => s.region)).toEqual(['L', 'R'])
    expect(segmente(36).map((s) => s.region)).toEqual(['L', 'R'])
    expect(segmente(46).map((s) => s.region)).toEqual(['R', 'L'])
    expect(segmente(11)[0].label).toBe('mesial')
  })
  it('alte 6-Punkt-Befunde werden auf mesial/distal zusammengelegt', () => {
    const z = { ...leererBefund('initial', 'x').zaehne['16'] }
    const neu = zweiMessstellen({ ...z, st: [3, 2, 4, 5, 2, 3], bop: [false, false, true, false, false, false] })
    expect(neu.st).toEqual([5, 4])
    expect(neu.bop).toEqual([false, true])
    const mitte = zweiMessstellen({ ...z, st: [3, 6, 4, null, null, null], bop: [false, true, false, false, false, false] })
    expect(mitte.st).toEqual([6, 4])
    expect(mitte.bop).toEqual([true, false])
  })
})

describe('Punktwert', () => {
  const patient = neuerFall(1).patient
  it('Override vor Richtwert, Ersatzkasse nach Regionalkennzeichen', () => {
    const e = { ...STANDARD_EINSTELLUNGEN, kzvNr: '13' }
    expect(ermittlePunktwert(e, patient, '').quelle).toBe('richtwert')
    expect(ermittlePunktwert({ ...e, bemaPunktwertOverride: 1.3 }, patient, '').wert).toBe(1.3)
    const ek = ermittlePunktwert(e, { ...patient, kassenart: 'ersatz', kassennummer: '3712345' }, '')
    expect(ek.kzvNr).toBe('37')
  })
  it('CSV-Import mit Dezimalkomma und Kopfzeile', () => {
    const t = csvParsen('KZV;Primaer;Ersatz\n13;1,2000;1,2500\nxx;1;1')
    expect(t['13']).toEqual({ primaer: 1.2, ersatz: 1.25 })
    expect(Object.keys(t)).toEqual(['13'])
  })
})

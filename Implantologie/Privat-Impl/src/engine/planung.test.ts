import { describe, expect, it } from 'vitest'
import type { Einstellungen, Plan, Region, RegionOptionen, Zahn } from '../types'
import { STANDARD_EINSTELLUNGEN, STANDARD_GLOBAL, STANDARD_REGLER, neuerPlan } from '../store'
import { kalkulieren } from './berechnung'
import { analogWaehlen } from './analog'
import { goaeRahmen } from './listen'
import { analogFinden } from '../data/analog-katalog'

const E: Einstellungen = { ...STANDARD_EINSTELLUNGEN }

function plan(opt: {
  zaehne?: Record<string, Zahn>
  implantate?: Plan['implantate']
  regionen?: Partial<Record<Region, RegionOptionen>>
  global?: Partial<Plan['global']>
  regler?: Partial<Plan['regler']>
}): Plan {
  const p = neuerPlan(1)
  return {
    ...p,
    zaehne: opt.zaehne ?? {},
    implantate: opt.implantate ?? {},
    regionen: opt.regionen ?? {},
    global: { ...STANDARD_GLOBAL, ...(opt.global ?? {}) },
    regler: { ...STANDARD_REGLER, ...(opt.regler ?? {}) },
  }
}

const gozNrs = (p: Plan, e = E) => kalkulieren(p, e).honorarGoz.map((z) => z.nr)
const goaeNrs = (p: Plan, e = E) => kalkulieren(p, e).honorarGoae.map((z) => z.nr)

describe('Implantat-Grundfall', () => {
  it('Einzelimplantat 36 mit DVT, Navigationsschablone und Freilegung', () => {
    const p = plan({
      zaehne: { '36': { B: 'f', TP: 'I' } },
      implantate: { '36': { system: 'durchschnitt', durchmesser: 4.1, laenge: 10, zeitpunkt: 'verzoegert', deckung: 'gedeckt', abutment: 'standard' } },
      global: { bildgebung: 'dvt' },
      regler: { schabloneStufe: 3 },
    })
    expect(gozNrs(p)).toEqual(expect.arrayContaining(['9000', '9010', '9040', '9005']))
    expect(goaeNrs(p)).toEqual(expect.arrayContaining(['5370', '5377']))
  })
})

describe('Sinuslift und Augmentation', () => {
  it('externer Sinuslift + 9100 nur zu einem Drittel', () => {
    const p = plan({
      zaehne: { '26': { B: 'f', TP: 'I' } },
      regionen: { 'OK-L': { sinusExtern: true, augmentation: true, material: 'xenogen' } },
    })
    const k = kalkulieren(p, E)
    expect(k.honorarGoz.map((z) => z.nr)).toEqual(expect.arrayContaining(['9120', '9100']))
    const p9100 = k.honorarGoz.find((z) => z.nr === '9100')!
    expect(p9100.gebuehrenanteil).toBeCloseTo(1 / 3, 5)
  })

  it('zwei interne Sinuslifte + 9100 nur zur Hälfte', () => {
    const p = plan({
      zaehne: { '16': { B: 'f', TP: 'I' }, '26': { B: 'f', TP: 'I' } },
      regionen: { 'OK-R': { sinusIntern: true, augmentation: true }, 'OK-L': { sinusIntern: true } },
    })
    const k = kalkulieren(p, E)
    expect(k.honorarGoz.filter((z) => z.nr === '9110')).toHaveLength(2)
    expect(k.honorarGoz.find((z) => z.nr === '9100')!.gebuehrenanteil).toBeCloseTo(0.5, 5)
  })
})

describe('Knochenblock', () => {
  it('autologer Block: 9140 doppelt, 9150, zweizeitig mit 9170', () => {
    const p = plan({
      zaehne: { '46': { B: 'f', TP: 'I' } },
      regionen: { 'UK-R': { augmentation: true, blockEntnahme: true, fixierung: true, material: 'autolog' } },
    })
    const k = kalkulieren(p, E)
    const p9140 = k.honorarGoz.find((z) => z.nr === '9140')!
    expect(p9140.anzahl).toBe(2)
    expect(k.honorarGoz.map((z) => z.nr)).toEqual(expect.arrayContaining(['9150', '9170', '9100']))
  })

  it('allogener Block: keine 9140, dafür Hinweis', () => {
    const p = plan({
      zaehne: { '46': { B: 'f', TP: 'I' } },
      regionen: { 'UK-R': { augmentation: true, blockEntnahme: true, material: 'allogen' } },
    })
    const k = kalkulieren(p, E)
    expect(k.honorarGoz.map((z) => z.nr)).not.toContain('9140')
    expect(k.hinweise.some((h) => /9140/.test(h))).toBe(true)
  })
})

describe('Bone Splitting', () => {
  it('9130 ohne 9100/9150/4138', () => {
    const p = plan({
      zaehne: { '45': { B: 'f', TP: 'I' } },
      regionen: { 'UK-R': { boneSplitting: true, membran: 'resorbierbar' } },
    })
    const nrs = gozNrs(p)
    expect(nrs).toContain('9130')
    expect(nrs).not.toContain('9100')
    expect(nrs).not.toContain('9150')
    expect(nrs).not.toContain('4138')
  })
})

describe('Sofortimplantat / Socket', () => {
  it('Socket Shield: Implantat ohne Extraktionsziffer', () => {
    const p = plan({ zaehne: { '11': { B: 'x', TP: 'ISS' } }, regler: { analogStufe: 5 } })
    const nrs = gozNrs(p)
    expect(nrs).toContain('9010')
    expect(nrs).not.toContain('3000')
  })

  it('Socket Preservation autolog mit Kollektor (9090)', () => {
    const p = plan({ zaehne: { '11': { B: 'x', TP: 'XS' } }, regionen: { 'OK-F': { material: 'autolog', kollektor: true } } })
    expect(gozNrs(p)).toContain('9090')
  })

  it('Socket Preservation mit KEM: Analog GOÄ 2442 (Material einkalkuliert)', () => {
    const p = plan({ zaehne: { '11': { B: 'x', TP: 'XS' } }, regionen: { 'OK-F': { material: 'xenogen' } }, regler: { analogStufe: 5 } })
    const k = kalkulieren(p, E)
    expect(k.honorarGoae.some((z) => z.analog && z.nr === '2442')).toBe(true)
  })
})

describe('Eigenblut', () => {
  it('PRF: GOÄ 250 einmal pro Sitzung, Röhrchen als Material', () => {
    const p = plan({
      zaehne: { '36': { B: 'f', TP: 'I' } },
      implantate: { '36': { system: 'durchschnitt', durchmesser: 4.1, laenge: 10, zeitpunkt: 'verzoegert', deckung: 'gedeckt', abutment: 'standard' } },
      regionen: { 'UK-L': { augmentation: true, eigenblut: true } },
      global: { blut: 'prf' },
      regler: { analogStufe: 4 },
    })
    const k = kalkulieren(p, E)
    // OP-Sitzungen: Implantation (mit 9100) + Freilegung
    expect(k.honorarGoae.filter((z) => z.nr === '250')).toHaveLength(2)
    expect(k.material.some((z) => z.nr.startsWith('roehrchen'))).toBe(true)
  })
})

describe('OP-Zuschlag', () => {
  it('nur der höchste je Sitzung', () => {
    const p = plan({
      zaehne: { '36': { B: 'f', TP: 'I' } },
      regionen: { 'UK-L': { augmentation: true } },
    })
    const k = kalkulieren(p, E)
    const zuschlaege = k.honorarGoz.filter((z) => ['0500', '0510', '0520', '0530'].includes(z.nr) && z.sitzung === 3)
    expect(zuschlaege).toHaveLength(1)
    expect(zuschlaege[0].nr).toBe('0530') // höchste Leistung 9100
  })
})

describe('Mikroskop und Laser (0110/0120)', () => {
  it('ohne zuschlagsfähige Leistung kein 0120', () => {
    const p = plan({ zaehne: { '36': { B: 'f', TP: 'I' } }, regler: { begleitStufe: 4 } })
    expect(gozNrs(p)).not.toContain('0120')
  })

  it('bei 4133 (Bindegewebe) wird 0120 angesetzt', () => {
    const p = plan({
      zaehne: { '36': { B: 'f', TP: 'I' } },
      regionen: { 'UK-L': { weichgewebe: 'btt' } },
      regler: { begleitStufe: 4 },
    })
    expect(gozNrs(p)).toContain('0120')
  })
})

describe('Analogbewertung', () => {
  it('Stufe 0 < Stufe 1, Stufe 2 deckt die Praxiskalkulation', () => {
    const l = analogFinden('rfa-isq')!
    const basis = { gozFaktor: 2.3, goaeFaktor: 2.3, stundensatz: 450, materialBetrag: 0, materialEinkalkulieren: true }
    const s0 = analogWaehlen(l, { ...basis, bewertung: 0 })
    const s1 = analogWaehlen(l, { ...basis, bewertung: 1 })
    const s2 = analogWaehlen(l, { ...basis, bewertung: 2 })
    expect(s0.euro).toBeLessThan(s1.euro)
    const ziel = l.minuten / 60 * 450
    expect(s2.euro).toBeGreaterThanOrEqual(ziel - 0.01)
  })
})

describe('GOÄ-Faktorgrenzen', () => {
  it('Röntgen höchstens 2,5, Zuschlag 5377 fest 1,0', () => {
    expect(goaeRahmen('5000').max).toBe(2.5)
    expect(goaeRahmen('5377').max).toBe(1)
    const p = plan({ zaehne: { '36': { B: 'f', TP: 'I' } }, global: { bildgebung: 'dvt' } })
    const k = kalkulieren(p, { ...E, goaeFaktor: 3.5 })
    const dvt3d = k.honorarGoae.find((z) => z.nr === '5377')!
    expect(dvt3d.faktor).toBe(1)
    const kontrolle = k.honorarGoae.find((z) => z.nr === '5000')!
    expect(kontrolle.faktor).toBeLessThanOrEqual(2.5)
  })
})

describe('Vereinbarung über 3,5', () => {
  const basis = plan({
    zaehne: { '36': { B: 'f', TP: 'I' } },
    implantate: { '36': { system: 'durchschnitt', durchmesser: 4.1, laenge: 10, zeitpunkt: 'verzoegert', deckung: 'gedeckt', abutment: 'standard' } },
  })
  it('ohne Erlaubnis wird auf 3,5 begrenzt', () => {
    const p = { ...basis, anpassungen: { 'auto:9010:36:3': { faktor: 4.5 } } }
    const z = kalkulieren(p, { ...E, erlaubeUeber35: false }).honorarGoz.find((x) => x.nr === '9010')!
    expect(z.faktor).toBeLessThanOrEqual(3.5)
  })
  it('mit Erlaubnis bleibt 4,5 erhalten und erzeugt § 2-Hinweis', () => {
    const p = { ...basis, anpassungen: { 'auto:9010:36:3': { faktor: 4.5 } } }
    const k = kalkulieren(p, { ...E, erlaubeUeber35: true })
    const z = k.honorarGoz.find((x) => x.nr === '9010')!
    expect(z.faktor).toBeCloseTo(4.5, 5)
    expect(k.hinweise.some((h) => /§ 2/.test(h))).toBe(true)
  })
})

describe('Abwählen', () => {
  it('abgewählte Position bleibt entfernt', () => {
    const p = plan({ zaehne: { '36': { B: 'f', TP: 'I' } } })
    expect(gozNrs(p)).toContain('9010')
    const p2 = { ...p, regler: { ...p.regler, aus: ['GOZ|9010|36'] } }
    expect(gozNrs(p2)).not.toContain('9010')
  })
})

describe('9150 ohne 9100', () => {
  it('wird entfernt und als Hinweis gemeldet', () => {
    const p = plan({
      zaehne: { '45': { B: 'f', TP: 'I' } },
      regionen: { 'UK-R': { fixierung: true } },
    })
    const k = kalkulieren(p, E)
    expect(k.honorarGoz.map((z) => z.nr)).not.toContain('9150')
    expect(k.hinweise.some((h) => /9150/.test(h))).toBe(true)
  })
})

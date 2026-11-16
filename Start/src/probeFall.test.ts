import { describe, expect, it } from 'vitest'
import { planartErkennen } from './hkpPdf'
import { anlagenZuordnen, fachEntscheiden, fachErkennen, gruppenBauen, type Teil } from './probeFall'

const leer = { B: {}, R: {}, TP: {} }
const fach = (name: string, text: string, positionen: { ebene: string; nr: string }[] = []) =>
  fachErkennen(name, text, planartErkennen(text, positionen), positionen)

const teil = (t: Partial<Teil> & { name: string; fach: Teil['fach'] }): Teil => ({ schema: leer, positionen: [], ...t })

describe('fachErkennen', () => {
  it('Kassen-HKP bleibt Zahnersatz', () => {
    expect(fach('hkp.pdf', 'Regelversorgung Festzuschuss Therapieplanung')).toBe('ze')
  })
  it('PAR-Plan über das Blatt', () => {
    expect(fach('scan1.pdf', 'Parodontalstatus und Behandlungsplan, Diagnose Parodontitis Stadium III')).toBe('par')
    expect(fach('scan2.pdf', '', [{ ebene: 'BEMA', nr: 'AIT a' }])).toBe('par')
  })
  it('KB über das Blatt', () => {
    expect(fach('scan.pdf', 'Behandlungsplan Kiefergelenkserkrankung, Aufbissbehelf mit adjustierter Oberfläche')).toBe('kb')
    expect(fach('scan.pdf', '', [{ ebene: 'BEMA', nr: 'K1' }])).toBe('kb')
  })
  it('Privatplan mit Implantation ist Implantation, die Krone darauf ist Privat-ZE', () => {
    expect(fach('a.pdf', 'Kostenvoranschlag Zahnarzthonorar Implantation regio 36')).toBe('impl')
    expect(fach('a.pdf', 'Kostenvoranschlag Zahnarzthonorar', [{ ebene: 'GOZ', nr: '9010' }])).toBe('impl')
    expect(fach('b.pdf', 'Kostenvoranschlag Zahnarzthonorar Krone auf Implantat', [{ ebene: 'GOZ', nr: '2200' }])).toBe('privat-ze')
  })
  it('Sagt das Blatt nichts, entscheidet der Dateiname', () => {
    expect(fach('Meier PAR-Plan.jpg', '')).toBe('par')
    expect(fach('Meier_KB.jpg', '')).toBe('kb')
    expect(fach('Sparkasse.jpg', '')).toBe('ze')
  })
})

describe('gruppenBauen', () => {
  it('bildet je Fach einen Plan in fester Reihenfolge', () => {
    const g = gruppenBauen([
      teil({ name: 'par.pdf', fach: 'par', dateien: ['p1'] }),
      teil({ name: 'impl.pdf', fach: 'impl', planart: 'privat-impl', dateien: ['i1'] }),
      teil({ name: 'hkp.pdf', fach: 'ze', planart: 'hkp', positionen: [{ ebene: 'BEMA', nr: '91b', zahn: '16', anzahl: 1 }], dateien: ['h1'] }),
      teil({ name: 'goz.pdf', fach: 'ze', planart: 'privat-ze', positionen: [{ ebene: 'GOZ', nr: '2210', zahn: '16', anzahl: 1 }], dateien: ['h2'] }),
    ])
    expect(g.map((x) => x.reiter)).toEqual(['HKP', 'Implantation', 'PAR'])
    expect(g[0].blatt).toMatchObject({ planart: 'hkp', planer: 'hkp', gozAnteil: true, dateien: ['h1', 'h2'] })
    expect(g[0].blatt.positionen).toHaveLength(2)
    expect(g[1]).toMatchObject({ adresse: '/planer/privat-hkp/', fuellt: true })
    expect(g[1].blatt).toMatchObject({ planart: 'privat-impl', planer: 'privat' })
    expect(g[2]).toMatchObject({ adresse: '/planer/par/', fuellt: false, namen: ['par.pdf'] })
  })
  it('privater PAR- und KB-Plan geht in den Privat-Planer', () => {
    const g = gruppenBauen([
      teil({ name: 'a', fach: 'par', positionen: [{ ebene: 'GOZ', nr: '4070', zahn: '', anzahl: 1 }] }),
      teil({ name: 'b', fach: 'kb', positionen: [{ ebene: 'GOZ', nr: '7010', zahn: '', anzahl: 1 }] }),
    ])
    expect(g.map((x) => x.adresse)).toEqual(['/planer/privat-par/', '/planer/privat-kb/'])
  })
})

describe('fachEntscheiden', () => {
  const privat = planartErkennen('Kostenvoranschlag Zahnarzthonorar', [{ ebene: 'GOZ' }])
  const kassenblatt = planartErkennen('Regelversorgung Festzuschuss Therapieplanung', [])
  it('ohne Urteil gilt das Fach aus den festen Wörtern', () => {
    expect(fachEntscheiden('par', privat, null)).toEqual({ fach: 'par' })
    expect(fachEntscheiden('privat-ze', privat, { art: '', kasse: false })).toEqual({ fach: 'privat-ze' })
  })
  it('das Modell schlägt die festen Wörter', () => {
    expect(fachEntscheiden('ze', planartErkennen('', []), { art: 'kfo', kasse: true })).toMatchObject({ fach: 'kfo', kasse: true })
    expect(fachEntscheiden('privat-ze', privat, { art: 'kons', kasse: false })).toMatchObject({ fach: 'kons', kasse: false })
    expect(fachEntscheiden('privat-ze', privat, { art: 'implantation', kasse: false })).toMatchObject({ fach: 'impl' })
  })
  it('ein Kassenblatt bleibt Kassen-HKP, auch wenn das Modell es privat nennt', () => {
    expect(kassenblatt.planart).toBe('hkp')
    expect(fachEntscheiden('ze', kassenblatt, { art: 'privat-ze', kasse: false })).toMatchObject({ fach: 'ze', kasse: true })
  })
})

describe('anlagenZuordnen', () => {
  const anlage = () => teil({ name: 'anlage.pdf', ...fachEntscheiden('privat-ze', planartErkennen('', []), { art: 'goz-anlage', kasse: true }) })
  it('GOZ-Anlage und Laborbeleg gehen zum Kassen-HKP des Falls', () => {
    const teile = [teil({ name: 'hkp.pdf', fach: 'ze' }), anlage(), teil({ name: 'labor.pdf', fach: 'privat-ze', anlage: true })]
    anlagenZuordnen(teile)
    expect(teile.map((t) => t.fach)).toEqual(['ze', 'ze', 'ze'])
    expect(gruppenBauen(teile)).toHaveLength(1)
  })
  it('ohne Kassen-HKP bleibt die Anlage ein Privatplan', () => {
    const teile = [anlage(), teil({ name: 'impl.pdf', fach: 'impl' })]
    anlagenZuordnen(teile)
    expect(teile.map((t) => t.fach)).toEqual(['privat-ze', 'impl'])
  })
})

describe('KFO und Kons', () => {
  it('Kasse oder privat entscheidet das Urteil, wenn keine Zeilen gelesen sind', () => {
    const g = gruppenBauen([
      teil({ name: 'a', fach: 'kfo', kasse: true }),
      teil({ name: 'b', fach: 'kons', kasse: false }),
    ])
    expect(g.map((x) => x.adresse)).toEqual(['/planer/kfo/', '/planer/kons/'])
    const h = gruppenBauen([
      teil({ name: 'a', fach: 'kfo', kasse: false }),
      teil({ name: 'b', fach: 'kons', kasse: true }),
      teil({ name: 'c', fach: 'par', kasse: false }),
    ])
    expect(h.map((x) => x.adresse)).toEqual(['/planer/privat-par/', '/planer/privat-kfo/', '/planer/mkv/'])
  })
})

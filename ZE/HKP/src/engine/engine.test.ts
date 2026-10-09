import { describe, expect, it } from 'vitest'
import type { HkpPlan, Position, Preisliste } from '../types'
import { leererPlan } from '../store/plan'
import { AUTO, STANDARD_LISTEN, listeWaehlen, stichtag } from '../store/preislisten'
import { kzvAusPlz } from '../data/kzv'
import { dateiImportieren } from '../store/import'
import { befundeZusammenfassen, berechnen, laborVon, zaehneVon, type Listen } from './berechnung'
import { TP_ZUORDNUNG, regelOptionen, regelversorgungErmitteln, therapieAnwenden } from './regeln'
import { nachtraeglichePositionen } from './nachtraeglich'
import { standardBegruendung } from './begruendung'
import { vorschlaege } from './suche'
import { REPARATUR_ARTEN } from './reparaturen'
import { IMPLANTATSYSTEME } from '../data/implantatsysteme'
import { OBERKIEFER, UNTERKIEFER } from './zahnschema'
import { gebietAufloesen, kombination, kombinationenPruefen } from './kombinationen'
import { auftragsnummerErzeugen, auftragsnummerGueltig, laborXmlErstellen, laborXmlLesen, laborXmlUebernehmen, pruefziffer } from './laborxml'
import { PRIVAT_EXTRAS, privatKandidaten, privatProthesen, privatStufeAnwenden, regelUebernehmen } from './aufwertung'
import { DPF_INDEX, dpfAbgleich, dpfBefundDatei, dpfErgebnisLesen, dpfUebernehmen } from './dpf'
import { BEB_STANDARD, bebErgaenzen } from './beb-standard'

const liste = <T extends Preisliste['typ']>(typ: T, id: string) => STANDARD_LISTEN.find((l) => l.typ === typ && l.id === id) as Preisliste<T>
const LISTEN: Listen = {
  bema: liste('bema', 'bema-2026'), goz: liste('goz', 'goz-2012'), bel: liste('bel2', 'bel2-bayern-2026'),
  beb: liste('beb', 'beb-itz-2024'), fz: liste('festzuschuss', 'fz-2026'),
}

function planMit(befund: Record<string, string>, tp: Record<string, string> = {}): HkpPlan {
  const p = leererPlan()
  for (const [z, b] of Object.entries(befund)) p.zaehne[z].B = b
  for (const [z, t] of Object.entries(tp)) p.zaehne[z].TP = t
  return p
}

const pos = (ebene: Position['ebene'], nr: string, extra: Partial<Position> = {}): Position =>
  ({ id: nr, ebene, nr, zahn: '', anzahl: 1, ...extra })

const nrs = (befunde: { nr: string }[]) => befunde.map((b) => b.nr).sort()

describe('Gebührenberechnung', () => {
  it('GOZ: Punkte × Punktwert × Faktor, Rundung nach Faktor', () => {
    const p = leererPlan()
    p.positionen = [pos('GOZ', '2210', { faktor: 2.3 }), pos('GOZ', '2210', { id: 'b', faktor: 1 })]
    const e = berechnen(p, LISTEN)
    expect(e.positionen.map((x) => x.betrag)).toEqual([217.06, 94.37])
  })

  it('BEMA: Punkte × ZE-Punktwert 2026', () => {
    const p = leererPlan()
    p.positionen = [pos('BEMA', '20a')]
    expect(berechnen(p, LISTEN).summen.bemaHonorar).toBe(175.29)
  })

  it('BEL: Preisspalte nach Standard-Labor, MwSt. auf Labor', () => {
    const p = leererPlan()
    p.positionen = [pos('BEL', '1021')]
    const gewerbe = berechnen(p, LISTEN)
    p.einstellungen.labor = 'praxis'
    const praxis = berechnen(p, LISTEN)
    expect(gewerbe.summen.belNetto).toBeGreaterThan(praxis.summen.belNetto)
    expect(gewerbe.summen.laborMwst).toBe(Math.round(gewerbe.summen.belNetto * 7) / 100)
  })

  it('Honorar-Regler: hebt GOZ-Faktor an, höchstens 3,5; BEMA bleibt fest', () => {
    const p = leererPlan()
    p.positionen = [pos('GOZ', '2210', { faktor: 2.3 }), pos('GOZ', '2210', { id: 'b', faktor: 3.0 }), pos('BEMA', '20a')]
    p.einstellungen.honorarFaktor = 2.8
    const e = berechnen(p, LISTEN)
    expect(e.positionen.map((x) => x.faktor)).toEqual([2.8, 3.0, undefined])
    expect(e.summen.bemaHonorar).toBe(175.29)
    p.einstellungen.honorarFaktor = 5
    expect(berechnen(p, LISTEN).positionen[0].faktor).toBe(3.5)
  })

  it('Formular II: gleiche Befund-Nr. an Einzelzähnen in einer Zeile, Gebietsbefunde und nachträgliche getrennt', () => {
    const p = leererPlan()
    const b = (id: string, nr: string, zahnGebiet: string, extra = {}) => ({ id, nr, zahnGebiet, anzahl: 1, auto: true, ...extra })
    p.befunde = [b('a', '1.1', '11'), b('b', '1.3', '11'), b('c', '1.1', '15'), b('d', '1.3', '15'), b('e', '1.1', '14'),
      b('f', '2.1', '24-26'), b('g', '2.1', '34-36'), b('h', '1.5', '21', { nachtraeglich: true }), b('i', '1.5', '22')]
    const z = befundeZusammenfassen(berechnen(p, LISTEN).befunde)
    expect(z.map((x) => `${x.nr} ${x.zahnGebiet} ${x.anzahl}`)).toEqual([
      '1.1 15,14,11 3', '1.3 15,11 2', '2.1 24-26 1', '2.1 34-36 1', '1.5 21 1', '1.5 22 1',
    ])
    expect(z[0].ids).toEqual(['a', 'c', 'e'])
    expect(z[0].betrag).toBeCloseTo(3 * 239.03, 2)
  })

  it('Faktor über 2,3: Standardbegründung je GOZ-Nr., eigene Begründung hat Vorrang', () => {
    const p = leererPlan()
    p.positionen = [
      pos('GOZ', '2210', { faktor: 2.3 }), pos('GOZ', '9050', { id: 'b', faktor: 3.5 }),
      pos('GOZ', '2195', { id: 'c', faktor: 3.5, faktorBegruendung: 'Obliterierter Kanal, Stiftbett nur unter Mikroskop darstellbar.' }),
    ]
    const e = berechnen(p, LISTEN)
    expect(e.positionen[0].faktorBegruendung).toBeUndefined()
    expect(e.positionen[1].faktorBegruendung).toBe(standardBegruendung('9050'))
    expect(e.positionen[1].faktorBegruendung).toContain('Aufbauteile')
    expect(e.positionen[2].faktorBegruendung).toContain('Mikroskop')
    expect(e.hinweise.some((h) => h.text.includes('1 eigene, 1 Standardtext'))).toBe(true)
    p.einstellungen.honorarFaktor = 3.5
    expect(berechnen(p, LISTEN).positionen[0].faktorBegruendung).toBe(standardBegruendung('2210'))
    expect(standardBegruendung('2210')).not.toBe(standardBegruendung('5220'))
  })

  it('Eigenlabor-Regler: Privat-Aufschlag nur auf BEB, Kasse höchstens Praxis-Höchstpreis', () => {
    const p = leererPlan()
    p.positionen = [pos('BEB', '2101', { labor: 'eigen' }), pos('BEL', '1021', { id: 'b', labor: 'eigen' }), pos('BEB', '2101', { id: 'c', labor: 'fremd' })]
    const vorher = berechnen(p, LISTEN).positionen
    expect(vorher[1].einzelpreis).toBe(99.31)
    p.einstellungen.eigenPrivatAufschlag = 20
    p.einstellungen.eigenKasseProzent = 150
    const nachher = berechnen(p, LISTEN)
    expect(nachher.positionen[0].einzelpreis).toBeCloseTo(vorher[0].einzelpreis * 1.2, 2)
    expect(nachher.positionen[1].einzelpreis).toBe(99.31)
    expect(nachher.positionen[2].einzelpreis).toBe(vorher[2].einzelpreis)
    p.einstellungen.eigenKasseProzent = 90
    expect(berechnen(p, LISTEN).positionen[1].einzelpreis).toBe(89.38)
  })

  it('trennt Eigen- und Fremdlabor in den Summen', () => {
    const p = leererPlan()
    p.positionen = [pos('BEL', '1021', { labor: 'eigen' }), pos('BEL', '1021', { id: 'b' }), pos('MAT', '', { id: 'c', labor: 'fremd', preis: 50 }), pos('MAT', '', { id: 'd', preis: 10 })]
    const s = berechnen(p, LISTEN).summen
    expect([s.eigenBel, s.fremdBel, s.fremdMat, s.material]).toEqual([99.31, 104.54, 50, 10])
    expect(s.laborMwst).toBe(Math.round((99.31 + 154.54) * 7) / 100)
  })

  it('meldet BEL-Preise über dem Höchstpreis', () => {
    const p = leererPlan()
    p.positionen = [pos('BEL', '1021', { labor: 'fremd', preis: 120 })]
    expect(berechnen(p, LISTEN).hinweise.some((h) => h.stufe === 'fehler' && h.text.includes('Höchstpreis'))).toBe(true)
  })

  it('Zusätzliche GOZ-Leistungen: stufenweise, nur mit Indikation, je Bereich', () => {
    const p0 = planMit({ '16': 'ww', '15': 'ww', '14': 'ww', '24': 'ww' }, { '16': 'KM', '15': 'KM', '14': 'K', '24': 'KM' })
    const p = regelUebernehmen(p0, therapieAnwenden(regelversorgungErmitteln(p0.zaehne), p0.zaehne))
    const zusatz = (stufe: number) => {
      p.einstellungen.gozZusatzStufe = stufe
      return berechnen(p, LISTEN).positionen.filter((x) => x.zusatz).map((x) => `${x.nr} ${x.zahn}`.trim())
    }
    expect(zusatz(0)).toEqual([])
    expect(zusatz(1)).toEqual(['2030 18-14', '2030 24-28'])
    expect(zusatz(2).sort()).toEqual(['2030 18-14', '2030 24-28', '2040 18-14', '2040 24-28', '2197 15', '2197 16', '2197 24'])
    expect(zusatz(3)).toContain('0065 24-28')
    expect(zusatz(5)).toEqual(expect.arrayContaining(['8000', '8010', '8020', '8050', '8080', '8090']))
    p.einstellungen.gozZusatzAus = ['2197|15']
    expect(zusatz(2)).not.toContain('2197 15')
    expect(berechnen(p, LISTEN).versorgungsart).toBe('gleichartig')
  })

  it('Zusatzleistungen: keine Funktionsdiagnostik bei Einzelkrone, keine Doppelung vorhandener GOZ', () => {
    const p = planMit({ '16': 'ww' })
    p.zaehne['16'].R = 'K'
    p.positionen = [pos('BEMA', '20a', { zahn: '16' }), pos('GOZ', '2030', { zahn: '18-14' })]
    p.einstellungen.gozZusatzStufe = 5
    const e = berechnen(p, LISTEN)
    expect(e.positionen.some((x) => x.nr === '8000')).toBe(false)
    expect(e.positionen.filter((x) => x.nr === '2030')).toHaveLength(1)
    expect(e.zusatzNichtAngesetzt.join()).toContain('8000')
  })

  it('Zusatzleistungen: keine Präparation an Ankern einer aufgelösten Brücke, 0065 nur passend zur Abformung', () => {
    const p0 = planMit({ '15': 'f' }, { '15': 'SKM' })
    const zusatz = (abformung: HkpPlan['implantat']['abformung']) => {
      const q = { ...p0, implantat: { ...p0.implantat, abformung } }
      const p = regelUebernehmen(q, therapieAnwenden(regelversorgungErmitteln(q.zaehne), q.zaehne, q))
      p.einstellungen.gozZusatzStufe = 3
      return berechnen(p, LISTEN).positionen.filter((x) => x.ebene === 'GOZ' && /^(2030|0065)$/.test(x.nr)).map((x) => `${x.nr} ${x.zahn}`)
    }
    expect(zusatz('geschlossen')).toEqual([])
    expect(zusatz('scan')).toEqual(['0065 OK rechts', '0065 UK rechts'])
  })

  it('Zusatzleistungen: kein 2197 am Brückenglied, auch wenn TP „KM“ eingetragen ist', () => {
    const p0 = planMit({ '15': 'f' }, { '14': 'KM', '15': 'KM', '16': 'KM' })
    const p = regelUebernehmen(p0, therapieAnwenden(regelversorgungErmitteln(p0.zaehne), p0.zaehne))
    p.einstellungen.gozZusatzStufe = 2
    const z = berechnen(p, LISTEN).positionen.filter((x) => x.nr === '2197').map((x) => x.zahn).sort()
    expect(z).toEqual(['14', '16'])
  })

  it('Eigenanteil = Gesamtkosten − Festzuschuss', () => {
    const p = planMit({ '16': 'ww' })
    const r = regelversorgungErmitteln(p.zaehne)
    p.befunde = r.befunde
    p.positionen = r.positionen
    const s = berechnen(p, LISTEN).summen
    expect(s.festzuschuss).toBe(239.03)
    expect(s.eigenanteil).toBeCloseTo(s.gesamt - s.kassenanteil, 2)
  })
})

describe('Regelengine', () => {
  it('Einzelkrone Seitenzahn: 16 ww → 1.1, K', () => {
    const r = regelversorgungErmitteln(planMit({ '16': 'ww' }).zaehne)
    expect(nrs(r.befunde)).toEqual(['1.1'])
    expect(r.R['16']).toBe('K')
    expect(r.positionen.some((p) => p.nr === '20a' && p.zahn === '16')).toBe(true)
  })

  it('Einzelkrone im Verblendbereich: 14 ww → 1.1 + 1.3, KV', () => {
    const r = regelversorgungErmitteln(planMit({ '14': 'ww' }).zaehne)
    expect(nrs(r.befunde)).toEqual(['1.1', '1.3'])
    expect(r.R['14']).toBe('KV')
  })

  it('Schaltlücke: 25 k, 26 f, 27 k → 2.1 und 2.7 für 25', () => {
    const r = regelversorgungErmitteln(planMit({ '25': 'k', '26': 'f', '27': 'k' }).zaehne)
    expect(r.befunde.find((b) => b.nr === '2.1')?.zahnGebiet).toBe('25-27')
    expect(r.befunde.find((b) => b.nr === '2.7')?.zahnGebiet).toBe('25')
    expect([r.R['25'], r.R['26'], r.R['27']]).toEqual(['KV', 'B', 'K'])
    expect(r.positionen.some((p) => p.nr === '92' && p.zahn === '25-27')).toBe(true)
  })

  it('Freiend 36/37 → 3.1 Modellguss', () => {
    const r = regelversorgungErmitteln(planMit({ '36': 'f', '37': 'f', '38': 'f' }).zaehne)
    expect(nrs(r.befunde)).toContain('3.1')
    expect(r.R['36']).toBe('E')
  })

  it('Zahnloser Oberkiefer → 4.2', () => {
    const befund = Object.fromEntries(['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'].map((z) => [z, 'f']))
    const r = regelversorgungErmitteln(planMit(befund).zaehne)
    expect(nrs(r.befunde)).toEqual(['4.2'])
    expect(r.positionen.some((p) => p.nr === '97a')).toBe(true)
  })

  it('TP KM bei Regel K → GOZ 2210 + BEB 2281, gleichartig', () => {
    const p = planMit({ '16': 'ww' }, { '16': 'KM' })
    const r = therapieAnwenden(regelversorgungErmitteln(p.zaehne), p.zaehne)
    expect(r.positionen.some((x) => x.ebene === 'GOZ' && x.nr === '2210')).toBe(true)
    expect(r.positionen.some((x) => x.ebene === 'BEB' && x.nr === '2281')).toBe(true)
    expect(r.positionen.some((x) => x.nr === '20a')).toBe(false)
    p.zaehne['16'].R = r.R['16']
    p.befunde = r.befunde
    p.positionen = r.positionen
    expect(berechnen(p, LISTEN).versorgungsart).toBe('gleichartig')
  })
})

const fehlend = (...zaehne: string[]) => Object.fromEntries(zaehne.map((z) => [z, 'f']))
const zuschlag = (befunde: { nr: string; zahnGebiet: string }[], nr: string) => befunde.filter((b) => b.nr === nr).map((b) => b.zahnGebiet).sort()

describe('Regelengine – Befundklassen 3 bis 7', () => {
  it('3.2a: beidseitig bis zum ersten Prämolaren verkürzt → 3.1 + 3.2 an 14 und 24, Teleskope mit 4.7', () => {
    const r = regelversorgungErmitteln(planMit(fehlend('15', '16', '17', '18', '25', '26', '27', '28')).zaehne)
    expect(zuschlag(r.befunde, '3.1')).toEqual(['OK'])
    expect(zuschlag(r.befunde, '3.2')).toEqual(['14', '24'])
    expect(zuschlag(r.befunde, '4.7')).toEqual(['14', '24'])
    expect([r.R['14'], r.R['24']]).toEqual(['TV', 'TV'])
    expect(r.positionen.filter((p) => p.nr === '91d')).toHaveLength(2)
  })

  it('3.2c: beidseitig bis 3 bzw. 4 unterbrochen mit mindestens zwei fehlenden Zähnen', () => {
    const r = regelversorgungErmitteln(planMit(fehlend('34', '35', '36', '37', '45', '46')).zaehne)
    expect(zuschlag(r.befunde, '3.2')).toEqual(['33', '44'])
    expect(r.R['47']).toBe('H')
  })

  it('kein 3.2 bei nur einseitiger Freiendsituation', () => {
    const r = regelversorgungErmitteln(planMit(fehlend('15', '16', '17', '18', '26')).zaehne)
    expect(nrs(r.befunde)).toContain('3.1')
    expect(nrs(r.befunde)).not.toContain('3.2')
  })

  it('4.6/4.7: Restzahnbestand 13 und 23 → 4.1 + Teleskope', () => {
    const rest = ['18', '17', '16', '15', '14', '12', '11', '21', '22', '24', '25', '26', '27', '28']
    const r = regelversorgungErmitteln(planMit(fehlend(...rest)).zaehne)
    expect(zuschlag(r.befunde, '4.1')).toEqual(['OK'])
    expect(zuschlag(r.befunde, '4.6')).toEqual(['13', '23'])
    expect(zuschlag(r.befunde, '4.7')).toEqual(['13', '23'])
    expect(r.R['16']).toBe('E')
  })

  it('5.1: Interimsprothese bei zwei fehlenden Zähnen im UK', () => {
    const r = regelversorgungErmitteln(planMit(fehlend('36', '37', '38')).zaehne, { interimUK: true })
    expect(zuschlag(r.befunde, '5.1')).toEqual(['UK'])
    expect(r.positionen.some((p) => p.nr === '96a' && p.zahn === 'UK')).toBe(true)
  })

  it('7.1: implantatgetragene Krone in zahnbegrenzter Einzelzahnlücke', () => {
    const r = regelversorgungErmitteln(planMit({ '36': 'skw' }).zaehne)
    expect(nrs(r.befunde)).toEqual(['7.1'])
    expect(r.R['36']).toBe('SK')
    expect(r.positionen.some((p) => p.ebene === 'GOZ' && p.nr === '2200')).toBe(true)
  })

  it('7.2: implantatgetragene Brücke, 1.3 für Krone im Verblendbereich', () => {
    const r = regelversorgungErmitteln(planMit({ '24': 'skw', '25': 'sbw', '26': 'skw' }).zaehne)
    expect(zuschlag(r.befunde, '7.2')).toEqual(['24', '25', '26'])
    expect(zuschlag(r.befunde, '1.3')).toEqual(['24'])
    expect([r.R['24'], r.R['25'], r.R['26']]).toEqual(['SKV', 'SBV', 'SK'])
  })

  it('7.5: implantatgetragene Prothese je Kiefer einmal', () => {
    const r = regelversorgungErmitteln(planMit({ '33': 'stw', '43': 'stw' }).zaehne)
    expect(zuschlag(r.befunde, '7.5')).toEqual(['UK'])
  })
})

describe('Kombinierbarkeit der Festzuschüsse', () => {
  const b = (nr: string, zahnGebiet: string, anzahl = 1) => ({ nr, zahnGebiet, anzahl })

  it('Kombinationstabelle: X im selben Kiefer, O am selben Zahn', () => {
    expect(kombination('1.1', '1.4')).toBe('XO')
    expect(kombination('4.3', '4.6')).toBe('X')
    expect(kombination('2.3', '2.3')).toBe('')
    expect(kombination('7.5', '4.5')).toBe('X5')
  })

  it('Tabelle ist symmetrisch', () => {
    const nr = ['1.1', '1.2', '1.4', '1.5', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '3.1', '3.2', '4.1', '4.2', '4.5', '4.6', '4.8', '4.9', '7.1', '7.2', '7.5']
    for (const a of nr) for (const c of nr) expect(kombination(a, c), `${a}/${c}`).toBe(kombination(c, a))
  })

  it('löst Zahngebiete auf', () => {
    expect(gebietAufloesen('25-27').zaehne).toEqual(['25', '26', '27'])
    expect(gebietAufloesen('12-22').zaehne).toEqual(['12', '11', '21', '22'])
    expect([...gebietAufloesen('OK,UK').kiefer]).toEqual(['OK', 'UK'])
  })

  it('1.1 am Brückenanker ist unzulässig, im Gegenkiefer zulässig', () => {
    expect(kombinationenPruefen([b('2.1', '25-27'), b('1.1', '25')]).join()).toContain('am selben Zahn (25)')
    expect(kombinationenPruefen([b('2.1', '25-27'), b('1.1', '16')])).toEqual([])
    expect(kombinationenPruefen([b('4.2', 'OK'), b('1.1', '36')])).toEqual([])
  })

  it('meldet unzulässige Kombinationen, Zuschläge ohne Grundbefund und Höchstzahlen', () => {
    expect(kombinationenPruefen([b('4.2', 'OK'), b('1.1', '16')]).join()).toContain('nicht kombinierbar')
    expect(kombinationenPruefen([b('2.3', '14-11'), b('2.3', '22-26')]).join()).toContain('nicht kombinierbar')
    expect(kombinationenPruefen([b('1.3', '14')]).join()).toContain('nur zusammen mit Befund 1.1')
    expect(kombinationenPruefen([b('4.9', 'OK'), b('4.9', 'UK')]).join()).toContain('einmal je Gesamtbefund')
    expect(kombinationenPruefen([b('3.2', '13'), b('3.2', '24'), b('3.2', '23')]).join()).toContain('höchstens zweimal')
  })

  it('erzeugte Regelversorgungen sind widerspruchsfrei', () => {
    for (const befund of [
      fehlend('15', '16', '17', '18', '25', '26', '27', '28'),
      { '25': 'k', '26': 'f', '27': 'k', '14': 'ww', '36': 'skw' },
      fehlend('18', '17', '16', '15', '14', '12', '11', '21', '22', '24', '25', '26', '27', '28'),
    ]) {
      const r = regelversorgungErmitteln(planMit(befund).zaehne)
      expect(kombinationenPruefen(r.befunde).filter((t) => /nicht|höchstens/.test(t))).toEqual([])
    }
  })
})

describe('DPF-Schnittstelle (KZBV)', () => {
  it('Zahnindex im Uhrzeigersinn: 1 = 18, 16 = 28, 17 = 38, 32 = 48', () => {
    expect([DPF_INDEX[0], DPF_INDEX[15], DPF_INDEX[16], DPF_INDEX[31]]).toEqual(['18', '28', '38', '48'])
  })

  it('Befunddatei entspricht dem Beispiel der Anbindungsbeschreibung (18 f, 11 kw, 37 38 f)', () => {
    const datei = dpfBefundDatei(planMit({ '18': 'f', '11': 'kw', '37': 'f', '38': 'f' }))
    expect(datei).toContain('[Befund]\r\n1=f\r\n8=kw\r\n17=f\r\n18=f\r\n')
  })

  it('liest die Ergebnisdatei und übernimmt sie in den Plan', () => {
    const text = [
      '[Befund]', '2=f', '3=kw', '5=kw', '[Regelversorgung]', '2=B', '3=K', '5=KV',
      '[BEMA]', '19=17-15;3', '97b=UK;1', '98d=;1?',
      '[GOZ]', '5010=17,15;2', '5070=16;1',
      '[Festzuschuss]', '2.1=16;1', '2.7=15;1', '4.9=OK,UK;1?',
      '[Gleich-Anders]', '2=g', '3=g', '13=p',
    ].join('\r\n')
    const e = dpfErgebnisLesen(text)
    expect(e.befund).toEqual({ '17': 'f', '16': 'kw', '14': 'kw' })
    expect(e.bema[0]).toEqual({ nr: '19', zahn: '17-15', anzahl: 3, fakultativ: false })
    expect(e.bema[2].fakultativ).toBe(true)
    expect(e.goz[0].zahn).toBe('17,15')
    expect(e.gleichAnders['17']).toBe('g')

    const plan = dpfUebernehmen(leererPlan(), e, [pos('BEL', '1021', { auto: true })])
    expect(plan.zaehne['17']).toEqual({ B: 'f', R: 'B', TP: '' })
    expect(plan.befunde.map((b) => b.nr)).toEqual(['2.1', '2.7', '4.9'])
    expect(plan.befunde[2].fakultativ).toBe(true)
    expect(plan.positionen.filter((p) => p.ebene === 'BEL')).toHaveLength(1)
    expect(plan.versorgungsart).toBe('andersartig')
  })

  it('Abgleich meldet abweichende Festzuschüsse', () => {
    const e = dpfErgebnisLesen('[Festzuschuss]\r\n1.1=16;1\r\n1.3=16;1\r\n')
    const eigen = regelversorgungErmitteln(planMit({ '16': 'ww' }).zaehne)
    expect(dpfAbgleich(e, eigen).join()).toContain('1.3: DPF 1 / Engine 0')
  })
})

describe('Preislisten-Import', () => {
  it('erkennt das VDDS-Format der KZVen (Praxis vor Gewerbe, ohne Kopfzeile)', async () => {
    const csv = '0010;0010;Modell;0;8,02;8,45;;;;\r\n1021;1021;Vollkrone/Metall;0;99,31;104,54;;;;\r\n9330;9330;Versandkosten;0;0,00;7,17;;;;\r\n'
    const r = await dateiImportieren('bel2', new File([csv], 'liste.csv'))
    expect(r.eintraege).toHaveLength(3)
    expect(r.eintraege[1]).toMatchObject({ nr: '1021', gewerbe: 104.54, praxis: 99.31 })
    expect(r.eintraege[2]).toMatchObject({ nr: '9330', gewerbe: 7.17, praxis: 0 })
  })

  it('VDDS mit 14 Spalten: Preise aus den ZE-Spalten, Nummern ohne führende Null, KZV aus dem Dateinamen', async () => {
    const csv = '10;10;Modell;0;0,00;0,00;8,07;8,49;8,07;8,49;8,07;8,49;0,00;0,00\r\n1021;1021;Vollkrone;0;;;99,10;104,32;;;;;;\r\n'
    const r = await dateiImportieren('bel2', new File([csv], '30la0226.csv'))
    expect(r.eintraege[0]).toMatchObject({ nr: '0010', praxis: 8.07, gewerbe: 8.49 })
    expect(r.eintraege[1]).toMatchObject({ nr: '1021', praxis: 99.1, gewerbe: 104.32 })
    expect(r.meta).toMatchObject({ kzv: '30', gueltigAb: '2026-02-01' })
  })

  it('VDDS mit Kopfzeile und nur Praxislaborpreisen (Nordrhein): Gewerbe = Praxis ÷ 0,95', async () => {
    const csv = 'BEL_KNR;BEL_NR;LEIST_BEZ;KAS_ART;PL_EUR;GL_EUR\r\n0010;0010;Modell;0;8,03;0\r\n1021;1021;Krone;0;95,00;0\r\n'
    const r = await dateiImportieren('bel2', new File([csv], '13la0126.csv'))
    expect(r.eintraege).toHaveLength(2)
    expect(r.eintraege[1]).toMatchObject({ praxis: 95, gewerbe: 100 })
    expect(r.warnungen.join()).toContain('nur Praxislaborpreise')
  })

  it('KZV-Bereich aus der PLZ (NRW getrennt nach Nordrhein und Westfalen-Lippe)', () => {
    expect(kzvAusPlz('80331')).toBe('11')
    expect(kzvAusPlz('40210')).toBe('13')
    expect(kzvAusPlz('44135')).toBe('37')
    expect(kzvAusPlz('45879')).toBe('37')
    expect(kzvAusPlz('45127')).toBe('13')
    expect(kzvAusPlz('10115')).toBe('30')
    expect(kzvAusPlz('14467')).toBe('53')
    expect(kzvAusPlz('63739')).toBe('11')
  })

  it('wählt automatisch die Liste der KZV, die am Stichtag gilt, und warnt bei fehlender Jahresliste', () => {
    const l = (id: string, kzv: string, ab: string) => ({ id, typ: 'bel2' as const, name: id, gueltigAb: ab, kzv, eintraege: [] })
    const alle = [l('by26', '11', '2026-01-01'), l('be25', '30', '2025-02-01'), l('be26', '30', '2026-02-01')]
    const ort = (kzv: string, tag: string) => ({ kzv: { nr: kzv, quelle: 'einstellung' as const }, stichtag: tag })
    expect(listeWaehlen(alle, 'bel2', AUTO, ort('30', '2026-01-15')).liste?.id).toBe('be25')
    expect(listeWaehlen(alle, 'bel2', AUTO, ort('30', '2026-03-01')).liste?.id).toBe('be26')
    const nrw = listeWaehlen(alle, 'bel2', AUTO, ort('13', '2026-03-01'))
    expect(nrw.liste?.id).toBe('by26')
    expect(nrw.hinweise[0].text).toContain('Nordrhein')
    expect(listeWaehlen(alle, 'bel2', AUTO, ort('11', '2027-01-10')).hinweise[0].text).toContain('Für 2027 liegt noch keine Liste vor')
  })

  it('Stichtag: Eingliederung vor Ausstellungsdatum', () => {
    const p = leererPlan()
    p.verwaltung.ausstellungsdatum = '2026-12-01'
    expect(stichtag(p)).toBe('2026-12-01')
    p.verwaltung.eingliederungsdatum = '15.01.2027'
    expect(stichtag(p)).toBe('2027-01-15')
  })

  it('liest CSV mit Kopfzeile und deutschem Zahlenformat', async () => {
    const csv = 'Nr;Leistung;Preis\n2101;Krone gegossen;115,80\n2281;Vollkeramikkrone;1.110,00\n'
    const r = await dateiImportieren('beb', new File([csv], 'beb.csv'))
    expect(r.eintraege).toEqual([
      { nr: '2101', text: 'Krone gegossen', preis: 115.8 },
      { nr: '2281', text: 'Vollkeramikkrone', preis: 1110 },
    ])
  })
})

describe('Labor-XML (Laborabrechnungsdaten 4.5)', () => {
  it('Prüfziffer nach dem KZBV-Beispiel: 471199-8122-ZE-12-1- → 4', () => {
    expect(pruefziffer('471199-8122-ZE-12-1-')).toBe('4')
    expect(auftragsnummerGueltig('471199-8122-ZE-12-1-4')).toBe(true)
    expect(auftragsnummerGueltig('471199-8122-ZE-12-1-5')).toBe(false)
  })

  it('erzeugt eine gültige Auftragsnummer aus Zahnarzt-Nr. und PLZ', () => {
    const p = leererPlan()
    p.verwaltung.zahnarztNr = '123456'
    p.einstellungen.praxisPlz = '80331'
    p.patient.name = 'Muster'
    const an = auftragsnummerErzeugen(p)
    expect(an).toMatch(/^563101-[A-Z0-9]+-ZE-\d+-1-\d$/)
    expect(auftragsnummerGueltig(an)).toBe(true)
  })

  it('Rundreise: Auftrag erstellen, Laborpreise einlesen, Fremdlabor-Positionen ersetzen', () => {
    const p = leererPlan()
    p.fremdlabor.name = 'Dentallabor Test'
    p.verwaltung.herstellungsort = 'D München'
    p.positionen = [
      pos('BEL', '1021', { zahn: '16', labor: 'fremd' }), pos('BEB', '2281', { id: 'b', zahn: '26', labor: 'fremd' }),
      pos('BEL', '0010', { id: 'c', labor: 'eigen' }),
    ]
    const e = berechnen(p, LISTEN)
    const xml = laborXmlErstellen(p, e.positionen, LISTEN, '471199-8122-ZE-12-1-4')
    expect(xml).toContain('<Position Art="BEL" Nummer="1021"')
    expect(xml).toContain('Art="NBL"')
    expect(xml).not.toContain('Nummer="0010"')
    expect(xml).toContain('Herstellungsort="D-München"')
    expect(xml).toContain('Abrechnungsbereich="BY"')

    // Labor gibt die Datei mit eigenen Preisen und Edelmetall zurück
    const antwort = xml
      .replace(/Einzelpreis="10454"/, 'Einzelpreis="9900"')
      .replace(/Laborrechnungsnummer="[^"]*"/, 'Laborrechnungsnummer="R-2026-77"')
      .replace('</MWST-Gruppe>', '  <Position Art="EDM" Beschreibung="Goldlegierung" Einzelpreis="5000" Menge="2500"/>\r\n    </MWST-Gruppe>')
    const x = laborXmlLesen(antwort)
    expect(x.fehler).toEqual([])
    expect(x.positionen.map((q) => q.art)).toEqual(['BEL', 'NBL', 'EDM'])
    expect(x.positionen[2].betrag).toBe(125)
    expect(x.warnungen.join()).toContain('≠ Zwischensumme')

    const { plan, meldungen } = laborXmlUebernehmen(p, x, 'antwort.xml')
    const fremd = plan.positionen.filter((q) => q.labor === 'fremd')
    expect(fremd.map((q) => [q.ebene, q.nr, q.zahn, q.preis])).toEqual([
      ['BEL', '1021', '16', 99], ['BEB', '2281', '26', x.positionen[1].einzelpreis], ['MAT', '', '', 50],
    ])
    expect(plan.positionen.find((q) => q.id === 'c')).toBeTruthy()
    expect(plan.fremdlabor.import?.rechnungsnummer).toBe('R-2026-77')
    expect(meldungen[0]).toContain('3 Positionen')
    expect(berechnen(plan, LISTEN).summen.fremdMat).toBe(125)
  })

  it('lehnt Dateien ohne Laborabrechnung ab', () => {
    expect(laborXmlLesen('<foo/>').fehler.length).toBeGreaterThan(0)
  })

  it('liest eine Datei fremder Laborsoftware (BOM, mehrzeilige Tags, zwei Steuersätze, Rabatt)', () => {
    const fremd = '\uFEFF<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      '<Laborabrechnung Version="4.5">\r\n' +
      '  <Rechnung Laborname="Dentallabor Müller &amp; Söhne GmbH" Labor-ID="123"\r\n' +
      '     Herstellungsort="D-Köln" Abrechnungsbereich="NR" Laborlieferdatum="2026-10-01"\r\n' +
      '     Laborrechnungsnummer="KVA-2026-0815" Auftragsnummer="123456-ABC-ZE-1-1-0"\r\n' +
      '     Laborsoftwarehersteller="Fremd" Laborsoftware="LabSoft" Laborsoftwareversion="9.1"\r\n' +
      '     Gesamtbetrag_netto="31500" Mehrwertsteuer_gesamt="1915" Gesamtbetrag_brutto="33415">\r\n' +
      "    <MWST-Gruppe Zwischensumme_netto='27500' Mehrwertsteuersatz='70' Mehrwertsteuerbetrag='1925'>\r\n" +
      '      <Position Art="BEL" Nummer="0010" Beschreibung="Modell" Einzelpreis="1500" Menge="2000"></Position>\r\n' +
      '      <Position Art="BEL" Nummer="1022" Beschreibung="Teleskopkrone" Einzelpreis="25000" Menge="1000"/>\r\n' +
      '      <Position Art="RBT" Beschreibung="Treuerabatt" Einzelpreis="500" Menge="1000"/>\r\n' +
      '    </MWST-Gruppe>\r\n' +
      '    <MWST-Gruppe Zwischensumme_netto="4000" Mehrwertsteuersatz="0" Mehrwertsteuerbetrag="0">\r\n' +
      '      <Position Art="EDM" Beschreibung="Goldlegierung 2,5 g" Einzelpreis="1600" Menge="2500"/>\r\n' +
      '    </MWST-Gruppe>\r\n' +
      '  </Rechnung>\r\n' +
      '</Laborabrechnung>\r\n'
    const x = laborXmlLesen(fremd)
    expect(x.fehler).toEqual([])
    expect(x.laborname).toBe('Dentallabor Müller & Söhne GmbH')
    expect(x.software).toBe('Fremd LabSoft 9.1')
    expect(x.positionen.map((q) => [q.art, q.nummer, q.betrag, q.mwstSatz])).toEqual([
      ['BEL', '0010', 30, 7], ['BEL', '1022', 250, 7], ['RBT', undefined, -5, 7], ['EDM', undefined, 40, 0],
    ])
    expect(x.netto).toBe(315)
    expect(x.warnungen.join()).toContain('Mehrwertsteuer gesamt')
    expect(x.warnungen.join()).toContain('Auftragsnummer')
  })
})

describe('Weitere Befunde: klinische Angaben, 6.10, 4.8, 7.5/7.6, Wiederherstellungen', () => {
  const regel = (befund: Record<string, string>, opt: Parameters<typeof regelversorgungErmitteln>[1] = {}) =>
    regelversorgungErmitteln(planMit(befund).zaehne, opt)
  const hat = (r: ReturnType<typeof regel>, ebene: string, nr: string, zahn?: string) =>
    r.positionen.some((p) => p.ebene === ebene && p.nr === nr && (zahn === undefined || p.zahn === zahn))
  const fz = (r: ReturnType<typeof regel>) => r.befunde.map((b) => `${b.nr} ${b.zahnGebiet}${b.anzahl > 1 ? ` ×${b.anzahl}` : ''}`).sort()

  it('1.4/1.5: Stiftaufbau an überkronten Zähnen mit BEMA 18a/18b', () => {
    const r = regel({ 11: 'ww', 21: 'ww' }, { klinisch: { stiftKonfektioniert: ['11'], stiftGegossen: ['21'] } })
    expect(fz(r)).toEqual(expect.arrayContaining(['1.4 11', '1.5 21', '1.1 11', '1.1 21']))
    expect(hat(r, 'BEMA', '18a', '11') && hat(r, 'BEMA', '18b', '21') && hat(r, 'BEL', '1050', '21')).toBe(true)
    expect(kombinationenPruefen(r.befunde).filter((m) => m.includes('1.4') || m.includes('1.5'))).toEqual([])
    const ohne = regel({ 11: 'ww' }, { klinisch: { stiftKonfektioniert: ['12'] } })
    expect(ohne.hinweise.some((h) => h.includes('Zahn 12') && h.includes('ohne geplante Krone'))).toBe(true)
  })

  it('1.4 gleichartig: Glasfaserstift adhäsiv mit GOZ 2180, 2195, 2197 statt BEMA 18a (Kompendium S. 113)', () => {
    const r = regel({ 11: 'ww' }, { klinisch: { stiftAdhaesiv: ['11'] } })
    expect(fz(r)).toEqual(expect.arrayContaining(['1.4 11', '1.1 11']))
    expect(['2180', '2195', '2197'].every((nr) => hat(r, 'GOZ', nr, '11'))).toBe(true)
    expect(hat(r, 'BEMA', '18a')).toBe(false)
    const doppelt = regel({ 11: 'ww' }, { klinisch: { stiftAdhaesiv: ['11'], stiftKonfektioniert: ['11'] } })
    expect(doppelt.befunde.filter((b) => b.nr === '1.4')).toHaveLength(1)
    expect(doppelt.hinweise.some((h) => h.includes('mehrere Stiftaufbauten'))).toBe(true)
  })

  it('1.4/1.5 nachträglich: Befund und Leistungen gekennzeichnet, im Formular unter „Nachträgliche Befunde“', () => {
    const r = regel({ 11: 'ww', 21: 'ww' }, { klinisch: { stiftKonfektioniert: ['11'], stiftGegossen: ['21'], stiftNachtraeglich: ['21'] } })
    expect(r.befunde.find((b) => b.nr === '1.5')?.nachtraeglich).toBe(true)
    expect(r.befunde.find((b) => b.nr === '1.4')?.nachtraeglich).toBeUndefined()
    expect(r.positionen.filter((p) => p.zahn === '21' && /^(18b|1050)$/.test(p.nr)).every((p) => p.nachtraeglich)).toBe(true)
    expect(regel({ 11: 'ww' }, { klinisch: { stiftNachtraeglich: ['11'] } }).hinweise.some((h) => h.includes('kein Stiftaufbau'))).toBe(true)
  })

  it('Stiftaufbau bei andersartiger Versorgung nach GOZ: 18a → 2195, 18b → 2190 + BEB 2001', () => {
    const p = planMit({ 14: 'ww', 15: 'f', 16: 'ww' }, { 14: 'T', 15: 'BM', 16: 'T' })
    p.klinisch = { ...p.klinisch, stiftKonfektioniert: ['14'], stiftGegossen: ['16'], stiftNachtraeglich: ['16'] }
    const r = therapieAnwenden(regelversorgungErmitteln(p.zaehne, regelOptionen(p)), p.zaehne, p)
    const an = (z: string) => r.positionen.filter((x) => x.zahn === z).map((x) => `${x.ebene} ${x.nr}`)
    expect(an('14')).toContain('GOZ 2195')
    expect(an('14')).not.toContain('BEMA 18a')
    expect(an('16')).toEqual(expect.arrayContaining(['GOZ 2190', 'BEB 2001']))
    expect(an('16')).not.toContain('BEL 1050')
    expect(r.positionen.filter((x) => x.zahn === '16' && /^(2190|2001)$/.test(x.nr)).every((x) => x.nachtraeglich)).toBe(true)
  })

  it('Abformung: Intraoralscan an einer Einzelkrone – GOZ 0065 mit Gegenkiefer, gedruckte Modelle statt Gips', () => {
    const rechne = (abformung: HkpPlan['abformung']) => {
      const p = { ...planMit({ 11: 'ww' }), abformung }
      return therapieAnwenden(regelversorgungErmitteln(p.zaehne, regelOptionen(p)), p.zaehne, p)
    }
    const an = (r: ReturnType<typeof rechne>) => r.positionen.map((x) => `${x.ebene} ${x.nr} ${x.zahn}`.trim())
    const abdruck = an(rechne('abdruck'))
    expect(abdruck).toEqual(expect.arrayContaining(['BEMA 20b 11', 'BEL 0051 OK', 'BEL 0010']))
    expect(abdruck.some((x) => x.startsWith('GOZ 0065'))).toBe(false)
    expect(an(rechne(''))).toEqual(abdruck)

    const scan = rechne('scan')
    expect(an(scan)).toEqual(expect.arrayContaining(['BEMA 20b 11', 'GOZ 0065 OK-Front', 'GOZ 0065 UK-Front', 'BEB 0009 OK', 'BEB 0009 UK']))
    expect(an(scan).some((x) => /^BEL (0051|0010)/.test(x))).toBe(false)
    expect(an(scan).some((x) => /^(BEL 0120|BEB 0402)$/.test(x))).toBe(false)
    expect(an(scan)).toEqual(expect.arrayContaining(['BEB 0007', 'BEB 0901', 'BEB 0902', 'BEB 0013 11', 'BEB 0017 11', 'BEB 0907 11']))
    expect(scan.hinweise.some((h) => h.startsWith('Intraoralscan'))).toBe(true)
  })

  it('Intraoralscan: digitaler Laborablauf mit BEB-Standardpositionen statt Mittelwertartikulator, nichts doppelt', () => {
    const rechne = (labor: HkpPlan['einstellungen']['labor'], abformung: HkpPlan['abformung'] = 'scan') => {
      const p = { ...planMit({ 11: 'ww', 14: 'f' }, { 14: 'SKM' }), abformung }
      p.einstellungen = { ...p.einstellungen, labor }
      return therapieAnwenden(regelversorgungErmitteln(p.zaehne, regelOptionen(p)), p.zaehne, p)
    }
    const an = (r: ReturnType<typeof rechne>) => r.positionen.map((x) => `${x.ebene} ${x.nr} ${x.zahn}`.trim())
    const digital = rechne('praxis')
    expect(an(digital)).toEqual(expect.arrayContaining([
      'BEB 0007', 'BEB 0901', 'BEB 0902', 'BEB 0903 OK',
      'BEB 0013 11', 'BEB 0017 11', 'BEB 0904 11', 'BEB 0905 11',
      'BEB 0907 11', 'BEB 0907 14', 'BEB 0911 11', 'BEB 0911 14',
      'BEB 0032 14', 'BEB 0906 14', 'BEB D104 14', 'BEB 0401',
    ]))
    expect(an(digital).some((x) => /^(BEL 0120|BEB 0402|BEB 0105|BEB D10[123])\b/.test(x))).toBe(false)
    expect(an(digital).filter((x) => /^BEB 00(13|17) 14$/.test(x))).toEqual([])
    expect(an(digital).filter((x) => x === 'BEB 0902')).toHaveLength(1)
    expect(digital.positionen.filter((x) => /^(09|00)/.test(x.nr) && x.ebene === 'BEB' && x.nr !== '0009' && x.nr !== '0018').every((x) => x.labor === 'eigen')).toBe(true)
    expect(digital.hinweise.some((h) => h.startsWith('Digitaler Ablauf nach Intraoralscan (Eigenlabor)'))).toBe(true)

    const fremd = rechne('gewerbe')
    expect(an(fremd)).toEqual(expect.arrayContaining(['BEB 0007', 'BEB 0013 11', 'BEB 0907 14', 'BEB 0032 14']))
    expect(an(fremd).some((x) => /^BEB D/.test(x))).toBe(false)
    expect(an(rechne('praxis', 'abdruck')).some((x) => /^BEB (D|0007|09\d\d|0013|0017|0032)/.test(x))).toBe(false)

    const p = { ...planMit({ 11: 'ww' }), abformung: 'scan' as const }
    p.einstellungen = { ...p.einstellungen, labor: 'praxis' as const }
    p.positionen = therapieAnwenden(regelversorgungErmitteln(p.zaehne, regelOptionen(p)), p.zaehne, p).positionen
    const e = berechnen(p, LISTEN)
    expect(e.positionen.filter((x) => x.ebene === 'BEB').every((x) => !x.fehler)).toBe(true)
    expect(e.positionen.find((x) => x.nr === '0907')).toMatchObject({ richtpreis: true, listenpreis: 28 })
    expect(e.hinweise.some((h) => h.text.includes('Richtpreis') && h.text.includes('0907'))).toBe(true)
  })

  it('Intraoralscan: Brücke mit Verbindern, Sintern nur bei Zirkon', () => {
    const p = { ...planMit({ 14: 'ww', 15: 'f', 16: 'ww' }, { 14: 'KM', 15: 'BM', 16: 'KM' }), abformung: 'scan' as const }
    p.positionen = therapieAnwenden(regelversorgungErmitteln(p.zaehne, regelOptionen(p)), p.zaehne, p).positionen
    const an = p.positionen.map((x) => `${x.ebene} ${x.nr} ${x.zahn}${x.anzahl > 1 ? ` ×${x.anzahl}` : ''}`)
    expect(an).toEqual(expect.arrayContaining(['BEB 0907 14', 'BEB 0907 16', 'BEB 0908 15', 'BEB 0910 16-14 ×2', 'BEB 0911 15', 'BEB 0032 15']))
    expect(an.filter((x) => /^BEB 0013/.test(x))).toEqual(['BEB 0013 14', 'BEB 0013 16'])

    const sintern = (w: HkpPlan['werkstoffe']) => berechnen({ ...p, werkstoffe: w }, LISTEN).positionen.filter((x) => x.nr === '0032').map((x) => x.zahn).sort()
    expect(sintern({})).toEqual(['14', '15', '16'])
    expect(sintern({ 14: 'lithiumdisilikat', 15: 'zirkon' })).toEqual(['15', '16'])
    expect(berechnen({ ...p, werkstoffe: { 14: 'lithiumdisilikat' } }, LISTEN).positionen.filter((x) => x.nr === '0906').length).toBe(3)
  })

  it('BEB-Standardpositionen: jede BEB-Liste wird ergänzt, vorhandene Preise bleiben', () => {
    const itz = LISTEN.beb!.eintraege
    const nr = (n: string) => itz.find((x) => x.nr === n)
    for (const n of ['0007', '0013', '0017', '0032', '0901', '0911', '2361', '2362', '2556', '2559', '3303', '3541', '3641']) expect(nr(n), n).toBeDefined()
    expect(nr('0007')?.text).toBe('Oralscan aufbereiten')
    expect(nr('0008')).toMatchObject({ text: 'Kontrollmodell', preis: 10.4 })
    expect(nr('2361')?.text).toContain('Vollzirkon')
    expect(nr('2362')).toMatchObject({ text: 'Brückenglied gegossen/gefräst Metall', preis: 98 })
    expect(nr('0723')).toMatchObject({ text: 'Zahnfarbenbestimmung im Labor', preis: 30 })
    expect(nr('0723')?.richtpreis).toBeUndefined()
    expect(new Set(itz.map((x) => x.nr)).size).toBe(itz.length)

    const eigene = bebErgaenzen({ eintraege: [{ nr: '901', text: 'CAD Auftrag', preis: 12 }, { nr: '2361', text: 'Brückenglied Keramik', preis: 140 }] })
    expect(eigene.eintraege.filter((x) => x.nr.padStart(4, '0') === '0901')).toEqual([{ nr: '901', text: 'CAD Auftrag', preis: 12 }])
    expect(eigene.eintraege.find((x) => x.nr === '2361')).toMatchObject({ preis: 140 })
    expect(eigene.eintraege).toHaveLength(BEB_STANDARD.length)
    expect(bebErgaenzen(eigene)).toBe(eigene)

    const b = { ...planMit({ 14: 'ww', 15: 'f', 16: 'ww' }, { 14: 'K', 15: 'B', 16: 'K' }), abformung: 'abdruck' as const }
    b.positionen = therapieAnwenden(regelversorgungErmitteln(b.zaehne, regelOptionen(b)), b.zaehne, b).positionen
    expect(berechnen(b, LISTEN).positionen.find((x) => x.zahn === '15' && x.ebene === 'BEB')).toMatchObject({ nr: '2362', einzelpreis: 98 })
  })

  it('Kombinationsarbeit: Teleskope 14/24 gescannt, zweite Abformung für die Prothese als Überabdruck oder zweiter Scan', () => {
    const rechne = (abformung: HkpPlan['abformung'], abformungProthese: HkpPlan['abformung'], luecken = ['15', '16', '17', '18', '25', '26', '27', '28']) => {
      const p = { ...planMit(fehlend(...luecken)), abformung, abformungProthese }
      return therapieAnwenden(regelversorgungErmitteln(p.zaehne, regelOptionen(p)), p.zaehne, p)
    }
    const scan0065 = (r: ReturnType<typeof rechne>) => r.positionen.filter((x) => x.ebene === 'GOZ' && x.nr === '0065').map((x) => x.zahn).sort()

    const ueber = rechne('scan', 'abdruck')
    expect(hat(ueber, 'BEMA', '91d', '14')).toBe(true)
    expect(scan0065(ueber)).toEqual(['OK links', 'OK rechts', 'UK links', 'UK rechts'])
    expect(hat(ueber, 'BEMA', '98a', 'OK') && hat(ueber, 'BEL', '0211', 'OK')).toBe(true)
    expect(ueber.hinweise.some((h) => h.includes('Überabdruck mit individuellem Löffel'))).toBe(true)

    const zweimal = rechne('scan', 'scan')
    expect(scan0065(zweimal)).toEqual(['OK links', 'OK links', 'OK rechts', 'OK rechts', 'OK-Front', 'UK links', 'UK rechts'])
    expect(zweimal.positionen.filter((x) => x.ebene === 'BEB' && x.nr === '0009' && x.zahn === 'OK')).toHaveLength(2)
    expect(hat(zweimal, 'BEMA', '98a', 'OK')).toBe(false)

    const offen = rechne('scan', '')
    expect(hat(offen, 'BEMA', '98a', 'OK')).toBe(false)
    expect(offen.hinweise.some((h) => h.includes('zweite Abformung (Scan oder Überabdruck) noch offen'))).toBe(true)
    expect(rechne('abdruck', '').positionen.some((x) => x.nr === '0065' || x.nr === '98a')).toBe(false)
    expect(scan0065(rechne('abdruck', 'scan'))).toEqual(['OK links', 'OK rechts', 'OK-Front'])

    const restzahn = rechne('scan', 'abdruck', ['18', '17', '16', '15', '14', '12', '11', '21', '22', '24', '25', '26', '27', '28'])
    expect(hat(restzahn, 'BEMA', '98b', 'OK') && !hat(restzahn, 'BEMA', '98a', 'OK')).toBe(true)
    expect(restzahn.hinweise.some((h) => h.includes('Funktionsabformung') && h.includes('enthalten'))).toBe(true)
  })

  it('Totalprothese mit Intraoralscan: GOZ 0065 für den Kiefer, gedrucktes Modell statt Situationsmodell, Funktionsabformung bleibt', () => {
    const ok = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
    const rechne = (abformung: HkpPlan['abformung'], abformungProthese: HkpPlan['abformung'] = '') => {
      const p = { ...planMit(fehlend(...ok)), abformung, abformungProthese }
      return therapieAnwenden(regelversorgungErmitteln(p.zaehne, regelOptionen(p)), p.zaehne, p)
    }
    const modelle = (r: ReturnType<typeof rechne>) => r.positionen.filter((x) => x.ebene === 'BEL' && x.nr === '0010' && x.zahn === 'OK').reduce((s, x) => s + (x.anzahl ?? 1), 0)
    const abdruck = rechne('abdruck')
    expect(abdruck.positionen.some((x) => x.nr === '0065' || (x.ebene === 'BEB' && x.nr === '0009'))).toBe(false)
    expect(modelle(abdruck)).toBe(2)

    for (const scan of [rechne('scan'), rechne('abdruck', 'scan')]) {
      expect(scan.positionen.filter((x) => x.ebene === 'GOZ' && x.nr === '0065').map((x) => x.zahn).sort()).toEqual(['OK links', 'OK rechts', 'OK-Front'])
      expect(scan.positionen.filter((x) => x.ebene === 'BEB' && x.nr === '0009' && x.zahn === 'OK')).toHaveLength(1)
      expect(modelle(scan)).toBe(1)
      expect(hat(scan, 'BEMA', '98b', 'OK') && hat(scan, 'BEL', '0211', 'OK')).toBe(true)
      expect(scan.hinweise.some((h) => h.includes('zahnlos') && h.includes('Intraoralscan'))).toBe(true)
      expect(scan.hinweise.some((h) => h.includes('noch offen'))).toBe(false)
    }
  })

  it('Abformung: Scan bei Implantatkrone ohne doppelte 0065, Abdruck mit Löffelwahl; Zusatz-Regler setzt bei Abdruck kein 0065', () => {
    const p = { ...planMit({ 14: 'ww', 36: 'x' }, { 36: 'SKM' }), abformung: 'scan' as const }
    const r = therapieAnwenden(regelversorgungErmitteln(p.zaehne, regelOptionen(p)), p.zaehne, p)
    const scan0065 = r.positionen.filter((x) => x.nr === '0065').map((x) => x.zahn).sort()
    expect(scan0065).toEqual(['OK rechts', 'UK links', 'UK rechts'].concat(['OK links']).sort())
    expect(new Set(scan0065).size).toBe(scan0065.length)
    expect(r.positionen.filter((x) => x.ebene === 'BEB' && x.nr === '0009').map((x) => x.zahn).sort()).toEqual(['OK', 'UK'])

    const offen = { ...p, abformung: 'abdruck' as const, implantat: { ...p.implantat, abformung: 'offen' as const } }
    const r2 = therapieAnwenden(regelversorgungErmitteln(offen.zaehne, regelOptionen(offen)), offen.zaehne, offen)
    expect(r2.positionen.some((x) => x.nr === '0065')).toBe(false)
    expect(r2.positionen.some((x) => x.ebene === 'GOZ' && x.nr === '5170')).toBe(true)

    const z: HkpPlan = { ...planMit({ 11: 'ww' }), abformung: 'abdruck' }
    z.positionen = [pos('BEMA', '20b', { zahn: '11' })]
    z.einstellungen.gozZusatzStufe = 3
    expect(berechnen(z, LISTEN).positionen.some((x) => x.nr === '0065')).toBe(false)
    z.abformung = ''
    expect(berechnen(z, LISTEN).positionen.some((x) => x.nr === '0065')).toBe(true)
  })

  it('nachträgliche Leistungen: BEMA bei Kassenkrone, GOZ bei Privatkrone; bleiben beim Neuberechnen erhalten', () => {
    const kasse = { positionen: [pos('BEMA', '20b', { zahn: '11' })], einstellungen: leererPlan().einstellungen }
    expect(nachtraeglichePositionen('krone-entfernen', '11', kasse).map((x) => `${x.ebene} ${x.nr}`)).toEqual(['BEMA 23'])
    const privat = { ...kasse, positionen: [pos('GOZ', '2210', { zahn: '11' })] }
    const goz = nachtraeglichePositionen('krone-entfernen', '11', privat)
    expect(goz.map((x) => `${x.ebene} ${x.nr} ${x.faktor}`)).toEqual(['GOZ 2290 2.3'])
    expect(goz[0].nachtraeglich).toBe(true)
    expect(nachtraeglichePositionen('wurzelstift-entfernen', '11', kasse).map((x) => x.nr)).toEqual(['2300'])

    const p = planMit({ 11: 'ww' })
    const r = regelversorgungErmitteln(p.zaehne)
    const mit = { ...p, positionen: nachtraeglichePositionen('krone-entfernen', '11', p) }
    expect(regelUebernehmen(mit, r).positionen.filter((x) => x.nachtraeglich).map((x) => x.nr)).toEqual(['23'])
  })

  it('2.6: disparalleler Pfeiler je Lücke mit BEMA 91e', () => {
    const r = regel({ 45: 'ww', 46: 'f', 47: 'ww' }, { klinisch: { disparallel: ['45'] } })
    expect(fz(r)).toContain('2.6 47-45')
    expect(hat(r, 'BEMA', '91e', '45')).toBe(true)
    expect(regel({ 16: 'ww' }, { klinisch: { disparallel: ['16'] } }).hinweise.some((h) => h.includes('kein Brückenanker'))).toBe(true)
  })

  it('4.5 und 4.9 nur bei Total-/Deckprothese', () => {
    const zahnlosUK = Object.fromEntries(UNTERKIEFER.map((z) => [z, 'f']))
    const r = regel(zahnlosUK, { klinisch: { metallbasisUK: true, stuetzstift: true } })
    expect(fz(r)).toEqual(expect.arrayContaining(['4.4 UK', '4.5 UK', '4.9 UK']))
    expect(hat(r, 'BEMA', '98e', 'UK') && hat(r, 'BEMA', '98d', 'UK')).toBe(true)
    const modellguss = regel(fehlend('35', '36', '37', '45', '46', '47'), { klinisch: { metallbasisUK: true } })
    expect(fz(modellguss)).not.toContain('4.5 UK')
    expect(modellguss.hinweise.some((h) => h.includes('nicht bei Modellguss'))).toBe(true)
  })

  it('4.8: Wurzelstiftkappe mit BEMA 90 und BEL 1013', () => {
    const r = regel({ ...Object.fromEntries(UNTERKIEFER.map((z) => [z, 'f'])), 33: 'rw', 43: '' })
    expect(fz(r)).toContain('4.8 33')
    expect(hat(r, 'BEMA', '90', '33') && hat(r, 'BEL', '1013', '33')).toBe(true)
  })

  it('6.10: erneuerungsbedürftiges Sekundärteleskop (t2w) mit 4.7 im Verblendbereich', () => {
    const uk = Object.fromEntries(UNTERKIEFER.map((z) => [z, 'e']))
    const r = regel({ ...uk, 33: 't2w', 43: 't2w' })
    expect(fz(r)).toEqual(['4.7 33', '4.7 43', '6.10 33', '6.10 43', '6.3 UK'])
    expect(r.R['33']).toBe('T2V')
    expect(hat(r, 'BEMA', '91d', '33') && hat(r, 'BEMA', '100b', 'UK')).toBe(true)
    expect(hat(r, 'BEMA', '7b')).toBe(false)
    expect(kombinationenPruefen(r.befunde)).toEqual([])
  })

  it('7.5 mit GOZ/BEB-Vorschlag, 7.6 je Konnektor bei Atrophie', () => {
    const ok = Object.fromEntries(OBERKIEFER.map((z) => [z, 'sew']))
    for (const z of ['14', '12', '22', '24']) ok[z] = 'sow'
    const r = regel(ok, { klinisch: { atrophieOK: true } })
    expect(fz(r)).toEqual(expect.arrayContaining(['7.5 OK', '7.6 OK ×4']))
    expect(hat(r, 'GOZ', '5220', 'OK') && hat(r, 'GOZ', '5180', 'OK')).toBe(true)
    expect(r.positionen.find((p) => p.nr === '5090')?.anzahl).toBe(4)
    expect(regel(ok).befunde.some((b) => b.nr === '7.6')).toBe(false)
  })

  it('Wiederherstellungen: Befund, Leistungen und Anzahl je Art', () => {
    const r = regel({}, {
      reparaturen: [
        { id: 'a', art: '6.4', gebiet: '46, 47, 45' },
        { id: 'b', art: '6.8-bruecke', gebiet: '13,16' },
        { id: 'c', art: '6.7', gebiet: 'UK' },
        { id: 'd', art: '7.4', gebiet: '36' },
      ],
    })
    expect(fz(r)).toEqual(['6.4 47,46,45', '6.4.1 47,46,45 ×2', '6.7 UK', '6.8 16,13 ×2', '7.4 36'])
    expect(hat(r, 'BEMA', '100b') && hat(r, 'BEMA', '95a') && hat(r, 'BEMA', '100f', 'UK') && hat(r, 'GOZ', '2310', '36')).toBe(true)
    expect(r.positionen.find((p) => p.nr === '8023')?.anzahl).toBe(3)
    expect(hat(r, 'BEMA', '7b')).toBe(false)
    expect(r.hinweise).not.toContain('Aus Zeile B ergibt sich kein Versorgungsbedarf.')
    expect(regel({}, { reparaturen: [{ id: 'x', art: '6.2', gebiet: '' }] }).hinweise.some((h) => h.includes('Kiefer (OK/UK)'))).toBe(true)
  })

  it('alle Nummern der Wiederherstellungen stehen in den Listen', () => {
    const liste = { BEMA: LISTEN.bema!, GOZ: LISTEN.goz!, BEL: LISTEN.bel!, BEB: LISTEN.beb! } as Record<string, Preisliste>
    for (const a of REPARATUR_ARTEN) {
      for (const [ebene, nr] of [...a.honorar(2, 'OK'), ...a.honorar(2, 'UK'), ...a.labor(2)]) {
        expect((liste[ebene].eintraege as { nr: string }[]).some((e) => e.nr === nr), `${a.id}: ${ebene} ${nr}`).toBe(true)
      }
      for (const [nr] of a.befunde(2)) expect(LISTEN.fz!.eintraege.some((e) => e.nr === nr), `${a.id}: FZ ${nr}`).toBe(true)
    }
  })
})

describe('Implantatprothetik', () => {
  const rechnen = (implantat: Partial<HkpPlan['implantat']>, labor: 'gewerbe' | 'praxis' = 'gewerbe') => {
    const p = planMit({ 14: 'ww', 15: 'f', 16: 'ww' })
    p.zaehne['15'].TP = 'SKM'
    p.implantat = { ...p.implantat, ...implantat }
    p.einstellungen.labor = labor
    return therapieAnwenden(regelversorgungErmitteln(p.zaehne), p.zaehne, p)
  }
  const liste = (r: ReturnType<typeof rechnen>) => r.positionen.filter((x) => x.id.startsWith('impl-'))
  const nrn = (r: ReturnType<typeof rechnen>) => liste(r).filter((x) => x.ebene !== 'MAT').map((x) => `${x.ebene} ${x.nr} ${x.zahn}`)
  const teile = (r: ReturnType<typeof rechnen>) => liste(r).filter((x) => x.ebene === 'MAT').map((x) => x.text?.split(': ')[1])

  it('Intraoralscan: 9050 ×2, 0065 Implantat- und Gegenkiefer, Scanbody und digitales Analog', () => {
    const r = rechnen({ abformung: 'scan' })
    expect(liste(r).find((x) => x.nr === '9050')).toMatchObject({ zahn: '15', anzahl: 2 })
    expect(nrn(r)).toEqual(expect.arrayContaining(['GOZ 0065 OK rechts', 'GOZ 0065 UK rechts', 'BEB 0009 OK', 'BEB 0018 OK', 'BEB 0224 15', 'BEB 0223 OK rechts', 'BEB 4421 15']))
    expect(nrn(r)).not.toContain('GOZ 5170 OK')
    expect(teile(r)).toEqual(['Scanbody', 'Laboranalog', 'Abutment konfektioniert (Titan)'])
    expect(liste(r).filter((x) => x.ebene === 'MAT').every((x) => x.labor === 'fremd' && (x.preis ?? 0) > 0)).toBe(true)
  })

  it('offener Löffel: individueller Löffel, GOZ 5170, Abformpfosten; individuelles Abutment auf Ti-Base', () => {
    const r = rechnen({ abformung: 'offen', abutment: 'individuell' }, 'praxis')
    expect(nrn(r)).toEqual(expect.arrayContaining(['GOZ 5170 OK', 'BEB 1108 OK', 'BEB 0225 15', 'BEB 2033 15']))
    expect(nrn(r).some((x) => x.includes('0065'))).toBe(false)
    expect(teile(r)).toEqual(['Abformpfosten', 'Laboranalog', 'Klebebasis / Ti-Base', 'Prothetikschraube'])
    expect(liste(r).filter((x) => x.ebene === 'MAT').every((x) => x.labor === undefined)).toBe(true)
  })

  it('ohne gewählte Abformung: Hinweis statt Abformleistungen', () => {
    const r = rechnen({ abformung: '' })
    expect(r.hinweise.some((h) => h.includes('Abformung') && h.includes('noch nicht festgelegt'))).toBe(true)
    expect(nrn(r).some((x) => /0065|5170|0224|0225/.test(x))).toBe(false)
    expect(nrn(r)).toContain('GOZ 9050 15')
  })

  it('Materialkatalog: plausible Preise, alle Nummern in den Listen', () => {
    for (const s of IMPLANTATSYSTEME) {
      for (const v of Object.values(s.preise)) expect(v, s.id).toBeGreaterThan(0)
      expect(s.preise.abutmentStandard, s.id).toBeGreaterThan(s.preise.schraube)
    }
    expect(new Set(IMPLANTATSYSTEME.map((s) => s.id)).size).toBe(IMPLANTATSYSTEME.length)
    for (const a of ['scan', 'offen', 'geschlossen'] as const) for (const b of ['standard', 'individuell', 'keramik'] as const) {
      for (const x of liste(rechnen({ abformung: a, abutment: b })).filter((y) => y.ebene !== 'MAT')) {
        const l = x.ebene === 'GOZ' ? LISTEN.goz! : LISTEN.beb!
        expect((l.eintraege as { nr: string }[]).some((e) => e.nr === x.nr), `${x.ebene} ${x.nr}`).toBe(true)
      }
    }
  })
})

describe('Positionssuche', () => {
  it('findet Kürzel als Leistungspaket, auch klein geschrieben', () => {
    const v = vorschlaege('skm', LISTEN)
    expect(v[0].titel).toBe('SKM')
    expect(v[0].positionen.map((p) => `${p.ebene} ${p.nr}${p.anzahl ? ` ×${p.anzahl}` : ''}`)).toEqual(['GOZ 2200', 'GOZ 9050 ×2', 'BEB 2281', 'BEB 2612'])
    expect(v.some((x) => x.titel === 'SKM als Brückenanker' && x.positionen[0].nr === '5000' && x.positionen.some((p) => p.nr === '9050' && p.anzahl === 2))).toBe(true)
    expect(v.some((x) => x.titel === 'SKMO')).toBe(true)
    expect(vorschlaege('KM', LISTEN)[0].positionen.some((p) => p.nr === '9050')).toBe(false)
    expect(vorschlaege('9050', LISTEN)[0].positionen).toEqual([{ ebene: 'GOZ', nr: '9050', anzahl: 2 }])
  })

  it('GOZ 9050: Warnung über 3× je Implantat, Hinweis wenn sie am Implantat fehlt', () => {
    const p = planMit({ 36: 'x' }, { 36: 'SKM' })
    p.positionen = [pos('GOZ', '2200', { zahn: '36' })]
    expect(berechnen(p, LISTEN).hinweise.some((h) => h.text.includes('GOZ 9050 fehlt an Implantat 36'))).toBe(true)
    p.positionen.push(pos('GOZ', '9050', { id: 'x', zahn: '36', anzahl: 4 }))
    expect(berechnen(p, LISTEN).hinweise.some((h) => h.stufe === 'warnung' && h.text.includes('höchstens dreimal'))).toBe(true)
  })

  it('findet Einzelpositionen über Nummer und Text', () => {
    expect(vorschlaege('2200', LISTEN)[0].titel).toBe('GOZ 2200')
    const t = vorschlaege('teleskop', LISTEN)
    expect(t.some((x) => x.art === 'kuerzel' && x.titel === 'T')).toBe(true)
    expect(t.some((x) => x.titel === 'BEB 3001')).toBe(true)
  })

  it('alle Privatleistungen des Eigenlabor-Reglers stehen in der BEB-Liste', () => {
    for (const x of PRIVAT_EXTRAS) expect(LISTEN.beb!.eintraege.some((e) => e.nr === x.nr), `BEB ${x.nr}`).toBe(true)
  })

  it('jedes Therapiekürzel mit Zuordnung hat existierende Listenpositionen', () => {
    for (const [k, z] of Object.entries(TP_ZUORDNUNG)) {
      if (z.goz) expect(LISTEN.goz!.eintraege.some((e) => e.nr === z.goz), `${k} GOZ ${z.goz}`).toBe(true)
      for (const b of z.beb) expect(LISTEN.beb!.eintraege.some((e) => e.nr === b), `${k} BEB ${b}`).toBe(true)
    }
  })
})

describe('Eigenlabor „Kasse → Privat“', () => {
  function berechnet(labor: 'praxis' | 'gewerbe') {
    const p = planMit({ 16: 'ww', 36: 'ww' })
    p.einstellungen.labor = labor
    return regelUebernehmen(p, therapieAnwenden(regelversorgungErmitteln(p.zaehne), p.zaehne))
  }
  const lab = (p: HkpPlan, z: string) => p.positionen.filter((x) => (x.ebene === 'BEL' || x.ebene === 'BEB') && x.zahn === z).map((x) => `${x.ebene} ${x.nr}`).sort()

  it('wertet Eigenlabor-Kronen stufenweise auf, Zahnschema und Festzuschuss bleiben', () => {
    const p0 = berechnet('praxis')
    expect(privatKandidaten(p0)).toEqual(['16', '36'])
    const e0 = berechnen(p0, LISTEN)
    const p1 = privatStufeAnwenden(p0, 1).plan
    expect(p1.zaehne).toEqual(p0.zaehne)
    expect(lab(p1, '16')).toEqual(['BEB 2121', 'BEB 2611'])
    const am16 = p1.positionen.filter((x) => x.zahn === '16' && (x.ebene === 'BEMA' || x.ebene === 'GOZ')).map((x) => `${x.ebene} ${x.nr}`).sort()
    expect(am16).toEqual(['BEMA 19', 'GOZ 2210'])
    const p2 = privatStufeAnwenden(p1, 2).plan
    expect(p2.zaehne).toEqual(p0.zaehne)
    expect(lab(p2, '36')).toEqual(['BEB 0029', 'BEB 2281', 'BEB 2612'])
    const p4 = privatStufeAnwenden(p2, 4).plan
    expect(p4.positionen.filter((x) => x.ebene === 'BEB').every((x) => laborVon(x, p4) === 'eigen')).toBe(true)
    expect(p4.positionen.some((x) => x.nr === '0833' && x.zahn === '16')).toBe(true)
    const e = [p1, p2, p4].map((p) => berechnen(p, LISTEN))
    expect(e.map((x) => x.versorgungsart)).toEqual(['gleichartig', 'gleichartig', 'gleichartig'])
    for (const x of e) expect(x.summen.kassenanteil).toBe(e0.summen.kassenanteil)
    const labore = [e0, ...e].map((x) => x.summen.eigenNetto)
    expect([...labore].sort((a, b) => a - b)).toEqual(labore)
    expect(new Set(labore).size).toBe(4)
  })

  it('stellt die Kassenversorgung beim Zurückschieben wieder her', () => {
    const p0 = berechnet('praxis')
    const zurueck = privatStufeAnwenden(privatStufeAnwenden(p0, 3).plan, 0).plan
    expect(zurueck.zaehne['16'].TP).toBe('')
    expect(lab(zurueck, '16')).toEqual(lab(p0, '16'))
    expect(zurueck.positionen.some((x) => x.id.startsWith('aufw-'))).toBe(false)
    expect(berechnen(zurueck, LISTEN).summen.gesamt).toBe(berechnen(p0, LISTEN).summen.gesamt)
  })

  const plane = (befund: Record<string, string>) => {
    const p = planMit(befund)
    p.einstellungen.labor = 'praxis'
    return regelUebernehmen(p, therapieAnwenden(regelversorgungErmitteln(p.zaehne), p.zaehne))
  }
  const extras = (p: HkpPlan) => p.positionen.filter((x) => x.id.startsWith('aufw-')).map((x) => `${x.nr} ${x.zahn}`.trim()).sort()

  it('setzt zur Brücke passende Privatleistungen (Papille, Wurzelpontic nur Front)', () => {
    const p = plane({ 11: 'f', 12: 'ww', 21: 'ww', 25: 'f', 24: 'ww', 26: 'ww' })
    const p3 = privatStufeAnwenden(p, 3).plan
    expect(extras(p3)).toEqual(expect.arrayContaining(['2676 11', '2676 25', '2951 11', '0723', '0404']))
    expect(extras(p3)).not.toContain('2678 11')
    const p4 = privatStufeAnwenden(p3, 4).plan
    expect(extras(p4)).toEqual(expect.arrayContaining(['2678 11', '0724', '0522', '0833 12']))
    expect(extras(p4)).not.toContain('2678 25')
    expect(extras(p4)).not.toContain('0723')
  })

  it('wertet Implantatkronen auf: SKV → SKM, Abutment, Zahnfleischmaske', () => {
    const p = plane({ 36: 'skw' })
    expect(privatKandidaten(p)).toEqual(['36'])
    const bebs = (q: typeof p) => q.positionen.filter((x) => x.ebene === 'BEB').map((x) => `${x.nr} ${x.zahn}`)
    const p1 = privatStufeAnwenden(p, 1).plan
    expect(p1.zaehne['36'].TP).toBe('')
    expect(bebs(p1)).toEqual(expect.arrayContaining(['2121 36', '2611 36']))
    expect(bebs(p1)).not.toContain('2101 36')
    expect(p1.positionen.filter((x) => x.ebene === 'GOZ' && x.nr === '2200' && x.zahn === '36')).toHaveLength(1)
    const p3 = privatStufeAnwenden(p, 3).plan
    expect(p3.zaehne['36'].TP).toBe('')
    expect(bebs(p3)).toEqual(expect.arrayContaining(['2281 36', '2612 36', '2033 36', '0223 UK links']))
    expect(bebs(p3)).not.toContain('4421 36')
    expect(extras(p3)).not.toContain('2033 36')
    const p4 = privatStufeAnwenden(p3, 4).plan
    expect(bebs(p4)).toContain('6906 36')
    expect(bebs(p4)).not.toContain('2033 36')
    expect(privatStufeAnwenden(p4, 0).plan.positionen.some((x) => x.nr === '4421' && x.zahn === '36')).toBe(true)
  })

  it('wertet eine Eigenlabor-Prothese mit passenden Kunststoff-Leistungen auf', () => {
    const p = plane(fehlend('35', '36', '37', '45', '46', '47'))
    expect(privatProthesen(p).UK.length).toBeGreaterThan(0)
    expect(extras(privatStufeAnwenden(p, 2).plan)).toEqual([])
    const p4 = privatStufeAnwenden(p, 4).plan
    expect(extras(p4)).toEqual(expect.arrayContaining(['6121 UK', '6412 UK', '0731 UK', '2909 36']))
    const e = berechnen(p4, LISTEN)
    expect(e.versorgungsart).toBe('gleichartig')
    expect(e.summen.kassenanteil).toBe(berechnen(p, LISTEN).summen.kassenanteil)
  })

  it('bietet Prothesen-Extras nur für tatsächlich geplante Prothesenzähne an', () => {
    const geplant = (befund: Record<string, string>, tp: Record<string, string>, abformung: HkpPlan['implantat']['abformung'] = 'scan') => {
      const p = planMit(befund, tp)
      p.einstellungen.labor = 'praxis'
      p.implantat.abformung = abformung
      return regelUebernehmen(p, therapieAnwenden(regelversorgungErmitteln(p.zaehne), p.zaehne, p))
    }
    const bruecken = geplant(fehlend('18', '17', '16', '15', '14', '24', '25', '26', '27', '28'), { 17: 'SKM', 16: 'SBM', 15: 'SBM', 14: 'SKM', 24: 'SKM', 25: 'SBM', 26: 'SBM', 27: 'SKM' })
    expect(privatProthesen(bruecken)).toEqual({ OK: [], UK: [] })
    expect(extras(privatStufeAnwenden(bruecken, 4).plan).filter((x) => /^(6121|6412|0731) /.test(x))).toEqual([])
    const einseitig = geplant(fehlend('36', '37', '38', '46', '47', '48'), { 46: 'SKM', 36: 'E', 37: 'E' }, 'geschlossen')
    expect(privatProthesen(einseitig).UK).toEqual(['36', '37'])
  })

  it('abgewählte Privatleistungen bleiben beim Verschieben des Reglers weg', () => {
    const p = privatStufeAnwenden(plane({ 16: 'ww' }), 3).plan
    p.einstellungen.eigenPrivatAus = ['aufw-2951-16']
    const p4 = privatStufeAnwenden(p, 4).plan
    expect(extras(p4)).not.toContain('2951 16')
    expect(extras(p4)).toContain('0833 16')
  })

  it('lässt Fremdlabor-Zähne und eigene TP-Kürzel unberührt', () => {
    const p0 = berechnet('gewerbe')
    p0.positionen = p0.positionen.map((x) => (x.ebene === 'BEL' && x.zahn === '36' ? { ...x, labor: 'eigen' as const } : x))
    p0.zaehne['16'].TP = ''
    expect(privatKandidaten(p0)).toEqual(['36'])
    const p2 = privatStufeAnwenden(p0, 2).plan
    expect(p2.zaehne['16'].TP).toBe('')
    expect(p2.zaehne['36'].TP).toBe('')
    expect(lab(p2, '36')).toEqual(['BEB 0029', 'BEB 2281', 'BEB 2612'])
    expect(lab(p2, '16')).toEqual(['BEL 1021'])
    const mitTp = { ...p0, zaehne: { ...p0.zaehne, 36: { ...p0.zaehne['36'], TP: 'KV' } } }
    expect(privatKandidaten(mitTp)).toEqual([])
    expect(privatStufeAnwenden(mitTp, 2).plan.zaehne['36'].TP).toBe('KV')
  })

  it('fügt keine Kronen hinzu: Implantat statt Brücke, gesunde Nachbarzähne bleiben unversorgt', () => {
    const p = plane({ 15: 'f' })
    p.zaehne['15'].TP = 'SKM'
    const q = regelUebernehmen(p, therapieAnwenden(regelversorgungErmitteln(p.zaehne), p.zaehne, p))
    for (const stufe of [0, 1, 2, 3, 4]) {
      const r = privatStufeAnwenden(q, stufe).plan
      expect(r.zaehne).toEqual(q.zaehne)
      expect(r.positionen.filter((x) => x.zahn === '14' || x.zahn === '16'), `Stufe ${stufe}`).toEqual([])
    }
  })

  it('nimmt früher vom Regler gesetzte TP-Kürzel zurück', () => {
    const p0 = berechnet('praxis')
    const alt = { ...p0, zaehne: { ...p0.zaehne, 16: { ...p0.zaehne['16'], TP: 'KM' } }, einstellungen: { ...p0.einstellungen, eigenPrivatStufe: 2, eigenPrivatTp: { 16: 'KM' } } }
    const r = privatStufeAnwenden(alt, 2).plan
    expect(r.zaehne['16'].TP).toBe('')
    expect(r.einstellungen.eigenPrivatTp).toEqual({})
    expect(lab(r, '16')).toEqual(['BEB 0029', 'BEB 2281', 'BEB 2612'])
  })
})

describe('Therapieplanung nach den Berechnungsbeispielen des Kompendiums', () => {
  const planen = (befund: Record<string, string>, tp: Record<string, string>) => {
    const p = planMit(befund, tp)
    const r = therapieAnwenden(regelversorgungErmitteln(p.zaehne), p.zaehne, p)
    return { r, plan: regelUebernehmen(p, r) }
  }
  const leist = (r: { positionen: Position[] }, ebene: string) =>
    r.positionen.filter((x) => x.ebene === ebene).map((x) => [x.nr, x.zahn, x.anzahl > 1 ? `×${x.anzahl}` : ''].filter(Boolean).join(' ')).sort()
  const ukFreiend = fehlend('34', '35', '36', '37', '38', '44', '45', '46', '47', '48')

  it('3.1 Modellguss: ohne 98a, fehlender 8er am Freiende zählt für BEMA 96', () => {
    const r = regelversorgungErmitteln(planMit({ ...ukFreiend }).zaehne)
    expect(r.R['38']).toBe('E')
    expect(leist(r, 'BEMA')).toEqual(expect.arrayContaining(['96c UK', '98g UK']))
    expect(leist(r, 'BEMA').some((x) => x.startsWith('98a'))).toBe(false)
  })

  it('Kombinationszahnersatz mit Geschieben (S. 118): 5010 + 5080 statt Teleskop, Rest BEMA', () => {
    const { r, plan } = planen({ 32: 'ww', 42: 'ww', ...ukFreiend }, { 33: 'KVO', 43: 'KVO' })
    expect(leist(r, 'GOZ')).toEqual(['5010 33', '5010 43', '5080 33', '5080 43'])
    expect(leist(r, 'BEMA')).toEqual(['19 32', '19 33', '19 42', '19 43', '20b 32', '20b 42', '7b', '96c UK', '98g UK'])
    expect(leist(r, 'BEL').some((x) => /^(1200|1620) (33|43)/.test(x))).toBe(false)
    expect(leist(r, 'BEB')).toEqual(expect.arrayContaining(['3023 33', '3023 43', '2121 33', '2611 43']))
    expect(nrs(r.befunde)).toEqual(['1.1', '1.1', '1.3', '1.3', '3.1', '3.2', '3.2', '4.7', '4.7'])
    expect(berechnen(plan, LISTEN).versorgungsart).toBe('gleichartig')
  })

  it('verblockte Kronen 33–43 mit distalen Geschieben und Geschiebeprothese', () => {
    const front = Object.fromEntries(['33', '32', '31', '41', '42', '43'].map((z) => [z, 'ww']))
    const { r, plan } = planen({ ...front, ...ukFreiend }, { 33: 'KVO', 43: 'KVO' })
    expect(leist(r, 'GOZ')).toEqual(['5010 33', '5010 43', '5080 33', '5080 43'])
    for (const z of ['32', '31', '41', '42']) expect(leist(r, 'BEMA')).toEqual(expect.arrayContaining([`20b ${z}`, `19 ${z}`]))
    expect(leist(r, 'BEMA').filter((x) => /^(91d|98a|98h)/.test(x))).toEqual([])
    expect(leist(r, 'BEL')).toEqual(expect.arrayContaining(['1024 31', '1620 31', '3030 UK ×10']))
    expect(berechnen(plan, LISTEN).versorgungsart).toBe('gleichartig')
  })

  it('Implantat statt Brückenglied (S. 141): Anker entfallen, GOZ 2200 + 2270, Festzuschuss 2.1/2.7', () => {
    const { r, plan } = planen({ 15: 'f' }, { 15: 'SKM' })
    expect(r.positionen.filter((x) => x.zahn === '14' || x.zahn === '16')).toEqual([])
    expect(leist(r, 'GOZ').filter((x) => !x.startsWith('9050') && !x.startsWith('0065'))).toEqual(['2200 15', '2270 15'])
    expect(leist(r, 'BEMA')).toEqual(['7b'])
    expect(leist(r, 'BEL').filter((x) => x !== '9330 ×2')).toEqual([])
    expect(nrs(r.befunde)).toEqual(['2.1', '2.7'])
    expect(r.hinweise.some((h) => h.includes('Ausnahmefall nach Nr. 36 a)'))).toBe(true)
    expect(berechnen(plan, LISTEN).versorgungsart).toBe('andersartig')
    const mitKronen = planen({ 14: 'ww', 15: 'f', 16: 'ww' }, { 15: 'SKM' }).r
    expect(leist(mitKronen, 'BEMA')).toEqual(['19 14', '19 16', '20a 16', '20b 14', '7b'])
  })

  it('Implantate statt Freiendprothese (S. 142): Prothese entfällt, Halteelemente auch', () => {
    const { r } = planen(fehlend('36', '37', '38', '46', '47', '48'), { 36: 'SKM', 46: 'SKM' })
    expect(leist(r, 'BEMA')).toEqual(['7b'])
    expect(leist(r, 'BEL').filter((x) => x !== '9330 ×2')).toEqual([])
    expect(leist(r, 'GOZ').filter((x) => /^(2200|2270)/.test(x))).toEqual(['2200 36', '2200 46', '2270 36', '2270 46'])
    expect(nrs(r.befunde)).toEqual(['3.1'])
    expect(r.hinweise.some((h) => h.includes('festsitzende Versorgung statt Prothese'))).toBe(true)
  })

  it('Freiend beidseits: rechts Implantat, links Prothese – Regelprothese bleibt, neu gezählt (Mischfall)', () => {
    const { r, plan } = planen(fehlend('36', '37', '38', '46', '47', '48'), { 46: 'SKM', 36: 'E', 37: 'E' })
    expect(leist(r, 'BEMA')).toEqual(['7b', '96a UK', '98g UK', '98h/2 UK'])
    expect(leist(r, 'BEL')).toEqual(expect.arrayContaining(['3030 UK ×2', '3620 UK ×2']))
    expect(leist(r, 'GOZ').filter((x) => /^(2200|2270)/.test(x))).toEqual(['2200 46', '2270 46'])
    expect(r.hinweise.some((h) => h.includes('48, 47, 38 werden nicht ersetzt'))).toBe(true)
    expect(berechnen(plan, LISTEN).versorgungsart).toBe('andersartig')
  })

  it('implantatgetragene Brücken bei Freiendsituationen (S. 143)', () => {
    const { r } = planen(fehlend('18', '17', '16', '15', '14', '24', '25', '26', '27', '28'), { 17: 'SKM', 16: 'SBM', 15: 'SBM', 14: 'SKM', 24: 'SKM', 25: 'SBM', 26: 'SBM', 27: 'SKM' })
    expect(leist(r, 'GOZ').filter((x) => !x.startsWith('9050') && !x.startsWith('0065'))).toEqual([
      '5000 14', '5000 17', '5000 24', '5000 27', '5070 16-15', '5070 25-26', '5120 14', '5120 17', '5120 24', '5120 27', '5140 16-15', '5140 25-26',
    ])
    expect(leist(r, 'BEMA')).toEqual(['7b'])
    expect(nrs(r.befunde)).toEqual(['3.1', '3.2', '3.2', '4.7', '4.7'])
  })

  it('Modellgussprothese statt zwei Brücken (S. 127, Downgrading)', () => {
    const { r, plan } = planen({ 16: 'k', 15: 'f', 14: 'k', 24: 'k', 25: 'f', 26: 'f', 27: 'k' }, { 15: 'E', 25: 'E', 26: 'E' })
    expect(leist(r, 'GOZ')).toEqual(['5070 15', '5070 25-26', '5210 OK'])
    expect(leist(r, 'BEMA')).toEqual(['7b'])
    expect(leist(r, 'BEB')).toEqual(['4001 OK', '6001 OK', '6003 OK ×3', '6311 OK', '6312 OK ×3'])
    expect(nrs(r.befunde)).toEqual(['2.1', '2.2', '2.7'])
    expect(berechnen(plan, LISTEN).versorgungsart).toBe('andersartig')
  })

  it('Direktabrechnung: andersartig ja, Mischfall unter 50 % andersartigem Honorar nein, Regelversorgung nein', () => {
    const { plan } = planen({ 16: 'k', 15: 'f', 14: 'k', 24: 'k', 25: 'f', 26: 'f', 27: 'k' }, { 15: 'E', 25: 'E', 26: 'E' })
    expect(berechnen(plan, LISTEN).direktabrechnung).toBe(true)
    const misch = { ...plan, positionen: [...plan.positionen, pos('BEMA', '20a', { id: 'gross', zahn: '37', preis: 5000 })] }
    const e = berechnen(misch, LISTEN)
    expect(e.versorgungsart).toBe('andersartig')
    expect(e.direktabrechnung).toBe(false)
    expect(e.hinweise.some((h) => h.text.startsWith('Mischfall'))).toBe(true)
    expect(berechnen(planen({ 16: 'ww' }, {}).plan, LISTEN).direktabrechnung).toBe(false)
  })

  it('zaehneVon: Bereiche, Listen und Kiefer', () => {
    expect(zaehneVon('15-13')).toEqual(['15', '14', '13'])
    expect(zaehneVon('11-21')).toEqual(['11', '21'])
    expect(zaehneVon('16,26')).toEqual(['16', '26'])
    expect(zaehneVon('UK links')).toHaveLength(16)
    expect(zaehneVon('')).toEqual([])
  })

  it('Totalprothese OK auf Steg mit 4 Implantaten, UK Totalprothese (Mischfall)', () => {
    const tp: Record<string, string> = {}
    for (const z of ['14', '12', '22', '24']) tp[z] = 'SO'
    for (const z of ['13', '11', '21', '23']) tp[z] = 'SEO'
    for (const z of ['17', '16', '15', '25', '26', '27']) tp[z] = 'SE'
    const befund = Object.fromEntries([...OBERKIEFER, ...UNTERKIEFER].map((z) => [z, 'f']))
    const { r, plan } = planen(befund, tp)
    expect(nrs(r.befunde)).toEqual(['4.2', '4.4'])
    expect(leist(r, 'BEMA')).toEqual(['7b', '97b UK', '98c UK'])
    expect(r.positionen.some((x) => x.ebene === 'BEL' && x.zahn === 'OK')).toBe(false)
    expect(leist(r, 'BEL')).toEqual(expect.arrayContaining(['3010 UK', '3020 UK ×14']))
    expect(leist(r, 'GOZ').filter((x) => !x.startsWith('9050') && !x.startsWith('0065'))).toEqual([
      '5030 12', '5030 14', '5030 22', '5030 24', '5070 11-21', '5070 13', '5070 23', '5080 11-21', '5080 13', '5080 23', '5180 OK', '5220 OK',
    ])
    expect(leist(r, 'GOZ').filter((x) => x.startsWith('9050'))).toEqual(['9050 12 ×2', '9050 14 ×2', '9050 22 ×2', '9050 24 ×2'])
    expect(leist(r, 'BEB')).toEqual(expect.arrayContaining(['2035 14', '3906 22', '3031 11-21', '3032 11-21 ×2', '3621 13', '6002 OK ×14', '6302 OK ×14']))
    expect(berechnen(plan, LISTEN).versorgungsart).toBe('andersartig')
  })

  it('implantatgetragene Prothese im zahnlosen UK: GOZ 5230 + 5190 (Befund 7.5)', () => {
    const uk = Object.fromEntries(UNTERKIEFER.map((z) => [z, 'sew']))
    uk['33'] = 'sow'
    uk['43'] = 'sow'
    const r = regelversorgungErmitteln(planMit(uk).zaehne)
    expect(leist(r, 'GOZ')).toEqual(expect.arrayContaining(['5230 UK', '5190 UK', '5090 UK ×2']))
    expect(leist(r, 'GOZ')).not.toContain('5220 UK')
  })
})

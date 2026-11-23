/**
 * Golden-Master-Schutz fuer die Implantologie-Abrechnung (Implantologie/Privat-Impl).
 * Friert reale Implantat-Kostenvoranschläge mit GOZ-/GOÄ-/BEB-Positionen und Summen ein.
 */
import { describe, expect, it } from 'vitest'
import type { Plan } from '../types'
import { STANDARD_EINSTELLUNGEN, STANDARD_GLOBAL, STANDARD_REGLER, neuerPlan } from '../store'
import { kalkulieren } from './berechnung'

const E = { ...STANDARD_EINSTELLUNGEN }

function bau(opt: {
  zaehne?: Plan['zaehne']
  implantate?: Plan['implantate']
  global?: Partial<Plan['global']>
  regler?: Partial<Plan['regler']>
}): Plan {
  return {
    ...neuerPlan(1),
    zaehne: opt.zaehne ?? {},
    implantate: opt.implantate ?? {},
    global: { ...STANDARD_GLOBAL, ...(opt.global ?? {}) },
    regler: { ...STANDARD_REGLER, ...(opt.regler ?? {}) },
  }
}

function kurz(k: ReturnType<typeof kalkulieren>) {
  return {
    goz: k.honorarGoz.map((z) => `${z.nr}${z.zahn ? `@${z.zahn}` : ''}×${z.anzahl}@${z.faktor ?? ''}=${z.betrag.toFixed(2)}`),
    goae: k.honorarGoae.map((z) => `${z.nr}${z.zahn ? `@${z.zahn}` : ''}×${z.anzahl}@${z.faktor ?? ''}=${z.betrag.toFixed(2)}`),
    laborAnzahl: k.labor.length,
    summen: {
      goz: k.summeGoz,
      goae: k.summeGoae,
      labor: k.summeLaborNetto,
      material: k.summeMaterialNetto,
      mwst: k.mwst,
      gesamt: k.gesamt,
    },
  }
}

describe('Golden Master: Implantologie Abrechnungsstabilität', () => {
  it('1. Einzelimplantat 36 mit DVT und Navigationsschablone (Standard)', () => {
    const p = bau({
      zaehne: { 36: { B: 'f', TP: 'I' } },
      implantate: { 36: { system: 'durchschnitt', durchmesser: 4.1, laenge: 10, zeitpunkt: 'verzoegert', deckung: 'gedeckt', abutment: 'standard' } },
      global: { bildgebung: 'dvt' },
      regler: { schabloneStufe: 3 },
    })
    expect(kurz(kalkulieren(p, E))).toMatchInlineSnapshot(`
      {
        "goae": [
          "3×1@2.3=20.11",
          "34×1@2.3=40.22",
          "5370×1@2.3=268.12",
          "5377×1@1=46.63",
          "6×1@2.3=13.41",
          "5000×1@2.3=6.70",
          "5000×1@2.3=6.70",
        ],
        "goz": [
          "0010×1@2.3=12.94",
          "0060×1@2.3=33.63",
          "2160×1@2.3=175.41",
          "3030×1@2.3=45.27",
          "9000@UK×1@2.3=114.35",
          "0100@UK×1@2.3=9.05",
          "0530×1@1=123.73",
          "9005@UK×1@2.3=38.81",
          "9010@36×1@2.3=199.86",
          "0100@UK×1@2.3=9.05",
          "9040@36×1@2.3=80.98",
        ],
        "laborAnzahl": 5,
        "summen": {
          "gesamt": 1691.67,
          "goae": 401.89,
          "goz": 843.08,
          "labor": 90.18,
          "material": 285.2,
          "mwst": 71.32,
        },
      }
    `)
  })

  it('2. Zwei Implantate 16 + 26 mit Orientierungsschablone (OPG)', () => {
    const p = bau({
      zaehne: { 16: { B: 'f', TP: 'I' }, 26: { B: 'f', TP: 'I' } },
      implantate: {
        16: { system: 'durchschnitt', durchmesser: 4.1, laenge: 10, zeitpunkt: 'verzoegert', deckung: 'gedeckt', abutment: 'standard' },
        26: { system: 'durchschnitt', durchmesser: 4.1, laenge: 10, zeitpunkt: 'verzoegert', deckung: 'gedeckt', abutment: 'standard' },
      },
      global: { bildgebung: 'opg' },
      regler: { schabloneStufe: 1 },
    })
    expect(kurz(kalkulieren(p, E))).toMatchInlineSnapshot(`
      {
        "goae": [
          "3×1@2.3=20.11",
          "34×1@2.3=40.22",
          "5004×1@2.3=53.62",
          "6×1@2.3=13.41",
          "5000×1@2.3=6.70",
          "5000×1@2.3=6.70",
        ],
        "goz": [
          "0010×1@2.3=12.94",
          "0060×1@2.3=33.63",
          "2160×1@2.3=175.41",
          "3030×1@2.3=45.27",
          "9000@OK×1@2.3=114.35",
          "0090@OK×1@2.3=7.76",
          "0530×1@1=123.73",
          "9003@OK×1@2.3=12.94",
          "9010@16×1@2.3=199.86",
          "9010@26×1@2.3=199.86",
          "0090@OK×1@2.3=7.76",
          "9040@16×1@2.3=80.98",
          "9040@26×1@2.3=80.98",
        ],
        "laborAnzahl": 3,
        "summen": {
          "gesamt": 1979.12,
          "goae": 140.76,
          "goz": 1095.47,
          "labor": 56.08,
          "material": 568.2,
          "mwst": 118.61,
        },
      }
    `)
  })
})

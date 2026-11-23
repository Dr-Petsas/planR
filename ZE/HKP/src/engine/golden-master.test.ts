/**
 * Golden-Master-Schutz fuer die Kassen-HKP-Abrechnung (ZE/HKP).
 * Friert reale Praxisfälle mit exakten Festzuschüssen, Versorgungsarten, Gebührenpositionen
 * und Euro-Summen ein. Jede unbeabsichtigte Abweichung (auch 1 Cent oder 1 Ziffer) bricht das Gate.
 *
 * Nur bewusst anpassen, wenn sich gesetzliche Punktwerte/Richtlinien nachweislich ändern.
 */
import { describe, expect, it } from 'vitest'
import type { HkpPlan, Preisliste } from '../types'
import { leererPlan } from '../store/plan'
import { STANDARD_LISTEN } from '../store/preislisten'
import { berechnen, type Listen } from './berechnung'
import { regelversorgungErmitteln, therapieAnwenden } from './regeln'

const liste = <T extends Preisliste['typ']>(typ: T, id: string) =>
  STANDARD_LISTEN.find((l) => l.typ === typ && l.id === id) as Preisliste<T>

const LISTEN: Listen = {
  bema: liste('bema', 'bema-2026'),
  goz: liste('goz', 'goz-2012'),
  bel: liste('bel2', 'bel2-bayern-2026'),
  beb: liste('beb', 'beb-itz-2024'),
  fz: liste('festzuschuss', 'fz-2026'),
}

function rechne(
  befund: Record<string, string>,
  tp: Record<string, string> = {},
  opt: { bonus?: HkpPlan['zuschuss']['bonus']; haertefall?: boolean; supraRegel?: string[]; gozFaktor?: number } = {},
) {
  const p = leererPlan()
  p.zuschuss = { bonus: opt.bonus ?? '70', haertefall: !!opt.haertefall }
  for (const [z, b] of Object.entries(befund)) p.zaehne[z].B = b
  for (const [z, t] of Object.entries(tp)) p.zaehne[z].TP = t
  if (opt.supraRegel) p.klinisch = { ...p.klinisch, supraRegel: opt.supraRegel }
  const regel = regelversorgungErmitteln(p.zaehne, { klinisch: p.klinisch })
  const angewandt = therapieAnwenden(regel, p.zaehne, p)
  for (const [z, r] of Object.entries(angewandt.R)) p.zaehne[z].R = r
  p.befunde = angewandt.befunde
  p.positionen = opt.gozFaktor
    ? angewandt.positionen.map((x) => (x.ebene === 'GOZ' ? { ...x, faktor: opt.gozFaktor } : x))
    : angewandt.positionen
  const e = berechnen(p, LISTEN)
  return {
    versorgungsart: e.versorgungsart,
    befunde: e.befunde.map((f) => `${f.nr}×${f.anzahl}`),
    positionen: e.positionen.map((x) => `${x.ebene}:${x.nr}${x.zahn ? `@${x.zahn}` : ''}×${x.anzahl}=${x.betrag.toFixed(2)}`),
    summen: {
      bema: e.summen.bemaHonorar,
      goz: e.summen.gozHonorar,
      labor: e.summen.materialUndLabor,
      gesamt: e.summen.gesamt,
      festzuschuss: e.summen.festzuschuss,
      eigenanteil: e.summen.eigenanteil,
    },
  }
}

describe('Golden Master: Kassen-HKP Abrechnungsstabilität', () => {
  it('1. Regelversorgung: Brücke 14–16 (Befund 2.1, Bonus 70 %)', () => {
    const r = rechne({ 15: 'f' }, {})
    expect(r.versorgungsart).toBe('regel')
    expect(r).toMatchInlineSnapshot(`
      {
        "befunde": [
          "2.1×1",
          "2.7×2",
        ],
        "positionen": [
          "BEMA:7b×1=22.50",
          "BEMA:92@16-14×1=73.43",
          "BEMA:91a@16×1=139.76",
          "BEMA:19@16×1=22.50",
          "BEMA:91b@14×1=151.60",
          "BEMA:19@14×1=22.50",
          "BEMA:19@15×1=22.50",
          "BEL:1024@14×1=103.68",
          "BEL:1620@14×1=121.59",
          "BEL:1100@15×1=76.21",
          "BEL:1620@15×1=121.59",
          "BEL:1021@16×1=104.54",
          "BEL:0010×1=8.45",
          "BEL:0051@OK×1=19.88",
          "BEL:0120×1=12.42",
          "BEL:9700×3=51.66",
          "BEL:9330×2=14.34",
        ],
        "summen": {
          "bema": 454.81,
          "eigenanteil": 303.04,
          "festzuschuss": 830.54,
          "gesamt": 1133.58,
          "goz": 0,
          "labor": 678.77,
        },
        "versorgungsart": "regel",
      }
    `)
  })

  it('2. Bonusstufen auf Regelversorgung Brücke 14–16 (60 %, 70 %, 75 %, Härtefall)', () => {
    const stufen = [
      { label: '60 %', opt: { bonus: '60' as const, haertefall: false } },
      { label: '70 %', opt: { bonus: '70' as const, haertefall: false } },
      { label: '75 %', opt: { bonus: '75' as const, haertefall: false } },
      { label: 'Härtefall', opt: { bonus: '60' as const, haertefall: true } },
    ].map(({ label, opt }) => {
      const r = rechne({ 15: 'f' }, {}, opt)
      return { stufe: label, gesamt: r.summen.gesamt, fz: r.summen.festzuschuss, eigen: r.summen.eigenanteil }
    })
    expect(stufen[1].fz).toBeGreaterThan(stufen[0].fz)
    expect(stufen[2].fz).toBeGreaterThan(stufen[1].fz)
    expect(stufen[3].fz).toBeGreaterThan(stufen[2].fz)
    expect(stufen).toMatchInlineSnapshot(`
      [
        {
          "eigen": 421.7,
          "fz": 711.88,
          "gesamt": 1133.58,
          "stufe": "60 %",
        },
        {
          "eigen": 303.04,
          "fz": 830.54,
          "gesamt": 1133.58,
          "stufe": "70 %",
        },
        {
          "eigen": 243.72,
          "fz": 889.86,
          "gesamt": 1133.58,
          "stufe": "75 %",
        },
        {
          "eigen": 0,
          "fz": 1186.48,
          "gesamt": 1133.58,
          "stufe": "Härtefall",
        },
      ]
    `)
  })

  it('3. Gleichartige Versorgung: Vollkeramik-Brücke 14–16 + Krone 26 (Bonus 70 %)', () => {
    const r = rechne({ 15: 'f', 26: 'ww' }, { 14: 'KM', 15: 'BM', 16: 'KM', 26: 'KM' })
    expect(r.versorgungsart).toBe('gleichartig')
    expect(r).toMatchInlineSnapshot(`
      {
        "befunde": [
          "2.1×1",
          "1.1×1",
          "2.7×2",
        ],
        "positionen": [
          "BEMA:7b×1=22.50",
          "GOZ:5070@15×1=51.74",
          "BEMA:19@26×1=22.50",
          "BEMA:19@16×1=22.50",
          "BEMA:19@14×1=22.50",
          "BEMA:19@15×1=22.50",
          "BEB:0002×1=10.40",
          "BEB:0021@OK×1=23.00",
          "BEB:0402×1=14.75",
          "BEL:9330×2=14.34",
          "GOZ:5010@16×1=191.84",
          "BEB:2281@16×1=110.00",
          "BEB:2612@16×1=135.21",
          "BEB:2351@15×1=110.00",
          "BEB:2612@15×1=135.21",
          "GOZ:5010@14×1=191.84",
          "BEB:2281@14×1=110.00",
          "BEB:2612@14×1=135.21",
          "GOZ:2210@26×1=217.06",
          "BEB:2281@26×1=110.00",
          "BEB:2612@26×1=135.21",
          "MAT:@14×1=15.00",
          "MAT:@15×1=15.00",
          "MAT:@16×1=15.00",
          "MAT:@26×1=15.00",
        ],
        "summen": {
          "bema": 112.52,
          "eigenanteil": 836.15,
          "festzuschuss": 1109.41,
          "gesamt": 1945.56,
          "goz": 652.48,
          "labor": 1180.56,
        },
        "versorgungsart": "gleichartig",
      }
    `)
  })

  it('4. Teleskopprothese OK auf 13 und 23 (Restzähne fehlend)', () => {
    const fehlend: Record<string, string> = {}
    for (const z of ['17', '16', '15', '14', '12', '11', '21', '22', '24', '25', '26', '27']) fehlend[z] = 'f'
    expect(rechne(fehlend, { 13: 'T', 23: 'T' })).toMatchInlineSnapshot(`
      {
        "befunde": [
          "3.1×1",
          "3.2×1",
          "4.7×1",
          "3.2×1",
          "4.7×1",
        ],
        "positionen": [
          "BEMA:7b×1=22.50",
          "BEMA:19@13×1=22.50",
          "BEMA:19@23×1=22.50",
          "BEMA:96c@OK×1=136.21",
          "BEMA:98g@OK×1=52.11",
          "BEMA:98h/2@OK×1=59.22",
          "BEL:0010@OK×2=16.90",
          "BEL:0021@OK×1=17.78",
          "BEL:0213@OK×1=28.87",
          "BEL:0220@OK×1=8.32",
          "BEL:0120@OK×1=12.42",
          "BEL:2010@OK×1=180.04",
          "BEL:2031@18,28×2=56.46",
          "BEL:3010@OK×1=43.44",
          "BEL:3030@OK×12=37.44",
          "BEL:3610@OK×1=65.39",
          "BEL:3620@OK×12=49.08",
          "BEL:9330×2=14.34",
          "GOZ:5040@13×1=336.97",
          "BEB:3001@13×1=210.00",
          "GOZ:5040@23×1=336.97",
          "BEB:3001@23×1=210.00",
          "MAT:@13×1.8=1.53",
          "MAT:@23×1.8=1.53",
        ],
        "summen": {
          "bema": 315.05,
          "eigenanteil": 255.35,
          "festzuschuss": 1753.93,
          "gesamt": 2009.28,
          "goz": 673.94,
          "labor": 1020.29,
        },
        "versorgungsart": "gleichartig",
      }
    `)
  })

  it('5. Zahnloser Oberkiefer: Totalprothese', () => {
    const fehlend: Record<string, string> = {}
    for (const z of ['17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27']) fehlend[z] = 'f'
    const r = rechne(fehlend, {})
    expect(r.versorgungsart).toBe('regel')
    expect(r).toMatchInlineSnapshot(`
      {
        "befunde": [
          "4.1×1",
          "4.6×1",
          "4.6×1",
        ],
        "positionen": [
          "BEMA:7b×1=22.50",
          "BEMA:97a@OK×1=296.10",
          "BEMA:98b@OK×1=67.51",
          "BEL:0010@OK×2=16.90",
          "BEL:0211@OK×1=28.87",
          "BEL:0213@OK×1=28.87",
          "BEL:0220@OK×1=8.32",
          "BEL:0120@OK×1=12.42",
          "BEL:3010@OK×1=43.44",
          "BEL:3020@OK×14=33.32",
          "BEL:3610@OK×1=65.39",
          "BEL:3620@OK×14=57.26",
          "BEMA:91d@18×1=225.04",
          "BEMA:19@18×1=22.50",
          "BEL:1200@18×1=325.75",
          "BEMA:91d@28×1=225.04",
          "BEMA:19@28×1=22.50",
          "BEL:1200@28×1=325.75",
          "BEL:9330×2=14.34",
        ],
        "summen": {
          "bema": 881.19,
          "eigenanteil": 254.84,
          "festzuschuss": 1654.22,
          "gesamt": 1909.06,
          "goz": 0,
          "labor": 1027.87,
        },
        "versorgungsart": "regel",
      }
    `)
  })

  it('6. Implantatkrone Einzelzahnlücke 21: Normalfall vs. Ausnahmefall 36a ZE-RL (Befund 7.1)', () => {
    const normal = rechne({ 21: 'skw' }, { 21: 'SK' })
    const ausnahme = rechne({ 21: 'skw' }, {}, { supraRegel: ['21'] })
    expect(normal.versorgungsart).toBe('andersartig')
    expect(ausnahme.positionen.some((x) => x.startsWith('BEMA:20b@21'))).toBe(true)
    expect({ normal, ausnahme }).toEqual({
      ausnahme: {
        befunde: ['7.1×1', '1.3×1'],
        positionen: [
          'BEMA:7b×1=22.50',
          'BEMA:20b@21×1=187.14',
          'BEMA:19@21×1=22.50',
          'BEL:1024@21×1=103.68',
          'BEL:1620@21×1=121.59',
          'BEL:0010×1=8.45',
          'BEL:0051@OK×1=19.88',
          'BEL:0120×1=12.42',
          'BEL:9700×1=17.22',
          'BEL:9330×2=14.34',
          'GOZ:9050@21×2=80.98',
          'BEB:0223@OK-Front×1=31.00',
          'BEB:4421@21×1=41.00',
          'MAT:@21×1=106.00',
        ],
        summen: {
          bema: 232.14,
          eigenanteil: 449.62,
          festzuschuss: 372.37,
          gesamt: 821.99,
          goz: 80.98,
          labor: 508.87,
        },
        versorgungsart: 'gleichartig',
      },
      normal: {
        befunde: ['7.1×1', '1.3×1'],
        positionen: [
          'BEMA:7b×1=22.50',
          'BEL:9330×2=14.34',
          'GOZ:2200@21×1=171.01',
          'BEB:2101@21×1=115.80',
          'GOZ:2270@21×1=34.93',
          'GOZ:9050@21×2=80.98',
          'BEB:0223@OK-Front×1=31.00',
          'BEB:4421@21×1=41.00',
          'MAT:@21×1=106.00',
          'MAT:@21×1.3=1.11',
        ],
        summen: {
          bema: 22.5,
          eigenanteil: 267.95,
          festzuschuss: 372.37,
          gesamt: 640.32,
          goz: 286.92,
          labor: 330.9,
        },
        versorgungsart: 'andersartig',
      },
    })
  })

  it('7. GOZ-Faktor-Steigerung 2,3 vs. 3,5 auf Vollkeramik-Brücke 14–16', () => {
    const f23 = rechne({ 15: 'f' }, { 14: 'KM', 15: 'BM', 16: 'KM' }, { gozFaktor: 2.3 }).summen
    const f35 = rechne({ 15: 'f' }, { 14: 'KM', 15: 'BM', 16: 'KM' }, { gozFaktor: 3.5 }).summen
    expect(f35.goz).toBeGreaterThan(f23.goz)
    expect(f35.festzuschuss).toBe(f23.festzuschuss)
    expect({ f23, f35 }).toEqual({
      f23: {
        bema: 90.01,
        eigenanteil: 597.03,
        festzuschuss: 830.54,
        gesamt: 1427.57,
        goz: 435.42,
        labor: 902.14,
      },
      f35: {
        bema: 90.01,
        eigenanteil: 824.19,
        festzuschuss: 830.54,
        gesamt: 1654.73,
        goz: 662.58,
        labor: 902.14,
      },
    })
  })
})

import { describe, expect, it } from 'vitest'
import { planen } from './planung'
import { kalkulieren, gozEinzel } from './berechnung'
import { neuerPlan, STANDARD_EINSTELLUNGEN } from '../store'
import type { Abformung, Zahn } from '../types'

const nummern = (z: Record<string, Zahn>, abformung: Abformung = 'abdruck', prothese: Abformung = '') =>
  planen(z, abformung, undefined, prothese).positionen.map((p) => `${p.ebene} ${p.nr}${p.zahn ? ' ' + p.zahn : ''}${p.anzahl > 1 ? ' x' + p.anzahl : ''}`)

describe('Befund (01) und Planung', () => {
  const hinweise = (z: Record<string, Zahn>) => planen(z, 'abdruck').hinweise.join(' | ')

  it('Krone auf fehlendem Zahn, Glied auf vorhandenem und Implantat auf eigenem Zahn fallen auf', () => {
    expect(hinweise({ 16: { B: 'f', TP: 'KM' } })).toMatch(/16: laut Befund „f“ steht dort kein eigener Zahn/)
    expect(hinweise({ 14: { B: '', TP: 'KM' }, 15: { B: 'pw', TP: 'BM' }, 16: { B: 'kw', TP: 'KM' } })).toMatch(/15: Brückenglied geplant, laut Befund ist der Zahn vorhanden \(pw\)/)
    expect(hinweise({ 36: { B: 'ww', TP: 'SKM' } })).toMatch(/36: Implantatversorgung geplant/)
    expect(hinweise({ 26: { B: 'x', TP: 'KM' } })).toMatch(/26: laut Befund nicht erhaltungswürdig/)
  })

  it('passender Befund und Planung ohne Befund bleiben ruhig', () => {
    expect(hinweise({ 14: { B: 'kw', TP: 'KM' }, 15: { B: 'f', TP: 'BM' }, 16: { B: 'ww', TP: 'KM' }, 36: { B: 'f', TP: 'SKM' }, 46: { B: 'skw', TP: 'SKM' } })).not.toMatch(/laut Befund|Befund prüfen/)
    expect(hinweise({ 16: { B: '', TP: 'BM' } })).not.toMatch(/Befund prüfen/)
  })
})

describe('Privatplanung', () => {
  it('Einzelkrone vollkeramisch mit Kronenentfernung', () => {
    const n = nummern({ '16': { B: 'kw', TP: 'KM' } })
    expect(n).toEqual(expect.arrayContaining(['GOZ 0030', 'GOZ 2290 16', 'GOZ 2210 16', 'GOZ 2270 16', 'BEB 2281 16', 'BEB 2612 16', 'BEB 0021 OK', 'BEB 0002 UK', 'BEB 0402']))
    expect(n.some((x) => x.startsWith('GOZ 5'))).toBe(false)
  })

  it('Brücke 14-16 mit Ankern und Spanne', () => {
    const n = nummern({ '14': { B: '', TP: 'KM' }, '15': { B: 'f', TP: 'BM' }, '16': { B: '', TP: 'KM' } })
    expect(n).toEqual(expect.arrayContaining(['GOZ 5010 14', 'GOZ 5010 16', 'GOZ 5120 14', 'GOZ 5120 16', 'GOZ 5070 15', 'GOZ 5140 15', 'BEB 2351 15']))
    expect(n).not.toContain('GOZ 2210 14')
    expect(n).not.toContain('GOZ 2270 14')
  })

  it('Doppelanker: -KM KM BM KM- macht 13 zum Brückenanker, ohne Markierung bleibt 13 Einzelkrone', () => {
    const z = (anfang: boolean): Record<string, Zahn> => ({
      '13': { B: '', TP: 'KM', bAnfang: anfang }, '14': { B: '', TP: 'KM' }, '15': { B: 'f', TP: 'BM' }, '16': { B: '', TP: 'KM', bEnde: anfang },
    })
    const mit = nummern(z(true))
    expect(mit).toEqual(expect.arrayContaining(['GOZ 5010 13', 'GOZ 5120 13', 'GOZ 5010 14', 'GOZ 5010 16']))
    expect(mit).not.toContain('GOZ 2210 13')
    const ohne = nummern(z(false))
    expect(ohne).toEqual(expect.arrayContaining(['GOZ 2210 13', 'GOZ 2270 13', 'GOZ 5010 14']))
  })

  it('Implantatkrone mit Scan', () => {
    const n = nummern({ '36': { B: 'i', TP: 'SKM' } }, 'scan')
    expect(n).toEqual(expect.arrayContaining(['GOZ 2200 36', 'GOZ 9050 36 x2', 'BEB 0009 OK', 'BEB 0009 UK', 'GOZ 0065 x2']))
  })

  it('Intraoralscan: digitaler Workflow statt Mittelwertartikulator, Abdruck bleibt analog', () => {
    const z: Record<string, Zahn> = { '14': { B: 'f', TP: 'SKM' }, '16': { B: 'kw', TP: 'KM' }, '26': { B: '', TP: 'K' } }
    const scan = planen(z, 'scan')
    const n = scan.positionen.map((p) => `${p.ebene} ${p.nr}${p.zahn ? ' ' + p.zahn : ''}`)
    expect(n).toEqual(expect.arrayContaining([
      'BEB 0007', 'BEB 0901', 'BEB 0902', 'BEB 0903 OK',
      'BEB 0013 16', 'BEB 0017 16', 'BEB 0904 16', 'BEB 0905 16', 'BEB 0013 26', 'BEB 0017 26',
      'BEB 0907 14', 'BEB 0907 16', 'BEB 0907 26', 'BEB 0911 14', 'BEB 0911 16', 'BEB 0911 26',
      'BEB 0032 14', 'BEB 0906 14', 'BEB 0032 16', 'BEB 0906 16', 'BEB D104 14', 'BEB 0401',
    ]))
    expect(n).not.toContain('BEB 0402')
    expect(n).not.toContain('BEB 0013 14')
    expect(n).not.toContain('BEB 0032 26')
    expect(n.some((x) => /^BEB (D10[123]|0105)\b/.test(x))).toBe(false)
    expect(n.filter((x) => x === 'BEB 0007')).toHaveLength(1)
    expect(scan.hinweise.some((h) => h.startsWith('Digitaler Ablauf im Labor nach Intraoralscan'))).toBe(true)

    const monolithisch = nummern({ '26': { B: '', TP: 'K' } }, 'scan')
    expect(monolithisch).toEqual(expect.arrayContaining(['BEB 0902', 'BEB 0907 26']))
    expect(monolithisch).not.toContain('BEB 0401')

    const abdruck = nummern(z, 'abdruck')
    expect(abdruck.some((x) => / D\d/.test(x) || /^BEB 09(0\d|1[01])/.test(x) || x.startsWith('BEB 0013'))).toBe(false)
    expect(abdruck).toContain('BEB 0402')

    const k = kalkulieren({ ...neuerPlan(1), zaehne: z, abformung: 'scan' }, STANDARD_EINSTELLUNGEN)
    expect(k.labor.find((x) => x.nr === '0907')?.einzel).toBeGreaterThan(0)
    expect(k.hinweise.some((h) => /BEB 09\d\d ist in der Laborpreisliste nicht vorhanden/.test(h))).toBe(false)
    // Presskeramik wird nicht gesintert
    const press = kalkulieren({ ...neuerPlan(1), zaehne: z, abformung: 'scan', werkstoffe: { 16: 'presskeramik' } }, STANDARD_EINSTELLUNGEN)
    expect(press.labor.filter((x) => x.nr === '0032').map((x) => x.zahn)).toEqual(['14'])
  })

  it('Praxiskatalog: Laborpositionen aus DS-Win ersetzen die BEB-Standardpreise über die Zuordnung', () => {
    const z: Record<string, Zahn> = { '26': { B: '', TP: 'K' } }
    const eigenlabor = [
      { nr: '00907', text: 'CAD: Einzelkrone konstruieren', preis: 31, quelle: 'pvs' as const },
      { nr: '02101', text: 'Krone gegossen NEM', preis: 99, quelle: 'pvs' as const },
      { nr: '02102', text: 'Krone gefräst NEM', preis: 120, quelle: 'pvs' as const },
      { nr: '04711', text: 'Mehrflächige Verblendung Keramik', preis: 1, quelle: 'pvs' as const },
    ]
    const k = kalkulieren({ ...neuerPlan(1), zaehne: z, abformung: 'scan' }, { ...STANDARD_EINSTELLUNGEN, eigenlabor })
    expect(k.labor.find((x) => x.nr === '0907')).toMatchObject({ eigen: '00907', einzel: 31 })
    // nach Scan die gefräste Variante, nach Abdruck die gegossene
    expect(k.labor.find((x) => x.nr === '2101')).toMatchObject({ eigen: '02102', einzel: 120 })
    const abdruck = kalkulieren({ ...neuerPlan(1), zaehne: z, abformung: 'abdruck' }, { ...STANDARD_EINSTELLUNGEN, eigenlabor })
    expect(abdruck.labor.find((x) => x.nr === '2101')).toMatchObject({ eigen: '02101', einzel: 99 })
    // nicht geplante Positionen des Katalogs bleiben draußen
    expect(k.labor.some((x) => x.eigen === '04711')).toBe(false)
  })

  it('Veneers 11 und 21 (Keramik/Komposit)', () => {
    const n = nummern({ '11': { B: '', TP: 'VE' }, '21': { B: '', TP: 'VEK' } }, 'scan')
    expect(n).toEqual(expect.arrayContaining(['GOZ 2220 11', 'GOZ 2197 11', 'BEB 2653 11', 'GOZ 2220 21', 'GOZ 2197 21', 'BEB 2663 21', 'GOZ 0065 x2',
      'BEB 0833 11', 'BEB 2951 11', 'BEB 0017 11', 'BEB 0909 11', 'BEB 0906 11', 'BEB 0833 21', 'BEB 2945 21', 'BEB 0017 21', 'BEB 0909 21',
      'BEB 0009 OK', 'BEB 0902', 'BEB 0723']))
    expect(n.filter((x) => x === 'BEB 0723')).toHaveLength(1)
    expect(n.filter((x) => x === 'BEB 0017 11')).toHaveLength(1)
    expect(n.some((x) => x.startsWith('BEB 0907'))).toBe(false)
    expect(n.some((x) => x.startsWith('GOZ 2270') || x.startsWith('GOZ 5'))).toBe(false)
  })

  it('Kombinationsarbeit Teleskope: Pfeiler scannen, zweite Abformung für die Prothese als Überabdruck oder zweiter Scan', () => {
    const z: Record<string, Zahn> = {}
    for (const t of ['13', '23']) z[t] = { B: '', TP: 'T' }
    for (const t of ['17', '16', '15', '14', '24', '25', '26', '27']) z[t] = { B: 'f', TP: 'E' }

    const ueber = nummern(z, 'scan', 'abdruck')
    expect(ueber).toEqual(expect.arrayContaining(['GOZ 5040 13', 'GOZ 5040 23', 'GOZ 0065 x2', 'BEB 0009 OK', 'BEB 0009 UK', 'GOZ 5170 OK', 'BEB 1006 OK', 'BEB 0004 OK']))
    expect(ueber.filter((x) => x === 'GOZ 5170 OK')).toHaveLength(1)
    expect(ueber.filter((x) => x.startsWith('GOZ 0065'))).toHaveLength(1)
    expect(ueber).not.toContain('BEB 0021 OK')

    const zweimal = nummern(z, 'scan', 'scan')
    expect(zweimal).toEqual(expect.arrayContaining(['GOZ 0065 x2', 'GOZ 0065 OK x3']))
    expect(zweimal.filter((x) => x === 'BEB 0009 OK')).toHaveLength(2)
    expect(zweimal).not.toContain('BEB 1006 OK')

    const offen = planen(z, 'scan')
    expect(offen.positionen.some((p) => p.nr === '1006' || p.nr === '0004')).toBe(false)
    expect(offen.hinweise.some((h) => h.includes('zweite Abformung (Scan oder Überabdruck) noch offen'))).toBe(true)
    expect(nummern(z, 'abdruck')).not.toContain('GOZ 0065')
    expect(nummern(z, 'abdruck', 'scan')).toContain('GOZ 0065 OK x3')
  })

  it('Zahnlose Prothese: Funktionsabformung enthalten, keine zweite Abformung', () => {
    const z: Record<string, Zahn> = {}
    for (const t of ['17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27']) z[t] = { B: 'f', TP: 'E' }
    const r = planen(z, 'abdruck', undefined, 'abdruck')
    expect(r.positionen.some((p) => p.nr === '1006' || p.nr === '0004')).toBe(false)
    expect(r.hinweise.some((h) => h.includes('zahnlos') && h.includes('5180/5190'))).toBe(true)
  })

  it('Abformung offen: keine Modelle, kein 0065, Hinweis', () => {
    const r = planen({ '16': { B: '', TP: 'KM' } }, '')
    const n = r.positionen.map((p) => p.nr)
    expect(n).not.toContain('0065')
    expect(n).not.toContain('0009')
    expect(n).not.toContain('0021')
    expect(r.hinweise.some((h) => h.startsWith('Abformung noch offen'))).toBe(true)
  })

  it('Implantatsystem: Teile, Abutment und Löffel', () => {
    const scan = planen({ '36': { B: 'i', TP: 'SKM' } }, 'scan', { system: 'camlog', loeffel: 'geschlossen', abutment: 'standard' }).positionen
    const mat = scan.filter((p) => p.ebene === 'MAT').map((p) => `${p.text} ${p.preis}`)
    expect(mat).toEqual(['CAMLOG CAMLOG / CONELOG: Scanbody 37', 'CAMLOG CAMLOG / CONELOG: Laboranalog 20', 'CAMLOG CAMLOG / CONELOG: Abutment konfektioniert (Titan) 88'].map((s) => s.replace('CAMLOG CAMLOG', 'Camlog CAMLOG')))
    expect(scan.map((p) => `${p.ebene} ${p.nr}`)).toEqual(expect.arrayContaining(['BEB 0018', 'BEB 0224', 'BEB 0223', 'BEB 4421', 'GOZ 9050']))

    const offen = planen({ '36': { B: 'i', TP: 'SKM' } }, 'abdruck', { system: 'straumann-bl', loeffel: 'offen', abutment: 'keramik' }).positionen
    const n = offen.map((p) => `${p.ebene} ${p.nr} ${p.zahn}`)
    expect(n).toEqual(expect.arrayContaining(['GOZ 5170 UK', 'BEB 1108 UK', 'BEB 0225 36', 'BEB 6906 36', 'MAT MAT-abdruckpfosten 36', 'MAT MAT-tiBase 36', 'MAT MAT-schraube 36']))
    expect(n).not.toContain('BEB 4421 36')
  })

  it('Totalprothese Oberkiefer', () => {
    const z: Record<string, Zahn> = {}
    for (const t of ['17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27']) z[t] = { B: 'f', TP: 'E' }
    const n = nummern(z)
    expect(n).toEqual(expect.arrayContaining(['GOZ 5220 OK', 'GOZ 5180 OK', 'BEB 6002 OK x14', 'BEB 6302 OK x14']))
  })

  it('Berechnung ohne Festzuschuss: Honorar, Labor + 7 % MwSt.', () => {
    const plan = { ...neuerPlan(1), zaehne: { '21': { B: 'ww', TP: 'KM' } } }
    const k = kalkulieren(plan, STANDARD_EINSTELLUNGEN)
    expect(gozEinzel('2210', 2.3)).toBeCloseTo(1678 * 0.0562421 * 2.3, 2)
    expect(k.mwst).toBeCloseTo(k.summeLaborNetto * 0.07, 2)
    expect(k.gesamt).toBeCloseTo(k.summeHonorar + k.summeLaborNetto + k.mwst, 2)
    expect(k.honorar.find((z) => z.nr === '2180')).toBeTruthy()
  })

  it('Regler: GOZ-Zusatzstufe, Faktor, Laborstufe und Aufschlag', () => {
    const zaehne = { '11': { B: 'kw', TP: 'KM' }, '21': { B: '', TP: 'VE' }, '14': { B: '', TP: 'KM' }, '15': { B: 'f', TP: 'BM' }, '16': { B: '', TP: 'KM' } }
    const plan = { ...neuerPlan(1), zaehne }
    const basis = kalkulieren(plan, STANDARD_EINSTELLUNGEN)
    const k = kalkulieren({ ...plan, regler: { gozStufe: 2, gozFaktor: 3.0, laborStufe: 3, laborAufschlag: 10, aus: ['GOZ|2040|18-14'] } }, STANDARD_EINSTELLUNGEN)
    const goz = k.honorar.filter((z) => z.zusatz).map((z) => `${z.nr} ${z.zahn}`)
    expect(goz).toEqual(expect.arrayContaining(['2030 13-23', '2030 18-14', '2197 11', '2197 14', '2197 16', '2040 13-23']))
    expect(goz).not.toContain('2040 18-14')
    expect(goz.filter((x) => x === '2197 21')).toHaveLength(0)
    expect(k.honorar.every((z) => z.faktor === 3)).toBe(true)
    const lab = k.labor.filter((z) => z.zusatz).map((z) => `${z.nr} ${z.zahn}`)
    expect(lab).toEqual(expect.arrayContaining(['2951 11', '2951 15', '0405 ', '0522 ', '2678 15', '0217 11']))
    expect(lab).not.toContain('2951 21')
    expect(lab).not.toContain('0217 15')
    const krone = k.labor.find((z) => z.nr === '2281' && z.zahn === '11')!
    expect(krone.einzel).toBeCloseTo(110 * 1.1, 2)
    expect(k.gesamt).toBeGreaterThan(basis.gesamt)
  })

  it('Anpassungen und entfernte Positionen bleiben bestehen', () => {
    const plan = { ...neuerPlan(1), zaehne: { '21': { B: '', TP: 'KM' } } }
    const id = 'auto:GOZ:2210:21'
    const k = kalkulieren({ ...plan, anpassungen: { [id]: { faktor: 3.0 } }, entfernt: ['auto:GOZ:0030:'] }, STANDARD_EINSTELLUNGEN)
    expect(k.honorar.find((z) => z.id === id)?.faktor).toBe(3)
    expect(k.honorar.find((z) => z.id === id)?.begruendung).toBeTruthy()
    expect(k.honorar.some((z) => z.nr === '0030')).toBe(false)
  })
})

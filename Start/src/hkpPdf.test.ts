import { describe, expect, it } from 'vitest'
import { blattAusZeilen, planAusHkpZeilen, probeAusHkpZeilen, schemaAusZeilen, textSchicht, type PdfZeile } from './hkpPdf'

const zeile = (texte: string[], x0 = 0, schritt = 28): PdfZeile => ({
  teile: texte.map((text, i) => ({ x: x0 + i * schritt, text })),
})

const obere = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']

describe('HKP-PDF', () => {
  it('liest den Befund unter der Zahnleiste und die beschrifteten Positionen', () => {
    const befund = obere.map((z) => (z === '14' || z === '16' || z === '26' ? 'ww' : z === '15' ? 'f' : 'k'))
    const plan = planAusHkpZeilen([
      zeile(obere),
      zeile(['B', ...befund], -28),
      zeile(['BEMA', '20b', '14']),
      zeile(['GOZ', '2210', '16', 'Faktor', '3,5']),
      zeile(['BEL', '1021', '16']),
      zeile(['Festzuschuss', '2.1', '14-16']),
    ])
    expect(plan).not.toHaveProperty('fehler')
    if ('fehler' in plan) return
    expect(plan.befund['14']).toBe('ww')
    expect(plan.befund['15']).toBe('f')
    expect(plan.befund['11']).toBe('k')
    expect(plan.positionen).toEqual(expect.arrayContaining([
      expect.objectContaining({ ebene: 'BEMA', nr: '20b', zahn: '14' }),
      expect.objectContaining({ ebene: 'GOZ', nr: '2210', zahn: '16', faktor: 3.5 }),
      expect.objectContaining({ ebene: 'BEL', nr: '1021', zahn: '16' }),
    ]))
    expect(plan.positionen.some((p) => p.nr === '2.1')).toBe(false)
  })

  it('nimmt einen geschriebenen Befund und setzt den GOZ-Faktor auf 2,3, wenn keiner dasteht', () => {
    const plan = planAusHkpZeilen([
      zeile(['Zahn', '21', 'ww']),
      zeile(['GOZ', '2210', '21']),
      zeile(['BEB', '2281', '21']),
    ])
    expect(plan).not.toHaveProperty('fehler')
    if ('fehler' in plan) return
    expect(plan.befund['21']).toBe('ww')
    expect(plan.positionen).toEqual(expect.arrayContaining([
      expect.objectContaining({ ebene: 'GOZ', nr: '2210', zahn: '21', faktor: 2.3 }),
      expect.objectContaining({ ebene: 'BEB', nr: '2281', zahn: '21' }),
    ]))
  })

  it('liest den Betrag am Zeilenende und lässt eine Laboranlage ohne Befund gelten', () => {
    const plan = probeAusHkpZeilen([
      zeile(['GOZ', '2210', '16', '167,84']),
      zeile(['BEL II', '1100', 'OK', '420,00']),
    ])
    expect(plan).not.toHaveProperty('fehler')
    if ('fehler' in plan) return
    expect(plan.positionen).toEqual(expect.arrayContaining([
      expect.objectContaining({ ebene: 'GOZ', nr: '2210', betrag: 167.84, faktor: 2.3 }),
      expect.objectContaining({ ebene: 'BEL', nr: '1100', betrag: 420 }),
    ]))
    const katalog = planAusHkpZeilen([
      zeile(['Zahn', '16', 'ww']),
      zeile(['GOZ', '2210', '16', '167,84']),
    ])
    if ('fehler' in katalog) return
    expect(katalog.positionen.every((p) => !('betrag' in p))).toBe(true)
  })

  it('liest Therapie und Befund über der Zahnleiste in den Planer', () => {
    const befund = obere.map((z) => (z === '14' || z === '16' ? 'ww' : z === '15' ? 'f' : ''))
    const therapie = obere.map((z) => (z === '14' || z === '16' ? 'KM' : z === '15' ? 'E' : ''))
    const regel = obere.map((z) => (z === '14' || z === '16' ? 'K' : z === '15' ? 'E' : ''))
    const schema = schemaAusZeilen([
      zeile(['TP', ...therapie], -28),
      zeile(['R', ...regel], -28),
      zeile(['B', ...befund], -28),
      zeile(obere),
    ])
    expect(schema.B['15']).toBe('f')
    expect(schema.B['14']).toBe('ww')
    expect(schema.TP['16']).toBe('KM')
    expect(schema.TP['15']).toBe('E')
    expect(schema.R['14']).toBe('K')
    expect(schema.B['11']).toBeUndefined()
  })

  it('übernimmt den Lückenschluss )( als Befund', () => {
    const befund = obere.map((z) => (z === '26' ? ')(' : z === '25' || z === '27' ? 'k' : ''))
    const schema = schemaAusZeilen([
      zeile(['B', ...befund], -28),
      zeile(obere),
    ])
    expect(schema.B['26']).toBe(')(')
    expect(schema.B['25']).toBe('k')
  })

  it('lässt eine großgeschriebene Therapiezeile aus dem Befund und liest die Gebühr auch hinter der Nummer', () => {
    const therapie = obere.map((z) => (z === '16' ? 'KM' : ''))
    const schema = schemaAusZeilen([
      zeile(['Therapieplanung:', ...therapie], -28),
      zeile(obere),
      zeile(['K', 'E', 'KM']),
    ])
    expect(schema.TP['16']).toBe('KM')
    expect(schema.B['18']).toBeUndefined()
    const blatt = blattAusZeilen([
      zeile(obere),
      zeile(['B', ...obere.map((z) => (z === '16' ? 'ww' : 'k'))], -28),
      zeile(['2210', 'GOZ', '16', '3,5', '167,84']),
      zeile(['1021', 'BEL', '16', '18,40']),
      zeile(['2281', 'BEB', '16']),
    ])
    expect(blatt.schema.B['16']).toBe('ww')
    expect(blatt.positionen).toEqual(expect.arrayContaining([
      expect.objectContaining({ ebene: 'GOZ', nr: '2210', zahn: '16', faktor: 3.5 }),
      expect.objectContaining({ ebene: 'BEL', nr: '1021', zahn: '16', betrag: 18.4 }),
      expect.objectContaining({ ebene: 'BEB', nr: '2281', zahn: '16' }),
    ]))
  })

  it('liest eine Zahnleiste, die das PDF als einen Textblock liefert', () => {
    const schema = schemaAusZeilen([
      { teile: [{ x: 40, w: 448, text: obere.join(' ') }] },
      { teile: [{ x: 40, w: 448, text: obere.map((z) => (z === '15' ? 'f' : z === '14' || z === '16' ? 'ww' : 'k')).join(' ') }] },
    ])
    expect(schema.B['15']).toBe('f')
    expect(schema.B['14']).toBe('ww')
    expect(schema.B['16']).toBe('ww')
    expect(schema.B['11']).toBe('k')
  })

  it('gibt die Textschicht mit Lage weiter, ohne sie selbst zum Plan zu machen', () => {
    const text = textSchicht([
      zeile(obere),
      zeile(['2210', 'GOZ', '16']),
    ], 1)
    expect(text.startsWith('Seite 1\n')).toBe(true)
    expect(text).toContain('18 17 16 15')
    expect(text).toContain('2210 GOZ 16')
    expect(text).not.toContain('@')
  })

  it('sagt, wenn das PDF leer oder ohne Befund ist', () => {
    expect(planAusHkpZeilen([])).toEqual({ fehler: 'Das PDF enthält keinen Text. Bitte den HKP aus dem Praxisprogramm speichern, nicht als Scan.' })
    expect(planAusHkpZeilen([zeile(['GOZ', '2210'])])).toEqual({ fehler: 'Im PDF steht kein Befund je Zahn.' })
  })
})

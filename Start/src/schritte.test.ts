import { describe, expect, it } from 'vitest'
import { alleRegelOrte, behandlungsschritte, positionenAusFassung, positionenAusHkp, schritteAnzahl, zuschlaege, type SchrittPosition } from './schritte'
import { RECHNUNG_ORT, mitUeberschrift, nachSchritten } from './rechnungGliederung'

const p = (ebene: string, nr: string, zahn = '', mehr: Partial<SchrittPosition> = {}): SchrittPosition => ({ ebene, nr, zahn, anzahl: 1, ...mehr })

/** Leistungsfolge eines gespeicherten Implantatplans (ohne Sitzung, wie vor dieser Änderung abgelegt). */
const IMPLANTAT: SchrittPosition[] = [
  p('GOZ', '0030'), p('GOZ', '5170', 'OK'), p('GOZ', '6000a', '', { bezeichnung: 'Digitale Volumentomographie gemäß § 6 Abs. 1 GOZ' }),
  p('GOZ', '9000', 'OK'), p('GOZ', '9003'), p('GOZ', '0080', '11-15'), p('GOZ', '0090', '15,13,11', { anzahl: 18 }),
  p('GOZ', '0530'), p('GOZ', '3060'), p('GOZ', '6190'), p('GOZ', '9005'), p('GOZ', '9010', '15,13,11', { anzahl: 3 }),
  p('GOZ', '9090'), p('GOZ', '9150'), p('GOZ', '3290'), p('GOZ', '3300'), p('GOZ', '0510'), p('GOZ', '9040', '15,13,11'),
  p('GOAE', '1'), p('GOAE', '34'), p('GOAE', '5'), p('GOAE', '5004'), p('GOAE', '5370'), p('GOAE', '5377'),
  p('GOAE', '2382'), p('GOAE', '5004'), p('GOAE', '444'),
  { ebene: 'MAT', nr: 'IMP', anzahl: 3, bezeichnung: 'Implantat' },
]

describe('behandlungsschritte', () => {
  const s = behandlungsschritte(IMPLANTAT, true)
  const texte = (l: { text: string; zahn: string }[]) => l.map((x) => (x.zahn ? `${x.text} ${x.zahn}` : x.text))

  it('füllt die drei Abschnitte', () => {
    expect(s.vor.length).toBeGreaterThan(5)
    expect(s.haupt.length).toBeGreaterThan(8)
    expect(s.kontrolle.length).toBeGreaterThan(1)
  })

  it('stellt Gespräch und Röntgen vor Schablone, in fester Reihenfolge', () => {
    const v = texte(s.vor)
    expect(v.indexOf('Beratung')).toBeLessThan(v.indexOf('Röntgen OPG'))
    expect(v.indexOf('Röntgen OPG')).toBeLessThan(v.indexOf('Röntgen DVT'))
    expect(v.indexOf('Röntgen DVT')).toBeLessThan(v.indexOf('DVT auswerten'))
    expect(v.indexOf('DVT auswerten')).toBeLessThan(v.indexOf('Orientierungsschablone erstellen und anpassen'))
  })

  it('zerlegt Injektion und Implantat je Zahn', () => {
    const h = texte(s.haupt)
    expect(h).toEqual(expect.arrayContaining(['Injektion 15', 'Injektion 13', 'Injektion 11', 'Implantat setzen 15', 'Implantat setzen 13', 'Implantat setzen 11']))
    expect(h.indexOf('Injektion 11')).toBeLessThan(h.indexOf('Implantat setzen 15'))
    expect(h.indexOf('Oberflächenanästhesie 11-15')).toBeLessThan(h.indexOf('Injektion 15'))
  })

  it('lässt Zuschläge und Material weg', () => {
    const alle = [...s.vor, ...s.haupt, ...s.kontrolle]
    expect(alle.some((x) => ['GOZ 0530', 'GOZ 0510', 'GOÄ 444'].includes(x.leistung))).toBe(false)
    expect(alle.some((x) => x.text === 'Implantat')).toBe(false)
  })

  it('wertet das zweite OPG als Kontrolle', () => {
    expect(texte(s.kontrolle)).toEqual(expect.arrayContaining(['Röntgenkontrolle OPG', 'Kontrolle nach dem Eingriff', 'Wunde nachbehandeln']))
    expect(texte(s.vor).filter((t) => t === 'Röntgen OPG')).toHaveLength(1)
  })

  it('nimmt für unbekannte Nummern den Leistungstext', () => {
    expect(texte(s.haupt)).toContain('Digitale Volumentomographie')
    const alt = behandlungsschritte([p('GOZ', '2430a', '15', { bezeichnung: 'analog § 6 Abs. 1 GOZ' }), p('GOZ', '9050a', '', { bezeichnung: 'Resonanzfrequenzanalyse, analog § 6 Abs. 1 GOZ' })])
    expect(texte(alt.haupt)).toEqual(['Analogleistung GOZ 2430a 15', 'Resonanzfrequenzanalyse'])
  })

  it('ordnet nach Sitzung, wenn der Planer sie mitgibt', () => {
    const mit = behandlungsschritte([
      p('GOAE', '5004', '', { sitzung: 1 }), p('GOZ', '9003', '', { sitzung: 1 }),
      p('GOZ', '0090', '36', { sitzung: 2 }), p('GOZ', '9100', '36', { sitzung: 2 }), p('GOZ', '3290', '', { sitzung: 2 }),
      p('GOZ', '9003', '', { sitzung: 3 }), p('GOZ', '0090', '36', { sitzung: 3 }), p('GOZ', '9010', '36', { sitzung: 3 }), p('GOAE', '5004', '', { sitzung: 3 }),
      p('GOZ', '9040', '36', { sitzung: 4 }),
      p('GOZ', '3290', '', { sitzung: 5 }), p('GOZ', '0090', '36', { sitzung: 5 }),
    ], true)
    expect(texte(mit.vor)).toEqual(['Röntgen OPG', 'Orientierungsschablone erstellen und anpassen'])
    expect(mit.haupt.map((x) => `${x.phase}: ${x.text}`)).toEqual([
      'Knochenaufbau: Injektion', 'Knochenaufbau: Knochenaufbau',
      'Implantation: Orientierungsschablone einsetzen', 'Implantation: Injektion', 'Implantation: Implantat setzen',
      'Freilegung: Implantat freilegen, Gingivaformer einsetzen',
    ])
    expect(mit.kontrolle.map((x) => `${x.phase}: ${x.text}`)).toEqual([
      'Knochenaufbau: Kontrolle nach dem Eingriff', 'Implantation: Röntgenkontrolle OPG',
      'Nachsorge: Injektion', 'Nachsorge: Kontrolle nach dem Eingriff',
    ])
  })

  it('ändert sich mit dem Plan', () => {
    const ohne = behandlungsschritte(IMPLANTAT.filter((x) => x.nr !== '9090' && x.nr !== '9150'), true)
    expect(schritteAnzahl(ohne)).toBe(schritteAnzahl(s) - 2)
  })

  it('liest die Positionen aus der gespeicherten Fassung', () => {
    expect(positionenAusFassung([{ positionen: [p('GOZ', '2100', '16')] }, { positionen: [p('GOZ', '2197', '16')] }])).toHaveLength(2)
    expect(positionenAusFassung(undefined)).toEqual([])
    expect(schritteAnzahl(behandlungsschritte([]))).toBe(0)
  })

  it('leitet die Schritte eines geschriebenen HKP aus dem Plan ab', () => {
    const plan = {
      positionen: [
        p('GOZ', '2210', '16'),
        p('BEMA', '19', '15'),
        { ebene: 'BEB', nr: '0002', zahn: '16', anzahl: 1 },
        { ebene: 'GOZ', nr: '0110', zahn: '', anzahl: 1 },
      ],
    }
    const ausText = positionenAusHkp(JSON.stringify(plan))
    expect(ausText).toHaveLength(4)
    expect(schritteAnzahl(behandlungsschritte(ausText))).toBe(2)
    expect(positionenAusHkp('')).toEqual([])
    expect(positionenAusHkp('{')).toEqual([])
  })
})

describe('Schienenplan in der Reihenfolge der Behandlung', () => {
  // Reihenfolge wie im Kostenvoranschlag des Privat-KB-Planers
  const plan: SchrittPosition[] = [
    p('GOAE', '5004'), p('GOZ', '0065'), p('GOZ', '7010'), p('GOZ', '7040'), p('GOZ', '7050'),
    p('GOZ', '8010'), p('GOZ', '8020'), p('GOZ', '8050'), p('GOZ', '8080'), p('GOZ', '8000'),
  ]
  const s = behandlungsschritte(plan)

  it('führt den Hauptteil von der Funktionsanalyse bis zur Eingliederung', () => {
    expect(s.haupt.map((x) => x.leistung)).toEqual(['GOZ 8000', 'GOZ 8010', 'GOZ 8020', 'GOZ 8050', 'GOZ 8080', 'GOZ 7010'])
    expect([...new Set(s.haupt.map((x) => x.phase))]).toEqual(['Funktionsanalyse', 'Registrierung', 'Modellanalyse', 'Eingliederung'])
  })

  it('stellt die Kontrollen unter Kontrolle', () => {
    expect(s.kontrolle.map((x) => x.leistung)).toEqual(['GOZ 7040', 'GOZ 7050'])
    expect(s.vor.map((x) => x.leistung)).toEqual(['GOÄ 5004', 'GOZ 0065'])
  })

  it('ordnet Kassenplan PAR und Schiene gleich', () => {
    const k = behandlungsschritte([p('BEMA', 'UPTa'), p('BEMA', 'BEVa'), p('BEMA', 'AITa'), p('BEMA', 'MHU'), p('BEMA', 'ATG'), p('BEMA', '4'), p('BEMA', 'K7'), p('BEMA', 'K1')])
    expect(k.vor.map((x) => x.leistung)).toEqual(['BEMA 4', 'BEMA ATG', 'BEMA MHU'])
    expect(k.haupt.map((x) => x.leistung)).toEqual(['BEMA AITa', 'BEMA K1'])
    expect(k.kontrolle.map((x) => x.leistung)).toEqual(['BEMA BEVa', 'BEMA K7', 'BEMA UPTa'])
  })
})

describe('Rechnungsgliederung', () => {
  it('kennt dieselben Leistungen wie die Schritte', () => {
    const regeln = alleRegelOrte()
    expect(Object.keys(RECHNUNG_ORT).sort()).toEqual(Object.keys(regeln).sort())
    for (const [k, v] of Object.entries(regeln)) expect(RECHNUNG_ORT[k]).toEqual([v.a, v.rang])
    expect([...zuschlaege].every((k) => !(k in RECHNUNG_ORT))).toBe(true)
  })

  it('ordnet die Rechnung wie die Schritte und setzt nur Überschriften', () => {
    const zeilen = [
      { nr: '2200' }, { nr: '0010' }, { nr: '3290' }, { nr: '6190' }, { nr: '0090' }, { nr: '0530' },
    ]
    const folge = nachSchritten(zeilen, (z) => ({ ebene: 'GOZ', nr: z.nr })).map((z) => z.nr)
    expect(folge).toEqual(['0010', '0090', '0530', '2200', '6190', '3290'])
    const titel = mitUeberschrift(zeilen, (z) => ({ ebene: 'GOZ', nr: z.nr })).map((z) => z.ueberschrift).filter(Boolean)
    expect(titel).toEqual([
      'Vorbereitende Maßnahmen',
      'Hauptbehandlung · Betäubung und Arbeitsfeld',
      'Hauptbehandlung · Chirurgischer Eingriff',
      'Hauptbehandlung · Eingliederung',
      'Abschließende Maßnahmen',
      'Kontrollen',
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { behandlungsschritte, positionenAusFassung, schritteAnzahl, type SchrittPosition } from './schritte'

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
})

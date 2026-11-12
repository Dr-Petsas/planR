import { describe, expect, it } from 'vitest'
import { analogZiel, gozGruppe, gozPreis, istAnalog, laborGruppe, laborZeilen, materialGruppe, materialZeilen, trainingHtml } from './training'
import type { PraxisKatalog } from '../praxiskatalog.ts'
import type { FallAnsicht } from './fallkatalog'

const katalog: PraxisKatalog = {
  pvs: 'DS-Win',
  stand: '2026-11-09T18:00:00.000Z',
  wahl: { liste: 1, spalte: 1, faktoren: true, belListe: 2, belSpalte: 1 },
  listeName: 'Eigenlabor',
  belListeName: 'BEL Praxis',
  eigenlabor: [
    { nr: '3001', text: 'Teleskopkrone Praxis', preis: 280, ersetzt: '3001' },
    { nr: 'MAT-AU', text: 'Abutment', preis: 89, material: 'AU', werkstoff: 'Titan' },
  ],
  bel: [{ nr: '1200', text: 'Teleskopkrone', preis: 210.5 }],
  goz: [
    { nr: '2200', text: 'Vollkrone', punkte: 1322, eigen: false },
    { nr: '2200a', text: 'Vollkrone Keramik Praxis', punkte: 0, eigen: true, analogZu: '2200', faktor: 3.5, betrag: 420 },
  ],
  komplexe: [],
}

const faelle: FallAnsicht = {
  zeilen: [{ id: 'ze-krone-regel', gruppe: 'Zahnersatz Kasse', titel: 'Krone, Regelversorgung', soll: 4, ist: 1, fertig: false, hinweis: 'Plan als JSON' }],
  soll: 4, ist: 1, arten: 1, artenFertig: 0, regeln: 0,
}

describe('KI-Training', () => {
  it('nimmt nur die eigenen GOZ- und Analogpositionen', () => {
    expect(katalog.goz.filter(istAnalog).map((g) => g.nr)).toEqual(['2200a'])
    expect(laborZeilen(katalog.eigenlabor).map((e) => e.nr)).toEqual(['3001'])
    expect(materialZeilen(katalog.eigenlabor).map((e) => e.nr)).toEqual(['MAT-AU'])
  })

  it('öffnet mit Erklärung und zwei Kacheln', () => {
    const html = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false })
    expect(html).toContain('Clara erfindet hier keine Nummer')
    expect(html).toContain('data-ansicht="hkp"')
    expect(html).toContain('HKPs hochladen')
    expect(html).toContain('data-ansicht="listen"')
    expect(html).toContain('Analog- und Laborpositionen')
    expect(html).toContain('1 von 4 Plänen')
    expect(html).toContain('1 Analog · 1 Labor')
    expect(html).not.toContain('data-fall=')
  })

  it('zeigt HKP-Arten und Preise erst in der Zebra-Liste der Kachel', () => {
    const hkp = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'hkp' })
    expect(hkp).toContain('data-hkp-gruppe="Zahnersatz Kasse"')
    expect(hkp).not.toContain('data-fall=')
    const art = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'hkp', hkpGruppe: 'Zahnersatz Kasse' })
    expect(art).toContain('train-zebra')
    expect(art).toContain('data-fall="ze-krone-regel"')
    expect(art).toContain('Hochladen')
    const preise = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen' })
    expect(preise).toContain('data-bereich="goz"')
    expect(preise).not.toContain('2200a')
    const zeile = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen', bereich: 'goz', gruppe: 'Konservierend' })
    expect(zeile).toContain('2200a')
    expect(zeile).toContain('420,00')
    expect(zeile).toContain('3,5')
    const labor = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen', bereich: 'labor', gruppe: 'Teleskope und Stege' })
    expect(labor).toContain('280,00')
    const material = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen', bereich: 'material', gruppe: 'Implantatteile' })
    expect(material).toContain('89,00')
    const bel = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen', bereich: 'bel', gruppe: 'Schablonen' })
    expect(bel).toContain('210,50')
  })

  it('findet 9100a und CAD-Scan auch ohne gespeicherten Eurobetrag', () => {
    const praxis = {
      ...katalog,
      goz: [...katalog.goz, { nr: '9100a', text: 'Herstellung und Einbringen einer PRF-Matrix', punkte: 2694, eigen: true }],
      eigenlabor: [...katalog.eigenlabor, { nr: '0901', text: 'CAD: Anlage Auftragsdaten', preis: 62.65, ersetzt: '0901' }, { nr: '0007', text: 'Oralscan aufbereiten', preis: 6, ersetzt: '0007' }],
    }
    const html = trainingHtml({ admin: true, filter: '9100a', katalog: praxis, faelle, hinweis: '', laeuft: false, ansicht: 'listen' })
    expect(istAnalog(praxis.goz[2])).toBe(true)
    expect(analogZiel(praxis.goz[2])).toBe('9100')
    expect(gozPreis(praxis.goz[2])).toBeCloseTo(2694 * 0.0562421 * 2.3, 2)
    expect(html).toContain('9100a')
    expect(html).toContain('PRF-Matrix')
    expect(html).not.toContain('2200a')
    const cad = trainingHtml({ admin: true, filter: 'CAD CAM Scan', katalog: praxis, faelle, hinweis: '', laeuft: false, ansicht: 'listen' })
    expect(cad).toContain('CAD: Anlage Auftragsdaten')
    expect(cad).toContain('62,65')
    expect(cad).toContain('Oralscan aufbereiten')
  })

  it('filtert die Listen und lässt den Upload für andere zu', () => {
    const html = trainingHtml({ admin: false, filter: 'Abutment', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen' })
    expect(html).toContain('Abutment')
    expect(html).not.toContain('2200a')
    expect(html).not.toContain('data-fall=')
  })

  it('legt Labor und Material in Gruppen und findet Bio-Oss, Micross und Titan', () => {
    expect(laborGruppe({ nr: '0901', text: 'CAD: Anlage Auftragsdaten' })).toBe('CAD und Scan')
    expect(laborGruppe({ nr: '0007', text: 'Oralscan aufbereiten' })).toBe('CAD und Scan')
    expect(laborGruppe({ nr: '2101', text: 'Krone gegossen' })).toBe('Kronen')
    expect(materialGruppe({ nr: 'MEMBN', text: 'nicht resorbierbare Membran', material: 'm' })).toBe('Knochen und Membran')
    expect(materialGruppe({ nr: 'M1', text: 'BegoPal', material: 'm' })).toBe('Legierungen')
    expect(materialGruppe({ nr: 'F03', text: 'Straumann Abformpfosten', material: 'f' })).toBe('Implantatteile')
    expect(gozGruppe('9100a')).toBe('Aufbau und Augmentation')
    const praxis = { ...katalog, eigenlabor: [...katalog.eigenlabor, { nr: '0901', text: 'CAD: Anlage Auftragsdaten', preis: 62.65 }] }
    const html = trainingHtml({ admin: true, filter: '', faelle, hinweis: '', laeuft: false, ansicht: 'listen', katalog: praxis })
    const labor = trainingHtml({ admin: true, filter: '', katalog: praxis, faelle, hinweis: '', laeuft: false, ansicht: 'listen', bereich: 'labor' })
    expect(labor).toContain('CAD und Scan')
    expect(labor).toContain('Teleskope und Stege')
    const knochen = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen', bereich: 'knochen' })
    expect(knochen).toContain('Knochenersatz')
    const liste = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen', bereich: 'knochen', gruppe: 'Knochenersatz' })
    expect(liste).toContain('Bio-Oss')
    const titan = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen', bereich: 'knochen', gruppe: 'Membran und Titan' })
    expect(titan).toContain('Yxoss')
    const gewinnung = trainingHtml({ admin: true, filter: '', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen', bereich: 'knochen', gruppe: 'Knochengewinnung' })
    expect(gewinnung).toContain('Micross')
    expect(html).not.toContain('<details')
    const micro = trainingHtml({ admin: true, filter: 'microoss', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen' })
    expect(micro).toContain('Micross')
    expect(micro).not.toContain('Bio-Oss spongiös')
    const mesh = trainingHtml({ admin: true, filter: 'titan mesh', katalog, faelle, hinweis: '', laeuft: false, ansicht: 'listen' })
    expect(mesh).toContain('Yxoss')
    expect(mesh).toContain('Titangitter')
  })

  it('sagt, wenn noch nichts aus dem Praxisprogramm da ist', () => {
    const html = trainingHtml({ admin: true, filter: '', katalog: null, faelle, hinweis: '', laeuft: false, ansicht: 'listen' })
    expect(html).toContain('Noch keine Preise')
  })
})

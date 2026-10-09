import { describe, expect, it } from 'vitest'
import { datumIso, hkpFuerPvs, patientWaehlen } from './pvs'

const t = (id: string, firstName: string, lastName: string, birthDate = '') => ({ id, firstName, lastName, birthDate })

describe('PVS-Export: Patient zuordnen', () => {
  it('Datum aus Plan und PVS vergleichbar', () => {
    expect(datumIso('3.7.1958')).toBe('1958-07-03')
    expect(datumIso('1958-07-03')).toBe('1958-07-03')
    expect(datumIso('irgendwas')).toBe('')
  })

  it('genau ein gleichnamiger Patient, Groß-/Kleinschreibung und Leerzeichen egal', () => {
    const treffer = [t('1', 'Helmut', 'Mustermann'), t('2', 'Helmuth', 'Mustermann'), t('3', 'Helmut', 'Mustermann-Klein')]
    expect(patientWaehlen(treffer, { vorname: ' helmut ', name: 'MUSTERMANN' }, 'DENSoffice')).toEqual({ id: '1' })
  })

  it('Geburtsdatum im Plan entscheidet zwischen Namensgleichen', () => {
    const treffer = [t('1', 'Anna', 'Muster', '1960-01-01'), t('2', 'Anna', 'Muster', '1985-05-05')]
    expect(patientWaehlen(treffer, { vorname: 'Anna', name: 'Muster', geburtsdatum: '05.05.1985' }, 'DENSoffice')).toEqual({ id: '2' })
  })

  it('ohne eindeutigen Treffer kein Schreiben', () => {
    const zwei = [t('1', 'Anna', 'Muster'), t('2', 'Anna', 'Muster')]
    expect(patientWaehlen(zwei, { vorname: 'Anna', name: 'Muster' }, 'DENSoffice').fehler).toMatch(/2-mal.*Geburtsdatum/)
    expect(patientWaehlen([], { vorname: 'Anna', name: 'Muster' }, 'DENSoffice').fehler).toMatch(/gibt es in DENSoffice nicht/)
    expect(patientWaehlen([t('1', 'Anna', 'Muster', '1960-01-01')], { vorname: 'Anna', name: 'Muster', geburtsdatum: '1985-05-05' }, 'DENSoffice').fehler)
      .toMatch(/anderem Geburtsdatum/)
    expect(patientWaehlen([t('1', 'Anna', 'Muster')], { vorname: '', name: 'Muster' }, 'DENSoffice').fehler).toMatch(/fehlt/)
  })
})

describe('PVS-Export: HKP-Daten', () => {
  it('nimmt die berechneten Positionen (Material, Menge nach Werkstoff) statt der gespeicherten Planzeilen', () => {
    const plan = {
      patient: { name: 'Muster' }, verwaltung: { ausstellungsdatum: '2026-10-09', erlaeuterung: 'lang' }, zuschuss: { bonus: 60 }, zaehne: { 16: { B: 'ww' } },
      positionen: [{ id: 'a', ebene: 'BEL', nr: '9700', anzahl: 2 }],
    }
    const ergebnis = {
      versorgungsart: 'regel', summen: { gesamt: 1 }, befunde: [{ nr: '1.1' }], hinweise: ['groß'],
      positionen: [
        { id: 'a', ebene: 'BEL', nr: '9700', anzahl: 1, zahn: '26', labor: 'eigen', betrag: 17.22, einzelpreis: 17.22, text: 'NEM' },
        { id: 'mat-16', ebene: 'MAT', nr: '', anzahl: 2.5, zahn: '16', labor: 'eigen', betrag: 350, einzelpreis: 140, bezeichnung: 'Hochgoldlegierung (Au ≥ 75 %), Krone' },
        { id: 'g', ebene: 'GOZ', nr: '2210', anzahl: 1, zahn: '15', faktor: 3.5, betrag: 330.31, einzelpreis: 330.31, punkte: 1678, faktorBegruendung: 'lang' },
      ],
    }
    const d = JSON.parse(hkpFuerPvs(plan, ergebnis))
    expect(d.positionen).toEqual([
      { id: 'a', ebene: 'BEL', nr: '9700', anzahl: 1, zahn: '26', labor: 'eigen' },
      { id: 'mat-16', ebene: 'MAT', nr: '', anzahl: 2.5, zahn: '16', labor: 'eigen', bezeichnung: 'Hochgoldlegierung (Au ≥ 75 %), Krone' },
      { id: 'g', ebene: 'GOZ', nr: '2210', anzahl: 1, zahn: '15' },
    ])
    expect(d.ergebnis.positionen[1]).toEqual({ id: 'mat-16', betrag: 350, einzelpreis: 140 })
    expect(d.ergebnis.positionen[2]).toEqual({ id: 'g', betrag: 330.31, einzelpreis: 330.31, punkte: 1678, faktor: 3.5 })
    expect(d.verwaltung).toEqual({ ausstellungsdatum: '2026-10-09' })
    expect(d.patient).toBeUndefined()
    expect(d.ergebnis.hinweise).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { befundAuftrag, befundAusPvs, datumIso, hkpFuerPvs, patientWaehlen, planungJeZahn } from './pvs'

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

  it('Zeile TP: Implantat statt Regelbrücke lässt die Anker leer, Regelbrücke und Prothese bleiben', () => {
    const implantat = planungJeZahn(
      { 35: { R: 'K' }, 36: { B: 'f', R: 'B', TP: 'SK' }, 37: { R: 'K' } },
      [{ ebene: 'GOZ', nr: '2270', zahn: '36' }, { ebene: 'BEB', nr: '0009', zahn: 'UK' }, { ebene: 'BEMA', nr: '19', zahn: '36' }],
    )
    expect(implantat).toEqual({ 35: '', 36: 'SK', 37: '' })
    const regel = planungJeZahn(
      { 34: { R: 'K' }, 35: { B: 'f', R: 'B' }, 36: { R: 'K' }, 31: { B: 'f', R: 'E' }, 41: { B: 'f', R: 'E' } },
      [{ ebene: 'BEMA', nr: '91b', zahn: '34' }, { ebene: 'BEMA', nr: '91b', zahn: '36' }, { ebene: 'BEMA', nr: '92', zahn: '34-36' }, { ebene: 'BEMA', nr: '96a', zahn: 'UK' }],
    )
    expect(regel).toEqual({ 34: 'K', 35: 'B', 36: 'K', 31: 'E', 41: 'E' })
  })
})

describe('Befund aus dem und ins PVS', () => {
  const zahn = (status: string) => ({ raw: '', status, missing: status === 'f' })
  it('übernimmt jedes Kürzel unverändert, auch eigene des PVS', () => {
    const b = befundAusPvs({
      version: 'v1', current: { date: '', teeth: { 18: zahn('f'), 16: zahn('sk'), 15: zahn('t1'), 11: zahn('') } },
      items: [{ date: '2026-10-12' }, { date: '2025-01-01' }],
    })
    expect(b?.version).toBe('v1')
    expect(b?.datum).toBe('2026-10-12')
    expect(b?.zaehne).toMatchObject({ 18: 'f', 16: 'sk', 15: 't1', 11: '', 48: '' })
    expect(Object.keys(b!.zaehne)).toHaveLength(32)
    expect(befundAusPvs({ current: { teeth: {} } })).toBeNull()
  })

  it('schreibt nur die genannten Kiefer, ohne Kürzel heißt vorhanden', () => {
    const t = befundAuftrag({ 18: 'f', 17: '', 16: 'kw', 36: 'x' }, ['OK'])
    expect(t).toEqual({ 18: 'f', 17: 'healthy', 16: 'kw' })
    expect(befundAuftrag({ 18: 'f', 36: 'x' }, ['OK', 'UK', 'XX'])).toEqual({ 18: 'f', 36: 'x' })
    expect(befundAuftrag({ 18: 'f' }, [])).toEqual({})
  })
})

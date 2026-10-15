import { describe, expect, it } from 'vitest'
import { befundZeile, datumIso, kostenvoranschlag, laborTeilen, pvsArt, pvsZahn } from './pvsplan'

describe('Plan fürs Praxisprogramm', () => {
  it('Zahnangaben wie DS-Win', () => {
    expect(pvsZahn('16')).toBe('16')
    expect(pvsZahn('34-36')).toBe('34-36')
    expect(pvsZahn('OK-R')).toBe('')
    expect(pvsZahn('UK')).toBe('UK')
    expect(pvsZahn(undefined)).toBe('')
  })

  it('Art je Gebührennummer', () => {
    expect(pvsArt('9010', 'ZE')).toBe('IM')
    expect(pvsArt('2210', 'IM')).toBe('ZE')
    expect(pvsArt('5120', 'KO')).toBe('ZE')
    expect(pvsArt('2080', 'KO')).toBe('KO')
    expect(pvsArt('0100', 'IM')).toBe('IM')
  })

  it('Labor brutto anteilig auf Eigen- und Fremdlabor', () => {
    expect(laborTeilen([{ betrag: 100, labor: 'eigen' }, { betrag: 100, labor: 'fremd' }], 214)).toEqual({ laborEigen: 107, laborFremd: 107 })
    expect(laborTeilen([], 0)).toEqual({ laborEigen: 0, laborFremd: 0 })
  })

  it('Kostenvoranschlag mit stimmigen Summen', () => {
    const p = kostenvoranschlag({
      art: 'ZE', titel: 'PlanR Privat-ZE 1', datum: '15.10.2026', laborBrutto: 107,
      positionen: [
        { ebene: 'GOZ', nr: '2210', zahn: '16', anzahl: 1, faktor: 2.3, einzelpreis: 217.06, betrag: 217.06 },
        { ebene: 'BEB', nr: '0002', zahn: '16', anzahl: 1, einzelpreis: 100, betrag: 100, labor: 'eigen' },
      ],
    })
    expect(p.datum).toBe('2026-10-15')
    expect(p.summen).toEqual({ honorar: 217.06, laborEigen: 107, laborFremd: 0, gesamt: 324.06 })
  })

  it('Datum und Befundzeile', () => {
    expect(datumIso('2026-10-15T08:00')).toBe('2026-10-15')
    expect(befundZeile({ 16: { B: 'ww' }, 17: { B: '' }, 99: { B: 'f' }, 18: { B: 'KM' } })).toEqual({ 16: { B: 'ww' }, 17: { B: '' } })
  })
})

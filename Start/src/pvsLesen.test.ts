import { describe, expect, it } from 'vitest'
import { patientFuerLesen } from './pvsLesen'

const t = (id: string, firstName: string, lastName: string, birthDate: string) => ({ id, firstName, lastName, birthDate })
const wer = { vorname: 'Erika', name: 'Beispiel', geburtsdatum: '1970-03-01' }

describe('Patient für das Lesen der Leistungen', () => {
  it('ohne Nummer: Nachname gleich, erster Vorname gleich, Geburtsdatum genau gleich', () => {
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1970-03-01')], wer, 'DS-Win')).toEqual({ id: '7' })
    expect(patientFuerLesen([t('7', 'ERIKA', ' beispiel ', '01.03.1970')], wer, 'DS-Win')).toEqual({ id: '7' })
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1970-03-02')], wer, 'DS-Win').fehler).toContain('anderem Geburtsdatum')
    expect(patientFuerLesen([t('7', 'Erika', 'Beispielmann', '1970-03-01')], wer, 'DS-Win').fehler).toContain('gibt es in DS-Win nicht')
    expect(patientFuerLesen([], wer, 'DS-Win').fehler).toContain('gibt es in DS-Win nicht')
  })

  it('erster Vorname zählt, in beide Richtungen; ein anderer erster Vorname nicht', () => {
    expect(patientFuerLesen([t('7', 'Erika Maria', 'Beispiel', '1970-03-01')], wer, 'DS-Win')).toEqual({ id: '7' })
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1970-03-01')], { ...wer, vorname: 'Erika Maria' }, 'DS-Win')).toEqual({ id: '7' })
    expect(patientFuerLesen([t('7', 'Maria Erika', 'Beispiel', '1970-03-01')], wer, 'DS-Win').id).toBeUndefined()
    expect(patientFuerLesen([t('7', 'Erika-Maria', 'Beispiel', '1970-03-01')], wer, 'DS-Win').id).toBeUndefined()
    expect(patientFuerLesen([t('7', 'Erik', 'Beispiel', '1970-03-01')], wer, 'DS-Win').id).toBeUndefined()
  })

  it('mehr als ein Treffer: kein Ergebnis', () => {
    const zwei = [t('7', 'Erika', 'Beispiel', '1970-03-01'), t('8', 'Erika Maria', 'Beispiel', '1970-03-01')]
    const r = patientFuerLesen(zwei, wer, 'DS-Win')
    expect(r.id).toBeUndefined()
    expect(r.fehler).toContain('2-mal')
    expect(patientFuerLesen([...zwei, t('9', 'Erika', 'Beispiel', '1980-01-01')], { ...wer, geburtsdatum: '1980-01-01' }, 'DS-Win')).toEqual({ id: '9' })
  })

  it('ohne Nummer gibt es keinen Tag Spiel', () => {
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1970-03-02')], wer, 'DS-Win').id).toBeUndefined()
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1970-02-28')], wer, 'DS-Win').id).toBeUndefined()
  })

  it('mit Nummer: genau dieser Patient, Geburtsdatum gleich oder im Praxisprogramm genau einen Tag später', () => {
    expect(patientFuerLesen([t('7', 'Erika Maria', 'Beispiel', '1970-03-01')], wer, 'DS-Win', '7')).toEqual({ id: '7' })
    expect(patientFuerLesen([t('7', 'Erika Maria', 'Beispiel', '1970-03-02')], wer, 'DS-Win', '7')).toEqual({ id: '7' })
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1970-03-03')], wer, 'DS-Win', '7').fehler).toContain('anderem Geburtsdatum')
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1970-02-28')], wer, 'DS-Win', '7').id).toBeUndefined()
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1971-01-01')], { ...wer, geburtsdatum: '1970-12-31' }, 'DS-Win', '7')).toEqual({ id: '7' })
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1972-03-01')], { ...wer, geburtsdatum: '1972-02-29' }, 'DS-Win', '7')).toEqual({ id: '7' })
  })

  it('mit Nummer: anderer Name oder andere Nummer ergibt nichts, auch wenn ein Namensvetter passt', () => {
    expect(patientFuerLesen([t('7', 'Otto', 'Beispiel', '1970-03-01')], wer, 'DS-Win', '7').fehler).toContain('anderer Name')
    expect(patientFuerLesen([t('8', 'Erika', 'Beispiel', '1970-03-01')], wer, 'DS-Win', '7').fehler).toContain('Patientennummer 7 gibt es')
    expect(patientFuerLesen([t('7', 'Otto', 'Anders', '1970-03-01'), t('8', 'Erika', 'Beispiel', '1970-03-01')], wer, 'DS-Win', '7').id).toBeUndefined()
  })

  it('ohne Name oder Geburtsdatum wird nicht gesucht', () => {
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1970-03-01')], { ...wer, geburtsdatum: '' }, 'DS-Win').fehler).toContain('Ohne Geburtsdatum')
    expect(patientFuerLesen([t('7', 'Erika', 'Beispiel', '1970-03-01')], { ...wer, geburtsdatum: '' }, 'DS-Win', '7').id).toBeUndefined()
    expect(patientFuerLesen([t('7', '', 'Beispiel', '1970-03-01')], { ...wer, vorname: '' }, 'DS-Win').fehler).toContain('fehlt')
    expect(patientFuerLesen([t('7', 'Erika', '', '')], { vorname: 'Erika', name: '', geburtsdatum: '' }, 'DS-Win').id).toBeUndefined()
  })
})
import { describe, expect, it } from 'vitest'
import { dauerText, geschlecht, grundVon, kalenderErlaubt, motivPasst, slotBadge, stammAus, terminKurz, type TerminMotiv } from './termin'

const motiv = (ueber: Partial<TerminMotiv>): TerminMotiv => ({
  id: 'm1', name: 'Besprechung', dauer: 30, locationId: 'loc', calendarIds: [], grund: 'besprechung', ...ueber,
})

describe('CalendR nur mit Pickadoc', () => {
  it('erlaubt den Kalender über MAS, nicht im PlanR-Standalone', () => {
    expect(kalenderErlaubt('mas', 'voll')).toBe(true)
    expect(kalenderErlaubt('mas', 'aus')).toBe(true)
    expect(kalenderErlaubt('', 'voll')).toBe(true)
    expect(kalenderErlaubt('planr', 'planr')).toBe(false)
    expect(kalenderErlaubt('planr', 'aus')).toBe(false)
    expect(kalenderErlaubt('', 'aus')).toBe(false)
  })
})

describe('Behandlungsgrund', () => {
  it('erkennt Besprechung und Behandlungsstart, andere Gründe nicht', () => {
    expect(grundVon('Implantatbesprechung')).toBe('besprechung')
    expect(grundVon('Behandlungsstart')).toBe('start')
    expect(grundVon('Erstbehandlung')).toBe('start')
    expect(grundVon('Kontrolle')).toBe('')
    expect(grundVon('Professionelle Zahnreinigung')).toBe('')
  })
})

describe('Slotlänge', () => {
  it('schreibt Minuten und Stunden', () => {
    expect(dauerText(30)).toBe('30 min')
    expect(dauerText(60)).toBe('1 Std.')
    expect(dauerText(90)).toBe('1,5 Std.')
  })

  it('zeigt nur den Besuchsgrund der gewählten Länge im gewählten Kalender', () => {
    const a = motiv({})
    const b = motiv({ id: 'm2', dauer: 60, name: 'Lange Besprechung' })
    const c = motiv({ id: 'm3', grund: 'start', name: 'Behandlungsstart', calendarIds: ['anderer'] })
    expect(motivPasst(a, 'besprechung', 30, 'loc', 'cal')).toBe(true)
    expect(motivPasst(b, 'besprechung', 30, 'loc', 'cal')).toBe(false)
    expect(motivPasst(c, 'start', 30, 'loc', 'cal')).toBe(false)
    expect(motivPasst(c, 'start', 30, 'loc', 'anderer')).toBe(true)
  })

  it('formatiert Tag, Uhrzeit und Länge in Berliner Zeit', () => {
    expect(slotBadge('2026-11-10T09:30:00+01:00', 30)).toEqual({ tag: 'Di. 10.11.', uhrzeit: '09:30', laenge: '30 min' })
    expect(terminKurz('2026-11-10T09:30:00+01:00')).toBe('Di. 10.11. 09:30')
    expect(slotBadge('kein-datum', 30)).toBeNull()
  })
})

describe('Stammdaten', () => {
  it('nimmt Name, Telefon und E-Mail aus dem Plan und rät kein Geschlecht', () => {
    expect(stammAus({ vorname: 'Anna', name: 'Berger', email: 'anna@praxis.de', telefon: '0171 1234567', anrede: 'Frau' })).toMatchObject({
      name: 'Anna Berger', vorname: 'Anna', nachname: 'Berger', email: 'anna@praxis.de', telefon: '0171 1234567',
    })
    expect(stammAus({ firstName: 'Anna', lastName: 'Berger', mobilePhoneNumber: '01711234567' }, 'Fallback')).toMatchObject({
      name: 'Anna Berger', telefon: '01711234567',
    })
    expect(stammAus({}, 'Georgia Zaharia').name).toBe('Georgia Zaharia')
    expect(geschlecht('Frau')).toBe('f')
    expect(geschlecht('Herr')).toBe('m')
    expect(geschlecht('')).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { dauerStufen, dauerText, eigeneKalender, geschlecht, gleicherMoment, grundVon, kalenderErlaubt, motivFuerPlan, motivPasst, patientAbgleichen, patientGleich, slotBadge, stammAus, terminKurz, uhrZeiger, vermerkNachKalender, type Akte, type TerminMotiv } from './termin'

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

  it('nimmt für den Heil- und Kostenplan die ZE-Besprechung, auch bei 25 Minuten', () => {
    const motive = [
      motiv({ id: 'imp', name: 'IMP Besprechung', dauer: 30 }),
      motiv({ id: 'ze', name: 'ZE Besprechung', dauer: 25 }),
      motiv({ id: 'kfo', name: 'KFO Besprechung', dauer: 30 }),
    ]
    expect(motivFuerPlan('hkp', motive, 'besprechung')?.id).toBe('ze')
    expect(dauerStufen(motive, 'besprechung')).toEqual([25, 30])
    expect(motivFuerPlan('implantologie', motive, 'besprechung')?.id).toBe('imp')
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

  it('stellt die Uhr auf die angeklickte Zeit', () => {
    expect(uhrZeiger('11:50')).toEqual({ stunde: 355, minute: 300 })
    expect(uhrZeiger('09:30')).toEqual({ stunde: 285, minute: 180 })
    expect(uhrZeiger('00:00')).toEqual({ stunde: 0, minute: 0 })
    expect(uhrZeiger('')).toBeNull()
  })

  it('nimmt einen gelöschten Termin aus der Liste und merkt sich einen verschobenen', () => {
    const alt = { iso: '2026-11-10T11:50:00+01:00', behandler: 'Dr. Petsas', appointmentId: 'appt1', locationId: 'loc' }
    expect(vermerkNachKalender(alt, 'weg')).toBeNull()
    expect(vermerkNachKalender(alt, { appointmentId: 'appt1', locationId: 'loc', iso: '2026-11-10T10:50:00Z', geloescht: true })).toBeNull()
    expect(vermerkNachKalender(alt, { appointmentId: 'appt1', locationId: 'loc', iso: '2026-11-10T10:50:00Z', geloescht: false })).toBe(alt)
    expect(gleicherMoment(alt.iso, '2026-11-10T10:50:00Z')).toBe(true)
    expect(vermerkNachKalender(alt, { appointmentId: 'appt1', locationId: 'loc', iso: '2026-11-12T08:00:00Z', geloescht: false })?.iso).toBe('2026-11-12T08:00:00Z')
    expect(patientGleich('Michael Petsas', 'Michael', 'Petsas')).toBe(true)
    expect(patientGleich('Michael Petsas', 'Maria', 'Petsas')).toBe(false)
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
    expect(stammAus({ vorname: 'Michael', name: 'Petsas', geburtsdatum: '1962-04-03' }).geburt).toBe('1962-04-03')
    expect(stammAus({ name: 'Michael Petsas' })).toMatchObject({ vorname: 'Michael', nachname: 'Petsas' })
  })
})

describe('Eigener Kalender', () => {
  const liste = [
    { id: 'petsas', name: 'Dr. Petsas', locationId: 'ort', userId: 'uid-petsas' },
    { id: 'patrikis', name: 'Dr. Patrikis', locationId: 'ort', userId: 'uid-patrikis' },
    { id: 'alt', name: 'Sprechstunde Petsas', locationId: 'ort' },
  ]
  it('zeigt nur den Kalender des angemeldeten Kontos', () => {
    expect(eigeneKalender(liste, 'uid-petsas', 'Dr. Michael Petsas').map((k) => k.id)).toEqual(['petsas'])
  })
  it('fällt ohne Benutzer-ID auf den Nachnamen zurück und lässt Kollegen draußen', () => {
    expect(eigeneKalender(liste.map(({ userId: _u, ...k }) => k), '', 'Michael Petsas').map((k) => k.id)).toEqual(['petsas', 'alt'])
  })
})

describe('Patientenabgleich', () => {
  const plan = stammAus({ vorname: 'Michael', name: 'Petsas', geburtsdatum: '1962-04-03', anrede: 'Herr' })
  const pickadoc: Akte = { vorname: 'Michael', nachname: 'Petsas', geburt: '1962-04-03', telefone: ['01711234567'], anrede: 'm', email: 'm@example.de' }
  const dampsoft: Akte = { vorname: 'M', nachname: 'Petsas', geburt: '1962-04-03', telefone: ['0211 123456'], anrede: '', email: '' }
  it('nimmt die Handynummer, wenn Pickadoc und DS-Win dieselbe Person sind', () => {
    const a = patientAbgleichen(plan, [pickadoc], [dampsoft])
    expect(a.meldung).toBe('')
    expect(a.stamm.telefon).toBe('01711234567')
    expect(a.stamm.vorname).toBe('Michael')
    expect(a.stamm.anrede).toBe('Herr')
  })
  it('trägt nichts ein, wenn die Geburtsdaten auseinanderlaufen', () => {
    const ohneDatum = stammAus({ vorname: 'Michael', name: 'Petsas', anrede: 'Herr' })
    const a = patientAbgleichen(ohneDatum, [pickadoc], [{ ...dampsoft, geburt: '1970-01-01' }])
    expect(a.meldung).toMatch(/Geburtsdaten/)
    expect(a.stamm.telefon).toBe('')
  })
  it('nimmt die Akte, wenn der Plan ein anderes Geburtsdatum trägt als beide Karteien', () => {
    const a = patientAbgleichen(stammAus({ vorname: 'Michael', name: 'Petsas', geburtsdatum: '1900-01-01', anrede: 'Herr' }), [pickadoc], [dampsoft])
    expect(a.meldung).toBe('')
    expect(a.stamm.telefon).toBe('01711234567')
  })
  it('trägt nichts ein, wenn DS-Win zwei Patienten dieses Namens hat', () => {
    const zweiter: Akte = { vorname: 'Michael', nachname: 'Petsas', geburt: '1980-02-02', telefone: ['015112345678'], anrede: 'm', email: '' }
    const a = patientAbgleichen(stammAus({ vorname: 'Michael', name: 'Petsas' }), [pickadoc], [dampsoft, zweiter])
    expect(a.meldung).toMatch(/mehrere Patienten/)
  })
})

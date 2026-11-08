import { describe, expect, it } from 'vitest'
import { implAuftragVerstehen, implEntwurf, implVersorgungSatz, type ImplEntwurf, type Rueckfrage } from './index'

const ok = (r: ImplEntwurf | Rueckfrage): ImplEntwurf => {
  if (r.status !== 'ok') throw new Error(`Rückfrage statt Entwurf: ${r.frage}`)
  return r
}
const goz = (r: ImplEntwurf) => r.rechnung.honorarGoz.map((z) => `${z.nr}@${z.zahn}`)

describe('Implantologie per Sprache', () => {
  it('zwei Spätimplantate ohne Befund: 9010 je Zahn, Freilegung, DVT, Summe > 0', () => {
    const r = ok(implEntwurf('Implantate 36 und 46'))
    expect(Object.fromEntries(Object.entries(r.plan.zaehne).map(([z, x]) => [z, x.TP]))).toEqual({ '46': 'I', '36': 'I' })
    expect(goz(r)).toEqual(expect.arrayContaining(['9010@36', '9010@46', '9040@36', '9040@46']))
    expect(r.rechnung.gesamt).toBeGreaterThan(1000)
    expect(r.zusammenfassung.summe).toBe(r.rechnung.gesamt)
    expect(r.ablagePlan).not.toHaveProperty('regler')
    expect(r.hinweise).toContain('Ein DVT zur Planung ist enthalten.')
    expect(implVersorgungSatz(r.zusammenfassung)).toBe('Implantate an 46 und 36')
  })

  it('Sinuslift extern mit Bio-Oss nur im Oberkiefer-Seitenzahnbereich, Membran angenommen', () => {
    const r = ok(implEntwurf('Implantat 26 mit externem Sinuslift und Bio-Oss, navigiert'))
    expect(r.plan.regionen['OK-L']).toMatchObject({ sinusExtern: true, material: 'xenogen', membran: 'resorbierbar' })
    expect(r.plan.global.navigation).toBe(true)
    expect(goz(r)).toContain('9120@OK-L')
    expect(r.hinweise).toContain('Eine resorbierbare Membran habe ich angenommen.')
    expect(r.hinweise.join(' ')).not.toMatch(/xenogenes Material angenommen/)
    expect(implVersorgungSatz(r.zusammenfassung)).toBe('Implantat an 26; dazu externer Sinuslift und navigiert mit Bohrschablone')
  })

  it('Sinuslift ohne Art: Rückfrage; Antwort "intern" ergänzt', () => {
    const f = implEntwurf('Implantat 16 mit Sinuslift')
    expect(f).toMatchObject({ status: 'rueckfrage', grund: 'sinus', frage: 'Interner oder externer Sinuslift?' })
    const r = ok(implEntwurf('Implantat 16 mit Sinuslift. Intern.'))
    expect(r.plan.regionen['OK-R']).toMatchObject({ sinusIntern: true })
    expect(r.plan.regionen['OK-R']?.membran).toBeUndefined()
    expect(goz(r)).toContain('9110@OK-R')
  })

  it('Sinuslift je Seite: extern rechts, intern links, Front ohne Sinus', () => {
    const r = ok(implEntwurf('Implantate an 12, 14, 16, 22, 24 und 26, externer Sinuslift rechts, interner Sinuslift links'))
    expect(r.plan.regionen['OK-R']).toMatchObject({ sinusExtern: true })
    expect(r.plan.regionen['OK-R']?.sinusIntern).toBeUndefined()
    expect(r.plan.regionen['OK-L']).toMatchObject({ sinusIntern: true })
    expect(r.plan.regionen['OK-L']?.sinusExtern).toBeUndefined()
    expect(r.plan.regionen['OK-F']?.sinusExtern).toBeUndefined()
    expect(r.plan.regionen['OK-F']?.sinusIntern).toBeUndefined()
    expect(goz(r)).toContain('9120@OK-R')
    expect(goz(r)).toContain('9110@OK-L')
    expect(goz(r).filter((z) => z.startsWith('9120'))).toEqual(['9120@OK-R'])
    expect(goz(r).filter((z) => z.startsWith('9110'))).toEqual(['9110@OK-L'])
    expect(r.hinweise).toContain('Den externen Sinuslift habe ich rechts angesetzt, den internen links.')
  })

  it('Sinuslift im Unterkiefer wird nicht angesetzt', () => {
    const r = ok(implEntwurf('Implantat 36, Sinuslift extern'))
    expect(r.plan.regionen['UK-L']?.sinusExtern).toBeUndefined()
    expect(r.hinweise).toContain('Ein Sinuslift geht nur im Oberkiefer-Seitenzahnbereich, den habe ich nicht angesetzt.')
  })

  it('Befund: Lücke geht, vorhandenes Implantat fragt nach dem Zahn', () => {
    expect(implEntwurf('Implantat 36', { '36': 'f', '46': 'k' }).status).toBe('ok')
    expect(implEntwurf('Implantat 36', { '36': 'i' })).toMatchObject({ grund: 'befund_konflikt', zahn: '36', frage: 'Laut Befund steht an 36 schon ein Implantat. Welchen Zahn meinen Sie?' })
    expect(implEntwurf('Implantat 36', { '36': 'pw' })).toMatchObject({ frage: expect.stringMatching(/^Laut Befund steht an 36 noch ein erhaltungswürdiger Zahn/) })
  })

  it('nicht erhaltungswürdiger Zahn: Zeitpunkt-Frage; "sofort" macht ein Sofortimplantat mit Extraktion', () => {
    expect(implEntwurf('Implantat 36', { '36': 'x' })).toMatchObject({ grund: 'zeitpunkt', zahn: '36' })
    const r = ok(implEntwurf('Implantat 36. Sofort.', { '36': 'x' }))
    expect(r.plan.zaehne['36'].TP).toBe('IS')
    expect(r.plan.implantate['36'].zeitpunkt).toBe('sofort')
    expect(goz(r)).toContain('3000@36')
    expect(implVersorgungSatz(r.zusammenfassung)).toBe('Sofortimplantat an 36')
    const s = ok(implEntwurf('Implantat 36. Später nach der Entfernung.', { '36': 'x' }))
    expect(s.plan.zaehne['36'].TP).toBe('I')
    expect(s.hinweise).toContain('Zahn 36: die Entfernung vor dem Implantat bitte im Planer ergänzen.')
  })

  it('eigener Zahn laut Befund: Rückfrage, ob sofort oder anderer Zahn', () => {
    const f = implEntwurf('Implantat 46', { '46': 'k', '36': 'f' })
    expect(f).toMatchObject({ grund: 'befund_konflikt', zahn: '46', frage: 'Laut Befund steht an 46 noch eine klinisch intakte Krone. Soll der Zahn raus und sofort implantiert werden, oder meinen Sie einen anderen Zahn?' })
    expect(implEntwurf('Implantat 45', { '36': 'f' })).toMatchObject({ grund: 'befund_konflikt', frage: expect.stringMatching(/ein eigener Zahn/) })
  })

  it('Knochenaufbau ohne Material: xenogen und Membran angenommen, Regionen genannt', () => {
    const r = ok(implEntwurf('Implantate 36 und 46 mit Knochenaufbau'))
    expect(r.plan.regionen['UK-L']).toMatchObject({ augmentation: true, material: 'xenogen', membran: 'resorbierbar' })
    expect(goz(r)).toEqual(expect.arrayContaining(['9100@UK-L', '9100@UK-R']))
    expect(r.hinweise).toEqual(expect.arrayContaining([
      'Den Knochenaufbau habe ich für Unterkiefer links und Unterkiefer rechts angesetzt.',
      'Angenommen habe ich xenogenen Knochenersatz und eine resorbierbare Membran.',
    ]))
  })

  it('globale Angaben: PRF, Lachgas, Straumann, einzeitig, DVT liegt vor', () => {
    const a = implAuftragVerstehen('Implantat 11 Straumann einzeitig mit PRF und Lachgas, DVT liegt schon vor')
    expect(a).toMatchObject({ zaehne: ['11'], system: 'straumann-bl', deckung: 'offen', global: { blut: 'prf', sedierung: 'lachgas', bildgebung: 'keine' } })
    const r = ok(implEntwurf('Implantat 11 Straumann einzeitig mit PRF und Lachgas, DVT liegt schon vor'))
    expect(goz(r)).not.toContain('9040@11')
    expect(r.rechnung.material.some((z) => z.text.includes('Straumann'))).toBe(true)
    expect(r.hinweise.join(' ')).not.toMatch(/DVT zur Planung/)
  })

  it('Implantatsystem der Praxis, wenn keins genannt; genanntes System hat Vorrang', () => {
    expect(ok(implEntwurf('Implantat 36', {}, { implantatSystem: 'medentis-icx' })).plan.implantate['36'].system).toBe('medentis-icx')
    expect(ok(implEntwurf('Implantat 36 Camlog', {}, { implantatSystem: 'medentis-icx' })).plan.implantate['36'].system).toBe('camlog')
    expect(ok(implEntwurf('Implantat 36', {}, { implantatSystem: 'gibtsnicht' })).plan.implantate['36'].system).toBe('durchschnitt')
  })

  it('keine Zähne: Rückfrage; Durchmesser und Länge sind keine Zähne', () => {
    expect(implEntwurf('Kostenvoranschlag Implantologie')).toMatchObject({ grund: 'zaehne' })
    expect(implAuftragVerstehen('Implantat 36, Durchmesser 4,1, Länge 11 mm').zaehne).toEqual(['36'])
  })

  it('Krone genannt: Hinweis auf den Zahnersatz-Planer', () => {
    expect(ok(implEntwurf('Implantat 36, später Krone')).hinweise).toContain('Die Versorgung auf den Implantaten plant der Planer Zahnersatz privat.')
  })
})

import { describe, expect, it } from 'vitest'
import { NAME_MUSTER, claraTexte, nameSchreibweise } from './src/clara'
import { claraDa, kalenderErlaubt } from './src/termin'

// Eine Clara je Praxis: PlanR zeigt die Assistentin nach der Stufe der Praxis, nicht nach Person oder Einstieg.
describe('Assistentin nach Stufe der Praxis', () => {
  it('zeigt sie für die volle Clara und für die Sprach-KI, sonst nicht', () => {
    expect(claraDa('voll')).toBe(true)
    expect(claraDa('planr')).toBe(true)
    for (const s of ['aus', '', undefined, 'gesperrt']) expect(claraDa(s), String(s)).toBe(false)
  })
  it('Kalender nur mit voller Clara: PlanR allein mit Sprach-KI bleibt ohne Termine', () => {
    expect(kalenderErlaubt('planr', 'planr')).toBe(false)
    expect(kalenderErlaubt('planr', 'voll')).toBe(true)
    expect(kalenderErlaubt('mas', 'voll')).toBe(true)
  })
  it('volle Clara: dieselbe wie in Pickadoc, kein HKP-Wortlaut, kein Verweis auf MAS', () => {
    const t = claraTexte('Eva', true)
    expect(t.titel).toBe('Eva – Ihre Assistentin')
    expect(`${t.knopf} ${t.titel} ${t.unter} ${t.hinweis}`).not.toContain('HKP-Assistentin')
    expect(t.hinweis).toContain('Pickadoc')
    expect(t.nameFest).toContain('Pickadoc')
    expect(t.mas).toBe(false)
  })
  it('Sprach-KI ohne MAS: Wortlaut wie bisher', () => {
    const t = claraTexte('Mia', false)
    expect(t.titel).toBe('Mia – Ihre HKP-Assistentin')
    expect(t.unter).toBe('Heil- und Kostenpläne per Sprache: Patient nennen, Befund sagen, Mia rechnet.')
    expect(t.nameFest).toBe('Den Namen ändert der Praxis-Admin.')
    expect(t.hinweis).toBe('Mia kennt in PlanR Patientensuche und Heil- und Kostenpläne. Termine, Telefon, Post und alles Weitere gibt es mit ')
    expect(t.mas).toBe(true)
  })
  it('ohne Verbund ändert der dritte Parameter nichts', () => {
    expect(claraTexte('Eva', true, false)).toEqual(claraTexte('Eva', true))
    expect(claraTexte('Mia', false, false)).toEqual(claraTexte('Mia', false))
  })
  it('Assistentin aus dem gekoppelten Konto: MAS-Konto bzw. Standalone-Konto, Name wird dort geändert, kein Upgrade-Verweis', () => {
    const mas = claraTexte('Eva', true, true)
    expect(mas.nameFest).toBe('Den Namen legt das gekoppelte MAS-Konto fest.')
    expect(mas.hinweis).toBe('Sie nutzen Eva aus dem gekoppelten MAS-Konto.')
    expect(mas.unter).toContain('gekoppelten MAS-Konto')
    const solo = claraTexte('Eva', false, true)
    expect(solo.nameFest).toBe('Den Namen ändert das gekoppelte Standalone-Konto.')
    expect(solo.hinweis).toBe('Sie nutzen Eva aus dem gekoppelten Standalone-Konto.')
    expect(solo.titel).toBe('Eva – Ihre HKP-Assistentin')
    for (const t of [mas, solo]) {
      expect(t.mas).toBe(false)
      expect(`${t.unter} ${t.hinweis} ${t.nameFest}`).not.toMatch(/Pickadoc|Haupt-Praxis|Verbund/)
    }
  })
})

// Gleiche Regel wie MAS (backend/src/hkp/planrClara.js rufnameSaeubern): der Name ist zugleich Weckwort.
describe('Name der HKP-Assistentin', () => {
  it('nimmt ein Wort mit 3 bis 20 Buchstaben', () => {
    for (const n of ['Mia', 'Anna-Lena', 'Jürgen', 'Clara', 'x'.repeat(20)]) expect(NAME_MUSTER.test(n), n).toBe(true)
  })
  it('lehnt Leerzeichen, Ziffern, Zeichen und Überlänge ab', () => {
    for (const n of ['Al', 'Frau Holle', 'R2D2', '<b>', '-Mia', 'x'.repeat(21), '']) expect(NAME_MUSTER.test(n), n).toBe(false)
  })
  it('schreibt Großbuchstaben-Namen als Namen, damit die Stimme sie nicht buchstabiert', () => {
    expect(nameSchreibweise('EVA')).toBe('Eva')
    expect(nameSchreibweise('ANNA-LENA')).toBe('Anna-Lena')
    expect(nameSchreibweise('eva')).toBe('Eva')
    expect(nameSchreibweise('McKenzie')).toBe('McKenzie')
  })
})

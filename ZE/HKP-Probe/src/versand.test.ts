import { describe, expect, it } from 'vitest'
import { anredeZeile, emlEntwurf, mailEntwurf, mailtoLink, pdfDateiname } from './versand'
import { leererPatient, standardPraxis } from './stammdaten'

const patient = (p: Partial<ReturnType<typeof leererPatient>>) => ({ ...leererPatient(), ...p })

describe('Kostenvoranschlag per E-Mail', () => {
  it('Anrede mit Geschlecht und Titel, sonst neutral', () => {
    expect(anredeZeile(patient({ anrede: 'Frau', titel: 'Dr.', vorname: 'Anna', name: 'Meier' }))).toBe('Sehr geehrte Frau Dr. Meier,')
    expect(anredeZeile(patient({ anrede: 'Herr', vorname: 'Kai', name: 'Kahn' }))).toBe('Sehr geehrter Herr Kahn,')
    expect(anredeZeile(patient({ vorname: 'Kim', name: 'Meier' }))).toBe('Guten Tag Kim Meier,')
    expect(anredeZeile(patient({}))).toBe('Guten Tag,')
  })

  it('Betreff und Text mit Nummer, Betrag und Praxis', () => {
    const praxis = { ...standardPraxis(), name: 'Zahnarztpraxis Petsas', zahnarzt: 'Dr. Michael Petsas', telefon: '02131 12345' }
    const m = mailEntwurf({ patient: patient({ anrede: 'Frau', name: 'Meier' }), praxis, nummer: 'PKB-2026-001', betrag: 285.07, thema: 'Schienentherapie' })
    expect(m.betreff).toBe('Ihr Kostenvoranschlag Schienentherapie – Zahnarztpraxis Petsas')
    expect(m.text.startsWith('Sehr geehrte Frau Meier,\n\nanbei')).toBe(true)
    expect(m.text).toContain('Nr. PKB-2026-001')
    expect(m.text).toContain('285,07')
    expect(m.text).toContain('telefonisch unter 02131 12345')
    expect(m.text.endsWith('Mit freundlichen Grüßen\nDr. Michael Petsas\nZahnarztpraxis Petsas')).toBe(true)
  })

  it('Dateiname ohne Sonderzeichen', () => {
    expect(pdfDateiname('PKB-2026-001', { name: 'Müßig/Öz' })).toBe('Kostenvoranschlag PKB-2026-001 MuessigOez.pdf')
  })

  it('.eml-Entwurf: ungesendet, Betreff kodiert, PDF als Anhang', () => {
    const eml = emlEntwurf({ an: 'a@b.de', betreff: 'Ihr Kostenvoranschlag – Praxis', text: 'Grüße', pdfBase64: 'JVBERi0x'.repeat(20), dateiname: 'KV.pdf' })
    expect(eml.startsWith('X-Unsent: 1\r\nTo: a@b.de\r\nSubject: =?UTF-8?B?')).toBe(true)
    expect(eml).toContain('Content-Disposition: attachment; filename="KV.pdf"')
    expect(eml.split('\r\n').every((z) => z.length <= 998)).toBe(true)
    const text = eml.split('charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n')[0]
    expect(new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0)))).toBe('Grüße')
  })

  it('mailto kodiert Betreff und Text', () => {
    expect(mailtoLink('a@b.de', 'Ä', 'x y')).toBe('mailto:a@b.de?subject=%C3%84&body=x%20y')
  })
})

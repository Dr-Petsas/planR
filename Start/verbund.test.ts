import { describe, expect, it } from 'vitest'
import { hauptpraxis, mandantVon, praxenVon, registerVon, type Zugaenge } from './anmeldung.ts'
import {
  bridgeMandanten, claraImVerbund, codeFinden, codeSetzen, codeVerbrauchen, eigenerMandant, eigenesRegister, entkoppeln, gaesteVon, koppeln,
  koppelnPruefen, neuerVerbundCode, verbundVon,
} from './verbund.ts'

// Wie live: Petsas (MAS) teilt sich die Ablage "standard" mit einer zweiten Pickadoc-Praxis, der Standalone-Zugang hat seine eigene.
const stand = (): Zugaenge => ({
  mandanten: {
    klinik: { mandant: 'standard', register: 'petsas', hauptpraxis: 1, praxen: [{ nummer: 1, name: 'Praxis 1' }, { nummer: 3, name: 'Praxis 3' }] },
    petsas: { mandant: 'standard', register: 'petsas', hauptpraxis: 1, praxen: [{ nummer: 1, name: 'Praxis 1' }, { nummer: 3, name: 'Praxis 3' }] },
  },
  benutzer: {
    u1: { email: 'dr@pickadoc.de', name: '', clientId: 'petsas', role: 'doctor', praxen: [1], zuerst: '', zuletzt: '' },
    u2: { email: 'contact@maik-music.io', name: 'Dr. Petsas', clientId: 'solo', role: 'admin', zuerst: '', zuletzt: '' },
    u3: { email: 'team@maik-music.io', name: '', clientId: 'solo', role: 'doctor', praxen: [2], zuerst: '', zuletzt: '' },
  },
  vorbelegung: {},
})
const koppelSolo = (z = stand()) => koppeln(z, { gast: 'solo', haupt: 'petsas', hauptName: 'med dent', gastName: 'Dr. Petsas', von: 'contact@maik-music.io', uid: 'u2', jetzt: new Date('2026-10-30T12:00:00Z') })

describe('Praxis-Verbund', () => {
  it('Gast übernimmt Ablage, Register, Hauptpraxis und Praxen der Haupt-Praxis', () => {
    const z = koppelSolo()
    const gast = { clientId: 'solo' }
    expect(mandantVon(z, gast)).toBe('standard')
    expect(registerVon(z, gast)).toBe('petsas')
    expect(hauptpraxis(z, gast)).toBe(1)
    expect(verbundVon(z, 'solo')?.haupt).toBe('petsas')
    expect(gaesteVon(z, 'petsas').map(([id]) => id)).toEqual(['solo'])
  })

  it('der koppelnde Admin sieht alle Praxen, andere Konten die Hauptpraxis', () => {
    const z = koppelSolo()
    expect(praxenVon(z, { uid: 'u2', clientId: 'solo', email: 'contact@maik-music.io' })).toEqual([1, 3])
    expect(praxenVon(z, { uid: 'u3', clientId: 'solo', email: 'team@maik-music.io' })).toEqual([1])
    expect(praxenVon(z, { uid: 'u1', clientId: 'petsas', email: 'dr@pickadoc.de' })).toEqual([1])
    z.benutzer.u3.praxen = []
    expect(praxenVon(z, { uid: 'u3', clientId: 'solo', email: 'team@maik-music.io' })).toEqual([])
  })

  it('Entkoppeln stellt den Stand vor dem Koppeln exakt wieder her', () => {
    const vorher = stand()
    expect(entkoppeln(koppelSolo(vorher), 'solo')).toEqual(vorher)
    const mitEintrag = stand()
    mitEintrag.mandanten.solo = { mandant: 'p-solo', register: 'solo', praxen: [{ nummer: 2 }] }
    expect(entkoppeln(koppelSolo(mitEintrag), 'solo')).toEqual(mitEintrag)
  })

  it('verändert den übergebenen Stand nicht', () => {
    const z = stand()
    const kopie = structuredClone(z)
    koppelSolo(z)
    expect(z).toEqual(kopie)
  })

  it('Rechnungen und Zählwerk bleiben bei der eigenen Ablage', () => {
    const z = koppelSolo()
    expect(eigenerMandant(z, 'solo')).toBe('p-solo')
    expect(eigenesRegister(z, 'solo')).toBe('solo')
    expect(eigenerMandant(z, 'petsas')).toBe('standard')
    expect(eigenesRegister(z, 'petsas')).toBe('petsas')
  })

  it('eine Bridge reicht: die geparkte Ablage des Gastes bedient den Verbund', () => {
    const z = koppelSolo()
    expect(bridgeMandanten(z, 'standard')).toEqual(['standard', 'p-solo'])
    expect(bridgeMandanten(stand(), 'standard')).toEqual(['standard'])
  })

  it('keine Ketten, keine Doppelkopplung, nicht mit sich selbst', () => {
    const z = koppelSolo()
    expect(koppelnPruefen(stand(), 'solo', 'solo')).toMatch(/eigenen Praxis/)
    expect(koppelnPruefen(z, 'solo', 'petsas')).toMatch(/schon mit einer anderen/)
    expect(koppelnPruefen(z, 'dritte', 'solo')).toMatch(/selbst an eine dritte/)
    expect(koppelnPruefen(z, 'petsas', 'dritte')).toMatch(/schon andere gekoppelt/)
    expect(koppelnPruefen(stand(), 'klinik', 'petsas')).toMatch(/dieselbe Ablage/)
    expect(koppelnPruefen(stand(), 'solo', 'petsas')).toBeNull()
    expect(() => koppeln(z, { gast: 'solo', haupt: 'petsas', hauptName: '', gastName: '', von: '', uid: 'u2' })).toThrow()
    expect(() => entkoppeln(stand(), 'solo')).toThrow()
  })

  it('Kopplungscode: einmal, 30 Minuten, unabhängig von Schreibweise', () => {
    const code = neuerVerbundCode()
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    const jetzt = Date.parse('2026-10-30T12:00:00Z')
    let liste = codeSetzen([], code, 'petsas', 'dr@pickadoc.de', jetzt)
    expect(codeFinden(liste, code.toLowerCase().replace('-', ' '), jetzt)?.haupt).toBe('petsas')
    expect(codeFinden(liste, code, jetzt + 31 * 60_000)).toBeNull()
    expect(codeFinden(liste, 'AAAAA-AAAAA', jetzt)).toBeNull()
    const zweiter = neuerVerbundCode()
    liste = codeSetzen(liste, zweiter, 'petsas', 'dr@pickadoc.de', jetzt)
    expect(codeFinden(liste, code, jetzt)).toBeNull()
    const c = codeFinden(liste, zweiter, jetzt)!
    expect(codeFinden(codeVerbrauchen(liste, c, jetzt), zweiter, jetzt)).toBeNull()
  })
})

// Eine Clara je Praxis: sind ein Standalone- und ein MAS-Konto gekoppelt, gilt die volle Clara des MAS-Kontos für beide –
// egal, wer den Code erzeugt hat. MAS meldet sie, PlanR prüft gegen den eigenen Stand.
describe('Clara bei gekoppelten Konten', () => {
  const gemeldet = { praxis: 'petsas', stufe: 'voll' as const }
  // umgekehrt: das Standalone-Konto hat den Code erzeugt, das MAS-Konto hat ihn eingegeben
  const koppelMas = () => koppeln(stand(), { gast: 'petsas', haupt: 'solo', hauptName: 'Dr. Petsas', gastName: 'med dent', von: 'dr@pickadoc.de', uid: 'u1', jetzt: new Date('2026-11-21T09:00:00Z') })
  it('Standalone hat den Code eingegeben: die gemeldete Clara des MAS-Kontos gilt', () => {
    expect(claraImVerbund(koppelSolo(), 'solo', gemeldet)).toEqual(gemeldet)
  })
  it('Standalone hat den Code erzeugt: die gemeldete Clara des MAS-Kontos gilt genauso', () => {
    expect(claraImVerbund(koppelMas(), 'solo', gemeldet)).toEqual(gemeldet)
    expect(claraImVerbund(koppelMas(), 'petsas', undefined)).toBeNull()
  })
  it('ohne Kopplung in PlanR zählt die Meldung nicht', () => {
    expect(claraImVerbund(stand(), 'solo', gemeldet)).toBeNull()
  })
  it('ein Konto außerhalb der Kopplung zählt nicht', () => {
    expect(claraImVerbund(koppelSolo(), 'solo', { praxis: 'fremd', stufe: 'voll' as const })).toBeNull()
    expect(claraImVerbund(koppelMas(), 'solo', { praxis: 'klinik', stufe: 'voll' as const })).toBeNull()
  })
  it('das eigene Konto und Konten ohne Meldung bleiben bei sich', () => {
    expect(claraImVerbund(koppelSolo(), 'petsas', gemeldet)).toBeNull()
    expect(claraImVerbund(koppelSolo(), 'solo', undefined)).toBeNull()
    expect(claraImVerbund(koppelSolo(), 'solo', null)).toBeNull()
  })
})

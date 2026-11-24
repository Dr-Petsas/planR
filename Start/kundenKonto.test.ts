import { describe, expect, it } from 'vitest'
import type { Buchung } from './buchung'
import type { Zugaenge } from './anmeldung'
import { geloeschtFreigeben, geloeschtMerken, istPlanrGeloescht, istGesperrt, kontoMerken, kontoStand, kontoUmfang, loeschPlan, pvsVormerken, sperreLoesen, sperreSetzen, sperrenPruefen, sudoKonto } from './kundenKonto'

const buchung = (id: string, email: string, konto?: Buchung['konto']) => ({
  id, eingang: '2026-11-20T10:00:00.000Z', paket: 'planr',
  praxis: { name: `Praxis ${id}`, rechtsform: '', strasse: '', plz: '', ort: '', telefon: '', email: '', website: '', ustId: '' },
  inhaber: { anrede: '', titel: 'Dr.', vorname: 'Max', nachname: 'Mustermann', email, mobil: '' },
  pickadocKonto: '', benutzer: [], ...(konto ? { konto } : {}),
}) as unknown as Buchung

const leer: Zugaenge = { mandanten: {}, benutzer: {}, vorbelegung: {} }
const max = buchung('b1', 'max@mustermann.de', { status: 'angelegt', clientId: 'CliMax1' })

describe('Superuser-Zugang', () => {
  it('öffnet ein Konto, das sich noch nie angemeldet hat, über die Praxis aus der Buchung', () => {
    const k = sudoKonto([max], leer, 'Max@Mustermann.de')
    expect(k).toMatchObject({ email: 'max@mustermann.de', clientId: 'CliMax1', role: 'admin', admin: true, name: 'Dr. Max Mustermann' })
    expect(k?.uid).toBe('sudo-CliMax1')
  })

  it('nimmt die Kennung aus der Buchung, wenn die Anlage sie geliefert hat', () => {
    const b = buchung('b1', 'max@mustermann.de', { status: 'angelegt', clientId: 'CliMax1', uid: 'uidMax' })
    expect(sudoKonto([b], leer, 'max@mustermann.de')?.uid).toBe('uidMax')
  })

  it('nimmt das vermerkte Konto, sobald sich die Praxis angemeldet hat', () => {
    const z: Zugaenge = { ...leer, benutzer: { uidEcht: { email: 'max@mustermann.de', name: 'Max M.', clientId: 'CliMax1', role: 'admin' } } as Zugaenge['benutzer'] }
    expect(sudoKonto([max], z, 'max@mustermann.de')).toMatchObject({ uid: 'uidEcht', name: 'Max M.' })
  })

  it('kennt ohne Praxis und ohne Anmeldung kein Konto', () => {
    expect(sudoKonto([buchung('b2', 'alt@praxis.de', { status: 'vorhanden' })], leer, 'alt@praxis.de')).toBeNull()
    expect(sudoKonto([max], leer, 'fremd@praxis.de')).toBeNull()
  })

  it('merkt eine nachgelesene Praxis an der Buchung, ohne eine schon bekannte zu überschreiben', () => {
    const ohne = buchung('b3', 'max@mustermann.de', { status: 'manuell' })
    const neu = kontoMerken([ohne, max], 'max@mustermann.de', { clientId: 'CliNeu', uid: 'uidNeu' })
    expect(neu?.find((b) => b.id === 'b3')?.konto).toEqual({ status: 'angelegt', clientId: 'CliNeu', uid: 'uidNeu' })
    expect(neu?.find((b) => b.id === 'b1')?.konto?.clientId).toBe('CliMax1')
    expect(sudoKonto(kontoMerken([ohne], 'max@mustermann.de', { clientId: 'CliNeu' }) ?? [], leer, 'max@mustermann.de')?.clientId).toBe('CliNeu')
  })

  it('übernimmt das Praxisprogramm aus der Buchung, solange die Praxis es noch nicht gespeichert hat', () => {
    const b = { ...max, pvs: { id: 'dens', version: '', server: 'arbeitsplatz', it: '' } } as Buchung
    expect(pvsVormerken([b], leer, 'max@mustermann.de', '')).toEqual({ mandant: 'p-climax1', pvs: 'dens' })
    expect(pvsVormerken([b], leer, 'max@mustermann.de', 'dampsoft')).toBeNull()
    expect(pvsVormerken([max], leer, 'max@mustermann.de', '')).toBeNull()
    expect(pvsVormerken([{ ...b, pvs: { id: 'unbekannt', version: '', server: 'unbekannt', it: '' } }], leer, 'max@mustermann.de', '')).toBeNull()
  })
})

describe('Sperre', () => {
  it('sperrt die Adresse und jedes Konto ihrer Praxis, und löst sich wieder', () => {
    const u = kontoUmfang([max], leer, 'max@mustermann.de')
    const liste = sperreSetzen([], u, 'superuser@pickadoc.de', '2026-11-23T08:00:00.000Z')
    expect(istGesperrt(liste, { email: 'MAX@mustermann.de' })).toBe(true)
    expect(istGesperrt(liste, { email: 'helferin@mustermann.de', clientId: 'CliMax1' })).toBe(true)
    expect(istGesperrt(liste, { email: 'anton@berg.de', clientId: 'CliBerg' })).toBe(false)
    expect(sperreSetzen(liste, u, 'x')).toHaveLength(1)
    expect(sperreLoesen(liste, u)).toEqual([])
    expect(kontoStand([max], leer, liste, 'b1')).toEqual({ email: 'max@mustermann.de', zugang: true, gesperrt: true })
    expect(kontoStand([max], leer, [], 'b1')?.gesperrt).toBe(false)
  })

  it('liest nur saubere Einträge aus der Datei', () => {
    expect(sperrenPruefen({})).toEqual([])
    expect(sperrenPruefen([null, { email: 'x' }, { email: 'A@b.de', clientIds: ['c', 5] }])).toEqual([{ email: 'a@b.de', clientIds: ['c'], am: '', von: '' }])
  })
})

describe('Löschen', () => {
  const berg = buchung('b9', 'anton@berg.de', { status: 'angelegt', clientId: 'CliBerg' })
  const z: Zugaenge = {
    mandanten: { CliMax1: { mandant: 'p-climax1' }, CliBerg: { mandant: 'p-cliberg' } } as Zugaenge['mandanten'],
    benutzer: {
      uidMax: { email: 'max@mustermann.de', name: 'Max', clientId: 'CliMax1', role: 'admin' },
      uidHelferin: { email: 'helferin@mustermann.de', name: 'H', clientId: 'CliMax1', role: 'user' },
      uidBerg: { email: 'anton@berg.de', name: 'Anton', clientId: 'CliBerg', role: 'admin' },
    } as Zugaenge['benutzer'],
    vorbelegung: { 'max@mustermann.de': [1], 'anton@berg.de': [1] } as unknown as Zugaenge['vorbelegung'],
  }

  it('entfernt Buchung, Zugänge und Ablage dieser Praxis und lässt die anderen stehen', () => {
    const p = loeschPlan([max, berg], z, 'max@mustermann.de')
    if ('fehler' in p) throw new Error(p.fehler)
    expect(p.buchungen.map((b) => b.id)).toEqual(['b9'])
    expect(p.entfernt.map((b) => b.id)).toEqual(['b1'])
    expect(Object.keys(p.zugaenge.benutzer)).toEqual(['uidBerg'])
    expect(Object.keys(p.zugaenge.mandanten)).toEqual(['CliBerg'])
    expect(Object.keys(p.zugaenge.vorbelegung ?? {})).toEqual(['anton@berg.de'])
    expect(p.mandanten).toEqual(['p-climax1'])
    // Danach kennt PlanR die Adresse nicht mehr: Sie kann sich neu anmelden.
    expect(kontoUmfang(p.buchungen, p.zugaenge, 'max@mustermann.de')).toMatchObject({ buchungen: [], clientIds: [], uids: [] })
    expect(sudoKonto(p.buchungen, p.zugaenge, 'max@mustermann.de')).toBeNull()
  })

  it('löscht auch ein Konto, das sich nie angemeldet hat', () => {
    const p = loeschPlan([max], leer, 'max@mustermann.de')
    if ('fehler' in p) throw new Error(p.fehler)
    expect(p.buchungen).toEqual([])
    expect(p.mandanten).toEqual(['p-climax1'])
  })

  it('behält eine Ablage, die noch eine andere Praxis nutzt, und rührt „standard“ nie an', () => {
    const geteilt: Zugaenge = { ...leer, mandanten: { CliMax1: { mandant: 'p-gemeinsam' }, CliBerg: { mandant: 'p-gemeinsam' } } as Zugaenge['mandanten'] }
    const p = loeschPlan([max, berg], geteilt, 'max@mustermann.de')
    if ('fehler' in p) throw new Error(p.fehler)
    expect(p.mandanten).toEqual([])
    const stamm: Zugaenge = { ...leer, mandanten: { CliMax1: { mandant: 'standard' } } as Zugaenge['mandanten'] }
    expect(loeschPlan([max], stamm, 'max@mustermann.de')).toHaveProperty('fehler')
  })

  it('lehnt Superuser, gekoppelte Praxen und unbekannte Adressen ab', () => {
    expect(loeschPlan([max], leer, 'superuser@pickadoc.de')).toHaveProperty('fehler')
    expect(loeschPlan([max], leer, 'niemand@praxis.de')).toHaveProperty('fehler')
    const gast: Zugaenge = { ...leer, mandanten: { CliMax1: { mandant: 'p-cliberg', verbund: { haupt: 'CliBerg' } } } as unknown as Zugaenge['mandanten'] }
    expect(loeschPlan([max], gast, 'max@mustermann.de')).toHaveProperty('fehler')
    const haupt: Zugaenge = { ...leer, mandanten: { CliBerg: { mandant: 'p-climax1', verbund: { haupt: 'CliMax1' } } } as unknown as Zugaenge['mandanten'] }
    expect(loeschPlan([max], haupt, 'max@mustermann.de')).toHaveProperty('fehler')
  })

  it('lässt ein gelöschtes PlanR-Konto erst nach einer neuen Buchung wieder herein', () => {
    const weg = geloeschtMerken([], { email: 'Max@Mustermann.de', clientIds: ['CliMax1'] }, 'superuser@pickadoc.de', '2026-11-23T10:00:00.000Z')
    expect(istPlanrGeloescht(weg, { email: 'max@mustermann.de' })).toBe(true)
    expect(istPlanrGeloescht(weg, { clientId: 'CliMax1' })).toBe(true)
    expect(istPlanrGeloescht(weg, { email: 'andere@praxis.de' })).toBe(false)
    const frei = geloeschtFreigeben(weg, { email: 'max@mustermann.de' })
    expect(frei).toEqual([])
    expect(istPlanrGeloescht(frei, { clientId: 'CliMax1' })).toBe(false)
  })
})

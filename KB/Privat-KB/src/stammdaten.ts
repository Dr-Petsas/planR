/**
 * Anmeldedaten – Patient (wie an der Anmeldung erfasst) und Praxis.
 * In allen Planern gleich: gleiche Feldnamen, gleiche Vorgaben, gleiche Migration.
 *
 * Quelle: F:\PlanR\_gemeinsam – Änderungen nur dort, dann `node tools/gemeinsam.mjs`.
 * Die Patient-Felder name/vorname/geburtsdatum/kasse/kassenNr/versichertenNr/status
 * sind mit dem HKP-Register in MAS verdrahtet und dürfen nicht umbenannt werden.
 */

export type Kassenart = 'primaer' | 'ersatz'

export interface Patient {
  /** '' | 'Frau' | 'Herr' */
  anrede: string
  vorname: string
  /** Nachname */
  name: string
  /** JJJJ-MM-TT */
  geburtsdatum: string
  strasse: string
  plz: string
  ort: string
  /** Krankenkasse bzw. private Versicherung / Kostenträger */
  kasse: string
  /** Kostenträgerkennung (IK, 9-stellig) */
  kassenNr: string
  versichertenNr: string
  /** Versichertenstatus der eGK (z. B. 1000000) */
  status: string
  kassenart: Kassenart
}

export interface Praxis {
  name: string
  /** Behandelnde Zahnärztin / behandelnder Zahnarzt */
  zahnarzt: string
  strasse: string
  plz: string
  ort: string
  telefon: string
  email: string
  /** Vertragszahnarzt-Nummer */
  zahnarztNr: string
  /** KZV-Abrechnungsnummer */
  abrechnungsNr: string
  /** Fest gewählte KZV; '' = aus der Praxis-PLZ */
  kzvNr: string
}

export const leererPatient = (): Patient => ({
  anrede: '',
  vorname: '',
  name: '',
  geburtsdatum: '',
  strasse: '',
  plz: '',
  ort: '',
  kasse: '',
  kassenNr: '',
  versichertenNr: '',
  status: '',
  kassenart: 'primaer',
})

export const standardPraxis = (): Praxis => ({
  name: 'Zahnarztpraxis',
  zahnarzt: '',
  strasse: '',
  plz: '',
  ort: '',
  telefon: '',
  email: '',
  zahnarztNr: '',
  abrechnungsNr: '',
  kzvNr: '',
})

/** Beschriftungen – überall dieselben Wörter. */
export const BESCHRIFTUNG: Record<keyof Patient | `praxis.${keyof Praxis}`, string> = {
  anrede: 'Anrede',
  vorname: 'Vorname',
  name: 'Name',
  geburtsdatum: 'Geburtsdatum',
  strasse: 'Straße',
  plz: 'PLZ',
  ort: 'Ort',
  kasse: 'Krankenkasse',
  kassenNr: 'Kostenträgerkennung',
  versichertenNr: 'Versicherten-Nr.',
  status: 'Status',
  kassenart: 'Kassenart',
  'praxis.name': 'Praxisname',
  'praxis.zahnarzt': 'Zahnärztin / Zahnarzt',
  'praxis.strasse': 'Straße',
  'praxis.plz': 'PLZ',
  'praxis.ort': 'Ort',
  'praxis.telefon': 'Telefon',
  'praxis.email': 'E-Mail',
  'praxis.zahnarztNr': 'Zahnarzt-Nr.',
  'praxis.abrechnungsNr': 'Abrechnungs-Nr.',
  'praxis.kzvNr': 'KZV',
}

type Roh = Record<string, unknown>
const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const erster = (o: Roh, ...keys: string[]) => {
  for (const k of keys) {
    const t = text(o[k]).trim()
    if (t) return t
  }
  return ''
}

/** "80331 München" -> { plz, ort } */
export function plzOrtTrennen(s: string): { plz: string; ort: string } {
  const t = s.trim()
  const m = /^(\d{4,5})\s*(.*)$/.exec(t)
  return m ? { plz: m[1], ort: m[2].trim() } : { plz: '', ort: t }
}

/** "Hauptstr. 1, 80331 München" (auch mehrzeilig) -> { strasse, plz, ort } */
export function anschriftLesen(s: string): { strasse: string; plz: string; ort: string } {
  const teile = s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
  if (!teile.length) return { strasse: '', plz: '', ort: '' }
  const i = teile.findIndex((t) => /^\d{4,5}\b/.test(t))
  if (i < 0) return { strasse: teile.join(', '), plz: '', ort: '' }
  return { strasse: teile.slice(0, i).join(', '), ...plzOrtTrennen(teile.slice(i).join(' ')) }
}

/** Ein voller Name ohne getrennten Vornamen: letztes Wort = Name. "Meier, Hans" ebenso. */
export function nameTrennen(voll: string): { vorname: string; name: string } {
  const t = voll.trim().replace(/\s+/g, ' ')
  if (!t) return { vorname: '', name: '' }
  if (t.includes(',')) {
    const [n, ...v] = t.split(',')
    return { vorname: v.join(',').trim(), name: n.trim() }
  }
  const w = t.split(' ')
  return w.length < 2 ? { vorname: '', name: t } : { vorname: w.slice(0, -1).join(' '), name: w[w.length - 1] }
}

/**
 * Liest jeden früheren Stand: MKV/Kons (voller Name, kassennummer, versichertennr, versicherung),
 * Privat-ZE/Implantologie (plzOrt, kostentraeger), PAR (kostentraegerkennung), HKP (anschrift).
 */
export function patientMigrieren(roh: unknown): Patient {
  const p = leererPatient()
  if (!roh || typeof roh !== 'object') return p
  const o = roh as Roh
  // Nur Stände ganz ohne Vorname-Feld hatten den vollen Namen in "name".
  const { vorname, name } = 'vorname' in o
    ? { vorname: erster(o, 'vorname'), name: erster(o, 'name') }
    : nameTrennen(erster(o, 'name'))
  let { strasse, plz, ort } = { strasse: erster(o, 'strasse'), plz: erster(o, 'plz'), ort: erster(o, 'ort') }
  if (!plz && !ort && text(o.plzOrt)) ({ plz, ort } = plzOrtTrennen(text(o.plzOrt)))
  if (!strasse && !plz && !ort && text(o.anschrift)) ({ strasse, plz, ort } = anschriftLesen(text(o.anschrift)))
  return {
    anrede: erster(o, 'anrede'),
    vorname,
    name,
    geburtsdatum: erster(o, 'geburtsdatum'),
    strasse,
    plz,
    ort,
    kasse: erster(o, 'kasse', 'versicherung', 'kostentraeger'),
    kassenNr: erster(o, 'kassenNr', 'kostentraegerkennung', 'kassennummer'),
    versichertenNr: erster(o, 'versichertenNr', 'versichertennr'),
    status: erster(o, 'status'),
    kassenart: o.kassenart === 'ersatz' ? 'ersatz' : 'primaer',
  }
}

/** Liest jeden früheren Praxis-Stand (plzOrt, behandler) und eine alte, getrennt gespeicherte KZV-Wahl. */
export function praxisMigrieren(roh: unknown, altKzvNr = ''): Praxis {
  const p = standardPraxis()
  if (!roh || typeof roh !== 'object') return { ...p, kzvNr: altKzvNr }
  const o = roh as Roh
  let plz = erster(o, 'plz')
  let ort = erster(o, 'ort')
  if (!plz && !ort && text(o.plzOrt)) ({ plz, ort } = plzOrtTrennen(text(o.plzOrt)))
  return {
    name: erster(o, 'name') || p.name,
    zahnarzt: erster(o, 'zahnarzt', 'behandler'),
    strasse: erster(o, 'strasse'),
    plz,
    ort,
    telefon: erster(o, 'telefon'),
    email: erster(o, 'email'),
    zahnarztNr: erster(o, 'zahnarztNr'),
    abrechnungsNr: erster(o, 'abrechnungsNr'),
    kzvNr: erster(o, 'kzvNr') || altKzvNr,
  }
}

/** "Hans Meier" */
export const patientName = (p: Pick<Patient, 'vorname' | 'name'>) => [p.vorname, p.name].filter(Boolean).join(' ')

/** "Frau Meier" bzw. "" ohne Anrede */
export const patientAnrede = (p: Pick<Patient, 'anrede' | 'name'>) => (p.anrede && p.name ? `${p.anrede} ${p.name}` : '')

/** "80331 München" */
export const plzOrt = (x: { plz: string; ort: string }) => [x.plz, x.ort].filter(Boolean).join(' ')

/** "Hauptstr. 1, 80331 München" */
export const anschrift = (x: { strasse: string; plz: string; ort: string }) => [x.strasse, plzOrt(x)].filter(Boolean).join(', ')

/** Briefkopf-Zeile der Praxis: "Praxis · Straße · PLZ Ort" */
export const praxisZeile = (p: Praxis) => [p.name, p.strasse, plzOrt(p)].filter(Boolean).join(' · ')

/** Felder, die PlanR beim „Neuer Plan für …“ mitgibt (alles andere bleibt beim leeren Plan) */
const UEBERGABE = ['anrede', 'vorname', 'name', 'geburtsdatum', 'strasse', 'plz', 'ort', 'kasse', 'kassenNr', 'versichertenNr'] as const

/**
 * Patient aus der PlanR-Übersicht: #patient=<base64url-JSON>.
 * Steht im Fragment, damit Name und Kasse in keinem Server-Log landen. Ungültiges → null.
 */
export function patientAusFragment(hash: string): Partial<Patient> | null {
  const m = /(?:^#|&)patient=([A-Za-z0-9_-]{1,4000})(?:&|$)/.exec(hash)
  if (!m) return null
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))
    const roh = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    if (!roh || typeof roh !== 'object') return null
    const p: Partial<Patient> = {}
    for (const k of UEBERGABE) {
      const v = roh[k]
      if (typeof v === 'string' && v.trim()) p[k] = v.trim().slice(0, 120)
    }
    if (p.anrede && p.anrede !== 'Frau' && p.anrede !== 'Herr') delete p.anrede
    if (p.geburtsdatum && !/^\d{4}-\d{2}-\d{2}$/.test(p.geburtsdatum)) delete p.geburtsdatum
    return p.name || p.vorname ? p : null
  } catch {
    return null
  }
}

/**
 * „Neuer Plan für …“ aus PlanR (?neu=1#patient=…): einmal je Seitenaufruf lesen und die Adresse aufräumen.
 * undefined = kein Auftrag, null = Auftrag ohne lesbaren Patienten.
 */
export function neuAusAdresse(): Partial<Patient> | null | undefined {
  if (typeof window === 'undefined') return undefined
  const u = new URL(window.location.href)
  if (u.searchParams.get('neu') !== '1') return undefined
  const patient = patientAusFragment(u.hash)
  u.searchParams.delete('neu')
  history.replaceState(history.state, '', u.pathname + u.search)
  return patient
}

/** Neuer Plan mit den übergebenen Anmeldedaten */
export const mitPatient = <T extends { patient: Patient }>(plan: T, p?: Partial<Patient> | null): T =>
  (p ? { ...plan, patient: { ...plan.patient, ...p } } : plan)

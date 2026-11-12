/** Terminvergabe aus der Planliste. Slots kommen aus CalendR, nie aus geratenen Zeiten. */

export type TerminGrund = 'besprechung' | 'start'

/** Fallback, wenn ein Kalender keine eigenen Längen mitbringt. */
export const DAUER_MIN = [15, 25, 30, 45, 60, 90, 120, 180, 240] as const

/** Längen, die es für diesen Behandlungsgrund wirklich gibt. */
export function dauerStufen(motive: TerminMotiv[], grund: TerminGrund): number[] {
  const stufen = [...new Set(motive.filter((m) => m.grund === grund).map((m) => m.dauer))]
    .filter((n) => n >= 15 && n <= 240)
    .sort((a, b) => a - b)
  return stufen.length ? stufen : [...DAUER_MIN]
}

/**
 * Heil- und Kostenplan: die ZE-Besprechung, auch wenn sie kürzer als 30 Minuten ist.
 * Sonst eine 30-Minuten-Besprechung, und nur ohne die die kürzeste.
 */
export function motivFuerPlan(modul: string, motive: TerminMotiv[], grund: TerminGrund): TerminMotiv | undefined {
  const liste = motive.filter((m) => m.grund === grund)
  if (modul === 'hkp' && grund === 'besprechung') {
    const ze = liste.find((m) => /^ze\b/i.test(m.name.trim()))
    if (ze) return ze
  }
  return liste.find((m) => m.dauer === 30) ?? liste.slice().sort((a, b) => a.dauer - b.dauer)[0]
}

export function kalenderErlaubt(abo?: string, clara?: string): boolean {
  return abo === 'mas' || clara === 'voll'
}

export function grundVon(name: string): TerminGrund | '' {
  const n = name.toLocaleLowerCase('de')
  if (n.includes('besprech')) return 'besprechung'
  if (/behandlungsstart|behandlungsbeginn|erstbehandlung/.test(n)) return 'start'
  return ''
}

export function dauerText(minuten: number): string {
  if (minuten < 60) return `${minuten} min`
  const stunden = minuten / 60
  return Number.isInteger(stunden) ? `${stunden} Std.` : `${stunden.toLocaleString('de-DE')} Std.`
}

export interface SlotBadge { tag: string; uhrzeit: string; laenge: string }

/** Tag, Uhrzeit (Europe/Berlin) und Slotlänge für eine Badge. */
export function slotBadge(iso: string, minuten: number): SlotBadge | null {
  const zeit = new Date(iso)
  if (Number.isNaN(zeit.getTime())) return null
  const tag = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' }).format(zeit)
  const uhrzeit = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(zeit)
  return { tag: tag.replace(',', ''), uhrzeit, laenge: dauerText(minuten) }
}

export function terminKurz(iso: string): string {
  const b = slotBadge(iso, 0)
  return b ? `${b.tag} ${b.uhrzeit}` : ''
}

/** Zeigerwinkel der angeklickten Uhrzeit: 0 Grad ist zwölf Uhr, im Uhrzeigersinn. */
export function uhrZeiger(uhrzeit: string): { stunde: number; minute: number } | null {
  const t = uhrzeit.match(/(\d{1,2})\D(\d{2})/)
  if (!t) return null
  const minute = Number(t[2])
  const stunde = Number(t[1])
  if (minute > 59 || stunde > 23) return null
  return { stunde: (stunde % 12) * 30 + minute * 0.5, minute: minute * 6 }
}

/** Dieselbe Minute, auch wenn eine Zeit mit Offset und die andere in UTC dasteht. */
export function gleicherMoment(a: string, b: string): boolean {
  const x = Date.parse(a)
  const y = Date.parse(b)
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 60_000
}

/** Plan-Name und Kartei-Name meinen denselben Patienten. Der Nachname muss vorkommen. */
export function patientGleich(plan: string, vorname: string, nachname: string): boolean {
  const p = plan.toLocaleLowerCase('de').replace(/\s+/g, ' ').trim()
  const n = nachname.toLocaleLowerCase('de').trim()
  if (n.length < 2 || !p.includes(n)) return false
  const v = vorname.toLocaleLowerCase('de').trim()
  return !v || p.includes(v)
}

export interface TerminFund {
  appointmentId: string
  locationId: string
  iso: string
  geloescht: boolean
}

/**
 * Vermerk nach dem Blick in CalendR. null heißt: der Termin ist weg, der Vermerk auch.
 * Unverändert kommt dasselbe Objekt zurück, damit nichts neu geschrieben wird.
 */
export function vermerkNachKalender<T extends { iso: string; appointmentId?: string; locationId?: string }>(
  alt: T,
  stand: TerminFund | 'weg',
): T | null {
  if (stand === 'weg' || stand.geloescht || !stand.appointmentId) return null
  const iso = gleicherMoment(alt.iso, stand.iso) ? alt.iso : stand.iso
  if (iso === alt.iso && alt.appointmentId === stand.appointmentId && alt.locationId === stand.locationId) return alt
  return { ...alt, iso, appointmentId: stand.appointmentId, locationId: stand.locationId }
}

export interface Stamm {
  name: string
  vorname: string
  nachname: string
  /** JJJJ-MM-TT, leer wenn der Plan keins trägt */
  geburt: string
  telefon: string
  email: string
  anrede: string
}

const TELEFON = ['telefon', 'phone', 'handy', 'mobil', 'mobile', 'mobilePhoneNumber', 'phoneNumber']

function text(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const w = o[k]
    if (typeof w === 'string' && w.trim()) return w.trim().slice(0, 160)
  }
  return ''
}

const datum = (wert: string) => {
  const iso = wert.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const de = wert.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  return de ? `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}` : ''
}

function namenTeilen(vorname: string, nachname: string, label: string): { vorname: string; nachname: string } {
  const voll = [vorname, nachname].filter(Boolean).join(' ')
  const basis = nachname.includes(' ') || !vorname ? voll || label : voll
  const teile = basis.split(/\s+/).filter(Boolean)
  if (teile.length >= 2 && (!vorname || nachname.includes(' '))) return { vorname: teile.slice(0, -1).join(' '), nachname: teile[teile.length - 1] }
  return { vorname, nachname }
}

/** Name, Telefon und E-Mail aus den Stammdaten des Plans. Fehlende Felder bleiben leer. */
export function stammAus(roh: unknown, fallback = ''): Stamm {
  const o = roh && typeof roh === 'object' ? roh as Record<string, unknown> : {}
  const geteilt = namenTeilen(text(o, ['vorname', 'firstName']), text(o, ['name', 'lastName', 'nachname']), text(o, ['label']) || fallback.trim())
  const vorname = geteilt.vorname
  const nachname = geteilt.nachname
  const name = [vorname, nachname].filter(Boolean).join(' ') || fallback.trim()
  return {
    name,
    vorname,
    nachname,
    geburt: datum(text(o, ['geburt', 'geburtsdatum', 'birthDate'])),
    telefon: text(o, TELEFON),
    email: text(o, ['email', 'mail']),
    anrede: text(o, ['anrede', 'gender']),
  }
}

export interface KalenderZeile { id: string; name: string; locationId: string; userId?: string }

const nameTeile = (wert: string) => wert.toLocaleLowerCase('de')
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z]+/g, ' ').split(' ').filter((w) => w.length > 2 && !['doktor', 'med', 'dent', 'zahnarzt', 'zahnarztin'].includes(w))

/**
 * Nur die Kalender des angemeldeten Kontos. Zuerst die mit derselben Benutzer-ID,
 * sonst der Nachname im Kalendernamen. Kalender der Kollegen bleiben draußen.
 */
export function eigeneKalender<T extends KalenderZeile>(liste: T[], uid: string, name: string): T[] {
  const eigene = uid ? liste.filter((k) => k.userId === uid) : []
  if (eigene.length) return eigene
  const nachname = nameTeile(name).at(-1) ?? ''
  if (nachname.length < 3) return []
  return liste.filter((k) => nameTeile(k.name).includes(nachname))
}

export function motiveDerKalender<T extends TerminMotiv>(motive: T[], kalender: KalenderZeile[]): T[] {
  const ids = new Set(kalender.map((k) => k.id))
  const orte = new Set(kalender.map((k) => k.locationId))
  return motive.filter((m) => orte.has(m.locationId) && (m.calendarIds.length === 0 || m.calendarIds.some((id) => ids.has(id))))
}

export interface Akte {
  vorname: string
  nachname: string
  geburt: string
  telefone: string[]
  anrede: string
  email: string
}

const nameKern = (wert: string) => wert.toLocaleLowerCase('de').replace(/[^a-zäöüß]/g, '')

/** Nachname muss gleich sein. Beim Vornamen reicht der eine Buchstabe, den DS-Win oft speichert. */
export function nameGleich(akte: string, plan: string, anfangReicht: boolean): boolean {
  const x = nameKern(akte)
  const y = nameKern(plan)
  if (!x || !y) return false
  if (x === y) return true
  return anfangReicht && x.length === 1 && y.length > 1 && y.startsWith(x)
}

const telefonBrauchbar = (wert: string) => wert.trim().replace(/\D/g, '').length >= 6

/** Gleiches Datum oder der eine Tag, um den eine Mitternacht in der Akte verrutschen kann. */
function datumNah(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const x = Date.parse(`${a}T12:00:00Z`)
  const y = Date.parse(`${b}T12:00:00Z`)
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 86_400_000
}

function mobilZuerst(werte: string[]): string {
  const alle = werte.map((w) => w.trim()).filter(telefonBrauchbar)
  const mobil = alle.find((w) => {
    const z = w.replace(/\D/g, '')
    return z.startsWith('01') || z.startsWith('491') || z.startsWith('00491')
  })
  return mobil ?? alle[0] ?? ''
}

function eineAkte(plan: Stamm, akten: Akte[]): Akte | 'mehrere' | null {
  const namen = akten.filter((a) => nameGleich(a.nachname, plan.nachname, false) && nameGleich(a.vorname, plan.vorname, true))
  if (!namen.length) return null
  const genau = plan.geburt ? namen.filter((a) => a.geburt && datumNah(a.geburt, plan.geburt)) : []
  const eng = genau.length ? genau : namen
  const daten = [...new Set(eng.map((a) => a.geburt).filter(Boolean))]
  const auseinander = daten.filter((tag, i) => daten.slice(i + 1).some((ander) => !datumNah(tag, ander)))
  if (auseinander.length) return 'mehrere'
  if (eng.length > 1 && daten.length === 0) return 'mehrere'
  return {
    vorname: eng.find((a) => a.vorname.length > 1)?.vorname || eng[0].vorname,
    nachname: eng[0].nachname,
    geburt: [...daten][0] ?? '',
    telefone: eng.flatMap((a) => a.telefone),
    anrede: eng.map((a) => a.anrede).find((a) => geschlecht(a)) ?? '',
    email: eng.map((a) => a.email).find(Boolean) ?? '',
  }
}

export interface Abgleich { stamm: Stamm; meldung: string }

/**
 * Der Termin bekommt Telefon und Anrede erst, wenn Pickadoc und DS-Win dieselbe Person meinen.
 * `null` heißt: diese Quelle war nötig und gerade nicht erreichbar. Eine leere Liste heißt: niemand gefunden.
 * Ohne drittes Argument gibt es kein DS-Win, dann entscheidet Pickadoc allein.
 */
export function patientAbgleichen(plan: Stamm, pickadoc: Akte[] | null, dampsoft?: Akte[] | null): Abgleich {
  if (!plan.vorname || !plan.nachname) return { stamm: plan, meldung: 'In den Stammdaten fehlen Vor- und Nachname.' }
  if (pickadoc === null) return { stamm: plan, meldung: 'Pickadoc ist gerade nicht erreichbar. Ohne Abgleich trage ich keinen Termin ein.' }
  const mitDs = dampsoft !== undefined
  if (mitDs && dampsoft === null) return { stamm: plan, meldung: 'DS-Win ist gerade nicht erreichbar. Ohne Abgleich trage ich keinen Termin ein.' }
  const links = eineAkte(plan, pickadoc)
  const rechts = mitDs ? eineAkte(plan, dampsoft ?? []) : null
  if (links === 'mehrere' || rechts === 'mehrere') {
    return { stamm: plan, meldung: 'Zu diesem Namen gibt es mehrere Patienten. Ohne eindeutiges Geburtsdatum trage ich keinen Termin ein.' }
  }
  if (!links) return { stamm: plan, meldung: 'Pickadoc hat keinen Patienten mit diesem Namen. Ich trage keinen Termin ein.' }
  if (mitDs && !rechts) return { stamm: plan, meldung: 'DS-Win hat keinen Patienten mit diesem Namen. Ich trage keinen Termin ein.' }
  if (rechts && links.geburt && rechts.geburt && !datumNah(links.geburt, rechts.geburt)) {
    return { stamm: plan, meldung: 'Pickadoc und DS-Win haben zu diesem Namen unterschiedliche Geburtsdaten. Ich trage keinen Termin ein.' }
  }
  const vorname = rechts && rechts.vorname.length > links.vorname.length ? rechts.vorname : links.vorname
  const geburt = links.geburt || rechts?.geburt || plan.geburt
  const telefon = mobilZuerst([...links.telefone, ...(rechts?.telefone ?? []), plan.telefon])
  const anrede = geschlecht(plan.anrede) ? plan.anrede : links.anrede || rechts?.anrede || ''
  const stamm: Stamm = {
    ...plan,
    vorname,
    nachname: plan.nachname,
    name: [vorname, plan.nachname].filter(Boolean).join(' '),
    geburt,
    telefon,
    email: plan.email || links.email || rechts?.email || '',
    anrede,
  }
  if (!telefon) return { stamm, meldung: mitDs ? 'Weder Pickadoc noch DS-Win hat eine Telefonnummer für diesen Patienten.' : 'Pickadoc hat keine Telefonnummer für diesen Patienten.' }
  if (!geschlecht(anrede)) return { stamm, meldung: 'Weder der Plan noch Pickadoc nennt die Anrede dieses Patienten.' }
  return { stamm, meldung: '' }
}

/** Pickadoc speichert f/m. Ohne Anrede bleibt es leer, damit niemand ein Geschlecht rät. */
export function geschlecht(anrede: string): 'f' | 'm' | '' {
  const a = anrede.trim().toLocaleLowerCase('de')
  if (a === 'frau' || a === 'f' || a === 'w' || a === 'female' || a === 'weiblich') return 'f'
  if (a === 'herr' || a === 'm' || a === 'male' || a === 'männlich' || a === 'maennlich') return 'm'
  return ''
}

export interface TerminMotiv {
  id: string
  name: string
  dauer: number
  locationId: string
  calendarIds: string[]
  grund: TerminGrund
}

export function motivPasst(m: TerminMotiv, grund: TerminGrund, dauer: number, locationId: string, calendarId: string): boolean {
  if (m.grund !== grund || m.dauer !== dauer || m.locationId !== locationId) return false
  return m.calendarIds.length === 0 || m.calendarIds.includes(calendarId)
}

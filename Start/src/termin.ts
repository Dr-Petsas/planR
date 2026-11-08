/** Terminvergabe aus der Planliste. Slots kommen aus CalendR, nie aus geratenen Zeiten. */

export type TerminGrund = 'besprechung' | 'start'

/** 30 Minuten bis 4 Stunden, in den Stufen, die der Filter anbietet. */
export const DAUER_MIN = [30, 45, 60, 90, 120, 180, 240] as const

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

export interface Stamm {
  name: string
  vorname: string
  nachname: string
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

/** Name, Telefon und E-Mail aus den Stammdaten des Plans. Fehlende Felder bleiben leer. */
export function stammAus(roh: unknown, fallback = ''): Stamm {
  const o = roh && typeof roh === 'object' ? roh as Record<string, unknown> : {}
  const vorname = text(o, ['vorname', 'firstName'])
  const nachname = text(o, ['name', 'lastName', 'nachname'])
  const name = [vorname, nachname].filter(Boolean).join(' ') || text(o, ['label']) || fallback.trim()
  return {
    name,
    vorname,
    nachname,
    telefon: text(o, TELEFON),
    email: text(o, ['email', 'mail']),
    anrede: text(o, ['anrede', 'gender']),
  }
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

// CalendR lesen: Standorte, Behandler-Kalender und Besuchsgründe sind in Firestore
// öffentlich lesbar. Freie Slots und das Eintragen laufen über die Pickadoc-Funktionen.
// Kein MAS-Prozess, keine geratenen Zeiten.

import { FIREBASE } from './anmeldung.ts'
import { grundVon, patientGleich, type TerminFund, type TerminGrund, type TerminMotiv } from './src/termin.ts'

const CF = 'https://europe-west3-docgenda.cloudfunctions.net'
const BASIS = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projekt}/databases/(default)/documents`
const ID = /^[A-Za-z0-9_-]{1,128}$/

export interface BehandlerKalender { id: string; name: string; locationId: string; userId: string }

interface Dok { name?: string; fields?: Record<string, Feld> }
interface Feld {
  stringValue?: string
  integerValue?: string
  doubleValue?: number
  booleanValue?: boolean
  arrayValue?: { values?: Feld[] }
  mapValue?: { fields?: Record<string, Feld> }
  timestampValue?: string
}

const s = (d: Dok, k: string) => String(d.fields?.[k]?.stringValue ?? '').trim()
const zahl = (d: Dok, k: string) => {
  const f = d.fields?.[k]
  if (!f) return 0
  if (typeof f.integerValue === 'string') return Number(f.integerValue) || 0
  return typeof f.doubleValue === 'number' ? f.doubleValue : 0
}
const ja = (d: Dok, k: string) => d.fields?.[k]?.booleanValue === true
const liste = (d: Dok, k: string) => (d.fields?.[k]?.arrayValue?.values ?? []).map((v) => String(v.stringValue ?? '')).filter((id) => ID.test(id))
const idVon = (d: Dok) => {
  const id = String(d.name ?? '').split('/').pop() ?? ''
  return ID.test(id) ? id : ''
}

async function dokumente(pfad: string): Promise<Dok[]> {
  const aus: Dok[] = []
  let token = ''
  for (let seite = 0; seite < 4; seite++) {
    const url = `${BASIS}/${pfad}?pageSize=100${token ? `&pageToken=${encodeURIComponent(token)}` : ''}&key=${FIREBASE.apiKey}`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return aus
    const d = await r.json() as { documents?: Dok[]; nextPageToken?: string }
    aus.push(...(d.documents ?? []))
    token = d.nextPageToken ?? ''
    if (!token) break
  }
  return aus
}

export interface KalenderStand { behandler: BehandlerKalender[]; motive: TerminMotiv[] }

const cache = new Map<string, { bis: number; wert: KalenderStand }>()

/** Behandler sind die Kalender. Besuchsgründe nur Besprechung und Behandlungsstart, ab 15 Minuten. */
export async function kalenderStand(clientId: string): Promise<KalenderStand> {
  if (!ID.test(clientId)) return { behandler: [], motive: [] }
  const alt = cache.get(clientId)
  if (alt && alt.bis > Date.now()) return alt.wert
  const orte = await dokumente(`clients/${clientId}/locations`)
  const behandler: BehandlerKalender[] = []
  const motive: TerminMotiv[] = []
  for (const ort of orte.slice(0, 8)) {
    const locationId = idVon(ort)
    if (!locationId) continue
    const [kalender, gruende] = await Promise.all([
      dokumente(`clients/${clientId}/locations/${locationId}/calendars`),
      dokumente(`clients/${clientId}/locations/${locationId}/visitMotives`),
    ])
    for (const k of kalender) {
      const id = idVon(k)
      const name = s(k, 'name')
      if (!id || !name || ja(k, 'isDeleted') || ja(k, 'internal')) continue
      behandler.push({ id, name: name.slice(0, 80), locationId, userId: s(k, 'userId') })
    }
    for (const g of gruende) {
      const id = idVon(g)
      const name = s(g, 'name')
      const grund = grundVon(name) as TerminGrund | ''
      const dauer = Math.round(zahl(g, 'duration'))
      if (!id || !name || !grund || dauer < 15) continue
      motive.push({ id, name: name.slice(0, 80), dauer, locationId, calendarIds: liste(g, 'calendarIds'), grund })
    }
  }
  const wert = { behandler, motive }
  cache.set(clientId, { bis: Date.now() + 60_000, wert })
  return wert
}

export function kalenderGehoert(stand: KalenderStand, locationId: string, calendarId: string): BehandlerKalender | undefined {
  return stand.behandler.find((k) => k.locationId === locationId && k.id === calendarId)
}

export async function freieSlots(clientId: string, locationId: string, calendarId: string, visitMotiveId: string): Promise<string[] | null> {
  try {
    const r = await fetch(`${CF}/getFreeTimeSlots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId, locationId, calendarId, visitMotiveId, source: 'planr',
        patientInsuranceType: 'all',
        startDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date()),
      }),
      signal: AbortSignal.timeout(20000),
    })
    const daten = await r.json().catch(() => null) as { status?: string; data?: { free_time_slots?: unknown } } | null
    if (!r.ok || daten?.status !== 'success') return null
    const roh = daten.data?.free_time_slots
    let slots: unknown = roh
    if (typeof roh === 'string') {
      try { slots = JSON.parse(roh) } catch { return null }
    }
    return (Array.isArray(slots) ? slots : []).map((x) => String(x)).filter((iso) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)).slice(0, 40)
  } catch {
    return null
  }
}

export async function terminEintragen(body: {
  clientId: string
  locationId: string
  calendarId: string
  visitMotiveId: string
  appointmentStartDate: string
  patientGender: 'f' | 'm'
  patientFirstName: string
  patientLastName: string
  patientMobilePhoneNumber: string
}): Promise<{ ok: true; appointmentId: string } | { ok: false }> {
  const r = await fetch(`${CF}/createAppointment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, source: 'unknown' }),
    signal: AbortSignal.timeout(25000),
  })
  const daten = await r.json().catch(() => null) as { status?: string; appointmentId?: string } | null
  const appointmentId = String(daten?.appointmentId ?? '')
  if (!r.ok || daten?.status !== 'success' || !ID.test(appointmentId)) return { ok: false }
  return { ok: true, appointmentId }
}

const mapFelder = (f: Feld | undefined) => f?.mapValue?.fields ?? {}

/** Ein CalendR-Termin, soweit PlanR ihn zum Abgleich braucht. Keine Telefonnummer. */
export function terminDokument(doc: Dok, locationId: string): (TerminFund & { vorname: string; nachname: string; kalender: string }) | null {
  const appointmentId = idVon(doc)
  const start = String(doc.fields?.start?.timestampValue ?? '')
  if (!appointmentId || !doc.fields || !start) return null
  const patient = mapFelder(doc.fields.patient)
  const kalender = mapFelder(doc.fields.calendar)
  return {
    appointmentId, locationId, iso: start,
    geloescht: doc.fields.isDeleted?.booleanValue === true,
    vorname: String(patient.firstName?.stringValue ?? ''),
    nachname: String(patient.lastName?.stringValue ?? ''),
    kalender: String(kalender.name?.stringValue ?? ''),
  }
}

async function firestore(token: string, pfad: string, body?: unknown): Promise<Response> {
  return fetch(`${BASIS}/${pfad}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
}

/** Ob der eingetragene Termin in CalendR noch steht. „unbekannt“ lässt den Vermerk in Ruhe. */
export async function terminNachsehen(
  token: string,
  clientId: string,
  v: { iso: string; appointmentId?: string; locationId?: string; behandler: string },
  patient: string,
  orte: string[],
): Promise<TerminFund | 'weg' | 'unbekannt'> {
  if (!ID.test(clientId) || !token) return 'unbekannt'
  if (v.appointmentId && ID.test(v.appointmentId) && v.locationId && ID.test(v.locationId)) {
    try {
      const r = await firestore(token, `clients/${clientId}/locations/${v.locationId}/appointments/${v.appointmentId}`)
      if (r.status === 404) return 'weg'
      if (!r.ok) return 'unbekannt'
      const doc = await r.json() as Dok
      const fund = terminDokument(doc, v.locationId)
      if (!fund || fund.geloescht) return 'weg'
      return fund
    } catch {
      return 'unbekannt'
    }
  }
  const start = new Date(v.iso)
  if (Number.isNaN(start.getTime())) return 'unbekannt'
  const ziele = [...new Set(v.locationId && ID.test(v.locationId) ? [v.locationId] : orte.filter((id) => ID.test(id)))].slice(0, 4)
  if (!ziele.length) return 'unbekannt'
  let gelesen = false
  const treffer: ReturnType<typeof terminDokument>[] = []
  for (const locationId of ziele) {
    try {
      const r = await firestore(token, `clients/${clientId}/locations/${locationId}:runQuery`, {
        structuredQuery: {
          from: [{ collectionId: 'appointments' }],
          where: { fieldFilter: { field: { fieldPath: 'start' }, op: 'EQUAL', value: { timestampValue: start.toISOString() } } },
          limit: 20,
        },
      })
      if (!r.ok) continue
      gelesen = true
      const zeilen = await r.json() as { document?: Dok }[]
      for (const zeile of zeilen) {
        if (zeile.document) treffer.push(terminDokument({ ...zeile.document, fields: zeile.document.fields }, locationId))
      }
    } catch { /* nächster Standort */ }
  }
  if (!gelesen) return 'unbekannt'
  const lebend = treffer.filter((t): t is NonNullable<typeof t> => !!t && !t.geloescht && patientGleich(patient, t.vorname, t.nachname))
  const gleich = lebend.find((t) => !v.behandler || t.kalender.localeCompare(v.behandler, 'de', { sensitivity: 'accent' }) === 0)
  return gleich ?? 'weg'
}

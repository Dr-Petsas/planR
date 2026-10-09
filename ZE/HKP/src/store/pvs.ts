import { useSyncExternalStore } from 'react'
import { mk } from '../mandant'
import type { Patient } from '../stammdaten'

/** DENS-Connector über Vite-Proxy (gleicher Ursprung). Optional direkte Basis-URL in den Einstellungen. */
const PROXY = '/pvs'
const KEY = mk('hkp.pvs.v1')

export interface PvsPatient {
  id: string
  patientNumber?: string
  title?: string
  lastName: string
  firstName: string
  birthDate?: string
  postalCode?: string
  street?: string
  city?: string
  phone?: string
  insurance?: string
  insuranceNumber?: string
  insuranceIk?: string
  insuranceStatusQuarter?: string
}

export interface PvsHkpAnlage {
  id: string
  kind: string
  number: number
  alreadyPresent?: boolean
  planFindingNumber?: number
  source?: string
}

interface Verbindung {
  /** leer = Vite-Proxy /pvs → 127.0.0.1:8770 */
  basis: string
}

function lesen(): Verbindung {
  try {
    const s = localStorage.getItem(KEY)
    if (!s) return { basis: '' }
    const v = JSON.parse(s) as Partial<Verbindung>
    return { basis: typeof v.basis === 'string' ? v.basis.trim() : '' }
  } catch {
    return { basis: '' }
  }
}

let verbindung = lesen()
const abonnenten = new Set<() => void>()
const melden = () => abonnenten.forEach((f) => f())

export function pvsBasisSetzen(basis: string) {
  verbindung = { basis: basis.trim().replace(/\/+$/, '') }
  localStorage.setItem(KEY, JSON.stringify(verbindung))
  melden()
}

export function usePvsVerbindung() {
  return useSyncExternalStore(
    (f) => { abonnenten.add(f); return () => abonnenten.delete(f) },
    () => verbindung,
    () => verbindung,
  )
}

function basisUrl() {
  return verbindung.basis || PROXY
}

async function anfrage<T>(pfad: string, init?: RequestInit): Promise<T> {
  const url = `${basisUrl()}${pfad.startsWith('/') ? pfad : `/${pfad}`}`
  let r: Response
  try {
    r = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  } catch {
    throw new Error('PVS-Connector nicht erreichbar. Läuft der Dienst lokal?')
  }
  let body: { error?: string } & Record<string, unknown> = {}
  try {
    body = await r.json()
  } catch {
    /* leer */
  }
  if (!r.ok) throw new Error(typeof body.error === 'string' ? body.error : `PVS-Connector: HTTP ${r.status}`)
  return body as T
}

export async function pvsStatus() {
  return anfrage<{ service: string; mode: string; clinicalCreate?: boolean }>('/health')
}

/** Freitextsuche (Vor-/Nachname) über den Connector-Parameter `q`. */
export async function pvsPatientenSuchen(suchtext: string) {
  const text = suchtext.trim()
  if (!text) throw new Error('Suchbegriff eingeben.')
  const q = new URLSearchParams({ q: text })
  const r = await anfrage<{ items: PvsPatient[]; total: number }>(`/patients?${q}`)
  return r.items ?? []
}

/** Sendet natives PlanR-JSON; Mapping und Validierung liegen im PVS-Connector. */
export async function pvsHkpAnlegen(patientId: string, plan: unknown, ergebnis: unknown) {
  if (!/^\d+$/.test(patientId)) throw new Error('Ungültige Patienten-ID.')
  const json = JSON.stringify({ ...(plan as object), ergebnis })
  return anfrage<PvsHkpAnlage>(`/patients/${patientId}/hkps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json }),
  })
}

/** Anrede aus DENS-Titel; übrige Felder nur setzen, wenn der Connector sie liefert. */
export function patientAusPvs(p: PvsPatient, bisher: Patient): Patient {
  const anrede = p.title === 'Frau' || p.title === 'Herr' ? p.title : bisher.anrede
  return {
    ...bisher,
    anrede,
    vorname: p.firstName || bisher.vorname,
    name: p.lastName || bisher.name,
    geburtsdatum: p.birthDate || bisher.geburtsdatum,
    strasse: p.street ?? bisher.strasse,
    plz: p.postalCode ?? bisher.plz,
    ort: p.city ?? bisher.ort,
    kasse: p.insurance || bisher.kasse,
    kassenNr: p.insuranceIk || bisher.kassenNr,
    versichertenNr: p.insuranceNumber || bisher.versichertenNr,
  }
}

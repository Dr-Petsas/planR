// Arzt für Stempel und Unterschrift im Kostenvoranschlag: aus dem Pickadoc-Mitarbeiterprofil
// (clients/{praxis}/users/{uid}: title, firstName, lastName, role, signature als PNG-Data-URL).

import { FIREBASE } from './anmeldung.ts'

export interface Arzt { uid: string; name: string; signatur: string }

type Wert = { stringValue?: string; booleanValue?: boolean }
interface Dok { name?: string; fields?: Record<string, Wert> }

const BASIS = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projekt}/databases/(default)/documents`
const FELDER = ['title', 'firstName', 'lastName', 'role', 'hidden', 'signature']
const SIGNATUR = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]{100,900000}$/

const s = (d: Dok, k: string) => String(d.fields?.[k]?.stringValue ?? '').trim()

export function arztAus(d: Dok): Arzt {
  return {
    uid: String(d.name ?? '').split('/').pop() ?? '',
    name: [s(d, 'title'), s(d, 'firstName'), s(d, 'lastName')].filter(Boolean).join(' '),
    signatur: SIGNATUR.test(s(d, 'signature')) ? s(d, 'signature') : '',
  }
}

const vergleich = (x: string) => x.toLowerCase().replace(/dr\.|med\.|dent\.|[^a-zäöüß ]/g, ' ').split(/\s+/).filter((w) => w.length > 2)

/** Dieselbe Person, Titel beiseite: „Dr.med.dent. Michael Petsas“ und „Dr. Michael Petsas“. */
export function selberArzt(a: string, b: string): boolean {
  const x = vergleich(a)
  const y = vergleich(b)
  if (!x.length || !y.length) return false
  const gemein = x.filter((w) => y.includes(w)).length
  return gemein >= Math.min(2, x.length, y.length)
}

const sichtbar = (aerzte: Dok[]) => aerzte.filter((d) => d.fields?.hidden?.booleanValue !== true).map(arztAus).filter((a) => a.name)

/**
 * Wer unterschreibt: das angemeldete Konto, wenn es Arzt ist (nie die Unterschrift eines Kollegen); sonst der
 * Arzt der Praxis, dessen Name zum Praxiskopf passt, sonst der erste mit Unterschrift.
 */
export function arztWaehlen(eigen: Dok | null, aerzte: Dok[], zahnarzt = ''): Arzt | null {
  if (eigen && s(eigen, 'role') === 'doctor') return arztAus(eigen)
  const liste = sichtbar(aerzte)
  const passend = liste.find((a) => selberArzt(a.name, zahnarzt))
  const mit = liste.filter((a) => a.signatur)
  return passend ?? mit[0] ?? liste[0] ?? null
}

/** Nur der namensgleiche Arzt, nie der erste Kollege mit Unterschrift. */
export function arztZumNamen(aerzte: Dok[], name: string): Arzt | null {
  const treffer = sichtbar(aerzte).filter((a) => selberArzt(a.name, name))
  return treffer.find((a) => a.signatur) ?? treffer[0] ?? null
}

/**
 * Eigene Unterschrift bleibt. Fehlt sie, gilt die der verknüpften Pickadoc-Praxis nur bei demselben Namen.
 * Ohne eigenes Arztprofil gilt der schon namensgleich gewählte Arzt der verknüpften Praxis.
 */
export function signaturVonVerknuepft(eigen: Arzt | null, verknuepft: Arzt | null): Arzt | null {
  if (!verknuepft?.signatur) return eigen
  if (!eigen) return verknuepft
  if (eigen.signatur || !selberArzt(eigen.name, verknuepft.name)) return eigen
  return { ...eigen, signatur: verknuepft.signatur }
}

async function lesen<T>(url: string, init?: RequestInit): Promise<T | null> {
  const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}key=${FIREBASE.apiKey}`, { ...init, signal: AbortSignal.timeout(6000) })
  return r.ok ? await r.json() as T : null
}

const BILD_HOST = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com'])

/** Porträt aus dem Pickadoc-Mitarbeiterprofil, nur die eigene Datei, nie eine fremde Adresse. */
export async function avatarHolen(clientId: string, uid: string): Promise<{ art: string; daten: Buffer } | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientId) || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return null
  const dok = await lesen<Dok>(`${BASIS}/clients/${clientId}/users/${uid}?mask.fieldPaths=avatarUrl`)
  const url = s(dok ?? {}, 'avatarUrl')
  let ziel: URL
  try { ziel = new URL(url) } catch { return null }
  if (ziel.protocol !== 'https:' || !BILD_HOST.has(ziel.host)) return null
  if (!decodeURIComponent(ziel.pathname).includes(`/clients/${clientId}/users/${uid}`)) return null
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!r.ok) return null
  const art = (r.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!/^image\/(jpeg|png|webp)$/.test(art)) return null
  const daten = Buffer.from(await r.arrayBuffer())
  if (daten.length < 32 || daten.length > 2_000_000) return null
  return { art, daten }
}

const zwischen = new Map<string, { arzt: Arzt | null; zeit: number }>()

function aerzteAbfragen(clientId: string): Promise<{ document?: Dok }[] | null> {
  return lesen<{ document?: Dok }[]>(`${BASIS}/clients/${clientId}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'EQUAL', value: { stringValue: 'doctor' } } },
        select: { fields: FELDER.map((fieldPath) => ({ fieldPath })) },
        limit: 30,
      },
    }),
  })
}

const dokumente = (liste: { document?: Dok }[] | null) => (liste ?? []).map((x) => x.document).filter((d): d is Dok => !!d)

export async function arztAusPickadoc(clientId: string, uid: string, zahnarzt = ''): Promise<Arzt | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientId)) return null
  const key = `${clientId}|${uid}|${zahnarzt}`
  const alt = zwischen.get(key)
  if (alt && Date.now() - alt.zeit < 10 * 60_000) return alt.arzt
  const praxis = `${BASIS}/clients/${clientId}`
  const [eigen, liste] = await Promise.all([
    /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? lesen<Dok>(`${praxis}/users/${uid}?${FELDER.map((f) => `mask.fieldPaths=${f}`).join('&')}`) : null,
    aerzteAbfragen(clientId),
  ])
  const arzt = arztWaehlen(eigen, dokumente(liste), zahnarzt)
  zwischen.set(key, { arzt, zeit: Date.now() })
  return arzt
}

/** Namensgleicher Arzt einer anderen Pickadoc-Praxis. Kein Treffer bleibt leer, es wird niemand anderes genommen. */
export async function arztDerPraxis(clientId: string, name: string): Promise<Arzt | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientId) || !vergleich(name).length) return null
  const key = `name|${clientId}|${name}`
  const alt = zwischen.get(key)
  if (alt && Date.now() - alt.zeit < 10 * 60_000) return alt.arzt
  const arzt = arztZumNamen(dokumente(await aerzteAbfragen(clientId)), name)
  zwischen.set(key, { arzt, zeit: Date.now() })
  return arzt
}

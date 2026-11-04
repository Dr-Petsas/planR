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

/**
 * Wer unterschreibt: das angemeldete Konto, wenn es Arzt ist (nie die Unterschrift eines Kollegen); sonst der
 * Arzt der Praxis, dessen Name zum Praxiskopf passt, sonst der erste mit Unterschrift.
 */
export function arztWaehlen(eigen: Dok | null, aerzte: Dok[], zahnarzt = ''): Arzt | null {
  if (eigen && s(eigen, 'role') === 'doctor') return arztAus(eigen)
  const sichtbar = aerzte.filter((d) => d.fields?.hidden?.booleanValue !== true).map(arztAus).filter((a) => a.name)
  const woerter = vergleich(zahnarzt)
  const passt = (a: Arzt) => woerter.length > 0 && vergleich(a.name).filter((w) => woerter.includes(w)).length >= Math.min(2, woerter.length)
  const mit = sichtbar.filter((a) => a.signatur)
  return sichtbar.find(passt) ?? mit[0] ?? sichtbar[0] ?? null
}

async function lesen<T>(url: string, init?: RequestInit): Promise<T | null> {
  const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}key=${FIREBASE.apiKey}`, { ...init, signal: AbortSignal.timeout(6000) })
  return r.ok ? await r.json() as T : null
}

const zwischen = new Map<string, { arzt: Arzt | null; zeit: number }>()

export async function arztAusPickadoc(clientId: string, uid: string, zahnarzt = ''): Promise<Arzt | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientId)) return null
  const key = `${clientId}|${uid}|${zahnarzt}`
  const alt = zwischen.get(key)
  if (alt && Date.now() - alt.zeit < 10 * 60_000) return alt.arzt
  const praxis = `${BASIS}/clients/${clientId}`
  const [eigen, liste] = await Promise.all([
    /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? lesen<Dok>(`${praxis}/users/${uid}?${FELDER.map((f) => `mask.fieldPaths=${f}`).join('&')}`) : null,
    lesen<{ document?: Dok }[]>(`${praxis}:runQuery`, {
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
    }),
  ])
  const arzt = arztWaehlen(eigen, (liste ?? []).map((x) => x.document).filter((d): d is Dok => !!d), zahnarzt)
  zwischen.set(key, { arzt, zeit: Date.now() })
  return arzt
}

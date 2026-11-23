/**
 * Superuser: ein PlanR-Konto öffnen, sperren und löschen.
 * Alles hier betrifft nur PlanR (Buchung, Zugänge, Ablage). Das Pickadoc-Konto bleibt, wie es ist.
 */
import type { Buchung } from './buchung.ts'
import type { Konto, Zugaenge } from './anmeldung.ts'
import { mandantVon } from './anmeldung.ts'
import { BETREIBER } from './probeEingang.ts'
import { gaesteVon, verbundVon } from './verbund.ts'

const klein = (s: unknown) => String(s ?? '').trim().toLowerCase()

/** Was in PlanR zu einer Anmelde-Adresse gehört */
export interface KontoUmfang {
  email: string
  /** Buchungen dieser Adresse */
  buchungen: string[]
  /** Pickadoc-Praxen, die PlanR dazu kennt */
  clientIds: string[]
  /** Vermerkte Konten dieser Praxen (auch Kollegen) */
  uids: string[]
}

const gehoertZu = (b: Buchung, email: string) => klein(b.inhaber?.email) === email || klein(b.pickadocKonto) === email

export function kontoUmfang(buchungen: Buchung[], z: Zugaenge, adresse: string): KontoUmfang {
  const email = klein(adresse)
  const eigene = email.includes('@') ? buchungen.filter((b) => gehoertZu(b, email)) : []
  const clientIds = new Set<string>()
  for (const b of eigene) if (b.konto?.clientId) clientIds.add(b.konto.clientId)
  if (email.includes('@')) for (const b of Object.values(z.benutzer)) if (klein(b.email) === email && b.clientId) clientIds.add(b.clientId)
  const uids = Object.entries(z.benutzer).filter(([, b]) => clientIds.has(b.clientId) || (email.includes('@') && klein(b.email) === email)).map(([uid]) => uid)
  return { email, buchungen: eigene.map((b) => b.id), clientIds: [...clientIds], uids }
}

/**
 * Konto für die Sitzung des Superusers. Hat sich die Praxis schon angemeldet, ist es ihr vermerktes Konto;
 * sonst reicht die Praxis aus der Buchung – der Superuser kommt auch in ein Konto, das noch nie benutzt wurde.
 */
export function sudoKonto(buchungen: Buchung[], z: Zugaenge, adresse: string): Konto | null {
  const email = klein(adresse)
  if (!email.includes('@')) return null
  const ausBenutzer = ([uid, b]: [string, Zugaenge['benutzer'][string]]): Konto => ({
    uid, email: b.email, name: b.name, clientId: b.clientId, role: b.role, admin: b.role === 'admin' || b.role === 'superuser',
  })
  const direkt = Object.entries(z.benutzer).find(([, b]) => klein(b.email) === email)
  if (direkt) return ausBenutzer(direkt)
  const b = buchungen.find((x) => gehoertZu(x, email) && x.konto?.clientId)
  const clientId = b?.konto?.clientId
  if (!b || !clientId) return null
  const admin = Object.entries(z.benutzer).find(([, x]) => x.clientId === clientId && (x.role === 'admin' || x.role === 'superuser'))
  if (admin) return ausBenutzer(admin)
  return {
    uid: b.konto?.uid || `sudo-${clientId}`,
    email: klein(b.inhaber?.email) || email,
    name: [b.inhaber?.titel, b.inhaber?.vorname, b.inhaber?.nachname].filter(Boolean).join(' ') || b.praxis?.name || email,
    clientId, role: 'admin', admin: true,
  }
}

// ---------- Sperre ----------

export interface Sperre { email: string; clientIds: string[]; am: string; von: string }

export function sperrenPruefen(roh: unknown): Sperre[] {
  if (!Array.isArray(roh)) return []
  return roh.flatMap((s) => {
    const email = klein((s as Sperre | null)?.email)
    if (!s || typeof s !== 'object' || !email.includes('@')) return []
    const e = s as Partial<Sperre>
    return [{
      email,
      clientIds: Array.isArray(e.clientIds) ? e.clientIds.filter((c): c is string => typeof c === 'string' && !!c) : [],
      am: typeof e.am === 'string' ? e.am : '', von: typeof e.von === 'string' ? e.von : '',
    }]
  })
}

/** Gesperrt ist die Adresse selbst und jedes Konto ihrer Praxis. */
export function istGesperrt(liste: Sperre[], k: { email?: string; clientId?: string }): boolean {
  const email = klein(k.email)
  return liste.some((s) => (!!email && s.email === email) || (!!k.clientId && s.clientIds.includes(k.clientId)))
}

export function sperreSetzen(liste: Sperre[], u: KontoUmfang, von: string, jetzt = new Date().toISOString()): Sperre[] {
  return [...sperreLoesen(liste, u), { email: u.email, clientIds: [...u.clientIds], am: jetzt, von }]
}

export function sperreLoesen(liste: Sperre[], u: KontoUmfang): Sperre[] {
  return liste.filter((s) => s.email !== u.email && !s.clientIds.some((c) => u.clientIds.includes(c)))
}

/** Für die Liste des Superusers: lässt sich das Konto der Buchung öffnen, ist es gesperrt? */
export interface KontoStand { email: string; zugang: boolean; gesperrt: boolean }

export function kontoStand(buchungen: Buchung[], z: Zugaenge, sperren: Sperre[], buchungId: string): KontoStand | null {
  const b = buchungen.find((x) => x.id === buchungId)
  const email = klein(b?.inhaber?.email) || klein(b?.pickadocKonto)
  if (!b || !email.includes('@')) return null
  const u = kontoUmfang(buchungen, z, email)
  return {
    email,
    zugang: !!sudoKonto(buchungen, z, email),
    gesperrt: istGesperrt(sperren, { email }) || u.clientIds.some((clientId) => istGesperrt(sperren, { clientId })),
  }
}

// ---------- Löschen ----------

export interface LoeschPlan {
  umfang: KontoUmfang
  /** Buchungen und Zugänge ohne dieses Konto */
  buchungen: Buchung[]
  zugaenge: Zugaenge
  /** Die entfernten Buchungen (fürs Archiv) */
  entfernt: Buchung[]
  /** Ablagen, die danach niemandem mehr gehören */
  mandanten: string[]
}

/**
 * Was beim Löschen aus PlanR verschwindet. Danach kennt PlanR die Adresse nicht mehr: Sie kann sich neu anmelden.
 * Eine Ablage fällt nur weg, wenn keine andere Praxis sie nutzt; die Stamm-Ablage „standard“ nie.
 */
export function loeschPlan(buchungen: Buchung[], z: Zugaenge, adresse: string): LoeschPlan | { fehler: string } {
  const umfang = kontoUmfang(buchungen, z, adresse)
  if (!umfang.email.includes('@')) return { fehler: 'Bitte die E-Mail-Adresse des Kundenkontos.' }
  if (umfang.email === BETREIBER) return { fehler: 'Das Superuser-Konto lässt sich nicht löschen.' }
  if (!umfang.buchungen.length && !umfang.uids.length) return { fehler: 'Zu dieser Adresse gibt es in PlanR kein Konto.' }
  const weg = new Set(umfang.clientIds)
  for (const id of weg) {
    if (verbundVon(z, id) || gaesteVon(z, id).length) return { fehler: 'Diese Praxis ist mit einer anderen gekoppelt. Bitte zuerst entkoppeln.' }
    if (mandantVon(z, { clientId: id }) === 'standard') return { fehler: 'Diese Praxis nutzt die Stamm-Ablage von PlanR und lässt sich hier nicht löschen.' }
  }
  const uids = new Set(umfang.uids)
  const mails = new Set([umfang.email, ...umfang.uids.map((uid) => klein(z.benutzer[uid]?.email))])
  const bleibt = buchungen.filter((b) => !umfang.buchungen.includes(b.id))
  const zugaenge: Zugaenge = {
    mandanten: Object.fromEntries(Object.entries(z.mandanten).filter(([id]) => !weg.has(id))),
    benutzer: Object.fromEntries(Object.entries(z.benutzer).filter(([uid]) => !uids.has(uid))),
    vorbelegung: Object.fromEntries(Object.entries(z.vorbelegung ?? {}).filter(([mail]) => !mails.has(klein(mail)))),
  }
  const nochDa = new Set([
    ...Object.keys(zugaenge.mandanten),
    ...Object.values(zugaenge.benutzer).map((b) => b.clientId),
    ...bleibt.map((b) => b.konto?.clientId ?? ''),
  ].filter(Boolean).map((id) => mandantVon(zugaenge, { clientId: id })))
  const mandanten = [...new Set([...weg].map((id) => mandantVon(z, { clientId: id })))].filter((m) => m !== 'standard' && !nochDa.has(m))
  return { umfang, buchungen: bleibt, zugaenge, entfernt: buchungen.filter((b) => umfang.buchungen.includes(b.id)), mandanten }
}

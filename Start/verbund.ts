/**
 * Praxis-Verbund: zwei Pickadoc-Praxen teilen sich PlanR – dieselben Pläne und HKPs, eine Bridge, eine Sprach-App.
 * Die Gast-Praxis übernimmt Ablage (Mandant) und HKP-Register der Haupt-Praxis; ihr eigener Stand bleibt
 * unverändert liegen und kommt beim Entkoppeln zurück. Keine Ketten: ein Gast hat keine Gäste, eine Haupt-Praxis
 * ist nirgends Gast. Abgerechnet wird jede Praxis weiter über ihre eigene Ablage.
 */
import { createHash, randomBytes } from 'node:crypto'
import {
  MANDANT_AUS_CLIENT, hauptpraxis, mandantVon, registerVon,
  type MandantEintrag, type VerbundInfo, type Zugaenge,
} from './anmeldung.ts'

export const verbundVon = (z: Zugaenge, clientId: string): VerbundInfo | undefined => z.mandanten[clientId]?.verbund

export const gaesteVon = (z: Zugaenge, haupt: string): [string, VerbundInfo][] =>
  Object.entries(z.mandanten).flatMap(([id, e]) => (e.verbund?.haupt === haupt ? [[id, e.verbund] as [string, VerbundInfo]] : []))

const REGISTER_RE = /^[A-Za-z0-9_-]{1,64}$/

/** Ablage, die der Praxis selbst gehört (im Verbund: die geparkte) – für Rechnungen und Zählwerk */
export function eigenerMandant(z: Zugaenge, clientId: string): string {
  const v = verbundVon(z, clientId)
  return v ? v.vorher.eintrag?.mandant ?? MANDANT_AUS_CLIENT(clientId) : mandantVon(z, { clientId })
}

export function eigenesRegister(z: Zugaenge, clientId: string): string {
  const v = verbundVon(z, clientId)
  if (!v) return registerVon(z, { clientId })
  const r = v.vorher.eintrag?.register
  return typeof r === 'string' && REGISTER_RE.test(r) ? r : clientId
}

/** Mandanten, deren Bridge diesen Mandanten bedienen darf: er selbst, dann die geparkten Ablagen seiner Gäste */
export function bridgeMandanten(z: Zugaenge, mandant: string): string[] {
  const liste = [mandant]
  for (const [id, e] of Object.entries(z.mandanten)) {
    if (!e.verbund || e.mandant !== mandant) continue
    const eigen = e.verbund.vorher.eintrag?.mandant ?? MANDANT_AUS_CLIENT(id)
    if (!liste.includes(eigen)) liste.push(eigen)
  }
  return liste
}

/** Warum diese Kopplung nicht geht – null, wenn sie geht */
export function koppelnPruefen(z: Zugaenge, gast: string, haupt: string): string | null {
  if (!gast || !haupt) return 'Praxis unbekannt.'
  if (gast === haupt) return 'Das ist der Code Ihrer eigenen Praxis. Geben Sie ihn in der anderen Praxis ein.'
  if (verbundVon(z, gast)) return 'Ihre Praxis ist schon mit einer anderen gekoppelt. Bitte zuerst entkoppeln.'
  if (verbundVon(z, haupt)) return 'Die andere Praxis ist selbst an eine dritte gekoppelt. Bitte den Code dort erzeugen.'
  if (gaesteVon(z, gast).length) return 'An Ihre Praxis sind schon andere gekoppelt. Bitte den Code in Ihrer Praxis erzeugen und in der anderen eingeben.'
  if (mandantVon(z, { clientId: gast }) === mandantVon(z, { clientId: haupt })) return 'Die beiden Praxen teilen sich schon dieselbe Ablage.'
  return null
}

const ohneVerbund = (e: MandantEintrag | undefined): Omit<MandantEintrag, 'verbund'> | null => {
  if (!e) return null
  const { verbund: _, ...rest } = e
  return structuredClone(rest)
}

/**
 * Gast an Haupt koppeln. Der Admin, der koppelt (`uid`), sieht danach alle Praxen der Haupt-Praxis; die übrigen
 * Konten des Gastes schaltet der Admin der Haupt-Praxis frei, sobald dort mehrere DS-Win-Praxen liegen.
 */
export function koppeln(z: Zugaenge, o: { gast: string; haupt: string; hauptName: string; gastName: string; von: string; uid: string; jetzt?: Date }): Zugaenge {
  const fehler = koppelnPruefen(z, o.gast, o.haupt)
  if (fehler) throw new Error(fehler)
  const neu = structuredClone(z)
  const hauptKonto = { clientId: o.haupt }
  const praxen = neu.mandanten[o.haupt]?.praxen
  const vorherPraxen: Record<string, number[] | null> = {}
  for (const [uid, b] of Object.entries(neu.benutzer)) {
    if (b.clientId !== o.gast) continue
    vorherPraxen[uid] = b.praxen ? [...b.praxen] : null
    if (uid === o.uid && praxen && praxen.length > 1) b.praxen = praxen.map((p) => p.nummer).sort()
    else delete b.praxen
  }
  neu.mandanten[o.gast] = {
    mandant: mandantVon(z, hauptKonto),
    register: registerVon(z, hauptKonto),
    hauptpraxis: hauptpraxis(z, hauptKonto),
    ...(praxen ? { praxen: structuredClone(praxen) } : {}),
    verbund: {
      haupt: o.haupt, hauptName: o.hauptName.slice(0, 120), gastName: o.gastName.slice(0, 120),
      seit: (o.jetzt ?? new Date()).toISOString(), von: o.von.slice(0, 200),
      vorher: { eintrag: ohneVerbund(z.mandanten[o.gast]), praxen: vorherPraxen },
    },
  }
  return neu
}

/** Gast entkoppeln: Eintrag und Praxis-Zuordnungen seiner Konten wie vor dem Koppeln */
export function entkoppeln(z: Zugaenge, gast: string): Zugaenge {
  const v = verbundVon(z, gast)
  if (!v) throw new Error('Diese Praxis ist mit keiner anderen gekoppelt.')
  const neu = structuredClone(z)
  if (v.vorher.eintrag) neu.mandanten[gast] = structuredClone(v.vorher.eintrag)
  else delete neu.mandanten[gast]
  for (const [uid, b] of Object.entries(neu.benutzer)) {
    if (b.clientId !== gast) continue
    const alt = v.vorher.praxen[uid]
    if (alt) b.praxen = [...alt]
    else delete b.praxen
  }
  return neu
}

// ---------- Kopplungscode ----------

/** Ohne leicht verwechselbare Zeichen; 10 Zeichen ≈ 50 Bit, gültig 30 Minuten, Fehlversuche bremst der Server */
const ZEICHEN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_MINUTEN = 30
export interface VerbundCode { hash: string; haupt: string; bis: string; von: string }

export const verbundCodeNorm = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')
const codeHash = (code: string) => createHash('sha256').update(`planr-verbund:${verbundCodeNorm(code)}`, 'utf8').digest('hex')

export function neuerVerbundCode(): string {
  const z = [...randomBytes(10)].map((b) => ZEICHEN[b % ZEICHEN.length]).join('')
  return `${z.slice(0, 5)}-${z.slice(5)}`
}

/** Ein offener Code je Haupt-Praxis; abgelaufene fallen weg */
export function codeSetzen(liste: VerbundCode[], code: string, haupt: string, von: string, jetzt = Date.now()): VerbundCode[] {
  const frisch = liste.filter((c) => Date.parse(c.bis) > jetzt && c.haupt !== haupt)
  return [...frisch, { hash: codeHash(code), haupt, von, bis: new Date(jetzt + CODE_MINUTEN * 60_000).toISOString() }]
}

export function codeFinden(liste: VerbundCode[], code: string, jetzt = Date.now()): VerbundCode | null {
  if (verbundCodeNorm(code).length !== 10) return null
  const h = codeHash(code)
  return liste.find((c) => c.hash === h && Date.parse(c.bis) > jetzt) ?? null
}

export const codeVerbrauchen = (liste: VerbundCode[], c: VerbundCode, jetzt = Date.now()) =>
  liste.filter((x) => x.hash !== c.hash && Date.parse(x.bis) > jetzt)

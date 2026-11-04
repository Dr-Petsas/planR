import { useCallback, useEffect, useState } from 'react'

/**
 * Ablage gespeicherter Pläne mit Freigabe-Status (im Browser, localStorage).
 * Die Form der Einträge entspricht dem späteren MAS-Register, damit die Ablage
 * für die Clara-Anbindung umziehen kann, ohne dass sich die Oberfläche ändert.
 */
export type AblageStatus = 'entwurf' | 'freigegeben'

export interface AblageEintrag<P> {
  nummer: string
  patient: string
  betrag: number
  geaendert: string
  status: AblageStatus
  freigegebenAm?: string
  plan: P
  /** Plan fürs Praxisprogramm (pvsplan.ts), beim Speichern aus dem Rechenergebnis */
  pvs?: unknown[]
}

export interface AblageDaten<P> {
  nummer: string
  patient: string
  betrag: number
  plan: P
  pvs?: unknown[]
}

export interface Ablage<P> {
  liste: AblageEintrag<P>[]
  eintrag: (nummer: string) => AblageEintrag<P> | undefined
  speichern: (daten: AblageDaten<P>) => void
  freigeben: (daten: AblageDaten<P>) => void
  zuruecknehmen: (nummer: string) => void
  loeschen: (nummer: string) => void
  /** In der PlanR-Übersicht angeklickter Plan (`?plan=`), sobald er in der Ablage liegt */
  zuOeffnen?: AblageEintrag<P>
  geoeffnet?: () => void
}

const HOECHSTENS = 200

const HUB_MODUL: Record<string, { kuerzel: string; art: 'Kasse' | 'Privat' }> = {
  'kassen-par': { kuerzel: 'PAR', art: 'Kasse' },
  'privat-par': { kuerzel: 'PA', art: 'Privat' },
  'kassen-kb': { kuerzel: 'KB', art: 'Kasse' },
  'privat-kb': { kuerzel: 'KB', art: 'Privat' },
  'kons-mkv': { kuerzel: 'MKV', art: 'Kasse' },
  'privat-kons': { kuerzel: 'KONS', art: 'Privat' },
  'privat-kv': { kuerzel: 'ZE', art: 'Privat' },
  'privat-impl': { kuerzel: 'IMPL', art: 'Privat' },
  'kassen-kfo': { kuerzel: 'KFO', art: 'Kasse' },
  'privat-kfo': { kuerzel: 'KFO', art: 'Privat' },
}
/** In dieser Sitzung in der Ablage gelöschte Pläne – die Übersicht entfernt nur, was ausdrücklich gemeldet wird */
const entfernt = new Map<string, { nummer: string; geaendert: string }[]>()
function entfernenMerken(key: string, e: { nummer: string; geaendert: string }) {
  const bisher = (entfernt.get(key) ?? []).filter((x) => x.nummer !== e.nummer)
  entfernt.set(key, [...bisher, { nummer: e.nummer, geaendert: e.geaendert }])
}

/** Modul für die PlanR-Übersicht; andere Mandanten als der Standard bleiben ihr fern (sonst überschreiben sie sich). */
const modulVon = (key: string) => (key.includes('@') ? '' : key.replace(/\.liste\.v\d+$/, ''))
/** PlanR-Übersicht; die Sitzung (Cookie) gilt für denselben Host, daher nicht fest 127.0.0.1 */
const hubAdresse = () => (typeof location === 'undefined' ? 'http://127.0.0.1:5189/api/plaene'
  : location.pathname.startsWith('/planer/') ? `${location.origin}/api/plaene`
  : location.hostname.endsWith('.pickadoc-tunnel.com') ? 'https://planr.pickadoc-tunnel.com/api/plaene'
    : `http://${location.hostname}:5189/api/plaene`)

/** In der PlanR-Übersicht gelöschte Pläne; ein später erneut gespeicherter Stand bleibt. */
export function ohneGeloeschte<E extends { nummer: string; geaendert: string }>(liste: E[], geloescht: { nummer: string; geaendert: string }[]): E[] {
  return liste.filter((e) => !geloescht.some((g) => g.nummer === e.nummer && (e.geaendert || '') <= g.geaendert))
}

/** In der PlanR-Übersicht importierter Plan, den die Ablage übernehmen soll */
export interface Import<P> {
  nummer: string
  patient: string
  betrag: number
  geaendert: string
  plan: P
}

/** Gelöschte entfernen, Importe übernehmen (als Entwurf, mit dem Stand des Imports). */
export function abgleichen<P>(liste: AblageEintrag<P>[], geloescht: { nummer: string; geaendert: string }[], eingang: Import<P>[]): AblageEintrag<P>[] {
  let neu = ohneGeloeschte(liste, geloescht)
  for (const e of eingang) {
    const da = neu.find((x) => x.nummer === e.nummer)
    if (da && (da.geaendert || '') >= e.geaendert) continue
    const eintrag: AblageEintrag<P> = { nummer: e.nummer, patient: e.patient, betrag: e.betrag, geaendert: e.geaendert, status: 'entwurf', plan: e.plan }
    neu = [eintrag, ...neu.filter((x) => x.nummer !== e.nummer)].slice(0, HOECHSTENS)
  }
  return neu
}

async function abgleichHolen<P>(modul: string): Promise<{ geloescht: { nummer: string; geaendert: string }[]; eingang: Import<P>[] }> {
  const leer = { geloescht: [], eingang: [] }
  if (!HUB_MODUL[modul] || typeof fetch !== 'function') return leer
  try {
    const r = await fetch(`${hubAdresse()}?nur=abgleich&modul=${encodeURIComponent(modul)}`, { cache: 'no-store', credentials: 'include' })
    const d = (await r.json()) as { geloescht?: { modul: string; nummer: string; geaendert: string }[]; eingang?: (Import<P> & { modul: string })[] }
    return {
      geloescht: (d.geloescht ?? []).filter((g) => g.modul === modul),
      eingang: (d.eingang ?? []).filter((e) => e.modul === modul && e.nummer && e.plan && typeof e.geaendert === 'string'),
    }
  } catch {
    return leer
  }
}

/** `?plan=<nummer>` aus der PlanR-Übersicht */
const angefragt = typeof location === 'undefined' ? '' : (new URLSearchParams(location.search).get('plan') ?? '').trim().slice(0, 80)

/** Gespeicherter Stand eines Plans aus der PlanR-Übersicht (gemeldet aus einem anderen Browser) */
async function inhaltHolen<P>(modul: string, nummer: string): Promise<AblageEintrag<P> | null> {
  if (!HUB_MODUL[modul] || !nummer || typeof fetch !== 'function') return null
  try {
    const q = new URLSearchParams({ nur: 'inhalt', modul, nummer })
    const r = await fetch(`${hubAdresse()}?${q}`, { cache: 'no-store', credentials: 'include' })
    if (!r.ok) return null
    const d = (await r.json()) as Partial<AblageEintrag<P>>
    if (!d.plan || typeof d.geaendert !== 'string') return null
    return {
      nummer, patient: String(d.patient ?? ''), betrag: Number(d.betrag) || 0, geaendert: d.geaendert,
      status: d.status === 'freigegeben' ? 'freigegeben' : 'entwurf', plan: d.plan,
    }
  } catch {
    return null
  }
}

/** Der Stand aus der Übersicht ersetzt den des Browsers nur, wenn er neuer ist. */
export function angefragtUebernehmen<P>(liste: AblageEintrag<P>[], e: AblageEintrag<P> | null): AblageEintrag<P>[] {
  if (!e) return liste
  const da = liste.find((x) => x.nummer === e.nummer)
  if (da && (da.geaendert || '') >= e.geaendert) return liste
  return [e, ...liste.filter((x) => x.nummer !== e.nummer)].slice(0, HOECHSTENS)
}

function anfrageErledigt() {
  const u = new URL(location.href)
  u.searchParams.delete('plan')
  history.replaceState(history.state, '', u.toString())
}

/** Zahnärztin/Zahnarzt aus dem Plan oder aus den Praxis-Einstellungen desselben Mandanten. */
function behandlerVon(key: string, plan: unknown): string {
  const aus = (x: unknown) => (typeof x === 'string' ? x.trim().slice(0, 80) : '')
  if (plan && typeof plan === 'object') {
    const p = plan as { praxis?: { zahnarzt?: unknown }; einstellungen?: { praxis?: { zahnarzt?: unknown } }; behandler?: unknown }
    const name = aus(p.praxis?.zahnarzt) || aus(p.einstellungen?.praxis?.zahnarzt) || aus(p.behandler)
    if (name) return name
  }
  if (typeof localStorage === 'undefined') return ''
  try {
    const roh = JSON.parse(localStorage.getItem(key.replace(/\.liste\.v\d+/, '.einstellungen.v1')) ?? 'null') as { praxis?: { zahnarzt?: unknown } } | null
    return aus(roh?.praxis?.zahnarzt)
  } catch {
    return ''
  }
}

/**
 * Ablage an die PlanR-Übersicht melden (Kopf für die Liste, Inhalt für den Export). Die Übersicht führt
 * die Meldungen aller Browser zusammen; was hier fehlt, bleibt dort stehen, bis es gelöscht gemeldet wird.
 */
function hubMelden(key: string, liste: AblageEintrag<unknown>[]) {
  const basis = modulVon(key)
  const meta = HUB_MODUL[basis]
  if (!meta || typeof fetch !== 'function') return
  const weg = entfernt.get(key) ?? []
  if (!liste.length && !weg.length) return
  const hub = hubAdresse()
  const plaene = liste.map((e) => ({
    modul: basis, kuerzel: meta.kuerzel, art: meta.art,
    nummer: e.nummer, patient: e.patient, betrag: e.betrag, status: e.status, geaendert: e.geaendert,
    behandler: behandlerVon(key, e.plan), plan: e.plan, ...(e.pvs ? { pvs: e.pvs } : {}),
  }))
  fetch(hub, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modul: basis, plaene, entfernt: weg }) }).catch(() => {})
}

function lesen<P>(key: string): AblageEintrag<P>[] {
  try {
    const roh = localStorage.getItem(key)
    const liste = roh ? JSON.parse(roh) : []
    return Array.isArray(liste) ? liste.map((e) => ({ status: 'entwurf', geaendert: e.datum ?? '', ...e })) : []
  } catch {
    return []
  }
}

export function useAblage<P>(key: string): Ablage<P> {
  const [liste, setListe] = useState<AblageEintrag<P>[]>(() => lesen<P>(key))
  const [anfrage, setAnfrage] = useState<{ nummer: string; bereit: boolean } | null>(
    () => (angefragt && HUB_MODUL[modulVon(key)] ? { nummer: angefragt, bereit: false } : null))
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(liste))
    hubMelden(key, liste)
  }, [key, liste])
  useEffect(() => {
    let vorbei = false
    const modul = modulVon(key)
    const nummer = anfrage && !anfrage.bereit ? anfrage.nummer : ''
    void Promise.all([abgleichHolen<P>(modul), nummer ? inhaltHolen<P>(modul, nummer) : null]).then(([{ geloescht, eingang }, gewuenscht]) => {
      if (vorbei) return
      if (geloescht.length || eingang.length || gewuenscht) {
        setListe((alt) => {
          const neu = angefragtUebernehmen(abgleichen(alt, geloescht, eingang), gewuenscht)
          return neu.length === alt.length && neu.every((e, i) => e === alt[i]) ? alt : neu
        })
      }
      if (nummer) setAnfrage({ nummer, bereit: true })
    })
    return () => { vorbei = true }
  }, [key])

  const ablegen = useCallback((d: AblageDaten<P>, status?: AblageStatus) => {
    setListe((alt) => {
      const vorher = alt.find((e) => e.nummer === d.nummer)
      const neuStatus = status ?? vorher?.status ?? 'entwurf'
      const eintrag: AblageEintrag<P> = {
        ...d,
        geaendert: new Date().toISOString(),
        status: neuStatus,
        freigegebenAm: neuStatus === 'freigegeben' ? (status ? new Date().toISOString() : vorher?.freigegebenAm) : undefined,
      }
      return [eintrag, ...alt.filter((e) => e.nummer !== d.nummer)].slice(0, HOECHSTENS)
    })
  }, [])

  const eintrag = useCallback((nummer: string) => liste.find((e) => e.nummer === nummer), [liste])
  const speichern = useCallback((d: AblageDaten<P>) => ablegen(d), [ablegen])
  const freigeben = useCallback((d: AblageDaten<P>) => ablegen(d, 'freigegeben'), [ablegen])
  const zuruecknehmen = useCallback((nummer: string) => {
    setListe((alt) => alt.map((e) => (e.nummer === nummer ? { ...e, status: 'entwurf', freigegebenAm: undefined, geaendert: new Date().toISOString() } : e)))
  }, [])
  const loeschen = useCallback((nummer: string) => setListe((alt) => {
    const weg = alt.find((e) => e.nummer === nummer)
    if (weg) entfernenMerken(key, weg)
    return alt.filter((e) => e.nummer !== nummer)
  }), [key])

  const zuOeffnen = anfrage?.bereit ? liste.find((e) => e.nummer === anfrage.nummer) : undefined
  const geoeffnet = useCallback(() => {
    setAnfrage(null)
    anfrageErledigt()
  }, [])
  useEffect(() => {
    if (anfrage?.bereit && !liste.some((e) => e.nummer === anfrage.nummer)) geoeffnet()
  }, [anfrage, liste, geoeffnet])

  return { liste, eintrag, speichern, freigeben, zuruecknehmen, loeschen, zuOeffnen, geoeffnet }
}

/** Unterscheidet sich der offene Plan vom abgelegten Stand? */
export function ungespeichert<P>(plan: P, eintrag: AblageEintrag<P> | undefined): boolean {
  return !eintrag || JSON.stringify(eintrag.plan) !== JSON.stringify(plan)
}

export const datumZeit = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

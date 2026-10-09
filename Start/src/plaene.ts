export type Art = 'Kasse' | 'Privat'

/** Eine Kachel in der gemeinsamen Übersicht. Ohne den Planinhalt. */
export interface PlanKarte {
  modul: string
  kuerzel: string
  art: Art
  nummer: string
  patient: string
  betrag: number
  status: string
  geaendert: string
  /** Query ohne Fragezeichen, z. B. hkp=<id> */
  oeffnen?: string
  /** Zahnärztin / Zahnarzt aus den Praxis-Einstellungen des Planers */
  behandler?: string
  /** HKP: Kennung der angehängten Befund-Datei im MAS-Register */
  befund?: string
}

/** Name der Zahnärztin / des Zahnarztes, falls der Plan ihn selbst trägt. */
export function behandlerAusPlan(plan: unknown): string {
  if (!plan || typeof plan !== 'object') return ''
  const p = plan as { praxis?: { zahnarzt?: unknown }; einstellungen?: { praxis?: { zahnarzt?: unknown } }; behandler?: unknown }
  const name = [p.praxis?.zahnarzt, p.einstellungen?.praxis?.zahnarzt, p.behandler].find((x) => typeof x === 'string' && x.trim())
  return typeof name === 'string' ? name.trim().slice(0, 80) : ''
}

const MODUL = /^[a-z0-9-]{1,40}$/
const OEFFNEN = /^[a-zA-Z0-9=&%._-]{1,200}$/
export const DATEI_ID = /^[\w-]{1,40}$/

export function tagVon(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

export function kartePrüfen(roh: unknown): PlanKarte | null {
  if (!roh || typeof roh !== 'object') return null
  const e = roh as Record<string, unknown>
  const modul = String(e.modul ?? '')
  const nummer = String(e.nummer ?? '').trim()
  const patient = String(e.patient ?? '').trim()
  const art = e.art === 'Privat' ? 'Privat' : e.art === 'Kasse' ? 'Kasse' : ''
  const betrag = Number(e.betrag)
  const geaendert = String(e.geaendert ?? '')
  if (!MODUL.test(modul) || !nummer || nummer.length > 80 || !art) return null
  if (!Number.isFinite(betrag) || patient.length > 160) return null
  if (Number.isNaN(new Date(geaendert).getTime())) return null
  const oeffnen = e.oeffnen ? String(e.oeffnen) : ''
  if (oeffnen && !OEFFNEN.test(oeffnen)) return null
  const karte: PlanKarte = {
    modul,
    kuerzel: String(e.kuerzel ?? modul).slice(0, 8),
    art,
    nummer: nummer.slice(0, 80),
    patient,
    betrag,
    status: String(e.status ?? 'entwurf').slice(0, 40),
    geaendert,
  }
  if (oeffnen) karte.oeffnen = oeffnen
  const befund = String(e.befund ?? '')
  if (DATEI_ID.test(befund)) karte.befund = befund
  const behandler = String(e.behandler ?? '').trim().slice(0, 80) || behandlerAusPlan(e.plan)
  if (behandler) karte.behandler = behandler
  return karte
}

/** Ersetzt alle Karten eines Moduls. Leere Liste löscht das Modul. */
export function modulErsetzen(alle: PlanKarte[], modul: string, neu: PlanKarte[]): PlanKarte[] {
  return [...neu.filter((k) => k.modul === modul), ...alle.filter((k) => k.modul !== modul)]
    .sort((a, b) => b.geaendert.localeCompare(a.geaendert))
}

/** In der Übersicht gelöschter Plan. Der Planer räumt ihn beim nächsten Start aus seiner Ablage. */
export interface Grab {
  modul: string
  nummer: string
  /** Stand des gelöschten Plans; später erneut gespeicherte Stände gelten wieder */
  geaendert: string
  am: string
  karte: PlanKarte
}

const GRAB_TAGE = 180
const GRAB_HOECHSTENS = 1000

export const begraben = (k: Pick<PlanKarte, 'modul' | 'nummer' | 'geaendert'>, graeber: Grab[]) =>
  graeber.some((g) => g.modul === k.modul && g.nummer === k.nummer && k.geaendert <= g.geaendert)

export function grabAnlegen(graeber: Grab[], karte: PlanKarte, jetzt = new Date()): Grab[] {
  const grenze = new Date(jetzt.getTime() - GRAB_TAGE * 864e5).toISOString()
  const neu: Grab = { modul: karte.modul, nummer: karte.nummer, geaendert: karte.geaendert, am: jetzt.toISOString(), karte }
  return [neu, ...graeber.filter((g) => !(g.modul === karte.modul && g.nummer === karte.nummer) && g.am >= grenze)].slice(0, GRAB_HOECHSTENS)
}

/** Export-/Importdatei eines Plans. `plan` ist der Planinhalt genau so, wie ihn der Planer speichert. */
export interface PlanDatei {
  format: 'planr-plan'
  version: 1
  modul: string
  kuerzel: string
  art: Art
  nummer: string
  patient: string
  betrag: number
  status: string
  exportiert: string
  plan: Record<string, unknown>
}

export const planDateiAus = (k: PlanKarte, plan: Record<string, unknown>, jetzt = new Date()): PlanDatei => ({
  format: 'planr-plan', version: 1, modul: k.modul, kuerzel: k.kuerzel, art: k.art, nummer: k.nummer,
  patient: k.patient, betrag: k.betrag, status: k.status, exportiert: jetzt.toISOString(), plan,
})

const istObjekt = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** Liest eine Plandatei. Alte Exporte aus dem HKP-Planer („Plan als JSON“) werden als HKP erkannt. */
export function planDateiLesen(roh: unknown): { datei?: PlanDatei; fehler?: string } {
  if (!istObjekt(roh)) return { fehler: 'Die Datei ist kein PlanR-Plan (JSON-Objekt erwartet).' }
  if (roh.format === 'planr-plan') {
    const modul = String(roh.modul ?? '')
    if (!MODUL.test(modul) || !istObjekt(roh.plan)) return { fehler: 'Die Plandatei ist unvollständig (Planer oder Inhalt fehlt).' }
    return {
      datei: {
        format: 'planr-plan', version: 1, modul,
        kuerzel: String(roh.kuerzel ?? modul).slice(0, 8), art: roh.art === 'Privat' ? 'Privat' : 'Kasse',
        nummer: String(roh.nummer ?? '').trim().slice(0, 80), patient: String(roh.patient ?? '').trim().slice(0, 160),
        betrag: Number.isFinite(Number(roh.betrag)) ? Number(roh.betrag) : 0, status: String(roh.status ?? 'entwurf').slice(0, 40),
        exportiert: String(roh.exportiert ?? ''), plan: roh.plan,
      },
    }
  }
  if (istObjekt(roh.zaehne) && istObjekt(roh.verwaltung) && istObjekt(roh.patient)) {
    const { ergebnis: _ergebnis, ...plan } = roh
    const p = roh.patient as { vorname?: string; name?: string }
    const summen = istObjekt(roh.ergebnis) && istObjekt(roh.ergebnis.summen) ? roh.ergebnis.summen : {}
    return {
      datei: {
        format: 'planr-plan', version: 1, modul: 'hkp', kuerzel: 'HKP', art: 'Kasse', nummer: '',
        patient: `${p.vorname ?? ''} ${p.name ?? ''}`.trim(), betrag: Number(summen.gesamt) || 0,
        status: 'wartet_auf_freigabe', exportiert: '', plan,
      },
    }
  }
  return { fehler: 'Die Datei ist kein PlanR-Plan.' }
}

/** Importierter Plan, den der Planer beim nächsten Öffnen in seine Ablage übernimmt */
export interface Eingang {
  modul: string
  nummer: string
  patient: string
  betrag: number
  geaendert: string
  plan: Record<string, unknown>
}

/** Ein Eingang ist erledigt, sobald der Planer den Plan mit diesem oder neuerem Stand meldet. */
export const eingangOffen = (eingang: Eingang[], gemeldet: Pick<PlanKarte, 'modul' | 'nummer' | 'geaendert'>[]) =>
  eingang.filter((e) => !gemeldet.some((k) => k.modul === e.modul && k.nummer === e.nummer && k.geaendert >= e.geaendert))

/** HKPs aus dem MAS-Register: verwerfen nur, solange nichts bei der Kasse liegt */
export const HKP_VERWERFBAR = ['wartet_auf_freigabe', 'freigegeben', 'abgelehnt']
export const loeschbar = (k: PlanKarte) => k.modul !== 'hkp' || HKP_VERWERFBAR.includes(k.status)
/** Import ersetzt den Planinhalt – bei HKPs nur, solange er noch auf Freigabe wartet */
export const ersetzbar = (k: PlanKarte) => k.modul !== 'hkp' || k.status === 'wartet_auf_freigabe'

export function planFiltern(plaene: PlanKarte[], name: string, tag: string, planart = '', behandler = ''): PlanKarte[] {
  const n = name.trim().toLowerCase()
  return plaene.filter((p) => {
    if (p.status === 'verworfen') return false
    if (tag && tagVon(p.geaendert) !== tag) return false
    if (planart && p.kuerzel !== planart) return false
    if (behandler === '__ohne__' ? !!p.behandler : behandler && p.behandler !== behandler) return false
    if (!n) return true
    return `${p.patient} ${p.nummer} ${p.kuerzel}`.toLowerCase().includes(n)
  })
}

interface HkpKopf {
  id?: string
  status?: string
  erstellt?: string
  aktualisiert?: string
  patient?: { label?: string }
  summen?: { gesamt?: number }
  versorgungText?: string
  /** Lese-Link aus MAS: ohne ihn öffnet der Planer über den Tunnel (kein Praxis-Schlüssel) den HKP nicht */
  link?: { t?: string; c?: string }
  dateien?: { id?: string; art?: string }[]
}

/** Kennung der Befund-Datei eines HKP aus dem MAS-Register, sonst '' */
export const befundDateiVon = (h: Pick<HkpKopf, 'dateien'>) =>
  (Array.isArray(h.dateien) ? h.dateien : []).find((d) => d?.art === 'befund' && DATEI_ID.test(String(d.id ?? '')))?.id ?? ''

const TOKEN = /^[A-Za-z0-9._-]{1,80}$/

function hkpOeffnen(id: string, link: HkpKopf['link']): string {
  const q = new URLSearchParams({ hkp: id })
  if (link?.t && TOKEN.test(link.t)) {
    q.set('t', link.t)
    if (link.c && TOKEN.test(link.c)) q.set('c', link.c)
  }
  return q.toString()
}

/** MAS-Register → Kacheln. Verworfene Entwürfe bleiben aussen vor. */
export function hkpKarten(liste: HkpKopf[]): PlanKarte[] {
  const karten: PlanKarte[] = []
  for (const h of liste) {
    const id = String(h.id ?? '').trim()
    if (!id || h.status === 'verworfen') continue
    const karte = kartePrüfen({
      modul: 'hkp',
      kuerzel: 'HKP',
      art: 'Kasse',
      nummer: id,
      patient: h.patient?.label || h.versorgungText || 'HKP',
      betrag: Number(h.summen?.gesamt) || 0,
      status: h.status || 'wartet_auf_freigabe',
      geaendert: h.aktualisiert || h.erstellt || new Date(0).toISOString(),
      oeffnen: hkpOeffnen(id, h.link),
      befund: befundDateiVon(h),
    })
    if (karte) karten.push(karte)
  }
  return karten
}

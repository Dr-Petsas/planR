/**
 * Öffentliche Probe: abgelegte Pläne sammeln.
 * Aus dem Praxisstempel werden Name, Telefon, E-Mail und Anschrift des Zahnarztes gelesen.
 * Der Versichertenblock (Name, Geburtsdatum, Kasse, Versichertennummer) bleibt außen vor.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface ZahnarztKontakt {
  name: string
  praxis: string
  telefon: string
  email: string
  anschrift: string
}

export interface ProbeStand {
  planart: string
  planer: string
  regler: { privatStufe: number; titel: string; gozFaktor: number }
  vorher: { gesamt?: number; honorar?: number; material?: number }
  nachher: { gesamt?: number; eigenanteil?: number; festzuschuss?: number; honorar?: number; material?: number }
  /** Gespeicherter Plan, dessen Summe „Nachher“ ist. Ohne Eintrag gilt der einzige Plan dieser Art. */
  nummer?: string
}

/** Begleitstufen der Implantologie, gleiche Reihenfolge wie im Planer. */
const IMPL_STUFE = ['keine', 'Modelle/Planung', '+ Nachsorge', '+ Mikroskop', '+ Laser']

export const MODUL_FUER_PLANART: Record<string, string> = {
  'privat-impl': 'privat-impl',
  'privat-ze': 'privat-kv',
  hkp: 'hkp',
}

/** Kopf des gespeicherten Plans, soweit die Importansicht ihn für „Nachher“ braucht. */
export interface PlanSumme {
  modul: string
  nummer: string
  betrag: number
  stufe?: number
  gozFaktor?: number
}

export interface ProbeKarte {
  id: string
  zeit: string
  dateiname: string
  art: string
  bytes: number
  kontakt: ZahnarztKontakt
  gemeldet: boolean
  stand?: ProbeStand
  /** Praxis, in deren PlanR der Plan als Import liegt. Ohne Eintrag ist es ein offener Probe-Upload. */
  mandant?: string
  /** E-Mail des Kontos, das den Plan abgelegt oder übernommen hat */
  login?: string
}

/** Offene Probe-Uploads lassen sich so lange einem neuen Zugang zuordnen. */
export const ZUORDNEN_STUNDEN = 24

const LEER: ZahnarztKontakt = { name: '', praxis: '', telefon: '', email: '', anschrift: '' }
const PATIENT = ['versicherte', 'versichertennummer', 'versicherten-nr', 'versicherten nr', 'geburtsdatum', 'krankenkasse', 'kostentraeger', 'kostenträger']
const ARTEN = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'])

/** Einziges Konto für den Betreiber-Eingang. Praxis-Konten bleiben draußen. */
export const BETREIBER = 'superuser@pickadoc.de'

export function darfEingangSehen(email: string, _role = ''): boolean {
  return email.trim().toLowerCase() === BETREIBER
}

/** Prüfsumme `scrypt:<salt>:<hash>`, beide hex. Das Passwort selbst steht nirgends. */
export function passwortPasst(passwort: string, gespeichert: string): boolean {
  const teile = gespeichert.split(':')
  if (teile.length !== 3 || teile[0] !== 'scrypt') return false
  let salt: Buffer, soll: Buffer
  try {
    salt = Buffer.from(teile[1], 'hex')
    soll = Buffer.from(teile[2], 'hex')
  } catch {
    return false
  }
  if (!salt.length || !soll.length) return false
  const ist = scryptSync(passwort, salt, soll.length)
  return ist.length === soll.length && timingSafeEqual(ist, soll)
}

function zeilenVon(text: string) {
  return text.split('\n').map((z) => z.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function klein(s: string) {
  return s.toLowerCase()
}

function patientAb(zeilen: string[]) {
  const i = zeilen.findIndex((z) => PATIENT.some((m) => klein(z).includes(m)))
  return i < 0 ? zeilen.length : i
}

function emailIn(zeile: string) {
  for (const teil of zeile.split(' ')) {
    const wort = teil.replace(/[<>(),;]+/g, '')
    const bei = wort.indexOf('@')
    if (bei > 0 && wort.slice(bei + 1).includes('.')) return wort.slice(0, 80)
  }
  return ''
}

function telefonIn(zeile: string) {
  const n = klein(zeile)
  const marken = ['telefon', 'tel.', 'tel:', 'tel ', 'mobil', 'phone']
  let bei = n.startsWith('tel') ? 3 : -1
  for (const m of marken) {
    const i = n.indexOf(m)
    if (i >= 0 && (bei < 0 || i < bei)) bei = i + m.length
  }
  if (bei < 0) return ''
  let aus = ''
  let ziffern = 0
  for (const c of zeile.slice(bei)) {
    if (c >= '0' && c <= '9') { aus += c; ziffern++ }
    else if ((c === ' ' || c === '+' || c === '(' || c === ')' || c === '/' || c === '-') && aus) aus += c
    else if (ziffern >= 6) break
    else if (aus) break
  }
  return ziffern >= 6 ? aus.trim().slice(0, 40) : ''
}

function hatPlz(zeile: string) {
  let lauf = 0
  for (let i = 0; i <= zeile.length; i++) {
    const c = zeile[i] ?? ' '
    if (c >= '0' && c <= '9') lauf++
    else {
      if (lauf === 5) return true
      lauf = 0
    }
  }
  return false
}

function anschriftZeile(zeile: string) {
  const n = klein(zeile)
  if (n.length > 80) return false
  return hatPlz(zeile) || n.includes('str.') || n.includes('straße') || n.includes('strasse')
}

function etikett(zeile: string) {
  const n = klein(zeile).replace(/[.:]/g, '').trim()
  return n === 'zahnarzt' || n === 'zahnärztin' || n === 'vertragszahnarzt' || n === 'praxis' || n === 'telefon' || n === 'tel'
}

function nameZeile(zeile: string) {
  if (etikett(zeile) || zeile.length > 80) return false
  const n = klein(zeile)
  return n.includes('dr.') || n.includes('dr ') || n.startsWith('dr') || n.includes('zahnärztin') || n.includes('zahnarzt')
}

function praxisZeile(zeile: string) {
  if (etikett(zeile) || zeile.length > 80) return false
  const n = klein(zeile)
  return n.includes('praxis') || n.includes('mvz') || n.includes('zahnärzte') || n.includes('zahnaerzte')
}

function fuellen(ziel: ZahnarztKontakt, zeilen: string[]) {
  for (const z of zeilen) {
    if (!ziel.email) ziel.email = emailIn(z)
    if (!ziel.telefon) ziel.telefon = telefonIn(z)
    if (!ziel.name && nameZeile(z)) ziel.name = z.slice(0, 80)
    if (!ziel.praxis && praxisZeile(z)) ziel.praxis = z.slice(0, 80)
  }
  const anschrift = zeilen.filter(anschriftZeile).slice(0, 2)
  if (!ziel.anschrift && anschrift.length) ziel.anschrift = anschrift.join(', ').slice(0, 160)
  if (!ziel.name && ziel.praxis && nameZeile(ziel.praxis)) ziel.name = ziel.praxis
}

/** Praxisstempel vor dem Versichertenblock. Ein Stempel unter dem Plan zählt nur, wenn die Zeile selbst die Praxis nennt. */
export function kontaktAusText(text: string): ZahnarztKontakt {
  const zeilen = zeilenVon(text).slice(0, 400)
  const schnitt = patientAb(zeilen)
  const kopf = zeilen.slice(0, schnitt)
  const kontakt: ZahnarztKontakt = { ...LEER }
  fuellen(kontakt, kopf)
  const fuss = zeilen.slice(schnitt).filter((z) => {
    const n = klein(z)
    return (n.includes('zahnarzt') || n.includes('praxis') || n.includes('mvz')) && !n.includes('versichert')
  })
  fuellen(kontakt, fuss)
  return kontakt
}

export function artErlaubt(art: string) {
  return ARTEN.has(art.split(';')[0].trim().toLowerCase())
}

export function dateinameSicher(name: string) {
  const basis = name.replace(/\\/g, '/').split('/').pop() ?? ''
  const sauber = [...basis].filter((c) => c >= ' ' && c !== '"' && c !== '<' && c !== '>' && c !== '|' && c !== '?' && c !== '*').join('').trim()
  return (sauber || 'plan').slice(0, 80)
}

const indexPfad = (wurzel: string) => `${wurzel}/probe-eingang/index.json`
const dateiPfad = (wurzel: string, id: string) => `${wurzel}/probe-eingang/dateien/${id}`

let kette: Promise<unknown> = Promise.resolve()
function exklusiv<T>(fn: () => Promise<T>): Promise<T> {
  const lauf = kette.then(fn, fn)
  kette = lauf.then(() => undefined, () => undefined)
  return lauf
}

async function indexLesen(wurzel: string): Promise<ProbeKarte[]> {
  try {
    const roh = JSON.parse(await readFile(indexPfad(wurzel), 'utf8')) as unknown
    if (!Array.isArray(roh)) return []
    return roh.filter((e) => e && typeof e.id === 'string') as ProbeKarte[]
  } catch {
    return []
  }
}

async function indexSchreiben(wurzel: string, liste: ProbeKarte[]) {
  const datei = indexPfad(wurzel)
  await mkdir(dirname(datei), { recursive: true })
  const tmp = `${datei}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(liste), 'utf8')
  await rename(tmp, datei)
}

export function neueId() {
  return randomBytes(8).toString('hex')
}

export function idGueltig(id: string) {
  return id.length === 16 && [...id].every((c) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))
}

export async function eingangAnlegen(wurzel: string, datei: { name: string; art: string; bytes: Buffer; text?: string }): Promise<ProbeKarte> {
  const id = neueId()
  const karte: ProbeKarte = {
    id,
    zeit: new Date().toISOString(),
    dateiname: dateinameSicher(datei.name),
    art: datei.art.split(';')[0].trim().toLowerCase(),
    bytes: datei.bytes.length,
    kontakt: datei.text ? kontaktAusText(datei.text) : { ...LEER },
    gemeldet: false,
  }
  await mkdir(dirname(dateiPfad(wurzel, id)), { recursive: true })
  await writeFile(dateiPfad(wurzel, id), datei.bytes)
  await exklusiv(async () => {
    const liste = await indexLesen(wurzel)
    liste.push(karte)
    await indexSchreiben(wurzel, liste)
  })
  return karte
}

function zahl(x: unknown): number | undefined {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return undefined
  return Math.round(n * 100) / 100
}

/** Nur die Felder, die der Betreiber neben dem Upload sieht. Alles andere fällt weg. */
export function standPruefen(roh: unknown): ProbeStand | null {
  if (!roh || typeof roh !== 'object') return null
  const o = roh as Record<string, unknown>
  const planart = String(o.planart ?? '')
  if (planart !== 'hkp' && planart !== 'privat-ze' && planart !== 'privat-impl') return null
  const regler = (o.regler && typeof o.regler === 'object' ? o.regler : {}) as Record<string, unknown>
  const vorher = (o.vorher && typeof o.vorher === 'object' ? o.vorher : {}) as Record<string, unknown>
  const nachher = (o.nachher && typeof o.nachher === 'object' ? o.nachher : {}) as Record<string, unknown>
  const stufe = Math.min(5, Math.max(0, zahl(regler.privatStufe) ?? 0))
  const aus: ProbeStand = {
    planart,
    planer: String(o.planer ?? '').slice(0, 40),
    regler: { privatStufe: stufe, titel: String(regler.titel ?? '').slice(0, 40), gozFaktor: zahl(regler.gozFaktor) ?? 0 },
    vorher: { gesamt: zahl(vorher.gesamt), honorar: zahl(vorher.honorar), material: zahl(vorher.material) },
    nachher: {
      gesamt: zahl(nachher.gesamt), eigenanteil: zahl(nachher.eigenanteil), festzuschuss: zahl(nachher.festzuschuss),
      honorar: zahl(nachher.honorar), material: zahl(nachher.material),
    },
  }
  const nummer = String(o.nummer ?? '')
  if (nummer && nummer.length <= 40 && [...nummer].every((c) => (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '-')) aus.nummer = nummer
  return aus
}

/**
 * „Nachher“ ist der gespeicherte Plan, nicht der Stand vom ersten Öffnen.
 * Ein geänderter Gesamtbetrag wirft die alte Aufteilung weg. Passt er noch, bleiben Honorar und Material.
 */
export function standNachziehen(stand: ProbeStand | null | undefined, plaene: PlanSumme[]): ProbeStand | null {
  if (!stand) return null
  const modul = MODUL_FUER_PLANART[stand.planart]
  if (!modul) return stand
  const gleiche = plaene.filter((p) => p.modul === modul && Number.isFinite(p.betrag))
  const plan = stand.nummer ? gleiche.find((p) => p.nummer === stand.nummer) ?? null : gleiche.length === 1 ? gleiche[0] : null
  if (!plan) return stand
  const betrag = Math.round(plan.betrag * 100) / 100
  const regler = { ...stand.regler }
  if (typeof plan.stufe === 'number' && plan.stufe >= 0 && plan.stufe <= 5) {
    regler.privatStufe = plan.stufe
    if (stand.planart === 'privat-impl' && IMPL_STUFE[plan.stufe]) regler.titel = IMPL_STUFE[plan.stufe]
  }
  if (typeof plan.gozFaktor === 'number' && plan.gozFaktor >= 0 && plan.gozFaktor <= 10) regler.gozFaktor = Math.round(plan.gozFaktor * 100) / 100
  if (stand.planart === 'hkp') {
    return stand.nachher.eigenanteil === betrag ? { ...stand, regler } : { ...stand, regler, nachher: { ...stand.nachher, eigenanteil: betrag } }
  }
  if (stand.nachher.gesamt === betrag) return { ...stand, regler, nummer: stand.nummer || plan.nummer }
  return { ...stand, nummer: plan.nummer, regler, nachher: { gesamt: betrag, eigenanteil: betrag, festzuschuss: 0 } }
}

export async function eingangStand(wurzel: string, id: string, stand: ProbeStand): Promise<ProbeKarte | null> {
  if (!idGueltig(id)) return null
  return exklusiv(async () => {
    const liste = await indexLesen(wurzel)
    const karte = liste.find((e) => e.id === id)
    if (!karte) return null
    karte.stand = stand
    await indexSchreiben(wurzel, liste)
    return karte
  })
}

export async function eingangText(wurzel: string, id: string, text: string): Promise<ProbeKarte | null> {
  if (!idGueltig(id)) return null
  return exklusiv(async () => {
    const liste = await indexLesen(wurzel)
    const karte = liste.find((e) => e.id === id)
    if (!karte) return null
    karte.kontakt = kontaktAusText(text)
    await indexSchreiben(wurzel, liste)
    return karte
  })
}

/** Die Karte, wenn für sie noch keine Hinweis-Mail raus ist. Der zweite Aufruf bleibt still. */
export async function eingangEinmalMelden(wurzel: string, id: string): Promise<ProbeKarte | null> {
  if (!idGueltig(id)) return null
  return exklusiv(async () => {
    const liste = await indexLesen(wurzel)
    const karte = liste.find((e) => e.id === id)
    if (!karte || karte.gemeldet) return null
    karte.gemeldet = true
    await indexSchreiben(wurzel, liste)
    return karte
  })
}

/**
 * Uploads einer Praxis zuordnen. Nur Karten ohne Praxis, höchstens einen Tag alt:
 * Wer eine fremde Kennung rät, bekommt damit keinen alten Plan.
 */
export async function eingangZuordnen(wurzel: string, ids: string[], mandant: string, login: string, jetzt = Date.now(), ohneFrist = false): Promise<number> {
  const gesucht = new Set(ids.filter(idGueltig).slice(0, 30))
  if (!gesucht.size || !mandant) return 0
  return exklusiv(async () => {
    const liste = await indexLesen(wurzel)
    let n = 0
    for (const karte of liste) {
      if (!gesucht.has(karte.id) || karte.mandant) continue
      const alter = jetzt - new Date(karte.zeit).getTime()
      // Über den Link des Betreibers (Fall) gilt die Frist nicht: Der Link selbst ist der Nachweis.
      if (!ohneFrist && !(alter >= 0 && alter <= ZUORDNEN_STUNDEN * 3_600_000)) continue
      karte.mandant = mandant
      karte.login = login
      n++
    }
    if (n) await indexSchreiben(wurzel, liste)
    return n
  })
}

/** Importe einer Praxis, neueste zuerst */
export async function eingangFuerMandant(wurzel: string, mandant: string): Promise<ProbeKarte[]> {
  if (!mandant) return []
  return (await eingangListe(wurzel)).filter((k) => k.mandant === mandant)
}

/** Uploads samt Datei entfernen (Konto in PlanR gelöscht). Liefert die Zahl der entfernten Karten. */
export async function eingangEntfernen(wurzel: string, passt: (k: ProbeKarte) => boolean): Promise<number> {
  return exklusiv(async () => {
    const liste = await indexLesen(wurzel)
    const weg = liste.filter(passt)
    if (!weg.length) return 0
    await indexSchreiben(wurzel, liste.filter((k) => !weg.includes(k)))
    await Promise.all(weg.map((k) => rm(dateiPfad(wurzel, k.id), { force: true }).catch(() => undefined)))
    return weg.length
  })
}

export async function eingangListe(wurzel: string): Promise<ProbeKarte[]> {
  const liste = await indexLesen(wurzel)
  return liste.sort((a, b) => (a.zeit < b.zeit ? 1 : -1))
}

/** Was der Betreiber sieht. Ob schon eine Hinweis-Mail raus ist, bleibt intern. */
export function eingangSichtbar(karte: ProbeKarte) {
  const k = karte.kontakt ?? LEER
  return {
    id: karte.id,
    zeit: karte.zeit,
    dateiname: karte.dateiname,
    art: karte.art,
    kontakt: {
      name: k.name ?? '',
      praxis: k.praxis ?? '',
      telefon: k.telefon ?? '',
      email: k.email ?? '',
      anschrift: k.anschrift ?? '',
    },
    stand: karte.stand ?? null,
    login: karte.login ?? '',
  }
}

/** Zugang aus der Probe: Vor- und Nachname und Praxisname aus dem Stempel, sonst aus der Adresse. */
export function zugangNamen(kontakt: Partial<ZahnarztKontakt>, email: string): { titel: string; vorname: string; nachname: string; praxis: string } {
  const woerter = String(kontakt.name ?? '').split(' ').map((w) => w.trim()).filter(Boolean)
  const titelTeile: string[] = []
  while (woerter.length > 1 && woerter[0].endsWith('.')) titelTeile.push(woerter.shift()!)
  const nachname = woerter.pop() ?? ''
  const lokal = email.split('@')[0] ?? ''
  return {
    titel: titelTeile.join(' ').slice(0, 40),
    vorname: (woerter.join(' ') || 'Praxis').slice(0, 80),
    nachname: (nachname || lokal || 'Probe').slice(0, 80),
    praxis: (String(kontakt.praxis ?? '').trim() || String(kontakt.name ?? '').trim() || `Praxis ${lokal}`).slice(0, 160),
  }
}

const UMLAUT: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', à: 'a', á: 'a', â: 'a', è: 'e', é: 'e', ê: 'e', ì: 'i', í: 'i', î: 'i', ò: 'o', ó: 'o', ô: 'o', ù: 'u', ú: 'u', û: 'u', ñ: 'n',
}

/** Demo-Login eines Probe-Interessenten: Nachname kleingeschrieben, z. B. pantas@pickadoc.de. */
export function probeEmail(name: string): string {
  const nachname = zugangNamen({ name, praxis: '', telefon: '', email: '', anschrift: '' }, 'praxis@pickadoc.de').nachname
  const stamm = [...nachname.toLowerCase()].map((c) => UMLAUT[c] ?? c).join('').replace(/[^a-z]/g, '')
  return `${stamm || 'praxis'}@pickadoc.de`
}

/** Zufälliges Passwort für den Zugang aus der Probe: 12 Zeichen, ohne verwechselbare Zeichen. */
/** Im Probe-Zugang gesperrt, bis das Abo abgeschlossen ist: Einrichtung, Zuordnung, KI-Training, Patientensuche. */
export function probeGesperrt(methode: string, url: string): boolean {
  const schreibt = methode !== 'GET' && methode !== 'HEAD'
  return url === '/api/bridge-paket' || url === '/api/bridge-setup' || url.startsWith('/api/pvs/')
    || (schreibt && (url === '/api/bridge-schluessel' || url === '/api/goz-zuordnung' || url === '/api/fallkatalog' || url === '/api/praxiskatalog'))
}

export function neuesPasswort(): string {
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let aus = ''
  for (const b of randomBytes(12)) aus += zeichen[b % zeichen.length]
  return aus
}

/**
 * Ein Fall: die Uploads einer Praxis unter einem Link. Wer den Link hat, sieht die Dateien und das Ergebnis im Planer.
 * Der Betreiber legt den Link an und gibt ihn dem Zahnarzt. Das gelesene Ergebnis liegt dabei,
 * damit der Zahnarzt dasselbe sieht wie der Betreiber und nichts neu gelesen werden muss.
 */
export interface ProbeFall {
  token: string
  ids: string[]
  name: string
  zeit: string
  /** Gelesene Pläne (Teile des Falls) als JSON-Text, so wie die Probe-Seite sie zeigt */
  teile?: string
}

export const FALL_TAGE = 60
export const FALL_TEILE_MAX = 600_000
const fallPfad = (wurzel: string) => `${wurzel}/probe-eingang/faelle.json`

export function tokenGueltig(token: string) {
  return token.length === 32 && [...token].every((c) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))
}

async function faelleLesen(wurzel: string): Promise<ProbeFall[]> {
  try {
    const roh = JSON.parse(await readFile(fallPfad(wurzel), 'utf8')) as unknown
    return Array.isArray(roh) ? roh.filter((f) => f && typeof f.token === 'string' && Array.isArray(f.ids)) as ProbeFall[] : []
  } catch {
    return []
  }
}

async function faelleSchreiben(wurzel: string, liste: ProbeFall[]) {
  const datei = fallPfad(wurzel)
  await mkdir(dirname(datei), { recursive: true })
  const tmp = `${datei}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(liste), 'utf8')
  await rename(tmp, datei)
}

const fallFrisch = (f: ProbeFall, jetzt: number) => jetzt - new Date(f.zeit).getTime() <= FALL_TAGE * 86_400_000

/** Link für diese Uploads. Dieselben Uploads behalten ihren Link und ihr gelesenes Ergebnis; die Frist beginnt neu. */
export async function fallAnlegen(wurzel: string, ids: string[], name: string, jetzt = Date.now()): Promise<ProbeFall | null> {
  const vorhanden = new Set((await indexLesen(wurzel)).map((k) => k.id))
  const sauber = [...new Set(ids.filter((id) => idGueltig(id) && vorhanden.has(id)))].sort().slice(0, 30)
  if (!sauber.length) return null
  const schluessel = sauber.join(',')
  return exklusiv(async () => {
    const liste = (await faelleLesen(wurzel)).filter((f) => fallFrisch(f, jetzt))
    let fall = liste.find((f) => f.ids.join(',') === schluessel)
    if (fall) fall.zeit = new Date(jetzt).toISOString()
    else {
      fall = { token: randomBytes(16).toString('hex'), ids: sauber, name: name.slice(0, 120), zeit: new Date(jetzt).toISOString() }
      liste.push(fall)
    }
    await faelleSchreiben(wurzel, liste)
    return fall
  })
}

/** Fälle, die nur aus diesen Uploads bestehen: die Pläne einer Praxis, wie sie im Planer liegen. Neueste zuerst. */
export async function faelleAus(wurzel: string, ids: string[], jetzt = Date.now()): Promise<ProbeFall[]> {
  const eigene = new Set(ids)
  return (await faelleLesen(wurzel))
    .filter((f) => fallFrisch(f, jetzt) && f.ids.length > 0 && f.ids.every((id) => eigene.has(id)))
    .sort((a, b) => b.zeit.localeCompare(a.zeit))
}

export async function fallFinden(wurzel: string, token: string, jetzt = Date.now()): Promise<ProbeFall | null> {
  if (!tokenGueltig(token)) return null
  const fall = (await faelleLesen(wurzel)).find((f) => f.token === token)
  return fall && fallFrisch(fall, jetzt) ? fall : null
}

/** Gelesenes Ergebnis ablegen. nurLeer: nur, wenn noch keins da ist (erster Aufruf über den Link). */
export async function fallTeile(wurzel: string, token: string, teile: string, nurLeer: boolean): Promise<boolean> {
  if (!tokenGueltig(token) || teile.length > FALL_TEILE_MAX) return false
  return exklusiv(async () => {
    const liste = await faelleLesen(wurzel)
    const fall = liste.find((f) => f.token === token)
    if (!fall || (nurLeer && fall.teile)) return false
    fall.teile = teile
    await faelleSchreiben(wurzel, liste)
    return true
  })
}

export async function eingangDatei(wurzel: string, id: string): Promise<{ karte: ProbeKarte; bytes: Buffer } | null> {
  if (!idGueltig(id)) return null
  const karte = (await indexLesen(wurzel)).find((e) => e.id === id)
  if (!karte) return null
  try {
    return { karte, bytes: await readFile(dateiPfad(wurzel, id)) }
  } catch {
    return null
  }
}

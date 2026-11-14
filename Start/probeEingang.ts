/**
 * Öffentliche Probe: abgelegte Pläne sammeln.
 * Aus dem Praxisstempel werden Name, Telefon, E-Mail und Anschrift des Zahnarztes gelesen.
 * Der Versichertenblock (Name, Geburtsdatum, Kasse, Versichertennummer) bleibt außen vor.
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface ZahnarztKontakt {
  name: string
  praxis: string
  telefon: string
  email: string
  anschrift: string
}

export interface ProbeKarte {
  id: string
  zeit: string
  dateiname: string
  art: string
  bytes: number
  kontakt: ZahnarztKontakt
  gemeldet: boolean
}

const LEER: ZahnarztKontakt = { name: '', praxis: '', telefon: '', email: '', anschrift: '' }
const PATIENT = ['versicherte', 'versichertennummer', 'versicherten-nr', 'versicherten nr', 'geburtsdatum', 'krankenkasse', 'kostentraeger', 'kostenträger']
const ARTEN = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'])

export function darfEingangSehen(email: string, role = ''): boolean {
  const e = email.trim().toLowerCase()
  if (role.toLowerCase() === 'superuser') return true
  if (e === 'contact@maik-music.io') return true
  return e.endsWith('@pickadoc.de')
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
  }
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

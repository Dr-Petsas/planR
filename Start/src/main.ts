import './style.css'
import './thema'
import { ersetzbar, loeschbar, planDateiLesen, planFiltern, tagVon, type PlanDatei, type PlanKarte } from './plaene'
import { BEREICHE, adresse, planerZuModul } from './planer'
import { LEER, PVS_LISTE, pvsVon, type Einstellungen } from './einstellungen'
import { PVS_CONNECTOR, PVS_SUCHE } from './pvs'
import { patientensucheOeffnen, type PlanTreffer, type Stammdaten } from './patientensuche'
import { apiJson } from './api'
import { abmelden, anmeldeSeite, ausPickadoc, benutzerBlock, benutzerLaden, benutzerZuordnen, ichLaden, sitzungBewachen, sitzungHinweis, sitzungHinweisLoeschen, type BenutzerZeile, type Ich, type PraxisZeile } from './anmeldung'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const STATUS: Record<string, string> = {
  entwurf: 'Entwurf',
  freigegeben: 'freigegeben',
  wartet_auf_freigabe: 'wartet auf Freigabe',
  eingereicht: 'eingereicht',
  genehmigt: 'genehmigt',
  abgelehnt: 'abgelehnt',
  abgerechnet: 'abgerechnet',
}
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const WOCHEN = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

let plaene: PlanKarte[] = []
let name = ''
let tag = ''
let planart = ''
let behandler = ''
let auswahl = false
let einstellungAuf = false
let einstellungen: Einstellungen = LEER
/** Bearbeitungsstand im offenen Dialog */
let entwurf: Einstellungen = LEER
/** PlanR-Bridge auf dem Praxisserver (null = für diesen Mandanten keine eingerichtet) */
let agent: { verbunden: boolean; pvs?: string; version?: string } | null = null
interface KatalogInfo {
  pvs: string; stand: string; listeName: string; belListeName: string
  wahl: { liste: number; spalte: number; faktoren: boolean; belListe?: number; belSpalte?: number }
  listen: { nr: number; name: string; mitPreis: number[]; art?: 'BEL' | 'BEB' }[]
  vorschlag: { liste: number; spalte: number } | null
  vorschlagKasse: { liste: number; spalte: number } | null
  aenderungen: Record<string, { neu: number; geaendert: number; entfallen: number }> | null
  anzahl: { bel: number; eigenlabor: number; material: number; goz: number; kuerzel: number; faktoren: number; komplexe: number }
}
/** Aus dem PVS übernommene Preise & Positionen (null = noch nie abgeglichen) */
let katalog: KatalogInfo | null = null
let katalogLaeuft = false
let ich: Ich
let assistentin = 'Clara'
/** Benutzer und Praxen für den Praxis-Admin (null = nicht geladen / kein Admin) */
let benutzer: { praxen: PraxisZeile[]; benutzer: BenutzerZeile[] } | null = null
const heute = new Date()
let jahr = heute.getFullYear()
let monat = heute.getMonth()

function ausUrl() {
  const q = new URLSearchParams(location.search)
  name = q.get('name') || ''
  tag = q.get('tag') || ''
  planart = (q.get('plan') || '').slice(0, 8)
  behandler = (q.get('behandler') || '').slice(0, 80)
  auswahl = q.get('neu') === '1'
  const warAuf = einstellungAuf
  einstellungAuf = q.get('einstellungen') === '1' && !auswahl
  if (einstellungAuf && !warAuf) entwurf = einstellungen
  if (/^\d{4}-\d{2}-\d{2}$/.test(tag)) {
    jahr = Number(tag.slice(0, 4))
    monat = Number(tag.slice(5, 7)) - 1
  }
}

/** Filter ersetzen den aktuellen Eintrag. Die Planauswahl kommt als eigener Schritt dazu, damit Zurück sie schließt. */
function urlSetzen(art: 'push' | 'replace') {
  const u = new URL(location.href)
  if (name) u.searchParams.set('name', name)
  else u.searchParams.delete('name')
  if (tag) u.searchParams.set('tag', tag)
  else u.searchParams.delete('tag')
  if (planart) u.searchParams.set('plan', planart)
  else u.searchParams.delete('plan')
  if (behandler) u.searchParams.set('behandler', behandler)
  else u.searchParams.delete('behandler')
  if (auswahl) u.searchParams.set('neu', '1')
  else u.searchParams.delete('neu')
  if (einstellungAuf) u.searchParams.set('einstellungen', '1')
  else u.searchParams.delete('einstellungen')
  const next = u.pathname + u.search + u.hash
  if (next === location.pathname + location.search + location.hash) return
  const state = { planr: 1, neu: auswahl || einstellungAuf ? 1 : 0 }
  if (art === 'push') history.pushState(state, '', next)
  else history.replaceState(state, '', next)
}

function auswahlSchliessen() {
  if (history.state && (history.state as { neu?: number }).neu) history.back()
  else {
    auswahl = false
    einstellungAuf = false
    urlSetzen('replace')
    zeichnen()
  }
}

function planUrl(p: PlanKarte): string | null {
  const planer = planerZuModul(p.modul)
  if (!planer) return null
  const basis = adresse(planer, location)
  if (!basis) return null
  if (!p.oeffnen) return basis
  const url = new URL(basis)
  new URLSearchParams(p.oeffnen).forEach((v, k) => url.searchParams.set(k, v))
  return url.toString()
}

const TONNE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>'

const PFEIL = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`
const EXPORT = PFEIL('M12 4v11M7 10l5 5 5-5M5 20h14')
const IMPORT = PFEIL('M12 15V4M7 9l5-5 5 5M5 20h14')
const LUPE = PFEIL('M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20')
const MIKRO = PFEIL('M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3')
const DELFIN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M2 13.2C3.2 12.4 4 11.6 5 10.6 7.6 7.8 11.4 6.2 15 6.8L15.6 4.6 17.2 7.4C19.4 8.4 20.6 10.4 21 12.4L23 11.2 22 14.2 22.6 16.6 20.2 14.8C19.2 13.2 17.4 12 15 11.7 12 11.4 9 12.4 7 14.4L6 17 5.2 14.5C4 14.5 2.8 14.1 2 13.2Z"/><circle cx="6.4" cy="11.7" r=".65" fill="#fff"/></svg>'
const ZAHNRAD = PFEIL('M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z')

function zeile(p: PlanKarte, i: number): string {
  const url = planUrl(p)
  const name = esc(p.patient || 'Ohne Namen')
  const hkp = p.modul === 'hkp'
  const tonne = loeschbar(p)
    ? `<button type="button" class="aktion tonne" data-loeschen="${i}" title="${hkp ? 'HKP verwerfen' : 'Plan löschen'}" aria-label="${hkp ? 'HKP verwerfen' : 'Plan löschen'}: ${name}">${TONNE}</button>`
    : `<span class="aktion tonne aus" title="Liegt bei der Kasse – nur in PlanR änderbar">${TONNE}</span>`
  const ziel = hkp ? pvsZiel() : ''
  const dens = einstellungen.pvs === 'dens'
  const export_ = ziel
    ? `<button type="button" class="aktion pvs-knopf${p.imPvs ? ' im-pvs' : ''}" data-export="${i}" title="${esc(`In ${ziel} exportieren${p.imPvs ? ` · ${p.imPvs}` : ''}`)}" aria-label="In ${esc(ziel)} exportieren: ${name}">${dens ? DELFIN : EXPORT}<span>${dens ? 'DENS' : esc(ziel)}</span></button>`
    : hkp
      ? `<span class="aktion aus" title="Kein Praxisprogramm mit Bridge eingestellt (Einstellungen)">${EXPORT}</span>`
      : `<button type="button" class="aktion" data-export="${i}" title="Als JSON exportieren" aria-label="Exportieren: ${name}">${EXPORT}</button>`
  const import_ = ersetzbar(p)
    ? `<button type="button" class="aktion" data-import="${i}" title="Plan aus JSON-Datei ersetzen" aria-label="Importieren: ${name}">${IMPORT}</button>`
    : `<span class="aktion aus" title="Wartet nicht mehr auf Freigabe – nur in PlanR änderbar">${IMPORT}</span>`
  return `<div class="zeile${url ? ' mit-link' : ''}" role="row">
    <span class="sp-art"><span class="kuerzel">${esc(p.kuerzel)}</span></span>
    ${url ? `<a class="sp-patient" href="${esc(url)}">${name}</a>` : `<span class="sp-patient">${name}</span>`}
    <span class="sp-nr">${esc(p.nummer)}</span>
    <span class="sp-status">${esc(STATUS[p.status] || p.status)}</span>
    <span class="sp-betrag">${p.betrag ? esc(euro(p.betrag)) : ''}</span>
    <span class="sp-zeit">${esc(zeit(p.geaendert))}</span>
    <span class="sp-aktionen">${export_}${import_}${tonne}</span>
  </div>`
}

let meldung: { text: string; zurueck?: PlanKarte } | null = null
let meldungTimer = 0

function melden(text: string, zurueck?: PlanKarte) {
  meldung = { text, zurueck }
  clearTimeout(meldungTimer)
  meldungTimer = window.setTimeout(() => { meldung = null; zeichnen() }, zurueck ? 10000 : 6000)
  zeichnen()
}

interface Antwort { ok: boolean; meldung?: string; datei?: PlanDatei; nummer?: string }

async function senden(pfad: 'loeschen' | 'zurueck' | 'export' | 'import', daten: unknown): Promise<Antwort> {
  try {
    const r = await fetch(`/api/plaene/${pfad}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten),
    })
    return await r.json()
  } catch {
    return { ok: false, meldung: 'Keine Verbindung.' }
  }
}

const kennung = (p: PlanKarte) => ({ modul: p.modul, nummer: p.nummer })

/** Name des PVS, in das HKPs direkt gehen – nur mit aktiver Bridge und fertigem Connector */
function pvsZiel(): string {
  const p = pvsVon(einstellungen.pvs)
  return p && einstellungen.bridge && PVS_CONNECTOR[p.id] ? p.name : ''
}

/** Name des PVS, in dem die Patientensuche sucht */
function pvsQuelle(): string {
  const p = pvsVon(einstellungen.pvs)
  return p && einstellungen.bridge && PVS_SUCHE[p.id] ? p.name : ''
}

let pvsLaeuft = false

async function insPvs(p: PlanKarte, ziel: string) {
  if (pvsLaeuft) return
  const wer = p.patient || p.nummer
  const frage = p.imPvs
    ? `${p.imPvs}.\n\nTrotzdem noch einmal als neuen Plan in ${ziel} anlegen?`
    : `HKP von ${wer} in ${ziel} beim gleichnamigen Patienten anlegen?`
  if (!confirm(frage)) return
  pvsLaeuft = true
  melden(`HKP von ${wer} geht an ${ziel} …`)
  try {
    const r = await apiJson<Antwort>('/api/plaene/pvs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kennung(p)),
    })
    if (r.ok) await laden()
    melden(r.meldung || (r.ok ? `HKP in ${ziel} angelegt.` : `Export nach ${ziel} hat nicht geklappt.`))
  } finally {
    pvsLaeuft = false
  }
}

const klein = (s: string) => s.toLocaleLowerCase('de').normalize('NFC')

/** PlanR-Pläne eines Patienten (Nachname und – falls bekannt – Vorname im Namen des Plans) */
function planrPlaene(vorname: string, nachname: string): PlanTreffer[] {
  const n = klein(nachname.trim())
  const v = klein(vorname.trim().split(' ')[0] ?? '')
  if (!n) return []
  return plaene
    .filter((p) => p.status !== 'verworfen')
    .filter((p) => { const t = klein(p.patient); return t.includes(n) && (!v || t.includes(v)) })
    .slice(0, 8)
    .map((p) => ({
      titel: `${p.kuerzel} ${p.art}`,
      unter: [STATUS[p.status] ?? p.status, p.betrag ? euro(p.betrag) : '', p.geaendert ? zeit(p.geaendert) : ''].filter(Boolean).join(' · '),
      url: planUrl(p),
    }))
}

/** Neuer HKP auf einen Patienten: Anmeldedaten im Fragment (geht nie an einen Server), der Planer liest und löscht es. */
function hkpNeuOeffnen(p: Stammdaten) {
  const planer = BEREICHE.flatMap((b) => b.planer).find((x) => x.host === 'hkp')
  const basis = planer && adresse(planer, location)
  if (!basis) return melden('Der HKP-Planer ist hier nicht erreichbar.')
  const url = new URL(basis, location.href)
  url.searchParams.set('neu', '1')
  const json = new TextEncoder().encode(JSON.stringify(p))
  url.hash = `patient=${btoa(String.fromCharCode(...json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  location.href = url.toString()
}

/** Aus dem PVS übernommener HKP: Liste neu laden, dann den Planer mit dem Plan öffnen */
async function ausPvsOeffnen(nummer: string, hinweise: string[]) {
  await laden()
  const k = plaene.find((p) => p.modul === 'hkp' && p.nummer === nummer)
  const url = k && planUrl(k)
  if (hinweise.length) alert(`Übernommen mit Hinweisen:\n\n${hinweise.join('\n')}`)
  if (url) location.href = url
  else melden('HKP übernommen – er steht jetzt in der Liste.')
}

async function exportieren(p: PlanKarte) {
  if (p.modul === 'hkp') {
    const ziel = pvsZiel()
    return ziel ? insPvs(p, ziel) : undefined
  }
  const r = await senden('export', kennung(p))
  if (!r.ok || !r.datei) return melden(r.meldung || 'Export hat nicht geklappt.')
  const teil = (s: string) => s.trim().replace(/[^\p{L}\p{N}-]+/gu, '_').replace(/^_+|_+$/g, '')
  const name = [p.kuerzel, p.art, p.nummer.slice(0, 12), p.patient].map(teil).filter(Boolean).join('-')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(r.datei, null, 1)], { type: 'application/json' }))
  a.download = `${name || 'plan'}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  melden(`Plan von ${p.patient || p.nummer} exportiert.`)
}

/** Ziel des laufenden Imports: eine Zeile (ersetzen) oder null (neuer Plan) */
let importZiel: PlanKarte | null = null
const dateiFeld = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true })
document.body.append(dateiFeld)

function importWaehlen(ziel: PlanKarte | null) {
  importZiel = ziel
  dateiFeld.value = ''
  dateiFeld.click()
}

dateiFeld.addEventListener('change', async () => {
  const f = dateiFeld.files?.[0]
  if (!f) return
  const ziel = importZiel
  let roh: unknown
  try {
    roh = JSON.parse(await f.text())
  } catch {
    return melden('Die Datei ist kein gültiges JSON.')
  }
  const { datei, fehler } = planDateiLesen(roh)
  if (!datei) return melden(fehler || 'Die Datei ist kein PlanR-Plan.')
  const aus = `${datei.kuerzel} ${datei.art}${datei.patient ? `, ${datei.patient}` : ''}`
  if (ziel) {
    if (ziel.modul !== datei.modul) return melden(`Die Datei (${aus}) passt nicht zu dieser Zeile (${ziel.kuerzel} ${ziel.art}).`)
    if (!confirm(`Plan von ${ziel.patient || 'Ohne Namen'} (${ziel.kuerzel} ${ziel.nummer}) durch die Datei ersetzen?\n\nDatei: ${aus}`)) return
  } else if (datei.nummer && plaene.some((p) => p.modul === datei.modul && p.nummer === datei.nummer)) {
    if (!confirm(`Den Plan ${datei.kuerzel} ${datei.nummer} gibt es schon. Mit der Datei überschreiben?\n\nDatei: ${aus}`)) return
  }
  const r = await senden('import', { datei: roh, ziel: ziel ? kennung(ziel) : undefined })
  if (!r.ok) return melden(r.meldung || 'Import hat nicht geklappt.')
  await laden()
  melden(datei.modul === 'hkp'
    ? (ziel ? 'HKP ersetzt.' : 'HKP im Register angelegt – er wartet auf Freigabe.')
    : `Plan ${datei.kuerzel} ${r.nummer ?? ''} importiert – der Planer übernimmt ihn beim nächsten Öffnen.`)
})

async function loeschenFragen(p: PlanKarte) {
  const wer = `${p.patient || 'Ohne Namen'} (${p.kuerzel} ${p.nummer})`
  const frage = p.modul === 'hkp'
    ? `HKP von ${wer} verwerfen?\n\nEr bleibt im Register als „verworfen“ erhalten.`
    : `Plan von ${wer} löschen?\n\nDer Planer entfernt ihn beim nächsten Öffnen auch aus seiner Ablage.`
  if (!confirm(frage)) return
  const r = await senden('loeschen', kennung(p))
  if (!r.ok) return melden(r.meldung || 'Löschen hat nicht geklappt.')
  plaene = plaene.filter((x) => x !== p)
  melden(p.modul === 'hkp' ? `HKP von ${p.patient || p.nummer} verworfen.` : `Plan von ${p.patient || p.nummer} gelöscht.`, p)
}

async function zurueckholen(p: PlanKarte) {
  const r = await senden('zurueck', kennung(p))
  if (!r.ok) return melden(r.meldung || 'Zurückholen hat nicht geklappt.')
  plaene = [p, ...plaene].sort((a, b) => b.geaendert.localeCompare(a.geaendert))
  melden(`${p.patient || p.nummer} ist wieder da.`)
}

function kalender(): string {
  const erster = new Date(jahr, monat, 1)
  const versatz = (erster.getDay() + 6) % 7
  const anzahl = new Date(jahr, monat + 1, 0).getDate()
  const namen = planFiltern(plaene, name, '', planart, behandler)
  const tage = new Set(namen.map((p) => tagVon(p.geaendert)))
  const zellen: string[] = WOCHEN.map((w) => `<span class="wt">${w}</span>`)
  for (let i = 0; i < versatz; i++) zellen.push('<span></span>')
  for (let t = 1; t <= anzahl; t++) {
    const iso = `${jahr}-${String(monat + 1).padStart(2, '0')}-${String(t).padStart(2, '0')}`
    const klassen = ['tag']
    if (tage.has(iso)) klassen.push('hat')
    if (iso === tag) klassen.push('gewahlt')
    if (iso === tagVon(heute.toISOString())) klassen.push('heute')
    zellen.push(`<button type="button" class="${klassen.join(' ')}" data-tag="${iso}">${t}</button>`)
  }
  return zellen.join('')
}

function planarten(): string[] {
  const da = new Set(plaene.filter((p) => p.status !== 'verworfen').map((p) => p.kuerzel))
  const reihe: string[] = []
  const gesehen = new Set<string>()
  for (const b of BEREICHE) for (const p of b.planer) {
    if (da.has(p.kuerzel) && !gesehen.has(p.kuerzel)) { gesehen.add(p.kuerzel); reihe.push(p.kuerzel) }
  }
  for (const k of da) if (!gesehen.has(k)) reihe.push(k)
  return reihe
}

function behandlerNamen(): { id: string; text: string }[] {
  const basis = plaene.filter((p) => p.status !== 'verworfen' && (!planart || p.kuerzel === planart))
  const namen = [...new Set(basis.map((p) => p.behandler || ''))]
  const aus = namen.filter(Boolean).sort((a, b) => a.localeCompare(b, 'de')).map((n) => ({ id: n, text: n }))
  if (namen.includes('')) aus.push({ id: '__ohne__', text: 'ohne Angabe' })
  return aus
}

function chips(gruppe: string, gewaehlt: string, eintraege: { id: string; text: string }[]): string {
  const knopf = (id: string, text: string) =>
    `<button type="button" class="chip${gewaehlt === id ? ' an' : ''}" data-${gruppe}="${esc(id)}">${esc(text)}</button>`
  return `<div class="chips" role="group">${knopf('', 'Alle')}${eintraege.map((e) => knopf(e.id, e.text)).join('')}</div>`
}

function auswahlKarte(): string {
  const eintrag = (p: (typeof BEREICHE)[number]['planer'][number] | undefined) => {
    if (!p) return '<span class="wahl-leer"></span>'
      const basis = adresse(p, location)
      // Der HKP-Planer öffnet sonst den zuletzt bearbeiteten Plan
      const url = basis && p.host === 'hkp' ? `${basis}${basis.includes('?') ? '&' : '?'}neu=1` : basis
      const inhalt = `<span class="kuerzel">${esc(p.kuerzel)}</span><span><b>${esc(p.titel)}</b><small>${esc(p.zweck)}</small></span>`
    return url ? `<a href="${esc(url)}">${inhalt}</a>` : `<div>${inhalt}</div>`
  }
  const bloecke = `
    <div class="wahl-spalten"><span>Kasse</span><span>Privat</span></div>
    ${BEREICHE.map((b) => `
      <p class="bereich-name">${esc(b.name)}</p>
      <div class="wahl-liste">${eintrag(b.planer.find((p) => p.art === 'Kasse'))}${eintrag(b.planer.find((p) => p.art === 'Privat'))}</div>`).join('')}`
  return `
    <div class="wahl" role="dialog" aria-modal="true" aria-label="Welchen Plan erstellen">
      <button type="button" class="wahl-grund" data-wahl-zu aria-label="Auswahl schließen"></button>
      <div class="wahl-karte">
        <div class="wahl-kopf">
          <h2>Welchen Plan?</h2>
          <button type="button" data-wahl-zu aria-label="Schließen">✕</button>
        </div>
        ${bloecke}
      </div>
    </div>`
}

function einstellungKarte(): string {
  const e = entwurf
  const p = pvsVon(e.pvs)
  const optionen = PVS_LISTE.map((x) => `<option value="${x.id}"${x.id === e.pvs ? ' selected' : ''}>${esc(x.name)} · ${esc(x.hersteller)}</option>`).join('')
  const geaendert = JSON.stringify(e) !== JSON.stringify(einstellungen)
  return `
    <div class="wahl" role="dialog" aria-modal="true" aria-label="Einstellungen">
      <button type="button" class="wahl-grund" data-wahl-zu aria-label="Einstellungen schließen"></button>
      <form class="wahl-karte einstellungen" data-einst>
        <div class="wahl-kopf">
          <h2>Einstellungen${ich.konto.admin ? '' : ' <small>nur lesen – ändern darf der Praxis-Admin</small>'}</h2>
          <button type="button" data-wahl-zu aria-label="Schließen">✕</button>
        </div>
        <label class="feld">Praxisverwaltungssystem (PVS)
          <select data-pvs>
            <option value=""${e.pvs ? '' : ' selected'}>– bitte wählen –</option>
            ${optionen}
          </select>
        </label>
        ${p ? `<p class="pvs-info">Übergabe: ${esc(p.weg)}<span class="marke-bridge ${p.bereit ? 'bereit' : 'bald'}">${p.bereit ? 'Anbindung verfügbar' : 'Anbindung in Vorbereitung'}</span></p>` : ''}
        <label class="schalter${p ? '' : ' aus'}">
          <input type="checkbox" data-bridge${e.bridge ? ' checked' : ''}${p ? '' : ' disabled'}>
          <span><b>Mit ${p ? esc(p.name) : 'dem PVS'} verbinden</b><small>${p ? `Patienten suchen, HKPs übernehmen und Pläne an ${esc(p.name)} übergeben.` : 'Zuerst das PVS wählen.'}</small></span>
        </label>
        ${p?.ordner && e.bridge ? `<label class="feld">Übergabeordner
          <input type="text" data-ordner value="${esc(e.ordner)}" placeholder="z. B. C:\\DENS\\Import" autocomplete="off" spellcheck="false">
        </label>` : ''}
        ${p && e.bridge && !p.bereit ? '<p class="pvs-hinweis">Die Anbindung an dieses PVS ist noch nicht fertig. Die Einstellung wird gespeichert, übertragen wird erst, wenn sie bereitsteht.</p>' : ''}
        ${p && e.bridge ? `<p class="pvs-info">PlanR-Bridge auf dem Praxisserver: ${agent ? (agent.verbunden ? `verbunden (${esc(agent.pvs ?? '')}, Version ${esc(agent.version ?? '?')})` : 'eingerichtet, gerade nicht verbunden') : 'nicht eingerichtet'}
          ${ich.konto.admin ? ' · <button type="button" class="link-knopf" data-bridge-laden>Bridge herunterladen</button>' : ' · Herunterladen kann sie der Praxis-Admin.'}</p>` : ''}
        ${katalogBlock()}
        ${benutzerBlock(benutzer)}
        <div class="einst-fuss">
          <span>${einstellungen.geaendert ? `Gespeichert ${esc(zeit(einstellungen.geaendert))}` : 'Noch nicht gespeichert'}</span>
          <button type="button" class="import-knopf" data-wahl-zu>Abbrechen</button>
          <button type="submit" class="neu-knopf"${geaendert && ich.konto.admin ? '' : ' disabled'}>Speichern</button>
    </div>
      </form>
    </div>`
}

const mal = (n: number, eins: string, viele: string) => `${n} ${n === 1 ? eins : viele}`

function katalogBlock(): string {
  const p = pvsZiel()
  if (!p) return ''
  const k = katalog
  const a = k?.aenderungen
  const summe = a ? Object.values(a).reduce((s, x) => ({ neu: s.neu + x.neu, geaendert: s.geaendert + x.geaendert, entfallen: s.entfallen + x.entfallen }), { neu: 0, geaendert: 0, entfallen: 0 }) : null
  const listenVon = (art: 'BEL' | 'BEB', gewaehlt: number | undefined, genutzt: number | undefined) => k?.listen
    .filter((l) => (l.art ?? 'BEB') === art)
    .map((l) => `<option value="${l.nr}"${l.nr === gewaehlt ? ' selected' : ''}>${esc(l.name)}${genutzt === l.nr ? ' (in den HKPs genutzt)' : ''}</option>`).join('') ?? ''
  const spaltenVon = (liste: number | undefined, gewaehlt: number | undefined) => {
    const aktiv = k?.listen.find((l) => l.nr === liste)
    return [1, 2, 3, 4].map((s) => `<option value="${s}"${s === gewaehlt ? ' selected' : ''}>${s}${s === 1 ? ' Eigenlabor' : s === 2 ? ' Fremdlabor' : ''} · ${aktiv?.mitPreis[s - 1] ?? 0} Preise</option>`).join('')
  }
  const listen = listenVon('BEB', k?.wahl.liste, k?.vorschlag?.liste)
  const spalten = spaltenVon(k?.wahl.liste, k?.wahl.spalte)
  const belListen = listenVon('BEL', k?.wahl.belListe, k?.vorschlagKasse?.liste)
  return `
        <fieldset class="katalog">
          <legend>Preise &amp; Positionen aus ${esc(p)}</legend>
          <p class="pvs-info">${k
            ? `Stand ${esc(zeit(k.stand))}: ${mal(k.anzahl.bel ?? 0, 'BEL-Preis', 'BEL-Preise')}${k.anzahl.bel ? ` (${esc(k.belListeName)})` : ''}, ${mal(k.anzahl.eigenlabor, 'Eigenlabor-Preis', 'Eigenlabor-Preise')} (${esc(k.listeName)}), ${mal(k.anzahl.material, 'Material', 'Materialien')}, ${mal(k.anzahl.goz, 'eigene GOZ-/Analogposition', 'eigene GOZ-/Analogpositionen')}, ${mal(k.anzahl.kuerzel, 'Kürzel', 'Kürzel')}, ${mal(k.anzahl.komplexe, 'Komplex', 'Komplexe')}.`
            : `Noch nicht übernommen. PlanR liest Eigenlabor-Preise (BEL und BEB), Materialkürzel, eigene GOZ-/Analogpositionen mit Faktor und die privaten Kürzel/Komplexe aus ${esc(p)} und legt sie hier an.`}</p>
          ${summe && (summe.neu || summe.geaendert || summe.entfallen) ? `<p class="pvs-info">Letzte Änderung: ${summe.neu} neu, ${summe.geaendert} geändert, ${summe.entfallen} entfallen.</p>` : ''}
          ${k && k.listen.length ? `${belListen ? `<div class="katalog-wahl">
            <label class="feld">Kasse · BEL-Preisliste<select data-kat-belliste>${belListen}</select></label>
            <label class="feld">Preisspalte<select data-kat-belspalte>${spaltenVon(k.wahl.belListe, k.wahl.belSpalte)}</select></label>
          </div>` : ''}
          <div class="katalog-wahl">
            <label class="feld">Privat · BEB-Preisliste<select data-kat-liste>${listen}</select></label>
            <label class="feld">Preisspalte<select data-kat-spalte>${spalten}</select></label>
          </div>
          <label class="schalter">
            <input type="checkbox" data-kat-faktoren${k.wahl.faktoren ? ' checked' : ''}>
            <span><b>GOZ-Faktoren der Praxis</b><small>${mal(k.anzahl.faktoren, 'voreingestellter Faktor', 'voreingestellte Faktoren')} aus ${esc(p)} übernehmen.</small></span>
          </label>` : ''}
          <div class="katalog-fuss">
            <small>Läuft automatisch, sobald ein HKP aus ${esc(p)} Positionen enthält, die PlanR nicht kennt.</small>
            <button type="button" class="import-knopf" data-kat-abgleich${katalogLaeuft ? ' disabled' : ''}>${katalogLaeuft ? 'Wird übernommen …' : k ? 'Erneut abgleichen' : 'Preise &amp; Positionen übernehmen'}</button>
          </div>
        </fieldset>`
}

async function katalogSenden(body: Record<string, unknown>) {
  katalogLaeuft = true
  zeichnen()
  const d = await apiJson<{ info?: KatalogInfo }>('/api/praxiskatalog', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  katalogLaeuft = false
  if (d.ok && d.info) {
    katalog = d.info
    melden(body.abgleich ? `Preise & Positionen aus ${d.info.pvs} übernommen.` : 'Auswahl übernommen.')
  } else melden(d.meldung || 'Das hat gerade nicht geklappt.')
  zeichnen()
}

async function einstellungenSpeichern() {
  try {
    const r = await fetch('/api/einstellungen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entwurf),
    })
    const d = await r.json() as { ok: boolean; einstellungen?: Einstellungen; meldung?: string }
    if (!d.ok || !d.einstellungen) return melden(d.meldung || 'Speichern hat nicht geklappt.')
    einstellungen = entwurf = d.einstellungen
    auswahlSchliessen()
    const p = pvsVon(einstellungen.pvs)
    melden(p ? `Gespeichert: ${p.name}, Verbindung ${einstellungen.bridge ? 'an' : 'aus'}.` : 'Gespeichert: kein PVS gewählt.')
  } catch {
    melden('Keine Verbindung.')
  }
}

function zeichnen() {
  const sichtbar = planFiltern(plaene, name, tag, planart, behandler)
  const gesamt = plaene.filter((p) => p.status !== 'verworfen').length
  const app = document.querySelector<HTMLDivElement>('#app')!
  const fokus = document.activeElement === document.getElementById('name')
  const cursor = fokus ? (document.getElementById('name') as HTMLInputElement).selectionStart : null
  app.innerHTML = `
  <header class="kopf">
    <div class="marke">
      <span class="logo">PR</span>
      <div>
        <h1>PlanR</h1>
          <p>Alle gespeicherten Pläne</p>
        </div>
      </div>
      <div class="kopf-rechts">
        <span class="kopf-info">${sichtbar.length} von ${gesamt}</span>
        <button type="button" class="konto-knopf" data-abmelden title="${esc(ich.konto.email)} – abmelden">${esc(ich.konto.name || ich.konto.email)}<small>Abmelden</small></button>
        ${ich.konto.admin ? `<button type="button" class="import-knopf${agent?.verbunden ? '' : ' hervor'}" data-einrichtung title="Praxissystem verbinden: Bridge, Preise &amp; Positionen">${agent?.verbunden ? '' : '<i class="punkt"></i>'}<span>Einrichtung</span></button>` : ''}
        ${ich.clara === 'planr' ? `<button type="button" class="import-knopf" data-clara-dialog title="HKP-Assistentin: Name und Handy koppeln">${MIKRO}<span>${esc(assistentin)}</span></button>` : ''}
        ${ich.konto.admin && ich.abo === 'planr' ? '<button type="button" class="import-knopf" data-rechnungen title="Ihr PlanR-Abo: laufender Monat und alle Rechnungen"><span>Rechnungen</span></button>' : ''}
        <button type="button" class="import-knopf" data-einstellungen title="PVS, Bridge und Benutzer einstellen">${ZAHNRAD}<span>Einstellungen</span></button>
        <button type="button" class="import-knopf" data-import-neu title="${pvsQuelle() ? `Patient in ${esc(pvsQuelle())} suchen: neuen HKP erstellen oder vorhandenen übernehmen` : 'Patient suchen und neuen HKP erstellen'}">${LUPE}<span>Patientensuche</span></button>
        <button type="button" class="neu-knopf" data-neu>Neuen Plan erstellen</button>
    </div>
  </header>
    ${ich.praxen?.length === 0 ? '<p class="freischalt-hinweis">Sie sind angemeldet, aber noch keiner Praxis zugeordnet. Der Praxis-Admin schaltet Sie in PlanR unter Einstellungen → Benutzer frei.</p>' : ''}
    <div class="seite">
      <aside class="filter">
        <label class="feld">Name
          <input id="name" type="search" placeholder="Patient oder Nummer" value="${esc(name)}" autocomplete="off">
        </label>
        <div class="monat">
          <button type="button" data-monat="-1" aria-label="Vorheriger Monat">‹</button>
          <strong>${MONATE[monat]} ${jahr}</strong>
          <button type="button" data-monat="1" aria-label="Nächster Monat">›</button>
        </div>
        <div class="tage">${kalender()}</div>
        <button type="button" class="alle${tag ? '' : ' an'}" data-alle>Alle Tage</button>
        <div class="filter-gruppe">
          <span class="filter-titel">Plan</span>
          ${chips('planart', planart, planarten().map((k) => ({ id: k, text: k })))}
        </div>
        <div class="filter-gruppe">
          <span class="filter-titel">Behandler</span>
          ${chips('behandler', behandler, behandlerNamen())}
        </div>
      </aside>
  <main>
        ${sichtbar.length
          ? `<div class="liste" role="table">
              <div class="zeile kopfzeile" role="row">
                <span class="sp-art">Plan</span>
                <span class="sp-patient">Patient</span>
                <span class="sp-nr">Nummer</span>
                <span class="sp-status">Status</span>
                <span class="sp-betrag">Betrag</span>
                <span class="sp-zeit">Geändert</span>
                <span class="sp-aktionen"></span>
              </div>
              ${sichtbar.map(zeile).join('')}
            </div>`
          : '<p class="leer">Keine Pläne für diese Auswahl. Gespeicherte Pläne aus HKP, PAR, KB und den anderen Planern erscheinen hier.</p>'}
  </main>
    </div>
    ${meldung ? `<div class="meldung" role="status"><span>${esc(meldung.text)}</span>${meldung.zurueck ? '<button type="button" data-zurueck>Rückgängig</button>' : ''}</div>` : ''}
    ${auswahl ? auswahlKarte() : ''}
    ${einstellungAuf ? einstellungKarte() : ''}`
  app.querySelectorAll<HTMLButtonElement>('[data-loeschen]').forEach((b) => b.addEventListener('click', () => {
    const p = sichtbar[Number(b.dataset.loeschen)]
    if (p) void loeschenFragen(p)
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((b) => b.addEventListener('click', () => {
    const p = sichtbar[Number(b.dataset.export)]
    if (p) void exportieren(p)
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-import]').forEach((b) => b.addEventListener('click', () => {
    const p = sichtbar[Number(b.dataset.import)]
    if (p) importWaehlen(p)
  }))
  app.querySelector<HTMLButtonElement>('[data-import-neu]')!.addEventListener('click', () => {
    const ziel = pvsQuelle()
    const getrennt = !!ziel && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !agent?.verbunden
    patientensucheOeffnen({
      pvsName: ziel,
      pvsHinweis: !getrennt ? undefined : agent
        ? `Die PlanR-Bridge auf dem Praxisserver ist gerade nicht verbunden – die Suche in ${ziel} geht so nur direkt am Praxis-PC.`
        : `Die Suche in ${ziel} über das Internet braucht die PlanR-Bridge auf dem Praxisserver (Einrichtung → Bridge).`,
      planrPlaene,
      neuerHkp: hkpNeuOeffnen,
      dateiWaehlen: () => importWaehlen(null),
      geoeffnet: ausPvsOeffnen,
    })
  })
  app.querySelector<HTMLButtonElement>('[data-einstellungen]')!.addEventListener('click', () => {
    entwurf = einstellungen
    einstellungAuf = true
    auswahl = false
    urlSetzen('push')
    zeichnen()
    void katalogLaden().then(() => { if (einstellungAuf && !katalogLaeuft) zeichnen() })
    if (ich.konto.admin) void benutzerLaden().then((b) => { benutzer = b; if (einstellungAuf) zeichnen() })
  })
  app.querySelector<HTMLButtonElement>('[data-einrichtung]')?.addEventListener('click', () => void einrichtungZeigen())
  app.querySelector<HTMLButtonElement>('[data-clara-dialog]')?.addEventListener('click', () => void claraZeigen())
  app.querySelector<HTMLButtonElement>('[data-rechnungen]')?.addEventListener('click', () => void rechnungenZeigen())
  app.querySelector<HTMLButtonElement>('[data-abmelden]')!.addEventListener('click', () => {
    if (confirm(`${ich.konto.email} auf diesem Gerät abmelden?`)) void abmelden()
  })
  const form = app.querySelector<HTMLFormElement>('[data-einst]')
  if (form) {
    form.addEventListener('submit', (ev) => { ev.preventDefault(); void einstellungenSpeichern() })
    form.querySelector<HTMLSelectElement>('[data-pvs]')!.addEventListener('change', (ev) => {
      const pvs = (ev.target as HTMLSelectElement).value
      entwurf = { ...entwurf, pvs, bridge: pvs ? entwurf.bridge : false }
      zeichnen()
    })
    form.querySelector<HTMLInputElement>('[data-bridge]')!.addEventListener('change', (ev) => {
      entwurf = { ...entwurf, bridge: (ev.target as HTMLInputElement).checked }
      zeichnen()
    })
    form.querySelector<HTMLInputElement>('[data-ordner]')?.addEventListener('input', (ev) => {
      entwurf = { ...entwurf, ordner: (ev.target as HTMLInputElement).value }
      const knopf = form.querySelector<HTMLButtonElement>('button[type=submit]')!
      knopf.disabled = JSON.stringify(entwurf) === JSON.stringify(einstellungen)
    })
    form.querySelectorAll<HTMLInputElement>('[data-zuordnung]').forEach((x) => x.addEventListener('change', async () => {
      const uid = x.dataset.zuordnung!
      const praxen = [...form.querySelectorAll<HTMLInputElement>('[data-zuordnung]')].filter((y) => y.dataset.zuordnung === uid && y.checked).map((y) => Number(y.value))
      const fehler = await benutzerZuordnen(uid, praxen)
      benutzer = await benutzerLaden()
      melden(fehler || 'Zuordnung gespeichert. Sie gilt ab dem nächsten Laden der Seite des Benutzers.')
    }))
    form.querySelector<HTMLButtonElement>('[data-kat-abgleich]')?.addEventListener('click', () => void katalogSenden({ abgleich: true }))
    const wahl = () => ({
      liste: Number(form.querySelector<HTMLSelectElement>('[data-kat-liste]')!.value),
      spalte: Number(form.querySelector<HTMLSelectElement>('[data-kat-spalte]')!.value),
      faktoren: form.querySelector<HTMLInputElement>('[data-kat-faktoren]')!.checked,
      ...(form.querySelector('[data-kat-belliste]') ? {
        belListe: Number(form.querySelector<HTMLSelectElement>('[data-kat-belliste]')!.value),
        belSpalte: Number(form.querySelector<HTMLSelectElement>('[data-kat-belspalte]')!.value),
      } : {}),
    })
    form.querySelectorAll('[data-kat-liste], [data-kat-spalte], [data-kat-faktoren], [data-kat-belliste], [data-kat-belspalte]')
      .forEach((x) => x.addEventListener('change', () => void katalogSenden({ wahl: wahl() })))
  }
  app.querySelector<HTMLButtonElement>('[data-zurueck]')?.addEventListener('click', () => {
    const p = meldung?.zurueck
    if (p) void zurueckholen(p)
  })
  const feld = document.getElementById('name') as HTMLInputElement
  feld.addEventListener('input', () => {
    name = feld.value
    urlSetzen('replace')
    zeichnen()
  })
  if (fokus) {
    feld.focus()
    if (cursor != null) feld.setSelectionRange(cursor, cursor)
  }
  app.querySelectorAll<HTMLButtonElement>('[data-monat]').forEach((b) => b.addEventListener('click', () => {
    monat += Number(b.dataset.monat)
    if (monat < 0) { monat = 11; jahr -= 1 }
    if (monat > 11) { monat = 0; jahr += 1 }
    zeichnen()
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-tag]').forEach((b) => b.addEventListener('click', () => {
    tag = tag === b.dataset.tag ? '' : (b.dataset.tag || '')
    urlSetzen('replace')
    zeichnen()
  }))
  app.querySelector<HTMLButtonElement>('[data-alle]')!.addEventListener('click', () => {
    tag = ''
    urlSetzen('replace')
    zeichnen()
  })
  app.querySelectorAll<HTMLButtonElement>('[data-planart]').forEach((b) => b.addEventListener('click', () => {
    planart = b.dataset.planart || ''
    urlSetzen('replace')
    zeichnen()
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-behandler]').forEach((b) => b.addEventListener('click', () => {
    behandler = b.dataset.behandler || ''
    urlSetzen('replace')
    zeichnen()
  }))
  app.querySelector<HTMLButtonElement>('[data-neu]')!.addEventListener('click', () => {
    if (auswahl) auswahlSchliessen()
    else {
      auswahl = true
      einstellungAuf = false
      urlSetzen('push')
      zeichnen()
    }
  })
  app.querySelectorAll<HTMLButtonElement>('[data-wahl-zu]').forEach((b) => b.addEventListener('click', auswahlSchliessen))
  app.querySelector<HTMLButtonElement>('[data-bridge-laden]')?.addEventListener('click', () => { auswahlSchliessen(); void einrichtungZeigen(true) })
}

ausUrl()
window.addEventListener('popstate', () => { ausUrl(); zeichnen() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (auswahl || einstellungAuf)) auswahlSchliessen() })

async function laden() {
  const d = await (await fetch('/api/plaene', { cache: 'no-store' })).json() as { plaene?: PlanKarte[] }
  plaene = Array.isArray(d.plaene) ? d.plaene : []
  zeichnen()
}

async function katalogLaden() {
  try {
    const k = await (await fetch('/api/praxiskatalog?nur=info', { cache: 'no-store' })).json() as { info?: KatalogInfo | null }
    katalog = k.info ?? null
  } catch { /* bleibt beim letzten Stand */ }
}

async function einstellungenLaden() {
  try {
    const d = await (await fetch('/api/einstellungen', { cache: 'no-store' })).json() as { einstellungen?: Einstellungen; agent?: typeof agent }
    if (d.einstellungen) einstellungen = d.einstellungen
    agent = d.agent ?? null
  } catch { /* Maske startet leer */ }
  await katalogLaden()
  entwurf = einstellungen
}

async function einrichtungZeigen(bridgeLaden = false) {
  const { einrichtungOeffnen } = await import('./einrichtung')
  einrichtungOeffnen({
    admin: ich.konto.admin,
    bridgeLaden,
    einstellungen,
    geaendert: () => void einstellungenLaden().then(zeichnen),
    importieren: () => app.querySelector<HTMLButtonElement>('[data-import-neu]')?.click(),
  })
}

async function claraZeigen() {
  const { claraLaden, claraOeffnen } = await import('./clara')
  const stand = await claraLaden()
  if (stand?.assistantName) assistentin = stand.assistantName
  claraOeffnen({ admin: ich.konto.admin, stand, geaendert: (n) => { assistentin = n; zeichnen() } })
}

async function rechnungenZeigen() {
  const { rechnungenOeffnen } = await import('./rechnungen')
  await rechnungenOeffnen({ patient: (modul, nummer) => plaene.find((p) => p.modul === modul && p.nummer === nummer)?.patient ?? '' })
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = '<p class="leer">Pläne werden geladen …</p>'
/** Ohne Anmeldung: Startseite für Besucher, #anmelden zeigt die Anmeldung */
function ohneAnmeldung() {
  let ansicht = ''
  const zeigen = async () => {
    const soll = ['#anmelden', '#bridge', '#einrichtung'].includes(location.hash) || sitzungHinweis ? 'anmelden'
      : location.hash === '#buchen' || location.hash === '#buchen-clara' ? location.hash : 'start'
    if (soll === ansicht) return
    ansicht = soll
    const hp = await import('./homepage')
    if (soll === 'anmelden') {
      hp.homepageVerlassen()
      document.title = 'PlanR – Anmelden'
      anmeldeSeite(app, sitzungHinweis || (location.hash === '#bridge' ? 'Bitte als Praxis-Admin anmelden – danach laden Sie die Bridge herunter.' : ''))
      scrollTo(0, 0)
    } else if (soll.startsWith('#buchen')) {
      hp.homepageVerlassen()
      const { buchungSeite } = await import('./buchung')
      buchungSeite(app, soll === '#buchen-clara' ? 'planr_clara' : 'planr')
    } else hp.homepage(app)
  }
  addEventListener('hashchange', () => {
    if (location.hash !== '#anmelden' && sitzungHinweis) sitzungHinweisLoeschen()
    void zeigen()
  })
  return zeigen()
}

ausPickadoc().then(ichLaden).then(async (wer) => {
  if (!wer) return ohneAnmeldung()
  ich = wer
  sitzungBewachen()
  await einstellungenLaden()
  await laden()
  if (ich.clara === 'planr') {
    void import('./clara').then((c) => c.claraLaden()).then((s) => {
      if (s?.assistantName && s.assistantName !== assistentin) { assistentin = s.assistantName; zeichnen() }
    })
  }
  // Neue Praxis ohne Praxissystem: Assistent startet von selbst (einmal je Tab), #einrichtung öffnet ihn jederzeit
  const neu = ich.konto.admin && !einstellungen.pvs && !sessionStorage.getItem('planr-einrichtung')
  if (location.hash === '#rechnungen' && ich.konto.admin && ich.abo === 'planr') void rechnungenZeigen()
  else if (location.hash === '#einrichtung' || location.hash === '#bridge' || neu) {
    sessionStorage.setItem('planr-einrichtung', '1')
    void einrichtungZeigen(location.hash === '#bridge')
  }
}).catch(() => { app.innerHTML = '<p class="leer">Die Planliste ist gerade nicht erreichbar.</p>' })

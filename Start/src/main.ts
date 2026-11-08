import './style.css'
import './thema'
import { ersetzbar, loeschbar, nummerMitReihe, planDateiLesen, planFiltern, tagVon, type PatientKennung, type PlanDatei, type PlanKarte } from './plaene'
import { BEREICHE, adresse, planerZuModul } from './planer'
import { LEER, PVS_LISTE, pvsVon, type Einstellungen } from './einstellungen'
import { PVS_BEFUND, PVS_CONNECTOR, PVS_PLANER, PVS_SUCHE, planInsPvsMoeglich } from './pvs'
import { patientensucheOeffnen, type PlanTreffer, type Stammdaten } from './patientensuche'
import { befundZeigen } from './befund'
import { apiJson } from './api'
import { verbundBlock, verbundLaden, verbundVerdrahten } from './verbund'
import { logo } from './logo'
import { aboText, fotoZuschneiden, kontoMenu, persoenlichKarte } from './konto'
import { abmelden, anmeldePopup, anmeldePopupEntfernen, ausPickadoc, benutzerBlock, benutzerLaden, benutzerZuordnen, ichLaden, sitzungBewachen, sitzungHinweis, sitzungHinweisLoeschen, type BenutzerZeile, type Ich, type PraxisZeile } from './anmeldung'
import { planArbeit, planGespraechVergessen, planNameGesucht } from './arbeitClient'
import { kastenSatz, OK, schemaVon, UK, type Kasten, type KastenGruppe } from './kasten'
import { DAUER_MIN, dauerText, geschlecht, kalenderErlaubt, motivPasst, slotBadge, terminKurz, type TerminGrund, type TerminMotiv } from './termin'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const STATUS: Record<string, string> = {
  entwurf: 'Entwurf',
  freigegeben: 'freigegeben',
  wartet_auf_freigabe: 'wartet auf Freigabe',
  eingereicht: 'eingereicht',
  genehmigt: 'genehmigt',
  abgelehnt: 'abgelehnt',
  abgerechnet: 'abgerechnet',
  befund: 'Befund · noch nichts geplant',
  in_planung: 'in Planung',
}
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const WOCHEN = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

let plaene: PlanKarte[] = []
let name = ''
let tag = ''
/** Gesetzte Plan-Sicht, noch ohne Praxisprogramm: genehmigt, nicht-genehmigt, abgerechnet, nicht-abgerechnet */
let planSicht = ''
let auswahl = false
/** Patient, für den die Planauswahl gerade einen neuen Plan anlegt – ohne Patienten gibt es keinen Plan */
let neuFuer: Stammdaten | null = null
let einstellungAuf = false
let persoenlichAuf = false
/** Cache-Bruch fürs Profilfoto nach Hochladen oder Entfernen */
let fotoStand = 0
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
let planBlick: { url: string; titel: string; nummer: string; modul: string } | null = null
let planPunkte: { id: string; text: string }[] = []
let planAktiv = ''
let planVersand = false
let claraLaeuft = false
/** Nach einem gespeicherten Plan den offenen Planer neu laden, damit die Änderung sichtbar ist. */
let planFrischen = false
/** Benutzer und Praxen für den Praxis-Admin (null = nicht geladen / kein Admin) */
let benutzer: { praxen: PraxisZeile[]; benutzer: BenutzerZeile[] } | null = null
const heute = new Date()
let jahr = heute.getFullYear()
let monat = heute.getMonth()
/** Kalender auf dem Handy zugeklappt, bis er gebraucht wird. */
let datumAuf = false

function ausUrl() {
  const q = new URLSearchParams(location.search)
  name = q.get('name') || ''
  tag = q.get('tag') || ''
  planSicht = ['genehmigt', 'nicht-genehmigt', 'abgerechnet', 'nicht-abgerechnet'].includes(q.get('sicht') || '') ? (q.get('sicht') || '') : ''
  auswahl = q.get('neu') === '1' && !!neuFuer
  const warAuf = einstellungAuf
  einstellungAuf = q.get('einstellungen') === '1' && !auswahl
  if (einstellungAuf && !warAuf) entwurf = einstellungen
  if (/^\d{4}-\d{2}-\d{2}$/.test(tag)) {
    jahr = Number(tag.slice(0, 4))
    monat = Number(tag.slice(5, 7)) - 1
  }
}

/** Eigene Schritte, damit Zurück nicht aus PlanR herausführt und Vor nur bis zum letzten Plan geht. */
let verlaufJetzt = 0
let verlaufMax = 0

/** Filter ersetzen den aktuellen Eintrag. Die Planauswahl kommt als eigener Schritt dazu, damit Zurück sie schließt. */
function urlSetzen(art: 'push' | 'replace') {
  const u = new URL(location.href)
  if (name) u.searchParams.set('name', name)
  else u.searchParams.delete('name')
  if (tag) u.searchParams.set('tag', tag)
  else u.searchParams.delete('tag')
  u.searchParams.delete('plan')
  u.searchParams.delete('behandler')
  if (planSicht) u.searchParams.set('sicht', planSicht)
  else u.searchParams.delete('sicht')
  if (auswahl) u.searchParams.set('neu', '1')
  else u.searchParams.delete('neu')
  if (einstellungAuf) u.searchParams.set('einstellungen', '1')
  else u.searchParams.delete('einstellungen')
  const offen = planBlick?.modul && planBlick.nummer ? `${planBlick.modul}~${planBlick.nummer}` : ''
  if (offen) u.searchParams.set('offen', offen)
  else u.searchParams.delete('offen')
  const next = u.pathname + u.search + u.hash
  if (next === location.pathname + location.search + location.hash) return
  if (art === 'push') {
    verlaufJetzt += 1
    verlaufMax = verlaufJetzt
  }
  const state = { planr: 1, neu: auswahl || einstellungAuf ? 1 : 0, n: verlaufJetzt }
  if (art === 'push') history.pushState(state, '', next)
  else history.replaceState(state, '', next)
}

function planNav(richtung: 'zurueck' | 'vor') {
  if (richtung === 'zurueck') {
    if (verlaufJetzt <= 0) return
    verlaufJetzt -= 1
    history.back()
    return
  }
  if (verlaufJetzt >= verlaufMax) return
  verlaufJetzt += 1
  history.forward()
}

/** Zurück und Vor lesen den offenen Plan aus der Adresse. Der Planer selbst legt keinen Verlaufseintrag an. */
function planAusAdresse() {
  const offen = new URLSearchParams(location.search).get('offen') || ''
  if (!offen) { planBlick = null; planLeisteLeeren(); planGespraechVergessen(); return }
  const trenn = offen.indexOf('~')
  const modul = trenn > 0 ? offen.slice(0, trenn) : ''
  const nummer = trenn > 0 ? offen.slice(trenn + 1) : ''
  if (planBlick && planBlick.modul === modul && planBlick.nummer === nummer && planBlick.url) return
  const p = plaene.find((x) => x.modul === modul && x.nummer === nummer)
  if (!p) {
    if (plaene.length) { planBlick = null; planGespraechVergessen() }
    return
  }
  const url = planUrl(p)
  if (!url) { planBlick = null; planGespraechVergessen(); return }
  const key = `${modul}~${nummer}`
  const alt = planBlick ? `${planBlick.modul}~${planBlick.nummer}` : ''
  planBlick = { url, titel: p.patient, nummer: p.nummer, modul: p.modul }
  if (key !== alt) { planGespraechVergessen(); planLeisteLeeren() }
}

function planLeisteLeeren() {
  planPunkte = []
  planAktiv = ''
  planVersand = false
}

function planSchliessen() {
  planGespraechVergessen()
  planBlick = null
  planLeisteLeeren()
  urlSetzen('replace')
  zeichnen()
}

/** Filter gehören zur Übersicht. Ein offener Plan gibt die Liste frei, sonst sieht man die Auswahl nicht. */
function filterSetzen() {
  if (planBlick) planSchliessen()
  else {
    urlSetzen('replace')
    zeichnen()
  }
}

function auswahlSchliessen() {
  if (history.state && (history.state as { neu?: number }).neu) history.back()
  else {
    auswahl = false
    neuFuer = null
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
  const url = new URL(basis, location.href)
  if (p.oeffnen) new URLSearchParams(p.oeffnen).forEach((v, k) => url.searchParams.set(k, v))
  else if (p.modul !== 'hkp' && p.nummer) url.searchParams.set('plan', p.nummer)
  else return basis
  return url.toString()
}

const TONNE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>'

const PFEIL = (d: string) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`
const EXPORT = PFEIL('M12 4v11M7 10l5 5 5-5M5 20h14')
const IMPORT = PFEIL('M12 15V4M7 9l5-5 5 5M5 20h14')
const BRIEF = PFEIL('M3 6h18v12H3zM3 7l9 6 9-6')
const BRIEF_GESENDET = PFEIL('M13 18H3V6h18v6M3 7l9 6 9-6M15 18l2.5 2.5L22 16')
/** Planer mit „Versenden“ (Kostenvoranschlag per E-Mail) */
const MIT_VERSAND = new Set(['privat-kb', 'privat-kv', 'privat-impl', 'privat-kons', 'privat-par', 'privat-kfo', 'hkp'])
const versandUrl = (url: string) => {
  const u = new URL(url, location.href)
  u.searchParams.set('versand', '1')
  return u.toString()
}
const LUPE = PFEIL('M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.5 15.5 20 20')
const MIKRO = PFEIL('M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3')
const DELFIN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M2 13.2C3.2 12.4 4 11.6 5 10.6 7.6 7.8 11.4 6.2 15 6.8L15.6 4.6 17.2 7.4C19.4 8.4 20.6 10.4 21 12.4L23 11.2 22 14.2 22.6 16.6 20.2 14.8C19.2 13.2 17.4 12 15 11.7 12 11.4 9 12.4 7 14.4L6 17 5.2 14.5C4 14.5 2.8 14.1 2 13.2Z"/><circle cx="6.4" cy="11.7" r=".65" fill="#fff"/></svg>'
const ZAHN = PFEIL('M7.5 3C5 3 3.5 5 3.5 7.6c0 2.3 1 3.9 1.5 6.3.5 2.4.8 7.1 2.5 7.1 1.6 0 1.7-4.5 2.7-6.4.4-.8.9-1.1 1.8-1.1s1.4.3 1.8 1.1c1 1.9 1.1 6.4 2.7 6.4 1.7 0 2-4.7 2.5-7.1.5-2.4 1.5-4 1.5-6.3C20.5 5 19 3 16.5 3 14.6 3 13.6 4 12 4s-2.6-1-4.5-1Z')

/** PVS, dessen 01 PlanR lesen und schreiben kann – nur mit eingeschalteter Bridge */
function befundPvs(): string {
  const p = pvsVon(einstellungen.pvs)
  return p && einstellungen.bridge && PVS_BEFUND.has(p.id) ? p.name : ''
}

/** Befund-Knopf einer Zeile: öffnet den 01 des Patienten zum Ansehen und Ändern */
function befundKnopf(p: PlanKarte, i: number): string {
  const pvs = befundPvs()
  if (!pvs) return ''
  const name = esc(p.patient || 'Ohne Namen')
  return p.kennung
    ? `<button type="button" class="aktion befund-knopf" data-befund="${i}" title="Befund (01) aus ${esc(pvs)} ansehen und ändern" aria-label="Befund von ${name}">${ZAHN}</button>`
    : `<span class="aktion aus" title="Ohne Geburtsdatum findet PlanR den Patienten in ${esc(pvs)} nicht sicher – Befund über die Patientensuche öffnen">${ZAHN}</span>`
}

/** Laufender Vorgang: Befund steht (noch nichts geplant) bzw. Plan entsteht gerade */
function planSchein(p: Pick<PlanKarte, 'nummer' | 'schein'>): string {
  return p.schein || nummerMitReihe(p.nummer)
}

function vorgangZeile(p: PlanKarte, i: number): string {
  const v = p.vorgang!
  const name = esc(p.patient)
  const art = v.modul ? `${p.kuerzel}${p.art === 'Privat' ? ' privat' : ''}` : ''
  const status = v.phase === 'befund' ? STATUS.befund : `${STATUS.in_planung}${art ? ` · ${art}` : ''}`
  const hinweis = v.meldung || (v.offen ? `${v.offen} ${v.offen === 1 ? 'Zahn' : 'Zähne'} noch nicht in ${v.pvs}` : '')
  return `<div class="zeile vorgang mit-link" role="row">
    <span class="sp-art"><span class="kuerzel befund-icon" title="Befund (01)">${ZAHN}</span>${v.modul ? `<span class="kuerzel">${esc(p.kuerzel)}</span>` : ''}</span>
    <button type="button" class="sp-patient link-zeile" data-befund="${i}" title="Befund ansehen und ändern">${name}</button>
    <span class="sp-nr">Pat.-Nr. ${esc(v.patient)}</span>
    <span class="sp-status">${esc(status)}${v.auftrag ? `<small>${esc(v.auftrag)}</small>` : ''}${hinweis ? `<small class="vorgang-hinweis">${esc(hinweis)}</small>` : ''}</span>
    <span class="sp-betrag"></span>
    <span class="sp-zeit">${esc(zeit(p.geaendert))}</span>
    <span class="sp-termin"></span>
    <span class="sp-aktionen">${befundKnopf(p, i)}<button type="button" class="aktion tonne" data-vorgang-ende="${i}" title="Aus der Liste nehmen – der Befund bleibt" aria-label="Vorgang aus der Liste nehmen: ${name}">${TONNE}</button></span>
  </div>`
}

interface TerminBehandler { id: string; name: string; locationId: string }
interface TerminBlick {
  modul: string
  nummer: string
  name: string
  laden: boolean
  kalender: boolean
  telefon: string
  email: string
  vorname: string
  nachname: string
  anrede: string
  behandler: TerminBehandler[]
  motive: TerminMotiv[]
  grund: TerminGrund
  dauer: number
  calendarId: string
  motivId: string
  slots: string[]
  minuten: number
  slotsLaden: boolean
  fehler: string
}
let terminBlick: TerminBlick | null = null
let stammLauf = 0
let slotLauf = 0

function terminZelle(p: PlanKarte): string {
  const taste = (klasse: string, text: string) =>
    `<button type="button" class="${klasse}" data-termin="${esc(p.modul)}" data-nummer="${esc(p.nummer)}">${text}</button>`
  if (p.termin && terminKurz(p.termin)) return taste('termin-datum', esc(terminKurz(p.termin)))
  return taste(kalenderErlaubt(ich.abo, ich.clara) ? 'termin-maske' : 'termin-aus', 'Termin')
}

function gewaehltesMotiv(b: TerminBlick): TerminMotiv | undefined {
  const ort = b.behandler.find((k) => k.id === b.calendarId)?.locationId ?? ''
  return b.motive.find((m) => m.id === b.motivId && motivPasst(m, b.grund, b.dauer, ort, b.calendarId))
    ?? b.motive.find((m) => motivPasst(m, b.grund, b.dauer, ort, b.calendarId))
}

function terminPopup(): string {
  const b = terminBlick
  if (!b) return ''
  const feld = (label: string, wert: string) => `<label><span>${label}</span><b>${esc(wert || '—')}</b></label>`
  const motiv = gewaehltesMotiv(b)
  const treffer = b.motive.filter((m) => motivPasst(m, b.grund, b.dauer, b.behandler.find((k) => k.id === b.calendarId)?.locationId ?? '', b.calendarId))
  const badges = b.slots.map((iso) => {
    const badge = slotBadge(iso, b.minuten)
    return badge ? `<button type="button" class="slot-badge" data-slot="${esc(iso)}"><b>${esc(badge.tag)}</b><span>${esc(badge.uhrzeit)}</span><small>${esc(badge.laenge)}</small></button>` : ''
  }).join('')
  const hinweis = !b.kalender
    ? ''
    : b.slotsLaden
      ? '<p class="termin-hinweis">Freie Slots werden gelesen …</p>'
      : !motiv
        ? '<p class="termin-hinweis">Für diese Länge gibt es keinen passenden Besuchsgrund im Kalender.</p>'
        : b.slots.length
          ? ''
          : '<p class="termin-hinweis">Keine freien Slots in den nächsten Wochen.</p>'
  return `<div class="termin-popup" role="dialog" aria-modal="true" aria-label="Termin">
    <button type="button" class="termin-hg" data-termin-zu aria-label="Schließen"></button>
    <div class="termin-karte${b.kalender ? '' : ' gesperrt'}">
      <header><h2>Termin</h2><button type="button" data-termin-zu aria-label="Schließen">×</button></header>
      <div class="termin-stamm">
        ${feld('Name', b.name)}
        ${feld('Telefon', b.telefon)}
        ${feld('E-Mail', b.email)}
      </div>
      <div class="termin-wahl">
        <span>Behandlungsgrund</span>
        <button type="button" data-grund="besprechung" class="${b.grund === 'besprechung' ? 'an' : ''}">Besprechung</button>
        <button type="button" data-grund="start" class="${b.grund === 'start' ? 'an' : ''}">Behandlungsstart</button>
      </div>
      <label class="termin-behandler">Behandler
        <select data-behandler>${b.behandler.map((k) => `<option value="${esc(k.id)}"${k.id === b.calendarId ? ' selected' : ''}>${esc(k.name)}</option>`).join('') || '<option value="">Kein Kalender</option>'}</select>
      </label>
      <div class="termin-dauer" role="group" aria-label="Slotlänge">
        ${DAUER_MIN.map((n) => `<button type="button" data-dauer="${n}" class="${n === b.dauer ? 'an' : ''}">${esc(dauerText(n))}</button>`).join('')}
      </div>
      ${treffer.length > 1 ? `<label class="termin-behandler">Besuchsgrund<select data-motiv>${treffer.map((m) => `<option value="${esc(m.id)}"${m.id === motiv?.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>` : motiv ? `<p class="termin-motiv">${esc(motiv.name)}</p>` : ''}
      <div class="termin-slots">${badges}</div>
      ${hinweis}
      ${b.fehler ? `<p class="termin-fehler">${esc(b.fehler)}</p>` : ''}
      ${b.laden ? '<p class="termin-hinweis">Stammdaten werden gelesen …</p>' : ''}
      ${b.kalender ? '' : '<a class="termin-kaufen" href="https://pickadoc.ai" target="_blank" rel="noopener">CalendR kaufen</a>'}
    </div>
  </div>`
}

function zeile(p: PlanKarte, i: number): string {
  if (p.vorgang) return vorgangZeile(p, i)
  const url = planUrl(p)
  const name = esc(p.patient || 'Ohne Namen')
  const hkp = p.modul === 'hkp'
  const tonne = loeschbar(p)
    ? `<button type="button" class="aktion tonne" data-loeschen="${i}" title="${hkp ? 'HKP verwerfen' : 'Plan löschen'}" aria-label="${hkp ? 'HKP verwerfen' : 'Plan löschen'}: ${name}">${TONNE}</button>`
    : `<span class="aktion tonne aus" title="Liegt bei der Kasse – nur in PlanR änderbar">${TONNE}</span>`
  const ziel = exportZiel(p)
  const dens = einstellungen.pvs === 'dens'
  const export_ = ziel
    ? `<button type="button" class="aktion pvs-knopf${p.imPvs ? ' im-pvs' : ''}" data-export="${i}" title="${esc(`In ${ziel} exportieren${p.imPvs ? ` · ${p.imPvs}` : ''}`)}" aria-label="In ${esc(ziel)} exportieren: ${name}">${dens ? DELFIN : EXPORT}<span>${dens ? 'DENS' : esc(ziel)}</span></button>`
    : hkp
      ? `<span class="aktion aus" title="Kein Praxisprogramm mit Bridge eingestellt (Einstellungen)">${EXPORT}</span>`
      : `<button type="button" class="aktion" data-export="${i}" title="Als JSON exportieren" aria-label="Exportieren: ${name}">${EXPORT}</button>`
  const versand = url && MIT_VERSAND.has(p.modul)
    ? `<a class="aktion versand${p.versendet ? ' versendet' : ''}" href="${esc(versandUrl(url))}" title="${esc(p.versendet ? `${p.versendet} – erneut senden` : 'Kostenvoranschlag per E-Mail an den Patienten')}" aria-label="Per E-Mail versenden: ${name}">${p.versendet ? BRIEF_GESENDET : BRIEF}</a>`
    : ''
  const import_ = ersetzbar(p)
    ? `<button type="button" class="aktion" data-import="${i}" title="Plan aus JSON-Datei ersetzen" aria-label="Importieren: ${name}">${IMPORT}</button>`
    : `<span class="aktion aus" title="Wartet nicht mehr auf Freigabe – nur in PlanR änderbar">${IMPORT}</span>`
  return `<div class="zeile${url ? ' mit-link' : ''}" role="row">
    <span class="sp-art"><span class="kuerzel">${esc(p.kuerzel)}</span></span>
    ${url ? `<a class="sp-patient" href="${esc(url)}" data-nummer="${esc(p.nummer)}" data-modul="${esc(p.modul)}">${name}</a>` : `<span class="sp-patient">${name}</span>`}
    <span class="sp-nr">${esc(planSchein(p))}</span>
    <span class="sp-status">${esc(STATUS[p.status] || p.status)}</span>
    <span class="sp-betrag">${p.betrag ? esc(euro(p.betrag)) : ''}</span>
    <span class="sp-zeit">${esc(zeit(p.geaendert))}</span>
    <span class="sp-termin">${terminZelle(p)}</span>
    <span class="sp-aktionen">${befundKnopf(p, i)}${versand}${export_}${import_}${tonne}</span>
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

/** Wohin der Exportknopf einer Zeile schreibt: HKPs in jedes angebundene PVS, die Privat-/MKV-Pläne bisher nur nach DS-Win */
function exportZiel(p: PlanKarte): string {
  if (p.modul === 'hkp') return pvsZiel()
  return planInsPvsMoeglich(einstellungen.pvs, p.modul) ? pvsZiel() : ''
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
  const art = p.modul === 'hkp' ? 'HKP' : PVS_PLANER[p.modul] ?? 'Plan'
  const frage = p.imPvs
    ? `${p.imPvs}.\n\nTrotzdem noch einmal als neuen Plan in ${ziel} anlegen?`
    : `${art} von ${wer} in ${ziel} beim gleichnamigen Patienten anlegen?`
  if (!confirm(frage)) return
  pvsLaeuft = true
  melden(`${art} von ${wer} geht an ${ziel} …`)
  try {
    const r = await apiJson<Antwort>('/api/plaene/pvs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kennung(p)),
    })
    if (r.ok) await laden()
    melden(r.meldung || (r.ok ? `${art} in ${ziel} angelegt.` : `Export nach ${ziel} hat nicht geklappt.`))
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

/** Neuer Plan im Planer: Anmeldedaten im Fragment (geht nie an einen Server), der Planer liest und löscht es. */
function neuUrl(basis: string, p: Stammdaten): string {
  const url = new URL(basis, location.href)
  url.searchParams.set('neu', '1')
  const json = new TextEncoder().encode(JSON.stringify(p))
  url.hash = `patient=${btoa(String.fromCharCode(...json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  return url.toString()
}

/** Neuer Plan für einen Patienten: erst die Planart wählen */
function neuerPlanFuer(p: Stammdaten) {
  neuFuer = p
  auswahl = true
  einstellungAuf = false
  urlSetzen('push')
  zeichnen()
}

/** Befund (01) eines Patienten: ansehen, ändern, ins PVS speichern, neuen Plan anfangen */
function befundOeffnen(kennung: PatientKennung, titel: string) {
  befundZeigen(kennung, titel, { neuerPlan: neuerPlanFuer, geaendert: () => void laden(), assistentin })
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
  const ziel = exportZiel(p)
  if (ziel) return insPvs(p, ziel)
  if (p.modul === 'hkp') return
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
    if (!confirm(`Plan von ${ziel.patient || 'Ohne Namen'} (${ziel.kuerzel} ${planSchein(ziel)}) durch die Datei ersetzen?\n\nDatei: ${aus}`)) return
  } else if (datei.nummer && plaene.some((p) => p.modul === datei.modul && p.nummer === datei.nummer)) {
    if (!confirm(`Den Plan ${datei.kuerzel} ${nummerMitReihe(datei.nummer)} gibt es schon. Mit der Datei überschreiben?\n\nDatei: ${aus}`)) return
  }
  const r = await senden('import', { datei: roh, ziel: ziel ? kennung(ziel) : undefined })
  if (!r.ok) return melden(r.meldung || 'Import hat nicht geklappt.')
  await laden()
  melden(datei.modul === 'hkp'
    ? (ziel ? 'HKP ersetzt.' : 'HKP im Register angelegt – er wartet auf Freigabe.')
    : `Plan ${datei.kuerzel} ${r.nummer ?? ''} importiert – der Planer übernimmt ihn beim nächsten Öffnen.`)
})

async function loeschenFragen(p: PlanKarte) {
  const wer = `${p.patient || 'Ohne Namen'} (${p.kuerzel} ${planSchein(p)})`
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
  const namen = planFiltern(plaene, name, '')
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

const PLAN_SICHT = [
  { id: 'genehmigt', text: 'Genehmigte Pläne' },
  { id: 'nicht-genehmigt', text: 'Nicht genehmigte Pläne' },
  { id: 'abgerechnet', text: 'Abgerechnete Pläne' },
  { id: 'nicht-abgerechnet', text: 'Nicht abgerechnete Pläne' },
] as const

function planSichtLeiste(zahl: string): string {
  const kurz: Record<string, string> = {
    genehmigt: 'Genehmigt',
    'nicht-genehmigt': 'Offen',
    abgerechnet: 'Abgerechnet',
    'nicht-abgerechnet': 'Nicht abger.',
  }
  const knopf = (id: string, text: string) =>
    `<button type="button" class="chip${planSicht === id ? ' an' : ''}" data-sicht="${id}"><span class="chip-lang">${esc(text)}</span><span class="chip-kurz">${esc(kurz[id] || text)}</span></button>`
  return `<div class="listen-leiste plan-sicht" role="group" aria-label="Pläne" title="Genehmigung und Abrechnung kommen aus dem Praxisprogramm.">${PLAN_SICHT.map((e) => knopf(e.id, e.text)).join('')}<span class="listen-zahl">${zahl}</span></div>`
}

function auswahlKarte(patient: Stammdaten): string {
  const wer = [patient.vorname, patient.name].filter(Boolean).join(' ')
  const eintrag = (p: (typeof BEREICHE)[number]['planer'][number] | undefined) => {
    if (!p) return '<span class="wahl-leer"></span>'
    const basis = adresse(p, location)
    const url = basis && neuUrl(basis, patient)
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
          <h2>Welcher Plan für ${esc(wer)}?${patient.geburtsdatum ? `<small>geb. ${esc(patient.geburtsdatum.split('-').reverse().join('.'))}</small>` : ''}</h2>
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
        ${ich.konto.admin ? verbundBlock() : ''}
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

const CLARA_WERKZEUG: Record<string, string> = {
  search_patient: 'Patient suchen',
  hkp_befund: 'Befund',
  hkp_plan_rechnen: 'Plan rechnen',
  hkp_fall_rechnen: 'Rechnung rechnen',
  hkp_plan_ablegen: 'Plan ablegen',
  hkp_overview: 'Pläne lesen',
  hkp_details: 'Plan lesen',
  hkp_position_check: 'Position prüfen',
  hkp_position_change: 'Position ändern',
  hkp_ausfuehrung_aendern: 'Ausführung ändern',
  undo_last_action: 'Rückgängig',
  abrechnung_frage: 'Abrechnung',
  welt_wissen: 'Recherche',
}
const CLARA_NEU_LADEN = new Set(['hkp_befund', 'hkp_plan_ablegen', 'hkp_ausfuehrung_aendern', 'hkp_position_change', 'undo_last_action'])

function claraSitzung(): string {
  const key = 'planr-clara-sitzung'
  let id = sessionStorage.getItem(key) || ''
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) {
    id = `c${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`.slice(0, 40)
    sessionStorage.setItem(key, id)
  }
  return id
}

function claraSpalte(): HTMLElement {
  let el = document.getElementById('clara-spalte')
  if (!el) {
    el = document.createElement('div')
    el.id = 'clara-spalte'
    const verlauf = document.createElement('div')
    verlauf.id = 'clara-verlauf'
    const agenten = document.createElement('div')
    agenten.id = 'clara-agenten'
    const ruhe = document.createElement('article')
    ruhe.id = 'clara-ruhe'
    ruhe.className = 'agent fertig'
    const kopf = document.createElement('div')
    kopf.className = 'agent-kopf'
    const led = document.createElement('i')
    led.className = 'led'
    const nameEl = document.createElement('strong')
    nameEl.textContent = 'Clara'
    kopf.append(led, nameEl)
    ruhe.append(kopf)
    const zu = document.createElement('button')
    zu.type = 'button'
    zu.className = 'clara-zu'
    zu.dataset.claraZu = '1'
    zu.setAttribute('aria-label', 'Antworten schließen')
    zu.textContent = '×'
    el.append(zu, verlauf, agenten, ruhe)
  }
  return el
}

let kastenNr = 0

/** Befund im Chat: dieselbe Karte wie in der Liste, nur zum Ansehen. */
function befundImChat(schema: Record<string, string>) {
  document.querySelector('.befund-blick')?.remove()
  const dlg = document.createElement('div')
  dlg.className = 'wahl befund-blick'
  dlg.setAttribute('role', 'dialog')
  dlg.setAttribute('aria-modal', 'true')
  dlg.setAttribute('aria-label', 'Befund')
  const zelle = (z: string) => {
    const c = schema[z] || ''
    const klasse = c === 'f' ? 'bz-zahn fehlt' : 'bz-zahn'
    return `<div class="${klasse}"><b>${esc(c) || '&nbsp;'}</b></div>`
  }
  const nummern = (zs: string[]) => zs.map((z) => `<span class="bz-nr">${z}</span>`).join('')
  dlg.innerHTML = `
    <button type="button" class="wahl-grund" data-zu aria-label="Schließen"></button>
    <div class="wahl-karte befund-karte">
      <div class="wahl-kopf">
        <h2>Befund (01)</h2>
        <button type="button" data-zu aria-label="Schließen">✕</button>
      </div>
      <div class="bz-schema">
        <div class="bz-reihe">${OK.map(zelle).join('')}</div>
        <div class="bz-reihe nr">${nummern(OK)}</div>
        <div class="bz-mitte"></div>
        <div class="bz-reihe nr">${nummern(UK)}</div>
        <div class="bz-reihe">${UK.map(zelle).join('')}</div>
      </div>
    </div>`
  const zu = () => {
    dlg.remove()
    document.removeEventListener('keydown', taste)
  }
  const taste = (ev: KeyboardEvent) => { if (ev.key === 'Escape') zu() }
  document.addEventListener('keydown', taste)
  dlg.querySelectorAll('[data-zu]').forEach((k) => k.addEventListener('click', zu))
  document.body.append(dlg)
}

function claraKasten(roh: { art?: string; titel?: string; hinweis?: string; text?: string; gruppen?: { frage?: string; punkte?: unknown; mehrere?: boolean }[] }) {
  const verlauf = document.getElementById('clara-verlauf')
  if (!verlauf) return
  const art = roh.art === 'befund' || roh.art === 'wahl' ? roh.art : ''
  if (!art) return
  const gruppen: KastenGruppe[] = []
  for (const g of roh.gruppen || []) {
    const punkte = Array.isArray(g?.punkte)
      ? g.punkte.filter((p): p is string => typeof p === 'string' && !!p.trim()).slice(0, 8)
      : []
    if (!punkte.length) continue
    gruppen.push({ frage: String(g?.frage || '').slice(0, 180), punkte, mehrere: !!g?.mehrere })
  }
  const text = typeof roh.text === 'string' ? roh.text.slice(0, 1200) : ''
  if (art === 'befund' && !text) return
  if (art === 'wahl' && !gruppen.length) return
  const kasten: Kasten = {
    art,
    titel: String(roh.titel || (art === 'befund' ? 'Befund' : 'Frage')).slice(0, 40),
    hinweis: String(roh.hinweis || '').slice(0, 180),
    text,
    gruppen,
  }
  const schema = kasten.art === 'befund' ? schemaVon(kasten.text || '') : {}
  if (Object.keys(schema).length > 0) {
    befundImChat(schema)
    return
  }
  const n = ++kastenNr
  const el = document.createElement('form')
  el.className = 'kasten'
  const kopf = document.createElement('h3')
  kopf.textContent = kasten.titel
  el.append(kopf)
  if (kasten.hinweis) {
    const hinweis = document.createElement('p')
    hinweis.textContent = kasten.hinweis
    el.append(hinweis)
  }
  let feld: HTMLTextAreaElement | null = null
  if (kasten.art === 'befund') {
    feld = document.createElement('textarea')
    feld.value = kasten.text || ''
    feld.rows = 4
    el.append(feld)
  }
  const wahlen: HTMLInputElement[][] = []
  for (const [i, g] of (kasten.gruppen || []).entries()) {
    const satz = document.createElement('fieldset')
    const legende = document.createElement('legend')
    legende.textContent = g.frage
    satz.append(legende)
    const inputs: HTMLInputElement[] = []
    for (const punkt of g.punkte) {
      const label = document.createElement('label')
      const input = document.createElement('input')
      input.type = g.mehrere ? 'checkbox' : 'radio'
      input.name = `kasten-${n}-${i}`
      input.value = punkt
      const span = document.createElement('span')
      span.textContent = punkt
      label.append(input, span)
      satz.append(label)
      inputs.push(input)
    }
    wahlen.push(inputs)
    el.append(satz)
  }
  const fehler = document.createElement('p')
  fehler.className = 'kasten-fehler'
  fehler.hidden = true
  const knopf = document.createElement('button')
  knopf.type = 'submit'
  knopf.textContent = 'Übernehmen'
  el.append(fehler, knopf)
  el.addEventListener('submit', (ev) => {
    ev.preventDefault()
    if (claraLaeuft || el.classList.contains('erledigt')) return
    const gewaehlt = wahlen.map((inputs) => inputs.filter((input) => input.checked).map((input) => input.value))
    const satz = kastenSatz(kasten, feld?.value || '', gewaehlt)
    if (!satz) {
      fehler.hidden = false
      fehler.textContent = kasten.art === 'befund' && !(feld?.value || '').trim()
        ? 'Der Befund ist leer.'
        : 'Bitte eine Möglichkeit anklicken.'
      return
    }
    el.classList.add('erledigt')
    feld?.setAttribute('readonly', 'true')
    el.querySelectorAll<HTMLButtonElement>('.bz-zahn, .bz-wahl button').forEach((knopfZahn) => { knopfZahn.disabled = true })
    for (const inputs of wahlen) for (const input of inputs) input.disabled = true
    knopf.disabled = true
    void claraSenden(satz)
  })
  verlauf.append(el)
  verlauf.scrollTop = verlauf.scrollHeight
  if (planBlick) {
    agentFenster(true)
    claraAufklappen()
  }
}

type RechnungZeile = { text?: string; summe?: boolean }

// Zeilen kommen aus der MAS-Karte als "Teil · Position · Anzahl · Betrag" bzw. "Teil · Gesamt 113,43 €".
function claraRechnung(roh: { tag?: string; titel?: string; untertitel?: string; zeilen?: unknown; fuss?: string }) {
  const verlauf = document.getElementById('clara-verlauf')
  if (!verlauf) return
  const zeilen = Array.isArray(roh.zeilen)
    ? roh.zeilen.filter((z): z is RechnungZeile => !!z && typeof (z as RechnungZeile).text === 'string').slice(0, 30)
    : []
  if (!zeilen.length) return
  const el = document.createElement('article')
  el.className = 'kasten rechnung'
  const kopf = document.createElement('h3')
  kopf.textContent = String(roh.titel || 'Rechnung').slice(0, 80)
  if (roh.tag) {
    const tag = document.createElement('span')
    tag.className = 'rechnung-tag'
    tag.textContent = String(roh.tag).slice(0, 40)
    kopf.append(tag)
  }
  el.append(kopf)
  if (roh.untertitel) {
    const unter = document.createElement('p')
    unter.textContent = String(roh.untertitel).slice(0, 160)
    el.append(unter)
  }
  const liste = document.createElement('div')
  liste.className = 'rechnung-zeilen'
  let teil = ''
  for (const z of zeilen) {
    const stuecke = String(z.text).split(' · ')
    const name = stuecke.length > 1 ? stuecke[0] : ''
    if (name && name !== teil) {
      teil = name
      const h = document.createElement('div')
      h.className = 'rechnung-teil'
      h.textContent = name
      liste.append(h)
    }
    const rest = name ? stuecke.slice(1) : stuecke
    let links = rest.join(' · ')
    let betrag = ''
    if (z.summe) {
      const m = links.match(/^(.*\S)\s+(-?[\d.]+,\d{2}\s€)$/)
      if (m) { links = m[1]; betrag = m[2] }
    } else if (rest.length > 1 && rest[rest.length - 1].endsWith('€')) {
      betrag = rest[rest.length - 1]
      links = rest.slice(0, -1).join(' · ')
    }
    const zeile = document.createElement('div')
    zeile.className = z.summe ? 'rechnung-zeile summe' : 'rechnung-zeile'
    const text = document.createElement('span')
    text.textContent = links
    const geld = document.createElement('b')
    geld.textContent = betrag
    zeile.append(text, geld)
    liste.append(zeile)
  }
  el.append(liste)
  if (roh.fuss) {
    const fuss = document.createElement('p')
    fuss.className = 'rechnung-fuss'
    fuss.textContent = String(roh.fuss).slice(0, 160)
    el.append(fuss)
  }
  verlauf.append(el)
  verlauf.scrollTop = verlauf.scrollHeight
  if (planBlick) {
    agentFenster(true)
    claraAufklappen()
  }
}

function claraBlase(rolle: 'ich' | 'clara', text: string, ersetzen = false) {
  const verlauf = document.getElementById('clara-verlauf')
  if (!verlauf) return
  let el = ersetzen ? verlauf.querySelector<HTMLElement>(':scope > .blase.clara.aktuell') : null
  if (!el) {
    el = document.createElement('p')
    el.className = `blase ${rolle}${ersetzen ? ' aktuell' : ''}`
    verlauf.append(el)
  }
  el.textContent = text
  verlauf.scrollTop = verlauf.scrollHeight
}

function claraAgentWeg() {
  document.getElementById('clara-agenten')?.replaceChildren()
}

function claraAgent(stand: 'wartet' | 'fertig', titel: string, zeile: string) {
  const box = document.getElementById('clara-agenten')
  if (!box) return
  box.replaceChildren()
  const karte = document.createElement('article')
  karte.className = `agent ${stand}`
  const kopf = document.createElement('div')
  kopf.className = 'agent-kopf'
  const led = document.createElement('i')
  led.className = 'led'
  const nameEl = document.createElement('strong')
  nameEl.textContent = titel
  const meta = document.createElement('span')
  meta.textContent = zeile
  kopf.append(led, nameEl, meta)
  karte.append(kopf)
  if (stand === 'wartet') {
    const balken = document.createElement('div')
    balken.className = 'balken'
    balken.append(document.createElement('i'))
    karte.append(balken)
  }
  box.append(karte)
}

function agentZiehen(spalte: HTMLElement) {
  if (spalte.dataset.zieh) return
  spalte.dataset.zieh = '1'
  let zug: { dx: number; dy: number } | null = null
  spalte.addEventListener('mousedown', (ev) => {
    if (!document.body.classList.contains('plan-offen') || !spalte.classList.contains('clara-auf') || ev.button !== 0) return
    const ziel = ev.target as HTMLElement
    if (ziel.closest('button, a, input, textarea, .blase, .kasten')) return
    const r = spalte.getBoundingClientRect()
    zug = { dx: ev.clientX - r.left, dy: ev.clientY - r.top }
    spalte.classList.add('zieht')
    ev.preventDefault()
  })
  window.addEventListener('mousemove', (ev) => {
    if (!zug) return
    const x = Math.max(8, Math.min(ev.clientX - zug.dx, window.innerWidth - spalte.offsetWidth - 8))
    const y = Math.max(8, Math.min(ev.clientY - zug.dy, window.innerHeight - spalte.offsetHeight - 8))
    spalte.style.left = `${x}px`
    spalte.style.top = `${y}px`
    spalte.style.bottom = 'auto'
    spalte.style.right = 'auto'
  })
  window.addEventListener('mouseup', () => {
    zug = null
    spalte.classList.remove('zieht')
  })
}

function agentFenster(zeigen: boolean) {
  const spalte = claraSpalte()
  spalte.classList.toggle('agent-weg', !zeigen)
  if (zeigen) sessionStorage.removeItem('planr-agent-weg')
  else sessionStorage.setItem('planr-agent-weg', '1')
  if (zeigen) claraBuendig()
}

/** Einzeilige Clara sitzt auf derselben Kante wie die KI-Zeile. Aufgeklappt wächst sie nach oben. */
function claraBuendig() {
  const spalte = document.getElementById('clara-spalte')
  const zeile = document.getElementById('clara-zeile')
  if (!spalte || !zeile || !document.body.classList.contains('plan-offen') || spalte.classList.contains('agent-weg')) return
  const r = zeile.getBoundingClientRect()
  if (window.matchMedia('(max-width: 800px)').matches) {
    const rand = 10
    spalte.style.left = `${rand}px`
    spalte.style.right = `${rand}px`
    spalte.style.top = 'auto'
    spalte.style.width = 'auto'
    spalte.style.bottom = `${Math.max(8, window.innerHeight - r.top + 8)}px`
    if (spalte.classList.contains('clara-auf')) {
      spalte.style.height = 'auto'
      spalte.style.maxHeight = `${Math.max(180, r.top - 12)}px`
    } else {
      spalte.style.height = '0'
      spalte.style.maxHeight = '0'
    }
    return
  }
  const links = 16
  spalte.style.left = `${links}px`
  spalte.style.top = 'auto'
  spalte.style.right = 'auto'
  spalte.style.bottom = `${Math.max(0, window.innerHeight - r.bottom)}px`
  spalte.style.width = `${Math.max(160, r.left - links - 8)}px`
  if (spalte.classList.contains('clara-auf')) {
    spalte.style.height = 'auto'
    spalte.style.maxHeight = `${Math.max(r.height, r.top - 12)}px`
  } else {
    spalte.style.height = `${r.height}px`
    spalte.style.maxHeight = ''
  }
}

function claraMobil(): boolean {
  return window.matchMedia('(max-width: 840px)').matches
}

/** Handy: Antworten als Karte über der Chatzeile. Tippen auf die Zeile zeigt sie, Tippen daneben blendet sie aus. */
function claraLesen(an: boolean) {
  if (!claraMobil()) {
    document.body.classList.remove('clara-lesen')
    return
  }
  document.body.classList.toggle('clara-lesen', an)
  if (!an) return
  const verlauf = document.getElementById('clara-verlauf')
  if (verlauf) verlauf.scrollTop = verlauf.scrollHeight
}

function claraOverlay() {
  if (document.body.dataset.claraOverlay) return
  document.body.dataset.claraOverlay = '1'
  document.addEventListener('pointerdown', (ev) => {
    if (!claraMobil()) return
    const ziel = ev.target instanceof Node ? ev.target : null
    const zeile = document.getElementById('clara-zeile')
    const spalte = document.getElementById('clara-spalte')
    const getroffen = ziel instanceof Element ? ziel : ziel?.parentElement ?? null
    if (getroffen?.closest('[data-clara-zu]')) {
      claraLesen(false)
      return
    }
    if (ziel && ((zeile && zeile.contains(ziel)) || (spalte && spalte.contains(ziel)))) {
      claraLesen(true)
      return
    }
    claraLesen(false)
  }, true)
  window.addEventListener('resize', () => {
    if (!claraMobil()) document.body.classList.remove('clara-lesen')
    const spalte = document.getElementById('clara-spalte')
    if (!spalte || document.body.classList.contains('plan-offen')) return
    if (claraMobil()) document.body.append(spalte)
    else document.querySelector('.filter')?.append(spalte)
  })
}

function claraAufklappen() {
  if (!planBlick) return
  const spalte = claraSpalte()
  if (spalte.classList.contains('agent-weg')) return
  spalte.classList.add('clara-auf')
  claraBuendig()
}

function claraEinklappen() {
  const spalte = document.getElementById('clara-spalte')
  if (spalte?.classList.contains('clara-auf')) {
    spalte.classList.remove('clara-auf')
    claraBuendig()
  }
  claraLesen(false)
}

function planRahmenLauschen(frame: HTMLIFrameElement) {
  const an = () => {
    try {
      const win = frame.contentWindow as (Window & { __planrBlick?: boolean }) | null
      if (!win || win.__planrBlick) return
      win.__planrBlick = true
      win.addEventListener('pointerdown', claraEinklappen, true)
      win.addEventListener('scroll', claraEinklappen, true)
    } catch {
      /* andere Herkunft: der Plan meldet Klick und Scroll selbst */
    }
  }
  if (!frame.dataset.blick) {
    frame.dataset.blick = '1'
    frame.addEventListener('load', an)
  }
  an()
}

let claraPlan = ''

function claraLeiste() {
  document.body.classList.add('planr-app')
  document.body.classList.toggle('plan-offen', !!planBlick)
  const spalte = claraSpalte()
  if (planBlick || claraMobil()) document.body.append(spalte)
  else document.querySelector('.filter')?.append(spalte)
  if (planBlick && sessionStorage.getItem('planr-agent-weg') === '1') spalte.classList.add('agent-weg')
  else spalte.classList.remove('agent-weg')
  agentZiehen(spalte)
  const planKey = planBlick ? `${planBlick.modul}~${planBlick.nummer}` : ''
  if (planKey !== claraPlan) {
    claraPlan = planKey
    spalte.classList.remove('clara-auf')
  }
  if (!planBlick) {
    spalte.style.left = ''
    spalte.style.top = ''
    spalte.style.right = ''
    spalte.style.bottom = ''
    spalte.style.width = ''
    spalte.style.height = ''
    spalte.style.maxHeight = ''
  }
  const form = document.getElementById('clara-zeile') as HTMLFormElement | null
  const slot = document.getElementById('clara-slot')
  if (!form || !slot) return
  slot.append(form)
  form.hidden = false
  const zurueck = form.querySelector<HTMLButtonElement>('[data-liste]')
  if (zurueck) zurueck.hidden = !planBlick
  if (planBlick) requestAnimationFrame(claraBuendig)
  claraOverlay()
  if (form.dataset.an) return
  form.dataset.an = '1'
  const feld = form.querySelector('input')
  const historie: string[] = []
  let zeiger = -1
  let entwurf = ''
  feld?.addEventListener('focus', () => {
    claraAufklappen()
    claraLesen(true)
  })
  feld?.addEventListener('input', () => {
    if (zeiger < 0) entwurf = feld.value
    claraAufklappen()
  })
  feld?.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return
    if (ev.altKey || ev.ctrlKey || ev.metaKey || !feld) return
    if (ev.key === 'ArrowUp') {
      if (!historie.length) return
      ev.preventDefault()
      if (zeiger < 0) entwurf = feld.value
      const naechster = zeiger < 0 ? historie.length - 1 : Math.max(0, zeiger - 1)
      zeiger = naechster
      feld.value = historie[zeiger]
    } else {
      if (zeiger < 0) return
      ev.preventDefault()
      zeiger += 1
      if (zeiger >= historie.length) {
        zeiger = -1
        feld.value = entwurf
      } else feld.value = historie[zeiger]
    }
    const ende = feld.value.length
    feld.setSelectionRange(ende, ende)
  })
  form.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const feld = form.querySelector('input')
    const text = feld?.value.trim() || ''
    if (!text || claraLaeuft) return
    if (historie[historie.length - 1] !== text) historie.push(text)
    zeiger = -1
    entwurf = ''
    if (feld) feld.value = ''
    void claraSenden(text)
  })
  zurueck?.addEventListener('click', planSchliessen)
}

/** „öffne den Plan Zaharia“ öffnet die Kachel. null = kein Öffnen-Satz. */
function planPerNamenOeffnen(text: string): string | null {
  const nadel = planNameGesucht(text)
  if (!nadel) return null
  const worte = nadel.toLowerCase().split(/\s+/).filter(Boolean)
  const treffer = plaene.filter((p) => {
    const hay = `${p.patient} ${planSchein(p)} ${p.nummer}`.toLowerCase()
    return worte.every((w) => hay.includes(w))
  })
  if (!treffer.length) return `Ich finde keinen Plan zu „${nadel}“.`
  if (treffer.length > 1) {
    const liste = treffer.slice(0, 4).map((p) => `${p.patient}, ${planSchein(p)}, ${STATUS[p.status] || p.status}`).join('; ')
    return `Dazu gibt es mehrere Pläne: ${liste}. Welchen soll ich öffnen?`
  }
  const p = treffer[0]
  const url = planUrl(p)
  if (!url) return `Den Plan von ${p.patient} kann ich von hier nicht öffnen.`
  const status = STATUS[p.status] || p.status
  if (planBlick?.modul === p.modul && planBlick.nummer === p.nummer) return `Der Plan von ${p.patient} ist schon offen (${status}).`
  planGespraechVergessen()
  planLeisteLeeren()
  planBlick = { url, titel: p.patient, nummer: p.nummer, modul: p.modul }
  urlSetzen('push')
  zeichnen()
  return `Ich öffne den Plan von ${p.patient} (${status}).`
}

async function claraSenden(text: string) {
  claraLaeuft = true
  if (planBlick) {
    agentFenster(true)
    claraAufklappen()
  }
  document.querySelectorAll('.blase.clara.aktuell').forEach((el) => el.classList.remove('aktuell'))
  claraBlase('ich', text)
  claraAgent('wartet', 'Clara', 'wartet')
  const plan = planBlick ? { patient: planBlick.titel, nummer: planBlick.nummer, modul: planBlick.modul } : undefined
  let gesagt = ''
  let neuLaden = false
  try {
    const geoeffnet = planPerNamenOeffnen(text)
    if (geoeffnet) {
      claraBlase('clara', geoeffnet, true)
      claraAgent('fertig', 'Plan', 'offen')
      return
    }
    const fenster = planBlick ? document.querySelector<HTMLIFrameElement>('.plan-rahmen')?.contentWindow : null
    if (fenster && planBlick) {
      const antwort = await planArbeit(fenster, text, `${planBlick.modul}~${planBlick.nummer}`)
      if (antwort) {
        claraBlase('clara', antwort.text, true)
        claraAgent('fertig', 'Plan', 'fertig')
        return
      }
    }
    const r = await fetch('/api/clara/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, sitzung: claraSitzung(), plan }),
    })
    if (!r.ok || !r.body) throw new Error('weg')
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let rest = ''
    const zug = (z: string) => {
      if (!z.trim()) return
      const ev = JSON.parse(z) as {
        type?: string; werkzeug?: string; stand?: string; text?: string
        art?: string; titel?: string; hinweis?: string
        gruppen?: { frage?: string; punkte?: unknown; mehrere?: boolean }[]
        tag?: string; untertitel?: string; zeilen?: unknown; fuss?: string
      }
      const titel = CLARA_WERKZEUG[ev.werkzeug || ''] || ev.werkzeug || 'Clara'
      if (ev.type === 'agent' && ev.stand === 'wartet') claraAgent('wartet', titel, 'wartet')
      else if (ev.type === 'agent' && ev.stand === 'fertig') {
        claraAgent('fertig', titel, 'fertig')
        if (CLARA_NEU_LADEN.has(ev.werkzeug || '')) neuLaden = true
      } else if (ev.type === 'box') {
        claraKasten(ev)
      } else if (ev.type === 'rechnung') {
        claraRechnung(ev)
      } else if (ev.type === 'sage' && ev.text) {
        gesagt = ev.text
        claraBlase('clara', gesagt, true)
        claraAgentWeg()
        if (neuLaden && /erledigt:|ist angelegt/i.test(gesagt)) planFrischen = true
        else { neuLaden = false; planFrischen = false }
      } else if (ev.type === 'fehler') {
        gesagt = ev.text || 'Das hat gerade nicht geklappt.'
        claraBlase('clara', gesagt, true)
        claraAgent('fertig', 'Clara', 'nicht erreichbar')
      }
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      rest += dec.decode(value, { stream: true })
      const zeilen = rest.split('\n')
      rest = zeilen.pop() || ''
      for (const z of zeilen) zug(z)
    }
    zug(rest)
    if (!gesagt) {
      claraBlase('clara', 'Dazu habe ich gerade nichts gesagt.', true)
      claraAgent('fertig', 'Clara', 'fertig')
    }
  } catch {
    if (!gesagt) {
      claraBlase('clara', 'Clara ist gerade nicht erreichbar.', true)
      claraAgent('fertig', 'Clara', 'nicht erreichbar')
    }
  } finally {
    claraLaeuft = false
    document.querySelector('#clara-agenten .agent.wartet')?.remove()
    if (neuLaden) void laden().catch(() => {})
  }
}

async function fotoHochladen(datei: File) {
  if (!/^image\/(jpeg|png|webp)$/.test(datei.type)) {
    melden('Bitte ein Foto als JPG, PNG oder WebP.')
    return
  }
  try {
    const blob = await fotoZuschneiden(datei)
    const r = await fetch('/api/profil/foto', { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
    const d = await r.json().catch(() => ({})) as { meldung?: string }
    if (!r.ok) { melden(d.meldung || 'Das Foto konnte nicht gespeichert werden.'); return }
    ich.foto = true
    fotoStand = Date.now()
    zeichnen()
  } catch {
    melden('Dieses Bild ließ sich nicht verwenden.')
  }
}

async function fotoEntfernen() {
  const r = await fetch('/api/profil/foto', { method: 'DELETE' }).catch(() => null)
  if (!r?.ok) { melden('Das Foto konnte nicht entfernt werden.'); return }
  ich.foto = false
  zeichnen()
}

/** Kopfzeile des offenen Plans nachziehen, ohne den Plan neu zu laden. */
function planChrome(): boolean {
  const rahmen = document.querySelector<HTMLIFrameElement>('.plan-rahmen')
  if (!planBlick || !rahmen || rahmen.dataset.url !== planBlick.url) return false
  const nav = document.querySelector('.plan-punkte')
  if (!nav) return false
  document.body.classList.add('plan-offen')
  nav.innerHTML = planPunkte.map((p) => `<button type="button" class="plan-punkt${p.id === planAktiv ? ' aktiv' : ''}" data-punkt="${esc(p.id)}">${esc(p.text)}</button>`).join('')
  nav.querySelectorAll<HTMLButtonElement>('[data-punkt]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.punkt || ''
    if (!id) return
    planAktiv = id
    rahmen.contentWindow?.postMessage({ type: 'planr-reiter', id }, '*')
    planChrome()
  }))
  const offen = plaene.find((p) => p.modul === planBlick!.modul && p.nummer === planBlick!.nummer)
  const versendet = offen?.versendet || ''
  let mail = document.querySelector<HTMLButtonElement>('[data-versand]')
  if (planVersand && !mail) {
    nav.insertAdjacentHTML('afterend', `<button type="button" class="aktion versand plan-mail${versendet ? ' versendet' : ''}" data-versand title="${esc(versendet || 'Per E-Mail versenden')}" aria-label="Per E-Mail versenden">${versendet ? BRIEF_GESENDET : BRIEF}</button>`)
    mail = document.querySelector<HTMLButtonElement>('[data-versand]')
    mail?.addEventListener('click', () => rahmen.contentWindow?.postMessage({ type: 'planr-versand' }, '*'))
  } else if (!planVersand && mail) mail.remove()
  else if (mail) {
    mail.classList.toggle('versendet', !!versendet)
    mail.title = versendet || 'Per E-Mail versenden'
    mail.innerHTML = versendet ? BRIEF_GESENDET : BRIEF
  }
  return true
}

function zeichnen() {
  if (!ich?.konto) return
  const frisch = planFrischen
  planFrischen = false
  if (!frisch && planChrome()) return
  document.body.classList.toggle('plan-offen', !!planBlick)
  const gespraech = document.getElementById('clara-spalte')
  if (gespraech) document.body.append(gespraech)
  const leiste = document.getElementById('clara-zeile') as HTMLFormElement | null
  if (leiste) {
    leiste.hidden = true
    document.body.append(leiste)
  }
  const alterRahmen = document.querySelector<HTMLIFrameElement>('.plan-rahmen')
  const rahmenBleibt = !frisch && alterRahmen && planBlick && alterRahmen.dataset.url === planBlick.url ? alterRahmen : null
  if (rahmenBleibt) document.body.append(rahmenBleibt)
  const sichtbar = planFiltern(plaene, name, tag)
  const gesamt = plaene.filter((p) => p.status !== 'verworfen').length
  const planZahl = sichtbar.length === gesamt
    ? `${gesamt} ${gesamt === 1 ? 'Plan' : 'Pläne'}`
    : `${sichtbar.length} von ${gesamt}`
  const app = document.querySelector<HTMLDivElement>('#app')!
  const fokus = document.activeElement === document.getElementById('name')
  const cursor = fokus ? (document.getElementById('name') as HTMLInputElement).selectionStart : null
  const planArt = planBlick ? (planerZuModul(planBlick.modul)?.titel || 'Plan') : ''
  const offen = planBlick ? plaene.find((p) => p.modul === planBlick!.modul && p.nummer === planBlick!.nummer) : undefined
  const versendet = offen?.versendet || ''
  const punkte = planBlick ? planPunkte.map((p) => `<button type="button" class="plan-punkt${p.id === planAktiv ? ' aktiv' : ''}" data-punkt="${esc(p.id)}">${esc(p.text)}</button>`).join('') : ''
  app.innerHTML = `
  <header class="kopf">
    <div class="marke">
      ${planBlick
        ? `<button type="button" class="plan-nav" data-nav="zurueck" title="Zurück" aria-label="Zurück">‹</button><button type="button" class="marke-heim" data-start title="Zur Übersicht"><span class="logo">${logo()}</span><div><h1>PlanR</h1><p>${esc(planArt)}</p></div></button><button type="button" class="plan-nav" data-nav="vor" title="Vor" aria-label="Vor">›</button>`
        : `<span class="logo">${logo()}</span><div><h1>PlanR</h1><p>Alle gespeicherten Pläne</p></div>`}
      </div>
      <div class="kopf-rechts">
        ${planBlick ? `<nav class="plan-punkte">${punkte}</nav>${planVersand ? `<button type="button" class="aktion versand plan-mail${versendet ? ' versendet' : ''}" data-versand title="${esc(versendet || 'Per E-Mail versenden')}" aria-label="Per E-Mail versenden">${versendet ? BRIEF_GESENDET : BRIEF}</button>` : ''}` : ''}
        <div class="kopf-aktionen">
        ${ich.konto.admin ? `<button type="button" class="import-knopf${agent?.verbunden ? '' : ' hervor'}" data-einrichtung title="Praxissystem verbinden: Bridge, Preise &amp; Positionen">${agent?.verbunden ? '' : '<i class="punkt"></i>'}<span>Einrichtung</span></button>` : ''}
        ${ich.clara === 'planr' ? `<button type="button" class="import-knopf" data-clara-dialog title="HKP-Assistentin: Name und Handy koppeln">${MIKRO}<span>${esc(assistentin)}</span></button>` : ''}
        <button type="button" class="neu-knopf mit-symbol" data-import-neu title="${pvsQuelle() ? `Patient in ${esc(pvsQuelle())} suchen: Befund ansehen, neuen Plan erstellen oder HKP übernehmen` : 'Patient suchen und neuen Plan erstellen'} – jeder Plan gehört zu einem Patienten">${LUPE}<span class="chip-lang">Patientensuche</span><span class="chip-kurz">Suche</span></button>
        </div>
        ${kontoMenu({ name: ich.konto.name || ich.konto.email, email: ich.konto.email, admin: ich.konto.admin, abo: aboText(ich), foto: `/api/profil/foto?v=${fotoStand}`, rechnungen: ich.konto.admin && ich.abo === 'planr' })}
    </div>
  </header>
    ${ich.praxen?.length === 0 ? '<p class="freischalt-hinweis">Sie sind angemeldet, aber noch keiner Praxis zugeordnet. Der Praxis-Admin schaltet Sie in PlanR unter Einstellungen → Benutzer frei.</p>' : ''}
    <div class="seite">
      <aside class="filter">
        <div class="filter-kopf">
        <label class="feld">Name
          <input id="name" type="search" placeholder="Patient oder Nummer" value="${esc(name)}" autocomplete="off">
        </label>
        <button type="button" class="datum-knopf" data-datum aria-expanded="${datumAuf ? 'true' : 'false'}">${MONATE[monat]} ${jahr}${tag ? ' · Tag gewählt' : ''}</button>
        <div class="kalender${datumAuf ? '' : ' zu'}">
        <div class="monat">
          <button type="button" data-monat="-1" aria-label="Vorheriger Monat">‹</button>
          <strong>${MONATE[monat]} ${jahr}</strong>
          <button type="button" data-monat="1" aria-label="Nächster Monat">›</button>
        </div>
        <div class="tage">${kalender()}</div>
        </div>
        </div>
      </aside>
  <main>
        ${planBlick
          ? `<iframe class="plan-rahmen" src="${esc(planBlick.url)}" data-url="${esc(planBlick.url)}" title="${esc(planBlick.titel)}"></iframe>`
          : `${planSichtLeiste(planZahl)}${sichtbar.length
          ? `<div class="liste" role="table">
              <div class="zeile kopfzeile" role="row">
                <span class="sp-art">Plan</span>
                <span class="sp-patient">Patient</span>
                <span class="sp-nr">Nummer</span>
                <span class="sp-status">Status</span>
                <span class="sp-betrag">Betrag</span>
                <span class="sp-zeit">Geändert</span>
                <span class="sp-termin">Termin</span>
                <span class="sp-aktionen"></span>
              </div>
              ${sichtbar.map(zeile).join('')}
            </div>`
          : '<p class="leer">Keine Pläne für diese Auswahl. Gespeicherte Pläne aus HKP, PAR, KB und den anderen Planern erscheinen hier.</p>'}`}
  </main>
      <div id="clara-slot"></div>
    </div>
    ${meldung ? `<div class="meldung" role="status"><span>${esc(meldung.text)}</span>${meldung.zurueck ? '<button type="button" data-zurueck>Rückgängig</button>' : ''}</div>` : ''}
    ${planBlick ? '' : terminPopup()}
    ${auswahl && neuFuer ? auswahlKarte(neuFuer) : ''}
    ${einstellungAuf ? einstellungKarte() : ''}
    ${persoenlichAuf ? persoenlichKarte({ name: ich.konto.name || ich.konto.email, email: ich.konto.email, admin: ich.konto.admin, foto: `/api/profil/foto?v=${fotoStand}`, eigen: !!ich.foto }) : ''}`
  const rahmen = app.querySelector<HTMLIFrameElement>('.plan-rahmen')
  if (rahmenBleibt && rahmen) rahmen.replaceWith(rahmenBleibt)
  const aktiverRahmen = rahmenBleibt ?? rahmen
  if (aktiverRahmen) planRahmenLauschen(aktiverRahmen)
  claraLeiste()
  app.querySelectorAll<HTMLAnchorElement>('a.sp-patient').forEach((a) => a.addEventListener('click', (ev) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
    ev.preventDefault()
    const naechster = {
      url: a.href,
      titel: (a.textContent || 'Plan').trim(),
      nummer: a.dataset.nummer || '',
      modul: a.dataset.modul || '',
    }
    if (planBlick?.url === naechster.url && planBlick.nummer === naechster.nummer) return
    planGespraechVergessen()
    planLeisteLeeren()
    planBlick = naechster
    urlSetzen('push')
    zeichnen()
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-loeschen]').forEach((b) => b.addEventListener('click', () => {
    const p = sichtbar[Number(b.dataset.loeschen)]
    if (p) void loeschenFragen(p)
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-vorgang-ende]').forEach((b) => b.addEventListener('click', () => {
    const p = sichtbar[Number(b.dataset.vorgangEnde)]
    if (p?.vorgang) void vorgangEnde(p)
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-befund]').forEach((b) => b.addEventListener('click', () => {
    const p = sichtbar[Number(b.dataset.befund)]
    if (p?.kennung) befundOeffnen(p.kennung, p.patient)
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((b) => b.addEventListener('click', () => {
    const p = sichtbar[Number(b.dataset.export)]
    if (p) void exportieren(p)
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-import]').forEach((b) => b.addEventListener('click', () => {
    const p = sichtbar[Number(b.dataset.import)]
    if (p) importWaehlen(p)
  }))
  app.querySelector<HTMLButtonElement>('[data-start]')?.addEventListener('click', planSchliessen)
  app.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((b) => b.addEventListener('click', () => {
    const r = b.dataset.nav === 'vor' ? 'vor' : 'zurueck'
    planNav(r)
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-punkt]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.punkt || ''
    if (!id) return
    planAktiv = id
    document.querySelector<HTMLIFrameElement>('.plan-rahmen')?.contentWindow?.postMessage({ type: 'planr-reiter', id }, '*')
    if (!planChrome()) zeichnen()
  }))
  app.querySelector<HTMLButtonElement>('[data-versand]')?.addEventListener('click', () => {
    document.querySelector<HTMLIFrameElement>('.plan-rahmen')?.contentWindow?.postMessage({ type: 'planr-versand' }, '*')
  })
  app.querySelector<HTMLButtonElement>('[data-import-neu]')!.addEventListener('click', () => {
    const ziel = pvsQuelle()
    const getrennt = !!ziel && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !agent?.verbunden
    patientensucheOeffnen({
      pvsName: ziel,
      pvsHinweis: !getrennt ? undefined : agent
        ? `Die PlanR-Bridge auf dem Praxisserver ist gerade nicht verbunden – die Suche in ${ziel} geht so nur direkt am Praxis-PC.`
        : `Die Suche in ${ziel} über das Internet braucht die PlanR-Bridge auf dem Praxisserver (Einrichtung → Bridge).`,
      planrPlaene,
      neuerPlan: neuerPlanFuer,
      befundOeffnen: befundPvs() ? (nr, titel) => befundOeffnen({ patient: nr }, titel) : undefined,
      dateiWaehlen: () => importWaehlen(null),
      geoeffnet: ausPvsOeffnen,
    })
  })
  app.querySelectorAll<HTMLImageElement>('img[data-avatar]').forEach((img) => img.addEventListener('error', () => img.remove()))
  app.querySelector<HTMLButtonElement>('[data-konto]')?.addEventListener('click', (ev) => {
    ev.stopPropagation()
    const menu = app.querySelector<HTMLElement>('.konto-menu')
    const auf = !!menu?.hasAttribute('hidden')
    menu?.toggleAttribute('hidden', !auf)
    app.querySelector('[data-konto]')?.setAttribute('aria-expanded', auf ? 'true' : 'false')
  })
  app.querySelector<HTMLButtonElement>('[data-persoenlich]')?.addEventListener('click', () => {
    persoenlichAuf = true
    auswahl = false
    zeichnen()
  })
  app.querySelectorAll<HTMLButtonElement>('[data-persoenlich-zu]').forEach((b) => b.addEventListener('click', () => {
    persoenlichAuf = false
    zeichnen()
  }))
  app.querySelector<HTMLInputElement>('[data-foto]')?.addEventListener('change', () => {
    const datei = app.querySelector<HTMLInputElement>('[data-foto]')?.files?.[0]
    if (datei) void fotoHochladen(datei)
  })
  app.querySelector<HTMLButtonElement>('[data-foto-weg]')?.addEventListener('click', () => { void fotoEntfernen() })
  app.querySelector<HTMLButtonElement>('[data-einstellungen]')!.addEventListener('click', () => {
    entwurf = einstellungen
    einstellungAuf = true
    persoenlichAuf = false
    auswahl = false
    urlSetzen('push')
    zeichnen()
    void katalogLaden().then(() => { if (einstellungAuf && !katalogLaeuft) zeichnen() })
    if (ich.konto.admin) void benutzerLaden().then((b) => { benutzer = b; if (einstellungAuf) zeichnen() })
    if (ich.konto.admin) void verbundLaden().then(() => { if (einstellungAuf) zeichnen() })
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
    verbundVerdrahten(form, zeichnen, melden)
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
    filterSetzen()
  })
  if (fokus) {
    feld.focus()
    if (cursor != null) feld.setSelectionRange(cursor, cursor)
  }
  app.querySelector<HTMLButtonElement>('[data-datum]')?.addEventListener('click', () => {
    datumAuf = !datumAuf
    zeichnen()
  })
  app.querySelectorAll<HTMLButtonElement>('[data-monat]').forEach((b) => b.addEventListener('click', () => {
    monat += Number(b.dataset.monat)
    if (monat < 0) { monat = 11; jahr -= 1 }
    if (monat > 11) { monat = 0; jahr += 1 }
    zeichnen()
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-tag]').forEach((b) => b.addEventListener('click', () => {
    tag = tag === b.dataset.tag ? '' : (b.dataset.tag || '')
    datumAuf = false
    filterSetzen()
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-sicht]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.sicht || ''
    planSicht = planSicht === id ? '' : id
    urlSetzen('replace')
    zeichnen()
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-termin]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    void terminOeffnen(b.dataset.termin || '', b.dataset.nummer || '')
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-termin-zu]').forEach((b) => b.addEventListener('click', () => { terminBlick = null; stammLauf += 1; slotLauf += 1; zeichnen() }))
  app.querySelectorAll<HTMLButtonElement>('[data-grund]').forEach((b) => b.addEventListener('click', () => {
    if (!terminBlick?.kalender || terminBlick.laden) return
    terminBlick.grund = b.dataset.grund === 'start' ? 'start' : 'besprechung'
    terminBlick.motivId = ''
    void terminSlots()
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-dauer]').forEach((b) => b.addEventListener('click', () => {
    if (!terminBlick?.kalender || terminBlick.laden) return
    terminBlick.dauer = Number(b.dataset.dauer) || 30
    terminBlick.motivId = ''
    void terminSlots()
  }))
  app.querySelector<HTMLSelectElement>('[data-behandler]')?.addEventListener('change', (ev) => {
    if (!terminBlick?.kalender || terminBlick.laden) return
    terminBlick.calendarId = (ev.target as HTMLSelectElement).value
    terminBlick.motivId = ''
    void terminSlots()
  })
  app.querySelector<HTMLSelectElement>('[data-motiv]')?.addEventListener('change', (ev) => {
    if (!terminBlick?.kalender || terminBlick.laden) return
    terminBlick.motivId = (ev.target as HTMLSelectElement).value
    void terminSlots()
  })
  app.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach((b) => b.addEventListener('click', () => { void terminBuchen(b.dataset.slot || '') }))
  app.querySelectorAll<HTMLButtonElement>('[data-wahl-zu]').forEach((b) => b.addEventListener('click', auswahlSchliessen))
  app.querySelector<HTMLButtonElement>('[data-bridge-laden]')?.addEventListener('click', () => { auswahlSchliessen(); void einrichtungZeigen(true) })
}

async function terminOeffnen(modul: string, nummer: string) {
  const p = plaene.find((x) => x.modul === modul && x.nummer === nummer && !x.vorgang)
  if (!p) return
  const lauf = ++stammLauf
  terminBlick = {
    modul, nummer, name: p.patient || 'Ohne Namen', laden: true, kalender: kalenderErlaubt(ich.abo, ich.clara),
    telefon: '', email: '', vorname: '', nachname: '', anrede: '', behandler: [], motive: [],
    grund: 'besprechung', dauer: 30, calendarId: '', motivId: '', slots: [], minuten: 30, slotsLaden: false, fehler: '',
  }
  zeichnen()
  try {
    const r = await fetch(`/api/termine?modul=${encodeURIComponent(modul)}&nummer=${encodeURIComponent(nummer)}`, { cache: 'no-store' })
    const d = await r.json() as { ok?: boolean; kalender?: boolean; stamm?: { name?: string; telefon?: string; email?: string; vorname?: string; nachname?: string; anrede?: string }; behandler?: TerminBehandler[]; motive?: TerminMotiv[]; meldung?: string }
    if (lauf !== stammLauf || !terminBlick) return
    if (!r.ok || !d.ok || !d.stamm) {
      terminBlick.laden = false
      terminBlick.fehler = d.meldung || 'Die Stammdaten ließen sich nicht lesen.'
      zeichnen()
      return
    }
    terminBlick.laden = false
    terminBlick.kalender = d.kalender === true
    terminBlick.name = d.stamm.name || terminBlick.name
    terminBlick.telefon = d.stamm.telefon || ''
    terminBlick.email = d.stamm.email || ''
    terminBlick.vorname = d.stamm.vorname || ''
    terminBlick.nachname = d.stamm.nachname || ''
    terminBlick.anrede = d.stamm.anrede || ''
    terminBlick.behandler = d.behandler ?? []
    terminBlick.motive = d.motive ?? []
    terminBlick.calendarId = terminBlick.behandler[0]?.id ?? ''
    zeichnen()
    if (terminBlick.kalender) void terminSlots()
  } catch {
    if (lauf !== stammLauf || !terminBlick) return
    terminBlick.laden = false
    terminBlick.fehler = 'Keine Verbindung.'
    zeichnen()
  }
}

async function terminSlots() {
  const b = terminBlick
  if (!b?.kalender) return
  const motiv = gewaehltesMotiv(b)
  b.motivId = motiv?.id ?? ''
  b.slots = []
  b.fehler = ''
  if (!motiv) { b.slotsLaden = false; zeichnen(); return }
  b.slotsLaden = true
  b.minuten = motiv.dauer
  const lauf = ++slotLauf
  zeichnen()
  try {
    const r = await fetch('/api/termine/slots', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: motiv.locationId, calendarId: b.calendarId, visitMotiveId: motiv.id }),
    })
    const d = await r.json() as { ok?: boolean; slots?: string[]; minuten?: number; meldung?: string }
    if (lauf !== slotLauf || !terminBlick) return
    terminBlick.slotsLaden = false
    terminBlick.slots = d.ok && Array.isArray(d.slots) ? d.slots : []
    terminBlick.minuten = d.minuten || motiv.dauer
    if (!d.ok) terminBlick.fehler = d.meldung || 'Die freien Termine lassen sich gerade nicht aus CalendR lesen.'
    zeichnen()
  } catch {
    if (lauf !== slotLauf || !terminBlick) return
    terminBlick.slotsLaden = false
    terminBlick.fehler = 'Die freien Termine lassen sich gerade nicht aus CalendR lesen.'
    zeichnen()
  }
}

async function terminBuchen(iso: string) {
  const b = terminBlick
  if (!b?.kalender) return
  const motiv = gewaehltesMotiv(b)
  const badge = slotBadge(iso, b.minuten)
  const arzt = b.behandler.find((k) => k.id === b.calendarId)?.name ?? ''
  if (!motiv || !badge) return
  if (!b.vorname || !b.nachname) { b.fehler = 'In den Stammdaten fehlen Vor- und Nachname.'; zeichnen(); return }
  if (b.telefon.replace(/\D/g, '').length < 6) { b.fehler = 'In den Stammdaten fehlt die Telefonnummer.'; zeichnen(); return }
  if (!geschlecht(b.anrede)) { b.fehler = 'In den Stammdaten fehlt die Anrede.'; zeichnen(); return }
  if (!confirm(`Termin am ${badge.tag} um ${badge.uhrzeit} (${badge.laenge}) bei ${arzt} eintragen?`)) return
  b.fehler = ''
  zeichnen()
  try {
    const r = await fetch('/api/termine/buchen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modul: b.modul, nummer: b.nummer, locationId: motiv.locationId, calendarId: b.calendarId, visitMotiveId: motiv.id, iso }),
    })
    const d = await r.json() as { ok?: boolean; meldung?: string }
    if (!r.ok || !d.ok) {
      if (terminBlick) terminBlick.fehler = d.meldung || 'Der Termin ließ sich in CalendR nicht eintragen.'
      zeichnen()
      return
    }
    terminBlick = null
    melden('Termin eingetragen.')
    await laden()
  } catch {
    if (terminBlick) terminBlick.fehler = 'Keine Verbindung.'
    zeichnen()
  }
}

ausUrl()
window.addEventListener('popstate', () => {
  const n = Number((history.state as { n?: number } | null)?.n)
  verlaufJetzt = Number.isFinite(n) ? n : 0
  ausUrl()
  planAusAdresse()
  if (ich?.konto) zeichnen()
})
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (terminBlick) { terminBlick = null; stammLauf += 1; slotLauf += 1; zeichnen(); return }
  if (auswahl || einstellungAuf) auswahlSchliessen()
})

async function laden() {
  const d = await (await fetch('/api/plaene', { cache: 'no-store' })).json() as { plaene?: PlanKarte[] }
  plaene = Array.isArray(d.plaene) ? d.plaene : []
  planAusAdresse()
  zeichnen()
}

async function vorgangEnde(p: PlanKarte) {
  if (!confirm(`${p.patient} aus der Liste nehmen? Der Befund bleibt gespeichert; geplant wird dann nichts weiter.`)) return
  try {
    await apiJson('/api/befund/vorgang-ende', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient: p.vorgang!.patient }) })
  } catch { /* Liste zeigt den Stand vom Server */ }
  await laden()
}

/** Befund und Planung, die gerade im Gespräch entstehen, erscheinen sofort in der Liste */
function vorgaengeLive() {
  if (typeof EventSource === 'undefined') return
  let uhr = 0
  new EventSource('/api/befund/live').addEventListener('befund', () => {
    clearTimeout(uhr)
    uhr = window.setTimeout(() => { if (!document.hidden) void laden().catch(() => {}) }, 1200)
  })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void laden().catch(() => {}) })
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
  document.body.classList.remove('planr-app')
  const form = document.getElementById('clara-zeile')
  if (form) {
    form.hidden = true
    document.body.append(form)
  }
  let ansicht = ''
  const zeigen = async () => {
    const soll = ['#anmelden', '#bridge', '#einrichtung'].includes(location.hash) || sitzungHinweis ? 'anmelden'
      : location.hash === '#buchen' || location.hash === '#buchen-clara' || location.hash === '#buchen-doku' ? location.hash : 'start'
    if (soll === ansicht) return
    const vorher = ansicht
    ansicht = soll
    const hp = await import('./homepage')
    if (soll === 'anmelden') {
      if (vorher !== 'start') hp.homepage(app)
      anmeldePopup(sitzungHinweis || (location.hash === '#bridge' ? 'Bitte als Praxis-Admin anmelden – danach laden Sie die Bridge herunter.' : ''), () => {
        ansicht = 'start'
        sitzungHinweisLoeschen()
        history.replaceState(null, '', location.pathname + location.search)
      })
    } else if (soll.startsWith('#buchen')) {
      anmeldePopupEntfernen()
      hp.homepageVerlassen()
      const { buchungSeite } = await import('./buchung')
      buchungSeite(app, soll === '#buchen-doku')
      scrollTo(0, 0)
    } else {
      anmeldePopupEntfernen()
      if (vorher !== 'anmelden') hp.homepage(app)
    }
  }
  addEventListener('hashchange', () => {
    if (location.hash !== '#anmelden' && sitzungHinweis) sitzungHinweisLoeschen()
    void zeigen()
  })
  return zeigen()
}

document.addEventListener('click', () => {
  const menu = document.querySelector<HTMLElement>('.konto-menu')
  if (!menu || menu.hidden) return
  menu.hidden = true
  document.querySelector('[data-konto]')?.setAttribute('aria-expanded', 'false')
})
window.addEventListener('resize', () => { if (document.body.classList.contains('plan-offen')) claraBuendig() })
window.addEventListener('message', (ev) => {
  const d = ev.data as { type?: string } | null
  if (!d) return
  const frame = document.querySelector<HTMLIFrameElement>('.plan-rahmen')
  if (frame && ev.source !== frame.contentWindow) return
  if (d.type === 'planr-nav' && ((d as { richtung?: string }).richtung === 'zurueck' || (d as { richtung?: string }).richtung === 'vor')) {
    planNav((d as { richtung: 'zurueck' | 'vor' }).richtung)
    return
  }
  if (d.type === 'planr-leiste' && planBlick) {
    const neu = d as { punkte?: { id?: string; text?: string }[]; aktiv?: string; versand?: boolean }
    const punkte = Array.isArray(neu.punkte)
      ? neu.punkte.filter((p) => p && p.id && p.text).map((p) => ({ id: String(p.id), text: String(p.text) }))
      : []
    const aktiv = String(neu.aktiv || '')
    const versand = neu.versand === true
    const gleich = planVersand === versand && planAktiv === aktiv && planPunkte.length === punkte.length && planPunkte.every((p, i) => p.id === punkte[i].id && p.text === punkte[i].text)
    planPunkte = punkte
    planAktiv = aktiv
    planVersand = versand
    if (!gleich && !planChrome()) zeichnen()
    return
  }
  if (d.type === 'planr-versendet' && planBlick) {
    void laden().catch(() => {})
    return
  }
  if (d.type !== 'planr-blick' || !planBlick) return
  claraEinklappen()
})
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'F12' && document.body.classList.contains('plan-offen')) {
    ev.preventDefault()
    const spalte = document.getElementById('clara-spalte')
    agentFenster(!!spalte?.classList.contains('agent-weg'))
    return
  }
  if (ev.key !== 'Escape') return
  const menu = document.querySelector<HTMLElement>('.konto-menu')
  if (menu && !menu.hidden) {
    menu.hidden = true
    document.querySelector('[data-konto]')?.setAttribute('aria-expanded', 'false')
    return
  }
  if (!persoenlichAuf) return
  persoenlichAuf = false
  zeichnen()
})

ausPickadoc().then(ichLaden).then(async (wer) => {
  if (!wer) return ohneAnmeldung()
  ich = wer
  sitzungBewachen()
  await einstellungenLaden()
  await laden()
  if (ich.praxen?.length !== 0) vorgaengeLive()
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

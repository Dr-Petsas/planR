import './style.css'
import { ersetzbar, loeschbar, planDateiLesen, planFiltern, tagVon, type PlanDatei, type PlanKarte } from './plaene'
import { BEREICHE, adresse, planerZuModul } from './planer'
import { LEER, PVS_LISTE, pvsVon, type Einstellungen } from './einstellungen'

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
const mandant = new URLSearchParams(location.search).get('mandant') || 'standard'
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
const ZAHN = PFEIL('M12 5.5C10.5 4 9 3 7 3 4.8 3 3 4.8 3 7.5c0 2.3 1 3.6 1.6 5.4.6 1.9.6 4.1 1.4 6.4.4 1.2 1.9 1.3 2.4.1l1.3-3.6c.6-1.6 4-1.6 4.6 0l1.3 3.6c.5 1.2 2 1.1 2.4-.1.8-2.3.8-4.5 1.4-6.4.6-1.8 1.6-3.1 1.6-5.4C21 4.8 19.2 3 17 3c-2 0-3.5 1-5 2.5Z')
const ZAHNRAD = PFEIL('M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z')

function zeile(p: PlanKarte, i: number): string {
  const url = planUrl(p)
  const name = esc(p.patient || 'Ohne Namen')
  const hkp = p.modul === 'hkp'
  const tonne = loeschbar(p)
    ? `<button type="button" class="aktion tonne" data-loeschen="${i}" title="${hkp ? 'HKP verwerfen' : 'Plan löschen'}" aria-label="${hkp ? 'HKP verwerfen' : 'Plan löschen'}: ${name}">${TONNE}</button>`
    : `<span class="aktion tonne aus" title="Liegt bei der Kasse – nur in PlanR änderbar">${TONNE}</span>`
  const export_ = `<button type="button" class="aktion" data-export="${i}" title="Als JSON exportieren" aria-label="Exportieren: ${name}">${EXPORT}</button>`
  const import_ = ersetzbar(p)
    ? `<button type="button" class="aktion" data-import="${i}" title="Plan aus JSON-Datei ersetzen" aria-label="Importieren: ${name}">${IMPORT}</button>`
    : `<span class="aktion aus" title="Wartet nicht mehr auf Freigabe – nur in PlanR änderbar">${IMPORT}</span>`
  const befund = !hkp ? '<span class="aktion leer" aria-hidden="true"></span>'
    : p.befund
      ? `<button type="button" class="aktion befund" data-befund="${i}" title="Befund (KZBV-Kürzel) als JSON herunterladen" aria-label="Befund herunterladen: ${name}">${ZAHN}</button>`
      : `<span class="aktion aus" title="Kein Befund angehängt">${ZAHN}</span>`
  return `<div class="zeile${url ? ' mit-link' : ''}" role="row">
    <span class="sp-art"><span class="kuerzel">${esc(p.kuerzel)}</span></span>
    ${url ? `<a class="sp-patient" href="${esc(url)}">${name}</a>` : `<span class="sp-patient">${name}</span>`}
    <span class="sp-nr">${esc(p.nummer)}</span>
    <span class="sp-status">${esc(STATUS[p.status] || p.status)}</span>
    <span class="sp-betrag">${p.betrag ? esc(euro(p.betrag)) : ''}</span>
    <span class="sp-zeit">${esc(zeit(p.geaendert))}</span>
    <span class="sp-aktionen">${befund}${export_}${import_}${tonne}</span>
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

interface Antwort { ok: boolean; meldung?: string; datei?: PlanDatei; nummer?: string; befund?: { name: string; inhalt: string } }

async function senden(pfad: 'loeschen' | 'zurueck' | 'export' | 'import' | 'befund', daten: unknown): Promise<Antwort> {
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

async function exportieren(p: PlanKarte) {
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

async function befundLaden(p: PlanKarte) {
  const r = await senden('befund', kennung(p))
  if (!r.ok || !r.befund) return melden(r.meldung || 'Befund ließ sich nicht laden.')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([r.befund.inhalt], { type: 'application/json' }))
  a.download = r.befund.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  melden(`Befund von ${p.patient || p.nummer} heruntergeladen.`)
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
          <h2>Einstellungen${mandant !== 'standard' ? ` <small>Mandant ${esc(mandant)}</small>` : ''}</h2>
          <button type="button" data-wahl-zu aria-label="Schließen">✕</button>
        </div>
        <label class="feld">Praxisverwaltungssystem (PVS)
          <select data-pvs>
            <option value=""${e.pvs ? '' : ' selected'}>– bitte wählen –</option>
            ${optionen}
          </select>
        </label>
        ${p ? `<p class="pvs-info">Übergabe: ${esc(p.weg)}<span class="marke-bridge ${p.bereit ? 'bereit' : 'bald'}">${p.bereit ? 'Bridge verfügbar' : 'Bridge in Vorbereitung'}</span></p>` : ''}
        <label class="schalter${p ? '' : ' aus'}">
          <input type="checkbox" data-bridge${e.bridge ? ' checked' : ''}${p ? '' : ' disabled'}>
          <span><b>Bridge aktivieren</b><small>${p ? `Pläne aus PlanR an ${esc(p.name)} übergeben.` : 'Zuerst das PVS wählen.'}</small></span>
        </label>
        ${p?.ordner && e.bridge ? `<label class="feld">Übergabeordner
          <input type="text" data-ordner value="${esc(e.ordner)}" placeholder="z. B. C:\\DENS\\Import" autocomplete="off" spellcheck="false">
        </label>` : ''}
        ${p && e.bridge && !p.bereit ? '<p class="pvs-hinweis">Die Bridge für dieses PVS ist noch nicht fertig. Die Einstellung wird gespeichert, übertragen wird erst, wenn sie bereitsteht.</p>' : ''}
        <div class="einst-fuss">
          <span>${einstellungen.geaendert ? `Gespeichert ${esc(zeit(einstellungen.geaendert))}` : 'Noch nicht gespeichert'}</span>
          <button type="button" class="import-knopf" data-wahl-zu>Abbrechen</button>
          <button type="submit" class="neu-knopf"${geaendert ? '' : ' disabled'}>Speichern</button>
    </div>
      </form>
    </div>`
}

async function einstellungenSpeichern() {
  try {
    const r = await fetch(`/api/einstellungen?mandant=${encodeURIComponent(mandant)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entwurf),
    })
    const d = await r.json() as { ok: boolean; einstellungen?: Einstellungen; meldung?: string }
    if (!d.ok || !d.einstellungen) return melden(d.meldung || 'Speichern hat nicht geklappt.')
    einstellungen = entwurf = d.einstellungen
    auswahlSchliessen()
    const p = pvsVon(einstellungen.pvs)
    melden(p ? `Gespeichert: ${p.name}, Bridge ${einstellungen.bridge ? 'aktiv' : 'aus'}.` : 'Gespeichert: kein PVS gewählt.')
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
        <button type="button" class="import-knopf" data-einstellungen title="PVS und Bridge einstellen">${ZAHNRAD}<span>Einstellungen</span></button>
        <button type="button" class="import-knopf" data-import-neu title="Plan aus einer JSON-Datei übernehmen">${IMPORT}<span>Plan importieren</span></button>
        <button type="button" class="neu-knopf" data-neu>Neuer Plan erstellen</button>
    </div>
  </header>
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
  app.querySelectorAll<HTMLButtonElement>('[data-befund]').forEach((b) => b.addEventListener('click', () => {
    const p = sichtbar[Number(b.dataset.befund)]
    if (p) void befundLaden(p)
  }))
  app.querySelectorAll<HTMLButtonElement>('[data-import]').forEach((b) => b.addEventListener('click', () => {
    const p = sichtbar[Number(b.dataset.import)]
    if (p) importWaehlen(p)
  }))
  app.querySelector<HTMLButtonElement>('[data-import-neu]')!.addEventListener('click', () => importWaehlen(null))
  app.querySelector<HTMLButtonElement>('[data-einstellungen]')!.addEventListener('click', () => {
    entwurf = einstellungen
    einstellungAuf = true
    auswahl = false
    urlSetzen('push')
    zeichnen()
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
}

ausUrl()
window.addEventListener('popstate', () => { ausUrl(); zeichnen() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (auswahl || einstellungAuf)) auswahlSchliessen() })

async function laden() {
  const d = await (await fetch('/api/plaene', { cache: 'no-store' })).json() as { plaene?: PlanKarte[] }
  plaene = Array.isArray(d.plaene) ? d.plaene : []
  zeichnen()
}

async function einstellungenLaden() {
  try {
    const d = await (await fetch(`/api/einstellungen?mandant=${encodeURIComponent(mandant)}`, { cache: 'no-store' })).json() as { einstellungen?: Einstellungen }
    if (d.einstellungen) einstellungen = d.einstellungen
  } catch { /* Maske startet leer */ }
  entwurf = einstellungen
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = '<p class="leer">Pläne werden geladen …</p>'
einstellungenLaden().then(laden).catch(() => { document.querySelector('#app')!.innerHTML = '<p class="leer">Die Planliste ist gerade nicht erreichbar.</p>' })

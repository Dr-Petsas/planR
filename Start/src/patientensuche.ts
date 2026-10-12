/**
 * Patientensuche: Patient im PVS finden (ohne Bridge: Name eintippen), dann
 *  - neuen HKP auf diesen Patienten anlegen (Stammdaten gehen mit in den Planer),
 *  - einen HKP aus dem PVS übernehmen oder
 *  - einen schon vorhandenen PlanR-Plan des Patienten öffnen.
 */
import { apiJson } from './api'

interface Patient { id: string; vorname: string; name: string; geburtsdatum: string; ort: string }
interface Hkp { nummer: number; datum: string; planart: string; bezeichnung: string; status: string; betrag: number }
/** Anmeldedaten für den Planer (Teil von _gemeinsam/stammdaten.ts Patient) */
export type Stammdaten = Partial<Record<'anrede' | 'vorname' | 'name' | 'geburtsdatum' | 'strasse' | 'plz' | 'ort' | 'kasse' | 'kassenNr' | 'versichertenNr', string>>
export interface PlanTreffer { titel: string; unter: string; url: string | null }

export interface SucheUmgebung {
  /** Name des PVS mit Patientensuche; '' = ohne PVS (nur PlanR) */
  pvsName: string
  /** Warum das PVS gerade nicht gefragt werden kann (Bridge getrennt o. ä.) */
  pvsHinweis?: string
  /** PlanR-Pläne zu einem Patientennamen */
  planrPlaene: (vorname: string, name: string) => PlanTreffer[]
  /** Neuen HKP mit diesen Anmeldedaten öffnen */
  neuerHkp: (p: Stammdaten) => void
  /** übernommener HKP (Registernummer) → Liste neu laden und Planer öffnen */
  geoeffnet: (nummer: string, hinweise: string[]) => Promise<void>
  dateiWaehlen: () => void
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const datum = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('.') : iso)
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

/** Eingetippter Name ohne PVS: „Berger, Anna“ oder „Anna Berger“ (letztes Wort = Nachname) */
export function nameZerlegen(text: string): { vorname: string; name: string } {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.includes(',')) {
    const [name, ...rest] = t.split(',')
    return { vorname: rest.join(' ').trim(), name: name.trim() }
  }
  const teile = t.split(' ')
  const name = teile.pop() ?? ''
  return { vorname: teile.join(' '), name }
}

export function patientensucheOeffnen(u: SucheUmgebung) {
  const mitPvs = !!u.pvsName && !u.pvsHinweis
  const dlg = document.createElement('div')
  dlg.className = 'wahl'
  dlg.setAttribute('role', 'dialog')
  dlg.setAttribute('aria-modal', 'true')
  dlg.setAttribute('aria-label', 'Patientensuche')
  dlg.innerHTML = `
    <button type="button" class="wahl-grund" data-zu aria-label="Schließen"></button>
    <div class="wahl-karte pvs-import">
      <div class="wahl-kopf">
        <h2>Patientensuche${mitPvs ? `<small>in ${esc(u.pvsName)}</small>` : ''}</h2>
        <button type="button" data-zu aria-label="Schließen">✕</button>
      </div>
      ${u.pvsHinweis ? `<p class="pvs-hinweis">${esc(u.pvsHinweis)} Sie können den Namen trotzdem eintippen und einen neuen HKP anlegen.</p>` : ''}
      <form class="pvs-suche" data-suche>
        <input type="search" placeholder="${mitPvs ? 'Name oder Patientennummer' : 'Vorname Nachname'}" autocomplete="off" spellcheck="false" aria-label="Patient suchen">
      </form>
      <div class="pvs-bereich" data-patienten></div>
      <div class="ps-karte" data-karte hidden></div>
      <p class="pvs-status" role="status" data-status></p>
      <div class="einst-fuss">
        <button type="button" class="link-knopf" data-datei>Plan aus JSON-Datei importieren …</button>
      </div>
    </div>`
  document.body.append(dlg)
  const $ = <T extends Element>(s: string) => dlg.querySelector<T>(s)!
  const feld = $<HTMLInputElement>('input')
  const karte = $<HTMLElement>('[data-karte]')
  const status = (text: string) => { $('[data-status]').textContent = text }
  let busy = false

  const zu = () => { dlg.remove(); document.removeEventListener('keydown', taste) }
  const taste = (ev: KeyboardEvent) => { if (ev.key === 'Escape') zu() }
  document.addEventListener('keydown', taste)
  dlg.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', zu))
  $('[data-datei]').addEventListener('click', () => { zu(); u.dateiWaehlen() })
  feld.focus()

  /** Karte des gewählten Patienten: neuer HKP, HKPs im PVS, Pläne in PlanR */
  function karteZeigen(kopf: { vorname: string; name: string; unter: string }, neu: () => void, pvsPatient?: Patient) {
    const wer = [kopf.vorname, kopf.name].filter(Boolean).join(' ')
    const plaene = u.planrPlaene(kopf.vorname, kopf.name)
    karte.hidden = false
    karte.innerHTML = `
      <div class="ps-kopf">
        <div><b>${esc(kopf.name)}${kopf.vorname ? `, ${esc(kopf.vorname)}` : ''}</b><span>${esc(kopf.unter)}</span></div>
        <button type="button" class="neu-knopf" data-neuer-hkp>Neuen HKP für ${esc(wer)} erstellen</button>
      </div>
      ${plaene.length ? `<p class="pvs-titel">Schon in PlanR</p>
        <div class="ps-liste">${plaene.map((p) => p.url
          ? `<a href="${esc(p.url)}"><b>${esc(p.titel)}</b><span>${esc(p.unter)}</span><i>Öffnen</i></a>`
          : `<div><b>${esc(p.titel)}</b><span>${esc(p.unter)}</span></div>`).join('')}</div>` : ''}
      <div data-hkps></div>`
    karte.querySelector('[data-neuer-hkp]')!.addEventListener('click', neu)
    if (pvsPatient) void hkpsZeigen(pvsPatient)
  }

  async function neuAusPvs(p: Patient) {
    if (busy) return
    busy = true
    status(`Stammdaten von ${p.vorname} ${p.name} werden geholt …`)
    const r = await apiJson<{ patient?: Stammdaten }>(`/api/pvs/patient?patient=${encodeURIComponent(p.id)}`)
    busy = false
    // Fehlen die Stammdaten (ältere Bridge), reicht der Name aus der Trefferliste
    const daten: Stammdaten = r.ok && r.patient ? r.patient : { vorname: p.vorname, name: p.name, geburtsdatum: p.geburtsdatum }
    zu()
    u.neuerHkp(daten)
  }

  async function importieren(p: Patient, h: Hkp) {
    if (busy) return
    busy = true
    status(`Plan ${h.nummer} von ${p.vorname} ${p.name} wird übernommen …`)
    const r = await apiJson<{ nummer?: string; hinweise?: string[] }>('/api/plaene/pvs-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient: p.id, plan: h.nummer }),
    })
    busy = false
    if (!r.ok || !r.nummer) return status(r.meldung || 'Import hat nicht geklappt.')
    zu()
    await u.geoeffnet(r.nummer, r.hinweise ?? [])
  }

  async function hkpsZeigen(p: Patient) {
    const ziel = karte.querySelector<HTMLElement>('[data-hkps]')!
    status(`HKPs von ${p.vorname} ${p.name} in ${u.pvsName} werden geladen …`)
    const r = await apiJson<{ hkps?: Hkp[]; uebernehmbar?: boolean }>(`/api/pvs/hkps?patient=${encodeURIComponent(p.id)}`)
    if (!ziel.isConnected) return
    if (!r.ok) return status(r.meldung || 'HKPs ließen sich nicht laden.')
    const hkps = r.hkps ?? []
    status('')
    if (!hkps.length) {
      ziel.innerHTML = `<p class="pvs-titel">HKPs in ${esc(u.pvsName)}</p><p class="ps-leer">Keiner vorhanden.</p>`
      return
    }
    const geht = r.uebernehmbar !== false
    ziel.innerHTML = `<p class="pvs-titel">HKPs in ${esc(u.pvsName)}${geht ? '' : ' <small>(Übernahme folgt)</small>'}</p>
      <div class="pvs-tabelle ps-hkps">
        ${hkps.map((h, i) => `<div class="ps-hkp">
          <b>Plan ${h.nummer}</b><span>${esc(datum(h.datum))}</span><span>${esc(h.planart)}</span>
          <span class="pvs-bez">${esc(h.bezeichnung)}</span><span>${esc(h.status)}</span><span class="pvs-betrag">${h.betrag ? esc(euro(h.betrag)) : ''}</span>
          ${geht ? `<button type="button" class="ps-uebernehmen" data-hkp="${i}">Übernehmen</button>` : '<span></span>'}
        </div>`).join('')}
      </div>`
    ziel.querySelectorAll<HTMLButtonElement>('[data-hkp]').forEach((b) => b.addEventListener('click', () => void importieren(p, hkps[Number(b.dataset.hkp)])))
  }

  /** Ohne PVS: der eingetippte Name ist der Patient */
  function ohnePvs(text: string) {
    const liste = $('[data-patienten]')
    liste.innerHTML = ''
    const { vorname, name } = nameZerlegen(text)
    if (text.length < 2 || !name) {
      karte.hidden = true
      return status(text ? 'Noch ein Buchstabe …' : '')
    }
    status('')
    karteZeigen({ vorname, name, unter: 'Anschrift und Kasse tragen Sie im Planer ein.' }, () => { zu(); u.neuerHkp({ vorname, name }) })
  }

  // Jede Eingabe startet eine neue Suche; Antworten älterer Suchen werden verworfen.
  let suchNr = 0
  let timer = 0
  let gesucht = ''

  async function suchen(text: string) {
    if (!mitPvs) return ohnePvs(text)
    const nr = ++suchNr
    gesucht = text
    const liste = $('[data-patienten]')
    karte.hidden = true
    if (text.length < 2) {
      liste.innerHTML = ''
      return status(text ? 'Noch ein Buchstabe …' : '')
    }
    status('Suche läuft …')
    const r = await apiJson<{ patienten?: Patient[] }>(`/api/pvs/patienten?q=${encodeURIComponent(text)}`)
    if (nr !== suchNr) return
    liste.innerHTML = ''
    if (!r.ok) return status(r.meldung || 'Suche hat nicht geklappt.')
    const treffer = (r.patienten ?? []).slice(0, 12)
    if (!treffer.length) return status(`Kein Patient in ${u.pvsName} gefunden.`)
    status(treffer.length === 1 ? '' : 'Patient wählen – Pfeiltasten und Enter gehen auch.')
    liste.innerHTML = treffer.map((p, i) => `<button type="button" class="pvs-patient" data-patient="${i}">
      <b>${esc(`${p.name}, ${p.vorname}`)}</b><span>${esc([datum(p.geburtsdatum), p.ort, `Nr. ${p.id}`].filter(Boolean).join(' · '))}</span></button>`).join('')
    liste.querySelectorAll<HTMLButtonElement>('[data-patient]').forEach((b) => b.addEventListener('click', () => {
      liste.querySelectorAll('.pvs-patient').forEach((x) => x.classList.toggle('an', x === b))
      const p = treffer[Number(b.dataset.patient)]
      karteZeigen({ vorname: p.vorname, name: p.name, unter: [datum(p.geburtsdatum), p.ort, `Nr. ${p.id}`].filter(Boolean).join(' · ') }, () => void neuAusPvs(p), p)
    }))
    if (treffer.length === 1) liste.querySelector<HTMLButtonElement>('[data-patient]')!.click()
  }

  feld.addEventListener('input', () => {
    clearTimeout(timer)
    timer = window.setTimeout(() => void suchen(feld.value.trim()), mitPvs ? 250 : 120)
  })
  feld.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown') return
    ev.preventDefault()
    dlg.querySelector<HTMLButtonElement>('[data-patient]')?.focus()
  })
  $<HTMLElement>('[data-patienten]').addEventListener('keydown', (ev) => {
    const knoepfe = [...dlg.querySelectorAll<HTMLButtonElement>('[data-patient]')]
    const i = knoepfe.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0 || (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp')) return
    ev.preventDefault()
    if (ev.key === 'ArrowUp' && i === 0) return feld.focus()
    knoepfe[Math.min(knoepfe.length - 1, Math.max(0, i + (ev.key === 'ArrowDown' ? 1 : -1)))].focus()
  })
  $<HTMLFormElement>('[data-suche]').addEventListener('submit', (ev) => {
    ev.preventDefault()
    clearTimeout(timer)
    const text = feld.value.trim()
    if (!mitPvs) return karte.querySelector<HTMLButtonElement>('[data-neuer-hkp]')?.click()
    const erster = dlg.querySelector<HTMLButtonElement>('[data-patient]')
    if (erster && text === gesucht) return erster.click()
    void suchen(text)
  })
}

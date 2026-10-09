/** „Plan importieren“: Patient im PVS suchen, seine HKPs listen, Doppelklick übernimmt und öffnet den Plan. */

interface Patient { id: string; vorname: string; name: string; geburtsdatum: string; ort: string }
interface Hkp { nummer: number; datum: string; planart: string; bezeichnung: string; status: string; betrag: number }

export interface ImportUmgebung {
  pvsName: string
  mandant: string
  /** übernommener HKP (Registernummer) → Liste neu laden und Planer öffnen */
  geoeffnet: (nummer: string, hinweise: string[]) => Promise<void>
  dateiWaehlen: () => void
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const datum = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('.') : iso)
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

async function holen<T>(url: string, init?: RequestInit): Promise<T & { ok: boolean; meldung?: string }> {
  try {
    return await (await fetch(url, { cache: 'no-store', ...init })).json()
  } catch {
    return { ok: false, meldung: 'Keine Verbindung.' } as T & { ok: boolean; meldung?: string }
  }
}

export function pvsImportOeffnen(u: ImportUmgebung) {
  const m = encodeURIComponent(u.mandant)
  const dlg = document.createElement('div')
  dlg.className = 'wahl'
  dlg.setAttribute('role', 'dialog')
  dlg.setAttribute('aria-modal', 'true')
  dlg.setAttribute('aria-label', `HKP aus ${u.pvsName} importieren`)
  dlg.innerHTML = `
    <button type="button" class="wahl-grund" data-zu aria-label="Schließen"></button>
    <div class="wahl-karte pvs-import">
      <div class="wahl-kopf">
        <h2>HKP aus ${esc(u.pvsName)} importieren</h2>
        <button type="button" data-zu aria-label="Schließen">✕</button>
      </div>
      <form class="pvs-suche" data-suche>
        <input type="search" placeholder="Vor- und/oder Nachname" autocomplete="off" spellcheck="false" aria-label="Patient suchen">
        <button type="submit" class="neu-knopf">Patient suchen</button>
      </form>
      <div class="pvs-bereich" data-patienten></div>
      <div class="pvs-bereich" data-hkps></div>
      <p class="pvs-status" role="status" data-status></p>
      <div class="einst-fuss">
        <button type="button" class="link-knopf" data-datei>JSON-Datei importieren …</button>
      </div>
    </div>`
  document.body.append(dlg)
  const $ = <T extends Element>(s: string) => dlg.querySelector<T>(s)!
  const feld = $<HTMLInputElement>('input')
  const status = (text: string) => { $('[data-status]').textContent = text }
  let busy = false

  const zu = () => { dlg.remove(); document.removeEventListener('keydown', taste) }
  const taste = (ev: KeyboardEvent) => { if (ev.key === 'Escape') zu() }
  document.addEventListener('keydown', taste)
  dlg.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', zu))
  $('[data-datei]').addEventListener('click', () => { zu(); u.dateiWaehlen() })
  feld.focus()

  async function importieren(p: Patient, h: Hkp) {
    if (busy) return
    busy = true
    status(`Plan ${h.nummer} von ${p.vorname} ${p.name} wird übernommen …`)
    const r = await holen<{ nummer?: string; hinweise?: string[] }>('/api/plaene/pvs-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient: p.id, plan: h.nummer, mandant: u.mandant }),
    })
    busy = false
    if (!r.ok || !r.nummer) return status(r.meldung || 'Import hat nicht geklappt.')
    zu()
    await u.geoeffnet(r.nummer, r.hinweise ?? [])
  }

  async function hkpsZeigen(p: Patient) {
    const ziel = $('[data-hkps]')
    ziel.innerHTML = ''
    status(`HKPs von ${p.vorname} ${p.name} werden geladen …`)
    const r = await holen<{ hkps?: Hkp[] }>(`/api/pvs/hkps?patient=${encodeURIComponent(p.id)}&mandant=${m}`)
    if (!r.ok) return status(r.meldung || 'HKPs ließen sich nicht laden.')
    const hkps = r.hkps ?? []
    if (!hkps.length) return status(`${p.vorname} ${p.name} hat in ${u.pvsName} keinen HKP.`)
    status('Doppelklick auf einen Plan übernimmt ihn in PlanR und öffnet ihn.')
    ziel.innerHTML = `<p class="pvs-titel">HKPs von ${esc(`${p.vorname} ${p.name}`)}</p>
      <div class="pvs-tabelle" role="listbox" aria-label="HKPs">
        ${hkps.map((h, i) => `<button type="button" role="option" data-hkp="${i}" title="Doppelklick: übernehmen und öffnen">
          <b>Plan ${h.nummer}</b><span>${esc(datum(h.datum))}</span><span>${esc(h.planart)}</span>
          <span class="pvs-bez">${esc(h.bezeichnung)}</span><span>${esc(h.status)}</span><span class="pvs-betrag">${h.betrag ? esc(euro(h.betrag)) : ''}</span>
        </button>`).join('')}
      </div>`
    ziel.querySelectorAll<HTMLButtonElement>('[data-hkp]').forEach((b) => {
      const h = hkps[Number(b.dataset.hkp)]
      b.addEventListener('dblclick', () => void importieren(p, h))
      b.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); void importieren(p, h) } })
    })
  }

  $<HTMLFormElement>('[data-suche]').addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const text = feld.value.trim()
    if (!text) return status('Vor- und/oder Nachname eingeben.')
    $('[data-patienten]').innerHTML = ''
    $('[data-hkps]').innerHTML = ''
    status('Suche läuft …')
    const r = await holen<{ patienten?: Patient[] }>(`/api/pvs/patienten?q=${encodeURIComponent(text)}&mandant=${m}`)
    if (!r.ok) return status(r.meldung || 'Suche hat nicht geklappt.')
    const treffer = r.patienten ?? []
    if (!treffer.length) return status(`Kein Patient in ${u.pvsName} gefunden.`)
    status(treffer.length === 1 ? '' : `${treffer.length} Patienten gefunden – bitte wählen.`)
    const liste = $('[data-patienten]')
    liste.innerHTML = treffer.map((p, i) => `<button type="button" class="pvs-patient" data-patient="${i}">
      <b>${esc(`${p.name}, ${p.vorname}`)}</b><span>${esc([datum(p.geburtsdatum), p.ort, `Nr. ${p.id}`].filter(Boolean).join(' · '))}</span></button>`).join('')
    liste.querySelectorAll<HTMLButtonElement>('[data-patient]').forEach((b) => b.addEventListener('click', () => {
      liste.querySelectorAll('.pvs-patient').forEach((x) => x.classList.toggle('an', x === b))
      void hkpsZeigen(treffer[Number(b.dataset.patient)])
    }))
    if (treffer.length === 1) liste.querySelector<HTMLButtonElement>('[data-patient]')!.click()
  })
}

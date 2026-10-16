/**
 * Befund (01) eines Patienten aus der Übersicht: aktueller Stand aus dem Praxisprogramm plus die im Gespräch oder
 * hier geänderten Zähne (rosa), live. Ändern, verwerfen, als geänderten Befund ins PVS schreiben (ohne 01, ohne
 * Abrechnung) und von hier aus einen neuen Plan für den Patienten anfangen.
 */
import { apiJson } from './api'
import type { PatientKennung } from './plaene'
import type { Stammdaten } from './patientensuche'

interface Befund {
  patient: string
  label: string
  geburt: string
  pvs: string
  pvsDatum: string
  zaehne: Record<string, string>
  pvsZaehne: Record<string, string>
  offen: Record<string, string>
  offenWer: string
  geschrieben: string
  stand: string
  vorgang?: { phase: 'befund' | 'planung' | 'angelegt'; auftrag: string; freigegeben: string; meldung: string } | null
}

export interface BefundUmgebung {
  /** Neuen Plan für diesen Patienten anfangen (Planauswahl) */
  neuerPlan: (p: Stammdaten) => void
  /** Liste neu laden, wenn sich der Vorgang geändert hat */
  geaendert?: () => void
  /** Name der Assistentin (Clara) */
  assistentin: string
}

const OK = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
const UK = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
/** Häufige eHKP-Kürzel zum Anklicken; jedes andere geht über das Feld daneben */
const SCHNELL: [string, string][] = [
  ['', 'vorhanden (ohne Befund)'], ['f', 'fehlender Zahn'], ['k', 'klinisch intakte Krone'], ['kw', 'erneuerungsbedürftige Krone'],
  ['pw', 'partielle Substanzdefekte'], ['ww', 'weitgehende Zerstörung'], ['x', 'nicht erhaltungswürdig'], ['b', 'Brückenglied'],
  ['bw', 'erneuerungsbedürftiges Brückenglied'], ['e', 'ersetzter Zahn'], ['i', 'Implantat'], ['t', 'Teleskopkrone'], ['tw', 'erneuerungsbedürftige Teleskopkrone'], ['ur', 'unzureichende Retention'],
]

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const datum = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('.') : iso)
const uhrzeit = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const kiefer = (b: Befund) => [...new Set(Object.keys(b.offen).map((z) => (/^[12]/.test(z) ? 'Oberkiefer' : 'Unterkiefer')))]

export function befundZeigen(kennung: PatientKennung, titel: string, u: BefundUmgebung) {
  const dlg = document.createElement('div')
  dlg.className = 'wahl'
  dlg.setAttribute('role', 'dialog')
  dlg.setAttribute('aria-modal', 'true')
  dlg.setAttribute('aria-label', `Befund ${titel}`)
  document.body.append(dlg)

  let b: Befund | null = null
  let wahl = ''
  let laeuft = ''
  let meldung = ''
  let quelle: EventSource | null = null
  let vorgangVorher = ''

  const zu = () => {
    quelle?.close()
    dlg.remove()
    document.removeEventListener('keydown', taste)
  }
  const taste = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return
    if (wahl) { wahl = ''; zeichnen() } else zu()
  }
  document.addEventListener('keydown', taste)

  function setzen(neu: Befund) {
    if (b && b.patient === neu.patient && b.stand > neu.stand) return
    const v = JSON.stringify(neu.vorgang ?? null)
    if (b && v !== vorgangVorher) u.geaendert?.()
    vorgangVorher = v
    b = neu
  }

  async function laden() {
    laeuft = 'liest'
    zeichnen()
    const q = new URLSearchParams(Object.entries(kennung).filter(([, v]) => v) as [string, string][])
    const r = await apiJson<{ befund?: Befund }>(`/api/befund?${q}`)
    laeuft = ''
    if (r.befund) setzen(r.befund)
    meldung = r.ok ? (r.meldung ? `⚠ ${r.meldung}` : '') : `⚠ ${r.meldung || 'Der Befund ließ sich nicht lesen.'}`
    zeichnen()
    if (b && !quelle && typeof EventSource !== 'undefined') {
      quelle = new EventSource('/api/befund/live')
      quelle.addEventListener('befund', (ev) => {
        try {
          const neu = JSON.parse((ev as MessageEvent).data) as Befund
          if (neu.patient === b?.patient) { setzen(neu); zeichnen() }
        } catch { /* unvollständige Meldung überspringen */ }
      })
    }
  }

  async function senden(pfad: 'aenderung' | 'verwerfen' | 'schreiben', extra: Record<string, unknown> = {}, text = '') {
    if (!b || laeuft) return
    laeuft = pfad
    meldung = text
    zeichnen()
    const r = await apiJson<{ befund?: Befund }>(`/api/befund/${pfad}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patient: b.patient, ...extra }),
    })
    laeuft = ''
    if (r.befund) setzen(r.befund)
    meldung = r.ok ? r.meldung ?? '' : `⚠ ${r.meldung || 'Das hat nicht geklappt.'}`
    if (pfad === 'schreiben' && r.ok) u.geaendert?.()
    zeichnen()
  }

  function aendern(code: string) {
    if (!b || !wahl) return
    const z = wahl
    wahl = ''
    const c = code.trim().toLowerCase()
    if ((b.zaehne[z] ?? '') === c) return zeichnen()
    void senden('aenderung', { zaehne: { [z]: c } })
  }

  function schreiben() {
    if (!b) return
    const offen = Object.keys(b.offen).length
    if (!offen) return void senden('schreiben', {}, 'wird bestätigt …')
    if (!confirm(`Befund in ${b.pvs} als geänderten Befund speichern (ohne 01, ohne Abrechnung)?\n\nGeschrieben wird der ganze ${kiefer(b).join(' und ')}; der bisherige Befund bleibt dort in der Historie.\nDer Patient darf in ${b.pvs} dafür nicht geöffnet sein.`)) return
    void senden('schreiben', {}, `wird in ${b.pvs} gespeichert …`)
  }

  async function neuerPlan() {
    if (!b) return
    const [name, vorname] = b.label.split(',').map((t) => t.trim())
    laeuft = 'stamm'
    zeichnen()
    const r = await apiJson<{ patient?: Stammdaten }>(`/api/pvs/patient?patient=${encodeURIComponent(b.patient)}`)
    laeuft = ''
    const daten: Stammdaten = r.ok && r.patient ? r.patient : { vorname: vorname ?? '', name: name ?? '', geburtsdatum: b.geburt }
    zu()
    u.neuerPlan(daten)
  }

  function schema(x: Befund): string {
    const zelle = (z: string) => {
      const c = x.zaehne[z] ?? ''
      const offen = z in x.offen
      const klasse = ['bz-zahn', offen ? 'offen' : '', c === 'f' ? 'fehlt' : '', z === wahl ? 'gewaehlt' : ''].filter(Boolean).join(' ')
      const hilfe = `${z}: ${c ? SCHNELL.find(([k]) => k === c)?.[1] ?? c : 'vorhanden'}${offen ? ` – noch nicht in ${x.pvs} (dort: ${x.pvsZaehne[z] || 'vorhanden'})` : ''}`
      return `<button type="button" class="${klasse}" data-zahn="${z}" title="${esc(hilfe)}"><b>${esc(c) || '&nbsp;'}</b></button>`
    }
    const nummern = (zs: string[]) => zs.map((z) => `<span class="bz-nr">${z}</span>`).join('')
    return `<div class="bz-schema">
      <div class="bz-reihe">${OK.map(zelle).join('')}</div>
      <div class="bz-reihe nr">${nummern(OK)}</div>
      <div class="bz-mitte"></div>
      <div class="bz-reihe nr">${nummern(UK)}</div>
      <div class="bz-reihe">${UK.map(zelle).join('')}</div>
    </div>`
  }

  function zeichnen() {
    const x = b
    const offen = x ? Object.keys(x.offen).length : 0
    const v = x?.vorgang
    const kopf = x
      ? `${esc(x.label || `Patient ${x.patient}`)}<small>${[x.geburt ? `geb. ${esc(datum(x.geburt))}` : '', `Nr. ${esc(x.patient)}`].filter(Boolean).join(' · ')}</small>`
      : esc(titel)
    const herkunft = x
      ? `aus ${esc(x.pvs)}${x.pvsDatum ? ` vom ${esc(datum(x.pvsDatum))}` : ''}${offen
        ? ` · <b class="bz-offen-text">${offen} ${offen === 1 ? 'Änderung' : 'Änderungen'} noch nicht in ${esc(x.pvs)}${x.offenWer ? ` (${esc(x.offenWer)}, ${esc(uhrzeit(x.stand))})` : ''}</b>`
        : x.geschrieben ? ` · zuletzt gespeichert ${esc(uhrzeit(x.geschrieben))}` : ''}`
      : ''
    const vorgang = v && v.phase !== 'angelegt'
      ? `<p class="bz-vorgang"><b>${v.phase === 'befund' ? 'Befund · noch nichts geplant' : 'in Planung'}</b>${v.auftrag ? ` – ${esc(v.auftrag)}` : ''}${v.freigegeben ? ` · freigegeben ${esc(uhrzeit(v.freigegeben))}` : ''}${v.meldung ? ` · <span class="bz-offen-text">${esc(v.meldung)}</span>` : ''}</p>`
      : ''
    const auswahl = x && wahl
      ? `<div class="bz-wahl" role="group" aria-label="Befund ${wahl}">
          <span>Zahn ${wahl}:</span>
          ${SCHNELL.map(([c, t]) => `<button type="button" data-code="${c}" title="${esc(t)}"${(x.zaehne[wahl] ?? '') === c ? ' class="an"' : ''}>${c || '–'}</button>`).join('')}
          <form data-frei><input type="text" maxlength="6" placeholder="Kürzel" aria-label="anderes Kürzel" autocomplete="off" spellcheck="false"></form>
        </div>`
      : ''
    const knopf = (an: boolean, attr: string, text: string, klasse = 'import-knopf') => (an ? `<button type="button" class="${klasse}" ${attr}${laeuft ? ' disabled' : ''}>${text}</button>` : '')
    dlg.innerHTML = `
      <button type="button" class="wahl-grund" data-zu aria-label="Schließen"></button>
      <div class="wahl-karte befund-karte">
        <div class="wahl-kopf">
          <h2>Befund (01) · ${kopf}</h2>
          <button type="button" data-zu aria-label="Schließen">✕</button>
        </div>
        ${x ? `<p class="pvs-info">${herkunft}</p>${vorgang}${schema(x)}${auswahl}
          <p class="bz-hinweis">${wahl ? 'Kürzel wählen oder eintippen und Enter.' : `Zahn anklicken zum Ändern. Rosa = noch nicht in ${esc(x.pvs)}; gilt aber schon für den nächsten Plan und für ${esc(u.assistentin)}.`}</p>` : ''}
        <p class="pvs-status" role="status">${laeuft === 'liest' ? 'Befund wird aus dem Praxisprogramm geholt …' : laeuft === 'stamm' ? 'Stammdaten werden geholt …' : esc(meldung)}</p>
        ${x ? `<div class="einst-fuss bz-fuss">
          ${knopf(offen > 0, 'data-schreiben', `In ${esc(x.pvs)} speichern (Befund ändern)`, 'neu-knopf')}
          ${knopf(!offen && v?.phase === 'befund', 'data-schreiben', 'Befund stimmt – freigeben', 'neu-knopf')}
          ${knopf(offen > 0, 'data-verwerfen', 'Änderungen verwerfen')}
          ${knopf(true, 'data-neu-lesen', `Neu aus ${esc(x.pvs)} lesen`)}
          ${knopf(true, 'data-neuer-plan', 'Neuer Plan für diesen Patienten')}
        </div>` : ''}
      </div>`
    dlg.querySelectorAll('[data-zu]').forEach((k) => k.addEventListener('click', zu))
    dlg.querySelectorAll<HTMLButtonElement>('[data-zahn]').forEach((k) => k.addEventListener('click', () => {
      wahl = wahl === k.dataset.zahn ? '' : k.dataset.zahn!
      zeichnen()
      dlg.querySelector<HTMLInputElement>('[data-frei] input')?.focus()
    }))
    dlg.querySelectorAll<HTMLButtonElement>('[data-code]').forEach((k) => k.addEventListener('click', () => aendern(k.dataset.code ?? '')))
    dlg.querySelector<HTMLFormElement>('[data-frei]')?.addEventListener('submit', (ev) => {
      ev.preventDefault()
      aendern((ev.currentTarget as HTMLFormElement).querySelector('input')!.value)
    })
    dlg.querySelectorAll('[data-schreiben]').forEach((k) => k.addEventListener('click', schreiben))
    dlg.querySelector('[data-verwerfen]')?.addEventListener('click', () => {
      if (b && confirm(`Offene Änderungen verwerfen? Es gilt wieder der Befund aus ${b.pvs}.`)) void senden('verwerfen')
    })
    dlg.querySelector('[data-neu-lesen]')?.addEventListener('click', () => void laden())
    dlg.querySelector('[data-neuer-plan]')?.addEventListener('click', () => void neuerPlan())
  }

  void laden()
}

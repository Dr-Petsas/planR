/**
 * Einrichtungsassistent: Praxissystem wählen, Bridge-Schlüssel erzeugen, Bridge installieren, Verbindung prüfen,
 * Preise & Positionen übernehmen. Die Anleitung je PVS zeigt auch die Bestätigungsseite der Buchung.
 */
import './einrichtung.css'
import { PVS_LISTE, pvsVon, type Einstellungen } from './einstellungen'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

interface Anleitung { rechner: string; ordner: string; schritte: string[]; preise: string }

const BRIDGE_SCHRITTE = (ordner: string) => [
  '<b>PlanR-Bridge herunterladen</b> (ZIP, etwa 15 MB – Python ist enthalten) und auf dem Rechner entpacken.',
  '<code>Installieren.cmd</code> doppelklicken und die Admin-Abfrage von Windows bestätigen.',
  'Nach <b>Mandant</b> und <b>Bridge-Schlüssel</b> gefragt: die beiden Werte aus dem Schritt „Bridge-Schlüssel“ im Einrichtungsassistenten einfügen.',
  `Findet die Installation das Praxisprogramm nicht selbst, nach dem Ordner fragen lassen – ${ordner}.`,
  'Das Fenster meldet „Connector bereit“ und „PlanR verbunden“. Der Dienst startet ab jetzt mit dem Rechner; am Server wird kein Port geöffnet.',
]

const ANLEITUNGEN: Record<string, Anleitung> = {
  dampsoft: {
    rechner: 'Am besten auf dem Server, auf dem der DS-Win-Ordner <code>TDAMP</code> liegt und den die Arbeitsplätze als Netzlaufwerk verbinden. Geht auch an einem Arbeitsplatz-PC, der dauerhaft läuft; dann fragt die Installation nach einem Windows-Konto, das die Freigabe öffnen darf.',
    ordner: 'z. B. <code>D:\\TDAMP\\DS</code> oder <code>\\\\SERVER\\TDAMP\\DS</code>',
    schritte: BRIDGE_SCHRITTE('z. B. <code>D:\\TDAMP\\DS</code> oder <code>\\\\SERVER\\TDAMP\\DS</code>'),
    preise: 'PlanR liest aus DS-Win die Eigenlabor-Preise (BEL und BEB), Materialkürzel, eigene GOZ- und Analogpositionen mit Faktor sowie Ihre privaten Kürzel und Komplexe.',
  },
  dens: {
    rechner: 'Auf dem Rechner, auf dem die DENSoffice-Datenbank liegt (meist der Praxisserver). DENSoffice selbst bleibt unverändert; Abrechnung und TI laufen weiter dort.',
    ordner: 'den DENSoffice-Programmordner, z. B. <code>C:\\DENS</code>',
    schritte: BRIDGE_SCHRITTE('den DENSoffice-Programmordner, z. B. <code>C:\\DENS</code>'),
    preise: 'PlanR liest aus DENSoffice die Laborpreise und eigenen Positionen; fertige HKPs gehen direkt in die Prothetik des Patienten.',
  },
}

export const anleitungVon = (pvs: string) => ANLEITUNGEN[pvs] ?? null

/** Anleitung als HTML (Bestätigungsseite und Assistent) */
export function anleitungHtml(pvsId: string, mitDownload = true): string {
  const pvs = pvsVon(pvsId)
  const a = anleitungVon(pvsId)
  if (!pvs) return ''
  if (!a) {
    return `<div class="ein-hinweis"><b>${esc(pvs.name)}</b>: Die direkte Anbindung ist in Vorbereitung (${esc(pvs.weg)}).
      Wir melden uns zur Einrichtung bei Ihnen. Bis dahin erstellen Sie alle Pläne in PlanR und übernehmen sie per Druck bzw. PDF.</div>`
  }
  return `
    <p class="ein-text"><b>Wo installieren?</b> ${a.rechner}</p>
    ${mitDownload ? '<p><a class="neu-knopf ein-download" href="/download/PlanR-Agent.zip" download>PlanR-Bridge herunterladen</a></p>' : ''}
    <ol class="ein-liste">${a.schritte.map((s) => `<li>${s}</li>`).join('')}</ol>
    <p class="ein-klein">Notaus: Datei <code>STOP</code> in <code>C:\\ProgramData\\PlanR-Agent</code> anlegen. Entfernen: <code>Installieren.cmd /entfernen</code>.</p>`
}

interface Stand { mandant: string; eingerichtet: boolean; verbunden: boolean; pvs?: string; version?: string }
interface Katalog { anzahl?: Record<string, number>; pvs?: string }

const SCHRITTE = ['Praxissystem', 'Bridge-Schlüssel', 'Installieren', 'Verbindung', 'Preise & Positionen', 'Fertig'] as const

/**
 * Assistent als eigenes Fenster über der Planliste. `geaendert` meldet neue Einstellungen bzw. Katalog an die Übersicht,
 * `importieren` öffnet am Ende „Plan importieren“.
 */
export function einrichtungOeffnen(o: { admin: boolean; einstellungen: Einstellungen; geaendert: () => void; importieren: () => void }) {
  document.querySelector('.ein-schleier')?.remove()
  let schritt = 0
  let einst = o.einstellungen
  let stand: Stand | null = null
  let schluessel = ''
  let katalog: Katalog | null = null
  let laeuft = false
  let meldung = ''
  let uhr = 0

  const schleier = document.createElement('div')
  schleier.className = 'ein-schleier'
  document.body.append(schleier)
  const zu = () => { clearInterval(uhr); schleier.remove(); removeEventListener('keydown', taste); if (location.hash === '#einrichtung') history.replaceState(null, '', location.pathname + location.search) }
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu() }
  addEventListener('keydown', taste)
  schleier.addEventListener('click', (e) => { if (e.target === schleier) zu() })

  const standLaden = async () => {
    try {
      const d = await (await fetch('/api/bridge-schluessel', { cache: 'no-store' })).json() as Stand & { ok: boolean }
      if (d.ok) stand = d
    } catch { /* bleibt */ }
  }
  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: r.status, d: await r.json().catch(() => ({})) as Record<string, unknown> }
  }

  const pvs = () => pvsVon(einst.pvs)
  const anbindbar = () => !!anleitungVon(einst.pvs)

  function inhalt(): string {
    const p = pvs()
    switch (schritt) {
      case 0: return `
        <h3>Welches Praxisverwaltungssystem nutzen Sie?</h3>
        <p class="ein-text">PlanR holt Patienten und HKPs von dort und gibt fertige Pläne zurück.</p>
        <div class="ein-pvs">${PVS_LISTE.map((x) => `<button type="button" class="ein-pvs-wahl${x.id === einst.pvs ? ' an' : ''}" data-pvs="${x.id}">
          <b>${esc(x.name)}</b><small>${esc(x.hersteller)}</small><i class="${x.bereit ? 'bereit' : 'bald'}">${x.bereit ? 'Anbindung verfügbar' : 'in Vorbereitung'}</i></button>`).join('')}</div>
        ${o.admin ? '' : '<p class="ein-hinweis">Das Praxissystem stellt der Praxis-Admin ein.</p>'}`
      case 1: return !anbindbar() ? anleitungHtml(einst.pvs) : `
        <h3>Bridge-Schlüssel für Ihre Praxis</h3>
        <p class="ein-text">Mit Mandant und Schlüssel meldet sich die Bridge auf Ihrem Praxisserver bei PlanR an. Der Schlüssel wird <b>nur jetzt</b> angezeigt – am besten gleich in die Installation einfügen oder sicher notieren.</p>
        ${schluessel ? `
          <div class="ein-werte">
            <label>Mandant<span><code>${esc(stand?.mandant ?? '')}</code><button type="button" data-kopie="${esc(stand?.mandant ?? '')}">Kopieren</button></span></label>
            <label>Bridge-Schlüssel<span><code>${esc(schluessel)}</code><button type="button" data-kopie="${esc(schluessel)}">Kopieren</button></span></label>
          </div>`
        : stand?.eingerichtet ? `
          <p class="ein-ok">Für Ihre Praxis ist schon ein Schlüssel eingerichtet${stand.verbunden ? ' und die Bridge ist verbunden' : ''}.</p>
          ${o.admin ? '<button type="button" class="import-knopf" data-schluessel-neu>Neuen Schlüssel erzeugen (trennt die laufende Bridge)</button>' : ''}`
        : o.admin ? '<button type="button" class="neu-knopf" data-schluessel>Bridge-Schlüssel erzeugen</button>'
        : '<p class="ein-hinweis">Den Schlüssel erzeugt der Praxis-Admin.</p>'}`
      case 2: return `<h3>Bridge auf dem Praxisserver installieren</h3>${anleitungHtml(einst.pvs)}`
      case 3: return `
        <h3>Verbindung prüfen</h3>
        ${stand?.verbunden
          ? `<p class="ein-ok big">✓ PlanR ist mit ${esc(stand.pvs || p?.name || 'Ihrem Praxissystem')} verbunden${stand.version ? ` (Bridge ${esc(stand.version)})` : ''}.</p>`
          : `<p class="ein-warte"><span class="ein-punkt"></span> Warte auf die Bridge … Sobald die Installation „PlanR verbunden“ meldet, geht es hier weiter.</p>
             <p class="ein-klein">Klappt es nicht? Läuft der Rechner, hat er Internet, und ist der Schlüssel aus Schritt 2 eingetragen? Wir helfen gern: 0211 3029 3035.</p>`}`
      case 4: return `
        <h3>Preise &amp; Positionen übernehmen</h3>
        <p class="ein-text">${esc(anleitungVon(einst.pvs)?.preise ?? '')} So rechnet PlanR von Anfang an mit Ihren eigenen Preisen.</p>
        ${katalog?.anzahl
          ? `<p class="ein-ok">✓ Übernommen: ${Object.entries({ bel: 'BEL-Preise', eigenlabor: 'Eigenlabor-Preise', material: 'Materialien', goz: 'eigene GOZ-/Analogpositionen', kuerzel: 'Kürzel', komplexe: 'Komplexe' })
            .map(([k, n]) => `${katalog!.anzahl![k] ?? 0} ${n}`).join(', ')}.</p>
             <p class="ein-klein">Preisliste und Preisspalte (Eigen- oder Fremdlabor) stellen Sie unter Einstellungen → Preise &amp; Positionen ein.</p>`
          : `<button type="button" class="neu-knopf" data-katalog${laeuft || !stand?.verbunden ? ' disabled' : ''}>${laeuft ? 'Wird übernommen …' : 'Jetzt übernehmen'}</button>
             ${stand?.verbunden ? '' : '<p class="ein-klein">Geht, sobald die Bridge verbunden ist.</p>'}`}`
      default: return `
        <h3>Fertig – PlanR ist eingerichtet.</h3>
        <p class="ein-text">Holen Sie jetzt den ersten HKP aus ${esc(p?.name ?? 'Ihrem Praxissystem')}, ziehen Sie die Regler und sehen Sie, wie viel mehr Umsatz im selben Befund steckt.</p>
        <div class="ein-fertig">
          <button type="button" class="neu-knopf" data-importieren>Ersten HKP importieren</button>
          <a class="import-knopf" href="/download" target="_blank" rel="noopener">Anleitung zur Bridge</a>
        </div>`
    }
  }

  function weiterErlaubt(): boolean {
    if (schritt === 0) return !!einst.pvs
    if (!anbindbar() && schritt >= 1) return false
    if (schritt === 1) return !!schluessel || !!stand?.eingerichtet
    return true
  }

  function zeichnen() {
    const fertigBis = !anbindbar() && einst.pvs ? 1 : SCHRITTE.length - 1
    schleier.innerHTML = `
      <div class="ein-karte" role="dialog" aria-modal="true" aria-label="PlanR einrichten">
        <header class="ein-kopf">
          <div><h2>PlanR einrichten</h2><p>${esc(pvs()?.name ?? 'Praxissystem verbinden')}</p></div>
          <button type="button" class="ein-zu" data-zu aria-label="Schließen">×</button>
        </header>
        <ol class="ein-schritte">${SCHRITTE.slice(0, fertigBis + 1).map((s, i) => `<li class="${i < schritt ? 'erledigt' : i === schritt ? 'aktiv' : ''}"><span>${i + 1}</span>${s}</li>`).join('')}</ol>
        <div class="ein-inhalt">${inhalt()}</div>
        ${meldung ? `<p class="ein-meldung" role="status">${esc(meldung)}</p>` : ''}
        <footer class="ein-fuss">
          ${schritt > 0 ? '<button type="button" class="link-knopf" data-zurueck>← Zurück</button>' : '<span></span>'}
          ${schritt < fertigBis ? `<button type="button" class="neu-knopf" data-weiter${weiterErlaubt() ? '' : ' disabled'}>Weiter</button>` : '<button type="button" class="neu-knopf" data-zu>Schließen</button>'}
        </footer>
      </div>`
    const $ = <T extends Element = HTMLElement>(s: string) => schleier.querySelector<T>(s)
    schleier.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', zu))
    $('[data-zurueck]')?.addEventListener('click', () => { schritt -= 1; meldung = ''; zeichnen() })
    $('[data-weiter]')?.addEventListener('click', () => { schritt += 1; meldung = ''; zeichnen() })
    schleier.querySelectorAll<HTMLButtonElement>('[data-pvs]').forEach((b) => b.addEventListener('click', async () => {
      if (!o.admin) return
      const neu = { ...einst, pvs: b.dataset.pvs!, bridge: true }
      const r = await post('/api/einstellungen', neu)
      if (r.d.ok) { einst = r.d.einstellungen as Einstellungen; meldung = ''; o.geaendert() } else meldung = String(r.d.meldung ?? 'Speichern hat nicht geklappt.')
      zeichnen()
    }))
    const erzeugen = async (neu: boolean) => {
      if (neu && !confirm('Neuen Bridge-Schlüssel erzeugen? Die laufende Bridge ist danach getrennt, bis der neue Schlüssel eingetragen ist.')) return
      const r = await post('/api/bridge-schluessel', { neu })
      if (r.d.ok) { schluessel = String(r.d.schluessel); stand = { ...(stand ?? { verbunden: false }), mandant: String(r.d.mandant), eingerichtet: true, verbunden: false }; meldung = '' }
      else meldung = String(r.d.meldung ?? 'Das hat nicht geklappt.')
      zeichnen()
    }
    $('[data-schluessel]')?.addEventListener('click', () => void erzeugen(false))
    $('[data-schluessel-neu]')?.addEventListener('click', () => void erzeugen(true))
    schleier.querySelectorAll<HTMLButtonElement>('[data-kopie]').forEach((b) => b.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(b.dataset.kopie ?? '').catch(() => undefined)
      b.textContent = 'Kopiert'
    }))
    $('[data-katalog]')?.addEventListener('click', async () => {
      laeuft = true
      zeichnen()
      const r = await post('/api/praxiskatalog', { abgleich: true })
      laeuft = false
      if (r.d.ok) { katalog = r.d.info as Katalog; o.geaendert() } else meldung = String(r.d.meldung ?? 'Das hat gerade nicht geklappt.')
      zeichnen()
    })
    $('[data-importieren]')?.addEventListener('click', () => { zu(); o.importieren() })
  }

  // Verbindung live verfolgen, solange der Assistent offen ist
  uhr = window.setInterval(async () => {
    if (!schleier.isConnected) return clearInterval(uhr)
    if (schritt < 2 || schritt > 4) return
    const vorher = stand?.verbunden
    await standLaden()
    if (stand?.verbunden !== vorher && !laeuft) zeichnen()
  }, 4000)

  void standLaden().then(() => {
    if (einst.pvs) schritt = stand?.verbunden ? 4 : stand?.eingerichtet ? 2 : 1
    zeichnen()
  })
  zeichnen()
}

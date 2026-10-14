/**
 * Einrichtungsassistent: Praxissystem wählen, Bridge-Setup laden und starten (Fortschritt live), Verbindung prüfen,
 * Preise & Positionen übernehmen. Die Anleitung je PVS zeigt auch die Bestätigungsseite der Buchung.
 */
import './einrichtung.css'
import { PVS_LISTE, pvsVon, type Einstellungen } from './einstellungen'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const dauer = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` }

interface Anleitung { rechner: string; ordner: string; schritte: string[]; preise: string }

const BRIDGE_SCHRITTE = (ordner: string) => [
  '<b>PlanR-Bridge herunterladen</b> – am besten gleich an diesem Rechner. Sitzen Sie gerade an einem anderen, kopieren Sie die Datei per USB-Stick oder Netzwerk hinüber.',
  'Die Datei <b>PlanR-Bridge-Setup-….exe</b> öffnen (im Browser unten bzw. oben rechts oder im Ordner „Downloads“) und die Windows-Frage mit <b>„Ja“</b> beantworten.',
  `Das Setup richtet alles selbst ein – etwa eine Minute; den Fortschritt sehen Sie auch hier. Nur falls es das Praxisprogramm nicht findet, fragt es nach dem Ordner – ${ordner}.`,
]
const WARNUNGEN = 'Warnt Windows mit „Der Computer wurde durch Windows geschützt“? Auf <b>„Weitere Informationen“</b> und dann <b>„Trotzdem ausführen“</b> klicken. Fragt der Browser, ob Sie die Datei behalten möchten: <b>„Behalten“</b>.'

/** Die Schritte des Setups (PlanRBridge.exe); es meldet „Schritt x von 5“. */
const SETUP_SCHRITTE = ['Programm einrichten', 'Zugang Ihrer Praxis holen', 'Praxisprogramm suchen', 'Windows-Dienst „PlanR-Bridge“ starten', 'Verbindung zu PlanR prüfen']
interface SetupStand { schritt: number; gesamt: number; text: string; fehler: boolean; fertig: boolean; details: string; vor: number }

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
export function anleitungHtml(pvsId: string, mitDownload = false): string {
  const pvs = pvsVon(pvsId)
  const a = anleitungVon(pvsId)
  if (!pvs) return ''
  if (!a) {
    return `<div class="ein-hinweis"><b>${esc(pvs.name)}</b>: Die direkte Anbindung ist in Vorbereitung (${esc(pvs.weg)}).
      Wir melden uns zur Einrichtung bei Ihnen. Bis dahin erstellen Sie alle Pläne in PlanR und übernehmen sie per Druck bzw. PDF.</div>`
  }
  return `
    <p class="ein-text"><b>Wo installieren?</b> ${a.rechner}</p>
    ${mitDownload ? '<div data-paket-platz></div>' : ''}
    <ol class="ein-liste">${a.schritte.map((s) => `<li>${s}</li>`).join('')}</ol>
    <p class="ein-klein">${WARNUNGEN}</p>
    ${mitDownload ? '<p class="ein-klein" data-zip-platz></p>' : ''}
    <p class="ein-klein">Entfernen: Windows-Einstellungen → Apps → „PlanR-Bridge“ → Deinstallieren. Notaus: Datei <code>STOP</code> in <code>C:\\ProgramData\\PlanR-Bridge</code> anlegen.</p>`
}

type Download = { ok: true; code: string } | { ok: false; status: number; meldung: string }

async function herunterladen(url: string, name: string): Promise<Download> {
  try {
    const r = await fetch(url, { method: 'POST' })
    if (!r.ok) return { ok: false, status: r.status, meldung: String(((await r.json().catch(() => ({}))) as { meldung?: string }).meldung ?? 'Der Download hat nicht geklappt.') }
    const adresse = URL.createObjectURL(await r.blob())
    const a = document.createElement('a')
    a.href = adresse
    a.download = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(adresse), 60_000)
    return { ok: true, code: r.headers.get('X-PlanR-Code') ?? '' }
  } catch {
    return { ok: false, status: 0, meldung: 'Der Download hat nicht geklappt. Bitte die Internetverbindung prüfen.' }
  }
}

/** Bridge-Setup der eigenen Praxis; der Einrichtungscode steht im Dateinamen. status 401/403: nicht (als Admin) angemeldet. */
export const bridgeSetupLaden = () => herunterladen('/api/bridge-setup', 'PlanR-Bridge-Setup.exe')
/** ZIP-Paket mit Installieren.cmd für IT-Dienstleister (Zugang liegt im Paket) */
export const bridgePaketLaden = () => herunterladen('/api/bridge-paket', 'PlanR-Bridge.zip')

/** Code zum Abtippen, falls das Setup danach fragt (umbenannte Datei) */
export const codeLesbar = (code: string) => code.replace(/^(.{4})(.{4})$/, '$1-$2')

/** Fortschritt des Setups auf dem Praxisrechner, wie es ihn an PlanR meldet */
export function setupHtml(s: SetupStand): string {
  const stumm = !s.fertig && !s.fehler && s.vor > 300
  const zustand = (k: number) => s.fertig || k < s.schritt ? 'ok' : k === s.schritt ? (s.fehler ? 'fehler' : 'aktiv') : ''
  return `<div class="ein-setup" role="status" aria-live="polite">
    <b>${s.fertig ? 'Setup abgeschlossen' : s.fehler ? 'Das Setup ist nicht durchgelaufen' : 'Setup läuft auf dem Praxisrechner …'}</b>
    <ol>${SETUP_SCHRITTE.map((n, i) => `<li class="${zustand(i + 1)}">${n}</li>`).join('')}</ol>
    ${s.fehler ? `<p class="ein-setup-fehler">${esc(s.text)}</p>
      <p class="ein-klein">Das Setup-Fenster zeigt „Erneut versuchen“. Klappt es nicht, rufen Sie uns an: 0211 3029 3035 – wir sehen Ihre Meldung.</p>
      ${s.details ? `<details class="ein-klein"><summary>Technische Details</summary><pre>${esc(s.details)}</pre></details>` : ''}`
      : stumm ? '<p class="ein-klein">Das Setup meldet sich seit einigen Minuten nicht mehr. Ist sein Fenster noch offen – wartet es vielleicht auf eine Eingabe?</p>' : ''}
  </div>`
}

/** geprueft: Die Prüfung im Installer hat PlanR erreicht, der Windows-Dienst meldet sich aber (noch) nicht. */
interface Stand { mandant: string; eingerichtet: boolean; verbunden: boolean; geprueft?: boolean; setup?: SetupStand; pvs?: string; version?: string; status?: string }
interface Katalog { anzahl?: Record<string, number>; pvs?: string }

const SCHRITTE = ['Praxissystem', 'Installieren', 'Verbindung', 'Preise & Positionen', 'Fertig'] as const

/**
 * Assistent als eigenes Fenster über der Planliste. `geaendert` meldet neue Einstellungen bzw. Katalog an die Übersicht,
 * `importieren` öffnet am Ende die Patientensuche.
 */
export function einrichtungOeffnen(o: { admin: boolean; einstellungen: Einstellungen; geaendert: () => void; importieren: () => void; bridgeLaden?: boolean }) {
  document.querySelector('.ein-schleier')?.remove()
  let schritt = 0
  let einst = o.einstellungen
  let stand: Stand | null = null
  let paketGeladen = false
  let code = ''
  let zipGeladen = false
  let katalog: Katalog | null = null
  let laeuft = false
  let meldung = ''
  let uhr = 0
  let katalogSeit = 0
  let katalogUhr = 0

  const schleier = document.createElement('div')
  schleier.className = 'ein-schleier'
  document.body.append(schleier)
  const zu = () => {
    if (katalogSeit && !confirm('Preise & Positionen werden gerade übernommen. Wirklich schließen? Der Vorgang läuft auf dem Server weiter; das Ergebnis sehen Sie später unter Einstellungen → Preise & Positionen.')) return
    clearInterval(uhr); clearInterval(katalogUhr); schleier.remove(); removeEventListener('keydown', taste); if (location.hash === '#einrichtung') history.replaceState(null, '', location.pathname + location.search) }
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
  /** Ältere Bridges melden keinen Zustand – dann gilt verbunden als bereit. */
  const bridgeBereit = () => !!stand?.verbunden && (!stand.status || stand.status === 'bereit')
  const ENDE = '„Dienst \'PlanR-Bridge\' ist eingerichtet“'

  function inhalt(): string {
    const p = pvs()
    switch (schritt) {
      case 0: return `
        <h3>Welches Praxisverwaltungssystem nutzen Sie?</h3>
        <p class="ein-text">PlanR holt Patienten und HKPs von dort und gibt fertige Pläne zurück.</p>
        <div class="ein-pvs">${PVS_LISTE.map((x) => `<button type="button" class="ein-pvs-wahl${x.id === einst.pvs ? ' an' : ''}" data-pvs="${x.id}">
          <b>${esc(x.name)}</b><small>${esc(x.hersteller)}</small><i class="${x.bereit ? 'bereit' : 'bald'}">${x.bereit ? 'Anbindung verfügbar' : 'in Vorbereitung'}</i></button>`).join('')}</div>
        ${o.admin ? '' : '<p class="ein-hinweis">Das Praxissystem stellt der Praxis-Admin ein.</p>'}`
      case 1: return !anbindbar() ? anleitungHtml(einst.pvs) : `<h3>Bridge auf dem Praxisserver installieren</h3>${anleitungHtml(einst.pvs, true)}`
      case 2: return `
        <h3>Verbindung prüfen</h3>
        ${stand?.verbunden
          ? `<p class="ein-ok big">✓ PlanR ist mit ${esc(pvsVon(stand.pvs ?? '')?.name || stand.pvs || p?.name || 'Ihrem Praxissystem')} verbunden${stand.version ? ` (Bridge ${esc(stand.version)})` : ''}.</p>
             ${bridgeBereit() ? '' : `<p class="ein-warte"><span class="ein-punkt"></span> Die Bridge meldet: ${esc(stand.status ?? '')}</p>
             <p class="ein-klein">Der Connector braucht nach der Installation bis zu einer Minute. Bleibt die Meldung, rufen Sie uns an: 0211 3029 3035.</p>`}`
          : stand?.setup
            ? setupHtml(stand.setup)
          : stand?.geprueft
            ? `<p class="ein-ok">✓ Installation geprüft: Der Praxisrechner erreicht PlanR.</p>
               <p class="ein-warte"><span class="ein-punkt"></span> Warte auf den Windows-Dienst „PlanR-Bridge“ … Bitte das Installationsfenster offen lassen, bis es ${ENDE} meldet.</p>
               <p class="ein-klein">Hat die Installation mit einer roten Fehlermeldung geendet oder das Fenster geschlossen? Dann Installieren.cmd noch einmal starten. Protokoll: <code>C:\\ProgramData\\PlanR-Bridge\\agent.log</code> – wir helfen gern: 0211 3029 3035.</p>`
            : `<p class="ein-warte"><span class="ein-punkt"></span> Warte auf die Bridge … Sobald das Setup „Fertig“ meldet, geht es hier weiter.</p>
               <p class="ein-klein">Klappt es nicht? Läuft der Rechner, hat er Internet, und wurde das Setup geöffnet und mit „Ja“ bestätigt? Wir helfen gern: 0211 3029 3035.</p>`}`
      case 3: return `
        <h3>Preise &amp; Positionen übernehmen</h3>
        <p class="ein-text">${esc(anleitungVon(einst.pvs)?.preise ?? '')} So rechnet PlanR von Anfang an mit Ihren eigenen Preisen.</p>
        ${katalog?.anzahl
          ? `<p class="ein-ok">✓ Übernommen: ${Object.entries({ bel: 'BEL-Preise', eigenlabor: 'Eigenlabor-Preise', material: 'Materialien', goz: 'eigene GOZ-/Analogpositionen', kuerzel: 'Kürzel', komplexe: 'Komplexe' })
            .map(([k, n]) => `${katalog!.anzahl![k] ?? 0} ${n}`).join(', ')}.</p>
             <p class="ein-klein">Preisliste und Preisspalte (Eigen- oder Fremdlabor) stellen Sie unter Einstellungen → Preise &amp; Positionen ein.</p>`
          : katalogSeit
            ? `<div class="ein-fortschritt" role="status" aria-live="polite">
                 <span class="ein-spinner" aria-hidden="true"></span>
                 <div><b>Preise &amp; Positionen werden aus ${esc(p?.name ?? 'dem Praxissystem')} gelesen …</b>
                   <p>Läuft seit <span data-katalog-uhr>${dauer(Date.now() - katalogSeit)}</span>. Dauert ca. 5 Minuten – bitte das Fenster offen lassen und den Vorgang nicht abbrechen.</p></div>
               </div>`
            : `<button type="button" class="neu-knopf" data-katalog${laeuft || !stand?.verbunden || !bridgeBereit() ? ' disabled' : ''}>Jetzt übernehmen</button>
               <p class="ein-klein">Dauert ca. 5 Minuten.${!stand?.verbunden ? (stand?.geprueft ? ' Geht, sobald der Windows-Dienst „PlanR-Bridge“ läuft.' : ' Geht, sobald die Bridge verbunden ist.') : bridgeBereit() ? '' : ` Geht, sobald die Bridge bereit ist – sie meldet: ${esc(stand.status ?? '')}`}</p>`}`
      default: return `
        <h3>Fertig – PlanR ist eingerichtet.</h3>
        <p class="ein-text">Holen Sie jetzt den ersten HKP aus ${esc(p?.name ?? 'Ihrem Praxissystem')}, ziehen Sie die Regler und sehen Sie, wie viel mehr Umsatz im selben Befund steckt.</p>
        <div class="ein-fertig">
          <button type="button" class="neu-knopf" data-importieren>Patienten suchen und ersten HKP erstellen</button>
          <button type="button" class="import-knopf" data-zur-bridge>Bridge erneut herunterladen</button>
        </div>`
    }
  }

  function weiterErlaubt(): boolean {
    if (schritt === 0) return !!einst.pvs
    if (!anbindbar() && schritt >= 1) return false
    if (schritt === 1) return paketGeladen || !!stand?.eingerichtet
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
          ${schritt > 0 ? `<button type="button" class="link-knopf" data-zurueck${katalogSeit ? ' disabled' : ''}>← Zurück</button>` : '<span></span>'}
          ${schritt < fertigBis ? `<button type="button" class="neu-knopf" data-weiter${weiterErlaubt() && !katalogSeit ? '' : ' disabled'}>Weiter</button>` : '<button type="button" class="neu-knopf" data-zu>Schließen</button>'}
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
    const platz = $('[data-paket-platz]')
    if (platz) {
      platz.innerHTML = !o.admin ? '<p class="ein-hinweis">Das Setup lädt der Praxis-Admin herunter – es holt sich den Zugang Ihrer Praxis.</p>'
        : `<p><button type="button" class="neu-knopf ein-download" data-setup${laeuft ? ' disabled' : ''}>${laeuft ? 'Setup wird vorbereitet …' : paketGeladen ? 'Erneut herunterladen' : 'PlanR-Bridge herunterladen'}</button></p>
           ${paketGeladen ? `<p class="ein-ok">✓ Heruntergeladen (Ordner „Downloads“) – jetzt die Datei öffnen.${code ? ` Fragt das Setup nach einem Code: <b class="ein-code">${esc(codeLesbar(code))}</b>` : ''}</p>` : ''}
           ${stand?.setup ? setupHtml(stand.setup) : ''}`
    }
    const zipPlatz = $('[data-zip-platz]')
    if (zipPlatz && o.admin) {
      zipPlatz.innerHTML = zipGeladen ? '✓ ZIP-Paket heruntergeladen: entpacken und <code>Installieren.cmd</code> als Administrator ausführen.'
        : `<button type="button" class="link-knopf" data-paket${laeuft ? ' disabled' : ''}>Für IT-Dienstleister: Bridge als ZIP-Paket mit Installieren.cmd</button>`
    }
    const laden = (zip: boolean) => async () => {
      laeuft = true
      meldung = ''
      zeichnen()
      const r = await (zip ? bridgePaketLaden() : bridgeSetupLaden())
      if (r.ok) {
        if (zip) zipGeladen = true
        else { paketGeladen = true; code = r.code }
        stand = { ...(stand ?? { mandant: '', verbunden: false }), eingerichtet: true }
      } else meldung = r.meldung
      laeuft = false
      zeichnen()
    }
    $('[data-setup]')?.addEventListener('click', laden(false))
    $('[data-paket]')?.addEventListener('click', laden(true))
    $('[data-katalog]')?.addEventListener('click', async () => {
      laeuft = true
      meldung = ''
      katalogSeit = Date.now()
      katalogUhr = window.setInterval(() => {
        const z = schleier.querySelector('[data-katalog-uhr]')
        if (z) z.textContent = dauer(Date.now() - katalogSeit)
      }, 1000)
      zeichnen()
      const r = await post('/api/praxiskatalog', { abgleich: true })
        .catch(() => ({ status: 0, d: { meldung: 'Die Verbindung zu PlanR ist abgerissen. Bitte „Jetzt übernehmen“ noch einmal klicken.' } as Record<string, unknown> }))
      clearInterval(katalogUhr)
      katalogSeit = 0
      laeuft = false
      if (r.d.ok) { katalog = r.d.info as Katalog; o.geaendert() } else meldung = String(r.d.meldung ?? 'Das hat gerade nicht geklappt.')
      zeichnen()
    })
    $('[data-importieren]')?.addEventListener('click', () => { zu(); o.importieren() })
    $('[data-zur-bridge]')?.addEventListener('click', () => { schritt = 1; meldung = ''; zeichnen() })
  }

  // Verbindung live verfolgen, solange der Assistent offen ist
  uhr = window.setInterval(async () => {
    if (!schleier.isConnected) return clearInterval(uhr)
    if (schritt < 1 || schritt > 3) return
    const merkmal = () => `${stand?.verbunden}|${stand?.status}|${stand?.geprueft}|${JSON.stringify({ ...stand?.setup, vor: (stand?.setup?.vor ?? 0) > 300 })}`
    const vorher = merkmal()
    const warBereit = bridgeBereit()
    const warFertig = !!stand?.setup?.fertig
    await standLaden()
    if (laeuft || merkmal() === vorher) return
    // Meldet das Setup „fertig“ bzw. wird die Bridge jetzt bereit, geht es von selbst zur Verbindung.
    if (schritt === 1 && ((!warFertig && stand?.setup?.fertig) || (!warBereit && bridgeBereit()))) { schritt = 2; meldung = '' }
    zeichnen()
  }, 4000)

  void standLaden().then(() => {
    if (einst.pvs) schritt = stand?.verbunden && !o.bridgeLaden ? 3 : 1
    zeichnen()
  })
  zeichnen()
}

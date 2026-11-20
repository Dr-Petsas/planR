/**
 * Einrichtungsassistent: Praxisprogramm wählen, richtigen Computer klären, Bridge-Setup laden und öffnen (Fortschritt live),
 * Preise & Positionen übernehmen; unten die Hilfe-Zeile. Die Anleitung je PVS zeigt auch die Bestätigungsseite der Buchung.
 */
import './einrichtung.css'
import { PVS_LISTE, pvsVon, type Einstellungen } from './einstellungen'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const dauer = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min` }

interface Anleitung { rechner: string; ordner: string; schritte: string[]; preise: string }

const BRIDGE_SCHRITTE = (ordner: string) => [
  '<b>Der Download startet von selbst.</b> Die Datei heißt <b>PlanR-Bridge.zip</b> und liegt im Ordner „Downloads“. Eine Anmeldung ist dafür nicht nötig. Sitzen Sie an einem anderen Rechner, kopieren Sie die Datei auf den Praxisrechner.',
  'Die ZIP entpacken (Rechtsklick → „Alle extrahieren“). Dann <b>Installieren.cmd</b> öffnen und die Windows-Frage mit <b>„Ja“</b> beantworten.',
  `Das Fenster richtet alles selbst ein – etwa eine Minute. Nur falls es das Praxisprogramm nicht findet, fragt es nach dem Ordner – ${ordner}.`,
]
const WARNUNGEN = 'Warnt Windows mit „Der Computer wurde durch Windows geschützt“? Auf <b>„Weitere Informationen“</b> und dann <b>„Trotzdem ausführen“</b> klicken. Fragt der Browser, ob Sie die Datei behalten möchten: <b>„Behalten“</b>.'

/** Die Schritte des Setups (PlanRBridge.exe); es meldet „Schritt x von 5“. */
const SETUP_SCHRITTE = ['Programm einrichten', 'Zugang Ihrer Praxis holen', 'Praxisprogramm suchen', 'Windows-Dienst „PlanR-Bridge“ starten', 'Verbindung zu PlanR prüfen']
interface SetupStand { schritt: number; gesamt: number; text: string; fehler: boolean; fertig: boolean; details: string; hinweis?: string; vor: number }

/** Was das Setup zum Abschluss sagt: nur lesend bzw. welche von mehreren DS-Win-Kopien es genommen hat */
const setupHinweis = (s?: SetupStand) => s?.fertig && s.hinweis
  ? `<p class="ein-hinweis">${esc(s.hinweis).replace(/\n/g, '<br>')}<br>Fragen dazu? Rufen Sie uns an: 0211 3029 3035.</p>` : ''

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
  'cgm-z1pro': {
    rechner: 'Auf dem Rechner, auf dem die Z1-Datenbank liegt (Einzelplatz: der PC mit Z1.PRO, Praxis mit Server: der Server). Z1.PRO selbst bleibt unverändert.',
    ordner: 'die Z1-Datenbank, z. B. <code>C:\\CGM\\Z1\\data\\z1.mdb</code>',
    schritte: BRIDGE_SCHRITTE('die Z1-Datenbank, z. B. <code>C:\\CGM\\Z1\\data\\z1.mdb</code>'),
    preise: 'PlanR liest aus Z1.PRO die GOZ-, Analog- und Laborpreise; der HKP geht direkt in den Plan des Patienten.',
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
/** Setup für einen einzelnen PC (Demo, Einzelplatz): Jeder PC, auf dem es läuft, bekommt seine eigene Bridge. */
export const bridgeSetupPcLaden = () => herunterladen('/api/bridge-setup?lokal=1', 'PlanR-Bridge-Setup.exe')
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
    ${setupHinweis(s)}
  </div>`
}

/** geprueft: Die Prüfung im Installer hat PlanR erreicht, der Windows-Dienst meldet sich aber (noch) nicht. */
interface Stand { mandant: string; eingerichtet: boolean; verbunden: boolean; geprueft?: boolean; setup?: SetupStand; pvs?: string; version?: string; status?: string }
interface Katalog { anzahl?: Record<string, number>; pvs?: string }

const SCHRITTE_VOLL = ['Praxisprogramm', 'Computer', 'Herunterladen', 'Öffnen', 'Preise', 'Fertig'] as const

/** Was die Hilfe-Zeile im Assistenten für die Praxis drücken darf */
type KiAktion = 'weiter' | 'zurueck' | 'herunterladen' | 'preise'
interface KiZeile { wer: 'ich' | 'ki'; text: string }

/** Fragen zum Antippen; sie gehen als ganz normaler Satz an die Hilfe. */
const KI_VORSCHLAEGE = ['Was muss ich jetzt tun?', 'Bei mir sieht es anders aus', 'Es kommt eine Warnung', 'Ich finde die Datei nicht']

/**
 * Assistent als eigenes Fenster über der Planliste: ein Handgriff je Seite, große Schrift, Prüfungen dazwischen und
 * unten die Hilfe-Zeile (eigenes Modell), die jeden Schritt erklärt und den Assistenten bedienen kann.
 * `geaendert` meldet neue Einstellungen bzw. Katalog an die Übersicht, `importieren` öffnet am Ende die Patientensuche.
 */
export function einrichtungOeffnen(o: { admin: boolean; einstellungen: Einstellungen; geaendert: () => void; importieren: () => void; bridgeLaden?: boolean; pvsFest?: boolean }) {
  document.querySelector('.ein-schleier')?.remove()
  let schritt = 0
  let einst = o.einstellungen
  let stand: Stand | null = null
  let paketGeladen = false
  let code = ''
  let zipGeladen = false
  let katalog: Katalog | null = null
  let bekannt = false
  let laeuft = false
  let meldung = ''
  let uhr = 0
  let katalogSeit = 0
  let katalogUhr = 0
  /** Antwort auf „Ist das der richtige Computer?“ */
  let ort: '' | 'server' | 'einzel' | 'falsch' = ''
  const verlauf: KiZeile[] = []
  let kiDenkt = false

  const schleier = document.createElement('div')
  schleier.className = 'ein-schleier'
  document.body.append(schleier)
  const zu = () => {
    if (katalogSeit && !confirm('Preise & Positionen werden gerade übernommen. Wirklich schließen? Der Vorgang läuft auf dem Server weiter; das Ergebnis sehen Sie später unter Einstellungen → Preise & Positionen.')) return
    clearInterval(uhr); clearInterval(katalogUhr); schleier.remove(); removeEventListener('keydown', taste); if (location.hash === '#einrichtung') history.replaceState(null, '', location.pathname + location.search) }
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu() }
  addEventListener('keydown', taste)
  schleier.addEventListener('click', (e) => { if (e.target === schleier) zu() })

  const katalogLaden = async () => {
    try {
      const d = await (await fetch('/api/praxiskatalog?nur=info', { cache: 'no-store' })).json() as { info?: Katalog | null }
      if (d.info) katalog = d.info
    } catch { /* bleibt */ }
  }

  /** Praxis ist schon angebunden: Bridge liegt auf dem Server oder Preise sind schon übernommen. */
  const steht = () => !!(einst.pvs && (katalog?.anzahl || stand?.eingerichtet || stand?.verbunden))

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
  const pvsName = () => pvsVon(stand?.pvs ?? '')?.name || pvs()?.name || 'Ihr Praxisprogramm'
  const anbindbar = () => !!anleitungVon(einst.pvs)
  /** Ohne fertige Anbindung entfallen die Bridge-Schritte. */
  const schrittNamen = () => (!anbindbar() && einst.pvs) ? ['Praxisprogramm', 'Fertig'] : [...SCHRITTE_VOLL]
  const schrittName = () => schrittNamen()[schritt] ?? 'Fertig'
  const zuSchritt = (name: string) => { schritt = Math.max(0, schrittNamen().indexOf(name)); meldung = '' }
  /** Ältere Bridges melden keinen Zustand – dann gilt verbunden als bereit. */
  const bridgeBereit = () => !!stand?.verbunden && (!stand.status || stand.status === 'bereit')
  const windows = /Windows/i.test(navigator.userAgent)

  /** Prüfliste: was schon geschafft ist, mit Haken */
  const pruefliste = (punkte: [boolean, string][]) => `<ul class="ein-pruef">${punkte.map(([ok, t]) => `<li class="${ok ? 'ok' : ''}">${t}</li>`).join('')}</ul>`

  function inhalt(): string {
    const p = pvs()
    switch (schrittName()) {
      case 'Praxisprogramm': return o.pvsFest && p ? `
        <h3>Ihr Praxisprogramm: ${esc(p.name)}</h3>
        <p class="ein-text">PlanR holt Patienten und Pläne von dort und legt fertige Pläne dort ab. Stimmt das Programm nicht? Rufen Sie uns an: 0211 3029 3035.</p>` : `
        <h3>Mit welchem Programm arbeiten Sie in der Praxis?</h3>
        <p class="ein-text">Tippen Sie auf Ihr Programm. Der Name steht ganz oben im Fenster, wenn Sie es geöffnet haben.</p>
        <div class="ein-pvs">${PVS_LISTE.map((x) => `<button type="button" class="ein-pvs-wahl${x.id === einst.pvs ? ' an' : ''}" data-pvs="${x.id}">
          <b>${esc(x.name)}</b><small>${esc(x.hersteller)}</small><i class="${x.bereit ? 'bereit' : 'bald'}">${x.bereit ? 'Anbindung verfügbar' : 'in Vorbereitung'}</i></button>`).join('')}</div>
        ${einst.pvs && p ? `<p class="ein-ok big">✓ Gewählt: ${esc(p.name)}. Jetzt unten auf „Weiter“.</p>` : ''}
        ${o.admin ? '' : '<p class="ein-hinweis">Das Praxisprogramm stellt die Person ein, die PlanR für die Praxis angemeldet hat.</p>'}`
      case 'Computer': return `
        <h3>Sitzen Sie am richtigen Computer?</h3>
        <p class="ein-text">Gleich wird ein kleines Hilfsprogramm installiert, die <b>PlanR-Bridge</b>. Sie muss auf den Computer, auf dem die Daten von ${esc(p?.name ?? 'Ihrem Praxisprogramm')} liegen.</p>
        ${windows ? '' : '<p class="ein-hinweis">Dieses Gerät ist kein Windows-Computer. Die PlanR-Bridge läuft nur auf Windows. Bitte gehen Sie an den Praxis-Computer.</p>'}
        <div class="ein-wahl">
          <button type="button" class="ein-wahl-knopf${ort === 'einzel' ? ' an' : ''}" data-ort="einzel"><b>Wir haben nur einen Computer</b><small>Dann ist es dieser hier.</small></button>
          <button type="button" class="ein-wahl-knopf${ort === 'server' ? ' an' : ''}" data-ort="server"><b>Ja, das ist der Hauptcomputer</b><small>Der Server: läuft immer, alle anderen hängen daran.</small></button>
          <button type="button" class="ein-wahl-knopf${ort === 'falsch' ? ' an' : ''}" data-ort="falsch"><b>Nein – oder ich weiß es nicht</b><small>Kein Problem, ich zeige Ihnen, was zu tun ist.</small></button>
        </div>
        ${ort === 'falsch' ? `<div class="ein-hinweis"><b>So geht es weiter:</b>
          <ol class="ein-liste"><li>Fragen Sie in der Praxis, welcher Computer der Hauptcomputer (Server) ist. Oft steht er im Büro oder Abstellraum und läuft immer.</li>
          <li>Gehen Sie an diesen Computer und öffnen Sie dort das Internet-Programm (Chrome, Edge oder Firefox).</li>
          <li>Tippen Sie oben in die Adresszeile: <b>planr.pickadoc.de</b> und melden Sie sich an. Die Einrichtung geht dort an dieser Stelle weiter.</li></ol>
          Unsicher? Schreiben Sie unten in die Hilfe-Zeile oder rufen Sie an: 0211 3029 3035.</div>`
          : ort ? '<p class="ein-ok big">✓ Gut. Jetzt unten auf „Weiter“.</p>' : ''}
        <details class="ein-mehr"><summary>Genauer: Welcher Computer ist der richtige?</summary><p>${anleitungVon(einst.pvs)?.rechner ?? ''}</p></details>`
      case 'Herunterladen': return `
        <h3>${stand?.verbunden ? 'Die PlanR-Bridge läuft schon' : 'Die PlanR-Bridge herunterladen'}</h3>
        ${stand?.verbunden
          ? `<p class="ein-ok big">✓ PlanR ist mit ${esc(pvsName())} verbunden. Sie müssen nichts installieren – unten auf „Weiter“.</p>`
          : stand?.eingerichtet && !paketGeladen
            ? '<p class="ein-hinweis">Die PlanR-Bridge wurde schon einmal eingerichtet, ist aber gerade nicht verbunden. Ist der Computer mit der Bridge eingeschaltet und hat er Internet? Dann verbindet sie sich von selbst. Nur wenn dieser Computer neu ist, laden Sie die Bridge noch einmal herunter.</p>'
          : '<p class="ein-text">Der Download startet sofort, auch ohne Anmeldung. Die Datei heißt PlanR-Bridge.zip und liegt danach im Ordner „Downloads“.</p>'}
        <p><button type="button" class="neu-knopf ein-riesig" disabled>PlanR-Bridge herunterladen</button></p>
        <p class="ein-text">momentan gesperrt</p>
        ${paketGeladen ? '<p class="ein-ok big">✓ Die Datei ist da. Sie liegt im Ordner „Downloads“. Jetzt unten auf „Weiter“.</p>' : ''}
        <details class="ein-mehr"><summary>Der Browser fragt etwas oder warnt?</summary><p>Fragt der Browser, ob Sie die Datei behalten möchten: auf <b>„Behalten“</b> klicken. Die Datei kommt von uns und ist sicher.</p></details>
        ${o.admin ? `<p class="ein-klein" data-zip-platz>${zipGeladen ? '✓ ZIP-Paket heruntergeladen: entpacken und <code>Installieren.cmd</code> als Administrator ausführen.'
          : 'Für IT-Dienstleister: momentan gesperrt'}</p>` : ''}`
      case 'Öffnen': return stand?.verbunden ? `
        <h3>Geschafft – die Verbindung steht!</h3>
        <p class="ein-ok big">✓ PlanR ist mit ${esc(pvsName())} verbunden${stand.version ? ` (Bridge ${esc(stand.version)})` : ''}.</p>
        ${setupHinweis(stand.setup)}
        ${bridgeBereit() ? '<p class="ein-text">Das dunkelgrüne Fenster können Sie schließen. Jetzt unten auf „Weiter“.</p>'
          : `<p class="ein-warte"><span class="ein-punkt"></span> Die Bridge meldet: ${esc(stand.status ?? '')}</p>
             <p class="ein-text">Das dauert bis zu einer Minute. Bitte kurz warten.</p>`}` : `
        <h3>Die Datei öffnen</h3>
        ${stand?.setup ? setupHtml(stand.setup) : `
        <ol class="ein-gross-liste">
          <li><b>Die Datei liegt im Ordner „Downloads“.</b> Sie heißt <b>PlanR-Bridge.zip</b>. Entpacken Sie sie (Rechtsklick → „Alle extrahieren“).</li>
          <li><b>Installieren.cmd öffnen.</b> Windows fragt, ob das Programm etwas ändern darf. Klicken Sie auf <b>„Ja“</b>.</li>
          <li><b>Ein dunkelgrünes Fenster erscheint</b> und arbeitet von selbst. Sie müssen nur warten – etwa eine Minute.</li>
        </ol>`}
        ${pruefliste([[paketGeladen || !!stand?.eingerichtet, 'Datei heruntergeladen'], [!!stand?.setup || !!stand?.geprueft, 'Datei geöffnet, das Setup läuft'], [!!stand?.setup?.fertig, 'Setup ist fertig'], [false, `PlanR ist mit ${esc(pvsName())} verbunden`]])}
        <p class="ein-warte"><span class="ein-punkt"></span> Ich warte hier und sage Bescheid, sobald es geklappt hat.</p>
        ${code ? `<p class="ein-text">Fragt das grüne Fenster nach einem Code? Tippen Sie: <b class="ein-code">${esc(codeLesbar(code))}</b></p>` : ''}
        <details class="ein-mehr"><summary>Es kommt ein blaues Fenster „Der Computer wurde durch Windows geschützt“</summary><p>Klicken Sie auf den kleinen Text <b>„Weitere Informationen“</b>. Dann erscheint unten der Knopf <b>„Trotzdem ausführen“</b> – darauf klicken.</p></details>
        <details class="ein-mehr"><summary>Ich finde die Datei nicht</summary><p>Halten Sie auf der Tastatur die Taste <b>Strg</b> gedrückt und drücken Sie dazu <b>J</b>. Dann zeigt der Browser die heruntergeladenen Dateien. Oder gehen Sie einen Schritt zurück und laden Sie sie noch einmal.</p></details>
        <details class="ein-mehr"><summary>Das Fenster fragt nach einem Ordner oder einem Kennwort</summary><p>Nur falls das Setup ${esc(p?.name ?? 'das Praxisprogramm')} nicht selbst findet, fragt es nach dem Ordner – ${anleitungVon(einst.pvs)?.ordner ?? ''}. Fragt es nach einem Kennwort, ist das Kennwort gemeint, mit dem Sie sich morgens am Computer anmelden. Schreiben Sie unten in die Hilfe-Zeile, was im Fenster steht – ich helfe weiter.</p></details>`
      case 'Preise': return `
        <h3>${katalog?.anzahl ? 'Ihre Preise sind übernommen' : 'Ihre Preise übernehmen'}</h3>
        <p class="ein-text">${katalog?.anzahl
          ? `Aus ${esc(p?.name ?? 'dem Praxisprogramm')} schon übernommen. Jetzt unten auf „Weiter“.`
          : `PlanR holt jetzt Ihre eigenen Preise aus ${esc(p?.name ?? 'dem Praxisprogramm')}. So rechnet PlanR von Anfang an richtig. Sie müssen nur einmal drücken und dann etwa fünf Minuten warten.`}</p>
        ${katalog?.anzahl
          ? `<p class="ein-ok big">✓ Übernommen: ${Object.entries({ bel: 'BEL-Preise', eigenlabor: 'Eigenlabor-Preise', material: 'Materialien', goz: 'eigene GOZ-/Analogpositionen', kuerzel: 'Kürzel', komplexe: 'Komplexe' })
            .map(([k, n]) => `${katalog!.anzahl![k] ?? 0} ${n}`).join(', ')}.</p>
             <button type="button" class="import-knopf" data-katalog${laeuft || !stand?.verbunden || !bridgeBereit() ? ' disabled' : ''}>${laeuft ? 'Wird abgeglichen …' : 'Erneut abgleichen'}</button>`
          : katalogSeit
            ? `<div class="ein-fortschritt" role="status" aria-live="polite">
                 <span class="ein-spinner" aria-hidden="true"></span>
                 <div><b>Die Preise werden gelesen …</b>
                   <p>Läuft seit <span data-katalog-uhr>${dauer(Date.now() - katalogSeit)}</span>. Dauert etwa 5 Minuten. Bitte dieses Fenster offen lassen und nichts anklicken. Sie können sich solange einen Kaffee holen.</p></div>
               </div>`
            : `<button type="button" class="neu-knopf ein-riesig" data-katalog${laeuft || !stand?.verbunden || !bridgeBereit() ? ' disabled' : ''}>Jetzt übernehmen</button>
               ${!stand?.verbunden ? '<p class="ein-hinweis">Der Knopf geht, sobald die PlanR-Bridge verbunden ist. Ist der Computer mit der Bridge eingeschaltet?</p>' : bridgeBereit() ? '' : `<p class="ein-hinweis">Der Knopf geht gleich – die Bridge meldet noch: ${esc(stand.status ?? '')}</p>`}
               <details class="ein-mehr"><summary>Was wird übernommen?</summary><p>${esc(anleitungVon(einst.pvs)?.preise ?? '')}</p></details>`}`
      default: return !anbindbar() && einst.pvs ? `
           <h3>Danke – wir melden uns bei Ihnen</h3>
           ${anleitungHtml(einst.pvs)}
           <div class="ein-fertig"><button type="button" class="neu-knopf ein-riesig" data-zu>Schließen</button></div>`
        : steht() && katalog?.anzahl
        ? `<h3>Alles fertig. Ihre Praxis ist eingerichtet.</h3>
           <p class="ein-ok big">✓ ${esc(p?.name ?? 'Das Praxisprogramm')} ist verbunden, Ihre Preise sind übernommen.</p>
           <div class="ein-fertig">
             <button type="button" class="neu-knopf ein-riesig" data-importieren>Ersten Patienten suchen</button>
             <button type="button" class="import-knopf" data-zu>Schließen</button>
           </div>
           <details class="ein-mehr"><summary>Bridge neu installieren oder entfernen</summary><p>Nur wenn der Praxis-Computer neu aufgesetzt wurde: <button type="button" class="link-knopf" disabled>Bridge erneut herunterladen</button> momentan gesperrt. Entfernen: Windows-Einstellungen → Apps → „PlanR-Bridge“ → Deinstallieren.</p></details>`
        : `<h3>Fertig – PlanR ist eingerichtet.</h3>
           <p class="ein-text">Suchen Sie jetzt Ihren ersten Patienten aus ${esc(p?.name ?? 'Ihrem Praxisprogramm')}.</p>
           <div class="ein-fertig">
             <button type="button" class="neu-knopf ein-riesig" data-importieren>Ersten Patienten suchen</button>
             <button type="button" class="import-knopf" disabled>Bridge erneut herunterladen</button> <small>momentan gesperrt</small>
           </div>`
    }
  }

  function weiterErlaubt(): boolean {
    switch (schrittName()) {
      case 'Praxisprogramm': return !!einst.pvs
      case 'Computer': return ort === 'server' || ort === 'einzel' || !!stand?.verbunden
      case 'Herunterladen': return paketGeladen || !!stand?.eingerichtet || !!stand?.verbunden
      case 'Öffnen': return !!stand?.verbunden
      default: return true
    }
  }
  /** Warum „Weiter“ noch grau ist – steht groß neben dem Knopf. */
  function weiterGrund(): string {
    switch (schrittName()) {
      case 'Praxisprogramm': return 'Bitte erst Ihr Programm antippen.'
      case 'Computer': return 'Bitte erst eine Antwort antippen.'
      case 'Herunterladen': return 'momentan gesperrt'
      case 'Öffnen': return 'Geht weiter, sobald die Verbindung steht.'
      default: return ''
    }
  }

  const dateiSofort = () => { /* Download ist gesperrt. */ }
  const laden = (zip: boolean) => async () => {
    if (laeuft) return
    dateiSofort()
    laeuft = true
    meldung = ''
    zeichnen()
    const r = await (zip ? bridgePaketLaden() : bridgeSetupLaden())
    if (r.ok) {
      if (zip) zipGeladen = true
      else { paketGeladen = true; code = r.code }
      stand = { ...(stand ?? { mandant: '', verbunden: false }), eingerichtet: true }
    } else if (r.status === 401 || r.status === 403) {
      paketGeladen = true
      meldung = 'momentan gesperrt'
    } else meldung = r.meldung
    laeuft = false
    zeichnen()
  }

  const preiseHolen = async () => {
    if (laeuft) return
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
  }

  /** Was die Hilfe gerade für die Praxis drücken dürfte */
  function moeglich(): KiAktion[] {
    const namen = schrittNamen()
    const m: KiAktion[] = []
    if (schritt < namen.length - 1 && weiterErlaubt() && !katalogSeit) m.push('weiter')
    if (schritt > 0 && !katalogSeit) m.push('zurueck')
    if (o.admin && anbindbar() && !laeuft && (schrittName() === 'Herunterladen' || schrittName() === 'Öffnen')) m.push('herunterladen')
    if (schrittName() === 'Preise' && bridgeBereit() && !laeuft) m.push('preise')
    return m
  }

  /** Lage des Assistenten für die Hilfe: kein Patient, keine Zugangsdaten außer dem Einrichtungscode zum Abtippen */
  const lage = () => ({
    schritt: schrittName(), schritte: schrittNamen(), praxisprogramm: pvs()?.name ?? '', anbindung: !einst.pvs ? '' : anbindbar() ? 'verfügbar' : 'in Vorbereitung',
    computer: ({ '': 'noch nicht beantwortet', server: 'sitzt am Hauptcomputer (Server)', einzel: 'Praxis hat nur einen Computer', falsch: 'sitzt am falschen Computer oder weiß es nicht' })[ort],
    admin: o.admin, heruntergeladen: paketGeladen, code: code ? codeLesbar(code) : '', eingerichtet: !!stand?.eingerichtet, verbunden: !!stand?.verbunden, bereit: bridgeBereit(),
    bridgeMeldet: stand?.status ?? '', version: stand?.version ?? '', preiseUebernommen: !!katalog?.anzahl, preiseLaufen: !!katalogSeit, meldung,
    geraet: navigator.userAgent, moeglich: moeglich(), setup: stand?.setup ?? null,
  })

  function kiZeichnen() {
    const liste = schleier.querySelector<HTMLElement>('[data-ki-verlauf]')
    if (!liste) return
    liste.innerHTML = (verlauf.length ? verlauf : [{ wer: 'ki', text: 'Guten Tag! Ich bin Ihre Hilfe bei der Einrichtung. Wenn etwas unklar ist oder anders aussieht als beschrieben: Schreiben Sie es hier unten hinein, mit Ihren eigenen Worten. Ich erkläre jeden Schritt.' } as KiZeile])
      .map((z) => `<p class="ein-ki-${z.wer}">${esc(z.text).replace(/\n/g, '<br>')}</p>`).join('')
      + (kiDenkt ? '<p class="ein-ki-ki ein-ki-denkt"><span class="ein-punkt"></span> Ich schaue kurz nach …</p>' : '')
    liste.scrollTop = liste.scrollHeight
    const knopf = schleier.querySelector<HTMLButtonElement>('[data-ki-senden]')
    if (knopf) knopf.disabled = kiDenkt
  }

  function kiAusfuehren(aktion: string) {
    if (!moeglich().includes(aktion as KiAktion)) return
    if (aktion === 'weiter') { schritt += 1; meldung = ''; zeichnen() }
    else if (aktion === 'zurueck') { schritt -= 1; meldung = ''; zeichnen() }
    else if (aktion === 'herunterladen') { zuSchritt('Herunterladen'); void laden(false)() }
    else if (aktion === 'preise') void preiseHolen()
  }

  async function kiFragen(text: string) {
    const frage = text.trim()
    if (!frage || kiDenkt) return
    const bisher = verlauf.slice(-8)
    verlauf.push({ wer: 'ich', text: frage })
    kiDenkt = true
    kiZeichnen()
    let antwort = ''
    let aktion = 'keine'
    try {
      const r = await post('/api/einrichtung-ki', { text: frage, lage: lage(), verlauf: bisher })
      if (r.d.ok && r.d.antwort) { antwort = String(r.d.antwort); aktion = String(r.d.aktion ?? 'keine') }
    } catch { /* unten */ }
    kiDenkt = false
    verlauf.push({ wer: 'ki', text: antwort || 'Ich erreiche die Hilfe gerade nicht. Bitte versuchen Sie es gleich noch einmal – oder rufen Sie uns an: 0211 3029 3035. Wir helfen sofort.' })
    kiZeichnen()
    if (antwort) kiAusfuehren(aktion)
  }

  /** Rahmen einmal bauen; die Hilfe-Zeile bleibt beim Neuzeichnen stehen (Eingabe und Verlauf gehen nicht verloren). */
  function rahmen() {
    schleier.innerHTML = `
      <div class="ein-karte ein-gross" role="dialog" aria-modal="true" aria-label="PlanR einrichten">
        <header class="ein-kopf">
          <div><h2>PlanR einrichten</h2><p data-kopf></p></div>
          <button type="button" class="ein-zu" data-zu aria-label="Schließen">×</button>
        </header>
        <div class="ein-leiste" data-leiste></div>
        <div class="ein-inhalt" data-inhalt></div>
        <div data-meldung></div>
        <footer class="ein-fuss" data-fuss></footer>
        <section class="ein-ki" aria-label="Hilfe">
          <div class="ein-ki-verlauf" data-ki-verlauf role="log" aria-live="polite"></div>
          <div class="ein-ki-chips">${KI_VORSCHLAEGE.map((v) => `<button type="button" data-ki-chip>${esc(v)}</button>`).join('')}</div>
          <form class="ein-ki-form" data-ki-form>
            <input type="text" data-ki-eingabe maxlength="600" autocomplete="off" aria-label="Frage an die Hilfe" placeholder="Hier schreiben, wenn Sie Hilfe brauchen …">
            <button type="submit" class="neu-knopf" data-ki-senden>Fragen</button>
          </form>
        </section>
      </div>`
    schleier.querySelector('[data-zu]')!.addEventListener('click', zu)
    const eingabe = schleier.querySelector<HTMLInputElement>('[data-ki-eingabe]')!
    schleier.querySelector('[data-ki-form]')!.addEventListener('submit', (e) => {
      e.preventDefault()
      const t = eingabe.value
      eingabe.value = ''
      void kiFragen(t)
    })
    schleier.querySelectorAll<HTMLButtonElement>('[data-ki-chip]').forEach((b) => b.addEventListener('click', () => void kiFragen(b.textContent ?? '')))
    kiZeichnen()
  }

  function zeichnen() {
    if (!bekannt) {
      schleier.innerHTML = `
        <div class="ein-karte ein-gross" role="dialog" aria-modal="true" aria-label="Einrichtung">
          <header class="ein-kopf"><div><h2>PlanR einrichten</h2><p>Einen Moment …</p></div>
            <button type="button" class="ein-zu" data-zu aria-label="Schließen">×</button></header>
          <div class="ein-inhalt"><p class="ein-warte"><span class="ein-punkt"></span> Ich schaue nach, was schon eingerichtet ist.</p></div>
        </div>`
      schleier.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', zu))
      return
    }
    if (!schleier.querySelector('[data-inhalt]')) rahmen()
    const namen = schrittNamen()
    if (schritt >= namen.length) schritt = namen.length - 1
    const $ = <T extends Element = HTMLElement>(s: string) => schleier.querySelector<T>(s)
    const letzter = schritt >= namen.length - 1
    $('[data-kopf]')!.textContent = pvs()?.name ?? 'Ihr Praxisprogramm mit PlanR verbinden'
    $('[data-leiste]')!.innerHTML = `<b>Schritt ${schritt + 1} von ${namen.length}</b>
      <span class="ein-balken" role="progressbar" aria-valuemin="1" aria-valuemax="${namen.length}" aria-valuenow="${schritt + 1}">${namen.map((_, i) => `<i class="${i < schritt ? 'erledigt' : i === schritt ? 'aktiv' : ''}"></i>`).join('')}</span>`
    const flaeche = $('[data-inhalt]')!
    const offen = [...flaeche.querySelectorAll<HTMLDetailsElement>('details.ein-mehr')].map((d) => d.open)
    const oben = flaeche.scrollTop
    flaeche.innerHTML = inhalt()
    flaeche.querySelectorAll<HTMLDetailsElement>('details.ein-mehr').forEach((d, i) => { if (offen[i]) d.open = true })
    flaeche.scrollTop = oben
    $('[data-meldung]')!.innerHTML = meldung ? `<p class="ein-meldung" role="status">${esc(meldung)}</p>` : ''
    $('[data-fuss]')!.innerHTML = `
      ${schritt > 0 ? `<button type="button" class="link-knopf" data-zurueck${katalogSeit ? ' disabled' : ''}>← Zurück</button>` : '<span></span>'}
      ${letzter ? '<span></span>' : `<span class="ein-fuss-rechts">${weiterErlaubt() ? '' : `<small>${weiterGrund()}</small>`}
        <button type="button" class="neu-knopf ein-riesig" data-weiter${weiterErlaubt() && !katalogSeit ? '' : ' disabled'}>Weiter →</button></span>`}`
    flaeche.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', zu))
    $('[data-zurueck]')?.addEventListener('click', () => { schritt -= 1; meldung = ''; flaeche.scrollTop = 0; zeichnen() })
    $('[data-weiter]')?.addEventListener('click', () => {
      schritt += 1
      meldung = ''
      flaeche.scrollTop = 0
      if (schrittName() === 'Herunterladen' && !paketGeladen && !stand?.verbunden) { dateiSofort(); paketGeladen = true }
      zeichnen()
    })
    flaeche.querySelectorAll<HTMLButtonElement>('[data-pvs]').forEach((b) => b.addEventListener('click', async () => {
      if (!o.admin) return
      const neu = { ...einst, pvs: b.dataset.pvs!, bridge: true }
      const r = await post('/api/einstellungen', neu)
      if (r.d.ok) { einst = r.d.einstellungen as Einstellungen; meldung = ''; o.geaendert() } else meldung = String(r.d.meldung ?? 'Speichern hat nicht geklappt.')
      zeichnen()
    }))
    flaeche.querySelectorAll<HTMLButtonElement>('[data-ort]').forEach((b) => b.addEventListener('click', () => { ort = b.dataset.ort as typeof ort; zeichnen() }))
    $('[data-setup]')?.addEventListener('click', () => { paketGeladen = true; window.setTimeout(() => zeichnen(), 0) })
    $('[data-katalog]')?.addEventListener('click', () => void preiseHolen())
    $('[data-importieren]')?.addEventListener('click', () => { zu(); o.importieren() })
    $('[data-zur-bridge]')?.addEventListener('click', () => { dateiSofort(); zuSchritt('Herunterladen'); zeichnen() })
  }

  // Verbindung live verfolgen, solange der Assistent offen ist
  uhr = window.setInterval(async () => {
    if (!schleier.isConnected) return clearInterval(uhr)
    const name = schrittName()
    if (name !== 'Herunterladen' && name !== 'Öffnen' && name !== 'Preise') return
    const merkmal = () => `${stand?.verbunden}|${stand?.status}|${stand?.geprueft}|${JSON.stringify({ ...stand?.setup, vor: (stand?.setup?.vor ?? 0) > 300 })}`
    const vorher = merkmal()
    const hatteSetup = !!stand?.setup
    await standLaden()
    if (laeuft || merkmal() === vorher) return
    // Beginnt das Setup zu melden, während noch die Download-Seite offen ist, geht es von selbst zum Öffnen-Schritt.
    if (name === 'Herunterladen' && paketGeladen && !hatteSetup && stand?.setup) zuSchritt('Öffnen')
    zeichnen()
  }, 4000)

  void Promise.all([standLaden(), katalogLaden()]).then(() => {
    const namen = schrittNamen()
    // Läuft das Setup gerade (Meldung jünger als zehn Minuten), geht es direkt dorthin, wo man ihm zusieht.
    if (stand?.setup && !stand.setup.fertig && stand.setup.vor < 600 && !stand.verbunden && namen.includes('Öffnen')) { ort = 'server'; zuSchritt('Öffnen') }
    else if (o.bridgeLaden && namen.includes('Herunterladen')) { ort = 'server'; zuSchritt('Herunterladen') }
    else if (steht() && katalog?.anzahl) zuSchritt('Fertig')
    else if (stand?.verbunden) zuSchritt('Preise')
    else if (stand?.eingerichtet && namen.includes('Öffnen')) { ort = 'server'; zuSchritt('Herunterladen') }
    else if (einst.pvs && namen.includes('Computer')) zuSchritt('Computer')
    else if (einst.pvs) zuSchritt('Fertig')
    bekannt = true
    zeichnen()
  })
  zeichnen()
}

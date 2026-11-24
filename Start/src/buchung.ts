/** Buchung von PlanR: Stammdaten, KZV, Praxissystem, SEPA-Mandat – danach Anleitung zur Einrichtung. */
import './buchung.css'
import { KZVEN } from './data/kzv'
import { PVS_LISTE, pvsVon } from './einstellungen'
import { DOKU_MONAT, PAKETE, PRO_PLAN, RECHTSFORMEN, SERVER, TESTABO_PLAENE, TESTABO_TAGE, ibanGueltig, ibanNorm, type Paket } from './paket'
import { anleitungHtml, anleitungVon, bridgeDateiLaden } from './einrichtung'
import { logo } from './logo'
import { funnelMelden, funnelQuelle } from './funnelClient'
import { werbungStarten, zielErreicht } from './werbung'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const cent = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

const SCHRITTE = ['Paket', 'Praxis', 'KZV & PVS', 'SEPA-Mandat', 'Prüfen & buchen'] as const
const SCHRITT_VON: [RegExp, number][] = [[/^paket/, 0], [/^(praxis|inhaber)\.|^passwort/, 1], [/^(kzv|pvs)\.|^hinweis/, 2], [/^sepa\./, 3], [/^zustimmung\./, 4]]

type Werte = Record<string, string | boolean>
const PFLICHT: Record<number, [string, string][]> = {
  1: [['praxis.name', 'den Praxisnamen'], ['praxis.rechtsform', 'die Rechtsform'], ['praxis.strasse', 'Straße und Hausnummer'], ['praxis.plz', 'die Postleitzahl'], ['praxis.ort', 'den Ort'],
    ['praxis.telefon', 'eine Telefonnummer'], ['praxis.email', 'die E-Mail-Adresse für Rechnungen'], ['inhaber.anrede', 'die Anrede'], ['inhaber.vorname', 'den Vornamen'], ['inhaber.nachname', 'den Nachnamen'], ['inhaber.email', 'die E-Mail-Adresse für die Anmeldung']],
  2: [['kzv.nr', 'den KZV-Bereich'], ['kzv.abrechnungsnr', 'die KZV-Abrechnungsnummer'], ['kzv.zahnaerzte', 'die Zahl der Zahnärzte'], ['pvs.id', 'das Praxissystem']],
  3: [['sepa.inhaber', 'den Kontoinhaber'], ['sepa.iban', 'die IBAN'], ['sepa.unterschrift', 'Ihren Namen zur Bestätigung']],
}

function feld(w: Werte, f: Record<string, string>, name: string, label: string, art = 'text', extra = ''): string {
  return `<label class="feld${f[name] ? ' fehler' : ''}">${label}
    <input type="${art}" name="${name}" value="${esc(String(w[name] ?? ''))}" ${extra}>
    ${f[name] ? `<small class="bu-fehler">${esc(f[name])}</small>` : ''}</label>`
}
function auswahl(w: Werte, f: Record<string, string>, name: string, label: string, optionen: [string, string][], extra = ''): string {
  return `<label class="feld${f[name] ? ' fehler' : ''}">${label}
    <select name="${name}" ${extra}><option value="">Bitte wählen …</option>${optionen.map(([v, t]) => `<option value="${esc(v)}"${w[name] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
    ${f[name] ? `<small class="bu-fehler">${esc(f[name])}</small>` : ''}</label>`
}
function haken(w: Werte, f: Record<string, string>, name: string, text: string): string {
  return `<label class="bu-haken${f[name] ? ' fehler' : ''}"><input type="checkbox" name="${name}"${w[name] === true ? ' checked' : ''}><span>${text}${f[name] ? `<small class="bu-fehler">${esc(f[name])}</small>` : ''}</span></label>`
}

/** Seite #buchen, #buchen-clara, #buchen-doku oder #buchen-test */
export function buchungSeite(app: HTMLElement, dokuAn = false, test = false) {
  let schritt = 0
  let erreicht = 0
  let fehler: Record<string, string> = {}
  let meldung = ''
  let sendet = false
  const schritte = test ? ['Testabo', 'Praxis', 'KZV & PVS', 'Prüfen & starten'] as const : SCHRITTE
  const w: Werte = { paket: 'planr_clara', doku: test || dokuAn, 'praxis.rechtsform': 'Einzelpraxis', 'kzv.praxen': '1', 'kzv.zahnaerzte': '1', 'pvs.server': 'server' }
  document.title = test ? 'PlanR 14 Tage testen' : 'PlanR buchen'
  werbungStarten()
  funnelMelden('buchung_start')

  const paket = (): Paket => 'planr_clara'

  function mandatVorschau(): string {
    const anschrift = String(w['sepa.anschrift'] || `${w['praxis.strasse'] ?? ''}, ${w['praxis.plz'] ?? ''} ${w['praxis.ort'] ?? ''}`)
    return `<div class="bu-mandat">
      <b>SEPA-Lastschriftmandat</b> (wiederkehrende Zahlungen, SEPA-Basislastschrift)<br>
      Zahlungsempfänger: Pickadoc GmbH, Medical Center · c/o Dr. Petsas · Luise-Rainer-Str. 6–10 · 40235 Düsseldorf<br>
      Gläubiger-ID und Mandatsreferenz stehen auf der ersten Rechnung.<br><br>
      Ich ermächtige / Wir ermächtigen die Pickadoc GmbH, Zahlungen von meinem / unserem Konto mittels Lastschrift einzuziehen. Zugleich weise ich mein / weisen wir unser Kreditinstitut an, die von der Pickadoc GmbH auf mein / unser Konto gezogenen Lastschriften einzulösen.<br>
      Hinweis: Ich kann / Wir können innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem / unserem Kreditinstitut vereinbarten Bedingungen.
      Jeder Einzug wird mit der Rechnung angekündigt; die Frist der Vorabankündigung wird auf einen Kalendertag verkürzt.<br><br>
      Kontoinhaber: ${esc(String(w['sepa.inhaber'] || '…'))} · ${esc(anschrift)}
    </div>`
  }

  const monatsbeitrag = () => PAKETE.planr_clara.monat + (w.doku === true ? DOKU_MONAT : 0)

  function inhalt(): string {
    const f = fehler
    const monat = monatsbeitrag()
    switch (schritt) {
      case 0: return test ? `
        <h2>PlanR inklusive Sprachupgrade</h2>
        <p class="bu-text">${TESTABO_TAGE} Tage PlanR mit Sprachsteuerung und KI-Sprachdokumentation, höchstens ${TESTABO_PLAENE} Pläne. In der Testzeit keine Lastschrift. Danach, oder sobald ${TESTABO_PLAENE} Pläne angelegt sind, schließen Sie das reguläre Abo ab.</p>
        <p class="bu-text">Enthalten sind beide Pakete: PlanR (alle Pläne, alle gängigen PVS, Clara per Sprache) und das Sprachupgrade (Diktat in die Karteikarte, kein Preis je Eintrag).</p>
        <p class="bu-klein">Kein SEPA-Mandat. Beginn und Ende stehen danach als Vermerk in der Buchung.</p>` : `
        <h2>PlanR</h2>
        <p class="bu-text">${monat} € im Monat${w.doku === true ? ` (${PAKETE.planr_clara.monat} € PlanR und ${DOKU_MONAT} € Sprachdokumentation)` : ''}, plus ${cent(PRO_PLAN)} je erstelltem Plan. Alle Pläne, alle gängigen PVS.</p>
        ${haken(w, {}, 'doku', `<b>KI-Sprachdokumentation</b> dazubuchen: ${DOKU_MONAT} € im Monat, kein Preis je Eintrag. Das Diktat geht in die Karteikarte. Bei Pickadoc MAS ist das enthalten.`)}
        <p class="bu-klein">Alle Preise netto zzgl. USt. Der Monatsbeitrag ist jederzeit zum Monatsende kündbar. PlanR ist ein Produkt der Pickadoc GmbH. Pickadoc-MAS-Praxen haben PlanR und die Sprachdokumentation schon inklusive.</p>`
      case 1: return `
        <h2>Ihre Praxis</h2>
        <div class="bu-raster">
          ${feld(w, f, 'praxis.name', 'Praxisname', 'text', 'autocomplete="organization" class="breit"')}
          ${auswahl(w, f, 'praxis.rechtsform', 'Rechtsform', RECHTSFORMEN.map((r) => [r, r]))}
          ${feld(w, f, 'praxis.strasse', 'Straße und Hausnummer', 'text', 'autocomplete="street-address"')}
          ${feld(w, f, 'praxis.plz', 'PLZ', 'text', 'inputmode="numeric" maxlength="5" autocomplete="postal-code"')}
          ${feld(w, f, 'praxis.ort', 'Ort', 'text', 'autocomplete="address-level2"')}
          ${feld(w, f, 'praxis.telefon', 'Telefon', 'tel', 'autocomplete="tel"')}
          ${feld(w, f, 'praxis.email', 'E-Mail für Rechnungen', 'email', 'autocomplete="email"')}
          ${feld(w, f, 'praxis.website', 'Website (optional)', 'url')}
          ${feld(w, f, 'praxis.ustId', 'USt-IdNr. (optional)')}
        </div>
        <h3>Inhaber/in bzw. Ansprechpartner/in</h3>
        <div class="bu-raster">
          ${auswahl(w, f, 'inhaber.anrede', 'Anrede', [['Frau', 'Frau'], ['Herr', 'Herr'], ['Divers', 'Divers']])}
          ${feld(w, f, 'inhaber.titel', 'Titel (optional)', 'text', 'placeholder="Dr. med. dent."')}
          ${feld(w, f, 'inhaber.vorname', 'Vorname', 'text', 'autocomplete="given-name"')}
          ${feld(w, f, 'inhaber.nachname', 'Nachname', 'text', 'autocomplete="family-name"')}
          ${feld(w, f, 'inhaber.email', 'E-Mail für die Anmeldung (Praxis-Admin)', 'email')}
          ${feld(w, f, 'inhaber.mobil', 'Mobil (optional)', 'tel')}
          ${feld(w, f, 'passwort', 'Passwort für PlanR (mind. 8 Zeichen)', 'password', 'autocomplete="new-password" minlength="8"')}
          ${feld(w, f, 'passwort2', 'Passwort wiederholen', 'password', 'autocomplete="new-password"')}
        </div>
        <p class="bu-klein">Mit dieser E-Mail-Adresse und dem Passwort melden Sie sich direkt nach der Buchung in PlanR an.</p>`
      case 2: return `
        <h2>KZV und Praxissystem</h2>
        <div class="bu-raster">
          ${auswahl(w, f, 'kzv.nr', 'KZV-Bereich', KZVEN.map((k) => [k.nr, `${k.kurz} – ${k.name}`]))}
          ${feld(w, f, 'kzv.abrechnungsnr', 'KZV-Abrechnungsnummer', 'text', 'inputmode="numeric"')}
          ${feld(w, f, 'kzv.zahnaerzte', 'Zahnärztinnen und Zahnärzte', 'number', 'min="1" max="200"')}
          ${feld(w, f, 'kzv.praxen', 'Praxen auf dem PVS-Server', 'number', 'min="1" max="20"')}
        </div>
        ${haken(w, f, 'kzv.eigenlabor', 'Wir haben ein <b>Eigenlabor</b> (PlanR übernimmt dessen BEL- und BEB-Preise).')}
        <p class="bu-klein">Der KZV-Bereich bestimmt BEL-II-Höchstpreise und Punktwerte. Mehrere Praxen auf einem Server (Praxisgemeinschaft): Jede sieht in PlanR nur ihre eigenen Patienten.</p>
        <div class="bu-raster">
          ${auswahl(w, f, 'pvs.id', 'Praxisverwaltungssystem', PVS_LISTE.map((p) => [p.id, `${p.name} (${p.hersteller})${p.bereit ? '' : ' – Anbindung in Vorbereitung'}`]))}
          ${feld(w, f, 'pvs.version', 'Version (optional)')}
          ${auswahl(w, f, 'pvs.server', 'Wo kann die Bridge laufen?', Object.entries(SERVER))}
          ${feld(w, f, 'pvs.it', 'IT-Betreuer (optional, Name und Telefon)')}
        </div>
        <div class="bu-raster">
          <label class="feld breit">Nachricht an uns (optional)<textarea name="hinweis" rows="2">${esc(String(w.hinweis ?? ''))}</textarea></label>
        </div>`
      case 3: return test ? pruefenInhalt() : `
        <h2>SEPA-Lastschriftmandat</h2>
        <p class="bu-text">Der Monatsbeitrag und die Pläne des Vormonats werden per Lastschrift eingezogen. Jede Abbuchung kündigen wir mit der Rechnung an.</p>
        <div class="bu-raster">
          ${feld(w, f, 'sepa.inhaber', 'Kontoinhaber', 'text', 'autocomplete="cc-name"')}
          ${feld(w, f, 'sepa.anschrift', 'Anschrift des Kontoinhabers (leer = Praxisanschrift)')}
          ${feld(w, f, 'sepa.iban', 'IBAN', 'text', 'autocomplete="off" spellcheck="false" placeholder="DE00 0000 0000 0000 0000 00"')}
          ${feld(w, f, 'sepa.bic', 'BIC (optional)', 'text', 'autocomplete="off"')}
          ${feld(w, f, 'sepa.bank', 'Kreditinstitut (optional)')}
        </div>
        ${mandatVorschau()}
        ${haken(w, f, 'sepa.mandat', 'Ich erteile / Wir erteilen der Pickadoc GmbH dieses <b>SEPA-Lastschriftmandat</b>.')}
        ${feld(w, f, 'sepa.unterschrift', 'Zur Bestätigung Vor- und Nachname eintippen (gilt als Unterschrift)', 'text', 'autocomplete="name"')}`
      default: return pruefenInhalt()
    }
  }

  function pruefenInhalt(): string {
    const f = fehler
    const pvs = pvsVon(String(w['pvs.id'] ?? ''))
    const kzv = KZVEN.find((k) => k.nr === w['kzv.nr'])
    const iban = ibanNorm(String(w['sepa.iban'] ?? ''))
    const bis = new Date(Date.now() + TESTABO_TAGE * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
    return `
        <h2>${test ? 'Prüfen und Testabo starten' : 'Prüfen und kostenpflichtig buchen'}</h2>
        <dl class="bu-zusammen">
          <dt>Paket</dt><dd>${test ? `Testabo · PlanR inkl. Sprachupgrade · ${TESTABO_TAGE} Tage bis ${esc(bis)} · keine Lastschrift` : `${esc(PAKETE[paket()].name)} · ${monatsbeitrag()} € / Monat + ${cent(PRO_PLAN)} je Plan${w.doku === true ? ` · davon ${DOKU_MONAT} € Sprachdokumentation, kein Preis je Eintrag` : ''}`}</dd>
          <dt>Praxis</dt><dd>${esc(String(w['praxis.name'] ?? ''))}, ${esc(String(w['praxis.strasse'] ?? ''))}, ${esc(String(w['praxis.plz'] ?? ''))} ${esc(String(w['praxis.ort'] ?? ''))}</dd>
          <dt>Inhaber/in</dt><dd>${esc([w['inhaber.titel'], w['inhaber.vorname'], w['inhaber.nachname']].filter(Boolean).join(' '))} · Anmeldung mit ${esc(String(w['inhaber.email'] ?? ''))}</dd>
          <dt>KZV</dt><dd>${esc(kzv ? `${kzv.kurz}` : '')} · Abrechnungsnummer ${esc(String(w['kzv.abrechnungsnr'] ?? ''))}</dd>
          <dt>Praxissystem</dt><dd>${esc(pvs?.name ?? '')}${pvs && !pvs.bereit ? ' (Anbindung in Vorbereitung)' : ''}</dd>
          ${test ? '' : `<dt>Lastschrift</dt><dd>${esc(String(w['sepa.inhaber'] ?? ''))} · ${esc(iban.slice(0, 4))} •••• ${esc(iban.slice(-4))}</dd>`}
        </dl>
        ${haken(w, f, 'zustimmung.agb', 'Ich habe die <a href="https://pickadoc.ai/agb.html" target="_blank" rel="noopener">AGB</a> gelesen und stimme zu.')}
        ${haken(w, f, 'zustimmung.datenschutz', 'Ich habe die <a href="https://pickadoc.ai/datenschutz.html" target="_blank" rel="noopener">Datenschutzhinweise</a> zur Kenntnis genommen.')}
        ${haken(w, f, 'zustimmung.avv', 'Ich beauftrage die Pickadoc GmbH mit der <b>Verarbeitung von Patientendaten im Auftrag</b> (Art. 28 DSGVO).')}
        <input type="text" name="firma2" class="bu-falle" tabindex="-1" autocomplete="off" aria-hidden="true">`
  }

  function seitenleiste(): string {
    const p = PAKETE[paket()]
    const monat = monatsbeitrag()
    return `<aside class="bu-leiste">
      <b>${test ? 'Testabo' : esc(p.name)}</b>
      <span class="bu-preis">${test ? `0 € <small>/ ${TESTABO_TAGE} Tage</small>` : `${monat} € <small>/ Monat</small>`}</span>
      ${test ? '<span class="bu-volumen">PlanR inkl. Sprachupgrade</span>' : w.doku === true ? `<span class="bu-volumen">${p.monat} € PlanR + ${DOKU_MONAT} € Sprachdokumentation</span>` : ''}
      ${test ? '' : `<span class="bu-volumen">+ ${cent(PRO_PLAN)} je Plan</span>
      <p>Bei 20 Plänen im Monat: ${cent(monat + 20 * PRO_PLAN)}</p>`}
      <ul>${test ? '<li>PlanR und Sprachupgrade zusammen</li><li>Keine Lastschrift in der Testzeit</li><li>Danach endet der Zugang</li>' : '<li>Alle Pläne, alle gängigen PVS</li><li>Jederzeit zum Monatsende kündbar</li>'}</ul>
      <p class="bu-klein">Fragen? <a href="tel:+4921130293035">0211 3029 3035</a></p>
    </aside>`
  }

  function schrittLeiste(): string {
    const monat = monatsbeitrag()
    const punkte = schritte.map((s, i) => {
      const klasse = i === schritt ? 'aktiv' : i <= erreicht ? 'erledigt' : ''
      const an = i <= erreicht || i === schritt + 1
      return `<li class="${klasse}"><button type="button" data-sprung="${i}"${an ? '' : ' disabled'}${i === schritt ? ' aria-current="step"' : ''}><span>${i + 1}</span><b>${s}</b></button></li>`
    }).join('')
    return `<nav class="bu-schritte" aria-label="Buchungsschritte">
        <button type="button" class="bu-pfeil" data-sprung="${schritt - 1}" aria-label="Zurück">←</button>
        <ol>${punkte}</ol>
        <button type="button" class="bu-pfeil" data-sprung="${schritt + 1}" aria-label="Weiter"${schritt >= schritte.length - 1 ? ' disabled' : ''}>→</button>
      </nav>
      <p class="bu-schritt-name">${schritt + 1} von ${schritte.length} · ${schritte[schritt]}</p>
      ${schritt > 0 ? `<p class="bu-preiszeile">${test ? `${TESTABO_TAGE} Tage PlanR inkl. Sprachupgrade · keine Lastschrift` : `${monat} € plus ${cent(PRO_PLAN)} je Plan${w.doku === true ? ` · davon ${DOKU_MONAT} € Sprachdokumentation` : ''}`}</p>` : ''}`
  }

  function zeichnen() {
    app.innerHTML = `
      <div class="bu-seite">
        <header class="bu-kopf">
          <a class="marke" href="#top"><span class="logo">${logo()}</span><div><h1>PlanR</h1><p>Buchen</p></div></a>
          <a class="link-knopf" href="#anmelden">Schon Kunde? Anmelden</a>
        </header>
        ${schrittLeiste()}
        <div class="bu-rumpf">
          <form class="bu-karte" novalidate>
            ${inhalt()}
            ${meldung ? `<p class="bu-meldung" role="alert">${esc(meldung)}</p>` : ''}
            <div class="bu-fuss">
              ${schritt > 0 ? '<button type="button" class="link-knopf" data-zurueck>← Zurück</button>' : '<a class="link-knopf" href="#preise">← Zur Startseite</a>'}
              <button type="submit" class="neu-knopf"${sendet ? ' disabled' : ''}>${schritt < schritte.length - 1 ? 'Weiter' : sendet ? (test ? 'Wird gestartet …' : 'Wird gebucht …') : (test ? 'Testabo starten' : 'Kostenpflichtig buchen')}</button>
            </div>
          </form>
          ${seitenleiste()}
        </div>
      </div>`
    const form = app.querySelector<HTMLFormElement>('form')!
    form.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement
      if (!el.name) return
      w[el.name] = el.type === 'checkbox' ? el.checked : el.value
      if (el.name === 'paket' || el.name === 'doku') zeichnen()
    })
    form.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement
      if (el.type === 'radio' || el.type === 'checkbox') { w[el.name] = el.type === 'checkbox' ? el.checked : el.value; if (el.name === 'paket' || el.name === 'doku') zeichnen() }
    })
    app.querySelector('[data-zurueck]')?.addEventListener('click', () => springen(schritt - 1))
    for (const knopf of app.querySelectorAll<HTMLButtonElement>('[data-sprung]')) {
      knopf.addEventListener('click', () => springen(Number(knopf.dataset.sprung)))
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); void weiter() })
    app.querySelector<HTMLElement>('.fehler input, .fehler select')?.focus()
  }

  function springen(ziel: number) {
    if (ziel < 0) { location.hash = '#top'; return }
    if (ziel >= schritte.length || ziel === schritt) return
    if (ziel > schritt) {
      fehler = pruefen()
      meldung = ''
      if (Object.keys(fehler).length) { meldung = 'Bitte die markierten Angaben ergänzen.'; zeichnen(); return }
      if (ziel > erreicht && ziel !== schritt + 1) return
    }
    schritt = ziel
    erreicht = Math.max(erreicht, schritt)
    fehler = {}
    meldung = ''
    zeichnen()
    scrollTo(0, 0)
  }

  function pruefen(): Record<string, string> {
    const f: Record<string, string> = {}
    for (const [name, text] of PFLICHT[schritt] ?? []) if (!String(w[name] ?? '').trim()) f[name] = `Bitte ${text} angeben.`
    if (schritt === 1 && w['praxis.plz'] && !/^\d{5}$/.test(String(w['praxis.plz']))) f['praxis.plz'] = 'Bitte eine fünfstellige Postleitzahl angeben.'
    if (schritt === 1) {
      if (String(w.passwort ?? '').length < 8) f.passwort = 'Das Passwort braucht mindestens 8 Zeichen.'
      else if (w.passwort !== w.passwort2) f.passwort2 = 'Die beiden Passwörter stimmen nicht überein.'
    }
    if (!test && schritt === 3) {
      if (w['sepa.iban'] && !ibanGueltig(String(w['sepa.iban']))) f['sepa.iban'] = 'Die IBAN ist nicht gültig – bitte prüfen.'
      if (w['sepa.mandat'] !== true) f['sepa.mandat'] = 'Bitte das SEPA-Lastschriftmandat erteilen.'
    }
    if (schritt === schritte.length - 1) for (const k of ['agb', 'datenschutz', 'avv']) if (w[`zustimmung.${k}`] !== true) f[`zustimmung.${k}`] = 'Bitte bestätigen.'
    return f
  }

  function daten() {
    const g = (k: string) => String(w[k] ?? '').trim()
    const teil = (prefix: string) => Object.fromEntries(Object.entries(w).filter(([k]) => k.startsWith(`${prefix}.`)).map(([k, v]) => [k.slice(prefix.length + 1), v]))
    const quelle = funnelQuelle()
    return {
      paket: paket(), praxis: teil('praxis'), inhaber: teil('inhaber'),
      kzv: { ...teil('kzv'), zahnaerzte: Number(g('kzv.zahnaerzte')), praxen: Number(g('kzv.praxen') || 1), eigenlabor: w['kzv.eigenlabor'] === true },
      pvs: teil('pvs'), hinweis: g('hinweis'), passwort: String(w.passwort ?? ''),
      sepa: { ...teil('sepa'), mandat: w['sepa.mandat'] === true }, zustimmung: teil('zustimmung'), doku: test || w.doku === true, testabo: test,
      firma2: (app.querySelector<HTMLInputElement>('[name=firma2]')?.value ?? ''),
      funnelKanal: quelle.kanal,
      funnelKampagne: quelle.kampagne,
    }
  }

  async function weiter() {
    fehler = pruefen()
    meldung = ''
    if (Object.keys(fehler).length) { meldung = 'Bitte die markierten Angaben ergänzen.'; return zeichnen() }
    if (schritt < schritte.length - 1) { schritt += 1; erreicht = Math.max(erreicht, schritt); zeichnen(); scrollTo(0, 0); return }
    sendet = true
    zeichnen()
    try {
      const r = await fetch('/api/buchung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten()) })
      const d = await r.json() as { ok: boolean; id?: string; email?: string; pvs?: string; konto?: string; angemeldet?: boolean; fehler?: Record<string, string>; meldung?: string; testabo?: { bis: string; vermerk: string } | null }
      sendet = false
      if (d.ok) {
        zielErreicht('buchung')
        return bestaetigung(app, d.id ?? '', String(d.email ?? w['inhaber.email']), String(d.pvs ?? w['pvs.id']), String(d.konto ?? 'manuell'), d.angemeldet === true, d.testabo)
      }
      fehler = d.fehler ?? {}
      const erster = Object.keys(fehler)[0]
      if (erster) schritt = (test && erster.startsWith('zustimmung.') ? schritte.length - 1 : SCHRITT_VON.find(([re]) => re.test(erster))?.[1]) ?? schritt
      meldung = d.meldung || 'Die Buchung hat nicht geklappt.'
    } catch {
      sendet = false
      meldung = 'Keine Verbindung zu PlanR. Bitte erneut versuchen oder anrufen: 0211 3029 3035.'
    }
    zeichnen()
  }

  zeichnen()
  scrollTo(0, 0)
}

function bestaetigung(app: HTMLElement, id: string, email: string, pvsId: string, konto: string, angemeldet: boolean, testabo?: { bis: string; vermerk: string } | null) {
  const pvs = pvsVon(pvsId)
  const zugang = angemeldet
    ? `<li><b>Zugang:</b> ${esc(email)} und das Passwort aus der Registrierung. Sie sind schon angemeldet.</li>`
    : konto === 'vorhanden'
      ? `<li><b>Zugang:</b> ${esc(email)} und das Passwort aus der Registrierung.</li>`
      : konto === 'manuell'
        ? `<li><b>Zugang:</b> Das Konto ist noch nicht angelegt. Bitte die Buchung noch einmal abschicken oder anrufen: 0211 3029 3035.</li>`
        : `<li><b>Zugang:</b> ${esc(email)} und das Passwort aus der Registrierung.</li>`
  const bis = testabo?.bis ? new Date(testabo.bis).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) : ''
  document.title = testabo ? 'PlanR – Testabo läuft' : 'PlanR – Buchung eingegangen'
  app.innerHTML = `
    <div class="bu-seite">
      <header class="bu-kopf"><a class="marke" href="#top"><span class="logo">${logo()}</span><div><h1>PlanR</h1><p>${testabo ? 'Testabo läuft' : 'Buchung eingegangen'}</p></div></a></header>
      <div class="bu-karte bu-danke">
        <p class="bu-haekchen">✓</p>
        <h2>${testabo ? 'Ihr Testabo ist gestartet.' : 'Vielen Dank – Ihre Buchung ist eingegangen.'}</h2>
        <p class="bu-text">${testabo ? `Buchungsnummer <b>${esc(id)}</b>. ${esc(testabo.vermerk)} Die Zugangsdaten gehen an <b>${esc(email)}</b>. Am ${esc(bis)} endet der Zugang.` : `Buchungsnummer <b>${esc(id)}</b>. Die Zugangsdaten gehen an <b>${esc(email)}</b>.`}</p>
        <ol class="bu-weiter">
          ${zugang}
          <li><b>Einrichtung:</b> Nach der ersten Anmeldung führt Sie der Assistent durch alles: Praxissystem, Installation der Bridge, Verbindung, Preise &amp; Positionen.</li>
        </ol>
        <h3>${esc(pvs?.name ?? 'Ihr Praxissystem')} verbinden</h3>
        ${angemeldet && anleitungVon(pvsId) ? `<p><button type="button" class="neu-knopf" data-bridge oncontextmenu="event.preventDefault()">PlanR-Bridge herunterladen</button></p>
          <p class="bu-klein" data-bridge-hinweis>Links klicken. Speichern unter legt die Datei ohne Ihre Praxis ab.</p>` : ''}
        ${anleitungHtml(pvsId)}
        <div class="bu-fuss"><a class="link-knopf" href="#top">← Zur Startseite</a>${angemeldet ? '<a class="neu-knopf" href="/#einrichtung">Zu PlanR</a>' : `<a class="neu-knopf" href="#anmelden">${konto === 'angelegt' ? 'Jetzt anmelden' : 'Zur Anmeldung'}</a>`}</div>
      </div>
    </div>`
  app.querySelector<HTMLButtonElement>('[data-bridge]')?.addEventListener('click', async (ev) => {
    const knopf = ev.currentTarget as HTMLButtonElement
    knopf.disabled = true
    const r = await bridgeDateiLaden()
    knopf.disabled = false
    if (!r.ok) {
      const hinweis = app.querySelector('[data-bridge-hinweis]')
      if (hinweis) hinweis.textContent = r.meldung
    }
  })
  scrollTo(0, 0)
}

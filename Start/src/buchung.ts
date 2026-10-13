/** Buchung von PlanR bzw. PlanR + Sprach-KI: Stammdaten, KZV, Praxissystem, SEPA-Mandat – danach Anleitung zur Einrichtung. */
import './buchung.css'
import { KZVEN } from './data/kzv'
import { PVS_LISTE, pvsVon } from './einstellungen'
import { PAKETE, PRO_PLAN, RECHTSFORMEN, SERVER, ibanGueltig, ibanNorm, type Paket } from './paket'
import { anleitungHtml, anleitungVon, bridgePaketLaden } from './einrichtung'

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

/** Seite #buchen bzw. #buchen-clara */
export function buchungSeite(app: HTMLElement, start: Paket = 'planr') {
  let schritt = 0
  let fehler: Record<string, string> = {}
  let meldung = ''
  let sendet = false
  const w: Werte = { paket: start, 'praxis.rechtsform': 'Einzelpraxis', 'kzv.praxen': '1', 'kzv.zahnaerzte': '1', 'pvs.server': 'server' }
  document.title = 'PlanR buchen'

  const paket = () => (w.paket === 'planr_clara' ? 'planr_clara' : 'planr') as Paket

  function mandatVorschau(): string {
    const anschrift = String(w['sepa.anschrift'] || `${w['praxis.strasse'] ?? ''}, ${w['praxis.plz'] ?? ''} ${w['praxis.ort'] ?? ''}`)
    return `<div class="bu-mandat">
      <b>SEPA-Lastschriftmandat</b> (wiederkehrende Zahlungen, SEPA-Basislastschrift)<br>
      Zahlungsempfänger: Pickadoc GmbH, Medical Center · c/o Dr. Petsas · Luise-Rainer-Str. 6–10 · 40235 Düsseldorf<br>
      Gläubiger-ID und Mandatsreferenz erhalten Sie mit der Bestätigung per E-Mail.<br><br>
      Ich ermächtige / Wir ermächtigen die Pickadoc GmbH, Zahlungen von meinem / unserem Konto mittels Lastschrift einzuziehen. Zugleich weise ich mein / weisen wir unser Kreditinstitut an, die von der Pickadoc GmbH auf mein / unser Konto gezogenen Lastschriften einzulösen.<br>
      Hinweis: Ich kann / Wir können innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem / unserem Kreditinstitut vereinbarten Bedingungen.
      Jeder Einzug wird mit der Rechnung angekündigt; die Frist der Vorabankündigung wird auf einen Kalendertag verkürzt.<br><br>
      Kontoinhaber: ${esc(String(w['sepa.inhaber'] || '…'))} · ${esc(anschrift)}
    </div>`
  }

  function inhalt(): string {
    const f = fehler
    switch (schritt) {
      case 0: return `
        <h2>Welches Paket möchten Sie?</h2>
        <div class="bu-pakete">${(Object.keys(PAKETE) as Paket[]).map((p) => `
          <label class="bu-paket${paket() === p ? ' an' : ''}">
            <input type="radio" name="paket" value="${p}"${paket() === p ? ' checked' : ''}>
            <b>${esc(PAKETE[p].name)}</b>
            <span class="bu-preis">${PAKETE[p].monat} € <small>/ Monat</small></span>
            <span class="bu-volumen">+ ${cent(PRO_PLAN)} je Plan</span>
            <small>${p === 'planr' ? 'Alle Planer, Umsatz-Regler, eigene Preislisten, PVS-Anbindung über die Bridge, Freigabe am Handy.' : 'Alles aus PlanR plus Clara als Sprach-App am Handy: HKP per Sprache anlegen und ändern.'}</small>
          </label>`).join('')}</div>
        <p class="bu-klein">Alle Preise netto zzgl. USt., monatlich kündbar. Pickadoc-MAS-Praxen haben PlanR schon inklusive – unbegrenzt Pläne.</p>`
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
      case 3: return `
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
      default: {
        const pvs = pvsVon(String(w['pvs.id'] ?? ''))
        const kzv = KZVEN.find((k) => k.nr === w['kzv.nr'])
        const iban = ibanNorm(String(w['sepa.iban'] ?? ''))
        return `
        <h2>Prüfen und kostenpflichtig buchen</h2>
        <dl class="bu-zusammen">
          <dt>Paket</dt><dd>${esc(PAKETE[paket()].name)} · ${PAKETE[paket()].monat} € / Monat + ${cent(PRO_PLAN)} je Plan</dd>
          <dt>Praxis</dt><dd>${esc(String(w['praxis.name'] ?? ''))}, ${esc(String(w['praxis.strasse'] ?? ''))}, ${esc(String(w['praxis.plz'] ?? ''))} ${esc(String(w['praxis.ort'] ?? ''))}</dd>
          <dt>Inhaber/in</dt><dd>${esc([w['inhaber.titel'], w['inhaber.vorname'], w['inhaber.nachname']].filter(Boolean).join(' '))} · Anmeldung mit ${esc(String(w['inhaber.email'] ?? ''))}</dd>
          <dt>KZV</dt><dd>${esc(kzv ? `${kzv.kurz}` : '')} · Abrechnungsnummer ${esc(String(w['kzv.abrechnungsnr'] ?? ''))}</dd>
          <dt>Praxissystem</dt><dd>${esc(pvs?.name ?? '')}${pvs && !pvs.bereit ? ' (Anbindung in Vorbereitung)' : ''}</dd>
          <dt>Lastschrift</dt><dd>${esc(String(w['sepa.inhaber'] ?? ''))} · ${esc(iban.slice(0, 4))} •••• ${esc(iban.slice(-4))}</dd>
        </dl>
        ${haken(w, f, 'zustimmung.agb', 'Ich habe die <a href="https://pickadoc.ai/agb.html" target="_blank" rel="noopener">AGB</a> gelesen und stimme zu.')}
        ${haken(w, f, 'zustimmung.datenschutz', 'Ich habe die <a href="https://pickadoc.ai/datenschutz.html" target="_blank" rel="noopener">Datenschutzhinweise</a> zur Kenntnis genommen.')}
        ${haken(w, f, 'zustimmung.avv', 'Ich beauftrage die Pickadoc GmbH mit der <b>Verarbeitung von Patientendaten im Auftrag</b> (Art. 28 DSGVO). Den Auftragsverarbeitungsvertrag erhalte ich mit der Freischaltung.')}
        <input type="text" name="firma2" class="bu-falle" tabindex="-1" autocomplete="off" aria-hidden="true">`
      }
    }
  }

  function seitenleiste(): string {
    const p = PAKETE[paket()]
    return `<aside class="bu-leiste">
      <b>${esc(p.name)}</b>
      <span class="bu-preis">${p.monat} € <small>/ Monat</small></span>
      <span class="bu-volumen">+ ${cent(PRO_PLAN)} je Plan</span>
      <p>Bei 20 Plänen im Monat: ${cent(p.monat + 20 * PRO_PLAN)}</p>
      <ul><li>Monatlich kündbar</li><li>Hosting in Deutschland</li><li>Einrichtung meist am selben Tag</li></ul>
      <p class="bu-klein">Fragen? <a href="tel:+4921130293035">0211 3029 3035</a></p>
    </aside>`
  }

  function zeichnen() {
    app.innerHTML = `
      <div class="bu-seite">
        <header class="bu-kopf">
          <a class="marke" href="#top"><span class="logo">PR</span><div><h1>PlanR</h1><p>Buchen</p></div></a>
          <a class="link-knopf" href="#anmelden">Schon Kunde? Anmelden</a>
        </header>
        <ol class="bu-schritte">${SCHRITTE.map((s, i) => `<li class="${i < schritt ? 'erledigt' : i === schritt ? 'aktiv' : ''}"><span>${i + 1}</span>${s}</li>`).join('')}</ol>
        <div class="bu-rumpf">
          <form class="bu-karte" novalidate>
            ${inhalt()}
            ${meldung ? `<p class="bu-meldung" role="alert">${esc(meldung)}</p>` : ''}
            <div class="bu-fuss">
              ${schritt > 0 ? '<button type="button" class="link-knopf" data-zurueck>← Zurück</button>' : '<a class="link-knopf" href="#preise">← Zur Startseite</a>'}
              <button type="submit" class="neu-knopf"${sendet ? ' disabled' : ''}>${schritt < SCHRITTE.length - 1 ? 'Weiter' : sendet ? 'Wird gebucht …' : 'Kostenpflichtig buchen'}</button>
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
      if (el.name === 'paket') zeichnen()
    })
    form.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement
      if (el.type === 'radio' || el.type === 'checkbox') { w[el.name] = el.type === 'checkbox' ? el.checked : el.value; if (el.name === 'paket') zeichnen() }
    })
    app.querySelector('[data-zurueck]')?.addEventListener('click', () => { schritt -= 1; fehler = {}; meldung = ''; zeichnen(); scrollTo(0, 0) })
    form.addEventListener('submit', (e) => { e.preventDefault(); void weiter() })
    app.querySelector<HTMLElement>('.fehler input, .fehler select')?.focus()
  }

  function pruefen(): Record<string, string> {
    const f: Record<string, string> = {}
    for (const [name, text] of PFLICHT[schritt] ?? []) if (!String(w[name] ?? '').trim()) f[name] = `Bitte ${text} angeben.`
    if (schritt === 1 && w['praxis.plz'] && !/^\d{5}$/.test(String(w['praxis.plz']))) f['praxis.plz'] = 'Bitte eine fünfstellige Postleitzahl angeben.'
    if (schritt === 1) {
      if (String(w.passwort ?? '').length < 8) f.passwort = 'Das Passwort braucht mindestens 8 Zeichen.'
      else if (w.passwort !== w.passwort2) f.passwort2 = 'Die beiden Passwörter stimmen nicht überein.'
    }
    if (schritt === 3) {
      if (w['sepa.iban'] && !ibanGueltig(String(w['sepa.iban']))) f['sepa.iban'] = 'Die IBAN ist nicht gültig – bitte prüfen.'
      if (w['sepa.mandat'] !== true) f['sepa.mandat'] = 'Bitte das SEPA-Lastschriftmandat erteilen.'
    }
    if (schritt === 4) for (const k of ['agb', 'datenschutz', 'avv']) if (w[`zustimmung.${k}`] !== true) f[`zustimmung.${k}`] = 'Bitte bestätigen.'
    return f
  }

  function daten() {
    const g = (k: string) => String(w[k] ?? '').trim()
    const teil = (prefix: string) => Object.fromEntries(Object.entries(w).filter(([k]) => k.startsWith(`${prefix}.`)).map(([k, v]) => [k.slice(prefix.length + 1), v]))
    return {
      paket: paket(), praxis: teil('praxis'), inhaber: teil('inhaber'),
      kzv: { ...teil('kzv'), zahnaerzte: Number(g('kzv.zahnaerzte')), praxen: Number(g('kzv.praxen') || 1), eigenlabor: w['kzv.eigenlabor'] === true },
      pvs: teil('pvs'), hinweis: g('hinweis'), passwort: String(w.passwort ?? ''),
      sepa: { ...teil('sepa'), mandat: w['sepa.mandat'] === true }, zustimmung: teil('zustimmung'),
      firma2: (app.querySelector<HTMLInputElement>('[name=firma2]')?.value ?? ''),
    }
  }

  async function weiter() {
    fehler = pruefen()
    meldung = ''
    if (Object.keys(fehler).length) { meldung = 'Bitte die markierten Angaben ergänzen.'; return zeichnen() }
    if (schritt < SCHRITTE.length - 1) { schritt += 1; zeichnen(); scrollTo(0, 0); return }
    sendet = true
    zeichnen()
    try {
      const r = await fetch('/api/buchung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten()) })
      const d = await r.json() as { ok: boolean; id?: string; email?: string; pvs?: string; konto?: string; angemeldet?: boolean; fehler?: Record<string, string>; meldung?: string }
      sendet = false
      if (d.ok) return bestaetigung(app, d.id ?? '', String(d.email ?? w['inhaber.email']), String(d.pvs ?? w['pvs.id']), String(d.konto ?? 'manuell'), d.angemeldet === true)
      fehler = d.fehler ?? {}
      const erster = Object.keys(fehler)[0]
      if (erster) schritt = SCHRITT_VON.find(([re]) => re.test(erster))?.[1] ?? schritt
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

function bestaetigung(app: HTMLElement, id: string, email: string, pvsId: string, konto: string, angemeldet: boolean) {
  const pvs = pvsVon(pvsId)
  const zugang = angemeldet
    ? `<li><b>Zugang:</b> Ihr Konto ist eingerichtet und Sie sind schon angemeldet. Später melden Sie sich mit ${esc(email)} und Ihrem Passwort an.</li>`
    : konto === 'angelegt'
    ? `<li><b>Zugang:</b> Ihr Konto ist eingerichtet. Melden Sie sich jetzt mit ${esc(email)} und Ihrem Passwort an.</li>`
    : konto === 'vorhanden'
      ? `<li><b>Freischaltung:</b> Für ${esc(email)} gibt es schon ein Pickadoc-Konto. Wir schalten PlanR dafür frei – meist noch am selben Werktag. Danach melden Sie sich mit Ihrem bestehenden Pickadoc-Passwort an.</li>`
      : `<li><b>Freischaltung:</b> Wir richten Ihren Zugang ein – meist noch am selben Werktag. Sie bekommen dann eine E-Mail, mit der Sie das Passwort für ${esc(email)} festlegen.</li>`
  document.title = 'PlanR – Buchung eingegangen'
  app.innerHTML = `
    <div class="bu-seite">
      <header class="bu-kopf"><a class="marke" href="#top"><span class="logo">PR</span><div><h1>PlanR</h1><p>Buchung eingegangen</p></div></a></header>
      <div class="bu-karte bu-danke">
        <p class="bu-haekchen">✓</p>
        <h2>Vielen Dank – Ihre Buchung ist eingegangen.</h2>
        <p class="bu-text">Buchungsnummer <b>${esc(id)}</b>. Die Bestätigung mit Ihrem SEPA-Mandat geht an <b>${esc(email)}</b>.</p>
        <ol class="bu-weiter">
          ${zugang}
          <li><b>Einrichtung:</b> Nach der ersten Anmeldung führt Sie der Assistent durch alles: Praxissystem, Installation der Bridge, Verbindung, Preise &amp; Positionen.</li>
        </ol>
        <h3>${esc(pvs?.name ?? 'Ihr Praxissystem')} verbinden</h3>
        ${anleitungVon(pvsId) ? `<p><button type="button" class="neu-knopf" data-bridge-laden>PlanR-Bridge herunterladen</button></p>
          <p class="bu-klein" data-bridge-meldung>${angemeldet ? 'Das Paket ist für Ihre Praxis vorbereitet – bei der Installation muss nichts eingegeben werden.' : 'Zum Herunterladen melden Sie sich kurz an; danach startet der Download.'}</p>` : ''}
        ${anleitungHtml(pvsId)}
        <div class="bu-fuss"><a class="link-knopf" href="#top">← Zur Startseite</a>${angemeldet ? '<a class="neu-knopf" href="/#einrichtung">Zu PlanR</a>' : `<a class="neu-knopf" href="#anmelden">${konto === 'angelegt' ? 'Jetzt anmelden' : 'Zur Anmeldung'}</a>`}</div>
      </div>
    </div>`
  const knopf = app.querySelector<HTMLButtonElement>('[data-bridge-laden]')
  const hinweis = app.querySelector<HTMLElement>('[data-bridge-meldung]')
  knopf?.addEventListener('click', async () => {
    if (!angemeldet) { location.hash = '#bridge'; return }
    knopf.disabled = true
    knopf.textContent = 'Paket wird erstellt …'
    const r = await bridgePaketLaden()
    knopf.disabled = false
    knopf.textContent = r.ok ? 'Erneut herunterladen' : 'PlanR-Bridge herunterladen'
    if (r.ok) { if (hinweis) hinweis.textContent = '✓ Heruntergeladen (Ordner „Downloads“). Jetzt auf den Server kopieren, entpacken und Installieren.cmd doppelklicken.' }
    else if (r.status === 401 || r.status === 403) location.hash = '#bridge'
    else if (hinweis) hinweis.textContent = r.meldung
  })
  scrollTo(0, 0)
}

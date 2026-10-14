import './homepage.css'
import './clara-handy.css'
import { logo, wortmarke } from './logo'

/** Öffentliche Startseite von PlanR für Besucher ohne Anmeldung. */

const CLARA_SCHRITTE = ['Befund', 'Regelversorgung', 'Festzuschuss', 'BEMA', 'GOZ', 'BEL II', 'Begründung']
const CLARA_ZUSTAENDE = [
  { id: 'listening', zustand: 'Ich höre zu', unter: 'Patient und Befund sagen', hinweis: '„HKP für Frau Berger …“' },
  { id: 'thinking', zustand: 'Clara rechnet …', unter: 'Befund · Zuschüsse · Regler', hinweis: '' },
  { id: 'speaking', zustand: 'Clara spricht', unter: 'Plan steht · 4.380 €', hinweis: '„Soll ich ihn ins PVS geben?“' },
]

const PVS = ['Dampsoft DS-Win', 'CGM Z1.PRO', 'DENSoffice', 'solutio charly', 'evident', 'ivoris', 'VISIdent', 'Linudent', 'jedes PVS mit VDDS-Schnittstelle']

const ZUSATZ = [
  { titel: 'keine', euro: 0 },
  { titel: 'Präparation', euro: 62 },
  { titel: 'Adhäsive Befestigung', euro: 148 },
  { titel: 'Digitale Abformung', euro: 205 },
  { titel: 'Funktionsdiagnostik', euro: 330 },
  { titel: 'Instrumentelle Planung', euro: 480 },
]
const PRIVAT = [
  { titel: 'Kasse', honorar: 0, labor: 0 },
  { titel: 'Teilverblendung', honorar: 90, labor: 260 },
  { titel: 'Vollkeramik', honorar: 210, labor: 640 },
  { titel: 'Ästhetik', honorar: 260, labor: 910 },
  { titel: 'Premium', honorar: 320, labor: 1260 },
]
/** Beispiel: Brücke 14–16 und Krone 26, Kasse, Eigenlabor */
const BEMA = 740
const BEL_HOECHST = 1180
const PLANR = 69

const symbol = (pfade: string) =>
  `<span class="hp-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${pfade}</svg></span>`
const IKONEN = {
  mikro: symbol('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M8.5 20.5h7"/>'),
  regler: symbol('<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2.2"/><circle cx="15" cy="12" r="2.2"/><circle cx="8" cy="18" r="2.2"/>'),
  zahn: symbol('<path fill="currentColor" stroke="none" d="M8.2 6.2c0-2.2 1.2-3.8 2.4-3.8.8 0 1.3.8 1.6 1.5.3-.7.8-1.5 1.6-1.5 1.2 0 2.4 1.6 2.4 3.8 0 1.7-.3 3.4-.8 5-.4 1.2-1 2.3-1.8 2.3-.7 0-.9-.8-1.1-2-.2-1.3-.5-1.9-1.3-1.9s-1.1.6-1.3 1.9c-.2 1.2-.4 2-1.1 2-.8 0-1.4-1.1-1.8-2.3-.5-1.6-.8-3.3-.8-5z"/>'),
  praxis: symbol('<path d="M4 20.5V9.2L12 4l8 5.2v11.3"/><path d="M9.5 20.5v-5.2h5v5.2"/><path d="M12 8.2v3.6M10.2 10h3.6"/>'),
  tausch: symbol('<path d="M4 7h12"/><path d="M13 4l3 3-3 3"/><path d="M20 17H8"/><path d="M11 14l-3 3 3 3"/>'),
  handy: symbol('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'),
}

interface Regler { zusatz: number; faktor: number; bel: number; privat: number; beb: number; plaene: number }
const START: Regler = { zusatz: 0, faktor: 2.3, bel: 60, privat: 0, beb: 0, plaene: 20 }

function umsatz(r: Regler): number {
  const goz = (ZUSATZ[r.zusatz].euro + PRIVAT[r.privat].honorar) * (r.faktor / 2.3)
  const bel = BEL_HOECHST * (r.bel / 100)
  const beb = PRIVAT[r.privat].labor * (1 + r.beb / 100)
  return BEMA + goz + bel + beb
}

/** Demo-HKP (Anna Berger): Brücke 14–16, Krone 26, Vollkeramik. */
const OK = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const UK = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
type Reihe = 'TP' | 'R' | 'B'
const GEBISS: Record<number, Partial<Record<Reihe, string>>> = {
  14: { TP: 'KM', R: 'KV', B: 'ww' }, 15: { TP: 'BM', R: 'BV', B: 'f' }, 16: { TP: 'KM', R: 'KV', B: 'ww' },
  26: { TP: 'KM', R: 'K', B: 'ww' }, 46: { B: 'k' }, 36: { B: 'k' }, 38: { B: 'f' }, 48: { B: 'f' },
}
const FESTZUSCHUSS = [['2.1', '14–16', '1', '1.012,41'], ['2.7', '14, 16', '2', '205,10'], ['1.1', '26', '1', '375,52'], ['1.3', '26', '1', '63,20']]
const KOSTEN = [['BEMA-Honorar', '742,18'], ['GOZ-Honorar', '1.284,60'], ['Material- und Laborkosten', '2.353,22']]

function gebissZeilen(zaehne: number[], reihen: Reihe[], nummernZuerst: boolean): string {
  const nummern = `<tr class="hkp-nr"><th></th>${zaehne.map((z) => `<td>${z}</td>`).join('')}</tr>`
  const zeilen = reihen.map((r) => `<tr><th>${r}</th>${zaehne.map((z) => {
    const w = GEBISS[z]?.[r] ?? ''
    return `<td${w && r === 'TP' ? ' class="hkp-plan"' : ''}>${w}</td>`
  }).join('')}</tr>`).join('')
  return nummernZuerst ? nummern + zeilen : zeilen + nummern
}

const HKP_FORMULAR = `
  <div class="hkp">
    <div class="hkp-kopf">
      <div class="hkp-feld">
        <small>Krankenkasse bzw. Kostenträger</small><b>AOK Rheinland/Hamburg</b>
        <small>Name, Vorname des Versicherten</small><b>Berger, Anna</b>
        <span>geb. 14.03.1968 · Vers.-Nr. A123456789</span>
      </div>
      <div class="hkp-titel"><b>Heil- und Kostenplan</b><span>Teil 1 · Zahnersatz</span><em>Bonus 30 %</em></div>
    </div>
    <div class="hkp-abschnitt">I. Befund des gesamten Gebisses / Behandlungsplan</div>
    <table class="hkp-gebiss">
      ${gebissZeilen(OK, ['TP', 'R', 'B'], false)}
      <tr class="hkp-trenner"><td colspan="17"></td></tr>
      ${gebissZeilen(UK, ['B', 'R', 'TP'], true)}
    </table>
    <div class="hkp-unten">
      <div>
        <div class="hkp-abschnitt">II. Befunde für Festzuschüsse</div>
        <table class="hkp-tab">
          <tr><th>Befund</th><th>Zahn/Gebiet</th><th>Anz.</th><th>Betrag €</th></tr>
          ${FESTZUSCHUSS.map((z) => `<tr>${z.map((w) => `<td>${w}</td>`).join('')}</tr>`).join('')}
          <tr class="hkp-summe"><td colspan="3">Festzuschüsse gesamt</td><td>1.656,23</td></tr>
        </table>
      </div>
      <div>
        <div class="hkp-abschnitt">III. Kostenplanung</div>
        <table class="hkp-tab">
          ${KOSTEN.map(([t, w], i) => `<tr><td>${i + 1}</td><td>${t}</td><td>${w}</td></tr>`).join('')}
          <tr class="hkp-summe"><td>4</td><td>Gesamtkosten</td><td>4.380,00</td></tr>
          <tr><td>5</td><td>Festzuschüsse</td><td>−1.656,23</td></tr>
          <tr class="hkp-eigen"><td>6</td><td>Eigenanteil</td><td>2.723,77</td></tr>
        </table>
      </div>
    </div>
    <div class="hkp-fuss"><span>Zahnarztpraxis Dr. Demo · Musterstraße 1 · 40235 Düsseldorf</span><span class="hkp-stempel">${logo('PlanR-Stempel')} von Clara erstellt</span></div>
  </div>`

const HKP_MINI = `
  <div class="hkp hkp--mini">
    <div class="hkp-titel"><b>Heil- und Kostenplan</b><span>Teil 1 · Zahnersatz</span></div>
    <div class="hkp-feld"><b>Berger, Anna</b><span>AOK Rheinland/Hamburg · Bonus 30 %</span></div>
    <div class="hkp-abschnitt">I. Befund / Behandlungsplan</div>
    <table class="hkp-gebiss">${gebissZeilen(OK, ['TP', 'R', 'B'], false)}</table>
    <div class="hkp-abschnitt">II. Festzuschüsse</div>
    <table class="hkp-tab">
      ${FESTZUSCHUSS.map(([b, z, , w]) => `<tr><td>${b}</td><td>${z}</td><td>${w}</td></tr>`).join('')}
    </table>
    <div class="hkp-abschnitt">III. Kostenplanung</div>
    <table class="hkp-tab">
      <tr class="hkp-summe"><td>Gesamtkosten</td><td>4.380,00</td></tr>
      <tr><td>Festzuschüsse</td><td>−1.656,23</td></tr>
      <tr class="hkp-eigen"><td>Eigenanteil</td><td>2.723,77</td></tr>
    </table>
    <div class="hkp-fuss"><span class="hkp-stempel">${logo('PlanR-Stempel')} von Clara erstellt</span></div>
  </div>`

const PLAENE = [
  { bild: 'hkp', pfad: 'hkp', titel: 'Kassen-HKP', unter: 'Zahnersatz · BEMA, GOZ, BEL II',
    text: 'Befund, Regelversorgung, Festzuschüsse und Bonus – der Heil- und Kostenplan nach Vordruck, mit Eigenlabor und Mehrkosten.' },
  { bild: 'privat-ze', pfad: 'privat-hkp', titel: 'Privat-ZE', unter: 'Kostenvoranschlag · GOZ & BEB',
    text: 'Kronen, Brücken, Veneers und Implantatkronen für Privatpatienten – Material, Labor und Abformung gleich mit.' },
  { bild: 'implantologie', pfad: 'implantologie', titel: 'Implantologie', unter: 'GOZ, GOÄ & Analog',
    text: 'Implantate, Augmentation, Extraktion, DVT und Sedierung – mit System, Durchmesser und Länge je Implantat.' },
  { bild: 'par', pfad: 'par', titel: 'Kassen-PAR', unter: 'eFormular 5 · BEMA Teil 4',
    text: 'Parodontalstatus Blatt 1 und 2 mit Stadium und Grad, AIT, CPT und der kompletten UPT-Strecke.' },
  { bild: 'privat-par', pfad: 'privat-par', titel: 'Privat-PAR', unter: 'GOZ Abschnitt E & Analog',
    text: 'Parodontitistherapie für Privatpatienten – von der Diagnostik über die CPT bis zur UPT.' },
  { bild: 'kfo', pfad: 'kfo', titel: 'KFO', unter: 'BEMA Teil 3 · BEL II · Kasse & privat',
    text: 'Behandlungsplan mit KIG, Punkteraster für 119 und 120, Bausteinen und Mehrleistungen nach Vordruck 4d.' },
  { bild: 'kb', pfad: 'kb', titel: 'Schienen & Kieferbruch', unter: 'KB · BEMA Teil 2 · Kasse & privat',
    text: 'Aufbissbehelf, Michigan-Schiene und Kontrollen – mit der passenden BEL-II-Laborkette.' },
  { bild: 'kons', pfad: 'kons', titel: 'Privat-Kons', unter: 'Füllung, Endo, Bleaching · GOZ',
    text: 'Füllungen, Endo, Vitalerhaltung, Veneers und Bleaching als Kostenvoranschlag mit allen Zusatzleistungen.' },
  { bild: 'mkv', pfad: 'mkv', titel: 'Mehrkosten (MKV)', unter: 'Füllungen · § 28 Abs. 2 SGB V',
    text: 'Mehrkostenvereinbarung für Komposit und Inlays – der Kassenanteil wird automatisch abgezogen.' },
]

const PVS_RUECK = [
  { name: 'Dampsoft DS-Win', farbe: '#2f6db3' },
  { name: 'CGM Z1.PRO', farbe: '#0f8a6e' },
  { name: 'DENSoffice', farbe: '#b3462f' },
  { name: 'solutio charly', farbe: '#6a4bb3' },
]
const RUECK_PLAENE = [
  { art: 'HKP', text: 'Brücke 14–16, Krone 26', summe: '4.380,00 €' },
  { art: 'PAR', text: 'AIT, CPT 16 17 26 36 46', summe: '2.048,30 €' },
  { art: 'KFO', text: 'Multiband OK/UK, 12 Quartale', summe: '2.228,19 €' },
  { art: 'Implantat', text: 'Implantate 24, 36, 45', summe: '3.000,59 €' },
]

const FORMEN = '<div class="hp-formen" aria-hidden="true"><i class="f1"></i><i class="f2"></i><i class="f3"></i><i class="f4"></i><i class="f5"></i></div>'

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`
const komma = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const cent = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const PRO_PLAN = 1.59
const kosten = (plaene: number) => PLANR + plaene * PRO_PLAN

const HTML = `
<div class="hp">
  <header class="hp-nav">
    <a class="hp-marke" href="#top"><span class="hp-logo">${logo()}</span>${wortmarke()}<small>by Pickadoc</small></a>
    <button class="hp-burger" type="button" aria-label="Menü öffnen" aria-expanded="false" aria-controls="hp-menue" data-burger><i></i><i></i><i></i></button>
    <nav id="hp-menue">
      <a href="#hkp">HKP</a>
      <a href="#plaene">Alle Pläne</a>
      <a href="#pvs">Ins PVS</a>
      <a href="#sprach-ki">Sprach-KI</a>
      <a href="#spielwiese">Regler</a>
      <a href="#connect">Connect</a>
      <a href="#preise">Preise</a>
      <a href="#produkte">Pickadoc</a>
      <a class="hp-nav-anmelden" href="#anmelden">Anmelden</a>
    </nav>
  </header>

  <section class="hp-hero" id="top">
    <div class="hp-glow"></div>
    <div class="hp-hero-text">
      <p class="hp-eyebrow">PlanR · Heil- und Kostenpläne mit Sprach-KI</p>
      <h1>Ab sofort macht <span class="hp-verlauf">HKP erstellen</span> Spaß.</h1>
      <p class="hp-lead">Per Sprach-KI: <b>Patient nennen, Befund sagen</b> – Clara erstellt den HKP und errechnet den <b>maximalen Umsatz</b> deiner Praxis.
        Praxisindividuell und vorbereitet für Dampsoft, Z1.PRO, DENSoffice und solutio.</p>
      <p class="hp-gestern"><s>HKP outsourcen für teuer Geld</s> war gestern.</p>
      <div class="hp-ctas">
        <a class="hp-knopf hp-knopf-voll" href="#connect">Heute connecten</a>
        <a class="hp-knopf" href="#sprach-ki">So geht's per Sprache</a>
      </div>
      <p class="hp-klein">Schon Kunde? <a href="#anmelden">Mit dem Pickadoc-Konto anmelden</a></p>
    </div>
    <div class="hp-handy">
      <div class="cc-stage">
        <div class="cc-phone" aria-label="Clara erstellt einen HKP per Sprache">
          <div class="cc-phone__notch" aria-hidden="true"></div>
          <div class="cc-flip">
            <div class="cc-flip__inner" data-clara="flip">
              <div class="cc-flip__face cc-flip__face--front">
                <div class="cc-screen cc-screen--voice clara-phone__screen" data-clara="schirm" data-state="listening">
                  <div class="cp-top">
                    <small data-clara="unter">Patient und Befund sagen</small>
                    <h4>Clara</h4>
                  </div>
                  <div class="cp-mid">
                    <div class="cp-orb-wrap">
                      <div class="cp-ring r1"></div>
                      <div class="cp-ring r2"></div>
                      <div class="cp-orb"><div class="cp-wave" aria-hidden="true"><span></span><span></span><span></span></div></div>
                    </div>
                    <div class="cp-state" data-clara="zustand">Ich höre zu</div>
                    <div class="cp-hint" data-clara="hinweis"></div>
                    <div class="cp-agents" aria-hidden="true">
                      ${CLARA_SCHRITTE.map((s) => `<span>${s}</span>`).join('')}
                    </div>
                  </div>
                  <div class="cp-mode" aria-hidden="true"><i class="is-on">🎙 Sprache</i><i>💬 Chat</i></div>
                </div>
              </div>
              <div class="cc-flip__face cc-flip__face--back">
                <div class="cc-screen hp-hkp-schirm">${HKP_MINI}</div>
              </div>
            </div>
          </div>
          <div class="cc-flip-labels" aria-hidden="true"><span class="is-voice">Clara</span><span class="is-text">HKP</span></div>
          <div class="mas-phone-dots cc-hero-dots" data-clara="punkte" aria-label="Clara Zustand">
            <button type="button" class="is-active" data-i="0" aria-label="Hört zu"></button>
            <button type="button" data-i="1" aria-label="Rechnet"></button>
            <button type="button" data-i="2" aria-label="Spricht"></button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="hp-band" aria-label="Kompatible Praxisverwaltungssysteme">
    <div class="hp-band-label">100 % kompatibel</div>
    <div class="hp-band-fenster">
      <div class="hp-band-spur">
        ${[...PVS, ...PVS].map((p) => `<span>${p}</span>`).join('')}
      </div>
    </div>
  </section>

  <section class="hp-buehne hp-pink" id="hkp">
    <div class="hp-buehne-innen">
      <div class="hp-buehne-bild hp-buehne-bild--pink" aria-hidden="true">
        ${FORMEN}
        <div class="hp-tablet"><div class="hp-tablet-schirm">${HKP_FORMULAR}</div></div>
        <div class="hp-schwebe">
          <small>Mit PlanR</small><b>4.380 €</b><em>+1.430 € gegenüber dem PVS-Plan</em>
          <ul><li>Festzuschüsse ermittelt</li><li>GOZ-Faktor 3,0 begründet</li><li>Mehrkostenvereinbarung bereit</li></ul>
        </div>
      </div>
      <div class="hp-buehne-text">
        <p class="hp-eyebrow">Der Heil- und Kostenplan</p>
        <h2>Ein echter HKP. In Sekunden.</h2>
        <p>Befund, Regelversorgung, Therapieplanung, Festzuschüsse und Kostenplanung – PlanR füllt den Heil- und Kostenplan komplett aus.
          Mit den Punktwerten deiner KZV, deinem Eigenlabor und deinen Preisen.</p>
        <ul class="hp-haken">
          <li>Kassen-HKP, Privat-ZE, Implantologie, PAR, KB und KFO</li>
          <li>Festzuschüsse und Bonus automatisch</li>
          <li>Drucken oder fertig zurück ins PVS</li>
        </ul>
        <div class="hp-ctas">
          <a class="hp-knopf hp-knopf-voll" href="#buchen">PlanR buchen</a>
          <a class="hp-knopf" href="#spielwiese">Umsatz-Regler ausprobieren</a>
        </div>
        <p class="hp-klein">Beispiel mit Demo-Patientin.</p>
      </div>
    </div>
  </section>

  <section class="hp-buehne hp-buehne--plaene hp-pink" id="plaene">
   <div class="hp-sektion">
    <div class="hp-sektion-kopf">
      <p class="hp-eyebrow">Nicht nur HKP</p>
      <h2><em>Alle Pläne</em> deiner Praxis. Ein Werkzeug.</h2>
      <p>Von Zahnersatz über Implantologie, Parodontitis und Kieferorthopädie bis zur Füllung – jeder Plan mit Kassen- oder Privatlogik,
        deinen Preisen und deinem Labor. Das sind echte Screenshots aus PlanR.</p>
    </div>
    <div class="hp-galerie" data-galerie>
      <div class="hp-galerie-wahl" role="tablist" aria-label="Plantyp">
        ${PLAENE.map((p, i) => `<button type="button" role="tab" data-i="${i}" aria-selected="${i === 0}"${i === 0 ? ' class="aktiv"' : ''}>
          <b>${p.titel}</b><small>${p.unter}</small></button>`).join('')}
      </div>
      <div class="hp-galerie-buehne">
        <div class="hp-galerie-formen hp-buehne-bild--pink" aria-hidden="true">${FORMEN}</div>
        <div class="hp-fenster">
          <div class="hp-fenster-kopf"><i></i><i></i><i></i><span data-galerie-pfad>planr.pickadoc.de/planer/${PLAENE[0].pfad}</span></div>
          <div class="hp-fenster-bild">
            ${PLAENE.map((p, i) => `<img src="/bilder/planer-${p.bild}.jpg" width="1272" height="906" alt="PlanR ${p.titel}-Planer mit Demo-Patientin"
              loading="${i === 0 ? 'eager' : 'lazy'}"${i === 0 ? ' class="aktiv"' : ''}>`).join('')}
          </div>
        </div>
        <div class="hp-galerie-text">
          <b data-galerie-titel>${PLAENE[0].titel}</b>
          <p data-galerie-text>${PLAENE[0].text}</p>
          <a class="hp-link" data-galerie-link href="/planer/${PLAENE[0].pfad}/" target="_blank" rel="noopener">Planer live ausprobieren →</a>
        </div>
      </div>
    </div>
   </div>
  </section>

  <section class="hp-sektion hp-rueck hp-pink" id="pvs">
    <div class="hp-sektion-kopf">
      <p class="hp-eyebrow">Zurück ins Praxisprogramm</p>
      <h2>Fertig geplant. Steht sofort in <em>deinem PVS.</em></h2>
      <p>Freigegebene Pläne schreibt PlanR über die PlanR-Bridge direkt in die Patientenakte deines eigenen Praxisverwaltungssystems –
        mit allen Positionen. Kein Abtippen, kein Export, kein offener Port. Abgerechnet wird wie gewohnt im PVS.</p>
    </div>
    <div class="hp-rueck-fluss" data-rueck>
      <div class="hp-rueck-planr">
        <div class="hp-rueck-kopf"><span class="hp-logo">${logo()}</span>${wortmarke()}</div>
        <div class="hp-rueck-plan">
          <small>Plan freigegeben</small>
          <div><b data-rueck-art>HKP</b> · Berger, Anna</div>
          <span data-rueck-text>${RUECK_PLAENE[0].text}</span>
          <em data-rueck-summe>${RUECK_PLAENE[0].summe}</em>
        </div>
        <span class="hp-rueck-knopf">Ins PVS übertragen ✓</span>
      </div>
      <div class="hp-rueck-bruecke" aria-hidden="true">
        <div class="hp-rueck-bahn"><i class="hp-rueck-paket">${logo()}</i></div>
        <small>PlanR-Bridge · verschlüsselt · ohne offenen Port</small>
      </div>
      <div class="hp-rueck-pvs" data-rueck-pvs style="--pvs:${PVS_RUECK[0].farbe}">
        <div class="hp-rueck-titel"><span data-rueck-pvs-name>${PVS_RUECK[0].name}</span><i></i><i></i><i></i></div>
        <div class="hp-rueck-akte">
          <div class="hp-rueck-patient"><b>Berger, Anna</b><small>* 18.04.1971 · AOK Rheinland/Hamburg</small></div>
          <div class="hp-rueck-reiter"><span>Stammdaten</span><span>Befund</span><span class="an">Pläne</span><span>Leistungen</span></div>
          <table>
            <thead><tr><th>Datum</th><th>Art</th><th>Inhalt</th><th>Betrag</th><th>Status</th></tr></thead>
            <tbody>
              <tr class="hp-rueck-neu"><td>13.10.2026</td><td data-rueck-z-art>HKP</td><td data-rueck-z-text>${RUECK_PLAENE[0].text}</td>
                <td data-rueck-z-summe>${RUECK_PLAENE[0].summe}</td><td><span class="hp-rueck-von">von PlanR ✓</span></td></tr>
              <tr><td>02.09.2025</td><td>PZR</td><td>Professionelle Zahnreinigung</td><td>98,00 €</td><td>abgerechnet</td></tr>
              <tr><td>12.03.2025</td><td>Kons</td><td>Füllung 46 mod</td><td>142,60 €</td><td>abgerechnet</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <ol class="hp-rueck-schritte">
      <li><b>Plan in PlanR freigeben</b><span>Am PC oder per Link am Handy – egal welcher Plantyp.</span></li>
      <li><b>Bridge überträgt</b><span>Die PlanR-Bridge auf deinem Praxisserver holt den Plan verschlüsselt ab.</span></li>
      <li><b>Steht im PVS</b><span>Mit allen Positionen in der Patientenakte – ${PVS_RUECK.map((p) => p.name).join(', ')} und weitere.</span></li>
    </ol>
  </section>

  <section class="hp-buehne hp-buehne--sk" id="sprach-ki">
   <div class="hp-sektion hp-sprachki">
    <div class="hp-sektion-kopf">
      <p class="hp-eyebrow">HKP per Sprach-KI</p>
      <h2>Sag es Clara. Der Plan steht.</h2>
      <p>Kein Tippen, kein Nachschlagen, kein Abrechnungsdienst. Du sprichst – Clara erstellt den Heil- und Kostenplan und holt das Maximum für deine Praxis heraus.</p>
    </div>
    <div class="hp-sk">
      <ol class="hp-schritte">
        <li><span>1</span><div><h3>Patient nennen</h3><p>„Clara, HKP für Frau Berger.“ Clara holt die Patientin aus deinem Praxissystem – Kasse, Bonus und Vorgeschichte inklusive.</p></div></li>
        <li><span>2</span><div><h3>Befund sagen</h3><p>„14 bis 16 Brücke, 26 Krone, Vollkeramik.“ Befund, Regelversorgung, Festzuschüsse und alle Positionen nach BEMA, GOZ und BEL II stehen in Sekunden.</p></div></li>
        <li><span>3</span><div><h3>Maximalen Umsatz errechnen lassen</h3><p>Clara schlägt Zusatzleistungen, Faktor, Eigenlabor und Privatanteil vor – mit Begründungen und Mehrkostenvereinbarung. Du entscheidest per Regler.</p></div></li>
      </ol>
      <div class="hp-buehne-bild hp-buehne-bild--rechts" aria-hidden="true">
        ${FORMEN}
        <div class="hp-schraeg-handy">
          <div class="cc-phone">
            <div class="cc-phone__notch"></div>
            <div class="cc-screen hp-chat">
              <div class="hp-chat-kopf"><span class="hp-chat-orb"></span><div><b>Clara</b><small>HKP PER SPRACHE</small></div></div>
              <div class="hp-sprache">
                <span class="hp-mic"><i></i><i></i><i></i><i></i><i></i></span>
                <p data-diktat></p>
              </div>
              <div class="hp-plan" data-plan>
                <div class="hp-plan-kopf"><b>HKP · Berger, Anna</b><span class="hp-pille">fertig</span></div>
                <div class="hp-plan-zeile"><span>14–16</span><span>Brücke, Vollkeramik</span></div>
                <div class="hp-plan-zeile"><span>26</span><span>Vollkeramikkrone</span></div>
                <div class="hp-plan-zeile"><span>Festzuschüsse</span><span>1.656,23 €</span></div>
                <div class="hp-plan-zeile"><span>BEMA · GOZ · BEL II</span><span>24 Positionen</span></div>
                <div class="hp-plan-summe"><span>Praxisumsatz</span><b data-demo-summe>0 €</b></div>
                <div class="hp-plan-balken"><i data-demo-balken></i></div>
                <p class="hp-chat-antwort">„Plan steht. Soll ich ihn ins PVS geben?“</p>
              </div>
              <div class="cp-mode"><i class="is-on">🎙 Sprache</i><i>💬 Chat</i></div>
            </div>
          </div>
        </div>
      </div>
    </div>
   </div>
  </section>

  <section class="hp-sektion hp-spielwiese" id="spielwiese">
    <div class="hp-sektion-kopf">
      <p class="hp-eyebrow">Spielwiese</p>
      <h2>Treib den Preis nach oben.</h2>
      <p>Dieselben Regler wie im PlanR-Planer. Beispiel: Brücke 14–16 und Krone 26, Kassenpatient, Eigenlabor.</p>
    </div>
    <div class="hp-spiel">
      <div class="hp-regler">
        <label><span>Zusätzliche GOZ-Leistungen <b data-wert="zusatz"></b></span>
          <input type="range" min="0" max="${ZUSATZ.length - 1}" step="1" data-regler="zusatz"></label>
        <label><span>GOZ-Faktor <b data-wert="faktor"></b></span>
          <input type="range" min="2.3" max="3.5" step="0.1" data-regler="faktor"></label>
        <label><span>Kasse · BEL II Eigenlabor <b data-wert="bel"></b></span>
          <input type="range" min="50" max="100" step="1" data-regler="bel"></label>
        <label><span>Kasse → Privat <b data-wert="privat"></b></span>
          <input type="range" min="0" max="${PRIVAT.length - 1}" step="1" data-regler="privat"></label>
        <label><span>Privat · BEB-Aufschlag <b data-wert="beb"></b></span>
          <input type="range" min="0" max="100" step="5" data-regler="beb"></label>
        <p class="hp-regler-hinweis" data-hinweis></p>
      </div>
      <div class="hp-ergebnis">
        <p class="hp-ergebnis-titel">Praxisumsatz für diesen Plan</p>
        <p class="hp-ergebnis-zahl" data-umsatz>0 €</p>
        <p class="hp-ergebnis-plus" data-plus></p>
        <div class="hp-meter"><i data-meter></i></div>
        <label class="hp-plaene"><span>Pläne pro Monat <b data-wert="plaene"></b></span>
          <input type="range" min="5" max="80" step="1" data-regler="plaene"></label>
        <div class="hp-monat">
          <div><small>Mehrumsatz im Monat</small><b data-monat>0 €</b></div>
          <div><small>PlanR kostet</small><b data-kosten>${cent(kosten(20))}</b></div>
        </div>
        <p class="hp-roi" data-roi></p>
        <button class="hp-link" type="button" data-zurueck>Regler zurücksetzen</button>
      </div>
    </div>
    <p class="hp-fussnote">Vereinfachte Beispielrechnung. Im Planer rechnet PlanR mit deinen Preislisten, den Punktwerten deiner KZV und deinem Labor.
      Faktoren über 2,3 brauchen eine Begründung je Position (§ 10 GOZ) – die schlägt PlanR gleich mit vor.</p>
  </section>

  <section class="hp-sektion hp-connect" id="connect">
    <div class="hp-connect-box">
      <div class="hp-connect-text">
        <p class="hp-eyebrow">Easy Connect</p>
        <h2>Heute connecten. Morgen mehr Umsatz.</h2>
        <p>PlanR verbindet sich mit deinem Praxissystem – in wenigen Minuten, ohne offenen Port, ohne IT-Projekt.
          Exportiere deine ersten HKP und sieh schwarz auf weiß, <b>wie viel mehr Umsatz PlanR aus denselben Befunden holt.</b></p>
        <ol class="hp-connect-schritte">
          <li><b>Bridge installieren</b><span>Ein Doppelklick auf dem Praxisserver. Die Verbindung baut die Bridge selbst auf.</span></li>
          <li><b>Erste HKP holen</b><span>Deine vorhandenen Pläne kommen direkt aus dem PVS in PlanR.</span></li>
          <li><b>Mehrumsatz sehen</b><span>Regler ziehen, Differenz ablesen – und den besseren Plan zurück ins PVS geben.</span></li>
        </ol>
        <div class="hp-ctas">
          <a class="hp-knopf hp-knopf-voll" href="#buchen">Jetzt buchen &amp; connecten</a>
          <a class="hp-knopf" href="#spielwiese">Erst mal mit den Reglern spielen</a>
        </div>
      </div>
      <div class="hp-connect-bild" aria-hidden="true">
        <div class="hp-connect-pvs">${PVS.slice(0, 4).map((p) => `<span>${p}</span>`).join('')}</div>
        <div class="hp-connect-linie"><i></i></div>
        <div class="hp-connect-planr"><span class="hp-logo">${logo()}</span>${wortmarke()}</div>
        <div class="hp-connect-vergleich">
          <div><small>HKP wie im PVS</small><b>2.950 €</b></div>
          <div class="hp-connect-mehr"><small>Mit PlanR</small><b>4.380 €</b><em>+1.430 €</em></div>
        </div>
      </div>
    </div>
  </section>

  <section class="hp-sektion hp-fluss" id="funktionen">
    <div class="hp-stroeme" aria-hidden="true"><span></span><span></span><span></span><span class="mobil"></span><span class="mobil"></span><span class="mobil"></span></div>
    <div class="hp-sektion-kopf hp-ein">
      <p class="hp-eyebrow">Was PlanR kann</p>
      <h2>Alles, wofür du bisher einen Abrechnungsdienst bezahlt hast.</h2>
    </div>
    <div class="hp-karten">
      <article class="hp-ein"><h3>${IKONEN.mikro}<span>Diktieren statt tippen</span></h3>
        <p>„Clara, HKP für Frau Berger: 14 bis 16 Brücke, 26 Krone.“ Befund, Regelversorgung, Festzuschüsse und Positionen stehen in Sekunden.</p></article>
      <article class="hp-ein"><h3>${IKONEN.regler}<span>Regler für maximalen Umsatz</span></h3>
        <p>Zusatzleistungen, GOZ-Faktor, Eigenlabor und Privatanteil per Schieberegler – mit Begründungen und Mehrkostenvereinbarung.</p></article>
      <article class="hp-ein"><h3>${IKONEN.zahn}<span>Alle Pläne deiner Praxis</span></h3>
        <p>Kassen-HKP, Privat-ZE, Implantologie, PAR, Kieferbruch und Schienen, KFO sowie Kons und Mehrkosten – ein Werkzeug für alles.</p></article>
      <article class="hp-ein"><h3>${IKONEN.praxis}<span>Praxisindividuell</span></h3>
        <p>Deine Preislisten, dein Eigenlabor-Katalog, BEL II für jede KZV und tagesaktuelle Punktwerte. Dein Stil, nicht der vom Dienstleister.</p></article>
      <article class="hp-ein"><h3>${IKONEN.tausch}<span>Zurück ins PVS</span></h3>
        <p>Pläne aus dem Praxisprogramm holen und fertig zurückgeben – über die PlanR-Bridge, ohne offenen Port am Praxisserver.</p></article>
      <article class="hp-ein"><h3>${IKONEN.handy}<span>Freigabe am Handy</span></h3>
        <p>Plan per Link prüfen, Regler nachziehen, freigeben. Praxisgemeinschaften sehen jeweils nur ihre eigenen Pläne.</p></article>
    </div>
  </section>

  <section class="hp-sektion hp-vergleich hp-fluss">
    <div class="hp-stroeme" aria-hidden="true"><span></span><span></span><span class="mobil"></span><span class="mobil"></span></div>
    <div class="hp-vs">
      <div class="hp-vs-alt hp-ein">
        <h3>Gestern: HKP outsourcen</h3>
        <ul><li>Bezahlung pro Plan</li><li>Tage warten, Rückfragen per Mail</li><li>Fremde Preislogik, verschenkter Umsatz</li><li>Patientendaten verlassen die Praxis</li></ul>
      </div>
      <div class="hp-vs-neu hp-ein">
        <h3>Heute: PlanR</h3>
        <ul><li>${PLANR} € im Monat und ${cent(PRO_PLAN)} je Plan</li><li>Fertig, während der Patient noch im Stuhl sitzt</li><li>Deine Regler, dein Umsatz</li><li>Hosting in Deutschland, DSGVO-konform</li></ul>
      </div>
    </div>
  </section>

  <section class="hp-sektion hp-fluss" id="preise">
    <div class="hp-stroeme" aria-hidden="true"><span></span><span></span><span class="mobil"></span><span class="mobil"></span></div>
    <div class="hp-sektion-kopf hp-ein">
      <p class="hp-eyebrow">Preise</p>
      <h2>Ein Plan, der sich ab dem ersten HKP rechnet.</h2>
      <p>Alle Preise netto zzgl. USt., monatlich kündbar.</p>
    </div>
    <div class="hp-tiers">
      <article class="hp-tier hp-ein">
        <h3>PlanR</h3>
        <p class="hp-preis"><b>${PLANR} €</b> / Monat</p>
        <p class="hp-volumen">+ <b>${cent(PRO_PLAN)}</b> je Plan</p>
        <ul><li>Alle Planer: ZE, Implantologie, PAR, KB, KFO, Kons</li><li>Umsatz-Regler und Begründungen</li><li>Eigene Preislisten und Eigenlabor</li><li>PVS-Anbindung über die PlanR-Bridge</li><li>Freigabe am Handy</li></ul>
        <a class="hp-knopf" href="#buchen">PlanR buchen</a>
      </article>
      <article class="hp-tier hp-tier-top hp-ein">
        <span class="hp-band-tag">Beliebt</span>
        <h3>PlanR + Sprach-KI</h3>
        <p class="hp-preis"><b>${PLANR + 49} €</b> / Monat</p>
        <p class="hp-volumen">+ <b>${cent(PRO_PLAN)}</b> je Plan</p>
        <ul><li>Alles aus PlanR</li><li>Clara als Sprach-App am Handy</li><li>Pläne per Sprache anlegen und ändern</li><li>Kopplung per QR-Code, ohne Installation am PC</li><li>Eigener Name für deine Assistentin</li></ul>
        <a class="hp-knopf hp-knopf-voll" href="#buchen-clara">Mit Sprach-KI buchen</a>
      </article>
      <article class="hp-tier hp-ein">
        <h3>Pickadoc MAS</h3>
        <p class="hp-preis"><b>PlanR inklusive</b></p>
        <p class="hp-volumen"><b>Unbegrenzt</b> Pläne erstellen</p>
        <ul><li>Volle Clara als Leitstelle deiner Praxis</li><li>Acht KI-Spezialistinnen: Telefon, Recall, Post, QM, Doku, Abrechnung</li><li>PlanR direkt in Sophie, ohne zweite Anmeldung</li><li>Unbegrenzt Pläne, ohne Preis je Plan</li></ul>
        <a class="hp-knopf" href="https://pickadoc.ai" target="_blank" rel="noopener">Auf pickadoc.ai ansehen</a>
      </article>
    </div>
  </section>

  <section class="hp-sektion hp-produkte hp-fluss" id="produkte">
    <div class="hp-stroeme" aria-hidden="true"><span></span><span></span><span class="mobil"></span><span class="mobil"></span><span class="mobil"></span></div>
    <div class="hp-sektion-kopf hp-ein">
      <p class="hp-eyebrow">Ein Pickadoc-Produkt</p>
      <h2>Brauchst du mehr?</h2>
      <p>PlanR ist erst der Anfang. Für jede Aufgabe in deiner Praxis hat Pickadoc eine KI-Kollegin – einzeln oder im Paket CORE, Frontdesk und MAS.</p>
    </div>
    <div class="hp-karten hp-karten-produkte">
      <article class="hp-ein"><small>Online-Termine</small><h3>CalendR</h3><p>Die beste Alternative zu Doctolib für Zahnärzte: Online-Buchung, Praxiskalender und Erinnerungen.</p></article>
      <article class="hp-ein"><small>Aufklärung &amp; Unterschrift</small><h3>SignR</h3><p>Aufklärungs-KI und digitale Unterschriften – Bögen am Tablet erklären, unterschreiben, ablegen.</p></article>
      <article class="hp-ein"><small>KI-Videos</small><h3>ClonR</h3><p>Videos mit deinem Gesicht und deiner Stimme – für Aufklärung, Website und Social Media, ohne Drehtag.</p></article>
      <article class="hp-ein"><small>CallR · Telefon-KI eingehend</small><h3>Bianca</h3><p>Nimmt jeden Anruf an, vergibt Termine und beantwortet Fragen – rund um die Uhr.</p></article>
      <article class="hp-ein"><small>CallR · Telefon-KI ausgehend</small><h3>Lisa</h3><p>Ruft für dich heraus: Recall, Terminerinnerungen und Rückrufe.</p></article>
      <article class="hp-ein"><small>Post-KI</small><h3>Nadine</h3><p>Liest Briefe, E-Mails und Faxe, sortiert sie zu und bereitet Antworten vor.</p></article>
      <article class="hp-ein"><small>Abrechnungs-KI</small><h3>Sophie</h3><p>Prüft die Abrechnung und findet vergessene Leistungen. PlanR läuft direkt in Sophie.</p></article>
      <article class="hp-ein"><small>Ersthelferin am Handy</small><h3>Clara</h3><p>Deine Leitstelle per Sprache – sie kennt die Praxis und ruft die richtige Kollegin.</p></article>
      <article class="hp-ein"><small>QM-KI</small><h3>Julia</h3><p>Qualitätsmanagement, Hygiene und Begehungen – Dokumente immer aktuell.</p></article>
      <article class="hp-ein"><small>Arbeitszeit-KI</small><h3>Marie</h3><p>Erfasst Arbeitszeiten und behält Urlaub und Dienstplan im Blick.</p></article>
      <article class="hp-ein"><small>Sprechzimmer-KI</small><h3>Lena</h3><p>Hört bei der Behandlung mit und schreibt die Dokumentation für dich.</p></article>
      <article class="hp-ein"><small>Empfang</small><h3>Self-Check-in</h3><p>Patienten melden sich an der Stele selbst an – Karte stecken, Anamnese ausfüllen, fertig.</p></article>
    </div>
    <p class="hp-mitte"><a class="hp-knopf" href="https://pickadoc.ai" target="_blank" rel="noopener">Alle Produkte auf pickadoc.ai</a></p>
  </section>

  <section class="hp-sektion hp-kontakt hp-fluss" id="kontakt">
    <div class="hp-stroeme" aria-hidden="true"><span></span><span class="mobil"></span><span class="mobil"></span></div>
    <div class="hp-sektion-kopf hp-ein">
      <h2>PlanR für deine Praxis</h2>
      <p>Online buchen in fünf Minuten – Stammdaten, KZV, SEPA-Mandat, Passwort. Danach sofort anmelden: Der Einrichtungsassistent führt dich bis zum ersten HKP aus deinem PVS.</p>
    </div>
    <div class="hp-kontakt-wege hp-ein">
      <a class="hp-knopf hp-knopf-voll" href="#buchen">Jetzt online buchen</a>
      <a class="hp-knopf" href="mailto:info@pickadoc.de?subject=PlanR%20buchen">E-Mail schreiben</a>
      <a class="hp-knopf" href="tel:+4921130293035">0211 3029 3035</a>
      <a class="hp-knopf" href="https://wa.me/491776004600" target="_blank" rel="noopener">WhatsApp</a>
    </div>
  </section>

  <footer class="hp-fuss">
    <address><b>Pickadoc GmbH</b><br>Medical Center · c/o Dr. Petsas<br>Luise-Rainer-Str. 6–10, 40235 Düsseldorf<br><a href="tel:+4921130293035">0211 3029 3035</a> · <a href="mailto:info@pickadoc.de">info@pickadoc.de</a></address>
    <nav>
      <a href="https://pickadoc.ai/impressum.html" target="_blank" rel="noopener">Impressum</a>
      <a href="https://pickadoc.ai/datenschutz.html" target="_blank" rel="noopener">Datenschutz</a>
      <a href="https://pickadoc.ai/agb.html" target="_blank" rel="noopener">AGB</a>
      <a href="#kontakt">Kontakt</a>
      <a href="#anmelden">Anmelden</a>
    </nav>
  </footer>
  <button class="hp-hoch" type="button" aria-label="Nach oben" data-hoch>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
</div>`

const DIKTAT = '„Clara, HKP für Frau Berger: 14 bis 16 Brücke, 26 Krone – Vollkeramik.“'

let laeuft = 0

/** Hero: Diktat tippt sich, danach füllt sich der Plan und die Summe zählt hoch – in Schleife. */
function demoStarten(wurzel: HTMLElement) {
  const lauf = ++laeuft
  const diktat = wurzel.querySelector<HTMLElement>('[data-diktat]')!
  const plan = wurzel.querySelector<HTMLElement>('[data-plan]')!
  const summe = wurzel.querySelector<HTMLElement>('[data-demo-summe]')!
  const balken = wurzel.querySelector<HTMLElement>('[data-demo-balken]')!
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches
  const warten = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const ziel = 4380
  const buehne = diktat.closest<HTMLElement>('.hp-buehne')!
  let scrollt = false
  let timer = 0
  const beiScroll = () => {
    scrollt = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => { scrollt = false }, 160)
  }
  window.addEventListener('scroll', beiScroll, { passive: true })
  const vorher = aufraeumen
  aufraeumen = () => {
    vorher?.()
    window.removeEventListener('scroll', beiScroll)
    window.clearTimeout(timer)
  }
  const frei = () => !scrollt && !buehne.classList.contains('hp-pausiert')
  const bisFrei = async () => { while (lauf === laeuft && !frei()) await warten(120) }
  const balkenAuf = (anteil: number) => { balken.style.transform = `scaleX(${anteil})` }
  if (ruhig) {
    diktat.textContent = DIKTAT
    plan.classList.add('sichtbar')
    summe.textContent = euro(ziel)
    balkenAuf(1)
    return
  }
  void (async () => {
    while (lauf === laeuft && document.body.contains(wurzel)) {
      diktat.textContent = ''
      plan.classList.remove('sichtbar')
      summe.textContent = '0 €'
      balkenAuf(0)
      await warten(500)
      for (const z of DIKTAT) {
        if (lauf !== laeuft) return
        await bisFrei()
        diktat.textContent += z
        await warten(32)
      }
      await warten(400)
      plan.classList.add('sichtbar')
      let t0 = performance.now()
      let pauseAb = 0
      await new Promise<void>((fertig) => {
        const schritt = (t: number) => {
          if (lauf !== laeuft) return fertig()
          if (!frei()) {
            if (!pauseAb) pauseAb = t
            window.setTimeout(() => requestAnimationFrame(schritt), 120)
            return
          }
          if (pauseAb) { t0 += t - pauseAb; pauseAb = 0 }
          const p = Math.min(1, (t - t0) / 1600)
          const e = 1 - (1 - p) ** 3
          const text = euro(ziel * e)
          if (summe.textContent !== text) summe.textContent = text
          balkenAuf(e)
          if (p < 1) requestAnimationFrame(schritt)
          else fertig()
        }
        requestAnimationFrame(schritt)
      })
      await warten(3600)
    }
  })()
}

/** Hero-Handy: alle 3 s Flip zwischen Clara (Zuhören → Rechnen → Sprechen, wie auf pickadoc.ai) und dem pinken HKP. */
function claraHandyStarten(wurzel: HTMLElement) {
  const lauf = laeuft
  const feld = (name: string) => wurzel.querySelector<HTMLElement>(`[data-clara="${name}"]`)!
  const flip = feld('flip')
  const schirm = feld('schirm')
  const chips = [...schirm.querySelectorAll<HTMLElement>('.cp-agents span')]
  const punkte = [...feld('punkte').querySelectorAll<HTMLButtonElement>('button')]
  let i = 0, schritt = 0, aktiv = 0
  let takt: ReturnType<typeof setInterval> | undefined

  const zeigen = (n: number) => {
    const z = CLARA_ZUSTAENDE[n]
    schirm.dataset.state = z.id
    feld('zustand').textContent = z.zustand
    feld('unter').textContent = z.unter
    let hinweis = z.hinweis
    for (const c of chips) c.classList.remove('is-asking', 'is-answered')
    if (z.id === 'thinking') {
      aktiv = schritt++ % chips.length
      chips[aktiv].classList.add('is-asking')
      hinweis = `prüfe ${chips[aktiv].textContent} …`
    } else if (z.id === 'speaking') chips[aktiv].classList.add('is-answered')
    feld('hinweis').textContent = hinweis
    punkte.forEach((p, pi) => p.classList.toggle('is-active', pi === n))
  }
  const starten = () => {
    if (takt) clearInterval(takt)
    takt = setInterval(() => {
      if (lauf !== laeuft || !document.body.contains(wurzel)) return clearInterval(takt)
      const zumHkp = !flip.classList.contains('ist-hkp')
      flip.classList.toggle('ist-hkp', zumHkp)
      if (!zumHkp) {
        i = (i + 1) % CLARA_ZUSTAENDE.length
        zeigen(i)
      }
    }, 3000)
  }
  for (const p of punkte) {
    p.addEventListener('click', () => {
      i = Number(p.dataset.i)
      flip.classList.remove('ist-hkp')
      zeigen(i)
      starten()
    })
  }
  zeigen(0)
  starten()
}

/** Plan-Galerie: Klick wählt den Plantyp, sonst wechselt sie alle 5 s von selbst, bis jemand klickt. */
function galerieStarten(wurzel: HTMLElement) {
  const lauf = laeuft
  const galerie = wurzel.querySelector<HTMLElement>('[data-galerie]')!
  const knoepfe = [...galerie.querySelectorAll<HTMLButtonElement>('[role=tab]')]
  const bilder = [...galerie.querySelectorAll<HTMLImageElement>('.hp-fenster-bild img')]
  const feld = (name: string) => galerie.querySelector<HTMLElement>(`[data-galerie-${name}]`)!
  let i = 0
  const zeigen = (n: number) => {
    i = n
    const p = PLAENE[n]
    knoepfe.forEach((k, ki) => { k.classList.toggle('aktiv', ki === n); k.setAttribute('aria-selected', String(ki === n)) })
    knoepfe[n].parentElement!.scrollTo({ left: knoepfe[n].offsetLeft - 12, behavior: 'smooth' })
    bilder.forEach((b, bi) => b.classList.toggle('aktiv', bi === n))
    feld('pfad').textContent = `planr.pickadoc.de/planer/${p.pfad}`
    feld('titel').textContent = p.titel
    feld('text').textContent = p.text
    feld('link').setAttribute('href', `/planer/${p.pfad}/`)
  }
  const takt = setInterval(() => {
    if (lauf !== laeuft || !document.body.contains(galerie)) return clearInterval(takt)
    zeigen((i + 1) % PLAENE.length)
  }, 5000)
  for (const k of knoepfe) {
    k.addEventListener('click', () => {
      clearInterval(takt)
      zeigen(Number(k.dataset.i))
    })
  }
}

/** Rückschreiben: alle 4,5 s fliegt ein anderer Plan über die Bridge in ein anderes PVS und erscheint dort als neue Zeile. */
function rueckStarten(wurzel: HTMLElement) {
  const lauf = laeuft
  const fluss = wurzel.querySelector<HTMLElement>('[data-rueck]')!
  const pvs = fluss.querySelector<HTMLElement>('[data-rueck-pvs]')!
  const feld = (name: string) => fluss.querySelector<HTMLElement>(`[data-rueck-${name}]`)!
  let n = 0
  const zeigen = () => {
    const plan = RUECK_PLAENE[n % RUECK_PLAENE.length]
    const system = PVS_RUECK[n % PVS_RUECK.length]
    feld('art').textContent = plan.art
    feld('text').textContent = plan.text
    feld('summe').textContent = plan.summe
    feld('pvs-name').textContent = system.name
    pvs.style.setProperty('--pvs', system.farbe)
    feld('z-art').textContent = plan.art
    feld('z-text').textContent = plan.text
    feld('z-summe').textContent = plan.summe
    fluss.classList.remove('laeuft')
    void fluss.offsetWidth
    fluss.classList.add('laeuft')
  }
  zeigen()
  const takt = setInterval(() => {
    if (lauf !== laeuft || !document.body.contains(fluss)) return clearInterval(takt)
    n++
    zeigen()
  }, 4500)
}

let aufraeumen: (() => void) | undefined

/** Karten ab „Was PlanR kann“ nacheinander einblenden; Animationen ausserhalb des Bilds anhalten. */
function flussStarten(wurzel: HTMLElement) {
  const vorher = aufraeumen
  const beobachter: IntersectionObserver[] = []
  const teile = [...wurzel.querySelectorAll<HTMLElement>('.hp-fluss .hp-ein')]
  const schritt = window.matchMedia('(max-width: 900px)').matches ? 130 : 75
  const ein = new IntersectionObserver((eintraege) => {
    const treffer = eintraege.filter((e) => e.isIntersecting)
    treffer.sort((a, b) => (a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    treffer.forEach((e, i) => {
      const el = e.target as HTMLElement
      el.style.setProperty('--d', `${i * schritt}ms`)
      el.classList.add('sichtbar')
      ein.unobserve(el)
    })
  }, { threshold: 0.16, rootMargin: '0px 0px -36px 0px' })
  for (const el of teile) ein.observe(el)
  const ruhe = new IntersectionObserver((eintraege) => {
    for (const e of eintraege) e.target.classList.toggle('hp-pausiert', !e.isIntersecting)
  }, { rootMargin: '220px 0px' })
  for (const el of wurzel.querySelectorAll('.hp-hero, .hp-band, .hp-buehne, .hp-sektion')) ruhe.observe(el)
  beobachter.push(ein, ruhe)
  aufraeumen = () => {
    vorher?.()
    for (const io of beobachter) io.disconnect()
  }
}

/** Handy-Menü und Nach-oben-Pfeil. */
function navigationStarten(wurzel: HTMLElement) {
  const burger = wurzel.querySelector<HTMLButtonElement>('[data-burger]')!
  const menue = wurzel.querySelector<HTMLElement>('#hp-menue')!
  const hoch = wurzel.querySelector<HTMLButtonElement>('[data-hoch]')!
  const schalten = (offen: boolean) => {
    wurzel.classList.toggle('hp-menue-offen', offen)
    burger.setAttribute('aria-expanded', String(offen))
    burger.setAttribute('aria-label', offen ? 'Menü schließen' : 'Menü öffnen')
  }
  burger.addEventListener('click', () => schalten(!wurzel.classList.contains('hp-menue-offen')))
  menue.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) schalten(false) })
  hoch.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
  const beimScrollen = () => hoch.classList.toggle('sichtbar', window.scrollY > window.innerHeight * 1.2)
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schalten(false) }
  window.addEventListener('scroll', beimScrollen, { passive: true })
  window.addEventListener('keydown', taste)
  beimScrollen()
  aufraeumen = () => {
    window.removeEventListener('scroll', beimScrollen)
    window.removeEventListener('keydown', taste)
  }
}

function spielwieseStarten(wurzel: HTMLElement) {
  const r: Regler = { ...START }
  const regler = [...wurzel.querySelectorAll<HTMLInputElement>('[data-regler]')]
  const wert = (k: keyof Regler) => wurzel.querySelector<HTMLElement>(`[data-wert="${k}"]`)!
  const feld = (sel: string) => wurzel.querySelector<HTMLElement>(sel)!
  const basis = umsatz(START)
  const max = umsatz({ zusatz: ZUSATZ.length - 1, faktor: 3.5, bel: 100, privat: PRIVAT.length - 1, beb: 100, plaene: 0 })
  let angezeigt = basis

  const zaehlen = (ziel: number) => {
    const von = angezeigt, t0 = performance.now()
    const schritt = (t: number) => {
      const p = Math.min(1, (t - t0) / 350)
      angezeigt = von + (ziel - von) * (1 - (1 - p) ** 3)
      feld('[data-umsatz]').textContent = euro(angezeigt)
      if (p < 1) requestAnimationFrame(schritt)
    }
    requestAnimationFrame(schritt)
  }

  const zeigen = () => {
    for (const el of regler) el.value = String(r[el.dataset.regler as keyof Regler])
    wert('zusatz').textContent = `Stufe ${r.zusatz} · ${ZUSATZ[r.zusatz].titel}`
    wert('faktor').textContent = komma(r.faktor)
    wert('bel').textContent = `${r.bel} % vom Höchstpreis`
    wert('privat').textContent = `Stufe ${r.privat} · ${PRIVAT[r.privat].titel}`
    wert('beb').textContent = `+${r.beb} %`
    wert('plaene').textContent = String(r.plaene)
    const bebRegler = regler.find((el) => el.dataset.regler === 'beb')!
    bebRegler.disabled = r.privat === 0
    const u = umsatz(r)
    zaehlen(u)
    const plus = u - basis
    feld('[data-plus]').textContent = plus > 0.5 ? `+${euro(plus)} mehr als ohne Regler` : 'Schieb mal ein bisschen …'
    feld('[data-meter]').style.width = `${Math.round(((u - basis) / (max - basis)) * 100)}%`
    const monat = plus * r.plaene
    feld('[data-monat]').textContent = euro(monat)
    const preis = kosten(r.plaene)
    feld('[data-kosten]').textContent = cent(preis)
    feld('[data-roi]').textContent = monat > preis
      ? `PlanR hat sich ${Math.floor(monat / preis).toLocaleString('de-DE')}-fach bezahlt gemacht.`
      : ''
    const hinweis = r.faktor > 2.3 ? 'Über 2,3: PlanR schlägt die Begründung je Position vor (§ 10 GOZ).'
      : r.privat > 0 ? 'Privatanteil: PlanR erstellt die Mehrkostenvereinbarung gleich mit.'
        : r.privat === 0 ? 'Der BEB-Aufschlag wirkt, sobald ein Privatanteil gewählt ist.' : ''
    feld('[data-hinweis]').textContent = hinweis
    wurzel.querySelector('.hp-ergebnis')!.classList.toggle('maximal', u >= max - 1)
  }

  for (const el of regler) {
    el.addEventListener('input', () => {
      const k = el.dataset.regler as keyof Regler
      r[k] = Number(el.value)
      zeigen()
    })
  }
  feld('[data-zurueck]').addEventListener('click', () => {
    Object.assign(r, START)
    zeigen()
  })
  zeigen()
}

export function homepage(app: HTMLElement) {
  document.body.classList.add('hp-body')
  document.title = 'PlanR – HKP erstellen per Sprach-KI'
  app.innerHTML = HTML
  const wurzel = app.querySelector<HTMLElement>('.hp')!
  aufraeumen?.()
  navigationStarten(wurzel)
  flussStarten(wurzel)
  demoStarten(wurzel)
  claraHandyStarten(wurzel)
  galerieStarten(wurzel)
  rueckStarten(wurzel)
  spielwieseStarten(wurzel)
  const ziel = /^#[a-z-]+$/.test(location.hash) && location.hash !== '#top' ? wurzel.querySelector(location.hash) : null
  ziel?.scrollIntoView()
}

export function homepageVerlassen() {
  laeuft++
  aufraeumen?.()
  aufraeumen = undefined
  document.body.classList.remove('hp-body')
}

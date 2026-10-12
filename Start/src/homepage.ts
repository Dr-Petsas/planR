import './homepage.css'
import './clara-handy.css'

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

interface Regler { zusatz: number; faktor: number; bel: number; privat: number; beb: number; plaene: number }
const START: Regler = { zusatz: 0, faktor: 2.3, bel: 60, privat: 0, beb: 0, plaene: 20 }

function umsatz(r: Regler): number {
  const goz = (ZUSATZ[r.zusatz].euro + PRIVAT[r.privat].honorar) * (r.faktor / 2.3)
  const bel = BEL_HOECHST * (r.bel / 100)
  const beb = PRIVAT[r.privat].labor * (1 + r.beb / 100)
  return BEMA + goz + bel + beb
}

const euro = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`
const komma = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const HTML = `
<div class="hp">
  <header class="hp-nav">
    <a class="hp-marke" href="#top"><span class="hp-logo">PR</span><span>PlanR <small>by Pickadoc</small></span></a>
    <nav>
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
            <div class="cc-flip__inner">
              <div class="cc-flip__face cc-flip__face--front">
                <div class="cc-screen cc-screen--text">
                  <div class="cc-brand"><b>Clara</b><small>HKP PER SPRACHE</small></div>
                  <div class="cc-next">
                    <div class="cc-next__tag">Neuer HKP</div>
                    <div class="cc-next__name"><b>Anna Berger</b><span class="cc-next__time">Bonus 30 %</span></div>
                    <div class="cc-next__why">Befund: 14–16 Brücke, 26 Krone</div>
                  </div>
                  <div class="cc-key">
                    <div class="cc-key__h">Clara hat erledigt</div>
                    <ul>
                      <li class="is-info"><i>✓</i> Befund und Regelversorgung</li>
                      <li class="is-info"><i>✓</i> Festzuschüsse ermittelt</li>
                      <li class="is-info"><i>✓</i> BEMA, GOZ, BEL II – 24 Positionen</li>
                      <li class="is-warn"><i>↑</i> Vollkeramik statt Kasse</li>
                      <li class="is-warn"><i>↑</i> GOZ-Faktor 3,0 mit Begründung</li>
                      <li class="is-alert"><i>✎</i> Mehrkostenvereinbarung bereit</li>
                    </ul>
                  </div>
                  <div class="cc-headsup">
                    <span class="cc-eq"><span></span><span></span><span></span><span></span></span>
                    <span class="cc-headsup__long">Maximaler Umsatz · 4.380 €</span>
                    <span class="cc-headsup__short">4.380 €</span>
                  </div>
                  <div class="cc-tabs"><span>Befund</span><span class="is-on">Plan</span><span>Regler</span><span>PVS</span></div>
                </div>
              </div>
              <div class="cc-flip__face cc-flip__face--back">
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
            </div>
          </div>
          <div class="cc-flip-labels" aria-hidden="true"><span class="is-text">Plan</span><span class="is-voice">Sprache</span></div>
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

  <section class="hp-sektion hp-sprachki" id="sprach-ki">
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
      <div class="hp-demo" aria-hidden="true">
        <div class="hp-sprache">
          <span class="hp-mic"><i></i><i></i><i></i><i></i><i></i></span>
          <p data-diktat></p>
        </div>
        <div class="hp-plan" data-plan>
          <div class="hp-plan-kopf"><b>HKP · Berger, Anna</b><span class="hp-pille">von Clara erstellt</span></div>
          <div class="hp-plan-zeile"><span>14–16</span><span>Brücke, vollverblendet</span></div>
          <div class="hp-plan-zeile"><span>26</span><span>Vollkeramikkrone</span></div>
          <div class="hp-plan-zeile"><span>BEMA · GOZ · BEL II</span><span>24 Positionen</span></div>
          <div class="hp-plan-summe"><span>Praxisumsatz</span><b data-demo-summe>0 €</b></div>
          <div class="hp-plan-balken"><i data-demo-balken></i></div>
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
          <div><small>PlanR kostet</small><b>${PLANR} €</b></div>
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
          <a class="hp-knopf hp-knopf-voll" href="#kontakt">Jetzt connecten</a>
          <a class="hp-knopf" href="#spielwiese">Erst mal mit den Reglern spielen</a>
        </div>
      </div>
      <div class="hp-connect-bild" aria-hidden="true">
        <div class="hp-connect-pvs">${PVS.slice(0, 4).map((p) => `<span>${p}</span>`).join('')}</div>
        <div class="hp-connect-linie"><i></i></div>
        <div class="hp-connect-planr"><span class="hp-logo">PR</span><b>PlanR</b></div>
        <div class="hp-connect-vergleich">
          <div><small>HKP wie im PVS</small><b>2.950 €</b></div>
          <div class="hp-connect-mehr"><small>Mit PlanR</small><b>4.380 €</b><em>+1.430 €</em></div>
        </div>
      </div>
    </div>
  </section>

  <section class="hp-sektion" id="funktionen">
    <div class="hp-sektion-kopf">
      <p class="hp-eyebrow">Was PlanR kann</p>
      <h2>Alles, wofür du bisher einen Abrechnungsdienst bezahlt hast.</h2>
    </div>
    <div class="hp-karten">
      <article><span class="hp-icon">🎙️</span><h3>Diktieren statt tippen</h3>
        <p>„Clara, HKP für Frau Berger: 14 bis 16 Brücke, 26 Krone.“ Befund, Regelversorgung, Festzuschüsse und Positionen stehen in Sekunden.</p></article>
      <article><span class="hp-icon">🎚️</span><h3>Regler für maximalen Umsatz</h3>
        <p>Zusatzleistungen, GOZ-Faktor, Eigenlabor und Privatanteil per Schieberegler – mit Begründungen und Mehrkostenvereinbarung.</p></article>
      <article><span class="hp-icon">🦷</span><h3>Alle Pläne deiner Praxis</h3>
        <p>Kassen-HKP, Privat-ZE, Implantologie, PAR, Kieferbruch und Schienen, KFO sowie Kons und Mehrkosten – ein Werkzeug für alles.</p></article>
      <article><span class="hp-icon">🏥</span><h3>Praxisindividuell</h3>
        <p>Deine Preislisten, dein Eigenlabor-Katalog, BEL II für jede KZV und tagesaktuelle Punktwerte. Dein Stil, nicht der vom Dienstleister.</p></article>
      <article><span class="hp-icon">🔁</span><h3>Zurück ins PVS</h3>
        <p>Pläne aus dem Praxisprogramm holen und fertig zurückgeben – über die PlanR-Bridge, ohne offenen Port am Praxisserver.</p></article>
      <article><span class="hp-icon">📱</span><h3>Freigabe am Handy</h3>
        <p>Plan per Link prüfen, Regler nachziehen, freigeben. Praxisgemeinschaften sehen jeweils nur ihre eigenen Pläne.</p></article>
    </div>
  </section>

  <section class="hp-sektion hp-vergleich">
    <div class="hp-vs">
      <div class="hp-vs-alt">
        <h3>Gestern: HKP outsourcen</h3>
        <ul><li>Bezahlung pro Plan</li><li>Tage warten, Rückfragen per Mail</li><li>Fremde Preislogik, verschenkter Umsatz</li><li>Patientendaten verlassen die Praxis</li></ul>
      </div>
      <div class="hp-vs-neu">
        <h3>Heute: PlanR</h3>
        <ul><li>Feste ${PLANR} € im Monat, so viele Pläne du willst</li><li>Fertig, während der Patient noch im Stuhl sitzt</li><li>Deine Regler, dein Umsatz</li><li>Hosting in Deutschland, DSGVO-konform</li></ul>
      </div>
    </div>
  </section>

  <section class="hp-sektion" id="preise">
    <div class="hp-sektion-kopf">
      <p class="hp-eyebrow">Preise</p>
      <h2>Ein Plan, der sich ab dem ersten HKP rechnet.</h2>
      <p>Alle Preise netto zzgl. USt., monatlich kündbar.</p>
    </div>
    <div class="hp-tiers">
      <article class="hp-tier">
        <h3>PlanR</h3>
        <p class="hp-preis"><b>${PLANR} €</b> / Monat</p>
        <ul><li>Alle Planer: ZE, Implantologie, PAR, KB, KFO, Kons</li><li>Umsatz-Regler und Begründungen</li><li>Eigene Preislisten und Eigenlabor</li><li>PVS-Anbindung über die PlanR-Bridge</li><li>Freigabe am Handy</li></ul>
        <a class="hp-knopf" href="#kontakt">PlanR buchen</a>
      </article>
      <article class="hp-tier hp-tier-top">
        <span class="hp-band-tag">Beliebt</span>
        <h3>PlanR + Sprach-KI</h3>
        <p class="hp-preis"><b>${PLANR + 49} €</b> / Monat</p>
        <ul><li>Alles aus PlanR</li><li>Clara als Sprach-App am Handy</li><li>Pläne per Sprache anlegen und ändern</li><li>Kopplung per QR-Code, ohne Installation am PC</li></ul>
        <a class="hp-knopf hp-knopf-voll" href="#kontakt">Mit Sprach-KI buchen</a>
      </article>
      <article class="hp-tier">
        <h3>Pickadoc MAS</h3>
        <p class="hp-preis"><b>PlanR inklusive</b></p>
        <ul><li>Volle Clara als Leitstelle deiner Praxis</li><li>Acht KI-Spezialistinnen: Telefon, Recall, Post, QM, Doku, Abrechnung</li><li>PlanR direkt in Sophie, ohne zweite Anmeldung</li></ul>
        <a class="hp-knopf" href="https://pickadoc.ai" target="_blank" rel="noopener">Auf pickadoc.ai ansehen</a>
      </article>
    </div>
  </section>

  <section class="hp-sektion hp-produkte" id="produkte">
    <div class="hp-sektion-kopf">
      <p class="hp-eyebrow">Ein Pickadoc-Produkt</p>
      <h2>Brauchst du mehr?</h2>
      <p>PlanR ist erst der Anfang. Für jede Aufgabe in deiner Praxis hat Pickadoc eine KI-Kollegin – einzeln oder im Paket CORE, Frontdesk und MAS.</p>
    </div>
    <div class="hp-karten hp-karten-produkte">
      <article><small>Online-Termine</small><h3>CalendR</h3><p>Die beste Alternative zu Doctolib für Zahnärzte: Online-Buchung, Praxiskalender und Erinnerungen.</p></article>
      <article><small>Aufklärung &amp; Unterschrift</small><h3>SignR</h3><p>Aufklärungs-KI und digitale Unterschriften – Bögen am Tablet erklären, unterschreiben, ablegen.</p></article>
      <article><small>KI-Videos</small><h3>ClonR</h3><p>Videos mit deinem Gesicht und deiner Stimme – für Aufklärung, Website und Social Media, ohne Drehtag.</p></article>
      <article><small>CallR · Telefon-KI eingehend</small><h3>Bianca</h3><p>Nimmt jeden Anruf an, vergibt Termine und beantwortet Fragen – rund um die Uhr.</p></article>
      <article><small>CallR · Telefon-KI ausgehend</small><h3>Lisa</h3><p>Ruft für dich heraus: Recall, Terminerinnerungen und Rückrufe.</p></article>
      <article><small>Post-KI</small><h3>Nadine</h3><p>Liest Briefe, E-Mails und Faxe, sortiert sie zu und bereitet Antworten vor.</p></article>
      <article><small>Abrechnungs-KI</small><h3>Sophie</h3><p>Prüft die Abrechnung und findet vergessene Leistungen. PlanR läuft direkt in Sophie.</p></article>
      <article><small>Ersthelferin am Handy</small><h3>Clara</h3><p>Deine Leitstelle per Sprache – sie kennt die Praxis und ruft die richtige Kollegin.</p></article>
      <article><small>QM-KI</small><h3>Julia</h3><p>Qualitätsmanagement, Hygiene und Begehungen – Dokumente immer aktuell.</p></article>
      <article><small>Arbeitszeit-KI</small><h3>Marie</h3><p>Erfasst Arbeitszeiten und behält Urlaub und Dienstplan im Blick.</p></article>
      <article><small>Sprechzimmer-KI</small><h3>Lena</h3><p>Hört bei der Behandlung mit und schreibt die Dokumentation für dich.</p></article>
      <article><small>Empfang</small><h3>Self-Check-in</h3><p>Patienten melden sich an der Stele selbst an – Karte stecken, Anamnese ausfüllen, fertig.</p></article>
    </div>
    <p class="hp-mitte"><a class="hp-knopf" href="https://pickadoc.ai" target="_blank" rel="noopener">Alle Produkte auf pickadoc.ai</a></p>
  </section>

  <section class="hp-sektion hp-kontakt" id="kontakt">
    <div class="hp-sektion-kopf">
      <h2>PlanR für deine Praxis</h2>
      <p>Die Online-Buchung startet in Kürze. Bis dahin richten wir PlanR persönlich ein – meist noch am selben Tag.</p>
    </div>
    <div class="hp-kontakt-wege">
      <a class="hp-knopf hp-knopf-voll" href="mailto:info@pickadoc.de?subject=PlanR%20buchen">E-Mail schreiben</a>
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
  if (ruhig) {
    diktat.textContent = DIKTAT
    plan.classList.add('sichtbar')
    summe.textContent = euro(ziel)
    balken.style.width = '100%'
    return
  }
  void (async () => {
    while (lauf === laeuft && document.body.contains(wurzel)) {
      diktat.textContent = ''
      plan.classList.remove('sichtbar')
      summe.textContent = '0 €'
      balken.style.width = '0%'
      await warten(500)
      for (const z of DIKTAT) {
        if (lauf !== laeuft) return
        diktat.textContent += z
        await warten(32)
      }
      await warten(400)
      plan.classList.add('sichtbar')
      const t0 = performance.now()
      await new Promise<void>((fertig) => {
        const schritt = (t: number) => {
          const p = Math.min(1, (t - t0) / 1600)
          const e = 1 - (1 - p) ** 3
          summe.textContent = euro(ziel * e)
          balken.style.width = `${e * 100}%`
          if (p < 1 && lauf === laeuft) requestAnimationFrame(schritt)
          else fertig()
        }
        requestAnimationFrame(schritt)
      })
      await warten(3600)
    }
  })()
}

/** Rückseite des Handys: Zuhören → Rechnen (ein Schritt leuchtet) → Sprechen, wie auf pickadoc.ai. */
function claraHandyStarten(wurzel: HTMLElement) {
  const lauf = laeuft
  const feld = (name: string) => wurzel.querySelector<HTMLElement>(`[data-clara="${name}"]`)!
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
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    takt = setInterval(() => {
      if (lauf !== laeuft || !document.body.contains(wurzel)) return clearInterval(takt)
      i = (i + 1) % CLARA_ZUSTAENDE.length
      zeigen(i)
    }, 3200)
  }
  for (const p of punkte) {
    p.addEventListener('click', () => {
      i = Number(p.dataset.i)
      zeigen(i)
      starten()
    })
  }
  zeigen(0)
  starten()
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
    feld('[data-roi]').textContent = monat > PLANR
      ? `PlanR hat sich ${Math.floor(monat / PLANR).toLocaleString('de-DE')}-fach bezahlt gemacht.`
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
  demoStarten(wurzel)
  claraHandyStarten(wurzel)
  spielwieseStarten(wurzel)
  const ziel = /^#[a-z-]+$/.test(location.hash) && location.hash !== '#top' ? wurzel.querySelector(location.hash) : null
  ziel?.scrollIntoView()
}

export function homepageVerlassen() {
  laeuft++
  document.body.classList.remove('hp-body')
}

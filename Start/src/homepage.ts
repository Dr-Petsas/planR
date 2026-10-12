import './homepage.css'

/** Öffentliche Startseite von PlanR für Besucher ohne Anmeldung. */

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
      <a href="#spielwiese">Regler</a>
      <a href="#funktionen">Funktionen</a>
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
      <p class="hp-lead">Per Sprach-KI: Deine KI-Assistenz erstellt alle Pläne deiner Praxis – inklusive Schieberegler für maximalen Umsatz.
        Praxisindividuell und vorbereitet für Dampsoft, Z1.PRO, DENSoffice und solutio.</p>
      <p class="hp-gestern"><s>HKP outsourcen für teuer Geld</s> war gestern.</p>
      <div class="hp-ctas">
        <a class="hp-knopf hp-knopf-voll" href="#spielwiese">Mit den Reglern spielen</a>
        <a class="hp-knopf" href="#preise">Ab 69 € im Monat</a>
      </div>
      <p class="hp-klein">Schon Kunde? <a href="#anmelden">Mit dem Pickadoc-Konto anmelden</a></p>
    </div>
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
  </section>

  <section class="hp-band" aria-label="Kompatible Praxisverwaltungssysteme">
    <div class="hp-band-label">100 % kompatibel</div>
    <div class="hp-band-fenster">
      <div class="hp-band-spur">
        ${[...PVS, ...PVS].map((p) => `<span>${p}</span>`).join('')}
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
      <h2>PlanR ist erst der Anfang.</h2>
      <p>Pickadoc macht Praxen selbststeuernd – Modul für Modul. PlanR läuft für sich allein und wächst mit, wenn du mehr willst.</p>
    </div>
    <div class="hp-karten hp-karten-produkte">
      <article><h3>CORE</h3><p>Kalender, Online-Buchung, digitale Aufklärung und Bewertungen – das Fundament.</p><small>ab 199 € / Monat</small></article>
      <article><h3>Frontdesk</h3><p>Bianca nimmt jeden Anruf an, Lisa ruft heraus. Optional mit Self-Check-in-Stele.</p><small>baut auf CORE auf</small></article>
      <article><h3>MAS</h3><p>Clara und ihr KI-Team übernehmen das Backoffice – gesteuert per Sprache. PlanR inklusive.</p><small>baut auf CORE und Frontdesk auf</small></article>
      <article><h3>API</h3><p>Pickadoc in eigene Software, PVS oder Praxisnetz einbinden – mit SLA und Sandbox.</p><small>für Systemhäuser</small></article>
    </div>
    <p class="hp-mitte"><a class="hp-knopf" href="https://pickadoc.ai" target="_blank" rel="noopener">Alle Produkte auf pickadoc.ai</a></p>
  </section>

  <section class="hp-sektion hp-kontakt" id="kontakt">
    <div class="hp-sektion-kopf">
      <h2>PlanR für deine Praxis</h2>
      <p>Die Online-Buchung startet in Kürze. Bis dahin richten wir PlanR persönlich ein – meist noch am selben Tag.</p>
    </div>
    <div class="hp-kontakt-wege">
      <a class="hp-knopf hp-knopf-voll" href="mailto:dr.petsas@pickadoc.de?subject=PlanR%20buchen">E-Mail schreiben</a>
      <a class="hp-knopf" href="tel:+4921130293029">0211 3029 3029</a>
      <a class="hp-knopf" href="https://wa.me/491776004600" target="_blank" rel="noopener">WhatsApp</a>
    </div>
  </section>

  <footer class="hp-fuss">
    <div><b>Pickadoc GmbH</b><br>Oststr. 34a, 40211 Düsseldorf</div>
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
  spielwieseStarten(wurzel)
  const ziel = /^#[a-z-]+$/.test(location.hash) && location.hash !== '#top' ? wurzel.querySelector(location.hash) : null
  ziel?.scrollIntoView()
}

export function homepageVerlassen() {
  laeuft++
  document.body.classList.remove('hp-body')
}

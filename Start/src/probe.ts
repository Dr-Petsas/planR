/**
 * Öffentliche Seite: HKP und Anlagen lesen, dann im echten HKP-Planer anzeigen.
 * Jede Datei geht zusätzlich in den Probe-Eingang. Ein Kassen-HKP wird als HKP gerechnet.
 * Ein Privatplan bleibt ein Privatplan: daraus wird keine Kassen-Regelversorgung.
 */
import './homepage.css'
import { logo, wortmarke } from './logo'
import { blattAusEinlesen, type BlattSummen, type EinleseAntwort, type EinleseSeite } from './einlesenZeilen'
import { blattAusZeilen, planartAusText, planartErkennen, privatSummenAusText, reglerFuer, textSchichtenAusPdf, zeilenAusPdf, zeilenAusText, type Planart, type ProbePosition, type ZahnSchema } from './hkpPdf'
import { gozPruefen, type Katalog } from './probeKatalog'
import { FAECHER, anlagenZuordnen, dazu, fachEntscheiden, fachErkennen, gruppenBauen, hat, zaehlt, type Blatt, type Einordnung, type Fach, type Gruppe, type Teil } from './probeFall'
import { werbungStarten, zielErreicht } from './werbung'

const LEER: Blatt = { schema: { B: {}, R: {}, TP: {} }, positionen: [] }

function summenVomPrivat(text: string): BlattSummen {
  const s = privatSummenAusText(text)
  const aus: BlattSummen = {}
  if (s.honorarGoz !== undefined) aus.honorarGoz = s.honorarGoz
  if (s.material !== undefined) aus.labor = s.material
  if (s.gesamt !== undefined) {
    aus.gesamt = s.gesamt
    aus.festzuschuss = 0
    aus.eigenanteil = s.gesamt
  }
  return aus
}

/** Die Planart kommt aus dem Blatt. Ein Privatplan gibt seine eigenen Summen mit und keine Kassenzeilen. */
function mitArt(plan: Blatt | null, text: string): Blatt | null {
  const gelesen = plan?.positionen?.length ? plan.positionen : blattAusZeilen(zeilenAusText(text)).positionen
  const er = planartErkennen(text, gelesen)
  if (!plan && !er.planart) return null
  const basis: Blatt = plan ?? { schema: { B: {}, R: {}, TP: {} }, positionen: gelesen }
  if (er.planer === 'privat') {
    return { ...basis, planart: er.planart as Planart, planer: 'privat', gozAnteil: false, summen: { ...basis.summen, ...summenVomPrivat(text) } }
  }
  if (er.planart === 'hkp') return { ...basis, planart: 'hkp', planer: 'hkp', gozAnteil: er.gozAnteil }
  return basis
}

function sicher(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function textAusSeiten(seiten: EinleseSeite[] | undefined) {
  const zeilen: string[] = []
  for (const seite of seiten ?? []) {
    const teile = [...seite.teile].filter((t) => t.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x)
    let y = -1
    let zeile: string[] = []
    for (const t of teile) {
      if (y >= 0 && Math.abs(t.y - y) > Math.max(8, (t.h || 12) * 0.7)) {
        zeilen.push(zeile.join(' '))
        zeile = []
      }
      zeile.push(t.text.trim())
      y = t.y
    }
    if (zeile.length) zeilen.push(zeile.join(' '))
  }
  return zeilen.join('\n')
}

/** Eine Datei zum Lesen: frisch hochgeladen oder aus einem Fall geholt (dann liegt sie schon im Eingang). */
interface Quelle { name: string; type: string; puff: ArrayBuffer; id?: string }

async function probeAblegen(datei: { name: string; type: string }, daten: ArrayBuffer) {
  try {
    const art = datei.type || (datei.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : datei.name.toLowerCase().endsWith('.txt') ? 'text/plain' : '')
    if (!art) return ''
    const r = await fetch('/api/probe/ablegen', {
      method: 'POST',
      headers: { 'Content-Type': art, 'X-Datei-Name': encodeURIComponent(datei.name) },
      body: daten,
    })
    const d = await r.json() as { id?: string; zugeordnet?: boolean }
    if (d.zugeordnet) imKonto = true
    return d.id ?? ''
  } catch {
    return ''
  }
}

/** Der Upload liegt schon im PlanR der angemeldeten Praxis. */
let imKonto = false

/** Schickt den gelesenen Text für den Praxisstempel; zurück kommt die E-Mail-Adresse daraus, falls eine draufsteht. */
function probeKontakt(id: string, text: string): Promise<string> {
  if (!id) return Promise.resolve('')
  return fetch(`/api/probe/ablegen/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.slice(0, 40_000) }),
  }).then((r) => r.json()).then((d: { email?: string }) => d.email ?? '', () => '')
}

function alsBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function jpegVon(flaeche: HTMLCanvasElement) {
  let q = 0.72
  let url = flaeche.toDataURL('image/jpeg', q)
  while (url.length > 1_400_000 && q > 0.45) {
    q = Math.round((q - 0.08) * 100) / 100
    url = flaeche.toDataURL('image/jpeg', q)
  }
  return url
}

/** PDF-Seiten als JPEG, höchstens drei. Das Modell sieht das Blatt, nicht nur den Text. */
async function fotosAusPdf(daten: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const aufgabe = pdfjs.getDocument({ data: new Uint8Array(daten) })
  const doc = await aufgabe.promise
  const urls: string[] = []
  for (let s = 1; s <= Math.min(doc.numPages, 3); s++) {
    const seite = await doc.getPage(s)
    const sicht = seite.getViewport({ scale: 1.5 })
    const flaeche = document.createElement('canvas')
    flaeche.width = Math.ceil(sicht.width)
    flaeche.height = Math.ceil(sicht.height)
    const stift = flaeche.getContext('2d')
    if (!stift) continue
    stift.fillStyle = '#fff'
    stift.fillRect(0, 0, flaeche.width, flaeche.height)
    await seite.render({ canvas: flaeche, canvasContext: stift, viewport: sicht }).promise
    urls.push(jpegVon(flaeche))
  }
  await aufgabe.destroy()
  return urls
}

/**
 * fallToken: Seite eines Falls unter seinem Link (#fall/<token>). Die Dateien liegen schon bei Pickadoc,
 * die Seite zeigt sie im Planer. Das gelesene Ergebnis liegt am Fall; fehlt es, wird hier gelesen.
 */
export function probeSeite(app: HTMLElement, fallToken = '') {
  const imRahmen = !!fallToken && new URLSearchParams(location.search).has('rahmen')
  document.body.classList.remove('sb-body')
  document.body.classList.add('hp-body')
  document.documentElement.classList.add('hp-html')
  document.title = 'PlanR – Ihren HKP im Planer'
  imKonto = false
  app.innerHTML = `
  <div class="hp${fallToken ? ' hp-fallseite' : ''}${imRahmen ? ' hp-im-rahmen' : ''}">
    <header class="hp-nav">
      <a class="hp-marke" href="/"><span class="hp-logo">${logo()}</span>${wortmarke()}<small>by Pickadoc</small></a>
      <nav>
        <a href="/#spielwiese">Kalkulator</a>
        <a href="/#preise">Preise</a>
        <a class="hp-nav-anmelden" href="#anmelden">Anmelden</a>
      </nav>
    </header>
    <section class="hp-hero hp-probe" id="top">
      <div class="hp-glow"></div>
      <div class="hp-hero-text">
        ${fallToken ? `<p class="hp-eyebrow">Ihr Plan bei PlanR</p>
        <h1 data-fall-titel>Ihr Plan im Planer.</h1>
        <p class="hp-lead">Unten steht Ihr Plan im echten PlanR-Planer, mit allen Reglern. Ihre hochgeladenen Dateien:</p>
        <ul class="hp-fall-originale" data-fall-originale></ul>` : `<p class="hp-eyebrow">Für Zahnärzte · am eigenen HKP</p>
        <h1>Legen Sie einen HKP hier ab. <span class="hp-verlauf">PlanR optimiert Ihren Umsatz.</span></h1>
        <p class="hp-lead">PlanR liest Befund, Regelversorgung, Therapieplanung, GOZ und Labor und setzt sie in den HKP-Planer. Dort stehen Teil 1, Teil 2, die Anlagen und die Regler.</p>`}
      </div>
      <form class="hp-probe-ablage">
        <p class="hp-probe-pflicht">Patientendaten unkenntlich machen, bevor Sie etwas hier ablegen: Name, Geburtsdatum, Adresse, Telefon und Versichertennummer dürfen auf dem Blatt nicht mehr lesbar sein.</p>
        <label class="hp-probe-haken"><input type="checkbox" data-frei> Ich habe die Patientendaten unkenntlich gemacht.</label>
        <label class="hp-probe-feld">
          <b>Dateien hochladen</b>
          <span>PDF, Foto oder Text. Mehrere Dateien auf einmal.</span>
          <input type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,.txt,text/plain" multiple data-dateien disabled>
        </label>
        <div class="hp-probe-komplett">
          <p>Bitte den kompletten HKP hochladen, inklusive:</p>
          <ul class="hp-probe-teile">
            <li>HKP (Kasse)</li>
            <li>GOZ-KVA</li>
            <li>Labor-KVA (Eigenbeleg)</li>
          </ul>
          <p class="hp-probe-bleibt">Der Plan bleibt bei Pickadoc, damit Dr. Petsas ihn mit Ihnen ansehen kann.</p>
        </div>
        <p class="hp-probe-status" data-status>Noch nichts gelesen.</p>
        <div class="hp-spin" data-spin hidden><i></i><span>Wird gelesen</span></div>
      </form>
    </section>
    <section class="hp-sektion hp-probe-plan" hidden data-ergebnis>
      <div class="hp-zugang" data-zugang hidden></div>
      <div class="hp-fall">
        <div class="hp-fall-reiter" role="tablist" data-reiter></div>
        <p class="hp-fall-hinweis" data-fall-hinweis></p>
        <details class="hp-fall-dateien" data-fall-dateien>
          <summary>Zuordnung der Dateien ändern</summary>
          <ul data-fall-liste></ul>
        </details>
      </div>
      <iframe class="hp-probe-rahmen" title="HKP-Planer" data-rahmen></iframe>
    </section>
  </div>`
  werbungStarten()
  const nav = app.querySelector('.hp-nav nav')
  void fetch('/api/probe/eingang', { cache: 'no-store' }).then((r) => {
    if (!r.ok || !nav || nav.querySelector('[data-eingang]')) return
    const link = document.createElement('a')
    link.href = '#probe-eingang'
    link.dataset.eingang = '1'
    link.textContent = 'Eingegangene Pläne'
    const anmelden = nav.querySelector('.hp-nav-anmelden')
    if (anmelden) nav.insertBefore(link, anmelden)
    else nav.append(link)
  }).catch(() => undefined)

  const wurzel = app.querySelector<HTMLElement>('.hp')!
  const status = wurzel.querySelector<HTMLElement>('[data-status]')!
  const spin = wurzel.querySelector<HTMLElement>('[data-spin]')!
  const warten = (an: boolean) => { spin.hidden = !an; if (an) status.textContent = '' }
  const ergebnis = wurzel.querySelector<HTMLElement>('[data-ergebnis]')!
  const rahmen = wurzel.querySelector<HTMLIFrameElement>('[data-rahmen]')!
  const reiterLeiste = wurzel.querySelector<HTMLElement>('[data-reiter]')!
  const fallHinweis = wurzel.querySelector<HTMLElement>('[data-fall-hinweis]')!
  const fallListe = wurzel.querySelector<HTMLElement>('[data-fall-liste]')!
  let blatt: Blatt = LEER
  let bereit = false
  let fall: Teil[] = []
  let gruppen: Gruppe[] = []
  let aktiv: Fach | '' = ''
  /** Reglerstellung je Plan, wie sie am Fall liegt. Ohne Eintrag gilt die Vorgabe der Planart. */
  let reglerStand: Partial<Record<Fach, number>> = {}
  let betreiber = false
  let merkTimer = 0
  /** Fall, an dem der Stand liegt: der Link, oder nach dem Upload der Fall im eigenen PlanR. */
  let merkToken = fallToken
  /** Stand am Fall ablegen: Zuordnung und Reglerstellung. Der letzte Stand gilt. */
  const fallMerken = () => {
    if (!merkToken || !fall.length) return
    window.clearTimeout(merkTimer)
    merkTimer = window.setTimeout(() => {
      void fetch(`/api/probe/fall/${merkToken}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stand: JSON.stringify({ teile: fall, regler: reglerStand }) }),
      }).catch(() => undefined)
    }, 400)
  }

  const schicken = () => {
    const gruppe = gruppen.find((g) => g.fach === aktiv)
    if (!bereit || !gruppe?.fuellt || !hat(blatt) || !rahmen.contentWindow) return
    rahmen.contentWindow.postMessage({
      type: 'planr-probe',
      schema: {
        ...blatt.schema,
        ...(blatt.planart ? { planart: blatt.planart, reglerStufe: reglerStand[gruppe.fach] ?? reglerFuer(blatt.planart, !!blatt.gozAnteil).stufe, gozAnteil: !!blatt.gozAnteil } : {}),
      },
      positionen: blatt.positionen,
      summen: blatt.summen ?? {},
    }, location.origin)
  }

  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin || ev.source !== rahmen.contentWindow) return
    const art = (ev.data as { type?: string } | null)?.type
    if (art !== 'planr-probe-bereit') return
    bereit = true
    schicken()
  })

  let standTimer = 0
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin || ev.source !== rahmen.contentWindow) return
    const daten = ev.data as { type?: string; stand?: { regler?: { privatStufe?: number; gozFaktor?: number }; nachher?: { gesamt?: number; eigenanteil?: number; festzuschuss?: number } } } | null
    if (!daten || daten.type !== 'planr-probe-stand' || !daten.stand) return
    const ziel = reglerFuer(blatt.planart ?? '', !!blatt.gozAnteil)
    const s = blatt.summen ?? {}
    // Die Reglerstellung bleibt am Fall: beim nächsten Öffnen steht der Plan wieder so da.
    const stufe = daten.stand.regler?.privatStufe
    if (merkToken && aktiv && typeof stufe === 'number' && reglerStand[aktiv] !== stufe) {
      reglerStand[aktiv] = stufe
      fallMerken()
    }
    const body = JSON.stringify({
      ergebnis: {
        planart: blatt.planart || 'hkp',
        planer: ziel.planer,
        regler: { privatStufe: daten.stand.regler?.privatStufe ?? ziel.stufe, titel: ziel.titel, gozFaktor: daten.stand.regler?.gozFaktor ?? 0 },
        vorher: { gesamt: s.gesamt, honorar: s.honorarGoz, material: s.labor },
        nachher: daten.stand.nachher ?? {},
      },
    })
    window.clearTimeout(standTimer)
    standTimer = window.setTimeout(() => {
      for (const id of blatt.dateien ?? []) {
        void fetch(`/api/probe/ablegen/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      }
    }, 500)
  })

  /** Ein Reiter je Plan. Darunter steht, was in diesem Plan liegt, und die Zuordnung je Datei. */
  const zeigen = (fach: Fach | '') => {
    gruppen = gruppenBauen(fall)
    const gruppe = gruppen.find((g) => g.fach === fach) ?? gruppen[0]
    if (!gruppe) return
    aktiv = gruppe.fach
    blatt = gruppe.blatt
    reiterLeiste.innerHTML = gruppen.map((g) =>
      `<button type="button" role="tab" aria-selected="${g.fach === aktiv}" class="${g.fach === aktiv ? 'an' : ''}" data-fach="${g.fach}">${sicher(g.reiter)}<small>${g.namen.length} ${g.namen.length === 1 ? 'Datei' : 'Dateien'}</small></button>`).join('')
    const zaehne = new Set([...Object.keys(blatt.schema.B), ...Object.keys(blatt.schema.R), ...Object.keys(blatt.schema.TP)]).size
    const ziel = reglerFuer(blatt.planart ?? '', !!blatt.gozAnteil)
    const stand = !gruppe.fuellt
      ? `${gruppe.titel}: Der Planer ist geöffnet, übernimmt die Datei aber noch nicht selbst. Die Datei liegt bei Pickadoc.`
      : blatt.planer === 'privat'
        ? `${gruppe.titel}. Er liegt im Privat-Planer, Regler auf ${ziel.titel}.`
        : blatt.gozAnteil
          ? `${zaehne} Zähne. Gesetzlicher HKP mit GOZ-Privatanteil, im HKP-Planer.`
          : `${zaehne} Zähne und ${blatt.positionen.length} Gebührenpositionen stehen im HKP-Planer.`
    fallHinweis.textContent = `${stand} Aus: ${gruppe.namen.join(', ')}.`
    fallListe.innerHTML = fall.map((t, i) =>
      `<li><span>${sicher(t.name)}</span><select data-teil="${i}" aria-label="Plan für ${sicher(t.name)}">${FAECHER.map((f) =>
        `<option value="${f.fach}"${f.fach === t.fach ? ' selected' : ''}>${sicher(f.titel)}</option>`).join('')}</select></li>`).join('')
    ergebnis.hidden = false
    rahmen.title = gruppe.titel
    if (rahmen.getAttribute('src') !== gruppe.adresse) {
      bereit = false
      rahmen.src = gruppe.adresse
    } else schicken()
  }

  reiterLeiste.addEventListener('click', (ev) => {
    const knopf = (ev.target as HTMLElement).closest<HTMLElement>('[data-fach]')
    if (knopf) zeigen(knopf.dataset.fach as Fach)
  })

  fallListe.addEventListener('change', (ev) => {
    const wahl = ev.target as HTMLSelectElement
    const teil = fall[Number(wahl.dataset.teil)]
    if (!teil) return
    teil.fach = wahl.value as Fach
    teil.anlage = false
    zeigen(teil.fach)
    fallMerken()
  })

  /**
   * Nach dem Lesen: Der Plan soll im eigenen PlanR liegen.
   * Angemeldet liegt er schon dort. Sonst legt PlanR auf die E-Mail-Adresse einen Zugang an und erzeugt das Passwort.
   */
  const abgelegteIds: string[] = []
  /** Nach dem Upload im eigenen Konto: Die Pläne werden ein Fall, damit Zuordnung und Regler gespeichert bleiben. */
  const fallSichern = async () => {
    if (fallToken || merkToken || !abgelegteIds.length) return
    const f = await fetch('/api/importe/fall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: abgelegteIds }) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; token?: string } | null
    if (!f?.ok || !f.token || merkToken) return
    merkToken = f.token
    fallMerken()
  }
  const zugangFeld = wurzel.querySelector<HTMLElement>('[data-zugang]')!
  let zugangFertig = false
  const zugangZeigen = (vorschlag: string) => {
    if (zugangFertig || !abgelegteIds.length) return
    zugangFeld.hidden = false
    if (imKonto) {
      zugangFertig = true
      zugangFeld.innerHTML = `<p><b>Der Plan liegt in Ihrem PlanR.</b> Sie finden ihn dort oben unter „Importe“, mit dem Original und dem Ergebnis.</p>
        <a class="hp-knopf hp-knopf-voll" href="/">Zurück zu PlanR</a>`
      return
    }
    if (zugangFeld.querySelector('form')) return
    zugangFeld.innerHTML = `<form data-zugang-form>
        <p><b>Ihr Plan ist gelesen.</b> ${fallToken ? 'Legen Sie einen Zugang an, dann liegt er in Ihrem PlanR.' : 'Mit E-Mail-Adresse und Passwort sehen Sie ihn im Planer, mit allen Reglern.'} Kostenlos, ohne Lastschrift. Der Plan liegt danach in Ihrem PlanR unter „Importe“, dort laden Sie auch weitere Pläne hoch.</p>
        <div class="hp-zugang-zeile">
          <input type="email" name="email" placeholder="E-Mail-Adresse der Praxis" autocomplete="email" required value="${sicher(vorschlag)}">
          <input type="password" name="passwort" placeholder="Passwort wählen (mind. 8 Zeichen)" autocomplete="new-password" minlength="8" required>
          <input type="text" name="firma2" tabindex="-1" autocomplete="off" class="hp-zugang-falle" aria-hidden="true">
          <button type="submit" class="hp-knopf hp-knopf-voll">${fallToken ? 'Zugang anlegen' : 'Plan im Planer ansehen'}</button>
        </div>
        <label class="hp-zugang-haken"><input type="checkbox" name="zustimmung" required> Ich stimme den <a href="https://pickadoc.ai/agb.html" target="_blank" rel="noopener">AGB</a>, den <a href="https://pickadoc.ai/datenschutz.html" target="_blank" rel="noopener">Datenschutzhinweisen</a> und der Auftragsverarbeitung zu.</label>
        <p class="hp-zugang-meldung" data-zugang-meldung></p>
      </form>`
    // Erst der Zugang, dann das Ergebnis. Über den Link des Betreibers bleibt das Ergebnis offen.
    if (!fallToken && !betreiber) ergebnis.classList.add('hp-vor-zugang')
    const form = zugangFeld.querySelector<HTMLFormElement>('form')!
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault()
      const knopf = form.querySelector('button')!
      const meldung = form.querySelector<HTMLElement>('[data-zugang-meldung]')!
      const wert = (name: string) => form.querySelector<HTMLInputElement>(`[name=${name}]`)!
      knopf.disabled = true
      meldung.textContent = 'Zugang wird angelegt …'
      try {
        const r = await fetch('/api/probe/zugang', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: wert('email').value.trim(), passwort: wert('passwort').value, ids: abgelegteIds, fall: fallToken || undefined, zustimmung: wert('zustimmung').checked, firma2: wert('firma2').value }),
        })
        const d = await r.json() as { ok?: boolean; meldung?: string; email?: string; angemeldet?: boolean; vorhanden?: boolean }
        if (d.ok && d.email) {
          zugangFertig = true
          ergebnis.classList.remove('hp-vor-zugang')
          void fallSichern()
          zugangFeld.innerHTML = `<p><b>${d.vorhanden ? 'Sie sind angemeldet.' : 'Ihr Zugang ist angelegt.'}</b> Login: ${sicher(d.email)}. ${d.vorhanden ? '' : 'Die Anmeldeadresse haben wir Ihnen auch per E-Mail geschickt. '}Der Plan steht unten im Planer und liegt in Ihrem PlanR unter „Importe“.</p>
            <a class="hp-knopf hp-knopf-voll" href="${d.angemeldet ? '/' : '/#anmelden'}">${d.angemeldet ? 'PlanR öffnen' : 'Jetzt anmelden'}</a>`
          return
        }
        meldung.innerHTML = d.vorhanden
          ? `${sicher(d.meldung ?? '')} <a href="#anmelden">Passwort vergessen?</a>`
          : sicher(d.meldung || 'Der Zugang ließ sich gerade nicht anlegen.')
      } catch {
        meldung.textContent = 'Keine Verbindung zu PlanR.'
      }
      knopf.disabled = false
    })
  }

  const dateiFeld = wurzel.querySelector<HTMLInputElement>('[data-dateien]')!
  wurzel.querySelector<HTMLInputElement>('[data-frei]')!.addEventListener('change', (ev) => {
    dateiFeld.disabled = !(ev.target as HTMLInputElement).checked
    status.textContent = dateiFeld.disabled ? 'Erst bestätigen, dass die Patientendaten unkenntlich sind.' : 'Dateien können jetzt abgelegt werden.'
  })

  const anLesen = async (body: { text?: string; bild?: string; bilder?: string[]; typ?: string }) => {
    const r = await fetch('/api/probe/lesen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return await r.json() as { ok?: boolean; message?: string; befund?: Record<string, string>; regel?: Record<string, string>; therapie?: Record<string, string>; positionen?: ProbePosition[]; text?: string }
  }

  /** Das eigene Modell sagt, welcher Plan die Datei ist. Antwortet es nicht, sortieren die festen Wörter. */
  const einordnen = async (name: string, text: string): Promise<Einordnung | null> => {
    if (!text.trim()) return null
    try {
      const r = await fetch('/api/probe/einordnen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, text: text.slice(0, 9000) }) })
      const d = await r.json() as { ok?: boolean; art?: string; kasse?: boolean; grund?: string }
      return d.ok && typeof d.art === 'string' ? { art: d.art, kasse: d.kasse === true, grund: d.grund } : null
    } catch {
      return null
    }
  }

  const ausAntwort = (d: { befund?: Record<string, string>; regel?: Record<string, string>; therapie?: Record<string, string>; positionen?: ProbePosition[]; text?: string }): Blatt | null => {
    const s: ZahnSchema = { B: {}, R: {}, TP: {} }
    dazu(s.B, d.befund)
    dazu(s.R, d.regel)
    dazu(s.TP, d.therapie)
    const positionen = (d.positionen ?? []).filter((p) => p && p.ebene && p.nr)
    if (!zaehlt(s) && !positionen.length && d.text) {
      const lokal = blattAusZeilen(zeilenAusText(d.text))
      if (hat(lokal)) return lokal
    }
    return zaehlt(s) || positionen.length ? { schema: s, positionen } : null
  }

  /** PDF oder Foto über den Einlese-Dienst. Kommt nichts Brauchbares, greift der bisherige Weg. */
  const ausEinlesen = async (datei: { name: string; type: string }, daten: ArrayBuffer, hinweise: string[]): Promise<{ blatt: Blatt | null; text: string }> => {
    const art = datei.type || (datei.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
    if (!art || daten.byteLength > 12_000_000) return { blatt: null, text: '' }
    try {
      const r = await fetch('/api/probe/einlesen', { method: 'POST', headers: { 'Content-Type': art }, body: daten })
      const d = await r.json() as { ok?: boolean; ergaenzung?: EinleseAntwort['ergaenzung'] }
      const text = textAusSeiten(d.ergaenzung?.seiten)
      if (!d.ok || !d.ergaenzung) return { blatt: null, text }
      const gelesen = blattAusEinlesen({ seiten: [], tabellen: [], ergaenzung: d.ergaenzung })
      const fund: Blatt = { schema: gelesen.schema, positionen: gelesen.positionen, summen: gelesen.summen }
      if (!hat(fund)) return { blatt: null, text }
      if (gelesen.pruefen.length) hinweise.push(`${datei.name}: Bitte gegenlesen, unsicher gelesen: ${gelesen.pruefen.join(', ')}.`)
      return { blatt: fund, text }
    } catch {
      return { blatt: null, text: '' }
    }
  }

  const ausText = async (name: string, text: string, hinweise: string[]) => {
    const lokal = blattAusZeilen(zeilenAusText(text))
    if (hat(lokal)) return lokal
    warten(true)
    const d = await anLesen({ text })
    const erkannt = d.ok ? ausAntwort(d) : null
    if (erkannt) return erkannt
    hinweise.push(`${name}: ${d.message || 'Darin wurde kein Plan erkannt.'}`)
    return null
  }

  const lesen = async (dateien: Quelle[]) => {
    warten(true)
    const teile: Teil[] = []
    const hinweise: string[] = []
    const gelesene: { name: string; id: string; text: string; plan: Blatt | null; urteil: Promise<Einordnung | null> }[] = []
    let stempelMail = ''
    let abgelegt = false
    for (const datei of dateien) {
      let id = ''
      let text = ''
      const fund: { plan: Blatt | null } = { plan: null }
      const hinein = (plan: Blatt | null) => { if (plan) fund.plan = plan }
      try {
        const art = datei.type
        const puff = datei.puff
        id = datei.id ?? await probeAblegen(datei, puff)
        if (id && !abgelegt && !datei.id) {
          abgelegt = true
          zielErreicht('probe')
        }
        if (art.startsWith('text') || datei.name.toLowerCase().endsWith('.txt')) {
          text = new TextDecoder().decode(puff)
          const plan = mitArt(await ausText(datei.name, text, hinweise), text)
          if (plan) hinein(plan)
        } else if (art.startsWith('image')) {
          warten(true)
          const gelesen = await ausEinlesen(datei, puff, hinweise)
          text = gelesen.text
          const bildPlan = mitArt(gelesen.blatt, text)
          if (bildPlan) hinein(bildPlan)
          else {
            const d = await anLesen({ bild: alsBase64(puff), typ: art || 'image/jpeg' })
            const erkannt = mitArt(d.ok ? ausAntwort(d) : null, text)
            if (erkannt) hinein(erkannt)
            else hinweise.push(`${datei.name}: ${d.message || 'nicht gelesen'}`)
          }
        } else {
          warten(true)
          const gelesen = await ausEinlesen(datei, puff.slice(0), hinweise)
          text = gelesen.text
          if (!gelesen.blatt) {
            const schichten = await textSchichtenAusPdf(puff.slice(0))
            if (!text) text = schichten.join('\n\n')
            const seiten = await fotosAusPdf(puff.slice(0))
            const d = await anLesen({
              text: schichten.join('\n\n').slice(0, 16000),
              bilder: seiten.map((seite) => seite.replace(/^data:[^;]+;base64,/, '')),
              typ: 'image/jpeg',
            })
            const erkannt = d.ok ? ausAntwort(d) : null
            const lokal = blattAusZeilen(await zeilenAusPdf(puff.slice(0)))
            const plan = mitArt(erkannt ?? (hat(lokal) ? lokal : null), text)
            if (plan) hinein(plan)
            else hinweise.push(`${datei.name}: ${d.message || 'Darin wurde kein Zahnschema erkannt.'}`)
          } else {
            if (!planartAusText(text)) {
              const schicht = (await textSchichtenAusPdf(puff.slice(0))).join('\n\n')
              if (planartAusText(schicht)) text = `${text}\n${schicht}`
            }
            const plan = mitArt(gelesen.blatt, text)
            if (plan) hinein(plan)
          }
        }
      } catch {
        hinweise.push(`${datei.name}: Das ließ sich nicht lesen.`)
      }
      // Das Modell ordnet die Datei ein, während die nächste schon gelesen wird.
      gelesene.push({ name: datei.name, id, text, plan: fund.plan, urteil: einordnen(datei.name, text) })
      if (!datei.id) stempelMail = (await probeKontakt(id, text)) || stempelMail
    }
    // Sortieren: jede Datei bekommt ihr Fach. Nur ZE-Blätter brauchen dafür einen gelesenen Plan.
    // Das Gebührenverzeichnis lädt erst hier, damit die Startseite klein bleibt.
    const katalog = gelesene.some((g) => g.plan?.positionen.some((p) => p.ebene === 'GOZ'))
      ? await import('../../ZE/HKP/src/data/goz-2012.json').then((m) => m.default as Katalog).catch(() => null)
      : null
    for (const g of gelesene) {
      const zeilen = g.plan?.positionen ?? []
      if (katalog) for (const hinweis of gozPruefen(zeilen, katalog)) hinweise.push(`${g.name}: ${hinweis}`)
      const erkennung = planartErkennen(g.text, zeilen)
      const wahl = fachEntscheiden(fachErkennen(g.name, g.text, erkennung, zeilen), erkennung, await g.urteil)
      const ohnePlan = wahl.fach !== 'ze' && wahl.fach !== 'privat-ze' && wahl.fach !== 'impl'
      if (!g.plan && !ohnePlan) continue
      teile.push({ ...(g.plan ?? { schema: { B: {}, R: {}, TP: {} }, positionen: [] }), name: g.name, ...wahl, dateien: g.id ? [g.id] : [] })
      if (!g.plan) for (let i = hinweise.length - 1; i >= 0; i--) if (hinweise[i].startsWith(`${g.name}:`)) hinweise.splice(i, 1)
    }
    anlagenZuordnen(teile)
    warten(false)
    fall = teile
    if (!fall.length) {
      status.textContent = hinweise.join(' ') || 'Darin wurde kein Plan erkannt.'
      ergebnis.hidden = true
      return
    }
    if (!fallToken) merkToken = ''
    zeigen('')
    fallMerken()
    for (const g of gelesene) if (g.id && !abgelegteIds.includes(g.id)) abgelegteIds.push(g.id)
    if (!fallToken) {
      zugangZeigen(stempelMail)
      if (imKonto || zugangFertig) void fallSichern()
    }
    const namen = gruppen.map((g) => g.reiter).join(', ')
    const stand = gruppen.length > 1
      ? `${fall.length} Dateien sortiert in ${gruppen.length} Pläne: ${namen}. Jeder Plan hat unten seinen Reiter.`
      : `Erkannt: ${gruppen[0].titel}.`
    status.textContent = [stand, ...hinweise].join(' ')
    if (!fallToken) ergebnis.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  dateiFeld.addEventListener('change', async (ev) => {
    const dateien = [...((ev.target as HTMLInputElement).files ?? [])]
    if (!dateien.length) return
    if (!wurzel.querySelector<HTMLInputElement>('[data-frei]')!.checked) {
      status.textContent = 'Bitte zuerst bestätigen, dass die Patientendaten unkenntlich sind.'
      return
    }
    const quellen: Quelle[] = []
    for (const d of dateien) quellen.push({ name: d.name, type: d.type, puff: await d.arrayBuffer() })
    await lesen(quellen)
  })

  if (fallToken) void (async () => {
    warten(true)
    try {
      const r = await fetch(`/api/probe/fall/${fallToken}`, { cache: 'no-store' })
      const d = await r.json() as { ok?: boolean; meldung?: string; name?: string; betreiber?: boolean; eigen?: boolean; dateien?: { id: string; name: string; art: string }[]; stand?: string | null }
      if (!d.ok || !d.dateien?.length) {
        warten(false)
        status.textContent = d.meldung || 'Unter diesem Link liegt kein Plan.'
        return
      }
      betreiber = d.betreiber === true
      if (d.eigen) imKonto = true
      if (d.name) wurzel.querySelector<HTMLElement>('[data-fall-titel]')!.textContent = `Plan für ${d.name}`
      wurzel.querySelector<HTMLElement>('[data-fall-originale]')!.innerHTML = d.dateien.map((x) =>
        `<li><a href="/api/probe/fall/${fallToken}/${x.id}" target="_blank" rel="noopener">${sicher(x.name)}</a></li>`).join('')
      for (const x of d.dateien) abgelegteIds.push(x.id)
      let gemerkt: { teile?: Teil[]; regler?: Partial<Record<Fach, number>> } | null = null
      try { gemerkt = d.stand ? JSON.parse(d.stand) as { teile?: Teil[] } : null } catch { gemerkt = null }
      if (gemerkt?.teile?.length) {
        fall = gemerkt.teile
        reglerStand = gemerkt.regler ?? {}
        warten(false)
        zeigen('')
        status.textContent = gruppen.length > 1
          ? `${gruppen.length} Pläne: ${gruppen.map((g) => g.reiter).join(', ')}. Jeder Plan hat unten seinen Reiter.`
          : `Erkannt: ${gruppen[0].titel}.`
      } else {
        const quellen: Quelle[] = []
        for (const x of d.dateien) {
          const antwort = await fetch(`/api/probe/fall/${fallToken}/${x.id}`)
          if (antwort.ok) quellen.push({ name: x.name, type: x.art, puff: await antwort.arrayBuffer(), id: x.id })
        }
        await lesen(quellen)
      }
      // Der Betreiber braucht kein Angebot für einen Zugang, der Zahnarzt schon.
      if (!betreiber && fall.length) zugangZeigen('')
    } catch {
      warten(false)
      status.textContent = 'Keine Verbindung zu PlanR.'
    }
  })()
}

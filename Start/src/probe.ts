/**
 * Öffentliche Seite: HKP und Anlagen lesen, dann im echten HKP-Planer anzeigen.
 * Nichts wird gespeichert. Der Planer rechnet Befund und Therapie selbst.
 */
import './homepage.css'
import { logo, wortmarke } from './logo'
import { blattAusEinlesen, type BlattPosition, type BlattSummen, type EinleseAntwort } from './einlesenZeilen'
import { blattAusZeilen, textSchichtenAusPdf, zeilenAusPdf, zeilenAusText, type ProbePosition, type ZahnSchema } from './hkpPdf'

type Zeile = ProbePosition | BlattPosition
interface Blatt { schema: ZahnSchema; positionen: Zeile[]; summen?: BlattSummen }
const LEER: Blatt = { schema: { B: {}, R: {}, TP: {} }, positionen: [] }

function zaehlt(schema: ZahnSchema) {
  return Object.keys(schema.B).length + Object.keys(schema.R).length + Object.keys(schema.TP).length
}

function dazu(ziel: Record<string, string>, quelle: Record<string, string> | undefined) {
  for (const [z, c] of Object.entries(quelle ?? {})) if (c && !ziel[z]) ziel[z] = c
}

function hat(blatt: Blatt) {
  return zaehlt(blatt.schema) > 0 || blatt.positionen.length > 0
}

function vereinen(teile: Blatt[]): Blatt {
  const schema: ZahnSchema = { B: {}, R: {}, TP: {} }
  const positionen: Zeile[] = []
  const da = new Map<string, Zeile & { text?: string }>()
  for (const teil of teile) {
    dazu(schema.B, teil.schema.B)
    dazu(schema.R, teil.schema.R)
    dazu(schema.TP, teil.schema.TP)
    for (const p of teil.positionen) {
      // Material hat keine Nummer: dort unterscheidet die Bezeichnung.
      const key = `${p.ebene}|${p.nr || (p as { text?: string }).text || ''}|${p.zahn}`
      const schon = da.get(key)
      if (schon) {
        // Dieselbe Zeile aus einer zweiten Datei: die Bezeichnung nachtragen, wenn sie der ersten fehlte.
        const text = (p as { text?: string }).text
        if (!schon.text && text) schon.text = text
        continue
      }
      const eigen = { ...p }
      da.set(key, eigen)
      positionen.push(eigen)
    }
  }
  const summen: BlattSummen = {}
  for (const teil of [...teile].reverse()) Object.assign(summen, teil.summen)
  return { schema, positionen, summen }
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

export function probeSeite(app: HTMLElement) {
  document.body.classList.add('hp-body')
  document.documentElement.classList.add('hp-html')
  document.title = 'PlanR – Ihren HKP im Planer'
  app.innerHTML = `
  <div class="hp">
    <header class="hp-nav">
      <a class="hp-marke" href="/"><span class="hp-logo">${logo()}</span>${wortmarke()}<small>by Pickadoc</small></a>
      <nav>
        <a href="/#spielwiese">Regler</a>
        <a href="/#preise">Preise</a>
        <a class="hp-nav-anmelden" href="#anmelden">Anmelden</a>
      </nav>
    </header>
    <section class="hp-hero hp-probe" id="top">
      <div class="hp-glow"></div>
      <div class="hp-hero-text">
        <p class="hp-eyebrow">Für Zahnärzte · am eigenen HKP</p>
        <h1>Legen Sie einen HKP hier ab. <span class="hp-verlauf">Danach maximieren Sie Ihren Umsatz.</span></h1>
        <p class="hp-lead">PlanR liest Befund, Regelversorgung, Therapieplanung, GOZ und Labor und setzt sie in den HKP-Planer. Dort stehen Teil 1, Teil 2, die Anlagen und die Regler.</p>
      </div>
      <form class="hp-probe-ablage">
        <p class="hp-probe-pflicht">Patientendaten unkenntlich machen, bevor Sie etwas hier ablegen: Name, Geburtsdatum, Adresse, Telefon und Versichertennummer dürfen auf dem Blatt nicht mehr lesbar sein.</p>
        <label class="hp-probe-haken"><input type="checkbox" data-frei> Ich habe die Patientendaten unkenntlich gemacht.</label>
        <label class="hp-probe-feld">
          <b>Dateien hochladen</b>
          <span>PDF, Foto oder Text. Mehrere Dateien auf einmal.</span>
          <input type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,.txt,text/plain" multiple data-dateien disabled>
        </label>
        <p class="hp-probe-status" data-status>Noch nichts gelesen.</p>
        <div class="hp-spin" data-spin hidden><i></i><span>Wird gelesen</span></div>
      </form>
    </section>
    <section class="hp-sektion hp-probe-plan" hidden data-ergebnis>
      <iframe class="hp-probe-rahmen" title="HKP-Planer" data-rahmen></iframe>
    </section>
  </div>`

  const wurzel = app.querySelector<HTMLElement>('.hp')!
  const status = wurzel.querySelector<HTMLElement>('[data-status]')!
  const spin = wurzel.querySelector<HTMLElement>('[data-spin]')!
  const warten = (an: boolean) => { spin.hidden = !an; if (an) status.textContent = '' }
  const ergebnis = wurzel.querySelector<HTMLElement>('[data-ergebnis]')!
  const rahmen = wurzel.querySelector<HTMLIFrameElement>('[data-rahmen]')!
  let blatt: Blatt = LEER
  let bereit = false

  const schicken = () => {
    if (!bereit || !hat(blatt) || !rahmen.contentWindow) return
    rahmen.contentWindow.postMessage({ type: 'planr-probe', schema: blatt.schema, positionen: blatt.positionen, summen: blatt.summen ?? {} }, location.origin)
  }

  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin || ev.source !== rahmen.contentWindow) return
    const art = (ev.data as { type?: string } | null)?.type
    if (art !== 'planr-probe-bereit') return
    bereit = true
    schicken()
  })

  const oeffnen = () => {
    ergebnis.hidden = false
    if (!rahmen.getAttribute('src')) rahmen.src = '/planer/hkp/?probe=1'
    else schicken()
    ergebnis.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  const ausEinlesen = async (datei: File, daten: ArrayBuffer, hinweise: string[]): Promise<Blatt | null> => {
    const art = datei.type || (datei.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
    if (!art || daten.byteLength > 12_000_000) return null
    try {
      const r = await fetch('/api/probe/einlesen', { method: 'POST', headers: { 'Content-Type': art }, body: daten })
      const d = await r.json() as { ok?: boolean; ergaenzung?: EinleseAntwort['ergaenzung'] }
      if (!d.ok || !d.ergaenzung) return null
      const gelesen = blattAusEinlesen({ seiten: [], tabellen: [], ergaenzung: d.ergaenzung })
      const fund: Blatt = { schema: gelesen.schema, positionen: gelesen.positionen, summen: gelesen.summen }
      if (!hat(fund)) return null
      if (gelesen.pruefen.length) hinweise.push(`${datei.name}: Bitte gegenlesen, unsicher gelesen: ${gelesen.pruefen.join(', ')}.`)
      return fund
    } catch {
      return null
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

  wurzel.querySelector<HTMLInputElement>('[data-dateien]')!.addEventListener('change', async (ev) => {
    const dateien = [...((ev.target as HTMLInputElement).files ?? [])]
    if (!dateien.length) return
    if (!wurzel.querySelector<HTMLInputElement>('[data-frei]')!.checked) {
      status.textContent = 'Bitte zuerst bestätigen, dass die Patientendaten unkenntlich sind.'
      return
    }
    warten(true)
    const teile: Blatt[] = []
    const hinweise: string[] = []
    for (const datei of dateien) {
      try {
        const art = datei.type
        if (art.startsWith('text') || datei.name.toLowerCase().endsWith('.txt')) {
          const plan = await ausText(datei.name, await datei.text(), hinweise)
          if (plan) teile.push(plan)
        } else if (art.startsWith('image')) {
          warten(true)
          const bild = await datei.arrayBuffer()
          const fund = await ausEinlesen(datei, bild, hinweise)
          if (fund) { teile.push(fund); continue }
          const d = await anLesen({ bild: alsBase64(bild), typ: art || 'image/jpeg' })
          const erkannt = d.ok ? ausAntwort(d) : null
          if (erkannt) teile.push(erkannt)
          else hinweise.push(`${datei.name}: ${d.message || 'nicht gelesen'}`)
        } else {
          const puff = await datei.arrayBuffer()
          warten(true)
          const fund = await ausEinlesen(datei, puff.slice(0), hinweise)
          if (fund) { teile.push(fund); continue }
          const schichten = await textSchichtenAusPdf(puff.slice(0))
          const seiten = await fotosAusPdf(puff.slice(0))
          const d = await anLesen({
            text: schichten.join('\n\n').slice(0, 16000),
            bilder: seiten.map((seite) => seite.replace(/^data:[^;]+;base64,/, '')),
            typ: 'image/jpeg',
          })
          const erkannt = d.ok ? ausAntwort(d) : null
          const lokal = blattAusZeilen(await zeilenAusPdf(puff.slice(0)))
          const plan = erkannt ?? (hat(lokal) ? lokal : null)
          if (plan) teile.push(plan)
          else hinweise.push(`${datei.name}: ${d.message || 'Darin wurde kein Zahnschema erkannt.'}`)
        }
      } catch {
        hinweise.push(`${datei.name}: Das ließ sich nicht lesen.`)
      }
    }
    warten(false)
    blatt = vereinen(teile)
    if (!hat(blatt)) {
      status.textContent = hinweise.join(' ') || 'Darin wurde kein Plan erkannt.'
      ergebnis.hidden = true
      return
    }
    const zaehne = new Set([...Object.keys(blatt.schema.B), ...Object.keys(blatt.schema.R), ...Object.keys(blatt.schema.TP)]).size
    const stand = `${zaehne} Zähne und ${blatt.positionen.length} Gebührenpositionen stehen im HKP-Planer.`
    status.textContent = hinweise.length ? `${stand} ${hinweise.join(' ')}` : stand
    oeffnen()
  })
}

/**
 * Prüfseite für das GOZ-Mapping der privaten Planer.
 * Haken = die Ziffer gehört zu dieser Behandlung. Entfernen nimmt sie heraus.
 * Hinzufügen zeigt das ganze Verzeichnis nach Behandlungsschritt, nicht nach Nummer.
 */
import { GOZ_KLASSEN, GOZ_KLASSEN_IDS, type GozKlasse } from './gozKlassen'
import { GOZ_SCHRITTE, GOZ_TEXT } from './gozSchritte'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

type Wahl = Record<string, string[]>

function ausStandard(): Wahl {
  return Object.fromEntries(GOZ_KLASSEN.map((k) => [k.id, [...k.standard]]))
}

export async function zuordnungOeffnen() {
  document.querySelector('.zu-schleier')?.remove()
  const schleier = document.createElement('div')
  schleier.className = 'zu-schleier'
  document.body.append(schleier)
  const zu = () => {
    schleier.remove()
    removeEventListener('keydown', taste)
    if (location.hash === '#zuordnung') history.replaceState(null, '', location.pathname + location.search)
  }
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu() }
  addEventListener('keydown', taste)
  schleier.addEventListener('click', (e) => { if (e.target === schleier) zu() })

  let wahl = ausStandard()
  let gespeichert = false
  try {
    const r = await fetch('/api/goz-zuordnung', { cache: 'no-store' })
    const d = await r.json() as { ok?: boolean; wahl?: Wahl }
    if (d.ok && d.wahl && Object.keys(d.wahl).length) {
      wahl = { ...ausStandard(), ...Object.fromEntries(Object.entries(d.wahl).filter(([id]) => GOZ_KLASSEN_IDS.has(id))) }
      gespeichert = true
    }
  } catch { /* Standards bleiben stehen */ }

  let aktiv = GOZ_KLASSEN[0].id
  let hinzufuegen = false
  const aus = new Set<string>()
  let meldung = gespeichert ? 'Gespeicherte Zuordnung.' : 'So setzen die Planer die Ziffern heute.'
  const marke = (id: string, nr: string) => `${id}|${nr}`

  const zeichnen = () => {
    const klasse = GOZ_KLASSEN.find((k) => k.id === aktiv) ?? GOZ_KLASSEN[0]
    const nrs = wahl[klasse.id] ?? []
    const planer = [...new Set(GOZ_KLASSEN.map((k) => k.planer))]
    schleier.innerHTML = `
      <div class="zu-karte" role="dialog" aria-modal="true" aria-labelledby="zu-titel">
        <header class="zu-kopf">
          <div>
            <h2 id="zu-titel">GOZ-Zuordnung prüfen</h2>
            <p>Jede Behandlung mit den Ziffern, die der Planer heute ansetzt. Haken lassen, was stimmt. Entfernen nimmt eine Ziffer heraus. Hinzufügen listet das Verzeichnis nach dem Behandlungsschritt.</p>
          </div>
          <button type="button" class="ein-zu" data-zu aria-label="Schließen">×</button>
        </header>
        <p class="zu-hinweis">Begründungen für einen Faktor über 2,3 schreibt PlanR an die Position. Beim Übertragen nach DS-Win landen GOZ-Ziffern im KVA-Reiter und die Laborpositionen im Eigenlabor, übernehmbar unter HKP-Leistung. Der Begründungstext geht dabei noch nicht mit in die Rechnung.</p>
        <div class="zu-koerper">
          <nav class="zu-liste">
            ${planer.map((p) => `
              <p class="zu-planer">${esc(p)}</p>
              ${GOZ_KLASSEN.filter((k) => k.planer === p).map((k) => `
                <button type="button" class="zu-klasse${k.id === klasse.id ? ' aktiv' : ''}" data-klasse="${esc(k.id)}">
                  <b>${esc(k.kuerzel)}</b><span>${esc(k.titel)}</span><small>${(wahl[k.id] ?? []).length}</small>
                </button>`).join('')}
            `).join('')}
          </nav>
          <section class="zu-detail">
            <h3>${esc(klasse.kuerzel)} · ${esc(klasse.titel)}</h3>
            <ul class="zu-positionen">
              ${nrs.length ? nrs.map((nr) => `
                <li>
                  <label><input type="checkbox" data-haken="${esc(nr)}"${aus.has(marke(klasse.id, nr)) ? '' : ' checked'}> <b>${esc(nr)}</b> ${esc(GOZ_TEXT.get(nr) || 'Ziffer ohne Katalogtext')}</label>
                  <button type="button" data-weg="${esc(nr)}">Entfernen</button>
                </li>`).join('') : '<li class="zu-leer">Noch keine GOZ-Ziffer für diese Behandlung.</li>'}
            </ul>
            <div class="zu-aktionen">
              <button type="button" class="neu-knopf" data-add>Position hinzufügen</button>
              <span>${esc(meldung)}</span>
            </div>
            ${hinzufuegen ? addPanel(nrs) : ''}
          </section>
        </div>
        <footer class="zu-fuss">
          <button type="button" class="link-knopf" data-standard>Auf den Engine-Stand zurück</button>
          <button type="button" class="neu-knopf" data-speichern>Zuordnung speichern</button>
        </footer>
      </div>`
    schleier.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', zu))
    schleier.querySelectorAll<HTMLButtonElement>('[data-klasse]').forEach((b) => b.addEventListener('click', () => {
      aktiv = b.dataset.klasse || aktiv
      hinzufuegen = false
      zeichnen()
    }))
    schleier.querySelectorAll<HTMLInputElement>('[data-haken]').forEach((b) => b.addEventListener('change', () => {
      const nr = b.dataset.haken || ''
      const key = marke(klasse.id, nr)
      if (b.checked) aus.delete(key)
      else aus.add(key)
      meldung = 'Noch nicht gespeichert.'
    }))
    schleier.querySelectorAll<HTMLButtonElement>('[data-weg]').forEach((b) => b.addEventListener('click', () => {
      const nr = b.dataset.weg || ''
      wahl[klasse.id] = (wahl[klasse.id] ?? []).filter((x) => x !== nr)
      aus.delete(marke(klasse.id, nr))
      meldung = 'Noch nicht gespeichert.'
      zeichnen()
    }))
    schleier.querySelector<HTMLButtonElement>('[data-add]')?.addEventListener('click', () => { hinzufuegen = !hinzufuegen; zeichnen() })
    schleier.querySelector<HTMLInputElement>('[data-suche]')?.addEventListener('input', (e) => {
      const nadel = (e.target as HTMLInputElement).value.trim().toLocaleLowerCase('de')
      schleier.querySelectorAll<HTMLElement>('[data-fund]').forEach((li) => {
        const hay = (li.dataset.fund || '').toLocaleLowerCase('de')
        li.hidden = !!nadel && !hay.includes(nadel)
      })
      schleier.querySelectorAll<HTMLDetailsElement>('.zu-add details').forEach((d) => {
        d.hidden = ![...d.querySelectorAll<HTMLElement>('[data-fund]')].some((li) => !li.hidden)
      })
    })
    bindAdd(klasse)
    schleier.querySelector('[data-standard]')?.addEventListener('click', () => {
      wahl = ausStandard()
      aus.clear()
      meldung = 'Engine-Stand wiederhergestellt, noch nicht gespeichert.'
      hinzufuegen = false
      zeichnen()
    })
    schleier.querySelector('[data-speichern]')?.addEventListener('click', () => void speichern())
  }

  const bindAdd = (klasse: GozKlasse) => {
    schleier.querySelectorAll<HTMLButtonElement>('[data-dazu]').forEach((b) => b.addEventListener('click', () => {
      const nr = b.dataset.dazu || ''
      const liste = wahl[klasse.id] ?? []
      if (nr && !liste.includes(nr)) wahl[klasse.id] = [...liste, nr]
      meldung = 'Noch nicht gespeichert.'
      zeichnen()
    }))
  }

  const addPanel = (schon: string[]) => `
      <div class="zu-add">
        <label>Im Verzeichnis suchen<input type="search" data-suche placeholder="Leistung oder Schritt"></label>
        ${GOZ_SCHRITTE.map((s) => `
          <details open>
            <summary>${esc(s.name)}</summary>
            <ul>
              ${s.eintraege.map((e) => `<li data-fund="${esc(`${s.name} ${e.nr} ${e.text}`)}"><b>${esc(e.nr)}</b> ${esc(e.text)}
                ${schon.includes(e.nr) ? '<span>ist schon dabei</span>' : `<button type="button" data-dazu="${esc(e.nr)}">Hinzufügen</button>`}
              </li>`).join('')}
            </ul>
          </details>`).join('')}
      </div>`

  const zumSpeichern = (): Wahl => Object.fromEntries(GOZ_KLASSEN.map((k) => [k.id, (wahl[k.id] ?? []).filter((nr) => !aus.has(marke(k.id, nr)))]))

  const speichern = async () => {
    const stand = zumSpeichern()
    meldung = 'Speichere …'
    zeichnen()
    try {
      const r = await fetch('/api/goz-zuordnung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wahl: stand }),
      })
      const d = await r.json() as { ok?: boolean; meldung?: string }
      if (d.ok) {
        wahl = stand
        aus.clear()
      }
      meldung = d.ok ? 'Gespeichert.' : (d.meldung || 'Das Speichern hat nicht geklappt.')
    } catch {
      meldung = 'Keine Verbindung.'
    }
    zeichnen()
  }

  zeichnen()
}

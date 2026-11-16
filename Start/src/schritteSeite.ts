/** Behandlungsschritte eines Plans als Liste: Vorbereitung, Hauptmaßnahmen, Kontrolle. */
import { apiJson } from './api'
import { popup } from './planVergleich'
import { ABSCHNITT_NAME, schritteAnzahl, type Abschnitt, type Schritt, type Schritte } from './schritte'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

function liste(schritte: Schritte): string {
  let nr = 0
  const block = (a: Abschnitt): string => {
    const s = schritte[a]
    let phase = ''
    const zeilen = s.map((x: Schritt) => {
      const kopf = x.phase && x.phase !== phase ? `<li class="bs-phase">${esc(x.phase)}</li>` : ''
      phase = x.phase ?? phase
      nr += 1
      return `${kopf}<li class="bs-schritt"><span class="bs-nr">${nr}</span><span class="bs-text">${esc(x.text)}${x.zahn ? ` <b>${esc(x.zahn)}</b>` : ''}</span><span class="bs-leistung">${esc(x.leistung)}</span></li>`
    }).join('')
    return `<section class="bs-abschnitt bs-${a}">
      <h3>${esc(ABSCHNITT_NAME[a])}<span>${s.length}</span></h3>
      ${s.length ? `<ol>${zeilen}</ol>` : '<p class="bs-leer">Im Plan steht dazu keine Leistung.</p>'}
    </section>`
  }
  return block('vor') + block('haupt') + block('kontrolle')
}

interface Antwort { ok?: boolean; geaendert?: string; schritte?: Schritte }

/** Öffnet die Liste und hält sie am Stand des Plans, solange sie offen ist. */
export function schritteOeffnen(modul: string, nummer: string, patient: string): void {
  const d = popup(`Behandlungsschritte${patient ? ` – ${patient}` : ''}`, '<div class="bs-liste"><p class="bs-leer">Wird geladen …</p></div>')
  d.classList.add('bs-popup')
  const ziel = d.querySelector<HTMLElement>('.bs-liste')
  let stand = ''
  const laden = async () => {
    if (!d.isConnected) return window.clearInterval(takt)
    try {
      const a = await apiJson<Antwort>(`/api/plaene?nur=schritte&modul=${encodeURIComponent(modul)}&nummer=${encodeURIComponent(nummer)}`)
      if (!ziel || !a?.schritte) return
      const neu = JSON.stringify(a.schritte)
      if (neu === stand) return
      stand = neu
      ziel.innerHTML = schritteAnzahl(a.schritte)
        ? `<p class="bs-hinweis">Aus den Leistungen des Plans abgeleitet. Ändert sich der Plan, ändert sich die Liste.</p>${liste(a.schritte)}`
        : '<p class="bs-leer">Aus diesem Plan lassen sich noch keine Schritte ableiten. Plan im Planer öffnen und speichern.</p>'
    } catch {
      if (ziel && !stand) ziel.innerHTML = '<p class="bs-leer">Die Schritte konnten nicht geladen werden.</p>'
    }
  }
  const takt = window.setInterval(() => void laden(), 4000)
  void laden()
}

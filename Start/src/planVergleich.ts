/**
 * Hochgeladener Plan neben dem, was PlanR daraus gerechnet hat.
 * Genutzt im Superuser-Eingang und in der Praxis unter „Importe“.
 */
import './superuser.css'

export interface VergleichStand {
  planart: string
  planer: string
  regler: { privatStufe: number; titel: string; gozFaktor: number }
  vorher: { gesamt?: number; honorar?: number; material?: number }
  nachher: { gesamt?: number; eigenanteil?: number; festzuschuss?: number; honorar?: number; material?: number }
}

export interface VergleichPlan {
  id: string
  zeit: string
  dateiname: string
  stand?: VergleichStand | null
}

export const euro = (n?: number | null) => typeof n === 'number'
  ? n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  : '—'

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function zeitText(iso: string) {
  const zeit = new Date(iso)
  if (Number.isNaN(zeit.getTime())) return iso
  return zeit.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })
}

function balken(vorher?: number, nachher?: number) {
  const max = Math.max(vorher ?? 0, nachher ?? 0, 1)
  const breite = (n?: number) => `${Math.max(2, Math.round(((n ?? 0) / max) * 100))}%`
  return `<div class="sb-balken">
    <p><span>Vorher</span><i style="width:${breite(vorher)}"></i><b>${euro(vorher)}</b></p>
    <p class="sb-nach"><span>Nachher</span><i style="width:${breite(nachher)}"></i><b>${euro(nachher)}</b></p>
  </div>`
}

function summeZeile(label: string, wert?: number) {
  return typeof wert === 'number' ? `<div><dt>${label}</dt><dd>${euro(wert)}</dd></div>` : ''
}

function regler(stand: VergleichStand) {
  const punkte = [0, 1, 2, 3, 4, 5].map((n) => `<span class="${n <= stand.regler.privatStufe ? 'an' : ''}"></span>`).join('')
  return `<div class="sb-regler"><b>Kasse → Privat · ${esc(stand.regler.titel || 'Stufe ' + stand.regler.privatStufe)}</b><div class="sb-punkte">${punkte}</div></div>`
}

/** quelle: Adresse des Originals ohne Kennung, z. B. /probe-eingang/ oder /api/importe/ */
export function planVergleich(plan: VergleichPlan, quelle: string) {
  const stand = plan.stand
  const gerechnet = stand
    ? `<h3>Unser Ergebnis · ${esc(stand.planer || 'PlanR')}</h3>${regler(stand)}${balken(stand.vorher.gesamt, stand.nachher.gesamt)}
       <dl class="sb-werte">
         ${summeZeile('Honorar', stand.nachher.honorar ?? (stand.nachher.gesamt === stand.vorher.gesamt ? stand.vorher.honorar : undefined))}
         ${summeZeile('Material', stand.nachher.material ?? (stand.nachher.gesamt === stand.vorher.gesamt ? stand.vorher.material : undefined))}
         ${summeZeile('Festzuschuss', stand.nachher.festzuschuss)}
         ${summeZeile('Eigenanteil', stand.nachher.eigenanteil)}
       </dl>`
    : '<h3>Unser Ergebnis</h3><p class="sb-fehl">Noch keine Rechnung. Der Plan wurde nicht bis zum Ergebnis geöffnet.</p>'
  return `<article class="sb-plan">
    <div class="sb-plan-kopf"><b>${esc(plan.dateiname || 'Plan')}</b><span>${esc(zeitText(plan.zeit))}</span>
      <a href="${quelle}${esc(plan.id)}" target="_blank" rel="noopener">Original öffnen</a></div>
    <div class="sb-vergleich">
      <div class="sb-blatt"><h3>Hochgeladen</h3><iframe title="Hochgeladener Plan" src="${quelle}${esc(plan.id)}"></iframe></div>
      <div class="sb-ergebnis">${gerechnet}</div>
    </div>
  </article>`
}

/** Popup über der Seite. Schließt mit ×, Klick daneben oder Esc. */
export function popup(titel: string, inhalt: string): HTMLElement {
  document.querySelector('.sb-popup')?.remove()
  const d = document.createElement('div')
  d.className = 'sb-popup'
  d.innerHTML = `<div class="sb-fenster" role="dialog" aria-modal="true" aria-label="${esc(titel)}">
    <header><h2>${esc(titel)}</h2><button type="button" class="sb-zu" aria-label="Schließen">×</button></header>
    <div class="sb-inhalt">${inhalt}</div>
  </div>`
  const zu = () => { d.remove(); document.removeEventListener('keydown', taste) }
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu() }
  d.addEventListener('click', (e) => { if (e.target === d) zu() })
  d.querySelector('.sb-zu')?.addEventListener('click', zu)
  document.addEventListener('keydown', taste)
  document.body.append(d)
  return d
}

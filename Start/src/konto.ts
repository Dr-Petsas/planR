/** Konto-Menü der Planliste: Avatar, Abo, persönliche Angaben. */

import type { Ich } from './anmeldung'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const TITEL = new Set(['dr', 'med', 'dent', 'prof', 'dipl', 'pd', 'phd', 'za', 'herr', 'frau', 'mr', 'mrs'])

/** Zwei Buchstaben aus Vor- und Nachname. Titel wie „Dr. med. dent.“ zählen nicht mit. */
export function initialen(name: string): string {
  const basis = name.includes('@') ? name.split('@')[0] : name
  const teile = basis.split(/[\s._+-]+/).map((t) => t.trim()).filter((t) => t.length > 1 && !TITEL.has(t.toLowerCase()))
  const a = teile[0]?.[0] ?? ''
  const b = teile.length > 1 ? teile[teile.length - 1][0] : teile[0]?.[1] ?? ''
  return (a + b).toUpperCase() || '?'
}

export function aboText(ich: Pick<Ich, 'abo' | 'clara'>): string {
  if (ich.abo === 'mas') return 'Pickadoc MAS · PlanR ist enthalten'
  if (ich.abo === 'planr' && ich.clara === 'planr') return 'PlanR mit Sprach-KI'
  if (ich.abo === 'planr') return 'PlanR'
  return 'Kein Abo hinterlegt'
}

function bild(name: string, foto: string, gross = false): string {
  const img = foto ? `<img src="${esc(foto)}" alt="" data-avatar>` : ''
  return `<span class="avatar${gross ? ' gross' : ''}">${img}${esc(initialen(name))}</span>`
}

export function kontoMenu(o: { name: string; email: string; admin: boolean; abo: string; foto: string; rechnungen: boolean }): string {
  const rolle = o.admin ? 'Praxis-Admin' : 'Benutzer'
  return `
    <div class="konto">
      <button type="button" class="avatar-knopf" data-konto aria-haspopup="menu" aria-expanded="false" aria-label="Konto von ${esc(o.name)}">${bild(o.name, o.foto)}</button>
      <div class="konto-menu" hidden role="menu">
        <div class="konto-kopf">
          ${bild(o.name, o.foto, true)}
          <div>
            <strong>${esc(o.name)}</strong>
            <small>${esc(o.email)}</small>
            <small>${rolle}</small>
          </div>
        </div>
        <button type="button" class="konto-zeile" data-persoenlich role="menuitem">Persönliche Einstellungen</button>
        <div class="konto-abo"><span>Abo</span><b>${esc(o.abo)}</b></div>
        ${o.rechnungen ? '<button type="button" class="konto-zeile" data-rechnungen role="menuitem">Rechnungen</button>' : ''}
        <button type="button" class="konto-zeile" data-einstellungen role="menuitem">Praxis-Einstellungen</button>
        <div class="konto-trenn"></div>
        <button type="button" class="konto-zeile gefahr" data-abmelden role="menuitem">Abmelden</button>
      </div>
    </div>`
}

export function persoenlichKarte(o: { name: string; email: string; admin: boolean; foto: string; eigen: boolean }): string {
  return `
    <div class="wahl mitte" role="dialog" aria-modal="true" aria-label="Persönliche Einstellungen">
      <button type="button" class="wahl-grund" data-persoenlich-zu aria-label="Schließen"></button>
      <div class="wahl-karte persoenlich">
        <div class="wahl-kopf">
          <h2>Persönliche Einstellungen</h2>
          <button type="button" data-persoenlich-zu aria-label="Schließen">✕</button>
        </div>
        <div class="persoenlich-kopf">
          ${bild(o.name, o.foto, true)}
          <div>
            <strong>${esc(o.name)}</strong>
            <small>${esc(o.email)}</small>
            <small>${o.admin ? 'Praxis-Admin' : 'Benutzer'}</small>
          </div>
        </div>
        <div class="persoenlich-foto">
          <label class="import-knopf">Foto hochladen<input type="file" data-foto accept="image/jpeg,image/png,image/webp" hidden></label>
          ${o.eigen ? '<button type="button" class="import-knopf" data-foto-weg>Eigenes Foto entfernen</button>' : ''}
        </div>
        <p class="pvs-info">Name und E-Mail kommen aus Ihrem Pickadoc-Konto. Ohne eigenes Foto zeigt PlanR das Porträt aus Pickadoc.</p>
      </div>
    </div>`
}

/** Quadratischer Ausschnitt, damit das Foto im Kreis scharf und klein bleibt. */
export function fotoZuschneiden(datei: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(datei)
    img.onload = () => {
      const s = 256
      const c = document.createElement('canvas')
      c.width = s
      c.height = s
      const ctx = c.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('bild')); return }
      const k = Math.max(s / img.width, s / img.height)
      const w = img.width * k
      const h = img.height * k
      ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h)
      c.toBlob((b) => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('bild')) }, 'image/jpeg', 0.86)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bild')) }
    img.src = url
  })
}

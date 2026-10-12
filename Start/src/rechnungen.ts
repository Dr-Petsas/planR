/**
 * Rechnungen für PlanR-Kunden ohne MAS: laufender Monat (Grundgebühr + Pläne) und alle bisherigen Rechnungen.
 * Gerechnet und abgelegt wird auf dem Server (rechnung.ts); Patientennamen kommen nur hier aus der Planliste dazu.
 */
import './einrichtung.css'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const euro = (c: number) => `${(c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const datum = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.')
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const monatsname = (m: string) => `${MONATE[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

interface Posten { text: string; menge: number; einzelCent: number; summeCent: number }
interface Plan { kuerzel: string; art: string; modul: string; nummer: string; erstmals: string }
interface Stand {
  ok?: boolean; aktiv?: boolean; meldung?: string; hinweise?: string[]; seit?: string
  laufend?: { monat: string; posten: Posten[]; plaene: Plan[]; nettoCent: number; ustCent: number; bruttoCent: number }
  rechnungen?: { nummer: string; monat: string; datum: string; einzug: string; bruttoCent: number; plaene: number }[]
}

export async function rechnungenOeffnen(o: { patient: (modul: string, nummer: string) => string }) {
  document.querySelector('.ein-schleier')?.remove()
  const schleier = document.createElement('div')
  schleier.className = 'ein-schleier'
  document.body.append(schleier)
  const zu = () => { schleier.remove(); removeEventListener('keydown', taste); if (location.hash === '#rechnungen') history.replaceState(null, '', location.pathname + location.search) }
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu() }
  addEventListener('keydown', taste)
  schleier.addEventListener('click', (e) => { if (e.target === schleier) zu() })

  const rahmen = (inhalt: string) => {
    schleier.innerHTML = `
      <div class="ein-karte re-karte" role="dialog" aria-modal="true" aria-labelledby="re-titel">
        <div class="ein-kopf">
          <div><h2 id="re-titel">Rechnungen</h2><p>Ihr PlanR-Abo: Grundgebühr und erstellte Pläne je Monat.</p></div>
          <button type="button" class="ein-zu" data-zu aria-label="Schließen">×</button>
        </div>
        <div class="ein-inhalt">${inhalt}</div>
        <div class="ein-fuss"><span></span><button type="button" class="link-knopf" data-zu>Schließen</button></div>
      </div>`
    schleier.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', zu))
  }
  rahmen('<p class="ein-text">Wird geladen …</p>')

  let s: Stand
  try {
    const r = await fetch('/api/rechnungen', { cache: 'no-store' })
    s = await r.json().catch(() => ({})) as Stand
  } catch { s = { meldung: 'Keine Verbindung.' } }
  if (!s.ok) return rahmen(`<p class="ein-text">${esc(s.meldung || 'Die Rechnungen sind gerade nicht erreichbar.')}</p>`)
  if (!s.aktiv || !s.laufend) return rahmen('<p class="ein-text">Ihre Praxis nutzt PlanR über Pickadoc MAS. Die Abrechnung läuft dort.</p>')

  const l = s.laufend
  const plaene = [...l.plaene].sort((a, b) => b.erstmals.localeCompare(a.erstmals))
  rahmen(`
    ${(s.hinweise ?? []).map((h) => `<p class="ein-hinweis">${esc(h)}</p>`).join('')}
    <h3>${esc(monatsname(l.monat))} <small class="re-klein">läuft – Stand ${esc(new Date().toLocaleDateString('de-DE'))}</small></h3>
    <table class="re-tabelle">
      <thead><tr><th>Leistung</th><th class="re-zahl">Menge</th><th class="re-zahl">Einzeln</th><th class="re-zahl">Summe</th></tr></thead>
      <tbody>${l.posten.map((p) => `<tr><td>${esc(p.text)}</td><td class="re-zahl">${p.menge}</td><td class="re-zahl">${euro(p.einzelCent)}</td><td class="re-zahl">${euro(p.summeCent)}</td></tr>`).join('')}</tbody>
      <tfoot>
        <tr><td colspan="3">Netto</td><td class="re-zahl">${euro(l.nettoCent)}</td></tr>
        <tr><td colspan="3">zzgl. 19 % USt.</td><td class="re-zahl">${euro(l.ustCent)}</td></tr>
        <tr class="re-summe"><td colspan="3">Voraussichtlich</td><td class="re-zahl">${euro(l.bruttoCent)}</td></tr>
      </tfoot>
    </table>
    ${plaene.length ? `
      <details class="re-plaene"><summary>${plaene.length} ${plaene.length === 1 ? 'Plan' : 'Pläne'} in diesem Monat</summary>
        <ul>${plaene.map((p) => `<li><span>${esc(datum(p.erstmals))}</span><span>${esc(p.kuerzel)} ${esc(p.art)}</span><span>${esc(o.patient(p.modul, p.nummer) || 'Ohne Namen')}</span></li>`).join('')}</ul>
      </details>` : '<p class="ein-klein">In diesem Monat wurde noch kein neuer Plan erstellt.</p>'}
    <p class="ein-klein">Gezählt wird jeder Plan einmal, im Monat seiner Erstellung. Pläne aus der Zeit vor Ihrem Abo${s.seit ? ` (seit ${esc(datum(s.seit))})` : ''} zählen nicht, verworfene HKP-Entwürfe auch nicht. Die Rechnung kommt Anfang des Folgemonats.</p>

    <h3 class="cl-abstand">Ihre Rechnungen</h3>
    ${s.rechnungen?.length ? `
      <table class="re-tabelle">
        <thead><tr><th>Nummer</th><th>Monat</th><th class="re-zahl">Pläne</th><th class="re-zahl">Betrag</th><th>Einzug</th><th></th></tr></thead>
        <tbody>${s.rechnungen.map((r) => `<tr><td>${esc(r.nummer)}</td><td>${esc(monatsname(r.monat))}</td><td class="re-zahl">${r.plaene}</td><td class="re-zahl">${euro(r.bruttoCent)}</td><td>${esc(datum(r.einzug))}</td>
          <td><a class="link-knopf" href="/api/rechnungen/${encodeURIComponent(r.nummer)}" target="_blank" rel="noopener">Öffnen / PDF</a></td></tr>`).join('')}</tbody>
      </table>` : '<p class="ein-text">Noch keine Rechnung. Die erste kommt Anfang des nächsten Monats.</p>'}
  `)
}

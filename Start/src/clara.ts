/**
 * HKP-Assistentin für PlanR-Kunden mit Sprach-KI (ohne MAS): Name vergeben, Handy per QR koppeln.
 * Der Name gilt für Begrüßung und Weckwort; MAS-Praxen pflegen ihn in Pickadoc.
 */
import './einrichtung.css'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export interface ClaraStand { ok?: boolean; zugang?: string; umbenennbar?: boolean; assistantName?: string; standardName?: string; error?: string; message?: string }
interface Kopplung { ok?: boolean; url?: string; qrDataUrl?: string; code?: string; expiresAtMs?: number; error?: string }

export const NAME_MUSTER = /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]{2,19}$/

export async function claraLaden(): Promise<ClaraStand | null> {
  try {
    const r = await fetch('/api/clara', { cache: 'no-store' })
    return r.ok ? await r.json() as ClaraStand : null
  } catch {
    return null
  }
}

export function claraOeffnen(o: { admin: boolean; stand: ClaraStand | null; geaendert: (name: string) => void }) {
  document.querySelector('.ein-schleier')?.remove()
  let name = o.stand?.assistantName || o.stand?.standardName || 'Clara'
  let kopplung: Kopplung | null = null
  let meldung = ''
  let laeuft = false

  const schleier = document.createElement('div')
  schleier.className = 'ein-schleier'
  document.body.append(schleier)
  const zu = () => { schleier.remove(); removeEventListener('keydown', taste) }
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu() }
  addEventListener('keydown', taste)
  schleier.addEventListener('click', (e) => { if (e.target === schleier) zu() })

  const zeichnen = () => {
    const bis = kopplung?.expiresAtMs ? new Date(kopplung.expiresAtMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''
    schleier.innerHTML = `
      <div class="ein-karte" role="dialog" aria-modal="true" aria-labelledby="cl-titel">
        <div class="ein-kopf">
          <div><h2 id="cl-titel">${esc(name)} – Ihre HKP-Assistentin</h2><p>Heil- und Kostenpläne per Sprache: Patient nennen, Befund sagen, ${esc(name)} rechnet.</p></div>
          <button type="button" class="ein-zu" data-zu aria-label="Schließen">×</button>
        </div>
        <div class="ein-inhalt">
          <h3>Name</h3>
          ${o.admin ? `
            <form class="cl-name" data-name>
              <input name="n" value="${esc(name)}" maxlength="20" autocomplete="off" aria-label="Name der Assistentin" required>
              <button type="submit" class="neu-knopf"${laeuft ? ' disabled' : ''}>Speichern</button>
            </form>
            <p class="ein-klein">Ein Wort, 3 bis 20 Buchstaben. Mit dem Namen sprechen Sie sie an („${esc(name)}, neuer HKP für …“). Gilt ab dem nächsten Gespräch.</p>`
          : `<p class="ein-text">Sie heißt <b>${esc(name)}</b>. Den Namen ändert der Praxis-Admin.</p>`}
          <h3 class="cl-abstand">Handy koppeln</h3>
          ${kopplung?.qrDataUrl ? `
            <div class="cl-qr">
              <img src="${esc(kopplung.qrDataUrl)}" alt="QR-Code zum Koppeln" width="200" height="200">
              <div>
                <ol class="ein-liste">
                  <li>QR-Code mit der Handy-Kamera scannen.</li>
                  <li>Mitteilungen erlauben und die Seite zum Home-Bildschirm hinzufügen.</li>
                  <li>App öffnen und „${esc(name)}“ antippen.</li>
                </ol>
                ${kopplung.code ? `<p class="ein-klein">Ohne Kamera: Code <code>${esc(kopplung.code)}</code> in der App eingeben.</p>` : ''}
                <p class="ein-klein">Gültig bis ${esc(bis)} Uhr, nur für ein Gerät.</p>
              </div>
            </div>`
          : `<p class="ein-text">Ihr Handy wird zum Mikrofon für ${esc(name)}. Der QR-Code gilt 30 Minuten und koppelt genau ein Gerät mit Ihrem Konto.</p>
            <button type="button" class="neu-knopf" data-koppeln${laeuft ? ' disabled' : ''}>QR-Code erzeugen</button>`}
          <p class="ein-hinweis cl-abstand">${esc(name)} kennt in PlanR Patientensuche und Heil- und Kostenpläne. Termine, Telefon, Post und alles Weitere gibt es mit <a href="https://pickadoc.ai" target="_blank" rel="noopener">Pickadoc MAS</a>.</p>
        </div>
        ${meldung ? `<p class="ein-meldung" role="status">${esc(meldung)}</p>` : ''}
        <div class="ein-fuss"><span></span><button type="button" class="link-knopf" data-zu>Schließen</button></div>
      </div>`
    schleier.querySelectorAll('[data-zu]').forEach((b) => b.addEventListener('click', zu))
    schleier.querySelector<HTMLFormElement>('[data-name]')?.addEventListener('submit', (e) => {
      e.preventDefault()
      void speichern(String(new FormData(e.target as HTMLFormElement).get('n') ?? '').trim())
    })
    schleier.querySelector('[data-koppeln]')?.addEventListener('click', () => void koppeln())
  }

  const speichern = async (neu: string) => {
    if (!NAME_MUSTER.test(neu)) { meldung = 'Bitte ein Wort mit 3 bis 20 Buchstaben (Bindestrich erlaubt).'; return zeichnen() }
    laeuft = true; meldung = ''; zeichnen()
    try {
      const r = await fetch('/api/clara', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assistantName: neu }) })
      const d = await r.json().catch(() => ({})) as { ok?: boolean; assistantName?: string; meldung?: string }
      if (d.ok && d.assistantName) { name = d.assistantName; o.geaendert(name); meldung = '' }
      else meldung = d.meldung || 'Der Name konnte nicht gespeichert werden.'
    } catch { meldung = 'Keine Verbindung.' }
    laeuft = false; zeichnen()
  }

  const koppeln = async () => {
    laeuft = true; meldung = ''; zeichnen()
    try {
      const r = await fetch('/api/clara/kopplung', { method: 'POST' })
      const d = await r.json().catch(() => ({})) as Kopplung & { meldung?: string }
      if (d.ok && d.qrDataUrl) kopplung = d
      else meldung = d.meldung || 'Der QR-Code konnte nicht erzeugt werden.'
    } catch { meldung = 'Keine Verbindung.' }
    laeuft = false; zeichnen()
  }

  zeichnen()
}

/**
 * Die Assistentin der Praxis in PlanR: Handy per QR koppeln, Name vergeben.
 * Es gibt eine je Praxis. Mit MAS ist es dieselbe wie in Pickadoc (Name wird dort gepflegt),
 * ohne MAS die HKP-Assistentin der Sprach-KI. Der Name gilt für Begrüßung und Weckwort.
 */
import './einrichtung.css'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export interface ClaraStand { ok?: boolean; stufe?: string; zugang?: string; umbenennbar?: boolean; assistantName?: string; standardName?: string; error?: string; message?: string }
interface Kopplung { ok?: boolean; url?: string; qrDataUrl?: string; code?: string; expiresAtMs?: number; error?: string }
/** PlanR meldet Fehler als meldung, MAS reicht message durch. */
type Fehlertext = { meldung?: string; message?: string }

/** Wortlaut je Stufe der Praxis: voll = dieselbe Assistentin wie in Pickadoc, sonst die HKP-Assistentin. */
export function claraTexte(name: string, voll: boolean) {
  return voll ? {
    knopf: 'Assistentin: Handy koppeln',
    titel: `${name} – Ihre Assistentin`,
    unter: `Dieselbe ${name} wie in Pickadoc. Für Pläne: Patient nennen, Befund sagen, ${name} rechnet.`,
    nameFest: 'Den Namen ändern Sie in Pickadoc.',
    hinweis: `${name} ist dieselbe Assistentin wie in Pickadoc und am Telefon.`,
    mas: false,
  } : {
    knopf: 'HKP-Assistentin: Name und Handy koppeln',
    titel: `${name} – Ihre HKP-Assistentin`,
    unter: `Heil- und Kostenpläne per Sprache: Patient nennen, Befund sagen, ${name} rechnet.`,
    nameFest: 'Den Namen ändert der Praxis-Admin.',
    hinweis: `${name} kennt in PlanR Patientensuche und Heil- und Kostenpläne. Termine, Telefon, Post und alles Weitere gibt es mit `,
    mas: true,
  }
}

export const NAME_MUSTER = /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß-]{2,19}$/

/** „EVA“ → „Eva“: in Großbuchstaben liest die Stimme den Namen sonst als Abkürzung vor. */
export const nameSchreibweise = (n: string) => n.split('-')
  .map((t) => (t.length > 1 && t === t.toUpperCase() ? t[0] + t.slice(1).toLowerCase() : t))
  .join('-')
  .replace(/^./, (c) => c.toUpperCase())

export async function claraLaden(): Promise<ClaraStand | null> {
  try {
    const r = await fetch('/api/clara', { cache: 'no-store' })
    return r.ok ? await r.json() as ClaraStand : null
  } catch {
    return null
  }
}

export function claraOeffnen(o: { admin: boolean; voll?: boolean; stand: ClaraStand | null; geaendert: (name: string) => void }) {
  document.querySelector('.ein-schleier')?.remove()
  let name = o.stand?.assistantName || o.stand?.standardName || 'Clara'
  let kopplung: Kopplung | null = null
  let meldung = ''
  let laeuft = false
  const voll = o.voll === true || o.stand?.stufe === 'voll'

  const schleier = document.createElement('div')
  schleier.className = 'ein-schleier'
  document.body.append(schleier)
  const zu = () => { schleier.remove(); removeEventListener('keydown', taste) }
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu() }
  addEventListener('keydown', taste)
  schleier.addEventListener('click', (e) => { if (e.target === schleier) zu() })

  const zeichnen = () => {
    const bis = kopplung?.expiresAtMs ? new Date(kopplung.expiresAtMs).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''
    const t = claraTexte(name, voll)
    schleier.innerHTML = `
      <div class="ein-karte" role="dialog" aria-modal="true" aria-labelledby="cl-titel">
        <div class="ein-kopf">
          <div><h2 id="cl-titel">${esc(t.titel)}</h2><p>${esc(t.unter)}</p></div>
          <button type="button" class="ein-zu" data-zu aria-label="Schließen">×</button>
        </div>
        <div class="ein-inhalt">
          <h3>Name</h3>
          ${o.admin && !voll ? `
            <form class="cl-name" data-name>
              <input name="n" value="${esc(name)}" maxlength="20" autocomplete="off" aria-label="Name der Assistentin" required>
              <button type="submit" class="neu-knopf"${laeuft ? ' disabled' : ''}>Speichern</button>
            </form>
            <p class="ein-klein">Ein Wort, 3 bis 20 Buchstaben. Mit dem Namen sprechen Sie sie an („${esc(name)}, neuer HKP für …“). Gilt ab dem nächsten Gespräch.</p>`
          : `<p class="ein-text">Sie heißt <b>${esc(name)}</b>. ${esc(t.nameFest)}</p>`}
          <h3 class="cl-abstand">Handy koppeln</h3>
          ${kopplung?.qrDataUrl ? `
            <div class="cl-qr">
              <img src="${esc(kopplung.qrDataUrl)}" alt="QR-Code zum Koppeln" width="200" height="200">
              <div>
                <ol class="ein-liste">
                  <li>QR-Code mit der Handy-Kamera scannen und die Seite öffnen.</li>
                  <li>Zum Home-Bildschirm hinzufügen: iPhone über Teilen ⬆ → „Zum Home-Bildschirm“, Android über das Menü ⋮ → „Zum Startbildschirm hinzufügen“.</li>
                  <li>Die neue App „${esc(name)}“ öffnen. Fragt sie nach einem Code, diesen eingeben${kopplung.code ? ':' : '.'}</li>
                </ol>
                ${kopplung.code ? `<div class="cl-code" aria-label="Kopplungscode">${esc(kopplung.code)}</div>` : ''}
                <p class="ein-klein">Gültig bis ${esc(bis)} Uhr, nur für ein Gerät. Danach in der App auf den Kreis tippen und lossprechen.</p>
              </div>
            </div>`
          : `<p class="ein-text">Ihr Handy wird zum Mikrofon für ${esc(name)}. Der QR-Code gilt 30 Minuten und koppelt genau ein Gerät mit Ihrem Konto.</p>
            <button type="button" class="neu-knopf" data-koppeln${laeuft ? ' disabled' : ''}>QR-Code erzeugen</button>`}
          <p class="ein-hinweis cl-abstand">${esc(t.hinweis)}${t.mas ? '<a href="https://pickadoc.ai" target="_blank" rel="noopener">Pickadoc MAS</a>.' : ''}</p>
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

  const speichern = async (eingabe: string) => {
    if (!NAME_MUSTER.test(eingabe)) { meldung = 'Bitte ein Wort mit 3 bis 20 Buchstaben (Bindestrich erlaubt).'; return zeichnen() }
    const neu = nameSchreibweise(eingabe)
    laeuft = true; meldung = ''; zeichnen()
    try {
      const r = await fetch('/api/clara', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assistantName: neu }) })
      const d = await r.json().catch(() => ({})) as { ok?: boolean; assistantName?: string } & Fehlertext
      if (d.ok && d.assistantName) { name = d.assistantName; o.geaendert(name); meldung = '' }
      else meldung = d.meldung || d.message || 'Der Name konnte nicht gespeichert werden.'
    } catch { meldung = 'Keine Verbindung.' }
    laeuft = false; zeichnen()
  }

  const koppeln = async () => {
    laeuft = true; meldung = ''; zeichnen()
    try {
      const r = await fetch('/api/clara/kopplung', { method: 'POST' })
      const d = await r.json().catch(() => ({})) as Kopplung & Fehlertext
      if (d.ok && d.qrDataUrl) kopplung = d
      else meldung = d.meldung || d.message || 'Der QR-Code konnte nicht erzeugt werden.'
    } catch { meldung = 'Keine Verbindung.' }
    laeuft = false; zeichnen()
  }

  zeichnen()
}

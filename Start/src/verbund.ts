import { apiJson } from './api'

/**
 * Praxis-Verbund in den Einstellungen (Praxis-Admin): zwei Pickadoc-Praxen teilen sich Pläne, HKPs, die Bridge
 * und die Sprach-App. Die Haupt-Praxis erzeugt einen Code, die andere gibt ihn ein; entkoppeln geht von beiden Seiten.
 */
interface Gast { clientId: string; name: string; seit: string; von: string }
interface Stand { gast: { haupt: string; name: string; seit: string; von: string } | null; gaeste: Gast[] }
interface Vorschau { von: string; praxen: string[]; eigenePlaene: number }

let stand: Stand | null = null
let code: { code: string; minuten: number } | null = null
let eingabe = ''
let vorschau: Vorschau | null = null
let laeuft = false

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const datum = (iso: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '')

export async function verbundLaden(): Promise<void> {
  const d = await apiJson<Stand>('/api/verbund')
  stand = d.ok ? { gast: d.gast, gaeste: d.gaeste ?? [] } : null
  code = null
  vorschau = null
  eingabe = ''
}

export function verbundBlock(): string {
  if (!stand) return ''
  const hinweis = '<p class="pvs-info">Gekoppelte Praxen arbeiten in PlanR gemeinsam: dieselben Pläne und HKPs, eine Bridge auf dem Praxisserver und eine Sprach-App fürs Handy. Abgerechnet wird jede Praxis weiter für sich.</p>'
  if (stand.gast) {
    const g = stand.gast
    return `<fieldset class="katalog"><legend>Praxis-Verbund</legend>
      <p class="pvs-info">Ihre Praxis ist gekoppelt mit <b>${esc(g.name || 'der Haupt-Praxis')}</b>${g.seit ? ` seit ${esc(datum(g.seit))}` : ''}${g.von ? ` (durch ${esc(g.von)})` : ''}.
        Sie sehen deren Pläne und HKPs und nutzen deren Bridge. Ihre eigenen früheren Pläne ruhen und sind nach dem Entkoppeln wieder da.</p>
      <div class="katalog-fuss"><small>Nach dem Entkoppeln arbeitet Ihre Praxis wieder mit eigener Ablage und eigener Bridge.</small>
        <button type="button" class="import-knopf" data-verbund-loesen${laeuft ? ' disabled' : ''}>Entkoppeln</button></div>
    </fieldset>`
  }
  const gaeste = stand.gaeste.map((g) => `<div class="katalog-fuss"><span><b>${esc(g.name || g.clientId)}</b><small> gekoppelt${g.seit ? ` seit ${esc(datum(g.seit))}` : ''}${g.von ? ` durch ${esc(g.von)}` : ''}</small></span>
      <button type="button" class="import-knopf" data-verbund-loesen="${esc(g.clientId)}"${laeuft ? ' disabled' : ''}>Entkoppeln</button></div>`).join('')
  const codeZeile = code
    ? `<p class="pvs-info">Kopplungscode: <b style="font-size:1.3em;letter-spacing:.08em">${esc(code.code)}</b> – ${code.minuten} Minuten gültig, nur einmal. Geben Sie ihn in der anderen Praxis unter Einstellungen → Praxis-Verbund ein.</p>`
    : ''
  const beitreten = stand.gaeste.length ? '' : vorschau
    ? `<p class="pvs-hinweis">Koppeln mit der Praxis von <b>${esc(vorschau.von)}</b>${vorschau.praxen.length ? ` (${esc(vorschau.praxen.join(', '))})` : ''}?
        Danach sehen Sie deren Pläne und HKPs und nutzen deren Bridge.${vorschau.eigenePlaene ? ` Ihre ${vorschau.eigenePlaene} eigenen Pläne ruhen solange und sind nach dem Entkoppeln wieder da.` : ''}</p>
      <div class="katalog-fuss"><button type="button" class="import-knopf" data-verbund-abbruch>Abbrechen</button>
        <button type="button" class="neu-knopf" data-verbund-koppeln${laeuft ? ' disabled' : ''}>Jetzt koppeln</button></div>`
    : `<div class="katalog-wahl">
        <label class="feld">Code der anderen Praxis<input type="text" data-verbund-code value="${esc(eingabe)}" placeholder="XXXXX-XXXXX" autocomplete="off" spellcheck="false"></label>
      </div>
      <div class="katalog-fuss"><small>Ihre Praxis nutzt dann Pläne, HKPs und Bridge der anderen.</small>
        <button type="button" class="import-knopf" data-verbund-pruefen${laeuft ? ' disabled' : ''}>Code prüfen</button></div>`
  return `<fieldset class="katalog"><legend>Praxis-Verbund</legend>
    ${hinweis}
    ${gaeste}
    ${codeZeile}
    <div class="katalog-fuss"><small>${stand.gaeste.length ? 'Weitere Praxis an Ihre koppeln:' : 'Andere Praxis an Ihre koppeln:'}</small>
      <button type="button" class="import-knopf" data-verbund-code-neu${laeuft ? ' disabled' : ''}>Kopplungscode erzeugen</button></div>
    ${beitreten ? `<p class="pvs-info"><b>Oder</b> Ihre Praxis an eine andere koppeln:</p>${beitreten}` : ''}
  </fieldset>`
}

/** Knöpfe im gezeichneten Block verdrahten; nach dem Koppeln/Entkoppeln lädt die Seite neu (andere Ablage). */
export function verbundVerdrahten(form: HTMLElement, neuZeichnen: () => void, melden: (text: string) => void) {
  const schritt = async (fn: () => Promise<void>) => {
    laeuft = true
    neuZeichnen()
    await fn()
    laeuft = false
    neuZeichnen()
  }
  form.querySelector<HTMLInputElement>('[data-verbund-code]')?.addEventListener('input', (ev) => { eingabe = (ev.target as HTMLInputElement).value })
  form.querySelector<HTMLButtonElement>('[data-verbund-code-neu]')?.addEventListener('click', () => void schritt(async () => {
    const d = await apiJson<{ code: string; minuten: number }>('/api/verbund/code', { method: 'POST' })
    if (d.ok) code = { code: d.code, minuten: d.minuten }
    else melden(d.meldung || 'Der Code ließ sich gerade nicht erzeugen.')
  }))
  const beitreten = (bestaetigt: boolean) => apiJson<{ vorschau?: Vorschau }>('/api/verbund/beitreten', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: eingabe, bestaetigt }),
  })
  form.querySelector<HTMLButtonElement>('[data-verbund-pruefen]')?.addEventListener('click', () => void schritt(async () => {
    const d = await beitreten(false)
    if (d.ok && d.vorschau) vorschau = d.vorschau
    else melden(d.meldung || 'Der Code ließ sich gerade nicht prüfen.')
  }))
  form.querySelector<HTMLButtonElement>('[data-verbund-abbruch]')?.addEventListener('click', () => { vorschau = null; neuZeichnen() })
  form.querySelector<HTMLButtonElement>('[data-verbund-koppeln]')?.addEventListener('click', () => void schritt(async () => {
    const d = await beitreten(true)
    if (!d.ok) {
      vorschau = null
      return melden(d.meldung || 'Koppeln hat nicht geklappt.')
    }
    melden('Gekoppelt. PlanR lädt neu …')
    location.reload()
  }))
  form.querySelectorAll<HTMLButtonElement>('[data-verbund-loesen]').forEach((b) => b.addEventListener('click', () => {
    const gast = b.dataset.verbundLoesen || ''
    const name = gast ? stand?.gaeste.find((g) => g.clientId === gast)?.name || 'diese Praxis' : stand?.gast?.name || 'die Haupt-Praxis'
    if (!confirm(`Kopplung mit ${name} lösen? Danach arbeiten beide Praxen wieder mit eigener Ablage, eigener Bridge und eigener Sprach-App-Zuordnung.`)) return
    void schritt(async () => {
      const d = await apiJson('/api/verbund', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gast ? { gast } : {}) })
      if (!d.ok) return melden(d.meldung || 'Entkoppeln hat nicht geklappt.')
      if (gast) {
        await verbundLaden()
        melden('Entkoppelt.')
      } else {
        melden('Entkoppelt. PlanR lädt neu …')
        location.reload()
      }
    })
  }))
}

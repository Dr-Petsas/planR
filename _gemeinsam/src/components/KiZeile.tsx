/**
 * KI-Zeile im Planer selbst. Im PlanR-Rahmen steht die Zeile in dessen Kopf und spricht den Plan von außen an;
 * ohne Rahmen (Planer direkt geöffnet, auch aus Pickadoc) zeigt der Planer sie hier und spricht mit sich selbst.
 * Beide Wege laufen über dieselbe Leitung, es gibt also immer genau eine Zeile.
 */
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { planArbeit, planKiZug } from '../arbeitClient'

type Zug = { wer: 'ich' | 'ki'; text: string }

const STIL = [
  'html.planr-kizeile body { padding-bottom: 84px; }',
  '.planr-kizeile-leiste { --kz: var(--akzent, #2f7f8f); --kz-dunkel: var(--akzent-dunkel, #266a78); --kz-hell: var(--akzent-hell, #e4f0f1); }',
  'html.thema-sophie .planr-kizeile-leiste { --kz: #2b6fd6; --kz-dunkel: #1c4f9e; --kz-hell: #e7f0fd; }',
  '.planr-kizeile-leiste input::placeholder { color: var(--kz-dunkel); opacity: .85; }',
  '.planr-kizeile-leiste input:focus { outline: 0; background: #fff !important; box-shadow: inset 0 0 0 2px var(--kz-dunkel), 0 0 0 4px var(--kz-hell) !important; }',
  '@media print { .planr-kizeile-leiste { display: none !important; } html.planr-kizeile body { padding-bottom: 0; } }',
].join('\n')

const leiste: CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 900,
  background: 'var(--kz-hell)', borderTop: '3px solid var(--kz)', boxShadow: '0 -8px 24px rgba(31,42,48,.16)',
  padding: '10px 12px', font: '15px/1.4 system-ui, sans-serif', color: '#1f2a30',
}
const innen: CSSProperties = { maxWidth: 1100, margin: '0 auto' }
const zeile: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' }
const feld: CSSProperties = {
  flex: '1 1 auto', minWidth: 0, height: 44, padding: '0 14px',
  border: 0, borderRadius: 12, font: 'inherit', fontWeight: 550, background: '#fff', color: 'inherit',
  boxShadow: 'inset 0 0 0 2px var(--kz)',
}
const knopf: CSSProperties = {
  flex: '0 0 auto', height: 44, padding: '0 18px', border: 0, borderRadius: 12,
  background: 'var(--kz)', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer',
}
const marke: CSSProperties = {
  flex: '0 0 auto', height: 44, minWidth: 44, padding: '0 10px', boxSizing: 'border-box', display: 'grid', placeItems: 'center',
  borderRadius: 12, background: 'var(--kz)', color: '#fff', fontWeight: 800, fontSize: 13, letterSpacing: '.06em',
}
const verlaufStil: CSSProperties = { maxHeight: '32vh', overflowY: 'auto', marginBottom: 8, display: 'grid', gap: 6 }
const blase = (ich: boolean): CSSProperties => ({
  justifySelf: ich ? 'end' : 'start', maxWidth: '92%', padding: '6px 10px', borderRadius: 10,
  background: ich ? 'var(--kz)' : '#fff', color: ich ? '#fff' : 'inherit', boxShadow: ich ? 'none' : 'inset 0 0 0 1px rgba(31,42,48,.10)', whiteSpace: 'pre-wrap',
})

/** Der Plan, an dem die Zeile arbeitet: Planart und Plannummer aus der Adresse. */
function planKey(): string {
  const art = location.pathname.match(/\/planer\/([^/]+)/)?.[1] ?? location.pathname
  const q = new URLSearchParams(location.search)
  return `${art}~${q.get('plan') || q.get('nummer') || 'neu'}`
}

export function KiZeile() {
  const [text, setText] = useState('')
  const [zuege, setZuege] = useState<Zug[]>([])
  const [laeuft, setLaeuft] = useState(false)
  const [offen, setOffen] = useState(true)
  const ende = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.classList.add('planr-kizeile')
    let stil = document.getElementById('planr-kizeile-stil')
    if (!stil) {
      stil = document.createElement('style')
      stil.id = 'planr-kizeile-stil'
      stil.textContent = STIL
      document.head.append(stil)
    }
    return () => document.documentElement.classList.remove('planr-kizeile')
  }, [])

  useEffect(() => { ende.current?.scrollIntoView({ block: 'end' }) }, [zuege, laeuft])

  async function senden(ev: FormEvent) {
    ev.preventDefault()
    const t = text.trim()
    if (!t || laeuft) return
    setText('')
    setOffen(true)
    setLaeuft(true)
    setZuege((z) => [...z, { wer: 'ich', text: t }])
    let antwort = ''
    try {
      const key = planKey()
      const ki = await planKiZug(window, t, key)
      if (ki) antwort = ki.text
      else antwort = (await planArbeit(window, t, key))?.text ?? ''
    } catch {
      antwort = 'Das hat nicht geklappt. Der Plan ist unverändert.'
    }
    setZuege((z) => [...z, { wer: 'ki', text: antwort || 'Dazu kann ich an diesem Plan nichts tun. Ich habe nichts geändert.' }].slice(-12))
    setLaeuft(false)
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="planr-kizeile-leiste" style={leiste}>
      <div style={innen}>
        {offen && (zuege.length > 0 || laeuft) ? (
          <div style={verlaufStil} aria-live="polite">
            {zuege.map((z, i) => <div key={i} style={blase(z.wer === 'ich')}>{z.text}</div>)}
            {laeuft ? <div style={blase(false)}>…</div> : null}
            <div ref={ende} />
          </div>
        ) : null}
        <form style={zeile} onSubmit={senden}>
          <span style={marke} aria-hidden="true">KI</span>
          <input
            style={feld} type="text" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="KI-Zeile: Frage oder Änderung an diesem Plan …" autoComplete="off" enterKeyHint="send" aria-label="KI-Zeile"
          />
          {zuege.length ? (
            <button type="button" style={{ ...knopf, background: '#fff', color: '#1f2a30', boxShadow: 'inset 0 0 0 1px var(--kz)', padding: '0 12px' }} onClick={() => setOffen((o) => !o)} title={offen ? 'Verlauf einklappen' : 'Verlauf zeigen'} aria-label={offen ? 'Verlauf einklappen' : 'Verlauf zeigen'}>{offen ? '▾' : '▴'}</button>
          ) : null}
          <button type="submit" style={{ ...knopf, opacity: laeuft ? 0.6 : 1 }} disabled={laeuft}>Senden</button>
        </form>
      </div>
    </div>,
    document.body,
  )
}

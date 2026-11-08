/** Logo-Link zurück zur Planübersicht. Daneben Zurück und Vor für die geöffneten Pläne. */
import { useEffect, useRef, type CSSProperties } from 'react'
import { arbeitStandard, planrLeiste, type PlanPunkt } from './arbeitFenster'
import { blaetterEinpassen } from './components/Handy'

function planNav(richtung: 'zurueck' | 'vor') {
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'planr-nav', richtung }, '*')
    return
  }
  if (richtung === 'zurueck') history.back()
  else history.forward()
}

const navKnopf: CSSProperties = {
  width: 32, height: 32, flex: '0 0 auto', padding: 0,
  border: '1px solid #d5dee2', borderRadius: 8, background: '#fff', color: '#1f2a30',
  font: 'inherit', fontSize: 18, lineHeight: 1, cursor: 'pointer',
}

/** Meldet die Planpunkte an die PlanR-Kopfzeile, solange der Plan eingebettet ist. */
export function PlanrLeiste({ punkte, aktiv, onWahl, versand = false }: {
  punkte: PlanPunkt[]
  aktiv: string
  onWahl: (id: string) => void
  versand?: boolean
}) {
  const wahl = useRef(onWahl)
  wahl.current = onWahl
  const stand = `${aktiv}\n${versand ? '1' : '0'}\n${punkte.map((p) => `${p.id}\t${p.text}`).join('\n')}`
  useEffect(() => planrLeiste(punkte, aktiv, (id) => wahl.current(id), versand), [stand])
  return null
}

export function PlanrZurueck() {
  useEffect(() => arbeitStandard(), [])
  useEffect(() => blaetterEinpassen(), [])
  const mandant = new URLSearchParams(window.location.search).get('mandant')
  const q = mandant ? `?mandant=${encodeURIComponent(mandant)}` : ''
  const href = window.location.pathname.startsWith('/planer/') ? `/${q}`
    : window.location.hostname.endsWith('.pickadoc-tunnel.com')
    ? `https://planr.pickadoc-tunnel.com/${q}`
    : `${window.location.protocol}//${window.location.hostname || '127.0.0.1'}:5189/${q}`
  const eingebettet = window.parent !== window
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
    <button type="button" style={navKnopf} title="Zurück" aria-label="Zurück" onClick={() => planNav('zurueck')}>‹</button>
    {eingebettet ? null : <a
      href={href}
      title="Zurück zu PlanR"
      aria-label="Zurück zu PlanR"
      style={{ display: 'block', width: 40, height: 40, flex: '0 0 auto' }}
    >
      <svg viewBox="0 0 612 612" width="40" height="40" aria-hidden="true" style={{ display: 'block' }}>
        <path fill="#0c3f3a" d="M576.3,612H35.7C16.1,612,0,595.9,0,576.3V35.7C0,16.1,16.1,0,35.7,0h540.6C595.9,0,612,16.1,612,35.7v540.6C612,595.9,595.9,612,576.3,612z" />
        <path fill="#fff" d="M536.1,569H78.9C63.5,569,51,556.5,51,541.1V173.9c0-15.3,12.5-27.9,27.9-27.9h457.2c15.3,0,27.9,12.5,27.9,27.9v367.3C563.9,556.5,551.4,569,536.1,569z" />
        <path fill="#0c3f3a" d="M291.8,249.8v233.7c0,6-4.9,10.9-10.9,10.9H213c-6,0-10.9-4.9-10.9-10.9V249.8c0-6,4.9-10.9,10.9-10.9h67.9C286.9,238.9,291.8,243.8,291.8,249.8z" />
        <path fill="#0c3f3a" d="M409.9,246.5v107.1c0,4.2-3.4,7.5-7.5,7.5h-74.6c-4.2,0-7.5-3.4-7.5-7.5V246.5c0-4.2,3.4-7.5,7.5-7.5h74.6C406.5,238.9,409.9,242.3,409.9,246.5z" />
        <path fill="#ff7aa8" d="M327.8,238.9H402.4C406.5,238.9,409.9,242.3,409.9,246.5V286H320.3V246.4C320.3,242.2,323.7,238.9,327.8,238.9Z" />
      </svg>
    </a>}
    <button type="button" style={navKnopf} title="Vor" aria-label="Vor" onClick={() => planNav('vor')}>›</button>
    </span>
  )
}

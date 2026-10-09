import { useEffect, useSyncExternalStore } from 'react'

/**
 * Rückgängig für Löschaktionen: jede Löschung legt ihren Gegenschritt ab. Die letzte zeigt eine
 * Meldung mit „Rückgängig“; Strg+Z (außerhalb von Eingabefeldern) nimmt die Löschungen der Reihe nach zurück.
 */
interface Schritt { id: number; text: string; zurueck: () => void }

const HOECHSTENS = 30
const SICHTBAR_MS = 12000

let stapel: Schritt[] = []
let sichtbar: Schritt | null = null
let zaehler = 0
let timer = 0
const abonnenten = new Set<() => void>()
const melden = () => abonnenten.forEach((f) => f())

function zeigen(s: Schritt | null) {
  sichtbar = s
  clearTimeout(timer)
  if (s) timer = window.setTimeout(() => { sichtbar = null; melden() }, SICHTBAR_MS)
  melden()
}

/** Löschung merken; `zurueck` stellt den gelöschten Stand wieder her. */
export function geloescht(text: string, zurueck: () => void) {
  const s = { id: ++zaehler, text, zurueck }
  stapel = [...stapel, s].slice(-HOECHSTENS)
  zeigen(s)
}

export function rueckgaengig(): boolean {
  const s = stapel[stapel.length - 1]
  if (!s) return false
  stapel = stapel.slice(0, -1)
  s.zurueck()
  zeigen(null)
  return true
}

/** Fügt einen gelöschten Eintrag an seiner alten Stelle wieder ein (nicht doppelt). */
export function wiederEinfuegen<T>(liste: T[], eintrag: T, index: number, gleich: (a: T, b: T) => boolean = (a, b) => a === b): T[] {
  if (liste.some((x) => gleich(x, eintrag))) return liste
  const i = Math.max(0, Math.min(index, liste.length))
  return [...liste.slice(0, i), eintrag, ...liste.slice(i)]
}

export function RueckgaengigLeiste() {
  const s = useSyncExternalStore((f) => { abonnenten.add(f); return () => { abonnenten.delete(f) } }, () => sichtbar)
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
      const ziel = e.target as HTMLElement | null
      if (ziel && (ziel.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ziel.tagName))) return
      if (rueckgaengig()) e.preventDefault()
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])
  if (!s) return null
  return (
    <div className="rueckgaengig-leiste" role="status">
      <span>{s.text}</span>
      <button onClick={rueckgaengig}>Rückgängig</button>
      <button className="zu" aria-label="Meldung schließen" onClick={() => zeigen(null)}>✕</button>
    </div>
  )
}

/** Tonne als Löschknopf – einheitlich in allen Tabellen */
export function Tonne({ titel, onClick }: { titel: string; onClick: () => void }) {
  return (
    <button type="button" className="tonne-btn" title={titel} aria-label={titel} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
      </svg>
    </button>
  )
}

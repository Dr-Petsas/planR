/** Handy-Ansicht (bis 840 px) wie im Kassen-HKP: Regler hinter einem Knopf, Planblätter als echte A4-Seite auf Bildschirmbreite verkleinert. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const HANDY = '(max-width: 840px)'
const BLATT_BREITE_PX = 793.7
const BLAETTER = '.kv-blatt, .ef2, .a4'

const istHandy = () => typeof window !== 'undefined' && window.matchMedia(HANDY).matches

let reglerOffen = false

/** Auf dem Handy zu, bis man „Regler“ tippt; am Desktop immer offen. Der Zustand überlebt den Reiterwechsel. */
export function ReglerKlappe({ children }: { children: ReactNode }) {
  const [handy, setHandy] = useState(istHandy)
  const [offen, setOffen] = useState(reglerOffen)
  useEffect(() => {
    const mq = window.matchMedia(HANDY)
    const wechsel = () => setHandy(mq.matches)
    mq.addEventListener('change', wechsel)
    return () => mq.removeEventListener('change', wechsel)
  }, [])
  const umschalten = () => setOffen((an) => (reglerOffen = !an))
  return (
    <>
      {handy && (
        <button type="button" className="regler-knopf" onClick={umschalten}>
          {offen ? 'Regler schließen' : 'Regler'}
        </button>
      )}
      {(!handy || offen) && children}
    </>
  )
}

/**
 * Einstellungen (Regler, Prüfmodul) stehen am breiten Bildschirm oben in der einen linken Spalte, zusammen mit der Eingabe und
 * unter einem Rollbalken wie im Kassen-HKP; der Plan steht groß daneben. Dafür wandert der Inhalt in die Eingabespalte.
 * Die Höhe der Kopfleiste geht als --kopf-h ans Layout; schmaler bleibt alles wie bisher unter der Kopfleiste.
 */
const BREIT = '(min-width: 1280px)'

export function Seitenleiste({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [ziel, setZiel] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const mq = window.matchMedia(BREIT)
    const halter = document.createElement('aside')
    halter.className = 'seitenleiste in-spalte'
    const setzen = () => {
      const editor = mq.matches ? ref.current?.parentElement?.parentElement?.querySelector<HTMLElement>('.arbeitsflaeche > .editor') : null
      if (!editor) { halter.remove(); setZiel(null); return }
      if (halter.parentElement !== editor) {
        const reiter = editor.querySelector<HTMLElement>(':scope > .reiter')
        if (reiter) reiter.after(halter)
        else editor.prepend(halter)
      }
      setZiel(halter)
    }
    setzen()
    mq.addEventListener('change', setzen)
    return () => { mq.removeEventListener('change', setzen); halter.remove() }
  }, [])
  useEffect(() => {
    const kopf = ref.current?.parentElement
    if (!kopf || typeof ResizeObserver === 'undefined') return
    const kopfleiste = kopf.querySelector<HTMLElement>(':scope > .kopfleiste') ?? kopf
    const setzen = () => document.documentElement.style.setProperty('--kopf-h', `${Math.round(kopfleiste.getBoundingClientRect().height)}px`)
    const beobachter = new ResizeObserver(setzen)
    beobachter.observe(kopfleiste)
    setzen()
    return () => beobachter.disconnect()
  }, [])
  return <aside ref={ref} className="seitenleiste" hidden={!!ziel}>{ziel ? createPortal(children, ziel) : children}</aside>
}

function einpassen() {
  const handy = istHandy()
  const eltern = new Set<HTMLElement>()
  document.querySelectorAll<HTMLElement>(BLAETTER).forEach((blatt) => {
    if (blatt.parentElement) eltern.add(blatt.parentElement)
  })
  eltern.forEach((el) => {
    if (!handy) {
      el.style.removeProperty('--handy-zoom')
      return
    }
    const stil = getComputedStyle(el)
    const innen = Math.min(el.clientWidth, document.documentElement.clientWidth)
      - parseFloat(stil.paddingLeft) - parseFloat(stil.paddingRight)
    const zoom = Math.min(1, Math.max(0.32, innen / BLATT_BREITE_PX)).toFixed(3)
    if (el.style.getPropertyValue('--handy-zoom') !== zoom) el.style.setProperty('--handy-zoom', zoom)
  })
}

/** Hält die Zoomstufe der Blätter passend – auch wenn ein Reiterwechsel neue Blätter einblendet. */
export function blaetterEinpassen() {
  let geplant = 0
  const planen = () => {
    if (!geplant) geplant = requestAnimationFrame(() => { geplant = 0; einpassen() })
  }
  const mq = window.matchMedia(HANDY)
  const beobachter = new MutationObserver(planen)
  beobachter.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', planen)
  mq.addEventListener('change', planen)
  planen()
  return () => {
    beobachter.disconnect()
    window.removeEventListener('resize', planen)
    mq.removeEventListener('change', planen)
    cancelAnimationFrame(geplant)
  }
}

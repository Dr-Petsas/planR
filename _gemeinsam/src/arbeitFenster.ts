/**
 * Eine Leitung vom Planfenster zur KI-Zeile. Der Plan antwortet, die Zeile schreibt nicht selbst.
 * Der zuletzt angemeldete Dienst gewinnt; ohne Anmeldung gilt die Regel-Antwort ohne Schreiben.
 */
import { arbeitVerstehen, type ArbeitErgebnis, type ArbeitStand } from './arbeitDialog'

export const ARBEIT = 'planr-arbeit'

export type ArbeitAntwort = { art: 'fremd' | 'antwort' | 'vorschlag' | 'erledigt' | 'hinweis'; text: string; vorschlag?: string }

export type Anfrage =
  | { aktion: 'vorschlag'; text: string }
  | { aktion: 'anwenden'; id: string }
  | { aktion: 'verwerfen'; id: string }

type Dienst = (anfrage: Anfrage) => ArbeitAntwort

const LEER: ArbeitStand = {
  implantZaehne: [], systemName: '', goz9050: [], gesperrt9050: [], kannSystem: false, kann9050: false,
}

const PLANNAME: Record<string, string> = {
  hkp: 'diesem HKP',
  'privat-hkp': 'diesem privaten Zahnersatz',
  implantologie: 'dieser Implantatplanung',
  mkv: 'dieser Mehrkostenvereinbarung',
  kons: 'diesem Kostenvoranschlag Kons',
  par: 'dieser PAR-Strecke',
  'privat-par': 'dieser privaten PAR',
  kb: 'diesem Kieferbruchplan',
  'privat-kb': 'diesem privaten Kieferbruchplan',
  kfo: 'diesem KFO-Plan',
  'privat-kfo': 'diesem privaten KFO-Plan',
}

function planName(): string {
  const m = typeof location === 'undefined' ? '' : location.pathname.match(/\/planer\/([^/]+)/)?.[1] ?? ''
  return PLANNAME[m] ?? 'diesem Plan'
}

const gemerkt = new Map<string, { text: string }>()

const standardDienst: Dienst = (anfrage) => {
  if (anfrage.aktion === 'verwerfen') {
    gemerkt.delete(anfrage.id)
    return { art: 'hinweis', text: 'Alles klar, ich lasse den Plan so.' }
  }
  if (anfrage.aktion === 'anwenden') {
    const offen = gemerkt.get(anfrage.id)
    gemerkt.delete(anfrage.id)
    if (!offen) return { art: 'hinweis', text: 'Ich habe keine offene Anpassung mehr. Bitte sagen Sie sie noch einmal.' }
    return { art: 'hinweis', text: 'Das kann ich an diesem Plan nicht schreiben. Ich habe nichts geändert.' }
  }
  const stand: ArbeitStand = {
    ...LEER,
    leistungen: `An ${planName()} beantworte ich die Regel zu GOZ 9050. Andere Funktionen schreibe ich von hier noch nicht, und nichts ohne Ihre Bestätigung.`,
  }
  const r = arbeitVerstehen(anfrage.text, stand)
  return merken(r)
}

function merken(r: ArbeitErgebnis): ArbeitAntwort {
  if (r.art === 'fremd') return { art: 'fremd', text: '' }
  if (r.art === 'antwort') return r
  const id = `v${Math.random().toString(36).slice(2, 10)}`
  gemerkt.set(id, { text: r.text })
  return { art: 'vorschlag', text: r.text, vorschlag: id }
}

let custom: Dienst | null = null
let lauscht = false

export type PlanPunkt = { id: string; text: string }

type Leiste = { punkte: PlanPunkt[]; aktiv: string; versand: boolean; wahl: (id: string) => void }
let leiste: Leiste | null = null

/** Die Punkte der Planseite stehen in der PlanR-Kopfzeile. `versand` schaltet das Mail-Icon. */
export function planrLeiste(punkte: PlanPunkt[], aktiv: string, wahl: (id: string) => void, versand = false): () => void {
  leiste = { punkte, aktiv, versand, wahl }
  if (typeof window !== 'undefined' && window.parent !== window) {
    window.parent.postMessage({ type: 'planr-leiste', punkte, aktiv, versand }, '*')
  }
  return () => { if (leiste?.wahl === wahl) leiste = null }
}

function empfangen(ev: MessageEvent) {
  if (ev.source !== window.parent) return
  const d = ev.data as { type?: string; id?: string; aktion?: string; text?: string; vorschlag?: string } | null
  if (!d) return
  if (d.type === 'planr-reiter' && leiste && typeof d.id === 'string') {
    leiste.wahl(d.id)
    return
  }
  if (d.type === 'planr-versand') {
    window.dispatchEvent(new Event('planr-versand'))
    return
  }
  if (d.type !== ARBEIT || typeof d.id !== 'string') return
  const anfrage: Anfrage | null = d.aktion === 'vorschlag' && typeof d.text === 'string'
    ? { aktion: 'vorschlag', text: d.text }
    : (d.aktion === 'anwenden' || d.aktion === 'verwerfen')
      ? { aktion: d.aktion, id: typeof d.vorschlag === 'string' ? d.vorschlag : '' }
      : null
  if (!anfrage) return
  const antwort = (custom ?? standardDienst)(anfrage)
  window.parent.postMessage({ type: ARBEIT, id: d.id, art: antwort.art, text: antwort.text, vorschlag: antwort.vorschlag ?? '' }, ev.origin || '*')
}

function sicher() {
  if (lauscht || typeof window === 'undefined') return
  window.addEventListener('message', empfangen)
  if (window.parent !== window) {
    document.documentElement.classList.add('planr-eingebettet')
    if (!document.getElementById('planr-eingebettet')) {
      const stil = document.createElement('style')
      stil.id = 'planr-eingebettet'
      stil.textContent = [
        'html.planr-eingebettet .kopfleiste,',
        'html.planr-eingebettet header.kopf,',
        'html.planr-eingebettet .reiter,',
        'html.planr-eingebettet nav.reiter,',
        'html.planr-eingebettet .drucken { display: none !important; }',
        '@media (max-width: 840px) {',
        'html.planr-eingebettet, html.planr-eingebettet body { max-width: 100%; }',
        'html.planr-eingebettet .arbeitsflaeche { display: block !important; }',
        'html.planr-eingebettet main, html.planr-eingebettet .hauptspalte, html.planr-eingebettet .hkp-arbeitsbereich { max-width: 100% !important; min-width: 0 !important; padding-left: 12px !important; padding-right: 12px !important; }',
        'html.planr-eingebettet .zwei, html.planr-eingebettet .drei, html.planr-eingebettet .zwei-spalten, html.planr-eingebettet .formular-kopf, html.planr-eingebettet .es-kern { grid-template-columns: 1fr !important; }',
        'html.planr-eingebettet .kostenleiste { position: static !important; max-height: none !important; }',
        '}',
      ].join('')
      document.head.append(stil)
    }
    let pause = 0
    const blick = () => {
      if (pause) return
      pause = window.setTimeout(() => { pause = 0 }, 180)
      window.parent.postMessage({ type: 'planr-blick' }, '*')
    }
    document.addEventListener('pointerdown', blick, true)
    document.addEventListener('scroll', blick, true)
  }
  lauscht = true
}

/** Standard für jeden Plan. Ein eigener Dienst der Seite ersetzt ihn. */
export function arbeitStandard(): () => void {
  sicher()
  return () => {}
}

/** Eigener Dienst dieses Planers. Beim Abbau gilt wieder die Standard-Antwort. */
export function arbeitHoeren(dienst: Dienst): () => void {
  sicher()
  custom = dienst
  return () => { if (custom === dienst) custom = null }
}

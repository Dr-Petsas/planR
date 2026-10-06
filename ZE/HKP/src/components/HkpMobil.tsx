import { useEffect, useMemo, useRef, useState } from 'react'
import type { Einstellungen, HkpPlan } from '../types'
import { planNormalisieren } from '../store/plan'
import { berechnen, type Listen } from '../engine/berechnung'
import { listenFuer } from '../clara'
import { STATUS_TEXT, freigebenPerLink, hkpPerLink, planStand, type LinkZugang, type RegisterHkp } from '../store/register'
import { vollansichtSuche } from '../store/mobilLink'
import { PreisRegler } from './PreisRegler'
import { Teil1 } from './Teil1'
import { euro } from '../format'

/** Breite des A4-Vordrucks (210 mm) in CSS-Pixeln */
const BLATT_BREITE_PX = 793.7

const delta = (n: number) => (n > 0.004 ? `+${euro(n)}` : n < -0.004 ? `−${euro(-n)}` : '')

type Laden = { art: 'laden' } | { art: 'fehler'; text: string } | { art: 'da'; hkp: RegisterHkp; entwurf: HkpPlan; listen: Listen; freigabe: boolean }

export function HkpMobil({ zugang }: { zugang: LinkZugang }) {
  const [laden, setLaden] = useState<Laden>({ art: 'laden' })
  const [plan, setPlan] = useState<HkpPlan | null>(null)

  useEffect(() => {
    let weg = false
    hkpPerLink(zugang).then((d) => {
      if (weg) return
      const entwurf = planNormalisieren(JSON.parse(d.hkp.planJson || '{}'))
      setLaden({ art: 'da', hkp: d.hkp, entwurf, listen: d.listen ?? listenFuer(entwurf), freigabe: d.freigabe })
      setPlan(entwurf)
    }).catch((err) => !weg && setLaden({ art: 'fehler', text: err instanceof Error ? err.message : String(err) }))
    return () => { weg = true }
  }, [zugang])

  if (laden.art === 'laden' || (laden.art === 'da' && !plan)) return <div className="hm-app"><p className="hm-mitte">HKP wird geladen …</p></div>
  if (laden.art === 'fehler') return <div className="hm-app"><p className="hm-mitte hm-fehler">Der HKP konnte nicht geladen werden: {laden.text}</p></div>
  return <MobilPlan zugang={zugang} start={laden} plan={plan!} setPlan={setPlan as (f: (p: HkpPlan) => HkpPlan) => void} />
}

function MobilPlan({ zugang, start, plan, setPlan }: {
  zugang: LinkZugang
  start: Extract<Laden, { art: 'da' }>
  plan: HkpPlan
  setPlan: (f: (p: HkpPlan) => HkpPlan) => void
}) {
  const { entwurf, listen } = start
  const [hkp, setHkp] = useState(start.hkp)
  const [meldungen, setMeldungen] = useState<string[]>([])
  const [frage, setFrage] = useState(false)
  const [sendet, setSendet] = useState(false)
  const [fehler, setFehler] = useState('')
  const [zieht, setZieht] = useState(false)

  const ergebnis = useMemo(() => berechnen(plan, listen), [plan, listen])
  const vorher = useMemo(() => berechnen(entwurf, listen).summen, [entwurf, listen])
  const geaendert = useMemo(() => planStand(plan) !== planStand(entwurf), [plan, entwurf])
  const s = ergebnis.summen
  const wartet = hkp.status === 'wartet_auf_freigabe'
  const darf = start.freigabe && wartet

  const setEinstellung = <K extends keyof Einstellungen>(k: K, v: Einstellungen[K]) =>
    setPlan((p) => ({ ...p, einstellungen: { ...p.einstellungen, [k]: v } }))

  useEffect(() => {
    const los = () => setZieht(false)
    window.addEventListener('pointerup', los)
    window.addEventListener('pointercancel', los)
    return () => { window.removeEventListener('pointerup', los); window.removeEventListener('pointercancel', los) }
  }, [])

  const blattRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = blattRef.current
    if (!el) return
    const ro = new ResizeObserver(() => el.style.setProperty('--blatt-zoom', (el.clientWidth / BLATT_BREITE_PX).toFixed(3)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  async function freigeben() {
    setSendet(true)
    setFehler('')
    try {
      const h = await freigebenPerLink(zugang, hkp.version, geaendert ? plan : undefined)
      setHkp((alt) => ({ ...alt, ...h }))
      setFrage(false)
      window.parent?.postMessage({ type: 'planr-hkp', id: hkp.id, status: h.status, summen: h.summen }, '*')
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err))
    } finally {
      setSendet(false)
    }
  }

  const kiefer = hkp.kiefer === 'OK' ? ' im Oberkiefer' : hkp.kiefer === 'UK' ? ' im Unterkiefer' : ''
  const dEigen = s.eigenanteil - vorher.eigenanteil
  // In der Clara-App liegt die Ansicht im iframe; ohne Elternfenster gibt es kein „zurück“.
  const inApp = window.parent !== window
  const zurueck = () => window.parent?.postMessage({ type: 'planr-hkp', id: hkp.id, aktion: 'zurueck' }, '*')

  return (
    <div className="hm-app">
      <header className="hm-kopf">
        <div>
          <b>{hkp.patient.label}</b>
          <span>{hkp.versorgungText ?? 'HKP'}{kiefer}</span>
        </div>
        <i className={`hm-status st-${hkp.status}`}>{STATUS_TEXT[hkp.status] ?? hkp.status}</i>
      </header>

      {meldungen.length > 0 && (
        <div className="hm-meldung" onClick={() => setMeldungen([])}>
          {meldungen.map((m) => <p key={m}>{m}</p>)}
        </div>
      )}

      <div className="hm-regler" onPointerDown={(ev) => { if ((ev.target as HTMLElement).matches('input[type=range]')) setZieht(true) }}>
        <PreisRegler plan={plan} setPlan={setPlan} ergebnis={ergebnis} listen={listen}
          setEinstellung={setEinstellung} onMeldungen={setMeldungen} mobil />
      </div>

      {(hkp.hinweise?.length ?? 0) > 0 && (
        <details className="hm-ausklapp">
          <summary>Annahmen von Clara ({hkp.hinweise!.length})</summary>
          {hkp.hinweise!.map((h) => <p key={h} className="klein">{h}</p>)}
        </details>
      )}

      <details className="hm-ausklapp">
        <summary>HKP-Formular ansehen</summary>
        <div className="hm-blatt" ref={blattRef} inert>
          <Teil1 plan={plan} setPlan={() => {}} ergebnis={ergebnis} listen={listen} onAbformung={() => {}} />
        </div>
      </details>

      <p className="hm-fuss">
        <a href={`${window.location.pathname}${vollansichtSuche(zugang)}`} target="_blank" rel="noreferrer">In PlanR (Vollansicht) öffnen</a>
      </p>

      <footer className={`hm-leiste${zieht ? ' zieht' : ''}`}>
        <div className="hm-summen">
          <div><small>Gesamt</small><b>{euro(s.gesamt)}</b><i>{delta(s.gesamt - vorher.gesamt)}</i></div>
          <div><small>Festzuschuss</small><b>{euro(s.kassenanteil)}</b><i>{delta(s.kassenanteil - vorher.kassenanteil)}</i></div>
          <div className="hm-eigen">
            <small>Eigenanteil</small><b>{euro(s.eigenanteil)}</b>
            <i className={dEigen > 0.004 ? 'hoch' : dEigen < -0.004 ? 'runter' : ''}>{delta(dEigen)}</i>
          </div>
        </div>
        {darf ? (
          <div className="hm-knoepfe">
            {inApp && <button onClick={zurueck}>Später</button>}
            {geaendert && <button onClick={() => setPlan(() => entwurf)}>Claras Entwurf</button>}
            <button className="primaer hm-frei" onClick={() => setFrage(true)}>{geaendert ? 'Mit Änderungen freigeben' : 'Freigeben'}</button>
          </div>
        ) : (
          <div className="hm-knoepfe">
            <p className="hm-nur-lesen">
              {hkp.status === 'freigegeben' ? '✓ Freigegeben' : !wartet ? `Status: ${STATUS_TEXT[hkp.status] ?? hkp.status}`
                : 'Nur ansehen – freigeben geht aus der Clara-App oder in PlanR.'}
            </p>
            {inApp && <button onClick={zurueck}>Zurück</button>}
          </div>
        )}
      </footer>

      {frage && (
        <div className="hm-dialog" role="dialog" aria-modal="true">
          <div className="hm-dialog-karte">
            <h3>HKP freigeben?</h3>
            <p>{hkp.patient.label} · {hkp.versorgungText ?? 'HKP'}{kiefer}</p>
            <dl>
              <dt>Gesamt</dt><dd>{euro(s.gesamt)}</dd>
              <dt>Festzuschuss</dt><dd>{euro(s.kassenanteil)}</dd>
              <dt>Eigenanteil</dt><dd><b>{euro(s.eigenanteil)}</b></dd>
            </dl>
            {geaendert && <p className="klein">Der Regler-Stand wird mit gespeichert (Eigenanteil vorher {euro(vorher.eigenanteil)}).</p>}
            {fehler && <p className="hm-fehler">{fehler}</p>}
            <div className="hm-knoepfe">
              <button onClick={() => { setFrage(false); setFehler('') }} disabled={sendet}>Abbrechen</button>
              <button className="primaer" onClick={freigeben} disabled={sendet}>{sendet ? 'Wird freigegeben …' : 'Ja, freigeben'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

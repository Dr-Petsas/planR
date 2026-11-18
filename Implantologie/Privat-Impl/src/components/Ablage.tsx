import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ABLAGE_GEMELDET, datumZeit, type Ablage, type AblageDaten, type AblageEintrag } from '../ablage'

const betragText = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

interface KnoepfeProps<P> {
  ablage: Ablage<P>
  daten: AblageDaten<P>
  eintrag: AblageEintrag<P> | undefined
  offen: boolean
  onNeu: () => void
  neuText: string
  /** Öffnet einen gespeicherten Plan; ohne diese Angabe gibt es keinen Ablage-Knopf. */
  onLaden?: (plan: P) => void
  /** weitere Knöpfe vor „Neu“, z. B. Versenden */
  extra?: ReactNode
}

const FENSTER: CSSProperties = {
  width: 'min(860px, 94vw)', maxHeight: '82vh', padding: 0, border: '1px solid #ddd', borderRadius: 12,
  boxShadow: '0 18px 50px rgba(0,0,0,.18)',
}
const FENSTER_KOPF: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
  padding: '12px 16px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: 'white',
}

/** Speichern · Freigeben · Ablage · Neu – gleiche Knöpfe in allen Planern */
export function AblageKnoepfe<P>({ ablage, daten, eintrag, offen, onNeu, neuText, onLaden, extra }: KnoepfeProps<P>) {
  const frei = eintrag?.status === 'freigegeben'
  const fenster = useRef<HTMLDialogElement>(null)
  const ziel = ablage.zuOeffnen
  const stand = useRef(daten)
  stand.current = daten
  const anfang = useRef<string | null>(null)
  const merkmal = JSON.stringify(daten.plan)
  if (anfang.current === null) anfang.current = merkmal
  useEffect(() => {
    if (!ziel) return
    ablage.geoeffnet?.()
    const jetzt = stand.current
    const bearbeitet = JSON.stringify(jetzt.plan) !== anfang.current
    // Später eintreffender Alter Stand darf Änderungen in dieser Sitzung nicht zurücksetzen.
    if (bearbeitet && ziel.nummer === jetzt.nummer && JSON.stringify(ziel.plan) !== JSON.stringify(jetzt.plan)) return
    onLaden?.(ziel.plan)
  }, [ziel])
  useEffect(() => {
    if (!offen || eintrag?.status === 'freigegeben') return
    const t = window.setTimeout(() => ablage.speichern(stand.current), 500)
    const weg = () => ablage.speichern(stand.current)
    window.addEventListener('pagehide', weg)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('pagehide', weg)
    }
  }, [offen, merkmal, eintrag?.status])
  // Der Betrag hängt auch an Preisen und Einstellungen, die nach dem Öffnen eintreffen.
  // Weicht er vom abgelegten ab, wird nachgespeichert: Die Übersicht zeigt dieselbe Summe wie der Planer.
  const abgelegt = eintrag?.betrag
  useEffect(() => {
    if (offen || abgelegt === undefined || eintrag?.status === 'freigegeben') return
    if (Math.abs(daten.betrag - abgelegt) < 0.005) return
    const t = window.setTimeout(() => ablage.speichern(stand.current), 400)
    // Wer vorher zur Übersicht wechselt, nimmt die Summe mit.
    const weg = () => ablage.speichern(stand.current)
    window.addEventListener('pagehide', weg)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('pagehide', weg)
    }
  }, [offen, daten.betrag, abgelegt, eintrag?.status])
  const freiRef = useRef(frei)
  freiRef.current = frei
  const tun = useRef(ablage.speichern)
  tun.current = ablage.speichern
  // Rückmeldung nach „Speichern“: erst wenn PlanR den Stand angenommen hat, heißt es „Gespeichert“.
  const [rueck, setRueck] = useState<'' | 'laeuft' | 'ok' | 'fehler'>('')
  const rueckRef = useRef(rueck)
  rueckRef.current = rueck
  const jetztSpeichern = () => {
    setRueck('laeuft')
    tun.current(stand.current)
  }
  useEffect(() => {
    const speichern = () => { if (!freiRef.current) jetztSpeichern() }
    window.addEventListener('planr-speichern', speichern)
    return () => window.removeEventListener('planr-speichern', speichern)
  }, [])
  useEffect(() => {
    let t = 0
    const gemeldet = (ev: Event) => {
      const ok = (ev as CustomEvent<{ ok?: boolean }>).detail?.ok === true
      if (!ok) return setRueck('fehler')
      if (rueckRef.current === 'fehler') return setRueck('')
      if (rueckRef.current !== 'laeuft') return
      setRueck('ok')
      // Kurzes Vibrieren, wo der Browser es kann (Android); iPhones lassen Webseiten nicht vibrieren.
      try { navigator.vibrate?.(40) } catch { /* ohne Vibration */ }
      window.clearTimeout(t)
      t = window.setTimeout(() => setRueck((r) => (r === 'ok' ? '' : r)), 2500)
    }
    window.addEventListener(ABLAGE_GEMELDET, gemeldet)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener(ABLAGE_GEMELDET, gemeldet)
    }
  }, [])
  const uhr = eintrag?.geaendert ? new Date(eintrag.geaendert).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''
  const zu = () => fenster.current?.close()
  return (
    <div className="aktionen">
      {onLaden && (
        <>
          <button className="sekundaer" title="Gespeicherte und freigegebene Pläne" onClick={() => fenster.current?.showModal()}>
            Ablage{ablage.liste.length ? ` (${ablage.liste.length})` : ''}
          </button>
          <dialog ref={fenster} style={FENSTER} onClick={(e) => e.target === fenster.current && zu()}>
            <div style={FENSTER_KOPF}>
              <b>Gespeicherte Pläne</b>
              <button className="sekundaer klein-btn" onClick={zu}>Schließen</button>
            </div>
            <div style={{ padding: '4px 16px 16px' }}>
              {ablage.liste.length
                ? <AblageTabelle ablage={ablage} aktuell={daten.nummer} onLaden={(p) => { onLaden(p); zu() }} />
                : <p className="leer">Noch nichts gespeichert – „Speichern“ legt den aktuellen Plan hier ab.</p>}
            </div>
          </dialog>
        </>
      )}
      <span className={`ablage-stand ${frei ? 'frei' : offen || rueck === 'fehler' ? 'ungespeichert' : ''}`} role="status" aria-live="polite">
        {frei ? 'freigegeben' : rueck === 'fehler' ? 'nicht übertragen – keine Verbindung zu PlanR' : offen ? 'nicht gespeichert' : `gespeichert${uhr ? ` ${uhr} Uhr` : ''}`}
      </span>
      {frei ? (
        <button className="sekundaer" onClick={() => confirm('Freigabe zurücknehmen? Der Plan kann danach wieder geändert werden.') && ablage.zuruecknehmen(daten.nummer)}>
          Freigabe zurücknehmen
        </button>
      ) : (
        <>
          <button className="primaer" type="button" onClick={jetztSpeichern}
            style={rueck === 'ok' ? { background: '#2e7d4f', borderColor: '#2e7d4f', color: '#fff' } : undefined}>
            {rueck === 'laeuft' ? 'Speichert …' : rueck === 'ok' ? '✓ Gespeichert' : 'Speichern'}
          </button>
          <button className="sekundaer" onClick={() => confirm(`${daten.nummer} freigeben? Danach ist der Plan gesperrt.`) && ablage.freigeben(daten)}>Freigeben</button>
        </>
      )}
      {extra}
      <button className="primaer" onClick={onNeu}>{neuText}</button>
    </div>
  )
}

interface ListeProps<P> {
  ablage: Ablage<P>
  aktuell: string
  onLaden: (plan: P) => void
}

/** Gespeicherte Pläne mit Status, zum Öffnen und Löschen */
export function AblageListe<P>({ ablage, aktuell, onLaden }: ListeProps<P>) {
  if (!ablage.liste.length) return null
  return (
    <div className="block ablage">
      <h3>Gespeicherte Pläne <small>{ablage.liste.length}</small></h3>
      <AblageTabelle ablage={ablage} aktuell={aktuell} onLaden={onLaden} />
    </div>
  )
}

function AblageTabelle<P>({ ablage, aktuell, onLaden }: ListeProps<P>) {
  return (
      <table className="ablage-tabelle">
        <thead>
          <tr><th>Nummer</th><th>Patient</th><th className="r">Betrag</th><th>Status</th><th>Geändert</th><th /><th /></tr>
        </thead>
        <tbody>
          {ablage.liste.map((e) => (
            <tr key={e.nummer} className={e.nummer === aktuell ? 'aktuell' : ''}>
              <td className="mono">{e.nummer}</td>
              <td>{e.patient || '—'}</td>
              <td className="r mono">{betragText(e.betrag)}</td>
              <td>
                <span className={`ablage-status ${e.status}`} title={e.freigegebenAm ? `freigegeben am ${datumZeit(e.freigegebenAm)}` : undefined}>
                  {e.status === 'freigegeben' ? 'freigegeben' : 'Entwurf'}
                </span>
              </td>
              <td className="ablage-zeit">{datumZeit(e.geaendert)}</td>
              <td>
                {e.nummer === aktuell
                  ? <span className="ablage-offen">geöffnet</span>
                  : <button className="sekundaer klein-btn" onClick={() => onLaden(e.plan)}>öffnen</button>}
              </td>
              <td>
                <button className="x" title="löschen"
                  onClick={() => confirm(`${e.nummer}${e.patient ? ` (${e.patient})` : ''} endgültig löschen?`) && ablage.loeschen(e.nummer)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
  )
}

/** Hinweis über dem gesperrten Editor */
export function Sperrhinweis<P>({ eintrag }: { eintrag: AblageEintrag<P> | undefined }) {
  if (eintrag?.status !== 'freigegeben') return null
  return (
    <p className="ablage-sperre">
      Freigegeben am {datumZeit(eintrag.freigegebenAm)} – der Plan ist gesperrt. Zum Ändern oben „Freigabe zurücknehmen“.
    </p>
  )
}

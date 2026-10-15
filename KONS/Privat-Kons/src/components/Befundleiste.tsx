import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ALLE_ZAEHNE, BEFUND_KUERZEL, OBERKIEFER, UNTERKIEFER, abweichungen, befundAendern, befundHolen, befundSchreiben, befundVerwerfen,
  datumDe, uhrzeit, useBefund, useBefundLive, type Befund01,
} from '../befund01'

const anzahl = (o: Record<string, string>) => Object.keys(o).length
const titel = (z: string, c: string) => `${z}: ${c ? BEFUND_KUERZEL[c] ?? c : 'vorhanden'}`
const fehlerText = (e: unknown) => `⚠ ${e instanceof Error ? e.message : String(e)}`

function Schema({ b, zeile }: { b: Befund01; zeile?: Record<string, { B?: string }> }) {
  const weicht = zeile ? abweichungen(zeile, b.zaehne) : {}
  const reihe = (zs: string[]) => zs.map((z) => {
    const c = b.zaehne[z] ?? ''
    const klasse = [z in b.offen ? 'offen' : '', z in weicht ? 'weicht' : '', c === 'f' ? 'fehlt' : ''].filter(Boolean).join(' ')
    return (
      <div key={z} className={`b01-zahn ${klasse}`}
        title={`${titel(z, c)}${z in b.offen ? ` – noch nicht in ${b.pvs} (dort: ${b.pvsZaehne[z] || 'vorhanden'})` : ''}${z in weicht ? ` – im Plan: ${weicht[z] || 'vorhanden'}` : ''}`}>
        <span className="b01-code">{c || '·'}</span>
        <span className="b01-nr">{z}</span>
      </div>
    )
  })
  return (
    <div className="b01-schema">
      <div className="b01-reihe">{reihe(OBERKIEFER)}</div>
      <div className="b01-reihe uk">{reihe(UNTERKIEFER)}</div>
    </div>
  )
}

/**
 * Befund (01) als erster Schritt jedes Plans: holt den aktuellen Befund des Patienten aus dem Praxisprogramm
 * (derselbe Stand wie im HKP-Planer und bei Clara), zeigt ihn und gibt ihn dem Planer. Planer mit Befundzeile
 * (B) bekommen ihn automatisch, solange ihre Zeile leer ist oder dem bisherigen 01 entspricht.
 */
export function Befundleiste({ patient, zeile, onUebernehmen, onBefund, auto = false, uebernehmenText = 'In Plan übernehmen', hinweis }: {
  patient: { vorname: string; name: string; geburtsdatum: string }
  /** Befundzeile (B) des Plans – für Abweichungen und „Plan-Befund als 01“; fehlt bei Planern ohne Befundzeile */
  zeile?: Record<string, { B?: string }>
  onUebernehmen: (zaehne: Record<string, string>) => void
  /** jeder neue Stand des 01 (auch live), z. B. für Warnungen an fehlenden oder überkronten Zähnen */
  onBefund?: (b: Befund01 | null) => void
  /** Befundzeile automatisch füllen, solange sie leer ist oder dem bisherigen 01 folgt */
  auto?: boolean
  uebernehmenText?: string
  /** kurzer Satz, was das Übernehmen in diesem Planer bewirkt */
  hinweis?: string
}) {
  const { vorname, name, geburtsdatum } = patient
  const schluessel = name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(geburtsdatum) ? `${vorname.trim()}|${name.trim()}|${geburtsdatum}` : ''
  const [nr, setNr] = useState('')
  const [laedt, setLaedt] = useState(false)
  const [meldung, setMeldung] = useState('')
  const [abgemeldet, setAbgemeldet] = useState(false)
  const [runde, setRunde] = useState(0)
  const b = useBefund(nr)
  const live = useBefundLive()

  useEffect(() => {
    setNr('')
    setMeldung('')
    if (!schluessel) return
    let weg = false
    const uhr = window.setTimeout(() => {
      setLaedt(true)
      const [vn, n, g] = schluessel.split('|')
      befundHolen({ vorname: vn, name: n, geburt: g })
        .then((d) => { if (!weg) { setNr(d.befund.patient); setMeldung(d.meldung ? `⚠ ${d.meldung}` : ''); setAbgemeldet(false) } })
        .catch((e) => { if (!weg) { setAbgemeldet(!!(e as { anmelden?: boolean }).anmelden); setMeldung(fehlerText(e)) } })
        .finally(() => { if (!weg) setLaedt(false) })
    }, 700)
    return () => { weg = true; window.clearTimeout(uhr) }
  }, [schluessel, runde])

  const melde = useRef(onBefund)
  useEffect(() => { melde.current = onBefund })
  useEffect(() => { melde.current?.(b) }, [b])

  // Live: eine Befundzeile, die leer ist oder dem bisherigen 01 entspricht, folgt jeder Änderung sofort.
  const vorher = useRef<{ nr: string; zaehne: Record<string, string> } | null>(null)
  const zeileRef = useRef(zeile)
  const uebernehmen = useRef(onUebernehmen)
  useEffect(() => { zeileRef.current = zeile; uebernehmen.current = onUebernehmen })
  useEffect(() => {
    if (!b) return
    const alt = vorher.current?.nr === b.patient ? vorher.current.zaehne : null
    vorher.current = { nr: b.patient, zaehne: b.zaehne }
    const z = zeileRef.current
    if (!auto || !z) return
    const leer = ALLE_ZAEHNE.every((n) => !String(z[n]?.B ?? '').trim())
    if ((leer || (alt && !anzahl(abweichungen(z, alt)))) && anzahl(abweichungen(z, b.zaehne))) uebernehmen.current(b.zaehne)
  }, [b, auto])

  const weicht = useMemo(() => (b && zeile ? abweichungen(zeile, b.zaehne) : {}), [b, zeile])
  if (abgemeldet) return null
  if (!schluessel) {
    if (!name.trim()) return null
    return <div className="befund-leiste bildschirm"><b>Befund (01)</b><span className="klein">Für den Befund aus dem Praxisprogramm das Geburtsdatum des Patienten eintragen.</span></div>
  }
  const offen = b ? anzahl(b.offen) : 0
  return (
    <div className="befund-leiste bildschirm">
      <span className={`live-punkt${live ? ' an' : ''}`} title={live ? 'live verbunden' : 'keine Live-Verbindung'} aria-hidden="true" />
      <b>Befund (01)</b>
      {b
        ? <span>aus {b.pvs}{b.pvsDatum ? ` vom ${datumDe(b.pvsDatum)}` : ''}{b.geschrieben && !offen && <> · zuletzt übernommen {uhrzeit(b.geschrieben)}</>}
            {offen > 0 && <b className="b01-offen-text"> · {offen} {offen === 1 ? 'Änderung' : 'Änderungen'} noch nicht in {b.pvs}</b>}</span>
        : <span className="klein">{laedt ? 'wird aus dem Praxisprogramm geholt …' : ''}</span>}
      {meldung && <span className="klein">{meldung}</span>}
      {b && <Schema b={b} zeile={zeile} />}
      {b && (
        <span className="aktionen">
          {(!zeile || anzahl(weicht) > 0) && <button className="klein" title={hinweis} onClick={() => onUebernehmen(b.zaehne)}>{uebernehmenText}</button>}
          {zeile && anzahl(weicht) > 0 && (
            <button className="klein" title={`Befundzeile des Plans als 01 vormerken (${anzahl(weicht)} Zähne) – gilt dann auch im HKP und für Clara`}
              onClick={() => { setMeldung(''); befundAendern(b.patient, weicht).catch((e) => setMeldung(fehlerText(e))) }}>
              Plan-Befund als 01
            </button>
          )}
          {offen > 0 && (
            <button className="klein" onClick={() => {
              if (!confirm(`Befund in ${b.pvs} übernehmen? Geschrieben wird der ganze betroffene Kiefer; der alte Befund bleibt dort als Historie.`)) return
              setMeldung('wird übernommen …')
              befundSchreiben(b.patient).then(setMeldung, (e) => setMeldung(fehlerText(e)))
            }}>In {b.pvs} übernehmen</button>
          )}
          {offen > 0 && <button className="klein" onClick={() => { if (confirm(`Offene Änderungen verwerfen? Es gilt wieder der Befund aus ${b.pvs}.`)) befundVerwerfen(b.patient).catch(() => {}) }}>Verwerfen</button>}
          <button className="klein" title="Neu aus dem Praxisprogramm lesen" disabled={laedt} onClick={() => setRunde((r) => r + 1)}>↻</button>
        </span>
      )}
    </div>
  )
}

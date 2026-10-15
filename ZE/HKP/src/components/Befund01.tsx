import { useEffect, useMemo, useRef, useState } from 'react'
import type { HkpPlan } from '../types'
import { BEFUND_KUERZEL, OBERKIEFER, UNTERKIEFER } from '../engine/zahnschema'
import { useVerbindung } from '../store/register'
import {
  abweichungen, befundAendern, befundHolen, befundListe, befundSchreiben, befundVerwerfen, datumDe, uhrzeit,
  useBefund, useBefunde, useBefundLive, type Befund01,
} from '../store/befund01'

const ALLE = [...OBERKIEFER, ...UNTERKIEFER]
const anzahl = (o: Record<string, string>) => Object.keys(o).length
const titel = (z: string, c: string) => `${z}: ${c ? BEFUND_KUERZEL[c] ?? c : 'vorhanden'}`

/** Befund in die B-Zeile des Plans (alle 32 Zähne) */
export const befundInPlan = (p: HkpPlan, zaehne: Record<string, string>): HkpPlan =>
  ({ ...p, zaehne: Object.fromEntries(ALLE.map((z) => [z, { ...p.zaehne[z], B: zaehne[z] ?? '' }])) })

function Schema({ b, plan, gross, onAendern }: {
  b: Befund01
  plan?: HkpPlan['zaehne']
  gross?: boolean
  onAendern?: (z: string, code: string) => void
}) {
  const weicht = plan ? abweichungen(plan, b.zaehne) : {}
  const reihe = (zs: string[]) => zs.map((z) => {
    const c = b.zaehne[z] ?? ''
    const klasse = [z in b.offen ? 'offen' : '', z in weicht ? 'weicht' : '', c === 'f' ? 'fehlt' : ''].filter(Boolean).join(' ')
    return (
      <div key={z} className={`b01-zahn ${klasse}`} title={`${titel(z, c)}${z in b.offen ? ` – noch nicht in ${b.pvs} (dort: ${b.pvsZaehne[z] || 'vorhanden'})` : ''}${z in weicht ? ` – im Plan: ${weicht[z] || 'vorhanden'}` : ''}`}>
        {onAendern
          ? <input key={`${z}-${c}`} defaultValue={c} maxLength={6} aria-label={`Befund ${z}`}
              onBlur={(e) => { const v = e.target.value.trim().toLowerCase(); if (v !== c) onAendern(z, v) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
          : <span className="b01-code">{c || '·'}</span>}
        <span className="b01-nr">{z}</span>
      </div>
    )
  })
  return (
    <div className={`b01-schema${gross ? ' gross' : ''}`}>
      <div className="b01-reihe">{reihe(OBERKIEFER)}</div>
      <div className="b01-reihe uk">{reihe(UNTERKIEFER)}</div>
    </div>
  )
}

function Herkunft({ b }: { b: Befund01 }) {
  const offen = anzahl(b.offen)
  return (
    <span>
      aus {b.pvs}{b.pvsDatum ? ` vom ${datumDe(b.pvsDatum)}` : ''}
      {b.geschrieben && !offen && <> · zuletzt übernommen {uhrzeit(b.geschrieben)}</>}
      {offen > 0 && <b className="b01-offen-text"> · {offen} {offen === 1 ? 'Änderung' : 'Änderungen'} noch nicht in {b.pvs}{b.offenWer ? ` (${b.offenWer}, ${uhrzeit(b.stand)})` : ''}</b>}
    </span>
  )
}

async function schreibenFragen(b: Befund01, setMeldung: (s: string) => void) {
  const kiefer = ['OK', 'UK'].filter((k) => Object.keys(b.offen).some((z) => (k === 'OK') === /^[12]/.test(z)))
  if (!confirm(`Befund in ${b.pvs} übernehmen? Geschrieben wird der ganze ${kiefer.map((k) => (k === 'OK' ? 'Oberkiefer' : 'Unterkiefer')).join(' und ')}; der alte Befund bleibt dort als Historie.`)) return
  setMeldung('wird übernommen …')
  setMeldung(await befundSchreiben(b.patient).catch((e) => `⚠ ${e instanceof Error ? e.message : String(e)}`))
}

/**
 * Aktueller 01 im HKP-Planer: holt den Befund des offenen Patienten aus dem Praxisprogramm, zeigt die im Gespräch
 * geänderten Zähne und trägt ihn live in einen freien Plan ein, solange dessen Befund dem bisherigen 01 entspricht.
 */
export function AktuellerBefundLeiste({ plan, setPlan, frei, onSeite }: {
  plan: HkpPlan
  setPlan: (f: (p: HkpPlan) => HkpPlan) => void
  /** Plan ist nicht mit einem HKP im Register verknüpft – dann folgt er dem 01 von selbst */
  frei: boolean
  onSeite: (patient: string) => void
}) {
  const v = useVerbindung()
  const { vorname, name, geburtsdatum } = plan.patient
  const schluessel = v.sitzung && name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(geburtsdatum) ? `${vorname.trim()}|${name.trim()}|${geburtsdatum}` : ''
  const [nr, setNr] = useState('')
  const [laedt, setLaedt] = useState(false)
  const [meldung, setMeldung] = useState('')
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
        .then((d) => { if (!weg) { setNr(d.befund.patient); setMeldung(d.meldung ? `⚠ ${d.meldung}` : '') } })
        .catch((e) => { if (!weg) setMeldung(`⚠ ${e instanceof Error ? e.message : String(e)}`) })
        .finally(() => { if (!weg) setLaedt(false) })
    }, 700)
    return () => { weg = true; window.clearTimeout(uhr) }
  }, [schluessel, runde])

  // Live: ein freier Plan, dessen Befund dem bisherigen 01 entspricht (oder noch leer ist), bekommt jede Änderung sofort.
  const vorher = useRef<{ nr: string; zaehne: Record<string, string> } | null>(null)
  const planRef = useRef(plan)
  useEffect(() => { planRef.current = plan })
  useEffect(() => {
    if (!b) return
    const alt = vorher.current?.nr === b.patient ? vorher.current.zaehne : null
    vorher.current = { nr: b.patient, zaehne: b.zaehne }
    if (!frei) return
    const p = planRef.current.zaehne
    const leer = ALLE.every((z) => !String(p[z]?.B ?? '').trim())
    if ((leer || (alt && !anzahl(abweichungen(p, alt)))) && anzahl(abweichungen(p, b.zaehne))) setPlan((q) => befundInPlan(q, b.zaehne))
  }, [b, frei, setPlan])

  const weicht = useMemo(() => (b ? abweichungen(plan.zaehne, b.zaehne) : {}), [b, plan.zaehne])
  if (!v.sitzung || (!schluessel && !(name.trim() && !geburtsdatum))) return null
  if (!schluessel) return <div className="register-leiste befund-leiste bildschirm"><b>Aktueller 01</b><span className="klein">Für den Befund aus dem Praxisprogramm das Geburtsdatum des Patienten eintragen.</span></div>

  return (
    <div className="register-leiste befund-leiste bildschirm">
      <span className={`live-punkt${live ? ' an' : ''}`} title={live ? 'live verbunden' : 'keine Live-Verbindung'} aria-hidden="true" />
      <b>Aktueller 01</b>
      {b ? <Herkunft b={b} /> : <span className="klein">{laedt ? 'wird aus dem Praxisprogramm geholt …' : ''}</span>}
      {meldung && <span className="klein">{meldung}</span>}
      {b && <Schema b={b} plan={plan.zaehne} />}
      {b && (
        <span className="aktionen">
          {anzahl(weicht) > 0 && <button className="klein" title="Befund-Zeile des Plans durch den aktuellen 01 ersetzen" onClick={() => setPlan((p) => befundInPlan(p, b.zaehne))}>In Plan übernehmen</button>}
          {anzahl(weicht) > 0 && (
            <button className="klein" title={`Befund-Zeile des Plans als 01 vormerken (${anzahl(weicht)} Zähne) – gilt dann auch für Clara`}
              onClick={() => { setMeldung(''); befundAendern(b.patient, weicht).catch((e) => setMeldung(`⚠ ${e instanceof Error ? e.message : String(e)}`)) }}>
              Plan-Befund als 01
            </button>
          )}
          {anzahl(b.offen) > 0 && <button className="klein" onClick={() => schreibenFragen(b, setMeldung)}>In {b.pvs} übernehmen</button>}
          {anzahl(b.offen) > 0 && <button className="klein" onClick={() => { if (confirm(`Offene Änderungen verwerfen? Es gilt wieder der Befund aus ${b.pvs}.`)) befundVerwerfen(b.patient).catch(() => {}) }}>Verwerfen</button>}
          <button className="klein" title="Neu aus dem Praxisprogramm lesen" disabled={laedt} onClick={() => setRunde((r) => r + 1)}>↻</button>
          <button className="klein" onClick={() => onSeite(b.patient)}>Befundseite</button>
        </span>
      )}
    </div>
  )
}

/** Eigene Befundseite: zuletzt bearbeitete Befunde der Praxis, live; Zähne direkt änderbar. */
export function BefundSeite({ start, onNeuerHkp }: {
  start: string
  onNeuerHkp: (patient: Pick<HkpPlan['patient'], 'vorname' | 'name' | 'geburtsdatum'>) => void
}) {
  const v = useVerbindung()
  const alle = useBefunde()
  const live = useBefundLive()
  const [wahl, setWahl] = useState(start)
  const [suche, setSuche] = useState('')
  const [meldung, setMeldung] = useState('')
  const [laedt, setLaedt] = useState(false)
  useEffect(() => { if (start) setWahl(start) }, [start])
  useEffect(() => { if (v.sitzung) befundListe().catch((e) => setMeldung(`⚠ ${e instanceof Error ? e.message : String(e)}`)) }, [v.sitzung])
  useEffect(() => {
    if (!v.sitzung || !/^\d{1,9}$/.test(wahl)) return
    setLaedt(true)
    setMeldung('')
    befundHolen({ patient: wahl })
      .then((d) => setMeldung(d.meldung ? `⚠ ${d.meldung}` : ''))
      .catch((e) => setMeldung(`⚠ ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLaedt(false))
  }, [wahl, v.sitzung])

  if (!v.sitzung) return <section className="abschnitt"><h3>Befund (01)</h3><p>Die Befundseite gibt es mit der PlanR-Anmeldung.</p></section>
  const s = suche.trim().toLowerCase()
  const liste = Object.values(alle).filter((x) => !s || x.label.toLowerCase().includes(s) || x.patient === s).sort((a, c) => c.stand.localeCompare(a.stand))
  const b = alle[wahl]
  const aendern = (z: string, code: string) => { setMeldung(''); befundAendern(wahl, { [z]: code }).catch((e) => setMeldung(`⚠ ${e instanceof Error ? e.message : String(e)}`)) }
  const neuerHkp = (x: Befund01) => {
    const [n, vn] = x.label.split(',').map((t) => t.trim())
    onNeuerHkp({ name: n ?? '', vorname: vn ?? '', geburtsdatum: x.geburt })
  }

  return (
    <section className="abschnitt befund-seite">
      <h3>
        Befund (01) <span className={`live-punkt${live ? ' an' : ''}`} title={live ? 'live verbunden' : 'keine Live-Verbindung'} aria-hidden="true" />
        <small> aktuellster Stand je Patient: aus dem Praxisprogramm oder im Gespräch geändert</small>
      </h3>
      <div className="b01-seite">
        <aside>
          <input placeholder="Patient suchen oder Nummer" value={suche} onChange={(e) => setSuche(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && /^\d{1,9}$/.test(suche.trim())) setWahl(suche.trim()) }} />
          {liste.map((x) => (
            <button key={x.patient} className={`b01-eintrag${x.patient === wahl ? ' aktiv' : ''}`} onClick={() => setWahl(x.patient)}>
              <b>{x.label || `Patient ${x.patient}`}</b>
              <small>{x.geburt ? datumDe(x.geburt) : ''} · {uhrzeit(x.stand)}{anzahl(x.offen) ? ` · ${anzahl(x.offen)} offen` : ''}</small>
            </button>
          ))}
          {!liste.length && <p className="klein">Noch keine Befunde. Patientennummer eingeben und Enter drücken – oder in der Patientensuche „Befund (01)“.</p>}
        </aside>
        <div>
          {!b && <p>{laedt ? 'Befund wird aus dem Praxisprogramm geholt …' : 'Links einen Patienten wählen.'}</p>}
          {b && (
            <>
              <p><b>{b.label || `Patient ${b.patient}`}</b>{b.geburt ? `, geb. ${datumDe(b.geburt)}` : ''} · Nr. {b.patient} · <Herkunft b={b} /></p>
              <Schema b={b} gross onAendern={aendern} />
              <p className="klein">Kürzel direkt im Feld ändern (z. B. f, k, kw, x, i, ww). Rosa = noch nicht in {b.pvs}; gilt trotzdem sofort für den nächsten HKP und für Clara.</p>
              <div className="b01-knoepfe">
                {anzahl(b.offen) > 0 && <button onClick={() => schreibenFragen(b, setMeldung)}>In {b.pvs} übernehmen</button>}
                {anzahl(b.offen) > 0 && <button onClick={() => { if (confirm(`Offene Änderungen verwerfen? Es gilt wieder der Befund aus ${b.pvs}.`)) befundVerwerfen(b.patient).catch(() => {}) }}>Verwerfen</button>}
                <button disabled={laedt} onClick={() => { setLaedt(true); befundHolen({ patient: b.patient }).catch(() => {}).finally(() => setLaedt(false)) }}>Neu aus {b.pvs} lesen</button>
                {b.geburt && <button onClick={() => neuerHkp(b)}>Neuer HKP mit diesem Befund</button>}
              </div>
            </>
          )}
          {meldung && <p className="klein">{meldung}</p>}
        </div>
      </div>
    </section>
  )
}

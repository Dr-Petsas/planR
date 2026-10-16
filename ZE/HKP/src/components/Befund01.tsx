import { useEffect, useMemo, useRef, useState } from 'react'
import type { HkpPlan } from '../types'
import { BEFUND_KUERZEL, OBERKIEFER, UNTERKIEFER } from '../engine/zahnschema'
import { useVerbindung } from '../store/register'
import {
  abweichungen, befundAendern, befundHolen, befundSchreiben, befundVerwerfen, datumDe, uhrzeit,
  useBefund, useBefundLive, type Befund01,
} from '../store/befund01'

const ALLE = [...OBERKIEFER, ...UNTERKIEFER]
const anzahl = (o: Record<string, string>) => Object.keys(o).length
const titel = (z: string, c: string) => `${z}: ${c ? BEFUND_KUERZEL[c] ?? c : 'vorhanden'}`

/** Befund in die B-Zeile des Plans (alle 32 Zähne) */
export const befundInPlan = (p: HkpPlan, zaehne: Record<string, string>): HkpPlan =>
  ({ ...p, zaehne: Object.fromEntries(ALLE.map((z) => [z, { ...p.zaehne[z], B: zaehne[z] ?? '' }])) })

function Schema({ b, plan }: { b: Befund01; plan: HkpPlan['zaehne'] }) {
  const weicht = abweichungen(plan, b.zaehne)
  const reihe = (zs: string[]) => zs.map((z) => {
    const c = b.zaehne[z] ?? ''
    const klasse = [z in b.offen ? 'offen' : '', z in weicht ? 'weicht' : '', c === 'f' ? 'fehlt' : ''].filter(Boolean).join(' ')
    return (
      <div key={z} className={`b01-zahn ${klasse}`} title={`${titel(z, c)}${z in b.offen ? ` – noch nicht in ${b.pvs} (dort: ${b.pvsZaehne[z] || 'vorhanden'})` : ''}${z in weicht ? ` – im Plan: ${weicht[z] || 'vorhanden'}` : ''}`}>
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

/** Laufender Vorgang (Befund → Planung): Stand und – ohne offene Änderungen – die Freigabe des unveränderten Befunds */
function VorgangStand({ b, setMeldung }: { b: Befund01; setMeldung: (s: string) => void }) {
  const v = b.vorgang
  if (!v || v.phase === 'angelegt') return null
  const art = v.modul ? ` · ${v.modul.replace(/^privat-(.*)$/, '$1 privat').toUpperCase()}` : ''
  return (
    <span className="b01-vorgang">
      <b>{v.phase === 'befund' ? 'Befund · noch nichts geplant' : `in Planung${art}`}</b>
      {v.auftrag && <> – {v.auftrag}</>}
      {v.freigegeben && <> · freigegeben {uhrzeit(v.freigegeben)}{v.freigabeWo ? ` (${v.freigabeWo})` : ''}</>}
      {v.meldung && <b className="b01-offen-text"> · {v.meldung}</b>}
      {v.phase === 'befund' && !anzahl(b.offen) && (
        <button className="klein" title="Befund unverändert bestätigen – danach wird geplant"
          onClick={() => { setMeldung(''); befundSchreiben(b.patient).then(setMeldung, (e) => setMeldung(`⚠ ${e instanceof Error ? e.message : String(e)}`)) }}>
          Befund stimmt – freigeben
        </button>
      )}
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
 * Aktueller 01 im HKP-Planer: holt den Befund des offenen Patienten aus dem Praxisprogramm und zeigt die im Gespräch
 * geänderten Zähne. Eine leere Befundzeile bekommt ihn sofort; ein freier Plan folgt ihm live, solange dessen Befund
 * dem bisherigen 01 entspricht.
 */
export function AktuellerBefundLeiste({ plan, setPlan, frei }: {
  plan: HkpPlan
  setPlan: (f: (p: HkpPlan) => HkpPlan) => void
  /** Plan ist nicht mit einem HKP im Register verknüpft – dann folgt er dem 01 von selbst */
  frei: boolean
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

  // Leere Befundzeile: der 01 steht sofort drin. Live: ein freier Plan, dessen Befund dem bisherigen 01 entspricht, bekommt jede Änderung.
  const vorher = useRef<{ nr: string; zaehne: Record<string, string> } | null>(null)
  const planRef = useRef(plan)
  useEffect(() => { planRef.current = plan })
  useEffect(() => {
    if (!b) return
    const alt = vorher.current?.nr === b.patient ? vorher.current.zaehne : null
    vorher.current = { nr: b.patient, zaehne: b.zaehne }
    const p = planRef.current.zaehne
    const leer = ALLE.every((z) => !String(p[z]?.B ?? '').trim())
    const folgt = frei && alt && !anzahl(abweichungen(p, alt))
    if ((leer || folgt) && anzahl(abweichungen(p, b.zaehne))) setPlan((q) => befundInPlan(q, b.zaehne))
  }, [b, frei, setPlan])

  const weicht = useMemo(() => (b ? abweichungen(plan.zaehne, b.zaehne) : {}), [b, plan.zaehne])
  if (!v.sitzung || (!schluessel && !(name.trim() && !geburtsdatum))) return null
  if (!schluessel) return <div className="register-leiste befund-leiste bildschirm"><b>Aktueller 01</b><span className="klein">Für den Befund aus dem Praxisprogramm das Geburtsdatum des Patienten eintragen.</span></div>

  return (
    <div className="register-leiste befund-leiste bildschirm">
      <span className={`live-punkt${live ? ' an' : ''}`} title={live ? 'live verbunden' : 'keine Live-Verbindung'} aria-hidden="true" />
      <b>Aktueller 01</b>
      {b ? <Herkunft b={b} /> : <span className="klein">{laedt ? 'wird aus dem Praxisprogramm geholt …' : ''}</span>}
      {b && <VorgangStand b={b} setMeldung={setMeldung} />}
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
        </span>
      )}
    </div>
  )
}

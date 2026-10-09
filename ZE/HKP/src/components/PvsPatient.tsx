import { useEffect, useState } from 'react'
import type { HkpPlan } from '../types'
import type { Ergebnis } from '../engine/berechnung'
import {
  patientAusPvs,
  pvsHkpAnlegen,
  pvsPatientenSuchen,
  type PvsPatient,
} from '../store/pvs'

interface Props {
  plan: HkpPlan
  ergebnis: Ergebnis
  setPlan: (f: (p: HkpPlan) => HkpPlan) => void
  pvsPatientId: string | null
  onPvsPatientId: (id: string | null) => void
}

function suchvorschlag(plan: HkpPlan) {
  return [plan.patient.name, plan.patient.vorname].map((s) => s.trim()).filter(Boolean).join(' ')
}

/** Patient im PVS suchen und HKP anlegen – ohne PVS-spezifisches Mapping. */
export function PvsPatientLeiste({ plan, ergebnis, setPlan, pvsPatientId, onPvsPatientId }: Props) {
  const [suche, setSuche] = useState(suchvorschlag(plan))
  const [treffer, setTreffer] = useState<PvsPatient[] | null>(null)
  const [offen, setOffen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null)

  useEffect(() => {
    if (!suche.trim()) setSuche(suchvorschlag(plan))
  }, [plan.patient.name, plan.patient.vorname])

  async function suchen() {
    const text = suche.trim()
    if (!text) {
      setMeldung({ text: 'Suchbegriff eingeben (Vor- und/oder Nachname).', fehler: true })
      setOffen(false)
      setTreffer(null)
      return
    }
    setBusy(true)
    setMeldung(null)
    setTreffer(null)
    setOffen(true)
    try {
      const items = await pvsPatientenSuchen(text)
      setTreffer(items)
      if (!items.length) setMeldung({ text: 'Kein Patient im PVS gefunden.', fehler: true })
    } catch (e) {
      setMeldung({ text: e instanceof Error ? e.message : String(e), fehler: true })
      setOffen(false)
    } finally {
      setBusy(false)
    }
  }

  function uebernehmen(p: PvsPatient) {
    setPlan((prev) => ({ ...prev, patient: patientAusPvs(p, prev.patient) }))
    onPvsPatientId(p.id)
    setSuche(`${p.lastName} ${p.firstName}`.trim())
    setTreffer(null)
    setOffen(false)
    setMeldung({ text: `Patient ${p.lastName}, ${p.firstName} (Nr. ${p.id}) übernommen.` })
  }

  async function hkpAnlegen() {
    if (!pvsPatientId) return
    if (!confirm(`HKP für Patient ${pvsPatientId} (${plan.patient.name}, ${plan.patient.vorname}) im PVS anlegen?`)) return
    setBusy(true)
    setMeldung(null)
    try {
      const r = await pvsHkpAnlegen(pvsPatientId, plan, ergebnis)
      setMeldung({ text: `HKP Nr. ${r.number} im PVS angelegt.` })
    } catch (e) {
      setMeldung({ text: e instanceof Error ? e.message : String(e), fehler: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pvs-leiste bildschirm">
      <div className="pvs-zeile">
        <strong>PVS</strong>
        <div className="pvs-suche">
          <input
            type="search"
            value={suche}
            placeholder="Vor- und/oder Nachname"
            disabled={busy}
            onChange={(ev) => {
              setSuche(ev.target.value)
              if (pvsPatientId) onPvsPatientId(null)
              setOffen(false)
              setTreffer(null)
            }}
            onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); suchen() } }}
          />
          <button type="button" className="pvs-lupe" disabled={busy} onClick={suchen} title="Patient suchen" aria-label="Patient suchen">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M15 15l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {offen && treffer && (
            <ul className="pvs-treffer">
              {treffer.length === 0 ? (
                <li className="pvs-treffer-leer">Keine Treffer</li>
              ) : treffer.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => uebernehmen(p)}>
                    <b>{p.lastName}, {p.firstName}</b>
                    <span>
                      {p.birthDate || 'ohne Geburtsdatum'}
                      {p.postalCode || p.city ? ` · ${[p.postalCode, p.city].filter(Boolean).join(' ')}` : ''}
                      {` · Nr. ${p.id}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" disabled={busy || !pvsPatientId} onClick={hkpAnlegen}
          title={pvsPatientId ? 'Aktuellen Plan als HKP im PVS anlegen' : 'Zuerst einen Patienten aus der Suche auswählen'}>
          HKP im PVS anlegen
        </button>
        {pvsPatientId && <span className="pvs-id">Nr. {pvsPatientId}</span>}
        {meldung && <span className={`pvs-meldung${meldung.fehler ? ' fehler' : ''}`}>{meldung.text}</span>}
      </div>
    </div>
  )
}

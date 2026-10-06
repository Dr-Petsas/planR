import type { Patient, Plan } from '../types'

export default function PatientReiter({ plan, setPlan }: { plan: Plan; setPlan: (p: Plan) => void }) {
  const p = plan.patient
  const setP = (patch: Partial<Patient>) => setPlan({ ...plan, patient: { ...p, ...patch } })

  return (
    <div className="karte">
      <h2>Patient & Plan</h2>
      <div className="felder">
        <label>
          Plan-Nummer
          <input value={plan.nummer} onChange={(e) => setPlan({ ...plan, nummer: e.target.value })} />
        </label>
        <label>
          Plandatum
          <input type="date" value={plan.datum} onChange={(e) => setPlan({ ...plan, datum: e.target.value })} />
        </label>
        <label className="breit">
          Name, Vorname
          <input value={p.name} onChange={(e) => setP({ name: e.target.value })} />
        </label>
        <label>
          Geburtsdatum
          <input type="date" value={p.geburtsdatum} onChange={(e) => setP({ geburtsdatum: e.target.value })} />
        </label>
        <label>
          Krankenkasse
          <input value={p.kasse} onChange={(e) => setP({ kasse: e.target.value })} />
        </label>
        <label>
          Versichertennummer
          <input value={p.versichertennr} onChange={(e) => setP({ versichertennr: e.target.value })} />
        </label>
        <label>
          Kostenträgerkennung
          <input value={p.kostentraegerkennung} onChange={(e) => setP({ kostentraegerkennung: e.target.value })} />
        </label>
      </div>
      <label className="breit">
        Bemerkung (für den Antrag)
        <textarea value={plan.bemerkung} onChange={(e) => setPlan({ ...plan, bemerkung: e.target.value })} rows={3} />
      </label>
    </div>
  )
}

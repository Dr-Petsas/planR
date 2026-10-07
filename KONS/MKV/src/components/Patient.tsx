import type { Plan } from '../types'
import { PatientFelder } from './Stammdaten'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
}

export default function Patient({ plan, setPlan }: Props) {
  return (
    <div className="block">
      <h3>Patientin / Patient</h3>
      <PatientFelder art="kasse" patient={plan.patient} onChange={(patient) => setPlan({ ...plan, patient })} />
      <h3 style={{ marginTop: 18 }}>Plan</h3>
      <div className="formular">
        <label className="feld">
          Plan-Nummer
          <input value={plan.nummer} onChange={(e) => setPlan({ ...plan, nummer: e.target.value })} />
        </label>
        <label className="feld">
          Datum
          <input type="date" value={plan.datum} onChange={(e) => setPlan({ ...plan, datum: e.target.value })} />
        </label>
        <label className="feld breit">
          Bemerkung (erscheint in der Vereinbarung)
          <textarea rows={3} value={plan.bemerkung} onChange={(e) => setPlan({ ...plan, bemerkung: e.target.value })} />
        </label>
      </div>
    </div>
  )
}

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
      <PatientFelder art="privat" patient={plan.patient} onChange={(patient) => setPlan({ ...plan, patient })} />
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
          Befund / Diagnose
          <textarea rows={2} value={plan.diagnose} placeholder="z. B. Distalbiss, Engstand im Ober- und Unterkiefer, vergrößerte Frontzahnstufe 7 mm"
            onChange={(e) => setPlan({ ...plan, diagnose: e.target.value })} />
        </label>
        <label className="feld breit">
          Behandlungsziel und Behandlungsmittel
          <textarea rows={2} value={plan.therapie} placeholder="z. B. Einstellung in den Regelbiss mit Funktionsregler, anschließend Multiband in beiden Kiefern"
            onChange={(e) => setPlan({ ...plan, therapie: e.target.value })} />
        </label>
        <label className="feld breit">
          Bemerkung (erscheint im Heil- und Kostenplan)
          <textarea rows={3} value={plan.bemerkung} onChange={(e) => setPlan({ ...plan, bemerkung: e.target.value })} />
        </label>
      </div>
    </div>
  )
}

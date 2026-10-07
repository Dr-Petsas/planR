import type { Grad, Plan, Stadium } from '../types'
import { PatientFelder } from './Stammdaten'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
}

const STADIEN: Stadium[] = ['I', 'II', 'III', 'IV']
const GRADE: Grad[] = ['A', 'B', 'C']

export default function Patient({ plan, setPlan }: Props) {
  return (
    <>
      <div className="block">
        <h3>Patientin / Patient</h3>
        <PatientFelder art="privat" patient={plan.patient} onChange={(patient) => setPlan({ ...plan, patient })} />
        <div className="schalter" style={{ marginTop: 10 }}>
          <label>
            <input type="checkbox" checked={plan.gkv} onChange={(e) => setPlan({ ...plan, gkv: e.target.checked })} />
            {' '}gesetzlich versichert (Privatvereinbarung nach § 8 Abs. 7 BMV-Z)
          </label>
        </div>
      </div>

      <div className="block">
        <h3>Diagnose</h3>
        <div className="formular">
          <label className="feld">
            Plan-Nummer
            <input value={plan.nummer} onChange={(e) => setPlan({ ...plan, nummer: e.target.value })} />
          </label>
          <label className="feld">
            Datum
            <input type="date" value={plan.datum} onChange={(e) => setPlan({ ...plan, datum: e.target.value })} />
          </label>
          <div className="feld">
            Stadium
            <div className="wahl">
              {STADIEN.map((s) => <button key={s} className={plan.stadium === s ? 'aktiv' : ''} onClick={() => setPlan({ ...plan, stadium: s })}>{s}</button>)}
            </div>
          </div>
          <div className="feld">
            Grad (bestimmt die UPT-Frequenz)
            <div className="wahl">
              {GRADE.map((g) => <button key={g} className={plan.grad === g ? 'aktiv' : ''} onClick={() => setPlan({ ...plan, grad: g })}>{g}</button>)}
            </div>
          </div>
          <label className="feld breit">
            Befund / Diagnose
            <textarea rows={2} value={plan.diagnose} placeholder="z. B. Parodontitis Stadium III, Grad B, generalisiert" onChange={(e) => setPlan({ ...plan, diagnose: e.target.value })} />
          </label>
          <label className="feld breit">
            Bemerkung (erscheint im Heil- und Kostenplan)
            <textarea rows={2} value={plan.bemerkung} onChange={(e) => setPlan({ ...plan, bemerkung: e.target.value })} />
          </label>
        </div>
      </div>
    </>
  )
}

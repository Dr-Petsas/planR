import { useMemo, useState } from 'react'
import { diagnostizieren } from './engine/diagnose'
import { neuerPlan, useEinstellungen, usePlan } from './store'
import PatientReiter from './components/PatientReiter'
import BefundReiter from './components/BefundReiter'
import DiagnoseReiter from './components/DiagnoseReiter'
import StreckeReiter from './components/StreckeReiter'
import AntragDokument from './components/AntragDokument'
import PraxisReiter from './components/PraxisReiter'

type ReiterId = 'patient' | 'befund' | 'diagnose' | 'strecke' | 'antrag' | 'praxis'

const REITER: { id: ReiterId; label: string }[] = [
  { id: 'patient', label: 'Patient' },
  { id: 'befund', label: 'Befund / Taschen' },
  { id: 'diagnose', label: 'Diagnose' },
  { id: 'strecke', label: 'Strecke / UPT' },
  { id: 'antrag', label: 'Antrag (Druck)' },
  { id: 'praxis', label: 'Praxis' },
]

export default function App() {
  const [plan, setPlan] = usePlan()
  const [einst, setEinst] = useEinstellungen()
  const [reiter, setReiter] = useState<ReiterId>('patient')

  const diag = useMemo(() => diagnostizieren(plan.diagnose, plan.befunde.initial), [plan.diagnose, plan.befunde.initial])

  const neu = () => {
    if (!confirm('Neuen PAR-Plan beginnen? Der aktuelle Plan wird aus der Eingabe entfernt (bleibt bis zum Überschreiben im Speicher).')) return
    setPlan(neuerPlan(einst.naechsteNummer))
    setEinst({ ...einst, naechsteNummer: einst.naechsteNummer + 1 })
    setReiter('patient')
  }

  return (
    <div className="app">
      <header className="kopf">
        <div>
          <h1>PAR-Planer</h1>
          <span className="kopf-unter">Parodontitis-Behandlungsplan · gesetzliche Kasse · BEMA Teil 4</span>
        </div>
        <div className="kopf-rechts">
          <span className="kopf-diag">
            {['', 'Stadium I', 'Stadium II', 'Stadium III', 'Stadium IV'][diag.stadium]} · {diag.ausmass} · Grad {diag.grad}
          </span>
          <button onClick={neu}>Neuer Plan</button>
        </div>
      </header>

      <nav className="reiter">
        {REITER.map((r) => (
          <button key={r.id} className={reiter === r.id ? 'aktiv' : ''} onClick={() => setReiter(r.id)}>
            {r.label}
          </button>
        ))}
      </nav>

      <main className="inhalt">
        {reiter === 'patient' && <PatientReiter plan={plan} setPlan={setPlan} />}
        {reiter === 'befund' && <BefundReiter plan={plan} setPlan={setPlan} />}
        {reiter === 'diagnose' && <DiagnoseReiter plan={plan} setPlan={setPlan} ergebnis={diag} />}
        {reiter === 'strecke' && <StreckeReiter plan={plan} setPlan={setPlan} einst={einst} diag={diag} />}
        {reiter === 'antrag' && <AntragDokument plan={plan} einst={einst} diag={diag} />}
        {reiter === 'praxis' && <PraxisReiter einst={einst} setEinst={setEinst} />}
      </main>
    </div>
  )
}

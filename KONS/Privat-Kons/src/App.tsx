import { useMemo, useState } from 'react'
import { euro, rechnen } from './engine/kons'
import { neuerPlan, nummerFormat, planMigrieren, useEinstellungen, useKonsAblage, usePlan } from './store'
import { ungespeichert } from './ablage'
import type { Plan } from './types'
import { patientName } from './stammdaten'
import Patient from './components/Patient'
import Zahnschema from './components/Zahnschema'
import Zahnkarten from './components/Zahnkarten'
import Einstellungen from './components/Einstellungen'
import Regler from './components/Regler'
import Dokument from './components/Dokument'
import { AblageKnoepfe, AblageListe, Sperrhinweis } from './components/Ablage'
import { MandantKarte, MandantName } from './components/Mandant'

type Reiter = 'patient' | 'planung' | 'einstellungen'

const REITER: { id: Reiter; label: string }[] = [
  { id: 'patient', label: 'Patient' },
  { id: 'planung', label: 'Planung' },
  { id: 'einstellungen', label: 'Einstellungen' },
]

const hatInhalt = (p: Plan) => Boolean(patientName(p.patient) || Object.keys(p.zaehne).length || p.frei.length)

export default function App() {
  const [einst, setEinst] = useEinstellungen()
  const [plan, setPlan] = usePlan(einst)
  const ablage = useKonsAblage()
  const [reiter, setReiter] = useState<Reiter>('planung')

  const rechnung = useMemo(() => rechnen(plan, einst), [plan, einst])
  const daten = { nummer: plan.nummer, patient: patientName(plan.patient), betrag: rechnung.summe, plan }
  const eintrag = ablage.eintrag(plan.nummer)
  const offen = ungespeichert(plan, eintrag)
  const gesperrt = eintrag?.status === 'freigegeben'

  const sichern = () => { if (offen && !gesperrt && hatInhalt(plan)) ablage.speichern(daten) }
  const neu = () => {
    sichern()
    setPlan(neuerPlan(nummerFormat(einst.naechsteNummer), einst))
    setEinst({ ...einst, naechsteNummer: einst.naechsteNummer + 1 })
    setReiter('patient')
  }
  const oeffnen = (p: Plan) => {
    sichern()
    setPlan(planMigrieren(p, einst))
    setReiter('planung')
  }

  return (
    <>
      <div className="kopfbereich">
        <header className="kopfleiste">
          <div className="marke">
            <div className="logo">PK</div>
            <div>
              <div className="titel">Privat-Kons <MandantName /></div>
              <div className="sub">Füllung, Endo, Vitalerhaltung und mehr – rein nach GOZ</div>
            </div>
          </div>
          <div className="kopf-summe">
            <span>{plan.nummer} · Gesamt</span>
            <b>{euro(rechnung.summe)}</b>
          </div>
          <AblageKnoepfe ablage={ablage} daten={daten} eintrag={eintrag} offen={offen} onNeu={neu} neuText="Neuer Plan" />
        </header>
        {reiter === 'planung' && (
          <fieldset className="sperre" disabled={gesperrt}>
            <Regler plan={plan} setPlan={setPlan} einst={einst} setEinst={setEinst} rechnung={rechnung} />
          </fieldset>
        )}
      </div>

      <div className="arbeitsflaeche">
        <div className="editor">
          <div className="reiter">
            {REITER.map((r, i) => (
              <button key={r.id} className={reiter === r.id ? 'aktiv' : ''} onClick={() => setReiter(r.id)}>
                <span className="schritt">{i + 1}</span>
                {r.label}
              </button>
            ))}
          </div>

          {reiter !== 'einstellungen' && <Sperrhinweis eintrag={eintrag} />}

          {reiter === 'patient' && (
            <>
              <fieldset className="sperre" disabled={gesperrt}>
                <Patient plan={plan} setPlan={setPlan} />
              </fieldset>
              <AblageListe ablage={ablage} aktuell={plan.nummer} onLaden={oeffnen} />
            </>
          )}

          {reiter === 'planung' && (
            <fieldset className="sperre" disabled={gesperrt}>
              <Zahnschema plan={plan} setPlan={setPlan} />
              <Zahnkarten plan={plan} setPlan={setPlan} einst={einst} rechnung={rechnung} />
              {rechnung.hinweise.length > 0 && (
                <ul className="hinweise">{rechnung.hinweise.map((h) => <li key={h}>{h}</li>)}</ul>
              )}
            </fieldset>
          )}

          {reiter === 'einstellungen' && <><MandantKarte /><Einstellungen einst={einst} setEinst={setEinst} /></>}
        </div>

        <div className="vorschau">
          <Dokument plan={plan} einst={einst} rechnung={rechnung} />
        </div>
      </div>
    </>
  )
}

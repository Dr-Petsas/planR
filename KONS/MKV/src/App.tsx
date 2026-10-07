import { useMemo, useState } from 'react'
import { euro, rechnen } from './engine/mkv'
import { neuerPlan, nummerFormat, useEinstellungen, useGespeichert, usePlan } from './store'
import Patient from './components/Patient'
import Zahnschema from './components/Zahnschema'
import Zahntabelle from './components/Zahntabelle'
import Einstellungen from './components/Einstellungen'
import Regler from './components/Regler'
import Vereinbarung from './components/Vereinbarung'

type Reiter = 'patient' | 'planung' | 'einstellungen'

const REITER: { id: Reiter; label: string }[] = [
  { id: 'patient', label: 'Patient' },
  { id: 'planung', label: 'Füllungen' },
  { id: 'einstellungen', label: 'Einstellungen' },
]

export default function App() {
  const [einst, setEinst] = useEinstellungen()
  const [plan, setPlan] = usePlan(einst)
  const gespeichert = useGespeichert()
  const [reiter, setReiter] = useState<Reiter>('planung')

  const rechnung = useMemo(() => rechnen(plan, einst), [plan, einst])

  const speichern = () => gespeichert.speichern(plan, rechnung.mehrkosten)
  const neu = () => {
    speichern()
    setPlan(neuerPlan(nummerFormat(einst.naechsteNummer), einst))
    setEinst({ ...einst, naechsteNummer: einst.naechsteNummer + 1 })
    setReiter('patient')
  }

  return (
    <>
      <div className="kopfbereich">
        <header className="kopfleiste">
          <div className="marke">
            <div className="logo">MKV</div>
            <div>
              <div className="titel">Füllungs-MKV-Planer</div>
              <div className="sub">Mehrkostenvereinbarung nach § 28 Abs. 2 SGB V</div>
            </div>
          </div>
          <div className="kopf-summe">
            <span>Mehrkosten (Patient)</span>
            <b>{euro(rechnung.mehrkosten)}</b>
          </div>
          <div className="aktionen">
            <button className="sekundaer" onClick={speichern}>Speichern</button>
            <button className="primaer" onClick={neu}>Neuer Plan</button>
          </div>
        </header>
        {reiter === 'planung' && <Regler plan={plan} setPlan={setPlan} einst={einst} setEinst={setEinst} rechnung={rechnung} />}
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

          {reiter === 'patient' && (
            <>
              <Patient plan={plan} setPlan={setPlan} />
              {gespeichert.liste.length > 0 && (
                <div className="block">
                  <h3>Gespeicherte Pläne</h3>
                  <table className="preis-tabelle">
                    <tbody>
                      {gespeichert.liste.slice(0, 12).map((e) => (
                        <tr key={e.nummer}>
                          <td className="mono">{e.nummer}</td>
                          <td>{e.patient || '—'}</td>
                          <td className="r mono">{euro(e.betrag)}</td>
                          <td>
                            <button
                              className="klein-btn sekundaer"
                              onClick={() => {
                                const geladen = gespeichert.laden(e.nummer)
                                if (geladen) {
                                  setPlan(geladen)
                                  setReiter('planung')
                                }
                              }}
                            >
                              laden
                            </button>
                          </td>
                          <td><button className="x" onClick={() => gespeichert.loeschen(e.nummer)} title="löschen">×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {reiter === 'planung' && (
            <>
              <Zahnschema plan={plan} setPlan={setPlan} />
              <Zahntabelle plan={plan} setPlan={setPlan} einst={einst} rechnung={rechnung} />
              {rechnung.hinweise.length > 0 && (
                <ul className="hinweise">{rechnung.hinweise.map((h) => <li key={h}>{h}</li>)}</ul>
              )}
            </>
          )}

          {reiter === 'einstellungen' && <Einstellungen einst={einst} setEinst={setEinst} />}
        </div>

        <div className="vorschau">
          <Vereinbarung plan={plan} einst={einst} rechnung={rechnung} />
        </div>
      </div>
    </>
  )
}

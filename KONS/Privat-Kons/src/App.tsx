import { useMemo, useState } from 'react'
import { kalkulieren, euro } from './engine/berechnung'
import { neuerPlan, nummerFormat, useEinstellungen, useGespeichert, usePlan } from './store'
import Patient from './components/Patient'
import Zahnschema from './components/Zahnschema'
import Behandlungstabelle from './components/Behandlungstabelle'
import Leistungen from './components/Leistungen'
import PraxisPreise from './components/PraxisPreise'
import Kostenleiste from './components/Kostenleiste'
import Kostenvoranschlag from './components/Kostenvoranschlag'

type Reiter = 'patient' | 'planung' | 'leistungen' | 'praxis'

const REITER: { id: Reiter; label: string }[] = [
  { id: 'patient', label: 'Patient' },
  { id: 'planung', label: 'Planung' },
  { id: 'leistungen', label: 'Leistungen' },
  { id: 'praxis', label: 'Praxis & Preise' },
]

export default function App() {
  const [einst, setEinst] = useEinstellungen()
  const [plan, setPlan] = usePlan(einst)
  const gespeichert = useGespeichert()
  const [reiter, setReiter] = useState<Reiter>('planung')

  const kalk = useMemo(() => kalkulieren(plan, einst), [plan, einst])

  const neu = () => {
    gespeichert.speichern(plan, kalk.mehrkostenGesamt)
    const nummer = nummerFormat(einst.naechsteNummer)
    setPlan(neuerPlan(nummer, einst))
    setEinst({ ...einst, naechsteNummer: einst.naechsteNummer + 1 })
    setReiter('patient')
  }

  const speichern = () => gespeichert.speichern(plan, kalk.mehrkostenGesamt)

  return (
    <>
      <header className="kopfleiste">
        <div className="marke">
          <div className="logo">MKV</div>
          <div>
            <div className="titel">Kons-MKV-Planer</div>
            <div className="sub">Mehrkostenvereinbarung · konservierende Zahnheilkunde</div>
          </div>
        </div>
        <div className="kopf-summe">
          <span>Mehrkosten (Patient)</span>
          <b>{euro(kalk.mehrkostenGesamt)}</b>
        </div>
        <div className="aktionen">
          <button className="sekundaer" onClick={speichern}>
            Speichern
          </button>
          <button className="sekundaer" onClick={neu}>
            Neuer Plan
          </button>
          <button className="primaer" onClick={() => window.print()}>
            Drucken / PDF
          </button>
        </div>
      </header>

      <div className="arbeitsflaeche">
        <div className="editor">
          {(reiter === 'planung' || reiter === 'leistungen') && <Kostenleiste plan={plan} setPlan={setPlan} kalk={kalk} />}

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
                  <table className="impl-tabelle">
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
                          <td>
                            <button className="x" onClick={() => gespeichert.loeschen(e.nummer)} title="löschen">
                              ×
                            </button>
                          </td>
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
              <Behandlungstabelle plan={plan} setPlan={setPlan} einst={einst} />
            </>
          )}

          {reiter === 'leistungen' && <Leistungen plan={plan} setPlan={setPlan} kalk={kalk} />}

          {reiter === 'praxis' && <PraxisPreise einst={einst} setEinst={setEinst} />}
        </div>

        <div className="vorschau">
          <Kostenvoranschlag plan={plan} einst={einst} kalk={kalk} />
        </div>
      </div>
    </>
  )
}

import type { Angaben, Plan } from '../types'
import { ART_NAME } from '../data/katalog'
import { PatientFelder } from './Stammdaten'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
}

export default function Patient({ plan, setPlan }: Props) {
  const a = plan.angaben
  const setA = (patch: Partial<Angaben>) => setPlan({ ...plan, angaben: { ...a, ...patch } })
  const bruch = a.art === 'kieferbruch'

  return (
    <>
      <div className="block">
        <h3>Versicherte / Versicherter</h3>
        <PatientFelder art="kasse" patient={plan.patient} onChange={(patient) => setPlan({ ...plan, patient })} />
      </div>

      <div className="block">
        <h3>Behandlungsplan</h3>
        <div className="wahl">
          {(Object.keys(ART_NAME) as Angaben['art'][]).map((art) => (
            <button key={art} className={a.art === art ? 'aktiv' : ''} onClick={() => setA({ art })}>{ART_NAME[art]}</button>
          ))}
        </div>
        <div className="formular">
          <label className="feld">
            Plan-Nummer
            <input value={plan.nummer} onChange={(e) => setPlan({ ...plan, nummer: e.target.value })} />
          </label>
          <label className="feld">
            Datum
            <input type="date" value={plan.datum} onChange={(e) => setPlan({ ...plan, datum: e.target.value })} />
          </label>
          {bruch ? (
            <label className="feld breit">
              Ort, Zeit und Ursache sowie Art der Verletzung
              <textarea rows={2} value={a.verletzung} placeholder="z. B. Sturz mit dem Fahrrad am 01.10.2026, Unterkieferfraktur regio 43/44"
                onChange={(e) => setA({ verletzung: e.target.value })} />
            </label>
          ) : (
            <label className="feld breit">
              Anamnese, Befunde, Diagnose
              <textarea rows={2} value={a.befund}
                placeholder={a.art === 'ukps'
                  ? 'z. B. obstruktive Schlafapnoe (G47.31), AHI 22/h laut Polygrafie, CPAP nicht toleriert – Veranlassung Dr. … (Schlafmedizin)'
                  : 'z. B. Myoarthropathie, Bruxismus, Diskusverlagerung'}
                onChange={(e) => setA({ befund: e.target.value })} />
            </label>
          )}
          <label className="feld breit">
            Vorgesehene Behandlung
            <textarea rows={2} value={a.behandlung} onChange={(e) => setA({ behandlung: e.target.value })} />
          </label>
        </div>
        <div className="schalter" style={{ margin: '10px 0' }}>
          <label><input type="checkbox" checked={a.unfall} onChange={(e) => setA({ unfall: e.target.checked })} /> Unfall / Unfallfolgen</label>
          <label><input type="checkbox" checked={a.stationaer} onChange={(e) => setA({ stationaer: e.target.checked })} /> stationäre Behandlung</label>
          {a.art === 'ukps' && (
            <label><input type="checkbox" checked={a.schlafmedizin} onChange={(e) => setA({ schlafmedizin: e.target.checked })} /> Veranlassung Schlafmedizin liegt vor (Vertragsarzt, Zusatzbezeichnung)</label>
          )}
          {a.art === 'kiefergelenk' && (
            <label><input type="checkbox" checked={a.genehmigungsverzicht} onChange={(e) => setA({ genehmigungsverzicht: e.target.checked })} /> Genehmigungsverzicht der Kasse</label>
          )}
        </div>
        {a.stationaer && (
          <div className="formular">
            <label className="feld breit">
              Krankenhaus
              <input value={a.krankenhaus} onChange={(e) => setA({ krankenhaus: e.target.value })} />
            </label>
            <label className="feld">
              von
              <input type="date" value={a.von} onChange={(e) => setA({ von: e.target.value })} />
            </label>
            <label className="feld">
              bis
              <input type="date" value={a.bis} onChange={(e) => setA({ bis: e.target.value })} />
            </label>
          </div>
        )}
        <div className="formular">
          <label className="feld">
            Antragsnummer (eFormular)
            <input value={a.antragsnummer} placeholder="vergibt das PVS" onChange={(e) => setA({ antragsnummer: e.target.value })} />
          </label>
          <label className="feld breit">
            Bemerkung
            <textarea rows={2} value={plan.bemerkung} onChange={(e) => setPlan({ ...plan, bemerkung: e.target.value })} />
          </label>
        </div>
      </div>
    </>
  )
}

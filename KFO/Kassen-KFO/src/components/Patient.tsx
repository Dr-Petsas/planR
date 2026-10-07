import type { Angaben, BehandlungsArt, KigGruppe, Plan, PlanArt, Rechnung } from '../types'
import { BEHANDLUNGSART_NAME, KIG, PLANART_NAME } from '../data/katalog'
import { PatientFelder } from './Stammdaten'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  rechnung: Rechnung
}

export default function Patient({ plan, setPlan, rechnung }: Props) {
  const a = plan.angaben
  const setA = (patch: Partial<Angaben>) => setPlan({ ...plan, angaben: { ...a, ...patch } })
  const feld = (k: keyof Angaben, titel: string, rows = 2, placeholder = '') => (
    <label className="feld breit">
      {titel}
      <textarea rows={rows} value={String(a[k] ?? '')} placeholder={placeholder} onChange={(e) => setA({ [k]: e.target.value } as Partial<Angaben>)} />
    </label>
  )

  return (
    <>
      <div className="block">
        <h3>Versicherte / Versicherter</h3>
        <PatientFelder art="kasse" patient={plan.patient} onChange={(patient) => setPlan({ ...plan, patient })} />
        {rechnung.alter != null && <p className="hilfe">Alter am Plandatum: {rechnung.alter} Jahre</p>}
      </div>

      <div className="block">
        <h3>Kieferorthopädischer Behandlungsplan</h3>
        <div className="wahl">
          {(Object.keys(PLANART_NAME) as PlanArt[]).map((art) => (
            <button key={art} className={a.planArt === art ? 'aktiv' : ''} onClick={() => setA({ planArt: art })}>{PLANART_NAME[art]}</button>
          ))}
        </div>
        <div className="formular">
          <label className="feld">
            Plan-Nummer
            <input value={plan.nummer} onChange={(e) => setPlan({ ...plan, nummer: e.target.value })} />
          </label>
          <label className="feld">
            Datum (Behandlungsbeginn)
            <input type="date" value={plan.datum} onChange={(e) => setPlan({ ...plan, datum: e.target.value })} />
          </label>
          <label className="feld">
            Antragsnummer (eFormular)
            <input value={a.antragsnummer} placeholder="vergibt das PVS" onChange={(e) => setA({ antragsnummer: e.target.value })} />
          </label>
          {a.planArt !== 'plan' && (
            <label className="feld">
              Ursprünglicher Antrag
              <input value={a.bezugsantrag} onChange={(e) => setA({ bezugsantrag: e.target.value })} />
            </label>
          )}
          <label className="feld">
            Voraussichtliche Dauer (Quartale, mit Retention)
            <input type="number" min={1} max={24} value={a.quartale} onChange={(e) => setA({ quartale: Math.max(1, +e.target.value || 1) })} />
          </label>
        </div>
        <label className="feld" style={{ marginTop: 10 }}>
          Art der Behandlung
          <select value={a.behandlungsArt} onChange={(e) => setA({ behandlungsArt: e.target.value as BehandlungsArt })}>
            {(Object.keys(BEHANDLUNGSART_NAME) as BehandlungsArt[]).map((b) => <option key={b} value={b}>{BEHANDLUNGSART_NAME[b]}</option>)}
          </select>
        </label>
        <div className="schalter" style={{ margin: '10px 0' }}>
          <label><input type="checkbox" checked={a.unfall} onChange={(e) => setA({ unfall: e.target.checked })} /> Unfall / Unfallfolgen</label>
          <label><input type="checkbox" checked={a.e34Uk} onChange={(e) => setA({ e34Uk: e.target.checked })} /> E3/E4 in der UK-Front</label>
          <label title="mindestens zwei versicherte Kinder unter 18, gleichzeitig in Behandlung, im gemeinsamen Haushalt">
            <input type="checkbox" checked={a.geschwister} onChange={(e) => setA({ geschwister: e.target.checked })} /> zweites oder weiteres Kind in Behandlung (Eigenanteil 10 %)
          </label>
        </div>
      </div>

      <div className="block">
        <h3>Kieferorthopädische Indikationsgruppe (KIG)</h3>
        <p className="hilfe">
          Aufgezeichnet wird die Fehlstellung mit dem höchsten Behandlungsbedarf, gemessen unmittelbar vor Behandlungsbeginn
          an der größten Einzelzahnabweichung. Kassenleistung sind nur die Grade 3 bis 5 (Anlage 1 KFO-Richtlinie).
        </p>
        <table className="raster">
          <tbody>
            {KIG.map((g) => (
              <tr key={g.gruppe}>
                <td><b>{g.gruppe}</b> {g.name}</td>
                <td>
                  <div className="kig-wahl">
                    {([1, 2, 3, 4, 5] as const).filter((n) => g.grade[n]).map((n) => {
                      const aktiv = a.kigGruppe === g.gruppe && a.kigGrad === n
                      return (
                        <button key={n} className={`${aktiv ? 'aktiv' : ''} ${n < 3 ? 'unter3' : ''}`} title={g.grade[n]}
                          onClick={() => setA(aktiv ? { kigGruppe: '', kigGrad: 0 } : { kigGruppe: g.gruppe as KigGruppe, kigGrad: n })}>
                          {g.gruppe}{n} · {g.grade[n]}
                        </button>
                      )
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="block">
        <h3>Anamnese, Diagnose und Therapie</h3>
        <div className="formular">
          {feld('anamnese', 'Anamnese')}
          {feld('diagnoseOk', 'Diagnose Oberkiefer')}
          {feld('therapieOk', 'Therapie Oberkiefer')}
          {feld('diagnoseUk', 'Diagnose Unterkiefer')}
          {feld('therapieUk', 'Therapie Unterkiefer')}
          {feld('diagnoseBiss', 'Diagnose Bisslage')}
          {feld('therapieBiss', 'Therapie Bisslage')}
          {feld('geraete', 'Verwendete Geräte', 2, 'z. B. Oberkieferplatte mit Dehnschraube, Multiband OK/UK')}
          <label className="feld breit">
            Bemerkung
            <textarea rows={2} value={plan.bemerkung} onChange={(e) => setPlan({ ...plan, bemerkung: e.target.value })} />
          </label>
        </div>
      </div>
    </>
  )
}

import type { DiagnoseErgebnis, Einstellungen, Plan, StreckePosition } from '../types'
import { berechnen, euro, uptPlan } from '../engine/strecke'

const PHASEN = ['Diagnostik', 'AIT', 'BEV', 'CPT', 'UPT', 'Nebenleistung']

export default function StreckeReiter({
  plan,
  setPlan,
  einst,
  diag,
}: {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  diag: DiagnoseErgebnis
}) {
  const { positionen, punkteGesamt, summe } = berechnen(plan, einst, diag)
  const termine = uptPlan(diag.grad)
  const pw = einst.bemaPunktwert

  const gruppen = PHASEN.map((ph) => ({ ph, pos: positionen.filter((p) => p.phase === ph) })).filter((g) => g.pos.length)

  return (
    <div className="karte">
      <h2>Behandlungsstrecke & Abrechnung (BEMA Teil 4)</h2>

      <div className="strecke-optionen">
        <label className="check">
          <input type="checkbox" checked={plan.mitCPT} onChange={(e) => setPlan({ ...plan, mitCPT: e.target.checked })} />
          Chirurgische Therapie (CPT) vorgesehen
        </label>
        <label>
          Einschleifen (108), Sitzungen
          <input
            value={plan.neben.n108 || ''}
            onChange={(e) => setPlan({ ...plan, neben: { ...plan.neben, n108: Math.max(0, Number(e.target.value) || 0) } })}
            inputMode="numeric"
          />
        </label>
        <label>
          PAR-Nachbehandlung (111), Sitzungen
          <input
            value={plan.neben.n111 || ''}
            onChange={(e) => setPlan({ ...plan, neben: { ...plan.neben, n111: Math.max(0, Number(e.target.value) || 0) } })}
            inputMode="numeric"
          />
        </label>
      </div>

      {gruppen.map((g) => (
        <div key={g.ph} className="strecke-gruppe">
          <h3>{g.ph}</h3>
          <table className="tab">
            <thead>
              <tr>
                <th>BEMA</th>
                <th>Leistung</th>
                <th className="r">Anzahl</th>
                <th className="r">Punkte</th>
                <th className="r">Summe Pkt.</th>
                <th className="r">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {g.pos.map((p: StreckePosition, i) => (
                <tr key={i}>
                  <td className="mono">{p.nr}</td>
                  <td>
                    {p.titel}
                    {p.detail ? <span className="pos-detail"> ({p.detail})</span> : null}
                  </td>
                  <td className="r">{p.anzahl}</td>
                  <td className="r">{p.punkteEinzel}</td>
                  <td className="r">{p.punkteGesamt}</td>
                  <td className="r">{euro(p.punkteGesamt * pw)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="strecke-summe">
        <span>
          Punktwert: <b>{euro(pw)}</b> · Punkte gesamt: <b>{punkteGesamt}</b>
        </span>
        <span className="summe-betrag">Gesamt (Kasse): {euro(summe)}</span>
      </div>

      <h3>UPT-Zeitplan (Grad {diag.grad}, zweijähriger Zeitraum)</h3>
      <p className="hinweis">
        Mindestabstände je Grad: A ≥ 10 Monate, B ≥ 5 Monate, C ≥ 3 Monate. UPT g einmalig, frühestens 10 Monate
        nach der ersten UPT. Monatsangaben sind frühestmögliche Termine ab der ersten UPT.
      </p>
      <table className="tab">
        <thead>
          <tr>
            <th>UPT</th>
            <th className="r">ab Monat</th>
            <th>Leistungen</th>
          </tr>
        </thead>
        <tbody>
          {termine.map((t) => (
            <tr key={t.index}>
              <td>{t.label}</td>
              <td className="r">{t.monatAbStart}</td>
              <td className="mono">{t.leistungen.join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

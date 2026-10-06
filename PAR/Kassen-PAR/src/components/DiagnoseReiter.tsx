import type { Diagnose, DiagnoseErgebnis, Plan } from '../types'
import { diagnoseText } from '../engine/diagnose'

export default function DiagnoseReiter({
  plan,
  setPlan,
  ergebnis,
}: {
  plan: Plan
  setPlan: (p: Plan) => void
  ergebnis: DiagnoseErgebnis
}) {
  const d = plan.diagnose
  const setD = (patch: Partial<Diagnose>) => setPlan({ ...plan, diagnose: { ...d, ...patch } })
  const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(v)))

  return (
    <div className="karte">
      <h2>Diagnose – Staging & Grading</h2>
      <p className="hinweis">
        Staging nach interdentalem Attachmentverlust und Komplexität, Grading nach röntgenologischem
        Knochenabbau (% der Wurzellänge) geteilt durch das Patientenalter. Raucher und Diabetes heben das Grading.
      </p>

      <div className="felder">
        <label>
          Alter (Jahre)
          <input value={d.alter || ''} onChange={(e) => setD({ alter: num(e.target.value) })} inputMode="numeric" />
        </label>
        <label>
          Max. Knochenabbau (% Wurzellänge)
          <input
            value={d.knochenabbauProzent || ''}
            onChange={(e) => setD({ knochenabbauProzent: num(e.target.value) })}
            inputMode="numeric"
          />
        </label>
        <label>
          Zahn mit max. Knochenabbau
          <input value={d.knochenabbauZahn} onChange={(e) => setD({ knochenabbauZahn: e.target.value })} />
        </label>
        <label>
          Max. interdentaler CAL (mm)
          <input value={d.calMax || ''} onChange={(e) => setD({ calMax: num(e.target.value) })} inputMode="numeric" />
        </label>
        <label>
          Zahnverlust durch Parodontitis
          <input
            value={d.zahnverlustPar || ''}
            onChange={(e) => setD({ zahnverlustPar: num(e.target.value) })}
            inputMode="numeric"
          />
        </label>
        <label>
          Raucherstatus
          <select value={d.raucher} onChange={(e) => setD({ raucher: e.target.value as Diagnose['raucher'] })}>
            <option value="nein">Nichtraucher</option>
            <option value="unter10">Raucher &lt; 10 Zig./Tag</option>
            <option value="ab10">Raucher ≥ 10 Zig./Tag</option>
          </select>
        </label>
        <label>
          Diabetes
          <select value={d.diabetes} onChange={(e) => setD({ diabetes: e.target.value as Diagnose['diabetes'] })}>
            <option value="nein">kein Diabetes</option>
            <option value="hba1c_unter7">Diabetes HbA1c &lt; 7,0 %</option>
            <option value="hba1c_ab7">Diabetes HbA1c ≥ 7,0 %</option>
          </select>
        </label>
      </div>

      <h3>Komplexität (hebt das Stadium)</h3>
      <div className="checks">
        <label className="check">
          <input type="checkbox" checked={d.st6plus} onChange={(e) => setD({ st6plus: e.target.checked })} />
          ST ≥ 6 mm vorhanden
        </label>
        <label className="check">
          <input type="checkbox" checked={d.vertikalerKA3} onChange={(e) => setD({ vertikalerKA3: e.target.checked })} />
          vertikaler Knochenabbau ≥ 3 mm
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={d.furkationII_III}
            onChange={(e) => setD({ furkationII_III: e.target.checked })}
          />
          Furkationsbefall Grad II/III
        </label>
        <label className="check">
          <input type="checkbox" checked={d.komplexeReha} onChange={(e) => setD({ komplexeReha: e.target.checked })} />
          komplexe Rehabilitation nötig (Stadium IV)
        </label>
      </div>

      <div className="diagnose-ergebnis">
        <div className="de-haupt">{diagnoseText(ergebnis)}</div>
        <div className="de-reihe">
          <span className="de-badge">Stadium {['', 'I', 'II', 'III', 'IV'][ergebnis.stadium]}</span>
          <span className="de-badge">{ergebnis.ausmass}</span>
          <span className="de-badge grad">Grad {ergebnis.grad}</span>
          <span className="de-anteil">
            {ergebnis.befalleneZaehne}/{ergebnis.gesamtZaehne} Zähne betroffen ({ergebnis.anteilProzent} %)
          </span>
        </div>
        <div className="de-basis">{ergebnis.gradBasis}</div>
        <ul className="de-hinweise">
          {ergebnis.hinweise.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

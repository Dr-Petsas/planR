import type { Aufgabe as AufgabeT, KriteriumRegelbiss, KriteriumUmformung, Plan, Rechnung } from '../types'
import { KRITERIEN_REGELBISS, KRITERIEN_UMFORMUNG, regelbissNr, umformungNr, UMFANG } from '../data/katalog'
import { euro } from '../engine/kfo'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  rechnung: Rechnung
}

function Kriterien<K extends string>({ liste, gewaehlt, onChange }: { liste: Record<K, string>; gewaehlt: K[]; onChange: (k: K[]) => void }) {
  return (
    <div className="kriterien">
      {(Object.keys(liste) as K[]).map((k) => (
        <label key={k} className="chk">
          <input type="checkbox" checked={gewaehlt.includes(k)}
            onChange={(e) => onChange(e.target.checked ? [...gewaehlt, k] : gewaehlt.filter((x) => x !== k))} />
          <b>{k})</b> {liste[k]}
        </label>
      ))}
    </div>
  )
}

export default function Aufgabe({ plan, setPlan, rechnung }: Props) {
  const a = plan.aufgabe
  const setA = (patch: Partial<AufgabeT>) => setPlan({ ...plan, aufgabe: { ...a, ...patch } })
  const ergebnis = (nr: string) => <span className="umfang">→ GOZ {nr} · {UMFANG[nr]}</span>

  return (
    <div className="block">
      <h3>Behandlungsaufgabe <small className="grau">GOZ 6030–6090 · Zeitraum bis zu vier Jahre</small></h3>
      <p className="hilfe">
        Der Umfang ergibt sich aus den Kriterien der GOZ: Umformung mittel ab drei, hoch ab vier der Kriterien a–e;
        Einstellung in den Regelbiss mittel ab einem, hoch ab zwei der Kriterien a–c. Umformung und Einstellung dürfen
        nebeneinander stehen.
      </p>

      <div className="aufgabe">
        <div>
          <label className="chk kopf"><input type="checkbox" checked={a.umformungOk} onChange={(e) => setA({ umformungOk: e.target.checked })} /> Umformung Oberkiefer</label>
          {a.umformungOk && <>{ergebnis(umformungNr(a.kriterienOk))}<Kriterien<KriteriumUmformung> liste={KRITERIEN_UMFORMUNG} gewaehlt={a.kriterienOk} onChange={(kriterienOk) => setA({ kriterienOk })} /></>}
        </div>
        <div>
          <label className="chk kopf"><input type="checkbox" checked={a.umformungUk} onChange={(e) => setA({ umformungUk: e.target.checked })} /> Umformung Unterkiefer</label>
          {a.umformungUk && <>{ergebnis(umformungNr(a.kriterienUk))}<Kriterien<KriteriumUmformung> liste={KRITERIEN_UMFORMUNG} gewaehlt={a.kriterienUk} onChange={(kriterienUk) => setA({ kriterienUk })} /></>}
        </div>
        <div>
          <label className="chk kopf"><input type="checkbox" checked={a.regelbiss} onChange={(e) => setA({ regelbiss: e.target.checked })} /> Einstellung in den Regelbiss (Wachstumsphase)</label>
          {a.regelbiss && <>{ergebnis(regelbissNr(a.kriterienRegelbiss))}<Kriterien<KriteriumRegelbiss> liste={KRITERIEN_REGELBISS} gewaehlt={a.kriterienRegelbiss} onChange={(kriterienRegelbiss) => setA({ kriterienRegelbiss })} /></>}
        </div>
        <div>
          <span className="chk kopf">Alveolärer Ausgleich nach abgeschlossenem Wachstum (GOZ 6090, je Kiefer)</span>
          <div className="schalter">
            <label className="chk"><input type="checkbox" checked={a.alveolaerOk} onChange={(e) => setA({ alveolaerOk: e.target.checked })} /> Oberkiefer</label>
            <label className="chk"><input type="checkbox" checked={a.alveolaerUk} onChange={(e) => setA({ alveolaerUk: e.target.checked })} /> Unterkiefer</label>
          </div>
        </div>
      </div>

      <div className="formular" style={{ marginTop: 12 }}>
        <label className="feld">
          Geplante Dauer (Quartale)
          <input type="number" min={1} max={16} value={plan.quartale} onChange={(e) => setPlan({ ...plan, quartale: Math.max(1, +e.target.value || 1) })} />
        </label>
        <div className="feld">
          Behandlungsaufgabe
          <span className="wert">{euro(rechnung.summeAufgabe)}</span>
        </div>
        <div className="feld">
          Abschlag je Quartal
          <span className="wert">{rechnung.aufgabe.length ? euro(rechnung.abschlag) : '—'}</span>
        </div>
      </div>
    </div>
  )
}

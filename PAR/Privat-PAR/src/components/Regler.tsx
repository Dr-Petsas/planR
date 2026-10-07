import type { Einstellungen, Plan, Rechnung } from '../types'
import { euro, faktorText } from '../engine/par'
import { GOZ_HOECHSTSATZ, GOZ_SCHWELLE, GOZ_VEREINBARUNG_MAX } from '../engine/listen'
import { VARIANTE_NAME } from '../data/katalog'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  setEinst: (e: Einstellungen) => void
  rechnung: Rechnung
}

const faktorStufe = (f: number) =>
  f > GOZ_HOECHSTSATZ ? 'über 3,5 – Vereinbarung § 2 GOZ' : f > GOZ_SCHWELLE ? 'über 2,3 – Begründung nötig' : 'Regelspanne bis 2,3'

export default function Regler({ plan, setPlan, einst, setEinst, rechnung }: Props) {
  const istVorgabe = einst.faktor === plan.faktor && einst.variante === plan.variante
  const s = rechnung.summen

  return (
    <div className="reglerleiste">
      <div className="kl-block kl-fuellung">
        <h4>Honorar <span>GOZ Abschnitt E und Analog</span></h4>
        <label className="regler">
          <span className="regler-kopf"><b>Faktor {faktorText(plan.faktor)}</b> <small>{faktorStufe(plan.faktor)}</small></span>
          <input type="range" min={1} max={GOZ_VEREINBARUNG_MAX} step={0.1} value={plan.faktor} onChange={(e) => setPlan({ ...plan, faktor: +e.target.value })} />
        </label>
        <p className="regler-info">{VARIANTE_NAME[plan.variante]} · {rechnung.ein} ein-, {rechnung.mehr} mehrwurzelig</p>
      </div>

      <div className="kl-block kl-einlage">
        <h4>Therapie <span>AIT bis CPT</span></h4>
        <dl className="kl-werte">
          <dt>Diagnostik, ATG, MHU</dt><dd>{euro(s.diagnostik + s.atg)}</dd>
          <dt>AIT und BEV</dt><dd>{euro(s.ait + s.bev)}</dd>
          <dt>CPT</dt><dd>{euro(s.cpt)}</dd>
          <dt>UPT ({rechnung.uptSitzungen} Sitzungen)</dt><dd>{euro(s.upt)}</dd>
        </dl>
      </div>

      <div className="kl-block kl-summenblock">
        <h4>Heil- und Kostenplan <span>{rechnung.zeilen.length} Positionen</span></h4>
        <dl className="kl-werte">
          <dt>Honorar (GOZ)</dt><dd>{euro(rechnung.honorar)}</dd>
          <dt>Material</dt><dd>{euro(rechnung.material)}</dd>
          <dt className="kl-summe">Gesamt</dt><dd className="kl-summe">{euro(rechnung.gesamt)}</dd>
        </dl>
        <button className="klein-btn sekundaer" disabled={istVorgabe} onClick={() => setEinst({ ...einst, faktor: plan.faktor, variante: plan.variante })}
          title="Faktor und Analogbewertung in den Einstellungen speichern">
          {istVorgabe ? 'entspricht der Praxisvorgabe' : 'als Praxisvorgabe speichern'}
        </button>
      </div>
    </div>
  )
}

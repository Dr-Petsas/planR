import type { Einstellungen, Labor, Plan, Rechnung } from '../types'
import { euro, pwText } from '../engine/kfo'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  setEinst: (e: Einstellungen) => void
  rechnung: Rechnung
}

const LABOR_NAME: Record<Labor, string> = { praxis: 'Praxislabor', gewerbe: 'Gewerbliches Labor' }

export default function Regler({ plan, setPlan, einst, setEinst, rechnung }: Props) {
  const istVorgabe = einst.labor === plan.labor
  const quartale = Math.max(1, plan.angaben.quartale)

  return (
    <div className="reglerleiste">
      <div className="kl-block kl-fuellung">
        <h4>Punktwert <span>BEMA Teil 3</span></h4>
        <dl className="kl-werte">
          <dt>KFO</dt><dd>{pwText(rechnung.punktwertKfo)} €</dd>
          <dt>KCH (01k, 12{einst.roentgenKfo ? '' : ', Röntgen'})</dt><dd>{pwText(rechnung.punktwertKch)} €</dd>
        </dl>
        <p className="regler-info">{rechnung.punktwertHinweis}</p>
      </div>

      <div className="kl-block kl-einlage">
        <h4>Labor <span>BEL II</span></h4>
        <div className="wahl">
          {(Object.keys(LABOR_NAME) as Labor[]).map((l) => (
            <button key={l} className={plan.labor === l ? 'aktiv' : ''} onClick={() => setPlan({ ...plan, labor: l })}>{LABOR_NAME[l]}</button>
          ))}
        </div>
        <p className="regler-info">{rechnung.belListe}</p>
      </div>

      <div className="kl-block kl-summenblock">
        <h4>Behandlungsplan <span>{quartale} Quartale</span></h4>
        <dl className="kl-werte">
          <dt>Honorar</dt><dd>{euro(rechnung.summeHonorar)}</dd>
          <dt>Labor und Material</dt><dd>{euro(rechnung.summeLabor + rechnung.summeMaterial)}</dd>
          <dt className="kl-summe">Gesamtkosten</dt><dd className="kl-summe">{euro(rechnung.gesamt)}</dd>
          <dt>Eigenanteil {rechnung.eigenanteilSatz} %</dt><dd>{euro(rechnung.eigenanteil)}</dd>
          {rechnung.privat.length > 0 && <><dt>Mehr-/Zusatzleistungen</dt><dd>{euro(rechnung.privatGesamt)}</dd></>}
        </dl>
        <button className="klein-btn sekundaer" disabled={istVorgabe} onClick={() => setEinst({ ...einst, labor: plan.labor })}
          title="Laborart in den Einstellungen speichern">
          {istVorgabe ? 'entspricht der Praxisvorgabe' : 'als Praxisvorgabe speichern'}
        </button>
      </div>
    </div>
  )
}

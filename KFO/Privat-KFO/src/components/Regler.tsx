import type { Einstellungen, Plan, Rechnung, Regler as ReglerT } from '../types'
import { euro, faktorText } from '../engine/kfo'
import { GOZ_HOECHSTSATZ, GOZ_SCHWELLE, GOZ_VEREINBARUNG_MAX, ROE_HOECHSTSATZ, ROE_SCHWELLE } from '../engine/listen'
import { laborKlasseName } from '../data/katalog'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  setEinst: (e: Einstellungen) => void
  rechnung: Rechnung
}

const faktorStufe = (f: number) =>
  f > GOZ_HOECHSTSATZ ? 'über 3,5 – Vereinbarung § 2 GOZ' : f > GOZ_SCHWELLE ? 'über 2,3 – Begründung nötig' : 'Regelspanne bis 2,3'
const roeStufe = (f: number) => (f > ROE_SCHWELLE ? 'über 1,8 – Begründung nötig' : 'Regelspanne bis 1,8')

export default function Regler({ plan, setPlan, einst, setEinst, rechnung }: Props) {
  const r = plan.regler
  const setR = (patch: Partial<ReglerT>) => setPlan({ ...plan, regler: { ...r, ...patch } })
  const istVorgabe = einst.kfoFaktor === r.kfoFaktor && einst.faktor === r.faktor && einst.roeFaktor === r.roeFaktor

  return (
    <div className="reglerleiste">
      <div className="kl-block kl-fuellung">
        <h4>Honorar <span>GOZ Abschnitt G · übrige · GOÄ-Röntgen</span></h4>
        <label className="regler">
          <span className="regler-kopf"><b>KFO {faktorText(r.kfoFaktor)}</b> <small>{faktorStufe(r.kfoFaktor)}</small></span>
          <input type="range" min={1} max={GOZ_VEREINBARUNG_MAX} step={0.1} value={r.kfoFaktor} onChange={(e) => setR({ kfoFaktor: +e.target.value })} />
        </label>
        <label className="regler">
          <span className="regler-kopf"><b>Übrige {faktorText(r.faktor)}</b> <small>{faktorStufe(r.faktor)}</small></span>
          <input type="range" min={1} max={GOZ_VEREINBARUNG_MAX} step={0.1} value={r.faktor} onChange={(e) => setR({ faktor: +e.target.value })} />
        </label>
        <label className="regler">
          <span className="regler-kopf"><b>Röntgen {faktorText(r.roeFaktor)}</b> <small>{roeStufe(r.roeFaktor)} · höchstens 2,5</small></span>
          <input type="range" min={1} max={ROE_HOECHSTSATZ} step={0.1} value={r.roeFaktor} onChange={(e) => setR({ roeFaktor: +e.target.value })} />
        </label>
      </div>

      <div className="kl-block kl-einlage">
        <h4>Labor <span>§ 9 GOZ</span></h4>
        <label className="regler">
          <span className="regler-kopf"><b>Preisstufe {laborKlasseName(r.laborKlasse)}</b> <small>−15 % · Liste · +20 %</small></span>
          <input type="range" min={0} max={2} step={1} value={r.laborKlasse} onChange={(e) => setR({ laborKlasse: +e.target.value })} />
        </label>
        <label className="chk">
          <input type="checkbox" checked={plan.digitalRoentgen} onChange={(e) => setPlan({ ...plan, digitalRoentgen: e.target.checked })} />
          digitales Röntgen (Zuschlag GOÄ 5298, nicht zur OPG)
        </label>
        <p className="regler-info">Preisstufe gilt für Listen- und Praxispreise; in der Zeile eingetragene Preise bleiben fest.</p>
      </div>

      <div className="kl-block kl-summenblock">
        <h4>Heil- und Kostenplan <span>{plan.quartale} Quartale</span></h4>
        <dl className="kl-werte">
          <dt>Behandlungsaufgabe</dt><dd>{euro(rechnung.summeAufgabe)}</dd>
          <dt>Einzelleistungen</dt><dd>{euro(rechnung.summeHonorar - rechnung.summeAufgabe)}</dd>
          <dt>Labor und Material</dt><dd>{euro(rechnung.summeLabor)}</dd>
          {rechnung.summeMehr > 0 && <><dt>Materialmehrkosten</dt><dd>{euro(rechnung.summeMehr)}</dd></>}
          <dt className="kl-summe">Gesamt</dt><dd className="kl-summe">{euro(rechnung.gesamt)}</dd>
        </dl>
        <button className="klein-btn sekundaer" disabled={istVorgabe} onClick={() => setEinst({ ...einst, kfoFaktor: r.kfoFaktor, faktor: r.faktor, roeFaktor: r.roeFaktor })}
          title="Faktoren in den Einstellungen speichern">
          {istVorgabe ? 'entspricht der Praxisvorgabe' : 'als Praxisvorgabe speichern'}
        </button>
      </div>
    </div>
  )
}

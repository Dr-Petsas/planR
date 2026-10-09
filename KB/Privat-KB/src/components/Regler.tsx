import type { Abformung, Einstellungen, Plan, Rechnung, Regler as ReglerT } from '../types'
import { abformungAnwenden, euro, faktorText, laborXmlUebernehmen } from '../engine/kb'
import LaborXmlKnopf from './LaborXmlKnopf'

export const ABFORMUNG_NAME: Record<Abformung, string> = { abdruck: 'Abdruck', scan: 'Intraoralscan' }
import { GOZ_HOECHSTSATZ, GOZ_SCHWELLE, GOZ_VEREINBARUNG_MAX } from '../engine/listen'
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

export default function Regler({ plan, setPlan, einst, setEinst, rechnung }: Props) {
  const r = plan.regler
  const setR = (patch: Partial<ReglerT>) => setPlan({ ...plan, regler: { ...r, ...patch } })
  const istVorgabe = einst.faktor === r.faktor && einst.faFaktor === r.faFaktor

  return (
    <div className="reglerleiste">
      <div className="kl-block kl-fuellung">
        <h4>Schienen und Provisorien <span>GOZ Abschnitt H</span></h4>
        <label className="regler">
          <span className="regler-kopf"><b>Faktor {faktorText(r.faktor)}</b> <small>{faktorStufe(r.faktor)}</small></span>
          <input type="range" min={1} max={GOZ_VEREINBARUNG_MAX} step={0.1} value={r.faktor} onChange={(e) => setR({ faktor: +e.target.value })} />
        </label>
        <label className="regler">
          <span className="regler-kopf"><b>Funktionsanalyse {faktorText(r.faFaktor)}</b> <small>{faktorStufe(r.faFaktor)}</small></span>
          <input type="range" min={1} max={GOZ_VEREINBARUNG_MAX} step={0.1} value={r.faFaktor} onChange={(e) => setR({ faFaktor: +e.target.value })} />
        </label>
      </div>

      <div className="kl-block kl-einlage">
        <h4>Labor <span>BEB, § 9 GOZ</span></h4>
        <label className="regler">
          <span className="regler-kopf"><b>Preisstufe {laborKlasseName(r.laborKlasse)}</b> <small>−15 % · Liste · +20 %</small></span>
          <input type="range" min={0} max={2} step={1} value={r.laborKlasse} onChange={(e) => setR({ laborKlasse: +e.target.value })} />
        </label>
        <p className="regler-info">Gilt für Listen- und Praxispreise; in der Zeile eingetragene und eingelesene Preise bleiben fest.</p>
        <input className="text-feld" value={plan.fremdlabor.name} placeholder="Fremdlabor (Name)"
          onChange={(e) => setPlan({ ...plan, fremdlabor: { ...plan.fremdlabor, name: e.target.value } })} />
        <LaborXmlKnopf uebernehmen={(x, datei) => {
          const r = laborXmlUebernehmen(plan, x, datei)
          setPlan(r.plan)
          return r.meldungen
        }} />
        {plan.fremdlabor.import && (
          <p className="regler-info">
            XML {plan.fremdlabor.import.datei}: {euro(plan.fremdlabor.import.netto)} netto{' '}
            <button className="link-btn" onClick={() => setPlan({ ...plan, fremdlabor: { ...plan.fremdlabor, import: undefined } })}>Bezug lösen</button>
          </p>
        )}
      </div>

      <div className="kl-block kl-einlage">
        <h4>Abformung <span>Laborweg</span></h4>
        <div className="wahl">
          {(Object.keys(ABFORMUNG_NAME) as Abformung[]).map((a) => (
            <button key={a} className={plan.abformung === a ? 'aktiv' : ''}
              onClick={() => plan.abformung !== a && setPlan({ ...plan, abformung: a, positionen: abformungAnwenden(plan.positionen, a) })}>
              {ABFORMUNG_NAME[a]}
            </button>
          ))}
        </div>
        <p className="regler-info">
          {plan.abformung === 'scan'
            ? 'GOZ 0065 statt 0060, gedruckte Modelle (BEB 0009) statt Gips, kein Doublieren, Versand bei Datenlieferung.'
            : 'Konventionell: GOZ 0060, Gipsmodelle, Versand je Versandgang.'}
        </p>
      </div>

      <div className="kl-block kl-summenblock">
        <h4>Kostenvoranschlag <span>{plan.positionen.length} Position{plan.positionen.length === 1 ? '' : 'en'}</span></h4>
        <dl className="kl-werte">
          <dt>Honorar (GOZ)</dt><dd>{euro(rechnung.summeHonorar)}</dd>
          <dt>Labor und Material</dt><dd>{euro(rechnung.summeLabor)}</dd>
          <dt className="kl-summe">Gesamt</dt><dd className="kl-summe">{euro(rechnung.gesamt)}</dd>
        </dl>
        <button className="klein-btn sekundaer" disabled={istVorgabe} onClick={() => setEinst({ ...einst, faktor: r.faktor, faFaktor: r.faFaktor })}
          title="Faktoren in den Einstellungen speichern">
          {istVorgabe ? 'entspricht der Praxisvorgabe' : 'als Praxisvorgabe speichern'}
        </button>
      </div>
    </div>
  )
}

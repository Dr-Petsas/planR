import type { Abformung, Einstellungen, Labor, Plan, Rechnung } from '../types'
import { abformungAnwenden, euro, laborXmlUebernehmen, pwText } from '../engine/kb'
import LaborXmlKnopf from './LaborXmlKnopf'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  setEinst: (e: Einstellungen) => void
  rechnung: Rechnung
}

export const LABOR_NAME: Record<Labor, string> = { praxis: 'Eigenlabor', gewerbe: 'Fremdlabor' }
export const ABFORMUNG_NAME: Record<Abformung, string> = { abdruck: 'Abdruck', scan: 'Intraoralscan' }

export default function Regler({ plan, setPlan, einst, setEinst, rechnung }: Props) {
  const istVorgabe = einst.labor === plan.labor && (plan.labor === 'praxis' || einst.fremdlaborName === plan.fremdlabor.name)
  const imp = plan.fremdlabor.import

  return (
    <div className="reglerleiste">
      <div className="kl-block kl-fuellung">
        <h4>Punktwert <span>BEMA Teil 2</span></h4>
        <dl className="kl-werte">
          <dt>KB</dt><dd>{pwText(rechnung.punktwertKb)} €</dd>
          <dt>KCH (Kieferbruch)</dt><dd>{pwText(rechnung.punktwertKch)} €</dd>
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
        {plan.labor === 'gewerbe' && (
          <input className="text-feld" value={plan.fremdlabor.name} placeholder="Name des Fremdlabors"
            onChange={(e) => setPlan({ ...plan, fremdlabor: { ...plan.fremdlabor, name: e.target.value } })} />
        )}
        <p className="regler-info">{rechnung.belListe}{plan.labor === 'gewerbe' ? ' – Höchstpreise gewerbliches Labor' : ' – Preise Praxislabor'}</p>
        <LaborXmlKnopf uebernehmen={(x, datei) => {
          const r = laborXmlUebernehmen(plan, x, datei)
          setPlan(r.plan)
          return r.meldungen
        }} />
        {imp && (
          <p className="regler-info">
            XML {imp.datei}: {euro(imp.netto)} netto · eingelesen {new Date(imp.eingelesen).toLocaleDateString('de-DE')}{' '}
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
            ? 'Daten gehen digital ans Labor: gedruckte Modelle statt Gips (Privatanteil, nicht in der BEL II), kein Doublieren, kein individueller Löffel, keine Abformpauschale.'
            : 'Konventionell: Gipsmodelle (BEL 001 0/001 5) und Abformpauschale.'}
        </p>
      </div>

      <div className="kl-block kl-summenblock">
        <h4>Behandlungsplan <span>{plan.positionen.length} Position{plan.positionen.length === 1 ? '' : 'en'}</span></h4>
        <dl className="kl-werte">
          <dt>Honorar</dt><dd>{euro(rechnung.summeHonorar)}</dd>
          <dt>Labor</dt><dd>{euro(rechnung.summeLabor)}</dd>
          <dt>Material</dt><dd>{euro(rechnung.summeMaterial)}</dd>
          <dt className="kl-summe">Kassenanteil</dt><dd className="kl-summe">{euro(rechnung.gesamt)}</dd>
          {rechnung.summePrivat > 0 && <><dt>Privatanteil Labor</dt><dd>{euro(rechnung.summePrivat)}</dd></>}
        </dl>
        <button className="klein-btn sekundaer" disabled={istVorgabe}
          onClick={() => setEinst({ ...einst, labor: plan.labor, fremdlaborName: plan.labor === 'gewerbe' ? plan.fremdlabor.name : einst.fremdlaborName })}
          title="Laborart und Fremdlabor in den Einstellungen speichern">
          {istVorgabe ? 'entspricht der Praxisvorgabe' : 'als Praxisvorgabe speichern'}
        </button>
      </div>
    </div>
  )
}

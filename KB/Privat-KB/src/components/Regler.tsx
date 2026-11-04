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
  f > GOZ_HOECHSTSATZ ? { text: '§ 2', klasse: 'rot', titel: 'über 3,5 – Vereinbarung nach § 2 GOZ' }
    : f > GOZ_SCHWELLE ? { text: 'Begr.', klasse: 'warn', titel: 'über 2,3 – schriftliche Begründung nötig (§ 10 Abs. 3 GOZ)' }
      : { text: 'Regel', klasse: '', titel: 'Regelspanne bis 2,3' }

function FaktorRegler({ name, wert, setzen }: { name: string; wert: number; setzen: (f: number) => void }) {
  const s = faktorStufe(wert)
  return (
    <label className="kregler" title={s.titel}>
      <span className="kregler-name">{name} <b>{faktorText(wert)}</b></span>
      <input type="range" min={1} max={GOZ_VEREINBARUNG_MAX} step={0.1} value={wert} onChange={(e) => setzen(+e.target.value)} />
      <span className={`stufe ${s.klasse}`}>{s.text}</span>
    </label>
  )
}

export default function Regler({ plan, setPlan, einst, setEinst, rechnung }: Props) {
  const r = plan.regler
  const setR = (patch: Partial<ReglerT>) => setPlan({ ...plan, regler: { ...r, ...patch } })
  const istVorgabe = einst.faktor === r.faktor && einst.faFaktor === r.faFaktor

  return (
    <div className="reglerleiste">
      <div className="kl-block kl-fuellung">
        <FaktorRegler name="Schiene/Prov." wert={r.faktor} setzen={(faktor) => setR({ faktor })} />
        <FaktorRegler name="Funktion" wert={r.faFaktor} setzen={(faFaktor) => setR({ faFaktor })} />
      </div>

      <div className="kl-block kl-einlage">
        <label className="kregler" title="Gilt für Listen- und Praxispreise; in der Zeile eingetragene und eingelesene Preise bleiben fest. −15 % · Liste · +20 %">
          <span className="kregler-name">Labor <b>{laborKlasseName(r.laborKlasse)}</b></span>
          <input type="range" min={0} max={2} step={1} value={r.laborKlasse} onChange={(e) => setR({ laborKlasse: +e.target.value })} />
        </label>
        <div className="kzeile">
          <input className="text-feld" value={plan.fremdlabor.name} placeholder="Fremdlabor"
            onChange={(e) => setPlan({ ...plan, fremdlabor: { ...plan.fremdlabor, name: e.target.value } })} />
          <LaborXmlKnopf uebernehmen={(x, datei) => {
            const r = laborXmlUebernehmen(plan, x, datei)
            setPlan(r.plan)
            return r.meldungen
          }} />
          {plan.fremdlabor.import && (
            <button className="link-btn" title={`XML ${plan.fremdlabor.import.datei}: ${euro(plan.fremdlabor.import.netto)} netto – Bezug lösen`}
              onClick={() => setPlan({ ...plan, fremdlabor: { ...plan.fremdlabor, import: undefined } })}>lösen</button>
          )}
        </div>
      </div>

      <div className="kl-block kl-einlage">
        <div className="wahl" title={plan.abformung === 'scan'
          ? 'GOZ 0065 statt 0060, gedruckte Modelle (BEB 0009) statt Gips, kein Doublieren, Versand bei Datenlieferung.'
          : 'Konventionell: GOZ 0060, Gipsmodelle, Versand je Versandgang.'}>
          {(Object.keys(ABFORMUNG_NAME) as Abformung[]).map((a) => (
            <button key={a} className={plan.abformung === a ? 'aktiv' : ''}
              onClick={() => plan.abformung !== a && setPlan({ ...plan, abformung: a, positionen: abformungAnwenden(plan.positionen, a) })}>
              {ABFORMUNG_NAME[a]}
            </button>
          ))}
        </div>
        <button className="klein-btn sekundaer" disabled={istVorgabe} onClick={() => setEinst({ ...einst, faktor: r.faktor, faFaktor: r.faFaktor })}
          title="Faktoren in den Einstellungen speichern">
          {istVorgabe ? 'Praxisvorgabe' : 'als Vorgabe speichern'}
        </button>
      </div>

      <div className="kl-block kl-summenblock">
        <dl className="kl-werte">
          <dt>Honorar</dt><dd>{euro(rechnung.summeHonorar)}</dd>
          <dt>Labor{rechnung.mwst > 0 ? ` + ${rechnung.mwstSatz} % MwSt.` : ''}</dt><dd>{euro(rechnung.summeLabor + rechnung.mwst)}</dd>
        </dl>
      </div>
    </div>
  )
}

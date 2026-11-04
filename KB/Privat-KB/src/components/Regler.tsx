import type { Abformung, Einstellungen, Plan, Rechnung, Regler as ReglerT, Thema } from '../types'
import { abformungAnwenden, euro, faktorText, laborXmlUebernehmen, umfangAnwenden, vorlageAnwenden } from '../engine/kb'
import LaborXmlKnopf from './LaborXmlKnopf'
import { goaeText, GOZ_HOECHSTSATZ, GOZ_SCHWELLE, GOZ_VEREINBARUNG_MAX, gozText } from '../engine/listen'
import { LABOR_KLASSE_FAKTOR, LABOR_KLASSE_NAMEN, laborKlasseName, THEMEN, VORLAGEN } from '../data/katalog'

export const ABFORMUNG_NAME: Record<Abformung, string> = { abdruck: 'Abdruck', scan: 'Intraoralscan' }

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
  const begleit = plan.positionen.filter((p) => p.umfang)
  const begleitNr = (p: Plan['positionen'][number]) => (p.ebene === 'GOAE' ? `Ä${p.nr}` : `${p.nr}${p.anzahl > 1 ? `×${p.anzahl}` : ''}`)

  const themaWaehlen = (t: Thema) => {
    const thema = plan.thema === t ? undefined : t
    const th = THEMEN.find((x) => x.id === thema)
    const eigene = plan.positionen.filter((p) => !p.umfang)
    let positionen = eigene
    let vorlagen = plan.vorlagen
    if (th && !eigene.length) {
      positionen = th.vorlagen.reduce((pos, id) => vorlageAnwenden(pos, VORLAGEN.find((v) => v.id === id)?.pos ?? [], einst), eigene)
      if (plan.abformung === 'scan') positionen = abformungAnwenden(positionen, 'scan')
      vorlagen = th.vorlagen
    }
    const diagnose = th && (!plan.diagnose.trim() || THEMEN.some((x) => x.diagnose === plan.diagnose)) ? th.diagnose : plan.diagnose
    setPlan({ ...plan, thema, diagnose, vorlagen, positionen: umfangAnwenden(positionen, r.faktor, thema) })
  }

  return (
    <div className="reglerleiste">
      <div className="kl-block kl-fuellung">
        <div className="wahl themenwahl" title="Thema wählen, dann den Regler nach rechts schieben: mehr Funktionsdiagnostik, Röntgen und höhere Faktoren. Bei leerem Plan kommt der übliche Grundplan dazu.">
          <span className="grau">Thema</span>
          {THEMEN.map((t) => (
            <button key={t.id} className={plan.thema === t.id ? 'aktiv' : ''} aria-pressed={plan.thema === t.id} onClick={() => themaWaehlen(t.id)}>{t.titel}</button>
          ))}
        </div>
        <FaktorRegler name="Umfang · Faktor" wert={r.faktor}
          setzen={(f) => setPlan({ ...plan, regler: { ...r, faktor: f, faFaktor: f }, positionen: umfangAnwenden(plan.positionen, f, plan.thema) })} />
        <div className="kzeile umfang-info" title={begleit.map((p) => `${begleitNr(p)} ${p.ebene === 'GOAE' ? goaeText(p.nr) : gozText(p.nr)}`).join('\n') || 'nach rechts kommen Funktionsdiagnostik und Röntgen dazu'}>
          {begleit.length ? <>+ {begleit.map(begleitNr).join(', ')}</> : <span className="grau">einfach – nach rechts mehr Diagnostik</span>}
        </div>
      </div>

      <div className="kl-block kl-einlage">
        <label className="kregler" title={`Gilt für Listen- und Praxispreise: ${LABOR_KLASSE_NAMEN.map((n, i) => `${n} ${Math.round((LABOR_KLASSE_FAKTOR[i] - 1) * 100)} %`).join(' · ')}. In der Zeile eingetragene Preise, Fremdlabor-Rechnungen (z. B. ResMed) und eingelesene XML-Preise bleiben fest.`}>
          <span className="kregler-name">Labor <b>{laborKlasseName(r.laborKlasse)}</b></span>
          <input type="range" min={0} max={LABOR_KLASSE_FAKTOR.length - 1} step={1} value={r.laborKlasse} onChange={(e) => setR({ laborKlasse: +e.target.value })} />
          <span className="stufe">{((f) => (f === 1 ? 'Liste' : `${f > 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %`))(LABOR_KLASSE_FAKTOR[r.laborKlasse] ?? 1)}</span>
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

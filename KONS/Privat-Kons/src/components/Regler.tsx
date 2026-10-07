import type { Einstellungen, Plan, Rechnung, Regler as ReglerT, Vereinbarungsart } from '../types'
import { behandlungstageAuto, euro, faktorText } from '../engine/kons'
import { GOZ_HOECHSTSATZ, GOZ_SCHWELLE } from '../engine/listen'
import { klasseName, stufeName } from '../data/katalog'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  setEinst: (e: Einstellungen) => void
  rechnung: Rechnung
}

export const VEREINBARUNGEN: { id: Vereinbarungsart; label: string; titel: string }[] = [
  { id: 'pkv', label: 'Privatpatient', titel: 'Privat versichert oder Selbstzahler – alles nach GOZ' },
  { id: 'gkvPrivat', label: 'Kasse: komplett privat', titel: 'Kassenpatient wählt die private Behandlung statt der Kassenleistung (§ 8 Abs. 7 BMV-Z)' },
  { id: 'gkvZusatz', label: 'Kasse: Zusatzleistungen', titel: 'Grundleistung über die Kasse (BEMA), privat nur eigenständige Zusatzleistungen (§ 8 Abs. 7 BMV-Z)' },
]

const faktorStufe = (f: number) =>
  f > GOZ_HOECHSTSATZ ? 'über 3,5 – Vereinbarung § 2 GOZ' : f > GOZ_SCHWELLE ? 'über 2,3 – Begründung nötig' : 'Regelspanne bis 2,3'

export default function Regler({ plan, setPlan, einst, setEinst, rechnung }: Props) {
  const r = plan.regler
  const setR = (patch: Partial<ReglerT>) => setPlan({ ...plan, regler: { ...r, ...patch } })
  const tageAuto = behandlungstageAuto(plan)
  const istVorgabe = einst.faktor === r.faktor && einst.stufe === r.stufe

  return (
    <div className="reglerleiste">
      <div className="kl-block kl-art">
        <h4>Vereinbarung</h4>
        <div className="modell-wahl senkrecht">
          {VEREINBARUNGEN.map((v) => (
            <button key={v.id} className={plan.vereinbarung === v.id ? 'aktiv' : ''} title={v.titel} onClick={() => setPlan({ ...plan, vereinbarung: v.id })}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="kl-block kl-honorar">
        <h4>Honorar</h4>
        <label className="regler">
          <span className="regler-kopf"><b>Faktor {faktorText(r.faktor)}</b> <small>{faktorStufe(r.faktor)}</small></span>
          <input type="range" min={1} max={5} step={0.1} value={r.faktor} onChange={(e) => setR({ faktor: +e.target.value })} />
        </label>
        <label className="regler">
          <span className="regler-kopf"><b>Zusatzleistungen: {stufeName(r.stufe)}</b> <small>Stufe {r.stufe} von 3</small></span>
          <input type="range" min={0} max={3} step={1} value={r.stufe} onChange={(e) => setR({ stufe: +e.target.value })} />
        </label>
      </div>

      <div className="kl-block kl-material">
        <h4>Labor und Material</h4>
        <label className="regler">
          <span className="regler-kopf"><b>{klasseName(r.materialKlasse)}</b> <small>Preisstufe</small></span>
          <input type="range" min={0} max={2} step={1} value={r.materialKlasse} onChange={(e) => setR({ materialKlasse: +e.target.value })} />
        </label>
        <label className="tage">
          Behandlungstage
          <input
            type="number" min={0} max={20}
            value={plan.behandlungstage || ''}
            placeholder={`${tageAuto} (aus Sitzungen)`}
            onChange={(e) => setPlan({ ...plan, behandlungstage: Math.max(0, +e.target.value || 0) })}
          />
        </label>
      </div>

      <div className="kl-block kl-summenblock">
        <h4>Gesamt <span>{rechnung.zaehne.length} Zahn{rechnung.zaehne.length === 1 ? '' : 'e'}</span></h4>
        <div className="gesamt-betrag">{euro(rechnung.summe)}</div>
        <button
          className="klein-btn sekundaer" disabled={istVorgabe}
          onClick={() => setEinst({ ...einst, faktor: r.faktor, stufe: r.stufe })}
          title="Faktor und Stufe als Vorgabe für neue Pläne speichern"
        >
          {istVorgabe ? 'entspricht der Praxisvorgabe' : 'als Praxisvorgabe speichern'}
        </button>
      </div>
    </div>
  )
}

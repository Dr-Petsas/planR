import type { Einstellungen, MkvModell, Plan, Rechnung, Regler as ReglerT } from '../types'
import { euro, faktorText } from '../engine/mkv'
import { GOZ_HOECHSTSATZ, GOZ_SCHWELLE } from '../engine/listen'
import { laborKlasseName } from '../data/katalog'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  setEinst: (e: Einstellungen) => void
  rechnung: Rechnung
}

const MODELLE: { id: MkvModell; label: string; titel: string }[] = [
  { id: 'proFlaeche', label: '€ je Fläche', titel: 'Fester Mehrkostenbetrag je Füllungsfläche' },
  { id: 'proZahn', label: '€ je Füllung', titel: 'Fester Mehrkostenbetrag je Füllung, unabhängig von der Flächenzahl' },
  { id: 'gozDifferenz', label: 'GOZ-Faktor', titel: 'GOZ-Honorar zum gewählten Faktor minus Kassenanteil' },
]

const faktorStufe = (f: number) =>
  f > GOZ_HOECHSTSATZ ? 'über 3,5 – Vereinbarung § 2 GOZ' : f > GOZ_SCHWELLE ? 'über 2,3 – Begründung nötig' : 'Regelspanne bis 2,3'

export default function Regler({ plan, setPlan, einst, setEinst, rechnung }: Props) {
  const r = plan.regler
  const setR = (patch: Partial<ReglerT>) => setPlan({ ...plan, regler: { ...r, ...patch } })

  const plastisch = rechnung.zaehne.filter((z) => z.ziel !== undefined)
  const faktoren = plastisch.map((z) => z.faktor)
  const spanne = faktoren.length
    ? `${faktorText(Math.min(...faktoren))}${Math.min(...faktoren) !== Math.max(...faktoren) ? ` – ${faktorText(Math.max(...faktoren))}` : ''}`
    : '—'
  const hoechster = faktoren.length ? Math.max(...faktoren) : 0

  const alsVorgabe = () =>
    setEinst({ ...einst, modell: r.modell, proZahn: r.proZahn, proFlaeche: r.proFlaeche, faktor: r.faktor, inlayFaktor: r.inlayFaktor })
  const istVorgabe =
    einst.modell === r.modell && einst.proZahn === r.proZahn && einst.proFlaeche === r.proFlaeche &&
    einst.faktor === r.faktor && einst.inlayFaktor === r.inlayFaktor

  return (
    <div className="reglerleiste">
      <div className="kl-block kl-fuellung">
        <h4>Plastische Füllungen <span>Komposit · Mehrfarbentechnik</span></h4>
        <div className="modell-wahl">
          {MODELLE.map((m) => (
            <button key={m.id} className={r.modell === m.id ? 'aktiv' : ''} title={m.titel} onClick={() => setR({ modell: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        {r.modell === 'proFlaeche' && (
          <label className="regler">
            <span className="regler-kopf"><b>{euro(r.proFlaeche)}</b> <small>Mehrkosten je Fläche</small></span>
            <input type="range" min={5} max={150} step={1} value={r.proFlaeche} onChange={(e) => setR({ proFlaeche: +e.target.value })} />
          </label>
        )}
        {r.modell === 'proZahn' && (
          <label className="regler">
            <span className="regler-kopf"><b>{euro(r.proZahn)}</b> <small>Mehrkosten je Füllung</small></span>
            <input type="range" min={10} max={400} step={5} value={r.proZahn} onChange={(e) => setR({ proZahn: +e.target.value })} />
          </label>
        )}
        <label className="regler">
          <span className="regler-kopf">
            <b>{r.modell === 'gozDifferenz' ? `Faktor ${faktorText(r.faktor)}` : `Faktor ${spanne}`}</b>{' '}
            <small>{r.modell === 'gozDifferenz' ? faktorStufe(r.faktor) : 'ergibt sich aus dem Betrag'}</small>
          </span>
          <input
            type="range" min={1} max={5} step={0.1} value={r.faktor}
            disabled={r.modell !== 'gozDifferenz'}
            onChange={(e) => setR({ faktor: +e.target.value })}
          />
        </label>
        {r.modell !== 'gozDifferenz' && hoechster > GOZ_SCHWELLE && (
          <p className="regler-info begruendung">{faktorStufe(hoechster)}</p>
        )}
      </div>

      <div className="kl-block kl-einlage">
        <h4>Einlage- und Goldhämmerfüllungen</h4>
        <label className="regler">
          <span className="regler-kopf"><b>Faktor {faktorText(r.inlayFaktor)}</b> <small>{faktorStufe(r.inlayFaktor)}</small></span>
          <input type="range" min={1} max={5} step={0.1} value={r.inlayFaktor} onChange={(e) => setR({ inlayFaktor: +e.target.value })} />
        </label>
        <label className="regler">
          <span className="regler-kopf"><b>Labor {laborKlasseName(r.laborKlasse)}</b> <small>Preisstufe der Laborleistung</small></span>
          <input type="range" min={0} max={2} step={1} value={r.laborKlasse} onChange={(e) => setR({ laborKlasse: +e.target.value })} />
        </label>
        <p className="regler-info">Begleitleistungen (Kofferdam, Anästhesie, adhäsive Befestigung) zum Faktor {faktorText(r.faktor)}.</p>
      </div>

      <div className="kl-block kl-summenblock">
        <h4>Mehrkosten <span>{rechnung.zaehne.length} Zahn{rechnung.zaehne.length === 1 ? '' : 'e'}</span></h4>
        <dl className="kl-werte">
          <dt>GOZ-Honorar + Labor</dt><dd>{euro(rechnung.privat)}</dd>
          <dt>abzüglich Kassenanteil (BEMA 13)</dt><dd>− {euro(rechnung.kassenanteil)}</dd>
          <dt className="kl-summe">Patient zahlt</dt><dd className="kl-summe">{euro(rechnung.mehrkosten)}</dd>
        </dl>
        <button className="klein-btn sekundaer" disabled={istVorgabe} onClick={alsVorgabe} title="Modell, Beträge und Faktoren in den Einstellungen speichern">
          {istVorgabe ? 'entspricht der Praxisvorgabe' : 'als Praxisvorgabe speichern'}
        </button>
      </div>
    </div>
  )
}

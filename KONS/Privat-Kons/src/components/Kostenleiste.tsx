import type { FuellungModell, Kalkulation, Plan } from '../types'
import { euro } from '../engine/berechnung'
import { materialKlasseName } from '../data/material'
import { STANDARD_REGLER } from '../store'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  kalk: Kalkulation
}

const MODELLE: { id: FuellungModell; label: string }[] = [
  { id: 'pauschal', label: 'Pauschale' },
  { id: 'proFlaeche', label: 'pro Fläche' },
  { id: 'gozDifferenz', label: 'GOZ-Differenz' },
]

export default function Kostenleiste({ plan, setPlan, kalk }: Props) {
  const r = plan.regler
  const setR = (patch: Partial<Plan['regler']>) => setPlan({ ...plan, regler: { ...r, ...patch } })

  const fuellungMehrkosten = kalk.gruppen.filter((g) => g.kategorie === 'fuellung').reduce((s, g) => s + g.mehrkosten, 0)
  const fuellungZahl = kalk.gruppen.filter((g) => g.kategorie === 'fuellung').length

  return (
    <div className="kostenleiste">
      <div className="kl-block kl-fuellung">
        <h4>
          Füllungen <span>Mehrkosten-Modell</span>
        </h4>
        <div className="modell-wahl">
          {MODELLE.map((m) => (
            <button key={m.id} className={r.fuellungModell === m.id ? 'aktiv' : ''} onClick={() => setR({ fuellungModell: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        {r.fuellungModell === 'pauschal' && (
          <div className="regler">
            <div className="regler-kopf">
              <b>{euro(r.fuellungPauschale)}</b> <small>je Füllung (pauschal)</small>
            </div>
            <input type="range" min={0} max={400} step={5} value={r.fuellungPauschale} onChange={(e) => setR({ fuellungPauschale: Number(e.target.value) })} />
          </div>
        )}
        {r.fuellungModell === 'proFlaeche' && (
          <div className="regler">
            <div className="regler-kopf">
              <b>{euro(r.fuellungProFlaeche)}</b> <small>je Fläche</small>
            </div>
            <input type="range" min={0} max={120} step={5} value={r.fuellungProFlaeche} onChange={(e) => setR({ fuellungProFlaeche: Number(e.target.value) })} />
          </div>
        )}
        {r.fuellungModell === 'gozDifferenz' && <p className="regler-info">GOZ-Komposit abzüglich Kassenanteil (§ 28 Abs. 2 SGB V).</p>}
        <dl className="kl-werte">
          <dt>{fuellungZahl} Füllung(en)</dt>
          <dd>{euro(fuellungMehrkosten)}</dd>
        </dl>
      </div>

      <div className="kl-block kl-zahnarzt">
        <h4>
          Honorar &amp; Material <span>GOZ</span>
        </h4>
        <div className="regler">
          <div className="regler-kopf">
            <b>Faktor {r.gozFaktor.toFixed(1)}</b> <small>{r.gozFaktor <= 2.3 ? 'Regelsatz' : r.gozFaktor <= 3.5 ? 'Höchstsatz' : 'Vereinbarung'}</small>
          </div>
          <input type="range" min={1} max={3.5} step={0.1} value={r.gozFaktor} onChange={(e) => setR({ gozFaktor: Number(e.target.value) })} />
          <small className="regler-stufe">Vorgabe für alle GOZ-Positionen</small>
        </div>
        <div className="regler">
          <div className="regler-kopf">
            <b>Material {materialKlasseName(r.materialKlasse)}</b>
          </div>
          <input type="range" min={0} max={2} step={1} value={r.materialKlasse} onChange={(e) => setR({ materialKlasse: Number(e.target.value) })} />
        </div>
      </div>

      <div className="kl-block kl-summenblock">
        <h4>
          Mehrkosten <span>Patientenanteil</span>
        </h4>
        <dl className="kl-werte">
          <dt>Privatleistung (GOZ)</dt>
          <dd>{euro(kalk.gozGesamt)}</dd>
          <dt>Kassenanteil</dt>
          <dd>− {euro(kalk.kassenGesamt)}</dd>
          <dt className="kl-summe">Patient zahlt</dt>
          <dd className="kl-summe">{euro(kalk.mehrkostenGesamt)}</dd>
        </dl>
        <button className="klein-btn sekundaer" onClick={() => setR({ ...STANDARD_REGLER, gozFaktor: r.gozFaktor })}>
          Regler zurücksetzen
        </button>
      </div>
    </div>
  )
}

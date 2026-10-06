import { useMemo } from 'react'
import type { Einstellungen, Plan, Regler } from '../types'
import { HOECHSTSATZ, SCHWELLENWERT, euro, kalkulieren, ohneRegler, type Kalkulation } from '../engine/berechnung'
import { GOZ_STUFEN, GOZ_STUFE_MAX, LABOR_AUFSCHLAG_MAX, LABOR_AUFSCHLAG_MIN, LABOR_STUFEN, LABOR_STUFE_MAX } from '../engine/zusatz'

interface Props {
  plan: Plan
  einst: Einstellungen
  kalk: Kalkulation
  onChange: (plan: Plan) => void
}

const delta = (n: number) => (n > 0.004 ? `+${euro(n)}` : n < -0.004 ? `−${euro(-n)}` : '±0,00 €')
const zahlDe = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
export function Kostenleiste({ plan, einst, kalk, onChange }: Props) {
  const r = plan.regler
  const basis = useMemo(() => kalkulieren(ohneRegler(plan), einst), [plan, einst])
  const setzen = (teil: Partial<Regler>) => onChange({ ...plan, regler: { ...r, ...teil } })

  const min = Math.min(einst.gozFaktor, SCHWELLENWERT)
  const faktor = r.gozFaktor > min ? r.gozFaktor : Math.max(min, einst.gozFaktor)
  const geaendert = r.gozStufe > 0 || r.gozFaktor > 0 || r.laborStufe > 0 || r.laborAufschlag !== 0 || r.aus.length > 0

  return (
    <div className="kostenleiste">
      <section className="kl-block kl-zahnarzt">
        <h4>Zahnärztliches Honorar <span>GOZ</span></h4>
        <label className="regler" title="Zusatzleistungen nur berechnen, wenn sie tatsächlich erbracht werden.">
          <span className="regler-kopf">Zusätzliche GOZ-Leistungen <b>Stufe {r.gozStufe}</b> <small>{GOZ_STUFEN[r.gozStufe].titel}</small></span>
          <input type="range" min={0} max={GOZ_STUFE_MAX} step={1} value={r.gozStufe} onChange={(ev) => setzen({ gozStufe: Number(ev.target.value) })} />
        </label>
        <label className="regler" title={faktor > SCHWELLENWERT ? 'Über 2,3: Begründung je Position (§ 10 GOZ); max. 3,5 ohne Vereinbarung (§ 2 GOZ).' : 'Bis 2,3 ohne Begründung. Einzeln angepasste Faktoren bleiben erhalten.'}>
          <span className="regler-kopf">GOZ-Faktor erhöhen <b>{zahlDe(faktor)}</b></span>
          <input type="range" min={min} max={HOECHSTSATZ} step={0.1} value={faktor} list="goz-marken"
            onChange={(ev) => { const v = Number(ev.target.value); setzen({ gozFaktor: v <= einst.gozFaktor ? 0 : v }) }} />
          <datalist id="goz-marken"><option value={SCHWELLENWERT} /><option value={HOECHSTSATZ} /></datalist>
        </label>
        <dl className="kl-werte">
          <dt>Honorar ({kalk.honorar.length})</dt><dd>{euro(kalk.summeHonorar)} <i>{delta(kalk.summeHonorar - basis.summeHonorar)}</i></dd>
        </dl>
      </section>

      <section className="kl-block kl-labor">
        <h4>Laborleistungen <span>BEB</span></h4>
        <label className="regler">
          <span className="regler-kopf">Laborqualität <b>Stufe {r.laborStufe}</b> <small>{LABOR_STUFEN[r.laborStufe].titel}</small></span>
          <input type="range" min={0} max={LABOR_STUFE_MAX} step={1} value={r.laborStufe} onChange={(ev) => setzen({ laborStufe: Number(ev.target.value) })} />
        </label>
        <label className="regler" title="Einzeln eingetragene Preise werden vom Auf-/Abschlag nicht verändert.">
          <span className="regler-kopf">Preise BEB <b>{r.laborAufschlag > 0 ? '+' : ''}{r.laborAufschlag} %</b> <small>{r.laborAufschlag < 0 ? 'Abschlag' : 'Aufschlag'} auf die Preisliste</small></span>
          <input type="range" min={LABOR_AUFSCHLAG_MIN} max={LABOR_AUFSCHLAG_MAX} step={1} value={r.laborAufschlag} disabled={!kalk.labor.length}
            onChange={(ev) => setzen({ laborAufschlag: Number(ev.target.value) })} />
        </label>
        <dl className="kl-werte">
          <dt>Labor netto ({kalk.labor.length})</dt><dd>{euro(kalk.summeLaborNetto)} <i>{delta(kalk.summeLaborNetto - basis.summeLaborNetto)}</i></dd>
          <dt>MwSt. {einst.mwst} %</dt><dd>{euro(kalk.mwst)}</dd>
          {kalk.summeMaterial !== 0 && <><dt>Material</dt><dd>{euro(kalk.summeMaterial)}</dd></>}
        </dl>
      </section>

      <section className="kl-block kl-summenblock">
        <h4>Gesamt</h4>
        <dl className="kl-werte">
          <dt>Honorar</dt><dd>{euro(kalk.summeHonorar)}</dd>
          <dt>Labor + Material</dt><dd>{euro(kalk.summeLaborNetto + kalk.mwst + kalk.summeMaterial)}</dd>
          <dt className="kl-summe">Gesamt</dt><dd className="kl-summe">{euro(kalk.gesamt)} <i>{delta(kalk.gesamt - basis.gesamt)}</i></dd>
        </dl>
        {geaendert && <button className="sekundaer klein-btn" onClick={() => setzen({ gozStufe: 0, gozFaktor: 0, laborStufe: 0, laborAufschlag: 0, aus: [] })}>Regler zurücksetzen</button>}
      </section>
    </div>
  )
}

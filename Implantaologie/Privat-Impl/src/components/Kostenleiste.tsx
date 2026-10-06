import { useMemo } from 'react'
import type { Einstellungen, Plan, Regler } from '../types'
import { euro, kalkulieren, ohneRegler, GOZ_SCHWELLE, GOZ_HOECHSTSATZ, type Kalkulation } from '../engine/berechnung'
import { GOZ_VEREINBARUNG_MAX } from '../engine/listen'
import {
  ANALOGBEWERTUNG_MAX, ANALOGBEWERTUNG_STUFEN, ANALOG_MAX, ANALOG_STUFEN,
  BEGLEIT_MAX, BEGLEIT_STUFEN, LABOR_AUFSCHLAG_MAX, LABOR_AUFSCHLAG_MIN,
  MATERIALKLASSE_MAX, MATERIALKLASSE_STUFEN, SCHABLONE_MAX, SCHABLONE_STUFEN,
} from '../engine/zusatz'

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

  const gozMin = Math.min(einst.gozFaktor, GOZ_SCHWELLE)
  const gozMax = einst.erlaubeUeber35 ? GOZ_VEREINBARUNG_MAX : GOZ_HOECHSTSATZ
  const gozFaktor = r.gozFaktor > gozMin ? r.gozFaktor : Math.max(gozMin, einst.gozFaktor)
  const goaeFaktor = r.goaeFaktor > 0 ? r.goaeFaktor : einst.goaeFaktor

  const geaendert = r.begleitStufe > 0 || r.analogStufe > 0 || r.analogBewertung > 0 || r.gozFaktor > 0 || r.goaeFaktor > 0 || r.schabloneStufe > 0 || r.materialKlasse !== 1 || r.laborAufschlag !== 0 || r.aus.length > 0
  const zuruecksetzen = () => setzen({ begleitStufe: 1, analogStufe: 1, analogBewertung: 1, gozFaktor: 0, goaeFaktor: 0, schabloneStufe: 0, materialKlasse: 1, laborAufschlag: 0, aus: [] })

  return (
    <div className="kostenleiste">
      <section className="kl-block kl-zahnarzt">
        <h4>Honorar <span>GOZ / GOÄ</span></h4>
        <label className="regler" title="Nur berechnen, wenn erbracht.">
          <span className="regler-kopf">Begleitleistungen <b>Stufe {r.begleitStufe}</b> <small>{BEGLEIT_STUFEN[r.begleitStufe].titel}</small></span>
          <input type="range" min={0} max={BEGLEIT_MAX} step={1} value={r.begleitStufe} onChange={(e) => setzen({ begleitStufe: Number(e.target.value) })} />
        </label>
        <label className="regler" title="Analog- und Exotenleistungen nach § 6 Abs. 1 GOZ. Nur berechnen, wenn erbracht.">
          <span className="regler-kopf">Analog / Exoten <b>Stufe {r.analogStufe}</b> <small>{ANALOG_STUFEN[r.analogStufe].titel}</small></span>
          <input type="range" min={0} max={ANALOG_MAX} step={1} value={r.analogStufe} onChange={(e) => setzen({ analogStufe: Number(e.target.value) })} />
        </label>
        <label className="regler" title="Höhe der Vergleichsziffer: 0 niedrigste Kammer-Ziffer, 1 höchste, 2 Praxiskalkulation (Minuten × Stundensatz + einkalkuliertes Material).">
          <span className="regler-kopf">Analogbewertung <b>Stufe {r.analogBewertung}</b> <small>{ANALOGBEWERTUNG_STUFEN[r.analogBewertung].titel}</small></span>
          <input type="range" min={0} max={ANALOGBEWERTUNG_MAX} step={1} value={r.analogBewertung} onChange={(e) => setzen({ analogBewertung: Number(e.target.value) })} />
        </label>
        {r.analogBewertung === 2 && (
          <label className="regler kl-kalkulator" title="Praxis-Stundensatz für die Analogbewertung (Praxiskalkulation).">
            <span className="regler-kopf">Praxis-Stundensatz <b>{euro(einst.stundensatz)}/h</b></span>
            <input type="range" min={200} max={900} step={10} value={einst.stundensatz} onChange={() => { /* editierbar unter „Praxis & Preise" */ }} disabled />
          </label>
        )}
        <label className="regler" title={gozFaktor > GOZ_SCHWELLE ? 'Über 2,3: Begründung je Position (§ 10 GOZ); über 3,5 nur mit Vereinbarung (§ 2 GOZ).' : 'Bis 2,3 ohne Begründung.'}>
          <span className="regler-kopf">GOZ-Faktor <b>{zahlDe(gozFaktor)}</b></span>
          <input type="range" min={gozMin} max={gozMax} step={0.1} value={gozFaktor} list="goz-marken"
            onChange={(e) => { const v = Number(e.target.value); setzen({ gozFaktor: v <= einst.gozFaktor ? 0 : v }) }} />
          <datalist id="goz-marken"><option value={GOZ_SCHWELLE} /><option value={GOZ_HOECHSTSATZ} /></datalist>
        </label>
        <label className="regler" title="GOÄ-Faktor. Röntgen höchstens 2,5, GOÄ 250 höchstens 2,5, Zuschlag 5377 fest 1,0 – wird je Nummer begrenzt.">
          <span className="regler-kopf">GOÄ-Faktor <b>{zahlDe(goaeFaktor)}</b></span>
          <input type="range" min={1.8} max={3.5} step={0.1} value={goaeFaktor}
            onChange={(e) => { const v = Number(e.target.value); setzen({ goaeFaktor: v <= einst.goaeFaktor ? 0 : v }) }} />
        </label>
        <dl className="kl-werte">
          <dt>GOZ ({kalk.honorarGoz.length})</dt><dd>{euro(kalk.summeGoz)} <i>{delta(kalk.summeGoz - basis.summeGoz)}</i></dd>
          <dt>GOÄ ({kalk.honorarGoae.length})</dt><dd>{euro(kalk.summeGoae)} <i>{delta(kalk.summeGoae - basis.summeGoae)}</i></dd>
        </dl>
      </section>

      <section className="kl-block kl-labor">
        <h4>Material &amp; Labor</h4>
        <label className="regler" title="Standardprodukt je Materialrolle. Kein Preisaufschlag – nur ein anderes Standardprodukt.">
          <span className="regler-kopf">Materialklasse <b>Stufe {r.materialKlasse}</b> <small>{MATERIALKLASSE_STUFEN[r.materialKlasse].titel}</small></span>
          <input type="range" min={0} max={MATERIALKLASSE_MAX} step={1} value={r.materialKlasse} onChange={(e) => setzen({ materialKlasse: Number(e.target.value) })} />
        </label>
        <label className="regler" title="Bohrschablone / navigierte Chirurgie.">
          <span className="regler-kopf">Schablone <b>Stufe {r.schabloneStufe}</b> <small>{SCHABLONE_STUFEN[r.schabloneStufe].titel}</small></span>
          <input type="range" min={0} max={SCHABLONE_MAX} step={1} value={r.schabloneStufe} onChange={(e) => setzen({ schabloneStufe: Number(e.target.value) })} />
        </label>
        <label className="regler" title="Auf-/Abschlag auf eingetragene Laborpreise (BEB).">
          <span className="regler-kopf">Preise Labor <b>{r.laborAufschlag > 0 ? '+' : ''}{r.laborAufschlag} %</b></span>
          <input type="range" min={LABOR_AUFSCHLAG_MIN} max={LABOR_AUFSCHLAG_MAX} step={1} value={r.laborAufschlag} disabled={!kalk.labor.length}
            onChange={(e) => setzen({ laborAufschlag: Number(e.target.value) })} />
        </label>
        <dl className="kl-werte">
          <dt>Material netto</dt><dd>{euro(kalk.summeMaterialNetto)} <i>{delta(kalk.summeMaterialNetto - basis.summeMaterialNetto)}</i></dd>
          {kalk.summeLaborNetto !== 0 && <><dt>Labor netto</dt><dd>{euro(kalk.summeLaborNetto)}</dd></>}
          <dt>MwSt. {einst.mwst} %</dt><dd>{euro(kalk.mwst)}</dd>
        </dl>
      </section>

      <section className="kl-block kl-summenblock">
        <h4>Gesamt</h4>
        <dl className="kl-werte">
          <dt>Honorar</dt><dd>{euro(kalk.summeGoz + kalk.summeGoae)}</dd>
          <dt>Material + Labor</dt><dd>{euro(kalk.summeMaterialNetto + kalk.summeLaborNetto + kalk.mwst)}</dd>
          <dt className="kl-summe">Gesamt</dt><dd className="kl-summe">{euro(kalk.gesamt)} <i>{delta(kalk.gesamt - basis.gesamt)}</i></dd>
        </dl>
        {geaendert && <button className="sekundaer klein-btn" onClick={zuruecksetzen}>Regler zurücksetzen</button>}
      </section>
    </div>
  )
}

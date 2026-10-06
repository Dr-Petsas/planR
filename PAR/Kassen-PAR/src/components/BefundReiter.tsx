import { useState } from 'react'
import type { Befund, BefundPhase, Plan } from '../types'
import { leererBefund } from '../store'
import { betroffeneZaehne, vorhandeneZaehne } from '../engine/diagnose'
import PerioChart from './PerioChart'

const PHASEN: { id: BefundPhase; label: string; hinweis: string }[] = [
  { id: 'initial', label: 'Initialbefund (Antrag)', hinweis: 'Erhebung vor Behandlungsbeginn – Grundlage für den PAR-Antrag.' },
  { id: 'beva', label: 'BEV a (nach AIT)', hinweis: 'Befundevaluation 3–6 Monate nach der antiinfektiösen Therapie.' },
  { id: 'bevb', label: 'BEV b (nach CPT)', hinweis: 'Befundevaluation nach der chirurgischen Therapie.' },
]

export default function BefundReiter({ plan, setPlan }: { plan: Plan; setPlan: (p: Plan) => void }) {
  const [phase, setPhase] = useState<BefundPhase>('initial')
  const befund = plan.befunde[phase]

  const setBefund = (b: Befund) => setPlan({ ...plan, befunde: { ...plan.befunde, [phase]: b } })

  const anlegen = () => {
    // BEV aus dem Initialbefund (Zahnstatus übernehmen, Werte leeren) vorbereiten
    const basis = leererBefund()
    for (const z of Object.keys(basis.zaehne)) {
      basis.zaehne[z].zs = plan.befunde.initial.zaehne[z].zs
    }
    setPlan({ ...plan, befunde: { ...plan.befunde, [phase]: basis } })
  }

  return (
    <div className="karte">
      <div className="reiter-mini">
        {PHASEN.map((ph) => (
          <button key={ph.id} className={phase === ph.id ? 'aktiv' : ''} onClick={() => setPhase(ph.id)}>
            {ph.label}
            {plan.befunde[ph.id] ? '' : ' +'}
          </button>
        ))}
      </div>
      <p className="hinweis">{PHASEN.find((p) => p.id === phase)!.hinweis}</p>

      {befund ? (
        <>
          <div className="befund-kopf">
            <label>
              Befunddatum
              <input type="date" value={befund.datum} onChange={(e) => setBefund({ ...befund, datum: e.target.value })} />
            </label>
            <span className="befund-stat">
              Vorhandene Zähne: <b>{vorhandeneZaehne(befund)}</b> · parodontal betroffen (ST ≥ 4 mm):{' '}
              <b>{betroffeneZaehne(befund)}</b>
            </span>
          </div>
          <PerioChart befund={befund} onChange={setBefund} />
        </>
      ) : (
        <div className="leer-phase">
          <p>Für diese Phase ist noch kein Befund erfasst.</p>
          <button className="primaer" onClick={anlegen}>
            {PHASEN.find((p) => p.id === phase)!.label} aus Initialbefund anlegen
          </button>
        </div>
      )}
    </div>
  )
}

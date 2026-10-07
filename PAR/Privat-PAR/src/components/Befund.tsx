import { useState } from 'react'
import type { Plan } from '../types'
import { MEHRWURZELIG, OK, UK } from '../data/katalog'
import { zaehne } from '../engine/par'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
}

type Modus = 'fehlend' | 'cpt'

const umschalten = (liste: string[], z: string) => (liste.includes(z) ? liste.filter((x) => x !== z) : [...liste, z])

export default function Befund({ plan, setPlan }: Props) {
  const [modus, setModus] = useState<Modus>('fehlend')
  const { vorhanden, ein, mehr } = zaehne(plan)

  const klick = (z: string) => {
    if (modus === 'fehlend') {
      const fehlend = umschalten(plan.fehlend, z)
      setPlan({ ...plan, fehlend, cpt: plan.cpt.filter((c) => !fehlend.includes(c)) })
    } else if (!plan.fehlend.includes(z)) {
      setPlan({ ...plan, cpt: umschalten(plan.cpt, z) })
    }
  }

  const reihe = (label: string, liste: string[]) => (
    <div className="zs-reihe">
      <span className="zs-label">{label}</span>
      {liste.map((z) => {
        const fehlt = plan.fehlend.includes(z)
        const cpt = !fehlt && plan.cpt.includes(z)
        return (
          <button key={z} className={`zs-feld${fehlt ? ' fehlt' : ''}${cpt ? ' cpt' : ''}`}
            title={`${z}: ${MEHRWURZELIG.has(z) ? 'mehrwurzelig' : 'einwurzelig'}${fehlt ? ', fehlt' : ''}${cpt ? ', CPT' : ''}`}
            onClick={() => klick(z)}>
            {z}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="block">
      <h3>Zahnschema</h3>
      <p className="hilfe">Fehlende Zähne durchstreichen, danach die Zähne mit Resttaschen für die chirurgische Therapie (CPT) markieren.</p>
      <div className="wahl" style={{ marginBottom: 8 }}>
        <button className={modus === 'fehlend' ? 'aktiv' : ''} onClick={() => setModus('fehlend')}>fehlende Zähne</button>
        <button className={modus === 'cpt' ? 'aktiv' : ''} onClick={() => setModus('cpt')}>CPT-Zähne</button>
      </div>
      <div className="zahnschema">
        <div className="zs-kiefer">
          {reihe('OK', OK)}
          <div className="zs-trenner"><span>rechts</span><span>links</span></div>
          {reihe('UK', UK)}
        </div>
      </div>
      <p className="hilfe">
        {vorhanden.length} Zähne: {ein} einwurzelig, {mehr} mehrwurzelig (obere Prämolaren 14/24 zählen als zweiwurzelig)
        {plan.cpt.length > 0 && ` · CPT an ${plan.cpt.length} ${plan.cpt.length === 1 ? 'Zahn' : 'Zähnen'}`}
      </p>
    </div>
  )
}

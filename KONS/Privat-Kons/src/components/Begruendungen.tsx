import type { Plan, Rechnung } from '../types'
import { faktorText } from '../engine/kons'
import { standardBegruendung } from '../engine/begruendung'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  rechnung: Rechnung
}

export default function Begruendungen({ plan, setPlan, rechnung }: Props) {
  if (!rechnung.begruendungen.length) return null
  const setzen = (nr: string, text: string) => {
    const neu = { ...plan.begruendungen }
    if (text.trim() && text.trim() !== standardBegruendung(nr)) neu[nr] = text
    else delete neu[nr]
    setPlan({ ...plan, begruendungen: neu })
  }
  return (
    <div className="block">
      <h3>Begründungen für Faktoren über 2,3 (§ 10 Abs. 3 GOZ)</h3>
      <p className="regler-info">Vorschlag je Leistungsgruppe – bitte patientenbezogen prüfen. Leer lassen setzt den Vorschlag wieder ein.</p>
      <div className="formular">
        {rechnung.begruendungen.map((b) => (
          <label key={b.nr} className="feld breit">
            GOZ {b.nr} · Faktor {faktorText(b.faktor)}{b.eigen ? '' : ' · Vorschlag'}
            <textarea rows={2} maxLength={274} value={plan.begruendungen?.[b.nr] ?? b.text} onChange={(e) => setzen(b.nr, e.target.value)} />
          </label>
        ))}
      </div>
    </div>
  )
}

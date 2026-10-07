import type { Plan } from '../types'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
}

export default function Patient({ plan, setPlan }: Props) {
  const pat = plan.patient
  const setPat = (patch: Partial<Plan['patient']>) => setPlan({ ...plan, patient: { ...pat, ...patch } })
  const kasse = plan.vereinbarung !== 'pkv'

  return (
    <div className="block">
      <h3>Patientin / Patient</h3>
      <div className="formular">
        <label className="feld breit">
          Name
          <input value={pat.name} onChange={(e) => setPat({ name: e.target.value })} placeholder="Vor- und Nachname" />
        </label>
        <label className="feld">
          Geburtsdatum
          <input type="date" value={pat.geburtsdatum} onChange={(e) => setPat({ geburtsdatum: e.target.value })} />
        </label>
        <label className="feld">
          {kasse ? 'Krankenkasse' : 'Versicherung / Beihilfe'}
          <input value={pat.versicherung} onChange={(e) => setPat({ versicherung: e.target.value })} placeholder={kasse ? 'z. B. AOK' : 'z. B. Debeka, Beihilfe'} />
        </label>
        <label className="feld">
          Versicherten-Nr.
          <input value={pat.versichertennr} onChange={(e) => setPat({ versichertennr: e.target.value })} />
        </label>
        <label className="feld">
          Plan-Nummer
          <input value={plan.nummer} onChange={(e) => setPlan({ ...plan, nummer: e.target.value })} />
        </label>
        <label className="feld">
          Datum
          <input type="date" value={plan.datum} onChange={(e) => setPlan({ ...plan, datum: e.target.value })} />
        </label>
        <label className="feld breit">
          Bemerkung (erscheint im Dokument)
          <textarea rows={3} value={plan.bemerkung} onChange={(e) => setPlan({ ...plan, bemerkung: e.target.value })} />
        </label>
      </div>
    </div>
  )
}

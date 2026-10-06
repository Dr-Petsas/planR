import type { Einstellungen, Praxis } from '../types'

export default function PraxisReiter({
  einst,
  setEinst,
}: {
  einst: Einstellungen
  setEinst: (e: Einstellungen) => void
}) {
  const p = einst.praxis
  const setP = (patch: Partial<Praxis>) => setEinst({ ...einst, praxis: { ...p, ...patch } })

  return (
    <div className="karte">
      <h2>Praxis & Punktwert</h2>
      <div className="felder">
        <label className="breit">
          Praxisname
          <input value={p.name} onChange={(e) => setP({ name: e.target.value })} />
        </label>
        <label className="breit">
          Straße
          <input value={p.strasse} onChange={(e) => setP({ strasse: e.target.value })} />
        </label>
        <label>
          PLZ
          <input value={p.plz} onChange={(e) => setP({ plz: e.target.value })} />
        </label>
        <label>
          Ort
          <input value={p.ort} onChange={(e) => setP({ ort: e.target.value })} />
        </label>
        <label>
          Telefon
          <input value={p.telefon} onChange={(e) => setP({ telefon: e.target.value })} />
        </label>
        <label>
          Behandler
          <input value={p.behandler} onChange={(e) => setP({ behandler: e.target.value })} />
        </label>
        <label>
          Zahnarzt-Nr.
          <input value={p.zahnarztNr} onChange={(e) => setP({ zahnarztNr: e.target.value })} />
        </label>
        <label>
          Abrechnungs-Nr. (KZV)
          <input value={p.abrechnungsNr} onChange={(e) => setP({ abrechnungsNr: e.target.value })} />
        </label>
        <label>
          BEMA-Punktwert (€)
          <input
            value={einst.bemaPunktwert}
            onChange={(e) => setEinst({ ...einst, bemaPunktwert: Number(e.target.value.replace(',', '.')) || 0 })}
            inputMode="decimal"
          />
        </label>
      </div>
      <p className="hinweis">
        Der BEMA-Punktwert ist regional (KZV) unterschiedlich. Bitte den für Ihre KZV gültigen Wert eintragen –
        er bestimmt alle Euro-Beträge im Plan.
      </p>
    </div>
  )
}

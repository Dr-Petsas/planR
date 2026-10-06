import type { Einstellungen } from '../types'
import { BEMA_KASSENANTEILE } from '../data/bema-kons'

interface Props {
  einst: Einstellungen
  setEinst: (e: Einstellungen) => void
}

export default function PraxisPreise({ einst, setEinst }: Props) {
  const p = einst.praxis
  const setPraxis = (patch: Partial<Einstellungen['praxis']>) => setEinst({ ...einst, praxis: { ...p, ...patch } })

  const setMaterial = (id: string, preis: number) =>
    setEinst({ ...einst, materialPreise: einst.materialPreise.map((m) => (m.id === id ? { ...m, preis } : m)) })

  const setKasse = (key: string, wert: number) => setEinst({ ...einst, kassenanteile: { ...einst.kassenanteile, [key]: wert } })

  return (
    <div className="block">
      <h3>Praxis</h3>
      <div className="formular">
        <label className="feld breit">
          Praxisname
          <input value={p.name} onChange={(e) => setPraxis({ name: e.target.value })} />
        </label>
        <label className="feld breit">
          Behandler/in
          <input value={p.zahnarzt} onChange={(e) => setPraxis({ zahnarzt: e.target.value })} />
        </label>
        <label className="feld breit">
          Straße
          <input value={p.strasse} onChange={(e) => setPraxis({ strasse: e.target.value })} />
        </label>
        <label className="feld">
          PLZ
          <input value={p.plz} onChange={(e) => setPraxis({ plz: e.target.value })} />
        </label>
        <label className="feld">
          Ort
          <input value={p.ort} onChange={(e) => setPraxis({ ort: e.target.value })} />
        </label>
        <label className="feld">
          Telefon
          <input value={p.telefon} onChange={(e) => setPraxis({ telefon: e.target.value })} />
        </label>
        <label className="feld breit">
          E-Mail
          <input value={p.email} onChange={(e) => setPraxis({ email: e.target.value })} />
        </label>
      </div>

      <h3>Vorgaben</h3>
      <div className="formular">
        <label className="feld">
          GOZ-Faktor (Vorgabe)
          <input
            type="number"
            min={1}
            max={5}
            step={0.1}
            value={einst.gozFaktor}
            onChange={(e) => setEinst({ ...einst, gozFaktor: Number(e.target.value) || 2.3 })}
          />
        </label>
        <label className="feld">
          Gültigkeit (Monate)
          <input
            type="number"
            min={1}
            value={einst.gueltigMonate}
            onChange={(e) => setEinst({ ...einst, gueltigMonate: Number(e.target.value) || 6 })}
          />
        </label>
        <label className="feld">
          Stundensatz (€)
          <input
            type="number"
            min={0}
            value={einst.stundensatz}
            onChange={(e) => setEinst({ ...einst, stundensatz: Number(e.target.value) || 0 })}
          />
        </label>
      </div>

      <h3>Material- / Laborpreise (€)</h3>
      <table className="preisliste impl-tabelle">
        <thead>
          <tr>
            <th>Leistung</th>
            <th>Einheit</th>
            <th>Preis</th>
          </tr>
        </thead>
        <tbody>
          {einst.materialPreise.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td className="el-klein">{m.einheit}</td>
              <td>
                <input type="number" min={0} step={1} value={m.preis} onChange={(e) => setMaterial(m.id, Number(e.target.value) || 0)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>BEMA-Kassenanteile (€)</h3>
      <p className="hilfe">
        Regional (KZV-Punktwert) unterschiedlich – hier als Näherung hinterlegt und frei anpassbar. Wird beim Füllungs-Modell
        „GOZ-Differenz“ und bei Endo/Vitalerhaltung vom GOZ-Betrag abgezogen.
      </p>
      <table className="preisliste impl-tabelle">
        <thead>
          <tr>
            <th>BEMA-Position</th>
            <th>Kassenanteil</th>
          </tr>
        </thead>
        <tbody>
          {BEMA_KASSENANTEILE.map((b) => (
            <tr key={b.key}>
              <td>{b.label}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={einst.kassenanteile[b.key] ?? b.standard}
                  onChange={(e) => setKasse(b.key, Number(e.target.value) || 0)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

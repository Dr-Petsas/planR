import type { Einstellungen as EinstT, Praxis, Preis } from '../types'
import { stufeName } from '../data/katalog'

interface Props {
  einst: EinstT
  setEinst: (e: EinstT) => void
}

const PRAXIS_FELDER: { key: keyof Praxis; label: string; breit?: boolean }[] = [
  { key: 'name', label: 'Praxisname', breit: true },
  { key: 'zahnarzt', label: 'Zahnärztin / Zahnarzt' },
  { key: 'strasse', label: 'Straße' },
  { key: 'plz', label: 'PLZ' },
  { key: 'ort', label: 'Ort' },
  { key: 'telefon', label: 'Telefon' },
  { key: 'email', label: 'E-Mail' },
]

const zahl = (v: string, fallback: number) => (v === '' || Number.isNaN(+v) ? fallback : +v)

function PreisTabelle({ titel, preise, onChange, fuss }: { titel: string; preise: Preis[]; onChange: (p: Preis[]) => void; fuss: string }) {
  return (
    <div className="block">
      <h3>{titel}</h3>
      <table className="preis-tabelle">
        <tbody>
          {preise.map((l, i) => (
            <tr key={l.id}>
              <td><input value={l.name} onChange={(e) => onChange(preise.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
              <td className="r">
                <input type="number" min={0} step={1} value={l.preis}
                  onChange={(e) => onChange(preise.map((x, j) => (j === i ? { ...x, preis: zahl(e.target.value, 0) } : x)))} /> €
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fuss">{fuss}</p>
    </div>
  )
}

export default function Einstellungen({ einst, setEinst }: Props) {
  const set = (patch: Partial<EinstT>) => setEinst({ ...einst, ...patch })
  return (
    <>
      <div className="block">
        <h3>Praxis</h3>
        <div className="formular">
          {PRAXIS_FELDER.map((f) => (
            <label key={f.key} className={`feld ${f.breit ? 'breit' : ''}`}>
              {f.label}
              <input value={einst.praxis[f.key]} onChange={(e) => set({ praxis: { ...einst.praxis, [f.key]: e.target.value } })} />
            </label>
          ))}
        </div>
      </div>

      <div className="block">
        <h3>Vorgaben für neue Pläne</h3>
        <div className="formular">
          <label className="feld">
            GOZ-Faktor
            <input type="number" min={1} max={5} step={0.1} value={einst.faktor} onChange={(e) => set({ faktor: zahl(e.target.value, 2.3) })} />
          </label>
          <label className="feld">
            Zusatzleistungen
            <select value={einst.stufe} onChange={(e) => set({ stufe: +e.target.value })}>
              {[0, 1, 2, 3].map((s) => <option key={s} value={s}>Stufe {s}: {stufeName(s)}</option>)}
            </select>
          </label>
          <label className="feld">
            Vereinbarung gültig (Monate)
            <input type="number" min={1} max={24} value={einst.gueltigMonate} onChange={(e) => set({ gueltigMonate: zahl(e.target.value, 6) })} />
          </label>
        </div>
      </div>

      <PreisTabelle titel="Laborpreise Einlagefüllungen" preise={einst.laborPreise} onChange={(laborPreise) => set({ laborPreise })}
        fuss="Standardpreis; der Regler „Labor und Material“ verschiebt um −15 % bzw. +20 %." />
      <PreisTabelle titel="Materialpreise" preise={einst.materialPreise} onChange={(materialPreise) => set({ materialPreise })}
        fuss="Einmal-Material, das gesondert berechnet wird (NiTi-Feilen je Kanal, Glasfaserstift je Zahn)." />
    </>
  )
}

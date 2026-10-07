import type { Einstellungen as EinstT, Preis } from '../types'
import { stufeName } from '../data/katalog'
import { PraxisFelder } from './Stammdaten'
import { ListenKarte } from './Listen'
import { GENUTZTE_LISTEN } from '../engine/listen'

interface Props {
  einst: EinstT
  setEinst: (e: EinstT) => void
}

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
        <PraxisFelder art="privat" praxis={einst.praxis} onChange={(praxis) => set({ praxis })} />
      </div>
      <ListenKarte listen={GENUTZTE_LISTEN} />

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

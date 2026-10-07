import type { Einstellungen as EinstT, Labor } from '../types'
import { MEHR_LEISTUNGEN } from '../data/katalog'
import { GENUTZTE_LISTEN, LISTEN_ORDNER } from '../engine/listen'
import { PraxisFelder } from './Stammdaten'
import { ListenKarte } from './Listen'
import { PunktwertKarte } from './Punktwerte'

interface Props {
  einst: EinstT
  setEinst: (e: EinstT) => void
}

const zahl = (v: string, fallback: number) => (v === '' || Number.isNaN(+v) ? fallback : +v)

export default function Einstellungen({ einst, setEinst }: Props) {
  const set = (patch: Partial<EinstT>) => setEinst({ ...einst, ...patch })
  const mitMaterial = MEHR_LEISTUNGEN.filter((m) => m.material)

  return (
    <>
      <div className="block">
        <h3>Praxis</h3>
        <PraxisFelder art="kasse" praxis={einst.praxis} onChange={(praxis) => set({ praxis })} />
      </div>

      <PunktwertKarte
        bereiche={['KFO', 'KCH']}
        praxis={einst.praxis}
        setPraxis={(praxis) => set({ praxis })}
        fest={einst.punktwertFest}
        setFest={(punktwertFest) => set({ punktwertFest })}
      />

      <ListenKarte listen={GENUTZTE_LISTEN} neueOrdner={LISTEN_ORDNER}
        hilfe="BEL-II-Preislisten aller KZVen (gerechnet wird mit der Liste der KZV der Praxis am Plandatum) und die GOZ für die Mehr- und Zusatzleistungen." />

      <div className="block">
        <h3>Vorgaben für neue Pläne</h3>
        <div className="formular">
          <label className="feld">
            Labor
            <select value={einst.labor} onChange={(e) => set({ labor: e.target.value as Labor })}>
              <option value="gewerbe">Gewerbliches Labor</option>
              <option value="praxis">Praxislabor</option>
            </select>
          </label>
          <label className="feld">
            Faktor für Privatleistungen (GOZ)
            <input type="number" min={1} max={3.5} step={0.1} value={einst.gozFaktor} onChange={(e) => set({ gozFaktor: zahl(e.target.value, 2.3) })} />
          </label>
        </div>
        <div className="schalter" style={{ marginTop: 10 }}>
          <label>
            <input type="checkbox" checked={einst.roentgenKfo} onChange={(e) => set({ roentgenKfo: e.target.checked })} />
            Röntgen zur KFO mit dem KFO-Punktwert abrechnen (Vorgabe der KZV; sonst KCH)
          </label>
          <label>
            <input type="checkbox" checked={einst.ohneEigenanteil121} onChange={(e) => set({ ohneEigenanteil121: e.target.checked })} />
            BEMA 121–124 ohne Eigenanteil (Vorgabe der KZV Bayerns)
          </label>
        </div>
      </div>

      <div className="block">
        <h3>Private Material- und Laborkosten <small className="grau">je Einheit, für Mehr- und Zusatzleistungen</small></h3>
        <p className="hilfe">Diese Preise legt die Praxis bzw. ihr Labor fest; es gibt keine amtliche Liste. Sie werden in neue Positionen übernommen.</p>
        <table className="pos-tabelle">
          <tbody>
            {mitMaterial.map((m) => (
              <tr key={m.id}>
                <td><span className={`art-marke ${m.art}`}>{m.art}</span></td>
                <td>{m.titel}</td>
                <td className="r">
                  <input className="zahl-feld" type="number" min={0} step={0.01} value={einst.materialPreise[m.id] ?? ''} placeholder="0"
                    onChange={(e) => {
                      const preise = { ...einst.materialPreise }
                      if (e.target.value === '') delete preise[m.id]
                      else preise[m.id] = zahl(e.target.value, 0)
                      set({ materialPreise: preise })
                    }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

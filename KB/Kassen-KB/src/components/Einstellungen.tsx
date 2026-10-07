import type { Einstellungen as EinstT, Labor } from '../types'
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

  return (
    <>
      <div className="block">
        <h3>Praxis</h3>
        <PraxisFelder art="kasse" praxis={einst.praxis} onChange={(praxis) => set({ praxis })} />
      </div>

      <PunktwertKarte
        bereiche={['KB', 'KCH']}
        praxis={einst.praxis}
        setPraxis={(praxis) => set({ praxis })}
        fest={einst.punktwertFest}
        setFest={(punktwertFest) => set({ punktwertFest })}
      />

      <ListenKarte listen={GENUTZTE_LISTEN} neueOrdner={LISTEN_ORDNER}
        hilfe="BEL-II-Preislisten aller KZVen; gerechnet wird mit der Liste der KZV der Praxis, die am Plandatum gilt." />

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
            Abformpauschale (605) je Abformung
            <input type="number" min={0} step={0.01} value={einst.abformPauschale} onChange={(e) => set({ abformPauschale: zahl(e.target.value, 3) })} />
          </label>
        </div>
        <div className="schalter" style={{ marginTop: 10 }}>
          <label>
            <input type="checkbox" checked={einst.kieferbruchKch} onChange={(e) => set({ kieferbruchKch: e.target.checked })} />
            Kieferbruch-Leistungen (GOÄ) mit dem KCH-Punktwert abrechnen (regionale Vorgabe der KZV)
          </label>
        </div>
      </div>
    </>
  )
}

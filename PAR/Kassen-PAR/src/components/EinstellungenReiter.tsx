import { ANALOG, GENUTZTE_LISTEN } from '../data/gebuehren'
import type { Einstellungen } from '../types'
import { PraxisFelder } from './Stammdaten'
import { PunktwertKarte } from './Punktwerte'
import { ListenKarte } from './Listen'
import { Feld, Karte } from './ui'

interface Props {
  einst: Einstellungen
  setEinst: (e: Einstellungen) => void
}

export default function EinstellungenReiter({ einst, setEinst }: Props) {
  return (
    <div className="reiter-inhalt">
      <Karte titel="Praxis">
        <PraxisFelder art="kasse" praxis={einst.praxis} onChange={(praxis) => setEinst({ ...einst, praxis })} />
      </Karte>

      <PunktwertKarte
        bereiche={['PAR', 'KCH']} praxis={einst.praxis} setPraxis={(praxis) => setEinst({ ...einst, praxis })}
        fest={einst.punktwertFest} setFest={(punktwertFest) => setEinst({ ...einst, punktwertFest })}
      />
      <p className="hinweis-klein">Anästhesie und Röntgen (BEMA Teil 1) laufen über den KCH-Punktwert, alles andere über den PAR-Punktwert.</p>
      <ListenKarte listen={GENUTZTE_LISTEN} />


      <Karte titel="Private Zusatzleistungen">
        <div className="feld-raster">
          <Feld label="Standardfaktor GOZ/GOÄ">
            <input type="number" step={0.1} min={1} max={3.5} value={einst.gozFaktor}
              onChange={(e) => setEinst({ ...einst, gozFaktor: Number(e.target.value) || 2.3 })} />
          </Feld>
          <Feld label="Faktor GOÄ Röntgen (Abschnitt O)">
            <input type="number" step={0.1} min={1} max={2.5} value={einst.roentgenFaktor}
              onChange={(e) => setEinst({ ...einst, roentgenFaktor: Number(e.target.value) || 1.8 })} />
          </Feld>
        </div>
        <h3>Analogliste (§ 6 GOZ)</h3>
        <table className="tabelle">
          <thead><tr><th>Leistung</th><th>Bezug (Vorgabe)</th><th>Punkte</th></tr></thead>
          <tbody>
            {Object.entries(ANALOG).map(([k, a]) => (
              <tr key={k}>
                <td>{a.titel}</td>
                <td>{a.bezug} ({a.punkte})</td>
                <td>
                  <input type="number" min={0} value={einst.analogPunkte[k] ?? a.punkte}
                    onChange={(e) => setEinst({ ...einst, analogPunkte: { ...einst.analogPunkte, [k]: Number(e.target.value) } })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>
    </div>
  )
}

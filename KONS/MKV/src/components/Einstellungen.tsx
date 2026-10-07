import type { Einstellungen as EinstT, MkvModell } from '../types'
import { BEMA_13 } from '../data/katalog'
import { PraxisFelder } from './Stammdaten'
import { PunktwertKarte } from './Punktwerte'
import { ListenKarte } from './Listen'
import { GENUTZTE_LISTEN } from '../engine/listen'

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
        bereiche={['KCH']} praxis={einst.praxis} setPraxis={(praxis) => set({ praxis })}
        fest={einst.punktwertFest} setFest={(punktwertFest) => set({ punktwertFest })}
      />
      <p className="hilfe">
        Kassenanteil: die Kasse zahlt die vergleichbare plastische Füllung,{' '}
        {BEMA_13.map((b) => `${b.nr} = ${b.punkte} Punkte`).join(', ')} (Stand 01.01.2025), mal Punktwert der KZV.
      </p>
      <ListenKarte listen={GENUTZTE_LISTEN} />

      <div className="block">
        <h3>Mehrkosten plastischer Füllungen</h3>
        <p className="hilfe">
          So rechnet Ihre Praxis die Mehrkosten. Bei festen Beträgen ermittelt der Planer den GOZ-Faktor, der genau diesen
          Betrag ergibt – die Rechnung bleibt eine GOZ-Rechnung, wie es das KZBV-Muster verlangt. Die Vorgaben gelten
          für neue Pläne; im laufenden Plan verstellen Sie sie oben mit den Reglern.
        </p>
        <div className="formular">
          <label className="feld">
            Modell
            <select value={einst.modell} onChange={(e) => set({ modell: e.target.value as MkvModell })}>
              <option value="proFlaeche">fester Betrag je Fläche</option>
              <option value="proZahn">fester Betrag je Füllung</option>
              <option value="gozDifferenz">GOZ-Faktor minus Kassenanteil</option>
            </select>
          </label>
          <label className="feld">
            Mehrkosten je Fläche (€)
            <input type="number" min={0} step={1} value={einst.proFlaeche} onChange={(e) => set({ proFlaeche: zahl(e.target.value, 0) })} />
          </label>
          <label className="feld">
            Mehrkosten je Füllung (€)
            <input type="number" min={0} step={5} value={einst.proZahn} onChange={(e) => set({ proZahn: zahl(e.target.value, 0) })} />
          </label>
          <label className="feld">
            GOZ-Faktor plastische Füllung
            <input type="number" min={1} max={5} step={0.1} value={einst.faktor} onChange={(e) => set({ faktor: zahl(e.target.value, 2.3) })} />
          </label>
          <label className="feld">
            GOZ-Faktor Inlay / Goldhämmer
            <input type="number" min={1} max={5} step={0.1} value={einst.inlayFaktor} onChange={(e) => set({ inlayFaktor: zahl(e.target.value, 2.3) })} />
          </label>
          <label className="feld">
            Vereinbarung gültig (Monate)
            <input type="number" min={1} max={24} value={einst.gueltigMonate} onChange={(e) => set({ gueltigMonate: zahl(e.target.value, 6) })} />
          </label>
        </div>
      </div>

      <div className="block">
        <h3>Laborpreise Einlagefüllungen</h3>
        <table className="preis-tabelle">
          <tbody>
            {einst.laborPreise.map((l, i) => (
              <tr key={l.id}>
                <td>
                  <input
                    value={l.name}
                    onChange={(e) => set({ laborPreise: einst.laborPreise.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                  />
                </td>
                <td className="r">
                  <input
                    type="number" min={0} step={1} value={l.preis}
                    onChange={(e) => set({ laborPreise: einst.laborPreise.map((x, j) => (j === i ? { ...x, preis: zahl(e.target.value, 0) } : x)) })}
                  />{' '}€
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fuss">Standardpreis; der Regler „Labor" oben verschiebt um −15 % bzw. +20 %.</p>
      </div>
    </>
  )
}

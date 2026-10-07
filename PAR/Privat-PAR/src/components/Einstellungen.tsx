import type { Einstellungen as EinstT, Variante } from '../types'
import { VARIANTE_NAME } from '../data/katalog'
import { GENUTZTE_LISTEN } from '../engine/listen'
import { PraxisFelder } from './Stammdaten'
import { ListenKarte } from './Listen'

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
        <PraxisFelder art="privat" praxis={einst.praxis} onChange={(praxis) => set({ praxis })} />
      </div>

      <ListenKarte listen={GENUTZTE_LISTEN} hilfe="GOZ-Punkte und Punktwert; die Analogleistungen rechnen mit der Bewertung ihrer Referenzleistung." />

      <div className="block">
        <h3>Vorgaben für neue Pläne</h3>
        <div className="formular">
          <label className="feld">
            GOZ-Faktor
            <input type="number" min={1} max={5} step={0.1} value={einst.faktor} onChange={(e) => set({ faktor: zahl(e.target.value, 2.3) })} />
          </label>
          <label className="feld">
            Heil- und Kostenplan gültig (Monate)
            <input type="number" min={1} max={24} value={einst.gueltigMonate} onChange={(e) => set({ gueltigMonate: zahl(e.target.value, 6) })} />
          </label>
          <label className="feld breit">
            Analogbewertung
            <select value={einst.variante} onChange={(e) => set({ variante: e.target.value as Variante })}>
              {(Object.keys(VARIANTE_NAME) as Variante[]).map((v) => <option key={v} value={v}>{VARIANTE_NAME[v]}</option>)}
            </select>
          </label>
        </div>
        <p className="hilfe">
          Beide Bewertungen hält die BZÄK für zulässig. PKV und Beihilfe erstatten vertraglich nach den Beschlüssen des
          Beratungsforums; die höher bewertete BZÄK-Neubewertung 2026 trägt ein Erstattungsrisiko für den Patienten.
        </p>
      </div>
    </>
  )
}

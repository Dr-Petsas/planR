import type { Einstellungen as EinstT } from '../types'
import { BEB_POSITIONEN } from '../data/katalog'
import { GENUTZTE_LISTEN, LABORLISTE_NAME, laborListenPreis } from '../engine/listen'
import { euro } from '../engine/kb'
import { PraxisFelder } from './Stammdaten'
import { ListenKarte } from './Listen'

interface Props {
  einst: EinstT
  setEinst: (e: EinstT) => void
}

const zahl = (v: string, fallback: number) => (v === '' || Number.isNaN(+v) ? fallback : +v)

export default function Einstellungen({ einst, setEinst }: Props) {
  const set = (patch: Partial<EinstT>) => setEinst({ ...einst, ...patch })
  const preisSetzen = (nr: string, v: string) => {
    const laborPreise = { ...einst.laborPreise }
    if (v === '' || Number.isNaN(+v)) delete laborPreise[nr]
    else laborPreise[nr] = +v
    set({ laborPreise })
  }

  return (
    <>
      <div className="block">
        <h3>Praxis</h3>
        <PraxisFelder art="privat" praxis={einst.praxis} onChange={(praxis) => set({ praxis })} />
      </div>

      <ListenKarte listen={GENUTZTE_LISTEN} hilfe="GOZ-Punkte und die Vorgabe-Laborpreise, mit denen dieser Planer rechnet." />

      <div className="block">
        <h3>Vorgaben für neue Pläne</h3>
        <div className="formular">
          <label className="feld">
            GOZ-Faktor Schienen und Provisorien
            <input type="number" min={1} max={5} step={0.1} value={einst.faktor} onChange={(e) => set({ faktor: zahl(e.target.value, 2.3) })} />
          </label>
          <label className="feld">
            GOZ-Faktor Funktionsanalyse
            <input type="number" min={1} max={5} step={0.1} value={einst.faFaktor} onChange={(e) => set({ faFaktor: zahl(e.target.value, 2.3) })} />
          </label>
          <label className="feld">
            Kostenvoranschlag gültig (Monate)
            <input type="number" min={1} max={24} value={einst.gueltigMonate} onChange={(e) => set({ gueltigMonate: zahl(e.target.value, 6) })} />
          </label>
          <label className="feld breit">
            Labor (erscheint im Kostenvoranschlag)
            <input value={einst.laborName} placeholder="z. B. Praxislabor oder Name des Fremdlabors" onChange={(e) => set({ laborName: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="block">
        <h3>Laborpreise</h3>
        <p className="hilfe">
          Leer = Preis der Laborliste ({LABORLISTE_NAME}) für die Leistung gleicher Bedeutung. Die Laborliste nummeriert
          Schienen teils anders als die BEB 97 – zugeordnet wird nach Inhalt, nicht nach Nummer.
        </p>
        <table className="preis-tabelle">
          <tbody>
            {BEB_POSITIONEN.map((b) => {
              const liste = laborListenPreis(b.labor)
              return (
                <tr key={b.nr}>
                  <td className="mono">{b.nr}</td>
                  <td>{b.text}{b.hinweis && <small className="grau"> · {b.hinweis}</small>}</td>
                  <td className="r grau">{liste != null ? euro(liste) : '—'}</td>
                  <td className="r">
                    <input type="number" min={0} step={0.01} value={einst.laborPreise[b.nr] ?? ''} placeholder={liste != null ? String(liste) : 'Preis'}
                      onChange={(e) => preisSetzen(b.nr, e.target.value)} />{' '}€
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

import type { Einstellungen as EinstT } from '../types'
import { LABOR_POSITIONEN, MEHR_MATERIAL } from '../data/katalog'
import { GENUTZTE_LISTEN, GOAE_NAME, LABORLISTE_NAME, laborListenPreis, laborText } from '../engine/listen'
import { euro } from '../engine/kfo'
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
  const mehrSetzen = (id: string, feld: 'preis' | 'standard', v: string) => {
    const alt = einst.mehrPreise[id] ?? { preis: 0, standard: 0 }
    set({ mehrPreise: { ...einst.mehrPreise, [id]: { ...alt, [feld]: zahl(v, 0) } } })
  }

  return (
    <>
      <div className="block">
        <h3>Praxis</h3>
        <PraxisFelder art="privat" praxis={einst.praxis} onChange={(praxis) => set({ praxis })} />
      </div>

      <ListenKarte listen={GENUTZTE_LISTEN} hilfe={`GOZ-Punkte und die Vorgabe-Laborpreise, mit denen dieser Planer rechnet. GOÄ: ${GOAE_NAME} (Punktwert seit 1996 unverändert, im Planer hinterlegt).`} />

      <div className="block">
        <h3>Vorgaben für neue Pläne</h3>
        <div className="formular">
          <label className="feld">
            GOZ-Faktor Abschnitt G
            <input type="number" min={1} max={5} step={0.1} value={einst.kfoFaktor} onChange={(e) => set({ kfoFaktor: zahl(e.target.value, 2.3) })} />
          </label>
          <label className="feld">
            GOZ-Faktor übrige Leistungen
            <input type="number" min={1} max={5} step={0.1} value={einst.faktor} onChange={(e) => set({ faktor: zahl(e.target.value, 2.3) })} />
          </label>
          <label className="feld">
            GOÄ-Faktor Röntgen (höchstens 2,5)
            <input type="number" min={1} max={2.5} step={0.1} value={einst.roeFaktor} onChange={(e) => set({ roeFaktor: Math.min(2.5, zahl(e.target.value, 1.8)) })} />
          </label>
          <label className="feld">
            Behandlungsdauer (Quartale)
            <input type="number" min={1} max={16} value={einst.quartale} onChange={(e) => set({ quartale: zahl(e.target.value, 12) })} />
          </label>
          <label className="feld">
            Heil- und Kostenplan gültig (Monate)
            <input type="number" min={1} max={24} value={einst.gueltigMonate} onChange={(e) => set({ gueltigMonate: zahl(e.target.value, 6) })} />
          </label>
          <label className="feld">
            Labor (erscheint im Plan)
            <input value={einst.laborName} placeholder="z. B. Praxislabor oder Fremdlabor" onChange={(e) => set({ laborName: e.target.value })} />
          </label>
        </div>
        <div className="schalter" style={{ marginTop: 10 }}>
          <label><input type="checkbox" checked={einst.digitalRoentgen} onChange={(e) => set({ digitalRoentgen: e.target.checked })} /> Praxis röntgt digital (Zuschlag GOÄ 5298)</label>
        </div>
      </div>

      <div className="block">
        <h3>Material über dem Standard</h3>
        <p className="hilfe">
          Brackets, Bänder und Bögen in Standardausführung sind in 6100, 6120, 6140 und 6150 enthalten. Für höherwertiges
          Material berechnet der Plan die Mehrkosten: Preis des Materials minus Kosten des Standardmaterials, das entfällt.
        </p>
        <table className="preis-tabelle">
          <thead><tr><th /><th className="r">Preis je Stück</th><th className="r">Standard je Stück</th></tr></thead>
          <tbody>
            {MEHR_MATERIAL.map((m) => (
              <tr key={m.id}>
                <td>{m.text} <small className="grau">· statt {m.gegen}</small></td>
                <td className="r"><input type="number" min={0} step={0.01} value={einst.mehrPreise[m.id]?.preis ?? ''} placeholder="Preis" onChange={(e) => mehrSetzen(m.id, 'preis', e.target.value)} /> €</td>
                <td className="r"><input type="number" min={0} step={0.01} value={einst.mehrPreise[m.id]?.standard ?? ''} placeholder="0" onChange={(e) => mehrSetzen(m.id, 'standard', e.target.value)} /> €</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="block">
        <h3>Laborpreise</h3>
        <p className="hilfe">Leer = Preis der Laborliste ({LABORLISTE_NAME}). KFO-Labore haben eigene Preislisten – hier die Preise des eigenen Labors eintragen.</p>
        <table className="preis-tabelle">
          <tbody>
            {LABOR_POSITIONEN.map((nr) => {
              const liste = laborListenPreis(nr)
              return (
                <tr key={nr}>
                  <td className="mono">{nr}</td>
                  <td>{laborText(nr)}</td>
                  <td className="r grau">{liste != null ? euro(liste) : '—'}</td>
                  <td className="r">
                    <input type="number" min={0} step={0.01} value={einst.laborPreise[nr] ?? ''} placeholder={liste != null ? String(liste) : 'Preis'}
                      onChange={(e) => preisSetzen(nr, e.target.value)} />{' '}€
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

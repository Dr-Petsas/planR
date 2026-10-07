import type { ImplantatDetail } from '../types'
import { IMPLANTATKOERPER } from '../data/implantatkoerper'

interface Props {
  /** Zähne mit geplantem Implantat */
  zaehne: string[]
  implantate: Record<string, ImplantatDetail>
  onChange: (implantate: Record<string, ImplantatDetail>) => void
}

export const STANDARD_IMPLANTAT: ImplantatDetail = {
  system: 'durchschnitt', durchmesser: 4.1, laenge: 10, zeitpunkt: 'verzoegert', deckung: 'gedeckt', abutment: 'standard',
}

export function ImplantatDetails({ zaehne, implantate, onChange }: Props) {
  if (!zaehne.length) return null
  const setzen = (z: string, aend: Partial<ImplantatDetail>) =>
    onChange({ ...implantate, [z]: { ...STANDARD_IMPLANTAT, ...implantate[z], ...aend } })

  return (
    <div className="impl-details">
      <table className="impl-tabelle">
        <thead>
          <tr><th>Zahn</th><th>System</th><th>Ø mm</th><th>Länge mm</th><th>Zeitpunkt</th><th>Deckung</th></tr>
        </thead>
        <tbody>
          {zaehne.map((z) => {
            const d = { ...STANDARD_IMPLANTAT, ...implantate[z] }
            return (
              <tr key={z}>
                <td><b>{z}</b></td>
                <td>
                  <select value={d.system} onChange={(e) => setzen(z, { system: e.target.value })}>
                    {IMPLANTATKOERPER.map((s) => <option key={s.id} value={s.id}>{s.hersteller} {s.system}</option>)}
                  </select>
                </td>
                <td><input type="number" step="0.1" value={d.durchmesser} onChange={(e) => setzen(z, { durchmesser: Number(e.target.value) })} /></td>
                <td><input type="number" step="0.5" value={d.laenge} onChange={(e) => setzen(z, { laenge: Number(e.target.value) })} /></td>
                <td>
                  <select value={d.zeitpunkt} onChange={(e) => setzen(z, { zeitpunkt: e.target.value as ImplantatDetail['zeitpunkt'] })}>
                    <option value="sofort">Sofort</option>
                    <option value="verzoegert">verzögert</option>
                    <option value="spaet">spät</option>
                  </select>
                </td>
                <td>
                  <select value={d.deckung} onChange={(e) => setzen(z, { deckung: e.target.value as ImplantatDetail['deckung'] })}>
                    <option value="gedeckt">zweizeitig (gedeckt)</option>
                    <option value="offen">einzeitig (offen)</option>
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

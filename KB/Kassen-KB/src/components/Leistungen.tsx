import { useState } from 'react'
import type { Einstellungen, Ebene, Plan, Position, Rechnung } from '../types'
import { VORLAGEN } from '../data/katalog'
import { euro, neueId, vorlageAnwenden } from '../engine/kb'
import { BEMA, belListeFuer, belNr } from '../engine/listen'
import { kzvDerPraxis } from '../punktwerte'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  rechnung: Rechnung
}

const zahl = (v: string) => (v === '' || Number.isNaN(+v) ? undefined : +v)

/** BEL-II-Nummern, die bei Aufbissbehelfen, UKPS und Kieferbruch-Schienen vorkommen */
const BEL_KB = [
  '0010', '0015', '0021', '0025', '0115', '0120', '0125', '0205', '0217', '1550', '3020', '3620', '3800', '3810', '3821', '3822',
  '4010', '4020', '4030', '4040', '5010', '5020', '5100', '5110', '5200', '5210', '7100', '8085', '8500', '8511', '8512', '8513',
  '8514', '8610', '8620', '9330', '9335',
]

export default function Leistungen({ plan, setPlan, einst, rechnung }: Props) {
  const [neuEbene, setNeuEbene] = useState<Ebene>('BEMA')
  const [neuNr, setNeuNr] = useState('K1')
  const setPos = (positionen: Position[]) => setPlan({ ...plan, positionen })
  const aendern = (id: string, patch: Partial<Position>) => setPos(plan.positionen.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const zeile = (id: string) => [...rechnung.honorar, ...rechnung.labor, ...rechnung.material].find((z) => z.id === id)
  const liste = belListeFuer(kzvDerPraxis(einst.praxis) || '11', plan.datum)
  const belText = new Map((liste?.eintraege ?? []).map((e) => [e.nr, e.text] as const))
  const vorlagen = VORLAGEN.filter((v) => v.art === plan.angaben.art)

  const hinzufuegen = () => {
    const material = neuEbene === 'MATERIAL'
    setPos([...plan.positionen, { id: neueId(), ebene: neuEbene, nr: material ? 'Mat.' : neuNr, anzahl: 1, ...(material ? { text: '', preis: 0 } : {}) }])
  }

  const gruppen = [
    { titel: 'Honorar (BEMA Teil 2 · GOÄ)', ebene: 'BEMA' as Ebene },
    { titel: `Labor (${rechnung.belListe})`, ebene: 'BEL' as Ebene },
    { titel: 'Material', ebene: 'MATERIAL' as Ebene },
  ]

  return (
    <>
      <div className="block">
        <h3>Behandlung wählen</h3>
        <p className="hilfe">Jede Vorlage fügt die BEMA-Leistungen und die übliche BEL-II-Laborkette hinzu – Anzahl und Preis bleiben einzeln änderbar.</p>
        <div className="vorlagen">
          {vorlagen.map((v) => (
            <button key={v.id} className="vorlage" onClick={() => setPos(vorlageAnwenden(plan.positionen, v.pos))}>
              <b>{v.titel}</b>
              <small>{v.text}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <h3>Positionen</h3>
        {plan.positionen.length === 0 && <p className="leer">Noch keine Position – oben eine Behandlung wählen oder unten einzeln hinzufügen.</p>}
        {gruppen.map((g) => {
          const pos = plan.positionen.filter((p) => p.ebene === g.ebene)
          if (!pos.length) return null
          return (
            <table className="pos-tabelle" key={g.titel}>
              <thead>
                <tr><th colSpan={2}>{g.titel}</th><th className="r">Anzahl</th><th className="r">{g.ebene === 'BEMA' ? 'Punkte' : 'Einzelpreis'}</th><th className="r">Betrag</th><th /></tr>
              </thead>
              <tbody>
                {pos.map((p) => {
                  const z = zeile(p.id)
                  return (
                    <tr key={p.id} className={z?.ohnePreis ? 'mit-warnung' : ''}>
                      <td className="mono nr">{p.ebene === 'BEL' ? belNr(p.nr) : p.ebene === 'MATERIAL' && p.nr !== '605' ? 'Mat.' : p.nr}</td>
                      <td>
                        {p.ebene === 'MATERIAL' && p.nr !== '605'
                          ? <input className="text-feld" value={p.text ?? ''} placeholder="Material" onChange={(e) => aendern(p.id, { text: e.target.value })} />
                          : <span>{z?.text ?? p.nr}</span>}
                      </td>
                      <td className="r">
                        <input className="zahl-feld" type="number" min={0} step={1} value={p.anzahl}
                          onChange={(e) => aendern(p.id, { anzahl: zahl(e.target.value) ?? 0 })} />
                      </td>
                      <td className="r">
                        {p.ebene === 'BEMA' ? (
                          <span className="grau">{z?.punkte ?? '—'}</span>
                        ) : (
                          <input className="zahl-feld" type="number" min={0} step={0.01} value={p.preis ?? ''}
                            placeholder={z && p.preis == null ? String(z.einzel) : '0'}
                            title="eigener Preis (leer = BEL II der KZV bzw. Pauschale aus den Einstellungen)"
                            onChange={(e) => aendern(p.id, { preis: zahl(e.target.value) })} />
                        )}
                      </td>
                      <td className="r">{z ? euro(z.summe) : '—'}</td>
                      <td><button className="x" title="Position entfernen" onClick={() => setPos(plan.positionen.filter((x) => x.id !== p.id))}>×</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        })}

        <div className="pos-neu">
          <select value={neuEbene} onChange={(e) => {
            const eb = e.target.value as Ebene
            setNeuEbene(eb)
            setNeuNr(eb === 'BEMA' ? 'K1' : eb === 'BEL' ? '0010' : '605')
          }}>
            <option value="BEMA">BEMA / GOÄ</option>
            <option value="BEL">Labor (BEL II)</option>
            <option value="MATERIAL">Material</option>
          </select>
          {neuEbene === 'BEMA' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {[...new Set(BEMA.map((b) => b.gruppe))].map((gr) => (
                <optgroup key={gr} label={gr}>
                  {BEMA.filter((b) => b.gruppe === gr).map((b) => (
                    <option key={b.nr} value={b.nr}>{b.nr} {b.text.slice(0, 70)} ({b.punkte} P.)</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {neuEbene === 'BEL' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {BEL_KB.map((nr) => <option key={nr} value={nr}>{belNr(nr)} {belText.get(nr) ?? ''}</option>)}
            </select>
          )}
          {neuEbene === 'MATERIAL' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              <option value="605">Abformung (Pauschale 605)</option>
              <option value="Mat.">sonstiges Material</option>
            </select>
          )}
          <button className="sekundaer klein-btn" onClick={() => {
            if (neuEbene === 'MATERIAL' && neuNr === '605') setPos([...plan.positionen, { id: neueId(), ebene: 'MATERIAL', nr: '605', anzahl: 1 }])
            else hinzufuegen()
          }}>Position hinzufügen</button>
        </div>
      </div>

      {(rechnung.warnungen.length > 0 || rechnung.hinweise.length > 0) && (
        <ul className="hinweise">
          {rechnung.warnungen.map((h) => <li key={h} className="warn">{h}</li>)}
          {rechnung.hinweise.map((h) => <li key={h}>{h}</li>)}
        </ul>
      )}
    </>
  )
}

import { useState } from 'react'
import type { Einstellungen, Ebene, Plan, Position, Rechnung } from '../types'
import { BEB_POSITIONEN, GOZ_POSITIONEN, VORLAGEN, VORLAGEN_GRUPPEN, type VorlagenPosition } from '../data/katalog'
import { abformungAnwenden, euro, laborGrundpreis, neueId, positionsFaktor, vorlageAnwenden } from '../engine/kb'
import { gozText } from '../engine/listen'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  rechnung: Rechnung
}

const zahl = (v: string) => (v === '' || Number.isNaN(+v) ? undefined : +v)

export default function Leistungen({ plan, setPlan, einst, rechnung }: Props) {
  const [neuEbene, setNeuEbene] = useState<Ebene>('GOZ')
  const [neuNr, setNeuNr] = useState('7010')
  const setPos = (positionen: Position[]) => setPlan({ ...plan, positionen })
  const aendern = (id: string, patch: Partial<Position>) => setPos(plan.positionen.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const zeile = (id: string) => [...rechnung.honorar, ...rechnung.labor].find((z) => z.id === id)

  const vorlageNehmen = (pos: VorlagenPosition[]) => {
    const neu = vorlageAnwenden(plan.positionen, pos, einst)
    setPos(plan.abformung === 'scan' ? abformungAnwenden(neu, 'scan') : neu)
  }

  const hinzufuegen = () => {
    if (neuEbene === 'GOZ' && neuNr === 'analog') {
      setPos([...plan.positionen, { id: neueId(), ebene: 'GOZ', nr: einst.ukpsAnalog || '5220', anzahl: 1, analog: true, text: '' }])
      return
    }
    const nr = neuEbene === 'MATERIAL' ? 'Mat.' : neuNr
    setPos([...plan.positionen, { id: neueId(), ebene: neuEbene, nr, anzahl: 1, ...(neuEbene === 'MATERIAL' ? { text: '', preis: 0 } : {}) }])
  }

  const gruppen = [
    { titel: 'Honorar (GOZ)', ebenen: ['GOZ'] as Ebene[] },
    { titel: 'Labor und Material (§ 9 GOZ)', ebenen: ['LABOR', 'MATERIAL'] as Ebene[] },
  ]

  return (
    <>
      <div className="block">
        <h3>Behandlung wählen</h3>
        <p className="hilfe">Jede Vorlage fügt die üblichen GOZ- und Laborpositionen hinzu – Anzahl, Faktor und Preis bleiben einzeln änderbar.</p>
        {VORLAGEN_GRUPPEN.map((gr) => (
          <div key={gr}>
            <div className="vorlagen-gruppe">{gr}</div>
            <div className="vorlagen">
              {VORLAGEN.filter((v) => v.gruppe === gr).map((v) => (
                <button key={v.id} className="vorlage" onClick={() => vorlageNehmen(v.pos)}>
                  <b>{v.titel}</b>
                  <small>{v.text}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="block">
        <h3>Positionen</h3>
        {plan.positionen.length === 0 && <p className="leer">Noch keine Position – oben eine Behandlung wählen oder unten einzeln hinzufügen.</p>}
        {gruppen.map((g) => {
          const pos = plan.positionen.filter((p) => g.ebenen.includes(p.ebene))
          if (!pos.length) return null
          return (
            <table className="pos-tabelle" key={g.titel}>
              <thead>
                <tr><th colSpan={2}>{g.titel}</th><th className="r">Anzahl</th><th className="r">{g.ebenen[0] === 'GOZ' ? 'Faktor' : 'Einzelpreis'}</th><th className="r">Betrag</th><th /></tr>
              </thead>
              <tbody>
                {pos.map((p) => {
                  const z = zeile(p.id)
                  return (
                    <tr key={p.id} className={z?.ohnePreis ? 'mit-warnung' : ''}>
                      <td className="mono nr">{p.ebene === 'MATERIAL' ? 'Mat.' : p.analog ? `${p.nr}a` : p.nr}</td>
                      <td>
                        {p.ebene === 'MATERIAL' ? (
                          <input className="text-feld" value={p.text ?? ''} placeholder="Material, z. B. Folie" onChange={(e) => aendern(p.id, { text: e.target.value })} />
                        ) : p.analog ? (
                          <>
                            <input className="text-feld" value={p.text ?? ''} placeholder="erbrachte Leistung" onChange={(e) => aendern(p.id, { text: e.target.value })} />
                            <small className="grau">
                              entsprechend GOZ{' '}
                              <select value={p.nr} onChange={(e) => aendern(p.id, { nr: e.target.value })}>
                                {[...new Set([p.nr, '5220', '5230', '7010', '7050', '7060', '8010', '2270'])].map((nr) => (
                                  <option key={nr} value={nr}>{nr} {gozText(nr).slice(0, 50)}</option>
                                ))}
                              </select>
                            </small>
                          </>
                        ) : <span>{z?.text ?? (p.ebene === 'GOZ' ? gozText(p.nr) : p.nr)}</span>}
                        {p.ausXml && <span className="xml-marke" title="Preis aus dem Labor-XML">XML</span>}
                        {z?.platzhalter && <span className="xml-marke" title="Platzhalterpreis – Kostenvoranschlag einlesen">Platzhalter</span>}
                      </td>
                      <td className="r">
                        <input className="zahl-feld" type="number" min={0} step={1} value={p.anzahl}
                          onChange={(e) => aendern(p.id, { anzahl: zahl(e.target.value) ?? 0 })} />
                      </td>
                      <td className="r">
                        {p.ebene === 'GOZ' ? (
                          <input className="zahl-feld" type="number" min={1} max={5} step={0.1} value={positionsFaktor(p, plan)}
                            title="eigener Faktor für diese Position (leer = Regler)"
                            onChange={(e) => aendern(p.id, { faktor: zahl(e.target.value) })} />
                        ) : (
                          <input className="zahl-feld" type="number" min={0} step={0.01}
                            value={p.preis ?? ''} placeholder={p.ebene === 'LABOR' ? String(laborGrundpreis(p.nr, einst) ?? '') : '0'}
                            title="eigener Preis (leer = Laborpreis aus den Einstellungen bzw. der Laborliste)"
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
            setNeuNr(eb === 'GOZ' ? '7010' : eb === 'LABOR' ? '7621' : '')
          }}>
            <option value="GOZ">GOZ</option>
            <option value="LABOR">Labor (BEB)</option>
            <option value="MATERIAL">Material</option>
          </select>
          {neuEbene === 'GOZ' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {['Aufbissbehelf', 'Provisorium', 'Funktionsanalyse', 'Begleitend'].map((gr) => (
                <optgroup key={gr} label={gr}>
                  {GOZ_POSITIONEN.filter((g) => g.gruppe === gr).map((g) => (
                    <option key={g.nr} value={g.nr}>{g.nr} {gozText(g.nr).slice(0, 70)}</option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="Analog (§ 6 Abs. 1 GOZ)">
                <option value="analog">Analogleistung, z. B. UKPS – Bemessung wählbar</option>
              </optgroup>
            </select>
          )}
          {neuEbene === 'LABOR' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              <optgroup label="Schienen">
                {BEB_POSITIONEN.filter((b) => !b.begleit && !b.fremd).map((b) => <option key={b.nr} value={b.nr}>{b.nr} {b.text}</option>)}
              </optgroup>
              <optgroup label="Modelle, Artikulator, Aufbisse, Versand">
                {BEB_POSITIONEN.filter((b) => b.begleit && !b.fremd).map((b) => <option key={b.nr} value={b.nr}>{b.nr} {b.text}</option>)}
              </optgroup>
              <optgroup label="Fremdlabor (Platzhalter bis Kostenvoranschlag)">
                {BEB_POSITIONEN.filter((b) => b.fremd).map((b) => <option key={b.nr} value={b.nr}>{b.nr} {b.text}</option>)}
              </optgroup>
            </select>
          )}
          <button className="sekundaer klein-btn" onClick={hinzufuegen}>Position hinzufügen</button>
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

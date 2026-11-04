import { useState } from 'react'
import type { Einstellungen, Ebene, Plan, Position, Rechnung } from '../types'
import { BEB_POSITIONEN, GOZ_POSITIONEN, UKPS_BEMESSUNG_STANDARD, VORLAGEN, VORLAGEN_GRUPPEN, type VorlagenPosition } from '../data/katalog'
import { abformungAnwenden, euro, laborGrundpreis, neueId, positionsFaktor, umfangAnwenden, vorlageAnwenden, vorlageEnthalten, vorlageEntfernen } from '../engine/kb'
import { GOAE_POSITIONEN, goaeText, gozText } from '../engine/listen'
import { vorschlaege, vorschlagAnwenden } from '../engine/vorschlaege'

/** Prothese umarbeiten und Unterfütterung gehören in den ZE-Planer */
const ZE_LEISTUNGEN = ['7020', '7030']

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
  const [einzeln, setEinzeln] = useState(false)
  const setPos = (positionen: Position[]) => setPlan({ ...plan, positionen })
  const aendern = (id: string, patch: Partial<Position>) => setPos(plan.positionen.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const zeile = (id: string) => [...rechnung.honorar, ...rechnung.labor].find((z) => z.id === id)

  const aktiv = new Set(plan.vorlagen
    ?? VORLAGEN.filter((v) => vorlageEnthalten(plan.positionen, v.pos, plan.abformung, einst)).map((v) => v.id))
  const vorlageUmschalten = (id: string, pos: VorlagenPosition[]) => {
    const eigene = plan.positionen.filter((p) => !p.umfang)
    if (aktiv.has(id)) {
      setPlan({ ...plan, vorlagen: [...aktiv].filter((x) => x !== id), positionen: umfangAnwenden(vorlageEntfernen(eigene, pos, plan.abformung, einst), plan.regler.faktor, plan.thema) })
      return
    }
    const neu = vorlageAnwenden(eigene, pos, einst)
    setPlan({ ...plan, vorlagen: [...aktiv, id], positionen: umfangAnwenden(plan.abformung === 'scan' ? abformungAnwenden(neu, 'scan') : neu, plan.regler.faktor, plan.thema) })
  }

  const hinzufuegen = () => {
    if (neuEbene === 'GOZ' && neuNr === 'analog') {
      setPos([...plan.positionen, { id: neueId(), ebene: 'GOZ', nr: einst.ukpsAnalog || UKPS_BEMESSUNG_STANDARD, anzahl: 1, analog: true, text: '' }])
      return
    }
    const nr = neuEbene === 'MATERIAL' ? 'Mat.' : neuNr
    setPos([...plan.positionen, { id: neueId(), ebene: neuEbene, nr, anzahl: 1, ...(neuEbene === 'MATERIAL' ? { text: '', preis: 0 } : {}) }])
  }

  const gruppen = [
    { titel: 'Honorar (GOZ, GOÄ-Röntgen)', ebenen: ['GOZ', 'GOAE'] as Ebene[] },
    { titel: 'Labor und Material (§ 9 GOZ)', ebenen: ['LABOR', 'MATERIAL'] as Ebene[] },
  ]

  return (
    <>
      <div className="schnellstart" title="Ein Klick fügt die üblichen GOZ- und Laborpositionen der Behandlung zum Plan hinzu">
        {VORLAGEN_GRUPPEN.map((gr, i) => (
          <div key={gr} className={`ss-gruppe ss-${i}`}>
            <span className="ss-titel">{gr}</span>
            <div className="ss-knoepfe">
              {VORLAGEN.filter((v) => v.gruppe === gr).map((v) => (
                <button key={v.id} className={`ss-knopf${aktiv.has(v.id) ? ' aktiv' : ''}`} aria-pressed={aktiv.has(v.id)}
                  title={`${v.titel}: ${v.text}${aktiv.has(v.id) ? ' – im Plan, Klick nimmt sie wieder heraus' : ''}`}
                  onClick={() => vorlageUmschalten(v.id, v.pos)}>
                  {aktiv.has(v.id) && <span className="ss-haken">✓</span>}{v.titel}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="block">
        <h3 className="block-kopf">
          Positionen
          {plan.positionen.length > 0 && (
            <button className="link-btn" onClick={() => window.confirm('Alle Positionen aus dem Plan entfernen?') && setPlan({ ...plan, positionen: [], vorlagen: [] })}>alle entfernen</button>
          )}
        </h3>
        {plan.positionen.length === 0 && <p className="leer">Noch keine Position – oben eine Behandlung anklicken oder unten einzeln hinzufügen.</p>}
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
                      <td className="mono nr">{p.ebene === 'MATERIAL' ? 'Mat.' : p.ebene === 'GOAE' ? `Ä${p.nr}` : p.analog ? `${p.nr}a` : p.nr}</td>
                      <td className="pos-text">
                        {p.umfang && <span className="xml-marke umfang-marke" title="vom Umfang-Regler hinzugefügt – nur berechnen, wenn erbracht">Umfang</span>}
                        {p.ebene === 'MATERIAL' ? (
                          <input className="text-feld" value={p.text ?? ''} placeholder="Material, z. B. Folie" onChange={(e) => aendern(p.id, { text: e.target.value })} />
                        ) : p.analog ? (
                          <div className="analog-zeile">
                            <input className="text-feld" value={p.text ?? ''} placeholder="erbrachte Leistung" title={p.text} onChange={(e) => aendern(p.id, { text: e.target.value })} />
                            <small className="grau" title={`entsprechend GOZ ${p.nr}: ${gozText(p.nr)}`}>
                              entspr.{' '}
                              <select value={p.nr} onChange={(e) => aendern(p.id, { nr: e.target.value })}>
                                {[...new Set([p.nr, '6070', '7010', '4000', '8050', '5090', '6210', '5260', '7050', '7060', '5220', '5230', '8010', '2270'])].map((nr) => (
                                  <option key={nr} value={nr}>{nr} {gozText(nr).slice(0, 50)}</option>
                                ))}
                              </select>
                            </small>
                          </div>
                        ) : ((t) => <span title={t}>{t}</span>)(z?.text ?? (p.ebene === 'GOZ' ? gozText(p.nr) : p.ebene === 'GOAE' ? goaeText(p.nr) : p.nr))}
                        {p.ausXml && <span className="xml-marke" title="Preis aus dem Labor-XML">XML</span>}                        {z?.platzhalter && <span className="xml-marke" title="Platzhalterpreis – Kostenvoranschlag einlesen">Platzhalter</span>}
                      </td>
                      <td className="r">
                        <input className="zahl-feld" type="number" min={0} step={1} value={p.anzahl}
                          onChange={(e) => aendern(p.id, { anzahl: zahl(e.target.value) ?? 0 })} />
                      </td>
                      <td className="r">
                        {p.ebene === 'GOZ' || p.ebene === 'GOAE' ? (
                          <input className="zahl-feld" type="number" min={1} max={p.ebene === 'GOAE' ? 2.5 : 5} step={0.1} value={positionsFaktor(p, plan)}
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

        {(() => {
          const vs = vorschlaege(plan, einst)
          return vs.length > 0 && (
            <div className="vorschlaege">
              <span className="vs-titel">Passt dazu</span>
              {vs.map((v) => (
                <button key={v.id} className="vs-karte" onClick={() => setPlan(vorschlagAnwenden(plan, v, einst))}
                  title={`Fügt hinzu: ${v.pos.map((p) => `${p.ebene === 'GOAE' ? 'Ä' : p.ebene === 'LABOR' ? 'BEB ' : ''}${p.nr}${p.anzahl > 1 ? ` × ${p.anzahl}` : ''}`).join(', ')}`}>
                  <span className="vs-kopf"><b>{v.titel}</b><span className="vs-preis">{v.mehr >= 0 ? '+' : ''}{euro(v.mehr)}</span></span>
                  <span className="vs-warum">{v.warum}</span>
                </button>
              ))}
            </div>
          )
        })()}

        {!einzeln ? (
          <button className="link-btn einzeln-link" onClick={() => setEinzeln(true)}>einzelne Position …</button>
        ) : (
        <div className="pos-neu">
          <select value={neuEbene} onChange={(e) => {
            const eb = e.target.value as Ebene
            setNeuEbene(eb)
            setNeuNr(eb === 'GOZ' ? '7010' : eb === 'GOAE' ? '5004' : eb === 'LABOR' ? '7621' : '')
          }}>
            <option value="GOZ">GOZ</option>
            <option value="GOAE">Röntgen (GOÄ)</option>
            <option value="LABOR">Labor (BEB)</option>
            <option value="MATERIAL">Material</option>
          </select>
          {neuEbene === 'GOZ' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {['Aufbissbehelf', 'Provisorium', 'Funktionsanalyse', 'Begleitend'].map((gr) => (
                <optgroup key={gr} label={gr}>
                  {GOZ_POSITIONEN.filter((g) => g.gruppe === gr && !ZE_LEISTUNGEN.includes(g.nr)).map((g) => (
                    <option key={g.nr} value={g.nr}>{g.nr} {gozText(g.nr).slice(0, 70)}</option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="Analog (§ 6 Abs. 1 GOZ)">
                <option value="analog">Analogleistung, z. B. UKPS – Bemessung wählbar</option>
              </optgroup>
            </select>
          )}
          {neuEbene === 'GOAE' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {GOAE_POSITIONEN.map((nr) => <option key={nr} value={nr}>Ä{nr} {goaeText(nr)}</option>)}
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
          <button className="sekundaer klein-btn" onClick={hinzufuegen}>hinzufügen</button>
          <button className="x" title="schließen" onClick={() => setEinzeln(false)}>×</button>
        </div>
        )}
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

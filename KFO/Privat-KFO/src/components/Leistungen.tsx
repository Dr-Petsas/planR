import { useState } from 'react'
import type { Einstellungen, Ebene, Plan, Position, Rechnung, Zeile } from '../types'
import { ANALOG_LEISTUNGEN, GOAE_POSITIONEN, GOZ_POSITIONEN, LABOR_POSITIONEN, MEHR_MATERIAL, VORLAGEN } from '../data/katalog'
import { euro, grenzen, istZuschlag, laborGrundpreis, mehrPreise, neueId, positionsFaktor, vorlageAnwenden } from '../engine/kfo'
import { bezugNr, goaeEintrag, gozText, istAnalog, laborText } from '../engine/listen'
import Aufgabe from './Aufgabe'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  rechnung: Rechnung
}

type NeuArt = Ebene | 'ANALOG'

const zahl = (v: string) => (v === '' || Number.isNaN(+v) ? undefined : +v)
const START: Record<NeuArt, string> = { GOZ: '6100', GOAE: '5004', ANALOG: 'attachment', LABOR: '7001', MATERIAL: '', MEHR: 'keramik' }

export default function Leistungen({ plan, setPlan, einst, rechnung }: Props) {
  const [neuArt, setNeuArt] = useState<NeuArt>('GOZ')
  const [neuNr, setNeuNr] = useState(START.GOZ)
  const setPos = (positionen: Position[]) => setPlan({ ...plan, positionen })
  const aendern = (id: string, patch: Partial<Position>) => setPos(plan.positionen.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const zeilen = [...rechnung.honorar, ...rechnung.labor, ...rechnung.mehr]
  const zeile = (id: string) => zeilen.find((z) => z.id === id)
  const zuschlag = (id: string) => rechnung.honorar.find((z) => z.id === `${id}-5298`)

  const hinzufuegen = () => {
    if (neuArt === 'ANALOG') {
      const a = ANALOG_LEISTUNGEN.find((x) => x.id === neuNr)
      setPos([...plan.positionen, { id: neueId(), ebene: 'GOZ', nr: `${a?.bezug ?? ''}a`, anzahl: 1, text: a?.text ?? '' }])
      return
    }
    if (neuArt === 'MATERIAL') {
      setPos([...plan.positionen, { id: neueId(), ebene: 'MATERIAL', nr: 'Mat.', anzahl: 1, text: '' }])
      return
    }
    setPos([...plan.positionen, { id: neueId(), ebene: neuArt, nr: neuNr, anzahl: 1 }])
  }

  const gruppen = [
    { titel: 'Honorar (GOZ · GOÄ)', ebenen: ['GOZ', 'GOAE'] as Ebene[], spalte: 'Faktor' },
    { titel: 'Material- und Laborkosten (§ 9 GOZ)', ebenen: ['LABOR', 'MATERIAL'] as Ebene[], spalte: 'Einzelpreis' },
  ]

  const nrZelle = (p: Position) => {
    if (p.ebene === 'GOZ' && istAnalog(p.nr)) {
      return (
        <input className="zahl-feld nr-feld" value={bezugNr(p.nr)} placeholder="Bezug" title="Bezugsleistung (GOZ-Nummer gleichwertiger Art, Kosten und Zeit)"
          onChange={(e) => aendern(p.id, { nr: `${e.target.value.replace(/\D/g, '').slice(0, 4)}a` })} />
      )
    }
    return p.ebene === 'GOAE' ? `Ä${p.nr}` : p.ebene === 'LABOR' || p.ebene === 'GOZ' ? p.nr : 'Mat.'
  }

  const textZelle = (p: Position, z: Zeile | undefined) => {
    if (p.ebene === 'MATERIAL' || (p.ebene === 'GOZ' && istAnalog(p.nr))) {
      return (
        <>
          <input className="text-feld" value={p.text ?? ''} placeholder={p.ebene === 'MATERIAL' ? 'Material oder Fremdlabor, z. B. Aligner-Serie' : 'Beschreibung der Analogleistung'}
            onChange={(e) => aendern(p.id, { text: e.target.value })} />
          {z?.analog && <small className="analog-text">{z.analog}</small>}
        </>
      )
    }
    return <span>{z?.text ?? (p.ebene === 'GOZ' ? gozText(p.nr) : p.ebene === 'GOAE' ? goaeEintrag(p.nr)?.text : laborText(p.nr) ?? p.nr)}</span>
  }

  return (
    <>
      <Aufgabe plan={plan} setPlan={setPlan} rechnung={rechnung} />

      <div className="block">
        <h3>Bausteine</h3>
        <p className="hilfe">Jeder Baustein fügt typische Einzelleistungen hinzu – Anzahl, Faktor und Preis bleiben einzeln änderbar. Abformung und Eingliederung herausnehmbarer Geräte sind in der Behandlungsaufgabe enthalten; die Bausteine bringen dafür nur das Labor.</p>
        <div className="vorlagen">
          {VORLAGEN.map((v) => (
            <button key={v.id} className="vorlage" onClick={() => setPos(vorlageAnwenden(plan.positionen, v.pos))}>
              <b>{v.titel}</b>
              <small>{v.text}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <h3>Positionen</h3>
        {rechnung.aufgabe.length > 0 && (
          <table className="pos-tabelle">
            <thead><tr><th colSpan={2}>Behandlungsaufgabe (aus den Kriterien)</th><th className="r">Anzahl</th><th className="r">Faktor</th><th className="r">Betrag</th><th /></tr></thead>
            <tbody>
              {rechnung.aufgabe.map((z) => (
                <tr key={z.id}>
                  <td className="mono nr">{z.nr}</td><td>{z.text}</td><td className="r">1</td>
                  <td className="r grau" title="Faktor aus dem Regler Abschnitt G">{z.faktor?.toLocaleString('de-DE')}</td>
                  <td className="r">{euro(z.summe)}</td><td />
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {plan.positionen.length === 0 && !rechnung.aufgabe.length && <p className="leer">Noch keine Position – oben die Behandlungsaufgabe festlegen, einen Baustein wählen oder unten einzeln hinzufügen.</p>}
        {gruppen.map((g) => {
          const pos = plan.positionen.filter((p) => g.ebenen.includes(p.ebene))
          if (!pos.length) return null
          return (
            <table className="pos-tabelle" key={g.titel}>
              <thead>
                <tr><th colSpan={2}>{g.titel}</th><th className="r">Anzahl</th><th className="r">{g.spalte}</th><th className="r">Betrag</th><th /></tr>
              </thead>
              <tbody>
                {pos.map((p) => {
                  const z = zeile(p.id)
                  const zu = zuschlag(p.id)
                  const honorar = p.ebene === 'GOZ' || p.ebene === 'GOAE'
                  return (
                    <tr key={p.id} className={z?.ohnePreis ? 'mit-warnung' : ''}>
                      <td className="mono nr">{nrZelle(p)}</td>
                      <td>
                        {textZelle(p, z)}
                        {zu && <small className="analog-text">+ Ä5298 digitaler Zuschlag {euro(zu.summe)}</small>}
                      </td>
                      <td className="r">
                        <input className="zahl-feld" type="number" min={0} step={1} value={p.anzahl}
                          onChange={(e) => aendern(p.id, { anzahl: zahl(e.target.value) ?? 0 })} />
                      </td>
                      <td className="r">
                        {honorar ? (
                          istZuschlag(p.nr)
                            ? <span className="grau" title="Zuschläge nur mit dem einfachen Gebührensatz">1,0</span>
                            : <input className="zahl-feld" type="number" min={1} max={p.ebene === 'GOAE' ? grenzen(p).hoechst : 5} step={0.1} value={positionsFaktor(p, plan)}
                                title="eigener Faktor für diese Position (leer = Regler)"
                                onChange={(e) => aendern(p.id, { faktor: zahl(e.target.value) })} />
                        ) : (
                          <input className="zahl-feld" type="number" min={0} step={0.01}
                            value={p.preis ?? ''} placeholder={p.ebene === 'LABOR' ? String(laborGrundpreis(p.nr, einst) ?? '') : '0'}
                            title="eigener Preis (leer = Laborpreis aus den Einstellungen bzw. der Laborliste)"
                            onChange={(e) => aendern(p.id, { preis: zahl(e.target.value) })} />
                        )}
                      </td>
                      <td className="r">{z ? euro(z.summe + (zu?.summe ?? 0)) : '—'}</td>
                      <td><button className="x" title="Position entfernen" onClick={() => setPos(plan.positionen.filter((x) => x.id !== p.id))}>×</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        })}

        {plan.positionen.some((p) => p.ebene === 'MEHR') && (
          <table className="pos-tabelle">
            <thead>
              <tr><th colSpan={2}>Material über dem Standard (Mehrkosten)</th><th className="r">Anzahl</th><th className="r">Preis je</th><th className="r">Standard je</th><th className="r">Mehrkosten</th><th /></tr>
            </thead>
            <tbody>
              {plan.positionen.filter((p) => p.ebene === 'MEHR').map((p) => {
                const z = zeile(p.id)
                const pr = mehrPreise(p, einst)
                return (
                  <tr key={p.id} className={z?.ohnePreis ? 'mit-warnung' : ''}>
                    <td className="mono nr">Mat.</td>
                    <td><input className="text-feld" value={p.text ?? ''} placeholder={MEHR_MATERIAL.find((m) => m.id === p.nr)?.text ?? 'Material'} onChange={(e) => aendern(p.id, { text: e.target.value })} /></td>
                    <td className="r"><input className="zahl-feld" type="number" min={0} step={1} value={p.anzahl} onChange={(e) => aendern(p.id, { anzahl: zahl(e.target.value) ?? 0 })} /></td>
                    <td className="r"><input className="zahl-feld" type="number" min={0} step={0.01} value={p.preis ?? ''} placeholder={String(pr.preis || '')} onChange={(e) => aendern(p.id, { preis: zahl(e.target.value) })} /></td>
                    <td className="r"><input className="zahl-feld" type="number" min={0} step={0.01} value={p.abzug ?? ''} placeholder={String(pr.standard || '0')} onChange={(e) => aendern(p.id, { abzug: zahl(e.target.value) })} /></td>
                    <td className="r">{z ? euro(z.summe) : '—'}</td>
                    <td><button className="x" title="Position entfernen" onClick={() => setPos(plan.positionen.filter((x) => x.id !== p.id))}>×</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div className="pos-neu">
          <select value={neuArt} onChange={(e) => {
            const art = e.target.value as NeuArt
            setNeuArt(art)
            setNeuNr(START[art])
          }}>
            <option value="GOZ">GOZ</option>
            <option value="ANALOG">GOZ analog</option>
            <option value="GOAE">GOÄ (Röntgen u. a.)</option>
            <option value="LABOR">Labor</option>
            <option value="MATERIAL">Material / Fremdlabor</option>
            <option value="MEHR">Material über dem Standard</option>
          </select>
          {neuArt === 'GOZ' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {(['Diagnostik', 'Apparatur', 'Einzelleistung', 'Begleitend'] as const).map((gr) => (
                <optgroup key={gr} label={gr === 'Einzelleistung' ? 'Einzelleistungen (nicht neben 6030–6080)' : gr}>
                  {GOZ_POSITIONEN.filter((g) => g.gruppe === gr).map((g) => (
                    <option key={g.nr} value={g.nr}>{g.nr} {gozText(g.nr).slice(0, 70)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {neuArt === 'ANALOG' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {ANALOG_LEISTUNGEN.map((a) => <option key={a.id} value={a.id}>{a.text}{a.bezug ? ` (Vorschlag ${a.bezug})` : ' (Bezug wählen)'}</option>)}
            </select>
          )}
          {neuArt === 'GOAE' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {GOAE_POSITIONEN.map((nr) => <option key={nr} value={nr}>Ä{nr} {goaeEintrag(nr)?.text.slice(0, 70)}</option>)}
            </select>
          )}
          {neuArt === 'LABOR' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {LABOR_POSITIONEN.map((nr) => <option key={nr} value={nr}>{nr} {laborText(nr)}</option>)}
            </select>
          )}
          {neuArt === 'MEHR' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {MEHR_MATERIAL.map((m) => <option key={m.id} value={m.id}>{m.text} (statt {m.gegen})</option>)}
            </select>
          )}
          <button className="sekundaer klein-btn" onClick={hinzufuegen}>Position hinzufügen</button>
        </div>
        {neuArt === 'ANALOG' && (
          <p className="fuss">
            Die BZÄK führt diese Leistungen als analog zu berechnen, nennt aber keine Bezugsleistung. Die Praxis wählt eine
            nach Art, Kosten- und Zeitaufwand gleichwertige GOZ-Leistung (§ 6 Abs. 1 GOZ). Vorschlag: {ANALOG_LEISTUNGEN.find((a) => a.id === neuNr)?.quelle}.
          </p>
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

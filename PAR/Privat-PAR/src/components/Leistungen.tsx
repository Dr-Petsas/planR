import { useState } from 'react'
import type { Optionen, Phase, Plan, Rechnung, Variante, Zusatz } from '../types'
import { PHASE_NAME, UPT_FREQUENZ, VARIANTE_NAME, ZUSATZ_NUMMERN } from '../data/katalog'
import { euro, faktorText, neueId } from '../engine/par'
import { gozText } from '../engine/listen'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  rechnung: Rechnung
}

const zahl = (v: string) => (v === '' || Number.isNaN(+v) ? undefined : +v)

const OPTIONEN: { id: keyof Optionen; text: string }[] = [
  { id: 'hkp', text: 'GOZ 0030 schriftlicher Heil- und Kostenplan' },
  { id: 'pzrAit', text: 'GOZ 1040 neben der AIT (je Zahn)' },
  { id: 'bevCpt', text: 'Befundevaluation nach der CPT' },
]

export default function Leistungen({ plan, setPlan, rechnung }: Props) {
  const [neuNr, setNeuNr] = useState('4110')
  const setFaktor = (nr: string, v: string) => {
    const faktoren = { ...plan.faktoren }
    const f = zahl(v)
    if (f == null || f === plan.faktor) delete faktoren[nr]
    else faktoren[nr] = f
    setPlan({ ...plan, faktoren })
  }
  const setZusatz = (zusatz: Zusatz[]) => setPlan({ ...plan, zusatz })
  const zAendern = (id: string, patch: Partial<Zusatz>) => setZusatz(plan.zusatz.map((z) => (z.id === id ? { ...z, ...patch } : z)))

  const phasen = (Object.keys(PHASE_NAME) as Phase[]).filter((p) => p !== 'zusatz')

  return (
    <>
      <div className="block">
        <h3>Behandlungsstrecke</h3>
        <div className="formular">
          <div className="feld breit">
            Analogbewertung
            <div className="wahl">
              {(Object.keys(VARIANTE_NAME) as Variante[]).map((v) => (
                <button key={v} className={plan.variante === v ? 'aktiv' : ''} onClick={() => setPlan({ ...plan, variante: v })}>{VARIANTE_NAME[v]}</button>
              ))}
            </div>
          </div>
          <label className="feld">
            UPT-Jahre ({UPT_FREQUENZ[plan.grad]} Sitzung{UPT_FREQUENZ[plan.grad] === 1 ? '' : 'en'} je Jahr bei Grad {plan.grad})
            <input type="number" min={0} max={5} step={1} value={plan.uptJahre} onChange={(e) => setPlan({ ...plan, uptJahre: zahl(e.target.value) ?? 0 })} />
          </label>
          <label className="feld">
            Zähne mit Resttaschen in der UPT (%)
            <input type="number" min={0} max={100} step={5} value={plan.resttaschen} onChange={(e) => setPlan({ ...plan, resttaschen: zahl(e.target.value) ?? 0 })} />
          </label>
        </div>
        <div className="schalter" style={{ marginTop: 10 }}>
          {OPTIONEN.map((o) => (
            <label key={o.id}>
              <input type="checkbox" checked={plan.optionen[o.id]} onChange={(e) => setPlan({ ...plan, optionen: { ...plan.optionen, [o.id]: e.target.checked } })} />
              {' '}{o.text}
            </label>
          ))}
        </div>
      </div>

      <div className="block">
        <h3>Leistungen</h3>
        <p className="hilfe">Die Anzahl ergibt sich aus Zahnschema, Grad und UPT-Jahren. Der Faktor gilt je Nummer; leer = Regler. Zuschläge nur mit 1,0.</p>
        <table className="pos-tabelle">
          <thead>
            <tr><th>Nr.</th><th>Leistung</th><th className="r">Anzahl</th><th className="r">Faktor</th><th className="r">Betrag</th></tr>
          </thead>
          <tbody>
            {phasen.map((ph) => {
              const zs = rechnung.zeilen.filter((z) => z.phase === ph)
              if (!zs.length) return null
              return [
                <tr className="gruppe" key={ph}><td colSpan={4}>{PHASE_NAME[ph]}</td><td className="r">{euro(rechnung.summen[ph])}</td></tr>,
                ...zs.map((z) => (
                  <tr key={z.id}>
                    <td className="mono nr">{z.nr}</td>
                    <td>{z.text}{z.analog && <span className="analog-text">{z.analog}</span>}</td>
                    <td className="r">{z.anzahl}</td>
                    <td className="r">
                      {z.fest ? <span className="grau">{faktorText(1)}</span> : (
                        <input className="zahl-feld" type="number" min={1} max={5} step={0.1} value={plan.faktoren[z.nr] ?? ''}
                          placeholder={faktorText(plan.faktor)} onChange={(e) => setFaktor(z.nr, e.target.value)} />
                      )}
                    </td>
                    <td className="r">{euro(z.summe)}</td>
                  </tr>
                )),
              ]
            })}
          </tbody>
        </table>
      </div>

      <div className="block">
        <h3>{PHASE_NAME.zusatz}</h3>
        {plan.zusatz.length > 0 && (
          <table className="pos-tabelle">
            <thead>
              <tr><th>Nr.</th><th>Leistung</th><th className="r">Anzahl</th><th className="r">Faktor / Preis</th><th className="r">Betrag</th><th /></tr>
            </thead>
            <tbody>
              {plan.zusatz.map((z) => {
                const r = rechnung.zeilen.find((x) => x.id === z.id)
                const mat = z.nr === 'Mat.'
                return (
                  <tr key={z.id}>
                    <td className="mono nr">{z.nr}</td>
                    <td>
                      {mat
                        ? <input className="text-feld" value={z.text ?? ''} placeholder="Material, z. B. Membran, Knochenersatz" onChange={(e) => zAendern(z.id, { text: e.target.value })} />
                        : gozText(z.nr)}
                    </td>
                    <td className="r">
                      <input className="zahl-feld" type="number" min={0} step={1} value={z.anzahl} onChange={(e) => zAendern(z.id, { anzahl: zahl(e.target.value) ?? 0 })} />
                    </td>
                    <td className="r">
                      {mat ? (
                        <input className="zahl-feld" type="number" min={0} step={0.01} value={z.preis ?? ''} placeholder="0" onChange={(e) => zAendern(z.id, { preis: zahl(e.target.value) })} />
                      ) : r?.fest ? <span className="grau">{faktorText(1)}</span> : (
                        <input className="zahl-feld" type="number" min={1} max={5} step={0.1} value={z.faktor ?? ''} placeholder={faktorText(plan.faktor)}
                          onChange={(e) => zAendern(z.id, { faktor: zahl(e.target.value) })} />
                      )}
                    </td>
                    <td className="r">{r ? euro(r.summe) : '—'}</td>
                    <td><button className="x" title="Position entfernen" onClick={() => setZusatz(plan.zusatz.filter((x) => x.id !== z.id))}>×</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="pos-neu">
          <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
            {ZUSATZ_NUMMERN.map((nr) => <option key={nr} value={nr}>{nr} {gozText(nr).slice(0, 70)}</option>)}
            <option value="Mat.">Material / Auslagen</option>
          </select>
          <button className="sekundaer klein-btn" onClick={() => setZusatz([...plan.zusatz, { id: neueId(), nr: neuNr, anzahl: 1, ...(neuNr === 'Mat.' ? { preis: 0, text: '' } : {}) }])}>
            Position hinzufügen
          </button>
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

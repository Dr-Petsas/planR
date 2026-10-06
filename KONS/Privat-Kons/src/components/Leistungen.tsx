import { useMemo, useState } from 'react'
import type { Kalkulation, Plan, Position } from '../types'
import { euro } from '../engine/berechnung'
import { GOZ } from '../engine/listen'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  kalk: Kalkulation
}

export default function Leistungen({ plan, setPlan, kalk }: Props) {
  const [suche, setSuche] = useState('')

  const anpassungFuer = (key: string) => plan.anpassungen.find((a) => a.key === key)

  const setzeAnpassung = (key: string, patch: Partial<{ anzahl: number; faktor: number; preis: number; begruendung: string }>) => {
    const ohne = plan.anpassungen.filter((a) => a.key !== key)
    const alt = anpassungFuer(key) ?? { key }
    setPlan({ ...plan, anpassungen: [...ohne, { ...alt, ...patch }] })
  }

  const setzeManuell = (key: string, patch: Partial<Position>) => {
    setPlan({ ...plan, manuell: plan.manuell.map((m) => (m.key === key ? { ...m, ...patch } : m)) })
  }

  const entferne = (key: string) => {
    if (key.startsWith('manuell#')) {
      setPlan({ ...plan, manuell: plan.manuell.filter((m) => m.key !== key) })
    } else {
      setPlan({ ...plan, entfernt: [...new Set([...plan.entfernt, key])] })
    }
  }

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase()
    if (q.length < 2) return []
    return [...GOZ.values()]
      .filter((e) => e.nr.includes(q) || e.text.toLowerCase().includes(q))
      .slice(0, 30)
  }, [suche])

  const addGoz = (nr: string, text: string) => {
    const key = `manuell#${nr}-${Date.now()}`
    const pos: Position = { key, gruppe: 'manuell', ebene: 'GOZ', nr, anzahl: 1, faktor: plan.regler.gozFaktor, text, auto: false }
    setPlan({ ...plan, manuell: [...plan.manuell, pos] })
    setSuche('')
  }

  return (
    <div className="leistungen">
      {kalk.gruppen.map((g) => (
        <div className="block" key={g.key}>
          <h3>
            {g.titel}
            <span className={`tag ${g.art === 'verlangen' ? 'analog' : 'GOZ'}`} style={{ marginLeft: 8 }}>
              {g.art === 'verlangen' ? 'Verlangensleistung' : 'Mehrkosten'}
            </span>
          </h3>
          {g.begruendung && <p className="hilfe">{g.begruendung}</p>}
          <table className="edit-tabelle">
            <thead>
              <tr>
                <th>Ebene</th>
                <th>Nr.</th>
                <th className="text">Leistung</th>
                <th>Anzahl</th>
                <th>Faktor</th>
                <th className="r">Einzel</th>
                <th className="r">Summe</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {g.positionen.map((p) => {
                const manuell = p.key.startsWith('manuell#')
                const aend = (patch: { anzahl?: number; faktor?: number; preis?: number }) =>
                  manuell ? setzeManuell(p.key, patch) : setzeAnpassung(p.key, patch)
                return (
                  <tr key={p.key} className={p.kassen ? 'zeile-kasse' : ''}>
                    <td>
                      <span className={`tag ${p.ebene}`}>{p.ebene}</span>
                    </td>
                    <td className="mono">{p.nr}</td>
                    <td className="text">{p.text}</td>
                    <td>
                      <input
                        className="klein"
                        type="number"
                        min={1}
                        value={p.anzahl}
                        onChange={(e) => aend({ anzahl: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </td>
                    <td>
                      {p.ebene === 'GOZ' ? (
                        <input
                          className="klein"
                          type="number"
                          min={1}
                          max={5}
                          step={0.1}
                          value={p.faktor ?? plan.regler.gozFaktor}
                          onChange={(e) => aend({ faktor: Number(e.target.value) || 1 })}
                        />
                      ) : (
                        <input className="mittel" type="number" step={1} value={p.einzel} onChange={(e) => aend({ preis: Number(e.target.value) || 0 })} />
                      )}
                    </td>
                    <td className="r mono">{euro(p.einzel)}</td>
                    <td className="r mono">{p.kassen ? `− ${euro(p.summe)}` : euro(p.summe)}</td>
                    <td>
                      <button className="x" onClick={() => entferne(p.key)} title="entfernen">
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>
                  {g.modellHinweis ? <span className="kv-fuss">{g.modellHinweis}</span> : null} Mehrkosten (Patient)
                </td>
                <td className="r mono">
                  <b>{euro(g.mehrkosten)}</b>
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      {!kalk.gruppen.length && (
        <div className="block">
          <p className="leer">Noch keine Leistungen – zuerst im Zahnschema planen.</p>
        </div>
      )}

      <div className="block hinzufuegen">
        <h3>Weitere GOZ-Leistung ergänzen</h3>
        <p className="hilfe">Frei vereinbarte Zusatzleistungen (z. B. PZR GOZ 1040, Vitalitätsprüfung 0070) – zählen als Verlangensleistung.</p>
        <div className="zeile">
          <input className="suche" placeholder="GOZ-Nummer oder Text suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        </div>
        {treffer.length > 0 && (
          <ul className="treffer">
            {treffer.map((e) => (
              <li key={e.nr}>
                <button onClick={() => addGoz(e.nr, e.text)}>
                  <span className="tag GOZ">{e.nr}</span>
                  <span>{e.text}</span>
                  <span className="preis">{e.punkte} Pkt.</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

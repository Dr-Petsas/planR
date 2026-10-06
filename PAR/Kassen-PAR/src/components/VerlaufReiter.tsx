import { useState } from 'react'
import { behandelbare } from '../engine/strecke'
import { datumDe } from '../engine/termine'
import { ALLE_ZAEHNE, istBehandelbar } from '../engine/zahnschema'
import type { Befund, ParFall } from '../types'
import { Karte } from './ui'

export interface BefundStatistik {
  zaehne: number
  stellen: number
  mittel: number
  ab4: number
  ab6: number
  bopProzent: number
}

export function statistik(b: Befund): BefundStatistik {
  let stellen = 0
  let summe = 0
  let ab4 = 0
  let ab6 = 0
  let bop = 0
  const z = behandelbare(b)
  for (const [, zb] of z) {
    zb.st.forEach((w, i) => {
      if (w == null) return
      stellen++
      summe += w
      if (w >= 4) ab4++
      if (w >= 6) ab6++
      if (zb.bop[i]) bop++
    })
  }
  return {
    zaehne: z.length, stellen, mittel: stellen ? summe / stellen : 0, ab4, ab6,
    bopProzent: stellen ? (bop / stellen) * 100 : 0,
  }
}

const maxSt = (b: Befund, zahn: string) => {
  const z = b.zaehne[zahn]
  if (!z || !istBehandelbar(z.zs)) return null
  const w = z.st.filter((x): x is number => x != null)
  return w.length ? Math.max(...w) : null
}

const klasse = (w: number | null) => (w == null ? '' : w >= 6 ? 'st6' : w >= 4 ? 'st4' : 'st0')

export default function VerlaufReiter({ fall }: { fall: ParFall }) {
  const sortiert = [...fall.befunde].sort((a, b) => (a.datum || '').localeCompare(b.datum || ''))
  const [gewaehlt, setGewaehlt] = useState<string[]>(sortiert.slice(-6).map((b) => b.id))
  const befunde = sortiert.filter((b) => gewaehlt.includes(b.id)).slice(0, 6)
  const stats = befunde.map(statistik)
  const erster = befunde[0]
  const letzter = befunde.at(-1)

  const umschalten = (id: string) => setGewaehlt(gewaehlt.includes(id)
    ? gewaehlt.filter((x) => x !== id)
    : gewaehlt.length >= 6 ? gewaehlt : [...gewaehlt, id])

  return (
    <div className="reiter-inhalt">
      <Karte titel="Befunde vergleichen (bis zu 6)">
        <div className="befund-liste">
          {sortiert.map((b) => (
            <label key={b.id} className={`befund-chip${gewaehlt.includes(b.id) ? ' aktiv' : ''}`}>
              <input type="checkbox" checked={gewaehlt.includes(b.id)} onChange={() => umschalten(b.id)} />
              <b>{b.bezeichnung}</b><span>{datumDe(b.datum)}</span>
            </label>
          ))}
        </div>
      </Karte>

      <Karte titel="Kennzahlen">
        <table className="tabelle">
          <thead>
            <tr><th></th>{befunde.map((b) => <th key={b.id}>{b.bezeichnung}<br /><small>{datumDe(b.datum)}</small></th>)}</tr>
          </thead>
          <tbody>
            <tr><td>Zähne</td>{stats.map((s, i) => <td key={i}>{s.zaehne}</td>)}</tr>
            <tr><td>Messstellen</td>{stats.map((s, i) => <td key={i}>{s.stellen}</td>)}</tr>
            <tr><td>mittlere ST (mm)</td>{stats.map((s, i) => <td key={i}>{s.mittel.toFixed(1).replace('.', ',')}</td>)}</tr>
            <tr><td>Stellen ST ≥ 4 mm</td>{stats.map((s, i) => <td key={i}>{s.ab4}</td>)}</tr>
            <tr><td>Stellen ST ≥ 6 mm</td>{stats.map((s, i) => <td key={i}>{s.ab6}</td>)}</tr>
            <tr><td>BOP</td>{stats.map((s, i) => <td key={i}>{Math.round(s.bopProzent)} %</td>)}</tr>
          </tbody>
        </table>
      </Karte>

      <Karte titel="Größte Sondierungstiefe je Zahn">
        <table className="tabelle verlauf">
          <thead>
            <tr><th>Zahn</th>{befunde.map((b) => <th key={b.id}>{b.bezeichnung}</th>)}<th>Δ</th></tr>
          </thead>
          <tbody>
            {ALLE_ZAEHNE.map((z) => {
              const werte = befunde.map((b) => maxSt(b, z))
              if (werte.every((w) => w == null)) return null
              const a = erster ? maxSt(erster, z) : null
              const e = letzter ? maxSt(letzter, z) : null
              const delta = a != null && e != null && befunde.length > 1 ? e - a : null
              return (
                <tr key={z}>
                  <td>{z}</td>
                  {werte.map((w, i) => <td key={i} className={klasse(w)}>{w ?? '–'}</td>)}
                  <td className={delta == null ? '' : delta < 0 ? 'besser' : delta > 0 ? 'schlechter' : ''}>
                    {delta == null ? '' : delta > 0 ? `+${delta}` : delta}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Karte>
    </div>
  )
}

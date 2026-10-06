import { useMemo, useState } from 'react'
import type { Ebene, Plan, Position } from '../types'
import { BEB, GOZ, euro, type Kalkulation, type Zeile } from '../engine/berechnung'
import type { EigenPosition } from '../engine/eigenlabor'
import { mitDigital } from '../engine/digital'

interface Props {
  plan: Plan
  kalk: Kalkulation
  gozFaktor: number
  eigenlabor: EigenPosition[]
  onChange: (plan: Plan) => void
}

const zahl = (s: string) => Number(s.replace(',', '.'))

export function Leistungen({ plan, kalk, gozFaktor, eigenlabor, onChange }: Props) {
  const aendern = (z: Zeile, feld: 'anzahl' | 'faktor' | 'preis' | 'begruendung' | 'zahn' | 'text', wert: string) => {
    const v = feld === 'begruendung' || feld === 'zahn' || feld === 'text' ? wert : zahl(wert)
    if (typeof v === 'number' && !Number.isFinite(v)) return
    if (z.auto) {
      if (feld === 'zahn' || feld === 'text') return
      onChange({ ...plan, anpassungen: { ...plan.anpassungen, [z.id]: { ...plan.anpassungen[z.id], [feld]: v } } })
    } else {
      onChange({ ...plan, manuell: plan.manuell.map((p) => (p.id === z.id ? { ...p, [feld]: v } : p)) })
    }
  }
  const entfernen = (z: Zeile) => {
    if (z.auto) onChange({ ...plan, entfernt: [...plan.entfernt, z.id] })
    else onChange({ ...plan, manuell: plan.manuell.filter((p) => p.id !== z.id) })
  }
  const zuruecksetzen = () => onChange({ ...plan, anpassungen: {}, entfernt: [] })
  const hinzufuegen = (p: Omit<Position, 'id'>) => onChange({ ...plan, manuell: [...plan.manuell, { ...p, id: `m:${Date.now().toString(36)}` }] })

  const tabelle = (titel: string, zeilen: Zeile[], ebene: Ebene) => (
    <section className="block">
      <h3>{titel}</h3>
      {zeilen.length === 0 ? <p className="leer">Keine Positionen.</p> : (
        <table className="edit-tabelle">
          <thead>
            <tr>
              <th>Nr.</th><th>Zahn</th><th>Leistung</th><th className="r">Anz.</th>
              {ebene === 'GOZ' ? <th className="r">Faktor</th> : <th className="r">Einzel</th>}
              <th className="r">Betrag</th><th />
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => {
              const angepasst = z.auto && plan.anpassungen[z.id]
              return (
                <tr key={z.id} className={`${angepasst ? 'angepasst' : ''} ${z.zusatz ? 'zeile-zusatz' : ''}`} title={z.grund}>
                  <td className="mono">{z.ebene === 'MAT' ? '–' : z.nr}</td>
                  <td>{z.auto ? z.zahn : <input className="klein" value={z.zahn} onChange={(e) => aendern(z, 'zahn', e.target.value)} />}</td>
                  <td className="text">
                    {ebene === 'MAT' && !z.auto ? <input value={z.text} onChange={(e) => aendern(z, 'text', e.target.value)} /> : z.text}
                    {z.material && <span className="tag material" title="Aus „Kronenmaterial“ – Gewicht und Preis sind Mittelwerte und lassen sich hier anpassen">Material</span>}
                    {z.eigen && <span className="tag eigen" title={z.eigen === z.nr ? 'Praxiseigene Laborposition' : `Preis und Text aus der Eigenlabor-Position ${z.eigen} (statt BEB ${z.nr})`}>Eigen {z.eigen}</span>}
                    {ebene === 'GOZ' && z.faktor! > 2.3 && (
                      <textarea className="begruendung" rows={2} value={z.begruendung ?? ''} placeholder="Begründung nach § 10 Abs. 3 GOZ"
                        onChange={(e) => aendern(z, 'begruendung', e.target.value)} />
                    )}
                  </td>
                  <td className="r"><input className="klein r" type="number" min={0} step={z.material ? 0.1 : 1} value={z.anzahl} onChange={(e) => aendern(z, 'anzahl', e.target.value)} /></td>
                  {ebene === 'GOZ'
                    ? <td className="r"><input className="klein r" type="number" min={1} max={10} step={0.1} value={z.faktor} onChange={(e) => aendern(z, 'faktor', e.target.value)} /></td>
                    : <td className="r"><input className="mittel r" type="number" min={0} step={0.01} value={z.einzel} onChange={(e) => aendern(z, 'preis', e.target.value)} /></td>}
                  <td className="r mono">{euro(z.betrag)}</td>
                  <td><button className="x" title="Position entfernen" onClick={() => entfernen(z)}>×</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )

  return (
    <div className="leistungen">
      <div className="leiste">
        <p>Die Positionen werden aus Befund und Planung erzeugt. Anzahl, Faktor und Preise lassen sich anpassen; Änderungen bleiben erhalten, wenn das Zahnschema geändert wird.</p>
        {(plan.entfernt.length > 0 || Object.keys(plan.anpassungen).length > 0) && (
          <button className="sekundaer" onClick={zuruecksetzen}>Automatische Positionen zurücksetzen ({plan.entfernt.length} entfernt, {Object.keys(plan.anpassungen).length} angepasst)</button>
        )}
      </div>
      <Hinzufuegen gozFaktor={gozFaktor} eigenlabor={eigenlabor} onAdd={hinzufuegen} />
      {tabelle('Zahnärztliches Honorar (GOZ)', kalk.honorar, 'GOZ')}
      {tabelle('Zahntechnische Leistungen (BEB)', kalk.labor, 'BEB')}
      {tabelle('Material und Implantatteile', kalk.material, 'MAT')}
    </div>
  )
}

function Hinzufuegen({ gozFaktor, eigenlabor, onAdd }: { gozFaktor: number; eigenlabor: EigenPosition[]; onAdd: (p: Omit<Position, 'id'>) => void }) {
  const [suche, setSuche] = useState('')
  const [zahn, setZahn] = useState('')
  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase()
    if (s.length < 2) return []
    const passt = (nr: string, text: string) => nr.startsWith(s) || text.toLowerCase().includes(s)
    return [
      ...mitDigital(eigenlabor).filter((e) => e.nr && passt(e.nr.toLowerCase(), e.text)).map((e) => ({ ebene: 'BEB' as const, eigen: true, ...e, punkte: undefined })),
      ...[...GOZ.values()].filter((e) => passt(e.nr, e.text)).map((e) => ({ ebene: 'GOZ' as const, eigen: false, ...e })),
      ...[...BEB.values()].filter((e) => passt(e.nr, e.text)).map((e) => ({ ebene: 'BEB' as const, eigen: false, ...e })),
    ].slice(0, 12)
  }, [suche, eigenlabor])

  return (
    <section className="block hinzufuegen">
      <h3>Leistung hinzufügen</h3>
      <div className="zeile">
        <input className="suche" placeholder="GOZ- oder BEB-Nummer bzw. Stichwort suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <input className="mittel" placeholder="Zahn" value={zahn} onChange={(e) => setZahn(e.target.value)} />
        <button className="sekundaer" onClick={() => onAdd({ ebene: 'MAT', nr: 'MAT', zahn, anzahl: 1, preis: 0, text: 'Material' })}>+ Material</button>
      </div>
      {treffer.length > 0 && (
        <ul className="treffer">
          {treffer.map((t) => (
            <li key={(t.eigen ? 'E' : t.ebene) + t.nr}>
              <button onClick={() => { onAdd({ ebene: t.ebene, nr: t.nr, zahn, anzahl: 1, faktor: t.ebene === 'GOZ' ? gozFaktor : undefined }); setSuche('') }}>
                <span className={`tag ${t.eigen ? 'eigen' : t.ebene}`}>{t.eigen ? 'Eigen' : t.ebene}</span> <b className="mono">{t.nr}</b> {t.text}
                <span className="preis">{t.ebene === 'GOZ' ? `${t.punkte} Pkt.` : euro(t.preis ?? 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

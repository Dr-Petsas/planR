import { useMemo, useState } from 'react'
import type { Ebene, Plan, Position } from '../types'
import { GOAE, GOZ, euro, type Kalkulation, type Zeile } from '../engine/berechnung'
import { MATERIAL } from '../data/material'

interface Props {
  plan: Plan
  einst: { gozFaktor: number; goaeFaktor: number }
  kalk: Kalkulation
  onChange: (plan: Plan) => void
}

const zahl = (s: string) => Number(s.replace(',', '.'))

export function Leistungen({ plan, einst, kalk, onChange }: Props) {
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
  const zuruecksetzen = () => onChange({ ...plan, anpassungen: {}, entfernt: [], regler: { ...plan.regler, aus: [] } })
  const hinzufuegen = (p: Omit<Position, 'id'>) => onChange({ ...plan, manuell: [...plan.manuell, { ...p, id: `m:${Date.now().toString(36)}` }] })

  const tabelle = (titel: string, zeilen: Zeile[], ebene: Ebene) => (
    <section className="block">
      <h3>{titel}</h3>
      {zeilen.length === 0 ? <p className="leer">Keine Positionen.</p> : (
        <table className="edit-tabelle">
          <thead>
            <tr>
              <th>Nr.</th><th>Region</th><th>Leistung</th><th className="r">Anz.</th>
              {ebene === 'GOZ' || ebene === 'GOAE' ? <th className="r">Faktor</th> : <th className="r">Einzel</th>}
              <th className="r">Betrag</th><th />
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => {
              const angepasst = z.auto && plan.anpassungen[z.id]
              const honorar = ebene === 'GOZ' || ebene === 'GOAE'
              return (
                <tr key={z.id} className={`${angepasst ? 'angepasst' : ''} ${z.zusatz ? 'zeile-zusatz' : ''}`} title={z.grund}>
                  <td className="mono">{ebene === 'MAT' ? '–' : z.nr}{z.gebuehrenanteil && z.gebuehrenanteil < 1 ? <span className="tag anteil" title="reduzierter Gebührenanteil">{z.gebuehrenanteil === 0.5 ? '½' : '⅓'}</span> : null}</td>
                  <td>{z.auto ? z.zahn : <input className="klein" value={z.zahn} onChange={(e) => aendern(z, 'zahn', e.target.value)} />}</td>
                  <td className="text">
                    {ebene === 'MAT' && !z.auto ? <input value={z.text} onChange={(e) => aendern(z, 'text', e.target.value)} /> : z.text}
                    {z.analog && <span className="tag analog" title={z.analogText}>Analog · {z.risiko}</span>}
                    {z.material && <span className="tag material">Material (EK)</span>}
                    {honorar && (z.faktor ?? 0) > 2.3 && !z.preis && (
                      <textarea className="begruendung" rows={2} value={z.begruendung ?? ''} placeholder="Begründung (§ 10 GOZ / § 5 GOÄ)"
                        onChange={(e) => aendern(z, 'begruendung', e.target.value)} />
                    )}
                  </td>
                  <td className="r"><input className="klein r" type="number" min={0} step={z.material ? 1 : 1} value={z.anzahl} onChange={(e) => aendern(z, 'anzahl', e.target.value)} /></td>
                  {honorar && !z.analog && z.preis === undefined
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

  const offeneAenderungen = plan.entfernt.length + Object.keys(plan.anpassungen).length + plan.regler.aus.length
  return (
    <div className="leistungen">
      <div className="leiste">
        <p>Die Positionen entstehen aus Befund, Planung, Regionen-Boxen und Reglern. Anzahl, Faktor und Preise sind anpassbar; Änderungen bleiben erhalten.</p>
        {offeneAenderungen > 0 && <button className="sekundaer" onClick={zuruecksetzen}>Automatische Positionen zurücksetzen ({offeneAenderungen})</button>}
      </div>
      <Hinzufuegen einst={einst} onAdd={hinzufuegen} />
      {tabelle('Zahnärztliches Honorar (GOZ)', kalk.honorarGoz, 'GOZ')}
      {tabelle('Ärztliche Leistungen (GOÄ, § 6 Abs. 2 GOZ)', kalk.honorarGoae, 'GOAE')}
      {tabelle('Material und Implantatteile (EK)', kalk.material, 'MAT')}
      {kalk.labor.length > 0 && tabelle('Zahntechnik (BEB)', kalk.labor, 'BEB')}
      {kalk.nichtAngesetzt.length > 0 && (
        <section className="block nicht-angesetzt">
          <h3>Nicht angesetzt (keine Grundlage in der Planung)</h3>
          <ul>{kalk.nichtAngesetzt.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      )}
    </div>
  )
}

function Hinzufuegen({ einst, onAdd }: { einst: { gozFaktor: number; goaeFaktor: number }; onAdd: (p: Omit<Position, 'id'>) => void }) {
  const [suche, setSuche] = useState('')
  const [zahn, setZahn] = useState('')
  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase()
    if (s.length < 2) return []
    const passt = (nr: string, text: string) => nr.toLowerCase().startsWith(s) || text.toLowerCase().includes(s)
    return [
      ...[...GOZ.values()].filter((e) => e.punkte && passt(e.nr, e.text)).map((e) => ({ ebene: 'GOZ' as const, ...e })),
      ...[...GOAE.values()].filter((e) => passt(e.nr, e.text)).map((e) => ({ ebene: 'GOAE' as const, ...e })),
      ...MATERIAL.filter((e) => passt(e.id, e.titel + ' ' + e.produkt)).map((e) => ({ ebene: 'MAT' as const, nr: e.id, text: `${e.titel} – ${e.produkt}`, punkte: undefined, preis: e.preis })),
    ].slice(0, 14)
  }, [suche])

  return (
    <section className="block hinzufuegen">
      <h3>Leistung oder Material hinzufügen</h3>
      <div className="zeile">
        <input className="suche" placeholder="GOZ-/GOÄ-Nummer, Material oder Stichwort suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
        <input className="mittel" placeholder="Region/Zahn" value={zahn} onChange={(e) => setZahn(e.target.value)} />
        <button className="sekundaer" onClick={() => onAdd({ ebene: 'MAT', nr: 'MAT', zahn, anzahl: 1, preis: 0, text: 'Material', material: true })}>+ freies Material</button>
      </div>
      {treffer.length > 0 && (
        <ul className="treffer">
          {treffer.map((t) => (
            <li key={t.ebene + t.nr}>
              <button onClick={() => {
                onAdd(t.ebene === 'MAT'
                  ? { ebene: 'MAT', nr: t.nr, zahn, anzahl: 1, preis: ('preis' in t ? t.preis : 0) ?? 0, text: t.text, material: true }
                  : { ebene: t.ebene, nr: t.nr, zahn, anzahl: 1, faktor: t.ebene === 'GOZ' ? einst.gozFaktor : einst.goaeFaktor })
                setSuche('')
              }}>
                <span className={`tag ${t.ebene}`}>{t.ebene === 'GOAE' ? 'GOÄ' : t.ebene}</span> <b className="mono">{t.nr}</b> {t.text}
                <span className="preis">{t.ebene === 'MAT' ? euro(('preis' in t ? t.preis : 0) ?? 0) : `${t.punkte} Pkt.`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import { useMemo, useState } from 'react'
import type { Einstellungen, Plan, Rechnung, Therapie, VitalArt, ZahnLeistung, Zeile } from '../types'
import { THERAPIEN } from '../data/katalog'
import { euro, faktorText, zusaetzeFuer, zusatzUmschalten } from '../engine/kons'
import { GOZ } from '../engine/listen'
import { standardLeistung } from './Zahnschema'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  rechnung: Rechnung
}

const EBENE_TAG: Record<Zeile['ebene'], string> = { GOZ: 'GOZ', ANALOG: 'analog', GOAE: 'GOÄ', MAT: 'Mat.', LABOR: 'Labor', ZUSCHLAG: 'Zuschlag' }

function Zeilen({ zeilen }: { zeilen: Zeile[] }) {
  return (
    <table className="zeilen">
      <tbody>
        {zeilen.map((x, i) => (
          <tr key={`${x.nr}-${i}`}>
            <td><span className={`tag ${x.ebene}`}>{EBENE_TAG[x.ebene]}</span></td>
            <td className="mono">{x.nr}</td>
            <td className="text">{x.text}</td>
            <td className="r mono">{x.anzahl}×</td>
            <td className="r mono">{x.faktor ? faktorText(x.faktor) : ''}</td>
            <td className="r mono">{euro(x.summe)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Stepper({ wert, min, max, onChange, label }: { wert: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="stepper" title={label}>
      <small>{label}</small>
      <button disabled={wert <= min} onClick={() => onChange(wert - 1)}>−</button>
      <b>{wert}</b>
      <button disabled={wert >= max} onClick={() => onChange(wert + 1)}>+</button>
    </span>
  )
}

export default function Zahnkarten({ plan, setPlan, einst, rechnung }: Props) {
  const [suche, setSuche] = useState('')
  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase()
    if (q.length < 2) return []
    return [...GOZ.values()].filter((e) => e.nr.includes(q) || e.text.toLowerCase().includes(q)).slice(0, 20)
  }, [suche])

  const aendern = (zahn: string, patch: Partial<ZahnLeistung>) =>
    setPlan({ ...plan, zaehne: { ...plan.zaehne, [zahn]: { ...plan.zaehne[zahn], ...patch } } })
  const ersetzen = (zahn: string, z: ZahnLeistung) => setPlan({ ...plan, zaehne: { ...plan.zaehne, [zahn]: z } })
  const entfernen = (zahn: string) => {
    const naechste = { ...plan.zaehne }
    delete naechste[zahn]
    setPlan({ ...plan, zaehne: naechste })
  }

  return (
    <>
      {!rechnung.zaehne.length && (
        <div className="block"><p className="leer">Noch keine Therapie geplant – Kürzel oben im Zahnschema eintragen.</p></div>
      )}

      {rechnung.zaehne.map((e) => {
        const z = plan.zaehne[e.zahn]
        const chips = zusaetzeFuer(z, plan)
        return (
          <div key={e.zahn} className={`block zahnkarte ${e.ausgeschlossen ? 'ausgeschlossen' : ''}`}>
            <div className="zk-kopf">
              <span className="zk-zahn">{e.zahn}</span>
              <select value={z.therapie} onChange={(ev) => ersetzen(e.zahn, standardLeistung(ev.target.value as Therapie, e.zahn))}>
                {THERAPIEN.map((t) => <option key={t.id} value={t.id}>{t.kuerzel} · {t.titel}</option>)}
              </select>
              {['komposit', 'inlay', 'goldhaemmer'].includes(z.therapie) && (
                <Stepper label="Flächen" wert={z.flaechen ?? 2} min={1} max={z.therapie === 'komposit' ? 5 : 3} onChange={(n) => aendern(e.zahn, { flaechen: n })} />
              )}
              {(z.therapie === 'endo' || z.therapie === 'revision') && (
                <Stepper label="Kanäle" wert={z.kanaele ?? 1} min={1} max={5} onChange={(n) => aendern(e.zahn, { kanaele: n })} />
              )}
              {['endo', 'revision', 'inlay', 'bleaching'].includes(z.therapie) && (
                <Stepper label="Sitzungen" wert={z.sitzungen ?? 2} min={1} max={6} onChange={(n) => aendern(e.zahn, { sitzungen: n })} />
              )}
              {z.therapie === 'endo' && (
                <span className="umschalter">
                  <button className={z.vital !== false ? 'aktiv' : ''} onClick={() => aendern(e.zahn, { vital: true })}>vital</button>
                  <button className={z.vital === false ? 'aktiv' : ''} onClick={() => aendern(e.zahn, { vital: false })}>avital</button>
                </span>
              )}
              {z.therapie === 'vital' && (
                <select value={z.vitalArt ?? 'indirekt'} onChange={(ev) => aendern(e.zahn, { vitalArt: ev.target.value as VitalArt })}>
                  <option value="indirekt">indirekte Überkappung (2330)</option>
                  <option value="direkt">direkte Überkappung (2340)</option>
                  <option value="pulpotomie">Pulpotomie (2350)</option>
                </select>
              )}
              {z.therapie === 'inlay' && (
                <select value={z.labor ?? 'keramik'} onChange={(ev) => aendern(e.zahn, { labor: ev.target.value })}>
                  {einst.laborPreise.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              {z.therapie === 'aufbau' && (
                <span className="umschalter">
                  <button className={!z.aufbauStift ? 'aktiv' : ''} onClick={() => aendern(e.zahn, { aufbauStift: false })}>plastisch</button>
                  <button className={z.aufbauStift ? 'aktiv' : ''} onClick={() => aendern(e.zahn, { aufbauStift: true })}>Glasfaserstift</button>
                </span>
              )}
              <label className="zk-faktor" title="Eigener Faktor für diesen Zahn (leer = Regler)">
                Faktor
                <input
                  type="number" min={1} max={5} step={0.1} value={z.faktor ?? ''} placeholder={faktorText(plan.regler.faktor)}
                  onChange={(ev) => aendern(e.zahn, { faktor: ev.target.value ? +ev.target.value : undefined })}
                />
              </label>
              <b className="zk-summe">{euro(e.summe)}</b>
              <button className="x" onClick={() => entfernen(e.zahn)} title="Zahn entfernen">×</button>
            </div>

            {e.ausgeschlossen ? (
              <p className="zk-verweis">{e.ausgeschlossen}</p>
            ) : (
              <>
                {chips.length > 0 && (
                  <div className="chips">
                    {chips.map((c) => (
                      <button
                        key={c.zusatz.id}
                        className={`zusatz-chip stufe-${c.zusatz.stufe} ${c.aktiv ? 'an' : ''} ${c.zusatz.ebene === 'ANALOG' ? 'analog' : ''}`}
                        title={`${c.zusatz.quelle}${c.vorschlag ? ' – Vorschlag der eingestellten Stufe' : ''}`}
                        onClick={() => ersetzen(e.zahn, zusatzUmschalten(z, c))}
                      >
                        <span className="punkte">{'•'.repeat(c.zusatz.stufe)}</span>
                        {c.zusatz.titel}
                        <small>{c.zusatz.ebene === 'ANALOG' ? `${c.zusatz.nr}a` : c.zusatz.ebene === 'MAT' ? 'Mat.' : c.zusatz.ebene === 'GOAE' ? `GOÄ ${c.zusatz.nr}` : c.zusatz.nr}</small>
                      </button>
                    ))}
                  </div>
                )}
                <Zeilen zeilen={e.zeilen} />
              </>
            )}
            {[...e.warnungen.map((w) => ['warn', w]), ...e.hinweise.map((h) => ['info', h])].map(([art, text]) => (
              <div key={text} className={`zeilen-hinweis ${art}`}>{text}</div>
            ))}
          </div>
        )
      })}

      {rechnung.begleit.length > 0 && (
        <div className="block">
          <h3>Je Kieferhälfte, Kiefer und Behandlungstag</h3>
          <Zeilen zeilen={rechnung.begleit} />
        </div>
      )}

      <div className="block">
        <h3>Weitere GOZ-Leistung</h3>
        {plan.frei.length > 0 && (
          <table className="zeilen frei">
            <tbody>
              {plan.frei.map((p) => (
                <tr key={p.key}>
                  <td className="mono">{p.nr}</td>
                  <td className="text">{GOZ.get(p.nr)?.text}</td>
                  <td>
                    <input type="number" min={1} value={p.anzahl}
                      onChange={(ev) => setPlan({ ...plan, frei: plan.frei.map((x) => (x.key === p.key ? { ...x, anzahl: Math.max(1, +ev.target.value || 1) } : x)) })} />×
                  </td>
                  <td>
                    <input type="number" min={1} max={5} step={0.1} value={p.faktor}
                      onChange={(ev) => setPlan({ ...plan, frei: plan.frei.map((x) => (x.key === p.key ? { ...x, faktor: +ev.target.value || 1 } : x)) })} />
                  </td>
                  <td className="r mono">{euro(rechnung.frei.find((x) => x.zusatz === p.key)?.summe ?? 0)}</td>
                  <td><button className="x" onClick={() => setPlan({ ...plan, frei: plan.frei.filter((x) => x.key !== p.key) })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <input className="suche" placeholder="GOZ-Nummer oder Stichwort, z. B. 1040 oder Fluorid …" value={suche} onChange={(ev) => setSuche(ev.target.value)} />
        {treffer.length > 0 && (
          <ul className="treffer">
            {treffer.map((t) => (
              <li key={t.nr}>
                <button onClick={() => {
                  setPlan({ ...plan, frei: [...plan.frei, { key: `frei-${t.nr}-${Date.now()}`, nr: t.nr, anzahl: 1, faktor: plan.regler.faktor }] })
                  setSuche('')
                }}>
                  <span className="mono">{t.nr}</span> <span>{t.text}</span> <small>{t.punkte} Pkt.</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

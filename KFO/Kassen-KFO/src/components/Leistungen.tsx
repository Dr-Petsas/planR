import { useState } from 'react'
import type { Einstellungen, Ebene, Plan, Position, PrivatArt, Rechnung } from '../types'
import { BEL_KFO, MEHR_LEISTUNGEN, PRIVAT_ART_NAME, VORLAGEN } from '../data/katalog'
import { euro, faktorText, neueId, privatAusKatalog, vorlageAnwenden } from '../engine/kfo'
import { BEMA, belListeFuer, belNr, bemaEintrag, gozBekannt } from '../engine/listen'
import { kzvDerPraxis } from '../punktwerte'
import Einstufung from './Einstufung'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  rechnung: Rechnung
}

const zahl = (v: string) => (v === '' || Number.isNaN(+v) ? undefined : +v)
const MANUELL = BEMA.filter((b) => b.gruppe !== 'Behandlungsaufgabe')
const VERGLEICH = ['126a', '126b', '126d', '127a', '128a', '128b', '7a', '116', '117', '118']

type NeuArt = Ebene | 'KATALOG'

export default function Leistungen({ plan, setPlan, einst, rechnung }: Props) {
  const [neuEbene, setNeuEbene] = useState<NeuArt>('BEMA')
  const [neuNr, setNeuNr] = useState('126a')
  const setPos = (positionen: Position[]) => setPlan({ ...plan, positionen })
  const aendern = (id: string, patch: Partial<Position>) => setPos(plan.positionen.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const entfernen = (id: string) => setPos(plan.positionen.filter((x) => x.id !== id))
  const zeile = (id: string) => [...rechnung.honorar, ...rechnung.labor, ...rechnung.material].find((z) => z.id === id)
  const pz = (id: string) => rechnung.privat.find((z) => z.id === id)
  const liste = belListeFuer(kzvDerPraxis(einst.praxis) || '11', plan.datum)
  const belText = new Map((liste?.eintraege ?? []).map((e) => [e.nr, e.text] as const))

  const hinzufuegen = () => {
    if (neuEbene === 'KATALOG') return setPos([...plan.positionen, privatAusKatalog(neuNr, 1, einst)])
    if (neuEbene === 'MATERIAL') return setPos([...plan.positionen, { id: neueId(), ebene: 'MATERIAL', nr: 'Mat.', anzahl: 1, text: '', preis: 0 }])
    if (neuEbene === 'PRIVAT') return setPos([...plan.positionen, { id: neueId(), ebene: 'PRIVAT', art: 'Z', nr: '', anzahl: 1, text: '', preis: 0 }])
    setPos([...plan.positionen, { id: neueId(), ebene: neuEbene, nr: neuNr, anzahl: 1 }])
  }

  const gruppen = [
    { titel: 'Kassenleistungen (BEMA)', ebene: 'BEMA' as Ebene },
    { titel: `Labor (${rechnung.belListe})`, ebene: 'BEL' as Ebene },
    { titel: 'Praxismaterial', ebene: 'MATERIAL' as Ebene },
  ]
  const privat = plan.positionen.filter((p) => p.ebene === 'PRIVAT')
  const auto = rechnung.honorar.filter((z) => z.auto)

  return (
    <>
      <Einstufung plan={plan} setPlan={setPlan} rechnung={rechnung} />

      <div className="block">
        <h3>Bausteine</h3>
        <p className="hilfe">Jeder Baustein fügt typische Leistungen und die BEL-II-Laborkette hinzu – Anzahl und Preis bleiben einzeln änderbar. Abformungen und Eingliederung herausnehmbarer Geräte sind mit 119/120 abgegolten; die Bausteine bringen dafür nur das Labor.</p>
        <div className="vorlagen">
          {VORLAGEN.filter((v) => !v.privat).map((v) => (
            <button key={v.id} className="vorlage" onClick={() => setPos(vorlageAnwenden(plan.positionen, v.pos, einst))}>
              <b>{v.titel}</b>
              <small>{v.text}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <h3>Positionen</h3>
        {plan.positionen.length === 0 && !auto.length && <p className="leer">Noch keine Position – oben die Behandlungsaufgabe einstufen, einen Baustein wählen oder unten einzeln hinzufügen.</p>}
        {auto.length > 0 && (
          <table className="pos-tabelle">
            <thead><tr><th colSpan={2}>Behandlungsaufgabe (aus dem Raster)</th><th className="r">Abschläge</th><th className="r">Punkte</th><th className="r">Betrag</th><th /></tr></thead>
            <tbody>
              {auto.map((z) => (
                <tr key={z.id}><td className="mono nr">{z.nr}</td><td>{z.text}</td><td className="r">{z.anzahl}</td><td className="r grau">{z.punkte}</td><td className="r">{euro(z.summe)}</td><td /></tr>
              ))}
            </tbody>
          </table>
        )}
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
                  const b = p.ebene === 'BEMA' ? bemaEintrag(p.nr) : undefined
                  return (
                    <tr key={p.id} className={z?.ohnePreis ? 'mit-warnung' : ''}>
                      <td className="mono nr">{p.ebene === 'BEL' ? belNr(p.nr) : p.ebene === 'MATERIAL' ? 'Mat.' : p.nr}</td>
                      <td>
                        {p.ebene === 'MATERIAL'
                          ? <input className="text-feld" value={p.text ?? ''} placeholder="Material, z. B. Dehnschraube" onChange={(e) => aendern(p.id, { text: e.target.value })} />
                          : <span>{z?.text ?? p.nr}</span>}
                        {b?.bestimmung && <span className="analog-text">{b.bestimmung}</span>}
                        {z?.ohneEigenanteil && <span className="analog-text">ohne Eigenanteil · KCH-Punktwert{p.nr.startsWith('Ä') && einst.roentgenKfo ? ' (hier KFO)' : ''}</span>}
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
                            title="eigener Preis (leer = BEL II der KZV)"
                            onChange={(e) => aendern(p.id, { preis: zahl(e.target.value) })} />
                        )}
                      </td>
                      <td className="r">{z ? euro(z.summe) : '—'}</td>
                      <td><button className="x" title="Position entfernen" onClick={() => entfernen(p.id)}>×</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        })}

        <div className="pos-neu">
          <select value={neuEbene} onChange={(e) => {
            const eb = e.target.value as NeuArt
            setNeuEbene(eb)
            setNeuNr(eb === 'BEMA' ? '126a' : eb === 'BEL' ? '7010' : eb === 'KATALOG' ? 'keramik' : '')
          }}>
            <option value="BEMA">BEMA (Kasse)</option>
            <option value="BEL">Labor (BEL II)</option>
            <option value="MATERIAL">Praxismaterial</option>
            <option value="KATALOG">Mehr-/Zusatzleistung aus dem Katalog</option>
            <option value="PRIVAT">freie Privatleistung</option>
          </select>
          {neuEbene === 'BEMA' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {[...new Set(MANUELL.map((b) => b.gruppe))].map((gr) => (
                <optgroup key={gr} label={gr}>
                  {MANUELL.filter((b) => b.gruppe === gr).map((b) => (
                    <option key={b.nr} value={b.nr}>{b.nr} {b.text.slice(0, 70)} ({b.punkte} P.)</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {neuEbene === 'BEL' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {BEL_KFO.map((nr) => <option key={nr} value={nr}>{belNr(nr)} {belText.get(nr) ?? ''}</option>)}
            </select>
          )}
          {neuEbene === 'KATALOG' && (
            <select value={neuNr} onChange={(e) => setNeuNr(e.target.value)}>
              {(['M', 'Z', 'A'] as PrivatArt[]).map((art) => (
                <optgroup key={art} label={PRIVAT_ART_NAME[art]}>
                  {MEHR_LEISTUNGEN.filter((m) => m.art === art).map((m) => (
                    <option key={m.id} value={m.id}>{m.titel}{m.goz ? ` (GOZ ${m.goz}${m.vergleich ? ` statt BEMA ${m.vergleich}` : ''})` : ''}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <button className="sekundaer klein-btn" onClick={hinzufuegen}>Position hinzufügen</button>
        </div>
      </div>

      <div className="block">
        <h3>Mehr- und Zusatzleistungen <small className="grau">Vordruck 4d · § 29 Abs. 5–7 SGB V · Anlage B BMV-Z</small></h3>
        <p className="hilfe">
          M = Mehrleistung: die Kasse trägt die vergleichbare BEMA-Leistung, die Familie den Unterschied. Z = Zusatzleistung und
          A = andere Leistung: zahlt die Familie vollständig. Vor Behandlungsbeginn mündlich aufklären und schriftlich vereinbaren.
          Aligner sind keine Mehrleistung – eine von vornherein mit Alignern geplante Behandlung ist insgesamt privat.
        </p>
        <div className="vorlagen">
          {VORLAGEN.filter((v) => v.privat).map((v) => (
            <button key={v.id} className="vorlage" onClick={() => setPos(vorlageAnwenden(plan.positionen, v.pos, einst))}>
              <b>{v.titel}</b>
              <small>{v.text}</small>
            </button>
          ))}
        </div>
        {privat.length > 0 && (
          <table className="pos-tabelle">
            <thead>
              <tr><th>Art</th><th>Leistung</th><th className="r">Anzahl</th><th className="r">Faktor / Preis</th><th>BEMA-Vergleich</th><th className="r">Material je</th><th className="r">Anteil Familie</th><th /></tr>
            </thead>
            <tbody>
              {privat.map((p) => {
                const z = pz(p.id)
                const goz = gozBekannt(p.nr)
                return (
                  <tr key={p.id} className={z?.ohnePreis ? 'mit-warnung' : ''}>
                    <td>
                      <select value={p.art ?? 'Z'} onChange={(e) => aendern(p.id, { art: e.target.value as PrivatArt, ...(e.target.value !== 'M' ? { vergleich: undefined } : {}) })}>
                        <option value="M">M</option><option value="Z">Z</option><option value="A">A</option>
                      </select>
                    </td>
                    <td>
                      <input className="nr-feld" value={p.nr} placeholder="GOZ" title="GOZ-Nummer; leer = freier Preis"
                        onChange={(e) => aendern(p.id, { nr: e.target.value.trim(), ...(gozBekannt(e.target.value.trim()) ? { preis: undefined, faktor: p.faktor ?? einst.gozFaktor } : {}) })} />{' '}
                      <input className="text-feld" value={p.text ?? ''} placeholder="Leistung" onChange={(e) => aendern(p.id, { text: e.target.value })} />
                      {z && <span className="analog-text">GOZ-Betrag {euro(z.betrag)}{z.bema ? ` − BEMA ${euro(z.bema)}` : ''}</span>}
                    </td>
                    <td className="r">
                      <input className="zahl-feld" type="number" min={0} step={1} value={p.anzahl} onChange={(e) => aendern(p.id, { anzahl: zahl(e.target.value) ?? 0 })} />
                    </td>
                    <td className="r">
                      {goz ? (
                        <input className="zahl-feld" type="number" min={1} max={3.5} step={0.1} value={p.faktor ?? einst.gozFaktor}
                          title="Steigerungsfaktor GOZ" onChange={(e) => aendern(p.id, { faktor: zahl(e.target.value) })} />
                      ) : (
                        <input className="zahl-feld" type="number" min={0} step={0.01} value={p.preis ?? ''} placeholder="Preis je"
                          onChange={(e) => aendern(p.id, { preis: zahl(e.target.value) })} />
                      )}
                    </td>
                    <td>
                      {p.art === 'M' ? (
                        <>
                          <select value={p.vergleich ?? ''} onChange={(e) => aendern(p.id, { vergleich: e.target.value || undefined })}>
                            <option value="">—</option>
                            {VERGLEICH.map((nr) => <option key={nr} value={nr}>{nr}</option>)}
                          </select>{' '}
                          <input className="zahl-feld" type="number" min={0} step={1} value={p.vergleichAnzahl ?? p.anzahl} title="Anzahl der BEMA-Vergleichsleistung"
                            onChange={(e) => aendern(p.id, { vergleichAnzahl: zahl(e.target.value) })} />
                        </>
                      ) : <span className="grau">—</span>}
                    </td>
                    <td className="r">
                      <input className="zahl-feld" type="number" min={0} step={0.01} value={p.material ?? ''} placeholder="0"
                        title="private Material- und Laborkosten je Einheit" onChange={(e) => aendern(p.id, { material: zahl(e.target.value) })} />
                    </td>
                    <td className="r">{z ? euro(z.anteil + z.material) : '—'}{z?.faktor ? <span className="analog-text">Faktor {faktorText(z.faktor)}</span> : null}</td>
                    <td><button className="x" title="Position entfernen" onClick={() => entfernen(p.id)}>×</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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

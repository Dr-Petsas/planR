import type { Ebene, HkpPlan, Labor, Position } from '../types'
import { useMemo, useState } from 'react'
import type { BerechnetePosition, Listen } from '../engine/berechnung'
import { belNrAnzeige, berechnen, laborVon } from '../engine/berechnung'
import { vorschlaege, type Vorschlag } from '../engine/suche'
import { mitDigital } from '../engine/digital'
import { standardBegruendung } from '../engine/begruendung'
import { lexikonEintrag, lexikonKurz, useLexikon } from '../engine/lexikon'
import { eingabeZahl, euro, neueId, zahlDe } from '../format'

interface Abschnitt {
  key: string
  ebene: Ebene
  /** undefined = Praxismaterial (nur MAT) bzw. nicht laborbezogen */
  labor?: Labor
  titel: string
  hinweis: string
}

const HONORAR: Abschnitt[] = [
  { key: 'BEMA', ebene: 'BEMA', titel: 'BEMA – Regelversorgung', hinweis: 'Punkte × ZE-Punktwert' },
  { key: 'GOZ', ebene: 'GOZ', titel: 'GOZ – gleich-/andersartige Versorgung', hinweis: 'Punkte × 5,62421 Cent × Faktor' },
]
const EIGEN: Abschnitt[] = [
  { key: 'eigen-BEL', ebene: 'BEL', labor: 'eigen', titel: 'Kasse – BEL II', hinweis: 'Höchstpreis Praxislabor × Regler' },
  { key: 'eigen-BEB', ebene: 'BEB', labor: 'eigen', titel: 'Privat – BEB', hinweis: 'BEB-Liste + Aufschlag' },
  { key: 'eigen-MAT', ebene: 'MAT', labor: 'eigen', titel: 'Legierungen / Rohlinge', hinweis: 'aus „Kronenmaterial“ (Mittelwerte, netto)' },
]
const FREMD: Abschnitt[] = [
  { key: 'fremd-BEL', ebene: 'BEL', labor: 'fremd', titel: 'Kasse – BEL II', hinweis: 'Labor-XML bzw. Höchstpreis Gewerbe' },
  { key: 'fremd-BEB', ebene: 'BEB', labor: 'fremd', titel: 'Privat – BEB / NBL', hinweis: 'Labor-XML bzw. BEB-Liste' },
  { key: 'fremd-MAT', ebene: 'MAT', labor: 'fremd', titel: 'Edelmetall / Material / Rabatt', hinweis: 'aus der Laborrechnung (netto)' },
]
const SONSTIGES: Abschnitt[] = [
  { key: 'MAT', ebene: 'MAT', titel: 'Praxismaterial / sonstige Kosten', hinweis: 'freie Eingabe (brutto)' },
]

function PositionSuche({ plan, listen, setPositionen }: Pick<Props, 'plan' | 'listen' | 'setPositionen'>) {
  const [q, setQ] = useState('')
  const [zahn, setZahn] = useState('')
  const [labor, setLabor] = useState<Labor | ''>('')
  const [aktiv, setAktiv] = useState(0)
  const [offen, setOffen] = useState(false)
  const liste = useMemo(() => vorschlaege(q, listen), [q, listen])

  const neu = (v: Vorschlag): Position[] => v.positionen.map((x) => ({
    id: neueId(), ebene: x.ebene, nr: x.nr, zahn, anzahl: x.anzahl ?? 1,
    ...(x.ebene === 'GOZ' ? { faktor: plan.einstellungen.gozFaktor } : {}),
    ...(x.labor ? { labor: x.labor } : labor && (x.ebene === 'BEL' || x.ebene === 'BEB') ? { labor } : {}),
  }))
  const preise = useMemo(() => {
    const kandidaten = liste.map((v) => neu(v).map((p, i) => ({ ...p, id: `${v.key}#${i}` })))
    const r = berechnen({ ...plan, positionen: kandidaten.flat() }, listen).positionen
    return new Map(r.map((p) => [p.id, p]))
  }, [liste, plan, listen, zahn, labor])

  const uebernehmen = (v: Vorschlag | undefined) => {
    if (!v) return
    setPositionen((ps) => [...ps, ...neu(v)])
    setQ('')
    setOffen(false)
  }

  return (
    <div className="pos-suche">
      <input className="pos-suche-zahn" value={zahn} placeholder="Zahn" title="Zahn bzw. Gebiet, z. B. 16, 14-16, OK" onChange={(e) => setZahn(e.target.value)} />
      <div className="pos-suche-feld">
        <input
          value={q}
          placeholder="Position hinzufügen: Kürzel (z. B. SKM), Nummer oder Leistung …"
          onChange={(e) => { setQ(e.target.value); setAktiv(0); setOffen(true) }}
          onFocus={() => setOffen(true)}
          onBlur={() => setTimeout(() => setOffen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setAktiv((a) => Math.min(a + 1, liste.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAktiv((a) => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter') { e.preventDefault(); uebernehmen(liste[aktiv]) }
            else if (e.key === 'Escape') setOffen(false)
          }}
        />
        {offen && q.trim() && (
          <ul className="pos-suche-liste">
            {liste.length === 0 && <li className="leer">Keine passende Position oder Kürzel</li>}
            {liste.map((v, i) => {
              const ps = v.positionen.map((_, j) => preise.get(`${v.key}#${j}`))
              const summe = ps.reduce((s, p) => s + (p?.betrag ?? 0), 0)
              return (
                <li
                  key={v.key}
                  className={`${v.art}${i === aktiv ? ' aktiv' : ''}`}
                  onMouseEnter={() => setAktiv(i)}
                  onMouseDown={(e) => { e.preventDefault(); uebernehmen(v) }}
                >
                  <div className="ps-kopf">
                    <b>{v.titel}</b>
                    <span className="ps-text">{v.text}</span>
                    <span className="ps-summe">{euro(summe)}</span>
                  </div>
                  {v.art === 'kuerzel' && (
                    <div className="ps-teile">
                      {ps.map((p, j) => p && (
                        <span key={j} className={`ps-teil ps-${p.ebene}`} title={p.bezeichnung}>
                          {p.ebene} {p.nr}{p.anzahl > 1 ? ` ×${p.anzahl}` : ''} <i>{p.bezeichnung}</i> {euro(p.betrag)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <select value={labor} title="Labor für BEL/BEB-Positionen" onChange={(e) => setLabor(e.target.value as Labor | '')}>
        <option value="">Labor: Standard</option>
        <option value="eigen">Eigenlabor</option>
        <option value="fremd">Fremdlabor</option>
      </select>
    </div>
  )
}

interface Props {
  plan: HkpPlan
  listen: Listen
  berechnet: BerechnetePosition[]
  setPositionen: (f: (p: Position[]) => Position[]) => void
  /** wählt eine vom Regler abgeleitete Zusatzleistung ab */
  zusatzAbwaehlen: (schluessel: string) => void
}

export function Positionen({ plan, listen, berechnet, setPositionen, zusatzAbwaehlen }: Props) {
  const lex = useLexikon()
  const lexikonText = (ebene: Ebene, nr: string) =>
    ebene === 'BEL' || ebene === 'BEB' ? lexikonKurz(lexikonEintrag(lex, ebene === 'BEL' ? 'bel' : 'beb', nr)) || undefined : undefined
  const aendern = (id: string, teil: Partial<Position>) =>
    setPositionen((ps) => ps.map((p) => (p.id === id ? { ...p, ...teil, auto: false } : p)))
  const entfernen = (id: string) => setPositionen((ps) => ps.filter((p) => p.id !== id))
  const hinzufuegen = (a: Abschnitt) =>
    setPositionen((ps) => [
      ...ps,
      {
        id: neueId(), ebene: a.ebene, nr: '', zahn: '', anzahl: 1,
        ...(a.labor ? { labor: a.labor } : {}),
        ...(a.ebene === 'GOZ' ? { faktor: plan.einstellungen.gozFaktor } : {}),
        ...(a.ebene === 'MAT' ? { preis: 0, text: '' } : {}),
      },
    ])
  /** Verschiebt eine Position ins andere Labor; ein Preis aus der Labor-XML gilt dort nicht. */
  const verschieben = (p: BerechnetePosition, ziel: Labor) =>
    setPositionen((ps) => ps.map((x) => (x.id === p.id ? { ...x, labor: ziel, ...(p.ausXml ? { preis: undefined, ausXml: false } : {}) } : x)))

  const optionen: Record<Ebene, { nr: string; text: string }[]> = {
    BEMA: listen.bema?.eintraege ?? [],
    GOZ: listen.goz?.eintraege ?? [],
    BEL: (listen.bel?.eintraege ?? []).map((e) => ({ nr: belNrAnzeige(e.nr), text: e.text })),
    BEB: [...mitDigital(listen.eigen).map((e) => ({ nr: e.nr, text: `Eigenlabor: ${e.text}` })), ...(listen.beb?.eintraege ?? [])],
    MAT: [],
  }

  const zeilenVon = (a: Abschnitt) =>
    berechnet.filter((p) => p.ebene === a.ebene && (a.ebene === 'BEMA' || a.ebene === 'GOZ' || laborVon(p, plan) === a.labor))
  const summeVon = (as: Abschnitt[]) => as.reduce((s, a) => s + zeilenVon(a).reduce((t, p) => t + p.betrag, 0), 0)

  const tabelle = (a: Abschnitt) => {
    const { ebene } = a
    const zeilen = zeilenVon(a)
    const summe = zeilen.reduce((s, p) => s + p.betrag, 0)
    const laborZeile = ebene === 'BEL' || ebene === 'BEB'
    return (
      <section key={a.key} className={`ebene ebene-${ebene}`}>
        <header>
          <h4>{a.titel}</h4>
          <span className="klein">{a.hinweis}</span>
          <button className="klein-btn" onClick={() => hinzufuegen(a)}>+ Position</button>
        </header>
        {zeilen.length > 0 && (
          <table className="tabelle">
            <thead>
              <tr>
                <th style={{ width: '9ch' }}>Zahn/Gebiet</th>
                <th style={{ width: '11ch' }}>Nr.</th>
                <th>Leistung</th>
                {ebene === 'BEMA' && <th className="r">Punkte</th>}
                {ebene === 'GOZ' && <th className="r" style={{ width: '7ch' }}>Faktor</th>}
                <th className="r" style={{ width: '6ch' }}>Anz.</th>
                <th className="r" style={{ width: '11ch' }}>Einzel</th>
                <th className="r" style={{ width: '11ch' }}>Betrag</th>
                <th style={{ width: laborZeile ? '6ch' : '3ch' }} />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((p) => [p.material ? (
                <tr key={p.id} className="zeile-material" title="Aus der Kronenmaterial-Wahl – Menge und Preis sind Mittelwerte; ändern unter „Kronenmaterial“">
                  <td>{p.zahn}</td>
                  <td>–</td>
                  <td><span className="leistungstext">{p.bezeichnung}<b className="badge-material">Material</b></span></td>
                  <td className="r">{zahlDe(p.anzahl)}</td>
                  <td className="r">{zahlDe(p.einzelpreis)}</td>
                  <td className="r">{euro(p.betrag)}</td>
                  <td />
                </tr>
              ) : p.zusatz ? (
                <tr key={p.id} className="zeile-zusatz" title={p.begruendung}>
                  <td>{p.zahn}</td>
                  <td>{p.nr}</td>
                  <td><span className="leistungstext">{p.bezeichnung}<b className="badge-zusatz">Zusatz</b></span></td>
                  <td className="r">{zahlDe(p.faktor ?? 0)}</td>
                  <td className="r">{zahlDe(p.anzahl)}</td>
                  <td className="r">{zahlDe(p.einzelpreis)}</td>
                  <td className="r">{euro(p.betrag)}</td>
                  <td className="aktionen">
                    <button className="x-btn" title="Zusatzleistung nicht ansetzen" onClick={() => zusatzAbwaehlen(`${p.nr}|${p.zahn}`)}>×</button>
                  </td>
                </tr>
              ) : (
                <tr
                  key={p.id}
                  className={p.fehler ? 'zeile-fehler' : p.fakultativ ? 'zeile-fakultativ' : p.ausXml ? 'zeile-xml' : p.auto ? 'zeile-auto' : ''}
                  title={p.fehler ?? (p.fakultativ ? 'Fakultativ (DPF-Vorschlag „?“) – nur übernehmen, wenn die Leistung erbracht wird' : p.ausXml ? 'Preis aus der Labor-XML' : lexikonText(ebene, p.nr))}
                >
                  <td><input value={p.zahn} onChange={(e) => aendern(p.id, { zahn: e.target.value })} /></td>
                  <td>
                    {ebene === 'MAT' ? '–' : (
                      <input
                        value={ebene === 'BEL' ? belNrAnzeige(p.nr) : p.nr}
                        list={`liste-${ebene}`}
                        onChange={(e) => aendern(p.id, { nr: ebene === 'BEL' ? e.target.value.replace(/\s/g, '') : e.target.value })}
                      />
                    )}
                  </td>
                  <td>
                    {ebene === 'MAT'
                      ? <input value={p.text ?? ''} placeholder="Bezeichnung" onChange={(e) => aendern(p.id, { text: e.target.value })} />
                      : (
                        <span className="leistungstext">
                          {p.bezeichnung || <em>unbekannt</em>}{p.ausXml && <b className="badge-xml">XML</b>}
                          {p.eigen && <b className="badge-eigen" title={p.eigen === p.nr ? 'Praxiseigene Laborposition' : `Preis und Text aus der Eigenlabor-Position ${p.eigen} (statt BEB ${p.nr})`}>Eigen {p.eigen}</b>}
                          {p.nachtraeglich && <b className="badge-nachtrag" title="Während der Behandlung angefallen">nachträglich</b>}
                        </span>
                      )}
                  </td>
                  {ebene === 'BEMA' && <td className="r">{p.punkte ?? ''}</td>}
                  {ebene === 'GOZ' && (
                    <td>
                      <input
                        key={`${p.id}-${p.faktor}`}
                        className={`r ${(p.faktor ?? 0) > 3.5 ? 'warn' : (p.faktor ?? 0) > 2.3 ? 'info' : ''}`}
                        defaultValue={zahlDe(p.faktor ?? plan.einstellungen.gozFaktor)}
                        onBlur={(e) => {
                          const f = eingabeZahl(e.target.value)
                          if (!Number.isNaN(f)) aendern(p.id, { faktor: f })
                        }}
                      />
                    </td>
                  )}
                  <td>
                    <input className="r" type="number" min={0} value={p.anzahl} onChange={(e) => aendern(p.id, { anzahl: Number(e.target.value) })} />
                  </td>
                  <td>
                    <input
                      className={`r ${p.preis !== undefined && ebene !== 'MAT' ? 'manuell' : ''}`}
                      key={`${p.id}-${p.einzelpreis}`}
                      defaultValue={zahlDe(p.einzelpreis)}
                      title={ebene === 'MAT' ? 'Preis' : `Leer lassen = Preis aus Preisliste${p.listenpreis !== undefined ? ` (${zahlDe(p.listenpreis)} €)` : ''}; Eingabe überschreibt die Liste für diese Position`}
                      onBlur={(e) => {
                        const t = e.target.value.trim()
                        if (!t && ebene !== 'MAT') return aendern(p.id, { preis: undefined })
                        const n = eingabeZahl(t)
                        if (!Number.isNaN(n) && n !== p.einzelpreis) aendern(p.id, { preis: n })
                      }}
                    />
                  </td>
                  <td className="r">{euro(p.betrag)}</td>
                  <td className="aktionen">
                    {laborZeile && (
                      <button
                        className="x-btn wechsel" onClick={() => verschieben(p, a.labor === 'eigen' ? 'fremd' : 'eigen')}
                        title={a.labor === 'eigen' ? 'Ins Fremdlabor verschieben' : 'Ins Eigenlabor verschieben'}
                      >{a.labor === 'eigen' ? '→F' : '→E'}</button>
                    )}
                    <button className="x-btn" title="Position entfernen" onClick={() => entfernen(p.id)}>×</button>
                  </td>
                </tr>
              ), p.faktorBegruendung && (
                <tr key={`${p.id}-begr`} className="faktor-begruendung">
                  <td colSpan={2} className="klein r">Begründung § 10 GOZ</td>
                  <td colSpan={6}>
                    {p.zusatz ? <span className="klein">{p.faktorBegruendung}</span> : (
                      <input
                        key={`${p.id}-${p.faktorBegruendung}`}
                        defaultValue={p.faktorBegruendung}
                        title="Standardtext nach GOZ-Nummer – patientenbezogen anpassen; leeren = Standardtext"
                        onBlur={(e) => {
                          const t = e.target.value.trim()
                          const neu = t && t !== standardBegruendung(p.nr) ? t : undefined
                          if (t !== p.faktorBegruendung) setPositionen((ps) => ps.map((x) => (x.id === p.id ? { ...x, faktorBegruendung: neu } : x)))
                        }}
                      />
                    )}
                  </td>
                </tr>
              )])}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={ebene === 'BEMA' || ebene === 'GOZ' ? 7 : 6} className="r">Summe {a.titel}</td>
                <td className="r"><strong>{euro(summe)}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    )
  }

  const fl = plan.fremdlabor
  const hatFremd = berechnet.some((p) => p.labor === 'fremd') || !!fl.import
  return (
    <div className="positionen">
      {Object.entries(optionen).map(([ebene, opts]) => (
        <datalist key={ebene} id={`liste-${ebene}`}>
          {opts.map((o) => <option key={o.nr} value={o.nr}>{o.text}</option>)}
        </datalist>
      ))}

      <PositionSuche plan={plan} listen={listen} setPositionen={setPositionen} />

      <div className="pos-gruppe pos-honorar">
        <h3 className="pos-titel">Zahnärztliches Honorar <span>{euro(summeVon(HONORAR))}</span></h3>
        {HONORAR.map(tabelle)}
      </div>

      <div className={`pos-labore ${hatFremd ? '' : 'einspaltig'}`}>
        <div className="pos-gruppe pos-eigen">
          <h3 className="pos-titel">Eigenlabor <small>Praxislabor</small> <span>{euro(summeVon(EIGEN))} netto</span></h3>
          {EIGEN.map(tabelle)}
        </div>
        {hatFremd && <div className="pos-gruppe pos-fremd">
          <h3 className="pos-titel">
            Fremdlabor <small>{fl.name || 'gewerblich'}{fl.import ? ` · Rechnung ${fl.import.rechnungsnummer}` : ' · vorläufig'}</small>
            <span>{euro(summeVon(FREMD))} netto</span>
          </h3>
          {FREMD.map(tabelle)}
        </div>}
      </div>

      <div className="pos-gruppe pos-sonstiges">
        {SONSTIGES.map(tabelle)}
      </div>
    </div>
  )
}

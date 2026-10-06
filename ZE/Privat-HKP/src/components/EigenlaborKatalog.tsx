import { useMemo, useRef, useState } from 'react'
import { jsonAnalysieren, uebernehmen, zeilenAnalysieren, type Analyse, type EigenPosition } from '../engine/eigenlabor'
import { dateiZeilen } from '../engine/eigenlabor-pdf'
import { DIGITAL, DIGITAL_KATALOG } from '../engine/digital'

interface Props {
  katalog: EigenPosition[]
  onChange: (katalog: EigenPosition[]) => void
  /** Leistungstext einer BEB-Nr. aus der aktiven Liste */
  bebText: (nr: string) => string | undefined
}

const preisDe = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const preisLesen = (s: string) => Number(s.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))

export function EigenlaborKatalog({ katalog, onChange, bebText }: Props) {
  const dateiRef = useRef<HTMLInputElement>(null)
  const [analyse, setAnalyse] = useState<(Analyse & { datei: string }) | null>(null)
  const [spalte, setSpalte] = useState(0)
  const [laedt, setLaedt] = useState(false)
  const [suche, setSuche] = useState('')

  async function dateiGewaehlt(f: File | undefined) {
    if (!f) return
    setLaedt(true)
    try {
      const a = f.name.toLowerCase().endsWith('.json') ? jsonAnalysieren(await f.text()) : zeilenAnalysieren(await dateiZeilen(f))
      setAnalyse({ ...a, datei: f.name })
      setSpalte(0)
    } catch (err) {
      setAnalyse({ kandidaten: [], preisSpalten: 0, warnungen: [`Datei konnte nicht gelesen werden: ${(err as Error).message}`], datei: f.name })
    } finally {
      setLaedt(false)
      if (dateiRef.current) dateiRef.current.value = ''
    }
  }

  const kandidatAendern = (i: number, teil: Partial<Analyse['kandidaten'][number]>) =>
    analyse && setAnalyse({ ...analyse, kandidaten: analyse.kandidaten.map((k, j) => (j === i ? { ...k, ...teil } : k)) })
  const aendern = (i: number, teil: Partial<EigenPosition>) => onChange(katalog.map((e, j) => (j === i ? { ...e, ...teil } : e)))

  const gewaehlt = analyse?.kandidaten.filter((k) => k.an).length ?? 0
  const doppelt = useMemo(() => {
    const zaehler = new Map<string, number>()
    for (const e of katalog) if (e.nr.trim()) zaehler.set(e.nr.trim(), (zaehler.get(e.nr.trim()) ?? 0) + 1)
    return new Set([...zaehler].filter(([, n]) => n > 1).map(([nr]) => nr))
  }, [katalog])
  const fehlendDigital = DIGITAL_KATALOG.filter((d) => !katalog.some((e) => e.nr.trim() === d.nr))
  const q = suche.trim().toLowerCase()
  const zeilen = katalog.map((e, i) => ({ e, i })).filter(({ e }) => !q || `${e.nr} ${e.text} ${e.ersetzt ?? ''}`.toLowerCase().includes(q))

  function exportieren() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ art: 'eigenlabor-positionen', stand: new Date().toISOString().slice(0, 10), positionen: katalog }, null, 1)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: 'eigenlabor-positionen.json' }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="eigenlabor-katalog">
      <header className="el-kopf">
        <div>
          <h3>Eigenlabor-Positionen der Praxis</h3>
          <p className="el-info">
            Eigene Arbeitsschritte mit eigenen Preisen (netto), die keine BEB-Position abdeckt. Sie gelten für Leistungen
            aus dem Eigenlabor und lassen sich wie BEB-Positionen hinzufügen. Gleiche Nummer wie eine BEB-Position oder ein Eintrag bei
            „statt BEB-Nr.“ ersetzt deren Preis und Text – auch bei automatisch geplanten Positionen, ohne BEB-Aufschlag.
            Rechtlicher Rahmen: § 9 GOZ (tatsächlich entstandene, angemessene Kosten); die Rechnung muss jede Leistung mit Bezeichnung und Preis ausweisen.
          </p>
        </div>
        <div className="el-aktionen">
          <input ref={dateiRef} type="file" hidden accept=".pdf,.csv,.txt,.json,application/pdf" onChange={(e) => dateiGewaehlt(e.target.files?.[0])} />
          <button className="el-primaer" disabled={laedt} onClick={() => dateiRef.current?.click()}>{laedt ? 'Lese Datei …' : '⬆ Preisliste hochladen (PDF/CSV)'}</button>
          <button onClick={() => onChange([...katalog, { nr: '', text: '', preis: 0 }])}>+ Position</button>
          <button disabled={!katalog.length} onClick={exportieren} title="Zum Übertragen in die andere App">⬇ Export</button>
        </div>
      </header>

      {analyse && (
        <div className="el-vorschau">
          <h4>Analyse von „{analyse.datei}“: {analyse.kandidaten.length} Positionen erkannt</h4>
          {analyse.warnungen.map((w) => <p key={w} className="el-warnung">{w}</p>)}
          {analyse.preisSpalten > 1 && (
            <p>
              Mehrere Beträge je Zeile gefunden – Preisspalte:{' '}
              {Array.from({ length: analyse.preisSpalten }, (_, i) => (
                <label key={i} className="el-spalte"><input type="radio" checked={spalte === i} onChange={() => setSpalte(i)} /> {i + 1}. Betrag</label>
              ))}
              <span className="el-klein"> (in der Regel netto)</span>
            </p>
          )}
          {analyse.kandidaten.length > 0 && (
            <div className="el-scroll">
              <table className="el-tabelle">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={gewaehlt === analyse.kandidaten.length} onChange={(e) => setAnalyse({ ...analyse, kandidaten: analyse.kandidaten.map((k) => ({ ...k, an: e.target.checked })) })} /></th>
                    <th>Nr.</th><th>Bezeichnung</th><th className="r">Preis €</th><th>im Katalog</th>
                  </tr>
                </thead>
                <tbody>
                  {analyse.kandidaten.map((k, i) => {
                    const preis = k.preise[Math.min(spalte, k.preise.length - 1)]
                    const vorhanden = k.nr && katalog.find((e) => e.nr === k.nr)
                    return (
                      <tr key={i} className={k.an ? '' : 'el-aus'} title={k.roh}>
                        <td><input type="checkbox" checked={k.an} onChange={(e) => kandidatAendern(i, { an: e.target.checked })} /></td>
                        <td><input className="el-nr" value={k.nr} placeholder="auto" onChange={(e) => kandidatAendern(i, { nr: e.target.value.trim() })} /></td>
                        <td><input className="el-text" value={k.text} onChange={(e) => kandidatAendern(i, { text: e.target.value })} /></td>
                        <td className="r">{preisDe(preis)}</td>
                        <td className="el-klein">{vorhanden ? `aktualisiert (bisher ${preisDe(vorhanden.preis)} €)` : 'neu'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="el-aktionen">
            <button className="el-primaer" disabled={!gewaehlt} onClick={() => { onChange(uebernehmen(katalog, analyse.kandidaten, spalte)); setAnalyse(null) }}>
              {gewaehlt} Position{gewaehlt === 1 ? '' : 'en'} übernehmen
            </button>
            <button onClick={() => setAnalyse(null)}>Abbrechen</button>
          </div>
        </div>
      )}

      {katalog.length === 0 ? (
        <p className="el-leer">Noch keine eigenen Positionen. Preisliste des Praxislabors als PDF hochladen oder Positionen einzeln anlegen.</p>
      ) : (
        <>
          {katalog.length > 8 && <input className="el-suche" placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />}
          <table className="el-tabelle">
            <thead><tr><th>Nr.</th><th>Bezeichnung</th><th className="r">Preis € (netto)</th><th>statt BEB-Nr.</th><th /></tr></thead>
            <tbody>
              {zeilen.map(({ e, i }) => {
                const ersetzt = e.ersetzt?.trim() ? bebText(e.ersetzt) : undefined
                const gleich = !e.ersetzt && /^\d{1,4}$/.test(e.nr.trim()) ? bebText(e.nr) : undefined
                return (
                  <tr key={i}>
                    <td><input className={`el-nr ${!e.nr.trim() || doppelt.has(e.nr.trim()) ? 'el-fehler' : ''}`} value={e.nr} title={doppelt.has(e.nr.trim()) ? 'Nummer doppelt vergeben' : undefined} onChange={(ev) => aendern(i, { nr: ev.target.value.trim() })} /></td>
                    <td><input className="el-text" value={e.text} placeholder="Bezeichnung" onChange={(ev) => aendern(i, { text: ev.target.value })} /></td>
                    <td className="r">
                      <input
                        className="el-preis r" key={`${i}-${e.preis}`} defaultValue={preisDe(e.preis)}
                        onBlur={(ev) => { const n = preisLesen(ev.target.value); if (Number.isFinite(n) && n >= 0 && n !== e.preis) aendern(i, { preis: n }) }}
                      />
                    </td>
                    <td>
                      <input className="el-nr" value={e.ersetzt ?? ''} placeholder="–" onChange={(ev) => aendern(i, { ersetzt: ev.target.value.trim() || undefined })} />
                      {e.ersetzt?.trim() && <span className={`el-klein ${ersetzt ? '' : 'el-fehler-text'}`}> {ersetzt ?? 'nicht in der BEB-Liste'}</span>}
                      {gleich && <span className="el-klein"> ersetzt BEB {e.nr}: {gleich}</span>}
                    </td>
                    <td><button className="el-x" title="Position löschen" onClick={() => onChange(katalog.filter((_, j) => j !== i))}>×</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      <div className="el-digital">
        <div className="el-kopf">
          <div>
            <h4>Digitaler Workflow nach Intraoralscan</h4>
            <p className="el-info">
              Bei Abformung per Intraoralscan werden diese Schritte automatisch eingeplant – statt Gips-/Sägemodell und Mittelwertartikulator.
              Aus der BEB kommen dazu gedruckte Modelle (0009), Druckstümpfe (0105) und bei Verblendung der Steckartikulator (0401).
              CAD-Konstruktion, Verbinder, Fräsen/Drucken sowie Sinter- und Kristallisationsbrand sind in den gefrästen Kronen-, Gerüst- und
              Brückengliedpositionen enthalten und werden nicht gesondert berechnet.
            </p>
          </div>
          {fehlendDigital.length > 0 && (
            <div className="el-aktionen">
              <button onClick={() => onChange([...katalog, ...fehlendDigital])} title="Positionen in den Katalog übernehmen, um Preise und Texte anzupassen">Preise anpassen</button>
            </div>
          )}
        </div>
        <table className="el-tabelle">
          <thead><tr><th>Nr.</th><th>Arbeitsschritt</th><th className="r">Preis € (netto)</th><th>Einsatz</th></tr></thead>
          <tbody>
            {DIGITAL_KATALOG.map((d) => {
              const eigen = katalog.find((e) => e.nr.trim() === d.nr)
              return (
                <tr key={d.nr}>
                  <td className="el-mono">{d.nr}</td>
                  <td>{eigen?.text || d.text}</td>
                  <td className="r">{preisDe(eigen?.preis ?? d.preis)}{!eigen && <span className="el-klein"> Standard</span>}</td>
                  <td className="el-klein">{d.nr === DIGITAL.anprobe ? 'bei Bedarf über die Suche' : 'automatisch'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

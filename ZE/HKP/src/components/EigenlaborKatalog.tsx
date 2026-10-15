import { useMemo, useRef, useState } from 'react'
import type { Preisliste } from '../types'
import { jsonAnalysieren, uebernehmen, zeilenAnalysieren, type Analyse, type EigenPosition } from '../engine/eigenlabor'
import { dateiZeilen } from '../engine/eigenlabor-pdf'
import { DIGITAL, DIGITAL_ERSETZT, DIGITAL_KATALOG } from '../engine/digital'
import { istRolle, katalogZuordnen, ROLLEN, schrittText, zuordnungText, zuordnungVorschlagen, type Rolle } from '../engine/zuordnung'
import { usePraxiskatalog } from '../store/praxiskatalog'
import { geloescht, Tonne, wiederEinfuegen } from '../rueckgaengig'

interface Props {
  katalog: EigenPosition[]
  onChange: (katalog: EigenPosition[]) => void
  /** Leistungstext einer BEB-Nr. aus der aktiven Liste */
  bebText: (nr: string) => string | undefined
  /** aktueller Stand für „Rückgängig“ nach dem Löschen */
  lesen: () => EigenPosition[]
  /** 'fremd' = Preisliste des gewerblichen Labors */
  art?: 'eigen' | 'fremd'
  /** Fremdlabor: eigene BEB-Preislisten, die übernommen werden können */
  bebListen?: Preisliste<'beb'>[]
}

const preisDe = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const preisLesen = (s: string) => Number(s.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))

type Filter = 'alle' | 'schritt' | 'material' | 'keine'
const ROLLEN_LISTE = Object.entries(ROLLEN) as [Rolle, (typeof ROLLEN)[Rolle]][]

/** Auswahl „Einsatz in der Planung“: Vorschlag, keiner, Leistungsschritt (BEB-Nr./D-Nr.) oder Materialrolle */
function Einsatz({ e, z, onChange }: { e: EigenPosition; z: EigenPosition; onChange: (teil: Partial<EigenPosition>) => void }) {
  const hand = e.zuordnung === 'hand'
  const wahl = !hand ? 'auto' : !e.fuer ? 'keine' : istRolle(e.fuer) ? e.fuer : 'nr'
  const vorschlag = useMemo(() => zuordnungVorschlagen(e), [e])
  const vorschlagText = vorschlag ? zuordnungText(vorschlag).replace(/^für /, '') : 'keiner'
  const schritt = wahl === 'nr' && e.fuer ? schrittText(e.fuer) : undefined
  function waehlen(w: string) {
    if (w === 'auto') onChange({ fuer: undefined, wenn: undefined, zuordnung: undefined })
    else if (w === 'keine') onChange({ fuer: '', wenn: undefined, zuordnung: 'hand' })
    else if (w === 'nr') onChange({ fuer: z.fuer && !istRolle(z.fuer) ? z.fuer : '', wenn: z.fuer && !istRolle(z.fuer) ? z.wenn : undefined, zuordnung: 'hand' })
    else onChange({ fuer: w, wenn: undefined, zuordnung: 'hand' })
  }
  return (
    <div className="el-einsatz">
      <div className="el-einsatz-zeile">
        <select value={wahl} onChange={(ev) => waehlen(ev.target.value)}>
          <option value="auto">Vorschlag: {vorschlagText.length > 60 ? `${vorschlagText.slice(0, 58)}…` : vorschlagText}</option>
          <option value="keine">nicht automatisch – nur über die Suche</option>
          <option value="nr">für Leistungsschritt (BEB-Nr.) …</option>
          <optgroup label="Material, das die Planung ansetzt">
            {ROLLEN_LISTE.map(([r, info]) => <option key={r} value={`MAT:${r}`}>{info.titel}</option>)}
          </optgroup>
        </select>
        {wahl === 'nr' && (
          <>
            <input className={`el-nr ${e.fuer && !schritt ? 'el-fehler' : ''}`} value={e.fuer ?? ''} placeholder="BEB-Nr." onChange={(ev) => onChange({ fuer: ev.target.value.trim() })} />
            <select value={e.wenn ?? ''} onChange={(ev) => onChange({ wenn: (ev.target.value || undefined) as EigenPosition['wenn'] })}>
              <option value="">immer</option>
              <option value="scan">nur bei Intraoralscan</option>
              <option value="abdruck">nur bei Abdruck</option>
            </select>
          </>
        )}
      </div>
      <span className={`el-einsatz-text${hand ? ' hand' : ''}${z.fuer ? '' : ' keine'}`}>
        {wahl === 'nr' && e.fuer && !schritt ? 'nicht in der BEB-Standardliste' : zuordnungText(z)}
        {hand ? ' · festgelegt' : z.fuer ? ' · Vorschlag' : ''}
      </span>
    </div>
  )
}

export function EigenlaborKatalog({ katalog, onChange, bebText, lesen, art = 'eigen', bebListen = [] }: Props) {
  const dateiRef = useRef<HTMLInputElement>(null)
  const [analyse, setAnalyse] = useState<(Analyse & { datei: string }) | null>(null)
  const [spalte, setSpalte] = useState(0)
  const [laedt, setLaedt] = useState(false)
  const [suche, setSuche] = useState('')
  const [filter, setFilter] = useState<Filter>('alle')
  const pvs = usePraxiskatalog()
  const fremd = art === 'fremd'
  const name = fremd ? 'Fremdlabor-Position' : 'Eigenlabor-Position'

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

  function listeUebernehmen(id: string) {
    const l = bebListen.find((x) => x.id === id)
    if (!l) return
    setAnalyse({
      datei: l.name, preisSpalten: 1, warnungen: [],
      kandidaten: l.eintraege.filter((x) => x.text && Number.isFinite(x.preis)).map((x) => ({ nr: x.nr, text: x.text, preise: [x.preis], roh: `${x.nr} ${x.text}`, an: true })),
    })
    setSpalte(0)
  }

  const kandidatAendern = (i: number, teil: Partial<Analyse['kandidaten'][number]>) =>
    analyse && setAnalyse({ ...analyse, kandidaten: analyse.kandidaten.map((k, j) => (j === i ? { ...k, ...teil } : k)) })
  const aendern = (i: number, teil: Partial<EigenPosition>) => onChange(katalog.map((e, j) => (j === i ? { ...e, ...teil } : e)))

  const zugeordnet = useMemo(() => katalogZuordnen(katalog), [katalog])
  const anzahl = useMemo(() => ({
    schritt: zugeordnet.filter((e) => e.fuer && !istRolle(e.fuer)).length,
    material: zugeordnet.filter((e) => istRolle(e.fuer)).length,
    keine: zugeordnet.filter((e) => !e.fuer).length,
    hand: zugeordnet.filter((e) => e.zuordnung === 'hand').length,
  }), [zugeordnet])
  const gewaehlt = analyse?.kandidaten.filter((k) => k.an).length ?? 0
  const doppelt = useMemo(() => {
    const zaehler = new Map<string, number>()
    for (const e of katalog) if (e.nr.trim()) zaehler.set(e.nr.trim(), (zaehler.get(e.nr.trim()) ?? 0) + 1)
    return new Set([...zaehler].filter(([, n]) => n > 1).map(([nr]) => nr))
  }, [katalog])
  const fehlendDigital = DIGITAL_KATALOG.filter((d) => !katalog.some((e) => e.nr.trim() === d.nr))
  const q = suche.trim().toLowerCase()
  const passt = (z: EigenPosition) => filter === 'alle' || (filter === 'keine' ? !z.fuer : filter === 'material' ? istRolle(z.fuer) : !!z.fuer && !istRolle(z.fuer))
  const zeilen = katalog.map((e, i) => ({ e, i, z: zugeordnet[i] }))
    .filter(({ e, z }) => passt(z) && (!q || `${e.nr} ${e.text} ${z.fuer ?? ''}`.toLowerCase().includes(q)))

  function exportieren() {
    const datei = fremd ? 'fremdlabor-positionen' : 'eigenlabor-positionen'
    const url = URL.createObjectURL(new Blob([JSON.stringify({ art: datei, stand: new Date().toISOString().slice(0, 10), positionen: katalog }, null, 1)], { type: 'application/json' }))
    Object.assign(document.createElement('a'), { href: url, download: `${datei}.json` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className={`eigenlabor-katalog${fremd ? ' fremd' : ''}`}>
      <header className="el-kopf">
        <div>
          <h3>{fremd ? 'Preisliste des Fremdlabors' : 'Eigenlabor-Positionen der Praxis'}</h3>
          {fremd ? (
            <p className="el-info">
              Positionen und Preise Ihres gewerblichen Labors (netto), mit seinen eigenen Nummern. PlanR ordnet jede Position einem
              Leistungsschritt der Planung zu (Spalte „Einsatz in der Planung“) und rechnet Fremdlabor-Leistungen damit, solange keine
              Laborrechnung (Labor-XML) eingelesen ist. Ohne passende Position gilt wie bisher die BEB-Liste bzw. der BEL-Höchstpreis.
            </p>
          ) : (
            <p className="el-info">
              Eigene Arbeitsschritte und Materialien mit eigenen Preisen (netto). PlanR ordnet jede Position einem Leistungsschritt der
              Planung zu – über die Nummer, wenn der Text dieselbe Leistung meint, sonst über den Text – und setzt sie bei automatisch
              geplanten Positionen statt der BEB-Position ein. Varianten wie „gefräst“ gelten nur nach Intraoralscan, „gegossen“ nur
              nach Abdruck; Material (Prothesenzähne, Abformmaterial, Registrat, Implantatteile, Rohlinge) setzt die Planung dort an,
              wo es anfällt. Jede Zuordnung lässt sich in der Spalte „Einsatz in der Planung“ ändern. Der Preis hier ist die Untergrenze;
              der Aufschlag-Regler (Eigenlabor, Privat) hebt ihn an.
              Rechtlicher Rahmen: § 9 GOZ (tatsächlich entstandene, angemessene Kosten); die Rechnung muss jede Leistung mit Bezeichnung und Preis ausweisen.
            </p>
          )}
          {!fremd && pvs && (
            <p className="el-info">
              Aus {pvs.pvs} übernommen ({pvs.listeName}, Stand {new Date(pvs.stand).toLocaleDateString('de-DE')}): {katalog.filter((e) => e.quelle === 'pvs').length} Positionen,
              dazu {pvs.goz} eigene GOZ-Positionen und {pvs.komplexe.length} Kürzel/Komplexe.
              {Object.keys(pvs.bel).length > 0 && <> Kasse: {Object.keys(pvs.bel).length} BEL-Preise{pvs.belListeName ? ` (${pvs.belListeName})` : ''} als unteres Ende des BEL-Reglers.</>}
              {' '}Abgleich in der PlanR-Übersicht unter Einstellungen; von Hand festgelegte Zuordnungen bleiben dabei erhalten.
            </p>
          )}
        </div>
        <div className="el-aktionen">
          <input ref={dateiRef} type="file" hidden accept=".pdf,.csv,.txt,.json,application/pdf" onChange={(e) => dateiGewaehlt(e.target.files?.[0])} />
          <button className="el-primaer" disabled={laedt} onClick={() => dateiRef.current?.click()}>{laedt ? 'Lese Datei …' : '⬆ Preisliste hochladen (PDF/CSV)'}</button>
          {fremd && bebListen.length > 0 && (
            <select value="" onChange={(ev) => listeUebernehmen(ev.target.value)} title="Eine schon unter „Preislisten“ importierte BEB-Liste des Labors übernehmen">
              <option value="">Aus Preisliste übernehmen …</option>
              {bebListen.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.eintraege.length})</option>)}
            </select>
          )}
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
        <p className="el-leer">
          {fremd
            ? 'Noch keine Preisliste des Fremdlabors. Als PDF/CSV hochladen oder eine unter „Preislisten“ importierte BEB-Liste übernehmen.'
            : 'Noch keine eigenen Positionen. Preisliste des Praxislabors als PDF hochladen oder Positionen einzeln anlegen.'}
        </p>
      ) : (
        <>
          <div className="el-uebersicht">
            <span>
              Einsatz in der Planung: <b>{anzahl.schritt + anzahl.material}</b> von {katalog.length} Positionen setzt PlanR automatisch ein
              ({anzahl.schritt} als Leistungsschritt, {anzahl.material} als Material), {anzahl.keine} nur über die Suche
              {anzahl.hand ? `; ${anzahl.hand} von Hand festgelegt` : ''}.
            </span>
            {(['alle', 'schritt', 'material', 'keine'] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? 'an' : ''} onClick={() => setFilter(f)}>
                {{ alle: 'alle', schritt: 'Leistungsschritte', material: 'Material', keine: 'ohne Zuordnung' }[f]}
              </button>
            ))}
          </div>
          {katalog.length > 8 && <input className="el-suche" placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />}
          <table className="el-tabelle">
            <thead><tr><th>Nr.</th><th>Bezeichnung</th><th className="r">Preis € (netto)</th><th>Einsatz in der Planung</th><th /></tr></thead>
            <tbody>
              {zeilen.map(({ e, i, z }) => {
                const gleich = /^\d{1,4}$/.test(e.nr.trim()) ? bebText(e.nr) : undefined
                return (
                  <tr key={i}>
                    <td>
                      <input className={`el-nr ${!e.nr.trim() || doppelt.has(e.nr.trim()) ? 'el-fehler' : ''}`} value={e.nr} title={doppelt.has(e.nr.trim()) ? 'Nummer doppelt vergeben' : undefined} onChange={(ev) => aendern(i, { nr: ev.target.value.trim() })} />
                      {e.quelle === 'pvs' && <span className="el-klein" title="Aus dem Praxisprogramm übernommen; der nächste Abgleich ersetzt Text und Preis."> {pvs?.pvs ?? 'PVS'}</span>}
                    </td>
                    <td>
                      <input className="el-text" value={e.text} placeholder="Bezeichnung" onChange={(ev) => aendern(i, { text: ev.target.value })} />
                      {gleich && z.fuer !== e.nr.trim().padStart(4, '0') && <span className="el-klein" title="Gleiche Nummer, andere Leistung in der BEB-Standardliste"> BEB {e.nr} dort: {gleich}</span>}
                    </td>
                    <td className="r">
                      <input
                        className="el-preis r" key={`${i}-${e.preis}`} defaultValue={preisDe(e.preis)}
                        onBlur={(ev) => { const n = preisLesen(ev.target.value); if (Number.isFinite(n) && n >= 0 && n !== e.preis) aendern(i, { preis: n }) }}
                      />
                    </td>
                    <td><Einsatz e={e} z={z} onChange={(teil) => aendern(i, teil)} /></td>
                    <td className="aktionen"><Tonne titel={`${name} ${e.nr} löschen`} onClick={() => {
                      onChange(katalog.filter((_, j) => j !== i))
                      geloescht(`${name} gelöscht: ${e.nr}${e.text ? ` – ${e.text.slice(0, 40)}` : ''}`, () =>
                        onChange(wiederEinfuegen(lesen(), e, i)))
                    }} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {!fremd && (
        <div className="el-digital">
          <div className="el-kopf">
            <div>
              <h4>Digitaler Workflow nach Intraoralscan</h4>
              <p className="el-info">
                Bei Abformung per Intraoralscan plant PlanR den digitalen Ablauf mit den BEB-Standardpositionen jeder BEB-Liste – statt
                Gips-/Sägemodell und Mittelwertartikulator: Oralscan aufbereiten (0007), gedruckte Modelle (0009), je Stumpf Präp freilegen (0013),
                Stumpf Digitaldruck (0017), Segment (0904) und Präpgrenze (0905), CAD-Auftragsdaten (0901), Registrierung (0902),
                Modellsegmentierung (0903), Konstruktion je Krone (0907), Kaufläche (0909), Brückenglied (0908) und Verbinder (0910),
                CAM-Nacharbeit (0911), bei Keramik Sintern (0032, nur Zirkon) und Glanz-/Kristallisationsbrand (0906), bei Verblendung der
                Steckartikulator (0401). Totalprothese (voll digital): digitale Kieferrelation (0902), CAD-Aufstellung (D106), gedruckte
                Anprobeprothese (D108), gefräste Basis (0037) und Einsetzen der Zähne (D107) statt Meistermodell, Mittelwertartikulator,
                Wachsaufstellung und Fertigstellung. Eigene Positionen für diese Schritte in der Spalte „Einsatz in der Planung“ zuordnen.
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
                const zugeordnetFuer = zugeordnet.find((e) => e.fuer === d.nr && e.nr.trim() !== d.nr)
                return (
                  <tr key={d.nr}>
                    <td className="el-mono">{d.nr}</td>
                    <td>{eigen?.text || d.text}</td>
                    <td className="r">
                      {preisDe(zugeordnetFuer?.preis ?? eigen?.preis ?? d.preis)}
                      {zugeordnetFuer ? <span className="el-klein"> Praxis {zugeordnetFuer.nr}</span> : !eigen && <span className="el-klein"> Standard</span>}
                    </td>
                    <td className="el-klein">
                      {DIGITAL_ERSETZT[d.nr] ? `nicht mehr automatisch – ersetzt durch ${DIGITAL_ERSETZT[d.nr]}`
                        : d.nr === DIGITAL.anprobe ? 'bei Bedarf über die Suche'
                          : ([DIGITAL.aufstellung, DIGITAL.einsetzen, DIGITAL.anprobeProthese] as string[]).includes(d.nr) ? 'automatisch (Totalprothese voll digital)'
                            : 'automatisch (Eigenlabor)'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

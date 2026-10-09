import { Fragment, useMemo, useRef, useState } from 'react'
import type { Einstellungen, EintragNachTyp, ListenTyp, Preisliste } from '../types'
import {
  STANDARD_LISTEN, TYP_NAMEN, getListen, listeLoeschen, listeSpeichern, listeZuruecksetzen, usePreislisten,
} from '../store/preislisten'
import { geloescht, Tonne, wiederEinfuegen } from '../rueckgaengig'
import { alsCsv, dateiImportieren, herunterladen, type ImportErgebnis } from '../store/import'
import { eingabeZahl, neueId, zahlDe } from '../format'
import { belNrAnzeige } from '../engine/berechnung'
import { lexikonEintrag, useLexikon } from '../engine/lexikon'
import { kzvNachNr } from '../data/kzv'

const AKTIV_FELD: Record<ListenTyp, keyof Einstellungen> = {
  bema: 'bemaListe', goz: 'gozListe', bel2: 'belListe', beb: 'bebListe', festzuschuss: 'fzListe',
}

type Spalte = { feld: string; titel: string; zahl?: boolean; breit?: boolean }
const SPALTEN: Record<ListenTyp, Spalte[]> = {
  bema: [{ feld: 'nr', titel: 'Nr.' }, { feld: 'text', titel: 'Leistung', breit: true }, { feld: 'punkte', titel: 'Punkte', zahl: true }],
  goz: [{ feld: 'nr', titel: 'Nr.' }, { feld: 'text', titel: 'Leistung', breit: true }, { feld: 'punkte', titel: 'Punkte', zahl: true }],
  bel2: [{ feld: 'nr', titel: 'BEL-Nr.' }, { feld: 'text', titel: 'Leistung', breit: true }, { feld: 'gewerbe', titel: 'Gewerbelabor €', zahl: true }, { feld: 'praxis', titel: 'Praxislabor €', zahl: true }],
  beb: [{ feld: 'nr', titel: 'BEB-Nr.' }, { feld: 'text', titel: 'Leistung', breit: true }, { feld: 'preis', titel: 'Preis €', zahl: true }],
  festzuschuss: [
    { feld: 'nr', titel: 'Befund' }, { feld: 'text', titel: 'Befundbeschreibung', breit: true },
    { feld: 'honorar', titel: 'Honorar', zahl: true }, { feld: 'mul', titel: 'MuL', zahl: true },
    { feld: 'betraege.60', titel: '60 %', zahl: true }, { feld: 'betraege.70', titel: '70 %', zahl: true },
    { feld: 'betraege.75', titel: '75 %', zahl: true }, { feld: 'betraege.100', titel: '100 %', zahl: true },
  ],
}

const lesen = (e: object, feld: string): unknown =>
  feld.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], e)

function schreiben<T extends object>(e: T, feld: string, wert: unknown): T {
  const [a, b] = feld.split('.')
  if (!b) return { ...e, [a]: wert }
  return { ...e, [a]: { ...(e as Record<string, Record<string, unknown>>)[a], [b]: wert } }
}

function leererEintrag(typ: ListenTyp): EintragNachTyp[ListenTyp] {
  switch (typ) {
    case 'bema': case 'goz': return { nr: '', text: '', punkte: 0 }
    case 'bel2': return { nr: '', text: '', gewerbe: 0, praxis: 0 }
    case 'beb': return { nr: '', text: '', preis: 0 }
    case 'festzuschuss': return { nr: '', text: '', honorar: 0, mul: 0, betraege: { '60': 0, '70': 0, '75': 0, '100': 0 } }
  }
}

interface Props {
  einstellungen: Einstellungen
  setAktiv: (feld: keyof Einstellungen, id: string) => void
  /** IDs der Listen, die der Plan gerade verwendet (fest gewählt oder automatisch) */
  verwendet: string[]
}

export function Preislisten({ einstellungen, setAktiv, verwendet }: Props) {
  const alle = usePreislisten()
  const [auswahl, setAuswahl] = useState(alle[0]?.id ?? '')
  const [suche, setSuche] = useState('')
  const [importDaten, setImportDaten] = useState<(ImportErgebnis & { datei: string }) | null>(null)
  const [prozent, setProzent] = useState('')
  const [offen, setOffen] = useState<number | null>(null)
  const lex = useLexikon()
  const dateiRef = useRef<HTMLInputElement>(null)

  const liste = alle.find((l) => l.id === auswahl) ?? alle[0]
  const spalten = liste ? SPALTEN[liste.typ] : []

  const gefiltert = useMemo(() => {
    if (!liste) return []
    const q = suche.trim().toLowerCase()
    return liste.eintraege
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !q || `${e.nr} ${e.text}`.toLowerCase().includes(q))
  }, [liste, suche])

  if (!liste) return <p>Keine Preislisten vorhanden.</p>

  const aktualisieren = (teil: Partial<Preisliste>) => listeSpeichern({ ...liste, ...teil } as Preisliste)
  const eintragAendern = (i: number, feld: string, wert: unknown) =>
    aktualisieren({ eintraege: liste.eintraege.map((e, j) => (j === i ? schreiben(feld === 'preis' ? { ...e, richtpreis: undefined } : e, feld, wert) : e)) as Preisliste['eintraege'] })

  const istAktiv = einstellungen[AKTIV_FELD[liste.typ]] === liste.id
  const kzv = liste.kzv ? kzvNachNr(liste.kzv) : undefined
  const istGeaendertStandard = liste.standard && liste.geaendertAm

  async function dateiGewaehlt(f: File | undefined) {
    if (!f) return
    try {
      const r = await dateiImportieren(liste.typ, f)
      setImportDaten({ ...r, datei: f.name })
    } catch (err) {
      setImportDaten({ eintraege: [], meta: {}, warnungen: [`Datei konnte nicht gelesen werden: ${(err as Error).message}`], datei: f.name })
    }
    if (dateiRef.current) dateiRef.current.value = ''
  }

  function importUebernehmen(modus: 'ersetzen' | 'neu') {
    if (!importDaten) return
    const meta = importDaten.meta
    const heute = new Date().toISOString().slice(0, 10)
    if (modus === 'ersetzen') {
      aktualisieren({
        eintraege: importDaten.eintraege as Preisliste['eintraege'],
        gueltigAb: meta.gueltigAb || liste.gueltigAb,
        kzv: meta.kzv ?? liste.kzv,
        punktwert: meta.punktwert ?? liste.punktwert,
        quelle: `Upload ${importDaten.datei} (${heute})`,
      })
    } else {
      const id = `${liste.typ}-${neueId().slice(0, 8)}`
      listeSpeichern({
        id, typ: liste.typ,
        name: meta.name || importDaten.datei.replace(/\.[^.]+$/, ''),
        gueltigAb: meta.gueltigAb || heute,
        kzv: meta.kzv,
        punktwert: meta.punktwert ?? liste.punktwert,
        quelle: `Upload ${importDaten.datei} (${heute})`,
        eintraege: importDaten.eintraege as Preisliste['eintraege'],
      })
      setAuswahl(id)
    }
    setImportDaten(null)
  }

  function preiseAnpassen() {
    const p = eingabeZahl(prozent)
    if (Number.isNaN(p)) return
    const f = 1 + p / 100
    const r = (n: number) => Math.round(n * f * 100) / 100
    const neu = liste.eintraege.map((e) => {
      const x = { ...e } as Record<string, unknown>
      if (liste.typ === 'bel2') { x.gewerbe = r(x.gewerbe as number); x.praxis = r(x.praxis as number) }
      if (liste.typ === 'beb') x.preis = r(x.preis as number)
      return x
    })
    aktualisieren({ eintraege: neu as unknown as Preisliste['eintraege'] })
    setProzent('')
  }

  const gruppen = (Object.keys(TYP_NAMEN) as ListenTyp[]).map((typ) => ({ typ, listen: alle.filter((l) => l.typ === typ) }))

  return (
    <div className="preislisten">
      <aside>
        {gruppen.map((g) => (
          <div key={g.typ} className="pl-gruppe">
            <h4>{TYP_NAMEN[g.typ]}</h4>
            {g.listen.map((l) => (
              <button key={l.id} className={`pl-eintrag ${l.id === liste.id ? 'aktiv' : ''}`} onClick={() => setAuswahl(l.id)}>
                <span>{l.name}</span>
                <span className="klein">
                  {l.eintraege.length} Pos. · ab {l.gueltigAb.split('-').reverse().join('.')}
                  {verwendet.includes(l.id) && <b className="badge">im Plan</b>}
                  {l.standard && l.geaendertAm && <b className="badge gelb">geändert</b>}
                  {!l.standard && <b className="badge blau">eigene</b>}
                </span>
              </button>
            ))}
            <button
              className="klein-btn"
              onClick={() => {
                const id = `${g.typ}-${neueId().slice(0, 8)}`
                const vorlage = STANDARD_LISTEN.find((s) => s.typ === g.typ)
                listeSpeichern({
                  id, typ: g.typ, name: `Neue ${TYP_NAMEN[g.typ]}-Liste`, gueltigAb: new Date().toISOString().slice(0, 10),
                  punktwert: vorlage?.punktwert, eintraege: [] as Preisliste['eintraege'],
                })
                setAuswahl(id)
              }}
            >+ neue Liste</button>
          </div>
        ))}
      </aside>

      <section className="pl-detail">
        <div className="pl-kopf">
          <label className="breit">Name<input value={liste.name} onChange={(e) => aktualisieren({ name: e.target.value })} /></label>
          <label>Gültig ab<input type="date" value={liste.gueltigAb} onChange={(e) => aktualisieren({ gueltigAb: e.target.value })} /></label>
          {(liste.typ === 'bema' || liste.typ === 'goz') && (
            <label>Punktwert (€)
              <input
                key={`${liste.id}-${liste.punktwert}`}
                defaultValue={zahlDe(liste.punktwert ?? 0)}
                onBlur={(e) => {
                  const n = eingabeZahl(e.target.value)
                  if (!Number.isNaN(n)) aktualisieren({ punktwert: n })
                }}
              />
            </label>
          )}
        </div>
        <p className="klein">
          {kzv && <>KZV-Bereich: <strong>{kzv.name}</strong> ({kzv.kurz}) · </>}
          Quelle: {liste.quelle?.startsWith('http') ? <a href={liste.quelle} target="_blank" rel="noreferrer">{liste.quelle}</a> : liste.quelle ?? '—'}
          {liste.hinweis && <><br /><strong>Hinweis:</strong> {liste.hinweis}</>}
        </p>

        <div className="pl-aktionen">
          <input
            ref={dateiRef} type="file" hidden
            accept=".csv,.txt,.json,.xlsx,.xls,.ods"
            onChange={(e) => dateiGewaehlt(e.target.files?.[0])}
          />
          <button className="primaer" onClick={() => dateiRef.current?.click()}>⬆ Aktualisierte Preisliste hochladen</button>
          <button onClick={() => herunterladen(`${liste.id}.csv`, alsCsv(liste))}>⬇ CSV</button>
          <button onClick={() => herunterladen(`${liste.id}.json`, JSON.stringify(liste, null, 1), 'application/json')}>⬇ JSON</button>
          {!istAktiv && <button onClick={() => setAktiv(AKTIV_FELD[liste.typ], liste.id)}>Im Plan verwenden</button>}
          {istGeaendertStandard && (
            <button onClick={() => {
              if (!confirm('Alle Änderungen an dieser Liste verwerfen und Originalstand wiederherstellen?')) return
              const alt = liste
              listeZuruecksetzen(liste.id)
              geloescht(`Änderungen an „${alt.name}“ verworfen`, () => listeSpeichern(alt))
            }}>
              Original wiederherstellen
            </button>
          )}
          {!liste.standard && (
            <button className="gefahr" onClick={() => {
              if (!confirm(`Liste „${liste.name}“ löschen?`)) return
              const alt = liste
              listeLoeschen(liste.id)
              setAuswahl(alle[0].id)
              geloescht(`Liste „${alt.name}“ gelöscht`, () => { listeSpeichern(alt); setAuswahl(alt.id) })
            }}>
              Liste löschen
            </button>
          )}
          {(liste.typ === 'bel2' || liste.typ === 'beb') && (
            <span className="inline">
              Alle Preise ändern um
              <input style={{ width: '6ch' }} value={prozent} placeholder="+4,78" onChange={(e) => setProzent(e.target.value)} />%
              <button onClick={preiseAnpassen} disabled={!prozent}>anwenden</button>
            </span>
          )}
        </div>

        {importDaten && (
          <div className="import-vorschau">
            <h4>Import aus „{importDaten.datei}“</h4>
            <p><strong>{importDaten.eintraege.length}</strong> Einträge erkannt.</p>
            {importDaten.warnungen.map((w) => <p key={w} className="hinweis warnung">{w}</p>)}
            {importDaten.eintraege.length > 0 && (
              <table className="tabelle">
                <thead><tr>{spalten.map((s) => <th key={s.feld}>{s.titel}</th>)}</tr></thead>
                <tbody>
                  {importDaten.eintraege.slice(0, 6).map((e, i) => (
                    <tr key={i}>{spalten.map((s) => <td key={s.feld} className={s.zahl ? 'r' : ''}>{s.zahl ? zahlDe(lesen(e, s.feld) as number) : String(lesen(e, s.feld) ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="pl-aktionen">
              <button className="primaer" disabled={!importDaten.eintraege.length} onClick={() => importUebernehmen('ersetzen')}>Diese Liste ersetzen</button>
              <button disabled={!importDaten.eintraege.length} onClick={() => importUebernehmen('neu')}>Als neue Liste anlegen</button>
              <button onClick={() => setImportDaten(null)}>Abbrechen</button>
            </div>
            <p className="klein">
              Unterstützt: CSV (Semikolon/Komma/Tab), Excel (.xlsx/.xls/.ods), JSON sowie das VDDS-Laborpreisformat der KZVen.
              Die erste Zeile muss Spaltennamen enthalten, z. B. <code>Nr;Text;Punkte</code>, <code>Nr;Text;Gewerbe;Praxis</code>, <code>Nr;Text;Preis</code> oder <code>Befund;Text;Honorar;MuL;60%;70%;75%;100%</code>.
            </p>
          </div>
        )}

        <div className="pl-tabellen-kopf">
          <input className="suche" placeholder="Suchen (Nummer oder Text) …" value={suche} onChange={(e) => setSuche(e.target.value)} />
          <span className="klein">{gefiltert.length} von {liste.eintraege.length}</span>
          <button className="klein-btn" onClick={() => aktualisieren({ eintraege: [leererEintrag(liste.typ), ...liste.eintraege] as Preisliste['eintraege'] })}>+ Zeile</button>
        </div>
        <div className="pl-tabelle-scroll">
          <table className="tabelle editierbar">
            <thead><tr>{spalten.map((s) => <th key={s.feld} className={s.zahl ? 'r' : ''}>{s.titel}</th>)}<th /></tr></thead>
            <tbody>
              {gefiltert.map(({ e, i }) => {
                const art = liste.typ === 'bel2' ? 'bel' : liste.typ === 'beb' ? 'beb' : null
                const info = art ? lexikonEintrag(lex, art, e.nr) : undefined
                return (
                <Fragment key={`${liste.id}-${i}`}>
                <tr>
                  {spalten.map((s) => (
                    <td key={s.feld} className={s.breit ? 'breit' : ''}>
                      {s.zahl ? (
                        <input
                          className="r"
                          key={`${liste.id}-${i}-${s.feld}-${lesen(e, s.feld)}`}
                          defaultValue={zahlDe(lesen(e, s.feld) as number)}
                          onBlur={(ev) => {
                            const n = eingabeZahl(ev.target.value)
                            if (!Number.isNaN(n) && n !== lesen(e, s.feld)) eintragAendern(i, s.feld, n)
                          }}
                        />
                      ) : (
                        <input
                          value={s.feld === 'nr' && liste.typ === 'bel2' ? belNrAnzeige(String(lesen(e, s.feld))) : String(lesen(e, s.feld) ?? '')}
                          onChange={(ev) => eintragAendern(i, s.feld, s.feld === 'nr' && liste.typ === 'bel2' ? ev.target.value.replace(/\s/g, '') : ev.target.value)}
                        />
                      )}
                      {s.feld === 'preis' && 'richtpreis' in e && e.richtpreis && (
                        <b className="badge gelb" title="Standardposition mit Richtpreis – Preis prüfen und eintragen">Richtpreis</b>
                      )}
                    </td>
                  ))}
                  <td className="nowrap">
                    {info && (
                      <button className={`info-btn ${offen === i ? 'aktiv' : ''}`} title="Erläuterung anzeigen" onClick={() => setOffen(offen === i ? null : i)}>i</button>
                    )}
                    <Tonne titel={`Zeile ${e.nr || i + 1} löschen`} onClick={() => {
                      const id = liste.id
                      aktualisieren({ eintraege: liste.eintraege.filter((_, j) => j !== i) as Preisliste['eintraege'] })
                      geloescht(`Zeile gelöscht: ${e.nr || '(ohne Nr.)'}${'text' in e && e.text ? ` – ${String(e.text).slice(0, 40)}` : ''}`, () => {
                        const jetzt = getListen().find((l) => l.id === id)
                        if (jetzt) listeSpeichern({ ...jetzt, eintraege: wiederEinfuegen(jetzt.eintraege as typeof e[], e, i) } as Preisliste)
                      })
                    }} />
                  </td>
                </tr>
                {info && offen === i && (
                  <tr className="lexikon-zeile">
                    <td colSpan={spalten.length + 1}>
                      <strong>{info.titel}</strong>
                      {info.beschreibung && <p>{info.beschreibung}</p>}
                      {info.voraussetzungen && <p><em>Voraussetzungen:</em> {info.voraussetzungen}</p>}
                      {info.begriffe && info.begriffe.length > 0 && (
                        <ul>{info.begriffe.map((b) => <li key={b}>{b}</li>)}</ul>
                      )}
                      <p className="klein">
                        Quelle: <a href={info.url} target="_blank" rel="noreferrer">2te-zahnarztmeinung.de</a> – allgemeine Patienteninformation,
                        keine verbindliche Abrechnungsbestimmung; dort genannte Preise sind nicht aktuell.
                      </p>
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
